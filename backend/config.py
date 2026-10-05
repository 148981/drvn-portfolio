"""
config.py — 後端集中式設定 (single source of truth)
====================================================

所有環境變數、機密、連線字串都在這裡讀取一次，其他模組一律
`from config import settings` 取用，不要再各自散落 os.getenv()。

設計重點
--------
1. 環境分流：APP_ENV = "development"(預設) | "production"
2. 機密 fail-fast：production 模式下若機密仍是預設弱值 → 啟動即報錯，
   絕不讓「用公開已知密鑰簽 JWT」這種事偷偷上線。
   development 模式維持可用（用預設值並印出警告），本機開發不受影響。
3. 資料庫 Postgres-ready：預設 SQLite 單檔；設定 DATABASE_URL 環境變數即可
   無痛切換到 PostgreSQL（例：postgresql+psycopg://user:pw@host:5432/drvn）。
4. 零額外相依：只用標準庫 os，不引入 pydantic-settings，避免相依衝突。
"""

from __future__ import annotations

import os
import sys

# ── 已知的「預設弱值」黑名單：production 出現這些就擋下 ──────────────
_INSECURE_DEFAULTS = {
    "change_this_secret_in_production_min32chars",
    "fitness_app_dev_session_key_32chars!!",
    "",
    None,
}

# backend/ 根目錄；DATA_DIR = backend/data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")


def _get(name: str, default: str | None = None) -> str | None:
    val = os.getenv(name)
    return val if val not in (None, "") else default


def _normalize_db_url(url: str) -> str:
    """把雲端平台（Railway / Heroku 等）給的 Postgres 連線字串正規化成
    SQLAlchemy + psycopg(v3) 能用的格式：
      postgres://...            → postgresql+psycopg://...
      postgresql://...          → postgresql+psycopg://...
      postgresql+psycopg://...  → 原樣保留
      sqlite:///...             → 原樣保留
    這樣不論平台給哪種前綴，後端都能正確載入 psycopg 驅動。
    """
    if not url:
        return url
    if url.startswith("postgresql+"):
        return url  # 已指定驅動，不動
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


