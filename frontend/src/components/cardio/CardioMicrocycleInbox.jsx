import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Zap, RefreshCcw, Mountain, Check, X, Play } from 'lucide-react';
import { DrvnLift as Dumbbell } from '../ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../../api/client';
import { getUserId } from '../../utils/auth';
import { RPE_BANDS } from '../../utils/rpeMapping';
import { evaluateWeek } from '../../utils/cardioSettlementEngine';
import { hasBrickActivity } from '../../utils/cardioPlanActuals';
import { loadCardioHistory } from '../../utils/cardioLoadHistory';
import { uStorage } from '../../utils/userStorage';
import CardioBrickDetailSheet from '../CardioBrickDetailSheet';
import CardioPlanEditor from '../CardioPlanEditor';
import PlanProgressTracker from '../PlanProgressTracker';
import useCardioPlanLifecycle from '../../hooks/useCardioPlanLifecycle';
import { trackingSnapshot } from '../../utils/cardioPlanProgress';
import { brickGuide, checkNotTodaysBrick } from '../../utils/runBrickGuide';
import { confirmDialog, toast } from '../../utils/toast';
import { buildWeeklyAgenda, loadWeekInputs, logicalNow } from '../../utils/dailyAgenda';

// 🧾 結算評語的儀表板速覽視覺（與 WeekSettlementSheet 同語意，精簡為一行 chip）
const VERDICT_CHIP = {
    promote: { label: '晉級', accent: '#2E9B6E', bg: 'rgba(123,211,165,0.18)', hint: '消化得很好，下週升量' },
    hold:    { label: '維持', accent: '#5481D4', bg: 'rgba(165,196,255,0.20)', hint: '表現穩定，維持劑量' },
    demote:  { label: '減量', accent: '#D94030', bg: 'rgba(249,92,75,0.16)', hint: '需要恢復，下週降量' },
};

/* ════════════════════════════════════════════════════════════════════
   CardioMicrocycleInbox — Magazine-edition · Liquid Glass
   ────────────────────────────────────────────────────────────────────
   Design notes (v2 · 2026-05):
   - 米白底 (#F6F4F1) 與 PlanEditor / BrickDetail 完全統一，徹底消除點擊
     卡牌或 EDIT PLAN 時的「破圖」黑白色衝撞
   - 卡牌語言改為運動雜誌海報：
       · 編號 + 日期 + 距離 metadata 立體排版
       · 手寫粗體大標 (Permanent Marker) 維持 DRVN 簽名感
       · 斜貼紙標籤 (Sticker Tag) 標 RPE band
       · Liquid Glass 質感卡面（半透明 + 內陰影 + 反射高光）
   - 點任何一張 brick → 同頁底部彈出 Bottom Sheet 預覽，**完全不換頁**
     ‧ 想開練就在 sheet 內按 START BRICK
     ‧ 想 skip 也在 sheet 內
   - Framer Motion：細膩克制 (stagger 0.04s / spring 280-26)
   ──────────────────────────────────────────────────────────────────── */

const TYPE_VISUAL = {
    speed:    { accent: '#F95C4B', tagBg: '#FFEAB0', tagRot: '-3deg',  label: '速度跑',    Icon: Zap,        tone: '間歇 · 節奏' },
    recovery: { accent: '#7BD3A5', tagBg: '#D6F1E1', tagRot: '2deg',   label: '恢復跑', Icon: RefreshCcw, tone: '乳酸清除' },
    long:     { accent: '#A5C4FF', tagBg: '#E2D9F8', tagRot: '-2deg',  label: '長距離跑',     Icon: Mountain,   tone: '有氧基礎' },
    strength: { accent: '#161415', tagBg: '#161415', tagRot: '3deg',   label: '重訓',     Icon: Dumbbell,   tone: '交叉訓練' },
};

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// 🗓️ 把 N 堂課平均分散到一週 7 天，讓課與課之間有休息日，
//    不再連三天黏在一起（原本 index%7 → MON/TUE/WED 連續）。
//    例：3 堂 → MON / WED / FRI；2 堂 → MON / THU；4 堂 → MON / WED / FRI / SUN。
/** 這一堂被排到週幾（週一 = 0）。卡片標籤與「今天原定練什麼」防呆共用同一個算法，
    否則卡上寫 MON、防呆卻以為它在 TUE。 */
const spreadDayIndex = (index, total) => {
    const n = Math.max(1, Number(total) || 1);
    if (n >= 7) return index % 7;                       // 7 堂以上就天天排
    // 平均分散：把 index 對映到 0..6，課間留出休息間隔
    const slot = Math.round(index * (6 / Math.max(1, n - 1 || 1)));
    return Math.min(6, n === 1 ? 0 : slot);
};
const spreadDayLabel = (index, total) => DAY_LABELS[spreadDayIndex(index, total)];

const findBandByMinMax = (min, max) => {
    for (const k of Object.keys(RPE_BANDS)) {
        const b = RPE_BANDS[k];
        if (b.min === min && b.max === max) return b;
    }
    return null;
};

