"""
Pace Analyzer for Running Sessions
配速分析模組：計算每公里分段配速、配速穩定性、趨勢分析
"""

from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import statistics


def calculate_pace(distance_m: float, time_sec: float) -> int:
    """
    計算配速 (秒/公里)
    
    Args:
        distance_m: 距離（公尺）
        time_sec: 時間（秒）
    
    Returns:
        配速（秒/公里）
    """
    if distance_m == 0:
        return 0
    
    # 配速 = 時間 / 距離（轉換為公里）
    pace_per_km = (time_sec / distance_m) * 1000
    return int(pace_per_km)


def format_pace(pace_seconds: int) -> str:
    """
    將配速秒數轉換為 MM:SS 格式
    
    Args:
        pace_seconds: 配速（秒/公里）
    
    Returns:
        格式化字串，例如 "5:30"
    """
    minutes = pace_seconds // 60
    seconds = pace_seconds % 60
    return f"{minutes}:{seconds:02d}"


def analyze_split_pace(gps_data: List[Dict]) -> Dict:
    """
    分析每公里分段配速
    
    GPS 數據格式:
    [
        {'lat': 25.033, 'lng': 121.565, 'timestamp': 1609459200, 'distance_cumulative': 100},
        {'lat': 25.034, 'lng': 121.566, 'timestamp': 1609459210, 'distance_cumulative': 200},
        ...
    ]
    
    Returns:
        {
            'splits': [
                {'km': 1, 'pace': '5:30', 'pace_sec': 330, 'time': '5:30'},
                {'km': 2, 'pace': '5:45', 'pace_sec': 345, 'time': '11:15'},
                ...
            ],
            'fastest_km': {'km': 1, 'pace': '5:18'},
            'slowest_km': {'km': 3, 'pace': '6:05'},
            'avg_pace': '5:35',
            'pace_consistency': 92,  # 0-100 分數
            'pace_trend': 'negative_split'  # 或 'positive_split', 'even_split'
        }
    """
    if not gps_data:
        return {}
    
    splits = []
    total_distance_km = gps_data[-1]['distance_cumulative'] / 1000
    
    # 計算每公里的分段
    km_markers = []
    for km in range(1, int(total_distance_km) + 1):
        target_distance = km * 1000  # 目標距離（公尺）
        
        # 找到最接近該公里數的 GPS 點
        closest_point = min(
            gps_data,
            key=lambda p: abs(p['distance_cumulative'] - target_distance)
        )
        km_markers.append(closest_point)
    
    # 計算每公里的配速
    prev_point = None
    for idx, marker in enumerate(km_markers):
        km_num = idx + 1
        
        if prev_point is None:
            # 第一公里：從起點到第一個標記
            start_point = gps_data[0]
        else:
            start_point = prev_point
        
        # 計算該公里的時間
        time_diff = marker['timestamp'] - start_point['timestamp']
        distance_diff = marker['distance_cumulative'] - start_point['distance_cumulative']
        
        # 配速（秒/公里）
        if distance_diff > 0:
            pace_sec = calculate_pace(distance_diff, time_diff)
        else:
            pace_sec = 0
        
        # 累積時間
        total_time_sec = marker['timestamp'] - gps_data[0]['timestamp']
        
        splits.append({
            'km': km_num,
            'pace': format_pace(pace_sec),
            'pace_sec': pace_sec,
            'time': format_pace(total_time_sec),
            'distance_m': distance_diff
        })
        
        prev_point = marker
    
    if not splits:
        return {}
    
    # 找最快/最慢公里
    fastest = min(splits, key=lambda s: s['pace_sec'])
    slowest = max(splits, key=lambda s: s['pace_sec'])
    
    # 平均配速 (更正為：總時間 / 總距離)
    total_duration_sec = gps_data[-1]['timestamp'] - gps_data[0]['timestamp']
    avg_pace_sec = int(total_duration_sec / total_distance_km) if total_distance_km > 0 else 0
    
    # 配速穩定性評分
    pace_consistency = calculate_pace_consistency([s['pace_sec'] for s in splits])
    
    # 配速趨勢
    pace_trend = analyze_pace_trend([s['pace_sec'] for s in splits])
    
    return {
        'splits': splits,
        'fastest_km': {
            'km': fastest['km'],
            'pace': fastest['pace'],
            'pace_sec': fastest['pace_sec']
        },
        'slowest_km': {
            'km': slowest['km'],
            'pace': slowest['pace'],
            'pace_sec': slowest['pace_sec']
        },
        'avg_pace': format_pace(avg_pace_sec),
        'avg_pace_sec': avg_pace_sec,
        'pace_consistency': pace_consistency,
        'pace_trend': pace_trend,
        'total_km': len(splits)
    }


