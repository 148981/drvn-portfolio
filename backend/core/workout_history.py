"""
Workout History and Progress Tracking Module
Manages workout session storage and progress analytics
"""
import os
from .json_cache import save_json_atomic
import json
import pandas as pd
from datetime import datetime
from .json_cache import load_json_cached, save_json_atomic

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
WORKOUT_HISTORY_PATH = os.path.join(DATA_DIR, 'workout_history.json')

# Helper Functions — now cache-backed (no more repeated disk reads)
def load_workout_history():
    return load_json_cached(WORKOUT_HISTORY_PATH, default={})

def save_workout_history(history):
    save_json_atomic(WORKOUT_HISTORY_PATH, history)

# Workout Session Management
def save_workout_session(user_id, workout_data):
    """
    Save a completed workout session
    
    Args:
        user_id: User identifier
        workout_data: Dict containing workout details
            - timestamp: ISO format timestamp
            - coach_id: Selected coach
            - overall_score: Overall performance score (0-100)
            - metrics: Dict of individual metric scores
            - reps_count: Number of repetitions detected
            - fatigue_data: List of per-rep scores
            - exercises: List of exercise objects with sets
            - total_volume: Total weight lifted (kg)
            - duration_mins: Workout duration in minutes
            - focus_group: Primary muscle group targeted
            - body_weight: User's body weight (kg)
            - body_fat: User's body fat percentage
            - pr_alerts: List of PR breakthroughs
    
    Returns:
        session_id: Unique identifier for this workout session
    """
    # Auto-fetch latest InBody data if not provided
    if not workout_data.get('body_weight') or not workout_data.get('body_fat'):
        inbody_records = get_inbody_history(user_id, limit=1)
        if inbody_records:
            latest_inbody = inbody_records[0]
            if not workout_data.get('body_weight'):
                workout_data['body_weight'] = latest_inbody.get('weight_kg')
            if not workout_data.get('body_fat'):
                workout_data['body_fat'] = latest_inbody.get('body_fat_percent')

    # Add session with all fields（session_id 交由 DB repo 產生）
    session = {
        "timestamp": workout_data.get("timestamp", datetime.now().isoformat()),
        "coach_id": workout_data.get("coach_id"),
        "overall_score": workout_data.get("overall_score"),
        "metrics": workout_data.get("metrics", {}),
        "reps_count": workout_data.get("reps_count", 0),
        "fatigue_data": workout_data.get("fatigue_data", []),
        "user_profile_snapshot": workout_data.get("user_profile_snapshot", {}),
        # Extended fields for new workout system
        "exercises": workout_data.get("exercises", []),
        "total_volume": workout_data.get("total_volume", 0),
        "duration_mins": workout_data.get("duration_mins", 0),
        "focus_group": workout_data.get("focus_group"),
        "body_weight": workout_data.get("body_weight"),
        "body_fat": workout_data.get("body_fat"),
        "fatigue_level": workout_data.get("fatigue_level", 0),
        "pr_alerts": workout_data.get("pr_alerts", []),
        "has_pr": workout_data.get("has_pr", False),
        "location_name": workout_data.get("location_name"),  # 📍 在哪裡練（動態卡顯示）
        "gym_id": workout_data.get("gym_id"),        # 🏋️ 在哪間健身房
        "gym_name": workout_data.get("gym_name"),
        "completed_sets_count": workout_data.get("completed_sets_count", workout_data.get("reps_count", 0)),
        
        # KEY ANALYSIS DATA (Previously Missing)
        "chartsData": workout_data.get("chartsData", []),
        "feedback": workout_data.get("feedback", []),
        "arVideoUrl": workout_data.get("arVideoUrl"),
        "concentricFrames": workout_data.get("concentricFrames")
    }

    # Phase 2：統一存進 DB（per-user 的 workout_sessions 表）
    from repositories import workout_session_repo
    stored = workout_session_repo.add_session(user_id, session)
    return stored["session_id"]

def get_user_workout_history(user_id, limit=None):
    """
    Retrieve workout history for a user
    
    Args:
        user_id: User identifier
        limit: Optional limit on number of sessions to return (most recent first)
    
    Returns:
        List of workout sessions, sorted by timestamp descending
    """
    from repositories import workout_session_repo
    return workout_session_repo.get_history(user_id, limit)

