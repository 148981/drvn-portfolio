"""
api_workout.py — 訓練紀錄 / 進度 / 分析 (Workout History / Metrics / Analysis) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/workout/*（legacy/with-inbody/progress/history CRUD/metrics/custom_plan）、/api/analysis/*
依賴：core.workout_history（及 in-function：pattern_detector、training_partner、goal_predictor）

⚠️ 與既有 router 無路徑衝突（已核對）：
   api_plan_endpoints: /api/workout/save、history/{user_id}(GET)、last-weight、calculate-set
   api_workout_modify: /api/workout/today、modify、confirm-modification
   api_history:        /api/history/*
   本檔處理的是 legacy 全域 dict 版本與 PUT/DELETE/POST 維護、metrics、analysis、custom_plan，路徑/方法皆不重疊。
"""
import os
import uuid
from auth_guard import owner_guard
import json
import logging
from datetime import datetime

from pydantic import BaseModel
from typing import List
from fastapi import APIRouter, Request, Form, HTTPException, Depends
from fastapi.responses import JSONResponse

import core.workout_history as workout_history

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

logger = logging.getLogger(__name__)

router = APIRouter(tags=["workout"])


@router.get("/api/workout/history-legacy/{user_id}", dependencies=[Depends(owner_guard)])
async def get_workout_history_legacy(user_id: str, limit: int = 1000):
    """[Legacy/Internal] Get workout history from the global workout_history.json dict.
    The primary /api/workout/history/{user_id} endpoint is handled by api_plan_endpoints.py
    which reads per-user files (user_{userId}_history.json) — that is the correct one to use."""
    history = workout_history.get_user_workout_history(user_id, limit=limit)
    return {"user_id": user_id, "history": history}

