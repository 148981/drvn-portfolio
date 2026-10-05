"""
Gamification System for AI Fitness Coach
Handles achievements, badges, and streak tracking
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json
import os

# Achievement Definitions
ACHIEVEMENTS = {
    # Consistency Achievements
    "first_workout": {
        "id": "first_workout",
        "name": "Getting Started",
        "description": "Complete your first workout",
        "icon": "🎯",
        "category": "consistency",
        "requirement": {"type": "workout_count", "value": 1}
    },
    "week_warrior": {
        "id": "week_warrior",
        "name": "Week Warrior",
        "description": "Train for 7 consecutive days",
        "icon": "🔥",
        "category": "consistency",
        "requirement": {"type": "streak", "value": 7}
    },
    "month_master": {
        "id": "month_master",
        "name": "30-Day Master",
        "description": "Train for 30 consecutive days",
        "icon": "💪",
        "category": "consistency",
        "requirement": {"type": "streak", "value": 30}
    },
    "workout_10": {
        "id": "workout_10",
        "name": "Perfect 10",
        "description": "Complete 10 total workouts",
        "icon": "✨",
        "category": "consistency",
        "requirement": {"type": "workout_count", "value": 10}
    },
    "workout_50": {
        "id": "workout_50",
        "name": "Half Century",
        "description": "Complete 50 total workouts",
        "icon": "🏆",
        "category": "consistency",
        "requirement": {"type": "workout_count", "value": 50}
    },
    
    # Performance Achievements
    "score_80": {
        "id": "score_80",
        "name": "Rising Star",
        "description": "Achieve a score of 80+",
        "icon": "⭐",
        "category": "performance",
        "requirement": {"type": "score_threshold", "value": 80}
    },
    "score_90": {
        "id": "score_90",
        "name": "Elite Performer",
        "description": "Achieve a score of 90+",
        "icon": "💎",
        "category": "performance",
        "requirement": {"type": "score_threshold", "value": 90}
    },
    "score_95": {
        "id": "score_95",
        "name": "Near Perfect",
        "description": "Achieve a score of 95+",
        "icon": "👑",
        "category": "performance",
        "requirement": {"type": "score_threshold", "value": 95}
    },
    "perfect_form": {
        "id": "perfect_form",
        "name": "Perfect Form",
        "description": "Achieve a perfect score of 100",
        "icon": "🌟",
        "category": "performance",
        "requirement": {"type": "score_threshold", "value": 100}
    },
    
    # Improvement Achievements
    "improved_10": {
        "id": "improved_10",
        "name": "Rapid Progress",
        "description": "Improve score by 10 points",
        "icon": "📈",
        "category": "improvement",
        "requirement": {"type": "score_improvement", "value": 10}
    },
}


def calculate_streak(workout_dates: List[str]) -> Dict:
    """
    Calculate the current streak and longest streak
    
    Args:
        workout_dates: List of ISO date strings (YYYY-MM-DD)
    
    Returns:
        Dict with current_streak, longest_streak, and last_workout_date
    """
    if not workout_dates:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_workout_date": None,
            "is_active": False
        }

    # Convert to datetime objects and sort.
    # 防呆：跳過空字串 / 無法解析的日期，避免單筆髒資料 (datetime.fromisoformat(""))
    # 直接拋出 ValueError 而讓整個成就 / streak API 崩潰。
    dates = []
    for d in workout_dates:
        if not d:
            continue
        try:
            dates.append(datetime.fromisoformat(str(d).split('T')[0]))
        except (ValueError, TypeError):
            continue
    if not dates:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_workout_date": None,
            "is_active": False
        }
    dates = sorted(dates)

    # ── P6：休息日寬限（streak 保護）──────────────────────────────
    # 每 30 天允許 1 次「休 1 天不斷 streak」。
    # 200 天 streak 因生病/旅行斷 1 天而歸零，是實證上最強的流失觸發點。
    GRACE_GAP_DAYS = 2          # diff == 2 代表中間空了 1 天
    GRACE_COOLDOWN_DAYS = 30    # 每 30 天最多用 1 次

    current_streak = 1
    longest_streak = 1
    temp_streak = 1
    last_grace_date = None      # 上次動用寬限的日期

    def _grace_available(at_date):
        return last_grace_date is None or (at_date - last_grace_date).days > GRACE_COOLDOWN_DAYS

    for i in range(1, len(dates)):
        diff = (dates[i] - dates[i-1]).days

        if diff == 1:
            temp_streak += 1
            longest_streak = max(longest_streak, temp_streak)
        elif diff == 0:
            # Same day, don't break streak
            continue
        elif diff == GRACE_GAP_DAYS and _grace_available(dates[i]):
            # 動用休息日寬限：跳過 1 天，streak 延續
            last_grace_date = dates[i]
            temp_streak += 1
            longest_streak = max(longest_streak, temp_streak)
        else:
            temp_streak = 1

    # Check if streak is still active
    # (last workout within 1 day; 或空 1 天但還有寬限可用)
    today = datetime.now().date()
    last_workout = dates[-1].date()
    days_since_last = (today - last_workout).days

    grace_left = last_grace_date is None or (dates[-1] - last_grace_date).days > GRACE_COOLDOWN_DAYS
    if days_since_last <= 1 or (days_since_last == 2 and grace_left):
        current_streak = temp_streak
        is_active = True
    else:
        current_streak = 0
        is_active = False

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "last_workout_date": dates[-1].isoformat(),
        "is_active": is_active,
        # 前端可顯示「本月休息日卡：可用/已用」
        "grace_available": grace_left,
        "last_grace_date": last_grace_date.isoformat() if last_grace_date else None,
    }


def check_achievements(user_stats: Dict) -> Dict:
    """
    Check which achievements a user has unlocked
    
    Args:
        user_stats: Dict containing:
            - workout_count: int
            - max_score: float
            - score_improvement: float (first to latest improvement)
            - workout_dates: List[str]
    
    Returns:
        Dict with unlocked achievements and progress on locked ones
    """
    unlocked = []
    in_progress = []
    
    streak_info = calculate_streak(user_stats.get("workout_dates", []))
    current_streak = streak_info["current_streak"]
    
    for achievement_id, achievement in ACHIEVEMENTS.items():
        req = achievement["requirement"]
        req_type = req["type"]
        req_value = req["value"]
        
        unlocked_achievement = False
        progress = 0
        
        if req_type == "workout_count":
            count = user_stats.get("workout_count", 0)
            progress = min(100, int((count / req_value) * 100))
            unlocked_achievement = count >= req_value
            
        elif req_type == "streak":
            progress = min(100, int((current_streak / req_value) * 100))
            unlocked_achievement = current_streak >= req_value
            
        elif req_type == "score_threshold":
            max_score = user_stats.get("max_score", 0)
            progress = min(100, int((max_score / req_value) * 100))
            unlocked_achievement = max_score >= req_value
            
        elif req_type == "score_improvement":
            improvement = user_stats.get("score_improvement", 0)
            progress = min(100, int((improvement / req_value) * 100))
            unlocked_achievement = improvement >= req_value
        
        if unlocked_achievement:
            unlocked.append({
                **achievement,
                "unlocked_at": datetime.now().isoformat()
            })
        else:
            in_progress.append({
                **achievement,
                "progress": progress,
                "current_value": user_stats.get("workout_count", 0) if req_type == "workout_count" else current_streak
            })
    
    return {
        "unlocked": unlocked,
        "in_progress": in_progress,
        "streak": streak_info
    }


def get_user_achievements(user_id: str, workout_history: List[Dict]) -> Dict:
    """
    Get achievements for a specific user based on their workout history
    
    Args:
        user_id: User ID
        workout_history: List of workout session dicts
    
    Returns:
        Achievement status dict
    """
    if not workout_history:
        return check_achievements({
            "workout_count": 0,
            "max_score": 0,
            "score_improvement": 0,
            "workout_dates": []
        })
    
    # Calculate stats
    workout_count = len(workout_history)

    # 依時間排序（舊→新），避免假設呼叫端的順序。
    # 沒有 timestamp 的紀錄排到最後，不影響 first_score 的取得。
    sorted_history = sorted(
        workout_history,
        key=lambda w: str(w.get("timestamp") or "9999")
    )
    scores = [w.get("overall_score", 0) for w in sorted_history]
    max_score = max(scores) if scores else 0

    # Score improvement (最早一次 → 最佳一次)
    first_score = scores[0] if scores else 0
    score_improvement = max_score - first_score

    # Workout dates（過濾空值由 calculate_streak 負責）
    workout_dates = [w.get("timestamp", "") for w in sorted_history]
    
    return check_achievements({
        "workout_count": workout_count,
        "max_score": max_score,
        "score_improvement": score_improvement,
        "workout_dates": workout_dates
    })
