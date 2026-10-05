import { epleyE1RM } from './strengthMath';
// strengthCoachEngine.js — DRVN 重訓「結算」教練引擎（純前端、零依賴、永不失敗）
// ──────────────────────────────────────────────────────────────────────────
// 對照文件：DRVN_教練回饋結算系統_合格標準與雙端稽核_v1.md（§1.3 / §3.1 / §3.4）
// 目的：把後端 core/training_partner.py::generate_workout_summary 的規則邏輯移植為
//   前端純函式，讓結算頁「離線 / 後端故障也永遠有 F1–F4 回饋」（不變式 I9），
//   並新增 DRVN Strength Score（0–100，五 pillar、誠實 null）。
//
//   • computeStrengthMetrics(session)      衍生指標（e1RM / RPE / 完成度 / 進步 / 穩定）
//   • computeStrengthScore(M)              0–100 執行品質分數（缺數據不算、權重重分配）
//   • buildStrengthIntelligence(session)   肯定→進步→教練（三段式 + 逐點 + 分數），永不空手
//   • strengthChartCoachNote(chart, ...)   圖表「看圖說話」短評（§1.4 C1）
//
//   誠實鐵律：無 RPE → 不下「有效組/強度」判讀（H1）；無歷史 → 不宣稱進步、改「第一筆基準」（H2）；
//            e1RM reps 夾 1–15，不外推假 1RM（H4）；<2 筆歷史不畫趨勢（H6）。
// ──────────────────────────────────────────────────────────────────────────

const E1RM_REPS_CAP = 15;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v) => Math.round(v * 10) / 10;

/* 🔢 2026-09 稽核：本檔原本自己夾 15，但 TrainingRecordPageMobile 夾 12、
   metricsCalculator 完全不夾 —— 同一組訓練三個 1RM。
   實作統一移到 utils/strengthMath（夾 12，最保守），這裡改為 re-export，
   既有呼叫端不用改。 */
export { epleyE1RM };

const LOWER_KEYS = ['squat', 'deadlift', 'leg', 'lunge', 'hip thrust', '深蹲', '硬舉', '腿', '臀', '弓箭'];
const isLowerBody = (name) => LOWER_KEYS.some((k) => String(name || '').toLowerCase().includes(k));

const MUSCLE_ZH = { chest: '胸', back: '背', shoulders: '肩', legs: '腿', arms: '手臂', core: '核心', glutes: '臀' };

/** 把寬鬆的 exercises 形狀正規化成 [{name, sets:[{weight,reps,rpe}]}]（只留有效組）。 */
function normalizeExercises(exercises = []) {
    const out = [];
    for (const ex of exercises || []) {
        const name = ex?.name || ex?.exercise_name;
        if (!name) continue;
        const rawSets = ex?.sets || ex?.detailedSets || [];
        const rows = [];
        for (const s of rawSets) {
            if (!s || typeof s !== 'object') continue;
            const w = num(s.weight);
            const r = Math.round(num(s.reps));
            const rpe = num(s.rpe);
            // 只採計「有做的組」：有重量與次數，或明確標記 completed。
            if (w > 0 && r > 0) rows.push({ weight: w, reps: r, rpe });
        }
        if (rows.length) out.push({ name, sets: rows });
    }
    return out;
}

/** 歷史紀錄陣列 → 每動作近 N 天最佳 e1RM。history: [{exercises:[...], total_volume, timestamp, focus_group}] */
function historyBestE1RM(history = []) {
    const best = {};
    for (const rec of history || []) {
        for (const ex of normalizeExercises(rec?.exercises)) {
            const b = Math.max(0, ...ex.sets.map((s) => epleyE1RM(s.weight, s.reps)));
            if (b > (best[ex.name] || 0)) best[ex.name] = b;
        }
    }
    return best;
}

// ── 負荷管理 ACWR（急慢性負荷比）— 港自後端 _analyze_load_management ─────────
//   需至少一筆「8–28 天前」的紀錄當慢性基線，否則不判定（新用戶硬算會恆為過載，H7）。
export function computeLoadACWR(priorWorkouts = [], totalVolume = 0) {
    const now = Date.now();
    let vol7 = num(totalVolume), vol28 = num(totalVolume), baseline = 0;
    for (const w of priorWorkouts || []) {
        const t = Date.parse(w.timestamp || 0);
        if (!Number.isFinite(t)) continue;
        const ageDays = (now - t) / 864e5;
        const v = num(w.total_volume ?? w.totalVolume);
        if (ageDays <= 7) vol7 += v;
        if (ageDays <= 28) { vol28 += v; if (ageDays > 7) baseline += 1; }
    }
    const weeklyAvg = vol28 > 0 ? vol28 / 4 : 0;
    const ratio = (weeklyAvg > 0 && baseline > 0) ? vol7 / weeklyAvg : null;
    let zone = null;
    if (ratio != null) zone = ratio > 1.5 ? 'overload' : ratio > 1.3 ? 'caution' : ratio < 0.8 ? 'detraining' : 'optimal';
    return { acwr: ratio == null ? null : round1(ratio), zone, weekVolume: Math.round(vol7), weeklyAvg: Math.round(weeklyAvg) };
}

