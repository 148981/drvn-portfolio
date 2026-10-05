/**
 * TutorialProgressPanel — 教學進度浮窗（獨立組件，可被多個地方共用）
 *
 * 顯示使用者尚未探索的教學 section，每個未完成項目點擊後
 * 直接跳轉到目標頁並自動啟動該頁的聚光燈引導。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, CheckCircle2, ChevronRight, Home,
    Calendar, Camera, Zap, BookOpen, Users, User, BarChart3, ClipboardList, Sparkles
} from 'lucide-react';
import { hasSeenTip } from '../utils/firstVisitCoach';
import { ONBOARDING_EVENT } from './OnboardingSpotlight';
import { resetOnboarding } from '../utils/onboardingState';
import { haptic } from '../utils/haptics';

// 所有教學 section 定義（與 CapsuleNavigation 和 SECTION_ROUTES 同步）
export const TUTORIAL_SECTIONS = [
    {
        key: 'spotlight-section-home',
        section: 'home',
        label: '首頁',
        icon: Home,
        route: '/mobile-home',
        desc: '今日訓練入口、更多操作',
    },
    {
        key: 'spotlight-section-plan',
        section: 'plan',
        label: '訓練計劃',
        icon: Calendar,
        route: '/luxury-plan-view-mobile',
        desc: '計劃工具列、週次切換、排程',
    },
    {
        key: 'spotlight-section-analysis',
        section: 'analysis',
        label: 'AI 動作分析',
        icon: Camera,
        route: '/analysis-choice-mobile',
        desc: 'Multi-Exercise Coach、姿勢修正',
    },
    {
        key: 'spotlight-section-run',
        section: 'run',
        label: '跑步系統',
        icon: Zap,
        route: '/cardio-tracker-mobile',
        desc: '虛擬教練、計劃',
    },
    {
        key: 'spotlight-section-nutrition',
        section: 'nutrition',
        label: '營養系統',
        icon: BookOpen,
        route: '/nutrition-mobile',
        desc: '熱量環、快速記錄',
    },
    {
        key: 'spotlight-section-social',
        section: 'social',
        label: '社群',
        icon: Users,
        route: '/social-mobile',
        desc: '動態、排行、官方挑戰賽',
    },
    {
        key: 'spotlight-section-profile',
        section: 'profile',
        label: '個人主頁',
        icon: User,
        route: '/profile-mobile',
        desc: '拼貼個人 DRVN 名片',
    },
    {
        key: 'spotlight-section-personality',
        section: 'personality',
        label: '運動人格',
        icon: Sparkles,
        route: '/personality-mobile',
        desc: '你的訓練傾向與人格類型',
    },
    {
        key: 'spotlight-section-pr',
        section: 'pr',
        label: '力量 PR',
        icon: BarChart3,
        route: '/power-pr-tracker-mobile',
        desc: '最大重量與 1RM 追蹤',
    },
    {
        key: 'spotlight-section-body',
        section: 'body',
        label: '身體數據',
        icon: ClipboardList,
        route: '/body-analysis-mobile',
        desc: '體重、體脂、InBody 分數',
    },
    {
        key: 'spotlight-section-session',
        section: 'session',
        label: '開始訓練',
        icon: Zap,
        route: '/training-session-mobile',
        desc: '動作執行、完成組數',
    },
];

const triggerHaptic = (style = 'medium') => haptic(style);

/**
 * TutorialProgressPanel
 *
 * Props:
 *  - onClose: () => void — 關閉浮窗
 *  - navigate: (path: string) => void — react-router navigate
 *  - style: object — 額外 style（可覆蓋 bottom/top 等定位）
 *  - onReplayAll: () => void — 點「重跑全部教學」時呼叫（選填）
 */
