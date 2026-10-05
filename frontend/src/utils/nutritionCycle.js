/**
 * nutritionCycle.js — 一個營養週期的完整狀態機、跨系統判斷與圖表資料
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼要有這一支：
 *   「這一期現在是什麼狀態」原本散在四個地方各判各的（總覽的進度行、
 *   分析頁的卡、精靈的面板、教練摘要）。狀態一多就會出現互相矛盾的畫面 ——
 *   卡片說達標、標題說執行中，就是這樣來的。
 *
 *   這支把一個週期的「所有可能性」收成一張表：從沒有計劃、剛設定、第一週、
 *   沒量測、量測過期、正常、太快、太慢、反向、停滯、達標、超標，共 12 種。
 *   每一種都必須回答同樣三件事：現在是什麼狀態、要不要使用者做事、下一步是什麼。
 *
 * 跨系統：
 *   營養不能單獨看。熱量盈餘沒有重訓就是長脂肪；減脂沒有阻力訓練就是連肌肉一起掉。
 *   所以這裡把重訓與跑步的實際次數讀進來（ProgressReader 的正規 key），
 *   在「這一期」的區間內計算，並產出可以直接顯示的跨系統提醒。
 *
 * 誠實鐵律：
 *   · 一律用實測體重與實際完成的訓練，不用計劃值冒充
 *   · 沒有訓練資料就說「沒有紀錄」，不推測「應該有練」
 *   · 圖表的計劃線標明是計劃、實測點標明是實測，兩者不混成一條
 *   · 量測不夠多時不畫折線 —— 兩個點連成一條線會讓人以為中間都量過
 */

import { computeCutProgress } from './cutProgress';
import { buildCoachDigest } from './nutritionCoach';

const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** 一個週期可能出現的所有狀態。UI 不該自己發明第 13 種。 */
export const CYCLE_PHASES = [
    'no_plan',            // 還沒有計劃
    'week_one',           // 第一週：還不談配速
    'need_first_measure', // 這一期開始後從沒量過
    'measure_stale',      // 量測太舊（≥14 天）
    'on_track',           // 配速正常
    'too_fast',           // 太快（減脂 >1%/週）
    'too_slow',           // 太慢（不到目標一半）
    'stalled',            // 幾乎沒動
    'off_track',          // 往反方向
    'reached',            // 剛好達標
    'overshot',           // 超過目標
];

/* ─────────────────────────────────────────────────────────────────────
 * 跨系統：這一期實際練了什麼
 * ───────────────────────────────────────────────────────────────────── */

const parseDate = (v) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
};

