from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Query, Body, Request
from core.json_cache import save_json_atomic
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.formparsers import MultiPartParser
# 🎯 提高 multipart form field 上限：base64 頭貼/封面圖需要 > 1MB
MultiPartParser.max_part_size = 1024 * 1024 * 20  # 20MB
from pydantic import BaseModel
from typing import List, Optional, Dict
import shutil
import os
import uuid
import numpy as np
import json
import base64
import threading
import time
from core.analysis import (
    extract_features, apply_smoothing, segment_repetitions,
    create_golden_template, resample_to_length, calculate_efficiency_score_custom,
    generate_ar_overlay, generate_ar_overlay_all_reps, generate_ar_overlay_from_landmarks,
    METRIC_LABELS, TIPS_DATABASE
)
import core.multi_exercise as multi_exercise
import core.coach_profile as coach_profile
import core.workout_history as workout_history
import core.recovery as recovery
import core.smart_trainer as smart_trainer
import core.insights as insights
import core.nutrition as nutrition
import core.cardio_storage as cardio_storage
import core.gamification as gamification
import core.activity_logger as activity_logger

import segment_logic as segments
import core.social as social
import core.challenges as challenges
import logging
import sys

# Configure logging — WARNING level in production to reduce I/O overhead.
# Switch to DEBUG only when actively debugging: LOG_LEVEL=DEBUG uvicorn main:app
import os as _log_os
from logging.handlers import RotatingFileHandler
_log_level = getattr(logging, _log_os.getenv("LOG_LEVEL", "WARNING").upper(), logging.WARNING)
# 用 RotatingFileHandler 取代 FileHandler：單檔上限 5MB、保留 3 份備份，
# 避免 log 像之前一樣膨脹到數十 MB。最多佔用 5MB x 4 = 20MB。
_rotating_handler = RotatingFileHandler(
    "backend_debug.log",
    maxBytes=5 * 1024 * 1024,   # 5MB
    backupCount=3,
    encoding='utf-8',
)
logging.basicConfig(
    level=_log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        _rotating_handler,
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)
from core.workout_modifier import modify_workout, ModificationType, generate_comparison
from datetime import datetime, timedelta

app = FastAPI()

# Import Routers
import api_plan_endpoints
import api_nutrition_goals
import api_auth

# Include Routers
# Include Routers
app.include_router(api_plan_endpoints.router)
app.include_router(api_nutrition_goals.router)
# api_layout_endpoints removed (missing module)
import api_evolution
app.include_router(api_evolution.router)
import api_nutrition_sql
app.include_router(api_nutrition_sql.router)
app.include_router(api_auth.router)
# 📄 公開法律文件頁（App Store Connect 隱私政策 URL：/legal/privacy）
import api_legal
app.include_router(api_legal.router)
import api_sonic
app.include_router(api_sonic.router)
import api_custom_exercises
app.include_router(api_custom_exercises.router)
import api_squads
app.include_router(api_squads.router)
import api_friends
app.include_router(api_friends.router)
import api_social_challenges
app.include_router(api_social_challenges.router)
# 🔴 即時一起練（同一個當下，看得到對方的進度）
import api_live_session
app.include_router(api_live_session.router)
# 🏆 常駐挑戰（加入 + 自動進度追蹤）
import api_permanent_challenges
app.include_router(api_permanent_challenges.router)
# 🏃 Phase 2-B — Cardio 週期化計劃（Brick / Microcycle）
import api_cardio_plan_endpoints
app.include_router(api_cardio_plan_endpoints.router)
# 📋 Activities & Social Feed (extracted from main.py)
import api_activities
app.include_router(api_activities.router)
import api_ai_insights
app.include_router(api_ai_insights.router)
import api_review
app.include_router(api_review.router)
import api_segments
app.include_router(api_segments.router)
import api_strength
app.include_router(api_strength.router)
import api_coaches
app.include_router(api_coaches.router)
import api_recommendations
app.include_router(api_recommendations.router)
import api_program
app.include_router(api_program.router)
import api_hashtags
app.include_router(api_hashtags.router)
import api_trainer
app.include_router(api_trainer.router)
import api_workout_modify
app.include_router(api_workout_modify.router)
import api_cardio_analytics
app.include_router(api_cardio_analytics.router)
import api_cardio_hr_pace
app.include_router(api_cardio_hr_pace.router)
import api_cardio_sessions
app.include_router(api_cardio_sessions.router)
import api_cardio_tracking
app.include_router(api_cardio_tracking.router)
import api_history
app.include_router(api_history.router)
import api_pr
app.include_router(api_pr.router)
import api_inbody
app.include_router(api_inbody.router)
import api_leaderboard
app.include_router(api_leaderboard.router)
import api_pr_rank  # PR 在所有 DRVN 使用者裡的名次
app.include_router(api_pr_rank.router)
import api_exercise_configs
app.include_router(api_exercise_configs.router)
import api_plan_legacy
app.include_router(api_plan_legacy.router)
import api_nutrition
app.include_router(api_nutrition.router)
import api_challenges
app.include_router(api_challenges.router)
import api_pose_analysis
app.include_router(api_pose_analysis.router)
# 🏆 成就 / 徽章（含路由順序遮蔽 bug 修復）
import api_achievements
app.include_router(api_achievements.router)
# 📊 智慧儀表板（recovery / insights）
import api_dashboard
app.include_router(api_dashboard.router)
# 🖼️ 計劃 / 融合卡封面圖
import api_plan_covers
app.include_router(api_plan_covers.router)
# 🧩 零散獨立小路由（weather / recommend / body-analysis / personality / pr-check）
import api_misc
app.include_router(api_misc.router)
# ☁️ 通用 user-blob 雲端備份（自訂 Block / 自訂計劃，換機不遺失）
import api_userdata
app.include_router(api_userdata.router)
# 📊 自建觀測性（前端錯誤 + 漏斗事件，無第三方依賴）
import api_telemetry
app.include_router(api_telemetry.router)
# 📏 使用者 InBody 體組成記錄（CRUD）
import api_user_inbody
app.include_router(api_user_inbody.router)

