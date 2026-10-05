/**
 * dailyAgenda.js — 每日議程解析器（單一真相源）
 * ═══════════════════════════════════════════════════════════════
 * 回答一個問題：「我今天要做什麼？」
 *
 * 問題背景：重訓計劃（currentPlan, 週×Day）與跑步計劃（cardio bricks）
 * 各自為政 — 週曆只畫重訓、跑步用平均撒點猜日子、營養完全不知道今天練什麼。
 * 本模組把三者收斂成一份「週議程」，所有頁面（週曆 pills、今日卡、
 * 跑步頁、營養頁）都只讀這裡，不再各算各的。
 *
 * 排程演算法（跑步磚 → 星期，繞著重訓排）：
 *   1. 重訓日先固定（使用者排程 weeklyTrainingDays 優先；否則依天數用
 *      教科書分佈：3天=一三五、4天=一二四五…）
 *   2. 跑步質量課優先卡位：
 *      · long run → 週六優先（避開重訓日），其次週日
 *      · speed/tempo/interval → 非重訓日、且「不在腿日隔天」、
 *        質量課之間至少隔 1 天
 *   3. 輕鬆跑（recovery/easy）填剩餘空日；空日不夠 → 允許與
 *      「非腿日重訓」同日（雙 session），順序：重訓在前、輕鬆跑在後
 *   4. 硬規則：腿日不排任何質量跑；每週至少保留 1 天完全休息；
 *      質量跑絕不與重訓同日
 *   5. 補課：今天無排程但本週重訓還有沒練完的 Day、且昨天不是重訓日
 *      → 給「補課卡」（可跳過，不強迫）
 *
 * 營養日型連動：
 *   dayType → { kcalPct, carbTilt, message }，給營養頁顯示當日建議。
 *
 * 純函式設計：不打 API。輸入由呼叫端提供（bricks 來自
 * /api/cardio-plan/this-week，plan/排程來自 localStorage）。
 */

import { sessionVolume } from './strengthMath';
import { mondayWeekKey } from './localDate';

const JS_MON_FIRST = (jsDay) => (jsDay + 6) % 7;   // jsDay(0=日) → idx(0=一)
export const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// ── 🌅 6:00 日界線（單一真相源）────────────────────────────────
// 「一天」從早上 6 點開始：半夜 00–06 仍算前一天（夜貓 23:50 練完、
// 00:10 打開 app 不該看到「新的一天你還沒練」）。所有「今天」判定共用這裡。
export const DAY_START_HOUR = 6;
export const logicalNow = (now = new Date()) => new Date(now.getTime() - DAY_START_HOUR * 3600 * 1000);
/** 任意時間 → 邏輯日 key（YYYY-MM-DD，已套 6 點日界線） */
export const logicalDayKey = (d = new Date()) => {
    const t = d instanceof Date ? d : new Date(d);
    if (isNaN(t)) return '';
    const s = new Date(t.getTime() - DAY_START_HOUR * 3600 * 1000);
    return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
};

// ── ✅ 用「當天真實紀錄」覆寫今日完成狀態 ───────────────────────
// 計劃勾選（completed_workouts）是「課表第幾天」制，跨週/補課會與日期脫鉤，
// 造成「今天還沒練卻已打勾」。這裡以最終真相 —「邏輯今天是否真的有紀錄」— 覆寫：
//   • 重訓：今天有任一筆重訓 session（做該菜單或自由訓練都算）→ done
//   • 跑步：計劃磚已 completed，或今天有任一筆跑步類紀錄（含自由跑）→ done
// 今天沒有紀錄 → 把誤判的 done 拉回 false（誠實數據原則）。
const RUN_LIKE = new Set(['running', 'run', 'free', 'trail_running', 'trail', 'cardio', 'hiit']);

// ── 📏 完成度門檻（單一真相源）──────────────────────────────────
//
// 2026-08 稽核發現的問題：這裡原本是「今天有任一筆紀錄 → done」的二元判定。
// 結果是 12 組的菜單只做 1 組（8%）、10K 的計劃只跑 10 公尺，首頁一樣打勾、
// 一樣彈出慶祝頁、一樣說「今天有出門、有完成」—— 跟做滿的人逐字相同。
//
// 改成「達到當日計劃的 80% 才算完成」。未達門檻不是失敗，是「部分完成」：
// 紀錄照留、摘要照顯示，只是不打勾、不慶祝、不計連續天數。
//
// ⚠️ 算不出分母時一律回到舊行為（有紀錄即完成），這是刻意的：
//    · 自由訓練 / 自由跑本來就沒有「計劃量」可比
//    · 舊紀錄沒有存下當時的目標組數/距離快照，回溯計算會失真
//    寧可放過，不可錯殺 —— 不能讓使用者過去的連續天數被追溯打斷。
export const COMPLETION_THRESHOLD = 0.8;

const _num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** 這一格的重訓計劃總組數；算不出來回 0（呼叫端據此退回舊行為） */
function plannedStrengthSets(strengthCell) {
    const exs = strengthCell?.exercises;
    if (!Array.isArray(exs) || exs.length === 0) return 0;
    return exs.reduce((s, e) => s + (parseInt(e?.sets_target ?? e?.sets, 10) || 3), 0);
}

/** 這一格的跑步計劃距離(km) / 時長(min)；沒有回 0 */
function plannedRunTarget(runCell) {
    return {
        km: _num(runCell?.distance_km ?? runCell?.distanceKm),
        min: _num(runCell?.duration_min ?? runCell?.durationMin),
    };
}

/**
 * 完成率 → 狀態。
 * @returns {{pct:number, done:boolean, partial:boolean, measurable:boolean}}
 */
function gradeCompletion(actual, planned, hasRecord) {
    if (!hasRecord) return { pct: 0, done: false, partial: false, measurable: false };
    // 沒有分母 → 無法評分，退回舊行為：有紀錄就算完成
    if (!(planned > 0)) return { pct: 100, done: true, partial: false, measurable: false };
    const ratio = actual / planned;
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    const done = ratio >= COMPLETION_THRESHOLD;
    return { pct, done, partial: !done, measurable: true };
}

