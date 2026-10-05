"""
api_strength.py — 肌力訓練紀錄 (Strength Records) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/strength/*
依賴：core.workout_history
"""
from typing import Optional
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard

import core.workout_history as workout_history

router = APIRouter(tags=["strength"])


class StrengthRecordRequest(BaseModel):
    user_id: str
    exercise_name: str
    training_weight: float
    pr_weight: float
    reps: Optional[int] = 0
    note: Optional[str] = None
    date: Optional[str] = None

@router.post("/api/strength/record")
async def save_strength_record(request: StrengthRecordRequest):
    """Save a strength training record"""
    try:
        record_data = {
            "exercise_name": request.exercise_name,
            "training_weight": request.training_weight,
            "pr_weight": request.pr_weight,
            "reps": request.reps,
            "note": request.note,
            "date": request.date or datetime.now().strftime('%Y-%m-%d')
        }
        
        record = workout_history.add_strength_record(request.user_id, record_data)
        
        return {
            "message": "Strength record saved successfully",
            "record": record
        }
    except Exception as e:
        print(f"Error saving strength record: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/strength/history/{user_id}", dependencies=[Depends(owner_guard)])
async def get_strength_history_api(user_id: str, exercise: Optional[str] = None):
    """Get strength history for a user, optionally filtered by exercise"""
    try:
        history = workout_history.get_strength_history(user_id, exercise)
        return history
    except Exception as e:
        print(f"Error fetching strength history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# [DEPRECATED] get_last_exercise_weight removed - using router version in api_plan_endpoints.py

class StrengthRecordUpdate(BaseModel):
    user_id: str
    date: Optional[str] = None
    training_weight: Optional[float] = None
    pr_weight: Optional[float] = None
    reps: Optional[int] = None
    note: Optional[str] = None

@router.delete("/api/strength/record/{record_id}")
async def delete_strength_record_api(record_id: str, user_id: str):
    """Delete a strength record"""
    try:
        success, message = workout_history.delete_strength_record(user_id, record_id)
        if not success:
            raise HTTPException(status_code=404, detail=message)
            
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting strength record: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/strength/record/{record_id}")
async def update_strength_record_api(record_id: str, update_data: StrengthRecordUpdate):
    """Update a strength record"""
    try:
        # Convert Pydantic model to dict, excluding None values
        updates = {k: v for k, v in update_data.dict().items() if v is not None and k != 'user_id'}
        
        success, result = workout_history.update_strength_record(update_data.user_id, record_id, updates)
        
        if not success:
            raise HTTPException(status_code=404, detail=str(result))
            
        return {
            "message": "Record updated successfully",
            "record": result
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating strength record: {e}")
        raise HTTPException(status_code=500, detail=str(e))
