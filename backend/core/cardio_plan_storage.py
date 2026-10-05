# Cardio Plan Storage
# 鏡像 user_{user_id}_plans.json (重訓) 的儲存結構，但專屬有氧週期化計劃
#
# Schema：見 build_brick / build_week / 下方 docstring。
# 設計哲學 (NRC inspired)：
#   - bricks 不綁日期（彈性消耗）
#   - 每週可帶 settlement{} 結算結果（升/降階）
#   - tapering 由 phase='taper' 標識

import json
import os
import logging
import uuid
from copy import deepcopy
from contextvars import ContextVar
from functools import wraps
from .cardio_plan_rules import adjust_week, calibrate_plan, summarize_plan, has_activity, measurement
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional

from .json_cache import load_json_cached, save_json_atomic

logger = logging.getLogger(__name__)

# 與重訓 user_{user_id}_plans.json 同層
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))


def get_cardio_plans_file(user_id: str) -> str:
    """根據 user_id 取得有氧計劃檔案路徑（與重訓 plan 完全平行）"""
    return os.path.join(DATA_DIR, f"user_{user_id}_cardio_plans.json")


# ───────────────────────────────────────────────────────────
# 基本 CRUD（與 cardio_storage / api_plan_endpoints 完全平行的命名與行為）
# ───────────────────────────────────────────────────────────

_active_transaction = ContextVar("cardio_plan_transaction", default=None)


def _legacy_plans(user_id):
    data = load_json_cached(get_cardio_plans_file(user_id), default=[])
    return data if isinstance(data, list) else []


def transactional(fn):
    @wraps(fn)
    def wrapped(user_id, *args, **kwargs):
        active = _active_transaction.get()
        if active is not None:
            if active[0] != user_id:
                raise RuntimeError("Cannot mix users in a cardio transaction")
            return fn(user_id, *args, **kwargs)
        from repositories import user_blob_repo
        with user_blob_repo.transaction(user_id, "cardio_plans", lambda: _legacy_plans(user_id)) as state:
            token = _active_transaction.set((user_id, state))
            try:
                result = fn(user_id, *args, **kwargs)
            finally:
                _active_transaction.reset(token)
        # DB is authoritative. A failed mirror must not invalidate a committed write.
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            save_json_atomic(get_cardio_plans_file(user_id), state["payload"])
        except Exception:
            logger.warning("[cardio-plan] JSON mirror failed after DB commit", exc_info=True)
        return result
    return wrapped


def load_user_plans(user_id: str) -> List[Dict]:
    active = _active_transaction.get()
    if active is not None and active[0] == user_id:
        return deepcopy(active[1]["payload"])
    from repositories import user_blob_repo
    data = user_blob_repo.get(user_id, "cardio_plans")
    if data is None:
        # Legacy JSON is imported only when the DB row does not exist. A DB
        # outage must surface as an error, never revive an obsolete JSON mirror.
        with user_blob_repo.transaction(user_id, "cardio_plans", lambda: _legacy_plans(user_id)) as state:
            data = state["payload"]
    if not isinstance(data, list):
        raise ValueError("Invalid stored cardio plans")
    return deepcopy(data)


def save_user_plans(user_id: str, plans: List[Dict]) -> None:
    active = _active_transaction.get()
    if active is None or active[0] != user_id:
        raise RuntimeError("Cardio plan writes require a transaction")
    active[1]["payload"] = deepcopy(plans)

def get_latest_plan(user_id: str) -> Optional[Dict]:
    plans = load_user_plans(user_id)
    return plans[-1] if plans else None


@transactional
def upsert_plan(user_id: str, plan: Dict, *, check_revision=False) -> str:
    """Insert-or-update by plan_id. Returns the plan_id used."""
    plan = deepcopy(plan)
    expected = plan.get("updated_at")
    plan["user_id"] = user_id
    plan["updated_at"] = datetime.now().isoformat()
    plans = load_user_plans(user_id)

    incoming_id = plan.get("plan_id")
    if check_revision and incoming_id:
        stored = next((p for p in plans if p.get("plan_id") == incoming_id), None)
        if stored and plans[-1].get("plan_id") != incoming_id:
            raise ValueError("plan_changed")
        if stored and (not expected or stored.get("updated_at") != expected):
            raise ValueError("plan_changed")
        if not stored and expected:
            raise ValueError("plan_changed")
    if incoming_id and any(p.get("plan_id") == incoming_id for p in plans):
        # Replace existing in-place, then move to the end so it remains "latest"
        remaining = [p for p in plans if p.get("plan_id") != incoming_id]
        remaining.append(plan)
        plans = remaining
        logger.info("[cardio-plan] updated %s for user %s", incoming_id, user_id)
    else:
        if not incoming_id:
            plan["plan_id"] = str(uuid.uuid4())
        plan.setdefault("created_at", plan["updated_at"])
        plans.append(plan)
        logger.info("[cardio-plan] created %s for user %s", plan["plan_id"], user_id)

    save_user_plans(user_id, plans)
    return plan["plan_id"]


