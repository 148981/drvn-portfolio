import React, { useState, useMemo, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { epleyE1RM } from '../utils/strengthMath';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Activity, Zap, Target, Flame, Trophy, Calendar, Utensils,
    TrendingUp, BarChart2, Check, ChevronDown, Info, Shield, Layers
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { getMuscleRecoveryScores, getMuscleRecoveryDetails } from '../utils/muscleRecoveryTracker';
import { calculateFullNutrition, getLatestInBody } from '../utils/NutritionEngine';
import { getUserId } from '../utils/auth';
import { useHealthKit } from '../hooks/useHealthKit';
import { getTodayReadiness, readinessLabel, readinessSourceLine, readinessSignalsLocked } from '../utils/readiness';
import { useMembership } from '../utils/membership';
import MemberLockCard from './MemberLockCard';

/* ═══ Editorial Palette ═══ */
const C = {
    deepBlack: '#161415',
    paper: '#F6F4F1',     // 質感紙張白
    stone: '#E4DED2',     // 深色分隔線用
    coral: '#D94030',     // 標誌性瑞士紅
    ember: '#E05C5C',     // 警示/疲勞紅
    white: '#FFFFFF',
    border: 'rgba(22, 20, 21, 0.12)' // 極細黑灰邊框
};

const MUSCLE_CN = { chest: '胸', back: '背', shoulders: '肩', arms: '臂', core: '核心', legs: '腿' };

/* ═══ Helper Components ═══ */
const EditorialBlock = ({ children, title, gridArea, className = "", style }) => (
    <div
        className={`editorial-block ${className}`}
        style={{
            gridArea,
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            background: C.white,
            ...style
        }}
    >
        <div style={{ marginBottom: 20 }}>
            <span style={{
                fontSize: 9, fontWeight: 900, color: C.deepBlack,
                letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.5
            }}>
                {title}
            </span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
        </div>
    </div>
);

const BrightTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: C.white,
            border: `1px solid ${C.deepBlack}`, // 強烈的純黑細框
            padding: '8px 12px',
            borderRadius: '0px', // 絕對直角 (無圓角)
            boxShadow: '4px 4px 0 rgba(22, 20, 21, 0.05)' // 俐落的硬陰影 (Neo-Brutalism)
        }}>
            <p style={{ fontSize: 9, fontWeight: 900, color: C.deepBlack, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ fontSize: 13, fontWeight: 300, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: p.color || C.coral, margin: 0, lineHeight: 1 }}>
                    {typeof p.value === 'number' ? p.value.toLocaleString() : p.value} <span style={{ fontSize: 11, fontStyle: 'normal', fontWeight: 800 }}>{p.name}</span>
                </p>
            ))}
        </div>
    );
};