/** 從正規 key 讀訓練紀錄（欄位別名容錯，與 ProgressReader 同一份來源）。 */
export function readTrainingInCycle(userId, plan, today = new Date()) {
    const empty = {
        strengthSessions: 0, cardioSessions: 0, weeks: 0,
        strengthPerWeek: 0, cardioPerWeek: 0, hasData: false,
    };
    if (!plan?.committedAt) return empty;
    const from = Number(plan.committedAt);
    const to = today.getTime();
    const weeks = Math.max(0.1, (to - from) / (7 * DAY));

    const readList = (key) => {
        try {
            const raw = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch { return []; }
    };
    const inRange = (rows) => rows.filter((r) => {
        const t = parseDate(r?.date || r?.completedAt || r?.timestamp || r?.startTime || r?.ts);
        return Number.isFinite(t) && t >= from && t <= to;
    }).length;

    // 兩種 key 都看：全域（ProgressReader 用的）與帶 userId 的舊格式
    const strengthRows = [...readList('workout_history'), ...readList(`workout_history_${userId}`)];
    const cardioRows = [...readList('cardio_sessions'), ...readList(`cardio_sessions_${userId}`)];

    const strengthSessions = inRange(strengthRows);
    const cardioSessions = inRange(cardioRows);

    return {
        strengthSessions, cardioSessions,
        weeks: r1(weeks),
        strengthPerWeek: r2(strengthSessions / weeks),
        cardioPerWeek: r2(cardioSessions / weeks),
        // 有讀到任何一筆紀錄才算「有資料」；完全沒有時不要說「你都沒練」
        hasData: strengthRows.length > 0 || cardioRows.length > 0,
    };
}

/**
 * 跨系統提醒：熱量與訓練必須一起看，否則會給出專業上錯誤的結論。
 * 回傳陣列（可能多條），每條都可以直接顯示。
 */
/* 每一條提醒都要能「按下去做那件事」。
   稽核前這些 note 只有標題與說明 —— 使用者看到「還沒有訓練紀錄」，
   卻沒有任何入口能去記錄，等於告訴他有問題然後把門關上。 */
const GO_LOG_WORKOUT = { label: '去記錄訓練', route: '/training-record-mobile' };
const GO_PLAN_WORKOUT = { label: '去安排重訓', route: '/workout-plan-mobile' };

export function crossSystemNotes(progress, training, phase) {
    const notes = [];
    if (!progress || progress.status === 'no_plan') return notes;
    const dir = progress.direction;

    if (!training.hasData) {
        notes.push({
            system: 'both', level: 'info',
            title: '還沒有訓練紀錄',
            detail: '記錄重訓或跑步之後，這裡會告訴你熱量與訓練搭不搭。',
            action: GO_LOG_WORKOUT,
        });
        return notes;
    }

    // 1. 增重卻幾乎沒重訓 —— 熱量盈餘會以脂肪為主，這是專業上必須講的
    if (dir === 'bulk' && training.strengthPerWeek < 2) {
        notes.push({
            system: 'strength', level: 'action',
            title: `重訓每週 ${training.strengthPerWeek} 次`,
            detail: '增重的熱量盈餘要靠重訓才會長成肌肉。每週少於兩次，增加的多半是脂肪。',
            action: GO_PLAN_WORKOUT,
        });
    }

    // 2. 減脂沒有阻力訓練 —— 掉的體重裡肌肉比例會上升
    if (dir === 'cut' && training.strengthPerWeek < 1.5) {
        notes.push({
            system: 'strength', level: 'watch',
            title: `重訓每週 ${training.strengthPerWeek} 次`,
            detail: '減脂期沒有阻力訓練，掉下來的體重裡肌肉會佔比較高。一週兩次就有差。',
            action: GO_PLAN_WORKOUT,
        });
    }

    // 3. 練得夠但體重沒動（增重）→ 問題在吃不夠，不是練不夠
    if (dir === 'bulk' && training.strengthPerWeek >= 2 && (phase === 'stalled' || phase === 'too_slow')) {
        notes.push({
            system: 'strength', level: 'insight',
            title: '練得夠，體重沒跟上',
            detail: '訓練量沒問題，卡住的是吃。先把熱量加上去再看兩週。',
        });
    }

    // 4. 跑量大 + 減得太快 → 提醒補回熱量
    if (dir === 'cut' && training.cardioPerWeek >= 3 && phase === 'too_fast') {
        notes.push({
            system: 'cardio', level: 'watch',
            title: `跑步每週 ${training.cardioPerWeek} 次`,
            detail: '跑量大又減得快，容易掉肌肉也容易累。訓練日記得把消耗吃回來。',
        });
    }

    // 5. 有在跑步 → 說明熱量怎麼加回（使用者最常問的問題）
    if (training.cardioPerWeek >= 1 && notes.every((n) => n.system !== 'cardio')) {
        notes.push({
            system: 'cardio', level: 'info',
            title: `跑步每週 ${training.cardioPerWeek} 次`,
            detail: '有訓練的那天，首頁的熱量目標會把當天消耗加回去，所以會比基準高。',
        });
    }

    return notes;
}

/* ─────────────────────────────────────────────────────────────────────
 * 狀態機：把一期的所有可能性收成一張表
 * ───────────────────────────────────────────────────────────────────── */

const STALL_KG_PER_WEEK = 0.08;   // 每週變化小於這個數字，視為沒動

/** 依實測進度判斷這一期落在哪一個狀態。 */
export function resolvePhase(progress, coach) {
    if (!progress || progress.status === 'no_plan') return 'no_plan';
    if (progress.status === 'no_measurement') return 'need_first_measure';
    if (coach?.status === 'need_measurement') return 'measure_stale';
    if (progress.status === 'too_early') return 'week_one';

    if (progress.remainingKg != null && progress.remainingKg <= 0.05) {
        return progress.overshootKg > 0.3 ? 'overshot' : 'reached';
    }
    if (progress.offTrack) return 'off_track';

    const dirSign = progress.direction === 'bulk' ? 1 : -1;
    const toward = (progress.actualPaceKgWk || 0) * dirSign;
    if (Math.abs(toward) < STALL_KG_PER_WEEK) return 'stalled';

    if (coach?.status === 'too_fast') return 'too_fast';
    if (coach?.status === 'too_slow') return 'too_slow';
    return 'on_track';
}

const PHASE_META = {
    no_plan: { label: '還沒有計劃', tone: 'idle', needsUser: true },
    week_one: { label: '第一週', tone: 'ok', needsUser: false },
    need_first_measure: { label: '還沒量體重', tone: 'action', needsUser: true },
    measure_stale: { label: '量測過期', tone: 'action', needsUser: true },
    on_track: { label: '配速正常', tone: 'ok', needsUser: false },
    too_fast: { label: '減太快', tone: 'action', needsUser: true },
    too_slow: { label: '配速偏慢', tone: 'watch', needsUser: true },
    stalled: { label: '卡住了', tone: 'watch', needsUser: true },
    off_track: { label: '走反了', tone: 'action', needsUser: true },
    reached: { label: '目標達成', tone: 'done', needsUser: true },
    overshot: { label: '已超過目標', tone: 'done', needsUser: true },
};

/* ─────────────────────────────────────────────────────────────────────
 * 圖表資料：計劃線 vs 實測點 vs 訓練次數（三者同一個時間軸）
 * ───────────────────────────────────────────────────────────────────── */

const readMeasurements = (userId) => {
    try {
        const raw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (!Array.isArray(raw)) return [];
        return raw.map((r) => ({
            t: parseDate(r?.measurement_date || r?.date || r?.created_at),
            w: Number(r?.weight_kg ?? r?.weight),
        })).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.w) && x.w > 30 && x.w < 300)
            .sort((a, b) => a.t - b.t);
    } catch { return []; }
};

