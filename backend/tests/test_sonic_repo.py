"""sonic_repo 單元測試（暫存 SQLite）。"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_sonic_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_social import SonicLibrary
from repositories import sonic_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(SonicLibrary).delete()
        db.commit()
    yield


def test_default_when_empty():
    assert sonic_repo.get("nobody") == {"categories": [], "playlists": []}


def test_save_get_overwrite_isolation():
    sonic_repo.save("u1", {"categories": [{"id": "c1"}], "playlists": []})
    assert len(sonic_repo.get("u1")["categories"]) == 1
    sonic_repo.save("u1", {"categories": [], "playlists": [{"id": "p1"}]})   # 整份覆寫
    g = sonic_repo.get("u1")
    assert g["categories"] == [] and len(g["playlists"]) == 1
    assert sonic_repo.get("u2") == {"categories": [], "playlists": []}
