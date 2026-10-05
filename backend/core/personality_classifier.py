"""
Fitness Personality Classifier

Analyzes user training patterns to determine their fitness personality type.
5 Personality Types:
- Powerlifter: Low reps, high intensity, compound focus
- Athlete: High variety, explosive movements, mixed training
- Grinder: High volume, high frequency, consistent
- Balanced: Even distribution across muscle groups
- Specialist: Focused on specific muscle groups
"""

from datetime import datetime, timedelta
from typing import Dict, List, Any
import statistics

# Personality traits and recommendations
PERSONALITY_TRAITS = {
    "powerlifter": [
        "Quality over quantity",
        "Strength is your throne",
        "Built for maximum force",
        "Heavy compound lifts",
        "Low rep mastery"
    ],
    "athlete": [
        "Speed and power combined",
        "Versatility is strength",
        "Train like a champion",
        "Dynamic movement",
        "Explosive performance"
    ],
    "grinder": [
        "Consistency is key",
        "Volume builds muscle",
        "Slow and steady wins",
        "Never miss a workout",
        "High work capacity"
    ],
    "balanced": [
        "Harmony in training",
        "Complete development",
        "Master of all trades",
        "Well-rounded strength",
        "Proportional gains"
    ],
    "specialist": [
        "Master your craft",
        "Precision over breadth",
        "Elite specialization",
        "Focused excellence",
        "Deep expertise"
    ]
}

PERSONALITY_RECOMMENDATIONS = {
    "powerlifter": [
        "Progressive overload on main lifts (Squat, Bench, Deadlift)",
        "Implement deload weeks every 4-6 weeks to prevent burnout",
        "Add mobility work to prevent injuries from heavy lifting",
        "Track 1RM progress on compound movements",
        "Consider accessory work for weak points"
    ],
    "athlete": [
        "Add plyometric training for explosive power",
        "Include agility and speed drills",
        "Vary your training modalities regularly",
        "Focus on sport-specific conditioning",
        "Balance strength with mobility work"
    ],
    "grinder": [
        "Manage fatigue carefully - more isn't always better",
        "Prioritize sleep and recovery nutrition",
        "Implement periodization to prevent overtraining",
        "Consider lower volume blocks to resensitize",
        "Track recovery metrics closely"
    ],
    "balanced": [
        "Maintain your excellent training balance",
        "Vary rep ranges across workouts (3-5, 6-12, 12-20)",
        "Continue full-body or balanced split approach",
        "Progressive overload across all movements",
        "Focus on movement quality"
    ],
    "specialist": [
        "Address potential muscle imbalances",
        "Add training for underdeveloped areas",
        "Cross-train to prevent overuse injuries",
        "Maintain your specialization but add variety",
        "Monitor for signs of overuse"
    ]
}