const countInWeek = (rows, from, to) => rows.filter((r) => {
    const t = parseDate(r?.date || r?.completedAt || r?.timestamp || r?.startTime || r?.ts);
    return Number.isFinite(t) && t >= from && t < to;
}).length;

/**
 * 這一期每一週：計劃體重、實測體重（該週最後一筆）、重訓次數、跑步次數。
 * 計劃線與實測點分開兩個欄位 —— 不混成一條，使用者才知道哪個是事實。
 */
export function buildCycleChart(userId, plan, today = new Date()) {
    if (!plan?.committedAt || !(Number(plan.targetWeight) > 0)) return [];
    const from = Number(plan.committedAt);
    const start = Number(plan.currentWeight) || null;
    const target = Number(plan.targetWeight);
    const pace = Math.abs(Number(plan.pace) || 0);
    const dirSign = plan.goalType === 'bulk' ? 1 : -1;

    const elapsedWeeks = Math.max(1, Math.ceil((today.getTime() - from) / (7 * DAY)));
    const plannedWeeks = (start && pace > 0) ? Math.ceil(Math.abs(target - start) / pace) : elapsedWeeks;
    const weeks = Math.min(52, Math.max(elapsedWeeks, Math.min(plannedWeeks, elapsedWeeks + 8)));

    const measures = readMeasurements(userId);
    let strengthRows = [], cardioRows = [];
    try { strengthRows = JSON.parse(localStorage.getItem('workout_history') || '[]'); } catch { /* */ }
    try { cardioRows = JSON.parse(localStorage.getItem('cardio_sessions') || '[]'); } catch { /* */ }
    if (!Array.isArray(strengthRows)) strengthRows = [];
    if (!Array.isArray(cardioRows)) cardioRows = [];

    const rows = [];
    for (let w = 0; w <= weeks; w++) {
        const wFrom = from + w * 7 * DAY;
        const wTo = wFrom + 7 * DAY;

        // 計劃線：照當初的配速直線走，到目標為止就打平
        let planned = null;
        if (start && pace > 0) {
            const moved = pace * w;
            const totalGap = Math.abs(target - start);
            planned = r1(start + dirSign * Math.min(moved, totalGap));
        }

        // 實測：該週最後一筆量測（沒量就是 null，不內插、不補值）
        const inWeek = measures.filter((m) => m.t >= wFrom && m.t < wTo);
        const actual = inWeek.length ? r1(inWeek[inWeek.length - 1].w) : null;

        rows.push({
            week: w,
            planned,
            actual,
            strength: countInWeek(strengthRows, wFrom, wTo),
            cardio: countInWeek(cardioRows, wFrom, wTo),
            isFuture: wFrom > today.getTime(),
        });
    }
    return rows;
}

