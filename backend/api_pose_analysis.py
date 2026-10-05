"""
api_pose_analysis.py — 影片上傳 + AI 姿勢/動作分析 (Pose Analysis) 路由
（Phase 1 從 main.py 抽出，行為不變；本檔為 app 的核心分析功能）

對應前綴：/upload/expert、/upload/expert/add、/upload/user、
          /api/multi-exercise/*、/api/analyze_set
內含：背景分析任務狀態 _ANALYSIS_JOBS + _job_* helpers + _perform_multi_exercise_analysis。
依賴：core.analysis、core.multi_exercise、core.workout_history、numpy、mediapipe(透過 core.analysis)
"""
import os
import json
from core.json_cache import save_json_atomic
import shutil
import base64
import threading
import time
import uuid
import logging
from datetime import datetime

import numpy as np

from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException, BackgroundTasks, Body
from rate_limit import limiter
from fastapi.responses import JSONResponse, FileResponse

from core.analysis import (
    extract_features, apply_smoothing, segment_repetitions,
    create_golden_template, resample_to_length, calculate_efficiency_score_custom,
    generate_ar_overlay, generate_ar_overlay_all_reps, generate_ar_overlay_from_landmarks,
    METRIC_LABELS, TIPS_DATABASE
)
import core.multi_exercise as multi_exercise
import core.metrology as metrology
import core.measurement_overlay as measurement_overlay
import core.workout_history as workout_history

logger = logging.getLogger(__name__)

# 與 main.py 一致：DATA_DIR 指向專案根層 data/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
RESULTS_DIR = os.path.join(DATA_DIR, "results")
TEMPLATE_PATH = os.path.join(DATA_DIR, "template.npz")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

router = APIRouter(tags=["pose-analysis"])


# ── 以下 helper 由 main.py 一併搬入（僅 pose 分析使用）──────────────
def get_request_user_id(request: Request, form_user_id: str = None) -> str:
    """解析最佳可用 user_id：JWT(middleware 注入) > form/query > guest hash。"""
    jwt_uid = getattr(request.state, "user_id", None)
    if jwt_uid:
        return jwt_uid
    INVALID = {"user_123", "user1", "", "undefined", "null", None}
    if form_user_id not in INVALID:
        return form_user_id
    import hashlib
    ip = (request.client.host if request.client else "unknown").encode()
    return "guest_" + hashlib.md5(ip).hexdigest()[:12]


# 【上架前稽核】上傳檔名是客戶端可控的字串，直接拼進路徑會被 "../" 或 "/" 玩壞
#   （最輕是 500，最糟是寫到 uploads 以外）。一律只取 basename、只留安全字元。
_SAFE_NAME_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")


def _safe_upload_name(filename, default="video.mp4"):
    base = os.path.basename(str(filename or "").replace("\\", "/")) or default
    clean = "".join(c for c in base if c in _SAFE_NAME_CHARS)
    if clean.startswith("."):
        clean = "video" + clean      # 「影片.MOV」只剩 ".MOV" → 保留副檔名，解碼與清理都靠它
    return (clean or default)[-80:]


# 影片類型白名單：副檔名或 content-type 其中一個像影片就收（iOS 相簿有時沒有副檔名）
_VIDEO_UPLOAD_EXTS = ('.mov', '.mp4', '.m4v', '.avi', '.mkv', '.webm', '.3gp', '.qt', '.hevc')


def _is_video_upload(file) -> bool:
    ctype = (getattr(file, "content_type", None) or "").lower()
    name = (getattr(file, "filename", None) or "").lower()
    if ctype.startswith("video/"):
        return True
    if name.endswith(_VIDEO_UPLOAD_EXTS):
        return True
    # 沒有任何型別資訊（application/octet-stream / 空字串）時不擋，交給解碼器判斷
    return ctype in ("", "application/octet-stream") and "." not in os.path.basename(name)


def _not_video_response():
    return JSONResponse(status_code=400, content={
        "error": "not_video",
        "message": "這不是影片檔。請選擇 MP4 或 MOV 格式的影片。"})


def _require_login(request):
    """建模／校準會覆寫「所有人共用」的評分基準 —— 至少要是登入（含訪客 token）的請求。
    回傳 None 表示通過；否則回傳 401 回應。request 為 None 代表是內部呼叫（已在外層驗過）。"""
    if request is None:
        return None
    try:
        uid = request.state.user_id
    except AttributeError:
        # 沒有掛 JWT middleware（本機 research_server.py 研究工具）→ 不擋。
        #   正式後端 main.py 的 inject_user_id 每個請求都會設定 user_id（可能是 None）。
        return None
    if uid:
        return None
    return JSONResponse(status_code=401, content={
        "error": "auth_required", "message": "請先登入再建立模板。"},
        headers={"WWW-Authenticate": "Bearer"})


# 單支受測影片的長度上限（秒）。App 內錄影最長 90 秒；超過 5 分鐘的影片
#   分析要跑十幾分鐘、而且 5 下就夠評分，直接請使用者裁短。
_MAX_ANALYZE_SEC = 300


def _video_too_long(path):
    """回傳影片秒數（超過上限時），否則 None。讀不到資訊就不擋。"""
    try:
        import cv2
        cap = cv2.VideoCapture(path)
        try:
            n = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
            fps = cap.get(cv2.CAP_PROP_FPS) or 0
        finally:
            cap.release()
        if fps > 0 and n > 0:
            sec = n / fps
            if sec > _MAX_ANALYZE_SEC:
                return sec
    except Exception:
        pass
    return None


class _AnalysisCancelled(Exception):
    """使用者按了取消 —— 由進度回呼丟出，中止背景分析（不寫歷史、不計次數）。"""


def _build_metric_feedback(label, tip, score):
    """依單一指標分數產生分級回饋（優秀/良好/待加強/需修正）。"""
    sc = float(score)
    title = tip[0]
    problem = tip[1]
    fix = tip[2]
    if sc >= 85:
        return {"rep": 0, "type": "success", "title": title,
                "desc": "這個指標表現優異，動作軌跡與教練示範高度吻合。",
                "fix": "維持目前的動作品質即可。", "score": sc, "level": "excellent"}
    if sc >= 70:
        return {"rep": 0, "type": "success", "title": title,
                "desc": "整體掌握良好，動作大致到位，僅有些微可優化空間。",
                "fix": "持續對照教練示範曲線，讓動作更穩定一致。", "score": sc, "level": "good"}
    if sc >= 55:
        return {"rep": 0, "type": "warning", "title": title,
                "desc": problem, "fix": fix, "score": sc, "level": "fair"}
    return {"rep": 0, "type": "error", "title": title,
            "desc": problem, "fix": f"優先改善這個項目：{fix}", "score": sc, "level": "needs_work"}


def build_motion_record(exercise_key, exercise_name, overall_score, radar_data,
                        reps_count, charts_data, feedback,
                        ar_url=None, duration_seconds=0, rep_segments=None,
                        scored_metrics=None, occluded_metrics=None,
                        detectable=None, undetectable=None, pose_gate=None,
                        score_void=False, score_void_reason=None):
    """組裝一筆動作偵測歷史紀錄（欄位對齊前端 ResultViewMobile）。

    ── 【v9.3】把三道關卡的判定也存進去 ──────────────────────────
    舊版只存 overall_score + metrics。從歷史點回來時，前端拿不到
    scoredMetrics / occludedMetrics，只好當成「一個指標都沒通過關卡」，
    於是出現「93 分」與「沒有任何指標通過三道關卡」同時顯示的矛盾。
    分數的意義本來就綁在「哪些指標有計分」上，兩者必須一起存。
    """
    now = datetime.now()
    return {
        "session_id": f"motion_{now.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}",
        "timestamp": now.isoformat(),
        "type": "motion_analysis",
        "exerciseKey": exercise_key,
        "exerciseName": exercise_name,
        # 【v7.2】overall_score 可能是 None（有效權重過低 → 不給分）。
        #   舊寫法 int(round(None)) 會拋 TypeError，整支影片直接分析失敗。
        "overall_score": (None if overall_score is None else int(round(overall_score))),
        "metrics": {item["subject"]: item["A"] for item in (radar_data or [])},
        "reps_count": int(reps_count or 0),
        "duration_seconds": int(duration_seconds or 0),
        "chartsData": charts_data or [],
        "feedback": feedback or [],
        "arVideoUrl": ar_url,
        "repSegments": rep_segments or [],
        # 【v9.3】關卡判定 —— 沒有這些欄位，分數在歷史頁就失去意義
        "scoredMetrics": list(scored_metrics or []),
        "occludedMetrics": list(occluded_metrics or []),
        "detectableErrors": detectable or [],
        "undetectableErrors": undetectable or [],
        "poseGate": pose_gate,
        "scoreVoid": bool(score_void),
        "scoreVoidReason": score_void_reason,
    }


def append_motion_session(user_id, record):
    """把動作偵測分析結果寫入該使用者的歷史。回傳是否成功。
    Phase 2：統一存進 DB（per-user 的 workout_sessions 表），取代直接寫 JSON 檔。"""
    try:
        from repositories import workout_session_repo
        workout_session_repo.add_session(user_id, record)
        logger.info(f"[motion-history] 已寫入 {user_id}: {record.get('session_id')}")
        return True
    except Exception as e:
        logger.warning(f"[motion-history] 寫入失敗（非致命）: {e}")
        return False


