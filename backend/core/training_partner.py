"""
Training Partner AI
Generates personalized insights and recommendations based on user's training history
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any
import random

def generate_insights(user_id: str) -> List[Dict[str, Any]]:
    """
    Generate AI-powered training insights
    
    Args:
        user_id: User identifier
        
    Returns:
        List of insights with type, message, and metadata
    """
    from . import workout_history
    
    insights = []
    
    # Get recent workout data
    workouts = workout_history.get_user_workout_history(user_id, limit=30)
    
    if not workouts:
        return [{
            "type": "welcome",
            "message": "👋 嗨！開始你的第一次訓練吧！",
            "tone": "encouraging",
            "priority": "high"
        }]
    
    # Insight 1: PR Achievement Summary
    pr_insight = generate_pr_summary(workouts)
    if pr_insight:
        insights.append(pr_insight)
    
    # Insight 2: Training Volume Trend
    volume_insight = generate_volume_trend(workouts)
    if volume_insight:
        insights.append(volume_insight)
    
    # Insight 3: Consistency Check
    consistency_insight = check_consistency(workouts)
    if consistency_insight:
        insights.append(consistency_insight)
    
    # Insight 4: Focus Group Balance
    balance_insight = check_focus_balance(workouts)
    if balance_insight:
        insights.append(balance_insight)
    
    # Insight 5: Motivational Message
    if len(insights) < 3:
        insights.append(generate_motivational_message(workouts))
    
    return insights


def generate_pr_summary(workouts: List[Dict]) -> Dict[str, Any]:
    """Generate summary of recent PR achievements"""
    recent_prs = []
    cutoff_date = (datetime.now() - timedelta(days=30)).isoformat()
    
    for workout in workouts:
        if workout.get('timestamp', '') >= cutoff_date:
            pr_alerts = workout.get('pr_alerts', [])
            if pr_alerts:
                recent_prs.extend(pr_alerts)
    
    if recent_prs:
        pr_count = len(recent_prs)
        best_pr = max(recent_prs, key=lambda x: x.get('newPR', 0) - x.get('oldPR', 0))
        
        return {
            "type": "achievement",
            "message": f"🎉 本月你突破了 {pr_count} 個 PR！最佳突破：{best_pr.get('name')} {best_pr.get('oldPR')}kg → {best_pr.get('newPR')}kg",
            "data": {
                "pr_count": pr_count,
                "best_pr": best_pr
            },
            "tone": "celebrating",
            "priority": "high"
        }
    
    return None


def generate_volume_trend(workouts: List[Dict]) -> Dict[str, Any]:
    """Analyze training volume trend"""
    if len(workouts) < 4:
        return None
    
    # Compare recent 2 weeks vs previous 2 weeks
    recent = workouts[:7]
    previous = workouts[7:14] if len(workouts) >= 14 else []
    
    if not previous:
        return None
    
    recent_volume = sum(w.get('total_volume', 0) for w in recent)
    previous_volume = sum(w.get('total_volume', 0) for w in previous)
    
    if previous_volume == 0:
        return None
    
    change_percent = ((recent_volume - previous_volume) / previous_volume) * 100
    
    if abs(change_percent) > 10:
        direction = "增長" if change_percent > 0 else "下降"
        emoji = "📈" if change_percent > 0 else "📉"
        
        return {
            "type": "trend",
            "message": f"{emoji} 你的訓練容量{direction} {abs(change_percent):.1f}%（本週 {int(recent_volume/len(recent))} kg vs 上週 {int(previous_volume/len(previous))} kg）",
            "data": {
                "current": recent_volume,
                "previous": previous_volume,
                "change_percent": change_percent
            },
            "tone": "analytical",
            "priority": "medium"
        }
    
    return None


def check_consistency(workouts: List[Dict]) -> Dict[str, Any]:
    """Check training consistency and provide feedback"""
    if not workouts:
        return None
    
    latest_workout = workouts[0]
    latest_date = datetime.fromisoformat(latest_workout.get('timestamp', '')[:10])
    days_since = (datetime.now() - latest_date).days
    
    # Long time no train - reminder
    if days_since >= 4:
        return {
            "type": "reminder",
            "message": f"💪 已經 {days_since} 天沒訓練了，要不要來一組輕鬆的？保持習慣很重要！",
            "data": {"days_since": days_since},
            "tone": "gentle",
            "priority": "high"
        }
    
    # Great consistency
    if days_since <= 1 and len(workouts) >= 3:
        return {
            "type": "encouragement",
            "message": "🔥 你的訓練習慣超棒！保持這個節奏，進步會很明顯！",
            "tone": "encouraging",
            "priority": "medium"
        }
    
    return None


def check_focus_balance(workouts: List[Dict]) -> Dict[str, Any]:
    """Check if training is balanced across muscle groups"""
    recent_workouts = workouts[:10]
    
    focus_counts = {}
    for workout in recent_workouts:
        focus = workout.get('focus_group')
        if focus:
            focus_counts[focus] = focus_counts.get(focus, 0) + 1
    
    if not focus_counts:
        return None
    
    # Find neglected groups
    max_count = max(focus_counts.values())
    min_count = min(focus_counts.values())
    
    if max_count - min_count >= 3:
        most_trained = max(focus_counts, key=focus_counts.get)
        least_trained = min(focus_counts, key=focus_counts.get)
        
        return {
            "type": "suggestion",
            "message": f"💡 注意到你最近{most_trained}訓練較多（{focus_counts[most_trained]}次），{least_trained}較少（{focus_counts[least_trained]}次）。考慮平衡一下？",
            "data": {
                "focus_distribution": focus_counts
            },
            "action": "schedule_workout",
            "action_data": {"suggested_focus": least_trained},
            "tone": "advisory",
            "priority": "medium"
        }
    
    return None


def generate_motivational_message(workouts: List[Dict]) -> Dict[str, Any]:
    """Generate encouraging message"""
    messages = [
        "💪 每一次訓練都是進步！繼續加油！",
        "🎯 堅持就是勝利，你做得很好！",
        "🔥 今天也要全力以赴！",
        "⭐ 你比昨天的自己更強了！",
        "🚀 持續努力，目標就在前方！"
    ]
    
    return {
        "type": "motivation",
        "message": random.choice(messages),
        "tone": "encouraging",
        "priority": "low"
    }


# ============ Cardio-Specific AI with Dual Personality ============

class TrainingPartner:
    """AI Training Partner with dual personality for cardio workouts"""
    
    def __init__(self, mode: str = "coach"):
        """
        Initialize Training Partner
        Args:
            mode: "coach" (professional) or "buddy" (friendly)
        """
        self.mode = mode
    
    def generate_workout_insight(self, user_data: Dict, recent_workouts: List[Dict]) -> Dict:
        """Generate cardio workout insight with personality"""
        if not recent_workouts:
            return self._no_data_message()
        
        # Calculate basic metrics
        total_distance = sum(w.get('distance_km', 0) for w in recent_workouts)
        total_duration = sum(w.get('duration_seconds', 0) for w in recent_workouts)
        avg_pace = (total_duration / total_distance) if total_distance > 0 else 0
        
        # Basic insight
        if self.mode == "coach":
            message = f"最近 {len(recent_workouts)} 次訓練累積 {total_distance:.2f} 公里，平均配速 {int(avg_pace//60)}'{int(avg_pace%60)}\". 保持訓練節奏。"
        else:
            message = f"哇！最近 {len(recent_workouts)} 次跑了 {total_distance:.2f} 公里耶！💪 平均配速 {int(avg_pace//60)}'{int(avg_pace%60)}\",繼續加油！"
        
        recommendations = [
            "Consider increasing training distance by 10%",
            "Add interval training to improve speed",
            "Maintain current training intensity"
        ] if self.mode == "coach" else [
            "Try running a bit further~",
            "How about some exciting sprint workouts? 😄",
            "You're doing great! Keep it up!"
        ]
        
        return {
            "insight_type": "stable",
            "message": message,
            "metrics": {
                "total_distance_km": round(total_distance, 2),
                "total_duration_mins": round(total_duration / 60, 1),
                "avg_pace_per_km": round(avg_pace, 0),
                "workout_count": len(recent_workouts)
            },
            "recommendations": recommendations
        }
    
    def suggest_next_workout(self, user_profile: Dict, recovery_status: Dict) -> Dict:
        """Suggest next workout based on recovery"""
        recovery_scores = recovery_status.get('scores', {})
        avg_recovery = sum(recovery_scores.values()) / len(recovery_scores) if recovery_scores else 50
        
        if avg_recovery >= 80:
            workout_type = "intervals"
        elif avg_recovery >= 60:
            workout_type = "tempo"
        else:
            workout_type = "recovery"
        
        if self.mode == "coach":
            messages = {
                "intervals": f"恢復良好（{avg_recovery:.0f}%），建議間歇訓練。",
                "tempo": f"中等恢復（{avg_recovery:.0f}%），適合節奏跑。",
                "recovery": f"需要恢復（{avg_recovery:.0f}%），建議輕鬆跑。"
            }
        else:
            messages = {
                "intervals": f"恢復超好！({avg_recovery:.0f}%) 來點刺激的間歇！💨",
                "tempo": f"狀態不錯～({avg_recovery:.0f}%) 來個節奏跑吧！",
                "recovery": f"慢慢來～({avg_recovery:.0f}%) 今天輕鬆跑就好😊"
            }
        
        return {
            "workout_type": workout_type,
            "message": messages.get(workout_type, "建議休息"),
            "recovery_score": round(avg_recovery, 0)
        }
    
    def analyze_performance_trend(self, workout_history: List[Dict]) -> Dict:
        """Analyze performance trends"""
        if len(workout_history) < 3:
            return {"trend": "insufficient_data", "message": "需要更多數據"}
        
        if self.mode == "coach":
            message = f"訓練狀態穩定，完成 {len(workout_history)} 次訓練。"
        else:
            message = f"你已經完成 {len(workout_history)} 次訓練了！很棒！🎉"
        
        return {
            "distance_trend": "stable",
            "pace_trend": "stable",
            "message": message,
            "workout_frequency": len(workout_history),
            "consistency_score": 70
        }
    
    def generate_motivational_message(self, user_goals: List[Dict], progress: Dict) -> str:
        """Generate motivational message"""
        if self.mode == "coach":
            return "設定明確目標，持之以恆地訓練。"
        else:
            return "今天也要加油喔！💪 你可以的！"
    
    def _no_data_message(self) -> Dict:
        """Return message when no data"""
        if self.mode == "coach":
            message = "Insufficient training data. Start recording workouts to get personalized recommendations."
        else:
            message = "No training records yet! Start your first run! 🏃‍♂️"

        return {
            "insight_type": "no_data",
            "message": message,
            "metrics": {},
            "recommendations": ["Complete your first workout", "Set training goals", "Build consistent training habits"]
        }


# ============ Daily Insight（首頁每日一句） ============
# 把已經算好的重訓 + 跑步洞察，彙整成「一天一句」：當天穩定、隔天換新、優先挑高價值那句。

_PRIORITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}


def _cardio_daily_candidates(user_id: str) -> List[Dict[str, Any]]:
    """跑步側的每日 Insight 候選句（里程碑 / 進步 / 節奏）。"""
    out: List[Dict[str, Any]] = []
    try:
        from . import cardio_storage
    except Exception:
        return out
    try:
        sessions = cardio_storage.get_user_sessions(user_id, limit=30) or []
    except Exception:
        sessions = []
    if not sessions:
        return out

    def _m(s):
        return s.get("metrics", s) or {}

    def _dist(s):
        m = _m(s)
        return float(m.get("distance_km", m.get("distance", 0)) or 0)

    def _pace(s):
        m = _m(s)
        return float(m.get("pace_per_km", m.get("avgPace", 0)) or 0)

    def _dt(s):
        ts = s.get("created_at") or s.get("timestamp") or ""
        try:
            return datetime.fromisoformat(ts[:19]) if ts else None
        except Exception:
            return None

    now = datetime.now()

    # ① 本月里程 → 逼近 100km 里程碑（未完成感）
    month_km = sum(_dist(s) for s in sessions if (_dt(s) and _dt(s).year == now.year and _dt(s).month == now.month))
    if 0 < month_km < 100 and (100 - month_km) <= 25:
        remain = 100 - month_km
        out.append({
            "message": f"本月已跑 {month_km:.1f} km，再 {remain:.1f} km 就破 100 km——挑一天長跑收下它。",
            "type": "milestone", "tone": "motivating", "priority": "high", "source": "cardio",
        })

    # ② 最近兩次同類配速進步
    valid = [s for s in sessions if _pace(s) > 0 and _dist(s) >= 1]
    if len(valid) >= 2:
        p_new, p_old = _pace(valid[0]), _pace(valid[1])
        if p_old - p_new >= 3:  # 快 3 秒/km 以上才報，避免雜訊
            diff = int(round(p_old - p_new))
            out.append({
                "message": f"最近一次跑步的平均配速比上次快了 {diff} 秒/km，效率正在往上走。",
                "type": "progress", "tone": "praise", "priority": "high", "source": "cardio",
            })

    # ③ 近 7 天累積量（節奏肯定）
    week_km = sum(_dist(s) for s in sessions if (_dt(s) and (now - _dt(s)).days < 7))
    if week_km >= 10:
        out.append({
            "message": f"過去 7 天你累積了 {week_km:.1f} km，訓練節奏很穩，保持下去。",
            "type": "consistency", "tone": "encouraging", "priority": "medium", "source": "cardio",
        })

    return out


def _nutrition_daily_candidates(user_id: str) -> List[Dict[str, Any]]:
    """營養側的每日 Insight 候選句（今日蛋白質 vs 近一週平均）。"""
    out: List[Dict[str, Any]] = []
    try:
        from . import nutrition
    except Exception:
        return out
    try:
        hist = nutrition.get_nutrition_history(user_id, days=7) or []
    except Exception:
        return out
    if len(hist) < 3:
        return out

    def prot(d):
        return float((d.get("summary") or {}).get("protein", 0) or 0)

    today_p = prot(hist[-1])
    prev_ps = [prot(d) for d in hist[:-1] if prot(d) > 0]
    if today_p <= 0 or not prev_ps:
        return out
    avg_p = sum(prev_ps) / len(prev_ps)
    if avg_p <= 0:
        return out
    if today_p >= avg_p * 1.15:
        out.append({
            "message": f"今天蛋白質攝取 {int(today_p)}g，高於近一週平均——這對肌肉修復很有幫助。",
            "type": "nutrition", "tone": "praise", "priority": "medium", "source": "nutrition",
        })
    elif today_p <= avg_p * 0.7:
        out.append({
            "message": f"今天蛋白質只有 {int(today_p)}g，低於近期平均；補一份高蛋白，訓練成果更容易留住。",
            "type": "nutrition", "tone": "advisory", "priority": "medium", "source": "nutrition",
        })
    return out


def _streak_daily_candidate(user_id: str):
    """未完成感：連續訓練天數 → 「今天別斷」。"""
    dates = set()
    try:
        from . import workout_history
        for w in (workout_history.get_user_workout_history(user_id, limit=90) or []):
            ts = w.get("timestamp", "")
            if ts:
                dates.add(ts[:10])
    except Exception:
        pass
    try:
        from . import cardio_storage
        for s in (cardio_storage.get_user_sessions(user_id, limit=90) or []):
            ts = s.get("created_at") or s.get("timestamp") or ""
            if ts:
                dates.add(ts[:10])
    except Exception:
        pass
    if not dates:
        return None
    try:
        from . import gamification
        info = gamification.calculate_streak(sorted(dates))
        cur = int(info.get("current_streak", 0) or 0)
    except Exception:
        return None
    if cur >= 3:
        return {
            "message": f"🔥 已連續 {cur} 天有訓練——今天別讓這條連勝斷掉。",
            "type": "streak", "tone": "motivating", "priority": "high", "source": "consistency",
        }
    return None


def generate_daily_insight(user_id: str) -> Dict[str, Any]:
    """首頁「每日一句 Insight」：彙整重訓 + 跑步 + 營養 + 連續性，挑一句當天顯示。

    規則：當天穩定（同一天多次呼叫給同一句）、隔天輪替、優先挑高優先度那句。
    回傳單一 dict：{ message, type, tone, priority, source, has_data }
    """
    from datetime import date

    candidates: List[Dict[str, Any]] = []

    # 重訓側（沿用 generate_insights，已含 PR / 容量趨勢 / 連續性 / 肌群平衡）
    try:
        for ins in (generate_insights(user_id) or []):
            if ins.get("type") == "welcome" or not ins.get("message"):
                continue
            candidates.append({
                "message": ins.get("message"),
                "type": ins.get("type", "insight"),
                "tone": ins.get("tone", "analytical"),
                "priority": ins.get("priority", "medium"),
                "source": "strength",
            })
    except Exception:
        pass

    # 跑步側
    try:
        candidates.extend(_cardio_daily_candidates(user_id))
    except Exception:
        pass

    # 營養側
    try:
        candidates.extend(_nutrition_daily_candidates(user_id))
    except Exception:
        pass

    # 未完成感：連續天數
    try:
        streak_c = _streak_daily_candidate(user_id)
        if streak_c:
            candidates.append(streak_c)
    except Exception:
        pass

    candidates = [c for c in candidates if c.get("message")]

    if not candidates:
        return {
            "message": "今天是好日子——動一下，讓數據開始為你說話。",
            "type": "welcome", "tone": "encouraging", "priority": "low",
            "source": "none", "has_data": False,
        }

    # 依優先度排序，取「高價值池」，再用日期輪替（當天穩定、隔天換）
    candidates.sort(key=lambda c: _PRIORITY_WEIGHT.get(c.get("priority", "low"), 1), reverse=True)
    top_w = _PRIORITY_WEIGHT.get(candidates[0].get("priority", "low"), 1)
    pool = [c for c in candidates if _PRIORITY_WEIGHT.get(c.get("priority", "low"), 1) >= min(top_w, 2)] or candidates

    idx = date.today().toordinal() % len(pool)
    chosen = dict(pool[idx])
    chosen["has_data"] = True
    return chosen


# ============ Workout Summary（資深教練模型 v2） ============
# 證據導向的重訓結算總評，五大分析支柱：
#   1. 容量進步：同部位 vs 上一次 / 近 30 天最佳
#   2. 強度剖析：每動作最佳組 e1RM vs 歷史 e1RM、平均 RPE、有效組數（RPE≥7）
#   3. 負荷管理：近 7 天量 vs 近 28 天週均量（ACWR），過載 / 減量偵測
#   4. 恢復處方：主肌群 48–72 小時恢復窗
#   5. 下一步處方：雙重漸進（double progression）逐動作開藥單
# 輸出維持三段式（validation / progress / coaching）向後相容，另附 prescriptions[]。

_E1RM_REPS_CAP = 15  # Epley 外推超過 15 下誤差過大

def _epley_e1rm(weight: float, reps: int) -> float:
    """Epley 公式估 1RM；與前端趨勢頁同一套公式，reps 夾在 1–15。"""
    w = float(weight or 0)
    r = max(1, min(int(reps or 1), _E1RM_REPS_CAP))
    return w * (1 + r / 30.0) if w > 0 else 0.0


def _extract_session_exercises(record: Dict[str, Any]) -> List[Dict[str, Any]]:
    """從歷史紀錄抽出 [{name, sets:[{weight,reps,rpe}]}]，形狀寬鬆容錯。"""
    out = []
    for ex in (record.get("exercises") or []):
        name = ex.get("name") or ex.get("exercise_name")
        if not name:
            continue
        sets = ex.get("sets") or ex.get("detailedSets") or []
        rows = []
        for s in sets:
            if not isinstance(s, dict):
                continue
            try:
                w = float(s.get("weight", 0) or 0)
                r = int(float(s.get("reps", 0) or 0))
                rpe = float(s.get("rpe", 0) or 0)
            except (TypeError, ValueError):
                continue
            if w > 0 and r > 0:
                rows.append({"weight": w, "reps": r, "rpe": rpe})
        if rows:
            out.append({"name": name, "sets": rows})
    return out


def _analyze_load_management(history: List[Dict[str, Any]], total_volume: float) -> Dict[str, Any]:
    """近 7 天（含本次）vs 近 28 天週均量 → ACWR 區間判定。

    需要至少一筆「8–28 天前」的紀錄當基線，否則不判定
    （新用戶沒有慢性負荷基線，硬算 ACWR 會恆為 4.0 而誤報過載）。
    """
    now = datetime.now()
    vol_7d, vol_28d = total_volume, total_volume
    baseline_sessions = 0  # 8–28 天前的紀錄數（慢性負荷基線）
    for w in history:
        ts = w.get("timestamp", "")
        try:
            age_days = (now - datetime.fromisoformat(str(ts)[:19])).days
        except (ValueError, TypeError):
            continue
        v = float(w.get("total_volume", 0) or 0)
        if age_days <= 7:
            vol_7d += v
        if age_days <= 28:
            vol_28d += v
            if age_days > 7:
                baseline_sessions += 1
    weekly_avg = vol_28d / 4.0 if vol_28d > 0 else 0
    ratio = (vol_7d / weekly_avg) if (weekly_avg > 0 and baseline_sessions > 0) else None
    zone = None
    if ratio is not None:
        zone = "overload" if ratio > 1.5 else "caution" if ratio > 1.3 else "detraining" if ratio < 0.8 else "optimal"
    return {"acwr": round(ratio, 2) if ratio is not None else None, "zone": zone,
            "week_volume": int(vol_7d), "weekly_avg": int(weekly_avg)}


_MUSCLE_ZH = {"chest": "胸", "back": "背", "shoulders": "肩", "legs": "腿", "arms": "手臂", "core": "核心", "glutes": "臀"}


def generate_workout_summary(user_id: str, workout: Dict[str, Any]) -> Dict[str, Any]:
    """資深教練模型 v2：為剛結束的重訓產生證據導向的教練總評。

    workout 欄位：total_volume, focus_group, pr_alerts[], completed_sets, total_sets,
                  duration_seconds?, exercises?[{name, sets:[{weight,reps,rpe}]}]（真實逐組數據）
    （此時該筆通常尚未寫入歷史，故拿它與『過去的』歷史比較。）
    """
    try:
        from . import workout_history
    except Exception:
        workout_history = None

    total_volume = float(workout.get("total_volume", 0) or 0)
    focus = workout.get("focus_group") or ""
    pr_alerts = workout.get("pr_alerts") or []
    completed = float(workout.get("completed_sets", 0) or 0)
    planned = float(workout.get("total_sets", 0) or 0)
    completion = (completed / planned * 100) if planned > 0 else 100.0
    duration_s = float(workout.get("duration_seconds", 0) or 0)
    today_exercises = _extract_session_exercises(workout)

    try:
        history = workout_history.get_user_workout_history(user_id, limit=90) or [] if workout_history else []
    except Exception:
        history = []

    # 🩹 去重：結算頁呼叫時「本次紀錄」可能已先寫進歷史 → 會跟自己比（出現「比上次多 0%」）
    #    且 ACWR 近 7 天量會被重複計算。30 分鐘內、容量幾乎相同的紀錄視為本次，先剔除。
    def _is_current_session(w):
        try:
            ts = datetime.fromisoformat(str(w.get("timestamp", ""))[:19])
        except (ValueError, TypeError):
            return False
        v = float(w.get("total_volume", 0) or 0)
        return (datetime.now() - ts).total_seconds() < 1800 and abs(v - total_volume) < 1.0
    history = [w for w in history if not _is_current_session(w)]

    same_focus = [w for w in history if (w.get("focus_group") or "") == focus] if focus else []
    ref = same_focus or history

    # ── 支柱 1：容量與密度（與上次「同部位」比）──────
    last_vol = None
    last_density = None   # 上次的訓練密度 kg/min（同樣的量做更快 = 進步）
    for w in ref:
        v = float(w.get("total_volume", 0) or 0)
        if v <= 0:
            continue
        if last_vol is None:
            last_vol = v
        dmins = float(w.get("duration_mins", 0) or 0)
        if last_density is None and dmins > 0:
            last_density = v / dmins
        if last_vol is not None and last_density is not None:
            break
    vol_delta_pct = ((total_volume - last_vol) / last_vol * 100) if (last_vol and total_volume > 0) else None
    cur_density = (total_volume / (duration_s / 60.0)) if (duration_s >= 60 and total_volume > 0) else None
    density_delta_pct = ((cur_density - last_density) / last_density * 100) if (cur_density and last_density) else None

    cutoff = (datetime.now() - timedelta(days=30)).isoformat()
    recent_vols = [float(w.get("total_volume", 0) or 0) for w in ref if (w.get("timestamp", "") >= cutoff)]
    is_30d_best = total_volume > 0 and (not recent_vols or total_volume >= max(recent_vols))

    # ── 支柱 2：強度剖析（真實逐組數據）───────────────
    all_rpes = [s["rpe"] for ex in today_exercises for s in ex["sets"] if s["rpe"] > 0]
    avg_rpe = round(sum(all_rpes) / len(all_rpes), 1) if all_rpes else None
    hard_sets = sum(1 for ex in today_exercises for s in ex["sets"] if s["rpe"] >= 7)

    # 歷史各動作最佳 e1RM（近 90 天）
    hist_e1rm: Dict[str, float] = {}
    for rec in history:
        for ex in _extract_session_exercises(rec):
            best = max((_epley_e1rm(s["weight"], s["reps"]) for s in ex["sets"]), default=0)
            if best > hist_e1rm.get(ex["name"], 0):
                hist_e1rm[ex["name"]] = best

    # 本次每動作：最佳組 e1RM、頂組、對比歷史
    ex_analysis = []
    for ex in today_exercises:
        top = max(ex["sets"], key=lambda s: _epley_e1rm(s["weight"], s["reps"]))
        cur_e1rm = _epley_e1rm(top["weight"], top["reps"])
        prev = hist_e1rm.get(ex["name"], 0)
        delta = ((cur_e1rm - prev) / prev * 100) if prev > 0 else None
        vol = sum(s["weight"] * s["reps"] for s in ex["sets"])
        ex_analysis.append({"name": ex["name"], "top_set": top, "e1rm": round(cur_e1rm, 1),
                            "e1rm_delta_pct": round(delta, 1) if delta is not None else None, "volume": vol})
    ex_analysis.sort(key=lambda x: -x["volume"])
    e1rm_gainer = max((e for e in ex_analysis if e["e1rm_delta_pct"] is not None),
                      key=lambda e: e["e1rm_delta_pct"], default=None)

    # ── 支柱 3：負荷管理（ACWR）─────────────────────
    load = _analyze_load_management(history, total_volume)

    # ── 支柱 5：下一步處方（雙重漸進，取容量前 2 大主項）──
    #    每一條都要「精確 + 白話」：講清楚下次多少公斤、幾下、為什麼。
    prescriptions: List[str] = []
    exercise_notes: Dict[str, str] = {}  # 🆕 動作級回饋：下次做到同動作時，訓練面板會顯示這則提醒
    for e in ex_analysis[:2]:
        top = e["top_set"]
        rpe = top["rpe"] or 8
        is_lower = any(k in str(e["name"]) for k in ("Squat", "Deadlift", "Leg", "Lunge", "深蹲", "硬舉", "腿", "臀"))
        inc = 5 if is_lower else 2.5
        if top["reps"] >= 12 and rpe <= 8:
            note = f"已達次數上限且還有餘力（RPE {rpe:g}），下次加重到 {top['weight'] + inc:g}kg，次數先回到區間下緣（例如 8 下），再慢慢做回上限。"
        elif rpe >= 9.5 and top["reps"] <= 6:
            note = f"頂組已接近力竭（RPE {rpe:g}），下次降 5% 重量（約 {round(top['weight'] * 0.95 * 2) / 2:g}kg），把每組次數做滿，先累積訓練量再衝重量。"
        elif top["reps"] >= 8 and rpe <= 8.5:
            note = f"保持 {top['weight']:g}kg，下次每組多做 1 下（做到 {top['reps'] + 1} 下）。做滿次數上限後再加重，這就是最穩的漸進方式。"
        else:
            note = f"維持 {top['weight']:g}kg，把每一下的動作品質做穩。費力程度（RPE）落在 7–9 是最有效的增肌區間。"
        prescriptions.append(f"{e['name']}：{note}")
        exercise_notes[str(e["name"])] = note

    # ── 支柱 4：恢復處方 ─────────────────────────────
    focus_zh = _MUSCLE_ZH.get(str(focus).lower(), focus)
    recovery_note = f"{focus_zh}群給足 48–72 小時再練，期間可安排其他部位或低強度有氧。" if focus else \
        "同一肌群給足 48–72 小時恢復，期間可練其他部位。"

    pr_count = len(pr_alerts)
    focus_label = focus_zh or "訓練"

    # ── 語氣定調（PR > e1RM 進步 > 容量進步 > 過載警示 > 節制 > 穩定）──
    if pr_count > 0:
        tone = "celebrating"
    elif e1rm_gainer and e1rm_gainer["e1rm_delta_pct"] >= 2:
        tone = "praise"
    elif vol_delta_pct is not None and vol_delta_pct >= 3:
        tone = "praise"
    elif load["zone"] in ("overload", "caution"):
        tone = "cautioning"
    elif vol_delta_pct is not None and vol_delta_pct <= -8:
        tone = "supportive"
    else:
        tone = "steady"

    # ── ① Validation（肯定）──
    if tone == "supportive":
        validation = "今天狀態不在高點還是把課上完了——願意出現，這件事本身就值得肯定。"
    elif pr_count > 0:
        validation = "今天做得非常好，一堂課就刷新了個人紀錄。"
    elif completion >= 100:
        validation = "今天做得很好，計劃組數全數完成，執行力很紮實。"
    elif completion >= 80:
        validation = f"今天做得不錯，完成了 {completion:.0f}% 的計劃，收尾穩定。"
    else:
        validation = "今天有出現、有累積，這就是往前的一步。"

    # ── ② Progress（進步）— 教練進步判定金字塔 ────────────────────────
    # 「進步」只認以下五層之一（由高到低），全部用真實數據、達標才寫；
    # 沒達標的指標絕不包裝成進步（不再出現「比上次多 0%」這種話）：
    #   L1 絕對力量：單動作最大重量刷新（PR）
    #   L2 估算力量：最佳組 e1RM 比近 90 天歷史最佳高 ≥2%
    #   L3 訓練容量：總容量比上次同部位 ≥+3%（±3% 視為持平＝鞏固，不是進步）
    #   L4 里程碑：近 30 天同部位容量最佳的一次
    #   L5 訓練密度：kg/分 比上次快 ≥+5%（同樣的量做得更快，也是變強）
    # 佐證數據（有效組數 / 平均 RPE）只當「訓練品質證據」附在後面，不冒充進步。
    # 五層全落空 → 誠實定調為「鞏固期」，講清楚守住的價值與差距在哪。
    prog_parts: List[str] = []
    if pr_count > 0:   # L1
        best = max(pr_alerts, key=lambda x: (x.get("newPR", 0) or 0) - (x.get("oldPR", 0) or 0))
        prog_parts.append(f"破了 {pr_count} 個 PR，最亮眼是 {best.get('name')} {best.get('oldPR')}→{best.get('newPR')}kg")
    if e1rm_gainer and e1rm_gainer["e1rm_delta_pct"] >= 2 and pr_count == 0:   # L2
        prog_parts.append(f"{e1rm_gainer['name']} 的估算 1RM 比歷史最佳高 {e1rm_gainer['e1rm_delta_pct']:.0f}%（{e1rm_gainer['e1rm']:g}kg）")
    if vol_delta_pct is not None and vol_delta_pct >= 3:   # L3
        prog_parts.append(f"總容量 {int(total_volume)}kg，比上次同部位多 {vol_delta_pct:.0f}% — 紮實的容量進步")
    if is_30d_best and total_volume > 0 and pr_count == 0 and len(recent_vols) >= 2:   # L4
        prog_parts.append(f"是近 30 天最強的一次{focus_label}")
    if density_delta_pct is not None and density_delta_pct >= 5 and (vol_delta_pct is None or vol_delta_pct > -3):   # L5
        prog_parts.append(f"訓練密度 {cur_density:.0f} kg/分，比上次快 {density_delta_pct:.0f}% — 同樣的量做得更有效率")

    made_progress = len(prog_parts) > 0

    # 佐證數據：訓練品質證據（不是進步宣稱）
    evidence: List[str] = []
    if avg_rpe is not None and hard_sets > 0:
        evidence.append(f"{hard_sets} 個有效組（費力程度 RPE≥7），平均 RPE {avg_rpe:g} — 強度落在有效增肌區間")

    if not made_progress:
        # 鞏固期：不硬掰進步，講清楚現況與守住的價值
        if vol_delta_pct is not None and -3 <= vol_delta_pct <= 3:
            prog_parts.append(
                f"總容量 {int(total_volume)}kg，與上次同部位持平（{vol_delta_pct:+.1f}%）— "
                "這是鞏固期：肌肉在「重複而穩定的刺激」中成長，守住重量與品質，下一步就有加量空間")
        elif vol_delta_pct is not None and vol_delta_pct < -3:
            prog_parts.append(
                f"總容量 {int(total_volume)}kg，比上次少 {abs(vol_delta_pct):.0f}% — "
                "單日的減量是正常波動，看趨勢不看單點；把動作品質顧好比硬撐容量更重要")
        elif total_volume > 0:
            prog_parts.append(f"總容量 {int(total_volume)}kg — 這是{focus_label}的第一筆基準，下次開始就能量化比較進步")
        else:
            prog_parts.append("本次資料不足以比較進步幅度，多記錄幾次就能看出趨勢")

    prog_parts.extend(evidence)
    progress = ("、".join(prog_parts) + "。") if prog_parts else "本次資料不足以比較進步幅度，多記錄幾次就能看出趨勢。"
    # 🆕 列點版：前端逐條渲染（每點一句、講一件事）
    progress_points = [p + ("" if p.endswith("。") else "。") for p in prog_parts] or [progress]

    # ── ③ Coaching（教練）— 負荷判讀 + 恢復 + 逐動作處方（列點，每點講一件事）──
    coach_parts: List[str] = []
    if load["zone"] == "overload" and load["acwr"]:
        coach_parts.append(f"注意：近 7 天訓練量是月均的 {load['acwr']:.1f} 倍，受傷風險上升，接下來 2–3 天把量收回來。")
    elif load["zone"] == "caution" and load["acwr"]:
        coach_parts.append(f"近 7 天負荷偏高（急慢性比 {load['acwr']:.1f}），加量先踩住，維持強度即可。")
    elif load["zone"] == "detraining" and load["acwr"]:
        coach_parts.append("近期訓練量低於身體習慣的水準，可以放心把頻率補回來。")
    if tone == "supportive":
        coach_parts.append("偏疲勞的一天，恢復也是訓練的一部分；下一步先回到原本重量、把動作做扎實，別急著加量。")
    if prescriptions:
        # 逐動作各自一點（不再擠成一長句），下次做到該動作時訓練面板也會提醒
        for p in prescriptions:
            coach_parts.append(f"下一步 · {p}")
    elif tone in ("celebrating", "praise"):
        coach_parts.append("維持這個強度就好，把重點放在動作品質與組間充分恢復，讓進步穩定累積。")
    else:
        coach_parts.append("下一步：挑 1–2 個主項各加 2.5kg 或多做 1 下，用漸進超負荷慢慢往上堆。")
    coach_parts.append(recovery_note)
    coaching = " ".join(coach_parts)

    return {
        # 三段式、已排序：肯定 → 進步 → 教練（前端照此順序渲染）
        "validation": validation,
        "progress": progress,
        "coaching": coaching,
        # 🆕 列點版（前端優先用這兩個渲染成 bullet list）
        "progress_points": progress_points,
        "coaching_points": coach_parts,
        # 🆕 動作級回饋：{動作名: 白話提醒}，前端存起來，下次訓練做到該動作時顯示
        "exercise_notes": exercise_notes,
        "summary": f"{validation} {progress} {coaching}",
        "lines": [validation, progress, coaching],
        "tone": tone,
        "prescriptions": prescriptions,
        "metrics": {
            "total_volume": int(total_volume),
            "volume_delta_pct": round(vol_delta_pct, 1) if vol_delta_pct is not None else None,
            "density_delta_pct": round(density_delta_pct, 1) if density_delta_pct is not None else None,
            "made_progress": made_progress,   # 🆕 金字塔五層任一達標才 True（前端徽章依此顯示）
            "pr_count": pr_count,
            "completion": round(completion),
            "is_30d_best": bool(is_30d_best),
            "avg_rpe": avg_rpe,
            "hard_sets": hard_sets,
            "acwr": load["acwr"],
            "acwr_zone": load["zone"],
            "density_kg_per_min": round(total_volume / (duration_s / 60), 1) if duration_s >= 60 and total_volume > 0 else None,
            "top_exercise": ex_analysis[0]["name"] if ex_analysis else None,
        },
        "has_history": bool(last_vol),
    }

