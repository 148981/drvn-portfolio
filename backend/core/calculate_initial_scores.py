"""
InBody to Radar Score Mapping
完整的六維度雷達圖分數計算系統

Scientific References:
- WHO (2000). Obesity: preventing and managing the global epidemic
- American Council on Exercise (ACE) Body Fat Categorization
- Gallagher et al. (2000). Healthy percentage body fat ranges
- Mifflin-St Jeor Equation (1990) for BMR calculation
- American College of Sports Medicine (ACSM) Guidelines for fitness assessment
"""

from typing import Dict, Optional
from enum import Enum

class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"

class SleepQuality(str, Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


# ============================================================================
# 標準值查詢表
# ============================================================================

# 骨骼肌標準值 (kg) - 基於 InBody 研究數據
STANDARD_SMM = {
    "male": {
        (18, 30): 33.0,
        (31, 40): 32.0,
        (41, 50): 30.5,
        (51, 60): 29.0,
        (61, 100): 27.0
    },
    "female": {
        (18, 30): 22.0,
        (31, 40): 21.5,
        (41, 50): 20.5,
        (51, 60): 19.5,
        (61, 100): 18.0
    }
}

def get_standard_smm(gender: Gender, age: int) -> float:
    """獲取標準骨骼肌重量"""
    standards = STANDARD_SMM.get(gender, STANDARD_SMM["male"])
    for (min_age, max_age), value in standards.items():
        if min_age <= age <= max_age:
            return value
    return standards[(18, 30)]


# ============================================================================
# 六個維度評分計算
# ============================================================================

def calculate_structural_score(smm: float, gender: Gender, age: int) -> int:
    """
    計算結構支撐分 (Structural Support)
    
    Scientific Basis:
    - 骨骼肌量與力量直接相關
    - 標準值基於 InBody 人體組成分析標準
    
    Args:
        smm: 骨骼肌重量 (kg)
        gender: 性別
        age: 年齡
    
    Returns:
        分數 (30-90)
    """
    standard = get_standard_smm(gender, age)
    ratio = smm / standard if standard > 0 else 0
    
    if ratio >= 1.15:  # 優秀: 高於標準 15%
        return 90
    elif ratio >= 1.05:  # 良好: 高於標準 5%
        return 75
    elif ratio >= 0.95:  # 標準: ±5%
        return 60
    elif ratio >= 0.85:  # 偏低: 低於標準 15%
        return 45
    else:  # 不足: 低於標準 15% 以上
        return 30


def calculate_metabolic_score(bfp: float, gender: Gender, bmr: Optional[float] = None, 
                              standard_bmr: Optional[float] = None) -> int:
    """
    計算代謝引擎分 (Metabolic Engine)
    
    Scientific Basis:
    - ACE Body Fat Categorization Standards
    - 體脂率影響代謝效率
    - BMR (基礎代謝率) 反映代謝能力
    
    Args:
        bfp: 體脂率 (%)
        gender: 性別
        bmr: 實際基礎代謝率 (kcal/day)
        standard_bmr: 標準基礎代謝率 (kcal/day)
    
    Returns:
        分數 (30-95)
    """
    # 基於體脂率的基礎分數
    if gender == Gender.MALE:
        # 男性標準 (ACE):
        # 6-13% Essential, 14-17% Athletes, 18-24% Fitness, 25-31% Average, 32%+ Obese
        if bfp < 14:  # Athletes
            base_score = 95
        elif bfp < 18:  # Fitness
            base_score = 80
        elif bfp < 25:  # Average
            base_score = 60
        else:  # Above Average / Obese
            base_score = 40
    else:  # FEMALE
        # 女性標準 (ACE):
        # 14-20% Essential, 21-24% Athletes, 25-31% Fitness, 32-38% Average, 39%+ Obese
        if bfp < 21:  # Athletes
            base_score = 95
        elif bfp < 25:  # Fitness
            base_score = 80
        elif bfp < 32:  # Average
            base_score = 60
        else:  # Above Average / Obese
            base_score = 40
    
    # 如果有 BMR 數據，調整分數
    if bmr and standard_bmr and standard_bmr > 0:
        bmr_ratio = bmr / standard_bmr
        if bmr_ratio >= 1.05:  # BMR 高於標準 5%
            base_score = min(95, base_score + 10)
        elif bmr_ratio < 0.90:  # BMR 低於標準 10%
            base_score = max(30, base_score - 10)
    
    return max(30, min(95, base_score))


def calculate_alignment_score(sitting_hours: float = 8, 
                              has_regular_exercise: bool = False,
                              has_posture_issues: bool = False,
                              flexibility_score: Optional[int] = None) -> int:
    """
    計算體態校正分 (Alignment & Mobility)
    
    Scientific Basis:
    - 久坐與姿勢問題的相關性研究
    - 運動習慣對姿勢的正面影響
    
    Args:
        sitting_hours: 每日久坐時數
        has_regular_exercise: 是否有固定運動習慣
        has_posture_issues: 是否有姿勢問題 (下背痛、肩頸僵硬等)
        flexibility_score: 柔軟度評分 (0-100)
    
    Returns:
        分數 (25-85)
    """
    # 基礎分數 (根據久坐時數)
    if sitting_hours < 4:
        base_score = 75
    elif sitting_hours < 6:
        base_score = 60
    elif sitting_hours < 8:
        base_score = 45
    else:  # >= 8 hours
        base_score = 30
    
    # 正面因子
    if has_regular_exercise:
        base_score += 10
    
    # 負面因子
    if has_posture_issues:
        base_score -= 20
    
    # 柔軟度加成
    if flexibility_score:
        flex_bonus = int((flexibility_score - 50) / 10)  # -5 to +5
        base_score += flex_bonus
    
    return max(25, min(85, base_score))


def calculate_vitality_score(resting_heart_rate: int, 
                             sleep_quality: SleepQuality = SleepQuality.FAIR,
                             stress_level: Optional[int] = None) -> int:
    """
    計算活力恢復分 (Vitality & Recovery)
    
    Scientific Basis:
    - 靜息心率與心血管健康相關性
    - 睡眠品質影響恢復能力
    - ACSM 心率標準
    
    Args:
        resting_heart_rate: 靜息心率 (bpm)
        sleep_quality: 睡眠品質
        stress_level: 壓力等級 (1-10)
    
    Returns:
        分數 (35-95)
    """
    # 基於靜息心率
    # ACSM 標準: Excellent <60, Good 60-69, Average 70-79, Poor 80+
    if resting_heart_rate < 55:  # Excellent (運動員水平)
        base_score = 95
    elif resting_heart_rate < 65:  # Good
        base_score = 80
    elif resting_heart_rate < 75:  # Average
        base_score = 60
    else:  # Poor
        base_score = 40
    
    # 睡眠品質加成
    sleep_bonus = {
        SleepQuality.EXCELLENT: 10,
        SleepQuality.GOOD: 5,
        SleepQuality.FAIR: 0,
        SleepQuality.POOR: -10
    }
    base_score += sleep_bonus.get(sleep_quality, 0)
    
    # 壓力等級影響
    if stress_level:
        if stress_level <= 3:  # 低壓力
            base_score += 5
        elif stress_level >= 7:  # 高壓力
            base_score -= 10
    
    return max(35, min(95, base_score))


def calculate_endurance_score(bmr: Optional[float] = None, 
                              weight: float = 70,
                              body_fat_percent: float = 20,
                              cardio_history_count: int = 0) -> int:
    """
    計算耐力基底分 (Endurance Foundation)
    
    Scientific Basis:
    - 瘦體重與有氧耐力相關
    - 有氧運動頻率影響耐力
    
    Args:
        bmr: 基礎代謝率 (kcal/day)
        weight: 體重 (kg)
        body_fat_percent: 體脂率 (%)
        cardio_history_count: 最近30天有氧運動次數
    
    Returns:
        分數 (30-80)
    """
    # 計算瘦體重 (Lean Body Mass)
    lean_mass = weight * (1 - body_fat_percent / 100)
    
    # 瘦體重比例越高，耐力潛力越大
    lean_ratio = lean_mass / weight
    
    if lean_ratio >= 0.85:  # 優秀
        base_score = 70
    elif lean_ratio >= 0.75:  # 良好
        base_score = 55
    elif lean_ratio >= 0.65:  # 標準
        base_score = 45
    else:  # 偏低
        base_score = 35
    
    # 有氧運動頻率加成
    if cardio_history_count >= 12:  # 平均每週3次以上
        base_score += 10
    elif cardio_history_count >= 8:  # 平均每週2次
        base_score += 5
    # <8 次不加分
    
    # BMR 影響 (代謝能力與耐力相關)
    if bmr:
        expected_bmr = lean_mass * 22  # 簡化估算: 22 kcal/kg lean mass
        if bmr >= expected_bmr:
            base_score += 5
    
    return max(30, min(80, base_score))


def calculate_power_score(skeletal_muscle_mass: float, 
                         weight: float, 
                         age: int,
                         strength_training_frequency: int = 0) -> int:
    """
    計算爆發效能分 (Power & Explosiveness)
    
    Scientific Basis:
    - 肌肉量與爆發力高度相關
    - 力量訓練頻率影響肌力表現
    
    Args:
        skeletal_muscle_mass: 骨骼肌量 (kg)
        weight: 體重 (kg)
        age: 年齡
        strength_training_frequency: 最近30天力量訓練次數
    
    Returns:
        分數 (30-85)
    """
    # 肌肉質量指數 (相對肌肉量)
    muscle_index = skeletal_muscle_mass / weight if weight > 0 else 0
    
    # 根據肌肉比例評分
    if muscle_index >= 0.45:  # 優秀
        base_score = 75
    elif muscle_index >= 0.40:  # 良好
        base_score = 60
    elif muscle_index >= 0.35:  # 標準
        base_score = 45
    else:  # 偏低
        base_score = 30
    
    # 年齡校正 (爆發力隨年齡下降)
    if age < 25:
        age_bonus = 10
    elif age < 35:
        age_bonus = 5
    elif age < 45:
        age_bonus = 0
    else:  # >= 45
        age_bonus = -5
    
    base_score += age_bonus
    
    # 力量訓練頻率加成
    if strength_training_frequency >= 12:  # 每週3次以上
        base_score += 10
    elif strength_training_frequency >= 8:  # 每週2次
        base_score += 5
    
    return max(30, min(85, base_score))


# ============================================================================
# 雷達圖刻度統一
# ============================================================================
# 各維度評分函式原生的 [下限, 上限] 不一致（例如 endurance 最高只到 80、
# alignment 只到 85），若直接畫在同一張雷達圖上，軸與軸之間不可比較，
# 圖形會系統性偏向上限較高的維度。
# 下表記錄每個維度的原生範圍，再線性縮放到統一的 [30, 95]：
#   - 保留「不顯示過低分」的 UX 意圖（最低仍是 30 而非 0）
#   - 讓六軸滿格一致，雷達形狀真實反映各維度的相對強弱
RAW_SCORE_RANGE = {
    "structural": (30, 90),
    "metabolic":  (30, 95),
    "alignment":  (25, 85),
    "vitality":   (35, 95),
    "endurance":  (30, 80),
    "power":      (30, 85),
}
UNIFIED_MIN, UNIFIED_MAX = 30, 95


def normalize_dimension(name: str, raw: int) -> int:
    """把單一維度的原生分數線性縮放到統一的 [UNIFIED_MIN, UNIFIED_MAX]。"""
    lo, hi = RAW_SCORE_RANGE.get(name, (UNIFIED_MIN, UNIFIED_MAX))
    if hi <= lo:
        return int(round(raw))
    raw = max(lo, min(hi, raw))  # 夾在原生範圍內，避免外溢
    ratio = (raw - lo) / (hi - lo)
    return int(round(UNIFIED_MIN + ratio * (UNIFIED_MAX - UNIFIED_MIN)))


# ============================================================================
# 完整的六維度計算
# ============================================================================

def calculate_six_dimension_scores(
    # InBody 核心數據
    skeletal_muscle_mass: float,      # 骨骼肌量 (kg)
    body_fat_percent: float,          # 體脂率 (%)
    weight: float,                     # 體重 (kg)
    bmr: Optional[float] = None,      # 基礎代謝率 (kcal/day)
    visceral_fat_level: Optional[int] = None,  # 內臟脂肪等級
    
    # 用戶基本資料
    gender: Gender = Gender.MALE,
    age: int = 30,
    height: float = 170,              # 身高 (cm)
    
    # 生活習慣問卷
    sitting_hours: float = 8,
    resting_heart_rate: int = 70,
    sleep_quality: SleepQuality = SleepQuality.FAIR,
    has_regular_exercise: bool = False,
    has_posture_issues: bool = False,
    stress_level: Optional[int] = None,
    
    # 訓練歷史 (用於更準確的評估)
    cardio_history_count: int = 0,    # 最近30天有氧次數
    strength_history_count: int = 0,  # 最近30天力量訓練次數
    
) -> Dict[str, int]:
    """
    計算完整的六維度雷達圖分數
    
    Returns:
        {
            "structural": 75,    # 結構支撐
            "metabolic": 68,     # 代謝引擎
            "alignment": 55,     # 體態校正
            "vitality": 72,      # 活力恢復
            "endurance": 60,     # 耐力基底
            "power": 65          # 爆發效能
        }
    """
    # 計算標準BMR (Mifflin-St Jeor公式)
    if gender == Gender.MALE:
        standard_bmr = 10 * weight + 6.25 * height - 5 * age + 5
    else:
        standard_bmr = 10 * weight + 6.25 * height - 5 * age - 161
    
    raw_scores = {
        "structural": calculate_structural_score(
            skeletal_muscle_mass, gender, age
        ),
        "metabolic": calculate_metabolic_score(
            body_fat_percent, gender, bmr, standard_bmr
        ),
        "alignment": calculate_alignment_score(
            sitting_hours, has_regular_exercise, has_posture_issues
        ),
        "vitality": calculate_vitality_score(
            resting_heart_rate, sleep_quality, stress_level
        ),
        "endurance": calculate_endurance_score(
            bmr, weight, body_fat_percent, cardio_history_count
        ),
        "power": calculate_power_score(
            skeletal_muscle_mass, weight, age, strength_history_count
        )
    }

    # 縮放到統一刻度，讓雷達圖六軸可比較
    return {name: normalize_dimension(name, raw) for name, raw in raw_scores.items()}


# ============================================================================
# 測試範例
# ============================================================================

if __name__ == "__main__":
    test_user = {
        "skeletal_muscle_mass": 32.5,
        "body_fat_percent": 16.5,
        "weight": 70,
        "bmr": 1650,
        "gender": Gender.MALE,
        "age": 28,
        "height": 175,
        "sitting_hours": 7,
        "resting_heart_rate": 68,
        "sleep_quality": SleepQuality.GOOD,
        "has_regular_exercise": True,
        "has_posture_issues": False,
        "cardio_history_count": 8,
        "strength_history_count": 12
    }
    
    scores = calculate_six_dimension_scores(**test_user)
    
    print("六維度雷達圖分數：")
    print(f"結構支撐 (Structural): {scores['structural']}")
    print(f"代謝引擎 (Metabolic): {scores['metabolic']}")
    print(f"體態校正 (Alignment): {scores['alignment']}")
    print(f"活力恢復 (Vitality): {scores['vitality']}")
    print(f"耐力基底 (Endurance): {scores['endurance']}")
    print(f"爆發效能 (Power): {scores['power']}")
