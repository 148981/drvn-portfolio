"""
system_status.py — 首頁「三大系統目前狀態」

一打開 App 就能知道：今天練什麼、數據如何、恢復如何，但主軸是
「跑步 / 健身 / 營養」三個系統各自的當前狀態」。首頁每次只輪播一個，
點卡片可展開看三個系統全貌。模擬數據優先、能算真實值就覆蓋。
"""
from datetime import datetime, timedelta
from typing import Dict, Any


def _week_bounds(now=None):
    now = now or datetime.now()
    day = now.weekday()  # Mon=0
    monday = datetime(now.year, now.month, now.day) - timedelta(days=day)
    return monday, monday - timedelta(days=7)


def _dt(ts):
    try:
        return datetime.fromisoformat(str(ts)[:19]) if ts else None
    except Exception:
        return None


def _running_plan_status(user_id):
    """有計劃、還沒跑第一趟 —— 報計劃的進度，不是「沒有資料」。

    這一段跟中控台讀的是同一份計劃（cardio_plan_storage），
    所以首頁與中控台不會再各說各話。
    """
    try:
        from . import cardio_plan_storage as cps
        plan = cps.get_latest_plan(user_id)
        if not plan:
            return None
        total = int(plan.get("total_weeks") or len(plan.get("weeks") or []) or 0)
        wk = cps.current_week_index(plan)
        week = cps.get_this_week(plan)
        runs = [b for b in (week or {}).get("bricks", []) or []
                if b.get("type") != "strength" and b.get("subtype") != "strength"]
        where = f"第 {wk} / {total} 週" if total else "跑步計劃"
        if runs:
            return {"label": "跑步", "state": "待開機",
                    "line": f"{where}排了 {len(runs)} 趟，還沒跑第一趟。"}
        return {"label": "跑步", "state": "待開機",
                "line": f"{where}本週沒有排課，下一趟在下週。"}
    except Exception:
        return None


def _strength_plan_status(user_id):
    """健身也一樣：課表排好了就報課表，不要說他什麼都沒有。"""
    try:
        from repositories import plan_repo
        plans = plan_repo.load(user_id) or []
        if not plans:
            return None
        plan = plans[-1]
        weeks = plan.get("weeks") or []
        days = (weeks[0] or {}).get("days") if weeks else None
        n = len([d for d in (days or []) if d and not d.get("is_rest")])
        if n:
            return {"label": "健身", "state": "待開機",
                    "line": f"課表每週排 {n} 天，還沒完成第一場。"}
        return {"label": "健身", "state": "待開機", "line": "課表已排好，還沒完成第一場。"}
    except Exception:
        return None


def _running_status(user_id, monday, last_monday):
    try:
        from . import cardio_storage
        sessions = cardio_storage.get_user_sessions(user_id, limit=120) or []
    except Exception:
        return None
    tv = lv = 0.0
    tc = 0
    for s in sessions:
        m = s.get("metrics", s) or {}
        dist = float(m.get("distance_km", m.get("distance", 0)) or 0)
        d = _dt(s.get("created_at") or s.get("timestamp"))
        if not d:
            continue
        if d >= monday:
            tv += dist; tc += 1
        elif last_monday <= d < monday:
            lv += dist
    if tc == 0 and lv == 0:
        # 還沒跑過 ≠ 沒有資料。排好的計劃本身就是資料 ——
        # 中控台已經在顯示「第 3 / 12 週」，首頁不該同時說「完成一次跑步後顯示」。
        return _running_plan_status(user_id)
    if lv > 0 and tv >= lv:
        state, line = "進步中", f"本週已跑 {tv:.1f} km，超過上週（{lv:.1f} km），有氧引擎正在升級。"
    elif lv > 0:
        # 正向帶領，但要「合理」：
        #   差距 ≤12km（一趟跑得完）→ 才說「再一趟就追平」；
        #   差距更大 → 不叫使用者一趟跑百公里，改給週節奏建議；
        #   上週異常大（如補登/測試資料造成 lv 爆量）→ 只聚焦本週，不做比較。
        gap = max(0.0, lv - tv)
        if gap <= 12:
            state, line = "蓄勢中", f"本週已累積 {tv:.1f} km，再一趟輕鬆跑（約 {gap:.1f} km）就追平上週，你正穩定變強。"
        elif lv <= 80:
            per_run = min(10.0, max(3.0, gap / 3))
            state, line = "蓄勢中", (
                f"本週已累積 {tv:.1f} km，距離上週的 {lv:.1f} km 還有 {gap:.1f} km — "
                f"不用一次補完，接下來每趟 {per_run:.0f} km 左右、分幾天跑就能接近。"
            )
        else:
            # 上週量體異常大（>80km 多半是補登或測試資料）→ 不拿來當比較基準
            state, line = "起步", f"本週已累積 {tv:.1f} km，照自己的節奏穩定累積就好。"
    else:
        state, line = "起步", f"本週已跑 {tv:.1f} km，穩定累積就是最好的開始。"
    return {"label": "跑步", "state": state, "line": line}


