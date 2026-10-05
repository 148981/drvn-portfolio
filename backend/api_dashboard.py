"""
api_dashboard.py — 智慧儀表板 (Smart Dashboard) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/dashboard/*  ｜ 依賴：core.recovery、core.insights、core.coach_profile
"""
from fastapi import APIRouter, Depends
from auth_guard import owner_guard

import core.recovery as recovery
import core.insights as insights
import core.coach_profile as coach_profile

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/recovery/{user_id}", dependencies=[Depends(owner_guard)])
async def get_recovery_status(user_id: str):
    """Get muscle recovery status (heatmap) for user"""
    fatigue = recovery.calculate_muscle_fatigue(user_id)
    return {"user_id": user_id, "fatigue_levels": fatigue}


@router.get("/api/dashboard/insights/{user_id}", dependencies=[Depends(owner_guard)])
async def get_insights(user_id: str):
    """Get predictions and knowledge tips"""
    forecast = insights.get_progression_forecast(user_id)

    # Get weaknesses for relevant tips
    profile = coach_profile.get_user_profile(user_id)
    weaknesses = []

    # If using inbody analysis (optional deeper integration later)
    # For now, we rely on stored data or re-analysis if easy.
    # To keep it fast, we'll just check if there are explicit weaknesses stored in profile?
    # Currently profile mainly stores raw data. Analysis happens on demand.
    # We will try a lightweight check or just fetch general tips.

    tips = insights.get_health_tips(weaknesses)

    return {
        "user_id": user_id,
        "forecast": forecast,
        "tips": tips
    }
