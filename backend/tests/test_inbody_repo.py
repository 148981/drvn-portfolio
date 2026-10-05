"""
inbody_repo 單元測試（暫存 SQLite）。
驗證新增/查詢(排序)/更新(payload in-place)/刪除/去重，與舊 JSON 行為一致。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_inbody_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_health import InBodyRecord
from repositories import inbody_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(InBodyRecord).delete()
        db.commit()
    yield


def test_add_and_get():
    rec = inbody_repo.add_record("u1", {
        "measurement_date": "2026-05-01", "weight_kg": 70, "bmi": 22.5,
        "body_fat_percent": 18, "skeletal_muscle_mass": 32,
    })
    assert rec["record_id"].startswith("inbody_u1_")
    assert rec["weight_kg"] == 70 and rec["bmi"] == 22.5

    hist = inbody_repo.get_history("u1")
    assert len(hist) == 1
    assert hist[0]["body_fat_percent"] == 18


def test_get_sorted_desc_and_limit():
    inbody_repo.add_record("u2", {"measurement_date": "2026-05-01", "weight_kg": 70})
    inbody_repo.add_record("u2", {"measurement_date": "2026-05-10", "weight_kg": 68})
    inbody_repo.add_record("u2", {"measurement_date": "2026-05-05", "weight_kg": 69})
    hist = inbody_repo.get_history("u2")
    assert [r["measurement_date"] for r in hist] == ["2026-05-10", "2026-05-05", "2026-05-01"]
    assert len(inbody_repo.get_history("u2", limit=1)) == 1


def test_update_payload():
    rec = inbody_repo.add_record("u3", {"measurement_date": "2026-05-01", "weight_kg": 80, "bmi": 25})
    ok, updated = inbody_repo.update_record("u3", rec["record_id"], {"weight_kg": 78, "bmi": 24})
    assert ok is True and updated["weight_kg"] == 78 and updated["bmi"] == 24
    # 確認確實存進 DB
    assert inbody_repo.get_history("u3")[0]["weight_kg"] == 78

    ok2, _ = inbody_repo.update_record("u3", "nope", {"weight_kg": 1})
    assert ok2 is False


def test_delete():
    rec = inbody_repo.add_record("u4", {"measurement_date": "2026-05-01", "weight_kg": 60})
    ok, msg = inbody_repo.delete_record("u4", rec["record_id"])
    assert ok is True and "2026-05-01" in msg
    assert inbody_repo.get_history("u4") == []


def test_insert_raw_dedup():
    rec = {"record_id": "inbody_uX_111", "measurement_date": "2026-05-01", "created_at": "2026-05-01T00:00:00", "weight_kg": 70}
    assert inbody_repo.insert_raw("uX", rec) is True
    assert inbody_repo.insert_raw("uX", rec) is False
