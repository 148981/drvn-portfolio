"""
core/models_moderation.py — 社群內容檢舉與封鎖（App Store 審查指南 1.2 使用者產生內容）
==================================================================================
1.2 要求有使用者內容的 App 具備：過濾不當內容、檢舉、封鎖使用者、開發者聯絡方式，
並在 24 小時內處理檢舉。檢舉與封鎖存這裡；處理頁 /api/moderation/dashboard（ADMIN_KEY）。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from core.db import Base


class ContentReport(Base):
    __tablename__ = "content_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reporter_id = Column(String(128), index=True, nullable=False)
    target_type = Column(String(16), nullable=False)          # post | comment | user
    target_id = Column(String(128), index=True, nullable=False)
    target_user_id = Column(String(128), index=True, nullable=True)
    reason = Column(String(32), nullable=False)
    note = Column(Text, nullable=True)
    snapshot = Column(Text, nullable=True)                     # 檢舉當下的內文（被改掉也看得到）
    status = Column(String(16), nullable=False, default="open")  # open | removed | dismissed
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("user_id", "blocked_user_id", name="uq_user_block"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), index=True, nullable=False)
    blocked_user_id = Column(String(128), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
