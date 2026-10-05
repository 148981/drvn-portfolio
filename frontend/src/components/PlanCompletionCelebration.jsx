import React, { useMemo, useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronRight, Check, TrendingUp, Sparkles } from 'lucide-react';
import { brandColors as C } from '../utils/colors';
import { haptic } from '../utils/haptics';
import { diagnosePlan, recommendNextPlan } from '../utils/cardioPlanProgress';

/* ════════════════════════════════════════════════════════════════════
   PlanCompletionCelebration — 一期跑完的全畫面結業

   三幕：
     ① 完成度揭示 —— 實跑距離 ÷ 計劃距離，環形進度從 0 長到實際值
     ② 你哪裡變強了 / 哪裡還沒有 —— 依真實執行資料，不是罐頭鼓勵
     ③ 下一套已經幫你想好了 —— 可以直接套用，也可以自己微調

   語氣原則：完成度低不責備。做不到通常是課表開太重，不是意志力問題。
   ════════════════════════════════════════════════════════════════════ */

const EASE = [0.16, 1, 0.3, 1];

const GRADE_STYLE = {
    A: { color: '#C9A227', ring: '#C9A227', word: '完美執行' },
    B: { color: '#8BC34A', ring: '#8BC34A', word: '穩定完成' },
    C: { color: '#FF9800', ring: '#FF9800', word: '斷斷續續' },
    D: { color: '#F95C4B', ring: '#F95C4B', word: '沒能走完' },
};

