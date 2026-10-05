"""
api_history.py — 訓練歷史日誌 (Workout History Logs) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/history/logs、/api/history/log/{session_id}  ｜ 依賴：core.workout_history
"""
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Request
from auth_guard import owner_guard


def _jwt_owner(request: Request) -> str:
    """🔴 資安修復：body 裡的 user_id 不可信（identity_guard 只覆蓋 handler 簽章上的參數，
    包在 Pydantic body 裡的 user_id 掃不到）。一律以 JWT 身分為準，沒有 JWT → 401。"""
    uid = getattr(request.state, "user_id", None)
    if not isinstance(uid, str) or not uid.strip():
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    return uid

import core.workout_history as workout_history

router = APIRouter(tags=["history"])


@router.get("/api/history/logs/{user_id}", dependencies=[Depends(owner_guard)])
async def get_workout_logs(user_id: str, limit: int = 50, offset: int = 0):
    """Get list of workout sessions for journal"""
    try:
        history = workout_history.get_user_workout_history(user_id, limit=limit + offset)
        # Apply offset manually since get_user_workout_history only supports limit
        logs = history[offset:]
        return {"logs": logs}
    except Exception as e:
        print(f"Error fetching logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class UpdateLogRequest(BaseModel):
    user_id: str
    updates: dict

@router.put("/api/history/log/{session_id}")
async def update_workout_log(session_id: str, request: UpdateLogRequest, http_request: Request):
    """Update a specific workout log"""
    # 只能改自己的紀錄：以 JWT 身分覆蓋 body.user_id
    owner = _jwt_owner(http_request)
    try:
        success, result = workout_history.update_workout_log(owner, session_id, request.updates)
        if success:
            return {"status": "success", "data": result}
        else:
            raise HTTPException(status_code=404, detail=result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating log: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/history/log/{session_id}")
async def delete_workout_log(session_id: str, user_id: str):
    """Delete a specific workout log"""
    try:
        success, message = workout_history.delete_workout_log(user_id, session_id)
        if success:
            return {"status": "success", "message": message}
        else:
            raise HTTPException(status_code=404, detail=message)
    except HTTPException:
        # 404 不要被下面吞成 500（前端靠狀態碼判斷「已不存在」）
        raise
    except Exception as e:
        print(f"Error deleting log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 訓練紀錄統計 / routine（Phase 1 一併併入本檔）──
class RoutineInput(BaseModel):
    user_id: str
    routine: dict

@router.post("/api/history/log_routine")
async def log_routine(data: RoutineInput, request: Request):
    """Log a completed Smart Routine"""
    owner = _jwt_owner(request)
    try:
        entry = workout_history.log_completed_routine(owner, data.routine)
        return entry
    except Exception as e:
        print(f"Error logging routine: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/history/stats/{user_id}", dependencies=[Depends(owner_guard)])
async def get_workout_stats(user_id: str):
    """Get workout accumulation stats"""
    try:
        # We might need to extend get_progress_stats to include routine data
        # For now, let's just return the existing structure
        stats = workout_history.get_progress_stats(user_id)
        # TODO: Enhance stats to include routine counts/calories
        return stats
    except Exception as e:
        print(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
