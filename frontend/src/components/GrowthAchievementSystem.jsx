import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Trophy, Flame, Utensils, CalendarCheck, X, Sparkles, Lock, Eye, MoreHorizontal, ChevronDown } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import RewardUnlockAnimation from './RewardUnlockAnimation';
import CrystalBadge3D from './CrystalBadge3D';
import { is3DBadge, badgeImage } from '../utils/benchBadgeAssets';
import { inCategory } from '../utils/challengeRegistry';
import { haptic } from '../utils/haptics';
import {
    checkAllAchievements,
    fetchBackendAchievementData,
    getUserXPAndTitle,
    GROWTH_ACHIEVEMENTS,
    ACHIEVEMENT_CATEGORIES,
    TIER_META,
    TIER_XP,
    TITLE_LEVELS,
    getTitleMode,
    setTitleMode,
    titleByMode,
    titleForMode,
    TITLE_MODES,
} from '../utils/growthAchievements';
import { toShowcase, syncShowcaseBadges } from '../utils/showcaseBadges';
import { getUserId } from '../utils/auth';

// ── [NEW] Haptic Feedback Utility ─────────────────────────────────────
const triggerHaptic = (type = 'light') => haptic(type);

// ── 🗂️ 徽章排序：由左至右照「重訓種類」固定順序排列 —
//    臥推全系列 → 深蹲全系列 → 硬舉 → 槓鈴划船 → 其他動作 → 非動作類徽章。
//    同種類內照門檻升冪（40kg → 60kg → 90kg），一眼一條成長線。
const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };
const KIND_ORDER = [
    '臥推', '深蹲', '硬舉', '槓鈴划船', '划船', '引體', '肩推', '硬拉',   // 重訓動作
    '累積', '單次', '配速', '連續', '里程',                                 // 有氧/打卡常見字首
];
const badgeKind = (a) => String(a?.name || '')
    .replace(/[\d,.\s公斤公里公尺kgKMkm次天週月年%．·–-]+/g, '')
    .trim();
const kindRank = (a) => {
    const n = String(a?.name || '');
    const i = KIND_ORDER.findIndex((k) => n.includes(k));
    return i === -1 ? KIND_ORDER.length : i;
};
const sortBadgesByKind = (list) => [...list].sort((a, b) =>
    (kindRank(a) - kindRank(b))                                             // 1. 種類固定順序
    || badgeKind(a).localeCompare(badgeKind(b), 'zh-Hant')                  // 2. 清單外種類仍聚在一起
    || ((parseFloat(a.target) || 0) - (parseFloat(b.target) || 0))          // 3. 同種類門檻升冪
    || ((TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9))              // 4. 最後才比階級
);

// ── ✨ 已解鎖徽章的「呼吸微光」參數 — 階級越高越亮、範圍越大、節奏越沉穩
const TIER_BREATH = {
    bronze: { peak: 0.30, spread: 8, dur: 4.4 },
    silver: { peak: 0.42, spread: 10, dur: 4.0 },
    gold: { peak: 0.58, spread: 13, dur: 3.5 },
    platinum: { peak: 0.72, spread: 16, dur: 3.0 },
    diamond: { peak: 0.85, spread: 18, dur: 2.6 },
};
// 呼吸光暈（放在徽章圖後面）：tier.border 為光色，opacity 由 keyframe 脈動
const BadgeBreathAura = ({ tier, tierKey }) => {
    const b = TIER_BREATH[tierKey] || TIER_BREATH.bronze;
    return (
        <span aria-hidden style={{
            position: 'absolute', inset: -b.spread, borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
            background: `radial-gradient(circle, ${tier.border} 0%, transparent 62%)`,
            filter: 'blur(7px)',
            animation: `drvnBadgeBreath ${b.dur}s ease-in-out infinite`,
            '--breath-peak': b.peak,
        }} />
    );
};
const BADGE_BREATH_KEYFRAMES = `
@keyframes drvnBadgeBreath {
    0%, 100% { opacity: calc(var(--breath-peak, 0.4) * 0.3); transform: scale(0.94); }
    50%      { opacity: var(--breath-peak, 0.4); transform: scale(1.05); }
}`;

// ─── DRVN 統一色系 (Light Theme) ───
const C = {
    bg: '#F6F4F1',         // Paper
    paper: '#FFFFFF',      // 卡片底色
    stone: '#E4DED2',      // Stone
    pebble: '#CFC6B8',     // Pebble
    coral: '#F95C4B',      // Coral
    textPrimary: '#161415',// Deep Black
    textMuted: '#8A7E73',  // 溫和次要文字
};

// ── Shelf Styling Constants ─────────────────────────────────────
const CATEGORY_SHELF_COLORS = {
    // 使用 Pebble (暖灰) 作為重訓的沉穩基調
    strength: { bar: '#CFC6B8', nameEn: 'Strength', glass: 'rgba(207,198,184,0.06)', glow: 'rgba(207,198,184,0.15)', border: 'rgba(207,198,184,0.15)', style: 'metal' },
    // 使用 Stone (淺暖灰) 作為有氧的輕盈感
    cardio: { bar: '#E4DED2', nameEn: 'Cardio', glass: 'rgba(228,222,210,0.06)', glow: 'rgba(228,222,210,0.15)', border: 'rgba(228,222,210,0.15)', style: 'crystal' },
    // 使用 Paper (紙白) 作為營養的純淨感
    nutrition: { bar: '#F6F4F1', nameEn: 'Nutrition', glass: 'rgba(246,244,241,0.04)', glow: 'rgba(246,244,241,0.1)', border: 'rgba(246,244,241,0.12)', style: 'glass' },
    // 使用 Stone 作為社群互動的輕快質感
    community: { bar: '#E4DED2', nameEn: 'Community', glass: 'rgba(228,222,210,0.06)', glow: 'rgba(228,222,210,0.15)', border: 'rgba(228,222,210,0.15)', style: 'crystal' },
    // 使用 Coral (珊瑚紅) 作為親密度的溫暖度
    intimacy: { bar: '#F95C4B', nameEn: 'Intimacy', glass: 'rgba(249,92,75,0.04)', glow: 'rgba(249,92,75,0.15)', border: 'rgba(249,92,75,0.15)', style: 'neon' },
    // 使用 Clay 陶瓷質感作為社團專屬底座
    squad: { bar: '#D4A843', nameEn: 'Squad', glass: 'rgba(212,168,67,0.06)', glow: 'rgba(212,168,67,0.15)', border: 'rgba(212,168,67,0.15)', style: 'clay' },
    // 常駐挑戰：Coral 焦點
    permanent: { bar: '#F95C4B', nameEn: 'Permanent', glass: 'rgba(249,92,75,0.06)', glow: 'rgba(249,92,75,0.18)', border: 'rgba(249,92,75,0.18)', style: 'neon' },
    // 季度限定：秋金
    quarterly: { bar: '#C68E5D', nameEn: 'Quarterly', glass: 'rgba(198,142,93,0.06)', glow: 'rgba(198,142,93,0.16)', border: 'rgba(198,142,93,0.16)', style: 'clay' },
};


/* ═══ 徽章全覽 —— 一個分類一次看完 ══════════════════════════════════
 * 為什麼要這個：總覽頁每一類都是一條橫向捲軸，16 個徽章要滑 5 次才看得完，
 * 而且滑到一半根本不知道還剩幾個。這裡把同一類攤成一排三個的方格，
 * 一屏看得到九個，上面的小分頁可以直接跳到別類，不用退回去再滑。
 *
 * 總覽頁不取代 —— 那頁是「架上擺什麼」的氣氛，這頁是「我到底收集到哪了」。
 */
