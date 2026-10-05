import React, { useMemo, useState, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { ArrowLeft, Share2, ChevronRight, ChevronDown, BookmarkPlus, Check } from 'lucide-react';
import { brandColors as C } from '../utils/colors';
import { SaveWorkoutBlockModal } from './WorkoutBlockModals';
import HoldToCancelRecord from './HoldToCancelRecord';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { buildStrengthIntelligence, buildStrengthCharts } from '../utils/strengthCoachEngine';
import { useMembership } from '../utils/membership';
import MemberLockCard from './MemberLockCard';
import { saveStrengthEcho } from '../utils/planEcho';
import { firePostWorkoutNudges } from '../utils/workoutReminders';
import { sessionVolume, totalVolume as sumSets } from '../utils/strengthMath';

// ─────────────────────────────────────────────────────────────
//  StrengthResultsMobile — 重訓「結算頁」
//  設計語言：完全比照 CardioResultsMobile 的「瑞士極簡雜誌」排版
//    · paper 底色、無圓角卡片
//    · — SECTION 小標 + 1px 細線分隔
//    · 2x2 cross-divider 數據格、垂直 1px 顏色條取代 icon
//    · 等寬數字 (tabular-nums)
//  按鈕：Liquid Glass 材質 (backdrop blur + 鏡面高光 + 互動回饋)
//  含完整動作菜單 (每組 kg×reps) 與「本日 MVP」分析。
// ─────────────────────────────────────────────────────────────

const SWISS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';

const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString();
const fmtTime = (s) => {
    const sec = Math.max(0, Math.round(Number(s) || 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }
    return `${m}:${String(r).padStart(2, '0')}`;
};

// ── Section 小標：— LABEL ──────────────────────────────────
const SectionLine = ({ label, right, rightColor }) => (
    <div className="flex items-center justify-between mb-5 mt-2">
        <span className="text-[11px] font-black uppercase tracking-[0.28em] text-black/45">
            — {label}
        </span>
        {right && (
            <span className="text-[11px] font-black uppercase tracking-[0.28em] tabular-nums"
                style={{ color: rightColor || 'rgba(0,0,0,0.35)' }}>
                {right}
            </span>
        )}
    </div>
);

// ── 圖表看圖說話短評（每張圖底下一句，§1.4 C1）──
const ChartNote = ({ children }) => (
    <p className="text-[11px] leading-relaxed text-black/50 mt-3" style={{ fontWeight: 450 }}>
        {children}
    </p>
);
// 資料不足的誠實空狀態（C3）
const ChartEmpty = ({ children }) => (
    <div className="py-6 text-center">
        <p className="text-[11px] text-black/40 leading-relaxed" style={{ fontWeight: 450 }}>{children}</p>
    </div>
);

// 1) 容量趨勢：直條，本次高亮（C2）
const MiniBars = ({ bars }) => {
    const max = Math.max(1, ...bars.map((b) => b.vol));
    return (
        <div className="flex items-end gap-1.5" style={{ height: 78 }}>
            {bars.map((b, i) => {
                const h = Math.max(5, Math.round((b.vol / max) * 70));
                return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                        {b.isCurrent && <span className="text-[11px] font-black sr-mono mb-1" style={{ color: C.coralDeep }}>{fmtNum(b.vol)}</span>}
                        <div style={{ width: '100%', maxWidth: 24, height: h, borderRadius: 3, background: b.isCurrent ? C.coral : 'rgba(22,20,21,0.13)' }} />
                    </div>
                );
            })}
        </div>
    );
};

// 2) e1RM 進展：折線，末點高亮 + 歷史最佳虛線（C2）
const MiniLine = ({ points, best }) => {
    const W = 300, H = 66, pad = 8;
    const vals = points.map((p) => p.e1rm);
    const min = Math.min(...vals), max = Math.max(...vals, best || 0);
    const span = Math.max(1, max - min);
    const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, points.length - 1);
    const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.e1rm).toFixed(1)}`).join(' ');
    const bestY = best ? y(best) : null;
    const last = points[points.length - 1];
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
            {bestY != null && <line x1={pad} y1={bestY} x2={W - pad} y2={bestY} stroke="rgba(22,20,21,0.18)" strokeWidth="1" strokeDasharray="3 3" />}
            <path d={d} fill="none" stroke="rgba(22,20,21,0.35)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.e1rm)} r={p.isCurrent ? 4 : 2.4}
                    fill={p.isCurrent ? C.coral : 'rgba(22,20,21,0.3)'} />
            ))}
            <text x={x(points.length - 1)} y={y(last.e1rm) - 8} textAnchor="end"
                fontSize="10" fontWeight="900" fill={C.coralDeep} style={{ fontVariantNumeric: 'tabular-nums' }}>{last.e1rm}kg</text>
        </svg>
    );
};

// 3) 肌群平衡雷達（六軸）
const MiniRadar = ({ axes }) => {
    const cx = 88, cy = 84, R = 58;
    const pt = (i, r) => {
        const a = (-90 + i * 60) * Math.PI / 180;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const grid = axes.map((_, i) => pt(i, R));
    const poly = axes.map((ax, i) => pt(i, Math.max(0.06, ax.norm) * R));
    const toStr = (arr) => arr.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    return (
        <svg viewBox="0 0 176 168" width="100%" height={172} preserveAspectRatio="xMidYMid meet">
            {[0.33, 0.66, 1].map((f, k) => (
                <polygon key={k} points={toStr(axes.map((_, i) => pt(i, R * f)))} fill="none" stroke="rgba(22,20,21,0.10)" strokeWidth="1" />
            ))}
            {grid.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="rgba(22,20,21,0.08)" strokeWidth="1" />)}
            <polygon points={toStr(poly)} fill="rgba(249,92,75,0.16)" stroke={C.coral} strokeWidth="1.6" />
            {axes.map((ax, i) => {
                const [lx, ly] = pt(i, R + 13);
                return (
                    <text key={i} x={lx} y={ly + 3} textAnchor="middle" fontSize="9" fontWeight="800"
                        fill={ax.volume > 0 ? 'rgba(22,20,21,0.6)' : 'rgba(22,20,21,0.25)'}>{ax.label}</text>
                );
            })}
        </svg>
    );
};

// 4) 負荷 ACWR 儀表（區帶 + 標記）
const AcwrGauge = ({ acwr, zone }) => {
    const clamp = Math.max(0, Math.min(2, acwr));
    const pos = (clamp / 2) * 100;
    const zoneColor = { overload: '#D94030', caution: '#F09A3E', optimal: C.coral, detraining: 'rgba(22,20,21,0.4)' }[zone] || C.coral;
    const zoneTxt = { overload: '過載', caution: '偏高', optimal: '最佳', detraining: '偏低' }[zone] || '';
    return (
        <div>
            <div className="flex items-baseline justify-between mb-2">
                <span className="sr-mono" style={{ fontSize: 30, fontWeight: 900, color: zoneColor, lineHeight: 1 }}>{acwr?.toFixed(2)}</span>
                <span className="text-[12px] font-black tracking-[0.14em]" style={{ color: zoneColor }}>{zoneTxt}區間</span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: '40%', background: 'rgba(22,20,21,0.14)' }} />
                <div style={{ width: '25%', background: 'rgba(249,92,75,0.35)' }} />
                <div style={{ width: '10%', background: 'rgba(240,154,62,0.5)' }} />
                <div style={{ width: '25%', background: 'rgba(217,64,48,0.45)' }} />
                <div style={{ position: 'absolute', top: -3, left: `calc(${pos}% - 2px)`, width: 4, height: 14, borderRadius: 2, background: C.ink }} />
            </div>
            <div className="flex justify-between mt-1.5">
                <span className="text-[12px] font-bold tracking-widest text-black/30">0.8 偏低</span>
                <span className="text-[12px] font-bold tracking-widest text-black/30">1.3 · 1.5 過載</span>
            </div>
        </div>
    );
};

const StrengthResultsMobile = ({
    exercises = [],
    durationSeconds = 0,
    calories = 0,
    completedSets = 0,
    totalSets = 0,
    heartRate = 0,
    intensity = 0,
    avgEffort: avgEffortProp = 0,
    exercisePRs = {},
    prAlerts = [],              // 🆕 訓練中「實際偵測到的 PR 事件」— 與動態/後端同一來源
    completedDate = new Date(),
    focusGroup = '',
    caloriesEstimated = false, // 🆕 沒有手錶實測 → 卡路里標「預估」
    userId = null,
    onShare,
    onExit,
    onSaveRecord = null, // 🆕 儲存紀錄按鈕（分享成果旁）
    onCancelRecord = null, // 🗑️ 長按取消這筆紀錄（外圈進度環跑滿 → 確認 → 刪除）
}) => {
    // 🩹 原本在這裡自己 reduce 一次 weight×reps，與動態卡/進化日誌/今日議程
    //    各算各的（0 公斤徒手組、四捨五入的處理都不一致）。改走全站唯一入口。
    const totalVolume = useMemo(() => sessionVolume({ exercises }), [exercises]);

    /* 🩹 顯示上限一致性：effortScore 的產生端（WorkoutSessionViewMobile 的
       calculateEffortScore）封頂是 120，但這裡標的是「/100」。不夾住的話，
       表現越好的使用者越可能看到「112 / 100」這種自相矛盾的數字 ——
       等於越努力，介面看起來越像壞掉。
       這裡跟隔壁的 intensityScore 用同一套夾法，兩個分數的上限才會一致。 */
    const avgEffort = useMemo(() => {
        const raw = avgEffortProp > 0
            ? avgEffortProp
            : (() => {
                const scores = exercises.flatMap(ex => ex.sets?.map(s => s.effortScore || 0).filter(Boolean) || []);
                return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            })();
        return Math.min(100, Math.round(raw));
    }, [exercises, avgEffortProp]);

    const intensityScore = Math.min(100, Math.round(intensity > 0 ? intensity : avgEffort));

    /* 🩹「負荷 · 強度」要顯示哪幾格 —— 同一個數字不重複出現兩次。
       intensityScore 在沒有實測 intensity 時是 avgEffort 的複製品，
       那種情況只留 Avg Effort 一格（截圖上 94% 與 94/100 就是這個 bug）。 */

    /* 卡片右上角的數值是否已經在句子裡出現過（避免同一個數字在一張卡上顯示兩次）。
       比對數字本身，不比對單位 —— 「ACWR 4」的 4 與「月均的 4 倍」的 4 是同一個。 */
    const metricEchoed = (c) => {
        const nums = String(c?.metric ?? '').match(/\d+(?:\.\d+)?/g);
        if (!nums || nums.length === 0) return false;
        const text = `${c?.verdict ?? ''}`;
        return nums.every(n => {
            const plain = String(Number(n));           // 「4.0」與「4」視為同一個
            return text.includes(n) || text.includes(plain);
        });
    };

    const hasRealIntensity = intensity > 0 && Math.round(intensity) !== Math.round(avgEffort);
    const intensityCells = [
        ...(hasRealIntensity ? [{ label: 'Intensity', value: intensityScore, unit: '%', accent: true }] : []),
        // 正名：這是耗力分數（0–100），不是 RPE（1–10），標成 RPE 會誤導
        { label: 'Avg Effort', value: avgEffort, unit: '/100', accent: !hasRealIntensity },
    ];

    // ── 完整動作菜單（含每一組 kg × reps）──
    // 🩹 PR 顯示一致性（圖八「下拉」沒 PR、從動態進去又有的修法）：
    //   結算頁優先用「訓練中實際偵測到的 PR 事件」(prAlerts) —— 與動態/後端同一來源。
    //   舊版用 maxW > exercisePRs[name] 會踩「跟自己比」的坑：exercisePRs 在訓練途中
    //   已被今天的重量墊高，於是 maxW === 基準 → 判不出 PR。prAlerts 是當下真的破的紀錄，不會漏。
    const prNames = useMemo(() => {
        const s = new Set();
        (prAlerts || []).forEach(a => {
            const n = a?.exercise || a?.name;
            if (n) s.add(String(n).toLowerCase().trim());
        });
        return s;
    }, [prAlerts]);

    const menu = useMemo(
        () => exercises
            .map(ex => {
                const allSets = ex.sets || [];
                const doneSets = allSets.filter(s => s.completed || (s.weight && s.reps) || s.weight || s.reps);
                const maxW = Math.max(0, ...doneSets.map(s => parseFloat(s.weight) || 0));
                const vol = doneSets.reduce((a, s) => a + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0);
                // 優先信任 prAlerts；沒有 prAlerts 資料時（例如舊紀錄）才退回重量比較
                const isPR = prNames.has(String(ex.name || '').toLowerCase().trim())
                    || (prNames.size === 0 && maxW > 0 && maxW > (exercisePRs[ex.name] || 0));
                return {
                    name: ex.name || 'Exercise',
                    maxWeight: maxW,
                    volume: vol,
                    isPR,
                    setRows: doneSets.map((s, i) => ({
                        idx: i + 1,
                        weight: parseFloat(s.weight) || 0,
                        reps: parseInt(s.reps) || 0,
                    })),
                };
            })
            .filter(ex => ex.setRows.length > 0),
        [exercises, exercisePRs, prNames]
    );

    const prCount = menu.filter(ex => ex.isPR).length;
    const hasPR = prCount > 0;

    // ── 儲存今日菜單為 Block（區塊化訓練計劃）──
    const [saveBlockOpen, setSaveBlockOpen] = useState(false);
    const [savedBlock, setSavedBlock] = useState(null);
    // 🆕 底部「儲存紀錄」按鈕狀態
    const [recordSaved, setRecordSaved] = useState(false);
    // 🆕 深度分析摺疊：結算頁只給簡要（分數/肯定/進步/菜單），完整判讀收進這裡（預設收合）
    const [showDeep, setShowDeep] = useState(false);
    const { canUse: memberCan } = useMembership();
    const strengthFull = memberCan('strengthAnalysis');   // 💳 完整健身分析：分數拆解、逐項判讀、成長趨勢

    // 🩹 移除「下載完整報告 PDF」：結算頁的工作是讓人一眼看懂這次練得如何，
    //    產出一份 A4 報告不是這頁的職責，底部只留 返回／儲存紀錄／分享成果。
    const reportRef = useRef(null);
    const blockExercises = useMemo(
        () => menu.map(m => ({
            name: m.name,
            sets: m.setRows.length || 3,
            reps: String(m.setRows[0]?.reps || '8–12'),
            rest: '90s',
        })),
        [menu]
    );

    // ── 本日 MVP：依「單動作總容量」選出貢獻最大的動作 ──
    const mvp = useMemo(() => {
        if (menu.length === 0) return null;
        return [...menu].sort((a, b) => b.volume - a.volume)[0];
    }, [menu]);
    const mvpShare = mvp && totalVolume > 0 ? Math.round((mvp.volume / totalVolume) * 100) : 0;

    const dateObj = completedDate instanceof Date ? completedDate : new Date(completedDate || Date.now());
    const heroTitle = hasPR ? 'NEW APEX' : (focusGroup ? String(focusGroup).toUpperCase() : 'SESSION');

    // ── AI 教練總評：把數據翻成意義（容量±% / PR / 近30天最佳 / 完成度），語氣自適應 ──
    //   I9 永不空手：先用「前端純函式引擎」算出離線也保證存在的 F1–F4 + Strength Score，
    //   後端總評到達後再覆蓋文案（分數恆用前端計算，後端不提供分數）。
    // 近 60 筆歷史（給進步比較 / ACWR / 趨勢圖表用）；抓不到就退化成空陣列，回饋照樣出（I9）。
    const [priorWorkouts, setPriorWorkouts] = useState([]);
    useEffect(() => {
        let alive = true;
        const uid = userId || getUserId();
        if (!uid) return undefined;
        apiClient.get(`/api/workout/history/${uid}?limit=60`)
            .then(({ data }) => {
                const list = Array.isArray(data?.history) ? data.history : [];
                // 剔除「本次」紀錄（30 分鐘內、容量幾乎相同）避免跟自己比、ACWR 重複計。
                const now = Date.now();
                const cleaned = list.filter((w) => {
                    const t = Date.parse(w?.timestamp || 0);
                    const v = Number(w?.total_volume ?? w?.totalVolume ?? 0);
                    const isSelf = Number.isFinite(t) && (now - t) < 1800e3 && Math.abs(v - totalVolume) < 1;
                    return !isSelf;
                });
                if (alive) setPriorWorkouts(cleaned);
            })
            .catch(() => { /* 靜默：無歷史不影響結算頁 */ });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const engineSession = useMemo(() => ({
        exercises, completedSets, totalSets, durationSeconds,
        focusGroup, exercisePRs, totalVolume, priorWorkouts,
    }), [exercises, completedSets, totalSets, durationSeconds, focusGroup, exercisePRs, totalVolume, priorWorkouts]);

    const clientIntel = useMemo(() => {
        try { return buildStrengthIntelligence(engineSession); } catch { return null; }
    }, [engineSession]);

    const charts = useMemo(() => {
        try { return buildStrengthCharts(engineSession); } catch { return null; }
    }, [engineSession]);

    // 🔁 Plan Echo：把本次結算濃縮成列點存檔 — 下次開「同款/相似」課表會跳出「上次表現」提示
    // 🔔 同時觸發結算後推播（PR 慶祝 / 恢復提醒排程）
    // ⚠️ 只在「剛完成的結算」觸發（有 onSaveRecord = 新鮮結算）；
    //    從歷史紀錄頁（StrengthSessionDetailMobile）回看舊紀錄時不重存、不重推。
    const isFreshSettlement = !!onSaveRecord;
    const echoSavedRef = useRef(false);
    useEffect(() => {
        if (!isFreshSettlement) return;
        if (echoSavedRef.current || !clientIntel || menu.length === 0) return;
        echoSavedRef.current = true;
        const uid = userId || getUserId();
        try {
            saveStrengthEcho(uid, {
                exercises,
                coachSummary: clientIntel,
                stats: { volume: totalVolume, prCount, focusGroup },
            });
        } catch { /* 回聲屬 nice-to-have，不影響結算頁 */ }
        try {
            firePostWorkoutNudges(uid, { type: 'strength', prCount, volume: totalVolume, focusGroup });
        } catch { /* 推播失敗不影響結算頁 */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientIntel, menu.length]);

    const [serverSummary, setServerSummary] = useState(null);
    // 後端到達 → 沿用其文案，但分數/pillar 一律取自前端引擎（誠實、離線可算）
    const coachSummary = useMemo(() => {
        if (!serverSummary) return clientIntel;
        return {
            ...serverSummary,
            strengthScore: clientIntel?.strengthScore ?? null,
            strengthGrade: clientIntel?.strengthGrade ?? null,
            scorePillars: clientIntel?.scorePillars ?? [],
            scoreBasis: clientIntel?.scoreBasis ?? 'insufficient',
            // F3 卡池 / F5 趨勢一律取自前端分析引擎（誠實、離線可算）
            coachCards: clientIntel?.coachCards ?? [],
            trend: clientIntel?.trend ?? null,
        };
    }, [serverSummary, clientIntel]);

    /* 🩹 卡片的建議若「教練」區已經講過就不重複顯示。
       ⚠️ 這段一定要放在 coachSummary **之後** —— 原本寫在它上面，
       useMemo 的工廠函式在 render 當下就會執行，讀到還在 TDZ 的 const，
       丟出 ReferenceError: Cannot access 'coachSummary' before initialization。
       結果就是「動態卡點進去每一張都變成『頁面暫時迷路了』」。
       截圖上「接下來 2–3 天把量收回來」同時出現在卡片和教練 bullet，是同一句話講兩次。
       比對方式：取建議中最長的中文片段，看教練的任何一條是否包含它。 */
    const coveredByCoach = useMemo(() => {
        const points = (Array.isArray(coachSummary?.coaching_points) && coachSummary.coaching_points.length > 0
            ? coachSummary.coaching_points
            : [coachSummary?.coaching]).filter(Boolean).map(String);
        return (action) => {
            if (!action || points.length === 0) return false;
            const key = String(action).replace(/[。，、！？\s→]/g, '');
            if (key.length < 6) return false;
            return points.some(p => {
                const q = p.replace(/[。，、！？\s→]/g, '');
                return q.includes(key) || key.includes(q.slice(0, Math.max(8, Math.min(20, q.length))));
            });
        };
    }, [coachSummary]);

    useEffect(() => {
        let alive = true;
        const uid = getUserId();
        if (!uid || (menu.length === 0 && !hasPR)) return undefined;
        const pr_alerts = menu
            .filter(m => m.isPR)
            .map(m => ({ name: m.name, oldPR: exercisePRs[m.name] || 0, newPR: m.maxWeight }));
        apiClient
            .post('/api/ai/workout-summary', {
                user_id: uid,
                workout: {
                    total_volume: totalVolume,
                    focus_group: focusGroup,
                    pr_alerts,
                    completed_sets: completedSets,
                    total_sets: totalSets,
                    // 🆕 資深教練模型 v2：附上真實逐組數據（e1RM / RPE / 有效組數分析用）
                    duration_seconds: durationSeconds,
                    exercises: exercises.map(ex => ({
                        name: ex.name,
                        sets: (ex.sets || [])
                            .filter(s => s && (s.completed || (s.weight && s.reps)))
                            .map(s => ({
                                weight: parseFloat(s.weight) || 0,
                                reps: parseInt(s.reps) || 0,
                                rpe: parseFloat(s.rpe) || 0,
                            })),
                    })).filter(ex => ex.sets.length > 0),
                },
            })
            .then(({ data }) => {
                if (alive && data?.summary?.summary) {
                    setServerSummary(data.summary);
                    // 🆕 動作級教練回饋 → 存本機；下次訓練做到同動作時，訓練面板會顯示提醒
                    try {
                        const notes = data.summary.exercise_notes;
                        const targetUid = userId || uid;
                        if (notes && targetUid && Object.keys(notes).length > 0) {
                            const key = `drvn:coachNotes:${targetUid}`;
                            const existing = JSON.parse(localStorage.getItem(key)) || {};
                            const today = new Date().toISOString();
                            Object.entries(notes).forEach(([name, note]) => {
                                if (name && note) existing[name] = { note, date: today };
                            });
                            localStorage.setItem(key, JSON.stringify(existing));
                        }
                    } catch { /* 存失敗不影響結算頁 */ }
                }
            })
            .catch(() => { /* 靜默失敗：結算頁不因總評缺失而破版 */ });
        return () => { alive = false; };
        // 結算頁資料在掛載時即固定，僅需執行一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 核心四大數據（2x2 grid）──
    const coreMetrics = [
        { id: 'vol', label: 'Volume', unit: 'kg', value: fmtNum(totalVolume), accent: true, active: totalVolume > 0 },
        { id: 'sets', label: 'Sets Done', unit: totalSets > 0 ? `/${totalSets}` : '', value: String(completedSets), active: completedSets > 0 },
        // 🩹 值是 m:ss 格式，單位標成 "min" 會誤導（0:05 是 5 秒不是 5 分）→ 改標 MIN:SEC
        { id: 'time', label: 'Active Time', unit: 'min:sec', value: fmtTime(durationSeconds), active: durationSeconds > 1 },
        // 🩹 沒有手錶實測時卡路里是 MET 公式推算的 → 必須誠實標「預估」
        { id: 'cal', label: caloriesEstimated ? 'Energy Burn · 預估' : 'Energy Burn', unit: 'kcal', value: fmtNum(calories), active: calories > 0 },
    ];

    return (
        <div className="strength-result-wrapper relative" ref={reportRef}>
            <style>{`
                .strength-result-wrapper {
                    padding: 24px;
                    padding-top: max(env(safe-area-inset-top), 40px);
                    padding-bottom: 140px;
                    min-height: 100dvh;
                    width: 100%;
                    box-sizing: border-box;
                    color: ${C.ink};
                    font-family: ${SWISS};
                    background-color: ${C.paper};
                    overflow-x: hidden;
                }
                .sr-mono { font-variant-numeric: tabular-nums; }

                /* ── Liquid Glass 材質 (iOS 26 風格 web 轉譯) ── */
                .lg-btn {
                    position: relative;
                    border: none;
                    cursor: pointer;
                    -webkit-tap-highlight-color: transparent;
                    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease;
                    backdrop-filter: blur(18px) saturate(180%);
                    -webkit-backdrop-filter: blur(18px) saturate(180%);
                    overflow: hidden;
                }
                .lg-btn:active { transform: scale(0.95); }
                /* 鏡面高光：頂部一道反光，模擬玻璃曲面 */
                .lg-btn::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    background: linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 32%, transparent 60%);
                    pointer-events: none;
                    opacity: 0.9;
                }
                /* 內緣描邊：玻璃厚度感 */
                .lg-btn::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25), inset 0 1px 1px rgba(255,255,255,0.5);
                    pointer-events: none;
                }
                .lg-glass-light {
                    background: rgba(246,244,241,0.55);
                    box-shadow: 0 6px 20px rgba(22,20,21,0.12), 0 1px 0 rgba(255,255,255,0.6);
                }
                .lg-glass-dark {
                    background: rgba(22,20,21,0.78);
                    color: ${C.paper};
                    box-shadow: 0 12px 34px rgba(22,20,21,0.34), 0 1px 0 rgba(255,255,255,0.12);
                }
                .lg-glass-dark::before {
                    background: linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 34%, transparent 62%);
                }
                .lg-glass-dark::after {
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 1px 1px rgba(255,255,255,0.22);
                }
            `}</style>

            {/* ── Top bar：返回 (liquid glass 圓形) ── */}
            <div className="flex justify-between items-center mb-6">
                <motion.button {...pressProps('row')}
 onClick={onExit}
 className="lg-btn lg-glass-light"
 style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -2 }}
 aria-label="返回"
 >
                    <ArrowLeft size={20} className="text-black relative z-10" />
                </motion.button>
            </div>

            {/* ── Editorial Hero ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col mb-2"
            >
                <div className="flex items-center justify-between mb-5">
                    <span className="text-[11px] font-black uppercase tracking-[0.32em] text-black/40">— Strength Report</span>
                    <span className="text-[11px] font-black uppercase tracking-[0.32em] text-black/40">
                        No. {String(dateObj.getDate()).padStart(2, '0')}/{String(dateObj.getMonth() + 1).padStart(2, '0')}
                    </span>
                </div>
                <h1 style={{
                    fontSize: 'clamp(2.4rem, 9vw, 3.4rem)', fontWeight: 900, lineHeight: '0.95',
                    letterSpacing: '-0.045em', textTransform: 'uppercase', fontFamily: SWISS, margin: 0, color: C.ink,
                }}>
                    {heroTitle}
                </h1>
                <div className="flex items-baseline gap-3 mt-3">
                    <p className="text-[11px] font-black text-black/55 uppercase tracking-[0.25em]">
                        {dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <span className="text-[11px] text-black/25">/</span>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em]"
                        style={{ color: hasPR ? C.coralDeep : 'rgba(22,20,21,0.4)' }}>
                        {hasPR ? `${prCount} New PR` : 'Logged'}
                    </p>
                </div>
            </motion.div>

            {/* ── OVERVIEW：2x2 Swiss cross-divider grid ── */}
            <motion.div
                className="mt-8"
                initial="hidden" animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
            >
                <SectionLine label="本次成績" right={hasPR ? '新紀錄' : null} rightColor={C.coralDeep} />
                <div className="grid grid-cols-2" style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}>
                    {coreMetrics.map((m, i) => (
                        <motion.div
                            key={m.id}
                            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } }}
                            className="flex flex-col justify-between py-5 px-1"
                            style={{
                                opacity: m.active ? 1 : 0.45,
                                borderLeft: i % 2 === 1 ? '1px solid rgba(0,0,0,0.10)' : 'none',
                                borderBottom: i < 2 ? '1px solid rgba(0,0,0,0.10)' : 'none',
                                paddingLeft: i % 2 === 1 ? '18px' : '4px',
                            }}
                        >
                            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/55 mb-3">{m.label}</span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="sr-mono" style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', color: m.accent ? C.coral : C.ink }}>
                                    {m.value}
                                </span>
                                {m.unit && <span className="text-[11px] font-bold uppercase tracking-widest text-black/40 ml-0.5">{m.unit}</span>}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* ── INTENSITY：強度 / RPE / 完成率 三欄 ── */}
            <motion.div className="mt-8"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <SectionLine label="負荷 · 強度" right={heartRate > 0 ? `${Math.round(heartRate)} BPM` : null} />
                <div className={intensityCells.length === 1 ? 'grid grid-cols-1' : 'grid grid-cols-2'} style={{ borderTop: '1px solid rgba(0,0,0,0.10)', borderBottom: '1px solid rgba(0,0,0,0.10)' }}>
                    {/* 🩹 去重：
                        · Completion 拿掉 —— 上方 Overview 的「Sets Done 2/12」講的是同一件事。
                        · Intensity 只在「真的有實測強度」時才出現 —— intensityScore 在沒有 intensity
                          時會直接複製 avgEffort，兩格顯示同一個數字（截圖上的 94% 與 94/100）。 */}
                    {intensityCells.map((m, i) => (
                        <div key={m.label} className="flex flex-col py-5 px-1"
                            style={{ borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.10)' : 'none', paddingLeft: i > 0 ? '16px' : '4px' }}>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-black/55 mb-3">{m.label}</span>
                            <div className="flex items-baseline gap-1">
                                <span className="sr-mono" style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: m.accent ? C.coral : C.ink }}>{m.value}</span>
                                <span className="text-[11px] font-bold uppercase tracking-widest text-black/40">{m.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* ── 教練 · Coach ── 這頁最重要的東西：一句提醒 ＋ 一個下一步。
                 🩹 原本收在「深度分析」摺疊裡，要點開才看得到 —— 受傷風險提醒不該藏在摺疊後面。
                 現在移到數字下方，永遠可見。 */}
            {coachSummary.coaching && (
                <div style={{ padding: '14px 14px 6px', marginTop: 6, borderRadius: 16, background: 'rgba(249,92,75,0.045)', border: '1px solid rgba(249,92,75,0.14)' }}>
                    <SectionLine label="教練" />
                    <div>
                        {(Array.isArray(coachSummary.coaching_points) && coachSummary.coaching_points.length > 0
                            ? coachSummary.coaching_points
                            : [coachSummary.coaching]
                        ).map((pt, i) => {
                            const isWarn = /^注意|風險/.test(pt);
                            const isNext = /^下一步/.test(pt);
                            return (
                                <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
                                    <span style={{
                                        flexShrink: 0, width: 5, height: 5, borderRadius: '50%', marginTop: 9,
                                        background: isWarn ? C.coralDeep : isNext ? C.coral : 'rgba(22,20,21,0.30)',
                                    }} />
                                    <p style={{
                                        fontSize: 14, lineHeight: 1.62, letterSpacing: '-0.01em', margin: 0, flex: 1,
                                        color: isWarn ? C.coralDeep : 'rgba(22,20,21,0.78)',
                                        fontWeight: isWarn ? 600 : 450,
                                    }}>
                                        {pt}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── DRVN Strength Score：這一堂的「執行品質」0–100（誠實計分，缺數據不算）── */}
            {clientIntel && (
                <motion.div
                    className="mt-8"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                >
                    <SectionLine
                        label="執行品質"
                        right={coachSummary?.strengthScore != null ? `評等 ${coachSummary.strengthGrade}` : null}
                        rightColor={C.coralDeep}
                    />
                    {coachSummary?.strengthScore != null ? (
                        <div style={{ borderTop: '1px solid rgba(0,0,0,0.10)', paddingTop: 18 }}>
                            <div className="flex items-end justify-between mb-5">
                                <div className="flex items-baseline gap-2">
                                    <span className="sr-mono" style={{ fontSize: 60, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.03em', color: C.coral }}>
                                        {coachSummary.strengthScore}
                                    </span>
                                    <span className="text-[13px] font-black text-black/30 sr-mono">/100</span>
                                </div>
                                <span className="text-[12px] font-bold tracking-[0.18em] text-black/40 text-right" style={{ maxWidth: 130 }}>
                                    {coachSummary.scoreBasis === 'no_rpe' ? '依容量 · 完成度評分' : '依真實逐組數據'}
                                </span>
                            </div>
                            {/* 💳 分數拆解是完整健身分析（會員）；總分免費 */}
                            {strengthFull && (<>
                            {/* pillar 拆解：只顯示有評分到的維度（缺數據不佔位） */}
                            <div className="flex flex-col gap-3">
                                {(coachSummary.scorePillars || []).map((p) => {
                                    const pct = p.max > 0 ? Math.round((p.points / p.max) * 100) : 0;
                                    return (
                                        <div key={p.key}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-black/60">
                                                    {p.label}{p.note ? <span className="font-medium text-black/35 tracking-normal normal-case">　{p.note}</span> : null}
                                                </span>
                                                <span className="text-[11px] font-black sr-mono text-black/45">{p.points}<span className="text-black/25">/{p.max}</span></span>
                                            </div>
                                            <div style={{ height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: pct >= 80 ? C.coral : pct >= 55 ? 'rgba(249,92,75,0.6)' : 'rgba(22,20,21,0.35)' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            </>)}
                        </div>
                    ) : (
                        <div style={{ borderTop: '1px solid rgba(0,0,0,0.10)', paddingTop: 16 }}>
                            <p className="text-[13px] font-bold text-black/70 mb-1">完成 · 資料不足以評分</p>
                            <p className="text-[11px] text-black/45 leading-relaxed">
                                記錄每組的重量、次數與費力度（RPE），或累積幾次同部位訓練，就能解鎖 0–100 執行品質分數與逐維度拆解。
                            </p>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ── AI 回饋（固定順序：① 肯定 → ② 進步 → ③ 教練）── */}
            {coachSummary && (coachSummary.validation || coachSummary.summary) && (
                <motion.div
                    className="mt-7"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                >
                    {/* ① Validation — 先肯定 */}
                    {coachSummary.validation && (
                        <>
                            <SectionLine label="肯定" />
                            <p style={{
                                fontSize: 16, lineHeight: 1.7, color: C.ink,
                                fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 22px',
                            }}>
                                {coachSummary.validation}
                            </p>
                        </>
                    )}

                    {/* ② Progress — 主要進步數據 */}
                    {coachSummary.progress && (
                        <>
                            <SectionLine
                                /* 🩹 沒有真正進步（金字塔五層全落空）時，標題誠實改成「鞏固」，
                                   右側徽章也只在達標時出現（不再出現 +0% 這種假進步）。 */
                                label={coachSummary.metrics?.made_progress === false ? '鞏固' : '進步'}
                                right={
                                    coachSummary.metrics?.pr_count > 0 ? `${coachSummary.metrics.pr_count} 項新紀錄`
                                        : coachSummary.metrics?.is_30d_best ? '30 天最佳'
                                            : (coachSummary.metrics?.volume_delta_pct >= 3 ? `+${coachSummary.metrics.volume_delta_pct}%` : null)
                                }
                                rightColor={C.coralDeep}
                            />
                            <div style={{ borderLeft: `2px solid ${C.coral}`, paddingLeft: 14, marginBottom: 22 }}>
                                {/* 🆕 列點呈現：每點講一件事，一眼看懂進步在哪 */}
                                {(Array.isArray(coachSummary.progress_points) && coachSummary.progress_points.length > 0
                                    ? coachSummary.progress_points
                                    : [coachSummary.progress]
                                ).map((pt, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 8 }}>
                                        <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: C.coral, marginTop: 9 }} />
                                        <p style={{
                                            fontSize: 15, lineHeight: 1.62, color: C.ink,
                                            fontWeight: 500, letterSpacing: '-0.01em', margin: 0, flex: 1,
                                        }}>
                                            {pt}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ══════════ 深度分析（收合）══════════
                        結算頁維持簡潔：上面只有分數 / 肯定 / 進步。
                        完整的「表現判讀 · 教練 · 長期趨勢」＋報告下載都收進這個摺疊區，
                        使用者想深入才展開 —— 跟跑步結算頁同一套邏輯。 */}
                    {/* 💳 逐項判讀是完整健身分析（會員）；肯定／進步／教練提醒（上面）永遠免費。整頁只放這一張會員卡 */}
                    {!strengthFull && (
                        <MemberLockCard feature="strengthAnalysis"
                            label={Array.isArray(coachSummary.coachCards) && coachSummary.coachCards.length > 0 ? `看 ${coachSummary.coachCards.length} 項逐項判讀` : '看完整健身分析'}
                            style={{ marginTop: 6 }} />
                    )}
                    {strengthFull && Array.isArray(coachSummary.coachCards) && coachSummary.coachCards.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <motion.button {...pressProps('card')}
 onClick={() => setShowDeep(v => !v)}
 className="w-full flex items-center justify-between"
 style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid rgba(22,20,21,0.10)', background: 'rgba(22,20,21,0.03)', cursor: 'pointer' }}
 aria-expanded={showDeep}
 >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: C.coral }}>深度分析</span>
                                    <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.4)' }}>逐項判讀這次的表現</span>
                                </span>
                                <ChevronDown size={18} style={{ color: 'rgba(22,20,21,0.5)', transform: showDeep ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }} />
                            </motion.button>

                            {showDeep && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                style={{ overflow: 'hidden', marginTop: 16 }}
                            >
                    {/* ── 表現 block（判讀）── */}
                    {Array.isArray(coachSummary.coachCards) && coachSummary.coachCards.length > 0 && (
                        <div style={{ padding: '4px 0 8px' }}>
                            <SectionLine label="表現判讀" right={`${coachSummary.coachCards.length}`} />
                            <div className="flex flex-col gap-3.5 mb-1">
                                {coachSummary.coachCards.map((c, i) => {
                                    const barColor = c.tone === 'praise' ? C.coral : c.tone === 'warn' ? C.coralDeep : 'rgba(22,20,21,0.28)';
                                    return (
                                        <div key={i} className="flex items-stretch gap-3">
                                            <div className="w-[3px] shrink-0 rounded-full" style={{ background: barColor }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[13px] font-black tracking-[-0.01em]" style={{ color: c.tone === 'warn' ? C.coralDeep : C.ink }}>{c.title}</span>
                                                    {/* 🩹 右上角的數值若句子裡已經講過就不重複顯示。
                                                        截圖上每張卡都出現兩次同一個數字：
                                                        「ACWR 4」↔「月均的 4 倍」、「17%」↔「完成了 17% 的計劃」。 */}
                                                    {c.metric && !metricEchoed(c) && (
                                                        <span className="text-[11px] font-black sr-mono" style={{ color: barColor }}>{c.metric}</span>
                                                    )}
                                                </div>
                                                {/* 🩹 一張卡只講一件事：標題（是什麼）＋ 數值 ＋ 一句判讀。
                                                    原本還有 why（衛教句）和 action（建議句）—— 建議的家在下面的「教練」，
                                                    衛教句不是結算頁的工作，兩者都拿掉，資訊密度砍半。 */}
                                                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.82)', fontWeight: 500 }}>{c.verdict}</p>
                                                {c.action && !coveredByCoach(c.action) && (
                                                    <p className="text-[12px] leading-relaxed mt-1" style={{ color: C.coralDeep, fontWeight: 500 }}>→ {c.action}</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}


                    {/* 🩹「長期趨勢 · Trend」已移除：它說的「多練幾次就會長出趨勢線」
                        與下方「成長趨勢 · Progression」區塊的空狀態是同一句話，講兩次。
                        趨勢的家是那個區塊（那裡有真的圖），這裡不再重複。 */}

                            </motion.div>
                            )}
                        </div>
                    )}
                </motion.div>
            )}


            {/* ── 成長趨勢：四張圖表，每張都「看圖說話」（§1.4）── */}
            {/* 💳 成長趨勢（容量、1RM、肌群平衡、負荷）是長期分析 → 完整健身分析（會員） */}
            {charts && strengthFull && (() => {
                const anyReady = charts.volumeTrend.ready || charts.e1rm.ready || charts.muscleBalance.ready || charts.acwr.ready;
                const ChartBlock = ({ label, right, ready, empty, children, note }) => (
                    <div className="py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.10)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-black/55">{label}</span>
                            {right && <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/30 sr-mono">{right}</span>}
                        </div>
                        {ready ? children : <ChartEmpty>{empty}</ChartEmpty>}
                        {ready && note && <ChartNote>{note}</ChartNote>}
                    </div>
                );
                return (
                    <motion.div className="mt-8"
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                        <SectionLine label="成長趨勢" />
                        {!anyReady ? (
                            <div style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}>
                                <ChartEmpty>多累積幾次同部位訓練，這裡就會長出你的容量趨勢、估算 1RM 曲線、肌群平衡與負荷儀表。</ChartEmpty>
                            </div>
                        ) : (
                            <div style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}>
                                <ChartBlock label="容量趨勢" right={`近 ${charts.volumeTrend.bars.length} 次`}
                                    ready={charts.volumeTrend.ready}
                                    empty="再練幾次同部位就能看出容量走向。"
                                    note={charts.volumeTrend.note}>
                                    <MiniBars bars={charts.volumeTrend.bars} />
                                </ChartBlock>

                                <ChartBlock label={`估算 1RM · ${charts.e1rm.exercise || '主項'}`}
                                    right={charts.e1rm.ready ? `${charts.e1rm.points.length} 筆` : null}
                                    ready={charts.e1rm.ready}
                                    empty="這個主項還沒有歷史，之後每次就能看出估算 1RM 的進步。"
                                    note={charts.e1rm.note}>
                                    <MiniLine points={charts.e1rm.points} best={charts.e1rm.best} />
                                </ChartBlock>

                                <ChartBlock label="肌群平衡 · 近 4 週"
                                    ready={charts.muscleBalance.ready}
                                    empty="多練幾個不同部位，就能看出肌群訓練量的平衡。"
                                    note={charts.muscleBalance.note}>
                                    <MiniRadar axes={charts.muscleBalance.axes} />
                                </ChartBlock>

                                <ChartBlock label="訓練負荷 · 急慢性比"
                                    ready={charts.acwr.ready}
                                    empty="還沒有足夠的慢性負荷基線，多記錄幾週就能判讀訓練量是否安全。"
                                    note={charts.acwr.note}>
                                    <AcwrGauge acwr={charts.acwr.acwr} zone={charts.acwr.zone} />
                                </ChartBlock>
                            </div>
                        )}
                    </motion.div>
                );
            })()}

            {/* ── 本日 MVP ── */}
            {mvp && (
                <motion.div className="mt-8"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <SectionLine label="本次最佳" />
                    <div className="flex items-stretch gap-4 pb-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.10)' }}>
                        <div className="w-[3px] shrink-0 rounded-full" style={{ background: C.coral }} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] mb-1.5" style={{ color: C.coral }}>
                                {mvp.isPR ? '新紀錄 · 本次主力' : '本次主力'}
                            </p>
                            <p className="text-[19px] font-black tracking-[-0.02em] text-black leading-tight mb-1">{mvp.name}</p>
                            <p className="text-[11px] text-black/50 leading-relaxed">
                                扛起本日 <span className="font-black text-black/70 sr-mono">{mvpShare}%</span> 的總容量，
                                最大重量 <span className="font-black text-black/70 sr-mono">{fmtNum(mvp.maxWeight)} kg</span>，
                                共 <span className="font-black text-black/70 sr-mono">{fmtNum(mvp.volume)} kg</span> 容量。
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ── KEY MOVEMENTS：完整菜單 (每組 kg × reps) ── */}
            <motion.div className="mt-8"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <SectionLine label="動作明細" right={`${menu.length} 個動作`} />
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}>
                    {menu.map((ex, i) => (
                        <div key={`${ex.name}-${i}`} className="py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.10)' }}>
                            {/* 動作標題列 */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-[11px] font-black tabular-nums text-black/25 w-5">{String(i + 1).padStart(2, '0')}</span>
                                    <span className="text-[15px] font-black tracking-[-0.01em] truncate" style={{ maxWidth: 170 }}>{ex.name}</span>
                                    {ex.isPR && (
                                        <span className="rounded-full flex-shrink-0 inline-flex items-center justify-center"
                                            style={{ background: C.coral, color: C.white, width: 22, height: 22, lineHeight: 1 }}>
                                            <span className="text-[11px] font-black uppercase" style={{ letterSpacing: '0.04em', paddingLeft: '0.04em', display: 'block' }}>PR</span>
                                        </span>
                                    )}
                                </div>
                                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/35 sr-mono">
                                    {ex.setRows.length} sets · {fmtNum(ex.volume)} kg
                                </span>
                            </div>
                            {/* 每組明細 chips：kg × reps */}
                            <div className="flex flex-wrap gap-1.5 pl-7">
                                {ex.setRows.map((s) => {
                                    const isTop = s.weight === ex.maxWeight && ex.maxWeight > 0;
                                    return (
                                        <span key={s.idx}
                                            className="text-[11px] font-bold sr-mono px-2 py-1 rounded-md"
                                            style={{
                                                background: isTop ? 'rgba(249,92,75,0.12)' : 'rgba(0,0,0,0.04)',
                                                color: isTop ? C.coralDeep : 'rgba(22,20,21,0.62)',
                                            }}>
                                            {s.weight > 0 ? fmtNum(s.weight) : '–'}<span className="opacity-50">kg</span>
                                            <span className="opacity-40 mx-0.5">×</span>
                                            {s.reps || '–'}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {menu.length === 0 && (
                        <div className="py-8 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-black/30">No movements logged</div>
                    )}
                </div>
            </motion.div>

            {/* ── 儲存今日菜單為 Block ── */}
            {menu.length > 0 && (
                <motion.button
                    type="button"
                    onClick={() => !savedBlock && setSaveBlockOpen(true)}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-7 w-full flex items-center justify-center gap-2.5"
                    style={{
                        padding: '15px 0', borderRadius: 16,
                        border: savedBlock ? `1.5px solid ${C.coral}` : '1.5px solid rgba(22,20,21,0.18)',
                        background: savedBlock ? 'rgba(249,92,75,0.08)' : 'transparent',
                        color: savedBlock ? C.coralDeep : C.ink, cursor: savedBlock ? 'default' : 'pointer',
                        fontFamily: SWISS,
                    }}
                >
                    {savedBlock
                        ? (<><Check size={16} /><span className="text-[13px] font-bold tracking-[0.06em]">已存成 Block · {savedBlock.category}</span></>)
                        : (<><BookmarkPlus size={16} /><span className="text-[13px] font-bold tracking-[0.06em]">儲存今日菜單為 Block</span></>)}
                </motion.button>
            )}

            <SaveWorkoutBlockModal
                open={saveBlockOpen}
                exercises={blockExercises}
                defaultCategory={focusGroup}
                source="report"
                onClose={() => setSaveBlockOpen(false)}
                onSaved={(b) => setSavedBlock(b)}
            />

            {/* 🗑️ 長按取消這筆紀錄 — 與跑步結算頁同一套互動 */}
            {onCancelRecord && (
                <div className="flex justify-center" style={{ padding: '4px 0 130px' }}>
                    <HoldToCancelRecord onCancel={onCancelRecord} />
                </div>
            )}

            {/* ── 底部固定：返回 + 分享成果 (Liquid Glass) ── */}
            <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="fixed bottom-0 left-0 z-[60]"
                style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '14px 20px max(env(safe-area-inset-bottom), 22px)', background: `linear-gradient(to top, ${C.paper} 50%, transparent)` }}
            >
                <div className="flex items-stretch gap-2.5" style={{ width: '100%' }}>
                    {/* 返回 */}
                    <motion.button {...pressProps('row')}
 onClick={onExit}
 className="lg-btn lg-glass-light flex items-center justify-center shrink-0"
 style={{ borderRadius: 999, padding: '17px 18px', color: C.ink }}
 aria-label="返回"
 >
                        <ArrowLeft size={16} className="relative z-10" />
                    </motion.button>
                    {/* 🆕 儲存紀錄 */}
                    <motion.button {...pressProps('row')}
 onClick={() => {
 if (recordSaved) return;
 setRecordSaved(true);
 onSaveRecord?.();
 }}
 className="lg-btn lg-glass-light flex items-center justify-center gap-2"
 style={{
 flex: 1, minWidth: 0, borderRadius: 999, padding: '17px 12px',
 color: recordSaved ? C.coralDeep : C.ink,
 }}
 >
                        {recordSaved ? <Check size={16} className="relative z-10 shrink-0" /> : <BookmarkPlus size={16} className="relative z-10 shrink-0" />}
                        <span className="text-[13px] font-bold tracking-[0.02em] relative z-10 whitespace-nowrap">
                            {recordSaved ? '已儲存' : '儲存紀錄'}
                        </span>
                    </motion.button>
                    {/* 📄 下載報告已移進「深度分析」內（結算頁底部只留 返回 / 儲存 / 分享，維持簡潔） */}
                    {/* 分享成果 */}
                    <motion.button {...pressProps('row')}
 onClick={onShare}
 className="lg-btn lg-glass-dark flex items-center justify-center gap-2"
 style={{ flex: 1.25, minWidth: 0, borderRadius: 999, padding: '17px 12px' }}
 >
                        <Share2 size={16} className="relative z-10 shrink-0" />
                        <span className="text-[14px] font-bold tracking-[0.04em] relative z-10 whitespace-nowrap">分享成果</span>
                        <ChevronRight size={15} className="opacity-60 relative z-10 shrink-0" />
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
};

export default StrengthResultsMobile;
