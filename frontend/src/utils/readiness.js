/**
 * readiness.js —— 準備度的單一真相源
 * ════════════════════════════════════════════════════════════════
 * 「準備度」= 今天身體能吃多少訓練。它由幾個訊號合成：
 *
 *   訓練負荷   重訓與跑步之後的肌群恢復（一定有，只要練過）
 *   睡眠       昨晚睡了幾小時（HealthKit）
 *   HRV        今天的 SDNN 對照「自己的」近 30 天基準
 *   靜息心率   今天的 RHR 對照自己的基準
 *
 * 三條硬規則：
 *
 * ① 沒有的訊號不參與，也不用預設值頂替。
 *    睡眠沒資料就是沒有 —— 塞一個「7.6 小時」進去，算出來的準備度
 *    有一半是編的，而畫面不會說哪一半。
 *
 * ② HRV 與靜息心率一定要有「自己的基準」才算得準。
 *    HRV 的絕對值因人而異（30ms 對某些人是正常、對某些人是警訊），
 *    只有跟自己近 30 天比才有意義。樣本不足 MIN_BASELINE_SAMPLES 就不採用，
 *    不是拿population 門檻硬套。
 *
 * ③ 全部都沒有 → 回 null，畫面顯示「去練一場」，不是一個滿分數字。
 *    只有訓練負荷 → 就用訓練負荷（使用者要的退回行為）。
 *
 * 回傳一定帶 `from`：這個數字用了哪些訊號。畫面要寫出來 ——
 * 一個合成數字不講它從哪來，跟沒講一樣。
 */

import { readJSON } from './safeStorage';
import { getMuscleRecoveryScores, readinessFromScores } from './muscleRecoveryTracker';

/** HRV / 靜息心率至少要這麼多天的樣本，才敢拿來比 */
export const MIN_BASELINE_SAMPLES = 7;

