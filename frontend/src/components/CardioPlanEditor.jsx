import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, RotateCcw, Trash2, Save, X, Mountain, Zap, Wind, RefreshCcw, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { brandColors as C } from '../utils/colors';
import { SWISS, TYPE, indexNumber } from '../utils/swissUI';
import { haptic } from '../utils/haptics';
import { PACE_SHIFT_BY_SUBTYPE } from '../utils/cardioPrescription';
import {
    classifyDistance, stepRunDistance, reconcileSubtypeWithDistance,
    titleForRun, chipForRun, effectiveRangeFor, previewDistanceStep,
} from '../utils/runDistanceClass';
import {
    composeBrickTypes,
    materializeBricks,
} from '../utils/cardioPlanFusionEngine';

/* ════════════════════════════════════════════════════════════════════
   CardioPlanEditor
   ────────────────────────────────────────────────────────────────────
   Lets a user post-process the auto-generated plan:
     - reroll a whole week (re-use engine helpers)
     - delete a brick
     - bump or trim a brick's distance
     - add a custom brick (recovery / easy / tempo / interval / long / strength)

   Loads the latest plan on mount. Save commits a full plan upsert.
   ──────────────────────────────────────────────────────────────────── */

/* 與中控台日曆格用同一組節奏（Coral、2.2s、可被 reduced-motion 關掉），
   讓「那一格在閃 → 點進來 → 這張卡也在閃」是同一個視覺語言。 */
const BRICK_GLOW_CSS = `
@keyframes drvnBrickGlow {
    0%, 100% { box-shadow: 0 0 0 1px rgba(249,92,75,0.25), 0 0 12px rgba(249,92,75,0.16); }
    50%      { box-shadow: 0 0 0 1px rgba(249,92,75,0.45), 0 0 24px rgba(249,92,75,0.32); }
}
.drvn-brick-glow { animation: drvnBrickGlow 2.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
    .drvn-brick-glow { animation: none; box-shadow: 0 0 0 1px rgba(249,92,75,0.45); }
}
`;

const BRICK_ICON = {
    recovery: RefreshCcw,
    easy:     Wind,
    long:     Mountain,
    tempo:    Zap,
    interval: Zap,
    strength: Dumbbell,
};

/* 🩹 2026-08 稽核：這裡的 label 原本全是英文（Recovery Jog / Tempo / Interval…），
   而 addBrick() 會拿它直接組出 brick 的 title（例如 "6KM Interval"），
   那個 title 之後會一路顯示到 Tracker / History / BrickDetailSheet ——
   全站唯一「會擴散」的語言不一致就是這條，所以優先改掉。 */
const CUSTOM_BRICK_OPTIONS = [
    { subtype: 'recovery', label: '恢復跑',   color: '#7BD3A5', defaults: { duration_min: 30, distance_km: 4 } },
    { subtype: 'easy',     label: '輕鬆跑',   color: '#D8F382', defaults: { duration_min: 45, distance_km: 7 } },
    { subtype: 'tempo',    label: '節奏跑',   color: '#FF99DC', defaults: { duration_min: 40, distance_km: 7 } },
    { subtype: 'interval', label: '間歇跑',   color: C.coral,   defaults: { duration_min: 35, distance_km: 6 } },
    { subtype: 'long',     label: '長距離跑', color: '#D8F382', defaults: { duration_min: 90, distance_km: 16 } },
    { subtype: 'strength', label: '重訓',     color: C.paper2,  defaults: { duration_min: 45, distance_km: null } },
];

const RPE_FOR_SUBTYPE = {
    recovery: { min: 3, max: 4, label: '恢復', color: '#7BD3A5' },
    easy:     { min: 5, max: 6, label: '輕鬆',     color: '#D8F382' },
    long:     { min: 5, max: 6, label: '輕鬆',     color: '#D8F382' },
    tempo:    { min: 7, max: 8, label: '節奏',    color: '#FF99DC' },
    /* 「英里配速」是全站唯一混進來的英里制字樣（其餘一律 /km、分/公里），
       而且對使用者來說也不知道那是多快 —— 改成講強度的說法。 */
    interval: { min: 9, max: 9, label: '衝刺',     color: C.coral },
    strength: { min: 5, max: 6, label: '輕鬆',     color: C.paper2 },
};

const SUBTYPE_TO_BACKEND = {
    recovery: 'recovery', easy: 'recovery', long: 'long',
    tempo: 'speed', interval: 'speed', strength: 'strength',
};

const uuid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════

