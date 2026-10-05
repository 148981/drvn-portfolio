"""
api_user_scoring.py — 使用者雷達 / 評分 / 恢復 (Radar / Score / Recovery) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/user/radar-profile、/api/user/{user_id}/radar、/api/radar/ideal-shape、
          /api/user/initial-score、/api/user/recovery/{user_id}
依賴：core.coach_profile、core.recovery、core.hashtag_pool.calculate_ideal_radar_shape

註：
 - initial-score 維持原行為：core 未實作 calculate_initial_scores，故直接回 501（不觸發 NameError）。
 - main.py 內原有重複死碼版本的 IdealShapeRequest / RadarProfileRequest（永不執行）已隨本次抽取清除。
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard

import core.coach_profile as coach_profile
import core.recovery as recovery
from core.hashtag_pool import calculate_ideal_radar_shape

router = APIRouter(tags=["user-scoring"])


# ==================== Radar Profile ====================

class InBodyData(BaseModel):
    weight_kg: float
    body_fat_percent: float
    skeletal_muscle_mass: float


class RadarProfileRequest(BaseModel):
    user_id: str
    selected_tags: List[str]
    inbody_data: Optional[InBodyData] = None


class IdealShapeRequest(BaseModel):
    selected_tags: List[str]


@router.post("/api/user/radar-profile")
async def create_radar_profile(request: RadarProfileRequest):
    """Generate ideal radar shape based on selected hashtags and current shape from InBody"""
    try:
        ideal_shape = calculate_ideal_radar_shape(request.selected_tags)

        # Save to user profile
        profile = coach_profile.get_user_profile(request.user_id)
        if profile:
            profile['radar_tags'] = request.selected_tags
            profile['radar_ideal'] = ideal_shape

            # Calculate current scores from InBody if provided
            if request.inbody_data:
                inbody = request.inbody_data

                # Heuristic Calculation
                # Structural: ~2.5x Skeletal Muscle Mass (e.g. 30kg -> 75)
                structural = min(95, max(30, inbody.skeletal_muscle_mass * 2.5))

                # Metabolic: 100 - 2x Body Fat % (e.g. 20% -> 60, 10% -> 80)
                metabolic = min(95, max(30, 100 - (inbody.body_fat_percent * 2)))

                # Vitality: Avg of Structural and Metabolic + Bonus
                vitality = min(95, (structural + metabolic) / 2 + 5)

                # Alignment: Default to 50 or slightly customized
                alignment = 50

                radar_current = {
                    'structural': int(structural),
                    'metabolic': int(metabolic),
                    'alignment': int(alignment),
                    'vitality': int(vitality)
                }

                profile['radar_current'] = radar_current

                # Also save raw InBody data
                profile['weight_kg'] = inbody.weight_kg
                profile['body_fat_percent'] = inbody.body_fat_percent
                profile['skeletal_muscle_mass'] = inbody.skeletal_muscle_mass

            # Initialize current scores if missing
            elif 'radar_current' not in profile:
                profile['radar_current'] = {
                    'structural': 30,
                    'metabolic': 30,
                    'alignment': 30,
                    'vitality': 30
                }

            coach_profile.save_user_profile(request.user_id, profile)

        return {
            "user_id": request.user_id,
            "tags": request.selected_tags,
            "selected_tags": request.selected_tags,
            "ideal": ideal_shape,
            "current": profile.get('radar_current', {
                'structural': 30,
                'metabolic': 30,
                'alignment': 30,
                'vitality': 30
            })
        }
    except Exception as e:
        print(f"Error creating radar profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/user/{user_id}/radar", dependencies=[Depends(owner_guard)])
async def get_user_radar_profile(user_id: str):
    """Get user's radar profile including status and tags"""
    try:
        profile = coach_profile.get_user_profile(user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "user_id": user_id,
            "tags": profile.get('radar_tags', []),  # Frontend expects 'tags'
            "selected_tags": profile.get('radar_tags', []),
            "ideal": profile.get('radar_ideal', {
                'structural': 100,
                'metabolic': 100,
                'alignment': 100,
                'vitality': 100
            }),
            "current": profile.get('radar_current', {
                'structural': 30,
                'metabolic': 30,
                'alignment': 30,
                'vitality': 30
            })
        }
    except Exception as e:
        print(f"Error fetching radar profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/radar/ideal-shape")
async def get_ideal_shape(request: IdealShapeRequest):
    """Calculate ideal radar shape without saving"""
    try:
        ideal_shape = calculate_ideal_radar_shape(request.selected_tags)
        return ideal_shape
    except Exception as e:
        print(f"Error calculating ideal shape: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Initial Score ====================

class InitialScoreRequest(BaseModel):
    user_id: str
    # InBody Data
    smm: float  # Skeletal Muscle Mass (kg)
    bfp: float  # Body Fat Percentage (%)
    # User Basic Info
    gender: str  # "male" or "female"
    age: int
    # Lifestyle Questionnaire
    sitting_hours: float  # Daily sitting hours
    resting_heart_rate: int  # BPM
    sleep_quality: str = "fair"  # "excellent", "good", "fair", "poor"
    has_regular_exercise: bool = False
    has_posture_issues: bool = False


@router.post("/api/user/initial-score")
async def calculate_user_initial_score(request: InitialScoreRequest):
    """
    Calculate initial radar chart scores based on InBody data and lifestyle
    """
    try:
        # ⚠️ calculate_initial_scores 尚未實作（core 模組未定義），此 endpoint 暫不可用。
        #    回傳 501 而非讓未定義名稱觸發 NameError。
        raise HTTPException(status_code=501, detail="initial-score 功能尚未實作")

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Recovery ====================

@router.get("/api/user/recovery/{user_id}", dependencies=[Depends(owner_guard)])
async def get_user_recovery_status(user_id: str):
    """Get dynamic muscle recovery status based on workout history"""
    try:
        details = recovery.get_muscle_recovery_details(user_id)
        # Convert to the simple format expected by the frontend hook if needed,
        # or return the detailed object.
        # The frontend components (LoeweMuscleSculpture) expect a map of { muscle: score }
        # The details object is { muscle: {score, status, ...} }

        # We can return both
        scores_only = {k: v['score'] for k, v in details.items()}

        return {
            "user_id": user_id,
            "scores": scores_only,
            "details": details
        }
    except Exception as e:
        print(f"Error fetching recovery status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