// ── 衍生指標 ────────────────────────────────────────────────────────────────
export function computeStrengthMetrics(session = {}) {
    const exercises = normalizeExercises(session.exercises);
    const exercisePRs = session.exercisePRs || {}; // {動作名: 歷史最大重量kg}
    const history = Array.isArray(session.priorWorkouts) ? session.priorWorkouts : [];
    const focus = session.focusGroup || session.focus_group || '';
    const durationSec = num(session.durationSeconds ?? session.duration_seconds);

    const totalVolume = num(session.totalVolume) ||
        exercises.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.weight * s.reps, 0), 0);

    const planned = num(session.totalSets);
    const completed = num(session.completedSets);
    const completion = planned > 0 ? Math.min(100, (completed / planned) * 100) : 100;

    // 強度：真實 RPE
    const allRpe = exercises.flatMap((ex) => ex.sets.map((s) => s.rpe).filter((r) => r > 0));
    const hasRpe = allRpe.length > 0;
    const avgRpe = hasRpe ? round1(allRpe.reduce((a, b) => a + b, 0) / allRpe.length) : null;
    const totalSetsLogged = exercises.reduce((a, ex) => a + ex.sets.length, 0);
    const hardSets = exercises.reduce((a, ex) => a + ex.sets.filter((s) => s.rpe >= 7).length, 0);
    const effectiveRatio = totalSetsLogged > 0 ? hardSets / totalSetsLogged : 0;

    // 每動作：頂組（e1RM 最大）、本次 e1RM、對比歷史（e1RM 與 PR）
    const histE1RM = historyBestE1RM(history);
    const perEx = exercises.map((ex) => {
        const top = ex.sets.reduce((a, s) => (epleyE1RM(s.weight, s.reps) > epleyE1RM(a.weight, a.reps) ? s : a), ex.sets[0]);
        const curE1RM = epleyE1RM(top.weight, top.reps);
        const prevE1RM = histE1RM[ex.name] || 0;
        const e1rmDeltaPct = prevE1RM > 0 ? ((curE1RM - prevE1RM) / prevE1RM) * 100 : null;
        const vol = ex.sets.reduce((a, s) => a + s.weight * s.reps, 0);
        const maxW = Math.max(0, ...ex.sets.map((s) => s.weight));
        const histMaxW = num(exercisePRs[ex.name]);
        const isPR = maxW > 0 && histMaxW > 0 && maxW > histMaxW;
        // 組間穩定：頂組 volume → 末組 volume 的衰退幅度（越小＝選重與組間恢復越到位）
        const first = ex.sets[0], last = ex.sets[ex.sets.length - 1];
        const vFirst = first.weight * first.reps, vLast = last.weight * last.reps;
        const decayPct = vFirst > 0 ? Math.max(0, (vFirst - vLast) / vFirst) * 100 : 0;
        return { name: ex.name, top, e1rm: round1(curE1RM), e1rmDeltaPct: e1rmDeltaPct == null ? null : round1(e1rmDeltaPct), volume: vol, maxW, histMaxW, isPR, decayPct, setCount: ex.sets.length };
    }).sort((a, b) => b.volume - a.volume);

    const prCount = perEx.filter((e) => e.isPR).length;
    const e1rmGainer = perEx.filter((e) => e.e1rmDeltaPct != null).sort((a, b) => b.e1rmDeltaPct - a.e1rmDeltaPct)[0] || null;
    const hasHistory = history.length > 0 || Object.keys(exercisePRs).length > 0;

    // 容量：與上次同部位比（需 priorWorkouts）
    const sameFocus = focus ? history.filter((w) => (w.focus_group || w.focusGroup || '') === focus) : [];
    const ref = sameFocus.length ? sameFocus : history;
    const lastVol = ref.map((w) => num(w.total_volume ?? w.totalVolume)).find((v) => v > 0) ?? null;
    const volDeltaPct = lastVol && totalVolume > 0 ? ((totalVolume - lastVol) / lastVol) * 100 : null;

    // 近 30 天同部位最佳
    const cutoff = Date.now() - 30 * 864e5;
    const recentVols = ref.filter((w) => {
        const t = Date.parse(w.timestamp || 0); return Number.isFinite(t) && t >= cutoff;
    }).map((w) => num(w.total_volume ?? w.totalVolume)).filter((v) => v > 0);
    const is30dBest = totalVolume > 0 && (recentVols.length === 0 || totalVolume >= Math.max(...recentVols));

    // 訓練密度 kg/分（同樣的量做更快＝也是變強）
    const curDensity = durationSec >= 60 && totalVolume > 0 ? totalVolume / (durationSec / 60) : null;

    // 中位組間衰退（給組間穩定 pillar）
    const decays = perEx.filter((e) => e.setCount >= 2).map((e) => e.decayPct);
    const medianDecay = decays.length ? decays.sort((a, b) => a - b)[Math.floor(decays.length / 2)] : null;

    // 負荷管理 ACWR（離線也算得出）
    const load = computeLoadACWR(history, totalVolume);

    return {
        exercises, perEx, focus, focusZh: MUSCLE_ZH[String(focus).toLowerCase()] || focus,
        totalVolume, planned, completed, completion, durationSec,
        hasRpe, avgRpe, totalSetsLogged, hardSets, effectiveRatio,
        prCount, e1rmGainer, hasHistory, lastVol, volDeltaPct,
        is30dBest, recentVolsCount: recentVols.length, curDensity, medianDecay,
        acwr: load.acwr, acwrZone: load.zone, weekVolume: load.weekVolume,
        prAlerts: perEx.filter((e) => e.isPR).map((e) => ({ name: e.name, oldPR: e.histMaxW, newPR: e.maxW })),
    };
}

