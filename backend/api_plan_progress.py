"""
api_plan_progress.py — 專項計劃的完課紀錄（換裝置不失憶）

為什麼要有這支：
    「這份計劃我做到第幾次了」一直只存在 localStorage
    （plan_progress_<uid>_<planId>）。換手機、重灌 App、清快取，
    進度就整個歸零 —— 一個主打陪伴與長期進步的產品最不能失憶。

資料形狀（刻意扁平，前端怎麼存就怎麼傳）：
    {
      "<planId>": {
        "done":      [0, 1, 10, 11],      # globalIdx 陣列
        "started":   true,
        "updatedAt": "2026-09-21T08:00:00Z"
      }
    }

合併規則：**每份計劃各自比 updatedAt，新的贏**。
    不是整包覆蓋 —— 兩台裝置各自練不同計劃時，後上傳的那台
    不會把另一台的進度洗掉。沒帶 updatedAt 的視為最舊。
"""
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends
from fastapi.responses import JSONResponse

from auth_guard import owner_guard
from core.json_cache import load_json_cached, save_json_atomic

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STORE = os.path.join(DATA_DIR, "plan_progress.json")

router = APIRouter(tags=["plan-progress"])


def _load() -> Dict[str, Any]:
    data = load_json_cached(STORE, {})
    return data if isinstance(data, dict) else {}


# ⚠️ 用 Optional 不用 `| None`：專案的 venv 是 Python 3.9，
#    函式註解在 def 當下就會被求值，PEP 604 在 3.9 會直接 TypeError。
def _norm_plan(raw: Any) -> Optional[Dict[str, Any]]:
    """只留看得懂的欄位；形狀不對就當作沒有這筆，不要讓髒資料進檔案。"""
    if not isinstance(raw, dict):
        return None
    done = raw.get("done")
    if not isinstance(done, list):
        done = []
    # globalIdx 一律是非負整數，去重後排序 —— 順序不同不代表資料不同
    clean = sorted({int(x) for x in done if isinstance(x, (int, float)) and x >= 0})
    updated = raw.get("updatedAt")
    if not isinstance(updated, str):
        updated = ""
    return {
        "done": clean,
        "started": bool(raw.get("started")) or len(clean) > 0,
        "updatedAt": updated,
    }


@router.get("/api/user/plan-progress/{user_id}", dependencies=[Depends(owner_guard)])
async def get_plan_progress(user_id: str):
    try:
        return {"user_id": user_id, "plans": _load().get(user_id, {})}
    except Exception as e:
        print(f"[plan-progress] 讀取失敗: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.put("/api/user/plan-progress/{user_id}", dependencies=[Depends(owner_guard)])
async def put_plan_progress(user_id: str, body: dict = Body(...)):
    """每份計劃各自比 updatedAt，新的贏；回傳合併後的完整結果。"""
    try:
        incoming = body.get("plans")
        if not isinstance(incoming, dict):
            return JSONResponse(status_code=400,
                                content={"error": "plans 必須是物件"})

        store = _load()
        mine: Dict[str, Any] = dict(store.get(user_id, {}))
        now = datetime.now(timezone.utc).isoformat()

        for plan_id, raw in incoming.items():
            if not isinstance(plan_id, str) or not plan_id:
                continue
            new = _norm_plan(raw)
            if new is None:
                continue
            if not new["updatedAt"]:
                new["updatedAt"] = now
            old = _norm_plan(mine.get(plan_id))
            # 舊的比較新 → 保留舊的（另一台裝置剛剛才更新過）
            if old and old["updatedAt"] > new["updatedAt"]:
                continue
            mine[plan_id] = new

        store[user_id] = mine
        save_json_atomic(STORE, store)
        return {"status": "success", "user_id": user_id, "plans": mine}
    except Exception as e:
        print(f"[plan-progress] 寫入失敗: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