def _strength_status(user_id, monday, last_monday):
    try:
        from . import workout_history
        hist = workout_history.get_user_workout_history(user_id, limit=200) or []
    except Exception:
        return None
    tv = lv = 0.0
    tc = 0
    for w in hist:
        vol = float(w.get("total_volume", 0) or 0)
        d = _dt(w.get("timestamp"))
        if not d:
            continue
        if d >= monday:
            tv += vol; tc += 1
        elif last_monday <= d < monday:
            lv += vol
    if tc == 0 and lv == 0:
        return _strength_plan_status(user_id)
    if lv > 0:
        pct = (tv - lv) / lv * 100
        if tc == 0 or tv <= 0:
            # 🩹 本週還沒練 ≠ 聰明減量：0 kg 卻說「讓身體恢復」是數據謊言。
            #    誠實點名＋用上週成績當鉤子，把人拉回訓練。
            state, line = "待開機", f"本週還沒有訓練 — 上週你可是舉起了 {int(lv):,} kg。今天排一場，把節奏接回來。"
        elif pct >= 0:
            state, line = "穩定成長", f"本週訓練量 {int(tv):,} kg，較上週 +{pct:.0f}%，肌力正在往上疊。"
        elif pct > -60:
            # 有練但量下修：這才叫減量（刻意或狀態調整），給恢復敘事
            state, line = "聰明減量", f"本週訓練量 {int(tv):,} kg，讓身體充分恢復，下週回來會更有力。"
        else:
            # 掉超過六成：不是減量、是慣性快斷線，誠實提醒接回節奏
            state, line = "接回節奏", f"本週訓練量 {int(tv):,} kg，比上週少了不少 — 別讓累積的慣性斷掉，今天先安排一場輕的。"
    elif tv > 0:
        state, line = "起步", f"本週訓練量 {int(tv):,} kg，開始累積，每一下都算數。"
    else:
        state, line = "待開機", "這週還沒開張 — 從一場 30 分鐘的訓練開始，慣性會帶你走完剩下的。"
    return {"label": "健身", "state": state, "line": line}


def _nutrition_status(user_id):
    try:
        from . import nutrition
        hist = nutrition.get_nutrition_history(user_id, days=7) or []
    except Exception:
        return None
    if len(hist) < 2:
        return None

    def prot(d):
        return float((d.get("summary") or {}).get("protein", 0) or 0)

    today_p = prot(hist[-1])
    prev = [prot(d) for d in hist[:-1] if prot(d) > 0]
    if today_p <= 0 and not prev:
        return None
    avg = sum(prev) / len(prev) if prev else today_p
    if avg > 0 and today_p >= avg * 0.9:
        state, line = "達標", f"今日蛋白質 {int(today_p)}g，維持在近期水準，肌肉修復很有保障。"
    elif today_p > 0:
        # 正向帶領：把「不足」講成「再補一份就更好」
        state, line = "再加一份", f"今日蛋白質 {int(today_p)}g，再補一份高蛋白，修復效率會更上一層。"
    else:
        state, line = "待記錄", "今天還沒記錄營養，補上就能看出你的進步趨勢。"
    return {"label": "營養", "state": state, "line": line}


def generate_system_status(user_id: str) -> Dict[str, Any]:
    monday, last_monday = _week_bounds()

    systems = {}
    for key, fn in (
        ("running", lambda: _running_status(user_id, monday, last_monday)),
        ("strength", lambda: _strength_status(user_id, monday, last_monday)),
        ("nutrition", lambda: _nutrition_status(user_id)),
    ):
        try:
            r = fn()
        except Exception:
            r = None
        if r:
            systems[key] = r

    # ⚠️ 這裡以前在沒資料時回 _mock_systems() —— 編出「配速快 8 秒/km」
    #    「訓練量 5,200 kg」「蛋白質 128g」這種看起來很真的數字送到前端。
    #    前端靠 is_mock 擋掉，但後端不該先生出來：沒資料就回空的。
    is_mock = len(systems) == 0

    # 恢復 / 準備狀態
    # ⚠️ calculate_muscle_fatigue 的名字是 fatigue，回傳的卻是 recovery ——
    #    它自己的 docstring 與 get_recovery_status() 都寫明「100 = Ready、0 = Fatigued」。
    #    這裡原本再做一次 100 - x，等於把它反過來：完全恢復的人被算成準備度 0、
    #    顯示「需休息」；剛練爆的人反而顯示「極佳」。直接取平均，不要反轉。
    readiness, recovery = None, None
    try:
        from . import recovery as rec
        scores, trained = rec.calculate_recovery_detail(user_id)   # 實際上是 recovery 分數
        # ⚠️ 只把「真的練過」的肌群納入平均。
        #    以前是全部平均，而沒練過的肌群一律算 100 ——
        #    所以一次都沒練的人會拿到「準備度 100 · 恢復 極佳」。
        #    那不是「你恢復得很好」，是「我們沒看過你訓練」，
        #    而後者不該用一個滿分數字表示。沒練過就回 None，畫面改顯示動作。
        vals = [float(scores[m]) for m in trained if isinstance(scores.get(m), (int, float))]
        if vals:
            readiness = int(max(0, min(100, sum(vals) / len(vals))))
    except Exception:
        pass
    # 算不出來就回 None。原本回 100（＝「極佳」）是捏造一個滿分，
    # 前端要顯示「—」而不是一個看起來很好的假數字。
    recovery = (
        None if readiness is None
        else "極佳" if readiness >= 85
        else "良好" if readiness >= 65
        else "普通" if readiness >= 45
        else "需休息"
    )

    order = [k for k in ("running", "strength", "nutrition") if k in systems]

    return {
        "readiness": readiness,
        "recovery": recovery,
        "systems": systems,
        "order": order,
        "is_mock": is_mock,
    }