export default function TutorialProgressPanel({ onClose, navigate, style = {}, onReplayAll }) {
    const [sections, setSections] = useState([]);

    // 每次 mount / 開啟時重新計算進度
    useEffect(() => {
        const computed = TUTORIAL_SECTIONS.map(s => ({
            ...s,
            done: hasSeenTip(s.key),
        }));
        setSections(computed);
    }, []);

    const doneCnt = sections.filter(s => s.done).length;
    const totalCnt = sections.length;
    const pct = totalCnt > 0 ? Math.round((doneCnt / totalCnt) * 100) : 0;

    const handleLaunch = useCallback((sec) => {
        triggerHaptic('medium');
        onClose();
        navigate(sec.route);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT, { detail: { section: sec.section } }));
        }, 700);
    }, [onClose, navigate]);

    const handleReplayAll = useCallback(() => {
        triggerHaptic('heavy');
        onClose();
        if (onReplayAll) {
            onReplayAll();
        } else {
            resetOnboarding();
            window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT));
        }
    }, [onClose, onReplayAll]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.2 } }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            style={{
                position: 'fixed',
                bottom: 'calc(env(safe-area-inset-bottom, 24px) + 102px)',
                left: '16px',
                transform: 'none',
                width: 'calc(100% - 32px)',
                maxWidth: 398,
                zIndex: 99998,
                // 🪨 Pebble Liquid Glass — 淺色霧面玻璃，pebble 色底牌
                background: 'linear-gradient(160deg, rgba(229,222,210,0.78) 0%, rgba(207,198,184,0.70) 100%)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.45)',
                borderTop: '1px solid rgba(255,255,255,0.7)',
                borderRadius: 28,
                boxShadow: '0 30px 70px -18px rgba(43,39,34,0.45), inset 0 1.5px 1px rgba(255,255,255,0.75)',
                overflow: 'hidden',
                isolation: 'isolate',
                ...style,
            }}
        >
            {/* Liquid-glass specular sheen — 招牌頂部反光 */}
            <div style={{
                position: 'absolute', inset: 0, borderRadius: 28, pointerEvents: 'none', zIndex: 0,
                background: 'radial-gradient(120% 70% at 18% 0%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, transparent 22%)',
                mixBlendMode: 'screen',
            }} />
            {/* Coral ambient light for the glass to refract */}
            <div style={{ position: 'absolute', top: -60, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(249,92,75,0.18)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />
            {/* Top accent bar */}
            <div style={{
                position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(249,92,75,0.55), transparent)',
                pointerEvents: 'none', zIndex: 1,
            }} />

            {/* Header */}
            <div style={{ position: 'relative', zIndex: 1, padding: '20px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: '#D94030', marginBottom: 4, }}>
                        教學進度
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 700, color: '#161415', letterSpacing: '-0.01em', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                            {doneCnt} / {totalCnt}
                        </span>
                        <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.55)', fontWeight: 600 }}>個頁面已探索</span>
                    </div>
                </div>
                <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 style={{
 width: 32, height: 32, borderRadius: 99, border: '1px solid rgba(255,255,255,0.6)',
 background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
 display: 'flex', alignItems: 'center',
 justifyContent: 'center', cursor: 'pointer', color: 'rgba(22,20,21,0.6)',
 }}
 >
                    <X size={15} strokeWidth={2.2} />
                </motion.button>
            </div>

            {/* Progress bar */}
            <div style={{ position: 'relative', zIndex: 1, padding: '0 20px 16px' }}>
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.10)', overflow: 'hidden' }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                        style={{
                            height: '100%', borderRadius: 99,
                            background: 'linear-gradient(90deg, #F95C4B, #FF7A5C)',
                            boxShadow: '0 0 8px rgba(249,92,75,0.45)',
                        }}
                    />
                </div>
                <div style={{ fontSize: 12, color: 'rgba(22,20,21,0.45)', marginTop: 5, fontWeight: 700, letterSpacing: '0.1em' }}>
                    {pct === 100 ? '🎉 全部探索完畢！' : `${pct}% 完成`}
                </div>
            </div>

            {/* Divider */}
            <div style={{ position: 'relative', zIndex: 1, height: '1px', background: 'rgba(22,20,21,0.10)', margin: '0 20px' }} />

            {/* Section list */}
            <div style={{ position: 'relative', zIndex: 1, maxHeight: 300, overflowY: 'auto', padding: '8px 0 8px' }}>
                {sections.map((sec, i) => {
                    const Icon = sec.icon;
                    return (
                        <motion.button
                            key={sec.key}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            onClick={() => !sec.done && handleLaunch(sec)}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 20px',
                                background: 'transparent', border: 'none', cursor: sec.done ? 'default' : 'pointer',
                                textAlign: 'left',
                                opacity: sec.done ? 0.42 : 1,
                                transition: 'background 0.15s',
                            }}
                            onTouchStart={e => { if (!sec.done) e.currentTarget.style.background = 'rgba(249,92,75,0.10)'; }}
                            onTouchEnd={e => { e.currentTarget.style.background = 'transparent'; }}
                            onMouseEnter={e => { if (!sec.done) e.currentTarget.style.background = 'rgba(249,92,75,0.10)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            {/* Icon pill */}
                            <div style={{
                                width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: sec.done ? 'rgba(255,255,255,0.45)' : 'rgba(249,92,75,0.14)',
                                border: `1px solid ${sec.done ? 'rgba(255,255,255,0.6)' : 'rgba(249,92,75,0.30)'}`,
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                            }}>
                                <Icon size={16} color={sec.done ? 'rgba(22,20,21,0.38)' : '#F95C4B'} strokeWidth={2.2} />
                            </div>

                            {/* Text */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: sec.done ? 'rgba(22,20,21,0.4)' : '#161415', marginBottom: 2 }}>
                                    {sec.label}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', fontWeight: 500, lineHeight: 1.3 }}>
                                    {sec.done ? '已探索' : sec.desc}
                                </div>
                            </div>

                            {/* Status */}
                            <div style={{ flexShrink: 0 }}>
                                {sec.done
                                    ? <CheckCircle2 size={18} color="#2E9E5B" strokeWidth={2} />
                                    : <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: '#D94030', letterSpacing: '0.1em', }}>探索</span>
                                        <ChevronRight size={14} color="#D94030" strokeWidth={2.5} />
                                    </div>
                                }
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* Footer: Replay all + tip */}
            <div style={{
                position: 'relative', zIndex: 1,
                padding: '10px 16px 14px',
                borderTop: '1px solid rgba(22,20,21,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
                <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', lineHeight: 1.5 }}>
                    {doneCnt < totalCnt ? '點擊未探索項目，跳轉並啟動引導' : '全部教學已完成！'}
                </span>
                <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={handleReplayAll}
                    style={{
                        flexShrink: 0,
                        padding: '7px 14px',
                        borderRadius: 99,
                        background: 'rgba(249,92,75,0.14)',
                        border: '1px solid rgba(249,92,75,0.35)',
                        color: '#D94030',
                        fontSize: 11, fontWeight: 800,
                        cursor: 'pointer',
                        letterSpacing: '0.08em',
                        whiteSpace: 'nowrap',
                        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    }}
                >
                    重跑全部
                </motion.button>
            </div>
        </motion.div>
    );
}
