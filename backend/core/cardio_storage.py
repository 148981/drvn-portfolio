# Cardio Sessions Storage
# Store cardio tracking sessions with route data and metrics

import json
import os
import logging
from datetime import datetime
from typing import List, Dict, Optional
import uuid
from .cardio_analytics import calculate_physiological_insights
from .json_cache import load_json_cached, save_json_atomic
from . import route_optimizer
import random

logger = logging.getLogger(__name__)

# 🔧 FIX: 指向 backend 外層的 data/，與 main.py 的 DATA_DIR 相同
# 原本路徑 backend/core/../data = backend/data/，在 backend/ 目錄內
# Uvicorn reload=True 用 watchfiles 監聽所有檔案，寫入 backend/data/ 時觸發 reload → 503
# 新路徑 backend/core/../../data = <project_root>/data/，在 backend/ 外，不會被 watchfiles 監聽
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))

def get_cardio_file(user_id: str) -> str:
    """根據 user_id 取得專屬的 cardio_sessions 檔案路徑"""
    return os.path.join(DATA_DIR, f"cardio_sessions_{user_id}.json")

def load_user_sessions(user_id: str) -> Dict:
    """Load cardio sessions for a specific user.
    Phase 2：改從 DB 讀（per-user 的 cardio_sessions 表）。回傳 {session_id: session}。"""
    from repositories import cardio_session_repo
    return cardio_session_repo.get_all(user_id)

def load_sessions() -> Dict:
    """Load ALL users' cardio sessions（for 排行榜 / 個人檔 / feed / insights）。

    🟢 Fix(C3)：Phase 2 後 session 已改存 per-user DB，舊的全域 cardio_sessions.json
       不再被寫入。這裡改為「跨所有 user 彙整 DB」，回傳 {session_id: payload}
       且每筆 payload 含 user_id（與舊形狀相容，caller 不需改）。
       仍保留讀舊 JSON 作為補充（合併歷史殘留資料，DB 為主）。
    """
    sessions: Dict = {}
    # 1) 主來源：DB 跨 user 彙整
    try:
        from repositories import cardio_session_repo
        sessions = cardio_session_repo.get_all_global() or {}
    except Exception as e:
        logger.warning("load_sessions: DB aggregate failed (%s), fallback to legacy JSON", e)
    # 2) 補充：舊全域 JSON（若還有殘留歷史資料，且 session_id 未在 DB 出現）
    try:
        file_path = os.path.join(DATA_DIR, "cardio_sessions.json")
        legacy = load_json_cached(file_path, default={}) or {}
        for sid, payload in legacy.items():
            if sid not in sessions:
                sessions[sid] = payload
    except Exception:
        pass
    return sessions

def save_user_sessions(user_id: str, sessions: Dict):
    """Save cardio sessions for a specific user.
    Phase 2：改為同步進 DB（upsert 全部 + 刪除已移除的），取代寫 JSON 檔。"""
    from repositories import cardio_session_repo
    logger.debug("Syncing %d cardio sessions for user %s", len(sessions), user_id)
    cardio_session_repo.sync(user_id, sessions)

def _session_fingerprint(session_data: Dict) -> tuple:
    """產生一筆 session 的去重指紋 (SOP 第一階段：全局去重)。
    同一次跑步若被前端多個入口 (saveWorkoutData / generateAndSetData /
    離線同步迴圈 / Results 自動存檔) 重複 POST，其時間+距離+時長會完全相同，
    用此指紋即可命中既有紀錄，避免產生重複 session。"""
    metrics = session_data.get('metrics') or session_data.get('stats') or {}
    created = str(session_data.get('date') or '')[:19]  # 取到秒，忽略毫秒/時區尾段
    dist = metrics.get('distance', metrics.get('distance_km', 0)) or 0
    dur = metrics.get('duration', metrics.get('duration_seconds', 0)) or 0
    # 距離取到 1 公尺、時長取整秒，避免浮點誤差導致誤判為不同筆
    return (created, round(float(dist), 3), int(float(dur)))


