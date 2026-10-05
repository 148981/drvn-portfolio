/**
 * PRRankSheet — 點 PR 卡片：你這一項在所有 DRVN 使用者裡排第幾、在哪個級距
 * ─────────────────────────────────────────────────────────────────────
 * 主角：第 N 名（共 M 位）。佐證：一條分段軌道（前 1%／5%／10%／25%／50%／其餘），你落在哪一段就亮哪一段。
 * 下一步：離前一名還差多少。下面另一區是「一般族群」：同一個成績在一般男性、一般女性分布裡各贏過約多少 %。
 * 人還少的時候照實說（名次會隨人數變準），不編數字。
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { pressProps } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { submitPRRanks, formatGap, parseRecordValue, RANK_BRACKETS, bracketIndex } from '../utils/prRank';

const INK = '#161415';
const MUTED = 'rgba(22,20,21,0.55)';
const FAINT = 'rgba(22,20,21,0.40)';
const POP = { running: '跑者', strength: '練重訓的人' };

export default function PRRankSheet({ record, records = [], onClose }) {
    const [state, setState] = useState({ loading: true });

    useEffect(() => {
        if (!record) return undefined;
        let alive = true;
        setState({ loading: true });
        submitPRRanks(records)
            .then((ranks) => { if (alive) setState({ loading: false, info: ranks?.[record.id] || null }); })
            .catch(() => { if (alive) setState({ loading: false, error: true }); });
        return () => { alive = false; };
    }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const info = state.info;
    const pop = POP[record?.category] || 'DRVN 使用者';
    const mine = record ? parseRecordValue(record) : NaN;
    const unit = record?.result?.unit || '';
    const bIdx = info ? bracketIndex(info.top_pct) : -1;

    const ui = (
        <AnimatePresence>
            {record && (
                <motion.div key="pr-rank" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}
                    onClick={onClose}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(22,20,21,0.42)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0, transition: { duration: 0.16 } }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            width: '100%', maxWidth: 440, boxSizing: 'border-box', background: '#F6F4F1', color: INK,
                            borderRadius: '36px 36px 0 0', padding: '12px 20px max(24px, env(safe-area-inset-bottom))',
                            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)', overflowY: 'auto',
                        }}>
                        <div aria-hidden style={{ width: 36, height: 4, borderRadius: 999, background: '#CFC6B8', margin: '0 auto 14px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: FAINT }}>DRVN 排名</div>
                                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 }}>{record.titleZh}</div>
                            </div>
                            <motion.button {...pressProps('icon')} type="button" aria-label="關閉" onClick={() => { haptic('light'); onClose(); }}
                                style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: '#E8E9E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <X size={18} color={INK} />
                            </motion.button>
                        </div>

                        {state.loading && (
                            <div className="ti-skeleton" style={{ height: 150, borderRadius: 24, marginTop: 20 }} aria-label="算名次中" />
                        )}

                        {!state.loading && (state.error || !info) && (
                            <div style={{ marginTop: 20, minHeight: 64, borderRadius: 22, background: '#E8E9E6', display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 16, fontWeight: 700 }}>
                                {state.error ? '排名暫時連不上，等一下再點一次' : '這一項還算不出名次'}
                            </div>
                        )}

                        {!state.loading && info && (
                            <>
                                {/* 主角：第幾名 */}
                                <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: MUTED }}>第</span>
                                    <span className="ti-metric" style={{ fontSize: 64, lineHeight: 0.95, letterSpacing: '-0.04em' }}>{info.rank}</span>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: MUTED }}>名</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: FAINT, marginLeft: 4 }}>共 {info.total} 位{pop}</span>
                                </div>

                                {/* 級距：同一條軌道上分段，你在哪一段就亮哪一段 */}
                                <div style={{ marginTop: 18 }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {RANK_BRACKETS.map((b, i) => (
                                            <div key={b.label} style={{ flex: i === RANK_BRACKETS.length - 1 ? 2 : 1, height: 10, borderRadius: 4,
                                                background: i === bIdx ? '#F95C4B' : i < bIdx ? 'rgba(22,20,21,0.10)' : 'rgba(22,20,21,0.18)' }} />
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                        {RANK_BRACKETS.map((b, i) => (
                                            <div key={b.label} style={{ flex: i === RANK_BRACKETS.length - 1 ? 2 : 1, minWidth: 0, fontSize: 11, fontWeight: i === bIdx ? 800 : 600,
                                                color: i === bIdx ? INK : FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>{b.label.replace('前 ', '')}</div>
                                        ))}
                                    </div>
                                </div>

                                {/* 1.5px 直角硬線，把主角跟佐證分開 */}
                                <div style={{ height: 1.5, background: '#CFC6B8', margin: '18px 0 12px' }} />
                                <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.45 }}>
                                    {info.total < 5
                                        ? `目前只有 ${info.total} 位有這項紀錄`
                                        : `你在 DRVN 的前 ${info.top_pct}%`}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                                    {info.rank === 1
                                        ? '你是第一名'
                                        : info.next_value != null && Number.isFinite(mine)
                                            ? `離前一名差 ${formatGap(record.id, mine - info.next_value, unit)}`
                                            : ''}
                                </div>
                            </>
                        )}

                        {/* 一般族群：同一個成績放進一般男性、一般女性的分布裡，各贏過約多少 %。
                            跟上面「DRVN 名次」分開一區，兩種數字才不會搞混。 */}
                        {!state.loading && record.result?.byGender && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{ height: 1.5, background: '#CFC6B8', margin: '0 0 12px' }} />
                                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: FAINT }}>一般族群</div>
                                {[['male', `一般男性${pop === 'DRVN 使用者' ? '' : pop}`], ['female', `一般女性${pop === 'DRVN 使用者' ? '' : pop}`]]
                                    .filter(([g]) => record.result.byGender[g] != null)
                                    .map(([g, label]) => {
                                        const pct = record.result.byGender[g];
                                        return (
                                            <div key={g} style={{ marginTop: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                                                    <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                                                        贏過約 <span style={{ color: INK, fontWeight: 800, fontSize: 18 }}>{pct}%</span>
                                                    </span>
                                                </div>
                                                <div style={{ marginTop: 6, height: 8, borderRadius: 4, background: 'rgba(22,20,21,0.10)', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: g === 'male' ? '#3E5C76' : '#F95C4B' }} />
                                                </div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: FAINT, marginTop: 4 }}>
                                                    約落在前 {Math.max(1, 100 - pct)}%
                                                </div>
                                            </div>
                                        );
                                    })}
                                <div style={{ fontSize: 11, fontWeight: 600, color: FAINT, marginTop: 10, lineHeight: 1.5 }}>
                                    {record.category === 'strength' ? '對照 Strength Level 依性別的 1RM ÷ 體重分布，數值為約略值。' : '對照 Running Level 依性別的完成時間分布（比的是有在跑的人），數值為約略值。'}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui;
}
