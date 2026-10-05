"""
api_userdata.py — 通用 user-blob 端點（雲端備份/還原）
======================================================
前端 localStorage 資料（自訂 Block、自訂計劃…）的雲端備份。
offline-first：前端仍以 localStorage 為主，這裡只負責 push/pull。

對應前綴：/api/userdata/{user_id}/{key}
  · GET  → 取回雲端 blob（沒有則回 {data: null}）
  · POST → 覆寫雲端 blob（body = 任意 JSON）

key 白名單避免被當任意 KV 濫用。
"""
from fastapi import APIRouter, Depends, Request, HTTPException
from auth_guard import owner_guard

from repositories import user_blob_repo

router = APIRouter(tags=["userdata"])

ALLOWED_KEYS = {
    "workout_blocks",
    "custom_plans",
    # ── Year-1 資料保障（P1）：一年份使用者資產必須可雲端還原 ──
    "trainingRecords",       # 訓練紀錄（力量+有氧結算）
    "workout_history",       # 跑步/心肺完成紀錄
    "currentPlan",           # 當前融合計劃（含 _intensityLevel / season 標記）
    "season",                # Season 進度
    "completed_workouts",    # 各週完成狀態（week1-4 合併為一份 blob）
    "streak_meta",           # streak 與寬限（休息日卡）狀態
    "userProfile",           # 個人檔案/問卷結果
    "gym_memory",            # 健身房記憶（去過哪些健身房、器材有／沒有）
    "run_memory",            # 跑步地點與常跑路線
}


@router.get("/api/userdata/{user_id}/{key}", dependencies=[Depends(owner_guard)])
async def get_user_blob(user_id: str, key: str):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail="invalid key")
    try:
        data = user_blob_repo.get(user_id, key)
        return {"data": data}
    except Exception as e:  # noqa: BLE001
        # DB 不可用時不讓前端卡住（前端有 localStorage 後備）
        return {"data": None, "error": str(e)}


# ── P2：雲端保留完整歷史 ────────────────────────────────────────────
# 前端 localStorage 會把 trainingRecords 裁剪到 500 筆（QuotaExceeded 保護），
# 雲端這裡改用「合併」而非「覆寫」，讓被本地裁掉的舊紀錄仍保留在雲端。
MERGE_DICT_KEYS = {"trainingRecords"}          # {id: entry} 形狀 → key 聯集，新值優先
MERGE_LIST_KEYS = {"workout_history"}          # [entry] 形狀 → 以 id/timestamp 去重聯集
MERGE_LIST_CAP = 3000                          # 雲端上限（約 4-5 年量），防無限膨脹


def _merge_blob(key: str, old, new):
    """依 key 類型合併雲端舊資料與新資料；形狀不符時直接用新值。"""
    if key in MERGE_DICT_KEYS and isinstance(old, dict) and isinstance(new, dict):
        return {**old, **new}
    if key in MERGE_LIST_KEYS and isinstance(old, list) and isinstance(new, list):
        def _sig(item):
            if isinstance(item, dict):
                return item.get("id") or item.get("session_id") or item.get("timestamp") or json_dumps_safe(item)
            return str(item)
        seen = set()
        merged = []
        for item in list(new) + list(old):   # 新值優先
            s = _sig(item)
            if s in seen:
                continue
            seen.add(s)
            merged.append(item)
        return merged[:MERGE_LIST_CAP]
    return new


def json_dumps_safe(obj):
    import json
    try:
        return json.dumps(obj, sort_keys=True, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        return str(obj)


@router.post("/api/userdata/{user_id}/{key}", dependencies=[Depends(owner_guard)])
async def put_user_blob(user_id: str, key: str, request: Request):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail="invalid key")
    body = await request.json()
    data = body.get("data") if isinstance(body, dict) and "data" in body else body
    try:
        if key in MERGE_DICT_KEYS or key in MERGE_LIST_KEYS:
            try:
                old = user_blob_repo.get(user_id, key)
            except Exception:  # noqa: BLE001
                old = None
            data = _merge_blob(key, old, data)
        user_blob_repo.put(user_id, key, data)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
