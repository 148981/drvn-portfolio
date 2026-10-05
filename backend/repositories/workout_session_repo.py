"""
repositories/workout_session_repo.py — 訓練 session 倉儲層（統一儲存）
=====================================================================

取代分裂的兩套 JSON：
  - 全域 workout_history.json（{user_id: [sessions]}，legacy）
  - 每使用者 user_X_history.json（[sessions]，前端與動作偵測實際在用）

統一成一張 per-user 的 workout_sessions 表。所有讀寫點都改走這裡。
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional, Tuple, Union

from core.db import SessionLocal, init_db
from core.models_training import WorkoutSession

init_db()


def _gen_session_id() -> str:
    now = datetime.now()
    return f"session_{now.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"


def add_session(user_id: str, session: dict) -> dict:
    """新增一筆 session。沿用 session 內既有的 session_id / timestamp（沒有才補）。
    回傳存入的 session dict（含 session_id）。"""
    session = dict(session or {})
    sid = session.get("session_id") or _gen_session_id()
    session["session_id"] = sid
    ts = session.get("timestamp") or datetime.now().isoformat()
    session["timestamp"] = ts

    with SessionLocal() as db:
        # 同 session_id 視為更新（保險：避免重複 insert 撞唯一鍵）
        row = db.query(WorkoutSession).filter(WorkoutSession.session_id == sid).first()
        if row is None:
            row = WorkoutSession(session_id=sid, user_id=user_id)
            db.add(row)
        row.user_id = user_id
        row.timestamp = ts
        row.session_type = session.get("type") or session.get("session_type")
        row.payload = session
        db.commit()
    return session


def get_history(user_id: str, limit: Optional[int] = None) -> List[dict]:
    """回傳該使用者的 session list，依 timestamp 由新到舊（與舊版一致：最新在前）。"""
    with SessionLocal() as db:
        q = db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id) \
            .order_by(WorkoutSession.timestamp.desc(), WorkoutSession.id.desc())
        if limit:
            q = q.limit(limit)
        return [r.to_dict() for r in q.all()]


def update_session(user_id: str, session_id: str, updates: dict) -> Tuple[bool, Union[dict, str]]:
    """把 updates 併進該 session 的 payload。回傳 (成功?, 更新後 payload 或訊息)。"""
    with SessionLocal() as db:
        row = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_id == session_id,
        ).first()
        if not row:
            return False, "Record not found"
        payload = dict(row.payload or {})
        payload.update(updates or {})
        row.payload = payload
        if "timestamp" in (updates or {}):
            row.timestamp = updates["timestamp"]
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(row, "payload")
        db.commit()
        return True, payload


def delete_session(user_id: str, session_id: str) -> Tuple[bool, str]:
    with SessionLocal() as db:
        row = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_id == session_id,
        ).first()
        if not row:
            return False, "Record not found"
        db.delete(row)
        db.commit()
        return True, "Deleted"


def count(user_id: str) -> int:
    with SessionLocal() as db:
        return db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id).count()


def insert_raw(user_id: str, session: dict) -> bool:
    """供 migration：保留原 session_id，已存在則略過。"""
    sid = session.get("session_id")
    if not sid:
        sid = _gen_session_id()
        session = {**session, "session_id": sid}
    with SessionLocal() as db:
        if db.query(WorkoutSession).filter(WorkoutSession.session_id == sid).first():
            return False
        db.add(WorkoutSession(
            session_id=sid,
            user_id=user_id,
            timestamp=session.get("timestamp") or "",
            session_type=session.get("type") or session.get("session_type"),
            payload=session,
        ))
        db.commit()
        return True