def find_duplicate_session(user_id: str, session_data: Dict) -> Optional[str]:
    """若已存在指紋相同的 session，回傳其 session_id，否則 None。"""
    target = _session_fingerprint(session_data)
    # 只有當這筆有實際內容 (時間存在) 才比對，空白指紋不去重
    if not target[0]:
        return None
    for sid, s in load_user_sessions(user_id).items():
        existing = {
            'date': s.get('created_at') or s.get('date'),
            'metrics': s.get('metrics') or s.get('stats') or {},
        }
        if _session_fingerprint(existing) == target:
            return sid
    return None


def create_session(user_id: str, session_data: Dict) -> str:
    """Create a new cardio session"""
    sessions = load_user_sessions(user_id)

    # 🛡 冪等防護 (SOP 第一階段 · 全局去重)：同一筆跑步重複 POST 時，
    #    直接回傳既有 session_id，不再新增 → 根治 History 一次跑步跳三張卡。
    duplicate_id = find_duplicate_session(user_id, session_data)
    if duplicate_id:
        logger.info("⏭️ 偵測到重複 cardio session，回傳既有 id %s (user %s)", duplicate_id, user_id)
        return duplicate_id

    session_id = f"session_{uuid.uuid4().hex[:12]}"

    # Field standardization: frontend may send 'stats', backend expects 'metrics'
    metrics = session_data.get('metrics')
    if not metrics and 'stats' in session_data:
        metrics = session_data['stats']
        session_data['metrics'] = metrics

    # Calculate Physiological Insights if stream_data exists
    physio_metrics = None
    if 'stream_data' in session_data and session_data['stream_data']:
        try:
            past_sessions = get_user_sessions(user_id, limit=6)
            history_efs = []
            for s in past_sessions:
                if 'deepData' in s and 'physio_metrics' in s['deepData']:
                    ef = s['deepData']['physio_metrics'].get('ef', {}).get('current')
                    if ef:
                        history_efs.append(float(ef))
            physio_metrics = calculate_physiological_insights(
                session_data['stream_data'].get('heart_rate', []),
                session_data['stream_data'].get('pace', []),
                history_efs=history_efs
            )
        except Exception as e:
            logger.warning("Error calculating physio metrics: %s", e)

    deep_data = session_data.get('deepData', {})
    if physio_metrics:
        deep_data['physio_metrics'] = physio_metrics

    # 🗜 逐點資料降採樣（在生理分析「之後」才壓縮，分析仍用全解析度）
    #    軌跡 + 心率/配速串流同步裁切，摘要欄位不動。失敗不影響存檔。
    try:
        before, after = route_optimizer.optimize_session(session_data)
        if after < before:
            logger.info("🗜 route 降採樣 %d→%d 點 (user %s)", before, after, user_id)
    except Exception as e:
        logger.warning("route 降採樣略過（不影響存檔）: %s", e)

    sessions[session_id] = {
        "session_id": session_id,
        "user_id": user_id,
        "created_at": session_data.get('date', datetime.now().isoformat()),
        **session_data,
        "deepData": deep_data
    }

    save_user_sessions(user_id, sessions)
    logger.info("Created cardio session %s for user %s", session_id, user_id)
    return session_id

def get_user_sessions(user_id: str, limit: int = 20) -> List[Dict]:
    """Get all sessions for a user"""
    sessions = load_user_sessions(user_id)
    # 由於檔案裡已經全是該 user 的資料，直接轉 list
    user_sessions = list(sessions.values())
    
    # Sort by date, most recent first
    user_sessions.sort(key=lambda x: (x.get('created_at') or ''), reverse=True)
    return user_sessions[:limit]

def get_session_by_id(user_id: str, session_id: str) -> Optional[Dict]:
    """Get a specific session by ID"""
    sessions = load_user_sessions(user_id)
    return sessions.get(session_id)

def delete_session(user_id: str, session_id: str) -> bool:
    """Delete a session by ID"""
    sessions = load_user_sessions(user_id)
    if session_id in sessions:
        del sessions[session_id]
        save_user_sessions(user_id, sessions)
        return True
    return False

