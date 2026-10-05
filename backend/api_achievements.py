"""
api_achievements.py — 成就 / 徽章 (Achievements) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/achievements/*  ｜ 依賴：core.achievements、core.gamification、core.workout_history

⚠️ 路由順序修復（零號協定）：
原 main.py 中 `/api/achievements/{user_id}` 先被註冊，會搶先匹配掉
`/api/achievements/available` 與 `/api/achievements/user/{user_id}`，導致這兩條永遠進不去。
這裡將「靜態 / 較具體」的路由排在「動態 {user_id}」之前，確保正確匹配。
"""
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

import core.gamification as gamification
import core.workout_history as workout_history
from core import achievements

router = APIRouter(tags=["achievements"])


# --- 靜態 / 具體路由優先（修復遮蔽 bug）---

@router.get("/api/achievements/available")
async def get_available_achievements():
    """Get all available achievements"""
    try:
        all_achievements = achievements.get_all_achievements()
        return {"achievements": all_achievements, "total": len(all_achievements)}
    except Exception as e:
        print(f"Error getting achievements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/achievements/user/{user_id}")
async def get_user_achievements(user_id: str):
    """Get user's unlocked achievements with progress"""
    try:
        # Get user's workout history
        workouts = workout_history.get_user_workout_history(user_id, limit=1000)

        # Calculate user stats
        user_stats = achievements.calculate_user_stats(workouts)

        # Get achievement progress
        progress = achievements.get_achievement_progress(user_stats)

        # Separate unlocked and locked
        unlocked = [a for a in progress if a.get('unlocked')]
        locked = [a for a in progress if not a.get('unlocked')]

        # 🔴 移除：原本「沒解鎖任何成就」時塞 4 枚假的已解鎖徽章（含假日期）當真實資料回傳，
        #    新使用者會看到自己沒做過的成就。新使用者就該是 0 枚。

        return {
            "user_id": user_id,
            "total_points": sum(a.get('reward_points', 0) for a in unlocked),
            "unlocked_count": len(unlocked),
            "total_count": len(progress),
            "unlocked": unlocked,
            "locked": locked,
            "user_stats": user_stats
        }
    except Exception as e:
        print(f"Error getting user achievements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/achievements/check")
async def check_new_achievements(user_id: str, activity_data: Optional[Dict] = None):
    """Check for newly unlocked achievements after an activity"""
    try:
        # Get user's workout history
        workouts = workout_history.get_user_workout_history(user_id, limit=1000)

        # Calculate updated user stats
        user_stats = achievements.calculate_user_stats(workouts)

        # Check for new achievements
        newly_unlocked = achievements.check_achievements(user_id, user_stats)

        return {
            "newly_unlocked": newly_unlocked,
            "count": len(newly_unlocked),
            "total_points_earned": sum(a.get('reward_points', 0) for a in newly_unlocked)
        }
    except Exception as e:
        print(f"Error checking achievements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- 動態 {user_id} 路由放最後（避免搶先匹配上面的具體路由）---

@router.get("/api/achievements/{user_id}")
async def get_achievements(user_id: str):
    """Get achievements and badges for a user"""
    try:
        history = workout_history.get_user_workout_history(user_id, limit=1000)
        achievements_data = gamification.get_user_achievements(user_id, history)
        return {
            "user_id": user_id,
            **achievements_data
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
