// 🏃 跑步計劃全組合教練稽核：窮舉使用者「選得到」的每一組設定，逐週用 RUN_PLAN_STANDARD.md 的標準檢查。
//   用法（在 frontend/ 底下）：
//     node scripts/audit_run_plans.mjs                 # 標準：計劃建立頁＋註冊精靈＋計劃設計器的全部組合
//     node scripts/audit_run_plans.mjs --full          # 再加「換期推薦」（任意週跑量、未指定級別、間歇改節奏）
//     node scripts/audit_run_plans.mjs --quick         # 開發用：週跑量只取 0/5/10/20/40/80/150
//     node scripts/audit_run_plans.mjs --show=10       # 每個問題代碼多印幾筆範例
//     node scripts/audit_run_plans.mjs --engine=/abs/path/cardioPlanFusionEngine.js   # 指定引擎（前後對照用）
//   回傳碼：畫面選得到的組合有任何 ❌ 硬傷 → 1；只有 ⚠️ 警告 → 0（報表照樣列出）。
//
// 為什麼要有這支：verify_cardio_planning 只查「數字加得起來」，不查「教練會不會這樣排」——
//   長跑配速是不是比馬拉松配速還快、減量週是不是真的減、賽前有沒有減量、新手第一週會不會一次跑 7 趟 0.7 公里。
//   這支把教練標準一次套在所有組合上。
//
// 組合來源（跟產品對齊）：
//   計劃建立（CardioPlanBuilder）：5 目標 × 3 級別 × 每週 1–7 趟 × 4–14 週 × 週跑量 0–150（每 5）× 5K 成績 9 選項 × 重訓開關
//   註冊精靈（OnboardingWizard）：同上但每週 1–6 趟、週跑量 0–120、沒有「我還跑不到 5K」→ 是計劃建立的子集，只標入口
//   計劃設計器（TrainingProgramDesigner）：3 目標 × 3 級別 × 3–6 趟 × 4–14 週 × 任意週跑量 0–250（數字輸入）、不填 5K、不加重訓
//   換期推薦（--full；cardioPlanProgress.recommendNextPlan）：級別交給引擎推導、週跑量是實測值（不是 5 的倍數）、可能帶 qualityStyle
//
// 「❌ 硬傷」＝教練不會交給學生；「⚠️ 警告」＝輸入本身做不到（例：一週只跑 1 趟，長跑就是整週的 100%）。
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const FULL = process.argv.includes('--full');
const QUICK = process.argv.includes('--quick');
const SHOW = +arg('show', 3);
const ENGINE = arg('engine', 'src/utils/cardioPlanFusionEngine.js');

// ── 輸入空間 ─────────────────────────────────────────
const GOALS = ['fat_loss', 'aerobic_base', 'race_5k_10k', 'race_half', 'race_full'];
const RACE = new Set(['race_5k_10k', 'race_half', 'race_full']);
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const WEEKS = [4, 6, 8, 10, 12, 14];
const BUILDER_KM = QUICK ? [0, 5, 10, 20, 40, 80, 150] : Array.from({ length: 31 }, (_, i) => i * 5);
// 5K 選項：與 CardioPlanBuilder FIVE_K_OPTIONS／OnboardingWizard RUN_BASELINE_5K 同值
const PACES = [
    { id: 'sub20', pace: Math.round(19 * 60 / 5), can: true }, { id: 'm20_25', pace: Math.round(22 * 60 / 5), can: true },
    { id: 'm25_30', pace: Math.round(27 * 60 / 5), can: true }, { id: 'm30_35', pace: Math.round(32 * 60 / 5), can: true },
    { id: 'm35_40', pace: Math.round(37 * 60 / 5), can: true }, { id: 'm40_50', pace: Math.round(44 * 60 / 5), can: true },
    { id: 'over50', pace: Math.round(52 * 60 / 5), can: true },
    { id: 'under5k', pace: null, can: false }, { id: 'untested', pace: null, can: null },
];
const DESIGNER_KM = [0, 1, 2, 3, 4, 7, 8, 12, 15, 18, 22, 27, 33, 38, 45, 55, 70, 90, 110, 130, 160, 200, 250];
const RECO_KM = [0.8, 2.4, 3.7, 6.2, 9.4, 13.1, 17.6, 24.3, 31.8, 47.5, 66.2, 88.9];

function buildCombos() {
    const out = [];
    // 計劃建立（含註冊精靈子集）
    for (const goal of GOALS) for (const currentLevel of LEVELS) for (let s = 1; s <= 7; s++) for (const totalWeeks of WEEKS)
        for (const km of BUILDER_KM) for (const p of PACES) for (const includeStrength of [true, false])
            out.push({ goal, currentLevel, sessionsPerWeek: s, totalWeeks, currentWeeklyKm: km, baselinePace5K: p.pace, canRun5k: p.can, includeStrength, _pace: p.id });
    // 計劃設計器：任意週跑量（只補計劃建立沒涵蓋的值）
    for (const goal of ['aerobic_base', 'fat_loss', 'race_5k_10k']) for (const currentLevel of LEVELS) for (let s = 3; s <= 6; s++) for (const totalWeeks of WEEKS)
        for (const km of DESIGNER_KM) if (km % 5 || km > 150)
            out.push({ goal, currentLevel, sessionsPerWeek: s, totalWeeks, currentWeeklyKm: km, baselinePace5K: null, canRun5k: null, includeStrength: false, _pace: 'none', _designer: true });
    // 換期推薦（--full）：級別交給引擎、週跑量是實測值、可能把間歇改成節奏
    if (FULL) for (const goal of GOALS) for (let s = 1; s <= 7; s++) for (const totalWeeks of WEEKS) for (const km of RECO_KM)
        for (const p of PACES.filter(x => x.can !== false)) for (const qualityStyle of [undefined, 'tempo'])
            out.push({ goal, currentLevel: null, sessionsPerWeek: s, totalWeeks, currentWeeklyKm: km, baselinePace5K: p.pace, canRun5k: p.can, includeStrength: true, qualityStyle, _pace: p.id, _reco: true });
    return out;
}

