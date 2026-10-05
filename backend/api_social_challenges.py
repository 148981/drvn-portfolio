"""
Social Challenges API — DRVN v1.0
Covers: Issue Duel (challenge / collab / custom), Bond persistence, polling inbox.

Endpoints:
  POST /api/social/challenge/send
  GET  /api/social/challenge/list/{user_id}
  POST /api/social/challenge/respond
  GET  /api/social/challenge/inbox/{user_id}   ← polling: pending invitations
  PATCH /api/social/friends/bond               ← persist bond score
"""

from fastapi import APIRouter, HTTPException, Body, Request
from auth_guard import enforce_owner
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid, os
from datetime import datetime
from pathlib import Path
from core.json_cache import load_json_cached, save_json_atomic
from core.coach_profile import load_user_profiles

DATA_DIR = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "data")))
CHALLENGES_FILE = DATA_DIR / "social_challenges.json"
FRIENDSHIPS_FILE = DATA_DIR / "friendships.json"

# ─── ensure files exist ───────────────────────────────────────────────────────
for _f in [CHALLENGES_FILE, FRIENDSHIPS_FILE]:
    if not _f.exists():
        _f.write_text("[]")

router = APIRouter(tags=["SocialChallenges"])

# ─── helpers ──────────────────────────────────────────────────────────────────
def _load_challenges() -> List[Dict]:
    return load_json_cached(str(CHALLENGES_FILE), default=[])

def _save_challenges(data: List[Dict]):
    save_json_atomic(str(CHALLENGES_FILE), data)

def _load_friendships() -> List[Dict]:
    return load_json_cached(str(FRIENDSHIPS_FILE), default=[])

def _save_friendships(data: List[Dict]):
    save_json_atomic(str(FRIENDSHIPS_FILE), data)

def _get_profile(uid: str) -> Dict:
    profiles = load_user_profiles()
    p = profiles.get(uid, {})
    return {"user_id": uid, "name": p.get("name", "Athlete"), "discriminator": p.get("discriminator", "0000"), "avatar": p.get("avatar")}

# ─── Pydantic models ──────────────────────────────────────────────────────────
class ChallengeSendPayload(BaseModel):
    from_user_id: str
    to_user_id: str
    mode: str = "challenge"          # "challenge" | "collaborate" | "custom"
    type: Optional[str] = "Run"      # "Run" | "Lift"
    title: Optional[str] = None
    desc: Optional[str] = None
    metric: Optional[Any] = None     # target value (number or string)
    unit: Optional[str] = None
    bond: Optional[int] = 50
    preset_id: Optional[str] = None  # e.g. "run_10k"

class ChallengeRespondPayload(BaseModel):
    user_id: str
    challenge_id: str
    action: str  # "accept" | "decline"

class BondUpdatePayload(BaseModel):
    user_id: str
    friend_id: str
    delta: int  # positive points to add

class ChallengeProgressPayload(BaseModel):
    user_id: str
    challenge_id: str
    progress: float  # 此使用者目前累積的數值（例如已跑 km / 已舉 volume）

# 協作完成的時間窗（小時）：兩人最後一次進度更新需在此區間內，才算「一起完成」
COLLAB_WINDOW_HOURS = 2


def _parse_metric(metric) -> float:
    """metric 可能是數字或字串，轉成 float 目標值；無法解析回傳 0。"""
    if metric is None:
        return 0.0
    try:
        return float(metric)
    except (TypeError, ValueError):
        import re
        m = re.search(r"[\d.]+", str(metric))
        return float(m.group()) if m else 0.0