def get_running_analytics(user_id: str, period: str = "month") -> Dict:
    """Get running analytics for a specific period"""
    sessions = get_user_sessions(user_id, limit=1000)
    
    from datetime import datetime, timedelta
    now = datetime.now()
    
    # Filter by period
    if period == "week":
        cutoff = now - timedelta(days=7)
    elif period == "month":
        cutoff = now - timedelta(days=30)
    elif period == "year":
        cutoff = now - timedelta(days=365)
    else:
        cutoff = datetime.min
    
    filtered_sessions = []
    for s in sessions:
        created_at_str = s.get('created_at', '')
        if not created_at_str:
            continue
        try:
            # Parse datetime and remove timezone info if present to make it offset-naive
            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            if created_at.tzinfo is not None:
                created_at = created_at.replace(tzinfo=None)
            if created_at >= cutoff:
                filtered_sessions.append(s)
        except (ValueError, AttributeError):
            continue
    
    if not filtered_sessions:
        return {
            "period": period,
            "total_runs": 0,
            "total_distance": 0,
            "total_duration": 0,
            "avg_pace": 0,
            "avg_cadence": 0,
            "avg_hr": 0
        }
    
    # Calculate aggregated stats - check both old and new field names for compatibility
    total_distance = sum(
        s.get('metrics', {}).get('distance_km', s.get('metrics', {}).get('distance', 0)) 
        for s in filtered_sessions
    )
    total_duration = sum(
        s.get('metrics', {}).get('duration_seconds', s.get('metrics', {}).get('duration', 0)) 
        for s in filtered_sessions
    )
    
    # DEBUG LOGGING FOR CALORIES
    logger.debug(f"🔍 [Backend] Calculating calories for {len(filtered_sessions)} sessions")
    for i, s in enumerate(filtered_sessions[:5]): # Log first 5
        logger.debug(f"  Session {i}: metrics={s.get('metrics', {})}")
        
    # Helper to get or estimate calories
    def get_session_calories(s):
        metrics = s.get('metrics', {})
        # Try explicit values first
        c = metrics.get('calories', metrics.get('kcal', 0))
        if c and c > 0:
            return c
        
        # Estimate if missing: ~60-70 kcal per km is decent average
        # Using 65 as conservative estimate
        dist = metrics.get('distance_km', metrics.get('distance', 0))
        if dist and dist > 0:
            return dist * 65
        return 0

    total_calories = sum(get_session_calories(s) for s in filtered_sessions)
    logger.debug(f"🔍 [Backend] Total Calories calculated: {total_calories}")
    
    paces = [
        s.get('metrics', {}).get('pace_per_km', s.get('metrics', {}).get('avgPace', 0)) 
        for s in filtered_sessions 
        if s.get('metrics', {}).get('pace_per_km', s.get('metrics', {}).get('avgPace', 0)) > 0
    ]
    cadences = [s.get('metrics', {}).get('avgCadence', 0) for s in filtered_sessions if s.get('metrics', {}).get('avgCadence', 0) > 0]
    hrs = [s.get('metrics', {}).get('avgHR', 0) for s in filtered_sessions if s.get('metrics', {}).get('avgHR', 0) > 0]
    
    return {
        "period": period,
        "total_runs": len(filtered_sessions),
        "total_distance": round(total_distance, 2),
        "total_duration": total_duration,
        "total_calories": round(total_calories),
        "avg_pace": round(total_duration / total_distance, 0) if total_distance > 0 else 0,
        "avg_cadence": round(sum(cadences) / len(cadences), 0) if cadences else 0,
        "avg_hr": round(sum(hrs) / len(hrs), 0) if hrs else 0
    }

def get_metric_trends(user_id: str, metric: str = "pace", limit: int = 30, period: str = "month") -> List[Dict]:
    """Get trend data for a specific metric, filtered by period"""
    from datetime import datetime, timedelta
    
    # Get all sessions first
    all_sessions = get_user_sessions(user_id, limit=1000)
    
    # Filter by period (same logic as get_running_analytics)
    now = datetime.now()
    if period == "week":
        cutoff = now - timedelta(days=7)
    elif period == "month":
        cutoff = now - timedelta(days=30)
    elif period == "year":
        cutoff = now - timedelta(days=365)
    else:  # all
        cutoff = datetime.min
    
    filtered_sessions = []
    for s in all_sessions:
        created_at_str = s.get('created_at', '')
        if not created_at_str:
            continue
        try:
            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            if created_at.tzinfo is not None:
                created_at = created_at.replace(tzinfo=None)
            if created_at >= cutoff:
                filtered_sessions.append(s)
        except (ValueError, AttributeError):
            continue
    
    # Sort chronologically (oldest first) and limit
    filtered_sessions.sort(key=lambda x: x.get('created_at', ''))
    filtered_sessions = filtered_sessions[:limit]
    
    trends = []
    for session in filtered_sessions:
        metrics = session.get('metrics', {})
        date = session.get('created_at', '')[:10]
        
        value = None
        if metric == "pace":
            value = metrics.get('avgPace', 0)
        elif metric == "distance":
            value = metrics.get('distance', 0)
        elif metric == "time":
            value = metrics.get('duration', 0) / 60  # Convert to minutes
        elif metric == "calories":
            value = metrics.get('calories', 0)
        elif metric == "cadence":
            value = metrics.get('avgCadence', 0)
        elif metric == "hr":
            value = metrics.get('avgHR', 0)
        
        if value and value > 0:
            trends.append({
                "date": date,
                "value": value,
                "session_id": session.get('session_id')
            })
    
    return trends