function surfaceOf(c) {
    if (c._reco) return ['換期推薦'];
    const out = [];
    if (c._designer) return ['計劃設計器'];
    out.push('計劃建立');
    if (c.sessionsPerWeek <= 6 && c.currentWeeklyKm <= 120 && c.canRun5k !== false) out.push('註冊精靈');
    if (['aerobic_base', 'fat_loss', 'race_5k_10k'].includes(c.goal) && c.sessionsPerWeek >= 3 && c.sessionsPerWeek <= 6 && c.baselinePace5K == null && c.canRun5k == null && !c.includeStrength) out.push('計劃設計器');
    return out;
}

// ── Daniels VDOT（Daniels & Gilbert 1979 公式）：由 5K 推各強度配速 ─────────────
const vo2 = (v) => -4.60 + 0.182258 * v + 0.000104 * v * v;          // v：公尺／分
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
const vdotOf = (pace5k) => { const t = pace5k * 5 / 60; return vo2(5000 / t) / pctMax(t); };
const paceAt = (vdot, f) => { const a = 0.000104, b = 0.182258, c = -4.60 - f * vdot; return 60000 / ((-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)); };
const raceTime = (vdot, m) => { let lo = 5, hi = 900; for (let i = 0; i < 60; i++) { const t = (lo + hi) / 2; if (vo2(m / t) / pctMax(t) > vdot) lo = t; else hi = t; } return (lo + hi) / 2; };
const ZONE_CACHE = {};
function zonesFor(pace5k) {
    if (ZONE_CACHE[pace5k]) return ZONE_CACHE[pace5k];
    const V = vdotOf(pace5k);
    return (ZONE_CACHE[pace5k] = {
        vdot: V,
        eFast: paceAt(V, 0.74), eSlow: paceAt(V, 0.59),              // E：59–74% VO2max
        tFast: paceAt(V, 0.90), tSlow: paceAt(V, 0.83),              // T：83–90%（Daniels T ≈ 88%）
        iFast: paceAt(V, 1.00), iSlow: paceAt(V, 0.95),              // I：95–100%
        m: raceTime(V, 42195) * 60 / 42.195,                         // 馬拉松配速（秒/公里）
    });
}

const QUALITY = new Set(['tempo', 'interval']);
const RUN_MIN_KM = 2;                                   // runDistanceClass.GLOBAL_MIN_KM：再短就沒有訓練意義
const QUALITY_MIN_KM = { interval: 3, tempo: 4 };       // runDistanceClass.distanceRangeFor 的下限（含暖身收操）
const QUALITY_MAX_KM = { interval: 10, tempo: 14 };     // 同上的上限
const LONG_SHARE = { beginner: 0.30, intermediate: 0.33, advanced: 0.35 };
const RACE_MIN = {                                       // 目標距離的最低準備（不到就要誠實告知）
    race_5k_10k: { weeks: 6 },
    race_half: { weeks: 8, peakKm: 30, longKm: 16 },
    race_full: { weeks: 12, peakKm: 45, longKm: 26 },
};
const ABS_PEAK = { beginner: 35, intermediate: 65, advanced: 95 };
// 目標的參考峰值週量（成熟跑者）× 級別係數 —— 「還有沒有成長空間」的判斷用
const GOAL_PEAK = { fat_loss: 30, aerobic_base: 40, race_5k_10k: 50, race_half: 65, race_full: 90 };
const LEVEL_SCALE = { beginner: 0.55, intermediate: 0.80, advanced: 1.00 };

// 一週 S 趟、照標準的單趟上限，最多裝得下多少公里（RUN_PLAN_STANDARD.md「每趟上下限」）
const SHIFT = { long: 85, easy: 90, tempo: 15, interval: -10 };   // 與 cardioPrescription 同值（verify_quick_run_courses 另查）
function capacityKm(goal, level, S, base) {
    const longMin = goal === 'race_full' ? 180 : 150;
    const q = S <= 2 ? 0 : (S >= 5 && level !== 'beginner') ? 2 : 1;
    const share = S < 3 ? Infinity : S === 3 ? 0.45 : LONG_SHARE[level];
    const sum = (W) => {
        const L = Math.min((longMin * 60) / (base + SHIFT.easy), share * W);
        const E = Math.min((120 * 60) / (base + SHIFT.easy), L);
        const qt = goal === 'aerobic_base' ? 'tempo' : 'interval';
        const Q = Math.min(QUALITY_MAX_KM[qt], (qt === 'interval' ? 0.08 : 0.10) * W + 4, (90 * 60) / (base + SHIFT[qt]), (0.30 * W) / Math.max(1, q));
        return S === 1 ? L : L + q * Q + (S - 1 - q) * E;
    };
    let lo = 0, hi = 400;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (sum(m) >= m) lo = m; else hi = m; }
    return lo;
}

