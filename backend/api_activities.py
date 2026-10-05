# ============================================================================
# api_activities.py — Activities & Social Feed Router
# Extracted from main.py to reduce file size.
# Contains:
#   /api/activity/manual, /api/activity/calendar, /api/activity/weekly
#   /api/activities/feed, /api/activities/user, /api/activities/create,
#   /api/activities/{id} (PUT/DELETE), /api/activities/{id}/like,
#   /api/activities/{id}/kudos, /api/activities/{id}/comments (POST/GET)
#   /api/feed/global
# ============================================================================

from fastapi import APIRouter, HTTPException, Form, File, UploadFile, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import os
import uuid
import shutil

import core.social as social
from api_moderation import filter_text as _filter_text
from core.route_privacy import trim_route_for_others
import core.activity_logger as activity_logger
import core.workout_history as workout_history

# ── DATA_DIR / UPLOAD_DIR：與 main.py 相同的計算方式 ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

# SocialStorage 無狀態，重新實例化安全（與 main.py 指向同一 DATA_DIR）
social_storage = social.SocialStorage(DATA_DIR)

router = APIRouter(tags=["Activities"])

# ── 使用者內容的上限與上傳白名單 ──
CAPTION_MAX = 2200
COMMENT_MAX = 500
NAME_MAX = 40
# 只收圖片副檔名：以前副檔名照抄使用者給的檔名，傳一個 .html／.svg 上來，
# 就會被 /static/uploads 以網頁身分送出（同源 XSS）。
_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"}
_PHOTO_MAX_BYTES = 12 * 1024 * 1024


