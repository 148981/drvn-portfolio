"""
identity_guard.py — 全域身分攔截（資安稽核 Step 2 / 修復 I-1、I-2）
====================================================================

【問題】
大量端點把 user_id / operator_id 當成一般的 query / Form / Body 欄位收下，
再拿它去查、改、刪資料。攻擊者把欄位換成別人的 ID，就成為那個人。

最危險的是「假檢查」——handler 裡寫了擁有者驗證，但比對的右邊來自攻擊者：

    async def delete_activity(activity_id: str, user_id: str):   # ← 來自 query string
        if activity.user_id != user_id:      # 左邊來自 DB，右邊來自攻擊者
            raise HTTPException(403, ...)    # 這行永遠不會觸發

程式碼讀起來是對的，所以 code review 很容易放過去。

【做法】
在所有 include_router() 完成後，掃過每一支 route，凡是 handler 簽章裡有
user_id / operator_id 的，就把 route.dependant.call 換成一層包裝，
在真正呼叫 handler 之前，用 JWT 的身分覆蓋掉那些參數。

只換 dependant.call、不動函式簽章 —— FastAPI 的參數解析、型別驗證、
OpenAPI 文件全部維持原樣，是風險最低的介入點。

副作用（好的那種）：上面那種「假檢查」會自動變成真檢查，
因為比對的右邊變成了 JWT 來源。

【模式】環境變數 IDENTITY_GUARD_MODE
    enforce  （預設）實際覆蓋參數；缺少 JWT 時回 401
    report   只記錄「如果 enforce 會發生什麼」，不改變行為。
             上線前先跑這個，把 log 裡出現的路徑檢查一遍
             （多半是前端 raw fetch() 忘了帶 Authorization）
    off      完全停用

【例外清單】
CROSS_USER_ROUTES  仍要求登入，但允許 user_id 不等於自己（社群互看別人的頁面）
PUBLIC_ROUTES      完全不需要登入
兩者都用 (HTTP method, FastAPI 路徑樣板) 指定：
    ("GET", "/api/activities/user/{user_id}")
"""
from __future__ import annotations

import functools
import inspect
import logging
import os
from contextvars import ContextVar
from typing import Any, Callable

from fastapi import HTTPException

logger = logging.getLogger("drvn.identity_guard")

# ─────────────────────────────────────────────────────────────────────
# 目前請求的 JWT 身分。由 main.py 的 inject_user_id middleware 設定。
# 用 ContextVar 而非 request.state，是為了讓包裝層不必改動 handler 簽章。
# ─────────────────────────────────────────────────────────────────────
CURRENT_USER_ID: ContextVar[str | None] = ContextVar("drvn_current_user_id", default=None)

# 會被覆蓋的參數名。DRVN 的命名慣例：user_id / operator_id = 我，
# target_id / friend_id / target_user_id = 對方（不可覆蓋）。
IDENTITY_PARAMS = ("user_id", "operator_id")

MODE = (os.getenv("IDENTITY_GUARD_MODE") or "enforce").strip().lower()
if MODE not in ("enforce", "report", "off"):
    MODE = "enforce"


# ─────────────────────────────────────────────────────────────────────
# 例外清單
# ─────────────────────────────────────────────────────────────────────

# 仍要求登入，但 user_id 可以是別人 —— 這些是「看別人的頁面」的社群功能。
CROSS_USER_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api/activities/user/{user_id}"),
    ("GET", "/api/achievements/user/{user_id}"),
    ("GET", "/api/achievements/{user_id}"),
    ("GET", "/api/social/friends/profile/{user_id}"),
    ("GET", "/api/social/friends/feed/{user_id}"),
    ("GET", "/api/social/friends/{user_id}/list"),
    ("GET", "/api/social/friends/{user_id}/followers/count"),
    ("GET", "/api/social/friends/graph/{user_id}"),
    ("GET", "/api/squads/user/{user_id}/memberships"),
}

# 完全不需要登入的路由。預設留空 —— 先用 IDENTITY_GUARD_MODE=report 跑過，
# 確認哪些畫面真的要給未登入者看，再往這裡加。
PUBLIC_ROUTES: set[tuple[str, str]] = set()


# ─────────────────────────────────────────────────────────────────────
# 核心
# ─────────────────────────────────────────────────────────────────────