@transactional
def save_plan(user_id, plan):
    plan_id = upsert_plan(user_id, plan, check_revision=True)
    return next(p for p in load_user_plans(user_id) if p.get("plan_id") == plan_id)


@transactional
def settle_week(user_id: str, week_index: int, settlement=None,
                apply_adjustments=True, pace_calibration=None,
                plan_id=None, expected_updated_at=None):
    """Apply a decision once; reject stale previews before mutating stored data.

    The transaction holds the stored blob lock throughout revision checking.
    """
    plans = deepcopy(load_user_plans(user_id))
    plan = plans[-1] if plans else None
    if not plan:
        return None
    if plan_id and plan.get("plan_id") != plan_id:
        raise ValueError("plan_changed")
    weeks = plan.get("weeks") or []
    target = next((w for w in weeks if w.get("week_index") == week_index), None)
    if target is None:
        return None
    if target.get("settlement") is not None:
        return plan
    if expected_updated_at and plan.get("updated_at") != expected_updated_at:
        raise ValueError("plan_changed")
    record = deepcopy(settlement or {})
    adjustments = record.get("adjustments") or {}
    multiplier = measurement(adjustments.get("next_week_mileage_multiplier", 1))
    if multiplier is None or multiplier <= 0:
        raise ValueError("invalid_adjustment")
    stamp = datetime.now().isoformat()
    record.update(settled_at=stamp, adjustments_applied=False)
    target["settlement"] = record
    next_idx = next((i for i, w in enumerate(weeks) if w.get("week_index") == week_index + 1), None)
    if apply_adjustments and next_idx is not None:
        next_week = weeks[next_idx]
        prior_auto = next_week.get("auto_adjusted") or {}
        if prior_auto and not prior_auto.get("noop"):
            # 前端 autoAdjustPlan 已經依完成度調過下一週（並寫回）；再套一次結算倍率
            # 等於同一週的表現把下週里程砍兩次。noop 蓋章（達標沒改）不算，照常套用。
            record["adjustment_skipped_reason"] = "already_auto_adjusted"
        elif not any(has_activity(b) for b in next_week.get("bricks") or []):
            weeks[next_idx] = adjust_week(next_week, adjustments)
            weeks[next_idx]["auto_adjusted"] = {
                "from": next_week.get("target_mileage_km", 0),
                "to": weeks[next_idx]["target_mileage_km"],
                "rule": record.get("verdict", "settlement"), "source_week": week_index,
            }
            record["adjustments_applied"] = True
        else:
            record["adjustment_skipped_reason"] = "next_week_started"
    record["apply_adjustments"] = bool(apply_adjustments)
    if apply_adjustments and pace_calibration and (measurement(pace_calibration.get("samples")) or 0) > 0:
        base = measurement(pace_calibration.get("new_baseline_pace_5k_sec"))
        if base is None or base <= 0:
            raise ValueError("invalid_calibration")
        calibrate_plan(plan, pace_calibration, week_index)
        plan["meta"]["pace_calibrated_at"] = stamp
        record["pace_calibration_applied"] = True
    if apply_adjustments:
        summarize_plan(plan)
    plan["updated_at"] = stamp
    save_user_plans(user_id, plans)
    return plan


# ───────────────────────────────────────────────────────────
# Schema builders — 只是純資料工廠，方便前端與測試共用相同格式
# ───────────────────────────────────────────────────────────

