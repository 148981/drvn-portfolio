import React, { useState, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import QuarterlyReport from './QuarterlyReport';
import { getShoes } from '../utils/shoeManager';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronLeft, Activity, Flame, TrendingUp, TrendingDown, Zap, Target, AlertTriangle, Heart, Scale, Droplet, Clock, BarChart3, CheckCircle2, Star, Coffee, ArrowUpRight, ArrowDownRight, Minus, Calendar, ChevronRight, FileText, Shield, Download } from 'lucide-react';
import { canUse, openPaywall } from '../utils/membership';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { getUserId } from '../utils/auth';
import { uStorage } from '../utils/userStorage';
import { toast } from '../utils/toast';
import { computePaceZones } from '../utils/paceZones';
import { formatPace as fmtPace } from '../utils/format';
import { totalVolume as sumSets } from '../utils/strengthMath';
import { monthlyCoachSummary } from '../utils/monthlyCoachSummary';


/* ══════════════════════════════════════
   色系 — 參照 Statistics 風格
   白底 + 深色文字 + 暖色點綴
   ══════════════════════════════════════ */
const C = {
    // 對齊 DRVN 標準調色盤
    bg: '#ECEDEA',          // Mist 冷色 ground（白卡浮起）
    card: '#FFFFFF',
    mist: '#ECEDEA',        // 冷中性退後層
    text: '#161415',        // Deep Black
    sub: '#8E8E93',
    border: '#E4DED2',      // Stone
    divider: '#CFC6B8',     // Pebble
    // 功能色 — 只保留 Coral 一個 accent，其餘雜色全部中性化
    coral: '#F95C4B',
    coralLight: 'rgba(249, 92, 75, 0.08)',
    ember: '#D94030',
    olive: '#161415',       // 原橄欖綠 → 中性 Deep Black
    khaki: '#8B7F72',       // 原卡其 → 中性 Clay（暖灰）
    orange: '#161415',      // 原橘 → 中性 Deep Black
    lime: '#8B7F72',        // 原萊姆綠 → 中性 Clay
    black: '#161415',
    cream: '#E8E9E6',       // 原暖奶油 → 冷 Mist
    // 語義色（保留，僅用於警示/狀態）
    success: '#5A7A3A',     // DRVN olive success
    warning: '#D94030',
    danger: '#D94030',
    blue: '#3B7DD8',
    muted: '#B0ADA6',
};
// DRVN 英文版顯示字體
const TENOR = '"Tenor Sans", "Noto Sans TC", system-ui, sans-serif';

const anim = (d = 0) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { delay: d, duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
});

/* ── 小元件 ── */
const CountUp = ({ value, decimals = 0 }) => {
    const [v, setV] = useState(0);
    useEffect(() => {
        const end = parseFloat(value) || 0;
        let f = 0;
        const total = 60;
        const t = setInterval(() => {
            f++;
            setV(end * (1 - Math.pow(1 - f / total, 3)));
            if (f >= total) { setV(end); clearInterval(t); }
        }, 16);
        return () => clearInterval(t);
    }, [value]);
    return <span>{v.toFixed(decimals)}</span>;
};

/* 進度條 — 水平填充 */
const ProgressBar = ({ value, max, color = C.coral, height = 6 }) => {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div style={{ width: '100%', height, borderRadius: height / 2, background: C.divider, overflow: 'hidden' }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ height: '100%', borderRadius: height / 2, background: color }}
            />
        </div>
    );
};

/* 堆疊長條圖 — 圖二風格的月度分布圖 */
const StackedBarChart = ({ data, colors, labels, height = 140 }) => {
    if (!data || !data.length) return null;
    const maxVal = Math.max(...data.map(d => d.total || Object.values(d.segments || {}).reduce((a, b) => a + b, 0)), 1);
    return (
        <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, padding: '0 2px' }}>
                {data.map((d, i) => {
                    const total = d.total || Object.values(d.segments || {}).reduce((a, b) => a + b, 0);
                    const barH = (total / maxVal) * height * 0.85;
                    const segments = d.segments || {};
                    const segKeys = Object.keys(segments);
                    return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <motion.div
                                initial={{ height: 0 }} animate={{ height: barH }}
                                transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.6 }}
                                style={{ width: '100%', borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}
                            >
                                {segKeys.map((key, si) => {
                                    const segPct = total > 0 ? (segments[key] / total) * 100 : 0;
                                    return <div key={key} style={{ width: '100%', height: `${segPct}%`, background: colors[si % colors.length], minHeight: segPct > 0 ? 2 : 0 }} />;
                                })}
                            </motion.div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: '0.02em' }}>{d.label}</span>
                        </div>
                    );
                })}
            </div>
            {/* 圖例 */}
            {labels && (
                <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                    {labels.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length] }} />
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{l}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* 圓環分數 */
const ScoreRing = ({ score, size = 64, label, thickness = 5 }) => {
    const r = (size / 2) - thickness - 2;
    const circ = 2 * Math.PI * r;
    const pct = Math.min(score, 100) / 100;
    const color = score >= 80 ? C.success : score >= 60 ? C.warning : C.danger;
    return (
        <div style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.divider} strokeWidth={thickness} />
                <motion.circle
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: circ * (1 - pct) }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
                    strokeWidth={thickness} strokeLinecap="round" strokeDasharray={circ}
                />
            </svg>
            <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: size * 0.3, fontWeight: 800, margin: 0, color }}>{score}</p>
                {label && <p style={{ fontSize: 11, fontWeight: 700, color: C.sub, margin: 0 }}>{label}</p>}
            </div>
        </div>
    );
};

/* 配速格式化 */
const formatPace = fmtPace;   // 🩹 J: 單一真相源 → utils/format.js

/* 肌群分布橫條圖 — 清晰易讀 */
const MuscleBarChart = ({ data }) => {
    const entries = Object.entries(data || {});
    if (!entries.length) return null;
    const labels = { chest: '胸部', back: '背部', legs: '腿部', arms: '手臂', shoulders: '肩膀', core: '核心' };
    const barColors = [C.black, C.olive, C.orange, C.khaki, C.coral, C.lime];
    const maxPct = Math.max(...entries.map(([, v]) => v.percentage || 0), 1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map(([key, val], i) => (
                <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{labels[key] || key}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{val.percentage}%<span style={{ fontSize: 11, color: C.sub, marginLeft: 4 }}>{val.volume}kg</span></span>
                    </div>
                    <ProgressBar value={val.percentage} max={maxPct} color={barColors[i % barColors.length]} height={8} />
                </div>
            ))}
        </div>
    );
};

/* ═══════════════════════════
   建議卡片 — 最核心的組件
   ═══════════════════════════ */
