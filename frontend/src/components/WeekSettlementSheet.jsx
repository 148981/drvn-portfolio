import React, { useMemo, useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft, TrendingUp, Minus, TrendingDown, CheckCircle2,
    Sparkles, Activity,
} from 'lucide-react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { evaluateWeek, applyAdjustmentsToWeek, calibratePaceFromActuals, applyCalibrationToPlan } from '../utils/cardioSettlementEngine';
import { hasBrickActivity, paceCalibrationSamples } from '../utils/cardioPlanActuals';
import { loadCardioHistory } from '../utils/cardioLoadHistory';
import { predictRaceTimesFromPlan } from '../adapters/cardioAdapter';
import { brandColors as C } from '../utils/colors';
import { useMembership } from '../utils/membership';
import { gateRunAdjustments } from '../utils/memberProgression';
import MemberLockCard from './MemberLockCard';
import { SWISS, TYPE } from '../utils/swissUI';
import { mondayWeekKey } from '../utils/localDate';

// 「這週結算已看」的週 key 必須跟跑步頁（寫 run_week_done_）與 homeAlerts（讀）同一支
// mondayWeekKey —— 以前這裡自己算的週數跟它們差一週，結算完首頁提示還是亮著。
const weekKeyOf = (d = new Date()) => mondayWeekKey(d);

/* ════════════════════════════════════════════════════════════════════
   WeekSettlementSheet
   ────────────────────────────────────────────────────────────────────
   Swiss editorial × titanium settlement sheet.
   Shows the verdict (promote / hold / demote) with the math behind it,
   then a preview of the adjusted next week.
   ──────────────────────────────────────────────────────────────────── */

const VERDICT_VISUAL = {
    promote: {
        label: '晉級',
        sub: 'You absorbed the load',
        headline: 'Ready to level up.',
        paragraph: '你成功消化了這週的訓練量，身體適應良好。我們將適度提升下週的強度，繼續突破。',
        Icon: TrendingUp,
        accent: '#2E9B6E',
        chipBg: 'rgba(123,211,165,0.18)',
        chipFg: '#1F5E3F',
    },
    hold: {
        label: '維持',
        sub: 'Repeat the dose',
        headline: 'Consistency is key.',
        paragraph: '你這週表現得很穩！為了鞏固目前的有氧基底，系統會為你保持當前的訓練劑量。',
        Icon: Minus,
        accent: '#5481D4',
        chipBg: 'rgba(165,196,255,0.22)',
        chipFg: '#1F4FA0',
    },
    demote: {
        label: '減量',
        sub: 'Recovery first',
        headline: 'Step down.',
        paragraph: '你似乎需要更多的恢復時間。我們為你下調了下週的里程，保護你的身體並準備重新出發。',
        Icon: TrendingDown,
        accent: C.coralDeep,
        chipBg: 'rgba(249,92,75,0.18)',
        chipFg: '#8A2A1F',
    },
};

const StatDoughnut = ({ val, color, label, valueText = null, unit = '%' }) => {
    const r = 24;
    const c = Math.PI * r * 2;
    const offset = c - Math.max(0, Math.min(1, val || 0)) * c;
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
                <svg width="64" height="64" viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
                    <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(207,198,184,0.3)" strokeWidth="6" />
                    <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
                        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" 
                        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                    />
                </svg>
                <span className="text-[14px] font-black share-tech-mono" style={{ color: C.ink }}>
                    {valueText ?? Math.round((val || 0) * 100)}<span className="text-[11px]" style={{ color: 'rgba(22,20,21,0.5)' }}>{unit}</span>
                </span>
            </div>
            <span className="text-[9px] font-extrabold tracking-[0.2em] uppercase" style={{ color: 'rgba(22,20,21,0.50)' }}>
                {label}
            </span>
        </div>
    );
};

