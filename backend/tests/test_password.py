"""
密碼雜湊測試：新密碼用 Argon2id、且向後相容既有 bcrypt 雜湊。
"""
import os
os.environ.setdefault("APP_ENV", "development")

import bcrypt

from core import user_service as us


def test_hash_and_verify():
    h = us.hash_password("Secret123!")
    assert us.verify_password("Secret123!", h) is True
    assert us.verify_password("wrong", h) is False


def test_argon2_used_when_available():
    if not us._USE_PASSLIB:
        import pytest
        pytest.skip("環境未裝 argon2，退回 bcrypt（仍安全）")
    assert us.hash_password("x").startswith("$argon2")


def test_backward_compatible_with_legacy_bcrypt():
    legacy = bcrypt.hashpw(b"OldPass1", bcrypt.gensalt(12)).decode()
    assert us.verify_password("OldPass1", legacy) is True
    assert us.verify_password("bad", legacy) is False


def test_empty_inputs():
    assert us.verify_password("", "x") is False
    assert us.verify_password("x", None) is False
