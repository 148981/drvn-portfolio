"""Pure cardio prescription transforms; parity-tested against the JS preview."""
from copy import deepcopy
import math

# 相對 5K 比賽配速（秒/公里）；與前端 cardioPrescription.PACE_SHIFT_BY_SUBTYPE 同值。
# 節奏＝乳酸閾值（5K +15）、間歇＝最大攝氧量（5K −10）；輕鬆／中距離／長跑＝Daniels E 區（5K +85～+90）、恢復 +120。
PACE_SHIFT = {"long": 85, "medium": 88, "easy": 90, "recovery": 120, "tempo": 15, "interval": -10}
BANDS = {
    "recovery": {"min": 3, "max": 4, "label": "RECOVERY", "color": "#7BD3A5"},
    "easy": {"min": 5, "max": 6, "label": "EASY", "color": "#D8F382"},
    "tempo": {"min": 7, "max": 8, "label": "TEMPO", "color": "#FF99DC"},
    "interval": {"min": 9, "max": 9, "label": "MILE", "color": "#F95C4B"},
}
THEMES = {"long": "long_steady", "medium": "medium_steady", "easy": "easy_breath", "recovery": "recovery_drift", "tempo": "tempo_threshold", "interval": "vo2_interval"}
LABELS = {"long": "長跑", "medium": "中距離跑", "easy": "輕鬆跑", "recovery": "恢復慢跑", "tempo": "節奏跑", "interval": "間歇跑"}


def measurement(value):
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    except (ValueError, TypeError):
        return None


def js_round(value, digits=0):
    factor = 10 ** digits
    return math.floor(value * factor + 0.5) / factor


def has_activity(brick):
    return brick.get("status") in ("completed", "partial", "skipped") or any(
        (measurement(brick.get(key)) or 0) > 0 for key in ("actual_distance_km", "actual_duration_min")
    )


def normalize_run(brick, baseline=None):
    b = deepcopy(brick)
    if b.get("type") == "strength" or b.get("subtype") == "strength" or b.get("distance_km") is None:
        return b
    original = b.get("subtype") or ("tempo" if b.get("type") == "speed" else b.get("type")) or "easy"
    km = measurement(b.get("distance_km")) or 0
    subtype = original
    if subtype not in ("tempo", "interval"):
        subtype = "long" if km > 12 else "medium" if km >= 6 else "recovery" if original == "recovery" else "easy"
    if not baseline or baseline <= 0:
        previous = measurement(b.get("target_pace_sec"))
        baseline = previous - PACE_SHIFT.get(original, 60) if previous else 360
    pace = max(1, int(js_round(baseline + PACE_SHIFT.get(subtype, 60))))
    b.update({
        "subtype": subtype, "type": "speed" if subtype in ("tempo", "interval") else "long" if subtype == "long" else "recovery",
        "title": f"{km:g} 公里 {LABELS[subtype]}" if km > 0 else LABELS[subtype],
        "theme_id": THEMES[subtype], "rpe_band": deepcopy(BANDS.get(subtype, BANDS["easy"])),
        "target_pace_sec": pace, "target_pace_label": f"{pace // 60}:{pace % 60:02d}",
        "duration_min": int(js_round(km * pace / 60)),
    })
    return b


def summarize_week(week):
    bricks = week.get("bricks") or []
    runs = [b for b in bricks if b.get("distance_km") is not None and b.get("type") != "strength"]
    week.update({
        "target_mileage_km": js_round(sum(measurement(b.get("distance_km")) or 0 for b in runs), 1),
        "run_sessions": len(runs), "strength_sessions": len(bricks) - len(runs),
        "total_duration_min": sum(measurement(b.get("duration_min")) or 0 for b in bricks),
    })
    return week


def adjust_week(week, adjustments):
    if any(has_activity(b) for b in week.get("bricks") or []):
        return deepcopy(week)
    result = deepcopy(week)
    multiplier = float(adjustments.get("next_week_mileage_multiplier", 1))
    bricks = []
    for b in result.get("bricks") or []:
        if b.get("type") != "strength" and b.get("subtype") != "strength" and b.get("distance_km") is not None:
            b["distance_km"] = js_round(float(b["distance_km"]) * multiplier, 1)
            b = normalize_run(b)
        bricks.append(b)
    if adjustments.get("intensity_shift", 0) < 0 or adjustments.get("insert_recovery"):
        for i, b in enumerate(bricks):
            if b.get("type") == "speed":
                baseline = b["target_pace_sec"] - PACE_SHIFT.get(b.get("subtype"), 60)
                bricks[i] = normalize_run({**b, "type": "recovery", "subtype": "recovery"}, baseline)
                break
    result["bricks"] = bricks
    return summarize_week(result)


def calibrate_plan(plan, calibration, after_week):
    base = calibration["new_baseline_pace_5k_sec"]
    for week in plan.get("weeks") or []:
        if int(week.get("week_index", 0)) <= after_week:
            continue
        week["bricks"] = [b if has_activity(b) else normalize_run(b, base) for b in week.get("bricks") or []]
        summarize_week(week)
    plan.setdefault("meta", {}).update({
        "baseline_pace_5k_sec": base,
        "pacing_mode": calibration.get("pacing_mode", "calibrated"),
        "pace_confidence": calibration.get("confidence"),
    })


def summarize_plan(plan):
    weeks = plan.get("weeks") or []
    for week in weeks:
        summarize_week(week)
    peak = max((w["target_mileage_km"] for w in weeks), default=0)
    total = js_round(sum(w["target_mileage_km"] for w in weeks), 1)
    meta = plan.setdefault("meta", {})
    meta["peak_mileage_km"] = peak
    meta["total_mileage_km"] = total
    meta.setdefault("totals", {}).update({
        "total_bricks": sum(len(w.get("bricks") or []) for w in weeks),
        "total_km": total, "peak_km": peak,
        "total_run_sessions": sum(w["run_sessions"] for w in weeks),
        "total_strength_sessions": sum(w["strength_sessions"] for w in weeks),
        "total_duration_min": sum(w["total_duration_min"] for w in weeks),
        "start_km": weeks[0]["target_mileage_km"] if weeks else 0,
        "longest_run_km": max((measurement(b.get("distance_km")) or 0 for w in weeks for b in w.get("bricks") or []), default=0),
    })
    last_load, max_jump, max_acwr, risky = None, 0, 0, []
    for i, week in enumerate(weeks):
        km = week["target_mileage_km"]
        recovery = week.get("is_deload") or week.get("phase") == "taper"
        jump = (km / last_load - 1) * 100 if last_load and not recovery else 0
        chronic = sum(w["target_mileage_km"] for w in weeks[max(0, i - 3):i + 1]) / 4
        acwr = km / chronic if i >= 3 and chronic else 0
        max_jump, max_acwr = max(max_jump, jump), max(max_acwr, acwr)
        if jump > 15 or acwr > 1.3:
            risky.append(i + 1)
        if not recovery:
            last_load = km
    start = weeks[0]["target_mileage_km"] if weeks else 0
    meta["mileage_audit"] = {
        "max_jump_pct": js_round(max_jump, 1), "max_acwr": js_round(max_acwr, 2),
        "safe": not risky, "start_km": start,
        "peak_ratio": js_round(peak / start, 1) if start else None, "risky_weeks": risky,
    }
    # Recompute explanations in the UI from the updated audit; never keep old numbers.
    meta["explain"] = [e for e in meta.get("explain", []) if e.get("code") not in ("ramp", "acwr")]
    return plan
