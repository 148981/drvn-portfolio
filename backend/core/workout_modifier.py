"""
AI Workout Modification Engine
根據用戶當日情況，生成訓練計劃的替代方案
"""

from typing import Dict, List, Optional
from enum import Enum


class ModificationType(Enum):
    """修改類型"""
    NO_EQUIPMENT = "no_equipment"
    LIMITED_TIME = "limited_time"
    MUSCLE_SORE = "muscle_sore"
    FOCUS_BODYPART = "focus_bodypart"


# 動作替代映射表
EXERCISE_ALTERNATIVES = {
    "squat": {
        "no_equipment": {"name": "Bodyweight Squat", "name_zh": "徒手深蹲"},
        "muscle_sore": {"name": "Wall Sit", "name_zh": "靠牆靜蹲"},
        "limited_time": {"name": "Jump Squat", "name_zh": "跳躍深蹲"}
    },
    "bench_press": {
        "no_equipment": {"name": "Push-up", "name_zh": "伏地挺身"},
        "muscle_sore": {"name": "Incline Push-up", "name_zh": "上斜伏地挺身"},
        "limited_time": {"name": "Explosive Push-up", "name_zh": "爆發伏地挺身"}
    },
    "deadlift": {
        "no_equipment": {"name": "Single Leg RDL", "name_zh": "單腿羅馬尼亞硬舉"},
        "muscle_sore": {"name": "Good Morning", "name_zh": "早安運動"},
        "limited_time": {"name": "Kettlebell Swing", "name_zh": "壺鈴擺盪"}
    },
    "overhead_press": {
        "no_equipment": {"name": "Pike Push-up", "name_zh": "派克伏地挺身"},
        "muscle_sore": {"name": "Band Press", "name_zh": "彈力帶推舉"},
        "limited_time": {"name": "Arnold Press", "name_zh": "阿諾推舉"}
    },
    "pull_up": {
        "no_equipment": {"name": "Inverted Row (Table)", "name_zh": "反向划船（桌子）"},
        "muscle_sore": {"name": "Band Pull Down", "name_zh": "彈力帶下拉"},
        "limited_time": {"name": "Explosive Pull-up", "name_zh": "爆發引體"}
    },
    "row": {
        "no_equipment": {"name": "Bodyweight Row", "name_zh": "徒手划船"},
        "muscle_sore": {"name": "Face Pull", "name_zh": "面拉"},
        "limited_time": {"name": "Kroc Row", "name_zh": "克洛划船"}
    },
    "lunge": {
        "no_equipment": {"name": "Bodyweight Lunge", "name_zh": "徒手弓箭步"},
        "muscle_sore": {"name": "Static Lunge", "name_zh": "靜態弓箭步"},
        "limited_time": {"name": "Jump Lunge", "name_zh": "跳躍弓箭步"}
    },
    "plank": {
        "no_equipment": {"name": "Plank", "name_zh": "平板支撐"},
        "muscle_sore": {"name": "Incline Plank", "name_zh": "上斜平板"},
        "limited_time": {"name": "Plank to Push-up", "name_zh": "平板轉伏地"}
    }
}


def get_exercise_alternative(
    exercise_name: str,
    modification_type: ModificationType
) -> Dict:
    """
    取得動作的替代版本
    
    Args:
        exercise_name: 原始動作名稱
        modification_type: 修改類型
        
    Returns:
        替代動作資訊 {name, name_zh}
    """
    # 標準化動作名稱（轉小寫，移除空格）
    normalized_name = exercise_name.lower().replace(" ", "_").replace("-", "_")
    
    # 查找替代動作
    if normalized_name in EXERCISE_ALTERNATIVES:
        alternatives = EXERCISE_ALTERNATIVES[normalized_name]
        mod_key = modification_type.value
        
        if mod_key in alternatives:
            return alternatives[mod_key]
    
    # 如果沒有找到替代，返回原動作
    return {"name": exercise_name, "name_zh": exercise_name}


