"""
Coach and User Profile Management Module
Handles multiple coach templates and user profiles with recommendations
"""
import os
from .json_cache import save_json_atomic
import json
import base64
import re
from datetime import datetime
import pandas as pd
from . import workout_plans

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
COACHES_PATH = os.path.join(DATA_DIR, 'coaches.json')
USER_PROFILES_PATH = os.path.join(DATA_DIR, 'user_profiles.json')

# Helper Functions
def load_coaches():
    if os.path.exists(COACHES_PATH):
        if os.path.getsize(COACHES_PATH) == 0:
            return []
        with open(COACHES_PATH, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []

def save_coaches(coaches):
    save_json_atomic(COACHES_PATH, coaches, indent=2)
def load_user_profiles():
    """Phase 2：改從 DB 讀（user_profiles 表）。回傳 {user_id: profile}。"""
    from repositories import profile_repo
    return profile_repo.get_all()

def save_user_profiles(profiles):
    """Phase 2：逐筆 upsert 進 DB（不刪未列出者，避免誤刪他人）。"""
    from repositories import profile_repo
    profile_repo.upsert_many(profiles)

def save_user_profile(user_id, profile):
    """Save or update a single user profile"""
    profiles = load_user_profiles()
    profiles[user_id] = profile
    save_user_profiles(profiles)

def calculate_bmi(weight_kg, height_cm):
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)

def save_base64_image(user_id, field_name, base64_str):
    """
    Decodes a base64 string and saves it as a file.
    Returns the relative URL path to the saved file.
    """
    if not base64_str or not isinstance(base64_str, str) or not base64_str.startswith('data:image'):
        return base64_str # Return as-is if it's already a URL or empty

    try:
        # Extract format and data
        header, encoded = base64_str.split(",", 1)
        ext_match = re.search(r'image/(\w+);', header)
        ext = ext_match.group(1) if ext_match else 'png'
        if ext == 'jpeg': ext = 'jpg'

        # Build paths
        # Note: We use the DATA_DIR/uploads structure to match main.py's static mount
        upload_base = os.path.join(DATA_DIR, "uploads", "profiles")
        if not os.path.exists(upload_base):
            os.makedirs(upload_base, exist_ok=True)

        filename = f"{user_id}_{field_name}_{int(datetime.now().timestamp())}.{ext}"
        filepath = os.path.join(upload_base, filename)

        # Save file
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(encoded))

        # Return the public URL path
        return f"/static/uploads/profiles/{filename}"
    except Exception as e:
        print(f"Error saving base64 image: {e}")
        return base64_str # Fallback to original

# Coach Management
def get_all_coaches():
    return load_coaches()

def get_coach_by_id(coach_id):
    coaches = load_coaches()
    return next((c for c in coaches if c["coach_id"] == coach_id), None)

import random

def _generate_discriminator(name, all_profiles):
    """Generate a unique 4-digit discriminator for a given name."""
    used_discs = set(p.get("discriminator") for p in all_profiles.values() if p.get("name") == name and p.get("discriminator"))
    for _ in range(1000):
        disc = f"{random.randint(1000, 9999)}"
        if disc not in used_discs:
            return disc
    return "0000" # Fallback if somehow all 9000 numbers are taken for this name

