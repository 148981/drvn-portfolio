import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Home, Calendar, User, Camera, Users, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePendingFriendRequests } from './SocialFeed/usePendingFriendRequests';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import './CapsuleNavigation.css';
import { hasSeenTip } from '../utils/firstVisitCoach';
import TutorialProgressPanel, { TUTORIAL_SECTIONS } from './TutorialProgressPanel';
import { useLanguage } from '../contexts/LanguageContext';
import { haptic } from '../utils/haptics';
import { toast } from '../utils/toast';
import { TUTORIAL_BADGE_HIDDEN_KEY } from '../utils/onboardingState';

// Swiss Premium — navigation bar motion constants
// The bar ascends from below with the MD3 emphasized decelerate curve.
// This gives a "materialising from beneath the viewport" sensation — editorial, not bouncy.
const swissNavEnter = [0.05, 0.7, 0.1, 1];   // MD3 Emphasized
const swissNavTabEnter = [0.4, 0, 0.2, 1];    // Gentle lift for individual tabs

// 底部 tab：中間維持「分析」（相機動作分析）。
// matchPrefixes：除了 path 本身，列出所有應點亮此 tab 的子路由前綴。
const NAV_ITEMS = [
    { id: 'home', path: '/mobile-home', icon: Home, label: '首頁' },
    {
        id: 'plan', path: '/master-journey-mobile', icon: Calendar, label: '計劃',
        matchPrefixes: ['/master-journey', '/luxury-plan', '/plan-', '/chest-plan', '/custom-plan'],
    },
    { id: 'analysis', path: '/analysis-choice-mobile', icon: Camera, label: '分析', matchPrefixes: ['/body-analysis', '/analysis-', '/muscle-'] },
    { id: 'social', path: '/social-mobile', icon: Users, label: '社群' },
    { id: 'profile', path: '/profile-mobile', icon: User, label: '個人' }
];



const triggerHaptic = (style = 'medium') => haptic(style);

// ── 進度指示器 badge ─────────────────────────────────────────────────────────
function TutorialBadge({ count, onClick, onDismiss }) {
    const { t } = useLanguage();
    if (count === 0) return null;
    return (
        <motion.button
            onClick={onClick}
            whileTap={{ scale: 0.92 }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            style={{
                position: 'fixed',
                // 靠左下角懸浮（在膠囊導覽列上方一點、貼左側），不擋中央內容也不蓋導覽 tab
                bottom: 'calc(env(safe-area-inset-bottom, 24px) + 102px)',
                left: '16px',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px 7px 10px',
                borderRadius: 99,
                background: 'rgba(22,20,21,0.65)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 6px 20px -4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
                cursor: 'pointer',
                zIndex: 99998,
                pointerEvents: 'auto',
                userSelect: 'none',
                WebkitUserSelect: 'none',
            }}
            aria-label="查看教學進度"
        >
            {/* Pulse ring */}
            <motion.span
                animate={{ scale: [1, 1.3, 1], opacity: [0.35, 0, 0.35] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    position: 'absolute', inset: 0, borderRadius: 99,
                    border: '1px solid rgba(255,255,255,0.5)',
                    pointerEvents: 'none',
                }}
            />
            <div style={{
                width: 18, height: 18, borderRadius: 99,
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900, color: '#F6F4F1',
                flexShrink: 0,
            }}>
                {count}
            </div>
            <span style={{
                fontSize: 12, fontWeight: 800, color: '#F6F4F1',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                whiteSpace: 'nowrap',
            }}>
                {t('教學未完成', 'Incomplete')}
            </span>
            {/* ✕ 取消顯示 — 點掉膠囊，並提示之後可在設定重新開啟 */}
            <span
                role="button"
                aria-label={t('隱藏教學提示', 'Hide tutorial badge')}
                onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
                onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onDismiss?.(); }}
                style={{
                    width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'rgba(246,244,241,0.75)',
                    marginLeft: 2,
                }}
            >
                <X size={11} strokeWidth={2.5} />
            </span>
        </motion.button>
    );
}

