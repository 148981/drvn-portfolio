"""
core/models_health.py — 身體組成 / 健康資料表 (SQLAlchemy Models)
=================================================================

Phase 2：InBody 體組成量測紀錄。欄位多達 ~18 項且未來可能增減，因此整筆
record 存成 JSON payload 欄位（彈性），另把查詢/排序要用的 record_id、
user_id、measurement_date、created_at 抽成索引欄位。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, JSON

from core.db import Base


class InBodyRecord(Base):
    __tablename__ = "inbody_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(String(96), unique=True, index=True, nullable=False)  # inbody_<user>_<ts>
    user_id = Column(String(128), index=True, nullable=False)
    measurement_date = Column(String(32), index=True)   # 排序主鍵
    created_at = Column(String(40))                     # ISO 字串，排序次鍵
    payload = Column(JSON, nullable=False)              # 完整 record dict
    row_created_at = Column(DateTime, default=datetime.utcnow)

    def to_record_dict(self) -> dict:
        """回傳完整 record dict（與舊 JSON 一致）。"""
        return dict(self.payload or {})


class UserProfile(Base):
    """使用者個人檔案（每位使用者一筆，user_id 唯一）。

    原本存在單一 user_profiles.json（{user_id: profile}）。欄位很多且會增減，
    整筆存 JSON payload。
    """
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), unique=True, index=True, nullable=False)
    payload = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