# User Profile Management
def create_or_update_profile(
    user_id, name, height_cm, weight_kg, age=None, gender="male", 
    fitness_level="beginner", goals=None,
    # New Onboarding Fields
    birthdate=None, weekly_frequency=None, diet=None, lifestyle=None, mindset_tags=None, waist_cm=None,
    tdee=None, training_space=None, is_first_plan=False,
    # InBody fields (optional)
    body_fat_percent=None, skeletal_muscle_mass=None, body_water_percent=None,
    visceral_fat_level=None, bmr=None, protein_mass=None, mineral_mass=None, body_fat_mass=None,
    # Segmental Muscle
    right_arm_muscle=None, left_arm_muscle=None, trunk_muscle=None, right_leg_muscle=None, left_leg_muscle=None,
    # Identity & Presentation Fields
    bio=None, city=None, tag=None, avatar=None, coverPhoto=None
):
    profiles = load_user_profiles()
    goals = goals or []
    bmi = calculate_bmi(weight_kg, height_cm)

    # 🎯 物理化儲存照片 (Base64 -> File)
    avatar_path = save_base64_image(user_id, "avatar", avatar)
    cover_path = save_base64_image(user_id, "cover", coverPhoto)

    print(f"[PROFILE SAVE] user={user_id}, avatar input={repr(avatar[:80]) if avatar else 'None'}, saved path={avatar_path}")
    print(f"[PROFILE SAVE] user={user_id}, cover input={repr(coverPhoto[:80]) if coverPhoto else 'None'}, saved path={cover_path}")

    # Calculate Age from birthdate if provided and age is missing
    if birthdate and not age:
        try:
            from datetime import datetime
            bdate = datetime.strptime(birthdate, "%Y-%m-%d")
            today = datetime.today()
            age = today.year - bdate.year - ((today.month, today.day) < (bdate.month, bdate.day))
        except Exception as e:
            print(f"Error calculating age from birthdate: {e}")
            age = 25 # Default

    # Calculate BMR if not provided
    if bmr is None and age:
        bmr_calc = 10 * weight_kg + 6.25 * height_cm - 5 * age
        bmr = bmr_calc + 5 if gender == "male" else bmr_calc - 161

    # 🎯 合併更新：先載入舊資料，再用新值覆蓋（None 不覆蓋舊值）
    existing = profiles.get(user_id, {})

    # Auto-assign discriminator
    if not existing.get("discriminator"):
        discriminator = _generate_discriminator(name, profiles)
    else:
        discriminator = existing.get("discriminator")

    new_data = {
        "user_id": user_id,
        "name": name,
        "discriminator": discriminator,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "age": age,
        "gender": gender,
        # Onboarding Data
        "birthdate": birthdate,
        "weekly_frequency": weekly_frequency,
        "diet": diet,
        "lifestyle": lifestyle,
        "mindset_tags": mindset_tags,
        "waist_cm": waist_cm,
        "tdee": tdee,
        "training_space": training_space,
        "is_first_plan": is_first_plan,

        "bmi": bmi,
        "fitness_level": fitness_level,
        "goals": goals,
        # InBody data
        "body_fat_percent": body_fat_percent,
        "skeletal_muscle_mass": skeletal_muscle_mass,
        "body_water_percent": body_water_percent,
        "visceral_fat_level": visceral_fat_level,
        "bmr": bmr,
        "protein_mass": protein_mass,
        "mineral_mass": mineral_mass,
        "body_fat_mass": body_fat_mass,
        "right_arm_muscle": right_arm_muscle,
        "left_arm_muscle": left_arm_muscle,
        "trunk_muscle": trunk_muscle,
        "right_leg_muscle": right_leg_muscle,
        "left_leg_muscle": left_leg_muscle,
        # Identity & Presentation
        "bio": bio,
        "city": city,
        "tag": tag,
        "avatar": avatar_path,
        "coverPhoto": cover_path,
        "updated_at": pd.Timestamp.now().isoformat()
    }

    # 🎯 關鍵：合併策略 — 新值為 None 時保留舊值，避免覆蓋已有的資料
    profile = {**existing}  # 先複製舊資料（保留 nutrition_mode 等欄位）
    for key, val in new_data.items():
        if val is not None:
            profile[key] = val
        elif key not in profile:
            profile[key] = val  # 新欄位首次出現，即使是 None 也要建立 key

    # Calculate body type if InBody data available
    if body_fat_percent is not None and skeletal_muscle_mass is not None:
        profile["body_type"] = calculate_body_type(profile)

    profiles[user_id] = profile
    save_user_profiles(profiles)
    print(f"[PROFILE SAVE] ✅ Saved! avatar={profile.get('avatar')}, cover={profile.get('coverPhoto')}")
    return profile

def get_user_profile(user_id):
    """Get user profile with latest InBody data auto-synced"""
    from . import workout_history  # Import here to avoid circular dependency
    
    profiles = load_user_profiles()
    profile = profiles.get(user_id)
    
    if profile:
        # Auto-assign discriminator for legacy profiles that don't have one
        if not profile.get("discriminator"):
            profile["discriminator"] = _generate_discriminator(profile.get("name", "Athlete"), profiles)
            profiles[user_id] = profile
            save_user_profiles(profiles)

        # Auto-sync latest InBody data from independent history with forward-fill
        inbody_history = workout_history.get_inbody_history(user_id, limit=10)  # Get last 10 records
        
        if inbody_history and len(inbody_history) > 0:
            # Forward-fill strategy: Use latest non-null value for each metric
            inbody_metrics = [
                'body_fat_percent', 'skeletal_muscle_mass', 'muscle_percent',
                'body_water_percent', 'visceral_fat_level', 'bmr',
                'bmi', 'weight_kg', 'protein_mass', 'mineral_mass', 'body_fat_mass',
                # Segmental muscle data
                'right_arm_muscle', 'left_arm_muscle', 'trunk_muscle', 
                'right_leg_muscle', 'left_leg_muscle'
            ]
            
            filled_data = {}
            for metric in inbody_metrics:
                # Find the first non-null value in history
                for record in inbody_history:
                    value = record.get(metric)
                    if value is not None:
                        filled_data[metric] = value
                        break
                # If no non-null value found, keep as None
                if metric not in filled_data:
                    filled_data[metric] = None
            
            # Merge filled InBody data into profile
            profile.update(filled_data)
            # Add timestamp from latest measurement
            profile['inbody_updated_at'] = inbody_history[0].get('measurement_date')
    
    return profile