def build_brick(
    brick_type: str,
    rpe_band: Dict[str, int],
    duration_min: int,
    *,
    distance_km: Optional[float] = None,
    theme_id: Optional[str] = None,
    title: Optional[str] = None,
) -> Dict:
    """
    建立一個 brick。

    brick_type:  'speed' | 'recovery' | 'long' | 'strength'
    rpe_band:    {'min': 3, 'max': 4}
    """
    return {
        "brick_id": str(uuid.uuid4()),
        "type": brick_type,
        "title": title or _default_brick_title(brick_type),
        "rpe_band": rpe_band,
        "duration_min": duration_min,
        "distance_km": distance_km,
        "theme_id": theme_id,
        "status": "pending",
        "completed_session_id": None,
        "completed_at": None,
        "actual_distance_km": None,
    }


def _default_brick_title(brick_type: str) -> str:
    return {
        "speed":    "Speed Run",
        "recovery": "Recovery Run",
        "long":     "Long Run",
        "strength": "Strength Cross-Train",
    }.get(brick_type, "Run")


def build_week(week_index: int, phase: str, target_mileage_km: float, bricks: List[Dict]) -> Dict:
    """phase: 'base' | 'build' | 'peak' | 'taper'"""
    return {
        "week_index": week_index,
        "phase": phase,
        "target_mileage_km": target_mileage_km,
        "bricks": bricks,
        "settlement": None,
    }


# ───────────────────────────────────────────────────────────
# Brick / Week 操作
# ───────────────────────────────────────────────────────────

def _iter_bricks(plan: Dict):
    """Generator (week_obj, brick_obj) — 方便檢索"""
    for w in plan.get("weeks", []) or []:
        for b in w.get("bricks", []) or []:
            yield w, b


def find_brick(plan: Dict, brick_id: str):
    """回傳 (week_obj, brick_obj) 或 (None, None)"""
    for w, b in _iter_bricks(plan):
        if b.get("brick_id") == brick_id:
            return w, b
    return None, None


# 達成率門檻：實跑要到計劃的這個比例才算 completed，否則記為 partial。
# 與前端 utils/dailyAgenda.js 的 COMPLETION_THRESHOLD 對齊，兩邊要一起改。
COMPLETION_THRESHOLD = 0.8


@transactional
def complete_brick(
    user_id: str,
    brick_id: str,
    *,
    session_id: Optional[str] = None,
    actual_distance_km: Optional[float] = None,
    actual_duration_min: Optional[float] = None,
    target_distance_km: Optional[float] = None,
    place: Optional[Dict] = None,
) -> Optional[Dict]:
    """
    依實際完成量把一個 brick 標記為 completed 或 partial。
    place：在哪裡跑（actual_pace_sec / actual_elev_gain_m / actual_indoor / actual_place_*），
           有值才寫，舊的 App 版本不傳也照常運作。
    回傳更新後的 brick；找不到時回 None。

    2026-08 稽核修正：這裡原本無論 actual_distance_km 是 0、0.01 還是 None，
    都無條件寫 status = "completed" —— actual_distance_km 只是被存起來，
    從不參與判定。結果是跑 10 公尺也能把一堂 10K 標成完成，
    下游的 demote/promote 排程邏輯就被灌水數據帶偏。

    現在的規則：
      · 算得出達成率（有計劃量也有實際量）→ 達 80% 記 completed，否則 partial
      · 算不出達成率（自由跑、舊資料沒有 target）→ 維持舊行為記 completed
        （寧可放過，不可錯殺 —— 沒有分母時我們沒有立場說使用者沒做完）
    """
    plan = get_latest_plan(user_id)
    if plan is None:
        return None

    week_obj, brick_obj = find_brick(plan, brick_id)
    if brick_obj is None:
        return None

    # 計劃量：呼叫端傳的優先，否則回頭讀 brick 自己存的目標
    target_km = target_distance_km
    if target_km is None:
        target_km = brick_obj.get("distance_km") or brick_obj.get("target_distance_km")
    target_min = brick_obj.get("duration_min") or brick_obj.get("target_duration_min")

    ratio = None
    try:
        if target_km and float(target_km) > 0 and actual_distance_km is not None:
            ratio = float(actual_distance_km) / float(target_km)
        elif target_min and float(target_min) > 0 and actual_duration_min is not None:
            ratio = float(actual_duration_min) / float(target_min)
    except (TypeError, ValueError):
        ratio = None

    if ratio is None:
        brick_obj["status"] = "completed"
    else:
        pct = max(0, min(100, round(ratio * 100)))
        brick_obj["completion_pct"] = pct
        brick_obj["status"] = "completed" if ratio >= COMPLETION_THRESHOLD else "partial"

    brick_obj["completed_session_id"] = session_id
    brick_obj["completed_at"] = datetime.now().isoformat()
    if actual_distance_km is not None:
        brick_obj["actual_distance_km"] = float(actual_distance_km)
    if actual_duration_min is not None:
        brick_obj["actual_duration_min"] = float(actual_duration_min)
    _PLACE_KEYS = ("actual_pace_sec", "actual_elev_gain_m", "actual_indoor",
                   "actual_place_id", "actual_place_name", "actual_place_kind")
    for k, v in (place or {}).items():
        if k in _PLACE_KEYS and v is not None:
            brick_obj[k] = v

    upsert_plan(user_id, plan)
    return brick_obj