// ── 稽核一份計劃 ─────────────────────────────────────
function auditPlan(E, cfg, flag) {
    let p;
    try { p = E.generateCardioPlan({ ...cfg, startDate: '2026-10-05' }); } catch (e) { flag('H', 'EXCEPTION', '', e.message); return; }
    const level = p.current_level;
    const W = p.weeks || [];
    const T = Math.max(4, Math.min(14, cfg.totalWeeks));
    if (W.length !== T) { flag('H', 'STRUCT', '', `週數 ${W.length} ≠ ${T}`); return; }
    const S = cfg.sessionsPerWeek;
    const cur = Math.max(0, Math.min(200, Number(cfg.currentWeeklyKm) || 0));
    const isRace = RACE.has(cfg.goal);
    const base = Number(cfg.baselinePace5K) > 0 ? Number(cfg.baselinePace5K) : 360;
    const Z = zonesFor(base);
    const inDomain = Z.vdot >= 30;                      // Daniels 表格涵蓋範圍（5K ≤ 約 30:40）；以外是公式外推
    const sev = (hard) => (hard ? 'H' : 'W');
    const runsOf = (w) => (w.bricks || []).filter(b => b.distance_km != null && b.type !== 'strength' && b.subtype !== 'strength');
    const km1 = (x) => Math.round(x * 10) / 10;
    const loading = (w) => !w.is_deload && w.phase !== 'taper';
    const flags = p.meta?.safety_flags || [];
    const guard = E.week1Ceiling(level, cfg.currentWeeklyKm);

    // ═══ A. 數字誠實 ═══
    let totalKm = 0, totalDur = 0, longest = 0;
    W.forEach((w, wi) => {
        const at = `W${wi + 1}${w.phase}${w.is_deload ? '/減量' : ''}`;
        if (w.week_index !== wi + 1) flag('H', 'STRUCT', at, `week_index ${w.week_index}`);
        if (!['base', 'build', 'peak', 'taper'].includes(w.phase)) flag('H', 'STRUCT', at, `phase ${w.phase}`);
        const runs = runsOf(w);
        if (!runs.length) flag('H', 'EMPTY_WEEK', at, '');
        if (runs.length > S) flag('H', 'RUNS_OVER_SELECTED', at, `${runs.length} 趟 > 選的 ${S} 趟`);
        const sum = km1(runs.reduce((s, b) => s + b.distance_km, 0));
        if (w.target_mileage_km !== sum) flag('H', 'WEEK_SUM', at, `${w.target_mileage_km} ≠ Σ ${sum}`);
        if (w.run_sessions !== runs.length) flag('H', 'WEEK_SUM', at, `run_sessions ${w.run_sessions} ≠ ${runs.length}`);
        const dur = (w.bricks || []).reduce((s, b) => s + (b.duration_min || 0), 0);
        if (w.total_duration_min !== dur) flag('H', 'WEEK_SUM', at, `total_duration ${w.total_duration_min} ≠ ${dur}`);
        totalKm += w.target_mileage_km; totalDur += dur;
        const str = (w.bricks || []).filter(b => b.type === 'strength' || b.subtype === 'strength').length;
        const wantStr = cfg.includeStrength && w.phase !== 'taper' ? 1 : 0;
        if (str !== wantStr) flag('H', 'STRENGTH_SLOT', at, `重訓 ${str} 次，應為 ${wantStr}`);
        runs.forEach(b => {
            longest = Math.max(longest, b.distance_km);
            const fixed = E.reconcileSubtypeWithDistance(b.subtype, b.distance_km);
            if (fixed !== b.subtype || b.title !== E.titleForRun(b.subtype, b.distance_km)) flag('H', 'LABEL', at, `${b.title}（${b.subtype}）`);
            if (b.duration_min !== Math.round(b.distance_km * b.target_pace_sec / 60)) flag('H', 'DURATION', at, `${b.title} ${b.duration_min} 分 ≠ ${b.distance_km}×${b.target_pace_sec}s`);
            if (b.target_pace_label !== `${Math.floor(b.target_pace_sec / 60)}:${String(b.target_pace_sec % 60).padStart(2, '0')}`) flag('H', 'DURATION', at, `配速標籤 ${b.target_pace_label}`);
            const wantType = QUALITY.has(b.subtype) ? 'speed' : b.subtype === 'long' ? 'long' : 'recovery';
            if (b.type !== wantType) flag('H', 'LABEL', at, `${b.title} type=${b.type}`);
            if (b.run_walk) {
                const per = b.run_walk.run_min + b.run_walk.walk_min;
                if (Math.abs(b.run_walk.rounds * per - b.duration_min) > per / 2 + 0.5) flag('H', 'RUN_WALK_MISMATCH', at, `${b.run_walk.label} vs ${b.duration_min} 分`);
            }
        });
    });
    const t = p.meta?.totals || {};
    if (t.total_km !== km1(totalKm) || t.total_duration_min !== totalDur || p.meta.peak_mileage_km !== Math.max(...W.map(w => w.target_mileage_km)) || t.longest_run_km !== km1(longest))
        flag('H', 'TOTALS', '', `total ${t.total_km}/${km1(totalKm)} dur ${t.total_duration_min}/${totalDur} longest ${t.longest_run_km}/${longest}`);

    // ═══ B. 週量：起點、爬升、ACWR、減量週、上限 ═══
    const km = W.map(w => w.target_mileage_km);
    const w1 = km[0];
    // 起點不能比現況跳太多（第 1 週 ≤ 現況 ×1.1；零基礎時 ≤ 保底）
    //   標準：≤ max(現況 ×1.1, 現況 +2 公里, 5 公里)；初學者另有保護上限（第 1 週 ≤ 3 趟 × 3 公里、≤ 現況 ×1.1 或 6 公里）
    const startCap = level === 'beginner' && guard.maxWeekKm != null ? guard.maxWeekKm : Math.max(cur * 1.1, Math.min(cur + 2, 5), cur === 0 ? 5 : 0);
    if (w1 > startCap + 0.15) flag('H', 'START_OVER', 'W1', `${w1} km > 上限 ${km1(startCap)}（現況 ${cur}）`);
    // 起點也不能比現況掉太多（≥10 km/週的人，第 1 週 < 70% 就是退步）
    //   物理上排不下（趟數 × 單趟上限）、或級別上限比現況低（手選的級別跟填的跑量互相矛盾）→ 警告
    //   選的趟數裝不下現況 → 也是輸入限制。容量照標準的單趟上限獨立算（不呼叫引擎）：
    //   長跑 ≤ 150／180 分且 ≤ 週量 30–45%；速度課 ≤ min(距離上限, Daniels 量 + 4 km, 90 分)；其他 ≤ 120 分且 ≤ 長跑
    const timeCapKm = capacityKm(cfg.goal, level, S, base);
    if (cur >= 10 && w1 < cur * 0.7) {
        const feasible = level !== 'beginner' && cur <= ABS_PEAK[level] && cur <= timeCapKm * 0.9;
        flag(sev(feasible), 'START_DROP', 'W1', `${w1} km < 現況 ${cur} 的 70%（${level}、${S} 趟）`);
    }
    // 爬升：訓練週 vs 上一個訓練週 ≤ +15%（或 +1 km 以內的小量）；ACWR ≤ 1.30
    let lastLoad = null;
    W.forEach((w, i) => {
        const at = `W${i + 1}`;
        if (loading(w) && lastLoad != null && w.target_mileage_km > lastLoad * 1.15 + 0.05 && w.target_mileage_km - lastLoad > 1.0)
            flag('H', 'RAMP', at, `${lastLoad} → ${w.target_mileage_km}（+${Math.round((w.target_mileage_km / lastLoad - 1) * 100)}%）`);
        // 訓練週不該無故掉量（減量週、賽前減量以外）：>10% 的掉量等於這週白排了
        if (loading(w) && lastLoad != null && w.target_mileage_km < lastLoad * 0.9 - 0.05 && lastLoad - w.target_mileage_km > 1.0)
            flag('H', 'VOLUME_DROP', at, `${lastLoad} → ${w.target_mileage_km}`);
        if (i >= 3) {
            const ch = (km[i] + km[i - 1] + km[i - 2] + km[i - 3]) / 4;
            if (ch > 0 && km[i] / ch > 1.30 + 1e-9 && km[i] - ch > 1.0) flag('H', 'ACWR', at, `${(km[i] / ch).toFixed(2)}（${km.slice(i - 3, i + 1).join('/')}）`);
        }
        if (loading(w)) lastLoad = w.target_mileage_km;
    });
    // 週量上限：不超過級別絕對上限（但現況本來就更高的不在此限 —— 那是 START_DROP 管）
    const peak = Math.max(...km);
    if (peak > Math.max(ABS_PEAK[level], cur * 1.1) + 0.2) flag('H', 'PEAK_OVER_LEVEL', '', `${peak} > ${ABS_PEAK[level]}（${level}）`);
    // 減量週：每 3–4 週一次（連續訓練週 ≤ 3），而且真的有減（≤ 前一個訓練週的 85%）
    let run = 0;
    W.forEach((w, i) => {
        if (loading(w)) { run++; if (run > 3) flag('H', 'NO_DELOAD', `W${i + 1}`, `連續第 ${run} 個訓練週`); }
        else run = 0;
        if (w.is_deload) {
            const prev = W.slice(0, i).filter(loading).pop();
            if (prev && w.target_mileage_km > prev.target_mileage_km * 0.85 + 0.05) flag('H', 'DELOAD_SHALLOW', `W${i + 1}`, `${w.target_mileage_km} vs 前一訓練週 ${prev.target_mileage_km}`);
            if (prev && w.target_mileage_km < prev.target_mileage_km * 0.45) flag('W', 'DELOAD_DEEP', `W${i + 1}`, `${w.target_mileage_km} vs ${prev.target_mileage_km}`);
        }
    });
    // 進步：6 週以上的計劃，訓練週的峰值要高於第 1 週（已經在級別上限的除外）
    if (T >= 6) {
        const loadPeak = Math.max(...W.filter(loading).map(w => w.target_mileage_km));
        //   已經在目標峰值、級別上限、或「趟數 × 單趟時間上限」頂到了 → 警告（輸入限制）
        const goalPeak = Math.min(GOAL_PEAK[cfg.goal] * LEVEL_SCALE[level], ABS_PEAK[level]);
        const room = w1 < goalPeak * 0.95 && w1 < timeCapKm * 0.9 && S >= 2;
        if (loadPeak <= w1 + 0.05) flag(sev(room), 'NO_PROGRESSION', '', `訓練週峰值 ${loadPeak} ≤ 第 1 週 ${w1}`);
    }
    // 趟數暴增：相鄰訓練週跑步趟數一次多 2 趟以上（第 1 週保護 3 趟 → 第 2 週 7 趟）
    let lastRuns = null;
    W.forEach((w, i) => {
        if (!loading(w)) return;
        const n = runsOf(w).length;
        if (lastRuns != null && n - lastRuns > 2) flag('H', 'FREQ_JUMP', `W${i + 1}`, `${lastRuns} → ${n} 趟`);
        lastRuns = n;
    });

    // ═══ C. 週期：階段順序、賽前減量 ═══
    const order = { base: 0, build: 1, peak: 2, taper: 3 };
    let maxOrd = 0;
    W.forEach((w, i) => {
        const o = order[w.phase];
        const finalConsolidation = !isRace && i === W.length - 1 && w.is_deload;
        if (o < maxOrd && !finalConsolidation) flag('H', 'PHASE_ORDER', `W${i + 1}`, W.map(x => x.phase[0]).join(''));
        maxOrd = Math.max(maxOrd, o);
    });
    if (isRace) {
        const last = W[W.length - 1];
        const loadPeak = Math.max(...W.filter(loading).map(w => w.target_mileage_km), 0);
        if (last.phase !== 'taper') flag('H', 'NO_TAPER', `W${W.length}`, W.map(x => x.phase[0]).join(''));
        else if (loadPeak > 0 && last.target_mileage_km > loadPeak * 0.75) flag('H', 'TAPER_SHALLOW', `W${W.length}`, `${last.target_mileage_km} vs 峰值 ${loadPeak}`);
        W.forEach((w, i) => { if (w.phase === 'taper' && loadPeak > 0 && w.target_mileage_km < loadPeak * 0.3) flag('W', 'TAPER_DEEP', `W${i + 1}`, `${w.target_mileage_km} vs ${loadPeak}`); });
        W.forEach((w, i) => {
            if (w.phase === 'taper' && runsOf(w).length >= 3 && level !== 'beginner' && !runsOf(w).some(b => QUALITY.has(b.subtype) || b.strides))
                flag('W', 'TAPER_NO_INTENSITY', `W${i + 1}`, '減量期沒有任何速度課或加速跑（Mujika：減量不減強度）');
        });
    } else if (W.some(w => w.phase === 'taper')) flag('H', 'TAPER_NON_RACE', '', '沒有比賽的目標排了 taper');

    // ═══ D. 長跑 ═══
    const shareCap = LONG_SHARE[level] ?? 0.33;
    let prevLongest = null;
    W.forEach((w, i) => {
        const at = `W${i + 1}`;
        const runs = runsOf(w);
        const lg = Math.max(...runs.map(b => b.distance_km));
        // 只看「真正的長跑」（≥ 10 公里）；幾公里的小週量裡最長一趟佔 40% 不是風險
        if (lg >= 10 && lg > w.target_mileage_km * shareCap + 0.15)
            flag(sev(runs.length >= 4), 'LONG_SHARE', at, `${lg}/${w.target_mileage_km} km = ${Math.round(lg / w.target_mileage_km * 100)}% > ${Math.round(shareCap * 100)}%（${runs.length} 趟）`);
        runs.forEach(b => {
            if (b.duration_min > 180) flag('H', 'RUN_OVER_3H', at, `${b.title} ${b.duration_min} 分`);
            else if (b.duration_min > 150 && cfg.goal !== 'race_full') flag('H', 'RUN_OVER_150', at, `${b.title} ${b.duration_min} 分（Daniels 長跑 ≤150 分；全馬才放寬到 3 小時）`);
        });
        // 超過 2 小時的只能是這週最長的那一趟，而且一週最多一趟
        const over2h = runs.filter(b => b.duration_min > 120);
        if (over2h.length > 1 || (over2h.length === 1 && over2h[0].distance_km < lg)) flag('H', 'EASY_OVER_2H', at, over2h.map(b => `${b.title} ${b.duration_min} 分`).join('、'));
        if (loading(w)) {
            if (prevLongest != null && lg > prevLongest * 1.2 + 0.05 && lg - prevLongest > 2.5)
                flag('H', 'LONG_JUMP', at, `最長一趟 ${prevLongest} → ${lg} km`);
            prevLongest = lg;
        }
    });

    // ═══ E. 目標距離的準備度（做不到就要誠實說） ═══
    const rm = RACE_MIN[cfg.goal];
    if (rm) {
        const peakLong = Math.max(...W.flatMap(w => runsOf(w).map(b => b.distance_km)));
        const shortWeeks = rm.weeks && T < rm.weeks;
        const lowPeak = rm.peakKm && peak < rm.peakKm;
        const shortLong = rm.longKm && peakLong < rm.longKm;
        // 每一條不足都要有自己的提示（raceReadinessFlags 的代碼），提示裡的數字也要對
        const said = (code) => flags.some(f => f.code === code);
        const tag = (ok) => (ok ? '（已提示）' : '（沒有提示）');
        if (shortWeeks) flag(sev(!said('weeks_below_race_minimum')), 'GOAL_WEEKS_SHORT', '', `${T} 週 < ${rm.weeks} 週${tag(said('weeks_below_race_minimum'))}`);
        if (lowPeak) flag(sev(!said('peak_below_race_minimum')), 'GOAL_PEAK_LOW', '', `峰值 ${peak} < ${rm.peakKm} km/週${tag(said('peak_below_race_minimum'))}`);
        if (shortLong) flag(sev(!said('long_run_below_race_minimum')), 'GOAL_LONG_SHORT', '', `最長一趟 ${peakLong} < ${rm.longKm} km${tag(said('long_run_below_race_minimum'))}`);
        const real = { weeks_below_race_minimum: shortWeeks, peak_below_race_minimum: lowPeak, long_run_below_race_minimum: shortLong };
        flags.forEach(f => { if (!real[f.code]) flag('H', 'FLAG_FALSE', '', `${f.code}：${f.message}`); });
        const lf = flags.find(f => f.code === 'long_run_below_race_minimum');
        if (lf && !lf.message.includes(`${peakLong} 公里`)) flag('H', 'FLAG_FALSE', '', `提示的最長一趟對不上 ${peakLong}：${lf.message}`);
    } else if (flags.length) flag('H', 'FLAG_FALSE', '', flags.map(f => f.code).join(','));

    // ═══ F. 強度分配與速度課 ═══
    W.forEach((w, i) => {
        const at = `W${i + 1}${w.phase}${w.is_deload ? '/減量' : ''}`;
        const runs = runsOf(w);
        const q = runs.filter(b => QUALITY.has(b.subtype));
        const qCap = runs.length >= 5 ? 2 : 1;
        if (q.length > qCap) flag(sev(runs.length >= 3), 'QUALITY_COUNT', at, `${q.length} 堂速度課／${runs.length} 趟`);
        if (q.length && runs.length <= 2) flag('W', 'QUALITY_LOW_FREQ', at, `${runs.length} 趟裡有 ${q.length} 堂速度課`);
        if (w.is_deload && q.length) flag('H', 'DELOAD_QUALITY', at, q.map(b => b.title).join(','));
        // 80/20：速度課里程（含暖身收操）≤ 週量 30%
        const qKm = q.reduce((s, b) => s + b.distance_km, 0);
        if (qKm > w.target_mileage_km * 0.30 + 0.1 * q.length && runs.length >= 3) flag('H', 'INTENSITY_SHARE', at, `速度課 ${km1(qKm)}/${w.target_mileage_km} km = ${Math.round(qKm / w.target_mileage_km * 100)}%`);
        // 速度課的量：太短沒有主課（暖身收操就 2–3 km），太長超過 Daniels 上限（I ≤ 週量 8%、T ≤ 10%，再加 4 km 暖身收操）
        q.forEach(b => {
            if (b.distance_km < QUALITY_MIN_KM[b.subtype] - 0.05) flag('H', 'QUALITY_TOO_SHORT', at, `${b.title}（< ${QUALITY_MIN_KM[b.subtype]} km）`);
            const lim = Math.min(QUALITY_MAX_KM[b.subtype], (b.subtype === 'interval' ? 0.08 : 0.10) * w.target_mileage_km + 4);
            if (b.distance_km > lim + 0.05) flag('H', 'QUALITY_TOO_LONG', at, `${b.title} > ${km1(lim)} km（週量 ${w.target_mileage_km}）`);
            if (b.duration_min > 90) flag('H', 'QUALITY_TOO_LONG', at, `${b.title} ${b.duration_min} 分 > 90 分`);
        });
        // 每一趟至少 2 公里
        runs.forEach(b => { if (b.distance_km < RUN_MIN_KM - 0.05) flag('H', 'RUN_TOO_SHORT', at, `${b.title}（週量 ${w.target_mileage_km}、${runs.length} 趟）`); });
        // 48 小時：實際排到星期幾（首頁／中控台同一支 buildWeeklyAgenda）後，硬課不相鄰
        const ag = E.buildWeeklyAgenda({ plan: null, cardioBricks: w.bricks });
        //   硬課＝速度課＋這週最長的那一趟長跑（週量大時其他 12 公里以上的課也叫「長跑」，但強度是輕鬆跑）
        const keyLong = runs.filter(b => b.subtype === 'long').sort((x, y) => y.distance_km - x.distance_km)[0];
        const isHard = (d) => d.run && (QUALITY.has(d.run.subtype) || d.run === keyLong);
        for (let d = 0; d < 7; d++) if (isHard(ag[d]) && isHard(ag[(d + 1) % 7])) { flag('H', 'HARD_ADJACENT', at, ag.map(x => x.run ? x.run.subtype[0] : '·').join('')); break; }
        if ((ag.unplacedRuns || []).length) flag('H', 'UNPLACED', at, `${ag.unplacedRuns.length} 趟排不進一週`);
        // 階段：基礎期以有氧為主，最大攝氧量間歇留到建立期以後（Daniels 第一階段只有 E＋加速跑）
        if (w.phase === 'base' && !w.is_deload && q.some(b => b.subtype === 'interval') && cfg.goal !== 'fat_loss') flag('W', 'BASE_INTERVAL', at, '基礎期排了間歇');
    });

    // ═══ G. 新手安全 ═══
    if (level === 'beginner') {
        const r1 = runsOf(W[0]);
        if (r1.length > 3) flag('H', 'BEGINNER_W1', 'W1', `${r1.length} 趟`);
        if (r1.some(b => b.distance_km > 3.05)) flag('H', 'BEGINNER_W1', 'W1', r1.map(b => b.distance_km).join('/'));
        W.slice(0, 2).forEach((w, i) => { if (runsOf(w).some(b => QUALITY.has(b.subtype))) flag('H', 'BEGINNER_EARLY_QUALITY', `W${i + 1}`, ''); });
        W.slice(2, 4).forEach((w, i) => { if (runsOf(w).some(b => b.subtype === 'interval') && cfg.goal !== 'fat_loss') flag('W', 'BEGINNER_EARLY_INTERVAL', `W${i + 3}`, ''); });
        // 跑不到 5K／零基礎：前兩週要寫成走跑交替（C25K、Galloway）
        const novice = cfg.canRun5k === false || (cur < 5 && !(Number(cfg.baselinePace5K) > 0));
        if (novice) W.slice(0, 2).forEach((w, i) => runsOf(w).forEach(b => {
            if (!b.run_walk || !(b.run_walk.run_min > 0 && b.run_walk.walk_min > 0 && b.run_walk.rounds > 0)) flag('H', 'NO_RUN_WALK', `W${i + 1}`, b.title);
        }));
        W.forEach((w, i) => { if (runsOf(w).filter(b => QUALITY.has(b.subtype)).length > 1) flag('H', 'BEGINNER_QUALITY_COUNT', `W${i + 1}`, ''); });
    }
    if (S + (cfg.includeStrength ? 1 : 0) >= 7) flag('W', 'NO_REST_DAY', '', `${S} 趟跑步${cfg.includeStrength ? '＋1 次重訓' : ''}，一週沒有休息日`);
    if (level === 'beginner' && S > 4) flag('W', 'FREQ_ABOVE_LEVEL', '', `初學者每週 ${S} 趟（建立頁會提醒，建議 ≤ 4）`);

    // ═══ H. 配速：彼此順序對、而且落在 5K 推出來的 Daniels 區間 ═══
    const paceOf = {};
    W.forEach(w => runsOf(w).forEach(b => { (paceOf[b.subtype] ||= new Set()).add(b.target_pace_sec); }));
    const one = (k) => (paceOf[k] ? [...paceOf[k]][0] : null);
    Object.entries(paceOf).forEach(([k, s]) => { if (s.size > 1) flag('H', 'PACE_INCONSISTENT', '', `${k} 有 ${[...s].join('/')} 幾種配速`); });
    const P = { recovery: one('recovery'), easy: one('easy'), medium: one('medium'), long: one('long'), tempo: one('tempo'), interval: one('interval') };
    const chain = [['recovery', 'easy'], ['easy', 'medium'], ['medium', 'long'], ['easy', 'long'], ['long', 'tempo'], ['medium', 'tempo'], ['easy', 'tempo'], ['tempo', 'interval']];
    chain.forEach(([slow, fast]) => { if (P[slow] != null && P[fast] != null && P[slow] < P[fast]) flag('H', 'PACE_ORDER', '', `${slow} ${P[slow]} 比 ${fast} ${P[fast]} 快`); });
    if (P.tempo != null && P.tempo <= base) flag('H', 'PACE_ORDER', '', `節奏跑 ${P.tempo} 不比 5K 比賽配速 ${base} 慢`);
    const tol = 4;                                         // 秒／公里：四捨五入與選項區間的容差
    const vz = (hardCode, ok, msg) => { if (!ok) flag(sev(inDomain), hardCode, '', `${msg}（5K ${base}s、VDOT ${Z.vdot.toFixed(1)}${inDomain ? '' : '，表外推估'}）`); };
    ['easy', 'medium', 'long'].forEach(k => { if (P[k] != null) vz('PACE_EASY_TOO_FAST', P[k] >= Z.eFast - tol, `${k} ${P[k]} 快過 E 區上緣 ${Math.round(Z.eFast)}`); });
    ['easy', 'medium', 'long'].forEach(k => { if (P[k] != null) vz('PACE_EASY_TOO_SLOW', P[k] <= Z.eSlow + tol, `${k} ${P[k]} 慢過 E 區下緣 ${Math.round(Z.eSlow)}`); });
    if (P.long != null) vz('PACE_LONG_AT_MP', P.long >= Z.m * 1.05 - tol, `長跑 ${P.long} 不比馬拉松配速 ${Math.round(Z.m)} 慢 5%`);
    if (P.recovery != null && P.easy != null && P.recovery <= P.easy) flag('H', 'PACE_ORDER', '', `恢復跑 ${P.recovery} 不比輕鬆跑 ${P.easy} 慢`);
    if (P.tempo != null) vz('PACE_TEMPO_OFF', P.tempo >= Z.tFast - tol && P.tempo <= Z.tSlow + tol, `節奏 ${P.tempo} 不在 T 區 ${Math.round(Z.tFast)}–${Math.round(Z.tSlow)}`);
    if (P.interval != null) vz('PACE_INTERVAL_OFF', P.interval >= Z.iFast - tol && P.interval <= Z.iSlow + tol, `間歇 ${P.interval} 不在 I 區 ${Math.round(Z.iFast)}–${Math.round(Z.iSlow)}`);
    if (!(Number(cfg.baselinePace5K) > 0) && p.meta?.pacing_mode !== 'estimated') flag('H', 'PACE_MODE', '', `沒填 5K 卻標成 ${p.meta?.pacing_mode}`);

    // ═══ I. 「?」說明裡的每一句話都要對得上這份計劃 ═══
    const ex = Object.fromEntries((p.meta?.explain || []).map(e => [e.code, e.body]));
    const deloads = W.filter(w => w.is_deload);
    if (ex.deload) {
        if (!deloads.length) flag('H', 'EXPLAIN_FALSE', '', `說有減量週，但沒有：${ex.deload}`);
        const listed = (ex.deload.match(/第 ([\d、]+) 週/) || [])[1];
        if (listed && listed !== deloads.map(w => w.week_index).join('、')) flag('H', 'EXPLAIN_FALSE', '', `說第 ${listed} 週減量，實際 ${deloads.map(w => w.week_index).join('、')}`);
        if (/少跑一趟/.test(ex.deload) && deloads.some((w) => { const i = W.indexOf(w); const prev = W.slice(0, i).filter(loading).pop(); return prev && runsOf(w).length >= runsOf(prev).length; }))
            flag('H', 'EXPLAIN_FALSE', '', `說減量週少跑一趟：${deloads.map(w => runsOf(w).length).join('/')} 趟`);
        const pm = ex.deload.match(/約 (\d+)%/);
        if (pm) {
            const rs = deloads.map(w => { const i = W.indexOf(w); const prev = W.slice(0, i).filter(loading).pop(); return prev ? w.target_mileage_km / prev.target_mileage_km : null; }).filter(x => x != null);
            const avg = rs.reduce((a, b) => a + b, 0) / rs.length * 100;
            if (Math.abs(avg - +pm[1]) > 1) flag('H', 'EXPLAIN_FALSE', '', `說降到 ${pm[1]}%，實際 ${avg.toFixed(0)}%`);
        }
    } else if (deloads.length) flag('H', 'EXPLAIN_MISSING', '', '有減量週但說明沒提');
    if (ex.min_run) {
        const m = ex.min_run.match(/第 (\d+) 週起每週 (\d+) 趟/);
        // 「第 N 週起每週 S 趟」：第 N 週以後的訓練週都要排滿
        if (m && (+m[2] !== S || W.some((w, i) => i >= +m[1] - 1 && loading(w) && runsOf(w).length < S) || runsOf(W[+m[1] - 1]).length < S))
            flag('H', 'EXPLAIN_FALSE', '', `說第 ${m[1]} 週起每週 ${m[2]} 趟：${W.map(w => runsOf(w).length).join('/')}`);
    } else if (W.some((w, i) => loading(w) && i > 0 && runsOf(w).length < S)) flag('H', 'EXPLAIN_MISSING', '', '有訓練週少於選的趟數，說明沒講為什麼');
    if (ex.ramp) { const m = ex.ramp.match(/\+([\d.]+)%/); const audit = E.auditWeeklyMileage(km, W.map(w => ({ phase: w.phase, isDeload: w.is_deload }))); if (m && Math.abs(+m[1] - Math.round(audit.maxJumpPct * 10) / 10) > 0.05) flag('H', 'EXPLAIN_FALSE', '', `增幅 ${m[1]} vs ${audit.maxJumpPct}`); }
    if (ex.strength && !cfg.includeStrength) flag('H', 'EXPLAIN_FALSE', '', '沒選重訓卻說明重訓');
    if (ex.week1_guard) {
        const m = ex.week1_guard.match(/第 1 週只排 (\d+) 趟/);
        if (m && +m[1] !== runsOf(W[0]).length) flag('H', 'EXPLAIN_FALSE', '', `說第 1 週 ${m[1]} 趟，實際 ${runsOf(W[0]).length}`);
        if (level !== 'beginner') flag('H', 'EXPLAIN_FALSE', '', '非初學者卻說第 1 週保護');
    }
    if (ex.run_walk && !W[0].bricks.some(b => b.run_walk)) flag('H', 'EXPLAIN_FALSE', '', '說走跑交替，課表沒有');
    const audit = p.meta?.mileage_audit;
    if (audit) {
        const re = E.auditWeeklyMileage(km, W.map(w => ({ phase: w.phase, isDeload: w.is_deload })));
        if (audit.safe !== re.safe) flag('H', 'EXPLAIN_FALSE', '', `mileage_audit.safe ${audit.safe} vs 重算 ${re.safe}`);
    }
}

