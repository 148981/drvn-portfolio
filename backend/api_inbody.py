"""
api_inbody.py — InBody 體組成評分 路由（Phase 1 抽出，行為不變）
對應前綴：/api/inbody/{user_id}/score  ｜ 依賴：core.inbody_scoring、core.coach_profile
"""
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard

import core.coach_profile as coach_profile

router = APIRouter(tags=["inbody"])


# ==================== InBody Scoring APIs ====================
from core.inbody_scoring import calculate_inbody_score

@router.get("/api/inbody/{user_id}/score", dependencies=[Depends(owner_guard)])
async def get_inbody_score(user_id: str):
    """Calculate InBody total score"""
    try:
        # Get user profile with InBody data
        profile = coach_profile.get_user_profile(user_id)
        
        if not profile:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Calculate score
        score_data = calculate_inbody_score({
            'bmi': profile.get('bmi', 0),
            'body_fat_percentage': profile.get('inbody_data', {}).get('body_fat_percentage', 0),
            'skeletal_muscle_mass': profile.get('inbody_data', {}).get('skeletal_muscle_mass', 0),
            'visceral_fat_level': profile.get('inbody_data', {}).get('visceral_fat_level', 0),
            'bmr': profile.get('inbody_data', {}).get('bmr', 0),
            'body_water_percentage': profile.get('inbody_data', {}).get('body_water_percentage', 0),
            'weight': profile.get('weight', 70),
            'age': profile.get('age', 30),
            'gender': profile.get('gender', 'male')
        })
        
        return score_data
    except Exception as e:
        print(f"Error calculating InBody score: {e}")
        raise HTTPException(status_code=500, detail=str(e))
