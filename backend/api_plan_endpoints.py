from fastapi import APIRouter, HTTPException, Form, Request, Depends
from auth_guard import owner_guard
from auth_guard import enforce_owner
from pydantic import BaseModel
from typing import List, Optional, Dict, Literal
import os
import json
import uuid
from datetime import datetime
import logging
import hashlib

logger = logging.getLogger(__name__)

router = APIRouter()

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

class GeneratePlanRequest(BaseModel):
    user_id: str
    selected_hashtags: List[str]
    fitness_level: Optional[str] = 'intermediate'
    days_per_week: Optional[int] = 3

class SavePlanRequest(BaseModel):
    user_id: str
    plan: dict

class UpdateDayRequest(BaseModel):
    user_id: str
    week: int
    exercises: List[dict]

class UpdateScheduleRequest(BaseModel):
    user_id: str
    schedule: Dict[str, Dict[str, int]] # { "1": { "1": 1 }, "2": { "1": 1 } ... }


class ActivateProgramRequest(BaseModel):
    user_id: str
    program_id: str
    strength: Optional[dict] = None
    running: Optional[dict] = None
    nutrition: Optional[dict] = None
    running_schedule: Optional[dict] = None


class ProgramReviewRequest(BaseModel):
    user_id: str
    track: Literal['strength', 'running', 'nutrition']
    cycle_id: str
    feeling: Literal['steady', 'tired', 'adjust']


@router.post('/api/training-program/review')
def save_program_review(payload: ProgramReviewRequest, request: Request):
    enforce_owner(request, payload.user_id)
    from repositories import plan_repo
    from core.models_misc import UserBlob
    from sqlalchemy.orm.attributes import flag_modified
    with plan_repo.transaction(payload.user_id) as db:
        current = current_training_program(payload.user_id).get(payload.track)
        cycle = (current or {}).get('cycle_id') or (current or {}).get('plan_id') or (current or {}).get('planId') or (current or {}).get('id')
        if cycle != payload.cycle_id:
            raise HTTPException(409, 'Cycle changed; refresh before reporting progress')
        row = db.query(UserBlob).filter_by(user_id=payload.user_id, key='training_program_reviews').first()
        if row is None:
            row = UserBlob(user_id=payload.user_id, key='training_program_reviews', payload={})
            db.add(row)
        key = f'{payload.track}:{payload.cycle_id}'
        history = dict(row.payload or {})
        entry = {'at': int(datetime.now().timestamp() * 1000), 'feeling': payload.feeling}
        history[key] = [*(history.get(key) or []), entry][-100:]
        row.payload = history
        flag_modified(row, 'payload')
        return {'entry': entry, 'reviews': history}


@router.get('/api/training-program/{user_id}/current', dependencies=[Depends(owner_guard)])
def current_training_program(user_id: str):
    """Read all active tracks from one consistent database transaction."""
    from repositories import plan_repo
    from core.models_misc import UserBlob
    with plan_repo.transaction(user_id) as db:
        plans = plan_repo.load(user_id)
        result = {'strength': plans[-1] if plans else None}
        for track, key in [('running', 'cardio_plans'), ('nutrition', f'drvn_nutrition_plan_{user_id}')]:
            row = db.query(UserBlob).filter_by(user_id=user_id, key=key).first()
            value = row.payload if row else None
            result[track] = (value[-1] if value else None) if isinstance(value, list) else value
        reviews = db.query(UserBlob).filter_by(user_id=user_id, key='training_program_reviews').first()
        result['reviews'] = reviews.payload if reviews else {}
        return result