# 專項計劃的完課紀錄：換裝置不失憶（前端 specialPlanProgress.js 對接）
import api_plan_progress
app.include_router(api_plan_progress.router)
# 🎯 使用者健身目標
import api_user_goals
app.include_router(api_user_goals.router)
# 👤 使用者個人檔案核心（initialize / profile / delete / monthly-report）
import api_user_profile
app.include_router(api_user_profile.router)
# 📡 使用者雷達 / 評分 / 恢復（radar-profile / initial-score / recovery）
import api_user_scoring
app.include_router(api_user_scoring.router)
# 🏋️ 訓練紀錄 / 進度 / 分析（legacy history / metrics / custom_plan / analysis）
import api_workout
app.include_router(api_workout.router)
# 💳 會員身分（付費牆判斷的唯一來源）
import api_membership
app.include_router(api_membership.router)
import api_moderation   # 社群檢舉／封鎖／過濾（App Store 1.2）
app.include_router(api_moderation.router)

# CORS - Enhanced configuration
# SessionMiddleware MUST come before CORSMiddleware for OAuth flows
from config import settings  # 集中式設定（production 機密 fail-fast）
try:
    from starlette.middleware.sessions import SessionMiddleware
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.SESSION_SECRET,
        max_age=600,       # 10 分鐘 —— 只有 OAuth 交握期間需要
        same_site="lax",   # OAuth 是 top-level 轉址回來，lax 帶得上；跨站 POST 帶不上
        # 這顆 cookie 裝的是 OAuth 的 state。正式環境全程 https，標成 Secure
        # 才不會有任何一次明文往返把它帶出去。
        https_only=settings.IS_PRODUCTION,
    )
except ImportError:
    print("[WARNING]  starlette SessionMiddleware not available — OAuth flows won't work")

# ── CORS 安全收斂 ──────────────────────────────────────────────
# 🔴 修復：原本 allow_origin_regex="http://.*" 配 allow_credentials=True，
#    等於任何公網 http 網站都能帶使用者憑證打本 API（CSRF 類風險）。
#    收斂為「僅 localhost + RFC1918 私有網段」(開發/區網連線必要)，
#    並排除任意公網來源。上線正式 domain 時，用環境變數 CORS_ALLOW_ORIGINS
#    （逗號分隔）覆蓋，例如：CORS_ALLOW_ORIGINS="https://app.drvn.com"
if settings.CORS_ALLOW_ORIGINS:
    _origins = list(settings.CORS_ALLOW_ORIGINS)
    # 📱 iOS App 以 file:// 載入網頁，發 API 請求時 Origin 為 "null"。
    #    必須明確允許 "null"（CORS 規範下 "*" 配 allow_credentials 無效，
    #    且 "*" 也不匹配 null）。一律補進白名單，確保 App 連得到後端。
    if not settings.IS_PRODUCTION and "null" not in _origins:
        _origins.append("null")
    # 📱 iOS App 改用自訂 scheme（drvn://app）載入打包網頁以修正絕對路徑資源破圖，
    #    此時 API 請求的 Origin 變為 "drvn://app"（非 file:// 的 "null"）。
    #    必須一併放行，否則 production CORS 白名單會擋下 App 所有 API 請求。
    for _app_origin in (("drvn://app",) if settings.IS_PRODUCTION else ("drvn://app", "null")):
        if _app_origin not in _origins:
            _origins.append(_app_origin)
    # 若白名單含 "*"（先前測試用值），改用 regex 放行所有來源，
    # 避免 "*" + allow_credentials=True 的無效組合被瀏覽器擋下。
    if "*" in _origins:
        _cors_kwargs = {"allow_origin_regex": r".*"}
    else:
        _cors_kwargs = {"allow_origins": _origins}
else:
    # 開發/區網：localhost、127.0.0.1、RFC1918 私有 IP（10.x / 172.16-31.x / 192.168.x），http/https、任意 port
    # 注意：production 模式啟動時 config 已強制要求設定 CORS_ALLOW_ORIGINS，不會走到這裡。
    #    另放行 iOS App 自訂 scheme origin（drvn://app）與 file:// 的 "null"。
    _cors_kwargs = {"allow_origin_regex":
        r"^(drvn://app|null|https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3})(:\d+)?)$"}

app.add_middleware(
    CORSMiddleware,
    **_cors_kwargs,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "Cache-Control",
        "Pragma",
    ],
    expose_headers=["Content-Disposition"],
)


# ── 請求大小上限（Phase 3）：擋超大 payload 的 DoS ───────────────────
_MAX_BODY_BYTES = 25 * 1024 * 1024  # 25MB（容得下 20MB 圖片上傳，仍擋住惡意巨大 body）

