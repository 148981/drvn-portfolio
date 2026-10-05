import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Calendar, Scan, Users, User, X, LayoutGrid, Layers, Activity, Droplet, Trophy, TrendingUp, Map as MapIcon, History, Target, CalendarDays, Sparkles, Sticker } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { markOnboardingDone, isOnboardingDone } from '../utils/onboardingState';
import { markTipSeen, hasSeenTip } from '../utils/firstVisitCoach';
import { getUserId } from '../utils/auth';
import { installDemoPlan, removeDemoPlan } from '../utils/onboardingDemoPlan';

/* ════════════════════════════════════════════════════════════════════════
   OnboardingSpotlight — 首次登入新手教學（跨頁面自動帶路 · 聚光燈引導）
   ────────────────────────────────────────────────────────────────────────
   設計語言：時尚 · 極簡 · 直覺
     · 手繪質感元素（橢圓圈選、手寫箭頭、波浪底線）— 編輯風手稿
     · 配色（Charcoal / White Smoke / Metallic Silver / Red Orange）
     · 動效人格：Premium — MD3 Emphasized easing，無誇張 overshoot
   行為：
     1. 先在首頁逐一介紹底部 5 大導覽 tab
     2. 自動 navigate() 帶使用者進入訓練計劃 → 跑步 → 營養 → 社群
     3. 每個頁面聚焦 2–3 個重要組件，跳轉後等目標 mount 完成才量測
   z-index：固定 99999，聚光燈與手繪圈圈永遠在最上層，不被導覽列遮擋
   整合：把 <OnboardingSpotlight /> 放在首頁組件最外層即可。
   ════════════════════════════════════════════════════════════════════════ */

// ─── 配色 token（圖二）────────────────────────────────────────────────────
const PALETTE = {
    charcoal: '#262523',
    smoke: '#F6F4F1',
    silver: '#B9C8D7',
    accent: '#F95C4B',
};

// MD3 Emphasized — Premium 進場；Accelerate — 退場
const EASE_ENTER = [0.05, 0.7, 0.1, 1];
const EASE_EXIT = [0.3, 0, 1, 1];

// 等目標元素 mount 且位置穩定的輪詢設定
// 較短的間隔 → 量到「位置穩定」的反應更快，減少捲動後高亮框遲遲不出現的卡頓感
const POLL_INTERVAL = 40;   // ms
const POLL_MAX = 105;       // 仍保留 ~4.2 秒總額度（涵蓋 lazy chunk 載入 + 進場動畫 + 捲動落定）

// 全域事件名稱 — 任何頁面的「重看教學」按鈕都能用 window.dispatchEvent 觸發
export const ONBOARDING_EVENT = 'drvn:open-onboarding';

// 教學開啟 / 關閉時派發此事件（detail.active）— 供 App 在教學期間抑制待機畫面
export const ONBOARDING_STATE_EVENT = 'drvn:onboarding-state';

/* ─── 引導步驟定義 ─────────────────────────────────────────────────────────
   target  : 優先用的 data-onboard selector
   route   : 此步驟所在的路由（與前一步不同時，組件會自動 navigate 過去）
   region  : 找不到 target 時的版面 fallback（top / center / bottom / bottom-nav）
   ──────────────────────────────────────────────────────────────────────── */
/* 每個 step 多了 section 欄位：
   · 'nav' = 開場導覽（5 個底部 tab，由首頁或「重看教學」觸發）。
   · 其餘 = 各分頁的深功能段落，改成「第一次進到該頁時」才整段跑那一頁的聚光燈，
     不再開場一次灌完。每段跑完就原地收起、停留在當頁，不會把使用者拉回首頁。 */
