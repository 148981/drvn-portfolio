import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { checkinAmbient } from '../utils/checkinAmbient';

// ══════════════════════════════════════════════════════════════════════════
// ✨ TaskDoneCelebration — 每日任務完成的精緻時刻（三拍，≤ 2.2 秒）
//
// 使用者要求原文：
//   「做完一項運動…或者是紀錄飲食之後，反正就是每日任務之後，
//     都會有一段特別的精緻的動畫去顯示說你今天的這項任務已達成，
//     而且會顯示你達成的簡易數據，是不是很厲害之類的。」
//
// 三拍節奏（總長 ≤ 2.2s，可點擊略過）：
//   0–0.4s  Coral 細線由左掃到右
//   0.4–1.2s 任務名稱 + 一句肯定（依任務類型換句子，不是同一句罐頭）
//   1.2–2.2s 該任務的簡易數據滾動進場（最多 3 個）
//
// 鐵律：
//   • 每個任務每天只播一次（per-user + 日期 + 任務 key 去重）
//   • 只顯示真實數據；沒有的欄位不佔位、不假造
//   • 介面無 emoji；文案不浮誇（「你把它收下了」而非「太棒了！！」）
//   • prefers-reduced-motion → 只淡入，不掃線不滾動
// ══════════════════════════════════════════════════════════════════════════

// ── 共用 motion token（與 DailyGoalCelebration 一致，慶祝語言要統一）──
export const CELEBRATION_MOTION = {
    sweep: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
    countUp: 1.2,
    card: { type: 'spring', stiffness: 120, damping: 20 },
};

const seenKey = (uid, dateKey, taskKey) => `drvn_taskdone_${uid}_${dateKey}_${taskKey}`;
export const hasCelebratedTask = (uid, dateKey, taskKey) => {
    try { return localStorage.getItem(seenKey(uid, dateKey, taskKey)) === '1'; }
    catch { return false; }
};
export const markCelebratedTask = (uid, dateKey, taskKey) => {
    try { localStorage.setItem(seenKey(uid, dateKey, taskKey), '1'); } catch { /* ignore */ }
};

const prefersReduced = () => {
    try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; }
    catch { return false; }
};

// ── 依任務類型給「這一項」專屬的肯定句 ──────────────────────────────
//    每個任務的辛苦點不一樣，句子就該不一樣。同一句罐頭會讓人很快免疫。
const PRAISE = {
    run: [
        '出門那一步最難，你已經跨過去了。',
        '這一趟收下了。距離不會騙人。',
        '跑完的人和沒跑的人，明天會有一點不一樣。',
    ],
    strength: [
        '推完最後一組的感覺，只有做過的人知道。',
        '這些重量會回到你身上，變成你的一部分。',
        '肌肉是在你想停下來的那幾下長出來的。',
    ],
    nutrition: [
        '有記錄，就有依據。這比你想的重要。',
        '訓練決定上限，吃決定你走多遠。',
        '今天的飲食有被看見了。',
    ],
    inbody: [
        '有量測才有基準，有基準才看得見變化。',
        '這一筆數字，是你之後所有進步的起點。',
    ],
    default: [
        '今天這一項，你把它完成了。',
        '做到了就是做到了。',
    ],
};

