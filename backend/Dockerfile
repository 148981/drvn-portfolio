# ============================================================
# DRVN 後端正式映像檔
# build:  docker build -t drvn-backend ./backend
# run:    docker run --env-file backend/.env -p 8000:8000 drvn-backend
# 多半透過根目錄 docker-compose.yml 啟動（含 Postgres 選項）。
# ============================================================
FROM python:3.11-slim AS base

# mediapipe / opencv 需要的系統函式庫
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# 🩹 K: 時間基準單一化 — 全後端以 UTC 為準（datetime.now() == utcnow()）。
# codebase 內 now()(15處) 與 utcnow()(33處) 並存，顯式釘死 TZ 讓兩者永遠等值，
# 「跟自己比 30 分鐘剔除」等跨檔比較不會因換部署環境的系統時區而漂移。
# 顯示層時區轉換一律在前端做（utils/localDate.js）。
ENV TZ=UTC \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_ENV=production

WORKDIR /app

# 先只複製需求檔，善用 layer 快取（程式碼改動時不必重裝套件）
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# 再複製其餘程式碼
COPY . .

# 建立資料目錄。
# 不同模組算 DATA_DIR 的相對層級不一致，可能指向 /app/data 或容器根的 /data。
# 注意：Railway 的 Volume 掛到 /data 時擁有者是 root，非 root 使用者會寫不進去
# （PermissionError）。測試階段直接以 root 執行，確保 Volume 一定可寫；
# 之後要嚴謹再用 entrypoint chown 後降權。
RUN mkdir -p /app/data /data

# Railway / 雲端平台會用 $PORT 動態指定對外埠；本地預設 8000。
ENV PORT=8000
EXPOSE 8000

# 容器健康檢查：打 /healthz（用 $PORT，與實際監聽埠一致）
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/healthz" || exit 1

# 用 shell form 讓 ${PORT} 能被展開（Railway 動態埠必須）。
# 先用單一 worker：多 worker 啟動時會同時跑 create_all() 建表，
# 造成 Postgres UniqueViolation (pg_type ... 競爭)。單 worker 啟動穩定，
# 測試/小流量階段足夠；之後要擴充再改用 migration 後開多 worker。
#
# 🗄️ 持久化統一（P0）：Railway Volume 掛在 /data。
# 但多數模組（config.DATA_DIR）寫 /app/data，少數寫 /data ——
# 啟動時把 /app/data「軟連結」到 /data，讓兩條路徑指向同一顆 Volume：
#   1. 先把映像檔內建的種子資料補進 Volume（cp -n：絕不覆蓋既有使用者資料）
#   2. 刪掉映像檔的 /app/data，建立 symlink /app/data → /data
# 之後不論模組算出哪條路徑，實體都落在 Volume，重新部署資料不再消失。
CMD mkdir -p /data && \
    if [ ! -L /app/data ]; then \
        cp -rn /app/data/. /data/ 2>/dev/null || true; \
        rm -rf /app/data && ln -s /data /app/data; \
    fi && \
    uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1
