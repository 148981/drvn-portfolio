"""
core/database.py — SQLAlchemy 連線基礎 (Users + Auth_Providers)

統一管理 backend/data/users.db 的 engine、SessionLocal、Base、get_db()。

依專案 SOP 設計原則：
  - 帳號資料與訓練資料的 DB 檔案分開 (users.db vs nutrition.db)
  - 所有 Session 透過 get_db() 的 generator 取得，FastAPI Depends() 友善
  - init_db() 冪等，可重複呼叫 (CREATE TABLE IF NOT EXISTS 語意)
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# backend/ 根目錄；DATA_DIR = backend/data
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "users.db")
# 透過 config 的正規化，把 Railway 給的 postgresql:// 轉成 postgresql+psycopg://，
# 避免 SQLAlchemy 預設找 psycopg2（未安裝）而崩潰。
from config import _normalize_db_url  # noqa: E402
DATABASE_URL = _normalize_db_url(os.getenv("USERS_DB_URL", f"sqlite:///{DB_PATH}"))

# SQLite 在 FastAPI / Uvicorn 多執行緒下需要 check_same_thread=False
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def init_db() -> None:
    """建立所有已註冊的資料表 (冪等)。

    Models 必須在呼叫前已被 import (Python module 載入時即註冊到 Base.metadata)。
    """
    # 觸發 models 註冊
    from . import models_user  # noqa: F401
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI Depends() 用的 Session 產生器。

    用法：
        from fastapi import Depends
        from core.database import get_db
        from sqlalchemy.orm import Session

        @router.get("/me")
        def me(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
