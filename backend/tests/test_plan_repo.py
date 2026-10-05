"""
plan_repo 單元測試（暫存 SQLite）。驗證 load/save 保序、整份覆寫、per-user 隔離。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_plan_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_training import WorkoutPlan
from repositories import plan_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(WorkoutPlan).delete()
        db.commit()
    yield


def test_save_load_preserves_order():
    plans = [{"plan_id": "a", "n": 1}, {"plan_id": "b", "n": 2}, {"plan_id": "c", "n": 3}]
    plan_repo.save("u1", plans)
    loaded = plan_repo.load("u1")
    assert [p["plan_id"] for p in loaded] == ["a", "b", "c"]
    assert loaded[-1]["n"] == 3   # last = latest


def test_save_replaces_whole_list():
    plan_repo.save("u2", [{"plan_id": "x"}, {"plan_id": "y"}])
    plan_repo.save("u2", [{"plan_id": "z"}])   # 整份覆寫
    loaded = plan_repo.load("u2")
    assert [p["plan_id"] for p in loaded] == ["z"]


def test_user_isolation_and_count():
    plan_repo.save("a", [{"plan_id": "p1"}])
    assert plan_repo.load("b") == []
    assert plan_repo.count("a") == 1


def test_empty():
    assert plan_repo.load("nobody") == []
    plan_repo.save("u3", [])
    assert plan_repo.load("u3") == []