@router.post("/upload/expert")
def upload_expert(request: Request, files: list[UploadFile] = File(...)):
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    print(f"--- Received {len(files)} Expert Videos ---")
    # 1. Save Files
    video_paths = []
    for file in files:
        path = os.path.join(UPLOAD_DIR, f"expert_{uuid.uuid4()}_{_safe_upload_name(file.filename)}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        video_paths.append(path)
    
    # 2. Process Videos
    all_reps = []
    for vid_path in video_paths:
        try:
            # Use relaxed thresholds (similar to Side View mode) to be safer
            # For expert videos, we assume a general view and use slightly relaxed thresholds
            # 3. Extract Features with adaptive thresholds
            # Side view: lower elbow threshold (0.35), Front view: standard (0.4)
            # For expert, we'll use the more relaxed side-view like thresholds to ensure more data is captured
            body_thresh = 0.5
            elbow_thresh = 0.35 # Using the more relaxed threshold for expert videos
            feats, confs, fps, _ = extract_features(vid_path, body_visibility_threshold=body_thresh, elbow_visibility_threshold=elbow_thresh)
            feats_smooth = apply_smoothing(feats, fps)
            reps = segment_repetitions(feats_smooth, fps)
            for r in reps:
                # Store phase data as list for simplicity in this temp list
                all_reps.append(r)
        except Exception as e:
            print(f"Error processing {vid_path}: {e}")
            continue
            
    # 3. Create Template
    if not all_reps:
        return JSONResponse(status_code=400, content={"error": "No valid repetitions found in expert videos."})
        
    template, con_len, ecc_len = create_golden_template(all_reps)
    
    # 4. Save Template AND all expert reps for future incremental updates
    # Convert rep_info dicts to saveable format (numpy arrays)
    all_reps_serializable = []
    for r in all_reps:
        all_reps_serializable.append({
            'phase1': r['phase1'],
            'phase2': r['phase2'],
            'start_frame': r['start_frame'],
            'valley_frame': r['valley_frame'],
            'end_frame': r['end_frame']
        })
    
    np.savez(TEMPLATE_PATH, 
             template=template, 
             con_len=con_len, 
             ecc_len=ecc_len,
             all_expert_reps=np.array(all_reps_serializable, dtype=object))  # Save for incremental updates
    
    return {"status": "success", "message": "Golden Template Created", "reps_used": len(all_reps)}

@router.post("/upload/expert/add")
def add_expert_videos(request: Request, files: list[UploadFile] = File(...)):
    """Incrementally add expert videos to existing template (re-run DBA with all reps)"""
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    if not os.path.exists(TEMPLATE_PATH):
        return JSONResponse(status_code=400, content={"error": "No existing template. Use /upload/expert first."})
    
    print(f"--- Adding {len(files)} Expert Videos to Existing Template ---")
    
    # 1. Load existing expert reps
    data = np.load(TEMPLATE_PATH, allow_pickle=True)
    existing_reps_serializable = data['all_expert_reps'].tolist()
    
    # Convert back to rep_info format
    existing_reps = []
    for r in existing_reps_serializable:
        existing_reps.append({
            'phase1': r['phase1'],
            'phase2': r['phase2'],
            'start_frame': r['start_frame'],
            'valley_frame': r['valley_frame'],
            'end_frame': r['end_frame']
        })
    
    print(f"Loaded {len(existing_reps)} existing reps from template")
    
    # 2. Process new videos
    video_paths = []
    for file in files:
        path = os.path.join(UPLOAD_DIR, f"expert_{uuid.uuid4()}_{_safe_upload_name(file.filename)}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        video_paths.append(path)
    
    new_reps = []
    for vid_path in video_paths:
        try:
            body_thresh = 0.5
            elbow_thresh = 0.35
            feats, confs, fps, _ = extract_features(vid_path, body_visibility_threshold=body_thresh, elbow_visibility_threshold=elbow_thresh)
            feats_smooth = apply_smoothing(feats, fps)
            reps = segment_repetitions(feats_smooth, fps)
            for r in reps:
                new_reps.append(r)
        except Exception as e:
            print(f"Error processing {vid_path}: {e}")
            continue
    
    if not new_reps:
        return JSONResponse(status_code=400, content={"error": "No valid repetitions in new videos."})
    
    print(f"Extracted {len(new_reps)} new reps from uploaded videos")
    
    # 3. Merge old and new reps
    all_reps = existing_reps + new_reps
    print(f"Total reps for DBA: {len(all_reps)}")
    
    # 4. Re-create template with all reps (DBA fusion)
    template, con_len, ecc_len = create_golden_template(all_reps)
    
    # 5. Save updated template
    all_reps_serializable = []
    for r in all_reps:
        all_reps_serializable.append({
            'phase1': r['phase1'],
            'phase2': r['phase2'],
            'start_frame': r['start_frame'],
            'valley_frame': r['valley_frame'],
            'end_frame': r['end_frame']
        })
    
    np.savez(TEMPLATE_PATH, 
             template=template, 
             con_len=con_len, 
             ecc_len=ecc_len,
             all_expert_reps=np.array(all_reps_serializable, dtype=object))
    
    return {
        "status": "success", 
        "message": "Template Updated with New Expert Videos", 
        "new_reps": len(new_reps),
        "total_reps": len(all_reps)
    }


@router.post("/upload/user")
@limiter.limit("12/hour")   # 🔴 資安稽核 A-1：每支請求都跑 MediaPipe 逐幀分析，不限流等於開放 CPU/磁碟耗盡攻擊
def upload_user(request: Request, file: UploadFile = File(...), is_side_view: bool = Form(False), user_id: str = Form(None)):
    """Upload user video with optional side view mode"""
    try:
        # 0. Check Template
        if not os.path.exists(TEMPLATE_PATH):
            logger.error("Template not found at %s", TEMPLATE_PATH)
            return JSONResponse(status_code=400, content={"error": "No Expert Template found. Please upload expert video first."})
            
        # 1. Save File
        file_id = str(uuid.uuid4())
        vid_path = os.path.join(UPLOAD_DIR, f"user_{file_id}_{_safe_upload_name(file.filename)}")
        logger.info(f"DEBUG: Starting upload_user for {file.filename}, side_view={is_side_view}")
        
        with open(vid_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"DEBUG: File saved to {vid_path}")
            
        # 2. Load Template
        logger.info("Loading template...")
        data = np.load(TEMPLATE_PATH)
        template = data['template']
        con_len = int(data['con_len'])
        ecc_len = int(data['ecc_len'])
        
        # 3. Extract Features with adaptive thresholds
        body_thresh = 0.5
        elbow_thresh = 0.35 if is_side_view else 0.4
        logger.info(f"[Side View Mode: {is_side_view}] Using thresholds: body={body_thresh}, elbow={elbow_thresh}")
        logger.info(f"DEBUG: Starting extract_features on {vid_path}...")
        
        feats, confs, fps, user_landmarks = extract_features(vid_path, body_visibility_threshold=body_thresh, elbow_visibility_threshold=elbow_thresh)
        logger.info(f"DEBUG: extract_features completed. Feats shape: {np.shape(feats)}")
        
        feats_smooth = apply_smoothing(feats, fps)
        reps = segment_repetitions(feats_smooth, fps)
        
        if not reps:
            logger.warning("No repetitions detected.")
            return JSONResponse(status_code=400, content={"error": "No repetitions detected in user video."})
            
        # 4. Compare
        summary_scores = []
        feedback_list = []
        chart_data_per_rep = []
        
        normalized_reps_for_ar = [] # Store for AR if needed
        
        for i, r in enumerate(reps):
            # Resample
            p1 = resample_to_length(r['phase1'], con_len)
            p2 = resample_to_length(r['phase2'], ecc_len)
            user_rep = np.vstack((p1, p2))
            normalized_reps_for_ar.append(user_rep)
            
            # Score (pass is_side_view parameter)
            score, sub_scores = calculate_efficiency_score_custom(user_rep, template, is_side_view=is_side_view)
            summary_scores.append(score)
            
            # Generate Chart Data (Sample for frontend)
            chart_data = {}
            for m_idx, metric in enumerate(METRIC_LABELS):
                user_curve = user_rep[:, m_idx]
                expert_curve = template[:, m_idx]
                
                # Downsample to 100 points
                x_orig = np.linspace(0, 100, len(user_curve))
                x_tgt = np.linspace(0, 100, 100)
                
                # Handle NaNs in downsampling
                user_clean = multi_exercise.fill_nan_numpy(user_curve[:, None])[:, 0]
                expert_clean = multi_exercise.fill_nan_numpy(expert_curve[:, None])[:, 0]
                
                f_u = np.interp(x_tgt, x_orig, user_clean)
                f_e = np.interp(x_tgt, x_orig, expert_clean)
                
                chart_points = []
                for j in range(100):
                    chart_points.append({
                        "frame": int(x_tgt[j]),
                        "user": float(f_u[j]),
                        "expert": float(f_e[j])
                    })
                chart_data[metric] = chart_points
            
            chart_data_per_rep.append(chart_data)

            # OLD Per-Rep Feedback removed to avoid duplicates.
            # Feedback is now generated based on AGGREGATED scores below.

        # 5. Aggregate Results
        # 【v7.2】舊路徑（calculate_efficiency_score_custom）不會回 None，
        #   但若某 rep 算出 NaN，np.mean 會整體變 NaN → 下游 int() 直接炸。
        #   用 nanmean + 保底 0，讓這條路徑永遠給得出一個整數。
        overall_score = float(np.nanmean(summary_scores)) if len(summary_scores) else 0.0
        if not np.isfinite(overall_score):
            overall_score = 0.0
        
        # Prepare Radar Data & Feedback (Average of all reps)
        # Recalculate component scores from all reps
        all_comp_scores = [calculate_efficiency_score_custom(nr, template)[1] for nr in normalized_reps_for_ar]
        avg_sub_scores = np.mean(all_comp_scores, axis=0)
        
        radar_data = []
        metric_scores_list = []
        
        for idx, label in enumerate(METRIC_LABELS):
           score_val = float(avg_sub_scores[idx])
           radar_data.append({
               "subject": label,
               "A": score_val,
               "fullMark": 100
           })
           metric_scores_list.append((label, score_val))
           
        # Generate Aggregated Feedback (All 7 metrics, sorted by score)
        metric_scores_list.sort(key=lambda x: x[1]) # Ascending (worst first)
        
        for label, score in metric_scores_list:
            # Always include all metrics
            if label in TIPS_DATABASE:
                tip = TIPS_DATABASE[label]
                
                if score >= 70:
                    # Positive Feedback
                    feedback_list.append({
                        "rep": 0,
                        "type": "success",
                        "title": tip[0], # Keep standard title
                        "desc": "Great job! You maintained good form in this area.",
                        "fix": "Keep maintaining this consistency.",
                        "score": score
                    })
                else:
                    # Negative / Correction Feedback
                    feedback_list.append({
                        "rep": 0, 
                        "type": "error",
                        "title": tip[0],
                        "desc": tip[1],
                        "fix": tip[2],
                        "score": score
                    })

        # 6. Generate AR Video (Skipped as per user request to save space)
        ar_filename = None
        try:
            if os.path.exists(vid_path):
                os.remove(vid_path)
                logger.info(f"Deleted original video to save space: {vid_path}")
        except Exception as e:
            logger.warning(f"Failed to delete video: {e}")
        
        # 7. SAVE TO HISTORY (CRITICAL FIX)
        # Ensure we have a valid user_id
        user_id = get_request_user_id(request, user_id)
        
        analysis_result = {
            "overallScore": int(overall_score),
            "metrics": radar_data,
            "chartsData": chart_data_per_rep,
            "concentricFrames": int((con_len / (con_len + ecc_len)) * 100),
            "feedback": feedback_list,
            "fatigueData": [{"rep": i+1, "score": float(s)} for i,s in enumerate(summary_scores)],
            # ⚠️ ar_filename 在上面固定是 None（AR 影片為省空間沒產）。
            #    這裡以前照樣組字串，回給前端的是 "/static/results/None" ——
            #    一個一定 404 的網址比沒有網址更糟，播放器會空轉。
            "arVideoUrl": (f"/static/results/{ar_filename}" if ar_filename else None),
        }

        # Save session to backend DB
        workout_data = {
            "timestamp": datetime.now().isoformat(),
            "overall_score": int(overall_score),
            "metrics": {item["subject"]: item["A"] for item in radar_data}, # Flatten for DB
            "reps_count": len(reps),
            # ⚠️ 欄位名要跟新管線一致（duration_seconds）。舊版寫 duration_mins，
            #    結果頁讀的是 duration_seconds，所以這條路徑的紀錄時長永遠 0。
            "duration_seconds": int(len(reps) * 3),
            "chartsData": chart_data_per_rep, # Save full details
            "feedback": feedback_list,
            "arVideoUrl": None,
            # ⚠️ 這裡以前寫死 "Bicep Curl" —— 不管使用者拍的是什麼動作，
            #    歷史裡都會出現一筆「二頭彎舉」。不知道就不要編一個：
            #    留空陣列，前端本來就只靠 exerciseKey 認這筆紀錄。
            "exercises": [],
        }
        
        saved_session_id = workout_history.save_workout_session(user_id, workout_data)
        print(f"Saved analysis session: {saved_session_id}")

        # 🧹 每次分析後 best-effort 清理影片目錄（保留最新 N + 容量上限）
        try:
            from core.media_cleanup import prune_media_dirs
            prune_media_dirs(DATA_DIR)
        except Exception as _ce:
            logger.warning(f"media_cleanup after analysis skipped: {_ce}")

        return JSONResponse(content={
            # 【v7.2】不給分時是 None，不能硬轉 float
        "overallScore": (None if overall_score is None else float(overall_score)),
            "metrics": radar_data,
            "chartsData": chart_data_per_rep,
            "concentricFrames": int((con_len / (con_len + ecc_len)) * 100),
            "feedback": feedback_list,
            "fatigueData": [{"rep": i+1, "score": float(s)} for i,s in enumerate(summary_scores)],
            "arVideoUrl": None
        })
        
    except Exception as e:
        import traceback
        error_msg = f"Error in upload_user: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        # 失敗也要刪掉剛存的原始影片，避免錯誤案例累積成肥檔
        try:
            if 'vid_path' in dir() and vid_path and os.path.exists(vid_path):
                os.remove(vid_path)
        except Exception:
            pass
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": error_msg})


# ============ Multi-Exercise Coach Routes ============

@router.get("/api/multi-exercise/exercises")
def get_multi_exercises():
    """回傳所有動作，附上**每個機位**的模板狀態。

    ── 【v9.2】修掉一個一直錯的判斷 ────────────────────────────────
    舊版查的是 `template_{key}.npz`，但 v5.3 之後模板早就改成「每個機位一份」
    （`template_{key}__{view}.npz`，見 _template_path 的說明）。所以：

      · 建好了正面模板 → 舊版仍回 has_template=False（畫面顯示沒模板）
      · 留著一個舊的單機位模板 → 舊版回 True，但那份模板可能是別的機位的

    兩種都會讓動作選擇頁的燈號說謊。這裡改成逐機位檢查，並保留
    `has_template` 當相容欄位（= 任何一個機位有模板）。
    """
    exercises = multi_exercise.get_exercise_list()
    for ex in exercises:
        key = ex["key"]
        # 已驗證的機位排前面，其餘照樣掃 —— 使用者可能替沒驗證的機位建過模板，
        # 那份模板存在是事實，只是不會被宣告成「量得準」。
        try:
            from core.measurability import VALIDATED_CAMERA_POSE
            validated = list((VALIDATED_CAMERA_POSE.get(key) or {}).keys())
        except Exception:
            validated = []
        views = list(dict.fromkeys(
            validated + ["frontal_0", "sagittal_90", "overhead", "oblique_45"]
        ))
        ex["validated_views"] = validated
        templates = {}
        for v in views:
            p = os.path.join(DATA_DIR, f"template_{key}__{v}.npz")
            if not os.path.exists(p):
                continue
            reps, quality = 0, None
            try:
                td = np.load(p, allow_pickle=True)
                reps = int(td.get("total_reps", 0))
                # 【v9.3】模板可信度（影片/rep 太少 → weak），舊模板沒有這欄位
                if "template_quality" in td:
                    quality = json.loads(str(td["template_quality"]))
            except Exception:
                pass
            templates[v] = {"exists": True, "reps": reps, "quality": quality}

        # 相容：v5.3 之前的單一模板（沒有機位資訊，只能當「有東西」看待）
        legacy = os.path.join(DATA_DIR, f"template_{key}.npz")
        if os.path.exists(legacy):
            reps = 0
            try:
                reps = int(np.load(legacy, allow_pickle=True).get("total_reps", 0))
            except Exception:
                pass
            templates.setdefault("_legacy", {"exists": True, "reps": reps})

        ex["templates"] = templates
        ex["has_template"] = bool(templates)
        ex["template_reps"] = max([t["reps"] for t in templates.values()], default=0)
    return {"exercises": exercises}


def _template_path(exercise_key: str, view: str = None, for_write: bool = False) -> str:
    """【v5.3】模板路徑改成「每個機位一份」。

    為什麼不能共用一份模板
    ──────────────────────
    不同機位量到的**不是同一個量**：
      · 正側面 90° 的 Elbow Flare 是 MediaPipe 的 z 雜訊（實測刻意做 T 字外展，
        數值只從 56.58° 變 55.72°）；正上方俯視才是真的外展角。
      · v5.2 之後 Forearm Vertical 更是直接依機位計算不同的分量（矢狀 / 額狀）。
    拿 A 機位的模板去比 B 機位的影片，比到的是投影差異不是動作差異——
    實測同一個人同一個深蹲，Torso Lean 在兩個機位分別是 15.68° 和 3.87°。

    未指定 view 時沿用舊檔名，確保既有模板與呼叫端不會壞掉。
    """
    legacy = os.path.join(DATA_DIR, f"template_{exercise_key}.npz")

    # ══ 【v9.3】寫入路徑絕對不做 legacy fallback ══════════════════════
    #   這裡本來有一個會靜默毀資料的 bug：建模也呼叫這個函式取路徑，
    #   而 fallback 規則是「per-view 檔不存在 + 舊的單一模板存在 → 回舊路徑」。
    #   於是使用者只要有一個舊的 template_squat.npz，就會發生：
    #       建正面模板 → 存進 template_squat.npz
    #       建側面模板 → 也存進 template_squat.npz（把正面的蓋掉）
    #   兩個機位的模板互相覆蓋，而且畫面上完全看不出來。
    #   寫入一律用 per-view 檔名；fallback 只在「讀」的時候才有意義。
    if for_write:
        if not view:
            # 【v9.3】寫入一定要指定機位。沒指定就退回舊的共用檔名的話，
            #   不同機位的模板還是會互相覆蓋 —— 那正是這個參數要防的事。
            raise ValueError("template write requires an explicit view")
        safe_w = "".join(c for c in str(view) if c.isalnum() or c == "_")
        return os.path.join(DATA_DIR, f"template_{exercise_key}__{safe_w}.npz")

    # 【v9.2】沒帶 view 時不能直接跳回舊檔名。
    #   實測：模板建好存成 template_squat__frontal_0.npz，但分析請求沒帶 view，
    #   這裡就去找 template_squat.npz → 找不到 → 回「No template, build one first」，
    #   而使用者明明剛建好。改成先找該動作**已驗證機位**的模板。
    if not view:
        try:
            from core.measurability import VALIDATED_CAMERA_POSE
            for v in (VALIDATED_CAMERA_POSE.get(exercise_key) or {}):
                cand = os.path.join(DATA_DIR, f"template_{exercise_key}__{v}.npz")
                if os.path.exists(cand):
                    return cand
        except Exception:
            pass
        # 再退一步：任何一個機位的模板都好過直接說沒有
        try:
            import glob as _glob
            hits = sorted(_glob.glob(os.path.join(DATA_DIR, f"template_{exercise_key}__*.npz")))
            if hits:
                return hits[0]
        except Exception:
            pass
        return legacy

    safe = "".join(c for c in str(view) if c.isalnum() or c == "_")
    p = os.path.join(DATA_DIR, f"template_{exercise_key}__{safe}.npz")
    # 相容：還沒建過分機位模板時，退回舊的單一模板
    if not os.path.exists(p) and os.path.exists(legacy):
        return legacy
    return p


# ══════════════════════════════════════════════════════════════════════
# 【v9.2】建模也走背景任務 —— 跟分析用同一套進度回報
# ══════════════════════════════════════════════════════════════════════
#   建模要跑 MediaPipe 逐幀偵測 + DBA 迭代，3 支影片動輒 40–90 秒。
#   舊版只有「上傳百分比」，上傳完就卡在 70% 不動，使用者不知道還要多久，
#   也分不出是當掉還是在算。這裡沿用分析那套 _ANALYSIS_JOBS，
#   前端一律輪詢 /api/multi-exercise/analyze-status/{job_id}。


class _SavedUpload:
    """把已落地的檔案包成 UploadFile 的樣子，讓既有建模函式不用改。

    背景執行緒跑的時候 request 已經結束，原本的 UploadFile 早就失效了，
    所以必須先把檔案寫到磁碟再包一層。
    """

    def __init__(self, path, filename):
        self.filename = filename
        self._path = path

    @property
    def file(self):
        return open(self._path, "rb")


@router.post("/api/multi-exercise/template-async")
@limiter.limit("20/hour")   # 建模每支都跑 MediaPipe + DBA，跟分析一樣要限流
def build_multi_exercise_template_async(
    request: Request,
    exercise_key: str = Form(...),
    files: list[UploadFile] = File(...),
    debug: bool = Form(False),
    view: str = Form(None),
):
    """立刻回 job_id，背景建模並逐階段回報真實進度。"""
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    if any(not _is_video_upload(f) for f in (files or [])):
        return _not_video_response()
    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={"error": f"Unknown exercise: {exercise_key}"})

    staged = []
    try:
        for f in files:
            # 檔名可能含路徑分隔字元（客戶端可控）→ 只取 basename
            safe_name = _safe_upload_name(f.filename)
            pth = os.path.join(UPLOAD_DIR, f"stage_{exercise_key}_{uuid.uuid4()}_{safe_name}")
            with open(pth, "wb") as buf:
                shutil.copyfileobj(f.file, buf)
            staged.append(_SavedUpload(pth, safe_name))
    except Exception as e:
        # 落地到一半失敗（磁碟滿等）→ 已寫的要刪掉，不然永遠留在 uploads
        for u in staged:
            try:
                os.remove(u._path)
            except Exception:
                pass
        logger.error(f"[template-async] staging failed: {e}")
        return JSONResponse(status_code=500, content={"error": f"影片暫存失敗：{e}"})

    _job_prune()
    job_id = str(uuid.uuid4())
    _job_set(job_id, status="processing", percent=0, stage="排隊中",
             result=None, error=None, ts=time.time(),
             owner=getattr(request.state, "user_id", None))

    def _worker():
        try:
            _job_set(job_id, percent=8, stage="讀取影片", ts=time.time())
            res = build_multi_exercise_template(
                exercise_key=exercise_key, files=staged, debug=debug, view=view,
                calib_files=None, _progress=lambda pct, st: _job_set(
                    job_id, percent=int(pct), stage=st, ts=time.time()),
            )
            if isinstance(res, JSONResponse):
                body = json.loads(bytes(res.body).decode("utf-8"))
                # 【v9.3】要把可讀的 message 傳出去 —— 只送機器碼的話，
                #   前端會顯示 "template_insufficient" 這種原始字串給使用者。
                _job_set(job_id, status="error", stage="建立失敗",
                         error=body.get("message") or body.get("error") or "建立失敗",
                         error_detail=body, ts=time.time())
            else:
                _job_set(job_id, status="done", percent=100, stage="完成",
                         result=_json_safe(res), ts=time.time())
        except Exception as e:
            import traceback
            logger.error(f"[template-async] {job_id} failed: {e}\n{traceback.format_exc()}")
            _job_set(job_id, status="error", stage="建立失敗",
                     error=f"{type(e).__name__}: {e}", ts=time.time())
        finally:
            for u in staged:
                try:
                    os.remove(u._path)
                except Exception:
                    pass

    threading.Thread(target=_worker, daemon=True).start()
    return {"job_id": job_id}


# ══════════════════════════════════════════════════════════════════════
# 【v9.4】裝置端建模：只收骨架，不收影片
# ══════════════════════════════════════════════════════════════════════
#   前端（iOS 原生 PoseAnalyzer.swift / 瀏覽器 WASM MediaPipe）已經逐幀跑過
#   一次 pose 偵測。原本沒有這支端點，前端與 Swift 都在打一個 404，於是
#   「裝置端建模」兩條快路徑必定失敗，只能落到最後的「整支影片上傳」後備 ——
#   在行動網路上要傳 30–150 MB，使用者看到的就是「手機建不了模板」。
#
#   這裡不重寫建模邏輯，而是把骨架餵進 build_multi_exercise_template 的
#   pose_clips 參數，走**同一套**切循環 / DTW / DBA / 三道關卡。
#   兩條路徑共用同一份程式碼是刻意的：模板是評分的尺規，尺規分岔就等於
#   同一個動作在不同裝置上會拿到不同分數。

_MAX_TPL_CLIPS = 8            # 建模最多 8 支；再多只是拖慢，DBA 早就收斂
_MAX_TPL_FRAMES = 4000        # 單支上限（20fps × 200 秒），擋畸形 payload


def _sanitize_pose_clips(raw):
    """把外部送進來的 clips 正規化成 [{'fps': float, 'frames': [...]}]。

    只做結構與量級檢查，不改任何數值 —— 數值本身是量測結果。
    形狀不對的**單幀**在 _run_pose_extraction_from_frames 內會被判成 NaN，
    這裡只負責擋掉整支不合格與過大的 payload。
    """
    clips = []
    for c in (raw or [])[:_MAX_TPL_CLIPS]:
        if not isinstance(c, dict):
            continue
        frames = c.get("frames")
        # 🔴 10 幀在 20fps 下只有 0.5 秒，切不出任何動作週期 —— 收下來只會
        #   一路跑到最後才回「No valid repetitions」，看起來像動作有問題，
        #   實際上是資料根本不夠。門檻拉到 40 幀（2 秒），並記錄被擋掉的原因。
        if not isinstance(frames, list) or len(frames) < 40:
            logger.warning("[pose-clips] 丟棄一支 clip：只有 %s 幀（至少需要 40）",
                           len(frames) if isinstance(frames, list) else "非陣列")
            continue
        try:
            fps = float(c.get("fps") or 30.0)
        except (TypeError, ValueError):
            fps = 30.0
        if not (1.0 <= fps <= 240.0):
            fps = 30.0
        clips.append({"fps": fps, "frames": frames[:_MAX_TPL_FRAMES]})
    return clips


@router.post("/api/multi-exercise/template-from-pose-async")
@limiter.limit("20/hour")
async def build_multi_exercise_template_from_pose_async(request: Request, payload: dict = Body(...)):
    """立刻回 job_id；背景用「裝置端抽好的骨架」建模。

    payload = {
      "exercise_key": "squat",
      "view": "front_0",                       # 可為 null → 走舊的單一模板路徑
      "clips": [ { "fps": 20, "frames": [
            { "world": [[x,y,z] ×33], "image": [[x,y] ×33], "vis": [v ×33] }, ... ] }, ... ]
    }
    """
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"error": "bad_payload"})
    exercise_key = str(payload.get("exercise_key") or "")
    view = payload.get("view") or None
    debug = bool(payload.get("debug"))

    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={"error": f"Unknown exercise: {exercise_key}"})

    clips = _sanitize_pose_clips(payload.get("clips"))
    if len(clips) < 2:
        # 與 build_multi_exercise_template 的 TPL_MIN_VIDEOS 同一個下限，
        # 但在這裡就先擋掉 —— 免得排一個註定失敗的背景任務。
        return JSONResponse(status_code=400, content={
            "error": "template_insufficient",
            "message": f"只收到 {len(clips)} 支有效骨架，至少需要 2 支（建議 3 支）。",
            "reason": "模板同時要提供評分刻度，單支影片算出的刻度會比真實重複性小很多。",
            "videos": len(clips), "min_videos": 2,
        })

    _job_prune()
    job_id = str(uuid.uuid4())
    _job_set(job_id, status="processing", percent=0, stage="排隊中",
             result=None, error=None, ts=time.time(),
             owner=getattr(request.state, "user_id", None))

    def _worker():
        try:
            _job_set(job_id, percent=8, stage="解析骨架", ts=time.time())
            res = build_multi_exercise_template(
                exercise_key=exercise_key, files=None, debug=debug, view=view,
                calib_files=None, pose_clips=clips,
                _progress=lambda pct, st: _job_set(
                    job_id, percent=int(pct), stage=st, ts=time.time()),
            )
            if isinstance(res, JSONResponse):
                body = json.loads(bytes(res.body).decode("utf-8"))
                _job_set(job_id, status="error", stage="建立失敗",
                         error=body.get("message") or body.get("error") or "建立失敗",
                         error_detail=body, ts=time.time())
            else:
                _job_set(job_id, status="done", percent=100, stage="完成",
                         result=_json_safe(res), ts=time.time())
        except Exception as e:
            import traceback
            logger.error(f"[template-from-pose] {job_id} failed: {e}\n{traceback.format_exc()}")
            _job_set(job_id, status="error", stage="建立失敗",
                     error=f"{type(e).__name__}: {e}", ts=time.time())

    threading.Thread(target=_worker, daemon=True).start()
    return {"job_id": job_id}


