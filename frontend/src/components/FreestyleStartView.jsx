import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Zap, ListChecks, Plus, X, ChevronRight } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import FreestyleExercisePicker from './FreestyleExercisePicker';
import { getExerciseNameZh } from '../data/exerciseDatabase';

// ════════════════════════════════════════════════════════════════
// FreestyleStartView — 直接訓練模式入口
// step 'choose'  → 邊做邊填 / 先排好整份
// step 'pickOne' → 選第一個動作 → 直接進 session
// step 'planAll' → 先排好整份清單 → 開始訓練
// ════════════════════════════════════════════════════════════════

const PAPER = '#F6F4F1';
const INK = '#161415';
const CORAL = '#F95C4B';

// OPEN_ENDED_SETS：邊做邊填模式沒有預設組數 —— 組數由使用者邊做邊決定。
// 用一個大哨兵值當 sets_target，讓動作永遠不會「自動做完」，
// 每做完一組都進休息頁等使用者決定「再一組」或「完成此動作」。
const OPEN_ENDED_SETS = 99;

const toQueueExercise = (ex, live) => {
    const n = live ? OPEN_ENDED_SETS : Math.max(1, parseInt(ex.sets) || 3);
    return {
        name: ex.name,
        // ⚠️ 必須是「數字」：WorkoutSession 初始化會用 (ex.sets || 3) 算 sets_target，
        // 若傳空陣列 [] 會被當成 truthy → sets_target 變成 "0"，導致做一組就被判定完成。
        sets: n,
        sets_target: n,
        openEnded: !!live,        // 邊做邊填：組數開放，UI 不顯示「/ N 組」，做到自己按「完成此動作」
        reps: String(ex.reps || '8-12'),
        rest: String(ex.rest || '90s'),
        category: ex.category || ex.muscle || 'STRENGTH',
        muscle: ex.muscle,
        completed: false,
    };
};

const buildFreestyleDay = (exercises, live = false) => ({
    name: '自由訓練',
    plan_name: '自由訓練',
    title: '自由訓練',
    isFreestyle: true,
    fillWhileDoing: !!live,       // 只有「邊做邊填」是 true；「先排好整份」是 false
    week_number: 1,
    focus: [],
    exercises: exercises.map((ex) => toQueueExercise(ex, live)),
});

