"""
Evolution Matrix Core Logic
Handles Weekly Resolution Matrix calculations, target generation, and progress aggregation.
"""
import os
from .json_cache import save_json_atomic
import json
from datetime import datetime, timedelta
from . import workout_history

DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
EVOLUTION_CONFIG_PATH = os.path.join(DATA_DIR, 'evolution_config.json')

# --- Configuration & Defaults ---

# Define Tag Rules
# --- New Tag Logic Configuration ---

# 1. Muscle Matrix (Sets per Week)
# Tier 1: Aggressive Growth (16 Sets) - "Focus" -> Visualization: VOLUME_LOADING (Segmented Bar)
AGGRESSIVE_GROWTH_TAGS = {
    "#CHESTGAINS": {"target": "chest", "vis_type": "volume_loading"},
    "#SHOULDERS": {"target": "shoulders", "vis_type": "volume_loading"},
    "#BIGARMS": {"target": "arms", "vis_type": "volume_loading"},
    "#GLUTES": {"target": "legs", "vis_type": "volume_loading"},
    "#SIXPACKABS": {"target": "core", "vis_type": "volume_loading"}
}

# Tier 2: Strength & Function (6-10 Sets)
# Strength (6-8 Sets) -> Visualization: STRENGTH_PEAKING (Gauge & Shockwave)
STRENGTH_TAGS = {
    "#SQUATPR": {"target": "legs", "sets": 8, "vis_type": "strength_peaking", "exercise": "squat"},
    "#DEADLIFT": {"target": "back", "sets": 6, "vis_type": "strength_peaking", "exercise": "deadlift"},
    "#BENCHPR": {"target": "chest", "sets": 8, "vis_type": "strength_peaking", "exercise": "bench press"},
    "#PULLUPS": {"target": "back", "sets": 8, "vis_type": "strength_peaking", "exercise": "pull up"}
}
# Correction (8-10 Sets) -> Visualization: STRUCTURAL_ALIGNMENT (7 Dots)
CORRECTION_TAGS = {
    "#BACKPAIN": {"target": "core", "sets": 10, "vis_type": "structural_alignment", "focus": "core stability"}, 
    "#POSTURE": {"target": "back", "sets": 10, "vis_type": "structural_alignment", "focus": "posture"},
    "#MOBILITY": {"target": "legs", "sets": 8, "vis_type": "structural_alignment", "focus": "mobility"} 
}

# Cardio Tiers -> 依 hashtag 設定每週有氧目標（距離 / 熱量）。
# 多個 cardio tag 取最高目標（見 build 邏輯的 max()）。
CARDIO_TIERS = {
    "#RUNNER":      {"distance_km": 20, "calories_kcal": 2000},
    "#MARATHON":    {"distance_km": 40, "calories_kcal": 3500},
    "#ENDURANCE":   {"distance_km": 25, "calories_kcal": 2500},
    "#FATLOSS":     {"distance_km": 15, "calories_kcal": 2200},
    "#CARDIOHEALTH":{"distance_km": 10, "calories_kcal": 1500},
}

DEFAULT_MAINTENANCE_SETS = 4 # Tier 3: Maintenance (4-6 sets)

