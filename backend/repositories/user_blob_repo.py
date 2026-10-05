"""
repositories/user_blob_repo.py — 通用 user-blob 倉儲層
======================================================
get / put 兩個原語，給前端 localStorage 資料做雲端備份/還原。
"""
from __future__ import annotations

from typing import Optional
from contextlib import contextmanager
from copy import deepcopy
from sqlalchemy import select, text

from sqlalchemy.orm.attributes import flag_modified

from core.db import SessionLocal, init_db
from core.models_misc import UserBlob

init_db()  # 啟動時確保資料表存在（冪等）

# 「這一列剛建好、還沒被初始化」的哨兵值。
# ⚠️ 為什麼不是 []：原本用 [] 當佔位值，並且只靠 INSERT 的 rowcount 判斷
#    「這列是不是我建的」。rowcount 在 SQLite（開發）與 Postgres（正式）
#    的 ON CONFLICT DO NOTHING 上不保證一致 —— 只要 rowcount 沒回 1，
#    payload 就會被當成「使用者的真實資料 []」原封不動存回去，
#    之後每一次讀都拿到 []，呼叫端做 state['squads'] 就 TypeError，
#    整個社團系統永久 500（正式站就是這樣壞的）。
#    改成一個真實資料不可能長成的哨兵，並且用「值」而不是 rowcount 判斷。
_UNINITIALIZED = {"__uninitialized__": True}


@contextmanager
def transaction(user_id: str, key: str, initial):
    """Serialize a blob read/modify/write, including concurrent first creation.

    SQLite needs BEGIN IMMEDIATE (FOR UPDATE is ignored there). PostgreSQL uses
    a unique-key insert followed by a row lock. Exceptions roll back all changes.
    The yielded envelope can replace payload without leaking ORM-owned objects.
    """
    with SessionLocal() as db:
        dialect = db.bind.dialect.name
        if dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert
            db.execute(text("BEGIN IMMEDIATE"))
        elif dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            raise RuntimeError("Unsupported blob transaction dialect")
        db.execute(insert(UserBlob).values(user_id=user_id, key=key, payload=_UNINITIALIZED)
                   .on_conflict_do_nothing(index_elements=["user_id", "key"]))
        row = db.execute(select(UserBlob).where(UserBlob.user_id == user_id, UserBlob.key == key)
                         .with_for_update()).scalar_one()
        original = deepcopy(row.payload)
        fresh = original == _UNINITIALIZED   # 用值判斷，不靠 rowcount
        state = {"payload": deepcopy(initial() if fresh else original)}
        yield state
        if fresh or state["payload"] != original:
            row.payload = state["payload"]
            flag_modified(row, "payload")
        db.commit()


def get(user_id: str, key: str) -> Optional[object]:
    with SessionLocal() as db:
        r = db.query(UserBlob).filter(
            UserBlob.user_id == user_id, UserBlob.key == key
        ).first()
        return r.payload if (r and r.payload is not None) else None


def put(user_id: str, key: str, payload) -> None:
    with SessionLocal() as db:
        r = db.query(UserBlob).filter(
            UserBlob.user_id == user_id, UserBlob.key == key
        ).first()
        if r is None:
            r = UserBlob(user_id=user_id, key=key, payload=payload)
            db.add(r)
        else:
            r.payload = payload
            flag_modified(r, "payload")
        db.commit()
