import os
import json
from datetime import datetime, timedelta
from .workout_history import get_user_workout_history
from .hashtag_plan_generator import EXERCISE_DATABASE

# Cache for exercise mapping
_EXERCISE_MUSCLE_MAP = None

def _get_exercise_muscle_map():
    """Build a flatten map of Exercise Name -> Primary Muscle Scope (e.g., 'chest', 'back')"""
    global _EXERCISE_MUSCLE_MAP
    if _EXERCISE_MUSCLE_MAP is not None:
        return _EXERCISE_MUSCLE_MAP
    
    mapping = {}
    
    # Iterate through the structured database
    # Structure: EXERCISE_DATABASE[main_group][level] = [list of exercises]
    for main_group, levels in EXERCISE_DATABASE.items():
        for level, exercises in levels.items():
            for ex in exercises:
                # Map exercise name to the main group key (which matches our target muscles)
                # Ensure name is stripped of whitespace
                name = ex['name'].strip()
                mapping[name] = main_group
                
                # Also Add english mapping if needed or aliases?
                # For now, we rely on the exact name match or partial match
    
    # Manually add common variations or missing ones if needed
    mapping["Squat"] = "legs"
    mapping["Bench Press"] = "chest"
    mapping["Deadlift"] = "back" # or legs depending on style, but back is safe for recovery
    
    _EXERCISE_MUSCLE_MAP = mapping
    return mapping

def calculate_muscle_fatigue(user_id):
    """只要分數（相容既有呼叫端）。"""
    scores, _trained = calculate_recovery_detail(user_id)
    return scores


