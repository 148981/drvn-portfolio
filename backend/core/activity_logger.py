"""
Activity Logger for AI Fitness Coach
Handles manual activity entries and calendar heatmap generation
"""
from datetime import datetime, timedelta
from .json_cache import save_json_atomic
from typing import Dict, List, Optional
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
ACTIVITY_LOG_PATH = os.path.join(DATA_DIR, "activity_log.json")


def load_activity_log() -> Dict:
    """Load activity log from JSON file"""
    if os.path.exists(ACTIVITY_LOG_PATH):
        with open(ACTIVITY_LOG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_activity_log(log_data: Dict):
    """Save activity log to JSON file"""
    save_json_atomic(ACTIVITY_LOG_PATH, log_data, indent=2)
def add_manual_activity(user_id: str, activity_data: Dict) -> Dict:
    """
    Add a manual activity entry
    
    Args:
        user_id: User ID
        activity_data: Dict with:
            - activity_type: str (workout, cardio, yoga, etc.)
            - duration_mins: int
            - notes: str (optional)
            - date: str (ISO format, defaults to today)
    
    Returns:
        Created activity entry
    """
    log = load_activity_log()
    
    if user_id not in log:
        log[user_id] = []
    
    entry = {
        "id": f"{user_id}_{datetime.now().timestamp()}",
        "activity_type": activity_data.get("activity_type", "workout"),
        "duration_mins": activity_data.get("duration_mins", 0),
        "notes": activity_data.get("notes", ""),
        "date": activity_data.get("date", datetime.now().date().isoformat()),
        "created_at": datetime.now().isoformat(),
        "is_manual": True
    }
    
    log[user_id].append(entry)
    save_activity_log(log)
    
    return entry


def get_user_activities(user_id: str, days: int = 30) -> List[Dict]:
    """
    Get user activities for the last N days
    
    Args:
        user_id: User ID
        days: Number of days to retrieve
    
    Returns:
        List of activity entries
    """
    log = load_activity_log()
    user_activities = log.get(user_id, [])
    
    cutoff_date = (datetime.now() - timedelta(days=days)).date()
    
    filtered = [
        a for a in user_activities
        if datetime.fromisoformat(a["date"]).date() >= cutoff_date
    ]
    
    return sorted(filtered, key=lambda x: x["date"], reverse=True)


def generate_calendar_heatmap(user_id: str, days: int = 30) -> List[Dict]:
    """
    Generate calendar heatmap data for visualization
    
    Args:
        user_id: User ID
        days: Number of days to include
    
    Returns:
        List of dicts with date, count, and intensity
    """
    activities = get_user_activities(user_id, days)
    
    # Group by date
    date_counts = {}
    for activity in activities:
        date_key = activity["date"]
        if date_key not in date_counts:
            date_counts[date_key] = {
                "count": 0,
                "total_duration": 0
            }
        date_counts[date_key]["count"] += 1
        date_counts[date_key]["total_duration"] += activity.get("duration_mins", 0)
    
    # Generate full calendar (including days with no activity)
    heatmap_data = []
    start_date = datetime.now().date() - timedelta(days=days-1)
    
    for i in range(days):
        current_date = start_date + timedelta(days=i)
        date_str = current_date.isoformat()
        
        if date_str in date_counts:
            data = date_counts[date_str]
            # Intensity based on activity count (0-4 scale)
            intensity = min(4, data["count"])
        else:
            data = {"count": 0, "total_duration": 0}
            intensity = 0
        
        heatmap_data.append({
            "date": date_str,
            "count": data["count"],
            "duration": data["total_duration"],
            "intensity": intensity,
            "day_of_week": current_date.strftime("%a")
        })
    
    return heatmap_data


def get_weekly_summary(user_id: str) -> Dict:
    """
    Get weekly activity summary
    
    Returns:
        Dict with weekly stats
    """
    activities = get_user_activities(user_id, days=7)
    
    total_workouts = len(activities)
    total_duration = sum(a.get("duration_mins", 0) for a in activities)
    
    # Count by type
    type_breakdown = {}
    for activity in activities:
        activity_type = activity.get("activity_type", "workout")
        type_breakdown[activity_type] = type_breakdown.get(activity_type, 0) + 1
    
    return {
        "total_workouts": total_workouts,
        "total_duration_mins": total_duration,
        "average_duration": total_duration / total_workouts if total_workouts > 0 else 0,
        "type_breakdown": type_breakdown,
        "active_days": len(set(a["date"] for a in activities))
    }