@router.post("/api/multi-exercise/template")
def build_multi_exercise_template(
    request: Request = None,     # HTTP 呼叫一定會注入；背景任務內部呼叫為 None（外層已驗過登入）
    exercise_key: str = Form(...),
    files: list[UploadFile] = File(...),
    debug: bool = Form(False),
    view: str = Form(None),      # 【v5.3】機位代號；每個機位建自己的模板
    # 【v8.9】calib_files 已停用 —— 改走 /api/multi-exercise/calibrate 單支上傳。
    #   原因：把 3 支校準影片跟 2 支建模影片塞進同一個請求，body 從 2 支變 5 支，
    #   直接被後端的 limit_body_size 擋掉（瀏覽器只看得到 Network Error）。
    #   保留這個參數只為相容，實際上前端不再送。
    calib_files: list[UploadFile] = File(None),
    _progress=None,              # 【v9.2】背景任務用的進度回呼；同步路徑傳 None
    pose_clips=None,             # 【v9.4】裝置端已抽好的骨架；給了它就不吃 files
):
    """Upload expert videos for a specific exercise to build/update golden template.
    debug=True（研究模式）：額外回傳 result["debug"]，內含 DBA 建模與重採樣中間資料
    （向心/離心長度分布、重採樣後主訊號序列、DBA 每輪收斂量、模板主訊號），供繪製真實技術圖表。

    ── 【v8.7】calib_files：信度校準影片（與建模影片分開）────────────────────
    這個參數是為了解決一個結構性問題，而不是為了多一個功能。

    重測信度（同一個人、同一機位、重複拍，這個指標的分數穩不穩）是三道關卡
    裡最重要的一道 —— 實測深蹲自選機位的 Torso Lean 子分數是 80/84/5，
    CV = 0.79，遠超 0.35 門檻，本來就該被擋下不計分。它沒被擋下，
    導致一支動作品質正常的影片拿到 45 分（正確應為 80 以上）。

    為什麼沒被擋下：CV 原本是拿**建模影片**算的，而建模只有 2 支。
      · 2 支算 CV 只有 1 個自由度，估計本身不可信 → 程式設了
        RELIABILITY_TRUST_VIDEOS = 3 的門檻，n<3 就不採信 → 關卡等於沒開。
      · 而且用建模影片算 CV 是**循環的**：模板就是這些影片做出來的，
        尺規也取了它們之間的變異當下限，回頭再用它們評分，
        變異早被吸收，CV 永遠 ≈ 0。（程式裡原本就標註了這個顧慮。）

    正解是把「決定模板」與「量測信度」拆成兩組不同的影片：
      建模影片   → 決定模板曲線與評分尺規
      校準影片   → 決定每個指標的重測信度（獨立資料，不循環）

    校準影片就是一般的標準動作影片，至少 3 支。實測套用後：
      深蹲自選  Torso Lean CV 0.79 → 剔除 → 標準組 45/89/91 變成 99/100/100
      而且偵測力反而變強（深蹲正面膝內夾 +35.9 → +42.8），
      因為不穩的指標被拿掉後，標準組的離散變小，同樣的錯誤相對更突出。

    ⚠️ 研究情境下的限制要誠實揭露：校準影片與受測的「標準組」影片是同一批，
       所以**重測信度這個數字**是在自己身上量的（psychometrics 的 item analysis
       就是這樣做，但要declare）。效度結果（刻意錯掉幾分）不受影響 ——
       刻意錯影片完全沒有參與校準。
    """
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={"error": f"Unknown exercise: {exercise_key}"})

    # ── 兩種輸入來源，之後的流程完全共用 ────────────────────────────────
    #   ① files      ：上傳整支影片，後端跑 MediaPipe（瀏覽器/後備路徑）
    #   ② pose_clips ：裝置端已抽好骨架，只送 landmark（iOS 原生 / WASM 主路徑）
    #   共用是刻意的 —— 兩條路徑若各寫一份建模邏輯，模板的評分尺規遲早會分岔。
    _from_pose = bool(pose_clips)
    if _from_pose:
        print(f"--- Building template for {cfg['name']} ({len(pose_clips)} pose clips) ---")
        video_paths = []
    else:
        print(f"--- Building template for {cfg['name']} ({len(files or [])} files) ---")
        # Save uploaded files
        video_paths = []
        for file in files:
            path = os.path.join(UPLOAD_DIR, f"expert_{exercise_key}_{uuid.uuid4()}_{_safe_upload_name(file.filename)}")
            with open(path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            video_paths.append(path)

    # Process videos（迴圈內每支都有 finally 刪檔，本身已安全）
    all_reps = []
    _pose_slices = []       # 【AR】每個 rep 的教練骨架切片 → 之後平均成可拖移黃金骨架
    seg_cols_used = []      # 【v5.7】記錄建模實際用了哪一欄切割，要存進模板
    vis_samples = []        # 【v5.9】建模影片的可見度，用來決定「這個機位量得到哪些指標」
    feat_samples = []       # 【v6.4】建模影片的特徵欄，用來量「投影退化」（ROM 過小）——
                            #   可見度只抓得到遮擋，抓不到「看得到但角度在投影上退化」。
    bone_samples = []       # 【v8.6】每支建模影片的骨長。左右不對稱＝該側座標是腦補的。
    _src_diag = []          # 每支的實測診斷；切不出 rep 時要原樣回報給前端
    _sources = pose_clips if _from_pose else video_paths
    _n_vids = max(len(_sources), 1)
    for _vi, _src in enumerate(_sources):
        vid_path = None if _from_pose else _src
        # 每支的來源標記：create_golden_template 要靠它算「跨影片變異」當評分尺規
        _src_name = f"clip_{_vi + 1}" if _from_pose else os.path.basename(vid_path)
        try:
            # 【v9.2】真實進度：影片處理佔 10–78%，剩下留給 DBA 與存檔
            #   放在 try 裡面 —— 在外面的話，它一拋例外整批影片都不會被刪。
            if _progress:
                _progress(10 + int(_vi / _n_vids * 68),
                          f"{'解析骨架' if _from_pose else '偵測骨架'} {_vi + 1}／{_n_vids}")
            print(f"  [DEBUG] Processing: {_src_name}")
            print(f"  [DEBUG] Using body_thr={cfg['body_thr']}, joint_thr={cfg['joint_thr']}")
            # 【v5.3】建模端也要把機位傳下去，否則模板與受測影片會用
            #   不同的公式算同一個欄位（例如 Forearm Vertical 的矢狀 vs 額狀分量）
            feats, confs, fps, _landmarks = cfg["extract_fn"](
                vid_path,
                body_thr=cfg["body_thr"],
                joint_thr=cfg["joint_thr"],
                view=view,
                frames=(_src.get("frames") if _from_pose else None),
                frames_fps=(_src.get("fps") if _from_pose else None),
            )
            print(f"  [DEBUG] Feature extraction done. Shape={feats.shape}, FPS={fps}")
            _diag = {"src": _src_name, "frames": int(feats.shape[0]) if feats.size else 0,
                     "fps": float(fps or 0), "valid": None, "range": None, "note": None}
            _src_diag.append(_diag)
            if feats.size == 0:
                print(f"  [DEBUG] ❌ feats is EMPTY! MediaPipe found no poses at all.")
                _diag["note"] = "完全沒有偵測到骨架"
                continue
            # Check NaN ratio per column
            nan_counts = np.isnan(feats).sum(axis=0)
            total_frames = feats.shape[0]
            print(f"  [DEBUG] Total frames: {total_frames}")
            for i, label in enumerate(cfg["metric_labels"]):
                pct = nan_counts[i] / total_frames * 100 if total_frames > 0 else 100
                print(f"    fv[{i}] {label}: {nan_counts[i]}/{total_frames} NaN ({pct:.1f}%)")
            
            # Check the segmentation signal specifically
            # ⚠️ segment_signal_idx 可能是 "avg_elbow" 這種字串，不能直接當索引
            sig_col, sig_idx = multi_exercise.primary_signal_of(feats, cfg)
            valid_count = np.count_nonzero(~np.isnan(sig_col))
            _diag["valid"] = int(valid_count)
            print(f"  [DEBUG] Segment signal ({sig_idx} '{multi_exercise.primary_label_of(cfg, feats)}'): {valid_count}/{total_frames} valid values")
            if valid_count > 0:
                sig_valid = sig_col[~np.isnan(sig_col)]
                _diag["range"] = float(sig_valid.max() - sig_valid.min())
                print(f"  [DEBUG] Signal range: min={sig_valid.min():.2f}, max={sig_valid.max():.2f}, range={sig_valid.max()-sig_valid.min():.2f}")
                print(f"  [DEBUG] Required prominence={cfg['segment_prominence']}, min_rep_sec={cfg['min_rep_sec']}")

            fs = multi_exercise.apply_smoothing(feats, fps)
            print(f"  [DEBUG] Smoothing done. Shape={fs.shape}")
            
            # 【v5.7】建模也要走 segment_repetitions_auto。
            #   舊版建模用 segment_repetitions（寫死 cfg 的主訊號），受測卻用 auto
            #   （會自動換欄）→ 兩邊可能切在不同欄位上，rep 的相位對不起來，
            #   之後每一次比對都是拿 A 訊號的曲線去比 B 訊號的模板。
            #   而且正側面時主訊號常常是被遮擋側的幻覺（實測動態範圍 0°），
            #   建模若沒有這層保護，模板本身就是垃圾。
            # ⚠️ 【v7 修】counting_candidates 要的是**8 關節可見度**（confs 原始值），
            #   不是 compute_metric_visibility 轉出來的 7 指標可見度。
            #   傳錯的話索引全部對不上 —— 例如「左腕高度」候選要查 confs[4]（左腕），
            #   卻讀到 metric_vis[4]（Elbow Sym），於是正側面被擋住的左腕
            #   照樣通過 0.55 的可見度門檻，被選來計次。
            #   實測 2026-08-01：臥推正側面挑到「左腕高度」「腕中點高度」各 2–3 次，
            #   而左腕在該機位的可見度只有 0.28。
            _mv_seg = multi_exercise.compute_metric_visibility(exercise_key, confs)
            _jc_seg = confs   # 8 關節原始值，給計次候選用
            reps, _seg_col, _seg_inv = multi_exercise.segment_repetitions_auto(
                fs, fps, cfg, landmarks=_landmarks, view=view,
                metric_vis=_mv_seg, joint_confs=_jc_seg)
            seg_cols_used.append((_seg_col, _seg_inv))
            try:
                _mv = multi_exercise.compute_metric_visibility(exercise_key, confs)
                if _mv is not None:
                    vis_samples.append(np.nanmean(_mv, axis=0))
                feat_samples.append(np.asarray(fs, dtype=float))
                # 【v8.6】量骨長。這是第 0 道關卡的輸入 —— 骨頭是物理常數，
                #   左右不等長就是重建失敗，比 MediaPipe 自評的 visibility 硬。
                if _landmarks is not None:
                    _bl = metrology.bone_lengths(_landmarks)
                    if _bl:
                        bone_samples.append(_bl)
            except Exception:
                pass
            print(f"  [DEBUG] Segmentation done. Found {len(reps)} reps. (col={_seg_col}, inv={_seg_inv})")
            # 【v7】標記每個 rep 來自哪一支建模影片 —— create_golden_template
            #   要用「跨影片」變異當分數尺規，沒有這個標記就退回 rep 間變異。
            for _r in reps:
                _r["source_video"] = _src_name
            if reps:
                all_reps.extend(reps)
                # 【AR】收集每個 rep 的教練骨架切片，之後平均成可拖移的黃金骨架軌跡
                try:
                    for _r in reps:
                        _sl = multi_exercise.pose_rep_slice(_landmarks, _r)
                        if _sl:
                            _pose_slices.append(_sl)
                except Exception as _pe:
                    print(f"  [AR] 骨架切片略過：{_pe}")
                print(f"  ✅ {len(reps)} reps from {_src_name}")
            else:
                print(f"  ❌ 0 reps found! Signal might be too flat or prominence too high.")
        except Exception as e:
            import traceback
            print(f"Error processing {_src_name}: {e}")
            traceback.print_exc()
        finally:
            if vid_path:
                _purge_upload(vid_path)   # 建模影片也是用完就刪

    if not all_reps:
        # ⚠️ 只回一句 "No valid repetitions" 等於把「動作有問題」和「資料根本沒進來」
        #    混成同一則訊息 —— 使用者無從分辨，開發者也查不下去。
        #    這裡把後端**實際看到什麼**一起回報：幾支、每支幾幀、切割訊號動態範圍多少。
        _diag = []
        for _d in _src_diag:
            _diag.append(
                f"{_d['src']}：{_d['frames']} 幀 / {_d['fps']:.0f}fps"
                + (f"、有效 {_d['valid']} 幀" if _d.get('valid') is not None else "")
                + (f"、訊號範圍 {_d['range']:.1f}" if _d.get('range') is not None else "")
                + (f"、{_d['note']}" if _d.get('note') else "")
            )
        logger.warning(f"[template] {exercise_key}/{view} 切不出任何 rep：" + "；".join(_diag))
        return JSONResponse(status_code=400, content={
            "error": "No valid repetitions found. Check video quality/angle.",
            "message": "沒有從任何一支影片切出完整動作循環。",
            "reason": ("後端實際收到：" + "；".join(_diag)) if _diag else "後端沒有收到可用的骨架資料。",
            "diagnostics": _src_diag,
        })

    # ══════════════════════════════════════════════════════════════════
    # 【v9.3】收斂安全閘 —— 資料不夠就不要硬做出一份模板
    # ══════════════════════════════════════════════════════════════════
    #   模板不只是一條平均曲線，它同時要提供**評分的刻度**
    #   （tpl_sd：教練自己重複做，這個指標會差多少）。刻度算不準，
    #   後面每一支受測影片的分數都是假的 —— 而且畫面上完全看不出來。
    #
    #   兩個獨立的下限：
    #     · 影片數：跨影片變異至少要 2 支才算得出來，3 支才有 2 個自由度。
    #       只有 1 支的話 tpl_sd 退化成「同一支影片內 rep 之間的抖動」，
    #       那個量比真正的重複性小很多 → 尺規過嚴 → 正常動作被判做錯。
    #     · 總 rep 數：DBA 是迭代平均，rep 太少等於在描摹單次表現。
    #
    #   低於硬下限直接擋；介於硬下限與建議值之間放行但標記 weak，
    #   讓分析結果頁可以誠實說「這份模板的基準本身不夠穩」。
    # 只數「真的切出 rep 的影片」—— 用 len(video_paths) 當 fallback 會把
    # 上傳了但一下都切不出來的影片也算進去，那正好是這道閘要擋的情況。
    _n_vids_used = len({r.get("source_video") for r in all_reps
                        if r.get("source_video") is not None})
    _n_reps = len(all_reps)
    TPL_MIN_VIDEOS, TPL_REC_VIDEOS = 2, 3
    TPL_MIN_REPS, TPL_REC_REPS = 4, 8

    if _n_vids_used < TPL_MIN_VIDEOS or _n_reps < TPL_MIN_REPS:
        return JSONResponse(status_code=400, content={
            "error": "template_insufficient",
            "message": (
                f"資料不足以建立可信的模板：目前 {_n_vids_used} 支影片、共 {_n_reps} 下。"
                f"至少需要 {TPL_MIN_VIDEOS} 支影片且合計 {TPL_MIN_REPS} 下"
                f"（建議 {TPL_REC_VIDEOS} 支、{TPL_REC_REPS} 下以上）。"),
            "reason": (
                "模板同時要提供評分的刻度 —— 也就是「同一個人重複做，這個指標會差多少」。"
                "只有一支影片時，這個刻度會退化成單支影片內的抖動，比真實重複性小很多，"
                "會讓正常動作被判成做錯。"),
            "videos": _n_vids_used, "reps": _n_reps,
            "min_videos": TPL_MIN_VIDEOS, "min_reps": TPL_MIN_REPS,
        })

    _tpl_weak = (_n_vids_used < TPL_REC_VIDEOS or _n_reps < TPL_REC_REPS)
    _tpl_quality = {
        "level": "weak" if _tpl_weak else "ok",
        "videos": _n_vids_used, "reps": _n_reps,
        "note": (f"只有 {_n_vids_used} 支影片、{_n_reps} 下，"
                 f"評分刻度的自由度偏低，建議補到 {TPL_REC_VIDEOS} 支、{TPL_REC_REPS} 下以上。"
                 if _tpl_weak else None),
    }

    # Build template via DBA
    if _progress:
        _progress(80, "DBA 疊合黃金模板")
    template, con_len, ecc_len, tpl_sd, metric_cv, tpl_val = multi_exercise.create_golden_template(
        all_reps,
        # 【v5.1】建立基線時必須套用跟計分同一套方向規則，否則分子是半邊、
        #   分母是雙邊，量綱不一致，所有人都白賺分數。
        metric_directions=cfg.get("metric_directions"),
        metric_labels=cfg.get("metric_labels"),
        cfg_for_phase=cfg)          # 【v5.2】底部加權核要與計分端一致

    # 防呆：模板若整片是 0 / NaN，代表抽特徵或平滑階段壞掉了。
    #       絕不可存成垃圾檔 —— 否則之後每次分析都拿 0 當教練標準 → 分數恆 0、
    #       AR 疊圖出現「Bend (-113)」這種對著 0 模板算出來的荒謬指示。
    if (not np.isfinite(template).any()) or float(np.nanmax(np.abs(template))) < 1e-6:
        logger.error(f"[multi-exercise/template] {exercise_key} 模板全 0/NaN，拒絕儲存")
        return JSONResponse(status_code=500, content={
            "error": "Template built but came out all-zero — feature extraction or smoothing failed. "
                     "Check the video (full body in frame, good lighting) and try again."})

    # 【v5.9】決定這個機位的可用指標集：建模影片的平均可見度 ≥ 0.25 才算量得到。
    #   用建模影片決定是刻意的 —— 建模是同一個人、同一機位、標準動作，
    #   最能代表「這個機位在理想條件下看得到什麼」。
    # 【v6.1】改用**先驗表**決定，不再靠建模影片的可見度偵測。
    #   偵測不穩定：同機位換一支影片，可見度 0.13 可能變 0.30，指標集就跳動，
    #   同一組影片又變得不可比較。而「正側面看不到遠側肢體」「動作方向正對
    #   鏡頭時角度會退化」是幾何事實，本來就該事先知道，不需要每次去量。
    _ml_all = list(cfg["metric_labels"])

    # 【v6.2】C 機位（使用者自選）：角度事先不知道，所以從建模影片判定它
    #   **實際等效於哪個機位**，再套那個機位的先驗表。判定只做這一次，
    #   存進模板讓受測沿用 —— 逐支判定會讓指標集跳動，比較就不成立了。
    _resolved_view = view
    if view in (None, "oblique_45") and vis_samples:
        _mv_avg = np.vstack(vis_samples).reshape(1, -1)
        _rv, _bv_info = multi_exercise.measurability.resolve_actual_view(
            exercise_key, _mv_avg, cfg, declared_view=view)
        if _rv:
            _resolved_view = _rv
            print(f"[template] {exercise_key}/自選機位 → 判定等效於「{_rv}」"
                  + (f"（左右可見度比 {_bv_info['ratio']:.2f}"
                     + (f"，{_bv_info['occluded_side']} 被擋" if _bv_info.get('occluded_side') else "")
                     + "）" if _bv_info else ""))

    # 【v6.4】先量出「這批影片實際被擋住的是哪一側」，再去查先驗表。
    #   表裡寫死 L=近側／R=遠側，但近遠側取決於受測者站的方向（見 orient_table）。
    #   實測蹲7/蹲9 的近側是 R，表卻保留 L、擋掉 R → 正側面兩個膝蓋都沒了。
    _occluded_side = None
    if vis_samples:
        try:
            _bv_all = multi_exercise.measurability.bilateral_visibility(
                None, cfg, metric_vis=np.vstack(vis_samples))
            if _bv_all:
                _occluded_side = _bv_all.get("occluded_side")
                if _occluded_side:
                    print(f"[template] {exercise_key}/{_resolved_view} 實際被擋的是 "
                          f"{_occluded_side}（左右可見度比 {_bv_all['ratio']:.2f}）"
                          f" → 先驗表的近／遠側依此對位")
        except Exception:
            pass
    # 【v6.4】可用指標集改由**建模影片實測**決定，不再查寫死的先驗表。
    #   先驗表在自選機位上系統性砍錯：實測可見度 0.89–1.00 的指標被判「量不到」，
    #   因為 resolve_actual_view 只看左右可見度比，分不出「正上方俯視」和
    #   「斜前上方」（兩者比值都 ≈1.0），於是 C 被套上最嚴苛的 overhead 表。
    #   詳見 measurability.measured_usable_metrics 的說明。
    # 【v8.6】把每支建模影片的骨長合成一份代表值（逐骨段取中位數）。
    #   用中位數而非平均：n 只有 2–5 支，一支拍壞就會把平均拉走。
    _bones_med = None
    if bone_samples:
        _names = set()
        for _b in bone_samples:
            _names |= set(_b.keys())
        _bones_med = {}
        for _nm in _names:
            _ls = [b[_nm]["left"] for b in bone_samples if _nm in b]
            _rs = [b[_nm]["right"] for b in bone_samples if _nm in b]
            if not _ls or not _rs:
                continue
            _L, _R = float(np.median(_ls)), float(np.median(_rs))
            _bones_med[_nm] = {"left": _L, "right": _R,
                               "asym": abs(_L - _R) / max((_L + _R) / 2, 1e-9)}
        try:
            _bg = multi_exercise.measurability.bone_gate(exercise_key, _ml_all, _bones_med)[2]
            if _bg.get("bad_bones"):
                print(f"[template] {exercise_key}/{_resolved_view} 骨長關卡：",
                      {k: f"左右差{v['asym']:.0%}，{v['bad_side']}側不可信"
                       for k, v in _bg["bad_bones"].items()})
            else:
                print(f"[template] {exercise_key}/{_resolved_view} 骨長關卡："
                      f"相關骨段 {_bg.get('checked')} 全部通過")
        except Exception:
            pass

    _usable, _why = None, {}
    _usable_src = "先驗表（沒有建模可見度資料）"
    if vis_samples:
        _feat_all = np.vstack(feat_samples) if feat_samples else None
        _usable, _why = multi_exercise.measurability.measured_usable_metrics(
            exercise_key, _ml_all, np.vstack(vis_samples), feature_cols=_feat_all,
            bones=_bones_med)          # 【v8.6】第 0 道：骨長一致性
        _usable_src = "實測（建模影片＋骨長關卡）"
    if not _usable or len(_usable) < 2:
        # 【v7】退回先驗表時要標清楚 —— 否則 usable_why 還留著實測的理由，
        #   會出現「標 ✅ 可用、理由卻寫被遮擋」這種自相矛盾的輸出。
        #   實測 bench_press/side：實測只給 1 個（只有 R Elbow 過門檻），
        #   退回先驗表拿到 3 個，但 why 仍是實測版本。
        _usable_src = (f"先驗表（實測只給 {len(_usable or [])} 個，不足 2 個）")
        # 實測資料不足才退回先驗表（例如建模影片沒收集到可見度）
        _usable = multi_exercise.measurability.usable_metrics_for(
            exercise_key, _resolved_view, _ml_all, occluded_side=_occluded_side, cfg=cfg)
        if len(_usable) < 2:
            _usable = _ml_all
        print(f"[template] {exercise_key}/{view} ⚠️ 實測資料不足 → 退回先驗表 {len(_usable)}/{len(_ml_all)}")
    else:
        print(f"[template] {exercise_key}/{view} 實測可用 {len(_usable)}/{len(_ml_all)}：{_usable}")
        # 【v7】把分數尺規印出來 —— 這是「同樣動作換支影片掉 40 分」的直接原因，
        #   必須可被檢查。尺規 = max(跨建模影片變異, rep 間變異)。
        try:
            _n_src = len({r.get("source_video") for r in all_reps if r.get("source_video")})
            print(f"[template]   分數尺規（{_n_src} 支建模影片）：" +
                  "、".join(f"{lab}={float(tpl_sd[1][i]):.3f}"
                            for i, lab in enumerate(_ml_all) if i < len(tpl_sd[1])))
            if _n_src < 2:
                print("[template]   ⚠️ 只有 1 支建模影片 → 尺規只能用 rep 間變異，"
                      "受測分數會偏低。建議建模至少 2 支（3 支更好）。")
        except Exception:
            pass
        for lab in _ml_all:
            r = _why.get(lab, "")
            if lab not in _usable:
                print(f"[template]   ✗ {lab}：{r}")
        # 先驗表只當交叉檢核，不再改變行為 —— 兩者不一致時印出來供檢討
        _prior = multi_exercise.measurability.usable_metrics_for(
            exercise_key, _resolved_view, _ml_all, occluded_side=_occluded_side, cfg=cfg)
        _diff = set(_usable) ^ set(_prior)
        if _diff:
            print(f"[template]   （先驗表會給 {len(_prior)} 個，與實測差異：{sorted(_diff)}）")

    # Save
    tpath = _template_path(exercise_key, view, for_write=True)
    if _progress:
        _progress(92, "寫入模板")
    # 【AR】教練骨架軌跡（沿 rep 週期對齊後跨 rep 平均）＋該機位要畫的點位
    try:
        _coach_pose = multi_exercise.build_pose_trajectory(_pose_slices, int(con_len), int(ecc_len))
    except Exception as _pe:
        print(f"[template] 骨架軌跡計算失敗（不影響模板）：{_pe}"); _coach_pose = None
    _pose_idx = multi_exercise.pose_draw_indices(exercise_key, _resolved_view, _occluded_side)
    # 【資料驅動】再用教練軌跡的實際活動範圍篩掉「腦補的遠側肢體」
    if _coach_pose is not None:
        _before = list(_pose_idx)
        _pose_idx = multi_exercise.refine_draw_indices(_coach_pose, _pose_idx)
        _dropped = [i for i in _before if i not in _pose_idx]
        if _dropped:
            print(f"[template]   活動範圍過小、判定未被實際觀測 → 不畫：{_dropped}")
    print(f"[template]   教練骨架軌跡 {(_coach_pose.shape if _coach_pose is not None else None)}、畫點 {len(_pose_idx)} 個")

    np.savez(tpath,
             template=template,
             con_len=np.array(con_len),
             ecc_len=np.array(ecc_len),
             total_reps=np.array(len(all_reps)),
             # 【AR】教練骨架軌跡 (L,33,2) 與該機位要畫的 landmark 索引
             pose_seq=(_coach_pose if _coach_pose is not None else np.array([])),
             pose_draw_idx=np.array(_pose_idx, dtype=int),
             # 【v9.3】模板本身的可信度 —— 影片/rep 太少時尺規自由度不足
             template_quality=np.array(json.dumps(_tpl_quality)),
             exercise_key=np.array(exercise_key),
             # 【v5.1】(2, n_metrics)：第 0 列 = 教練的典型偏差（z 的錨點），
             #   第 1 列 = 該偏差的 MAD（z 的刻度）。
             #   舊模板 npz 沒有這個 key，score_rep 會自動退回舊的 scoring_scales。
             tpl_sd=np.vstack([np.asarray(tpl_sd[0], dtype=float),
                               np.asarray(tpl_sd[1], dtype=float)]),
             # 【v8.8】(2, n_metrics)：第 0 列 = 教練**量測值**的中位數，
             #   第 1 列 = 該量測值的 MAD。這是新的評分基準 ——
             #   在量測值空間比，而不是在「與模板的差值」空間比。
             #   差值空間是兩個相近大數相減，相對誤差被放大 15 倍
             #   （實測：軀幹角度 CV 0.065 → 差值 CV 0.955）。
             #   舊模板沒有這個 key，score_rep 會自動退回差值空間。
             tpl_val=np.vstack([np.asarray(tpl_val[0], dtype=float),
                                np.asarray(tpl_val[1], dtype=float)]),
             # 【v5.7】建模實際用了哪一欄切割 —— 受測時必須用同一欄，
             #   否則模板的 rep 相位跟受測的 rep 相位是用不同訊號切出來的，
             #   之後每一次比對都是拿 A 訊號的曲線去比 B 訊號的模板。
             seg_col=np.array(str(_mode_of(seg_cols_used, 0))),
             seg_invert=np.array(bool(_mode_of(seg_cols_used, 1))),
             # 【v5.9】這個機位量得到哪些指標 —— 由建模影片一次決定，
             #   該機位所有受測影片共用。逐影片決定的話，同一組裡每支算的
             #   東西都不一樣（實測標準組 3 支的計分指標數是 1/1/5），
             #   重測 SD 與效度差就都不可解讀了。
             usable_metrics=np.array(_usable, dtype=object),
             # 【v8】重測信度：同機位重複拍標準動作，每個指標的分數 CV。
             #   ≥3 支建模影片才算得出來，否則整列是 NaN → score_rep 會
             #   退回 measurability.RELIABILITY_CV 驗證表。
             #   「量得到」與「量得準」是兩件事：深蹲正側面 Hip Depth
             #   可見度 0.91、權重 0.32，但 5 支標準影片子分數 100/99/100/36/31。
             metric_cv=np.asarray(metric_cv, dtype=float),
             # 【v8.3】建模影片支數：決定上面那排 CV 要「直接採信」還是「只用來否決」
             n_source_videos=np.array(len({r.get("source_video") for r in all_reps
                                           if r.get("source_video") is not None}) or 1),
             # 【v8.6】建模影片的骨長（逐骨段中位數）。存起來的用途有二：
             #   ① 受測端可以拿自己的骨長跟模板比 → 判斷「是不是同一個機位」
             #   ② 報告上要能說明「為什麼這個指標被砍」，需要原始量測值佐證
             bone_lengths=np.array(json.dumps(_bones_med or {}, ensure_ascii=False)),
             # 【v6.2】C 機位判定出來的實際等效機位（A/B 就是宣告的那個）
             resolved_view=np.array(str(_resolved_view or "")))

    print(f"[SUCCESS] Template saved → {tpath}")
    print(f"          教練典型偏差 med = {np.round(tpl_sd[0], 4).tolist()}")
    print(f"          偏差刻度     mad = {np.round(tpl_sd[1], 4).tolist()}")

    # ══ 【v8.9】信度校準已移到獨立端點 /api/multi-exercise/calibrate ═══════
    #   原本是把 3 支校準影片跟 2 支建模影片放進同一個請求，一次上傳 5 支。
    #   實測直接被後端的 limit_body_size 擋掉，瀏覽器只看得到 Network Error，
    #   整輪建模全滅。校準改成**一支一支**傳，每個請求只有一支影片。
    _calib_cv, _calib_n, _calib_detail = None, 0, {}
    if calib_files:
        print(f"[校準] 收到 {len(calib_files)} 支 calib_files，但此參數已停用；"
              f"請改用 /api/multi-exercise/calibrate 單支上傳")

    # ── 研究模式：dump DBA / 重採樣中間資料（供繪製真實技術圖表）──
    _dbg = None
    if debug:
        try:
            c_lens = [len(r["phase1"]) for r in all_reps if len(r["phase1"]) > 0]
            e_lens = [len(r["phase2"]) for r in all_reps if len(r["phase2"]) > 0]
            mc, me = int(np.median(c_lens)), int(np.median(e_lens))
            # ── 【v8.5】DBA 圖要畫哪一欄 ──────────────────────────────────────
            # v5.8 的註解已經寫明「硬轉成 0 會畫到完全無關的欄位」，但程式碼
            # 就是那樣做的：seg_cols_used 現在存的是字串（如 "counting:雙肘間距"），
            # isinstance(sig, int) 必為 False → 一律退回第 0 欄。
            #
            # 第 0 欄是 L Knee／L Elbow —— **正側面時那正是被遮擋的遠側肢體**。
            # 實測深蹲正側面 L Knee 可見度 0.317（右膝 0.900），
            # MediaPipe 腦補出來的假訊號讓 12 個 rep 的 ROM 散在 1–91、
            # 平均值 SD 25.9（正面只有 5.2）。圖上看起來「同一個動作差超多、
            # 疊起來變平」，其實是畫錯欄位，不是 DBA 壞掉。
            #
            # 改成：切割欄若是整數就照用；若是字串（計次訊號，不對應特徵欄），
            # 就改畫「這個機位實際計分、且權重最高」的那個指標 —— 那才是
            # 使用者真正關心、也真的量得到的量。
            # ⚠️ _mode_of(pairs, i) 的第二個參數是「取每個 pair 的第 i 個元素」，
            #    不是預設值。傳 None 進去會變成 p[None] → TypeError，
            #    整個 debug 區塊被 except 吞掉，前端就收到 L=undefined。
            sig = _mode_of(seg_cols_used, 0) if seg_cols_used else cfg["segment_signal_idx"]
            _seg_note = None
            if not isinstance(sig, (int, np.integer)):
                _seg_note = str(sig) if sig else None
                _ml_all = list(cfg["metric_labels"])
                # ⚠️ scoring_weights 是 numpy 陣列。寫成 `arr or []` 會觸發
                #    numpy 的真值判斷 → ValueError: truth value of an array is
                #    ambiguous，整個 debug 區塊被 except 吞掉 → 前端 L=undefined。
                _ws_raw = cfg.get("scoring_weights")
                _ws = list(_ws_raw) if _ws_raw is not None else []
                # 優先挑「真的會拿來計分」的指標（過了可測性 + 信度兩關），
                # 否則圖上會畫一條連系統自己都不信的訊號 ——
                # 例如深蹲正側面的 Hip Depth 可測但重測 CV 0.50。
                try:
                    _rel, _ = multi_exercise.measurability.reliable_metrics(
                        exercise_key, _resolved_view or view, sorted(set(_usable or [])))
                except Exception:
                    _rel = list(_usable or [])
                for _pool_labels in (set(_rel), set(_usable or []), set(_ml_all)):
                    _cands = [i for i, lab in enumerate(_ml_all) if lab in _pool_labels]
                    if _cands:
                        break
                # 【v8.6】在可信指標裡改挑**動態範圍最大**的那一條來畫，不再挑權重最大的。
                #   權重是「這個指標對評分多重要」，跟「畫出來看不看得出東西」是兩回事。
                #   實測臥推正側面：權重最大的 Forearm Vertical 單 rep 只擺盪 13.3°，
                #   畫出來是一條近乎水平的線，看起來像演算法完全沒抓到動作；
                #   同一批資料的 R Elbow 擺盪逾 70°，一眼就看得出向心／離心。
                #   兩者都是可信指標，差別只在適不適合當圖表主角。
                #   ⚠️ 只影響圖表呈現，不影響任何計分 —— 計分仍用完整的權重向量。
                if _cands:
                    _amps = {}
                    for i in _cands:
                        _per_rep = []
                        for r in all_reps:
                            try:
                                _v = np.concatenate([np.asarray(r["phase1"])[:, i],
                                                     np.asarray(r["phase2"])[:, i]]).astype(float)
                                _v = _v[np.isfinite(_v)]
                                if _v.size:
                                    _per_rep.append(float(_v.max() - _v.min()))
                            except Exception:
                                pass
                        _amps[i] = float(np.median(_per_rep)) if _per_rep else 0.0
                    sig = int(max(_cands, key=lambda i: (_amps.get(i, 0.0),
                                                         _ws[i] if i < len(_ws) else 0.0)))
                else:
                    sig = 0
            def _nl(a): return [None if float(x) != float(x) else round(float(x), 3) for x in a]
            aligned, seg_raw, seg_res = [], [], []
            for r in all_reps:
                seg_raw.append({"phase1": _nl(np.asarray(r["phase1"])[:, sig]),
                                "phase2": _nl(np.asarray(r["phase2"])[:, sig])})
                p1 = multi_exercise.resample_to_length(r["phase1"], mc)
                p2 = multi_exercise.resample_to_length(r["phase2"], me)
                full = multi_exercise.fill_nan_numpy(np.vstack((p1, p2)))
                aligned.append(full)
                seg_res.append(_nl(full[:, sig]))
            conv = []
            try:
                from tslearn.barycenters import dtw_barycenter_averaging as _dba
                arr = np.array(aligned); prev = np.mean(arr, axis=0)
                for it in range(1, 9):
                    cur = _dba(arr, max_iter=1, init_barycenter=prev)
                    conv.append({"iter": it, "change": round(float(np.mean(np.abs(cur - prev))), 4)})
                    prev = cur
            except Exception as _e:
                conv = []
            _dbg = {
                "exercise": exercise_key, "metric_labels": list(cfg["metric_labels"]),
                "segment_metric_index": int(sig),
                "segment_metric_label": cfg["metric_labels"][sig] if sig < len(cfg["metric_labels"]) else str(sig),
                # 【v8.5】切 rep 用的是哪條訊號（可能與畫出來的指標不同）——
                #   前端要標清楚，否則使用者會以為圖上這條就是拿來對齊的。
                "align_signal": _seg_note,
                "n_reps": len(all_reps), "con_lengths": c_lens, "ecc_lengths": e_lens,
                "median_con": mc, "median_ecc": me, "L": mc + me,
                "resampled_seg_raw": seg_raw,        # 重採樣前（長度不一）
                "resampled_seg_curves": seg_res,     # 重採樣後（統一長度 L）
                "template_seg_curve": _nl(template[:, sig]),
                "dba_convergence": conv,             # DBA 每輪變化量（收斂）
                # 【v7】可觀測性判定的完整結果與理由。
                #   沒有這個欄位就只能看到「某指標被砍」，看不到是可見度不足、
                #   ROM 退化、還是落在解剖區間外 —— 實測 Torso Lean 可見度 1.00、
                #   ROM 9.3°（門檻 2.0）兩關都過卻仍被砍，追了兩輪才發現
                #   模板回傳裡根本沒有這個資訊。
                "usable_metrics": list(_usable) if _usable else None,
                "usable_why": {k: str(v) for k, v in (_why or {}).items()},
                "usable_source": _usable_src,
                # 退回先驗表時，實測理由僅供參考，不代表最終判定
                "usable_why_is_final": _usable_src.startswith("實測"),
                "resolved_view": _resolved_view,
                "occluded_side": _occluded_side,
                # 分數尺規：同樣是建模階段算的，出問題時要看得到
                "score_scale": {lab: round(float(tpl_sd[1][i]), 4)
                                for i, lab in enumerate(cfg["metric_labels"])
                                if i < len(tpl_sd[1])},
                "n_source_videos": len({r.get("source_video") for r in all_reps
                                        if r.get("source_video")}),
                # ── 【v8.9】觀測性：上一輪無法從 dump 判斷校準到底有沒有跑 ──
                #   當時 n_source_videos 一律是建模影片數（2）、cv_source 沒有 dump，
                #   只能靠「分數變了」反推。這種要靠猜的狀態不可接受，補上。
                "cv_source": ("calibration" if _calib_cv is not None else "build_videos"),
                "calib_n": _calib_n,                       # 幾支校準影片有效
                "calib_cv": _calib_detail or None,         # 每個指標的子分數與 CV
                "reliability_n": (_calib_n if _calib_cv is not None
                                  else len({r.get("source_video") for r in all_reps
                                            if r.get("source_video")})),
                # 評分是走量測值空間還是差值空間（v8.8 已停用，這裡固定回報實況）
                "score_space": "deviation",
                "bone_lengths": _bones_med or None,
            }
        except Exception as e:
            _dbg = {"error": str(e)}

    _res = {
        "status": "success",
        "exercise": cfg["name"],
        "reps_used": len(all_reps),
        "videos_used": _n_vids_used,
        "view": view,
        # 【v9.3】模板夠不夠穩 —— 前端完成頁要據此決定要不要提醒補拍
        "quality": _tpl_quality,
        "template_shape": list(template.shape)
    }
    if debug:
        _res["debug"] = _dbg
    return _json_safe(_res)


# ═══════════════════════════════════════════════════════════════════
# 【v8.9】信度校準 —— 獨立端點，一次一支影片
# ═══════════════════════════════════════════════════════════════════
def _calib_sidecar(exercise_key: str, view: str) -> str:
    """校準累積檔的路徑。放在模板旁邊，跟著模板一起被覆蓋/刪除。"""
    # 【v9.3】這是**寫入**目標，必須綁死在同一份 per-view 模板上；
    #   用讀取路徑算的話，view 為空時會 fallback 到別的檔，累加器就串線了。
    return _template_path(exercise_key, view, for_write=True) + ".calib.json"


@router.post("/api/multi-exercise/calibrate")
def calibrate_reliability(
    request: Request,
    exercise_key: str = Form(...),
    file: UploadFile = File(...),
    view: str = Form(None),
    reset: bool = Form(False),
    min_videos: int = Form(3),
):
    """用一支**標準動作**影片累積重測信度，湊滿 min_videos 支就寫回模板。

    ── 為什麼要有這個端點 ────────────────────────────────────────────
    重測信度（同一人、同機位重複拍，這個指標的分數穩不穩）是三道關卡裡
    最關鍵的一道，但它**不能用建模影片自己算**：模板由那幾支做出來、
    尺規也取了它們之間的變異當下限，回頭再用它們評分，變異早被吸收，
    CV 永遠 ≈ 0，關卡等於沒開。必須用沒參與建模的獨立影片。

    ── 為什麼是「一次一支」而不是隨建模一起上傳 ──────────────────────
    v8.7 把 3 支校準影片塞進建模請求，body 從 2 支變 5 支，直接被後端的
    limit_body_size 擋掉 —— 瀏覽器只回報 Network Error，整輪建模全滅。
    拆成單支上傳後，每個請求的大小跟原本受測影片一樣，不會再撞上限。

    ── 評分時為什麼要跳過信度關卡 ────────────────────────────────────
    否則會形成循環：指標被查表擋下 → 權重 0 → 子分數是 0 → 校準拿到
    [0,0,0] → CV 算不出來 → 只好沿用查表 → 永遠翻不了身。
    實測踩過：深蹲自選機位 7 個指標只剩 1 個計分，而被擋掉的
    L Knee / R Knee / Hip Depth 原始量測 CV 只有 0.03–0.20（非常穩），
    是被一張查錯的表（自選機位去查 frontal_0）冤枉的。
    校準的職責就是「在信度未知的前提下量出信度」，所以可測性關卡照跑
    （那是物理限制），信度關卡必須關掉（那正是要量的東西）。

    參數
      reset       第一支傳 True，清掉上一輪的累積
      min_videos  幾支才算數（預設 3；2 支只有 1 個自由度，估不準）
    """
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={"error": f"Unknown exercise: {exercise_key}"})
    # 讀模板保留 legacy 相容；寫回時另外算 for_write 路徑
    tpath = _template_path(exercise_key, view)
    if not os.path.exists(tpath):
        return JSONResponse(status_code=400, content={
            "error": f"找不到 {exercise_key}/{view} 的模板，請先建模再校準"})

    side = _calib_sidecar(exercise_key, view)
    acc = {}
    if not reset and os.path.exists(side):
        try:
            acc = json.load(open(side, encoding="utf-8"))
        except Exception:
            acc = {}
    if reset:
        acc = {}

    vid = os.path.join(UPLOAD_DIR, f"calib_{exercise_key}_{uuid.uuid4()}_{_safe_upload_name(file.filename)}")
    try:
        with open(vid, "wb") as b:
            shutil.copyfileobj(file.file, b)

        td = np.load(tpath, allow_pickle=True)
        template = td["template"]
        con_len, ecc_len = int(td["con_len"]), int(td["ecc_len"])
        tpl_sd = td["tpl_sd"] if "tpl_sd" in td.files else None
        tpl_val = td["tpl_val"] if "tpl_val" in td.files else None
        rview = (str(td["resolved_view"].item() if td["resolved_view"].shape == ()
                     else td["resolved_view"]) if "resolved_view" in td.files else None) or view

        c2 = dict(cfg)
        c2["_skip_reliability_gate"] = True        # ← 這一關正是要量的東西
        c2.pop("_metric_cv", None)
        c2.pop("_cv_source", None)
        if "usable_metrics" in td.files:
            um = [str(x) for x in td["usable_metrics"].tolist()]
            if um:
                c2["_usable_metrics"] = um          # 可測性關卡照跑
        if str(view or "") in ("", "oblique_45", "None"):
            c2["_free_placement"] = True
        if "bone_lengths" in td.files:
            try:
                bl = json.loads(str(td["bone_lengths"].item()
                                    if td["bone_lengths"].shape == () else td["bone_lengths"]))
                bd = multi_exercise.measurability.bone_gate(exercise_key, cfg["metric_labels"], bl)[2]
                if bd.get("bad_bones"):
                    c2["_bone_gate_blocking"] = True
                    c2["_bone_gate_note"] = "、".join(
                        f"{b} 左右差 {v['asym']:.0%}" for b, v in bd["bad_bones"].items())
            except Exception:
                pass

        feats, confs, fps, lms = cfg["extract_fn"](
            vid, body_thr=cfg["body_thr"], joint_thr=cfg["joint_thr"], view=view)
        if feats.size == 0:
            return JSONResponse(status_code=400, content={"error": "這支影片抓不到骨架"})
        fs = multi_exercise.apply_smoothing(feats, fps)
        mv = multi_exercise.compute_metric_visibility(exercise_key, confs)
        reps, _, _ = multi_exercise.segment_repetitions_auto(
            fs, fps, cfg, landmarks=lms, view=view, metric_vis=mv, joint_confs=confs)
        if not reps:
            return JSONResponse(status_code=400, content={"error": "這支影片切不出任何一下"})

        subs_all = []
        for r in reps:
            p1 = multi_exercise.resample_to_length(r["phase1"], con_len)
            p2 = multi_exercise.resample_to_length(r["phase2"], ecc_len)
            _s, sb = multi_exercise.score_rep(
                np.vstack((p1, p2)), template, c2, out={},
                view=rview, tpl_sd=tpl_sd, exercise_key=exercise_key, tpl_val=tpl_val)
            subs_all.append(sb)
        mean_sub = np.nanmean(np.vstack(subs_all), axis=0)
        for i, lab in enumerate(cfg["metric_labels"]):
            if i < len(mean_sub) and np.isfinite(mean_sub[i]):
                acc.setdefault(lab, []).append(round(float(mean_sub[i]), 2))
        # 原子寫入：這份校準累積檔是信度關卡（重測 CV）的唯一資料來源，
        # 寫到一半被中斷會讓整份 JSON 損毀 → 該機位的驗證資料全部要重跑。
        save_json_atomic(side, acc, indent=2)

        n = min((len(v) for v in acc.values()), default=0)
        out = {"status": "accumulated", "n": n, "need": min_videos, "reps": len(reps)}

        if n >= min_videos:
            cvs = np.full(len(cfg["metric_labels"]), np.nan, dtype=float)
            detail = {}
            for i, lab in enumerate(cfg["metric_labels"]):
                v = acc.get(lab) or []
                if len(v) < min_videos:
                    continue
                # 全 0 ＝ 這個機位根本沒評到這個指標（物理上量不到，
                # 或是節奏/穩定度這類不進形態主分的欄位）。留 NaN 讓上游查表。
                if all(abs(x) < 1e-9 for x in v):
                    detail[lab] = {"scores": v, "cv": None, "note": "此機位未評到此指標"}
                    continue
                m = float(np.mean(v))
                cvs[i] = float(np.std(v, ddof=1) / m) if m > 1e-9 else float("inf")
                detail[lab] = {"scores": v, "cv": round(float(cvs[i]), 3),
                               "blocked": bool(cvs[i] > multi_exercise.measurability.RELIABILITY_CV_MAX)}
            d2 = dict(np.load(tpath, allow_pickle=True))
            d2["metric_cv"] = cvs
            d2["n_source_videos"] = np.array(n)
            d2["cv_source"] = np.array("calibration")
            np.savez(tpath, **d2)
            out.update({"status": "written", "cv": detail})
            print(f"[校準] {exercise_key}/{view} 寫回模板（n={n}）")
            for lab, dd in detail.items():
                if dd.get("cv") is not None:
                    print(f"        {lab:<18}{dd['scores']}  CV={dd['cv']:.3f}"
                          f"  {'🚫 擋下' if dd.get('blocked') else '✅'}")
        return _json_safe(out)
    except Exception as e:
        logger.error(f"[calibrate] 失敗: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        try:
            os.remove(vid)
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════
# Multi-Exercise 影片分析 —— 核心邏輯 + 工作排程（非同步真實進度追蹤）
# ═══════════════════════════════════════════════════════════════════

# 進度工作儲存區（記憶體內）。job_id -> {status, percent, stage, result, error, ts}
_ANALYSIS_JOBS = {}
_ANALYSIS_JOBS_LOCK = threading.Lock()


def _json_safe(o):
    """把結構裡所有 NaN / Inf 換成 None，讓輸出是**合法 JSON**。

    【v7.2】為什麼需要總出口：
      Python 的 json.dumps 會產出 {"score": NaN}，看起來沒事，
      但瀏覽器的 JSON.parse 直接拋 "Unexpected token 'N'" —— 整包回應解不開，
      前端只會看到一個沒頭沒尾的錯誤，完全查不到根因。

      v7.2 加了「有效權重過低就不給分」之後，score_rep 會回傳 NaN，
      NaN 從此可能出現在 overallScore、per_rep_scores、avg_subs、
      radar、feedback…等好幾個地方。逐個補太容易漏（實測就漏了兩處），
      所以在回傳前統一過濾一次。
    """
    import math
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    try:
        import numpy as _np
        if isinstance(o, _np.floating):
            f = float(o)
            return None if (math.isnan(f) or math.isinf(f)) else f
        if isinstance(o, _np.integer):
            return int(o)
        if isinstance(o, _np.ndarray):
            return _json_safe(o.tolist())
    except Exception:
        pass
    return o


def _job_set(job_id, **kw):
    with _ANALYSIS_JOBS_LOCK:
        job = _ANALYSIS_JOBS.setdefault(job_id, {})
        job.update(kw)


def _job_get(job_id):
    with _ANALYSIS_JOBS_LOCK:
        job = _ANALYSIS_JOBS.get(job_id)
        return dict(job) if job else None


def _job_prune(max_age_sec=7200, max_keep=400):
    """清掉舊工作，避免記憶體無限累積。

    【v7.2】兩個修正：
      ① **絕不清掉還在跑的工作**。舊版只看時間戳，一支長影片處理超過
         30 分鐘就會被自己清掉，前端接著拿到 404「job not found」。
      ② TTL 從 30 分鐘拉到 2 小時，並改成「先按數量上限、再按時間」。
         實測跑 52 支要 20–30 分鐘，30 分鐘的 TTL 太貼近實際用量。

    仍然會 404 的情況只剩「後端在跑到一半時重啟」——那時整個字典都沒了，
    前端會自動重試（見 PoseValidationMobile 的 404 處理）。
    """
    now = time.time()
    with _ANALYSIS_JOBS_LOCK:
        # ① 過期：只清終端狀態（done / error），processing 一律保留
        stale = [k for k, v in _ANALYSIS_JOBS.items()
                 if v.get("status") in ("done", "error")
                 and now - v.get("ts", now) > max_age_sec]
        for k in stale:
            _ANALYSIS_JOBS.pop(k, None)
        # ② 數量上限：超過就從最舊的終端狀態開始清
        if len(_ANALYSIS_JOBS) > max_keep:
            done = sorted((k for k, v in _ANALYSIS_JOBS.items()
                           if v.get("status") in ("done", "error")),
                          key=lambda k: _ANALYSIS_JOBS[k].get("ts", 0))
            for k in done[:len(_ANALYSIS_JOBS) - max_keep]:
                _ANALYSIS_JOBS.pop(k, None)


VIDEO_EXTS = ('.mov', '.mp4', '.m4v', '.avi', '.mkv', '.webm')


def _mode_of(pairs, i):
    """建模的每支影片各自選了切割欄，取眾數當作這個模板的官方切割欄。"""
    from collections import Counter
    vals = [p[i] for p in pairs if p is not None]
    return Counter(vals).most_common(1)[0][0] if vals else (0 if i == 0 else False)


def _purge_upload(path):
    """刪掉單支暫存影片。分析完（或失敗）就不留檔案。"""
    try:
        if path and os.path.exists(path):
            os.remove(path)
            logger.info(f"[cleanup] 已刪除暫存影片: {os.path.basename(path)}")
    except Exception as e:
        logger.warning(f"[cleanup] 刪除失敗 {path}: {e}")


def purge_stale_uploads(max_age_sec=0):
    """清掉 UPLOAD_DIR 裡的殘留影片（只動影片，不碰頭貼/封面等圖片）。

    max_age_sec=0 → 全部清掉（後端啟動時呼叫，把上次沒清乾淨的殘留掃掉）。
    """
    removed, freed = 0, 0
    try:
        now = time.time()
        for fn in os.listdir(UPLOAD_DIR):
            if not fn.lower().endswith(VIDEO_EXTS):
                continue
            p = os.path.join(UPLOAD_DIR, fn)
            try:
                if max_age_sec and (now - os.path.getmtime(p)) < max_age_sec:
                    continue
                sz = os.path.getsize(p)
                os.remove(p)
                removed += 1; freed += sz
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"[cleanup] 掃描 {UPLOAD_DIR} 失敗: {e}")
    if removed:
        logger.info(f"[cleanup] 清掉 {removed} 支殘留影片，釋出 {freed / 1024 / 1024:.0f} MB")
    return removed, freed