const STEPS = [
    // ── SECTION nav：底部 5 大導覽 tab（都在首頁）─────────────────────────
    {
        id: 'nav-home', section: 'nav', icon: Home, route: '/mobile-home',
        kicker: '01 · 導覽',
        title: '首頁',
        desc: '回到這裡看今天要練什麼。',
        target: '[data-onboard="nav-home"]', region: 'bottom-nav',
    },
    {
        id: 'nav-plan', section: 'nav', icon: Calendar, route: '/mobile-home',
        kicker: '01 · 導覽',
        title: '計劃',
        desc: '點這裡看完整課表與週期進度。',
        target: '[data-onboard="nav-plan"]', region: 'bottom-nav',
    },
    {
        id: 'nav-analysis', section: 'nav', icon: Scan, route: '/mobile-home',
        kicker: '01 · 導覽',
        title: '分析',
        desc: '點這裡錄影分析姿勢、追蹤跑步。',
        target: '[data-onboard="nav-analysis"]', region: 'bottom-nav',
    },
    {
        id: 'nav-social', section: 'nav', icon: Users, route: '/mobile-home',
        kicker: '01 · 導覽',
        title: '社群',
        desc: '點這裡看夥伴動態、參加挑戰。',
        target: '[data-onboard="nav-social"]', region: 'bottom-nav',
    },
    {
        id: 'nav-profile', section: 'nav', icon: User, route: '/mobile-home',
        kicker: '01 · 導覽',
        title: '個人',
        desc: '點這裡管理身體數據與成就。',
        target: '[data-onboard="nav-profile"]', region: 'bottom-nav',
    },

    // ── SECTION home：首頁（/mobile-home）─────────────────────────────────
    {
        id: 'home-today', section: 'home', icon: Home, route: '/mobile-home',
        kicker: '導覽 · 首頁',
        title: '今天要練什麼',
        desc: '點「今天」直接開始。點週曆看其他天。',
        target: '[data-onboard="home-today"]', region: 'top',
        scrollTo: { target: '[data-onboard="home-today"]', block: 'start', delay: 100 },
        cardCenter: true,
    },
    {
        id: 'home-more', section: 'home', icon: LayoutGrid, route: '/mobile-home',
        kicker: '導覽 · 首頁',
        title: '更多操作',
        desc: '往下捲找更多操作。長按任一張卡可自訂排版。',
        target: '[data-onboard="home-more-actions"]', region: 'bottom',
        scrollTo: { target: '[data-onboard="home-more-actions"]', block: 'center', delay: 100 },
        cardCenter: true,
    },

    // ── SECTION plan：訓練計劃頁（/luxury-plan-view-mobile）────────────────
    {
        id: 'plan-today', section: 'plan', icon: Dumbbell, route: '/luxury-plan-view-mobile',
        kicker: '導覽 · 訓練計劃',
        title: '今天要練什麼',
        desc: '點「開始訓練」直接進入今天的課表。',
        target: '[data-onboard="plan-today"]', region: 'bottom',
        scrollTo: { target: '[data-onboard="plan-today"]', block: 'start', delay: 100 },
    },
    {
        id: 'plan-toolbar', section: 'plan', icon: LayoutGrid, route: '/luxury-plan-view-mobile',
        kicker: '導覽 · 訓練計劃',
        title: '計劃工具',
        desc: '從這裡看紀錄、改課表，最右可重新生成。',
        target: '[data-onboard="plan-toolbar"]', region: 'top',
        nudgeY: -14,
    },
    {
        id: 'plan-weeks', section: 'plan', icon: Calendar, route: '/luxury-plan-view-mobile',
        kicker: '導覽 · 訓練計劃',
        title: '切換週次',
        desc: '點週次切換，看各週的安排與進度。',
        target: '[data-onboard="plan-weeks"]', region: 'center',
    },
    {
        id: 'plan-schedule', section: 'plan', icon: Layers, route: '/luxury-plan-view-mobile',
        kicker: '導覽 · 訓練計劃',
        title: '調整訓練日',
        desc: '點任一天預覽課表，「修改」可改訓練日。',
        target: '[data-onboard="plan-schedule"]', region: 'center',
    },
    {
        id: 'plan-recovery', section: 'plan', icon: Activity, route: '/luxury-plan-view-mobile',
        kicker: '導覽 · 訓練計劃',
        title: '恢復狀態',
        desc: '看各部位恢復程度，點 SCAN 掃描更新。',
        target: '[data-onboard="plan-recovery"]', region: 'bottom',
        scrollTo: { target: '[data-onboard="plan-recovery"]', block: 'center', delay: 0 },
        cardCenter: true,
    },
    {
        id: 'plan-daylist', section: 'plan', icon: CalendarDays, route: '/luxury-plan-view-mobile',
        kicker: '導覽 · 訓練計劃',
        title: '逐日課表',
        desc: '往下捲看每一天，點任一天展開動作。',
        target: '[data-onboard="plan-daylist"]', region: 'bottom',
        scrollTo: { target: '[data-onboard="plan-daylist"]', block: 'start', delay: 0 },
        cardCenter: true,
    },

    // ── SECTION analysis：AI 動作分析（/analysis-choice-mobile）────────────
    {
        id: 'analysis-multi-coach', section: 'analysis', icon: Sparkles, route: '/analysis-choice-mobile',
        kicker: '導覽 · AI 動作分析',
        title: '動作分析',
        desc: '錄影上傳，逐個動作看姿勢偏差。一次最多 6 個。',
        target: '[data-onboard="analysis-multi-coach"]', region: 'center',
        scrollTo: { target: '[data-onboard="analysis-multi-coach"]', block: 'center', delay: 100 },
        cardCenter: true,
    },

    // ── SECTION run：跑步系統（/cardio-tracker-mobile）────────────────────
    {
        id: 'run-toolbar', section: 'run', icon: Activity, route: '/cardio-tracker-mobile',
        kicker: '導覽 · 跑步系統',
        title: '跑步功能',
        desc: '從這排膠囊開啟教練、課表與工具。',
        target: '[data-onboard="run-toolbar"]', region: 'top',
    },
    {
        id: 'run-coach', section: 'run', icon: Target, route: '/cardio-tracker-mobile',
        kicker: '導覽 · 跑步系統',
        title: '虛擬教練',
        desc: '選間歇或配速課表，跑步時用語音帶你。',
        target: '[data-onboard="run-coach"]', region: 'top',
    },
    {
        id: 'run-plan-inbox', section: 'run', icon: CalendarDays, route: '/cardio-tracker-mobile',
        kicker: '導覽 · 跑步系統',
        title: '跑步課表',
        desc: '點這裡看今天該跑多遠、目標配速。',
        target: '[data-onboard="run-plan-inbox"]', region: 'top',
    },
    {
        id: 'run-more', section: 'run', icon: LayoutGrid, route: '/cardio-tracker-mobile',
        kicker: '導覽 · 跑步系統',
        title: '更多工具',
        desc: '點這裡看配速趨勢、路段與歷史紀錄。',
        target: '[data-onboard="run-more"]', region: 'top',
    },

    // ── SECTION nutrition：營養系統（/nutrition-mobile）───────────────────
    {
        id: 'nutri-tabs', section: 'nutrition', icon: Droplet, route: '/nutrition-mobile',
        kicker: '導覽 · 營養系統',
        title: '三個分頁',
        desc: '總覽看今天，歷史看過往，深度分析看趨勢。',
        target: '[data-onboard="nutrition-tabs"]', region: 'top',
    },
    {
        id: 'nutri-ring', section: 'nutrition', icon: Droplet, route: '/nutrition-mobile',
        kicker: '導覽 · 營養系統',
        title: '記錄飲食',
        desc: '上方設目標，下方快速補水與記錄餐點。',
        target: '[data-onboard="nutrition-ring"]', region: 'center',
        scrollTo: { target: '[data-onboard="nutrition-ring"]', block: 'center', delay: 220 },
        cardCenter: true,
    },

    // ── SECTION social：社群系統（/social-mobile）─────────────────────────
    {
        id: 'social-tabs', section: 'social', icon: Users, route: '/social-mobile',
        kicker: '導覽 · 社群系統',
        title: '四個分頁',
        desc: '動態、排行、社團、我的。',
        target: '[data-onboard="social-tabs"]', region: 'top',
    },
    {
        id: 'social-events', section: 'social', icon: Trophy, route: '/social-mobile',
        kicker: '導覽 · 社群系統',
        title: '挑戰賽',
        desc: '點進挑戰賽，完成目標解鎖徽章。',
        target: '[data-onboard="social-events"]', region: 'center',
        scrollTo: { target: '[data-onboard="social-events"]', block: 'center', delay: 0 },
        cardCenter: true,
    },

    // ── SECTION profile：個人主頁（/profile-mobile）──────────────────────
    {
        id: 'profile-stickers', section: 'profile', icon: Sticker, route: '/profile-mobile',
        kicker: '導覽 · 個人主頁',
        title: '名片排版',
        desc: '長按貼紙進入排版模式，可拖曳旋轉。',
        target: '[data-onboard="profile-stickers"]', region: 'top',
        scrollTo: { target: '[data-onboard="profile-stickers"]', block: 'start', delay: 150 },
        cardCenter: true,
    },

    // ── SECTION pr：力量 PR 追蹤（/power-pr-tracker-mobile）───────────────
    {
        id: 'pr-overview', section: 'pr', icon: TrendingUp, route: '/power-pr-tracker-mobile',
        kicker: '導覽 · 力量 PR',
        title: '力量紀錄',
        desc: '看各動作最大重量與 1RM，訓練後自動更新。',
        target: '[data-onboard="pr-overview"]', region: 'top',
        cardCenter: true,
    },

    // ── SECTION body：身體數據 / InBody（/body-analysis-mobile）───────────
    {
        id: 'body-overview', section: 'body', icon: Activity, route: '/body-analysis-mobile',
        kicker: '導覽 · 身體數據',
        title: '身體組成',
        desc: '更新體重體脂後，計劃與熱量目標會跟著調整。',
        target: '[data-onboard="body-overview"]', region: 'top',
        cardCenter: true,
    },

    // ── SECTION personality：運動人格（/personality-mobile）──────────────
    {
        id: 'personality-overview', section: 'personality', icon: Sparkles, route: '/personality-mobile',
        kicker: '導覽 · 運動人格',
        title: '運動人格',
        desc: '依你的訓練偏好與數據歸納出的類型。',
        target: '[data-onboard="personality-overview"]', region: 'center',
        cardCenter: true,
    },

    // ── SECTION session：訓練執行中（/training-session-mobile）────────────
    //    新手最需要被牽著走的畫面 —— 訓練進行時的操作面板完整教學。
    {
        id: 'session-dashboard', section: 'session', icon: Activity, route: '/training-session-mobile',
        kicker: '導覽 · 開始訓練',
        title: '動作佇列',
        desc: '點卡片打開佇列：調順序、跳過、改組數。',
        target: '[data-onboard="session-dashboard"]', region: 'top',
    },
    {
        id: 'session-exercise', section: 'session', icon: Dumbbell, route: '/training-session-mobile',
        kicker: '導覽 · 開始訓練',
        title: '當前動作',
        desc: '對照示範圖做動作，點圖看上次紀錄。',
        target: '[data-onboard="session-exercise"]', region: 'center',
        cardCenter: true,
    },
    {
        id: 'session-actionbar', section: 'session', icon: Activity, route: '/training-session-mobile',
        kicker: '導覽 · 開始訓練',
        title: '完成一組',
        desc: '做完一組點一下，自動開始休息。長按結束。',
        target: '[data-onboard="session-actionbar"]', region: 'bottom',
        cardCenter: true,
    },

];