/* 完成度環 —— 數字從 0 跑到實際完成度 */
const CompletionRing = ({ ratio, color }) => {
    const [shown, setShown] = useState(0);
    const target = Math.round(ratio * 100);

    useEffect(() => {
        let raf;
        const t0 = performance.now();
        const dur = 1400;
        const tick = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            // easeOutExpo
            const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
            setShown(Math.round(target * e));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target]);

    const R = 84;
    const CIRC = 2 * Math.PI * R;

    return (
        <div className="relative" style={{ width: 200, height: 200 }}>
            <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(246,244,241,0.10)" strokeWidth="10" />
                <motion.circle
                    cx="100" cy="100" r={R} fill="none"
                    stroke={color} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={CIRC}
                    initial={{ strokeDashoffset: CIRC }}
                    animate={{ strokeDashoffset: CIRC * (1 - Math.min(1, ratio)) }}
                    transition={{ duration: 1.4, ease: EASE, delay: 0.25 }}
                    style={{ filter: `drop-shadow(0 0 10px ${color}88)` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="flex items-baseline">
                    <span className="font-light tabular-nums" style={{ fontSize: 62, lineHeight: 1, color: C.paper, letterSpacing: '-0.04em' }}>
                        {shown}
                    </span>
                    <span className="text-[20px] font-light" style={{ color: 'rgba(246,244,241,0.55)' }}>%</span>
                </div>
                <span className="text-[12px] font-black tracking-[0.26em] mt-1.5" style={{ color: 'rgba(246,244,241,0.45)' }}>
                    完成度
                </span>
            </div>
        </div>
    );
};

const PlanCompletionCelebration = ({ plan, onApplyNext, onCustomise, onClose, busy = false }) => {
    const diagnosis = useMemo(() => diagnosePlan(plan), [plan]);
    const next = useMemo(() => recommendNextPlan(plan, diagnosis), [plan, diagnosis]);
    const [act, setAct] = useState(0);           // 0 完成度 → 1 診斷 → 2 下一步
    const style = GRADE_STYLE[diagnosis.grade] || GRADE_STYLE.B;
    const P = diagnosis.progress.overall;

    useEffect(() => { haptic('celebrate'); }, []);

    const advance = () => { haptic('medium'); setAct((a) => Math.min(2, a + 1)); };

    return (
        <div
            // z 要高過 CardioMicrocycleInbox（z-[1000002]）—— 以前在 inbox 上觸發結業會被 inbox 蓋住
            className="fixed inset-0 z-[1000010] flex flex-col overflow-y-auto"
            style={{ background: 'linear-gradient(168deg, #2A2724 0%, #1A1715 46%, #0E0C0D 100%)' }}
        >
            {/* 氛圍燈 */}
            <motion.span
                className="absolute pointer-events-none"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.4, ease: EASE }}
                style={{ inset: -80, background: `radial-gradient(44% 40% at 50% 16%, ${style.color}3A 0%, transparent 72%)` }}
            />
            {/* 拉絲金屬掃光 */}
            <motion.span
                className="absolute inset-0 pointer-events-none"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 1.6, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.10) 49%, transparent 60%)',
                    mixBlendMode: 'screen',
                }}
            />

            <div className="relative z-10 flex-1 flex flex-col px-6"
                style={{ paddingTop: 'max(56px, env(safe-area-inset-top, 56px))', paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))' }}>

                <AnimatePresence mode="wait">
                    {/* ═══ 第一幕：完成度 ═══════════════════════════ */}
                    {act === 0 && (
                        <motion.div
                            key="act0"
                            className="flex-1 flex flex-col items-center justify-center"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: EASE }}
                        >
                            {/* 放射火花 */}
                            {Array.from({ length: 16 }).map((_, i) => {
                                const a = (i / 16) * Math.PI * 2;
                                return (
                                    <motion.span
                                        key={i}
                                        className="absolute rounded-full"
                                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                                        animate={{ x: Math.cos(a) * 150, y: Math.sin(a) * 130, opacity: [0, 1, 0], scale: [0, 1, 0.3] }}
                                        transition={{ duration: 1.6, delay: 0.35 + i * 0.02, ease: EASE }}
                                        style={{ width: 5, height: 5, background: style.color, boxShadow: `0 0 10px ${style.color}` }}
                                    />
                                );
                            })}

                            <motion.div
                                className="flex items-center gap-2 mb-6"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                            >
                                <Trophy size={15} color={style.color} strokeWidth={2.2} />
                                <span className="text-[12px] font-black tracking-[0.32em]" style={{ color: 'rgba(246,244,241,0.5)' }}>
                                    計劃完成
                                </span>
                            </motion.div>

                            <CompletionRing ratio={diagnosis.completion} color={style.color} />

                            <motion.div
                                className="mt-7 text-center"
                                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                transition={{ delay: 1.15, duration: 0.7, ease: EASE }}
                            >
                                <div className="font-light" style={{ fontSize: 42, lineHeight: 1.05, letterSpacing: '-0.035em', color: C.paper }}>
                                    {style.word}
                                </div>
                                <div className="text-[13px] mt-3 tabular-nums" style={{ color: 'rgba(246,244,241,0.58)' }}>
                                    實際跑了 <span style={{ color: style.color }}>{P.actualKm}</span> km
                                    <span className="mx-1.5 opacity-40">／</span>
                                    計劃 {P.plannedKm} km
                                </div>
                                <p className="text-[12.5px] leading-relaxed mt-4 px-2" style={{ color: 'rgba(246,244,241,0.66)' }}>
                                    {diagnosis.summary}
                                </p>
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ═══ 第二幕：強項與缺口 ═══════════════════════ */}
                    {act === 1 && (
                        <motion.div
                            key="act1"
                            className="flex-1 pt-4"
                            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: EASE }}
                        >
                            <h2 className="font-light" style={{ fontSize: 36, lineHeight: 1.08, letterSpacing: '-0.03em', color: C.paper }}>
                                這一期<br />你哪裡變強了
                            </h2>

                            <motion.div
                                className="mt-7 flex flex-col gap-2.5"
                                initial="hidden" animate="visible"
                                variants={{ visible: { transition: { delayChildren: 0.15, staggerChildren: 0.08 } } }}
                            >
                                {diagnosis.strengths.map((s) => (
                                    <DiagCard key={s.code} tone="good" title={s.title} body={s.body} />
                                ))}
                                {diagnosis.gaps.map((g) => (
                                    <DiagCard key={g.code} tone="gap" title={g.title} body={g.body} />
                                ))}
                                {diagnosis.strengths.length === 0 && diagnosis.gaps.length === 0 && (
                                    <DiagCard tone="good" title="資料還太少" body="這一期的紀錄不足以做出診斷。下一期把訓練記錄下來，這裡就會告訴你哪裡變強了。" />
                                )}
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ═══ 第三幕：下一套 ═══════════════════════════ */}
                    {act === 2 && (
                        <motion.div
                            key="act2"
                            className="flex-1 pt-4"
                            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: EASE }}
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles size={14} color={C.coral} strokeWidth={2.4} />
                                <span className="text-[12px] font-black tracking-[0.30em]" style={{ color: 'rgba(246,244,241,0.5)' }}>
                                    下一步已經幫你想好了
                                </span>
                            </div>
                            <h2 className="font-light" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.035em', color: C.paper }}>
                                {next.title}
                            </h2>

                            {/* 新計劃的關鍵數字 */}
                            <motion.div
                                className="grid grid-cols-3 gap-2.5 mt-6"
                                initial="hidden" animate="visible"
                                variants={{ visible: { transition: { delayChildren: 0.2, staggerChildren: 0.07 } } }}
                            >
                                <NextStat label="週期" value={next.config.totalWeeks} unit="週" />
                                <NextStat label="每週" value={next.config.sessionsPerWeek} unit="趟" />
                                <NextStat label="新起點" value={next.realBaseline} unit="km" />
                            </motion.div>

                            {next.projectedPeakKm && (
                                <motion.p
                                    className="text-[12px] mt-4 tabular-nums"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
                                    style={{ color: 'rgba(246,244,241,0.60)' }}
                                >
                                    這一期會把你帶到 <span style={{ color: C.coral, fontSize: 15 }}>{next.projectedPeakKm}</span> 公里／週
                                </motion.p>
                            )}

                            <motion.div
                                className="mt-6 flex flex-col gap-2"
                                initial="hidden" animate="visible"
                                variants={{ visible: { transition: { delayChildren: 0.5, staggerChildren: 0.07 } } }}
                            >
                                {next.reasons.map((r, i) => <ReasonLine key={`r${i}`} text={r} icon="why" />)}
                                {next.adjustments.map((a, i) => <ReasonLine key={`a${i}`} text={a} icon="tune" />)}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ══ CTA ══════════════════════════════════════════ */}
                <div className="pt-6">
                    {act < 2 ? (
                        <motion.button
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: act === 0 ? 1.7 : 0.5, duration: 0.45 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={advance}
                            className="w-full h-[56px] rounded-full flex items-center justify-center gap-2.5"
                            style={{
                                background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)',
                                color: C.ink, letterSpacing: '0.20em', fontWeight: 800, fontSize: 12,
                                boxShadow: '0 12px 28px -12px rgba(0,0,0,0.5)',
                            }}
                        >
                            {act === 0 ? '看我的成長診斷' : '下一套課表'}
                            <ChevronRight size={15} strokeWidth={3} />
                        </motion.button>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.75, duration: 0.45 }}
                            className="flex flex-col gap-2.5"
                        >
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                disabled={busy}
                                onClick={() => { if (busy) return; haptic('celebrate'); onApplyNext?.(next.config); }}
                                className="w-full h-[56px] rounded-full flex items-center justify-center gap-2.5 relative overflow-hidden"
                                style={{
                                    opacity: busy ? 0.6 : 1,
                                    background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
                                    color: '#fff', letterSpacing: '0.18em', fontWeight: 800, fontSize: 12,
                                    boxShadow: '0 14px 32px -12px rgba(217,64,48,0.65)',
                                }}
                            >
                                <Check size={16} strokeWidth={3} />
                                {busy ? '套用中…' : '直接套用這一套'}
                            </motion.button>
                            <motion.button {...pressProps('card')}
 onClick={() => { haptic('light'); onCustomise?.(next.config); }}
 className="w-full h-12 rounded-full"
 style={{
 background: 'rgba(246,244,241,0.08)',
 border: '1px solid rgba(246,244,241,0.18)',
 color: 'rgba(246,244,241,0.82)',
 letterSpacing: '0.18em', fontWeight: 800, fontSize: 12,
 }}
 >
                                我想自己調整
                            </motion.button>
                            <motion.button {...pressProps('cta')}
 onClick={() => { haptic('light'); onClose?.(); }}
 className="w-full h-10 rounded-full"
 style={{ color: 'rgba(246,244,241,0.42)', letterSpacing: '0.18em', fontWeight: 800, fontSize: 12 }}
 >
                                之後再說
                            </motion.button>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DiagCard = ({ tone, title, body }) => {
    const good = tone === 'good';
    const color = good ? '#8BC34A' : '#FF9800';
    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } },
            }}
            className="rounded-[20px] p-4 relative overflow-hidden"
            style={{
                background: 'rgba(246,244,241,0.055)',
                border: '1px solid rgba(246,244,241,0.12)',
            }}
        >
            <span className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: color, opacity: 0.9 }} />
            <div className="pl-2">
                <div className="flex items-center gap-2 mb-1.5">
                    {good
                        ? <TrendingUp size={13} color={color} strokeWidth={2.4} />
                        : <span style={{ color, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>△</span>}
                    <span className="text-[13px] font-semibold" style={{ color: C.paper }}>{title}</span>
                </div>
                <p className="text-[11.5px] leading-relaxed m-0" style={{ color: 'rgba(246,244,241,0.62)' }}>{body}</p>
            </div>
        </motion.div>
    );
};