def _perform_multi_exercise_analysis(vid_path, exercise_key, cfg, is_side_view,
                                     user_id, file_id, progress_cb=None, debug=False,
                                     view=None):
    """對單支使用者影片做完整分析，回傳前端結果 dict。

    progress_cb(percent:int, stage:str) —— 選填，逐階段回報真實進度。
    階段配比：載入模板 3% → 擷取骨架 5-50% → 切割 52% →
              評分 55-72% → 彙整 74% → AR 影片 76-98% → 儲存 99%。

    debug=True（測試模式）：額外回傳 result["debug"]，內含分階段耗時、
      主訊號原始/平滑序列與波峰、每 rep 每指標 raw_loss/scale/分數/可見度、
      DTW/對齊相關數據；並「不」寫入歷史，供論文驗收與圖表產生使用。
    """
    def _p(pct, stage):
        if progress_cb:
            try:
                progress_cb(int(max(0, min(100, pct))), stage)
            except _AnalysisCancelled:
                raise          # 使用者取消 → 一路往外丟，中止分析（不寫歷史）
            except Exception:
                pass

    # ── 測試模式計時與資料收集（debug=False 時完全不影響一般流程）──
    _c = time.perf_counter
    _t_start = _c()
    _ts = {}
    _dbg_reps = []
    _gate_info = {}          # 【v9.3】三道關卡的判定，正式路徑也要有

    _p(3, "載入動作模板")
    tpath = _template_path(exercise_key, view)
    td = np.load(tpath, allow_pickle=True)
    template = td["template"]
    con_len = int(td["con_len"])
    ecc_len = int(td["ecc_len"])
    # 【v5.0】模板自身的 rep 間變異；舊模板 npz 沒有這個 key → None → 退回舊尺度
    tpl_sd = td["tpl_sd"] if "tpl_sd" in td.files else None
    # 【v8.8】教練量測值的中位數與 MAD。有這個 key 就走量測值空間評分
    #   （只減一次、分母有物理量綱）；沒有代表是舊模板，退回差值空間。
    tpl_val = td["tpl_val"] if "tpl_val" in td.files else None
    if tpl_val is None:
        logger.warning("[multi-exercise] 舊模板沒有 tpl_val → 退回差值空間評分（建議重建模板）")
    # 【v5.7】模板建模時實際用的切割欄（舊模板沒有這個 key → None → 沿用 cfg）
    # 【v5.9】機位層級的可用指標集 —— 塞進 cfg 讓 score_rep 用同一組，
    #   該機位所有影片的計分指標才會一致、SD 與效度差才可解讀。
    # 【v6.2】C 機位在建模時判定出的實際等效機位 —— 受測要用同一個，
    #   計次訊號、可測性表才會跟建模一致。
    # 【v8.4】自選機位（C 機位）：宣告的是 oblique_45 或未指定，建模時會被
    #   解析成一個等效機位代號。解析對「量得到什麼」有效，但**效度驗證不得繼承**
    #   —— 照指示架的正面 0° 抓得到膝內夾（掉 31.4 分），自己架的 45° 抓不到
    #   （只掉 5.7 分）。所以先把「這是不是自己架的」記下來。
    _free_placement = str(view or "") in ("", "oblique_45", "None")
    if "resolved_view" in td.files:
        try:
            _rv = str(td["resolved_view"].item() if td["resolved_view"].shape == ()
                      else td["resolved_view"])
            if _rv and _rv != str(view):
                logger.info(f"[multi-exercise] 自選機位沿用建模判定：{view} → {_rv}"
                            f"（效度驗證不繼承）")
                view = _rv
        except Exception:
            pass
    if _free_placement:
        cfg = dict(cfg); cfg["_free_placement"] = True
    if "usable_metrics" in td.files:
        try:
            _um = [str(x) for x in td["usable_metrics"].tolist()]
            if _um:
                cfg = dict(cfg); cfg["_usable_metrics"] = _um
                logger.info(f"[multi-exercise] 套用機位可用指標集 {len(_um)}/{len(cfg['metric_labels'])}：{_um}")
        except Exception:
            pass
    # 【v8.6】把建模時量到的骨長判定帶進 score_rep。
    #   用**建模**的骨長而不是受測影片自己的，理由跟 usable_metrics 一樣：
    #   逐支判定會讓同一組影片的計分基準跳動，重測信度與效度就不可解讀了。
    #   受測影片自己的骨長另外算，只用來在報告上解釋「你這次哪一側被擋」。
    if "bone_lengths" in td.files:
        try:
            _bl_tpl = json.loads(str(td["bone_lengths"].item()
                                     if td["bone_lengths"].shape == () else td["bone_lengths"]))
            if _bl_tpl:
                _bd = multi_exercise.measurability.bone_gate(
                    exercise_key, cfg["metric_labels"], _bl_tpl)[2]
                if _bd.get("bad_bones"):
                    cfg = dict(cfg)
                    cfg["_bone_gate_blocking"] = True
                    cfg["_bone_gate_note"] = "、".join(
                        f"{b} 左右差 {v['asym']:.0%}" for b, v in _bd["bad_bones"].items())
                    logger.warning(f"[multi-exercise] 骨長關卡：{cfg['_bone_gate_note']}"
                                   f"（{_bd['bad_sides']} 側重建失敗）")
        except Exception as _e:
            logger.warning(f"[multi-exercise] 讀取模板骨長失敗（略過此關卡）: {_e}")
    # 【v8】建模階段實測的重測信度（≥3 支同機位影片才算得出來）。
    #   有實測就以實測為準，沒有 score_rep 會退回 RELIABILITY_CV 驗證表。
    if "metric_cv" in td.files:
        try:
            _cvv = td["metric_cv"].tolist()
            _mlabs = list(cfg.get("metric_labels") or [])
            _cvd = {_mlabs[i]: float(_cvv[i]) for i in range(min(len(_mlabs), len(_cvv)))
                    if _cvv[i] is not None and float(_cvv[i]) == float(_cvv[i])}
            if _cvd:
                cfg = dict(cfg); cfg["_metric_cv"] = _cvd
                logger.info(f"[multi-exercise] 套用實測重測信度 CV："
                            + ", ".join(f"{k}={v:.2f}" for k, v in sorted(_cvd.items(), key=lambda t: t[1])))
        except Exception:
            pass
    # 【v8.3】建模影片支數 —— 決定實測 CV 是「直接採信」還是「只用來否決」。
    #   2 支只有 1 個自由度，沒有檢定力確認穩定，但足以否決明顯不穩（單尾）。
    try:
        _nsv = int(td["n_source_videos"]) if "n_source_videos" in td.files else None
        if _nsv:
            cfg = dict(cfg); cfg["_n_source_videos"] = _nsv
    except Exception:
        pass
    # 【v8.7】CV 的來源。'calibration' 代表這份 CV 是用**獨立的**標準動作影片
    #   量出來的（沒參與建模、沒影響尺規），因此不受「自己評自己永遠正常」
    #   的循環性影響，可以直接採信。沒有這個鍵就是舊模板的建模自估版本。
    try:
        if "cv_source" in td.files:
            _cvs = str(td["cv_source"].item() if td["cv_source"].shape == ()
                       else td["cv_source"])
            if _cvs:
                cfg = dict(cfg); cfg["_cv_source"] = _cvs
                logger.info(f"[multi-exercise] 重測信度來源：{_cvs}"
                            f"（{_nsv} 支）→ {'直接採信' if _cvs == 'calibration' else '需 n≥3'}")
    except Exception:
        pass
    _tpl_seg_col, _tpl_seg_inv = None, False
    if "seg_col" in td.files:
        try:
            _raw = str(td["seg_col"].item() if td["seg_col"].shape == () else td["seg_col"])
            _tpl_seg_col = _raw if not _raw.lstrip('-').isdigit() else int(_raw)
            _tpl_seg_inv = bool(td["seg_invert"]) if "seg_invert" in td.files else False
        except Exception:
            _tpl_seg_col = None
    if tpl_sd is None:
        logger.warning(
            f"[{exercise_key}] 模板沒有 tpl_sd，改用舊的 scoring_scales 魔術常數計分。"
            f" 請重建模板以啟用 v5.0 的 z-score 計分。")
    # 【v5.0】機位代號。沒送就用舊 bool 推，但那只是相容層、不是正確答案。
    if view is None:
        view = multi_exercise.measurability.legacy_view(bool(is_side_view), exercise_key)
    _ts['load'] = _c()

    # ── 1. 擷取骨架特徵（5% → 50%）──────────────────────────────
    # 【v5.8】建模與受測必須用**同一組門檻**。舊版受測時把門檻放寬成 .45/.35，
    #   建模卻用 cfg 原值 → 同一支影片在兩個階段抓到的關節數不同，模板與受測
    #   的特徵基礎就不一致了。遮擋問題已由 auto_bilateral（切割）與 bilateral
    #   收斂（評分）處理，不需要再靠放寬門檻硬撈遠側的幻覺點位。
    body_thr  = cfg["body_thr"]
    joint_thr = cfg["joint_thr"]

    def _extract_cb(d):
        _p(5 + int(d.get("percent", 0) * 0.45), "擷取骨架特徵")

    # 【v5.2】把機位往下傳到特徵抽取層：有些指標（臥推前臂垂直）在不同機位
    #   必須算**不同的分量**，因為單目鏡頭只有一個水平軸是可信的。
    feats, confs, fps, landmarks = cfg["extract_fn"](
        vid_path, body_thr=body_thr, joint_thr=joint_thr, progress_cb=_extract_cb,
        view=view
    )
    if feats.size == 0:
        raise ValueError("讀不到這支影片的畫面。請確認是一般的 MP4 / MOV 影片，再重拍一次。")
    # 整支影片沒有任何一幀抓到人 → 講清楚，而不是丟一個「切不出次數」讓人以為是動作問題
    if np.all(np.isnan(np.asarray(feats, dtype=float))):
        raise ValueError("畫面中沒有偵測到人。請讓全身完整入鏡、光線充足，再拍一次。")
    _ts['extract'] = _c()

    # 【v9.0】從骨架反推這支影片的實際相機姿態，塞進 cfg 供效度關卡使用。
    #   效度宣告從此綁在**量出來的角度**上，不再綁「宣告的機位代號」——
    #   代號本來就是猜的（自選機位由左右可見度比歸類，正面/俯視/斜前上方
    #   的比值都 ≈1.0，分不出來），而角度是物理事實。
    #   實測依據：偏 20.3° / 27.7° 仍抓得到目標錯誤，偏 63.6° 只剩連帶效應。
    try:
        _cp = metrology.camera_pose(landmarks)
        if _cp and _cp.get("azimuth_deg") is not None:
            cfg = dict(cfg)
            cfg["_measured_pose"] = (_cp["azimuth_deg"], _cp.get("elevation_deg") or 0.0)
            _pg0 = multi_exercise.measurability.pose_gate(
                exercise_key, view, cfg["_measured_pose"])
            if _pg0.get("offset_deg") is not None:
                logger.info(f"[multi-exercise] 相機角度 方位 {_cp['azimuth_deg']:.1f}° "
                            f"仰角 {_cp.get('elevation_deg', 0):.1f}° → 離已驗證位置 "
                            f"{_pg0['offset_deg']:.1f}°（容差 {_pg0['tol']:.0f}°）"
                            f"→ {'效度適用' if _pg0['ok'] else '效度不適用'}")
    except Exception as _e:
        logger.warning(f"[multi-exercise] 相機姿態量測失敗（退回機位代號判斷）: {_e}")

    # ── 2. 平滑 + 切割動作週期（52%）────────────────────────────
    #   用 segment_repetitions_auto：主訊號（segment_signal_idx）所依賴的關節
    #   被裁切 / 低可見度而整欄失效時，自動改用其他還在擺盪的欄計次，
    #   避免「骨架有抓到、卻只切出 1 rep」。
    _p(52, "訊號平滑與動作切割")
    fs = multi_exercise.apply_smoothing(feats, fps)
    _ml = cfg.get("metric_labels", [])
    _nan_ratio = np.isnan(feats).mean(axis=0)
    logger.info("[multi-exercise] 各欄 NaN 比例: " + ", ".join(
        f"{_ml[i] if i < len(_ml) else i}={_nan_ratio[i]*100:.0f}%"
        for i in range(feats.shape[1])))
    # 【v5.7】強制用「模板建模時所使用的切割欄」，不要讓受測自己再選一次 ——
    #   兩邊選到不同欄時，rep 的相位是用不同訊號切出來的，比對必然失真。
    _cfg_seg = cfg
    if _tpl_seg_col is not None:
        _cfg_seg = dict(cfg)
        _cfg_seg["segment_signal_idx"] = _tpl_seg_col
        _cfg_seg["segment_invert"] = _tpl_seg_inv
    # 【v6.4】把「模板認為一下有多長」傳進去當驗收條件。
    #   計次訊號是幾何推論挑的，推論可能錯 —— 而且錯得很安靜：
    #   臥推自選機位的雙肘間距一個 rep 走兩個週期，5 下切成 10 下，
    #   每一下都很規律（CV 0.10，比正確答案還漂亮），光看 CV 分不出來。
    #   模板是建模時數對的，con_len+ecc_len 就是外部參照。
    #   實測 40 支：健康的五組是 0.94–1.08 倍，壞掉的那組 0.45 倍。
    _expected_rep_len = int(con_len) + int(ecc_len)
    # 【v6.4】把可見度傳進計次 —— 不能拿 MediaPipe 對遮擋肢體腦補的假訊號來數次數
    # ⚠️ 同上：計次候選的可見度篩選要用原始的 8 關節 confs
    _mv_for_seg = multi_exercise.compute_metric_visibility(exercise_key, confs)
    _jc_for_seg = confs   # 8 關節原始值，給計次候選用
    reps, seg_col, seg_inv = multi_exercise.segment_repetitions_auto(
        fs, fps, _cfg_seg, landmarks=landmarks, view=view,
        expected_rep_len=_expected_rep_len, metric_vis=_mv_for_seg,
        joint_confs=_jc_for_seg)
    _med_len = (float(np.median([r["end_frame"] - r["start_frame"] for r in reps]))
                if reps else 0.0)
    logger.info(f"[multi-exercise] 切割結果: {len(reps)} reps "
                f"(實際用第 {seg_col} 欄, invert={seg_inv}, "
                f"模板切割欄={_tpl_seg_col}, cfg 主訊號={cfg['segment_signal_idx']}, "
                f"一下 {_med_len:.0f} 幀 = 模板的 {_med_len / max(_expected_rep_len, 1):.2f} 倍)")
    if not reps:
        raise ValueError("沒有切出完整的動作次數。請至少做 3 下完整反覆，"
                         "並確認動作全程都在畫面內（蹲到最低點也不能出框）。")
    # 【v7】計次信心度往下傳 —— 切錯了分數必然是垃圾，不能照樣給一個數字
    _count_conf = (reps[0].get("count_confidence") or "unknown") if reps else "unknown"
    _count_consensus = reps[0].get("count_consensus") if reps else None
    if _count_conf == "low":
        logger.warning(f"[multi-exercise] ⚠️ 計次信心度低（候選共識 {_count_consensus}）"
                       f" → 這支的分數與次數都應標記為不可信")

    # 【v5.9】計次訊號健康度 —— 切割用的那一欄如果本身活動範圍就不足，
    #   切出來的次數是拿雜訊硬切的，不能當數字用。
    #   典型案例：臥推正上方俯視，手臂上下推的方向正對鏡頭，肘角在投影上
    #   幾乎退化（實測 ROM 只有 13–27°，解剖下限 28°），5 下被切成 9 下。
    _seg_ok, _seg_why, _seg_rom = True, "", None
    try:
        _sig_col = (fs[:, seg_col] if isinstance(seg_col, (int, np.integer))
                    else multi_exercise.primary_signal_of(fs, _cfg_seg)[0])
        _seg_rom = float(np.nanmax(_sig_col) - np.nanmin(_sig_col))
        _seg_lab = (cfg["metric_labels"][seg_col]
                    if isinstance(seg_col, (int, np.integer)) and seg_col < len(cfg["metric_labels"])
                    else str(seg_col))
        _seg_ok, _seg_why = multi_exercise.measurability.check_signal_health(
            exercise_key, _seg_lab, _sig_col)
        if not _seg_ok:
            logger.warning(f"[multi-exercise] ⚠️ 計次不可信：切割訊號 {_seg_lab} {_seg_why}"
                           f"（此機位量不到這個動作平面，次數僅供參考）")
    except Exception:
        pass
    _ts['segment'] = _c()

    # ── 3. 逐次評分（55% → 72%）─────────────────────────────────
    ml = cfg["metric_labels"]
    scores, all_subs = [], []
    user_reps = []

    # 【v5.0】使用者自己的向心/離心比：必須在重採樣**之前**先記下原始幀數，
    #   下面的 resample_to_length 會把每個 rep 拉成模板長度（con_len/ecc_len），
    #   之後就再也還原不出真實節奏了。舊版就是漏了這一步，才會直接拿模板的
    #   con_len/ecc_len 去報告「使用者的向心比」。
    _user_con_ratio_per_rep = []
    for _r in reps:
        _c1, _c2 = len(_r["phase1"]), len(_r["phase2"])
        if _c1 + _c2 > 0:
            _user_con_ratio_per_rep.append(round(_c1 / (_c1 + _c2), 3))
    _user_con_ratio_mean = (round(float(np.mean(_user_con_ratio_per_rep)), 3)
                            if _user_con_ratio_per_rep else None)

    for i, r in enumerate(reps):
        start, end = r["start_frame"], r["end_frame"]
        
        # 取得該 rep 區間的原始關節信心度並轉換為指標信心度
        user_rep_joint_confs = confs[start:end, :]
        rep_metric_visibility = multi_exercise.compute_metric_visibility(exercise_key, user_rep_joint_confs)
        
        p1 = multi_exercise.resample_to_length(r["phase1"], con_len)
        p2 = multi_exercise.resample_to_length(r["phase2"], ecc_len)
        user_rep = np.vstack((p1, p2))
        user_reps.append(user_rep)
        
        # 對齊模板長度 (Resample)
        target_len = len(template)
        if rep_metric_visibility is not None:
            metric_vis_resampled = multi_exercise.resample_to_length(rep_metric_visibility, target_len)
        else:
            metric_vis_resampled = None

        # 【v5.5】測試模式一律走 raw_mode：所有指標在所有機位都照算，
        #   這樣 (指標 × 機位) 才有可比較的數值。產品端（debug=False）
        #   維持機位 gating —— 那裡的目的不是比較，是不要給使用者假回饋。
        #
        # ══ 【v9.3】正式路徑也必須收關卡判定 ═══════════════════════════
        #   舊版 debug=False 時傳 out=None，score_rep 就不寫 final_weights /
        #   scored_metrics。而下游用 `final_weights` 反推「哪些指標權重被歸零」：
        #       _fw = _dbg_reps[0].get("final_weights") or {}
        #   拿到空 dict → 判定**每一個**基礎權重 >0 的指標都被歸零 →
        #   七項全部標成「量不到」、radar 全空、scoredMetrics 是空陣列，
        #   但 overall_score 照算 → 畫面同時出現「97 分」與「沒有任何指標
        #   通過三道關卡」。這是使用者實際遇到的問題的根因。
        #
        #   out 只是一個小 dict（權重表 + 標籤），沒有效能成本，
        #   raw_mode 才是真正只該在測試模式開的東西。
        _score_dbg = {"raw_mode": True} if debug else {}
        s, subs = multi_exercise.score_rep(
            user_rep=user_rep,
            template=template,
            cfg=cfg,
            is_side=is_side_view,
            metric_visibility=metric_vis_resampled,
            out=_score_dbg,
            view=view,                      # 【v5.0】明確機位，取代 bool
            tpl_sd=tpl_sd,                  # 【v5.0】以模板自身變異為評分尺度（舊路徑）
            tpl_val=tpl_val,                # 【v8.8】量測值空間的錨點與刻度（主路徑）
            exercise_key=exercise_key,
        )
        scores.append(s)
        all_subs.append(subs.tolist())

        # 【v9.3】關卡判定每個 rep 都一樣（指標集是機位層級決定的），
        #   留最後一次即可。這是產品端唯一的來源，不能只在 debug 收。
        _gate_info = _score_dbg or {}

        # ── 測試模式：收集每 rep 每指標的 raw_loss / scale / 分數 / 可見度 ──
        if debug:
            _rep_dbg = {
                "rep": i + 1, "score": round(float(s), 2), "metrics": [],
                # 【v4.8】這三個是判讀「為什麼做錯反而高分」的關鍵：
                #   measured_ratio 遠小於 1 = 大半權重因為拍不到而被丟掉，
                #   剩下少數指標重新正規化撐起全部分數 → 錯誤指標零扣分。
                "measured_ratio": _score_dbg.get("measured_ratio"),
                "final_weights": _score_dbg.get("final_weights"),
                "dropped_metrics": [f'{n}：{why}' for n, why in _score_dbg.get("dropped", [])],
                # 【v5.0】機位 gating 的完整交代 —— 論文要能回答
                #   「這一分是用哪幾個指標算的、哪幾個因為機位而放棄」
                "unmeasurable": [f'{n}：{why}' for n, why in _score_dbg.get("unmeasurable", [])],
                # 【v5.3】遠側肢體被合併掉的紀錄（幻覺點位的主要來源）
                "collapsed_bilateral": _score_dbg.get("collapsed_bilateral"),
                "view": _score_dbg.get("view"),
                "view_quality": _score_dbg.get("view_quality"),
                "view_factors": _score_dbg.get("view_factors"),
                "scale_mode": _score_dbg.get("scale_mode"),
                "form_score": _score_dbg.get("form_score"),
                "deductions": _score_dbg.get("deductions"),
                # measured_ratio < 0.70 時分數不該被當成有效觀測值進統計
                "score_trustworthy": _score_dbg.get("score_trustworthy"),
            }
            for j in range(len(ml)):
                _col = user_rep[:, j]
                if np.isnan(_col).all():
                    _rl = None
                    _wl = None
                else:
                    _rl = float(np.nanmean(np.abs(_col - template[:, j])))
                    _wl = round(_rl * float(cfg["scoring_scales"][j]), 3)
                _vis = (float(np.nanmean(metric_vis_resampled[:, j]))
                        if metric_vis_resampled is not None else None)
                # 【v5.0】raw_loss 這裡記的是 |使用者 − 模板| 的平均，但 score_rep
                #   實際計分時對 lower_better / higher_better 的指標會先 clip 掉
                #   「往好的方向」那一半。舊版 debug 沒交代這件事，於是出現
                #   raw_loss 8.04 卻 sub_score 99.71、raw_loss 4.32 反而 96.24
                #   這種看起來像壞掉的紀錄。這裡把方向性損失也一起輸出。
                _dir = cfg.get("metric_directions", {}).get(ml[j], "both")
                if _rl is None:
                    _dl = None
                else:
                    _d = _col - template[:, j]
                    if _dir == "lower_better":
                        _d = np.clip(_d, 0, None)
                    elif _dir == "higher_better":
                        _d = np.clip(-_d, 0, None)
                    else:
                        _d = np.abs(_d)
                    _dl = round(float(np.nanmean(_d)), 4)
                _med_j, _mad_j = multi_exercise._unpack_tpl_sd(tpl_sd, j)
                _rep_dbg["metrics"].append({
                    "label": ml[j],
                    "raw_loss": (None if _rl is None else round(_rl, 4)),
                    "directional_loss": _dl,          # 【v5.0】實際拿去計分的偏差
                    "direction": _dir,
                    # 【v5.1】教練自己那幾下的典型偏差（z 的錨點）與其 MAD（z 的刻度）
                    "template_dev_median": (None if _med_j is None else round(_med_j, 4)),
                    "template_dev_mad": (None if _mad_j is None else round(_mad_j, 4)),
                    # 【v5.1】z = (使用者偏差 − 教練典型偏差) / MAD，下限 0。
                    #   z = 0 代表「你偏離模板的量跟教練自己一樣」→ 滿分。
                    "z": (None if (_dl is None or not _mad_j)
                          else round(max(0.0, (_dl - (_med_j or 0.0)) / _mad_j), 3)),
                    "view_factor": (_score_dbg.get("view_factors") or {}).get(ml[j]),
                    "scale": float(cfg["scoring_scales"][j]),
                    "weighted_loss": _wl,
                    # 未量測記 None（不是 0）—— 記 0 會在散點圖上變成一排假點
                    "sub_score": (None if np.isnan(subs[j]) else round(float(subs[j]), 2)),
                    "visibility": (None if _vis is None else round(_vis, 3)),
                    "weight": (_score_dbg.get("final_weights") or {}).get(ml[j]),
                })
            _dbg_reps.append(_rep_dbg)

        _p(55 + int((i + 1) / len(reps) * 17), "比對教練標準動作")

    _ts['score'] = _c()

    # ── 3a. 每一 rep 的「主要修正提示」（供前端 AR Coach 右上角顯示）─────
    #   找出該 rep 分數最低的那一個指標，配上 tips 表給的中文標題作為徽章文字。
    rep_corrections = []
    tips_map = cfg.get("tips", {})
    for i, subs_list in enumerate(all_subs):
        # 略過被遮蔽（score=0 且權重歸零的情況不算問題）
        valid = [(idx, sc) for idx, sc in enumerate(subs_list)
                 if not np.isnan(user_reps[i][:, idx]).all()]
        if not valid:
            rep_corrections.append(None)
            continue
        worst_idx, worst_score = min(valid, key=lambda x: x[1])
        worst_label = ml[worst_idx]
        tip = tips_map.get(worst_label)
        # tips 結構：(中文短標題, 問題描述, 修正方式)
        title_zh = tip[0] if tip else worst_label
        desc_zh  = tip[1] if tip else ""
        fix_zh   = tip[2] if tip else ""
        rep_corrections.append({
            "rep": i + 1,
            "metric_key": worst_label,
            "title_zh": title_zh,
            "score": round(float(worst_score), 1),
            "desc_zh": desc_zh,
            "fix_zh": fix_zh,
            # severity: 0=Good (>=80), 1=Watch (60-80), 2=Fix (<60)
            "severity": (0 if worst_score >= 80
                         else 1 if worst_score >= 60 else 2),
        })

    # ── 3b. 判定「整段被遮蔽」的指標（每一次 rep 該欄都全 NaN）──────
    #   被遮蔽 = 該側肢體因視角全程偵測不到。這些指標：不畫圖（避免假零線）、
    #   不列為弱項、不計入評分權重（score_rep 已把權重歸零）。
    occluded_flags = [
        all(np.isnan(ur[:, m]).all() for ur in user_reps)
        for m in range(len(ml))
    ]

    # ── 3c. 圖表資料（遮蔽指標 → None）──────────────────────────
    # 【FIX 2026-05】user_curve 保留 NaN（不要補 0）—— 否則整段被遮蔽時圖表會畫出
    #   一條假的水平零線，看起來像「動作完全沒做」。前端 recharts 已開 connectNulls，
    #   user 值是 None 時會跳過該點、不畫成 0。expert 仍走原本補 0（教練模板沒有遮蔽）。
    chart_data_per_rep = []
    for user_rep in user_reps:
        chart_data = {}
        for m_idx, metric in enumerate(ml):
            if occluded_flags[m_idx]:
                chart_data[metric] = None          # 整支影片該指標全程被遮蔽
                continue
            user_curve = multi_exercise.fill_nan_numpy(
                user_rep[:, m_idx][:, None], fill_value_for_all_nan=None
            )[:, 0]
            expert_curve = multi_exercise.fill_nan_numpy(
                template[:, m_idx][:, None], fill_value_for_all_nan=0.0
            )[:, 0]

            # 內插時保留 NaN：把 user_curve 的 NaN mask 帶到 x_tgt 上
            x_orig = np.linspace(0, 100, len(user_curve))
            x_tgt = np.linspace(0, 100, 100)

            valid_mask = np.isfinite(user_curve)
            if valid_mask.any():
                f_u = np.interp(x_tgt, x_orig[valid_mask], user_curve[valid_mask])
                # 重新覆蓋上 NaN：原本 NaN 區段對應的 x_tgt 點仍標 NaN
                nan_runs = ~valid_mask
                if nan_runs.any():
                    nan_xs = x_orig[nan_runs]
                    # 對 x_tgt 每個點，若它落在原始 NaN 區段最近的範圍 → 設為 NaN
                    for j in range(len(x_tgt)):
                        if np.min(np.abs(nan_xs - x_tgt[j])) < (100.0 / max(1, len(user_curve))) * 0.5:
                            f_u[j] = np.nan
            else:
                f_u = np.full_like(x_tgt, np.nan, dtype=float)

            f_e = np.interp(x_tgt, x_orig, expert_curve)

            chart_data[metric] = [
                {
                    "frame": int(x_tgt[j]),
                    # NaN → None：JSON 安全 + 前端 recharts connectNulls 會跳過
                    "user": (None if not np.isfinite(f_u[j]) else float(f_u[j])),
                    "expert": float(f_e[j]),
                }
                for j in range(100)
            ]
        chart_data_per_rep.append(chart_data)

    # ── 4. 彙整評分 / 雷達 / 建議（74%）─────────────────────────
    _p(74, "彙整評分與建議")
    # 【v7.1】score_rep 在「有效權重過低」時回傳 NaN（量不到就不給分）。
    #   全部 rep 都被作廢時 overall_score 也是 NaN —— 必須明確傳達
    #   「此機位不評分」，不能讓它悄悄變成 0 或 nan 混進統計。
    _all_void = bool(len(scores)) and not np.isfinite(np.asarray(scores, dtype=float)).any()
    overall_score = float(np.nanmean(scores)) if not _all_void else None
    _void_reason = None
    if _all_void:
        _void_reason = next((d.get("score_void_reason") for d in _dbg_reps
                             if d.get("score_void_reason")), None) \
            or (_score_dbg.get("score_void_reason") if isinstance(_score_dbg, dict) else None)
        logger.warning(f"[multi-exercise] 此機位不評分：{_void_reason}")
    # 【v8】三道關卡的結果（可測性 → 信度 → 效度範圍）。每個 rep 都一樣，
    #   因為指標集是機位層級決定的，取第一個有內容的即可。
    _v8 = next((d for d in _dbg_reps if d.get("scored_metrics") is not None),
               None) or _gate_info or {}
    avg_subs = np.nanmean(all_subs, axis=0)

    radar_data = []
    feedback_list = []
    occluded_labels = []
    # 【v4.7 平面×視角交叉比對】額狀面指標（如深蹲膝內塌、划船握距）在側面
    #   視角無效：MediaPipe 會腦補遠側肢體座標，算出來的是假分數。側面模式下
    #   這些指標與「被遮蔽」同等處理：雷達留空、不計權重、回饋明確說明原因。
    # 【v5.0】改用 measurability 查表，不再用 front_only_metrics + is_side_view。
    #   舊寫法在 2026-07-27 那批資料完全沒生效（is_side_view 恆為 False），
    #   於是「這個機位根本量不到」的指標照樣在雷達圖上顯示一個看起來很正常的分數。
    _mb = multi_exercise.measurability
    # ── 【v7】這裡是**第三道**先驗表閘，而且它跟實際計分不同步 ──────────────
    #   score_rep 裡的 view_factor 已經被「實測 gating 才是權威」修正過
    #   （_usable_metrics 裡的指標最低給 PARTIAL、不准歸零），
    #   但這一行直接又查了一次原始的 view_factor，沒有套同一個修正。
    #
    #   後果：卡片上顯示「Torso Lean 此機位量不到」，
    #   但 final_weights 裡它的權重是 0.295、sub_score 100 —— **它一直有在計分**。
    #   顯示與實際脫節，而且這個假訊息害我連續兩輪誤判「修正沒生效」。
    #
    #   修法：以**實際計分權重**為準。權重 > 0 就是有計分，不該說量不到。
    _usable_now = set(cfg.get("_usable_metrics") or ml)
    view_limited = {lab for i, lab in enumerate(ml)
                    if _mb.view_factor(exercise_key, lab, view) <= 0.0
                    and lab not in _usable_now}
    # 真正沒進計分的（權重被歸零），不管原因是什麼，都該讓使用者看見
    try:
        # 【v9.3】改讀 _gate_info —— _dbg_reps 只有測試模式才有內容，
        #   在正式分析拿到空 dict 會把所有指標誤判成「權重歸零」。
        _fw = (_dbg_reps[0].get("final_weights") if _dbg_reps else None) \
            or _gate_info.get("final_weights") or {}
        _base_w = cfg["scoring_weights"]
        # 只有真的拿到權重表才做這個反推；拿不到就什麼都不標記 ——
        # 空 dict 會讓每一項都符合「權重 <= 0」而被誤判成量不到。
        if _fw:
            _zeroed = {lab for i, lab in enumerate(ml)
                       if float(_base_w[i]) > 1e-6 and float(_fw.get(lab, 0.0)) <= 1e-6}
            view_limited |= _zeroed
    except Exception:
        pass
    for idx, label in enumerate(ml):
        is_view_limited = label in view_limited
        is_occ = occluded_flags[idx] or is_view_limited
        sc = float(avg_subs[idx])
        radar_data.append({
            "subject": label,
            "A": (None if is_occ else sc),
            "fullMark": 100,
            "occluded": is_occ,
        })
        if is_occ:
            occluded_labels.append(label)
            tip = cfg["tips"].get(label)
            feedback_list.append({
                "rep": 0,
                "type": "occluded",
                "title": tip[0] if tip else label,
                "desc": (f"目前機位（{_mb.VIEW_ZH.get(view, view)}）量不到這個指標，"
                         f"已排除不計分——不是你做得不好。換成建議機位再拍一次才評得出來。"
                         if is_view_limited else
                         "因拍攝角度，此側肢體被遮蔽，無法評估。"),
                "fix": ("若需此項回饋，請改用正面拍攝並關閉側面模式。"
                        if is_view_limited else
                        "若需此項回饋，請改用正面或另一側拍攝。"),
                "score": None,
            })
            continue
        if label in cfg["tips"]:
            tip = cfg["tips"][label]
            feedback_list.append({
                "rep": 0,
                "type": "success" if sc >= 70 else "error",
                "title": tip[0],
                "desc": tip[1] if sc < 70 else "Great job! Good form maintained.",
                "fix": tip[2] if sc < 70 else "Keep it up.",
                "score": sc
            })
    # 弱項排序：被遮蔽（score=None）的排到最後，不佔據「弱項」版位
    feedback_list.sort(key=lambda x: (x["score"] is None,
                                      x["score"] if x["score"] is not None else 999))
    # 【v8.6】骨長關卡：對這一支受測影片重跑一次，產出可解釋的診斷。
    #   跟建模端同一套規則（bone_gate），但這裡是**這支影片自己**的骨長，
    #   所以能回答「你這次拍的，哪一側被擋了、因此少了哪些指標」。
    _bone_gate_result = None
    try:
        _bl_now = metrology.bone_lengths(landmarks)
        _bkeep, _bwhy, _bdiag = _mb.bone_gate(exercise_key, ml, _bl_now)
        _bone_gate_result = {
            "passed": not _bdiag.get("bad_bones"),
            "checkedBones": _bdiag.get("checked") or [],
            "badBones": [
                {"bone": k, "asym": round(v["asym"], 4), "badSide": v["bad_side"],
                 "leftCm": round(v["left"] * 100, 1), "rightCm": round(v["right"] * 100, 1)}
                for k, v in (_bdiag.get("bad_bones") or {}).items()
            ],
            "droppedMetrics": _bwhy,
            "note": ("骨頭是物理常數，左右同名骨段應該等長。量到不等長代表該側座標是"
                     "模型推估出來的，不是看到的 —— 這比 MediaPipe 自評的可見度更硬。"),
        }
    except Exception as _e:
        logger.warning(f"[multi-exercise] bone_gate 失敗（不影響評分）: {_e}")

    _ts['agg'] = _c()

    # ── 5. AR 疊合回放影片（76% → 98%）──────────────────────────────
    #   使用者影片 ＋ 骨架 ＋ 逐幀對照教練標準（綠=沒問題、紅=偏誤側）。
    #   只在 App 正常分析（debug=False）產生；research 批次（debug=True，一次 52 支）
    #   跳過以免被拖慢。AR 失敗不影響評分（包在 try 裡）。
    ar_url = None
    try:
        if (not debug) and os.path.exists(vid_path) and reps:
            _p(80, "產生 AR 疊合回放")
            os.makedirs(RESULTS_DIR, exist_ok=True)
            # AR 不進歷史、只是暫時給結算頁看 → 清掉 2 小時前的舊 AR 檔，避免堆積佔空間。
            try:
                _now = time.time()
                for _f in os.listdir(RESULTS_DIR):
                    if _f.startswith("ar_") and _f.endswith(".mp4") and (_now - os.path.getmtime(os.path.join(RESULTS_DIR, _f)) > 7200):
                        os.remove(os.path.join(RESULTS_DIR, _f))
            except Exception:
                pass
            ar_filename = f"ar_{file_id or uuid.uuid4().hex[:12]}.mp4"
            ar_path = os.path.join(RESULTS_DIR, ar_filename)
            _ar_draw = ([int(x) for x in td["pose_draw_idx"]]
                        if ("pose_draw_idx" in getattr(td, "files", [])) else None)
            # 【v5.0】把每一下「最該修的指標」塞進 rep，AR 就能把提示畫在對應關節上
            _CUE_KIND = {"Knee Valgus": "valgus", "Hip Depth": "depth",
                         "Elbow Flare": "flare", "Grip Width": "grip"}
            try:
                for _i, _r in enumerate(reps):
                    _c = (rep_corrections or [])[_i] if _i < len(rep_corrections or []) else None
                    if _c and _c.get("severity", 0) > 0:
                        _k = _CUE_KIND.get(_c.get("metric_key") or "")
                        if _k:
                            _r["_cue"] = {"kind": _k, "label": _c.get("title_zh"),
                                          "fix": _c.get("fix_zh")}
            except Exception as _ce:
                logger.warning(f"[AR] 就地提示標記略過: {_ce}")
            _ar_ok = generate_ar_overlay_from_landmarks(
                vid_path, ar_path, reps, template, fps, landmarks,
                progress_cb=lambda pc: _p(80 + int(pc * 0.17), "產生 AR 疊合回放"),
                draw_idx=_ar_draw)
            if _ar_ok is not False and os.path.exists(ar_path):
                ar_url = f"/static/results/{ar_filename}"
                logger.info(f"[multi-exercise] AR 疊合回放已產生: {ar_filename}")
    except Exception as _are:
        logger.warning(f"[multi-exercise] AR 產生失敗（不影響評分）: {_are}")
    # 清理原始上傳影片（AR 已從中生成、或本次不需要 AR）
    try:
        _p(98, "清理暫存影片")
        if os.path.exists(vid_path):
            os.remove(vid_path)
            logger.info(f"[multi-exercise] 已刪除原始影片: {vid_path}")
    except Exception as del_err:
        logger.warning(f"[multi-exercise] 刪除影片失敗: {del_err}")

    # ── 6. 寫入歷史（99%）──────────────────────────────────────
    _p(99, "儲存分析結果")
    try:
        duration = int(len(feats) / fps) if fps else 0
    except Exception:
        duration = 0

    # 每個 rep 的起訖秒數 —— 供 AR 回放影片做即時計次（第幾個 rep）
    safe_fps = fps if fps else 30.0
    rep_segments = [
        {
            "rep": i + 1,
            "startSec": round(r["start_frame"] / safe_fps, 2),
            "endSec": round(r["end_frame"] / safe_fps, 2),
        }
        for i, r in enumerate(reps)
    ]

    # 【v5.5】從骨架量出實際機位角度（0°=額狀面正對、90°=矢狀面正對）
    # 【v5.8】改用「左右肢體活動範圍比」判斷機位，不再猜幾何角度 ——
    #   幾何法要靠 world z 與軀幹長當尺規，兩者在單目下都不穩，實測三種機位
    #   全被判成 ~55°。活動範圍比直接量「這個機位遮住了什麼」，才是我們要的。
    _mv_all = multi_exercise.compute_metric_visibility(exercise_key, confs)
    _bv = multi_exercise.measurability.bilateral_visibility(fs, cfg, metric_vis=_mv_all)
    _view_deg = multi_exercise.measurability.estimate_view_angle(landmarks)  # 保留當參考
    _view_cls = (_bv or {}).get("view")
    if _bv:
        logger.info(f"[multi-exercise] 機位判定：左右活動範圍比 {_bv['ratio']:.2f} → {_view_cls}"
                    + (f"（{_bv['occluded_side']} 被遮擋，{_bv['ranges']}）" if _bv.get('occluded_side') else ""))

    # 【v5.5】取景檢查：關節被裁出畫面時該指標整段是空的，但分數照樣算得出來
    #   （剩下的權重重新正規化）。特別要抓「動作極值才出框」——深蹲站直時全身
    #   都在、蹲到底腳掌卻被裁掉，看平均完全正常。
    _framing = multi_exercise.measurability.check_framing(landmarks, exercise_key)
    if _framing and _framing.get("in_frame_ratio", 1.0) < 0.9:
        logger.warning(f"[multi-exercise] ⚠️ 取景不足：只有 "
                       f"{_framing['in_frame_ratio']:.0%} 的幀全身在框內，"
                       f"最常出框：{_framing.get('worst')} {_framing.get('joints')}")

    # 【v4.8】回報次數 ≠ 評分用的循環數：頭尾兩個「半下」合起來是一下，
    #   被濾掉之後要補回來，否則「底→頂→底」拍法會少算一下。見 count_reps()。
    rep_count = multi_exercise.count_reps(reps)

    motion_record = build_motion_record(
        exercise_key, cfg["name"], overall_score, radar_data,
        rep_count, chart_data_per_rep, feedback_list,
        ar_url=ar_url, duration_seconds=duration, rep_segments=rep_segments)
    # 【AR】黃金骨架（模板）＋使用者骨架（本次）＋該機位可畫點位 → 供 AR 疊合
    _golden_pose = None; _user_pose = None; _pose_idx = None
    try:
        if "pose_seq" in td.files and getattr(td["pose_seq"], "size", 0) > 0:
            _golden_pose = td["pose_seq"]
        if "pose_draw_idx" in td.files:
            _pose_idx = [int(x) for x in td["pose_draw_idx"]]
        _user_pose = multi_exercise.build_pose_trajectory(
            [multi_exercise.pose_rep_slice(landmarks, r) for r in reps], int(con_len), int(ecc_len))
    except Exception as _pe:
        logger.warning(f"[multi-exercise] 骨架軌跡失敗（不影響分析）: {_pe}")

    def _pose_json(a):
        if a is None:
            return None
        return [[[None if (float(x) != float(x)) else round(float(x), 4) for x in pt] for pt in fr] for fr in a]

    # 【v9.3】關卡判定要等 _result 組好才有，所以歷史寫入延到下面（見 _persist）

    _result = {
        "session_id": motion_record["session_id"],
        # 【AR】可拖移疊合回放：黃金骨架、使用者骨架、該機位要畫的 landmark 索引
        "goldenPose": _pose_json(_golden_pose),
        "userPose": _pose_json(_user_pose),
        "poseDrawIdx": _pose_idx,
        "exerciseKey": exercise_key,
        "exerciseName": cfg["name"],
        # 【機位】以前只存在 debug.meta.view 裡，正式流程（不帶 debug）拿不到，
        #   結果頁只好退回 spec 的主機位 —— 使用者明明用側面拍，畫面卻宣告
        #   「正面 0° 抓得到膝蓋內夾」。效度宣告錯了比沒有更糟，所以放到頂層。
        "view": view,
        # 【v7.2】不給分時是 None，不能硬轉 float
        "overallScore": (None if overall_score is None else float(overall_score)),
        "metrics": radar_data,
        "chartsData": chart_data_per_rep,
        "concentricFrames": int((con_len / (con_len + ecc_len)) * 100),
        "feedback": feedback_list,
        "fatigueData": [{"rep": i + 1, "score": float(s)} for i, s in enumerate(scores)],
        "arVideoUrl": ar_url,
        "occludedMetrics": occluded_labels,
        # 【v7.1】分數作廢旗標：量不到的指標太多，算出來的分數會系統性偏高
        "scoreVoid": bool(_all_void),
        "scoreVoidReason": _void_reason,
        # 【v8】三道關卡的結果，前端／論文都直接用這幾個欄位
        #   scoredMetrics      實際計入分數的指標（過了「量得到」+「量得準」）
        #   reliability        每個指標的重測 CV 與來源
        #   detectableErrors   這個機位抓得到哪些錯誤
        #   undetectableErrors 抓不到哪些、缺什麼指標 ← 使用者最需要看到的
        "scoredMetrics": _v8.get("scored_metrics") or [],
        "reliability": _v8.get("reliability") or {},
        "detectableErrors": _v8.get("detectable_errors") or [],
        "undetectableErrors": _v8.get("undetectable_errors") or [],
        "repSegments": rep_segments,
        "repCount": rep_count,
        # 【v7】計次信心度：候選訊號的共識程度。低信心 = 這支的次數與分數都不可信
        "countConfidence": _count_conf,
        # 【v8.2】計次可信度：由 40 支實測的「機位 × 計次正確率」決定，
        #   再用這支影片的候選共識往下修。臥推俯視/正側面是投影幾何的
        #   必然限制（推的方向正對鏡頭 / 躺姿遮擋），不是演算法可以補救的。
        # ── 【v8.6】量測學層：直接量「量測值」，不量「分數」 ──────────────
        #   分數要經過 模板→尺規→評分曲線 六層加工，任何一層出問題都只看得到
        #   「分數怪怪的」。這四項不經過任何加工，而且用物理約束當內建真值
        #   （骨頭不會伸縮、左右同名骨段等長），不需要動作捕捉系統。
        #     bones      骨長與左右對稱性 → 遮擋偵測（比 visibility 硬）
        #     occlusion  哪些肢段是腦補的
        #     camera     從骨架反推的相機方位（機位到底差多少）
        #     noise      逐軸雜訊（z 是單目推估的直接證據）
        # exercise_key 必傳：遮擋判定只看該動作相關的骨段。
        # 不傳會讓深蹲因為「上臂左右差 35%」被誤判 —— 但上臂與深蹲無關。
        "metrology": metrology.measure(landmarks, exercise_key),
        # 【v9.0】量測示意圖規格：代表影格（最深點）的骨架座標 + 每個指標
        #   用到哪些 landmark、量測幾何長什麼樣、當下數值是多少。
        #   海報的骨架量測圖直接讀這一塊渲染，不再人工照著程式碼畫 ——
        #   之前就是人工抄公式，才會出現海報數字與實際資料對不上的情況。
        #   產生失敗時回 None，絕不影響分析主流程。
        "measurementOverlay": measurement_overlay.build(
            landmarks, reps, exercise_key, multi_exercise, confs=confs),
        # 【v9.0】七大指標的國際標準定義（名稱／公式／單位／landmarks／解剖面）。
        #   跟著每一次分析一起輸出，口試小抄與海報都以這份為唯一真相。
        "metricStandards": cfg.get("metric_standards"),
        # 【v8.6】骨長關卡對「這一支受測影片」的判定。
        #   跟 metrology.occlusion 的差別：這裡會指出**是哪一側**不可信，
        #   以及具體砍掉了哪些指標 —— 使用者看得到「為什麼少了這一項」。
        "boneGate": _bone_gate_result,
        # 【v9.0】相機角度關卡：離已驗證位置多遠、效度適不適用。
        #   使用者看得到「你偏了 35°，轉回來就評得出膝內夾」這種可行動的訊息。
        "poseGate": (multi_exercise.measurability.pose_gate(
            exercise_key, view, cfg.get("_measured_pose"))
            if cfg.get("_measured_pose") else None),
        "measuredPose": cfg.get("_measured_pose"),
        "countReliability": multi_exercise.measurability.counting_reliability(
            exercise_key, view,
            consensus=(tuple(int(t) for t in str(_count_consensus).split("/"))
                       if _count_consensus and "/" in str(_count_consensus) else None),
            # 【v8.9】自選機位不得繼承等效機位的實測正確率（見函式說明）
            free_placement=bool(cfg.get("_free_placement"))),
        "countConsensus": _count_consensus,
        "repCorrections": rep_corrections,   # v4.4：每 rep 主要修正提示
    }

    # ── 測試模式 debug payload（供論文驗收與真實圖表產生）──
    if debug:
        def _nl(a):
            out = []
            for x in a:
                try:
                    xf = float(x)
                    out.append(None if xf != xf else round(xf, 3))
                except Exception:
                    out.append(None)
            return out
        _prim = {"rep_boundaries": [
            {"rep": i + 1, "start": int(r["start_frame"]), "end": int(r["end_frame"])}
            for i, r in enumerate(reps)]}
        try:
            _ci = int(seg_col)
            _prim["column_index"] = _ci
            _prim["raw"] = _nl(feats[:, _ci])
            _prim["smoothed"] = _nl(fs[:, _ci])
        except Exception:
            _prim["note"] = f"segment column not indexable: {seg_col}"
        # 【v7】走「計次候選訊號」時 seg_col 是名稱字串（counting:右腕高度），
        #   上面的 raw/smoothed 拿不到 —— 而那正是最需要看的那條訊號。
        #   segment_repetitions 會把降採樣後的訊號掛在第一個 rep 上。
        #   實測有 9 支穩定少算 1 下、間距卻完全均勻，光看 rep_boundaries
        #   分不出漏在頭還是尾，沒有原始訊號就只能猜。
        try:
            if reps and reps[0].get("signal_dump"):
                _prim["counting_signal"] = reps[0]["signal_dump"]
            # 【v7】所有候選訊號各自的表現 —— 用來回答「換一條會不會比較好」、
            #   「某個機位是不是該用專屬規則」。只存被選中的那條就答不了。
            if reps and reps[0].get("candidate_report"):
                _prim["candidates"] = reps[0]["candidate_report"]
        except Exception:
            pass
        _tl = {
            "load_template": round(_ts['load'] - _t_start, 3),
            "pose_extraction": round(_ts['extract'] - _ts['load'], 3),
            "smoothing_segmentation": round(_ts['segment'] - _ts['extract'], 3),
            "scoring": round(_ts['score'] - _ts['segment'], 3),
            "aggregation": round(_ts['agg'] - _ts['score'], 3),
            "total": round(_ts['agg'] - _t_start, 3),
        }
        _result["debug"] = {
            "meta": {
                "exercise": exercise_key, "name": cfg["name"],
                "is_side_view": bool(is_side_view), "fps": float(fps),
                "total_frames": int(len(feats)),
                "duration_sec": (round(len(feats) / fps, 2) if fps else None),
                "seg_col_used": (int(seg_col) if isinstance(seg_col, (int, np.integer)) else str(seg_col)),
                "seg_invert": bool(seg_inv),
                "segment_signal_idx": cfg.get("segment_signal_idx"),
                "detected_reps": rep_count, "scored_cycles": len(reps),
                # 【v5.5】從骨架反推的實際機位角度 —— 用來驗證「我以為拍 90°，
                #   實際是幾度」，也是產品端偵測使用者亂架手機的依據。
                "measured_view_deg": (None if _view_deg is None else round(_view_deg, 1)),
                "measured_view": _view_cls,
                "bilateral_visibility": _bv,      # 【v5.8】機位判定的實際依據
                # 【v5.9】計次訊號本身健不健康 —— 不健康時次數是拿雜訊切的
                "rep_count_reliable": bool(_seg_ok),
                "seg_signal_rom": (None if _seg_rom is None else round(_seg_rom, 1)),
                "seg_signal_why": _seg_why,
                "framing": _framing,
                "template_len": int(len(template)),
                "con_len": con_len, "ecc_len": ecc_len,
                "metric_labels": list(ml),
                "scoring_scales": [float(x) for x in cfg["scoring_scales"]],
                # 【v5.3】機位與該機位的可交付率，圖表要用它做機位比較
                "view": view,
                "view_zh": multi_exercise.measurability.VIEW_ZH.get(view, view),
                "view_quality": (_dbg_reps[0].get("view_quality") if _dbg_reps else None),
                "phase_emphasis": float(cfg.get("phase_emphasis", 0.0)),
                "scoring_weights": [float(x) for x in cfg["scoring_weights"]],
            },
            "timings_sec": _tl,
            "primary_signal": _prim,
            "per_rep": _dbg_reps,
            "overall_score": (None if overall_score is None
                              else round(float(overall_score), 2)),
            "per_rep_scores": [round(float(s), 2) for s in scores],
            # 【v5.0 修正】舊版寫的是 con_len/(con_len+ecc_len)，而 con_len/ecc_len
            #   是從**模板 npz** 讀出來的常數 —— 所以 2026-07-27 那批 16 支影片，
            #   每支深蹲的 concentric_ratio 都是 0.529、每支臥推都是 0.493，
            #   完全一樣。它從頭到尾量的是教練，不是受測者，任何節奏分析都無效。
            #   改成用使用者自己切出來的 phase1/phase2 幀數算，並附上逐 rep 值。
            "concentric_ratio": _user_con_ratio_mean,
            "concentric_ratio_per_rep": _user_con_ratio_per_rep,
            "template_concentric_ratio": round(con_len / (con_len + ecc_len), 3),
            "nan_ratio_per_col": [round(float(x), 3) for x in _nan_ratio],
        }
    # 【v9.3】把三道關卡的判定併進歷史紀錄再寫入。
    #   只存分數不存關卡，從歷史點回來就會出現「93 分」配上
    #   「沒有任何指標通過三道關卡」這種自相矛盾的畫面。
    for _k in ("scoredMetrics", "occludedMetrics", "detectableErrors",
               "undetectableErrors", "poseGate", "scoreVoid", "scoreVoidReason"):
        if _k in _result:
            motion_record[_k] = _result[_k]
    # 【AR】疊合回放只給「當下分析完」看，不進歷史（隱私＋省空間）：
    #   _result（回傳給結算頁）保留 arVideoUrl，寫入歷史的 motion_record 清成 None。
    motion_record["arVideoUrl"] = None
    if not debug:
        append_motion_session(user_id, motion_record)

    return _json_safe(_result)