@router.post('/api/training-program/activate')
def activate_training_program(payload: ActivateProgramRequest, request: Request):
    """Commit the selected tracks together; omitted tracks retain their current cycle."""
    enforce_owner(request, payload.user_id)
    from copy import deepcopy
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified
    from core.models_misc import UserBlob
    from core.cardio_plan_rules import summarize_plan
    from repositories import plan_repo
    if not payload.program_id or not any([payload.strength, payload.running, payload.nutrition]):
        raise HTTPException(400, 'Select at least one plan')
    if payload.nutrition is not None:
        from core.committed_nutrition import plan_targets
        if plan_targets(payload.nutrition) is None:
            raise HTTPException(422, 'Nutrition plan requires valid calorie and macro targets')
    for track in (payload.strength, payload.running):
        if track is not None and not track.get('weeks'):
            raise HTTPException(400, 'Training plan has no weeks')
    result = {'status': 'success', 'program_id': payload.program_id}
    with plan_repo.transaction(payload.user_id) as db:
        # A transaction receipt makes retrying after a lost response idempotent.
        receipt_key = f'training_program:{payload.program_id}'
        old = db.query(UserBlob).filter_by(user_id=payload.user_id, key=receipt_key).first()
        if old:
            # A program id is an idempotency key. Reusing it for a different
            # draft would otherwise silently restore the first draft.
            incoming = payload.model_dump(exclude_none=True) if hasattr(payload, 'model_dump') else payload.dict(exclude_none=True)
            incoming_hash = hashlib.sha256(json.dumps(incoming, sort_keys=True, default=str).encode()).hexdigest()
            recorded_hash = (old.payload or {}).get('_request_hash') if isinstance(old.payload, dict) else None
            if recorded_hash and recorded_hash != incoming_hash:
                raise HTTPException(409, 'This program id already belongs to another draft')
            # A retry of an older receipt must not restore a superseded cycle
            # after another device has activated a newer one.
            current = {}
            if payload.strength is not None:
                plans = plan_repo.load(payload.user_id)
                current['strength'] = plans[-1] if plans else None
            for track, key in [('running', 'cardio_plans'), ('nutrition', f'drvn_nutrition_plan_{payload.user_id}')]:
                if getattr(payload, track) is not None:
                    row = db.query(UserBlob).filter_by(user_id=payload.user_id, key=key).first()
                    value = row.payload if row else None
                    current[track] = value[-1] if isinstance(value, list) and value else value
            if any(not isinstance(value, dict) or value.get('program_id') != payload.program_id for value in current.values()):
                raise HTTPException(409, 'A newer cycle is active; refresh the control center before continuing')
            if payload.running_schedule is not None:
                row = db.query(UserBlob).filter_by(user_id=payload.user_id, key='cardio_plans').first()
                current_run = row.payload[-1] if row and isinstance(row.payload, list) and row.payload else None
                if current_run != old.payload.get('running'):
                    raise HTTPException(409, 'Running plan changed after this schedule was saved; refresh before continuing')
            return old.payload
        incoming = payload.model_dump(exclude_none=True) if hasattr(payload, 'model_dump') else payload.dict(exclude_none=True)
        request_hash = hashlib.sha256(json.dumps(incoming, sort_keys=True, default=str).encode()).hexdigest()
        def blob(key):
            dialect = db.get_bind().dialect.name
            if dialect == 'sqlite':
                from sqlalchemy.dialects.sqlite import insert
            else:
                from sqlalchemy.dialects.postgresql import insert
            db.execute(insert(UserBlob).values(user_id=payload.user_id, key=key, payload=[]).on_conflict_do_nothing(index_elements=['user_id', 'key']))
            return db.execute(select(UserBlob).where(UserBlob.user_id == payload.user_id, UserBlob.key == key).with_for_update()).scalar_one()
        now = datetime.now().isoformat()
        if payload.running_schedule is not None:
            if payload.running is not None:
                raise HTTPException(422, 'Use the new running plan schedule when replacing running')
            row = blob('cardio_plans')
            previous = deepcopy(row.payload) if isinstance(row.payload, list) else []
            if not previous or previous[-1].get('plan_id') != payload.running_schedule.get('plan_id'):
                raise HTTPException(409, 'Running cycle changed; review the schedule again')
            running = previous[-1]
            overrides = payload.running_schedule.get('day_overrides', {})
            ids = {b.get('brick_id') for w in running.get('weeks', []) for b in w.get('bricks', [])}
            if not isinstance(overrides, dict) or any(k not in ids or isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 6 for k, v in overrides.items()):
                raise HTTPException(422, 'Invalid running schedule')
            running['day_overrides'] = {**running.get('day_overrides', {}), **overrides}
            running['updated_at'] = now
            row.payload = previous
            flag_modified(row, 'payload')
            result['running'] = running
        if payload.running is not None:
            running = deepcopy(payload.running)
            running.update(plan_id=f'{payload.program_id}:run', program_id=payload.program_id, updated_at=now, created_at=now)
            if not all(w.get('bricks') for w in running['weeks']):
                raise HTTPException(400, 'Running week has no sessions')
            row = blob('cardio_plans')
            previous = row.payload if isinstance(row.payload, list) else []
            row.payload = [*previous, summarize_plan(running)]
            flag_modified(row, 'payload')
            result['running'] = running
        if payload.strength is not None:
            strength = deepcopy(payload.strength)
            strength.update(plan_id=f'{payload.program_id}:strength', program_id=payload.program_id, cycle_id=payload.program_id, updated_at=now, created_at=now)
            if payload.running is not None:
                strength['linked_cardio_plan_id'] = result['running']['plan_id']
            plans = plan_repo.load(payload.user_id)
            plan_repo.save(payload.user_id, [*plans, strength])
            result['strength'] = strength
        if payload.nutrition is not None:
            nutrition = deepcopy(payload.nutrition)
            nutrition.update(planId=f'{payload.program_id}:nutrition', program_id=payload.program_id)
            row = blob(f'drvn_nutrition_plan_{payload.user_id}')
            row.payload = nutrition
            flag_modified(row, 'payload')
            result['nutrition'] = nutrition
        result['_request_hash'] = request_hash
        db.add(UserBlob(user_id=payload.user_id, key=receipt_key, payload=result))
    return result