const BadgeGridSheet = ({ open, categoryId, achievements, onPickCategory, onSelect, onClose }) => {
    if (!open) return null;
    const cats = ACHIEVEMENT_CATEGORIES.filter((c) => c.id !== 'all')
        .map((c) => ({ ...c, list: sortBadgesByKind(achievements.filter((a) => inCategory(a, c.id))) }))
        .filter((c) => c.list.length > 0);
    const active = cats.find((c) => c.id === categoryId) || cats[0];
    if (!active) return null;
    const got = active.list.filter((a) => a.unlocked).length;

    return createPortal(
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 flex flex-col"
                style={{ zIndex: 100090, background: C.bg }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
            >
                {/* 標題列 */}
                <div className="flex items-start justify-between gap-3 px-5"
                    style={{ paddingTop: 'max(20px, calc(env(safe-area-inset-top, 44px) + 12px))', paddingBottom: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <p className="m-0 text-[11px] font-black uppercase" style={{ letterSpacing: '0.24em', color: 'rgba(22,20,21,0.4)' }}>
                            {active.label}
                        </p>
                        <p className="m-0 mt-1" style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                            {got}<span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(22,20,21,0.45)' }}> / {active.list.length}</span>
                        </p>
                    </div>
                    <motion.button {...pressProps('icon')} onClick={onClose} aria-label="關閉"
                        style={{ flexShrink: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={20} strokeWidth={2.2} color={C.textPrimary} />
                    </motion.button>
                </div>

                {/* 小分頁：換一類不用退回去 */}
                <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 12px' }}>
                    {cats.map((c) => {
                        const on = c.id === active.id;
                        return (
                            <motion.button {...pressProps('pill')} key={c.id}
                                onClick={() => { triggerHaptic('light'); onPickCategory(c.id); }}
                                style={{
                                    flexShrink: 0, padding: '9px 14px', minHeight: 44, borderRadius: 999, cursor: 'pointer',
                                    background: on ? C.textPrimary : 'rgba(22,20,21,0.05)',
                                    border: `1px solid ${on ? C.textPrimary : 'rgba(22,20,21,0.08)'}`,
                                    color: on ? C.bg : 'rgba(22,20,21,0.55)',
                                    fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                                }}>
                                {c.label}
                            </motion.button>
                        );
                    })}
                </div>

                {/* 一排三個 */}
                <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12,
                        paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 28px)' }}>
                        {active.list.map((ach) => {
                            const isUnlocked = ach.unlocked;
                            const tier = TIER_META[ach.tier] || TIER_META.bronze;
                            return (
                                <motion.button key={ach.id} whileTap={{ scale: 0.94 }}
                                    onClick={() => { triggerHaptic('light'); onSelect(ach); }}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                        padding: '12px 6px 10px', borderRadius: 18, cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(22,20,21,0.06)',
                                    }}>
                                    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
                                        {isUnlocked && <BadgeBreathAura tier={tier} tierKey={ach.tier} />}
                                        {(is3DBadge(ach.id) || ach.image) ? (
                                            <img decoding="async" loading="lazy" src={badgeImage(ach)} alt={ach.name}
                                                className="w-full h-full object-contain"
                                                style={{ position: 'relative', zIndex: 1, filter: isUnlocked ? 'drop-shadow(0 5px 10px rgba(0,0,0,0.24))' : 'grayscale(1) opacity(0.35)' }} />
                                        ) : (
                                            <span style={{ fontSize: 30, position: 'relative', zIndex: 1, filter: isUnlocked ? 'none' : 'grayscale(1) opacity(0.35)' }}>{ach.emoji}</span>
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', width: '100%',
                                        color: isUnlocked ? C.textPrimary : 'rgba(22,20,21,0.4)',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                    }}>{ach.name}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

const BOOK_H = 116;
const SHELF_FROM_BOTTOM = 8;

// AmbientLights removed, handled by parent SocialHubMobile

export default function GrowthAchievementSystem({ userId, profileMode = false, hideHeader = false }) {
    const [activeCategory, setActiveCategory] = useState('all');
    const [achievementsData, setAchievementsData] = useState(null);
    const [selectedAch, setSelectedAch] = useState(null);
    const [xpData, setXpData] = useState(null);
    const [previewReward, setPreviewReward] = useState(null); // 獲取動畫預覽
    // 打開哪一類的全覽（一排三個）；null = 沒打開
    const [gridCat, setGridCat] = useState(null);

    useEffect(() => {
        // 先用本機資料立即渲染（快），再等後端真實紀錄回來刷新（準）
        const result = checkAllAchievements(userId);
        setAchievementsData(result);
        setXpData(getUserXPAndTitle(userId));
        let alive = true;
        // 自己的徽章同步一份到後端：別人點開你的個人資料預覽時才看得到
        const isMe = userId && userId === getUserId();
        if (isMe) syncShowcaseBadges(userId, toShowcase(result?.achievements));
        fetchBackendAchievementData(userId).then((ov) => {
            if (!alive || !ov || Object.keys(ov).length === 0) return;
            const fresh = checkAllAchievements(userId, ov);
            setAchievementsData(fresh);
            setXpData(getUserXPAndTitle(userId));
            if (isMe) syncShowcaseBadges(userId, toShowcase(fresh?.achievements));
        }).catch(() => { /* 後端不可用 → 維持本機版 */ });
        return () => { alive = false; };
    }, [userId]);

    // ── [NEW] Scroll Haptic Logic ────────────────────────────────────────
    const lastScrollPos = React.useRef({});
    const handleScrollHaptic = (catId, e) => {
        const currentPos = e.target.scrollLeft;
        const lastPos = lastScrollPos.current[catId] || 0;
        
        // Trigger haptic every ~70px of scroll (roughly one badge width + gap)
        if (Math.abs(currentPos - lastPos) > 70) {
            triggerHaptic('light');
            lastScrollPos.current[catId] = currentPos;
        }
    };

    if (!achievementsData || !xpData) return null;

    const { totalXP, currentLevel, nextLevel, levelProgress, xpInCurrentLevel, xpNeededForNext } = xpData;

    // 解析稱號名稱，嘗試分離出主稱號與修飾詞
    const titleParts = currentLevel.title.match(/([\u4e00-\u9fa5]+)([\u4e00-\u9fa5]{2,})/);
    const titleFirstPart = titleParts ? titleParts[1] : 'Fitness';
    const titleSecondPart = titleParts ? titleParts[2] : currentLevel.title;

    if (profileMode) {
        const unlockedAch = achievementsData.achievements.filter(a => a.unlocked);
        return (
            <div className="px-2 pt-4">
                <style>{BADGE_BREATH_KEYFRAMES}</style>
                <div className="flex flex-col gap-4">
                    {/* Bold Swiss Editorial Header - Restoration */}
                    {!hideHeader && (
                        <div className="px-4 mb-8 pt-6 relative">
                            {/* Heavy Top Bar */}
                            <div className="w-full h-[3px] mb-4" style={{ background: C.textPrimary }} />

                            {/* ⚠️ 這裡原本有四行英文小標（DRVN / Achievement / Level / System）——
                                四行都沒有告訴使用者任何事，只是把版面墊高、把重點稀釋掉。
                                標籤不是資訊（drvn-interface-standard §4、§5）。 */}

                            <div className="relative">
                                {/* Watermark XP */}
                                <div className="absolute -top-10 -right-2 text-[100px] font-black tracking-tighter leading-none opacity-5 pointer-events-none select-none" style={{ color: C.textPrimary }}>
                                    {totalXP}
                                </div>

                                <div className="relative z-10 flex items-end justify-between">
                                    <div className="border-l-4 pl-4" style={{ borderColor: C.textPrimary }}>
                                        <span className="text-[11px] tracking-[0.18em] font-black block opacity-45 mb-1" style={{ color: C.textPrimary }}>
                                            目前等級
                                        </span>
                                        {/* 次階層：頁面主軸為上方「Running Pulse」標題，此處 rank 降一級避免兩個重點等距 */}
                                        <h2 className="text-[30px] font-semibold leading-[0.95] tracking-tight" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.textPrimary }}>
                                            {currentLevel.title}
                                        </h2>
                                    </div>
                                    <div className="text-right">
                                        {/* 單位跟著數字走，不另外開一行小標 */}
                                        <span className="text-[36px] font-black tracking-tighter leading-none" style={{ color: C.textPrimary }}>{totalXP}</span>
                                        <span className="text-[12px] font-black ml-1 opacity-45" style={{ color: C.textPrimary }}>XP</span>
                                    </div>
                                </div>
                            </div>

                            {/* Divider line */}
                            <div className="w-full h-[1px] bg-black/10 mt-10" />
                        </div>
                    )}

                </div>

                {/* 獲取徽章預覽按鈕：點了播放一次示範獲取動畫 */}
                <div className="px-4 mb-4">
                    <motion.button {...pressProps('pill')}
 onClick={() => setPreviewReward({
 id: 'pc_100kg_club',
 name: '百公斤俱樂部',
 emoji: '🎯',
 image: '/images/badges/3d/pc_100kg_club.png',
 tier: 'gold',
 kind: 'badge',
 unlockText: '這是獲取動畫預覽 — 實際達成時會自動播放',
 })}
 className="w-full py-2.5 rounded-[12px] flex items-center justify-center gap-2"
 style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}
 >
                        <Eye size={13} style={{ color: C.textPrimary }} />
                        <span className="text-[11px] font-black tracking-wider uppercase" style={{ color: C.textPrimary }}>獲取徽章預覽</span>
                    </motion.button>
                </div>

                {/* 獲取動畫預覽掛載點 */}
                <RewardUnlockAnimation reward={previewReward} onClose={() => setPreviewReward(null)} />

                {/* 分類全覽（一排三個）*/}
                <BadgeGridSheet
                    open={!!gridCat}
                    categoryId={gridCat}
                    achievements={achievementsData.achievements}
                    onPickCategory={setGridCat}
                    onSelect={(a) => { setGridCat(null); setSelectedAch(a); }}
                    onClose={() => setGridCat(null)}
                />

                {/* Original Achievement Showroom (Shelves) - Restoration */}
                <div className="mt-4 pb-12">
                    {ACHIEVEMENT_CATEGORIES.filter(c => c.id !== 'all').map(cat => {
                        const catAch = sortBadgesByKind(achievementsData.achievements.filter(a => inCategory(a, cat.id)));
                        if (catAch.length === 0) return null;
                        const sc = CATEGORY_SHELF_COLORS[cat.id] || CATEGORY_SHELF_COLORS.special;

                        return (
                            <div key={cat.id} className="mb-8 px-2">
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {/* 中文名旁邊原本還印一次英文代碼（重訓 STRENGTH）——
                                            同一個資訊在同一畫面只能出現一次。 */}
                                        <span className="text-[16px] font-bold tracking-tight" style={{ color: C.textPrimary }}>{cat.label}</span>
                                    </div>
                                    {/* 「⋯」＝ 攤開這一類的全部徽章（一排三個）。
                                        架上是橫向捲軸，16 個要滑 5 次才看得完，滑到一半還不知道剩幾個。 */}
                                    <motion.button {...pressProps('icon')}
                                        onClick={() => { triggerHaptic('light'); setGridCat(cat.id); }}
                                        aria-label={`看完整的${cat.label}徽章`}
                                        className="flex items-center gap-2 shrink-0"
                                        style={{ minHeight: 44, paddingLeft: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
                                        <span className="text-[11px] font-bold tabular-nums" style={{ color: C.textMuted }}>
                                            {catAch.filter(a => a.unlocked).length} / {catAch.length}
                                        </span>
                                        <MoreHorizontal size={18} strokeWidth={2.2} style={{ color: 'rgba(22,20,21,0.45)' }} />
                                    </motion.button>
                                </div>

                                {/* Shelf Container */}
                                <div style={{ position: 'relative', height: BOOK_H + SHELF_FROM_BOTTOM + 8, background: 'transparent' }}>
                                    {/* Glass Tier */}
                                    <div style={{
                                        position: 'absolute', left: 0, right: 0, bottom: SHELF_FROM_BOTTOM, height: BOOK_H * 0.35,
                                        background: 'rgba(160, 160, 160, 0.15)', border: `1px solid rgba(160, 160, 160, 0.3)`, borderRadius: 8,
                                        boxShadow: `0 4px 20px rgba(160, 160, 160, 0.1), inset 0 1px 2px rgba(255,255,255,0.4)`, zIndex: 5,
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px',
                                        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)'
                                    }}>
                                        <div className="w-4 h-4 rounded-full bg-black/10" />
                                        <div className="w-4 h-4 rounded-full bg-black/10" />
                                    </div>

                                    {/* Wood grain base stand */}
                                    <div style={{
                                        position: 'absolute', left: 0, right: 0, bottom: 0, height: SHELF_FROM_BOTTOM + 6,
                                        background: 'repeating-linear-gradient(165deg, #8E5A3C 0px, #8E5A3C 4px, #7A4A2F 4px, #7A4A2F 8px, #683C24 8px, #683C24 10px, #8E5A3C 10px, #8E5A3C 14px)',
                                        borderRadius: '0 0 10px 10px', boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
                                    }} />

                                    {/* Horizontal Scrollable Icons */}
                                    <div 
                                        className="no-scrollbar flex items-end gap-6 overflow-x-auto px-4 pb-4" 
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6 }}
                                        onScroll={(e) => handleScrollHaptic(cat.id, e)}
                                    >
                                        {catAch.map(ach => {
                                            const isUnlocked = ach.unlocked;
                                            const tier = TIER_META[ach.tier] || TIER_META.bronze;
                                            return (
                                                <motion.button
                                                    key={ach.id}
                                                    onClick={() => setSelectedAch(ach)}
                                                    whileTap={{ scale: 0.9 }}
                                                    className="flex-shrink-0 flex flex-col items-center gap-1 mb-2"
                                                >
                                                    {(is3DBadge(ach.id) || ach.image) ? (
                                                        /* 有徽章插畫：不套白底方塊，圖直接放大擺上架 */
                                                        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                                                            {/* ✨ 已解鎖：階級呼吸微光 — 越高階越亮、範圍越大、節奏越沉穩 */}
                                                            {isUnlocked && <BadgeBreathAura tier={tier} tierKey={ach.tier} />}
                                                            <img decoding="async" src={badgeImage(ach)} alt={ach.name} className="w-full h-full object-contain"
                                                                style={{ position: 'relative', zIndex: 1, filter: isUnlocked ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.28))' : 'grayscale(1) opacity(0.4)' }} />
                                                            {/* 已解鎖只留粒子呼吸微光(BadgeBreathAura)，不再加右上角小圖示 */}
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className={`w-14 h-14 rounded-[18px] flex items-center justify-center relative shadow-sm transition-all ${!isUnlocked ? 'grayscale opacity-30' : ''}`}
                                                            style={{
                                                                background: isUnlocked ? tier.bg : C.stone,
                                                                border: `1.5px solid ${isUnlocked ? tier.border : 'rgba(0,0,0,0.05)'}`,
                                                                boxShadow: isUnlocked ? `0 8px 20px ${tier.glow}25` : 'none'
                                                            }}
                                                        >
                                                            <span className="text-2xl">{ach.emoji}</span>
                                                        </div>
                                                    )}
                                                    <span className="text-[11px] font-black tracking-tight truncate w-14 text-center" style={{ color: C.textPrimary }}>{ach.name}</span>
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Detail Modal Portal (Same as below) */}
                {createPortal(
                    <AnimatePresence>
                        {selectedAch && (
                            <motion.div
                                className="fixed inset-0 flex items-center justify-center px-6 py-10"
                                style={{ zIndex: 100100 }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedAch(null)}
                            >
                                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

                                <motion.div
                                    className="relative w-full max-w-[330px] rounded-[28px] overflow-hidden"
                                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                                    animate={{ scale: 1, y: 0, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0, y: 10 }}
                                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        backgroundColor: '#141211',
                                    backgroundImage: `linear-gradient(155deg, rgba(20,17,16,0.62) 0%, rgba(10,9,9,0.80) 55%, rgba(6,6,6,0.88) 100%), url('/desktop/22.jpeg')`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                        border: '1px solid rgba(249,92,75,0.24)',
                                        boxShadow: '0 0 0 1px rgba(249,92,75,0.12), 0 0 55px rgba(249,92,75,0.30), 0 24px 70px rgba(0,0,0,0.72)',
                                    }}
                                >
                                    {/* tier 氛圍光暈 */}
                                    <div className="absolute inset-x-0 top-0 h-56 opacity-40 pointer-events-none z-0"
                                        style={{ background: `radial-gradient(80% 60% at 50% 30%, ${TIER_META[selectedAch.tier]?.glow || 'transparent'}, transparent 70%)` }} />

                                    <div className="relative z-10 px-7 pt-14 pb-8">
                                        <motion.button {...pressProps('icon')} onClick={() => setSelectedAch(null)}
 className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/16 transition z-20">
                                            <X size={15} className="text-[#9A938A]" />
                                        </motion.button>

                                        <div className="flex flex-col items-center text-center">
                                            {/* 徽章：大主體（約視窗 65%） */}
                                            <div className="relative mb-6 flex items-center justify-center" style={{ width: '75%', aspectRatio: '1 / 1' }}>
                                                {is3DBadge(selectedAch.id) ? <CrystalBadge3D badgeId={selectedAch.id} image={badgeImage(selectedAch)} name={selectedAch.name} unlocked={selectedAch.unlocked} /> : selectedAch.image ? (
                                                    <img decoding="async" src={selectedAch.image} alt={selectedAch.name} className="w-full h-full object-contain"
                                                        style={{ filter: selectedAch.unlocked ? `drop-shadow(0 16px 40px ${TIER_META[selectedAch.tier]?.glow || 'rgba(0,0,0,0.5)'}) drop-shadow(0 6px 16px rgba(0,0,0,0.4))` : 'grayscale(1) opacity(0.32)' }} />
                                                ) : (
                                                    <div
                                                        className="w-full h-full rounded-[32px] bg-[#1A1817] flex items-center justify-center"
                                                        style={{ border: `1.5px solid ${TIER_META[selectedAch.tier]?.border}40` }}
                                                    >
                                                        <span style={{ fontSize: '34%', lineHeight: 1 }}>
                                                            {selectedAch.emoji}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 名稱 */}
                                            <h3 className="text-[#F2EFE9] text-[26px] font-light mb-2 leading-tight tracking-tight">{selectedAch.name}</h3>

                                            {/* 經驗值：小字、不用框 */}
                                            <p className="text-[11px] font-normal tracking-[0.22em] uppercase mb-4"
                                                style={{ color: TIER_META[selectedAch.tier]?.text || '#9A938A' }}>
                                                {TIER_META[selectedAch.tier]?.label} · +{TIER_XP[selectedAch.tier]} XP
                                            </p>

                                            {/* 達成條件：去框、細體、上下 hairline */}
                                            {selectedAch.condition && (
                                                <div className="w-full py-3.5 mb-5 border-t border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                                    <p className="text-[11px] font-normal tracking-[0.04em] uppercase mb-1.5" style={{ color: 'rgba(249,92,75,0.85)' }}>達成條件</p>
                                                    <p className="text-[13px] font-light leading-snug" style={{ color: '#D8D2C8' }}>{selectedAch.condition}</p>
                                                </div>
                                            )}

                                            {/* 極簡進度：一條細線 + 百分比 */}
                                            <div className="w-full">
                                                <div className="flex justify-between mb-2 items-baseline">
                                                    <span className="text-[11px] font-normal tracking-[0.20em] uppercase text-[#8C857B]">
                                                        {selectedAch.unlocked ? '已解鎖' : '達成進度'}
                                                    </span>
                                                    <span className="text-[13px] font-light" style={{ color: selectedAch.unlocked ? (TIER_META[selectedAch.tier]?.text || '#F2EFE9') : '#C9C2B8', fontVariantNumeric: 'tabular-nums' }}>
                                                        {Math.round(selectedAch.progressPct || 0)}%
                                                    </span>
                                                </div>
                                                <div className="h-[3px] rounded-full bg-white/8 overflow-hidden">
                                                    <motion.div className="h-full rounded-full"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${selectedAch.progressPct || 0}%` }}
                                                        transition={{ duration: 0.9, ease: 'easeOut' }}
                                                        style={{ background: selectedAch.unlocked ? (TIER_META[selectedAch.tier]?.border || '#F95C4B') : 'rgba(249,92,75,0.55)' }} />
                                                </div>
                                                {!selectedAch.unlocked && selectedAch.target != null && (
                                                    <div className="mt-2 text-[11px] font-light text-[#8C857B] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {Math.round(selectedAch.current ?? (selectedAch.progressPct / 100) * selectedAch.target).toLocaleString()}
                                                        {' / '}{selectedAch.target.toLocaleString()}{selectedAch.unit ? ` ${selectedAch.unit}` : ''}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-transparent font-sans pb-4 relative" style={{ color: C.textPrimary }}>
            <style>{BADGE_BREATH_KEYFRAMES}</style>

            {/* ─── 大膽瑞士極簡 (Bold Swiss Typography) ─── */}
            <div className="pt-16 px-6 relative z-10 pb-4">
                {/* 頂部強勢黑線 */}
                <div className="w-full h-[4px] mb-4" style={{ background: C.textPrimary }} />

                {/* 同上：四行只有裝飾功能的英文小標，一併拿掉（§4.1） */}

                <div className="relative">
                    {/* 背景大字XP浮水印 */}
                    <div className="absolute -top-12 -right-4 text-[130px] font-black tracking-tighter leading-none opacity-5 pointer-events-none select-none" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.textPrimary }}>
                        {totalXP}
                    </div>

                    <div className="flex flex-col items-start relative z-10">
                        {/* 黑色倒白標籤 */}
                        <div className="inline-block px-3 py-1.5 mb-3" style={{ background: C.textPrimary }}>
                            <span className="text-[11px] tracking-[0.14em] font-bold block" style={{ color: C.paper, lineHeight: 1 }}>
                                目前等級
                            </span>
                        </div>

                        {/* 巨大的稱號 */}
                        <h1 className="text-[48px] md:text-[64px] font-black tracking-tighter leading-[0.9] mt-1 mb-2" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.textPrimary }}>
                            {currentLevel.title}
                        </h1>

                        {/* 裝飾橫線與數據 */}
                        <div className="flex items-center gap-4 w-full mt-4">
                            <span className="text-[32px]">{currentLevel.emoji}</span>
                            <div className="flex-1 h-[3px]" style={{ background: currentLevel.color || C.coral }} />
                            <div className="text-right">
                                <span className="text-[28px] font-black tracking-tighter leading-none" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.textPrimary }}>{totalXP}</span>
                                <span className="text-[11px] font-black ml-1 opacity-45" style={{ color: C.textPrimary }}>XP</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 分隔底線 */}
                <div className="w-full h-[1px] mt-10" style={{ background: C.pebble }} />
            </div>

            {/* ─── 極簡導覽列 ─── */}
            <div className="px-6 mb-8 overflow-x-auto no-scrollbar">
                <div className="flex gap-8 border-b pb-4 min-w-max" style={{ borderColor: C.pebble }}>
                    {ACHIEVEMENT_CATEGORIES.map((cat) => (
                        <motion.button {...pressProps('row')}
 key={cat.id}
 onClick={() => setActiveCategory(cat.id)}
 className="relative flex items-center gap-2 pb-4 -mb-4 transition-colors"
 style={{ color: activeCategory === cat.id ? C.textPrimary : C.textMuted }}
 >
                            <span className="text-[14px]">{cat.emoji}</span>
                            <span className="text-[11px] font-bold tracking-widest uppercase">{cat.id}</span>
                            {activeCategory === cat.id && (
                                <motion.div
                                    layoutId="activeCategory"
                                    className="absolute bottom-0 left-0 w-full h-[3px]"
                                    style={{ background: C.textPrimary }}
                                />
                            )}
                        </motion.button>
                    ))}
                </div>
            </div>


            {/* ─── 原本的書架排版 ─── */}
            <div className="px-2">
                <div className="space-y-4">
                    {ACHIEVEMENT_CATEGORIES.filter(c => c.id !== 'all').map(cat => {
                        if (activeCategory !== 'all' && activeCategory !== cat.id) return null;
                        const catAch = sortBadgesByKind(achievementsData.achievements.filter(a => inCategory(a, cat.id)));
                        if (catAch.length === 0) return null;
                        const sc = CATEGORY_SHELF_COLORS[cat.id] || CATEGORY_SHELF_COLORS.special;

                        return (
                            <div key={cat.id} className="mb-8 px-4">
                                {/* 分區標題 */}
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[18px] font-bold tracking-widest" style={{ color: C.textPrimary }}>{cat.label}</span>
                                        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: C.textMuted }}>{cat.id}</span>
                                    </div>
                                    <span className="text-[12px] font-serif italic" style={{ color: C.textMuted }}>
                                        {catAch.filter(a => a.unlocked).length} / {catAch.length}
                                    </span>
                                </div>

                                {/* 書架容器 */}
                                <div style={{ position: 'relative', height: BOOK_H + SHELF_FROM_BOTTOM + 8, background: 'transparent' }}>
                                    {/* 玻璃層架 (Grey Tinted Glass) */}
                                    <div style={{
                                        position: 'absolute', left: 0, right: 0, bottom: SHELF_FROM_BOTTOM, height: BOOK_H * 0.35,
                                        background: 'rgba(160, 160, 160, 0.15)', border: `1px solid rgba(160, 160, 160, 0.3)`, borderRadius: 8,
                                        boxShadow: `0 4px 20px rgba(160, 160, 160, 0.2), inset 0 1px 2px rgba(255,255,255,0.4)`, zIndex: 5,
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px',
                                        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)'
                                    }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, background: 'linear-gradient(to right, transparent, rgba(160, 160, 160, 0.5), transparent)' }} />
                                        <svg width="18" height="18" viewBox="0 0 20 20">
                                            <circle cx="10" cy="10" r="7" fill={`rgba(160, 160, 160, 0.6)`} />
                                            <g transform="rotate(45 10 10)"><rect x="7.5" y="9.2" width="5" height="1.6" rx="0.5" fill="rgba(255,255,255,0.5)" /><rect x="9.2" y="7.5" width="1.6" height="5" rx="0.5" fill="rgba(255,255,255,0.5)" /></g>
                                        </svg>
                                        <svg width="18" height="18" viewBox="0 0 20 20">
                                            <circle cx="10" cy="10" r="7" fill={`rgba(160, 160, 160, 0.6)`} />
                                            <g transform="rotate(45 10 10)"><rect x="7.5" y="9.2" width="5" height="1.6" rx="0.5" fill="rgba(255,255,255,0.5)" /><rect x="9.2" y="7.5" width="1.6" height="5" rx="0.5" fill="rgba(255,255,255,0.5)" /></g>
                                        </svg>
                                    </div>

                                    {/* 底部暗格 (實木胡桃木紋飾板材質) */}
                                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: SHELF_FROM_BOTTOM + 4, background: 'repeating-linear-gradient(165deg, #8E5A3C 0px, #8E5A3C 4px, #7A4A2F 4px, #7A4A2F 8px, #683C24 8px, #683C24 10px, #8E5A3C 10px, #8E5A3C 14px)', borderRadius: '0 0 10px 10px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }} />

                                    {/* 滑動書籍/徽章 */}
                                    <div 
                                        className="no-scrollbar" 
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', gap: 8, overflowX: 'auto', padding: '0 12px 12px', zIndex: 2 }}
                                        onScroll={(e) => handleScrollHaptic(cat.id, e)}
                                    >
                                        {catAch.map(ach => {
                                            const tier = TIER_META[ach.tier] || TIER_META.bronze;
                                            const isUnlocked = ach.unlocked;
                                            const isMetal = sc.style === 'metal';
                                            const isCrystal = sc.style === 'crystal';
                                            const isNeon = sc.style === 'neon';
                                            const isClay = sc.style === 'clay';

                                            return (
                                                <motion.button key={ach.id} onClick={() => setSelectedAch(ach)} whileTap={{ scale: 0.94 }} className="flex-shrink-0 transition-all" style={{ width: 100 }}>
                                                    {(is3DBadge(ach.id) || ach.image) ? (
                                                        /* 有徽章插畫：不套框，徽章圖直接放大擺在架上，下方小字＋小進度條 */
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                                            <div style={{ position: 'relative', width: 96, height: 96 }}>
                                                                {/* ✨ 已解鎖：階級呼吸微光 */}
                                                                {isUnlocked && <BadgeBreathAura tier={tier} tierKey={ach.tier} />}
                                                                <img
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    src={badgeImage(ach)}
                                                                    alt={ach.name}
                                                                    style={{ position: 'relative', zIndex: 1, width: 96, height: 96, objectFit: 'contain', filter: isUnlocked ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.30))' : 'grayscale(1) opacity(0.4)' }}
                                                                />
                                                            </div>
                                                            <p style={{ fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: 1.15, color: isUnlocked ? C.textPrimary : C.textMuted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 82 }}>
                                                                {ach.name}
                                                            </p>
                                                            {!isUnlocked && ach.progressPct > 0 && (
                                                                <div style={{ width: 54, height: 3, background: 'rgba(0,0,0,0.10)', borderRadius: 2, overflow: 'hidden' }}>
                                                                    <div style={{ width: `${ach.progressPct}%`, height: '100%', background: tier.border }} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                    <div style={{
                                                        width: 64, height: BOOK_H, borderRadius: 12, position: 'relative', overflow: 'hidden',
                                                        background: !isUnlocked ? C.stone : (
                                                            isMetal ? `linear-gradient(160deg, ${C.paper}, ${C.stone}, ${C.pebble})` :
                                                                isCrystal ? `linear-gradient(145deg, rgba(255,255,255,0.95), ${tier.border}18, rgba(255,255,255,0.85))` :
                                                                    isNeon ? `linear-gradient(160deg, ${C.textPrimary}, ${tier.border}35, #000000)` :
                                                                        isClay ? `linear-gradient(145deg, #FAF7F2 0%, ${tier.border}35 60%, ${tier.border}75 100%)` :
                                                                            `linear-gradient(160deg, ${C.textPrimary}, ${C.textPrimary}, ${C.textPrimary})`
                                                        ),
                                                        border: isUnlocked ? (isMetal ? `1px solid ${C.pebble}` : isClay ? `1px solid rgba(255,255,255,0.45)` : `1.5px solid ${tier.border}60`) : `1px solid rgba(0,0,0,0.05)`,
                                                        opacity: isUnlocked ? 1 : 0.7
                                                    }}>
                                                        {(() => {
                                                            let bgSrc = null;
                                                            switch (ach.category) {
                                                                case 'strength': bgSrc = '/download/-2.jpg'; break;
                                                                case 'cardio': bgSrc = '/download/-5.jpg'; break;
                                                                case 'nutrition': bgSrc = '/download/.jpg'; break;
                                                                case 'habit': bgSrc = '/download/Wallpaper_by_kosh.jpg'; break;
                                                                case 'streak': bgSrc = '/download/-3.jpg'; break;
                                                                case 'special': bgSrc = '/download/-6.jpg'; break;
                                                                case 'photo': bgSrc = '/download/eba85170d3a00744f521003a43bfe600.jpg'; break;
                                                                case 'squad': bgSrc = '/download/-6.jpg'; break;
                                                            }
                                                            if (!bgSrc) return null;
                                                            return (
                                                                <div className="absolute inset-0 pointer-events-none z-0">
                                                                    <img loading="lazy" decoding="async" src={bgSrc} alt="" className={`w-full h-full object-cover transition-all ${!isUnlocked ? 'grayscale opacity-30 blur-[1px]' : 'opacity-60'}`} />
                                                                    <div className={`absolute inset-0 ${!isUnlocked ? 'bg-white/40' : 'bg-white/20'}`} />
                                                                </div>
                                                            );
                                                        })()}
                                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 16 }}>
                                                            <span style={{ fontSize: 28, filter: isUnlocked ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'grayscale(1) opacity(0.3)' }}>{ach.emoji}</span>
                                                        </div>

                                                        {!isUnlocked && ach.progressPct > 0 && (
                                                            <div style={{ position: 'absolute', top: 6, left: 6, right: 6, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                                                <div style={{ width: `${ach.progressPct}%`, height: '100%', background: C.textPrimary }} />
                                                            </div>
                                                        )}

                                                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 5px 5px', background: isUnlocked ? (isMetal ? 'rgba(0,0,0,0.05)' : `${tier.border}30`) : 'rgba(0,0,0,0.03)' }}>
                                                            <p style={{ fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: 1.2, color: isUnlocked ? (isNeon ? 'white' : C.textPrimary) : C.textMuted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                                {ach.name}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    )}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Detail Modal ── */}
            {createPortal(
                <AnimatePresence>
                    {selectedAch && (
                        <motion.div
                            className="fixed inset-0 flex items-center justify-center px-6 py-10"
                            style={{ zIndex: 100100 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedAch(null)}
                        >
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

                            <motion.div
                                className="relative w-full max-w-[330px] rounded-[28px] overflow-hidden"
                                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                                animate={{ scale: 1, y: 0, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    backgroundColor: '#141211',
                                    backgroundImage: `linear-gradient(155deg, rgba(20,17,16,0.62) 0%, rgba(10,9,9,0.80) 55%, rgba(6,6,6,0.88) 100%), url('/desktop/22.jpeg')`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    border: '1px solid rgba(249,92,75,0.24)',
                                    boxShadow: '0 0 0 1px rgba(249,92,75,0.12), 0 0 55px rgba(249,92,75,0.30), 0 24px 70px rgba(0,0,0,0.72)',
                                }}
                            >
                                {/* tier 氛圍光暈：徽章後方一盞燈 */}
                                <div className="absolute inset-x-0 top-0 h-56 opacity-40 pointer-events-none z-0"
                                    style={{ background: `radial-gradient(80% 60% at 50% 30%, ${TIER_META[selectedAch.tier]?.glow || 'transparent'}, transparent 70%)` }} />

                                <div className="relative z-10 px-7 pt-14 pb-8">
                                    <motion.button {...pressProps('icon')} onClick={() => setSelectedAch(null)}
 className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/16 transition z-20">
                                        <X size={15} className="text-[#9A938A]" />
                                    </motion.button>

                                    <div className="flex flex-col items-center text-center">
                                        {/* 徽章：大主體（約視窗 65%） */}
                                        <div className="relative mb-6 flex items-center justify-center" style={{ width: '75%', aspectRatio: '1 / 1' }}>
                                            {is3DBadge(selectedAch.id) ? <CrystalBadge3D badgeId={selectedAch.id} image={badgeImage(selectedAch)} name={selectedAch.name} unlocked={selectedAch.unlocked} /> : selectedAch.image ? (
                                                <img
                                                    decoding="async"
                                                    src={selectedAch.image}
                                                    alt={selectedAch.name}
                                                    className="w-full h-full object-contain"
                                                    style={{ filter: selectedAch.unlocked ? `drop-shadow(0 16px 40px ${TIER_META[selectedAch.tier]?.glow || 'rgba(0,0,0,0.5)'}) drop-shadow(0 6px 16px rgba(0,0,0,0.4))` : 'grayscale(1) opacity(0.32)' }}
                                                />
                                            ) : (
                                                <motion.div
                                                    className="w-full h-full rounded-[32px] bg-[#1A1817] flex items-center justify-center"
                                                    style={{ border: `1.5px solid ${TIER_META[selectedAch.tier]?.border}40` }}
                                                    animate={selectedAch.unlocked ? { boxShadow: [`0 4px 24px ${TIER_META[selectedAch.tier]?.glow}40`, `0 10px 44px ${TIER_META[selectedAch.tier]?.glow}66`, `0 4px 24px ${TIER_META[selectedAch.tier]?.glow}40`] } : {}}
                                                    transition={{ duration: 2.5, repeat: Infinity }}
                                                >
                                                    <span style={{ fontSize: '34%', lineHeight: 1, filter: selectedAch.unlocked ? 'none' : 'grayscale(1) opacity(0.3)' }}>
                                                        {selectedAch.emoji}
                                                    </span>
                                                </motion.div>
                                            )}
                                        </div>

                                        {/* 名稱 */}
                                        <h3 className="text-[#F2EFE9] text-[26px] font-light mb-2 leading-tight tracking-tight">{selectedAch.name}</h3>

                                        {/* 經驗值：小字、不用框 */}
                                        <p className="text-[11px] font-normal tracking-[0.22em] uppercase mb-4"
                                            style={{ color: TIER_META[selectedAch.tier]?.text || '#9A938A' }}>
                                            {TIER_META[selectedAch.tier]?.label} · +{TIER_XP[selectedAch.tier]} XP
                                        </p>

                                        {/* 達成條件：去框、細體、上下 hairline */}
                                        {selectedAch.condition && (
                                            <div className="w-full py-3.5 mb-5 border-t border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                                <p className="text-[11px] font-normal tracking-[0.04em] uppercase mb-1.5" style={{ color: 'rgba(249,92,75,0.85)' }}>達成條件</p>
                                                <p className="text-[13px] font-light leading-snug" style={{ color: '#D8D2C8' }}>{selectedAch.condition}</p>
                                            </div>
                                        )}

                                        {/* 極簡進度：一條細線 + 百分比，無卡片框 */}
                                        <div className="w-full">
                                            <div className="flex justify-between mb-2 items-baseline">
                                                <span className="text-[11px] font-normal tracking-[0.20em] uppercase text-[#8C857B]">
                                                    {selectedAch.unlocked ? '已解鎖' : '達成進度'}
                                                </span>
                                                <span className="text-[13px] font-light" style={{ color: selectedAch.unlocked ? (TIER_META[selectedAch.tier]?.text || '#F2EFE9') : '#C9C2B8', fontVariantNumeric: 'tabular-nums' }}>
                                                    {Math.round(selectedAch.progressPct || 0)}%
                                                </span>
                                            </div>
                                            <div className="h-[3px] rounded-full bg-white/8 overflow-hidden">
                                                <motion.div className="h-full rounded-full"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${selectedAch.progressPct || 0}%` }}
                                                    transition={{ duration: 0.9, ease: 'easeOut' }}
                                                    style={{ background: selectedAch.unlocked ? (TIER_META[selectedAch.tier]?.border || '#F95C4B') : 'rgba(249,92,75,0.55)' }}
                                                />
                                            </div>
                                            {!selectedAch.unlocked && selectedAch.target != null && (
                                                <div className="mt-2 text-[11px] font-light text-[#8C857B] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    {Math.round(selectedAch.current ?? (selectedAch.progressPct / 100) * selectedAch.target).toLocaleString()}
                                                    {' / '}
                                                    {selectedAch.target.toLocaleString()}
                                                    {selectedAch.unit ? ` ${selectedAch.unit}` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}

// ─── Profile Achievement Mini (極簡版：只顯示 DRVN LAB + 稱號 + XP) ───
export function ProfileAchievementMini({ userId }) {
    const [xpData, setXpData] = useState(null);

    useEffect(() => {
        setXpData(getUserXPAndTitle(userId));
    }, [userId]);

    if (!xpData) return null;
    const { totalXP, currentLevel } = xpData;

    return (
        <div className="w-full px-6 pt-4 pb-6 flex flex-col gap-3">
            {/* DRVN LAB 小標 */}
            <div className="flex items-center gap-2">
                <div>
                    <span className="text-[11px] font-black tracking-[0.35em] uppercase text-white">DRVN LAB</span>
                </div>
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
            </div>

            {/* 稱號 + XP */}
            <div className="flex items-end justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <p className="text-[11px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>目前等級</p>
                        <h2 className="text-[28px] font-black tracking-tighter leading-none text-white"
                            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
                            {currentLevel.title}
                        </h2>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[11px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>總經驗</p>
                    <p className="text-[36px] font-black tracking-tighter leading-none text-white"
                        style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
                        {totalXP}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── Profile Achievement View (Full-Page Dark Version for Profile Tab) ───
// 專為 Profile 頁設計：全白字體、簡化標頭、無高度限制、完整書架展示
export function ProfileAchievementView({ userId }) {
    const [achievementsData, setAchievementsData] = useState(null);
    const [xpData, setXpData] = useState(null);
    const [selectedAch, setSelectedAch] = useState(null);
    const [previewReward, setPreviewReward] = useState(null); // 獲取動畫預覽

    useEffect(() => {
        // 先用本機資料立即渲染（快），再等後端真實紀錄回來刷新（準）
        setAchievementsData(checkAllAchievements(userId));
        setXpData(getUserXPAndTitle(userId));
        let alive = true;
        fetchBackendAchievementData(userId).then((ov) => {
            if (!alive || !ov || Object.keys(ov).length === 0) return;
            setAchievementsData(checkAllAchievements(userId, ov));
            setXpData(getUserXPAndTitle(userId));
        }).catch(() => { /* 後端不可用 → 維持本機版 */ });
        return () => { alive = false; };
    }, [userId]);

    // 徽章列橫向滾動的觸覺回饋（與 GrowthAchievementSystem 內同一套邏輯）
    // ⚠ 之前這裡直接用了 handleScrollHaptic，但它宣告在另一個元件裡 →
    //   一滑動徽章列就 ReferenceError → 整頁掉到 error boundary。
    const lastScrollPos = React.useRef({});
    const handleScrollHaptic = (catId, e) => {
        const currentPos = e.target.scrollLeft;
        const lastPos = lastScrollPos.current[catId] || 0;
        if (Math.abs(currentPos - lastPos) > 70) {
            triggerHaptic('light');
            lastScrollPos.current[catId] = currentPos;
        }
    };

    if (!achievementsData || !xpData) return null;

    const { totalXP, currentLevel } = xpData;
    const unlockedAch = achievementsData.achievements.filter(a => a.unlocked);

    return (
        <div className="w-full pb-12">

            {/* ── DRVN LAB 精簡標頭 ── */}
            <div className="px-6 pt-4 pb-5 flex flex-col gap-3">
                {/* DRVN LAB 膠囊標籤 */}
                <div className="flex items-center gap-2">
                    <div>
                        <span className="text-[11px] font-black tracking-[0.35em] uppercase text-white">DRVN LAB</span>
                    </div>
                    <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
                </div>

                {/* 稱號 + XP */}
                <div className="flex items-end justify-between">
                    <div className="flex items-center gap-3">
                        <div>
                            <p className="text-[11px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>目前等級</p>
                            <h2 className="text-[28px] font-black tracking-tighter leading-none text-white"
                                style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
                                {currentLevel.title}
                            </h2>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-black tracking-[0.04em] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>總經驗</p>
                        <p className="text-[36px] font-black tracking-tighter leading-none text-white"
                            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
                            {totalXP}
                        </p>
                    </div>
                </div>

                {/* 獲取徽章預覽按鈕：點了播放一次示範獲取動畫，方便預覽效果 */}
                <motion.button {...pressProps('pill')}
 onClick={() => setPreviewReward({
 id: 'pc_100kg_club',
 name: '百公斤俱樂部',
 emoji: '🎯',
 image: '/images/badges/3d/pc_100kg_club.png',
 tier: 'gold',
 kind: 'badge',
 unlockText: '這是獲取動畫預覽 — 實際解鎖時會自動播放',
 })}
 className="w-full py-2.5 rounded-[12px] flex items-center justify-center gap-2"
 style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
 >
                    <Eye size={13} className="text-[#C9C2B8]" />
                    <span className="text-[11px] font-black tracking-wider text-[#C9C2B8] uppercase">獲取徽章預覽</span>
                </motion.button>

                {/* 分隔線 */}
                <div className="w-full h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>

            {/* 獲取動畫預覽掛載點 */}
            <RewardUnlockAnimation reward={previewReward} onClose={() => setPreviewReward(null)} />

            {/* ── 書架（各分類） ── */}
            <div className="px-2">
                {ACHIEVEMENT_CATEGORIES.filter(c => c.id !== 'all').map(cat => {
                    const catAch = sortBadgesByKind(achievementsData.achievements.filter(a => inCategory(a, cat.id)));
                    if (catAch.length === 0) return null;
                    const sc = CATEGORY_SHELF_COLORS[cat.id] || CATEGORY_SHELF_COLORS.special;

                    return (
                        <div key={cat.id} className="mb-8 px-2">

                            {/* 分區標頭 */}
                            <div className="flex items-center justify-between mb-4 px-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[16px] font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>{cat.label}</span>
                                    <span className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.28)' }}>{sc.nameEn}</span>
                                </div>
                                <span className="text-[11px] font-serif italic" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                    {catAch.filter(a => a.unlocked).length} / {catAch.length}
                                </span>
                            </div>

                            {/* 書架容器 */}
                            <div style={{ position: 'relative', height: BOOK_H + SHELF_FROM_BOTTOM + 8, background: 'transparent' }}>

                                {/* 玻璃層架（暗色版） */}
                                <div style={{
                                    position: 'absolute', left: 0, right: 0, bottom: SHELF_FROM_BOTTOM, height: BOOK_H * 0.35,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 8,
                                    zIndex: 5,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px',
                                    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)'
                                }}>
                                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                                </div>

                                {/* 實木底座（原版木紋） */}
                                <div style={{
                                    position: 'absolute', left: 0, right: 0, bottom: 0, height: SHELF_FROM_BOTTOM + 6,
                                    background: 'repeating-linear-gradient(165deg, #8E5A3C 0px, #8E5A3C 4px, #7A4A2F 4px, #7A4A2F 8px, #683C24 8px, #683C24 10px, #8E5A3C 10px, #8E5A3C 14px)',
                                    borderRadius: '0 0 10px 10px', boxShadow: '0 4px 10px rgba(0,0,0,0.35)'
                                }} />

                                {/* 橫向滾動徽章列 */}
                                <div 
                                    className="no-scrollbar flex items-end gap-6 overflow-x-auto px-4 pb-4"
                                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6 }}
                                    onScroll={(e) => handleScrollHaptic(cat.id, e)}
                                >
                                    {catAch.map(ach => {
                                        const isUnlocked = ach.unlocked;
                                        const tier = TIER_META[ach.tier] || TIER_META.bronze;
                                        return (
                                            <motion.button
                                                key={ach.id}
                                                onClick={() => setSelectedAch(ach)}
                                                whileTap={{ scale: 0.9 }}
                                                className="flex-shrink-0 flex flex-col items-center gap-1 mb-2"
                                            >
                                                {(is3DBadge(ach.id) || ach.image) ? (
                                                    /* 有徽章插畫：不套框，徽章大大直接擺，下方小字＋小進度條 */
                                                    <div className="relative flex flex-col items-center gap-1">
                                                        <img
                                                            decoding="async"
                                                            src={badgeImage(ach)}
                                                            alt={ach.name}
                                                            className="w-[96px] h-[96px] object-contain"
                                                            style={{ filter: isUnlocked ? 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))' : 'grayscale(1) opacity(0.35)' }}
                                                        />
                                                        {/* 只留粒子呼吸微光，不再加右上角小圖示 */}
                                                        <span className="text-[11px] font-black tracking-tight text-center w-[80px] leading-tight line-clamp-2"
                                                            style={{ color: isUnlocked ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
                                                            {ach.name}
                                                        </span>
                                                        {!isUnlocked && ach.progressPct > 0 && (
                                                            <div className="w-[52px] h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                                                                <div style={{ width: `${ach.progressPct}%`, height: '100%', background: tier.border }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                  <>
                                                    <div
                                                        className={`w-14 h-14 rounded-[18px] flex items-center justify-center relative shadow-sm transition-all ${!isUnlocked ? 'grayscale opacity-25' : ''}`}
                                                        style={{
                                                            background: isUnlocked ? tier.bg : 'rgba(255,255,255,0.05)',
                                                            border: `1.5px solid ${isUnlocked ? tier.border : 'rgba(255,255,255,0.06)'}`,
                                                            boxShadow: isUnlocked ? `0 8px 20px ${tier.glow}30` : 'none'
                                                        }}
                                                    >
                                                        <span className="text-2xl">{ach.emoji}</span>
                                                    </div>
                                                    <span className="text-[11px] font-black tracking-tight truncate w-14 text-center"
                                                        style={{ color: isUnlocked ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)' }}>
                                                        {ach.name}
                                                    </span>
                                                  </>
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Detail Modal ── */}
            {createPortal(
                <AnimatePresence>
                    {selectedAch && (
                        <motion.div
                            className="fixed inset-0 flex items-center justify-center px-6 py-10"
                            style={{ zIndex: 100100 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedAch(null)}
                        >
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                            <motion.div
                                className="relative w-full max-w-[330px] rounded-[28px] overflow-hidden"
                                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                                animate={{ scale: 1, y: 0, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    backgroundColor: '#141211',
                                    backgroundImage: `linear-gradient(155deg, rgba(20,17,16,0.62) 0%, rgba(10,9,9,0.80) 55%, rgba(6,6,6,0.88) 100%), url('/desktop/22.jpeg')`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    border: '1px solid rgba(249,92,75,0.24)',
                                    boxShadow: '0 0 0 1px rgba(249,92,75,0.12), 0 0 55px rgba(249,92,75,0.30), 0 24px 70px rgba(0,0,0,0.72)',
                                }}
                            >
                                {/* tier 氛圍光暈 */}
                                <div className="absolute inset-x-0 top-0 h-56 opacity-40 pointer-events-none z-0"
                                    style={{ background: `radial-gradient(80% 60% at 50% 30%, ${TIER_META[selectedAch.tier]?.glow || 'transparent'}, transparent 70%)` }} />

                                <div className="relative z-10 px-7 pt-14 pb-8">
                                    <motion.button {...pressProps('icon')} onClick={() => setSelectedAch(null)}
 className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/16 transition z-20">
                                        <X size={15} className="text-[#9A938A]" />
                                    </motion.button>
                                    <div className="flex flex-col items-center text-center">
                                        {/* 徽章：大主體（約視窗 65%） */}
                                        <div className="relative mb-6 flex items-center justify-center" style={{ width: '75%', aspectRatio: '1 / 1' }}>
                                            {is3DBadge(selectedAch.id) ? <CrystalBadge3D badgeId={selectedAch.id} image={badgeImage(selectedAch)} name={selectedAch.name} unlocked={selectedAch.unlocked} /> : selectedAch.image ? (
                                                <img decoding="async" src={selectedAch.image} alt={selectedAch.name} className="w-full h-full object-contain"
                                                    style={{ filter: selectedAch.unlocked ? `drop-shadow(0 16px 40px ${TIER_META[selectedAch.tier]?.glow || 'rgba(0,0,0,0.5)'}) drop-shadow(0 6px 16px rgba(0,0,0,0.4))` : 'grayscale(1) opacity(0.32)' }} />
                                            ) : (
                                                <div className="w-full h-full rounded-[32px] bg-[#1A1817] flex items-center justify-center"
                                                    style={{ border: `1.5px solid ${TIER_META[selectedAch.tier]?.border}40` }}>
                                                    <span style={{ fontSize: '34%', lineHeight: 1 }}>{selectedAch.emoji}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* 名稱 */}
                                        <h3 className="text-[#F2EFE9] text-[26px] font-light mb-2 leading-tight tracking-tight">{selectedAch.name}</h3>

                                        {/* 經驗值：小字、不用框 */}
                                        <p className="text-[11px] font-normal tracking-[0.22em] uppercase mb-4"
                                            style={{ color: TIER_META[selectedAch.tier]?.text || '#9A938A' }}>
                                            {TIER_META[selectedAch.tier]?.label} · +{TIER_XP[selectedAch.tier]} XP
                                        </p>

                                        {/* 達成條件：去框、細體、上下 hairline */}
                                        {selectedAch.condition && (
                                            <div className="w-full py-3.5 mb-5 border-t border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                                <p className="text-[11px] font-normal tracking-[0.04em] uppercase mb-1.5" style={{ color: 'rgba(249,92,75,0.85)' }}>達成條件</p>
                                                <p className="text-[13px] font-light leading-snug" style={{ color: '#D8D2C8' }}>{selectedAch.condition}</p>
                                            </div>
                                        )}

                                        {/* 極簡進度：一條細線 + 百分比 */}
                                        <div className="w-full">
                                            <div className="flex justify-between mb-2 items-baseline">
                                                <span className="text-[11px] font-normal tracking-[0.20em] uppercase text-[#8C857B]">
                                                    {selectedAch.unlocked ? '已解鎖' : '達成進度'}
                                                </span>
                                                <span className="text-[13px] font-light" style={{ color: selectedAch.unlocked ? (TIER_META[selectedAch.tier]?.text || '#F2EFE9') : '#C9C2B8', fontVariantNumeric: 'tabular-nums' }}>
                                                    {Math.round(selectedAch.progressPct || 0)}%
                                                </span>
                                            </div>
                                            <div className="h-[3px] rounded-full bg-white/8 overflow-hidden">
                                                <motion.div className="h-full rounded-full"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${selectedAch.progressPct || 0}%` }}
                                                    transition={{ duration: 0.9, ease: 'easeOut' }}
                                                    style={{ background: selectedAch.unlocked ? (TIER_META[selectedAch.tier]?.border || '#F95C4B') : 'rgba(249,92,75,0.55)' }} />
                                            </div>
                                            {!selectedAch.unlocked && selectedAch.target != null && (
                                                <div className="mt-2 text-[11px] font-light text-[#8C857B] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    {Math.round(selectedAch.current ?? (selectedAch.progressPct / 100) * selectedAch.target).toLocaleString()}
                                                    {' / '}{selectedAch.target.toLocaleString()}{selectedAch.unit ? ` ${selectedAch.unit}` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}

// ─── Dedicated Profile Card Component (Restoration for Profile Tab) ───
export function GrowthAchievementProfileCard({ userId }) {
    const [xpData, setXpData] = useState(null);
    const [achievementsData, setAchievementsData] = useState(null);
    const [titleMode, setTitleModeState] = useState(() => getTitleMode(userId));
    const [showTitlePicker, setShowTitlePicker] = useState(false);
    const pickTitleMode = (mode) => {
        setTitleModeState(mode);
        setTitleMode(userId, mode);
        setShowTitlePicker(false);
        triggerHaptic('selectionChanged');
    };
    const modeLabel = (TITLE_MODES.find((m) => m.id === titleMode) || TITLE_MODES[0]).label;

    useEffect(() => {
        setXpData(getUserXPAndTitle(userId));
        setAchievementsData(checkAllAchievements(userId));
        let alive = true;
        fetchBackendAchievementData(userId).then((ov) => {
            if (!alive || !ov || Object.keys(ov).length === 0) return;
            setAchievementsData(checkAllAchievements(userId, ov));
            setXpData(getUserXPAndTitle(userId));
        }).catch(() => { /* 後端不可用 → 維持本機版 */ });
        return () => { alive = false; };
    }, [userId]);

    if (!xpData || !achievementsData) return null;
    const { totalXP, currentLevel } = xpData;
    const unlockedAch = achievementsData.achievements.filter(a => a.unlocked);

    return (
        <div className="w-full px-2 pt-2 relative overflow-hidden mb-2">

            {/* No background — transparent, fuses with page */}

            {/* 📐 2026-09 稱號區縮一階 ──────────────────────────────────
                原本：稱號 52px ＋ Total XP 48px ＋ 130px 的 XP 浮水印，
                三個大字疊在一起，而且浮水印跟右邊的 Total XP 是同一個數字 ——
                同一個資訊在同一畫面出現兩次（§2），兩個大數字互搶主角（§4）。
                現在只留一個主角（稱號 30px），XP 退成佐證，浮水印拿掉，
                上下留白也一併收緊 —— 這一區是身分牌，不是一整屏的海報。 */}
            {/* Heavy Top Bar - Black Version */}
            <div className="w-full h-[3px] mb-4 relative z-10" style={{ background: C.textPrimary }} />

            {/* ⚠️ 這裡原本有四行小標（DRVN／Achievement／等級／系統）——
                四行都沒告訴使用者任何事，只是把版面墊高、把下面真正的主角稀釋掉。
                標籤不是資訊（drvn-interface-standard §4.1、§5）。整塊刪掉。 */}

            <div className="relative mb-6">
                <div className="relative z-10 flex items-end justify-between gap-4">
                    <motion.button {...pressProps('row')} onClick={() => { triggerHaptic('light'); setShowTitlePicker(true); }} className="border-l-[4px] pl-4 text-left active:opacity-70 transition-opacity min-w-0" style={{ borderColor: C.textPrimary }}>
                        <span className="text-[11px] tracking-[0.14em] font-black block opacity-45 mb-1.5" style={{ color: C.textPrimary }}>
                            {modeLabel}等級
                        </span>
                        <h2 className="text-[30px] font-black leading-[0.95] tracking-tighter"
                            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.textPrimary }}>
                            {titleForMode(xpData, titleMode)}
                        </h2>
                        {/* 「點一下選稱號類型（健身／跑步／混合）」是在教人按哪顆鈕（§3），
                            而且它比稱號本身還長。留一個小小的切換記號就夠了。 */}
                        <span className="text-[11px] font-bold tracking-[0.02em] opacity-40 mt-1 inline-flex items-center gap-1" style={{ color: C.textPrimary }}>
                            換一個 <ChevronDown size={11} strokeWidth={2.6} />
                        </span>
                    </motion.button>

                    {/* 稱號類型選擇面板 — 健身 / 跑步 / 混合(Hyrox·三鐵)
                        ⚠️ 一定要 portal 到 body。這個面板原本就長在上面那顆 motion.button
                           旁邊，外層是 `relative z-10`，而且祖先有 framer-motion 的 transform：
                             · transform 祖先會讓 position:fixed 改以它為基準，不是視窗
                             · relative z-10 開了一個堆疊脈絡，裡面寫 zIndex:9998 也贏不了外面
                           結果就是底部導覽壓在面板上（選項被蓋住），而且遮罩蓋不滿，
                           後面那排「已解鎖稱號」跟徽章會從面板上緣透出來，看起來像破圖。
                           （drvn-interface-standard §1.1） */}
                    {createPortal(
                    <AnimatePresence>
                        {showTitlePicker && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setShowTitlePicker(false)}
                                style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(22,20,21,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                            >
                                <motion.div
                                    initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                                    onClick={(e) => e.stopPropagation()}
                                    role="dialog"
                                    aria-label="選擇稱號類型"
                                    /* 由下彈出的 sheet 一定要封頂，內容一多才不會頂到瀏海 */
                                    style={{
                                        width: '100%', maxWidth: 480, boxSizing: 'border-box',
                                        background: '#F2EFE9', borderRadius: '26px 26px 0 0',
                                        padding: '22px 20px calc(env(safe-area-inset-bottom, 20px) + 22px)',
                                        maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 24px)',
                                        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                                    }}
                                >
                                    <div className="text-[15px] font-black mb-4" style={{ color: '#161415' }}>要在檔案上秀哪種身份？</div>
                                    <div className="flex flex-col gap-2">
                                        {TITLE_MODES.map((m) => {
                                            const active = m.id === titleMode;
                                            return (
                                                <motion.button {...pressProps('row')} key={m.id} onClick={() => pickTitleMode(m.id)}
 className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left "
 style={{ background: active ? '#161415' : 'rgba(22,20,21,0.05)', border: `1px solid ${active ? '#161415' : 'rgba(22,20,21,0.08)'}` }}>
                                                    <span className="min-w-0">
                                                        <span className="text-[11px] font-black tracking-[0.08em] block" style={{ color: active ? 'rgba(255,255,255,0.5)' : 'rgba(22,20,21,0.4)' }}>{m.label}</span>
                                                        <span className="text-[16px] font-black block" style={{ color: active ? '#fff' : '#161415' }}>{titleForMode(xpData, m.id)}</span>
                                                        <span className="text-[11px] font-bold block mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.4)' : 'rgba(22,20,21,0.35)' }}>{m.hint}</span>
                                                    </span>
                                                    {active && <span className="text-[16px] font-black shrink-0 ml-2" style={{ color: '#F95C4B' }}>✓</span>}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>, document.body)}
                    <div className="text-right shrink-0">
                        {/* 單位跟著數字走，不另外開一行小標 */}
                        <span className="text-[19px] font-black tracking-tight leading-none tabular-nums"
                            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.textPrimary }}>
                            {totalXP}
                        </span>
                        <span className="text-[11px] font-black ml-1 opacity-45" style={{ color: C.textPrimary }}>XP</span>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Unlocked Titles Label */}
            <div className="pt-4 border-t border-black/10 relative z-10">
                <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black tracking-[0.04em] opacity-45" style={{ color: C.textPrimary }}>已解鎖稱號</p>
                    <div className="flex -space-x-2">
                        {unlockedAch.slice(0, 5).map((ach, i) => (
                            <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-sm border border-black/10 overflow-hidden" style={{ background: C.stone }}>
                                {(is3DBadge(ach.id) || ach.image) ? (
                                    <img decoding="async" src={badgeImage(ach)} alt={ach.name} className="w-full h-full object-contain" />
                                ) : (
                                    ach.emoji
                                )}
                            </div>
                        ))}
                        {unlockedAch.length > 5 && (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black border border-black/10" style={{ background: C.stone, color: C.textPrimary }}>
                                +{unlockedAch.length - 5}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