const NavButton = ({ item, active, selected, onSelect, index, badge = 0 }) => {
    const Icon = item.icon;

    return (
        <motion.button
            data-onboard={`nav-${item.id}`}
            data-nav-index={index}
            className="drvn-glass-nav__button"
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            type="button"
            onClick={(event) => {
                // Pointer selection is committed by the nav on release; keyboard/AT use click.
                if (event.detail === 0) onSelect(item);
            }}
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay: 0.18 + index * 0.06,   // stagger after nav bar itself arrives
                duration: 0.45,
                ease: swissNavTabEnter,
            }}
            whileTap={{ scale: 0.95 }}
        >
            {/* Icon（極簡：純 icon，不顯示文字標籤） */}
            <div className="flex items-center justify-center relative">
                <Icon
                    size={22}
                    strokeWidth={selected ? 2.5 : 2}
                    style={{
                        color: selected ? '#F95C4B' : '#161415', /* Coral icon when active */
                        transition: 'all 0.4s ease',
                    }}
                />
                {/* 🔴 未讀紅點 —— 目前只有社群（好友邀請）在用。
                    稽核前：後端有 pending_requests、SocialPage 也有完整的「待審」分頁，
                    但整個 App 沒有任何地方告訴使用者「有人加你好友」，
                    邀請寄出去等於石沉大海。這顆點就是那個缺掉的通知。 */}
                {badge > 0 && (
                    <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                        aria-label={`${badge} 則待處理`}
                        style={{
                            position: 'absolute', top: -4, right: -7,
                            minWidth: badge > 9 ? 18 : 15, height: 15, padding: '0 4px',
                            borderRadius: 999, background: '#F95C4B', color: '#fff',
                            fontSize: 11, fontWeight: 800, lineHeight: '15px', textAlign: 'center',
                            border: '1.5px solid rgba(255,255,255,0.92)',
                            boxShadow: '0 2px 6px rgba(249,92,75,0.4)',
                            pointerEvents: 'none',
                        }}
                    >
                        {badge > 9 ? '9+' : badge}
                    </motion.span>
                )}
            </div>
        </motion.button>
    );
};

