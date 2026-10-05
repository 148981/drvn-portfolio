import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PERMANENT_CHALLENGES } from '../../utils/socialDataConnector';
import { PERMANENT_AXES, axisStatus, formatTarget } from '../../utils/challengeRegistry';
import { aggregateUserData } from '../../utils/growthAchievements';
import { getUserId } from '../../utils/auth';
import { triggerHaptic } from './communityHelpers';

import api from '../../api/client';

const C = {
    coral: '#F95C4B',
    ink: '#161415',
    muted: '#8A7E73',
    pebble: '#CFC6B8',
    stone: '#E4DED2',
    paper: '#F6F4F1',
    glow: '#F95C4B', // DRVN Coral（唯一強調色，原螢光黃 #FCDA03 已不符 design system）
};

const CATEGORY_LABEL = { running: 'CARDIO', strength: 'STRENGTH', consistency: 'ENDURANCE' };

/* ════════════════════════════════════════════════════════════════════
   呼吸燈 —— 已加入追蹤的挑戰卡
   ════════════════════════════════════════════════════════════════════
   「加入」以前只是把文字從『接受挑戰』換成『追蹤中』，四個字的差別，
   在一整頁卡片裡根本看不出來哪些是你的。改成整張卡持續呼吸：
   邊框透出珊瑚色暈光，2.6 秒一個來回。

   ⚠️ 無限循環動畫要給關得掉的方法 —— 系統開了「減少動態效果」時
      直接給最終狀態（亮著但不動），不要硬播。 */
const BREATH_MS = 2600;

const SHADOW_REST = '0 8px 24px -10px rgba(22,20,21,0.14), inset 0 1px 0 rgba(255,255,255,0.9)';
const SHADOW_GLOW_LOW = '0 8px 24px -10px rgba(22,20,21,0.14), 0 0 0 1px rgba(249,92,75,0.22), 0 0 14px -6px rgba(249,92,75,0.30), inset 0 1px 0 rgba(255,255,255,0.9)';
const SHADOW_GLOW_HIGH = '0 8px 24px -10px rgba(22,20,21,0.14), 0 0 0 1px rgba(249,92,75,0.50), 0 0 26px -2px rgba(249,92,75,0.55), inset 0 1px 0 rgba(255,255,255,0.9)';

const FEATURE_REST = '0 18px 40px -16px rgba(22,20,21,0.45)';
const FEATURE_GLOW_LOW = '0 18px 40px -16px rgba(22,20,21,0.45), 0 0 0 1px rgba(249,92,75,0.25), 0 0 20px -8px rgba(249,92,75,0.35)';
const FEATURE_GLOW_HIGH = '0 18px 40px -16px rgba(22,20,21,0.45), 0 0 0 1px rgba(249,92,75,0.55), 0 0 34px -4px rgba(249,92,75,0.60)';

/** 卡片外框的呼吸動畫。joined=false 時回靜止狀態。 */
const breathCard = (joined, reduce, rest, low, high) => {
    if (!joined) return { animate: { boxShadow: rest }, transition: { duration: 0.45 } };
    if (reduce) return { animate: { boxShadow: high }, transition: { duration: 0.45 } };
    return {
        animate: { boxShadow: [low, high, low] },
        transition: { duration: BREATH_MS / 1000, repeat: Infinity, ease: 'easeInOut' },
    };
};

/** 識別色條 / 小圓點的呼吸。 */
const breathPulse = (reduce) => (reduce
    ? { animate: { opacity: 1 } }
    : { animate: { opacity: [0.55, 1, 0.55] }, transition: { duration: BREATH_MS / 1000, repeat: Infinity, ease: 'easeInOut' } });


/* 各社群頁顯示自己類別的挑戰：
   跑步社群 → running + consistency；健身社群 → strength + consistency。
   （連續訓練屬通用，兩邊都顯示） */
const TAB_FILTER = {
    running: (c) => c.category === 'running' || c.category === 'consistency',
    strength: (c) => c.category === 'strength' || c.category === 'consistency',
};

