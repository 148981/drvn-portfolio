"""
api_ai_insights.py — AI 訓練洞察 / 目標預測 路由
（Phase 1 從 main.py 抽出；行為不變，僅改為獨立 APIRouter）

對應前綴：/api/ai/*
依賴：core.training_partner, core.goal_predictor, core.recovery, core.cardio_storage
"""
from fastapi import APIRouter

import core.cardio_storage as cardio_storage  # 部分 handler 直接引用（原 main.py 全域）

router = APIRouter(tags=["ai"])


@router.post("/api/ai/training-insights")
async def get_training_insights(user_id: str):
    """Get AI-generated training insights"""
    try:
        from core import training_partner
        insights = training_partner.generate_insights(user_id)
        return {"insights": insights}
    except Exception as e:
        print(f"Error generating insights: {e}")
        return {"insights": []}

@router.post("/api/ai/training-insights-cardio")
async def get_cardio_insights(req: dict):
    """Get AI insights specific to cardio training with personality mode"""
    try:
        from core.training_partner import TrainingPartner
        
        user_id = req.get('user_id')
        mode = req.get('mode', 'coach')  # 'coach' or 'buddy'
        partner = TrainingPartner(mode=mode)
        
        # Get recent cardio sessions
        # Get recent cardio sessions - limit to 10 most recent
        recent_workouts = cardio_storage.get_user_sessions(user_id, limit=10)
        
        # Convert to format expected by TrainingPartner
        formatted_workouts = []
        for session in recent_workouts:
            metrics = session.get('metrics', {})
            formatted_workouts.append({
                'distance_km': metrics.get('distance_km', metrics.get('distance', 0)),
                'duration_seconds': metrics.get('duration_seconds', metrics.get('duration', 0)),
                'pace_per_km': metrics.get('pace_per_km', metrics.get('avgPace', 0)),
                'created_at': session.get('created_at', session.get('timestamp', ''))
            })
        
        user_data = {"user_id": user_id}
        insight = partner.generate_workout_insight(user_data, formatted_workouts)
        
        return {"insight": insight, "mode": mode}
    except Exception as e:
        print(f"Error generating cardio insights: {e}")
        import traceback
        traceback.print_exc()
        return {"insight": None, "error": str(e)}

@router.get("/api/ai/daily-insight/{user_id}")
async def get_daily_insight(user_id: str):
    """首頁『每日一句 Insight』：彙整重訓 + 跑步洞察，回傳當天那一句。"""
    try:
        from core import training_partner
        insight = training_partner.generate_daily_insight(user_id)
        return {"insight": insight}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"insight": None, "error": str(e)}


@router.post("/api/ai/workout-summary")
async def get_workout_summary(req: dict):
    """重訓結算頁的 AI 自然語言總評（比對歷史 → 容量±% / PR / 近30天最佳 / 完成度）。"""
    try:
        from core import training_partner
        user_id = req.get('user_id')
        workout = req.get('workout', {}) or {}
        summary = training_partner.generate_workout_summary(user_id, workout)
        return {"summary": summary}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"summary": None, "error": str(e)}


@router.post("/api/ai/next-workout-suggestion")
async def suggest_next_workout(req: dict):
    """Suggest next workout based on recovery status"""
    try:
        from core.training_partner import TrainingPartner
        from core import recovery
        
        user_id = req.get('user_id')
        mode = req.get('mode', 'coach')
        partner = TrainingPartner(mode=mode)
        
        # Get recovery status
        recovery_status = recovery.get_muscle_recovery_details(user_id)
        
        user_profile = {"user_id": user_id}
        suggestion = partner.suggest_next_workout(user_profile, {'scores': recovery_status})
        
        return {"suggestion": suggestion, "mode": mode}
    except Exception as e:
        print(f"Error suggesting workout: {e}")
        return {"suggestion": None, "error": str(e)}

@router.post("/api/ai/performance-trend")
async def analyze_performance_trend(req: dict):
    """Analyze performance trends over time"""
    try:
        from core.training_partner import TrainingPartner
        from core import cardio_storage
        
        user_id = req.get('user_id')
        mode = req.get('mode', 'coach')
        partner = TrainingPartner(mode=mode)
        
        # Get workout history
        all_sessions = cardio_storage.get_user_sessions(user_id, limit=30)
        
        formatted_workouts = []
        for session in all_sessions:
            formatted_workouts.append({
                'distance_km': session.get('distance_km', 0),
                'duration_seconds': session.get('duration_seconds', 0),
                'pace_per_km': session.get('pace_per_km', 0),
                'created_at': session.get('timestamp', '')
            })
        
        trend = partner.analyze_performance_trend(formatted_workouts)
        
        return {"trend": trend, "mode": mode}
    except Exception as e:
        print(f"Error analyzing trend: {e}")
        return {"trend": None, "error": str(e)}

@router.post("/api/ai/motivational-message")
async def get_motivational_message(req: dict):
    """Get personalized motivational message"""
    try:
        from core.training_partner import TrainingPartner
        
        user_id = req.get('user_id')
        mode = req.get('mode', 'buddy')  # Default to buddy for motivation
        context = req.get('context', 'general')
        
        partner = TrainingPartner(mode=mode)
        
        # Get user goals (mock for now)
        user_goals = req.get('goals', [])
        progress = req.get('progress', {})
        
        message = partner.generate_motivational_message(user_goals, progress)
        
        return {"message": message, "mode": mode, "context": context}
    except Exception as e:
        print(f"Error generating motivation: {e}")
        return {"message": "加油！💪", "error": str(e)}

# ============ Goal Prediction Endpoints ============

@router.post("/api/ai/predict-goal")
async def predict_goal_achievement(req: dict):
    """Predict goal achievement timeline"""
    try:
        from core.goal_predictor import GoalPredictor
        from core import cardio_storage
        
        user_id = req.get('user_id')
        goal = req.get('goal', {})
        training_frequency = req.get('training_frequency', 3)
        
        predictor = GoalPredictor()
        
        # Get current metrics from recent sessions
        recent_sessions = cardio_storage.get_user_sessions(user_id, limit=5)
        
        if recent_sessions:
            avg_pace = sum(s.get('pace_per_km', 0) for s in recent_sessions) / len(recent_sessions)
            max_distance = max(s.get('distance_km', 0) for s in recent_sessions)
            
            current_metrics = {
                'avg_pace_per_km': avg_pace,
                'max_distance_km': max_distance
            }
        else:
            current_metrics = {
                'avg_pace_per_km': 360,  # 6:00/km default
                'max_distance_km': 5
            }
        
        prediction = predictor.predict_goal_timeline(
            current_metrics,
            goal,
            training_frequency
        )
        
        return {"prediction": prediction}
    except Exception as e:
        print(f"Error predicting goal: {e}")
        import traceback
        traceback.print_exc()
        return {"prediction": None, "error": str(e)}

@router.get("/api/ai/milestone-plan")
async def get_milestone_plan(
    start_date: str,
    goal_date: str,
    goal_type: str,
    current_value: float,
    target_value: float
):
    """Get milestone plan for a goal"""
    try:
        from core.goal_predictor import GoalPredictor
        
        predictor = GoalPredictor()
        milestones = predictor.generate_milestone_plan(
            start_date,
            goal_date,
            goal_type,
            current_value,
            target_value
        )
        
        return {"milestones": milestones}
    except Exception as e:
        print(f"Error generating milestones: {e}")
        return {"milestones": [], "error": str(e)}