const RecommendationCard = ({ rec, index }) => {
    const priorityConfig = {
        // 高優先用 Coral（唯一強調色）；中/低降為中性，避免整列紅成一片
        high: { color: C.coral, label: '高優先', bg: 'rgba(249,92,75,0.08)', border: 'rgba(249,92,75,0.22)' },
        medium: { color: '#8B7F72', label: '中優先', bg: 'rgba(139,127,114,0.08)', border: 'rgba(139,127,114,0.22)' },
        low: { color: '#5A7A3A', label: '建議', bg: 'rgba(90,122,58,0.08)', border: 'rgba(90,122,58,0.22)' },
    };
    const cfg = priorityConfig[rec.priority] || priorityConfig.medium;
    const catLabels = { training: '訓練', cardio: '跑步', nutrition: '營養', body: '身體', recovery: '恢復' };
    const iconMap = {
        calendar: Calendar, balance: Scale, 'trending-down': TrendingDown,
        'trending-up': TrendingUp, zap: Zap, alert: AlertTriangle,
        utensils: Coffee, protein: Dumbbell, clipboard: BarChart3,
        scale: Scale, heart: Heart, distribute: Activity
    };
    const Icon = iconMap[rec.icon] || Zap;

    // Swiss 極簡：無卡殼，整則建議靠髮絲線分隔 + 大留白，左側一道優先級色條當唯一焦點。
    return (
        <motion.div {...anim(0.08 + index * 0.06)} style={{
            borderTop: `1px solid ${C.divider}`,
            padding: '22px 4px 22px 16px',
            position: 'relative',
        }}>
            {/* 左側優先級色條（取代整張卡的頂部粗線與盒子）*/}
            <div style={{ position: 'absolute', left: 0, top: 22, bottom: 22, width: 3, borderRadius: 2, background: cfg.color, opacity: 0.9 }} />

            {/* 標籤列 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 800, color: cfg.color, letterSpacing: '0.04em'
                }}>
                    <Icon size={12} /> {cfg.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    {catLabels[rec.category] || rec.category}
                </span>
            </div>

            {/* 標題 + 描述 */}
            <h4 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', color: C.text, lineHeight: 1.4, letterSpacing: '-0.01em' }}>{rec.title}</h4>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: C.sub, margin: '0 0 14px', maxWidth: '34ch' }}>{rec.description}</p>

            {/* 建議行動 — 無盒子，一條髮絲線 + 💡 + 中性深字 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 12, borderTop: `1px solid ${C.divider}` }}>
                <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>💡</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.55 }}>
                    {rec.suggestion}
                </p>
            </div>
        </motion.div>
    );
};

/* ══════════════════════════════════════
   ██ 主元件
   ══════════════════════════════════════ */
/* 空狀態提示 */
const EmptyState = ({ icon: Icon, text }) => (
    <Card {...anim(0.1)} style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Icon size={36} color={C.muted} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 700, color: C.sub, margin: 0 }}>{text}</p>
        <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0' }}>試試切換到有資料的月份</p>
    </Card>
);

const MONTHS_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

const MonthlyReportPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [showQuarterly, setShowQuarterly] = useState(false);

    /* 季末月判定（3/6/9/12）。使用者的設計意圖：
       前兩個月只有月報，第三個月月報＋季報一起給，
       讓人可以從不同時間尺度看自己的變化。 */
    const isQuarterEnd = (new Date().getMonth() + 1) % 3 === 0;

    /* 季末月首次進到月報頁 → 自動把季報端上來一次（每季只提示一次，不打擾）。
       之後想再看，用標題列的「季報」鈕隨時可開。 */
    useEffect(() => {
        if (!isQuarterEnd) return;
        const now = new Date();
        const key = `drvn_quarterly_seen_${now.getFullYear()}Q${Math.floor(now.getMonth() / 3) + 1}`;
        try {
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, '1');
            // 讓月報先進場，再疊季報，避免兩個動畫互相打架
            const t = setTimeout(() => setShowQuarterly(true), 900);
            return () => clearTimeout(t);
        } catch { /* localStorage 不可用就不自動彈 */ }
    }, [isQuarterEnd]);

    // 由首頁「季報出爐」卡導入時，自動展開季回饋 overlay
    useEffect(() => {
        if (location.state?.openQuarterly) setShowQuarterly(true);
    }, [location.state]);

    // 月份選擇
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

    // 從 localStorage 讀取訓練紀錄並計算月度統計
    const getLocalTrainingStats = (year, month) => {
        const userId = getUserId();
        try {
            const raw = uStorage(userId).get('trainingRecords', {});
            const records = Object.values(raw);
            const monthStr = `${year}-${String(month).padStart(2, '0')}`;

            // 篩選當月紀錄
            const monthRecords = records.filter(r => {
                const d = r.date || r.timestamp || '';
                return d.startsWith(monthStr);
            });

            if (monthRecords.length === 0) return null;

            // 計算統計
            let totalVolume = 0, totalSets = 0, totalReps = 0, totalDuration = 0;
            const muscleCount = {};
            const muscleVolume = {}; // ← 新增：各肌群累積重量
            const workoutTrend = [];

            monthRecords.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

            monthRecords.forEach(r => {
                const vol = r.volume || 0;
                totalVolume += vol;

                // 統計肌群次數
                (r.muscles || []).forEach(m => { muscleCount[m] = (muscleCount[m] || 0) + 1; });

                // 如果沒有 muscles，從 exercises 推斷
                if ((!r.muscles || r.muscles.length === 0) && r.exercises) {
                    r.exercises.forEach(ex => {
                        const name = (ex.name || '').toLowerCase();
                        if (name.includes('chest') || name.includes('bench') || name.includes('push')) muscleCount['chest'] = (muscleCount['chest'] || 0) + 1;
                        if (name.includes('back') || name.includes('row') || name.includes('pull') || name.includes('deadlift')) muscleCount['back'] = (muscleCount['back'] || 0) + 1;
                        if (name.includes('shoulder') || name.includes('raise') || name.includes('overhead')) muscleCount['shoulders'] = (muscleCount['shoulders'] || 0) + 1;
                        if (name.includes('bicep') || name.includes('tricep') || name.includes('curl') || name.includes('arm')) muscleCount['arms'] = (muscleCount['arms'] || 0) + 1;
                        if (name.includes('core') || name.includes('ab') || name.includes('plank')) muscleCount['core'] = (muscleCount['core'] || 0) + 1;
                        if (name.includes('leg') || name.includes('squat') || name.includes('lunge') || name.includes('calf')) muscleCount['legs'] = (muscleCount['legs'] || 0) + 1;
                    });
                }

                // ← 新增：統計各肌群累積訓練量
                const exGroups = {}; // exercise 分配到的肌群
                (r.exercises || []).forEach(ex => {
                    const name = (ex.name || '').toLowerCase();
                    // 計算此 exercise 的訓練量
                    let exVol = 0;
                    const sets = Array.isArray(ex.sets) && typeof ex.sets[0] === 'object' ? ex.sets : [];
                    if (sets.length > 0) {
                        sets.forEach(s => { exVol += (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0); });
                    } else {
                        // ⚠ 這是「計劃型」紀錄（只有 重量／組數／次數 三個欄位，沒有逐組明細），
                        //    形狀與 strengthMath 的逐組公式不同，所以留在這裡。
                        exVol = (parseFloat(ex.weight) || 0) * (parseInt(ex.setsCount || ex.sets || 0)) * (parseInt(ex.reps) || 0);
                    }
                    // 映射到肌群
                    let muscle = null;
                    if (name.includes('chest') || name.includes('bench') || name.includes('push') || name.includes('fly') || name.includes('dip')) muscle = 'chest';
                    else if (name.includes('back') || name.includes('row') || name.includes('pull') || name.includes('deadlift') || name.includes('lat')) muscle = 'back';
                    else if (name.includes('shoulder') || name.includes('raise') || name.includes('overhead') || name.includes('press') && name.includes('shoulder')) muscle = 'shoulders';
                    else if (name.includes('bicep') || name.includes('curl') || name.includes('hammer')) muscle = 'arms';
                    else if (name.includes('tricep') || name.includes('extension') || name.includes('pushdown')) muscle = 'arms';
                    else if (name.includes('core') || name.includes('ab') || name.includes('plank') || name.includes('crunch') || name.includes('twist')) muscle = 'core';
                    else if (name.includes('leg') || name.includes('squat') || name.includes('lunge') || name.includes('calf') || name.includes('hamstring') || name.includes('glute')) muscle = 'legs';
                    // 也嘗試從 muscles 陣列
                    if (!muscle && r.muscles?.length > 0) muscle = r.muscles[0];
                    if (muscle) {
                        muscleVolume[muscle] = (muscleVolume[muscle] || 0) + exVol;
                    }
                });

                // 統計組數和次數
                let sessionSets = 0, sessionReps = 0;
                (r.exercises || []).forEach(ex => {
                    const sets = ex.sets || [];
                    sessionSets += ex.setsCount || (Array.isArray(sets) ? sets.length : parseInt(sets) || 0);
                    if (Array.isArray(sets)) { sets.forEach(s => { sessionReps += parseInt(s.reps || 0); }); }
                    else { sessionReps += (parseInt(ex.reps) || 0) * (parseInt(sets) || 0); }
                });
                totalSets += sessionSets;
                totalReps += sessionReps;

                const dur = r.duration_mins || r.duration || 0;
                totalDuration += dur;

                // O(n) max instead of O(n log n) sort (js-min-max-loop)
                const topMuscle = Object.entries(muscleCount).reduce((max, e) => e[1] > (max?.[1] ?? -1) ? e : max, null);
                workoutTrend.push({
                    date: (r.date || r.timestamp || '').slice(0, 10),
                    score: r.effortScore || r.overall_score || r.intensity || 0,
                    volume: vol,
                    duration: dur,
                    focus: r.focus_group || (topMuscle ? topMuscle[0] : 'Full Body')
                });
            });

            // 肌群分布百分比 + 實際 volume
            const totalMuscleHits = Object.values(muscleCount).reduce((a, b) => a + b, 0) || 1;
            const muscleDist = {};
            Object.entries(muscleCount).forEach(([k, v]) => {
                muscleDist[k] = {
                    percentage: Math.round((v / totalMuscleHits) * 100),
                    volume: Math.round(muscleVolume[k] || 0), // ← 真實重量
                    sessions: v
                };
            });

            // ← 從 LuxuryPlanView 讀取四週計劃完成度（沿用函式頂部的 userId）
            let totalPlanDays = 0, totalCompletedDays = 0;
            try {
                const planRaw = localStorage.getItem('currentPlan');
                const plan = planRaw ? JSON.parse(planRaw) : null;
                if (plan?.weeks) {
                    plan.weeks.forEach((wk, wi) => {
                        const weekDays = wk.days?.length || 0;
                        totalPlanDays += weekDays;
                        const storedKey = `completed_workouts_${userId}_week${wi + 1}`;
                        const stored = localStorage.getItem(storedKey);
                        if (stored) totalCompletedDays += JSON.parse(stored).length;
                    });
                }
            } catch (_) {}
            const planCompletion = totalPlanDays > 0
                ? Math.round((totalCompletedDays / totalPlanDays) * 100)
                : (monthRecords.length > 0 ? Math.min(100, Math.round((monthRecords.length / 16) * 100)) : 0);

            const scores = monthRecords
                .map(r => r.effortScore || r.overall_score || 0)
                .filter(s => s > 0);
            const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;

            return {
                sessions: monthRecords.length,
                total_volume_kg: Math.round(totalVolume),
                total_sets: totalSets,
                total_reps: totalReps,
                avg_score: avgScore,
                best_score: scores.length > 0 ? Math.max(...scores) : 0,
                total_duration_mins: totalDuration,
                avg_completion_rate: planCompletion,
                muscle_distribution: muscleDist,
                workout_trend: workoutTrend,
                prs: [],
            };
        } catch (e) {
            console.error('Error reading localStorage training records:', e);
            return null;
        }
    };

    // 快速切換月份時，較慢回來的舊月份回應不可蓋掉新月份 → 只採用最後一次請求的結果
    const reqSeqRef = useRef(0);
    const fetchReport = (year, month) => {
        const seq = ++reqSeqRef.current;
        setLoading(true);
        setError(null);
        const userId = getUserId();
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        // 🔴 Fix(對數稽核)：原本寫死 http://{hostname}:8000 — 正式版 iOS（file:// 載入）
        //    hostname 是空的，月報永遠抓不到。改走 apiClient（自動指向正式後端）。
        import('../api/client')
            .then(({ default: apiClient }) => apiClient.get(`/api/user/monthly-report/${userId}?month=${monthStr}`))
            .then(r => r.data)
            .then(d => {
                if (seq !== reqSeqRef.current) return;
                // 如果 API 健身資料為空，用 localStorage 補位
                const localFitness = getLocalTrainingStats(year, month);
                if (localFitness && (!d.fitness || !d.fitness.sessions || d.fitness.sessions === 0)) {
                    d.fitness = { ...d.fitness, ...localFitness };
                    console.log(`📊 月報健身資料從 localStorage 補位: ${localFitness.sessions} 筆`);
                } else if (localFitness && d.fitness && d.fitness.sessions > 0) {
                    // 兩邊都有資料，合併（localStorage 可能有 API 沒有的紀錄）
                    const apiTrendDates = new Set((d.fitness.workout_trend || []).map(w => w.date));
                    const extraTrend = (localFitness.workout_trend || []).filter(w => !apiTrendDates.has(w.date));
                    if (extraTrend.length > 0) {
                        d.fitness.workout_trend = [...(d.fitness.workout_trend || []), ...extraTrend].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
                        d.fitness.sessions += extraTrend.length;
                        d.fitness.total_volume_kg += extraTrend.reduce((s, w) => s + (w.volume || 0), 0);
                        console.log(`📊 月報健身資料合併: +${extraTrend.length} 筆 localStorage 紀錄`);
                    }
                }
                // 同步更新 overview.training_days（總覽 heatmap）
                if (localFitness && localFitness.workout_trend && d.overview) {
                    const existingDays = new Set(d.overview.training_days || []);
                    localFitness.workout_trend.forEach(w => {
                        const dayNum = parseInt(String(w.date || '').split('-')[2], 10);
                        if (dayNum && !existingDays.has(dayNum)) existingDays.add(dayNum);
                    });
                    d.overview.training_days = Array.from(existingDays).sort((a, b) => a - b);
                    d.overview.total_training_days = d.overview.training_days.length;
                }
                setReport(d);
                setLoading(false);
            })
            .catch(e => { if (seq !== reqSeqRef.current) return; setError(e.message); setLoading(false); });
    };

    useEffect(() => { fetchReport(selectedYear, selectedMonth); }, [selectedYear, selectedMonth]);

    const goMonth = (delta) => {
        let y = selectedYear, m = selectedMonth + delta;
        if (m < 1) { m = 12; y--; }
        if (m > 12) { m = 1; y++; }
        // 不可超過當月
        if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return;
        setSelectedYear(y);
        setSelectedMonth(m);
    };

    // ── 📄 匯出 PDF：每個 tab 一頁、頂部加大標題，合成單一檔案下載 ──
    const exportRef = useRef(null);
    const [isExporting, setIsExporting] = useState(false);
    const handleExportPDF = async () => {
        if (isExporting) return;
        if (!canUse('reportPdf')) { openPaywall('reportPdf'); return; }   // 💳 PDF 報告是會員功能（整頁也已是會員）
        setIsExporting(true);
        try {
            const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
                import('jspdf'), import('html2canvas'),
            ]);
            // 等離屏容器掛載（isExporting=true 觸發 render 後 ref 才有值）
            for (let tries = 0; tries < 30 && !exportRef.current; tries++) {
                await new Promise(r => setTimeout(r, 50));
            }
            if (!exportRef.current) throw new Error('export container not mounted');
            // 等字體與內容就緒
            if (document.fonts?.ready) { try { await document.fonts.ready; } catch (_) {} }
            await new Promise(r => setTimeout(r, 200));

            // 可見性由上方 #pdf-export-root CSS（opacity:1 !important）強制處理，這裡只多等一拍確保 layout 穩定
            await new Promise(r => setTimeout(r, 80));

            const pages = Array.from(exportRef.current.querySelectorAll('[data-pdf-page]'));
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();

            for (let i = 0; i < pages.length; i++) {
                const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false });
                const img = canvas.toDataURL('image/jpeg', 0.92);
                // 等比縮放塞進 A4（含邊距）
                const margin = 24;
                const maxW = pw - margin * 2;
                const maxH = ph - margin * 2;
                const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
                const w = canvas.width * ratio;
                const h = canvas.height * ratio;
                if (i > 0) pdf.addPage();
                pdf.addImage(img, 'JPEG', (pw - w) / 2, margin, w, h);
            }
            const fname = `DRVN_深度分析_${selectedYear}-${String(selectedMonth).padStart(2, '0')}.pdf`;

            // 手機 App 走原生 saveFile 橋接（分享面板可存到檔案）；瀏覽器走分享或下載
            const { savePdfMobileFriendly } = await import('../utils/reportPdf');
            const ok = await savePdfMobileFriendly(pdf, fname);
            if (!ok) throw new Error('save failed');
        } catch (err) {
            console.error('[MonthlyReport] PDF 匯出失敗：', err);
            toast.error('PDF 匯出失敗，請再試一次');
        } finally {
            setIsExporting(false);
        }
    };

    if (loading) return (
        <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, flexDirection: 'column', gap: 12 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <BarChart3 size={28} color={C.coral} />
            </motion.div>
            <p style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>載入報告中...</p>
        </div>
    );

    if (error) return (
        <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, zIndex: 50 }}>
            <AlertTriangle size={36} color={C.danger} />
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>載入報告失敗</p>
            <p style={{ fontSize: 13, color: C.sub }}>{error}</p>
            <motion.button {...pressProps('row')} onClick={() => navigate(-1)} style={{ padding: '10px 28px', borderRadius: 12, background: C.coral, color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>返回</motion.button>
        </div>
    );

    const d = report;
    const tabs = [
        { id: 'overview', label: '總覽' },
        { id: 'fitness', label: '健身' },
        { id: 'cardio', label: '跑步' },
        { id: 'nutrition', label: '營養' },
        { id: 'plan', label: '建議', badge: d.recommendations?.length },
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50, background: C.bg,
            maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
        }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
                /* PDF 匯出容器：強制所有內容可見，繞過 framer-motion 進場動畫在離屏不播完造成的空白截圖。
                   只動 opacity 與 div 的位移 transform，SVG（環形圖等）的 transform 不碰。 */
                #pdf-export-root [data-pdf-page] * {
                    opacity: 1 !important;
                    animation: none !important;
                }
                #pdf-export-root [data-pdf-page] div {
                    transform: none !important;
                }
            `}</style>
            {/* ── Header ── */}
            <div style={{
                padding: '44px 16px 8px', display: 'flex', alignItems: 'center', gap: 10,
                background: C.bg, position: 'relative', zIndex: 10,
            }}>
                <motion.button {...pressProps('row')} onClick={() => navigate(-1)} style={{
 width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none',
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
 }}>
                    <ChevronLeft size={22} color={C.text} />
                </motion.button>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.text, flex: 1, textAlign: 'center' }}>
                    深度分析
                </h2>
                {/* 🗓️ 季回饋入口 —— 季末月（3/6/9/12）才強調。
                    產品意圖：第 1、2 個月只有月報；第 3 個月＝月報＋季報，
                    讓使用者從「單月」與「三個月」兩種焦距看自己的變化。
                    非季末月不隱藏（隨時想看趨勢都可以），但降為安靜的次要樣式，
                    不跟當月月報搶主角。 */}
                <motion.button {...pressProps('row')} onClick={() => setShowQuarterly(true)}
 aria-label={isQuarterEnd ? '季回饋已出爐' : '查看季回饋'}
 style={{
 height: 32, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
 display: 'flex', alignItems: 'center', gap: 5,
 fontSize: 12, fontWeight: 800,
 background: isQuarterEnd ? C.coral : 'transparent',
 border: isQuarterEnd ? 'none' : `1px solid ${C.divider}`,
 color: isQuarterEnd ? '#fff' : C.sub,
 boxShadow: isQuarterEnd ? '0 6px 16px -6px rgba(249,92,75,0.5)' : 'none',
 }}>
                    <TrendingUp size={13} /> 季報
                    {isQuarterEnd && (
                        <span style={{
                            width: 6, height: 6, borderRadius: 999, background: '#fff',
                            marginLeft: 1, opacity: 0.9,
                        }} />
                    )}
                </motion.button>
                {/* 📄 右上角下載 PDF 按鈕 */}
                <motion.button {...pressProps('row')} onClick={handleExportPDF} disabled={isExporting} aria-label="下載 PDF" style={{
 width: 32, height: 32, borderRadius: 9, background: isExporting ? C.divider : C.text, border: 'none',
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isExporting ? 'default' : 'pointer',
 }}>
                    {isExporting
                        ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><BarChart3 size={16} color={C.sub} /></motion.div>
                        : <Download size={16} color="#fff" />}
                </motion.button>
            </div>

            {/* 季回饋 overlay */}
            {showQuarterly && <QuarterlyReport onClose={() => setShowQuarterly(false)} />}

            {/* ── 月份選擇器 ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
                padding: '6px 16px 12px', borderBottom: `1px solid ${C.divider}`,
                background: C.bg, position: 'relative', zIndex: 10,
            }}>
                <motion.button {...pressProps('row')} onClick={() => goMonth(-1)} style={{
 width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.divider}`,
 background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
 }}>
                    <ChevronLeft size={16} color={C.sub} />
                </motion.button>
                <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1 }}>
                        {MONTHS_ZH[selectedMonth - 1]}
                    </p>
                    <p style={{ fontSize: 12, color: C.sub, margin: '2px 0 0', fontWeight: 600 }}>{selectedYear}</p>
                </div>
                <motion.button {...pressProps('row')} onClick={() => goMonth(1)} style={{
 width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.divider}`,
 background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
 opacity: (selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1) ? 0.3 : 1,
 }}>
                    <ChevronRight size={16} color={C.sub} />
                </motion.button>
            </div>

            {/* ── Tab Bar — 圖二風格 ── */}
            <div style={{
                display: 'flex', gap: 0, padding: '0', borderBottom: `1px solid ${C.divider}`,
                background: C.bg, position: 'relative', zIndex: 10,
            }}>
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    return (
                        <motion.button {...pressProps('row')} key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
 flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
 fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
 color: active ? C.text : C.sub,
 borderBottom: active ? `2px solid ${C.text}` : '2px solid transparent',
 transition: 'all 0.2s', position: 'relative',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
 }}>
                            {tab.label}
                            {tab.badge > 0 && (
                                <span style={{
                                    width: 18, height: 18, borderRadius: '50%', background: C.coral, color: '#fff',
                                    fontSize: 11, fontWeight: 800, display: 'inline-flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>{tab.badge}</span>
                            )}
                        </motion.button>
                    );
                })}
            </div>

            {/* ── Content ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                        {activeTab === 'overview' && <TabOverview d={d} />}
                        {activeTab === 'fitness' && <TabFitness d={d} year={selectedYear} month={selectedMonth} />}
                        {activeTab === 'cardio' && <TabCardio d={d} />}
                        {activeTab === 'nutrition' && <TabNutrition d={d} />}
                        {activeTab === 'plan' && <TabPlan d={d} />}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* ── 📄 離屏 PDF 匯出容器：只在匯出時才掛載（平常不渲染，避免背景持續掛載 tab）── */}
            {isExporting && (
            <div id="pdf-export-root" ref={exportRef} aria-hidden="true" style={{ position: 'fixed', left: -99999, top: 0, width: 760, pointerEvents: 'none' }}>
                {[
                    { id: 'overview', title: '總覽', en: 'OVERVIEW', node: <TabOverview d={d} /> },
                    { id: 'fitness', title: '健身訓練', en: 'STRENGTH', node: <TabFitness d={d} year={selectedYear} month={selectedMonth} /> },
                    { id: 'cardio', title: '跑步訓練', en: 'CARDIO', node: <TabCardio d={d} /> },
                    { id: 'nutrition', title: '營養紀錄', en: 'NUTRITION', node: <TabNutrition d={d} /> },
                    { id: 'plan', title: '優化建議', en: 'RECOMMENDATIONS', node: <TabPlan d={d} /> },
                ].map(p => (
                    <div key={p.id} data-pdf-page style={{ width: 760, background: '#FFFFFF', padding: '56px 56px 64px', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
                        {/* 頁首大標題 */}
                        <div style={{ borderBottom: `2px solid ${C.text}`, paddingBottom: 20, marginBottom: 36 }}>
                            <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.24em', color: C.coral, margin: '0 0 10px', textTransform: 'uppercase' }}>
                                DRVN · {d.meta.month_en} {d.meta.year} · {p.en}
                            </p>
                            <h1 style={{ fontFamily: TENOR, fontSize: 52, fontWeight: 400, color: C.text, margin: 0, lineHeight: 1, letterSpacing: '-1px' }}>{p.title}</h1>
                        </div>
                        {p.node}
                    </div>
                ))}
            </div>
            )}
        </div>
    );
};


/* ══════════════════════════════════════
   Tab: 總覽
   ══════════════════════════════════════ */
const SectionTitle = ({ children, style = {} }) => (
    <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px', ...style }}>{children}</p>
);

const Card = ({ children, style = {}, ...rest }) => (
    <div style={{
        // 白卡 + Pebble hairline，浮在 Mist 冷色 ground 上（去掉原本的珊瑚奶油底）
        background: '#FFFFFF',
        borderRadius: 24,
        padding: '20px',
        border: `1px solid ${C.border}`,
        boxShadow: '0 8px 24px -14px rgba(22,20,21,0.12)',
        ...style
    }} {...rest}>
        {children}
    </div>
);

const TabOverview = ({ d }) => {
    // 訓練日 heatmap 行事曆
    const trainingDays = new Set(d.overview.training_days || []);

    const daysInMonth = d.meta.days_in_month || 30;

    // Swiss 極簡：拆掉卡殼，用留白 + 髮絲線分隔；只有「建議入口」這個可點的東西保留卡片。
    const RULE = `1px solid ${C.divider}`;
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* ── 月份標題（無卡殼，直接落在頁面左基準）── */}
            <motion.div {...anim(0)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 4px 24px' }}>
                <div>
                    <p style={{ fontFamily: TENOR, fontSize: 56, fontWeight: 400, margin: 0, color: C.text, lineHeight: 0.95, letterSpacing: '-1px' }}>{d.meta.year}</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.sub, margin: '8px 0 0', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{d.meta.month_en} · {d.meta.user_name}</p>
                </div>
            </motion.div>

            {/* ── 🎓 教練總評＋下個月三個重點（會員月報的主角：先講結論，數字在後面）── */}
            {(() => {
                const sum = monthlyCoachSummary(d);
                if (!sum) return null;
                return (
                    <motion.div {...anim(0.03)} style={{ padding: '0 4px 28px' }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: C.coral, margin: 0, letterSpacing: '0.08em' }}>教練總評</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: '6px 0 16px', letterSpacing: '-0.02em' }}>{sum.verdict}</p>
                        <p style={{ fontSize: 12, fontWeight: 800, color: C.sub, margin: '0 0 4px' }}>下個月先做這幾件</p>
                        {sum.priorities.map((p, i) => (
                            <div key={p.title} style={{ display: 'flex', gap: 14, alignItems: 'baseline', padding: '12px 0', borderBottom: RULE }}>
                                <span style={{ fontFamily: TENOR, fontSize: 22, color: C.coral, width: 16, flexShrink: 0 }}>{i + 1}</span>
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: 0 }}>{p.title}</p>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: C.sub, margin: '2px 0 0' }}>{p.why}</p>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                );
            })()}

            {/* ── 摘要數據列：無卡，三欄用直線分隔（圓殼 → 方形硬線）── */}
            <motion.div {...anim(0.05)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: RULE, borderBottom: RULE, padding: '18px 0' }}>
                {[
                    { label: 'Active', value: d.overview.active_days, unit: '天' },
                    { label: 'Streak', value: d.overview.best_streak, unit: '天' },
                    { label: 'Hours', value: d.overview.total_hours, unit: 'hr' },
                ].map((item, i) => (
                    <div key={i} style={{ textAlign: 'left', paddingLeft: i === 0 ? 4 : 16, borderLeft: i > 0 ? RULE : 'none' }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: C.sub, margin: '0 0 6px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{item.label}</p>
                        <p style={{ fontFamily: TENOR, fontSize: 34, fontWeight: 400, color: C.text, margin: 0, lineHeight: 1 }}>
                            <CountUp value={item.value} />
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0' }}>{item.unit}</p>
                    </div>
                ))}
            </motion.div>

            {/* ── 三大系統概覽：無卡，每列髮絲線分隔 ── */}
            <SectionTitle style={{ marginTop: 36 }}>系統概覽</SectionTitle>
            <motion.div {...anim(0.1)}>
                {[
                    { icon: Dumbbell, label: '健身訓練', value: `${d.fitness.sessions} 次`, sub: `${(d.fitness.total_volume_kg / 1000).toFixed(1)} 噸總量` },
                    { icon: Activity, label: '跑步訓練', value: `${d.cardio.total_distance_km} km`, sub: `${d.cardio.run_count} 次` },
                    { icon: Coffee, label: '營養紀錄', value: `${d.nutrition.logged_days}/${d.meta.days_in_month}`, sub: `達標率 ${d.nutrition.calorie_adherence_pct}%` },
                ].map((item, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '16px 4px',
                        borderTop: i === 0 ? RULE : 'none',
                        borderBottom: RULE,
                    }}>
                        <item.icon size={18} color={C.text} strokeWidth={2} style={{ opacity: 0.7 }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>{item.label}</p>
                            <p style={{ fontSize: 12, color: C.sub, margin: '2px 0 0' }}>{item.sub}</p>
                        </div>
                        <p style={{ fontFamily: TENOR, fontSize: 20, fontWeight: 400, color: C.text, margin: 0 }}>{item.value}</p>
                    </div>
                ))}
            </motion.div>

            {/* ── 🥾 愛用裝備回顧：本月各裝備使用次數/里程 + 磨耗 ── */}
            {(() => {
                let gearStats = [];
                try {
                    const shoes = getShoes() || [];
                    const hist = JSON.parse(localStorage.getItem('workout_history') || '[]');
                    const y = d?.meta?.year, mo = d?.meta?.month;
                    const inMonth = (ts) => {
                        const dt = new Date(ts);
                        return !y || (dt.getFullYear() === y && dt.getMonth() + 1 === mo);
                    };
                    const usage = {}; // shoeId → { count, km }
                    hist.forEach((w) => {
                        if (!w?.shoe?.id || !inMonth(w.timestamp)) return;
                        const u = (usage[w.shoe.id] = usage[w.shoe.id] || { count: 0, km: 0, name: w.shoe.name, brand: w.shoe.brand });
                        u.count += 1;
                        u.km += Number(w.distance_km) || 0;
                    });
                    gearStats = Object.entries(usage)
                        .map(([id, u]) => {
                            const s = shoes.find((x) => x.id === id);
                            return { id, ...u, totalKm: s?.mileage || 0, maxKm: s?.maxMileage || 0 };
                        })
                        .sort((a, b) => b.km - a.km)
                        .slice(0, 3);
                } catch (_) { gearStats = []; }
                if (gearStats.length === 0) return null;
                return (
                    <>
                        <SectionTitle style={{ marginTop: 36 }}>愛用裝備</SectionTitle>
                        <motion.div {...anim(0.12)}>
                            {gearStats.map((g, i) => (
                                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderTop: i === 0 ? RULE : 'none', borderBottom: RULE }}>
                                    <span style={{ fontSize: 18 }}>👟</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>{g.brand ? `${g.brand} ` : ''}{g.name || '裝備'}</p>
                                        <p style={{ fontSize: 11, color: C.sub, margin: '2px 0 0' }}>
                                            本月 {g.count} 次 · {g.km.toFixed(1)} km
                                            {g.maxKm > 0 ? ` · 總磨耗 ${Math.min(100, Math.round((g.totalKm / g.maxKm) * 100))}%` : ''}
                                        </p>
                                    </div>
                                    <p style={{ fontFamily: TENOR, fontSize: 20, fontWeight: 400, color: C.text, margin: 0 }} className="tabular-nums">{g.km.toFixed(0)}<span style={{ fontSize: 11, color: C.muted, marginLeft: 3 }}>KM</span></p>
                                </div>
                            ))}
                        </motion.div>
                    </>
                );
            })()}

            {/* ── 訓練一致性 / 行事曆：無卡 ── */}
            <SectionTitle style={{ marginTop: 36 }}>訓練一致性</SectionTitle>
            <motion.div {...anim(0.15)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, padding: '0 4px' }}>
                    <div>
                        <p style={{ fontFamily: TENOR, fontSize: 40, fontWeight: 400, color: C.text, margin: 0, lineHeight: 1 }}>{d.overview.consistency_pct}%</p>
                        <p style={{ fontSize: 12, color: C.sub, margin: '6px 0 0' }}>每週平均 {d.overview.avg_weekly_sessions} 次</p>
                    </div>
                    <ScoreRing score={d.overview.consistency_pct} size={52} thickness={4} />
                </div>
                {/* 行事曆格 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 4 }}>
                    {['日', '一', '二', '三', '四', '五', '六'].map(dl => (
                        <div key={dl} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.muted, padding: '2px 0' }}>{dl}</div>
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const active = trainingDays.has(day);
                        return (
                            <motion.div key={i} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: Math.min(i, 6) * 0.008 }}
                                style={{
                                    aspectRatio: '1', borderRadius: 6,
                                    // 未訓練格用冷調極淡灰（融進 Mist 背景，不再是突兀的暖米灰）
                                    background: active ? C.coral : 'rgba(22,20,21,0.05)',
                                    border: active ? 'none' : '1px solid rgba(22,20,21,0.04)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#fff' : C.muted }}>{day}</span>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>

            {/* ── 建議快速入口：保留卡片（這是唯一可點、該浮起來的東西）── */}
            {d.recommendations?.length > 0 && (
                <Card {...anim(0.2)} style={{ marginTop: 36 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Target size={20} color={C.coral} />
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: 0 }}>{d.recommendations.length} 項計劃調整建議</p>
                            <p style={{ fontSize: 12, color: C.sub, margin: '2px 0 0' }}>{d.recommendations[0]?.title}</p>
                        </div>
                        <ChevronRight size={18} color={C.sub} />
                    </div>
                </Card>
            )}
        </div>
    );
};


/* ══════════════════════════════════════
   Tab: 健身
   ══════════════════════════════════════ */
const TabFitness = ({ d, year, month }) => {
    const f = d.fitness;

    if (!f.sessions || f.sessions === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionTitle>力量訓練</SectionTitle>
                <EmptyState icon={Dumbbell} text="本月沒有健身訓練紀錄" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionTitle>力量訓練 · {f.sessions} 次</SectionTitle>

            {/* 核心統計 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                    { label: '總訓練量', value: (f.total_volume_kg / 1000).toFixed(1), unit: '噸' },
                    { label: '平均耗力', value: f.avg_score, unit: '分', color: f.avg_score >= 80 ? C.success : f.avg_score >= 60 ? C.warning : C.danger },
                    { label: '總次數', value: f.total_reps, unit: 'reps' },
                    { label: '總組數', value: f.total_sets, unit: 'sets' },
                ].map((item, i) => (
                    <Card key={i} {...anim(0.03 + i * 0.03)} style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</p>
                        <p style={{ fontSize: 26, fontWeight: 800, color: item.color || C.text, margin: 0, lineHeight: 1.1 }}>
                            {typeof item.value === 'number' ? <CountUp value={item.value} /> : item.value}
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginLeft: 3 }}>{item.unit}</span>
                        </p>
                    </Card>
                ))}
            </div>

            {/* 計劃完成率 */}
            <Card {...anim(0.15)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px' }}>計劃完成率</p>
                        <p style={{ fontSize: 28, fontWeight: 800, color: f.avg_completion_rate >= 80 ? C.success : C.warning, margin: 0 }}>{f.avg_completion_rate}%</p>
                    </div>
                    <ScoreRing score={f.avg_completion_rate} size={56} thickness={4} />
                </div>
                <ProgressBar value={f.avg_completion_rate} max={100} color={f.avg_completion_rate >= 80 ? C.success : C.warning} height={8} />
            </Card>

            {/* 肌群分布 */}
            {Object.keys(f.muscle_distribution || {}).length > 0 && (
                <Card {...anim(0.2)}>
                    <SectionTitle style={{ margin: '0 0 14px' }}>肌群訓練分布</SectionTitle>
                    <MuscleBarChart data={f.muscle_distribution} />
                </Card>
            )}

            {/* PR 突破 */}
            {f.prs?.length > 0 && (
                <>
                    <SectionTitle>本月 PR 突破</SectionTitle>
                    {f.prs.map((pr, i) => (
                        <Card key={i} {...anim(0.25 + i * 0.04)} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '14px 18px',
                            background: i === 0 ? C.black : C.card,
                            color: i === 0 ? '#fff' : C.text,
                            border: i === 0 ? 'none' : `1px solid ${C.border}`,
                        }}>
                            <div>
                                <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, margin: '0 0 2px' }}>NEW PR</p>
                                <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{pr.exercise || pr.name || 'Exercise'}</p>
                            </div>
                            <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                                {pr.weight || pr.value || 0}<span style={{ fontSize: 12, opacity: 0.4 }}>kg</span>
                            </p>
                        </Card>
                    ))}
                </>
            )}

            {/* 耗力指數趨勢 — SVG 折線圖 */}
            {f.workout_trend?.filter(w => w.score > 0).length > 0 && (() => {
                const trendData = f.workout_trend.filter(w => w.score > 0);
                const scores = trendData.map(w => w.score);
                const minS = Math.min(...scores);
                const maxS = Math.max(...scores);
                const range = maxS - minS || 1;
                const W = 300, H = 80;
                const padL = 8, padR = 8, padT = 16, padB = 24;
                const pts = trendData.map((w, i) => {
                    const x = padL + (trendData.length === 1 ? (W - padL - padR) / 2 : (i / (trendData.length - 1)) * (W - padL - padR));
                    const y = padT + (1 - (w.score - minS) / range) * (H - padT - padB);
                    return { x, y, w };
                });
                const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const areaPath = `${linePath} L ${pts[pts.length-1].x} ${H - padB} L ${pts[0].x} ${H - padB} Z`;
                const lineColor = C.khaki; // 折線用中性色，資料點依分數上色（與圖例一致）
                const scoreColor = (s) => (s >= 80 ? C.success : s >= 60 ? C.warning : C.danger);
                return (
                    <Card {...anim(0.35)}>
                        <SectionTitle style={{ margin: '0 0 8px' }}>耗力指數趨勢</SectionTitle>
                        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
                            <defs>
                                <linearGradient id="effortFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {/* 填充面積 */}
                            <path d={areaPath} fill="url(#effortFill)" />
                            {/* 折線 */}
                            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            {/* 資料點 + Tooltip */}
                            {pts.map((p, i) => (
                                <g key={i}>
                                    <circle cx={p.x} cy={p.y} r="4" fill={scoreColor(p.w.score)} stroke="white" strokeWidth="2" />
                                    <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="11" fontWeight="800" fill={scoreColor(p.w.score)}>{p.w.score}</text>
                                    <text x={p.x} y={H - 6} textAnchor="middle" fontSize="11" fill={C.sub}>{(p.w.date || '').slice(5)}</text>
                                </g>
                            ))}
                        </svg>
                        {/* 圖例 */}
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                            {[{ color: C.success, label: '高耗力 ≥80' }, { color: C.warning, label: '中耗力 60-79' }, { color: C.danger, label: '低耗力 <60' }].map(l => (
                                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.color }} />
                                    <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{l.label}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                );
            })()}

            {/* 訓練紀錄列表 — 從 localStorage 讀取 */}
            {(() => {
                const focusLabels = { chest: '胸部', back: '背部', legs: '腿部', arms: '手臂', shoulders: '肩膀', core: '核心', full_body: '全身', upper: '上半身', lower: '下半身' };
                try {
                    const raw = uStorage(getUserId()).get('trainingRecords', {});
                    // 使用傳入的 year, month 進行精確過濾
                    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
                    const records = Object.values(raw)
                        .filter(r => (r.date || r.timestamp || '').startsWith(monthStr))
                        .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

                    if (!records.length) return null;

                    return (
                        <motion.div {...anim(0.4)}>
                            <SectionTitle style={{ margin: '20px 0 10px' }}>本月訓練紀錄</SectionTitle>
                            <Card style={{ padding: '4px 0' }}>
                                {records.map((rec, i) => {
                                    const focusKey = (rec.focus_group || rec.muscles?.[0] || '').toLowerCase();
                                    const focusLabel = focusLabels[focusKey] || focusKey || '訓練';
                                    const dateStr = (rec.date || '').slice(5); // MM-DD
                                    const effort = rec.effortScore || rec.overall_score || 0;
                                    const effortColor = effort >= 80 ? C.success : effort >= 60 ? C.warning : effort > 0 ? C.danger : C.muted;
                                    const vol = rec.volume || 0;
                                    const isLast = i === records.length - 1;

                                    return (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '12px 16px',
                                            borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                                        }}>
                                            {/* 日期 */}
                                            <div style={{
                                                minWidth: 40, textAlign: 'center',
                                                background: C.bg, borderRadius: 8, padding: '4px 0',
                                            }}>
                                                <span style={{ fontSize: 11, fontWeight: 800, color: C.sub }}>{dateStr}</span>
                                            </div>

                                            {/* 部位 */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 800,
                                                    color: C.text, textTransform: 'capitalize',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    display: 'block',
                                                }}>{focusLabel}</span>
                                            </div>

                                            {/* 數據 */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                                                <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>
                                                    {vol > 0 ? Math.round(vol).toLocaleString() : '—'}
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginLeft: 2 }}>kg</span>
                                                </span>
                                                {effort > 0 && (
                                                    <span style={{ fontSize: 11, fontWeight: 800, color: effortColor, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        ⚡ {effort}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </Card>
                        </motion.div>
                    );
                } catch (e) { return null; }
            })()}
        </div>
    );
};


/* ══════════════════════════════════════
   Tab: 跑步
   ══════════════════════════════════════ */
/* ── 跑步用迷你折線圖 (SVG) ── */
const RunLineChart = ({ data, valueKey, color = C.coral, height = 80, formatY, label }) => {
    if (!data || data.length < 2) return null;
    const vals = data.map(d => d[valueKey] || 0).filter(v => v > 0);
    if (vals.length < 2) return null;
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const W = 300; const H = height;
    // 增加 padding 避免標籤與圓點被截斷
    const pad = { top: 20, bottom: 25, left: 15, right: 15 };
    const pts = vals.map((v, i) => {
        const x = pad.left + (i / (vals.length - 1)) * (W - pad.left - pad.right);
        const y = pad.top + (1 - (v - minV) / range) * (H - pad.top - pad.bottom);
        return [x, y];
    });
    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    const areaD = `${pathD} L ${pts[pts.length - 1][0]} ${H - pad.bottom} L ${pts[0][0]} ${H - pad.bottom} Z`;
    return (
        <div style={{ marginTop: 10 }}>
            {label && <p style={{ fontSize: 11, fontWeight: 700, color: C.sub, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>}
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, overflow: 'visible' }}>
                <defs>
                    <linearGradient id={`grad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                    </linearGradient>
                </defs>
                {/* 網格線 */}
                {[0.25, 0.5, 0.75].map((f, i) => (
                    <line key={i} x1={pad.left} y1={pad.top + f * (H - pad.top - pad.bottom)}
                        x2={W - pad.right} y2={pad.top + f * (H - pad.top - pad.bottom)}
                        stroke={C.divider} strokeWidth="0.8" />
                ))}
                {/* 面積填充 */}
                <path d={areaD} fill={`url(#grad-${valueKey})`} />
                {/* 折線 */}
                <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {/* 首尾標記點 */}
                {[pts[0], pts[pts.length - 1]].map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={color} stroke="white" strokeWidth="1.5" />
                ))}
                {/* X 軸標籤 (優化過濾避免重疊) */}
                {(() => {
                    const labelIndices = [0, data.length - 1];
                    if (data.length > 5) {
                        labelIndices.push(Math.floor(data.length / 2));
                    }
                    if (data.length > 10) {
                        labelIndices.push(Math.floor(data.length / 4));
                        labelIndices.push(Math.floor(3 * data.length / 4));
                    }
                    const uniqueIndices = Array.from(new Set(labelIndices)).sort((a, b) => a - b);
                    return uniqueIndices.map(idx => {
                        const run = data[idx];
                        const xPt = pts[idx];
                        if (!xPt) return null;
                        return (
                            <text key={idx} x={xPt[0]} y={H - 5} textAnchor="middle"
                                fontSize="11" fill={C.sub} fontWeight="600">{run.date?.slice(5)}</text>
                        );
                    });
                })()}
                {/* 最大/最小值標籤 */}
                {(() => {
                    const maxIdx = vals.indexOf(maxV);
                    const minIdx = vals.indexOf(minV);
                    return [
                        maxIdx !== minIdx && <g key="max">
                            <text x={pts[maxIdx][0]} y={pts[maxIdx][1] - 8} textAnchor="middle" fontSize="11" fill={color} fontWeight="800">
                                {formatY ? formatY(maxV) : maxV}
                            </text>
                        </g>,
                        <g key="min">
                            <text x={pts[minIdx][0]} y={pts[minIdx][1] - 8} textAnchor="middle" fontSize="11" fill={C.sub} fontWeight="700">
                                {formatY ? formatY(minV) : minV}
                            </text>
                        </g>
                    ];
                })()}
            </svg>
        </div>
    );
};