@transactional
def skip_brick(user_id: str, brick_id: str) -> Optional[Dict]:
    """標記跳過（軟刪除）— NRC 哲學：跳過不顯示紅字，但要可追蹤"""
    plan = get_latest_plan(user_id)
    if plan is None:
        return None
    _, brick_obj = find_brick(plan, brick_id)
    if brick_obj is None:
        return None
    brick_obj["status"] = "skipped"
    brick_obj["completed_at"] = datetime.now().isoformat()
    upsert_plan(user_id, plan)
    return brick_obj


@transactional
def log_brick_rpe(user_id, brick_id, rpe, logged_at=None):
    plans = load_user_plans(user_id)
    for plan in reversed(plans[-3:]):
        _, brick = find_brick(plan, brick_id)
        if brick is not None:
            brick["user_rpe"] = int(rpe)
            if logged_at:
                brick["user_rpe_logged_at"] = logged_at
            plan["updated_at"] = datetime.now().isoformat()
            save_user_plans(user_id, plans)
            return brick
    return None


@transactional
def delete_latest_plan(user_id):
    plans = load_user_plans(user_id)
    if not plans:
        return None
    dropped = plans.pop()
    save_user_plans(user_id, plans)
    return dropped


# ───────────────────────────────────────────────────────────
# 微週期：依當前日期挑出「本週」
# ───────────────────────────────────────────────────────────

def _parse_iso_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except Exception:
            return None


def current_week_index(plan: Dict, today: Optional[date] = None) -> int:
    """
    依 plan.start_date 與今天日期，計算「現在是第幾週」(1-based)。
    若 plan 沒有 start_date，或日期早於 start_date，回傳 1。
    """
    today = today or date.today()
    start = _parse_iso_date(plan.get("start_date"))
    total_weeks = int(plan.get("total_weeks") or len(plan.get("weeks", [])) or 1)
    if start is None:
        return 1
    delta_days = (today - start).days
    if delta_days < 0:
        return 1
    wk = delta_days // 7 + 1
    return max(1, min(total_weeks, wk))


def get_this_week(plan: Dict, today: Optional[date] = None) -> Optional[Dict]:
    """回傳當前週的 week 物件；若找不到回傳 None。"""
    wk_idx = current_week_index(plan, today)
    for w in plan.get("weeks", []) or []:
        if int(w.get("week_index", -1)) == wk_idx:
            return w
    # fallback：用第一個未完全完成的 week
    for w in plan.get("weeks", []) or []:
        bricks = w.get("bricks", []) or []
        if any(b.get("status") == "pending" for b in bricks):
            return w
    return None


def week_completion(week: Dict) -> Dict[str, float]:
    """
    計算當週完成率與里程。
    回傳：{
        completion_rate: 0..1（完成 brick 數 / 總 brick 數）,
        total_mileage_target_km, total_mileage_actual_km,
        mileage_completion_rate: 0..1（實際里程 / 目標里程）
    }
    """
    bricks = week.get("bricks", []) or []
    total = len(bricks)
    completed = sum(1 for b in bricks if b.get("status") == "completed")
    target_mileage = float(week.get("target_mileage_km") or 0.0)
    actual = sum(measurement(b.get("actual_distance_km")) or 0 for b in bricks
                 if b.get("type") != "strength" and b.get("subtype") != "strength")
    return {
        "completion_rate": (completed / total) if total else 0.0,
        "total_mileage_target_km": target_mileage,
        "total_mileage_actual_km": actual,
        "mileage_completion_rate": (actual / target_mileage) if target_mileage > 0 else 0.0,
    }
