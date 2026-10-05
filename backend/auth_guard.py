"""
auth_guard.py — 存取控制小工具（Phase 3）
==========================================

解決 IDOR（Broken Access Control，OWASP A01）：很多端點直接吃 path/body 的
user_id，沒檢查「這個 user_id 是不是登入本人」，導致已登入者改一下 user_id
就能讀/改別人的資料。

但本 app 同時有「訪客（無 JWT）」流程，不能一律強制要 JWT。所以這個 guard
採折衷：

    若請求帶了有效 JWT，且 JWT 的 user_id ≠ 目標 user_id → 403 拒絕。
    若沒帶 JWT（訪客）→ 401。私人資料不提供匿名存取。

這樣能保護「已登入使用者」不被冒用，又不破壞訪客流程。

用法（在 handler 內，需有 request: Request 參數）：
    from auth_guard import enforce_owner

    @router.get("/api/workout/history/{user_id}")
    async def get_history(user_id: str, request: Request):
        enforce_owner(request, user_id)
        ...
"""
from fastapi import Request, HTTPException


def enforce_owner(request: Request, user_id: str) -> None:
    """私人資料必須提供已驗證身分，並與目標帳號相符。"""
    jwt_uid = getattr(request.state, "user_id", None)
    if not isinstance(jwt_uid, str) or not jwt_uid.strip():
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    if not isinstance(user_id, str) or not user_id.strip():
        raise HTTPException(status_code=422, detail="A valid user_id is required")
    if jwt_uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: you can only access your own data")


def current_user_id(request: Request):
    """回傳目前請求的 JWT user_id（沒有則 None）。"""
    return getattr(request.state, "user_id", None)


def owner_guard(user_id: str, request: Request) -> None:
    """FastAPI 依賴版的 enforce_owner，掛在路由的 dependencies 即可，
    不必改動 handler 本體：

        from fastapi import Depends
        from auth_guard import owner_guard

        @router.get("/api/.../{user_id}", dependencies=[Depends(owner_guard)])
        async def handler(user_id: str, ...):
            ...
    """
    enforce_owner(request, user_id)