const NextStat = ({ label, value, unit }) => (
    <motion.div
        variants={{
            hidden: { opacity: 0, y: 16, scale: 0.94 },
            visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
        }}
        className="rounded-[18px] px-3 pt-3 pb-4"
        style={{ background: 'rgba(246,244,241,0.06)', border: '1px solid rgba(246,244,241,0.12)' }}
    >
        <div className="text-[9px] font-black tracking-[0.20em] uppercase mb-2" style={{ color: 'rgba(246,244,241,0.42)' }}>{label}</div>
        <div className="flex items-baseline gap-1">
            <span className="font-light tabular-nums" style={{ fontSize: 30, lineHeight: 0.9, color: C.paper, letterSpacing: '-0.03em' }}>{value}</span>
            <span className="text-[9px] font-black tracking-[0.14em] uppercase" style={{ color: 'rgba(246,244,241,0.42)' }}>{unit}</span>
        </div>
    </motion.div>
);

const ReasonLine = ({ text, icon }) => (
    <motion.div
        variants={{
            hidden: { opacity: 0, x: -12 },
            visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
        }}
        className="flex items-start gap-2.5"
    >
        <span
            className="shrink-0 mt-[3px] text-[11px] font-black px-1.5 py-[2px] rounded"
            style={{
                background: icon === 'tune' ? 'rgba(92,107,192,0.20)' : 'rgba(249,92,75,0.18)',
                color: icon === 'tune' ? '#A5AEE0' : '#FFB4A2',
            }}
        >
            {icon === 'tune' ? '調整' : '為何'}
        </span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(246,244,241,0.66)' }}>{text}</span>
    </motion.div>
);

export default PlanCompletionCelebration;
