"""
api_user_goals.py — 使用者健身目標 (Fitness Goals) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/user/goals*  ｜ 依賴：core.coach_profile、core.workout_history
"""
import json
from core.json_cache import save_json_atomic
from datetime import datetime, timedelta

from fastapi import APIRouter, Form, Depends
from auth_guard import owner_guard
from fastapi.responses import JSONResponse

import core.coach_profile as coach_profile
import core.workout_history as workout_history

router = APIRouter(tags=["user-goals"])


@router.post("/api/user/goals")
async def set_user_goals(
    user_id: str = Form(...),
    primary_goal: str = Form(...),
    target_score: str = Form("90"),
    target_date: str = Form(None)
):
    """Set or update user fitness goals"""
    try:
        profile = coach_profile.get_user_profile(user_id)
        if not profile:
            return JSONResponse(status_code=404, content={"error": "Profile not found"})

        # Parse target_score - could be JSON string or simple number
        try:
            parsed_score = json.loads(target_score) if target_score.startswith('{') else int(target_score)
        except (ValueError, json.JSONDecodeError):
            parsed_score = 90

        goals = {
            "primary_goal": primary_goal,
            "target_score": parsed_score,
            "target_date": target_date or (datetime.now().date() + timedelta(days=90)).isoformat(),
            "set_at": datetime.now().isoformat()
        }

        # Update profile with goals
        profile["goals"] = goals

        # Save updated profile
        profiles = coach_profile.load_user_profiles()
        profiles[user_id] = profile

        save_json_atomic(coach_profile.USER_PROFILES_PATH, profiles, indent=2)
        return {"status": "success", "goals": goals}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/api/user/goals/{user_id}", dependencies=[Depends(owner_guard)])
async def get_user_goals(user_id: str):
    """Get user fitness goals"""
    try:
        profile = coach_profile.get_user_profile(user_id)
        if not profile:
            return JSONResponse(status_code=404, content={"error": "Profile not found"})

        goals = profile.get("goals", None)

        # Normalize goals if it's a list (legacy format)
        if isinstance(goals, list):
            goals = {"primary_goal": ",".join(goals), "target_score": 90}
        elif isinstance(goals, dict):
            goals = goals.copy()  # Avoid mutating the cached profile

        # Calculate progress if goals exist
        if goals:
            history = workout_history.get_user_workout_history(user_id, limit=1000)
            if history:
                scores = [w.get("overall_score", 0) for w in history]
                current_best = max(scores) if scores else 0

                # safely handle target_score (could be int, str, or dict)
                target = goals.get("target_score", 90)
                target_val = 90

                if isinstance(target, dict):
                    # If target is a dict of scores, we can't calculate a single progress %
                    # The frontend handles per-goal progress.
                    # We'll just use a dummy value here to avoid crash
                    target_val = 90
                elif isinstance(target, (int, float)):
                    target_val = int(target)
                elif isinstance(target, str):
                    if target.isdigit():
                        target_val = int(target)
                    else:
                        # Try to parse if it looks like json, otherwise default
                        try:
                            t = json.loads(target)
                            if isinstance(t, dict):
                                target_val = 90
                            else:
                                target_val = int(t)
                        except:
                            target_val = 90

                progress = min(100, int((current_best / target_val) * 100)) if target_val > 0 else 0

                goals["current_score"] = current_best
                goals["progress_percent"] = progress

        return {"user_id": user_id, "goals": goals}
    except Exception as e:
        print(f"Error in get_user_goals: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
