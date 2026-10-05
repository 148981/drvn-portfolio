"""
repositories/inbody_repo.py — InBody 體組成紀錄 倉儲層
======================================================

取代原本 inbody_history.json 的讀寫，方法回傳形狀與舊 JSON 函式一致。
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional, Tuple, Union

from core.db import SessionLocal, init_db
from core.models_health import InBodyRecord

init_db()

# add 時要建立的欄位（與舊 add_inbody_record 完全一致）
_FIELDS = [
    "weight_kg", "bmi", "body_fat_percent", "skeletal_muscle_mass",
    "muscle_percent", "body_water_percent", "visceral_fat_level", "bmr",
    "protein_mass", "mineral_mass", "body_fat_mass",
    "right_arm_muscle", "left_arm_muscle", "trunk_muscle",
    "right_leg_muscle", "left_leg_muscle",
]
# update 允許更新的欄位（與舊 update_inbody_record 一致）
_UPDATABLE = [
    "measurement_date", "weight_kg", "bmi", "body_fat_percent",
    "skeletal_muscle_mass", "muscle_percent", "body_water_percent",
    "visceral_fat_level", "bmr", "protein_mass", "mineral_mass", "body_fat_mass",
]


def _sort_key(rec: dict):
    return (rec.get("measurement_date", "") or "", rec.get("created_at", "") or "")


def add_record(user_id: str, record_data: dict) -> dict:
    """新增一筆 InBody 紀錄，回傳 record dict（形狀同舊 JSON）。"""
    ts = int(datetime.now().timestamp())
    record = {
        # 加 4 碼 hex 避免同秒碰撞（舊版 inbody_<user>_<秒> 會撞 ID）
        "record_id": f"inbody_{user_id}_{ts}_{uuid.uuid4().hex[:4]}",
        "measurement_date": record_data.get("measurement_date"),
        "created_at": datetime.now().isoformat(),
    }
    for f in _FIELDS:
        record[f] = record_data.get(f)

    with SessionLocal() as db:
        db.add(InBodyRecord(
            record_id=record["record_id"],
            user_id=user_id,
            measurement_date=record.get("measurement_date") or "",
            created_at=record["created_at"],
            payload=record,
        ))
        db.commit()
    return record


def get_history(user_id: str, limit: Optional[int] = None) -> List[dict]:
    """依 (measurement_date, created_at) 由新到舊排序，回傳 record dict list。"""
    with SessionLocal() as db:
        rows = db.query(InBodyRecord).filter(InBodyRecord.user_id == user_id) \
            .order_by(InBodyRecord.measurement_date.desc(), InBodyRecord.created_at.desc()).all()
    records = [r.to_record_dict() for r in rows]
    # 以記憶體再排一次，確保與舊版完全相同的 tie-break
    records.sort(key=_sort_key, reverse=True)
    return records[:limit] if limit else records


def update_record(user_id: str, record_id: str, updates: dict) -> Tuple[bool, Union[dict, str]]:
    with SessionLocal() as db:
        row = db.query(InBodyRecord).filter(
            InBodyRecord.user_id == user_id,
            InBodyRecord.record_id == record_id,
        ).first()
        if not row:
            return False, "Record not found"
        payload = dict(row.payload or {})
        for f in _UPDATABLE:
            if f in updates:
                payload[f] = updates[f]
        row.payload = payload
        if "measurement_date" in updates:
            row.measurement_date = updates["measurement_date"] or ""
        # SQLAlchemy 對 JSON 欄位的 in-place 變更需明確標記
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(row, "payload")
        db.commit()
        return True, payload


def delete_record(user_id: str, record_id: str) -> Tuple[bool, str]:
    with SessionLocal() as db:
        row = db.query(InBodyRecord).filter(
            InBodyRecord.user_id == user_id,
            InBodyRecord.record_id == record_id,
        ).first()
        if not row:
            return False, "Record not found"
        md = (row.payload or {}).get("measurement_date")
        db.delete(row)
        db.commit()
        return True, f"Deleted record from {md}"


def record_exists(record_id: str) -> bool:
    with SessionLocal() as db:
        return db.query(InBodyRecord).filter(InBodyRecord.record_id == record_id).first() is not None


def insert_raw(user_id: str, record: dict) -> bool:
    """供 migration 使用，保留原 record_id；已存在則略過。"""
    rid = record.get("record_id")
    if not rid or record_exists(rid):
        return False
    with SessionLocal() as db:
        db.add(InBodyRecord(
            record_id=rid,
            user_id=user_id,
            measurement_date=record.get("measurement_date") or "",
            created_at=record.get("created_at") or "",
            payload=record,
        ))
        db.commit()
        return True
