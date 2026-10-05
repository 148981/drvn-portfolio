"""
repositories/sonic_repo.py — SonicFocus 音樂庫 倉儲層
=====================================================

取代每使用者一個 sonic_library_<id>.json。get / save 兩個原語。
"""
from __future__ import annotations

from sqlalchemy.orm.attributes import flag_modified

from core.db import SessionLocal, init_db
from core.models_social import SonicLibrary

init_db()

_DEFAULT = {"categories": [], "playlists": []}


def get(user_id: str) -> dict:
    with SessionLocal() as db:
        r = db.query(SonicLibrary).filter(SonicLibrary.user_id == user_id).first()
        return dict(r.payload) if (r and r.payload) else dict(_DEFAULT)


def save(user_id: str, data: dict) -> None:
    with SessionLocal() as db:
        r = db.query(SonicLibrary).filter(SonicLibrary.user_id == user_id).first()
        if r is None:
            r = SonicLibrary(user_id=user_id)
            db.add(r)
        r.payload = data or dict(_DEFAULT)
        flag_modified(r, "payload")
        db.commit()
