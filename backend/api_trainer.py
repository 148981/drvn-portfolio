"""
api_trainer.py — 智能教練 / 動作庫 (Smart Trainer & Exercises) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/trainer/*、/api/exercises/all、/api/exercises/filter
依賴：core.smart_trainer、core.coach_profile
"""
import json
from typing import List

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Form
from fastapi.responses import JSONResponse

import core.smart_trainer as smart_trainer
import core.coach_profile as coach_profile

router = APIRouter(tags=["trainer"])


@router.post("/api/trainer/generate")
async def generate_smart_workout(
    time_mins: int = Form(...),
    energy_level: str = Form(...),
    target_part: str = Form(...),
    fitness_level: str = Form("beginner"),
    include_exercises: str = Form(None)
):
    """Generate instant smart workout"""
    included = []
    if include_exercises:
        try:
            included = json.loads(include_exercises)
        except:
            pass
            
    plan = smart_trainer.generate_instant_workout(
        time_mins, energy_level, target_part, fitness_level, included
    )
    return plan

@router.get("/api/trainer/exercises/{target_part}")
async def get_trainer_exercises(target_part: str):
    """Get all exercises for a target part"""
    return smart_trainer.get_available_exercises(target_part)

@router.get("/api/exercises/all")
async def get_all_exercises():
    """Get all exercises from the database"""
    try:
        exercises = smart_trainer.get_all_exercises()
        return {"exercises": exercises, "total": len(exercises)}
    except Exception as e:
        print(f"Error getting all exercises: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/exercises/filter")
async def filter_exercises(
    target: str = None,
    equipment: str = None, 
    difficulty: str = None,
    search: str = None
):
    """Filter exercises by target muscle, equipment, difficulty, or search term"""
    try:
        all_exercises = smart_trainer.get_all_exercises()
        filtered = all_exercises
        
        # Filter by target muscle
        if target and target.lower() != "all":
            filtered = [ex for ex in filtered if target.lower() in ex.get('target', '').lower()]
        
        # Filter by equipment
        if equipment and equipment.lower() != "all":
            filtered = [ex for ex in filtered if equipment.lower() in ex.get('equipment', '').lower()]
        
        # Filter by difficulty (based on name patterns or custom field if exists)
        if difficulty and difficulty.lower() != "all":
            # This is a placeholder - adjust based on your data structure
            filtered = [ex for ex in filtered if difficulty.lower() in ex.get('name', '').lower()]
        
        # Search by name
        if search:
            filtered = [ex for ex in filtered if search.lower() in ex.get('name', '').lower()]
        
        return {"exercises": filtered, "total": len(filtered), "filters": {
            "target": target,
            "equipment": equipment,
            "difficulty": difficulty,
            "search": search
        }}
    except Exception as e:
        print(f"Error filtering exercises: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ReplaceExerciseRequest(BaseModel):
    current_exercise: str
    target_part: str
    fitness_level: str = "beginner"
    exclude: List[str] = []

@router.post("/api/trainer/replace")
async def replace_exercise(req: ReplaceExerciseRequest):
    """Replace an exercise with a similar one"""
    new_ex = smart_trainer.get_replacement_exercise(
        req.current_exercise, req.target_part, req.fitness_level, req.exclude
    )
    if not new_ex:
        return JSONResponse(status_code=404, content={"error": "No replacement found"})
    new_ex = smart_trainer.get_replacement_exercise(
        req.current_exercise, req.target_part, req.fitness_level, req.exclude
    )
    if not new_ex:
        return JSONResponse(status_code=404, content={"error": "No replacement found"})
    return new_ex

@router.post("/api/trainer/daily_plan")
async def generate_daily_plan(
    user_id: str = Form(...),
    workout_type: str = Form(...),
    duration_mins: int = Form(...),
    intensity: str = Form("medium"),
    focus_area: str = Form("random")
):
    """Generate custom daily workout plan"""
    profile = coach_profile.get_user_profile(user_id) or {}
    result = smart_trainer.generate_daily_plan(
        profile, workout_type, duration_mins, intensity, focus_area
    )
    return result

