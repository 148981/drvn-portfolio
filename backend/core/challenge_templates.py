"""
System-provided Challenge Templates
Users can browse and join these predefined challenges
"""

from datetime import datetime, timedelta
from typing import Dict, List, Any

# Challenge Template Structure:
# - template_id: Unique identifier
# - category: Challenge category for filtering
# - name: Display name
# - description: Short description
# - goal_type: distance | duration | frequency | streak
# - goal_value: Target value to achieve
# - time_window: Days to complete
# - difficulty: beginner | intermediate | advanced | expert
# - badge_icon: Emoji icon
# - badge_color: Reward badge color
# - reward_points: Points earned on completion
# - cycle: once | weekly | monthly (for recurring challenges)

CHALLENGE_TEMPLATES = [
    # ========== BEGINNER / ONBOARDING ==========
    {
        "template_id": "beginner_first_week",
        "category": "onboarding",
        "name": "第一週挑戰",
        "description": "連續訓練 3 天，開啟你的健身之旅",
        "goal_type": "streak",
        "goal_value": 3,
        "time_window": 7,
        "difficulty": "beginner",
        "badge_icon": "🌱",
        "badge_color": "green",
        "reward_points": 30,
        "cycle": "once"
    },
    {
        "template_id": "beginner_5k",
        "category": "cardio",
        "name": "新手 5K",
        "description": "累積跑步 5 公里",
        "goal_type": "distance",
        "goal_value": 5,
        "time_window": 14,
        "difficulty": "beginner",
        "badge_icon": "🏃",
        "badge_color": "bronze",
        "reward_points": 50,
        "cycle": "once"
    },
    
    # ========== WEEKLY CHALLENGES ==========
    {
        "template_id": "weekly_runner",
        "category": "cardio",
        "name": "本週跑者",
        "description": "本週累積跑步 20 公里",
        "goal_type": "distance",
        "goal_value": 20,
        "time_window": 7,
        "difficulty": "intermediate",
        "badge_icon": "🏃‍♂️",
        "badge_color": "silver",
        "reward_points": 80,
        "cycle": "weekly"
    },
    {
        "template_id": "weekly_warrior",
        "category": "consistency",
        "name": "週度戰士",
        "description": "連續訓練 5 天",
        "goal_type": "streak",
        "goal_value": 5,
        "time_window": 7,
        "difficulty": "intermediate",
        "badge_icon": "⚡",
        "badge_color": "gold",
        "reward_points": 70,
        "cycle": "weekly"
    },
    {
        "template_id": "weekly_gym_rat",
        "category": "strength",
        "name": "本週健身王",
        "description": "完成 3 次重訓課程",
        "goal_type": "frequency",
        "goal_value": 3,
        "time_window": 7,
        "difficulty": "intermediate",
        "badge_icon": "💪",
        "badge_color": "bronze",
        "reward_points": 75,
        "cycle": "weekly"
    },
    
    # ========== MONTHLY CHALLENGES ==========
    {
        "template_id": "monthly_century",
        "category": "cardio",
        "name": "月度百K",
        "description": "本月累積跑步 100 公里",
        "goal_type": "distance",
        "goal_value": 100,
        "time_window": 30,
        "difficulty": "advanced",
        "badge_icon": "🏆",
        "badge_color": "gold",
        "reward_points": 200,
        "cycle": "monthly"
    },
    {
        "template_id": "monthly_dedication",
        "category": "consistency",
        "name": "月度堅持",
        "description": "連續訓練 20 天",
        "goal_type": "streak",
        "goal_value": 20,
        "time_window": 30,
        "difficulty": "advanced",
        "badge_icon": "🔥",
        "badge_color": "platinum",
        "reward_points": 250,
        "cycle": "monthly"
    },
    {
        "template_id": "monthly_iron",
        "category": "strength",
        "name": "鋼鐵月度",
        "description": "完成 12 次重訓課程",
        "goal_type": "frequency",
        "goal_value": 12,
        "time_window": 30,
        "difficulty": "intermediate",
        "badge_icon": "🏋️",
        "badge_color": "silver",
        "reward_points": 150,
        "cycle": "monthly"
    },
    
    # ========== DISTANCE CHALLENGES ==========
    {
        "template_id": "challenge_10k",
        "category": "cardio",
        "name": "10K 達成",
        "description": "累積跑步 10 公里",
        "goal_type": "distance",
        "goal_value": 10,
        "time_window": 14,
        "difficulty": "intermediate",
        "badge_icon": "🎯",
        "badge_color": "silver",
        "reward_points": 100,
        "cycle": "once"
    },
    {
        "template_id": "challenge_half_marathon",
        "category": "cardio",
        "name": "半馬挑戰",
        "description": "累積跑步 21 公里",
        "goal_type": "distance",
        "goal_value": 21,
        "time_window": 30,
        "difficulty": "advanced",
        "badge_icon": "🎖️",
        "badge_color": "gold",
        "reward_points": 300,
        "cycle": "once"
    },
    {
        "template_id": "challenge_marathon",
        "category": "cardio",
        "name": "全馬傳奇",
        "description": "累積跑步 42 公里",
        "goal_type": "distance",
        "goal_value": 42,
        "time_window": 60,
        "difficulty": "expert",
        "badge_icon": "👑",
        "badge_color": "platinum",
        "reward_points": 500,
        "cycle": "once"
    },
    
    # ========== SPEED & PERFORMANCE ==========
    {
        "template_id": "speed_demon",
        "category": "performance",
        "name": "速度惡魔",
        "description": "完成單次 5km 配速低於 5:00/km",
        "goal_type": "performance",
        "goal_value": 300,  # seconds per km
        "time_window": 30,
        "difficulty": "advanced",
        "badge_icon": "🚀",
        "badge_color": "silver",
        "reward_points": 180,
        "cycle": "once"
    },
    
    # ========== NUTRITION CHALLENGES ==========
    {
        "template_id": "nutrition_week",
        "category": "nutrition",
        "name": "健康飲食週",
        "description": "連續 7 天記錄均衡飲食",
        "goal_type": "streak",
        "goal_value": 7,
        "time_window": 10,
        "difficulty": "intermediate",
        "badge_icon": "🥗",
        "badge_color": "green",
        "reward_points": 90,
        "cycle": "weekly"
    },
    {
        "template_id": "hydration_hero",
        "category": "wellness",
        "name": "補水英雄",
        "description": "連續 7 天達到每日飲水目標",
        "goal_type": "streak",
        "goal_value": 7,
        "time_window": 10,
        "difficulty": "beginner",
        "badge_icon": "💧",
        "badge_color": "blue",
        "reward_points": 60,
        "cycle": "weekly"
    },
    
    # ========== WELLNESS CHALLENGES ==========
    {
        "template_id": "sleep_master",
        "category": "wellness",
        "name": "睡眠大師",
        "description": "連續 7 天達到充足睡眠",
        "goal_type": "streak",
        "goal_value": 7,
        "time_window": 10,
        "difficulty": "intermediate",
        "badge_icon": "😴",
        "badge_color": "purple",
        "reward_points": 80,
        "cycle": "weekly"
    },
    {
        "template_id": "recovery_champion",
        "category": "wellness",
        "name": "恢復冠軍",
        "description": "完成 5 次恢復訓練課程",
        "goal_type": "frequency",
        "goal_value": 5,
        "time_window": 14,
        "difficulty": "beginner",
        "badge_icon": "🧘",
        "badge_color": "green",
        "reward_points": 70,
        "cycle": "monthly"
    },
    
    # ========== SOCIAL CHALLENGES ==========
    {
        "template_id": "social_butterfly",
        "category": "social",
        "name": "社交蝴蝶",
        "description": "分享 5 次訓練活動",
        "goal_type": "frequency",
        "goal_value": 5,
        "time_window": 14,
        "difficulty": "beginner",
        "badge_icon": "🦋",
        "badge_color": "pink",
        "reward_points": 50,
        "cycle": "monthly"
    },
    {
        "template_id": "community_leader",
        "category": "social",
        "name": "社群領袖",
        "description": "給朋友 20 個讚或留言",
        "goal_type": "frequency",
        "goal_value": 20,
        "time_window": 30,
        "difficulty": "intermediate",
        "badge_icon": "🤝",
        "badge_color": "gold",
        "reward_points": 100,
        "cycle": "monthly"
    },
    
    # ========== LIFESTYLE CHALLENGES ==========
    {
        "template_id": "early_bird",
        "category": "lifestyle",
        "name": "早起鳥兒",
        "description": "完成 5 次早晨 6 點前的訓練",
        "goal_type": "frequency",
        "goal_value": 5,
        "time_window": 14,
        "difficulty": "intermediate",
        "badge_icon": "🌅",
        "badge_color": "orange",
        "reward_points": 90,
        "cycle": "monthly"
    },
    {
        "template_id": "weekend_warrior",
        "category": "lifestyle",
        "name": "週末戰士",
        "description": "連續 4 個週末都有訓練",
        "goal_type": "frequency",
        "goal_value": 4,
        "time_window": 30,
        "difficulty": "intermediate",
        "badge_icon": "🎉",
        "badge_color": "purple",
        "reward_points": 120,
        "cycle": "monthly"
    },
    
    # ========== VARIETY CHALLENGES ==========
    {
        "template_id": "variety_master",
        "category": "variety",
        "name": "全能選手",
        "description": "完成 3 種不同類型的訓練",
        "goal_type": "frequency",
        "goal_value": 3,
        "time_window": 14,
        "difficulty": "intermediate",
        "badge_icon": "🌈",
        "badge_color": "rainbow",
        "reward_points": 110,
        "cycle": "monthly"
    },
    
    # ========== SEASONAL CHALLENGES ==========
    {
        "template_id": "summer_striker",
        "category": "seasonal",
        "name": "夏日挑戰",
        "description": "夏季完成 15 次戶外訓練",
        "goal_type": "frequency",
        "goal_value": 15,
        "time_window": 90,
        "difficulty": "intermediate",
        "badge_icon": "☀️",
        "badge_color": "yellow",
        "reward_points": 150,
        "cycle": "seasonal"
    },
]