const ScoreGauge = ({ score, accent }) => {
    const r = 32; // 半徑
    const numTicks = 40; // 刻度數量
    return (
        <div className="flex items-center gap-4">
            <div className="relative" style={{ width: 80, height: 80 }}>
                {/* 刻度背景 (參考 image_3.png) */}
                <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0">
                    {Array.from({ length: numTicks }).map((_, i) => {
                        const angle = (i / numTicks) * 2 * Math.PI - Math.PI / 2;
                        const isLong = i % 5 === 0;
                        const x1 = 40 + (r - (isLong ? 6 : 3)) * Math.cos(angle);
                        const y1 = 40 + (r - (isLong ? 6 : 3)) * Math.sin(angle);
                        const x2 = 40 + r * Math.cos(angle);
                        const y2 = 40 + r * Math.sin(angle);
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i < (score/100)*numTicks ? C.coral : C.sand} strokeWidth="2" />;
                    })}
                </svg>
                {/* 內部得分 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[20px] font-black share-tech-mono leading-none" style={{ color: C.ink }}>{score}</span>
                </div>
            </div>
            <div>
                <div className="text-[9px] font-extrabold tracking-[0.22em] uppercase" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    SCORE
                </div>
                <div className="text-[11px] font-bold mt-0.5" style={{ color: 'rgba(22,20,21,0.65)' }}>
                    out of 100
                </div>
            </div>
        </div>
    );
};

const WeekSettlementSheet = ({ onClose, weekOverride = null, nextWeekOverride = null }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const userId = getUserId();

    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [history, setHistory] = useState({ sessions: [], complete: false });

    // ── Load plan ──────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!userId) { setLoading(false); return; }
            try {
                const [res, sessions] = await Promise.all([
                    apiClient.get(`/api/cardio-plan/${userId}/latest`), loadCardioHistory(userId),
                ]);
                if (!cancelled) { setPlan(res.data?.plan || null); setHistory(sessions); }
            } catch (e) {
                console.warn('[Settlement] load failed', e?.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [userId, weekOverride]);

    // pick: the most recent week with at least one non-pending brick
    const targetWeek = useMemo(() => {
        if (weekOverride) return weekOverride;
        const passedIdx = location.state?.weekIndex;
        const weeks = plan?.weeks || [];
        if (passedIdx) return weeks.find((w) => w.week_index === passedIdx) || null;
        // fallback: latest week that has any completion activity
        for (let i = weeks.length - 1; i >= 0; i--) {
            const w = weeks[i];
            const settled = (w.bricks || []).some(
                hasBrickActivity
            );
            if (settled) return w;
        }
        return weeks[0] || null;
    }, [plan, weekOverride, location.state]);

    const nextWeek = useMemo(() => {
        if (nextWeekOverride) return nextWeekOverride;
        if (!plan || !targetWeek) return null;
        return (plan.weeks || []).find((w) => w.week_index === targetWeek.week_index + 1) || null;
    }, [plan, targetWeek, nextWeekOverride]);

    const settlement = useMemo(() => {
        if (!targetWeek) return null;
        // 🛡️ ACWR 傷害預防：帶入歷史 cardio sessions，負荷比 >1.5 時擋升階＋警示
        const evaluated = evaluateWeek(targetWeek, [], { allSessions: history.sessions, historyComplete: history.complete });
        if (!targetWeek.settlement) return evaluated;
        return { ...evaluated, ...targetWeek.settlement,
            adjustments: targetWeek.settlement.adjustments || { next_week_mileage_multiplier: 1 },
            proposal: null,
        };
    }, [targetWeek, history]);

    // 成績預測（依本週計劃目標推算）— 從計劃信箱移到訓練看板顯示
    const racePred = useMemo(() => {
        if (!targetWeek) return null;
        return predictRaceTimesFromPlan({ week: targetWeek, bricks: targetWeek.bricks || [] });
    }, [targetWeek]);

    // ── 配速自適應校準：從本週已完成 brick 的實際距離/時間反推真實配速 ──
    const calibration = useMemo(() => {
        if (!plan || !targetWeek) return null;
        const sessions = paceCalibrationSamples(targetWeek);
        if (sessions.length === 0) return null;
        return calibratePaceFromActuals(plan, sessions);
    }, [plan, targetWeek]);

    // 💳 減量永遠免費，自動加量才是會員（memberProgression 唯一判斷）
    const { member } = useMembership();
    const runGate = useMemo(() => {
        if (!settlement || targetWeek?.settlement) return { adjustments: settlement?.adjustments, locked: false };
        return gateRunAdjustments(settlement.adjustments, member);
    }, [settlement, targetWeek, member]);
    const gatedAdjustments = runGate.adjustments;
    const lockedPct = runGate.locked
        ? Math.round((Number(settlement?.adjustments?.next_week_mileage_multiplier) - 1) * 100)
        : 0;

    const adjustedNext = useMemo(() => {
        if (!nextWeek || !settlement) return null;
        if (targetWeek?.settlement) return nextWeek;
        // 下週已被 autoAdjustPlan 依完成度調過（非 noop）→ 後端結算不會再套倍率，
        // 預覽也不能再套一次，否則畫面顯示的是砍兩次的里程。
        const alreadyAdjusted = nextWeek.auto_adjusted && !nextWeek.auto_adjusted.noop;
        const adjusted = alreadyAdjusted ? nextWeek : applyAdjustmentsToWeek(nextWeek, gatedAdjustments);
        return applyCalibrationToPlan({ weeks: [adjusted] }, calibration, targetWeek.week_index).weeks[0];
    }, [nextWeek, settlement, calibration, targetWeek, gatedAdjustments]);

    // ── Save settlement to backend ─────────────────────────
    // applyAdjust=true → 套用系統建議的下週調整；false → 維持原計劃，不調整里程/配速。
    const handleCommit = async (applyAdjust = true) => {
        if (!userId || !targetWeek || !settlement || saving) return;
        if (!plan?.plan_id) { setSaveError('尚未載入計劃，請重新開啟結算頁。'); return; }
        setSaving(true);
        setSaveError(null);
        let persisted = false;
        try {
            const res = await apiClient.post('/api/cardio-plan/settle-week', {
                user_id: userId,
                plan_id: plan.plan_id,
                expected_updated_at: plan.updated_at,
                week_index: targetWeek.week_index,
                // 使用者選擇不調整 → 把調整清空，後端就不會改下週。
                apply_adjustments: applyAdjust,
                settlement: {
                    verdict: settlement.verdict,
                    score: settlement.score,
                    stats: settlement.stats,
                    adjustments: applyAdjust ? gatedAdjustments : null,
                    settled_at: new Date().toISOString(),
                },
                // 配速校準只在「同意調整」時套用
                pace_calibration: (applyAdjust && calibration?.samples > 0) ? {
                    new_baseline_pace_5k_sec: calibration.newBaselinePace5K,
                    pacing_mode: calibration.pacingMode,
                    confidence: calibration.confidence,
                    samples: calibration.samples,
                } : null,
            });
            if (res.data?.status !== 'success' || !res.data?.plan) throw new Error('Invalid settlement response');
            setPlan(res.data.plan);
            persisted = true;
        } catch (e) {
            console.warn('[Settlement] save failed:', e?.message);
            const conflict = e?.response?.status === 409;
            setSaveError(conflict
                ? '課表剛更新過，已載入最新內容，請確認後再按一次。'
                : '結算尚未保存，請確認網路後再試一次。');
            // 409 以前是死路：plan.updated_at 還是舊的，再按幾次都一樣 409。
            // 重抓最新計劃換掉，重試就會帶新的 expected_updated_at。
            if (conflict) {
                try {
                    const fresh = await apiClient.get(`/api/cardio-plan/${userId}/latest`);
                    if (fresh.data?.plan) setPlan(fresh.data.plan);
                } catch { /* 重抓失敗就維持錯誤訊息 */ }
            }
        } finally {
            setSaving(false);
            if (persisted) {
                // 只有後端確認保存後，才能消除首頁的結算待辦；失敗時保留畫面讓使用者重試。
                try {
                    const wk = weekKeyOf();
                    localStorage.setItem(`run_settlement_seen_${userId}_${wk}`, '1');
                    localStorage.removeItem(`run_week_done_${userId}`);
                    window.dispatchEvent(new CustomEvent('drvn:home-alerts-refresh'));
                } catch { /* ignore */ }
                onClose ? onClose() : navigate(-1);
            }
        }
    };

    // ── Render ─────────────────────────────────────────────
    if (loading) return <SkeletonState />;
    if (!targetWeek || !settlement) return <EmptyState onClose={() => navigate(-1)} />;

    const v = VERDICT_VISUAL[settlement.verdict] || VERDICT_VISUAL.hold;
    const proposal = settlement.proposal;          // 🗣 詢問式提議
    const hasRecord = settlement.hasRecord !== false && settlement.score != null;
    const isQuiet = !hasRecord;

    return (
        <div
            className="fixed inset-0 z-[100100] flex flex-col"
            style={{
                background: SWISS.paper,   // 🇨🇭 極簡：純 Paper 底，不用漸層
                color: C.ink,
                fontFamily: 'var(--font-body)',
            }}
        >
            <Header onBack={() => (onClose ? onClose() : navigate(-1))} weekIdx={targetWeek.week_index} />

            <div className="relative flex-1 overflow-y-auto px-6 pb-6">
                {/* ── Headline & Explanation ─────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                    {/* ══════════════════════════════════════════════════
                        🗣 詢問式結算 —— 系統攤開事實與選項，決定權在跑者手上。
                        舊版直接宣告「我們將下週的里程降為 80%」，那是替使用者決定；
                        新版改成問句 + 兩顆按鈕（見底部 FooterCTA）。
                        ══════════════════════════════════════════════════ */}
                    {/* ★ v2.3 精簡：原本標題下面連著 sub、body、focus 三段小字，
                        內容還互相重複（「休息也是計劃的一部分」出現兩次）。
                        現在只留「大標 + 一句該做什麼」，其餘全部砍掉。 */}
                    <SectionDisplay
                        kicker={`第 ${String(targetWeek.week_index).padStart(2, '0')} 週 · 結算`}
                        heading={proposal?.title || (isQuiet ? '這週先休息了。' : v.headline)}
                    />

                    {/* 這週最該做的「一件事」—— 大字，不包框 */}
                    {(runGate.locked || proposal?.focus || proposal?.body || v.paragraph) && (
                        <p
                            className="mt-5 font-light"
                            style={{ fontSize: 20, lineHeight: 1.5, letterSpacing: '-0.01em', color: 'rgba(22,20,21,0.82)' }}
                        >
                            {runGate.locked
                                ? '身體吸收了這個量。下週先照原本的課，把它踩實。'
                                : (proposal?.focus || proposal?.body || v.paragraph)}
                        </p>
                    )}
                </motion.div>

                {/* ── Data Evidence (Conditional Doughnuts) ──────── */}
                <div className="mt-8">
                    <SectionLabel className="mb-3">本週數據表現</SectionLabel>
                    <div
                        className="rounded-[28px] p-6 flex items-center justify-center min-h-[120px]"
                        style={{
                            background: 'rgba(255,255,255,0.45)',
                            backdropFilter: 'blur(40px) saturate(2)',
                            WebkitBackdropFilter: 'blur(40px) saturate(2)',
                            border: '1px solid rgba(255,255,255,0.7)',
                            boxShadow: '0 8px 32px rgba(22,20,21,0.06), inset 0 2px 4px rgba(255,255,255,1)'
                        }}
                    >
                        {!isQuiet ? (
                            <div className="flex w-full justify-between">
                                <StatDoughnut val={settlement.stats.completion_rate} color={C.coral} label="課程完成" />
                                <StatDoughnut val={settlement.stats.mileage_rate} color="#7BD3A5" label="里程達成" />
                                <StatDoughnut val={(settlement.stats.avg_rpe || 0) / 10} color="#A5C4FF" label="平均RPE"
                                    valueText={settlement.stats.avg_rpe == null ? '—' : settlement.stats.avg_rpe.toFixed(1)} unit="/10" />
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className="text-[12px] font-bold" style={{ color: C.ink }}>
                                    尚無訓練紀錄
                                </div>
                                <div className="text-[11px] mt-1" style={{ color: 'rgba(22,20,21,0.6)' }}>
                                    這週讓身體徹底重置，我們下週重新出發。
                                </div>
                            </div>
                        )}
                    </div>
                    {/* 💯 The System Heard You — RPE 因果連結 */}
                    {!isQuiet && (
                        <SystemHeardYouCard
                            avgRpe={settlement.stats.avg_rpe}
                            targetRpe={settlement.target_rpe_band || { min: 5, max: 6, label: '輕鬆' }}
                            mileageMultiplier={settlement.adjustments?.next_week_mileage_multiplier}
                            verdict={v.label}
                        />
                    )}
                </div>

                {/* ── 🏁 成績預測（依本週計劃目標推算）───────────────── */}
                {racePred?.predictions && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-8"
                    >
                        <SectionLabel className="mb-3">成績預測 · 照計劃練</SectionLabel>
                        <div style={{ padding: '16px 18px', borderRadius: 18, background: 'linear-gradient(135deg, rgba(249,92,75,0.09), rgba(249,92,75,0.03))', border: '1px solid rgba(249,92,75,0.18)' }}>
                            {racePred.basisPaceSecPerKm > 0 && (
                                <div className="text-[12px] font-bold tracking-[0.12em] mb-3" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                    基準配速 {Math.floor(racePred.basisPaceSecPerKm / 60)}'{String(racePred.basisPaceSecPerKm % 60).padStart(2, '0')}"/km
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 24 }}>
                                {['5K', '10K', 'Half'].filter(k => racePred.predictions[k]).map((k) => {
                                    const p = racePred.predictions[k];
                                    const sec = p.seconds;
                                    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
                                    const tt = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
                                    const pace = p.pacePerKm;
                                    const paceStr = `${Math.floor(pace / 60)}'${String(pace % 60).padStart(2, '0')}"`;
                                    const label = k === 'Half' ? '半馬' : k;
                                    return (
                                        <div key={k}>
                                            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(22,20,21,0.4)' }}>{label}</div>
                                            <div className="text-[22px] font-light" style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{tt}</div>
                                            <div className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.38)', fontVariantNumeric: 'tabular-nums' }}>{paceStr}/km</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── 🏃 配速自適應校準卡（有真實資料才出現）────────────── */}
                {calibration && calibration.samples > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-8"
                    >
                        <SectionLabel className="mb-3">配速自適應</SectionLabel>
                        <div
                            className="rounded-[24px] p-5"
                            style={{
                                background: 'rgba(22,20,21,0.85)',
                                color: C.paper,
                                backdropFilter: 'blur(40px) saturate(180%)',
                                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                boxShadow: '0 12px 32px rgba(22,20,21,0.3), inset 0 1.5px 1px rgba(255,255,255,0.16)',
                            }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[12px] font-black tracking-widest" style={{ color: C.coral }}>
                                    {calibration.pacingMode === 'calibrated' ? 'PACE CALIBRATED · 實測校準' : 'PACE'}
                                </span>
                                <span className="text-[11px] font-mono" style={{ color: 'rgba(246,244,241,0.55)' }}>
                                    信心 {Math.round(calibration.confidence * 100)}% · {calibration.samples} 筆
                                </span>
                            </div>
                            {calibration.rationale.map((line, i) => (
                                <p key={i} className="text-[12px] leading-relaxed" style={{ color: i === 0 ? C.paper : 'rgba(246,244,241,0.7)' }}>
                                    {line}
                                </p>
                            ))}
                            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'rgba(246,244,241,0.45)' }}>
                                接受建議並保存後，新的配速基準會套用到未來尚未開始的課程。
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* ── Verdict & Next Week Preview (Integrated) ─────────────────────── */}
                {adjustedNext && (
                    <div className="mt-8 relative">
                        <SectionLabel className="mb-3">本週評語 & 下週預覽</SectionLabel>
                        {!history.complete && <p className="text-sm mb-3">近期跑量資料尚未完整載入，目前不建議加量。請連線後重新開啟本頁確認。</p>}
                        {(nextWeek?.bricks || []).some(hasBrickActivity) && (
                            <p className="text-sm mb-3">下週已有執行紀錄，里程與課程組成維持原樣；配速校準僅影響尚未開始的課程。</p>
                        )}
                        
                        {/* ══════════════════════════════════════════════
                            🇨🇭 評語列 —— 深色圓角卡 → 髮絲線列。
                            🚫 而且「沒有訓練紀錄就整塊不出現」：
                               完全沒跑的一週不需要被評語、更不需要被打分。
                               （使用者截圖：0 訓練被打 20 分 —— 那是審判不是陪伴。）
                            ══════════════════════════════════════════════ */}
                        {hasRecord && (
                            <div
                                className="relative z-10 flex items-end justify-between"
                                style={{ padding: '18px 2px', borderTop: SWISS.hairline, borderBottom: SWISS.hairline, marginBottom: 12 }}
                            >
                                <div>
                                    <div style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.35)', marginBottom: 6 }}>評語</div>
                                    <div style={{ ...TYPE.title, fontSize: 22, color: v.accent }}>{v.label}</div>
                                </div>
                                <div className="text-right">
                                    <div style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.35)', marginBottom: 6 }}>分數</div>
                                    <div style={{ ...TYPE.display, fontSize: 38, color: C.ink }}>
                                        {settlement.score}
                                        <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.32)', marginLeft: 4 }}>/100</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Next Week Preview */}
                        <NextWeekPreview
                            original={nextWeek}
                            adjusted={adjustedNext}
                            multiplier={gatedAdjustments?.next_week_mileage_multiplier ?? 1}
                        />
                    </div>
                )}

                {/* ── Bricks breakdown ──────────────────────── */}
                {!isQuiet && (
                    <>
                        <SectionLabel className="mt-9">THIS WEEK · BRICK BY BRICK</SectionLabel>
                        <div className="mt-3 flex flex-col gap-1.5">
                            {(targetWeek.bricks || []).map((b) => (
                                <BrickRow key={b.brick_id} brick={b} />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {saveError && (
                <div className="px-6 pb-2 text-center text-[11px] font-bold" style={{ color: C.coralDeep }} role="alert">
                    {saveError}
                </div>
            )}
            {runGate.locked && (
                <div className="relative z-10 px-6 pt-2">
                    <MemberLockCard feature="runAutoProgress" label={`下週自動加 ${lockedPct}% 里程`} />
                </div>
            )}
            <FooterCTA
                onCommit={handleCommit}
                saving={saving}
                verdict={v.label}
                primaryLabel={runGate.locked ? '好，照這個量' : proposal?.primaryLabel}
                secondaryLabel={proposal?.secondaryLabel}
                hideSecondary={runGate.locked}
            />
        </div>
    );
};

export default WeekSettlementSheet;

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════

const Header = ({ onBack, weekIdx }) => (
    <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between">
        <motion.button {...pressProps('pill')} aria-label="返回"
 onClick={onBack}
 className="w-10 h-10 rounded-full flex items-center justify-center"
 style={{
 background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)',
 border: '1px solid rgba(255,255,255,0.85)',
 boxShadow: '0 4px 10px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 >
            <ArrowLeft size={18} strokeWidth={2.4} color={C.ink} />
        </motion.button>
        <div className="flex flex-col items-center gap-1.5">
            <span className="text-[12px] font-extrabold tracking-[0.28em]" style={{ color: 'rgba(22,20,21,0.40)' }}>
                計劃儀表板
            </span>
            <span className="text-[9px] font-extrabold tracking-[0.20em] uppercase" style={{ color: C.ink }}>
                WK {String(weekIdx).padStart(2, '0')}
            </span>
        </div>
        <div style={{ width: 40 }} />
    </div>
);

const FooterCTA = ({ onCommit, saving, verdict, primaryLabel, secondaryLabel, hideSecondary = false }) => (
    <div className="relative z-10 px-6 pb-10 pt-3">
        <div className="flex gap-[2px] mb-4 px-1">
            {['#FDD835', '#8BC34A', '#FF9800', '#F06292', '#5C6BC0'].map((c, i) => (
                <div key={i} className="flex-1 rounded-full" style={{ height: 3, background: c, opacity: 0.55 + i * 0.08 }} />
            ))}
        </div>
        {/* 主要：套用系統建議的下週調整 */}
        <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onCommit(true)}
            disabled={saving}
            className="w-full h-[58px] rounded-full flex items-center justify-center gap-2 relative overflow-hidden"
            style={{
                // 動態調整按鈕 → 淡一點的 coral（柔和珊瑚，不是品牌濃橘）
                background: 'linear-gradient(135deg, #FF9A87 0%, #F98374 55%, #F5786A 100%)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.28)',
                boxShadow: '0 12px 28px rgba(245,120,106,0.30), inset 0 1px 2px rgba(255,255,255,0.42), inset 0 -2px 6px rgba(217,64,48,0.18)',
                letterSpacing: '0.22em', fontWeight: 800, fontSize: 12,
            }}
        >
            <span
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.30) 46%, transparent 62%)',
                    mixBlendMode: 'screen',
                }}
            />
            <CheckCircle2 size={15} strokeWidth={2.4} />
            {/* 🗣 按鈕文案改用「提議」的口吻（例：好，降 10% ／ 好，用 80% 重新開始），
                而不是冷冰冰的「套用調整 · DEMOTE PLAN」— 使用者不需要看到系統的內部術語。 */}
            <span>{saving ? '儲存中…' : (primaryLabel || `套用調整 · ${String(verdict).toUpperCase()} PLAN`)}</span>
        </motion.button>

        {/* 次要：不調整，維持原本的下週計劃 —— 使用者永遠有「我可以」這個選項
            （加量被會員擋下時，主按鈕本身就是「照原本的量」，不再重複一顆同義按鈕） */}
        {!hideSecondary && (
        <motion.button {...pressProps('row')}
 onClick={() => onCommit(false)}
 disabled={saving}
 className="w-full h-[46px] mt-2.5 rounded-full flex items-center justify-center disabled:opacity-40"
 style={{ background: 'transparent', color: 'rgba(22,20,21,0.55)', fontWeight: 700, fontSize: 12, letterSpacing: '0.06em' }}
 >
            {secondaryLabel || '維持原計劃，不調整'}
        </motion.button>
        )}
    </div>
);

const SectionDisplay = ({ kicker, heading, sub }) => (
    <div className="pt-2">
        <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.coral, boxShadow: '0 0 0 3px rgba(249,92,75,0.16)' }} />
            <span className="text-[9px] font-extrabold tracking-[0.28em] uppercase" style={{ color: 'rgba(22,20,21,0.50)' }}>
                {kicker}
            </span>
        </div>
        <h1 style={{ ...TYPE.display, fontSize: 38, color: C.ink }}>
            {heading}
        </h1>
        {sub && (
            <p className="mt-2 text-[13px]" style={{ color: 'rgba(22,20,21,0.62)' }}>
                {sub}
            </p>
        )}
    </div>
);

