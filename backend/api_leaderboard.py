"""
api_leaderboard.py — 排行榜 (Leaderboard) 路由
Phase 2：已從記憶體 dict 改為 DB 持久化（repositories.leaderboard_repo），
重啟不再清空、並發安全。
對應前綴：/api/leaderboard、/api/leaderboard/update
"""
import logging
import math
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request

from repositories import leaderboard_repo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["leaderboard"])


class LeaderboardUpdate(BaseModel):
    user_id: str
    user_name: str
    type: str  # "run" or "strength"
    score: float
    monthly_distance: Optional[float] = 0.0
    monthly_volume: Optional[float] = 0.0
    streak: int = 0
    pr_count: int = 0
    xp_tier: str = "初級"
    xp_level: int = 1
    city: str = "台北"

@router.post("/api/leaderboard/update")
async def update_leaderboard(data: LeaderboardUpdate, request: Request):
    """
    Receive locally calculated score from frontend and store it.
    """
    # 🔴 資安修復：原本不需登入、body.user_id 任填 → 任何人都能替別人上榜或灌分。
    #    改為必須有 JWT，且只能寫自己那一列。
    uid = getattr(request.state, "user_id", None)
    if not isinstance(uid, str) or not uid.strip():
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    if data.type not in leaderboard_repo.VALID_TYPES:
        raise HTTPException(status_code=422, detail="invalid leaderboard type")
    for v in (data.score, data.monthly_distance or 0, data.monthly_volume or 0):
        if not math.isfinite(v) or v < 0 or v > 1e7:
            raise HTTPException(status_code=422, detail="value out of range")
    payload = data.dict()
    payload["user_id"] = uid
    payload["user_name"] = (data.user_name or "")[:40]
    payload["city"] = (data.city or "")[:20]
    leaderboard_repo.upsert(payload)
    return {"status": "success", "message": "Leaderboard updated"}


@router.get("/api/leaderboard")
async def get_leaderboard(request: Request, type: str = "run", period: str = "month", limit: int = 50, demo: bool = False):
    """
    Leaderboard: ranked scores per user, fetched from user_leaderboard_data.

    🔴 預設回傳真實資料（可能為空）。假競爭者會讓「練再多名次也不會動」的
       黏著度設計反噬，因此 mock 只在 ?demo=true 時提供（給展示/截圖用）。
       回傳 is_seed 旗標讓前端可顯示「成為第一位上榜的人」引導，而非假榜單。
    """
    # 🔴 他人資料（暱稱／城市／分數）不給匿名存取
    if not getattr(request.state, "user_id", None):
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    # 防呆：limit 夾在 1–100，避免 ?limit=1000000 一次撈全表
    limit = max(1, min(100, int(limit or 50)))
    try:
        results = leaderboard_repo.get_ranked(type, limit)
        is_seed = not results

        if is_seed and demo:
            mock = {
                "run": [
                    {"user_id": "u1", "user_name": "冠甫", "city": "台北", "xp_level": 42, "score": 318, "monthly_distance": 89.4, "streak": 14, "pr_count": 3, "xp_tier": "精英"},
                    {"user_id": "u2", "user_name": "Sarah", "city": "台北", "xp_level": 38, "score": 247, "monthly_distance": 72.1, "streak": 8, "pr_count": 2, "xp_tier": "進階"},
                    {"user_id": "u3", "user_name": "Mike", "city": "新北", "xp_level": 35, "score": 198, "monthly_distance": 58.7, "streak": 6, "pr_count": 1, "xp_tier": "進階"},
                    {"user_id": "u4", "user_name": "Emily", "city": "台中", "xp_level": 31, "score": 156, "monthly_distance": 45.2, "streak": 5, "pr_count": 1, "xp_tier": "中級"},
                    {"user_id": "u5", "user_name": "Jason", "city": "高雄", "xp_level": 28, "score": 124, "monthly_distance": 38.0, "streak": 4, "pr_count": 0, "xp_tier": "中級"},
                ],
                "strength": [
                    {"user_id": "u1", "user_name": "冠甫", "city": "台北", "xp_level": 42, "score": 412, "monthly_volume": 18500, "streak": 12, "pr_count": 4, "xp_tier": "精英"},
                    {"user_id": "u3", "user_name": "Mike", "city": "新北", "xp_level": 35, "score": 298, "monthly_volume": 12400, "streak": 9, "pr_count": 2, "xp_tier": "進階"},
                    {"user_id": "u5", "user_name": "Jason", "city": "高雄", "xp_level": 28, "score": 201, "monthly_volume": 8200, "streak": 7, "pr_count": 1, "xp_tier": "中級"},
                    {"user_id": "u2", "user_name": "Sarah", "city": "台北", "xp_level": 38, "score": 187, "monthly_volume": 7100, "streak": 5, "pr_count": 2, "xp_tier": "進階"},
                    {"user_id": "u6", "user_name": "Lily", "city": "台南", "xp_level": 25, "score": 132, "monthly_volume": 5300, "streak": 3, "pr_count": 0, "xp_tier": "初級"},
                ],
            }
            results = mock.get(type, [])

        results.sort(key=lambda x: x["score"], reverse=True)
        return {"rankings": results[:limit], "total": len(results), "period": period, "type": type, "is_seed": is_seed}
    except Exception as e:
        logger.error(f"Leaderboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
