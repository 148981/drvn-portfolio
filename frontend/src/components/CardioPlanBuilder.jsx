import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft, Check, ChevronRight, Activity, Flame, Mountain, Trophy, Award, Calendar, Layers, Sparkles, Battery, Shield, Minus, Plus, TrendingUp, Route, Wind, Gauge, HeartPulse
} from 'lucide-react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { brandColors as C } from '../utils/colors';
import { SWISS, TYPE } from '../utils/swissUI';
import {
    inspectPlan,
    summarizeWeek,
    auditWeeklyMileage,
    resolveRunnerLevel,
    planIntensityMix,
} from '../utils/cardioPlanFusionEngine';
import { recommendCycleWeeks, LEVEL_ZH } from '../utils/runnerLevel';
import { PACE_SHIFT_BY_SUBTYPE } from '../utils/cardioPrescription';
import { haptic } from '../utils/haptics';
import { projectPlanOutcome } from '../utils/cardioPlanOutcome';
import { previewWeek, previewBricks, runTypeZh } from '../utils/dailyAgenda';
import WeekScheduleStrip from './WeekScheduleStrip';
import { composeBrickTypes } from '../utils/cardioPlanFusionEngine';
// 換期帶來的設定（過渡週 transitionWeek、沿用的級別）只有這支會套上；沒有就等同 generateCardioPlan
import { generateNextCyclePlan } from '../utils/cardioPlanProgress';
import { WEEKDAY_LABEL } from '../utils/trainingFocus';
import { featureGate } from '../utils/biometrics';
import MissingDataRow from './ui/MissingDataRow';
import { planStagedPath } from '../utils/cardioPlanPath';
import { commitErrorMessage, planWeeks } from '../utils/cardioPlanCommit';
import FirstTimeHint from './FirstTimeHint';
import { recordFirst, recordPlanLive, afterMomentIdle } from '../utils/momentEngine';
import { toLocalDateKey } from '../utils/localDate';
import { toast } from '../utils/toast';
import { publishProgram } from '../utils/trainingProgram';
import { readWeeklyStrengthDays, loadTrainingFocus, checkWeeklyLoad, getFocusOption } from '../utils/trainingFocus';

/* ════════════════════════════════════════════════════════════════════
   CardioPlanBuilder
   ────────────────────────────────────────────────────────────────────
   Swiss editorial × brushed titanium × heart-rate zone stripe.
   A four-step builder that funnels the user into a fully periodized
   4–14 week cardio plan, then previews it before commit.

   Steps:
     1. GOAL          — Fat Loss / Aerobic Base / 5K-10K / Half / Full
     2. DURATION      — totalWeeks 4..14 (segmented control)
     3. CADENCE       — sessionsPerWeek 3..6 + currentLevel
     4. PREVIEW       — generated plan summary + mileage curve + commit
   ──────────────────────────────────────────────────────────────────── */

// ── Zone colour stripe (Z1 → Z5) ────────────────────────────────────
// 心率 Zone 正典配色（與 Effort Points 彈窗一致）：熱身→燃脂→有氧→無氧→極限
const ZONE_STRIPE = [
    { id: 'Z1', label: 'RECOVERY', color: '#FDD835' }, // 熱身 Warm Up
    { id: 'Z2', label: 'EASY',     color: '#8BC34A' }, // 燃脂 Fat Burn
    { id: 'Z3', label: 'AEROBIC',  color: '#FF9800' }, // 有氧 Aerobic
    { id: 'Z4', label: 'TEMPO',    color: '#F06292' }, // 無氧 Anaerobic
    { id: 'Z5', label: 'VO2MAX',   color: '#5C6BC0' }, // 極限 Extreme
];

/* ────────────────────────────────────────────────────────────────────
   訓練目標 —— 每一張卡都必須回答使用者三件事：
     1. 這個計劃「專門訓練」什麼能力？
     2. 它是給「哪一種跑者」的？
     3. 選了會付出什麼代價（時間 / 強度）？
   配色依訓練種類分流（沿用心率 Zone 正典色，語意一致）：
     燃脂=橘 · 有氧=綠 · 速度=粉 · 耐力=靛 · 極限=金
   ──────────────────────────────────────────────────────────────── */
const GOALS = [
    {
        id: 'fat_loss',
        title: '減脂燃燒',
        kicker: '代謝訓練',
        accent: '#FF9800',                       // Z3 有氧橘 — 燃脂／代謝
        accentSoft: 'rgba(255,152,0,0.14)',
        typeLabel: '燃脂型',
        trains: '脂肪代謝效率與熱量缺口',
        forWho: '想減重、體脂偏高，或久坐後重新開始動的人',
        desc: '高頻 Z2 慢跑累積燃脂時間，搭配短 HIIT。重點是跑得夠久，不是夠快。',
        Icon: Flame,
        intensity: 1,
        archetypePeak: '成熟跑者尖峰約 20–30 公里／週',
    },
    {
        id: 'aerobic_base',
        title: '有氧基礎',
        kicker: 'MAF 80/20',
        accent: '#8BC34A',                       // Z2 燃脂綠 — 輕鬆有氧
        accentSoft: 'rgba(139,195,74,0.16)',
        typeLabel: '打底型',
        trains: '心肺引擎、微血管密度與粒線體',
        forWho: '跑一下就喘、心率容易飆高，想先把底子打穩的人',
        desc: '八成以上是能邊跑邊講話的輕鬆跑。練的是同配速下心率更低。',
        Icon: Activity,
        intensity: 1,
        archetypePeak: '成熟跑者尖峰約 30–40 公里／週',
    },
    {
        id: 'race_5k_10k',
        title: '5K / 10K',
        kicker: '短距離備賽',
        accent: '#F06292',                       // Z4 無氧粉 — 速度／乳酸
        accentSoft: 'rgba(240,98,146,0.16)',
        typeLabel: '速度型',
        // 2026-08 稽核：這是計劃建立的第一畫面，術語密度過高。
        // 一律改成「這會讓我變成什麼樣」的白話，專有名詞留給說明頁。
        trains: '撐更久不掉速的臨界強度、跑起來更省力、心肺上限',
        forWho: '已能連續跑 30 分鐘，想把 5K／10K 成績往前推的人',
        desc: '節奏跑、間歇、長跑輪著來。強度最高，會累但進步最有感。',
        Icon: Mountain,
        intensity: 3,
        archetypePeak: '成熟跑者尖峰約 40–50 公里／週',
    },
    {
        id: 'race_half',
        title: '半程馬拉松',
        kicker: '21.1K 備賽',
        accent: '#5C6BC0',                       // Z5 極限靛 — 耐力
        accentSoft: 'rgba(92,107,192,0.16)',
        typeLabel: '耐力型',
        trains: '長時間不掉速的能力，以及把能量用得更省',
        forWho: '能穩定跑 10K，想挑戰人生第一場半馬或破 PB 的人',
        desc: '長跑逐週加量，加入半馬配速段落。練兩小時不掉速，週末要留時間。',
        Icon: Trophy,
        intensity: 3,
        archetypePeak: '成熟跑者尖峰約 50–65 公里／週',
    },
    {
        id: 'race_full',
        title: '全程馬拉松',
        kicker: '42.2K 備賽',
        accent: '#C9A227',                       // 成就金 — 最高難度
        accentSoft: 'rgba(201,162,39,0.16)',
        typeLabel: '極限型',
        trains: '極長時間的耐力，以及把「撞牆」那一刻往後推',
        forWho: '已完賽過半馬、每週跑得出 4 次以上的資深跑者',
        desc: '長跑逐週加量，賽前兩週減量。投入最大，沒半馬經驗請先從半馬開始。',
        Icon: Award,
        intensity: 4,
        archetypePeak: '成熟跑者尖峰約 70–90 公里／週',
    },
];

const LEVELS = [
    /* ⚠️ 名稱一律取自 runnerLevel 的 LEVEL_ZH。
       以前這裡自己寫「初學者／進階者／資深跑者」，引擎那邊卻是
       「初學者／中階／進階」—— 使用者點了「進階者」，計劃卻說
       「判定為中階」；而且「進階」在兩邊是不同的級別。同一件事只能有一個名字。
       倍率（×0.55 這種）是寫給自己看的參數，已經拿掉。 */
    { id: 'beginner',     label: LEVEL_ZH.beginner,     desc: '跑步不足 3 個月' },
    { id: 'intermediate', label: LEVEL_ZH.intermediate, desc: '3 個月 – 2 年' },
    { id: 'advanced',     label: LEVEL_ZH.advanced,     desc: '2 年以上，有參賽' },
];

/* ════════════════════════════════════════════════════════════════════
   流程動畫語彙（★ v2.3）
   五個步驟共用一組轉場：前進時新頁由右下浮入、退回時由左下浮入，
   帶一點 blur 收束，讓「走進下一步」有方向感而不只是淡入淡出。
   ════════════════════════════════════════════════════════════════════ */
const EASE = [0.16, 1, 0.3, 1];
const stepVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 34 : -34, y: 10, filter: 'blur(6px)' }),
    center: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)', transition: { duration: 0.42, ease: EASE } },
    exit: (dir) => ({ opacity: 0, x: dir > 0 ? -28 : 28, y: -8, filter: 'blur(6px)', transition: { duration: 0.26, ease: EASE } }),
};
/** 頁內元素的接力進場 */
const listStagger = {
    hidden: {},
    visible: { transition: { delayChildren: 0.12, staggerChildren: 0.06 } },
};
const listItem = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } },
};

const WEEK_OPTIONS = [4, 6, 8, 10, 12, 14];

/* ────────────────────────────────────────────────────────────────────
   每週跑步次數 1–7 —— 每一格都要能回答「選這個我會過怎樣的一週」。
   1–2 次是合法選擇（重新開始 / 維持），不該被擋在門外。
   ──────────────────────────────────────────────────────────────── */
const SESSION_MIN = 1;
const SESSION_MAX = 7;
const SESSION_PROFILE = {
    1: { tag: '維持',   line: '一週一次只夠維持現狀，很難進步 — 適合超忙的一週或傷後回歸。', tone: 'warn' },
    2: { tag: '重啟',   line: '重新養成習慣的最小劑量。先把「出得了門」練回來。',            tone: 'ok'   },
    3: { tag: '入門',   line: '進步的最低門檻。輕鬆跑為主，能穩定累積有氧底。',              tone: 'good' },
    4: { tag: '標準',   line: '大多數跑者的甜蜜點 — 量夠、恢復也夠，80/20 排得開。',        tone: 'good' },
    5: { tag: '積極',   line: '開始能安排完整的節奏跑與長跑，進步明顯加速。',                tone: 'good' },
    6: { tag: '進階',   line: '接近認真備賽的節奏。需要睡眠與飲食跟上，否則容易累積疲勞。',  tone: 'ok'   },
    7: { tag: '每天跑', line: '每天都跑，恢復日只能靠「跑很慢」換來。受傷風險明顯上升。',    tone: 'warn' },
};
/** 各等級的建議上限 — 超過會給提醒，但不禁止 */
const SESSION_SAFE_MAX = { beginner: 4, intermediate: 6, advanced: 7 };

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════