@router.post("/api/multi-exercise/analyze")
@limiter.limit("12/hour")   # 🔴 資安稽核 A-1：每支請求都跑 MediaPipe 逐幀分析，不限流等於開放 CPU/磁碟耗盡攻擊
def analyze_multi_exercise(
    request: Request,
    exercise_key: str = Form(...),
    file: UploadFile = File(...),
    is_side_view: bool = Form(False),
    user_id: str = Form(None),
    debug: bool = Form(False),
    # 【v8.6】明確機位代號。舊版這裡沒有這個參數，函式內卻直接用 `view`
    #   → NameError，整條同步分析路徑掛掉。
    #   而且 is_side_view 這個二元旗標分不出「正面 vs 俯視」，
    #   那正是決定抓不抓得到膝內夾／肘外展的關鍵。
    view: str = Form(None),
):
    """同步分析（保留相容性）。建議前端改用 /analyze-async 以取得真實進度。
    debug=True 時回傳測試模式驗收資料，且不寫入歷史。"""
    user_id = get_request_user_id(request, user_id)
    # 💳 姿勢檢查：免費每個月 3 次、會員不限（api_membership.pose_check_allowed，與前端同一條）。
    #    測試模式（debug）不寫歷史也不計次數，不擋。
    if not debug:
        from api_membership import pose_check_allowed
        if not pose_check_allowed(user_id):
            return JSONResponse(status_code=403, content={"error": "membership_required", "feature": "poseCheck"})
    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={"error": f"Unknown exercise: {exercise_key}"})
    tpath = _template_path(exercise_key, view)
    if not os.path.exists(tpath):
        return JSONResponse(status_code=400, content={
            "error": f"{cfg['name']} 這個機位還沒有模板，請先建立模板。"})
    if not _is_video_upload(file):
        return _not_video_response()
    vid_path = None
    try:
        file_id = str(uuid.uuid4())
        vid_path = os.path.join(UPLOAD_DIR, f"user_{exercise_key}_{file_id}_{_safe_upload_name(file.filename)}")
        with open(vid_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        result = _perform_multi_exercise_analysis(
            vid_path, exercise_key, cfg, is_side_view, user_id, file_id, debug=debug, view=view)
        return JSONResponse(content=_json_safe(result))
    except ValueError as ve:
        return JSONResponse(status_code=400, content={"error": str(ve)})
    except Exception as e:
        import traceback
        logger.error(f"Error in multi-exercise analyze: {e}\n{traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        _purge_upload(vid_path)   # 成功失敗都刪，不留使用者影片


@router.post("/api/multi-exercise/analyze-async")
@limiter.limit("12/hour")   # 🔴 資安稽核 A-1：每支請求都跑 MediaPipe 逐幀分析，不限流等於開放 CPU/磁碟耗盡攻擊
def analyze_multi_exercise_async(
    request: Request,
    exercise_key: str = Form(...),
    file: UploadFile = File(...),
    is_side_view: bool = Form(False),
    user_id: str = Form(None),
    debug: bool = Form(False),
    view: str = Form(None),      # 【v5.3】機位代號，取代語意不足的 is_side_view
):
    """非同步分析：立刻回傳 job_id，背景執行緒處理並逐階段更新真實進度。
    前端再以 GET /analyze-status/{job_id} 輪詢進度與最終結果。
    debug=True 時（測試模式）結果附帶 result["debug"] 驗收資料，且不寫入歷史。"""
    user_id = get_request_user_id(request, user_id)
    # 💳 姿勢檢查：免費每個月 3 次、會員不限（api_membership.pose_check_allowed，與前端同一條）。
    #    測試模式（debug）不寫歷史也不計次數，不擋。
    if not debug:
        from api_membership import pose_check_allowed
        if not pose_check_allowed(user_id):
            return JSONResponse(status_code=403, content={"error": "membership_required", "feature": "poseCheck"})
    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={"error": f"Unknown exercise: {exercise_key}"})
    tpath = _template_path(exercise_key, view)
    if not os.path.exists(tpath):
        return JSONResponse(status_code=400, content={
            "error": f"{cfg['name']} 這個機位還沒有模板，請先建立模板。"})

    if not _is_video_upload(file):
        return _not_video_response()

    # 上傳階段已在這個請求內完成 —— 先把影片落地
    file_id = str(uuid.uuid4())
    vid_path = os.path.join(UPLOAD_DIR, f"user_{exercise_key}_{file_id}_{_safe_upload_name(file.filename)}")
    try:
        with open(vid_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        _purge_upload(vid_path)
        logger.error(f"[analyze-async] 影片落地失敗: {e}")
        return JSONResponse(status_code=500, content={"error": "影片暫存失敗，請稍後再試。"})

    # 太長的影片先擋下（不排背景工作、不計次數）
    _too_long = _video_too_long(vid_path)
    if _too_long:
        _purge_upload(vid_path)
        return JSONResponse(status_code=400, content={
            "error": f"影片太長（{int(_too_long)} 秒）。請裁到 {_MAX_ANALYZE_SEC // 60} 分鐘以內，"
                     "做 3–5 下完整動作就夠了。"})

    _job_prune()
    job_id = str(uuid.uuid4())
    _job_set(job_id, status="processing", percent=0, stage="排隊中",
             result=None, error=None, ts=time.time(), owner=user_id)

    def _worker():
        def cb(percent, stage):
            # 使用者按了取消 → 在下一個進度點中止（擷取骨架期間每 15 幀就會回報一次）
            if (_job_get(job_id) or {}).get("cancelled"):
                raise _AnalysisCancelled()
            _job_set(job_id, percent=percent, stage=stage, ts=time.time())
        try:
            result = _perform_multi_exercise_analysis(
                vid_path, exercise_key, cfg, is_side_view, user_id, file_id,
                progress_cb=cb, debug=debug, view=view)
            # 【v7.2】結果經由 job 回傳，同樣要過 NaN 過濾 ——
            #   52 支實際走的就是這條非同步路徑。
            _job_set(job_id, status="done", percent=100, stage="完成",
                     result=_json_safe(result), ts=time.time())
        except _AnalysisCancelled:
            _job_set(job_id, status="error", error="已取消分析。", cancelled=True,
                     stage="已取消", ts=time.time())
        except ValueError as ve:
            _job_set(job_id, status="error", error=str(ve),
                     stage="分析失敗", ts=time.time())
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"[analyze-async] job {job_id} failed: {e}\n{tb}")
            # 【v6.4】不要再回「分析失敗，請重試」。
            #   那句話把唯一的線索丟掉了：實測 2026-07-31 推11／推12 掛在
            #   segment_repetitions 的 IndexError（seg_col 是名稱字串），
            #   但 UI 只顯示「請重試」，重試一百次也一樣，還讓人以為是影片拍壞。
            #   帶上例外型別、訊息與最後一個堆疊位置，才可能自己看懂。
            try:
                _last = [ln.strip() for ln in tb.splitlines()
                         if ln.strip().startswith('File "')][-1]
                _where = _last.split('", ')[0].split("/")[-1] + " " + \
                         _last.split('", ')[-1] if '", ' in _last else _last
            except Exception:
                _where = "?"
            _job_set(job_id, status="error",
                     error=f"{type(e).__name__}: {e}（發生在 {_where}）",
                     stage="分析失敗", ts=time.time())
        finally:
            # 【v4.8】不論成功或失敗，影片一定刪掉。
            #   成功路徑本來就會刪（見 _perform_multi_exercise_analysis 第 5 步），
            #   但只要中途拋例外（切不出 reps、模板壞掉…）就會留在磁碟上。
            #   實測 data/uploads 累積了 190MB 的失敗殘留。
            _purge_upload(vid_path)

    threading.Thread(target=_worker, daemon=True).start()
    return {"job_id": job_id}


# 背景工作超過這麼久沒有任何進度更新 → 視為卡死，回報失敗讓前端停止轉圈。
#   擷取骨架每 15 幀就會更新一次 ts，正常情況下不會有十分鐘完全沒動靜。
_JOB_STALL_SEC = 10 * 60


def _job_visible_to(job, request):
    """工作的結果含使用者的分析資料 —— 有登入身分時只給本人看。"""
    owner = job.get("owner")
    uid = getattr(getattr(request, "state", None), "user_id", None)
    return not (owner and uid and owner != uid)


@router.get("/api/multi-exercise/analyze-status/{job_id}")
def analyze_multi_exercise_status(job_id: str, request: Request):
    """查詢分析工作進度。status: processing / done / error。"""
    job = _job_get(job_id)
    if job is not None and not _job_visible_to(job, request):
        job = None
    if job is not None and job.get("status") == "processing" \
            and time.time() - (job.get("ts") or time.time()) > _JOB_STALL_SEC:
        _job_set(job_id, status="error", stage="分析逾時",
                 error="伺服器處理逾時（超過 10 分鐘沒有進度）。請重新上傳一次。")
        job = _job_get(job_id)
    if job is None:
        # 【v7.2】講清楚是什麼情況，前端才知道該重試而不是放棄。
        #   工作記錄是純記憶體的，後端一重啟就全沒了 —— 這時前端重送
        #   同一支影片即可，不必整批重跑。
        return JSONResponse(status_code=404, content={
            "error": "job not found",
            "reason": "工作記錄不存在（後端可能重啟過）。重送這支影片即可。",
            "retryable": True,
            "known_jobs": len(_ANALYSIS_JOBS)})
    return {
        "status": job.get("status"),
        "percent": job.get("percent", 0),
        "stage": job.get("stage", ""),
        "result": job.get("result") if job.get("status") == "done" else None,
        "error": job.get("error"),
        "error_detail": job.get("error_detail"),
    }


@router.post("/api/multi-exercise/analyze-cancel/{job_id}")
def analyze_multi_exercise_cancel(job_id: str, request: Request):
    """使用者按取消：標記工作，背景執行緒會在下一個進度點中止（不寫歷史）。"""
    job = _job_get(job_id)
    if job is None or not _job_visible_to(job, request):
        return JSONResponse(status_code=404, content={"error": "job not found"})
    if job.get("status") == "processing":
        _job_set(job_id, cancelled=True)
    return {"ok": True, "status": job.get("status")}


# ============ Edge Computing: Analyze from JSON Features ============

@router.post("/api/analyze_set")
async def analyze_set_from_features(request: Request, payload: dict = Body(...)):
    """
    混合邊緣運算 API：接收前端算好的特徵陣列（JSON），
    後端只做 scipy 平滑 + find_peaks 切割 + tslearn DBA 評分。

    前端負責：MediaPipe 骨架偵測 + 幾何角度計算
    後端負責：訊號平滑 + 次數分割 + 模板比對評分 + 建議生成

    Payload:
      {
        "exercise_key": "lat_pulldown",
        "features": [[85.2, 88.1, 12.3, 0.01, 3.1, 0.0002, -1.5], ...],
        "fps": 30,
        "is_side_view": false,
        "user_id": "<your_user_id>"
      }
    """
    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"error": "bad_payload"})
    exercise_key = payload.get("exercise_key")
    raw_features = payload.get("features", [])
    fps = payload.get("fps", 30)
    is_side_view = payload.get("is_side_view", False)
    # 【v8.6】前端改送明確的機位代號（frontal_0 / overhead / sagittal_90 / oblique_45）。
    #   舊的 is_side_view 是二元旗標，表達不了「正面 vs 俯視」的差別 ——
    #   而那正是決定「抓不抓得到膝內夾／肘外展」的關鍵。
    #   實測：深蹲正面抓到膝內夾（掉 31.4 分），正側面完全抓不到（不降反升 14.9）。
    view_code = payload.get("view_code") or payload.get("view")
    if not view_code:
        view_code = "sagittal_90" if is_side_view else "frontal_0"
    # 🔴 上架前稽核：原本完全信任 payload 的 user_id，而且不用登入 ——
    #   任何人都能往別人的動作歷史裡寫假紀錄。有 JWT middleware（正式後端）時一律用 JWT 身分，
    #   沒登入就 401；只有本機 research_server（沒掛 middleware）才沿用 payload。
    try:
        _jwt_uid = request.state.user_id
        _has_auth_mw = True
    except AttributeError:
        _jwt_uid, _has_auth_mw = None, False
    if _has_auth_mw:
        if not _jwt_uid:
            return JSONResponse(status_code=401, content={"error": "auth_required"},
                                headers={"WWW-Authenticate": "Bearer"})
        user_id = _jwt_uid
    else:
        user_id = payload.get("user_id") or payload.get("id") or "guest_api"
    # 💳 姿勢檢查次數（同 analyze-async）
    if not payload.get("debug"):
        from api_membership import pose_check_allowed
        if not pose_check_allowed(user_id):
            return JSONResponse(status_code=403, content={"error": "membership_required", "feature": "poseCheck"})

    cfg = multi_exercise.get_config(exercise_key)
    if not cfg:
        return JSONResponse(status_code=400, content={
            "error": f"Unknown exercise: {exercise_key}. Available: {list(multi_exercise.EXERCISE_CONFIGS.keys())}"
        })

    if not raw_features or len(raw_features) < 10:
        return JSONResponse(status_code=400, content={
            "error": "Features array too short. Need at least 10 frames."
        })

    # ⚠️ 這裡原本寫 `view`，但這個函式從頭到尾沒有定義過 view —— 是 NameError。
    #    正確的是前端送來的機位代號。
    tpath = _template_path(exercise_key, view_code)
    if not os.path.exists(tpath):
        # 找不到該機位的模板時，退回不分機位的通用模板（舊資料相容）
        _fallback = _template_path(exercise_key, None)
        if os.path.exists(_fallback):
            logger.warning(f"[analyze_set] 沒有 {exercise_key}·{view_code} 的模板，"
                           f"退回通用模板（跨機位比對，結果僅供參考）")
            tpath = _fallback
    if not os.path.exists(tpath):
        return JSONResponse(status_code=400, content={
            "error": f"No template for {cfg['name']}. Build one first via /upload/expert."
        })

    try:
        # 1. Convert to numpy (replace null/None with NaN)
        feats = np.array(raw_features, dtype=np.float64)
        feats = np.where(np.isfinite(feats), feats, np.nan)
        logger.info(f"[analyze_set] Received {len(feats)} frames for {exercise_key} @ {fps}fps")

        # 2. Load template
        td = np.load(tpath)
        template = td["template"]
        con_len = int(td["con_len"])
        ecc_len = int(td["ecc_len"])

        # 3. Smooth (scipy Butterworth filter)
        # Interpolate NaNs first for smoothing
        feats_interp = multi_exercise.fill_nan_numpy(feats)
        fs = multi_exercise.apply_smoothing(feats_interp, fps)

        # 4. Segment repetitions —— 主訊號失效時自動掃描所有特徵欄
        #   「骨架有抓到卻只切出 1 rep」幾乎都是：作為計次基準的那一欄
        #   （segment_signal_idx）所依賴的關節被裁切 / 低可見度 → 整欄 NaN→0
        #   變平線 → find_peaks 抓不到波峰。segment_repetitions_auto 會改用
        #   其他還在隨每下擺盪的欄把計次救回來。
        _ml = cfg.get("metric_labels", [])
        _nan_ratio = np.isnan(feats).mean(axis=0)
        logger.info("[analyze_set] 各欄 NaN 比例: " + ", ".join(
            f"{_ml[i] if i < len(_ml) else i}={_nan_ratio[i]*100:.0f}%"
            for i in range(feats.shape[1])))
        reps, seg_col, seg_inv = multi_exercise.segment_repetitions_auto(fs, fps, cfg)
        logger.info(f"[analyze_set] 切割結果: {len(reps)} reps "
                    f"(實際用第 {seg_col} 欄, invert={seg_inv}, "
                    f"主訊號={cfg['segment_signal_idx']})")

        if not reps:
            # 最後兜底：整段視為 1 rep（且明確標記是 fallback）
            _psig, primary_idx = multi_exercise.primary_signal_of(feats_interp, cfg)
            rom = np.ptp(_psig)
            if rom > 5:
                mid_f = len(fs) // 2
                reps = [{
                    "phase1": fs[0:mid_f, :],
                    "phase2": fs[mid_f:, :],
                    "start_frame": 0,
                    "valley_frame": mid_f,
                    "end_frame": len(fs) - 1,
                }]
                logger.warning(f"[analyze_set] ⚠️ Fallback to 1 rep (ROM={rom:.1f}). "
                               f"切割完全失敗，可能是 visibility/角度問題。")
            else:
                return JSONResponse(status_code=400, content={
                    "error": "No repetitions detected. Try moving with a larger range of motion."
                })

        # 5. Score each rep (tslearn DBA template comparison)
        ml = cfg["metric_labels"]
        scores, all_subs, chart_data_per_rep = [], [], []

        for i, r in enumerate(reps):
            p1 = multi_exercise.resample_to_length(r["phase1"], con_len)
            p2 = multi_exercise.resample_to_length(r["phase2"], ecc_len)
            user_rep = np.vstack((p1, p2))

            s, subs = multi_exercise.score_rep(user_rep, template, cfg, is_side=is_side_view)
            scores.append(s)
            all_subs.append(subs.tolist())

            # Chart data (downsample to 100 points for frontend)
            # 【FIX 2026-05】整欄被遮蔽 → user 值用 None（前端 recharts 跳過該點），
            #   不要填 0 假裝有資料，否則畫面會顯示一條假的水平零線在底部。
            chart_data = {}
            for m_idx, metric in enumerate(ml):
                user_col = user_rep[:, m_idx]
                expert_col = template[:, m_idx]
                fully_occluded = bool(np.isnan(user_col).all())

                if fully_occluded:
                    # 整欄全 NaN → 該指標的這個 rep 全部回 None
                    f_e_raw = multi_exercise.fill_nan_numpy(
                        expert_col[:, None], fill_value_for_all_nan=0.0)[:, 0]
                    x_orig_e = np.linspace(0, 100, len(f_e_raw))
                    x_tgt = np.linspace(0, 100, 100)
                    f_e = np.interp(x_tgt, x_orig_e, f_e_raw)
                    chart_data[metric] = [
                        {"frame": int(x_tgt[j]), "user": None, "expert": float(f_e[j])}
                        for j in range(100)
                    ]
                else:
                    user_curve = multi_exercise.fill_nan_numpy(
                        user_col[:, None], fill_value_for_all_nan=0.0)[:, 0]
                    expert_curve = multi_exercise.fill_nan_numpy(
                        expert_col[:, None], fill_value_for_all_nan=0.0)[:, 0]
                    x_orig = np.linspace(0, 100, len(user_curve))
                    x_tgt = np.linspace(0, 100, 100)
                    f_u = np.interp(x_tgt, x_orig, user_curve)
                    f_e = np.interp(x_tgt, x_orig, expert_curve)
                    chart_data[metric] = [
                        {"frame": int(x_tgt[j]),
                         "user": (None if not np.isfinite(f_u[j]) else float(f_u[j])),
                         "expert": float(f_e[j])}
                        for j in range(100)
                    ]
            chart_data_per_rep.append(chart_data)

        # 6. Aggregate results
        # 【v7.2】score_rep 在「有效權重過低」時回傳 NaN（量不到就不給分）。
        #   全部 rep 都被作廢時 np.nanmean 會回 NaN —— 而 **NaN 不是合法 JSON**，
        #   瀏覽器的 JSON.parse 會直接拋錯（Python 的 json.dumps 產出的
        #   {"overallScore": NaN} 在前端解不開）。所以必須轉成 None。
        _all_void = bool(len(scores)) and not np.isfinite(np.asarray(scores, dtype=float)).any()
        overall_score = None if _all_void else float(np.nanmean(scores))
        if _all_void:
            logger.warning("[analyze_set] 此機位不評分：有效權重過低（量到的指標太少）")
        avg_subs = np.nanmean(all_subs, axis=0)

        radar_data = []
        feedback_list = []
        for idx, label in enumerate(ml):
            sc = float(avg_subs[idx])
            radar_data.append({"subject": label, "A": sc, "fullMark": 100})
            if label in cfg["tips"]:
                tip = cfg["tips"][label]
                feedback_list.append(_build_metric_feedback(label, tip, sc))
        # 依分數由低到高排序：最需要改善的指標排在最前面
        feedback_list.sort(key=lambda x: x["score"])

        logger.info(f"[analyze_set] Done: {len(reps)} reps, "
                    f"score={'不評分' if overall_score is None else f'{overall_score:.1f}'}")

        # 【FIX 2026-05】回傳 repSegments：每個 rep 在原始影片上的起訖秒數，
        #   給 AR 疊合回放做「跳到 best rep / worst rep 段落播放」用。
        safe_fps = float(fps) if fps else 30.0
        rep_segments = [
            {
                "rep": i + 1,
                "startSec": round(r["start_frame"] / safe_fps, 2),
                "endSec": round(r["end_frame"] / safe_fps, 2),
            }
            for i, r in enumerate(reps)
        ]

        # ── 存入該使用者的歷史（user_id 制）────────────────────────
        try:
            duration = int(len(raw_features) / fps) if fps else 0
        except Exception:
            duration = 0
        motion_record = build_motion_record(
            exercise_key, cfg["name"], overall_score, radar_data,
            len(reps), chart_data_per_rep, feedback_list,
            ar_url=None, duration_seconds=duration, rep_segments=rep_segments)
        append_motion_session(user_id, motion_record)

        return JSONResponse(content={
            "session_id": motion_record["session_id"],
            "exerciseKey": exercise_key,
            "exerciseName": cfg["name"],
            # 【v7.2】不給分時是 None，不能硬轉 float
        "overallScore": (None if overall_score is None else float(overall_score)),
            "reps_count": len(reps),
            "metrics": radar_data,
            "chartsData": chart_data_per_rep,
            "concentricFrames": int((con_len / (con_len + ecc_len)) * 100),
            "feedback": feedback_list,
            "fatigueData": [{"rep": i+1, "score": float(s)} for i, s in enumerate(scores)],
            "repSegments": rep_segments,
            "source": "edge_computing",
            "frames_received": len(raw_features),
        })

    except Exception as e:
        import traceback
        error_msg = f"Error in analyze_set: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        return JSONResponse(status_code=500, content={"error": str(e)})


