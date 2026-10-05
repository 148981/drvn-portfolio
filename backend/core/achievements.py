"""
Achievement System Core Module

Handles achievement definitions, criteria checking, and unlock logic.
Supports various achievement types: distance milestones, streaks, PRs, special achievements.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import json


class Achievement:
    """Base Achievement class"""
    
    def __init__(
        self,
        achievement_id: str,
        name: str,
        description: str,
        category: str,
        icon: str,
        criteria: Dict[str, Any],
        reward_points: int = 10
    ):
        self.achievement_id = achievement_id
        self.name = name
        self.description = description
        self.category = category
        self.icon = icon
        self.criteria = criteria
        self.reward_points = reward_points
    
    def check_unlock(self, user_data: Dict[str, Any]) -> bool:
        """Check if achievement criteria are met"""
        raise NotImplementedError
    
    def get_progress(self, user_data: Dict[str, Any]) -> float:
        """Get progress towards achievement (0-100)"""
        raise NotImplementedError
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "achievement_id": self.achievement_id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "icon": self.icon,
            "criteria": self.criteria,
            "reward_points": self.reward_points
        }


class DistanceAchievement(Achievement):
    """Achievement for total distance milestones"""
    
    def check_unlock(self, user_data: Dict[str, Any]) -> bool:
        total_distance = user_data.get('total_distance_km', 0)
        target = self.criteria.get('distance_km', 0)
        return total_distance >= target
    
    def get_progress(self, user_data: Dict[str, Any]) -> float:
        total_distance = user_data.get('total_distance_km', 0)
        target = self.criteria.get('distance_km', 1)
        return min(100, (total_distance / target) * 100)


class StreakAchievement(Achievement):
    """Achievement for training consistency streaks"""
    
    def check_unlock(self, user_data: Dict[str, Any]) -> bool:
        current_streak = user_data.get('current_streak_days', 0)
        target = self.criteria.get('streak_days', 0)
        return current_streak >= target
    
    def get_progress(self, user_data: Dict[str, Any]) -> float:
        current_streak = user_data.get('current_streak_days', 0)
        target = self.criteria.get('streak_days', 1)
        return min(100, (current_streak / target) * 100)


class PersonalRecordAchievement(Achievement):
    """Achievement for personal records"""
    
    def check_unlock(self, user_data: Dict[str, Any]) -> bool:
        metric = self.criteria.get('metric')
        threshold = self.criteria.get('threshold')
        comparison = self.criteria.get('comparison', 'greater')
        
        value = user_data.get(metric, 0)
        
        if comparison == 'greater':
            return value >= threshold
        elif comparison == 'less':
            return value <= threshold
        return False
    
    def get_progress(self, user_data: Dict[str, Any]) -> float:
        metric = self.criteria.get('metric')
        threshold = self.criteria.get('threshold')
        value = user_data.get(metric, 0)
        
        if threshold == 0:
            return 0
        return min(100, (value / threshold) * 100)


class SpecialAchievement(Achievement):
    """Special condition-based achievements"""
    
    def check_unlock(self, user_data: Dict[str, Any]) -> bool:
        condition_type = self.criteria.get('type')
        
        if condition_type == 'early_bird':
            # Run completed before 6 AM
            latest_run_hour = user_data.get('latest_run_hour', 12)
            return latest_run_hour < 6
        
        elif condition_type == 'night_owl':
            # Run completed after 10 PM
            latest_run_hour = user_data.get('latest_run_hour', 12)
            return latest_run_hour >= 22
        
        elif condition_type == 'explorer':
            # Unique locations visited
            unique_locations = user_data.get('unique_locations', 0)
            target = self.criteria.get('location_count', 5)
            return unique_locations >= target
        
        elif condition_type == 'social_butterfly':
            # Activities shared
            shared_count = user_data.get('shared_activities', 0)
            target = self.criteria.get('share_count', 10)
            return shared_count >= target
        
        return False
    
    def get_progress(self, user_data: Dict[str, Any]) -> float:
        condition_type = self.criteria.get('type')
        
        if condition_type in ['early_bird', 'night_owl']:
            return 100 if self.check_unlock(user_data) else 0
        
        elif condition_type == 'explorer':
            unique_locations = user_data.get('unique_locations', 0)
            target = self.criteria.get('location_count', 5)
            return min(100, (unique_locations / target) * 100)
        
        elif condition_type == 'social_butterfly':
            shared_count = user_data.get('shared_activities', 0)
            target = self.criteria.get('share_count', 10)
            return min(100, (shared_count / target) * 100)
        
        return 0


# Define all achievements
ACHIEVEMENTS = [
    # ========== CARDIO & RUNNING ==========
    # Distance Milestones
    DistanceAchievement(
        "distance_5k", "First Steps", "Complete your first 5 kilometers",
        "distance", "🎯", {"distance_km": 5}, 10
    ),
    DistanceAchievement(
        "distance_10k", "Getting Serious", "Reach 10 kilometers total",
        "distance", "🏃", {"distance_km": 10}, 20
    ),
    DistanceAchievement(
        "distance_25k", "Quarter Century", "Achieve 25 kilometers total",
        "distance", "⭐", {"distance_km": 25}, 30
    ),
    DistanceAchievement(
        "distance_50k", "Half Centurion", "Complete 50 kilometers total",
        "distance", "🌟", {"distance_km": 50}, 50
    ),
    DistanceAchievement(
        "distance_100k", "Century Runner", "Reach the 100 kilometer mark",
        "distance", "💫", {"distance_km": 100}, 100
    ),
    DistanceAchievement(
        "distance_250k", "Elite Distance", "Conquer 250 kilometers",
        "distance", "🏆", {"distance_km": 250}, 200
    ),
    DistanceAchievement(
        "distance_500k", "Legendary Runner", "Achieve 500 kilometers total",
        "distance", "👑", {"distance_km": 500}, 500
    ),
    
    # ========== CONSISTENCY & STREAKS ==========
    StreakAchievement(
        "streak_3", "Getting Started", "Train for 3 consecutive days",
        "consistency", "🌱", {"streak_days": 3}, 10
    ),
    StreakAchievement(
        "streak_7", "Week Warrior", "Train for 7 consecutive days",
        "consistency", "🔥", {"streak_days": 7}, 30
    ),
    StreakAchievement(
        "streak_14", "Two Week Champion", "Maintain a 14-day streak",
        "consistency", "💥", {"streak_days": 14}, 50
    ),
    StreakAchievement(
        "streak_30", "Monthly Master", "Maintain a 30-day streak",
        "consistency", "💪", {"streak_days": 30}, 100
    ),
    StreakAchievement(
        "streak_60", "Two Month Warrior", "Incredible 60-day streak",
        "consistency", "🌟", {"streak_days": 60}, 200
    ),
    StreakAchievement(
        "streak_100", "Centurion Dedication", "Legendary 100-day streak",
        "consistency", "👑", {"streak_days": 100}, 300
    ),
    
    # ========== PERSONAL RECORDS ==========
    PersonalRecordAchievement(
        "pr_fastest_5min", "Speed Demon", "Run pace under 5:00/km",
        "personal_record", "⚡", {"metric": "best_pace_seconds", "threshold": 300, "comparison": "less"}, 50
    ),
    PersonalRecordAchievement(
        "pr_fastest_4min", "Lightning Fast", "Run pace under 4:00/km",
        "personal_record", "🚀", {"metric": "best_pace_seconds", "threshold": 240, "comparison": "less"}, 100
    ),
    PersonalRecordAchievement(
        "pr_longest_10k", "Distance Beast", "Complete a single 10K run",
        "personal_record", "🦁", {"metric": "longest_run_km", "threshold": 10, "comparison": "greater"}, 50
    ),
    PersonalRecordAchievement(
        "pr_longest_half", "Half Marathon Hero", "Finish a half marathon (21K)",
        "personal_record", "🎖️", {"metric": "longest_run_km", "threshold": 21, "comparison": "greater"}, 150
    ),
    PersonalRecordAchievement(
        "pr_longest_marathon", "Marathon Legend", "Complete a full marathon (42K)",
        "personal_record", "🥇", {"metric": "longest_run_km", "threshold": 42, "comparison": "greater"}, 300
    ),
    
    # ========== TIME & LIFESTYLE ==========
    SpecialAchievement(
        "special_early_bird", "Early Bird", "Complete a run before 6 AM",
        "lifestyle", "🌅", {"type": "early_bird"}, 20
    ),
    SpecialAchievement(
        "special_night_owl", "Night Owl", "Run after 10 PM",
        "lifestyle", "🌙", {"type": "night_owl"}, 20
    ),
    SpecialAchievement(
        "special_sunrise_runner", "Sunrise Chaser", "Complete 10 early morning runs",
        "lifestyle", "🌄", {"type": "sunrise_runner", "count": 10}, 50
    ),
    
    # ========== EXPLORATION & ADVENTURE ==========
    SpecialAchievement(
        "special_explorer", "Explorer", "Run in 5 different locations",
        "exploration", "🗺️", {"type": "explorer", "location_count": 5}, 40
    ),
    SpecialAchievement(
        "special_globe_trotter", "Globe Trotter", "Run in 10 different locations",
        "exploration", "🌍", {"type": "explorer", "location_count": 10}, 80
    ),
    SpecialAchievement(
        "special_urban_explorer", "Urban Explorer", "Run in city areas",
        "exploration", "🏙️", {"type": "urban_explorer"}, 30
    ),
    
    # ========== SOCIAL & COMMUNITY ==========
    SpecialAchievement(
        "special_social", "Social Butterfly", "Share 10 activities",
        "social", "🦋", {"type": "social_butterfly", "share_count": 10}, 30
    ),
    SpecialAchievement(
        "special_influencer", "Community Leader", "Share 25 activities",
        "social", "📱", {"type": "social_butterfly", "share_count": 25}, 75
    ),
    SpecialAchievement(
        "special_mentor", "Fitness Mentor", "Help 5 friends start training",
        "social", "🤝", {"type": "mentor", "friends_helped": 5}, 60
    ),
    
    # ========== STRENGTH & FITNESS ==========
    SpecialAchievement(
        "special_gym_rat", "Gym Regular", "Complete 20 gym sessions",
        "strength", "💪", {"type": "gym_sessions", "count": 20}, 50
    ),
    SpecialAchievement(
        "special_iron_warrior", "Iron Warrior", "Complete 50 strength workouts",
        "strength", "🏋️", {"type": "strength_workouts", "count": 50}, 100
    ),
    SpecialAchievement(
        "special_crossfit_beast", "CrossFit Beast", "Complete 30 high-intensity workouts",
        "strength", "🔥", {"type": "hiit_workouts", "count": 30}, 80
    ),
    
    # ========== NUTRITION & WELLNESS ==========
    SpecialAchievement(
        "special_hydration_hero", "Hydration Hero", "Log 7 days of proper hydration",
        "wellness", "💧", {"type": "hydration_streak", "days": 7}, 30
    ),
    SpecialAchievement(
        "special_balanced_eater", "Balanced Eater", "Log 14 days of balanced meals",
        "nutrition", "🥗", {"type": "nutrition_streak", "days": 14}, 50
    ),
    SpecialAchievement(
        "special_clean_eater", "Clean Eating Champion", "30 days of healthy eating",
        "nutrition", "🍎", {"type": "nutrition_streak", "days": 30}, 100
    ),
    SpecialAchievement(
        "special_sleep_master", "Sleep Master", "Maintain good sleep for 7 days",
        "wellness", "😴", {"type": "sleep_streak", "days": 7}, 40
    ),
    
    # ========== MINDSET & RECOVERY ==========
    SpecialAchievement(
        "special_zen_athlete", "Zen Athlete", "Complete 10 recovery sessions",
        "wellness", "🧘", {"type": "recovery_sessions", "count": 10}, 40
    ),
    SpecialAchievement(
        "special_mindful_warrior", "Mindful Warrior", "Practice meditation 20 times",
        "wellness", "🕉️", {"type": "meditation_sessions", "count": 20}, 60
    ),
    
    # ========== SEASONAL & SPECIAL EVENTS ==========
    SpecialAchievement(
        "special_new_year", "New Year Starter", "Start training in January",
        "seasonal", "🎊", {"type": "seasonal", "season": "new_year"}, 25
    ),
    SpecialAchievement(
        "special_summer_striker", "Summer Striker", "Complete 20 summer workouts",
        "seasonal", "☀️", {"type": "seasonal", "season": "summer", "count": 20}, 50
    ),
    SpecialAchievement(
        "special_winter_warrior", "Winter Warrior", "Train outdoors in winter 10 times",
        "seasonal", "❄️", {"type": "seasonal", "season": "winter", "count": 10}, 60
    ),
    
    # ========== CHALLENGE & COMPETITION ==========
    SpecialAchievement(
        "special_challenge_master", "Challenge Master", "Complete 5 challenges",
        "achievement", "🏅", {"type": "challenges_completed", "count": 5}, 75
    ),
    SpecialAchievement(
        "special_goal_crusher", "Goal Crusher", "Achieve 10 personal goals",
        "achievement", "🎯", {"type": "goals_achieved", "count": 10}, 100
    ),
    SpecialAchievement(
        "special_completionist", "Completionist", "Unlock 20 achievements",
        "achievement", "🌟", {"type": "achievements_unlocked", "count": 20}, 150
    ),
]


def get_all_achievements() -> List[Dict[str, Any]]:
    """Get all available achievements"""
    return [ach.to_dict() for ach in ACHIEVEMENTS]


def check_achievements(user_id: str, user_stats: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Check which achievements should be unlocked for user
    
    Args:
        user_id: User identifier
        user_stats: User statistics and data
        
    Returns:
        List of newly unlocked achievements
    """
    newly_unlocked = []
    
    # Get user's existing achievements (would come from database)
    existing_achievements = user_stats.get('unlocked_achievements', [])
    
    for achievement in ACHIEVEMENTS:
        # Skip if already unlocked
        if achievement.achievement_id in existing_achievements:
            continue
        
        # Check if criteria met
        if achievement.check_unlock(user_stats):
            newly_unlocked.append({
                **achievement.to_dict(),
                "unlocked_at": datetime.now().isoformat(),
                "user_id": user_id
            })
    
    return newly_unlocked


