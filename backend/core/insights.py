import random
from datetime import datetime, timedelta

def get_progression_forecast(user_id, history_data=None):
    """
    Project future body composition changes based on history.
    
    Args:
        user_id: User identifier
        history_data: List of past composition records (simulated for MVP if empty)
        
    Returns:
        dict: Forecast data { 'muscle_mass': [], 'body_fat': [], 'dates': [] }
    """
    # For MVP, since we might not have rich history yet, we will generate a 
    # motivational projection based on "consistent training" assumption.
    # In a real app, this would use linear regression on `workout_history` metrics.
    
    # 1. Get current baseline (from profile ideally, passed in or retrieved)
    # Simulator defaults
    current_muscle = 32.0 # kg
    current_fat = 20.0 # %
    
    # Generate 4 data points: Current, +1 month, +2 months, +3 months
    forecast = {
        "labels": ["Now", "1 Month", "2 Months", "3 Months"],
        "muscle_mass": [],
        "body_fat": []
    }
    
    # Model: Beginners gain ~0.5-1kg muscle/month, lose ~1% body fat/month if consistent
    for i in range(4):
        # Add small variations to make it look realistic
        muscle_gain = i * 0.8 
        fat_loss = i * 1.2
        
        forecast["muscle_mass"].append(round(current_muscle + muscle_gain, 1))
        forecast["body_fat"].append(round(max(5, current_fat - fat_loss), 1))
        
    return forecast

def get_health_tips(weaknesses):
    """
    Return relevant health tips based on identified weaknesses.
    """
    tips_db = {
        "shoulders": {
            "title": "Why Strong Shoulders Matter",
            "content": "Weak shoulders can lead to poor posture and neck pain. Strengthening deltoids improves upper body stability."
        },
        "core": {
            "title": "The Power of the Core",
            "content": "Your core is your body's stabilizer. A weak core is the #1 cause of lower back pain during lifting."
        },
        "legs": {
            "title": "Never Skip Leg Day",
            "content": "Leg muscles are the largest in your body. Training them boosts overall metabolism and hormone production."
        },
        "back": {
            "title": "Back Health Essentials",
            "content": "A strong back balances the chest muscles, preventing 'slouched' shoulders and improving breathing capacity."
        }
    }
    
    selected_tips = []
    
    # If specific weaknesses found, prioritize them
    for w in weaknesses:
        area = w.get('area', '').lower()
        if area in tips_db:
            selected_tips.append(tips_db[area])
            
    # Always fill with at least one general tip if empty or few
    general_tips = [
        {"title": "Rest is Key", "content": "Muscles grow during rest, not during the workout. Ensure 7-8 hours of sleep."},
        {"title": "Protein Timing", "content": "Consuming protein within 30 mins post-workout maximizes muscle repair."},
        {"title": "Hydration Station", "content": "Even 2% dehydration can reduce strength performance by 10%. Drink up!"}
    ]
    
    while len(selected_tips) < 3:
        t = random.choice(general_tips)
        if t not in selected_tips:
            selected_tips.append(t)
            

    return selected_tips

