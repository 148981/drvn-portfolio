/**
 * ProgressiveTrainingSystem.js — v3  (Double Progression Model)
 *
 * 漸進超負荷策略 (按優先順序):
 *   Level +1  → 增加次數上限（推向區間上限，確保控制力）
 *   Level +2  → 整個次數區間往上位移（暗示此重量已掌握，準備加重）
 *   Level +3  → 再增加 1 組（突破平台的最後手段）
 *
 *   Level -1  → 降低次數下限（給更多空間完成動作）
 *   Level -2  → 整個次數區間往下位移
 *   Level -3  → 減少 1 組
 *
 *   Level  0  → 維持原始基準（BASE）
 *
 * 強度等級永遠相對於 _originalSnapshot（計劃載入時保存的快照），
 * 避免任何累積疊加問題。
 */

// ─── 常數 ───────────────────────────────────────────────────────────────────

const MIN_SETS       = 2;
const MAX_SETS       = 5;   // 文獻建議 3-5 正式組，上限設 5
const MIN_REPS_LOWER = 4;
const MIN_REST_SEC   = 45;
const MAX_REST_SEC   = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseReps(repsStr) {
    if (typeof repsStr === 'number') return { min: repsStr, max: repsStr, isTime: false };
    if (typeof repsStr !== 'string') return null;
    const match = repsStr.match(/^(\d+)-(\d+)$/);
    if (match) return { min: parseInt(match[1]), max: parseInt(match[2]), isTime: false };
    const single = repsStr.match(/^(\d+)$/);
    if (single) { const v = parseInt(single[1]); return { min: v, max: v, isTime: false }; }
    return { min: null, max: null, isTime: true, raw: repsStr };
}

function parseRest(restVal) {
    if (typeof restVal === 'number') return restVal;
    if (typeof restVal === 'string') {
        const n = parseInt(restVal.replace(/[^0-9]/g, ''));
        return isNaN(n) ? 90 : n;
    }
    return 90;
}

function formatRest(sec, originalVal) {
    if (typeof originalVal === 'string' && originalVal.includes('min')) {
        return `${Math.round(sec / 60)}min`;
    }
    return sec;
}

// ─── Double Progression adjustment ───────────────────────────────────────────

/**
 * Adjust a single exercise to match the target intensity level.
 * All values are calculated FROM the snapshot baseline, so there is no
 * accumulation — the same target level always produces the same result.
 *
 * @param {object} ex         - exercise object (mutated in place)
 * @param {number} targetLevel - absolute level relative to baseline (-3…+3)
 * @param {object} [snapEx]   - original exercise from _originalSnapshot
 * @returns {string[]}        - human-readable change descriptions
 */
