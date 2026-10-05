"""
repositories/leaderboard_repo.py — 排行榜倉儲層
================================================

取代原本記憶體內的 user_leaderboard_data dict（重啟即清空）。
資料改存 DB → 持久化、並發安全。
"""
from __future__ import annotations

from typing import List

from core.db import SessionLocal, init_db
from core.models_social import LeaderboardEntry

init_db()  # 啟動時確保資料表存在（冪等）

# 可接受的榜別
VALID_TYPES = {"run", "strength"}


def upsert(data: dict) -> dict:
    """以 (type, user_id) upsert 一筆排行榜資料，回傳寫入後的 record dict。"""
    lb_type = data.get("type", "run")
    user_id = data.get("user_id")
    with SessionLocal() as db:
        entry = db.query(LeaderboardEntry).filter(
            LeaderboardEntry.type == lb_type,
            LeaderboardEntry.user_id == user_id,
        ).first()
        if entry is None:
            entry = LeaderboardEntry(type=lb_type, user_id=user_id)
            db.add(entry)

        entry.user_name = data.get("user_name", "") or ""
        entry.score = float(data.get("score", 0) or 0)
        entry.monthly_distance = float(data.get("monthly_distance", 0) or 0)
        entry.monthly_volume = float(data.get("monthly_volume", 0) or 0)
        entry.streak = int(data.get("streak", 0) or 0)
        entry.pr_count = int(data.get("pr_count", 0) or 0)
        entry.xp_tier = data.get("xp_tier", "初級") or "初級"
        entry.xp_level = int(data.get("xp_level", 1) or 1)
        entry.city = data.get("city", "台北") or "台北"

        db.commit()
        db.refresh(entry)
        return entry.to_dict()


def get_ranked(lb_type: str = "run", limit: int = 50) -> List[dict]:
    """回傳該榜別依分數由高到低排序的 record list（最多 limit 筆）。"""
    with SessionLocal() as db:
        rows = db.query(LeaderboardEntry) \
            .filter(LeaderboardEntry.type == lb_type) \
            .order_by(LeaderboardEntry.score.desc()) \
            .limit(limit).all()
        return [r.to_dict() for r in rows]


def count(lb_type: str = "run") -> int:
    with SessionLocal() as db:
        return db.query(LeaderboardEntry).filter(LeaderboardEntry.type == lb_type).count()
