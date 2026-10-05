"""
pr_tracker(DB 版) 行為測試（暫存 SQLite）。
透過 pr_tracker 的公開函式驗證：第一次寫入為新 PR、超越才更新、history 累積。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_pr2_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_training import UserPR
from repositories import pr_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(UserPR).delete()
        db.commit()
    yield


def _save(uid, ex, w, reps=5, date="2026-05-01"):
    from core.pr_tracker import save_pr_record, PRSaveRequest
    return save_pr_record(PRSaveRequest(user_id=uid, exercise_id=ex, weight=w, reps=reps, date=date), data_dir="")


def test_first_is_new_pr():
    r = _save("u1", "bench", 60)
    assert r["success"] and r["is_new_pr"] is True and r["new_pr"] == 60


def test_lower_not_new_higher_updates():
    _save("u1", "bench", 60)
    r2 = _save("u1", "bench", 55)   # 較低 → 不是新 PR
    assert r2["is_new_pr"] is False and r2["new_pr"] == 60
    r3 = _save("u1", "bench", 70)   # 較高 → 新 PR
    assert r3["is_new_pr"] is True and r3["new_pr"] == 70 and r3["previous_pr"] == 60


def test_history_accumulates_and_isolation():
    _save("u2", "squat", 80)
    _save("u2", "squat", 90)
    prs = pr_repo.get_all("u2")
    assert prs["squat"]["weight"] == 90
    assert len(prs["squat"]["history"]) == 2
    assert pr_repo.get_all("other") == {}