/* ─────────────────────────────────────────────────────────────────────
 * 目標刻度：目標 · 目前 · 趨勢，一眼看完
 * ─────────────────────────────────────────────────────────────────────
 * 為什麼不是折線圖：
 *   InBody 是「偶爾量一次」的資料 —— 八週可能只有兩、三個點。
 *   把兩三個點加上計劃線、重訓柱、跑步柱塞進一張 190px 高的手機圖，
 *   結果就是四條東西擠在一起，使用者看不出哪個是哪個（實測回饋）。
 *
 * 這裡改用「靶心刻度（bullet chart）」的資料：
 *   一條從起點到目標的軌道 → 填滿的部分是實測走到哪（目前狀態）、
 *   軌道上的一個記號是照原訂配速今天「應該」站在哪（趨勢的基準）。
 *   一個點就畫得出來，而且不可能誤讀。
 *
 * 誠實鐵律：填滿的長度一律來自實測（computeCutProgress），
 *   沒量過就是 0 並明說「還沒量過」，不用熱量推估頂替。
 */
export function buildGoalGauge(userId, plan, today = new Date()) {
    const empty = {
        ready: false, hasMeasure: false,
        start: null, target: null, current: null,
        dir: 'down', totalKg: 0,
        pctDone: 0, pctPlan: 0, planWeight: null,
        gapKg: null, trend: 'none', trendText: '', trendTone: 'idle',
        points: [], measureCount: 0, weeksElapsed: 0,
        ageDays: null, stale: false,
    };
    if (!plan?.committedAt || !(Number(plan.targetWeight) > 0)) return empty;

    const p = computeCutProgress(userId, plan, today);
    const start = p.startWeight != null ? p.startWeight : (Number(plan.currentWeight) || null);
    const target = p.targetWeight != null ? p.targetWeight : Number(plan.targetWeight);
    if (start == null || !(target > 0)) return empty;

    const totalKg = r1(Math.abs(target - start));
    const dir = target >= start ? 'up' : 'down';
    const pace = Math.abs(Number(plan.pace) || 0);
    const from = Number(plan.committedAt);
    const weeksElapsed = Math.max(0, (today.getTime() - from) / (7 * DAY));

    // 計劃上「今天」應該站在哪：照當初的配速直線走，到目標就停
    const plannedMoved = totalKg > 0 && pace > 0 ? Math.min(pace * weeksElapsed, totalKg) : 0;
    const planWeight = pace > 0 && totalKg > 0
        ? r1(start + (dir === 'up' ? 1 : -1) * plannedMoved)
        : null;
    const pctPlan = totalKg > 0 && pace > 0
        ? Math.max(0, Math.min(100, Math.round((plannedMoved / totalKg) * 100)))
        : 0;

    const hasMeasure = (p.status === 'ok' || p.status === 'too_early') && p.currentWeight != null;
    const pctDone = hasMeasure && p.progressPct != null ? p.progressPct : 0;

    // 實測量測點（含起點；起點本身就是承諾當下的那一筆量測，不是推估）
    const measures = readMeasurements(userId).filter((m) => m.t >= from - DAY);
    const points = measures.map((m) => ({
        week: Math.max(0, Math.round((m.t - from) / (7 * DAY))),
        kg: r1(m.w),
    }));
    if (!points.length || points[0].week > 0) points.unshift({ week: 0, kg: r1(start) });

    // 超前 / 落後：往目標方向，實際比計劃多走（少走）多少公斤
    let gapKg = null;
    let trend = 'none';
    let trendText = '開始後還沒量過體重';
    let trendTone = 'idle';
    if (!hasMeasure) {
        trend = 'none';
    } else if (weeksElapsed < 1) {
        trend = 'early';
        trendText = '第一週先不看配速';
        trendTone = 'idle';
    } else if ((p.movedKg || 0) < -0.2) {
        trend = 'reverse';
        trendText = `體重反而${dir === 'up' ? '少' : '多'}了 ${r1(Math.abs(p.movedKg))} kg`;
        trendTone = 'action';
    } else if (pace <= 0 || planWeight == null) {
        trend = 'on';
        trendText = '沒有設配速，只看有沒有往目標走';
        trendTone = 'ok';
    } else {
        gapKg = r1((p.movedKg || 0) - plannedMoved);
        if (gapKg >= 0.4) { trend = 'ahead'; trendText = `比計劃快 ${gapKg} KG`; trendTone = 'ok'; }
        else if (gapKg <= -0.4) { trend = 'behind'; trendText = `比計劃慢 ${r1(Math.abs(gapKg))} KG`; trendTone = 'watch'; }
        else { trend = 'on'; trendText = '照計劃走'; trendTone = 'ok'; }
    }

    return {
        ready: true, hasMeasure,
        start: r1(start), target: r1(target),
        current: hasMeasure ? r1(p.currentWeight) : null,
        dir, totalKg,
        pctDone, pctPlan, planWeight,
        gapKg, trend, trendText, trendTone,
        points, measureCount: points.length,
        weeksElapsed: r1(weeksElapsed),
        // 「目前」這個大數字可能是兩個月前量的。不標出來就等於謊報現況。
        ageDays: hasMeasure ? p.ageDays : null,
        stale: hasMeasure && p.ageDays != null && p.ageDays >= 14,
    };
}