const pickPraise = (kind, dateKey) => {
    const pool = PRAISE[kind] || PRAISE.default;
    // 用日期當種子 → 同一天同一項的句子固定，不會每次 render 都跳
    let h = 0;
    for (const ch of String(dateKey)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return pool[h % pool.length];
};

const TITLE = {
    run: '今日跑步',
    strength: '今日重訓',
    nutrition: '今日飲食紀錄',
    inbody: '身體數據量測',
};

/** 數字滾動（easeOutCubic），reduced-motion 直接顯示終值 */
const Rolling = ({ to = 0, decimals = 0, duration = CELEBRATION_MOTION.countUp, delay = 0 }) => {
    const target = Number(to) || 0;
    const [v, setV] = useState(() => (prefersReduced() ? target : 0));
    useEffect(() => {
        if (prefersReduced() || !(target > 0)) { setV(target); return; }
        let raf; let start = null;
        const ms = duration * 1000;
        const tick = (now) => {
            if (start == null) start = now + delay * 1000;
            const p = Math.min(1, Math.max(0, (now - start) / ms));
            setV(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => raf && cancelAnimationFrame(raf);
    }, [target, duration, delay]);
    return <>{decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()}</>;
};

/**
 * 把任務資料轉成「最多 3 個真實數字」。沒有的欄位直接不放。
 */
const buildMetrics = (kind, stats = {}) => {
    const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
    const clock = (s) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
            : `${m}:${String(sec).padStart(2, '0')}`;
    };
    const pace = (s) => s > 0 ? `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"` : null;
    const out = [];

    if (kind === 'run') {
        if (n(stats.distanceKm) > 0) out.push({ l: '距離', v: n(stats.distanceKm), u: 'KM', dec: 2, roll: true });
        if (n(stats.durationSec) > 0) out.push({ l: '時間', v: clock(n(stats.durationSec)), u: '' });
        if (pace(n(stats.paceSec))) out.push({ l: '配速', v: pace(n(stats.paceSec)), u: '/KM' });
    } else if (kind === 'strength') {
        if (n(stats.volumeKg) > 0) out.push({ l: '總容量', v: n(stats.volumeKg), u: 'KG', roll: true });
        if (n(stats.sets) > 0) out.push({ l: '組數', v: n(stats.sets), u: '組', roll: true });
        if (n(stats.durationSec) > 0) out.push({ l: '時間', v: clock(n(stats.durationSec)), u: '' });
    } else if (kind === 'nutrition') {
        if (n(stats.calories) > 0) out.push({ l: '熱量', v: n(stats.calories), u: 'KCAL', roll: true });
        if (n(stats.protein) > 0) out.push({ l: '蛋白質', v: n(stats.protein), u: 'G', roll: true });
        if (n(stats.meals) > 0) out.push({ l: '餐數', v: n(stats.meals), u: '餐', roll: true });
    } else if (kind === 'inbody') {
        if (n(stats.weightKg) > 0) out.push({ l: '體重', v: n(stats.weightKg), u: 'KG', dec: 1, roll: true });
        if (n(stats.bodyFat) > 0) out.push({ l: '體脂', v: n(stats.bodyFat), u: '%', dec: 1, roll: true });
        if (n(stats.smm) > 0) out.push({ l: '骨骼肌', v: n(stats.smm), u: 'KG', dec: 1, roll: true });
    }
    return out.slice(0, 3);
};

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string}  props.userId
 * @param {string}  props.dateKey    logicalDayKey()
 * @param {'run'|'strength'|'nutrition'|'inbody'} props.kind
 * @param {string}  props.taskKey    去重用（通常等同 kind）
 * @param {object}  props.stats
 * @param {Function} props.onClose
 */
const TaskDoneCelebration = ({ open, userId, dateKey, kind = 'run', taskKey, stats = {}, ambient = null, onClose }) => {
    const [visible, setVisible] = useState(false);
    const key = taskKey || kind;

    // 🎨 慶祝動畫吃跟打卡面板同一組時段色 —— 從打卡面板疊上來時不會突然換一套視覺。
    //    沒傳 ambient（例如從其他頁觸發）就自己依現在時間算。
    const A = useMemo(() => ambient || checkinAmbient(), [ambient]);

    useEffect(() => {
        if (!open) { setVisible(false); return; }
        if (hasCelebratedTask(userId, dateKey, key)) return;     // 每個任務每天只播一次
        setVisible(true);
        markCelebratedTask(userId, dateKey, key);
        const t = setTimeout(() => { setVisible(false); onClose?.(); }, 2200);   // 三拍總長
        return () => clearTimeout(t);
    }, [open, userId, dateKey, key, onClose]);

    const metrics = useMemo(() => buildMetrics(kind, stats), [kind, stats]);
    const praise = useMemo(() => pickPraise(kind, dateKey), [kind, dateKey]);
    const reduced = prefersReduced();
    const close = () => { setVisible(false); onClose?.(); };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="task-done"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    onClick={close}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100060,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        /* 🩹 2026-08 稽核：改成整頁。
                           以前這裡是半透明罩幕 + 340px 置中卡（看起來像整頁其實不是），
                           與 DailyGoalCelebration 一樣的問題。現在這一層就是內容本身：
                           不透明底、撐滿安全區、左對齊排版 —— 與共用的
                           FullScreenCelebration 同一套版型語言。
                           時段深淺（checkinAmbient）保留，那是這一頁的價值。 */
                        background: A.dark
                            ? 'radial-gradient(120% 80% at 50% 0%, #2A2724 0%, #1B1A19 42%, #131211 100%)'
                            : 'radial-gradient(120% 80% at 50% 0%, #FFFFFF 0%, #F6F4F1 40%, #E9E3D8 100%)',
                        padding: 'calc(env(safe-area-inset-top, 0px) + 40px) 30px calc(env(safe-area-inset-bottom, 0px) + 40px)',
                    }}
                >
                    <div style={{ width: '100%', maxWidth: 430, margin: '0 auto' }}>
                        {/* 拍 1：Coral 細線由左掃到右 */}
                        <motion.div
                            initial={reduced ? { opacity: 0 } : { scaleX: 0 }}
                            animate={reduced ? { opacity: 1 } : { scaleX: 1 }}
                            transition={reduced ? { duration: 0.3 } : CELEBRATION_MOTION.sweep}
                            style={{ height: 2, background: A.accent, transformOrigin: 'left', marginBottom: 18 }}
                        />

                        {/* 拍 2：任務名稱 + 一句肯定 */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: reduced ? 0.1 : 0.4 }}
                            style={{
                                margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.32em', color: A.accent, fontFamily: '"Tenor Sans", sans-serif',
                            }}
                        >
                            {TITLE[kind] || '今日任務'} · 已達成
                        </motion.p>
                        <motion.p
                            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: reduced ? 0.15 : 0.55, ...CELEBRATION_MOTION.card }}
                            style={{
                                margin: '14px 0 0', fontSize: 20, lineHeight: 1.5, fontWeight: 400,
                                color: A.ink, letterSpacing: '-0.01em', fontFamily: '"Tenor Sans", sans-serif',
                            }}
                        >
                            {praise}
                        </motion.p>

                        {/* 拍 3：簡易數據滾動進場（最多 3 個，只放真的有的） */}
                        {metrics.length > 0 && (
                            <div
                                style={{
                                    display: 'flex', marginTop: 24, paddingTop: 16,
                                    borderTop: A.hairline,
                                }}
                            >
                                {metrics.map((m, i) => (
                                    <motion.div
                                        key={m.l}
                                        initial={{ opacity: 0, y: reduced ? 0 : 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: reduced ? 0.2 : 1.2 + i * 0.1, ...CELEBRATION_MOTION.card }}
                                        style={{
                                            flex: 1, minWidth: 0,
                                            paddingLeft: i === 0 ? 0 : 14,
                                            borderLeft: i === 0 ? 'none' : A.hairline,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
                                            <span style={{ fontSize: 24, fontWeight: 200, color: A.ink, lineHeight: 1, fontFamily: '"Tenor Sans", sans-serif' }}>
                                                {m.roll
                                                    ? <Rolling to={m.v} decimals={m.dec || 0} delay={reduced ? 0 : 1.2 + i * 0.1} />
                                                    : m.v}
                                            </span>
                                            {m.u && (
                                                <span style={{ fontSize: 9, fontWeight: 400, color: A.inkFaint, letterSpacing: '0.16em' }}>
                                                    {m.u}
                                                </span>
                                            )}
                                        </div>
                                        <span style={{ display: 'block', marginTop: 7, fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: A.inkGhost }}>
                                            {m.l}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TaskDoneCelebration;
