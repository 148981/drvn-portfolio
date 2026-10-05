import './PersonalityViewMobile.css';
import React, { useState, useEffect, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { readJSON } from '../utils/safeStorage';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, ArrowUpRight, Plus, Activity, Zap, Heart, Users, Target, TrendingUp, Apple } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { getSocialPosts } from '../utils/socialPostsStore';
import { T } from '../utils/theme';
import { detectAllPersonas } from '../utils/personaDetector';
import { recordDetectedPersonas } from '../utils/detectedPersonas';
import { PERSONA_BY_ID } from '../utils/personaCatalog';
import { recordFirst } from '../utils/momentEngine';
import { toLocalDateKey } from '../utils/localDate';

// ─── Palette ──────────────────────────────────────────────────────────
const P = {
  paper: T.PAPER,
  black: T.BLACK,
  stone: T.STONE,
  pebble: T.PEBBLE,
  coral: T.CORAL,
  ember: T.EMBER,
};

// ─── 6 Personality Types ──────────────────────────────────────────────
const TYPES = {
    ARCHITECT: {
        code: 'EDPC', title: 'Architect', subtitle: 'Precision Engineer',
        category: 'Precision', tag: 'Data-Driven',
        tagline: '在數據的迷霧中，你看見了精確的輪廓。',
        cardColor: '#161415', textColor: '#F6F4F1',
        traits: ['Analytical', 'Consistent', 'Methodical'],
        analysis: '你的訓練曲線幾乎是完美的數學方程式。配速飄移率極低，顯示神經肌肉連結極為穩定，負荷進展符合週期化原則。你不相信「感覺」，你相信數據——這是你最強的武器，也是你最美的限制。Zone 2 與 Zone 4 的精準切換，讓你每一堂訓練都具備科學參考價值，實驗室裡最受歡迎的受試者，非你莫屬。',
        blueprint: ['區間訓練週期化', 'VO₂max 每月測試', '配速偏差追蹤', '心率漂移監控'],
        compatible: ['GRINDER', 'ZEN'],
    },
    WARRIOR: {
        code: 'PDIF', title: 'Warrior', subtitle: 'Peak Output Seeker',
        category: 'Intensity', tag: 'Anaerobic King',
        tagline: '在乳酸堆積的邊緣，你才感受到真正的存在。',
        cardColor: '#D94030', textColor: '#F6F4F1',
        traits: ['Explosive', 'Competitive', 'Relentless'],
        analysis: 'Zone 4–5 是你的主場。你的高強度代謝能力遠超平均值，但這也意味著疲勞累積速度極快。建議每三個高強度週後安排一週積極恢復，讓身體完成真正的超補償。你的健身 RPE 數據顯示你在負重訓練時同樣保持高輸出強度，這種全域強度偏好是你最鋒利的雙面刃。',
        blueprint: ['衝刺間歇訓練', '乳酸閾值測試', '後鏈力量強化', '週期性降負荷'],
        compatible: ['ARCHITECT', 'CATALYST'],
    },
    ZEN: {
        code: 'EFIS', title: 'Zen Runner', subtitle: 'Breath Synchronizer',
        category: 'Mindful', tag: 'Zone 2 Master',
        tagline: '每一步都是呼吸，每一次心跳都是迴歸。',
        cardColor: '#3D6B4F', textColor: '#F6F4F1',
        traits: ['Meditative', 'Sustainable', 'Intuitive'],
        analysis: '你達到了「心肺合一」的境界。Zone 2 佔比極高，心率變異性（HRV）優異，自主神經系統健康度排名前列。你的跑步不是為了征服秒錶，而是探索那個可以永遠持續的節奏——這是被科學反覆驗證的長壽智慧。你的恢復能力極強，幾乎不受過度訓練的威脅，但低強度積累需要配合月度爆發訓練才能持續突破。',
        blueprint: ['有氧底層建構', 'MAF 心率訓練法', '正念跑步練習', '月度節奏跑'],
        compatible: ['GRINDER', 'EXPLORER'],
    },
    GRINDER: {
        code: 'EDPS', title: 'Grinder', subtitle: 'Iron Discipline',
        category: 'Discipline', tag: 'Unstoppable',
        tagline: '無視風雨，用規律的步伐在時光的畫布上刻下足跡。',
        cardColor: '#2C3E50', textColor: '#F6F4F1',
        traits: ['Disciplined', 'Resilient', 'Systematic'],
        analysis: '你是所有類型中最具可預測性的高績效者。跑步、健身、飲食的跨系統一致性指標全部位於前段班，這種多域紀律是極少數人能同時維持的壯舉。這種能力不依賴動力（motivation），而是依賴系統（system）——長期來看，你的體能底蘊將超越所有依賴靈感的跑者。唯一的警告：適時打破慣例，因為身體也需要驚喜刺激。',
        blueprint: ['週跑量漸增計劃', '6 週訓練週期制', '交叉訓練日', '強制修復日制度'],
        compatible: ['ARCHITECT', 'ZEN'],
    },
    EXPLORER: {
        code: 'EFPC', title: 'Explorer', subtitle: 'Trail Blazer',
        category: 'Versatile', tag: 'Multi-Modal',
        tagline: '每條路都是新的故事，每次跑步都是新的自己。',
        cardColor: '#6B4FA3', textColor: '#F6F4F1',
        traits: ['Curious', 'Versatile', 'Adventurous'],
        analysis: '你的訓練歷程像一本精彩的冒險小說——每週都有新嘗試，路線多樣，強度起伏，卻總能讓身體保持驚喜。這種多元性帶來了極佳的全身適應性，你不容易受傷，因為你從不讓身體習慣同一個模式。你的社群參與數據顯示你從他人身上汲取能量，是天然的跑步大使。對你這型的人，「新路線、新距離、新玩法」本身就是最好的續航燃料。',
        blueprint: ['越野跑月度挑戰', '多元運動交叉訓練', '跑步社群活動', '不同距離混合訓練'],
        compatible: ['CATALYST', 'ZEN'],
    },
    CATALYST: {
        code: 'PFIC', title: 'Catalyst', subtitle: 'Community Engine',
        category: 'Social', tag: 'Energy Source',
        tagline: '你不只是在跑步，你在點燃整個社群的火焰。',
        cardColor: '#B85C00', textColor: '#F6F4F1',
        traits: ['Energizing', 'Inspiring', 'Communal'],
        analysis: '你的訓練數據顯示一個獨特現象：社群互動頻率與訓練一致性呈正相關。你的能量來自人與人的連結，掌聲數量與貼文頻率顯示你在社群中具有強大的共鳴能力。在長期觀察中，你周圍的人訓練一致性會提升——這說明你是天然的訓練催化劑。建議你建立自己的訓練小組，因為幫助他人的同時也在幫助自己突破上限。',
        blueprint: ['搭檔訓練計劃', '社群打卡挑戰', '訓練直播分享', '組建跑步小組'],
        compatible: ['EXPLORER', 'WARRIOR'],
    },
};

