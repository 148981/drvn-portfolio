# ================================================================
# api_auth.py — OAuth + Email/密碼 登入系統 (FastAPI + Authlib + SQLAlchemy)
# 支援: Google · Apple · Facebook · LINE · Email/密碼
# ================================================================
# 安裝依賴:
# pip install authlib httpx python-jose[cryptography] python-dotenv sqlalchemy bcrypt
# ================================================================
#
# 架構（依專案 SOP）：
#   Users          (id=UUID PK, email Unique Nullable, password_hash Nullable, ...)
#   Auth_Providers (provider, provider_uid) UNIQUE, user_id → Users.id
#
#   JWT 永遠裝 Users.id (UUID)，第三方原始 ID 只存資料庫，不對外傳遞。

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Depends, Header, Body
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from jose import jwt, JWTError
from authlib.integrations.starlette_client import OAuth
from authlib.integrations.base_client.errors import OAuthError, MismatchingStateError
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from core.database import init_db, get_db
from core import user_service

load_dotenv()

# 啟動時建立 users.db 表 (冪等)
init_db()

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Rate limiter（Phase 3）：登入/註冊限流，擋暴力破解 ──
from rate_limit import limiter

# ── JWT Config（集中由 config.settings 提供；production 機密會 fail-fast）──
from config import settings
JWT_SECRET   = settings.JWT_SECRET
JWT_ALGO     = settings.JWT_ALGORITHM
JWT_EXPIRE   = settings.JWT_EXPIRE_DAYS  # days
CLIENT_URL   = settings.CLIENT_URL
API_BASE_URL = settings.API_BASE_URL


