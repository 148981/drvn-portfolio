"""
repositories/plan_repo.py — 訓練計劃倉儲層
==========================================

取代每使用者一個 user_<id>_plans.json（有序 list，最後一筆為 latest）。
提供 load / save 兩個原語，各路由把檔案 I/O 換成這裡即可。
"""
from __future__ import annotations

from typing import List
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
import hashlib
from sqlalchemy import text

from core.db import SessionLocal, init_db
from core.models_training import WorkoutPlan

init_db()

_active = ContextVar("strength_plan_transaction", default=None)


@contextmanager
def transaction(user_id):
    """Serialize the entire read/modify/write operation, including an empty user list."""
    active = _active.get()
    if active is not None:
        if active[0] != user_id:
            raise RuntimeError("Cannot mix users in a plan transaction")
        yield active[1]
        return
    with SessionLocal() as db:
        dialect = db.get_bind().dialect.name
        if dialect == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        elif dialect == "postgresql":
            lock_id = int.from_bytes(hashlib.sha256(f"strength-plans:{user_id}".encode()).digest()[:8], "big", signed=True)
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})
        else:
            raise RuntimeError("Unsupported plan transaction dialect")
        token = _active.set((user_id, db))
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            _active.reset(token)


def _read(db, user_id):
    rows = db.query(WorkoutPlan).filter(WorkoutPlan.user_id == user_id) \
        .order_by(WorkoutPlan.position.asc(), WorkoutPlan.id.asc()).all()
    return [deepcopy(r.payload or {}) for r in rows]


def load(user_id: str) -> List[dict]:
    """回傳該使用者的計劃 list（依 position 由舊到新，與原 JSON 清單順序一致）。"""
    active = _active.get()
    if active is not None:
        if active[0] != user_id:
            raise RuntimeError("Cannot mix users in a plan transaction")
        return _read(active[1], user_id)
    with SessionLocal() as db:
        return _read(db, user_id)


def save(user_id: str, plans: List[dict]) -> None:
    """整份覆寫該使用者的計劃清單（對應原 json.dump 整份寫入）。
    用「刪除全部 + 依序重建」確保清單順序與內容完全一致。"""
    plans = plans or []
    with transaction(user_id):
        db = _active.get()[1]
        db.query(WorkoutPlan).filter(WorkoutPlan.user_id == user_id).delete()
        for idx, plan in enumerate(plans):
            db.add(WorkoutPlan(
                user_id=user_id,
                plan_id=(plan or {}).get("plan_id"),
                position=idx,
                payload=deepcopy(plan or {}),
            ))
        db.flush()


def count(user_id: str) -> int:
    with SessionLocal() as db:
        return db.query(WorkoutPlan).filter(WorkoutPlan.user_id == user_id).count()
