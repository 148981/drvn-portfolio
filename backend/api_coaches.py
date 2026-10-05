"""
api_coaches.py — 教練資料 / 配對 (Coaches) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/coaches/*
依賴：core.coach_profile
"""
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard
from fastapi.responses import JSONResponse

import core.coach_profile as coach_profile

router = APIRouter(tags=["coaches"])


@router.get("/api/coaches")
async def get_coaches():
    """Get all available coaches"""
    coaches = coach_profile.get_all_coaches()
    return {"coaches": coaches}

@router.get("/api/coaches/{coach_id}")
async def get_coach(coach_id: str):
    """Get specific coach details"""
    coach = coach_profile.get_coach_by_id(coach_id)
    if not coach:
        return JSONResponse(status_code=404, content={"error": "Coach not found"})
    return coach

@router.get("/api/coaches/match/{user_id}", dependencies=[Depends(owner_guard)])
async def get_coach_matches(user_id: str):
    """Get coaches with match scores for a user"""
    coach_matches = coach_profile.get_coach_recommendations(user_id)
    return {"coaches": coach_matches}