const CardioMicrocycleInbox = ({ onClose }) => {
    const navigate = useNavigate();
    const userId = getUserId();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [week, setWeek] = useState(null);
    const [bricks, setBricks] = useState([]);
    const [completion, setCompletion] = useState(null);
    const [history, setHistory] = useState({ sessions: [], complete: false });
    const [previewBrick, setPreviewBrick] = useState(null); // Bottom-sheet 預覽中的 brick
    const [showEditor, setShowEditor] = useState(false);    // Bottom-sheet 編輯計劃 (取代 navigate)
    // 成績預測已移至「訓練看板」(WeekSettlementSheet) 顯示，這裡不再計算。

    const fetchWeek = useCallback(async () => {
        if (!userId) {
            setError('no_user');
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const [res, sessions] = await Promise.all([
                apiClient.get(`/api/cardio-plan/${userId}/this-week`), loadCardioHistory(userId),
            ]);
            setHistory(sessions);
            const data = res.data || {};
            setWeek(data.week || null);
            setBricks(Array.isArray(data.bricks) ? data.bricks : []);
            setCompletion(data.completion || null);
            setError(null);
        } catch (e) {
            console.warn('[Inbox] fetch failed:', e?.message);
            setError('fetch_failed');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { fetchWeek(); }, [fetchWeek]);

    // ══════════════════════════════════════════════════════════════════
    // 🔄 計劃生命週期（★ v2.3）
    //   · 已過完的每一週 → 依實際完成度調整下一週，並寫回後端
    //   · 到 end_date → 跳結業全畫面（每份計劃只跳一次）
    //   調整寫回之後要重抓本週，畫面上的數字才會是調整後的。
    // ══════════════════════════════════════════════════════════════════
    //   結業畫面由 App 全域層負責，這裡只要調整結果與進度快照
    const { adjustments, plan: livePlan, status: planStatus } = useCardioPlanLifecycle();
    // 計劃已到期 → 常駐「開始下一期」入口。結業畫面按過「之後再說」或從建立頁返回後，
    // 不能只剩通知能找到下一期。
    const planFinished = !!planStatus?.finished;
    const tracking = useMemo(
        () => (livePlan ? trackingSnapshot(livePlan) : null),
        [livePlan],
    );

    const adjustedThisWeek = useMemo(
        () => adjustments.find((a) => a.changed && a.week === week?.week_index) || null,
        [adjustments, week?.week_index],
    );

    // ★ v2.4「下一個目標」—— 本週第一個還沒做的訓練磚。
    //   只有它是亮的、有呼吸光；其他（含已完成）淡掉但仍然看得到。
    //   一次只給一個目標，是這一頁最重要的事。
    /* 🗓️ 每一堂排在週幾（週一=0）—— 跟首頁、中控台用同一支排程（buildWeeklyAgenda：
       長跑放週六、質量跑避開腿日隔天、使用者改過的日子優先）。以前這頁自己平均分散，
       3 趟排成一／四／日，首頁卻是長跑在週六 —— 兩邊講的日子對不上。 */
    const dayIndexById = useMemo(() => {
        const m = {};
        try {
            const week = buildWeeklyAgenda(loadWeekInputs(userId, { cardioBricks: bricks }));
            week.forEach((cell, i) => {
                const id = cell?.run?.brick_id || cell?.run?.brickId;
                if (id) m[id] = i;
            });
        } catch { /* 排不出來就用平均分散 */ }
        return m;
    }, [userId, bricks]);
    const dayIndexOf = useCallback(
        (b, i) => (dayIndexById[b?.brick_id] ?? spreadDayIndex(i, bricks.length)),
        [dayIndexById, bricks.length],
    );
    const todayIdx = (logicalNow().getDay() + 6) % 7;

    // 「下一個目標」跟重訓頁同一個規則：今天排的那趟優先，其次是排得最早、還沒做的那趟
    // （錯過的也還在這週裡，可以補）。以前是照陣列順序拿第一個，跟日期無關。
    const nextBrickId = useMemo(() => {
        const pending = bricks
            .map((b, i) => ({ b, d: dayIndexOf(b, i) }))
            .filter(({ b }) => b.status !== 'completed' && b.status !== 'skipped');
        const today = pending.find(({ d }) => d === todayIdx);
        const next = today || pending.sort((x, y) => x.d - y.d)[0];
        return next?.b?.brick_id || null;
    }, [bricks, dayIndexOf, todayIdx]);

    // ★「下一個計劃置頂」—— 還沒做的排前面（下一個目標在最上），已完成/略過排到後面。
    //   保留原始 index 給日期標籤用，重排的只是「顯示順序」。
    const orderedBricks = useMemo(() => {
        const rank = (b) => b.brick_id === nextBrickId ? -1
            : (b.status === 'completed' || b.status === 'skipped') ? 1 : 0;
        return bricks
            .map((b, i) => ({ b, i, d: dayIndexOf(b, i) }))
            .sort((x, y) => (rank(x.b) - rank(y.b)) || (x.d - y.d) || (x.i - y.i));
    }, [bricks, nextBrickId, dayIndexOf]);

    const appliedRef = React.useRef(false);
    useEffect(() => {
        // 有真的調整過 → 重抓一次，避免畫面還停在調整前的數字
        if (adjustments.some((a) => a.changed) && !appliedRef.current) {
            appliedRef.current = true;
            fetchWeek();
        }
    }, [adjustments, fetchWeek]);

    const headline = useMemo(() => {
        if (!week || !completion) return { line1: '尚無訓練計劃', line2: '點此建立計劃' };
        const completed = bricks.filter(b => b.status === 'completed').length;
        const total = bricks.length;
        const actualKm = (completion.total_mileage_actual_km || 0).toFixed(1);
        const targetKm = (completion.total_mileage_target_km || 0).toFixed(1);
        const phaseZh = { base: '基礎', build: '建立', peak: '巔峰', taper: '減量', deload: '恢復' }[String(week.phase || '').toLowerCase()] || String(week.phase || '').toUpperCase();
        return {
            line1: `第 ${week.week_index} 週 · ${phaseZh}`,
            line2: `${completed}/${total} 訓練磚 · ${actualKm}/${targetKm} 公里`,
            bricksLine: `${phaseZh} · 練完 ${completed}／${total} 堂`,
        };
    }, [week, completion, bricks]);

    // 🧾 用純函式即時算出本週評語（不打 API），讓升降階建議直接出現在儀表板
    //    只有「至少完成/跳過一張 brick」時才顯示，避免空週誤導。
    const verdict = useMemo(() => {
        if (!week || !bricks.length) return null;
        const hasActivity = bricks.some(hasBrickActivity);
        if (!hasActivity) return null;
        try {
            // 🛡️ ACWR 護欄：帶入歷史 sessions（負荷比過高 → 擋升階並警示）
            const s = evaluateWeek({ ...week, bricks }, [], { allSessions: history.sessions, historyComplete: history.complete });
            const visual = VERDICT_CHIP[s.verdict];
            if (!visual) return null;
            const delta = Math.round((s.adjustments.next_week_mileage_multiplier - 1) * 100);
            return { ...visual, score: s.score, delta };
        } catch (e) {
            console.warn('[Inbox] verdict calc failed:', e?.message);
            return null;
        }
    }, [week, bricks, history]);

    /* 🎂 年齡 → 心率區間換算的唯一輸入。20 歲和 50 歲的 Zone 2 差快 20 bpm，
       拿不到年齡就讓 heartRateUtils 走它自己的預設，不在這裡瞎猜。 */
    const userAge = useMemo(() => {
        try {
            const cache = uStorage(userId).get('user_profile_cache', {});
            const a = Number(cache?.age);
            return Number.isFinite(a) && a >= 15 && a <= 100 ? a : undefined;
        } catch { return undefined; }
    }, [userId]);

    /* 🗓️ 每一堂被排到週幾（週一=0）——與卡片上的 MON/TUE 標籤同一個算法。
       給「今天原定練什麼」防呆比對用。 */
    const bricksWithDay = useMemo(
        () => bricks.map((b, i) => ({ ...b, dayIndex: dayIndexOf(b, i) })),
        [bricks, dayIndexOf]
    );

    const handleOpenPreview = async (brick) => {
        if (!brick || brick.status === 'completed' || brick.status === 'skipped') return;

        /* 🛡️ 防呆：使用者原話「如果不是當天的訓練你要提醒使用者今天原定訓練什麼」。
           直接擋掉是錯的（人本來就會調整順序），但要先把「今天原定是什麼」講清楚，
           而且建議語要看今天那趟實際是什麼課才給 —— 不要用「如果…」把判斷丟回去。 */
        const idx = bricks.findIndex((b) => b.brick_id === brick.brick_id);
        const picked = { ...brick, dayIndex: dayIndexOf(brick, idx) };
        const check = checkNotTodaysBrick(picked, bricksWithDay);
        if (check && !check.isToday) {
            const cancel = await confirmDialog(check.message, {
                title: check.title,
                confirmText: '先不要',
                cancelText: '還是要跑這趟',
                danger: false,
            });
            if (cancel) return;   // 按「先不要」→ 不開預覽
        }

        // Strength 也彈預覽 sheet — 讓使用者看推薦動作後再選擇套用 / 修改 / 開始
        setPreviewBrick(brick);
    };

    const handleSkip = async (brick) => {
        try {
            await apiClient.post('/api/cardio-plan/skip-brick', {
                user_id: userId,
                brick_id: brick.brick_id,
            });
            setPreviewBrick(null);
            await fetchWeek();
        } catch (e) {
            console.warn('[Inbox] skip failed:', e?.message);
            // 以前失敗只印 console，使用者以為已跳過；要講出來
            toast.error('跳過沒成功，檢查網路後再試一次');
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1000002] flex flex-col overflow-hidden"
            style={{
                // 米白主背景 + 輕柔 noise — 與 PlanEditor / BrickDetail 統一
                background: 'radial-gradient(140% 80% at 50% -10%, #FFFFFF 0%, #F6F4F1 40%, #ECE5D8 100%)',
                color: '#161415',
                fontFamily: 'var(--font-body)',
            }}
        >
            <style>
                {`@import url('https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Archivo+Black&display=swap');`}
            </style>

            {/* ── Header ─────────────────────────────────────── */}
            <div
                className="relative z-10 flex items-start justify-between px-6 pb-3"
                style={{ paddingTop: 'calc(env(safe-area-inset-top, 24px) + 16px)' }}
            >
                <div className="flex-1 min-w-0">
                    {/* 頁首只留一個標題＋進度：以前「本週計劃／本週訓練」兩個標、兩行小字、
                        一整塊大字完成度加一段說明，把訓練卡擠到螢幕外 —— 一進來看不到今天要跑什麼。 */}
                    <div style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 34, lineHeight: 1, letterSpacing: '-0.03em', color: '#161415' }}>
                        本週訓練
                    </div>
                    {!tracking && (
                        <div className="mt-2" style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>{headline.line1}</div>
                    )}

                    {/* ★ v2.3 自動調整告知 —— 課表被改過就一定要講，
                        使用者不該某天打開發現數字自己變了卻沒人解釋 */}
                    <AnimatePresence>
                        {adjustedThisWeek && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                className="mt-3 mr-2 rounded-[16px] px-3.5 py-2.5 overflow-hidden"
                                style={{
                                    background: 'rgba(84,129,212,0.10)',
                                    border: '1px solid rgba(84,129,212,0.30)',
                                }}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <RefreshCcw size={11} color="#4169B2" strokeWidth={2.6} />
                                    <span className="text-[12px] font-black tracking-[0.20em]" style={{ color: '#4169B2' }}>
                                        本週已依你的表現調整
                                    </span>
                                    <span className="text-[11px] font-bold tabular-nums ml-auto" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                        {adjustedThisWeek.before} → {adjustedThisWeek.after} km
                                    </span>
                                </div>
                                <p className="text-[11px] leading-relaxed m-0" style={{ color: 'rgba(22,20,21,0.62)' }}>
                                    {adjustedThisWeek.message}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <motion.button {...pressProps('pill')}
 onClick={() => navigate('/cardio-plan-builder')}
 className="w-11 h-11 rounded-full flex items-center justify-center transition"
 style={{
 background: 'linear-gradient(135deg, #FFFFFF 0%, #E4DED2 100%)',
 border: '1px solid rgba(255,255,255,0.9)',
 boxShadow: '0 4px 10px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 aria-label="Regenerate Plan"
 >
                        <RefreshCcw size={16} color="#161415" />
                    </motion.button>
                    {onClose && (
                        <motion.button {...pressProps('pill')}
 onClick={onClose}
 className="w-11 h-11 rounded-full flex items-center justify-center transition"
 style={{
 background: 'linear-gradient(135deg, #FFFFFF 0%, #E4DED2 100%)',
 border: '1px solid rgba(255,255,255,0.9)',
 boxShadow: '0 4px 10px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 aria-label="Close"
 >
                            <X size={18} color="#161415" />
                        </motion.button>
                    )}
                </div>
            </div>

            {/* 計劃已結束：常駐「開始下一期」—— 不靠結業畫面或通知才找得到 */}
            {planFinished && (
                <div className="relative z-10 px-6 pb-3">
                    <motion.button {...pressProps('pill')}
                        onClick={() => navigate('/cardio-plan-builder')}
                        className="w-full h-12 rounded-full flex items-center justify-center gap-2"
                        style={{
                            background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
                            color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '0.16em',
                            border: 'none', boxShadow: '0 8px 22px rgba(249,92,75,0.35)',
                        }}
                    >
                        <Play size={14} strokeWidth={2.6} />
                        這期結束了 · 開始下一期
                    </motion.button>
                </div>
            )}

            {/* 進度：標題下面整排寬，一行字＋一條軌道 */}
            {tracking && (
                <div className="relative z-10 px-6 pb-4">
                    <PlanProgressTracker snapshot={tracking} slim extra={headline.bricksLine} />
                </div>
            )}

            {/* ── Bricks list ────────────────────────────────── */}
            <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-40">
                {loading && (
                    <div className="text-center mt-12 text-[9px] font-black tracking-[0.22em] uppercase"
                         style={{ color: 'rgba(22,20,21,0.40)' }}>
                        Loading…
                    </div>
                )}
                {!loading && error === 'fetch_failed' && (
                    // 以前抓不到本週只剩一片空白；給重試
                    <div className="text-center mt-16 flex flex-col items-center">
                        <div className="text-[14px] font-bold mb-5" style={{ color: 'rgba(22,20,21,0.62)' }}>
                            本週課表載入失敗
                        </div>
                        <motion.button {...pressProps('pill')}
                            onClick={() => fetchWeek()}
                            className="px-7 py-3 rounded-full flex items-center gap-2"
                            style={{
                                background: 'linear-gradient(135deg, #FFFFFF 0%, #E4DED2 100%)',
                                border: '1px solid rgba(22,20,21,0.12)',
                                color: '#161415', fontSize: 13, fontWeight: 800, letterSpacing: '0.12em',
                            }}
                        >
                            <RefreshCcw size={14} color="#161415" />
                            重新載入
                        </motion.button>
                    </div>
                )}
                {!loading && error === 'no_user' && (
                    <div className="text-center mt-12 text-[9px] font-black tracking-[0.22em] uppercase"
                         style={{ color: 'rgba(22,20,21,0.40)' }}>
                        PLEASE SIGN IN
                    </div>
                )}
                {!loading && !error && bricks.length === 0 && (
                    <div className="text-center mt-16 flex flex-col items-center">
                        <div className="text-[20px] font-light leading-snug mb-3"
                             style={{ color: '#161415', fontFamily: 'var(--font-body)' }}>
                            No active plan.
                        </div>
                        <div className="text-[12px] font-black tracking-[0.22em] mb-7"
                             style={{ color: 'rgba(22,20,21,0.40)' }}>
                            建立你的第一份週課表
                        </div>
                        {/* 明確的生成計劃 CTA — 與 History 空狀態的 coral 主按鈕風格一致 */}
                        <motion.button {...pressProps('pill')}
 onClick={() => navigate('/cardio-plan-builder')}
 className="px-8 py-4 rounded-full"
 style={{
 background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
 color: '#fff',
 fontSize: 13,
 fontWeight: 800,
 letterSpacing: '0.16em',
 textTransform: 'uppercase',
 border: 'none',
 boxShadow: '0 8px 22px rgba(249,92,75,0.4)',
 }}
 >
                            + 生成計劃
                        </motion.button>
                    </div>
                )}

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } }
                    }}
                >
                    {/* 成績預測已移至「訓練看板」(WeekSettlementSheet) 內顯示。 */}
                    {/* 下一個計劃置頂：顯示用 orderedBricks，日期標籤仍用原始 index。 */}
                    {orderedBricks.map(({ b: brick, i: idx }) => (
                        <BrickMagazineCard
                            key={brick.brick_id}
                            brick={brick}
                            index={idx}
                            total={bricks.length}
                            dayIndex={dayIndexOf(brick, idx)}
                            isNext={brick.brick_id === nextBrickId}
                            userAge={userAge}
                            onTap={() => handleOpenPreview(brick)}
                        />
                    ))}
                </motion.div>
            </div>

            {/* ── Footer CTA ─────────────────────────────────── */}
            {!loading && bricks.length > 0 && (
                <div
                    className="absolute bottom-0 left-0 right-0 px-5 pt-10 pointer-events-auto z-20"
                    style={{
                        background: 'linear-gradient(to top, #F6F4F1 35%, rgba(246,244,241,0.92) 65%, rgba(246,244,241,0) 100%)',
                        paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 14px)',
                    }}
                >
                    {/* 動態調整（升降階建議）已移至「訓練看板」內，此處不再重複顯示浮動評語。 */}
                    <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={() => navigate('/cardio-week-settlement', { state: { weekIndex: week?.week_index } })}
                            className="h-[56px] rounded-full flex items-center justify-center gap-2 relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #FF9A87 0%, #F98374 55%, #F5786A 100%)', // 淡珊瑚
                                color: '#FFFFFF',
                                border: '1px solid rgba(255,255,255,0.28)',
                                boxShadow: '0 10px 24px rgba(245,120,106,0.28), inset 0 1px 2px rgba(255,255,255,0.42)',
                                letterSpacing: '0.18em',
                                fontWeight: 800,
                                fontSize: 9,
                            }}
                        >
                            <span>訓練看板</span>
                        </motion.button>

                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setShowEditor(true)}
                            className="h-[56px] rounded-full flex items-center justify-center gap-2"
                            style={{
                                background: 'linear-gradient(135deg, #FFFFFF 0%, #ECE5D6 100%)',
                                color: '#161415',
                                border: '1px solid rgba(22,20,21,0.10)',
                                boxShadow: '0 6px 16px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)',
                                letterSpacing: '0.18em',
                                fontWeight: 800,
                                fontSize: 9,
                            }}
                        >
                            <span>編輯計劃</span>
                        </motion.button>
                    </div>
                    <div className="text-center text-[9px] font-black tracking-[0.28em] uppercase mt-3"
                         style={{ color: 'rgba(22,20,21,0.35)' }}>
                        RUN ANY BRICK · ANY DAY
                    </div>
                </div>
            )}

            {/* ── Bottom-sheet preview (in-page, no navigation) ── */}
            <AnimatePresence>
                {previewBrick && (
                    <BrickPreviewSheet
                        brick={previewBrick}
                        userAge={userAge}
                        onClose={() => setPreviewBrick(null)}
                        onSkip={() => handleSkip(previewBrick)}
                    />
                )}
            </AnimatePresence>

            {/* ── Bottom-sheet Plan Editor (取代 navigate '/cardio-plan-editor') ── */}
            <AnimatePresence>
                {showEditor && (
                    <PlanEditorSheet
                        onClose={async () => { setShowEditor(false); await fetchWeek(); }}
                    />
                )}
            </AnimatePresence>

            {/* 結業全畫面已提升到 App 全域層（PlanCompletionGate），這裡不重複掛載 */}
        </div>
    );
};