class Settings:
    """應用程式設定。實例化時即完成讀取與驗證。"""

    def __init__(self) -> None:
        # ── 環境 ──────────────────────────────────────────────────
        self.APP_ENV: str = (_get("APP_ENV", "development") or "development").lower()
        self.IS_PRODUCTION: bool = self.APP_ENV in ("production", "prod")

        # ── 機密 ──────────────────────────────────────────────────
        self.JWT_SECRET: str = _get("JWT_SECRET", "change_this_secret_in_production_min32chars")
        self.JWT_ALGORITHM: str = _get("JWT_ALGORITHM", "HS256")
        self.JWT_EXPIRE_DAYS: int = int(_get("JWT_EXPIRE_DAYS", "30"))
        self.SESSION_SECRET: str = _get("SESSION_SECRET", "fitness_app_dev_session_key_32chars!!")

        # ── 資料庫（Postgres-ready，預設 SQLite）────────────────────
        # 帳號/驗證 DB（沿用 core/database.py 的慣例）
        _users_db_path = os.path.join(DATA_DIR, "users.db")
        self.USERS_DB_URL: str = _normalize_db_url(
            _get("USERS_DB_URL", f"sqlite:///{_users_db_path}"))
        # 主資料庫連線字串（未來訓練/營養/社群資料統一遷入）
        _app_db_path = os.path.join(DATA_DIR, "drvn.db")
        self.DATABASE_URL: str = _normalize_db_url(
            _get("DATABASE_URL", f"sqlite:///{_app_db_path}"))

        # ── CORS ──────────────────────────────────────────────────
        # 逗號分隔白名單；留空時 main.py 會退回「localhost + 私網」regex（僅限非 production）
        _cors = _get("CORS_ALLOW_ORIGINS", "")
        self.CORS_ALLOW_ORIGINS: list[str] = [o.strip() for o in _cors.split(",") if o.strip()]

        # ── OAuth（選填，未設定則該登入方式停用）────────────────────
        self.GOOGLE_CLIENT_ID: str | None = _get("GOOGLE_CLIENT_ID")
        self.GOOGLE_CLIENT_SECRET: str | None = _get("GOOGLE_CLIENT_SECRET")
        self.FACEBOOK_APP_ID: str | None = _get("FACEBOOK_APP_ID")
        self.FACEBOOK_APP_SECRET: str | None = _get("FACEBOOK_APP_SECRET")
        self.LINE_CHANNEL_ID: str | None = _get("LINE_CHANNEL_ID")
        self.LINE_CHANNEL_SECRET: str | None = _get("LINE_CHANNEL_SECRET")
        # Sign in with Apple（上架必備：有 Google/FB/LINE 就一定要有 Apple）
        #   APPLE_SERVICES_ID = Apple Developer 後台的 Services ID（不是 App 的 Bundle ID）
        #   APPLE_PRIVATE_KEY = .p8 檔內容（換行可用 \n），或改填 APPLE_PRIVATE_KEY_PATH
        self.APPLE_TEAM_ID: str | None = _get("APPLE_TEAM_ID")
        self.APPLE_SERVICES_ID: str | None = _get("APPLE_SERVICES_ID")
        self.APPLE_KEY_ID: str | None = _get("APPLE_KEY_ID")
        self.APPLE_PRIVATE_KEY: str | None = _get("APPLE_PRIVATE_KEY")
        self.APPLE_PRIVATE_KEY_PATH: str | None = _get("APPLE_PRIVATE_KEY_PATH")

        # ── 前端/後端對外 URL（OAuth redirect 用）───────────────────
        self.CLIENT_URL: str = _get("CLIENT_URL", "http://localhost:5173")
        self.API_BASE_URL: str = _get("API_BASE_URL", "http://localhost:8000")

        # ── 會員付費牆 ────────────────────────────────────────────
        #   App 內購（StoreKit）上線前保持 0：所有人都視為會員，行為與現在相同。
        #   購買流程上線、App Store Connect 產品建好之後才改成 1。
        self.MEMBERSHIP_GATE_ENABLED: bool = (_get("MEMBERSHIP_GATE_ENABLED", "0") or "0").strip() in ("1", "true", "yes")
        #   App 內購驗證：交易的 bundleId 必須是這個 App、productId 必須是自家商品
        #   （與 iOS StoreManager.productIds、前端 MEMBERSHIP_PLANS 同一份 ID）
        #   付費牆只對這些帳號開（試營運期間給 App 審核帳號、自己測試用）：Email 或帳號 ID，逗號分隔。
        #   MEMBERSHIP_GATE_ENABLED=1 之後這個名單就沒作用（所有人都開）。
        self.MEMBERSHIP_GATE_USERS: frozenset = frozenset(
            x.strip().lower() for x in (_get("MEMBERSHIP_GATE_USERS", "") or "").split(",") if x.strip()
        )
        #   永久免費會員：付費牆開了也一直是會員。Email 或帳號 ID，逗號分隔（Railway 環境變數改了就生效）
        self.FREE_MEMBERS: frozenset = frozenset(
            x.strip().lower() for x in (_get("FREE_MEMBERS", "") or "").split(",") if x.strip()
        )
        #   創始會員：這一天（台灣時間 0 點）以前註冊的帳號永久免費。空白＝不啟用。格式 2026-12-31
        self.FOUNDING_MEMBERS_BEFORE: str = (_get("FOUNDING_MEMBERS_BEFORE", "") or "").strip()
        self.APPLE_BUNDLE_ID: str = _get("APPLE_BUNDLE_ID", "com.mikeychen.DRVN.dev")
        self.APPLE_IAP_PRODUCT_IDS: tuple = tuple(
            p.strip() for p in (_get("APPLE_IAP_PRODUCT_IDS", "drvn.member.yearly,drvn.member.monthly") or "").split(",") if p.strip()
        )

        # ── 日誌 ──────────────────────────────────────────────────
        self.LOG_LEVEL: str = (_get("LOG_LEVEL", "WARNING") or "WARNING").upper()

        self._validate()

    # ─────────────────────────────────────────────────────────────
    def _validate(self) -> None:
        """production 模式下強制機密非預設弱值；否則 fail-fast。"""
        problems: list[str] = []

        if self.IS_PRODUCTION:
            if self.JWT_SECRET in _INSECURE_DEFAULTS:
                problems.append("JWT_SECRET 仍為預設弱值，請設定環境變數（建議 >= 32 隨機字元）。")
            elif len(self.JWT_SECRET) < 32:
                problems.append("JWT_SECRET 長度不足 32 字元，HS256 簽章強度不夠。")

            if self.SESSION_SECRET in _INSECURE_DEFAULTS:
                problems.append("SESSION_SECRET 仍為預設弱值，請設定環境變數。")
            elif len(self.SESSION_SECRET) < 32:
                problems.append("SESSION_SECRET 長度不足 32 字元。")

            if not self.CORS_ALLOW_ORIGINS:
                problems.append("production 必須以 CORS_ALLOW_ORIGINS 明確指定前端網域白名單。")
            if any(origin in ('*', 'null') for origin in self.CORS_ALLOW_ORIGINS):
                problems.append("production 不可允許萬用或 null CORS 來源。")

            # ── 對外網址 ────────────────────────────────────────────
            # ⚠️ 2026-09-21 的教訓：這裡本來是 fail-fast，結果正式機沒設這兩個
            #    變數，新版一部署就 502 —— 把「一個登入方式不能用」升級成
            #    「整個後端掛掉」，那是更糟的結果。
            #
            #    這兩個值其實只有兩個地方會用到：Sign in with Apple 的
            #    redirect_uri，以及瀏覽器版 OAuth 回跳的預設前端網址。
            #    Google / Facebook / LINE 的 redirect_uri 是從 request.base_url
            #    當場推導的，原生 App 也會自己帶 frontend_url 回來 ——
            #    所以沒設好不影響現有的登入。
            #
            #    規則因此改成：預設只大聲警告；只有在 Apple 已經設定好的時候
            #    才擋啟動（那時候網址不對，Apple 會安靜地失敗，更難查）。
            _apple_ready = all([
                _get("APPLE_TEAM_ID"), _get("APPLE_SERVICES_ID"), _get("APPLE_KEY_ID"),
                (_get("APPLE_PRIVATE_KEY") or _get("APPLE_PRIVATE_KEY_PATH")),
            ])
            url_problems: list[str] = []
            for _name, _url in (("API_BASE_URL", self.API_BASE_URL),
                                ("CLIENT_URL", self.CLIENT_URL)):
                low = (_url or "").lower()
                if not low:
                    url_problems.append(f"{_name} 未設定 —— OAuth 不知道要把使用者送回哪裡。")
                elif "localhost" in low or "127.0.0.1" in low or "://:" in low:
                    url_problems.append(
                        f"{_name} 仍指向本機（{_url}）—— 第三方登入會把使用者導回開發機。")
                elif not low.startswith("https://"):
                    url_problems.append(
                        f"{_name} 不是 https（{_url}）—— Sign in with Apple 的 Return URL 只收 https。")
            if url_problems:
                if _apple_ready:
                    problems.extend(url_problems)   # Apple 開著就非擋不可
                else:
                    for _p in url_problems:
                        print(f"[config][production] 注意：{_p} "
                              "（Apple 登入尚未設定，所以先不擋啟動）", file=sys.stderr)

            if problems:
                msg = "\n".join(f"  ✗ {p}" for p in problems)
                raise RuntimeError(
                    "啟動中止：production 設定不安全：\n" + msg +
                    "\n請在環境變數 / .env 補齊後再啟動（參考 .env.example）。"
                )
            # ── 以下不擋啟動，但一定要講出來 ─────────────────────
            notes: list[str] = []
            if "sqlite" in self.DATABASE_URL.lower() or "sqlite" in self.USERS_DB_URL.lower():
                notes.append(
                    "資料庫還是 SQLite 單檔。雲端容器重新部署會把它連同使用者資料一起沖掉，"
                    "除非那個檔案落在掛載的 Volume 上。要長久保存請設 DATABASE_URL / USERS_DB_URL。")
            if not (_get("APPLE_TEAM_ID") and _get("APPLE_SERVICES_ID")
                    and _get("APPLE_KEY_ID")
                    and (_get("APPLE_PRIVATE_KEY") or _get("APPLE_PRIVATE_KEY_PATH"))):
                notes.append(
                    "Sign in with Apple 尚未設定。App Store 審查指南 4.8：有 Google／Facebook／"
                    "LINE 就必須有 Apple，缺了會被退件。")
            for n in notes:
                print(f"[config][production] 注意：{n}", file=sys.stderr)
        else:
            # 開發模式：不擋，但提醒
            weak = []
            if self.JWT_SECRET in _INSECURE_DEFAULTS:
                weak.append("JWT_SECRET")
            if self.SESSION_SECRET in _INSECURE_DEFAULTS:
                weak.append("SESSION_SECRET")
            if weak:
                print(
                    f"[config][dev] 注意：{', '.join(weak)} 使用預設值，僅供本機開發；"
                    "上線前務必設定環境變數。",
                    file=sys.stderr,
                )


# 單例：整個後端共用同一份設定
settings = Settings()