// ── DRVN Strength Score（0–100）───────────────────────────────────────────
//   pillar 只有在有真實數據時才計分，缺的不算、滿分自動重分配（誠實不灌水）。
//   核心 pillar = 強度執行 或 漸進超負荷；兩者皆無或可評 <2 → 不評分（null，I7）。
export function computeStrengthScore(M) {
    const pillars = [];
    const add = (key, label, points, max, note) => pillars.push({ key, label, points: Math.round(points), max, note });

    // 1. 強度執行（需 RPE）— 頂組費力度落在增肌區
    if (M.hasRpe && M.avgRpe != null) {
        const r = M.avgRpe;
        const p = (r >= 8 && r <= 9.5) ? 25 : (r >= 7 && r < 8) ? 20 : (r > 9.5) ? 16 : 12;
        add('intensity', '強度執行', p, 25, `平均 RPE ${r}`);
    }
    // 2. 有效組佔比（需 RPE）
    if (M.hasRpe && M.totalSetsLogged > 0) {
        const ratio = M.effectiveRatio;
        const p = ratio >= 0.7 ? 20 : ratio >= 0.5 ? 15 : ratio >= 0.3 ? 10 : 5;
        add('effective', '有效組', p, 20, `${M.hardSets}/${M.totalSetsLogged} 組 RPE≥7`);
    }
    // 3. 漸進超負荷（需歷史）
    if (M.hasHistory) {
        let p;
        if (M.prCount > 0) p = 25;
        else if (M.e1rmGainer && M.e1rmGainer.e1rmDeltaPct >= 2) p = 24;
        else if (M.volDeltaPct != null && M.volDeltaPct >= 3) p = 20;
        else if (M.volDeltaPct != null && M.volDeltaPct > -3) p = 15;   // 持平＝鞏固
        else if (M.volDeltaPct != null && M.volDeltaPct > -8) p = 10;
        else if (M.volDeltaPct != null) p = 6;
        else p = 15; // 有歷史但無同部位容量可比（如換了部位）→ 視為鞏固中性分
        add('progression', '漸進超負荷', p, 25, M.prCount > 0 ? `${M.prCount} 個 PR` : (M.volDeltaPct != null ? `容量 ${M.volDeltaPct >= 0 ? '+' : ''}${Math.round(M.volDeltaPct)}%` : ''));
    }
    // 4. 計劃完成度（總是可評）
    {
        const c = M.completion;
        const p = c >= 100 ? 15 : c >= 80 ? 12 : c >= 60 ? 8 : 4;
        add('completion', '計劃完成度', p, 15, `${Math.round(c)}%`);
    }
    // 5. 組間穩定（需多組）
    if (M.medianDecay != null) {
        const d = M.medianDecay;
        const p = d < 15 ? 15 : d < 30 ? 10 : 6;
        add('consistency', '組間穩定', p, 15, `掉組 ${Math.round(d)}%`);
    }

    const sumMax = pillars.reduce((s, p) => s + p.max, 0);
    const sumPts = pillars.reduce((s, p) => s + p.points, 0);
    const hasCore = pillars.some((p) => p.key === 'intensity' || p.key === 'progression');
    if (pillars.length < 2 || !hasCore || sumMax === 0) {
        return { score: null, grade: null, pillars, basis: 'insufficient' };
    }
    const score = Math.round((sumPts / sumMax) * 100);
    const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
    return { score, grade, pillars, basis: M.hasRpe ? 'full' : 'no_rpe' };
}

// ── 下一步處方（雙重漸進，取容量前 2 大主項）─────────────────────────────
//   誠實鐵律 H1：沒有真實 RPE 時，處方不得引用 RPE 數字或費力度判讀，只依「重量×次數」開藥。
function buildPrescriptions(M) {
    const prescriptions = [];
    const exerciseNotes = {};
    for (const e of M.perEx.slice(0, 2)) {
        const top = e.top;
        const inc = isLowerBody(e.name) ? 5 : 2.5;
        const hasRpe = M.hasRpe && top.rpe > 0;
        const rpe = top.rpe || 0;
        let note;
        if (hasRpe && top.reps >= 12 && rpe <= 8) {
            note = `已達次數上限且還有餘力（費力度 ${rpe}），下次加重到 ${top.weight + inc}kg，次數先回到區間下緣（例如 8 下），再慢慢做回上限。`;
        } else if (hasRpe && rpe >= 9.5 && top.reps <= 6) {
            note = `頂組已接近力竭（費力度 ${rpe}），下次降 5% 重量（約 ${Math.round(top.weight * 0.95 * 2) / 2}kg），把每組次數做滿，先累積訓練量再衝重量。`;
        } else if (hasRpe && top.reps >= 8 && rpe <= 8.5) {
            note = `保持 ${top.weight}kg，下次每組多做 1 下（做到 ${top.reps + 1} 下）。做滿次數上限後再加重，這就是最穩的漸進方式。`;
        } else if (top.reps >= 12) {
            note = `已達次數上限，下次加重到 ${top.weight + inc}kg，次數先回到區間下緣（例如 8 下）再慢慢做回上限。`;
        } else if (top.reps <= 6) {
            note = `頂組 ${top.weight}kg 次數偏低，下次先把每組次數做滿（做到 8 下）再加重，先累積訓練量。`;
        } else {
            note = `保持 ${top.weight}kg，下次每組多做 1 下（做到 ${top.reps + 1} 下）；做滿次數上限後再加重，這是最穩的漸進方式。`;
        }
        prescriptions.push(`${e.name}：${note}`);
        exerciseNotes[e.name] = note;
    }
    return { prescriptions, exerciseNotes };
}

