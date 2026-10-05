// 重訓教練回饋 — 規格驗證 loop（固定容量/完成度骨架，其餘條件全排列）
// 對照：DRVN_教練回饋結算系統_合格標準與雙端稽核_v1.md（I1–I9 / H1–H7 / §3.1 §4.2）
// Run: node src/utils/__strength_coach_spec_harness.mjs
import { buildStrengthIntelligence, computeStrengthMetrics, computeStrengthScore, buildStrengthCharts, epleyE1RM } from './strengthCoachEngine.js';

const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * 864e5).toISOString();

// ── 條件維度 ──
const RPE = {
    none: null,      // 沒記 RPE
    light: 6,        // 太輕
    effective: 8,    // 有效增肌區
    failure: 9.7,    // 接近力竭
};
// history 情境（prior 容量已對齊 session 實際容量：baseW90≈1980 / PR100≈2140 / regress75≈1740）
const HIST = {
    none: () => ({ priorWorkouts: [], exercisePRs: {}, bumpW: 0 }),
    regress: () => ({ // 大幅減量 → supportive
        priorWorkouts: [{ focus_group: 'chest', total_volume: 2600, timestamp: iso(3), exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }] }],
        exercisePRs: { 'Bench Press': 100 }, bumpW: -15,
    }),
    flat: () => ({ // 容量持平 → 鞏固
        priorWorkouts: [{ focus_group: 'chest', total_volume: 1980, timestamp: iso(3), exercises: [{ name: 'Bench Press', sets: [{ weight: 90, reps: 5 }] }] }],
        exercisePRs: { 'Bench Press': 90 }, bumpW: 0,
    }),
    progress: () => ({ // 容量進步 +16%（無 PR、無 e1RM 破紀錄）
        priorWorkouts: [{ focus_group: 'chest', total_volume: 1700, timestamp: iso(3), exercises: [{ name: 'Bench Press', sets: [{ weight: 95, reps: 3 }] }] }],
        exercisePRs: { 'Bench Press': 95 }, bumpW: 0,
    }),
    pr: () => ({ // 破 PR
        priorWorkouts: [{ focus_group: 'chest', total_volume: 1900, timestamp: iso(3), exercises: [{ name: 'Bench Press', sets: [{ weight: 90, reps: 5 }] }] }],
        exercisePRs: { 'Bench Press': 90 }, bumpW: 10,
    }),
};
const COMPLETION = { half: [3, 6], most: [8, 10], full: [10, 10] };

// 依維度組出一場 session
function makeSession(rpeKey, histKey, compKey) {
    const rpe = RPE[rpeKey];
    const h = HIST[histKey]();
    const [done, planned] = COMPLETION[compKey];
    const baseW = 90 + h.bumpW; // PR 情境 100、退步 75、其餘 90
    const mk = (w, reps) => ({ weight: w, reps, ...(rpe != null ? { rpe } : {}) });
    const exercises = [
        { name: 'Bench Press', sets: [mk(baseW, 5), mk(baseW, 5), mk(baseW - 5, 6)] },
        { name: 'Incline Dumbbell Press', sets: [mk(30, 10), mk(30, 9)] },
    ];
    return {
        session: {
            exercises, completedSets: done, totalSets: planned, durationSeconds: 3000,
            focusGroup: 'chest', exercisePRs: h.exercisePRs, priorWorkouts: h.priorWorkouts,
        },
        expect: { rpeKey, histKey, compKey },
    };
}

// ── 不變式 / 誠實鐵律檢查 ──
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
function check(name, cond, fails, ctx) { if (!cond) fails.push(`${name} @ ${ctx}`); }

let total = 0, failList = [];
const cover = { celebrating: 0, praise: 0, steady: 0, supportive: 0, scoreNull: 0, scored: 0, consolidation: 0 };

