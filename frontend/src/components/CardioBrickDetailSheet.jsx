import React, { useMemo, useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { formatPace as fmtPace } from '../utils/format';
import { useNavigate, useLocation } from 'react-router-dom';
import { brandColors as C } from '../utils/colors';
import { getTrackingTarget } from '../utils/brickTrackingTargets';
import { runTypeGains } from '../utils/runBrickGuide';
import { ArrowLeft, Play, Activity, Wind, Mountain, Zap, RefreshCcw, Info, Sparkles, SkipForward, Edit3, Check, ChevronRight, X, Target, Shield, ArrowRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';
import { PACE_SHIFT_BY_SUBTYPE } from '../utils/cardioPrescription';   // DRVN 槓鈴，取代 lucide 的啞鈴

/* ════════════════════════════════════════════════════════════════════
   CardioBrickDetailSheet (v2 · 2026-05)
   ────────────────────────────────────────────────────────────────────
   Dual-mode component:
     1. Embedded mode (props.embedded=true) — rendered inside Inbox's
        bottom-sheet. No fullscreen wrapper, no own header — host controls.
     2. Route mode (default) — fullscreen page when navigated to
        `/cardio-brick-detail` (kept as fallback).

   New features:
     - Accepts `brick` prop directly (in addition to location.state.brick)
     - For STRENGTH bricks: shows recommended runner-strength routine,
       with "Apply & Start" / "Edit Plan" / "Start As-Is" options
     - Optional callbacks: onStartOverride, onSkipOverride
   ──────────────────────────────────────────────────────────────────── */

// ── Map subtype → step recipe ─────────────────────────────────────
const STEP_RECIPES = {
    tempo: (totalMin) => ([
        { label: '暖身',   duration: 10, intensity: 'easy',     description: '輕鬆慢跑，找到節奏。' },
        { label: '節奏段', duration: Math.max(15, totalMin - 18), intensity: 'tempo', description: '稍微吃力但撐得住，沒辦法輕鬆聊天。' },
        { label: '收操',   duration: 8,  intensity: 'recovery', description: '放鬆慢跑回家。' },
    ]),
    interval: (totalMin) => {
        const reps = Math.max(4, Math.min(10, Math.floor(totalMin / 4)));
        return [
            { label: '暖身',  duration: 10, intensity: 'easy',     description: '5 分鐘慢跑 + 3 趟加速跑。' },
            ...Array.from({ length: reps }, (_, i) => ([
                { label: `第 ${i + 1} 趟`, duration: 1.5, intensity: 'mile',     description: '用接近全力的力度衝，但不是衝刺到力竭。' },
                { label: '恢復',          duration: 1,   intensity: 'recovery', description: '走路或慢跑喘口氣。' },
            ])).flat(),
            { label: '收操', duration: 8,  intensity: 'recovery', description: '放鬆慢跑回家。' },
        ];
    },
    long: (totalMin) => ([
        { label: '暖身',     duration: 8, intensity: 'easy',     description: '能邊跑邊聊天的配速。' },
        { label: '穩定段',   duration: Math.max(30, totalMin - 16), intensity: 'easy', description: '重點是腳在地上的時間，慢慢累積。' },
        { label: '強力收尾', duration: 8, intensity: 'tempo', description: '最後 8 分鐘：稍微加速。' },
    ]),
    easy: (totalMin) => ([
        { label: '輕鬆跑', duration: totalMin, intensity: 'easy', description: '用鼻子呼吸的配速。' },
    ]),
    recovery: (totalMin) => ([
        { label: '恢復慢跑', duration: totalMin, intensity: 'recovery', description: '比感覺有用的速度還慢。這就是重點。' },
    ]),
    strength: (totalMin) => ([
        { label: '活動度', duration: 8, intensity: 'recovery', description: '髖部開展 · 踝關節繞環 · 貓牛式。' },
        { label: '主訓練', duration: Math.max(20, totalMin - 16), intensity: 'tempo', description: '深蹲 · 髖鉸鍊 · 推 · 拉 · 攜重。' },
        { label: '收操', duration: 8, intensity: 'recovery', description: '箱式呼吸 · 輕度伸展。' },
    ]),
};

// ── Runner-strength recommended exercises ─────────────────────────
const RUNNER_STRENGTH_EXERCISES = [
    { name: 'Goblet Squat',           sets: 3, reps: '10',    focus: 'KNEE',   note: '股四 / 臀大肌 — 跑步推進力' },
    { name: 'Romanian Deadlift',      sets: 3, reps: '10',    focus: 'HIP',    note: '腿後 / 臀 — 著地穩定' },
    { name: 'Single-Leg Glute Bridge',sets: 3, reps: '12 ea', focus: 'GLUTE',  note: '單側臀 — 預防 IT band' },
    { name: 'Calf Raise (slow)',      sets: 3, reps: '15',    focus: 'CALF',   note: '阿基里斯腱 — 抗衝擊' },
    { name: 'Side Plank',             sets: 3, reps: '30s',   focus: 'CORE',   note: '側鏈 — 抗骨盆下沉' },
    { name: 'Dead Bug',               sets: 3, reps: '8 ea',  focus: 'CORE',   note: '深層核心 — 跑姿穩定' },
];

const INTENSITY_VISUAL = {
    recovery: { color: '#7BD3A5', label: '恢復跑' },
    easy:     { color: '#D8F382', label: '輕鬆跑' },
    tempo:    { color: '#FF99DC', label: '節奏跑' },
    // 2026-08 稽核：全站一律公里制（/km、分/公里），「英里配速」是唯一的英里制孤島，
    // 而且對使用者來說也不知道那是多快 —— 改成講強度。
    mile:     { color: C.coral, label: '衝刺' },
};

// 🪙 各強度相對「目標配速」的秒數偏移（秒/km，正值=較慢、負值=較快）
//   暖身/收操 +60s、恢復 +75s、輕鬆 +20s、節奏 −35s、英里配速 −60s
const PACE_OFFSET_BY_INTENSITY = {
    recovery: 75,
    easy:     20,
    tempo:    -35,
    mile:     -60,
};

// 配速秒數 → "M'SS"" 格式
// 🩹 J: 格式走單一真相源；null 語義保留（無值 → 不渲染該欄）
const formatPaceSec = (sec) => ((!sec || sec <= 0) ? null : fmtPace(sec));

// 🎯 panelMode → 中文標籤（讓使用者知道跑步中介面會用什麼來輔助追蹤）
const PANEL_MODE_LABEL = {
    zone:     '盯心率 Zone',
    pace:     '盯配速',
    distance: '盯里程',
    reps:     '盯趟數',
    duration: '盯時長',
};

const SUBTYPE_ICON = {
    tempo:    Zap,
    interval: Zap,
    long:     Mountain,
    easy:     Wind,
    recovery: RefreshCcw,
    strength: Dumbbell,
};

const CardioBrickDetailSheet = ({
    brick: brickProp,
    embedded = false,
    onClose,
    onStartOverride,
    onSkipOverride,
    onStartSuccess,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const brick = brickProp || location.state?.brick;
    const [strengthMode, setStrengthMode] = useState('preview'); // 'preview' | 'editing'

    // 進入 brick 詳情頁時隱藏底部導航膠囊，離開時還原（embedded 內嵌時不處理）
    useEffect(() => {
        if (embedded) return;
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: true } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, [embedded]);

    const isStrength = brick && (brick.type === 'strength' || brick.subtype === 'strength');

    // A brick can arrive without its plan envelope (for example from the home
    // dashboard). Recover the matching plan baseline before deriving a pace;
    // never treat an arbitrary duration as a physiological prescription.
    const planBaselineSec = useMemo(() => {
        if (!brick || typeof window === 'undefined') return null;
        const candidates = [];
        try {
            const uid = localStorage.getItem('userId') || localStorage.getItem('currentUserId');
            if (uid) candidates.push(localStorage.getItem(`u_${uid}_onboarding_cardio_plan`));
            candidates.push(localStorage.getItem('currentCardioPlan'), localStorage.getItem('cardioPlan'));
            for (const raw of candidates) {
                if (!raw) continue;
                const plan = JSON.parse(raw);
                const found = (plan?.weeks || []).flatMap(w => w?.bricks || []).find(b => b?.brick_id === brick.brick_id);
                if (found && Number(plan?.meta?.baseline_pace_5k_sec) > 0) return Number(plan.meta.baseline_pace_5k_sec);
                if (Number(plan?.meta?.baseline_pace_5k_sec) > 0 && plan?.program_id === brick.program_id) return Number(plan.meta.baseline_pace_5k_sec);
            }
        } catch { /* local plan is optional */ }
        return Number(brick.baseline_pace_5k_sec) > 0 ? Number(brick.baseline_pace_5k_sec) : null;
    }, [brick]);

    // 🔁 Plan Echo：同款跑步計劃（同類型、距離 ±1km）→ 開課前顯示「上次表現」列點
    const [runEcho, setRunEcho] = useState(null);
    useEffect(() => {
        if (!brick || isStrength) return;
        let alive = true;
        (async () => {
            try {
                const { getRunEcho, echoOpener, runEchoHasNumbers } = await import('../utils/planEcho');
                const { getUserId } = await import('../utils/auth');
                const echo = getRunEcho(getUserId(), brick.subtype || brick.type || 'easy', brick.distance_km || 0);
                /* ⚠️ 只認有數字的新格式。舊格式存的是結算當下凍結的句子，
                   裡面可能還帶著已經修掉的錯誤比較（「比先前最佳快了 4 分 48 秒」）——
                   寧可這一區不出現，也不要把舊的錯數字端出來。 */
                if (alive && runEchoHasNumbers(echo)) {
                    setRunEcho({ opener: echoOpener('run'), echo });
                    // 📊 市場觀察：回聲提示曝光
                    import('../utils/telemetry').then(({ track }) => track('plan_echo_shown', { type: 'run' })).catch(() => {});
                }
            } catch { /* 回聲屬 nice-to-have */ }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brick?.brick_id, isStrength]);

    // 🎯 目標配速（秒/km）— 與下方 canonicalPaceLabel 同一來源，供每段建議配速推算
    const targetPaceSec = useMemo(() => {
        if (!brick) return 0;
        let sec = (brick.target_pace_sec != null && brick.target_pace_sec > 0) ? brick.target_pace_sec : null;
        if (sec == null && planBaselineSec) sec = planBaselineSec + (PACE_SHIFT_BY_SUBTYPE[brick.subtype || brick.type] ?? 60);
        return sec || 0;
    }, [brick, planBaselineSec]);

    const steps = useMemo(() => {
        if (!brick) return [];
        const subtype = brick.subtype || brick.type || 'easy';
        const recipe = STEP_RECIPES[subtype] || STEP_RECIPES.easy;
        const raw = recipe(brick.duration_min || 30);

        // ★ v2.3 修正：偏移量被重複套用了。
        //
        //   引擎給的 target_pace_sec 已經是「這一趟該用的配速」— 恢復跑的
        //   target 已經含了 +90s。這裡再加一次 PACE_OFFSET.recovery(+75)，
        //   就變成標頭寫「目標配速 7'30"」、下面卻寫「建議配速 8'45"」。
        //
        //   正確做法：偏移量以「這趟自己的強度」為零點做相對化 —
        //   主段落 = 目標配速本身，暖身/收操才比它慢，節奏段才比它快。
        const SELF_INTENSITY = {
            recovery: 'recovery', easy: 'easy', long: 'easy', medium: 'easy',
            tempo: 'tempo', interval: 'mile',
        };
        const selfOffset = PACE_OFFSET_BY_INTENSITY[SELF_INTENSITY[subtype] ?? 'easy'] ?? 0;

        return raw.map((s) => {
            if (!targetPaceSec || targetPaceSec <= 0) return { ...s, paceSec: 0 };
            const offset = (PACE_OFFSET_BY_INTENSITY[s.intensity] ?? 0) - selfOffset;
            const paceSec = Math.max(120, targetPaceSec + offset); // 下限 2'00"/km 避免不合理值
            return { ...s, paceSec };
        });
    }, [brick, targetPaceSec]);

    const totalStepMin = steps.reduce((s, x) => s + x.duration, 0);

    // 🎯 本次追蹤目標 — 讓使用者開跑前就清楚「這趟該盯什麼數據」
    const trackingTarget = useMemo(() => getTrackingTarget(brick), [brick]);
    // 這一趟的訓練效益（生理適應）；strength 等非跑步 block 回 null → 不顯示該區
    const gains = useMemo(() => runTypeGains(brick?.type, brick?.subtype), [brick]);

    // 🎯 統一目標配速（與 panel / dashboard 同一來源）：
    //   brick 有 target_pace_sec 就用它；否則用「目標時間 ÷ 目標距離」現算（秒/km）。
    const canonicalPaceLabel = useMemo(() => {
        if (!brick) return null;
        let sec = (brick.target_pace_sec != null && brick.target_pace_sec > 0) ? brick.target_pace_sec : null;
        if (sec == null && planBaselineSec) sec = planBaselineSec + (PACE_SHIFT_BY_SUBTYPE[brick.subtype || brick.type] ?? 60);
        if (!sec || sec <= 0) return brick.target_pace_label || null;
        return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
    }, [brick, planBaselineSec]);

    if (!brick) {
        const fallback = (
            <div className="text-center px-6 py-12">
                {/* 🩹 2026-08 稽核：「BRICK（磚）」是內部資料模型的工程隱喻，
                    不該出現在使用者面前；這幾行也是全中文 App 裡的純英文孤島。 */}
                <div className="text-[12px] font-extrabold tracking-[0.22em] mb-3" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    找不到這堂訓練
                </div>
                <motion.button {...pressProps('icon')}
 onClick={() => (onClose ? onClose() : navigate(-1))}
 className="px-5 py-2 rounded-full text-[12px] font-extrabold tracking-[0.18em]"
 style={{ background: 'linear-gradient(135deg, #2A2724 0%, #161415 100%)', color: C.paper }}
 >
                    返回
                </motion.button>
            </div>
        );
        if (embedded) return fallback;
        return (
            <div className="fixed inset-0 z-[100100] flex items-center justify-center" style={{ background: C.paper }}>
                {fallback}
            </div>
        );
    }

    const SubtypeIcon = SUBTYPE_ICON[brick.subtype || brick.type] || Activity;
    // 🎨 卡片 accent 改用「類型色」，與週清單（CardioMicrocycleInbox TYPE_VISUAL）一致：
    //    恢復/輕鬆=綠、長距離=藍、速度/節奏=珊瑚、重訓=黑。不再用 RPE band 的統一 lime。
    const TYPE_ACCENT = { speed: '#F95C4B', recovery: '#7BD3A5', long: '#A5C4FF', strength: '#161415' };
    const TYPE_KEY_MAP = { easy: 'recovery', recovery: 'recovery', long: 'long', tempo: 'speed', interval: 'speed', speed: 'speed', mile: 'speed', strength: 'strength' };
    const brickColor = TYPE_ACCENT[TYPE_KEY_MAP[brick.subtype || brick.type] || brick.type] || '#7BD3A5';

    // 開練 — Strength 用 mobile training session
    const handleStart = () => {
        if (onStartOverride) { onStartOverride(); return; }
        if (isStrength) {
            // 將推薦動作轉成 WorkoutSession 可吃的格式
            const exercises = RUNNER_STRENGTH_EXERCISES.map((ex, i) => ({
                id: `runner_strength_${i}`,
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: 60,
                muscle_group: ex.focus,
                notes: ex.note,
            }));
            navigate('/training-session-mobile', {
                state: {
                    day: {
                        day_name: '重訓交叉訓練',
                        day_number: 0,
                        exercises,
                        fromCardioBrick: brick.brick_id,
                    },
                    exercises,
                    dayNumber: 0,
                    dayName: '重訓交叉訓練',
                },
            });
            if (onStartSuccess) onStartSuccess();
            return;
        }

        // ✅ Embedded 模式（在 CardioTrackerMobile 內）：不 navigate，直接通知父元件處理倒數
        if (embedded && onStartSuccess) {
            onStartSuccess();
            return;
        }

        // Route 模式：帶著 autoStart 旗標跳轉，讓新掛載的頁面自動觸發倒數
        navigate('/cardio-tracker-mobile', {
            state: { brickId: brick.brick_id, themeId: brick.theme_id, brick, autoStart: true },
        });
    };

    const handleEditStrength = () => {
        // 跳到 plan-tracking 讓使用者調整動作
        navigate('/plan-tracking', { state: { fromCardioBrick: brick.brick_id, mode: 'cardio_strength' } });
    };

    // ── 內容主體（兩種模式共用） ──────────────────
    const content = (
        <>
            {/* Route-mode header */}
            {!embedded && (
                <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between">
                    <motion.button {...pressProps('pill')}
 onClick={() => (onClose ? onClose() : navigate(-1))}
 className="w-10 h-10 rounded-full flex items-center justify-center "
 style={{
 background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)',
 border: '1px solid rgba(255,255,255,0.85)',
 boxShadow: '0 4px 10px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 >
                        <ArrowLeft size={18} strokeWidth={2.4} color={C.ink} />
                    </motion.button>
                    <span className="text-[12px] font-extrabold tracking-[0.28em]" style={{ color: 'rgba(22,20,21,0.40)' }}>
                        訓練詳情
                    </span>
                    <div style={{ width: 40 }} />
                </div>
            )}

            {/* Body */}
            <div className={`relative ${embedded ? 'px-5 pt-1 pb-2' : 'flex-1 overflow-y-auto px-6 pb-6'}`}>
                {/* Hero */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-1"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: brickColor, boxShadow: `0 0 0 3px ${brickColor}28` }} />
                        <span className="text-[9px] font-extrabold tracking-[0.28em] uppercase" style={{ color: 'rgba(22,20,21,0.50)' }}>
                            {brick.rpe_band?.label || brick.type}
                        </span>
                        {isStrength && (
                            <span className="ml-auto text-[9px] font-black tracking-[0.22em] uppercase px-2 py-0.5 rounded-full"
                                  style={{ background: 'rgba(22,20,21,0.06)', color: C.ink }}>
                                CROSS-TRAIN
                            </span>
                        )}
                    </div>
                    <h1 className="font-light" style={{ fontSize: embedded ? 30 : 36, lineHeight: 1.02, letterSpacing: '-0.03em', color: C.ink }}>
                        {brick.title}
                    </h1>
                    {/* 🚶 新手前幾週的走跑交替（cardioPlanFusionEngine.applyRunWalk）——
                        沒寫出來的話，跑不到 5K 的人會以為要連續跑完這段距離 */}
                    {/* 🏁 賽前減量週的加速跑（cardioPlanFusionEngine.applyTaperStrides） */}
                    {brick.strides?.label && (
                        <div className="mt-2 text-[13px] font-semibold" style={{ color: 'rgba(22,20,21,0.62)' }}>
                            {brick.strides.label}
                        </div>
                    )}
                    {brick.run_walk?.label && (
                        <div className="mt-2 text-[13px] font-semibold" style={{ color: 'rgba(22,20,21,0.62)' }}>
                            走跑交替：{brick.run_walk.label}
                        </div>
                    )}
                </motion.div>

                {/* Stat row */}
                <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <StatBlock label="時長" value={`${brick.duration_min || '—'}`} sub="分鐘" />
                    <StatBlock
                        label={isStrength ? "動作數" : "距離"}
                        value={isStrength ? `${RUNNER_STRENGTH_EXERCISES.length}` : (brick.distance_km != null ? `${brick.distance_km}` : '—')}
                        sub={isStrength ? "項" : "公里"}
                    />
                    <StatBlock
                        label={isStrength ? "重點" : "目標配速"}
                        value={isStrength ? "跑者" : (canonicalPaceLabel || '—')}
                        sub={isStrength ? "肌力" : (canonicalPaceLabel ? '/ 公里' : '')}
                    />
                </div>

                {/* 🧬 這趟練完會增加什麼 —— 每種課的生理適應都不一樣。
                    課表只寫「5.5 公里 輕鬆跑」，使用者不知道自己在換什麼；
                    這一區把訓練效益講明白，並附上一句誠實的反面提醒
                    （做錯了會失去什麼），避免變成只會喊口號的行銷文案。 */}
                {gains && (
                    <>
                        <SectionLabel className="mt-7">這趟練完會增加什麼</SectionLabel>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="mt-3 rounded-[18px] p-4"
                            style={{
                                background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 100%)',
                                border: `1px solid ${brickColor}55`,
                                boxShadow: '0 6px 14px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                            }}
                        >
                            <div className="text-[13px] font-bold mb-2.5" style={{ color: C.ink, lineHeight: 1.45 }}>
                                {gains.headline}
                            </div>
                            {gains.items.map((it, i) => (
                                <div key={i} className="flex items-start gap-2 mb-1.5">
                                    <span className="shrink-0 rounded-full"
                                          style={{ width: 4, height: 4, background: brickColor, marginTop: 7 }} />
                                    <span className="text-[11.5px] leading-relaxed flex-1"
                                          style={{ color: 'rgba(22,20,21,0.72)', fontWeight: 600 }}>{it}</span>
                                </div>
                            ))}
                            {gains.honest && (
                                <div className="text-[11px] leading-relaxed mt-2.5 pt-2.5"
                                     style={{ color: 'rgba(22,20,21,0.52)', borderTop: '1px solid rgba(22,20,21,0.07)' }}>
                                    <b style={{ color: 'rgba(22,20,21,0.42)' }}>做錯會怎樣　</b>{gains.honest}
                                </div>
                            )}
                        </motion.div>
                    </>
                )}

                {/* === STRENGTH MODE === */}
                {isStrength ? (
                    <>
                        <SectionLabel className="mt-7">RECOMMENDED ROUTINE</SectionLabel>
                        <div className="mt-3 rounded-[18px] overflow-hidden"
                             style={{
                                 background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 100%)',
                                 border: '1px solid rgba(22,20,21,0.06)',
                                 boxShadow: '0 6px 14px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                             }}>
                            {RUNNER_STRENGTH_EXERCISES.map((ex, i) => (
                                <motion.div
                                    key={ex.name}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.04 * i, type: 'spring', stiffness: 280, damping: 26 }}
                                    className="flex items-center gap-3 px-4 py-3"
                                    style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(22,20,21,0.05)' }}
                                >
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                         style={{ background: C.ink, color: C.paper, fontSize: 11, fontWeight: 900 }}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold truncate" style={{ color: C.ink }}>
                                            {ex.name}
                                        </div>
                                        <div className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                            {ex.note}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[13px] font-light" style={{ color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                            {ex.sets}<span className="text-[11px] opacity-60 mx-0.5">×</span>{ex.reps}
                                        </div>
                                        <div className="text-[9px] font-extrabold tracking-[0.18em] uppercase mt-1" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                            {ex.focus}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Coach note for strength */}
                        <div
                            className="mt-5 rounded-[18px] p-4 relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #2A2724 0%, #161415 60%, #262523 100%)',
                                color: C.paper,
                                border: '1px solid rgba(255,255,255,0.10)',
                                boxShadow: '0 14px 30px rgba(0,0,0,0.28), inset 0 1px 1px rgba(255,255,255,0.12)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={12} color={C.coral} />
                                <span className="text-[9px] font-extrabold tracking-[0.24em] uppercase" style={{ color: 'rgba(246,244,241,0.55)' }}>
                                    Why this routine
                                </span>
                            </div>
                            <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(246,244,241,0.82)' }}>
                                跑者專屬：強化臀肌與單側穩定，預防 IT band 與膝痛。完整一輪約 45 分鐘。
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* === RUN MODE === */}
                        <SectionLabel className="mt-7">課程計劃</SectionLabel>
                        <div className="mt-3 flex flex-col gap-1.5">
                            {steps.map((s, idx) => (
                                <StepRow key={idx} step={s} index={idx + 1} />
                            ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between px-2">
                            <span className="text-[12px] font-extrabold tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.42)' }}>
                                總計
                            </span>
                            <span className="text-[12px] font-mono font-bold" style={{ color: 'rgba(22,20,21,0.62)' }}>
                                {Math.round(totalStepMin)} 分鐘
                            </span>
                        </div>

                        {/* 🔁 上次同款 —— 一眼看完的前後對比。
                            ⚠️ 這裡以前是 4 條結算當下凍結的句子（含已修掉的錯誤比較）。
                               要回答的其實只有一個問題：「上次跑多快、這次要跑多快」。
                               所以現況與目標放在同一列、同一個視覺物件上，差距用一顆
                               chip 講完（drvn-interface-standard §6）。 */}
                        {runEcho && (() => {
                            const last = runEcho.echo;
                            const lastPace = Number(last.avgPaceSec) > 0
                                ? Math.round(Number(last.avgPaceSec))
                                : (Number(last.durationSec) > 0 && Number(last.distanceKm) > 0
                                    ? Math.round(Number(last.durationSec) / Number(last.distanceKm)) : null);
                            if (!lastPace) return null;
                            const fmt = (sec) => `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
                            const tgt = Number(targetPaceSec) > 0 ? Math.round(Number(targetPaceSec)) : null;
                            // 正 = 這次目標比上次快
                            const delta = tgt ? lastPace - tgt : null;
                            const Dir = delta == null || Math.abs(delta) < 3 ? Minus : (delta > 0 ? TrendingUp : TrendingDown);
                            const deltaText = delta == null || Math.abs(delta) < 3
                                ? '跟上次差不多'
                                : `${delta > 0 ? '快' : '慢'} ${Math.abs(delta)} 秒／公里`;
                            return (
                                <>
                                    <SectionLabel className="mt-7">上次同款</SectionLabel>
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                        className="mt-3 rounded-[18px] p-4"
                                        style={{
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 100%)',
                                            border: `1px solid ${brickColor}55`,
                                            boxShadow: '0 6px 14px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* ⚠️ minWidth:0 —— 少了它長數字會把這一列撐出卡片 */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[10.5px] font-black tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.42)' }}>
                                                    上次 {Number(last.distanceKm).toFixed(1)} 公里
                                                </div>
                                                <div className="text-[22px] font-black tracking-tight tabular-nums" style={{ color: C.ink }}>
                                                    {fmt(lastPace)}<span className="text-[11px] font-bold ml-0.5" style={{ color: 'rgba(22,20,21,0.4)' }}>/km</span>
                                                </div>
                                            </div>
                                            <ArrowRight size={16} className="shrink-0" style={{ color: 'rgba(22,20,21,0.28)' }} />
                                            <div className="flex-1 min-w-0 text-right">
                                                <div className="text-[10.5px] font-black tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.42)' }}>這次目標</div>
                                                <div className="text-[22px] font-black tracking-tight tabular-nums" style={{ color: brickColor }}>
                                                    {tgt ? fmt(tgt) : '—'}<span className="text-[11px] font-bold ml-0.5" style={{ color: 'rgba(22,20,21,0.4)' }}>/km</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(22,20,21,0.07)' }}>
                                            <Dir size={13} className="shrink-0" style={{ color: brickColor }} />
                                            <span className="text-[11.5px] font-bold" style={{ color: 'rgba(22,20,21,0.62)' }}>{deltaText}</span>
                                            {last.date && (
                                                <span className="text-[11px] font-bold ml-auto shrink-0" style={{ color: 'rgba(22,20,21,0.34)' }}>
                                                    {new Date(last.date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                </>
                            );
                        })()}

                        {/* 🎯 本次追蹤目標 — 開跑前就講清楚「這趟該盯什麼 + 守門條件」 */}
                        {trackingTarget && (
                            <>
                                <SectionLabel className="mt-7">本次追蹤目標</SectionLabel>
                                <div
                                    className="mt-3 rounded-[18px] overflow-hidden"
                                    style={{
                                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 100%)',
                                        border: `1px solid ${trackingTarget.color}55`,
                                        boxShadow: '0 6px 14px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                                    }}
                                >
                                    {/* 主目標 */}
                                    <div className="flex items-start gap-3 p-4">
                                        <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                                             style={{ background: `${trackingTarget.color}22`, border: `1px solid ${trackingTarget.color}55` }}>
                                            <Target size={16} style={{ color: trackingTarget.color }} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: trackingTarget.color }}>主目標</span>
                                                <span className="text-[12px] font-black tracking-[0.15em] px-1.5 py-0.5 rounded-full"
                                                      style={{ background: 'rgba(22,20,21,0.06)', color: 'rgba(22,20,21,0.55)' }}>
                                                    {PANEL_MODE_LABEL[trackingTarget.panelMode] || '追蹤'}
                                                </span>
                                            </div>
                                            <div className="text-[14px] font-bold mt-1" style={{ color: C.ink }}>{trackingTarget.primary?.label}</div>
                                            {trackingTarget.primary?.hint && (
                                                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(22,20,21,0.5)' }}>{trackingTarget.primary.hint}</div>
                                            )}
                                        </div>
                                    </div>
                                    {/* 守門條件 */}
                                    {trackingTarget.guard?.label && (
                                        <div className="flex items-start gap-3 px-4 pb-4 pt-1 border-t" style={{ borderColor: 'rgba(22,20,21,0.06)' }}>
                                            <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                                                 style={{ background: 'rgba(22,20,21,0.05)', border: '1px solid rgba(22,20,21,0.08)' }}>
                                                <Shield size={15} style={{ color: 'rgba(22,20,21,0.45)' }} />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.4)' }}>守門條件</span>
                                                <div className="text-[13px] font-bold mt-1" style={{ color: 'rgba(22,20,21,0.78)' }}>{trackingTarget.guard.label}</div>
                                                {trackingTarget.guard.hint && (
                                                    <div className="text-[11px] mt-0.5" style={{ color: 'rgba(22,20,21,0.5)' }}>{trackingTarget.guard.hint}</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <SectionLabel className="mt-7">努力帶</SectionLabel>
                        <RPEBandCard band={brick.rpe_band} />

                        <div
                            className="mt-5 rounded-[18px] p-4 relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #2A2724 0%, #161415 60%, #262523 100%)',
                                color: C.paper,
                                border: '1px solid rgba(255,255,255,0.10)',
                                boxShadow: '0 14px 30px rgba(0,0,0,0.28), inset 0 1px 1px rgba(255,255,255,0.12)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Info size={12} color={C.coral} />
                                <span className="text-[12px] font-extrabold tracking-[0.24em]" style={{ color: 'rgba(246,244,241,0.55)' }}>
                                    教練提示
                                </span>
                            </div>
                            <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(246,244,241,0.82)' }}>
                                {coachNoteFor(brick.subtype || brick.type)}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── CTA ────────────────────────────────── */}
            <div className={`relative z-10 ${embedded ? 'px-5 pt-3 pb-2' : 'px-6 pb-10 pt-3'}`}>
                <div className="flex gap-[2px] mb-3 px-1">
                    {['#FDD835', '#8BC34A', '#FF9800', '#F06292', '#5C6BC0'].map((c, i) => (
                        <div key={i} className="flex-1 rounded-full" style={{ height: 3, background: c, opacity: 0.55 + i * 0.08 }} />
                    ))}
                </div>

                {isStrength ? (
                    // Strength: 三選一 - 直接開始 / 修改 / 跳過
                    <div className="flex flex-col gap-2">
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleStart}
                            className="w-full h-[56px] rounded-full flex items-center justify-center gap-3 relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.22)',
                                boxShadow: '0 12px 30px rgba(217,64,48,0.36), inset 0 1px 2px rgba(255,255,255,0.4)',
                                letterSpacing: '0.22em', fontWeight: 800, fontSize: 12,
                            }}
                        >
                            <Play size={14} strokeWidth={2.6} fill="#fff" />
                            <span>APPLY & START</span>
                        </motion.button>
                        <div className="grid grid-cols-2 gap-2">
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={handleEditStrength}
                                className="h-[44px] rounded-full flex items-center justify-center gap-2"
                                style={{
                                    background: 'linear-gradient(135deg, #FFFFFF 0%, #ECE5D6 100%)',
                                    color: C.ink,
                                    border: '1px solid rgba(22,20,21,0.10)',
                                    boxShadow: '0 4px 10px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                                    letterSpacing: '0.18em', fontWeight: 800, fontSize: 9,
                                }}
                            >
                                <Edit3 size={12} strokeWidth={2.4} />
                                <span>編輯計劃</span>
                            </motion.button>
                            {onSkipOverride && (
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={onSkipOverride}
                                    className="h-[44px] rounded-full flex items-center justify-center gap-2"
                                    style={{
                                        background: 'rgba(22,20,21,0.05)',
                                        color: 'rgba(22,20,21,0.55)',
                                        border: '1px solid rgba(22,20,21,0.08)',
                                        letterSpacing: '0.18em', fontWeight: 800, fontSize: 9,
                                    }}
                                >
                                    <SkipForward size={12} strokeWidth={2.4} />
                                    <span>跳過</span>
                                </motion.button>
                            )}
                            {!onSkipOverride && (
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => onClose ? onClose() : navigate(-1)}
                                    className="h-[44px] rounded-full flex items-center justify-center gap-2"
                                    style={{
                                        background: 'rgba(22,20,21,0.05)',
                                        color: 'rgba(22,20,21,0.55)',
                                        border: '1px solid rgba(22,20,21,0.08)',
                                        letterSpacing: '0.18em', fontWeight: 800, fontSize: 9,
                                    }}
                                >
                                    <X size={12} strokeWidth={2.4} />
                                    <span>稍後再說</span>
                                </motion.button>
                            )}
                        </div>
                    </div>
                ) : (
                    // Run: 主 CTA + 可選 skip
                    <div className="flex flex-col gap-2">
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleStart}
                            className="w-full h-[56px] rounded-full flex items-center justify-center gap-3 relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.22)',
                                boxShadow: '0 12px 30px rgba(217,64,48,0.36), inset 0 1px 2px rgba(255,255,255,0.4)',
                                letterSpacing: '0.22em', fontWeight: 800, fontSize: 12,
                            }}
                        >
                            <Play size={14} strokeWidth={2.6} fill="#fff" />
                            <span>開始訓練塊</span>
                        </motion.button>
                    </div>
                )}
            </div>
        </>
    );

    // Embedded — 直接吐 content（host 已提供外殼）
    if (embedded) return <div className="w-full">{content}</div>;

    // Route mode — 包外殼
    return (
        <div
            className="fixed inset-0 z-[100100] flex flex-col"
            style={{
                background: 'radial-gradient(120% 70% at 50% -10%, #FFFFFF 0%, #F6F4F1 38%, #E9E3D8 100%)',
                color: C.ink,
                fontFamily: 'var(--font-body)',
            }}
        >
            {content}
        </div>
    );
};

export default CardioBrickDetailSheet;

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════

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

const StatBlock = ({ label, value, sub }) => (
    <div
        className="rounded-[18px] p-3"
        style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 50%, #E9E3D8 100%)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 6px 14px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
        }}
    >
        <div className="text-[9px] font-extrabold tracking-[0.22em] uppercase mb-1.5" style={{ color: 'rgba(22,20,21,0.45)' }}>
            {label}
        </div>
        <div className="flex items-baseline gap-1.5">
            <span className="font-light" style={{ fontSize: 22, lineHeight: 1, letterSpacing: '-0.03em', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                {value}
            </span>
            {sub && (
                <span className="text-[9px] font-extrabold tracking-[0.18em] uppercase" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    {sub}
                </span>
            )}
        </div>
    </div>
);

const StepRow = ({ step, index }) => {
    const v = INTENSITY_VISUAL[step.intensity] || INTENSITY_VISUAL.easy;
    return (
        <div
            className="rounded-[18px] p-3 flex items-start gap-3"
            style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 100%)',
                border: '1px solid rgba(22,20,21,0.06)',
            }}
        >
            <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{
                    background: v.color,
                    color: C.ink,
                    fontSize: 11, fontWeight: 900,
                }}
            >
                {index}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
                        {step.label}
                    </span>
                    <span className="text-[9px] font-extrabold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full" style={{ background: `${v.color}55`, color: C.ink }}>
                        {v.label}
                    </span>
                </div>
                <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'rgba(22,20,21,0.62)' }}>
                    {step.description}
                </div>
                {/* 🪙 每段建議配速 */}
                {step.paceSec > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[12px] font-extrabold tracking-[0.16em] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(22,20,21,0.06)', color: 'rgba(22,20,21,0.5)' }}>
                            建議配速
                        </span>
                        <span className="text-[12px] font-bold" style={{ color: v.color === '#D8F382' ? '#6B7B1E' : C.ink, fontVariantNumeric: 'tabular-nums' }}>
                            {formatPaceSec(step.paceSec)}
                            <span className="text-[11px] font-semibold ml-0.5" style={{ color: 'rgba(22,20,21,0.4)' }}>/km</span>
                        </span>
                    </div>
                )}
            </div>
            <div className="text-right shrink-0">
                <div className="text-[16px] font-light" style={{ color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {step.duration < 1 ? Math.round(step.duration * 60) : Math.round(step.duration)}
                </div>
                <div className="text-[9px] font-extrabold tracking-[0.18em] uppercase mt-0.5" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    {step.duration < 1 ? 'SEC' : 'MIN'}
                </div>
            </div>
        </div>
    );
};

const RPEBandCard = ({ band }) => {
    if (!band) return null;
    return (
        <div
            className="mt-3 rounded-[18px] p-4 relative overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F1EB 100%)',
                border: '1px solid rgba(22,20,21,0.06)',
                boxShadow: '0 6px 14px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
            }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ background: band.color, boxShadow: `0 0 0 4px ${band.color}28` }} />
                <span className="text-[9px] font-extrabold tracking-[0.22em] uppercase" style={{ color: C.ink }}>
                    {band.label}
                </span>
                <span className="text-[11px] font-mono font-bold ml-auto" style={{ color: 'rgba(22,20,21,0.50)' }}>
                    RPE {band.min}-{band.max}
                </span>
            </div>
            <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                    const inBand = n >= band.min && n <= band.max;
                    return (
                        <div
                            key={n}
                            className="flex-1 rounded-sm"
                            style={{
                                height: 8,
                                background: inBand ? band.color : C.sand,
                                opacity: inBand ? 1 : 0.4,
                            }}
                        />
                    );
                })}
            </div>
            <div className="text-[11px] leading-snug" style={{ color: 'rgba(22,20,21,0.62)' }}>
                {rpeBandDescription(band.label)}
            </div>
        </div>
    );
};

function rpeBandDescription(label) {
    switch ((label || '').toUpperCase()) {
        case 'RECOVERY': return '輕鬆對話的配速，全程用鼻子呼吸。';
        case 'EASY':     return '只能說短句，呼吸略有感。';
        case 'TEMPO':    return '只能說單字，「舒適的艱難」地帶。';
        case 'MILE':     return '無法說話，接近最大可持續強度。';
        case 'ALL-OUT':  return '只能撐 30 秒的全力衝刺。';
        default:         return '跟著努力帶走，偏高或偏低都是在浪費這次訓練。';
    }
}

function coachNoteFor(subtype) {
    return {
        tempo:    '節奏跑是讓身體學會在代謝壓力下維持配速的訓練劑量。不要把它跑成比賽。',
        interval: '間歇跑追求的是品質，不是生存。最後一趟跑不到配速，表示這次訓練太長了。',
        long:     '長跑是在建立粒線體。腳在地上的時間比秒錶重要——保持能對話的速度。',
        easy:     '這是讓另外 20% 高強度訓練得以發生的 80%。今天如果感覺很累，就再慢一點。',
        recovery: '比感覺有用的速度還慢。重點不是增加疲勞，而是代謝掉昨天的疲勞。',
        strength: '肌力訓練能預防受傷並提升跑步效率。複合動作優先於孤立動作。',
    }[subtype] || '出現。聆聽身體。計劃會適應你，而不是反過來。';
}