const SectionLabel = ({ children, className = '' }) => (
    <div className={className}>
        <div className="flex items-center gap-3">
            <span className="text-[9px] font-extrabold tracking-[0.28em] uppercase" style={{ color: 'rgba(22,20,21,0.50)' }}>
                {children}
            </span>
            <div className="flex-1 h-px" style={{ background: C.sand, opacity: 0.7 }} />
        </div>
    </div>
);


const NextWeekPreview = ({ original, adjusted, multiplier }) => {
    const delta = Math.round((multiplier - 1) * 100);
    const sign = delta >= 0 ? '+' : '';
    return (
        <div
            className="mt-3 rounded-[28px] p-6"
            style={{
                background: 'rgba(255,255,255,0.45)',
                backdropFilter: 'blur(30px) saturate(2)',
                WebkitBackdropFilter: 'blur(30px) saturate(2)',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 8px 24px rgba(22,20,21,0.06), inset 0 1px 2px rgba(255,255,255,1)',
            }}
        >
            <div className="flex items-end justify-between mb-4">
                <div>
                    <div className="text-[12px] font-extrabold tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        WK {String((original?.week_index || 0)).padStart(2, '0')} · {{ base: '基礎', build: '建立', peak: '巔峰', taper: '減量' }[original?.phase?.toLowerCase()] || original?.phase}
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="font-light" style={{ fontSize: 30, letterSpacing: '-0.02em', color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                            {adjusted?.target_mileage_km}
                        </span>
                        <span className="text-[9px] font-extrabold tracking-[0.18em] uppercase" style={{ color: 'rgba(22,20,21,0.45)' }}>
                            km
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[12px] font-extrabold tracking-[0.20em]" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        調整幅度
                    </div>
                    <div
                        className="text-[20px] font-light mt-1"
                        style={{
                            color: delta > 0 ? '#1F5E3F' : delta < 0 ? '#8A2A1F' : '#1F4FA0',
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {sign}{delta}%
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1.5">
                {(adjusted?.bricks || []).map((b) => (
                    <div
                        key={b.brick_id}
                        title={b.title}
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: b.rpe_band?.color || (b.type === 'speed' ? C.coral : '#7BD3A5') }}
                    />
                ))}
            </div>
        </div>
    );
};

const BrickRow = ({ brick }) => {
    const done = brick.status === 'completed';
    const skipped = brick.status === 'skipped';
    return (
        <div
            className="rounded-[24px] p-5 flex items-center gap-3"
            style={{
                background: done
                    ? 'rgba(255,255,255,0.6)'
                    : skipped
                        ? 'rgba(207,198,184,0.18)'
                        : 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(24px) saturate(1.8)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
                border: done ? '1px solid rgba(255,255,255,0.9)' : '1px solid rgba(255,255,255,0.3)',
                boxShadow: done ? '0 6px 16px rgba(22,20,21,0.04), inset 0 1px 1px rgba(255,255,255,1)' : 'none',
                opacity: skipped ? 0.6 : 1,
            }}
        >
            <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                    background: done ? '#7BD3A5' : skipped ? C.sand : brick.rpe_band?.color || C.sand,
                    boxShadow: done ? '0 0 0 3px rgba(123,211,165,0.30)' : 'none',
                }}
            />
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: C.ink }}>
                    {brick.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-extrabold tracking-[0.18em] uppercase" style={{ color: brick.rpe_band?.color || 'rgba(22,20,21,0.42)' }}>
                        {brick.rpe_band?.label || brick.type}
                    </span>
                    {brick.distance_km && (
                        <span className="text-[11px] font-mono font-bold" style={{ color: 'rgba(22,20,21,0.50)' }}>
                            {brick.actual_distance_km != null ? `實跑 ${brick.actual_distance_km}` : `計劃 ${brick.distance_km}`} km
                        </span>
                    )}
                </div>
            </div>
            {done && <CheckCircle2 size={16} color="#7BD3A5" />}
        </div>
    );
};