def get_progress_stats(user_id):
    """
    Calculate progress statistics and trends for a user
    
    Returns:
        Dict containing:
            - total_workouts: Total number of workouts
            - average_score: Average overall score
            - best_score: Best overall score
            - latest_score: Most recent score
            - improvement_rate: Percentage improvement (recent avg vs older avg)
            - score_trend: List of scores over time for charting
    """
    # 🟢 P3 Fix：改讀 DB（Phase 2 後新 session 只寫 DB），舊 JSON 為輔
    user_sessions = get_user_workout_history(user_id) or load_workout_history().get(user_id, [])
    
    if not user_sessions:
        return {
            "total_workouts": 0,
            "average_score": 0,
            "best_score": 0,
            "latest_score": 0,
            "improvement_rate": 0,
            "score_trend": []
        }
        
    # Calculate scores (with legacy support)
    scores = []
    for s in user_sessions:
        val = s.get("overall_score")
        if val is not None:
            scores.append(val)
        elif s.get("type") == "smart_routine":
            scores.append(90) # Default for legacy routines

    
    avg_score = sum(scores) / len(scores) if scores else 0
    best_score = max(scores) if scores else 0
    latest = scores[0] if scores else 0
    
    # Calculate improvement rate (last 3 vs previous 3)
    improvement = 0
    if len(scores) >= 6:
        recent_avg = sum(scores[:3]) / 3
        prev_avg = sum(scores[3:6]) / 3
        if prev_avg > 0:
            improvement = ((recent_avg - prev_avg) / prev_avg) * 100
            
    # Prepare trend data (reverse chronological for chart)
    # Combine score trend and activity trend
    score_trend = []
    activity_trend = []
    
    # Take last 14 sessions for trends
    recent_sessions = user_sessions[:14]
    
    for s in recent_sessions:
        score_val = s.get("overall_score")
        if score_val is not None:
             score_trend.append({"date": s.get("timestamp", "")[:10], "score": score_val})
        elif s.get("type") == "smart_routine":
             score_trend.append({"date": s.get("timestamp", "")[:10], "score": 90})
             
        # For activity trend, use calories or duration
        activity_trend.append({
            "date": s.get("timestamp", "")[:10],
            "calories": s.get("calories_burned", s.get("metrics", {}).get("calories", 0)),
            "duration": s.get("duration_mins", 0)
        })
    
    score_trend.reverse()
    activity_trend.reverse()
    
    return {
        "total_workouts": len(user_sessions),
        "average_score": int(avg_score),
        "best_score": int(best_score),
        "latest_score": int(latest),
        "improvement_rate": int(improvement),
        "score_trend": score_trend,
        "activity_trend": activity_trend
    }

def log_completed_routine(user_id, routine_data):
    """
    Log a completed Smart Trainer routine
    
    Args:
        user_id: User identifier
        routine_data: Dict containing generated routine details
    """
    # Extract duration int
    duration = 0
    if "duration" in routine_data:
        try:
            # "30 Minutes" -> 30
            duration = int(routine_data["duration"].split()[0])
        except:
            duration = 30

    session = {
        "timestamp": datetime.now().isoformat(),
        "type": "smart_routine",
        "title": routine_data.get("title", "Workout"),
        "focus": routine_data.get("focus", "Mixed"),
        "duration_mins": duration,
        "calories_burned": routine_data.get("calories_est", 0),
        "exercises_completed": len(routine_data.get("exercises", [])),
        # ⚠️ 這裡以前預設 95 分。重訓課表「完成」跟「做得好不好」是兩件事，
        #   沒有評分就是沒有評分 —— 編一個 95 出來，它還會被動作分析的
        #   趨勢圖當成一次真實評分收進去。沒有就存 None。
        "overall_score": routine_data.get("overall_score"),
        "details": routine_data  # Store full details
    }

    # Phase 2：統一存進 DB
    from repositories import workout_session_repo
    return workout_session_repo.add_session(user_id, session)

def update_workout_log(user_id, session_id, updates):
    """
    Update a specific workout session
    """
    from repositories import workout_session_repo
    safe_updates = {k: v for k, v in (updates or {}).items() if k not in ["session_id", "user_id"]}
    return workout_session_repo.update_session(user_id, session_id, safe_updates)

def delete_workout_log(user_id, session_id):
    """
    Delete a specific workout session
    """
    from repositories import workout_session_repo
    return workout_session_repo.delete_session(user_id, session_id)