// ── 肌群 28 天容量桶 + 落後部位（給雷達圖與「平衡」卡共用）─────────────────
export function computeMuscleBuckets(priorWorkouts = [], focus = '', curVolume = 0) {
    const now = Date.now();
    const buckets = {};
    for (const g of MUSCLE_ORDER) buckets[g] = 0;
    for (const r of priorWorkouts || []) {
        const t = Date.parse(r.timestamp || 0);
        if (Number.isFinite(t) && (now - t) / 864e5 <= 28) {
            const g = String(r.focus_group ?? r.focusGroup ?? '').toLowerCase();
            if (g in buckets) buckets[g] += num(r.total_volume ?? r.totalVolume);
        }
    }
    const f = String(focus).toLowerCase();
    if (f in buckets) buckets[f] += num(curVolume);
    const trained = MUSCLE_ORDER.filter((g) => buckets[g] > 0);
    const maxM = Math.max(0, ...MUSCLE_ORDER.map((g) => buckets[g]));
    let laggingMuscle = null;
    if (trained.length >= 3 && maxM > 0) {
        const lowG = trained.reduce((a, g) => (buckets[g] < buckets[a] ? g : a), trained[0]);
        if (buckets[lowG] / maxM < 0.4) laggingMuscle = MUSCLE_ZH[lowG] || lowG;
    }
    return { buckets, trained, laggingMuscle };
}

// ── F5 長期趨勢：近幾次容量走向（<3 筆誠實說「多練幾次就長出來」，H6）─────────
function buildTrend(M, history) {
    const f = String(M.focus).toLowerCase();
    const sameFocus = f ? history.filter((r) => String(r.focus_group ?? r.focusGroup ?? '').toLowerCase() === f) : history;
    const base = sameFocus.length >= 3 ? sameFocus : history;
    const vols = base
        .slice().sort((a, b) => (Date.parse(b.timestamp || 0) || 0) - (Date.parse(a.timestamp || 0) || 0))
        .map((r) => num(r.total_volume ?? r.totalVolume)).filter((v) => v > 0).slice(0, 6);
    if (vols.length < 3) {
        return `多練幾次${M.focusZh || '同部位'}，這裡就會長出你的長期容量趨勢線。`;
    }
    const half = Math.floor(vols.length / 2);
    const newer = vols.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const older = vols.slice(half).reduce((a, b) => a + b, 0) / (vols.length - half);
    const pct = older > 0 ? (newer - older) / older * 100 : 0;
    if (pct >= 5) return `最近幾次${M.focusZh || '訓練'}容量穩定往上堆（約 +${Math.round(pct)}%），訓練量正在漸進累積。`;
    if (pct <= -8) return `最近幾次容量走低（約 ${Math.round(pct)}%），可能累積了疲勞，安排一次減量或恢復日會有幫助。`;
    return `最近幾次容量維持穩定，正在把${M.focusZh || '這個部位'}的基礎打厚。`;
}