def generate_post_run_insights(current_session, history_sessions):
    """
    Generate insights for a completed run based on recent history.
    """
    print("="*50)
    print("🔍 GENERATING POST-RUN INSIGHTS")
    print("="*50)
    print(f"Current session: {current_session}")
    print(f"History sessions count: {len(history_sessions)}")
    
    # 1. Calculate Recent Stats (Last 10 runs)
    recent_history = history_sessions[:10]
    print(f"\n📊 Analyzing last {len(recent_history)} sessions...")
    
    # Debug each session
    for i, s in enumerate(recent_history):
        metrics = s.get('metrics', {})
        dist = metrics.get('distance', metrics.get('distance_km', 0))
        pace = metrics.get('avgPace', metrics.get('avg_pace', 0))
        print(f"  Session {i+1}: distance={dist}, pace={pace}, metrics={metrics}")
    
    total_distance = sum([s.get('metrics', {}).get('distance', s.get('metrics', {}).get('distance_km', 0)) for s in recent_history])
    total_sessions = len(recent_history)
    
    print(f"\n✅ Total distance: {total_distance:.2f} km")
    print(f"✅ Total sessions: {total_sessions}")
    
    # Calculate average pace (seconds per km)
    # Calculate total duration for weighted average pace
    total_duration = sum([s.get('metrics', {}).get('duration', s.get('metrics', {}).get('duration_seconds', 0)) for s in recent_history])

    # Calculate weighted average pace (seconds per km)
    # Correct Formula: Total Time / Total Distance
    avg_pace_seconds = total_duration / total_distance if total_distance > 0 else 0
    

    print(f"✅ Average pace: {avg_pace_seconds} seconds/km")
    
    avg_pace_min = int(avg_pace_seconds // 60)
    avg_pace_sec = int(avg_pace_seconds % 60)
    avg_pace_str = f"{avg_pace_min}'{avg_pace_sec:02d}\""

    # 2. Generate Summary Text
    # e.g., "最近 10 次訓練累積 0.60 公里，平均配速 5'33"。保持訓練節奏。"
    summary_text = f"最近 {total_sessions} 次訓練累積 {total_distance:.2f} 公里，平均配速 {avg_pace_str}。保持訓練節奏。"
    print(f"\n📝 Summary: {summary_text}")

    # 3. Generate Recommendations
    recommendations = []
    
    # Rule 1: Distance / Volume
    if total_distance < 10:
        recommendations.append("Consider increasing training distance by 10% to build endurance base.")
    elif total_distance > 50:
        recommendations.append("Great volume! Consider a recovery week to prevent overtraining.")
    else:
        recommendations.append("Maintain current mileage to solidify aerobic foundation.")

    # Rule 2: Pace / Intensity
    current_pace = current_session.get('metrics', {}).get('avgPace', current_session.get('metrics', {}).get('avg_pace', 0))
    if current_pace > 0 and avg_pace_seconds > 0:
        if current_pace < avg_pace_seconds * 0.95: # 5% faster
            recommendations.append("Your pace is improving! Add interval training to further boost speed.")
        elif current_pace > avg_pace_seconds * 1.05: # 5% slower
            recommendations.append("Pace was slower than average. Focus on recovery and easy runs.")
        else:
            recommendations.append("Consistent pace. Try incorporating hill repeats for strength.")
    else:
        recommendations.append("Add interval training to improve speed and cardiovascular efficiency.")

    # Rule 3: Consistency / General
    days_since_last = 0
    if len(history_sessions) > 1:
        last_date = datetime.fromisoformat(history_sessions[1].get('start_time', datetime.now().isoformat()).replace('Z', '+00:00'))
        days_since_last = (datetime.now() - last_date.replace(tzinfo=None)).days
    
    if days_since_last > 3:
        recommendations.append("Try to maintain higher frequency (3-4 times/week) for better adaptation.")
    else:
        recommendations.append("Great consistency! Ensure you are getting adequate sleep for recovery.")

    # Ensure exactly 3 recommendations
    while len(recommendations) < 3:
        fallback_recs = [
            "Hydrate well before and after your runs.",
            "Include dynamic warm-ups to prevent injury.",
            "Focus on running form: keep shoulders relaxed and core engaged."
        ]
        next_rec = random.choice(fallback_recs)
        if next_rec not in recommendations:
            recommendations.append(next_rec)
            
    return {
        "summary_text": summary_text,
        "stats": {
            "total_distance_km": round(total_distance, 2),
            "total_sessions": total_sessions,
            "avg_pace_str": avg_pace_str,
            "avg_pace_seconds": avg_pace_seconds
        },
        "recommendations": recommendations[:3]  # Return top 3
    }