const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        
        .editorial-block {
            border-right: 1px solid ${C.border};
            border-bottom: 1px solid ${C.border};
            box-sizing: border-box;
        }
        @media (min-width: 769px) {
            .block-strength { border-right: none !important; }
            .block-nutrition { border-right: none !important; }
            .block-recovery { border-right: none !important; border-bottom: none !important; }
            .block-split { border-bottom: none !important; }
        }
        @media (max-width: 768px) {
            .editorial-grid {
                grid-template-columns: 1fr !important;
                grid-template-areas: none !important;
            }
            .editorial-block {
                grid-area: auto !important;
                border-right: none !important;
                border-bottom: 1px solid ${C.border} !important;
            }
            .block-recovery {
                border-bottom: none !important;
            }
        }
    `}</style>
);

/* ═══ MAIN COMPONENT ═══ */
const TrainingAnalyticsDashboard = ({ onClose, workoutHistory = [], recoveryScore = 85, userId, userProfile }) => {
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [showExercisePicker, setShowExercisePicker] = useState(false);

    // ── Data Fetching Logic ──
    // 合併兩個來源：API workoutHistory prop（優先）+ localStorage trainingRecords（補充）
    const allRecords = useMemo(() => {
        const records = [];
        const seenKeys = new Set();

        // Source 1: workoutHistory prop（來自 API，最完整）
        if (workoutHistory && workoutHistory.length > 0) {
            workoutHistory.forEach(r => {
                const key = r.session_id || r.id || r.date || r.timestamp;
                if (key && !seenKeys.has(key)) {
                    seenKeys.add(key);
                    records.push({
                        ...r,
                        date: r.date || (r.timestamp || '').split('T')[0],
                    });
                }
            });
        }

        // Source 2: localStorage trainingRecords（本地補充，去重）
        try {
            const saved = localStorage.getItem('trainingRecords');
            if (saved) {
                const parsed = JSON.parse(saved);
                const local = Array.isArray(parsed) ? parsed : Object.values(parsed);
                local.forEach(r => {
                    const key = r.session_id || r.id || r.date;
                    if (key && !seenKeys.has(key)) {
                        seenKeys.add(key);
                        records.push(r);
                    }
                });
            }
        } catch (e) { /* ignore */ }

        return records.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));
    }, [workoutHistory]);

    const exerciseList = useMemo(() => {
        const counts = {};
        allRecords.forEach(r => {
            (r.exercises || []).forEach(ex => {
                const n = ex.name || ex.exercise_name;
                if (n) counts[n] = (counts[n] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    }, [allRecords]);

    useEffect(() => {
        if (exerciseList.length > 0 && !selectedExercise) setSelectedExercise(exerciseList[0]);
    }, [exerciseList, selectedExercise]);

    const { metrics } = useHealthKit();

    // ── 1. Readiness & Recovery Logic ──
    /* 準備度全 App 只有一支：utils/readiness 的 getTodayReadiness。
       ⚠️ 以前這裡把 getMuscleRecoveryScores 整包 Object.values 平均 —— 沒練過的肌群算 100、
          連 _tracked 物件都被算進去，再套一組自己的門檻（90/70/50）。
          同一個人在這裡跟首頁會看到不同的數字與不同的狀態字。 */
    const { member } = useMembership();   // 會員狀態一變，準備度重算（睡眠／HRV 是會員才算進去）
    const readyCombined = useMemo(() => getTodayReadiness(userId || getUserId()), [userId, allRecords, member]);
    const readinessLocked = useMemo(() => readinessSignalsLocked(userId || getUserId()), [userId, member]);
    const overallRecovery = readyCombined?.score ?? null;

    const readiness = useMemo(() => {
        if (overallRecovery == null) return { label: '', color: C.deepBlack, tags: [] };
        const label = readinessLabel(overallRecovery);
        const TAGS = { '極佳': ['可以加重'], '良好': ['正常訓練'], '普通': ['降一點強度'], '需休息': ['今天休息'] };
        return { label, color: overallRecovery >= 65 ? C.coral : C.ember, tags: TAGS[label] || [] };
    }, [overallRecovery]);

    // ── 2. Strength Trend (1RM) Logic ──
    const oneRMData = useMemo(() => {
        if (!selectedExercise) return [];
        // 🔢 原本沒有夾 reps 且取整 —— 趨勢圖的數字跟紀錄頁對不起來
        const calculate1RM = epleyE1RM;
        return allRecords.map(r => {
            let max = 0;
            (r.exercises || []).forEach(ex => {
                if ((ex.name || '').toLowerCase() === selectedExercise.toLowerCase()) {
                    (ex.sets || []).forEach(s => {
                        const rm = calculate1RM(parseFloat(s.weight) || 0, parseInt(s.reps) || 0);
                        if (rm > max) max = rm;
                    });
                }
            });
            return max > 0 ? { date: r.date.slice(5), rm: max } : null;
        }).filter(x => x);
    }, [allRecords, selectedExercise]);

    // ── 3. PR Records Logic ──
    const prStats = useMemo(() => {
        const bests = {};
        const last7DaysPRs = [];
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        allRecords.forEach(r => {
            const isRecent = new Date(r.date) >= sevenDaysAgo;
            (r.exercises || []).forEach(ex => {
                const name = ex.name || ex.exercise_name;
                let sessionMax = 0;
                (ex.sets || []).forEach(s => {
                    const weight = parseFloat(s.weight) || 0;
                    if (weight > sessionMax) sessionMax = weight;
                });

                if (sessionMax > 0) {
                    if (!bests[name] || sessionMax > bests[name]) {
                        bests[name] = sessionMax;
                        if (isRecent) last7DaysPRs.push({ name, weight: sessionMax });
                    }
                }
            });
        });
        return { count: last7DaysPRs.length, list: last7DaysPRs };
    }, [allRecords]);

    // ── 4. Training Heatmap Logic ──
    const heatmapData = useMemo(() => {
        const data = [];
        const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        for (let i = 27; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = localDateStr(d); // 用本地日期，避免 toISOString() 的 UTC 偏移讓格子錯一天
            const hasRecord = allRecords.some(r => r.date === dateStr);
            data.push({ date: dateStr, active: hasRecord });
        }
        return data;
    }, [allRecords]);

    // ── 5. Split Ratio (PPL) Logic ──
    const splitData = useMemo(() => {
        const counts = { push: 0, pull: 0, legs: 0, core: 0 };
        allRecords.slice(-10).forEach(r => {
            (r.muscles || []).forEach(m => {
                // 手臂 = 二頭（拉系）+ 三頭（推系），各算一半，避免全數灌進推系造成比例失真
                if (m === 'arms') { counts.push += 0.5; counts.pull += 0.5; return; }
                const category = {
                    chest: 'push', shoulders: 'push', back: 'pull',
                    legs: 'legs', core: 'core'
                }[m];
                if (category) counts[category]++;
            });
        });
        return [
            { name: '推系', value: counts.push, color: C.deepBlack },
            { name: '拉系', value: counts.pull, color: C.pebble },
            { name: '下肢', value: counts.legs, color: C.coral },
            { name: '核心', value: counts.core, color: C.ember },
        ].filter(x => x.value > 0);
    }, [allRecords]);

    // ── 6. Intensity Zones Logic ──
    // 支援兩種資料格式：
    //   A. 巢狀格式（localStorage）: ex.sets = [{weight, reps}, ...]
    //   B. 扁平格式（API）:          ex.reps = 10, ex.sets = 3（次數，非陣列）
    const trainingStimulus = useMemo(() => {
        let highTension = 0, hypertrophy = 0, junkVolume = 0;

        const processSet = (reps, rpe) => {
            if (reps <= 0) return;
            const rpeNum = parseFloat(rpe) || 8; // default to 8 if not provided
            if (rpeNum < 6) {
                junkVolume++;
            } else if (reps <= 5 && rpeNum >= 8) {
                highTension++;
            } else {
                hypertrophy++;
            }
        };

        allRecords.slice(-10).forEach(r => {
            (r.exercises || []).forEach(ex => {
                const setsArr = Array.isArray(ex.sets) ? ex.sets : null;
                if (setsArr && setsArr.length > 0) {
                    setsArr.forEach(s => {
                        processSet(parseInt(s.reps) || 0, s.rpe);
                    });
                } else {
                    const reps = parseInt(ex.reps) || 0;
                    const setCount = parseInt(ex.sets) ||
                        parseInt(ex.set_count) ||
                        parseInt(ex.num_sets) || 1;
                    for (let i = 0; i < setCount; i++) {
                        processSet(reps, 8); // assume RPE 8 for synced completed sets
                    }
                }
            });
        });

        const total = (highTension + hypertrophy + junkVolume) || 1;
        return [
            { name: 'High Tension (高張力)', sub: 'Reps 1–5, RPE 8+', value: Math.round((highTension / total) * 100), color: C.deepBlack },
            { name: 'Hypertrophy (肌肥大)', sub: 'Reps 6+, RPE 6+', value: Math.round((hypertrophy / total) * 100), color: C.coral },
            { name: 'Warm-up / Light', sub: 'RPE < 6', value: Math.round((junkVolume / total) * 100), color: C.stone },
        ];
    }, [allRecords]);

    // ── 7. Effective Volume (Hard Sets) ──
    // 專業教練視角：與其看瞎推的總重量，不如看「達到足夠刺激的有效組數 (RPE >= 7)」
    const hardSetsStats = useMemo(() => {
        const getHardSets = (record) => {
            if (record.hard_sets !== undefined && record.hard_sets !== null && !Number.isNaN(Number(record.hard_sets))) {
                return Number(record.hard_sets);
            }
            let count = 0;
            // 舊資料 fallback 計算
            (record.exercises || []).forEach(ex => {
                const setsArr = Array.isArray(ex.sets) ? ex.sets : null;
                if (setsArr) {
                    setsArr.forEach(s => { if ((parseFloat(s.rpe) || 8) >= 7) count++; });
                } else {
                    const reps = parseInt(ex.reps) || 0;
                    if (reps > 0) count += (parseInt(ex.sets) || parseInt(ex.set_count) || 1) || 0; // 舊資料假設都有好好做
                }
            });
            return count || 0;
        };

        const last7 = allRecords.slice(0, 7);
        const total = Math.round(last7.reduce((s, r) => s + (getHardSets(r) || 0), 0)) || 0;
        const prev7 = allRecords.slice(7, 14);
        const prevTotal = Math.round(prev7.reduce((s, r) => s + (getHardSets(r) || 0), 0)) || 1;
        let diff = Math.round(((total - prevTotal) / prevTotal) * 100);
        if (Number.isNaN(diff)) diff = 0;

        return { total, diff };
    }, [allRecords]);

    const nutritionPlan = useMemo(() => calculateFullNutrition({
        profile: userProfile || {}, inbody: getLatestInBody(userId), userId
    }), [userId, userProfile]);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <FontStyle />
            {/* Backdrop */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(15px)' }} />

            {/* Panel */}
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.95 }}
                style={{
                    background: C.paper, width: '100%', maxWidth: 860, height: '90dvh', borderRadius: 0,
                    overflow: 'hidden', pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
                    border: `1px solid ${C.deepBlack}`, fontFamily: "'Tenor Sans', sans-serif"
                }}
            >
                {/* Header (加上底線) */}
                <div style={{ padding: '40px 32px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <div>
                        <p style={{ fontSize: 9, fontWeight: 900, color: C.coral, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.4em' }}>
                            Athlete Assessment
                        </p>
                        <h2 style={{ fontSize: 42, fontWeight: 300, fontStyle: 'italic', fontFamily: 'var(--font-display)', color: C.deepBlack, margin: 0, lineHeight: 1 }}>
                            Performance
                        </h2>
                    </div>
                    {/* 俐落的關閉按鈕 (無陰影) */}
                    <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{
 background: 'transparent', width: 40, height: 40,
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
 border: `1px solid ${C.border}`, borderRadius: '50%'
 }}>
                        <X size={20} color={C.deepBlack} />
                    </motion.button>
                </div>

                {/* Grid 排版 (無縫網格) */}
                <div className="editorial-grid" style={{
                    flex: 1, overflowY: 'auto',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
                    gridTemplateAreas: `
                        "readiness readiness strength strength"
                        "volume prs strength strength"
                        "heatmap intensity nutrition nutrition"
                        "split recovery recovery recovery"
                    `,
                }}>
                    {/* 1. Readiness (2x1) */}
                    <EditorialBlock title="準備度" gridArea="readiness">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                            {/* 巨大的優雅數字 */}
                            <span style={{ fontSize: overallRecovery == null ? 22 : 80, fontWeight: 300, fontFamily: 'var(--font-display)', color: C.deepBlack, lineHeight: 0.8 }}>
                                {overallRecovery == null ? '練一場就有數字' : overallRecovery}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 900, color: C.coral, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                                {readiness.label}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 14, fontSize: 9, fontWeight: 900, color: C.deepBlack, opacity: 0.6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            {readyCombined && <span>{readinessSourceLine(readyCombined.from)}</span>}
                        </div>
                        {/* 💳 手上有睡眠／HRV 資料，但不是會員 → 只算訓練負荷，這裡放唯一一張會員卡 */}
                        {readinessLocked && (
                            <MemberLockCard feature="readiness" label="加入睡眠與 HRV" style={{ marginTop: 12 }} />
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 20 }}>
                            {readiness.tags.map(t => (
                                <span key={t} style={{ fontSize: 9, fontWeight: 900, color: C.deepBlack, border: `1px solid ${C.deepBlack}`, padding: '4px 12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    {t}
                                </span>
                            ))}
                        </div>
                    </EditorialBlock>

                    {/* 2. Strength Trend (2x2) */}
                    <EditorialBlock title="1RM Strength Trend" gridArea="strength" className="block-strength">
                        <div style={{ position: 'relative', marginBottom: 20 }}>
                            <motion.button {...pressProps('row')} onClick={() => setShowExercisePicker(!showExercisePicker)} style={{
 width: '100%', padding: '12px 16px', borderRadius: 0, border: `1px solid ${C.deepBlack}`,
 background: C.white, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'
 }}>
                                <span style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedExercise || 'Select Exercise'}</span>
                                <ChevronDown size={16} style={{ transform: showExercisePicker ? 'rotate(180deg)' : '' }} />
                            </motion.button>
                            <AnimatePresence>
                                {showExercisePicker && (
                                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                        style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: C.white, borderRadius: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: `1px solid ${C.deepBlack}`, maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                                        {exerciseList.map(ex => (
                                            <div key={ex} onClick={() => { setSelectedExercise(ex); setShowExercisePicker(false); }}
                                                style={{ padding: '12px 16px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', background: selectedExercise === ex ? C.paper : 'transparent', color: C.deepBlack }}>
                                                {ex}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <div style={{ flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            {oneRMData.length === 0 ? (
                                <span style={{ fontSize: 12, fontWeight: 900, color: C.deepBlack, opacity: 0.3, textTransform: 'uppercase', letterSpacing: '0.15em' }}>No Records</span>
                            ) : oneRMData.length === 1 ? (
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ fontSize: 64, fontWeight: 300, fontFamily: 'var(--font-display)', color: C.deepBlack, fontStyle: 'italic' }}>{oneRMData[0].rm}</span>
                                    <span style={{ fontSize: 14, fontWeight: 800, color: C.deepBlack, marginLeft: 4, letterSpacing: '0.1em' }}>KG</span>
                                    <p style={{ fontSize: 9, fontWeight: 800, color: C.deepBlack, opacity: 0.4, margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Add one more record to show trend</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={oneRMData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                        {/* 極簡的十字準線與 Tooltip */}
                                        <Tooltip
                                            content={<BrightTooltip />}
                                            cursor={{ stroke: C.deepBlack, strokeWidth: 1, strokeDasharray: '2 4', opacity: 0.3 }}
                                        />
                                        <Area
                                            type="linear" // 改為 linear (直線連接)，比 monotone (平滑曲線) 更有瑞士排版的硬朗幾何感
                                            dataKey="rm"
                                            stroke={C.coral}
                                            strokeWidth={1.5}
                                            fill="transparent"
                                            activeDot={{ r: 3, fill: C.deepBlack, stroke: C.white, strokeWidth: 1.5 }}
                                            dot={{ r: 2, fill: C.white, stroke: C.coral, strokeWidth: 1.5 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </EditorialBlock>

                    {/* 3. Effective Volume (1x1) */}
                    {/* S&C視角：追蹤高質量的力竭組數，防範垃圾訓練量 */}
                    <EditorialBlock title="Effective Volume" gridArea="volume">
                        <div style={{ marginTop: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 48, fontWeight: 300, fontFamily: 'var(--font-display)', color: C.deepBlack }}>
                                    {hardSetsStats.total}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: C.deepBlack, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                    Hard Sets
                                </span>
                            </div>
                            <p style={{ fontSize: 9, fontWeight: 800, color: C.deepBlack, margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                <span style={{ color: hardSetsStats.diff >= 0 ? C.coral : C.deepBlack }}>
                                    {hardSetsStats.diff >= 0 ? '▲' : '▼'} {Math.abs(hardSetsStats.diff)}%
                                </span>
                                <span style={{ opacity: 0.4 }}> vs Last Week</span>
                            </p>
                        </div>
                    </EditorialBlock>

                    {/* 4. PR Records (1x1) */}
                    <EditorialBlock title="PR Records" gridArea="prs">
                        <div style={{ marginTop: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 48, fontWeight: 300, fontFamily: 'var(--font-display)', color: C.deepBlack }}>
                                    {prStats.count}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: C.deepBlack, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>NEW PR</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                                {prStats.list.slice(0, 2).map((pr, i) => (
                                    <span key={i} style={{ fontSize: 9, fontWeight: 800, color: C.deepBlack, border: `1px solid ${C.border}`, padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {pr.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </EditorialBlock>

                    {/* 5. Frequency (1x1) */}
                    <EditorialBlock title="Frequency" gridArea="heatmap">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 'auto' }}>
                            {heatmapData.map((d, i) => (
                                <div key={i} title={d.date} style={{
                                    aspectRatio: '1/1',
                                    borderRadius: 0,
                                    background: d.active ? C.deepBlack : 'transparent',
                                    border: `1px solid ${C.border}`,
                                    opacity: d.active ? 0.3 + (i / 28) * 0.7 : 1
                                }} />
                            ))}
                        </div>
                        <p style={{ fontSize: 9, fontWeight: 800, color: C.deepBlack, opacity: 0.4, marginTop: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last 4 Weeks</p>
                    </EditorialBlock>

                    {/* 6. Stimulus Profile (1x1) 代替 Rep Ranges */}
                    {/* S&C視角：從單純看次數，升級成看神經與肌肉的刺激分佈 */}
                    <EditorialBlock title="Stimulus Profile" gridArea="intensity">
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {trainingStimulus.map(z => (
                                <div key={z.name}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                        <div>
                                            <span style={{ fontSize: 9, fontWeight: 900, color: C.deepBlack, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {z.name.split(' ')[0]} {/* 只顯示英文，例如 High Tension -> High */}
                                            </span>
                                            <span style={{ fontSize: 11, fontWeight: 800, color: C.deepBlack, opacity: 0.4, marginLeft: 6 }}>{z.sub}</span>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 900, color: C.deepBlack }}>{z.value}%</span>
                                    </div>
                                    <div style={{ height: 2, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${z.value}%`, background: z.color || C.deepBlack, transition: 'width 0.6s ease' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </EditorialBlock>

                    {/* 7. Nutrition (2x1) */}
                    <EditorialBlock title="Nutrition" gridArea="nutrition" className="block-nutrition">
                        <div style={{ display: 'flex', gap: 32, marginTop: 'auto' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, color: C.deepBlack, textTransform: 'uppercase', letterSpacing: '0.1em' }}>TDEE</span>
                                    <div>
                                        <span style={{ fontSize: 32, fontWeight: 300, fontFamily: 'var(--font-display)', color: C.coral, fontStyle: 'italic' }}>{nutritionPlan.tdee}</span>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: C.deepBlack, opacity: 0.4, marginLeft: 4 }}>KCAL</span>
                                    </div>
                                </div>
                                <div style={{ height: 2, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: '70%', background: C.coral }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {[
                                    { k: 'P', v: nutritionPlan.protein },
                                    { k: 'C', v: nutritionPlan.carbs },
                                    { k: 'F', v: nutritionPlan.fat }
                                ].map(m => (
                                    <div key={m.k} style={{ textAlign: 'center' }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            border: `1px solid ${C.border}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 11, fontWeight: 900, color: C.deepBlack
                                        }}>{m.k}</div>
                                        <div style={{ fontSize: 11, fontWeight: 900, marginTop: 6, color: C.deepBlack }}>{m.v}g</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </EditorialBlock>

                    {/* 8. Split (1x1) */}
                    <EditorialBlock title="Split" gridArea="split" className="block-split">
                        <div style={{ flex: 1, minHeight: 100 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={splitData}
                                        innerRadius={32}
                                        outerRadius={34} // 極細環形，充滿高級數據感
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none" // 消除預設的白邊，讓邊緣銳利
                                    >
                                        {splitData.map((entry, index) => (
                                            <Cell
                                                key={index}
                                                fill={entry.color === C.coral ? C.coral : entry.color === C.pebble ? C.stone : entry.color === C.ember ? C.deepBlack : entry.color}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<BrightTooltip />} cursor={false} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                            {splitData.map(s => (
                                <span key={s.name} style={{ fontSize: 9, fontWeight: 900, color: C.deepBlack, opacity: 0.6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    • {s.name}
                                </span>
                            ))}
                        </div>
                    </EditorialBlock>

                    {/* 9. Recovery Grid (3x1) */}
                    <EditorialBlock title="Muscle Recovery" gridArea="recovery" className="block-recovery">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                            {Object.entries(MUSCLE_CN).map(([key, label]) => {
                                const score = Math.round(getMuscleRecoveryDetails(userId || getUserId())[key]?.score || 100);
                                const isRecovered = score >= 85;
                                const barColor = isRecovered ? C.deepBlack : C.coral;
                                return (
                                    <div key={key} style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{ height: 80, width: '100%', background: C.paper, borderRadius: 0, position: 'relative', overflow: 'hidden', marginBottom: 8, border: `1px solid ${C.border}` }}>
                                            <motion.div
                                                initial={{ height: 0 }} animate={{ height: `${score}%` }}
                                                style={{ position: 'absolute', bottom: 0, width: '100%', background: barColor, opacity: 0.1 }}
                                            />
                                            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${score}%`, background: barColor, opacity: 0.05 }} />
                                            <span style={{
                                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                                fontSize: 14, fontWeight: 300, fontFamily: 'var(--font-display)', color: C.deepBlack, fontStyle: 'italic', zIndex: 1
                                            }}>{score}%</span>
                                        </div>
                                        <span style={{ fontSize: 9, fontWeight: 900, color: C.deepBlack, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </EditorialBlock>
                </div>
            </motion.div>
        </div>
    );
};

export default TrainingAnalyticsDashboard;