def calculate_body_type(profile):
    """
    Classify user body type based on body composition
    Returns: skinny_fat, lean_athletic, bulky, or beginner
    """
    bf_percent = profile.get("body_fat_percent")
    muscle_mass = profile.get("skeletal_muscle_mass")
    weight = profile.get("weight_kg")
    gender = profile.get("gender")
    
    if bf_percent is None or muscle_mass is None:
        return "beginner"
    
    # Calculate muscle mass percentage
    muscle_percent = (muscle_mass / weight) * 100 if weight > 0 else 0
    
    # Gender-specific thresholds (Based on American Council on Exercise - ACE)
    # Male: Athletes < 13%, Fitness 14-17%, Average 18-24%, Obese > 25%
    # Female: Athletes < 20%, Fitness 21-24%, Average 25-31%, Obese > 32%
    
    if gender == "male":
        high_bf = bf_percent > 24   # Above Average/Obese threshold
        low_bf = bf_percent < 14    # Athlete/Fitness range
        high_muscle = muscle_percent > 45 # High relative lean mass
        low_muscle = muscle_percent < 38
    else:  # female
        high_bf = bf_percent > 31   # Above Average/Obese threshold
        low_bf = bf_percent < 21    # Athlete/Fitness range
        high_muscle = muscle_percent > 38
        low_muscle = muscle_percent < 33
    
    # Classification logic
    if high_bf and low_muscle:
        return "skinny_fat"  # Sarcopenic Obesity (Low muscle, High fat)
    elif low_bf and high_muscle:
        return "lean_athletic"  # Ideal Athletic Composition
    elif high_muscle and high_bf:
        return "bulky"  # High muscle but carrying extra fat (Powerlifter build)
    elif low_bf and not high_muscle:
        return "lean_beginner"  # Ectomorph / Low BMI
    else:
        return "average"  # Standard composition

def calculate_body_score(profile):
    """
    Calculate body composition score using InBody's actual methodology
    
    InBody Score Formula (Official):
    - Baseline: 80 points
    - Muscle adjustment: +1 point per kg above standard, -1 point per kg below
    - Fat adjustment: -1 point per kg deviation from standard (both above AND below)
    
    Score ranges:
    - 90+: Excellent (athlete level)
    - 80-89: Very Good (healthy and muscular)
    - 70-79: Good (healthy standard)
    - 60-69: Fair (needs improvement)
    - <60: Poor (needs attention)
    """
    bf_percent = profile.get("body_fat_percent")
    muscle_mass = profile.get("skeletal_muscle_mass")
    weight = profile.get("weight_kg", 0)
    height_cm = profile.get("height_cm", 170)
    gender = profile.get("gender", "male")
    
    if bf_percent is None or muscle_mass is None or weight <= 0:
        return None
    
    # Start with baseline score
    score = 80
    
    # Calculate standard/ideal values based on height and gender
    height_m = height_cm / 100
    
    # Standard muscle mass calculation (based on height)
    # These are InBody's approximate standards
    if gender == "male":
        # Male standard: roughly 0.35-0.40 * weight for skeletal muscle
        # Or calculated from height: approximately height(m)² * 11.5
        standard_muscle = (height_m ** 2) * 11.5
    else:  # female
        # Female standard: roughly 0.25-0.30 * weight
        # Or from height: approximately height(m)² * 7.5
        standard_muscle = (height_m ** 2) * 7.5
    
    # Calculate muscle difference
    muscle_diff = muscle_mass - standard_muscle
    score += muscle_diff  # +1 point per kg above, -1 per kg below
    
    # Calculate standard fat mass based on healthy body fat percentage
    if gender == "male":
        # Healthy range: 15-20% for males
        standard_bf_percent = 17.5  # Middle of healthy range
    else:  # female
        # Healthy range: 20-25% for females  
        standard_bf_percent = 22.5
    
    # Calculate actual and standard fat mass
    actual_fat_mass = (bf_percent / 100) * weight
    standard_fat_mass = (standard_bf_percent / 100) * weight
    
    # Calculate fat difference (deviation in EITHER direction reduces score)
    fat_diff = abs(actual_fat_mass - standard_fat_mass)
    score -= fat_diff  # -1 point per kg deviation
    
    # Ensure score stays within reasonable bounds (0-100)
    return min(100, max(0, int(score)))