@router.get("/api/workout/with-inbody/{user_id}/{session_id}", dependencies=[Depends(owner_guard)])
async def get_workout_with_inbody(user_id: str, session_id: str):
    """Get workout session with correlated InBody data"""
    try:
        # Get workout session
        history = workout_history.get_user_workout_history(user_id)
        workout = None
        for session in history:
            if session.get('session_id') == session_id:
                workout = session
                break
        
        if not workout:
            return JSONResponse(status_code=404, content={"error": "Workout session not found"})
        
        # Get workout date
        workout_date = workout.get('timestamp', '')[:10]
        
        # Find matching InBody record (within ±3 days)
        inbody_records = workout_history.get_inbody_history(user_id)
        matched_inbody = None
        min_day_diff = 999
        
        for record in inbody_records:
            record_date = record.get('measurement_date', '')
            if record_date:
                try:
                    from datetime import datetime, timedelta
                    workout_dt = datetime.fromisoformat(workout_date)
                    record_dt = datetime.fromisoformat(record_date)
                    day_diff = abs((workout_dt - record_dt).days)
                    
                    if day_diff <= 3 and day_diff < min_day_diff:
                        min_day_diff = day_diff
                        matched_inbody = record
                except:
                    pass
        
        return {
            "workout": workout,
            "inbody": matched_inbody,
            "has_inbody_data": matched_inbody is not None,
            "day_difference": min_day_diff if matched_inbody else None
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/workout/progress/{user_id}", dependencies=[Depends(owner_guard)])
async def get_progress(user_id: str):
    """Get progress statistics for a user"""
    stats = workout_history.get_progress_stats(user_id)
    return {"user_id": user_id, "progress": stats}

@router.put("/api/workout/history/{user_id}/{workout_id}", dependencies=[Depends(owner_guard)])
async def update_workout(user_id: str, workout_id: str, workout_data: dict):
    print(f"--- 收到更新請求 ---")
    print(f"User ID: {user_id}, Workout ID: {workout_id}")

    try:
        # Phase 2：統一走 DB（per-user 的 workout_sessions 表）
        from repositories import workout_session_repo
        allowed = ['exercises', 'volume', 'muscles', 'notes', 'date', 'focusGroup', 'completedSets', 'duration', 'intensity']
        updates = {k: workout_data[k] for k in allowed if k in workout_data}
        ok, _ = workout_session_repo.update_session(user_id, workout_id, updates)
        if ok:
            return {"status": "success", "message": "Updated successfully"}

        # 找不到 → 視為新紀錄寫入（local_xxx ID 由前端本機產生）
        workout_session_repo.add_session(user_id, {**workout_data, "session_id": workout_id, "user_id": user_id})
        return {"status": "success", "message": "Created as new record"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

def _delete_workout_record(user_id: str, workout_id: str) -> bool:
    """刪除某使用者的單筆動作偵測 / 訓練紀錄。
    Phase 2：統一走 DB（per-user 的 workout_sessions 表）。回傳是否真的有刪到。"""
    from repositories import workout_session_repo
    ok, _ = workout_session_repo.delete_session(user_id, workout_id)
    return ok


@router.delete("/api/workout/history/{user_id}/{workout_id}", dependencies=[Depends(owner_guard)])
async def delete_workout(user_id: str, workout_id: str):
    """Delete a specific workout record (DELETE 版本)。"""
    try:
        if not _delete_workout_record(user_id, workout_id):
            return JSONResponse(status_code=404, content={"error": "Workout not found"})
        return {"success": True, "message": "Workout deleted successfully"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/workout/history/delete")
async def delete_workout_post(request: Request):
    """POST 版本的單筆紀錄刪除（和 DELETE /api/workout/history/{user_id}/{workout_id} 邏輯相同）。
    用 POST 是為了繞過 iOS WebView / Safari 對 DELETE method CORS preflight 的限制
    （與 /api/user/delete 同樣的處理方式）。
    Body: { "user_id": "line_Uxxxxxxxx", "workout_id": "motion_xxxxxxxx" }"""
    try:
        body = await request.json()
        user_id = str(body.get("user_id", "") or "")
        # 同時相容 workout_id / session_id 兩種命名
        workout_id = str(body.get("workout_id", "") or body.get("session_id", "") or "")
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})

    if not user_id or not workout_id:
        return JSONResponse(status_code=400,
                            content={"error": "user_id and workout_id are required"})

    # 安全驗證：JWT uid 存在時必須與 body user_id 相符
    jwt_uid = getattr(request.state, "user_id", None)
    if jwt_uid and jwt_uid != user_id:
        return JSONResponse(status_code=403,
                            content={"error": "Forbidden: can only delete your own records"})

    try:
        if not _delete_workout_record(user_id, workout_id):
            return JSONResponse(status_code=404, content={"error": "Workout not found"})
        return {"success": True, "message": "Workout deleted successfully"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/analysis/patterns/{user_id}", dependencies=[Depends(owner_guard)])
async def get_patterns(user_id: str, days: int = 30):
    """Get AI-detected patterns in workout and body data"""
    try:
        from core import pattern_detector
        patterns = pattern_detector.detect_patterns(user_id, days)
        return {
            "user_id": user_id,
            "patterns": patterns,
            "total_count": len(patterns),
            "analysis_period_days": days,
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/analysis/insights/{user_id}", dependencies=[Depends(owner_guard)])
async def get_insights(user_id: str):
    """Get AI-generated training insights"""
    try:
        from core import training_partner
        insights = training_partner.generate_insights(user_id)
        return {
            "user_id": user_id,
            "insights": insights,
            "total_count": len(insights),
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.post("/api/analysis/predict-goal")
async def predict_goal(
    user_id: str = Form(...),
    goal_type: str = Form(...),
    target_value: float = Form(...),
    exercise_name: str = Form(None)
):
    """Predict goal achievement timeline"""
    try:
        from core import goal_predictor
        if goal_type == 'pr_weight' and exercise_name:
            prediction = goal_predictor.predict_pr_goal(user_id, target_value, exercise_name)
        else:
            prediction = goal_predictor.predict_goal_achievement(user_id, goal_type, target_value)
        return prediction
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/workout/metrics/{user_id}", dependencies=[Depends(owner_guard)])
async def get_all_metrics(user_id: str):
    """Get all metrics progress with trend analysis"""
    metrics = workout_history.get_all_metrics_progress(user_id)
    summary = workout_history.get_metrics_summary(user_id)
    return {"user_id": user_id, "metrics": metrics, "summary": summary}

@router.get("/api/workout/metrics/{user_id}/{metric_name}", dependencies=[Depends(owner_guard)])
async def get_metric(user_id: str, metric_name: str):
    """Get specific metric progress"""
    scores = workout_history.get_metric_progress(user_id, metric_name)
    return {"user_id": user_id, "metric_name": metric_name, "scores": scores}

# ============ Smart Dashboard Routes ============
# [EXTRACTED] /api/dashboard/recovery/{user_id}, /api/dashboard/insights/{user_id}
#   → Moved to api_dashboard.py (api_dashboard.router)

# [EXTRACTED Phase1] /api/trainer/* + /api/exercises/all|filter → api_trainer.py
# [EXTRACTED Phase1] /api/history/logs|log/{session_id} (+UpdateLogRequest) → api_history.py
class CustomPlanRequest(BaseModel):
    user_id: str
    title: str
    duration_mins: int
    intensity: str
    exercises: List[dict]
    calories_est: int
    type: str = "custom"
    created_at: str = None

@router.post("/api/workout/custom_plan")
async def save_custom_plan(plan: CustomPlanRequest):
    """Save a user-created custom workout plan"""
    try:
        # Save to workout history as a custom plan
        plan_dict = plan.dict()
        if not plan_dict.get("created_at"):
            plan_dict["created_at"] = datetime.now().isoformat()
        
        # 🟢 P3 Fix：改存 DB（workout_sessions 表），不再整檔重寫全域 JSON
        plan_id = f"custom_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"

        session = {
            "session_id": plan_id,
            "timestamp": plan_dict["created_at"],
            "type": "custom_plan",
            "title": plan.title,
            "duration_mins": plan.duration_mins,
            "intensity": plan.intensity,
            "calories_est": plan.calories_est,
            "exercises": plan.exercises,
            "status": "saved"  # Distinguish from completed workouts
        }

        from repositories import workout_session_repo
        workout_session_repo.add_session(plan.user_id, session)
        
        return {"status": "success", "plan_id": plan_id, "message": "Custom plan saved successfully"}
    except Exception as e:
        print(f"Error saving custom plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))
