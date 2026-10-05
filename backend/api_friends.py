from fastapi import APIRouter, HTTPException, Body, Depends, Path, Request
from rate_limit import limiter
from pydantic import BaseModel
from typing import List, Dict, Optional
import os
import json
import uuid
from datetime import datetime, timedelta
from core.friends import friends_storage
from auth_guard import enforce_owner, current_user_id
from core.coach_profile import get_user_profile, load_user_profiles
from core.workout_history import load_workout_history, get_user_workout_history
from core.cardio_storage import load_sessions

router = APIRouter(
    prefix="/api/social/friends",
    tags=["Friends"]
)

# ── 社群統計同步：把使用者本機的真實累積（里程/訓練量）同步到後端，供排行榜計分 ──
#    存在獨立檔 data/social_stats.json，不動既有 session 儲存，避免影響其他功能。
SOCIAL_STATS_PATH = os.path.join(os.path.dirname(__file__), "data", "social_stats.json")

def _load_social_stats() -> Dict:
    try:
        with open(SOCIAL_STATS_PATH, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}

def _save_social_stats(data: Dict):
    try:
        os.makedirs(os.path.dirname(SOCIAL_STATS_PATH), exist_ok=True)
        save_json_atomic(SOCIAL_STATS_PATH, data, indent=2)
    except Exception as e:
        print(f"[social_stats] save failed: {e}")

class SyncStatsPayload(BaseModel):
    user_id: str
    distance_km: float = 0.0
    volume_kg: float = 0.0
    run_count: int = 0

# --- Pydantic Models ---
class FriendRequestPayload(BaseModel):
    from_user_id: str
    to_user_id: str

class FriendResponsePayload(BaseModel):
    user_id: str
    request_id: str
    action: str  # "accept" or "decline"

class BlockPayload(BaseModel):
    user_id: str
    blocked_id: str

class KudoPayload(BaseModel):
    user_id: str
    activity_id: str

class SearchResponse(BaseModel):
    user_id: str
    name: str
    discriminator: Optional[str]
    avatar: Optional[str]
    tag: Optional[str]

class LookupResponse(BaseModel):
    user_id: str
    name: str
    discriminator: Optional[str]
    avatar: Optional[str]
    tag: Optional[str]
    relation: str  # 'none' | 'friend' | 'outgoing' | 'incoming'

# --- Helper ---
def normalize_avatar(avatar_path):
    if not avatar_path:
        return None
    if avatar_path.startswith("http") or not avatar_path.startswith("/static/"):
        return avatar_path
    return f"http://localhost:8000{avatar_path}"

def _blocked_for(viewer: Optional[str]) -> set:
    """全站封鎖名單（雙向，api_moderation）。讀不到就當沒有，不擋整支 API。"""
    if not viewer:
        return set()
    try:
        from api_moderation import blocked_ids
        return blocked_ids(viewer)
    except Exception:
        return set()

# --- Endpoints ---

@router.get("/{user_id}/list")
async def get_friends_list(user_id: str, request: Request):
    """Get all friends and pending incoming requests for a user"""
    try:
        # 這支是「可互看」路由：別人看得到我的好友名單，但「誰送邀請給我」只有我自己能看
        viewer = current_user_id(request)
        is_self = viewer == user_id
        friends = friends_storage.get_friends(user_id)
        profiles = load_user_profiles()

        # 🤝 親密度：一律用 friendships.json 裡持久化的 bond_score。
        #    前端原本自己在記憶體裡累加一個 intimacy，重新整理就歸零 ——
        #    畫面上那個數字是假的。真相只有這一份（見 api_social_challenges 的 bond）。
        bond_by_friend = {}
        try:
            from core.json_cache import load_json_cached
            import os as _os
            _fs_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "data", "friendships.json")
            for fs in (load_json_cached(_fs_path, default=[]) or []):
                pair = {fs.get("user_id_1"), fs.get("user_id_2")}
                if user_id in pair:
                    other = (pair - {user_id}).pop() if len(pair) == 2 else None
                    if other:
                        bond_by_friend[other] = fs.get("bond_score", 0)
        except Exception as _e:
            print(f"bond_score 讀取失敗（不影響好友清單）: {_e}")

        # Hydrate friend data with profiles (bio, tag, is_running)
        hydrated_friends = []
        for f in friends:
            fid = f['user_id']
            prof = profiles.get(fid, {})
            hydrated_friends.append({
                "user_id": fid,
                "name": prof.get("name", f.get("name", "Athlete")),
                "discriminator": prof.get("discriminator", f.get("discriminator", "0000")),
                "avatar": normalize_avatar(prof.get("avatar") or f.get("avatar")),
                "tag": prof.get("tag", "DRVN Athlete"),
                "is_running": prof.get("is_running", False),
                "bond_score": bond_by_friend.get(fid, 0),
            })
            
        pending_requests = friends_storage.get_pending_requests(user_id) if is_self else []
        blocked = _blocked_for(viewer)
        if blocked:
            hydrated_friends = [f for f in hydrated_friends if f["user_id"] not in blocked]
            pending_requests = [r for r in pending_requests if r.get("from_user_id") not in blocked]
        for req in pending_requests:
            if "from_user" in req:
                req["from_user"]["avatar"] = normalize_avatar(req["from_user"].get("avatar"))
                
        return {
            "friends": hydrated_friends,
            "pending_requests": pending_requests
        }
    except Exception as e:
        print(f"Error in get_friends_list: {e}")
        return {"friends": [], "pending_requests": []}