def get_score_grade(score):
    """Get letter grade and description for body score"""
    if score >= 85:
        return {"grade": "A", "description": "優秀", "color": "green"}
    elif score >= 70:
        return {"grade": "B", "description": "良好", "color": "blue"}
    elif score >= 55:
        return {"grade": "C", "description": "中等", "color": "yellow"}
    elif score >= 40:
        return {"grade": "D", "description": "待改善", "color": "orange"}
    else:
        return {"grade": "F", "description": "需加強", "color": "red"}

def get_body_composition_analysis(user_id):
    """
    Get detailed body composition analysis with weakness detection
    """
    profile = get_user_profile(user_id)
    if not profile:
        return None
    
    body_type = profile.get("body_type", "beginner")
    bf_percent = profile.get("body_fat_percent")
    muscle_mass = profile.get("skeletal_muscle_mass")
    
    # Body type descriptions and recommendations
    body_type_info = {
        "skinny_fat": {
            "name": "Skinny-Fat",
            "description": "體重正常但體脂率偏高，肌肉量不足",
            "focus": "增肌 + 減脂",
            "recommendation": "建議從力量訓練開始，搭配適度有氧，注重蛋白質攝取"
        },
        "lean_athletic": {
            "name": "Lean Athletic",
            "description": "低體脂、高肌肉量，運動員體態",
            "focus": "維持 + 精進",
            "recommendation": "維持現有訓練強度，可加入爆發力或專項訓練"
        },
        "bulky": {
            "name": "Bulky",
            "description": "高肌肉量但體脂率也偏高",
            "focus": "減脂為主",
            "recommendation": "增加有氧運動，控制熱量攝取，保持力量訓練防止肌肉流失"
        },
        "lean_beginner": {
            "name": "Lean Beginner",
            "description": "體脂率低但肌肉量不足",
            "focus": "增肌",
            "recommendation": "專注力量訓練，增加熱量和蛋白質攝取"
        },
        "average": {
            "name": "Average",
            "description": "體態均衡，有發展空間",
            "focus": "全面發展",
            "recommendation": "平衡力量訓練和有氧運動，根據個人目標調整"
        },
        "beginner": {
            "name": "Beginner",
            "description": "尚無詳細身體數據",
            "focus": "建立基礎",
            "recommendation": "從基礎訓練開始，建議進行 InBody 檢測以獲得更精準建議"
        }
    }
    
    # Calculate body score if InBody data available
    body_score = None
    score_grade = None
    if bf_percent is not None:
        body_score = calculate_body_score(profile)
        if body_score is not None:
            score_grade = get_score_grade(body_score)
    
    analysis = {
        "body_type": body_type,
        "body_type_info": body_type_info.get(body_type, body_type_info["beginner"]).copy(),
        "has_inbody_data": bf_percent is not None,
        "has_inbody_data": bf_percent is not None,
        "composition": {},
        "weaknesses": [],
        "weakness_recommendations": None,
        "body_score": body_score,
        "score_grade": score_grade
    }
    
    if bf_percent is not None:
        weight = profile.get("weight_kg", 0)
        muscle_percent = round((muscle_mass / weight) * 100, 1) if weight > 0 else 0
        
        analysis["composition"] = {
            "body_fat_percent": bf_percent,
            "skeletal_muscle_mass": muscle_mass,
            "muscle_percent": muscle_percent,
            "body_water_percent": profile.get("body_water_percent"),
            "visceral_fat_level": profile.get("visceral_fat_level"),
            "bmr": profile.get("bmr"),
            "protein_mass": profile.get("protein_mass"),
            "mineral_mass": profile.get("mineral_mass"),
            "body_fat_mass": profile.get("body_fat_mass"),
            "right_arm_muscle": profile.get("right_arm_muscle"),
            "left_arm_muscle": profile.get("left_arm_muscle"),
            "trunk_muscle": profile.get("trunk_muscle"),
            "right_leg_muscle": profile.get("right_leg_muscle"),
            "left_leg_muscle": profile.get("left_leg_muscle")
        }
        
        # Segmental Weakness Analysis (Asymmetry & Insufficiency)
        segmental_focus = []
        weight_kg = profile.get("weight_kg", 70)
        gender = profile.get("gender", "male")
        
        # Check Arms (Asymmetry > 6%, Mass < 4-4.5%)
        ra = profile.get("right_arm_muscle")
        la = profile.get("left_arm_muscle")
        if ra and la and weight_kg > 0:
            if abs(ra - la) / max(ra, la) > 0.06:
                segmental_focus.append("right arm" if ra < la else "left arm")
            arm_thresh = 0.045 if gender == "male" else 0.035
            if (ra / weight_kg) < arm_thresh: segmental_focus.append("right arm")
            if (la / weight_kg) < arm_thresh: segmental_focus.append("left arm")
            
        # Check Legs (Asymmetry > 6%, Mass < 14-15%)
        rl = profile.get("right_leg_muscle")
        ll = profile.get("left_leg_muscle")
        if rl and ll and weight_kg > 0:
            if abs(rl - ll) / max(rl, ll) > 0.06:
                segmental_focus.append("right leg" if rl < ll else "left leg")
            leg_thresh = 0.145 if gender == "male" else 0.135
            if (rl / weight_kg) < leg_thresh: segmental_focus.append("right leg")
            if (ll / weight_kg) < leg_thresh: segmental_focus.append("left leg")
            
        # Check Trunk (Mass < 38-40%)
        tm = profile.get("trunk_muscle")
        if tm and weight_kg > 0:
            trunk_thresh = 0.40 if gender == "male" else 0.38
            if (tm / weight_kg) < trunk_thresh: segmental_focus.append("trunk")
            
        if segmental_focus:
            unique_focus = list(set(segmental_focus))
            # Append to focus string (Frontend parses this)
            analysis["body_type_info"]["focus"] += f" (Weaknesses: {', '.join(unique_focus)})"
        else:
            # If no specific weakness found, but user needs training (default behavior)
            # If beginner or muscle building needed, suggest Full Body
            if body_type in ["beginner", "skinny_fat", "lean_beginner", "obese", "overweight"]:
                analysis["body_type_info"]["focus"] += " (Focus: Right Arm, Left Arm, Right Leg, Left Leg, Trunk)"
        
        # Perform weakness analysis ONLY if we have actual InBody data
        try:
            from . import inbody_analysis
            
            # Only perform analysis if we have sufficient data
            has_sufficient_data = all([
                bf_percent is not None,
                muscle_mass is not None,
                weight > 0
            ])
            
            if has_sufficient_data:
                # Prepare InBody data for analysis
                inbody_data = {
                    "body_fat_percent": bf_percent,
                    "muscle_percent": muscle_percent,
                    "skeletal_muscle_mass": muscle_mass,
                    "visceral_fat_level": profile.get("visceral_fat_level"),
                    "body_water_percent": profile.get("body_water_percent"),
                    "bmr": profile.get("bmr"),
                    "weight": weight,
                    # Add segmental data if available (for future enhancement)
                    "right_arm_muscle": profile.get("right_arm_muscle"),
                    "left_arm_muscle": profile.get("left_arm_muscle"),
                    "trunk_muscle": profile.get("trunk_muscle"),
                    "right_leg_muscle": profile.get("right_leg_muscle"),
                    "left_leg_muscle": profile.get("left_leg_muscle")
                }
                
                # Analyze weaknesses
                weaknesses = inbody_analysis.analyze_body_weaknesses(inbody_data, body_type)
                analysis["weaknesses"] = weaknesses
                
                # Generate targeted recommendations
                if weaknesses:
                    recommendations = inbody_analysis.generate_weakness_recommendations(weaknesses, body_type)
                    analysis["weakness_recommendations"] = recommendations
        except Exception as e:
            print(f"Warning: Could not perform weakness analysis: {e}")
            # Continue without weakness analysis if module fails
    
    return analysis

