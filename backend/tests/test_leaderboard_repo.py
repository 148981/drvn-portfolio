"""
leaderboard_repo 單元測試（暫存 SQLite）。
驗證 upsert（同使用者覆蓋而非重複）、依分數排序、榜別隔離。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_leaderboard_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_social import LeaderboardEntry
from repositories import leaderboard_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(LeaderboardEntry).delete()
        db.commit()
    yield


def _entry(uid, type_, score, name="X"):
    return {"user_id": uid, "user_name": name, "type": type_, "score": score,
            "monthly_distance": 0, "monthly_volume": 0, "streak": 0,
            "pr_count": 0, "xp_tier": "初級", "xp_level": 1, "city": "台北"}


def test_upsert_overwrites_same_user():
    leaderboard_repo.upsert(_entry("u1", "run", 100))
    leaderboard_repo.upsert(_entry("u1", "run", 250))   # 同人同榜 → 覆蓋
    rows = leaderboard_repo.get_ranked("run")
    assert len(rows) == 1
    assert rows[0]["score"] == 250.0


def test_ranking_order_and_limit():
    leaderboard_repo.upsert(_entry("a", "run", 100))
    leaderboard_repo.upsert(_entry("b", "run", 300))
    leaderboard_repo.upsert(_entry("c", "run", 200))
    rows = leaderboard_repo.get_ranked("run", limit=2)
    assert [r["user_id"] for r in rows] == ["b", "c"]   # 分數高到低、限 2 筆


def test_type_isolation():
    leaderboard_repo.upsert(_entry("u1", "run", 100))
    leaderboard_repo.upsert(_entry("u1", "strength", 500))
    assert leaderboard_repo.count("run") == 1
    assert leaderboard_repo.count("strength") == 1
    assert leaderboard_repo.get_ranked("strength")[0]["score"] == 500.0


def test_persistence_shape():
    rec = leaderboard_repo.upsert(_entry("u9", "run", 42, name="Mia"))
    assert rec["user_name"] == "Mia" and rec["type"] == "run" and rec["score"] == 42.0
