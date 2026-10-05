import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { epleyE1RM } from '../utils/strengthMath';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BarChart3, TrendingUp, Flame, Calendar, Award, Target, AlertTriangle, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../utils/auth';
import {
    ComposedChart, AreaChart, Line, Area, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { getMuscleRecoveryScores, getMuscleRecoveryDetails } from '../utils/muscleRecoveryTracker';
import MobileNavigation from './MobileNavigation';
import { uStorage } from '../utils/userStorage';
import { toLocalDateKey } from '../utils/localDate';

// ═══ Loewe Design System ═══════════════════════════════════════════════════════
const P = {
    truffle: '#262523', suede: '#33302C', caramel: '#C68E5D', sand: '#E0D8D3',
    sage: '#8F9E8B', dustyBlue: '#7B8D93', clay: '#D6C6B9', khaki: '#9C8C74',
    brass: '#B38B59', rose: '#C4837A',
};

// ═══ Helpers ════════════════════════════════════════════════════════════════════
/* 🔢 原本夾 15 且取整，趨勢頁夾 12 且留小數 —— 同一組兩個數字。
   實作收斂到 utils/strengthMath（夾 12、小數一位）。 */
const calculate1RM = epleyE1RM;

// 🩹 本地日期字串（修正 toISOString 的 UTC 偏移：台灣凌晨的紀錄會錯位到前一天）
const localDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MUSCLE_CN = { chest: '胸肌', back: '背肌', shoulders: '肩膀', arms: '手臂', core: '核心', legs: '腿部' };
const MUSCLE_IDEAL_FREQ = { chest: 2, back: 2, shoulders: 2, arms: 2, core: 3, legs: 2 };

const COMPOUND_EXERCISES = {
    squat: { name: '深蹲', keywords: ['squat', '深蹲', '蹲'], color: '#F95C4B', icon: '🏋️' },
    deadlift: { name: '硬舉', keywords: ['deadlift', '硬舉', '硬举'], color: '#BD00FF', icon: '💪' },
    bench: { name: '臥推', keywords: ['bench', '臥推', '卧推', '推胸'], color: '#39FF14', icon: '🔥' },
    overhead: { name: '肩推', keywords: ['overhead', 'shoulder press', '肩推', '推举', '推舉'], color: '#00F5FF', icon: '⚡' },
    row: { name: '划船', keywords: ['row', '划船', '劃船'], color: P.caramel, icon: '🚣' },
    pullup: { name: '引體向上', keywords: ['pull-up', 'pullup', '引體', '引体', 'chin'], color: P.sage, icon: '🧗' },
};

const matchCompound = (name) => {
    if (!name) return null;
    const lower = name.toLowerCase();
    for (const [key, ex] of Object.entries(COMPOUND_EXERCISES)) {
        if (ex.keywords.some(kw => lower.includes(kw.toLowerCase()))) return key;
    }
    return null;
};

// ═══ Shared Tooltip ═════════════════════════════════════════════════════════════
const LuxuryTooltip = ({ active, payload, label, formatter }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: P.truffle, border: `1px solid ${P.caramel}40`, padding: '10px 14px', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: "var(--font-display)", color: P.sand, fontSize: 12, margin: '0 0 6px' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color || P.caramel, fontSize: 11, fontWeight: 600, margin: '2px 0' }}>
                    {p.name}: {formatter ? formatter(p.value, p.name) : p.value}
                </p>
            ))}
        </div>
    );
};