def calculate_pace_consistency(paces: List[int]) -> int:
    """
    計算配速穩定性評分 (0-100)
    
    標準差越小 = 配速越穩定 = 分數越高
    """
    if len(paces) < 2:
        return 100
    
    # Filter out None and 0 values
    valid_paces = [p for p in paces if p is not None and p > 0]
    
    if len(valid_paces) < 2:
        return 100
    
    mean_pace = statistics.mean(valid_paces)
    
    if mean_pace == 0 or mean_pace is None:
        return 100
    
    std_dev = statistics.stdev(valid_paces)
    
    # 標準差佔平均值的百分比
    variation_percent = (std_dev / mean_pace) * 100
    
    # 轉換為 0-100 分數
    # 變異 < 5% = 100分
    # 變異 > 20% = 0分
    consistency_score = max(0, min(100, 100 - (variation_percent - 5) * 5))
    
    return int(consistency_score)


def analyze_pace_trend(paces: List[int]) -> str:
    """
    分析配速趨勢
    
    Returns:
        'negative_split': 越跑越快（前半慢，後半快）🎯 推薦
        'positive_split': 越跑越慢（前半快，後半慢）
        'even_split': 配速均勻
    """
    if len(paces) < 2:
        return 'even_split'
    
    # 比較前半段與後半段的平均配速
    mid_point = len(paces) // 2
    first_half = statistics.mean(paces[:mid_point])
    second_half = statistics.mean(paces[mid_point:])
    
    diff_percent = ((second_half - first_half) / first_half) * 100
    
    if diff_percent < -3:
        return 'negative_split'  # 後半快（配速數字變小）
    elif diff_percent > 3:
        return 'positive_split'  # 後半慢（配速數字變大）
    else:
        return 'even_split'


def get_pace_recommendations(analysis: Dict, user_hashtags: List[str]) -> Dict:
    """
    根據配速分析結果和用戶目標提供建議
    
    Args:
        analysis: analyze_split_pace() 的返回結果
        user_hashtags: 用戶的目標標籤
    
    Returns:
        {
            'overall_feedback': '...',
            'improvement_tips': [...],
            'next_goal': '...'
        }
    """
    feedback = []
    tips = []
    
    # 配速穩定性反饋
    consistency = analysis['pace_consistency']
    if consistency >= 90:
        feedback.append("✅ 配速非常穩定，節奏控制優秀！")
    elif consistency >= 70:
        feedback.append("👍 配速控制良好，繼續保持。")
    else:
        feedback.append("⚠️ 配速波動較大，建議練習穩定節奏。")
        tips.append("使用節拍器或音樂幫助維持穩定配速")
    
    # 配速趨勢反饋
    trend = analysis['pace_trend']
    if trend == 'negative_split':
        feedback.append("🎯 完美！你實現了「負分段」（越跑越快），這是最理想的配速策略。")
    elif trend == 'positive_split':
        feedback.append("💡 建議：起跑時稍微放慢，留有餘力在後半段加速。")
        tips.append("前 2 公里刻意慢 10-15 秒/公里")
    else:
        feedback.append("⚖️ 配速均勻，適合長距離耐力訓練。")
    
    # 根據標籤給建議
    if '#極致減脂' in user_hashtags:
        tips.append("降脂建議：維持穩定的 Zone 2 配速（能輕鬆對話）比衝刺更有效")
    elif '#提升體力' in user_hashtags:
        tips.append("耐力建議：下次嘗試延長距離 10%，維持相同配速")
    elif '#增強肌力' in user_hashtags:
        tips.append("爆發力建議：加入 400m 衝刺間歇訓練")
    
    # 下次目標
    avg_pace = analysis['avg_pace_sec']
    target_pace = avg_pace - 5  # 下次目標快 5 秒/公里
    next_goal = f"下次挑戰：平均配速 {format_pace(target_pace)}"
    
    return {
        'overall_feedback': ' '.join(feedback),
        'improvement_tips': tips,
        'next_goal': next_goal,
        'consistency_rating': consistency,
        'trend': trend
    }


