# -*- coding: utf-8 -*-
"""
Hashtag Pool 2.0 - Expanded Tag System
Maps user intent hashtags to 4-metric radar system
"""

HASHTAG_POOL = {
    # 🩹 痛點修復類 (Pain & Recovery)
    "pain_recovery": {
        "name": "痛點修復",
        "name_en": "Pain & Recovery",
        "tags": [
            "下背痠痛", "肩頸僵硬", "膝蓋不適", "骨盆前傾",
            "圓肩駝背", "足底緊繃", "久坐族", "容易疲累",
            "腰椎不適", "五十肩", "髖關節緊繃", "小腿緊繃"
        ],
        "primary_metric": "alignment",
        "secondary_metric": "vitality",
        "icon": "🩹",
        "color": "red",
        "gradient": "from-red-500 to-pink-500"
    },
    
    # 🎯 體態雕塑類 (Aesthetics)
    "aesthetics": {
        "name": "體態雕塑",
        "name_en": "Aesthetics",
        "tags": [
            "增肌", "減脂", "線條緊實", "馬甲線", "蜜桃臀",
            "倒三角形", "告別掰掰袖", "腹肌顯現", "美背塑造",
            "緊實手臂", "修長雙腿", "翹臀養成", "消除副乳"
        ],
        "primary_metric": "structural",
        "secondary_metric": "metabolic",
        "icon": "🎯",
        "color": "blue",
        "gradient": "from-blue-500 to-purple-500"
    },
    
    # ⚡ 運動表現類 (Performance)
    "performance": {
        "name": "運動表現",
        "name_en": "Performance",
        "tags": [
            "提升體力", "增加力量", "運動新手", "高強度挑戰",
            "爆發力訓練", "增加代謝", "提升耐力", "突破PR",
            "速度提升", "柔軟度改善", "核心穩定", "平衡感強化"
        ],
        "primary_metric": "metabolic",
        "secondary_metric": "structural",
        "icon": "⚡",
        "color": "yellow",
        "gradient": "from-yellow-500 to-orange-500"
    },
    
    # 🧘 身心健康類 (Wellness)
    "wellness": {
        "name": "身心健康",
        "name_en": "Wellness",
        "tags": [
            "改善睡眠", "抗壓舒壓", "提升專注力", "情緒穩定",
            "焦慮緩解", "增強免疫", "提升活力", "延緩老化",
            "改善循環", "淋巴排毒", "荷爾蒙平衡"
        ],
        "primary_metric": "vitality",
        "secondary_metric": "alignment",
        "icon": "🧘",
        "color": "green",
        "gradient": "from-green-500 to-teal-500"
    },
    
    # 👤 特殊情境類 (Context)
    "context": {
        "name": "特殊情境",
        "name_en": "Context",
        "tags": [
            "久坐上班族", "產後修復", "週末戰士", "備賽挑戰",
            "銀髮族", "學生黨", "外食族補救", "時間有限",
            "在家訓練", "健身房訓練", "戶外運動"
        ],
        "weight_modifier": 1.15,
        "icon": "👤",
        "color": "purple",
        "gradient": "from-purple-500 to-pink-500"
    }
}

# Metric definitions
METRICS = {
    "structural": {
        "name": "結構支撐分",
        "name_en": "Structural Strength",
        "description": "肌肉力量與骨骼支撐能力",
        "icon": "💪",
        "color": "blue"
    },
    "metabolic": {
        "name": "代謝引擎分",
        "name_en": "Metabolic Drive",
        "description": "燃脂效率與心肺耐力",
        "icon": "🔥",
        "color": "orange"
    },
    "alignment": {
        "name": "姿態校正分",
        "name_en": "Alignment & Posture",
        "description": "關節活動度與體態正確性",
        "icon": "🎯",
        "color": "green"
    },
    "vitality": {
        "name": "身心韌性分",
        "name_en": "Vitality & Resilience",
        "description": "恢復能力與神經系統健康",
        "icon": "⚡",
        "color": "purple"
    }
}


def get_tag_category(tag: str) -> str:
    """Find which category a tag belongs to"""
    for category, data in HASHTAG_POOL.items():
        if tag in data["tags"]:
            return category
    return None


def get_tag_metrics(tag: str) -> dict:
    """Get primary and secondary metrics for a tag"""
    category = get_tag_category(tag)
    if not category:
        return None
    
    cat_data = HASHTAG_POOL[category]
    return {
        "primary": cat_data.get("primary_metric"),
        "secondary": cat_data.get("secondary_metric"),
        "weight_modifier": cat_data.get("weight_modifier", 1.0)
    }


def calculate_ideal_radar_shape(selected_tags: list) -> dict:
    """
    Calculate ideal radar shape based on selected hashtags
    Returns target scores for each metric (0-100)
    """
    if not selected_tags:
        return {
            "structural": 50,
            "metabolic": 50,
            "alignment": 50,
            "vitality": 50
        }
    
    # Initialize scores
    metric_weights = {
        "structural": 0,
        "metabolic": 0,
        "alignment": 0,
        "vitality": 0
    }
    
    # Calculate weights from tags
    for tag in selected_tags:
        metrics = get_tag_metrics(tag)
        if not metrics:
            continue
        
        primary = metrics["primary"]
        secondary = metrics.get("secondary")
        modifier = metrics["weight_modifier"]
        
        # Skip if no primary metric defined (e.g. context tags)
        if not primary:
            continue
            
        # Primary metric gets more weight
        metric_weights[primary] += 3.0 * modifier
        
        # Secondary metric gets less weight
        if secondary:
            metric_weights[secondary] += 1.5 * modifier
    
    # Normalize to 0-100 scale
    total_weight = sum(metric_weights.values())
    if total_weight == 0:
        return {
            "structural": 50,
            "metabolic": 50,
            "alignment": 50,
            "vitality": 50
        }
    
    # Calculate percentages and scale to ideal shape
    ideal_shape = {}
    for metric, weight in metric_weights.items():
        # Higher weight = higher target score
        percentage = (weight / total_weight) * 100
        # Scale to 50-90 range with better distribution
        # - Low priority (0-20%): 50-60
        # - Medium priority (20-40%): 60-75
        # - High priority (40-100%): 75-90
        if percentage < 20:
            score = 50 + (percentage / 20) * 10  # 50-60
        elif percentage < 40:
            score = 60 + ((percentage - 20) / 20) * 15  # 60-75
        else:
            score = 75 + ((percentage - 40) / 60) * 15  # 75-90
        ideal_shape[metric] = int(score)
    
    return ideal_shape



def get_all_tags_by_category() -> dict:
    """Get all tags organized by category for UI display"""
    result = {}
    for category, data in HASHTAG_POOL.items():
        result[category] = {
            "name": data["name"],
            "name_en": data["name_en"],
            "icon": data["icon"],
            "color": data["color"],
            "gradient": data["gradient"],
            "tags": data["tags"]
        }
    return result
