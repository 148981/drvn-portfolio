"""
rate_limit.py — 共用的 rate limiter（Phase 3 安全加固）
========================================================

用 slowapi 對敏感端點（登入 / 註冊）做每-IP 速率限制，擋暴力破解。
採「優雅降級」：若環境尚未安裝 slowapi，limiter 變成 no-op 裝飾器，
不會讓整個後端 import 失敗（auth 照常運作，只是暫無限流）。

安裝：pip install slowapi
"""
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    def _client_ip(request) -> str:
        """正式環境在 Railway 代理後面：直接連線的 IP 永遠是代理，
        所有使用者會共用同一個額度（10 人同時登入就全部被擋）。
        取 X-Forwarded-For 最右邊那個 —— 那是我們自己的代理加上去的，用戶端偽造不了。"""
        from config import settings
        if settings.IS_PRODUCTION:
            xff = request.headers.get("x-forwarded-for", "")
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                return parts[-1]
        return get_remote_address(request)

    limiter = Limiter(key_func=_client_ip)
    SLOWAPI_AVAILABLE = True

except ImportError:  # 尚未安裝 slowapi → 提供 no-op，避免 import 失敗
    from config import settings
    if settings.IS_PRODUCTION:
        raise RuntimeError('Production requires slowapi; refusing to start without rate limiting')
    SLOWAPI_AVAILABLE = False

    class _NoopLimiter:
        def limit(self, *args, **kwargs):
            def _decorator(func):
                return func
            return _decorator

    limiter = _NoopLimiter()