// ── F3 表現卡池（多維度判讀；每卡＝判讀＋為什麼＋下一步）───────────────────
function buildStrengthPool(M, ctx) {
    const pool = [];
    const add = (o) => pool.push(o);

    // 漸進（依真實進步；無歷史 → 基準 info）
    if (M.prCount > 0) add({ category: 'progression', tone: 'praise', priority: 95, title: '刷新個人紀錄', metric: `${M.prCount} PR`, verdict: `這堂課刷新了 ${M.prCount} 個動作的最大重量。`, why: '絕對力量提升是最硬的進步證據。', action: '下次以新重量為基準，次數先回下緣再往上做。' });
    else if (M.e1rmGainer && M.e1rmGainer.e1rmDeltaPct >= 2) add({ category: 'progression', tone: 'praise', priority: 88, title: '估算 1RM 創高', metric: `+${Math.round(M.e1rmGainer.e1rmDeltaPct)}%`, verdict: `${M.e1rmGainer.name} 的估算 1RM 比歷史最佳高 ${Math.round(M.e1rmGainer.e1rmDeltaPct)}%。`, why: '同樣動作能舉更重，代表神經與肌力都在進步。', action: '維持這個重量做穩幾次，再往上加。' });
    else if (M.volDeltaPct != null && M.volDeltaPct >= 3) add({ category: 'progression', tone: 'praise', priority: 80, title: '容量進步', metric: `+${Math.round(M.volDeltaPct)}%`, verdict: `總容量比上次同部位多 ${Math.round(M.volDeltaPct)}%。`, why: '訓練總量是肌肥大的主要驅動力。', action: '穩住品質，讓容量緩步再往上。' });
    else if (M.volDeltaPct != null && M.volDeltaPct >= -3) add({ category: 'progression', tone: 'info', priority: 45, title: '鞏固期', metric: `${M.volDeltaPct >= 0 ? '+' : ''}${Math.round(M.volDeltaPct)}%`, verdict: '容量與上次同部位持平，處於鞏固期。', why: '肌肉在重複而穩定的刺激中成長，不是每次都要破紀錄。', action: '守住重量與品質，下一步就有加量空間。' });
    else if (M.volDeltaPct != null) add({ category: 'progression', tone: 'info', priority: 42, title: '單日減量', metric: `${Math.round(M.volDeltaPct)}%`, verdict: `容量比上次少 ${Math.round(Math.abs(M.volDeltaPct))}%。`, why: '單日波動很正常，看趨勢不看單點。', action: '把動作品質顧好，比硬撐容量更重要。' });

    // 強度（需 RPE）
    if (M.hasRpe && M.avgRpe != null) {
        if (M.avgRpe >= 7 && M.avgRpe <= 9) add({ category: 'intensity', tone: 'praise', priority: 70, title: '強度落在增肌區', metric: `RPE ${M.avgRpe}`, verdict: `平均費力度 RPE ${M.avgRpe}，落在最有效的增肌區間。`, why: 'RPE 7–9 兼顧刺激與安全，是肌肥大的甜蜜點。', action: '維持這個費力度，靠漸進超負荷慢慢加。' });
        else if (M.avgRpe > 9.5) add({ category: 'intensity', tone: 'warn', priority: 78, title: '接近力竭偏多', metric: `RPE ${M.avgRpe}`, verdict: `平均費力度 RPE ${M.avgRpe}，多數組接近力竭。`, why: '長期把每組都練到力竭會拖慢恢復、增加受傷風險。', action: '留 1–2 下餘力（RPE 8 左右），累積更多有效量。' });
        else if (M.avgRpe < 7) add({ category: 'intensity', tone: 'info', priority: 50, title: '強度偏保守', metric: `RPE ${M.avgRpe}`, verdict: `平均費力度 RPE ${M.avgRpe}，離力竭還有不少空間。`, why: '太輕的重量刺激不足，肌肉沒有變強的理由。', action: '下次加一點重量，把費力度推到 7–9。' });
    }

    // 有效組（需 RPE）
    if (M.hasRpe && M.totalSetsLogged > 0) {
        if (M.effectiveRatio >= 0.7) add({ category: 'effective', tone: 'praise', priority: 60, title: '有效組佔比高', metric: `${M.hardSets}/${M.totalSetsLogged}`, verdict: `${M.hardSets} 組達 RPE≥7，佔比 ${Math.round(M.effectiveRatio * 100)}%。`, why: '有效組（接近力竭的組）才是真正推動成長的刺激。', action: '維持，暖身組別記進有效量即可。' });
        else if (M.effectiveRatio < 0.3) add({ category: 'effective', tone: 'info', priority: 48, title: '有效組偏少', metric: `${M.hardSets}/${M.totalSetsLogged}`, verdict: `只有 ${M.hardSets} 組達 RPE≥7。`, why: '刺激不足時，訓練量再大也難換到成長。', action: '主項後段組把重量或次數推近力竭一點。' });
    }

    // 負荷 ACWR
    if (M.acwrZone === 'overload') add({ category: 'load', tone: 'warn', priority: 92, title: '訓練負荷過載', metric: `ACWR ${M.acwr}`, verdict: `近 7 天訓練量是月均的 ${M.acwr} 倍。`, why: '負荷升太快是最常見的受傷主因。', action: '接下來 2–3 天把量收回來，維持強度即可。' });
    else if (M.acwrZone === 'caution') add({ category: 'load', tone: 'warn', priority: 74, title: '負荷偏高', metric: `ACWR ${M.acwr}`, verdict: `近 7 天負荷偏高（急慢性比 ${M.acwr}）。`, why: '再往上堆容易累積疲勞。', action: '加量先踩住，維持強度就好。' });
    else if (M.acwrZone === 'optimal') add({ category: 'load', tone: 'praise', priority: 40, title: '負荷在最佳區', metric: `ACWR ${M.acwr}`, verdict: `訓練量落在最佳區間（急慢性比 ${M.acwr}）。`, why: '這個節奏兼顧進步與恢復。', action: '穩定漸進即可。' });
    else if (M.acwrZone === 'detraining') add({ category: 'load', tone: 'info', priority: 38, title: '可放心加量', metric: `ACWR ${M.acwr}`, verdict: '近期訓練量低於身體習慣的水準。', why: '身體有餘裕承接更多刺激。', action: '可以把頻率或訓練量補回來。' });

    // 完成度
    if (M.completion >= 100) add({ category: 'completion', tone: 'praise', priority: 52, title: '計劃全數完成', metric: '100%', verdict: '今天把計劃組數全數完成。', why: '穩定的執行力是長期進步的地基。', action: '維持這個節奏。' });
    else if (M.completion < 60) add({ category: 'completion', tone: 'info', priority: 44, title: '完成度偏低', metric: `${Math.round(M.completion)}%`, verdict: `完成了 ${Math.round(M.completion)}% 的計劃。`, why: '沒練完可能是排程太滿或當天狀態不佳。', action: '下次把課表份量抓得更符合當天狀態。' });

    // 平衡·肌群偏科
    if (ctx.laggingMuscle) add({ category: 'balance', tone: 'info', priority: 56, title: '肌群發展提醒', metric: ctx.laggingMuscle, verdict: `近 4 週 ${ctx.laggingMuscle} 的訓練量偏低。`, why: '長期偏科會讓體態與力量發展失衡、增加代償風險。', action: `下週安排一堂 ${ctx.laggingMuscle} 補上。` });

    // 亮點·本日 MVP
    const mvp = M.perEx[0];
    if (mvp && M.totalVolume > 0) {
        const share = Math.round((mvp.volume / M.totalVolume) * 100);
        add({ category: 'highlight', tone: 'praise', priority: 30, title: '本日主力動作', metric: `${share}%`, verdict: `${mvp.name} 扛起本日 ${share}% 的總容量。`, why: '主力複合動作是這堂課的成長引擎。', action: '把它排在前段體力最好時做。' });
    }

    return pool;
}