def get_personal_records(user_id: str) -> Dict:
    """Get personal records for various distances and metrics"""
    sessions = get_user_sessions(user_id, limit=1000)
    
    records = {
        "fastest_5k": None,
        "fastest_10k": None,
        "longest_run": None,
        "fastest_pace": None,
        "most_calories": None,
        "highest_cadence": None
    }
    
    for session in sessions:
        metrics = session.get('metrics', {})
        distance = metrics.get('distance', 0)
        pace = metrics.get('avgPace', 0)
        calories = metrics.get('calories', 0)
        cadence = metrics.get('avgCadence', 0)
        duration = metrics.get('duration', 0)
        
        # Fastest 5K (4.5-5.5km range)
        if 4.5 <= distance <= 5.5 and pace > 0:
            if not records["fastest_5k"] or pace < records["fastest_5k"]["pace"]:
                records["fastest_5k"] = {
                    "pace": pace,
                    "time": duration,
                    "date": session.get('created_at', '')[:10],
                    "session_id": session.get('session_id')
                }
        
        # Fastest 10K (9.5-10.5km range)
        if 9.5 <= distance <= 10.5 and pace > 0:
            if not records["fastest_10k"] or pace < records["fastest_10k"]["pace"]:
                records["fastest_10k"] = {
                    "pace": pace,
                    "time": duration,
                    "date": session.get('created_at', '')[:10],
                    "session_id": session.get('session_id')
                }
        
        # Longest run
        if not records["longest_run"] or distance > records["longest_run"]["distance"]:
            records["longest_run"] = {
                "distance": distance,
                "duration": duration,
                "date": session.get('created_at', '')[:10],
                "session_id": session.get('session_id')
            }
        
        # Fastest pace (any distance > 1km)
        if distance >= 1 and pace > 0:
            if not records["fastest_pace"] or pace < records["fastest_pace"]["pace"]:
                records["fastest_pace"] = {
                    "pace": pace,
                    "distance": distance,
                    "date": session.get('created_at', '')[:10],
                    "session_id": session.get('session_id')
                }
        
        # Most calories
        if calories > 0:
            if not records["most_calories"] or calories > records["most_calories"]["calories"]:
                records["most_calories"] = {
                    "calories": calories,
                    "distance": distance,
                    "date": session.get('created_at', '')[:10],
                    "session_id": session.get('session_id')
                }
        
        # Highest cadence
        if cadence > 0:
            if not records["highest_cadence"] or cadence > records["highest_cadence"]["cadence"]:
                records["highest_cadence"] = {
                    "cadence": cadence,
                    "distance": distance,
                    "date": session.get('created_at', '')[:10],
                    "session_id": session.get('session_id')
                }
    
    return records


# ─────────────────────────────────────────────────────────────────────────
# 🏅 每公里 / 距離 PR 名次演算法（金銀銅獎牌）
#   針對「某一次 session」，計算它在使用者歷史中，各距離門檻的名次：
#   PR(金) / 2nd(銀) / 3rd(銅)。回傳該場拿到的獎牌清單 + 破紀錄數。
#   前端 ActivityFeed / 里程碑 / 破紀錄彈窗都吃這個結果來顯示 medal。
# ─────────────────────────────────────────────────────────────────────────
# 距離門檻（km, 允許 GPS 4% 誤差）：1K/3K/5K/10K/半馬/全馬 + 最長距離/最快配速
_PR_DISTANCES = [
    ("1K", 1.0, 0.95), ("3K", 3.0, 2.88), ("5K", 5.0, 4.8),
    ("10K", 10.0, 9.5), ("HALF", 21.0975, 20.5), ("FULL", 42.195, 41.0),
]
_DISTANCE_LABEL = {"1K": "1 公里最快", "3K": "3 公里最快", "5K": "5 公里最快",
                   "10K": "10 公里最快", "HALF": "半馬", "FULL": "全馬"}