@router.post("/api/plan/generate-from-hashtags")
async def generate_plan_from_hashtags_endpoint(request: GeneratePlanRequest, http_request: Request):
    """Generate 4-week workout plan based on selected hashtags"""
    enforce_owner(http_request, request.user_id)
    try:
        from core.hashtag_plan_generator import generate_plan_from_hashtags as gen_plan
        
        print(f"🎯 Generating plan for user {request.user_id}")
        print(f"📌 Selected hashtags: {request.selected_hashtags}")
        
        # Get user profile
        from core import coach_profile
        profile = coach_profile.get_user_profile(request.user_id)
        if not profile:
            print(f"ℹ️ No profile found, using default fitness_level: {request.fitness_level}")
            profile = {
                'fitness_level': request.fitness_level,
                'goals': []
            }
        
        # Generate plan
        plan = gen_plan(
            user_id=request.user_id,
            selected_hashtags=request.selected_hashtags,
            fitness_level=request.fitness_level,
            days_per_week=request.days_per_week
        )
        
        print(f"✅ Plan generated successfully!")
        print(f"📊 Target muscles: {plan.get('target_muscle_groups', [])}")
        print(f"🎯 Target analysis keys: {list(plan.get('target_analysis', {}).keys())}")
        
        return plan
    except Exception as e:
        import traceback
        print(f"❌ Error generating plan: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/plan/save")
async def save_workout_plan(request: SavePlanRequest, http_request: Request):
    """Save (upsert) a workout plan for a user.

    If the incoming plan already has a plan_id that matches an existing entry,
    that entry is replaced in-place (update/edit flow).
    Otherwise a new UUID is assigned and the plan is appended (create flow).
    The last entry is always treated as 'latest' by the GET endpoint.
    """
    enforce_owner(http_request, request.user_id)
    try:
        logger.info(f"📥 [SAVE] Received save request for user: {request.user_id}")

        # Build plan_data — preserve existing plan_id when provided (upsert key)
        plan_data = request.plan.copy()
        plan_data['user_id'] = request.user_id
        plan_data['updated_at'] = datetime.now().isoformat()

        incoming_id = plan_data.get('plan_id')

        # Load existing plans（Phase 2：改 DB，per-user 的 workout_plans 表）
        from repositories import plan_repo
        with plan_repo.transaction(request.user_id):
            existing_plans = plan_repo.load(request.user_id)

            # Upsert logic
            existing_ids = [p.get('plan_id') for p in existing_plans]
            if incoming_id and incoming_id in existing_ids:
                # 星期排程是另一支 API（PUT /api/plan/{uid}/schedule）寫的，前端的計劃複本
                # 通常沒有這個欄位 —— 整份覆蓋時保留原本的，不然改完課表星期就被洗掉。
                prev = next((p for p in existing_plans if p.get('plan_id') == incoming_id), None)
                # 換季防重：另一台裝置（或離線時留下的舊複本）拿「上一季」來整份覆蓋，
                # 會把已經換好的新一季蓋回去 → 收官再跳一次、季數再 +1。季數比後端舊的一律不收。
                def _season(p):
                    try:
                        return int(p.get('season') or 1)
                    except (TypeError, ValueError):
                        return 1
                if prev and _season(prev) > _season(plan_data):
                    logger.info(f"⏭️ [SAVE] Stale season for {incoming_id}: {_season(plan_data)} < {_season(prev)}")
                    return {"status": "stale", "plan_id": incoming_id, "season": _season(prev)}
                if prev and 'training_schedule' not in plan_data and prev.get('training_schedule'):
                    plan_data['training_schedule'] = prev['training_schedule']
                # Replace the existing entry in-place (preserves its position in the list)
                existing_plans = [
                    plan_data if p.get('plan_id') == incoming_id else p
                    for p in existing_plans
                ]
                # Move the updated plan to the END so it remains "latest"
                updated = next(p for p in existing_plans if p.get('plan_id') == incoming_id)
                existing_plans = [p for p in existing_plans if p.get('plan_id') != incoming_id]
                existing_plans.append(updated)
                logger.info(f"🔄 [SAVE] Updated existing plan: {incoming_id}")
            else:
                # Brand-new plan — assign a fresh UUID
                if not incoming_id:
                    plan_data['plan_id'] = str(uuid.uuid4())
                    plan_data['created_at'] = plan_data['updated_at']
                existing_plans.append(plan_data)
                logger.info(f"✅ [SAVE] Created new plan: {plan_data['plan_id']}")

            # Persist
            plan_repo.save(request.user_id, existing_plans)

        logger.info(f"✅ [SAVE] Saved to DB ({len(existing_plans)} plans)")
        return {"status": "success", "plan_id": plan_data['plan_id']}
    except Exception as e:
        import traceback
        logger.error(f"❌ Error saving plan: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/plan/{user_id}/latest", dependencies=[Depends(owner_guard)])
