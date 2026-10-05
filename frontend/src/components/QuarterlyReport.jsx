import React, { useEffect, useRef, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { X, TrendingUp, Activity, Apple } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { toast } from '../utils/toast';

// ─────────────────────────────────────────────────────────────
//  QuarterlyReport — 季回饋（跑步 / 健身 / 營養）
//
//  與月報的分工（產品定位）：
//    月報 = 「這個月做了什麼」  流水帳、單月成果
//    季報 = 「三個月下來變成什麼樣的人」 趨勢、斜率、下一季方向
//  出場節奏：第 1、2 個月只有月報；季末月（3/6/9/12）＝ 月報 ＋ 季報。
//  讓使用者從不同焦距看自己 —— 近看是波動，遠看是斜率。
//
//  資料來自 /api/review/quarterly/{userId}（core/quarterly_review.py）。
//  ⚠ 2026-07 起後端已**完全移除 mock**：每一句話都由真實資料推導，
//    素材不足回 sufficient=false，前端顯示誠實的「累積中」狀態。
// ─────────────────────────────────────────────────────────────

const C = {
    paper: '#F6F4F1', ink: '#161415', coral: '#F95C4B', coralDeep: '#D94030',
    sub: 'rgba(22,20,21,0.55)', line: 'rgba(22,20,21,0.10)',
};

const SYS_META = {
    running: { icon: Activity, tint: '#F0876E', label: '跑步' },
    strength: { icon: Dumbbell, tint: '#C9A25A', label: '健身' },
    nutrition: { icon: Apple, tint: '#5A7A3A', label: '營養' },
};

const SystemSection = ({ id, data }) => {
    const meta = SYS_META[id] || SYS_META.running;
    const Icon = meta.icon;
    return (
        <div data-pdf-page style={{ padding: '22px 20px', borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: meta.tint + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={19} color={meta.tint} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.sub }}>{meta.label}</div>
                    {/* 舊版這裡是後端寫死的 0–100 評分（每個人都一樣），已移除。
                        改為誠實標示「這一季有沒有達到進步門檻」——
                        沒達標就是鞏固期，不是低分，不該被當成失敗。 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 20, fontWeight: 400, color: C.ink, letterSpacing: '-0.01em' }}>{data.title || meta.label}</span>
                        <span style={{
                            fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', padding: '3px 8px', borderRadius: 999,
                            background: data.has_progress ? 'rgba(90,122,58,0.12)' : 'rgba(22,20,21,0.06)',
                            color: data.has_progress ? '#5A7A3A' : C.sub,
                        }}>
                            {data.has_progress ? '有推進' : '鞏固期'}
                        </span>
                    </div>
                </div>
            </div>

            {/* metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {(data.metrics || []).map((m, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 14, padding: '10px 12px', border: `1px solid ${C.line}` }}>
                        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sub, marginBottom: 4 }}>{m.label}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                            <span style={{ fontSize: 19, fontWeight: 300, color: C.ink }}>{m.value}</span>
                            {m.unit ? <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>{m.unit}</span> : null}
                        </div>
                        {m.delta ? (
                            <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2, color: /[-▼↓]|慢|降|少/.test(String(m.delta)) ? C.coralDeep : '#5A7A3A' }}>
                                {m.delta}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>

            {/* insight */}
            {data.insight && (
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: C.ink, margin: '0 0 12px', fontWeight: 450 }}>{data.insight}</p>
            )}
            {/* direction */}
            {data.direction && (
                <div style={{ borderLeft: `2px solid ${meta.tint}`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: meta.tint, marginBottom: 4 }}>下一季方向</div>
                    <p style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(22,20,21,0.78)', margin: 0 }}>{data.direction}</p>
                </div>
            )}
        </div>
    );
};