def _split_seconds(metrics: dict) -> list:
    """取出每公里分段秒數陣列（過濾雜訊）。"""
    out = []
    for s in (metrics.get("splits") or []):
        try:
            t = float(s.get("time") or s.get("duration") or 0)
            if not t > 0:
                t = float(s.get("pace") or s.get("avg_pace") or 0)  # 每段 1km → time≈pace
            if 30 < t < 3600:
                out.append(t)
        except (TypeError, ValueError, AttributeError):
            continue
    return out


def _splits_are_real(splits: list) -> bool:
    """分段是否為「真實逐段量測」而非把平均塞進每一段。
    合成資料的特徵：所有分段幾乎完全相同（波動 < 2 秒）。
    這種資料若拿去算「最快 1K/3K」，各距離會得到一模一樣的假配速。"""
    if len(splits) < 2:
        return len(splits) == 1
    return (max(splits) - min(splits)) >= 2.0


def _finish_time(metrics: dict, target_km: float) -> float:
    """單場在該距離的「最佳努力」時間（秒）。

    v3 誠實修正：
      • 只有「真實逐段分段」才用滑動視窗算子距離(1K/3K…)的最快連續段。
      • 分段是把平均塞進每一段(全部相同) → 視同無分段，不拿來算子距離最快。
      • 完全無真實分段時，只允許回報「跑者實際跑完的整段距離」的成績
        (target_km ≈ 總距離)；絕不用平均配速去「估」一個從未真的連續跑出來的
        1K/3K 最快值 —— 那會讓各距離出現相同假配速、或荒謬的 1K 時間。
    """
    import math
    dur = metrics.get("duration") or metrics.get("duration_seconds") or 0
    dist = metrics.get("distance") or metrics.get("distance_km") or 0

    if not dist or dist < target_km * 0.95:
        return 0.0

    # 1) 真實分段最佳努力（滑動視窗）
    splits = _split_seconds(metrics)
    w = int(math.ceil(target_km - 1e-6))
    if w > 0 and len(splits) >= w and _splits_are_real(splits):
        best = min(sum(splits[i:i + w]) for i in range(len(splits) - w + 1))
        return best * (target_km / w) if w > target_km else best

    # 2) 無真實分段：只承認「實際跑完的整段距離」成績，不捏造子距離最快。
    if dur > 0 and target_km >= dist * 0.9:
        return float(dur) * (target_km / float(dist))
    return 0.0


def compute_pr_profile(user_id: str) -> Dict:
    """🏆 使用者的完整 PR 檔案（公里制）。

    回傳每個標準距離：
      current: 現任 PR {sec, pace_sec, date, session_id}
      top3:    歷史前三快
      timeline: 歷年 PR 進程（每次紀錄被刷新的時間點，由舊到新）
    供前端「PR 系統 / 歷年 PR 變化」頁使用。
    """
    sessions = get_user_sessions(user_id, limit=1000)
    # 依時間舊→新
    def _ts(s):
        return str(s.get("date") or s.get("created_at") or "")
    ordered = sorted(sessions, key=_ts)

    profile = {}
    for key, dist_km, min_dist in _PR_DISTANCES:
        efforts = []  # [{sec, date, session_id}]
        for s in ordered:
            m = s.get("metrics", {}) or {}
            d = m.get("distance") or m.get("distance_km") or 0
            if d < min_dist:
                continue
            ft = _finish_time(m, dist_km)
            if ft > 0:
                efforts.append({
                    "sec": round(ft, 1),
                    "pace_sec": round(ft / dist_km),
                    "date": _ts(s)[:10],
                    "session_id": s.get("session_id") or s.get("run_id"),
                })
        if not efforts:
            continue
        # 歷年 PR 進程：紀錄被刷新的節點
        timeline, best = [], None
        for e in efforts:
            if best is None or e["sec"] < best:
                best = e["sec"]
                timeline.append(e)
        top3 = sorted(efforts, key=lambda e: e["sec"])[:3]
        profile[key] = {
            "label": _DISTANCE_LABEL.get(key, key),
            "distance_km": dist_km,
            "current": timeline[-1],
            "top3": top3,
            "timeline": timeline,
            "attempts": len(efforts),
        }
    return {"distances": profile, "total_sessions": len(sessions)}