def calculate_recovery_detail(user_id):
    """
    Calculate fatigue level (0-100) for each muscle group based on recent workout history.
    100 = Fully Recovered (Ready)
    0 = Max Fatigue (Rest needed)
    Wait, the UI usually expects a score where 100 is GOOD.
    Let's stick to: 100 = Fresh, 0 = Destroyed.
    """
    current_time = datetime.now()
    # Look back 4 days (96 hours) to be safe
    cutoff_time = current_time - timedelta(hours=96)
    
    # Get recent sessions
    history = get_user_workout_history(user_id)
    
    # 🔥 Add Cardio Sessions to Recovery Logic
    from . import cardio_storage
    cardio_history = cardio_storage.get_user_sessions(user_id, limit=20)
    
    # Combine or process separately
    # For simplicity, we process them in the same loop logic below
    # We need to normalize cardio sessions to look like workout sessions for the loop
    combined_history = history + [
        {
            "timestamp": s.get("created_at") or s.get("date"),
            "is_cardio": True,
            "metrics": s.get("metrics", {}),
            "exercises": [] # Cardio doesn't have exercises list in the same way
        }
        for s in cardio_history if (s.get("created_at") or s.get("date"))
    ]
    
    # Sort combined history by timestamp descending
    combined_history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    recent_sessions = [s for s in combined_history if datetime.fromisoformat(s['timestamp'].replace('Z', '+00:00')).replace(tzinfo=None) > cutoff_time]
    
    # Initialize recovery scores (100 = Fully Recovered)
    recovery_scores = {
        "chest": 100, "shoulders": 100, "triceps": 100, 
        "back": 100, "biceps": 100, 
        "legs": 100, "glutes": 100, "calves": 100,
        "core": 100
    }
    
    # ⚠️ 一筆訓練都沒有 ≠ 完全恢復。分數照樣回 100 是為了讓下游數學不炸，
    #    但 trained 是空的 —— 呼叫端要據此決定「準備度」到底要不要顯示。
    #    把「我們沒看過你訓練」顯示成「準備度 100」是編出來的。
    trained = set()

    if not recent_sessions:
        return recovery_scores, trained

    exercise_map = _get_exercise_muscle_map()

    # Analyze sessions
    for session in recent_sessions:
        try:
            # Handle ISO string with potential 'Z' or offset
            ts_str = session['timestamp'].replace('Z', '+00:00')
            session_time = datetime.fromisoformat(ts_str).replace(tzinfo=None)
            hours_since = (current_time - session_time).total_seconds() / 3600
            
            # Impact factor decays over time (Linear recovery over 48-72 hours)
            # 0-24h: High Impact
            # 24-48h: Medium Impact
            # 48-72h: Low Impact
            if hours_since > 72:
                continue
                
            # Determine muscles worked
            muscles_worked = set()

            # Method 0: Cardio impact
            cardio_weight = 1.0
            if session.get('is_cardio'):
                # Running mostly impacts legs, glutes, and calves
                muscles_worked.update(['legs', 'glutes', 'calves', 'core'])
                # ⚠️ 以前不管跑幾公里都套同一條曲線 —— 2 公里的恢復慢跑
                #    跟 25 公里的長跑對腿的影響被當成一樣重，
                #    輕鬆跑完身體圖整片變紅。依實際距離縮放（10 公里 ≈ 1.0）。
                try:
                    m = session.get('metrics') or {}
                    km = float(m.get('distance_km') or m.get('distance') or 0)
                    if km > 0:
                        cardio_weight = max(0.45, min(1.5, km / 10.0))
                    else:
                        secs = float(m.get('duration_seconds') or m.get('duration') or 0)
                        if secs > 0:
                            cardio_weight = max(0.45, min(1.5, (secs / 60.0) / 60.0))
                except (TypeError, ValueError):
                    cardio_weight = 1.0
            
            # Method 1: Check detailed exercise list
            elif 'exercises' in session and session['exercises']:
                for ex in session['exercises']:
                    # ex can be a dict (new format) or string (legacy)
                    name = ""
                    if isinstance(ex, dict):
                        name = ex.get('name', '')
                    elif isinstance(ex, str):
                        name = ex
                    
                    # Try to map to muscle
                    # Partial match approach
                    matched = False
                    for db_name, muscle in exercise_map.items():
                        if db_name in name:
                            muscles_worked.add(muscle)
                            matched = True
                            # Also add synergists based on primary
                            if muscle == 'chest':
                                muscles_worked.add('triceps')
                                muscles_worked.add('shoulders')
                            elif muscle == 'back':
                                muscles_worked.add('biceps')
                            elif muscle == 'legs':
                                muscles_worked.add('glutes')
                                muscles_worked.add('calves')
                            break
                    
                    if not matched:
                        # Fallback: Guess based on name keywords
                        if '推' in name or 'Press' in name:
                            muscles_worked.add('chest')
                            muscles_worked.add('shoulders')
                            muscles_worked.add('triceps') 
                        elif '拉' in name or 'Pull' in name or 'Row' in name:
                            muscles_worked.add('back')
                            muscles_worked.add('biceps')
                        elif '蹲' in name or 'Squat' in name or 'Leg' in name:
                            muscles_worked.add('legs')
            
            # Method 2: Check focus_group or title
            if not muscles_worked:
                focus = session.get('focus_group') or session.get('focus') or session.get('title', '')
                if '胸' in focus or 'Chest' in focus:
                    muscles_worked.update(['chest', 'shoulders', 'triceps'])
                elif '背' in focus or 'Back' in focus:
                    muscles_worked.update(['back', 'biceps'])
                elif '腿' in focus or 'Leg' in focus:
                    muscles_worked.update(['legs', 'glutes', 'calves'])
                elif '肩' in focus or 'Shoulder' in focus:
                    muscles_worked.update(['shoulders', 'triceps'])
            
            # Apply fatigue
            for muscle in muscles_worked:
                if muscle not in recovery_scores:
                    continue
                    
                # Calculate fatigue impact
                # If < 12h: Score drops to 20
                # If 24h: Score recovers to ~50
                # If 48h: Score recovers to ~80
                # If 72h: Score recovers to 100
                
                # Current recovery based on this session alone
                # Curve: score = 20 + (80 * (hours / 72))
                #   cardio_weight 把「這趟有多重」納進來：輕鬆跑的谷底沒那麼低、
                #   恢復得也比較快（重訓維持 1.0，行為不變）。
                floor = 100 - (80 * cardio_weight)
                span = 100 - floor
                session_recovery = floor + (span * min(1.0, hours_since / 72))
                
                # Apply to current score (taking the minimum i.e., "most fatigued" state)
                # We use min() because recent heavy sessions dominate recovery state
                recovery_scores[muscle] = min(recovery_scores[muscle], int(session_recovery))
                trained.add(muscle)
                
        except Exception as e:
            print(f"Error analyzing session for recovery: {e}")
            continue

    return recovery_scores, trained

def get_recovery_status(recovery_score):
    """
    Get text status for a score (0-100)
    100 = Ready
    0 = Fatigued
    """
    if recovery_score < 40:
        return {"status": "Fatigued", "color": "red", "recommendation": "Rest / Active Recovery"}
    elif recovery_score < 80:
        return {"status": "Recovering", "color": "yellow", "recommendation": "Light / Moderate Intensity"}
    else:
        return {"status": "Prime", "color": "green", "recommendation": "Go Heavy"}

def get_muscle_recovery_details(user_id):
    """
    Get detailed breakdown for frontend
    """
    scores = calculate_muscle_fatigue(user_id)
    details = {}
    for muscle, score in scores.items():
        status = get_recovery_status(score)
        details[muscle] = {
            "score": score,
            "status": status["status"],
            "color": status["color"],
            "recommendation": status["recommendation"]
        }
    return details