/* ─────────────────────────────────────────────────────────────────────
 * 對外主函式
 * ───────────────────────────────────────────────────────────────────── */

/**
 * @returns {{
 *   phase:string, label:string, tone:string, needsUser:boolean,
 *   progress:object, coach:object|null,
 *   training:object, notes:Array, chart:Array,
 * }}
 */
export function buildCycleState(userId, plan, today = new Date()) {
    const progress = computeCutProgress(userId, plan, today);
    const coach = buildCoachDigest(userId, plan, today);
    const phase = resolvePhase(progress, coach);
    const meta = PHASE_META[phase] || PHASE_META.no_plan;
    const training = readTrainingInCycle(userId, plan, today);

    return {
        phase,
        label: meta.label,
        tone: meta.tone,
        needsUser: meta.needsUser,
        progress,
        coach,
        training,
        notes: phase === 'no_plan' ? [] : crossSystemNotes(progress, training, phase),
        chart: phase === 'no_plan' ? [] : buildCycleChart(userId, plan, today),
        // 目標 · 目前 · 趨勢：一眼看完的靶心刻度（折線圖只在量測夠多時當補充）
        gauge: phase === 'no_plan' ? buildGoalGauge(userId, null, today) : buildGoalGauge(userId, plan, today),
    };
}

export default buildCycleState;
