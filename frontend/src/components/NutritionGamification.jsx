import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';
import { editorialColors } from '../utils/colors';
import { haptic } from '../utils/haptics';
// 🎯 目標與達成門檻的單一真相源 —— 進度條、成就、教練文案共用同一條線
import { resolveFiberGoal, resolveWaterGoal, pctOf, isGoalHit, GOAL_HIT_RATIO } from '../utils/nutritionTargets';

// ─────────────────────────────────────────────────────────────────
// 1. PARTICLE BURST — 記錄食物後的粒子爆炸
// ─────────────────────────────────────────────────────────────────
export const ParticleBurst = ({ trigger, x, y, color = '#F95C4B' }) => {
    const [particles, setParticles] = useState([]);

    useEffect(() => {
        if (!trigger) return;
        const count = 18;
        const newParticles = Array.from({ length: count }, (_, i) => ({
            id: Date.now() + i,
            angle: (360 / count) * i + (Math.random() - 0.5) * 20,
            distance: 40 + Math.random() * 60,
            size: 3 + Math.random() * 5,
            duration: 0.5 + Math.random() * 0.4,
            color: [color, '#FFFFFF', '#D94030', '#CFC6B8'][Math.floor(Math.random() * 4)]
        }));
        setParticles(newParticles);
        setTimeout(() => setParticles([]), 1000);
    }, [trigger]);

    if (!particles.length) return null;

    return (
        <div className="fixed pointer-events-none z-[200]" style={{ left: x, top: y }}>
            {particles.map(p => {
                const rad = (p.angle * Math.PI) / 180;
                const tx = Math.cos(rad) * p.distance;
                const ty = Math.sin(rad) * p.distance;
                return (
                    <motion.div
                        key={p.id}
                        className="absolute rounded-full"
                        style={{
                            width: p.size, height: p.size,
                            background: p.color,
                            left: -p.size / 2, top: -p.size / 2,
                            boxShadow: `0 0 ${p.size * 2}px ${p.color}`
                        }}
                        initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                        animate={{ x: tx, y: ty, scale: 0, opacity: 0 }}
                        transition={{ duration: p.duration, ease: 'easeOut' }}
                    />
                );
            })}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// 2. FLOATING MACRO CHIP — 數字飛入 Ring 動畫
// ─────────────────────────────────────────────────────────────────
export const FloatingMacroChip = ({ calories, visible, origin, targetRef }) => {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (visible && origin && targetRef?.current) {
            const target = targetRef.current.getBoundingClientRect();
            setPos({ x: origin.x, y: origin.y });
            setTargetPos({ x: target.left + target.width / 2, y: target.top + target.height / 2 });
        }
    }, [visible, origin]);

    if (!visible) return null;

    return (
        <motion.div
            className="fixed pointer-events-none z-[150] flex items-center gap-2 px-4 py-2 rounded-full bg-[#F95C4B] shadow-xl shadow-[#F95C4B]/30 text-white font-black text-sm"
            initial={{ x: pos.x, y: pos.y, scale: 0.8, opacity: 0 }}
            animate={{ x: targetPos.x - 40, y: targetPos.y - 16, scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        >
            <Flame size={14} className="text-white/80" />
            +{calories} kcal
        </motion.div>
    );
};

// ─────────────────────────────────────────────────────────────────
// 3. MACRO MILESTONE TOAST — 達標瞬間提示
// ─────────────────────────────────────────────────────────────────
// 品牌色票（與 NutritionAnalysis.jsx 同步）
const C = editorialColors;

const MILESTONE_MESSAGES = {
    protein_80:   { icon: '↗', label: '蛋白質', title: '蛋白質快達標', desc: '距離目標剩一點點', accent: C.coral },
    protein_100:  { icon: '✓', label: '蛋白質', title: '蛋白質達標',   desc: '今日修復材料到位',   accent: C.coral },
    carbs_80:     { icon: '↗', label: '碳水',   title: '碳水補充中',   desc: '肝醣即將充滿',       accent: C.ember },
    calories_100: { icon: '✓', label: '熱量', title: '今日目標完成', desc: '完美收官',            accent: C.black },
    water_goal:   { icon: '✓', label: '水分', title: '水分充足',   desc: '今日補水超棒',        accent: C.pebble },
};

export const MacroMilestoneToast = ({ milestoneKey, visible, onDone }) => {
    const msg = MILESTONE_MESSAGES[milestoneKey];
    if (!msg || !visible) return null;

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    className="fixed top-14 left-1/2 -translate-x-1/2 z-[180] pointer-events-none"
                    initial={{ y: -12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                    onAnimationComplete={() => setTimeout(onDone, 2400)}
                >
                    {/* 瑞士極簡 pill — Paper 底 + 左側 accent 色線 */}
                    <div style={{
                        background: C.paper,
                        border: `1px solid ${C.stone}`,
                        borderLeft: `3px solid ${msg.accent}`,
                        boxShadow: '0 8px 24px rgba(22,20,21,0.12)',
                    }} className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-none min-w-[200px]">
                        {/* 狀態圖示 */}
                        <span className="text-base font-black w-4 text-center leading-none" style={{ color: msg.accent }}>
                            {msg.icon}
                        </span>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] mb-0.5" style={{ color: C.pebble }}>
                                {msg.label}
                            </p>
                            <p className="text-[13px] font-black leading-tight" style={{ color: C.black }}>{msg.title}</p>
                            <p className="text-[11px] font-medium" style={{ color: C.black, opacity: 0.45 }}>{msg.desc}</p>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ─────────────────────────────────────────────────────────────────
// 4. STREAK WIDGET — 連續記錄天數
// ─────────────────────────────────────────────────────────────────
export const StreakWidget = ({ streakDays = 0, recordedToday = false }) => {
    const isAlive = streakDays > 0;

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`flex items-center gap-2 px-3 py-2 rounded-[18px] border transition-all
                ${recordedToday
                    ? 'bg-[#F95C4B]/15 border-[#F95C4B]/30'
                    : isAlive
                        ? 'bg-[#F95C4B]/10 border-[#F95C4B]/20'
                        : 'bg-white/5 border-white/10'}`}
        >
            <motion.div
                animate={recordedToday ? {
                    scale: [1, 1.3, 1],
                    filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)']
                } : {}}
                transition={{ duration: 0.6, ease: 'backOut' }}
            >
                <Flame
                    size={18}
                    className={isAlive ? 'text-[#F95C4B]' : 'text-white/20'}
                    fill={recordedToday ? '#F95C4B' : 'none'}
                />
            </motion.div>
            <div className="flex flex-col leading-none">
                <motion.span
                    key={streakDays}
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className={`text-base font-black tabular-nums ${isAlive ? 'text-[#F95C4B]' : 'text-white/30'}`}
                >
                    {streakDays}
                </motion.span>
            </div>
        </motion.div>
    );
};

// ─────────────────────────────────────────────────────────────────
// 5. FAST REMINDER — 空腹超過 N 小時的擬人提醒
// ─────────────────────────────────────────────────────────────────
const FASTING_MESSAGES = [
    { hours: 5, emoji: '🤔', msg: '你的肌肉在等吃飯了', sub: '距離上次記錄已 {h} 小時' },
    { hours: 7, emoji: '😤', msg: '醣類快耗盡了', sub: '已 {h} 小時未補充，代謝在放慢' },
    { hours: 10, emoji: '🚨', msg: '身體快進省電模式了', sub: '超過 {h} 小時未進食，趕快補充！' },
];

export const FastingReminder = ({ lastMealTimestamp }) => {
    const [msg, setMsg] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!lastMealTimestamp || dismissed) return;
        const check = () => {
            const hours = (Date.now() - new Date(lastMealTimestamp).getTime()) / 3600000;
            const triggered = [...FASTING_MESSAGES].reverse().find(m => hours >= m.hours);
            if (triggered) {
                setMsg({ ...triggered, sub: triggered.sub.replace('{h}', Math.floor(hours)) });
            } else {
                setMsg(null);
            }
        };
        check();
        const timer = setInterval(check, 60000);
        return () => clearInterval(timer);
    }, [lastMealTimestamp, dismissed]);

    if (!msg || dismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-gradient-to-r from-amber-900/40 to-orange-900/30 border border-amber-500/20 rounded-[24px] p-4 flex items-center gap-3"
            >
                <span className="text-3xl">{msg.emoji}</span>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-amber-200 text-sm">{msg.msg}</p>
                    <p className="text-amber-400/60 text-[11px] font-medium mt-0.5">{msg.sub}</p>
                </div>
                <motion.button {...pressProps('row')} onClick={() => setDismissed(true)} className="text-amber-400/40 hover:text-amber-400/70 shrink-0 p-1">✕</motion.button>
            </motion.div>
        </AnimatePresence>
    );
};

