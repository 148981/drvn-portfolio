from fastapi import APIRouter, HTTPException, Depends, Request
from core.json_cache import save_json_atomic
from auth_guard import owner_guard, enforce_owner
from pydantic import BaseModel
from typing import Optional, List
import os
import json
from datetime import datetime

router = APIRouter()

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
USER_PROFILES_PATH = os.path.join(DATA_DIR, "user_profiles.json")

class NutritionGoalModel(BaseModel):
    user_id: str
    mode: str  # "cutting", "maintenance", "bulking"
    target_calories: int
    protein_target: int
    carb_target: int
    fat_target: int
    tdee: Optional[int] = None
    updated_at: Optional[str] = None

@router.post("/api/user/nutrition-goals")
async def save_nutrition_goals(goal_data: NutritionGoalModel, request: Request):
    """Save user's nutrition mode and targets"""
    enforce_owner(request, goal_data.user_id)
    try:
        # Load existing profiles
        if not os.path.exists(USER_PROFILES_PATH):
           return {"status": "error", "message": "User profiles not found"}
        
        with open(USER_PROFILES_PATH, 'r', encoding='utf-8') as f:
            profiles = json.load(f)
        
        user_id = goal_data.user_id
        if user_id not in profiles:
            # Create stub if missing (shouldn't happen usually)
            profiles[user_id] = {"user_id": user_id}
            
        # Update profile with specific nutrition goal fields
        profiles[user_id]['nutrition_mode'] = goal_data.mode
        profiles[user_id]['daily_calorie_target'] = goal_data.target_calories
        profiles[user_id]['daily_protein_target'] = goal_data.protein_target
        profiles[user_id]['daily_carb_target'] = goal_data.carb_target
        profiles[user_id]['daily_fat_target'] = goal_data.fat_target
        if goal_data.tdee:
            profiles[user_id]['tdee'] = goal_data.tdee
            
        profiles[user_id]['nutrition_goals_updated_at'] = datetime.now().isoformat()
        
        # Save back
        save_json_atomic(USER_PROFILES_PATH, profiles, indent=2)
        return {"status": "success", "data": goal_data}
        
    except Exception as e:
        print(f"Error saving nutrition goals: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/user/nutrition-goals/{user_id}", dependencies=[Depends(owner_guard)])
async def get_nutrition_goals(user_id: str):
    """Get user's nutrition goals"""
    try:
        from core.committed_nutrition import read_committed_plan, plan_targets
        plan = read_committed_plan(user_id)
        if plan:
            targets = plan_targets(plan)
            return {'mode': targets['mode'], 'target_calories': targets['calories'],
                    'protein_target': targets['protein'], 'carb_target': targets['carbs'],
                    'fat_target': targets['fats'], 'tdee': plan.get('tdee'),
                    'current_weight': plan.get('currentWeight'), 'plan': plan}
        if not os.path.exists(USER_PROFILES_PATH):
             return {"mode": "maintenance", "target_calories": 2000, "protein_target": 150, "carb_target": 200, "fat_target": 60}

        with open(USER_PROFILES_PATH, 'r', encoding='utf-8') as f:
            profiles = json.load(f)
            
        user = profiles.get(user_id, {})
        
        # Return saved goals or defaults
        return {
            "mode": user.get('nutrition_mode', 'maintenance'),
            "target_calories": user.get('daily_calorie_target', 2000),
            "protein_target": user.get('daily_protein_target', 150),
            "carb_target": user.get('daily_carb_target', 200),
            "fat_target": user.get('daily_fat_target', 65),
            "tdee": user.get('tdee', 2000), # Default TDEE
            "current_weight": user.get('weight_kg', 70) # Helper for frontend calc
        }

    except Exception as e:
        print(f"Error fetching nutrition goals: {e}")
        raise HTTPException(status_code=500, detail=str(e))
