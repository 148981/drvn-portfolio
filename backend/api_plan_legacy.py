"""
api_plan_legacy.py — 計劃產生 / 取得（含 legacy）路由（Phase 1 從 main.py 抽出，行為不變）

對應前綴：/api/plan/generate、/api/plan/{plan_id}，以及 3 條 *_legacy。
⚠️ save_legacy、{user_id}/latest_legacy、{plan_id}/day/{day_number}_legacy 三條，
   前端 (frontend/src) 已不再呼叫（改用 api_plan_endpoints 的 /api/plan/save 等），
   確認無外部依賴後可整段刪除。
依賴：core.coach_profile、core.recovery（直接讀寫 data/ JSON）
"""
import os
from core.json_cache import save_json_atomic
import json
import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query

import core.coach_profile as coach_profile
import core.recovery as recovery
from core.workout_generator import generate_4_week_plan, get_plan_summary

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

router = APIRouter(tags=["plan-legacy"])


class WorkoutPlanGenerationRequest(BaseModel):
    user_id: str
    selected_hashtags: List[str]
    duration_weeks: int = 4

@router.post("/api/plan/save_legacy")
async def save_plan(data: dict):
    """Save a generated plan (Legacy) - Renamed to avoid overriding api_plan_endpoints.py"""
    try:
        user_id = data.get("user_id", "default_user")
        plan = data.get("plan", {})
        
        import os
        import json
        import uuid
        
        # Save to DATA_DIR instead of relative data/plans/ to avoid uvicorn reload
        save_dir = os.path.join(DATA_DIR, "plans", user_id)
        os.makedirs(save_dir, exist_ok=True)
        plan_id = str(uuid.uuid4())
        
        save_json_atomic(os.path.join(save_dir, f"{plan_id}.json"), plan, indent=4)
            
        return {"status": "success", "plan_id": plan_id, "message": "Plan saved successfully"}
    except Exception as e:
        print(f"Error saving plan: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/plan/generate")
async def generate_workout_plan(request: WorkoutPlanGenerationRequest):
    """
    Generate 4-week personalized workout plan based on hashtags
    Phase 2 Main API
    """
    try:
        # Get user profile
        profile = coach_profile.get_user_profile(request.user_id)
        if not profile:
            # Create basic profile if not exists
            profile = {
                'fitness_level': 'beginner',
                'current_scores': {
                    'structural': 60,
                    'metabolic': 60,
                    'alignment': 60,
                    'vitality': 60
                }
            }
        
        # Generate plan
        plan = generate_4_week_plan(
            selected_hashtags=request.selected_hashtags,
            user_profile=profile,
            user_id=request.user_id
        )
        
        # Assign unique plan_id
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        plan_id = f"plan_{request.user_id}_{timestamp}"
        plan['plan_id'] = plan_id
        
        # Save plan to file
        plans_path = os.path.join(DATA_DIR, f"workout_plans_{request.user_id}.json")
        all_plans = []
        
        if os.path.exists(plans_path):
            with open(plans_path, 'r', encoding='utf-8') as f:
                all_plans = json.load(f)
        
        all_plans.append(plan)
        
        save_json_atomic(plans_path, all_plans, indent=2)
        # Generate summary
        summary = get_plan_summary(plan)
        plan['summary'] = summary
        
        return {
            "success": True,
            "plan": plan,
            "plan_id": plan_id,
            "message": "4週訓練計劃生成成功！"
        }
        
    except Exception as e:
        print(f"Error generating workout plan: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/plan/{plan_id}")
async def get_workout_plan(plan_id: str):
    """Get a specific workout plan by ID"""
    try:
        # Extract user_id from plan_id (format: plan_userid_timestamp)
        parts = plan_id.split('_')
        if len(parts) < 3:
            raise HTTPException(status_code=400, detail="Invalid plan ID format")
        
        user_id = parts[1]
        
        plans_path = os.path.join(DATA_DIR, f"workout_plans_{user_id}.json")
        if not os.path.exists(plans_path):
            raise HTTPException(status_code=404, detail="No plans found for user")
        
        with open(plans_path, 'r', encoding='utf-8') as f:
            all_plans = json.load(f)
        
        # Find the plan
        for plan in all_plans:
            if plan['plan_id'] == plan_id:
                return plan
        
        raise HTTPException(status_code=404, detail="Plan not found")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting workout plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/plan/{user_id}/latest_legacy")
