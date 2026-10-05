/**
 * NutritionCheckpointSheet — 減脂／增重／維持計劃的每 4 週回饋
 * 量體重 → 結果（達成有慶祝、沒達成講原因）→ 接下來怎麼做 → 下一期吃什麼。
 * 規則全在 utils/nutritionCheckpoint 與 utils/foodGuidance；這裡只畫畫面。
 */
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronRight, Scale, TrendingDown, TrendingUp, ArrowRight } from 'lucide-react';
import apiClient from '../api/client';
import { haptic } from '../utils/haptics';
import { toast } from '../utils/toast';
import { pressProps } from '../utils/nutritionMotion';
import {
    readMeasurements, needsFreshMeasurement, evaluateCheckpoint, readTrainingInBlock,
    markCheckpointReviewed, applyKcalDelta, applySlowerPace, CHECKPOINT_WEEKS,
} from '../utils/nutritionCheckpoint';
import { recommendFoods, SLOT_ZH, GUIDANCE_SLOTS } from '../utils/foodGuidance';
import { saveQuickMeasurement } from '../utils/inbodyStore';
import { dishEmoji } from '../utils/nutritionFoodSearch';

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const EMBER = '#D94030';
const MUTED = 'rgba(22,20,21,0.5)';
const HAIR = 'rgba(22,20,21,0.08)';
const EASE = [0.16, 1, 0.3, 1];
const GUIDE_KEY = (uid) => `drvn_food_guidance_${uid || 'guest'}`;

export function readFoodGuidance(userId) {
    try { return JSON.parse(localStorage.getItem(GUIDE_KEY(userId)) || 'null'); } catch { return null; }
}

const Section = ({ children, style }) => (
    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: MUTED, margin: '26px 0 10px', ...style }}>{children}</p>
);

