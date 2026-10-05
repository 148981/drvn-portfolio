"""
strength_repo 的單元測試（用獨立的暫存 SQLite，不碰正式資料）。
驗證 DB 版的行為與原 JSON 版一致：新增/查詢/更新/刪除 + 去重。
"""
import os
import tempfile

# 必須在 import core.db / strength_repo 之前就把 DATABASE_URL 指到暫存檔
_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_strength_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_training import StrengthRecord
from repositories import strength_repo

init_db()


@pytest.fixture(autouse=True)
def _clean_table():
    """每個測試前清空 strength_records，確保隔離。"""
    with SessionLocal() as db:
        db.query(StrengthRecord).delete()
        db.commit()
    yield


def test_add_and_get_by_exercise():
    rec = strength_repo.add_record("u1", {
        "exercise_name": "Bench Press", "date": "2026-05-01",
        "training_weight": 60, "pr_weight": 60, "reps": 5, "note": "ok",
    })
    assert rec["record_id"].startswith("strength_")
    assert rec["training_weight"] == 60.0

    rows = strength_repo.get_history("u1", "Bench Press")
    assert len(rows) == 1
    assert rows[0]["reps"] == 5


def test_get_all_grouped_and_sorted():
    strength_repo.add_record("u2", {"exercise_name": "Squat", "date": "2026-05-03", "training_weight": 80, "pr_weight": 80, "reps": 3})
    strength_repo.add_record("u2", {"exercise_name": "Squat", "date": "2026-05-01", "training_weight": 70, "pr_weight": 70, "reps": 5})
    strength_repo.add_record("u2", {"exercise_name": "Deadlift", "date": "2026-05-02", "training_weight": 100, "pr_weight": 100, "reps": 2})

    grouped = strength_repo.get_history("u2")
    assert set(grouped.keys()) == {"Squat", "Deadlift"}
    assert [r["date"] for r in grouped["Squat"]] == ["2026-05-01", "2026-05-03"]


def test_user_isolation():
    strength_repo.add_record("a", {"exercise_name": "Row", "date": "2026-05-01", "training_weight": 40, "pr_weight": 40, "reps": 8})
    assert strength_repo.get_history("b") == {}


def test_update():
    rec = strength_repo.add_record("u3", {"exercise_name": "OHP", "date": "2026-05-01", "training_weight": 30, "pr_weight": 30, "reps": 5})
    ok, updated = strength_repo.update_record("u3", rec["record_id"], {"training_weight": 35, "note": "PR!"})
    assert ok is True
    assert updated["training_weight"] == 35.0 and updated["note"] == "PR!"

    ok2, _ = strength_repo.update_record("u3", "nonexistent", {"reps": 1})
    assert ok2 is False


def test_delete():
    rec = strength_repo.add_record("u4", {"exercise_name": "Curl", "date": "2026-05-01", "training_weight": 15, "pr_weight": 15, "reps": 10})
    ok, _ = strength_repo.delete_record("u4", rec["record_id"])
    assert ok is True
    assert strength_repo.get_history("u4", "Curl") == []

    ok2, _ = strength_repo.delete_record("u4", rec["record_id"])
    assert ok2 is False


def test_insert_raw_dedup():
    rec = {"record_id": "strength_123", "date": "2026-05-01", "training_weight": 50, "pr_weight": 50, "reps": 5, "note": ""}
    assert strength_repo.insert_raw("u5", "Bench Press", rec) is True
    assert strength_repo.insert_raw("u5", "Bench Press", rec) is False