function adjustExerciseByLevel(ex, targetLevel, snapEx) {
    const changes = [];
    if (targetLevel === 0) return changes; // BASE — no change

    // ── Source of truth: snapshot values (original plan) ─────────────────
    const baseRepsStr = snapEx?.reps ?? ex.reps;
    const baseSets    = parseInt(snapEx?.sets ?? ex.sets) || 3;
    const baseRest    = snapEx?.rest ?? ex.rest;

    const parsed = parseReps(baseRepsStr);

    // ── Reps ─────────────────────────────────────────────────────────────
    if (parsed && !parsed.isTime && parsed.min !== null) {
        let newMin = parsed.min;
        let newMax = parsed.max;

        if (targetLevel > 0) {
            // +1: Extend upper bound only → push toward limit at current weight
            // +2: Shift entire range up → weight increase implied, reps drop + climb
            // +3: Same as +2 (set added separately below)
            const repShift = Math.min(targetLevel, 2) * 2; // +2 per level, max +4
            newMax = parsed.max + repShift;
            if (targetLevel >= 2) newMin = parsed.min + 2; // shift lower bound only at +2
        } else {
            // -1: Lower the minimum (give room to recover form)
            // -2: Shift entire range down
            const absLevel = Math.abs(targetLevel);
            const repShift = Math.min(absLevel, 2) * 2;
            /* ⚠️ 降強度不可以讓上限變高：以前是 max(min+3, max−shift)，
               區間窄的動作（10-12）降一級反而變成 10-13。 */
            newMax = Math.min(parsed.max, Math.max(parsed.min + 1, parsed.max - repShift));
            if (absLevel >= 2) newMin = Math.max(MIN_REPS_LOWER, parsed.min - 2);
            /* 固定次數（"15"）降強度：往下給空間（15 → 13-15），不能變成 15-16 —— 那是加量 */
            if (parsed.min === parsed.max) { newMax = parsed.max; newMin = Math.max(MIN_REPS_LOWER, parsed.min - repShift); }
        }

        newMin = Math.max(MIN_REPS_LOWER, newMin);
        newMax = Math.max(newMin + 1, newMax);
        const newRepsStr = `${newMin}-${newMax}`;

        if (newRepsStr !== String(baseRepsStr)) {
            changes.push(`${ex.name} 次數 ${baseRepsStr}→${newRepsStr}`);
            ex.reps = newRepsStr;
        } else {
            // Ensure ex reflects snapshot (in case it was drifted)
            ex.reps = baseRepsStr;
        }
    }

    // ── Sets ──────────────────────────────────────────────────────────────
    // Sets only change at the extremes: +3 adds a set, -3 removes a set
    const setsDelta = targetLevel >= 3 ? 1 : targetLevel <= -3 ? -1 : 0;
    if (setsDelta !== 0) {
        const newSets = Math.min(MAX_SETS, Math.max(MIN_SETS, baseSets + setsDelta));
        if (newSets !== baseSets) {
            const label = setsDelta > 0
                ? `（平台突破：增加 1 組提升總訓練量）`
                : `（減量：降低 1 組保護恢復）`;
            changes.push(`${ex.name} 組數 ${baseSets}→${newSets}${label}`);
            ex.sets = newSets;
        } else {
            ex.sets = baseSets;
        }
    } else {
        ex.sets = baseSets; // restore to baseline sets
    }

    // ── Rest ─────────────────────────────────────────────────────────────
    // Shorter rest at higher intensity, longer rest when reducing load
    if (baseRest !== undefined) {
        const restFactor = targetLevel > 0
            ? Math.pow(0.92, Math.min(targetLevel, 3))   // up to ~25% shorter
            : Math.pow(1.08, Math.min(Math.abs(targetLevel), 3)); // up to ~25% longer
        const baseSec   = parseRest(baseRest);
        const newSec    = Math.round(baseSec * restFactor);
        const clamped   = Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, newSec));
        if (Math.abs(clamped - baseSec) >= 5) {
            changes.push(`${ex.name} 休息 ${baseSec}s→${clamped}s`);
            ex.rest = formatRest(clamped, baseRest);
        } else {
            ex.rest = baseRest;
        }
    }

    return changes;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Apply weekly feedback to a plan object, using the Double Progression Model.
 *
 * @param {object} plan           - full plan object (will be deep-cloned)
 * @param {string} feedback       - 'too_easy' | 'just_right' | 'too_hard'
 * @param {number} weekNumber     - 1-based week that just completed
 * @param {object} [options]
 * @param {boolean} [options.restoreFromSnapshot]
 *   If true, snapshot values are used as the baseline before applying.
 *   (Used when the user re-selects via the slider; prevents double application.)
 * @param {number}  [options.targetLevel]
 *   Absolute target intensity level (-3…+3). If omitted, the level is inferred
 *   from the current _intensityLevel + one step in the feedback direction.
 * @returns {{ plan: object, changes: string[], summary: object }}
 */
