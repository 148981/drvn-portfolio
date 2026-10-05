"""
repositories/cardio_session_repo.py — 有氧 session 倉儲層
=========================================================

取代每使用者一個 cardio_sessions_<id>.json（dict {session_id: session}）。
只需提供 get_all / sync 兩個原語，cardio_storage.py 的 load/save 改走這裡，
其餘所有功能（create/delete/分析/去重）都透過 load/save 自動沿用 DB。
"""
from __future__ import annotations

from typing import Dict

from sqlalchemy.orm.attributes import flag_modified

from core.db import SessionLocal, init_db
from core.models_training import CardioSession

init_db()


def _sort_key(payload: dict) -> str:
    return str(payload.get("created_at") or payload.get("completed_at")
               or payload.get("timestamp") or "")


def get_all(user_id: str) -> Dict[str, dict]:
    """回傳 {session_id: session_dict}，與舊 load_user_sessions 形狀一致。"""
    with SessionLocal() as db:
        rows = db.query(CardioSession).filter(CardioSession.user_id == user_id).all()
        return {r.session_id: dict(r.payload or {}) for r in rows}


def load_summaries(user_id: str):
    """Read load fields without routes/streams and without a result-count cap."""
    keys = ("metrics", "created_at", "date", "completed_at", "timestamp", "sport", "sport_type", "type", "source")
    with SessionLocal() as db:
        rows = db.query(CardioSession.session_id, *[CardioSession.payload[k] for k in keys])\
            .filter(CardioSession.user_id == user_id).all()
        return [{"session_id": r[0], **dict(zip(keys, r[1:]))} for r in rows]


def get_all_global() -> Dict[str, dict]:
    """🟢 跨所有使用者彙整全部 cardio session（取代舊的全域 cardio_sessions.json）。
    回傳 {session_id: session_dict}，並確保每筆 payload 內含 user_id，
    讓排行榜 / 個人檔 / feed 等 caller 的 `s.get('user_id')` 能正確運作。"""
    with SessionLocal() as db:
        rows = db.query(CardioSession).all()
        out: Dict[str, dict] = {}
        for r in rows:
            payload = dict(r.payload or {})
            payload.setdefault("user_id", r.user_id)  # DB 欄位為準，補進 payload
            out[r.session_id] = payload
        return out


def sync(user_id: str, sessions: Dict[str, dict]) -> None:
    """把整份 {session_id: session} 同步進 DB：upsert 全部、刪除已移除的。
    對應舊 save_user_sessions 的「整份覆寫」語意。"""
    incoming = sessions or {}
    with SessionLocal() as db:
        existing = {r.session_id: r for r in
                    db.query(CardioSession).filter(CardioSession.user_id == user_id).all()}

        # 刪除已不在 incoming 的
        for sid, row in existing.items():
            if sid not in incoming:
                db.delete(row)

        # upsert
        for sid, payload in incoming.items():
            payload = payload or {}
            row = existing.get(sid)
            if row is None:
                row = CardioSession(session_id=sid, user_id=user_id)
                db.add(row)
            row.user_id = user_id
            row.payload = payload
            row.sort_key = _sort_key(payload)
            flag_modified(row, "payload")

        db.commit()


def insert_raw(user_id: str, session_id: str, payload: dict) -> bool:
    """供 migration：已存在則略過。"""
    with SessionLocal() as db:
        if db.query(CardioSession).filter(CardioSession.session_id == session_id).first():
            return False
        db.add(CardioSession(
            session_id=session_id, user_id=user_id,
            payload=payload or {}, sort_key=_sort_key(payload or {}),
        ))
        db.commit()
        return True


def count(user_id: str) -> int:
    with SessionLocal() as db:
        return db.query(CardioSession).filter(CardioSession.user_id == user_id).count()