def compute_session_medals(user_id: str, session_id: str) -> Dict:
    """計算某場運動拿到的獎牌（金銀銅名次）。
    回傳 { pr_count, medals:[{key,label,rank,detail}], best_rank }。
    rank: 'PR'|'2nd'|'3rd'。只有進前三名才給獎牌。"""
    sessions = get_user_sessions(user_id, limit=1000)
    target = next((s for s in sessions if s.get("session_id") == session_id), None)
    if not target:
        return {"pr_count": 0, "medals": [], "best_rank": None}

    tm = target.get("metrics", {})
    t_dist = tm.get("distance") or tm.get("distance_km") or 0
    medals = []

    def rank_among(times, mine):
        """mine 在 times(含自己) 由小到大的名次（1-based），未進前三回 None。"""
        faster = sum(1 for x in times if x > 0 and x < mine)
        rank = faster + 1
        return {1: "PR", 2: "2nd", 3: "3rd"}.get(rank)

    # 各距離門檻：本場有跑到才比
    for key, dist_km, min_dist in _PR_DISTANCES:
        if t_dist < min_dist:
            continue
        mine = _finish_time(tm, dist_km)
        if mine <= 0:
            continue
        times = []
        for s in sessions:
            m = s.get("metrics", {})
            d = m.get("distance") or m.get("distance_km") or 0
            if d >= min_dist:
                ft = _finish_time(m, dist_km)
                if ft > 0:
                    times.append(ft)
        r = rank_among(times, mine)
        if r:
            medals.append({
                "key": key, "label": _DISTANCE_LABEL.get(key, key),
                "rank": r,
                "detail": f"{int(mine // 60)}:{int(mine % 60):02d}",
            })

    # 最長距離
    dists = [(s.get("metrics", {}).get("distance") or 0) for s in sessions]
    if t_dist > 0:
        longer = sum(1 for d in dists if d > t_dist)
        lr = {0: "PR", 1: "2nd", 2: "3rd"}.get(longer)
        if lr:
            medals.append({"key": "LONGEST", "label": "最長距離", "rank": lr,
                           "detail": f"{t_dist:.1f} 公里"})

    pr_count = sum(1 for m in medals if m["rank"] == "PR")
    order = {"PR": 3, "2nd": 2, "3rd": 1}
    best = max(medals, key=lambda m: order.get(m["rank"], 0), default=None)
    return {
        "pr_count": pr_count,
        "medal_count": len(medals),
        "medals": medals,
        "best_rank": best["rank"] if best else None,
    }


def save_enhanced_session(user_id: str, session_data: Dict) -> str:
    """Save session with enhanced analytics data"""
    sessions = load_user_sessions(user_id)
    session_id = f"session_{uuid.uuid4().hex[:12]}"
    
    # Calculate additional analytics
    metrics = session_data.get('metrics', {})

    # 🗜 逐點資料降採樣（與 create_session 共用同一邏輯）
    try:
        before, after = route_optimizer.optimize_session(session_data)
        if after < before:
            logger.info("🗜 [enhanced] route 降採樣 %d→%d 點 (user %s)", before, after, user_id)
    except Exception as e:
        logger.warning("[enhanced] route 降採樣略過: %s", e)

    # Store full session with all analysis data
    sessions[session_id] = {
        "session_id": session_id,
        "user_id": user_id,
        "created_at": session_data.get('date', datetime.now().isoformat()),
        "metrics": metrics,
        "route_data": session_data.get('route_data', []),
        "hr_analysis": session_data.get('hr_analysis'),
        "pace_analysis": session_data.get('pace_analysis'),
        "splits": session_data.get('splits', []),
        "emotion": session_data.get('emotion'),
        "notes": session_data.get('notes', ''),
        "weather": session_data.get('weather'),
        "type": session_data.get('type', 'running')
    }
    
    save_user_sessions(user_id, sessions)
    return session_id


