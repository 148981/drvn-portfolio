"""
api_user_inbody.py — 使用者體組成記錄 (InBody Records) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/user/inbody-*、/api/user/bmi-recommendation  ｜ 依賴：core.workout_history、core.coach_profile

注意：此檔處理「使用者手動 InBody 量測記錄」(CRUD)，與既有 api_inbody.py
（/api/inbody/{user_id}/score，InBody 評分）前綴不同、不衝突。
"""
from fastapi import APIRouter, Form, Depends
from auth_guard import owner_guard
from fastapi.responses import JSONResponse

import core.workout_history as workout_history
import core.coach_profile as coach_profile

router = APIRouter(tags=["user-inbody"])


@router.get("/api/user/inbody-history/{user_id}", dependencies=[Depends(owner_guard)])
async def get_user_inbody_history(user_id: str, limit: int = 10):
    """Get InBody measurement history from workout sessions"""
    try:
        history = workout_history.get_inbody_history(user_id, limit=limit)
        trends = workout_history.calculate_inbody_trends(history)
        return {
            "user_id": user_id,
            "history": history,
            "trends": trends
        }
    except Exception as e:
        print(f"Error fetching InBody history: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/api/user/bmi-recommendation/{user_id}", dependencies=[Depends(owner_guard)])
async def get_bmi_recommendation(user_id: str):
    """Get smart BMI target recommendation based on current status"""
    try:
        profile = coach_profile.get_user_profile(user_id)
        if not profile:
            return JSONResponse(status_code=404, content={"error": "Profile not found"})

        recommendation = coach_profile.get_smart_bmi_recommendation(profile)
        if not recommendation:
            return JSONResponse(status_code=400, content={"error": "Insufficient profile data for BMI recommendation"})

        return {
            "user_id": user_id,
            "recommendation": recommendation
        }
    except Exception as e:
        print(f"Error getting BMI recommendation: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/user/inbody-record")
async def add_inbody_record(
    user_id: str = Form(...),
    measurement_date: str = Form(...),
    weight_kg: float = Form(None),
    body_fat_percent: float = Form(None),
    skeletal_muscle_mass: float = Form(None),
    body_water_percent: float = Form(None),
    visceral_fat_level: int = Form(None),
    bmr: float = Form(None),
    protein_mass: float = Form(None),
    mineral_mass: float = Form(None),
    body_fat_mass: float = Form(None),
    # Segmental muscle data
    right_arm_muscle: float = Form(None),
    left_arm_muscle: float = Form(None),
    trunk_muscle: float = Form(None),
    right_leg_muscle: float = Form(None),
    left_leg_muscle: float = Form(None),
    # New field
    height: float = Form(None)
):
    """Manually add an InBody measurement record"""
    try:
        print(f"--- Adding InBody Record for {user_id} ---")
        print(f"Incoming Data: Weight={weight_kg}, BMR={bmr}, Height={height}")

        # Get user profile
        profile = coach_profile.get_user_profile(user_id)

        # If height provided, update profile if needed
        if height and height > 0 and weight_kg:
            print(f"Updating user height to {height}cm")
            try:
                # Update profile height
                coach_profile.create_or_update_profile(
                    user_id=user_id,
                    height_cm=height,
                    # Pass existing values or defaults for required fields if creating new
                    name=profile.get('name', 'User') if profile else 'User',
                    age=profile.get('age', 25) if profile else 25,
                    gender=profile.get('gender', 'male') if profile else 'male',
                    weight_kg=weight_kg
                )
                # Refresh profile
                profile = coach_profile.get_user_profile(user_id)
            except Exception as pe:
                print(f"Warning: Could not update profile height: {pe}")

        # Calculate BMI only if both weight and height are available
        height_cm = None
        bmi = None
        if profile:
            height_cm = profile.get('height_cm')
        if height and height > 0:
            height_cm = height

        if height_cm and weight_kg and weight_kg > 0:
            bmi = coach_profile.calculate_bmi(weight_kg, height_cm)

        # Calculate muscle percentage only if both fields are available
        muscle_percent = None
        if skeletal_muscle_mass and weight_kg and weight_kg > 0:
            muscle_percent = round((skeletal_muscle_mass / weight_kg) * 100, 1)

        record_data = {
            'measurement_date': measurement_date,
            'weight_kg': weight_kg,
            'bmi': bmi,
            'body_fat_percent': body_fat_percent,
            'skeletal_muscle_mass': skeletal_muscle_mass,
            'muscle_percent': muscle_percent,
            'body_water_percent': body_water_percent,
            'visceral_fat_level': visceral_fat_level,
            'bmr': bmr,
            'protein_mass': protein_mass,
            'mineral_mass': mineral_mass,
            'body_fat_mass': body_fat_mass,
            # Segmental muscle data
            'right_arm_muscle': right_arm_muscle,
            'left_arm_muscle': left_arm_muscle,
            'trunk_muscle': trunk_muscle,
            'right_leg_muscle': right_leg_muscle,
            'left_leg_muscle': left_leg_muscle
        }

        print(f"Saving Record Data: {record_data}")
        record = workout_history.add_inbody_record(user_id, record_data)
        return {"status": "success", "record": record}
    except Exception as e:
        print(f"Error adding InBody record: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.put("/api/user/inbody-record/{record_id}")
async def update_inbody_record(
    record_id: str,
    user_id: str = Form(...),
    measurement_date: str = Form(None),
    weight_kg: float = Form(None),
    body_fat_percent: float = Form(None),
    skeletal_muscle_mass: float = Form(None),
    body_water_percent: float = Form(None),
    visceral_fat_level: int = Form(None),
    bmr: float = Form(None)
):
    """Update an existing InBody record"""
    try:
        print(f"--- Updating InBody Record {record_id} ---")
        print(f"Update Data: BMR={bmr}, Weight={weight_kg}")

        updates = {}
        if measurement_date: updates['measurement_date'] = measurement_date
        if weight_kg: updates['weight_kg'] = weight_kg
        if body_fat_percent: updates['body_fat_percent'] = body_fat_percent
        if skeletal_muscle_mass: updates['skeletal_muscle_mass'] = skeletal_muscle_mass
        if body_water_percent: updates['body_water_percent'] = body_water_percent
        if visceral_fat_level: updates['visceral_fat_level'] = visceral_fat_level
        if bmr: updates['bmr'] = bmr

        print(f"Applying Updates: {updates}")

        # Recalculate BMI and muscle percent if weight changed
        if weight_kg:
            profile = coach_profile.get_user_profile(user_id)
            if profile:
                updates['bmi'] = coach_profile.calculate_bmi(weight_kg, profile.get('height_cm'))
                if skeletal_muscle_mass:
                    updates['muscle_percent'] = round((skeletal_muscle_mass / weight_kg) * 100, 1)

        success, result = workout_history.update_inbody_record(user_id, record_id, updates)
        if success:
            return {"status": "success", "record": result}
        else:
            return JSONResponse(status_code=404, content={"error": result})
    except Exception as e:
        print(f"Error updating InBody record: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.delete("/api/user/inbody-record/{record_id}")
async def delete_inbody_record(record_id: str, user_id: str):
    """Delete an InBody record"""
    try:
        success, message = workout_history.delete_inbody_record(user_id, record_id)
        if success:
            return {"status": "success", "message": message}
        else:
            return JSONResponse(status_code=404, content={"error": message})
    except Exception as e:
        print(f"Error deleting InBody record: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