def load_evolution_config():
    if os.path.exists(EVOLUTION_CONFIG_PATH):
        try:
            with open(EVOLUTION_CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_evolution_config(config):
    save_json_atomic(EVOLUTION_CONFIG_PATH, config, indent=2)
def get_user_config(user_id):
    config = load_evolution_config()
    defaults = {
        "tags": ["#CHESTGAINS", "#FatBurn"],
        "custom_targets": {}, # Legacy single target support
        "target_plan": [{}, {}, {}, {}], # 4-week plan. Each dict is custom_targets structure
        "cycle_start_date": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    return config.get(user_id, defaults)

def update_user_tags(user_id, tags):
    config = load_evolution_config()
    user_data = config.get(user_id, {})
    user_data["tags"] = tags
    user_data["updated_at"] = datetime.now().isoformat()
    config[user_id] = user_data
    save_evolution_config(config)
    return config[user_id]

def update_user_targets(user_id, data):
    """
    Update custom target overrides for the 4-week plan.
    data: { 
        "target_plan": [{}, {}, {}, {}], 
        "cycle_start_date": "ISO-STRING" (optional, resets cycle) 
    }
    """
    config = load_evolution_config()
    user_data = config.get(user_id, {})
    
    # Update Plan
    if "target_plan" in data:
        user_data["target_plan"] = data["target_plan"]
        
    # Update Cycle Start if provided (e.g. user starts new plan)
    if "cycle_start_date" in data:
         user_data["cycle_start_date"] = data["cycle_start_date"]
    elif "cycle_start_date" not in user_data:
         user_data["cycle_start_date"] = datetime.now().isoformat()

    user_data["updated_at"] = datetime.now().isoformat()
    config[user_id] = user_data
    save_evolution_config(config)
    return config[user_id]

def get_current_week_index(cycle_start_date_str):
    try:
        start_date = datetime.fromisoformat(cycle_start_date_str)
        days_diff = (datetime.now() - start_date).days
        if days_diff < 0: days_diff = 0
        week_idx = (days_diff // 7) % 4
        return week_idx
    except:
        return 0

def calculate_weekly_targets(tags, user_config):
    """
    Calculate consolidated weekly targets based on selected tags AND custom 4-week plan.
    Priority: Custom Plan > Aggressive Tag > Strength Tag > Maintenance
    """
    targets = {
        "muscles": {}, 
        "cardio": {
            "distance_km": 0,
            "calories_kcal": 0,
            "duration_min": 0
        },
        "week_index": 0,
        "nutrition": "Balanced", # Default
        "visualization": {} # New: Visualization config per muscle
    }
    
    # Initialize all basic muscles
    basic_muscles = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']
    muscle_goals = {m: DEFAULT_MAINTENANCE_SETS for m in basic_muscles} # Start with Maintenance
    visuals = {}

    # 1. Apply Tag Logic
    # Nutrition Hinting
    if any(t in tags for t in ["#CHESTGAINS", "#SHOULDERS", "#BIGARMS", "#GLUTES", "#BUILDMUSCLE"]):
        targets["nutrition"] = "The Carnivore (High Protein)"
    elif any(t in tags for t in ["#FatBurn", "#LOSEWEIGHT"]):
        targets["nutrition"] = "The Alchemist (Calorie Deficit)"

    for tag in tags:
        # Tier 1: Aggressive (Volume Loading)
        if tag in AGGRESSIVE_GROWTH_TAGS:
            rule = AGGRESSIVE_GROWTH_TAGS[tag]
            muscle = rule["target"]
            muscle_goals[muscle] = max(muscle_goals[muscle], 16)
            visuals[muscle] = {"type": "VOLUME_LOADING", "metric": "sets"}
            
        # Tier 2: Strength (Strength Peaking)
        elif tag in STRENGTH_TAGS:
            rule = STRENGTH_TAGS[tag]
            target_m = rule["target"]
            # Ensure volume doesn't drop below strength requirement, but Volume > Strength usually
            muscle_goals[target_m] = max(muscle_goals.get(target_m, 0), rule["sets"])
            # If volume loading is NOT already set for this muscle, use Strength Peaking
            if target_m not in visuals:
                visuals[target_m] = {"type": "STRENGTH_PEAKING", "metric": "weight_kg", "exercise": rule["exercise"]}

        # Tier 2: Correction (Structural Alignment)
        elif tag in CORRECTION_TAGS:
             rule = CORRECTION_TAGS[tag]
             target_m = rule["target"]
             muscle_goals[target_m] = max(muscle_goals.get(target_m, 0), rule["sets"])
             if target_m not in visuals:
                visuals[target_m] = {"type": "STRUCTURAL_ALIGNMENT", "metric": "consistency", "focus": rule["focus"]}
             
        # Cardio Tiers
        elif tag in CARDIO_TIERS:
            rule = CARDIO_TIERS[tag]
            # If multiple cardio tags, take the highest targets
            targets["cardio"]["distance_km"] = max(targets["cardio"]["distance_km"], rule["distance_km"])
            targets["cardio"]["calories_kcal"] = max(targets["cardio"]["calories_kcal"], rule["calories_kcal"])

    targets["muscles"] = muscle_goals
    targets["visualization"] = visuals

    # ... [Keep Cardio default logic] ...
    if targets["cardio"]["distance_km"] == 0:
         targets["cardio"]["distance_km"] = 5
         targets["cardio"]["calories_kcal"] = 1000

    # ... [Keep Custom Override Logic] ...
    # 2. Apply Custom Overrides from 4-Week Plan
    cycle_start = user_config.get("cycle_start_date", datetime.now().isoformat())
    target_plan = user_config.get("target_plan", [{}, {}, {}, {}])
    
    current_week_idx = get_current_week_index(cycle_start)
    targets["week_index"] = current_week_idx
    
    if len(target_plan) > current_week_idx:
        custom_targets = target_plan[current_week_idx]
    else:
        custom_targets = {}

    if custom_targets:
        # Muscle Overrides
        if "muscles" in custom_targets:
            for m, sets in custom_targets["muscles"].items():
                if sets is not None and int(sets) > 0:
                    targets["muscles"][m] = int(sets)
        
        # Cardio Overrides
        if "cardio" in custom_targets:
            c_overrides = custom_targets["cardio"]
            if "distance_km" in c_overrides and c_overrides["distance_km"] is not None:
                targets["cardio"]["distance_km"] = float(c_overrides["distance_km"])
            if "calories_kcal" in c_overrides and c_overrides["calories_kcal"] is not None:
                targets["cardio"]["calories_kcal"] = int(c_overrides["calories_kcal"])

    return targets

# ... [get_weekly_progress remains mostly the same, but we need Strength/Consistency data] ...

def get_previous_strength_max(user_id, before_dt):
    """
    真實「本週之前」的各動作歷史最大重量 {exercise_name_lower: max_weight}。
    用於進化矩陣的 PR 對比——不再用 current*0.95 假造。
    只計 before_dt 之前的 session；查不到該動作則不會有 key（呼叫端視為 None）。
    """
    prev = {}
    try:
        sessions = workout_history.get_user_workout_history(user_id)
    except Exception:
        return prev
    for s in sessions or []:
        try:
            s_date = datetime.fromisoformat(s["timestamp"])
        except Exception:
            continue
        if s_date >= before_dt:
            continue  # 只看「本週之前」的歷史
        for ex in s.get("exercises", []):
            name = (ex.get("name", "") or "").lower()
            if not name:
                continue
            max_w = 0.0
            for set_info in ex.get("sets", []):
                try:
                    w = float(set_info.get("weight", 0))
                except (TypeError, ValueError):
                    w = 0.0
                if w > max_w:
                    max_w = w
            if max_w > 0 and max_w > prev.get(name, 0):
                prev[name] = max_w
    return prev


def get_weekly_progress(user_id):
    """
    Aggregate actual progress for the current week (ISO Monday start).
    Returns basic volume/cardio progress + Strength/Recovery metrics.
    """
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday())
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)

    sessions = workout_history.get_user_workout_history(user_id)
    
    progress = {
        "muscles": {m: 0 for m in ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']},
        "cardio": {
            "distance_km": 0,
            "calories_kcal": 0,
            "duration_min": 0
        },
        "strength_max": {}, # {exercise: max_weight}
        "recovery_days": {} # {focus: set_of_days}
    }
    
    # Track daily consistency
    # Structure: {"core stability": {0, 1, 4}, "posture": {}} (Days of week 0-6)
    
    for s in sessions:
        # Check date
        try:
            s_date = datetime.fromisoformat(s["timestamp"])
            if s_date < start_of_week:
                continue # Skip older sessions
        except:
            continue
            
        # 1. Aggregate Cardio (Same as before)
        stats = s.get("metrics", {})
        if not isinstance(stats, dict): stats = {}
        
        dist = stats.get("distance", 0) 
        if not dist: dist = s.get("distance_km", 0)
        progress["cardio"]["distance_km"] += float(dist)
        
        cals = stats.get("calories", 0)
        if not cals: cals = s.get("calories_burned", 0)
        progress["cardio"]["calories_kcal"] += int(cals)
        
        dur = s.get("duration_mins", 0)
        progress["cardio"]["duration_min"] += int(dur)
        
        # 2. Aggregate Muscle Sets & Strength Analysis
        exercises = s.get("exercises", [])
        for ex in exercises:
            name = ex.get("name", "").lower()
            muscle = ex.get("target", "").lower()
            
            # Map muscle if missing
            if not muscle:
                if any(x in name for x in ["bench", "chest", "push up", "fly"]): muscle = "chest"
                elif any(x in name for x in ["row", "pull", "lat", "back"]): muscle = "back"
                elif any(x in name for x in ["squat", "leg", "lunge", "deadlift"]): muscle = "legs"
                elif any(x in name for x in ["press", "shoulder", "raise"]): muscle = "shoulders"
                elif any(x in name for x in ["curl", "tricep", "arm"]): muscle = "arms"
                elif any(x in name for x in ["plank", "crunch", "sit up"]): muscle = "core"
            
            set_count = len(ex.get("sets", []))
            
            # Volume
            if muscle in progress["muscles"]:
                progress["muscles"][muscle] += set_count
                
            # Strength (Max Weight)
            # Find max weight in this exercise
            max_w = 0
            for set_info in ex.get("sets", []):
                w = float(set_info.get("weight", 0))
                if w > max_w: max_w = w
            
            # Update specific exercise max
            # We use loose matching for exercise names in visualization
            if max_w > 0:
                current_max = progress["strength_max"].get(name, 0)
                if max_w > current_max: progress["strength_max"][name] = max_w
                
        # 3. Recovery Consistency
        # Assume if session had "core" or "mobility" focus it counts?
        # Or check specific exercise names?
        # Simple for now: If "core" sets > 0 -> Core Stability day
        if progress["muscles"].get("core", 0) > 0:
             if "core stability" not in progress["recovery_days"]: progress["recovery_days"]["core stability"] = set()
             progress["recovery_days"]["core stability"].add(s_date.weekday()) # 0-6

    return progress

def generate_evolution_report(user_id):
    """
    Generate full dashboard data: Targets vs Progress + Feedback + Visualization Hints.
    """
    user_conf = get_user_config(user_id)
    tags = user_conf.get("tags", [])
    
    targets = calculate_weekly_targets(tags, user_conf)
    progress = get_weekly_progress(user_id)

    # 真實「本週之前」歷史最大重量（給 PR 對比用，取代 current*0.95 假造）
    _today = datetime.now()
    _week_start = (_today - timedelta(days=_today.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_strength_max = get_previous_strength_max(user_id, _week_start)
    
    # --- 1. Physique Card Logic ---
    total_muscle_target = 0
    total_muscle_actual = 0
    highlight_areas = []
    display_muscle_progress = {}
    display_muscle_targets = {}
    lagging_muscles = [] # For Coach feedback
    
    # Visual Enhancements
    muscle_visuals = {}

    for m, target in targets["muscles"].items():
        if target > 0: 
             display_muscle_targets[m] = target
             total_muscle_target += target
             actual = progress["muscles"].get(m, 0)
             total_muscle_actual += actual
             
             pct = int((actual / target) * 100) if target > 0 else 0
             if pct > 100: pct = 100 
             display_muscle_progress[m] = pct

             if pct >= 50: highlight_areas.append(m)
             if pct < 50: lagging_muscles.append(m)
             
             # Calculate Visual Logic
             vis_config = targets["visualization"].get(m, {"type": "MAINTENANCE"})
             vis_data = {"type": vis_config["type"], "percent": pct}
             
             if vis_config["type"] == "STRENGTH_PEAKING":
                 ex_name_match = vis_config.get("exercise", "")
                 # Find matching max in progress
                 current_max = 0
                 for ex_key, val in progress["strength_max"].items():
                     if ex_name_match in ex_key: # e.g. "bench" in "Barbell Bench Press"
                         current_max = max(current_max, val)
                 vis_data["current_max"] = current_max
                 # 真實歷史最大重量（本週之前）：用同樣的鬆散比對找出對應動作的歷史最佳。
                 prev_max = 0
                 for pk, pv in prev_strength_max.items():
                     if ex_name_match and ex_name_match in pk:
                         prev_max = max(prev_max, pv)
                 if prev_max > 0:
                     vis_data["last_week_max"] = prev_max
                     vis_data["is_pr"] = current_max > prev_max
                 else:
                     # 沒有歷史可比 → 不假造；前端據此顯示「尚無對比資料」
                     vis_data["last_week_max"] = None
                     vis_data["is_pr"] = False
                 
             elif vis_config["type"] == "STRUCTURAL_ALIGNMENT":
                 focus_area = vis_config.get("focus", "")
                 days_completed = list(progress["recovery_days"].get(focus_area, []))
                 vis_data["days_completed"] = days_completed # [0, 2, 4] etc
                 vis_data["count"] = len(days_completed)
                 
             muscle_visuals[m] = vis_data

    if total_muscle_target == 0:
        physique_pct = 0
    else:
        physique_pct = min(100, int((total_muscle_actual / total_muscle_target) * 100))
        
    physique_status = "INITIATED"
    if physique_pct >= 100: physique_status = "EVOLVED"
    elif physique_pct >= 50: physique_status = "EVOLVING"
        
    physique_card = {
        "status": physique_status,
        "progress_percentage": physique_pct,
        "highlight_areas": highlight_areas,
        "muscle_progress": display_muscle_progress, 
        "muscle_targets": display_muscle_targets,
        "muscle_visuals": muscle_visuals, # NEW: Detailed visual config
        "color_theme": "loewe_gold",
        "message": "Focus on Chest & Shoulders" if "chest" in highlight_areas else "Building foundation" 
    }

    # --- 2. Metabolic Card Logic ---
    target_distance = targets["cardio"]["distance_km"]
    target_calories = targets["cardio"]["calories_kcal"]
    
    if target_distance <= 0: target_distance = 10.0
    if target_calories <= 0: target_calories = 3500
        
    dist_act = progress["cardio"]["distance_km"]
    cals_act = progress["cardio"]["calories_kcal"]
    
    metabolic_card = {
        "weekly_load_percentage": 0, 
        "metrics": {
            "distance_km": round(dist_act, 1),
            "active_calories": cals_act
        },
        "targets": {
            "distance_km": target_distance,
            "calories_kcal": target_calories
        },
        "color_theme": "vitality_orange"
    }

    # --- 3. Coach Card Logic (Enhanced) ---
    alert_level = "none"
    feedback_text = "✅ 狀態極佳：目前進度完美。繼續保持。"
    
    weekday = datetime.now().weekday()
    dist_pct = (dist_act / target_distance) * 100
    cal_pct = (cals_act / target_calories) * 100
    
    # Movement Suggestions Map
    movement_map = {
        "chest": "推類動作 (Push)", "back": "拉類動作 (Pull)", "legs": "蹲類動作 (Squat)",
        "shoulders": "肩推 (Overhead Press)", "arms": "二三頭肌 (Arms)", "core": "核心 (Core)"
    }

    # Priority 1: Friday Volume Alert (Lagging Muscles)
    if weekday >= 4 and lagging_muscles:
        # Check if any Aggressive Tag target is lagging
        # Find which lag muscle is associated with a priority tag?
        target_lag = lagging_muscles[0] # Simply pick first for now
        
        # Refined check: is this a 'Focus' muscle?
        focus_muscle = None
        for tag, m in AGGRESSIVE_GROWTH_TAGS.items():
            if tag in tags and m in lagging_muscles:
                focus_muscle = m
                break
        
        if focus_muscle: target_lag = focus_muscle
            
        action = movement_map.get(target_lag, "訓練")
        alert_level = "warning"
        feedback_text = f"⚠️ 偵測到 {target_lag} 容量不足，建議明日補齊 6 組 {action} 以達成目標。"

    # Priority 2: Nutrition Conflict (Lose Weight but Low Steps?) -> Not tracking intake yet
    # But can suggest Alchemist
    elif "#LOSEWEIGHT" in tags and cal_pct < 50 and weekday >= 3:
         alert_level = "warning"
         feedback_text = "⚠️ 燃脂效率低：建議採用『The Alchemist』飲食法，並增加有氧強度。"

    # Priority 3: Over-training
    elif dist_pct > 120 and cal_pct > 120:
        alert_level = "critical"
        feedback_text = "🛑 疲勞警報：代謝負荷過高。建議改為「主動恢復」模式。"
        
    # Priority 4: Evolution Achieved
    elif physique_pct >= 95 and dist_pct >= 95:
        feedback_text = "🏆 雙環合一：本週進化目標完全達成！享受你的休息日。"
    
    # Priority 5: Add Nutrition Advice to Feedback (if space allows or separate field)
    # We append it?
    nutrition_plan = targets.get("nutrition", "Balanced")
    if nutrition_plan != "Balanced":
        # Maybe not append to feedback text to avoid clutter, 
        # but the request implies "Nutrition System Integration".
        # Let's add a separate field `nutrition` to dashboard_data
        pass

    coach_card = {
        "alert_level": alert_level,
        "feedback_text": feedback_text,
        "nutrition_plan": nutrition_plan # New Field
    }

    return {
        "dashboard_data": {
            "current_tags": tags,
            "current_week": targets["week_index"] + 1, # 1-based for frontend
            "target_plan": user_conf.get("target_plan"), # Return full plan for editing
            "cycle_start_date": user_conf.get("cycle_start_date"),
            "physique_card": physique_card,
            "metabolic_card": metabolic_card,
            "coach_card": coach_card,
            "nutrition_plan": nutrition_plan # Also at top level
        }
    }