def sign_token(user_id: str, email: str = None, name: str = None, avatar: str = None) -> str:
    """JWT 永遠用 Users.id (UUID) 當作 id claim。"""
    payload = {
        "id":     user_id,
        "email":  email,
        "name":   name,
        "avatar": avatar,
        "exp":    datetime.utcnow() + timedelta(days=JWT_EXPIRE),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError as e:
        print(f"JWT Verification Failed: {e}, Token: {token[:15]}...")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── OAuth Setup (Authlib) ─────────────────────────────────────────
oauth = OAuth()

if os.getenv("GOOGLE_CLIENT_ID"):
    oauth.register(
        name="google",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

if os.getenv("FACEBOOK_APP_ID"):
    oauth.register(
        name="facebook",
        client_id=os.getenv("FACEBOOK_APP_ID"),
        client_secret=os.getenv("FACEBOOK_APP_SECRET"),
        access_token_url="https://graph.facebook.com/oauth/access_token",
        authorize_url="https://www.facebook.com/dialog/oauth",
        api_base_url="https://graph.facebook.com/",
        # 只請求 public_profile：email 權限需通過 Facebook App Review 才有效，
        # 未核可前把 email 放進 scope 會被擋下「Invalid Scopes: email」。
        # email 為 nullable，拿不到也不影響登入（user_service 允許 email=None）。
        client_kwargs={"scope": "public_profile"},
    )

if os.getenv("LINE_CHANNEL_ID"):
    oauth.register(
        name="line",
        client_id=os.getenv("LINE_CHANNEL_ID"),
        client_secret=os.getenv("LINE_CHANNEL_SECRET"),
        access_token_url="https://api.line.me/oauth2/v2.1/token",
        authorize_url="https://access.line.me/oauth2/v2.1/authorize",
        api_base_url="https://api.line.me/v2/",
        client_kwargs={"scope": "profile"},  # 不加 openid，避免解 id_token
    )


# ── User Persistence Bridge ───────────────────────────────────────
def _persist_oauth_user(
    db: Session, provider: str, provider_id: str,
    email: Optional[str], name: Optional[str], avatar: Optional[str] = None,
) -> dict:
    """OAuth callback 共用入口 — 寫進 users.db 後回傳對外的 dict。

    對外的 id 是 Users.id (UUID)，符合 SOP #3：第三方原始 ID 不外洩。
    """
    if not provider_id:
        raise HTTPException(status_code=400, detail=f"{provider} 未提供使用者 ID")
    user = user_service.find_or_create_oauth_user(
        db=db,
        provider=provider,
        provider_uid=provider_id,
        email=email,
        name=name,
        avatar=avatar,
    )
    return user_service.user_to_public_dict(user)


# ── Redirect Helper ───────────────────────────────────────────────
def _web_redirect_url(frontend_url: str, route: str, **params) -> str:
    """組出「HashRouter 相容」的前端網址：{base}/?<query>#/<route>

    ⚠️ 前端 App 使用 HashRouter，而且 App.jsx 內有一個「網址清洗器」：
       只要 window.location.pathname 不是 '/'，就會 location.replace('/' + hash)
       —— 這會把 ?token=... 這種 query 整段丟掉。

    因此 OAuth 回呼「絕對不能」導向 pathname 形式的 /auth-callback?token=...，
    必須讓：
       • token / error 放在 ? query  → window.location.search（AuthCallbackPage 讀得到）
       • pathname 維持 '/'           → 不會觸發網址清洗器
       • 路由放在 #/auth-callback    → HashRouter 正確進入 AuthCallbackPage
    """
    base = _safe_frontend_url(frontend_url)   # 只導回白名單網域（見 _safe_frontend_url）
    query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None and v != "")
    return f"{base}/?{query}#/{route}"


def make_callback_redirect(user: dict, native: bool = False, frontend_url: str = "") -> RedirectResponse:
    token = sign_token(
        user_id=user["id"],
        email=user.get("email"),
        name=user.get("name"),
        avatar=user.get("avatar"),
    )
    user_id = user["id"]

    if native:
        # 原生 App：交給 iOS ASWebAuthenticationSession 攔截 fitnessapp:// scheme
        url = f"fitnessapp://auth-callback?token={token}&user_id={user_id}"
    else:
        # 瀏覽器 / WebView：HashRouter 相容網址
        url = _web_redirect_url(frontend_url, "auth-callback", token=token, user_id=user_id)

    print(f"[Auth] OK login → user_id={user_id}, native={native}, redirect → {url[:70]}...")
    return RedirectResponse(url)


def make_error_redirect(error: str, native: bool = False, frontend_url: str = "") -> RedirectResponse:
    """OAuth 失敗時的導向 —— 一律走 AuthCallbackPage，讓前端能顯示錯誤並退回登入頁。"""
    if native:
        url = f"fitnessapp://auth-callback?error={error}"
    else:
        url = _web_redirect_url(frontend_url, "auth-callback", error=error)
    print(f"[Auth] login FAILED → error={error}, native={native}, redirect → {url[:70]}...")
    return RedirectResponse(url)


# ================================================================
# ROUTES
# ================================================================

# ── 前端網址白名單 ────────────────────────────────────────────────
# 🔴 frontend_url 來自網址參數，登入成功後 token 會被帶到 {frontend_url}/?token=...
#    以前照單全收 —— 攻擊者寄一個 /api/auth/google?frontend_url=https://壞人.com，
#    受害者登入後 token 直接送到壞人手上（帳號被接管）。
#    現在只收 CLIENT_URL、CORS 白名單；開發模式另外允許本機與區網。
import re as _re_url
_DEV_FRONTEND_RE = _re_url.compile(
    r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$")


def _safe_frontend_url(url: Optional[str]) -> str:
    u = (url or "").strip().rstrip("/")
    if not u:
        return CLIENT_URL
    allowed = {CLIENT_URL.rstrip("/")} | {o.rstrip("/") for o in settings.CORS_ALLOW_ORIGINS
                                         if o.startswith(("http://", "https://"))}
    if u in allowed:
        return u
    if not settings.IS_PRODUCTION and _DEV_FRONTEND_RE.match(u):
        return u
    print(f"[Auth] 拒絕不在白名單的 frontend_url：{u[:80]}")
    return CLIENT_URL


# ── 工具：把 native flag 和 frontend_url 存進 session ──────────────
def _set_oauth_meta(request: Request, native: bool, frontend_url: str = ""):
    request.session["oauth_native"] = native
    if frontend_url:
        request.session["oauth_frontend_url"] = _safe_frontend_url(frontend_url)


def _get_oauth_meta(request: Request) -> tuple[bool, str]:
    native = request.session.pop("oauth_native", False)
    frontend_url = _safe_frontend_url(request.session.pop("oauth_frontend_url", CLIENT_URL))
    return native, frontend_url


# ── Redirect URI（Google / Facebook / LINE 共用）──────────────────
def _oauth_redirect_uri(request: Request, provider: str) -> str:
    """回呼網址必須和各家後台登記的一字不差。
    Railway 前面有一層代理，uvicorn 看到的 request.base_url 是 http://，
    但後台只收 https:// —— 正式環境（或代理說是 https）一律改成 https。"""
    base = str(request.base_url).rstrip("/")
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if base.startswith("http://") and (proto == "https" or settings.IS_PRODUCTION):
        base = "https://" + base[len("http://"):]
    return f"{base}/api/auth/{provider}/callback"


# ── Google ────────────────────────────────────────────────────────
@router.get("/google")
async def google_login(request: Request, native: bool = False, frontend_url: str = ""):
    _set_oauth_meta(request, native, frontend_url)
    redirect_uri = _oauth_redirect_uri(request, "google")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    is_native, frontend_url = _get_oauth_meta(request)
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo") or {}
        user = _persist_oauth_user(
            db,
            provider="google",
            provider_id=user_info.get("sub", ""),
            email=user_info.get("email"),
            name=user_info.get("name"),
            avatar=user_info.get("picture"),
        )
        return make_callback_redirect(user, native=is_native, frontend_url=frontend_url)
    except (MismatchingStateError, OAuthError) as e:
        print(f"Google OAuth Error: {e}")
        return make_error_redirect("oauth_mismatch_state", native=is_native, frontend_url=frontend_url)


# ── Facebook ──────────────────────────────────────────────────────
@router.get("/facebook")
async def facebook_login(request: Request, native: bool = False, frontend_url: str = ""):
    _set_oauth_meta(request, native, frontend_url)
    redirect_uri = _oauth_redirect_uri(request, "facebook")
    return await oauth.facebook.authorize_redirect(request, redirect_uri)


@router.get("/facebook/callback", name="facebook_callback")
async def facebook_callback(request: Request, db: Session = Depends(get_db)):
    is_native, frontend_url = _get_oauth_meta(request)
    try:
        token = await oauth.facebook.authorize_access_token(request)
        resp = await oauth.facebook.get("me?fields=id,name,email,picture", token=token)
        profile = resp.json()
        user = _persist_oauth_user(
            db,
            provider="facebook",
            provider_id=profile.get("id", ""),
            email=profile.get("email"),
            name=profile.get("name"),
            avatar=profile.get("picture", {}).get("data", {}).get("url"),
        )
        return make_callback_redirect(user, native=is_native, frontend_url=frontend_url)
    except (MismatchingStateError, OAuthError) as e:
        print(f"Facebook OAuth Error: {e}")
        return make_error_redirect("oauth_mismatch_state", native=is_native, frontend_url=frontend_url)


# ── LINE ──────────────────────────────────────────────────────────
@router.get("/line")
async def line_login(request: Request, native: bool = False, frontend_url: str = "", switch: bool = False):
    _set_oauth_meta(request, native, frontend_url)
    redirect_uri = _oauth_redirect_uri(request, "line")
    extra_params = {}
    if switch:
        extra_params["bot_prompt"] = "aggressive"
        extra_params["prompt"] = "consent"
    return await oauth.line.authorize_redirect(request, redirect_uri, **extra_params)


@router.get("/line/callback", name="line_callback")
async def line_callback(request: Request, db: Session = Depends(get_db)):
    is_native, frontend_url = _get_oauth_meta(request)
    try:
        token = await oauth.line.authorize_access_token(request)
        resp = await oauth.line.get("profile", token=token)
        profile = resp.json()
        user = _persist_oauth_user(
            db,
            provider="line",
            provider_id=profile.get("userId", ""),
            email=None,  # LINE 預設 scope 不含 email
            name=profile.get("displayName"),
            avatar=profile.get("pictureUrl"),
        )
        return make_callback_redirect(user, native=is_native, frontend_url=frontend_url)
    except (MismatchingStateError, OAuthError) as e:
        print(f"LINE OAuth Error: {e}")
        return make_error_redirect("oauth_mismatch_state", native=is_native, frontend_url=frontend_url)


# ── Apple (Sign in with Apple) ────────────────────────────────────
# ⚠️ 這支不是選配。App Store 審查指南 4.8：只要 App 提供 Google / Facebook / LINE
#    這類第三方登入，就「必須」同時提供 Sign in with Apple。少一個就會被退件。
#
# 和其他 provider 的三個關鍵差異：
#   1. client_secret 不是固定字串，是用 .p8 私鑰「現簽」的 ES256 JWT（最長 6 個月）。
#   2. 要拿到姓名/Email 就必須 response_mode=form_post —— Apple 用「跨站 POST」
#      打回來，SameSite=Lax 的 session cookie 不會被帶上。所以 native 與
#      frontend_url 一律編進 state（我們自己簽的 JWT），完全不依賴 session。
#   3. 姓名只在「使用者第一次授權」那一次出現在 user 欄位，之後永遠拿不到，
#      所以第一次就要存起來。
APPLE_ISSUER     = "https://appleid.apple.com"
APPLE_AUTH_URL   = f"{APPLE_ISSUER}/auth/authorize"
APPLE_TOKEN_URL  = f"{APPLE_ISSUER}/auth/token"
APPLE_KEYS_URL   = f"{APPLE_ISSUER}/auth/keys"

APPLE_TEAM_ID     = os.getenv("APPLE_TEAM_ID", "").strip()
APPLE_SERVICES_ID = os.getenv("APPLE_SERVICES_ID", "").strip()   # Services ID = client_id
APPLE_KEY_ID      = os.getenv("APPLE_KEY_ID", "").strip()
APPLE_PRIVATE_KEY = (os.getenv("APPLE_PRIVATE_KEY", "") or "").replace("\\n", "\n").strip()
if not APPLE_PRIVATE_KEY:
    _apple_key_path = os.getenv("APPLE_PRIVATE_KEY_PATH", "").strip()
    if _apple_key_path and os.path.exists(_apple_key_path):
        with open(_apple_key_path, "r", encoding="utf-8") as _f:
            APPLE_PRIVATE_KEY = _f.read().strip()


def _apple_configured() -> bool:
    return all([APPLE_TEAM_ID, APPLE_SERVICES_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY])


@router.get("/providers")
async def auth_providers():
    """哪些第三方登入在伺服器上設好了（登入頁只顯示設好的按鈕，按了才不會跳「還沒開通」）。"""
    return {
        "line": bool(os.getenv("LINE_CHANNEL_ID")),
        "google": bool(os.getenv("GOOGLE_CLIENT_ID")),
        "facebook": bool(os.getenv("FACEBOOK_APP_ID")),
        "apple": _apple_configured(),
    }


def _apple_redirect_uri() -> str:
    """必須和 Apple Developer 後台 Services ID 裡登記的 Return URL 一字不差。"""
    return f"{API_BASE_URL.rstrip('/')}/api/auth/apple/callback"


def _apple_client_secret() -> str:
    now = datetime.utcnow()
    return jwt.encode(
        {
            "iss": APPLE_TEAM_ID,
            "iat": now,
            "exp": now + timedelta(minutes=10),
            "aud": APPLE_ISSUER,
            "sub": APPLE_SERVICES_ID,
        },
        APPLE_PRIVATE_KEY,
        algorithm="ES256",
        headers={"kid": APPLE_KEY_ID},
    )


def _apple_pack_state(native: bool, frontend_url: str) -> str:
    """把 native / frontend_url 簽進 state —— Apple 會原封不動送回來。"""
    return jwt.encode(
        {"n": bool(native), "f": frontend_url or "", "exp": datetime.utcnow() + timedelta(minutes=15)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


def _apple_read_state(state: str) -> tuple[bool, str]:
    """state 是我們自己簽的；驗不過就當成瀏覽器流程走預設前端網址。"""
    try:
        claims = jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGO])
        return bool(claims.get("n")), _safe_frontend_url(claims.get("f"))
    except JWTError:
        return False, CLIENT_URL


def _apple_name_from_form(form) -> Optional[str]:
    """姓名只有第一次授權會出現，格式是 JSON 字串。"""
    raw = form.get("user")
    if not raw:
        return None
    try:
        import json as _json
        n = (_json.loads(raw) or {}).get("name") or {}
        full = " ".join(x for x in (n.get("firstName"), n.get("lastName")) if x).strip()
        return full or None
    except Exception:
        return None


async def _apple_exchange_code(code: str) -> dict:
    """拿 code 換 id_token，並用 Apple 的公鑰驗章（不驗就等於誰都能偽造登入）。
    回傳 id_token 的 claims；refresh_token 放在 claims["_refresh_token"]（刪除帳號時撤銷用）。"""
    import httpx
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            APPLE_TOKEN_URL,
            data={
                "grant_type":    "authorization_code",
                "code":          code,
                "redirect_uri":  _apple_redirect_uri(),
                "client_id":     APPLE_SERVICES_ID,
                "client_secret": _apple_client_secret(),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        res.raise_for_status()
        token_json = res.json() or {}
        id_token = token_json.get("id_token")
        if not id_token:
            raise ValueError("Apple 沒有回傳 id_token")
        jwks = (await client.get(APPLE_KEYS_URL)).json()

    kid = jwt.get_unverified_header(id_token).get("kid")
    key = next((k for k in (jwks.get("keys") or []) if k.get("kid") == kid), None)
    if not key:
        raise ValueError("找不到對應的 Apple 公鑰")
    claims = jwt.decode(
        id_token, key, algorithms=["RS256"],
        audience=APPLE_SERVICES_ID, issuer=APPLE_ISSUER,
    )
    claims["_refresh_token"] = token_json.get("refresh_token")
    return claims


def _save_apple_refresh_token(db: Session, user_id: str, refresh_token: Optional[str]) -> None:
    if not user_id or not refresh_token:
        return
    try:
        from core.models_user import AppleRefreshToken
        db.merge(AppleRefreshToken(user_id=user_id, refresh_token=refresh_token))
        db.commit()
    except Exception as e:   # 存不進去不影響登入；只是刪帳號時撤銷不到
        db.rollback()
        print(f"[apple] refresh token 儲存失敗: {e}")


def revoke_apple_for_user(user_id: str) -> str:
    """刪除帳號時呼叫：向 Apple 撤銷這個帳號的「用 Apple 登入」授權，並刪掉本地 token。
    回傳 revoked / no_token / not_configured / failed（非致命，不擋刪除）。"""
    from core.database import SessionLocal as _UsersSession
    from core.models_user import AppleRefreshToken
    with _UsersSession() as db:
        row = db.get(AppleRefreshToken, user_id)
        if row is None:
            return "no_token"
        token = row.refresh_token
        db.delete(row)
        db.commit()
    if not _apple_configured():
        return "not_configured"
    try:
        import httpx
        res = httpx.post(
            f"{APPLE_ISSUER}/auth/revoke",
            data={
                "client_id": APPLE_SERVICES_ID,
                "client_secret": _apple_client_secret(),
                "token": token,
                "token_type_hint": "refresh_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        return "revoked" if res.status_code == 200 else f"failed:{res.status_code}"
    except Exception as e:
        print(f"[apple] revoke 失敗: {e}")
        return "failed"


@router.get("/apple")
async def apple_login(request: Request, native: bool = False, frontend_url: str = ""):
    if not _apple_configured():
        # 沒設好金鑰就別把人丟進 Apple 的頁面 —— 直接誠實回報，前端會顯示錯誤。
        return make_error_redirect("apple_not_configured", native=native, frontend_url=frontend_url)
    from urllib.parse import urlencode
    params = {
        "response_type": "code",
        "response_mode": "form_post",
        "client_id":     APPLE_SERVICES_ID,
        "redirect_uri":  _apple_redirect_uri(),
        "scope":         "name email",
        "state":         _apple_pack_state(native, frontend_url),
    }
    return RedirectResponse(f"{APPLE_AUTH_URL}?{urlencode(params)}")


@router.post("/apple/callback", name="apple_callback")
async def apple_callback(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    is_native, frontend_url = _apple_read_state(form.get("state") or "")

    err = form.get("error")
    if err:
        # user_cancelled_authorize = 使用者自己按了取消，不是故障
        code_zh = "apple_cancelled" if err == "user_cancelled_authorize" else "apple_error"
        return make_error_redirect(code_zh, native=is_native, frontend_url=frontend_url)

    code = form.get("code")
    if not code:
        return make_error_redirect("apple_no_code", native=is_native, frontend_url=frontend_url)

    try:
        claims = await _apple_exchange_code(code)
    except Exception as e:
        print(f"Apple OAuth Error: {e}")
        return make_error_redirect("apple_exchange_failed", native=is_native, frontend_url=frontend_url)

    user = _persist_oauth_user(
        db,
        provider="apple",
        provider_id=claims.get("sub", ""),
        email=claims.get("email"),
        name=_apple_name_from_form(form),
        avatar=None,
    )
    _save_apple_refresh_token(db, (user or {}).get("id"), claims.get("_refresh_token"))
    return make_callback_redirect(user, native=is_native, frontend_url=frontend_url)


@router.get("/apple/callback")
async def apple_callback_get(request: Request):
    """form_post 之外的保險絲：Apple 偶爾會用 GET 把錯誤帶回來。"""
    is_native, frontend_url = _apple_read_state(request.query_params.get("state") or "")
    return make_error_redirect(
        request.query_params.get("error") or "apple_error",
        native=is_native, frontend_url=frontend_url,
    )


# ================================================================
# Email + 密碼 註冊 / 登入
# ================================================================

class MergeGuestRequest(BaseModel):
    guest_id: str                      # 訪客 guest_xxx
    guest_token: Optional[str] = None  # 這個訪客自己的匿名 JWT（證明 guest_id 是你的）
    guest_secret: Optional[str] = None # 或：這台裝置綁定訪客時用的密語（iOS 原生登入會先蓋掉 token）


@router.post("/merge_guest_data")
async def merge_guest_data(
    body: MergeGuestRequest,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    """把訪客 (source) 在後端的所有 JSON 資料併到當前登入帳號 (target)。
    target_id 從 JWT 取得，避免使用者偽造他人 UUID 進行盜資料。
    """
    # 解 JWT 拿目前 target UUID
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="必須帶 Bearer token")
    target_raw = verify_token(authorization.split(" ", 1)[1]).get("id")
    target_id = user_service.resolve_user_id(db, target_raw) or target_raw

    # 🔴 source 也要證明是「你的」：以前 guest_id 隨便填 —— 填別人的帳號 ID（社群頁看得到），
    #    merge_users 就把對方整份資料搬進你的帳號、再把對方的帳號刪掉。
    #    現在只收 guest_ 開頭的訪客 ID，而且要附上那個訪客自己的匿名 token 或裝置密語。
    if not _GUEST_ID_RE.match(body.guest_id or ""):
        raise HTTPException(status_code=400, detail="只能帶入訪客資料")
    try:
        guest_claim = verify_token(body.guest_token or "").get("id") if body.guest_token else None
    except HTTPException:
        guest_claim = None
    proven = guest_claim == body.guest_id
    if not proven and body.guest_secret:
        cred = db.get(GuestCredential, body.guest_id)
        proven = bool(cred) and _hmac.compare_digest(
            cred.secret_hash, _hashlib.sha256(body.guest_secret.encode("utf-8")).hexdigest())
    if not proven:
        raise HTTPException(status_code=403, detail="無法確認這份訪客資料是你的")

    source_id = user_service.resolve_user_id(db, body.guest_id) or body.guest_id
    if not user_service.find_user_by_id(db, source_id):
        # 訪客在 DB 沒紀錄 (從未產生過後端資料) → 直接成功，無事可做
        return {"ok": True, "stats": {"renamed": 0, "merged_files": 0, "rewritten_files": 0}}

    try:
        stats = user_service.merge_users(db, source_id=source_id, target_id=target_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "stats": stats}


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    """Email + 密碼註冊。成功後直接回傳 JWT 與 user dict。"""
    try:
        user = user_service.register_email_user(
            db=db,
            email=body.email,
            password=body.password,
            display_name=body.display_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    public = user_service.user_to_public_dict(user)
    token = sign_token(
        user_id=public["id"],
        email=public["email"],
        name=public["name"],
        avatar=public["avatar"],
    )
    return {"token": token, "user": public}


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    """Email + 密碼登入。失敗一律回 401，避免 user-enumeration。"""
    user = user_service.authenticate_email_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    public = user_service.user_to_public_dict(user)
    token = sign_token(
        user_id=public["id"],
        email=public["email"],
        name=public["name"],
        avatar=public["avatar"],
    )
    return {"token": token, "user": public}


# ================================================================
# FastAPI Dependencies — 路由用
# ================================================================

async def get_current_user_id(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> str:
    """從 Bearer JWT 取 user_id；若是舊版 JWT（裝 legacy_id），自動轉成新 UUID。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header (Bearer token required)")
    token = authorization.split(" ", 1)[1]
    payload = verify_token(token)
    raw_id = payload.get("id") or payload.get("sub") or payload.get("user_id")
    if not raw_id:
        raise HTTPException(status_code=401, detail="Token does not contain a user_id")

    # 容錯：若是舊 legacy_id (line_xxx / google_xxx / user_1765xxx)，轉成新 UUID
    resolved = user_service.resolve_user_id(db, raw_id)
    return resolved or raw_id


async def get_optional_user_id(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.split(" ", 1)[1]
        payload = verify_token(token)
        raw_id = payload.get("id") or payload.get("sub") or payload.get("user_id")
        if not raw_id:
            return None
        return user_service.resolve_user_id(db, raw_id) or raw_id
    except Exception:
        return None


# ── Token Verify ──────────────────────────────────────────────────
@router.get("/me")
async def get_me(request: Request, db: Session = Depends(get_db)):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    data = verify_token(auth.split(" ")[1])

    # 同步從 DB 取最新 profile 回給前端（容錯舊 legacy_id）
    raw_id = data.get("id") or data.get("sub") or data.get("user_id")
    user = None
    if raw_id:
        user = user_service.find_user_by_id(db, raw_id) or user_service.find_user_by_legacy_id(db, raw_id)
    if user:
        return {"user": user_service.user_to_public_dict(user)}
    return {"user": data}


# ── 訪客匿名 Token（Phase 2b-I：讓 enforce_owner 也能保護訪客）──────────
# 背景：auth_guard 對「無 JWT」請求一律放行（訪客相容），等於任何人不帶 token
# 就能用任意 user_id 讀寫。發匿名 JWT 後，訪客請求也帶身分，guard 全面生效。
# 安全邊界：只簽發 guest_ 前綴、格式受限的 id — 不可能用這支 API 拿到正式帳號的 token。
import re as _re
import hashlib as _hashlib
import hmac as _hmac
from sqlalchemy import Column as _Column, String as _String, DateTime as _DateTime
from core.database import Base as _UsersBase, engine as _users_engine

_GUEST_ID_RE = _re.compile(r"^guest_[A-Za-z0-9_\-]{4,64}$")


class GuestCredential(_UsersBase):
    """訪客 ID ↔ 裝置密語（只存 SHA-256）。

    🔴 以前任何人送一個 guest_xxx 就能拿到那個訪客的 token —— 而訪客 ID 會出現在
    社群動態、排行榜（別人看得到），等於誰都能冒用訪客、讀寫他的私人資料。
    現在第一次發 token 時把裝置產生的密語綁上去（先到先綁）；之後要換新 token
    必須帶同一個密語，或手上已有這個訪客仍有效的 token（舊版訪客補綁用）。"""
    __tablename__ = "guest_credentials"
    guest_id = _Column(_String(80), primary_key=True)
    secret_hash = _Column(_String(64), nullable=False)
    created_at = _Column(_DateTime, default=datetime.utcnow, nullable=False)


try:
    GuestCredential.__table__.create(bind=_users_engine, checkfirst=True)
except Exception as _e:   # 建表失敗不擋啟動；發 token 時會回 503
    print(f"[auth] guest_credentials 建表失敗: {_e}")



def _guest_has_footprint(db: Session, gid: str) -> bool:
    """這個訪客 ID 在後端是不是已經有東西（使用者列或個人檔案）。查不到就當全新。"""
    try:
        if user_service.find_user_by_id(db, gid):
            return True
    except Exception:
        pass
    try:
        from core import coach_profile as _cp
        if (_cp.load_user_profiles() or {}).get(gid):
            return True
    except Exception:
        pass
    return False

@router.post("/guest")
@limiter.limit("20/minute")
async def issue_guest_token(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    gid = str(body.get("guest_id") or "").strip()
    if not _GUEST_ID_RE.match(gid):
        raise HTTPException(status_code=400, detail="Invalid guest id")
    secret = str(body.get("guest_secret") or "")
    if not (16 <= len(secret) <= 128):
        raise HTTPException(status_code=400, detail="guest_secret required")
    secret_hash = _hashlib.sha256(secret.encode("utf-8")).hexdigest()
    # 手上已有這個訪客仍有效的 token（inject_user_id 已驗過簽章）→ 本人
    holder = getattr(request.state, "user_id", None) == gid
    try:
        row = db.get(GuestCredential, gid)
        if row is None:
            # 還沒綁過密語的訪客：只有「全新」的 ID 可以直接綁。
            # 已經有資料的（舊版就存在的訪客）必須拿得出自己仍有效的 token 才能補綁，
            # 否則任何人從社群動態抄到 guest_ID、隨便給個密語，就先一步把別人的訪客帳號搶走。
            if not holder and _guest_has_footprint(db, gid):
                raise HTTPException(status_code=403, detail="guest_claimed")
            db.add(GuestCredential(guest_id=gid, secret_hash=secret_hash))
        elif not _hmac.compare_digest(row.secret_hash, secret_hash):
            if not holder:
                raise HTTPException(status_code=403, detail="guest_claimed")
            row.secret_hash = secret_hash
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"[auth] guest credential 寫入失敗: {e}")
        raise HTTPException(status_code=503, detail="guest_unavailable")
    # 不替訪客編名字。名字由前端的 drvnHandle 依「有沒有跑步計劃」算出
    # DRVNNER／DRVNFTR —— 後端塞一個「訪客用戶」會蓋掉它。
    token = sign_token(gid)
    return {"token": token, "user_id": gid}


# ── Token Refresh（P5：滑動續期）────────────────────────────────
@router.post("/refresh")
async def refresh_token(request: Request, db: Session = Depends(get_db)):
    """用「仍有效」的 token 換一張新的 30 天 token（滑動續期）。

    一年使用情境：活躍使用者永遠不會被登出；
    token 真的過期（>JWT_EXPIRE 天沒開 app）才需要重新登入。
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    data = verify_token(auth.split(" ", 1)[1])  # 過期會在這裡 401

    raw_id = data.get("id") or data.get("sub") or data.get("user_id")
    if not raw_id:
        raise HTTPException(status_code=401, detail="Token does not contain a user_id")
    resolved = user_service.resolve_user_id(db, raw_id) or raw_id

    new_token = sign_token(
        resolved,
        email=data.get("email"),
        name=data.get("name"),
        avatar=data.get("avatar"),
    )
    return {"token": new_token, "user_id": resolved}


# ── Logout ────────────────────────────────────────────────────────
@router.post("/logout")
async def logout():
    # JWT stateless — 前端清掉 token 即可
    return {"success": True}


# ================================================================
# main.py 整合方式（無需修改 main.py，本檔 import 時自動 init_db）:
#   from api_auth import router as auth_router
#   app.include_router(auth_router)
#
# SessionMiddleware 已由原本的設定處理。
#
# .env 範例:
#   JWT_SECRET=your_jwt_secret_min_32_chars
#   SESSION_SECRET=your_session_secret
#   USERS_DB_URL=sqlite:///./data/users.db   (可省，預設就是這個)
#   CLIENT_URL=http://172.20.10.4:5173
#   GOOGLE_CLIENT_ID=...
#   GOOGLE_CLIENT_SECRET=...
#   FACEBOOK_APP_ID=...
#   FACEBOOK_APP_SECRET=...
#   LINE_CHANNEL_ID=...
#   LINE_CHANNEL_SECRET=...
# ================================================================