const CardioPlanBuilder = ({ onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const userId = getUserId();
    // 從結業畫面按「我想自己調整」進來 → 帶著推薦的設定當起點
    const seedConfig = location.state?.seedConfig || null;

    // 若註冊精靈已收集過跑步基準線，沿用為預設值（免重填）
    const baseline = (() => {
        try { return JSON.parse(localStorage.getItem('drvn_cardio_baseline') || 'null'); }
        catch { return null; }
    })();

    /* 統一週期：從「完整計劃」帶進來的共同起點優先，
       三個系統同一天開始，結算才做得成一次。沒帶就用今天。 */
    const cycleStart = seedConfig?.startDate || toLocalDateKey(new Date());

    const [step, setStep] = useState(0); // ★ v2.0：0 goal → 1 cadence → 2 baseline → 3 duration → 4 preview
    const [dir, setDir] = useState(1);   // ★ v2.3 轉場方向：1 前進 / -1 退回
    const [config, setConfig] = useState({
        goal: 'aerobic_base',
        totalWeeks: 8,
        sessionsPerWeek: 4,
        currentLevel: 'intermediate',
        includeStrength: true,
        // ★ 預設 10km/週（中性保守值）；註冊精靈填過就直接沿用
        currentWeeklyKm: baseline?.currentWeeklyKm ?? 10,
        baselinePace5K: baseline?.baselinePace5K ?? null,    // ★ 5K 配速（秒/km），null = 由等級自動推算
        pace5kId: baseline?.pace5kId ?? null,               // ★ 亮哪一顆（兩個選項的配速都是 null，不能用配速當鍵）
        canRun5k: baseline?.canRun5k ?? null,               // ★ false = 「我還跑不到 5K」，鎖初學者
        // 從結業畫面帶進來的推薦設定優先（使用者選了「我想自己調整」）
        ...(seedConfig || {}),
    });
    const [generatedPlan, setGeneratedPlan] = useState(null);
    const [saving, setSaving] = useState(false);
    // 「?」說明面板：所有機制細節收在這裡，主流程保持乾淨
    const [explainPlan, setExplainPlan] = useState(null);
    const openExplain = useCallback((p) => { haptic('light'); setExplainPlan(p); }, []);

    // ══════════════════════════════════════════════════════════════════
    // ★ v2.3 記住上一期 —— 跑完一份計劃的人，下一次進來不該面對一片空白。
    //   讀最近一份已結束的課表，依「實際跑出來的結果」推薦下一套。
    // ══════════════════════════════════════════════════════════════════
    const [recommendation, setRecommendation] = useState(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await apiClient.get(`/api/cardio-plan/${userId}/latest`);
                const prev = res?.data?.plan || res?.data;
                if (!alive || !prev?.weeks?.length) return;
                const { diagnosePlan, recommendNextPlan, isPlanFinished } = await import('../utils/cardioPlanProgress');
                // 還在進行中的計劃不推薦「下一期」—— 那是換期，不是重排
                if (!isPlanFinished(prev)) return;
                const d = diagnosePlan(prev);
                // 上一期至少要有動過才值得拿來推薦
                if (d.progress.overall.actualKm <= 0) return;
                if (alive) setRecommendation(recommendNextPlan(prev, d));
            } catch { /* 沒有歷史計劃 → 正常從頭選 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    const applyRecommendation = useCallback((cfg) => {
        setTouched({ goal: true, cadence: true, baselineKm: true, baselinePace: true, duration: true });
        setConfig((c) => ({ ...c, ...cfg }));
        setDir(1);
        setStep(4);
        try {
            setGeneratedPlan(generateNextCyclePlan({ ...cfg, startDate: cycleStart }));
        } catch (e) {
            console.warn('[CardioPlanBuilder] apply recommendation failed:', e?.message);
            setStep(0);
        }
    }, [cycleStart]);

    // ★ v2.3 —— 每一步都必須「主動選過」才能往下。
    //   欄位本身有預設值，但預設值不代表使用者的意思；
    //   讓人一路按「繼續」按到底，等於拿別人的課表當自己的。
    const [touched, setTouched] = useState({});
    const mark = useCallback((k) => setTouched((t) => (t[k] ? t : { ...t, [k]: true })), []);

    /* 📅 還沒自己選過週數 → 大數字直接停在「建議」那一格上。
       （仍然要主動點過才能繼續 —— 預設值不代表使用者的意思，
         但預設值至少該是對他最合適的那一個，而不是寫死的 8。） */
    useEffect(() => {
        if (touched.duration) return;
        const rec = recommendCycleWeeks({
            goal: config.goal,
            level: resolveRunnerLevel(config),
        });
        setConfig((c) => (c.totalWeeks === rec.weeks ? c : { ...c, totalWeeks: rec.weeks }));
    }, [touched.duration, config]);

    // ══════════════════════════════════════════════════════════════════
    // 🎯 從「完整計劃」引導頁進來（location.state.focusSeed）
    //    ── 訓練重點已經把目標／頻率／週期算好了，這裡直接跳到預覽讓使用者
    //       看結果再決定要不要套用；想改照樣可以退回任何一步。
    // ══════════════════════════════════════════════════════════════════
    // returnTo：從「完整計劃」引導頁進來 → 存好後回到那一頁繼續設定下一項。
    const returnTo = location.state?.returnTo || null;
    const fromFocus = !!location.state?.focusSeed;
    // React 嚴格模式會把 effect 跑兩次 → 提示會冒出兩張。用 ref 擋住第二次。
    const seededRef = useRef(false);
    useEffect(() => {
        // restart = 使用者按了「重新設計」→ 參數照樣預填，但停在第一步讓他自己走一遍
        if (!fromFocus || !seedConfig || location.state?.restart) return;
        if (seededRef.current) return;
        seededRef.current = true;
        setTouched({ goal: true, cadence: true, baselineKm: true, baselinePace: true, duration: true });
        try {
            setGeneratedPlan(generateNextCyclePlan({ ...config, startDate: cycleStart }));
            setDir(1);
            setStep(4);
            const f = getFocusOption(location.state?.focusId);
            toast.success(`已依「${f?.label || '你的訓練重點'}」排好：每週 ${config.sessionsPerWeek} 趟 · ${config.totalWeeks} 週`);
        } catch (e) {
            console.warn('[CardioPlanBuilder] focus seed failed:', e?.message);
            setStep(0);   // 生成失敗 → 誠實退回第一步，讓使用者自己選
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ══════════════════════════════════════════════════════════════════
    // 🚦 跨系統天數守門：跑步趟數 ＋ 已排定的重訓天數不得吃光整週。
    //    重訓天數讀真實存檔（currentPlan_<uid> 第 1 週），讀不到就當 0、不虛報。
    // ══════════════════════════════════════════════════════════════════
    const plannedStrengthDays = useMemo(() => {
        try { return readWeeklyStrengthDays(userId); } catch { return 0; }
    }, [userId]);
    const activeFocusId = useMemo(() => {
        try { return loadTrainingFocus(userId)?.focusId || null; } catch { return null; }
    }, [userId]);
    /* 健身排在星期幾不必在這裡另外讀 —— 下面的 previewWeek 走的是
       buildWeeklyAgenda，它自己就會去讀重訓課表並繞開。多讀一次等於
       多一個會跟中控台不同步的來源。 */
    /* 這一週實際會排成什麼樣 —— 用中控台與首頁同一支 buildWeeklyAgenda 算。
       ⚠️ 原本用 proposeComplementDays：它只收 { takenDays, need }，拿不到課種、
          也不知道哪天是腿日，所以下面那句「質量跑避開腿日隔天」它根本做不到，
          而且排出來的星期跟中控台不一樣。現在預告的就是實際會排的。 */
    const runDayPlan = useMemo(() => {
        const n = config.sessionsPerWeek;
        if (!(n > 0)) return null;
        // 第 1 週是基礎期；課種決定長跑與質量跑要避開哪些天
        let subtypes = [];
        try {
            subtypes = composeBrickTypes({
                phase: 'base', isDeload: false, sessionsPerWeek: n,
                goal: config.goal, includeStrength: false,
            }) || [];
        } catch { subtypes = Array.from({ length: n }, () => 'easy'); }

        const week = previewWeek(userId, { runBricks: previewBricks(subtypes) });
        const days = [];
        const warnings = [];
        week.forEach((d, i) => {
            if (d.run) days.push({ idx: i, label: WEEKDAY_LABEL[i], type: d.run.subtype || d.run.type });
            (d.warnings || []).forEach((w) => warnings.push(`週${WEEKDAY_LABEL[i]}：${String(w).replace(/^⚠️\s*/, '')}`));
        });
        return { week, days, warnings: [...new Set(warnings)] };
    }, [userId, config.sessionsPerWeek, config.goal]);

    const weeklyLoad = useMemo(() => checkWeeklyLoad({
        strengthDays: plannedStrengthDays,
        runSessions: config.sessionsPerWeek,
        level: config.currentLevel,
        focusId: activeFocusId,
    }), [plannedStrengthDays, config.sessionsPerWeek, config.currentLevel, activeFocusId]);

    const handleChangeSessions = useCallback((s) => {
        if (plannedStrengthDays > 0 && s + plannedStrengthDays >= 7) {
            toast.error(`你已排定每週 ${plannedStrengthDays} 天重訓，再加 ${s} 趟跑步就一天都不休息。至少要留 1 天完全休息。`);
            return;
        }
        mark('cadence');
        setConfig((c) => ({ ...c, sessionsPerWeek: s }));
    }, [plannedStrengthDays, mark]);

    const STEP_REQUIREMENTS = useMemo(() => ([
        { key: 'goal',     hint: '先選一個訓練目標' },
        { key: 'cadence',  hint: '設定每週跑幾次與你的程度' },
        { key: 'baseline', hint: '填目前的週跑量與 5K 成績（沒測過也要選）' },
        { key: 'duration', hint: '選一個週期長度' },
        { key: null,       hint: '' },
    ]), []);

    const stepReady = useMemo(() => {
        if (step === 2) return !!touched.baselineKm && !!touched.baselinePace;
        const req = STEP_REQUIREMENTS[step];
        return !req?.key || !!touched[req.key];
    }, [step, touched, STEP_REQUIREMENTS]);

    const stepHint = useMemo(() => {
        if (stepReady) return '';
        if (step === 2) {
            if (!touched.baselineKm) return '先確認你目前的週跑量';
            if (!touched.baselinePace) return '選一個 5K 成績區間（沒測過也請選「未測過」）';
        }
        return STEP_REQUIREMENTS[step]?.hint || '';
    }, [step, stepReady, touched, STEP_REQUIREMENTS]);

    const goNext = useCallback(() => {
        if (!stepReady) { haptic('warning'); return; }
        if (step === 3) {
            // generate the plan when leaving baseline step
            // 生成器丟例外時以前直接炸掉整個 callback（畫面卡住沒反應）；
            // 現在擋下來告訴使用者，停在這一步讓他換設定。
            let plan = null;
            try {
                plan = generateNextCyclePlan({
                    ...config,
                    startDate: cycleStart,
                });
            } catch (e) {
                console.warn('[CardioPlanBuilder] 生成課表失敗:', e?.message);
                haptic('heavy');
                toast.error('這組設定排不出課表，換一個試試');
                return;
            }
            setGeneratedPlan(plan);
        }
        setDir(1);
        haptic('medium');
        setStep((s) => Math.min(4, s + 1));
    }, [step, config, cycleStart]);

    const goBack = useCallback(() => {
        if (step === 0) {
            onClose?.();
            return;
        }
        setDir(-1);
        haptic('light');
        setStep((s) => Math.max(0, s - 1));
    }, [step, onClose]);

    // ★ v2.2 —— 在預覽頁直接把第 1 期換成更適合的目標，就地重生成，
    //    不必退回第一步重選（退回去等於要人重走四步，多數人會直接放棄）。
    const handleSwitchGoal = useCallback((nextGoal) => {
        // ⚠️ 舊版把 setGeneratedPlan 寫在 setConfig 的 updater 裡 —— 那是 render
        //    階段，React 18 嚴格模式會跑兩次；而且生成失敗時 config 已經換成新
        //    目標、課表還是舊的 → 畫面寫著「減脂」，存下去的是「有氧底」。
        //    生不出來就整個不動，畫面預告的永遠等於存下去的。
        let next = null;
        try {
            next = generateNextCyclePlan({ ...config, goal: nextGoal, startDate: cycleStart });
        } catch (e) {
            console.warn('[CardioPlanBuilder] 換目標重生成失敗:', e?.message);
            haptic('heavy');
            toast.error('這個目標排不出課表，換一個試試');
            return;
        }
        setConfig((c) => ({ ...c, goal: nextGoal }));
        setGeneratedPlan(next);
    }, [config, cycleStart]);

    // ══════════════════════════════════════════════════════════════════
    // ✅ 確認計劃 —— 全程只有一條存檔路徑，兩顆按鈕差別只在「存完去哪」。
    //
    //    舊版是兩份幾乎一模一樣的函式（handleCommit / handleCommitAndEdit），
    //    改一邊另一邊不會跟；而且兩邊都有四個「無聲出口」：
    //      ① 沒有 generatedPlan → 直接 return
    //      ② 沒有 userId        → 直接 return
    //      ③ 後端沒回 plan_id   → throw 進 catch
    //      ④ 連線失敗／逾時     → catch
    //    四個出口都只 console.warn。使用者按下去畫面完全沒反應 ——
    //    這就是「現在甚至也按不下去」。
    //    新版規定：任何一條路都要留下「發生什麼事、現在該做什麼」。
    // ══════════════════════════════════════════════════════════════════

    /** 存完要去哪：跳轉只做一次（儀式收場與保險計時器可能同時到）。 */
    const leaveOnce = useRef(false);
    const goAfterCommit = useCallback((dest) => {
        if (leaveOnce.current) return;
        leaveOnce.current = true;
        // 不可呼叫 onClose()，否則 App.jsx 的 navigate(-1) 會把這次跳轉抵銷掉
        if (dest === 'editor') {
            navigate('/cardio-plan-editor', returnTo ? { state: { returnTo } } : undefined);
            return;
        }
        // 從「完整計劃」引導頁來的 → 回那一頁繼續設定下一項，不打斷分步流程
        navigate(returnTo || '/cardio-microcycle-inbox');
    }, [navigate, returnTo]);

    const commitPlan = useCallback(async (dest) => {
        if (saving) return;                       // 連點兩下不要存成兩份
        if (!userId) {
            haptic('heavy');
            toast.error('要先登入才存得起來');
            navigate('/login');
            return;
        }
        if (!generatedPlan) {
            // 只有生成失敗才會走到這 —— 不要讓人卡在一顆沒反應的按鈕上
            haptic('heavy');
            toast.error('課表還沒生成，回上一步重選週期');
            setDir(-1);
            setStep(3);
            return;
        }
        setSaving(true);
        haptic('medium');
        try {
            const { data } = await apiClient.post(
                '/api/cardio-plan/save',
                { user_id: userId, plan: { ...generatedPlan, day_overrides: {} } },
                // 伺服器冷啟動會超過 apiClient 預設的 15 秒 → 存檔給足 45 秒。
                // 逾時等於白按一次，這條路徑不能用預設值。
                { timeout: 45000 },
            );
            const saved = data?.plan;
            if (!saved?.plan_id) throw new Error('NO_PLAN_ID');
            // 中控台要算「這一輪跑到第幾週」→ 本地留下起訖兩個欄位（計劃本體在後端）
            publishProgram(userId, { running: saved });
            haptic('success');
            // 🎊 儀式：計劃成立的那一刻要被看見，看完才走。
            //    第一次建立跑步計劃有專屬的滿版時刻；之後每一次確認都有
            //    「未來 N 週的跑步計劃成立」—— 兩者只會出現一個，不疊播。
            const weeks = planWeeks(saved, config.totalWeeks);
            try {
                if (!recordFirst(userId, 'gen_run_plan')) {
                    recordPlanLive(userId, { weeks, kind: 'run' });
                }
            } catch { /* 慶祝失敗不該擋住已經存好的計劃 */ }
            afterMomentIdle(() => goAfterCommit(dest));
            // 保險：儀式萬一沒收場（元件沒掛上、動畫被中斷），也要走得掉。
            // 少了這一條，使用者會抱著一份已存好的計劃卡在原地。
            setTimeout(() => goAfterCommit(dest), 5200);
        } catch (e) {
            setSaving(false);
            haptic('heavy');
            toast.error(commitErrorMessage(e));
            console.warn('[CardioPlanBuilder] 存檔失敗:', e?.message, e?.response?.status);
        }
    }, [saving, userId, generatedPlan, config.totalWeeks, navigate, goAfterCommit]);

    const handleCommit = useCallback(() => commitPlan('plan'), [commitPlan]);
    const handleCommitAndEdit = useCallback(() => commitPlan('editor'), [commitPlan]);

    // ── Page background (Misty Grey + titanium grain) ─────────────────
    //    背景改成 misty grey（Mist #E8E9E6，設計系統唯一冷灰），
    //    做成極淡的漸層：頂端偏亮、往下沉入 Mist，讓暖色卡片自然浮起。
    return (
        <div
            className="fixed inset-0 z-[100100] flex flex-col"
            style={{
                background:
                    'radial-gradient(120% 70% at 50% -10%, #F3F4F2 0%, #E8E9E6 48%, #DFE1DD 100%)',
                color: C.ink,
                fontFamily: 'var(--font-body)',
            }}
        >
            {/* 首次建立跑步計劃 → 操作步驟教學（看過一次即不再出現） */}
            <FirstTimeHint
                tipKey="first-cardio-plan"
                title="建立跑步計劃"
                steps={[
                    '選目標與每週跑幾次',
                    '誠實填目前的週跑量',
                    '看過週量曲線再確認',
                ]}
            />

            {/* ── Titanium hairline grain overlay ─────────────────── */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.4) 44%, rgba(255,255,255,0.05) 52%, transparent 60%)',
                    mixBlendMode: 'overlay',
                    opacity: 0.45,
                }}
            />

            {/* ═══ Header ═══════════════════════════════════════════ */}
            <Header step={step} onBack={goBack} />

            {/* ═══ Body  ════════════════════════════════════════════ */}
            <div className="relative flex-1 overflow-y-auto overflow-x-hidden">
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                    {step === 0 && (
                        <StepGoal
                            key="goal"
                            value={config.goal}
                            touched={!!touched.goal}
                            recommendation={recommendation}
                            onApplyRecommendation={applyRecommendation}
                            onChange={(g) => { mark('goal'); setConfig((c) => ({ ...c, goal: g })); }}
                        />
                    )}
                    {/* ★ v2.0 步驟重排：頻率/程度 → 基準線 → 週期。
                        週量預覽圖表依賴「程度＋真實週跑量」，必須先收集完才有意義 —
                        否則圖表用預設值畫、跟最終計劃對不上。 */}
                    {step === 1 && (
                        <StepCadence
                            key="cadence"
                            sessionsPerWeek={config.sessionsPerWeek}
                            currentLevel={config.currentLevel}
                            includeStrength={config.includeStrength}
                            strengthDays={plannedStrengthDays}
                            weeklyLoad={weeklyLoad}
                            runDayPlan={runDayPlan}
                            onChangeSessions={handleChangeSessions}
                            onChangeLevel={(l) => { mark('cadence'); setConfig((c) => ({ ...c, currentLevel: l })); }}
                            onChangeStrength={(v) => setConfig((c) => ({ ...c, includeStrength: v }))}
                            onSeeStrengthPlan={() => navigate('/plan-tracking', returnTo ? { state: { returnTo } } : undefined)}
                        />
                    )}
                    {step === 2 && (
                        <StepBaseline
                            key="baseline"
                            goal={config.goal}
                            currentWeeklyKm={config.currentWeeklyKm}
                            baselinePace5K={config.baselinePace5K}
                            pace5kId={config.pace5kId}
                            touchedKm={!!touched.baselineKm}
                            touchedPace={!!touched.baselinePace}
                            onChangeWeeklyKm={(v) => { mark('baselineKm'); setConfig((c) => ({ ...c, currentWeeklyKm: v })); }}
                            onChangePace5K={(opt) => {
                                mark('baselinePace');
                                // 一次存三樣：亮哪一顆（id）、配速（給引擎算）、跑不跑得完 5K（硬地板）
                                setConfig((c) => ({ ...c, pace5kId: opt.id, baselinePace5K: opt.paceSec, canRun5k: opt.canRun5k }));
                            }}
                        />
                    )}
                    {step === 3 && (
                        <StepDuration
                            key="duration"
                            value={config.totalWeeks}
                            config={config}
                            touched={!!touched.duration}
                            onExplain={openExplain}
                            onChange={(w) => { mark('duration'); setConfig((c) => ({ ...c, totalWeeks: w })); }}
                        />
                    )}
                    {step === 4 && generatedPlan && (
                        <StepPreview
                            key="preview"
                            plan={generatedPlan}
                            onSwitchGoal={handleSwitchGoal}
                            onExplain={openExplain}
                        />
                    )}
                </AnimatePresence>
            </div>

            

            {/* ═══ Sticky Preview ═══════════════════════════════════
                  High #8 — Wizard 每一步都即時顯示目前所有選擇 summary
                  讓使用者隨時掌握全局，不必往回切步驟看 */}
            <StickyPreview step={step} config={config} />

            {/* ═══ CTA  ═════════════════════════════════════════════ */}
            <FooterCTA
                step={step}
                onNext={goNext}
                onCommit={handleCommit}
                onCommitAndEdit={handleCommitAndEdit}
                saving={saving}
                ready={stepReady}
                hint={stepHint}
            />

            {/* 「?」說明面板 */}
            <AnimatePresence>
                {explainPlan && (
                    <ExplainSheet key="explain" plan={explainPlan} onClose={() => setExplainPlan(null)} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default CardioPlanBuilder;

// ════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════
const STEP_LABELS = ['目標', '頻率', '基準線', '週期', '預覽'];

// Medium #20 — Header 資訊冗餘簡化：
//   原本同時顯示「01 / 04」文字 + 4 顆 progress chip（兩者都在表達進度，重複）。
//   現在只保留：返回鍵 + 步驟標題 + 進度 chip（chip 已視覺化告知幾／幾）。
const Header = ({ step, onBack }) => (
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

        <span
            className="text-[11px] font-extrabold tracking-[0.20em] uppercase"
            style={{ color: C.ink }}
        >
            {STEP_LABELS[step]}
        </span>

        {/* progress chip — 同時負擔「視覺進度條」與「第幾步」資訊 */}
        <div className="flex items-center gap-1" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEP_LABELS.length}>
            {STEP_LABELS.map((_, i) => (
                <div
                    key={i}
                    className="rounded-full transition-all duration-500"
                    style={{
                        width: i === step ? 18 : 6,
                        height: 6,
                        background:
                            i <= step
                                ? 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)'
                                : C.sand,
                    }}
                />
            ))}
        </div>
    </div>
);

// ════════════════════════════════════════════════════════════════════
// FOOTER CTA
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// STICKY PREVIEW — wizard 每步都顯示完整選擇 summary
// ════════════════════════════════════════════════════════════════════
const StickyPreview = ({ step, config }) => {
    // step 4 (Preview) 不顯示 — 那一頁本身就是 preview
    if (step === 4) return null;
    const goal = GOALS.find(g => g.id === config.goal);
    const level = LEVELS.find(l => l.id === config.currentLevel);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mx-6 mb-2"
        >
            <div
                className="flex items-center gap-3 px-4 py-2.5 rounded-[18px]"
                style={{
                    background: 'rgba(255,255,255,0.55)',
                    backdropFilter: 'blur(20px) saturate(1.6)',
                    WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
                    border: '1px solid rgba(255,255,255,0.85)',
                    boxShadow: '0 4px 12px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                }}
            >
                <span className="text-[12px] font-extrabold tracking-[0.22em] shrink-0" style={{ color: 'rgba(22,20,21,0.40)' }}>
                    摘要
                </span>
                <div className="w-px h-4" style={{ background: 'rgba(22,20,21,0.10)' }} />
                <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {/* ★ v2.0 chip 順序跟步驟同步：目標 → 頻率 → 基準線 → 週期 */}
                    <PreviewChip
                        active={step === 0}
                        label={goal?.title || '目標'}
                        kicker={goal?.kicker}
                    />
                    <span className="text-[11px] font-black tracking-tight" style={{ color: 'rgba(22,20,21,0.25)' }}>·</span>
                    <PreviewChip
                        active={step === 1}
                        label={`${config.sessionsPerWeek}×/週`}
                        kicker={level?.label?.slice(0, 3) || '程度'}
                    />
                    <span className="text-[11px] font-black tracking-tight" style={{ color: 'rgba(22,20,21,0.25)' }}>·</span>
                    <PreviewChip
                        active={step === 2}
                        label={`${config.currentWeeklyKm} km/w`}
                        kicker="基準線"
                    />
                    <span className="text-[11px] font-black tracking-tight" style={{ color: 'rgba(22,20,21,0.25)' }}>·</span>
                    <PreviewChip
                        active={step === 3}
                        label={`${config.totalWeeks} 週`}
                        kicker="週期"
                    />
                </div>
            </div>
        </motion.div>
    );
};

const PreviewChip = ({ active, label, kicker }) => (
    <div
        className="flex flex-col leading-none shrink-0 px-2 py-1 rounded-lg transition-all"
        style={{
            background: active ? 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)' : 'transparent',
        }}
    >
        {kicker && (
            <span
                className="text-[11px] font-black tracking-[0.22em] uppercase mb-0.5"
                style={{ color: active ? 'rgba(255,255,255,0.75)' : 'rgba(22,20,21,0.42)' }}
            >
                {kicker}
            </span>
        )}
        <span
            className="text-[11px] font-black tracking-tight whitespace-nowrap"
            style={{ color: active ? C.white : C.ink }}
        >
            {label}
        </span>
    </div>
);

const FooterCTA = ({ step, onNext, onCommit, onCommitAndEdit, saving, ready = true, hint = '' }) => {
    const isLast = step === 4;
    const blocked = !isLast && !ready;

    return (
        <div className="relative z-10 px-6 pb-10 pt-3">
            {/* Zone stripe — micro signature */}
            <div className="flex gap-[2px] mb-4 px-1">
                {ZONE_STRIPE.map((z, i) => (
                    <div
                        key={z.id}
                        className="flex-1 rounded-full"
                        style={{
                            height: 3,
                            background: z.color,
                            opacity: 0.55 + i * 0.08,
                        }}
                    />
                ))}
            </div>

            {/* ★ v2.3 還沒選完 → 明確說還差什麼，而不是讓按鈕默默沒反應 */}
            <AnimatePresence>
                {blocked && hint && (
                    <motion.div
                        initial={{ opacity: 0, y: 6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        className="flex items-center justify-center gap-1.5 mb-2.5 overflow-hidden"
                    >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: C.coral }} />
                        <span className="text-[11px] font-semibold" style={{ color: 'rgba(22,20,21,0.60)' }}>
                            {hint}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Primary CTA */}
            <motion.button
                whileTap={blocked ? { x: [0, -6, 6, -4, 4, 0] } : { scale: 0.97 }}
                transition={blocked ? { duration: 0.35 } : undefined}
                onClick={isLast ? onCommit : onNext}
                disabled={saving}
                aria-disabled={blocked}
                className="w-full h-[58px] rounded-full flex items-center justify-center gap-3 relative overflow-hidden"
                style={{
                    background: blocked
                        ? 'linear-gradient(135deg, #E4DED2 0%, #D8D1C4 100%)'
                        : 'linear-gradient(135deg, #2A2724 0%, #161415 60%, #262523 100%)',
                    color: blocked ? 'rgba(22,20,21,0.42)' : C.paper,
                    border: blocked ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.12)',
                    boxShadow: blocked
                        ? 'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 3px rgba(151,166,182,0.28)'
                        : '0 12px 30px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.16), inset 0 -3px 8px rgba(0,0,0,0.5)',
                    letterSpacing: '0.22em',
                    fontWeight: 800,
                    fontSize: 12,
                    transition: 'background 0.3s ease, color 0.3s ease',
                }}
            >
                {!blocked && (
                    <span
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background:
                                'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 46%, rgba(255,255,255,0.02) 53%, transparent 62%)',
                            mixBlendMode: 'screen',
                        }}
                    />
                )}
                <span>{isLast ? (saving ? '建立中…' : '確認計劃') : '繼續'}</span>
                {!isLast && <ChevronRight size={16} strokeWidth={2.6} />}
            </motion.button>

            {/* Secondary: edit before commit (only on preview step) */}
            {/* 想動哪一天、哪一堂 → 一樣先成立，再進課表編輯器改。
                兩顆都是「確認」，差別只在確認完停在哪裡。 */}
            {isLast && (
                <motion.button
                    {...pressProps('cta')}
                    onClick={onCommitAndEdit}
                    disabled={saving}
                    className="w-full mt-2 h-11 rounded-full flex items-center justify-center"
                    style={{
                        background: 'transparent',
                        color: saving ? 'rgba(22,20,21,0.28)' : 'rgba(22,20,21,0.65)',
                        letterSpacing: '0.22em',
                        fontWeight: 800,
                        fontSize: 12,
                        transition: 'color 0.3s ease',
                    }}
                >
                    確認計劃並微調
                </motion.button>
            )}
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════
// STEP 0 — GOAL
// ════════════════════════════════════════════════════════════════════
/* ════════════════════════════════════════════════════════════════════
   RecommendationBanner —— 「上一期跑完了，這是我幫你想的下一步」
   在選目標的第一步就出現，讓使用者不必從零開始想。
   ════════════════════════════════════════════════════════════════════ */
const RecommendationBanner = ({ rec, onApply }) => {
    if (!rec) return null;
    const goal = GOALS.find((g) => g.id === rec.goalId) || GOALS[1];

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="mt-6 rounded-[24px] p-4 relative overflow-hidden"
            style={{
                background: 'linear-gradient(150deg, #232120 0%, #161415 60%, #1C1A18 100%)',
                border: `1px solid ${goal.accent}44`,
                boxShadow: `0 14px 30px -18px rgba(0,0,0,0.6), 0 0 0 1px ${goal.accent}18`,
            }}
        >
            <span className="absolute pointer-events-none"
                style={{ inset: -30, background: `radial-gradient(52% 60% at 88% 8%, ${goal.accent}33 0%, transparent 72%)` }} />
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={13} strokeWidth={2.4} color={goal.accent} />
                    <span className="text-[12px] font-black tracking-[0.22em]" style={{ color: 'rgba(246,244,241,0.5)' }}>
                        依你上一期的實際表現
                    </span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-[19px] font-light" style={{ color: C.paper }}>{rec.title}</span>
                    <span className="text-[11px] font-mono" style={{ color: 'rgba(246,244,241,0.45)' }}>
                        {rec.config.totalWeeks} 週 · {rec.config.sessionsPerWeek} 趟／週
                    </span>
                </div>
                {rec.reasons[0] && (
                    <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: 'rgba(246,244,241,0.68)' }}>
                        {rec.reasons[0]}
                    </p>
                )}
                <motion.button {...pressProps('row')}
 onClick={() => { haptic('medium'); onApply?.(rec.config); }}
 className="w-full h-10 rounded-full flex items-center justify-center gap-1.5"
 style={{
 background: `linear-gradient(135deg, ${goal.accent} 0%, ${goal.accent}CC 100%)`,
 color: '#fff', letterSpacing: '0.14em', fontWeight: 800, fontSize: 11,
 }}
 >
                    <Check size={13} strokeWidth={3} />
                    直接套用這個建議
                </motion.button>
            </div>
        </motion.div>
    );
};

const StepGoal = ({ value, onChange, touched = false, recommendation = null, onApplyRecommendation = null }) => (
    <motion.div
        custom={1}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        className="px-6 pb-6"
    >
        <SectionDisplay
            kicker="我們的訓練方向"
            heading="選擇你的目標。"
            sub="每張卡都寫清楚它專門訓練什麼、適合哪一種跑者。引擎會依此規劃整個 4–14 週週期。"
        />

        {/* ★ v2.3：跑完上一期的人，不該再從一片空白開始選 */}
        <RecommendationBanner rec={recommendation} onApply={onApplyRecommendation} />

        <motion.div
            className="flex flex-col gap-3 mt-8"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
        >
            {GOALS.map((g) => {
                // 還沒主動選過 → 一張都不點亮，避免預設值被誤認成「我選的」
                const active = touched && value === g.id;
                return (
                    <motion.button
                        key={g.id}
                        variants={{
                            hidden: { opacity: 0, y: 16 },
                            visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
                        }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => onChange(g.id)}
                        aria-pressed={active}
                        className="relative w-full text-left rounded-[28px] overflow-hidden"
                        style={{
                            background: active
                                ? 'linear-gradient(155deg, #232120 0%, #161415 60%, #1C1A18 100%)'
                                : 'linear-gradient(150deg, #FBFAF8 0%, #F3EEE6 55%, #ECE4D7 100%)',
                            color: active ? C.paper : C.ink,
                            border: active
                                ? `1px solid ${g.accent}55`
                                : '1px solid rgba(255,255,255,0.9)',
                            boxShadow: active
                                ? `0 16px 34px -14px rgba(0,0,0,0.5), 0 0 0 1px ${g.accent}22, inset 0 1px 0 rgba(255,255,255,0.10)`
                                : '0 10px 26px -14px rgba(22,20,21,0.16), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 2px rgba(151,166,182,0.18)',
                            transition: 'background 0.4s ease, color 0.4s ease, border-color 0.4s ease',
                        }}
                    >
                        {/* 種類色條 — 未選中時是唯一的顏色線索，選中後點亮 */}
                        <span
                            className="absolute left-0 top-0 bottom-0 pointer-events-none"
                            style={{
                                width: 4,
                                background: g.accent,
                                opacity: active ? 1 : 0.55,
                                transition: 'opacity 0.35s ease',
                            }}
                        />
                        {/* 選中時：種類色的氛圍暈光 */}
                        {active && (
                            <span
                                className="absolute pointer-events-none"
                                style={{
                                    inset: -40,
                                    background: `radial-gradient(60% 60% at 12% 20%, ${g.accent}30 0%, transparent 70%)`,
                                }}
                            />
                        )}
                        {/* sheen */}
                        <span
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                background: active
                                    ? 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.06) 47%, transparent 60%)'
                                    : 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 47%, transparent 60%)',
                                mixBlendMode: active ? 'screen' : 'overlay',
                                opacity: 0.45,
                            }}
                        />

                        <div className="relative flex items-start gap-4 p-5 pl-6">
                            <div
                                className="w-12 h-12 rounded-[18px] flex items-center justify-center shrink-0"
                                style={{
                                    background: active
                                        ? `linear-gradient(135deg, ${g.accent} 0%, ${g.accent}CC 100%)`
                                        : g.accentSoft,
                                    color: active ? '#fff' : g.accent,
                                    boxShadow: active
                                        ? `0 6px 14px ${g.accent}55, inset 0 1px 1px rgba(255,255,255,0.4)`
                                        : 'inset 0 1px 1px rgba(255,255,255,1)',
                                }}
                            >
                                <g.Icon size={22} strokeWidth={1.8} />
                            </div>

                            <div className="flex-1 min-w-0">
                                {/* 種類標籤 + 強度點 */}
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span
                                        className="text-[11px] font-black tracking-[0.18em] uppercase px-2 py-[3px] rounded-full"
                                        style={{
                                            background: active ? `${g.accent}28` : g.accentSoft,
                                            color: active ? g.accent : g.accent,
                                            border: `1px solid ${g.accent}44`,
                                        }}
                                    >
                                        {g.typeLabel}
                                    </span>
                                    <span
                                        className="text-[11px] font-extrabold tracking-[0.22em] uppercase"
                                        style={{ color: active ? 'rgba(246,244,241,0.5)' : 'rgba(22,20,21,0.42)' }}
                                    >
                                        {g.kicker}
                                    </span>
                                    {/* 強度計：4 格 */}
                                    <span className="flex items-center gap-[3px] ml-auto" title={`強度 ${g.intensity}/4`}>
                                        {[1, 2, 3, 4].map((n) => (
                                            <span
                                                key={n}
                                                style={{
                                                    width: 5, height: 5, borderRadius: 99,
                                                    background: n <= g.intensity
                                                        ? g.accent
                                                        : active ? 'rgba(246,244,241,0.16)' : 'rgba(22,20,21,0.12)',
                                                }}
                                            />
                                        ))}
                                    </span>
                                </div>

                                <div
                                    className="text-[21px] font-light tracking-[-0.02em] leading-none mb-2"
                                    style={{ color: active ? C.paper : C.ink }}
                                >
                                    {g.title}
                                </div>

                                {/* ★ 明確告訴使用者：訓練什麼 / 給誰 */}
                                <div className="flex flex-col gap-1 mb-2">
                                    <GoalFact
                                        active={active}
                                        accent={g.accent}
                                        label="專門訓練"
                                        text={g.trains}
                                    />
                                    <GoalFact
                                        active={active}
                                        accent={g.accent}
                                        label="適合誰"
                                        text={g.forWho}
                                    />
                                </div>

                                <div
                                    className="text-[12px] leading-relaxed"
                                    style={{ color: active ? 'rgba(246,244,241,0.66)' : 'rgba(22,20,21,0.60)' }}
                                >
                                    {g.desc}
                                </div>

                                {/* ★ v2.1：改成「原型參考值」措辭 —— 實際尖峰由你的基準線決定，
                                    下一步的週量曲線會算給你看，不再讓人以為一定跑得到這個數字 */}
                                <div
                                    className="text-[11px] font-mono mt-2.5 tracking-tight"
                                    style={{ color: active ? 'rgba(246,244,241,0.38)' : 'rgba(22,20,21,0.38)' }}
                                >
                                    {g.archetypePeak}
                                </div>
                            </div>

                            {active && (
                                <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                                    style={{
                                        background: `${g.accent}1F`,
                                        border: `1px solid ${g.accent}55`,
                                    }}
                                >
                                    <Check size={14} strokeWidth={3} color={g.accent} />
                                </motion.div>
                            )}
                        </div>
                    </motion.button>
                );
            })}
        </motion.div>
    </motion.div>
);