# ─── POST /api/social/challenge/send ─────────────────────────────────────────
@router.post("/api/social/challenge/send")
async def send_challenge(payload: ChallengeSendPayload, request: Request):
    # 以前不驗身分：未登入也能用任何人的名義對任何人發邀請
    enforce_owner(request, payload.from_user_id)
    if payload.from_user_id == payload.to_user_id:
        raise HTTPException(status_code=400, detail="Cannot challenge yourself")
    try:
        from api_moderation import blocked_ids, filter_text
        if payload.to_user_id in blocked_ids(payload.from_user_id):
            raise HTTPException(status_code=403, detail="Action not permitted")
    except HTTPException:
        raise
    except Exception:
        filter_text = lambda t: t  # noqa: E731 —— 審核模組讀不到時不擋發送
    # 標題／說明會顯示在對方畫面上 → 限長＋遮髒話
    payload.title = filter_text((payload.title or "").strip()[:60]) or None
    payload.desc = filter_text((payload.desc or "").strip()[:300]) or None
    payload.unit = (payload.unit or "")[:16]

    challenges = _load_challenges()

    # Prevent duplicate pending challenge between same pair
    for c in challenges:
        if c["status"] == "pending":
            pair = {c["from_user_id"], c["to_user_id"]}
            if pair == {payload.from_user_id, payload.to_user_id}:
                return {"status": "already_pending", "challenge": c}

    from_profile = _get_profile(payload.from_user_id)
    to_profile   = _get_profile(payload.to_user_id)

    cid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    doc = {
        "challenge_id": cid,
        "from_user_id": payload.from_user_id,
        "to_user_id":   payload.to_user_id,
        "from_user":    from_profile,
        "to_user":      to_profile,
        "mode":    payload.mode,
        "type":    payload.type or "Run",
        "title":   payload.title or f"{payload.mode.upper()} — {payload.type}",
        "desc":    payload.desc or "",
        "metric":  payload.metric,
        "unit":    payload.unit or "",
        "bond":    payload.bond or 50,
        "preset_id": payload.preset_id,
        "status":  "pending",   # pending | accepted | declined | completed
        "created_at": now,
        "updated_at": now,
        # progress tracking (both sides)
        "from_progress": 0,
        "to_progress":   0,
    }
    challenges.append(doc)
    _save_challenges(challenges)
    return {"status": "success", "challenge": doc}


# ─── GET /api/social/challenge/list/{user_id} ────────────────────────────────
@router.get("/api/social/challenge/list/{user_id}")
async def list_challenges(user_id: str):
    """Return all challenges involving this user (sent + received), enriched with other_user."""
    challenges = _load_challenges()
    result = []
    for c in challenges:
        if c["from_user_id"] == user_id or c["to_user_id"] == user_id:
            enriched = dict(c)
            if c["from_user_id"] == user_id:
                enriched["other_user"] = c.get("to_user") or _get_profile(c["to_user_id"])
                enriched["direction"]  = "sent"
            else:
                enriched["other_user"] = c.get("from_user") or _get_profile(c["from_user_id"])
                enriched["direction"]  = "received"
            result.append(enriched)
    # Sort: pending first, then by created_at desc
    result.sort(key=lambda x: (x["status"] != "pending", x.get("created_at", "")), reverse=False)
    return {"challenges": result}


# ─── GET /api/social/challenge/inbox/{user_id} ───────────────────────────────
@router.get("/api/social/challenge/inbox/{user_id}")
async def challenge_inbox(user_id: str):
    """Lightweight polling endpoint — only pending invitations received by this user."""
    challenges = _load_challenges()
    pending = [
        {
            "challenge_id": c["challenge_id"],
            "from_user":    c.get("from_user") or _get_profile(c["from_user_id"]),
            "mode":   c["mode"],
            "type":   c.get("type", "Run"),
            "title":  c.get("title", ""),
            "desc":   c.get("desc", ""),
            "metric": c.get("metric"),
            "unit":   c.get("unit", ""),
            "bond":   c.get("bond", 50),
            "created_at": c.get("created_at", ""),
        }
        for c in challenges
        if c["to_user_id"] == user_id and c["status"] == "pending"
    ]
    return {"pending": pending, "count": len(pending)}