const SkeletonState = () => (
    <div className="fixed inset-0 z-[100100] flex items-center justify-center" style={{ background: C.paper }}>
        <div className="flex items-center gap-3">
            <Activity size={16} color={C.coral} />
            <span className="text-[9px] font-extrabold tracking-[0.22em] uppercase" style={{ color: C.ink }}>
                Settling the week…
            </span>
        </div>
    </div>
);

const EmptyState = ({ onClose }) => (
    <div className="fixed inset-0 z-[100100] flex items-center justify-center px-6" style={{ background: C.paper }}>
        <div className="text-center">
            <div className="text-[9px] font-extrabold tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(22,20,21,0.45)' }}>
                NOTHING TO SETTLE
            </div>
            <div className="text-[18px] font-light leading-snug" style={{ color: C.ink }}>
                Finish at least one brick<br />before locking in a week.
            </div>
            <motion.button {...pressProps('icon')}
 onClick={onClose}
 className="mt-6 px-5 py-2 rounded-full text-[9px] font-extrabold tracking-[0.18em] uppercase"
 style={{
 background: 'linear-gradient(135deg, #2A2724 0%, #161415 100%)',
 color: C.paper,
 }}
 >
                Got it
            </motion.button>
        </div>
    </div>
);

// ════════════════════════════════════════════════════════════════════
// SystemHeardYouCard — RPE 因果連結
//   一句話讓使用者懂：「你回報的 RPE → 系統做了 X 動作」
//   - 紅色 stack: RPE 超標 → 系統 -20% mileage 保護
//   - 綠色 stack: RPE 在 band 內 → 維持 / 升級
//   - 藍色 stack: RPE 低於 band → 系統會試探升級
// ════════════════════════════════════════════════════════════════════

