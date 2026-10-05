"""
api_workout_modify.py — 今日課表 / AI 課表調整 (Workout Modify) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/workout/today、/api/workout/modify、/api/workout/confirm-modification
依賴：core.workout_modifier（route 內 local import）
"""
from typing import Optional
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard

router = APIRouter(tags=["workout-modify"])


# ===== AI Workout Modification Endpoints =====

class WorkoutModificationRequest(BaseModel):
    user_id: str
    original_plan_id: str
    modification_type: str
    target_bodypart: Optional[str] = None

class ConfirmModificationRequest(BaseModel):
    user_id: str
    modified_plan: dict
    original_plan_id: str

@router.get("/api/workout/today/{user_id}", dependencies=[Depends(owner_guard)])
async def get_today_workout(user_id: str):
    """[已停用] 舊端點回傳寫死示範課表，前端已改用 /api/plan/{user_id}/latest 取真實計劃。
    保留路由但回 410，避免任何舊呼叫拿到假資料當真。"""
    raise HTTPException(
        status_code=410,
        detail="Deprecated. Use /api/plan/{user_id}/latest for the real plan."
    )

@router.post("/api/workout/modify")
async def modify_workout_endpoint(request: WorkoutModificationRequest):
    """AI generate alternative workout plan"""
    try:
        from core.workout_modifier import modify_workout, ModificationType, generate_comparison
        
        original_plan_response = await get_today_workout(request.user_id)
        
        try:
            mod_type = ModificationType(request.modification_type.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid modification type: {request.modification_type}")
        
        modified_plan = modify_workout(
            original_plan=original_plan_response,
            modification_type=mod_type,
            user_hashtags=[],
            target_bodypart=request.target_bodypart
        )
        
        comparison = generate_comparison(original_plan_response, modified_plan)
        
        return {"success": True, "original": original_plan_response, "modified": modified_plan, "comparison": comparison}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/workout/confirm-modification")
async def confirm_modification(request: ConfirmModificationRequest):
    """Confirm and save user's modification choice"""
    try:
        return {"success": True, "message": "Workout updated", "active_plan": request.modified_plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