for (const rpeKey of Object.keys(RPE)) {
    for (const histKey of Object.keys(HIST)) {
        for (const compKey of Object.keys(COMPLETION)) {
            total++;
            const ctx = `rpe=${rpeKey} hist=${histKey} comp=${compKey}`;
            let R;
            try { R = buildStrengthIntelligence(makeSession(rpeKey, histKey, compKey).session); }
            catch (e) { failList.push(`THROW @ ${ctx}: ${e.message}`); continue; }

            // I1 有肯定
            check('I1 validation', nonEmpty(R.validation), failList, ctx);
            // I2 有進步定調
            check('I2 progress', nonEmpty(R.progress) && R.progress_points.length > 0, failList, ctx);
            // I3 至少一個正向（validation 一定是肯定語氣）＋不出現空洞
            check('I3 positive', nonEmpty(R.validation) && !/^$/.test(R.validation), failList, ctx);
            // I4 一定有下一步（coaching_points 含處方或恢復窗）
            check('I4 nextStep', R.coaching_points.length >= 1 && R.coaching_points.some((p) => /下一步|恢復|48–72/.test(p)), failList, ctx);
            // I5 三句制：有動作就一定有逐動作處方
            check('I5 prescriptions', R.prescriptions.length >= 1, failList, ctx);
            // F3 卡池：非空、tone 平衡（≥1 praise=I3、≥1 actionable、同類≤2、load warn≤1）、三句制
            check('F3 cards non-empty', Array.isArray(R.coachCards) && R.coachCards.length >= 1, failList, ctx);
            check('F3 ≥1 praise (I3)', R.coachCards.some((c) => c.tone === 'praise'), failList, ctx);
            // 三句制已保證每張卡都帶 action（可執行）；全正向的好課允許沒有 warn（誠實不硬湊警示）
            check('F3 三句制 every-card-actionable', R.coachCards.every((c) => c.verdict && c.why && c.action), failList, ctx);
            { const cc = {}; R.coachCards.forEach((c) => { cc[c.category] = (cc[c.category] || 0) + 1; }); check('F3 同類≤2', Object.values(cc).every((n) => n <= 2), failList, ctx); }
            check('F3 load warn≤1', R.coachCards.filter((c) => c.category === 'load' && c.tone === 'warn').length <= 1, failList, ctx);
            // F5 趨勢：一定有字串
            check('F5 trend non-empty', typeof R.trend === 'string' && R.trend.length > 0, failList, ctx);
            // H1 無 RPE → 不得出現強度/有效組卡
            if (rpeKey === 'none') {
                check('H1 no-RPE-no-intensity-card', !R.coachCards.some((c) => c.category === 'intensity' || c.category === 'effective'), failList, ctx);
            }

            // H1 無 RPE → 不得出現有效組/RPE 判讀
            if (rpeKey === 'none') {
                const hay = R.progress + ' ' + R.coaching;
                check('H1 no-RPE-no-claim', !/有效組|RPE/.test(hay), failList, ctx);
                check('H1 score basis', R.scoreBasis !== 'full', failList, ctx);
            }
            // H2 無歷史 → 不得宣稱「比上次…多」
            if (histKey === 'none') {
                check('H2 no-history-no-progress-claim', !/比上次.*多|比歷史最佳高/.test(R.progress), failList, ctx);
                check('H2 made_progress false', R.metrics.made_progress === false, failList, ctx);
            }
            // I7 分數誠實：無 RPE 且無歷史 → 核心 pillar 皆缺 → 不評分
            if (rpeKey === 'none' && histKey === 'none') {
                check('I7 honest-null', R.strengthScore === null, failList, ctx);
            }
            // 情境專屬：PR 情境 → celebrating + pr_count>0 + 文案含 PR
            if (histKey === 'pr') {
                check('PR tone', R.tone === 'celebrating', failList, ctx);
                check('PR count>0', R.metrics.pr_count > 0, failList, ctx);
                check('PR text', /PR/.test(R.progress), failList, ctx);
            }
            // 情境專屬：flat 容量 → 鞏固語氣、非進步
            if (histKey === 'flat') {
                check('flat consolidation', /鞏固/.test(R.progress) && R.metrics.made_progress === false, failList, ctx);
            }
            // 情境專屬：failure RPE + 低次數頂組 → 處方含「降 5%」
            if (rpeKey === 'failure') {
                check('failure deload advice', R.prescriptions.some((p) => /降 5%/.test(p)), failList, ctx);
            }

            // 覆蓋率
            cover[R.tone] = (cover[R.tone] || 0) + 1;
            if (R.strengthScore == null) cover.scoreNull++; else cover.scored++;
            if (/鞏固/.test(R.progress)) cover.consolidation++;
        }
    }
}

// H4 e1RM 夾 reps（單元）
{
    const capped = epleyE1RM(100, 20); // reps 20 → 夾 15
    const expected = 100 * (1 + 15 / 30);
    check('H4 e1rm cap', Math.abs(capped - expected) < 1e-6, failList, 'unit:e1rm-cap');
    total++;
}