def modify_workout(
    original_plan: Dict,
    modification_type: ModificationType,
    user_hashtags: List[str] = None,
    target_bodypart: Optional[str] = None
) -> Dict:
    """
    根據修改類型生成替代訓練計劃
    
    Args:
        original_plan: 原始計劃，格式:
            {
                "exercises": [
                    {
                        "name": "Squat",
                        "sets": 4,
                        "reps": "8-12",
                        "rest": "90s",
                        "is_compound": True
                    },
                    ...
                ]
            }
        modification_type: 修改類型
        user_hashtags: 用戶的 Hashtag 權重
        target_bodypart: 目標部位（FOCUS_BODYPART 時使用）
    
    Returns:
        modified_plan: 修改後的計劃
    """
    modified_exercises = []
    
    for exercise in original_plan.get('exercises', []):
        modified_ex = exercise.copy()
        
        if modification_type == ModificationType.NO_EQUIPMENT:
            # 無器材：轉換成徒手版本
            alternative = get_exercise_alternative(
                exercise['name'],
                ModificationType.NO_EQUIPMENT
            )
            modified_ex['name'] = alternative['name_zh']
            modified_ex['equipment_needed'] = 'bodyweight'
            modified_ex['modification_reason'] = 'NO_EQUIPMENT'
            modified_exercises.append(modified_ex)
            
        elif modification_type == ModificationType.LIMITED_TIME:
            # 時間限制：減少組數，只保留複合動作
            if exercise.get('is_compound', False):
                modified_ex['sets'] = max(2, exercise.get('sets', 3) - 1)
                modified_ex['modification_reason'] = 'LIMITED_TIME'
                modified_exercises.append(modified_ex)
            # 單關節動作直接移除
                
        elif modification_type == ModificationType.MUSCLE_SORE:
            # 肌肉痠痛：降低強度或找替代動作
            alternative = get_exercise_alternative(
                exercise['name'],
                ModificationType.MUSCLE_SORE
            )
            modified_ex['name'] = alternative['name_zh']
            # 降低組數和次數
            modified_ex['sets'] = max(2, exercise.get('sets', 3) - 1)
            modified_ex['intensity'] = '60-70% 原強度'
            modified_ex['modification_reason'] = 'MUSCLE_SORE'
            modified_exercises.append(modified_ex)
            
        elif modification_type == ModificationType.FOCUS_BODYPART:
            # 加強特定部位：保留相關動作並可能增加組數
            # TODO: 需要動作與部位的映射
            modified_exercises.append(exercise)
    
    # 計算修改後的總時長
    total_duration = calculate_duration(modified_exercises)
    
    return {
        'exercises': modified_exercises,
        'duration': total_duration,
        'modification_type': modification_type.value,
        'original_exercise_count': len(original_plan.get('exercises', [])),
        'modified_exercise_count': len(modified_exercises)
    }


def calculate_duration(exercises: List[Dict]) -> int:
    """
    計算訓練時長（分鐘）
    
    簡化估算：
    - 每組動作平均 30秒
    - 每組休息時間（默認90秒）
    - 熱身/收操 5分鐘
    """
    total_sets = sum(ex.get('sets', 3) for ex in exercises)
    work_time = total_sets * 0.5  # 每組30秒
    rest_time = total_sets * 1.5  # 每組休息90秒
    warmup_cooldown = 5
    
    total_minutes = int(work_time + rest_time + warmup_cooldown)
    return total_minutes


def generate_comparison(original_plan: Dict, modified_plan: Dict) -> Dict:
    """
    生成原計劃與修改計劃的對比資料
    
    Returns:
        {
            "duration_change": "+5 mins" or "-10 mins",
            "exercise_count_change": -2,
            "key_changes": ["移除單關節動作", "降低訓練強度"]
        }
    """
    orig_duration = original_plan.get('duration', 0)
    mod_duration = modified_plan.get('duration', 0)
    duration_diff = mod_duration - orig_duration
    
    duration_change = f"+{duration_diff} mins" if duration_diff > 0 else f"{duration_diff} mins"
    
    exercise_count_diff = (
        modified_plan.get('modified_exercise_count', 0) - 
        modified_plan.get('original_exercise_count', 0)
    )
    
    # 根據修改類型生成關鍵變更說明
    mod_type = modified_plan.get('modification_type')
    key_changes = []
    
    if mod_type == 'no_equipment':
        key_changes = ["所有動作改為徒手版本", "可在家訓練"]
    elif mod_type == 'limited_time':
        key_changes = ["移除單關節動作", "減少組數", f"預計 {mod_duration} 分鐘完成"]
    elif mod_type == 'muscle_sore':
        key_changes = ["降低訓練強度至 60-70%", "改用低衝擊替代動作"]
    elif mod_type == 'focus_bodypart':
        key_changes = ["保留目標部位動作", "增加訓練量"]
    
    return {
        "duration_change": duration_change,
        "exercise_count_change": exercise_count_diff,
        "key_changes": key_changes
    }
