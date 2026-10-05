import React, { useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { epleyE1RM } from '../utils/strengthMath';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, TrendingUp, AlertCircle, Activity, ChevronRight } from 'lucide-react';
import { detectMusclesFromExercise } from '../utils/muscleRecoveryTracker';

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MuscleBalanceAnalysis — 歷史訓練肌肉平衡分析（點恢復卡開啟）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 資深教練會問的問題：「你練得平衡嗎？哪裡練太多、哪裡被忽略？」
 * 這個分析把「過去所有訓練的容量」依部位攤開，對照均衡目標，
 * 直接指出需要補強的部位，並給精確處方。
 *
 * 資料來源（誠實數據）：
 *   · workout_history（localStorage）— 每個部位的實際訓練容量
 *   · InBody（若有）— 骨骼肌量，用來校正「肌力預測」
 *   資料不足就誠實說「再練幾次就長出來」，不捏造。
 *
 * 六大部位的「均衡目標佔比」（一般肌肥大分配，資深教練共識）：
 *   腿 26% · 背 20% · 胸 17% · 肩 15% · 手臂 12% · 核心 10%
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const C = { ink: '#161415', paper: '#F6F4F1', coral: '#F95C4B', coralDeep: '#D94030', sub: 'rgba(22,20,21,0.55)', line: 'rgba(22,20,21,0.10)' };

const MACROS = [
    { key: 'legs', zh: '腿', target: 0.26 },
    { key: 'back', zh: '背', target: 0.20 },
    { key: 'chest', zh: '胸', target: 0.17 },
    { key: 'shoulders', zh: '肩', target: 0.15 },
    { key: 'arms', zh: '手臂', target: 0.12 },
    { key: 'core', zh: '核心', target: 0.10 },
];
const PART_COLOR = { legs: '#5A7A3A', back: '#5B7183', chest: '#F95C4B', shoulders: '#C68E5D', arms: '#8B7F72', core: '#8F9E8B' };

const readHistory = () => {
    // 相容多個歷史 key（全域 + per-user），逐一嘗試取最大者
    const keys = ['workout_history'];
    let best = [];
    try {
        const uid = localStorage.getItem('userId');
        if (uid) keys.push(`workout_history_${uid}`);
    } catch { /* */ }
    for (const k of keys) {
        try {
            const arr = JSON.parse(localStorage.getItem(k) || '[]');
            if (Array.isArray(arr) && arr.length > best.length) best = arr;
        } catch { /* */ }
    }
    return best;
};

const readInBodySMM = () => {
    try {
        const uid = localStorage.getItem('userId');
        const raw = localStorage.getItem(`inbody_local_${uid}`) || localStorage.getItem('inbody_local');
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr) && arr.length) {
            const last = arr[arr.length - 1];
            return Number(last.smm || last.skeletal_muscle_mass) || null;
        }
    } catch { /* */ }
    return null;
};

// 🔢 原本沒有夾 reps —— 高反覆的組會估出假的 1RM（見 utils/strengthMath）
const e1rm = epleyE1RM;

