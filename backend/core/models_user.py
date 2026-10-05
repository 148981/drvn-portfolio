"""
core/models_user.py — Users + Auth_Providers ORM Models

設計原則（依專案 SOP）：
  1. Users.password_hash 允許 Null         → 純第三方登入用戶不需密碼
  2. Auth_Providers 透過 user_id 關聯 Users → 一個 User 可綁定多種登入方式
  3. (provider, provider_uid) UNIQUE       → 避免同一個 LINE / Google 帳號被建兩次
  4. 第三方平台原始 ID 僅存於 Auth_Providers.provider_uid
     系統內部一律使用 Users.id (UUID)，不對外暴露 LINE / Google sub
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, ForeignKey, UniqueConstraint, DateTime, Index
)
from sqlalchemy.orm import relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    """系統內部唯一的使用者實體。

    - id            : 內部 UUID，JWT 簽署、API 互傳一律用這個
    - email         : Nullable  (純 OAuth 用戶可能沒給 email，例如 LINE 預設 scope)
    - password_hash : Nullable  (bcrypt；純第三方登入用戶為 None)
    - legacy_id     : 舊系統字串 ID（line_Uxxx / user_1765xxx），供遷移期間反查
    """
    __tablename__ = "users"

    id            = Column(String(36), primary_key=True, default=_uuid)
    email         = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)
    display_name  = Column(String(80),  nullable=True)
    avatar_url    = Column(String(512), nullable=True)

    # 遷移用 — 對應 user_profiles.json 裡的原 key
    legacy_id     = Column(String(80),  unique=True, nullable=True, index=True)

    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    providers     = relationship(
        "AuthProvider",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"


class AuthProvider(Base):
    """User 的登入方式，1 對多。

    一個 User 可同時擁有：
      - provider="google" provider_uid=<google sub>
      - provider="line"   provider_uid=<line userId>
      - provider="apple"  provider_uid=<apple sub>
      - provider="facebook" provider_uid=<facebook id>
    Email + 密碼登入不需要在這裡建 row (直接用 Users.email + password_hash)。
    """
    __tablename__ = "auth_providers"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    user_id           = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider          = Column(String(32),  nullable=False)   # "google" / "line" / "apple" / "facebook"
    provider_uid      = Column(String(255), nullable=False)   # 第三方原始 ID
    email_at_provider = Column(String(255), nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="providers")

    __table_args__ = (
        UniqueConstraint("provider", "provider_uid", name="uq_provider_uid"),
        Index("ix_auth_provider_lookup", "provider", "provider_uid"),
    )

    def __repr__(self) -> str:
        tail = (self.provider_uid or "")[:8]
        return f"<AuthProvider {self.provider}/{tail}... → user={self.user_id}>"


class AppleRefreshToken(Base):
    """「用 Apple 登入」換到的 refresh token —— 只為了刪除帳號時向 Apple 撤銷授權。

    App Store 審查指南 5.1.1(v)：提供 Apple 登入的 App，刪除帳號時必須呼叫
    Apple 的 /auth/revoke 撤銷 token（使用者的「使用 Apple 登入」清單裡才會消失）。
    一個帳號一列；刪除帳號時撤銷後一起刪掉。
    """
    __tablename__ = "apple_refresh_tokens"

    user_id       = Column(String(36), primary_key=True)
    refresh_token = Column(String(512), nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