export default function NutritionCheckpointSheet({ open, userId, plan, block, weightKg = 0, dailyKcal = 0, onClose, onApplyPlan, onOpenRecap }) {
    const [measures, setMeasures] = useState(() => readMeasurements(userId));
    const fresh = useMemo(() => (block ? needsFreshMeasurement(measures, block) : { need: false }), [measures, block]);
    const [step, setStep] = useState(null);          // 'measure' | 'result' | 'next'
    const [w, setW] = useState('');
    const [bf, setBf] = useState('');
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState({ dailyLogs: null, mealDays: null });
    const [picked, setPicked] = useState(null);
    const [applying, setApplying] = useState(false);

    useEffect(() => {
        if (!open || !block) return;
        setMeasures(readMeasurements(userId));
        setStep(needsFreshMeasurement(readMeasurements(userId), block).need ? 'measure' : 'result');
        setPicked(null);
        const days = Math.min(90, Math.ceil((Date.now() - block.from) / 86400000) + 1);
        let alive = true;
        Promise.all([
            apiClient.get(`/api/nutrition/sql/history/${userId}?days=${days}&logged_only=true`).then((r) => (r?.data?.history || []).map((d) => {
                const s = d.summary || {};
                return { date: d.date, calories: s.calories || s.total_calories || 0, protein: s.protein || 0 };
            })).catch(() => []),
            apiClient.get(`/api/nutrition/sql/recent-entries/${userId}?days=${days}`).then((r) => r?.data?.days || []).catch(() => []),
        ]).then(([dailyLogs, mealDays]) => { if (alive) setData({ dailyLogs, mealDays }); });
        return () => { alive = false; };
        // 依區塊的「內容」而不是物件本身：套用選項存檔後計劃會換一個 planId，
        // cpDue 重算出一個同樣的新物件 —— 不能因此把使用者踢回第一步、重抓一次資料。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, block?.index, block?.from, userId]);

    const result = useMemo(() => {
        if (!block || !plan || data.dailyLogs == null) return null;
        return evaluateCheckpoint({
            plan, measures, dailyLogs: data.dailyLogs, mealDays: data.mealDays,
            training: readTrainingInBlock(userId, block), block, userId,
        });
    }, [block, plan, measures, data, userId]);

    const guidance = useMemo(() => {
        if (!plan || data.mealDays == null) return null;
        return recommendFoods({ days: data.mealDays, goalType: plan.goalType, weightKg, dailyKcal });
    }, [plan, data.mealDays, weightKg, dailyKcal]);

    // 達成 → 一次成功震動（慶祝畫面只出現在這一刻）
    useEffect(() => {
        if (step === 'result' && result && ['achieved', 'reached'].includes(result.verdict)) haptic('success');
    }, [step, result]);

    if (!open || !block || !plan) return null;

    /* 量測防呆：體重 30–300 kg、體脂 3–60%（選填）。超出範圍的數字
       saveQuickMeasurement 會靜靜丟掉（體脂）或整筆不存（體重），
       畫面卻照樣往下走 —— 使用者以為存了。所以在按鈕這一關就擋，並說出原因。 */
    const wNum = Number(w);
    const bfNum = Number(bf);
    const wOk = w !== '' && wNum >= 30 && wNum <= 300;
    const bfOk = bf === '' || (bfNum >= 3 && bfNum <= 60);
    const measureHint = w !== '' && !wOk ? '體重請輸入 30–300 kg' : !bfOk ? '體脂請輸入 3–60%，或留空' : null;

    const saveMeasure = async () => {
        if (!wOk || !bfOk || saving) return;
        setSaving(true);
        haptic('medium');
        try {
            const res = await saveQuickMeasurement(userId, { weight: w, bodyFat: bf || null });
            if (!res?.ok) { toast.error('這次量測沒有存到，請再按一次'); return; }
            setMeasures(readMeasurements(userId));
            setStep('result');
        } catch {
            toast.error('這次量測沒有存到，請再按一次');
        } finally {
            setSaving(false);
        }
    };

    /* 選項能不能套：調熱量後碳水不到 30 g、或每天熱量低於安全下限，
       applyKcalDelta / applySlowerPace 會回 null —— 這種選項要反灰並講原因，
       不能讓使用者按了「開始下一個 4 週」卻什麼都沒改。 */
    const planFor = (o) => {
        if (o?.id === 'adjust_kcal' && o.delta) return applyKcalDelta(plan, o.delta, `第 ${block.index} 次回饋`);
        if (o?.id === 'slower_pace') return applySlowerPace(plan);
        return undefined;   // 不改計劃的選項
    };
    const blockedOpt = (o) => planFor(o) === null;
    const defaultOpt = result?.options?.find((o) => o.primary && !blockedOpt(o))
        || result?.options?.find((o) => o.id !== 'remeasure' && !blockedOpt(o)) || null;

    const finish = async () => {
        if (applying) return;
        const opt = picked && !blockedOpt(picked) ? picked : defaultOpt;
        const nextPlan = planFor(opt);
        if (nextPlan === null) { toast.error('這個調整會讓每天熱量太低，請改選其他做法'); return; }
        setApplying(true);
        try {
            /* 先存計劃、成功了才算看過這次回饋。以前存失敗也照樣記成「看過」，
               使用者以為熱量調了，其實什麼都沒變，這次回饋也不會再出現。 */
            let savedPlan = null;
            if (nextPlan) {
                try {
                    savedPlan = await onApplyPlan?.(nextPlan);
                } catch (error) {
                    toast.error(error?.code === 'offline' ? error.message : '計劃沒有存成功，請稍後再按一次');
                    return;   // 留在這一頁，選項保留，可以直接再按
                }
            }
            /* 存檔會讓後端換一個 planId（<program_id>:nutrition）。舊的、新的都記成看過，
               不然換了 planId 的新計劃查不到紀錄，同一次回饋會馬上再跳一次、熱量再調一次。 */
            const newPlanId = savedPlan?.planId || null;
            const summary = result ? {
                verdict: result.verdict, delta: result.delta ?? null, ratio: result.ratio ?? null, option: opt?.id || 'continue', at: Date.now(),
            } : null;
            [...new Set([plan.planId, newPlanId].filter(Boolean))].forEach((id) => markCheckpointReviewed(userId, id, block.index, summary));
            if (guidance) {
                try { localStorage.setItem(GUIDE_KEY(userId), JSON.stringify({ planId: newPlanId || plan.planId, index: block.index, at: Date.now(), ...guidance })); } catch { /* */ }
                try { window.dispatchEvent(new CustomEvent('drvn:food-guidance-changed')); } catch { /* */ }
            }
            haptic('success');
            if (opt?.id === 'recap') onOpenRecap?.();
            onClose?.();
        } finally {
            setApplying(false);
        }
    };

    const good = result && ['achieved', 'reached'].includes(result.verdict);
    const dirIcon = plan.goalType === 'bulk' ? TrendingUp : TrendingDown;

    return ReactDOM.createPortal(
        <AnimatePresence>
            <motion.div key="cp" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.4, ease: EASE }}
                style={{ position: 'fixed', inset: 0, zIndex: 300, background: PAPER, color: INK, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ maxWidth: 480, margin: '0 auto', padding: 'calc(env(safe-area-inset-top) + 18px) 20px calc(env(safe-area-inset-bottom) + 28px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: CORAL }}>
                            第 {block.index} 次回饋 · 第 {(block.index - 1) * CHECKPOINT_WEEKS + 1}–{block.index * CHECKPOINT_WEEKS} 週
                        </p>
                        <motion.button {...pressProps('icon')} aria-label="關閉" onClick={() => { haptic('light'); onClose?.(); }}
                            style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={18} color={INK} />
                        </motion.button>
                    </div>

                    {/* ── 1. 先量 ── */}
                    {step === 'measure' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                            <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', margin: '18px 0 6px' }}>先量一次體重</h2>
                            <p style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>
                                {fresh.last ? `上次是 ${fresh.ageDays} 天前（${fresh.last.weight} kg）。` : '這一期還沒有量過。'}
                                回饋只看真的量到的數字。早上、空腹、上完廁所量最準。
                            </p>
                            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                                <label style={{ flex: 1.3 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: MUTED }}>體重 kg</span>
                                    <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(/[^\d.]/g, ''))} placeholder={fresh.last ? String(fresh.last.weight) : '例如 65.2'}
                                        style={{ width: '100%', height: 56, marginTop: 6, borderRadius: 14, border: `1.5px solid ${INK}`, padding: '0 14px', fontSize: 22, fontWeight: 900, color: INK, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
                                </label>
                                <label style={{ flex: 1 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: MUTED }}>體脂 %（選填）</span>
                                    <input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value.replace(/[^\d.]/g, ''))} placeholder={fresh.last?.bodyFat ? String(fresh.last.bodyFat) : '—'}
                                        style={{ width: '100%', height: 56, marginTop: 6, borderRadius: 14, border: `1px solid ${HAIR}`, padding: '0 14px', fontSize: 22, fontWeight: 800, color: INK, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
                                </label>
                            </div>
                            {measureHint && (
                                <p style={{ fontSize: 13, fontWeight: 800, color: EMBER, marginTop: 10 }}>{measureHint}</p>
                            )}
                            <motion.button {...pressProps('card')} disabled={!wOk || !bfOk || saving} onClick={saveMeasure}
                                style={{ width: '100%', height: 56, marginTop: 20, borderRadius: 18, border: 'none', background: wOk && bfOk ? INK : 'rgba(22,20,21,0.15)', color: PAPER, fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <Scale size={18} /> {saving ? '存檔中…' : '存好，看結果'}
                            </motion.button>
                            {fresh.last && (
                                <motion.button {...pressProps('row')} onClick={() => setStep('result')}
                                    style={{ width: '100%', minHeight: 48, marginTop: 8, border: 'none', background: 'none', color: MUTED, fontSize: 14, fontWeight: 800 }}>
                                    先用 {fresh.ageDays} 天前的數字
                                </motion.button>
                            )}
                        </motion.div>
                    )}

                    {/* ── 2. 結果 ── */}
                    {step === 'result' && !result && (
                        <p style={{ marginTop: 40, fontSize: 14, color: MUTED, textAlign: 'center' }}>整理這 4 週的紀錄…</p>
                    )}
                    {step === 'result' && result && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                            <motion.div
                                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                                style={{ marginTop: 18, borderRadius: 28, padding: 26, position: 'relative', overflow: 'hidden',
                                    // 達成用深色鈦金屬面（與一期結算同一種），沒達成用白卡 —— 一眼分得出來
                                    background: good ? 'linear-gradient(135deg, #2A2724 0%, #1B1917 38%, #100E0D 72%, #232020 100%)' : '#fff',
                                    border: good ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${HAIR}`,
                                    boxShadow: good ? '0 18px 40px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.12)' : 'none' }}>
                                {good && (<>
                                    {/* 慶祝：coral 光暈擴散一次＋勾勾畫出來（設計系統：不做彩帶、不閃全螢幕） */}
                                    <motion.div initial={{ opacity: 0.55, scale: 0.5 }} animate={{ opacity: 0, scale: 2.2 }} transition={{ duration: 1.3, ease: EASE, delay: 0.1 }}
                                        style={{ position: 'absolute', top: -40, right: -40, width: 280, height: 280, borderRadius: '50%', pointerEvents: 'none', background: 'radial-gradient(circle, rgba(249,92,75,0.6) 0%, transparent 70%)' }} />
                                    <svg width="56" height="56" viewBox="0 0 56 56" style={{ position: 'relative', display: 'block', marginBottom: 14 }}>
                                        <motion.circle cx="28" cy="28" r="25" fill="none" stroke={CORAL} strokeWidth="3"
                                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: EASE }} />
                                        <motion.path d="M17 29 L25 37 L40 20" fill="none" stroke={PAPER} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: EASE, delay: 0.55 }} />
                                    </svg>
                                </>)}
                                <div style={{ position: 'relative' }}>
                                    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: good ? CORAL : (result.verdict === 'check' ? EMBER : MUTED) }}>
                                        {{ achieved: '達成', reached: '目標達成', too_fast: '達成，但太快', partial: '還沒達成', missed: '還沒達成', reverse: '走反了', drift: '偏離了', check: '先確認數字', no_data: '資料不夠' }[result.verdict]}
                                    </p>
                                    <motion.h2 initial={{ scale: good ? 0.7 : 1, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18, delay: good ? 0.2 : 0 }}
                                        style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', margin: '8px 0 6px', color: good ? PAPER : INK, lineHeight: 1.2 }}>
                                        {result.headline}
                                    </motion.h2>
                                    <p style={{ fontSize: 13.5, lineHeight: 1.6, color: good ? 'rgba(246,244,241,0.7)' : MUTED }}>{result.sub}</p>
                                    {result.expected > 0 && result.ratio != null && result.verdict !== 'check' && (
                                        <div style={{ marginTop: 18 }}>
                                            <div style={{ height: 6, borderRadius: 99, background: good ? 'rgba(246,244,241,0.15)' : 'rgba(22,20,21,0.08)', overflow: 'hidden' }}>
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, result.ratio * 100))}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
                                                    style={{ height: '100%', borderRadius: 99, background: CORAL }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, fontWeight: 800, color: good ? 'rgba(246,244,241,0.55)' : MUTED }}>
                                                <span>實際 {result.toward > 0 ? '' : '−'}{Math.abs(result.toward)} kg</span>
                                                <span>這 4 週目標 {result.expected} kg</span>
                                            </div>
                                        </div>
                                    )}
                                    {result.bodyFat?.delta != null && (
                                        <p style={{ marginTop: 12, fontSize: 13, fontWeight: 800, color: good ? PAPER : INK }}>
                                            體脂 {result.bodyFat.start}% → {result.bodyFat.end}%（{result.bodyFat.delta > 0 ? '+' : ''}{result.bodyFat.delta}%）
                                        </p>
                                    )}
                                </div>
                            </motion.div>

                            {result.praise?.length > 0 && (<>
                                <Section>做得好的地方</Section>
                                {result.praise.map((t) => (
                                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${HAIR}` }}>
                                        <Check size={16} color={CORAL} strokeWidth={3} /><span style={{ fontSize: 15, fontWeight: 800 }}>{t}</span>
                                    </div>
                                ))}
                            </>)}

                            {result.reasons?.length > 0 && (<>
                                <Section>{result.verdict === 'too_fast' ? '為什麼太快' : '可能的原因'}</Section>
                                {result.reasons.map((r, i) => (
                                    <motion.div key={r.code} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06, ease: EASE }}
                                        style={{ padding: '12px 0 12px 14px', borderLeft: `2px solid ${i === 0 ? CORAL : 'rgba(207,198,184,0.9)'}`, marginBottom: 10 }}>
                                        <p style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em' }}>{r.title}</p>
                                        <p style={{ fontSize: 13, lineHeight: 1.6, color: MUTED, marginTop: 4 }}>{r.detail}</p>
                                    </motion.div>
                                ))}
                            </>)}

                            <motion.button {...pressProps('card')} onClick={() => {
                                haptic('light');
                                if (result.verdict === 'check') {
                                    const opt = picked || result.options[0];
                                    if (opt.id === 'remeasure') { setStep('measure'); return; }
                                }
                                setStep('next');
                            }}
                                style={{ width: '100%', height: 56, marginTop: 22, borderRadius: 18, border: 'none', background: INK, color: PAPER, fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                {result.verdict === 'check' ? '重新量一次' : '接下來怎麼做'} <ArrowRight size={18} />
                            </motion.button>
                            {result.verdict === 'check' && (
                                <motion.button {...pressProps('row')} onClick={() => { setPicked(result.options[1]); setStep('next'); }}
                                    style={{ width: '100%', minHeight: 48, marginTop: 8, border: 'none', background: 'none', color: MUTED, fontSize: 14, fontWeight: 800 }}>
                                    數字沒錯，繼續
                                </motion.button>
                            )}
                        </motion.div>
                    )}

                    {/* ── 3. 接下來＋下一期吃什麼 ── */}
                    {step === 'next' && result && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                            <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: '18px 0 4px' }}>下一個 4 週</h2>
                            {result.options.filter((o) => o.id !== 'remeasure').map((o) => {
                                const blocked = blockedOpt(o);
                                const sel = !blocked && ((picked && !blockedOpt(picked) ? picked : defaultOpt)?.id === o.id);
                                return (
                                    <motion.button key={o.id} {...pressProps('card')} disabled={blocked} aria-disabled={blocked}
                                        onClick={() => { if (blocked) return; haptic('light'); setPicked(o); }}
                                        style={{ width: '100%', textAlign: 'left', marginTop: 10, padding: '14px 16px', borderRadius: 18, background: '#fff', border: `1.5px solid ${sel ? INK : HAIR}`, display: 'flex', gap: 12, alignItems: 'flex-start', opacity: blocked ? 0.45 : 1 }}>
                                        <span style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? INK : 'transparent', border: sel ? 'none' : '1.5px solid rgba(22,20,21,0.25)' }}>
                                            {sel && <Check size={13} color="#fff" strokeWidth={3} />}
                                        </span>
                                        <span style={{ flex: 1 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 16, fontWeight: 900, color: INK }}>{o.label}</span>
                                                {o.primary && !blocked && <span style={{ fontSize: 11, fontWeight: 800, color: EMBER, background: 'rgba(249,92,75,0.12)', borderRadius: 8, padding: '2px 7px' }}>建議</span>}
                                            </span>
                                            <span style={{ display: 'block', fontSize: 13, lineHeight: 1.55, color: MUTED, marginTop: 3 }}>
                                                {blocked ? '這樣每天熱量會低於安全下限（或碳水不到 30 g），這次先不調；需要的話到計劃精靈重新設定。' : o.detail}
                                            </span>
                                        </span>
                                    </motion.button>
                                );
                            })}

                            <Section>下一期建議飲食</Section>
                            {!guidance || guidance.basedOnDays < 3 ? (
                                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: MUTED }}>
                                    這 4 週記錄的天數太少，還看不出你每一餐習慣吃什麼。下面先放對這個目標特別有幫助的選擇；記錄多了，下次會照你吃的來建議。
                                </p>
                            ) : (
                                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: MUTED }}>依你這 4 週真的吃過的東西（{guidance.basedOnDays} 天）。會放進快速新增，點一下就能記。</p>
                            )}
                            {guidance?.insights?.map((t) => (
                                <p key={t.code} style={{ fontSize: 13.5, lineHeight: 1.6, color: INK, fontWeight: 700, marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${CORAL}` }}>{t.text}</p>
                            ))}
                            {guidance && GUIDANCE_SLOTS.map((slot) => {
                                const s = guidance.slots[slot];
                                if (!s || (!s.keep.length && !s.swaps.length && !s.discover.length)) return null;
                                return (
                                    <div key={slot} style={{ marginTop: 18 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <span style={{ fontSize: 17, fontWeight: 900 }}>{SLOT_ZH[slot]}</span>
                                            {s.proteinPerMeal && <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>這餐蛋白質 ≥ {s.proteinPerMeal}g</span>}
                                        </div>
                                        {s.keep.map((k) => (
                                            <div key={`k${k.name}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${HAIR}` }}>
                                                <Check size={15} color="#5A7A3A" strokeWidth={3} />
                                                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800 }}>{k.name}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>留著 · {k.why}</span>
                                            </div>
                                        ))}
                                        {s.swaps.map((x) => (
                                            <div key={`s${x.from.name}`} style={{ padding: '10px 0', borderBottom: `1px solid ${HAIR}` }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}>
                                                    <span style={{ color: MUTED, textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '38%' }}>{x.from.name}</span>
                                                    <ChevronRight size={14} color={CORAL} />
                                                    <span>{dishEmoji(x.to)} {x.to.name}</span>
                                                </div>
                                                <p style={{ fontSize: 12, fontWeight: 700, color: EMBER, marginTop: 3 }}>{x.why}{x.to.estimate ? '（一般份量估算）' : ''}</p>
                                            </div>
                                        ))}
                                        {s.discover.map((d) => (
                                            <div key={`d${d.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${HAIR}` }}>
                                                <span style={{ fontSize: 18 }}>{dishEmoji(d)}</span>
                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{d.name}</span>
                                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: MUTED }}>試試 · {d.why} · {d.calories} 大卡</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}

                            <motion.button {...pressProps('card')} disabled={applying} onClick={finish}
                                style={{ width: '100%', height: 56, marginTop: 26, borderRadius: 18, border: 'none', background: CORAL, color: '#fff', fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                {React.createElement(dirIcon, { size: 18 })} {applying ? '存檔中…' : '開始下一個 4 週'}
                            </motion.button>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body,
    );
}