function selectStrengthCards(pool, N = 4) {
    const sorted = [...pool].sort((a, b) => b.priority - a.priority);
    const picked = [];
    const catCount = {};
    let loadWarn = 0;
    for (const c of sorted) {
        if (picked.length >= N) break;
        if ((catCount[c.category] || 0) >= 2) continue;           // 同類最多 2
        if (c.category === 'load' && c.tone === 'warn' && loadWarn >= 1) continue; // 負荷 warn 最多 1
        picked.push(c);
        catCount[c.category] = (catCount[c.category] || 0) + 1;
        if (c.category === 'load' && c.tone === 'warn') loadWarn++;
    }
    // 至少 1 praise（成就感保證 I3）
    if (!picked.some((c) => c.tone === 'praise')) {
        const p = sorted.find((c) => c.tone === 'praise' && !picked.includes(c));
        if (p) picked[picked.length - 1] = p;
    }
    // 至少 1 可行動（warn/info 帶 action）
    if (!picked.some((c) => (c.tone === 'warn' || c.tone === 'info') && c.action)) {
        const a = sorted.find((c) => (c.tone === 'warn' || c.tone === 'info') && c.action && !picked.includes(c));
        if (a) picked[picked.length - 1] = a;
    }
    return picked;
}

/**
 * 主入口 — 重訓結算智慧（永不空手 I9）。輸出向後相容既有 coachSummary 形狀，
 *   另附 strengthScore / strengthGrade / scorePillars / coachCards(F3) / trend(F5)。
 * @param {object} session { exercises, completedSets, totalSets, durationSeconds, focusGroup, exercisePRs, priorWorkouts }
 */
export function buildStrengthIntelligence(session = {}) {
    const M = computeStrengthMetrics(session);
    const history = (Array.isArray(session.priorWorkouts) ? session.priorWorkouts : []).filter((r) => num(r.total_volume ?? r.totalVolume) > 0);
    const mb = computeMuscleBuckets(history, M.focus, M.totalVolume);
    const trend = buildTrend(M, history);
    const coachCards = selectStrengthCards(buildStrengthPool(M, { laggingMuscle: mb.laggingMuscle }), 4);
    const scoreObj = computeStrengthScore(M);
    const topPillar = scoreObj.pillars.length
        ? scoreObj.pillars.slice().sort((a, b) => (b.points / b.max) - (a.points / a.max))[0] : null;
    const topTxt = topPillar ? `，${topPillar.label}是今天最亮眼的一塊` : '';

    // 語氣定調：PR > e1RM 進步 > 容量進步 > 明顯下滑 > 穩定
    let tone;
    if (M.prCount > 0) tone = 'celebrating';
    else if (M.e1rmGainer && M.e1rmGainer.e1rmDeltaPct >= 2) tone = 'praise';
    else if (M.volDeltaPct != null && M.volDeltaPct >= 3) tone = 'praise';
    else if (M.volDeltaPct != null && M.volDeltaPct <= -8) tone = 'supportive';
    else tone = 'steady';

    // ① 肯定（分數 + 最強項驅動 → 每堂不同）
    let validation;
    if (tone === 'supportive') {
        validation = '今天狀態不在高點還是把課上完了——願意出現，這件事本身就值得肯定。';
    } else if (M.prCount > 0) {
        validation = `今天做得非常好，一堂課就刷新了 ${M.prCount} 個個人紀錄。`;
    } else if (scoreObj.score == null) {
        validation = '這堂課資料還不夠深入評分，但有出現、有累積，這一步就值得肯定。';
    } else if (scoreObj.score >= 85) {
        validation = `今天執行得很漂亮，Strength Score ${scoreObj.score}（${scoreObj.grade}）${topTxt}。`;
    } else if (scoreObj.score >= 70) {
        validation = `整體執行很紮實，Strength Score ${scoreObj.score}（${scoreObj.grade}）${topTxt}。`;
    } else {
        validation = `有出現、有累積就是好的開始，Strength Score ${scoreObj.score}${topPillar ? `，${topPillar.label}是相對亮眼的一塊` : ''}。`;
    }

    // ② 進步 — 金字塔（只認真實進步；全落空誠實鞏固/基準）
    const progParts = [];
    if (M.prCount > 0) {
        const best = M.prAlerts.reduce((a, b) => ((b.newPR - b.oldPR) > (a.newPR - a.oldPR) ? b : a), M.prAlerts[0]);
        progParts.push(`破了 ${M.prCount} 個 PR，最亮眼是 ${best.name} ${best.oldPR}→${best.newPR}kg`);
    }
    if (M.e1rmGainer && M.e1rmGainer.e1rmDeltaPct >= 2 && M.prCount === 0) {
        progParts.push(`${M.e1rmGainer.name} 的估算 1RM 比歷史最佳高 ${Math.round(M.e1rmGainer.e1rmDeltaPct)}%（${M.e1rmGainer.e1rm}kg）`);
    }
    if (M.volDeltaPct != null && M.volDeltaPct >= 3) {
        progParts.push(`總容量 ${Math.round(M.totalVolume)}kg，比上次同部位多 ${Math.round(M.volDeltaPct)}% — 紮實的容量進步`);
    }
    if (M.is30dBest && M.totalVolume > 0 && M.prCount === 0 && M.recentVolsCount >= 2) {
        progParts.push(`是近 30 天最強的一次${M.focusZh || '訓練'}`);
    }
    const madeProgress = progParts.length > 0;
    if (!madeProgress) {
        if (M.volDeltaPct != null && M.volDeltaPct >= -3 && M.volDeltaPct <= 3) {
            progParts.push(`總容量 ${Math.round(M.totalVolume)}kg，與上次同部位持平（${M.volDeltaPct >= 0 ? '+' : ''}${round1(M.volDeltaPct)}%）— 這是鞏固期：守住重量與品質，下一步就有加量空間`);
        } else if (M.volDeltaPct != null && M.volDeltaPct < -3) {
            progParts.push(`總容量 ${Math.round(M.totalVolume)}kg，比上次少 ${Math.round(Math.abs(M.volDeltaPct))}% — 單日減量是正常波動，看趨勢不看單點`);
        } else if (M.totalVolume > 0) {
            progParts.push(`總容量 ${Math.round(M.totalVolume)}kg — 這是${M.focusZh || '訓練'}的第一筆基準，下次開始就能量化比較進步`);
        } else {
            progParts.push('本次資料不足以比較進步幅度，多記錄幾次就能看出趨勢');
        }
    }
    // 佐證（訓練品質證據，非進步宣稱；無 RPE 不寫 → H1）
    if (M.hasRpe && M.hardSets > 0) {
        progParts.push(`${M.hardSets} 個有效組（RPE≥7），平均 RPE ${M.avgRpe} — 強度落在有效增肌區間`);
    }
    const progressPoints = progParts.map((p) => (p.endsWith('。') ? p : p + '。'));

    // ③ 教練 — 下一步處方 + 恢復窗
    const { prescriptions, exerciseNotes } = buildPrescriptions(M);
    const coachParts = [];
    if (tone === 'supportive') coachParts.push('偏疲勞的一天，恢復也是訓練的一部分；下一步先回到原本重量、把動作做扎實，別急著加量。');
    if (prescriptions.length) prescriptions.forEach((p) => coachParts.push(`下一步 · ${p}`));
    else if (tone === 'celebrating' || tone === 'praise') coachParts.push('維持這個強度就好，把重點放在動作品質與組間充分恢復，讓進步穩定累積。');
    else coachParts.push('下一步：挑 1–2 個主項各加 2.5kg 或多做 1 下，用漸進超負荷慢慢往上堆。');
    const recoveryNote = M.focusZh
        ? `${M.focusZh}群給足 48–72 小時再練，期間可安排其他部位或低強度有氧。`
        : '同一肌群給足 48–72 小時恢復，期間可練其他部位。';
    coachParts.push(recoveryNote);

    return {
        validation,
        progress: progressPoints.join('') || progParts.join('、') + '。',
        coaching: coachParts.join(' '),
        progress_points: progressPoints,
        coaching_points: coachParts,
        exercise_notes: exerciseNotes,
        summary: `${validation} ${progressPoints.join('')} ${coachParts.join(' ')}`,
        tone,
        prescriptions,
        // 🆕 分數（前端頂部渲染）
        strengthScore: scoreObj.score,
        strengthGrade: scoreObj.grade,
        scorePillars: scoreObj.pillars,
        scoreBasis: scoreObj.basis,
        // 🆕 F3 表現卡池（tone 平衡） + F5 長期趨勢
        coachCards,
        trend,
        metrics: {
            total_volume: Math.round(M.totalVolume),
            volume_delta_pct: M.volDeltaPct == null ? null : round1(M.volDeltaPct),
            made_progress: madeProgress,
            pr_count: M.prCount,
            completion: Math.round(M.completion),
            is_30d_best: !!(M.is30dBest && M.recentVolsCount >= 2),
            avg_rpe: M.avgRpe,
            hard_sets: M.hardSets,
            top_exercise: M.perEx[0]?.name || null,
            acwr: M.acwr,
            acwr_zone: M.acwrZone,
        },
        has_history: M.hasHistory,
        source: 'client', // 標記來源：離線 fallback（後端到達會覆蓋為 server）
    };
}

