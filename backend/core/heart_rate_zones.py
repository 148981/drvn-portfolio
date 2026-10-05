"""
Heart Rate Zones Calculator
基於 InBody 數據和用戶年齡計算個人化心率區間
"""

def calculate_max_heart_rate(age: int, gender: str = 'male') -> int:
    """
    計算最大心率 (Maximum Heart Rate, MHR)
    
    使用更精確的公式：
    - 男性: 214 - (0.8 × 年齡)
    - 女性: 209 - (0.7 × 年齡)
    
    傳統公式 (220 - 年齡) 誤差較大
    """
    if gender == 'female':
        return int(209 - (0.7 * age))
    else:
        return int(214 - (0.8 * age))


def estimate_resting_hr(body_fat_percent: float, fitness_level: str) -> int:
    """
    根據體脂率和健身水平估算靜止心率
    
    體脂率越低 + 健身水平越高 → 靜止心率越低
    
    Args:
        body_fat_percent: 體脂率 (%)
        fitness_level: 'beginner', 'intermediate', 'advanced'
    
    Returns:
        估算的靜止心率 (bpm)
    """
    base_rhr = {
        'beginner': 75,
        'intermediate': 65,
        'advanced': 55
    }.get(fitness_level, 70)
    
    # Safety check for None
    if body_fat_percent is None:
        return base_rhr
    
    # 體脂率每低於平均值 5%，靜止心率約降低 3 bpm
    # 男性平均體脂 20%，女性 25%
    avg_body_fat = 22.5
    fat_adjustment = (body_fat_percent - avg_body_fat) * 0.6
    
    resting_hr = int(base_rhr + fat_adjustment)
    
    # 範圍限制: 45-90 bpm
    return max(45, min(90, resting_hr))


def calculate_hr_zones(
    age: int,
    gender: str = 'male',
    resting_hr: int = None,
    body_fat_percent: float = None,
    fitness_level: str = 'intermediate'
) -> dict:
    """
    計算個人化心率區間 (使用 Karvonen 公式)
    
    Karvonen 公式:
    目標心率 = (MHR - RHR) × 強度% + RHR
    
    Args:
        age: 年齡
        gender: 'male' or 'female'
        resting_hr: 靜止心率 (若無提供則估算)
        body_fat_percent: 體脂率 (用於估算靜止心率)
        fitness_level: 'beginner', 'intermediate', 'advanced'
    
    Returns:
        {
            'max_hr': 195,
            'resting_hr': 60,
            'zones': {
                'zone1': {'min': 122, 'max': 135, 'name': '熱身恢復', ...},
                'zone2': {'min': 135, 'max': 149, 'name': '燃脂區', ...},
                ...
            }
        }
    """
    # 計算最大心率
    max_hr = calculate_max_heart_rate(age, gender)
    
    # 估算或使用提供的靜止心率
    if resting_hr is None:
        if body_fat_percent is not None:
            resting_hr = estimate_resting_hr(body_fat_percent, fitness_level)
        else:
            resting_hr = 70  # 預設值
    
    # 心率儲備 (Heart Rate Reserve)
    hr_reserve = max_hr - resting_hr
    
    # 定義各區間的強度範圍
    zone_definitions = {
        'zone1': {
            'intensity_min': 0.50,
            'intensity_max': 0.60,
            'name': '熱身恢復',
            'description': '輕鬆慢跑，能輕鬆對話',
            'color': '#90EE90',
            'benefits': ['恢復', '熱身', '提升基礎代謝']
        },
        'zone2': {
            'intensity_min': 0.60,
            'intensity_max': 0.70,
            'name': '燃脂區',
            'description': '最佳燃脂區間，能持續對話',
            'color': '#FFA500',
            'benefits': ['燃燒脂肪', '提升有氧能力', '建立耐力基礎'],
            'highlight': True  # 標示為重要區間
        },
        'zone3': {
            'intensity_min': 0.70,
            'intensity_max': 0.80,
            'name': '有氧耐力',
            'description': '中等強度，對話開始困難',
            'color': '#FFD700',
            'benefits': ['提升心肺功能', '增強耐力', '提高乳酸閾值']
        },
        'zone4': {
            'intensity_min': 0.80,
            'intensity_max': 0.90,
            'name': '無氧閾值',
            'description': '高強度，難以對話',
            'color': '#FF6347',
            'benefits': ['提升速度', '增強無氧能力', '突破瓶頸']
        },
        'zone5': {
            'intensity_min': 0.90,
            'intensity_max': 1.00,
            'name': '最大努力',
            'description': '全力衝刺，無法對話',
            'color': '#DC143C',
            'benefits': ['提升最大攝氧量', '爆發力訓練'],
            'warning': '僅適合短時間間歇訓練'
        }
    }
    
    # 計算各區間的心率範圍
    zones = {}
    for zone_key, zone_def in zone_definitions.items():
        min_hr = int(hr_reserve * zone_def['intensity_min'] + resting_hr)
        max_hr_zone = int(hr_reserve * zone_def['intensity_max'] + resting_hr)
        
        zones[zone_key] = {
            'min': min_hr,
            'max': max_hr_zone,
            'name': zone_def['name'],
            'description': zone_def['description'],
            'color': zone_def['color'],
            'benefits': zone_def['benefits'],
            'intensity_percent': f"{int(zone_def['intensity_min']*100)}-{int(zone_def['intensity_max']*100)}%"
        }
        
        if 'highlight' in zone_def:
            zones[zone_key]['highlight'] = True
        if 'warning' in zone_def:
            zones[zone_key]['warning'] = zone_def['warning']
    
    return {
        'max_hr': max_hr,
        'resting_hr': resting_hr,
        'hr_reserve': hr_reserve,
        'zones': zones,
        'user_profile': {
            'age': age,
            'gender': gender,
            'fitness_level': fitness_level
        }
    }


