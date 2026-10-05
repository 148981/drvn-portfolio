/**
 * personaDetector.js — 雙軸人格獨立判定
 * ──────────────────────────────────────────────────────────────────────
 * 從原始 session 資料，分兩軸獨立算出「目前偵測到的人格」：
 *   • detectRunningPersonas(cardio)  → 只吃跑步資料
 *   • detectFitnessPersonas(strength) → 只吃重訓資料
 *   • detectAllPersonas({ cardio, strength }) → 兩軸 + 混合，一次回傳
 *
 * 回傳為 persona id 陣列（例：['road_runner','night_runner']）。
 * 這些 id 會餵給 detectedPersonas store 做「曾偵測過」的永久記錄。
 *
 * 欄位解析刻意與 PersonalityViewMobile 的 extract* 對齊，
 * 支援後端 metrics 巢狀（distance_km / duration_seconds / avg_hr …）。
 * ──────────────────────────────────────────────────────────────────────
 */

import { RUNNING_PERSONAS, FITNESS_PERSONAS, HYBRID_PERSONAS } from './personaCatalog';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const m = (s) => (s && (s.metrics || s.stats)) || {};

// ── 跑步欄位解析 ──────────────────────────────────────────────────────
const sDist = (s) => num(m(s).distance_km ?? m(s).distance ?? s.distance_km ?? s.distance ?? s.distanceKm ?? s.km);
const sElev = (s) => num(
    s.elevationGain ?? s.elevation_gain ?? m(s).elevationGain ?? m(s).elevation_gain ??
    s.deepData?.elevationGain
);
const sPace = (s) => num(m(s).pace_per_km ?? m(s).avgPace ?? m(s).avg_pace ?? s.avgPace ?? s.pace ?? s.avg_pace);
const sTs = (s) => s?.date ?? s?.timestamp ?? s?.created_at ?? s?.startTime ?? s?.ts ?? null;
const sHour = (s) => {
    const raw = sTs(s);
    if (raw == null) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.getHours();
};
// 逐 session 的無氧（Zone4-5）占比：優先讀 zone 明細，退回 session 級欄位
const sAnaerobicFrac = (s) => {
    const z = s.hrZones || s.zones_summary || s.zoneMinutes || null;
    if (z) {
        const g = (k) => num(z[k] ?? z[`z${k}`] ?? z[`zone${k}`]);
        const total = g(1) + g(2) + g(3) + g(4) + g(5);
        if (total > 0) return (g(4) + g(5)) / total;
    }
    const direct = s.anaerobicFrac ?? m(s).anaerobicFrac;
    if (direct != null) return num(direct);
    const pct = s.anaerobicPct ?? m(s).anaerobic_pct;
    if (pct != null) return num(pct) / 100;
    return 0;
};

// ── 重訓欄位解析 ──────────────────────────────────────────────────────
const sVolume = (s) => num(s.total_volume ?? s.volume_kg ?? s.volume ?? m(s).volume);
/* 單次訓練裡最重的一組 —— 用來看「有沒有在加重量」。
   漸進超負荷是重訓唯一真正決定成效的事，原本的五個人格
   （築基／容量／紀律／強度／執行）全都沒有量到它。 */
const sTopWeight = (s) => {
    let best = 0;
    (s.exercises || s.completedExercises || []).forEach((ex) => {
        (ex.sets || ex.completedSets || []).forEach((set) => {
            best = Math.max(best, num(set.weight ?? set.kg));
        });
    });
    return best;
};
/* 這次練到哪些部位 —— 用來看課表有沒有偏食 */
const PART_KEYS = {
    腿: ['squat', '深蹲', '腿', 'leg', 'lunge', '弓步', '硬舉', 'deadlift', '臀', 'glute', 'hip'],
    胸: ['bench', '臥推', '胸', 'chest', 'fly', '飛鳥', 'dip'],
    背: ['row', '划船', '背', 'pull', '引體', '下拉', 'lat'],
    肩: ['shoulder', '肩', 'press', '推舉', 'raise', '平舉'],
    手: ['curl', '彎舉', '三頭', 'tricep', 'bicep', '二頭'],
    核心: ['plank', '棒式', 'core', '核心', 'crunch', '捲腹', '死蟲', 'bird'],
};
const sParts = (s) => {
    const parts = new Set();
    (s.exercises || s.completedExercises || []).forEach((ex) => {
        const n = String(ex.name || ex.nameEn || '').toLowerCase();
        Object.entries(PART_KEYS).forEach(([part, keys]) => {
            if (keys.some((k) => n.includes(k))) parts.add(part);
        });
    });
    return parts;
};
const sCompletion = (s) => num(m(s).completion_rate ?? s.completion_rate, 100);
const sRPEs = (s) => {
    const out = [];
    const exList = s.exercises || s.completedExercises || [];
    exList.forEach((ex) => {
        (ex.sets || ex.completedSets || []).forEach((set) => {
            const r = num(set.rpe ?? set.effortScore);
            if (r > 0 && r <= 10) out.push(r);
        });
    });
    return out;
};

const avg = (arr, d = 0) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : d);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * 把一組跑步 session 匯總成 detect() 用的 context。
 */
