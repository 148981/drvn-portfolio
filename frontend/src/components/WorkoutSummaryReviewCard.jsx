import React, { useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { getExerciseNameZh } from '../data/exerciseDatabase';
import { totalVolume as sumSets } from '../utils/strengthMath';

// ════════════════════════════════════════════════════════════════
// WorkoutSummaryReviewCard — 完成計劃前的「訓練資訊回顧 + 今日進度 + 編輯 + 結束」
// 瑞士極簡 + iOS 26 Liquid Glass。最後一組結束 / 長按結束時彈出，按下即直接結算。
// ════════════════════════════════════════════════════════════════

const INK = '#161415';
const CORAL = '#F95C4B';

const fmtDur = (s) => {
    const sec = Math.max(0, Math.round(Number(s) || 0));
    const m = Math.floor(sec / 60);
    return `${m}:${String(sec % 60).padStart(2, '0')}`;
};

const WorkoutSummaryReviewCard = ({ exercises = [], onUpdateSet, onConfirm, onClose, durationMins, progressPct = 0, doneSets = 0, totalSetsAll = 0, durationSeconds = 0 }) => {
    // 只顯示有完成任何一組的動作
    const rows = useMemo(() => exercises
        .map((ex, exIdx) => ({ ex, exIdx, sets: (ex.sets || []).filter(s => s && (s.completed || s.weight != null || s.reps != null)) }))
        .filter(r => r.sets.length > 0), [exercises]);

    const totalSets = rows.reduce((a, r) => a + r.sets.length, 0);
    const totalVolume = rows.reduce((a, r) => a + r.sets.reduce((v, s) => v + ((parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0)), 0), 0);

    /* 低完成度 = 沒達到「當日完成」的 80% 門檻（與 dailyAgenda.COMPLETION_THRESHOLD 一致）。
       只在算得出分母時判定；自由訓練沒有 totalSetsAll，不會誤觸發。 */
    const lowCompletion = totalSetsAll > 0 && progressPct < 80;

    const step = (exIdx, realSetIdx, field, delta, min = 0) => {
        const cur = parseFloat(exercises[exIdx]?.sets?.[realSetIdx]?.[field]) || 0;
        onUpdateSet?.(exIdx, realSetIdx, field, Math.max(min, +(cur + delta).toFixed(1)));
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
            onClick={onClose}>
            <motion.div onClick={(e) => e.stopPropagation()}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 34, stiffness: 320 }}
                style={{
                    width: '100%', maxWidth: 430, maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
                    background: 'linear-gradient(180deg, rgba(246,244,241,0.86) 0%, rgba(232,228,222,0.94) 100%)',
                    backdropFilter: 'blur(44px) saturate(165%) brightness(1.03)', WebkitBackdropFilter: 'blur(44px) saturate(165%) brightness(1.03)',
                    borderTop: '1px solid rgba(255,255,255,0.7)',
                    boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.85), 0 -22px 64px rgba(0,0,0,0.22)',
                    borderRadius: '30px 30px 0 0',
                }}>
                <div style={{ width: 44, height: 4, background: 'rgba(22,20,21,0.14)', borderRadius: 9999, margin: '14px auto 0', flexShrink: 0 }} />

                {/* Header */}
                <div style={{ padding: '14px 22px 6px', flexShrink: 0 }}>
                    <p style={{ fontSize: 9, letterSpacing: '0.24em', color: CORAL, fontFamily: '"Geist Mono", monospace', margin: 0, fontWeight: 600 }}>SESSION REVIEW</p>
                    <h2 style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 28, fontWeight: 500, color: INK, margin: '4px 0 12px' }}>本次訓練回顧</h2>
                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                        {[
                            { k: '動作', v: rows.length },
                            { k: '總組數', v: totalSets },
                            { k: '總訓練量', v: `${Math.round(totalVolume).toLocaleString()}kg` },
                            ...(durationMins ? [{ k: '耗時', v: `${durationMins}分` }] : []),
                        ].map(({ k, v }) => (
                            <div key={k} style={{ flex: 1, borderRadius: 16, padding: '10px 8px', textAlign: 'center',
                                background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)' }}>
                                <p style={{ margin: 0, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 18, color: INK, lineHeight: 1.1 }}>{v}</p>
                                <p style={{ margin: '3px 0 0', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(22,20,21,0.45)', fontFamily: '"Geist Mono", monospace' }}>{k}</p>
                            </div>
                        ))}
                    </div>

                    {/* ── 今日完成進度（整合自原結束確認彈窗）── */}
                    <div style={{
                        marginTop: 12, borderRadius: 18, padding: '14px 16px 16px',
                        // Liquid Glass：半透明底 + 上緣高光 + 內描邊
                        background: 'linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.32) 100%)',
                        border: '1px solid rgba(255,255,255,0.6)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 6px 18px rgba(22,20,21,0.08)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.45)' }}>今日進度</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#D94030' }}>{progressPct}%</span>
                        </div>
                        {/* 進度條（線性填充） */}
                        <div style={{ height: 8, borderRadius: 99, background: 'rgba(22,20,21,0.08)', overflow: 'hidden', marginBottom: 14 }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                                style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #FF7A6B, #D94030)' }} />
                        </div>
                        {/* 3 數據格 */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                            {[
                                { v: `${doneSets}/${totalSetsAll}`, l: '組數 SETS' },
                                { v: `${Math.round(totalVolume).toLocaleString()}`, l: '訓練量 KG' },
                                { v: fmtDur(durationSeconds), l: '時長 TIME' },
                            ].map((m, i) => (
                                <div key={i} style={{ borderRadius: 12, padding: '10px 6px', textAlign: 'center',
                                    background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.55)' }}>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: INK, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', lineHeight: 1 }}>{m.v}</div>
                                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(22,20,21,0.45)', marginTop: 5 }}>{m.l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Exercise list (editable sets) */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 12px' }}>
                    {rows.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '36px 0', color: 'rgba(22,20,21,0.35)' }}>
                            <Dumbbell size={28} color="rgba(22,20,21,0.2)" style={{ margin: '0 auto 10px' }} />
                            <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>這次還沒有完成的紀錄</p>
                        </div>
                    ) : rows.map(({ ex, exIdx, sets }) => (
                        <div key={exIdx} style={{ borderRadius: 20, padding: '14px 14px 10px', marginBottom: 10,
                            background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.6)',
                            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)' }}>
                            <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 15, color: INK }}>{getExerciseNameZh(ex.name)}</p>
                            {sets.map((set) => {
                                const realIdx = (ex.sets || []).indexOf(set);
                                return (
                                    <div key={realIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ width: 26, fontFamily: '"Geist Mono", monospace', fontSize: 12, color: 'rgba(22,20,21,0.5)' }}>#{set.set_number || realIdx + 1}</span>
                                        {[{ f: 'weight', step: 2.5, unit: 'kg' }, { f: 'reps', step: 1, unit: '次' }].map(({ f, step: st, unit }) => (
                                            <div key={f} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderRadius: 12, padding: 4, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.65)' }}>
                                                <motion.button {...pressProps('row')} onClick={() => step(exIdx, realIdx, f, -st)} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.7)', color: INK, fontSize: 16, cursor: 'pointer' }}>−</motion.button>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                                                    <input type="number" value={set[f] ?? ''} onChange={(e) => onUpdateSet?.(exIdx, realIdx, f, e.target.value)}
                                                        style={{ width: 34, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 16, color: INK }} />
                                                    <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)' }}>{unit}</span>
                                                </div>
                                                <motion.button {...pressProps('row')} onClick={() => step(exIdx, realIdx, f, st)} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.7)', color: INK, fontSize: 16, cursor: 'pointer' }}>+</motion.button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{ flexShrink: 0, padding: '12px 22px max(20px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(22,20,21,0.06)' }}>
                    {/* 🩹 2026-08 稽核：以前不管做了 8% 還是 100%，這裡都是同一句
                        中性的「確認資訊無誤後，結束今日的訓練？」，按鈕也永遠可點 ——
                        使用者完全不會意識到自己正在把一次沒做完的訓練記成完成。
                        現在低於門檻時據實以告，並把主要按鈕讓給「繼續訓練」。
                        刻意不 disable 結束鍵：提前收工是使用者的權利，
                        我們的責任是讓他知道代價，不是替他決定。 */}
                    {lowCompletion ? (
                        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(22,20,21,0.62)', margin: '0 0 12px', fontWeight: 500, lineHeight: 1.55 }}>
                            這次做了 <b style={{ color: '#D94030' }}>{progressPct}%</b>（{doneSets}/{totalSetsAll} 組）。<br />
                            <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.45)' }}>
                                現在結束會記成「部分完成」，不計入今天的達標與連續天數。
                            </span>
                        </p>
                    ) : (
                        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(22,20,21,0.55)', margin: '0 0 12px', fontWeight: 500 }}>確認資訊無誤後，結束今日的訓練？</p>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                        {/* 繼續訓練：低完成度時變成主要動作（放大、上色） */}
                        <motion.button whileTap={{ scale: 0.97 }} onClick={onClose}
                            style={{
                                flex: lowCompletion ? 1.4 : 1, height: 54, borderRadius: 18, cursor: 'pointer',
                                color: lowCompletion ? '#fff' : INK, fontWeight: 700, fontSize: 15,
                                background: lowCompletion
                                    ? 'linear-gradient(160deg, rgba(255,148,135,0.92) 0%, rgba(249,92,75,0.82) 38%, rgba(232,74,57,0.86) 100%)'
                                    : 'linear-gradient(160deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.32) 100%)',
                                border: `1px solid rgba(255,255,255,${lowCompletion ? 0.4 : 0.7})`,
                                boxShadow: lowCompletion
                                    ? 'inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 22px rgba(249,92,75,0.22)'
                                    : 'inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(22,20,21,0.08)',
                            }}>繼續訓練</motion.button>
                        {/* 結束：低完成度時退成次要樣式，文案據實標示 */}
                        <motion.button whileTap={{ scale: 0.97 }} onClick={onConfirm}
                            style={{
                                flex: lowCompletion ? 1 : 1.4, height: 54, borderRadius: 18, cursor: 'pointer',
                                color: lowCompletion ? INK : '#fff', fontWeight: 700, fontSize: lowCompletion ? 13.5 : 15,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                                background: lowCompletion
                                    ? 'linear-gradient(160deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.32) 100%)'
                                    : 'linear-gradient(160deg, rgba(255,148,135,0.92) 0%, rgba(249,92,75,0.82) 38%, rgba(232,74,57,0.86) 100%)',
                                border: `1px solid rgba(255,255,255,${lowCompletion ? 0.7 : 0.4})`,
                                boxShadow: lowCompletion
                                    ? 'inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(22,20,21,0.08)'
                                    : 'inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 22px rgba(249,92,75,0.22)',
                            }}>
                            {lowCompletion ? '仍要結束' : '結束今日訓練'}
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default WorkoutSummaryReviewCard;