# 【v4.8】姿態分析要上傳整支影片：手機 .MOV 一支動輒 30–150MB，建模更是一次傳兩支，
#   25MB 一定過不了。這些路徑單獨放寬；其餘 API 維持 25MB 的 DoS 防護。
_LARGE_BODY_PATHS = (
    "/api/multi-exercise/template",
    "/api/multi-exercise/analyze",       # 同時涵蓋 analyze-async
    # 【v8.9】信度校準也是傳整支影片（一次一支）。漏掉這一條的後果：
    #   6 個機位裡有 4 個的校準被 413 擋掉 → 靜默退回查表版信度門檻 →
    #   深蹲自選機位的 Torso Lean（CV 0.83）沒被擋下，標準組出現 17 分。
    #   新增「會上傳影片的路徑」時，這張表一定要跟著加。
    "/api/multi-exercise/calibrate",
    "/upload/expert",
    "/upload/user",
    "/research/skeleton",   # 骨架示範影片：上傳整支影片，放寬到 1GB（與影片分析同級）
)
_MAX_BODY_BYTES_LARGE = 1024 * 1024 * 1024  # 1GB


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    cl = request.headers.get("content-length")
    is_large_path = request.url.path.startswith(_LARGE_BODY_PATHS)
    limit = _MAX_BODY_BYTES_LARGE if is_large_path else _MAX_BODY_BYTES

    # 🔴 修復（資安稽核 I-3）：原本只有「客戶端誠實送出 Content-Length」時才擋。
    #    改用 chunked transfer-encoding（不送這個標頭）就完全繞過上限。
    #    一般 JSON API 不會用 chunked，缺標頭一律回 411；影片上傳路徑保留彈性
    #    （iOS URLSession 會送 Content-Length），改由 A-1 的限流控制成本。
    if not cl and not is_large_path and request.method in ("POST", "PUT", "PATCH"):
        if request.headers.get("transfer-encoding", "").lower() == "chunked":
            resp = JSONResponse(
                status_code=411,
                content={"detail": "Length Required：請帶上 Content-Length 標頭"},
            )
            origin = request.headers.get("origin")
            if origin:
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                resp.headers["Vary"] = "Origin"
            return resp

    if cl and cl.isdigit() and int(cl) > limit:
        resp = JSONResponse(
            status_code=413,
            content={"detail": f"Payload too large：{int(cl)//1024//1024}MB 超過此路徑上限 {limit//1024//1024}MB"},
        )
        # ⚠️ 本 middleware 用 @app.middleware 註冊，晚於 CORSMiddleware →
        #   Starlette 的 add_middleware 是 insert(0)，「後註冊＝更外層」，
        #   所以這個 413 不會經過 CORS middleware、身上沒有 CORS 標頭。
        #   瀏覽器會直接丟掉整個回應，前端只看得到「Network Error」，
        #   完全查不出真正原因（就是這個坑害測試模式 20 支全掛）。手動補標頭。
        origin = request.headers.get("origin")
        if origin:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Vary"] = "Origin"
        return resp
    return await call_next(request)


# ── 安全標頭（Phase 3）────────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    """為每個回應加上基本安全標頭，降低 clickjacking / MIME sniffing 等風險。"""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"  # 現代瀏覽器建議關閉舊式過濾器
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"
    # HSTS 只在 production（HTTPS）時送，避免本機 http 開發誤套
    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── Rate limiting（Phase 3）：對敏感端點限流，擋暴力破解 ──────────────
from rate_limit import limiter, SLOWAPI_AVAILABLE
if SLOWAPI_AVAILABLE:
    from slowapi.errors import RateLimitExceeded
    from slowapi import _rate_limit_exceeded_handler
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
else:
    print("[WARNING] slowapi 未安裝，敏感端點暫無速率限制（pip install slowapi 後生效）")


