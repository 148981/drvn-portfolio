"""enforce_owner 存取控制測試（不需 DB / app）。"""
import types

import pytest
from fastapi import HTTPException

from auth_guard import enforce_owner, current_user_id


def _req(jwt_uid):
    r = types.SimpleNamespace()
    r.state = types.SimpleNamespace(user_id=jwt_uid)
    return r


def test_removing_token_cannot_bypass_owner_check():
    with pytest.raises(HTTPException) as exc:
        enforce_owner(_req(None), "anybody")
    assert exc.value.status_code == 401
    assert current_user_id(_req(None)) is None


def test_owner_allowed():
    enforce_owner(_req("u1"), "u1")  # 本人 → 放行


def test_other_user_forbidden():
    with pytest.raises(HTTPException) as exc:
        enforce_owner(_req("u1"), "u2")  # 帶 JWT 但存取別人 → 403
    assert exc.value.status_code == 403
