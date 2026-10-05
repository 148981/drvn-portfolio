// ════════════════════════════════════════════════════════════════════════
//  cardioPlanProgress.js — 計劃完成度、動態調整、結業診斷、下一套推薦
//  ─────────────────────────────────────────────────────────────────────
//  一份課表發出去只是開始。真正決定使用者會不會留下來的是：
//    · 他知不知道自己完成了多少（誠實的完成度，不是打卡數）
//    · 落後的時候系統會不會把課表調到他做得到（而不是繼續開高）
//    · 一期結束時有沒有人告訴他「你哪裡變強了、哪裡還沒有」
//    · 有沒有人已經替他想好下一步
//
//  完成度定義（使用者指定）：
//      完成度 = 實際跑的距離 ÷ 計劃預估距離
//  不是「完成幾趟」—— 跑了 1 公里就按完成的那種數字沒有意義。
// ════════════════════════════════════════════════════════════════════════

import { generateCardioPlan, finalizePlanNumbers } from './cardioPlanFusionEngine';
import { actualRunKm, hasBrickActivity, paceCalibrationSamples } from './cardioPlanActuals';
import { calibratePaceFromActuals } from './cardioSettlementEngine';
import { normalizeRunPrescription, PACE_SHIFT_BY_SUBTYPE } from './cardioPrescription';
import { RACE_TARGETS, GOAL_NAMES } from './cardioPlanPath';
import { levelFromWeeklyKm } from './runnerLevel';
import { cyclePlaceSummary, placeAdvice } from './runPlaceFeedback';

const round1 = (v) => Math.round(v * 10) / 10;
const pct = (v) => Math.round(v * 100);

/** 一塊 brick 實際跑了多少（沒跑就是 0，跑不完就是跑到的距離） */
const actualKm = actualRunKm;

const plannedKm = (b) => (b?.distance_km != null ? Number(b.distance_km) || 0 : 0);

/* ════════════════════════════════════════════════════════════════════
   1. 完成度
   ════════════════════════════════════════════════════════════════════ */

/**
 * @returns {{
 *   weeks: Array<{week, plannedKm, actualKm, ratio, done, total, status}>,
 *   overall: { plannedKm, actualKm, ratio, doneBricks, totalBricks },
 *   elapsedWeeks: number,
 *   toDate: { plannedKm, actualKm, ratio },   // 只計「已經過去的週」
 * }}
 */
export function computePlanProgress(plan) {
    const weeks = (plan?.weeks || []).map((w) => {
        const runs = (w.bricks || []).filter((b) => b.distance_km != null);
        const p = runs.reduce((s, b) => s + plannedKm(b), 0);
        const a = runs.reduce((s, b) => s + actualKm(b), 0);
        const done = runs.filter((b) => b.status === 'completed').length;
        const ratio = p > 0 ? a / p : 0;
        return {
            week: w.week_index,
            phase: w.phase,
            isDeload: !!w.is_deload,
            plannedKm: round1(p),
            actualKm: round1(a),
            ratio,
            done,
            total: runs.length,
            status: ratio >= 0.95 ? 'hit' : ratio >= 0.7 ? 'partial' : ratio > 0 ? 'behind' : 'missed',
        };
    });

    const plannedTotal = weeks.reduce((s, w) => s + w.plannedKm, 0);
    const actualTotal = weeks.reduce((s, w) => s + w.actualKm, 0);

    // 「已經過去的週」= 有任何一塊磚被完成或跳過的最後一週
    let elapsed = 0;
    (plan?.weeks || []).forEach((w, i) => {
        const touched = (w.bricks || []).some(hasBrickActivity);
        if (touched) elapsed = i + 1;
    });
    const toDateWeeks = weeks.slice(0, elapsed);
    const tdP = toDateWeeks.reduce((s, w) => s + w.plannedKm, 0);
    const tdA = toDateWeeks.reduce((s, w) => s + w.actualKm, 0);

    return {
        weeks,
        overall: {
            plannedKm: round1(plannedTotal),
            actualKm: round1(actualTotal),
            ratio: plannedTotal > 0 ? actualTotal / plannedTotal : 0,
            doneBricks: weeks.reduce((s, w) => s + w.done, 0),
            totalBricks: weeks.reduce((s, w) => s + w.total, 0),
        },
        elapsedWeeks: elapsed,
        toDate: {
            plannedKm: round1(tdP),
            actualKm: round1(tdA),
            ratio: tdP > 0 ? tdA / tdP : 0,
        },
    };
}

/* ════════════════════════════════════════════════════════════════════
   2. 依完成率動態調整下一週
   ────────────────────────────────────────────────────────────────────
   規則（保守優先 —— 寧可簡單一點，也不要讓人連兩週做不到）：
     ≥ 105%   跑超量 → 不加碼，提醒別偷跑（超量本身就是受傷來源）
     95–105%  完美達標 → 照原計劃
     70–95%   小幅落後 → 下週壓到「上週實際量 × 1.05」
     40–70%   明顯落後 → 下週壓到「上週實際量 × 1.0」，並砍掉高強度
     < 40%    幾乎沒跑 → 下週重置為上週實際量與更少趟數，全部改輕鬆跑
   ════════════════════════════════════════════════════════════════════ */