export function applyFeedbackToPlan(plan, feedback, weekNumber, options = {}) {
    if (!plan?.weeks?.length) return { plan, changes: [], summary: {} };

    const updatedPlan = JSON.parse(JSON.stringify(plan)); // deep clone
    // 沒有原始快照 → 現在就存一份。等級是「相對原始課表」的絕對值，
    // 沒有快照的話每週回饋都疊在上一週已經改過的值上，四週下來會越飄越遠。
    if (!updatedPlan._originalSnapshot) {
        updatedPlan._originalSnapshot = JSON.parse(JSON.stringify(updatedPlan.weeks));
    }

    // ── Determine target intensity level ─────────────────────────────────
    const currentLevel = updatedPlan._intensityLevel || 0;
    let targetLevel;

    if (options.targetLevel !== undefined) {
        // Explicit target from slider
        targetLevel = Math.max(-3, Math.min(3, options.targetLevel));
    } else {
        // Normal week-completion feedback: step ±1
        const step = feedback === 'too_easy' ? 1 : feedback === 'too_hard' ? -1 : 0;
        targetLevel = Math.max(-3, Math.min(3, currentLevel + step));
    }

    // ── Update plan metadata ──────────────────────────────────────────────
    const history = updatedPlan._feedbackHistory || [];
    // Remove stale entry for this week if re-applying
    const cleanHistory = history.filter(h => !(h.week === weekNumber && options.restoreFromSnapshot));
    cleanHistory.push({ week: weekNumber, feeling: feedback, level: targetLevel, date: new Date().toISOString() });
    updatedPlan._feedbackHistory   = cleanHistory;
    const prevIntensityLevel        = currentLevel;
    updatedPlan._intensityLevel    = targetLevel;

    if (feedback === 'just_right' && targetLevel === currentLevel) {
        // No exercise changes needed — plan is on track
        const summary = buildSummary(feedback, weekNumber, [], 1, updatedPlan.weeks.length, prevIntensityLevel, targetLevel);
        return { plan: updatedPlan, changes: [], summary };
    }

    // ── Apply to every week after the completed one ───────────────────────
    const changes = [];
    const targetWeekIndices = [];
    for (let i = weekNumber; i < updatedPlan.weeks.length; i++) {
        targetWeekIndices.push(i);
    }

    if (targetWeekIndices.length === 0) {
        updatedPlan._nextCycleFeedback = feedback;
    }

    targetWeekIndices.forEach((wIdx, loopIdx) => {
        const week    = updatedPlan.weeks[wIdx];
        const snapWk  = updatedPlan._originalSnapshot?.[wIdx];
        if (!week?.days) return;
        // 減量週是故意輕的：每週回饋不去動它（不然「太輕鬆」會把減量週加成一般週）
        if (/deload|taper|減量/i.test(String(week?.phase || ''))) return;

        // Fade: next week = full target, subsequent weeks = half the change from baseline
        // ⚠️ 以前用 Math.round(level / 2)：+1 → +1（0.5 進位）、−1 → 0（−0.5 進位成 −0），
        //    同樣一級、加跟減的衰減不對稱。改成對稱的「砍一半、往 0 取整」。
        const effectiveLevel = loopIdx === 0
            ? targetLevel
            : Math.sign(targetLevel) * Math.floor(Math.abs(targetLevel) / 2);

        week.days.forEach((day, di) => {
            if (!day?.exercises) return;
            const snapDay = snapWk?.days?.[di];
            day.exercises.forEach((ex, ei) => {
                const rawSnap = snapDay?.exercises?.[ei];
                // 快照要是同一個動作才用（課表被換過動作 → 用現在的值）
                // 組數基準要加回換季「加 1 組」的累積（_addedSets），跟 applyLevelToWholePlan 同一條規則 ——
                // 直接拿快照原始組數，每週回饋一套就把換季加上去的組數洗掉。
                const added = Number(ex._addedSets) || 0;
                const snapEx = rawSnap && rawSnap.name === ex.name
                    ? { ...rawSnap, sets: Math.max(2, (parseInt(rawSnap.sets, 10) || 3) + added) }
                    : undefined;
                const exChanges = adjustExerciseByLevel(ex, effectiveLevel, snapEx);
                if (loopIdx === 0) changes.push(...exChanges);
            });
        });
    });

    // Streak = how many consecutive same-direction feedbacks (for summary messaging)
    const streak = cleanHistory.slice(-3).filter(h => h.feeling === feedback).length;

    const summary = buildSummary(
        feedback, weekNumber, changes, streak,
        updatedPlan.weeks.length, prevIntensityLevel, targetLevel,
    );

    return { plan: updatedPlan, changes, summary };
}

