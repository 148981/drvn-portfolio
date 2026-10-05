"""
Goal Prediction Engine
Predicts when user will achieve their fitness goals based on current progress
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List
import statistics

def predict_goal_achievement(user_id: str, goal_type: str, target_value: float) -> Dict[str, Any]:
    """
    Predict when user will achieve their goal
    
    Args:
        user_id: User identifier
        goal_type: Type of goal ('body_fat', 'muscle_mass', 'pr_weight')
        target_value: Target value to achieve
        
    Returns:
        Prediction with estimated days, confidence, and recommendations
    """
    from . import workout_history
    
    if goal_type == 'body_fat':
        return predict_body_fat_goal(user_id, target_value)
    elif goal_type == 'muscle_mass':
        return predict_muscle_goal(user_id, target_value)
    elif goal_type == 'pr_weight':
        return predict_pr_goal(user_id, target_value)
    else:
        return {
            "error": "Unknown goal type",
            "supported_types": ['body_fat', 'muscle_mass', 'pr_weight']
        }


def predict_body_fat_goal(user_id: str, target_bf: float) -> Dict[str, Any]:
    """Predict body fat percentage goal achievement"""
    from . import workout_history
    
    # Get InBody history
    inbody_records = workout_history.get_inbody_history(user_id)
    
    if len(inbody_records) < 3:
        return {
            "status": "insufficient_data",
            "message": "需要至少 3 筆 InBody 測量記錄才能預測",
            "current_measurements": len(inbody_records)
        }
    
    # Extract body fat data
    bf_data = [(r['measurement_date'], r.get('body_fat_percent', 0)) 
               for r in inbody_records if r.get('body_fat_percent')]
    
    if len(bf_data) < 3:
        return {
            "status": "insufficient_data",
            "message": "InBody 記錄中缺少體脂率數據"
        }
    
    # Sort by date
    bf_data.sort(key=lambda x: x[0])
    
    current_bf = bf_data[-1][1]
    
    # Check if already achieved
    if current_bf <= target_bf:
        return {
            "status": "already_achieved",
            "message": f"🎉 恭喜！你已經達成目標（當前 {current_bf:.1f}% ≤ 目標 {target_bf:.1f}%）",
            "current_value": current_bf,
            "target_value": target_bf
        }
    
    # Calculate daily progress rate
    first_date = datetime.fromisoformat(bf_data[0][0])
    latest_date = datetime.fromisoformat(bf_data[-1][0])
    days_elapsed = (latest_date - first_date).days
    
    if days_elapsed == 0:
        return {
            "status": "insufficient_data",
            "message": "需要更長時間的數據來計算趨勢"
        }
    
    total_change = current_bf - bf_data[0][1]
    daily_rate = total_change / days_elapsed
    
    # If not making progress
    if daily_rate >= 0:
        return {
            "status": "no_progress",
            "message": "⚠️ 體脂率未呈現下降趨勢",
            "current_value": current_bf,
            "target_value": target_bf,
            "recommendation": "建議調整訓練計劃或飲食策略"
        }
    
    # Calculate estimated days
    remaining_change = current_bf - target_bf
    estimated_days = int(remaining_change / abs(daily_rate))
    
    # Apply safety margin (1.2x)
    estimated_days = int(estimated_days * 1.2)
    
    # Calculate confidence based on data consistency
    bf_values = [x[1] for x in bf_data]
    if len(bf_values) >= 3:
        variance = statistics.variance(bf_values)
        # Lower variance = higher confidence
        confidence = max(0.5, min(0.95, 1 - (variance / 10)))
    else:
        confidence = 0.6
    
    estimated_date = datetime.now() + timedelta(days=estimated_days)
    
    return {
        "status": "prediction_available",
        "estimated_days": estimated_days,
        "estimated_date": estimated_date.strftime('%Y-%m-%d'),
        "confidence": round(confidence, 2),
        "current_value": round(current_bf, 1),
        "target_value": target_bf,
        "daily_progress_rate": round(abs(daily_rate), 3),
        "message": f"📊 預測 {estimated_days} 天後達成目標（約 {estimated_days//30} 個月）",
        "recommendation": "保持當前訓練和飲食計劃" if confidence > 0.75 else "建議加強訓練強度以提高進步速度"
    }


def predict_muscle_goal(user_id: str, target_muscle: float) -> Dict[str, Any]:
    """Predict muscle mass goal achievement"""
    from . import workout_history
    
    inbody_records = workout_history.get_inbody_history(user_id)
    
    muscle_data = [(r['measurement_date'], r.get('skeletal_muscle_mass', 0))
                   for r in inbody_records if r.get('skeletal_muscle_mass')]
    
    if len(muscle_data) < 3:
        return {
            "status": "insufficient_data",
            "message": "需要至少 3 筆骨骼肌數據"
        }
    
    muscle_data.sort(key=lambda x: x[0])
    current_muscle = muscle_data[-1][1]
    
    if current_muscle >= target_muscle:
        return {
            "status": "already_achieved",
            "message": f"🎉 已達成目標！當前 {current_muscle:.1f}kg ≥ 目標 {target_muscle:.1f}kg",
            "current_value": current_muscle,
            "target_value": target_muscle
        }
    
    # Calculate growth rate
    first_date = datetime.fromisoformat(muscle_data[0][0])
    latest_date = datetime.fromisoformat(muscle_data[-1][0])
    days_elapsed = (latest_date - first_date).days
    
    if days_elapsed == 0:
        return {"status": "insufficient_data", "message": "需要更長時間的數據"}
    
    total_gain = current_muscle - muscle_data[0][1]
    daily_rate = total_gain / days_elapsed
    
    if daily_rate <= 0:
        return {
            "status": "no_progress",
            "message": "⚠️ 肌肉量未呈現增長趨勢",
            "recommendation": "建議增加蛋白質攝取和力量訓練"
        }
    
    remaining_gain = target_muscle - current_muscle
    estimated_days = int(remaining_gain / daily_rate * 1.3)  # Conservative estimate
    
    return {
        "status": "prediction_available",
        "estimated_days": estimated_days,
        "estimated_date": (datetime.now() + timedelta(days=estimated_days)).strftime('%Y-%m-%d'),
        "confidence": 0.70,
        "current_value": round(current_muscle, 1),
        "target_value": target_muscle,
        "daily_progress_rate": round(daily_rate, 4),
        "message": f"💪 預測 {estimated_days} 天後達成肌肉增長目標",
        "recommendation": "持續高強度訓練並確保充足營養"
    }


def predict_pr_goal(user_id: str, target_weight: float, exercise_name: str = None) -> Dict[str, Any]:
    """Predict PR weight goal achievement"""
    from . import workout_history
    
    # Get strength history
    strength_data = workout_history.get_strength_history(user_id, exercise_name)
    
    if not strength_data or len(strength_data) < 3:
        return {
            "status": "insufficient_data",
            "message": f"需要至少 3 筆{exercise_name or ''}力量記錄"
        }
    
    # Sort by date
    records = sorted(strength_data, key=lambda x: x.get('date', ''))
    current_pr = records[-1].get('pr_weight', 0)
    
    if current_pr >= target_weight:
        return {
            "status": "already_achieved",
            "message": f"🏆 已達成PR目標！當前 {current_pr}kg ≥ 目標 {target_weight}kg"
        }
    
    # Calculate progress rate
    first_date = datetime.fromisoformat(records[0]['date'])
    latest_date = datetime.fromisoformat(records[-1]['date'])
    days_elapsed = (latest_date - first_date).days
    
    if days_elapsed == 0:
        return {"status": "insufficient_data"}
    
    weight_gain = current_pr - records[0].get('pr_weight', 0)
    weekly_rate = (weight_gain / days_elapsed) * 7
    
    if weekly_rate <= 0:
        return {
            "status": "no_progress",
            "message": "⚠️ PR 未呈現增長",
            "recommendation": "考慮調整訓練計劃或使用漸進超負荷"
        }
    
    remaining_weight = target_weight - current_pr
    estimated_weeks = int((remaining_weight / weekly_rate) * 1.5)  # Conservative
    estimated_days = estimated_weeks * 7
    
    return {
        "status": "prediction_available",
        "estimated_days": estimated_days,
        "estimated_weeks": estimated_weeks,
        "confidence": 0.75,
        "current_value": current_pr,
        "target_value": target_weight,
        "weekly_progress_rate": round(weekly_rate, 2),
        "message": f"🎯 預測 {estimated_weeks} 週後突破 {target_weight}kg",
        "recommendation": "維持漸進式增重，每週增加 2-5%"
    }