const CapsuleNavigation = () => {
    const reduceMotion = useReducedMotion();
    const location = useLocation();
    const navigate = useNavigate();
    /* 有人加你好友時，社群圖示要有紅點 —— 否則使用者永遠不知道要去回覆。 */
    const { count: pendingFriends } = usePendingFriendRequests();

    const isActive = (item) => {
        const path = item.path;
        const here = location.pathname;
        if (here === path) return true;
        // 首頁別名
        if (path === '/mobile-home' && here === '/dashboard-mobile') return true;
        // 計劃相關內頁（多前綴）：/luxury-plan、/plan-preview、/plan-tracking、/custom-plan…
        if (item.matchPrefixes && item.matchPrefixes.some(p => here.startsWith(p))) return true;
        // 社群相關頁面
        if (path === '/social-mobile' && (
            here.startsWith('/social') ||
            here.startsWith('/community') ||
            here.startsWith('/fitness-community') ||
            here.startsWith('/evolution')
        )) return true;
        // 其他子路由：以路徑前綴判定（排除首頁與社群避免誤判）
        if (path !== '/mobile-home' && path !== '/social-mobile' && here.startsWith(path)) return true;
        return false;
    };

    const [isHidden, setIsHidden] = React.useState(false);
    // Spotlight 教學期間，介紹完底部 5 個 nav tab 之後就把整個 bottom nav 隱藏，
    // 避免 spotlight 在講「更多功能探索」/ 後續 section 時被導航膠囊擋住或誤觸。
    const [spotlightHidden, setSpotlightHidden] = React.useState(false);

    // 教學進度浮窗開關
    const [showTutorialPanel, setShowTutorialPanel] = useState(false);
    // 未完成的教學數量
    const [unfinishedCount, setUnfinishedCount] = useState(0);
    // 教學膠囊是否被使用者手動隱藏（可到 設定 → 重啟教學導覽 重新開啟）
    const [badgeDismissed, setBadgeDismissed] = useState(
        () => localStorage.getItem(TUTORIAL_BADGE_HIDDEN_KEY) === '1'
    );

    const dismissBadge = useCallback(() => {
        try { localStorage.setItem(TUTORIAL_BADGE_HIDDEN_KEY, '1'); } catch { /* ignore */ }
        setBadgeDismissed(true);
        haptic('light');
        toast.info('教學提示已隱藏。想再看時，到「設定 → 個人化設定 → 重啟教學導覽」即可重新開啟。');
    }, []);

    React.useEffect(() => {
        const handleToggle = (e) => setIsHidden(!!e.detail.hidden);
        window.addEventListener('toggle-capsule-nav', handleToggle);
        return () => window.removeEventListener('toggle-capsule-nav', handleToggle);
    }, []);

    // ── 監聽 spotlight 狀態：步驟一旦離開「介紹 5 個底部 tab」階段就隱藏 ──
    React.useEffect(() => {
        // 5 個介紹底部 nav 的步驟 id — 只在這 5 步顯示
        const NAV_INTRO_STEP_IDS = new Set([
            'nav-home', 'nav-plan', 'nav-analysis', 'nav-social', 'nav-profile',
        ]);
        const handle = (e) => {
            const { active, stepId } = (e.detail || {});
            if (!active) {
                // 教學結束 → 還原
                setSpotlightHidden(false);
                return;
            }
            // 教學進行中：如果當前不在「介紹底部 tab」5 步內 → 隱藏 bottom nav
            setSpotlightHidden(!NAV_INTRO_STEP_IDS.has(stepId));
        };
        window.addEventListener('drvn:onboarding-state', handle);
        return () => window.removeEventListener('drvn:onboarding-state', handle);
    }, []);

    // ── 計算未完成教學數量（路由切換或頁面 focus 時重算）──────────────────
    const computeUnfinished = useCallback(() => {
        const cnt = TUTORIAL_SECTIONS.filter(s => !hasSeenTip(s.key)).length;
        setUnfinishedCount(cnt);
        // 「設定 → 重啟教學導覽」會清掉隱藏旗標 → 路由切換時同步還原膠囊
        setBadgeDismissed(localStorage.getItem(TUTORIAL_BADGE_HIDDEN_KEY) === '1');
    }, []);

    useEffect(() => {
        computeUnfinished();
    }, [location.pathname, computeUnfinished]);

    // 教學完成後，Panel 關閉時也重算
    const handleClosePanel = useCallback(() => {
        setShowTutorialPanel(false);
        computeUnfinished();
    }, [computeUnfinished]);

    const gestureRef = useRef(null);
    const [scrub, setScrub] = useState(null);

    const selectItem = (item) => {
        if (isActive(item)) return;
        window.dispatchEvent(new CustomEvent('nav-will-change'));
        triggerHaptic('light');
        navigate(item.path);
    };

    const samplePointer = (event, rect, gesture = null) => {
        const cellWidth = (rect.width - 14) / NAV_ITEMS.length;
        const deltaX = gesture ? event.clientX - gesture.downX : 0;
        // Keep the initial grab offset: pressing near an edge must not move the lens.
        // Consume the dead zone before dragging so crossing the threshold cannot jump.
        const dragX = Math.sign(deltaX) * Math.max(0, Math.abs(deltaX) - TAP_SLOP);
        const position = Math.max(0, Math.min(NAV_ITEMS.length - 1,
            gesture ? gesture.anchorIndex + dragX / cellWidth
                : (event.clientX - rect.left - 7) / cellWidth - 0.5));
        return {
            position,
            index: Math.round(position),
            inside: event.clientX >= rect.left - 24 && event.clientX <= rect.right + 24
                && event.clientY >= rect.top - 32 && event.clientY <= rect.bottom + 32,
        };
    };

    const cancelScrub = () => {
        gestureRef.current = null;
        setScrub(null);
    };

    /* 手指在「按下 → 放開」之間動幾 px 是正常的；超過這個距離才算滑動。 */
    const TAP_SLOP = 12;

    const startScrub = (event) => {
        /* ⚠️ 原本要求 event.target.closest('button') 才起手 ——
           膠囊外圈那 7px padding 因此完全沒反應，點在邊上等於沒點。 */
        if (!event.isPrimary || event.button !== 0 || gestureRef.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const sample = samplePointer(event, rect);
        if (!sample.inside) return;
        const hit = event.target.closest?.('[data-nav-index]');
        const downIndex = hit ? Number(hit.dataset.navIndex) : sample.index;
        const anchorIndex = Math.max(0, NAV_ITEMS.findIndex(isActive));
        gestureRef.current = {
            pointerId: event.pointerId, rect, index: downIndex,
            downX: event.clientX, downY: event.clientY,
            downIndex, anchorIndex,
            moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setScrub({ ...sample, position: anchorIndex, index: anchorIndex });
    };

    const moveScrub = (event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const sample = samplePointer(event, gesture.rect, gesture);
        if (Math.abs(event.clientX - gesture.downX) > TAP_SLOP
            || Math.abs(event.clientY - gesture.downY) > TAP_SLOP) gesture.moved = true;
        if (sample.inside && sample.index !== gesture.index) triggerHaptic('selectionChanged');
        gesture.index = sample.index;
        setScrub(sample);
    };

    const finishScrub = (event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const sample = samplePointer(event, gesture.rect, gesture);
        cancelScrub();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        // Both tap and drag commit the same centered/anchored preview.
        // Releasing outside or receiving pointercancel leaves the current route unchanged.
        if (sample.inside) selectItem(NAV_ITEMS[Math.abs(event.clientX - gesture.downX) > TAP_SLOP ? sample.index : gesture.downIndex]);
    };

    useEffect(() => {
        cancelScrub();
    }, [location.pathname, isHidden, spotlightHidden]);

    if (isHidden || spotlightHidden) return null;

    return (
        <>
            {/* 教學進度 Badge（只在有未完成項目時顯示） */}
            <AnimatePresence>
                {!showTutorialPanel && unfinishedCount > 0 && !badgeDismissed && (
                    <TutorialBadge
                        key="tutorial-badge"
                        count={unfinishedCount}
                        onClick={() => { triggerHaptic('medium'); setShowTutorialPanel(true); }}
                        onDismiss={dismissBadge}
                    />
                )}
            </AnimatePresence>

            {/* 教學進度浮窗 */}
            <AnimatePresence>
                {showTutorialPanel && (
                    <TutorialProgressPanel
                        key="tutorial-panel"
                        onClose={handleClosePanel}
                        navigate={navigate}
                    />
                )}
            </AnimatePresence>

            <div
                className="fixed left-0 right-0 z-[99999] flex justify-center pointer-events-none"
                style={{
                    bottom: 'env(safe-area-inset-bottom, 24px)',
                    paddingBottom: '24px'
                }}
            >
                <motion.nav
                    initial={{ y: 80, opacity: 0, scale: 0.97 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                        duration: 0.65,
                        ease: swissNavEnter,
                        delay: 0.08,          // brief pause — lets page content lead
                    }}
                    className="drvn-glass-nav"
                    aria-label="主要導航"
                    onPointerDown={startScrub}
                    onPointerMove={moveScrub}
                    onPointerUp={finishScrub}
                    onPointerCancel={cancelScrub}
                    onLostPointerCapture={cancelScrub}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    {/* Separate material layer keeps the lens from blurring an already blurred surface. */}
                    <span className="drvn-glass-nav__material" aria-hidden="true" />
                    <motion.span
                        className="drvn-glass-nav__lens-position"
                        aria-hidden="true"
                        initial={false}
                        animate={{
                            x: `${(scrub?.inside ? scrub.position : Math.max(0, NAV_ITEMS.findIndex(isActive))) * 100}%`,
                            opacity: scrub?.inside || NAV_ITEMS.some(isActive) ? 1 : 0,
                        }}
                        transition={{
                            x: reduceMotion || scrub ? { duration: 0 }
                                : { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 },
                            opacity: { duration: reduceMotion ? 0 : 0.12 },
                        }}
                    >
                        <motion.span className="drvn-glass-nav__lens"
                            data-pressed={scrub?.inside ? 'true' : 'false'}
                            initial={false}
                            animate={{ scale: scrub?.inside && !reduceMotion ? 1.14 : 1 }}
                            transition={{ duration: reduceMotion ? 0 : 0.12, ease: 'easeOut' }}
                        />
                    </motion.span>

                    {NAV_ITEMS.map((item, index) => (
                        <NavButton
                            key={item.id}
                            item={item}
                            active={isActive(item)}
                            selected={scrub?.inside ? scrub.index === index : isActive(item)}
                            onSelect={selectItem}
                            index={index}
                            badge={item.id === 'social' ? pendingFriends : 0}
                        />
                    ))}
                </motion.nav>
            </div>
        </>
    );
};

export default CapsuleNavigation;
