"""
workout_session_repo 單元測試（暫存 SQLite）。
驗證 per-user 隔離、新增(保留 session_id)、排序(timestamp 由新到舊)、更新、刪除、去重。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_ws_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_training import WorkoutSession
from repositories import workout_session_repo as repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(WorkoutSession).delete()
        db.commit()
    yield


def test_add_preserves_session_id_and_get():
    s = repo.add_session("u1", {"session_id": "session_abc", "timestamp": "2026-05-01T10:00:00", "overall_score": 88})
    assert s["session_id"] == "session_abc"
    hist = repo.get_history("u1")
    assert len(hist) == 1 and hist[0]["overall_score"] == 88


def test_add_generates_id_when_missing():
    s = repo.add_session("u1", {"timestamp": "2026-05-01T10:00:00"})
    assert s["session_id"].startswith("session_")


def test_history_sorted_newest_first():
    repo.add_session("u2", {"session_id": "a", "timestamp": "2026-05-01T08:00:00"})
    repo.add_session("u2", {"session_id": "b", "timestamp": "2026-05-03T08:00:00"})
    repo.add_session("u2", {"session_id": "c", "timestamp": "2026-05-02T08:00:00"})
    ids = [h["session_id"] for h in repo.get_history("u2")]
    assert ids == ["b", "c", "a"]
    assert len(repo.get_history("u2", limit=2)) == 2


def test_user_isolation():
    repo.add_session("a", {"session_id": "x", "timestamp": "2026-05-01T00:00:00"})
    assert repo.get_history("b") == []
    assert repo.count("a") == 1


def test_update_and_delete():
    repo.add_session("u3", {"session_id": "s1", "timestamp": "2026-05-01T00:00:00", "note": "old"})
    ok, payload = repo.update_session("u3", "s1", {"note": "new", "overall_score": 90})
    assert ok and payload["note"] == "new" and payload["overall_score"] == 90
    assert repo.get_history("u3")[0]["note"] == "new"

    ok2, _ = repo.delete_session("u3", "s1")
    assert ok2 and repo.get_history("u3") == []
    assert repo.update_session("u3", "nope", {"x": 1})[0] is False


def test_same_session_id_upserts():
    repo.add_session("u4", {"session_id": "dup", "timestamp": "2026-05-01T00:00:00", "v": 1})
    repo.add_session("u4", {"session_id": "dup", "timestamp": "2026-05-01T00:00:00", "v": 2})
    hist = repo.get_history("u4")
    assert len(hist) == 1 and hist[0]["v"] == 2


def test_insert_raw_dedup():
    s = {"session_id": "raw1", "timestamp": "2026-05-01T00:00:00"}
    assert repo.insert_raw("u5", s) is True
    assert repo.insert_raw("u5", s) is False
