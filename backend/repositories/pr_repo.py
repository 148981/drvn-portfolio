"""
repositories/pr_repo.py — 個人最佳紀錄 (PR) 倉儲層
====================================================

取代每使用者一個 pr_records/<id>_prs.json（dict {exercise_id: {...}}）。
提供 get_all / save，pr_tracker.py 改走這裡。
"""
from __future__ import annotations

from typing import Dict

from sqlalchemy.orm.attributes import flag_modified

from core.db import SessionLocal, init_db
from core.models_training import UserPR

init_db()


def get_all(user_id: str) -> Dict[str, dict]:
    """回傳該使用者的 {exercise_id: {...}}（沒有則 {}）。"""
    with SessionLocal() as db:
        r = db.query(UserPR).filter(UserPR.user_id == user_id).first()
        return dict(r.payload or {}) if r else {}


def save(user_id: str, prs: Dict[str, dict]) -> None:
    """整份覆寫該使用者的 PR dict。"""
    with SessionLocal() as db:
        r = db.query(UserPR).filter(UserPR.user_id == user_id).first()
        if r is None:
            r = UserPR(user_id=user_id)
            db.add(r)
        r.payload = prs or {}
        flag_modified(r, "payload")
        db.commit()
