import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import apiClient from '../api/client';
import MobileNavigation from './MobileNavigation';
import { getUserId } from '../utils/auth';
import { editorialColors } from '../utils/colors';
import { Trophy } from 'lucide-react';
import EmptyState from './ui/EmptyState';
import { toLocalDateKey } from '../utils/localDate';
import { sessionVolume, exerciseVolume } from '../utils/strengthMath';
import { isPlausiblePace } from '../utils/format';
import { gradeRun, gradeLift, pctLine, runPctByGender, liftPctByGender } from '../utils/prStandards';
import './PRTierGlow.css';
import PRRankSheet from './PRRankSheet';
import { submitPRRanks } from '../utils/prRank';

/* ═══ COLORS ═══ */
const C = editorialColors;

/* ═══════════════════════════════════════════════════
   POWER PR TRACKER — Editorial Redesign
   Style: Basilare-inspired editorial / dark navy + warm gold
   ═══════════════════════════════════════════════════ */

/* ═══ TIER SYSTEM ═══ */
const TIERS = {
    diamond: { label: '鑽石', rank: 5, accent: '#FFF0D0', bg: 'linear-gradient(135deg, #2A0E44 0%, #7B5E20 100%)' },
    platinum: { label: '白金', rank: 4, accent: '#E0D5C8', bg: 'linear-gradient(135deg, #2C2C3A 0%, #15151D 100%)' },
    gold: { label: '黃金', rank: 3, accent: '#D4A853', bg: 'linear-gradient(135deg, #2A2010 0%, #141008 100%)' },
    silver: { label: '白銀', rank: 2, accent: '#B0B0B0', bg: 'linear-gradient(135deg, #222228 0%, #111114 100%)' },
    bronze: { label: '青銅', rank: 1, accent: '#C08050', bg: 'linear-gradient(135deg, #261A12 0%, #130D08 100%)' },
    none: { label: '—', rank: 0, accent: '#555', bg: '#111' },
};

/* ═══ PROFILE MODIFIERS ═══
   ⚠️ 這一整段以前在沒有資料時編了四個數字：性別預設 male、體重 75、
      骨骼肌 30、以及 catch 裡再編一整份。這些會乘進 strengthMult /
      volumeMult，直接影響 PR 的評級 —— 一個沒填過任何資料的人，
      會拿到一個用「75 公斤男性」算出來的等級，而畫面不會說那是假設的。
      現在缺就是缺：回 insufficient，由呼叫端顯示導航。 */
const NO_PROFILE = { insufficient: true, class: 'open', weight: null, gender: null,
    strengthMult: 1.0, cardioMult: 1.0, volumeMult: 1.0 };

const getProfileModifiers = (userId) => {
    try {
        let gender = null;
        try {
            const pStr = localStorage.getItem('userProfile_' + userId) || localStorage.getItem('userProfile');
            if (pStr) { const g = JSON.parse(pStr).gender; gender = ['male', 'female'].includes(String(g)) ? g : null; }
        } catch (e) { }

        const local = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (local.length === 0) return { ...NO_PROFILE, gender };

        const latest = local.reduce((max, item) => new Date(item.measurement_date || item.date) > new Date(max.measurement_date || max.date) ? item : max, local[0]);
        const w = parseFloat(latest.weight_kg);
        const sm = parseFloat(latest.skeletal_muscle_mass);
        // 有量測紀錄但沒有體重／肌肉量 → 一樣算不出等級，不要用預設值硬算
        if (!(w > 30 && w < 250) || !(sm > 0)) return { ...NO_PROFILE, gender };
        // 性別會決定 strengthMult（0.65 vs 1.0），沒有就不要猜
        if (!gender) return { ...NO_PROFILE, weight: w };

        let cls, baseMult = 1.0;
        if (gender === 'female') {
            if (w < 50) { cls = 'feather'; baseMult = 0.8; }
            else if (w < 60) { cls = 'light'; baseMult = 0.9; }
            else if (w < 70) { cls = 'middle'; baseMult = 1.0; }
            else { cls = 'heavy'; baseMult = 1.1; }
        } else {
            if (w < 60) { cls = 'feather'; baseMult = 0.7; }
            else if (w < 70) { cls = 'light'; baseMult = 0.8; }
            else if (w < 80) { cls = 'middle'; baseMult = 0.9; }
            else if (w < 90) { cls = 'heavy'; baseMult = 1.0; }
            else { cls = 'super'; baseMult = 1.1; }
        }

        const muscleRatio = sm / w;
        if (gender === 'male' && muscleRatio > 0.45) baseMult += 0.1;
        else if (gender === 'male' && muscleRatio < 0.35) baseMult -= 0.1;
        else if (gender === 'female' && muscleRatio > 0.40) baseMult += 0.1;
        else if (gender === 'female' && muscleRatio < 0.30) baseMult -= 0.1;

        baseMult = Math.max(0.6, Math.min(1.3, baseMult));
        return {
            class: cls, weight: w, gender,
            strengthMult: baseMult * (gender === 'female' ? 0.65 : 1.0),
            cardioMult: gender === 'female' ? 1.15 : 1.0,
            volumeMult: baseMult * (gender === 'female' ? 0.75 : 1.0)
        };
    } catch {
        return { ...NO_PROFILE };
    }
};

/* ═══ FILTERS ═══ */
const FILTERS = [
    { id: 'all', label: '全部', icon: '✦' },
    { id: 'running', label: '跑步', icon: '→' },
    { id: 'strength', label: '重訓', icon: '◆' },
    { id: 'consistency', label: '毅力', icon: '∞' },
    { id: 'milestone', label: '里程碑', icon: '○' },
];

/* ═══ 評級：對照真實族群百分位（utils/prStandards）═══
   沒有性別（重訓還要體重）→ 不評級，改顯示該補什麼，不拿假設值硬算。 */
const gradeFields = (g, kind) => (g
    ? { tier: g.tier, pct: g.pct, pctLine: pctLine(g) }
    : { tier: null, pct: null, pctLine: kind === 'lift' ? '填性別、量體重就能評級' : '填性別就能評級' });

/* ═══ HELPERS ═══ */
const fmtPace = (s) => {
    if (!s || s <= 0 || s > 7200) return '—';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}'${ss.toString().padStart(2, '0')}"`;
};

