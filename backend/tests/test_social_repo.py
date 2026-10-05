"""social_repo + SocialStorage/FriendsStorage(DB 版) 行為測試。"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_social_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_social import SocialCollection
from repositories import social_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(SocialCollection).delete()
        db.commit()
    yield


def test_load_save_per_collection():
    assert social_repo.load("activities") == []
    social_repo.save("activities", [{"id": "a1", "user_id": "u1"}])
    social_repo.save("kudos", [{"id": "k1", "user_id": "u2"}])
    assert len(social_repo.load("activities")) == 1
    assert social_repo.load("kudos")[0]["id"] == "k1"
    assert social_repo.load("comments") == []   # 互不影響


def test_storage_primitives_go_through_db():
    # SocialStorage 與 FriendsStorage 的 _load_json/_save_json 應改走 DB（以檔名 stem 為集合名）
    from pathlib import Path
    from core.social import SocialStorage
    st = SocialStorage("/tmp/ignored")   # 路徑被忽略，實際走 DB
    st._save_json(Path("/whatever/activities.json"), [{"id": "x1", "user_id": "u1"}])
    assert st._load_json(Path("/another/activities.json")) == [{"id": "x1", "user_id": "u1"}]
    # 確認真的進了 social_collections 表
    assert social_repo.load("activities")[0]["id"] == "x1"


def test_purge_user_removes_references():
    social_repo.save("activities", [{"id": "a1", "user_id": "u1"}, {"id": "a2", "user_id": "u2"}])
    social_repo.save("friendships", [{"user1": "u1", "user2": "u2"}, {"user1": "u3", "user2": "u4"}])
    removed = social_repo.purge_user("u1")
    assert removed["activities"] == 1 and removed["friendships"] == 1
    assert [a["id"] for a in social_repo.load("activities")] == ["a2"]
    assert len(social_repo.load("friendships")) == 1