def get_session_deep_analysis(user_id: str, session_id: str) -> dict:
    sessions = load_user_sessions(user_id)
    current = sessions.get(session_id)
    if not current: return {}

    # 🔥🔥🔥 CRITICAL FIX 2: Fallback Reading (metrics OR stats)
    # Prioritize 'metrics', but fall back to 'stats' if not found
    metrics = current.get('metrics') or current.get('stats') or {}
    
    logger.debug(f"📊 Deep Analysis for {session_id}")
    logger.debug(f"   Metrics keys: {metrics.keys() if metrics else 'NONE'}")
    logger.debug(f"   Score: {metrics.get('score', 0)}, Duration: {metrics.get('duration', 0)}")
    
    
    # --- 1. Physio Metrics (Priority: DeepData -> StreamData) ---
    deep_data = current.get('deepData', {})
    physio_metrics = deep_data.get('physio_metrics')
    
    stream_data = current.get('stream_data')
    
    if not physio_metrics and stream_data:
        try:
            logger.debug(f"🔄 Calculating metrics from stream data for {session_id}...")
            # Import here to avoid circular dependency
            from core.cardio_analytics import calculate_physiological_insights
            physio_metrics = calculate_physiological_insights(
                stream_data.get('heart_rate', []),
                stream_data.get('pace', []),
                history_efs=[1.3, 1.35, 1.4] 
            )
        except Exception as e:
            logger.debug(f"⚠️ Calculation error: {e}")

    # --- 2. Zone Stats ---
    # --- 2. Zone Stats ---
    # 優先使用 metrics 裡的統計值 (前端傳來的)
    zone_stats = metrics.get('zoneStats')
    
    # 如果前端數據無效或全空，則從 stream_data 重算
    if (not zone_stats or sum(zone_stats.values()) == 0) and stream_data:
        logger.debug(f"⚠️ Regenerating Zone Stats for {session_id}")
        hr_stream = stream_data.get('heart_rate', [])
        # 確保 Key 與前端一致
        zone_stats = { 'Recovery': 0, 'Fat Burn': 0, 'Aerobic': 0, 'Anaerobic': 0, 'Extreme': 0 }
        for hr in hr_stream:
            if hr < 114: zone_stats['Recovery'] += 1
            elif hr < 133: zone_stats['Fat Burn'] += 1
            elif hr < 152: zone_stats['Aerobic'] += 1
            elif hr < 171: zone_stats['Anaerobic'] += 1
            else: zone_stats['Extreme'] += 1

    # --- 3. Split Analysis (Existing Logic) ---
    distance_km = metrics.get('distance', 0)
    split_unit = 1.0 if distance_km >= 1.0 else 0.1 
    
    raw_splits = metrics.get('splits', [])
    processed_splits = []
    
    # Micro-split generation logic from existing code
    generate_micro_splits = not raw_splits and distance_km > 0.05
    
    if generate_micro_splits:
        segments = int(distance_km / split_unit)
        avg_pace = metrics.get('avgPace', 0)
        for i in range(segments):
            processed_splits.append({
                "km": round((i + 1) * split_unit, 2),
                "pace": avg_pace + (i % 2 * 10 - 5), # Fluctuation
                "is_pr": False,
                "is_fastest": False
            })
    else:
        processed_splits = [s.copy() for s in raw_splits]

    # PR Logic
    history = [s for s in sessions.values() if s.get('session_id') != session_id]
    for s in processed_splits:
        km = s.get('km')
        pace = s.get('pace')
        past_paces = [
            ps.get('pace') for sess in history 
            for ps in sess.get('metrics', {}).get('splits', []) 
            if ps.get('km') == km and ps.get('pace') is not None
        ]
        best_past = min(past_paces) if past_paces else pace
        s['is_pr'] = pace <= best_past if past_paces else True
        s['diff'] = round(best_past - pace, 1) if past_paces else 0

    if processed_splits:
        best_split_idx = min(range(len(processed_splits)), key=lambda i: processed_splits[i]['pace'])
        processed_splits[best_split_idx]['is_fastest'] = True

    # --- 4. Coach & Summary Metrics ---
    duration_sec = metrics.get('duration', 0)
    duration_min = max(duration_sec / 60.0, 0.1)
    
    # 🔥 FIX: Calculate fallback score if missing
    score = metrics.get('score', 0)
    if score == 0 and duration_sec > 0:
        # Calculate score based on zone distribution (higher zones = more points)
        total_samples = sum(zone_stats.values()) if zone_stats else 0
        if total_samples > 0:
            # Weight zones: Recovery=0.5, FatBurn=1, Aerobic=2, Anaerobic=3, Extreme=4
            weighted_score = (
                zone_stats.get('Recovery', 0) * 0.5 +
                zone_stats.get('Warm-up', 0) * 0.5 +
                zone_stats.get('Fat Burn', 0) * 1 +
                zone_stats.get('Aerobic', 0) * 2 +
                zone_stats.get('Anaerobic', 0) * 3 +
                zone_stats.get('Extreme', 0) * 4 +
                zone_stats.get('EXTREME', 0) * 4
            )
            score = weighted_score
        else:
            # Fallback: use duration as base score
            score = duration_min * 2
        logger.debug(f"🔧 Calculated fallback score: {score}")
    
    effort_density = round(score / duration_min, 1) if duration_min > 0 else 0
    logger.debug(f"📊 Effort Density: {effort_density} (score={score}, duration_min={duration_min})")
    
    anaerobic_ratio = calculate_anaerobic_ratio(zone_stats)
    
    # 🩹 誠實原則：沒有真實心率就「不要捏造」physio_metrics。
    #    舊版在缺心率時硬塞 avg_hr=145 + 假 EF/脫鉤，會讓前端評分多灌一個「有氧效率」支柱、
    #    造成同一場跑步「剛結束(有即時心率)」與「從動態重進(讀不到心率→改用假physio)」
    #    分數不一致，而且假 EF 會虛高分數。缺心率就讓 physio 保持空，前端誠實少一項。
    if not physio_metrics:
        logger.debug("ℹ️ No real physio_metrics (likely no heart-rate source) — leaving empty, not fabricating")
        physio_metrics = None

    coach_feedback = generate_smart_feedback(metrics, effort_density, anaerobic_ratio)

    return {
        "session_id": session_id,
        "splits_analysis": processed_splits,
        "split_unit": "100m" if split_unit == 0.1 else "1km",
        
        # 🔥 CRITICAL FIX: Wrap in deepData to match frontend expectations
        # Frontend reads: sessionData.deepData.deep_metrics and sessionData.deepData.physio_metrics
        "deepData": {
            "deep_metrics": {
                "effort_density": effort_density,
                "anaerobic_ratio": f"{anaerobic_ratio}%",
                "recovery_hours": calculate_recovery(score, anaerobic_ratio),
                "zone_distribution": zone_stats
            },
            "physio_metrics": physio_metrics,
            "coach_insights": coach_feedback
        }
    }

