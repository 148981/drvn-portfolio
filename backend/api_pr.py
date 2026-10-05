"""
api_pr.py — 個人紀錄 (PR Tracking) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/pr/*  ｜ 依賴：core.pr_tracker（直接讀寫 data/）
"""
import math
import os
from auth_guard import owner_guard
from fastapi import APIRouter, HTTPException, Depends, Request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

router = APIRouter(tags=["pr"])


from core.pr_tracker import (
    PRSaveRequest,
    save_pr_record,
    get_user_prs
)

@router.post("/api/pr/save")
async def save_pr(data: PRSaveRequest, request: Request):
    """Save a PR record"""
    # 🔴 資安修復：body.user_id 不可信（identity_guard 掃不到 Pydantic body），以 JWT 為準
    uid = getattr(request.state, "user_id", None)
    if not isinstance(uid, str) or not uid.strip():
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    data.user_id = uid
    # 🔴 資料正確性：擋掉手滑／荒謬值（例如 2000kg、NaN），否則會變成永遠打不破的假 PR
    #    自體重動作（引體向上等）weight=0 是合法的
    if not math.isfinite(data.weight) or data.weight < 0 or data.weight > 600:
        raise HTTPException(status_code=422, detail="weight out of range")
    if data.reps < 1 or data.reps > 100:
        raise HTTPException(status_code=422, detail="reps out of range")
    try:
        result = save_pr_record(data, DATA_DIR)
        return result
    except Exception as e:
        print(f"Error saving PR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/pr/{user_id}/records", dependencies=[Depends(owner_guard)])
async def get_pr_records(user_id: str):
    """Get all PR records for user"""
    try:
        records = get_user_prs(user_id, DATA_DIR)
        return records
    except Exception as e:
        print(f"Error getting PR records: {e}")
        raise HTTPException(status_code=500, detail=str(e))