/**
 * 換季用：把整份計劃（每一週）一律調到同一個強度等級。
 *
 * ⚠️ 不要拿 applyFeedbackToPlan 做換季。它是給「每週回饋」用的：
 *    只改「剛完成那週之後」的週，而且下一週全量、之後的週只套一半 ——
 *    等級 −1 的一半四捨五入是 0，於是第 3、4 週直接被還原成原樣。
 *    換季時使用者按的是「下一季降一級」，四週都要是同一個等級。
 *
 * @returns {{ plan: object, changes: string[] }} changes 只列第 1 週、每個動作一條（給畫面預告用）
 */
export function applyLevelToWholePlan(plan, targetLevel) {
    if (!plan?.weeks?.length) return { plan, changes: [] };
    const p = JSON.parse(JSON.stringify(plan));
    const lvl = Math.max(-3, Math.min(3, targetLevel));
    const changes = [];
    const seen = new Set();
    p.weeks.forEach((week, wi) => {
        // 減量週是故意輕的，加強度會把它變成一般週 —— 減量週一律不動
        if (/deload|taper|減量/i.test(String(week?.phase || ''))) return;
        const snapWk = p._originalSnapshot?.[wi];
        week?.days?.forEach((day, di) => {
            const snapDay = snapWk?.days?.[di];
            day?.exercises?.forEach((ex, ei) => {
                const rawSnap = snapDay?.exercises?.[ei];
                // 快照要是「同一個動作」才拿來當基準（課表被換過動作就用現在的值）；
                // 組數一律以現在為準，不然「加 1 組」的累積會被洗回原始組數。
                // 組數基準 = 原始組數 ＋ 換季「加 1 組」累積的（_addedSets）——
                // 不能直接拿現在的組數，否則等級 −3 每季都再扣一組，六季後整份課表剩兩組。
                const added = Number(ex._addedSets) || 0;
                const snap = rawSnap && rawSnap.name === ex.name
                    ? { ...rawSnap, sets: Math.max(2, (parseInt(rawSnap.sets, 10) || 3) + added) }
                    : { sets: ex.sets, reps: ex.reps, rest: ex.rest };
                const c = adjustExerciseByLevel(ex, lvl, snap);
                if (wi === 0 && c.length && !seen.has(ex.name)) { seen.add(ex.name); changes.push(c[0]); }
            });
        });
    });
    p._intensityLevel = lvl;
    return { plan: p, changes };
}

// ─── Summary builder ─────────────────────────────────────────────────────────

