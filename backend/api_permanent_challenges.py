"""
Permanent Challenges API — DRVN
常駐挑戰：記錄「誰加入了哪個挑戰」。

══════════════════════════════════════════════════════════════════════════
為什麼這支變薄了（2026-09 稽核）
══════════════════════════════════════════════════════════════════════════

舊版這裡放了一份完整的挑戰定義（pc1〜pc5）＋ 五個進度計算函式
（_progress_pc1 … _progress_pc5）。問題是同一批挑戰同時被定義在三個地方：

    frontend socialDataConnector.PERMANENT_CHALLENGES     5 筆
    backend  api_permanent_challenges.PERMANENT_CHALLENGES 5 筆
    frontend growthAchievements.js category='permanent'   8 筆

三份互不同步，連達成條件都互相矛盾：
    「破風配速」  社群頁＝負分割        成就頁＝最佳配速 5:00/km
    「週週重訓」  社群頁＝每週3次×4週   成就頁＝累積 12 次重訓

更糟的是進度算兩份：後端讀 data/ 底下的 JSON、前端讀 localStorage，
兩邊資料集根本不一樣，所以同一個挑戰在兩個畫面會顯示不同的百分比。

現在挑戰定義只有一份 —— frontend/src/utils/challengeRegistry.js。
進度也只算一次：前端用 growthAchievements.aggregateUserData() 的真實欄位
（跟成就徽章同一套數字），所以社群頁與成就頁永遠一致。

這支只剩一個職責：**記錄加入狀態**。它不再知道挑戰有哪些、門檻是多少，
也不再算進度 —— 那樣就不會再有第四份定義偷偷長出來。

Endpoints:
  POST /api/challenges/permanent/join              → 加入挑戰（冪等）
  GET  /api/challenges/permanent/status/{user_id}  → 這個人加入了哪些
  DELETE /api/challenges/permanent/join            → 退出挑戰
"""

from fastapi import APIRouter, HTTPException, Request
from auth_guard import enforce_owner
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os, re
from datetime import datetime
from pathlib import Path

from core.json_cache import load_json_cached, save_json_atomic

DATA_DIR = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "data")))
JOINS_FILE = DATA_DIR / "permanent_challenge_joins.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
if not JOINS_FILE.exists():
    JOINS_FILE.write_text("{}")

router = APIRouter(tags=["PermanentChallenges"])

# 挑戰 id 由前端登錄表決定，後端不維護清單。
# 但也不能照單全收 —— id 會變成 JSON 的 key，限制成安全字元。
_ID_RE = re.compile(r"^[a-z0-9_]{1,64}$")

# 舊版 id → 新的軸 id。舊 App 還沒更新的使用者送 pc1 上來時不會壞，
# 而且他們的加入紀錄會接到對應的新軸上。
LEGACY_ID_MAP = {
    "pc1": "month_km",       # 月跑 100km
    "pc2": "iron_week",      # 週週重訓不缺席
    "pc3": "pace_best",      # 破風配速
    "pc4": "max_lift",       # 百公斤俱樂部
    "pc5": "streak",         # 最長連續訓練
}


class JoinPayload(BaseModel):
    user_id: str
    challenge_id: str


def _load_joins() -> Dict[str, Any]:
    return load_json_cached(str(JOINS_FILE), default={})


def _save_joins(data: Dict[str, Any]):
    save_json_atomic(str(JOINS_FILE), data)


def _normalize(challenge_id: str) -> str:
    """舊 id 轉新 id，並擋掉不合法的字元。"""
    cid = LEGACY_ID_MAP.get(challenge_id, challenge_id)
    if not _ID_RE.match(cid):
        raise HTTPException(status_code=400, detail="Invalid challenge_id")
    return cid


def _check_user(user_id: str) -> str:
    uid = (user_id or "").strip()
    if not uid or len(uid) > 128:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    return uid


# ─── POST /api/challenges/permanent/join ─────────────────────────────────
@router.post("/api/challenges/permanent/join")
async def join_permanent(payload: JoinPayload, request: Request):
    """加入一個常駐挑戰。重複呼叫不會改變 joined_at（冪等）。"""
    uid = _check_user(payload.user_id)
    enforce_owner(request, uid)   # body 的 user_id 不會被 identity_guard 覆蓋，自己驗
    cid = _normalize(payload.challenge_id)

    joins = _load_joins()
    user_joins = joins.get(uid, {})

    already = cid in user_joins
    if not already:
        user_joins[cid] = {"joined_at": datetime.now().isoformat()}
        joins[uid] = user_joins
        _save_joins(joins)

    return {
        "status": "already_joined" if already else "joined",
        "challenge": {
            "id": cid,
            "joined": True,
            "joined_at": user_joins[cid]["joined_at"],
        },
    }


# ─── DELETE /api/challenges/permanent/join ───────────────────────────────
@router.delete("/api/challenges/permanent/join")
async def leave_permanent(user_id: str, challenge_id: str):
    """退出挑戰。加入之後原本沒有任何退出的方法。"""
    uid = _check_user(user_id)
    cid = _normalize(challenge_id)

    joins = _load_joins()
    user_joins = joins.get(uid, {})
    if cid in user_joins:
        del user_joins[cid]
        joins[uid] = user_joins
        _save_joins(joins)
        return {"status": "left", "challenge_id": cid}
    return {"status": "not_joined", "challenge_id": cid}


# ─── GET /api/challenges/permanent/status/{user_id} ──────────────────────
@router.get("/api/challenges/permanent/status/{user_id}")
async def permanent_status(user_id: str):
    """
    這個人加入了哪些常駐挑戰。

    ⚠️ 刻意不回傳 progress。進度由前端從 aggregateUserData() 的真實欄位算，
       跟成就徽章同一套數字 —— 後端再算一份只會讓兩個畫面顯示不同百分比。
    """
    uid = _check_user(user_id)
    joins = _load_joins().get(uid, {})
    return {
        "user_id": uid,
        "challenges": [
            {"id": cid, "joined": True, "joined_at": meta.get("joined_at")}
            for cid, meta in sorted(joins.items())
        ],
    }