def analyze_hr_session(hr_data: list[int], zones: dict) -> dict:
    """
    分析跑步過程中的心率分佈
    
    Args:
        hr_data: 心率數據序列 [145, 150, 155, ...]
        zones: calculate_hr_zones() 返回的 zones 字典
    
    Returns:
        {
            'avg_hr': 152,
            'max_hr': 178,
            'time_in_zones': {
                'zone1': 120,  # 秒
                'zone2': 600,
                ...
            },
            'dominant_zone': 'zone2',
            'efficiency_score': 85  # 燃脂效率評分
        }
    """
    if not hr_data:
        return {}
    
    # 基本統計
    avg_hr = int(sum(hr_data) / len(hr_data))
    max_hr_recorded = max(hr_data)
    
    # 計算每個區間的時間（假設每秒一個數據點）
    time_in_zones = {zone: 0 for zone in zones.keys()}
    
    for hr in hr_data:
        for zone_key, zone_info in zones.items():
            if zone_info['min'] <= hr <= zone_info['max']:
                time_in_zones[zone_key] += 1
                break
    
    # 找出主要區間
    dominant_zone = max(time_in_zones, key=time_in_zones.get)
    
    # 計算燃脂效率評分（Zone 2 時間佔比）
    total_time = len(hr_data)
    zone2_percent = (time_in_zones.get('zone2', 0) / total_time * 100) if total_time > 0 else 0
    efficiency_score = int(min(100, zone2_percent * 1.5))  # Zone 2 超過 67% 就是滿分
    
    return {
        'avg_hr': avg_hr,
        'max_hr': max_hr_recorded,
        'time_in_zones': time_in_zones,
        'time_in_zones_percent': {
            zone: round(time / total_time * 100, 1) if total_time > 0 else 0
            for zone, time in time_in_zones.items()
        },
        'dominant_zone': dominant_zone,
        'dominant_zone_name': zones[dominant_zone]['name'],
        'efficiency_score': efficiency_score,
        'total_duration_sec': total_time
    }