def _save_photo(photo: UploadFile) -> str:
    ext = (os.path.splitext(photo.filename or "")[1] or ".jpg").lower()
    if ext not in _PHOTO_EXTS:
        raise HTTPException(status_code=422, detail="只支援 JPG／PNG／HEIC／WEBP／GIF 圖片")
    ctype = (photo.content_type or "").lower()
    if ctype and not ctype.startswith("image/") and ctype != "application/octet-stream":
        raise HTTPException(status_code=422, detail="只支援圖片檔")
    photo_filename = f"activity_{uuid.uuid4()}{ext}"
    photo_path = os.path.join(UPLOAD_DIR, photo_filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    written = 0
    with open(photo_path, "wb") as buffer:
        while True:
            chunk = photo.file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > _PHOTO_MAX_BYTES:
                buffer.close()
                try:
                    os.remove(photo_path)
                except OSError:
                    pass
                raise HTTPException(status_code=413, detail="照片太大（上限 12MB）")
            buffer.write(chunk)
    return f"/static/uploads/{photo_filename}"


def _for_viewer(item: dict, viewer_id: Optional[str]) -> dict:
    """別人的貼文：路線剪掉起終點附近（隱私區），不讓陌生人從動態牆找到住處。"""
    if isinstance(item, dict) and item.get("user_id") != viewer_id and item.get("route_preview"):
        item = dict(item)
        item["route_preview"] = trim_route_for_others(item.get("route_preview"))
    return item


# ============================================================================
# Group 1: /api/activity/* — Activity Logger (manual, calendar, weekly)
# ============================================================================

@router.post("/api/activity/manual")
async def add_manual_activity(
    user_id: str = Form(...),
    activity_type: str = Form(...),
    duration_mins: int = Form(...),
    notes: str = Form(""),
    date: str = Form(None)
):
    """Add a manual activity entry"""
    try:
        activity_data = {
            "activity_type": activity_type,
            "duration_mins": duration_mins,
            "notes": notes,
            "date": date or datetime.now().date().isoformat()
        }
        
        entry = activity_logger.add_manual_activity(user_id, activity_data)
        return {"status": "success", "activity": entry}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/activity/calendar/{user_id}")
async def get_activity_calendar(user_id: str, days: int = 30):
    """Get calendar heatmap data for user activities"""
    try:
        # Combine workout history and manual activities
        workout_hist = workout_history.get_user_workout_history(user_id, limit=1000)
        manual_activities = activity_logger.get_user_activities(user_id, days=days)
        
        # Merge dates
        all_dates = []
        for w in workout_hist:
            all_dates.append(w.get("timestamp", "").split("T")[0])
        for a in manual_activities:
            all_dates.append(a.get("date", ""))
        
        heatmap = activity_logger.generate_calendar_heatmap(user_id, days=days)
        
        return {
            "user_id": user_id,
            "heatmap": heatmap,
            "total_activities": len(set(all_dates))
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/activity/weekly/{user_id}")
async def get_weekly_summary(user_id: str):
    """Get weekly activity summary"""
    try:
        summary = activity_logger.get_weekly_summary(user_id)
        return {"user_id": user_id, **summary}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ============================================================================
# Group 2: /api/activities/* — Social Activities (Feed, CRUD, Kudos, Comments)
# ============================================================================

@router.get("/api/activities/feed")
async def get_activity_feed(user_id: str, skip: int = 0, limit: int = 20):
    """Get personalized activity feed"""
    activities = social_storage.get_feed(user_id, skip, limit)
    from api_moderation import visible_activities   # 封鎖的人、檢舉過／已移除的貼文不出現
    items = [_for_viewer(a, user_id) for a in visible_activities([a.dict() for a in activities], user_id)]
    return {"activities": items, "has_more": len(activities) == limit}

@router.get("/api/feed/global")
async def get_global_feed(user_id: str, limit: int = 20, community: Optional[str] = None):
    """Get global activity feed with optional community filter"""
    activities = social_storage.get_feed(user_id, 0, limit, community)
    from api_moderation import visible_activities   # 封鎖的人、檢舉過／已移除的貼文不出現
    items = [_for_viewer(a, user_id) for a in visible_activities([a.dict() for a in activities], user_id)]
    return {"items": items, "has_more": len(activities) == limit}

@router.get("/api/activities/user/{user_id}")
async def get_user_activities(user_id: str, limit: int = 50):
    """
    Get activities for a specific user.

    以前回傳三筆寫死的假活動（2024 年的 8.4km／12.1km）—— 每個人的個人頁都一樣。
    改成真的社群貼文：看自己 → 全部；看別人 → 只有公開的，並套用封鎖／檢舉過濾。
    """
    from identity_guard import CURRENT_USER_ID
    viewer = CURRENT_USER_ID.get()
    limit = max(1, min(int(limit or 50), 200))
    rows = [a for a in (social_storage._load_json(social_storage.activities_file) or [])
            if isinstance(a, dict) and a.get("user_id") == user_id]
    if viewer != user_id:
        rows = [a for a in rows if a.get("privacy", "public") == "public"]
        from api_moderation import visible_activities
        rows = [_for_viewer(a, viewer) for a in visible_activities(rows, viewer)]
    rows.sort(key=lambda a: str(a.get("created_at") or ""), reverse=True)
    return {"activities": rows[:limit], "user_id": user_id}


def _json_list(raw, *, limit=20, item_max=60):
    """表單裡的 JSON 陣列字串 → 乾淨的字串清單；壞掉就回 None（呼叫端決定要不要覆寫）。"""
    if raw is None:
        return None
    try:
        val = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return None
    if not isinstance(val, list):
        return None
    out = []
    for x in val:
        t = str(x or '').strip()[:item_max]
        if t and t not in out:
            out.append(t)
    return out[:limit]


def _clamp_pos(raw, default=50):
    try:
        return max(0, min(100, int(float(raw))))
    except (ValueError, TypeError):
        return default


VALID_PRIVACY = ("public", "followers", "friends", "private")
VALID_COMMUNITIES = ("run", "fitness")


@router.post("/api/activities/create")
async def create_activity(
    user_id: str = Form(...),
    user_name: str = Form(...),
    session_data: str = Form(...),
    caption: str = Form(""),
    privacy: str = Form("public"),
    activity_type: Optional[str] = Form(None), 
    photo: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    communities: Optional[str] = Form(None),
    img_pos: Optional[str] = Form(None),
):
    """Create new activity from workout with multipart file support"""
    try:
        print(f"📥 Received activity creation request from user: {user_id}")
        session = json.loads(session_data)
        print(f"📊 Session data parsed successfully. Stats: {session.get('stats')}")
        
        # Determine Activity & Community Type
        final_type = activity_type or session.get('activity_type', 'run')
        stats = session.get('stats', {})
        
        def safe_int(value, default=0):
            try:
                return int(float(value)) if value is not None else default
            except (ValueError, TypeError):
                return default

        def safe_float(value, default=0.0):
            try:
                return float(value) if value is not None else default
            except (ValueError, TypeError):
                return default

        volume_kg = safe_int(stats.get('volume_kg'))

        # ⚠️ 2026-09 稽核：這裡原本只認 'fitness' 一個字，
        #    但 FitnessCompletionCard 送的是 'strength'（前端兩種寫法都有）。
        #    結果徒手／核心訓練（volume_kg = 0）會落到 else 分支，
        #    被標成 community='cardio'、final_type='run' ——
        #    重訓打卡跑進跑步社群牆，變成一張 0 公里的跑步卡，
        #    而健身社群牆反而完全看不到它。
        #    純照片／文字貼文（'post'）也不該被硬轉成跑步。
        STRENGTH_TYPES = ('fitness', 'strength')
        if final_type in STRENGTH_TYPES or volume_kg > 0:
            community = 'fitness'
            final_type = 'fitness' # normalize
        elif final_type == 'post':
            community = 'cardio'   # 一般貼文歸主社群牆，但保留 'post' 型別
        else:
            community = 'cardio'
            final_type = 'run' # normalize

        photo_url = None
        if photo:
            try:
                photo_url = _save_photo(photo)
                print(f"📸 Photo uploaded and saved: {photo_url}")
            except HTTPException:
                raise
            except Exception as e:
                print(f"[ERROR] Error saving photo: {e}")
        
        # Smart sampling for route preview (approx 200 points for better map quality)
        full_route = session.get('route', [])
        if full_route and len(full_route) > 0:
            target_points = 200
            if len(full_route) <= target_points:
                route_preview = full_route
            else:
                step = max(1, len(full_route) // target_points)
                route_preview = full_route[::step]
            print(f"🗺️ Route sampled: {len(full_route)} -> {len(route_preview)} points")
        else:
            route_preview = []
            print("[WARNING] No route data in session")

        activity = social.Activity(
            activity_id=str(uuid.uuid4()), user_id=user_id, user_name=(user_name or '').strip()[:NAME_MAX] or 'User',
            session_id=session.get('session_id', str(uuid.uuid4())), 
            activity_type=final_type,
            community=community,
            distance_km=safe_float(stats.get('distance')),
            duration_seconds=safe_int(stats.get('duration')),
            pace_per_km=safe_int(stats.get('pace')),
            calories=safe_int(stats.get('calories')),
            elevation_gain=safe_int(stats.get('elevationGain')),
            volume_kg=volume_kg, 
            sets_completed=safe_int(stats.get('sets_completed', stats.get('sets', 0))),
            exercises=session.get('exercises', []),
            caption=_filter_text((caption or '')[:CAPTION_MAX]), photo_url=photo_url,   # App Store 1.2：遮掉髒話
            privacy=privacy if privacy in VALID_PRIVACY else "public",
            created_at=datetime.now().isoformat(),
            route_preview=route_preview,
            title=_filter_text((title or '').strip()[:80]) or None,
            location=_filter_text((location or '').strip()[:80]) or None,
            tags=[_filter_text(t) for t in (_json_list(tags) or [])],
            communities=[c for c in (_json_list(communities) or []) if c in VALID_COMMUNITIES] or None,
            img_pos=_clamp_pos(img_pos),
        )
        
        result = social_storage.create_activity(activity).dict()
        print(f"[SUCCESS] Activity created successfully: {result['activity_id']} (Type: {final_type})")
        return result
    except HTTPException:
        raise
    except KeyError as e:
        print(f"[ERROR] Missing required field: {e}")
        raise HTTPException(status_code=400, detail=f"Missing required field in session data: {str(e)}")
    except json.JSONDecodeError as e:
        print(f"[ERROR] Invalid JSON in session_data: {e}")
        raise HTTPException(status_code=400, detail="Invalid session data format")
    except Exception as e:
        print(f"[ERROR] Unexpected error creating activity: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create activity: {str(e)}")

@router.put("/api/activities/{activity_id}")
async def update_activity(
    activity_id: str,
    user_id: str = Form(...),
    caption: str = Form(None),
    photo: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    privacy: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    communities: Optional[str] = Form(None),
    img_pos: Optional[str] = Form(None),
    clear: Optional[str] = Form(None),
):
    """編輯貼文（只有作者本人）。

    沒送的欄位不動。要清空標題／地點／標註 → clear=["title","location","tags"]
    （表單的空字串會被 FastAPI 當成「沒送」，不能拿空字串當清空訊號）。
    ⚠️ 前端以前沒帶 user_id —— 這裡 user_id 是必填，於是每次編輯都 422，
       畫面上改了、一重新整理就變回去。前端已補上。
    """
    try:
        activity = social_storage.get_activity(activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        # 與刪除同一套判定（user_123 / user123 視為同一人）
        is_owner = (activity.user_id == user_id) or (activity.user_id.replace('_', '') == user_id.replace('_', ''))
        if not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized to edit this activity")

        # 編輯也要過濾：以前只有發文時遮髒話，發完再編輯就能繞過
        if caption is not None:
            activity.caption = _filter_text(caption[:CAPTION_MAX])
        if title is not None:
            activity.title = _filter_text(title.strip()[:80]) or None
        if location is not None:
            activity.location = _filter_text(location.strip()[:80]) or None
        if privacy is not None and privacy in VALID_PRIVACY:
            activity.privacy = privacy
        parsed_tags = _json_list(tags)
        if parsed_tags is not None:
            activity.tags = [_filter_text(t) for t in parsed_tags]
        parsed_comm = _json_list(communities)
        if parsed_comm is not None:
            activity.communities = [c for c in parsed_comm if c in VALID_COMMUNITIES] or None
        if img_pos is not None:
            activity.img_pos = _clamp_pos(img_pos, activity.img_pos if activity.img_pos is not None else 50)
        for field in (_json_list(clear) or []):
            if field in ('title', 'location'):
                setattr(activity, field, None)
            elif field == 'tags':
                activity.tags = []

        if photo:
            activity.photo_url = _save_photo(photo)

        social_storage.update_activity(activity)
        return activity.dict()
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error updating activity: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update activity: {str(e)}")

@router.delete("/api/activities/{activity_id}")
async def delete_activity(activity_id: str, user_id: str):
    """Delete activity (only by owner)"""
    try:
        # Get activity first to verify it exists and ownership
        activity = social_storage.get_activity(activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        # Handle user_123 vs user123 mismatch
        is_owner = (activity.user_id == user_id) or (activity.user_id.replace('_', '') == user_id.replace('_', ''))
        
        if not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized to delete this activity")
        
        success = social_storage.delete_activity(activity_id, user_id)
        if success:
            return {"success": True, "message": "Activity deleted"}
        else:
            raise HTTPException(status_code=404, detail="Activity not found or already deleted")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error deleting activity: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete activity: {str(e)}")


@router.post("/api/activities/{activity_id}/like")
async def like_activity(activity_id: str, user_id: str = Body(..., embed=True), user_name: str = Body("User", embed=True)):
    """Like an activity (Alias for kudos)"""
    # Use existing kudo logic
    return await toggle_kudo(activity_id, user_id=user_id, user_name=user_name, action="add")

@router.post("/api/activities/{activity_id}/kudos")
async def toggle_kudo(activity_id: str, user_id: str = Form(...), user_name: str = Form(...), action: str = Form(...)):
    """Give or remove kudos"""
    user_name = (user_name or '').strip()[:NAME_MAX] or 'User'
    if action == "add":
        kudo = social.Kudo(
            kudo_id=str(uuid.uuid4()), from_user_id=user_id, from_user_name=user_name,
            to_activity_id=activity_id, created_at=datetime.now().isoformat()
        )
        social_storage.add_kudo(kudo)
    else:
        social_storage.remove_kudo(user_id, activity_id)
    
    kudos = social_storage.get_activity_kudos(activity_id)
    # 🩹 activity_id 也可能是 cardio session_id（最新動態的按讚直接掛在 session 上），
    #    此時沒有對應的 social activity 紀錄 — 略過計數回寫即可，不要 500。
    activity = social_storage.get_activity(activity_id)
    if activity is not None:
        activity.kudos_count = len(kudos)
        social_storage.update_activity(activity)
    return {"kudos_count": len(kudos), "user_gave_kudo": action == "add"}

@router.get("/api/activities/{activity_id}/kudos")
async def list_activity_kudos(activity_id: str):
    """誰按了讚 — 回傳這則活動的按讚者名單（最新在前）。"""
    kudos = social_storage.get_activity_kudos(activity_id)
    # 依時間新→舊排序；無 created_at 的排在後面
    kudos_sorted = sorted(
        kudos,
        key=lambda k: (k.created_at or ""),
        reverse=True,
    )
    kudoers = [
        {
            "user_id": k.from_user_id,
            "user_name": k.from_user_name or "User",
            "init": (k.from_user_name or "U")[0],
            "created_at": k.created_at,
        }
        for k in kudos_sorted
    ]
    return {"count": len(kudoers), "kudoers": kudoers}

@router.post("/api/activities/{activity_id}/comments")
async def add_comment(activity_id: str, user_id: str = Form(...), user_name: str = Form(...), content: str = Form(...)):
    """Add comment to activity"""
    from api_moderation import filter_text, blocked_ids   # App Store 1.2：寫入前遮掉髒話
    content = (content or '').strip()
    if not content:
        raise HTTPException(status_code=422, detail="留言不能是空的")
    if len(content) > COMMENT_MAX:
        raise HTTPException(status_code=422, detail=f"留言最多 {COMMENT_MAX} 字")
    content = filter_text(content)
    # 封鎖雙向生效：被貼文作者封鎖（或封鎖了作者）的人不能在他的貼文下留言
    target = social_storage.get_activity(activity_id)
    if target is not None and target.user_id in blocked_ids(user_id):
        raise HTTPException(status_code=403, detail="Action not permitted")
    comment = social.Comment(
        comment_id=str(uuid.uuid4()), user_id=user_id, user_name=(user_name or '').strip()[:NAME_MAX] or 'User',
        activity_id=activity_id, content=content, created_at=datetime.now().isoformat()
    )
    created = social_storage.add_comment(comment)
    comments = social_storage.get_activity_comments(activity_id)
    # 🩹 同上：activity_id 可為 cardio session_id，無對應 activity 時略過計數回寫
    activity = social_storage.get_activity(activity_id) if target is not None else None
    if activity is not None:
        activity.comment_count = len(comments)
        social_storage.update_activity(activity)
    return created.dict()

@router.get("/api/activities/{activity_id}/comments")
async def get_comments(activity_id: str, user_id: Optional[str] = None):
    """Get all comments for an activity（帶 user_id → 濾掉封鎖的人與檢舉過的留言）"""
    comments = [c.dict() for c in social_storage.get_activity_comments(activity_id)]
    if user_id:
        from api_moderation import visible_comments
        comments = visible_comments(comments, user_id)
    return {
        "comments": comments,
        "count": len(comments)
    }
