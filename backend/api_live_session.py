"""
api_live_session.py — 即時「一起練」
════════════════════════════════════════════════════════════════════════
這是社群裡唯一後端原本完全沒有的一塊。

已經有的是「非同步的一起練」（api_social_challenges）：
  我邀你 → 你接受 → 各自找時間去練 → 兩個人都達標就算一起完成。

這一支補的是「同一個當下」：
  兩個人現在就在練，看得到對方的即時進度、還剩多久、有沒有休息。
  差別在於陪伴感 —— 知道對方此刻也在流汗，跟事後知道他練完了，
  是完全不同的兩件事。

為什麼用輪詢不用 WebSocket：
  訓練中每 5 秒更新一次就綽綽有餘（配速、距離、組數都不是毫秒級的東西），
  而 WebSocket 在 Railway 上要處理連線保活、重連、多 worker 廣播。
  用 JSON 檔 + 輪詢，行為可預期、壞掉看得懂、也不會在弱網下掉線。

狀態機（很小，故意的）：
  open      房間開著，等人加入
  live      至少兩個人在裡面，開始了
  ended     有人結束，或超過 MAX_SESSION_HOURS 自動收掉

誠實鐵律：
  · 進度一律是各自回報的真實數值，不推估。
  · 超過 STALE_SECONDS 沒回報就標記 stale，畫面要說「失去連線」，
    不可以停在最後一個數字假裝他還在動。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os, uuid
from datetime import datetime, timedelta
from pathlib import Path

from core.json_cache import load_json_cached, save_json_atomic
from core.coach_profile import load_user_profiles

DATA_DIR = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "data")))
SESSIONS_FILE = DATA_DIR / "live_sessions.json"
if not SESSIONS_FILE.exists():
    SESSIONS_FILE.write_text("[]")

router = APIRouter(tags=["LiveSession"])

# 多久沒回報就當作失去連線（秒）
STALE_SECONDS = 90
# 房間最長存活時間（小時）—— 忘記按結束的房間不要永遠躺在清單裡
MAX_SESSION_HOURS = 6
# 一間房最多幾個人
MAX_MEMBERS = 8


# ─── storage ──────────────────────────────────────────────────────────────────
def _load() -> List[Dict]:
    return load_json_cached(str(SESSIONS_FILE), default=[]) or []


def _save(data: List[Dict]) -> None:
    save_json_atomic(str(SESSIONS_FILE), data)


def _now() -> datetime:
    return datetime.utcnow()


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def _profile(uid: str) -> Dict[str, Any]:
    prof = (load_user_profiles() or {}).get(uid, {})
    return {
        "user_id": uid,
        "name": prof.get("name") or "夥伴",
        "avatar": prof.get("avatar"),
    }


def _expire(sessions: List[Dict]) -> bool:
    """把過期的房間收掉。回傳是否有變動。"""
    changed = False
    cutoff = _now() - timedelta(hours=MAX_SESSION_HOURS)
    for s in sessions:
        if s.get("status") == "ended":
            continue
        started = _parse(s.get("created_at"))
        if started and started < cutoff:
            s["status"] = "ended"
            s["ended_at"] = _iso(_now())
            s["ended_reason"] = "timeout"
            changed = True
    return changed


def _view(s: Dict, me: Optional[str] = None) -> Dict:
    """把一間房整理成前端直接能畫的樣子。"""
    now = _now()
    members = []
    for m in s.get("members", []):
        last = _parse(m.get("updated_at"))
        stale = (last is None) or ((now - last).total_seconds() > STALE_SECONDS)
        members.append({
            **m,
            # 失去連線就要說，不可以讓畫面停在最後一個數字假裝還在動
            "stale": stale and s.get("status") == "live",
            "is_me": (m.get("user_id") == me) if me else False,
        })
    members.sort(key=lambda x: (-float(x.get("progress") or 0), x.get("joined_at") or ""))
    return {
        "session_id": s["session_id"],
        "host_id": s["host_id"],
        "type": s.get("type", "Run"),
        "title": s.get("title") or "",
        "goal": s.get("goal"),
        "unit": s.get("unit") or "",
        "status": s.get("status", "open"),
        "created_at": s.get("created_at"),
        "started_at": s.get("started_at"),
        "ended_at": s.get("ended_at"),
        # 為什麼結束要講清楚：房主結束 / 大家都離開 / 超時，
        # 對使用者是三件不同的事，畫面才說得出「發生什麼」。
        "ended_reason": s.get("ended_reason"),
        "members": members,
        "member_count": len(members),
    }


# ─── payloads ─────────────────────────────────────────────────────────────────
class CreatePayload(BaseModel):
    host_id: str
    type: str = "Run"                 # "Run" | "Lift"
    title: Optional[str] = None
    goal: Optional[float] = None      # 目標值（可不設，就是純陪練）
    unit: Optional[str] = ""
    invite_user_ids: Optional[List[str]] = None


class JoinPayload(BaseModel):
    session_id: str
    user_id: str


class ProgressPayload(BaseModel):
    session_id: str
    user_id: str
    progress: float = 0
    note: Optional[str] = None        # "休息中" / "第 3 組" 之類的即時狀態


class LeavePayload(BaseModel):
    session_id: str
    user_id: str


# ─── POST /api/live/create ────────────────────────────────────────────────────
@router.post("/api/live/create")
async def create_session(payload: CreatePayload):
    """開一間房。開房的人自動成為第一個成員。"""
    sessions = _load()
    _expire(sessions)

    # 同一個人不要同時開兩間還活著的房
    for s in sessions:
        if s.get("host_id") == payload.host_id and s.get("status") in ("open", "live"):
            return {"status": "existing", "session": _view(s, payload.host_id)}

    now = _iso(_now())
    session = {
        "session_id": f"live_{uuid.uuid4().hex[:12]}",
        "host_id": payload.host_id,
        "type": payload.type,
        "title": payload.title or "",
        "goal": float(payload.goal) if payload.goal else None,
        "unit": payload.unit or "",
        "status": "open",
        "created_at": now,
        "started_at": None,
        "ended_at": None,
        "invited": payload.invite_user_ids or [],
        "members": [{
            **_profile(payload.host_id),
            "progress": 0,
            "note": "",
            "joined_at": now,
            "updated_at": now,
        }],
    }
    sessions.append(session)
    _save(sessions)
    return {"status": "success", "session": _view(session, payload.host_id)}


# ─── POST /api/live/join ──────────────────────────────────────────────────────
@router.post("/api/live/join")
async def join_session(payload: JoinPayload):
    sessions = _load()
    _expire(sessions)

    for s in sessions:
        if s["session_id"] != payload.session_id:
            continue
        if s.get("status") == "ended":
            raise HTTPException(status_code=400, detail="這場已經結束了")

        already = any(m["user_id"] == payload.user_id for m in s["members"])
        if not already:
            if len(s["members"]) >= MAX_MEMBERS:
                raise HTTPException(status_code=400, detail=f"這場最多 {MAX_MEMBERS} 人")
            now = _iso(_now())
            s["members"].append({
                **_profile(payload.user_id),
                "progress": 0, "note": "", "joined_at": now, "updated_at": now,
            })
        # 第二個人進來才算真的開始
        if len(s["members"]) >= 2 and s["status"] == "open":
            s["status"] = "live"
            s["started_at"] = _iso(_now())
        _save(sessions)
        return {"status": "success", "session": _view(s, payload.user_id)}

    raise HTTPException(status_code=404, detail="找不到這一場")


# ─── POST /api/live/progress ──────────────────────────────────────────────────
@router.post("/api/live/progress")
async def report_progress(payload: ProgressPayload):
    """回報自己現在的累積進度。訓練中每幾秒打一次。"""
    sessions = _load()
    for s in sessions:
        if s["session_id"] != payload.session_id:
            continue
        if s.get("status") == "ended":
            raise HTTPException(status_code=400, detail="這場已經結束了")
        for m in s["members"]:
            if m["user_id"] == payload.user_id:
                m["progress"] = max(0.0, float(payload.progress or 0))
                if payload.note is not None:
                    m["note"] = payload.note[:40]
                m["updated_at"] = _iso(_now())
                _save(sessions)
                return {"status": "success", "session": _view(s, payload.user_id)}
        raise HTTPException(status_code=403, detail="你不在這一場裡")

    raise HTTPException(status_code=404, detail="找不到這一場")


# ─── GET /api/live/session/{session_id} ───────────────────────────────────────
@router.get("/api/live/session/{session_id}")
async def get_session(session_id: str, user_id: Optional[str] = None):
    """輪詢用：拿這一場的最新狀態。"""
    sessions = _load()
    if _expire(sessions):
        _save(sessions)
    for s in sessions:
        if s["session_id"] == session_id:
            return {"session": _view(s, user_id)}
    raise HTTPException(status_code=404, detail="找不到這一場")


# ─── GET /api/live/mine/{user_id} ─────────────────────────────────────────────
@router.get("/api/live/mine/{user_id}")
async def my_sessions(user_id: str):
    """我現在在哪一場，以及有沒有人開房邀我。"""
    sessions = _load()
    if _expire(sessions):
        _save(sessions)

    current, invites = None, []
    for s in sessions:
        if s.get("status") == "ended":
            continue
        if any(m["user_id"] == user_id for m in s.get("members", [])):
            current = _view(s, user_id)
        elif user_id in (s.get("invited") or []):
            invites.append(_view(s, user_id))
    return {"current": current, "invites": invites, "invite_count": len(invites)}


# ─── POST /api/live/leave ─────────────────────────────────────────────────────
@router.post("/api/live/leave")
async def leave_session(payload: LeavePayload):
    """離開。房主離開就整場結束（沒有主人的房間留著只會變成鬼房）。"""
    sessions = _load()
    for s in sessions:
        if s["session_id"] != payload.session_id:
            continue
        if s.get("host_id") == payload.user_id:
            s["status"] = "ended"
            s["ended_at"] = _iso(_now())
            s["ended_reason"] = "host_left"
        else:
            s["members"] = [m for m in s["members"] if m["user_id"] != payload.user_id]
            if len(s["members"]) <= 1 and s["status"] == "live":
                s["status"] = "ended"
                s["ended_at"] = _iso(_now())
                s["ended_reason"] = "everyone_left"
        _save(sessions)
        return {"status": "success", "session": _view(s, payload.user_id)}

    raise HTTPException(status_code=404, detail="找不到這一場")
