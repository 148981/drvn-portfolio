"""
api_misc.py — 零散獨立小路由集合（Phase 1 抽出，行為不變）
收錄彼此無強耦合、且依賴單純的單條路由：
  /api/weather                      天氣與訓練建議（core.weather_service）
  /api/recommend/{user_id}          綜合訓練 + 飲食建議（core.coach_profile）
  /api/user/body-analysis/{user_id} 體組成分析（core.coach_profile）
  /api/personality/classify         健身人格分類（core.personality_classifier）
  /api/stats/pr-check/{user_id}     個人紀錄檢查（core.workout_history）

備註：/api/exercise-configs（相依 multi_exercise 重模組）與
      /api/radar/ideal-shape（與 radar-profile model 糾纏）留待對應大塊一起抽。
"""
from fastapi import APIRouter, Form, Depends
from auth_guard import owner_guard
from fastapi.responses import JSONResponse

import core.coach_profile as coach_profile
import core.workout_history as workout_history

router = APIRouter(tags=["misc"])


# ============ Weather ============

@router.get("/api/weather")
async def get_current_weather(lat: float = None, lon: float = None):
    """Get current weather and training advice"""
    from core.weather_service import WeatherService
    return WeatherService.get_current_weather(lat, lon)


# ============ Recommendation (combined) ============

@router.get("/api/recommend/{user_id}", dependencies=[Depends(owner_guard)])
async def get_combined_recommendations(user_id: str):
    """Get both workout and meal recommendations in one call (for frontend compatibility)"""
    workout = coach_profile.get_workout_recommendations(user_id)
    meal = coach_profile.get_meal_recommendations(user_id)

    if workout is None and meal is None:
        return JSONResponse(status_code=404, content={"error": "Profile not found"})

    return {
        "user_id": user_id,
        "workout_recommendation": workout,
        "meal_recommendation": meal
    }


@router.get("/api/user/body-analysis/{user_id}", dependencies=[Depends(owner_guard)])
async def get_body_analysis(user_id: str):
    """Get body composition analysis"""
    analysis = coach_profile.get_body_composition_analysis(user_id)
    if analysis is None:
        return JSONResponse(status_code=404, content={"error": "Profile not found"})
    return {"user_id": user_id, "analysis": analysis}


# ============ Fitness Personality ============

@router.post("/api/personality/classify")
async def classify_personality(
    training_records: str = Form(...)  # JSON string of training records
):
    """
    Classify user's fitness personality based on training patterns
    Expects training_records in localStorage format
    """
    try:
        from core.personality_classifier import classify_fitness_personality
        import json

        # Parse training records
        records = json.loads(training_records) if training_records else {}

        # Classify personality
        result = classify_fitness_personality(records, weeks=4)

        return {
            "status": "success",
            "personality": result
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


# ============ Stats: PR check ============

@router.get("/api/stats/pr-check/{user_id}", dependencies=[Depends(owner_guard)])
async def check_personal_record(user_id: str, current_score: float):
    """Check if current score is a new personal record"""
    try:
        history = workout_history.get_user_workout_history(user_id, limit=1000)
        if not history:
            return {
                "is_pr": True,
                "previous_best": 0,
                "improvement": current_score
            }

        scores = [w.get("overall_score", 0) for w in history]
        previous_best = max(scores)

        is_pr = current_score > previous_best
        improvement = current_score - previous_best if is_pr else 0

        return {
            "is_pr": is_pr,
            "previous_best": previous_best,
            "current_score": current_score,
            "improvement": improvement
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