const FreestyleStartView = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState('choose');
    const [planned, setPlanned] = useState([]);   // 先排好整份模式的累積清單
    const [showPicker, setShowPicker] = useState(false);

    const startSession = (exercises, live = false) => {
        navigate('/training-session-mobile', {
            state: { day: buildFreestyleDay(exercises, live), freestyle: true },
            replace: true,
        });
    };

    // ── 邊做邊填：選第一個動作就開始（只填次數/休息，組數邊做邊決定）──
    if (step === 'pickOne') {
        return (
            <FreestyleExercisePicker
                title="選第一個動作"
                subtitle="只設次數與休息，組數邊做邊決定"
                confirmLabel="開始訓練"
                fillWhileDoing
                onBack={() => setStep('choose')}
                onConfirm={(ex) => startSession([ex], true)}
            />
        );
    }

    // ── 先排好整份 ──
    if (step === 'planAll') {
        if (showPicker) {
            return (
                <FreestyleExercisePicker
                    title="加入動作"
                    subtitle="選好設定後加入清單，可連續加入"
                    confirmLabel="加入清單"
                    onBack={() => setShowPicker(false)}
                    onConfirm={(ex) => { setPlanned((p) => [...p, ex]); setShowPicker(false); }}
                />
            );
        }
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: PAPER, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 'max(54px, env(safe-area-inset-top)) 22px 8px', flexShrink: 0 }}>
                    <motion.button {...pressProps('row')} onClick={() => setStep('choose')}
 style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(22,20,21,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ArrowLeft size={18} color="rgba(22,20,21,0.6)" />
                    </motion.button>
                    <p style={{ fontSize: 12, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.4)', fontFamily: '"Geist Mono", monospace', margin: '18px 0 0' }}>FREESTYLE · 先排好整份</p>
                    <h2 style={{ fontFamily: 'var(--font-display, "Tenor Sans", "Noto Sans TC", sans-serif)', fontSize: 28, fontWeight: 500, color: INK, margin: '6px 0 2px' }}>本次訓練清單</h2>
                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.45)', margin: 0, fontWeight: 500 }}>已加入 {planned.length} 個動作</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 16px' }}>
                    {planned.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 18px', color: 'rgba(22,20,21,0.35)' }}>
                            <Dumbbell size={32} color="rgba(22,20,21,0.18)" style={{ margin: '0 auto 12px' }} />
                            <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>還沒有動作</p>
                            <p style={{ fontSize: 12, margin: '4px 0 0' }}>點下方「新增動作」開始排課</p>
                        </div>
                    ) : planned.map((ex, i) => (
                        <div key={`${ex.name}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 13px', borderRadius: 18, marginBottom: 8, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: '"Geist Mono", monospace', fontSize: 13, color: 'rgba(22,20,21,0.55)' }}>{i + 1}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 600, fontSize: 14, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getExerciseNameZh(ex.name)}</p>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', margin: '2px 0 0', fontWeight: 500 }}>{ex.sets} 組 · {ex.reps} 次 · 休 {ex.rest}</p>
                            </div>
                            <motion.button {...pressProps('row')} onClick={() => setPlanned((p) => p.filter((_, idx) => idx !== i))}
 style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(22,20,21,0.05)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <X size={15} color="rgba(22,20,21,0.45)" />
                            </motion.button>
                        </div>
                    ))}

                    <motion.button {...pressProps('row')} onClick={() => setShowPicker(true)}
 style={{ width: '100%', height: 52, borderRadius: 16, border: '1.5px dashed rgba(22,20,21,0.18)', background: 'transparent', color: INK, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }}>
                        <Plus size={18} /> 新增動作
                    </motion.button>
                </div>

                <div style={{ flexShrink: 0, padding: '12px 22px max(20px, env(safe-area-inset-bottom))', background: PAPER, borderTop: '1px solid rgba(22,20,21,0.06)' }}>
                    <motion.button whileTap={{ scale: 0.97 }} disabled={planned.length === 0}
                        onClick={() => planned.length > 0 && startSession(planned)}
                        style={{ width: '100%', height: 58, borderRadius: 18, border: 'none', cursor: planned.length ? 'pointer' : 'not-allowed', color: '#fff',
                            background: planned.length ? 'linear-gradient(135deg, #F95C4B, #E04A39)' : 'rgba(22,20,21,0.18)',
                            fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: planned.length ? '0 8px 24px rgba(249,92,75,0.3)' : 'none' }}>
                        開始訓練{planned.length > 0 ? ` (${planned.length})` : ''} <ChevronRight size={18} />
                    </motion.button>
                </div>
            </div>
        );
    }

    // ── 選擇模式 ──
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: PAPER, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 'max(54px, env(safe-area-inset-top)) 22px 8px', flexShrink: 0 }}>
                <motion.button {...pressProps('row')} onClick={() => navigate(-1)}
 style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(22,20,21,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <ArrowLeft size={18} color="rgba(22,20,21,0.6)" />
                </motion.button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 24px', display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: 12, letterSpacing: '0.24em', color: CORAL, fontFamily: '"Geist Mono", monospace', margin: 0, fontWeight: 600 }}>FREESTYLE · 直接訓練</p>
                <h1 style={{ fontFamily: 'var(--font-display, "Tenor Sans", "Noto Sans TC", sans-serif)', fontSize: 38, fontWeight: 500, color: INK, margin: '8px 0 4px', lineHeight: 1.1 }}>
                    不用計劃<br />直接開練
                </h1>
                <p style={{ fontSize: 14, color: 'rgba(22,20,21,0.5)', margin: '8px 0 28px', fontWeight: 500, lineHeight: 1.6 }}>
                    選一種方式開始這次訓練，全程一樣計入紀錄。
                </p>

                <motion.button whileTap={{ scale: 0.98 }} onClick={() => setStep('pickOne')}
                    style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 24, padding: 22, marginBottom: 14,
                        background: 'linear-gradient(135deg, #1c1a1b 0%, #2a2729 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(249,92,75,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <Zap size={24} color={CORAL} />
                    </div>
                    <p style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)', fontFamily: '"Geist Mono", monospace', margin: 0 }}>RECOMMENDED</p>
                    <h3 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 6px' }}>邊做邊填</h3>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>選一個動作就開始，做完再選下一個。最自由，想練什麼臨時決定。</p>
                </motion.button>

                <motion.button whileTap={{ scale: 0.98 }} onClick={() => setStep('planAll')}
                    style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(22,20,21,0.08)', cursor: 'pointer', borderRadius: 24, padding: 22,
                        background: '#fff', color: INK }}>
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <ListChecks size={24} color={INK} />
                    </div>
                    <p style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(22,20,21,0.4)', fontFamily: '"Geist Mono", monospace', margin: 0 }}>PLAN AHEAD</p>
                    <h3 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 6px' }}>先排好整份</h3>
                    <p style={{ fontSize: 13, color: 'rgba(22,20,21,0.5)', margin: 0, lineHeight: 1.5 }}>先把今天要做的動作排成清單，確認後一次開始。心裡有數的人適用。</p>
                </motion.button>
            </div>
        </div>
    );
};

export default FreestyleStartView;
