#!/usr/bin/env python3
"""
check_production_config.py —— 上線前把環境變數先檢查過一遍。

為什麼要有這支：後端在 production 模式下會「設定不對就不啟動」（config.py 的
fail-fast）。那是對的，但你會在部署平台上看到一坨紅色的 log 才知道少了什麼。
這支可以先在本機跑，一次把「缺什麼、填錯什麼、要去哪個後台填什麼」列清楚。

跑法：
    cd backend
    python3 check_production_config.py                # 檢查目前環境 / .env
    APP_ENV=production python3 check_production_config.py
    python3 check_production_config.py --env .env.production

    # 問「已經上線的那台」——這個不讀任何 .env，直接打線上後端：
    python3 check_production_config.py --remote https://drvn-app-production.up.railway.app

⚠️ 讀 .env 的模式只看得到「你這台電腦上的檔案」。部署平台（Railway / Zeabur…）
   的環境變數是另一個地方，本機永遠讀不到 —— 要知道線上那台到底怎麼設的，
   用 --remote。

回傳碼 0 = 可以上線；1 = 有會擋住上線的問題。
"""
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# ══════════════════════════════════════════════════════════════════
#  --remote：直接問線上那台，不看任何本機檔案
# ══════════════════════════════════════════════════════════════════
def _probe_remote(base: str) -> int:
    import json as _json
    import urllib.error
    import urllib.request

    base = base.rstrip("/")
    bad, warn_, info = [], [], []

    # ⚠️ urlopen 預設會自己跟著 302 走，Location 就再也讀不到了 ——
    #    /api/auth/apple 正是用轉址回報「還沒開通」，跟著走只會撞到前端的 404。
    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    _opener = urllib.request.build_opener(_NoRedirect)

    def req(path, method="GET", headers=None, timeout=20, follow=False):
        r = urllib.request.Request(base + path, method=method,
                                   headers=headers or {})
        opener = urllib.request.urlopen if follow else _opener.open
        try:
            with opener(r, timeout=timeout) as resp:
                return resp.status, dict(resp.headers), resp.read(2000)
        except urllib.error.HTTPError as e:
            # 轉址被我們擋下來時也走這裡，e.headers 裡就有 Location
            return e.code, dict(e.headers), e.read(2000)
        except Exception as e:
            return None, {}, str(e).encode()

    print(f"\n══ 線上後端檢查 ══\n\n目標：{base}\n")

    # 1 · 活著嗎
    code, _, body = req("/healthz")
    if code is None:
        # 連不到 ≠ 設定壞掉。可能只是現在沒網路，不該讓整條 prelaunch 因此紅掉。
        print(f"⚠ 連不到：{body.decode(errors='replace')[:200]}")
        print("\n⚠ 這次沒驗到線上那台（多半是沒網路）。有網路時再跑一次。\n")
        return 0
    txt = body.decode(errors='replace')[:200]
    print(f"· /healthz → HTTP {code}  {txt}")
    flat = txt.replace(" ", "")
    if '"env":"production"' in flat:
        info.append("線上是 production 模式（機密與 CORS 的 fail-fast 有在生效）。")
    if '"db":"sqlite"' in flat:
        warn_.append("線上用的是 SQLite 單檔，不是 Postgres —— 平台上那顆 Postgres "
                     "沒有接上去。到部署平台的 Variables 加 DATABASE_URL"
                     "（Railway 填 ${{Postgres.DATABASE_URL}}），程式端不用改。")
    elif '"db":"postgres"' in flat:
        info.append("資料庫是 Postgres，已經接上了。")
    elif '"db"' not in flat and code == 200:
        info.append("這個版本的 /healthz 還不會回報資料庫種類 —— 部署新版後就看得到。")
    elif code == 200:
        bad.append("/healthz 沒回報 env=production —— 沒設 APP_ENV=production 的話，"
                   "機密弱值與 CORS 白名單的檢查全都不會生效。")
    if code >= 500:
        bad.append(f"/healthz 回 {code} —— 後端起來了但健康檢查沒過。")

    # 2 · https
    if not base.startswith("https://"):
        bad.append("這個網址不是 https —— Sign in with Apple 的 Return URL 只收 https。")

    # 3 · CORS：正式白名單 vs 開發 regex
    def allow_origin(origin):
        _, h, _ = req("/api/auth/me", "OPTIONS", {
            "Origin": origin, "Access-Control-Request-Method": "GET"})
        return h.get("access-control-allow-origin") or h.get(
            "Access-Control-Allow-Origin")

    evil = allow_origin("https://definitely-not-yours.example.com")
    localhost = allow_origin("http://localhost:5173")
    app_scheme = allow_origin("drvn://app")
    print(f"· CORS  任意公網來源 → {evil or '（不給過）'}")
    print(f"· CORS  localhost    → {localhost or '（不給過）'}")
    print(f"· CORS  drvn://app   → {app_scheme or '（不給過）'}")

    if evil:
        bad.append("任何公網網站都拿得到 CORS 許可 —— 白名單等於沒設。")
    if localhost:
        bad.append("localhost 還在白名單裡 —— 線上那台多半沒設 APP_ENV=production，"
                   "所以 CORS 退回了開發用的 regex。")
    if not app_scheme:
        bad.append("drvn://app 不給過 —— iOS 打包版所有 API 都會被 CORS 擋下來。")

    # 4 · Sign in with Apple 通了沒
    code_a, h_a, _ = req("/api/auth/apple", "GET")
    loc = h_a.get("location") or h_a.get("Location") or ""
    if code_a == 404:
        bad.append("/api/auth/apple 根本不存在（404）—— 線上這台跑的版本還沒有 "
                   "Sign in with Apple，要重新部署後端。")
        print("· Apple 登入 → 這個版本沒有這支端點")
    elif "apple_not_configured" in loc:
        bad.append("Sign in with Apple 還沒開通（/api/auth/apple 直接回 not_configured）"
                   "—— 有 Google／Facebook／LINE 就必須有它，4.8 會退件。")
        print("· Apple 登入 → 還沒開通")
    elif "appleid.apple.com" in loc:
        print("· Apple 登入 → 會導向 Apple（已開通）")
    else:
        warn_.append(f"/api/auth/apple 的回應看不懂（HTTP {code_a}），手動確認一下。")

    # 5 · 這台跑的是哪一版
    code_p, _, _ = req("/api/user/plan-progress/__probe__")
    if code_p == 404:
        info.append("線上這台還沒有 /api/user/plan-progress —— 完課紀錄同步"
                    "要重新部署後端才會生效。")
    elif code_p in (401, 403):
        info.append("完課紀錄的端點已經上線了（回 401/403 = 有在擋身分，正常）。")

    print()
    for m in bad:
        print(f"✗ {m}")
    for m in warn_:
        print(f"⚠ {m}")
    for m in info:
        print(f"· {m}")
    print()
    print("※ DATABASE_URL 有沒有接上 Postgres，從外面看不出來 ——"
          "\n   要在部署平台的 Variables 分頁自己看。")
    if bad:
        print(f"\n❌ {len(bad)} 項要修\n")
        return 1
    print("\n✅ 線上這台的設定看起來是對的\n")
    return 0


