"""
core/models_membership.py — 會員訂閱狀態（每位使用者一筆）
=========================================================

會員身分的唯一真相源在後端。前端只負責顯示，不能自己決定誰是會員。

狀態（status）：
  none         從未訂閱（＝免費）
  trial        免費試用中
  active       訂閱有效
  grace        續訂扣款失敗，仍在寬限期內（照常使用會員功能）
  expired      已到期、取消後期滿或退款（＝免費）

來源（source）目前只有 app_store；寫入由購買驗證／Apple 伺服器通知負責。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, BigInteger

from core.db import Base


class UserMembership(Base):
    __tablename__ = "user_memberships"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), unique=True, index=True, nullable=False)
    status = Column(String(16), nullable=False, default="none")
    product_id = Column(String(128), nullable=True)            # 例：drvn.member.yearly
    original_transaction_id = Column(String(64), nullable=True, index=True)
    source = Column(String(32), nullable=True)                 # app_store
    expires_at = Column(DateTime, nullable=True)               # UTC
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppleMembershipVersion(Base):
    """Per-subscription signed event cursor; survives account transfers."""
    __tablename__ = "apple_membership_versions"
    original_transaction_id = Column(String(64), primary_key=True)
    signed_at_ms = Column(BigInteger, nullable=False)
    status = Column(String(16), nullable=False)


class MembershipSurvey(Base):
    """訂閱／退訂原因（一人可以答很多次；統計看 /api/membership/survey/dashboard）。"""
    __tablename__ = "membership_surveys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), index=True, nullable=False)
    kind = Column(String(16), index=True, nullable=False)       # subscribe | cancel
    reasons = Column(String(256), nullable=False)                # 逗號分隔的原因 id
    note = Column(Text, nullable=True)                           # 選填補充（≤300 字）
    product_id = Column(String(128), nullable=True)
    feature = Column(String(64), nullable=True)                  # 從哪個會員功能點進付費牆（訂閱問卷）
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