async def get_latest_workout_plan(user_id: str):
    """Get user's latest workout plan (Legacy) - Renamed to avoid overriding api_plan_endpoints.py"""
    try:
        plans_path = os.path.join(DATA_DIR, f"workout_plans_{user_id}.json")
        if not os.path.exists(plans_path):
            return {"plan": None, "message": "No plans found"}
        
        with open(plans_path, 'r', encoding='utf-8') as f:
            all_plans = json.load(f)
        
        if all_plans:
            latest_plan = all_plans[-1]
            summary = get_plan_summary(latest_plan)
            latest_plan['summary'] = summary
            
            # Generate plan_id if not present (for backward compatibility)
            plan_id = latest_plan.get('plan_id', f"plan_{user_id}_{len(all_plans)}")
            
            return {
                "plan": latest_plan,
                "plan_id": plan_id
            }
        
        return {"plan": None, "message": "No plans found"}
        
    except Exception as e:
        print(f"Error getting latest plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class DayUpdateRequest(BaseModel):
    exercises: List[dict]
    completed: Optional[bool] = None
    day_name: Optional[str] = None
    date: Optional[str] = None

@router.put("/api/plan/{plan_id}/day/{day_number}_legacy")
async def update_plan_day(plan_id: str, day_number: int, update: DayUpdateRequest, user_id: Optional[str] = Query(None)):
    """Update a specific day in the workout plan (Legacy) - Renamed to avoid overriding api_plan_endpoints.py"""
    try:
        # Extract user_id from plan_id OR use query param
        target_user_id = user_id
        
        if not target_user_id:
            parts = plan_id.split('_')
            if len(parts) >= 3:
                 target_user_id = parts[1]
        
        if not target_user_id:
            # Fallback failed
            raise HTTPException(status_code=400, detail="Cannot determine user_id from plan_id. Please provide user_id query param.")
            
        plans_path = os.path.join(DATA_DIR, f"workout_plans_{target_user_id}.json")
        if not os.path.exists(plans_path):
            raise HTTPException(status_code=404, detail="No plans found for user")
        
        with open(plans_path, 'r', encoding='utf-8') as f:
            all_plans = json.load(f)
        
        # Find and update the plan
        plan_found = False
        for plan_idx, plan in enumerate(all_plans):
            if plan['plan_id'] == plan_id:
                plan_found = True
                # Find the specific day
                day_found = False
                for week in plan['weeks']:
                    for day in week['days']:
                        if day['day_number'] == day_number:
                            day_found = True
                            # Update the day
                            day['exercises'] = update.exercises
                            if update.completed is not None:
                                day['completed'] = update.completed
                                
                                # If completed, update user stats (Gamification)
                                if update.completed:
                                    try:
                                        profile = coach_profile.get_user_profile(user_id)
                                        current_radar = profile.get('radar_current', {})
                                        
                                        # Simple progression: Increase all by 2 points
                                        for key in current_radar:
                                            if isinstance(current_radar[key], (int, float)):
                                                current_radar[key] = min(100, current_radar[key] + 2)
                                            
                                        profile['radar_current'] = current_radar
                                        coach_profile.save_user_profile(user_id, profile)
                                    except Exception as e:
                                        print(f"Error updating user profile stats: {e}")
                            
                            if update.day_name:
                                day['day_name'] = update.day_name
                            if update.date:
                                day['date'] = update.date
                            break
                    if day_found:
                        break
                
                if not day_found:
                    raise HTTPException(status_code=404, detail=f"Day {day_number} not found")
                
                all_plans[plan_idx] = plan
                break
        
        if not plan_found:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        # Save updated plans
        save_json_atomic(plans_path, all_plans, indent=2)
        return {"success": True, "message": f"Day {day_number} updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating plan day: {e}")
        raise HTTPException(status_code=500, detail=str(e))
