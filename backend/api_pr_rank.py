"""
api_pr_rank.py — PR 在所有 DRVN 使用者裡的名次
=================================================
POST /api/pr-rank/submit
    body: {"records": [{"id": "fastest_5k", "value": 863}, ...]}
    → 把自己每一項 PR 的最佳值存起來（upsert），並回傳每一項的名次：
      {"ranks": {"fastest_5k": {"rank": 3, "total": 128, "top_pct": 3,
                                "next_value": 850, "top_value": 760, "lower_better": true}}}

身分一律取 JWT（request.state.user_id），不收前端傳的 user_id —— 只能改自己的成績。
值的合理範圍在 BOUNDS：超出的（例如 5 公里 3 分鐘）直接不收，不讓它污染別人的名次。
"""
from __future__ import annotations

import math
from typing import List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from repositories import pr_rank_repo

router = APIRouter(tags=["pr-rank"])

# 時間／配速類：越小越好
LOWER_BETTER = {
    "fastest_1k", "fastest_5k", "fastest_10k", "half_marathon", "full_marathon", "best_pace_ever",
}

# 可接受的範圍（含）。秒、秒/公里、公里、公斤、次、分鐘…單位跟著前端那張卡。
BOUNDS = {
    "fastest_1k": (150, 1200),        # 配速 2:30–20:00 /km
    "best_pace_ever": (150, 1200),
    "fastest_5k": (720, 7200),        # 12:00–2:00:00
    "fastest_10k": (1560, 14400),
    "half_marathon": (3450, 28800),
    "full_marathon": (7200, 57600),
    "longest_run": (0.5, 400),        # km
    "total_km": (0.5, 200000),
    "heaviest_lift": (1, 600),        # kg
    "est_squat_1rm": (1, 600),
    "est_bench_1rm": (1, 500),
    "est_deadlift_1rm": (1, 600),
    "est_ohp_1rm": (1, 300),
    "bw_ratio": (0.05, 6),
    "longest_duration": (60, 172800),  # 秒：1 分鐘–48 小時
    "max_volume": (1, 200000),         # kg（單次訓練總量）
    "most_sets": (1, 200),
}

# 只收前端 PR 頁真的有的那幾項（PowerPRTrackerMobile 的 RECORD_DEFS）。
# 原本任何 id 都收（上限 1e9），任何登入者都能塞一堆自訂 record_id 灌爆資料表。
KNOWN_IDS = {
    "fastest_1k", "fastest_5k", "fastest_10k", "half_marathon", "full_marathon",
    "longest_run", "longest_duration", "best_pace_ever", "max_elevation", "most_calories_run",
    "max_volume", "heaviest_lift", "est_squat_1rm", "est_bench_1rm", "est_deadlift_1rm",
    "est_ohp_1rm", "most_sets", "century_club", "bw_ratio", "longest_streak",
    "most_active_month", "weekly_warrior", "total_sessions", "total_km", "total_volume", "total_hours",
}
DEFAULT_BOUNDS = (0, 1e9)
MAX_ITEMS = 60


class _Item(BaseModel):
    id: str
    value: float


class PRRankSubmit(BaseModel):
    records: List[_Item]


def _top_pct(rank: int, total: int) -> int:
    """前幾 %（第 1 名 / 100 人 → 前 1%）。"""
    if total <= 0:
        return 100
    return max(1, min(100, math.ceil(rank / total * 100)))


@router.post("/api/pr-rank/submit")
async def submit_pr_rank(body: PRRankSubmit, request: Request):
    uid = getattr(request.state, "user_id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")

    clean = []
    for it in (body.records or [])[:MAX_ITEMS]:
        rid = (it.id or "").strip()[:48]
        v = float(it.value)
        if not rid or rid not in KNOWN_IDS or not math.isfinite(v):
            continue
        lo, hi = BOUNDS.get(rid, DEFAULT_BOUNDS)
        if v <= 0 or v < lo or v > hi:
            continue
        clean.append((rid, v))

    if clean:
        pr_rank_repo.upsert_many(uid, clean)

    ranks = {}
    for rid, v in clean:
        lower = rid in LOWER_BETTER
        r = pr_rank_repo.rank_of(rid, v, lower)
        ranks[rid] = {
            **r,
            "top_pct": _top_pct(r["rank"], r["total"]),
            "lower_better": lower,
        }
    return {"ranks": ranks}