const SystemHeardYouCard = ({ avgRpe, targetRpe, mileageMultiplier, verdict }) => {
    const rpe = Number(avgRpe || 0);
    const tMin = targetRpe?.min ?? 5;
    const tMax = targetRpe?.max ?? 6;
    const m = mileageMultiplier ?? 1;

    // 如果沒有 RPE 數據 (一週尚未結束/結算)，顯示收折狀態 (Collapsed)
    if (rpe === 0) {
        return (
            <div
                className="mt-5 rounded-[18px] overflow-hidden relative px-5 py-3 flex items-center justify-between"
                style={{
                    background: 'rgba(255,255,255,0.45)',
                    backdropFilter: 'blur(32px) saturate(1.8)',
                    WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                    border: '1px solid rgba(255,255,255,0.85)',
                    boxShadow: '0 4px 12px rgba(22,20,21,0.04)',
                }}
            >
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.sand }} />
                    <span className="text-[9px] font-black tracking-[0.24em] uppercase" style={{ color: C.sand }}>
                        SYSTEM HEARD YOU
                    </span>
                </div>
                <span className="text-[9px] font-black tracking-[0.22em] uppercase px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(207,198,184,0.15)', color: C.sand }}>
                    WAITING DATA
                </span>
            </div>
        );
    }

    let state;
    if (rpe > tMax + 1) {
        const cut = Math.round((1 - m) * 100);
        state = {
            tone: 'PROTECTING',
            color: C.coral,
            inputLabel: '本週 AVG RPE',
            inputVal: rpe.toFixed(1),
            arrow: `超出目標 ${tMin}-${tMax}`,
            outputLabel: '下週',
            outputVal: cut > 0 ? `-${cut}% 距離` : '維持里程',
            line: '本週已記錄的主觀感受偏高；下週建議會一併考量完成度與近期跑量。',
        };
    } else if (rpe < tMin - 1) {
        state = {
            tone: 'READY TO PUSH',
            color: '#A5C4FF',
            inputLabel: '本週 AVG RPE',
            inputVal: rpe.toFixed(1),
            arrow: `低於目標 ${tMin}-${tMax}`,
            outputLabel: '下週',
            outputVal: m > 1 ? `+${Math.round((m - 1) * 100)}% 距離` : m < 1 ? `${Math.round((m - 1) * 100)}% 距離` : '維持里程',
            line: '本週體感較輕鬆；是否加量仍需合併完成度與近期跑量判斷。',
        };
    } else {
        state = {
            tone: 'ON TARGET',
            color: '#7BD3A5',
            inputLabel: '本週 AVG RPE',
            inputVal: rpe.toFixed(1),
            arrow: `正中目標 ${tMin}-${tMax}`,
            outputLabel: '下週',
            outputVal: m === 1 ? '維持里程' : `${Math.round((m - 1) * 100)}% 距離`,
            line: '本週體感符合目標；下週里程建議仍會考量實際完成度。',
        };
    }

    return (
        <div
            className="mt-5 rounded-[24px] overflow-hidden relative"
            style={{
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(32px) saturate(1.8)',
                WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 8px 28px rgba(22,20,21,0.08), inset 0 1px 1px rgba(255,255,255,1)',
            }}
        >
            {/* 左側強調色條 */}
            <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r"
                  style={{ background: state.color, boxShadow: `0 0 16px ${state.color}88` }} />

            <div className="px-5 py-4">
                {/* 標題 */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black tracking-[0.24em] uppercase"
                          style={{ color: state.color }}>
                        SYSTEM HEARD YOU
                    </span>
                    <span className="text-[9px] font-black tracking-[0.22em] uppercase ml-auto px-2 py-0.5 rounded-full"
                          style={{ background: `${state.color}22`, color: state.color }}>
                        {state.tone}
                    </span>
                </div>

                {/* 因果連結：你的 RPE → 系統行動 */}
                <div className="flex items-stretch gap-3">
                    {/* 你 */}
                    <div className="flex-1 rounded-[18px] p-3" style={{ background: 'rgba(22,20,21,0.04)' }}>
                        <div className="text-[9px] font-black tracking-[0.22em] uppercase mb-1"
                             style={{ color: 'rgba(22,20,21,0.45)' }}>
                            {state.inputLabel}
                        </div>
                        <div className="font-light leading-none" style={{
                            fontSize: 28, color: C.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em'
                        }}>
                            {state.inputVal}
                        </div>
                        <div className="text-[11px] mt-1.5" style={{ color: 'rgba(22,20,21,0.55)' }}>
                            {state.arrow}
                        </div>
                    </div>

                    {/* 箭頭 */}
                    <div className="flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center"
                             style={{ background: state.color, color: C.white }}>
                            <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>→</span>
                        </div>
                    </div>

                    {/* 系統 */}
                    <div className="flex-1 rounded-[18px] p-3"
                         style={{ background: `${state.color}1A`, border: `1px solid ${state.color}33` }}>
                        <div className="text-[9px] font-black tracking-[0.22em] uppercase mb-1"
                             style={{ color: state.color }}>
                            {state.outputLabel}
                        </div>
                        <div className="font-light leading-none truncate" style={{
                            fontSize: 18, color: C.ink, letterSpacing: '-0.01em'
                        }}>
                            {state.outputVal}
                        </div>
                        <div className="text-[12px] mt-1.5 font-black tracking-[0.18em]"
                             style={{ color: state.color }}>
                            建議
                        </div>
                    </div>
                </div>

                {/* 一句話翻譯 */}
                <p className="text-[12px] leading-relaxed mt-3"
                   style={{ color: 'rgba(22,20,21,0.70)' }}>
                    {state.line}
                </p>
            </div>
        </div>
    );
};
