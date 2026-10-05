"""
InBody Data Analysis and Body Weakness Detection
Analyzes InBody composition data to identify areas needing improvement
"""

def analyze_body_weaknesses(inbody_data, body_type):
    """
    Analyze InBody data to identify weak areas that need improvement
    
    Args:
        inbody_data: Dictionary containing InBody measurements
        body_type: Classified body type (e.g., 'skinny_fat', 'lean_athletic')
    
    Returns:
        List of weakness dictionaries with area, severity, and reason
    """
    weaknesses = []
    
    if not inbody_data:
        return weaknesses
    
    # Extract relevant metrics
    body_fat_percent = inbody_data.get('body_fat_percent')
    muscle_percent = inbody_data.get('muscle_percent')
    skeletal_muscle_mass = inbody_data.get('skeletal_muscle_mass')
    visceral_fat_level = inbody_data.get('visceral_fat_level')
    body_water_percent = inbody_data.get('body_water_percent')
    bmr = inbody_data.get('bmr')
    weight = inbody_data.get('weight')
    
    # Segmental analysis (if available)
    right_arm_muscle = inbody_data.get('right_arm_muscle')
    left_arm_muscle = inbody_data.get('left_arm_muscle')
    trunk_muscle = inbody_data.get('trunk_muscle')
    right_leg_muscle = inbody_data.get('right_leg_muscle')
    left_leg_muscle = inbody_data.get('left_leg_muscle')
    
    # 1. BODY FAT ANALYSIS
    if body_fat_percent is not None:
        if body_fat_percent > 25:  # High body fat (for males; adjust for females)
            weaknesses.append({
                "area": "abs",
                "severity": "critical" if body_fat_percent > 30 else "moderate",
                "reason": f"High body fat ({body_fat_percent:.1f}%) - Focus on core training and cardio",
                "metric": "body_fat",
                "value": body_fat_percent
            })
        elif body_fat_percent < 8:  # Too low
            weaknesses.append({
                "area": "core",
                "severity": "moderate",
                "reason": f"Very low body fat ({body_fat_percent:.1f}%) - May need more calories",
                "metric": "body_fat",
                "value": body_fat_percent
            })
    
    # 2. MUSCLE MASS ANALYSIS
    if muscle_percent is not None:
        if muscle_percent < 35:  # Low muscle percentage
            weaknesses.append({
                "area": "arms",
                "severity": "moderate",
                "reason": f"Low muscle mass ({muscle_percent:.1f}%) - Strength training needed",
                "metric": "muscle_percent",
                "value": muscle_percent
            })
            weaknesses.append({
                "area": "legs",
                "severity": "moderate",
                "reason": f"Build overall muscle mass with compound movements",
                "metric": "muscle_percent",
                "value": muscle_percent
            })
    
    # 3. VISCERAL FAT ANALYSIS
    if visceral_fat_level is not None:
        if visceral_fat_level > 10:
            weaknesses.append({
                "area": "abs",
                "severity": "critical" if visceral_fat_level > 15 else "moderate",
                "reason": f"High visceral fat (Level {visceral_fat_level}) - Cardio + diet crucial",
                "metric": "visceral_fat",
                "value": visceral_fat_level
            })
    
    # 4. SEGMENTAL MUSCLE ANALYSIS (if available)
    if all(v is not None for v in [right_arm_muscle, left_arm_muscle, trunk_muscle, right_leg_muscle, left_leg_muscle]):
        avg_muscle = (right_arm_muscle + left_arm_muscle + trunk_muscle + right_leg_muscle + left_leg_muscle) / 5
        
        # Check arm balance
        arm_imbalance = abs(right_arm_muscle - left_arm_muscle)
        if arm_imbalance > avg_muscle * 0.1:  # More than 10% difference
            weaker_arm = "right" if right_arm_muscle < left_arm_muscle else "left"
            weaknesses.append({
                "area": "arms",
                "severity": "moderate",
                "reason": f"{weaker_arm.capitalize()} arm weaker - Focus on unilateral exercises",
                "metric": "arm_balance",
                "value": arm_imbalance
            })
        
        # Check if arms are weak overall
        avg_arm = (right_arm_muscle + left_arm_muscle) / 2
        if avg_arm < avg_muscle * 0.8:
            weaknesses.append({
                "area": "arms",
                "severity": "moderate",
                "reason": "Arms need more development - Add isolation work",
                "metric": "arm_muscle",
                "value": avg_arm
            })
        
        # Check core/trunk strength
        if trunk_muscle < avg_muscle * 0.9:
            weaknesses.append({
                "area": "abs",
                "severity": "moderate",
                "reason": "Core strength below average - Add dedicated core work",
                "metric": "trunk_muscle",
                "value": trunk_muscle
            })
        
        # Check leg balance
        leg_imbalance = abs(right_leg_muscle - left_leg_muscle)
        if leg_imbalance > avg_muscle * 0.1:
            weaker_leg = "right" if right_leg_muscle < left_leg_muscle else "left"
            weaknesses.append({
                "area": "legs",
                "severity": "moderate",
                "reason": f"{weaker_leg.capitalize()} leg weaker - Include single-leg exercises",
                "metric": "leg_balance",
                "value": leg_imbalance
            })
        
        # Check overall leg development
        avg_leg = (right_leg_muscle + left_leg_muscle) / 2
        if avg_leg < avg_muscle:
            weaknesses.append({
                "area": "legs",
                "severity": "moderate",
                "reason": "Legs need more volume - Increase squat/deadlift frequency",
                "metric": "leg_muscle",
                "value": avg_leg
            })
    
    # 5. BODY TYPE SPECIFIC ANALYSIS
    if body_type == 'skinny_fat':
        # Typically weak core and overall muscle
        weaknesses.append({
            "area": "abs",
            "severity": "moderate",
            "reason": "Typical for skinny-fat: Build core strength first",
            "metric": "body_type",
            "value": body_type
        })
        weaknesses.append({
            "area": "chest",
            "severity": "moderate",
            "reason": "Focus on upper body compound lifts",
            "metric": "body_type",
            "value": body_type
        })
    
    elif body_type == 'lean_beginner':
        # Needs overall mass
        weaknesses.append({
            "area": "arms",
            "severity": "moderate",
            "reason": "Build foundational strength in all muscle groups",
            "metric": "body_type",
            "value": body_type
        })
        weaknesses.append({
            "area": "shoulders",
            "severity": "moderate",
            "reason": "Develop shoulder width with overhead pressing",
            "metric": "body_type",
            "value": body_type
        })
    
    elif body_type == 'bulky':
        # Typically needs cardio and core definition
        weaknesses.append({
            "area": "abs",
            "severity": "moderate",
            "reason": "Focus on core definition and fat loss",
            "metric": "body_type",
            "value": body_type
        })
    
    # 6. WATER RETENTION / HYDRATION
    if body_water_percent is not None:
        if body_water_percent < 50:
            weaknesses.append({
                "area": "core",
                "severity": "moderate",
                "reason": f"Low body water ({body_water_percent:.1f}%) - Increase hydration",
                "metric": "water_percent",
                "value": body_water_percent
            })
    
    # Remove duplicates by area (keep highest severity)
    unique_weaknesses = {}
    for w in weaknesses:
        area = w['area']
        if area not in unique_weaknesses or w['severity'] == 'critical':
            unique_weaknesses[area] = w
    
    return list(unique_weaknesses.values())


