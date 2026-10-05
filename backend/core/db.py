"""
core/db.py — 應用程式主資料庫 (App DB) 的 SQLAlchemy 基礎
=========================================================

Phase 2 持久層遷移的地基：把原本散落的 JSON 檔資料，逐領域搬進這個
統一的關聯式資料庫。Postgres-ready —— 預設 SQLite 單檔，設定環境變數
DATABASE_URL 即可無痛切換到 PostgreSQL（程式碼一行不用改）。

與既有的 core/database.py（users.db / 帳號驗證）刻意分開，避免動到已在
運作的 auth；未來要合併時，只要把兩邊的 DATABASE_URL 指到同一個 Postgres
即可。

用法（Repository 層）：
    from core.db import SessionLocal, init_db
    with SessionLocal() as db:
        ...

    # FastAPI Depends：
    from core.db import get_db
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from config import settings

# SQLite 在多執行緒（Uvicorn）下需要 check_same_thread=False
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,   # 連線失效時自動重連（Postgres 友善）
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def init_db() -> None:
    """建立所有已註冊的資料表（冪等，CREATE TABLE IF NOT EXISTS 語意）。

    Models 必須在呼叫前已被 import，才會註冊到 Base.metadata。
    """
    from core import models_training  # noqa: F401  觸發 model 註冊
    from core import models_social     # noqa: F401
    from core import models_health     # noqa: F401
    from core import models_misc       # noqa: F401  通用 user-blob
    from core import models_membership  # noqa: F401  會員訂閱狀態
    from core import models_moderation  # noqa: F401  社群檢舉／封鎖
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI Depends() 用的 Session 產生器。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
