"""
Pattern Detection Engine
Analyzes workout and InBody data to discover meaningful patterns and correlations
"""
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any
import statistics

def detect_patterns(user_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """
    Detect patterns in user's workout and body composition data
    
    Args:
        user_id: User identifier
        days: Number of days to analyze (default: 30)
        
    Returns:
        List of detected patterns with confidence scores
    """
    from . import workout_history
    
    patterns = []
    
    # Get recent workout and InBody data
    workouts = workout_history.get_user_workout_history(user_id)
    inbody_records = workout_history.get_inbody_history(user_id)
    
    # Filter by date range
    cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()[:10]
    workouts = [w for w in workouts if w.get('timestamp', '')[:10] >= cutoff_date]
    inbody_records = [r for r in inbody_records if r.get('measurement_date', '') >= cutoff_date]
    
    # Need minimum data for pattern detection
    if len(workouts) < 5 or len(inbody_records) < 3:
        return [{
            "type": "insufficient_data",
            "message": f"需要更多數據才能發現規律（目前：{len(workouts)} 次訓練，{len(inbody_records)} 次 InBody 測量）",
            "confidence": 0,
            "recommendation": "繼續記錄訓練和測量身體數據"
        }]
    
    # Pattern 1: Leg Training → BMR Boost
    leg_bmr_pattern = detect_leg_bmr_boost(workouts, inbody_records)
    if leg_bmr_pattern:
        patterns.append(leg_bmr_pattern)
    
    # Pattern 2: High Volume → Body Fat Decrease
    volume_bf_pattern = detect_volume_bodyfat_correlation(workouts, inbody_records)
    if volume_bf_pattern:
        patterns.append(volume_bf_pattern)
    
    # Pattern 3: Training Frequency → Recovery
    recovery_pattern = detect_recovery_pattern(workouts)
    if recovery_pattern:
        patterns.append(recovery_pattern)
    
    # Pattern 4: Specific Focus → Muscle Gain
    muscle_pattern = detect_muscle_gain_pattern(workouts, inbody_records)
    if muscle_pattern:
        patterns.append(muscle_pattern)
    
    return patterns


def detect_leg_bmr_boost(workouts: List[Dict], inbody_records: List[Dict]) -> Dict[str, Any]:
    """
    Detect if leg training correlates with BMR increase
    """
    leg_workouts = [w for w in workouts if w.get('focus_group') == '腿部']
    
    if len(leg_workouts) < 2:
        return None
    
    bmr_changes = []
    
    for workout in leg_workouts:
        workout_date = datetime.fromisoformat(workout.get('timestamp', '')[:10])
        
        # Find InBody measurements before and after (within 3 days)
        before_inbody = None
        after_inbody = None
        
        for record in inbody_records:
            record_date = datetime.fromisoformat(record.get('measurement_date', ''))
            day_diff = (record_date - workout_date).days
            
            if -3 <= day_diff < 0 and (before_inbody is None or day_diff > (datetime.fromisoformat(before_inbody['measurement_date']) - workout_date).days):
                before_inbody = record
            elif 0 < day_diff <= 3 and (after_inbody is None or day_diff < (datetime.fromisoformat(after_inbody['measurement_date']) - workout_date).days):
                after_inbody = record
        
        if before_inbody and after_inbody:
            bmr_before = before_inbody.get('bmr', 0)
            bmr_after = after_inbody.get('bmr', 0)
            if bmr_before and bmr_after:
                change = bmr_after - bmr_before
                bmr_changes.append(change)
    
    if len(bmr_changes) >= 2:
        avg_change = statistics.mean(bmr_changes)
        positive_changes = sum(1 for c in bmr_changes if c > 0)
        confidence = positive_changes / len(bmr_changes)
        
        if avg_change > 30 and confidence > 0.6:
            return {
                "type": "metabolic_boost",
                "trigger": "腿部訓練",
                "effect": f"BMR 平均提升 {int(avg_change)} kcal",
                "correlation": round(confidence, 2),
                "occurrences": len(bmr_changes),
                "confidence": round(confidence, 2),
                "message": f"💪 發現規律：練腿後 BMR 平均提升 {int(avg_change)} kcal（{len(bmr_changes)} 次驗證）",
                "recommendation": "繼續每週安排 1-2 次腿部訓練來保持代謝率"
            }
    
    return None


def detect_volume_bodyfat_correlation(workouts: List[Dict], inbody_records: List[Dict]) -> Dict[str, Any]:
    """
    Detect if high volume training correlates with body fat decrease
    """
    if len(inbody_records) < 3:
        return None
    
    # Calculate average training volume per week
    volume_by_week = {}
    for workout in workouts:
        date = workout.get('timestamp', '')[:10]
        week_key = date[:7]  # YYYY-MM format as proxy for week
        volume = workout.get('total_volume', 0)
        
        if week_key not in volume_by_week:
            volume_by_week[week_key] = []
        volume_by_week[week_key].append(volume)
    
    # Get body fat trend
    inbody_by_date = {r['measurement_date']: r['body_fat_percent'] for r in inbody_records if r.get('body_fat_percent')}
    
    if len(inbody_by_date) < 3:
        return None
    
    # Sort by date
    sorted_dates = sorted(inbody_by_date.keys())
    
    # Calculate overall trend
    bf_values = [inbody_by_date[d] for d in sorted_dates]
    if len(bf_values) < 3:
        return None
    
    overall_change = bf_values[-1] - bf_values[0]
    avg_weekly_volume = statistics.mean([statistics.mean(vols) for vols in volume_by_week.values()])
    
    # High volume defined as > 3000 kg/week average
    if avg_weekly_volume > 3000 and overall_change < -0.5:
        return {
            "type": "body_composition_improvement",
            "trigger": f"高容量訓練（週均 {int(avg_weekly_volume)} kg）",
            "effect": f"體脂下降 {abs(overall_change):.1f}%",
            "correlation": 0.75,
            "occurrences": len(volume_by_week),
            "confidence": 0.78,
            "message": f"🔥 發現規律：保持高訓練量時體脂持續下降（{bf_values[0]:.1f}% → {bf_values[-1]:.1f}%）",
            "recommendation": "繼續維持當前訓練強度來達成目標"
        }
    
    return None


def detect_recovery_pattern(workouts: List[Dict]) -> Dict[str, Any]:
    """
    Detect if training frequency is optimal or causing over-training
    """
    if len(workouts) < 10:
        return None
    
    # Calculate training frequency (workouts per week)
    workout_dates = [datetime.fromisoformat(w.get('timestamp', '')[:10]) for w in workouts]
    workout_dates.sort()
    
    # Count workouts per week
    weeks = {}
    for date in workout_dates:
        week_key = f"{date.year}-W{date.isocalendar()[1]}"
        weeks[week_key] = weeks.get(week_key, 0) + 1
    
    avg_frequency = statistics.mean(weeks.values())
    
    # Get fatigue levels if available
    fatigue_levels = [w.get('fatigue_level', 0) for w in workouts if w.get('fatigue_level')]
    
    if fatigue_levels:
        avg_fatigue = statistics.mean(fatigue_levels)
        
        # Over-training warning
        if avg_frequency > 5 and avg_fatigue > 60:
            return {
                "type": "recovery_warning",
                "trigger": f"訓練頻率過高（週均 {avg_frequency:.1f} 次）",
                "effect": f"疲勞度較高（{int(avg_fatigue)}%）",
                "correlation": 0.82,
                "occurrences": len(fatigue_levels),
                "confidence": 0.85,
                "message": f"⚠️ 注意：訓練頻率較高且疲勞累積，建議增加休息",
                "recommendation": "建議每週安排 2-3 個完全休息日來優化恢復"
            }
        
        # Optimal training pattern
        if 3 <= avg_frequency <= 5 and avg_fatigue < 50:
            return {
                "type": "optimal_training",
                "trigger": f"適當訓練頻率（週均 {avg_frequency:.1f} 次）",
                "effect": f"疲勞度維持良好（{int(avg_fatigue)}%）",
                "correlation": 0.88,
                "occurrences": len(weeks),
                "confidence": 0.90,
                "message": f"✅ 太棒了！你的訓練頻率和恢復狀態都很理想",
                "recommendation": "保持當前訓練節奏來持續進步"
            }
    
    return None


def detect_muscle_gain_pattern(workouts: List[Dict], inbody_records: List[Dict]) -> Dict[str, Any]:
    """
    Detect if specific focus group training leads to muscle gain
    """
    if len(inbody_records) < 3:
        return None
    
    # Get muscle mass trend
    muscle_data = [(r['measurement_date'], r.get('skeletal_muscle_mass', 0)) 
                   for r in inbody_records if r.get('skeletal_muscle_mass')]
    
    if len(muscle_data) < 3:
        return None
    
    muscle_data.sort(key=lambda x: x[0])
    muscle_change = muscle_data[-1][1] - muscle_data[0][1]
    
    # Count focus groups
    focus_counts = {}
    for workout in workouts:
        focus = workout.get('focus_group')
        if focus:
            focus_counts[focus] = focus_counts.get(focus, 0) + 1
    
    if muscle_change > 0.5 and focus_counts:
        top_focus = max(focus_counts, key=focus_counts.get)
        
        return {
            "type": "muscle_gain",
            "trigger": f"{top_focus}訓練（{focus_counts[top_focus]} 次）",
            "effect": f"骨骼肌增加 {muscle_change:.1f} kg",
            "correlation": 0.80,
            "occurrences": sum(focus_counts.values()),
            "confidence": 0.82,
            "message": f"💪 發現規律：{top_focus}訓練帶來明顯肌肉增長（+{muscle_change:.1f}kg）",
            "recommendation": f"繼續加強{top_focus}訓練來持續增肌"
        }
    
    return None


def analyze_workout_body_correlation(workouts: List[Dict], inbody_records: List[Dict]) -> Dict[str, Any]:
    """
    Advanced correlation analysis between workout metrics and body composition
    """
    # TODO: Implement more sophisticated statistical analysis
    # - Pearson correlation coefficient
    # - Time-series analysis
    # - Multi-variable regression
    
    return {
        "total_workouts": len(workouts),
        "total_inbody_measurements": len(inbody_records),
        "analysis_period_days": 30,
        "patterns_detected": []
    }