# Recommendation Engine
def get_workout_recommendations(user_id):
    profile = get_user_profile(user_id)
    if not profile:
        return None
    
    # Get comprehensive workout plan
    workout_plan = workout_plans.get_comprehensive_workout_plan(user_id, profile)
    
    # Get starting recommendations
    starting_guide = workout_plans.get_starting_recommendations(profile)
    
    return {
        "workout_plan": workout_plan,
        "starting_guide": starting_guide,
        "exercises": workout_plans.EXERCISE_DATABASE
    }

def get_meal_recommendations(user_id):
    profile = get_user_profile(user_id)
    if not profile:
        return None
    
    weight_kg = profile.get("weight_kg", 70)
    height_cm = profile.get("height_cm", 170)
    age = profile.get("age", 25)
    gender = profile.get("gender", "male")
    goals = profile.get("goals", [])
    
    # --- Scientific Nutrition Calculation (ISSN Guidelines) ---
    # Standards based on: Jäger et al. (2017). International Society of Sports Nutrition Position Stand: protein and exercise.
    
    # 1. BMR Calculation (Mifflin-St Jeor Equation - most accurate without lean mass data)
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age
    bmr = bmr + 5 if gender == "male" else bmr - 161
    
    # 2. TDEE (Total Daily Energy Expenditure)
    # Assumes Moderate Activity (1.55) as baseline for app users
    tdee = bmr * 1.55 
    
    # 3. Goal Adjustment & Protein Needs
    # Protein: 
    # - Muscle Building: 1.6-2.2 g/kg (ISSN)
    # - Fat Loss: 1.8-2.5 g/kg to preserve lean mass
    # - General/Maintenance: 1.4-1.6 g/kg
    
    if "weight_loss" in goals:
        target_calories = int(tdee - 500) # Standard 500kcal deficit
        protein_multiplier = 2.0 # Higher protein to spare muscle
        goal_text = "Fat Loss (Deficit)"
    elif "strength" in goals or "muscle_building" in goals:
        target_calories = int(tdee + 250) # Lean bulk surplus
        protein_multiplier = 1.8 
        goal_text = "Lean Muscle Gain (Surplus)"
    else:
        target_calories = int(tdee)
        protein_multiplier = 1.6
        goal_text = "Maintenance"

    # 4. Macro Calculation
    # Protein
    protein_g = int(weight_kg * protein_multiplier)
    
    # Fats (Standard: 0.8g - 1.0g per kg for hormonal health)
    fat_g = int(weight_kg * 0.9)
    
    # Carbs (Remainder)
    # 1g Protein = 4kcal, 1g Fat = 9kcal, 1g Carb = 4kcal
    calories_used = (protein_g * 4) + (fat_g * 9)
    remaining_calories = max(0, target_calories - calories_used)
    carbs_g = int(remaining_calories / 4)
    
    meal_plan = {
        "daily_calories": target_calories,
        "macros": {
            "protein": protein_g,
            "fats": fat_g,
            "carbs": carbs_g
        },
        "goal_type": goal_text,
        "protein_g": protein_g, # Kept for backward compatibility
        "meals": [
            {"meal": "Breakfast", "calories": int(target_calories * 0.3), "suggestion": "Oatmeal (Carbs) + Eggs (Protein & Fats)", "macros": f"P: {int(protein_g*0.25)}g"},
            {"meal": "Lunch", "calories": int(target_calories * 0.35), "suggestion": "Grilled Chicken Breast + Brown Rice + Avocado", "macros": f"P: {int(protein_g*0.35)}g"},
            {"meal": "Dinner", "calories": int(target_calories * 0.35), "suggestion": "Salmon (Fats/Protein) + Quinoa + Asparagus", "macros": f"P: {int(protein_g*0.35)}g"}
        ]
    }
    
    return meal_plan

