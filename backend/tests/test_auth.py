"""
JWT 簽發 / 驗證 round-trip 測試。
驗證 token 能正確簽出、解回相同 user_id，且竄改後會被拒絕。
"""
import pytest

jwt_mod = pytest.importorskip("jose")  # 確保 python-jose 已安裝，否則跳過


def test_sign_and_verify_roundtrip():
    import api_auth

    token = api_auth.sign_token("user-123", email="a@b.com", name="Mia")
    decoded = api_auth.verify_token(token)
    assert decoded["id"] == "user-123"
    assert decoded["email"] == "a@b.com"


def test_tampered_token_rejected():
    import api_auth
    from fastapi import HTTPException

    token = api_auth.sign_token("user-123")
    tampered = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    with pytest.raises(HTTPException) as exc:
        api_auth.verify_token(tampered)
    assert exc.value.status_code == 401