# ── 全域例外處理（Phase 3）：未捕捉的錯誤一律回通用訊息，完整堆疊只記在
#    伺服器端，避免把內部細節/堆疊外洩給前端。（HTTPException 仍照常回它的 detail）
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("UNHANDLED %s %s: %s", request.method, request.url, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.middleware("http")
async def log_requests(request, call_next):
    # 只記錄錯誤，避免每條請求都寫 stdout/檔案（大量 I/O 開銷）
    try:
        response = await call_next(request)
        if response.status_code >= 500:
            logger.error("REQ %s %s → %s", request.method, request.url, response.status_code)
        return response
    except Exception as e:
        logger.error("REQ FAILED %s %s: %s", request.method, request.url, e)
        raise

# ── 集中式 Owner Guard（Phase 2b-I）────────────────────────────────────
# 解決：enforce_owner 只掛在 26/48 routers。這裡以「路徑規則」統一補上：
# 帶 JWT 的請求，路徑中的 user_id 必須等於 JWT 身分，否則 403。
# 只涵蓋「明確私有」的資料路徑；社群互看路徑（friends/squads/leaderboard/
# feed/profile 瀏覽）刻意不列，避免誤傷跨使用者功能。
# 註：Starlette middleware 後註冊者先執行 — 本函式註冊在 inject_user_id「之前」，
# 因此實際執行在其「之後」，request.state.user_id 已就緒。
import re as _re
from identity_guard import (
    CURRENT_USER_ID as _CURRENT_USER_ID,
    harden_identity as _harden_identity,
    reserved_user_segments as _reserved_user_segments,
)

# 🔴 修復（資安稽核 I-2 附帶）：原本的 r"^/api/user/(?P<uid>[^/]+)$" 會誤中
#    /api/user/profile、/api/user/goals、/api/user/initialize 等「動作型」單層
#    路徑，把 "profile" 當成 user_id 拿去比對 JWT，導致這些端點對所有人一律
#    401/403（onboarding 存不了 profile）。改成從 app 自己的路由表推導保留字，
#    之後新增 /api/user/xxx 端點也不會再踩到同一顆地雷。
_RESERVED_USER_SEGMENTS = _reserved_user_segments(app)
_USER_UID_ONLY = (
    r"^/api/user/(?!(?:"
    + "|".join(_re.escape(s) for s in _RESERVED_USER_SEGMENTS)
    + r")(?:/|$))(?P<uid>[^/]+)$"
) if _RESERVED_USER_SEGMENTS else r"^/api/user/(?P<uid>[^/]+)$"

_OWNER_ONLY_PATTERNS = [_re.compile(p) for p in (
    r"^/api/workout/(?:history(?:-legacy)?|last-weight|metrics|progress|today|with-inbody)/(?P<uid>[^/]+)",
    r"^/api/cardio/(?:sessions|today-summary)/(?P<uid>[^/]+)",
    r"^/api/cardio/(?P<uid>[^/]+)/(?:runs|stats)",
    r"^/api/cardio/analytics/[^/]+/(?P<uid>[^/]+)",
    r"^/api/cardio-plan/(?P<uid>[^/]+)/",
    # ⚠️ 以前是 r"^/api/nutrition/(?:sql/)?[^/]+/(?P<uid>[^/]+)" —— 太寬：
    #    /api/nutrition/sql/search、/sql/log、/sql/targets、/meal/{meal_id}
    #    都被當成「第二段是 user_id」，search／log／targets 被當成別人的 id → 一律 401/403。
    #    結果是食物資料庫搜尋、記一餐、設定目標、改刪一餐在正式環境全部失敗。
    #    現在只列真的帶 user_id 的路徑。
    r"^/api/nutrition/(?:sql/)?(?:daily|history|recent|recent-entries|targets)/(?P<uid>[^/]+)",
    r"^/api/nutrition/meals/(?P<uid>[^/]+)/",
    r"^/api/inbody/(?P<uid>[^/]+)/",
    r"^/api/history/(?:logs|stats)/(?P<uid>[^/]+)",
    r"^/api/strength/history/(?P<uid>[^/]+)",
    r"^/api/pr/(?P<uid>[^/]+)/",
    r"^/api/plan/(?P<uid>[^/]+)/(?:latest|today|schedule)$",
    r"^/api/plan-covers/(?P<uid>[^/]+)",
    r"^/api/program/(?P<uid>[^/]+)/",
    r"^/api/userdata/(?P<uid>[^/]+)/",
    r"^/api/user/(?:profile|goals|nutrition-goals|recovery|export|monthly-report|inbody-history|bmi-recommendation)/(?P<uid>[^/]+)",
    _USER_UID_ONLY,
    r"^/api/user/(?P<uid>[^/]+)/(?:radar|recovery-status)",
    r"^/api/dashboard/(?:insights|recovery)/(?P<uid>[^/]+)",
    r"^/api/review/(?:weekly|quarterly|system-status)/(?P<uid>[^/]+)",
    r"^/api/analysis/(?:insights|patterns)/(?P<uid>[^/]+)",
    r"^/api/recommendations?/[^/]+/(?P<uid>[^/]+)",
    r"^/api/recommend/(?P<uid>[^/]+)",
    r"^/api/ai/daily-insight/(?P<uid>[^/]+)",
    r"^/api/stats/pr-check/(?P<uid>[^/]+)",
    r"^/api/activity/(?:calendar|weekly)/(?P<uid>[^/]+)",
)]

@app.middleware("http")
async def owner_guard_middleware(request: Request, call_next):
    jwt_uid = getattr(request.state, "user_id", None)
    if request.method != 'OPTIONS':
        # Personalized AI endpoints accept user_id in JSON. Enforce the same
        # identity rule as path-based private endpoints before the handler runs.
        if request.url.path.startswith('/api/ai/') and request.method in ('POST', 'PUT', 'PATCH'):
            if not jwt_uid:
                return JSONResponse(status_code=401, content={"detail": "Authentication required"}, headers={"WWW-Authenticate": "Bearer"})
            try:
                raw = await request.body()
                import json as _json
                body = _json.loads(raw or b'{}')
                body_uid = body.get('user_id') if isinstance(body, dict) else None
                if body_uid and body_uid != jwt_uid:
                    return JSONResponse(status_code=403, content={"detail": "Forbidden: you can only access your own data"})
            except Exception:
                pass
        path = request.url.path
        for pat in _OWNER_ONLY_PATTERNS:
            m = pat.match(path)
            if m:
                if not jwt_uid:
                    return JSONResponse(status_code=401, content={"detail": "Authentication required"}, headers={"WWW-Authenticate": "Bearer"})
                if m.group("uid") != jwt_uid:
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Forbidden: you can only access your own data"},
                    )
                break
    return await call_next(request)