export const ADJUST_RULES = [
    { min: 1.05, code: 'over',     label: '超量',   factor: null, dropQuality: false },
    { min: 0.95, code: 'on_track', label: '達標',   factor: null, dropQuality: false },
    { min: 0.70, code: 'slight',   label: '小幅落後', factor: 1.05, dropQuality: false },
    { min: 0.40, code: 'behind',   label: '明顯落後', factor: 1.00, dropQuality: true },
    { min: 0,    code: 'reset',    label: '幾乎沒跑', factor: 1.00, dropQuality: true, cutSessions: true },
];

const ruleFor = (ratio) => ADJUST_RULES.find((r) => ratio >= r.min) || ADJUST_RULES[ADJUST_RULES.length - 1];

/**
 * 依「上一週的實際完成度」調整下一週
 * @returns {{ plan, changed:boolean, rule, message, before:number, after:number }}
 */
export function adjustNextWeek(plan, completedWeekIndex) {
    const progress = computePlanProgress(plan);
    const last = progress.weeks.find((w) => w.week === completedWeekIndex);
    const nextIdx = completedWeekIndex; // weeks 是 1-based，下一週的陣列索引剛好等於它
    const nextWeek = plan?.weeks?.[nextIdx];
    if (!last || !nextWeek || plan.weeks.find(w => w.week_index === completedWeekIndex)?.settlement
        || nextWeek.auto_adjusted || (nextWeek.bricks || []).some(hasBrickActivity)) {
        return { plan, changed: false, rule: null, message: '', before: 0, after: 0 };
    }

    const rule = ruleFor(last.ratio);
    const before = nextWeek.target_mileage_km;

    if (rule.factor == null) {
        const message = rule.code === 'over'
            ? `上週你跑了計劃的 ${pct(last.ratio)}% — 有心是好事，但超量本身就是受傷來源。下週維持原計劃。`
            : `上週完成 ${pct(last.ratio)}%，剛好在軌道上。下週照原計劃走。`;
        return { plan, changed: false, rule, message, before, after: before };
    }

    // 目標量 = 上週「實際跑到的量」× 係數（絕不從沒做到的計劃量往上加）
    //
    //   ★ 死亡螺旋防護：如果使用者每週都只做「當週配額的固定比例」，
    //     單純用『上週實際量』當下週目標會一路往下掉到地板，
    //     課表最後變成沒有訓練意義的殘骸。
    //     所以設兩道下限：
    //       · 絕對下限 2.5 公里（再怎麼重置也要是像樣的一週）
    //       · 相對下限 = 這一週「原始配額」的 50%
    //     連續掉到相對下限還做不到，代表整份計劃開錯了 —
    //     那該由結業診斷去換一份，不是靠無限縮水硬撐。
    const originalKm = nextWeek.original_mileage_km ?? before;
    const floorKm = Math.min(before, Math.max(2.5, round1(originalKm * 0.5)));
    const targetKm = Math.min(before, Math.max(floorKm, round1(last.actualKm * rule.factor)));
    const scale = before > 0 ? targetKm / before : 1;

    const next = JSON.parse(JSON.stringify(plan));
    const w = next.weeks[nextIdx];

    let bricks = w.bricks || [];
    // 明顯落後 → 高強度先拿掉，換成輕鬆跑（先把「有出門」找回來）
    if (rule.dropQuality) {
        bricks = bricks.map((b) => (
            ['tempo', 'interval'].includes(b.subtype)
                ? normalizeRunPrescription({ ...b, subtype: 'easy', type: 'recovery' },
                    b.target_pace_sec ? b.target_pace_sec - (PACE_SHIFT_BY_SUBTYPE[b.subtype] ?? 60) : 360)
                : b
        ));
    }
    // 幾乎沒跑 → 再砍掉一趟，降低心理門檻
    if (rule.cutSessions) {
        const runs = bricks.filter((b) => b.distance_km != null);
        if (runs.length > 2) {
            const drop = runs.reduce((a, b) => ((a.distance_km || 0) >= (b.distance_km || 0) ? a : b));
            bricks = bricks.filter((b) => b.brick_id !== drop.brick_id);
        }
    }

    // 等比縮放里程與時長
    const runIdx = bricks.filter((b) => b.distance_km != null);
    const curSum = runIdx.reduce((s, b) => s + (b.distance_km || 0), 0);
    const k = curSum > 0 ? targetKm / curSum : scale;
    bricks = bricks.map((b) => {
        if (b.distance_km == null) return b;
        const d = Math.max(0.5, round1(b.distance_km * k));
        const paceSec = b.target_pace_sec || 360;
        return normalizeRunPrescription({ ...b, distance_km: d, duration_min: Math.round((d * paceSec) / 60) });
    });

    w.bricks = bricks;
    w.target_mileage_km = round1(bricks.reduce((s, b) => s + (b.distance_km || 0), 0));
    w.run_sessions = bricks.filter((b) => b.distance_km != null).length;
    w.strength_sessions = bricks.length - w.run_sessions;
    w.total_duration_min = bricks.reduce((s, b) => s + (b.duration_min || 0), 0);
    // 記住「原始配額」——之後再調整時，相對下限要對照它而不是已經被調過的值
    if (w.original_mileage_km == null) w.original_mileage_km = before;
    w.auto_adjusted = {
        from: before,
        to: w.target_mileage_km,
        rule: rule.code,
        based_on_ratio: Math.round(last.ratio * 100) / 100,
        at_floor: w.target_mileage_km <= floorKm + 0.05,
    };

    const message = rule.code === 'reset'
        ? `上週只跑到計劃的 ${pct(last.ratio)}%。下週已經改成 ${w.target_mileage_km} 公里、全部輕鬆跑 — 先把「有出門」找回來，量之後補得回來。`
        : rule.code === 'behind'
            ? `上週完成 ${pct(last.ratio)}%。下週從你「真的跑到的量」重新接手（${before} → ${w.target_mileage_km} 公里），高強度先拿掉。`
            : `上週完成 ${pct(last.ratio)}%，有點落後但不嚴重。下週微調成 ${w.target_mileage_km} 公里，接得比較順。`;

    return { plan: finalizePlanNumbers(next), changed: true, rule, message, before, after: w.target_mileage_km };
}