def get_metric_progress(user_id, metric_name):
    """
    Get progress for a specific metric over time
    
    Args:
        user_id: User identifier
        metric_name: Name of the metric to track
    
    Returns:
        List of metric scores over time
    """
    sessions = get_user_workout_history(user_id)
    
    metric_scores = []
    for session in reversed(sessions):  # Chronological order
        metrics = session.get("metrics", {})
        if metric_name in metrics:
            metric_scores.append(metrics[metric_name])
    
    return metric_scores

def get_all_metrics_progress(user_id):
    """
    Get progress for all metrics over time with trend analysis
    
    Returns:
        Dict with metrics as keys, each containing:
            - scores: List of scores over time
            - latest: Most recent score
            - best: Best score achieved
            - average: Average score
            - trend: 'improving', 'declining', or 'stable'
            - improvement_rate: Percentage change
    """
    sessions = get_user_workout_history(user_id)
    
    if not sessions:
        return {}
    
    # Get all unique metric names
    # Get all unique metric names
    all_metrics = set()
    all_metrics.add("Overall Score") # Always include Overall Score
    
    for session in sessions:
        metrics = session.get("metrics", {})
        all_metrics.update(metrics.keys())
    
    result = {}
    for metric_name in all_metrics:
        metric_scores = []
        metric_dates = []
        for session in reversed(sessions):  # Chronological order
            val = None
            
            # Special handling for Overall Score
            if metric_name == "Overall Score":
                val = session.get("overall_score")
                if val is None and session.get("type") == "smart_routine":
                    val = 90 # Default for legacy routines
            else:
                metrics = session.get("metrics", {})
                if metric_name in metrics:
                    val = metrics[metric_name]
            
            if val is not None:
                metric_scores.append(val)
                metric_dates.append(session.get("timestamp", ""))
        
        if not metric_scores:
            continue
        
        # Calculate statistics
        latest = metric_scores[-1]
        best = max(metric_scores)
        average = sum(metric_scores) / len(metric_scores)
        
        # Calculate trend
        trend, improvement_rate = calculate_metric_trend(metric_scores)
        
        result[metric_name] = {
            "scores": metric_scores,
            "dates": metric_dates,
            "latest": round(latest, 1),
            "best": round(best, 1),
            "average": round(average, 1),
            "trend": trend,
            "improvement_rate": round(improvement_rate, 1)
        }
    
    return result

def calculate_metric_trend(scores):
    """
    Determine if a metric is improving, declining, or stable
    
    Returns:
        tuple: (trend_status, improvement_rate)
    """
    if len(scores) < 2:
        return "stable", 0.0
    
    # Compare recent third vs older thirds
    if len(scores) >= 6:
        third = len(scores) // 3
        older_avg = sum(scores[:third]) / third
        recent_avg = sum(scores[-third:]) / third
    else:
        # For fewer scores, compare first half vs second half
        mid = len(scores) // 2
        older_avg = sum(scores[:mid]) / mid if mid > 0 else scores[0]
        recent_avg = sum(scores[mid:]) / (len(scores) - mid)
    
    if older_avg == 0:
        improvement_rate = 0
    else:
        improvement_rate = ((recent_avg - older_avg) / older_avg) * 100
    
    # Determine trend
    if improvement_rate > 5:
        trend = "improving"
    elif improvement_rate < -5:
        trend = "declining"
    else:
        trend = "stable"
    
    return trend, improvement_rate

def get_metrics_summary(user_id):
    """
    Get a summary of best improving and needs work metrics
    
    Returns:
        Dict containing:
            - best_improving: List of top 3 improving metrics
            - needs_work: List of top 3 declining metrics
            - all_metrics: Complete metrics progress
    """
    all_metrics = get_all_metrics_progress(user_id)
    
    if not all_metrics:
        return {
            "best_improving": [],
            "needs_work": [],
            "all_metrics": {}
        }
    
    # Sort by improvement rate
    metrics_list = [
        {"name": name, **data}
        for name, data in all_metrics.items()
    ]
    
    metrics_list.sort(key=lambda x: x["improvement_rate"], reverse=True)
    
    # Get top improving and declining
    best_improving = [
        {"name": m["name"], "improvement_rate": m["improvement_rate"], "latest": m["latest"]}
        for m in metrics_list[:3] if m["improvement_rate"] > 0
    ]
    
    needs_work = [
        {"name": m["name"], "improvement_rate": m["improvement_rate"], "latest": m["latest"]}
        for m in metrics_list[-3:] if m["improvement_rate"] < 0
    ]
    needs_work.reverse()  # Most declining first
    
    return {
        "best_improving": best_improving,
        "needs_work": needs_work,
        "all_metrics": all_metrics
    }