def generate_mock_gps_data(distance_km: float, avg_pace_sec: int = 330) -> List[Dict]:
    """
    生成模擬 GPS 數據（用於測試）
    
    Args:
        distance_km: 總距離（公里）
        avg_pace_sec: 平均配速（秒/公里）
    
    Returns:
        模擬的 GPS 數據列表
    """
    import random
    
    gps_data = []
    start_timestamp = int(datetime.now().timestamp())
    
    # 模擬配速變化：前兩公里較快，中段穩定，最後衝刺
    cumulative_distance = 0
    cumulative_time = 0
    
    for meter in range(0, int(distance_km * 1000), 10):  # 每 10 公尺一個點
        # 計算當前公里數
        current_km = meter / 1000
        
        # 模擬配速
        if current_km < 1:
            pace = avg_pace_sec - 15 + random.randint(-5, 5)  # 起跑較快
        elif current_km < distance_km - 1:
            pace = avg_pace_sec + random.randint(-10, 10)  # 中段穩定
        else:
            pace = avg_pace_sec - 20 + random.randint(-5, 5)  # 最後衝刺
        
        # 計算這 10 公尺需要的時間
        segment_time = (pace / 1000) * 10
        cumulative_time += segment_time
        cumulative_distance = meter
        
        gps_data.append({
            'lat': 25.033 + (meter * 0.00001),  # 模擬緯度變化
            'lng': 121.565 + (meter * 0.00001),  # 模擬經度變化
            'timestamp': int(start_timestamp + cumulative_time),
            'distance_cumulative': cumulative_distance
        })
    
    return gps_data


# 測試範例
if __name__ == '__main__':
    # 生成模擬數據：5 公里跑步
    print("=== 生成模擬跑步數據 (5km) ===\n")
    mock_gps = generate_mock_gps_data(distance_km=5.0, avg_pace_sec=330)
    
    # 分析配速
    analysis = analyze_split_pace(mock_gps)
    
    print("=== 配速分析結果 ===")
    print(f"總距離: {analysis['total_km']} km")
    print(f"平均配速: {analysis['avg_pace']} /km")
    print(f"配速穩定性: {analysis['pace_consistency']}/100")
    print(f"配速趨勢: {analysis['pace_trend']}")
    print(f"\n最快公里: 第 {analysis['fastest_km']['km']} km - {analysis['fastest_km']['pace']}")
    print(f"最慢公里: 第 {analysis['slowest_km']['km']} km - {analysis['slowest_km']['pace']}")
    
    print(f"\n=== 分段配速 ===")
    for split in analysis['splits']:
        print(f"第 {split['km']} km: {split['pace']} (累積 {split['time']})")
    
    # 獲取建議
    recommendations = get_pace_recommendations(analysis, ['#極致減脂'])
    print(f"\n=== 專業建議 ===")
    print(f"總評: {recommendations['overall_feedback']}")
    print(f"\n改進建議:")
    for tip in recommendations['improvement_tips']:
        print(f"  • {tip}")
    print(f"\n{recommendations['next_goal']}")