if "--remote" in sys.argv:
    idx = sys.argv.index("--remote") + 1
    if idx >= len(sys.argv):
        print("--remote 後面要接網址，例如 --remote https://xxx.up.railway.app",
              file=sys.stderr)
        sys.exit(2)
    sys.exit(_probe_remote(sys.argv[idx]))


# ── 讀 .env（不依賴 dotenv，避免這支自己裝不起來）──────────────────
env_file = HERE / ".env"
if "--env" in sys.argv:
    env_file = Path(sys.argv[sys.argv.index("--env") + 1])
    if not env_file.is_absolute():
        env_file = HERE / env_file
    # 明講檔名卻找不到 → 直接停。不然你會以為「驗過了」，其實驗的是空的。
    if not env_file.exists():
        print(f"找不到 {env_file} —— 沒有東西可以檢查。", file=sys.stderr)
        sys.exit(2)

loaded = {}
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        loaded[k.strip()] = v.strip().strip('"').strip("'")

def get(name, default=""):
    return (os.getenv(name) or loaded.get(name) or default).strip()

PLACEHOLDER = re.compile(r"CHANGE_ME|你的|xxx+|<.*>|填這裡", re.I)

blocking, warnings, notes = [], [], []
def block(m): blocking.append(m)
def warn(m):  warnings.append(m)
def note(m):  notes.append(m)