# ════════════════════════════════════════════════════════════════
# 骨架示範影片產生器（研究/簡報用，掛在共用 router → 完整後端與 research_server 都有）
#   POST /research/skeleton             上傳一支影片 → 背景畫骨架 → 回 job_id
#   GET  /research/skeleton-status/{j}  輪詢進度；done 時回 file id
#   GET  /research/skeleton/{fid}       下載加了骨架的 mp4
# 這是「額外附加」的研究端點：只讀上傳的影片、輸出加骨架的影片給你下載，
#   不改任何既有分析行為、不動 App 的任何畫面。25MB 上限已在 main.py 的
#   _LARGE_BODY_PATHS 針對 /research/skeleton 放寬到 1GB。
# ════════════════════════════════════════════════════════════════
_SK_DIR = os.path.join(DATA_DIR, "demo_skeletons")
os.makedirs(_SK_DIR, exist_ok=True)
_SK_JOBS = {}   # job_id -> {percent,state,fid,name,error}
_SK_MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "core", "pose_landmarker_full.task")

try:
    from mediapipe.python.solutions.pose import POSE_CONNECTIONS as _SK_CONN
    _SK_CONN = list(_SK_CONN)
except Exception:
    _SK_CONN = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24),
                (23, 25), (25, 27), (27, 29), (29, 31), (24, 26), (26, 28), (28, 30), (30, 32),
                (15, 17), (16, 18), (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10)]


