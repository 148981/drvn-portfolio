# Cardio Plan API Endpoints
# 鏡像 api_plan_endpoints.py 的 URL 命名與 upsert 行為，但專屬有氧週期化計劃。
#
# 路由前綴：/api/cardio-plan/

from fastapi import APIRouter, HTTPException, Depends, Request
from auth_guard import owner_guard, enforce_owner
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import logging

from core import cardio_plan_storage as cps

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/cardio-plan/{user_id}/load-history", dependencies=[Depends(owner_guard)])
async def get_cardio_load_history(user_id: str):
    from repositories import cardio_session_repo
    from core.cardio_load_history import select_window
    until = datetime.now(timezone.utc)
    return select_window(cardio_session_repo.load_summaries(user_id), until - timedelta(days=28), until)


# ─── Pydantic schemas ────────────────────────────────────────

class SaveCardioPlanRequest(BaseModel):
    user_id: str
    plan: Dict[str, Any]


class CompleteBrickRequest(BaseModel):
    user_id: str
    brick_id: str
    session_id: Optional[str] = None
    actual_distance_km: Optional[float] = None
    # 2026-08：讓後端算得出達成率，決定 completed / partial（見 cps.complete_brick）
    actual_duration_min: Optional[float] = None
    target_distance_km: Optional[float] = None
    # 📍 在哪裡跑（週結算校準配速、換期判斷場地用；見前端 utils/runPlaceFeedback）
    actual_pace_sec: Optional[float] = None
    actual_elev_gain_m: Optional[float] = None
    actual_indoor: Optional[bool] = None
    actual_place_id: Optional[str] = None
    actual_place_name: Optional[str] = None
    actual_place_kind: Optional[str] = None


class SkipBrickRequest(BaseModel):
    user_id: str
    brick_id: str


class LogRpeRequest(BaseModel):
    user_id: str
    brick_id: Optional[str] = None
    rpe: int  # 1..10
    logged_at: Optional[str] = None


class CardioAdjustments(BaseModel):
    next_week_mileage_multiplier: float = Field(default=1, gt=0, allow_inf_nan=False)
    intensity_shift: float = Field(default=0, allow_inf_nan=False)
    insert_recovery: bool = False


class CardioSettlement(BaseModel):
    verdict: str = "hold"
    score: Optional[float] = None
    stats: Dict[str, Any] = Field(default_factory=dict)
    adjustments: Optional[CardioAdjustments] = None
    settled_at: Optional[str] = None


class CardioPaceCalibration(BaseModel):
    new_baseline_pace_5k_sec: float = Field(gt=0, allow_inf_nan=False)
    samples: int = Field(ge=1)
    pacing_mode: str = "calibrated"
    confidence: Optional[float] = Field(default=None, ge=0, le=1, allow_inf_nan=False)


class SettleWeekRequest(BaseModel):
    user_id: str
    plan_id: Optional[str] = None
    expected_updated_at: Optional[str] = None
    week_index: int = Field(ge=1)
    apply_adjustments: bool = True
    settlement: Optional[CardioSettlement] = None
    pace_calibration: Optional[CardioPaceCalibration] = None


# ─── Endpoints ───────────────────────────────────────────────

@router.post("/api/cardio-plan/save")
async def save_cardio_plan(request: SaveCardioPlanRequest, http_request: Request):
    """Save (upsert) a cardio plan. Same upsert semantics as /api/plan/save."""
    enforce_owner(http_request, request.user_id)
    try:
        plan = cps.save_plan(request.user_id, request.plan)
        return {"status": "success", "plan_id": plan["plan_id"], "plan": plan}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.exception("[cardio-plan] save failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cardio-plan/{user_id}/latest", dependencies=[Depends(owner_guard)])
async def get_latest_cardio_plan(user_id: str):
    """Get the latest cardio plan for a user."""
    try:
        plan = cps.get_latest_plan(user_id)
        return {"plan": plan}
    except Exception as e:
        logger.exception("[cardio-plan] get_latest failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cardio-plan/{user_id}/this-week", dependencies=[Depends(owner_guard)])
async def get_this_week_bricks(user_id: str):
    """
    Return this week's bricks (microcycle inbox).
    Auto-computed from plan.start_date vs today; falls back to first uncompleted week.

    ⚠️「這一週沒有課」跟「根本沒有計劃」是兩件事。
       以前兩種情況都回一模一樣的空物件，前端分不出來，只好把
       「計劃還沒開始」跟「整期已經跑完」的人都顯示成「尚未建立計劃」——
       明明有計劃卻被告知沒有。所以只要計劃存在，plan 就一定要有東西。
    """
    try:
        plan = cps.get_latest_plan(user_id)
        if plan is None:
            return {"week": None, "bricks": [], "completion": None,
                    "plan": None, "plan_id": None}
        meta = {
            "plan_id": plan.get("plan_id"),
            "goal": plan.get("goal"),
            "start_date": plan.get("start_date"),
            "total_weeks": plan.get("total_weeks") or len(plan.get("weeks") or []),
            "sessions_per_week": plan.get("sessions_per_week"),
            "current_week_index": cps.current_week_index(plan),
        }
        week = cps.get_this_week(plan)
        if week is None:
            return {"week": None, "bricks": [], "completion": None,
                    "plan": meta, "plan_id": meta["plan_id"]}
        completion = cps.week_completion(week)
        return {
            "week": {
                "week_index": week.get("week_index"),
                "phase": week.get("phase"),
                "target_mileage_km": week.get("target_mileage_km"),
                "settlement": week.get("settlement"),
            },
            "bricks": week.get("bricks", []),
            "completion": completion,
            "plan": meta,
            "plan_id": meta["plan_id"],
        }
    except Exception as e:
        logger.exception("[cardio-plan] this-week failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cardio-plan/complete-brick")
