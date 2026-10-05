"""
repositories/pr_rank_repo.py — PR 名次倉儲層
==============================================
存每位使用者每一項 PR 的最佳值，並算出在所有 DRVN 使用者裡的名次。
"""
from __future__ import annotations

from typing import Dict, Iterable, Optional, Tuple

from sqlalchemy import func

from core.db import SessionLocal, init_db
from core.models_social import PRRankEntry

init_db()  # 冪等：確保資料表存在


def upsert_many(user_id: str, items: Iterable[Tuple[str, float]]) -> None:
    """items = [(record_id, value)]；同一項以最新送上來的值為準（前端送的就是那一項的歷史最佳）。"""
    with SessionLocal() as db:
        for record_id, value in items:
            row = db.query(PRRankEntry).filter(
                PRRankEntry.record_id == record_id,
                PRRankEntry.user_id == user_id,
            ).first()
            if row is None:
                db.add(PRRankEntry(record_id=record_id, user_id=user_id, value=float(value)))
            else:
                row.value = float(value)
        db.commit()


def rank_of(record_id: str, value: float, lower_better: bool) -> Dict[str, Optional[float]]:
    """回傳 {rank, total, next_value, top_value}。
    rank：比你好的人數 + 1（同分同名次）；next_value：剛好比你好一點的那一位的值（你是第一名就 None）。"""
    col = PRRankEntry.value
    with SessionLocal() as db:
        base = db.query(PRRankEntry).filter(PRRankEntry.record_id == record_id)
        total = base.count()
        better_q = base.filter(col < value) if lower_better else base.filter(col > value)
        better = better_q.count()
        if better:
            nxt = db.query(func.max(col) if lower_better else func.min(col)) \
                .filter(PRRankEntry.record_id == record_id) \
                .filter(col < value if lower_better else col > value).scalar()
        else:
            nxt = None
        top = db.query(func.min(col) if lower_better else func.max(col)) \
            .filter(PRRankEntry.record_id == record_id).scalar()
    return {"rank": better + 1, "total": total, "next_value": nxt, "top_value": top}