# ─── POST /api/social/challenge/respond ──────────────────────────────────────
@router.post("/api/social/challenge/respond")
async def respond_challenge(payload: ChallengeRespondPayload, request: Request):
    enforce_owner(request, payload.user_id)
    if payload.action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="action must be 'accept' or 'decline'")

    challenges = _load_challenges()
    now = datetime.utcnow().isoformat()
    for c in challenges:
        if c["challenge_id"] == payload.challenge_id and c["to_user_id"] == payload.user_id:
            if c["status"] != "pending":
                raise HTTPException(status_code=400, detail="Challenge already resolved")
            c["status"] = "accepted" if payload.action == "accept" else "declined"
            c["updated_at"] = now
            _save_challenges(challenges)
            return {"status": "success", "challenge": c}

    raise HTTPException(status_code=404, detail="Challenge not found or not yours to respond")


# ─── POST /api/social/challenge/progress ─────────────────────────────────────
@router.post("/api/social/challenge/progress")
async def update_challenge_progress(payload: ChallengeProgressPayload, request: Request):
    """
    更新某一方的進度，並在達成條件時自動將狀態轉為 completed。

    協作（collaborate）完成判定：
      1. 挑戰已被接受（status == accepted）
      2. 雙方進度都 >= 目標 metric
      3. 兩人最後一次進度更新時間相差在 COLLAB_WINDOW_HOURS 內（一起完成）
    其他模式（challenge/custom）：兩方都達標即 completed（不限時間窗）。

    回傳 newly_completed=True 時，前端可發放回饋（解鎖貼紙 / 親密度）。
    """
    # 只能回報自己的進度：以前帶對方的 user_id 就能替對方「完成」
    enforce_owner(request, payload.user_id)
    challenges = _load_challenges()
    now_dt = datetime.utcnow()
    now = now_dt.isoformat()

    for c in challenges:
        if c["challenge_id"] != payload.challenge_id:
            continue
        if payload.user_id not in (c["from_user_id"], c["to_user_id"]):
            raise HTTPException(status_code=403, detail="Not a participant of this challenge")
        if c["status"] in ("declined",):
            raise HTTPException(status_code=400, detail="Challenge was declined")

        is_from = payload.user_id == c["from_user_id"]
        # 寫入該方進度 + 時間戳
        if is_from:
            c["from_progress"] = payload.progress
            c["from_progress_at"] = now
        else:
            c["to_progress"] = payload.progress
            c["to_progress_at"] = now
        c["updated_at"] = now

        target = _parse_metric(c.get("metric"))
        both_hit = (c.get("from_progress", 0) >= target) and (c.get("to_progress", 0) >= target) and target > 0

        newly_completed = False
        # 🔴 必須「已被接受」才可能完成。
        #    原本只檢查 both_hit，於是一筆對方從來沒點過接受的 pending 邀請，
        #    會因為雙方各自的日常訓練達標而自動變成「一起完成」——
        #    等於系統幫沒答應的人答應了。
        if c["status"] == "accepted" and both_hit:
            in_window = True
            if c.get("mode") == "collaborate":
                # 檢查兩人完成時間是否在時間窗內
                try:
                    t1 = datetime.fromisoformat(c.get("from_progress_at"))
                    t2 = datetime.fromisoformat(c.get("to_progress_at"))
                    in_window = abs((t1 - t2).total_seconds()) <= COLLAB_WINDOW_HOURS * 3600
                except Exception:
                    in_window = False
            if in_window:
                c["status"] = "completed"
                c["completed_at"] = now
                # 標記雙方尚未領取回饋（前端領取後呼叫 claim 清除）
                c["reward_claimed"] = {c["from_user_id"]: False, c["to_user_id"]: False}
                newly_completed = True

        _save_challenges(challenges)
        return {"status": "success", "challenge": c, "newly_completed": newly_completed}

    raise HTTPException(status_code=404, detail="Challenge not found")


