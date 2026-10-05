"""
InBody Total Score Calculation
根據理論基礎計算InBody總分
"""
from typing import Dict, Optional

def calculate_inbody_score(data: Dict) -> Dict:
    """
    計算InBody總分
    使用加權平均，各項指標基於科學理論
    """
    try:
        bmi = data.get('bmi', 0)
        body_fat_percent = data.get('body_fat_percentage', 0)
        skeletal_muscle_mass = data.get('skeletal_muscle_mass', 0)
        visceral_fat_level = data.get('visceral_fat_level', 0)
        bmr = data.get('bmr', 0)
        body_water_percent = data.get('body_water_percentage', 0)
        weight = data.get('weight', 70)
        age = data.get('age', 30)
        gender = data.get('gender', 'male')
        
        # 權重設定（基於健康重要性）
        weights = {
            'bmi': 0.20,           # BMI健康範圍
            'body_fat': 0.25,      # 體脂率（最重要）
            'muscle': 0.20,        # 肌肉量
            'visceral_fat': 0.15,  # 內臟脂肪
            'bmr': 0.10,           # 基礎代謝
            'water': 0.10          # 體水分
        }
        
        # 各項分數計算（0-100）
        scores = {}
        
        # 1. BMI分數
        if 18.5 <= bmi < 24:
            scores['bmi'] = 100
        elif 17 <= bmi < 18.5 or 24 <= bmi < 27:
            scores['bmi'] = 80
        elif 16 <= bmi < 17 or 27 <= bmi < 30:
            scores['bmi'] = 60
        else:
            scores['bmi'] = 40
        
        # 2. 體脂率分數（性別差異）
        if gender == 'male':
            if 10 <= body_fat_percent < 20:
                scores['body_fat'] = 100
            elif 8 <= body_fat_percent < 10 or 20 <= body_fat_percent < 25:
                scores['body_fat'] = 80
            elif 25 <= body_fat_percent < 30:
                scores['body_fat'] = 60
            else:
                scores['body_fat'] = 40
        else:  # female
            if 18 <= body_fat_percent < 28:
                scores['body_fat'] = 100
            elif 15 <= body_fat_percent < 18 or 28 <= body_fat_percent < 32:
                scores['body_fat'] = 80
            elif 32 <= body_fat_percent < 35:
                scores['body_fat'] = 60
            else:
                scores['body_fat'] = 40
        
        # 3. 肌肉量分數（相對於體重比例）
        muscle_ratio = skeletal_muscle_mass / weight if weight > 0 else 0
        if gender == 'male':
            if muscle_ratio >= 0.45:
                scores['muscle'] = 100
            elif muscle_ratio >= 0.40:
                scores['muscle'] = 80
            elif muscle_ratio >= 0.35:
                scores['muscle'] = 60
            else:
                scores['muscle'] = 40
        else:  # female
            if muscle_ratio >= 0.38:
                scores['muscle'] = 100
            elif muscle_ratio >= 0.33:
                scores['muscle'] = 80
            elif muscle_ratio >= 0.28:
                scores['muscle'] = 60
            else:
                scores['muscle'] = 40
        
        # 4. 內臟脂肪分數
        if visceral_fat_level < 10:
            scores['visceral_fat'] = 100
        elif visceral_fat_level < 15:
            scores['visceral_fat'] = 80
        elif visceral_fat_level < 20:
            scores['visceral_fat'] = 60
        else:
            scores['visceral_fat'] = 40
        
        # 5. BMR分數（相對於標準值）
        # 標準BMR計算：Mifflin-St Jeor
        if gender == 'male':
            standard_bmr = 10 * weight + 6.25 * 170 - 5 * age + 5
        else:
            standard_bmr = 10 * weight + 6.25 * 160 - 5 * age - 161
        
        bmr_ratio = bmr / standard_bmr if standard_bmr > 0 else 0
        if bmr_ratio >= 1.0:
            scores['bmr'] = 100
        elif bmr_ratio >= 0.95:
            scores['bmr'] = 80
        elif bmr_ratio >= 0.90:
            scores['bmr'] = 60
        else:
            scores['bmr'] = 40
        
        # 6. 體水分分數
        if gender == 'male':
            if 50 <= body_water_percent <= 65:
                scores['water'] = 100
            elif 45 <= body_water_percent < 50 or 65 < body_water_percent <= 70:
                scores['water'] = 80
            else:
                scores['water'] = 60
        else:
            if 45 <= body_water_percent <= 60:
                scores['water'] = 100
            elif 40 <= body_water_percent < 45 or 60 < body_water_percent <= 65:
                scores['water'] = 80
            else:
                scores['water'] = 60
        
        # 計算加權總分
        total_score = sum(scores[key] * weights[key] for key in scores.keys())
        
        # 評級
        if total_score >= 90:
            grade = 'S'
            comment = '優異！體態極佳'
        elif total_score >= 80:
            grade = 'A'
            comment = '優秀！繼續保持'
        elif total_score >= 70:
            grade = 'B'
            comment = '良好！稍加努力即可更好'
        elif total_score >= 60:
            grade = 'C'
            comment = '尚可，需要改善'
        else:
            grade = 'D'
            comment = '需要努力改善體態'
        
        return {
            'total_score': round(total_score, 1),
            'grade': grade,
            'comment': comment,
            'breakdown': scores,
            'weights': weights
        }
    except Exception as e:
        print(f"Error calculating InBody score: {e}")
        return {
            'total_score': 0,
            'grade': 'N/A',
            'comment': '數據不足',
            'breakdown': {},
            'weights': {}
        }