/* 各分頁 section 的「第一次造訪自動觸發」設定：route 前綴 → section。
   App.jsx 的 RouteSectionSpotlight 會用這份對照表，在使用者首次進到該頁時
   dispatch ONBOARDING_EVENT { section }，把那一頁的聚光燈段落跑一次。 */
export const SECTION_ROUTES = [
    { match: '/mobile-home', section: 'home' },
    { match: '/luxury-plan-view-mobile', section: 'plan' },
    { match: '/analysis-choice-mobile', section: 'analysis' },
    { match: '/cardio-tracker-mobile', section: 'run' },
    { match: '/nutrition-mobile', section: 'nutrition' },
    { match: '/social-mobile', section: 'social' },
    { match: '/profile-mobile', section: 'profile' },
    { match: '/power-pr-tracker-mobile', section: 'pr' },
    { match: '/body-analysis-mobile', section: 'body' },
    { match: '/personality-mobile', section: 'personality' },
    { match: '/training-session-mobile', section: 'session' },
];

/* ─── 手繪箭頭 SVG（編輯風手稿，指向高亮目標）──────────────────────────── */
const HandDrawnArrow = ({ flip = false }) => (
    <svg
        width="72" height="64" viewBox="0 0 72 64" fill="none"
        style={{ transform: flip ? 'scaleX(-1)' : 'none' }}
    >
        <motion.path
            d="M8 6 C 20 2, 44 8, 52 30 C 56 41, 54 48, 50 56"
            stroke={PALETTE.silver} strokeWidth="2.4" strokeLinecap="round" fill="none"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: EASE_ENTER, delay: 0.25 }}
        />
        <motion.path
            d="M38 50 L50 57 L57 44"
            stroke={PALETTE.silver} strokeWidth="2.4" strokeLinecap="round"
            strokeLinejoin="round" fill="none"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.32, ease: EASE_ENTER, delay: 0.85 }}
        />
    </svg>
);

/* ─── 手繪橢圓圈選（在高亮目標周圍畫一圈，像手稿在圈重點）────────────── */
const HandDrawnEllipse = () => (
    <svg
        viewBox="0 0 120 96" fill="none"
        style={{ position: 'absolute', inset: '-22%', width: '144%', height: '144%', pointerEvents: 'none' }}
    >
        <motion.path
            d="M60 8 C 96 8, 114 26, 112 48 C 110 74, 84 90, 56 88 C 24 86, 6 66, 9 42 C 12 20, 34 9, 62 9"
            stroke={PALETTE.accent} strokeWidth="2.6" strokeLinecap="round" fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.85, ease: EASE_ENTER, delay: 0.15 }}
        />
    </svg>
);

/* ─── 手繪波浪底線 ─────────────────────────────────────────────────────── */
const HandDrawnUnderline = ({ delay = 0.4 }) => (
    <svg
        width="100%" height="12" viewBox="0 0 220 12"
        preserveAspectRatio="none" fill="none"
        style={{ display: 'block', marginTop: '2px' }}
    >
        <motion.path
            d="M3 7 C 40 2, 70 11, 110 6 C 150 1, 185 10, 217 5"
            stroke={PALETTE.accent} strokeWidth="3" strokeLinecap="round" fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: EASE_ENTER, delay }}
        />
    </svg>
);

/* ─── 進度圓點 ─────────────────────────────────────────────────────────── */
const ProgressDots = ({ total, current, isLight }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
        {Array.from({ length: total }).map((_, i) => (
            <motion.span
                key={i}
                animate={{
                    width: i === current ? 20 : 6,
                    backgroundColor: i === current
                        ? PALETTE.accent
                        : i < current ? (isLight ? 'rgba(32,32,32,0.3)' : PALETTE.silver) : (isLight ? 'rgba(32,32,32,0.15)' : 'rgba(245,245,245,0.22)'),
                }}
                transition={{ duration: 0.4, ease: EASE_ENTER }}
                style={{ height: 6, borderRadius: 99, display: 'block' }}
            />
        ))}
    </div>
);

/* ═══════════════════════════════════════════════════════════════════════
   WelcomeScreen — 教學結束後的全螢幕迎賓畫面（瑞士排版海報風）
   ───────────────────────────────────────────────────────────────────────
   靈感：瑞士國際主義 / 編輯海報 —— 超大無襯線字體佔滿版面、暖色紙感底、
   淡網格線、垂直編排的日期、小標籤（Date / Location）、旋轉側欄文字。
   動效（framer-motion，時尚感）：
     · 網格線：staggered 由細到顯、淡淡浮現
     · 大標題：遮罩 + 逐字 / 逐行往上掀出（clip reveal）
     · 日期數字：逐段落版
     · 退場：整體輕微上移淡出
   播放約 3.6 秒後自動收尾進首頁；點畫面任一處可提早結束。
   ═══════════════════════════════════════════════════════════════════════ */