const QuarterlyReport = ({ onClose }) => {
    const userId = getUserId();
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const bodyRef = useRef(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { data } = await apiClient.get(`/api/review/quarterly/${userId}`);
                if (alive) setReview(data?.review || null);
            } catch (_) { /* keep null → 顯示錯誤態 */ }
            finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [userId]);


    return (
        <motion.div
            className="fixed inset-0 z-[1000005] overflow-y-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: C.paper, WebkitOverflowScrolling: 'touch' }}
        >
            {/* Header */}
            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.paper + 'F2', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: 'calc(env(safe-area-inset-top, 20px) + 12px) 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}` }}>
                <motion.button {...pressProps('row')} onClick={onClose} aria-label="關閉" style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={19} color={C.ink} />
                </motion.button>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.24em', color: C.coral }}>季回饋</div>
                {/* PDF 只留月報與進化日誌兩個出口；季回饋不另外匯出 */}
                <div style={{ width: 38, height: 38 }} aria-hidden />
            </div>

            {loading ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.sub, fontSize: 13 }}>載入季回饋…</div>
            ) : !review ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.sub, fontSize: 13 }}>暫時無法載入季回饋，請稍後再試。</div>
            ) : review.sufficient === false ? (
                /* 誠實空狀態：素材不夠就不生報告，而且把「還差多少」講清楚。
                   舊版是靠 is_mock 判斷，但舊後端連 is_mock=false 時 insight/score
                   都還是寫死的假文案；新引擎改用 sufficient 且完全不產 mock。 */
                <div style={{ maxWidth: 460, margin: '0 auto', padding: '72px 32px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: C.coral, marginBottom: 14 }}>
                        {review.period?.label} · 季回饋
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em', marginBottom: 14 }}>
                        季報還在累積中
                    </div>

                    {/* 進度條：誠實顯示「已有 N／需要 M 次」，不是空泛的等待 */}
                    <div style={{ margin: '0 auto 18px', maxWidth: 260 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', color: C.sub, marginBottom: 7 }}>
                            <span>{review.sessions} 次</span>
                            <span>需要 {review.needed} 次</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 6, background: 'rgba(22,20,21,0.08)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${Math.min(100, Math.round((review.sessions / Math.max(review.needed, 1)) * 100))}%`,
                                height: '100%', borderRadius: 6,
                                background: `linear-gradient(90deg, ${C.coral}, ${C.coralDeep})`,
                            }} />
                        </div>
                    </div>

                    <p style={{ fontSize: 13.5, lineHeight: 1.8, color: C.sub, fontWeight: 500, margin: '0 0 8px' }}>
                        {review.message}
                    </p>
                    <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'rgba(22,20,21,0.42)', fontWeight: 500, margin: '0 0 26px' }}>
                        {review.hint}
                    </p>
                    <motion.button {...pressProps('row')} onClick={onClose} style={{ padding: '13px 30px', borderRadius: 999, border: 'none', background: C.ink, color: '#F6F4F1', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em' }}>
                        繼續累積 →
                    </motion.button>
                </div>
            ) : (
                <div ref={bodyRef} style={{ maxWidth: 460, margin: '0 auto', paddingBottom: 60 }}>
                    {/* Hero — 主角是「訓練次數」這個真實數字，不是憑空捏造的 0–100 評分。
                        舊版的 overall_score / overall_delta 是後端寫死的（每個人都看到 84 / +7），
                        新引擎已移除。季報的重點本來就不是打分數，是講三個月的斜率。 */}
                    <div data-pdf-page style={{ padding: '24px 20px 20px' }}>
                        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: C.coral, marginBottom: 10 }}>
                            {review.period?.label} · 季回饋
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 72, fontWeight: 200, color: C.ink, lineHeight: 0.9, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                                {review.sessions}
                            </span>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: C.sub }}>本季訓練次數</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginTop: 2 }}>
                                    {review.period?.has_baseline
                                        ? `對照 ${review.period?.prev_label}`
                                        : '首季 · 尚無對照基準'}
                                </div>
                            </div>
                        </div>
                        <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink, fontWeight: 600, margin: 0 }}>{review.headline}</p>

                        {/* 月報 / 季報的分工，講給使用者聽 —— 兩份報告不是重複，是不同焦距 */}
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: 'flex', gap: 14 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.sub, marginBottom: 3 }}>月報</div>
                                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(22,20,21,0.62)' }}>這個月做了什麼</div>
                            </div>
                            <div style={{ width: 1, background: C.line }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.coral, marginBottom: 3 }}>季報</div>
                                <div style={{ fontSize: 12, lineHeight: 1.55, color: C.ink, fontWeight: 500 }}>三個月下來變成什麼樣</div>
                            </div>
                        </div>
                    </div>

                    {/* 三大系統 */}
                    {['running', 'strength', 'nutrition'].filter(k => review.systems?.[k]).map((k) => (
                        <SystemSection key={k} id={k} data={review.systems[k]} />
                    ))}

                    {/* Evolution 三個月成長 */}
                    {review.evolution && (
                        <div data-pdf-page style={{ padding: '22px 20px', borderTop: `1px solid ${C.line}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <TrendingUp size={16} color={C.coral} />
                                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: C.ink }}>{review.evolution.title || '三個月長期成長'}</span>
                            </div>
                            {/* 舊版這裡是三條假的能力條（Body Strength 82 / Endurance 74 / Mobility 58），
                                後端根本沒有這些指標的量測方式，已移除。
                                改為 InBody 的身體重組徽章 —— 肌↑且脂↓同時發生才亮，
                                這是運動科學上最珍貴的進步，值得最高規格的呈現。 */}
                            {review.evolution.recomp && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                                    padding: '12px 14px', borderRadius: 16,
                                    background: 'linear-gradient(135deg, rgba(90,122,58,0.12), rgba(90,122,58,0.04))',
                                    border: '1px solid rgba(90,122,58,0.25)',
                                }}>
                                    <TrendingUp size={17} color="#5A7A3A" />
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5A7A3A' }}>Recomposition</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 2 }}>身體重組達成 · 肌肉增加同時體脂下降</div>
                                    </div>
                                </div>
                            )}
                            {review.evolution.narrative && (
                                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(22,20,21,0.78)', marginTop: 14 }}>{review.evolution.narrative}</p>
                            )}
                        </div>
                    )}

                    {/* 下一季主軸 */}
                    {review.next_quarter && (
                        <div style={{ margin: '18px 20px 0', padding: '16px 18px', borderRadius: 18, background: 'linear-gradient(135deg, rgba(249,92,75,0.10), rgba(249,92,75,0.03))', border: `1px solid rgba(249,92,75,0.2)` }}>
                            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: C.coralDeep, marginBottom: 6 }}>下一季主軸</div>
                            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: C.ink, margin: 0, fontWeight: 500 }}>{review.next_quarter}</p>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

export default QuarterlyReport;