export default CardioMicrocycleInbox;

// ════════════════════════════════════════════════════════════════════
// Brick Magazine Card — 雜誌風 + Liquid Glass
// ════════════════════════════════════════════════════════════════════

const BrickMagazineCard = ({ brick, index, total, dayIndex, onTap, isNext = false, userAge }) => {
    const vis = TYPE_VISUAL[brick.type] || TYPE_VISUAL.recovery;
    const Icon = vis.Icon;
    const isDone = brick.status === 'completed';
    const isSkipped = brick.status === 'skipped';
    // 這趟該用哪個 Zone、心率壓在多少（strength brick 沒有 → null，不顯示這一區）
    const guide = brickGuide(brick, userAge);

    // ★ v2.4 完成率 —— 已完成的卡上直接寫「實跑 ÷ 計劃」，
    //   不是打個勾就算。跑了 1.8/2.5 公里就是 72%，這才是誠實的完成。
    const planKm = Number(brick.distance_km) || 0;
    const ranKm = Number(brick.actual_distance_km);
    const donePct = isDone && planKm > 0
        ? Math.round((Number.isFinite(ranKm) && ranKm > 0 ? ranKm : planKm) / planKm * 100)
        : null;

    // 呼吸光只給「下一個目標」，顏色跟著課別走
    const glow = vis.accent || vis.color || '#F95C4B';
    // 不是下一個目標就淡掉 —— 但仍然看得見，讓人知道整週的樣子
    const dimmed = !isNext && !isDone;
    const band = brick.rpe_band || {};
    const bandLabel = band.min === band.max ? `RPE ${band.min}` : `RPE ${band.min}-${band.max}`;
    const dayLabel = Number.isInteger(dayIndex) ? DAY_LABELS[dayIndex] : spreadDayLabel(index, total);

    const titleLower = (brick.title || '').toLowerCase();
    let bgImg = '';
    if (titleLower.includes('easy')) bgImg = '/desktop/run1.png';
    else if (titleLower.includes('long')) bgImg = '/desktop/run2.png';
    else if (titleLower.includes('interval')) bgImg = '/desktop/run3.png';
    else if (titleLower.includes('recovery')) bgImg = '/desktop/run4.png';
    else if (titleLower.includes('tempo')) bgImg = '/desktop/run5.png';
    else {
        if (brick.type === 'speed') bgImg = '/desktop/run3.png';
        else if (brick.type === 'recovery') bgImg = '/desktop/run1.png';
        else if (brick.type === 'long') bgImg = '/desktop/run2.png';
        else bgImg = '/desktop/run1.png';
    }

    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 26 } }
            }}
            className="mb-3 relative"
        >
            {/* 🫧 呼吸光 —— 只有「下一個目標」有，顏色跟著課別。
                放在卡片外層，用 scale + opacity 循環，像慢慢吸氣吐氣。 */}
            {isNext && (
                <motion.div
                    className="absolute pointer-events-none"
                    aria-hidden
                    animate={{ opacity: [0.30, 0.62, 0.30], scale: [0.985, 1.012, 0.985] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                        inset: -6,
                        borderRadius: 30,
                        background: `radial-gradient(60% 70% at 50% 50%, ${glow}55 0%, ${glow}18 55%, transparent 78%)`,
                        filter: 'blur(10px)',
                        zIndex: 0,
                    }}
                />
            )}

            <motion.button
                whileTap={isSkipped ? {} : { scale: 0.985 }}
                onClick={onTap}
                disabled={isSkipped}
                className="w-full text-left relative overflow-hidden rounded-[24px] p-5"
                style={{
                    border: isNext ? `1.5px solid ${glow}` : '1px solid rgba(255,255,255,0.85)',
                    boxShadow: isSkipped
                        ? 'none'
                        : isNext
                            ? `0 18px 40px -12px ${glow}55, 0 1px 2px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)`
                            : '0 14px 34px rgba(22,20,21,0.08), 0 1px 2px rgba(22,20,21,0.04), inset 0 1px 1px rgba(255,255,255,1)',
                    // 已完成保持可見（要看得到完成率），只有「還沒輪到」的才淡掉
                    opacity: isSkipped ? 0.45 : dimmed ? 0.5 : 1,
                    filter: dimmed ? 'saturate(0.35)' : 'none',
                    transition: 'opacity 0.25s ease, border-color 0.25s ease',
                    zIndex: 1,
                }}
            >
                {/* Background Image Layer */}
                <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: `url(${bgImg})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                />

                {/* Gradient Overlay Layer (Fades to transparent on the right to reveal the photo) */}
                <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: isDone
                            ? 'linear-gradient(100deg, rgba(58,56,53,0.93) 0%, rgba(38,37,35,0.86) 55%, rgba(38,37,35,0.52) 100%)'
                            : isSkipped
                                ? 'linear-gradient(100deg, rgba(255,255,255,0.95) 0%, rgba(228,222,210,0.85) 50%, rgba(228,222,210,0.3) 100%)'
                                : 'linear-gradient(105deg, rgba(255,255,255,0.84) 0%, rgba(246,244,241,0.65) 55%, rgba(255,255,255,0.18) 100%)',
                        backdropFilter: 'blur(5px) saturate(115%)',
                        WebkitBackdropFilter: 'blur(5px) saturate(115%)',
                    }}
                />
                {/* Continuous glass surface with a rounded inner rim. */}
                <div
                    className="absolute inset-0 pointer-events-none rounded-[24px]"
                    style={{
                        background: 'linear-gradient(150deg, rgba(255,255,255,0.32), transparent 28%, transparent 72%, rgba(255,255,255,0.16))',
                        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.38), inset 1px 0 1px rgba(255,255,255,0.45)',
                    }}
                />

                {/* 高光反射 */}
                <div
                    className="absolute -top-12 -left-8 w-40 h-40 pointer-events-none rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, transparent 60%)',
                    }}
                />

                <div className="relative z-10 flex flex-col gap-5 min-h-[150px]">
                    {/* ── Row 1 : 編號 / 日期 / 標籤 ────────── */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            {/* Editorial 編號 */}
                            <div className="flex flex-col items-start leading-none">
                                <span className="text-[9px] font-black tracking-[0.22em] uppercase"
                                      style={{ color: isDone ? 'rgba(255,255,255,0.7)' : 'rgba(22,20,21,0.55)' }}>
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <span className="text-[9px] font-black tracking-[0.22em] uppercase mt-1"
                                      style={{ color: isDone ? 'rgba(255,255,255,0.9)' : '#161415' }}>
                                    {dayLabel}
                                </span>
                            </div>

                            {/* 分隔線 */}
                            <div className="w-px h-9"
                                 style={{ background: isDone ? 'rgba(255,255,255,0.35)' : 'rgba(22,20,21,0.18)' }} />

                            {/* TYPE 標籤 */}
                            <div className="flex flex-col leading-tight">
                                <span className="text-[9px] font-black tracking-[0.22em] uppercase"
                                      style={{ color: isDone ? '#FFFFFF' : vis.accent }}>
                                    {vis.label}
                                </span>
                                <span className="text-[9px] font-bold tracking-[0.18em] uppercase mt-0.5"
                                      style={{ color: isDone ? 'rgba(255,255,255,0.75)' : 'rgba(22,20,21,0.45)' }}>
                                    {vis.tone}
                                </span>
                            </div>
                        </div>

                        {/* ✅ 已完成 → 直接把完成率寫在卡上（打勾不夠，數字才誠實） */}
                        {isDone && donePct != null && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', stiffness: 340, damping: 22 }}
                                className="shrink-0 flex flex-col items-end leading-none"
                            >
                                <div className="flex items-baseline gap-0.5">
                                    <span className="font-light tabular-nums" style={{ fontSize: 30, lineHeight: 0.9, color: '#FFFFFF', letterSpacing: '-0.03em' }}>
                                        {donePct}
                                    </span>
                                    <span className="text-[12px] font-light" style={{ color: 'rgba(255,255,255,0.72)' }}>%</span>
                                </div>
                                <span className="text-[12px] font-black tracking-[0.20em] mt-1.5" style={{ color: 'rgba(255,255,255,0.68)' }}>
                                    完成度
                                </span>
                                {Number.isFinite(ranKm) && ranKm > 0 && (
                                    <span className="text-[11px] font-bold tabular-nums mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                        {ranKm.toFixed(1)} / {planKm} km
                                    </span>
                                )}
                            </motion.div>
                        )}

                        {/* 斜貼紙標籤 */}
                        {!isDone && (
                            <div
                                className="px-2.5 py-1 shrink-0"
                                style={{
                                    background: vis.tagBg,
                                    transform: `rotate(${vis.tagRot})`,
                                    border: '1px solid rgba(22,20,21,0.12)',
                                    boxShadow: '0 3px 8px rgba(22,20,21,0.10)',
                                    borderRadius: 2,
                                }}
                            >
                                <span className="text-[9px] font-black tracking-[0.18em] uppercase"
                                      style={{ color: '#161415' }}>
                                    {bandLabel}
                                </span>
                            </div>
                        )}

                        {isDone && (
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                style={{
                                    background: 'rgba(255,255,255,0.95)',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
                                }}
                            >
                                <Check size={18} strokeWidth={3.2} color="#5A7A3A" />
                            </div>
                        )}
                    </div>

                    {/* ── Row 2 : 手寫大標 ─────────────────── */}
                    <div className="flex items-end justify-between gap-4">
                        <div
                            className="text-[42px] leading-[0.92] tracking-tight -rotate-[1.5deg] origin-left"
                            style={{
                                fontFamily: "'Permanent Marker', cursive",
                                color: isDone ? '#FFFFFF' : vis.accent,
                                textShadow: isDone ? 'none' : '1px 2px 0 rgba(22,20,21,0.06)',
                            }}
                        >
                            {brick.title || vis.label}
                        </div>
                        <Icon
                            size={32}
                            strokeWidth={2}
                            color={isDone ? 'rgba(255,255,255,0.7)' : `${vis.accent}D0`}
                            className="shrink-0 mb-1"
                        />
                    </div>

                    {/* ── Row 3 : metadata 排版 ───────────── */}
                    <div className="flex items-baseline justify-between gap-4 pt-3 border-t"
                         style={{ borderColor: isDone ? 'rgba(255,255,255,0.22)' : 'rgba(22,20,21,0.10)' }}>
                        <div className="flex items-baseline gap-5">
                            {brick.distance_km != null && (
                                <div className="flex flex-col leading-none">
                                    <span className="text-[12px] font-black tracking-[0.24em] mb-1"
                                          style={{ color: isDone ? 'rgba(255,255,255,0.65)' : 'rgba(22,20,21,0.45)' }}>
                                        距離
                                    </span>
                                    <span className="font-light tracking-tight"
                                          style={{
                                              fontSize: 26,
                                              color: isDone ? '#FFFFFF' : '#161415',
                                              fontVariantNumeric: 'tabular-nums',
                                              letterSpacing: '-0.02em',
                                          }}>
                                        {brick.distance_km}
                                        <span className="text-[12px] font-black ml-1 tracking-[0.18em]"
                                              style={{ color: isDone ? 'rgba(255,255,255,0.7)' : 'rgba(22,20,21,0.50)' }}>
                                            公里
                                        </span>
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-col leading-none">
                                <span className="text-[12px] font-black tracking-[0.24em] mb-1"
                                      style={{ color: isDone ? 'rgba(255,255,255,0.65)' : 'rgba(22,20,21,0.45)' }}>
                                    時間
                                </span>
                                <span className="font-light tracking-tight"
                                      style={{
                                          fontSize: 26,
                                          color: isDone ? '#FFFFFF' : '#161415',
                                          fontVariantNumeric: 'tabular-nums',
                                          letterSpacing: '-0.02em',
                                      }}>
                                    {brick.duration_min}
                                    <span className="text-[12px] font-black ml-1 tracking-[0.18em]"
                                          style={{ color: isDone ? 'rgba(255,255,255,0.7)' : 'rgba(22,20,21,0.50)' }}>
                                        分鐘
                                    </span>
                                </span>
                            </div>
                        </div>

                        {!isDone && !isSkipped && (
                            <span className="text-[12px] font-black tracking-[0.22em]"
                                  style={{ color: 'rgba(22,20,21,0.45)' }}>
                                預覽 →
                            </span>
                        )}
                    </div>

                    {/* ── Row 4 : 這趟要以「Zone 幾 / 心率多少」跑 ──────────
                        使用者原話：「像我這種初學者我會不知道說要以多少心率、
                        zone 幾、跑多遠。」RPE 5–6 是主觀感受，新手看不懂；
                        真正可執行的指令是「心率壓在 115–134」。
                        心率依使用者年齡換算，不寫死（20 歲和 50 歲差快 20 bpm）。 */}
                    {guide && (
                        <div className="flex items-center gap-2.5 -mt-1 flex-wrap">
                            <span className="px-2 py-[3px] rounded-full text-[11px] font-black tracking-wide"
                                  style={{
                                      background: isDone ? 'rgba(255,255,255,0.20)' : `${vis.accent}22`,
                                      color: isDone ? '#FFFFFF' : vis.accent,
                                      border: `1px solid ${isDone ? 'rgba(255,255,255,0.30)' : `${vis.accent}44`}`,
                                  }}>
                                Z{guide.zone} · {guide.zoneName}
                            </span>
                            <span className="text-[11px] font-black tabular-nums"
                                  style={{ color: isDone ? 'rgba(255,255,255,0.85)' : '#161415' }}>
                                心率 {guide.hrLabel}
                            </span>
                            <span className="text-[11px] font-bold"
                                  style={{ color: isDone ? 'rgba(255,255,255,0.6)' : 'rgba(22,20,21,0.45)' }}>
                                · {guide.purpose}
                            </span>
                        </div>
                    )}
                </div>
            </motion.button>
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// Brick Preview Bottom Sheet — 同頁內預覽 (不換頁)
// ════════════════════════════════════════════════════════════════════

const BrickPreviewSheet = ({ brick, onClose, onSkip, userAge }) => {
    const guide = brickGuide(brick, userAge);
    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={onClose}
                className="fixed inset-0 z-[1000020]"
                style={{
                    background: 'rgba(22,20,21,0.45)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
            />

            {/* Sheet */}
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.25 }}
                onDragEnd={(_, info) => { if (info.offset.y > 120) onClose(); }}
                className="fixed left-0 right-0 bottom-0 z-[1000030] flex flex-col"
                style={{
                    background: 'linear-gradient(180deg, #FFFFFF 0%, #F6F4F1 100%)',
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    boxShadow: '0 -18px 50px rgba(22,20,21,0.22)',
                    maxHeight: '88dvh',
                }}
            >
                {/* drag handle */}
                <div className="flex justify-center pt-2.5 pb-1 shrink-0 cursor-grab">
                    <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(22,20,21,0.22)' }} />
                </div>

                <div 
                    className="flex-1 overflow-y-auto" 
                    onPointerDownCapture={e => e.stopPropagation()}
                    onTouchStartCapture={e => e.stopPropagation()}
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)' }}
                >
                    {/* ── 🎯 這趟要怎麼跑：Zone / 心率 / 練什麼 / 怎麼判斷跑對了 ──
                        使用者原話：「初學者我會不知道說要以多少心率、zone 幾、跑多遠。」
                        RPE 是主觀感受，新手沒有基準；心率是可以照著做的指令。 */}
                    {guide && (
                        <div className="px-6 pt-3 pb-1">
                            <div className="rounded-[20px] p-4"
                                 style={{ background: 'rgba(22,20,21,0.035)', border: '1px solid rgba(22,20,21,0.08)' }}>
                                {/* 一行講完今天要做什麼 */}
                                <div className="flex items-center gap-2 flex-wrap mb-3">
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-black"
                                          style={{ background: '#161415', color: '#F6F4F1' }}>
                                        Zone {guide.zone}
                                    </span>
                                    <span className="text-[13px] font-black" style={{ color: '#161415' }}>
                                        {guide.zoneName}
                                    </span>
                                    <span className="ml-auto text-[13px] font-black tabular-nums" style={{ color: '#161415' }}>
                                        {guide.hrLabel}
                                    </span>
                                </div>

                                <div className="flex gap-4 pb-3 mb-3" style={{ borderBottom: '1px solid rgba(22,20,21,0.08)' }}>
                                    {guide.distanceKm != null && (
                                        <div className="flex flex-col leading-none">
                                            <span className="text-[12px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(22,20,21,0.42)' }}>跑多遠</span>
                                            <span className="text-[17px] font-black tabular-nums" style={{ color: '#161415' }}>{guide.distanceKm} <span className="text-[11px]">km</span></span>
                                        </div>
                                    )}
                                    {guide.durationMin != null && (
                                        <div className="flex flex-col leading-none">
                                            <span className="text-[12px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(22,20,21,0.42)' }}>跑多久</span>
                                            <span className="text-[17px] font-black tabular-nums" style={{ color: '#161415' }}>{guide.durationMin} <span className="text-[11px]">分</span></span>
                                        </div>
                                    )}
                                    {guide.paceLabel && (
                                        <div className="flex flex-col leading-none">
                                            <span className="text-[12px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(22,20,21,0.42)' }}>配速</span>
                                            <span className="text-[17px] font-black tabular-nums" style={{ color: '#161415' }}>{guide.paceLabel} <span className="text-[11px]">/km</span></span>
                                        </div>
                                    )}
                                </div>

                                {/* 練什麼 / 為什麼 / 怎麼判斷跑對了 / 太快的訊號 */}
                                <div className="flex flex-col gap-2.5">
                                    {[
                                        { k: '練什麼', v: guide.purpose },
                                        { k: '為什麼', v: guide.why },
                                        { k: '跑對了嗎', v: guide.feel },
                                        { k: '太快的訊號', v: guide.tooFast },
                                    ].map((r) => (
                                        <div key={r.k} className="flex gap-2.5">
                                            <span className="text-[9px] font-black tracking-[0.14em] shrink-0 pt-[3px]"
                                                  style={{ color: 'rgba(22,20,21,0.40)', minWidth: 58 }}>{r.k}</span>
                                            <span className="text-[11.5px] font-semibold leading-relaxed" style={{ color: 'rgba(22,20,21,0.72)' }}>{r.v}</span>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[11px] font-bold mt-3 pt-2.5" style={{ color: 'rgba(22,20,21,0.35)', borderTop: '1px solid rgba(22,20,21,0.07)' }}>
                                    心率區間依你的年齡換算（推估最大心率 {guide.maxHR} bpm）。沒戴錶就照「跑對了嗎」那一行的體感判斷。
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 直接用 BrickDetail 的內容（傳 brick 為 prop） */}
                    <CardioBrickDetailSheet
                        brick={brick}
                        embedded
                        onClose={onClose}
                        onSkipOverride={onSkip}
                    />
                </div>
            </motion.div>
        </>
    );
};

// ════════════════════════════════════════════════════════════════════
// Plan Editor Bottom Sheet — 取代整頁跳轉 navigate('/cardio-plan-editor')
// ════════════════════════════════════════════════════════════════════

const PlanEditorSheet = ({ onClose }) => {
    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={onClose}
                className="fixed inset-0 z-[1000040]"
                style={{
                    background: 'rgba(22,20,21,0.50)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                }}
            />

            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                className="fixed left-0 right-0 bottom-0 z-[1000050]"
                style={{
                    height: '94dvh',
                    background: 'transparent',
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    overflow: 'hidden',
                    boxShadow: '0 -22px 60px rgba(22,20,21,0.28)',
                }}
            >
                {/* 把 PlanEditor 整個塞進來，它本身就是米白底全屏；
                   靠 sheet 容器把它「視覺裁切」成底部彈出。 */}
                <div className="relative w-full h-full">
                    {/* Drag handle (僅視覺，不可拖) */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000060]">
                        <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(22,20,21,0.22)' }} />
                    </div>
                    <CardioPlanEditor onClose={onClose} />
                </div>
            </motion.div>
        </>
    );
};
