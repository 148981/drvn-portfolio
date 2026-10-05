/**
 * StrengthSessionDetailMobile — 「該次重訓」的結果頁（歷史檢視版）
 * ────────────────────────────────────────────────────────────────
 * 從最新動態（ActivityFeedMobile）點一張重訓卡進來：
 *   • 主體：StrengthResultsMobile（圖四同款瑞士極簡結算頁），數據全部來自
 *     該筆真實紀錄（總容量 / 組數 / 時間 / 卡路里 / 逐組菜單）。
 *   • 「分享成果」→ EvolutionCompletionCard（Feature / Peak / Report 三張卡選擇頁）。
 *   • location.state.openShare = true 時（動態卡上直接按分享）→ 直接開分享頁。
 */
import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import StrengthResultsMobile from './StrengthResultsMobile';
import EvolutionCompletionCard from './EvolutionCompletionCard';
import { parseExercises, parsePrAlerts } from '../utils/prMedals';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// 把歷史紀錄（後端 workout_history / 本機 trainingRecords 兩種形狀）攤平成結算頁 props
const normalizeRecord = (rec = {}) => {
    /* ⚠️ 使用者回報「分享按完返回會找不到頁面」的真正成因：
       後端把 exercises 存成 **JSON 字串**，而這裡直接 (rec.exercises || []).map(...)。
       字串沒有 .map → TypeError → 整頁白掉，看起來就像「頁面不見了」。
       點卡片那條路徑有解字串、分享那條沒有，所以只有分享會炸。
       改走共用的 parseExercises，兩條路徑吃同一份解析。 */
    const exercises = parseExercises(rec).map(ex => ({
        name: ex.name || ex.exercise_name || 'Exercise',
        sets: (Array.isArray(ex.sets) && ex.sets.length ? ex.sets : (ex.detailedSets || []))
            .filter(s => s && s.completed !== false && (s.completed || (s.weight && s.reps)))   // 明確標記未完成的組不能被當成完成
            .map(s => ({ ...s, completed: true })),
    })).filter(ex => ex.sets.length > 0);

    const completedSets = num(rec.completed_sets_count ?? rec.completed_sets)
        || exercises.reduce((a, ex) => a + ex.sets.length, 0);

    // PR 標記：用該筆紀錄存下的 pr_alerts 還原（歷史檢視沒有即時 PR 資料）。
    //   結算頁的 isPR 判定是 maxW > exercisePRs[name] → 這裡反向建表：
    //   有 PR 的動作給 oldPR（必小於 maxW → true），其他動作給自身 maxW（→ false）。
    const prAlerts = parsePrAlerts(rec);
    const prByName = new Map(prAlerts.map(a => [a.name || a.exercise, num(a.oldPR)]));
    const exercisePRs = {};
    exercises.forEach(ex => {
        const maxW = Math.max(0, ...ex.sets.map(s => num(s.weight)));
        exercisePRs[ex.name] = prByName.has(ex.name) ? Math.min(prByName.get(ex.name), Math.max(0, maxW - 0.1)) : maxW;
    });

    return {
        exercises,
        exercisePRs,
        completedSets,
        totalSets: num(rec.total_sets) || completedSets,
        durationSeconds: num(rec.duration_seconds) || num(rec.duration_mins ?? rec.duration_min) * 60,
        calories: num(rec.calories ?? rec.metrics?.calories),
        intensity: num(rec.intensity ?? rec.metrics?.intensity),
        heartRate: num(rec.heart_rate ?? rec.metrics?.heart_rate),
        focusGroup: rec.focus_group || '',
        locationName: rec.location_name || rec.locationName || '',
        completedDate: rec.timestamp || rec.date || new Date(),
    };
};

const StrengthSessionDetailMobile = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const record = location.state?.record || {};
    const [showShare, setShowShare] = useState(!!location.state?.openShare);

    const data = useMemo(() => normalizeRecord(record), [record]);

    const goBack = () => {
        const from = location.state?.from;
        if (from) navigate(from);
        else navigate(-1);
    };

    /* 從動態卡直接按分享進來的（openShare）：關掉分享頁就該回動態，
       而不是掉到一個「我沒點過的」結算頁 —— 那正是使用者說的「找不到頁面」。
       從結算頁自己按分享的，關掉就回結算頁（原行為）。 */
    const closeShare = () => {
        if (location.state?.openShare) goBack();
        else setShowShare(false);
    };

    return (
        <div style={{ maxWidth: '430px', margin: '0 auto', position: 'relative' }}>
            {showShare ? (
                <EvolutionCompletionCard
                    exercises={data.exercises}
                    durationSeconds={data.durationSeconds}
                    calories={data.calories}
                    completedSets={data.completedSets}
                    totalSets={data.totalSets}
                    heartRate={data.heartRate}
                    exercisePRs={data.exercisePRs}
                    completedDate={data.completedDate}
                    locationName={data.locationName}
                    onExit={closeShare}
                    onShare={() => { }}
                    backTo={location.state?.from || null}
                />
            ) : (
                <StrengthResultsMobile
                    exercises={data.exercises}
                    durationSeconds={data.durationSeconds}
                    calories={data.calories}
                    completedSets={data.completedSets}
                    totalSets={data.totalSets}
                    heartRate={data.heartRate}
                    intensity={data.intensity}
                    exercisePRs={data.exercisePRs}
                    focusGroup={data.focusGroup}
                    completedDate={data.completedDate}
                    onExit={goBack}
                    onShare={() => setShowShare(true)}
                />
            )}
        </div>
    );
};

export default StrengthSessionDetailMobile;