/** 圖表看圖說話短評（§1.4 C1；資料不足誠實引導，不畫假圖）。 */
export function strengthChartCoachNote(chart, ctx = {}) {
    switch (chart) {
        case 'volumeTrend': {
            const series = (ctx.series || []).filter((v) => v > 0);
            if (series.length < 2) return '再練幾次同部位，這裡就會長出你的容量趨勢線。';
            const last = series[series.length - 1];
            const rank = series.filter((v) => v <= last).length;
            const prev = series[series.length - 2];
            const dir = last > prev ? '往上堆' : last < prev ? '略降（看趨勢不看單點）' : '維持';
            return `本次容量在近 ${series.length} 次排第 ${series.length - rank + 1} 高，整體${dir}。`;
        }
        case 'e1rm': {
            const d = ctx.deltaPct;
            if (d == null) return '這是這個動作的第一筆基準，之後每次就能看出估算 1RM 的進步幅度。';
            if (d >= 2) return `估算 1RM 比歷史最佳高 ${Math.round(d)}%，力量在往上走。`;
            if (d > -2) return '估算 1RM 與歷史最佳持平，維持品質就是在鞏固力量。';
            return '估算 1RM 略低於歷史最佳，可能疲勞或選重保守，看趨勢不看單點。';
        }
        case 'muscleBalance': {
            const lag = ctx.laggingMuscle;
            if (!lag) return '各肌群訓練量分佈平均，維持這個平衡。';
            return `${lag} 的近 4 週訓練量偏低，下週補一堂，避免發展失衡。`;
        }
        case 'acwr': {
            const z = ctx.zone;
            if (!z) return '還沒有足夠的慢性負荷基線，多記錄幾週就能判讀訓練量是否安全。';
            if (z === 'overload') return `近 7 天訓練量偏高（急慢性比 ${ctx.acwr}），接下來 2–3 天把量收回來。`;
            if (z === 'caution') return `負荷偏高（急慢性比 ${ctx.acwr}），加量先踩住、維持強度即可。`;
            if (z === 'detraining') return '近期訓練量低於身體習慣的水準，可以放心把頻率補回來。';
            return `訓練量落在最佳區間（急慢性比 ${ctx.acwr}），穩定漸進即可。`;
        }
        default: return '';
    }
}