/* ── Liquid Glass 材質（Web 版：translucent + backdrop blur + 多邊框 + inset 高光） ── */
// 每個類別給一抹色調，疊在玻璃上而非實心填滿
const CATEGORY_TINT = {
    running: 'rgba(196, 225, 138, 0.38)',
    strength: 'rgba(180, 170, 155, 0.30)',
    consistency: 'rgba(246, 198, 152, 0.40)',
};
const glassCard = (tint) => ({
    background: `linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%), ${tint}`,
    backdropFilter: 'blur(20px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
    borderTop: '1px solid rgba(255,255,255,0.9)',
    borderLeft: '1px solid rgba(255,255,255,0.6)',
    borderRight: '1px solid rgba(255,255,255,0.2)',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.7)',
});

/* ════════════════════════════════════════════════════════════════════
   全螢幕「開啟挑戰」接管動畫 — Global Running Day 風格
   大字由上落下 + 螢光黃手繪掃線 + 目標浮現
   ════════════════════════════════════════════════════════════════════ */
const ChallengeOpenOverlay = ({ challenge, progress, onClose }) => {
    const [phase, setPhase] = useState(0); // 0 title, 1 detail
    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 1400);
        return () => clearTimeout(t1);
    }, []);

    const titleEn = (challenge.titleEn || '').split(' ');

    // 👇 新增這行：根據挑戰類別設定專屬的 SVG 線條顏色
    const themeColor = 
        challenge.category === 'running' ? C.glow :      // 跑步：螢光黃
        challenge.category === 'strength' ? C.coral :    // 重訓：珊瑚紅
        '#7BB661';                                       // 其他(連續等)：綠色

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: C.paper, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                padding: '0 24px',
            }}
            onClick={() => phase === 1 && onClose()}
        >
            {/* 根據挑戰類別渲染不同的動態背景圖形 */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.85 }} viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
                
                {/* 🏃‍♂️ 跑步類別：動態同心 U 型跑道 */}
                <AnimatePresence>
                    {challenge.category === 'running' && (
                        <motion.g 
                            initial={{ opacity: 0, x: 20 }} 
                            animate={{ opacity: 1, x: 0 }} 
                            transition={{ duration: 0.5 }}
                        >
                            {/* 利用陣列快速產生多條平行的跑道線 */}
                            {[
                                { y1: 300, y2: 500, r: 100 },
                                { y1: 325, y2: 475, r: 75 },
                                { y1: 350, y2: 450, r: 50 },
                                { y1: 375, y2: 425, r: 25 },
                            ].map((track, i) => (
                                <motion.path
                                    key={i}
                                    // 畫出 U 型跑道：從右側出發 -> 向左 -> 畫半圓 -> 向右回去
                                    d={`M 450 ${track.y1} L 150 ${track.y1} A ${track.r} ${track.r} 0 0 0 150 ${track.y2} L 450 ${track.y2}`}
                                    stroke={themeColor} 
                                    strokeWidth="12" 
                                    strokeLinecap="round" 
                                    fill="none"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ 
                                        delay: 0.3 + (i * 0.15), // 每條線依序畫出
                                        duration: 1.2, 
                                        ease: [0.16, 1, 0.3, 1] 
                                    }}
                                />
                            ))}
                        </motion.g>
                    )}
                </AnimatePresence>

                {/* 🏋️‍♂️ 重訓類別：動態傾斜槓鈴與槓片 */}
                <AnimatePresence>
                    {challenge.category === 'strength' && (
                        // 整個槓鈴稍微傾斜 (-15度)，看起來更有爆發力跟動態感
                        <motion.g 
                            transform="rotate(-15 200 400)"
                            initial={{ opacity: 0, scale: 0.9 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            transition={{ duration: 0.5 }}
                        >
                            {/* 槓鈴主桿 (從中間向兩側延伸) */}
                            <motion.path
                                d="M 40 400 L 360 400"
                                stroke={themeColor} strokeWidth="16" strokeLinecap="round" fill="none"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
                            />
                            {/* 槓片陣列 */}
                            {[
                                { d: "M 120 280 L 120 520", width: 24, delay: 0.6 }, // 左大槓片
                                { d: "M 80 330 L 80 470", width: 18, delay: 0.7 },   // 左小槓片
                                { d: "M 280 280 L 280 520", width: 24, delay: 0.6 }, // 右大槓片
                                { d: "M 320 330 L 320 470", width: 18, delay: 0.7 }, // 右小槓片
                            ].map((plate, i) => (
                                <motion.path
                                    key={i}
                                    d={plate.d}
                                    stroke={themeColor} strokeWidth={plate.width} strokeLinecap="round" fill="none"
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 1 }}
                                    // 槓片用稍微 Q 彈的動畫砸下來
                                    transition={{ delay: plate.delay, type: "spring", stiffness: 150, damping: 15 }}
                                />
                            ))}
                        </motion.g>
                    )}
                </AnimatePresence>

                {/* 🔄 其他類別(例如連續訓練)：預設的圓圈動態軌跡 */}
                <AnimatePresence>
                    {challenge.category !== 'running' && challenge.category !== 'strength' && (
                        <motion.path
                            d="M 180 430 C 60 420, 10 520, 160 550 C 340 580, 420 460, 250 440" 
                            stroke={themeColor} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ delay: 0.4, duration: 1.1, ease: "easeOut" }}
                        />
                    )}
                </AnimatePresence>
            </svg>

            {/* 大字標題 — 由上落下 */}
            <div style={{ position: 'relative', zIndex: 2 }}>
                <motion.p
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                    style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.4em', color: C.muted, textTransform: 'uppercase', marginBottom: '14px' }}
                >
                    Challenge Accepted —
                </motion.p>

                {titleEn.map((word, i) => (
                    <motion.h1
                        key={i}
                        initial={{ opacity: 0, y: -60 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 200, damping: 20 }}
                        style={{
                            fontSize: 'clamp(48px, 16vw, 88px)', fontWeight: 900, lineHeight: 0.92,
                            color: C.ink, letterSpacing: '-0.02em',
                            fontFamily: 'var(--font-body)',
                        }}
                    >
                        {word}
                    </motion.h1>
                ))}

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px' }}
                >
                    <span style={{ fontSize: '40px' }}>{challenge.icon}</span>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 800, color: C.ink, fontFamily: '"Noto Sans TC", sans-serif', lineHeight: 1.2 }}>
                            {challenge.titleZh}
                        </h2>
                        <p style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{challenge.goal}</p>
                    </div>
                </motion.div>
            </div>

            {/* 詳情區（第二階段浮現）*/}
            <AnimatePresence>
                {phase === 1 && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        style={{ position: 'relative', zIndex: 2, marginTop: '40px' }}
                    >
                        <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'rgba(22,20,21,0.7)', marginBottom: '20px', maxWidth: '320px' }}>
                            {challenge.desc}
                        </p>

                        {/* 分階進度 —— 目前這一階、下一階還差多少、整條軸的階梯 */}
                        {progress && (
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>
                                        {progress.complete ? '全部達成' : `下一階 · ${progress.nextLabel}`}
                                    </span>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                                        {progress.done} / {progress.total} 階
                                    </span>
                                </div>
                                <div style={{ height: '10px', borderRadius: '100px', background: 'rgba(22,20,21,0.08)', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress.complete ? 100 : progress.pct}%` }}
                                        transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                        style={{ height: '100%', borderRadius: '100px', background: progress.complete ? '#7BB661' : C.coral }}
                                    />
                                </div>
                                <p style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>
                                    目前 {progress.axis.lowerIsBetter
                                        ? formatTarget(progress.axis, progress.value)
                                        : progress.value.toLocaleString()} {progress.axis.unit}
                                    {progress.current ? ` · 已拿下「${progress.current.name}」` : ' · 還沒解鎖第一階'}
                                </p>

                                {/* 階梯 —— 一眼看完整條軸 */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                                    {progress.axis.steps.map((st, idx) => {
                                        const got = idx < progress.done;
                                        return (
                                            <span key={st.asset} style={{
                                                fontFamily: '"Space Mono", monospace', fontSize: 10, fontWeight: 500,
                                                letterSpacing: '0.04em', padding: '4px 9px', borderRadius: 99,
                                                color: got ? '#F6F4F1' : 'rgba(22,20,21,0.45)',
                                                background: got ? C.ink : 'rgba(22,20,21,0.05)',
                                                border: `1px solid ${got ? C.ink : 'rgba(22,20,21,0.12)'}`,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                {formatTarget(progress.axis, st.target)}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 獎勵 */}
                        {challenge.rewards?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '28px' }}>
                                {challenge.rewards.map((r, i) => (
                                    <span key={i} style={{ fontSize: '11px', fontWeight: 700, color: C.ink, background: C.glow, padding: '5px 12px', borderRadius: '100px' }}>
                                        {r}
                                    </span>
                                ))}
                            </div>
                        )}

                        <motion.button
                            onClick={(e) => { e.stopPropagation(); triggerHaptic('medium'); onClose(); }}
                            whileTap={{ scale: 0.96 }}
                            style={{
                                width: '100%', padding: '16px', borderRadius: '100px', border: 'none',
                                background: C.ink, color: '#fff', fontSize: '15px', fontWeight: 800,
                                cursor: 'pointer', letterSpacing: '0.05em',
                            }}
                        >
                            開始追蹤 →
                        </motion.button>
                        <p style={{ textAlign: 'center', fontSize: '11px', color: C.muted, marginTop: '12px' }}>
                            進度將自動從你的訓練紀錄統計
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>,
        document.body
    );
};

/* ════════════════════════════════════════════════════════════════════
   常駐挑戰區（跑步 / 健身 分頁切換 + 可點擊卡片）
   defaultTab: 'running' | 'strength'
   ════════════════════════════════════════════════════════════════════ */
const PermanentChallenges = ({ defaultTab = 'running' }) => {
    const userId = getUserId();
    const [statusMap, setStatusMap] = useState({}); // id -> { joined, progress }
    const [opened, setOpened] = useState(null);       // 全螢幕動畫的挑戰
    const [showAll, setShowAll] = useState(false);
    const [collapsed, setCollapsed] = useState(true); // 預設收合
    const reduceMotion = useReducedMotion();

    // 當開啟挑戰蓋板或全部挑戰列表時，隱藏底部導航膠囊
    useEffect(() => {
        const isOverlayOpen = !!opened || showAll;
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: isOverlayOpen } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, [opened, showAll]);

    /* 進度一律由本地真實資料算 —— 跟成就徽章同一套數字。
       ⚠️ 稽核前這裡是跟後端要 progress，但後端讀的是 data/ 底下的 JSON、
          成就頁讀的是 localStorage，兩邊資料集不同，所以同一個挑戰
          在社群頁與成就頁會顯示不一樣的百分比。現在只算一次。
       後端只剩「我加入了哪些」這一件事。 */
    const userData = useMemo(() => {
        try { return aggregateUserData(userId); } catch { return {}; }
    }, [userId]);

    /** 這個軸現在的分階狀態（第幾階、下一階還差多少）。 */
    const statusOf = useCallback((ch) => {
        const axis = PERMANENT_AXES.find(a => a.id === (ch.axisId || ch.id));
        if (!axis) return null;
        const st = axisStatus(axis, userData);
        return {
            axis, ...st,
            label: st.current ? st.current.name : null,
            nextLabel: st.next ? `${formatTarget(axis, st.next.target)} ${axis.unit}` : null,
        };
    }, [userData]);

    // 加入狀態（後端只回這個，不再回進度）
    useEffect(() => {
        let active = true;
        api.get(`/api/challenges/permanent/status/${userId}`)
            .then(r => {
                if (!active) return;
                const map = {};
                (r.data?.challenges || []).forEach(c => { map[c.id] = { joined: !!c.joined }; });
                setStatusMap(map);
            })
            .catch(() => { /* 拿不到就當作都還沒加入，不影響看進度 */ });
        return () => { active = false; };
    }, [userId]);

    const handleOpen = useCallback(async (ch) => {
        triggerHaptic('medium');
        // 進度是本地算的，開動畫時就已經是正確值，不必等後端
        const st = statusOf(ch);
        setOpened({ challenge: ch, progress: st });
        try {
            await api.post('/api/challenges/permanent/join', { user_id: userId, challenge_id: ch.axisId || ch.id });
            setStatusMap(prev => ({ ...prev, [ch.id]: { joined: true } }));
        } catch (e) {
            /* ⚠️ 稽核前：加入失敗照樣播完動畫、也照樣標成已加入 ——
               使用者以為報名了一個挑戰，伺服器根本不知道有這回事。
               動畫留著（已經播了），但狀態要回滾並說清楚沒有成功。 */
            setStatusMap(prev => ({ ...prev, [ch.id]: { joined: false } }));
            try {
                const { toast } = await import('../../utils/toast');
                toast.error('加入挑戰沒有成功，請確認網路後再試一次');
            } catch { /* toast 不可用不影響流程 */ }
        }
    }, [statusOf, userId]);

    const list = PERMANENT_CHALLENGES.filter(TAB_FILTER[defaultTab] || TAB_FILTER.running);

    /* 小卡底部：現在在第幾階 + 往下一階的進度。
       這才是「常駐」的樣子 —— 達成一階不是結束，進度條會接著往下一階跑。 */
    const TIER_INK = { bronze: '#A5622A', silver: '#6F757E', gold: '#9A7415', platinum: '#4F5A66' };
    const TIER_ZH = { bronze: '銅', silver: '銀', gold: '金', platinum: '鉑金' };

    const renderProgressPill = (ch) => {
        const st = statusOf(ch);
        if (!st) return null;
        const ink = st.tier ? TIER_INK[st.tier] : 'rgba(22,20,21,0.35)';

        return (
            <div style={{ marginTop: '10px', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                        fontFamily: '"Space Mono", monospace', fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.1em', color: ink,
                        border: `1px solid ${ink}`, padding: '1px 5px',
                    }}>
                        {st.tier ? TIER_ZH[st.tier] : '未解鎖'}
                    </span>
                    <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 9.5, fontWeight: 500, color: 'rgba(22,20,21,0.45)', fontVariantNumeric: 'tabular-nums' }}>
                        {st.done} / {st.total} 階
                    </span>
                </div>
                <div style={{ height: '5px', borderRadius: '100px', background: 'rgba(22,20,21,0.12)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${st.complete ? 100 : st.pct}%`, borderRadius: '100px', background: st.complete ? '#7BB661' : C.coral, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                </div>
                <p style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(22,20,21,0.55)', marginTop: '5px' }}>
                    {st.complete ? '✓ 全部階級已達成' : `下一階 ${st.nextLabel}`}
                </p>
            </div>
        );
    };

    return (
        <div style={{ marginBottom: '8px' }}>
            {/* Section header — Swiss 鈦金屬細線 + 手繪下劃線 + 收合切換 */}
            <div style={{ padding: '0 24px', marginBottom: collapsed ? 8 : 16 }}>
                {/* ⚠️ 原本上面還有一行「— PERMANENT」英譯 kicker，跟大標講同一件事（§3）；
                    右上角的「看全部」原本是英文（§10）。kicker 刪掉，按鈕改中文並跟大標同一列。 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}
                        onClick={() => setCollapsed(v => !v)}
                    >
                    <div style={{ display: 'inline-block', position: 'relative' }}>
                        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink, margin: 0, lineHeight: 1 }}>
                            常駐挑戰
                        </h2>
                        <svg width="100%" height="7" viewBox="0 0 120 7" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 7, overflow: 'visible' }}>
                            <path d="M1 4 Q 20 1, 40 3.5 T 80 3 T 119 4" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                    {/* 收合箭頭 */}
                    <motion.div
                        animate={{ rotate: collapsed ? 0 : 180 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        style={{ display: 'flex', alignItems: 'center', marginTop: -2 }}
                    >
                        <ChevronDown size={16} strokeWidth={2.2} color="rgba(22,20,21,0.35)" />
                    </motion.div>
                </div>
                    <motion.button {...pressProps('row')} onClick={() => setShowAll(true)} style={{
                        display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, paddingBottom: 2,
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap',
                        color: C.coral, background: 'none', border: 'none', cursor: 'pointer',
                    }}>
                        全部挑戰<ChevronRight size={14} strokeWidth={2.4} />
                    </motion.button>
                </div>
                <div style={{ height: 1, marginTop: 14, background: 'linear-gradient(90deg, rgba(151,166,182,0) 0%, rgba(151,166,182,0.5) 20%, rgba(255,255,255,0.95) 50%, rgba(151,166,182,0.5) 80%, rgba(151,166,182,0) 100%)' }} />
            </div>

            {/* 卡片 — 可收合 */}
            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        key="perm-challenges-grid"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 20px' }}>
                <AnimatePresence mode="popLayout">
                    {list.map((ch, idx) => {
                        const catColor = ch.category === 'running' ? C.coral : ch.category === 'strength' ? '#8F9E8B' : '#C68E5D';
                        // Bento 節奏：第一張深色主卡（最強挑戰感），其餘成對色彩識別卡
                        const isFeature = idx === 0;
                        const joined = !!statusMap[ch.id]?.joined;
                        const breath = isFeature
                            ? breathCard(joined, reduceMotion, FEATURE_REST, FEATURE_GLOW_LOW, FEATURE_GLOW_HIGH)
                            : breathCard(joined, reduceMotion, SHADOW_REST, SHADOW_GLOW_LOW, SHADOW_GLOW_HIGH);

                        if (isFeature) {
                            // ── FEATURE：Deep-Black 挑戰主卡 + Titanium 飾條 + 巨大 ghost index ──
                            return (
                                <motion.div
                                    key={ch.id}
                                    layout
                                    initial={{ opacity: 0, y: 16 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{
                                        delay: Math.min(idx, 6) * 0.06, type: 'spring', stiffness: 260, damping: 22,
                                        boxShadow: breath.transition,   // 呼吸只作用在陰影上，進場動畫照舊
                                    }}
                                    animate={{ opacity: 1, y: 0, ...breath.animate }}
                                    onClick={() => handleOpen(ch)}
                                    whileTap={{ scale: 0.98 }}
                                    style={{
                                        gridColumn: '1 / -1', borderRadius: '18px',
                                        padding: '15px 18px 14px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                                        display: 'flex', flexDirection: 'column',
                                        // Deep-Black slab — 電影感挑戰主卡
                                        background: 'linear-gradient(150deg, #1F1C1D 0%, #161415 55%, #100E0F 100%)',
                                        border: `1px solid ${joined ? 'rgba(249,92,75,0.18)' : 'rgba(255,255,255,0.06)'}`,
                                    }}
                                >
                                    {/* 追蹤中：頂部飾條換成呼吸的珊瑚色 */}
                                    {joined && (
                                        <motion.div
                                            {...breathPulse(reduceMotion)}
                                            style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 1,
                                                background: `linear-gradient(90deg, rgba(249,92,75,0) 0%, ${C.coral} 35%, ${C.coral} 65%, rgba(249,92,75,0) 100%)`,
                                            }}
                                        />
                                    )}
                                    {/* Titanium 飾條 — 頂部金屬光澤細條 */}
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 30%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.2) 70%, rgba(255,255,255,0) 100%)' }} />
                                    {/* 巨大 ghost index 數字 */}
                                    <span style={{ position: 'absolute', right: -6, bottom: -28, fontFamily: 'var(--font-display)', fontSize: 140, fontWeight: 400, color: 'rgba(255,255,255,0.04)', lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>
                                        {String(idx + 1).padStart(2, '0')}
                                    </span>

                                    {/* kicker */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 2, height: 11, borderRadius: 99, background: C.coral }} />
                                            <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.2em', color: C.coral }}>
                                                {CATEGORY_LABEL[ch.category]} · 主打挑戰
                                            </span>
                                        </div>
                                        <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(246,244,241,0.35)', fontVariantNumeric: 'tabular-nums' }}>
                                            {String(idx + 1).padStart(2, '0')} / {String(PERMANENT_CHALLENGES.length).padStart(2, '0')}
                                        </span>
                                    </div>

                                    <h3 style={{ fontSize: 24, fontWeight: 600, color: '#F6F4F1', lineHeight: 1.05, marginBottom: 8, fontFamily: 'var(--font-body)', letterSpacing: '-0.02em', position: 'relative' }}>
                                        {ch.titleZh}
                                    </h3>
                                    <p style={{ fontSize: 11, color: 'rgba(246,244,241,0.6)', lineHeight: 1.55, marginBottom: 16, maxWidth: '76%', position: 'relative' }}>
                                        {ch.desc}
                                    </p>

                                    {/* 目標 — Liquid Glass chip */}
                                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                                        <span style={{
                                            fontFamily: '"Space Mono", monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
                                            color: '#F6F4F1', padding: '7px 14px', borderRadius: 99,
                                            background: 'rgba(246,244,241,0.10)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                                            border: '1px solid rgba(246,244,241,0.18)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                                        }}>
                                            {ch.goal}
                                        </span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: '"Space Mono", monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: C.coral }}>
                                            {joined && (
                                                <motion.span
                                                    {...breathPulse(reduceMotion)}
                                                    style={{ width: 5, height: 5, borderRadius: 99, background: C.coral, display: 'block' }}
                                                />
                                            )}
                                            {joined ? '追蹤中 · 看進度 →' : '接受挑戰 →'}
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        }

                        // ── 小卡：色彩識別卡（左側粗色條 + Titanium 表面）──
                        return (
                            <motion.div
                                key={ch.id}
                                layout
                                initial={{ opacity: 0, y: 16 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{
                                    delay: Math.min(idx, 6) * 0.06, type: 'spring', stiffness: 260, damping: 22,
                                    boxShadow: breath.transition,
                                }}
                                animate={{ opacity: 1, y: 0, ...breath.animate }}
                                onClick={() => handleOpen(ch)}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    gridColumn: 'auto', borderRadius: '18px',
                                    padding: '16px 14px 16px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                                    display: 'flex', flexDirection: 'column', minHeight: 138,
                                    // 追蹤中的卡片底色帶一點珊瑚暖調，跟未追蹤的一眼分得出來
                                    background: joined
                                        ? 'linear-gradient(145deg, #FBF4F1 0%, #F3E9E3 55%, #E9DCD4 100%)'
                                        : 'linear-gradient(145deg, #F6F4F1 0%, #EFEAE1 55%, #E4DED2 100%)',
                                    border: `1px solid ${joined ? 'rgba(249,92,75,0.28)' : 'rgba(207,198,184,0.8)'}`,
                                }}
                            >
                                {/* 左側識別條 —— 追蹤中會呼吸，未追蹤是靜止的淡色 */}
                                <motion.div
                                    {...(joined ? breathPulse(reduceMotion) : { animate: { opacity: 0.5 } })}
                                    style={{
                                        position: 'absolute', top: 0, bottom: 0, left: 0, width: joined ? 5 : 4,
                                        background: joined ? C.coral : catColor,
                                        boxShadow: joined ? `0 0 12px 0 ${C.coral}` : 'none',
                                    }}
                                />
                                {/* 角落 ghost index */}
                                <span style={{ position: 'absolute', right: 12, top: 14, fontFamily: '"Space Mono", monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(22,20,21,0.25)', fontVariantNumeric: 'tabular-nums' }}>
                                    {String(idx + 1).padStart(2, '0')}
                                </span>

                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                    <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: catColor }}>
                                        {CATEGORY_LABEL[ch.category]}
                                    </span>
                                    {/* 追蹤中：珊瑚色 chip ＋ 會呼吸的小圓點 */}
                                    {joined && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            fontFamily: '"Space Mono", monospace', fontSize: 11, fontWeight: 700,
                                            letterSpacing: '0.12em', color: C.coral,
                                            border: `1px solid rgba(249,92,75,0.45)`, background: 'rgba(249,92,75,0.08)',
                                            padding: '1px 5px',
                                        }}>
                                            <motion.span
                                                {...breathPulse(reduceMotion)}
                                                style={{ width: 4, height: 4, borderRadius: 99, background: C.coral, display: 'block' }}
                                            />
                                            追蹤中
                                        </span>
                                    )}
                                </span>
                                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.2, marginBottom: 5, fontFamily: 'var(--font-body)', letterSpacing: '-0.015em' }}>
                                    {ch.titleZh}
                                </h3>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', lineHeight: 1.5, marginBottom: 12 }}>
                                    {ch.desc}
                                </p>
                                <div style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
                                    {renderProgressPill(ch)}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* +更多 bento tile — 橫跨整列 */}
                <motion.div
                    layout
                    onClick={() => setShowAll(true)}
                    whileTap={{ scale: 0.98 }}
                    style={{
                        gridColumn: '1 / -1',
                        borderRadius: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', padding: '14px 18px',
                        border: `1px dashed ${C.pebble}`,
                        background: 'rgba(207,198,184,0.10)',
                    }}
                >
                    <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 12, fontWeight: 500, color: C.muted, letterSpacing: '0.14em', }}>
                        全部 {String(PERMANENT_CHALLENGES.length).padStart(2, '0')} 個挑戰
                    </span>
                    <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, fontWeight: 500, color: C.coral, letterSpacing: '0.12em', }}>
                        全部挑戰
                    </span>
                </motion.div>
            </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 全螢幕開啟動畫 */}
            <AnimatePresence>
                {opened && (
                    <ChallengeOpenOverlay
                        challenge={opened.challenge}
                        progress={opened.progress}
                        onClose={() => setOpened(null)}
                    />
                )}
            </AnimatePresence>

            {/* 全部挑戰 Sheet */}
            <AnimatePresence>
                {showAll && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
                        onClick={() => setShowAll(false)}
                    >
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                            style={{ width: '100%', background: C.paper, borderRadius: '28px 32px 0 0', maxHeight: '82dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 8px' }}>
                                <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: C.pebble }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 16px', borderBottom: `1px solid ${C.stone}` }}>
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 600, color: C.ink, fontFamily: 'var(--font-body)', lineHeight: 1, letterSpacing: '-0.02em' }}>全部常駐挑戰</h2>
                                </div>
                                <motion.button {...pressProps('row')} onClick={() => setShowAll(false)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: C.stone, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '16px', color: C.ink, lineHeight: 1 }}>×</span>
                                </motion.button>
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 40px' }}>
                                {PERMANENT_CHALLENGES.map((ch, idx) => {
                                    const catColor = ch.category === 'running' ? C.coral : ch.category === 'strength' ? '#8F9E8B' : '#C68E5D';
                                    const axStatus = statusOf(ch);
                                    return (
                                        <motion.div
                                            key={ch.id}
                                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx, 6) * 0.05 }}
                                            onClick={() => { setShowAll(false); setTimeout(() => handleOpen(ch), 220); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '18px', marginBottom: '8px', cursor: 'pointer', position: 'relative', overflow: 'hidden', background: 'linear-gradient(145deg, #F6F4F1 0%, #EDE8DF 55%, #E4DED2 100%)', border: '1px solid rgba(207,198,184,0.8)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}
                                        >
                                            <div style={{ width: 2, alignSelf: 'stretch', borderRadius: 99, background: catColor, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: catColor, marginBottom: '3px', fontFamily: '"Tenor Sans", sans-serif' }}>
                                                    {ch.titleEn}
                                                </div>
                                                <h3 style={{ fontSize: '15px', fontWeight: 700, color: C.ink, marginBottom: '3px', fontFamily: '"Noto Sans TC", sans-serif', letterSpacing: '-0.01em' }}>
                                                    {ch.titleZh}
                                                </h3>
                                                <p style={{ fontSize: '11px', color: 'rgba(22,20,21,0.5)', lineHeight: 1.4 }}>{ch.desc}</p>
                                            </div>
                                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                                {/* 分階顯示：第幾階 ／ 共幾階。加入與否不影響進度顯示 ——
                                                    進度本來就從真實訓練紀錄算，沒有「加入才開始追蹤」這回事。 */}
                                                {axStatus ? (
                                                    <>
                                                        <span style={{
                                                            fontFamily: '"Space Mono", monospace', fontSize: '11px', fontWeight: 700,
                                                            color: axStatus.complete ? '#fff' : C.ink,
                                                            background: axStatus.complete ? '#7BB661' : 'rgba(22,20,21,0.08)',
                                                            padding: '4px 10px', borderRadius: '100px', display: 'block',
                                                            whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                                                        }}>
                                                            {axStatus.complete ? '✓ 全滿' : `${axStatus.done} / ${axStatus.total}`}
                                                        </span>
                                                        <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(22,20,21,0.42)', display: 'block', marginTop: 4, whiteSpace: 'nowrap' }}>
                                                            {axStatus.complete ? '已滿階' : `下一階 ${axStatus.nextLabel}`}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span style={{ fontSize: '10px', fontWeight: 800, color: C.ink, background: 'rgba(22,20,21,0.08)', padding: '4px 10px', borderRadius: '100px', display: 'block', whiteSpace: 'nowrap' }}>
                                                        {ch.goal}
                                                    </span>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PermanentChallenges;