/* ════════════════════════════════════════════════════════════════════
   2.5 計劃生命週期 —— 現在是第幾週、什麼時候結束、結束了沒
   ────────────────────────────────────────────────────────────────────
   以 start_date 為錨（不是「使用者按了幾個完成」），
   end_date = start_date + total_weeks × 7 天。
   時間到了就是到了 —— 沒跑完也要結算，那才是誠實的完成度。
   ════════════════════════════════════════════════════════════════════ */

const DAY = 86400000;
const atMidnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * ★ 寬限期 —— 週日的長跑拖到週一才跑，還是算那一週的。
 *
 * 設計決策（2026-08）：
 *   日曆是權威，週次不會因為你沒跑就往後順延，end_date 也固定。
 *   但「補償」（把欠下的公里堆到下一週）明確不做 ——
 *   那正是整個 v2.1 安全閘在消滅的 +40% 跳躍，而且一旦允許順延，
 *   完成度的分母就浮動了，數字會失去意義。
 *
 *   落後的正解是把「下一週降到你做得到」，不是把債往後加。
 */
export const GRACE_DAYS = 2;

/** 計劃起始日（無效就回 null） */
export function planStartDate(plan) {
    const raw = plan?.start_date;
    if (!raw) return null;
    const d = new Date(`${String(raw).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** 計劃結束日 = 起始日 + 總週數 × 7 天 */
export function planEndDate(plan) {
    const start = planStartDate(plan);
    if (!start) return null;
    const weeks = Number(plan?.total_weeks) || (plan?.weeks?.length ?? 0);
    return new Date(start.getTime() + weeks * 7 * DAY);
}

/** 今天是第幾週（1-based）。還沒開始 → 0；已結束 → total_weeks */
export function currentWeekIndex(plan, today = new Date()) {
    const start = planStartDate(plan);
    if (!start) return 0;
    const total = Number(plan?.total_weeks) || (plan?.weeks?.length ?? 0);
    const days = Math.floor((atMidnight(today) - start) / DAY);
    if (days < 0) return 0;
    return Math.min(total, Math.floor(days / 7) + 1);
}

/** 到 end_date 了沒 */
export function isPlanFinished(plan, today = new Date()) {
    const end = planEndDate(plan);
    if (!end) return false;
    return atMidnight(today).getTime() >= end.getTime();
}

/** 距離結束還剩幾天（已結束回 0） */
export function daysUntilEnd(plan, today = new Date()) {
    const end = planEndDate(plan);
    if (!end) return null;
    return Math.max(0, Math.ceil((end - atMidnight(today)) / DAY));
}

/**
 * 某一週現在是什麼狀態
 *   upcoming 還沒到 · current 進行中 · grace 剛結束但還在寬限期 · closed 已封存
 */
export function weekState(plan, weekIndex, today = new Date()) {
    const start = planStartDate(plan);
    if (!start) return 'upcoming';
    const weekEnd = start.getTime() + weekIndex * 7 * DAY;      // 該週結束的那一刻
    const now = atMidnight(today).getTime();
    if (now < weekEnd - 7 * DAY) return 'upcoming';
    if (now < weekEnd) return 'current';
    if (now < weekEnd + GRACE_DAYS * DAY) return 'grace';
    return 'closed';
}

/**
 * ★ 時間進度 vs 完成度 —— 追蹤的核心。
 *   兩個數字的差距就是「跟上了沒」，不需要另外嘮叨提醒。
 */
export function trackingSnapshot(plan, today = new Date()) {
    if (!plan?.weeks?.length) return null;
    const start = planStartDate(plan);
    const end = planEndDate(plan);
    if (!start || !end) return null;

    const now = atMidnight(today).getTime();
    const totalMs = end.getTime() - start.getTime();
    const timeRatio = totalMs > 0
        ? Math.max(0, Math.min(1, (now - start.getTime()) / totalMs))
        : 0;

    const progress = computePlanProgress(plan);
    // 完成度的分母固定是「整份計劃」，不會因為還沒跑到就縮小
    const doneRatio = progress.overall.ratio;

    // 「照時間該跑到多少」= 已經過完（含寬限期內）的那幾週的計劃量
    const nowWeek = currentWeekIndex(plan, today);
    const dueKm = progress.weeks
        .filter((w) => weekState(plan, w.week, today) === 'closed')
        .reduce((s, w) => s + w.plannedKm, 0);
    const dueRatio = progress.overall.plannedKm > 0 ? dueKm / progress.overall.plannedKm : 0;

    // 落後幾個百分點（相對「該跑到的量」，不是相對整份計劃 —— 那對前期的人不公平）
    const gapPts = Math.round((dueRatio - doneRatio) * 100);

    return {
        week: nowWeek,
        totalWeeks: plan.total_weeks,
        daysLeft: daysUntilEnd(plan, today),
        timeRatio,
        doneRatio,
        dueRatio,
        dueKm: round1(dueKm),
        actualKm: progress.overall.actualKm,
        plannedKm: progress.overall.plannedKm,
        gapPts,                                   // 正數 = 落後、負數 = 超前
        onTrack: gapPts <= 8,
        finished: isPlanFinished(plan, today),
        progress,
    };
}

/**
 * ★ 自動調整：把「已經過完的每一週」的實際完成度，套用到它的下一週。
 *
 * 使用者可能隔了三週才打開 App —— 那就一次補齊，逐週往下傳遞，
 * 因為第 3 週的量本來就該建立在第 2 週被調整過的結果上。
 *
 * @returns {{ plan, applied: Array<{week, rule, before, after, message}>, changed:boolean }}
 */
export function autoAdjustPlan(plan, today = new Date()) {
    if (!plan?.weeks?.length) return { plan, applied: [], changed: false };
    const nowWeek = currentWeekIndex(plan, today);
    if (nowWeek < 2) return { plan, applied: [], changed: false };

    let working = plan;
    const applied = [];

    // k = 已經過完的週（1-based）；它的下一週 = weeks[k]（0-based）
    for (let k = 1; k < nowWeek; k++) {
        const nextWeek = working.weeks[k];
        if (!nextWeek) break;
        if (nextWeek.auto_adjusted) continue;              // 已調整過就不重複
        // ★ 還在寬限期內就先別動 —— 週日的長跑可能週一才會跑進來，
        //   太早結算會拿一個還沒定案的完成度去砍下一週。
        if (weekState(plan, k, today) !== 'closed') continue;
        // 那一週完全沒動過（沒完成也沒跳過）→ 可能是還沒同步，先不調
        const prev = working.weeks[k - 1];
        if (prev?.settlement || (nextWeek.bricks || []).some(hasBrickActivity)) continue;
        const touched = (prev?.bricks || []).some(hasBrickActivity);
        if (!touched) continue;

        const res = adjustNextWeek(working, k);
        if (!res.changed) {
            // 達標／超量：也要蓋章，否則每次開 App 都會重算一次
            working = JSON.parse(JSON.stringify(working));
            working.weeks[k].auto_adjusted = {
                from: res.before, to: res.after, rule: res.rule?.code || 'on_track', noop: true,
            };
            applied.push({ week: k + 1, rule: res.rule?.code, before: res.before, after: res.after, message: res.message, changed: false });
            continue;
        }
        working = res.plan;
        applied.push({ week: k + 1, rule: res.rule.code, before: res.before, after: res.after, message: res.message, changed: true });
    }

    return { plan: working, applied, changed: applied.some((a) => a.changed) };
}

/* ════════════════════════════════════════════════════════════════════
   3. 結業診斷：你哪裡變強了、哪裡還沒有
   ════════════════════════════════════════════════════════════════════ */

/**
 * @returns {{ grade, gradeLabel, completion, strengths:[], gaps:[], summary }}
 */
export function diagnosePlan(plan) {
    const progress = computePlanProgress(plan);
    const ratio = progress.overall.ratio;

    const grade = ratio >= 0.9 ? 'A' : ratio >= 0.75 ? 'B' : ratio >= 0.5 ? 'C' : 'D';
    const gradeLabel = { A: '完美執行', B: '穩定完成', C: '斷斷續續', D: '這期沒能走完' }[grade];

    const strengths = [];
    const gaps = [];

    // ★ 整體完成度太低時不發「強項」徽章 ——
    //   完成度 13% 卻誇他「強度執行力很好」，只會讓人覺得系統在敷衍。
    const canPraise = ratio >= 0.5;

    // ── 出席率 ──
    const hitWeeks = progress.weeks.filter((w) => w.status === 'hit').length;
    const totalWeeks = progress.weeks.length || 1;
    if (canPraise && hitWeeks / totalWeeks >= 0.7) {
        strengths.push({
            code: 'consistency',
            title: '穩定性',
            body: `${totalWeeks} 週裡有 ${hitWeeks} 週完整達標 — 這是進步最重要的變數，比任何單次的好表現都值錢。`,
        });
    } else if (hitWeeks / totalWeeks < 0.4) {
        gaps.push({
            code: 'consistency',
            title: '規律性還不夠',
            body: hitWeeks === 0
                ? `${totalWeeks} 週裡沒有一週完整達標。這通常不是意志力問題，是課表開得比生活能塞下的多 — 下一期把每週次數降一階。`
                : `${totalWeeks} 週裡只有 ${hitWeeks} 週完整達標。下一期建議把每週次數降一階 — 做得到的課表才有意義。`,
            action: 'lower_frequency',
        });
    }

    // ── 長跑（耐力天花板）──
    //   ★ 不能只認 subtype === 'long'：里程小的時候引擎會把它正名成
    //     「輕鬆跑」（2.6 公里叫長跑本來就不對）。真正的判準是
    //     「這一週最長的那一趟」—— 它就是那週的耐力驅動，叫什麼名字不重要。
    const longs = [];
    (plan?.weeks || []).forEach((w) => {
        // 高強度不算 —— 節奏跑常常是該週最長的一趟，但它訓練的是速度不是耐力
        const runs = (w.bricks || []).filter(
            (b) => b.distance_km != null && !['tempo', 'interval'].includes(b.subtype),
        );
        if (runs.length < 2) return;   // 只有一趟就沒有「最長的那趟」可言
        const longest = runs.reduce((a, b) => ((b.distance_km || 0) > (a.distance_km || 0) ? b : a));
        // 必須明顯長於其他趟才算長跑（≥ 平均的 1.25 倍）。
        // 量太小的計劃每趟差不多長 —— 那就是真的沒有長跑，不該硬湊一個出來。
        const avg = runs.reduce((s, b) => s + (b.distance_km || 0), 0) / runs.length;
        if ((longest.distance_km || 0) >= avg * 1.25) longs.push(longest);
    });
    const longDone = longs.filter((b) => b.status === 'completed').length;
    if (longs.length > 0) {
        const rate = longDone / longs.length;
        if (canPraise && rate >= 0.8) {
            strengths.push({
                code: 'long_run',
                title: '耐力基礎',
                body: `${longs.length} 趟長跑完成了 ${longDone} 趟。長跑是耐力天花板，這一塊你顧得很好。`,
            });
        } else if (rate < 0.5) {
            gaps.push({
                code: 'long_run',
                title: '長跑常被跳過',
                body: `${longs.length} 趟長跑只完成 ${longDone} 趟。長跑決定你跑得多遠 — 下一期可以把它排在最有空的那一天。`,
                action: 'protect_long_run',
            });
        }
    }

    // ── 高強度（速度天花板）──
    const quality = [];
    (plan?.weeks || []).forEach((w) => (w.bricks || []).forEach((b) => {
        if (['tempo', 'interval'].includes(b.subtype)) quality.push(b);
    }));
    const qDone = quality.filter((b) => b.status === 'completed').length;
    const place = placeAdvice(plan);   // 間歇沒做完是不是場地問題（主場不是操場）
    if (quality.length > 0) {
        const rate = qDone / quality.length;
        if (canPraise && rate >= 0.8) {
            strengths.push({
                code: 'quality',
                title: '強度執行力',
                body: `${quality.length} 趟高強度完成了 ${qDone} 趟。願意跑進不舒服的區間，速度才會動。`,
            });
        } else if (rate < 0.5) {
            gaps.push({
                code: 'quality',
                title: '高強度做得太少',
                body: place
                    ? `${quality.length} 趟節奏／間歇只完成 ${qDone} 趟。${place.reason}`
                    : `${quality.length} 趟節奏／間歇只完成 ${qDone} 趟。有氧底有了但速度沒被刺激到 — 下一期可以先從「每週一趟節奏跑」開始。`,
                action: 'add_quality',
            });
        } else if (place) {
            gaps.push({ code: 'interval_place', title: '間歇常常沒做完', body: place.reason, action: 'tempo_quality' });
        }
    } else {
        gaps.push({
            code: 'no_quality',
            title: '還沒碰過速度訓練',
            body: '這一期全部是輕鬆跑。底子打好了，下一期可以開始加入節奏跑，速度會有明顯變化。',
            action: 'add_quality',
        });
    }

    // ── 週量成長 ──
    const first = progress.weeks[0];
    const peakWeek = progress.weeks.reduce((a, b) => (b.actualKm > a.actualKm ? b : a), progress.weeks[0]);
    if (canPraise && first && peakWeek && first.actualKm > 0 && peakWeek.actualKm > first.actualKm * 1.3) {
        strengths.push({
            code: 'volume',
            title: '週量成長',
            body: `從第 1 週的 ${first.actualKm} 公里長到最高 ${peakWeek.actualKm} 公里，成長了 ${Math.round((peakWeek.actualKm / first.actualKm - 1) * 100)}%。`,
        });
    }

    const summary = grade === 'A'
        ? `你把這 ${totalWeeks} 週執行得非常完整 —— 完成度 ${pct(ratio)}%。身體已經準備好接下一個階段。`
        : grade === 'B'
            ? `完成度 ${pct(ratio)}%，大部分的週都跟上了。有幾個缺口補起來，下一期會更順。`
            : grade === 'C'
                ? `完成度 ${pct(ratio)}%。有跑，但斷得比較多 —— 下一期我們把量調到你真的做得到的位置。`
                : `完成度 ${pct(ratio)}%。這一期沒能走完不代表失敗，代表課表開得太重。下一期會從你現在的真實水準重新開始。`;

    return { grade, gradeLabel, completion: ratio, progress, strengths, gaps, summary, places: cyclePlaceSummary(plan), placeAdvice: place };
}

/* ════════════════════════════════════════════════════════════════════
   4. 下一套課表推薦
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   4.1 換期的專業標準（scripts/CYCLE_ROTATION_STANDARD.md R1–R8；
       scripts/audit_cycle_rotation.mjs 用同一組數字稽核）
   ════════════════════════════════════════════════════════════════════ */
export const RUN_ROTATION = {
    /** R1 下一期起點 ≤ 上一期實跑尖峰 × 這個比例（比賽型的尖峰後要先降下來，不是從 100% 接著衝） */
    START_OF_PEAK: { race_full: 0.7, race_half: 0.8, race_5k_10k: 0.85, default: 0.9 },
    /** R2 起點 ÷ 最後 4 週實跑平均（ACWR）不超過 1.3 */
    ACWR_MAX: 1.3,
    /** R4 有氧基礎 → 5K/10K：完成度 ≥ 80% 而且實際週量 ≥ 12 公里 */
    PROMOTE_RATIO: 0.8,
    PROMOTE_5K_BASE_KM: 12,
};
/** R6 停跑回來：週量打折、配速放慢（Coyle 1984、Mujika & Padilla 2000：停 2–4 週 VO₂max 約掉 4–7%，8 週約 15%） */
export const RUN_DETRAINING = [
    { minDays: 56, volume: 0.5, paceSlow: 0.07, levelDrop: 1 },
    { minDays: 28, volume: 0.7, paceSlow: 0.04, levelDrop: 0 },
    { minDays: 14, volume: 0.85, paceSlow: 0.02, levelDrop: 0 },
];
export function runDetraining(daysOff) {
    const d = Number(daysOff);
    const row = Number.isFinite(d) ? RUN_DETRAINING.find((x) => d >= x.minDays) : null;
    return row ? { ...row, days: Math.floor(d) } : { volume: 1, paceSlow: 0, levelDrop: 0, days: Number.isFinite(d) ? Math.max(0, Math.floor(d)) : 0 };
}
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];
const LEVEL_ZH_SHORT = { beginner: '初學', intermediate: '中階', advanced: '進階' };
const DAY_MS = 86400000;

/** 最後一次真的有跑是哪天（completed_at；沒有就用那一週的結束日估）。一趟都沒跑 → null */
export function lastRunAt(plan) {
    let last = null;
    const start = planStartDate(plan);
    (plan?.weeks || []).forEach((w, i) => (w.bricks || []).forEach((b) => {
        if (actualRunKm(b) <= 0) return;
        let t = b.completed_at ? new Date(b.completed_at).getTime() : NaN;
        if (!Number.isFinite(t) && start) t = start.getTime() + ((w.week_index || i + 1) * 7 - 1) * DAY_MS;
        if (Number.isFinite(t) && (last == null || t > last)) last = t;
    }));
    return last;
}

/** 停跑幾天：最後一次有跑到今天；整期一趟都沒跑 → 從這一期開始算 */
export function runDaysOff(plan, today = new Date()) {
    const last = lastRunAt(plan);
    const ref = last ?? planStartDate(plan)?.getTime() ?? null;
    if (ref == null) return 0;
    return Math.max(0, Math.floor((atMidnight(today).getTime() - atMidnight(new Date(ref)).getTime()) / DAY_MS));
}

/**
 * 依「這一期實際跑出來的結果」推薦下一期
 * @param {object} opts.today  今天（隔了多久才開下一期 → 停跑打折）
 * @returns {{ config, title, reasons:[], adjustments:[], realBaseline, projectedPeakKm, daysOff }}
 */
export function recommendNextPlan(plan, diagnosis = null, { today = new Date() } = {}) {
    const d = diagnosis || diagnosePlan(plan);
    const progress = d.progress;
    const ratio = d.completion;
    const det = runDetraining(runDaysOff(plan, today));

    const reasons = [];
    const adjustments = [];

    // ── 新起點（R1、R2）──────────────────────────────────────────────
    //   ① 這期最後幾個「訓練週」（不含減量週、賽前減量）真的跑到的量 —— 不是計劃量
    //   ② 不超過實跑尖峰的 70–90%（比賽型越長降越多）：尖峰之後要先降下來，不是 100% 接著衝
    //   ③ 不超過最後 4 週實跑平均 × 1.3（ACWR）
    //   ④ 停跑回來再打折（R6）；整期沒跑 → 從上一期的起點打折，不是歸零
    const trainingWeeks = progress.weeks.filter((w) => !w.isDeload && w.phase !== 'taper');
    const tail = trainingWeeks.slice(-4);
    const tailKm = tail.length ? tail.reduce((s, w) => s + w.actualKm, 0) / tail.length : 0;
    const peakKm = Math.max(0, ...progress.weeks.map((w) => w.actualKm));
    const last4 = progress.weeks.slice(-4);
    const chronicKm = last4.length ? last4.reduce((s, w) => s + w.actualKm, 0) / last4.length : 0;
    const startFactor = RUN_ROTATION.START_OF_PEAK[plan.goal] ?? RUN_ROTATION.START_OF_PEAK.default;
    let base = Math.min(tailKm, peakKm * startFactor);
    if (chronicKm > 0) base = Math.min(base, chronicKm * RUN_ROTATION.ACWR_MAX);
    const prevStartKm = Number(plan.meta?.totals?.start_km ?? plan.weeks?.[0]?.target_mileage_km) || 0;
    if (base <= 0 && prevStartKm > 0) base = prevStartKm;          // 整期沒跑：回到上一期的起點（再打折）
    const preBreak = base;
    base = round1(base * det.volume);
    const realBaseline = base;

    const prevGoal = plan.goal;
    const prevWeeks = plan.total_weeks;
    const prevSessions = Number(plan.meta?.planned_run_sessions ?? plan.sessions_per_week) || Number(plan.weeks?.[0]?.run_sessions) || 3;
    const returning = det.volume < 1;
    const longBreak = det.levelDrop > 0;

    // ── 目標（R4）──
    let goal = prevGoal;
    const target = RACE_TARGETS[prevGoal];
    const canPromote = ratio >= RUN_ROTATION.PROMOTE_RATIO && base >= RUN_ROTATION.PROMOTE_5K_BASE_KM && !returning;
    if (ratio < 0.5 || (longBreak && target)) {
        goal = 'aerobic_base';
        reasons.push(longBreak
            ? `停跑 ${Math.floor(det.days / 7)} 週，先回到打底 — 把有氧底子找回來再備賽。`
            : '這一期完成度偏低，下一期先回到打底 — 把規律找回來比追目標重要。');
    } else if (target && base >= target.minPeak * 0.72) {
        reasons.push(`你的實際週量已經到 ${base} 公里，可以正式進入${target.short}備賽課表了。`);
    } else if (prevGoal === 'aerobic_base' && canPromote) {
        goal = 'race_5k_10k';
        reasons.push(`底子打穩了（實際週量 ${base} 公里、完成度 ${pct(ratio)}%），下一期可以開始練速度。`);
    }
    if (returning) {
        reasons.push(`停跑 ${Math.floor(det.days / 7)} 週，週量從 ${round1(preBreak)} 降到 ${base} 公里重新開始。`);
    }

    // ── 每週次數（R5）──
    let sessions = prevSessions;
    if (d.gaps.some((g) => g.action === 'lower_frequency')) {
        sessions = Math.max(1, prevSessions - 1);
        adjustments.push(`每週次數 ${prevSessions} → ${sessions}（做得到的課表才有意義）`);
    } else if (ratio >= 0.95 && prevSessions < 6 && !returning) {
        sessions = prevSessions + 1;
        adjustments.push(`每週次數 ${prevSessions} → ${sessions}（你完整做完上一期，可以多一天）`);
    }

    // ── 週期長度 ──
    let weeks = prevWeeks;
    if (ratio >= 0.9 && prevWeeks < 12 && !returning) {
        weeks = Math.min(14, prevWeeks + 4);
        adjustments.push(`週期 ${prevWeeks} → ${weeks} 週（拉長才吃得到巔峰期）`);
    } else if (ratio < 0.5 && prevWeeks > 6) {
        weeks = Math.max(4, prevWeeks - 4);
        adjustments.push(`週期 ${prevWeeks} → ${weeks} 週（先完成一期短的，把信心拿回來）`);
    }

    // ── 是否加入速度訓練（跟升級 5K/10K 同一道門檻：完成度 ≥ 80%、週量 ≥ 12 公里）──
    if (d.gaps.some((g) => g.action === 'add_quality') && goal === 'aerobic_base' && canPromote) {
        goal = 'race_5k_10k';
        reasons.push('這期完全沒碰速度訓練 — 下一期加入節奏跑，同樣的努力會跑得更快。');
    }

    // ── 級別（R3）：延續上一期，不讓引擎因為沒填跑齡把老手當新手；
    //    停跑 8 週以上或這期沒能走完 → 降一級；整期 ≥ 90% 而且週量已到下一級 → 升一級（一次只升一級）
    const prevLevelIdx = LEVEL_ORDER.indexOf(plan.current_level);
    let levelIdx = prevLevelIdx < 0 ? -1 : Math.max(0, prevLevelIdx - ((longBreak || ratio < 0.5) ? 1 : 0));
    if (levelIdx >= 0 && ratio >= 0.9 && !returning && LEVEL_ORDER.indexOf(levelFromWeeklyKm(base)) > levelIdx) {
        levelIdx = Math.min(LEVEL_ORDER.length - 1, levelIdx + 1);
        adjustments.push(`程度 ${LEVEL_ZH_SHORT[plan.current_level]} → ${LEVEL_ZH_SHORT[LEVEL_ORDER[levelIdx]]}（整期做完、週量 ${base} 公里）`);
    }
    const currentLevel = levelIdx < 0 ? null : LEVEL_ORDER[levelIdx];

    // ── 配速基準（R7）：用這期最後 4 週真的跑出來的配速重估，停跑再放慢 ──
    const prevPace = Number(plan.meta?.baseline_pace_5k_sec) || null;
    // 最後 4 個「真的有跑」的週（只有跳過紀錄的週不算 —— 不然完成一半的人最後 4 週湊不到 3 趟，配速永遠不重估）
    const recentWeeks = (plan.weeks || []).filter((w) => (w.bricks || []).some((b) => actualRunKm(b) > 0)).slice(-4);
    const samples = recentWeeks.flatMap((w) => paceCalibrationSamples(w));
    let pace = prevPace;
    let paceSamples = 0;
    if (samples.length >= 3) {
        const cal = calibratePaceFromActuals(plan, samples, { smoothing: 0.6 });
        if (cal.samples >= 3 && cal.newBaselinePace5K) { pace = cal.newBaselinePace5K; paceSamples = cal.samples; }
    }
    if (pace && det.paceSlow > 0) pace = Math.round(pace * (1 + det.paceSlow));
    const fmt = (sec) => `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
    if (pace && prevPace && Math.abs(pace - prevPace) >= 3) {
        adjustments.push(`5K 配速基準 ${fmt(prevPace)} → ${fmt(pace)}／公里（${paceSamples ? `依這期 ${paceSamples} 趟實跑` : ''}${paceSamples && det.paceSlow ? '，' : ''}${det.paceSlow ? `停跑 ${Math.floor(det.days / 7)} 週放慢` : ''}）`);
    }

    // ── 場地：下一期是一份課表，照這期最常跑的地方排；偶爾去別處不改課表 ──
    const place = d.placeAdvice !== undefined ? d.placeAdvice : placeAdvice(plan);
    const mainPlace = (d.places || cyclePlaceSummary(plan)).main || null;
    if (place) adjustments.push(`速度課以節奏跑為主（你多在${place.main.name}跑，不是操場；間歇只做完 ${place.interval.done}／${place.interval.planned} 趟）`);

    // ── 比賽／尖峰之後（R1）：下一期第 1 週只排輕鬆跑，當作過渡週 ──
    const transitionWeek = !!RACE_TARGETS[prevGoal] && ratio >= 0.5 && !returning;

    const config = {
        goal,
        ...(place ? { qualityStyle: place.qualityStyle } : {}),
        totalWeeks: weeks,
        sessionsPerWeek: sessions,
        currentWeeklyKm: realBaseline,
        currentLevel,                       // 延續上一期的級別（引擎仍會依新基準線往上抬，不會往下壓）
        baselinePace5K: pace ?? null,
        includeStrength: plan.meta?.include_strength ?? true,
        ...(transitionWeek ? { transitionWeek: true } : {}),
    };

    // 直接生成看看會長怎樣（推薦必須講得出數字；跟按下套用用同一支 generateNextCyclePlan）
    let projectedPeakKm = null;
    let startKm = realBaseline;
    try {
        const preview = generateNextCyclePlan(config);
        projectedPeakKm = preview.meta?.totals?.peak_km ?? null;
        startKm = preview.meta?.totals?.start_km ?? startKm;
    } catch { /* 預覽失敗不影響推薦本身 */ }
    if (transitionWeek) reasons.push('剛跑完一個備賽週期，第 1 週只排輕鬆跑，讓身體先恢復。');
    if (!reasons.length || (reasons.length === 1 && transitionWeek)) {
        reasons.unshift(`延續同一個方向，用這期真實跑出來的量重新起步：第 1 週 ${startKm} 公里。`);
    }

    return {
        config,
        title: GOAL_NAMES[goal] || goal,
        goalId: goal,
        reasons,
        adjustments,
        realBaseline: startKm,              // 畫面上的「新起點」= 下一期第 1 週真的排的量
        baseKm: realBaseline,
        projectedPeakKm,
        mainPlace,
        daysOff: det.days,
    };
}

/**
 * 下一期課表：結業「直接套用」跟推薦預覽都用這一支（預覽＝實際）。
 * transitionWeek：比賽型週期剛結束 → 第 1 週的節奏／間歇改成輕鬆跑（量不變），當作過渡週。
 */
export function generateNextCyclePlan(config = {}) {
    const { transitionWeek, ...cfg } = config || {};
    const next = generateCardioPlan(cfg);
    if (!transitionWeek || !next?.weeks?.length) return next;
    const w = next.weeks[0];
    w.bricks = (w.bricks || []).map((b) => (
        ['tempo', 'interval'].includes(b.subtype)
            ? normalizeRunPrescription({ ...b, subtype: 'easy', type: 'recovery' },
                b.target_pace_sec ? b.target_pace_sec - (PACE_SHIFT_BY_SUBTYPE[b.subtype] ?? 60) : 360)
            : b
    ));
    w.transition = true;
    next.meta = { ...next.meta, transition_week: true };
    return finalizePlanNumbers(next);
}

export default {
    computePlanProgress,
    adjustNextWeek,
    autoAdjustPlan,
    planStartDate,
    planEndDate,
    currentWeekIndex,
    isPlanFinished,
    daysUntilEnd,
    weekState,
    trackingSnapshot,
    diagnosePlan,
    recommendNextPlan,
    generateNextCyclePlan,
};