const fmtDur = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}` : `${m}:${ss.toString().padStart(2, '0')}`;
};

const tierByThresholds = (val, thresholds, mult = 1) => {
    const m = mult;
    if (val >= thresholds[0] * m) return 'diamond';
    if (val >= thresholds[1] * m) return 'platinum';
    if (val >= thresholds[2] * m) return 'gold';
    if (val >= thresholds[3] * m) return 'silver';
    return 'bronze';
};

const tierByThresholdsLower = (val, thresholds, mult = 1) => {
    const m = mult;
    if (val <= thresholds[0] * m) return 'diamond';
    if (val <= thresholds[1] * m) return 'platinum';
    if (val <= thresholds[2] * m) return 'gold';
    if (val <= thresholds[3] * m) return 'silver';
    return 'bronze';
};

/**
 * 計算單次跑步的實際總時間
 * 用途：距離賽事紀錄（5K / 10K / 半馬 / 全馬）
 * 邏輯：用 duration 直接取（如果有的話），否則用 avgPace × distance 估算
 */
const getRunFinishTime = (session, targetDistKm) => {
    const dur = Number(session.metrics?.duration) || 0;
    const dist = Number(session.metrics?.distance) || 0;
    const pace = Number(session.metrics?.avgPace) || 0;

    let t = 0;
    // 如果有完整 duration，直接用（最準確）；
    // 🩹 跑得比目標遠很多（例如 10K 拿來算 5K）時，整段時間不是 5K 成績 → 依比例換算
    if (dur > 0 && dist >= targetDistKm * 0.95) t = dist > targetDistKm * 1.05 ? dur * (targetDistKm / dist) : dur;
    // 否則用 pace × 目標距離估算
    else if (pace > 0) t = pace * targetDistKm;

    // 🔴 換算回配速不在人類合理區間（GPS 漂移、手動輸入打錯）→ 不算 PR，免得出現「5K 8 分鐘」這種永遠破不了的假紀錄
    if (t > 0 && !isPlausiblePace(t / targetDistKm)) return 0;
    return t;
};

/* ═══════════════════════════════════════════════════
   解鎖進度 — 即使紀錄還沒解鎖，也讓鎖定卡顯示「追蹤的指標 + 解鎖條件 + 目前進度」。
   讓使用者知道「我離這個紀錄還差多少」，而不是只看到冷冰冰的 LOCKED。
   ═══════════════════════════════════════════════════ */

/* ⚠️ 2026-09：這張表原本只有 8 筆，而且全是跑步。
   RECORD_DEFS 有 26 筆 —— 另外 18 筆（最大爬升、單次最多卡路里、四大項歷史最佳、
   最重單次、單次最多組數、百公斤俱樂部、體重比、連續訓練、單月最狂、週週不缺席、
   四個生涯累積…）查不到這張表，卡片就只剩一個孤零零的英文 LOCKED，
   既看不出這張卡在記什麼，也不知道差多少才會解鎖。
   而且 computeUnlockProgress 只收 cardioSessions，重訓類就算寫了規則也算不出來。
   現在 26 筆全部補齊，每一張鎖定卡都有：追蹤什麼 · 解鎖條件 · 現在到哪。 */

const longestRunKm = (sessions) => sessions.reduce((m, s) => Math.max(m, s.metrics?.distance || 0), 0);
const bestOfSets = (training, pick) => {
    let best = 0;
    Object.values(training || {}).forEach((r) => {
        (r.exercises || []).forEach((ex) => {
            const sets = Array.isArray(ex.sets) ? ex.sets : [];
            sets.forEach((set) => { best = Math.max(best, pick(set, ex) || 0); });
        });
    });
    return best;
};
const trainingDays = (sessions, training) => {
    const days = new Set();
    (sessions || []).forEach((x) => { const d = (x.date || x.created_at)?.split('T')[0]; if (d) days.add(d); });
    Object.values(training || {}).forEach((r) => { const d = (r.date || r.timestamp)?.split?.('T')?.[0]; if (d) days.add(d); });
    return days;
};
const nameMatches = (ex, keys) => {
    const n = (ex.name || '').toLowerCase();
    return keys.some((k) => n.includes(k));
};
const bestLiftFor = (training, keys) => {
    let best = 0;
    Object.values(training || {}).forEach((r) => {
        (r.exercises || []).forEach((ex) => {
            if (!nameMatches(ex, keys)) return;
            const sets = Array.isArray(ex.sets) ? ex.sets : [];
            sets.forEach((set) => { best = Math.max(best, parseFloat(set.weight) || 0); });
        });
    });
    return best;
};

/* 每一筆都要有：metric（這張卡在追什麼）· req（怎樣才會解鎖）
   · at（現在的數值）· need（門檻）· unit（單位）。 */
const UNLOCK_INFO = {
    // ── 跑步 ──
    fastest_1k:       { metric: '最快 1 公里配速',   req: '跑完一次 1 公里',       unit: '公里', need: 1,    at: (c) => longestRunKm(c) },
    fastest_5k:       { metric: '5 公里完成時間',    req: '單次跑滿 5 公里',       unit: '公里', need: 4.8,  at: (c) => longestRunKm(c) },
    fastest_10k:      { metric: '10 公里完成時間',   req: '單次跑滿 10 公里',      unit: '公里', need: 9.5,  at: (c) => longestRunKm(c) },
    half_marathon:    { metric: '半程馬拉松時間',    req: '單次跑滿 21 公里',      unit: '公里', need: 20.5, at: (c) => longestRunKm(c) },
    full_marathon:    { metric: '全程馬拉松時間',    req: '單次跑滿 42 公里',      unit: '公里', need: 41.0, at: (c) => longestRunKm(c) },
    longest_run:      { metric: '單次跑最遠',        req: '先完成一趟 1 公里以上的跑步', unit: '公里', need: 1,    at: (c) => longestRunKm(c) },
    longest_duration: { metric: '單次跑最久',        req: '單次跑滿 10 分鐘',      unit: '秒',   need: 600,  at: (c) => c.reduce((m, x) => Math.max(m, x.metrics?.duration || 0), 0), fmt: 'dur' },
    best_pace_ever:   { metric: '每公里最快幾分幾秒', req: '配速要滿 1 公里才算數',  unit: '公里', need: 1,    at: (c) => longestRunKm(c) },
    max_elevation:    { metric: '單次爬升最多',      req: '跑一趟有爬坡的路線',    unit: '公尺', need: 1,    at: (c) => c.reduce((m, x) => Math.max(m, x.metrics?.elevationGain || 0), 0) },
    most_calories_run:{ metric: '單次燃燒最多熱量',  req: '單次跑步消耗超過 50 大卡', unit: '大卡', need: 50, at: (c) => c.reduce((m, x) => Math.max(m, x.metrics?.calories || x.calories || 0), 0) },

    // ── 重訓 ──
    max_volume:       { metric: '單次訓練總重量',    req: '完成一次有記錄重量的重訓', unit: 'kg',  need: 1,  at: (c, t) => Object.values(t || {}).reduce((m, r) => Math.max(m, r.volume || 0), 0) },
    heaviest_lift:    { metric: '單組舉過最重',      req: '記錄一組有重量的動作',   unit: 'kg',  need: 1,   at: (c, t) => bestOfSets(t, (set) => parseFloat(set.weight) || 0) },
    est_squat_1rm:    { metric: '深蹲最佳成績',      req: '記錄一次深蹲',          unit: 'kg',  need: 1,   at: (c, t) => bestLiftFor(t, ['squat', '深蹲', '蹲']) },
    est_bench_1rm:    { metric: '臥推最佳成績',      req: '記錄一次臥推',          unit: 'kg',  need: 1,   at: (c, t) => bestLiftFor(t, ['bench', '臥推']) },
    est_deadlift_1rm: { metric: '硬舉最佳成績',      req: '記錄一次硬舉',          unit: 'kg',  need: 1,   at: (c, t) => bestLiftFor(t, ['deadlift', '硬舉']) },
    est_ohp_1rm:      { metric: '肩推最佳成績',      req: '記錄一次肩推',          unit: 'kg',  need: 1,   at: (c, t) => bestLiftFor(t, ['overhead', 'ohp', '肩推', 'press']) },
    most_sets:        { metric: '單次做最多組',      req: '一次重訓做滿 5 組',     unit: '組',  need: 5,   at: (c, t) => Object.values(t || {}).reduce((m, r) => Math.max(m, (r.exercises || []).reduce((n, ex) => n + (Array.isArray(ex.sets) ? ex.sets.length : (parseInt(ex.setsCount || ex.sets) || 0)), 0)), 0) },
    century_club:     { metric: '舉過 100 公斤的組數', req: '有一組舉到 100 公斤', unit: 'kg',  need: 100, at: (c, t) => bestOfSets(t, (set) => parseFloat(set.weight) || 0) },
    bw_ratio:         { metric: '最重的一舉是體重的幾倍', req: '填體重，並記錄一組有重量的動作', unit: 'kg', need: 1, at: (c, t) => bestOfSets(t, (set) => parseFloat(set.weight) || 0) },

    // ── 毅力 ──
    longest_streak:   { metric: '連續訓練最多天',    req: '連續兩天都有訓練',      unit: '天',  need: 2,   at: (c, t) => trainingDays(c, t).size },
    most_active_month:{ metric: '單月練最多次',      req: '一個月內練滿 3 次',     unit: '次',  need: 3,   at: (c, t) => (c?.length || 0) + Object.keys(t || {}).length },
    weekly_warrior:   { metric: '連續幾週沒缺席',    req: '連續兩週都有訓練',      unit: '天',  need: 2,   at: (c, t) => trainingDays(c, t).size },

    // ── 里程碑 ──
    total_sessions:   { metric: '生涯總訓練次數',    req: '完成第一次訓練',        unit: '次',  need: 1,   at: (c, t) => (c?.length || 0) + Object.keys(t || {}).length },
    total_km:         { metric: '累積跑了多少公里',  req: '累積跑滿 1 公里',       unit: '公里', need: 1,   at: (c) => c.reduce((n, x) => n + (x.metrics?.distance || 0), 0) },
    total_volume:     { metric: '生涯總舉起重量',    req: '重訓有填重量就開始累積', unit: 'kg', need: 1,  at: (c, t) => Object.values(t || {}).reduce((n, r) => n + (r.volume || 0), 0) },
    total_hours:      { metric: '生涯總訓練時數',    req: '累積訓練滿 1 小時',     unit: '秒',  need: 3600, at: (c, t) => c.reduce((n, x) => n + (x.metrics?.duration || 0), 0) + Object.keys(t || {}).length * 2700, fmt: 'dur' },
};

const fmtNum = (v, unit) => {
    if (unit === 'kg' && v >= 1000) return `${Math.round(v).toLocaleString()} kg`;
    const n = Number(v);
    return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}`;
};