def _apply(kwargs: dict[str, Any], targets: tuple[str, ...], label: str,
           allow_cross_user: bool, require_auth: bool) -> None:
    """在 handler 執行前，把身分參數改成 JWT 的身分。"""
    uid = CURRENT_USER_ID.get()

    if not uid:
        if not require_auth:
            return
        if MODE == "enforce":
            raise HTTPException(
                status_code=401,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        logger.warning("[identity-guard][report] %s 沒有 JWT — enforce 模式下會回 401", label)
        return

    if allow_cross_user:
        return

    for name in targets:
        if name not in kwargs:
            continue
        supplied = kwargs[name]
        if supplied == uid:
            continue
        if MODE == "enforce":
            if supplied not in (None, "", "undefined", "null"):
                logger.warning(
                    "[identity-guard] %s 的 %s=%r 與 JWT 身分 %r 不符，已覆蓋",
                    label, name, supplied, uid,
                )
            kwargs[name] = uid
        else:
            logger.warning(
                "[identity-guard][report] %s 的 %s=%r 會被覆蓋成 %r",
                label, name, supplied, uid,
            )


def _wrap(fn: Callable, targets: tuple[str, ...], label: str,
          allow_cross_user: bool, require_auth: bool) -> Callable:
    """
    包裝 handler。必須維持原本的 sync / async 型態 ——
    FastAPI 在建立 route 時就用 iscoroutinefunction(dependant.call) 決定
    要 await 還是丟去 threadpool，之後不會重新判斷。型態換掉會壞。
    """
    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any):
            _apply(kwargs, targets, label, allow_cross_user, require_auth)
            return await fn(*args, **kwargs)
        return async_wrapper

    @functools.wraps(fn)
    def sync_wrapper(*args: Any, **kwargs: Any):
        _apply(kwargs, targets, label, allow_cross_user, require_auth)
        return fn(*args, **kwargs)
    return sync_wrapper


def harden_identity(app) -> dict[str, int]:
    """
    在所有 include_router() 之後呼叫一次。
    回傳統計數字，方便在啟動 log 裡確認實際生效範圍。
    """
    from fastapi.routing import APIRoute

    stats = {"hardened": 0, "cross_user": 0, "public": 0, "untouched": 0}
    if MODE == "off":
        logger.warning("[identity-guard] MODE=off — 全域身分攔截已停用")
        return stats

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        dependant = getattr(route, "dependant", None)
        endpoint = getattr(dependant, "call", None)
        if endpoint is None:
            continue

        try:
            params = inspect.signature(endpoint).parameters
        except (TypeError, ValueError):
            continue

        path = route.path_format
        targets = tuple(
            p for p in IDENTITY_PARAMS
            if p in params or ("{" + p + "}") in path
        )
        if not targets:
            stats["untouched"] += 1
            continue

        methods = sorted(route.methods - {"HEAD", "OPTIONS"}) or ["GET"]
        keys = {(m, path) for m in methods}

        is_public = bool(keys & PUBLIC_ROUTES)
        is_cross = bool(keys & CROSS_USER_ROUTES)

        label = f"{methods[0]} {path}"
        route.dependant.call = _wrap(
            endpoint, targets, label,
            allow_cross_user=is_cross,
            require_auth=not is_public,
        )

        if is_public:
            stats["public"] += 1
        elif is_cross:
            stats["cross_user"] += 1
        else:
            stats["hardened"] += 1

    logger.warning(
        "[identity-guard] MODE=%s — 強制本人 %d 支 / 允許互看 %d 支 / 公開 %d 支",
        MODE, stats["hardened"], stats["cross_user"], stats["public"],
    )
    return stats


# ─────────────────────────────────────────────────────────────────────
# 附帶修復：main.py 的 ^/api/user/(?P<uid>[^/]+)$ 會誤中 /api/user/profile
# 這類「動作型」單層路徑，把 "profile" 當成 user_id 比對 → 一律 403。
# 這裡從 app 自己的路由表推導保留字，之後新增端點也不會再踩到。
# ─────────────────────────────────────────────────────────────────────
def reserved_user_segments(app, prefix: str = "/api/user/") -> list[str]:
    """回傳 /api/user/ 底下所有「字面量」的第一段（profile、goals、initialize…）。"""
    from fastapi.routing import APIRoute

    segments: set[str] = set()
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        path = route.path_format
        if not path.startswith(prefix):
            continue
        seg = path[len(prefix):].split("/", 1)[0]
        if seg and not seg.startswith("{"):
            segments.add(seg)
    return sorted(segments)