export function applyTodayRealDone(agenda, { strengthSessions = [], cardioSessions = [] } = {}, now = new Date()) {
    if (!agenda?.week) return agenda;
    const todayKey = logicalDayKey(now);
    const cell = agenda.week[agenda.todayIdx];
    if (!cell) return agenda;

    const todayStrength = (strengthSessions || []).filter(
        (s) => logicalDayKey(s.timestamp || s.date || s.created_at) === todayKey
    );
    const hasStrengthToday = todayStrength.length > 0;
    const todayRuns = (cardioSessions || []).filter((s) => {
        const kind = String(s.sport || s.sport_type || s.type || 'running').toLowerCase();
        return RUN_LIKE.has(kind) && logicalDayKey(s.created_at || s.date || s.timestamp) === todayKey;
    });
    const hasRunToday = todayRuns.length > 0;

    // ── 重訓完成度：今天實做組數 ÷ 這一格計劃組數 ──
    const _setCountOf = (s) => {
        if (_num(s?.hard_sets) > 0) return _num(s.hard_sets);
        if (Array.isArray(s?.detailedSets)) return s.detailedSets.length;
        if (Array.isArray(s?.sets)) return s.sets.length;
        return _num(s?.sets);
    };
    const doneSets = todayStrength.reduce((s, x) => s + _setCountOf(x), 0);
    const strengthGrade = gradeCompletion(doneSets, plannedStrengthSets(cell.strength), hasStrengthToday);

    // ── 跑步完成度：今天實跑距離 ÷ 計劃距離（沒距離就比時長）──
    const _runKm = (s) => _num(s?.distance ?? s?.distance_km ?? s?.metrics?.distance ?? s?.stats?.distance);
    const _runMin = (s) => _num(s?.duration_seconds ?? s?.duration_sec ?? s?.duration ?? s?.stats?.duration) / 60;
    const target = plannedRunTarget(cell.run);
    const runGrade = target.km > 0
        ? gradeCompletion(todayRuns.reduce((s, x) => s + _runKm(x), 0), target.km, hasRunToday)
        : gradeCompletion(todayRuns.reduce((s, x) => s + _runMin(x), 0), target.min, hasRunToday);

    /* done 的語意變了（現在代表「真的完成」），但欄位型別沒變，
       所有既有的 `if (cell.strength.done)` 都還能正常運作。
       donePct / partial 是新增的，給需要顯示「部分完成」的畫面用。 */
    if (cell.strength) {
        cell.strength = {
            ...cell.strength,
            done: strengthGrade.done,
            donePct: strengthGrade.pct,
            partial: strengthGrade.partial,
            gradable: strengthGrade.measurable,
        };
    }
    if (cell.run) {
        const planDone = cell.run.status === 'completed';
        const ok = planDone || runGrade.done;
        cell.run = {
            ...cell.run,
            status: ok ? 'completed' : (runGrade.partial ? 'partial' : (cell.run.status || 'pending')),
            donePct: runGrade.pct,
            partial: !ok && runGrade.partial,
            gradable: runGrade.measurable,
        };
    }

    /* 給慶祝頁與打卡面板的單一開關：只有「真的完成」才慶祝。
       部分完成仍會有 todayRunDone / todayStrengthDone 摘要可顯示，
       但不該跳出跟做滿一樣的慶祝文案。 */
    agenda.todayStrengthComplete = hasStrengthToday && strengthGrade.done;
    agenda.todayRunComplete = hasRunToday && runGrade.done;
    agenda.todayStrengthPct = strengthGrade.pct;
    agenda.todayRunPct = runGrade.pct;

    // ══════════════════════════════════════════════════════════════════════
    // ✅ 今日已達標的跑步摘要（給主頁卡片取代「還沒做的計劃」用）
    //
    //    使用者回報：「主頁跑步的卡牌似乎不會因為當天跑過步就取消顯示當日的
    //    原先計劃。只要使用者有達到跑步的開始，就可以把原先計劃改成顯示已達標，
    //    並顯示最近一次自由跑數據在主頁卡牌上，取代掉一直顯示的計劃，
    //    直到下次計劃到來。」
    //
    //    這裡只負責算出「今天做了什麼」的真實摘要（單一真相源），
    //    主頁卡片直接讀 agenda.todayRunDone 決定要顯示計劃還是已達標。
    // ══════════════════════════════════════════════════════════════════════
    if (hasRunToday) {
        const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
        const pick = (s, ...keys) => {
            for (const k of keys) {
                const v = k.split('.').reduce((o, kk) => (o == null ? o : o[kk]), s);
                if (v != null && n(v) > 0) return n(v);
            }
            return 0;
        };
        // 取「今天最後一筆」（最近一次）
        const latest = todayRuns
            .slice()
            .sort((a, b) => new Date(b.created_at || b.date || b.timestamp || 0)
                - new Date(a.created_at || a.date || a.timestamp || 0))[0];

        const distanceKm = pick(latest, 'distance', 'distance_km', 'metrics.distance', 'metrics.distance_km', 'stats.distance');
        const durationSec = pick(latest, 'duration_seconds', 'duration_sec', 'duration', 'metrics.duration', 'stats.duration');
        let paceSec = pick(latest, 'avg_pace', 'avgPace', 'pace', 'metrics.pace_per_km', 'stats.avgPace');
        if (!(paceSec >= 120 && paceSec <= 1200) && distanceKm > 0 && durationSec > 0) {
            paceSec = Math.round(durationSec / distanceKm);
        }

        agenda.todayRunDone = {
            sessionId: latest?.session_id || latest?.id || null,
            isFreeRun: !latest?.plan_brick_id && !latest?.brick_id,
            distanceKm: Math.round(distanceKm * 100) / 100,
            durationSec: Math.round(durationSec),
            paceSec: (paceSec >= 120 && paceSec <= 1200) ? Math.round(paceSec) : 0,
            count: todayRuns.length,
            at: latest?.created_at || latest?.date || latest?.timestamp || null,
            // 達成率：讓主頁卡片能分辨「跑完了」與「跑了一點」
            pct: runGrade.pct,
            complete: runGrade.done,
            partial: runGrade.partial,
            targetKm: target.km || 0,
        };
    } else {
        agenda.todayRunDone = null;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ✅ 今日已完成的重訓摘要 —— 給主頁卡片的「已達標 ＋ 慶祝特效」用。
    //    容量欄位別名多（volume / volume_kg / 由 detailedSets 反算），統一在這裡吃掉。
    // ══════════════════════════════════════════════════════════════════════
    if (hasStrengthToday) {
        const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
        // 這段原本是全站最完整的訓練量讀法，已升級成 strengthMath.sessionVolume()，
        // 其他頁面現在共用同一份。這裡改為直接呼叫，避免兩份邏輯各自漂移。
        const volOf = sessionVolume;
        const setCountOf = (s) => {
            if (n(s?.hard_sets) > 0) return n(s.hard_sets);
            if (Array.isArray(s?.detailedSets)) return s.detailedSets.length;
            if (Array.isArray(s?.sets)) return s.sets.length;
            return n(s?.sets);
        };
        const latest = todayStrength
            .slice()
            .sort((a, b) => new Date(b.timestamp || b.date || b.created_at || 0)
                - new Date(a.timestamp || a.date || a.created_at || 0))[0];

        agenda.todayStrengthDone = {
            sessionId: latest?.session_id || latest?.id || null,
            focus: latest?.focus || latest?.name || latest?.split || '',
            volumeKg: Math.round(todayStrength.reduce((s, x) => s + volOf(x), 0)),
            sets: todayStrength.reduce((s, x) => s + setCountOf(x), 0),
            durationSec: Math.round(todayStrength.reduce(
                (s, x) => s + n(x?.duration_seconds ?? x?.duration_sec ?? x?.duration), 0)),
            count: todayStrength.length,
            at: latest?.timestamp || latest?.date || latest?.created_at || null,
            // 達成率：8% 和 100% 不該顯示同一套文案
            pct: strengthGrade.pct,
            complete: strengthGrade.done,
            partial: strengthGrade.partial,
            targetSets: plannedStrengthSets(cell.strength) || 0,
        };
    } else {
        agenda.todayStrengthDone = null;
    }

    return agenda;
}

// 質量跑 vs 輕鬆跑分類
const QUALITY_TYPES = new Set(['long', 'speed', 'tempo', 'interval', 'race', 'hills']);
const RUN_TYPES = new Set(['long', 'speed', 'tempo', 'interval', 'race', 'hills', 'recovery', 'easy', 'zone2', 'base']);

// 預設重訓日分佈（無使用者自訂排程時），key = daysPerWeek，值 = idx(0=一)
const DEFAULT_STRENGTH_SPREAD = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * 沒有自訂排程時，daysPerWeek 會落在星期幾（JS getDay 索引，週日=0）。
 * 直接由 DEFAULT_STRENGTH_SPREAD 推導，確保「生成計劃時預告的日期」
 * 和 buildWeeklyAgenda 實際排出來的是同一組，不會前後不一致。
 */
export function defaultStrengthWeekdays(daysPerWeek = 0) {
    const n = Math.max(0, Math.min(7, Math.round(Number(daysPerWeek) || 0)));
    const spread = DEFAULT_STRENGTH_SPREAD[n];
    if (!spread) return [];
    return spread.map((idx) => (idx + 1) % 7);   // idx(0=一) → JS getDay(0=日)
}

/** 判斷重訓日是否為「腿日」（質量跑迴避的錨點） */
export function isLegDay(day) {
    if (!day) return false;
    const txt = `${day.focus || ''} ${day.shortFocus || ''} ${day.name || ''}`.toUpperCase();
    if (/LOWER|LEG|腿|下肢|GLUTE|臀/.test(txt)) return true;
    const exs = day.exercises || [];
    if (!exs.length) return false;
    const legCount = exs.filter(e => ['quads', 'hamstrings', 'glutes', 'legs'].includes(e.muscle)).length;
    return legCount / exs.length >= 0.5;
}

// ── 跑步磚本地快取 ──────────────────────────────────────────────
// this-week bricks 由首頁/儀表板抓 API 後寫入這裡（帶週標記），
// 讓「不打 API 的頁面」（營養頁、提醒引擎）也能知道今天是不是跑步日。
const BRICKS_CACHE_KEY = (uid) => `drvn:weekBricks_${uid}`;

const weekTag = (d = new Date()) => mondayWeekKey(d);

/** 抓到 this-week bricks 後呼叫，寫入本地快取。 */
export function cacheWeekBricks(userId, bricks) {
    try {
        localStorage.setItem(BRICKS_CACHE_KEY(userId), JSON.stringify({ tag: weekTag(), bricks: bricks || [] }));
    } catch { /* ignore */ }
}

/** 讀本週跑步磚快取；過週自動失效回空陣列。 */
export function loadCachedBricks(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(BRICKS_CACHE_KEY(userId)));
        if (raw?.tag === weekTag() && Array.isArray(raw.bricks)) return raw.bricks;
    } catch { /* ignore */ }
    return [];
}