import math as _sk_math


def _sk_ang(a, b, c):
    """三點夾角（度），輸入像素座標。"""
    ba = (a[0] - b[0], a[1] - b[1]); bc = (c[0] - b[0], c[1] - b[1])
    dot = ba[0] * bc[0] + ba[1] * bc[1]
    n = (_sk_math.hypot(*ba) * _sk_math.hypot(*bc)) + 1e-9
    return _sk_math.degrees(_sk_math.acos(max(-1.0, min(1.0, dot / n))))


# 拍攝清單 v6.3：檔名序號 → (機位, 種類)。深N / 推N 共用同一張表。
_SK_ROLE = {
    1: ('side', 'model'), 2: ('front', 'model'), 3: ('side', 'model'), 4: ('front', 'model'),
    5: ('side', 'std'), 6: ('front', 'std'), 7: ('side', 'std'), 8: ('front', 'std'), 9: ('side', 'std'), 10: ('front', 'std'),
    11: ('side', 'errA'), 12: ('front', 'errA'), 13: ('side', 'errB'), 14: ('front', 'errB'),
    15: ('side', 'nov'), 16: ('front', 'nov'), 17: ('side', 'nov'), 18: ('front', 'nov'),
    19: ('nat', 'model'), 20: ('nat', 'model'), 21: ('nat', 'std'), 22: ('nat', 'std'), 23: ('nat', 'std'),
    24: ('nat', 'errA'), 25: ('nat', 'errB'), 26: ('nat', 'nov'),
}
_SK_VIEW = {
    'squat': {'side': 'Lateral 90 deg', 'front': 'Frontal 0 deg', 'nat': 'Self-chosen'},
    'bench': {'side': 'Lateral 90 deg', 'front': 'Overhead', 'nat': 'Self-chosen'},
}
_SK_QUAL = {
    'model': lambda k: 'Modeling clip',
    'std': lambda k: 'Standard rep',
    'nov': lambda k: 'Novice rep',
    'errA': lambda k: 'Deliberate: shallow depth' if k == 'squat' else 'Deliberate: elbow flare',
    'errB': lambda k: 'Deliberate: knee valgus' if k == 'squat' else 'Deliberate: grip too narrow',
}