async def get_latest_plan(user_id: str):
    """Get the latest workout plan for a user"""
    try:
        logger.info(f"📥 [GET] Fetching latest plan for user: {user_id}")
        from repositories import plan_repo
        plans = plan_repo.load(user_id)
        if not plans:
            logger.warning(f"⚠️ [GET] No plans in DB for user: {user_id}")
            return {"plan": None}

        # Get the most recent plan
        latest_plan = plans[-1]
        logger.info(f"✅ [GET] Returning plan ID: {latest_plan.get('plan_id')} (Last modified: {latest_plan.get('created_at')})")
        
        return {"plan": latest_plan}
    except Exception as e:
        import traceback
        logger.error(f"❌ Error getting latest plan: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/plan/{plan_id}/day/{day_number}")
async def update_plan_day(plan_id: str, day_number: int, payload: UpdateDayRequest, request: Request):
    """Update a specific day in a workout plan"""
    enforce_owner(request, payload.user_id)
    try:
        user_id = payload.user_id
        week = payload.week
        new_exercises = payload.exercises

        # 1. 讀取（Phase 2：改 DB）
        from repositories import plan_repo
        with plan_repo.transaction(user_id):
            plans = plan_repo.load(user_id)
            if not plans:
                raise HTTPException(status_code=404, detail="No plans found for user")

            # 2. 尋找對應的 Plan (不使用危險的 fallback)
            target_plan = next((p for p in plans if p.get('plan_id') == plan_id), None)
            if not target_plan:
                raise HTTPException(status_code=404, detail="Plan not found")
        
            print(f"📦 Received {len(new_exercises)} exercises to save.")

            # 4. 處理索引 (Index)
            week_idx = int(week) - 1
            day_idx = int(day_number) - 1 # Frontend sends 1-based Day Number
        
            print(f"Index Debug: Week {week} -> {week_idx}, Day {day_number} -> {day_idx}")

            # 確保週數存在
            if week_idx < 0 or week_idx >= len(target_plan['weeks']):
                 raise HTTPException(status_code=400, detail=f"Week {week} out of range")
        
            target_week = target_plan['weeks'][week_idx]
        
            # 【除錯關鍵】：如果索引超過範圍，或剛好差 1，這裡會報錯
            if day_idx < 0 or day_idx >= len(target_week['days']):
                 raise HTTPException(status_code=400, detail=f"Day {day_number} out of range")

            # 5. 寫入資料
            print(f"📝 Overwriting Week {week} (Index {week_idx}), Day {day_number} (Index {day_idx})")
            target_plan['weeks'][week_idx]['days'][day_idx]['exercises'] = new_exercises
        
            # 【關鍵修正】：如果你修改的不是最新那份，把它搬到最後面，變成「Latest」
            if plans and plans[-1].get('plan_id') != target_plan.get('plan_id'):
                print(f"🔄 Moving plan {target_plan.get('plan_id')} to the end of the list to make it 'latest'")
                plans.remove(target_plan) # 先移除
                plans.append(target_plan) # 再加到最後

            # 6. 存檔（Phase 2：改 DB）
            plan_repo.save(user_id, plans)

            print("✅ Save Complete!")
            return {"status": "success", "updated_day": target_plan['weeks'][week_idx]['days'][day_idx]}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"❌ Error updating plan day: {e}")
        traceback.print_exc() # 這會讓你在 Terminal 看到完整的錯誤原因
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/health")
def health_check():
    """Service health check"""
    try:
        # Check data directory
        data_exists = os.path.exists(DATA_DIR)
        num_files = len(os.listdir(DATA_DIR)) if data_exists else 0
        
        return {
            "status": "ok",
            "database": "file_system",
            "data_dir": DATA_DIR,
            "data_exists": data_exists,
            "num_data_files": num_files,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

@router.get("/api/plan/debug/{user_id}", dependencies=[Depends(owner_guard)])
async def debug_plan(user_id: str):
    """Debug endpoint to see raw plan file info"""
    from repositories import plan_repo
    content = plan_repo.load(user_id)
    exists = bool(content)
    size = len(content)

    return {
        "user_id": user_id,
        "plans_file": "DB:workout_plans",
        "exists": exists,
        "size_bytes": size,
"plan_count": len(content) if isinstance(content, list) else 0,
        "latest_plan_summary": {
            "plan_id": content[-1].get('plan_id') if isinstance(content, list) and content else None,
            "created_at": content[-1].get('created_at') if isinstance(content, list) and content else None,
            "has_weeks": 'weeks' in content[-1] if isinstance(content, list) and content else False
        } if content and isinstance(content, list) else None
    }

@router.get("/api/plan/{user_id}/today", dependencies=[Depends(owner_guard)])
async def get_today_plan(user_id: str):
    """
    Return today's specific training day from the user's latest plan.
    Uses the saved training_schedule to map today's weekday → day_number.
    Falls back to sequential day if no schedule is saved.
    """
    try:
        from repositories import plan_repo
        plans = plan_repo.load(user_id)
        if not plans:
            return {"today_plan": None, "is_rest_day": True}

        latest = plans[-1]
        weeks = latest.get("weeks", [])
        if not weeks:
            return {"today_plan": None, "is_rest_day": True}

        # JS weekday: 0=Sunday … 6=Saturday (same as JS Date.getDay())
        js_weekday = datetime.now().weekday()  # Python: 0=Mon … 6=Sun
        # Convert Python weekday → JS weekday
        js_weekday_map = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}
        js_weekday = js_weekday_map[datetime.now().weekday()]

        # training_schedule shape: {"1": {"1": 2, "3": 4, ...}, ...}
        # keys are week_index (str) and js_weekday (str) → day_number (int)
        schedule = latest.get("training_schedule", {})

        target_day_number = None
        if schedule:
            # Use week 1 schedule as canonical (same pattern each week)
            week_schedule = schedule.get("1") or schedule.get(1) or (list(schedule.values())[0] if schedule else {})
            if isinstance(week_schedule, dict):
                target_day_number = week_schedule.get(str(js_weekday)) or week_schedule.get(js_weekday)

        # Fallback: no schedule saved → pick day by weekday index
        days = weeks[0].get("days", [])
        training_days = [d for d in days if not d.get("is_rest_day") and d.get("exercises")]

        if target_day_number is None:
            # Use day index based on weekday (cycle through training days)
            if not training_days:
                return {"today_plan": None, "is_rest_day": True}
            day_obj = training_days[js_weekday % len(training_days)]
        else:
            # Find matching day_number
            day_obj = next((d for d in days if d.get("day_number") == target_day_number), None)
            if day_obj is None or day_obj.get("is_rest_day"):
                return {"today_plan": None, "is_rest_day": True}

        # Build clean response
        focus_raw = day_obj.get("focus", day_obj.get("shortFocus", "Training"))
        day_number = day_obj.get("day_number", 1)
        exercises = day_obj.get("exercises", [])

        return {
            "today_plan": {
                "day_number": day_number,
                "focus": focus_raw,
                "label": f"Day {day_number} · {focus_raw}",
                "exercises": exercises,
                "exercise_count": len(exercises),
                "set_count": sum(
                    (e.get("sets") if isinstance(e.get("sets"), int) else int(e.get("sets", 3)))
                    for e in exercises
                ),
            },
            "is_rest_day": False
        }
    except Exception as e:
        logger.error(f"❌ Error getting today plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/user/{user_id}/recovery-status", dependencies=[Depends(owner_guard)])
