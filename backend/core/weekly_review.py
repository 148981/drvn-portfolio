"""
weekly_review.py — 每週回顧（Weekly Review，逐部位）

不是流水帳，而是「各肌群分析 + 一句突破 + 下週建議」。
LuxuryPlanView 第四週結算時顯示。模擬數據優先、能算真實值就覆蓋。
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List

# 主要肌群顯示順序
MUSCLE_ORDER = ["胸", "背", "腿", "肩", "手臂", "核心"]

# focus_group / 動作 muscle 欄位 → 標準肌群中文
_MUSCLE_MAP = {
    "chest": "胸", "胸": "胸", "push": "胸",
    "back": "背", "背": "背", "pull": "背", "lats": "背",
    "leg": "腿", "legs": "腿", "腿": "腿", "quads": "腿", "hamstring": "腿", "glutes": "腿",
    "shoulder": "肩", "shoulders": "肩", "肩": "肩", "delts": "肩",
    "arm": "手臂", "arms": "手臂", "手臂": "手臂", "biceps": "手臂", "triceps": "手臂",
    "core": "核心", "abs": "核心", "核心": "核心",
}


def _norm_muscle(raw: str) -> str:
    if not raw:
        return ""
    key = str(raw).strip().lower()
    if key in _MUSCLE_MAP:
        return _MUSCLE_MAP[key]
    for k, v in _MUSCLE_MAP.items():
        if k in key:
            return v
    return ""


def _empty_review(label: str) -> Dict[str, Any]:
    """沒有訓練紀錄時的回傳 —— 空的，不是編的。

    ⚠️ 這裡以前叫 _mock_review，會編出「胸 5200 kg · 背 4800 kg · 腿 6100 kg」
       這種看起來完全像真的數字，前端只在標題後面加兩個字「· 示意」。
       使用者看到的是五條有長度的長條圖 —— 那不是示意，那是假資料。
       沒資料就回空的，前端整塊不渲染。
    """
    return {
        "period": {"label": label, "kind": "week"},
        "is_mock": True,
        "metrics": [],
        "consistency": None,
        "best_muscle": None,
        "muscles": [],
        "summary": "",
        "next_week": "",
    }


def _muscle_volumes(hist: List[Dict], start: datetime, end: datetime) -> Dict[str, float]:
    """統計某時間窗內各肌群的訓練量（優先讀動作 muscle，退回 focus_group）。"""
    out: Dict[str, float] = {}
    for w in hist:
        ts = w.get("timestamp", "")
        try:
            d = datetime.fromisoformat(ts[:19]) if ts else None
        except Exception:
            d = None
        if not d or not (start <= d < end):
            continue
        total_vol = float(w.get("total_volume", 0) or 0)
        exercises = w.get("exercises")
        if isinstance(exercises, str):
            import json
            try:
                exercises = json.loads(exercises)
            except Exception:
                exercises = []
        exercises = exercises if isinstance(exercises, list) else []

        assigned = False
        for ex in exercises:
            mus = _norm_muscle(ex.get("muscle") or ex.get("target") or "")
            if not mus:
                continue
            vol = 0.0
            for s in (ex.get("sets") or []):
                try:
                    vol += float(s.get("weight", 0) or 0) * float(s.get("reps", 0) or 0)
                except Exception:
                    pass
            out[mus] = out.get(mus, 0.0) + vol
            assigned = True
        if not assigned:
            mus = _norm_muscle(w.get("focus_group") or "")
            if mus:
                out[mus] = out.get(mus, 0.0) + total_vol
    return out


def generate_weekly_review(user_id: str) -> Dict[str, Any]:
    now = datetime.now()
    day = now.weekday()  # Mon=0
    monday = datetime(now.year, now.month, now.day) - timedelta(days=day)
    last_monday = monday - timedelta(days=7)
    label = "本週回顧"

    review = _empty_review(label)

    try:
        from . import workout_history
        hist = workout_history.get_user_workout_history(user_id, limit=200) or []
    except Exception:
        hist = []

    this_v = _muscle_volumes(hist, monday, monday + timedelta(days=7))
    last_v = _muscle_volumes(hist, last_monday, monday)

    if this_v:
        muscles = []
        for name in MUSCLE_ORDER:
            tv = this_v.get(name, 0.0)
            if tv <= 0:
                continue
            lv = last_v.get(name, 0.0)
            if lv > 0:
                pct = (tv - lv) / lv * 100
                delta = f"{'+' if pct >= 0 else ''}{pct:.0f}%"
                up = pct >= 0
            else:
                delta = "新增"
                up = True
            muscles.append({"name": name, "volume": int(tv), "delta": delta, "up": up, "status": ""})

        if muscles:
            # 最佳肌群：本週訓練量最高
            best = max(muscles, key=lambda m: m["volume"])
            best["status"] = "本週最佳"
            # 落後肌群：本週量最低者 → 下週建議加量
            weakest = min(muscles, key=lambda m: m["volume"])
            if weakest["name"] != best["name"]:
                weakest["status"] = "落後"

            # 力量：整體訓練量週增減；一致性：本週有訓練的天數 / 4（近似）
            tv_sum = sum(m["volume"] for m in muscles)
            lv_sum = sum(last_v.values()) or 0
            strength_pct = ((tv_sum - lv_sum) / lv_sum * 100) if lv_sum > 0 else 0
            train_days = len(set(
                (w.get("timestamp", "")[:10]) for w in hist
                if w.get("timestamp") and monday <= _safe_dt(w.get("timestamp")) < monday + timedelta(days=7)
            ))
            # 算不出來就是 None —— 舊版會退回 _mock_review 的 100%，
            # 等於一場都沒練的人看到「一致性 100%」。
            consistency = min(100, int(round(train_days / 4 * 100))) if train_days else None

            review["is_mock"] = False
            review["muscles"] = muscles
            review["best_muscle"] = best["name"]
            review["consistency"] = consistency
            review["metrics"] = [
                {"label": "力量", "delta": f"{'+' if strength_pct >= 0 else ''}{strength_pct:.0f}%", "up": strength_pct >= 0},
                {"label": "肌肥大", "delta": f"{'+' if strength_pct >= 0 else ''}{max(0, strength_pct * 0.6):.0f}%", "up": True},
                {"label": "一致性", "delta": f"{consistency}%", "up": True},
            ]
            review["summary"] = f"本週最大的突破來自{best['name']}的訓練量提升與穩定的訓練節奏。"
            if weakest["name"] != best["name"]:
                review["next_week"] = f"建議下週將{weakest['name']}的訓練量增加約 10%，維持整體發展平衡。"
            else:
                review["next_week"] = "整體發展平衡，下週維持節奏並嘗試在主項小幅加重。"

    return review


def _safe_dt(ts: str):
    try:
        return datetime.fromisoformat(ts[:19])
    except Exception:
        return datetime.min