def classify_fitness_personality(training_records: Dict, weeks: int = 4) -> Dict[str, Any]:
    """
    Main classification function
    
    Args:
        training_records: Dict of training records from localStorage
        weeks: Number of weeks to analyze
    
    Returns:
        Dict containing personality type, confidence, scores, traits, and recommendations
    """
    
    try:
        # Filter to recent weeks with better date parsing
        cutoff_date = datetime.now() - timedelta(weeks=weeks)
        recent_records = {}
        
        for date, record in training_records.items():
            try:
                # Try multiple date formats
                date_obj = None
                # Format 1: ISO format with Z
                if 'Z' in date:
                    date_obj = datetime.fromisoformat(date.replace('Z', '+00:00'))
                # Format 2: Standard ISO format
                elif 'T' in date:
                    date_obj = datetime.fromisoformat(date.split('.')[0])  # Remove microseconds if present
                # Format 3: Simple date format YYYY-MM-DD
                else:
                    date_obj = datetime.strptime(date, '%Y-%m-%d')
                
                if date_obj and date_obj >= cutoff_date:
                    recent_records[date] = record
            except Exception as date_error:
                print(f"[Personality] Warning: Could not parse date '{date}': {date_error}")
                continue
        
        if not recent_records:
            print("[Personality] No recent records found, returning default")
            return get_default_personality()
        
        print(f"[Personality] Analyzing {len(recent_records)} records from the last {weeks} weeks")
        
        # Calculate metrics
        metrics = calculate_training_metrics(recent_records)
        
        # Score each personality
        scores = {
            "powerlifter": score_powerlifter(metrics),
            "athlete": score_athlete(metrics),
            "grinder": score_grinder(metrics),
            "balanced": score_balanced(metrics),
            "specialist": score_specialist(metrics)
        }
        
        # Determine primary personality
        primary = max(scores, key=scores.get)
        confidence = scores[primary]
        
        print(f"[Personality] Classification complete: {primary} ({confidence}% confidence)")
        
        return {
            "type": primary,
            "confidence": round(confidence, 1),
            "scores": {k: round(v, 1) for k, v in scores.items()},
            "traits": PERSONALITY_TRAITS[primary],
            "recommendations": PERSONALITY_RECOMMENDATIONS[primary],
            "weeks_analyzed": weeks,
            "metrics": metrics
        }
    except Exception as e:
        print(f"[Personality] Error in classification: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return default on error
        return get_default_personality()


def calculate_training_metrics(records: Dict) -> Dict[str, Any]:
    """Calculate various training metrics from records"""
    
    total_reps = []
    total_sets = 0
    unique_exercises = set()
    muscle_volumes = {}
    compound_sets = 0
    total_weight_reps = 0  # For intensity calculation
    
    workout_dates = set()
    
    for date, record in records.items():
        workout_dates.add(date)
        
        if not isinstance(record, dict):
            continue
            
        exercises = record.get('exercises', [])
        muscles = record.get('muscles', [])
        
        # Process exercises
        for exercise in exercises:
            if not isinstance(exercise, dict):
                continue
                
            ex_name = exercise.get('name', '').lower()
            unique_exercises.add(ex_name)
            
            # Check if compound movement
            compound_keywords = ['squat', 'deadlift', 'bench', 'press', 'row', 'pull', 'chin']
            is_compound = any(keyword in ex_name for keyword in compound_keywords)
            
            sets = exercise.get('sets', [])
            for set_data in sets:
                if not isinstance(set_data, dict):
                    continue
                    
                reps = set_data.get('reps', 0)
                weight = set_data.get('weight', 0)
                
                if reps > 0:
                    total_reps.append(reps)
                    total_sets += 1
                    
                    if is_compound:
                        compound_sets += 1
                    
                    if weight > 0:
                        total_weight_reps += weight * reps
        
        # Track muscle volumes
        volume = record.get('volume', 0)
        if muscles and volume > 0:
            volume_per_muscle = volume / len(muscles)
            for muscle in muscles:
                muscle_volumes[muscle] = muscle_volumes.get(muscle, 0) + volume_per_muscle
    
    # Calculate derived metrics
    avg_reps = statistics.mean(total_reps) if total_reps else 10
    exercise_variety = len(unique_exercises)
    
    # Calculate weekly frequency
    weeks_span = len(workout_dates) / 7 if workout_dates else 1
    frequency = len(workout_dates) / max(weeks_span, 1)
    
    # Compound ratio
    compound_ratio = compound_sets / total_sets if total_sets > 0 else 0
    
    # Muscle distribution variance
    muscle_distribution = calculate_muscle_distribution(muscle_volumes)
    
    return {
        "avg_reps": avg_reps,
        "exercise_variety": exercise_variety,
        "total_sets": total_sets,
        "frequency": frequency,
        "muscle_distribution": muscle_distribution,
        "compound_ratio": compound_ratio,
        "total_workouts": len(workout_dates)
    }


def calculate_muscle_distribution(muscle_volumes: Dict[str, float]) -> Dict[str, float]:
    """Calculate percentage distribution of volume across muscle groups"""
    if not muscle_volumes:
        return {}
    
    total = sum(muscle_volumes.values())
    if total == 0:
        return {}
    
    return {
        muscle: (volume / total) * 100
        for muscle, volume in muscle_volumes.items()
    }


def score_powerlifter(metrics: Dict) -> float:
    """Score based on low reps, high intensity, compound focus"""
    score = 0.0
    
    avg_reps = metrics.get("avg_reps", 10)
    compound_ratio = metrics.get("compound_ratio", 0)
    frequency = metrics.get("frequency", 0)
    exercise_variety = metrics.get("exercise_variety", 0)
    
    # Low average reps (< 6) = higher score
    if avg_reps < 6:
        score += 40
    elif avg_reps < 8:
        score += 25
    elif avg_reps < 10:
        score += 10
    
    # High compound ratio
    if compound_ratio > 0.7:
        score += 35
    elif compound_ratio > 0.5:
        score += 20
    
    # Lower frequency (quality over quantity)
    if frequency <= 4:
        score += 15
    
    # Focused exercise selection (fewer exercises = more specialized)
    if exercise_variety < 8:
        score += 10
    
    return min(score, 100)


def score_athlete(metrics: Dict) -> float:
    """Score based on exercise variety, balanced approach"""
    score = 0.0
    
    exercise_variety = metrics.get("exercise_variety", 0)
    avg_reps = metrics.get("avg_reps", 10)
    frequency = metrics.get("frequency", 0)
    
    # High exercise variety
    if exercise_variety > 15:
        score += 50
    elif exercise_variety > 12:
        score += 35
    elif exercise_variety > 10:
        score += 20
    
    # Mixed rep ranges (8-12 is moderate)
    if 8 <= avg_reps <= 12:
        score += 25
    
    # Moderate-high frequency
    if 4 <= frequency <= 6:
        score += 25
    elif frequency > 6:
        score += 15
    
    return min(score, 100)


def score_grinder(metrics: Dict) -> float:
    """Score based on high volume and frequency"""
    score = 0.0
    
    total_sets = metrics.get("total_sets", 0)
    frequency = metrics.get("frequency", 0)
    avg_reps = metrics.get("avg_reps", 10)
    
    # High total sets per week
    sets_per_week = total_sets / 4  # Assuming 4 weeks analyzed
    
    if sets_per_week > 100:
        score += 40
    elif sets_per_week > 80:
        score += 30
    elif sets_per_week > 60:
        score += 20
    
    # High frequency
    if frequency > 6:
        score += 40
    elif frequency >= 5:
        score += 30
    elif frequency >= 4:
        score += 15
    
    # Higher reps (12+)
    if avg_reps > 15:
        score += 20
    elif avg_reps > 12:
        score += 15
    
    return min(score, 100)


def score_balanced(metrics: Dict) -> float:
    """Score based on even distribution across muscle groups"""
    score = 0.0
    
    muscle_dist = metrics.get("muscle_distribution", {})
    avg_reps = metrics.get("avg_reps", 10)
    frequency = metrics.get("frequency", 0)
    
    if muscle_dist:
        # Calculate variance in muscle distribution
        percentages = list(muscle_dist.values())
        if len(percentages) >= 3:
            variance = statistics.variance(percentages) if len(percentages) > 1 else 0
            std_dev = variance ** 0.5
            
            # Low variance = well balanced (coefficient of variation)
            cv = std_dev / statistics.mean(percentages) if statistics.mean(percentages) > 0 else 1
            
            if cv < 0.3:
                score += 60
            elif cv < 0.5:
                score += 40
            elif cv < 0.7:
                score += 20
    
    # Moderate rep range
    if 8 <= avg_reps <= 12:
        score += 20
    
    # Moderate frequency
    if 3 <= frequency <= 5:
        score += 20
    elif 5 < frequency <= 6:
        score += 10
    
    return min(score, 100)


def score_specialist(metrics: Dict) -> float:
    """Score based on focused training on specific muscles"""
    score = 0.0
    
    muscle_dist = metrics.get("muscle_distribution", {})
    exercise_variety = metrics.get("exercise_variety", 0)
    
    if muscle_dist:
        # Check if one muscle group dominates
        percentages = list(muscle_dist.values())
        if percentages:
            max_percentage = max(percentages)
            
            if max_percentage > 40:
                score += 70
            elif max_percentage > 35:
                score += 50
            elif max_percentage > 30:
                score += 30
    
    # Focused exercise selection (fewer exercises)
    if exercise_variety < 8:
        score += 30
    elif exercise_variety < 10:
        score += 15
    
    return min(score, 100)


def get_default_personality() -> Dict[str, Any]:
    """Return default personality for users with no data"""
    return {
        "type": "balanced",
        "confidence": 50.0,
        "scores": {
            "powerlifter": 50.0,
            "athlete": 50.0,
            "grinder": 50.0,
            "balanced": 50.0,
            "specialist": 50.0
        },
        "traits": PERSONALITY_TRAITS["balanced"],
        "recommendations": PERSONALITY_RECOMMENDATIONS["balanced"],
        "weeks_analyzed": 0,
        "metrics": {}
    }