// ─── DNA Matrix: 16 unique combinations ───────────────────────────────
//  Each 4-letter code is fully deterministic:
//  Axis 1: E=Endurance  / P=Power
//  Axis 2: D=Discipline / F=Flow
//  Axis 3: P=Precision  / I=Instinct
//  Axis 4: C=Community  / S=Solo
const DNA_MATRIX = {
    // ── E (Endurance) × D (Discipline) ── GRINDER / ARCHITECT territory
    'EDPC': { type: 'ARCHITECT', sub: 'The Strategic Lead',    detail: '社群中的數據領航者，以紀律構建全局' },
    'EDPS': { type: 'GRINDER',   sub: 'The Iron Blueprint',    detail: '鋼鐵意志與精確計劃的孤獨實踐者' },
    'EDIC': { type: 'GRINDER',   sub: 'The Iron Phalanx',      detail: '以紀律為核心，帶領社群突破邊界' },
    'EDIS': { type: 'GRINDER',   sub: 'The Lone Pilgrim',      detail: '孤獨苦行，在重複中積累無形的力量' },

    // ── E (Endurance) × F (Flow) ── ZEN territory
    'EFPC': { type: 'ZEN',       sub: 'Collective Breath',     detail: '以精準的呼吸節奏，與社群共同共振' },
    'EFPS': { type: 'ZEN',       sub: 'Solo Flow',             detail: '獨自流動，在靜謐中找到完美節奏' },
    'EFIC': { type: 'CATALYST',  sub: 'The Mindful Weaver',    detail: '用感性的能量串連社群的集體意志' },
    'EFIS': { type: 'ZEN',       sub: 'The Silent Current',    detail: '如水無聲，以最深沉的方式持續流動' },

    // ── P (Power) × D (Discipline) ── WARRIOR territory
    'PDPC': { type: 'WARRIOR',   sub: 'The War Council',       detail: '以紀律驅動爆發力，成為社群的作戰指揮' },
    'PDPS': { type: 'WARRIOR',   sub: 'Iron Vanguard',         detail: '孤身衝鋒，用最硬的數據驗證極限' },
    'PDIC': { type: 'WARRIOR',   sub: 'Instinct Protocol',     detail: '在混亂中本能啟動，帶領集體向前衝破' },
    'PDIS': { type: 'WARRIOR',   sub: 'Lone Predator',         detail: '沉默的獵手，感知節奏並在瞬間完成爆發' },

    // ── P (Power) × F (Flow) ── EXPLORER / CATALYST territory
    'PFPC': { type: 'CATALYST',  sub: 'The Fire Starter',      detail: '用爆炸性的精準能量點燃整個社群的引擎' },
    'PFPS': { type: 'EXPLORER',  sub: 'Chaos Engine',          detail: '混沌中隱藏秩序，精準計算每一個爆發時機' },
    'PFIC': { type: 'CATALYST',  sub: 'The Live Wire',         detail: '社群的電流，本能與爆發感染每一個人' },
    'PFIS': { type: 'EXPLORER',  sub: 'Wild Signal',           detail: '獨行的野性訊號，在未知地形中尋找極限' },
};

// ─── Utilities ────────────────────────────────────────────────────────
const clamp = (v, lo = 5, hi = 95) => Math.max(lo, Math.min(hi, Math.round(v)));

// Maps any zone key variant → z1/z2/z3/z4/z5
const toZoneBucket = (key) => {
    const s = String(key).toLowerCase().replace(/[\s\-_]/g, '');
    if (s === 'zone5' || s === '5' || s.includes('extreme')) return 'z5';
    if (s === 'zone4' || s === '4' || s.includes('anaerob')) return 'z4';
    if (s === 'zone3' || s === '3' || s.includes('aerob'))   return 'z3';
    if (s === 'zone2' || s === '2' || s.includes('fat'))     return 'z2';
    return 'z1'; // zone1, warmup, recovery, etc.
};

const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return isNaN(n) || !isFinite(n) ? fallback : n;
};

const safeAvg = (arr, fallback = 0) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;

const dateKey = (ts) => toLocalDateKey(new Date(ts));

// ─── Real Data Connectors ─────────────────────────────────────────────

// SYSTEM 1: Cardio / Running
const fetchCardio = async (userId) => {
    // 1a. API
    try {
        const res = await apiClient.get(`/api/cardio/sessions/${userId}?limit=30`);
        if (res.data?.sessions?.length) return res.data.sessions;
    } catch (_) {}

    // 1b. localStorage: cardio_sessions
    try {
        const raw = localStorage.getItem('cardio_sessions');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) return parsed;
        }
    } catch (_) {}

    // 1c. localStorage: workout_history (cardio-type entries)
    try {
        const all = JSON.parse(localStorage.getItem('workout_history') || '[]');
        const cardio = all.filter(s => {
            const t = String(s.type || s.activity_type || '').toLowerCase();
            return ['run', 'running', 'cardio', 'jog', ''].includes(t);
        });
        if (cardio.length) return cardio;
    } catch (_) {}

    // 1d. Reconstruct from weeklyCardioLog + lastCardioSession
    try {
        const sessions = [];
        const wlog = JSON.parse(localStorage.getItem('weeklyCardioLog') || '{}');
        if (wlog.sessions?.length) {
            wlog.sessions.forEach(s => {
                sessions.push({ timestamp: s.ts, distance_km: s.km });
            });
        }
        const last = readJSON('lastCardioSession', null);
        if (last) sessions.push({
            timestamp: last.timestamp,
            distance_km: last.stats?.distance,
            duration_seconds: last.stats?.duration,
            avgPace: last.stats?.avgPace,
            deepData: last.deepData,
        });
        return sessions;
    } catch (_) {}

    return [];
};

// SYSTEM 2: Strength / Fitness
const CARDIO_TYPES = ['run', 'running', 'cardio', 'jog', 'walk', 'cycling', 'swim'];
const isStrengthEntry = (s) => {
    const t = String(s.type || s.activity_type || s.workout_type || '').toLowerCase();
    // Must NOT be cardio
    const notCardio = !CARDIO_TYPES.some(k => t.includes(k));
    if (!notCardio) return false;
    // Must have EXPLICIT strength signals — exercise structure OR strength-specific type name
    // (Do NOT use total_volume alone — cardio sessions can also have that field)
    const hasExerciseStructure = (s.exercises?.length > 0 || s.completedExercises?.length > 0);
    const hasStrengthType = t.includes('strength') || t.includes('gym') || t.includes('weight') ||
        t.includes('muscle') || t.includes('lift') || t.includes('resistance') || t.includes('workout');
    return hasExerciseStructure || hasStrengthType;
};

const fetchStrength = async (userId) => {
    // 2a. API — filter to strength-only entries
    try {
        const res = await apiClient.get(`/api/workout/history/${userId}?limit=20`);
        const all = res.data?.history || res.data?.sessions || [];
        const strength = all.filter(isStrengthEntry);
        if (strength.length) return strength;
    } catch (_) {}

    // 2b. localStorage: workout_history (non-cardio)
    try {
        const all = JSON.parse(localStorage.getItem('workout_history') || '[]');
        const strength = all.filter(isStrengthEntry);
        if (strength.length) return strength;
    } catch (_) {}

    return [];
};