// ── 執行（多執行緒）──────────────────────────────────
if (isMainThread) {
    const enginePath = path.resolve(ENGINE);
    const dir = path.dirname(enginePath);
    const entry = `export * from ${JSON.stringify(enginePath)};
export { buildWeeklyAgenda } from ${JSON.stringify(path.join(dir, 'dailyAgenda.js'))};
export { week1Ceiling } from ${JSON.stringify(path.join(dir, 'runnerLevel.js'))};
export { reconcileSubtypeWithDistance, titleForRun } from ${JSON.stringify(path.join(dir, 'runDistanceClass.js'))};`;
    const r = await esbuild.build({ stdin: { contents: entry, resolveDir: dir, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error', loader: { '.js': 'jsx' } });
    const code = r.outputFiles[0].text;
    const combos = buildCombos();
    const N = Math.max(1, Math.min(os.cpus().length, 8));
    const t0 = Date.now();
    const results = await Promise.all(Array.from({ length: N }, (_, k) => new Promise((res, rej) => {
        const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { code, combos: combos.filter((_, i) => i % N === k), show: SHOW }, argv: process.argv.slice(2) });
        wk.on('message', res); wk.on('error', rej);
    })));
    const counts = {}, plansHit = {}, ex = {}, bySurface = {}, codeSurf = {}; let badPlans = 0, warnPlans = 0, badReach = 0;
    for (const rr of results) {
        badReach += rr.badReach; badPlans += rr.badPlans; warnPlans += rr.warnPlans;
        for (const k in rr.codeSurf) for (const sn in rr.codeSurf[k]) { const o = codeSurf[k] ||= {}; o[sn] = (o[sn] || 0) + rr.codeSurf[k][sn]; }
        for (const k in rr.bySurface) { const b = bySurface[k] ||= [0, 0]; b[0] += rr.bySurface[k][0]; b[1] += rr.bySurface[k][1]; }
        for (const k in rr.counts) { counts[k] = (counts[k] || 0) + rr.counts[k]; plansHit[k] = (plansHit[k] || 0) + rr.plansHit[k]; (ex[k] ||= []).push(...rr.ex[k]); }
    }
    console.log(`跑步計劃全組合教練稽核：${combos.length} 份計劃（${FULL ? 'full' : QUICK ? 'quick' : '標準'}；${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
    console.log(`有 ❌ 硬傷的計劃：${badPlans}　只有 ⚠️ 警告的計劃：${warnPlans}`);
    console.log('依入口：' + Object.entries(bySurface).map(([k, [n, b]]) => `${k} ${b}/${n}`).join('　') + '（有硬傷/組合數）\n');
    const keys = Object.keys(counts).sort((a, b) => (a[0] === b[0] ? plansHit[b] - plansHit[a] : a[0] === 'H' ? -1 : 1));
    for (const k of keys) {
        const [s, c] = k.split(':');
        console.log(`${s === 'H' ? '❌' : '⚠️ '} ${c.padEnd(24)} ${String(counts[k]).padStart(8)} 處／${plansHit[k]} 份　〔${Object.entries(codeSurf[k] || {}).map(([a, b]) => a + ' ' + b).join('、')}〕`);
        ex[k].slice(0, SHOW).forEach(x => console.log('      ' + x));
    }
    console.log('');
    if (!badPlans) console.log('✅ 沒有教練不會交給學生的硬傷');
    else console.log(`❌ 畫面選得到的組合有 ${badReach} 份有硬傷`);
    if (process.env.AUDIT_JSON) fs.writeFileSync(process.env.AUDIT_JSON, JSON.stringify({ combos: combos.length, badPlans, warnPlans, bySurface, counts, plansHit, codeSurf }, null, 1));
    if (process.env.AUDIT_ALL_OUT) fs.writeFileSync(process.env.AUDIT_ALL_OUT, results.flatMap(rr => rr.all).join('\n'));
    process.exit(badReach ? 1 : 0);
} else {
    const { code, combos, show } = workerData;
    const E = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    const counts = {}, plansHit = {}, ex = {}, bySurface = {}, codeSurf = {}, all = []; let badPlans = 0, warnPlans = 0, badReach = 0;
    const ALL_CODE = process.env.AUDIT_ALL;   // 除錯：把某個代碼的每一筆都寫出來（AUDIT_ALL=RAMP AUDIT_ALL_OUT=檔名）
    const origLog = console.log, origWarn = console.warn; console.log = () => {}; console.warn = () => {};
    for (const cfg of combos) {
        const seen = new Set(), surf = surfaceOf(cfg);
        const ctx = `〔${surf.join('·')}〕${cfg.goal}/${cfg.currentLevel ?? '推導'}/${cfg.sessionsPerWeek}趟/${cfg.totalWeeks}週/${cfg.currentWeeklyKm}km/5K:${cfg._pace}${cfg.includeStrength ? '/+重訓' : ''}${cfg.qualityStyle ? '/' + cfg.qualityStyle : ''}`;
        const { _pace, _designer, _reco, ...input } = cfg;
        auditPlan(E, input, (s, c, at, msg) => {
            const k = `${s}:${c}`;
            counts[k] = (counts[k] || 0) + 1;
            if (ALL_CODE && c === ALL_CODE) all.push(`${ctx}\t${at}\t${msg}`);
            if (!seen.has(k)) { seen.add(k); plansHit[k] = (plansHit[k] || 0) + 1; for (const sn of surf) { const o = codeSurf[k] ||= {}; o[sn] = (o[sn] || 0) + 1; } (ex[k] ||= []); if (ex[k].length < show) ex[k].push(`${ctx} ${at} → ${msg}`); }
        });
        const ks = [...seen], bad = ks.some(k => k.startsWith('H'));
        if (bad) badPlans++; else if (ks.length) warnPlans++;
        if (bad) badReach++;
        for (const sname of surf) { const b = bySurface[sname] ||= [0, 0]; b[0]++; if (bad) b[1]++; }
    }
    console.log = origLog; console.warn = origWarn;
    parentPort.postMessage({ counts, plansHit, ex, badPlans, warnPlans, bySurface, codeSurf, badReach, all });
}