export function summarizeRunning(cardio = []) {
    const runs = Array.isArray(cardio) ? cardio : [];
    const runCount = runs.length;
    const distances = runs.map(sDist).filter((d) => d > 0);
    const totalDistance = distances.reduce((a, b) => a + b, 0);
    const avgDistance = avg(distances, 0);
    const elevs = runs.map(sElev).filter((e) => e > 0);
    const totalElev = elevs.reduce((a, b) => a + b, 0);
    const avgElev = avg(elevs, 0);

    const nightRuns = runs.filter((s) => { const h = sHour(s); return h != null && (h >= 19 || h < 5); }).length;
    const dawnRuns = runs.filter((s) => { const h = sHour(s); return h != null && h >= 5 && h < 8; }).length;

    // 配速穩定度（越穩越高）
    const paces = runs.map(sPace).filter((p) => p > 60 && p < 1000);
    const avgPace = avg(paces, 330);
    const paceVar = paces.length > 1
        ? Math.sqrt(paces.reduce((sq, n) => sq + Math.pow(n - avgPace, 2), 0) / paces.length)
        : avgPace;
    const paceStability = paces.length > 1
        ? clamp(100 - (paceVar / Math.max(avgPace, 1)) * 100)
        : 0;

    const anaerobicFracs = runs.map(sAnaerobicFrac);
    const anaerobicPct = Math.round(avg(anaerobicFracs, 0) * 100);

    return { runCount, totalDistance, avgDistance, totalElev, avgElev, nightRuns, dawnRuns, paceStability, anaerobicPct };
}

/**
 * 把一組重訓 session 匯總成 detect() 用的 context。
 */
export function summarizeFitness(strength = []) {
    const lifts = Array.isArray(strength) ? strength : [];
    const strengthCount = lifts.length;

    const volumes = lifts.map(sVolume).filter((v) => v > 0);
    const totalVolume = volumes.reduce((a, b) => a + b, 0);
    const avgVolume = Math.round(avg(volumes, 0));

    const rpes = lifts.flatMap(sRPEs);
    const avgRPE = parseFloat(avg(rpes, 0).toFixed(1));

    const completions = lifts.map(sCompletion);
    const completion = Math.round(avg(completions, 0));

    // 紀律：以「近 4 週訓練規律度 + 完成率 + 次數」合成，範圍 0-100
    const now = Date.now();
    const weekBuckets = [0, 0, 0, 0];
    lifts.forEach((s) => {
        const ts = new Date(sTs(s) || 0).getTime();
        const wk = Math.floor((now - ts) / 604800000);
        if (wk >= 0 && wk < 4) weekBuckets[wk]++;
    });
    const avgWk = weekBuckets.reduce((a, b) => a + b, 0) / 4;
    const wkVar = weekBuckets.reduce((sq, n) => sq + Math.pow(n - avgWk, 2), 0) / 4;
    const regularity = clamp(100 - wkVar * 15);
    const discipline = Math.round(clamp(
        regularity * 0.5 +
        (completion / 100) * 30 +
        Math.min(20, strengthCount * 2)
    ));

    /* 漸進：把訓練依時間排好，比「前三分之一」與「後三分之一」的最重一組。
       有在加重量 → 正的百分比。至少要 4 次才算得出趨勢。 */
    const dated = lifts
        .map((x) => ({ t: new Date(sTs(x) || 0).getTime(), top: sTopWeight(x) }))
        .filter((x) => Number.isFinite(x.t) && x.t > 0 && x.top > 0)
        .sort((a, b) => a.t - b.t);
    let progression = 0;
    if (dated.length >= 4) {
        const cut = Math.max(1, Math.floor(dated.length / 3));
        const early = avg(dated.slice(0, cut).map((x) => x.top), 0);
        const late = avg(dated.slice(-cut).map((x) => x.top), 0);
        if (early > 0) progression = Math.round(((late - early) / early) * 100);
    }

    /* 均衡：整段期間練到幾個部位（共 6 個） */
    const allParts = new Set();
    lifts.forEach((x) => sParts(x).forEach((pt) => allParts.add(pt)));
    const partsCovered = allParts.size;

    return { strengthCount, totalVolume, avgVolume, avgRPE, completion, discipline, progression, partsCovered };
}

/** 跑步軸：回傳目前偵測到的 running persona id 陣列 */
export function detectRunningPersonas(cardio = []) {
    const ctx = summarizeRunning(cardio);
    return RUNNING_PERSONAS.filter((p) => {
        try { return !!p.detect(ctx); } catch (_) { return false; }
    }).map((p) => p.id);
}

/** 健身軸：回傳目前偵測到的 fitness persona id 陣列 */
export function detectFitnessPersonas(strength = []) {
    const ctx = summarizeFitness(strength);
    return FITNESS_PERSONAS.filter((p) => {
        try { return !!p.detect(ctx); } catch (_) { return false; }
    }).map((p) => p.id);
}

/**
 * 一次判定兩軸 + 混合。
 * 回傳 { running:[], fitness:[], hybrid:[], all:[], ctx:{run, fit} }
 */
export function detectAllPersonas({ cardio = [], strength = [] } = {}) {
    const run = summarizeRunning(cardio);
    const fit = summarizeFitness(strength);

    const running = RUNNING_PERSONAS.filter((p) => { try { return !!p.detect(run); } catch (_) { return false; } }).map((p) => p.id);
    const fitness = FITNESS_PERSONAS.filter((p) => { try { return !!p.detect(fit); } catch (_) { return false; } }).map((p) => p.id);

    const both = { ...run, ...fit };
    const hybrid = HYBRID_PERSONAS.filter((p) => { try { return !!p.detect(both); } catch (_) { return false; } }).map((p) => p.id);

    return { running, fitness, hybrid, all: [...running, ...fitness, ...hybrid], ctx: { run, fit } };
}
