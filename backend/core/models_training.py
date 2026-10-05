"""
core/models_training.py — 訓練相關資料表 (SQLAlchemy Models)
============================================================

Phase 2 第一個遷移領域：肌力訓練紀錄 (Strength Records)。
未來其他訓練資料（workout history、cardio sessions…）也加在這個檔。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, Index, JSON

from core.db import Base


class StrengthRecord(Base):
    """單筆肌力訓練紀錄。

    對應原 strength_history.json 結構：
        { user_id: { exercise_name: [ {record_id, date, training_weight, ...} ] } }
    這裡攤平成一張表，user_id / exercise_name 變成欄位 + 索引。
    """
    __tablename__ = "strength_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(String(64), unique=True, index=True, nullable=False)  # "strength_<ts>"
    user_id = Column(String(128), index=True, nullable=False)
    exercise_name = Column(String(128), index=True, nullable=False)
    date = Column(String(10), nullable=False)            # YYYY-MM-DD
    training_weight = Column(Float, default=0.0)
    pr_weight = Column(Float, default=0.0)
    reps = Column(Integer, default=0)
    note = Column(String(512), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    # 常用查詢：某使用者某動作、依日期排序
    __table_args__ = (
        Index("ix_strength_user_exercise", "user_id", "exercise_name"),
    )

    def to_record_dict(self) -> dict:
        """回傳與原 JSON 相同的 record 形狀（不含 user_id / exercise_name）。"""
        return {
            "record_id": self.record_id,
            "date": self.date,
            "training_weight": self.training_weight,
            "pr_weight": self.pr_weight,
            "reps": self.reps,
            "note": self.note or "",
        }


class WorkoutSession(Base):
    """一次完成的訓練 session（每位使用者多筆）。

    統一原本分裂的兩套儲存（全域 workout_history.json + 每使用者
    user_X_history.json）為一張表，per-user。整筆 session 內容存 JSON payload，
    另抽 session_id / user_id / timestamp 做索引與排序。
    """
    __tablename__ = "workout_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(96), unique=True, index=True, nullable=False)
    user_id = Column(String(128), index=True, nullable=False)
    timestamp = Column(String(40), index=True)   # ISO 字串，排序用
    session_type = Column(String(32))            # 例：strength / motion_analysis / routine
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_workout_user_ts", "user_id", "timestamp"),
    )

    def to_dict(self) -> dict:
        return dict(self.payload or {})


class CardioSession(Base):
    """一次有氧/跑步 session（每位使用者多筆）。

    原本存成每使用者一個 cardio_sessions_<id>.json（dict {session_id: session}）。
    這裡攤平成一張表，整筆內容存 JSON payload。
    """
    __tablename__ = "cardio_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(96), unique=True, index=True, nullable=False)
    user_id = Column(String(128), index=True, nullable=False)
    sort_key = Column(String(40))   # created_at / completed_at / timestamp，排序用
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_cardio_user_sort", "user_id", "sort_key"),
    )


class WorkoutPlan(Base):
    """使用者的訓練計劃（每位使用者一個有序清單；最後一筆視為 latest）。

    原本存成每使用者一個 user_<id>_plans.json（list）。這裡用 position 保留
    清單順序，整筆計劃存 JSON payload。
    """
    __tablename__ = "workout_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), index=True, nullable=False)
    plan_id = Column(String(96), index=True)
    position = Column(Integer, default=0)   # 清單順序（越大越新）
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_plan_user_pos", "user_id", "position"),
    )


class UserPR(Base):
    """使用者的個人最佳紀錄（PR）。每位使用者一筆，payload 為
    {exercise_id: {weight, reps, date, history:[...]}}（沿用原 {id}_prs.json 結構）。"""
    __tablename__ = "user_prs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), unique=True, index=True, nullable=False)
    payload = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