# InBody History Management (Independent Database)
INBODY_HISTORY_PATH = os.path.join(DATA_DIR, 'inbody_history.json')

def load_inbody_history():
    """Load InBody history from independent database"""
    if os.path.exists(INBODY_HISTORY_PATH):
        with open(INBODY_HISTORY_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_inbody_history(history):
    """Save InBody history to independent database"""
    save_json_atomic(INBODY_HISTORY_PATH, history, indent=2)
def add_inbody_record(user_id, record_data):
    """
    Manually add an InBody measurement record
    
    Args:
        user_id: User identifier
        record_data: Dict containing:
            - measurement_date: Date of measurement (YYYY-MM-DD)
            - weight_kg, bmi, body_fat_percent, skeletal_muscle_mass, etc.
    
    Returns:
        Created record with record_id
    """
    # Phase 2：改委派資料庫倉儲（DB 交易，取代 JSON 讀-改-寫）。
    from repositories import inbody_repo
    return inbody_repo.add_record(user_id, record_data)

def update_inbody_record(user_id, record_id, updates):
    """
    Update an existing InBody record
    
    Args:
        user_id: User identifier
        record_id: Record identifier
        updates: Dict with fields to update
    
    Returns:
        Tuple (success: bool, result: dict or error message)
    """
    from repositories import inbody_repo
    return inbody_repo.update_record(user_id, record_id, updates)

def delete_inbody_record(user_id, record_id):
    """
    Delete an InBody record
    
    Args:
        user_id: User identifier
        record_id: Record identifier
    
    Returns:
        Tuple (success: bool, message: str)
    """
    from repositories import inbody_repo
    return inbody_repo.delete_record(user_id, record_id)

def get_inbody_history(user_id, limit=None):
    """
    Get InBody measurement history from independent database
    
    Args:
        user_id: User identifier
        limit: Optional limit on number of records to return (most recent first)
    
    Returns:
        List of InBody records with measurement dates, sorted by date descending
    """
    from repositories import inbody_repo
    return inbody_repo.get_history(user_id, limit)


def calculate_inbody_trends(history):
    """
    Calculate trends and statistics for InBody metrics
    
    Args:
        history: List of InBody records from get_inbody_history()
    
    Returns:
        Dict containing trends for each metric with direction and percentage change
    """
    if not history or len(history) < 2:
        return {
            'has_trend_data': False,
            'record_count': len(history) if history else 0
        }
    
    # Reverse to get chronological order (oldest to newest)
    chronological = list(reversed(history))
    
    metrics_to_track = [
        'weight_kg', 'bmi', 'body_fat_percent', 
        'skeletal_muscle_mass', 'muscle_percent', 
        'body_water_percent', 'visceral_fat_level', 'bmr'
    ]
    
    trends = {
        'has_trend_data': True,
        'record_count': len(history),
        'date_range': {
            'start': chronological[0]['measurement_date'],
            'end': chronological[-1]['measurement_date']
        },
        'metrics': {}
    }
    
    for metric in metrics_to_track:
        # Extract values for this metric
        values = [r.get(metric) for r in chronological if r.get(metric) is not None]
        
        if len(values) < 2:
            continue
        
        first_value = values[0]
        latest_value = values[-1]
        avg_value = sum(values) / len(values)
        
        # Calculate change
        absolute_change = latest_value - first_value
        percent_change = (absolute_change / first_value * 100) if first_value != 0 else 0
        
        # Determine trend direction
        if abs(percent_change) < 2:  # Less than 2% change considered stable
            trend_direction = 'stable'
            trend_icon = '➡️'
        elif percent_change > 0:
            trend_direction = 'increasing'
            trend_icon = '📈'
        else:
            trend_direction = 'decreasing'
            trend_icon = '📉'
        
        # Smart trend judgment based on health context
        is_positive = None
        
        if metric == 'bmi':
            # BMI: Stable in healthy range (18.5-24) is GOOD
            #      Moving towards healthy range is GOOD
            in_healthy_range = 18.5 <= latest_value <= 24
            was_in_healthy_range = 18.5 <= first_value <= 24
            
            if in_healthy_range:
                # Already in healthy range - stable or minor changes are good
                is_positive = abs(percent_change) < 5  # Within ±5% is good
            else:
                # Not in healthy range - moving towards it is good
                if latest_value < 18.5:  # Underweight
                    is_positive = trend_direction == 'increasing'
                else:  # Overweight (>24)
                    is_positive = trend_direction == 'decreasing'
        
        elif metric == 'visceral_fat_level':
            # Visceral Fat: ≤9 is ideal, stable at low level is GOOD
            is_low_level = latest_value <= 9
            was_low_level = first_value <= 9
            
            if is_low_level:
                # Already low - maintaining or decreasing is good
                is_positive = trend_direction in ['stable', 'decreasing']
            else:
                # Too high - only decreasing is good
                is_positive = trend_direction == 'decreasing'
        
        elif metric == 'body_fat_percent':
            # Body Fat %: In ideal range and stable is GOOD
            # Ideal ranges (approximate): Male 12-18%, Female 18-24%, General 15-20%
            ideal_min, ideal_max = 15, 20  # General range
            in_ideal_range = ideal_min <= latest_value <= ideal_max
            
            if in_ideal_range:
                # In ideal range - stable or decreasing is good
                is_positive = trend_direction in ['stable', 'decreasing']
            else:
                # Out of range - decreasing is good
                is_positive = trend_direction == 'decreasing'
        
        elif metric == 'weight_kg':
            # Weight: Context-dependent, generally stable is okay for most
            # Being overly strict here isn't helpful
            is_positive = abs(percent_change) < 10  # ±10% is acceptable
        
        elif metric in ['skeletal_muscle_mass', 'muscle_percent']:
            # Muscle: Increasing or maintaining high levels is good
            is_positive = trend_direction in ['increasing', 'stable']
        
        elif metric in ['body_water_percent', 'bmr']:
            # Water % and BMR: Higher or stable is generally good
            is_positive = trend_direction in ['increasing', 'stable']
        
        trends['metrics'][metric] = {
            'first_value': round(first_value, 2),
            'latest_value': round(latest_value, 2),
            'average_value': round(avg_value, 2),
            'absolute_change': round(absolute_change, 2),
            'percent_change': round(percent_change, 2),
            'trend_direction': trend_direction,
            'trend_icon': trend_icon,
            'is_positive_trend': is_positive,
            'data_points': len(values)
        }
    
    return trends


def get_latest_inbody_data(user_id):
    """
    Get user's latest InBody measurement data
    
    Args:
        user_id: User identifier
    
    Returns:
        Dict with latest InBody data or None if no records exist
    """
    history = get_inbody_history(user_id, limit=1)
    if history and len(history) > 0:
        return history[0]
    return None


# Strength History Management (Independent Database)
STRENGTH_HISTORY_PATH = os.path.join(DATA_DIR, 'strength_history.json')

def load_strength_history():
    """Load strength history from independent database"""
    if os.path.exists(STRENGTH_HISTORY_PATH):
        with open(STRENGTH_HISTORY_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_strength_history(history):
    """Save strength history to independent database"""
    save_json_atomic(STRENGTH_HISTORY_PATH, history, indent=2)
def add_strength_record(user_id, record_data):
    """
    Add a strength training record for an exercise
    
    Args:
        user_id: User identifier
        record_data: Dict containing:
            - exercise_name: Name of the exercise
            - date: Date of record (YYYY-MM-DD)
            - training_weight: Working weight (kg)
            - pr_weight: Personal Record weight (kg)
            - reps: Repetitions (optional)
            - note: Optional note
            
    Returns:
        Created record with record_id
    """
    # Phase 2：改為委派資料庫倉儲（DB 交易具原子性與並發安全，取代 JSON 讀-改-寫）。
    from repositories import strength_repo
    return strength_repo.add_record(user_id, record_data)

def get_strength_history(user_id, exercise_name=None):
    """
    Get strength history for a user, optionally filtered by exercise
    """
    from repositories import strength_repo
    return strength_repo.get_history(user_id, exercise_name)

def delete_strength_record(user_id, record_id):
    """
    Delete a specific strength record
    """
    from repositories import strength_repo
    return strength_repo.delete_record(user_id, record_id)

def update_strength_record(user_id, record_id, updates):
    """
    Update a strength record
    """
    from repositories import strength_repo
    return strength_repo.update_record(user_id, record_id, updates)