def get_achievement_progress(user_stats: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get progress for all achievements
    
    Args:
        user_stats: User statistics and data
        
    Returns:
        List of achievements with progress percentage
    """
    progress_list = []
    existing_achievements = user_stats.get('unlocked_achievements', [])
    
    for achievement in ACHIEVEMENTS:
        is_unlocked = achievement.achievement_id in existing_achievements
        progress = 100 if is_unlocked else achievement.get_progress(user_stats)
        
        progress_list.append({
            **achievement.to_dict(),
            "progress": progress,
            "unlocked": is_unlocked
        })
    
    return progress_list


def calculate_user_stats(workout_history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate user statistics from workout history
    
    Args:
        workout_history: List of workout records
        
    Returns:
        Dictionary of calculated stats
    """
    if not workout_history:
        return {
            "total_distance_km": 0,
            "total_workouts": 0,
            "current_streak_days": 0,
            "best_pace_seconds": 0,
            "longest_run_km": 0,
            "unique_locations": 0,
            "shared_activities": 0,
            "unlocked_achievements": []
        }
    
    # Sort by date (handle timestamp vs date)
    def get_date_str(w):
        return w.get('timestamp', w.get('date', ''))

    sorted_workouts = sorted(workout_history, key=get_date_str)
    
    import math
    # Helper to clean/extract values
    def get_distance(w):
        # Try top level first, then metrics
        d = w.get('distance_km', w.get('distance', 0))
        if not d:
            d = w.get('metrics', {}).get('distance', 0)
        # Ensure float
        try: 
            val = float(d)
            return 0.0 if math.isnan(val) else val
        except: return 0.0

    def get_pace(w):
        # Try top level first, then metrics
        p = w.get('avg_pace', w.get('pace_per_km', float('inf')))
        if p == float('inf') or not p:
            p = w.get('metrics', {}).get('pace', float('inf'))
        # Ensure float
        try: 
            val = float(p)
            return float('inf') if math.isnan(val) else val
        except: return float('inf')

    # Total distance
    total_distance = sum(get_distance(w) for w in workout_history)
    
    # Best pace (lowest seconds per km)
    best_pace = min((get_pace(w) for w in workout_history), default=float('inf'))
    
    # Longest run
    longest_run = max((get_distance(w) for w in workout_history), default=0)
    
    # Calculate streak
    current_streak = 0
    if sorted_workouts:
        try:
            today = datetime.now().date()
            last_date_str = get_date_str(sorted_workouts[-1])
            if last_date_str:
                if 'T' in last_date_str:
                    last_workout_date = datetime.fromisoformat(last_date_str.split('T')[0]).date() # Handle full ISO
                else:
                    last_workout_date = datetime.fromisoformat(last_date_str).date() # Handle YYYY-MM-DD
                
                # Check if streak is still active (within last 2 days)
                if (today - last_workout_date).days <= 1:
                    current_date = last_workout_date
                    for workout in reversed(sorted_workouts):
                        w_date_str = get_date_str(workout)
                        if not w_date_str: continue
                        
                        try:
                            if 'T' in w_date_str:
                                workout_date = datetime.fromisoformat(w_date_str.split('T')[0]).date()
                            else:
                                workout_date = datetime.fromisoformat(w_date_str).date()
                                
                            diff = (current_date - workout_date).days
                            if diff <= 1:
                                if diff == 1: # Only increment if it's a new day
                                    current_streak += 1
                                    current_date = workout_date
                                elif diff == 0:
                                    if current_streak == 0: current_streak = 1 # Count today
                            else:
                                break
                        except ValueError:
                            continue
        except Exception as e:
            print(f"Error calculating streak: {e}")
            current_streak = 0
    
    # Unique locations (simplified - count unique lat/lng combinations)
    unique_locs = set()
    for w in workout_history:
        if 'route_data' in w and w['route_data']:
            first_point = w['route_data'][0] if w['route_data'] else None
            if first_point:
                loc_key = f"{first_point.get('lat', 0):.3f},{first_point.get('lng', 0):.3f}"
                unique_locs.add(loc_key)
    
    # Shared activities count
    shared_count = sum(1 for w in workout_history if w.get('shared', False))
    
    # Latest run hour
    latest_hour = 12
    if sorted_workouts:
        try:
            last_date_str = get_date_str(sorted_workouts[-1])
            if last_date_str:
                latest_date = datetime.fromisoformat(last_date_str)
                latest_hour = latest_date.hour
        except:
            pass
    
    return {
        "total_distance_km": round(total_distance, 2),
        "total_workouts": len(workout_history),
        "current_streak_days": current_streak,
        "best_pace_seconds": best_pace if best_pace != float('inf') else 0,
        "longest_run_km": round(longest_run, 2),
        "unique_locations": len(unique_locs),
        "shared_activities": shared_count,
        "latest_run_hour": latest_hour,
        "unlocked_achievements": []
    }