APP_ENV = (get("APP_ENV", "development")).lower()
IS_PROD = APP_ENV in ("production", "prod")

print("\n══ DRVN 後端上線設定檢查 ══\n")
print(f"讀到的 .env：{env_file if env_file.exists() else '（沒有，只看目前環境變數）'}")
print("⚠ 這是本機檔案。部署平台的環境變數這裡看不到 —— 要問線上那台請用 --remote <網址>。")
print(f"APP_ENV    ：{APP_ENV}")
if not IS_PROD:
    print("\n⚠ 這份設定是開發用的。以下仍然「用正式機的標準」檢查一遍，"
          "讓你知道上線前還要補什麼；不會因此判定失敗。")
    print("  真的要驗正式機：APP_ENV=production python3 check_production_config.py --env .env.production\n")
else:
    print()

# ── 1 · 機密 ────────────────────────────────────────────────────
for name in ("JWT_SECRET", "SESSION_SECRET"):
    v = get(name)
    if not v or PLACEHOLDER.search(v):
        block(f"{name} 還是空的或範本值。產生：python3 -c \"import secrets; print(secrets.token_urlsafe(48))\"")
    elif len(v) < 32:
        block(f"{name} 只有 {len(v)} 個字元，至少要 32。")
if get("JWT_SECRET") and get("JWT_SECRET") == get("SESSION_SECRET"):
    warn("JWT_SECRET 和 SESSION_SECRET 是同一組，分開比較好。")

# ── 2 · 對外網址 ────────────────────────────────────────────────
api = get("API_BASE_URL")
client = get("CLIENT_URL")
for name, url in (("API_BASE_URL", api), ("CLIENT_URL", client)):
    if not url:
        block(f"{name} 沒設 —— OAuth 不知道要把使用者送回哪裡。")
    elif "localhost" in url or "127.0.0.1" in url:
        block(f"{name} 還指著本機（{url}）—— 第三方登入會把使用者導回你的開發機。")
    elif not url.startswith("https://"):
        block(f"{name} 不是 https（{url}）—— Sign in with Apple 的 Return URL 只收 https。")

# 前端寫死的正式後端網址要跟 API_BASE_URL 對得上
host_fix = ROOT / "frontend" / "src" / "utils" / "apiHostFix.js"
if host_fix.exists() and api:
    m = re.search(r"PRODUCTION_API_BASE\s*=\s*'([^']+)'", host_fix.read_text(encoding="utf-8"))
    if m and m.group(1).rstrip("/") != api.rstrip("/"):
        block(f"前端寫死的後端網址（{m.group(1)}）和 API_BASE_URL（{api}）不一樣 —— "
              f"打包版會連到前面那個。要改 frontend/src/utils/apiHostFix.js、"
              f"ios/FitnessApp/WebView.swift 和 WatchConfig.swift 三個地方。")