def get_zone_recommendation(hashtags: list[str], zones: dict) -> dict:
    """
    根據用戶的 Hashtag 目標推薦目標心率區間
    
    Args:
        hashtags: 用戶的目標標籤 ['#極致減脂', '#提升體力']
        zones: 心率區間數據
    
    Returns:
        {
            'target_zones': ['zone2', 'zone3'],
            'recommendation': '建議維持在燃脂區間...',
            'tips': [...]
        }
    """
    recommendations = {
        '#極致減脂': {
            'target_zones': ['zone2'],
            'recommendation': f"建議維持在 Zone 2 燃脂區間 ({zones['zone2']['min']}-{zones['zone2']['max']} bpm)，這是燃燒脂肪效率最高的區間。",
            'tips': [
                '配速不要太快，能輕鬆對話即可',
                '持續時間比強度重要，建議 30-60 分鐘',
                '避免進入 Zone 4，會降低燃脂比例'
            ]
        },
        '#提升體力': {
            'target_zones': ['zone2', 'zone3'],
            'recommendation': f"建議在 Zone 2-3 之間切換 ({zones['zone2']['min']}-{zones['zone3']['max']} bpm)，提升心肺耐力。",
            'tips': [
                '大部分時間維持 Zone 2，偶爾提升到 Zone 3',
                '逐步增加跑步距離',
                '每週至少 3 次訓練'
            ]
        },
        '#增強肌力': {
            'target_zones': ['zone4'],
            'recommendation': f"建議進行間歇訓練，短時間衝刺到 Zone 4 ({zones['zone4']['min']}-{zones['zone4']['max']} bpm)。",
            'tips': [
                '衝刺 1-2 分鐘，休息 2-3 分鐘',
                '重複 6-8 組',
                '搭配坡度訓練效果更佳'
            ]
        }
    }
    
    # 找到匹配的標籤
    for tag in hashtags:
        if tag in recommendations:
            return recommendations[tag]
    
    # 預設建議
    return {
        'target_zones': ['zone2', 'zone3'],
        'recommendation': f"建議在有氧區間訓練 ({zones['zone2']['min']}-{zones['zone3']['max']} bpm)。",
        'tips': ['根據感覺調整配速', '享受跑步過程']
    }


# 測試範例
if __name__ == '__main__':
    # 範例：30歲男性，體脂率 15%，中級健身者
    zones_data = calculate_hr_zones(
        age=30,
        gender='male',
        body_fat_percent=15.0,
        fitness_level='intermediate'
    )
    
    print("=== 個人化心率區間 ===")
    print(f"最大心率: {zones_data['max_hr']} bpm")
    print(f"靜止心率: {zones_data['resting_hr']} bpm")
    print(f"心率儲備: {zones_data['hr_reserve']} bpm\n")
    
    for zone_key, zone_info in zones_data['zones'].items():
        print(f"{zone_key.upper()}: {zone_info['name']}")
        print(f"  範圍: {zone_info['min']}-{zone_info['max']} bpm ({zone_info['intensity_percent']})")
        print(f"  說明: {zone_info['description']}")
        print(f"  效益: {', '.join(zone_info['benefits'])}")
        if 'highlight' in zone_info:
            print(f"  ⭐ 推薦區間")
        print()
    
    # 模擬跑步數據分析
    import random
    mock_hr_data = [150 + random.randint(-15, 15) for _ in range(1800)]  # 30分鐘
    
    analysis = analyze_hr_session(mock_hr_data, zones_data['zones'])
    print("\n=== 跑步數據分析 ===")
    print(f"平均心率: {analysis['avg_hr']} bpm")
    print(f"最高心率: {analysis['max_hr']} bpm")
    print(f"主要區間: {analysis['dominant_zone_name']}")
    print(f"燃脂效率: {analysis['efficiency_score']}/100")
    print(f"\n各區間時間分佈:")
    for zone, percent in analysis['time_in_zones_percent'].items():
        print(f"  {zone}: {percent}%")