/* 目標卡內的「事實列」：標籤 + 內容，讓「訓練什麼 / 給誰」一眼可掃 */
const GoalFact = ({ active, accent, label, text }) => (
    <div className="flex items-start gap-2">
        <span
            className="text-[11px] font-black tracking-[0.14em] shrink-0 mt-[3px] px-1.5 py-[2px] rounded"
            style={{
                background: active ? 'rgba(246,244,241,0.08)' : 'rgba(22,20,21,0.05)',
                color: active ? 'rgba(246,244,241,0.55)' : 'rgba(22,20,21,0.45)',
                minWidth: 48,
                textAlign: 'center',
            }}
        >
            {label}
        </span>
        <span
            className="text-[12px] font-semibold leading-snug"
            style={{ color: active ? C.paper : C.ink }}
        >
            {text}
        </span>
        <span className="w-1 h-1 rounded-full shrink-0 mt-[7px]" style={{ background: accent, opacity: 0.5 }} />
    </div>
);

// ════════════════════════════════════════════════════════════════════
// STEP 1 — DURATION (weeks)
// ════════════════════════════════════════════════════════════════════
const StepDuration = ({ value, config, onChange, touched = false, onExplain = null }) => {
    /* 📅 建議週期依「他是什麼樣的跑者 × 選了什麼目標」算出來。
       級別問的是引擎同一支 resolveRunnerLevel —— 畫面說「初學者建議 8 週」，
       按下去拿到的就一定是初學者的 8 週課表。 */
    const level = resolveRunnerLevel(config || {});
    const rec = recommendCycleWeeks({ goal: config?.goal, level });

    return (
    <motion.div
        custom={1}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        className="px-6 pb-6"
    >
        <SectionDisplay
            kicker="訓練週期長度"
            heading="選擇週期長度。"
            sub={`${LEVEL_ZH[level] || '你'}＋這個目標，建議 ${rec.weeks} 週。`}
        />

        {/* large display */}
        <div className="mt-7 mb-3 flex items-end justify-center gap-3">
            <motion.span
                key={value}
                initial={{ opacity: 0, y: 10, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className="font-light"
                style={{
                    fontSize: 96,
                    letterSpacing: '-0.04em',
                    lineHeight: 0.85,
                    color: C.ink,
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {value}
            </motion.span>
            <span
                className="font-extrabold tracking-[0.20em] pb-2.5"
                style={{ fontSize: 12, color: 'rgba(22,20,21,0.50)' }}
            >
                週
            </span>
        </div>

        {/* ★ v2.3 選擇器往上移 —— 原本在最下面，使用者得先滑過整張圖表
            才找得到能點的東西。要點的東西必須在第一屏。 */}
        <div className="mb-1 flex items-center gap-2">
            <span className="text-[12px] font-extrabold tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.50)' }}>
                點一個週數
            </span>
            <div className="flex-1 h-px" style={{ background: C.sand, opacity: 0.7 }} />
        </div>

        <div
            className="flex items-end"
            style={{ borderTop: SWISS.hairline, borderBottom: SWISS.hairline }}
        >
            {WEEK_OPTIONS.map((w, i) => {
                const active = touched && w === value;
                const suggested = w === rec.weeks;
                return (
                    <motion.button {...pressProps('pill')}
 key={w}
 onClick={() => onChange(w)}
 aria-pressed={active}
 aria-label={suggested ? `${w} 週（建議）` : `${w} 週`}
 className="flex-1 flex flex-col items-center justify-end"
 style={{
 background: 'transparent',
 border: 'none',
 borderLeft: i === 0 ? 'none' : SWISS.hairline,
 padding: '10px 0 12px',
 cursor: 'pointer',
 }}
 >
                        {/* 建議的那一格標出來 —— 不佔位的話數字會上下跳 */}
                        <span
                            className="text-[11px] font-black tracking-[0.16em]"
                            style={{ color: SWISS.coral, opacity: suggested ? 1 : 0, lineHeight: 1, marginBottom: 4 }}
                        >
                            建議
                        </span>
                        <span
                            style={{
                                ...TYPE.display,
                                fontSize: active ? 30 : 16,
                                fontWeight: active ? 300 : 500,
                                color: active ? SWISS.coral : 'rgba(22,20,21,0.32)',
                                fontVariantNumeric: 'tabular-nums',
                                transition: 'font-size 0.25s cubic-bezier(0.16,1,0.3,1), color 0.25s',
                                lineHeight: 1,
                            }}
                        >
                            {w}
                        </span>
                    </motion.button>
                );
            })}
        </div>

        {/* phase preview ribbon */}
        <PhaseRibbon config={config} onExplain={onExplain} />

        {/* ══════════════════════════════════════════════════════════
            🇨🇭 週數選擇 —— 6 個圓角方塊 → 髮絲線分隔的單列
            極簡：沒有底色、沒有陰影、沒有圓角；只有數字與一條線。
            大膽：選中的那個直接放大到 Display 階，其餘縮到最小。
                  對比極端，一眼就知道現在選的是哪個。
            ══════════════════════════════════════════════════════ */}
        {/* 這裡以前是兩句機制說明（減量週怎麼插、taper 幾週）——
            那是引擎背景在做的事，收進上面曲線旁的「?」。
            這一步使用者只需要知道：為什麼建議這個週數。 */}
        <p
            className="text-[11px] font-semibold mt-5 text-center px-4"
            style={{ color: 'rgba(22,20,21,0.55)' }}
        >
            {rec.why}
        </p>
    </motion.div>
    );
};

// ────────────────────────────────────────────────────────────────────
// Phase preview ribbon (mini timeline for chosen weeks)
// ────────────────────────────────────────────────────────────────────
const PhaseRibbon = ({ config, onExplain }) => {
    // ★ 週量曲線用「真引擎」即時生成 —— 這裡看到的數字就是最後拿到的課表
    const preview = useMemo(() => {
        /* ⚠️ 這裡以前把欄位一個一個抄過去。每加一個設定（像「我還跑不到 5K」）
           就要記得補一行，忘了補 → 這張曲線畫的是中階、實際存下去的是初學者。
           直接把整份 config 交給同一支引擎，預告的就永遠等於拿到的。 */
        const plan = generateNextCyclePlan({ ...(config || {}) });
        return {
            plan,
            summary: inspectPlan(plan),
            peakKm: plan.meta.totals.peak_km,
            startKm: plan.meta.totals.start_km,
        };
    }, [config]);

    return (
        <div className="px-1 mt-2">
            <MileageCurve
                summary={preview.summary}
                peakKm={preview.peakKm}
                startKm={preview.startKm}
                plan={preview.plan}
                onExplain={onExplain ? () => onExplain(preview.plan) : null}
            />
            {/* ★ v2.3「這幾週你會怎麼練」—— 使用者真正需要知道的只有這個 */}
            <HowYouTrain plan={preview.plan} />
        </div>
    );
};

/* ════════════════════════════════════════════════════════════════════
   HowYouTrain — 把課表翻譯成「你的一週會長什麼樣」
   不講 ACWR、不講 phase ratio，只講：跑幾趟、多久、跑多慢、哪一趟最硬。
   ════════════════════════════════════════════════════════════════════ */
const SUBTYPE_ZH = {
    easy: '輕鬆跑', recovery: '恢復跑', long: '長跑', medium: '中距離',
    tempo: '節奏跑', interval: '間歇', strength: '重訓',
};
const SUBTYPE_COLOR = {
    easy: '#8BC34A', recovery: '#FDD835', long: '#5C6BC0', medium: '#9CCC65',
    tempo: '#FF9800', interval: '#F06292', strength: '#8D6E63',
};

const HowYouTrain = ({ plan }) => {
    const info = useMemo(() => {
        const weeks = plan?.weeks || [];
        if (!weeks.length) return null;
        // 取「量最大的訓練週」當代表 — 那是這份計劃最忙的一週
        const load = weeks.filter((w) => !w.is_deload && w.phase !== 'taper');
        const rep = (load.length ? load : weeks).reduce((a, b) =>
            (b.target_mileage_km > a.target_mileage_km ? b : a));
        const bricks = (rep.bricks || []).slice().sort((a, b) => (b.distance_km || 0) - (a.distance_km || 0));
        const hardest = bricks.find((b) => ['tempo', 'interval'].includes(b.subtype));
        const easyKm = bricks
            .filter((b) => ['easy', 'recovery', 'long'].includes(b.subtype))
            .reduce((s, b) => s + (b.distance_km || 0), 0);
        const easyPct = rep.target_mileage_km > 0
            ? Math.round((easyKm / rep.target_mileage_km) * 100) : 0;
        return { rep, bricks, hardest, easyPct };
    }, [plan]);

    if (!info) return null;
    const { rep, bricks, hardest, easyPct } = info;

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 rounded-[28px] p-5 relative overflow-hidden"
            style={{
                background: 'linear-gradient(155deg, #FBFAF8 0%, #F2EDE4 60%, #E8E0D2 100%)',
                border: '1px solid rgba(255,255,255,0.9)',
                boxShadow: '0 16px 36px -16px rgba(22,20,21,0.20), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 2px rgba(151,166,182,0.22)',
            }}
        >
            <div className="flex items-baseline justify-between mb-3.5">
                <span className="text-[12px] font-extrabold tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.4)' }}>
                    你最忙的一週
                </span>
                <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    WK {String(rep.week_index).padStart(2, '0')} · {rep.target_mileage_km} km · {Math.round(rep.total_duration_min / 60 * 10) / 10} 小時
                </span>
            </div>

            {/* 這一週的每一趟 */}
            <div className="flex flex-col gap-2">
                {bricks.map((b, i) => {
                    const color = SUBTYPE_COLOR[b.subtype] || '#8BC34A';
                    return (
                        <motion.div
                            key={b.brick_id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.14 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
                            style={{ background: 'rgba(255,255,255,0.62)', border: '1px solid rgba(207,198,184,0.45)' }}
                        >
                            <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: color, minHeight: 26 }} />
                            <span className="text-[12px] font-semibold shrink-0" style={{ color: C.ink, minWidth: 52 }}>
                                {SUBTYPE_ZH[b.subtype] || b.subtype}
                            </span>
                            <span className="text-[12px] font-light tabular-nums" style={{ color: 'rgba(22,20,21,0.72)' }}>
                                {b.distance_km != null ? `${b.distance_km} km` : `${b.duration_min} 分`}
                            </span>
                            {b.target_pace_label && b.distance_km != null && (
                                <span className="text-[11px] font-mono ml-auto tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                    {b.target_pace_label}/km
                                </span>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* 一句話總結怎麼練 */}
            <p className="text-[11px] leading-relaxed mt-3.5" style={{ color: 'rgba(22,20,21,0.58)' }}>
                {easyPct >= 75
                    ? `${easyPct}% 是輕鬆跑 — 跑的時候要能講完整句話。`
                    : `${easyPct}% 輕鬆跑`}
                {hardest ? `  最硬的一趟是 ${SUBTYPE_ZH[hardest.subtype]}（${hardest.distance_km} km）。` : ''}
            </p>
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// STEP 2 — CADENCE  (sessions / week + level + strength)
// ════════════════════════════════════════════════════════════════════
/* ════════════════════════════════════════════════════════════════════
   SessionSlider — 每週跑步次數 1–7
   拖動時立刻回答三件事：這一週長什麼樣、要花多少時間、你的程度撐不撐得住。
   ════════════════════════════════════════════════════════════════════ */
const SessionSlider = ({ value, level, includeStrength, onChange }) => {
    const profile = SESSION_PROFILE[value] || SESSION_PROFILE[4];
    const safeMax = SESSION_SAFE_MAX[level] ?? 6;
    const overLevel = value > safeMax;
    const pct = ((value - SESSION_MIN) / (SESSION_MAX - SESSION_MIN)) * 100;

    // 這個頻率大概會花多少時間（以 40 分鐘一趟、重訓 45 分估算）
    const runMins = value * 40;
    const totalMins = runMins + (includeStrength ? 45 : 0);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    const toneColor = overLevel ? C.coral
        : profile.tone === 'warn' ? '#FF9800'
        : profile.tone === 'ok' ? '#C9A227'
        : '#8BC34A';

    return (
        <div className="mt-8">
            {/* 大數字 + 標籤 */}
            <div className="flex items-end justify-center gap-3 mb-1">
                <motion.span
                    key={value}
                    initial={{ opacity: 0, y: 10, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    className="font-light"
                    style={{
                        fontSize: 92, lineHeight: 0.85, letterSpacing: '-0.04em',
                        color: C.ink, fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {value}
                </motion.span>
                <div className="pb-2 flex flex-col items-start gap-1.5">
                    <span className="text-[12px] font-extrabold tracking-[0.20em]" style={{ color: 'rgba(22,20,21,0.50)' }}>
                        趟／週
                    </span>
                    <motion.span
                        key={profile.tag}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[11px] font-black tracking-[0.16em] px-2 py-[3px] rounded-full"
                        style={{ background: `${toneColor}22`, color: toneColor, border: `1px solid ${toneColor}55` }}
                    >
                        {profile.tag}
                    </motion.span>
                </div>
            </div>

            {/* 滑桿 */}
            <div className="relative mt-6 px-1">
                {/* 軌道 */}
                <div className="relative h-11 flex items-center">
                    <div className="absolute left-0 right-0 h-[6px] rounded-full" style={{ background: 'rgba(22,20,21,0.08)' }} />
                    <motion.div
                        className="absolute left-0 h-[6px] rounded-full"
                        animate={{ width: `${pct}%` }}
                        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                        style={{
                            background: `linear-gradient(90deg, #8BC34A 0%, ${toneColor} 100%)`,
                            boxShadow: `0 0 10px ${toneColor}66`,
                        }}
                    />
                    {/* 建議上限刻度 */}
                    {safeMax < SESSION_MAX && (
                        <div
                            className="absolute pointer-events-none"
                            style={{
                                left: `${((safeMax - SESSION_MIN) / (SESSION_MAX - SESSION_MIN)) * 100}%`,
                                width: 2, height: 16, background: 'rgba(249,92,75,0.45)', borderRadius: 2,
                            }}
                        />
                    )}
                    {/* 拇指 */}
                    <motion.div
                        className="absolute rounded-full pointer-events-none flex items-center justify-center"
                        animate={{ left: `calc(${pct}% - 15px)` }}
                        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                        style={{
                            width: 30, height: 30,
                            background: 'linear-gradient(150deg, #FFFFFF 0%, #EFE9DE 100%)',
                            border: '1px solid rgba(255,255,255,1)',
                            boxShadow: `0 4px 12px rgba(22,20,21,0.22), inset 0 1px 1px rgba(255,255,255,1), 0 0 0 3px ${toneColor}22`,
                        }}
                    >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: toneColor }} />
                    </motion.div>

                    <input
                        type="range"
                        min={SESSION_MIN}
                        max={SESSION_MAX}
                        step={1}
                        value={value}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v !== value) { haptic('light'); onChange(v); }
                        }}
                        aria-label="每週跑步次數"
                        className="absolute inset-0 w-full opacity-0 cursor-pointer"
                        style={{ height: 44 }}
                    />
                </div>

                {/* 刻度 */}
                <div className="flex justify-between px-[2px] mt-0.5">
                    {Array.from({ length: SESSION_MAX - SESSION_MIN + 1 }, (_, i) => i + SESSION_MIN).map((n) => (
                        <motion.button {...pressProps('icon')}
 key={n}
 onClick={() => { haptic('light'); onChange(n); }}
 className="text-[11px] font-bold tabular-nums"
 style={{ color: n === value ? C.ink : 'rgba(22,20,21,0.28)', width: 20 }}
 >
                            {n}
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* 即時回饋卡 */}
            <motion.div
                key={value}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="mt-5 rounded-[22px] p-4 relative overflow-hidden"
                style={{
                    background: 'linear-gradient(150deg, #FBFAF8 0%, #F3EEE6 58%, #ECE4D7 100%)',
                    border: '1px solid rgba(255,255,255,0.92)',
                    boxShadow: '0 10px 24px -14px rgba(22,20,21,0.18), inset 0 1px 0 rgba(255,255,255,1)',
                }}
            >
                <span className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: toneColor, opacity: 0.85 }} />
                <div className="pl-2">
                    {/* 你的一週會長這樣 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                        {Array.from({ length: value }).map((_, i) => (
                            <motion.span
                                key={`run${i}`}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: i * 0.04, type: 'spring', stiffness: 420, damping: 22 }}
                                className="text-[12px] font-black tracking-[0.1em] px-2 py-1 rounded-full"
                                style={{ background: 'rgba(139,195,74,0.18)', color: '#4E6B39', border: '1px solid rgba(139,195,74,0.36)' }}
                            >
                                跑
                            </motion.span>
                        ))}
                        {includeStrength && (
                            <motion.span
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: value * 0.04, type: 'spring', stiffness: 420, damping: 22 }}
                                className="text-[12px] font-black tracking-[0.1em] px-2 py-1 rounded-full"
                                style={{ background: 'rgba(92,107,192,0.16)', color: '#4A57A8', border: '1px solid rgba(92,107,192,0.34)' }}
                            >
                                重訓
                            </motion.span>
                        )}
                        <span className="text-[11px] font-bold ml-auto tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>
                            約 {hrs > 0 ? `${hrs} 小時 ` : ''}{mins > 0 ? `${mins} 分` : ''}／週
                        </span>
                    </div>

                    <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.66)' }}>
                        {profile.line}
                    </p>

                    <AnimatePresence>
                        {overLevel && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="flex items-start gap-2 overflow-hidden"
                            >
                                <Activity size={13} strokeWidth={2.4} color={C.coral} className="shrink-0 mt-[2px]" />
                                <p className="text-[11px] font-semibold leading-relaxed m-0" style={{ color: C.coral }}>
                                    以你目前的程度，建議先從每週 {safeMax} 次以內開始。
                                    可以選，但引擎會把強度往下壓，並且更嚴格地盯恢復。
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};

const StepCadence = ({
    sessionsPerWeek, currentLevel, includeStrength, strengthDays = 0, weeklyLoad = null,
    runDayPlan = null,
    onChangeSessions, onChangeLevel, onChangeStrength, onSeeStrengthPlan,
}) => {
    return (
    <motion.div
        custom={1}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        className="px-6 pb-6"
    >
        {/* sub 原本寫「拖動看看 — 每個次數會得到什麼，下面即時算給你」：
            教使用者怎麼操作、講系統會做什麼，兩件都不該寫在畫面上。 */}
        <SectionDisplay
            kicker="每週訓練節奏"
            heading="每週跑幾次？"
        />

        {/* ★ v2.3 頻率滑桿（1–7）＋ 即時回饋 */}
        <SessionSlider
            value={sessionsPerWeek}
            level={currentLevel}
            includeStrength={includeStrength}
            onChange={onChangeSessions}
        />

        {/* 🧱 這裡以前是三個各自為政的小方塊：「預定排在哪幾天」「跨系統負荷提醒」
            「重訓已排 N 天」。三塊講的都是同一件事 —— 你這一週會長什麼樣 ——
            卻分散在三個框裡，使用者不知道要看哪一個。併成一塊。
            排出來的日子與警告都是中控台同一支 buildWeeklyAgenda 算的。 */}
        <WeekShapeCard
            runDayPlan={runDayPlan}
            weeklyLoad={weeklyLoad}
            strengthDays={strengthDays}
            includeStrength={includeStrength}
            onChangeStrength={onChangeStrength}
            onSeeStrengthPlan={onSeeStrengthPlan}
        />

        {/* level */}
        <SectionLabel className="mt-10">你的程度</SectionLabel>
        <div className="mt-3 flex flex-col gap-2">
            {LEVELS.map((l) => {
                const active = l.id === currentLevel;
                return (
                    <motion.button {...pressProps('card')}
 key={l.id}
 onClick={() => onChangeLevel(l.id)}
 className="w-full rounded-[18px] px-5 py-4 flex items-center justify-between relative overflow-hidden"
 style={{
 background: active
 ? 'linear-gradient(135deg, #FFFFFF 0%, #EFEBE3 100%)'
 : 'transparent',
 border: active
 ? '1px solid rgba(22,20,21,0.10)'
 : '1px dashed rgba(22,20,21,0.18)',
 boxShadow: active
 ? '0 6px 14px rgba(22,20,21,0.06), inset 0 2px 4px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,1)'
 : 'none',
 }}
 >
                        <div className="flex items-center gap-3 text-left">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                    background: active ? C.coral : C.sand,
                                    boxShadow: active ? '0 0 0 3px rgba(249,92,75,0.16)' : 'none',
                                }}
                            />
                            <div>
                                <div
                                    className="text-[15px] font-semibold"
                                    style={{ color: C.ink }}
                                >
                                    {l.label}
                                </div>
                                <div
                                    className="text-[11px] tracking-[0.12em] mt-0.5 font-bold"
                                    style={{ color: 'rgba(22,20,21,0.45)' }}
                                >
                                    {l.desc}
                                </div>
                            </div>
                        </div>
                        {/* 原本這裡印引擎的倍率「×0.55」—— 那是寫給自己看的參數，
                            使用者看不出它代表什麼。左邊的「跑步不足 3 個月」才是他認得的。 */}
                        {active && <Check size={16} strokeWidth={3} color={C.coral} />}
                    </motion.button>
                );
            })}
        </div>

        {/* strength toggle */}
        <SectionLabel className="mt-10">重訓交叉訓練</SectionLabel>
        <motion.button {...pressProps('card')}
 onClick={() => onChangeStrength(!includeStrength)}
 className="w-full mt-3 rounded-[18px] px-5 py-4 flex items-center justify-between relative overflow-hidden"
 style={{
 background: 'linear-gradient(135deg, #FFFFFF 0%, #EFEBE3 100%)',
 border: '1px solid rgba(22,20,21,0.10)',
 boxShadow: '0 6px 14px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 >
            <div className="flex items-center gap-3 text-left">
                <Layers size={18} strokeWidth={1.8} color={C.ink} />
                <div>
                    <div className="text-[14px] font-semibold" style={{ color: C.ink }}>
                        {includeStrength ? '每週加入重訓' : '略過重訓'}
                    </div>
                    <div
                        className="text-[12px] tracking-[0.18em] mt-0.5 font-bold"
                        style={{ color: 'rgba(22,20,21,0.45)' }}
                    >
                        預防受傷 · 提升跑步效率
                    </div>
                </div>
            </div>
            <div
                className="w-12 h-7 rounded-full relative transition-colors"
                style={{
                    background: includeStrength
                        ? 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)'
                        : C.sand,
                }}
            >
                <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 700, damping: 30 }}
                    className="absolute top-[2px] w-6 h-6 rounded-full bg-white"
                    style={{
                        left: includeStrength ? 22 : 2,
                        boxShadow: '0 2px 5px rgba(22,20,21,0.30)',
                    }}
                />
            </div>
        </motion.button>

    </motion.div>
    );
};

/* ════════════════════════════════════════════════════════════════════
   WeekShapeCard —— 「你這一週會長什麼樣」
   ────────────────────────────────────────────────────────────────────
   一塊，回答一件事。裡面依序是：排在哪幾天 → 練什麼 → 有什麼衝突 → 怎麼解。
   沒有資料就整塊不渲染（不畫空的星期、不寫「尚未排定」）。
   ════════════════════════════════════════════════════════════════════ */
const WeekShapeCard = ({ runDayPlan, weeklyLoad, strengthDays = 0, includeStrength, onChangeStrength, onSeeStrengthPlan }) => {
    const days = runDayPlan?.days || [];
    const clash = strengthDays > 0 && includeStrength;
    // 每一條都是真的衝突，重複的只留一條
    const notes = [...new Set([
        ...(runDayPlan?.warnings || []),
        ...(strengthDays > 0 && weeklyLoad && weeklyLoad.severity !== 'ok' ? [weeklyLoad.message] : []),
        ...(clash ? [`重訓系統每週已排 ${strengthDays} 天，這裡再加等於同一組肌肉練兩輪。`] : []),
    ].filter(Boolean))];

    if (!days.length && !notes.length) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 rounded-[18px] p-4"
            style={{
                background: notes.length ? 'rgba(249,92,75,0.07)' : 'rgba(22,20,21,0.04)',
                border: `1px solid ${notes.length ? 'rgba(249,92,75,0.28)' : 'rgba(22,20,21,0.10)'}`,
            }}
        >
            {days.length > 0 && (
                <>
                    <p className="text-[12.5px] font-bold m-0" style={{ color: C.ink }}>
                        預定排在 {days.map((d) => `週${d.label}`).join(' · ')}
                    </p>
                    <p className="text-[11px] m-0 mt-1" style={{ color: 'rgba(22,20,21,0.62)' }}>
                        {days.map((d) => runTypeZh(d.type)).join(' · ')}
                    </p>
                    {/* 已經有重訓計劃 → 七天格子把重訓跟跑步排在一起看（同一支 buildWeeklyAgenda） */}
                    {strengthDays > 0 && Array.isArray(runDayPlan?.week) && (
                        <WeekScheduleStrip week={runDayPlan.week} />
                    )}
                </>
            )}

            {notes.map((n) => (
                <div key={n} className="flex items-start gap-2 mt-2">
                    <Shield size={13} strokeWidth={2.4} color={C.coral} className="shrink-0 mt-[2px]" />
                    <p className="text-[11px] font-bold m-0" style={{ color: '#D94030' }}>{n}</p>
                </div>
            ))}

            {clash && (
                <div className="flex gap-2 mt-3 flex-wrap">
                    <motion.button {...pressProps('row')}
                        onClick={() => { haptic('light'); onChangeStrength(false); }}
                        className="rounded-[10px] px-3 py-2 text-[11.5px] font-extrabold"
                        style={{ background: C.ink, color: '#F6F4F1', border: 'none' }}
                    >
                        略過這裡的重訓
                    </motion.button>
                    {onSeeStrengthPlan && (
                        <motion.button {...pressProps('row')}
                            onClick={() => { haptic('light'); onSeeStrengthPlan(); }}
                            className="rounded-[10px] px-3 py-2 text-[11.5px] font-extrabold"
                            style={{
                                background: 'transparent', color: 'rgba(22,20,21,0.70)',
                                border: '1px solid rgba(22,20,21,0.25)',
                            }}
                        >
                            看重訓計劃
                        </motion.button>
                    )}
                </div>
            )}
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// STEP 3 — BASELINE  (★ 漸進式超負荷的科學基礎)
// ════════════════════════════════════════════════════════════════════

/* 5K 完賽時間選項（分鐘）→ 每公里秒數（5K pace × ~1.2 倍 = 訓練 easy pace 基礎）
   ⚠️ id 是必要的：最後兩個選項的 paceSec 都是 null，用配速當鍵會把
      「還跑不到 5K」認成「未測過」—— 這兩種人該拿到完全不同的課表。
   canRun5k：true = 跑得完、false = 跑不完、null = 不知道（未測過）。 */
const FIVE_K_OPTIONS = [
    { id: 'sub20',   label: '< 20 分鐘',    finishMin: 19,   paceSec: Math.round((19 * 60) / 5), canRun5k: true },  // ~228s
    { id: 'm20_25',  label: '20–25 分鐘',   finishMin: 22,   paceSec: Math.round((22 * 60) / 5), canRun5k: true },  // ~264s
    { id: 'm25_30',  label: '25–30 分鐘',   finishMin: 27,   paceSec: Math.round((27 * 60) / 5), canRun5k: true },  // ~324s
    { id: 'm30_35',  label: '30–35 分鐘',   finishMin: 32,   paceSec: Math.round((32 * 60) / 5), canRun5k: true },  // ~384s
    { id: 'm35_40',  label: '35–40 分鐘',   finishMin: 37,   paceSec: Math.round((37 * 60) / 5), canRun5k: true },  // ~444s
    { id: 'm40_50',  label: '40–50 分鐘',   finishMin: 44,   paceSec: Math.round((44 * 60) / 5), canRun5k: true },  // ~528s
    { id: 'over50',  label: '> 50 分鐘',    finishMin: 52,   paceSec: Math.round((52 * 60) / 5), canRun5k: true },  // ~624s
    { id: 'under5k', label: '我還跑不到 5K', finishMin: null, paceSec: null, canRun5k: false },
    { id: 'untested', label: '未測過 5K',   finishMin: null, paceSec: null, canRun5k: null },
];
const fiveKOption = (id) => FIVE_K_OPTIONS.find((o) => o.id === id) || null;

// 10% Rule 警示：當使用者增加的量超過多少時顯示
const KM_STEP = 5;

const StepBaseline = ({ goal, currentWeeklyKm, baselinePace5K, pace5kId = null, onChangeWeeklyKm, onChangePace5K, touchedKm = false, touchedPace = false }) => {
    // 沒主動選過 → 不點亮任何一個 5K 區間（含「未測過」），逼使用者做出選擇
    const selectedPaceOption = touchedPace ? fiveKOption(pace5kId) : null;

    const formatKmDisplay = (km) => `${km} km`;
    const formatPaceLabel = (sec) => {
        if (!sec) return null;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}'${String(s).padStart(2, '0')}"/km`;
    };

    // easy pace ≈ 5K pace + 90秒（Daniels E 區）—— 與引擎同一份偏移
    const easyPaceSec = baselinePace5K ? baselinePace5K + PACE_SHIFT_BY_SUBTYPE.easy : null;

    return (
        <motion.div
            custom={1}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="px-6 pb-6"
        >
            <SectionDisplay
                kicker="體能基準線"
                heading="告訴我你現在在哪。"
                sub="讓引擎從你真實的訓練量出發，而不是憑空規劃。這是漸進式超負荷的第一步。"
            />

            {/* ── 目前週跑量 ────────────────────────────── */}
            <SectionLabel className="mt-9">目前平均週跑量</SectionLabel>
            <div className="mt-4">
                {/* 大數字顯示 */}
                <div className="flex items-end justify-center gap-3 mb-6">
                    <span
                        className="font-light"
                        style={{ fontSize: 96, letterSpacing: '-0.04em', lineHeight: 0.85, color: C.ink, fontVariantNumeric: 'tabular-nums' }}
                    >
                        {currentWeeklyKm}
                    </span>
                    <span className="font-extrabold tracking-[0.04em] uppercase pb-3" style={{ fontSize: 13, color: 'rgba(22,20,21,0.50)' }}>km/週</span>
                </div>

                {/* 加減按鈕 */}
                <div className="flex items-center gap-4 justify-center">
                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => onChangeWeeklyKm(Math.max(0, currentWeeklyKm - KM_STEP))}
                        className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95"
                        style={{
                            background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)',
                            border: '1px solid rgba(255,255,255,0.85)',
                            boxShadow: '0 4px 10px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
                        }}
                    >
                        <Minus size={20} strokeWidth={2.4} color={C.ink} />
                    </motion.button>

                    {/* 滑桿 */}
                    <div className="flex-1 relative">
                        <input
                            type="range"
                            min={0}
                            max={150}
                            step={KM_STEP}
                            value={currentWeeklyKm}
                            onChange={(e) => onChangeWeeklyKm(parseInt(e.target.value))}
                            className="w-full appearance-none h-2 rounded-full outline-none"
                            style={{
                                background: `linear-gradient(to right, ${C.coral} 0%, ${C.coral} ${(currentWeeklyKm / 150) * 100}%, rgba(22,20,21,0.12) ${(currentWeeklyKm / 150) * 100}%, rgba(22,20,21,0.12) 100%)`,
                                cursor: 'pointer',
                            }}
                        />
                    </div>

                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => onChangeWeeklyKm(Math.min(150, currentWeeklyKm + KM_STEP))}
                        className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95"
                        style={{
                            background: 'linear-gradient(135deg, #2A2724 0%, #161415 100%)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 10px 22px -10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
                        }}
                    >
                        <Plus size={20} strokeWidth={2.4} color={C.paper} />
                    </motion.button>
                </div>

                {/* 刻度標籤 */}
                <div className="flex justify-between mt-2 px-1">
                    {[0, 30, 60, 90, 120, 150].map(v => (
                        <span key={v} className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.35)' }}>{v}</span>
                    ))}
                </div>

                {/* ★ v2.3：整份計劃都建立在這個數字上，所以一定要使用者親口確認。
                    數字剛好對的人不會去動滑桿，需要一個明確的「就是這個」。 */}
                <AnimatePresence>
                    {!touchedKm && (
                        <motion.button
                            initial={{ opacity: 0, y: 8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -6, height: 0 }}
                            onClick={() => { haptic('medium'); onChangeWeeklyKm(currentWeeklyKm); }}
                            className="w-full mt-5 h-11 rounded-full flex items-center justify-center gap-2 active:scale-[0.98] transition-transform overflow-hidden"
                            style={{
                                background: 'rgba(249,92,75,0.10)',
                                border: '1px solid rgba(249,92,75,0.34)',
                                color: C.coral,
                                letterSpacing: '0.14em',
                                fontWeight: 800,
                                fontSize: 11,
                            }}
                        >
                            <Check size={14} strokeWidth={3} />
                            我目前就是每週 {currentWeeklyKm} 公里
                        </motion.button>
                    )}
                </AnimatePresence>

                {/* 新手全馬受傷風險警示 */}
                <AnimatePresence>
                    {currentWeeklyKm === 0 && (
                        <motion.p
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="text-center text-[11px] mt-4 leading-relaxed" style={{ color: 'rgba(22,20,21,0.55)' }}
                        >
                            選 0 代表你是完全的新手跑者，引擎會從最保守的起點開始。
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>

            {/* ── 全馬低跑量受傷風險警示 (Injury Risk Guard) ── */}
            <AnimatePresence>
                {goal === 'race_full' && currentWeeklyKm < 30 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-5 rounded-[18px] px-5 py-4 overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, rgba(249,92,75,0.08) 0%, rgba(217,64,48,0.05) 100%)',
                            border: '1px solid rgba(249,92,75,0.25)',
                        }}
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(249,92,75,0.15)' }}>
                                <span style={{ color: C.coral, fontSize: 11, fontWeight: 900 }}>!</span>
                            </div>
                            <div>
                                <div className="text-[12px] font-extrabold tracking-[0.04em] mb-1" style={{ color: C.coral }}>受傷風險偵測</div>
                                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.70)' }}>
                                    引擎偵測到當前跑量較低。直接挑戰全馬可能有較高受傷風險，建議先以「有氧基礎」或「半馬」為目標，建立足夠的週跑量後再升級挑戰。
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── 5K 測驗配速 ────────────────────────────── */}
            <SectionLabel className="mt-10">最近一次 5K 完賽時間</SectionLabel>
            {/* 這一步使用者只需要知道「填什麼」。機制（怎麼推算配速）收在 ? 裡。 */}
            <p className="text-[11px] font-semibold mt-2 mb-4" style={{ color: 'rgba(22,20,21,0.55)' }}>
                不確定就選最接近的，之後會依實際表現修正。
            </p>
            <div className="flex flex-col gap-2">
                {FIVE_K_OPTIONS.map((opt) => {
                    const active = selectedPaceOption?.id === opt.id;
                    return (
                        <motion.button
                            key={opt.label}
                            whileTap={{ scale: 0.985 }}
                            onClick={() => onChangePace5K(opt)}
                            className="w-full text-left rounded-[18px] px-5 py-4 flex items-center justify-between relative overflow-hidden"
                            style={{
                                background: active
                                    ? 'linear-gradient(155deg, #232120 0%, #161415 100%)'
                                    : 'linear-gradient(150deg, #FBFAF8 0%, #F3EEE6 55%, #ECE4D7 100%)',
                                color: active ? C.paper : C.ink,
                                border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.85)',
                                boxShadow: active
                                    ? '0 10px 22px -10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)'
                                    : '0 4px 10px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
                                transition: 'background 0.3s ease, color 0.3s ease',
                            }}
                        >
                            {/* sheen */}
                            <span className="absolute inset-0 pointer-events-none" style={{ background: active ? 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.06) 47%, transparent 60%)' : 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 47%, transparent 60%)', mixBlendMode: active ? 'screen' : 'overlay', opacity: 0.45 }} />

                            <span className="text-[15px] font-semibold relative z-10" style={{ color: active ? C.paper : C.ink }}>{opt.label}</span>

                            {opt.paceSec && (
                                <div className="relative z-10 text-right">
                                    <div className="text-[11px] font-extrabold tracking-[0.18em] uppercase" style={{ color: active ? 'rgba(246,244,241,0.5)' : 'rgba(22,20,21,0.40)' }}>Easy Pace</div>
                                    <div className="text-[13px] font-black" style={{ color: active ? C.coral : C.ink }}>
                                        {formatPaceLabel(opt.paceSec + PACE_SHIFT_BY_SUBTYPE.easy)}
                                    </div>
                                </div>
                            )}

                            {active && (
                                <motion.div
                                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 ml-3 relative z-10"
                                    style={{ background: 'rgba(246,244,241,0.10)', border: '1px solid rgba(246,244,241,0.20)' }}
                                >
                                    <Check size={12} strokeWidth={3} color={C.coral} />
                                </motion.div>
                            )}
                        </motion.button>
                    );
                })}
            </div>

            {/* Easy Pace 預覽 / RPE Empty State */}
            <AnimatePresence mode="popLayout">
                {easyPaceSec ? (
                    <motion.div
                        key="pace-preview"
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-6 rounded-[24px] p-4 flex items-center gap-4"
                        style={{
                            background: 'rgba(228,222,210,0.45)',
                            backdropFilter: 'blur(20px)',
                            borderTop: '1.5px solid rgba(246,244,241,0.9)',
                            borderBottom: '1px solid rgba(207,198,184,0.3)',
                            boxShadow: '0 8px 24px -6px rgba(22,20,21,0.08), inset 0 2px 4px rgba(246,244,241,0.6)',
                        }}
                    >
                        <div className="flex-1">
                            <div className="text-[12px] font-extrabold tracking-[0.04em] mb-1" style={{ color: 'rgba(22,20,21,0.50)' }}>引擎將使用的配速區間</div>
                            <div className="flex items-center gap-3 flex-wrap">
                                {[
                                    // 「引擎將使用的配速」就要是引擎真的用的那一份（cardioPrescription.PACE_SHIFT_BY_SUBTYPE）
                                    { label: '恢復', pace: baselinePace5K + PACE_SHIFT_BY_SUBTYPE.recovery, color: '#FDD835' },
                                    { label: '輕鬆', pace: baselinePace5K + PACE_SHIFT_BY_SUBTYPE.easy, color: '#8BC34A' },
                                    { label: '節奏', pace: baselinePace5K + PACE_SHIFT_BY_SUBTYPE.tempo, color: '#FF9800' },
                                    { label: '間歇', pace: baselinePace5K + PACE_SHIFT_BY_SUBTYPE.interval, color: '#F06292' },
                                ].map(({ label, pace, color }) => (
                                    <div key={label} className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                        <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.6)' }}>{label}</span>
                                        <span className="text-[11px] font-extrabold font-mono" style={{ color: C.ink }}>{formatPaceLabel(pace)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="rpe-empty"
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-6 rounded-[24px] p-5"
                        style={{
                            background: 'rgba(22,20,21,0.06)',
                            border: '1px dashed rgba(22,20,21,0.18)',
                        }}
                    >
                        <div className="text-[12px] font-extrabold tracking-[0.04em] mb-2" style={{ color: 'rgba(22,20,21,0.45)' }}>RPE 體感模式啟動</div>
                        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.60)' }}>
                            由於缺乏基準配速，引擎將以 <strong>RPE 自詪費力程度</strong>為主來引導你的訓練。你可以隨時在計劃中補上測驗成績來解鎖精準配速區間。
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// STEP 4 — PREVIEW
// ════════════════════════════════════════════════════════════════════
const StepPreview = ({ plan, onSwitchGoal, onExplain }) => {
    const summary = useMemo(() => inspectPlan(plan), [plan]);
    const stagedPath = useMemo(() => {
        try { return planStagedPath(plan); }
        catch (e) { console.warn('[StagedPath] failed:', e?.message); return null; }
    }, [plan]);
    // ★ v2.3 單一真相源：所有彙總一律讀 meta.totals，各頁不再自己加總
    const T = plan.meta?.totals || {};
    const peakKm = T.peak_km ?? 0;
    const startKm = T.start_km ?? null;

    // ★ 圖九：完成這個計劃之後預期的提升（有數字、標明確定 vs 預估）
    const [weightKg, setWeightKg] = useState(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { uStorage } = await import('../utils/userStorage');
                const cache = uStorage(getUserId()).get('user_profile_cache', {}) || {};
                const w = Number(cache.weight_kg || cache.weight || cache.current_weight || 0);
                if (alive && w > 30 && w < 250) setWeightKg(w);
            } catch { /* 沒有體重資料 → 用通用值推算 */ }
        })();
        return () => { alive = false; };
    }, []);

    const outcome = useMemo(
        () => projectPlanOutcome(plan, { weightKg }),
        [plan, weightKg],
    );

    return (
        <motion.div
            custom={1}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="px-6 pb-6"
        >
            {/* ★ v2.3 專屬計劃生成完成 —— 這是整個流程的高潮，值得一個真正的揭示 */}
            <PlanRevealHero plan={plan} />

            {/* ★ v2.0 安全警示：例如基準線太低卻選了半馬/全馬 —
                誠實告訴使用者「這週期內安全爬得到哪」，並給替代建議 */}
            {plan.meta?.safety_flags?.length > 0 && (
                <div className="mt-5 flex items-start gap-3 px-4 py-3 rounded-[16px]"
                    style={{
                        background: 'rgba(249,92,75,0.09)',
                        border: '1px solid rgba(249,92,75,0.30)',
                    }}>
                    <span style={{ fontSize: 15, lineHeight: '20px', flexShrink: 0 }}>⚠️</span>
                    <p className="text-[12px] font-semibold leading-relaxed m-0" style={{ color: C.ink, opacity: 0.85 }}>
                        {/* 週數、峰值、最長一趟可能同時不足 —— 每一條都要講，建議只在最後一句 */}
                        {plan.meta.safety_flags.map((f) => f.message).join('')}
                    </p>
                </div>
            )}

            {/* ★ v2.2 分期路徑 —— 「到不了」後面必須接「但這是走過去的路」。
                只講前半句會勸退人；補上完整路徑，目標就從幻想變成行程表。 */}
            <StagedPathCard path={stagedPath} onSwitchGoal={onSwitchGoal} />

            {/* ── Headline metrics ─────────────────────
                 ★ v2.3 拿掉卡片框：三個數字之間只用髮絲線分隔。
                   數字放大、標籤縮到最小 —— 一眼看完，不用讀小字。
                 ★ 全部讀 meta.totals，不再各頁自己加總（6 km vs 6.1 km 的來源） */}
            <motion.div
                className="mt-8 flex items-stretch"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { delayChildren: 0.55, staggerChildren: 0.09 } } }}
                style={{ borderTop: SWISS.hairline, borderBottom: SWISS.hairline }}
            >
                <MetricCard label="週數" value={plan.total_weeks} unit="週" first />
                <MetricCard label="出門" value={T.total_run_sessions + T.total_strength_sessions} unit="次" />
                <MetricCard label="總公里" value={T.total_km} unit="km" />
            </motion.div>

            {/* ══ 完成後預期的提升（圖九核心）══════════════════════ */}
            <OutcomeForecast outcome={outcome} />

            {/* ── Mileage curve ──────────────────────── */}
            <SectionLabel className="mt-9">里程曲線</SectionLabel>
            <MileageCurve summary={summary} peakKm={peakKm} startKm={startKm} plan={plan} />

            {/* ── Week list — Mist 冷灰地面，暖 Paper 列上浮（溫度分層） ── */}
            <SectionLabel className="mt-9">週次明細</SectionLabel>
            <div className="mt-3 rounded-[24px] p-3 flex flex-col gap-2" style={{ background: '#E8E9E6' }}>
                {plan.weeks.map((w) => (
                    <WeekRow key={w.week_index} week={w} />
                ))}
            </div>

            {/* ★ v2.3：DRVN 訓練哲學不再佔滿主流程 —— 收進「引擎替你考慮了什麼」。
                使用者在按下確認之前該想的是「我要不要做這件事」，不是讀論文。 */}
            <motion.button {...pressProps('row')}
 onClick={() => onExplain?.(plan)}
 className="w-full mt-10 h-12 rounded-full flex items-center justify-center gap-2"
 style={{
 background: 'rgba(22,20,21,0.045)',
 border: '1px solid rgba(22,20,21,0.10)',
 color: 'rgba(22,20,21,0.62)',
 letterSpacing: '0.10em', fontWeight: 800, fontSize: 11,
 }}
 >
                <span
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(22,20,21,0.08)', fontSize: 11, fontWeight: 900 }}
                >?</span>
                引擎替你考慮了什麼
            </motion.button>
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// EXPLAIN SHEET — 所有「系統其實有考慮到」的東西都收在這裡
// ────────────────────────────────────────────────────────────────────
// 主流程只講三件事：計劃長什麼樣、該用多少強度、會得到什麼效果。
// 漸進超負荷、ACWR、減量週、80/20、初學者保護、taper —— 這些機制
// 使用者不需要在做決定的當下讀懂，但必須查得到。
// ════════════════════════════════════════════════════════════════════
const PHILOSOPHY = [
    {
        icon: Battery, color: '#F95C4B', title: '80/20 黃金比例',
        body: '80% 輕鬆跑建構心肺底層，20% 高強度突破速度極限。不盲目追求疲勞，確保每一分力氣都花在刀口上。',
    },
    {
        icon: Mountain, color: '#FF9800', title: '科學化攀登',
        body: '從基礎期穩健起步，在巔峰期達到體能高點，備賽目標最後透過 taper 收水。這是一趟經過計算的體能攀登。',
    },
    {
        icon: Shield, color: '#5C6BC0', title: '智慧避震保護',
        body: '自動插入減量週，並嚴格控制單週高強度的次數與長跑占比，確保身體能持續吸收訓練，遠離傷痛。',
    },
];