// 回傳 { pct(0-100), label, metric, req } 給鎖定卡用；查不到定義才回 null
const computeUnlockProgress = (recId, sessions = [], training = {}) => {
    const info = UNLOCK_INFO[recId];
    if (!info) return null;
    const now = Number(info.at(sessions || [], training || {})) || 0;
    const need = info.need;
    const pct = need > 0 ? Math.min(100, Math.round((now / need) * 100)) : 0;
    const label = now > 0
        ? (info.fmt === 'dur'
            ? `目前 ${fmtDur(now)} / 需 ${fmtDur(need)}`
            : `目前 ${fmtNum(now, info.unit)} / 需 ${fmtNum(need, info.unit)}`)
        : info.req;
    return { pct, label, metric: `追蹤：${info.metric}`, req: info.req };
};

/* ═══════════════════════════════════════════════════
   RECORD DEFINITIONS — 完整判定邏輯
   ═══════════════════════════════════════════════════
   
   判定原則：
   1. 距離紀錄（5K/10K/半馬）→ 需要「單次跑步」距離達標
      - 5K:  單次 ≥ 4.8km（允許 GPS 誤差 4%）
      - 10K: 單次 ≥ 9.5km
      - 半馬: 單次 ≥ 20.5km（21.1km 的 97%）
      - 全馬: 單次 ≥ 41.0km（42.195km 的 97%）
   
   2. 配速紀錄 → 需要至少跑 1km 以上才算有效配速
   
   3. 重訓紀錄 → 用完成的 sets 中的實際重量計算
      - 1RM 估算用 Epley 公式: weight × (1 + reps/30)
   
   4. 毅力紀錄 → 結合跑步 sessions + 重訓 trainingRecords 的日期
   ═══════════════════════════════════════════════════ */

/**
 * 把任意來源（後端 workout history / localStorage trainingRecords）的一筆重訓紀錄
 * 正規化成 RECORD_DEFS 需要的形狀：{ volume, exercises:[{name, sets:[{weight,reps}]}], date, _key }
 * - volume 缺漏時用 sets 的 Σ(weight×reps) 補算
 * - 容忍多種欄位名（total_volume/volume、timestamp/date/completed_at）
 * 回傳 null 代表這筆沒有可用的重訓資料（例如純有氧或空紀錄），呼叫端略過。
 */
// 🔴 PR 合理性：一組重量 > 500kg、次數 > 100、或明確標記未完成的組，都不能拿來當 PR。
//    原本照單全收 —— 手滑打成 1000kg 就變成永遠破不了的「最重單次」，還會送去全站排名。
const MAX_PLAUSIBLE_KG = 500;
const MAX_PLAUSIBLE_REPS = 100;
const isPlausibleSet = (set) => {
    if (!set || typeof set !== 'object') return false;
    if (set.completed === false) return false;
    const w = parseFloat(set.weight);
    if (Number.isFinite(w) && (w < 0 || w > MAX_PLAUSIBLE_KG)) return false;
    const r = parseInt(set.reps, 10);
    if (Number.isFinite(r) && (r < 0 || r > MAX_PLAUSIBLE_REPS)) return false;
    return true;
};

// 有氧 session 正規化：舊紀錄數值可能是字串（.toFixed 會崩），配速超出人類範圍的視為無效（不參與配速 PR）
const normalizeCardioSession = (s) => {
    if (!s || typeof s !== 'object') return null;
    const m = s.metrics || {};
    const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
    const pace = n(m.avgPace);
    return {
        ...s,
        metrics: {
            ...m,
            distance: n(m.distance),
            duration: n(m.duration ?? m.duration_seconds),
            avgPace: isPlausiblePace(pace) ? pace : 0,
            calories: n(m.calories),
            elevationGain: n(m.elevationGain),
        },
    };
};

const normalizeStrengthRecord = (rec, fallbackKey = null) => {
    if (!rec || typeof rec !== 'object') return null;
    const exercises = (Array.isArray(rec.exercises) ? rec.exercises : [])
        .filter((ex) => ex && typeof ex === 'object')
        .map((ex) => (Array.isArray(ex.sets) ? { ...ex, sets: ex.sets.filter(isPlausibleSet) } : ex));
    // 純有氧 / 沒有任何動作的紀錄就跳過（避免污染重訓統計）
    const hasSets = exercises.some(ex => Array.isArray(ex?.sets) && ex.sets.length > 0);
    if (!hasSets) return null;

    // 存檔值優先、取不到才從組數回推 —— 這個順序已收進 sessionVolume。
    const volume = sessionVolume(rec);

    const rawDate = rec.date || rec.timestamp || rec.completed_at || rec.created_at || null;
    const date = rawDate ? String(rawDate) : null;
    const _key = rec.id || rec.session_id || rec.activity_id || fallbackKey || date || `rec_${Math.random().toString(36).slice(2)}`;

    return { volume: Math.round(volume), exercises, date, timestamp: date, _key };
};