def get_available_challenges(category: str = None, difficulty: str = None) -> List[Dict]:
    """Get available challenge templates with optional filtering"""
    challenges = CHALLENGE_TEMPLATES
    
    if category:
        challenges = [c for c in challenges if c["category"] == category]
    
    if difficulty:
        challenges = [c for c in challenges if c["difficulty"] == difficulty]
    
    return challenges


def get_challenge_by_id(template_id: str) -> Dict:
    """Get a specific challenge template by ID"""
    for challenge in CHALLENGE_TEMPLATES:
        if challenge["template_id"] == template_id:
            return challenge
    return None


def create_instance_from_template(template_id: str, user_id: str) -> Dict:
    """Create a user's challenge instance from a template"""
    template = get_challenge_by_id(template_id)
    if not template:
        return None
    
    now = datetime.now()
    end_date = now + timedelta(days=template["time_window"])
    
    return {
        "challenge_id": f"{template_id}_{user_id}_{int(now.timestamp())}",
        "template_id": template_id,
        "type": "personal",  # Template challenges are always personal
        "user_id": user_id,
        "name": template["name"],
        "description": template["description"],
        "goal_type": template["goal_type"],
        "goal_value": template["goal_value"],
        "current_progress": 0,
        "start_date": now.isoformat(),
        "end_date": end_date.isoformat(),
        "status": "active",
        "badge_icon": template["badge_icon"],
        "badge_color": template["badge_color"],
        "reward_points": template["reward_points"],
        "completed": False,
        "created_by": user_id,
        "participants": [user_id],  # Add participants field
        "time_window": template["time_window"],
        "category": template["category"]
    }
