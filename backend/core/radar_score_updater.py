"""
Radar Score Updater - 訓練完成後自動更新雷達分數
根據訓練類型和內容動態調整用戶六維度分數

Scientific Basis:
- Progressive Overload Principle (Bompa & Haff, 2009)
- SAID Principle (Specific Adaptation to Imposed Demands)
- Training adaptations occur gradually with consistent stimulus
"""

from typing import Dict, List, Optional
import json
from datetime import datetime, timedelta


# ============================================================================
# 訓練類型與雷達維度映射
# ============================================================================

TRAINING_TYPE_MAPPINGS = {
    # 力量訓練
    "strength": {
        "primary": {"structural": 0.8, "power": 0.6},
        "secondary": {"endurance": 0.2}
    },
    
    # 有氧訓練
    "cardio": {
        "primary": {"metabolic": 0.7, "endurance": 0.8},
        "secondary": {"vitality": 0.3}
    },
    
    # HIIT
    "hiit": {
        "primary": {"metabolic": 0.9, "power": 0.5},
        "secondary": {"endurance": 0.4, "vitality": 0.2}
    },
    
    # 瑜伽/拉伸
    "yoga": {
        "primary": {"alignment": 0.8, "vitality": 0.6},
        "secondary": {"endurance": 0.2}
    },
    
    # 爆發力訓練
    "explosive": {
        "primary": {"power": 1.0},
        "secondary": {"structural": 0.4}
    },
    
    # 混合訓練
    "mixed": {
        "primary": {"structural": 0.5, "metabolic": 0.5},
        "secondary": {"power": 0.3, "endurance": 0.3}
    }
}


# 肌群到訓練類型的映射
MUSCLE_GROUP_TO_TYPE = {
    "胸部": "strength",
    "背部": "strength",
    "腿部": "strength",
    "肩部": "strength",
    "手臂": "strength",
    "核心": "alignment",
    "全身": "mixed"
}


# ============================================================================
# 分數增量計算
# ============================================================================

def calculate_score_delta(
    volume: float,
    duration_mins: int,
    intensity: float = 1.0,
    base_gain: float = 2.0
) -> float:
    """
    計算單次訓練的分數增量
    
    Scientific Basis:
    - 訓練容量 (Volume) 與適應成正比
    - 時長與強度影響訓練效果
    
    Args:
        volume: 訓練容量 (kg for strength, distance for cardio)
        duration_mins: 訓練時長 (分鐘)
        intensity: 強度係數 (0.5-2.0)
        base_gain: 基礎增益分數
    
    Returns:
        分數增量 (通常 0.5-5分)
    """
    # 容量係數 (正規化到0-1)
    # 假設標準訓練: 2000kg 或 5km
    volume_factor = min(volume / 2500, 1.5) if volume > 0 else 0.5
    
    # 時長係數 (30-60分鐘為標準)
    duration_factor = min(duration_mins / 45, 1.5) if duration_mins > 0 else 0.5
    
    # 綜合計算
    delta = base_gain * volume_factor * duration_factor * intensity
    
    # 限制單次增益 (避免過快進步)
    return min(delta, 5.0)


def get_training_type(focus_group: str, exercises: List[Dict]) -> str:
    """
    根據訓練部位和動作判斷訓練類型
    
    Args:
        focus_group: 訓練部位
        exercises: 訓練動作列表
    
    Returns:
        訓練類型 (strength, cardio, yoga, etc.)
    """
    # 優先使用肌群映射
    if focus_group in MUSCLE_GROUP_TO_TYPE:
        return MUSCLE_GROUP_TO_TYPE[focus_group]
    
    # 備選: 分析動作名稱
    if not exercises:
        return "mixed"
    
    # 簡單的關鍵字匹配
    all_names = " ".join([ex.get('name', '').lower() for ex in exercises])
    
    if any(kw in all_names for kw in ['squat', 'bench', 'deadlift', 'press']):
        return "strength"
    elif any(kw in all_names for kw in ['run', 'cycle', 'cardio']):
        return "cardio"
    elif any(kw in all_names for kw in ['yoga', 'stretch', 'plank']):
        return "yoga"
    elif any(kw in all_names for kw in ['jump', 'sprint', 'box']):
        return "explosive"
    
    return "mixed"


def update_radar_scores_after_workout(
    current_scores: Dict[str, int],
    workout_data: Dict
) -> Dict[str, int]:
    """
    訓練完成後更新雷達分數
    
    Scientific Basis:
    - Supercompensation Theory: 訓練後身體適應並提升能力
    - Progressive overload: 逐步增加負荷促進進步
    
    Args:
        current_scores: 當前六維度分數
        workout_data: 訓練數據
            {
                "total_volume": 2500,
                "duration_mins": 45,
                "focus_group": "胸部",
                "exercises": [...],
                "completed_sets_count": 12
            }
    
    Returns:
        更新後的分數 {structural: 76, metabolic: 68, ...}
    """
    # 提取訓練參數
    total_volume = workout_data.get('total_volume', 0)
    duration_mins = workout_data.get('duration_mins', 0)
    focus_group = workout_data.get('focus_group', '全身')
    exercises = workout_data.get('exercises', [])
    
    # 判斷訓練類型
    training_type = get_training_type(focus_group, exercises)
    
    # 獲取該類型訓練的維度映射
    if training_type not in TRAINING_TYPE_MAPPINGS:
        training_type = "mixed"
    
    mapping = TRAINING_TYPE_MAPPINGS[training_type]
    
    # 計算基礎分數增量
    base_delta = calculate_score_delta(
        volume=total_volume,
        duration_mins=duration_mins,
        intensity=1.0
    )
    
    # 複製當前分數
    new_scores = current_scores.copy()
    
    # 更新主要影響的維度
    for dimension, multiplier in mapping.get("primary", {}).items():
        current_score = new_scores.get(dimension, 50)
        
        # 計算實際增益 (乘以強度係數)
        actual_gain = base_delta * multiplier
        
        # 隨著分數提高，增益遞減 (防止無限增長)
        if current_score >= 80:
            actual_gain *= 0.5  # 高分時增益減半
        elif current_score >= 90:
            actual_gain *= 0.3  # 非常高分時增益更少
        
        # 更新分數 (上限100)
        new_scores[dimension] = min(100, current_score + actual_gain)
    
    # 更新次要影響的維度
    for dimension, multiplier in mapping.get("secondary", {}).items():
        current_score = new_scores.get(dimension, 50)
        actual_gain = base_delta * multiplier * 0.6  # 次要影響打折
        
        if current_score >= 80:
            actual_gain *= 0.5
        
        new_scores[dimension] = min(100, current_score + actual_gain)
    
    # 四捨五入到整數
    return {k: round(v) for k, v in new_scores.items()}


