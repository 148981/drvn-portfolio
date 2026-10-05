"""
api_recommendations.py — 訓練 / 餐食推薦 路由（Phase 1 抽出，行為不變）
對應前綴：/api/recommendations/*  ｜ 依賴：core.coach_profile
"""
from fastapi import APIRouter, Depends
from auth_guard import owner_guard
from fastapi.responses import JSONResponse

import core.coach_profile as coach_profile

router = APIRouter(tags=["recommendations"])


@router.get("/api/recommendations/workout/{user_id}", dependencies=[Depends(owner_guard)])
async def get_workout_recommendations(user_id: str):
    """Get workout recommendations"""
    recommendations = coach_profile.get_workout_recommendations(user_id)
    if recommendations is None:
        return JSONResponse(status_code=404, content={"error": "Profile not found"})
    return {"user_id": user_id, "recommendations": recommendations}

@router.get("/api/recommendations/meal/{user_id}", dependencies=[Depends(owner_guard)])
async def get_meal_recommendations(user_id: str):
    """Get meal plan recommendations"""
    meal_plan = coach_profile.get_meal_recommendations(user_id)
    if meal_plan is None:
        return JSONResponse(status_code=404, content={"error": "Profile not found"})
    return {"user_id": user_id, "meal_plan": meal_plan}