// ── 結算頁圖表資料（§1.4 圖表回饋契約 C1–C5；資料不足 ready=false → 誠實空狀態）──
const recVol = (r) => num(r.total_volume ?? r.totalVolume) ||
    normalizeExercises(r.exercises).reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.weight * s.reps, 0), 0);
const recFocus = (r) => String(r.focus_group ?? r.focusGroup ?? '').toLowerCase();
const MUSCLE_ORDER = ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'];

export function buildStrengthCharts(session = {}) {
    const M = computeStrengthMetrics(session);
    const history = (Array.isArray(session.priorWorkouts) ? session.priorWorkouts : [])
        .filter((r) => recVol(r) > 0)
        .sort((a, b) => (Date.parse(a.timestamp || 0) || 0) - (Date.parse(b.timestamp || 0) || 0));
    const focus = String(session.focusGroup ?? session.focus_group ?? '').toLowerCase();
    const now = Date.now();

    // 1) 容量趨勢（同部位優先）
    const sameFocusHist = focus ? history.filter((r) => recFocus(r) === focus) : history;
    const base = (sameFocusHist.length ? sameFocusHist : history).slice(-7);
    const bars = base.map((r) => ({ vol: Math.round(recVol(r)), isCurrent: false }));
    bars.push({ vol: Math.round(M.totalVolume), isCurrent: true });
    const volSeries = bars.map((b) => b.vol);
    const volumeTrend = {
        ready: bars.length >= 2 && M.totalVolume > 0,
        bars,
        note: strengthChartCoachNote('volumeTrend', { series: volSeries }),
    };

    // 2) 主項 e1RM 進展
    const exName = M.perEx[0]?.name || null;
    let e1rm = { ready: false, exercise: exName, points: [], deltaPct: null, note: strengthChartCoachNote('e1rm', { deltaPct: null }) };
    if (exName) {
        const pts = [];
        for (const r of history) {
            const ex = normalizeExercises(r.exercises).find((e) => e.name === exName);
            if (!ex) continue;
            const best = Math.max(0, ...ex.sets.map((s) => epleyE1RM(s.weight, s.reps)));
            if (best > 0) pts.push({ e1rm: Math.round(best), isCurrent: false });
        }
        const curBest = Math.max(0, ...(M.perEx[0]?.top ? [epleyE1RM(M.perEx[0].top.weight, M.perEx[0].top.reps)] : [0]));
        const prevBest = pts.length ? Math.max(...pts.map((p) => p.e1rm)) : 0;
        const deltaPct = prevBest > 0 ? round1(((curBest - prevBest) / prevBest) * 100) : null;
        pts.push({ e1rm: Math.round(curBest), isCurrent: true });
        e1rm = {
            ready: pts.length >= 2 && prevBest > 0,
            exercise: exName, points: pts.slice(-6), best: Math.round(Math.max(prevBest, curBest)), deltaPct,
            note: strengthChartCoachNote('e1rm', { deltaPct }),
        };
    }

    // 3) 肌群平衡雷達（近 28 天各部位容量佔比）
    const buckets = {};
    for (const g of MUSCLE_ORDER) buckets[g] = 0;
    for (const r of history) {
        const t = Date.parse(r.timestamp || 0);
        if (Number.isFinite(t) && (now - t) / 864e5 <= 28) {
            const g = recFocus(r);
            if (g in buckets) buckets[g] += recVol(r);
        }
    }
    if (focus in buckets) buckets[focus] += M.totalVolume;
    const trained = MUSCLE_ORDER.filter((g) => buckets[g] > 0);
    const totalM = MUSCLE_ORDER.reduce((a, g) => a + buckets[g], 0);
    const maxM = Math.max(0, ...MUSCLE_ORDER.map((g) => buckets[g]));
    let laggingMuscle = null;
    if (trained.length >= 3 && maxM > 0) {
        const lowG = trained.reduce((a, g) => (buckets[g] < buckets[a] ? g : a), trained[0]);
        if (buckets[lowG] / maxM < 0.4) laggingMuscle = MUSCLE_ZH[lowG] || lowG;
    }
    const muscleBalance = {
        ready: trained.length >= 3,
        axes: MUSCLE_ORDER.map((g) => ({ key: g, label: MUSCLE_ZH[g] || g, volume: Math.round(buckets[g]), pct: totalM > 0 ? Math.round(buckets[g] / totalM * 100) : 0, norm: maxM > 0 ? buckets[g] / maxM : 0 })),
        laggingMuscle,
        note: strengthChartCoachNote('muscleBalance', { laggingMuscle }),
    };

    // 4) 負荷 ACWR 儀表
    const acwr = {
        ready: M.acwr != null,
        acwr: M.acwr, zone: M.acwrZone, weekVolume: M.weekVolume,
        note: strengthChartCoachNote('acwr', { acwr: M.acwr, zone: M.acwrZone }),
    };

    return { volumeTrend, e1rm, muscleBalance, acwr };
}

export default { computeStrengthMetrics, computeStrengthScore, buildStrengthIntelligence, buildStrengthCharts, strengthChartCoachNote, computeLoadACWR, epleyE1RM };
