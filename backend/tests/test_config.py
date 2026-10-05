"""
config.py 的單元測試 — 輕量、不載入 ML 套件，跑得快。
重點驗證「production 機密 fail-fast」這條安全規則確實生效。
"""
import importlib
import os

import pytest


def _fresh_settings(monkeypatch, **env):
    """用指定環境變數重新載入 config，回傳新的 Settings()。"""
    for k, v in env.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, v)
    import config as config_module
    importlib.reload(config_module)
    return config_module


def test_development_defaults_ok(monkeypatch):
    cfg = _fresh_settings(
        monkeypatch,
        APP_ENV="development",
        JWT_SECRET=None,
        SESSION_SECRET=None,
        CORS_ALLOW_ORIGINS=None,
    )
    # development 即使用預設值也能啟動（只警告，不報錯）
    assert cfg.settings.APP_ENV == "development"
    assert cfg.settings.IS_PRODUCTION is False


def test_production_rejects_default_secret(monkeypatch):
    # production + 預設弱機密 → 必須 fail-fast
    with pytest.raises(RuntimeError):
        _fresh_settings(
            monkeypatch,
            APP_ENV="production",
            JWT_SECRET="change_this_secret_in_production_min32chars",
            SESSION_SECRET="fitness_app_dev_session_key_32chars!!",
            CORS_ALLOW_ORIGINS="https://app.drvn.com",
        )


def test_production_with_strong_secrets_ok(monkeypatch):
    cfg = _fresh_settings(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a" * 40,
        SESSION_SECRET="b" * 40,
        CORS_ALLOW_ORIGINS="https://app.drvn.com,https://drvn.com",
    )
    assert cfg.settings.IS_PRODUCTION is True
    assert cfg.settings.CORS_ALLOW_ORIGINS == ["https://app.drvn.com", "https://drvn.com"]


def test_production_requires_cors_allowlist(monkeypatch):
    with pytest.raises(RuntimeError):
        _fresh_settings(
            monkeypatch,
            APP_ENV="production",
            JWT_SECRET="a" * 40,
            SESSION_SECRET="b" * 40,
            CORS_ALLOW_ORIGINS="",
        )


def test_database_url_defaults_to_sqlite(monkeypatch):
    cfg = _fresh_settings(monkeypatch, APP_ENV="development", DATABASE_URL=None)
    assert cfg.settings.DATABASE_URL.startswith("sqlite:///")