// ═══ Section Wrapper ════════════════════════════════════════════════════════════
const Section = ({ icon: Icon, title, subtitle, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ background: P.suede, borderRadius: 18, boxShadow: '0 6px 24px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.03)', overflow: 'hidden' }}>
            <motion.button {...pressProps('row')} onClick={() => setOpen(!open)} style={{ width: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={16} color={P.caramel} />
                    <div style={{ textAlign: 'left' }}>
                        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, color: P.sand, margin: 0 }}>{title}</h2>
                        {subtitle && <p style={{ fontSize: 9, color: P.sand, opacity: 0.4, margin: '2px 0 0', letterSpacing: 1.5, textTransform: 'uppercase' }}>{subtitle}</p>}
                    </div>
                </div>
                {open ? <ChevronUp size={16} color={P.sand} style={{ opacity: 0.3 }} /> : <ChevronDown size={16} color={P.sand} style={{ opacity: 0.3 }} />}
            </motion.button>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${P.sand}10` }}>{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ═══ Stat Pill ══════════════════════════════════════════════════════════════════
const StatPill = ({ label, value, unit, color = P.caramel }) => (
    <div style={{ background: P.truffle, border: `1px solid ${P.sand}08`, borderRadius: 12, padding: '14px 16px', flex: 1 }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: P.sand, opacity: 0.4, letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 6px' }}>{label}</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color }}>{value}</span>
            {unit && <span style={{ fontSize: 11, color: P.sand, opacity: 0.4, fontWeight: 600 }}>{unit}</span>}
        </div>
    </div>
);

// ═══ Main Component ═════════════════════════════════════════════════════════════
const TrainingLogPageMobile = ({ userId: propsUserId }) => {
    const navigate = useNavigate();
    const userId = propsUserId || getUserId();
    const [timeRange, setTimeRange] = useState('week');
    const [selectedExercise, setSelectedExercise] = useState(null);

    // ── Load all training data ──
    const allRecords = useMemo(() => {
        try {
            const records = uStorage(userId).get('trainingRecords', {});
            if (!records || Object.keys(records).length === 0) return [];
            // 舊／壞紀錄防呆：date 可能是 null／時間戳數字（.slice 會崩）、volume 可能是字串（加總變字串串接）
            //  → 一律正規化成字串日期 + 數字，日期解析不出來的直接略過
            return Object.entries(records)
                .filter(([, data]) => data && typeof data === 'object')
                .map(([key, data]) => {
                    const rawDate = data.date ?? data.timestamp ?? key;
                    const d = new Date(typeof rawDate === 'number' ? rawDate : String(rawDate));
                    if (Number.isNaN(d.getTime())) return null;
                    const date = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate : toLocalDateKey(d);
                    const volume = Number(data.volume);
                    const intensity = Number(data.intensity);
                    return {
                        ...data,
                        date,
                        volume: Number.isFinite(volume) ? volume : 0,
                        intensity: Number.isFinite(intensity) ? intensity : 0,
                        muscles: Array.isArray(data.muscles) ? data.muscles : [],
                    };
                })
                .filter(Boolean)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch { return []; }
    }, [userId]);

    const filteredRecords = useMemo(() => {
        if (allRecords.length === 0) return [];
        const now = new Date();
        const cutoff = new Date();
        if (timeRange === 'week') cutoff.setDate(now.getDate() - 7);
        else if (timeRange === 'month') cutoff.setDate(now.getDate() - 30);
        else cutoff.setFullYear(2000);
        return allRecords.filter(r => new Date(r.date) >= cutoff);
    }, [allRecords, timeRange]);

    const inbodyHistory = useMemo(() => {
        try {
            const local = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
            return local.sort((a, b) => new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date));
        } catch { return []; }
    }, [userId]);

    // ══ 1. Volume Trend ══
    const volumeTrend = useMemo(() => filteredRecords.map(r => ({
        date: r.date.slice(5),
        volume: Math.round(r.volume || 0),
        intensity: Math.round(r.intensity || 0),
    })), [filteredRecords]);

    const weeklyVolume = useMemo(() => {
        if (timeRange === 'week') return [];
        const weeks = {};
        filteredRecords.forEach(r => {
            const d = new Date(r.date);
            const ws = new Date(d);
            ws.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // 週一為始，與課表一致
            const key = ws.toISOString().slice(5, 10);
            if (!weeks[key]) weeks[key] = { date: `W${key}`, volume: 0, sessions: 0 };
            weeks[key].volume += r.volume || 0;
            weeks[key].sessions += 1;
        });
        return Object.values(weeks);
    }, [filteredRecords, timeRange]);

    const volumeStats = useMemo(() => {
        if (filteredRecords.length === 0) return { total: 0, avg: 0, growth: 0, sessions: 0 };
        const volumes = filteredRecords.map(r => r.volume || 0);
        const total = Math.round(volumes.reduce((a, b) => a + b, 0));
        const avg = Math.round(total / volumes.length);
        // 🩹 成長率改「滾動平均」：近 3 次平均 vs 之前 3 次平均。
        //    舊版拿首尾兩個單點比較，一次輕量日就會讓成長率劇烈跳動、失真。
        const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
        let growth = 0;
        if (volumes.length >= 4) {
            const recent = mean(volumes.slice(-3));
            const baseline = mean(volumes.slice(Math.max(0, volumes.length - 6), volumes.length - 3));
            growth = baseline > 0 ? Math.round(((recent - baseline) / baseline) * 100) : 0;
        } else {
            const first = volumes[0] || 1;
            const last = volumes[volumes.length - 1] || 0;
            growth = Math.round(((last - first) / first) * 100);
        }
        return { total, avg, growth, sessions: filteredRecords.length };
    }, [filteredRecords]);

    // ══ 2. Muscle Frequency ══
    const muscleFrequency = useMemo(() => {
        const counts = {};
        const weekCount = Math.max(1, timeRange === 'week' ? 1 : timeRange === 'month' ? 4 : Math.ceil(filteredRecords.length / 7));
        filteredRecords.forEach(r => { (r.muscles || []).forEach(m => { counts[m] = (counts[m] || 0) + 1; }); });
        return Object.keys(MUSCLE_CN).map(key => {
            const total = counts[key] || 0;
            const perWeek = +(total / weekCount).toFixed(1);
            const ideal = MUSCLE_IDEAL_FREQ[key];
            let status = 'ok';
            if (perWeek < ideal * 0.5) status = 'low';
            else if (perWeek > ideal * 1.8) status = 'high';
            return { key, name: MUSCLE_CN[key], total, perWeek, ideal, status };
        });
    }, [filteredRecords, timeRange]);

    const radarData = useMemo(() => muscleFrequency.map(m => ({
        subject: m.name,
        actual: m.total,
        fullMark: Math.max(...muscleFrequency.map(x => x.total), 1) * 1.2,
    })), [muscleFrequency]);

    // ══ 3. 1RM ══
    const oneRMData = useMemo(() => {
        const byExercise = {};
        allRecords.forEach(r => {
            (Array.isArray(r.exercises) ? r.exercises : []).forEach(ex => {
                if (!ex) return;
                const name = ex.name || ex.exercise_name;
                const compKey = matchCompound(name);
                if (!compKey) return;
                // 舊格式 sets 是組數（3 或 "3"），不是陣列 → 字串會讓 .forEach 崩潰，先確認是陣列
                const allSets = Array.isArray(ex.detailedSets) ? ex.detailedSets : Array.isArray(ex.sets) ? ex.sets : [];
                if (!allSets.length) return;
                let maxRM = 0;
                allSets.forEach(s => {
                    if (!s || typeof s !== 'object') return;
                    const w = parseFloat(s.weight) || 0;
                    const rp = parseInt(s.reps) || 0;
                    if (w && rp) maxRM = Math.max(maxRM, calculate1RM(w, rp));
                });
                if (maxRM > 0) {
                    if (!byExercise[compKey]) byExercise[compKey] = [];
                    byExercise[compKey].push({ date: r.date.slice(5), estimatedOneRM: maxRM });
                }
            });
        });
        return byExercise;
    }, [allRecords]);

    const availableExercises = useMemo(() => Object.keys(oneRMData).filter(k => oneRMData[k].length > 0), [oneRMData]);

    useEffect(() => {
        if (availableExercises.length > 0 && !availableExercises.includes(selectedExercise)) {
            setSelectedExercise(availableExercises[0]);
        }
    }, [availableExercises]);

    const currentRMProgress = useMemo(() => {
        if (!selectedExercise || !oneRMData[selectedExercise]?.length) return null;
        const data = oneRMData[selectedExercise];
        const first = data[0].estimatedOneRM;
        const last = data[data.length - 1].estimatedOneRM;
        const best = Math.max(...data.map(d => d.estimatedOneRM));
        const improvement = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
        return { first, last, best, improvement };
    }, [selectedExercise, oneRMData]);

    // ══ 4. Fatigue & Recovery ══
    const recoveryScores = useMemo(() => getMuscleRecoveryScores(userId), [userId]);
    const recoveryDetails = useMemo(() => getMuscleRecoveryDetails(userId), [userId]);

    const trainingLoad = useMemo(() => {
        const now = new Date();
        const last7  = allRecords.filter(r => (now - new Date(r.date)) / 86400000 <= 7);
        const last28 = allRecords.filter(r => (now - new Date(r.date)) / 86400000 <= 28);
        const older  = allRecords.filter(r => { const d = (now - new Date(r.date)) / 86400000; return d > 7 && d <= 28; });
        // Require at least some data older than 7 days for a meaningful baseline
        if (older.length === 0 || last28.length === 0) {
            return { acute: 0, chronic: 0, ratio: '—', zone: 'insufficient' };
        }
        const acute   = last7.reduce((s, r) => s + (r.volume || 0), 0) / 7;
        const chronic = last28.reduce((s, r) => s + (r.volume || 0), 0) / 28;
        const ratio   = chronic > 0 ? +(acute / chronic).toFixed(2) : 0;
        let zone = 'optimal';
        if (ratio > 1.5) zone = 'danger';
        else if (ratio > 1.3) zone = 'warning';
        else if (ratio < 0.8 && ratio > 0) zone = 'detraining';
        return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, zone };
    }, [allRecords]);

    const inbodyTrend = useMemo(() => {
        if (inbodyHistory.length < 2) return null;
        const latest = inbodyHistory[0];
        const prev = inbodyHistory[1];
        return {
            weightChange: latest.weight_kg && prev.weight_kg ? +(latest.weight_kg - prev.weight_kg).toFixed(1) : null,
            muscleChange: latest.skeletal_muscle_mass && prev.skeletal_muscle_mass ? +(latest.skeletal_muscle_mass - prev.skeletal_muscle_mass).toFixed(1) : null,
            fatChange: latest.body_fat_percent && prev.body_fat_percent ? +(latest.body_fat_percent - prev.body_fat_percent).toFixed(1) : null,
        };
    }, [inbodyHistory]);

    const isEmpty = allRecords.length === 0;

    const acwrZoneColor = trainingLoad.zone === 'optimal' ? P.sage : trainingLoad.zone === 'danger' ? '#F95C4B' : trainingLoad.zone === 'warning' ? P.caramel : trainingLoad.zone === 'insufficient' ? P.dustyBlue : P.dustyBlue;
    const acwrZoneLabel = { optimal: '最佳區間', danger: '過度負荷', warning: '注意負荷', detraining: '訓練不足', insufficient: '資料不足' }[trainingLoad.zone] || '資料不足';

    return (
        <div style={{ minHeight: '100dvh', background: P.truffle, color: P.sand, fontFamily: 'system-ui,sans-serif', maxWidth: 430, margin: '0 auto', paddingBottom: 120 }}>

            {/* ── Header ── */}
            <header style={{ position: 'sticky', top: 0, zIndex: 50, background: `${P.truffle}EE`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${P.sand}0A` }}>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <motion.button {...pressProps('row')} onClick={() => navigate(-1)} style={{ width: 40, height: 40, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <ArrowLeft size={22} color={P.sand} />
                    </motion.button>
                    <div style={{ textAlign: 'center' }}>
                        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: P.sand, margin: 0 }}>訓練分析</h1>
                        <p style={{ fontSize: 9, letterSpacing: 2, color: P.caramel, margin: '2px 0 0', textTransform: 'uppercase', fontWeight: 700 }}>Analytics</p>
                    </div>
                    <div style={{ width: 40 }} />
                </div>
            </header>

            <main style={{ padding: '20px 16px' }}>
                {/* ── Time Range Toggle ── */}
                <div style={{ display: 'flex', background: P.suede, borderRadius: 12, padding: 3, marginBottom: 20, border: `1px solid ${P.sand}08` }}>
                    {[{ k: 'week', l: '7日' }, { k: 'month', l: '30日' }, { k: 'all', l: '全部' }].map(t => (
                        <motion.button {...pressProps('row')} key={t.k} onClick={() => setTimeRange(t.k)} style={{
 flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
 fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: 1,
 background: timeRange === t.k ? P.caramel : 'transparent',
 color: timeRange === t.k ? P.truffle : `${P.sand}80`,
 transition: 'all .2s',
 }}>{t.l}</motion.button>
                    ))}
                </div>

                {isEmpty ? (
                    /* 第一次的邀請放在畫面正中央，不要縮在最上面 */
                    <div style={{ minHeight: 'calc(100dvh - 300px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ background: P.suede, borderRadius: 18, padding: 48, textAlign: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 28, background: `${P.caramel}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <BarChart3 size={28} color={P.caramel} />
                        </div>
                        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: P.sand, margin: '0 0 8px' }}>尚無訓練數據</h2>
                        <p style={{ fontSize: 13, color: `${P.sand}60`, margin: 0 }}>完成第一次訓練後數據將自動顯示</p>
                        <motion.button {...pressProps('row')} onClick={() => navigate('/training-record-mobile')}
 style={{ marginTop: 20, padding: '12px 28px', borderRadius: 24, border: 'none', background: P.caramel, color: P.truffle, fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <Dumbbell size={16} /> 開始記錄
                        </motion.button>
                    </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* ── Overview Stat Pills ── */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <StatPill label="總訓練量" value={volumeStats.total.toLocaleString()} unit="kg" />
                            <StatPill label="訓練次數" value={volumeStats.sessions} unit="次" color={P.sage} />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <StatPill label="平均訓練量" value={volumeStats.avg.toLocaleString()} unit="kg/次" color={P.dustyBlue} />
                            <StatPill label="成長率" value={`${volumeStats.growth >= 0 ? '+' : ''}${volumeStats.growth}`} unit="%" color={volumeStats.growth >= 0 ? P.sage : P.rose} />
                        </div>

                        {/* ══ 1. Volume Trend ══ */}
                        <Section icon={TrendingUp} title="訓練量趨勢" subtitle="Volume & Intensity">
                            <div style={{ height: 220, marginTop: 16 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={timeRange === 'week' ? volumeTrend : weeklyVolume.length > 0 ? weeklyVolume : volumeTrend}>
                                        <defs>
                                            <linearGradient id="gVol" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={P.caramel} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={P.caramel} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={P.sand} strokeOpacity={0.05} vertical={false} />
                                        <XAxis dataKey="date" stroke={P.sand} strokeOpacity={0.3} tick={{ fill: P.sand, opacity: 0.4, fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis stroke={P.sand} strokeOpacity={0.2} tick={{ fill: P.sand, opacity: 0.3, fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<LuxuryTooltip formatter={(v, n) => n === 'intensity' ? `${v}%` : `${v} kg`} />} />
                                        <Area type="monotone" dataKey="volume" name="訓練量" stroke={P.caramel} strokeWidth={2} fill="url(#gVol)" />
                                        {timeRange === 'week' && (
                                            <Line type="monotone" dataKey="intensity" name="強度" stroke={P.sage} strokeWidth={2} dot={{ r: 3, fill: P.truffle, stroke: P.sage, strokeWidth: 2 }} />
                                        )}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            {timeRange === 'week' && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 10 }}>
                                    <span style={{ fontSize: 11, color: P.caramel, fontWeight: 600 }}>━ 訓練量 (kg)</span>
                                    <span style={{ fontSize: 11, color: P.sage, fontWeight: 600 }}>━ 強度 (%)</span>
                                </div>
                            )}
                        </Section>

                        {/* ══ 2. Muscle Frequency ══ */}
                        <Section icon={Target} title="肌群訓練頻率" subtitle="Muscle Balance">
                            <div style={{ height: 220, marginTop: 12 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                                        <PolarGrid stroke={P.sand} strokeOpacity={0.08} />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: P.sand, opacity: 0.6, fontSize: 11 }} />
                                        <PolarRadiusAxis tick={false} axisLine={false} />
                                        <Radar name="次數" dataKey="actual" stroke={P.dustyBlue} strokeWidth={2} fill={P.dustyBlue} fillOpacity={0.25} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                {muscleFrequency.map(m => (
                                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${P.sand}08` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {m.status === 'low' && <AlertTriangle size={12} color={P.rose} />}
                                            {m.status === 'high' && <Flame size={12} color="#F95C4B" />}
                                            <span style={{ fontSize: 13, fontWeight: 600, color: P.sand }}>{m.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: m.status === 'ok' ? P.sage : m.status === 'low' ? P.rose : '#F95C4B' }}>
                                                {m.perWeek}次/週
                                            </span>
                                            <span style={{ fontSize: 11, color: `${P.sand}50` }}>建議 {m.ideal}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {muscleFrequency.some(m => m.status !== 'ok') && (
                                <div style={{ marginTop: 12, padding: '10px 14px', background: P.truffle, borderRadius: 12, borderLeft: `3px solid ${P.caramel}` }}>
                                    {muscleFrequency.filter(m => m.status === 'low').map(m => (
                                        <p key={m.key} style={{ fontSize: 11, color: P.rose, margin: '4px 0', fontWeight: 600 }}>
                                            ⚠️ {m.name} 頻率偏低（{m.perWeek}次/週），建議增至每週 {m.ideal} 次
                                        </p>
                                    ))}
                                    {muscleFrequency.filter(m => m.status === 'high').map(m => (
                                        <p key={m.key} style={{ fontSize: 11, color: '#F95C4B', margin: '4px 0', fontWeight: 600 }}>
                                            🔥 {m.name} 可能過度訓練（{m.perWeek}次/週），注意恢復
                                        </p>
                                    ))}
                                </div>
                            )}
                        </Section>

                        {/* ══ 3. 1RM ══ */}
                        <Section icon={Award} title="最大肌力追蹤" subtitle="1RM Estimation">
                            {availableExercises.length > 0 ? (
                                <>
                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginTop: 12 }}>
                                        {availableExercises.map(k => {
                                            const ex = COMPOUND_EXERCISES[k];
                                            const sel = selectedExercise === k;
                                            return (
                                                <motion.button {...pressProps('row')} key={k} onClick={() => setSelectedExercise(k)} style={{
 display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12,
 border: `2px solid ${sel ? ex.color : `${P.sand}15`}`,
 background: sel ? `${ex.color}18` : 'transparent',
 color: sel ? ex.color : `${P.sand}80`,
 fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
 }}>
                                                    <span>{ex.icon}</span> {ex.name}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                    {currentRMProgress && (
                                        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                                            <StatPill label="起始" value={currentRMProgress.first} unit="kg" color={P.dustyBlue} />
                                            <StatPill label="目前" value={currentRMProgress.last} unit="kg" color={COMPOUND_EXERCISES[selectedExercise]?.color || P.caramel} />
                                            <StatPill label="最佳" value={currentRMProgress.best} unit="kg" color={P.sage} />
                                        </div>
                                    )}
                                    <div style={{ height: 200, marginTop: 12 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={oneRMData[selectedExercise] || []}>
                                                <defs>
                                                    <linearGradient id="g1rm" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={COMPOUND_EXERCISES[selectedExercise]?.color || P.caramel} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={COMPOUND_EXERCISES[selectedExercise]?.color || P.caramel} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke={P.sand} strokeOpacity={0.05} vertical={false} />
                                                <XAxis dataKey="date" stroke={P.sand} strokeOpacity={0.2} tick={{ fill: P.sand, opacity: 0.4, fontSize: 11 }} axisLine={false} tickLine={false} />
                                                <YAxis stroke={P.sand} strokeOpacity={0.2} tick={{ fill: P.sand, opacity: 0.3, fontSize: 11 }} axisLine={false} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                                                <Tooltip content={<LuxuryTooltip formatter={v => `${v} kg`} />} />
                                                <Area type="monotone" dataKey="estimatedOneRM" name="1RM" stroke={COMPOUND_EXERCISES[selectedExercise]?.color || P.caramel} strokeWidth={2.5} fill="url(#g1rm)" dot={{ r: 4, fill: P.truffle, stroke: COMPOUND_EXERCISES[selectedExercise]?.color || P.caramel, strokeWidth: 2 }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <p style={{ fontSize: 11, color: `${P.sand}40`, textAlign: 'center', marginTop: 8 }}>
                                        Epley 公式: 1RM = 重量 × (1 + 次數/30)
                                    </p>
                                </>
                            ) : (
                                <div style={{ padding: 32, textAlign: 'center' }}>
                                    <p style={{ fontSize: 13, color: `${P.sand}60` }}>記錄複合動作的重量與次數後，將自動估算 1RM</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12 }}>
                                        {Object.values(COMPOUND_EXERCISES).map((ex, i) => (
                                            <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: `${P.sand}08`, color: `${P.sand}80` }}>{ex.icon} {ex.name}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Section>

                        {/* ══ 4. Fatigue & Recovery ══ */}
                        <Section icon={Heart} title="疲勞與恢復" subtitle="Recovery & Load Management">
                            {/* ACWR ratio block */}
                            <div style={{ marginTop: 12, padding: 16, background: P.truffle, borderRadius: 12, border: `1px solid ${P.sand}08` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: `${P.sand}60`, letterSpacing: 1.5, }}>急慢性負荷比 ACWR</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: `${acwrZoneColor}20`, color: acwrZoneColor }}>{acwrZoneLabel}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontFamily: "var(--font-display)", fontSize: 36, color: acwrZoneColor }}>{trainingLoad.ratio}</span>
                                    <span style={{ fontSize: 11, color: `${P.sand}40` }}>理想 0.8–1.3</span>
                                </div>
                                <div style={{ position: 'relative', height: 8, background: `${P.sand}10`, borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: '32%', width: '20%', height: '100%', background: `${P.sage}30`, borderRadius: 4 }} />
                                    <div style={{ position: 'absolute', left: `${Math.min(Math.max(trainingLoad.ratio / 2 * 100, 0), 100)}%`, width: 4, height: '100%', background: acwrZoneColor, borderRadius: 2, transform: 'translateX(-2px)' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                    <div><p style={{ fontSize: 11, color: `${P.sand}40`, margin: '0 0 2px' }}>7日均量</p><p style={{ fontSize: 14, fontWeight: 700, color: P.sand, margin: 0 }}>{trainingLoad.acute} kg</p></div>
                                    <div style={{ textAlign: 'right' }}><p style={{ fontSize: 11, color: `${P.sand}40`, margin: '0 0 2px' }}>28日均量</p><p style={{ fontSize: 14, fontWeight: 700, color: P.sand, margin: 0 }}>{trainingLoad.chronic} kg</p></div>
                                </div>
                            </div>

                            {/* Muscle recovery grid */}
                            <div style={{ marginTop: 16 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: `${P.sand}40`, letterSpacing: 1.5, marginBottom: 10 }}>各肌群恢復狀態</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {Object.entries(recoveryDetails).map(([muscle, detail]) => {
                                        const pct = Math.round(detail.score);
                                        const barColor = pct >= 80 ? P.sage : pct >= 50 ? P.caramel : P.rose;
                                        return (
                                            <div key={muscle} style={{ padding: '10px 12px', background: P.truffle, borderRadius: 12, border: `1px solid ${P.sand}08` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: P.sand }}>{MUSCLE_CN[muscle] || muscle}</span>
                                                    <span style={{ fontSize: 11, fontWeight: 800, color: barColor }}>{pct}%</span>
                                                </div>
                                                <div style={{ height: 4, background: `${P.sand}10`, borderRadius: 2, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width .5s' }} />
                                                </div>
                                                {detail.lastTraining && (
                                                    <p style={{ fontSize: 11, color: `${P.sand}35`, marginTop: 4 }}>
                                                        上次: {new Date(detail.lastTraining).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* InBody */}
                            {inbodyTrend && (
                                <div style={{ marginTop: 16, padding: 14, background: P.truffle, borderRadius: 12, border: `1px solid ${P.caramel}20` }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: P.caramel, letterSpacing: 1.5, marginBottom: 10 }}>InBody 體態變化</p>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        {inbodyTrend.weightChange !== null && (
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <p style={{ fontSize: 11, color: `${P.sand}40`, marginBottom: 4 }}>體重</p>
                                                <p style={{ fontSize: 16, fontWeight: 800, color: inbodyTrend.weightChange <= 0 ? P.sage : P.rose, margin: 0 }}>{inbodyTrend.weightChange > 0 ? '+' : ''}{inbodyTrend.weightChange} kg</p>
                                            </div>
                                        )}
                                        {inbodyTrend.muscleChange !== null && (
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <p style={{ fontSize: 11, color: `${P.sand}40`, marginBottom: 4 }}>肌肉</p>
                                                <p style={{ fontSize: 16, fontWeight: 800, color: inbodyTrend.muscleChange >= 0 ? P.sage : P.rose, margin: 0 }}>{inbodyTrend.muscleChange > 0 ? '+' : ''}{inbodyTrend.muscleChange} kg</p>
                                            </div>
                                        )}
                                        {inbodyTrend.fatChange !== null && (
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <p style={{ fontSize: 11, color: `${P.sand}40`, marginBottom: 4 }}>體脂</p>
                                                <p style={{ fontSize: 16, fontWeight: 800, color: inbodyTrend.fatChange <= 0 ? P.sage : P.rose, margin: 0 }}>{inbodyTrend.fatChange > 0 ? '+' : ''}{inbodyTrend.fatChange}%</p>
                                            </div>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 11, color: `${P.sand}30`, marginTop: 8, textAlign: 'center' }}>最近兩次 InBody 量測比較</p>
                                </div>
                            )}
                        </Section>

                        {/* ══ 5. Heatmap (collapsed) ══ */}
                        <Section icon={Calendar} title="訓練一致性" subtitle="28-Day Heatmap" defaultOpen={false}>
                            <div style={{ marginTop: 12 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                                    {['一', '二', '三', '四', '五', '六', '日'].map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontSize: 11, color: `${P.sand}40`, fontWeight: 700, paddingBottom: 4 }}>{d}</div>
                                    ))}
                                    {(() => {
                                        const today = new Date();
                                        const todayStr = localDateKey(today);
                                        return Array.from({ length: 28 }, (_, i) => {
                                            const date = new Date(today);
                                            date.setDate(date.getDate() - (27 - i));
                                            const key = localDateKey(date);
                                            const record = allRecords.find(r => r.date === key);
                                            const intensity = record ? Math.min((record.volume || 0) / 5000, 1) : 0;
                                            return (
                                                <div key={i} style={{
                                                    aspectRatio: '1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 11, fontWeight: 700,
                                                    background: record ? P.caramel : `${P.sand}08`,
                                                    opacity: record ? 0.4 + intensity * 0.6 : 1,
                                                    color: record ? P.truffle : `${P.sand}25`,
                                                    border: key === todayStr ? `2px solid ${P.caramel}` : 'none',
                                                }}>{date.getDate()}</div>
                                            );
                                        });
                                    })()}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: `${P.sand}35` }}>
                                    <span>低強度</span>
                                    <div style={{ display: 'flex', gap: 3 }}>
                                        {[0.4, 0.7, 1].map((o, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: P.caramel, opacity: o }} />)}
                                    </div>
                                    <span>高強度</span>
                                </div>
                            </div>
                        </Section>

                    </div>
                )}
            </main>

            <MobileNavigation />
        </div>
    );
};

export default TrainingLogPageMobile;