# ─── GET /api/social/challenge/completed/{user_id} ───────────────────────────
@router.get("/api/social/challenge/completed/{user_id}")
async def completed_challenges(user_id: str):
    """
    回傳此使用者「已完成但尚未領取回饋」的協作/挑戰。
    前端載入時 poll 這支，有資料就發放回饋並呼叫 claim。
    """
    challenges = _load_challenges()
    out = []
    for c in challenges:
        if c.get("status") != "completed":
            continue
        if user_id not in (c["from_user_id"], c["to_user_id"]):
            continue
        claimed = (c.get("reward_claimed") or {}).get(user_id, False)
        if claimed:
            continue
        other_id = c["to_user_id"] if c["from_user_id"] == user_id else c["from_user_id"]
        out.append({
            "challenge_id": c["challenge_id"],
            "mode": c.get("mode"),
            "title": c.get("title", ""),
            "bond": c.get("bond", 50),
            "other_user": (c.get("to_user") if c["from_user_id"] == user_id else c.get("from_user")) or _get_profile(other_id),
            "completed_at": c.get("completed_at"),
        })
    return {"completed": out, "count": len(out)}


# ─── POST /api/social/challenge/claim ────────────────────────────────────────
@router.post("/api/social/challenge/claim")
async def claim_challenge_reward(payload: ChallengeRespondPayload, request: Request):
    """
    使用者領取已完成挑戰的回饋後，標記為已領取（避免重複發放）。
    沿用 ChallengeRespondPayload：user_id + challenge_id（action 此處忽略）。
    """
    enforce_owner(request, payload.user_id)
    challenges = _load_challenges()
    for c in challenges:
        if c["challenge_id"] == payload.challenge_id and c.get("status") == "completed":
            if payload.user_id not in (c["from_user_id"], c["to_user_id"]):
                raise HTTPException(status_code=403, detail="Not a participant")
            rc = c.get("reward_claimed") or {}
            rc[payload.user_id] = True
            c["reward_claimed"] = rc
            _save_challenges(challenges)
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="Completed challenge not found")


# ─── PATCH /api/social/friends/bond ──────────────────────────────────────────
@router.patch("/api/social/friends/bond")
async def update_bond(payload: BondUpdatePayload, request: Request):
    """
    Add bond points to a friendship (both directions).
    Stores bond_score inside the friendship record in friendships.json.
    """
    enforce_owner(request, payload.user_id)
    if payload.user_id == payload.friend_id:
        raise HTTPException(status_code=400, detail="Invalid friend_id")
    # 單次加分上限：以前可以一次送 delta=999999 灌親密度
    payload.delta = max(-100, min(int(payload.delta), 100))
    friendships = _load_friendships()
    now = datetime.utcnow().isoformat()
    updated = False

    for fs in friendships:
        ids = {fs.get("user_id_1"), fs.get("user_id_2")}
        if ids == {payload.user_id, payload.friend_id}:
            old = fs.get("bond_score", 0)
            fs["bond_score"] = max(0, old + payload.delta)
            fs["bond_updated_at"] = now
            updated = True
            break

    if not updated:
        # Create a lightweight bond record even if formal friendship not found
        friendships.append({
            "user_id_1": payload.user_id,
            "user_id_2": payload.friend_id,
            "created_at": now,
            "bond_score": max(0, payload.delta),
            "bond_updated_at": now,
        })

    _save_friendships(friendships)
    bond_score = next(
        (fs.get("bond_score", 0) for fs in friendships
         if {fs.get("user_id_1"), fs.get("user_id_2")} == {payload.user_id, payload.friend_id}),
        payload.delta
    )
    return {"status": "success", "bond_score": bond_score}


# ─── GET /api/social/friends/bond/{user_id}/{friend_id} ──────────────────────
@router.get("/api/social/friends/bond/{user_id}/{friend_id}")
async def get_bond(user_id: str, friend_id: str):
    friendships = _load_friendships()
    for fs in friendships:
        if {fs.get("user_id_1"), fs.get("user_id_2")} == {user_id, friend_id}:
            return {"bond_score": fs.get("bond_score", 0)}
    return {"bond_score": 0}