def decay_scores_over_time(
    scores: Dict[str, int],
    days_since_last_workout: int
) -> Dict[str, int]:
    """
    長時間未訓練時的分數衰減
    
    Scientific Basis:
    - Detraining effects: 停止訓練2週後開始明顯退步
    - 肌力保持較久，代謝和耐力衰減較快
    
    Args:
        scores: 當前分數
        days_since_last_workout: 距離上次訓練天數
    
    Returns:
        衰減後的分數
    """
    if days_since_last_workout < 7:
        return scores  # 7天內不衰減
    
    # 衰減速率 (每週衰減百分比)
    decay_rates = {
        "structural": 0.02,   # 肌力：每週衰減2%
        "metabolic": 0.04,    # 代謝：每週衰減4%
        "alignment": 0.01,    # 體態：每週衰減1%
        "vitality": 0.03,     # 活力：每週衰減3%
        "endurance": 0.05,    # 耐力：每週衰減5% (最快)
        "power": 0.03         # 爆發：每週衰減3%
    }
    
    weeks = days_since_last_workout / 7
    new_scores = {}
    
    for dimension, score in scores.items():
        rate = decay_rates.get(dimension, 0.03)
        # 分數越高，衰減幅度越大
        decay_amount = score * rate * weeks
        new_scores[dimension] = max(30, round(score - decay_amount))  # 下限30
    
    return new_scores


# ============================================================================
# 整合函數
# ============================================================================

def process_workout_and_update_radar(
    user_id: str,
    workout_data: Dict,
    current_scores: Optional[Dict[str, int]] = None,
    last_workout_date: Optional[str] = None
) -> Dict:
    """
    處理訓練並更新雷達分數（含衰減計算）
    
    Args:
        user_id: 用戶ID
        workout_data: 訓練數據
        current_scores: 當前分數 (如果為None，使用默認50)
        last_workout_date: 上次訓練日期 (ISO format)
    
    Returns:
        {
            "new_scores": {...},
            "changes": {...},
            "training_type": "strength"
        }
    """
    # 默認分數
    if not current_scores:
        current_scores = {
            "structural": 50,
            "metabolic": 50,
            "alignment": 50,
            "vitality": 50,
            "endurance": 50,
            "power": 50
        }
    
    # 計算衰減（如果有上次訓練日期）
    scores_after_decay = current_scores.copy()
    
    if last_workout_date:
        try:
            last_date = datetime.fromisoformat(last_workout_date.replace('Z', '+00:00'))
            now = datetime.now()
            days_diff = (now - last_date).days
            
            if days_diff > 7:
                scores_after_decay = decay_scores_over_time(current_scores, days_diff)
        except Exception as e:
            print(f"Error calculating decay: {e}")
    
    # 基於本次訓練更新分數
    new_scores = update_radar_scores_after_workout(scores_after_decay, workout_data)
    
    # 計算變化量
    changes = {
        dimension: new_scores[dimension] - current_scores[dimension]
        for dimension in new_scores.keys()
    }
    
    # 訓練類型
    training_type = get_training_type(
        workout_data.get('focus_group', '全身'),
        workout_data.get('exercises', [])
    )
    
    return {
        "new_scores": new_scores,
        "changes": changes,
        "training_type": training_type,
        "decay_applied": scores_after_decay != current_scores
    }


# ============================================================================
# 測試範例
# ============================================================================

if __name__ == "__main__":
    # 測試力量訓練
    current = {
        "structural": 60,
        "metabolic": 55,
        "alignment": 50,
        "vitality": 65,
        "endurance": 50,
        "power": 58
    }
    
    workout = {
        "total_volume": 2800,
        "duration_mins": 50,
        "focus_group": "胸部",
        "exercises": [
            {"name": "Bench Press", "sets": [{"weight": 80, "reps": 8}]},
            {"name": "Dumbbell Fly", "sets": [{"weight": 20, "reps": 12}]}
        ]
    }
    
    result = process_workout_and_update_radar(
        user_id="USR001",
        workout_data=workout,
        current_scores=current
    )
    
    print("訓練類型:", result['training_type'])
    print("\n原始分數:")
    for dim, score in current.items():
        print(f"  {dim}: {score}")
    
    print("\n新分數:")
    for dim, score in result['new_scores'].items():
        change = result['changes'][dim]
        sign = "+" if change >= 0 else ""
        print(f"  {dim}: {score} ({sign}{change:.1f})")