# Coach Matching
def calculate_coach_match_score(coach, user_profile):
    """
    Calculate how well a coach matches a user's profile (0-100)
    Based on fitness level compatibility and goals alignment
    """
    if not user_profile:
        return 50  # Neutral score if no profile
    
    score = 0
    
    # 1. Fitness Level Match (60% weight)
    user_level = user_profile.get("fitness_level", "beginner")
    coach_difficulty = coach.get("difficulty", "beginner")
    
    level_map = {"beginner": 0, "intermediate": 1, "advanced": 2}
    user_level_num = level_map.get(user_level, 0)
    coach_level_num = level_map.get(coach_difficulty, 0)
    
    level_diff = abs(user_level_num - coach_level_num)
    
    if level_diff == 0:
        score += 60  # Perfect match
    elif level_diff == 1:
        score += 35  # One level off
    else:
        score += 10  # Two levels off
    
    # 2. Goals Alignment (40% weight)
    user_goals = user_profile.get("goals", [])
    coach_specialty = coach.get("specialty", "").lower()
    
    if not user_goals:
        score += 20  # Neutral if no goals specified
    else:
        # Check if coach specialty aligns with user goals
        if "strength" in user_goals and coach_difficulty == "advanced":
            score += 40
        elif "endurance" in user_goals and coach_difficulty == "intermediate":
            score += 40
        elif "weight_loss" in user_goals and coach_difficulty == "beginner":
            score += 40
        else:
            score += 20
    
    return min(100, score)

def get_coach_recommendations(user_id):
    """
    Get all coaches with match scores for a user
    """
    profile = get_user_profile(user_id)
    coaches = get_all_coaches()
    
    coach_matches = []
    for coach in coaches:
        match_score = calculate_coach_match_score(coach, profile)
        coach_with_score = coach.copy()
        coach_with_score["match_score"] = match_score
        coach_matches.append(coach_with_score)
    
    # Sort by match score descending
    coach_matches.sort(key=lambda x: x["match_score"], reverse=True)
    
    return coach_matches