// ─────────────────────────────────────────────────────────────────
// 6. MEAL SCORE BADGE
// ─────────────────────────────────────────────────────────────────
export const getMealInsightBadge = (meal, allMeals) => {
    if (!allMeals || allMeals.length < 2) return null;
    const maxProtein = Math.max(...allMeals.map(m => m.protein || 0));
    const maxFat = Math.max(...allMeals.map(m => m.fats || 0));
    const avgCals = allMeals.reduce((s, m) => s + (m.calories || 0), 0) / allMeals.length;

    if ((meal.protein || 0) === maxProtein && maxProtein > 15)
        return { label: '最佳選擇', color: 'bg-green-500/20 text-green-400 border-green-500/20', icon: '⭐' };
    if ((meal.fats || 0) === maxFat && maxFat > 25)
        return { label: '注意脂肪', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20', icon: '⚠️' };
    if ((meal.calories || 0) > avgCals * 1.5)
        return { label: '高熱量', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: '🔥' };
    return null;
};

// ─────────────────────────────────────────────────────────────────
// 7. ANIMATED MACRO BAR
// ─────────────────────────────────────────────────────────────────
export const AnimatedMacroBar = ({ label, value, goal, color, accentColor, onMilestone }) => {
    const pct = Math.min(100, goal > 0 ? (value / goal) * 100 : 0);
    const prevPct = useRef(0);
    const [flash, setFlash] = useState(false);

    useEffect(() => {
        const prev = prevPct.current;
        const thresholds = [80, 100];
        thresholds.forEach(t => {
            if (prev < t && pct >= t) {
                setFlash(true);
                setTimeout(() => setFlash(false), 800);
                onMilestone?.(`${label.toLowerCase()}_${t}`);
            }
        });
        prevPct.current = pct;
    }, [pct]);

    const isComplete = pct >= 100;
    const isNear = pct >= 80 && pct < 100;

    return (
        <div>
            <div className="flex justify-between text-xs font-bold text-black mb-1.5">
                <span className="flex items-center gap-1">
                    {label}
                    {isComplete && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-600">✓</motion.span>}
                </span>
                <span className={`opacity-60 tabular-nums ${isNear ? 'text-amber-700' : ''}`}>{value}/{goal}g</span>
            </div>
            <div className={`h-[10px] w-full rounded-full overflow-hidden border border-black/5 transition-all ${flash ? 'shadow-md' : ''}`}
                style={{ background: flash ? `${accentColor}30` : '#00000015' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                    className="h-full rounded-full relative overflow-hidden"
                    style={{ background: isComplete ? '#5A7A3A' : isNear ? '#F59E0B' : color }}
                >
                    {flash && (
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: '200%' }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                        />
                    )}
                </motion.div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// 8. LOG SUCCESS ANIMATION
// ─────────────────────────────────────────────────────────────────
export const LogSuccessFlash = ({ visible, foodName, calories }) => (
    <AnimatePresence>
        {visible && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[160] pointer-events-none flex items-center justify-center"
            >
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.15, 0] }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 bg-[#F95C4B]"
                />
                <motion.div
                    initial={{ scale: 0.7, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.85, opacity: 0, y: -20 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                    className="bg-[#161415] border border-white/10 rounded-[28px] px-8 py-7 flex flex-col items-center gap-3 shadow-2xl"
                >
                    <motion.div
                        animate={{ rotate: [0, -10, 10, -5, 5, 0], scale: [1, 1.3, 1] }}
                        transition={{ duration: 0.6 }}
                        className="text-4xl"
                    >✅</motion.div>
                    <div className="text-center">
                        <p className="font-black text-white text-lg leading-tight">已記錄！</p>
                        <p className="text-white/50 text-sm font-medium mt-1 max-w-[160px] truncate">{foodName}</p>
                    </div>
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="bg-[#F95C4B]/10 border border-[#F95C4B]/20 rounded-xl px-4 py-2 flex items-center gap-2"
                    >
                        <Flame size={14} className="text-[#F95C4B]" />
                        <span className="text-[#F95C4B] font-black text-base">+{calories} kcal</span>
                    </motion.div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);
// ─────────────────────────────────────────────────────────────────
// 9. ❌ DailyScoreCard 已移除（2026-09 資訊重複稽核）
// ─────────────────────────────────────────────────────────────────
//  它在總覽頁最下方，用四條進度條再畫一次 Hero 卡最上方已經畫過的
//  熱量／蛋白質／纖維／水分。同一個捲動畫面裡把同一份資料講兩遍，
//  使用者第二次看到只會困惑「這跟上面那個有什麼不一樣」。
//  「今天吃得如何」的唯一答案留在 Hero 卡。

// ─────────────────────────────────────────────────────────────────
// 10. HOOK: useMilestoneTracker
// ─────────────────────────────────────────────────────────────────
export const useMilestoneTracker = (stats, goals) => {
    const [activeMilestone, setActiveMilestone] = useState(null);
    const fired = useRef(new Set());

    useEffect(() => {
        if (!stats || !goals) return;
        // ⚠️ 門檻一律相對於「使用者自己的目標」，不寫死絕對數字。
        //    原本水分成就寫死 >= 2000，但進度條分母是 2500 ——
        //    進度條停在 80% 卻同時跳出「水分充足」，使用者只會覺得系統在唬爛。
        const waterGoal = goals.water || resolveWaterGoal(goals.weightKg);
        const checks = [
            { key: 'protein_80', condition: stats.protein >= goals.protein * 0.8 },
            { key: 'protein_100', condition: isGoalHit(stats.protein, goals.protein) },
            { key: 'carbs_80', condition: stats.carbs >= goals.carbs * 0.8 },
            { key: 'calories_100', condition: isGoalHit(stats.calories, goals.calories) },
            { key: 'water_goal', condition: isGoalHit(stats.water, waterGoal) },
        ];
        for (const { key, condition } of checks) {
            if (condition && !fired.current.has(key)) {
                fired.current.add(key);
                setActiveMilestone(key);
                break;
            }
        }
    }, [stats, goals]);

    return { activeMilestone, clearMilestone: () => setActiveMilestone(null) };
};

// ─────────────────────────────────────────────────────────────────
// 11. HOOK: useLogFeedback
// ─────────────────────────────────────────────────────────────────
export const useLogFeedback = () => {
    const [showSuccess, setShowSuccess] = useState(false);
    const [successData, setSuccessData] = useState({ foodName: '', calories: 0 });
    const [particleTrigger, setParticleTrigger] = useState(false);
    const [particlePos, setParticlePos] = useState({ x: 0, y: 0 });

    const triggerFeedback = useCallback((foodName, calories, eventOrRect) => {
        if (eventOrRect) {
            // Check if it's a mouse/touch event
            if (eventOrRect.clientX !== undefined) {
                setParticlePos({ x: eventOrRect.clientX, y: eventOrRect.clientY });
            } else if (eventOrRect.getBoundingClientRect) {
                const rect = eventOrRect.getBoundingClientRect();
                setParticlePos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            } else {
                setParticlePos({ x: eventOrRect.x, y: eventOrRect.y });
            }
        } else {
            setParticlePos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
        setSuccessData({ foodName, calories });
        setParticleTrigger(t => !t);
        setShowSuccess(true);

        haptic('success');        setTimeout(() => setShowSuccess(false), 1400);
    }, []);

    return { showSuccess, successData, particleTrigger, particlePos, triggerFeedback };
};