const CardioPlanEditor = ({ onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const userId = getUserId();

    /* 🩹 2026-08 稽核：這支以前完全沒有讀 location.state ——
       中控台的「幫我改週X那趟」就算跳過來了，也只是打開編輯頁，
       不會告訴使用者「是哪一堂、要改什麼」，等於導引鏈路缺最後一塊。
       這裡接上：捲到那張卡、套呼吸燈、並在上方掛一條為什麼要改的提示。
       （專案沒有用 query string 的先例，一律走 location.state，
        對齊 LuxuryPlanViewMobile 既有的 targetMuscleGroups 高亮做法。） */
    const highlightBrickId = location.state?.highlightBrickId || null;
    const reduceHint = location.state?.reduceHint || null;
    const [hintDismissed, setHintDismissed] = useState(false);

    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeWeekIdx, setActiveWeekIdx] = useState(0);
    const [showAddSheet, setShowAddSheet] = useState(false);
    const [dirty, setDirty] = useState(false);

    // ── Load latest plan ───────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!userId) { setLoading(false); return; }
            try {
                const res = await apiClient.get(`/api/cardio-plan/${userId}/latest`);
                if (!cancelled) setPlan(res.data?.plan || null);
            } catch (e) {
                console.warn('[PlanEditor] load failed', e?.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [userId]);

    const weeks = plan?.weeks || [];
    const activeWeek = weeks[activeWeekIdx] || null;

    // ── Mutations ─────────────────────────────────────────
    const mutate = useCallback((fn) => {
        setPlan((prev) => {
            if (!prev) return prev;
            const next = JSON.parse(JSON.stringify(prev));
            fn(next);
            setDirty(true);
            return next;
        });
    }, []);

    const deleteBrick = (weekIdx, brickId) => {
        mutate((p) => {
            const w = p.weeks[weekIdx];
            if (w) w.bricks = w.bricks.filter((b) => b.brick_id !== brickId);
        });
    };

    // ══════════════════════════════════════════════════════════════════════
    // 📏 里程調整 —— 夾在合理範圍內，且「課名與分級同幀跟著改」
    //
    // 使用者要求：
    //   「你去調整長跑給短跑的範圍。像是 3.2 公里叫輕鬆跑，
    //     那如果跑者一直加里程到 16 公里呢？應該就是升級成長跑了吧。」
    //
    // 規則（單一真相源 utils/runDistanceClass.js）：
    //   • 步進 0.5 km，上下限依課別（恢復跑 2–6、輕鬆跑 2–12、中距離 6–16…）
    //   • 跨越 6 km / 12 km 邊界 → subtype、title、chip、預估時間全部同幀更新
    //   • 跨界時給一次 medium 觸覺，讓使用者知道「這堂課的性質變了」
    //   • 到上下限時不再變動（UI 端按鈕會變灰）
    // ══════════════════════════════════════════════════════════════════════
    const bumpBrick = (weekIdx, brickId, delta) => {
        let crossedBand = false;
        let hitLimit = false;
        mutate((p) => {
            const w = p.weeks[weekIdx];
            const b = w?.bricks?.find((x) => x.brick_id === brickId);
            if (!b || b.distance_km == null) return;

            const prevKm = Number(b.distance_km) || 0;
            const prevBand = classifyDistance(prevKm);
            // ★ 用 stepRunDistance：課別是距離的結果，不是距離的牢籠。
            //   舊版加到 6 公里升級成「中距離」後就再也降不回來（中距離 min = 6）。
            //   baseKm 不傳當前值 —— 否則長跑上限會被自己推著漲（棘輪效應）
            const nextKm = stepRunDistance(b.subtype || b.type, prevKm, delta);

            if (nextKm === prevKm) { hitLimit = true; return; }

            b.distance_km = nextKm;
            // 課別與名稱一律重算（16 公里不能還叫輕鬆跑）
            const resolved = reconcileSubtypeWithDistance(b.subtype || b.type, nextKm);
            b.subtype = resolved;
            b.title = titleForRun(resolved, nextKm);
            // 預估時間跟著里程與該課別的目標配速重算，不再用「每公里 6 分」硬加
            const baseline = Number(p.meta?.baseline_pace_5k_sec) > 0 ? Number(p.meta.baseline_pace_5k_sec) : null;
            const shift = { recovery: 90, easy: 60, long: 45, medium: 52, tempo: -15, interval: -40 }[resolved] ?? 60;
            const paceSec = Number(b.target_pace_sec) > 0 ? Number(b.target_pace_sec) : (baseline ? baseline + shift : null);
            if (!paceSec) { hitLimit = true; return; }
            b.duration_min = Math.max(5, Math.round((nextKm * paceSec) / 60));

            crossedBand = classifyDistance(nextKm) !== prevBand;

            // recompute week total
            w.target_mileage_km = Math.round(
                w.bricks.reduce((s, x) => s + (x.distance_km || 0), 0) * 10
            ) / 10;
        });
        // 觸覺：跨界＝medium（性質變了）、到頂＝rigid（按不動）、一般＝light
        try {
            if (hitLimit) haptic('rigid');
            else if (crossedBand) haptic('medium');
            else haptic('light');
        } catch (_) { /* 非 iOS 忽略 */ }
    };

    /* 🧱 課別專屬的設定（間歇的趟數／每趟距離／休息、節奏跑的目標配速…）
       改完一律重算總里程、預估時間與週總量 —— 磚與週數字不能對不上。 */
    const patchBrick = (weekIdx, brickId, patch) => {
        mutate((p) => {
            const w = p.weeks[weekIdx];
            const b = w?.bricks?.find((x) => x.brick_id === brickId);
            if (!b) return;
            Object.assign(b, typeof patch === 'function' ? patch(b, p) : patch);
            const derived = deriveStructuredBrick(b, p.meta?.baseline_pace_5k_sec);
            Object.assign(b, derived);
            w.target_mileage_km = Math.round(
                w.bricks.reduce((s, x) => s + (x.distance_km || 0), 0) * 10
            ) / 10;
        });
        try { haptic('light'); } catch (_) { }
    };

    // 🖐 拖曳放開後：把新順序寫回 plan（會標記 dirty → 存檔時持久化）
    const reorderBricks = (weekIdx, nextBricks) => {
        mutate((p) => {
            const w = p.weeks[weekIdx];
            if (!w || !Array.isArray(nextBricks)) return;
            w.bricks = nextBricks;
        });
    };

    // ♿ 鍵盤／點擊版的上下移（dir = -1 上移、+1 下移）
    const moveBrick = (weekIdx, brickId, dir) => {
        mutate((p) => {
            const w = p.weeks[weekIdx];
            if (!w) return;
            const i = w.bricks.findIndex((x) => x.brick_id === brickId);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= w.bricks.length) return;
            const arr = w.bricks;
            [arr[i], arr[j]] = [arr[j], arr[i]];
        });
        try { haptic('light'); } catch (_) { }
    };

    const addBrick = (opt) => {
        mutate((p) => {
            const w = p.weeks[activeWeekIdx];
            if (!w) return;
            const rpe = RPE_FOR_SUBTYPE[opt.subtype];
            w.bricks.push({
                brick_id: uuid(),
                type: SUBTYPE_TO_BACKEND[opt.subtype] || 'recovery',
                subtype: opt.subtype,
                title: `${opt.defaults.distance_km != null ? opt.defaults.distance_km + 'KM ' : ''}${opt.label}`,
                rpe_band: { ...rpe },
                duration_min: opt.defaults.duration_min,
                distance_km: opt.defaults.distance_km,
                target_pace_sec: null,
                target_pace_label: null,
                theme_id: opt.subtype,
                status: 'pending',
                completed_session_id: null,
                completed_at: null,
                actual_distance_km: null,
            });
            w.target_mileage_km = Math.round(
                w.bricks.reduce((s, x) => s + (x.distance_km || 0), 0) * 10
            ) / 10;
        });
        setShowAddSheet(false);
    };

    const rerollWeek = (weekIdx) => {
        mutate((p) => {
            const w = p.weeks[weekIdx];
            if (!w) return;
            const subtypes = composeBrickTypes({
                phase: w.phase || 'build',
                isDeload: !!w.is_deload,
                sessionsPerWeek: Math.max(3, w.bricks.length || 4),
                goal: p.goal || 'aerobic_base',
                includeStrength: p.meta?.include_strength ?? true,
            });
            const fresh = materializeBricks(
                subtypes,
                w.target_mileage_km || 30,
                p.goal || 'aerobic_base',
                p.meta?.baseline_pace_5k_sec || null,
                p.current_level || 'intermediate'   // ★ v2.0 長跑安全上限依程度封頂
            );
            w.bricks = fresh;
        });
    };

    // ── Save ──────────────────────────────────────────────
    const handleSave = async () => {
        if (!plan || !userId) return;
        setSaving(true);
        try {
            await apiClient.post('/api/cardio-plan/save', { user_id: userId, plan });
            setDirty(false);
            onClose ? onClose() : navigate(-1);
        } catch (e) {
            console.warn('[PlanEditor] save failed:', e?.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Render ─────────────────────────────────────────────
    if (loading) {
        return (
            <div className="fixed inset-0 z-[100100] flex items-center justify-center" style={{ background: C.paper }}>
                <span className="text-[9px] font-extrabold tracking-[0.22em] uppercase" style={{ color: C.ink }}>
                    Loading plan…
                </span>
            </div>
        );
    }
    if (!plan) {
        return (
            <div className="fixed inset-0 z-[100100] flex items-center justify-center px-6" style={{ background: C.paper }}>
                <div className="text-center">
                    <div className="text-[9px] font-extrabold tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        NO PLAN YET
                    </div>
                    <div className="text-[18px] font-light leading-snug mb-6" style={{ color: C.ink }}>
                        Build a plan first.<br />Then come back to fine-tune.
                    </div>
                    <motion.button {...pressProps('icon')}
 onClick={() => navigate('/cardio-plan-builder')}
 className="px-5 py-2 rounded-full text-[9px] font-extrabold tracking-[0.18em] uppercase"
 style={{ background: 'linear-gradient(135deg, #2A2724 0%, #161415 100%)', color: C.paper }}
 >
                        Build Plan
                    </motion.button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 z-[100100] flex flex-col"
            style={{
                background: 'radial-gradient(120% 70% at 50% -10%, #FFFFFF 0%, #F6F4F1 38%, #E9E3D8 100%)',
                color: C.ink,
                fontFamily: 'var(--font-body)',
            }}
        >
            <style>{BRICK_GLOW_CSS}</style>
            <Header
                onBack={() => (onClose ? onClose() : navigate(-1))}
                dirty={dirty}
            />

            {/* Week tab strip */}
            <WeekTabs
                weeks={weeks}
                activeIdx={activeWeekIdx}
                onSelect={setActiveWeekIdx}
            />

            <div className="relative flex-1 overflow-y-auto px-6 pb-6">
                {activeWeek && (
                    <>
                        <WeekHero
                            week={activeWeek}
                        />

                        <div className="mt-7 flex items-baseline justify-between">
                            <SectionLabel>訓練磚</SectionLabel>
                            <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.32)' }}>
                                長按卡片可上下調整順序
                            </span>
                        </div>
                        {/* ══════════════════════════════════════════════════
                            🖐 可拖曳排序（使用者要求：卡牌要能點擊滑移做上下調整）
                              • 長按 250ms 才進入拖曳 → 不會跟「點擊 / 按 ± 」打架
                              • 拖曳中卡片放大 1.02、陰影加深、其他卡 spring 讓位
                              • 放開即寫回 bricks 順序並持久化，編號 01/02/03 重排
                            ══════════════════════════════════════════════════ */}
                        {/* 為什麼被帶到這裡：一句話講清楚，並保留關掉的權利 */}
                        {reduceHint && !hintDismissed && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-3 rounded-[16px] px-4 py-3 flex items-start gap-2.5"
                                style={{
                                    background: 'rgba(249,92,75,0.07)',
                                    border: '1px solid rgba(249,92,75,0.22)',
                                }}
                            >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="text-[12px] font-extrabold tracking-[0.24em] mb-1" style={{ color: C.coral }}>
                                        建議調整
                                    </div>
                                    <p className="text-[12px] leading-relaxed m-0" style={{ color: 'rgba(22,20,21,0.68)' }}>
                                        {reduceHint}
                                    </p>
                                </div>
                                <motion.button {...pressProps('icon')}
 type="button"
 aria-label="關閉提示"
 onClick={() => setHintDismissed(true)}
 className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
 style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(22,20,21,0.35)' }}
 >
                                    <X size={13} strokeWidth={2.4} />
                                </motion.button>
                            </motion.div>
                        )}

                        <Reorder.Group
                            as="div"
                            axis="y"
                            values={activeWeek.bricks}
                            onReorder={(next) => reorderBricks(activeWeekIdx, next)}
                            className="mt-3 flex flex-col"
                            style={{ borderTop: SWISS.hairline }}
                        >
                            {activeWeek.bricks.map((b, i) => (
                                <ReorderableBrick
                                    key={b.brick_id}
                                    brick={b}
                                    index={i}
                                    highlighted={!!highlightBrickId && b.brick_id === highlightBrickId}
                                    onBump={(d) => bumpBrick(activeWeekIdx, b.brick_id, d)}
                                    onPatch={(patch) => patchBrick(activeWeekIdx, b.brick_id, patch)}
                                    baselinePace={plan?.meta?.baseline_pace_5k_sec}
                                    onDelete={() => deleteBrick(activeWeekIdx, b.brick_id)}
                                    onMove={(dir) => moveBrick(activeWeekIdx, b.brick_id, dir)}
                                    isFirst={i === 0}
                                    isLast={i === activeWeek.bricks.length - 1}
                                />
                            ))}
                        </Reorder.Group>
                        <div className="mt-2 flex flex-col gap-2">
                            <motion.button
                                whileTap={{ scale: 0.985 }}
                                onClick={() => setShowAddSheet(true)}
                                className="mt-2 rounded-[18px] py-4 flex items-center justify-center gap-2"
                                style={{
                                    border: '1.5px dashed rgba(22,20,21,0.28)',
                                    background: 'transparent',
                                    color: C.ink,
                                }}
                            >
                                <Plus size={16} strokeWidth={2.4} />
                                <span className="text-[9px] font-extrabold tracking-[0.20em] uppercase">
                                    Add brick
                                </span>
                            </motion.button>
                        </div>
                    </>
                )}
            </div>

            <FooterCTA
                onSave={handleSave}
                saving={saving}
                dirty={dirty}
            />

            {/* Add brick sheet */}
            <AnimatePresence>
                {showAddSheet && (
                    <AddBrickSheet
                        onClose={() => setShowAddSheet(false)}
                        onPick={addBrick}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default CardioPlanEditor;

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════

const Header = ({ onBack, dirty }) => (
    /* 上緣讓出瀏海／動態島：原本固定 pt-12，在動態島機型上標題會被狀態列卡住 */
    <div className="relative z-10 px-6 pb-3 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}>
        <motion.button {...pressProps('pill')} aria-label="返回"
 onClick={onBack}
 className="w-10 h-10 rounded-full flex items-center justify-center "
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
                編輯器
            </span>
            <span className="text-[12px] font-extrabold tracking-[0.20em]" style={{ color: C.ink }}>
                微調計劃
            </span>
        </div>
        <div
            className="w-10 h-10 flex items-center justify-center"
            style={{ opacity: dirty ? 1 : 0.25 }}
        >
            <div
                className="w-2 h-2 rounded-full"
                style={{ background: dirty ? C.coral : C.sand, boxShadow: dirty ? '0 0 0 4px rgba(249,92,75,0.20)' : 'none' }}
            />
        </div>
    </div>
);

const WeekTabs = ({ weeks, activeIdx, onSelect }) => (
    <div className="px-6 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center gap-2">
            {weeks.map((w, i) => {
                const active = i === activeIdx;
                const phaseColor = { base: '#7BD3A5', build: '#D8F382', peak: C.coral, taper: '#A5C4FF' }[w.phase] || C.sand;
                return (
                    <motion.button {...pressProps('pill')}
 key={w.week_index}
 onClick={() => onSelect(i)}
 className="shrink-0 rounded-full px-3 py-1.5 flex items-center gap-1.5 "
 style={{
 background: active ? 'linear-gradient(135deg, #2A2724 0%, #161415 100%)' : 'rgba(255,255,255,0.7)',
 color: active ? C.paper : C.ink,
 border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(22,20,21,0.10)',
 }}
 >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: phaseColor }} />
                        <span className="text-[9px] font-extrabold tracking-[0.16em]">
                            WK{String(w.week_index).padStart(2, '0')}
                        </span>
                        {w.is_deload && (
                            <span
                                className="text-[9px] font-extrabold tracking-[0.18em]"
                                style={{ color: active ? 'rgba(246,244,241,0.55)' : 'rgba(22,20,21,0.45)' }}
                            >
                                · D
                            </span>
                        )}
                    </motion.button>
                );
            })}
        </div>
    </div>
);

const WeekHero = ({ week }) => {
    const phaseColor = { base: '#7BD3A5', build: '#D8F382', peak: C.coral, taper: '#A5C4FF' }[week.phase] || C.sand;
    return (
        <div className="pt-4">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: phaseColor, boxShadow: `0 0 0 3px ${phaseColor}28` }} />
                <span className="text-[12px] font-extrabold tracking-[0.28em]" style={{ color: 'rgba(22,20,21,0.50)' }}>
                    {{ base: '基礎', build: '建立', peak: '巔峰', taper: '減量' }[week.phase] || week.phase}{week.is_deload && ' · 減量週'}
                </span>
            </div>
            <div className="flex items-end justify-between">
                <div>
                    <div className="font-light" style={{ fontSize: 42, lineHeight: 0.95, letterSpacing: '-0.03em', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                        {week.target_mileage_km}
                    </div>
                    <div className="text-[12px] font-extrabold tracking-[0.20em] mt-1.5" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        公里 · 目標
                    </div>
                </div>
                {/* ★ v2.3 移除「重新生成」——
                    這頁的用途是「微調我自己的課表」。放一顆會把整週打掉重擲的按鈕，
                    等於邀請使用者把剛剛的調整全部丟掉，而且擲出來的結果不受安全閘之外的
                    任何脈絡約束。要換課表就回計劃建立流程重生成，不該藏在微調頁。 */}
            </div>
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════════
// 🖐 ReorderableBrick — 長按進入拖曳的訓練磚卡
//
// 為什麼要長按而不是直接可拖：卡片上有 ± 按鈕與刪除鈕，
// 若整張卡都能拖，使用者想按 + 卻會變成拖走，操作會很挫折。
// 250ms 長按門檻讓「點擊」與「拖曳」明確分開（iOS 慣例）。
//
// 無障礙：另提供「上移／下移」的鍵盤可及動作，不強迫所有人都要能拖。
// ══════════════════════════════════════════════════════════════════════════
const ReorderableBrick = ({ brick, index, onBump, onPatch, baselinePace, onDelete, onMove, isFirst, isLast, highlighted = false }) => {
    const controls = useDragControls();
    const [dragging, setDragging] = useState(false);
    const holdTimerRef = React.useRef(null);
    const rowRef = React.useRef(null);

    /* 從中控台「幫我改週X那趟」跳過來時，把該堂課捲進畫面並套呼吸燈 ——
       「跳到編輯頁」和「跳到編輯頁還指給你看哪裡要改」差別就在這裡。 */
    React.useEffect(() => {
        if (!highlighted || !rowRef.current) return;
        const t = setTimeout(() => {
            try { rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ }
        }, 320);
        return () => clearTimeout(t);
    }, [highlighted]);

    const startHold = (e) => {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        // 記住原始事件，250ms 後才真正開始拖
        const evt = e;
        holdTimerRef.current = setTimeout(() => {
            setDragging(true);
            try { haptic('medium'); } catch (_) { }
            controls.start(evt);
        }, 250);
    };
    const cancelHold = () => {
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    };
    React.useEffect(() => () => cancelHold(), []);

    return (
        <Reorder.Item
            as="div"
            ref={rowRef}
            value={brick}
            dragListener={false}
            dragControls={controls}
            onDragEnd={() => { setDragging(false); try { haptic('light'); } catch (_) { } }}
            className={highlighted ? 'drvn-brick-glow' : undefined}
            style={{
                listStyle: 'none', position: 'relative', touchAction: 'pan-y',
                borderRadius: highlighted ? 16 : undefined,
            }}
            animate={{
                scale: dragging ? 1.02 : 1,
                boxShadow: dragging
                    ? '0 18px 40px -12px rgba(22,20,21,0.35)'
                    : '0 0px 0px rgba(0,0,0,0)',
                zIndex: dragging ? 10 : 1,
            }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
        >
            <BrickEditCard
                brick={brick}
                index={index}
                onBump={onBump}
                onPatch={onPatch}
                baselinePace={baselinePace}
                onDelete={onDelete}
                onMove={onMove}
                isFirst={isFirst}
                isLast={isLast}
            />
        </Reorder.Item>
    );
};

const BrickEditCard = ({ brick, index = 0, onBump, onPatch, baselinePace, onDelete, onMove, isFirst, isLast }) => {
    // 🏷️ 分級 chip / 上下限 / 下一步預告 —— 全部從里程即時推導（單一真相源）
    const km = Number(brick.distance_km) || 0;
    const subtype = brick.subtype || brick.type;
    const chip = chipForRun(subtype, km);
    const range = effectiveRangeFor(subtype, km);
    const atMin = km > 0 && km <= range.min;
    const atMax = km > 0 && km >= range.max;
    const upPreview = previewDistanceStep(subtype, km, +1, km);
    const Icon = BRICK_ICON[brick.subtype || brick.type] || Wind;
    const color = brick.rpe_band?.color || '#7BD3A5';
    return (
        // 🇨🇭 瑞士大膽極簡：拿掉圓角玻璃卡，改成「編號 + 髮絲線」的清單列。
        //    裝飾越少，里程那個大數字才越有份量。
        <div
            className="relative"
            style={{ padding: '18px 4px', borderBottom: SWISS.hairline, background: 'transparent' }}
        >
            <div className="relative z-10 flex items-center gap-4">
                {/* 左側編號（雜誌感，不佔色彩預算） */}
                <span style={indexNumber}>{String(index + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ ...TYPE.body, fontWeight: 600, color: C.ink }}>
                        {brick.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        {/* 🏷️ 分級 chip — 由「里程」決定（EASY / MEDIUM / LONG），
                            調整器一改里程，這裡同幀變色變字。 */}
                        <span style={{ ...TYPE.micro, fontSize: 11, color: chip.color }}>
                            {chip.text}
                        </span>
                        <span aria-hidden style={{ width: 1, height: 9, background: 'rgba(22,20,21,0.16)' }} />
                        <span style={{ ...TYPE.micro, fontSize: 12, color: 'rgba(22,20,21,0.35)', letterSpacing: '0.14em' }}>
                            {brick.duration_min} 分鐘
                        </span>
                    </div>
                </div>
                {/* ♿ 無障礙：不靠拖曳也能調整順序 */}
                {onMove && (
                    <div className="flex flex-col gap-0.5 shrink-0">
                        <motion.button {...pressProps('icon')}
 aria-label="上移一位"
 disabled={isFirst}
 onClick={(e) => { e.stopPropagation(); onMove(-1); }}
 className={`w-6 h-5 rounded flex items-center justify-center ${isFirst ? 'opacity-20' : ''}`}
 style={{ background: 'rgba(22,20,21,0.05)' }}
 >
                            <ChevronUp size={11} color={C.ink} strokeWidth={2.6} />
                        </motion.button>
                        <motion.button {...pressProps('icon')}
 aria-label="下移一位"
 disabled={isLast}
 onClick={(e) => { e.stopPropagation(); onMove(1); }}
 className={`w-6 h-5 rounded flex items-center justify-center ${isLast ? 'opacity-20' : ''}`}
 style={{ background: 'rgba(22,20,21,0.05)' }}
 >
                            <ChevronDown size={11} color={C.ink} strokeWidth={2.6} />
                        </motion.button>
                    </div>
                )}
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={onDelete}
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(217,64,48,0.10)', color: C.coralDeep }}
                >
                    <Trash2 size={13} strokeWidth={2.2} />
                </motion.button>
            </div>

            {/* 間歇跑的總里程由「趟數 × 每趟距離 ＋ 熱身收操」決定，不給里程 ± */}
            {brick.distance_km != null && subtype !== 'interval' && (
                <>
                    <div className="mt-3 relative z-10 flex items-center justify-between" style={{ paddingTop: 12, borderTop: SWISS.hairline }}>
                        <motion.button {...pressProps('icon')}
 onClick={() => !atMin && onBump(-0.5)}
 disabled={atMin}
 aria-label="減少 0.5 公里"
 className={`w-8 h-8 flex items-center justify-center transition-opacity ${atMin ? 'opacity-25' : ''}`}
 style={{ background: 'transparent', border: 'none', cursor: atMin ? 'not-allowed' : 'pointer' }}
 >
                            <Minus size={13} color={C.ink} strokeWidth={2.4} />
                        </motion.button>
                        <div className="flex flex-col items-center">
                            <div className="flex items-baseline gap-1">
                                <span style={{ ...TYPE.display, fontSize: 38, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                                    {brick.distance_km}
                                </span>
                                <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.38)' }}>
                                    KM
                                </span>
                            </div>
                            {/* 🔭 下一步預告：再按一次會不會變成另一種課 */}
                            {upPreview.willChangeBand && !atMax && (
                                <span className="text-[11px] font-bold mt-0.5" style={{ color: chip.color }}>
                                    再 +0.5 → {upPreview.nextTitle.replace(/^[\d.]+ 公里 /, '')}
                                </span>
                            )}
                        </div>
                        <motion.button {...pressProps('icon')}
 onClick={() => !atMax && onBump(0.5)}
 disabled={atMax}
 aria-label="增加 0.5 公里"
 className={`w-8 h-8 flex items-center justify-center transition-opacity ${atMax ? 'opacity-25' : ''}`}
 style={{ background: 'transparent', border: 'none', cursor: atMax ? 'not-allowed' : 'pointer' }}
 >
                            <Plus size={13} color={C.ink} strokeWidth={2.4} />
                        </motion.button>
                    </div>
                    {/* 到上下限時說明原因，不要讓按鈕默默失效 */}
                    {(atMin || atMax) && (
                        <p className="text-[11px] font-bold leading-relaxed mt-1.5 px-1 relative z-10" style={{ color: 'rgba(22,20,21,0.42)' }}>
                            {atMax ? `已到 ${range.max} 公里上限 — ${range.hint}` : `已到 ${range.min} 公里下限 — 再短就沒有訓練效果了。`}
                        </p>
                    )}
                </>
            )}

            {/* 🧱 每種課有自己的處方：不是只有里程不同 */}
            {brick.distance_km != null && onPatch && (
                <BrickPrescription brick={brick} subtype={subtype} onPatch={onPatch} baselinePace={baselinePace} />
            )}
        </div>
    );
};

/* ════════════════════════════════════════════════════════════════════
   🧱 課別處方 —— 每張卡依性質顯示、調整不同的東西
   ────────────────────────────────────────────────────────────────────
   規格書 B1 定義了恢復／輕鬆／中距離／長跑／節奏／間歇是不同的課，
   但編輯器原本每張卡都只有「里程 ±」，看起來只是距離不同。這裡補上：
     • 恢復／輕鬆／中距離／長跑：配速區間＋這堂課的重點（強度靠「慢」來控制）
     • 節奏跑：熱身 → 節奏段 → 收操，節奏段配速可調
     • 間歇跑：趟數 × 每趟距離、組間休息、每趟配速，總里程自動算
   ════════════════════════════════════════════════════════════════════ */
const WARMUP_KM = 1.5;
const COOLDOWN_KM = 1;
const REP_DISTANCES = [400, 800, 1000, 1600];
const REST_OPTIONS = [60, 90, 120, 180];
// 與生成引擎同一份偏移（舊版這裡有自己一份過期的副本：節奏 −15／間歇 −40，編輯後配速會跳）
const PACE_SHIFT = PACE_SHIFT_BY_SUBTYPE;

const fmtPace = (sec) => {
    const s = Math.max(1, Math.round(Number(sec) || 0));
    return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
};
const round1 = (x) => Math.round(x * 10) / 10;

const basePaceOf = (brick, baseline) => {
    const sub = brick.subtype || brick.type;
    if (Number(brick.target_pace_sec) > 0) return Number(brick.target_pace_sec);
    const b = Number(baseline) > 0 ? Number(baseline) : 360;
    return b + (PACE_SHIFT[sub] ?? 60);
};

/** 依課別結構重算 title / distance / duration（間歇與節奏跑才需要） */
export function deriveStructuredBrick(b, baseline) {
    const sub = b.subtype || b.type;
    const pace = basePaceOf(b, baseline);
    const easyPace = pace + (sub === 'interval' ? 100 : 75);   // 熱身收操用輕鬆配速
    if (sub === 'interval' && b.interval) {
        const { reps, rep_m, rest_s } = b.interval;
        const workKm = (reps * rep_m) / 1000;
        const distance_km = round1(workKm + WARMUP_KM + COOLDOWN_KM);
        const duration_min = Math.max(10, Math.round(
            (workKm * pace + (WARMUP_KM + COOLDOWN_KM) * easyPace + rest_s * Math.max(0, reps - 1)) / 60));
        return {
            distance_km, duration_min,
            title: `${reps} × ${rep_m >= 1000 ? `${rep_m / 1000} 公里` : `${rep_m} 公尺`} 間歇跑`,
            target_pace_sec: pace, target_pace_label: fmtPace(pace).replace('"', ''),
        };
    }
    if (sub === 'tempo') {
        const tempoKm = Math.max(1, round1((Number(b.distance_km) || 0) - WARMUP_KM - COOLDOWN_KM));
        const duration_min = Math.max(10, Math.round((tempoKm * pace + (WARMUP_KM + COOLDOWN_KM) * easyPace) / 60));
        return { duration_min, target_pace_sec: pace, target_pace_label: fmtPace(pace).replace('"', ''), tempo: { tempo_km: tempoKm } };
    }
    return { target_pace_sec: pace, target_pace_label: fmtPace(pace).replace('"', '') };
}

const FOCUS_COPY = {
    recovery: { zone: '心率區間 1', focus: '重點是「輕」：跑完應該比開始時更有精神。' },
    easy:     { zone: '心率區間 2', focus: '可以完整說話的速度，累積有氧底子。' },
    medium:   { zone: '心率區間 2–3', focus: '穩定前進，後段不掉速。' },
    long:     { zone: '心率區間 2', focus: '慢就是對的；超過 60 分鐘記得補水。' },
};

const Stepper = ({ label, value, onMinus, onPlus, minusDisabled, plusDisabled }) => (
    <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
        <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.45)', letterSpacing: '0.14em' }}>{label}</span>
        <div className="flex items-center gap-3">
            <motion.button {...pressProps('icon')} onClick={onMinus} disabled={minusDisabled} aria-label={`${label} 減少`}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${minusDisabled ? 'opacity-25' : ''}`}
                style={{ background: 'rgba(22,20,21,0.05)', border: 'none' }}>
                <Minus size={12} color={C.ink} strokeWidth={2.4} />
            </motion.button>
            <span style={{ minWidth: 74, textAlign: 'center', fontSize: 17, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            <motion.button {...pressProps('icon')} onClick={onPlus} disabled={plusDisabled} aria-label={`${label} 增加`}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${plusDisabled ? 'opacity-25' : ''}`}
                style={{ background: 'rgba(22,20,21,0.05)', border: 'none' }}>
                <Plus size={12} color={C.ink} strokeWidth={2.4} />
            </motion.button>
        </div>
    </div>
);

const ChipRow = ({ label, options, value, format, onPick }) => (
    <div style={{ padding: '8px 0' }}>
        <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.45)', letterSpacing: '0.14em' }}>{label}</span>
        <div className="flex gap-2 mt-2">
            {options.map((o) => {
                const on = o === value;
                return (
                    <motion.button {...pressProps('pill')} key={o} onClick={() => onPick(o)}
                        className="flex-1 rounded-full py-2"
                        style={{ background: on ? C.ink : 'rgba(255,255,255,0.7)', color: on ? C.paper : C.ink, border: on ? 'none' : '1px solid rgba(22,20,21,0.10)', fontSize: 12.5, fontWeight: 700 }}>
                        {format(o)}
                    </motion.button>
                );
            })}
        </div>
    </div>
);

const BrickPrescription = ({ brick, subtype, onPatch, baselinePace }) => {
    const pace = basePaceOf(brick, baselinePace);
    const box = { marginTop: 10, paddingTop: 6, borderTop: SWISS.hairline };
    const paceStep = (d) => onPatch((b) => ({ target_pace_sec: Math.min(600, Math.max(170, basePaceOf(b, baselinePace) + d)) }));

    if (subtype === 'interval') {
        const iv = brick.interval || (() => {
            const workKm = Math.max(1.6, (Number(brick.distance_km) || 6) - WARMUP_KM - COOLDOWN_KM);
            return { reps: Math.min(10, Math.max(3, Math.round((workKm * 1000) / 800))), rep_m: 800, rest_s: 90 };
        })();
        const setIv = (patch) => onPatch(() => ({ interval: { ...iv, ...patch } }));
        return (
            <div className="relative z-10" style={box}>
                <Stepper label="趟數" value={`${iv.reps} 趟`}
                    onMinus={() => setIv({ reps: Math.max(3, iv.reps - 1) })} minusDisabled={iv.reps <= 3}
                    onPlus={() => setIv({ reps: Math.min(16, iv.reps + 1) })} plusDisabled={iv.reps >= 16} />
                <ChipRow label="每趟距離" options={REP_DISTANCES} value={iv.rep_m}
                    format={(m) => (m >= 1000 ? `${m / 1000}K` : `${m}m`)} onPick={(m) => setIv({ rep_m: m })} />
                <ChipRow label="組間休息" options={REST_OPTIONS} value={iv.rest_s}
                    format={(s) => `${s} 秒`} onPick={(s) => setIv({ rest_s: s })} />
                <Stepper label="每趟配速" value={`${fmtPace(pace)}/km`}
                    onMinus={() => paceStep(-5)} onPlus={() => paceStep(5)} />
                <p className="text-[11.5px] font-semibold leading-relaxed mt-1" style={{ color: 'rgba(22,20,21,0.5)' }}>
                    熱身 {WARMUP_KM} 公里 → {iv.reps} × {iv.rep_m} 公尺（每趟休 {iv.rest_s} 秒）→ 收操 {COOLDOWN_KM} 公里，共 {brick.distance_km} 公里
                </p>
            </div>
        );
    }

    if (subtype === 'tempo') {
        const tempoKm = Math.max(1, round1((Number(brick.distance_km) || 0) - WARMUP_KM - COOLDOWN_KM));
        return (
            <div className="relative z-10" style={box}>
                <Stepper label="節奏段配速" value={`${fmtPace(pace)}/km`} onMinus={() => paceStep(-5)} onPlus={() => paceStep(5)} />
                <p className="text-[11.5px] font-semibold leading-relaxed mt-1" style={{ color: 'rgba(22,20,21,0.5)' }}>
                    熱身 {WARMUP_KM} 公里 → 節奏段 {tempoKm} 公里 @ {fmtPace(pace)} → 收操 {COOLDOWN_KM} 公里。節奏段是「有點吃力、但撐得住」的速度。
                </p>
            </div>
        );
    }

    const copy = FOCUS_COPY[subtype] || FOCUS_COPY.easy;
    return (
        <div className="relative z-10" style={box}>
            <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
                <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.45)', letterSpacing: '0.14em' }}>配速區間 · {copy.zone}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtPace(pace - 10)} – {fmtPace(pace + 15)}/km
                </span>
            </div>
            <p className="text-[11.5px] font-semibold leading-relaxed" style={{ color: 'rgba(22,20,21,0.5)' }}>{copy.focus}</p>
        </div>
    );
};

const AddBrickSheet = ({ onClose, onPick }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100200] flex items-end justify-center"
        style={{ background: 'rgba(22,20,21,0.45)' }}
        onClick={onClose}
    >
        <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-2 mb-2 rounded-[28px] p-6 pb-9"
            style={{
                background: 'linear-gradient(135deg, #F6F4F1 0%, #EFEBE3 50%, #DAD2C4 100%)',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 -14px 40px rgba(22,20,21,0.18)',
            }}
        >
            <div className="flex items-center justify-between mb-5">
                <div>
                    <div className="text-[9px] font-extrabold tracking-[0.28em] uppercase mb-1" style={{ color: 'rgba(22,20,21,0.50)' }}>
                        Add a session
                    </div>
                    {/* 「磚 / BRICK」是內部資料模型的工程隱喻，不該給使用者看到 */}
                    <div className="font-light" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>
                        加一堂課
                    </div>
                </div>
                <motion.button {...pressProps('pill')} aria-label="關閉"
 onClick={onClose}
 className="w-9 h-9 rounded-full flex items-center justify-center "
 style={{ background: 'rgba(22,20,21,0.06)' }}
 >
                    <X size={15} color={C.ink} />
                </motion.button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {CUSTOM_BRICK_OPTIONS.map((opt) => {
                    const Icon = BRICK_ICON[opt.subtype] || Wind;
                    return (
                        <motion.button {...pressProps('row')}
 key={opt.subtype}
 onClick={() => onPick(opt)}
 className="rounded-[18px] p-4 flex flex-col items-start gap-2 "
 style={{
 background: '#fff',
 border: '1px solid rgba(22,20,21,0.08)',
 boxShadow: '0 4px 10px rgba(22,20,21,0.05), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 >
                            <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                style={{ background: `${opt.color}35`, border: `1px solid ${opt.color}55` }}
                            >
                                <Icon size={15} color={C.ink} />
                            </div>
                            <div>
                                <div className="text-[13px] font-semibold text-left" style={{ color: C.ink }}>
                                    {opt.label}
                                </div>
                                <div className="text-[9px] font-extrabold tracking-[0.18em] uppercase mt-0.5 text-left" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                    {opt.defaults.duration_min}m
                                    {opt.defaults.distance_km != null && ` · ${opt.defaults.distance_km}km`}
                                </div>
                            </div>
                        </motion.button>
                    );
                })}
            </div>
        </motion.div>
    </motion.div>
);

const FooterCTA = ({ onSave, saving, dirty }) => (
    <div className="relative z-10 px-6 pb-10 pt-3">
        <div className="flex gap-[2px] mb-4 px-1">
            {['#FDD835', '#8BC34A', '#FF9800', '#F06292', '#5C6BC0'].map((c, i) => (
                <div key={i} className="flex-1 rounded-full" style={{ height: 3, background: c, opacity: 0.55 + i * 0.08 }} />
            ))}
        </div>
        <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onSave}
            disabled={saving || !dirty}
            className="w-full h-[58px] rounded-full flex items-center justify-center gap-3 relative overflow-hidden"
            style={{
                background: dirty
                    ? 'linear-gradient(135deg, #2A2724 0%, #161415 60%, #262523 100%)'
                    : 'linear-gradient(135deg, #DAD2C4 0%, #CFC6B8 100%)',
                color: dirty ? C.paper : 'rgba(22,20,21,0.55)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: dirty
                    ? '0 12px 30px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.16)'
                    : 'none',
                letterSpacing: '0.22em', fontWeight: 800, fontSize: 12,
                opacity: dirty ? 1 : 0.7,
            }}
        >
            {dirty && (
                <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 46%, transparent 62%)',
                        mixBlendMode: 'screen',
                    }}
                />
            )}
            <Save size={15} strokeWidth={2.4} />
            <span>{saving ? '儲存中…' : dirty ? '儲存變更' : '無變更'}</span>
        </motion.button>
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
