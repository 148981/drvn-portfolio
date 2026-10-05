"""
repositories/strength_repo.py — 肌力訓練紀錄 倉儲層
===================================================

取代原本 strength_history.json 的讀寫。對外提供與舊 JSON 函式
「相同語意、相同回傳形狀」的方法，因此 workout_history.py 只要把實作
換成呼叫這裡，所有上層呼叫端（api_strength、api_plan_endpoints、
goal_predictor）完全不用改。

DB 交易天生具備原子性與並發安全，解決了原本 JSON 讀-改-寫的 lost-update
與部分寫入毀損問題。
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Tuple, Union

from core.db import SessionLocal, init_db
from core.models_training import StrengthRecord

# 啟動時確保資料表存在（冪等）
init_db()


def _new_record_id() -> str:
    """產生唯一 record_id。沿用 strength_<秒> 前綴，加 4 碼 hex 避免同秒碰撞。"""
    return f"strength_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:4]}"


def add_record(user_id: str, record_data: dict) -> dict:
    """新增一筆肌力紀錄，回傳 record dict（形狀同舊 JSON）。"""
    exercise_name = record_data.get("exercise_name", "Unknown")
    rec = StrengthRecord(
        record_id=_new_record_id(),
        user_id=user_id,
        exercise_name=exercise_name,
        date=record_data.get("date", datetime.now().strftime("%Y-%m-%d")),
        training_weight=float(record_data.get("training_weight", 0) or 0),
        pr_weight=float(record_data.get("pr_weight", 0) or 0),
        reps=int(record_data.get("reps", 0) or 0),
        note=record_data.get("note", "") or "",
    )
    with SessionLocal() as db:
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return rec.to_record_dict()


def get_history(user_id: str, exercise_name: Optional[str] = None) -> Union[list, dict]:
    """取得歷史。指定 exercise_name → list；否則 → {exercise_name: [records]}。
    皆依 date 由舊到新排序（與舊版一致）。"""
    with SessionLocal() as db:
        q = db.query(StrengthRecord).filter(StrengthRecord.user_id == user_id)
        if exercise_name:
            rows = q.filter(StrengthRecord.exercise_name == exercise_name) \
                    .order_by(StrengthRecord.date.asc()).all()
            return [r.to_record_dict() for r in rows]

        rows = q.order_by(StrengthRecord.date.asc()).all()
        grouped: dict = {}
        for r in rows:
            grouped.setdefault(r.exercise_name, []).append(r.to_record_dict())
        return grouped


def delete_record(user_id: str, record_id: str) -> Tuple[bool, str]:
    """刪除指定 record_id。回傳 (成功?, 訊息)。"""
    with SessionLocal() as db:
        rec = db.query(StrengthRecord).filter(
            StrengthRecord.user_id == user_id,
            StrengthRecord.record_id == record_id,
        ).first()
        if not rec:
            return False, "Record not found"
        db.delete(rec)
        db.commit()
        return True, "Record deleted"


def update_record(user_id: str, record_id: str, updates: dict) -> Tuple[bool, Union[dict, str]]:
    """更新指定 record。回傳 (成功?, 更新後 record dict 或錯誤訊息)。"""
    with SessionLocal() as db:
        rec = db.query(StrengthRecord).filter(
            StrengthRecord.user_id == user_id,
            StrengthRecord.record_id == record_id,
        ).first()
        if not rec:
            return False, "Record not found"

        if "date" in updates:
            rec.date = updates["date"]
        if "training_weight" in updates:
            rec.training_weight = float(updates["training_weight"])
        if "pr_weight" in updates:
            rec.pr_weight = float(updates["pr_weight"])
        if "reps" in updates:
            rec.reps = int(updates["reps"])
        if "note" in updates:
            rec.note = updates["note"]

        db.commit()
        db.refresh(rec)
        return True, rec.to_record_dict()


def record_exists(record_id: str) -> bool:
    """供 migration 去重用。"""
    with SessionLocal() as db:
        return db.query(StrengthRecord).filter(
            StrengthRecord.record_id == record_id
        ).first() is not None


def insert_raw(user_id: str, exercise_name: str, record: dict) -> bool:
    """供 migration 直接寫入既有 JSON record（保留原 record_id）。已存在則略過。"""
    rid = record.get("record_id") or _new_record_id()
    if record_exists(rid):
        return False
    with SessionLocal() as db:
        db.add(StrengthRecord(
            record_id=rid,
            user_id=user_id,
            exercise_name=exercise_name,
            date=record.get("date", ""),
            training_weight=float(record.get("training_weight", 0) or 0),
            pr_weight=float(record.get("pr_weight", 0) or 0),
            reps=int(record.get("reps", 0) or 0),
            note=record.get("note", "") or "",
        ))
        db.commit()
        return True