async def complete_cardio_brick(request: CompleteBrickRequest, http_request: Request):
    """Mark a brick as completed (after a tracker session finishes)."""
    enforce_owner(http_request, request.user_id)
    try:
        brick = cps.complete_brick(
            request.user_id,
            request.brick_id,
            session_id=request.session_id,
            actual_distance_km=request.actual_distance_km,
            actual_duration_min=request.actual_duration_min,
            target_distance_km=request.target_distance_km,
            place={
                "actual_pace_sec": request.actual_pace_sec,
                "actual_elev_gain_m": request.actual_elev_gain_m,
                "actual_indoor": request.actual_indoor,
                "actual_place_id": request.actual_place_id,
                "actual_place_name": request.actual_place_name,
                "actual_place_kind": request.actual_place_kind,
            },
        )
        if brick is None:
            raise HTTPException(status_code=404, detail="brick not found")
        return {"status": "success", "brick": brick}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[cardio-plan] complete-brick failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cardio-plan/log-rpe")
async def log_cardio_rpe(request: LogRpeRequest, http_request: Request):
    """
    使用者跑完強制填寫的主觀 RPE (1-10)，寫入對應 brick；
    後續 evaluateWeek() / SystemHeardYouCard 會依此自動決定下週是否
    Demote / Insert Recovery / Promote。

    若 brick_id 不存在或為 None → 仍會記錄到 user 的 "loose" RPE log，
    用於趨勢分析。
    """
    enforce_owner(http_request, request.user_id)
    try:
        if not (1 <= int(request.rpe) <= 10):
            raise HTTPException(status_code=400, detail="rpe must be in 1..10")

        target_brick = cps.log_brick_rpe(request.user_id, request.brick_id, request.rpe, request.logged_at)

        # 同時 append 到 loose RPE log（即使沒有 brick_id）
        try:
            log = cps.load_rpe_log(request.user_id) if hasattr(cps, "load_rpe_log") else []
        except Exception:
            log = []
        log.append({
            "brick_id": request.brick_id,
            "rpe": int(request.rpe),
            "logged_at": request.logged_at,
        })
        if hasattr(cps, "save_rpe_log"):
            try:
                cps.save_rpe_log(request.user_id, log)
            except Exception:
                logger.warning("[cardio-plan] rpe log persist failed (non-fatal)")

        return {
            "status": "success",
            "brick_updated": target_brick is not None,
            "rpe": int(request.rpe),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[cardio-plan] log-rpe failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cardio-plan/skip-brick")
async def skip_cardio_brick(request: SkipBrickRequest, http_request: Request):
    """Soft-skip a brick (NRC philosophy: no red 'failed' text)."""
    enforce_owner(http_request, request.user_id)
    try:
        brick = cps.skip_brick(request.user_id, request.brick_id)
        if brick is None:
            raise HTTPException(status_code=404, detail="brick not found")
        return {"status": "success", "brick": brick}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[cardio-plan] skip-brick failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cardio-plan/settle-week")
async def settle_cardio_week(request: SettleWeekRequest, http_request: Request):
    """Persist the user's weekly decision and apply the selected next-week changes."""
    enforce_owner(http_request, request.user_id)
    settlement = request.settlement.model_dump() if request.settlement else None
    # 會員規則（與前端 memberProgression.gateRunAdjustments 同一條）：
    # 減量永遠免費；非會員的「加量」只保留建議，不寫進下週課表。
    adj = (settlement or {}).get("adjustments")
    if adj:
        from api_membership import resolve_membership
        if not resolve_membership(request.user_id)["is_member"]:
            if (adj.get("next_week_mileage_multiplier") or 1) > 1:
                adj["next_week_mileage_multiplier"] = 1
            if (adj.get("intensity_shift") or 0) > 0:
                adj["intensity_shift"] = 0
    try:
        plan = cps.settle_week(
            request.user_id,
            request.week_index,
            settlement=settlement,
            apply_adjustments=request.apply_adjustments,
            pace_calibration=request.pace_calibration.model_dump() if request.pace_calibration else None,
            plan_id=request.plan_id,
            expected_updated_at=request.expected_updated_at,
        )
        if plan is None:
            raise HTTPException(status_code=404, detail="cardio plan or week not found")
        return {"status": "success", "plan": plan}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=409 if str(e) == "plan_changed" else 422, detail=str(e))
    except Exception as e:
        logger.exception("[cardio-plan] settle-week failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/cardio-plan/{user_id}/latest", dependencies=[Depends(owner_guard)])
async def delete_latest_plan(user_id: str):
    """Test/reset helper: drop the latest plan."""
    try:
        dropped = cps.delete_latest_plan(user_id)
        if dropped is None:
            return {"status": "noop"}
        return {"status": "success", "dropped_plan_id": dropped.get("plan_id")}
    except Exception as e:
        logger.exception("[cardio-plan] delete failed")
        raise HTTPException(status_code=500, detail=str(e))