def _sk_label(name):
    """檔名 → (頂部標籤『動作 | 機位』, 種類標籤, 動作種類)。cv2 畫不了中文，一律轉英文。"""
    s = str(name); low = s.lower()
    import re as _re
    _m = _re.search(r'(\d+)', s)   # 只取第一組數字：避免「深6拷貝2」被讀成 62
    num = int(_m.group(1)) if _m else 0
    kind = ('squat' if (any(k in s for k in ('深', '蹲')) or 'squat' in low or low.startswith('sq'))
            else 'bench' if (any(k in s for k in ('推', '臥', '胸')) or 'bench' in low or low.startswith('bp'))
            else 'generic')
    if kind == 'generic':
        ascii_name = ''.join(ch for ch in s if ord(ch) < 128).strip() or "CLIP"
        return (f"CLIP #{num}" if num else ascii_name[:16]), "Live analysis", 'generic'
    EX = 'SQUAT' if kind == 'squat' else 'BENCH'
    role = _SK_ROLE.get(num)
    if not role:
        return (f"{EX} #{num}" if num else EX), "Live analysis", kind
    view_slot, qual = role
    view = _SK_VIEW[kind][view_slot]
    return f"{EX}  |  {view}", _SK_QUAL[qual](kind), kind


def _sk_worker(job_id, in_path, name):
    """背景執行：跑 MediaPipe pose、逐幀畫骨架＋英文標記＋即時角度小分析、輸出 mp4。"""
    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as _py
        from mediapipe.tasks.python import vision as _vis
        opts = _vis.PoseLandmarkerOptions(
            base_options=_py.BaseOptions(model_asset_path=_SK_MODEL),
            running_mode=_vis.RunningMode.VIDEO, num_poses=1)
        cap = cv2.VideoCapture(in_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        scale = min(1.0, 900.0 / max(1, w)); ow = (int(w * scale) // 2) * 2; oh = (int(h * scale) // 2) * 2
        fid = uuid.uuid4().hex[:12]
        out_path = os.path.join(_SK_DIR, f"{fid}.mp4")
        vw = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (ow, oh))
        CORAL = (95, 97, 225); DOT = (120, 200, 120); WHITE = (255, 255, 255)
        ACC = (120, 160, 240)   # DRVN coral (BGR)
        label, kind_label, kind = _sk_label(name)
        # 角度小分析：深蹲量膝角(hip-knee-ankle)、臥推量肘角(shoulder-elbow-wrist)
        SIDES = {'squat': [(23, 25, 27), (24, 26, 28)], 'bench': [(11, 13, 15), (12, 14, 16)]}.get(kind)
        ANG_NAME = {'squat': 'KNEE', 'bench': 'ELBOW'}.get(kind)
        CAP = ("Knee angle measured frame-by-frame from a single-camera 33-point skeleton" if kind == 'squat'
               else "Elbow angle measured frame-by-frame from a single-camera 33-point skeleton" if kind == 'bench'
               else "Real-time 33-point skeleton from a single camera")
        ang_ema = None
        fs = w / 1100.0
        with _vis.PoseLandmarker.create_from_options(opts) as lm:
            fn = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                fn += 1
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(fn * 1000.0 / fps))
                ang_txt = "--"
                if res.pose_landmarks:
                    p = res.pose_landmarks[0]
                    pts = [(int(q.x * w), int(q.y * h)) for q in p]
                    vis = [getattr(q, 'visibility', 1.0) for q in p]
                    for a, b in _SK_CONN:
                        if a < len(pts) and b < len(pts) and vis[a] > 0.4 and vis[b] > 0.4:
                            cv2.line(frame, pts[a], pts[b], CORAL, max(2, w // 320), cv2.LINE_AA)
                    for i, (px, py) in enumerate(pts):
                        if vis[i] > 0.4:
                            cv2.circle(frame, (px, py), max(3, w // 260), DOT, -1, cv2.LINE_AA)
                    # 即時角度（挑左右較清楚那側）
                    if SIDES:
                        best = None
                        for (ia, ib, ic) in SIDES:
                            if max(ia, ib, ic) < len(vis):
                                mv = min(vis[ia], vis[ib], vis[ic])
                                if best is None or mv > best[0]:
                                    best = (mv, ia, ib, ic)
                        if best and best[0] > 0.5:
                            deg = _sk_ang(pts[best[1]], pts[best[2]], pts[best[3]])
                            ang_ema = deg if ang_ema is None else (0.7 * ang_ema + 0.3 * deg)
                            ang_txt = f"{ang_ema:.0f}"
                            cv2.circle(frame, pts[best[2]], max(6, w // 150), ACC, 2, cv2.LINE_AA)
                # ── 頂部標題列（英文）──
                ov = frame.copy(); bh = max(38, h // 16)
                cv2.rectangle(ov, (0, 0), (w, bh), (20, 20, 20), -1)
                # ── 底部即時分析面板 ──
                ph = int(h * 0.16)
                cv2.rectangle(ov, (0, h - ph), (w, h), (18, 18, 18), -1)
                frame = cv2.addWeighted(ov, 0.58, frame, 0.42, 0)
                cv2.putText(frame, "DRVN  MediaPipe Pose", (int(w * 0.02), int(bh * 0.66)),
                            cv2.FONT_HERSHEY_SIMPLEX, fs * 0.9, ACC, 2, cv2.LINE_AA)
                (tw, _th), _bl = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, fs * 0.85, 2)
                cv2.putText(frame, label, (w - tw - int(w * 0.02), int(bh * 0.66)),
                            cv2.FONT_HERSHEY_SIMPLEX, fs * 0.85, WHITE, 2, cv2.LINE_AA)
                # 面板內容：小標 + 大數字(角度) + 解說
                by = h - ph
                cv2.putText(frame, kind_label, (int(w * 0.03), by + int(ph * 0.28)),
                            cv2.FONT_HERSHEY_SIMPLEX, fs * 0.64, (215, 215, 215), 1, cv2.LINE_AA)
                if ANG_NAME:
                    cv2.putText(frame, f"{ANG_NAME}", (int(w * 0.03), by + int(ph * 0.72)),
                                cv2.FONT_HERSHEY_SIMPLEX, fs * 0.9, (200, 200, 200), 2, cv2.LINE_AA)
                    (aw, _ah), _ = cv2.getTextSize(f"{ANG_NAME} ", cv2.FONT_HERSHEY_SIMPLEX, fs * 0.9, 2)
                    cv2.putText(frame, f"{ang_txt}", (int(w * 0.03) + aw, by + int(ph * 0.74)),
                                cv2.FONT_HERSHEY_SIMPLEX, fs * 1.35, ACC, 3, cv2.LINE_AA)
                    (nw, _nh), _ = cv2.getTextSize(f"{ang_txt}", cv2.FONT_HERSHEY_SIMPLEX, fs * 1.35, 3)
                    cv2.putText(frame, "deg", (int(w * 0.03) + aw + nw + int(w * 0.008), by + int(ph * 0.72)),
                                cv2.FONT_HERSHEY_SIMPLEX, fs * 0.7, (170, 170, 170), 2, cv2.LINE_AA)
                else:
                    cv2.putText(frame, "TRACKING 33 pts", (int(w * 0.03), by + int(ph * 0.72)),
                                cv2.FONT_HERSHEY_SIMPLEX, fs * 1.0, ACC, 2, cv2.LINE_AA)
                cv2.putText(frame, CAP, (int(w * 0.03), by + int(ph * 0.93)),
                            cv2.FONT_HERSHEY_SIMPLEX, fs * 0.5, (150, 150, 150), 1, cv2.LINE_AA)
                if scale < 1.0:
                    frame = cv2.resize(frame, (ow, oh))
                vw.write(frame)
                if total:
                    _SK_JOBS[job_id]['percent'] = min(99, int(fn / total * 100))
        cap.release(); vw.release()
        try:
            os.remove(in_path)
        except Exception:
            pass
        _SK_JOBS[job_id].update(percent=100, state='done', fid=fid)
    except Exception as e:
        _SK_JOBS[job_id].update(state='error', error=str(e))


@router.post("/research/skeleton")
@limiter.limit("6/hour")   # 研究用工具：整支影片跑 MediaPipe，不限流等於開放 CPU 耗盡
def sk_start(request: Request, file: UploadFile = File(...)):
    # 【上架前稽核】原本不需登入、而且 await file.read() 把最大 1GB 的影片整支讀進記憶體。
    _deny = _require_login(request)
    if _deny is not None:
        return _deny
    if not _is_video_upload(file):
        return _not_video_response()
    base = _safe_upload_name(file.filename, default="clip.mp4")
    name = os.path.splitext(base)[0]
    tmp = os.path.join(_SK_DIR, f"_in_{uuid.uuid4().hex[:8]}_{base}")
    with open(tmp, 'wb') as f:
        shutil.copyfileobj(file.file, f)   # 串流寫檔，不整支讀進記憶體
    job_id = uuid.uuid4().hex[:12]
    _SK_JOBS[job_id] = {'percent': 0, 'state': 'processing', 'fid': None, 'name': name, 'error': None}
    threading.Thread(target=_sk_worker, args=(job_id, tmp, name), daemon=True).start()
    return {"job_id": job_id, "name": name}


@router.get("/research/skeleton-status/{job_id}")
def sk_status(job_id: str):
    j = _SK_JOBS.get(job_id)
    if not j:
        return {"state": "error", "error": "job not found"}
    return j


@router.get("/research/skeleton/{fid}")
def sk_download(fid: str):
    p = os.path.join(_SK_DIR, f"{os.path.basename(fid)}.mp4")
    if not os.path.exists(p):
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(p, media_type="video/mp4", filename=f"{fid}_skeleton.mp4")