# ── 3 · CORS ────────────────────────────────────────────────────
cors = [o.strip() for o in get("CORS_ALLOW_ORIGINS").split(",") if o.strip()]
if True:
    if not cors:
        block("CORS_ALLOW_ORIGINS 是空的 —— production 一定要明寫前端網域，後端會拒絕啟動。")
    if any(o in ("*", "null") for o in cors):
        block("CORS_ALLOW_ORIGINS 不可以含 * 或 null。")
    for o in cors:
        if o.startswith("http://"):
            warn(f"CORS 白名單裡有明文 http 來源：{o}")
    if client and cors and client.rstrip("/") not in [o.rstrip("/") for o in cors]:
        warn(f"CLIENT_URL（{client}）不在 CORS 白名單裡，前端網頁版可能會被擋。")
    note("iOS App 的 drvn://app 來源後端會自動放行，不用自己加。")

# ── 4 · 資料庫 ──────────────────────────────────────────────────
db = get("DATABASE_URL")
users_db = get("USERS_DB_URL")
if not db and not users_db:
    warn("沒設 DATABASE_URL / USERS_DB_URL，會用 SQLite 單檔。"
         "容器重新部署時只有掛在 Volume 上的檔案留得下來 —— "
         "Railway 請確認 Volume 掛在 /data（Dockerfile 會把 /app/data 連過去）。")

# ── 5 · 第三方登入 ──────────────────────────────────────────────
print("── 登入方式 ──")
providers = {
    "Google":   (["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "/api/auth/google/callback"),
    "Facebook": (["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],   "/api/auth/facebook/callback"),
    "LINE":     (["LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"],   "/api/auth/line/callback"),
    "Apple":    (["APPLE_TEAM_ID", "APPLE_SERVICES_ID", "APPLE_KEY_ID"], "/api/auth/apple/callback"),
}
enabled = {}
for name, (keys, cb) in providers.items():
    have = all(get(k) and not PLACEHOLDER.search(get(k)) for k in keys)
    if name == "Apple":
        have = have and bool(get("APPLE_PRIVATE_KEY") or get("APPLE_PRIVATE_KEY_PATH"))
    enabled[name] = have
    mark = "✓" if have else "·"
    tail = f"   Return URL → {api}{cb}" if have and api else ""
    print(f"  {mark} {name}{tail}")
    if not have:
        print(f"      缺：{'、'.join(k for k in keys if not get(k))}"
              + ("、APPLE_PRIVATE_KEY（或 APPLE_PRIVATE_KEY_PATH）"
                 if name == "Apple" and not (get("APPLE_PRIVATE_KEY") or get("APPLE_PRIVATE_KEY_PATH")) else ""))

third_party = [n for n in ("Google", "Facebook", "LINE") if enabled[n]]
if third_party and not enabled["Apple"]:
    block(f"有 {'、'.join(third_party)} 登入卻沒有 Sign in with Apple —— "
          f"App Store 審查指南 4.8，這會直接退件。")
if enabled["Apple"]:
    pk = get("APPLE_PRIVATE_KEY")
    if pk and "BEGIN PRIVATE KEY" not in pk.replace("\\n", "\n"):
        block("APPLE_PRIVATE_KEY 看起來不是 .p8 的內容（找不到 BEGIN PRIVATE KEY）。")
    if get("APPLE_SERVICES_ID") and get("APPLE_SERVICES_ID") == get("APPLE_TEAM_ID"):
        block("APPLE_SERVICES_ID 填成 Team ID 了 —— 要的是 Services ID（那個 com.xxx.signin）。")

# ── 收尾 ────────────────────────────────────────────────────────
print()
for m in blocking:
    print(f"✗ {m}")
for m in warnings:
    print(f"⚠ {m}")
for m in notes:
    print(f"· {m}")

print()
if not IS_PROD:
    # 開發機：照樣把清單列出來，但不判定失敗 —— 這是「還要補什麼」的待辦，不是錯誤。
    print(f"以上 {len(blocking)} 項是正式機上線前還要補的，{len(warnings)} 項提醒。")
    print("（這份是開發設定，所以不算失敗。）\n")
    sys.exit(0)
if blocking:
    print(f"❌ {len(blocking)} 項會擋住上線\n")
    sys.exit(1)
print("✅ 設定可以上線" + (f"（另有 {len(warnings)} 項提醒）" if warnings else "") + "\n")