async def get_watch_recovery_status(user_id: str, muscle: Optional[str] = None):
    """
    Watch-specific recovery endpoint.
    Returns battery_level (0-100), status_zh, target_muscle.
    If `muscle` query param is provided, returns recovery for that specific muscle group.
    """
    try:
        import sys, os as _os
        sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
        from core import recovery as _recovery

        details = _recovery.get_muscle_recovery_details(user_id)

        muscle_map = {
            "chest": ["chest", "pecs"],
            "back": ["back", "lats", "upper_back"],
            "legs": ["quads", "glutes", "hamstrings", "legs"],
            "push": ["chest", "shoulders", "triceps"],
            "pull": ["back", "biceps", "lats"],
            "shoulders": ["shoulders", "delts", "front_delts", "rear_delts"],
            "arms": ["biceps", "triceps"],
            "core": ["core", "abs"],
            "full body": list(details.keys()),
            "full_body": list(details.keys()),
        }

        # Determine which muscles to check
        target_keys = []
        if muscle:
            ml = muscle.lower()
            for k, aliases in muscle_map.items():
                if ml in aliases or ml == k:
                    target_keys = aliases
                    break
            if not target_keys:
                target_keys = [ml]

        # Compute average score for the target group (or overall if no group)
        if target_keys and details:
            scores = [details[m]["score"] for m in target_keys if m in details]
            avg_score = int(sum(scores) / len(scores)) if scores else 75
        elif details:
            scores = [v["score"] for v in details.values()]
            avg_score = int(sum(scores) / len(scores)) if scores else 75
        else:
            avg_score = 75

        # Battery level = recovery score (higher = more recovered = more "charge")
        battery = avg_score

        # Chinese status string
        if battery >= 85:
            status_zh = "肌肉充分恢復，今天可以全力訓練 💪"
        elif battery >= 70:
            status_zh = "恢復良好，正常強度訓練沒問題"
        elif battery >= 50:
            status_zh = "部分疲勞，建議中等強度訓練"
        elif battery >= 30:
            status_zh = "肌肉疲勞，建議輕度訓練或休息"
        else:
            status_zh = "高度疲勞，今天建議充分休息 😴"

        # Target muscle display name
        muscle_display_map = {
            "chest": "胸", "back": "背", "legs": "腿", "push": "推",
            "pull": "拉", "shoulders": "肩", "arms": "手臂", "core": "核心",
            "full body": "全身", "full_body": "全身",
            "quads": "股四頭", "glutes": "臀部", "biceps": "二頭", "triceps": "三頭",
            "lats": "闊背", "hamstrings": "腿後",
        }
        display_muscle = muscle_display_map.get(muscle.lower() if muscle else "", muscle or "全身")

        return {
            "battery_level": battery,
            "status_zh": status_zh,
            "target_muscle": display_muscle,
            "recovery_score": avg_score,
        }
    except Exception as e:
        logger.error(f"❌ Watch recovery status error: {e}")
        return {
            "battery_level": 75,
            "status_zh": "恢復數據暫時無法取得",
            "target_muscle": muscle or "--",
            "recovery_score": 75,
        }