def generate_weakness_recommendations(weaknesses, body_type):
    """
    Generate targeted workout recommendations based on identified weaknesses
    
    Args:
        weaknesses: List of weakness dictionaries
        body_type: User's body type
    
    Returns:
        Dictionary with recommended exercises for weak areas
    """
    from .workout_plans import EXERCISE_DATABASE
    
    recommendations = {
        "priority_exercises": [],
        "supplementary_exercises": [],
        "focus_areas": []
    }
    
    # Map weaknesses to muscle groups and exercises
    weakness_exercise_map = {
        "abs": {
            "beginner": EXERCISE_DATABASE["core"]["beginner"],
            "intermediate": EXERCISE_DATABASE["core"]["intermediate"],
            "advanced": EXERCISE_DATABASE["core"]["advanced"]
        },
        "arms": {
            "beginner": EXERCISE_DATABASE["pull"]["beginner"][:2],  # Bicep focused
            "intermediate": EXERCISE_DATABASE["pull"]["intermediate"][-2:],  # Curls
            "advanced": EXERCISE_DATABASE["pull"]["advanced"][-2:]
        },
        "chest": {
            "beginner": EXERCISE_DATABASE["push"]["beginner"][:3],
            "intermediate": EXERCISE_DATABASE["push"]["intermediate"][:3],
            "advanced": EXERCISE_DATABASE["push"]["advanced"][:3]
        },
        "shoulders": {
            "beginner": EXERCISE_DATABASE.get("shoulders", {}).get("beginner", []),
            "intermediate": EXERCISE_DATABASE.get("shoulders", {}).get("intermediate", []),
            "advanced": EXERCISE_DATABASE.get("shoulders", {}).get("advanced", [])
        },
        "legs": {
            "beginner": EXERCISE_DATABASE["legs"]["beginner"][:3],
            "intermediate": EXERCISE_DATABASE["legs"]["intermediate"][:3],
            "advanced": EXERCISE_DATABASE["legs"]["advanced"][:3]
        },
        "back": {
            "beginner": EXERCISE_DATABASE.get("back", {}).get("beginner", []),
            "intermediate": EXERCISE_DATABASE.get("back", {}).get("intermediate", []),
            "advanced": EXERCISE_DATABASE.get("back", {}).get("advanced", [])
        },
        "core": {
            "beginner": EXERCISE_DATABASE["core"]["beginner"],
            "intermediate": EXERCISE_DATABASE["core"]["intermediate"],
            "advanced": EXERCISE_DATABASE["core"]["advanced"]
        }
    }
    
    # Determine fitness level based on body type
    fitness_level = "beginner"
    if body_type in ["lean_athletic", "bulky"]:
        fitness_level = "intermediate"
    
    # Generate recommendations for each weakness
    for weakness in weaknesses:
        area = weakness['area']
        severity = weakness['severity']
        
        recommendations["focus_areas"].append({
            "area": area,
            "reason": weakness['reason'],
            "severity": severity
        })
        
        # Get exercises for this area
        if area in weakness_exercise_map:
            exercises = weakness_exercise_map[area].get(fitness_level, [])
            
            if severity == 'critical':
                # Add to priority
                recommendations["priority_exercises"].extend(exercises[:2])
            else:
                # Add to supplementary
                recommendations["supplementary_exercises"].extend(exercises[:1])
    
    return recommendations