const ExplainSheet = ({ plan, onClose }) => {
    const audit = plan?.meta?.mileage_audit;
    const explain = plan?.meta?.explain || [];

    return (
        <motion.div
            className="fixed inset-0 z-[100200] flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ background: 'rgba(22,20,21,0.55)', backdropFilter: 'blur(6px)' }}
        >
            <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 34 }}
                className="w-full max-h-[86vh] overflow-y-auto relative"
                style={{
                    background: 'linear-gradient(180deg, #FBFAF8 0%, #F3EEE6 100%)',
                    borderTopLeftRadius: 32, borderTopRightRadius: 32,
                    boxShadow: '0 -20px 50px rgba(0,0,0,0.30)',
                    paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
                }}
            >
                <div className="sticky top-0 z-10 pt-3 pb-3 px-6"
                    style={{ background: 'linear-gradient(180deg, #FBFAF8 70%, rgba(251,250,248,0) 100%)' }}>
                    <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(22,20,21,0.16)' }} />
                    <h2 className="text-[24px] font-light tracking-[-0.02em]" style={{ color: C.ink }}>
                        引擎替你考慮了什麼
                    </h2>
                    <p className="text-[12px] mt-1" style={{ color: 'rgba(22,20,21,0.55)' }}>
                        這些機制在背景自動運作，你不必記住 — 但你有權知道。
                    </p>
                </div>

                <div className="px-6 pb-2 flex flex-col gap-2.5">
                    {explain.map((e, i) => (
                        <motion.div
                            key={e.code}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="rounded-[20px] p-4"
                            style={{
                                background: 'rgba(255,255,255,0.72)',
                                border: '1px solid rgba(207,198,184,0.5)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
                            }}
                        >
                            <div className="text-[13px] font-semibold mb-1" style={{ color: C.ink }}>{e.title}</div>
                            <p className="text-[11.5px] leading-relaxed m-0" style={{ color: 'rgba(22,20,21,0.62)' }}>{e.body}</p>
                        </motion.div>
                    ))}

                    {audit && (
                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + explain.length * 0.05, duration: 0.35 }}
                            className="rounded-[20px] p-4"
                            style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(207,198,184,0.5)' }}
                        >
                            <div className="text-[13px] font-semibold mb-2.5" style={{ color: C.ink }}>這份計劃的實際數字</div>
                            <div className="grid grid-cols-3 gap-2">
                                <MiniStat label="單週最大增幅" value={`+${audit.max_jump_pct}%`} limit="安全線 15%" ok={audit.max_jump_pct <= 15} />
                                <MiniStat label="ACWR 峰值" value={audit.max_acwr.toFixed(2)} limit="安全線 1.30" ok={audit.max_acwr <= 1.3} />
                                <MiniStat label="尖峰／起點" value={audit.peak_ratio ? `${audit.peak_ratio}×` : '—'} limit="建議 ≤ 3×" ok={!audit.peak_ratio || audit.peak_ratio <= 3} />
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* DRVN 訓練哲學（原本佔滿主流程，現在收在這裡） */}
                <div className="px-6 pt-4">
                    <SectionLabel>THE DRVN PHILOSOPHY</SectionLabel>
                    <div className="mt-3 flex flex-col gap-2.5">
                        {PHILOSOPHY.map((p, i) => (
                            <motion.div
                                key={p.title}
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                className="rounded-[24px] p-4 relative overflow-hidden"
                                style={{
                                    background: 'linear-gradient(155deg, #2A2724 0%, #1A1715 55%, #100E0D 100%)',
                                    borderTop: '1px solid rgba(207,198,184,0.25)',
                                    borderBottom: '1px solid rgba(0,0,0,0.4)',
                                    boxShadow: '0 12px 32px -18px rgba(22,20,21,0.5), inset 0 2px 4px rgba(246,244,241,0.05)',
                                }}
                            >
                                <div className="flex items-center gap-2.5 mb-1.5">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${p.color}26` }}>
                                        <p.icon size={14} color={p.color} />
                                    </div>
                                    <span className="text-[12px] font-extrabold tracking-[0.08em]" style={{ color: C.paper }}>{p.title}</span>
                                </div>
                                <p className="text-[11px] leading-relaxed ml-[38px] m-0" style={{ color: 'rgba(246,244,241,0.68)' }}>{p.body}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="px-6 pt-5">
                    <motion.button {...pressProps('row')}
 onClick={onClose}
 className="w-full h-12 rounded-full"
 style={{
 background: 'linear-gradient(135deg, #2A2724 0%, #161415 100%)',
 color: C.paper, letterSpacing: '0.2em', fontWeight: 800, fontSize: 12,
 }}
 >
                        知道了
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};

const MiniStat = ({ label, value, limit, ok }) => (
    <div className="rounded-[12px] px-2.5 py-2"
        style={{ background: ok ? 'rgba(139,195,74,0.10)' : 'rgba(249,92,75,0.10)', border: `1px solid ${ok ? 'rgba(139,195,74,0.30)' : 'rgba(249,92,75,0.30)'}` }}>
        <div className="text-[11px] font-black tracking-[0.12em] uppercase mb-1" style={{ color: 'rgba(22,20,21,0.45)' }}>{label}</div>
        <div className="text-[16px] font-light tabular-nums leading-none" style={{ color: ok ? C.ink : C.coral }}>{value}</div>
        <div className="text-[11px] font-bold mt-1" style={{ color: 'rgba(22,20,21,0.35)' }}>{limit}</div>
    </div>
);

// ════════════════════════════════════════════════════════════════════
// STAGED PATH — 「這期到不了，但這是走過去的路」
// ────────────────────────────────────────────────────────────────────
// 安全閘會讓低基準線的人拿不到半馬/全馬的準備量。誠實是對的，
// 但只說「到不了」會勸退人。這張卡把剩下的路一段一段攤開：
// 每一期練什麼、幾週、週量從哪到哪、總共多久 —
// 全部用真引擎模擬，不是安慰用的大餅。
// ════════════════════════════════════════════════════════════════════
const STAGE_ACCENTS = {
    aerobic_base: '#8BC34A',
    fat_loss:     '#FF9800',
    race_5k_10k:  '#F06292',
    race_half:    '#5C6BC0',
    race_full:    '#C9A227',
};

const StagedPathCard = ({ path, onSwitchGoal }) => {
    if (!path?.stages?.length) return null;
    const { stages, target, calendarWeeks, gapKm, reachable, recommendSwitch } = path;

    return (
        <motion.div
            className="mt-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { delayChildren: 0.08, staggerChildren: 0.07 } } }}
        >
            <SectionLabel>通往{target.short}的路徑</SectionLabel>

            {/* 標題塊 */}
            <motion.div
                variants={forecastItem}
                className="mt-3 rounded-[24px] px-5 py-4 relative overflow-hidden"
                style={{
                    background: 'linear-gradient(150deg, #232120 0%, #161415 60%, #1C1A18 100%)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 14px 30px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
            >
                <span
                    className="absolute pointer-events-none"
                    style={{
                        inset: -30,
                        background: `radial-gradient(50% 60% at 88% 8%, ${STAGE_ACCENTS[stages[stages.length - 1].goal]}33 0%, transparent 70%)`,
                    }}
                />
                {/* ⚠️ 這裡以前是「N 期 · 約 7.8 個月」＋ 右上角再一個「34 週」＋ 一整段摘要。
                       三個數字互搶主角，而 7.8 個月是 34÷4.345 算出來的 ——
                       使用者把下面每一期的週數加起來也湊不出 7.8，只會覺得這數字沒來由。
                       現在只留一個主角，單位跟下面每一期一致（週），加得出來才算數。 */}
                <div className="relative z-10">
                    <div className="flex items-center gap-2.5 mb-2">
                        <Mountain size={15} strokeWidth={2.2} color={C.coral} />
                        <span className="text-[12px] font-black tracking-[0.22em]" style={{ color: 'rgba(246,244,241,0.5)' }}>
                            還差 {gapKm} 公里／週
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-[36px] font-light leading-none tabular-nums" style={{ color: C.paper, letterSpacing: '-0.03em' }}>
                            {calendarWeeks}
                        </span>
                        <span className="text-[12px] font-black tracking-[0.18em]" style={{ color: 'rgba(246,244,241,0.5)' }}>
                            週 · 分 {stages.length} 期
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* 階梯 */}
            <div className="mt-3 relative">
                {/* 垂直連線 */}
                <div
                    className="absolute pointer-events-none"
                    style={{
                        left: 21, top: 26, bottom: 26, width: 2,
                        background: 'linear-gradient(180deg, rgba(207,198,184,0.7) 0%, rgba(207,198,184,0.25) 100%)',
                    }}
                />

                <div className="flex flex-col gap-2.5">
                    {stages.map((s) => {
                        const accent = STAGE_ACCENTS[s.goal] || C.sand;
                        return (
                            <motion.div
                                key={s.index}
                                variants={forecastItem}
                                className="relative flex items-start gap-3"
                            >
                                {/* 期數節點 */}
                                <div
                                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 relative z-10"
                                    style={{
                                        background: s.isCurrent
                                            ? 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)'
                                            : s.reachedTarget
                                                ? `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`
                                                : 'linear-gradient(150deg, #FBFAF8 0%, #EFE9DE 100%)',
                                        border: s.isCurrent || s.reachedTarget
                                            ? '1px solid rgba(255,255,255,0.35)'
                                            : '1px solid rgba(207,198,184,0.7)',
                                        boxShadow: s.isCurrent
                                            ? '0 6px 14px rgba(217,64,48,0.34)'
                                            : s.reachedTarget
                                                ? `0 6px 14px ${accent}55`
                                                : 'inset 0 1px 1px rgba(255,255,255,1)',
                                    }}
                                >
                                    {s.reachedTarget ? (
                                        <Trophy size={16} strokeWidth={2} color="#fff" />
                                    ) : (
                                        <span
                                            className="text-[15px] font-light tabular-nums"
                                            style={{ color: s.isCurrent ? '#fff' : C.ink }}
                                        >
                                            {s.index}
                                        </span>
                                    )}
                                </div>

                                {/* 內容 */}
                                <div
                                    className="flex-1 min-w-0 rounded-[20px] p-4 relative overflow-hidden"
                                    style={{
                                        background: s.isCurrent
                                            ? 'linear-gradient(150deg, #FFF7F5 0%, #FBEDE9 100%)'
                                            : 'linear-gradient(150deg, #FBFAF8 0%, #F3EEE6 58%, #ECE4D7 100%)',
                                        border: s.isCurrent
                                            ? '1px solid rgba(249,92,75,0.35)'
                                            : '1px solid rgba(255,255,255,0.92)',
                                        boxShadow: '0 8px 20px -14px rgba(22,20,21,0.18), inset 0 1px 0 rgba(255,255,255,1)',
                                    }}
                                >
                                    <span
                                        className="absolute left-0 top-0 bottom-0"
                                        style={{ width: 3, background: accent, opacity: 0.85 }}
                                    />
                                    <div className="pl-2">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="text-[14px] font-semibold" style={{ color: C.ink }}>
                                                {s.goalName}
                                            </span>
                                            <span
                                                className="text-[12px] font-black tracking-[0.14em] px-1.5 py-[2px] rounded-full"
                                                style={{ background: `${accent}1F`, color: accent, border: `1px solid ${accent}44` }}
                                            >
                                                {s.weeks} 週 · {s.levelName}
                                            </span>
                                            {s.isCurrent && (
                                                <span className="text-[12px] font-black tracking-[0.16em] px-1.5 py-[2px] rounded-full"
                                                    style={{ background: 'rgba(249,92,75,0.14)', color: C.coral }}>
                                                    現在這期
                                                </span>
                                            )}
                                        </div>

                                        {/* 週量：從 → 到 */}
                                        <div className="flex items-baseline gap-1.5 mb-1.5">
                                            <span className="text-[13px] font-light tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                                {s.startKm}
                                            </span>
                                            <ChevronRight size={11} strokeWidth={3} style={{ color: 'rgba(22,20,21,0.25)' }} />
                                            <span className="text-[22px] font-light tabular-nums leading-none" style={{ color: C.ink, letterSpacing: '-0.02em' }}>
                                                {s.peakKm}
                                            </span>
                                            <span className="text-[12px] font-black tracking-[0.16em]" style={{ color: 'rgba(22,20,21,0.42)' }}>
                                                km／週
                                            </span>
                                        </div>

                                        {/* 說明只留在「現在這期」—— 那是使用者這次真的會拿到的。
                                            後面幾期是模擬，用數字（週數、程度、週量從哪到哪）講就夠，
                                            四段小字疊在一起只會讓人不知道要看哪。 */}
                                        {s.isCurrent && (
                                            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.58)' }}>
                                                {s.why}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* 建議換第 1 期的目標 */}
            {recommendSwitch && onSwitchGoal && (
                <motion.div
                    variants={forecastItem}
                    className="mt-3 rounded-[20px] p-4"
                    style={{
                        background: 'rgba(139,195,74,0.10)',
                        border: '1px solid rgba(139,195,74,0.35)',
                    }}
                >
                    <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles size={13} strokeWidth={2.2} color="#5E7F45" />
                        <span className="text-[12px] font-black tracking-[0.20em]" style={{ color: '#5E7F45' }}>
                            更有效率的第 1 期
                        </span>
                    </div>
                    <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: 'rgba(22,20,21,0.62)' }}>
                        {recommendSwitch.why}
                    </p>

                    {/* 具體差距 —— 不是「比較好」，是「好多少」 */}
                    {recommendSwitch.gains?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {recommendSwitch.gains.map((g) => (
                                <span
                                    key={g}
                                    className="text-[11px] font-black tracking-[0.06em] px-2 py-1 rounded-full"
                                    style={{
                                        background: 'rgba(139,195,74,0.16)',
                                        color: '#4E6B39',
                                        border: '1px solid rgba(139,195,74,0.34)',
                                    }}
                                >
                                    {g}
                                </span>
                            ))}
                        </div>
                    )}

                    <motion.button {...pressProps('row')}
 onClick={() => onSwitchGoal(recommendSwitch.goal)}
 className="w-full h-10 rounded-full flex items-center justify-center gap-2"
 style={{
 background: 'linear-gradient(135deg, #8BC34A 0%, #6FA23A 100%)',
 color: '#fff',
 letterSpacing: '0.14em',
 fontWeight: 800,
 fontSize: 12,
 boxShadow: '0 6px 16px -6px rgba(111,162,58,0.5)',
 }}
 >
                        改成「{recommendSwitch.name}」
                        <ChevronRight size={13} strokeWidth={3} />
                    </motion.button>
                </motion.div>
            )}

            {/* 原本這裡寫「你按下去就會拿到這些數字，不是估計值」——
                對第 2 期之後根本不成立：那是模擬一個還沒發生的未來。
                不寫做不到的承諾，所以整句拿掉。 */}
            {!reachable && (
                <motion.p variants={forecastItem} className="text-[11px] font-semibold mt-3 px-1" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    第 2 期之後是模擬，實際會依你跑出來的成績重算。
                </motion.p>
            )}
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// OUTCOME FORECAST — 「完成這個計劃之後你會得到什麼」（圖九）
// ════════════════════════════════════════════════════════════════════
const OUTCOME_ICONS = {
    volume: TrendingUp,
    route: Route,
    lungs: Wind,
    pace: Gauge,
    trophy: Trophy,
    flame: Flame,
    heart: HeartPulse,
    calendar: Calendar,
};

const forecastContainer = {
    hidden: {},
    visible: { transition: { delayChildren: 0.12, staggerChildren: 0.075 } },
};

const forecastItem = {
    hidden: { opacity: 0, y: 22, filter: 'blur(6px)' },
    visible: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { type: 'spring', stiffness: 280, damping: 26, mass: 0.7 },
    },
};

const OutcomeForecast = ({ outcome }) => {
    if (!outcome?.items?.length) return null;

    return (
        <div className="mt-12">
            <motion.div
                variants={forecastContainer}
                initial="hidden"
                animate="visible"
            >
                {/* ★ v2.3 大字破框 —— 不再把最重要的一句話塞進小框裡 */}
                <motion.div variants={forecastItem} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={14} strokeWidth={2.4} color={C.coral} />
                        <span className="text-[12px] font-black tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.45)' }}>
                            預期成效
                        </span>
                        <div className="flex-1 h-px" style={{ background: C.sand, opacity: 0.7 }} />
                    </div>
                    <h2
                        className="font-light"
                        style={{ fontSize: 44, lineHeight: 1.02, letterSpacing: '-0.04em', color: C.ink }}
                    >
                        {outcome.weeksLabel}
                        <br />
                        <span style={{ color: C.coral }}>你將獲得</span>
                    </h2>
                    <p className="text-[12.5px] leading-relaxed mt-3" style={{ color: 'rgba(22,20,21,0.58)' }}>
                        每一項都附上數字與依據。「確定」是課表已經寫死的，「預估」是依運動科學文獻推算的。
                    </p>
                </motion.div>

                {/* 成效列表 */}
                <div className="flex flex-col gap-2.5">
                    {/* 沒體重就算不出消耗熱量，那一列會整個不見 —— 與其默默少一列，
                        不如在同一個位置講清楚缺什麼、點下去補得到。 */}
                    {outcome.missingWeightForKcal && (
                        <MissingDataRow gate={featureGate('runKcal', getUserId(), null)} />
                    )}
                    {outcome.items.map((it) => {
                        const Icon = OUTCOME_ICONS[it.icon] || Sparkles;
                        const certain = it.certainty === 'certain';
                        return (
                            <motion.div
                                key={it.key}
                                variants={forecastItem}
                                whileTap={{ scale: 0.985 }}
                                className="rounded-[22px] p-4 relative overflow-hidden"
                                style={{
                                    background: 'linear-gradient(150deg, #FBFAF8 0%, #F3EEE6 58%, #ECE4D7 100%)',
                                    border: '1px solid rgba(255,255,255,0.92)',
                                    boxShadow: '0 10px 24px -14px rgba(22,20,21,0.18), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 2px rgba(151,166,182,0.18)',
                                }}
                            >
                                {/* 類別色條 */}
                                <span
                                    className="absolute left-0 top-0 bottom-0"
                                    style={{ width: 3, background: it.accent, opacity: 0.8 }}
                                />

                                <div className="relative flex items-start gap-3.5 pl-2">
                                    <div
                                        className="w-9 h-9 rounded-[14px] flex items-center justify-center shrink-0"
                                        style={{
                                            background: `${it.accent}1F`,
                                            color: it.accent,
                                            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9)',
                                        }}
                                    >
                                        <Icon size={16} strokeWidth={2} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="text-[11px] font-black tracking-[0.06em]" style={{ color: 'rgba(22,20,21,0.62)' }}>
                                                {it.label}
                                            </span>
                                            <span
                                                className="text-[12px] font-black tracking-[0.14em] px-1.5 py-[2px] rounded-full"
                                                style={{
                                                    background: certain ? 'rgba(123,160,91,0.14)' : 'rgba(22,20,21,0.06)',
                                                    color: certain ? '#5E7F45' : 'rgba(22,20,21,0.45)',
                                                    border: `1px solid ${certain ? 'rgba(123,160,91,0.32)' : 'rgba(22,20,21,0.10)'}`,
                                                }}
                                            >
                                                {certain ? '確定' : '預估'}
                                            </span>
                                        </div>

                                        {/* from → to 大數字 */}
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            {it.from && (
                                                <>
                                                    <span
                                                        className="text-[15px] font-light tabular-nums"
                                                        style={{ color: 'rgba(22,20,21,0.38)', textDecoration: 'line-through', textDecorationThickness: 1 }}
                                                    >
                                                        {it.from}
                                                    </span>
                                                    <ChevronRight size={12} strokeWidth={3} style={{ color: 'rgba(22,20,21,0.25)' }} />
                                                </>
                                            )}
                                            <motion.span
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
                                                className="text-[26px] font-light tracking-[-0.03em] tabular-nums leading-none"
                                                style={{ color: C.ink }}
                                            >
                                                {it.to}
                                            </motion.span>
                                            {it.delta && (
                                                <span
                                                    className="text-[11px] font-black tracking-[0.06em] px-2 py-[3px] rounded-full"
                                                    style={{ background: `${it.accent}1A`, color: it.accent }}
                                                >
                                                    {it.delta}
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: 'rgba(22,20,21,0.56)' }}>
                                            {it.note}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* 誠實聲明 */}
                <motion.p
                    variants={forecastItem}
                    className="text-[11px] leading-relaxed mt-3 px-1"
                    style={{ color: 'rgba(22,20,21,0.42)' }}
                >
                    {outcome.disclaimer}
                </motion.p>
            </motion.div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ════════════════════════════════════════════════════════════════════

const SectionDisplay = ({ kicker, heading, sub }) => (
    <div className="pt-2">
        <div className="flex items-center gap-2 mb-3">
            <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: C.coral, boxShadow: '0 0 0 3px rgba(249,92,75,0.16)' }}
            />
            <span
                className="text-[11px] font-extrabold tracking-[0.22em] uppercase"
                style={{ color: 'rgba(22,20,21,0.50)' }}
            >
                {kicker}
            </span>
        </div>
        <h1
            className="font-light"
            style={{
                fontSize: 38,
                lineHeight: 1.02,
                letterSpacing: '-0.03em',
                color: C.ink,
            }}
        >
            {heading}
        </h1>
        {sub && (
            <p
                className="mt-2 text-[13px] leading-snug"
                style={{ color: 'rgba(22,20,21,0.62)' }}
            >
                {sub}
            </p>
        )}
    </div>
);

const SectionLabel = ({ children, className = '' }) => (
    <div className={className}>
        <div className="flex items-center gap-3">
            <span
                className="text-[11px] font-extrabold tracking-[0.22em] uppercase"
                style={{ color: 'rgba(22,20,21,0.50)' }}
            >
                {children}
            </span>
            <div className="flex-1 h-px" style={{ background: C.sand, opacity: 0.7 }} />
        </div>
    </div>
);

/* ★ v2.3 —— 不再是「卡片」。三個數字並排，只靠髮絲線分隔。
   小字壓到最小、大字放到最大，一眼看完不用讀說明。 */
const MetricCard = ({ label, value, unit, first = false }) => (
    <motion.div
        variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } },
        }}
        className="flex-1 flex flex-col items-center justify-center"
        style={{
            borderLeft: first ? 'none' : SWISS.hairline,
            padding: '18px 4px 20px',
        }}
    >
        <div className="flex items-baseline gap-1">
            <span
                className="font-light"
                style={{ fontSize: 44, letterSpacing: '-0.045em', lineHeight: 0.85, color: C.ink, fontVariantNumeric: 'tabular-nums' }}
            >
                {value}
            </span>
            {unit && (
                <span className="text-[11px] font-light" style={{ color: 'rgba(22,20,21,0.42)' }}>
                    {unit}
                </span>
            )}
        </div>
        <div className="text-[11px] font-extrabold tracking-[0.22em] uppercase mt-2.5" style={{ color: 'rgba(22,20,21,0.38)' }}>
            {label}
        </div>
    </motion.div>
);

/* ════════════════════════════════════════════════════════════════════
   PlanRevealHero — 「你的專屬計劃生成完成」
   DRVN 材質：曜石深板 + 拉絲金屬掃光 + 目標色氛圍燈。
   動畫是有敘事的：暗場 → 掃光 → 目標名浮現 → 數字落定。
   ════════════════════════════════════════════════════════════════════ */
const PlanRevealHero = ({ plan }) => {
    const goal = GOALS.find((g) => g.id === plan.goal) || GOALS[1];
    const T = plan.meta?.totals || {};

    return (
        <motion.div
            className="relative -mx-6 px-6 pt-6 pb-7 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            style={{
                background: 'linear-gradient(165deg, #2A2724 0%, #1A1715 48%, #100E0D 100%)',
                borderBottomLeftRadius: 36,
                borderBottomRightRadius: 36,
                boxShadow: '0 22px 48px -26px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
        >
            {/* 目標色氛圍燈 */}
            <motion.span
                className="absolute pointer-events-none"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    inset: -60,
                    background: `radial-gradient(46% 52% at 82% 6%, ${goal.accent}44 0%, transparent 70%)`,
                }}
            />
            {/* 拉絲金屬掃光 —— 只掃一次，像剛壓好的金屬件 */}
            <motion.span
                className="absolute inset-0 pointer-events-none"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 1.25, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
                style={{
                    background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0.03) 54%, transparent 64%)',
                    mixBlendMode: 'screen',
                }}
            />

            <div className="relative z-10">
                <motion.div
                    className="flex items-center gap-2 mb-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28, duration: 0.4 }}
                >
                    <motion.span
                        className="w-1.5 h-1.5 rounded-full"
                        animate={{ opacity: [1, 0.35, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ background: goal.accent, boxShadow: `0 0 8px ${goal.accent}` }}
                    />
                    <span className="text-[12px] font-black tracking-[0.22em]" style={{ color: 'rgba(246,244,241,0.52)' }}>
                        專屬計劃生成完成
                    </span>
                </motion.div>

                {/* 目標名 —— 大字，不包框 */}
                <motion.h1
                    className="font-light"
                    initial={{ opacity: 0, y: 22, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ delay: 0.34, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    style={{ fontSize: 46, lineHeight: 1.0, letterSpacing: '-0.035em', color: C.paper }}
                >
                    {goal.title}
                </motion.h1>

                <motion.p
                    className="text-[13px] mt-2 leading-snug"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.46, duration: 0.5 }}
                    style={{ color: 'rgba(246,244,241,0.62)' }}
                >
                    {plan.total_weeks} 週 · {goal.typeLabel} · {plan.meta?.planned_run_sessions ?? plan.sessions_per_week} 趟／週
                </motion.p>

                {/* 從哪裡出發 → 爬到哪裡 */}
                <motion.div
                    className="flex items-baseline gap-2.5 mt-5"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.58, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                    <span className="text-[20px] font-light tabular-nums" style={{ color: 'rgba(246,244,241,0.42)' }}>
                        {T.start_km}
                    </span>
                    <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.72, duration: 0.35 }}
                    >
                        <ChevronRight size={16} strokeWidth={3} color="rgba(246,244,241,0.35)" />
                    </motion.span>
                    <motion.span
                        className="font-light tabular-nums"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.76, type: 'spring', stiffness: 300, damping: 20 }}
                        style={{ fontSize: 40, lineHeight: 1, letterSpacing: '-0.04em', color: goal.accent }}
                    >
                        {T.peak_km}
                    </motion.span>
                    <span className="text-[12px] font-black tracking-[0.18em]" style={{ color: 'rgba(246,244,241,0.45)' }}>
                        km／週
                    </span>
                </motion.div>
            </div>
        </motion.div>
    );
};

const PHASE_COLORS = { base: '#8BC34A', build: '#FF9800', peak: '#F06292', taper: '#FDD835' };
const PHASE_LABELS = { base: '基礎', build: '建立', peak: '巔峰', taper: '減量' };

/* ════════════════════════════════════════════════════════════════════
   IntensityMixRow —— 「這份計劃不是只有里程」
   ────────────────────────────────────────────────────────────────────
   顯示順序固定由輕到重，使用者一眼看得出 80/20：輕鬆的佔多數、
   質量課是少數但存在。沒有課表就整列不渲染（不畫 0 堂）。
   ════════════════════════════════════════════════════════════════════ */
const MIX_ORDER = ['recovery', 'easy', 'long', 'medium', 'tempo', 'interval'];

const IntensityMixRow = ({ plan }) => {
    const mix = useMemo(() => (plan ? planIntensityMix(plan) : null), [plan]);
    if (!mix?.total) return null;
    const parts = MIX_ORDER
        .filter((t) => mix.counts[t] > 0)
        .map((t) => `${runTypeZh(t)} ${mix.counts[t]}`);
    // 排序表沒收到的課種也要出現，不然總堂數會對不起來
    Object.keys(mix.counts)
        .filter((t) => !MIX_ORDER.includes(t))
        .forEach((t) => parts.push(`${runTypeZh(t)} ${mix.counts[t]}`));

    return (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(207,198,184,0.7)' }}>
            <div className="text-[12px] font-extrabold tracking-[0.22em] mb-1.5" style={{ color: 'rgba(22,20,21,0.4)' }}>
                {plan.weeks?.length || 0} 週共 {mix.total} 堂
            </div>
            <div className="text-[12px] font-bold tabular-nums" style={{ color: C.ink }}>
                {parts.join(' · ')}
            </div>
        </div>
    );
};

const MileageCurve = ({ summary, peakKm, startKm = null, onExplain = null, plan = null }) => {
    /* ★ v2.1 — 負荷安全稽核：把「這條曲線你撐不撐得住」直接算給使用者看。
       單週增幅（相對上一個訓練週）與 ACWR（急性:慢性負荷比）是運動醫學
       判斷跑量爬太快的兩個標準指標。引擎已經把它壓在安全範圍內，
       這裡負責把結果攤開，不要讓人只能盲信一條漂亮的曲線。 */
    const audit = useMemo(
        () => auditWeeklyMileage(
            summary.map((w) => w.mileage),
            summary.map((w) => ({ isDeload: w.is_deload, phase: w.phase })),
        ),
        [summary],
    );
    const riskyWeeks = useMemo(
        () => new Set(audit.rows.filter((r) => r.risky).map((r) => r.week)),
        [audit],
    );
    const peakRatio = startKm > 0 ? peakKm / startKm : null;

    return (
        <div
            className="mt-3 rounded-[28px] p-5 relative overflow-hidden"
            style={{
                // 實體鈦金屬卡：暖金屬漸層＋bevel（淺底上半透明玻璃會隱形→改實體）
                background: 'linear-gradient(155deg, #FBFAF8 0%, #F2EDE4 60%, #E8E0D2 100%)',
                border: '1px solid rgba(255,255,255,0.9)',
                boxShadow: '0 16px 36px -16px rgba(22,20,21,0.20), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 2px rgba(151,166,182,0.22)',
            }}
        >
            <div className="relative z-10">
                <div className="flex items-baseline justify-between mb-4">
                    <span className="text-[12px] font-extrabold tracking-[0.06em]" style={{ color: 'rgba(22,20,21,0.4)' }}>週里程</span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>最高 {Math.round(peakKm)} 公里</span>
                </div>

                {/* 實際長條圖：以階段配色，含基準線、減量週斜紋 */}
                <div className="flex items-end gap-[5px] h-40 border-b" style={{ borderColor: 'rgba(207,198,184,0.7)' }}>
                    {summary.map((w, i) => {
                        const h = peakKm > 0 ? Math.max(6, (w.mileage / peakKm) * 100) : 6;
                        const color = PHASE_COLORS[w.phase] || C.sand;
                        const risky = riskyWeeks.has(w.week);
                        return (
                            <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                                <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: risky ? C.coral : 'rgba(22,20,21,0.5)' }}>{Math.round(w.mileage)}</span>
                                <motion.div
                                    className="w-full rounded-t-[6px] origin-bottom"
                                    initial={{ scaleY: 0, opacity: 0 }}
                                    animate={{ scaleY: 1, opacity: 1 }}
                                    transition={{ delay: 0.06 + i * 0.035, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    style={{
                                        height: `${h}%`,
                                        background: w.is_deload
                                            ? `repeating-linear-gradient(45deg, ${color}, ${color} 3px, rgba(255,255,255,0.55) 3px, rgba(255,255,255,0.55) 6px)`
                                            : `linear-gradient(180deg, ${color} 0%, ${color}CC 100%)`,
                                        boxShadow: risky
                                            ? `0 0 0 1.5px ${C.coral}`
                                            : w.is_deload ? 'none' : `0 2px 6px -2px ${color}99`,
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
                {/* 週次索引 */}
                <div className="flex gap-[5px] mt-1.5">
                    {summary.map((w) => (
                        <span key={w.week} className="flex-1 text-center text-[11px] font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.35)' }}>{w.week}</span>
                    ))}
                </div>

                {/* 🎚 課種分佈 —— 使用者問過「有沒有練 zone2、間歇跑」。
                    答案一直是有（80/20 極化模型），但這張圖從頭到尾只畫里程，
                    他當然看不出來。把堂數擺出來，一行就答完。 */}
                <IntensityMixRow plan={plan} />

                {/* 階段圖例 */}
                <div className="flex items-center gap-3 mt-4 flex-wrap">
                    {Object.entries(PHASE_COLORS).map(([k, c]) => (
                        <div key={k} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                            <span className="text-[11px] font-extrabold tracking-[0.16em] uppercase" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                {PHASE_LABELS[k]}
                            </span>
                        </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-[2px]" style={{ background: 'repeating-linear-gradient(45deg, #CFC6B8, #CFC6B8 2px, #fff 2px, #fff 4px)' }} />
                        <span className="text-[12px] font-extrabold tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.55)' }}>減量週</span>
                    </div>
                </div>

                {/* ══ 一句話的安全結論 ═════════════════════════════
                      ★ v2.3：ACWR／增幅／尖峰比這些專業數字全部收進「?」。
                      主畫面只回答使用者真正在意的那一句：我撐不撐得住。 */}
                <div
                    className="mt-4 pt-3.5 flex items-center gap-2.5"
                    style={{ borderTop: '1px solid rgba(207,198,184,0.6)' }}
                >
                    <Shield size={14} strokeWidth={2.4} color={audit.safe ? '#7BA05B' : C.coral} />
                    <p className="flex-1 text-[12px] font-semibold leading-snug m-0" style={{ color: audit.safe ? 'rgba(22,20,21,0.70)' : C.coral }}>
                        {audit.safe
                            ? '這條爬升曲線你負荷得了。'
                            : '有幾週爬得偏快（珊瑚色標示），建議拉長週期或減少每週次數。'}
                    </p>
                    {onExplain && (
                        <motion.button {...pressProps('icon')}
 onClick={onExplain}
 aria-label="為什麼？"
 className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
 style={{
 background: 'rgba(22,20,21,0.06)',
 border: '1px solid rgba(22,20,21,0.10)',
 color: 'rgba(22,20,21,0.55)',
 fontSize: 12, fontWeight: 900,
 }}
 >
                            ?
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
    );
};

const WeekRow = ({ week }) => {
    const s = summarizeWeek(week);
    const phaseColor = PHASE_COLORS[s.phase] || C.sand;

    return (
        <div
            className="rounded-[18px] p-4 flex items-center gap-4 relative overflow-hidden active:scale-[0.985] transition-transform duration-200"
            style={{
                // 實體 Paper 卡＋Pebble 髮絲框（浮在外層 Mist 冷灰地面上 → 暖卡上浮）
                background: '#FBFAF8',
                border: '1px solid rgba(207,198,184,0.5)',
                boxShadow: '0 1px 2px rgba(32,32,32,0.04)',
                opacity: week.is_deload ? 0.92 : 1,
            }}
        >
            {/* 左側階段色條 */}
            <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: phaseColor, minHeight: 40 }} />
            
            <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase" style={{ color: 'rgba(22,20,21,0.5)' }}>
                        WK {String(week.week_index).padStart(2, '0')} · {PHASE_LABELS[s.phase] || s.phase}
                    </span>
                    {week.is_deload && (
                        <span className="text-[12px] font-extrabold tracking-[0.16em] px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,20,21,0.06)', color: 'rgba(22,20,21,0.5)' }}>
                            減量週
                        </span>
                    )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-light" style={{ fontSize: 28, letterSpacing: '-0.03em', color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                        {week.target_mileage_km}
                    </span>
                    <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase" style={{ color: 'rgba(22,20,21,0.5)' }}>
                        km
                    </span>
                </div>
            </div>

            {/* 積木膠囊 - 不變 */}
            <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                {week.bricks.map((b) => {
                    let extraWidth = 0;
                    if (b.distance_km) extraWidth = Math.min(28, b.distance_km * 1.2);
                    else if (b.duration_min) extraWidth = Math.min(28, (b.duration_min / 10) * 1.5);
                    const width = Math.max(10, 10 + extraWidth);

                    return (
                        <div
                            key={b.brick_id}
                            title={b.title}
                            className="h-2.5 rounded-full"
                            style={{
                                width: `${width}px`,
                                background: b.rpe_band?.color || (b.type === 'speed' ? '#F06292' : '#8BC34A'), // 無氧粉=速度, 燃脂綠=輕鬆
                                opacity: 0.92,
                                transition: 'width 0.3s ease',
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
};