const WELCOME_EASE = [0.16, 1, 0.3, 1]; // 高端 ease-out，落地俐落

// 海報配色：暖紙感底 + 單一強調色（沿用 DRVN 的 Red Orange）
const POSTER = {
    paper: '#E5DCCB',   // 暖紙底
    ink: '#F95C4B',     // 強調紅（標題 / 數字）
    grid: 'rgba(255,70,40,0.16)', // 淡網格線
    sub: 'rgba(36,30,24,0.55)',   // 內文 / 標籤
};

// 逐行遮罩掀出的單行
function PosterLine({ children, delay = 0, size, color, weight = 800, style = {} }) {
    return (
        <div style={{ overflow: 'hidden', display: 'block' }}>
            <motion.div
                initial={{ y: '108%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.82, ease: WELCOME_EASE, delay }}
                style={{
                    fontSize: size, fontWeight: weight, color,
                    lineHeight: 0.92, letterSpacing: '-0.03em',
                    whiteSpace: 'nowrap', ...style,
                }}
            >
                {children}
            </motion.div>
        </div>
    );
}

function WelcomeScreen({ onDone }) {
    // 今天的日期 → 海報用 MM. DD. YY 垂直編排
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);

    // 垂直網格線位置（百分比）
    const vLines = [16, 33, 50, 67, 84];
    const hLines = [14, 30, 46, 62, 78];

    return (
        <motion.div
            key="onboarding-welcome"
            onClick={onDone}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -24, transition: { duration: 0.45, ease: EASE_EXIT } }}
            transition={{ duration: 0.4, ease: EASE_ENTER }}
            style={{
                position: 'fixed', inset: 0, zIndex: 2147483647,
                background: POSTER.paper,
                cursor: 'pointer', overflow: 'hidden',
                fontFamily: "'Plus Jakarta Sans','Helvetica Neue',Arial,'Noto Sans TC',sans-serif",
            }}
        >
            {/* ── 淡網格線（瑞士版面骨架）—— staggered 浮現 ───────────────────── */}
            <svg
                aria-hidden width="100%" height="100%"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
                {vLines.map((p, i) => (
                    <motion.line
                        key={`v${i}`}
                        x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%"
                        stroke={POSTER.grid} strokeWidth="1"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 1.1, ease: WELCOME_EASE, delay: 0.1 + i * 0.06 }}
                    />
                ))}
                {hLines.map((p, i) => (
                    <motion.line
                        key={`h${i}`}
                        x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`}
                        stroke={POSTER.grid} strokeWidth="1"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 1.1, ease: WELCOME_EASE, delay: 0.16 + i * 0.06 }}
                    />
                ))}
            </svg>

            {/* ── 外框紅線（海報邊界）─────────────────────────────────────────── */}
            <motion.div
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, ease: WELCOME_EASE, delay: 0.55 }}
                style={{
                    position: 'absolute',
                    inset: 'max(18px, env(safe-area-inset-top,18px)) 18px max(18px, env(safe-area-inset-bottom,18px)) 18px',
                    border: `1px solid ${POSTER.grid}`, pointerEvents: 'none',
                }}
            />

            {/* ── 右側旋轉側欄文字 ─────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, ease: WELCOME_EASE, delay: 1.2 }}
                style={{
                    position: 'absolute', right: 'max(26px, calc(env(safe-area-inset-right,0px) + 26px))',
                    top: '21%',
                    writingMode: 'vertical-rl',
                    fontSize: 9, letterSpacing: '0.28em', fontWeight: 700,
                    color: POSTER.ink, textTransform: 'uppercase',
                }}
            >
                Powered by DRVN System
            </motion.div>

            {/* ── 主標題區（左上）—— 超大字、逐行掀出 ─────────────────────────── */}
            <div style={{
                position: 'absolute',
                left: 'max(30px, calc(env(safe-area-inset-left,0px) + 30px))',
                top: 'max(8dvh, 64px)',
            }}>
                <PosterLine delay={0.4} size="min(20vw, 96px)" color={POSTER.ink}>
                    WELCOME
                </PosterLine>
                <PosterLine delay={0.52} size="min(20vw, 96px)" color={POSTER.ink}>
                    ABOARD
                </PosterLine>
            </div>

            {/* ── Date 標籤 + 垂直日期數字（左中）─────────────────────────────── */}
            <div style={{
                position: 'absolute',
                left: 'max(30px, calc(env(safe-area-inset-left,0px) + 30px))',
                top: '37%',
            }}>
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.55, ease: WELCOME_EASE, delay: 0.95 }}
                    style={{
                        fontSize: 12, fontWeight: 700, color: POSTER.sub,
                        letterSpacing: '0.04em', marginBottom: 6,
                    }}
                >
                    Started
                </motion.div>
                <PosterLine delay={1.0} size="min(22vw, 104px)" color={POSTER.ink}
                    style={{ letterSpacing: '-0.04em' }}>
                    {mm}.
                </PosterLine>
                <PosterLine delay={1.12} size="min(22vw, 104px)" color={POSTER.ink}
                    style={{ letterSpacing: '-0.04em' }}>
                    {dd}.
                </PosterLine>
                <PosterLine delay={1.24} size="min(22vw, 104px)" color={POSTER.ink}
                    style={{ letterSpacing: '-0.04em' }}>
                    {yy}
                </PosterLine>
            </div>

            {/* ── 底部：Location 標籤 + 大字 + 內文段落 ───────────────────────── */}
            <div style={{
                position: 'absolute',
                left: 'max(30px, calc(env(safe-area-inset-left,0px) + 30px))',
                right: 'max(30px, calc(env(safe-area-inset-right,0px) + 30px))',
                bottom: 'max(34px, env(safe-area-inset-bottom,34px))',
            }}>
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.55, ease: WELCOME_EASE, delay: 1.4 }}
                    style={{
                        fontSize: 12, fontWeight: 700, color: POSTER.sub,
                        letterSpacing: '0.04em', marginBottom: 4,
                    }}
                >
                    Status
                </motion.div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                    <PosterLine delay={1.46} size="min(20vw, 86px)" color={POSTER.ink}>
                        READY
                    </PosterLine>

                    {/* 內文段落 —— 海報右下角的小字塊 */}
                    <motion.p
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: WELCOME_EASE, delay: 1.7 }}
                        style={{
                            margin: 0, maxWidth: 188, paddingBottom: 6,
                            fontSize: 11.5, lineHeight: 1.62, fontWeight: 500,
                            color: POSTER.sub,
                        }}
                    >
                        訓練、跑步、營養與恢復已串成一套系統。點擊任一處，
                        從今天的第一個動作開始。
                    </motion.p>
                </div>

                {/* 底線 + 進場提示 */}
                <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8, ease: WELCOME_EASE, delay: 1.85 }}
                    style={{
                        height: 1.5, background: POSTER.ink,
                        transformOrigin: 'left', marginTop: 14,
                    }}
                />
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, ease: WELCOME_EASE, delay: 2.05 }}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginTop: 8,
                    }}
                >
                    <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
                        color: POSTER.sub, textTransform: 'uppercase',
                    }}>
                        Entering Home
                    </span>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {[0, 1, 2].map((i) => (
                            <motion.span
                                key={i}
                                animate={{ opacity: [0.25, 1, 0.25] }}
                                transition={{
                                    duration: 1.4, ease: 'easeInOut',
                                    repeat: Infinity, delay: 2.2 + i * 0.2,
                                }}
                                style={{
                                    width: 5, height: 5, background: POSTER.ink, display: 'block',
                                }}
                            />
                        ))}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

/* ─── 依版面區域計算 fallback 高亮框 ──────────────────────────────────────
   找不到 data-onboard 目標時，用螢幕版面區域定位，確保教學不中斷
   ──────────────────────────────────────────────────────────────────────── */
function regionRect(region) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(vw, 440);
    const x = (vw - w) / 2;
    switch (region) {
        case 'bottom-nav':
            return { x: x + 14, y: vh - 96, w: w - 28, h: 70 };
        case 'top':
            return { x: x + 16, y: 60, w: w - 32, h: 88 };
        case 'bottom':
            return { x: x + 16, y: vh - 220, w: w - 32, h: 150 };
        case 'center':
        default:
            return { x: x + 16, y: vh / 2 - 110, w: w - 32, h: 220 };
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function OnboardingSpotlight({
    /** 強制顯示（用於測試按鈕／設定頁「重看教學」）*/
    forceShow = false,
    /** 教學全部完成或被跳過時呼叫 */
    onFinish = () => { },
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const [active, setActive] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    // 目前正在跑哪一個段落：'nav'（開場導覽）或 plan/run/... 各分頁段落。
    const [activeSection, setActiveSection] = useState('nav');
    const [rect, setRect] = useState(null);     // 目前 step 高亮目標座標
    const [navigating, setNavigating] = useState(false); // 跨頁跳轉中（遮罩過場）
    const [welcoming, setWelcoming] = useState(false);   // 教學結束後的全螢幕迎賓畫面
    const pollRef = useRef(null);
    const rafRef = useRef(null);

    // 只跑「目前段落」的步驟 —— 開場導覽只跑 5 個 tab；各分頁第一次造訪只跑該頁段落。
    const activeSteps = useMemo(
        () => STEPS.filter((s) => s.section === activeSection),
        [activeSection]
    );
    const isNavSection = activeSection === 'nav';

    // ── 第一次進到某一頁 → 自動開始那一頁的導覽 ─────────────────────────
    //   原本除了開場的 5 個 tab，其餘段落只能從「教學進度面板」手動點開，
    //   等於大多數人永遠看不到 —— 教學寫了等於沒寫。
    //   改成「當下看得到什麼就教什麼」：第一次進訓練計劃頁才講計劃頁，
    //   第一次進社群才講社群。分段短、又跟眼前畫面對得上，才記得住。
    const routeSections = useMemo(() => {
        const map = {};
        for (const st of STEPS) {
            if (st.section === 'nav') continue;          // 開場導覽另外處理
            if (!map[st.route]) map[st.route] = st.section;
        }
        return map;
    }, []);

    useEffect(() => {
        if (active) return;                              // 正在跑教學，不插隊
        if (!isOnboardingDone()) return;                 // 開場導覽都還沒跑完
        const sec = routeSections[location.pathname];
        if (!sec) return;
        if (hasSeenTip(`spotlight-section-${sec}`)) return;
        // 等頁面 mount + 進場動畫落定再開，否則量不到高亮目標的座標
        const t = setTimeout(() => {
            window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT, { detail: { section: sec } }));
        }, 900);
        return () => clearTimeout(t);
    }, [location.pathname, active, routeSections]);

    const step = activeSteps[stepIndex];
    const isLast = stepIndex === activeSteps.length - 1;

    // 目前使用者 ID（示範計劃的注入 / 還原都綁這個 ID）
    const userIdRef = useRef(null);
    if (userIdRef.current == null) {
        try { userIdRef.current = getUserId(); } catch { userIdRef.current = ''; }
    }

    /* ── 教學開始：若使用者沒有真實計劃，注入「模擬已生成計劃」────────────
       使用者可能在註冊時略過了健身計劃生成，計劃頁會是空的（No Active
       Plan）。教學會帶他進計劃頁逐一介紹工具列 / 週次 / 排程 / 恢復狀態，
       若頁面是空的就沒有東西可框。故在教學一開始就注入示範計劃，
       讓 LuxuryPlanView 在 mount 時讀得到完整課表。
       —— 若使用者本來就有真實計劃，installDemoPlan 會自動跳過、不覆蓋。   */
    const openTutorial = useCallback((section = 'nav') => {
        // plan 段落需要計劃頁有內容才框得到；nav 開場也會帶到計劃頁，故這兩種注入示範計劃。
        if (section === 'nav' || section === 'plan') {
            try { installDemoPlan(userIdRef.current); } catch { /* 忽略 */ }
        }
        setActiveSection(section);
        setStepIndex(0);
        setActive(true);
    }, []);

    // ── 由 forceShow prop 觸發（外部按鈕控制）────────────────────────────
    // 註：教學「不會」自動跳出，一律由使用者點按鈕觸發
    useEffect(() => {
        if (forceShow) {
            const t = setTimeout(() => { openTutorial('nav'); }, 0);
            return () => clearTimeout(t);
        }
    }, [forceShow, openTutorial]);

    // ── 全域事件：任何頁面的「教學 / 重看教學」按鈕，或各頁首次造訪都能觸發 ──
    //    event.detail.section 指定要跑哪一段；沒帶就是開場導覽（nav）。
    useEffect(() => {
        const open = (e) => { openTutorial(e?.detail?.section || 'nav'); };
        window.addEventListener(ONBOARDING_EVENT, open);
        return () => window.removeEventListener(ONBOARDING_EVENT, open);
    }, [openTutorial]);

    // ── 教學開 / 關時派發狀態事件 → App 據此在教學期間抑制待機畫面 ──────────
    //    額外帶上 stepId / stepIndex，讓 MobileNavigation 等元件可以根據
    //    進度自我隱藏 (e.g. 介紹完 5 個底部 tab 後，bottom nav 就退場讓 spotlight
    //    講「更多功能探索」時不擋畫面)
    useEffect(() => {
        const stepId = active && activeSteps[stepIndex] ? activeSteps[stepIndex].id : null;
        window.dispatchEvent(
            new CustomEvent(ONBOARDING_STATE_EVENT, {
                detail: { active, stepId, stepIndex: active ? stepIndex : -1 },
            })
        );
    }, [active, stepIndex]);

    // ── 量測目前 step 的目標座標（找不到 → 回傳 null）─────────────────────
    //    回傳的座標會被夾在可視範圍內，避免高亮框超出手機螢幕。
    const measureOnce = useCallback(() => {
        if (!step) return null;
        const el = document.querySelector(step.target);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        // 元素在畫面外（被捲動隱藏）→ 視為尚未就緒
        if (r.bottom < 0 || r.top > window.innerHeight) return null;

        // 夾住座標：高亮框不得超出螢幕邊界（留 8px 安全邊距）
        const M = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // step.nudgeY：微調高亮框的垂直位置（容器含 padding 時用來修正偏移）
        const nudgeY = step.nudgeY || 0;
        let x = r.left, y = r.top + nudgeY, w = r.width, h = r.height;
        if (x < M) { w += x - M; x = M; }
        if (y < M) { h += y - M; y = M; }
        if (x + w > vw - M) w = vw - M - x;
        if (y + h > vh - M) h = vh - M - y;
        if (w <= 0 || h <= 0) return null;
        return { x, y, w, h, found: true };
    }, [step]);

    // 兩個矩形座標是否幾乎相同（用於判斷元素是否已靜止）
    const rectStable = (a, b) =>
        a && b &&
        Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 &&
        Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;

    // ── 第一段：切換 step 時，若不在目標頁就先跳轉 ────────────────────────
    useEffect(() => {
        if (!active || !step || !step.route) return;
        const currentPath = location.pathname || '/';
        if (!currentPath.startsWith(step.route)) {
            setNavigating(true);
            navigate(step.route);
        }
        // 已在目標頁則不跳轉，量測交給第二段 effect
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, stepIndex]);

    // ── 第二段：路由或 step 改變後 → 輪詢等目標「mount 且位置穩定」→ 量測 ──
    //    依賴 location.pathname：跳轉完成、新頁面開始渲染時此 effect 會重跑。
    //    關鍵：頁面與組件常有進場動畫（y 位移），若一量到就定位，會框到
    //    動畫途中的錯誤位置。故改為「連續兩次量到相同座標」才視為穩定。
    useEffect(() => {
        if (!active || !step) return;
        const currentPath = location.pathname || '/';
        // 還沒抵達目標頁 → 等下一次 location 改變再處理
        if (step.route && !currentPath.startsWith(step.route)) return;

        let cancelled = false;
        let tries = 0;
        let lastHit = null;     // 上一次量到的座標
        let stableCount = 0;    // 連續穩定次數

        const poll = () => {
            if (cancelled) return;
            const hit = measureOnce();

            if (hit) {
                if (rectStable(hit, lastHit)) {
                    stableCount += 1;
                } else {
                    stableCount = 0;
                }
                lastHit = hit;
                // 連續 2 次座標一致 → 動畫已落定，定位
                if (stableCount >= 2) {
                    setRect(hit);
                    setNavigating(false);
                    return;
                }
            }

            if (tries < POLL_MAX) {
                tries += 1;
                pollRef.current = setTimeout(poll, POLL_INTERVAL);
            } else if (lastHit) {
                // 超時但有量到 → 用最後一次座標（總比 fallback 準）
                setRect(lastHit);
                setNavigating(false);
            } else {
                // 完全找不到目標 → 用版面區域 fallback，教學不中斷
                setRect({ ...regionRect(step.region), found: false });
                setNavigating(false);
            }
        };
        // 等兩幀讓頁面開始渲染後再起輪詢
        rafRef.current = requestAnimationFrame(() =>
            requestAnimationFrame(poll)
        );

        return () => {
            cancelled = true;
            if (pollRef.current) clearTimeout(pollRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [active, stepIndex, step, location.pathname, measureOnce]);

    // ── 視窗尺寸變動時重新量測 ────────────────────────────────────────────
    useEffect(() => {
        if (!active) return;
        const onResize = () => {
            const hit = measureOnce();
            setRect(hit || { ...regionRect(step?.region), found: false });
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [active, step, measureOnce]);

    // ── 鎖定背景「使用者」捲動 ────────────────────────────────────────────
    //    註：不使用 body { overflow:hidden }，因為那會連帶擋掉教學自己要做的
    //    程式化捲動（scrollTo）。改為攔截 touchmove / wheel —— 既能阻止使用者
    //    亂滑，又不影響 window.scrollTo 把畫面帶到指定組件。
    useEffect(() => {
        if (!active) return;
        const block = (e) => { e.preventDefault(); };
        window.addEventListener('touchmove', block, { passive: false });
        window.addEventListener('wheel', block, { passive: false });
        return () => {
            window.removeEventListener('touchmove', block);
            window.removeEventListener('wheel', block);
        };
    }, [active]);

    /* ── 步驟捲動：某些步驟（恢復狀態、熱量環…）的目標在頁面下半部 ──────────
       進到這類步驟時，先把畫面捲到目標位置，量測高亮框才會落在實際組件上。
       step.scrollTo = { target, block, delay }
         · delay → 開始捲動前的短暫停留（讓卡片先落版，不要一進來就抽動）
       為避免「卡住一陣子才捲」的卡頓感：用 rAF 偵測目標 mount（幾乎即時），
       目標一出現就立刻捲動，不再用 60ms 輪詢慢慢等。                       */
    useEffect(() => {
        if (!active || !step || !step.scrollTo) return;
        const currentPath = location.pathname || '/';
        if (step.route && !currentPath.startsWith(step.route)) return;

        let cancelled = false;
        let rafId = null;
        const { target, block = 'center', delay = 0 } = step.scrollTo;

        const scrollToEl = (el) => {
            try {
                el.scrollIntoView({ behavior: 'smooth', block });
            } catch {
                const r = el.getBoundingClientRect();
                window.scrollTo({
                    top: window.scrollY + r.top - window.innerHeight / 2 + r.height / 2,
                    behavior: 'smooth',
                });
            }
        };

        // 用 requestAnimationFrame 連續偵測目標 mount —— 幀級反應，目標一出現就捲
        const waitAndScroll = () => {
            let frames = 0;
            const tick = () => {
                if (cancelled) return;
                const el = document.querySelector(target);
                if (el) { scrollToEl(el); return; }
                // 約 3 秒上限（60fps × 180 幀）
                if (frames < 180) { frames += 1; rafId = requestAnimationFrame(tick); }
            };
            rafId = requestAnimationFrame(tick);
        };

        const t = setTimeout(waitAndScroll, delay);
        return () => {
            cancelled = true;
            clearTimeout(t);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [active, stepIndex, step, location.pathname]);

    // ── 開場導覽收尾：清掉示範計劃、標記完成、回首頁 ──────────────────────
    //    僅用於 'nav' 段落（迎賓畫面結束或中途跳過時）。
    const teardown = useCallback(() => {
        try { removeDemoPlan(userIdRef.current); } catch { /* 忽略 */ }
        // 標記目前段落「已探索」→ 進度面板能正確反映（nav 段落也標記，避免重看時又算未完成）
        try { markTipSeen(`spotlight-section-${activeSection}`); } catch { /* ignore */ }
        markOnboardingDone();
        setWelcoming(false);
        setActive(false);
        navigate('/mobile-home');
        onFinish();
    }, [navigate, onFinish, activeSection]);

    // ── 分頁段落收尾：原地收起即可，不播迎賓、不跳首頁、不改全域完成旗標 ──────
    //    使用者正停在該頁，聚光燈講完就安靜退場，停留在當頁繼續操作。
    const closeInPlace = useCallback(() => {
        try { removeDemoPlan(userIdRef.current); } catch { /* 忽略 */ }
        // 標記此段落已探索 → 進度面板 X/N 會 +1
        try { markTipSeen(`spotlight-section-${activeSection}`); } catch { /* ignore */ }
        setWelcoming(false);
        setActive(false);
    }, [activeSection]);

    // ── 跳過教學（卡片右上角 ✕）──────────────────────────────────────────
    const skip = useCallback(() => {
        if (isNavSection) teardown();
        else closeInPlace();
    }, [isNavSection, teardown, closeInPlace]);

    // ── 開場導覽最後一步完成 → 先進迎賓畫面，再由迎賓畫面收尾 ────────────────
    const finish = useCallback(() => {
        setWelcoming(true);
    }, []);

    const next = useCallback(() => {
        if (isLast) {
            if (isNavSection) finish();   // 開場導覽 → 迎賓畫面
            else closeInPlace();          // 分頁段落 → 原地收起
        } else {
            setStepIndex((i) => i + 1);
        }
    }, [isLast, isNavSection, finish, closeInPlace]);

    const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

    // ── 迎賓畫面：播放約 4.2 秒後自動收尾進首頁（也可點畫面提早結束）────────
    //    海報的逐行掀出在 ~2.6 秒落定，多留約 1.6 秒讓使用者看完整張版面。
    useEffect(() => {
        if (!welcoming) return;
        const t = setTimeout(() => { teardown(); }, 4200);
        return () => clearTimeout(t);
    }, [welcoming, teardown]);

    // ── 聚光燈孔洞幾何 ────────────────────────────────────────────────────
    const hole = useMemo(() => {
        if (!rect) return null;
        const padX = 10, padY = 8;
        return {
            x: rect.x - padX,
            y: rect.y - padY,
            w: rect.w + padX * 2,
            h: rect.h + padY * 2,
            cx: rect.x + rect.w / 2,
            cy: rect.y + rect.h / 2,
        };
    }, [rect]);

    // 卡片放在高亮上方還是下方
    const cardAbove = hole ? hole.cy > window.innerHeight * 0.52 : true;

    // 教學未啟動、且不在迎賓畫面 → 不渲染
    if ((!active || !step) && !welcoming) return null;

    const StepIcon = step?.icon;
    const maskId = 'onboard-spotlight-mask';

    // 🖤 可讀性修正：說明卡片一律使用「淺色底 + 黑色字」。
    //    之前的透明玻璃卡在淺色頁面（計劃頁等）會變成白字配淺底、幾乎看不清。
    //    卡片底改為實色暖紙感，文字固定深色，任何頁面上都清晰可讀。
    const isLight = step?.theme !== 'dark';
    const txtPrimary = isLight ? PALETTE.charcoal : '#FFFFFF';
    const txtSecondary = isLight ? 'rgba(32,32,32,0.65)' : PALETTE.silver;
    const txtDesc = isLight ? 'rgba(32,32,32,0.85)' : 'rgba(245,245,245,0.74)';
    const btnBg = isLight ? 'rgba(32,32,32,0.06)' : 'rgba(245,245,245,0.06)';
    const btnBorder = isLight ? 'rgba(32,32,32,0.1)' : 'rgba(245,245,245,0.1)';
    const btnColor = isLight ? 'rgba(32,32,32,0.55)' : 'rgba(245,245,245,0.55)';

    return (
        <AnimatePresence>
            {/* 迎賓畫面 —— 教學最後一步完成後顯示，播完自動進首頁 */}
            {welcoming && (
                <WelcomeScreen key="welcome" onDone={teardown} />
            )}

            {/* 聚光燈教學主體 —— 迎賓畫面出現時即收起 */}
            {active && !welcoming && step && (
                <motion.div
                    key="onboarding-spotlight"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.28, ease: EASE_EXIT } }}
                    transition={{ duration: 0.4, ease: EASE_ENTER }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        // 🔝 z-index 設為 32-bit int 最大值 — 膠囊導覽列本身是 z-index:99999，
                        //    若相同會因 DOM 順序被導航蓋住手繪圈圈，故必須更高
                        zIndex: 2147483647,
                        fontFamily: "'Plus Jakarta Sans','Noto Sans TC',sans-serif",
                    }}
                >
                    {/* ── 跨頁跳轉過場：純遮罩，避免換頁閃爍 ─────────────────────── */}
                    {(navigating || !hole) && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                position: 'absolute', inset: 0,
                                background: PALETTE.charcoal, opacity: 0.9,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
                                style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    border: `2.5px solid rgba(245,245,245,0.18)`,
                                    borderTopColor: PALETTE.accent,
                                }}
                            />
                        </motion.div>
                    )}

                    {hole && !navigating && (
                        <>
                            {/* ── 聚光燈遮罩：SVG mask 在目標上挖洞 ──────────────────── */}
                            <svg
                                width="100%" height="100%"
                                style={{ position: 'absolute', inset: 0, display: 'block' }}
                            >
                                <defs>
                                    <mask id={maskId}>
                                        <rect width="100%" height="100%" fill="white" />
                                        <motion.rect
                                            animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }}
                                            transition={{ duration: 0.55, ease: EASE_ENTER }}
                                            rx="18" ry="18" fill="black"
                                        />
                                    </mask>
                                </defs>
                                <rect
                                    width="100%" height="100%"
                                    fill={PALETTE.charcoal} fillOpacity="0.88"
                                    mask={`url(#${maskId})`}
                                />
                            </svg>

                            {/* ── 高亮孔洞外框 ──────────────────── */}
                            <motion.div
                                animate={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
                                transition={{ duration: 0.55, ease: EASE_ENTER }}
                                style={{ position: 'absolute', pointerEvents: 'none' }}
                            >
                                <div style={{
                                    position: 'absolute', inset: 0, borderRadius: 18,
                                    border: `1px solid rgba(255,255,255,0.2)`,
                                }} />
                            </motion.div>

                            {/* ── 指向高亮的手繪箭頭 ─────────────────────────────────────
                                 cardCenter 模式下卡片置中、會蓋住高亮區域，箭頭沒有
                                 指向意義，故略過不畫。 */}
                            {!step.cardCenter && (
                            <motion.div
                                key={`arrow-${step.id}`}
                                initial={{ opacity: 0, y: cardAbove ? 8 : -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.45, ease: EASE_ENTER, delay: 0.2 }}
                                style={{
                                    position: 'absolute',
                                    left: Math.min(
                                        Math.max(hole.cx - 36, 12),
                                        window.innerWidth - 84
                                    ),
                                    top: cardAbove ? hole.y - 72 : hole.y + hole.h + 8,
                                    transform: cardAbove ? 'none' : 'scaleY(-1)',
                                    pointerEvents: 'none',
                                }}
                            >
                                <HandDrawnArrow flip={hole.cx > window.innerWidth / 2} />
                            </motion.div>
                            )}

                            {/* ── 說明卡片 ─────────────────────────────────────────────── */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step.id}
                                    initial={{ opacity: 0, y: 22, x: '-50%' }}
                                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                                    exit={{ opacity: 0, y: -12, x: '-50%', transition: { duration: 0.22, ease: EASE_EXIT } }}
                                    transition={{ duration: 0.5, ease: EASE_ENTER }}
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        // step.cardCenter：卡片強制垂直置中（恢復狀態頁的恢復圖很大、
                                        //   高亮框佔滿畫面，卡片若貼底會被導覽列擋住按不到）
                                        ...(step.cardCenter
                                            ? { top: '50%', marginTop: '-118px' }
                                            : {
                                                [cardAbove ? 'bottom' : 'top']: cardAbove
                                                    ? `calc(100dvh - ${hole.y}px + 88px)`
                                                    : `${hole.y + hole.h + 94}px`,
                                            }),
                                        width: 'calc(100% - 40px)',
                                        maxWidth: 372,
                                        // 實色暖紙底 — 黑字在任何頁面（深/淺）都清楚可讀
                                        background: 'linear-gradient(160deg, rgba(249,247,244,0.97) 0%, rgba(238,232,223,0.96) 100%)',
                                        border: `1px solid rgba(255, 255, 255, 0.65)`,
                                        borderRadius: 28,
                                        padding: '26px 24px 22px',
                                        boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.85), 0 24px 60px -18px rgba(0,0,0,0.55)',
                                        backdropFilter: 'blur(32px) saturate(150%)',
                                        WebkitBackdropFilter: 'blur(32px) saturate(150%)',
                                    }}
                                >
                                    {/* 跳過 */}
                                    <motion.button {...pressProps('row')}
 onClick={skip}
 aria-label="跳過教學"
 style={{
 position: 'absolute', top: 14, right: 14,
 width: 30, height: 30, borderRadius: 99,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 background: btnBg,
 border: `1px solid ${btnBorder}`,
 color: btnColor,
 cursor: 'pointer',
 }}
 >
                                        <X size={15} strokeWidth={2.2} />
                                    </motion.button>

                                    {/* kicker */}
                                    <div style={{
                                        fontSize: 9, letterSpacing: '0.26em', fontWeight: 600,
                                        color: txtSecondary, marginBottom: 12,
                                    }}>
                                        {step.kicker}
                                    </div>

                                    {/* icon 徽章 + 標題 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 4 }}>
                                        <div style={{
                                            width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'rgba(255,70,40,0.12)',
                                            border: '1px solid rgba(255,70,40,0.3)',
                                            color: PALETTE.accent,
                                        }}>
                                            <StepIcon size={21} strokeWidth={2.2} />
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <h3 style={{
                                                margin: 0, fontSize: 21, fontWeight: 700,
                                                letterSpacing: '-0.01em', color: txtPrimary,
                                                lineHeight: 1.15,
                                            }}>
                                                {step.title}
                                            </h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p style={{
                                        margin: '12px 0 20px', fontSize: 14.5,
                                        lineHeight: 1.66, color: txtDesc,
                                    }}>
                                        {step.desc}
                                    </p>

                                    {/* 控制列 */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between', gap: 12,
                                    }}>
                                        {/* 進度：點點＋數字。只有點點時使用者不知道「還有多久」，
                                            尤其步數多的段落會讓人想直接關掉。 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <ProgressDots total={activeSteps.length} current={stepIndex} isLight={isLight} />
                                            <span style={{
                                                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                                                fontVariantNumeric: 'tabular-nums',
                                                color: isLight ? 'rgba(32,32,32,0.4)' : 'rgba(245,245,245,0.4)',
                                            }}>
                                                {stepIndex + 1} / {activeSteps.length}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                            {stepIndex > 0 && (
                                                <motion.button {...pressProps('row')}
 onClick={back}
 style={{
 height: 42, padding: '0 15px', borderRadius: 99,
 background: 'transparent',
 border: `1px solid ${isLight ? 'rgba(32,32,32,0.22)' : 'rgba(245,245,245,0.16)'}`,
 color: isLight ? 'rgba(32,32,32,0.72)' : 'rgba(245,245,245,0.7)',
 fontSize: 14, fontWeight: 600, cursor: 'pointer',
 }}
 >
                                                    上一步
                                                </motion.button>
                                            )}
                                            <motion.button
                                                onClick={next}
                                                whileTap={{ scale: 0.96 }}
                                                whileHover={{ y: -1 }}
                                                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                                                style={{
                                                    height: 42, padding: '0 20px', borderRadius: 99,
                                                    background: PALETTE.accent, border: 'none',
                                                    color: PALETTE.smoke, fontSize: 14, fontWeight: 700,
                                                    letterSpacing: '0.01em', cursor: 'pointer',
                                                    boxShadow: '0 8px 20px -6px rgba(255,70,40,0.55)',
                                                }}
                                            >
                                                {isLast ? '開始使用' : '下一步'}
                                            </motion.button>
                                        </div>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* 重設教學狀態的工具請從 utils/onboardingState 匯入：
   import { resetOnboarding } from '../utils/onboardingState'; */
