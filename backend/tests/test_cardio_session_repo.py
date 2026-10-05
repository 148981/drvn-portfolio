"""
cardio_session_repo 單元測試（暫存 SQLite）。
驗證 get_all/sync（upsert + 刪除已移除）、per-user 隔離、去重。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_cardio_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_training import CardioSession
from repositories import cardio_session_repo as repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(CardioSession).delete()
        db.commit()
    yield


def test_sync_and_get_all():
    repo.sync("u1", {
        "s1": {"session_id": "s1", "created_at": "2026-05-01", "metrics": {"distance": 5}},
        "s2": {"session_id": "s2", "created_at": "2026-05-02", "metrics": {"distance": 8}},
    })
    alld = repo.get_all("u1")
    assert set(alld.keys()) == {"s1", "s2"}
    assert alld["s2"]["metrics"]["distance"] == 8


def test_sync_upserts_and_deletes():
    repo.sync("u2", {"a": {"v": 1}, "b": {"v": 2}})
    # 第二次：更新 a、移除 b、新增 c
    repo.sync("u2", {"a": {"v": 10}, "c": {"v": 3}})
    alld = repo.get_all("u2")
    assert set(alld.keys()) == {"a", "c"}
    assert alld["a"]["v"] == 10


def test_user_isolation():
    repo.sync("a", {"x": {"v": 1}})
    assert repo.get_all("b") == {}
    assert repo.count("a") == 1


def test_insert_raw_dedup():
    assert repo.insert_raw("u3", "sid1", {"created_at": "2026-05-01"}) is True
    assert repo.insert_raw("u3", "sid1", {"created_at": "2026-05-01"}) is False