export default function MuscleBalanceAnalysis({ recoveryData = {}, onClose, embedded = false, onNavigatePlan }) {
    const analysis = useMemo(() => {
        const history = readHistory();
        const volByMacro = { legs: 0, back: 0, chest: 0, shoulders: 0, arms: 0, core: 0 };
        const sessionsByMacro = { legs: 0, back: 0, chest: 0, shoulders: 0, arms: 0, core: 0 };
        const bestE1rmByMacro = { legs: 0, back: 0, chest: 0, shoulders: 0, arms: 0, core: 0 };
        let totalSessions = 0;

        history.forEach(session => {
            totalSessions += 1;
            const seen = new Set();
            const exs = session.exercises || session.completedExercises || [];
            exs.forEach(ex => {
                const macros = detectMusclesFromExercise(ex).map(m => m.macro);
                const uniqMacros = [...new Set(macros)];
                const sets = ex.sets || ex.completedSets || [];
                let exVol = 0, exBest = 0;
                sets.forEach(s => {
                    const w = parseFloat(s.weight) || 0;
                    const r = parseInt(s.reps) || 0;
                    exVol += w * r;
                    exBest = Math.max(exBest, e1rm(w, r));
                });
                uniqMacros.forEach(mc => {
                    if (volByMacro[mc] === undefined) return;
                    volByMacro[mc] += exVol;
                    bestE1rmByMacro[mc] = Math.max(bestE1rmByMacro[mc], exBest);
                    if (!seen.has(mc)) { sessionsByMacro[mc] += 1; seen.add(mc); }
                });
            });
        });

        const totalVol = Object.values(volByMacro).reduce((a, b) => a + b, 0);
        const rows = MACROS.map(m => {
            const share = totalVol > 0 ? volByMacro[m.key] / totalVol : 0;
            const ratio = m.target > 0 ? share / m.target : 1;   // 1 = 剛好均衡
            let status = 'ok';
            if (totalVol > 0) {
                if (ratio < 0.55) status = 'weak';       // 明顯不足
                else if (ratio < 0.8) status = 'low';    // 偏低
                else if (ratio > 1.5) status = 'high';   // 偏多
            }
            return {
                ...m, share, ratio, status,
                volume: Math.round(volByMacro[m.key]),
                sessions: sessionsByMacro[m.key],
                e1rm: Math.round(bestE1rmByMacro[m.key]),
            };
        });

        // 教練分析：先點需補強的（weak > low），再提醒過度集中的
        const weak = rows.filter(r => r.status === 'weak').sort((a, b) => a.ratio - b.ratio);
        const low = rows.filter(r => r.status === 'low').sort((a, b) => a.ratio - b.ratio);
        const high = rows.filter(r => r.status === 'high').sort((a, b) => b.ratio - a.ratio);

        return { rows, totalVol, totalSessions, weak, low, high, smm: readInBodySMM() };
    }, []);

    const enough = analysis.totalSessions >= 3 && analysis.totalVol > 0;

    const coachLines = useMemo(() => {
        if (!enough) return [];
        const lines = [];
        const name = (r) => r.zh;
        if (analysis.weak.length) {
            const parts = analysis.weak.map(name).join('、');
            lines.push({ tone: 'warn', text: `${parts} 明顯練得不夠 —— 佔比不到均衡目標的一半。下一個週期把「${analysis.weak[0].zh}」的訓練頻率提到每週 2 次，優先補這裡。` });
        }
        if (analysis.low.length) {
            lines.push({ tone: 'note', text: `${analysis.low.map(name).join('、')} 偏低，可以在現有課表尾端各加 2–3 組。` });
        }
        if (analysis.high.length) {
            lines.push({ tone: 'note', text: `${analysis.high.map(name).join('、')} 佔比偏高。不是不好，但長期失衡容易造成姿勢與傷害風險 —— 把多出來的量勻一點給弱項。` });
        }
        if (!analysis.weak.length && !analysis.low.length && !analysis.high.length) {
            lines.push({ tone: 'good', text: '各部位訓練量分佈相當均衡 —— 維持目前的分配，專注在漸進超負荷把重量往上推。' });
        }
        if (analysis.smm) {
            lines.push({ tone: 'note', text: `結合 InBody：目前骨骼肌量 ${analysis.smm} kg。肌力預測以各部位最佳估算 1RM 呈現，隨骨骼肌量上升會一起往上。` });
        }
        return lines;
    }, [analysis, enough]);

    // 骨架肌力圖：以「各部位相對 1RM」把身體六大區塊上色（越強越實）。
    const maxE1rm = Math.max(1, ...analysis.rows.map(r => r.e1rm || 0));

    const content = (
        <div style={embedded
            ? { padding: '4px 2px 24px' }
            : { flex: 1, overflowY: 'auto', padding: '18px 22px calc(env(safe-area-inset-bottom, 20px) + 24px)' }}>
                    {!enough ? (
                        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                            <Activity size={28} style={{ color: 'rgba(22,20,21,0.25)', margin: '0 auto 14px' }} />
                            <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(22,20,21,0.55)', margin: 0 }}>分析還在累積中</p>
                            <p style={{ fontSize: 12.5, color: C.sub, margin: '8px auto 0', maxWidth: 260, lineHeight: 1.7 }}>
                                肌肉平衡要看「一段時間的訓練分佈」，至少完成 3 次重訓才畫得出可信的線。目前 {analysis.totalSessions} 次，再練幾次就長出來。
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* 各部位訓練量分佈 */}
                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: C.sub, margin: '0 0 14px' }}>各部位訓練量分佈 · Distribution</p>
                            {analysis.rows.map(r => {
                                const pct = Math.round(r.share * 100);
                                const targetPct = Math.round(r.target * 100);
                                const barW = Math.max(2, Math.min(100, r.share / 0.35 * 100)); // 以 35% 為滿格基準
                                const statusColor = r.status === 'weak' ? C.coralDeep : r.status === 'low' ? '#C68E5D' : r.status === 'high' ? '#8B7F72' : '#5A7A3A';
                                const statusLabel = r.status === 'weak' ? '需補強' : r.status === 'low' ? '偏低' : r.status === 'high' ? '偏多' : '均衡';
                                return (
                                    <div key={r.key} style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{r.zh}</span>
                                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                                                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: statusColor }}>{statusLabel}</span>
                                            </span>
                                        </div>
                                        <div style={{ position: 'relative', height: 8, borderRadius: 6, background: 'rgba(22,20,21,0.06)', overflow: 'hidden' }}>
                                            <div style={{ width: `${barW}%`, height: '100%', borderRadius: 6, background: PART_COLOR[r.key] }} />
                                            {/* 均衡目標刻度 */}
                                            <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.min(100, r.target / 0.35 * 100)}%`, width: 1.5, background: 'rgba(22,20,21,0.35)' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                            <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)' }}>目標 {targetPct}% · {r.sessions} 次訓練</span>
                                            <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', fontVariantNumeric: 'tabular-nums' }}>肌力預測 e1RM {r.e1rm || '—'} kg</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* 🦴 肌力骨架圖：六大部位依「相對 1RM」上色，一眼看出哪裡強哪裡弱。
                                以簡化人形（頭/軀幹/手臂/腿）分區呈現，越強越實、越弱越淡。 */}
                            <div style={{ marginTop: 24 }}>
                                <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: C.sub, margin: '0 0 12px' }}>肌力骨架 · Strength Map</p>
                                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                    <StrengthBodyMap rows={analysis.rows} maxE1rm={maxE1rm} />
                                    <div style={{ flex: 1 }}>
                                        {analysis.rows.slice().sort((a, b) => (b.e1rm || 0) - (a.e1rm || 0)).map(r => (
                                            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                                <span style={{ width: 7, height: 7, borderRadius: 2, background: PART_COLOR[r.key], flexShrink: 0, opacity: 0.35 + 0.65 * ((r.e1rm || 0) / maxE1rm) }} />
                                                <span style={{ fontSize: 12.5, color: C.ink, width: 34, fontWeight: 600 }}>{r.zh}</span>
                                                <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{r.e1rm || '—'}</span>
                                                <span style={{ fontSize: 11, color: C.sub }}>kg 1RM</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.35)', margin: '10px 0 0', lineHeight: 1.6 }}>
                                    1RM 由各部位最佳一組用 Epley 公式估算（重量 × (1 + 次數/30)）{analysis.smm ? ` · 骨骼肌量 ${analysis.smm} kg` : ''}
                                </p>
                            </div>

                            {/* 教練分析 */}
                            <div style={{ marginTop: 22, padding: '16px 16px', borderRadius: 18, background: 'rgba(249,92,75,0.05)', border: '1px solid rgba(249,92,75,0.16)' }}>
                                <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: C.coral, margin: '0 0 12px' }}>教練分析 · Coach</p>
                                {coachLines.map((l, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 10 }}>
                                        {l.tone === 'warn' ? <AlertCircle size={15} style={{ color: C.coralDeep, flexShrink: 0, marginTop: 2 }} />
                                            : l.tone === 'good' ? <TrendingUp size={15} style={{ color: '#5A7A3A', flexShrink: 0, marginTop: 2 }} />
                                                : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(22,20,21,0.3)', flexShrink: 0, marginTop: 7 }} />}
                                        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.62, color: l.tone === 'warn' ? C.coralDeep : 'rgba(22,20,21,0.8)', fontWeight: l.tone === 'warn' ? 600 : 450 }}>{l.text}</p>
                                    </div>
                                ))}

                                {/* 🔗 串聯健身計劃：把弱項直接帶進計劃系統 */}
                                {analysis.weak.length > 0 && onNavigatePlan && (
                                    <motion.button {...pressProps('row')}
 onClick={() => onNavigatePlan(analysis.weak.map(r => r.key))}
 style={{ marginTop: 6, width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: C.coral, color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
 >
                                        把「{analysis.weak.map(r => r.zh).join('、')}」排進健身計劃
                                        <ChevronRight size={15} />
                                    </motion.button>
                                )}
                            </div>

                            <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.38)', margin: '16px 0 0', lineHeight: 1.6, textAlign: 'center' }}>
                                依你全部 {analysis.totalSessions} 次重訓的實際容量計算 · 刻度線＝均衡目標
                            </p>
                        </>
                    )}
        </div>
    );

    // 嵌入模式（作為 InBody 頁的分頁）：只渲染內容，不要 portal / 遮罩 / sheet 外框。
    if (embedded) {
        return (
            <div>
                <div style={{ marginBottom: 14 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.coral }}>Muscle Balance</p>
                    <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 500, color: C.ink, fontFamily: '"Tenor Sans", sans-serif' }}>肌肉平衡分析 · 個人數據總和</h2>
                </div>
                {content}
            </div>
        );
    }

    const sheet = (
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100010]" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 260 }}
                className="fixed bottom-0 left-0 right-0 z-[100011] max-w-[440px] mx-auto"
                style={{ background: C.paper, borderRadius: '28px 28px 0 0', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
            >
                <div style={{ padding: '20px 22px 14px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.coral }}>Muscle Balance</p>
                            <h2 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 500, color: C.ink, fontFamily: '"Tenor Sans", sans-serif' }}>肌肉平衡分析</h2>
                        </div>
                        <motion.button {...pressProps('row')} onClick={onClose} aria-label="關閉" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={18} color={C.ink} />
                        </motion.button>
                    </div>
                </div>
                {content}
            </motion.div>
        </>
    );

    return createPortal(sheet, document.body);
}

// 🦴 簡化人形肌力骨架：六大部位依相對 1RM 上色（越強越實）。
function StrengthBodyMap({ rows, maxE1rm }) {
    const g = {};
    rows.forEach(r => { g[r.key] = 0.28 + 0.72 * ((r.e1rm || 0) / maxE1rm); });
    const fill = (k) => `rgba(249,92,75,${(g[k] || 0.28).toFixed(2)})`;
    return (
        <svg width="88" height="150" viewBox="0 0 88 150" style={{ flexShrink: 0 }} aria-label="肌力骨架圖">
            {/* 頭 */}
            <circle cx="44" cy="14" r="9" fill="rgba(22,20,21,0.12)" />
            {/* 肩（shoulders） */}
            <rect x="24" y="26" width="40" height="10" rx="5" fill={fill('shoulders')} />
            {/* 胸（chest） */}
            <rect x="28" y="38" width="32" height="16" rx="5" fill={fill('chest')} />
            {/* 手臂（arms）左右 */}
            <rect x="14" y="38" width="9" height="34" rx="4.5" fill={fill('arms')} />
            <rect x="65" y="38" width="9" height="34" rx="4.5" fill={fill('arms')} />
            {/* 背/核心（背在後面，用核心區塊代表軀幹核心） */}
            <rect x="30" y="56" width="28" height="14" rx="4" fill={fill('core')} />
            {/* 背標記（腰側） */}
            <rect x="26" y="42" width="4" height="26" rx="2" fill={fill('back')} />
            <rect x="58" y="42" width="4" height="26" rx="2" fill={fill('back')} />
            {/* 腿（legs）左右 */}
            <rect x="30" y="74" width="12" height="60" rx="6" fill={fill('legs')} />
            <rect x="46" y="74" width="12" height="60" rx="6" fill={fill('legs')} />
        </svg>
    );
}