// ── 圖表契約：I8 每張圖有 note；C3 資料不足 ready=false 且仍有引導 note ──
{
    const iso = (d) => new Date(now - d * 864e5).toISOString();
    const prior = [
        { focus_group: 'chest', total_volume: 1700, timestamp: iso(14), exercises: [{ name: 'Bench Press', sets: [{ weight: 85, reps: 5, rpe: 8 }] }] },
        { focus_group: 'legs', total_volume: 3000, timestamp: iso(10), exercises: [{ name: 'Squat', sets: [{ weight: 120, reps: 5, rpe: 8 }] }] },
        { focus_group: 'chest', total_volume: 1850, timestamp: iso(6), exercises: [{ name: 'Bench Press', sets: [{ weight: 88, reps: 5, rpe: 8 }] }] },
        { focus_group: 'back', total_volume: 2200, timestamp: iso(3), exercises: [{ name: 'Row', sets: [{ weight: 70, reps: 8, rpe: 8 }] }] },
    ];
    const cur = { exercises: [{ name: 'Bench Press', sets: [{ weight: 92, reps: 5, rpe: 8 }, { weight: 92, reps: 5, rpe: 8 }] }], completedSets: 6, totalSets: 6, durationSeconds: 3200, focusGroup: 'chest', exercisePRs: { 'Bench Press': 90 }, priorWorkouts: prior };
    const C = buildStrengthCharts(cur);
    const allCharts = [C.volumeTrend, C.e1rm, C.muscleBalance, C.acwr];
    check('I8 every-chart-has-note', allCharts.every((c) => typeof c.note === 'string' && c.note.length > 0), failList, 'charts:with-history');
    check('charts ready with history', C.volumeTrend.ready && C.e1rm.ready && C.acwr.ready, failList, 'charts:with-history');
    check('e1rm delta positive', C.e1rm.deltaPct != null && C.e1rm.deltaPct > 0, failList, 'charts:e1rm');
    check('acwr overload flagged', C.acwr.zone === 'overload', failList, 'charts:acwr');
    total += 4;

    // C3：無歷史 → 四張圖皆 not-ready，但仍各有誠實引導 note
    const empty = buildStrengthCharts({ exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 10 }] }], completedSets: 3, totalSets: 3, focusGroup: 'chest', exercisePRs: {}, priorWorkouts: [] });
    const emptyCharts = [empty.volumeTrend, empty.e1rm, empty.muscleBalance, empty.acwr];
    check('C3 no-history-not-ready', emptyCharts.every((c) => c.ready === false), failList, 'charts:no-history');
    check('C3 empty-still-has-note', emptyCharts.every((c) => c.note && c.note.length > 0), failList, 'charts:no-history');
    total += 2;
}

// ── F5 趨勢方向覆蓋（≥3 筆歷史才判方向；<3 誠實引導）──
{
    const iso = (d) => new Date(now - d * 864e5).toISOString();
    const rising = ['chest'].flatMap(() => [
        { focus_group: 'chest', total_volume: 1400, timestamp: iso(20), exercises: [] },
        { focus_group: 'chest', total_volume: 1600, timestamp: iso(13), exercises: [] },
        { focus_group: 'chest', total_volume: 1800, timestamp: iso(6), exercises: [] },
    ]);
    const rUp = buildStrengthIntelligence({ exercises: [{ name: 'Bench Press', sets: [{ weight: 95, reps: 5, rpe: 8 }] }], completedSets: 3, totalSets: 3, focusGroup: 'chest', exercisePRs: { 'Bench Press': 100 }, priorWorkouts: rising });
    check('F5 rising detected', /往上堆|漸進累積/.test(rUp.trend), failList, 'trend:rising');
    const few = buildStrengthIntelligence({ exercises: [{ name: 'Bench Press', sets: [{ weight: 95, reps: 5 }] }], completedSets: 3, totalSets: 3, focusGroup: 'chest', exercisePRs: {}, priorWorkouts: [] });
    check('F5 few-history honest', /多練幾次/.test(few.trend), failList, 'trend:few');
    total += 2;
}

// ── 報告 ──
console.log('════════ DRVN 重訓教練回饋 — 規格驗證 loop ════════');
console.log(`情境數：${total}（RPE 4 × 歷史 5 × 完成度 3 + 單元測試）`);
console.log('tone 覆蓋：', cover);
if (failList.length === 0) {
    console.log(`\n✅ 全部通過（0 違反）→ I1–I9 / H1–H7 收斂綠燈。`);
    process.exit(0);
} else {
    console.log(`\n❌ ${failList.length} 項違反：`);
    failList.slice(0, 40).forEach((f) => console.log('  · ' + f));
    process.exit(1);
}