// SYSTEM 3: Nutrition
const fetchNutrition = async (userId) => {
    // 3a. SQL endpoint — 餐點實際儲存處（nutrition.db）。logged_only=true 只回傳有記錄的天，
    //     把每日 summary 攤平成 extractNutritionMetrics 期望的扁平 log（calories/protein/...）。
    try {
        const res = await apiClient.get(`/api/nutrition/sql/history/${userId}?days=30&logged_only=true`);
        const hist = res.data?.history || [];
        if (hist.length) {
            return hist.map(d => ({ date: d.date, ...(d.summary || {}) }));
        }
    } catch (_) {}

    // 3b. 舊 API（非 SQL）
    try {
        const res = await apiClient.get(`/api/nutrition/history/${userId}?days=30`);
        const list = res.data?.entries || res.data?.logs || res.data?.data || [];
        if (list.length) return list;
    } catch (_) {}
    try {
        const res = await apiClient.get(`/api/nutrition/daily/${userId}`);
        const list = res.data?.entries || res.data?.meals || [];
        if (list.length) return list;
    } catch (_) {}

    // 3b. localStorage: nutrition_log (global)
    try {
        const raw = localStorage.getItem('nutrition_log');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) return parsed;
        }
    } catch (_) {}

    // 3c. localStorage: nutrition_log_{userId}
    try {
        const raw = localStorage.getItem(`nutrition_log_${userId}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) return parsed;
        }
    } catch (_) {}

    return [];
};

// SYSTEM 4: Community / Social
const fetchSocial = async (userId) => {
    let posts = [];

    // 4a. API feed
    try {
        const res = await apiClient.get(`/api/activities/feed?user_id=${userId}&limit=30`);
        const all = res.data?.activities || res.data?.feed || [];
        posts = all.filter(a => a.user_id === userId || a.uId === userId);
    } catch (_) {}
    try {
        const res = await apiClient.get(`/api/feed/global?user_id=${userId}&limit=30`);
        const all = res.data?.activities || res.data?.feed || [];
        const mine = all.filter(a => a.user_id === userId || a.uId === userId);
        if (mine.length > posts.length) posts = mine;
    } catch (_) {}

    // 4b. socialPostsStore（已用 userId 命名空間，直接取回屬於此使用者的貼文）
    if (!posts.length) {
        try {
            posts = getSocialPosts(userId);
        } catch (_) {}
    }

    // 4c. Squad membership count (social strength signal)
    let squadCount = 0;
    try {
        const m = JSON.parse(localStorage.getItem(`squad_membership_${userId}`) || '[]');
        squadCount = m.length;
    } catch (_) {}
    // Also check the Strava-style key
    try {
        const profile = JSON.parse(localStorage.getItem(`social_profile_${userId}`) || '{}');
        if (profile.squad_count) squadCount = Math.max(squadCount, profile.squad_count);
    } catch (_) {}

    return { posts, squadCount };
};

// ─── Core Metrics Extractor ───────────────────────────────────────────
const extractCardioMetrics = (sessions) => {
    if (!sessions.length) return {
        aerobicFrac: 0.6, anaerobicFrac: 0.1, zone2Frac: 0.2,
        avgHR: 0, avgDistance: 0, totalDistance: 0,
        avgDurationMin: 0, avgPace: 0, paceStability: 50,
        avgEffort: 0, runConsistency: 30, sessionsCount: 0,
        anaerobicPct: 10, zone2Pct: 20,
    };

    // ── Zone Distribution ─────────────────────────────────────────
    const zAgg = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    sessions.forEach(s => {
        // Format A: s.zoneMinutes = { "Zone 1": N, … }
        const zm = s.zoneMinutes || s.zone_minutes || {};
        Object.entries(zm).forEach(([k, v]) => { zAgg[toZoneBucket(k)] += safeNum(v); });

        // Format B: s.zone1Min … s.zone5Min
        ['z1','z2','z3','z4','z5'].forEach((z, i) => {
            const raw = s[`zone${i+1}Min`] || s[`zone${i+1}_min`] || 0;
            zAgg[z] += safeNum(raw);
        });

        // Format C: s.deepData.deep_metrics.zone_distribution (our app's format)
        const zd = s.deepData?.deep_metrics?.zone_distribution
            || s.metrics?.zoneStats || s.stats?.zoneStats || {};
        Object.entries(zd).forEach(([k, v]) => { zAgg[toZoneBucket(k)] += safeNum(v); });

        // Format D: s.zones array
        (s.zones || []).forEach(z => {
            const bucket = `z${z.zone}`;
            if (zAgg[bucket] !== undefined) zAgg[bucket] += safeNum(z.minutes || z.duration);
        });
    });

    const totalZone = Object.values(zAgg).reduce((a, b) => a + b, 0);
    const aerobicFrac = totalZone > 0 ? (zAgg.z1 + zAgg.z2 + zAgg.z3) / totalZone : 0.6;
    const anaerobicFrac = totalZone > 0 ? (zAgg.z4 + zAgg.z5) / totalZone : 0.1;
    const zone2Frac = totalZone > 0 ? zAgg.z2 / totalZone : 0.2;

    // ── Distance & Duration ──────────────────────────────────────
    // ⚠️ 後端 /api/cardio/sessions 把數據巢狀在 s.metrics（distance_km / distance、
    //    duration_seconds / duration、pace_per_km / avgPace、avg_hr）。先前只讀頂層欄位，
    //    導致「21 次卻 0km」的 bug。這裡統一優先讀 s.metrics，再退回各種頂層/stats 命名。
    const m = (s) => s.metrics || s.stats || {};
    const distances = sessions
        .map(s => safeNum(m(s).distance_km || m(s).distance || s.distance_km || s.distance || s.distanceKm || s.km))
        .filter(d => d > 0);
    const avgDistance = safeAvg(distances, 0);  // 0 = no data, don't use fake default
    const totalDistance = distances.reduce((a, b) => a + b, 0);

    const durSeconds = sessions
        .map(s => safeNum(m(s).duration_seconds || m(s).duration || s.duration_seconds || s.duration || s.durationSec))
        .filter(d => d > 0);
    const avgDurationMin = Math.round(safeAvg(durSeconds, 0) / 60);

    // ── Heart Rate ───────────────────────────────────────────────
    const hrs = sessions
        .map(s => safeNum(m(s).avg_hr || m(s).avgHr || m(s).heart_rate_avg || s.avgHeartRate || s.avgHR || s.avg_hr))
        .filter(h => h > 30);
    const avgHR = Math.round(safeAvg(hrs, 0));

    // ── Pace & Stability ─────────────────────────────────────────
    const paces = sessions
        .map(s => safeNum(m(s).pace_per_km || m(s).avgPace || m(s).avg_pace || s.avgPace || s.pace || s.avg_pace))
        .filter(p => p > 60 && p < 1000);
    const avgPace = safeAvg(paces, 330);
    const paceVar = paces.length > 1
        ? Math.sqrt(paces.reduce((sq, n) => sq + Math.pow(n - avgPace, 2), 0) / paces.length)
        : avgPace * 0.1;
    const paceStability = clamp(100 - (paceVar / Math.max(avgPace, 1)) * 100, 0, 100);

    // ── Effort Score ─────────────────────────────────────────────
    const efforts = sessions
        .map(s => safeNum(s.effort_score || s.metrics?.score || s.stats?.score || s.overall_score))
        .filter(e => e > 0);
    const avgEffort = Math.round(safeAvg(efforts, 0));

    // ── Weekly Consistency ───────────────────────────────────────
    const now = Date.now();
    const weekBuckets = [0, 0, 0, 0];
    sessions.forEach(s => {
        const ts = new Date(s.date || s.timestamp || s.startTime || 0).getTime();
        const wk = Math.floor((now - ts) / 604800000);
        if (wk >= 0 && wk < 4) weekBuckets[wk]++;
    });
    const avgWk = weekBuckets.reduce((a, b) => a + b) / 4;
    const wkVar = weekBuckets.reduce((sq, n) => sq + Math.pow(n - avgWk, 2), 0) / 4;
    const runConsistency = clamp(100 - wkVar * 15, 0, 100);

    return {
        aerobicFrac, anaerobicFrac, zone2Frac,
        avgHR, avgDistance: parseFloat(avgDistance.toFixed(1)),
        totalDistance: parseFloat(totalDistance.toFixed(1)),
        avgDurationMin, avgPace: Math.round(avgPace), paceStability,
        avgEffort, runConsistency, sessionsCount: sessions.length,
        anaerobicPct: Math.round(anaerobicFrac * 100),
        zone2Pct: Math.round(zone2Frac * 100),
    };
};

const extractStrengthMetrics = (sessions) => {
    if (!sessions.length) return {
        strengthCount: 0, avgRPE: 0, avgVolume: 0,
        completionRate: 0, avgStrengthEffort: 0, weeklyFreq: 0,
    };

    const rpes = [];
    const volumes = [];
    const completions = [];
    const strengthEfforts = [];

    sessions.forEach(s => {
        // Completion rate
        completions.push(safeNum(s.metrics?.completion_rate || s.completion_rate, 100));
        // Overall effort
        const oe = safeNum(s.overall_score || s.metrics?.intensity || s.effort_score);
        if (oe > 0) strengthEfforts.push(oe);
        // Volume
        const vol = safeNum(s.total_volume || s.volume_kg);
        if (vol > 0) volumes.push(vol);

        // Per-set RPE
        const exList = s.exercises || s.completedExercises || [];
        exList.forEach(ex => {
            const setList = ex.sets || ex.completedSets || [];
            setList.forEach(set => {
                const r = safeNum(set.rpe || set.effortScore);
                if (r > 0 && r <= 10) rpes.push(r);
            });
        });
    });

    // Weekly frequency (last 4 weeks)
    const now = Date.now();
    let recentCount = 0;
    sessions.forEach(s => {
        const ts = new Date(s.date || s.completedAt || s.timestamp || 0).getTime();
        if (now - ts < 28 * 86400000) recentCount++;
    });

    return {
        strengthCount: sessions.length,
        avgRPE: parseFloat(safeAvg(rpes, 0).toFixed(1)),
        avgVolume: Math.round(safeAvg(volumes, 0)),
        completionRate: Math.round(safeAvg(completions, 80)),
        avgStrengthEffort: Math.round(safeAvg(strengthEfforts, 0)),
        weeklyFreq: parseFloat((recentCount / 4).toFixed(1)),
    };
};

const extractNutritionMetrics = (logs) => {
    if (!logs.length) return {
        daysLogged: 0, nutritionConsistency: 0,
        avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFats: 0,
        avgWater: 0, proteinAdequacy: 0,
    };

    const calArr = logs.map(l => safeNum(l.calories || l.kcal || l.totalCalories)).filter(v => v > 0);
    const protArr = logs.map(l => safeNum(l.protein || l.proteinG)).filter(v => v > 0);
    const carbArr = logs.map(l => safeNum(l.carbs || l.carbsG || l.carbohydrates)).filter(v => v > 0);
    const fatArr  = logs.map(l => safeNum(l.fats || l.fatG || l.fat)).filter(v => v > 0);
    const waterArr = logs.map(l => safeNum(l.water_ml || l.water)).filter(v => v > 0);

    const uniqueDays = new Set(logs.map(l =>
        l.date?.slice(0, 10) || dateKey(l.timestamp || Date.now())
    )).size;
    const nutritionConsistency = Math.round(Math.min(100, uniqueDays / 30 * 100));
    const avgProtein = Math.round(safeAvg(protArr, 0));
    // 1.6g protein per kg is a common athletic target; 100g = ~60kg athlete target
    const proteinAdequacy = avgProtein > 0 ? clamp(Math.round(avgProtein / 100 * 100), 0, 100) : 10;

    return {
        daysLogged: uniqueDays,
        nutritionConsistency,
        avgCalories: Math.round(safeAvg(calArr, 0)),
        avgProtein,
        avgCarbs: Math.round(safeAvg(carbArr, 0)),
        avgFats: Math.round(safeAvg(fatArr, 0)),
        avgWater: Math.round(safeAvg(waterArr, 0)),
        proteinAdequacy,
    };
};

const extractSocialMetrics = ({ posts, squadCount }) => {
    if (!posts.length && !squadCount) return {
        postCount: 0, totalKudos: 0, avgKudos: 0,
        totalReactions: 0, squadCount: 0, socialEngagement: 5,
    };

    const totalKudos = posts.reduce((sum, p) => sum + safeNum(p.kudos_count), 0);
    const avgKudos = posts.length ? parseFloat((totalKudos / posts.length).toFixed(1)) : 0;
    const totalReactions = posts.reduce((sum, p) => {
        const r = p.reactions || {};
        return sum + Object.values(r).reduce((a, b) => a + safeNum(b), 0);
    }, 0);

    const socialEngagement = clamp(
        Math.min(40, posts.length * 5) +    // posting frequency
        Math.min(30, avgKudos * 5) +         // community resonance
        (squadCount > 0 ? 20 : 0) +          // squad membership
        Math.min(10, totalReactions * 0.5)   // total interaction
    );

    return {
        postCount: posts.length,
        totalKudos,
        avgKudos,
        totalReactions,
        squadCount,
        socialEngagement,
    };
};

// ─── Classification Algorithm ─────────────────────────────────────────
//  Each dimension is computed from REAL metrics across 4 systems
const classifyAthlete = ({ cardio, strength, nutrition, social }) => {
    const c = cardio;
    const s = strength;
    const n = nutrition;
    const so = social;

    // ── 5 Dimension Scores ────────────────────────────────────────

    // ENDURANCE: aerobic base (zone distribution + distance + duration)
    const ENDURANCE = clamp(
        c.aerobicFrac * 45 +                             // % time in Zone 1–3
        Math.min(1, c.avgDistance / 20) * 20 +           // avg session distance
        Math.min(1, c.avgDurationMin / 90) * 20 +        // avg session duration
        (c.sessionsCount > 8 ? 15 : c.sessionsCount * 1.5) // total volume
    );

    // INTENSITY: anaerobic dominance + strength effort + RPE
    const INTENSITY = clamp(
        c.anaerobicFrac * 50 +                           // % time in Zone 4–5
        Math.min(1, c.avgEffort / 80) * 20 +             // cardio effort score
        (s.avgRPE > 0 ? (s.avgRPE / 10) * 15 : 5) +     // strength RPE
        (s.weeklyFreq > 2 ? 15 : s.weeklyFreq * 5)       // gym frequency
    );

    // DISCIPLINE: cross-system consistency (run + strength + nutrition)
    const DISCIPLINE = clamp(
        c.runConsistency * 0.35 +                         // running weekly variance
        (s.strengthCount > 0
            ? Math.min(20, s.strengthCount * 1.5) : 0) + // strength sessions
        n.nutritionConsistency * 0.25 +                   // days with food logs
        (s.completionRate > 0
            ? (s.completionRate / 100) * 20 : 5)          // workout completion rate
    );

    // PRECISION: low variance in pace + structured training + nutrition tracking
    const PRECISION = clamp(
        c.paceStability * 0.50 +                          // pace consistency
        n.proteinAdequacy * 0.20 +                        // nutrition planning proxy
        (s.strengthCount > 0 ? 15 : 0) +                 // structured strength
        (n.nutritionConsistency > 40 ? 15 : n.nutritionConsistency * 0.35)
    );

    // VITALITY: aerobic recovery + fueling quality + social energy
    const VITALITY = clamp(
        (c.zone2Frac > 0.25 ? 20 : c.zone2Frac * 75) +   // Zone 2 base (recovery marker)
        (n.avgCalories > 1500 ? 15 : n.avgCalories / 100) + // adequate fueling
        n.proteinAdequacy * 0.20 +                         // protein for recovery
        so.socialEngagement * 0.30                         // community energy
    );

    // ── 4 Bipolar Axis Positions (0=fully left, 100=fully right) ─
    // EP: Endurance(100) ↔ Power(0)
    const axEP = clamp(c.aerobicFrac * 55 + ENDURANCE * 0.35);
    // DF: Discipline(100) ↔ Flow(0)
    const axDF = clamp(DISCIPLINE * 0.65 + PRECISION * 0.35);
    // PI: Precision(100) ↔ Instinct(0)
    const axPI = clamp(c.paceStability * 0.50 + PRECISION * 0.50);
    // CS: Community(100) ↔ Solo(0)
    const axCS = clamp(so.socialEngagement);

    // ── Personality Classification ────────────────────────────────
    let type;
    if (axPI >= 75 && axDF >= 78)                            type = 'ARCHITECT';
    else if (INTENSITY >= 68 || c.anaerobicFrac >= 0.32)    type = 'WARRIOR';
    else if (axEP >= 75 && c.zone2Frac >= 0.3 && axDF <= 52) type = 'ZEN';
    else if (axDF >= 80)                                     type = 'GRINDER';
    else if (axCS >= 62)                                     type = axEP >= 58 ? 'EXPLORER' : 'CATALYST';
    else if (axEP >= 60)                                     type = 'GRINDER';
    else                                                     type = 'ARCHITECT';

    const dominantZone = c.anaerobicFrac >= 0.3 ? 'Zone 4–5'
        : c.zone2Frac >= 0.35 ? 'Zone 2'
        : c.aerobicFrac >= 0.7 ? 'Zone 2–3' : 'Zone 3';

    // ── Dynamic DNA Code: dominant letter from each axis ──────────
    // axes are "left-side scores" (high = Endurance/Discipline/Precision/Community)
    const dnaCode =
        (axEP >= 50 ? 'E' : 'P') +
        (axDF >= 50 ? 'D' : 'F') +
        (axPI >= 50 ? 'P' : 'I') +
        (axCS >= 50 ? 'C' : 'S');

    // ── Look up DNA Matrix for precise subtitle ────────────────────
    const dnaEntry = DNA_MATRIX[dnaCode] || DNA_MATRIX['EDPS'];
    // DNA matrix also provides type override (more specific than the heuristic above)
    const finalType = dnaEntry.type;

    return {
        type: finalType,
        dnaCode,
        subtitle: dnaEntry.sub,
        detail: dnaEntry.detail,
        axes: { EP: axEP, DF: axDF, PI: axPI, CS: axCS },
        dims: { ENDURANCE, INTENSITY, DISCIPLINE, PRECISION, VITALITY },
        meta: {
            // Running
            sessionsCount: c.sessionsCount,
            avgEffort: c.avgEffort,
            avgDistance: c.avgDistance,
            totalDistance: c.totalDistance,
            avgHR: c.avgHR,
            avgDurationMin: c.avgDurationMin,
            anaerobicPct: c.anaerobicPct,
            zone2Pct: c.zone2Pct,
            paceStability: c.paceStability,
            dominantZone,
            // Strength
            strengthCount: s.strengthCount,
            avgRPE: s.avgRPE,
            avgVolume: s.avgVolume,
            strengthCompletion: s.completionRate,
            // Nutrition
            nutritionDays: n.daysLogged,
            nutritionConsistency: n.nutritionConsistency,
            avgCalories: n.avgCalories,
            avgProtein: n.avgProtein,
            // Social
            socialPosts: so.postCount,
            totalKudos: so.totalKudos,
            avgKudos: so.avgKudos,
            squadCount: so.squadCount,
        },
    };
};

// ─── Sub-Components ───────────────────────────────────────────────────

// BiaxialSlider — leftPct & rightPct are the RAW axis scores (leftPct + rightPct = 100)
// leftDominant = leftPct >= rightPct. Dominant side = coral, recessive = faded.
const CORAL = '#F95C4B';
const BiaxialSlider = ({ leftCode, rightCode, leftLabel, rightLabel, leftPct, rightPct }) => {
    const leftDom = leftPct >= rightPct;
    // slider dot position: leftPct=100 → dot at left (0%), leftPct=0 → dot at right (100%)
    const dotPos = 100 - leftPct;   // 0=fully-left, 100=fully-right
    const filledPct = Math.abs(dotPos - 50);  // distance from center
    return (
        <div className="mb-8">
            {/* Top row: left code/label | right code/label */}
            <div className="flex justify-between items-start mb-2">
                <div>
                    <span className="block text-[15px] font-black tracking-tight leading-none"
                        style={{ color: leftDom ? CORAL : '#161415', opacity: leftDom ? 1 : 0.22 }}>
                        {leftCode}
                    </span>
                    <span className="block text-[12px] uppercase tracking-widest font-bold mt-0.5"
                        style={{ opacity: leftDom ? 0.42 : 0.14 }}>{leftLabel}</span>
                </div>
                <div className="text-right">
                    <span className="block text-[15px] font-black tracking-tight leading-none text-right"
                        style={{ color: !leftDom ? CORAL : '#161415', opacity: leftDom ? 0.22 : 1 }}>
                        {rightCode}
                    </span>
                    <span className="block text-[12px] uppercase tracking-widest font-bold mt-0.5 text-right"
                        style={{ opacity: leftDom ? 0.14 : 0.42 }}>{rightLabel}</span>
                </div>
            </div>
            {/* Slider bar */}
            <div className="relative h-[2px] bg-black/6 rounded-full mb-2">
                <div className="absolute left-1/2 -top-[4px] w-px h-[10px] bg-black/10 -translate-x-1/2" />
                {dotPos <= 50
                    ? <motion.div initial={{ width: 0 }} animate={{ width: `${filledPct}%` }}
                        transition={{ duration: 1.3, ease: 'circOut' }}
                        className="absolute right-1/2 top-0 h-full rounded-full"
                        style={{ backgroundColor: CORAL }} />
                    : <motion.div initial={{ width: 0 }} animate={{ width: `${filledPct}%` }}
                        transition={{ duration: 1.3, ease: 'circOut' }}
                        className="absolute left-1/2 top-0 h-full rounded-full"
                        style={{ backgroundColor: CORAL }} />
                }
                <motion.div initial={{ left: '50%' }} animate={{ left: `${dotPos}%` }}
                    transition={{ duration: 1.3, ease: 'circOut' }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full shadow border-2 border-white"
                    style={{ backgroundColor: CORAL }} />
            </div>
            {/* Bottom row: both percentages */}
            <div className="flex justify-between">
                <span className="text-[11px] font-black tabular-nums"
                    style={{ color: leftDom ? CORAL : 'rgba(22,20,21,0.25)' }}>
                    {leftPct}%
                </span>
                <span className="text-[11px] font-black tabular-nums"
                    style={{ color: !leftDom ? CORAL : 'rgba(22,20,21,0.25)' }}>
                    {rightPct}%
                </span>
            </div>
        </div>
    );
};

const DimBar = ({ label, IconComp, value, color, description }) => (
    <div className="mb-5">
        <div className="flex justify-between items-end mb-[5px]">
            <div className="flex items-center gap-1.5">
                {IconComp && <IconComp size={10} style={{ color }} />}
                <span className="text-[12px] font-black uppercase tracking-[0.18em] text-black/40">{label}</span>
            </div>
            <span className="text-[11px] font-black tabular-nums" style={{ color }}>{value}</span>
        </div>
        <div className="h-[2px] w-full bg-black/5 relative rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }}
                transition={{ duration: 1.6, ease: 'circOut' }}
                className="h-full absolute left-0 top-0 rounded-full" style={{ backgroundColor: color }} />
        </div>
        {description && <p className="text-[11px] text-black/30 mt-1 leading-tight font-medium">{description}</p>}
    </div>
);

const DomainStat = ({ IconComp, label, value, unit }) => (
    <div className="flex flex-col items-center">
        <IconComp size={13} className="opacity-25 mb-1" />
        <span className="text-[15px] font-black tabular-nums leading-none">{value ?? '—'}</span>
        {unit && <span className="text-[12px] uppercase tracking-widest opacity-25 font-bold">{unit}</span>}
        <span className="text-[12px] uppercase tracking-widest opacity-25 font-bold mt-0.5">{label}</span>
    </div>
);

const CardStat = ({ label, value, light }) => (
    <div className={`flex flex-col items-center px-3 py-2 rounded-[12px] ${light ? 'bg-white/12' : 'bg-black/8'}`}>
        <span className={`text-base font-black tabular-nums leading-none ${light ? 'text-white/85' : 'text-black'}`}>{value}</span>
        <span className={`text-[12px] uppercase tracking-widest mt-0.5 font-bold ${light ? 'text-white/45' : 'text-black/40'}`}>{label}</span>
    </div>
);

// ─── Error / Loading States ───────────────────────────────────────────
const LoadingScreen = ({ stage }) => (
    <div className="min-h-[100dvh] bg-[#F6F4F1] flex flex-col items-center justify-center gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
            <RefreshCw size={26} strokeWidth={1.5} className="opacity-35" />
        </motion.div>
        <div className="text-center">
            <p className="text-[12px] font-black uppercase tracking-[0.4em] opacity-30">Profiling DNA…</p>
            {stage && <p className="text-[12px] font-bold uppercase tracking-widest opacity-20 mt-1">{stage}</p>}
        </div>
    </div>
);

/* ── 還沒有足夠資料 ────────────────────────────────────────────────
   這一頁的「藝術」不是靠一大塊顏色，是靠 DRVN 自己那套編排：
   深色拉絲鈦金屬底板 ＋ 背後一盞珊瑚氛圍燈，上面是
   小字距大寫 kicker → 一個很大的淺字重數字 → 一句話。
   （設計系統 §6：kicker → headline → support，以及「84px 淺字重數字
     壓著 9px 寬字距標籤」那個戲劇性的級距差。）
   進度用三格刻度畫出來 —— 現況與目標在同一個物件上（介面標準 §4），
   所以不必再用文字說「你只做了 0 次」。
   珊瑚只留給最後那顆要按的鈕。 */
const InsufficientDataView = ({ navigate, done = 0, need = 3 }) => (
    <div className="personality-empty">
        <motion.button {...pressProps('icon')}
 type="button"
 aria-label="返回"
 onClick={() => { haptic('light'); navigate('/mobile-home', { replace: true }); }}
 className="personality-back"
 >
            <ArrowLeft size={22} />
        </motion.button>

        <motion.section
            className="ti-surface-dark personality-slab"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="personality-slab__grain" aria-hidden />
            <div className="personality-slab__lamp" aria-hidden />

            <div className="personality-slab__body">
                <p className="personality-kicker">運動人格</p>

                <div className="personality-count" aria-label={`已完成 ${done} 次，需要 ${need} 次`}>
                    <span className="personality-count__now">{done}</span>
                    <span className="personality-count__need">／{need}</span>
                </div>

                {/* 三格刻度：填滿＝已完成，空的＝還要幾次 */}
                <div className="personality-slots" aria-hidden>
                    {Array.from({ length: need }).map((_, i) => (
                        <span key={i} className={`personality-slots__i${i < done ? ' is-on' : ''}`} />
                    ))}
                </div>

                <p className="personality-slab__line">練滿三次，這裡就會讀出你的訓練風格</p>
            </div>
        </motion.section>

        <motion.button {...pressProps('cta')} type="button"
            onClick={() => { haptic('medium'); navigate('/luxury-plan-view-mobile'); }}
            className="personality-empty-cta">
            <span>去做第一次訓練</span>
            <ArrowUpRight size={20} />
        </motion.button>

        <motion.button {...pressProps('row')} type="button"
            onClick={() => { haptic('light'); navigate('/cardio-tracker-mobile'); }}
            className="personality-empty-alt">
            <span>或先去跑一趟</span>
            <ArrowUpRight size={18} />
        </motion.button>
    </div>
);

const ErrorView = ({ onRetry, navigate }) => (
    <div className="min-h-[100dvh] bg-[#F6F4F1] flex flex-col items-center justify-center px-6 gap-5">
        <p className="text-[22px] font-bold text-center">分析失敗</p>
        <p className="text-[14px] font-medium opacity-50 text-center leading-relaxed">
            連不上伺服器，等一下再試一次。
        </p>
        <div className="flex gap-3">
            <motion.button {...pressProps('pill')}
 type="button"
 onClick={() => { haptic('light'); navigate('/mobile-home', { replace: true }); }}
 className="px-6 min-h-[44px] rounded-full border border-black/15 text-[14px] font-bold"
 >
                回首頁
            </motion.button>
            <motion.button {...pressProps('pill')} onClick={onRetry} className="px-6 min-h-[44px] rounded-full bg-black text-white text-[14px] font-bold">再試一次</motion.button>
        </div>
    </div>
);

// ─── Main Component ────────────────────────────────────────────────────
const PersonalityViewMobile = () => {
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadStage, setLoadStage] = useState('');
    const [error, setError] = useState(null);
    const [insufficientDone, setInsufficientDone] = useState(0);   // 已完成幾次（空狀態要顯示真實進度）

    const runAnalysis = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const userId = getUserId();

            // ── Fetch all 4 domains ──────────────────────────────
            setLoadStage('Reading running data…');
            const cardioRaw = await fetchCardio(userId);

            if (cardioRaw.length < 3) {
                setInsufficientDone(cardioRaw.length);   // 畫面上的 0/3 要是真的，不是寫死的 0
                setError('insufficient');
                setLoading(false);
                return;
            }

            setLoadStage('Reading fitness data…');
            const strengthRaw = await fetchStrength(userId);

            setLoadStage('Reading nutrition data…');
            const nutritionRaw = await fetchNutrition(userId);

            setLoadStage('Reading community data…');
            const socialRaw = await fetchSocial(userId);

            // ── Extract real metrics from each domain ────────────
            setLoadStage('Computing DNA profile…');
            const cardio    = extractCardioMetrics(cardioRaw);
            const strength  = extractStrengthMetrics(strengthRaw);
            const nutrition = extractNutritionMetrics(nutritionRaw);
            const social    = extractSocialMetrics(socialRaw);

            // ── Run classification ───────────────────────────────
            const classified = classifyAthlete({ cardio, strength, nutrition, social });

            // ── Optional: override type with remote AI ───────────
            try {
                const fd = new FormData();
                fd.append('training_records', JSON.stringify({ sessions: cardioRaw }));
                const res = await fetch(
                    `http://${window.location.hostname}:8000/api/personality/classify`,
                    { method: 'POST', body: fd }
                );
                if (res.ok) {
                    const json = await res.json();
                    if (json.status === 'success' && json.personality) {
                        const name = (typeof json.personality === 'string'
                            ? json.personality : json.personality.name || '').toLowerCase();
                        const map = { warrior: 'WARRIOR', zen: 'ZEN', grind: 'GRINDER',
                            arch: 'ARCHITECT', expl: 'EXPLORER', cata: 'CATALYST' };
                        for (const [k, v] of Object.entries(map)) {
                            if (name.includes(k)) { classified.type = v; break; }
                        }
                    }
                }
            } catch (_) { /* API offline — local result stands */ }

            // ── 雙軸人格偵測 → 記錄「曾偵測過」（供 Identity 稱號解鎖）──
            try {
                const detected = detectAllPersonas({ cardio: cardioRaw, strength: strengthRaw });
                if (detected.all.length) {
                    const newly = recordDetectedPersonas(userId, detected.all) || [];
                    // ✨ 第一次解鎖人格 → 滿版時刻。延遲發射：先讓人格頁自己的
                    //    揭示動畫演完，再上滿版（避免蓋住結果、也避開教學提示）。
                    if (newly.length) {
                        const zh = PERSONA_BY_ID[newly[0]]?.poeticZh || PERSONA_BY_ID[newly[0]]?.label || '新人格';
                        setTimeout(() => { try { recordFirst(userId, 'new_persona', zh); } catch { /* */ } }, 2400);
                    }
                }
            } catch (_) { /* 偵測失敗不影響人格頁 */ }

            setResult(classified);
            setLoading(false);
        } catch (e) {
            console.error('[Personality] Analysis error:', e);
            setError('failed');
            setLoading(false);
        }
    }, []);

    useEffect(() => { runAnalysis(); }, []);

    // ── Guards ──────────────────────────────────────────────────
    if (loading) return <LoadingScreen stage={loadStage} />;
    if (error === 'insufficient') return <InsufficientDataView navigate={navigate} done={insufficientDone} need={3} />;
    if (error === 'failed' && !result) return <ErrorView onRetry={runAnalysis} navigate={navigate} />;

    const { type, dnaCode, subtitle, detail, axes, dims, meta } = result;
    const p = TYPES[type] || TYPES.ARCHITECT;

    // ── Dimension descriptions with real numbers ─────────────
    const dimDescs = {
        ENDURANCE: `Zone 2 佔 ${meta.zone2Pct}% · 均距 ${meta.avgDistance}km × ${meta.sessionsCount} 次 · 總里程 ${meta.totalDistance}km`,
        INTENSITY: [
            meta.anaerobicPct > 0 ? `無氧 ${meta.anaerobicPct}%` : null,
            meta.avgHR > 0 ? `平均心率 ${meta.avgHR}bpm` : null,
            meta.avgRPE > 0 ? `健身 RPE ${meta.avgRPE}` : null,
        ].filter(Boolean).join(' · ') || '暫無強度數據',
        DISCIPLINE: `跑步 ${meta.sessionsCount} 次 × 健身 ${meta.strengthCount} 次 × 飲食追蹤 ${meta.nutritionDays} 天${meta.strengthCompletion > 0 ? ` · 完成率 ${meta.strengthCompletion}%` : ''}`,
        PRECISION: [
            `配速穩定 ${meta.paceStability}%`,
            meta.avgProtein > 0 ? `均蛋白 ${meta.avgProtein}g` : null,
            meta.nutritionConsistency > 0 ? `飲食計劃 ${meta.nutritionConsistency}%` : null,
        ].filter(Boolean).join(' · '),
        VITALITY: [
            meta.avgCalories > 0 ? `均攝 ${meta.avgCalories} kcal` : null,
            meta.socialPosts > 0 ? `社群 ${meta.socialPosts} 貼文 / ${meta.totalKudos} 掌聲` : null,
            meta.squadCount > 0 ? `${meta.squadCount} 小隊` : null,
        ].filter(Boolean).join(' · ') || '暫無活力數據',
    };

    return (
        <div className="min-h-[100dvh] bg-[#F6F4F1] text-[#161415] flex flex-col font-sans px-6  pb-28 overflow-x-hidden page-top-safe">
            <style>{`
                .fsH { font-family: var(--font-display); font-weight: 900; }
            `}</style>

            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <motion.button {...pressProps('icon')}
 type="button"
 aria-label="返回"
 onClick={() => { haptic('light'); navigate('/mobile-home', { replace: true }); }}
 className="personality-back"
 >
                    <ArrowLeft size={22} />
                </motion.button>
                <motion.button {...pressProps('icon')} aria-label="重新整理" onClick={runAnalysis} className="p-2 opacity-22 hover:opacity-50">
                    <RefreshCw size={15} />
                </motion.button>
            </div>

            <div data-onboard="personality-overview" className="border-b border-black/10 pb-4 mb-8">
                {/* 英文抬頭（Identity / Athlete DNA · v3.0 / Bio-Metric Profile）拿掉：
                    那三行對使用者沒有作用，而且 9px 低於最小字級。 */}
                <h1 className="text-[30px] font-bold tracking-tight">運動人格</h1>
                <p className="text-[13px] font-medium opacity-45 mt-1.5">依你的跑步與重訓資料分析</p>
            </div>

            {/* DNA Code + Category */}
            <div className="grid grid-cols-2 border-b border-black/10 mb-10">
                <div className="border-r border-black/10 py-6">
                    <span className="block text-[12px] font-bold opacity-45 mb-2">人格代號</span>
                    {/* Dynamic: each letter = dominant side of its axis (coral tinted) */}
                    <div className="flex gap-[1px] items-baseline">
                        {dnaCode.split('').map((ch, i) => (
                            <span key={i} className="text-4xl fsH italic tracking-wider"
                                style={{ color: CORAL }}>{ch}</span>
                        ))}
                    </div>
                    {/* Dynamic subtitle from DNA_MATRIX — unique per 16 combinations */}
                    <span className="block text-[12px] font-semibold mt-1.5"
                        style={{ color: CORAL, opacity: 0.85 }}>
                        {subtitle}
                    </span>
                </div>
                <div className="py-6 pl-6 text-right">
                    <span className="block text-[12px] font-bold opacity-25 mb-2">分類</span>
                    <span className="text-3xl fsH italic">{p.category}</span>
                    <div className="flex justify-end mt-2">
                        <span className="text-[12px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
                            style={{ backgroundColor: p.cardColor + '15', color: p.cardColor }}>
                            {p.tag}
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Personality Card */}
            <motion.div initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: 'circOut' }}
                className="relative w-full aspect-[4/5] rounded-[36px] p-8 flex flex-col justify-between overflow-hidden shadow-2xl mb-10"
                style={{ backgroundColor: p.cardColor }}>
                <div className="flex justify-between items-start relative z-10">
                    <div>
                        <span className="block text-[12px] font-bold tracking-[0.04em]"
                            style={{ color: p.textColor, opacity: 0.5 }}>{p.tag}</span>
                        <span className="text-[17px] fsH italic" style={{ color: p.textColor }}>{dnaCode}</span>
                    </div>
                    <Plus size={18} strokeWidth={2.5} style={{ color: p.textColor, opacity: 0.28 }} />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex items-center justify-center"
                    style={{ border: `1px solid ${p.textColor}18` }}>
                    <ArrowUpRight size={44} strokeWidth={1} style={{ color: p.textColor, opacity: 0.1 }} />
                </div>
                {/* Real stats */}
                <div className="flex gap-2 justify-center relative z-10">
                    <CardStat label="Sessions" value={meta.sessionsCount} light />
                    <CardStat label={meta.avgEffort > 0 ? `${meta.avgEffort}pts` : '—'} value="Effort" light />
                    <CardStat label="Dom Zone" value={meta.dominantZone} light />
                </div>
                <div className="relative z-10">
                    <h2 className="text-[66px] leading-[0.83] fsH tracking-tighter mb-1"
                        style={{ color: p.textColor }}>{p.title}.</h2>
                    {/* Dynamic subtitle — unique per DNA combination */}
                    <p className="text-[13px] fsH italic leading-tight mb-2"
                        style={{ color: p.textColor, opacity: 0.85 }}>
                        {subtitle}.
                    </p>
                    {/* Detail — one-line description unique to this 4-letter code */}
                    <p className="text-[11px] font-medium leading-snug max-w-[220px] mb-4"
                        style={{ color: p.textColor, opacity: 0.45 }}>{detail}</p>
                    <div className="flex gap-2 flex-wrap">
                        {p.traits.map(t => (
                            <span key={t} className="px-3 py-1 rounded-full text-[12px] font-bold"
                                style={{ backgroundColor: `${p.textColor}18`, color: p.textColor }}>{t}</span>
                        ))}
                    </div>
                </div>
                <div className="absolute -bottom-8 -right-4 text-[155px] fsH select-none pointer-events-none"
                    style={{ color: p.textColor, opacity: 0.04 }}>DRVN</div>
            </motion.div>

            {/* 4 Bipolar Axes */}
            <div className="bg-white/55 border border-black/5 rounded-[28px] p-7 mb-5 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 mb-7 pb-4 border-b border-black/8">
                    <Activity size={12} style={{ color: P.coral }} />
                    <span className="text-[12px] font-bold tracking-[0.04em]">四條軸線</span>
                    <span className="ml-auto text-[12px] font-bold opacity-22 uppercase tracking-widest">4 Dimensions</span>
                </div>
                {/* axes.EP = Endurance score (high=E dominant), axes.DF = Discipline, axes.PI = Precision, axes.CS = Community */}
                <BiaxialSlider leftCode="E" rightCode="P" leftLabel="耐力 Endurance" rightLabel="爆發 Power"
                    leftPct={axes.EP} rightPct={100 - axes.EP} />
                <BiaxialSlider leftCode="D" rightCode="F" leftLabel="紀律 Discipline" rightLabel="直覺 Flow"
                    leftPct={axes.DF} rightPct={100 - axes.DF} />
                <BiaxialSlider leftCode="P" rightCode="I" leftLabel="精準 Precision" rightLabel="本能 Instinct"
                    leftPct={axes.PI} rightPct={100 - axes.PI} />
                <BiaxialSlider leftCode="C" rightCode="S" leftLabel="社群 Community" rightLabel="獨行 Solo"
                    leftPct={axes.CS} rightPct={100 - axes.CS} />
                <p className="text-[11px] text-black/22 font-medium mt-1 leading-relaxed">
                    每個軸由真實數據計算 — 跑步區間、配速變異係數、跨系統一致性、社群互動頻率。
                </p>
            </div>

            {/* 5 Domain Dimensions */}
            <div className="bg-white/55 border border-black/5 rounded-[28px] p-7 mb-5 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 mb-7 pb-4 border-b border-black/8">
                    <TrendingUp size={12} style={{ color: P.coral }} />
                    <span className="text-[12px] font-bold tracking-[0.04em]">5-Domain Score</span>
                    <span className="ml-auto text-[12px] font-bold opacity-22 uppercase tracking-widest">真實資料</span>
                </div>
                <DimBar label="Endurance 持久力"   IconComp={Heart}    value={dims.ENDURANCE}  color={P.black}   description={dimDescs.ENDURANCE} />
                <DimBar label="Intensity 強度商"    IconComp={Zap}      value={dims.INTENSITY}  color={P.coral}   description={dimDescs.INTENSITY} />
                <DimBar label="Discipline 紀律指數" IconComp={Target}   value={dims.DISCIPLINE} color="#2C3E50"   description={dimDescs.DISCIPLINE} />
                <DimBar label="Precision 精準度"    IconComp={Activity} value={dims.PRECISION}  color={P.black}   description={dimDescs.PRECISION} />
                <DimBar label="Vitality 活力脈衝"   IconComp={Users}    value={dims.VITALITY}   color={P.ember}   description={dimDescs.VITALITY} />

                {/* Domain contribution */}
                <div className="mt-6 pt-4 border-t border-black/8 grid grid-cols-4 gap-1">
                    <DomainStat IconComp={Activity} label="跑步" value={meta.sessionsCount} unit="sessions" />
                    <DomainStat IconComp={Dumbbell} label="健身" value={meta.strengthCount > 0 ? meta.strengthCount : '—'} unit={meta.strengthCount > 0 ? "sessions" : null} />
                    <DomainStat IconComp={Apple}    label="飲食" value={meta.nutritionDays > 0 ? meta.nutritionDays : '—'} unit={meta.nutritionDays > 0 ? "days" : null} />
                    <DomainStat IconComp={Users}    label="社群" value={meta.socialPosts > 0 ? meta.socialPosts : '—'} unit={meta.socialPosts > 0 ? "posts" : null} />
                </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-white/55 border border-black/5 rounded-[28px] p-7 mb-5 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 mb-5 pb-4 border-b border-black/8">
                    <TrendingUp size={12} style={{ color: P.coral }} />
                    <span className="text-[12px] font-bold tracking-[0.04em]">運動分析</span>
                </div>
                <p className="text-[13px] leading-[1.78] text-black/58 font-medium">{p.analysis}</p>
            </div>

            {/* Training Blueprint */}
            <div className="bg-white/55 border border-black/5 rounded-[28px] p-7 mb-5 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-black/8">
                    <Target size={12} style={{ color: P.coral }} />
                    <span className="text-[12px] font-bold tracking-[0.04em]">訓練方向</span>
                </div>

                {/* Running recommendations — 🩹 改為真實數據生成：
                    之前用人格靜態清單，會冒出「越野跑月度挑戰」這種與使用者紀錄無關的假建議。
                    現在每一條都引用 meta 的真實指標（跑量/配速穩定度/心率區間/時長），可溯源。 */}
                <div className="mb-5">
                    <div className="flex items-center gap-1.5 mb-3">
                        <Activity size={9} className="opacity-30" />
                        <span className="text-[12px] font-black tracking-[0.04em] opacity-30">跑步 · Running</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {(() => {
                            if (!meta.sessionsCount) {
                                return ['完成第一次跑步 — 建立配速與心率基準', '從 20–30 分鐘輕鬆跑開始'];
                            }
                            const items = [];
                            if (meta.avgDistance > 0) items.push(`週跑量漸增 ≤10%（現平均單次 ${Number(meta.avgDistance).toFixed(1)} km）`);
                            items.push(
                                meta.paceStability >= 80
                                    ? `配速控制很穩（${meta.paceStability}%）— 改攻距離`
                                    : `配速穩定度訓練（現 ${meta.paceStability}%）`
                            );
                            if (meta.zone2Pct >= 50) items.push(`Zone 2 底子厚（${meta.zone2Pct}%）— 每月加 1 次節奏跑`);
                            else if (meta.anaerobicPct >= 30) items.push(`高強度佔 ${meta.anaerobicPct}% — 補足 Zone 2 有氧底層`);
                            else items.push(`主區間 ${meta.dominantZone} — 用 80/20 配比訓練`);
                            items.push(
                                meta.avgDurationMin >= 45
                                    ? `長跑基礎已建立（均 ${Math.round(meta.avgDurationMin)} 分）— 逐步拉長`
                                    : `拉長單次時間（現均 ${Math.round(meta.avgDurationMin)} 分 → 目標 45 分）`
                            );
                            return items.slice(0, 4);
                        })().map((item, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 rounded-[18px] bg-black/3">
                                <span className="text-[11px] font-black opacity-18 tabular-nums mt-0.5 shrink-0">
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <span className="text-[11px] font-bold leading-snug">{item}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-black/22 font-medium mt-2 leading-relaxed">
                        每一條都由你的真實訓練紀錄計算生成（跑量 / 配速穩定度 / 心率區間 / 時長）。
                    </p>
                </div>

                {/* Strength recommendations — adaptive based on actual strength data */}
                <div>
                    <div className="flex items-center gap-1.5 mb-3">
                        <Dumbbell size={9} className="opacity-30" />
                        <span className="text-[12px] font-black tracking-[0.04em] opacity-30">重訓 · Strength</span>
                    </div>
                    {meta.strengthCount > 0 ? (
                        // User HAS strength data — show progressive overload recs
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                meta.avgRPE > 0 && meta.avgRPE < 7
                                    ? `提高強度 (目前RPE ${meta.avgRPE})`
                                    : meta.avgRPE >= 9
                                        ? '安排降負荷週 (RPE過高)'
                                        : '維持現有強度區間',
                                meta.strengthCompletion < 80
                                    ? `提升完成率 (現 ${meta.strengthCompletion}%)`
                                    : '穩定完成率基礎已好',
                                (meta.strengthCount / Math.max(1, meta.sessionsCount)) < 0.4
                                    ? '增加重訓頻率 (每週2次)'
                                    : '持續跑/重訓雙軌並行',
                                '核心穩定性訓練（跑步輔助）',
                            ].filter(Boolean).map((item, i) => (
                                <div key={i} className="flex items-start gap-2 p-3 rounded-[18px] bg-black/3">
                                    <span className="text-[11px] font-black opacity-18 tabular-nums mt-0.5 shrink-0">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className="text-[11px] font-bold leading-snug">{item}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        // User has NO strength data — entry-level recommendations
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                '每週2次全身性重訓',
                                '深蹲・硬舉・推胸三大項',
                                '核心訓練強化跑步效率',
                                '肌力訓練提升跑步經濟性',
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2 p-3 rounded-[18px]"
                                    style={{ backgroundColor: `${p.cardColor}10`, border: `1px dashed ${p.cardColor}30` }}>
                                    <span className="text-[11px] font-black tabular-nums mt-0.5 shrink-0"
                                        style={{ color: p.cardColor, opacity: 0.5 }}>
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <div>
                                        <span className="text-[11px] font-bold leading-snug block">{item}</span>
                                        {i === 0 && <span className="text-[11px] opacity-30 font-medium">建議開始加入</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Compatibility */}
            <div className="bg-white/55 border border-black/5 rounded-[28px] p-7 mb-8 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 mb-5 pb-4 border-b border-black/8">
                    <Users size={12} style={{ color: P.coral }} />
                    <span className="text-[12px] font-bold tracking-[0.04em]">適合一起練的人</span>
                </div>
                <p className="text-[12px] text-black/25 font-medium mb-4 tracking-widest">
                    與以下類型搭檔訓練，效果最佳
                </p>
                <div className="flex gap-3">
                    {p.compatible.map(compKey => {
                        const ct = TYPES[compKey];
                        if (!ct) return null;
                        return (
                            <div key={compKey} className="flex-1 rounded-[24px] p-4 flex flex-col gap-1"
                                style={{ backgroundColor: ct.cardColor }}>
                                <span className="text-[12px] font-bold"
                                    style={{ color: ct.textColor, opacity: 0.42 }}>{ct.code}</span>
                                <span className="text-[16px] font-black leading-tight" style={{ color: ct.textColor }}>
                                    {ct.title}
                                </span>
                                <span className="text-[12px] font-bold uppercase tracking-widest"
                                    style={{ color: ct.textColor, opacity: 0.38 }}>{ct.category}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="grid grid-cols-2 gap-4 text-[12px] font-bold pt-5 border-t border-black/10">
                <div className="flex flex-col gap-1.5">
                    <span className="opacity-20">Algorithm v3.1 · Real Data</span>
                    <span className="opacity-55">© 2026 DRVN LAB</span>
                </div>
                <div className="flex flex-col gap-1.5 items-end">
                    <span className="opacity-20">狀態</span>
                    <span className="text-emerald-600">已分析</span>
                </div>
            </div>
        </div>
    );
};

export default PersonalityViewMobile;