/** 從 localStorage 讀重訓側輸入（呼叫端也可自己組） */
export function loadStrengthInputs(userId) {
    let plan = null, weeklySchedule = {}, activeWeek = 1, completed = [];
    try { plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`)); } catch { /* */ }
    if (plan?.weeks) {
        for (let w = 0; w < plan.weeks.length; w++) {
            let done = [];
            try { done = JSON.parse(localStorage.getItem(`completed_workouts_${userId}_week${w + 1}`)) || []; } catch { /* */ }
            if (done.length < (plan.weeks[w].days?.length || 0)) { activeWeek = w + 1; completed = done; break; }
            activeWeek = w + 1; completed = done;
        }
        try {
            const sched = JSON.parse(localStorage.getItem(`weeklyTrainingDays_${userId}`)) || {};
            weeklySchedule = sched[activeWeek] || {};
        } catch { /* */ }
    }
    return { plan, weeklySchedule, activeWeek, completed };
}

/**
 * 核心：把一週的重訓 Day 與跑步磚分派到星期一~日。
 * @returns {Array<{ strength, run, warnings: string[] }>} 長度 7，idx 0 = 週一
 */
/* ═══════════════════════════════════════════════════════════════════
   跑步磚的「使用者手動微調」存檔
   ─ dayOverrides：{ brickId: 星期index }        → 改期（併日）
   ─ runTweaks   ：{ brickId: {type,distance_km} } → 減量（改強度/距離）
   兩者都由 buildWeeklyAgenda 統一吃進去，首頁與中控台才會講同一件事。
   ═══════════════════════════════════════════════════════════════════ */
export const RUN_TWEAKS_KEY = (uid) => `u_${uid}_run_tweaks`;

export function loadRunTweaks(userId) {
    try { return JSON.parse(localStorage.getItem(RUN_TWEAKS_KEY(userId)) || '{}') || {}; }
    catch { return {}; }
}

export function saveRunTweak(userId, brickId, tweak) {
    if (!brickId) return false;
    try {
        const all = loadRunTweaks(userId);
        if (tweak) all[brickId] = { ...tweak, at: Date.now() };
        else delete all[brickId];
        localStorage.setItem(RUN_TWEAKS_KEY(userId), JSON.stringify(all));
        return true;
    } catch { return false; }
}

const RUN_TYPE_ZH = {
    recovery: '恢復跑', easy: '輕鬆跑', zone2: '有氧跑', base: '基礎跑',
    long: '長跑', tempo: '節奏跑', interval: '間歇跑', speed: '速度跑',
    hills: '坡度跑', race: '比賽',
};
export const runTypeZh = (t) => RUN_TYPE_ZH[t] || t || '跑步';

/**
 * 決定「這趟怎麼減」——質量課先降強度（最有效、最少犧牲里程），
 * 已經是輕鬆跑就砍距離。回傳 null 代表這趟沒得再減。
 */
export function computeReduceTweak(brick) {
    if (!brick) return null;
    const km = parseFloat(brick.distance_km ?? brick.distanceKm ?? 0) || 0;
    if (QUALITY_TYPES.has(brick.type)) {
        // 質量課 → 降為輕鬆跑，距離同時收到 70%（長跑最多留 8 km）
        const newKm = km > 0 ? Math.max(2, Math.round(km * 0.7 * 2) / 2) : 0;
        return {
            type: 'easy',
            ...(newKm ? { distance_km: brick.type === 'long' ? Math.min(newKm, 8) : newKm } : {}),
            fromType: brick.type, fromKm: km || null,
        };
    }
    if (km >= 3) {
        return { distance_km: Math.max(2, Math.round(km * 0.6 * 2) / 2), fromType: brick.type, fromKm: km };
    }
    return null;   // 已經是 <3 km 的輕鬆跑 → 沒得再減，該走「整趟拿掉」而不是減量
}

/** 把減量存檔套到跑步磚上（純函式，UI 與排程共用） */
export function applyRunTweaks(bricks, tweaks) {
    if (!tweaks || !Object.keys(tweaks).length) return bricks;
    return (bricks || []).map((b) => {
        const id = b?.brick_id || b?.brickId;
        const t = id && tweaks[id];
        if (!t) return b;
        const next = { ...b, _tweaked: true, _tweakFrom: { type: t.fromType, km: t.fromKm } };
        if (t.type) next.type = t.type;
        if (Number.isFinite(t.distance_km)) { next.distance_km = t.distance_km; next.distanceKm = t.distance_km; }
        next.title = `${runTypeZh(next.type)}${Number.isFinite(next.distance_km) ? ` ${next.distance_km}K` : ''}（已減量）`;
        return next;
    });
}

export function buildWeeklyAgenda({ plan, weeklySchedule = {}, activeWeek = 1, completed = [], cardioBricks = [], dayOverrides = {}, runTweaks = {} }) {
    const week = Array.from({ length: 7 }, () => ({ strength: null, run: null, warnings: [] }));
    const days = plan?.weeks?.[activeWeek - 1]?.days || [];

    // ── 1. 重訓日落位 ──────────────────────────────────────────
    const schedEntries = Object.entries(weeklySchedule || {});
    if (schedEntries.length > 0) {
        // 使用者自訂：{ jsDay: dayNumber }
        schedEntries.forEach(([jsDay, dayNum]) => {
            const idx = JS_MON_FIRST(parseInt(jsDay));
            const d = days[dayNum - 1];
            if (d) week[idx].strength = { ...d, dayNumber: dayNum, legDay: isLegDay(d), done: completed.includes(dayNum) };
        });
    } else if (days.length) {
        const spread = DEFAULT_STRENGTH_SPREAD[Math.min(days.length, 7)] || [0];
        spread.forEach((idx, i) => {
            const d = days[i];
            if (d) week[idx].strength = { ...d, dayNumber: i + 1, legDay: isLegDay(d), done: completed.includes(i + 1) };
        });
    }

    // ── 2. 跑步磚落位（繞著重訓排）──────────────────────────────
    // 先套使用者的減量存檔，再過濾／排程 —— 減量後的型別（如 tempo→easy）
    // 必須在落位前生效，否則「已降為輕鬆跑」的那趟還會被當質量課排開。
    const allBricks = applyRunTweaks(cardioBricks || [], runTweaks).filter(b => RUN_TYPES.has(b?.type));
    const bidOf = (b) => b?.brick_id || b?.brickId || null;
    // 2-0. 使用者「手動改期」的跑步磚 → 先釘到指定星期，其餘才走自動排程。
    //      這讓「拖動改期 / 幫我改週N那趟」的結果在首頁與中控台一致（同一支排程函式）。
    const overridden = new Set();
    Object.entries(dayOverrides || {}).forEach(([bid, di]) => {
        const idx = Number(di);
        if (!(idx >= 0 && idx < 7)) return;
        const b = allBricks.find((x) => bidOf(x) === bid);
        if (b && !week[idx].run) { week[idx].run = b; overridden.add(bid); }
    });
    const bricks = allBricks.filter((b) => !overridden.has(bidOf(b)));
    const quality = bricks.filter(b => QUALITY_TYPES.has(b.type));
    const easy = bricks.filter(b => !QUALITY_TYPES.has(b.type));

    const isStrength = (i) => !!week[i].strength;
    const isLeg = (i) => !!week[i].strength?.legDay;
    const dayAfterLeg = (i) => isLeg((i + 6) % 7);
    const hasRun = (i) => !!week[i].run;
    const hasQualityNear = (i) => [(i + 6) % 7, (i + 1) % 7].some(j => week[j].run && QUALITY_TYPES.has(week[j].run.type));

    const place = (brick, idx, warning) => {
        week[idx].run = brick;
        if (warning) week[idx].warnings.push(warning);
    };

    // 2a. long run → 週六(5)優先、週日(6)次之；兩者都撞 → 挑非腿日者，標雙 session
    const longRun = quality.find(b => b.type === 'long');
    if (longRun) {
        if (!isStrength(5) && !hasRun(5)) place(longRun, 5);
        else if (!isStrength(6) && !hasRun(6)) place(longRun, 6);
        else {
            const idx = [5, 6, 0, 1, 2, 3, 4].find(i => !hasRun(i) && !isLeg(i)) ?? [0, 1, 2, 3, 4, 5, 6].find(i => !hasRun(i));
            if (idx !== undefined) place(longRun, idx, isStrength(idx) ? '⚠️ 長跑與健身同日 — 請確認或調整日期' : null);
        }
    }

    // 2b. 其他質量課 → 非重訓日、非腿日隔天、與其他質量課隔 ≥1 天
    quality.filter(b => b !== longRun).forEach(brick => {
        const prefer = [1, 3, 2, 0, 4, 6, 5]; // 二四三一五日六
        let idx = prefer.find(i => !isStrength(i) && !hasRun(i) && !dayAfterLeg(i) && !hasQualityNear(i));
        if (idx === undefined) idx = prefer.find(i => !isStrength(i) && !hasRun(i) && !dayAfterLeg(i));
        if (idx === undefined) idx = prefer.find(i => !isStrength(i) && !hasRun(i));
        if (idx !== undefined) {
            const warns = [];
            if (dayAfterLeg(idx)) warns.push('⚠️ 腿日隔天的質量跑 — 注意腿部恢復');
            if (hasQualityNear(idx)) warns.push('⚠️ 與另一堂質量課相鄰 — 其中一天請保守配速');
            place(brick, idx, warns[0] || null);
            if (warns[1]) week[idx].warnings.push(warns[1]);
        } else {
            // 🛡️ 硬規則：質量跑「絕不」與重訓同日。空日不夠 → 自動降級為輕鬆跑
            // 再掛靠非腿日重訓日（同日雙 session 只允許「重訓＋輕鬆跑」組合）。
            const fallback = [0, 1, 2, 3, 4, 5, 6].find(i => isStrength(i) && !isLeg(i) && !hasRun(i));
            if (fallback !== undefined) {
                place(brick, fallback, '⚠️ 空日不足，質量跑與健身同日 — 請確認改期或回課表調整');
            } else {
                const remaining = [0, 1, 2, 3, 4, 5, 6].find(i => !hasRun(i));
                if (remaining !== undefined) place(brick, remaining, '⚠️ 本週安排密集 — 請調整日期');
            }
        }
    });

    // 2c. 輕鬆跑 → 填空日；不夠 → 與非腿日重訓同日（雙 session）
    easy.forEach(brick => {
        let idx = [1, 3, 5, 6, 0, 2, 4].find(i => !isStrength(i) && !hasRun(i));
        if (idx === undefined) idx = [0, 1, 2, 3, 4, 5, 6].find(i => isStrength(i) && !isLeg(i) && !hasRun(i));
        if (idx === undefined) idx = [0, 1, 2, 3, 4, 5, 6].find(i => !hasRun(i));
        if (idx !== undefined) place(brick, idx, isStrength(idx) ? '雙 session：重訓在前，輕鬆跑收操' : null);
    });

    // ── 3. 全休保護：一天都不剩 → 把「最輕的一天」的輕鬆跑讓位 ──
    const fullRest = week.some((d) => !d.strength && !d.run);
    if (!fullRest) {
        const idx = week.findIndex(d => !d.strength && d.run && !QUALITY_TYPES.has(d.run.type));
        if (idx !== -1) {
            week[idx].warnings.push('⚠️ 本週沒有完整休息日 — 建議改期或調整訓練頻率');
        } else {
            week.forEach(d => { if (d.strength && d.run) d.warnings.push('⚠️ 本週無完全休息日 — 注意恢復'); });
        }
    }

    // ── 4. 每日總負荷分（跨模態安全防護）─────────────────────────
    // 重訓量分（組數×係數＋腿日/extreme 加成）＋ 跑步 TRIMP 簡化版
    // （距離×類型係數；無距離時用時間）。>100 = 高負荷日 ⚠️；
    // 連續兩天高負荷 → 追加相鄰警告（兩個 hard 不該相鄰）。
    week.forEach((d) => {
        let score = 0;
        if (d.strength) {
            const exs = d.strength.exercises || [];
            const totalSets = exs.reduce((s, e) => s + (parseInt(e.sets) || 3), 0);
            score += Math.min(70, 35 + totalSets * 1.5);
            if (d.strength.legDay) score += 10;
            if (exs.some(e => e.cns === 'extreme')) score += 10;
        }
        if (d.run) {
            const km = parseFloat(d.run.distance_km ?? d.run.distanceKm ?? 0) || 0;
            const mins = parseFloat(d.run.duration_min ?? d.run.durationMin ?? 0) || 0;
            const hard = QUALITY_TYPES.has(d.run.type);
            score += km > 0 ? Math.min(60, km * (hard ? 8 : 4))
                : mins > 0 ? Math.min(60, mins * (hard ? 1.5 : 0.8))
                    : (hard ? 45 : 20);
        }
        d.loadScore = Math.round(score);
        d.highLoad = score > 100;
        if (d.highLoad) d.warnings.push(`⚠️ 高負荷日（負荷分 ${d.loadScore}）— 睡眠與補給優先，隔天安排輕鬆`);
    });
    week.forEach((d, i) => {
        const next = week[(i + 1) % 7];
        if (d.highLoad && next.highLoad && !next.warnings.some(w => w.includes('連續'))) {
            next.warnings.push('⚠️ 連續兩天高負荷 — 建議把其中一天的跑步改為輕鬆跑或休息');
        }
    });

    // 手動改期也走相同衝突檢查，不能繞過腿日／相鄰質量課提示。
    week.forEach((d, i) => {
        if (!d.run) return;
        if (d.strength && QUALITY_TYPES.has(d.run.type)) d.warnings.push('⚠️ 健身與質量跑同日，建議改期');
        if (QUALITY_TYPES.has(d.run.type) && week[(i + 6) % 7].strength?.legDay) d.warnings.push('⚠️ 腿日隔天安排質量跑，建議改期');
        if (QUALITY_TYPES.has(d.run.type) && QUALITY_TYPES.has(week[(i + 6) % 7].run?.type)) d.warnings.push('⚠️ 相鄰兩堂質量跑，建議間隔安排');
        d.warnings = [...new Set(d.warnings)];
    });
    const placed = new Set(week.filter(d => d.run).map(d => bidOf(d.run)));
    week.unplacedRuns = allBricks.filter(b => !placed.has(bidOf(b)));

    return week;
}

/**
 * 🎯 pickOverloadTarget — 把「這週排太滿」翻譯成「所以是週幾要動、要動什麼」。
 *
 * 2026-08 稽核發現的斷點：
 *   · checkWeeklyLoad()（trainingFocus.js）只收兩個聚合數字（重訓天數、跑步趟數），
 *     所以它算得出「一週 5 天太滿」，卻先天不知道「是哪一天」。
 *   · buildWeeklyAgenda() 排課時其實已經逐日產生了 warnings / highLoad，
 *     但中控台的 WeekPlan 元件從來沒讀過這些欄位。
 * 兩條線各自都有一半的答案，中間沒有人把它們接起來 —— 這支就是那座橋。
 *
 * 挑選邏輯：優先挑「有跑步、當天沒重訓、而且不是質量課」的那一天。
 * 理由是這種跑步最適合併進重訓日後面當輕鬆跑收操（質量課不能跟重訓同日，
 * 見 buildWeeklyAgenda 的硬規則），也就是最不痛的減量方式。
 *
 * @param {Array}  week  buildWeeklyAgenda 的回傳
 * @param {object} load  checkWeeklyLoad 的回傳（severity !== 'ok' 才有意義）
 * @returns {null | { dayIndex, weekday, reason, title, bullets, actionLabel, route, navState }}
 */
export function pickOverloadTarget(week, load) {
    if (!Array.isArray(week) || !load || load.severity === 'ok') return null;

    const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日'];

    // 候選 1：可以併進重訓日的輕鬆跑（最不痛）
    let dayIndex = week.findIndex(
        (d) => d?.run && !d?.strength && !QUALITY_TYPES.has(d.run.type)
    );
    let how = 'merge-run';

    // 候選 2：沒有可併的輕鬆跑 → 挑負荷最高、且有跑步可減的那天
    if (dayIndex === -1) {
        let best = -1, bestScore = -1;
        week.forEach((d, i) => {
            if (!d?.run) return;
            const s = Number(d.loadScore) || 0;
            if (s > bestScore) { bestScore = s; best = i; }
        });
        dayIndex = best;
        how = 'reduce-run';
    }

    if (dayIndex === -1) return null;

    const day = week[dayIndex];
    const zh = WEEKDAY_ZH[dayIndex] || String(dayIndex + 1);
    const isMerge = how === 'merge-run';

    // 合併時要併到「前一個重訓日」：從當天往前找最近的重訓日，找不到就往後找最近的。
    let mergeToDayIndex = null;
    if (isMerge) {
        for (let k = 1; k <= 6; k++) {
            const j = (dayIndex - k + 7) % 7;
            if (week[j]?.strength) { mergeToDayIndex = j; break; }
        }
        if (mergeToDayIndex == null) {
            for (let k = 1; k <= 6; k++) {
                const j = (dayIndex + k) % 7;
                if (week[j]?.strength) { mergeToDayIndex = j; break; }
            }
        }
    }

    const brickId = day.run?.brick_id || day.run?.brickId || null;

    /* 減量案：先算出「改完會變成什麼」，這樣按鈕才敢直接動手，
       而不是把使用者丟進編輯器自己想（使用者回饋：「你應該直接幫使用者改好」）。 */
    const reduceTweak = isMerge ? null : computeReduceTweak(day.run);
    const mergeToZh = mergeToDayIndex != null ? WEEKDAY_ZH[mergeToDayIndex] : null;
    const fromLabel = day.run
        ? `${runTypeZh(day.run.type)}${Number.isFinite(parseFloat(day.run.distance_km ?? day.run.distanceKm))
            ? ` ${parseFloat(day.run.distance_km ?? day.run.distanceKm)}K` : ''}`
        : '這趟';
    const toLabel = reduceTweak
        ? `${runTypeZh(reduceTweak.type || day.run?.type)}${Number.isFinite(reduceTweak.distance_km)
            ? ` ${reduceTweak.distance_km}K` : ''}`
        : null;

    const canAutoApply = !!brickId && (isMerge ? mergeToDayIndex != null : !!reduceTweak);

    /* 複雜規則一律用列點，不寫成一大段（2026-08 UI 準則）。
       第一點講「為什麼太滿」，第二點講「為什麼挑這天」，第三點講「按下去會發生什麼」。 */
    const bullets = [
        load.message || `一週總量超過建議上限（${load.maxTotal ?? '—'} 天）`,
        isMerge
            ? `週${zh}只有跑步、沒有重訓，是最適合先動的一天`
            : `週${zh}的負荷分最高（${day.loadScore ?? '—'}），先從這天減最有效`,
        isMerge
            ? (mergeToZh
                ? `按下去：這趟直接移到週${mergeToZh}的重訓日後面，當輕鬆跑收操`
                : `按下去：這趟併到最近的重訓日後面，當輕鬆跑收操`)
            : (toLabel
                ? `按下去：週${zh}的 ${fromLabel} 直接改成 ${toLabel}，其他天不動`
                : `這趟已經是最短的輕鬆跑，減不下去了 —— 建議直接改成休息日`),
    ];

    return {
        dayIndex,
        weekday: zh,
        how,                                   // 'merge-run' | 'reduce-run'
        brickId,
        mergeToDayIndex,                       // 合併目標星期（供「直接幫我改」用）
        mergeToWeekday: mergeToZh,
        reduceTweak,                           // 減量要寫進 runTweaks 的內容
        fromLabel,
        toLabel,
        canAutoApply,
        reason: 'weekly_overload',
        title: `一週排太滿，週${zh}那趟可以${isMerge ? '合併' : '減量'}`,
        bullets,
        actionLabel: canAutoApply
            ? (isMerge ? `直接幫我併到週${mergeToZh}` : `直接幫我改成 ${toLabel}`)
            : `去改週${zh}那趟`,
        route: '/cardio-plan-editor',
        navState: {
            returnTo: '/training-focus',
            highlightBrickId: day.run?.brick_id || day.run?.brickId || null,
            highlightDayIndex: dayIndex,
            reduceHint: isMerge
                ? `這趟可以併到重訓日後面，改成輕鬆跑收操`
                : `這趟可以減距離或趟數，讓一週總天數降下來`,
        },
    };
}

/**
 * 今日議程：dayType + 區塊清單 + 補課建議 + 營養提示。
 * @param {object} inputs  buildWeeklyAgenda 的輸入
 * @param {Date}   [now]
 */
/**
 * 首頁與中控台共用的「一週排程輸入」。
 *
 * ⚠️ 兩邊都呼叫同一支 buildWeeklyAgenda，但以前各自組 inputs：
 *     中控台  { ...loadStrengthInputs, cardioBricks, dayOverrides, runTweaks }
 *     首頁    { ...loadStrengthInputs, cardioBricks }            ← 少兩個
 *   於是使用者在中控台把週二那趟跑步改到別天、或把某趟減量之後，
 *   首頁完全看不到 —— 中控台顯示「週二 4K」，首頁顯示「週二休息」。
 *   同一支演算法、不同輸入，一樣會得到兩個答案。
 *
 * 輸入也收成一份，兩邊才真的一致。
 *
 * @param {string} userId
 * @param {{cardioBricks?: Array}} [opts] 已經在手上的跑步磚（首頁抓完 API 會有）；
 *        沒給就讀本地快取。首頁抓到之後會 cacheWeekBricks，所以兩者同源。
 */
/* ══════════════════════════════════════════════════════════════════════════
 * 「這週的建議已經照做了」旗標
 * ══════════════════════════════════════════════════════════════════════════
 * 使用者按了「直接幫我併」之後，那張警示卡不該下次進來又跳一次。
 *
 * ⚠️ 旗標一定要綁「哪一週」（weekTag）。只記「看過了」的話，下週真的又排太滿
 *    時會被永久壓住，等於這個提醒從此失效（介面標準 §8：存哪一週的旗標，
 *    要跟當前的週比對，不是只檢查有沒有值）。
 *    也綁 brickId —— 改的是別趟的話，這張新建議還是該出現。
 */
const ADVICE_KEY = (userId) => `drvn_advice_applied_${userId || 'guest'}`;

/** 記下「這一週的這一則建議已經照做」。 */
export function markAdviceApplied(userId, reason, targetId) {
    try {
        const all = JSON.parse(localStorage.getItem(ADVICE_KEY(userId)) || '{}') || {};
        all[`${reason}:${targetId}`] = weekTag();
        localStorage.setItem(ADVICE_KEY(userId), JSON.stringify(all));
    } catch { /* 存不進去就當作沒按過，頂多多跳一次 */ }
}

/** 復原之後要把旗標清掉 —— 排程退回去了，建議就該重新出現。 */
export function clearAdviceApplied(userId, reason, targetId) {
    try {
        const all = JSON.parse(localStorage.getItem(ADVICE_KEY(userId)) || '{}') || {};
        delete all[`${reason}:${targetId}`];
        localStorage.setItem(ADVICE_KEY(userId), JSON.stringify(all));
    } catch { /* */ }
}

/** 這一週的這一則建議，使用者照做過了嗎？跨週自動失效。 */
export function wasAdviceApplied(userId, reason, targetId) {
    try {
        const all = JSON.parse(localStorage.getItem(ADVICE_KEY(userId)) || '{}') || {};
        return all[`${reason}:${targetId}`] === weekTag();
    } catch { return false; }
}

export function loadWeekInputs(userId, { cardioBricks = null } = {}) {
    let dayOverrides = {};
    try { dayOverrides = JSON.parse(localStorage.getItem(`u_${userId}_run_day_overrides`) || '{}') || {}; }
    catch { dayOverrides = {}; }
    return {
        ...loadStrengthInputs(userId),
        cardioBricks: cardioBricks ?? (loadCachedBricks(userId) || []),
        dayOverrides,
        runTweaks: loadRunTweaks(userId),
    };
}

/**
 * 精靈用的「排出來會長怎樣」預覽。
 *
 * ⚠️ 為什麼不再用 trainingFocus.proposeComplementDays：
 *   那支的參數只有 { takenDays, need } —— 拿不到課種、也不知道哪天是腿日。
 *   所以它不可能把長跑放週末、不可能讓質量跑避開腿日隔天，
 *   而畫面上偏偏寫著「質量跑另外避開腿日隔天」—— 文案在承諾程式做不到的事。
 *   同一組資料，它排週二四六，中控台排出來完全不同的一週。
 *
 * 現在精靈預告的就是中控台與首頁實際會排的，因為走的是同一支
 * buildWeeklyAgenda：長跑優先週六、質量跑避開腿日隔天、質量跑不相鄰，
 * 連 warnings 都是同一份（介面標準 §8：畫面預告的結果要跟實際執行的函式同源）。
 *
 * @param {string} userId
 * @param {object} [override]
 * @param {Array}  [override.strengthDays] 還沒存檔的重訓日（健身精靈用）；
 *        省略就讀使用者現有的重訓計劃。
 * @param {Array}  [override.runBricks] 還沒存檔的跑步磚（跑步精靈用）；
 *        省略就讀使用者現有的跑步課表。
 * @returns {Array} 長度 7，idx 0 = 週一，跟 buildWeeklyAgenda 同一個形狀
 */
/**
 * 預覽用的跑步磚：這週已經同步下來的課表優先；還沒有（新的一週還沒抓、或剛註冊）就用
 * 註冊時的跑步計劃第 1 週 —— 不然畫面上寫「已排 2 趟跑步」，七天格子裡卻一趟都沒有。
 * 只有趟數沒有課種時，照跑步計劃的慣例補：1 趟輕鬆跑，2 趟＋長跑，3 趟再＋節奏跑。
 */
export function loadPlannedRunBricks(userId) {
    const cached = loadCachedBricks(userId) || [];
    if (cached.some((b) => b && b.distance_km != null)) return cached;
    try {
        const plan = JSON.parse(localStorage.getItem(`u_${userId}_onboarding_cardio_plan`) || 'null');
        const w = plan?.weeks?.[0];
        if (Array.isArray(w?.bricks) && w.bricks.some((b) => b && b.distance_km != null)) return w.bricks;
        const n = Number(w?.run_sessions) || 0;
        if (n > 0) {
            const types = ['easy', 'long', 'tempo', 'easy', 'recovery', 'easy'].slice(0, n);
            return previewBricks(types);
        }
    } catch { /* */ }
    return cached;
}

export function previewWeek(userId, { strengthDays = null, runBricks = null, weeklySchedule = null } = {}) {
    const base = loadWeekInputs(userId, { cardioBricks: runBricks ? null : loadPlannedRunBricks(userId) });
    return buildWeeklyAgenda({
        ...base,
        ...(strengthDays
            /* 還沒存檔的課表沒有 weeklySchedule，清空才會走
               DEFAULT_STRENGTH_SPREAD —— 跟中控台對新計劃的處理一致；
               使用者在精靈裡自己調過星期（weeklySchedule：{JS 星期: 第幾天}）就照他排的 */
            ? { plan: { weeks: [{ days: strengthDays }] }, weeklySchedule: weeklySchedule || {}, activeWeek: 1, completed: [] }
            : {}),
        ...(runBricks ? { cardioBricks: runBricks, dayOverrides: {}, runTweaks: {} } : {}),
    });
}

/** 預覽用的假跑步磚：只要有 type 就夠 buildWeeklyAgenda 判斷怎麼排。 */
export function previewBricks(subtypes = []) {
    return subtypes
        .filter((t) => t && t !== 'strength')
        .map((t, i) => ({ brick_id: `preview_${i}`, type: t, subtype: t }));
}

export function getTodayAgenda(inputs, now = new Date()) {
    const week = buildWeeklyAgenda(inputs);
    // 🌅 6:00 日界線：半夜 00–06 打開 app，「今天」仍是昨晚那一天；
    //    早上 6 點整才切換成新一天的計劃。
    const idx = JS_MON_FIRST(logicalNow(now).getDay());
    const today = week[idx];
    const { plan, activeWeek = 1, completed = [] } = inputs;
    const days = plan?.weeks?.[activeWeek - 1]?.days || [];

    const blocks = [];
    if (today.strength && !today.strength.done) {
        blocks.push({ type: 'strength', title: today.strength.focus || today.strength.name || `Day ${today.strength.dayNumber}`, payload: today.strength });
    }
    if (today.run && today.run.status !== 'completed') {
        blocks.push({ type: 'run', title: today.run.title || today.run.type, payload: today.run });
    }

    // 補課：今天全空、但本週還有沒練完的重訓 Day、且昨天不是剛練完重訓
    let makeup = null;
    /* 課表名稱長這樣：「推力強化 (胸·肩·三頭)（強化 肩）」——
       括號裡是同一件事講第二次，畫面上只會變成一長串看不懂的字。
       拆成「名字 · 部位」兩段，卡片才讀得下去。 */
    const tidyFocus = (raw) => {
        const txt = String(raw || '').trim();
        if (!txt) return { name: '', parts: '' };
        const m = txt.match(/^([^(（]+)[(（]([^)）]*)[)）]/);
        if (!m) return { name: txt, parts: '' };
        return {
            name: m[1].trim(),
            parts: m[2].replace(/[·・]/g, '').replace(/\s+/g, '').trim(),
        };
    };
    if (blocks.length === 0 && days.length) {
        // 只補「已經錯過」的：排在今天之前、還沒練的那幾天（或根本沒排進週曆的）。
        // 以前連週五才要練的 Day 也拿來當週二的補課 —— 等於把休息日變成練習日。
        const slotOf = (n) => week.findIndex((c) => c?.strength?.dayNumber === n);
        const remaining = days.map((d, i) => ({ d, n: i + 1 }))
            .filter(({ d }) => d?.exercises?.length !== 0)
            .filter(({ n }) => !completed.includes(n))
            .filter(({ n }) => { const at = slotOf(n); return at === -1 || at < idx; });
        // 昨天剛完成重訓 → 今天的休息是刻意安排，不給補課卡（避免連續兩天硬練）。
        // 週一的「昨天」是上週日，不在這週的週曆裡 —— 不能讀 week[6]（那是這週日）。
        const yesterdayTrained = idx > 0 && !!week[idx - 1].strength?.done;
        if (remaining.length > 0 && !yesterdayTrained) {
            const next = remaining[0];
            const tidy = tidyFocus(next.d.focus || `Day ${next.n}`);
            makeup = {
                type: 'makeup',
                title: `補課：${next.d.focus || `Day ${next.n}`}`,   // 舊呼叫端仍在用
                name: tidy.name || `Day ${next.n}`,   // 「推力強化」
                parts: tidy.parts,                     // 「胸肩三頭」
                remaining: remaining.length,           // 這週還有幾堂沒練
                payload: { ...next.d, dayNumber: next.n },
            };
        }
    }

    const dayType = blocks.length === 2 ? 'dual'
        : blocks.length === 1 ? blocks[0].type
            : makeup ? 'makeup' : 'rest';

    return {
        dayType,                      // 'strength' | 'run' | 'dual' | 'makeup' | 'rest'
        blocks,                       // 今天要做的（依順序：重訓在前）
        makeup,                       // 可選補課卡（null = 無）
        warnings: today.warnings,
        week,                         // 整週議程（給週曆 pills 用）
        todayIdx: idx,
        nutrition: nutritionHintFor(dayType, today, plan, activeWeek),
    };
}

/** 營養日型提示：今天練什麼 → 今天怎麼吃 */
export function nutritionHintFor(dayType, today, plan, activeWeek) {
    const isDeload = (plan?.weeks?.length === 4 && activeWeek === 4) || /deload|減量/i.test(plan?.weeks?.[activeWeek - 1]?.phase || plan?.weeks?.[activeWeek - 1]?.name || '');
    /* 一天只講一句、一句只講一件要做的事，20 字以內。
       原本每句 30–55 字，而且講的是系統依據（「依已確認的飲食計劃進行」），
       不是使用者今天要做什麼。 */
    /* kcalPct 固定 0：當日建議只調整「吃什麼、何時吃」，不改已確認的熱量目標。 */
    if (isDeload) return { kcalPct: 0, carbTilt: false, message: '這週照平常吃，睡飽' };
    switch (dayType) {
        case 'dual':
            return { kcalPct: 0, carbTilt: true, message: '兩段訓練中間補一餐' };
        case 'strength':
            return today?.strength?.legDay
                ? { kcalPct: 0, carbTilt: true, message: '練腿前先吃到主食' }
                : { kcalPct: 0, carbTilt: true, message: '每一餐都要有蛋白質' };
        case 'run':
            return { kcalPct: 0, carbTilt: true, message: '跑之前先吃自己耐受的主食' };
        case 'makeup':
            return { kcalPct: 0, carbTilt: true, message: '補課前先吃一餐' };
        default:
            return { kcalPct: 0, carbTilt: false, message: '休息日不用少吃' };
    }
}
