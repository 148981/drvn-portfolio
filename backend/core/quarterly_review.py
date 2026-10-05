"""
quarterly_review.py — 季回饋（Quarterly Review）

═══════════════════════════════════════════════════════════════════════════
產品定位（使用者的設計意圖）
───────────────────────────────────────────────────────────────────────────
  月報回答：「這個月我做了什麼？」   → 流水帳、單月成果
  季報回答：「三個月下來，我變成什麼樣的人？」 → 趨勢、方向、長期身分認同

  出場節奏：第 1、2 個月只有月報；第 3 個月（季末）＝ 月報 ＋ 季報。
  讓使用者可以從「不同時間尺度」看自己的變化 —— 近看是波動，遠看是斜率。

═══════════════════════════════════════════════════════════════════════════
2026-07-21 重寫的原因（舊版的問題）
───────────────────────────────────────────────────────────────────────────
  舊版 `_mock_report()` 把 headline / insight / direction / score / delta /
  highlights / evolution.narrative 全部寫死，只有 3 個 metric 數值會被真實資料
  覆蓋。也就是說：一個從沒跑過 5K 的使用者，會看到
  「5K 個人紀錄刷新兩次」「VO₂max +3」。

  這違反 DRVN 鐵律第 1 條（真實數據，不造假）與第 2 條（沒進步不亂顯示），
  而且是最嚴重的那種違反 —— 假的「教練評語」會直接摧毀陪伴感的信任。

  重寫後：**每一句話都由真實資料推導**，推導不出來就不寫。
  資料不足 → 誠實回「累積中」，並說清楚還差多少。

═══════════════════════════════════════════════════════════════════════════
教練語氣憲章（references/sports-science.md §教練語氣憲章）
───────────────────────────────────────────────────────────────────────────
  每一段都照這個順序：
    1. 肯定 — 先看見付出
    2. 進步 — 只講金字塔達標的（L1 PR > L2 e1RM≥+2% > L3 容量≥+3%
              > L4 30天最佳 > L5 密度≥+5%）；全落空就誠實說「鞏固期」
    3. 處方 — 精確（幾 kg、幾下、幾 %）且白話（講為什麼）
  敘事鐵律：客觀數字 ＋ 有感換算 ＋ 一句人話。禁止沒有數字支撐的鼓勵。
═══════════════════════════════════════════════════════════════════════════
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

# 一份季報至少要有這麼多素材才值得產生，否則誠實說「累積中」
MIN_SESSIONS_FOR_REPORT = 8
MIN_DAYS_FOR_TREND = 30


# ═══════════════════════════════════════════════════════════════════════
# 期間計算
# ═══════════════════════════════════════════════════════════════════════

def _quarter_bounds(now: datetime = None):
    """回傳本季的 (起, 迄, 標籤)。"""
    now = now or datetime.now()
    q = (now.month - 1) // 3            # 0..3
    start_month = q * 3 + 1
    start = datetime(now.year, start_month, 1)
    end_month = start_month + 3
    end_year = now.year + (1 if end_month > 12 else 0)
    end_month = end_month - 12 if end_month > 12 else end_month
    end = datetime(end_year, end_month, 1)
    return start, end, f"{now.year} Q{q + 1}"


def _prev_quarter_bounds(now: datetime = None):
    """上一季的 (起, 迄, 標籤) —— 季報的核心是「季對季」，沒有基線就沒有趨勢。"""
    start, _, _ = _quarter_bounds(now)
    prev_end = start
    pm = start.month - 3
    py = start.year
    if pm <= 0:
        pm += 12
        py -= 1
    prev_start = datetime(py, pm, 1)
    pq = (pm - 1) // 3 + 1
    return prev_start, prev_end, f"{py} Q{pq}"


def is_quarter_end_month(now: datetime = None) -> bool:
    """季末月（3/6/9/12）才推季報 —— 前兩個月只有月報。"""
    now = now or datetime.now()
    return now.month % 3 == 0


def _parse_ts(raw) -> Optional[datetime]:
    """欄位別名地獄防禦：時間戳可能是 timestamp / created_at / date，格式也不一。"""
    if not raw:
        return None
    s = str(raw)
    for cut in (19, 10):
        try:
            return datetime.fromisoformat(s[:cut].replace("Z", ""))
        except Exception:
            continue
    return None


def _pct(new: float, old: float) -> Optional[float]:
    """變化百分比。基線為 0 時回 None（不能除以零，也不該說「成長無限大」）。"""
    if not old:
        return None
    return round((new - old) / old * 100, 1)


def _fmt_delta(p: Optional[float], unit: str = "%") -> str:
    if p is None:
        return ""
    if abs(p) < 3:            # ±3% 內視為持平（sports-science.md L3 門檻）
        return "持平"
    return f"{'+' if p > 0 else ''}{p}{unit}"


# ═══════════════════════════════════════════════════════════════════════
# 資料聚合 — 每個系統都回「本季」與「上季」兩份，才有得比
# ═══════════════════════════════════════════════════════════════════════

def _running_window(user_id: str, start: datetime, end: datetime) -> Dict[str, Any]:
    try:
        from . import cardio_storage
        sessions = cardio_storage.get_user_sessions(user_id, limit=600) or []
    except Exception:
        return {"count": 0}

    km = 0.0
    count = 0
    paces: List[float] = []
    longest = 0.0
    for s in sessions:
        d = _parse_ts(s.get("created_at") or s.get("timestamp") or s.get("date"))
        if not d or not (start <= d < end):
            continue
        m = s.get("metrics", s) or {}
        dist = float(m.get("distance_km", m.get("distance", 0)) or 0)
        if dist <= 0:
            continue
        km += dist
        count += 1
        longest = max(longest, dist)
        # 配速合理性驗證（120–1200 秒/km），髒資料不進統計
        p = float(m.get("avg_pace_per_km", m.get("avg_pace", m.get("pace", 0))) or 0)
        if 120 <= p <= 1200:
            paces.append(p)
    return {
        "count": count,
        "km": round(km, 1),
        "longest": round(longest, 1),
        "avg_pace": round(sum(paces) / len(paces)) if paces else None,
        "best_pace": round(min(paces)) if paces else None,
    }


def _strength_window(user_id: str, start: datetime, end: datetime) -> Dict[str, Any]:
    try:
        from . import workout_history
        hist = workout_history.get_user_workout_history(user_id, limit=600) or []
    except Exception:
        return {"count": 0}

    vol = 0.0
    count = 0
    prs = 0
    for w in hist:
        d = _parse_ts(w.get("timestamp") or w.get("created_at") or w.get("date"))
        if not d or not (start <= d < end):
            continue
        vol += float(w.get("total_volume", w.get("volume_kg", 0)) or 0)
        count += 1
        alerts = w.get("pr_alerts") or []
        # pitfalls.md：pr_alerts 可能是陣列**或 JSON 字串**
        if isinstance(alerts, str):
            try:
                import json
                alerts = json.loads(alerts)
            except Exception:
                alerts = []
        prs += len(alerts) if isinstance(alerts, list) else 0
    return {
        "count": count,
        "volume": int(vol),
        "prs": prs,
        "avg_volume": int(vol / count) if count else 0,
    }


def _nutrition_window(user_id: str, start: datetime, end: datetime) -> Dict[str, Any]:
    try:
        from . import nutrition
        hist = nutrition.get_nutrition_history(user_id, days=200) or []
    except Exception:
        return {"days": 0}

    prot = 0.0
    days = 0
    for d in hist:
        dt = _parse_ts(d.get("date"))
        if not dt or not (start <= dt < end):
            continue
        summary = d.get("summary") or {}
        p = float(summary.get("protein", 0) or 0)
        if p > 0:
            prot += p
            days += 1
    span = max((end - start).days, 1)
    return {
        "days": days,
        "avg_protein": int(prot / days) if days else 0,
        "log_rate": round(days / span * 100),
    }


def _inbody_window(user_id: str, start: datetime, end: datetime) -> Optional[Dict[str, Any]]:
    """InBody：本季首筆 vs 最新（sports-science.md 規定至少 2 筆才談變化）。"""
    try:
        # InBody 紀錄的真相源在 workout_history.get_inbody_history（走 inbody_repo）
        from .workout_history import get_inbody_history
        recs = get_inbody_history(user_id) or []
    except Exception:
        return None
    rows = []
    for r in recs:
        d = _parse_ts(r.get("date") or r.get("created_at") or r.get("timestamp"))
        if d and start <= d < end:
            rows.append((d, r))
    if len(rows) < 2:
        return None
    rows.sort(key=lambda x: x[0])
    first, last = rows[0][1], rows[-1][1]

    def g(rec, *keys):
        for k in keys:
            v = rec.get(k)
            if v not in (None, ""):
                try:
                    return float(v)
                except Exception:
                    pass
        return None

    smm_a = g(first, "smm", "skeletal_muscle_mass")
    smm_b = g(last, "smm", "skeletal_muscle_mass")
    fat_a = g(first, "body_fat_percentage", "body_fat", "bodyfat")
    fat_b = g(last, "body_fat_percentage", "body_fat", "bodyfat")
    if smm_a is None or smm_b is None:
        return None
    return {
        "smm_delta": round(smm_b - smm_a, 1),
        "fat_delta": round(fat_b - fat_a, 1) if (fat_a is not None and fat_b is not None) else None,
        # 身體重組：肌↑且脂↓同時發生 —— 最珍貴的進步，值得最高規格慶祝
        "recomp": (smm_b > smm_a) and (fat_a is not None and fat_b is not None and fat_b < fat_a),
        "measurements": len(rows),
    }


# ═══════════════════════════════════════════════════════════════════════
# 教練文案生成 — 每一句都從真實數字推導，推導不出來就不寫
# ═══════════════════════════════════════════════════════════════════════

def _running_section(cur: Dict, prev: Dict, label: str, prev_label: str) -> Optional[Dict]:
    if cur["count"] == 0:
        return None

    metrics = [{"label": "季總里程", "value": str(cur["km"]), "unit": "km",
                "delta": _fmt_delta(_pct(cur["km"], prev.get("km", 0)))},
               {"label": "跑步次數", "value": str(cur["count"]), "unit": "次",
                "delta": _fmt_delta(_pct(cur["count"], prev.get("count", 0)))}]
    if cur.get("best_pace"):
        bp = cur["best_pace"]
        metrics.append({"label": "最快配速", "value": f"{bp // 60}:{bp % 60:02d}", "unit": "/km",
                        "delta": ""})
    else:
        metrics.append({"label": "最長單次", "value": str(cur["longest"]), "unit": "km", "delta": ""})

    # ── 進步判定：配速用「本季平均 vs 上季平均」，單次比較噪音太大 ──
    progress: List[str] = []
    if cur.get("avg_pace") and prev.get("avg_pace"):
        gain = prev["avg_pace"] - cur["avg_pace"]      # 秒/km，正 = 變快
        if gain >= 3:                                   # 3 秒/km 以上才算真的變快
            # 有感換算（sports-science.md）：同場 5K 快多少
            g5 = int(gain * 5)
            progress.append(
                f"平均配速比上季快了 {int(gain)} 秒/km —— 換算成同一場 5K，"
                f"等於快了 {g5 // 60} 分 {g5 % 60} 秒。"
            )
    km_pct = _pct(cur["km"], prev.get("km", 0))
    if km_pct is not None and km_pct >= 10:
        progress.append(f"季跑量成長 {km_pct}%，累積 {cur['km']} 公里。")

    # ── 處方：週跑量增幅 ≤10%/週 是防傷護欄 ──
    weekly = cur["km"] / 13 if cur["km"] else 0
    if km_pct is not None and km_pct > 40:
        direction = (
            f"這一季加量很快（+{km_pct}%）。下一季請把成長踩住在每週 +10% 以內，"
            f"目前週均約 {weekly:.0f} 公里，下季週均建議不超過 {weekly * 1.3:.0f} 公里。"
            "跑量的傷害通常不是來自跑太多，而是來自加太快。"
        )
    elif cur["count"] < 12:
        direction = (
            f"這一季跑了 {cur['count']} 次，平均約每兩週三次。"
            "下一季先把「頻率」墊到每週兩次固定跑 —— 規律比單次的強度更能推進有氧引擎。"
        )
    else:
        direction = (
            f"頻率已經穩定（{cur['count']} 次／季）。下一季可以開始分層："
            "每週一次節奏跑（比輕鬆跑快 20–30 秒/km）＋ 一次長跑，其餘維持輕鬆配速。"
        )

    insight = _compose(
        validation=f"這一季你出門跑了 {cur['count']} 次，累積 {cur['km']} 公里。",
        progress=progress,
        consolidation="配速與跑量都在原地附近 —— 這是鞏固期。有氧引擎的適應本來就慢，"
                      "穩定的重複刺激正在墊高你的底盤。",
    )
    return {"title": "跑步", "metrics": metrics, "insight": insight, "direction": direction,
            "has_progress": bool(progress)}


def _strength_section(cur: Dict, prev: Dict) -> Optional[Dict]:
    if cur["count"] == 0:
        return None

    vol_pct = _pct(cur["volume"], prev.get("volume", 0))
    metrics = [
        {"label": "季總訓練量", "value": f"{cur['volume']:,}", "unit": "kg", "delta": _fmt_delta(vol_pct)},
        {"label": "訓練次數", "value": str(cur["count"]), "unit": "次",
         "delta": _fmt_delta(_pct(cur["count"], prev.get("count", 0)))},
        {"label": "破 PR", "value": str(cur["prs"]), "unit": "項", "delta": ""},
    ]

    # ── 進步金字塔（由高到低，達標才寫）──
    progress: List[str] = []
    if cur["prs"] > 0:                                              # L1 絕對力量
        progress.append(f"這一季刷新了 {cur['prs']} 項個人紀錄。")
    if vol_pct is not None and vol_pct >= 3:                        # L3 訓練容量
        # 有感換算：訓練量翻成生活裡的重量
        tons = cur["volume"] / 1000
        progress.append(
            f"總訓練量比上季成長 {vol_pct}%，累積舉起 {tons:.1f} 公噸"
            f"（大約是 {max(int(tons / 5), 1)} 台小客車的重量）。"
        )

    # ── 處方 ──
    per_week = cur["count"] / 13
    if per_week < 2:
        direction = (
            f"目前週均 {per_week:.1f} 次。肌肉成長的關鍵門檻是「同肌群每週練到 2 次」，"
            "下一季先把頻率補到每週 3 練（推／拉／腿），比拉長單次時間有效得多。"
        )
    elif vol_pct is not None and vol_pct < -8:
        direction = (
            "這一季訓練量比上季下降較多。單季波動不代表退步 —— 先確認是不是"
            "工作或傷病期。下一季用「同重量每組多 1 下」的方式慢慢把量疊回來，不要一次追回。"
        )
    else:
        direction = (
            "下一季套雙重漸進：次數做到區間上限且 RPE≤8 就加重"
            "（下肢 +5kg、上肢 +2.5kg，次數回到區間下緣）；"
            "RPE 7–9 是最有效的增肌區間，不必每組都到力竭。"
        )

    insight = _compose(
        validation=f"這一季你進場 {cur['count']} 次，平均每次訓練量 {cur['avg_volume']:,} kg。",
        progress=progress,
        consolidation="訓練量與紀錄都在原地附近 —— 這是鞏固期，不是退步。"
                      "肌肉是在重複而穩定的刺激裡長出來的，不是在每次都破紀錄的那天。",
    )
    return {"title": "健身", "metrics": metrics, "insight": insight, "direction": direction,
            "has_progress": bool(progress)}


def _nutrition_section(cur: Dict, prev: Dict, weight_kg: Optional[float]) -> Optional[Dict]:
    if cur["days"] == 0:
        return None

    metrics = [
        {"label": "平均蛋白質", "value": str(cur["avg_protein"]), "unit": "g/日",
         "delta": _fmt_delta(_pct(cur["avg_protein"], prev.get("avg_protein", 0)))},
        {"label": "紀錄天數", "value": str(cur["days"]), "unit": "天",
         "delta": _fmt_delta(_pct(cur["days"], prev.get("days", 0)))},
        {"label": "紀錄率", "value": str(cur["log_rate"]), "unit": "%", "delta": ""},
    ]

    progress: List[str] = []
    d_days = cur["days"] - prev.get("days", 0)
    if d_days >= 10:
        progress.append(f"紀錄天數比上季多了 {d_days} 天 —— 習慣正在成形。")

    # ── 處方：蛋白質區間 1.6–2.2 g/kg（sports-science.md）──
    if weight_kg:
        target_lo = round(weight_kg * 1.6)
        target_hi = round(weight_kg * 2.2)
        if cur["avg_protein"] < target_lo:
            gap = target_lo - cur["avg_protein"]
            direction = (
                f"以你的體重，訓練期蛋白質建議落在 {target_lo}–{target_hi} g/日，"
                f"目前平均 {cur['avg_protein']} g，還差 {gap} g —— "
                f"大約是一份手掌大的雞胸（約 30 g）再加一杯無糖豆漿。"
            )
        else:
            direction = (
                f"蛋白質已經穩定落在建議區間（{target_lo}–{target_hi} g/日）。"
                "下一季把重點移到「時機」：訓練後 2 小時內同時補蛋白質與碳水，"
                "這段窗口對訓練成果的留存幫助最大。"
            )
    else:
        direction = (
            "先到個人檔案補上體重，教練才能算出你專屬的蛋白質區間"
            "（一般訓練期落在體重 ×1.6–2.2 g/日）。"
        )

    if cur["log_rate"] < 40:
        direction = (
            f"目前紀錄率 {cur['log_rate']}%，樣本還太少，數字容易失真。"
            "下一季先求「連續記 14 天」，不求記得完美 —— 有資料才有得調整。"
        )

    insight = _compose(
        validation=f"這一季你記錄了 {cur['days']} 天的飲食，平均每日蛋白質 {cur['avg_protein']} g。",
        progress=progress,
        consolidation="紀錄頻率與上季相當。飲食紀錄最難的從來不是準確，是持續。",
    )
    return {"title": "營養", "metrics": metrics, "insight": insight, "direction": direction,
            "has_progress": bool(progress)}


def _compose(validation: str, progress: List[str], consolidation: str) -> str:
    """教練語氣：肯定 → 進步（達標才講）→ 沒進步就誠實定調鞏固期。"""
    parts = [validation]
    if progress:
        parts.extend(progress)
    else:
        parts.append(consolidation)
    return " ".join(parts)


# ═══════════════════════════════════════════════════════════════════════
# 主入口
# ═══════════════════════════════════════════════════════════════════════

def generate_quarterly_review(user_id: str) -> Dict[str, Any]:
    """
    一份完全由真實資料推導的季回饋。

    與月報的分工：
      月報 = 這個月做了什麼（流水帳、單月成果）
      季報 = 三個月下來變成什麼樣的人（趨勢、斜率、下一季方向）

    資料不足 → 回 sufficient=False ＋ 說清楚還差多少，絕不用假資料填版。
    """
    now = datetime.now()
    q_start, q_end, label = _quarter_bounds(now)
    p_start, p_end, prev_label = _prev_quarter_bounds(now)

    run_cur = _running_window(user_id, q_start, q_end)
    run_prev = _running_window(user_id, p_start, p_end)
    lift_cur = _strength_window(user_id, q_start, q_end)
    lift_prev = _strength_window(user_id, p_start, p_end)
    nut_cur = _nutrition_window(user_id, q_start, q_end)
    nut_prev = _nutrition_window(user_id, p_start, p_end)
    inbody = _inbody_window(user_id, q_start, q_end)

    total_sessions = run_cur["count"] + lift_cur["count"]

    # ── 誠實空狀態：素材不夠就不生報告 ──
    if total_sessions < MIN_SESSIONS_FOR_REPORT:
        return {
            "period": {"label": label, "kind": "quarter", "prev_label": prev_label},
            "sufficient": False,
            "is_mock": False,
            "sessions": total_sessions,
            "needed": MIN_SESSIONS_FOR_REPORT,
            "message": (
                f"這一季目前累積 {total_sessions} 次訓練紀錄。"
                f"季報要看的是三個月的「趨勢」，至少需要 {MIN_SESSIONS_FOR_REPORT} 次才有意義 —— "
                "再少的話畫出來的線只是雜訊，不是你的變化。"
            ),
            "hint": "先看月報掌握單月狀況，季報會在素材足夠時自動出現。",
        }

    systems: Dict[str, Any] = {}
    sec = _running_section(run_cur, run_prev, label, prev_label)
    if sec:
        systems["running"] = sec
    sec = _strength_section(lift_cur, lift_prev)
    if sec:
        systems["strength"] = sec

    weight = None
    try:
        from . import coach_profile
        prof = coach_profile.get_user_profile(user_id) or {}
        weight = float(prof.get("weight_kg") or prof.get("weight") or 0) or None
    except Exception:
        pass
    sec = _nutrition_section(nut_cur, nut_prev, weight)
    if sec:
        systems["nutrition"] = sec

    # ── 季度 headline：講「這三個月最大的一件事」，只講真的 ──
    has_prev = (run_prev["count"] + lift_prev["count"]) > 0
    wins = [k for k, v in systems.items() if v.get("has_progress")]
    zh = {"running": "跑步", "strength": "健身", "nutrition": "營養"}

    if inbody and inbody.get("recomp"):
        headline = (
            f"這一季你完成了最難的一件事：身體重組。"
            f"骨骼肌 {'+' if inbody['smm_delta'] > 0 else ''}{inbody['smm_delta']} kg、"
            f"體脂 {inbody['fat_delta']}% —— 肌肉增加的同時脂肪下降，"
            "這比單純變重或變輕都珍貴得多。"
        )
    elif wins:
        names = "、".join(zh[w] for w in wins)
        headline = f"這一季的推進主要來自{names}。三個月的斜率是往上的。"
    elif has_prev:
        headline = (
            "這一季各項數字與上季相當 —— 這是鞏固期。"
            "訓練的長期曲線不是一路往上，而是「推進 → 鞏固 → 再推進」。"
            "你現在站在鞏固的那一段，下一次推進的底盤正在這裡打。"
        )
    else:
        headline = (
            f"這是你第一份完整的季報，累積了 {total_sessions} 次訓練。"
            "下一季開始就有得比了 —— 屆時這裡會告訴你三個月的斜率往哪走。"
        )

    # ── 下一季主軸：把各系統的處方濃縮成一句 ──
    if systems:
        focus = "、".join(f"{zh[k]}「{_short(v['direction'])}」" for k, v in systems.items())
        next_quarter = f"下一季主軸：{focus}。"
    else:
        next_quarter = ""

    evolution = None
    if inbody:
        parts = [f"本季 {inbody['measurements']} 次量測，骨骼肌 "
                 f"{'+' if inbody['smm_delta'] > 0 else ''}{inbody['smm_delta']} kg"]
        if inbody.get("fat_delta") is not None:
            parts.append(f"體脂 {'+' if inbody['fat_delta'] > 0 else ''}{inbody['fat_delta']}%")
        evolution = {
            "title": "身體組成變化",
            "narrative": "，".join(parts) + "。體重單獨的增減不評好壞，要搭配肌肉與脂肪一起看。",
            "recomp": inbody.get("recomp", False),
        }

    return {
        "period": {"label": label, "kind": "quarter", "prev_label": prev_label,
                   "has_baseline": has_prev},
        "sufficient": True,
        "is_mock": False,                 # 這份報告不再有任何 mock 成分
        "sessions": total_sessions,
        "headline": headline,
        "systems": systems,
        "evolution": evolution,
        "next_quarter": next_quarter,
    }


def _short(text: str, limit: int = 22) -> str:
    """把處方濃縮成 headline 用的短句。"""
    t = text.split("。")[0].split("——")[0].strip()
    return t[:limit] + ("…" if len(t) > limit else "")
