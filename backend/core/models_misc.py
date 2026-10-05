"""
core/models_misc.py — 通用 user-blob 資料表
=============================================
給「以前只存在前端 localStorage、但希望換手機/重裝不遺失」的使用者資料用：
例如自訂訓練 Block（drvn_workout_blocks）、自訂計劃（drvn_custom_plans）。

設計：一張 key-value 表，(user_id, key) 唯一，payload 存任意 JSON。
offline-first —— 前端 localStorage 仍是主來源，這裡只當雲端備份/還原。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, JSON, UniqueConstraint, Index

from core.db import Base


class UserBlob(Base):
    __tablename__ = "user_blobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), index=True, nullable=False)
    key = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_userblob_user_key"),
        Index("ix_userblob_user_key", "user_id", "key"),
    )


class TelemetryEvent(Base):
    """觀測性事件（自建、無第三方依賴）。

    etype: 'event'（漏斗/行為）或 'error'（前端錯誤/當機）
    name : 事件名，如 app_open / onboarding_completed / workout_completed / js_error
    props: 任意附加欄位（頁面、錯誤訊息、堆疊前 500 字…）
    """
    __tablename__ = "telemetry_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), index=True, nullable=True)
    etype = Column(String(16), nullable=False, default="event")
    name = Column(String(64), nullable=False)
    props = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_telemetry_name_time", "name", "created_at"),
    )