# Smart BMI Recommendations
def get_smart_bmi_recommendation(profile):
    """
    Get personalized BMI target and recommendations based on current BMI status
    
    Args:
        profile: User profile dict containing BMI, weight, height, gender
    
    Returns:
        Dict containing:
            - current_bmi: Current BMI value
            - bmi_category: Category (underweight/healthy/overweight/obese)
            - target_bmi_range: Recommended BMI range  
            - target_weight_range: Recommended weight range in kg
            - recommendation: Personalized advice
            - priority: Focus area (gain_weight/maintain/lose_weight)
            - comprehensive_targets: For healthy BMI users (body fat + muscle + visceral fat)
    """
    current_bmi = profile.get('bmi')
    current_weight = profile.get('weight_kg')
    height_cm = profile.get('height_cm')
    gender = profile.get('gender', 'male')
    
    # Current InBody data
    current_bf = profile.get('body_fat_percent')
    current_muscle = profile.get('skeletal_muscle_mass')
    current_visceral = profile.get('visceral_fat_level')
    
    if not all([current_bmi, current_weight, height_cm]):
        return None
    
    height_m = height_cm / 100
    
    # Determine BMI category and recommendations
    if current_bmi < 18.5:
        category = 'underweight'
        category_label = '過輕'
        target_bmi_min = 20.0
        target_bmi_max = 22.0
        priority = 'gain_weight'
        recommendation = '您的 BMI 偏低，建議增加熱量攝取並專注於力量訓練以增加肌肉量。建議攝取足夠蛋白質（每公斤體重 1.6-2.2 克）並進行漸進式阻力訓練。'
        color = 'blue'
        
        # Tasks for underweight users
        comprehensive_targets = {
            'weight_gain': {
                'target': f'{target_bmi_min * (height_m ** 2):.1f}-{target_bmi_max * (height_m ** 2):.1f} kg',
                'current': current_weight,
                'to_gain': max(0, target_bmi_min * (height_m ** 2) - current_weight),
                'tasks': [
                    '增加熱量攝取：每日攝取比消耗多 300-500 卡',
                    '攝取高蛋白質食物：每公斤體重 1.6-2.2 克（雞肉、魚、蛋、豆類、乳製品）',
                    '每週進行 3-4 次力量訓練，專注於複合動作（深蹲、硬舉、臥推）',
                    '增加健康脂肪攝取（堅果、酪梨、橄欖油）',
                    '少量多餐：每天 5-6 餐，包含點心',
                    '訓練後補充：碳水+蛋白質組合促進肌肉生長',
                    '充足睡眠（8-9 小時）以促進恢復和生長',
                    '避免過度有氧運動（會消耗熱量）'
                ]
            }
        }
        
    elif 18.5 <= current_bmi < 24:
        category = 'healthy'
        category_label = '健康'
        target_bmi_min = current_bmi
        target_bmi_max = current_bmi
        priority = 'comprehensive_health'
        recommendation = '您的 BMI 在健康範圍內！建議關注綜合健康指標：優化體脂率、增加肌肉量、維持低內臟脂肪。'
        color = 'green'
        
        # Calculate comprehensive health targets
        # Ideal body fat percentage ranges
        if gender == 'male':
            ideal_bf_min = 12.0
            ideal_bf_max = 18.0
            # Ideal muscle mass (based on height)
            ideal_muscle_min = (height_m ** 2) * 11.0
        else:  # female
            ideal_bf_min = 18.0
            ideal_bf_max = 24.0
            ideal_muscle_min = (height_m ** 2) * 7.0
        
        # Ideal visceral fat level
        ideal_visceral_max = 9
        
        comprehensive_targets = {
            'body_fat_percent': {
                'min': ideal_bf_min,
                'max': ideal_bf_max,
                'current': current_bf,
                'status': 'good' if (current_bf and ideal_bf_min <= current_bf <= ideal_bf_max) else 'needs_improvement' if current_bf else 'no_data',
                'tasks': [
                    '每週進行 3-4 次有氧運動（慢跑、游泳、騎車），每次 30-45 分鐘',
                    '控制熱量攝取：創造每日 300-500 卡的熱量赤字',
                    '減少精緻糖和加工食品攝取',
                    '增加高纖維食物（蔬菜、全穀物）的比例'
                ]
            },
            'skeletal_muscle_mass': {
                'min': ideal_muscle_min,
                'current': current_muscle,
                'status': 'good' if (current_muscle and current_muscle >= ideal_muscle_min) else 'needs_improvement' if current_muscle else 'no_data',
                'tasks': [
                    '每週進行 2-3 次全身性力量訓練',
                    '每次訓練包含：深蹲、硬舉、臥推、划船等複合動作',
                    '攝取足夠蛋白質：每公斤體重 1.6-2.2 克（例如：雞胸肉、魚、蛋、豆類）',
                    '訓練後 30 分鐘內補充蛋白質和碳水化合物',
                    '保證充足睡眠（每晚 7-9 小時）以促進肌肉恢復'
                ]
            },
            'visceral_fat_level': {
                'max': ideal_visceral_max,
                'current': current_visceral,
                'status': 'good' if (current_visceral and current_visceral <= ideal_visceral_max) else 'needs_improvement' if current_visceral else 'no_data',
                'tasks': [
                    '增加中高強度間歇訓練（HIIT），每週 2-3 次',
                    '減少腹部脂肪堆積：避免久坐，每小時起身活動 5 分鐘',
                    '限制酒精攝取（酒精會增加內臟脂肪）',
                    '減少反式脂肪和飽和脂肪（油炸食物、加工肉品）',
                    '增加 Omega-3 脂肪酸（深海魚、亞麻籽、核桃）'
                ]
            }
        }
        
    elif 24 <= current_bmi < 27:
        category = 'overweight'
        category_label = '過重'
        target_bmi_min = 21.0
        target_bmi_max = 23.0
        priority = 'lose_weight'
        recommendation = '您的 BMI 略高於標準，建議適度減脂。增加有氧運動頻率（每週 150-300 分鐘中等強度），搭配力量訓練以維持肌肉量。控制熱量攝取，創造適度熱量赤字。'
        color = 'orange'
        
        # Tasks for overweight users
        comprehensive_targets = {
            'weight_loss': {
                'target': f'{target_bmi_min * (height_m ** 2):.1f}-{target_bmi_max * (height_m ** 2):.1f} kg',
                'current': current_weight,
                'to_lose': max(0, current_weight - target_bmi_max * (height_m ** 2)),
                'tasks': [
                    '每週進行 4-5 次有氧運動（快走、慢跑、游泳、騎車），each 40-60 分鐘',
                    '每週 2-3 次力量訓練，維持肌肉量，提高代謝率',
                    '控制熱量攝取：創造每日 500-750 卡的熱量赤字',
                    '減少精緻碳水化合物（白飯、麵包、甜點）的攝取',
                    '增加蔬菜攝取量（每餐至少半盤蔬菜）',
                    '避免含糖飲料和高熱量零食',
                    '每週目標減重 0.5-1 公斤（健康減重速度）'
                ]
            }
        }
        
    else:  # BMI >= 27
        category = 'obese'
        category_label = '肥胖'
        target_bmi_min = 22.0
        target_bmi_max = 24.0
        priority = 'lose_weight'
        recommendation = '您的 BMI 偏高，建議將減重作為首要目標。結合有氧運動和力量訓練，並諮詢營養師制定個性化飲食計劃。建議逐步減重（每週 0.5-1 公斤），避免過快減重導致肌肉流失。'
        color = 'red'
        
        # Tasks for obese users
        comprehensive_targets = {
            'weight_loss': {
                'target': f'{target_bmi_min * (height_m ** 2):.1f}-{target_bmi_max * (height_m ** 2):.1f} kg',
                'current': current_weight,
                'to_lose': max(0, current_weight - target_bmi_max * (height_m ** 2)),
                'tasks': [
                    '從低強度運動開始：每天至少 30 分鐘快走或游泳',
                    '逐步增加運動強度和時間（避免受傷）',
                    '每週 2 次力量訓練，保護關節，增加肌肉',
                    '諮詢營養師制定個人化飲食計劃',
                    '嚴格控制熱量攝取：創造每日 500-1000 卡赤字',
                    '採用高蛋白、低碳水、中脂肪飲食策略',
                    '記錄飲食日記，追蹤每日攝取',
                    '充足睡眠（7-9 小時），降低壓力',
                    '設定階段性目標：先減重 10%，再逐步進行'
                ]
            }
        }
    
    # Calculate target weight range (only for non-healthy BMI)
    if priority != 'comprehensive_health':
        target_weight_min = target_bmi_min * (height_m ** 2)
        target_weight_max = target_bmi_max * (height_m ** 2)
        weight_to_lose = max(0, current_weight - target_weight_max)
        weight_to_gain = max(0, target_weight_min - current_weight)
    else:
        target_weight_min = current_weight
        target_weight_max = current_weight
        weight_to_lose = 0
        weight_to_gain = 0
    
    return {
        'current_bmi': round(current_bmi, 1),
        'bmi_category': category,
        'bmi_category_label': category_label,
        'target_bmi_range': {
            'min': round(target_bmi_min, 1),
            'max': round(target_bmi_max, 1)
        },
        'target_weight_range': {
            'min': round(target_weight_min, 1),
            'max': round(target_weight_max, 1)
        },
        'weight_change': {
            'to_lose': round(weight_to_lose, 1) if weight_to_lose > 0 else 0,
            'to_gain': round(weight_to_gain, 1) if weight_to_gain > 0 else 0
        },
        'recommendation': recommendation,
        'priority': priority,
        'color': color,
        'comprehensive_targets': comprehensive_targets
    }