/** 各訊號的權重。訓練負荷與睡眠是主角，HRV／靜息心率是佐證。 */
export const WEIGHTS = { load: 0.4, sleep: 0.4, hrv: 0.15, rhr: 0.05 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/* ⚠️ 不可以只寫 Number.isFinite(Number(v))：Number(null) 是 0、Number('') 也是 0、
   Number(false) 還是 0 —— 那會把「沒有這個訊號」變成「這個訊號是 0 分」，
   一個沒睡眠資料的人會被當成睡眠 0 分收進平均。缺就是缺，不是 0。 */
const num = (v) => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const KEY = (userId) => `drvn_recovery_signals_${userId || 'guest'}`;
/** HealthKit 的訊號最多信 18 小時 —— 昨晚的睡眠今天中午還算數，明天就不算 */
const MAX_AGE_MS = 18 * 60 * 60 * 1000;

/** HRV / 靜息心率「今天那一筆」最多可以是多久以前量的。
 *  ⚠️ 原生端拿的是近 30 天裡「最新的一筆」—— 手錶三天沒戴，那一筆就是三天前的，
 *     卻被當成今天的 HRV 去跟基準比。超過這個時間就當作今天沒量。 */
export const MAX_SAMPLE_AGE_MS = 36 * 60 * 60 * 1000;

/** 睡眠少於這個時數，視為「沒有完整記錄到一晚」而不是「只睡了這麼久」。
 *  ⚠️ 沒戴手錶睡覺時，HealthKit 只會有零碎片段（手機、半夜戴上一下）——
 *     加起來 1 小時，被算成「睡 1 小時 → 睡眠 20 分」，準備度整個被拖到 30 幾。
 *     這個門檻寧可漏掉一個真的只睡 2 小時的晚上，也不要把沒記錄當成沒睡。 */
export const MIN_TRACKED_SLEEP_HOURS = 3;

/**
 * 存下原生端送來的訊號（useHealthKit 收到 readinessUpdate 就呼叫）。
 * 只存「真的有值」的欄位：原生端回 null 代表那項沒授權或沒資料，
 * 存 null 進去會把上一次的真實值蓋掉。
 */
export const saveRecoverySignals = (userId, raw = {}) => {
    if (!userId) return null;
    /* ⚠️ 不合併上一次的值。原生端每次送的都是「現在」的完整快照：
       這次沒有睡眠，就是昨晚沒記錄到。以前是 { ...prev, at: now } ——
       一個月前戴錶睡的那一晚，會每天被蓋上新的時間戳，一直被當成「昨晚」。 */
    const next = { at: Date.now() };
    const put = (k, v) => { const n = num(v); if (n !== null && n > 0) next[k] = n; };
    put('sleepHours', raw.sleepHours);
    put('hrv', raw.hrv);
    put('hrvBaseline', raw.hrvBaseline);
    put('hrvSamples', raw.hrvSamples);
    put('restingHr', raw.restingHr);
    put('restingHrBaseline', raw.restingHrBaseline);
    put('restingHrSamples', raw.restingHrSamples);
    put('hrvAt', raw.hrvAt);               // 那一筆 HRV 是什麼時候量的（epoch ms）
    put('restingHrAt', raw.restingHrAt);
    try { localStorage.setItem(KEY(userId), JSON.stringify(next)); } catch { /* 配額滿 → 略過 */ }
    return next;
};

/** 讀回訊號；太舊就當作沒有（昨天的睡眠不能拿來講今天）。 */
export const readRecoverySignals = (userId) => {
    const s = readJSON(KEY(userId), null);
    if (!s || !s.at) return null;
    if (Date.now() - Number(s.at) > MAX_AGE_MS) return null;
    return s;
};

/* ── 各訊號各自換算成 0–100 ────────────────────────────────────── */

/** 睡眠：8 小時 = 100。不設 50 分的地板 —— 睡 3 小時就是要看得出來。 */
export const sleepScoreOf = (hours) => {
    const h = num(hours);
    if (h === null || h < MIN_TRACKED_SLEEP_HOURS) return null;
    return Math.round(clamp((h / 8) * 100, 20, 100));
};

/**
 * HRV：跟「自己的」基準比，不是跟別人比。
 * 比值 1.05 以上 = 100、0.85 = 50、0.65 以下 = 0。
 */
export const hrvScoreOf = (today, baseline, samples) => {
    const t = num(today), b = num(baseline), n = num(samples);
    if (t === null || b === null || b <= 0) return null;
    if (n === null || n < MIN_BASELINE_SAMPLES) return null;   // 樣本不夠就不敢講
    return Math.round(clamp(50 + (t / b - 0.85) * 250, 0, 100));
};

/**
 * 靜息心率：比自己的基準高就是還沒恢復。
 * 持平 = 100、+5 bpm = 50、+10 以上 = 0（低於基準一律 100）。
 */
export const rhrScoreOf = (today, baseline, samples) => {
    const t = num(today), b = num(baseline), n = num(samples);
    if (t === null || b === null || b <= 0) return null;
    if (n === null || n < MIN_BASELINE_SAMPLES) return null;
    return Math.round(clamp(100 - (t - b) * 10, 0, 100));
};

export const ZH = { load: '訓練負荷', sleep: '睡眠', hrv: 'HRV', rhr: '靜息心率' };

/**
 * 合成準備度。
 *
 * @param {{loadScore:number|null, signals:object|null}} input
 * @returns {{score:number, from:string[], parts:object}|null}
 *          from 是中文訊號名（畫面要寫出來）；一個訊號都沒有回 null。
 */
export function computeReadiness({ loadScore = null, signals = null } = {}) {
    const parts = {};
    const load = num(loadScore);
    if (load !== null) parts.load = clamp(load, 0, 100);
    /* 那一筆是今天（36 小時內）量的才算；沒帶時間 = 不知道多舊 = 不採用 */
    const fresh = (at) => {
        const t = num(at);
        return t !== null && Date.now() - t <= MAX_SAMPLE_AGE_MS;
    };
    if (signals) {
        const sl = sleepScoreOf(signals.sleepHours);
        if (sl !== null) parts.sleep = sl;
        const hv = fresh(signals.hrvAt) ? hrvScoreOf(signals.hrv, signals.hrvBaseline, signals.hrvSamples) : null;
        if (hv !== null) parts.hrv = hv;
        const rh = fresh(signals.restingHrAt) ? rhrScoreOf(signals.restingHr, signals.restingHrBaseline, signals.restingHrSamples) : null;
        if (rh !== null) parts.rhr = rh;
    }
    const keys = Object.keys(parts);
    if (keys.length === 0) return null;          // 什麼都沒有 → 不給數字
    const totalW = keys.reduce((s, k) => s + WEIGHTS[k], 0);
    const score = Math.round(keys.reduce((s, k) => s + parts[k] * WEIGHTS[k], 0) / totalW);
    return { score: clamp(score, 0, 100), from: keys.map((k) => ZH[k]), parts };
}

/** 準備度的文字狀態 —— 全 app 同一套門檻。 */
export const readinessLabel = (score) => {
    if (!Number.isFinite(score)) return null;
    if (score >= 85) return '極佳';
    if (score >= 65) return '良好';
    if (score >= 45) return '普通';
    return '需休息';
};

/** 「這個數字是用什麼算的」—— 給畫面直接印，≤24 字。 */
export const readinessSourceLine = (from = []) =>
    (from.length ? `來自${from.join(' · ')}` : '');

/* ── 會員界線 ─────────────────────────────────────────────────────
   睡眠／HRV／靜息心率加進準備度是會員功能；訓練負荷那一份永遠免費（安全）。
   這支檔案維持純函式（驗證腳本直接 import），所以「能不能用」由
   utils/membership 在 App 啟動時注入；沒注入 = 全開（跟以前一樣）。 */
let signalGate = () => true;
export function setReadinessSignalGate(fn) {
    signalGate = typeof fn === 'function' ? fn : () => true;
}

/** 手上有睡眠／HRV 訊號，但因為不是會員沒算進去 → 畫面放一張會員卡 */
export function readinessSignalsLocked(userId) {
    return !!userId && !signalGate() && !!readRecoverySignals(userId);
}

/**
 * 今天的準備度 —— 全 App 唯一的入口。
 * ════════════════════════════════════════════════════════════════
 * 首頁「恢復」卡、每日摘要、跑步頁、訓練紀錄、分析頁都呼叫這一支。
 * ⚠️ 以前首頁用後端 battery_level（9 塊肌肉平均、沒練過算 100、預設 100），
 *    每日摘要用後端 system-status，跑步頁用本機肌群紀錄 ——
 *    同一個人同一時間看到 100% 跟 30 幾 %。現在只有這一份。
 *
 * @returns {{score:number, from:string[], parts:object}|null} 沒有任何訊號 → null
 */
export function getTodayReadiness(userId) {
    if (!userId) return null;
    let load = null;
    try { load = readinessFromScores(getMuscleRecoveryScores(userId))?.score ?? null; } catch { load = null; }
    const signals = signalGate() ? readRecoverySignals(userId) : null;
    return computeReadiness({ loadScore: load, signals });
}