@app.middleware("http")
async def inject_user_id(request: Request, call_next):
    """
    JWT User-ID Injection Middleware
    ─────────────────────────────────────────────────────────────────
    Reads Authorization: Bearer <token> on every request, decodes the
    JWT (no DB lookup), and stores the user_id in request.state.user_id
    so any route handler can access the authenticated identity.

    Routes that already accept user_id via form / path / query continue
    to work unchanged — this just makes JWT identity available everywhere.
    """
    user_id_from_jwt = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from api_auth import verify_token
            payload = verify_token(auth_header.split(" ", 1)[1])
            user_id_from_jwt = (
                payload.get("id") or payload.get("sub") or payload.get("user_id")
            )
        except Exception:
            return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"}, headers={"WWW-Authenticate": "Bearer"})
    request.state.user_id = user_id_from_jwt
    # identity_guard 的包裝層靠這個 ContextVar 取得身分，
    # 這樣就不必為了拿 request 而改動每一支 handler 的簽章。
    _CURRENT_USER_ID.set(user_id_from_jwt)
    return await call_next(request)


def get_request_user_id(request: Request, form_user_id: str = None) -> str:
    """
    Helper used by route handlers to resolve the best available user_id.

    Priority:
      1. JWT user_id injected by middleware   (most authoritative)
      2. Explicit form / query / path user_id (backward-compat)
      3. Stable guest hash derived from client IP (last resort — never 'user_123')
    """
    jwt_uid = getattr(request.state, "user_id", None)
    if jwt_uid:
        return jwt_uid
    INVALID = {"user_123", "user1", "", "undefined", "null", None}
    if form_user_id not in INVALID:
        return form_user_id
    import hashlib
    ip = (request.client.host if request.client else "unknown").encode()
    return "guest_" + hashlib.md5(ip).hexdigest()[:12]

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 關鍵：將 DATA_DIR 移至 backend 以外，避免 Uvicorn 偵測到檔案變動而重啟 (Fix 503 Save Error)
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
RESULTS_DIR = os.path.join(DATA_DIR, "results")
TEMPLATE_PATH = os.path.join(DATA_DIR, "template.npz")
COACHES_PATH = os.path.join(DATA_DIR, "coaches.json")
USER_PROFILES_PATH = os.path.join(DATA_DIR, "user_profiles.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# 🧹 啟動時清理影片目錄（容量治理）：保留最新 N + 總量上限，避免 uploads/results 無限膨脹。
@app.on_event("startup")
def _startup_media_cleanup():
    try:
        from core.media_cleanup import prune_media_dirs
        prune_media_dirs(DATA_DIR)
    except Exception as _e:  # noqa: BLE001 — 清理失敗不可擋啟動
        print(f"[media_cleanup] startup prune skipped: {_e}")


# 🇹🇼 啟動時確保台灣食品成分資料庫（TFDA）在庫裡。
# 沒有這一步，正式環境的 food_items 會是空表，中文搜尋只能落到
# 「機器翻譯 → 美國 USDA API」，回來的是英文罐頭名稱（實測踩過）。
# seed_tfda() 本身是冪等的：已經有資料就直接跳過，不覆蓋任何使用者資料。
@app.on_event("startup")
def _startup_seed_tfda():
    try:
        from core.tfda_seed import seed_tfda
        print(f"[tfda_seed] {seed_tfda()}")
    except Exception as _e:  # noqa: BLE001 — 種子失敗不可擋啟動
        print(f"[tfda_seed] skipped: {_e}")


# ═══════════════════════════════════════════════════════════════════
# 動作分析回饋文字 — 依分數分級給出貼近實際的中文評語
# 取代原本「>=70 就是 Great job」的二分法與中英混雜用語。
# ═══════════════════════════════════════════════════════════════════
def _build_metric_feedback(label, tip, score):
    """依單一指標分數產生分級回饋。
    tip = (標題, 問題描述, 修正建議)，沿用各動作 config 中的 tips。
    分級：優秀 (>=85) / 良好 (70-84) / 待加強 (55-69) / 需修正 (<55)。"""
    sc = float(score)
    title = tip[0]
    problem = tip[1]   # 問題描述（分數偏低時使用）
    fix = tip[2]       # 修正建議

    if sc >= 85:
        return {
            "rep": 0, "type": "success", "title": title,
            "desc": "這個指標表現優異，動作軌跡與教練示範高度吻合。",
            "fix": "維持目前的動作品質即可。",
            "score": sc, "level": "excellent",
        }
    if sc >= 70:
        return {
            "rep": 0, "type": "success", "title": title,
            "desc": "整體掌握良好，動作大致到位，僅有些微可優化空間。",
            "fix": "持續對照教練示範曲線，讓動作更穩定一致。",
            "score": sc, "level": "good",
        }
    if sc >= 55:
        return {
            "rep": 0, "type": "warning", "title": title,
            "desc": problem,
            "fix": fix,
            "score": sc, "level": "fair",
        }
    return {
        "rep": 0, "type": "error", "title": title,
        "desc": problem,
        "fix": f"優先改善這個項目：{fix}",
        "score": sc, "level": "needs_work",
    }


# ═══════════════════════════════════════════════════════════════════
# 動作偵測歷史 — 統一以 user_id 制寫入 user_{id}_history.json
# 這是前端 GET /api/workout/history/{user_id} 讀取的同一個檔案，
# 確保動作偵測流程與系統其他功能一樣綁定 user_id。
# ═══════════════════════════════════════════════════════════════════
def build_motion_record(exercise_key, exercise_name, overall_score, radar_data,
                        reps_count, charts_data, feedback,
                        ar_url=None, duration_seconds=0, rep_segments=None):
    """組裝一筆動作偵測歷史紀錄（欄位對齊前端 ResultViewMobile）。"""
    now = datetime.now()
    return {
        "session_id": f"motion_{now.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}",
        "timestamp": now.isoformat(),
        "type": "motion_analysis",
        "exerciseKey": exercise_key,
        "exerciseName": exercise_name,
        "overall_score": int(round(overall_score)),
        # metrics 存成 {指標名: 分數}，前端歷史趨勢圖會直接攤平使用
        "metrics": {item["subject"]: item["A"] for item in (radar_data or [])},
        "reps_count": int(reps_count),
        "duration_seconds": int(duration_seconds),
        "chartsData": charts_data or [],
        "feedback": feedback or [],
        "arVideoUrl": ar_url,
        "repSegments": rep_segments or [],   # 每個 rep 的起訖秒數（供 AR 計次）
    }


def append_motion_session(user_id, record):
    """把動作偵測分析結果寫入該使用者專屬的歷史檔。回傳是否成功。"""
    try:
        hist_file = os.path.join(DATA_DIR, f"user_{user_id}_history.json")
        records = []
        if os.path.exists(hist_file):
            try:
                with open(hist_file, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    records = loaded if isinstance(loaded, list) else []
            except Exception:
                records = []
        records.insert(0, record)   # 最新一筆排最前（與 /api/workout/save 一致）
        save_json_atomic(hist_file, records, indent=2)
        logger.info(f"[motion-history] 已寫入 {user_id}: {record.get('session_id')}")
        return True
    except Exception as e:
        logger.warning(f"[motion-history] 寫入失敗（非致命）: {e}")
        return False


# Initialize Social Storage
social_storage = social.SocialStorage(DATA_DIR)

# Mount static for videos
app.mount("/static", StaticFiles(directory=DATA_DIR), name="static")

# 🖼️ 系統預設圖庫（社團封面等）。
# ⚠️ 刻意不放 DATA_DIR：那是 Railway Volume，內容會隨環境不同而不同，
#    新環境第一次啟動時是空的 —— 使用者就會看到沒有封面的社團。
#    這批是「系統一定會有」的圖，跟著映像檔走才不會掉。
SQUAD_ASSETS_DIR = os.path.join(BASE_DIR, "assets", "squad_covers")
os.makedirs(SQUAD_ASSETS_DIR, exist_ok=True)
app.mount("/squad-assets", StaticFiles(directory=SQUAD_ASSETS_DIR), name="squad_assets")

@app.get("/")
def read_root():
    return {"status": "AI Fitness Coach API Ready"}


# ── 健康檢查探針（容器 / 負載平衡 / 上架平台用）─────────────────────
def _db_kind(url: str) -> str:
    """只回「哪一種資料庫」，永遠不回連線字串 —— 裡面有帳號密碼。"""
    u = (url or "").lower()
    if u.startswith("postgres"):
        return "postgres"
    if u.startswith("sqlite"):
        return "sqlite"
    return "other"


@app.get("/healthz", tags=["health"])
def healthz():
    """Liveness：進程活著就回 200，不碰任何外部相依。

    順便回報「這台在用哪一種資料庫」—— 部署平台上 Postgres 服務開著、
    但 DATABASE_URL 忘了接上去，是最容易發生又最難從外面看出來的事。
    只回種類，不回連線字串。
    """
    return {
        "status": "ok",
        "env": settings.APP_ENV,
        "db": _db_kind(settings.DATABASE_URL),
        "users_db": _db_kind(settings.USERS_DB_URL),
    }


@app.get("/readyz", tags=["health"])
def readyz():
    """Readiness：確認可連到資料庫後才回 200（供部署平台判斷是否導流）。"""
    from sqlalchemy import text
    from core.database import engine
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready", "db": "ok"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "not_ready", "db": str(e)})

# [EXTRACTED Phase1] 影片上傳 + 多動作姿勢分析 (/upload/*, /api/multi-exercise/*, /api/analyze_set + _ANALYSIS_JOBS/helpers) → api_pose_analysis.py


# [EXTRACTED Phase1] /api/exercise-configs → api_exercise_configs.py


# ============ Coach Management Routes ============

# [EXTRACTED Phase1] /api/coaches/* → api_coaches.py


# ============ User Profile Routes ============

# ============================================================================
# [EXTRACTED] User Profile Core API
#   /api/user/initialize, /api/user/profile, /api/user/profile/avatar,
#   /api/user/profile/{user_id}, /api/user/profiles, /api/user/{user_id} (DELETE),
#   /api/user/delete, /api/user/monthly-report/{user_id}
#   (+ models UserEvolutionProfile / UserProfileResponse)
#   → Moved to api_user_profile.py (api_user_profile.router)
# ============================================================================


# ============ InBody History & BMI Routes ============

# ============ [EXTRACTED] User InBody Records ============
#   /api/user/inbody-history/{user_id}, /api/user/bmi-recommendation/{user_id},
#   /api/user/inbody-record (POST), /api/user/inbody-record/{record_id} (PUT/DELETE)
#   → Moved to api_user_inbody.py (api_user_inbody.router)

# ============ Weather Routes ============

# ============ Recommendation Routes ============
# [EXTRACTED Phase1] /api/recommendations/* → api_recommendations.py
# [EXTRACTED] /api/weather, /api/recommend/{user_id}, /api/user/body-analysis/{user_id},
#             /api/personality/classify → api_misc.py (api_misc.router)


# ============ Workout History Routes ============

# ============================================================================
# [EXTRACTED] Workout History / Metrics / Analysis API
#   /api/workout/history-legacy/{user_id}, /api/workout/with-inbody/{user_id}/{session_id},
#   /api/workout/progress/{user_id}, /api/workout/history/{user_id}/{workout_id} (PUT/DELETE),
#   /api/workout/history/delete (POST), /api/workout/metrics/{user_id}(/{metric_name}),
#   /api/workout/custom_plan, /api/analysis/patterns|insights|predict-goal
#   (+ helper _delete_workout_record, model CustomPlanRequest)
#   → Moved to api_workout.py (api_workout.router)
# ============================================================================

# [EXTRACTED] /api/dashboard/insights/{user_id} → api_dashboard.py

# ============ Gamification & Achievements Routes ============

# [EXTRACTED] /api/achievements/{user_id} (+ available, user/{user_id}, check)
#   → Moved to api_achievements.py (api_achievements.router)
#   ⚠️ 路由順序遮蔽 bug 已於該檔修復（available 排在 {user_id} 之前）

# [EXTRACTED] /api/stats/pr-check/{user_id} → api_misc.py

# ============ Activity Log Routes ============

# [EXTRACTED] /api/activity/manual, /api/activity/calendar, /api/activity/weekly
#   → Moved to api_activities.py (api_activities.router)

# ============ [EXTRACTED] Goals Routes ============
#   /api/user/goals (POST), /api/user/goals/{user_id} (GET)
#   → Moved to api_user_goals.py (api_user_goals.router)

# [dedup] 移除重複死碼 GET /api/achievements/{user_id}（FastAPI 取先註冊者，此版本永不執行）
# --- Nutrition Tracking ---

# [EXTRACTED Phase1] /api/nutrition/* (檔案版, +MealLogBox/MealUpdateRequest) → api_nutrition.py

# [EXTRACTED Phase1] /api/history/log_routine|stats (+RoutineInput) → api_history.py

# [EXTRACTED Phase1] /api/program/* (+program_generator import) → api_program.py

# [EXTRACTED Phase1] Cardio Tracking APIs (/api/cardio/save|runs|stats|today-summary + cardio_tracker import) → api_cardio_tracking.py
# [EXTRACTED Phase1] /api/pr/* (+pr_tracker import) → api_pr.py

# [EXTRACTED Phase1] /api/inbody/{user_id}/score → api_inbody.py

# ==================== Hashtag Pool & Radar APIs ====================
# [EXTRACTED Phase1] /api/hashtags/* → api_hashtags.py
# [EXTRACTED] /api/user/radar-profile, /api/user/{user_id}/radar, /api/radar/ideal-shape
#   (+ models InBodyData / RadarProfileRequest / IdealShapeRequest
#    + from core.hashtag_pool import calculate_ideal_radar_shape)
#   → Moved to api_user_scoring.py (api_user_scoring.router)

# ==================== Phase 2: 4-Week Workout Plan Generation ====================
from core.workout_generator import generate_4_week_plan, get_plan_summary

# [EXTRACTED Phase1] /api/plan/generate|{plan_id}|*_legacy (+2 models) → api_plan_legacy.py


# [EXTRACTED Phase1] Cardio Tracking Endpoints (/api/cardio/session 等 7 條 + CardioSessionRequest) → api_cardio_sessions.py




# ==================== Strength Progress Endpoints ====================

# [EXTRACTED Phase1] /api/strength/* (+models) → api_strength.py

# [EXTRACTED Phase1] /api/workout/today|modify|confirm-modification (+models) → api_workout_modify.py

# ============ Action-First Dashboard Routes ============
# 已改為正規 router 載入（取代舊的 exec()）。實際 include 在檔案頂部的
# router 區塊統一處理；此處保留註解標記原本位置。
try:
    import routes_action_dashboard
    app.include_router(routes_action_dashboard.router)
    print("[SUCCESS] Action Dashboard routes loaded successfully")
except Exception as e:
    print(f"[WARNING] Failed to load action dashboard routes: {e}")

# ===== Initial Score Calculation Endpoint =====

# ⚠️ TEMPORARILY DISABLED - core/calculate_initial_scores.py 並未定義 calculate_initial_scores，
#    啟用此 import 會在啟動時就 ImportError 整個後端崩潰、所有路徑進不去。
#    維持注釋以確保後端正常啟動（此 endpoint 本就未完成，下方呼叫已加保護）。
from core.calculate_initial_scores import (
    # calculate_initial_scores,
    Gender,
    SleepQuality
)

# [EXTRACTED] /api/user/initial-score (+ model InitialScoreRequest)
#   → Moved to api_user_scoring.py (api_user_scoring.router)
#   (原 main.py 重複死碼版本的 IdealShapeRequest / RadarProfileRequest 一併清除)

# ============ Hashtag & Radar Profile Routes ============

# [EXTRACTED Phase1] CARDIO HR/Pace 區段 (hr-zones|analyze-hr-session|analyze-pace|mock-data + models) → api_cardio_hr_pace.py
# ============ Workout Plan Generation Routes ============
# exec(open(os.path.join(os.path.dirname(__file__), 'api_plan_endpoints.py'), encoding='utf-8').read())

# ============ Action-First Dashboard Routes ============
# ============ Recovery Routes ============
# [EXTRACTED] /api/user/recovery/{user_id} → api_user_scoring.py (api_user_scoring.router)

# ============ Segments & Leaderboards (Strava-style) ============

# Initialize segment storage
# [EXTRACTED Phase1] segment_storage / segment_matcher 單例 → api_segments.py

# [EXTRACTED Phase1] /api/segments/* (create/nearby/leaderboard/efforts/detect…) → api_segments.py


# ============ Cardio Analysis Endpoints (Mock/Placeholder) ============

# [dedup] 移除重複死碼 POST /api/cardio/hr-zones（FastAPI 取先註冊者，此版本永不執行）
# [dedup] 移除重複死碼 POST /api/cardio/analyze-hr-session（FastAPI 取先註冊者，此版本永不執行）
# [dedup] 移除重複死碼 POST /api/cardio/analyze-pace（FastAPI 取先註冊者，此版本永不執行）
# [EXTRACTED Phase1] /api/ai/* → api_ai_insights.py (api_ai_insights.router)


# [EXTRACTED] /api/activities/feed, /api/feed/global
#   → Moved to api_activities.py (api_activities.router)


# [EXTRACTED Phase1] /api/leaderboard/* (+user_leaderboard_data 全域, LeaderboardUpdate) → api_leaderboard.py

# [EXTRACTED] /api/activities/user, /api/activities/create, PUT/DELETE /api/activities/{id},
#   /api/activities/{id}/like, /api/activities/{id}/kudos, /api/activities/{id}/comments
#   → Moved to api_activities.py (api_activities.router)


# ============================================================================
# [EXTRACTED] Achievement System API
#   /api/achievements/available, /api/achievements/user/{user_id},
#   /api/achievements/check  → Moved to api_achievements.py
# ============================================================================

# ============================================================================
# Challenge System API
# ============================================================================

from core import challenges
from core import challenge_templates

# [EXTRACTED Phase1] /api/challenges/* (9 條 + ChallengeCreate/ProgressUpdate) → api_challenges.py
# ==================== Challenge API Models ====================

class ChallengeResponse(BaseModel):
    challenge_id: str
    name: str
    description: str
    goal_value: float
    goal_type: str
    current_progress: float
    completed: bool
    badge_earned: bool
    badge_icon: str
    end_date: str
    status: str = "active"
    # Additional fields for UI
    participants_count: int = 1
    days_left: int = 0

# ⚠️ 已移除重複死碼：/api/challenges/join-template
#    （已在 line ~6685 先註冊，FastAPI 取第一個，此版本永不執行）


# [dedup] 移除重複死碼 GET /api/challenges/active（FastAPI 取先註冊者，此版本永不執行）
# -----------------------------
# Segments API
# -----------------------------

# Use the new explicit MOCK storage as requested

async def leave_challenge_handler(user_id: str, challenge_id: str):
    """Leave an active challenge"""
    try:
        success = challenges.challenge_manager.leave_challenge(challenge_id, user_id)
        if not success:
             raise HTTPException(status_code=404, detail="Challenge not found or user not participant")
             
        return {"success": True, "message": "Successfully left the challenge"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error leaving challenge: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Keep old create endpoint for backward compatibility (but hide from UI)
# [dedup] 移除重複死碼 POST /api/challenges/create（FastAPI 取先註冊者，此版本永不執行）
# [dedup] 移除重複死碼 POST /api/challenges/{challenge_id}/join（FastAPI 取先註冊者，此版本永不執行）
# [dedup] 移除重複死碼 POST /api/challenges/{challenge_id}/leave（FastAPI 取先註冊者，此版本永不執行）
# [dedup] 移除重複死碼 GET /api/challenges/{challenge_id}/progress（FastAPI 取先註冊者，此版本永不執行）
class ProgressUpdate(BaseModel):
    user_id: str
    activity_data: Dict


# [dedup] 移除重複死碼 POST /api/challenges/{challenge_id}/update-progress（FastAPI 取先註冊者，此版本永不執行）
# -----------------------------
# Segment System API
# -----------------------------


# ⚠️ 已移除重複死碼：/api/segments/create 與 /api/segments/nearby
#    這兩條在 line ~5794/5810 已用 segment_storage 版本先註冊，FastAPI 只採用
#    先註冊者，故此處 segment_manager 版本永遠不會執行。保留下方 get-by-id（唯一獨有）。

# [EXTRACTED Phase1] GET /api/segments/{segment_id} → api_segments.py

# ⚠️ 已移除重複死碼：PUT/DELETE /api/segments/{segment_id}
#    （已在 line ~5885/5876 用 segment_storage 版本先註冊，此處永不執行）

# ══════════════════════════════════════════════════════════════
# [EXTRACTED] PLAN & FUSION CARD COVER IMAGE STORAGE
#   /api/plan-covers/{user_id} (GET/POST) + COVERS_DIR
#   → Moved to api_plan_covers.py (api_plan_covers.router)
# ══════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════
# 全域身分攔截（資安稽核 Step 2 / 修復 I-1、I-2）
#   凡是 handler 吃 user_id / operator_id 的路由，一律用 JWT 的身分覆蓋
#   前端傳來的值。必須在所有 include_router() 與 @app.<verb> 之後呼叫。
#   例外清單與 report 模式的說明見 identity_guard.py。
# ══════════════════════════════════════════════════════════════════════
_harden_identity(app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