function buildSummary(feedback, weekNumber, changes, streak, totalWeeks, prevLevel, newLevel) {
    const remaining = totalWeeks - weekNumber;

    // Describe what the Double Progression stage this level represents
    const levelDescription = (lvl) => {
        if (lvl === 0)  return '基準';
        if (lvl === 1)  return '提升次數上限';
        if (lvl === 2)  return '次數區間上移（暗示加重時機）';
        if (lvl >= 3)   return '增加組數（突破平台）';
        if (lvl === -1) return '降低次數下限';
        if (lvl === -2) return '次數區間下移';
        if (lvl <= -3)  return '減少組數（減量保護）';
        return '';
    };

    const map = {
        too_easy: {
            headline: '強度已上調',
            subline: newLevel >= 3
                ? '已進入平台突破模式——增加組數以提升總訓練量。'
                : newLevel >= 2
                    ? '次數區間已整體上移，這是加重的信號——準備好挑戰更大重量。'
                    : '次數上限已提升，在當前重量下累積更多控制力。',
            directive: remaining > 0
                ? `調整策略：${levelDescription(newLevel)}（後續 ${Math.min(remaining, 2)} 週已套用）`
                : `最後一週完成——下週期以等級 ${newLevel} 為起點。`,
            icon: 'up',
            accentKey: 'too_easy',
        },
        just_right: {
            headline: '節奏完美',
            subline: '計劃正按雙重漸進法穩定推進，維持當前軌跡。',
            directive: remaining > 0
                ? `第 ${weekNumber + 1} 週將延續當前訓練等級`
                : '最後一週完成——恢復後準備下一週期。',
            icon: 'steady',
            accentKey: 'just_right',
        },
        too_hard: {
            headline: '強度已下調',
            subline: newLevel <= -3
                ? '已進入減量模式——組數降低，讓身體充分恢復。'
                : newLevel <= -2
                    ? '次數區間已整體下移，確保每組都能以標準姿勢完成。'
                    : '次數下限已降低，給動作控制更多空間。',
            directive: remaining > 0
                ? `調整策略：${levelDescription(newLevel)}（後續 ${Math.min(remaining, 2)} 週已套用）`
                : `最後一週完成——下週期以等級 ${newLevel} 為起點。`,
            icon: 'down',
            accentKey: 'too_hard',
        },
    };

    const entry = map[feedback] || map.just_right;

    return {
        ...entry,
        changes,
        streak,
        weekNumber,
        remaining,
        intensityLevel:     newLevel  ?? 0,
        prevIntensityLevel: prevLevel ?? 0,
    };
}

// ─── Legacy exports (kept for compatibility) ──────────────────────────────────

export const WEEKLY_PARAMETERS = {
    week1: {
        name: 'Base Week',
        focus: '動作學習、神經連結',
        rpeTarget: '6-7',
        rpeDescription: '保留 3-4 下',
        volumeMultiplier: 1.0,
        repsModifier: 0,
        setsModifier: 0,
        restModifier: 1.0,
        progressionNotes: '專注於動作品質，建立正確模式',
    },
    week2: {
        name: 'Build Week',
        focus: '增加代謝壓力、耐力',
        rpeTarget: '7-8',
        rpeDescription: '保留 2-3 下',
        volumeMultiplier: 1.0,
        repsModifier: +2,
        setsModifier: 0,
        restModifier: 0.85,
        progressionNotes: '增加次數，提高訓練密度',
    },
    week3: {
        name: 'Peak Week',
        focus: '強度最大化、挑戰極限',
        rpeTarget: '8-9',
        rpeDescription: '保留 1 下',
        volumeMultiplier: 1.0,
        repsModifier: +4,
        setsModifier: +1,
        restModifier: 1.0,
        progressionNotes: '達到週期高峰，最大化訓練量',
    },
    week4: {
        name: 'Deload Week',
        focus: '身體修復、準備下一週期',
        rpeTarget: '5-6',
        rpeDescription: '輕鬆做',
        volumeMultiplier: 0.7,
        repsModifier: 0,
        setsModifier: -1,
        restModifier: 1.2,
        progressionNotes: '減少總量，讓身體充分恢復',
    },
};

export function processWeeklyFeedback(feedback, weekNumber, currentLevels) {
    return {
        shouldLevelUp: weekNumber === 3 && feedback === 'too_easy',
        nextLevels: { ...currentLevels },
        message: '',
        intensityAdjustment: feedback === 'too_easy' ? 1.1 : feedback === 'too_hard' ? 0.9 : 1.0,
    };
}

// DELTA kept for any external consumers
export const DELTA = {
    too_easy:  { sets: +1, repsMin: +2, repsMax: +2, restFactor: 0.85 },
    just_right:{ sets:  0, repsMin: +1, repsMax: +1, restFactor: 1.0  },
    too_hard:  { sets: -1, repsMin: -2, repsMax: -2, restFactor: 1.15 },
};