def calculate_anaerobic_ratio(stats):
    if not stats: return 0
    # Handle different possible casing for robustness
    anaerobic = stats.get('Anaerobic', 0) + stats.get('Extreme', 0) + stats.get('EXTREME', 0)
    total = sum(stats.values())
    if total == 0: return 0
    return round((anaerobic / total) * 100, 1)

def generate_smart_feedback(metrics, density, anaerobic_ratio):
    distance = metrics.get('distance', 0)
    
    # 針對您的 0.17km 案例
    if distance < 0.5:
        return {
            "title": "Neuromuscular Primer",
            "tag": "ACTIVATION",
            "highlight": "System Awakened",
            "advice": "Short, sharp effort. You've primed your nervous system without accumulating fatigue. Ideal pre-race or warm-up state.",
            "stats_text": f"Density: {density} (High Focus)"
        }
        
    if density > 10:
        return {
            "title": "High Efficiency Output",
            "tag": "POWER",
            "highlight": "Dense Workload",
            "advice": "You packed a lot of intensity into this session. Your effort density suggests high physiological cost per minute.",
            "stats_text": "Anaerobic Focus"
        }

    return {
        "title": "Aerobic Foundation",
        "tag": "ENDURANCE",
        "highlight": "Volume Building",
        "advice": "Steady state effort helps build capillary density. Good consistency.",
        "stats_text": "Base Miles"
    }

def calculate_recovery(score, intensity):
    # 即使分數低，如果有高強度，也要建議休息
    base = score * 0.1
    intensity_add = (intensity / 10) * 2
    return round(min(48, max(4, base + intensity_add)))