@router.put("/api/plan/{user_id}/schedule", dependencies=[Depends(owner_guard)])
async def update_plan_schedule(user_id: str, payload: UpdateScheduleRequest):
    """Update training schedule for a user"""
    try:
        new_schedule = payload.schedule
        from repositories import plan_repo
        with plan_repo.transaction(user_id):
            plans = plan_repo.load(user_id)
            if not plans:
                return {"status": "success", "message": "No plans found"}
            plans[-1]['training_schedule'] = new_schedule
            plan_repo.save(user_id, plans)
            return {"status": "success"}
    except Exception as e:
        logger.error(f"❌ Error updating schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 🏋️ 訓練歷史紀錄 (Workout History) APIs
# ==========================================

class SaveWorkoutRequest(BaseModel):
    user_id: str
    coach_id: Optional[str] = "ai_coach"
    overall_score: Optional[int] = 0
    metrics: Optional[dict] = {}
    reps_count: Optional[int] = 0
    completed_sets_count: Optional[int] = 0
    duration_mins: Optional[int] = 0
    total_volume: Optional[int] = 0
    focus_group: Optional[str] = "Full Body"
    muscles: Optional[List[str]] = []
    pr_alerts: Optional[List[dict]] = []
    hard_sets: Optional[int] = 0            # 🆕 有效組數（RPE≥7）— 之前被 pydantic 靜默丟棄
    muscle_hard_sets: Optional[dict] = {}   # 🆕 各肌群有效組數
    companions: Optional[List[dict]] = []   # 🆕 「一起練」偵測結果（跨裝置可見）
    duration_seconds: Optional[int] = 0     # 🆕 精確秒數（僅 duration_mins 會失真）
    location_name: Optional[str] = None     # 📍 在哪裡練（存檔當下定位反解地名，動態卡顯示）
    gym_id: Optional[str] = None            # 🏋️ 在哪間健身房（App 端健身房記憶的 id）
    gym_name: Optional[str] = None          # 🏋️ 健身房名稱（使用者取的名字）
    exercises: List[dict]

@router.post("/api/workout/save")
async def save_workout_history(request: SaveWorkoutRequest, http_request: Request):
    """接收訓練結算資料並存入歷史紀錄檔。"""
    enforce_owner(http_request, request.user_id)
    try:
        workout_data = request.dict()
        now = datetime.now()
        workout_data["session_id"] = f"session_{now.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"
        workout_data["timestamp"] = now.isoformat()
        # Phase 2：統一存進 DB（per-user 的 workout_sessions 表，取代直接寫 JSON 檔）
        from repositories import workout_session_repo
        workout_session_repo.add_session(request.user_id, workout_data)

        # ── AUTO-SYNC 每個動作的最近重量到 strength_history ──────────────────
        # 讓 Watch 下次能用 /api/strength/history 查到並自動預填重量
        try:
            from core.workout_history import add_strength_record
            today = now.strftime('%Y-%m-%d')
            for ex in (request.exercises or []):
                ex_name = ex.get('name', '').strip()
                sets = ex.get('sets', [])
                if not ex_name or not sets:
                    continue
                completed_sets = [s for s in sets if s.get('completed', True)]
                if not completed_sets:
                    continue
                # 取本次該動作用的最大重量
                max_weight = max(float(s.get('weight', 0)) for s in completed_sets)
                if max_weight <= 0:
                    continue
                best_set = max(completed_sets, key=lambda s: float(s.get('weight', 0)))
                best_reps = int(best_set.get('reps', 0))
                add_strength_record(request.user_id, {
                    'exercise_name': ex_name,
                    'date': today,
                    'training_weight': max_weight,
                    'pr_weight': max_weight,
                    'reps': best_reps,
                    'note': f'⌚ Apple Watch 自動同步'
                })
        except Exception as sync_err:
            logger.warning(f"[strength-sync] 非致命錯誤，略過: {sync_err}")

        return {"status": "success", "session_id": workout_data["session_id"]}
    except Exception as e:
        logger.error(f"❌ Error saving workout: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/workout/history/{user_id}")
async def get_workout_history(user_id: str, request: Request,
                              limit: Optional[int] = 100,
                              exercise: Optional[str] = None):
    """獲取歷史訓練紀錄。支援多種 ID 格式相容。

    exercise：只要某一個動作的「動作分析」紀錄（squat / bench_press …）。
    ⚠️ 前端一直有在傳這個參數，但這支簽名沒有它，FastAPI 就靜靜忽略 ——
       等於「抓最新 100 筆全部類型再在前端過濾」。使用者只要累積超過
       100 筆重訓或跑步紀錄，動作分析歷史就會整批消失。過濾要在這裡做。
    """
    enforce_owner(request, user_id)   # Phase 3：擋 IDOR（帶 JWT 時只能讀自己的；放 try 外避免被吞成 500）
    try:
        # Phase 2：統一改從 DB 讀（per-user 的 workout_sessions 表）
        from repositories import workout_session_repo
        if exercise:
            # 要濾動作 → 先多撈一些再濾，才不會被其他類型的紀錄擠掉
            raw = workout_session_repo.get_history(user_id, max(int(limit or 100) * 10, 500))
            history_records = [r for r in raw if r.get("exerciseKey") == exercise][: int(limit or 100)]
        else:
            history_records = workout_session_repo.get_history(user_id, limit)
        logger.info(f"✅ History for {user_id} from DB. Records: {len(history_records)}"
                    + (f" (exercise={exercise})" if exercise else ""))
        return {"history": history_records}
    except Exception as e:
        logger.error(f"❌ Error reading history for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/workout/last-weight/{user_id}", dependencies=[Depends(owner_guard)])
async def get_last_weight(user_id: str, exercise: str):
    """
    從使用者專屬的歷史紀錄中，抓取特定動作最後一次使用的重量與次數。
    """
    try:
        # Phase 2：改從 DB 讀（newest-first）
        from repositories import workout_session_repo
        history_records = workout_session_repo.get_history(user_id)
        if not history_records:
            return {"weight": 0, "reps": 0, "msg": "No history"}

        # get_history 回傳最新在前，等同舊版 insert(0,...) 的順序
        for session in history_records:
            exercises = session.get("exercises", [])
            
            for ex in exercises:
                # 1. 檢查動作名稱是否匹配 (忽略大小寫與空格)
                # 2. 確保 sets 裡面真的有資料（避免抓到還沒練就結束的空白紀錄）
                if ex.get("name", "").strip().lower() == exercise.strip().lower() and ex.get("sets"):
                    
                    # 找出那一場裡面最重的一組 (Weight-based)
                    valid_sets = [s for s in ex["sets"] if s.get("completed", True)]
                    if not valid_sets: continue
                    
                    max_set = max(valid_sets, key=lambda s: float(s.get("weight", 0)))
                    
                    return {
                        "weight": max_set.get("weight", 0),
                        "reps": max_set.get("reps", 0),
                        "date": session.get("timestamp", "").split("T")[0] # 回傳 YYYY-MM-DD
                    }

        # 如果翻遍了所有 session 都沒找到這個動作
        return {"weight": 0, "reps": 0, "msg": "Exercise not found in history"}

    except Exception as e:
        logger.error(f"❌ Error fetching last weight: {e}")
        return {"weight": 0, "reps": 0, "error": str(e)}

class CalculateSetPayload(BaseModel):
    user_id: str
    exercise_name: str
    weight: float
    reps: int
    rpe: float = 8.0

@router.post("/api/workout/calculate-set")
async def calculate_set(payload: CalculateSetPayload):
    """計算單組分數並偵測 PR。"""
    try:
        historical_pr = 0.0
        history_file = os.path.join(DATA_DIR, f"user_{payload.user_id}_history.json")
        if os.path.exists(history_file):
            with open(history_file, 'r', encoding='utf-8') as f:
                history_data = json.load(f)
            for session in history_data:
                for ex in session.get("exercises", []):
                    if ex.get("name") == payload.exercise_name:
                        session_max_weight = float(ex.get("weight", 0.0))
                        if session_max_weight > historical_pr:
                            historical_pr = session_max_weight

        effective_pr = historical_pr if historical_pr > 0 else (payload.weight if payload.weight > 0 else 1.0)
        divisor = 1.0278 - (0.0278 * payload.reps)
        current_e1rm = (payload.weight / divisor) if divisor > 0.1 else payload.weight
        intensity_ratio = current_e1rm / effective_pr
        rpe_weight = payload.rpe / 10.0
        
        # 分數計算 (70% 重量指標 + 30% 疲勞指標)
        raw_score = (intensity_ratio * 0.7 + rpe_weight * 0.3) * 100
        
        # 限制最高分 120 分
        final_score = min(round(raw_score), 120)
        
        # 3. 判斷是否破 PR
        # 只有在「有歷史記錄」且「當前重量大於歷史 PR」時，才算是真正的破 PR
        is_pr = False
        if historical_pr > 0 and payload.weight > historical_pr:
            is_pr = True
            
        logger.info(f"📊 [Calculate Set] {payload.exercise_name}: W={payload.weight}kg, R={payload.reps}, RPE={payload.rpe} | PR={effective_pr} -> e1RM={round(current_e1rm,1)}, Score={final_score}, isPR={is_pr}")
        
        return {
            "effort_score": final_score,
            "is_pr": is_pr
        }
    except Exception as e:
        import traceback
        logger.error(f"❌ Error calculating set score: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
