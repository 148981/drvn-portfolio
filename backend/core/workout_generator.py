# -*- coding: utf-8 -*-
"""
Workout Plan Generator for Phase 2
根據用戶選擇的 Hashtag 生成 4 週個性化訓練計劃
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import random
from .hashtag_pool import HASHTAG_POOL, get_tag_category, get_tag_metrics, calculate_ideal_radar_shape
from .workout_plans import EXERCISE_DATABASE

# Hashtag → Exercise Category Mapping with Priority
# 將 hashtag 類別映射到最適合的訓練動作類別
HASHTAG_TO_EXERCISE_CATEGORIES = {
    "pain_recovery": {
        "primary": ["core", "legs"],  # 核心和下肢穩定
        "secondary": ["shoulders"],
        "avoid": ["push", "pull"],  # 避免高衝擊胸推和拉類動作
        "focus": "alignment",
        "priority": 3,  # 最高優先級 - 痛點修復
        "description": "痛點修復訓練：專注於姿態矯正和穩定性"
    },
    "aesthetics": {
        "primary": ["push", "pull", "legs"],  # 全身雕塑
        "secondary": ["core", "shoulders"],
        "avoid": [],
        "focus": "structural",
        "priority": 1,
        "description": "體態雕塑訓練：全面的力量和肌肉訓練"
    },
    "performance": {
        "primary": ["push", "pull", "legs"],  # 全面力量
        "secondary": ["core"],
        "avoid": [],
        "focus": "metabolic",
        "priority": 2,
        "description": "運動表現訓練：提升爆發力和耐力"
    },
    "wellness": {
        "primary": ["core", "legs"],  # 低衝擊恢復
        "secondary": ["shoulders"],
        "avoid": ["push", "pull"],
        "focus": "vitality",
        "priority": 2,
        "description": "身心健康訓練：低衝擊恢復性訓練"
    }
}

# Exercise to Metric Impact Map
# 每個動作對四大指標的影響分數 (0-10)
EXERCISE_METRIC_IMPACT = {
    # Push 動作
    "Barbell Bench Press": {"structural": 9, "metabolic": 6, "alignment": 4, "vitality": 3},
    "Dumbbell Bench Press": {"structural": 8, "metabolic": 6, "alignment": 5, "vitality": 4},
    "Machine Chest Press": {"structural": 7, "metabolic": 5, "alignment": 6, "vitality": 5},
    "Push-ups": {"structural": 7, "metabolic": 7, "alignment": 6, "vitality": 6},
    
    # Pull 動作
    "Pull-ups (BW or Assisted)": {"structural": 9, "metabolic": 7, "alignment": 6, "vitality": 5},
    "Barbell Bent Over Row": {"structural": 9, "metabolic": 6, "alignment": 7, "vitality": 4},
    "Lat Pulldown (Machine)": {"structural": 7, "metabolic": 5, "alignment": 6, "vitality": 5},
    
    # Legs 動作
    "Barbell Back Squat": {"structural": 10, "metabolic": 8, "alignment": 7, "vitality": 5},
    "Goblet Squats": {"structural": 7, "metabolic": 6, "alignment": 8, "vitality": 6},
    "Romanian Deadlift": {"structural": 9, "metabolic": 7, "alignment": 9, "vitality": 5},
    "Leg Press Machine": {"structural": 8, "metabolic": 6, "alignment": 6, "vitality": 5},
    
    # Core 動作
    "Plank": {"structural": 6, "metabolic": 4, "alignment": 9, "vitality": 7},
    "Dead Bug": {"structural": 5, "metabolic": 3, "alignment": 9, "vitality": 8},
    "Hanging Leg Raises": {"structural": 7, "metabolic": 6, "alignment": 8, "vitality": 5},
    "Cable Woodchoppers": {"structural": 6, "metabolic": 7, "alignment": 8, "vitality": 6},
    
    # Shoulders 動作
    "Dumbbell Lateral Raises": {"structural": 6, "metabolic": 5, "alignment": 8, "vitality": 5},
    "Cable Face Pulls": {"structural": 6, "metabolic": 5, "alignment": 9, "vitality": 6},
}


def get_exercise_impact_score(exercise_name: str, target_metrics: Dict[str, int], tag_categories: List[str] = None) -> float:
    """
    計算動作對目標指標的影響分數（考慮標籤優先級）
    
    Args:
        exercise_name: 動作名稱
        target_metrics: 目標指標權重 {"structural": 80, "metabolic": 70, ...}
        tag_categories: 標籤類別列表（用於優先級加權）
    
    Returns:
        影響分數 (0-100)
    """
    if exercise_name not in EXERCISE_METRIC_IMPACT:
        return 50.0  # 默認分數
    
    impact = EXERCISE_METRIC_IMPACT[exercise_name]
    total_score = 0
    total_weight = 0
    
    for metric, target_value in target_metrics.items():
        if metric in impact:
            # 基礎分數 = 動作對指標的影響 × 目標值
            base_score = impact[metric] * target_value
            
            # 如果有痛點修復標籤，額外加權姿態和韌性指標
            if tag_categories and "pain_recovery" in tag_categories:
                if metric in ["alignment", "vitality"]:
                    base_score *= 1.5  # 痛點修復優先級：姿態和韌性×1.5
            
            total_score += base_score
            total_weight += target_value
    
    return (total_score / total_weight) if total_weight > 0 else 50.0


def analyze_hashtags_and_generate_explanation(selected_hashtags: List[str]) -> Dict[str, Any]:
    """
    分析用戶選擇的標籤並生成個性化說明
    
    Returns:
        {
            "categories": 標籤類別列表,
            "primary_focus": 主要訓練重點,
            "adjustments": 調整說明列表,
            "explanation": 完整說明文字
        }
    """
    from .hashtag_pool import get_tag_category
    
    categories = []
    category_counts = {}
    tags_by_category = {}
    
    # 統計標籤類別
    for tag in selected_hashtags:
        cat = get_tag_category(tag)
        if cat:
            categories.append(cat)
            category_counts[cat] = category_counts.get(cat, 0) + 1
            if cat not in tags_by_category:
                tags_by_category[cat] = []
            tags_by_category[cat].append(tag)
    
    # 確定主要訓練重點（按優先級和數量）
    if "pain_recovery" in categories:
        primary_focus = "pain_recovery"
    elif category_counts:
        primary_focus = max(category_counts, key=lambda k: (category_counts[k], HASHTAG_TO_EXERCISE_CATEGORIES.get(k, {}).get("priority", 0)))
    else:
        primary_focus = "performance"
    
    # 生成調整說明
    adjustments = []
    
    if "pain_recovery" in categories:
        pain_tags = tags_by_category.get("pain_recovery", [])
        adjustments.append(f"✓ 針對 {', '.join(['#'+t for t in pain_tags[:2]])} 等問題，優先選擇低衝擊、強化核心穩定的動作")
        adjustments.append("✓ 避免高強度胸推和拉類動作，減少關節壓力")
    
    if "aesthetics" in categories:
        adjustments.append("✓ 包含全身雕塑動作，幫助達成體態目標")
    
    if "performance" in categories:
        adjustments.append("✓ 融入爆發力和代謝訓練，提升運動表現")
    
    if "wellness" in categories:
        adjustments.append("✓ 加入恢復性訓練，改善整體身心健康")
    
    # 生成完整說明
    focus_desc = HASHTAG_TO_EXERCISE_CATEGORIES.get(primary_focus, {}).get("description", "均衡訓練")
    explanation = f"💡 基於你選擇的 {', '.join(['#'+t for t in selected_hashtags[:3]])} 等目標，此計劃以「{focus_desc}」為核心。"
    
    return {
        "categories": list(set(categories)),
        "primary_focus": primary_focus,
        "adjustments": adjustments,
        "explanation": explanation
    }


def identify_ace_exercises(exercises: List[Dict], target_metrics: Dict[str, int], top_n: int = 5) -> List[str]:
    """
    識別王牌動作（對目標最有效的動作）
    
    Args:
        exercises: 動作列表
        target_metrics: 目標指標
        top_n: 返回前 N 個王牌動作
    
    Returns:
        王牌動作名稱列表
    """
    exercise_scores = []
    
    for ex in exercises:
        score = get_exercise_impact_score(ex['name'], target_metrics)
        exercise_scores.append({
            'name': ex['name'],
            'score': score,
            'exercise': ex
        })
    
    # 按分數排序
    exercise_scores.sort(key=lambda x: x['score'], reverse=True)
    
    # 返回前 N 個
    ace_names = [ex['name'] for ex in exercise_scores[:top_n]]
    return ace_names


def calculate_weekly_score_goals(current_scores: Dict[str, int], target_scores: Dict[str, int]) -> List[Dict[str, int]]:
    """
    計算 4 週的每週分數目標
    
    Week 1-2: 40% 進步
    Week 3: 40% 進步  
    Week 4: 20% 鞏固
    """
    weekly_goals = []
    
    for week in range(4):
        week_goal = {}
        for metric in current_scores.keys():
            current = current_scores[metric]
            target = target_scores[metric]
            total_gain = target - current
            
            if week < 2:  # Week 1-2
                progress = 0.2 * total_gain  # 各 20%
                week_goal[metric] = int(current + (week + 1) * progress)
            elif week == 2:  # Week 3
                week_goal[metric] = int(current + 0.8 * total_gain)  # 累計到 80%
            else:  # Week 4
                week_goal[metric] = target  # 達到目標
        
        weekly_goals.append(week_goal)
    
    return weekly_goals


def select_exercises_for_day(
    muscle_groups: List[str],
    fitness_level: str,
    exercises_per_day: int,
    used_exercises: set,
    target_metrics: Dict[str, int]
) -> List[Dict]:
    """
    為某一天選擇訓練動作
    
    Args:
        muscle_groups: 要訓練的肌群列表
        fitness_level: 健身水平
        exercises_per_day: 每日動作數量
        used_exercises: 已使用過的動作（避免重複）
        target_metrics: 目標指標
    
    Returns:
        動作列表
    """
    selected = []
    
    for muscle_group in muscle_groups:
        if muscle_group not in EXERCISE_DATABASE:
            continue
        
        available = EXERCISE_DATABASE[muscle_group].get(fitness_level, [])
        
        # 過濾掉已使用的動作
        available = [ex for ex in available if ex['name'] not in used_exercises]
        
        if not available:
            # 如果該難度沒有可用動作，嘗試其他難度
            for level in ['beginner', 'intermediate', 'advanced']:
                available = EXERCISE_DATABASE[muscle_group].get(level, [])
                available = [ex for ex in available if ex['name'] not in used_exercises]
                if available:
                    break
        
        if available:
            # 根據目標指標選擇最相關的動作
            ex_with_scores = []
            for ex in available:
                score = get_exercise_impact_score(ex['name'], target_metrics)
                ex_with_scores.append((ex, score))
            
            ex_with_scores.sort(key=lambda x: x[1], reverse=True)
            chosen = ex_with_scores[0][0]
            selected.append(chosen)
            used_exercises.add(chosen['name'])
    
    # 如果選擇的動作不夠，隨機補充
    attempts = 0
    max_attempts = 20  # 防止無限循環
    while len(selected) < exercises_per_day and len(used_exercises) < 50 and attempts < max_attempts:
        attempts += 1
        found_exercise = False
        
        for mg in muscle_groups:
            if mg in EXERCISE_DATABASE:
                available = EXERCISE_DATABASE[mg].get(fitness_level, [])
                available = [ex for ex in available if ex['name'] not in used_exercises]
                if available:
                    chosen = random.choice(available)
                    selected.append(chosen)
                    used_exercises.add(chosen['name'])
                    found_exercise = True
                    break
        
        # 如果沒有找到任何可用動作，停止循環
        if not found_exercise:
            break
    
    return selected[:exercises_per_day]


def generate_4_week_plan(
    selected_hashtags: List[str],
    user_profile: Dict[str, Any],
    user_id: str = "default_user"
) -> Dict[str, Any]:
    """
    生成 4 週訓練計劃
    
    Args:
        selected_hashtags: 用戶選擇的 hashtag 列表
        user_profile: 用戶資料
        user_id: 用戶 ID
    
    Returns:
        完整的 4 週訓練計劃
    """
    # 1. 計算目標指標
    target_metrics = calculate_ideal_radar_shape(selected_hashtags)
    
    # 假設當前分數（實際應從用戶資料讀取）
    current_scores = user_profile.get('current_scores', {
        "structural": 60,
        "metabolic": 60,
        "alignment": 60,
        "vitality": 60
    })
    
    # 2. 計算每週分數目標
    weekly_score_goals = calculate_weekly_score_goals(current_scores, target_metrics)
    
    # 3. 確定訓練參數
    fitness_level = user_profile.get('fitness_level', 'beginner')
    exercises_per_day = 4 if fitness_level == 'beginner' else 5
    
    # 4. 確定主要訓練分類
    primary_categories = []
    for tag in selected_hashtags:
        category = get_tag_category(tag)
        if category and category in HASHTAG_TO_EXERCISE_CATEGORIES:
            cat_info = HASHTAG_TO_EXERCISE_CATEGORIES[category]
            primary_categories.extend(cat_info['primary'])
    
    # 去重
    primary_categories = list(set(primary_categories))
    if not primary_categories:
        primary_categories = ['push', 'pull', 'legs', 'core']
    
    # 5. 生成 4 週計劃
    weeks = []
    used_exercises = set()
    plan_id = f"plan_{user_id}_{int(datetime.now().timestamp())}"
    
    week_intensities = [
        {"week": 1, "focus": "適應期 - 建立動作模式", "intensity": 0.6},
        {"week": 2, "focus": "強化期 - 增加負荷", "intensity": 0.75},
        {"week": 3, "focus": "高峰期 - 最大刺激", "intensity": 0.9},
        {"week": 4, "focus": "調整期 - 恢復鞏固", "intensity": 0.7}
    ]
    
    all_exercises = []  # 收集所有動作用於識別王牌
    
    for week_info in week_intensities:
        week_num = week_info['week']
        days = []
        
        # 每週 3 天訓練
        training_days = ['Monday', 'Wednesday', 'Friday']
        muscle_rotation = [
            ['push', 'core'],
            ['legs', 'core'],
            ['pull', 'shoulders']
        ]
        
        for day_idx, day_name in enumerate(training_days):
            muscle_groups = muscle_rotation[day_idx]
            
            # 選擇動作
            exercises = select_exercises_for_day(
                muscle_groups,
                fitness_level,
                exercises_per_day,
                used_exercises,
                target_metrics
            )
            
            all_exercises.extend(exercises)
            
            # 計算每日分數目標
            daily_score_target = sum(weekly_score_goals[week_num - 1].values()) / (7 * 4)  # 平均到每天
            
            day_data = {
                "day_number": (week_num - 1) * 7 + day_idx * 2 + 1,
                "day_name": day_name,
                "date": (datetime.now() + timedelta(days=(week_num - 1) * 7 + day_idx * 2)).strftime("%Y-%m-%d"),
                "exercises": exercises,
                "daily_score_target": round(daily_score_target, 1),
                "completed": False
            }
            
            days.append(day_data)
        
        week_data = {
            "week_number": week_num,
            "focus": week_info['focus'],
            "intensity": week_info['intensity'],
            "target_scores": weekly_score_goals[week_num - 1],
            "days": days
        }
        
        weeks.append(week_data)
    
    # 6. 識別王牌動作
    ace_exercises = identify_ace_exercises(all_exercises, target_metrics, top_n=5)
    
    # 7. 標記王牌動作
    for week in weeks:
        for day in week['days']:
            for ex in day['exercises']:
                ex['is_ace'] = ex['name'] in ace_exercises
                ex['target_metrics'] = []
                # 添加影響的指標
                if ex['name'] in EXERCISE_METRIC_IMPACT:
                    impacts = EXERCISE_METRIC_IMPACT[ex['name']]
                    ex['target_metrics'] = [m for m, score in impacts.items() if score >= 7]
                ex['expected_score_gain'] = round(get_exercise_impact_score(ex['name'], target_metrics) / 100, 2)
    
    # 8. 分析標籤並生成個性化說明
    hashtag_analysis = analyze_hashtags_and_generate_explanation(selected_hashtags)
    
    # 9. 構建完整計劃
    plan = {
        "plan_id": plan_id,
        "user_id": user_id,
        "created_at": datetime.now().isoformat(),
        "selected_hashtags": selected_hashtags,
        "target_metrics": target_metrics,
        "current_scores": current_scores,
        "weeks": weeks,
        "ace_exercises": ace_exercises,
        "total_days": 28,
        "training_days": 12,  # 3 天/週 * 4 週
        "hashtag_info": hashtag_analysis,  # 新增：標籤分析資訊
        "overview": {
            "duration": "4 週",
            "frequency": "每週 3 天",
            "fitness_level": fitness_level,
            "primary_focus": ", ".join(primary_categories),
            "explanation": hashtag_analysis["explanation"],  # 新增：個性化說明
            "adjustments": hashtag_analysis["adjustments"]  # 新增：調整說明列表
        }
    }
    
    return plan


def get_plan_summary(plan: Dict[str, Any]) -> str:
    """
    生成計劃摘要文字
    """
    try:
        hashtags = ", ".join([f"#{tag}" for tag in plan.get('selected_hashtags', [])])
        
        ace_exercises = plan.get('ace_exercises', [])
        ace_ex = ", ".join(ace_exercises[:3]) if ace_exercises else "N/A"
        
        overview = plan.get('overview', {})
        fitness_level = overview.get('fitness_level', 'beginner')
        
        summary = f"""
        🎯 基於您選擇的目標 {hashtags}，我們為您量身打造了 4 週訓練計劃！
        
        ⭐ 您的王牌動作：{ace_ex}
        📅 訓練週期：4 週（每週 3 天）
        💪 難度等級：{fitness_level.upper()}
        
        Week 1: 適應期 - 建立正確動作模式
        Week 2: 強化期 - 逐步增加負荷
        Week 3: 高峰期 - 最大化訓練效果
        Week 4: 調整期 - 恢復與鞏固成果
        """
        
        return summary.strip()
    except Exception as e:
        print(f"Error generating summary: {e}")
        return "您的個性化訓練計劃已準備就緒！"