const RECORD_DEFS = [
    // ────────────── RUNNING ──────────────
    {
        id: 'fastest_1k', titleZh: '1K 最速', subtitle: 'FASTEST KILOMETER',
        icon: '⚡', category: 'running', size: 'large',
        compute: (sessions, _, mods) => {
            // 至少跑 1km 以上的 session，取最快配速
            const valid = sessions.filter(s => (s.metrics?.distance || 0) >= 0.95 && (s.metrics?.avgPace || 0) > 0);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => (s.metrics.avgPace < (b.metrics?.avgPace || 9999)) ? s : b, valid[0]);
            const pace = best.metrics.avgPace;
            return {
                value: fmtPace(pace), unit: '/km',
                detail: `${(best.metrics.distance || 0).toFixed(1)}km 跑步中最快段`,
                date: best.date || best.created_at,
                ...gradeFields(gradeRun('1k', pace, mods?.gender), 'run'), byGender: runPctByGender('1k', pace)
            };
        }
    },
    {
        id: 'fastest_5k', titleZh: '5K 最速', subtitle: 'FIVE KILOMETER PR',
        icon: '🚀', category: 'running', size: 'large',
        compute: (sessions, _, mods) => {
            // 單次跑步距離 ≥ 4.8km 才納入
            const valid = sessions.filter(s => (s.metrics?.distance || 0) >= 4.8);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => {
                const tA = getRunFinishTime(s, 5);
                const tB = getRunFinishTime(b, 5);
                return (tA > 0 && (tB <= 0 || tA < tB)) ? s : b;   // 第一筆無效(0)時也要能被取代
            }, valid[0]);
            const t = getRunFinishTime(best, 5);
            if (t <= 0) return null;
            return {
                value: fmtDur(t), unit: '',
                detail: `平均配速 ${fmtPace(best.metrics?.avgPace)}`,
                date: best.date || best.created_at,
                ...gradeFields(gradeRun('5k', t, mods?.gender), 'run'), byGender: runPctByGender('5k', t)
            };
        }
    },
    {
        id: 'fastest_10k', titleZh: '10K 最速', subtitle: 'TEN KILOMETER PR',
        icon: '🏅', category: 'running', size: 'normal',
        compute: (sessions, _, mods) => {
            // 單次跑步距離 ≥ 9.5km
            const valid = sessions.filter(s => (s.metrics?.distance || 0) >= 9.5);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => {
                const tA = getRunFinishTime(s, 10);
                const tB = getRunFinishTime(b, 10);
                return (tA > 0 && (tB <= 0 || tA < tB)) ? s : b;   // 第一筆無效(0)時也要能被取代
            }, valid[0]);
            const t = getRunFinishTime(best, 10);
            if (t <= 0) return null;
            return {
                value: fmtDur(t), unit: '',
                detail: `平均配速 ${fmtPace(best.metrics?.avgPace)}`,
                date: best.date || best.created_at,
                ...gradeFields(gradeRun('10k', t, mods?.gender), 'run'), byGender: runPctByGender('10k', t)
            };
        }
    },
    {
        id: 'half_marathon', titleZh: '半馬紀錄', subtitle: 'HALF MARATHON',
        icon: '🏁', category: 'running', size: 'large',
        compute: (sessions, _, mods) => {
            // ★ 必須「單次跑步」距離 ≥ 20.5km（21.1km 的 97%），不能用多次跑步累加
            const valid = sessions.filter(s => (s.metrics?.distance || 0) >= 20.5);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => {
                const tA = getRunFinishTime(s, 21.1);
                const tB = getRunFinishTime(b, 21.1);
                return (tA > 0 && (tB <= 0 || tA < tB)) ? s : b;   // 第一筆無效(0)時也要能被取代
            }, valid[0]);
            const t = getRunFinishTime(best, 21.1);
            if (t <= 0) return null;
            return {
                value: fmtDur(t), unit: '',
                detail: `${(best.metrics?.distance || 21.1).toFixed(1)}km 完賽`,
                date: best.date || best.created_at,
                ...gradeFields(gradeRun('half', t, mods?.gender), 'run'), byGender: runPctByGender('half', t)
            };
        }
    },
    {
        id: 'full_marathon', titleZh: '全馬紀錄', subtitle: 'FULL MARATHON',
        icon: '🥇', category: 'running', size: 'large',
        compute: (sessions, _, mods) => {
            // 單次跑步距離 ≥ 41.0km
            const valid = sessions.filter(s => (s.metrics?.distance || 0) >= 41.0);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => {
                const tA = getRunFinishTime(s, 42.195);
                const tB = getRunFinishTime(b, 42.195);
                return (tA > 0 && (tB <= 0 || tA < tB)) ? s : b;   // 第一筆無效(0)時也要能被取代
            }, valid[0]);
            const t = getRunFinishTime(best, 42.195);
            if (t <= 0) return null;
            return {
                value: fmtDur(t), unit: '',
                detail: `${(best.metrics?.distance || 42.2).toFixed(1)}km 完賽`,
                date: best.date || best.created_at,
                ...gradeFields(gradeRun('full', t, mods?.gender), 'run'), byGender: runPctByGender('full', t)
            };
        }
    },
    {
        id: 'longest_run', titleZh: '最長距離', subtitle: 'LONGEST SINGLE RUN',
        icon: '📏', category: 'running', size: 'normal',
        compute: (sessions) => {
            if (!sessions.length) return null;
            const best = sessions.reduce((b, s) => (s.metrics?.distance || 0) > (b.metrics?.distance || 0) ? s : b, sessions[0]);
            const d = best.metrics?.distance || 0;
            if (d < 1) return null;
            const tier = d >= 42 ? 'diamond' : d >= 21 ? 'platinum' : d >= 10 ? 'gold' : d >= 5 ? 'silver' : 'bronze';
            return { value: d.toFixed(1), unit: 'km', detail: `用時 ${fmtDur(best.metrics?.duration)}`, date: best.date || best.created_at, tier };
        }
    },
    {
        id: 'longest_duration', titleZh: '最長時間', subtitle: 'LONGEST SESSION',
        icon: '⏱️', category: 'running', size: 'normal',
        compute: (sessions) => {
            const valid = sessions.filter(s => (s.metrics?.duration || 0) > 0);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => (s.metrics.duration > (b.metrics?.duration || 0)) ? s : b, valid[0]);
            const d = best.metrics.duration;
            if (d < 600) return null;
            const tier = d >= 7200 ? 'diamond' : d >= 5400 ? 'platinum' : d >= 3600 ? 'gold' : d >= 1800 ? 'silver' : 'bronze';
            return { value: fmtDur(d), unit: '', detail: `${(best.metrics?.distance || 0).toFixed(1)} km`, date: best.date || best.created_at, tier };
        }
    },
    {
        id: 'best_pace_ever', titleZh: '歷史最快配速', subtitle: 'ALL-TIME BEST PACE',
        icon: '💨', category: 'running', size: 'normal',
        compute: (sessions, _, mods) => {
            // 至少跑 1km 才算有效配速（避免 0.1km 跑出極速配速）
            const valid = sessions.filter(s => (s.metrics?.avgPace || 0) > 0 && (s.metrics?.distance || 0) >= 1);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => (s.metrics.avgPace < (b.metrics?.avgPace || 9999)) ? s : b, valid[0]);
            const p = best.metrics.avgPace;
            return {
                value: fmtPace(p), unit: '/km',
                detail: `${(best.metrics.distance || 0).toFixed(1)}km 跑步`,
                date: best.date || best.created_at,
                ...gradeFields(gradeRun('1k', p, mods?.gender), 'run'), byGender: runPctByGender('1k', p)
            };
        }
    },
    {
        id: 'max_elevation', titleZh: '最大爬升', subtitle: 'ELEVATION GAIN',
        icon: '⛰️', category: 'running', size: 'normal',
        compute: (sessions) => {
            const valid = sessions.filter(s => (s.metrics?.elevationGain || 0) > 0);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => (s.metrics.elevationGain > (b.metrics?.elevationGain || 0)) ? s : b, valid[0]);
            const e = best.metrics.elevationGain;
            const tier = e >= 1000 ? 'diamond' : e >= 500 ? 'platinum' : e >= 200 ? 'gold' : e >= 100 ? 'silver' : 'bronze';
            return { value: Math.round(e).toString(), unit: 'm', detail: `${(best.metrics?.distance || 0).toFixed(1)}km 路線`, date: best.date || best.created_at, tier };
        }
    },
    {
        id: 'most_calories_run', titleZh: '單次最多卡路里', subtitle: 'MAX CALORIES BURNED',
        icon: '🔥', category: 'running', size: 'normal',
        compute: (sessions) => {
            const valid = sessions.filter(s => (s.metrics?.calories || s.calories || 0) > 50);
            if (!valid.length) return null;
            const best = valid.reduce((b, s) => (s.metrics?.calories || s.calories || 0) > (b.metrics?.calories || b.calories || 0) ? s : b, valid[0]);
            const c = best.metrics?.calories || best.calories;
            const tier = c >= 1200 ? 'diamond' : c >= 800 ? 'platinum' : c >= 500 ? 'gold' : c >= 300 ? 'silver' : 'bronze';
            return { value: Math.round(c).toString(), unit: 'kcal', detail: fmtDur(best.metrics?.duration), date: best.date || best.created_at, tier };
        }
    },

    // ────────────── STRENGTH ──────────────
    {
        id: 'max_volume', titleZh: '單次最大訓練量', subtitle: 'SESSION VOLUME PR',
        icon: '👑', category: 'strength', size: 'large',
        compute: (_, training, mods) => {
            const entries = Object.entries(training);
            if (!entries.length) return null;
            let maxV = 0, maxD = '';
            entries.forEach(([d, r]) => { if ((r.volume || 0) > maxV) { maxV = r.volume; maxD = d; } });
            if (maxV === 0) return null;
            return { value: maxV.toLocaleString(), unit: 'kg', detail: '單次訓練總負荷', date: maxD, tier: tierByThresholds(maxV, [20000, 15000, 8000, 3000], mods?.volumeMult) };
        }
    },
    {
        id: 'heaviest_lift', titleZh: '最重單次', subtitle: 'HEAVIEST SINGLE LIFT',
        icon: '🏋️', category: 'strength', size: 'large',
        compute: (_, training, mods) => {
            let maxW = 0, exName = '', maxD = '';
            Object.entries(training).forEach(([d, r]) => {
                (r.exercises || []).forEach(ex => {
                    // ★ 檢查 sets 是陣列且為物件格式（有 weight 屬性）
                    const sets = Array.isArray(ex.sets) ? ex.sets : [];
                    sets.forEach(s => {
                        const w = parseFloat(s.weight) || 0;
                        if (w > maxW) { maxW = w; exName = ex.name; maxD = d; }
                    });
                });
            });
            if (maxW === 0) return null;
            return { value: maxW.toString(), unit: 'kg', detail: exName, date: maxD, tier: tierByThresholds(maxW, [180, 140, 100, 60], mods?.strengthMult) };
        }
    },
    {
        id: 'est_squat_1rm', titleZh: '深蹲最重', subtitle: 'SQUAT · BEST LIFT',
        icon: '🦵', category: 'strength', size: 'normal',
        compute: (_, training, mods) => {
            // 🩹 只顯示「實際舉起過的歷史最重」，不做 1RM 估算(避免顯示從未真的推起來的假數字)。
            let bestW = 0, bestReps = 0, maxD = '';
            Object.entries(training).forEach(([d, r]) => {
                (r.exercises || []).forEach(ex => {
                    const n = (ex.name || '').toLowerCase();
                    if (n.includes('squat') || n.includes('深蹲') || n.includes('蹲')) {
                        const sets = Array.isArray(ex.sets) ? ex.sets : [];
                        sets.forEach(s => {
                            const w = parseFloat(s.weight) || 0;
                            const reps = parseInt(s.reps) || 0;
                            if (w > 0 && reps >= 1 && w > bestW) { bestW = w; bestReps = reps; maxD = r.date || r.timestamp || d; }
                        });
                    }
                });
            });
            if (bestW === 0) return null;
            return { value: Math.round(bestW).toString(), unit: 'kg', detail: `實際最重 · ${bestReps} 下`, date: maxD, ...gradeFields(gradeLift('squat', bestW, bestReps, mods?.weight, mods?.gender), 'lift'), byGender: liftPctByGender('squat', bestW, bestReps, mods?.weight) };
        }
    },
    {
        id: 'est_bench_1rm', titleZh: '臥推最重', subtitle: 'BENCH PRESS · BEST LIFT',
        icon: '🔩', category: 'strength', size: 'normal',
        compute: (_, training, mods) => {
            let bestW = 0, bestReps = 0, maxD = '';
            Object.entries(training).forEach(([d, r]) => {
                (r.exercises || []).forEach(ex => {
                    const n = (ex.name || '').toLowerCase();
                    if (n.includes('bench') || n.includes('臥推') || n.includes('推胸')) {
                        const sets = Array.isArray(ex.sets) ? ex.sets : [];
                        sets.forEach(s => {
                            const w = parseFloat(s.weight) || 0;
                            const reps = parseInt(s.reps) || 0;
                            if (w > 0 && reps >= 1 && w > bestW) { bestW = w; bestReps = reps; maxD = r.date || r.timestamp || d; }
                        });
                    }
                });
            });
            if (bestW === 0) return null;
            return { value: Math.round(bestW).toString(), unit: 'kg', detail: `實際最重 · ${bestReps} 下`, date: maxD, ...gradeFields(gradeLift('bench', bestW, bestReps, mods?.weight, mods?.gender), 'lift'), byGender: liftPctByGender('bench', bestW, bestReps, mods?.weight) };
        }
    },
    {
        id: 'est_deadlift_1rm', titleZh: '硬舉最重', subtitle: 'DEADLIFT · BEST LIFT',
        icon: '⛓️', category: 'strength', size: 'normal',
        compute: (_, training, mods) => {
            let bestW = 0, bestReps = 0, maxD = '';
            Object.entries(training).forEach(([d, r]) => {
                (r.exercises || []).forEach(ex => {
                    const n = (ex.name || '').toLowerCase();
                    if (n.includes('deadlift') || n.includes('硬舉') || n.includes('硬举')) {
                        const sets = Array.isArray(ex.sets) ? ex.sets : [];
                        sets.forEach(s => {
                            const w = parseFloat(s.weight) || 0;
                            const reps = parseInt(s.reps) || 0;
                            if (w > 0 && reps >= 1 && w > bestW) { bestW = w; bestReps = reps; maxD = r.date || r.timestamp || d; }
                        });
                    }
                });
            });
            if (bestW === 0) return null;
            return { value: Math.round(bestW).toString(), unit: 'kg', detail: `實際最重 · ${bestReps} 下`, date: maxD, ...gradeFields(gradeLift('deadlift', bestW, bestReps, mods?.weight, mods?.gender), 'lift'), byGender: liftPctByGender('deadlift', bestW, bestReps, mods?.weight) };
        }
    },
    {
        id: 'est_ohp_1rm', titleZh: '肩推最重', subtitle: 'OVERHEAD PRESS · BEST LIFT',
        icon: '🔱', category: 'strength', size: 'normal',
        compute: (_, training, mods) => {
            let bestW = 0, bestReps = 0, maxD = '';
            Object.entries(training).forEach(([d, r]) => {
                (r.exercises || []).forEach(ex => {
                    const n = (ex.name || '').toLowerCase();
                    if (n.includes('overhead') || n.includes('shoulder press') || n.includes('ohp') || n.includes('肩推') || n.includes('推舉') || n.includes('military')) {
                        const sets = Array.isArray(ex.sets) ? ex.sets : [];
                        sets.forEach(s => {
                            const w = parseFloat(s.weight) || 0;
                            const reps = parseInt(s.reps) || 0;
                            if (w > 0 && reps >= 1 && w > bestW) { bestW = w; bestReps = reps; maxD = r.date || r.timestamp || d; }
                        });
                    }
                });
            });
            if (bestW === 0) return null;
            return { value: Math.round(bestW).toString(), unit: 'kg', detail: `實際最重 · ${bestReps} 下`, date: maxD, ...gradeFields(gradeLift('ohp', bestW, bestReps, mods?.weight, mods?.gender), 'lift'), byGender: liftPctByGender('ohp', bestW, bestReps, mods?.weight) };
        }
    },
    {
        id: 'most_sets', titleZh: '單次最多組數', subtitle: 'MOST SETS IN SESSION',
        icon: '🔁', category: 'strength', size: 'normal',
        compute: (_, training) => {
            let maxSets = 0, maxD = '';
            Object.entries(training).forEach(([d, r]) => {
                let total = 0;
                (r.exercises || []).forEach(ex => {
                    total += Array.isArray(ex.sets) ? ex.sets.length : (parseInt(ex.setsCount || ex.sets) || 0);
                });
                if (total > maxSets) { maxSets = total; maxD = d; }
            });
            if (maxSets < 5) return null;
            const tier = maxSets >= 30 ? 'diamond' : maxSets >= 24 ? 'platinum' : maxSets >= 18 ? 'gold' : maxSets >= 12 ? 'silver' : 'bronze';
            return { value: maxSets.toString(), unit: '組', detail: '單次訓練', date: maxD, tier };
        }
    },
    {
        id: 'century_club', titleZh: '百公斤俱樂部', subtitle: '100KG CLUB',
        icon: '💯', category: 'strength', size: 'normal',
        compute: (_, training) => {
            let count = 0;
            Object.values(training).forEach(r => {
                (r.exercises || []).forEach(ex => {
                    const sets = Array.isArray(ex.sets) ? ex.sets : [];
                    sets.forEach(s => { if ((parseFloat(s.weight) || 0) >= 100) count++; });
                });
            });
            if (count === 0) return null;
            const tier = count >= 100 ? 'diamond' : count >= 50 ? 'platinum' : count >= 20 ? 'gold' : count >= 5 ? 'silver' : 'bronze';
            return { value: count.toString(), unit: '組', detail: '≥100kg 的組數', date: null, tier };
        }
    },
    {
        id: 'bw_ratio', titleZh: '體重比最強舉', subtitle: 'STRENGTH TO BODYWEIGHT',
        icon: '⚖️', category: 'strength', size: 'normal',
        compute: (_, training, mods) => {
            if (!mods?.weight) return null;
            let maxW = 0, exName = '';
            Object.values(training).forEach(r => {
                (r.exercises || []).forEach(ex => {
                    const sets = Array.isArray(ex.sets) ? ex.sets : [];
                    sets.forEach(s => { const w = parseFloat(s.weight) || 0; if (w > maxW) { maxW = w; exName = ex.name; } });
                });
            });
            if (maxW === 0) return null;
            const ratio = +(maxW / mods.weight).toFixed(2);
            const tier = ratio >= 2.5 ? 'diamond' : ratio >= 2.0 ? 'platinum' : ratio >= 1.5 ? 'gold' : ratio >= 1.0 ? 'silver' : 'bronze';
            return { value: ratio.toString(), unit: '倍體重', detail: `${maxW}kg / ${mods.weight}kg — ${exName}`, date: null, tier };
        }
    },

    // ────────────── CONSISTENCY ──────────────
    {
        id: 'longest_streak', titleZh: '最長連續訓練', subtitle: 'TRAINING STREAK',
        icon: '🔥', category: 'consistency', size: 'large',
        compute: (sessions, training) => {
            const dateSet = new Set();
            sessions.forEach(s => { const d = (s.date || s.created_at)?.split('T')[0]; if (d) dateSet.add(d); });
            Object.values(training).forEach(r => {
                const d = (r.date || r.timestamp)?.split?.('T')?.[0];
                if (d) dateSet.add(d);
            });
            if (dateSet.size === 0) return null;
            const sorted = Array.from(dateSet).map(d => new Date(d).setHours(0, 0, 0, 0)).filter(Boolean).sort((a, b) => a - b);
            let maxS = 0, cur = 0, prev = null;
            sorted.forEach(d => {
                if (!prev) cur = 1;
                else { const diff = Math.round((d - prev) / 86400000); cur = diff === 1 ? cur + 1 : 1; }
                if (cur > maxS) maxS = cur;
                prev = d;
            });
            if (maxS < 2) return null;
            // 連續訓練天數（含休息日很難維持，門檻不宜過高）：
            // 銅3 / 銀7(一週) / 金14(兩週) / 白金30(一個月) / 鑽石45
            const tier = maxS >= 45 ? 'diamond' : maxS >= 30 ? 'platinum' : maxS >= 14 ? 'gold' : maxS >= 7 ? 'silver' : 'bronze';
            return { value: maxS.toString(), unit: '天', detail: '連續不間斷', date: null, tier };
        }
    },
    {
        id: 'most_active_month', titleZh: '單月最狂', subtitle: 'BUSIEST MONTH',
        icon: '📅', category: 'consistency', size: 'normal',
        compute: (sessions, training) => {
            const mm = {};
            const add = (d) => { if (!d || typeof d !== 'string') return; const m = d.substring(0, 7); if (m.length === 7 && m.includes('-')) mm[m] = (mm[m] || 0) + 1; };
            sessions.forEach(s => add(s.date || s.created_at));
            Object.values(training).forEach(r => add(r.date || r.timestamp));
            const entries = Object.entries(mm);
            if (!entries.length) return null;
            const [bm, c] = entries.reduce((b, e) => e[1] > b[1] ? e : b, entries[0]);
            if (c < 3) return null;
            // 單月訓練次數：銅<8 / 銀8(每週2) / 金12(每週3) / 白金18 / 鑽石25(幾乎每日)
            const tier = c >= 25 ? 'diamond' : c >= 18 ? 'platinum' : c >= 12 ? 'gold' : c >= 8 ? 'silver' : 'bronze';
            return { value: c.toString(), unit: '次', detail: bm.replace('-', '年') + '月', date: null, tier };
        }
    },
    {
        id: 'weekly_warrior', titleZh: '週週不缺席', subtitle: 'WEEKLY CONSISTENCY',
        icon: '🛡️', category: 'consistency', size: 'normal',
        compute: (sessions, training) => {
            const weekSet = new Set();
            const addWeek = (d) => {
                if (!d) return;
                const dt = new Date(d);
                if (isNaN(dt.getTime())) return;
                const start = new Date(dt);
                start.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));   // 週一為始，與課表／統計一致
                weekSet.add(toLocalDateKey(start));
            };
            sessions.forEach(s => addWeek(s.date || s.created_at));
            Object.values(training).forEach(r => addWeek(r.date || r.timestamp));
            const sorted = Array.from(weekSet).sort();
            let maxW = 0, cur = 0, prev = null;
            sorted.forEach(ws => {
                const d = new Date(ws).getTime();
                if (!prev) cur = 1;
                else { const diff = Math.round((d - prev) / (7 * 86400000)); cur = diff === 1 ? cur + 1 : 1; }
                if (cur > maxW) maxW = cur;
                prev = d;
            });
            if (maxW < 2) return null;
            // 連續每週有練：銀4(一個月) / 金8 / 白金16 / 鑽石24(半年)
            const tier = maxW >= 24 ? 'diamond' : maxW >= 16 ? 'platinum' : maxW >= 8 ? 'gold' : maxW >= 4 ? 'silver' : 'bronze';
            return { value: maxW.toString(), unit: '週', detail: '連續每週訓練', date: null, tier };
        }
    },

    // ────────────── MILESTONES ──────────────
    {
        id: 'total_sessions', titleZh: '生涯訓練次數', subtitle: 'LIFETIME SESSIONS',
        icon: '🗓️', category: 'milestone', size: 'normal',
        compute: (sessions, training) => {
            const t = sessions.length + Object.keys(training).length;
            if (t === 0) return null;
            // 生涯總訓練次數：銅<25 / 銀25 / 金75 / 白金150 / 鑽石300
            const tier = t >= 300 ? 'diamond' : t >= 150 ? 'platinum' : t >= 75 ? 'gold' : t >= 25 ? 'silver' : 'bronze';
            return { value: t.toString(), unit: '次', detail: `跑步 ${sessions.length} + 重訓 ${Object.keys(training).length}`, date: null, tier };
        }
    },
    {
        id: 'total_km', titleZh: '生涯總里程', subtitle: 'TOTAL DISTANCE',
        icon: '🌍', category: 'milestone', size: 'large',
        compute: (sessions) => {
            const t = sessions.reduce((s, r) => s + (r.metrics?.distance || 0), 0);
            if (t < 1) return null;
            const tier = t >= 1000 ? 'diamond' : t >= 500 ? 'platinum' : t >= 200 ? 'gold' : t >= 100 ? 'silver' : 'bronze';
            const milestones = t >= 42.195 ? '超越全馬距離' : `離全馬差 ${(42.195 - t).toFixed(1)}km`;
            return { value: t.toFixed(0), unit: 'km', detail: milestones, date: null, tier };
        }
    },
    {
        id: 'total_volume', titleZh: '生涯總重量', subtitle: 'LIFETIME VOLUME',
        icon: '🏗️', category: 'milestone', size: 'normal',
        compute: (_, training, mods) => {
            const t = Object.values(training).reduce((s, r) => s + (r.volume || 0), 0);
            if (t === 0) return null;
            const tier = tierByThresholds(t, [2000000, 1000000, 500000, 100000], mods?.volumeMult);
            return { value: (t / 1000).toFixed(0), unit: 'k kg', detail: `≈ ${Math.round(t / 1500)} 台小客車`, date: null, tier };
        }
    },
    {
        id: 'total_hours', titleZh: '生涯總時數', subtitle: 'LIFETIME HOURS',
        icon: '⏳', category: 'milestone', size: 'normal',
        compute: (sessions, training) => {
            let totalSec = sessions.reduce((s, r) => s + (r.metrics?.duration || 0), 0);
            totalSec += Object.keys(training).length * 2700; // ~45min per strength session
            if (totalSec < 3600) return null;
            const h = +(totalSec / 3600).toFixed(0);
            // 生涯總時數：銀25 / 金75 / 白金150 / 鑽石300（與「次數」門檻對齊，約每次1小時）
            const tier = h >= 300 ? 'diamond' : h >= 150 ? 'platinum' : h >= 75 ? 'gold' : h >= 25 ? 'silver' : 'bronze';
            return { value: h.toString(), unit: '小時', detail: '累計投入時間', date: null, tier };
        }
    },
];

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
const PowerPRTrackerMobile = ({ userId: propsUserId, embedded = false }) => {
    const userId = propsUserId || getUserId();
    const [cardioSessions, setCardioSessions] = useState([]);
    const [trainingRecords, setTrainingRecords] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const [rankFor, setRankFor] = useState(null); // 點卡片 → 這一項在 DRVN 排第幾

    const profileMods = useMemo(() => getProfileModifiers(userId), [userId]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);

            // 1) 有氧 sessions — 真實後端
            try {
                const res = await apiClient.get(`/api/cardio/sessions/${userId}?limit=1000`);
                if (!cancelled) setCardioSessions((res.data?.sessions || []).map(normalizeCardioSession).filter(Boolean));
            } catch { }

            // 2) 重訓紀錄 — 合併「後端 workout history」+「localStorage」，
            //    後端為主要真實來源（換裝置/清快取也不會消失），localStorage 補充離線新增的。
            let merged = {};
            try {
                const res = await apiClient.get(`/api/workout/history/${userId}?limit=1000`);
                const serverList = res?.data?.history || res?.data?.sessions || [];
                serverList.forEach(rec => {
                    const norm = normalizeStrengthRecord(rec);
                    if (norm) merged[norm._key] = norm;
                });
            } catch { }
            try {
                const localRaw = JSON.parse(localStorage.getItem('trainingRecords') || '{}');
                Object.entries(localRaw).forEach(([k, rec]) => {
                    const norm = normalizeStrengthRecord(rec, k);
                    if (norm) merged[norm._key] = norm; // 同 key 以 localStorage（較新）覆蓋
                });
            } catch { }
            if (!cancelled) setTrainingRecords(merged);

            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [userId]);

    const records = useMemo(() =>
        RECORD_DEFS.map(def => {
            const result = def.compute(cardioSessions, trainingRecords, profileMods);
            // 🟢 鎖定中的跑步紀錄 → 附上解鎖進度，讓卡片不再只是冷冰冰的 LOCKED
            // ⚠️ 原本只傳 cardioSessions，重訓／毅力／里程碑類永遠算不出進度
            const progress = result ? null : computeUnlockProgress(def.id, cardioSessions, trainingRecords);
            return { ...def, result, progress };
        }),
        [cardioSessions, trainingRecords, profileMods]
    );

    // 打開 PR 頁就把自己的最佳值送上去（不等回應）—— 大家都送，名次才算得準
    useEffect(() => { if (!loading) submitPRRanks(records).catch(() => {}); }, [loading, records]);

    const filtered = useMemo(() => {
        const list = activeFilter === 'all' ? records : records.filter(r => r.category === activeFilter);
        return [...list].sort((a, b) => {
            const aH = a.result ? 1 : 0, bH = b.result ? 1 : 0;
            if (aH !== bH) return bH - aH;
            if (a.result && b.result) return (TIERS[b.result.tier]?.rank || 0) - (TIERS[a.result.tier]?.rank || 0);
            return 0;
        });
    }, [records, activeFilter]);

    const stats = useMemo(() => ({ unlocked: records.filter(r => r.result).length, total: records.length }), [records]);

    // Category background images
    const categoryImages = {
        running: '/download/Studio _ Jean Yves Lemoigne Photographer _ Director.jpeg',
        strength: '/download/crossfit.jpeg',
        consistency: '/download/_ (1).jpeg',
        milestone: '/download/Trophy.jpeg',
    };

    return (
        <div style={{
            minHeight: embedded ? 'auto' : '100dvh',
            background: embedded ? 'transparent' : C.mist,
            maxWidth: embedded ? '100%' : '430px',
            margin: '0 auto',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            paddingBottom: embedded ? 0 : '120px',
            position: 'relative',
        }}>

            {/* ── GLOBAL AMBIENT GLOW (Hero Area) ── */}
            {!embedded && <div aria-hidden className="pr-ambient" />}

            {/* ── HEADER ── */}
            {!embedded && (
                <div data-onboard="pr-overview" style={{ padding: '60px 24px 20px', position: 'relative', zIndex: 1 }}>
                    {/* Counter + 總進度條（即使 0 解鎖也讓頁面有生命力） */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{
                            fontSize: '14px', fontWeight: 600, color: '#161415',
                            letterSpacing: '-0.01em', marginBottom: '8px',
                            display: 'flex', alignItems: 'baseline', gap: '6px',
                        }}>
                            <span>{stats.unlocked} / {stats.total}</span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(22,20,21,0.40)' }}>
                                已解鎖紀錄
                            </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.10)', overflow: 'hidden', maxWidth: 240 }}>
                            <div style={{
                                width: `${stats.total ? Math.round((stats.unlocked / stats.total) * 100) : 0}%`,
                                height: '100%', borderRadius: 99, background: '#F95C4B',
                                transition: 'width 0.7s ease',
                            }} />
                        </div>
                    </div>

                    <h1 style={{
                        fontSize: '44px', fontWeight: 700, color: '#161415',
                        lineHeight: 1, letterSpacing: '-0.03em', marginBottom: '12px',
                    }}>
                        個人紀錄
                    </h1>

                    {/* 評級怎麼來的：一行講清楚（對照真實族群百分位，不是自訂門檻） */}
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(22,20,21,0.45)' }}>
                        {profileMods.gender
                            ? `等級對照真實跑者與訓練者的百分位${profileMods.weight ? ` · ${profileMods.weight} kg` : ''}`
                            : '填性別後，等級會對照真實族群百分位'}
                    </div>
                </div>
            )}

            {/* ── FILTERS ── */}
            {!embedded && (
                <div style={{
                    display: 'flex', gap: '20px', padding: '0 24px 16px',
                    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                    borderBottom: `1px solid ${C.pebble}`, margin: '0 24px 24px'
                }}>
                    {FILTERS.map(f => (
                        <motion.button {...pressProps('row')} key={f.id} onClick={() => setActiveFilter(f.id)} style={{
 padding: '0 0 8px 0', border: 'none', background: 'none',
 color: activeFilter === f.id ? '#161415' : 'rgba(22,20,21,0.40)',
 fontSize: '16px', fontWeight: activeFilter === f.id ? 500 : 400,
 letterSpacing: '-0.01em',
 whiteSpace: 'nowrap', cursor: 'pointer',
 position: 'relative'
 }}>
                            {f.label}
                            {activeFilter === f.id && (
                                <motion.div layoutId="prFilterIndicator" style={{
                                    position: 'absolute', bottom: -1, left: 0, right: 0,
                                    height: '2px', background: '#161415'
                                }} />
                            )}
                        </motion.button>
                    ))}
                </div>
            )}

            {/* ── CARD GRID ── */}
            <div style={{ padding: embedded ? '16px' : '0 20px' }}>
                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} style={{
                                height: i < 2 ? '280px' : '220px',
                                borderRadius: '24px', background: '#151518',
                                animation: 'pulse 1.5s infinite',
                                gridColumn: i === 0 ? 'span 2' : 'span 1',
                            }} />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '48px 20px' }}>
                        <EmptyState
                            tone="light"
                            icon={Trophy}
                            title="還沒有個人紀錄"
                            description="完成訓練並記錄重量後，你的 PR 會在這裡逐一解鎖。"
                            actionLabel="前往訓練"
                            onAction={() => { window.location.hash = '#/training-session-mobile'; }}
                        />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <AnimatePresence mode="popLayout">
                            {filtered.map((rec, idx) => (
                                <EditorialCard
                                    key={rec.id}
                                    record={rec}
                                    index={idx}
                                    bgImage={categoryImages[rec.category]}
                                    onOpen={rec.result ? () => setRankFor(rec) : undefined}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            <PRRankSheet record={rankFor} records={records} onClose={() => setRankFor(null)} />

            {!embedded && <MobileNavigation />}

            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.15; } }
            `}</style>
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   SWISS CARD — Minimalist editorial design
   ═══════════════════════════════════════════════════ */
const EditorialCard = ({ record, index, bgImage, onOpen }) => {
    const reduceMotion = useReducedMotion();
    const { result, icon, titleZh, subtitle, size, progress } = record;
    const has = !!result;
    const tier = result?.tier || 'none';
    const tierData = TIERS[tier];
    const isLarge = size === 'large' && has;

    const getMaterialStyle = (tierLevel) => {
        switch (tierLevel) {
            case 'diamond': // Hall of Fame - 純珊瑚紅實心（依需求，乾淨高對比、無漸層橘）
                return {
                    background: '#254B63',
                    textShadow: 'none',
                };
            case 'platinum': // Bright White/Silver Titanium（加深供淺卡可讀）
                return {
                    background: 'linear-gradient(135deg, #9E97B8 0%, #6E6790 45%, #423D63 100%)',
                    textShadow: '0px 1px 2px rgba(40,36,60,0.30)',
                };
            case 'gold': // Warm Gold（加深供淺卡可讀）
                return {
                    background: 'linear-gradient(135deg, #D9B25A 0%, #B8893A 45%, #7E6128 100%)',
                    textShadow: '0px 1px 2px rgba(80,60,20,0.30)',
                };
            case 'silver': // Cool Silver（加深供淺卡可讀）
                return {
                    background: 'linear-gradient(135deg, #8C8C95 0%, #66666E 45%, #3E3E46 100%)',
                    textShadow: '0px 1px 2px rgba(40,40,48,0.30)',
                };
            case 'bronze': // Warm Copper/Bronze（加深供淺卡可讀）
                return {
                    background: 'linear-gradient(135deg, #C88E63 0%, #A56B41 45%, #6E5230 100%)',
                    textShadow: '0px 1px 2px rgba(70,50,30,0.30)',
                };
            default: // Dark Titanium
                return {
                    background: 'linear-gradient(135deg, #4A4644 0%, #161415 35%, #2A2726 70%, #161415 100%)',
                    textShadow: '0px 1px 1px rgba(255,255,255,0.5)',
                };
        }
    };

    const materialStyle = getMaterialStyle(tier);

    return (
        <motion.div
            className={`pr-card ${has && tier !== 'none' ? `pr-tier pr-tier--${tier}` : ''}`}
            onClick={onOpen}
            role={onOpen ? 'button' : undefined}
            aria-label={onOpen ? `${titleZh}：看你在 DRVN 排第幾` : undefined}
            whileTap={onOpen && !reduceMotion ? { scale: 0.985 } : undefined}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{
                gridColumn: isLarge ? 'span 2' : 'span 1',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(246,244,241,0.82))',
                borderRadius: '20px',
                /* 有等級的卡：邊框與光暈交給 PRTierGlow.css（每一階不同） */
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: 'inset 0 1px 0 #fff, 0 6px 20px -12px rgba(22,20,21,0.18)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                cursor: onOpen ? 'pointer' : 'default',
                position: 'relative', // for absolute children
            }}
        >
            {/* 等級光暈：白銀以上有掃光，鑽石再加閃點 */}
            {has && ['silver', 'gold', 'platinum', 'diamond'].includes(tier) && <span className="pr-sheen" aria-hidden />}
            {has && tier === 'diamond' && [
                { top: '10%', left: '82%', delay: '0s' },
                { top: '46%', left: '8%', delay: '0.9s' },
                { top: '78%', left: '70%', delay: '1.7s' },
            ].map((p, i) => (
                <span key={i} className="pr-sparkle" aria-hidden style={{ top: p.top, left: p.left, animationDelay: p.delay }} />
            ))}

            {/* Image Header */}
            {has && bgImage && (
                <div style={{
                    width: '100%',
                    height: isLarge ? '200px' : '140px',
                    backgroundImage: `url('${bgImage}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'contrast(1.05) saturate(1.1)', // Enhance natural colors slightly
                    position: 'relative',
                    zIndex: 1
                }} />
            )}

            {!has && (
                <div style={{
                    padding: '20px', display: 'flex', flexDirection: 'column',
                    gap: '8px', position: 'relative', zIndex: 1
                }}>
                    <span style={{ fontSize: '24px', opacity: 0.35 }}>{icon}</span>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#161415', letterSpacing: '-0.01em' }}>{titleZh}</div>
                    {/* 追蹤的指標（讓使用者知道這張卡在記錄什麼） */}
                    {progress?.metric && (
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(22,20,21,0.45)' }}>
                            {progress.metric}
                        </div>
                    )}
                    {/* 解鎖進度條（有進度資料時） */}
                    {progress ? (
                        <div style={{ marginTop: '6px' }}>
                            <div style={{ height: 5, borderRadius: 99, background: 'rgba(22,20,21,0.08)', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${progress.pct}%`, height: '100%', borderRadius: 99,
                                    background: progress.pct >= 100 ? '#F95C4B' : '#161415',
                                    transition: 'width 0.6s ease',
                                }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(22,20,21,0.42)' }}>
                                    {progress.pct >= 100 ? '快解鎖了' : '還沒解鎖'}
                                </span>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(22,20,21,0.55)' }} className="tabular-nums">
                                    {progress.pct}%
                                </span>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(22,20,21,0.42)', marginTop: '5px', lineHeight: 1.5 }}>
                                {progress.label}
                            </div>
                        </div>
                    ) : (
                        /* 這是「連解鎖條件都查不到」的最後防線，跟上面進度條的
                           「還沒解鎖」不是同一件事，文案要分得開（R7）。
                           ⚠️ 這裡不能用 {/* *​/} 的 JSX 註解 —— 三元運算子的分支裡
                              它會被當成物件字面值，執行期直接 ReferenceError。
                              vite build 與 eslint 都看不出來，只有 verify:jsx 抓得到。 */
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(22,20,21,0.4)' }}>條件待補</div>
                    )}
                </div>
            )}

            {has && (
                <div style={{ padding: '20px', position: 'relative', zIndex: 2 }}>
                    {/* ⚠️ 這裡原本印英文 subtitle（FASTEST KILOMETER／SQUAT · BEST LIFT…）。
                        鎖定的卡講中文「追蹤：深蹲最佳成績」、解鎖之後卻變成英文，
                        同一張卡前後兩套語言。兩邊共用 UNLOCK_INFO 的同一句。 */}
                    <div style={{
                        fontSize: '12px', fontWeight: 600,
                        color: (tier === 'diamond') ? '#78384A' : 'rgba(22,20,21,0.62)',
                        marginBottom: '8px'
                    }}>
                        {tier !== 'none' ? `${tierData.label} · ` : ''}{UNLOCK_INFO[record.id]?.metric || titleZh}
                    </div>
                    {/* 對照真實族群：贏過約幾 % ；沒性別／體重 → 說要補什麼 */}
                    {result.pctLine && (
                        <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '-4px', marginBottom: '8px',
                            color: result.pct != null ? '#356757' : 'rgba(22,20,21,0.55)' }}>
                            {result.pctLine}
                        </div>
                    )}

                    <div style={{
                        display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px',
                    }}>
                        <span style={{
                            fontSize: isLarge ? '62px' : '38px',
                            fontWeight: 500,
                            background: materialStyle.background,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            lineHeight: 0.9, letterSpacing: '-0.04em',
                            textShadow: materialStyle.textShadow,
                            // diamond 改純珊瑚實心、無發光；platinum 保留一道極淡緊緻陰影
                            filter: tier === 'platinum' ? 'drop-shadow(0px 1px 2px rgba(120,116,140,0.35))' : 'none'
                        }}>
                            {result.value}
                        </span>
                        {result.unit && (
                            <span style={{
                                fontSize: '14px', fontWeight: 500, color: 'rgba(22,20,21,0.62)',
                                letterSpacing: '-0.01em'
                            }}>
                                {result.unit}
                            </span>
                        )}
                    </div>

                    <svg aria-hidden="true" width="94" height="12" viewBox="0 0 94 12" style={{ display: 'block', margin: '0 0 10px', color: '#B7684C' }}>
                        <path d="M3 8 Q35 2 90 5 M8 10 Q37 7 68 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                    <div style={{
                        fontSize: isLarge ? '20px' : '16px',
                        fontWeight: 500, color: '#161415',
                        letterSpacing: '-0.02em', lineHeight: 1.2
                    }}>
                        {titleZh}
                    </div>

                    {result.detail && (
                        <div style={{
                            fontSize: '12px', fontWeight: 400, color: 'rgba(22,20,21,0.62)',
                            marginTop: '6px', letterSpacing: '0'
                        }}>
                            {result.detail}
                        </div>
                    )}

                    {result.date && !isNaN(new Date(result.date).getTime()) && (
                        <div style={{
                            fontSize: '11px', fontWeight: 600, color: 'rgba(22,20,21,0.40)',
                            marginTop: '12px', letterSpacing: '0.02em'
                        }}>
                            {new Date(result.date).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

export default PowerPRTrackerMobile;
