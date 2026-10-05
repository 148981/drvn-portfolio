// weeklyInsights.js — 每週洞察的純邏輯（抽出以便單元測試）
// ──────────────────────────────────────────────────────────────
// 輸入：trainingRecords（{id: record} 或 array）、muscleRecoveryScores
// 輸出：{ aiAdvice, volumeAnalysis, weeklyPerformance, recoveryStatus, recommendations }
// 原則：只用真實數據，不用假預設值；建議依實際數據產生。

const MUSCLE_ZH = { chest: '胸部', back: '背部', legs: '腿部', arms: '手臂', shoulders: '肩膀', core: '核心' };

const recordDate = (r) => new Date(r.date || r.timestamp || 0);

/** 計算某時間範圍內的紀錄 */
function recordsBetween(records, start, end) {
    return records.filter((r) => {
        const d = recordDate(r);
        return d >= start && d <= end;
    });
}

/**
 * 建立每週洞察。
 * @param {object|array} trainingRecordsRaw
 * @param {object} muscleRecoveryScores  { muscle: 0-100 }
 * @param {Date} now
 */
export function buildWeeklyInsights(trainingRecordsRaw, muscleRecoveryScores = {}, now = new Date()) {
    // 物件格式時 key 通常就是日期（'YYYY-MM-DD'），紀錄本身缺 date 欄位時用 key 補上
    const records = Array.isArray(trainingRecordsRaw)
        ? trainingRecordsRaw
        : Object.entries(trainingRecordsRaw || {}).map(([key, r]) => ({
            ...r,
            date: r?.date || r?.timestamp || key,
        }));

    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const weekRecords = recordsBetween(records, weekStart, now);

    // ── 本週訓練量 + 逐肌群 ──
    let totalVolume = 0;
    const muscleVolumes = {};
    weekRecords.forEach((r) => {
        const recVol = Number(r.volume) || 0;
        totalVolume += recVol;
        if (Array.isArray(r.muscles) && r.muscles.length) {
            r.muscles.forEach((m) => { muscleVolumes[m] = (muscleVolumes[m] || 0) + recVol / r.muscles.length; });
        }
    });
    const volumeBreakdown = Object.entries(muscleVolumes)
        .map(([muscle, volume]) => ({
            muscle: muscle.charAt(0).toUpperCase() + muscle.slice(1),
            muscleKey: muscle,
            volume: Math.round(volume),
            percentage: totalVolume > 0 ? +((volume / totalVolume) * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

    // ── 前 4 週的「每週平均訓練量」→ 相對化的加量/減量判斷 ──
    const fourWeeksAgo = new Date(weekStart); fourWeeksAgo.setDate(weekStart.getDate() - 28);
    const prior = recordsBetween(records, fourWeeksAgo, weekStart);
    const priorWeeklyAvg = prior.reduce((s, r) => s + (Number(r.volume) || 0), 0) / 4;

    // ── AI 總建議：優先跟「自己過去 4 週平均」比，沒有歷史才用絕對門檻 ──
    let aiAdvice = { type: 'maintain', message: '保持狀態', detail: '本週表現穩定，繼續保持當前的訓練節奏。' };
    if (totalVolume > 0) {
        if (priorWeeklyAvg >= 1000) {
            const ratio = totalVolume / priorWeeklyAvg;
            if (ratio >= 1.5) aiAdvice = {
                type: 'deload', message: '建議減量',
                detail: `本週訓練量 ${Math.round(totalVolume).toLocaleString()}kg，是你過去 4 週平均（${Math.round(priorWeeklyAvg).toLocaleString()}kg）的 ${ratio.toFixed(1)} 倍。單週暴增容易累積疲勞，建議下週回到平均量附近。`,
            };
            else if (ratio <= 0.6) aiAdvice = {
                type: 'intensify', message: '可增加強度',
                detail: `本週訓練量 ${Math.round(totalVolume).toLocaleString()}kg，低於過去 4 週平均的六成。狀態允許的話，下週把量補回來。`,
            };
            else aiAdvice = {
                type: 'maintain', message: '保持狀態',
                detail: `本週 ${Math.round(totalVolume).toLocaleString()}kg，貼近你過去 4 週的平均節奏。建議下週嘗試小幅漸進超負荷（+2.5–5%）。`,
            };
        } else {
            // 無足夠歷史 → 絕對門檻 fallback
            if (totalVolume > 20000) aiAdvice = { type: 'deload', message: '建議減量', detail: `本週訓練量達 ${Math.round(totalVolume).toLocaleString()}kg，量很大，建議下週安排減量週。` };
            else if (totalVolume > 12000) aiAdvice = { type: 'maintain', message: '保持狀態', detail: `總訓練量 ${Math.round(totalVolume).toLocaleString()}kg，在理想範圍內。建議下週嘗試漸進式超負荷。` };
            else aiAdvice = { type: 'intensify', message: '可增加強度', detail: `本週訓練量 ${Math.round(totalVolume).toLocaleString()}kg，還有上升空間。建議增加輔助動作。` };
        }
    } else {
        aiAdvice = { type: 'intensify', message: '重新啟動', detail: '本週還沒有訓練紀錄，安排一次輕量訓練找回節奏吧。' };
    }

    // ── 恢復狀態 ──
    const recoveryGroups = Object.entries(muscleRecoveryScores).map(([name, score]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        nameKey: name,
        recovery: Math.round(score),
        status: score >= 80 ? 'ready' : score >= 50 ? 'moderate' : 'low',
    }));
    const avgRecovery = recoveryGroups.length
        ? Math.round(recoveryGroups.reduce((s, g) => s + g.recovery, 0) / recoveryGroups.length)
        : null; // 沒資料就是沒資料，不給假 85

    // ── 建議（依真實數據） ──
    const recommendations = [];
    let id = 1;
    const workoutsCount = weekRecords.length;
    if (workoutsCount >= 3) recommendations.push({
        id: id++, type: 'maintain', priority: 'low', category: 'consistency',
        title: '保持訓練頻率', description: `本週已完成 ${workoutsCount} 次訓練，頻率良好，建議繼續維持。`, impact: '穩定進步',
    });
    else if (workoutsCount > 0) recommendations.push({
        id: id++, type: 'intensify', priority: 'medium', category: 'consistency',
        title: '提高訓練頻率', description: `本週僅 ${workoutsCount} 次訓練，建議安排至少 3 次，讓刺激更連續。`, impact: '加速進步',
    });
    if (volumeBreakdown.length >= 2) {
        const top = volumeBreakdown[0];
        const bottom = volumeBreakdown[volumeBreakdown.length - 1];
        if (top.percentage >= 45 && bottom.percentage < 15) {
            recommendations.push({
                id: id++, type: 'intensify', priority: 'medium', category: 'volume',
                title: `加強${MUSCLE_ZH[bottom.muscleKey] || bottom.muscle}訓練`,
                description: `${MUSCLE_ZH[top.muscleKey] || top.muscle} 佔了 ${top.percentage}% 的訓練量，而 ${MUSCLE_ZH[bottom.muscleKey] || bottom.muscle} 僅 ${bottom.percentage}%。建議下週補 1–2 個該部位動作，維持全身平衡。`,
                impact: '全身平衡',
            });
        }
    }
    const lowRecovery = recoveryGroups.filter((g) => g.recovery < 50);
    if (lowRecovery.length > 0) recommendations.push({
        id: id++, type: 'recover', priority: 'high', category: 'recovery',
        title: '優先安排恢復',
        description: `${lowRecovery.map((g) => MUSCLE_ZH[g.nameKey] || g.name).join('、')} 恢復度偏低（<50%），建議先練其他部位或安排休息日。`,
        impact: '避免過度訓練',
    });

    // ── 週彙總（只算真實值） ──
    const activeMinutes = weekRecords.reduce((s, r) => s + (Number(r.duration_mins) || Number(r.duration) || 0), 0);
    const totalCalories = weekRecords.reduce((s, r) => s + (Number(r.calories) || Number(r.calories_est) || 0), 0);
    const primaryFocus = volumeBreakdown.length ? volumeBreakdown[0].muscle : 'General';

    return {
        aiAdvice,
        volumeAnalysis: { totalVolume: Math.round(totalVolume), breakdown: volumeBreakdown },
        weeklyPerformance: {
            breakdown: [
                { metric: 'Workouts', score: workoutsCount, unit: 'sessions', status: 'good' },
                { metric: 'Active Time', score: activeMinutes >= 60 ? Math.round(activeMinutes / 60) : activeMinutes, unit: activeMinutes >= 60 ? 'hours' : 'mins', status: 'good' },
                { metric: 'Top Focus', score: primaryFocus, unit: '', status: 'excellent' },
                { metric: 'Est. Burn', score: totalCalories > 0 ? Math.round(totalCalories) : '—', unit: totalCalories > 0 ? 'kcal' : '', status: 'good' },
            ],
        },
        recoveryStatus: { overall: avgRecovery, muscleGroups: recoveryGroups },
        recommendations,
    };
}

export default { buildWeeklyInsights };