@router.post("/request")
async def send_friend_request(payload: FriendRequestPayload, request: Request):
    # 以前完全不驗身分：未登入也能用任何人的名義送邀請
    enforce_owner(request, payload.from_user_id)
    if payload.to_user_id in _blocked_for(payload.from_user_id):
        raise HTTPException(status_code=403, detail="Action not permitted")
    try:
        req = friends_storage.send_request(payload.from_user_id, payload.to_user_id)
        return {"status": "success", "message": "Friend request sent", "data": req}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/respond")
async def respond_to_friend_request(payload: FriendResponsePayload, request: Request):
    # 以前帶別人的 user_id 就能替對方接受／拒絕邀請
    enforce_owner(request, payload.user_id)
    try:
        success = friends_storage.respond_to_request(payload.user_id, payload.request_id, payload.action)
        if success:
            return {"status": "success", "message": f"Request {payload.action}ed"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/remove")
async def remove_friend_api(request: Request, payload: Dict = Body(...)):
    """Remove a friend connection"""
    user_id = payload.get("user_id")
    friend_id = payload.get("friend_id")
    if not user_id or not friend_id:
        raise HTTPException(status_code=400, detail="Missing IDs")
    # 以前任何人（含未登入）都能拆掉任意兩人的好友關係
    enforce_owner(request, user_id)
    try:
        success = friends_storage.remove_friend(user_id, friend_id)
        if success:
            return {"status": "success", "message": "Friend removed"}
        raise HTTPException(status_code=404, detail="Friendship not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/profile/{user_id}")
async def get_friend_profile(user_id: str, request: Request):
    # 封鎖雙向生效：互相封鎖的人點不開彼此的個人資料
    if user_id in _blocked_for(current_user_id(request)):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        profiles = load_user_profiles()
        profile = profiles.get(user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User not found")
        
        # 🟢 P3 Fix：改讀 DB（Phase 2 後新 session 只寫 DB，舊 JSON 不再更新）
        all_workouts = (get_user_workout_history(user_id) or []) or load_workout_history().get(user_id, [])
        strength_volume = sum(w.get("metrics", {}).get("volume_kg", 0) for w in all_workouts)
        strength_count = len(all_workouts)
        
        all_cardio_raw = load_sessions()
        all_cardio_list = all_cardio_raw.values() if isinstance(all_cardio_raw, dict) else all_cardio_raw
        user_cardio = [s for s in all_cardio_list if s.get("user_id") == user_id]
        run_distance = sum(s.get("metrics", {}).get("distance", 0) for s in user_cardio)
        run_count = len(user_cardio)
        
        return {
            "user_id": user_id,
            "name": profile.get("name", "Unknown"),
            "discriminator": profile.get("discriminator", "0000"),
            "avatar": normalize_avatar(profile.get("avatar")),
            "coverPhoto": normalize_avatar(profile.get("coverPhoto")),
            "tag": profile.get("tag", "DRVN Athlete"),
            "bio": profile.get("bio", ""),
            # 個人資料預覽的「徽章」：使用者自己手機算出、同步上來的已解鎖徽章
            "badges": _load_badges().get(user_id, []),
            "stats": {
                "strength_volume": strength_volume,
                "strength_count": strength_count,
                "run_distance": round(run_distance, 2),
                "run_count": run_count,
                "total_workouts": strength_count + run_count
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Profile error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── 🔒 動態分享隱私：使用者可在 Profile 設定關閉「分享我的運動動態」 ──
PRIVACY_PATH = os.path.join(os.path.dirname(__file__), "data", "social_privacy.json")

def _load_privacy():
    try:
        with open(PRIVACY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_privacy(data):
    os.makedirs(os.path.dirname(PRIVACY_PATH), exist_ok=True)
    save_json_atomic(PRIVACY_PATH, data, indent=2)
@router.post("/privacy")
async def set_share_privacy(request: Request, payload: Dict = Body(...)):
    """設定是否對好友分享自己的運動動態（預設 True）。"""
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    # 只能改自己的：以前任何人帶別人的 user_id 就能把對方的動態分享關掉／打開
    enforce_owner(request, uid)
    data = _load_privacy()
    data[uid] = {"share_activities": bool(payload.get("share_activities", True))}
    _save_privacy(data)
    return {"ok": True, **data[uid]}

# ── 🏅 已解鎖徽章展示：徽章在使用者自己的手機上計算，這裡只存「別人看得到的結果」 ──
BADGES_PATH = os.path.join(os.path.dirname(__file__), "data", "social_badges.json")
_MAX_SHOWCASE_BADGES = 80

def _load_badges():
    try:
        with open(BADGES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _clean_badge(b):
    """只收展示需要的欄位，字串截短 —— 外部送進來的資料不直接落地。"""
    if not isinstance(b, dict):
        return None
    bid = str(b.get("id") or "")[:80]
    name = str(b.get("name") or "")[:40]
    if not bid or not name:
        return None
    img = b.get("image")
    img = str(img)[:200] if isinstance(img, str) and img.startswith("/") else None
    return {
        "id": bid,
        "name": name,
        "tier": str(b.get("tier") or "")[:16],
        "icon": str(b.get("icon") or "")[:8],
        "image": img,
    }

@router.post("/badges")
async def set_showcase_badges(request: Request, payload: Dict = Body(...)):
    """使用者把自己已解鎖的徽章同步上來，讓別人點開個人資料預覽時看得到。"""
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    enforce_owner(request, uid)   # 只能改自己的
    raw = payload.get("badges") or []
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="badges must be a list")
    cleaned = [c for c in (_clean_badge(b) for b in raw[:_MAX_SHOWCASE_BADGES]) if c]
    data = _load_badges()
    data[uid] = cleaned
    os.makedirs(os.path.dirname(BADGES_PATH), exist_ok=True)
    save_json_atomic(BADGES_PATH, data, indent=2)
    return {"ok": True, "count": len(cleaned)}

@router.get("/privacy/{user_id}")
async def get_share_privacy(user_id: str):
    data = _load_privacy().get(user_id, {})
    return {"share_activities": data.get("share_activities", True)}


@router.get("/feed/{user_id}")
async def get_friends_feed(user_id: str, request: Request, skip: int = 0, limit: int = 30):
    # 「我的好友動態」只有我自己能看。這支在 identity_guard 的互看清單裡，
    # 所以以前任何登入者帶別人的 id 就能讀到對方所有好友的訓練與貼文。
    enforce_owner(request, user_id)
    try:
        blocked = _blocked_for(user_id)
        friends = [f for f in friends_storage.get_friends(user_id) if f['user_id'] not in blocked]
        # 🔒 尊重好友的分享設定：關閉分享的好友不出現在動態裡（自己永遠看得到自己）
        privacy = _load_privacy()
        friend_ids = [
            f['user_id'] for f in friends
            if privacy.get(f['user_id'], {}).get("share_activities", True)
        ] + [user_id]
        profiles = load_user_profiles()
        feed = []
        
        # Cardio sessions
        all_cardio_raw = load_sessions()
        all_cardio = all_cardio_raw.values() if isinstance(all_cardio_raw, dict) else all_cardio_raw
        for s in all_cardio:
            fid = s.get("user_id")
            if fid in friend_ids:
                prof = profiles.get(fid, {})
                feed.append({
                    "id": s.get("session_id", str(uuid.uuid4())),
                    "uId": fid,
                    "userName": prof.get("name", "Athlete"),
                    "discriminator": prof.get("discriminator", "0000"),
                    "type": "run",
                    "time": s.get("timestamp") or s.get("completed_at"),
                    "createdAt": s.get("timestamp") or s.get("completed_at"),
                    "caption": s.get("drvnCard", {}).get("caption", ""),
                    "stats": s.get("metrics", {}),
                    "kudos": s.get("kudos_count", 0)
                })

        # Strength workouts
        # 🟢 P3 Fix：DB 為主（每人最近 30 筆足夠 feed 使用），舊 JSON 為輔
        legacy_workouts = load_workout_history()
        for fid in friend_ids:
            workouts = (get_user_workout_history(fid, limit=30) or []) or legacy_workouts.get(fid, [])
            for w in workouts:
                prof = profiles.get(fid, {})
                feed.append({
                    "id": w.get("activity_id") or w.get("session_id") or str(uuid.uuid4()),
                    "uId": fid,
                    "userName": prof.get("name", "Athlete"),
                    "discriminator": prof.get("discriminator", "0000"),
                    "type": "strength",
                    "time": w.get("completed_at") or w.get("timestamp"),
                    "createdAt": w.get("completed_at") or w.get("timestamp"),
                    "caption": w.get("session_data", {}).get("drvnCard", {}).get("caption", ""),
                    "stats": w.get("metrics", {}),
                    "kudos": w.get("kudos_count", 0)
                })

        feed.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return {"feed": feed}
    except Exception as e:
        print(f"Feed error: {e}")
        return {"feed": []}

@router.post("/feed/kudo")
async def give_kudo(payload: KudoPayload, request: Request):
    enforce_owner(request, payload.user_id)
    success = friends_storage.add_kudo(payload.user_id, payload.activity_id)
    return {"status": "success" if success else "ignored"}

# ── 好友排行榜 TTL 快取（10 分鐘）────────────────────────────────
# load_sessions() 是跨全用戶聚合，使用者一年資料量下每次現算太重；
# 排行榜本質是「近況比較」，10 分鐘新鮮度完全足夠。
_lb_cache: dict = {}   # { user_id: { "ts": float, "data": dict } }
_LB_TTL = 600.0

@router.get("/leaderboard/{user_id}")
async def get_friends_leaderboard(user_id: str):
    import time as _time
    cached = _lb_cache.get(user_id)
    if cached and _time.time() - cached["ts"] < _LB_TTL:
        return cached["data"]
    try:
        friends = friends_storage.get_friends(user_id)
        friend_ids = [f['user_id'] for f in friends] + [user_id]
        
        # 🟢 P3 Fix：DB 為主（只查排行榜需要的 friend_ids，不做全表掃描），舊 JSON 為輔
        legacy_workouts = load_workout_history()
        all_workouts = {
            fid: ((get_user_workout_history(fid) or []) or legacy_workouts.get(fid, []))
            for fid in friend_ids
        }
        all_cardio_raw = load_sessions()
        all_cardio = all_cardio_raw.values() if isinstance(all_cardio_raw, dict) else all_cardio_raw
        profiles = load_user_profiles()
        social_stats = _load_social_stats()  # 使用者本機同步上來的真實累積
        
        def _streak_days(sessions):
            """連續訓練天數：從今天往回數，看每一天是否有跑步紀錄。"""
            from datetime import date as _date
            done_days = set()
            for s in sessions:
                ts = s.get("created_at") or s.get("date") or ""
                if ts and len(str(ts)) >= 10:
                    done_days.add(str(ts)[:10])  # YYYY-MM-DD
            if not done_days:
                return 0
            streak = 0
            cur = _date.today()
            while cur.isoformat() in done_days:
                streak += 1
                cur = cur.fromordinal(cur.toordinal() - 1)
            return streak

        leaderboard = []
        for fid in friend_ids:
            prof = profiles.get(fid, {})
            user_cardio = [s for s in all_cardio if s.get("user_id") == fid]
            total_dist = sum(s.get("metrics", {}).get("distance", 0) for s in user_cardio)
            user_strength = all_workouts.get(fid, [])
            strength_vol = sum(w.get("metrics", {}).get("volume_kg", 0) for w in user_strength)

            # 合併本機同步的真實累積（取較大者，避免回退；使用者同步後即為真實全球分數）
            synced = social_stats.get(fid) or {}
            if synced:
                total_dist = max(total_dist, float(synced.get("distance_km", 0) or 0))
                strength_vol = max(strength_vol, float(synced.get("volume_kg", 0) or 0))

            # 配速：對所有有效跑步的 avgPace 取平均（秒/km，越小越快）
            paces = []
            elev_total = 0.0
            for s in user_cardio:
                m = s.get("metrics", {}) or {}
                p = m.get("avgPace") or m.get("pace_per_km") or 0
                if p and p > 0:
                    paces.append(float(p))
                # 海拔累積：summary 多半沒有，盡量從 elevation_gain 取，沒有就 0
                elev_total += float(m.get("elevation_gain") or m.get("elevationGain") or 0)
            avg_pace = round(sum(paces) / len(paces)) if paces else 0

            streak = _streak_days(user_cardio)
            score = (total_dist * 10) + (strength_vol / 100)

            # 🏋️ 單項最大重量（真實訓練紀錄）— 給健身排行的單項榜用
            LIFT_PATTERNS = {
                "bench": ("bench", "臥推", "胸推"),
                "squat": ("squat", "深蹲"),
                "deadlift": ("deadlift", "硬舉", "硬拉"),
                "hipThrust": ("hip thrust", "臀推"),
            }
            lifts = {k: 0.0 for k in LIFT_PATTERNS}
            body_weight = 0.0
            for w in user_strength:
                if not body_weight and w.get("body_weight"):
                    try: body_weight = float(w["body_weight"])
                    except (TypeError, ValueError): pass
                for ex in (w.get("exercises") or []):
                    name = str(ex.get("name") or "").lower()
                    for key, pats in LIFT_PATTERNS.items():
                        if any(p in name for p in pats):
                            for st in (ex.get("sets") or []):
                                try: wkg = float(st.get("weight") or 0)
                                except (TypeError, ValueError): wkg = 0
                                if 0 < wkg < 600 and wkg > lifts[key]:
                                    lifts[key] = wkg
                            try: exw = float(ex.get("weight") or 0)
                            except (TypeError, ValueError): exw = 0
                            if 0 < exw < 600 and exw > lifts[key]:
                                lifts[key] = exw

            leaderboard.append({
                "user_id": fid,
                "name": prof.get("name", "Athlete"),
                "discriminator": prof.get("discriminator", "0000"),
                "avatar": normalize_avatar(prof.get("avatar")),
                "score": round(score, 1),
                "metrics": {
                    "run_distance": round(total_dist, 1),
                    "strength_volume": round(strength_vol, 0),
                    "avg_pace_sec": avg_pace,            # 配速榜
                    "elevation_gain": round(elev_total), # 爬升榜（summary 無資料則為 0）
                    "streak_days": streak,               # 自律榜（連續天數）
                    "run_count": len(user_cardio),
                    "lifts": {k: round(v, 1) for k, v in lifts.items()},   # 🏋️ 單項榜
                    "body_weight": round(body_weight, 1),                   # 量級分組
                    "workout_count": len(user_strength),
                }
            })

        leaderboard.sort(key=lambda x: x["score"], reverse=True)

        # 📸 名次升降（rise）+ 長期趨勢（trend）— 用多天排名快照序列。
        #    快照檔 data/leaderboard_snapshots.json，每個觀看者一筆：
        #      { history: [ { date, ranks: {fid: rank} }, ... ] }  最多保留 14 天，每天一筆。
        #    rise  = 昨日名次 − 今日名次（正=上升，短期）
        #    trend = 7 天前名次 − 今日名次（正=長期上升）
        try:
            import os as _os
            from datetime import date as _date
            from core.json_cache import load_json_cached as _load, save_json_atomic as _save
            snap_path = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "data", "leaderboard_snapshots.json"))
            snaps = _load(snap_path, default={}) or {}
            today_str = _date.today().isoformat()

            cur_ranks = {row["user_id"]: i + 1 for i, row in enumerate(leaderboard)}
            entry = snaps.get(user_id) or {}
            history = entry.get("history") or []

            # 取「昨日(最近一筆非今天)」與「約 7 天前」的名次表作基準
            past_entries = [h for h in history if h.get("date") and h["date"] != today_str]
            yesterday_ranks = past_entries[-1]["ranks"] if past_entries else {}
            week_ago_ranks = past_entries[-7]["ranks"] if len(past_entries) >= 7 else (past_entries[0]["ranks"] if past_entries else {})

            for i, row in enumerate(leaderboard):
                cur_rank = i + 1
                uid_row = row["user_id"]
                y = yesterday_ranks.get(uid_row)
                w = week_ago_ranks.get(uid_row)
                row["rank"] = cur_rank
                row["rise"] = (y - cur_rank) if y is not None else 0       # 短期（昨日→今日）
                row["trend"] = (w - cur_rank) if w is not None else 0      # 長期（約7天→今日）

            # 寫入/更新今天這筆（同日覆蓋），保留最多 14 天
            history = [h for h in history if h.get("date") != today_str]
            history.append({"date": today_str, "ranks": cur_ranks})
            history = history[-14:]
            snaps[user_id] = {"history": history}
            _save(snap_path, snaps)
        except Exception as _snap_err:
            print(f"[leaderboard] snapshot skipped: {_snap_err}")
            for i, row in enumerate(leaderboard):
                row.setdefault("rise", 0)
                row.setdefault("trend", 0)
                row.setdefault("rank", i + 1)

        result = {"leaderboard": leaderboard}
        _lb_cache[user_id] = {"ts": _time.time(), "data": result}
        # 快取上限：防長期執行下無限增長
        if len(_lb_cache) > 500:
            oldest = min(_lb_cache, key=lambda k: _lb_cache[k]["ts"])
            _lb_cache.pop(oldest, None)
        return result
    except Exception as e:
        print(f"Leaderboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent-sessions/{user_id}")
async def get_friends_recent_sessions(user_id: str, days: int = 3, limit_per_friend: int = 5):
    """
    回傳「我的好友」最近 N 天內的跑步 session（含 GPS 路線 + 起訖時間），
    供前端 trainingCompanions.detectCompanions 做「一起訓練」自動偵測（仿 Strava）。

    只回傳偵測所需的最小欄位（不含 stream_data / 照片 / 筆記等隱私較高內容）：
      { userId, name, avatar, sessionId, startTime(ms), duration(sec), route:[{lat,lng}] }
    路線做降採樣（最多 40 點），避免 payload 過大。
    """
    try:
        friends = friends_storage.get_friends(user_id)
        friend_ids = [f["user_id"] for f in friends]  # 只比對好友，不含自己
        if not friend_ids:
            return {"sessions": []}

        profiles = load_user_profiles()
        all_cardio_raw = load_sessions()
        all_cardio = list(all_cardio_raw.values()) if isinstance(all_cardio_raw, dict) else list(all_cardio_raw)

        cutoff = datetime.utcnow() - timedelta(days=max(1, days))

        def _parse_ms(ts):
            """ISO 或數字 timestamp → epoch ms；失敗回 None。"""
            if ts is None:
                return None
            if isinstance(ts, (int, float)):
                return int(ts if ts > 1e12 else ts * 1000)  # 秒 → 毫秒
            try:
                s = str(ts).replace("Z", "+00:00")
                return int(datetime.fromisoformat(s).timestamp() * 1000)
            except Exception:
                return None

        def _downsample(route, n=40):
            if not isinstance(route, list) or len(route) <= n:
                return route or []
            step = max(1, len(route) // n)
            return route[::step]

        # 依好友分組，各取最近 limit_per_friend 筆
        by_friend = {fid: [] for fid in friend_ids}
        for s in all_cardio:
            fid = s.get("user_id")
            if fid not in by_friend:
                continue
            raw_ts = s.get("created_at") or s.get("date") or s.get("timestamp")
            start_ms = _parse_ms(raw_ts)
            if start_ms is None:
                continue
            # 只要最近 N 天
            try:
                if datetime.utcfromtimestamp(start_ms / 1000) < cutoff:
                    continue
            except Exception:
                pass
            m = s.get("metrics", {}) or {}
            route = s.get("route_data") or s.get("route") or []
            duration = float(m.get("duration_seconds") or m.get("duration") or 0)
            by_friend[fid].append({
                "userId": fid,
                "name": profiles.get(fid, {}).get("name", "Athlete"),
                "avatar": normalize_avatar(profiles.get(fid, {}).get("avatar")),
                "sessionId": s.get("session_id"),
                "startTime": start_ms,
                "duration": duration,
                "route": _downsample(route),
            })

        sessions = []
        for fid, arr in by_friend.items():
            arr.sort(key=lambda x: x["startTime"], reverse=True)
            sessions.extend(arr[:max(1, limit_per_friend)])

        # 🏋️ 重訓 session（無 GPS）→ 供「一起練」時間重疊偵測 + 動態卡顯示對方數據。
        #    只回傳偵測/顯示所需最小欄位（不含逐組明細）。
        try:
            from repositories import workout_session_repo
            for fid in friend_ids:
                recs = workout_session_repo.get_history(fid, max(1, limit_per_friend) * 2) or []
                picked = []
                for r in recs:
                    start_ms = _parse_ms(r.get("timestamp") or r.get("date"))
                    if start_ms is None:
                        continue
                    try:
                        if datetime.utcfromtimestamp(start_ms / 1000) < cutoff:
                            continue
                    except Exception:
                        pass
                    dur = float(r.get("duration_mins", 0) or 0) * 60
                    picked.append({
                        "userId": fid,
                        "name": profiles.get(fid, {}).get("name", "Athlete"),
                        "avatar": normalize_avatar(profiles.get(fid, {}).get("avatar")),
                        "sessionId": r.get("session_id"),
                        "type": "strength",
                        "startTime": start_ms,
                        "duration": dur,
                        "route": [],
                        "metrics": {
                            "volume": float(r.get("total_volume", 0) or 0),
                            "duration": dur,
                            "sets": r.get("completed_sets_count") or 0,
                        },
                    })
                    if len(picked) >= max(1, limit_per_friend):
                        break
                sessions.extend(picked)
        except Exception as _e:
            print(f"[recent-sessions] strength merge skipped: {_e}")

        return {"sessions": sessions}
    except Exception as e:
        print(f"[recent-sessions] error: {e}")
        # 偵測是加值功能，出錯不應讓前端崩潰 → 回空陣列
        return {"sessions": []}


@router.post("/sync-stats")
async def sync_social_stats(payload: SyncStatsPayload, request: Request):
    """前端把使用者本機的真實累積（里程 km / 訓練量 kg）同步上來，供排行榜計分。"""
    # 只能同步自己的：以前帶別人的 id 就能改寫別人在排行榜上的分數
    enforce_owner(request, payload.user_id)
    stats = _load_social_stats()
    stats[payload.user_id] = {
        "distance_km": round(float(payload.distance_km or 0), 2),
        "volume_kg": round(float(payload.volume_kg or 0), 1),
        "run_count": int(payload.run_count or 0),
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_social_stats(stats)
    return {"status": "success", "stats": stats[payload.user_id]}


@router.get("/lookup", response_model=LookupResponse)
@limiter.limit("30/minute")
async def lookup_by_friend_code(
    request: Request,
    name: str,
    disc: str,
    user_id: Optional[str] = None,
):
    """
    Precise lookup by Friend Code (Name#1234).
    Used by the onboarding "invite by friend code" component because
    HTTP path params can't safely carry the '#' character.
    """
    try:
        target_name = (name or "").strip()
        target_disc = (disc or "").strip().lstrip("#")
        if not target_name or not target_disc:
            raise HTTPException(status_code=400, detail="Name and disc are required")

        profiles = load_user_profiles()
        hit_uid, hit_prof = None, None
        for uid, prof in profiles.items():
            prof_name = (prof.get("name") or "").strip()
            prof_disc = str(prof.get("discriminator") or "").strip()
            if prof_name.lower() == target_name.lower() and prof_disc == target_disc:
                hit_uid, hit_prof = uid, prof
                break

        if not hit_uid:
            raise HTTPException(status_code=404, detail="No athlete with that friend code")

        if user_id and hit_uid == user_id:
            raise HTTPException(status_code=400, detail="That's your own friend code")

        if user_id and friends_storage.is_blocked(user_id, hit_uid):
            raise HTTPException(status_code=403, detail="Action not permitted")

        # relationship hint helps the frontend render the right CTA
        relation = "none"
        if user_id:
            if friends_storage.are_friends(user_id, hit_uid):
                relation = "friend"
            else:
                # check pending
                pending_to_me = friends_storage.get_pending_requests(user_id)
                if any(r.get("from_user_id") == hit_uid for r in pending_to_me):
                    relation = "incoming"
                else:
                    # any outgoing from me?
                    all_reqs = friends_storage._load_json(friends_storage.requests_file)
                    if any(
                        r.get("status") == "pending"
                        and r.get("from_user_id") == user_id
                        and r.get("to_user_id") == hit_uid
                        for r in all_reqs
                    ):
                        relation = "outgoing"

        return {
            "user_id": hit_uid,
            "name": hit_prof.get("name", target_name),
            "discriminator": hit_prof.get("discriminator", target_disc),
            "avatar": normalize_avatar(hit_prof.get("avatar")),
            "tag": hit_prof.get("tag", "DRVN Athlete"),
            # NOTE: extra field for the frontend; SearchResponse permits it because
            # FastAPI returns the dict before strict response_model validation in many setups.
            # If strict mode strips it, fall back to the search endpoint.
            "relation": relation,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions/{user_id}")
async def get_follow_suggestions(user_id: str, limit: int = 8):
    """🟢 真實推薦追蹤：從真實使用者檔案挑（排除自己/已加好友/封鎖），
    依「近期有訓練活動」排前面。取代前端 MOCK_USERS 假人。"""
    try:
        profiles = load_user_profiles()
        friends = {f['user_id'] for f in friends_storage.get_friends(user_id)}
        candidates = []
        for uid, prof in profiles.items():
            if uid == user_id or uid in friends:
                continue
            if friends_storage.is_blocked(user_id, uid):
                continue
            name = (prof.get("name") or "").strip()
            if not name:
                continue
            # 活躍度：有訓練紀錄的排前面（DB 為主）
            recent = get_user_workout_history(uid, limit=1) or []
            candidates.append({
                "user_id": uid,
                "name": name,
                "discriminator": prof.get("discriminator", "0000"),
                "avatar": normalize_avatar(prof.get("avatar")),
                "bio": prof.get("bio") or prof.get("tag") or "",
                "active": bool(recent),
                "last_active": (recent[0].get("timestamp") if recent else None),
            })
        # 穩定排序：先依最近活動時間新→舊，再把「有活動的」整體提前
        candidates.sort(key=lambda c: c["last_active"] or "", reverse=True)
        candidates.sort(key=lambda c: not c["active"])
        return {"suggestions": candidates[:max(1, min(limit, 20))]}
    except Exception as e:
        print(f"suggestions error: {e}")
        return {"suggestions": []}


@router.get("/search/{query}", response_model=List[SearchResponse])
@limiter.limit("30/minute")
async def search_users(request: Request, query: str, user_id: Optional[str] = None):
    """
    以好友碼精準搜尋使用者。

    🔴 資安稽核 C-1 修復
    ─────────────────────────────────────────────────────────────────
    原本的比對條件是：
        q_lower in name.lower() or q_lower in uid.lower()
                                or q_lower in f"{name}#{disc}".lower()

    其中 `q_lower in uid.lower()` 是拿查詢字串去比對「user_id 本身的子字串」，
    而且這支端點不需登入。搜一個常見字元就能一次撈出 20 組真實 user_id ——
    這是整條越權攻擊鏈的第一把鑰匙。

    改為只接受完整好友碼（名稱#四碼）的精準比對：
      · 不再比對 user_id
      · 不再做名稱的子字串比對
      · 必須登入（由 identity_guard 全域攔截強制，因為本函式吃 user_id）
      · 每個 IP 每分鐘 30 次

    ⚠️ 前端影響：「打幾個字模糊搜尋使用者」的行為會失效，
       搜尋框的提示文案應改為「請輸入完整好友碼，例如 陳小明#1234」。
       用好友碼加朋友的流程（onboarding）不受影響。
    """
    raw = (query or "").strip()
    if "#" not in raw:
        # 沒有 #四碼 就不比對 —— 避免退化成可列舉的模糊搜尋。
        return []

    target_name, _, target_disc = raw.rpartition("#")
    target_name = target_name.strip()
    target_disc = target_disc.strip()
    if not target_name or not target_disc:
        return []

    try:
        results = []
        for uid, prof in load_user_profiles().items():
            name = (prof.get("name") or "").strip()
            disc = str(prof.get("discriminator") or "").strip()
            if name.lower() != target_name.lower() or disc != target_disc:
                continue
            if user_id and friends_storage.is_blocked(user_id, uid):
                continue
            results.append({
                "user_id": uid, "name": name, "discriminator": disc,
                "avatar": normalize_avatar(prof.get("avatar")), "tag": prof.get("tag")
            })
            if len(results) >= 5:
                break
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# 追蹤圖 API（Follow graph）— 追蹤 / 粉絲 / 好友的單一真相源
# ----------------------------------------------------------------------------
# 名詞（全 app 一致）：
#   追蹤中 following  我追蹤的人
#   粉絲   fans       單方面追蹤我、我沒追回去的人 → 只看得到我的公開/粉絲可見貼文
#   好友   friends    互相追蹤 或 已接受好友請求 → 看得到我的「僅好友」貼文
# 跑步社群與健身社群共用同一張圖。
# ════════════════════════════════════════════════════════════════════════════

class FollowPayload(BaseModel):
    user_id: str            # 我
    target_id: str          # 對方


@router.post("/follow")
async def follow_user_api(payload: FollowPayload, request: Request):
    """追蹤某人。冪等：重複呼叫不會產生重複邊。"""
    # 只能用自己的身分追蹤：以前帶別人的 user_id 就能替對方追蹤任何人
    enforce_owner(request, payload.user_id)
    try:
        ok = friends_storage.follow(payload.user_id, payload.target_id)
        graph = friends_storage.get_graph(payload.user_id)
        return {
            "success": True,
            "changed": ok,
            "relation": friends_storage.relation_to(payload.user_id, payload.target_id),
            "counts": graph["counts"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unfollow")
async def unfollow_user_api(payload: FollowPayload, request: Request):
    enforce_owner(request, payload.user_id)
    try:
        ok = friends_storage.unfollow(payload.user_id, payload.target_id)
        graph = friends_storage.get_graph(payload.user_id)
        return {
            "success": True,
            "changed": ok,
            "relation": friends_storage.relation_to(payload.user_id, payload.target_id),
            "counts": graph["counts"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _hydrate_users(ids: List[str], limit: int = 200) -> List[Dict]:
    """把 user_id 清單補上顯示用的檔案資料（名字/頭貼/tag）。找不到就跳過，不捏造。"""
    if not ids:
        return []
    profiles = load_user_profiles()
    out = []
    for uid in ids[:limit]:
        prof = profiles.get(uid)
        if not prof:
            continue
        out.append({
            "user_id": uid,
            "name": prof.get("name") or "",
            "discriminator": prof.get("discriminator", "0000"),
            "avatar": normalize_avatar(prof.get("avatar")),
            "tag": prof.get("tag") or "",
            "bio": prof.get("bio") or "",
        })
    return out


@router.get("/graph/{user_id}")
async def get_follow_graph(user_id: str, hydrate: bool = True):
    """一次拿到完整社交關係，前端不必各算各的。"""
    try:
        g = friends_storage.get_graph(user_id)
        if hydrate:
            g["following_users"] = _hydrate_users(g["following"])
            g["follower_users"] = _hydrate_users(g["followers"])
            g["friend_users"] = _hydrate_users(g["friends"])
            g["fan_users"] = _hydrate_users(g["fans"])
        return g
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/followers/count")
async def get_followers_count(user_id: str):
    """個人檔案頁的「粉絲」數字。誠實數據：沒有就是 0，不亂補。"""
    try:
        g = friends_storage.get_graph(user_id)
        return {
            "count": g["counts"]["followers"],
            "followers": g["counts"]["followers"],
            "following": g["counts"]["following"],
            "friends": g["counts"]["friends"],
            "fans": g["counts"]["fans"],
        }
    except Exception:
        return {"count": 0, "followers": 0, "following": 0, "friends": 0, "fans": 0}


@router.get("/relation/{user_id}/{target_id}")
async def get_relation(user_id: str, target_id: str):
    try:
        return {"relation": friends_storage.relation_to(user_id, target_id)}
    except Exception:
        return {"relation": "none"}


# ── 推薦追蹤演算法 v2 ────────────────────────────────────────────────────────
# 排序訊號（分數由高到低）：
#   1. 共同好友數（friend-of-friend）        每人 +14，上限 +42
#   2. 同運動屬性（跑者對跑者 / 舉重對舉重） +25；混合型 +12
#   3. 近 14 天有訓練紀錄（真的活著）        +20
#   4. 同城市                                +12
#   5. 已經追蹤我（追回去很自然）            +30
# 跑步社群與健身社群呼叫同一支，只是 sport 參數不同 → 兩邊排序邏輯永遠一致。
# ────────────────────────────────────────────────────────────────────────────

def _sport_profile(uid: str) -> Dict:
    """判斷一個使用者是跑者還是舉重者（依真實紀錄，不靠自填標籤）。"""
    try:
        lifts = len(get_user_workout_history(uid, limit=30) or [])
    except Exception:
        lifts = 0
    try:
        runs = len([s for s in (load_sessions() or []) if s.get("user_id") == uid])
    except Exception:
        runs = 0
    total = lifts + runs
    if total == 0:
        return {"type": None, "runs": 0, "lifts": 0, "total": 0}
    if runs >= total * 0.7:
        t = "run"
    elif lifts >= total * 0.7:
        t = "strength"
    else:
        t = "multi"
    return {"type": t, "runs": runs, "lifts": lifts, "total": total}


def _recent_active(uid: str, days: int = 14) -> bool:
    try:
        recent = get_user_workout_history(uid, limit=1) or []
        if not recent:
            return False
        ts = recent[0].get("timestamp") or recent[0].get("date") or ""
        if not ts:
            return False
        d = datetime.fromisoformat(str(ts).replace("Z", "+00:00").split("+")[0])
        return (datetime.now() - d).days <= days
    except Exception:
        return False


@router.get("/suggestions-v2/{user_id}")
async def get_follow_suggestions_v2(
    user_id: str,
    limit: int = 12,
    sport: Optional[str] = None,   # 'run' | 'strength' | None(全部)
):
    """推薦追蹤 v2 — 有解釋理由的排序，跑步/健身社群共用。"""
    try:
        profiles = load_user_profiles()
        graph = friends_storage.get_graph(user_id)
        already = set(graph["following"]) | {user_id}
        my_followers = set(graph["followers"])
        my_friends = set(graph["friends"])
        my_prof = profiles.get(user_id) or {}
        my_city = (my_prof.get("city") or "").strip()

        # 好友的好友 → 共同好友計數
        fof_count: Dict[str, int] = {}
        for fid in my_friends:
            for their in friends_storage.get_graph(fid)["friends"]:
                if their in already or their == user_id:
                    continue
                fof_count[their] = fof_count.get(their, 0) + 1

        candidates = []
        for uid, prof in profiles.items():
            if uid in already:
                continue
            if friends_storage.is_blocked(user_id, uid):
                continue
            name = (prof.get("name") or "").strip()
            if not name:
                continue

            sp = _sport_profile(uid)
            # sport 過濾：指定了就只留該運動屬性 + 混合型 + 尚無紀錄的新人
            if sport and sp["type"] not in (sport, "multi", None):
                continue

            score = 0
            reasons = []

            mutual = fof_count.get(uid, 0)
            if mutual:
                bonus = min(mutual * 14, 42)
                score += bonus
                reasons.append(f"{mutual} 位共同好友")

            if uid in my_followers:
                score += 30
                reasons.append("已經追蹤你")

            if sport and sp["type"] == sport:
                score += 25
                reasons.append("跑步夥伴" if sport == "run" else "重訓夥伴")
            elif sp["type"] == "multi":
                score += 12
                reasons.append("跑步＋重訓都練")

            if _recent_active(uid):
                score += 20
                reasons.append("最近有在練")

            city = (prof.get("city") or "").strip()
            if my_city and city == my_city:
                score += 12
                reasons.append(f"同在{city}")

            candidates.append({
                "user_id": uid,
                "name": name,
                "discriminator": prof.get("discriminator", "0000"),
                "avatar": normalize_avatar(prof.get("avatar")),
                "bio": prof.get("bio") or prof.get("tag") or "",
                "city": city,
                "sport_type": sp["type"],
                "score": score,
                # 誠實：只顯示真的成立的理由；一條都沒有就留空，UI 不硬掰
                "reason": reasons[0] if reasons else "",
                "reasons": reasons,
                "mutual_friends": mutual,
                "follows_you": uid in my_followers,
            })

        candidates.sort(key=lambda c: (-c["score"], c["name"]))
        return {"suggestions": candidates[:max(1, min(limit, 30))]}
    except Exception as e:
        print(f"suggestions-v2 error: {e}")
        return {"suggestions": []}
