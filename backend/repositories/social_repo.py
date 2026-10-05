"""
repositories/social_repo.py — 通用「具名 JSON 清單」倉儲層
==========================================================

原為社群清單而建，現也作為 segments / challenges 等全域 JSON list 的通用
儲存（以 collection 名稱為 key，整份 list 讀寫）。對應的 storage 類別把
_load_json/_save_json 改走這裡即可。

涵蓋集合：activities/kudos/comments/friend_requests/friendships/blocks、
          segments/segment_efforts/personal_records、challenges/challenge_participants
"""
from __future__ import annotations

from typing import List

from sqlalchemy.orm.attributes import flag_modified

from core.db import SessionLocal, init_db
from core.models_social import SocialCollection

init_db()

# 已知集合（migration / purge 用）
KNOWN_COLLECTIONS = [
    "activities", "kudos", "comments", "friend_kudos",
    "friend_requests", "friendships", "blocks",
    "segments", "segment_efforts", "personal_records",
    "challenges", "challenge_participants",
]


def load(name: str) -> List[dict]:
    """回傳某集合的整份 list（沒有則 []）。"""
    with SessionLocal() as db:
        r = db.query(SocialCollection).filter(SocialCollection.name == name).first()
        return list(r.items) if (r and r.items) else []


def save(name: str, items: List[dict]) -> None:
    """整份覆寫某集合。"""
    with SessionLocal() as db:
        r = db.query(SocialCollection).filter(SocialCollection.name == name).first()
        if r is None:
            r = SocialCollection(name=name)
            db.add(r)
        r.items = items or []
        flag_modified(r, "items")
        db.commit()


def purge_user(user_id: str) -> dict:
    """帳號刪除：把所有集合裡「任一欄位等於該 user_id」的項目移除。
    回傳各集合移除筆數。"""
    removed = {}
    for name in KNOWN_COLLECTIONS:
        items = load(name)
        if not items:
            continue
        kept = [it for it in items if not _references_user(it, user_id)]
        n = len(items) - len(kept)
        if n:
            save(name, kept)
        removed[name] = n
    return removed


def _references_user(item: dict, user_id: str) -> bool:
    if not isinstance(item, dict):
        return False
    return any(v == user_id for v in item.values())
