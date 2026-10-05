"""
profile_repo 單元測試（暫存 SQLite）。
驗證 upsert/get/get_all、upsert_many 不誤刪、delete、purge_user_everywhere。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_profile_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_health import UserProfile
from core.models_training import StrengthRecord
from repositories import profile_repo, strength_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(UserProfile).delete()
        db.query(StrengthRecord).delete()
        db.commit()
    yield


def test_upsert_get():
    profile_repo.upsert("u1", {"name": "Mia", "weight_kg": 60})
    p = profile_repo.get("u1")
    assert p["name"] == "Mia" and p["weight_kg"] == 60
    profile_repo.upsert("u1", {"name": "Mia2"})   # 覆蓋
    assert profile_repo.get("u1")["name"] == "Mia2"


def test_get_all_and_isolation():
    profile_repo.upsert("a", {"name": "A"})
    profile_repo.upsert("b", {"name": "B"})
    alld = profile_repo.get_all()
    assert set(alld.keys()) == {"a", "b"}
    assert profile_repo.get("nobody") is None


def test_upsert_many_does_not_delete_others():
    profile_repo.upsert("keep", {"name": "Keep"})
    # upsert_many 只給一個 user，不應刪掉 keep
    profile_repo.upsert_many({"new": {"name": "New"}})
    assert profile_repo.get("keep") is not None
    assert profile_repo.get("new") is not None


def test_delete():
    profile_repo.upsert("u9", {"name": "X"})
    assert profile_repo.delete("u9") is True
    assert profile_repo.get("u9") is None
    assert profile_repo.delete("u9") is False


def test_purge_user_everywhere():
    profile_repo.upsert("uP", {"name": "P"})
    strength_repo.add_record("uP", {"exercise_name": "Bench", "date": "2026-05-01", "training_weight": 50, "pr_weight": 50, "reps": 5})
    profile_repo.upsert("other", {"name": "Other"})

    res = profile_repo.purge_user_everywhere("uP")
    assert res["user_profiles"] == 1 and res["strength_records"] == 1
    assert profile_repo.get("uP") is None
    assert strength_repo.get_history("uP", "Bench") == []
    # 別人不受影響
    assert profile_repo.get("other") is not None