/* ── 跑步距離點狀趨勢圖 ── */
const RunDotChart = ({ runs, height = 80 }) => {
    if (!runs || runs.length < 2) return null;

    // Aggregate by date — sum distances per calendar day so 484 GPS pings → ~31 days
    const byDate = {};
    runs.forEach(r => {
        if (!r.date) return;
        const d = r.date.slice(0, 10);
        byDate[d] = (byDate[d] || 0) + (r.distance || 0);
    });
    const daily = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, distance]) => ({ date, distance: Math.round(distance * 100) / 100 }));

    if (daily.length < 2) return null;

    const maxDist = Math.max(...daily.map(d => d.distance), 0.1);
    const minDist = Math.min(...daily.map(d => d.distance), 0);
    const range = maxDist - minDist || 0.1;
    const W = 300; const H = height;
    const padX = 12; const padY = 16;
    const pts = daily.map((r, i) => ({
        x: padX + (i / (daily.length - 1)) * (W - padX * 2),
        y: padY + (1 - (r.distance - minDist) / range) * (H - padY * 2),
        day: r,
        isBest: r.distance === maxDist,
    }));
    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return (
        <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.sub, margin: '0 0 6px', letterSpacing: '0.05em' }}>每日跑量趨勢 (km)</p>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
                {/* 連接線（淡虛線） */}
                <path d={lineD} fill="none" stroke={C.divider} strokeWidth="1.5" strokeDasharray="4 3" />
                {/* 點 */}
                {pts.map((p, i) => (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r={p.isBest ? 6 : 4}
                            fill={p.isBest ? C.success : C.orange}
                            stroke="white" strokeWidth="1.5" />
                        {/* 標籤只在最大、最小、首、尾顯示 */}
                        {(p.isBest || i === 0 || i === daily.length - 1 || p.day.distance === minDist) && (
                            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="11"
                                fill={p.isBest ? C.success : C.sub} fontWeight="800">
                                {p.day.distance}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
            {/* 首尾日期 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{daily[0]?.date?.slice(5)}</span>
                <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{daily[daily.length - 1]?.date?.slice(5)}</span>
            </div>
        </div>
    );
};

/* ── 配速區間環狀圖 ── */
const PaceZoneChart = ({ runs }) => {
    if (!runs || runs.length === 0) return null;
    // 配速越快（秒數越小）強度越高：快速 → 節奏 → 有氧 → 輕鬆。
    // 邏輯抽在 utils/paceZones.js：固定區間沒有鑑別度時自動切成「以本人中位數配速為基準」的個人化區間。
    const { zones, total, personalized } = computePaceZones(runs);
    const ZONE_COLORS = { fast: C.danger, tempo: C.coral, aerobic: C.blue, easy: C.success };
    const counts = zones.map(z => ({ ...z, color: ZONE_COLORS[z.key] || C.sub }));
    return (
        <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.sub, margin: '0 0 4px', letterSpacing: '0.05em' }}>配速區間分佈{personalized ? ' · 依你的配速個人化' : ''}</p>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px' }}>
                {personalized
                    ? '以你本月中位數配速為基準劃分 · 越快強度越高'
                    : '依每公里配速劃分 · 越快強度越高（健康的課表多數時間應落在輕鬆／有氧區）'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {counts.filter(z => z.count > 0).map((z, i) => (
                    <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: z.color }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{z.label}</span>
                                <span style={{ fontSize: 11, color: C.sub }}>{z.desc}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: z.color }}>{z.count} 次 ({Math.round(z.count / total * 100)}%)</span>
                        </div>
                        <ProgressBar value={z.count} max={total} color={z.color} height={7} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const TabCardio = ({ d }) => {
    const c = d.cardio;
    const runs = c.individual_runs || [];

    if (!c.run_count || c.run_count === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionTitle>跑步訓練</SectionTitle>
                <EmptyState icon={Activity} text="本月沒有跑步訓練紀錄" />
            </div>
        );
    }

    // 週跑量計算
    const weeklyRuns = (() => {
        const weeks = {};
        runs.forEach(r => {
            const dt = new Date(r.date);
            const day = dt.getDay();
            const monday = new Date(dt);
            monday.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
            const key = monday.toISOString().slice(5, 10);
            if (!weeks[key]) weeks[key] = { label: key, distance: 0, count: 0 };
            weeks[key].distance += r.distance;
            weeks[key].count++;
        });
        return Object.values(weeks).sort((a, b) => a.label.localeCompare(b.label));
    })();

    // 格式化總時長
    const totalMins = Math.round((c.total_duration_sec || 0) / 60);
    const durStr = totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${totalMins}m`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionTitle>跑步訓練 · {c.run_count} 次</SectionTitle>

            {/* ① 核心統計 4 格 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Card {...anim(0.03)} style={{ padding: '14px 16px' }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px' }}>總距離</p>
                    <p style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0 }}><CountUp value={c.total_distance_km} decimals={1} /><span style={{ fontSize: 12, color: C.sub, marginLeft: 3 }}>km</span></p>
                </Card>
                <Card {...anim(0.06)} style={{ padding: '14px 16px' }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px' }}>平均配速</p>
                    <p style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0 }}>{formatPace(c.avg_pace_sec)}</p>
                </Card>
                <Card {...anim(0.09)} style={{ padding: '14px 16px' }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.success, margin: '0 0 4px' }}>最佳配速</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: C.success, margin: 0 }}>{formatPace(c.best_pace_sec)}</p>
                </Card>
                <Card {...anim(0.12)} style={{ padding: '14px 16px' }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px' }}>總時間</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>{durStr}</p>
                </Card>
            </div>

            {/* ② 3 格小統計 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                    { label: '熱量', value: c.total_calories, unit: 'kcal' },
                    { label: '平均心率', value: c.avg_hr || '--', unit: 'bpm', noCountUp: !c.avg_hr },
                    { label: '最長跑距', value: c.longest_run_km, unit: 'km', decimals: 1 },
                ].map((item, i) => (
                    <Card key={i} {...anim(0.15 + i * 0.03)} style={{ padding: '12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.sub, margin: '0 0 4px', letterSpacing: '0.04em' }}>{item.label}</p>
                        <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>
                            {item.noCountUp ? item.value : <CountUp value={item.value} decimals={item.decimals || 0} />}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{item.unit}</p>
                    </Card>
                ))}
            </div>

            {/* ③ 配速進步 banner */}
            {c.pace_improvement_sec !== 0 && (
                <Card {...anim(0.22)} style={{
                    background: c.pace_improvement_sec > 0 ? '#F0FAF4' : '#FFFBF0',
                    border: `1px solid ${c.pace_improvement_sec > 0 ? '#D4EDDA' : '#FFF0CC'}`,
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                }}>
                    {c.pace_improvement_sec > 0
                        ? <TrendingUp size={20} color={C.success} />
                        : <TrendingDown size={20} color={C.warning} />}
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: c.pace_improvement_sec > 0 ? C.success : C.warning }}>
                            配速{c.pace_improvement_sec > 0 ? '進步' : '下降'} {Math.abs(c.pace_improvement_sec)} 秒/km
                        </p>
                        <p style={{ fontSize: 11, color: C.sub, margin: '2px 0 0' }}>月底 vs 月初平均比較</p>
                    </div>
                </Card>
            )}

            {/* ④ 配速趨勢折線圖 */}
            {runs.filter(r => r.pace > 0).length >= 2 && (
                <Card {...anim(0.28)}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '0 0 14px' }}>配速趨勢</p>
                    <RunLineChart
                        data={runs.filter(r => r.pace > 0)}
                        valueKey="pace"
                        color={C.coral}
                        height={90}
                        label="秒/km（越低越快）"
                        formatY={(v) => formatPace(v)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '8px 0 0', borderTop: `1px solid ${C.divider}` }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>最快</p>
                            <p style={{ fontSize: 13, fontWeight: 800, color: C.success, margin: '2px 0 0' }}>{formatPace(c.best_pace_sec)}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>平均</p>
                            <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '2px 0 0' }}>{formatPace(c.avg_pace_sec)}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>趨勢</p>
                            <p style={{ fontSize: 13, fontWeight: 800, margin: '2px 0 0', color: c.pace_improvement_sec > 0 ? C.success : c.pace_improvement_sec < 0 ? C.warning : C.sub }}>
                                {c.pace_improvement_sec > 0 ? `↑ 快 ${c.pace_improvement_sec}s` : c.pace_improvement_sec < 0 ? `↓ 慢 ${Math.abs(c.pace_improvement_sec)}s` : '→ 持平'}
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* ⑤ 每次跑量點狀趨勢 */}
            {runs.length >= 3 && (
                <Card {...anim(0.33)}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '0 0 14px' }}>每次跑量趨勢</p>
                    <RunDotChart runs={runs} height={90} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.divider}` }}>
                        {[
                            { label: '最長', value: `${c.longest_run_km} km`, color: C.success },
                            { label: '平均', value: `${(c.run_count > 0 ? c.total_distance_km / c.run_count : 0).toFixed(1)} km`, color: C.text },
                            { label: '總計', value: `${c.total_distance_km} km`, color: C.coral },
                        ].map((s, i) => (
                            <div key={i} style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: s.color, margin: '3px 0 0' }}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* ⑥ 週跑量分析 */}
            {weeklyRuns.length >= 2 && (
                <Card {...anim(0.38)}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '0 0 14px' }}>週跑量</p>
                    {(() => {
                        const maxWeekDist = Math.max(...weeklyRuns.map(w => w.distance), 0.1);
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {weeklyRuns.map((w, i) => (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>W{i + 1}</span>
                                                <span style={{ fontSize: 11, color: C.sub }}>{w.label}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, color: C.sub }}>{w.count} 次</span>
                                                <span style={{ fontSize: 13, fontWeight: 800, color: w.distance === maxWeekDist ? C.success : C.text }}>
                                                    {w.distance.toFixed(1)} km
                                                </span>
                                            </div>
                                        </div>
                                        <ProgressBar value={w.distance} max={maxWeekDist} color={w.distance === maxWeekDist ? C.success : C.coral} height={8} />
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </Card>
            )}

            {/* ⑦ 配速區間分佈 */}
            {runs.filter(r => r.pace > 0).length > 0 && (
                <Card {...anim(0.43)}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '0 0 14px' }}>配速區間</p>
                    <PaceZoneChart runs={runs} />
                </Card>
            )}

            {/* ⑧ 心率趨勢（若有資料） */}
            {runs.filter(r => r.hr_avg > 0).length >= 2 && (
                <Card {...anim(0.47)}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '0 0 14px' }}>心率趨勢</p>
                    <RunLineChart
                        data={runs.filter(r => r.hr_avg > 0)}
                        valueKey="hr_avg"
                        color="#EF4444"
                        height={80}
                        label="平均心率 (bpm)"
                        formatY={(v) => `${Math.round(v)}`}
                    />
                    {c.avg_hr > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.divider}`, display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>月均心率</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: '#EF4444', margin: '2px 0 0' }}>{c.avg_hr} bpm</p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>心率區間（估）</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: '2px 0 0' }}>
                                    {c.avg_hr < 130 ? 'Zone 1-2' : c.avg_hr < 155 ? 'Zone 3' : c.avg_hr < 170 ? 'Zone 4' : 'Zone 5'}
                                </p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>強度</p>
                                <p style={{ fontSize: 14, fontWeight: 800, margin: '2px 0 0', color: c.avg_hr < 130 ? C.success : c.avg_hr < 160 ? C.warning : '#EF4444' }}>
                                    {c.avg_hr < 130 ? '輕鬆' : c.avg_hr < 155 ? '有氧' : c.avg_hr < 170 ? '節奏' : '高強度'}
                                </p>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {/* ⑨ 詳細跑步紀錄（縮版） */}
            {runs.length > 0 && (
                <Card {...anim(0.50)} style={{ padding: '14px 0' }}>
                    <SectionTitle style={{ margin: '0 0 8px', padding: '0 18px' }}>本月跑步紀錄</SectionTitle>
                    {/* 表頭 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '4px 18px 8px', borderBottom: `1px solid ${C.divider}` }}>
                        {['日期', '里程', '配速', '時間'].map(h => (
                            <p key={h} style={{ fontSize: 11, fontWeight: 700, color: C.sub, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: h === '日期' ? 'left' : 'right' }}>{h}</p>
                        ))}
                    </div>
                    {runs.map((run, i) => {
                        const durMin = Math.round((run.duration || 0) / 60);
                        const durStr = durMin >= 60
                            ? `${Math.floor(durMin / 60)}h${String(durMin % 60).padStart(2,'0')}m`
                            : `${durMin}m`;
                        return (
                        <div key={i} style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                            alignItems: 'center', padding: '10px 18px',
                            borderBottom: i < runs.length - 1 ? `1px solid ${C.divider}` : 'none',
                            background: run.pace > 0 && run.pace === c.best_pace_sec ? C.success + '08' : 'transparent',
                        }}>
                            <p style={{ fontSize: 11, color: C.sub, margin: 0, fontWeight: 600 }}>{run.date.slice(5)}</p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: 0, textAlign: 'right' }}>
                                {run.distance}<span style={{ fontSize: 11, color: C.sub, marginLeft: 2 }}>km</span>
                            </p>
                            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, textAlign: 'right',
                                color: run.pace > 0 && run.pace === c.best_pace_sec ? C.success : C.coral }}>
                                {formatPace(run.pace)}
                                {run.pace > 0 && run.pace === c.best_pace_sec && <span style={{ fontSize: 11, marginLeft: 2 }}>🏆</span>}
                            </p>
                            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, margin: 0, textAlign: 'right' }}>
                                {durMin > 0 ? durStr : '--'}
                            </p>
                        </div>
                        );
                    })}
                </Card>
            )}
        </div>
    );
};


/* ══════════════════════════════════════
   Tab: 營養
   ══════════════════════════════════════ */
const TabNutrition = ({ d }) => {
    const n = d.nutrition;
    const target = n.targets || {};
    const modeLabels = { cutting: '減脂期', maintenance: '維持期', bulking: '增肌期' };
    const macros = [
        { label: '蛋白質', avg: n.avg_protein, target: target.protein, color: C.coral, unit: 'g' },
        { label: '碳水', avg: n.avg_carbs, target: target.carbs, color: C.orange, unit: 'g' },
        { label: '脂肪', avg: n.avg_fats, target: target.fats, color: C.olive, unit: 'g' },
    ];

    if (!n.logged_days || n.logged_days === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionTitle>營養攝取</SectionTitle>
                <EmptyState icon={Coffee} text="本月沒有營養攝取紀錄" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionTitle>營養攝取 · {n.logged_days}/{d.meta.days_in_month} 天</SectionTitle>

            {/* 營養模式標籤 */}
            <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: C.cream, color: C.khaki }}>{modeLabels[n.mode] || n.mode}</span>
                <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: C.divider, color: C.sub }}>紀錄率 {n.log_rate_pct}%</span>
            </div>

            {/* 熱量達標 */}
            <Card {...anim(0.05)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px' }}>每日平均熱量</p>
                        <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1 }}>
                            <CountUp value={n.avg_calories} /><span style={{ fontSize: 14, color: C.sub, marginLeft: 3 }}>kcal</span>
                        </p>
                    </div>
                    <ScoreRing score={n.calorie_adherence_pct} size={56} label="達標" thickness={4} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub }}>
                    <Target size={14} color={C.sub} />
                    <span>目標 {target.calories} kcal · {n.calorie_adherence_pct}% 天數達標</span>
                </div>
            </Card>

            {/* 巨量營養素 — 橫條圖 */}
            <Card {...anim(0.12)}>
                <SectionTitle style={{ margin: '0 0 14px' }}>巨量營養素</SectionTitle>
                {macros.map((m, i) => {
                    // 專業判定：蛋白質「吃夠」即達標；碳水/脂肪要落在目標 ±30% 區間（吃太多也不算達標）
                    const hit = m.target > 0 && (
                        m.label === '蛋白質'
                            ? m.avg >= m.target * 0.85
                            : (m.avg >= m.target * 0.7 && m.avg <= m.target * 1.3)
                    );
                    return (
                        <div key={m.label} style={{ marginBottom: i < macros.length - 1 ? 16 : 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{m.label}</span>
                                <span style={{ fontSize: 13, color: C.sub }}>
                                    <span style={{ fontWeight: 800, color: m.color }}>{m.avg}{m.unit}</span> / {m.target}{m.unit}
                                    {hit
                                        ? <span style={{ marginLeft: 6, fontSize: 11, color: C.success, fontWeight: 700 }}>✓</span>
                                        : <span style={{ marginLeft: 6, fontSize: 11, color: C.warning, fontWeight: 700 }}>✗</span>}
                                </span>
                            </div>
                            <ProgressBar value={m.avg} max={m.target || 1} color={m.color} height={8} />
                        </div>
                    );
                })}
            </Card>

            {/* 蛋白質達標 */}
            <Card {...anim(0.18)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '0 0 4px' }}>蛋白質達標天數</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: n.protein_adherence_pct >= 70 ? C.success : C.warning, margin: 0 }}>{n.protein_adherence_pct}%</p>
                </div>
                <Shield size={22} color={n.protein_adherence_pct >= 70 ? C.success : C.warning} />
            </Card>

            {/* 熱量赤字 / 盈餘分析 */}
            {(() => {
                const targetCal = target.calories || 2200;
                const avgCal = n.avg_calories || 0;
                const delta = avgCal - targetCal;   // positive = 盈餘(多吃), negative = 赤字(少吃)
                const absDelta = Math.abs(Math.round(delta));
                const isSurplus = delta > 50;
                const isDeficit = delta < -50;
                const isBalanced = !isSurplus && !isDeficit;
                const statusColor = isBalanced ? C.success : isSurplus ? C.coral : C.warning;
                const statusLabel = isBalanced ? '均衡' : isSurplus ? '熱量盈餘' : '熱量赤字';
                const statusDesc = isBalanced
                    ? '熱量攝取貼近目標，維持良好。'
                    : isSurplus
                        ? `每日平均比目標多攝取 ${absDelta} kcal，若目標為減脂需注意。`
                        : `每日平均比目標少攝取 ${absDelta} kcal，${n.mode === 'cutting' ? '有助減脂，但不宜過低影響肌肉。' : '可能影響訓練表現和肌肉合成。'}`;

                // 估算月累積赤字/盈餘
                const totalDelta = Math.round(delta * (n.logged_days || 1));
                // ~7700 kcal ≈ 1kg 體脂
                const estimatedKg = (Math.abs(totalDelta) / 7700).toFixed(2);

                return (
                    <Card {...anim(0.22)} style={{ border: `1px solid ${statusColor}25`, background: statusColor + '08' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                                <p style={{ fontSize: 12, fontWeight: 700, color: C.sub, margin: '0 0 4px', letterSpacing: '0.05em' }}>月度熱量平衡</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                    <span style={{ fontSize: 28, fontWeight: 800, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
                                        {delta > 0 ? '+' : ''}{Math.round(delta)}
                                    </span>
                                    <span style={{ fontSize: 13, color: C.sub }}>kcal/天</span>
                                </div>
                            </div>
                            <span style={{ padding: '5px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800, background: statusColor + '20', color: statusColor }}>
                                {statusLabel}
                            </span>
                        </div>
                        <p style={{ fontSize: 12, color: C.sub, margin: '0 0 12px', lineHeight: 1.5 }}>{statusDesc}</p>
                        {/* 月累積估算 */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1, background: C.bg, borderRadius: 12, padding: '10px 14px' }}>
                                <p style={{ fontSize: 11, color: C.sub, margin: '0 0 2px', fontWeight: 600 }}>月累積{isDeficit ? '赤字' : '盈餘'}</p>
                                <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: 0 }}>
                                    {delta > 0 ? '+' : ''}{totalDelta.toLocaleString()} kcal
                                </p>
                            </div>
                            <div style={{ flex: 1, background: C.bg, borderRadius: 12, padding: '10px 14px' }}>
                                <p style={{ fontSize: 11, color: C.sub, margin: '0 0 2px', fontWeight: 600 }}>
                                    {isDeficit ? '預估可消耗' : isBalanced ? '體重變化' : '預估脂肪增加'}
                                </p>
                                <p style={{ fontSize: 17, fontWeight: 800, color: statusColor, margin: 0 }}>
                                    {isBalanced ? '≈ 0 kg' : `≈ ${estimatedKg} kg`}
                                </p>
                            </div>
                        </div>
                    </Card>
                );
            })()}

            {/* 每日營養紀錄列表 */}
            {n.daily_records?.length > 0 && (
                <Card {...anim(0.25)} style={{ padding: '14px 0' }}>
                    <SectionTitle style={{ margin: '0 0 8px', padding: '0 18px' }}>每日營養紀錄</SectionTitle>
                    {n.daily_records.map((rec, i) => {
                        const target_cal = (n.targets?.calories) || 2200;
                        const hitCal = target_cal > 0 && Math.abs(rec.calories - target_cal) / target_cal <= 0.15;
                        return (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px 18px',
                                borderBottom: i < n.daily_records.length - 1 ? `1px solid ${C.divider}` : 'none',
                            }}>
                                <div>
                                    <p style={{ fontSize: 11, color: C.sub, margin: '0 0 2px', fontWeight: 600 }}>{rec.date}</p>
                                    <p style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0 }}>
                                        {rec.calories}<span style={{ fontSize: 11, color: C.sub, marginLeft: 2 }}>kcal</span>
                                        {hitCal && <span style={{ marginLeft: 6, fontSize: 11, color: C.success, fontWeight: 700 }}>✓</span>}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', gap: 10 }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: C.sub, margin: '0 0 1px' }}>蛋白質</p>
                                        <p style={{ fontSize: 13, fontWeight: 800, color: C.coral, margin: 0 }}>{rec.protein}g</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: 11, color: C.sub, margin: '0 0 1px' }}>碳水</p>
                                        <p style={{ fontSize: 13, fontWeight: 800, color: C.orange, margin: 0 }}>{rec.carbs}g</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: 11, color: C.sub, margin: '0 0 1px' }}>脂肪</p>
                                        <p style={{ fontSize: 13, fontWeight: 800, color: C.olive, margin: 0 }}>{rec.fats}g</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </Card>
            )}

            {/* 身體組成變化 */}
            {d.body && Object.keys(d.body).length > 0 && (
                <Card {...anim(0.22)}>
                    <SectionTitle style={{ margin: '0 0 12px' }}>本月身體組成變化</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        {[
                            { label: '體重', value: d.body.weight_delta, unit: 'kg', reverse: false },
                            { label: '體脂', value: d.body.fat_delta, unit: '%', reverse: true },
                            { label: '肌肉', value: d.body.muscle_delta, unit: 'kg', reverse: false },
                        ].map((item, i) => {
                            const positive = item.reverse ? item.value < 0 : item.value > 0;
                            const color = item.value === 0 ? C.sub : (positive ? C.success : C.warning);
                            return (
                                <div key={i} style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: 11, color: C.sub, margin: '0 0 4px' }}>{item.label}</p>
                                    <p style={{ fontSize: 20, fontWeight: 800, color, margin: 0 }}>
                                        {item.value > 0 ? '+' : ''}{item.value}{item.unit}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
};


/* ══════════════════════════════════════
   Tab: 建議 — 最重要的頁面
   ══════════════════════════════════════ */
const TabPlan = ({ d }) => {
    const recs = d.recommendations || [];
    const highCount = recs.filter(r => r.priority === 'high').length;
    const medCount = recs.filter(r => r.priority === 'medium').length;
    const lowCount = recs.filter(r => r.priority === 'low').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* 摘要卡（hero，保留卡片 + 鈦金屬深板漸層，該浮起來）*/}
            <Card {...anim(0)} style={{ background: 'linear-gradient(150deg, #232021 0%, #161415 55%, #100E0F 100%)', color: '#fff', border: 'none', padding: '24px 20px', marginBottom: 28, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 40px -18px rgba(22,20,21,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Target size={22} color={C.coral} />
                    <h3 style={{ fontFamily: TENOR, fontSize: 22, fontWeight: 400, margin: 0, letterSpacing: '-0.01em' }}>
                        {recs.length === 0 ? '一切順利！' : `${recs.length} 項優化建議`}
                    </h3>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.7, margin: 0 }}>
                    {recs.length === 0
                        ? '本月的訓練、跑步和營養都在正軌上，繼續保持！'
                        : `基於你 ${d.meta.month_zh} 的完整訓練數據分析，以下是個人化計劃調整建議。`}
                </p>
                {recs.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        {highCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, background: 'rgba(249,92,75,0.18)', color: '#FF8A80' }}>{highCount} 高優先</span>}
                        {medCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)' }}>{medCount} 中優先</span>}
                        {lowCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)' }}>{lowCount} 建議</span>}
                    </div>
                )}
            </Card>

            {/* 建議清單 */}
            {recs.length > 0 ? (
                recs.map((rec, i) => <RecommendationCard key={i} rec={rec} index={i} />)
            ) : (
                <Card {...anim(0.1)} style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <CheckCircle2 size={40} color={C.success} style={{ margin: '0 auto 14px' }} />
                    <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: C.text }}>狀態良好</p>
                    <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>目前不需要調整計劃，持續保持就好！</p>
                </Card>
            )}

            {/* 底部摘要 */}
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: 0 }}>
                    報告產生於 {d.meta.generated_at?.split('T')[0]} · 數據來源：真實訓練紀錄
                </p>
            </div>
        </div>
    );
};

export default MonthlyReportPage;
