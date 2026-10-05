"""
core/models_social.py — 社群 / 遊戲化資料表 (SQLAlchemy Models)
================================================================

Phase 2：排行榜 (Leaderboard)。原本是記憶體內的全域 dict，重啟即清空；
改存 DB 後資料持久化。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, UniqueConstraint

from core.db import Base


class SonicLibrary(Base):
    """SonicFocus 音樂庫（每位使用者一筆，payload = {categories, playlists, updated_at}）。"""
    __tablename__ = "sonic_libraries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), unique=True, index=True, nullable=False)
    payload = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SocialCollection(Base):
    """社群共用清單（全域，非 per-user）。name 為集合名稱：
    activities / kudos / comments / friend_requests / friendships / blocks。
    items 整份存該集合的 list。

    註：沿用原本「整份 JSON list 讀寫」語意（與 social.json 一致），未來可再
    正規化成每列一筆以利擴展。
    """
    __tablename__ = "social_collections"

    name = Column(String(48), primary_key=True)
    items = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LeaderboardEntry(Base):
    """單一使用者在某榜別（run / strength）的最新分數。

    對應原 user_leaderboard_data[type][user_id] = {完整 record}。
    以 (type, user_id) 唯一，更新即 upsert。
    """
    __tablename__ = "leaderboard_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(16), index=True, nullable=False)      # "run" | "strength"
    user_id = Column(String(128), index=True, nullable=False)
    user_name = Column(String(128), default="")
    score = Column(Float, default=0.0)
    monthly_distance = Column(Float, default=0.0)
    monthly_volume = Column(Float, default=0.0)
    streak = Column(Integer, default=0)
    pr_count = Column(Integer, default=0)
    xp_tier = Column(String(32), default="初級")
    xp_level = Column(Integer, default=1)
    city = Column(String(64), default="台北")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("type", "user_id", name="uq_leaderboard_type_user"),
    )

    def to_dict(self) -> dict:
        """回傳與舊版相同的 record 形狀（前端排行榜直接使用）。"""
        return {
            "user_id": self.user_id,
            "user_name": self.user_name,
            "type": self.type,
            "score": self.score,
            "monthly_distance": self.monthly_distance,
            "monthly_volume": self.monthly_volume,
            "streak": self.streak,
            "pr_count": self.pr_count,
            "xp_tier": self.xp_tier,
            "xp_level": self.xp_level,
            "city": self.city,
        }


class PRRankEntry(Base):
    """每位使用者每一項個人紀錄（PR）的最佳值 —— 拿來算「你在 DRVN 使用者裡排第幾」。

    以 (record_id, user_id) 唯一；前端每次打開 PR 頁／點卡片時把自己的最佳值送上來 upsert。
    value 的單位跟著 record_id 走（秒、秒/公里、公里、公斤、次…），方向見 api_pr_rank.LOWER_BETTER。
    """
    __tablename__ = "pr_rank_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(String(48), index=True, nullable=False)
    user_id = Column(String(128), index=True, nullable=False)
    value = Column(Float, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("record_id", "user_id", name="uq_pr_rank_record_user"),
    )
