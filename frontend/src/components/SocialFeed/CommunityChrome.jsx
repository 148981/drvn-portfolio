import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Trophy, Users, User, Plus, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { triggerHaptic } from './communityHelpers';
import { pressProps } from '../../utils/nutritionMotion';
import { editorialColors } from '../../utils/colors';
import HandWave from '../ui/HandWave';
import StrideWordmark from '../ui/StrideWordmark';
import KineticWordmark from '../ui/KineticWordmark';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMMUNITY CHROME — 兩個社群頁共用的外框
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 分頁列、載入骨架、空狀態、離線提示 —— 這四樣在
 * SocialHubMobile 與 FitnessCommunityPage 裡各寫了一份，
 * 而且已經開始漂移（分頁列的 layoutId 不同、其中一頁的按鈕沒有按壓回饋、
 * 空狀態文案一個講「跑友」一個講「訓練夥伴」但結構一模一樣）。
 *
 * 收成一份，用 community 參數決定文案，樣式從此不可能再分岔。
 */

const C = editorialColors;

/* ═══ 分頁定義 ═══ */
export const COMMUNITY_TABS = [
    { id: 'feed', label: '動態', Icon: Activity },
    { id: 'ranking', label: '排行', Icon: Trophy },
    { id: 'squads', label: '社團', Icon: Users },
    { id: 'profile', label: '我的', Icon: User },
];

/**
 * 懸浮輕巧的分頁列。
 * @param {'run'|'fitness'} community  只用來區分 layoutId，避免兩頁同時掛載時動畫互搶
 */
/* 「我的」直接進徽章庫頁。個人資料預覽（名片）改在「探索 → 找人追蹤」點別人的頭像時出現。 */
export const CommunityTabBar = ({ activeTab, setActiveTab, community = 'run' }) => {
    return (
    <>
    <div
        className="fixed left-0 right-0 z-[100] flex justify-center px-5"
        style={{ top: 'var(--community-tabbar-top)' }}
    >
        {/* 🩶 Mist 灰底玻璃（DRVN 冷中性 #E8E9E6） */}
        <div
            data-onboard="social-tabs"
            className="flex gap-2 p-1.5 rounded-full w-full max-w-sm relative overflow-hidden"
            style={{
                background: 'rgba(232, 233, 230, 0.72)',
                backdropFilter: 'blur(40px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
                borderTop: '1.5px solid rgba(255, 255, 255, 0.85)',
                borderBottom: '1px solid rgba(151,166,182,0.20)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.55)',
                borderRight: '1px solid rgba(151,166,182,0.18)',
                boxShadow: '0 10px 30px -8px rgba(22,20,21,0.16), inset 0 1px 0 rgba(255,255,255,0.75)',
            }}
        >
            {COMMUNITY_TABS.map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                    <motion.button
                        {...pressProps('cta')}
                        key={id}
                        onClick={() => { triggerHaptic('medium'); setActiveTab(id); }}
                        aria-label={label}
                        aria-current={active ? 'page' : undefined}
                        className="relative flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-full"
                        style={{ color: active ? '#161415' : C.pebble, background: 'none', border: 'none' }}
                    >
                        {active && (
                            <motion.div
                                layoutId={`${community}-tab-pill`}
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background: 'rgba(246, 244, 241, 0.92)',
                                    border: '1px solid rgba(255,255,255,0.7)',
                                    boxShadow: '0 2px 8px -2px rgba(22,20,21,0.14), inset 0 1px 0 rgba(255,255,255,0.8)',
                                }}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            />
                        )}
                        <span className="relative z-10"><Icon size={18} strokeWidth={active ? 2.5 : 2} /></span>
                        <span
                            className="relative z-10 tracking-widest uppercase"
                            style={{ fontSize: 11, fontWeight: active ? 700 : 600 }}
                        >
                            {label}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    </div>
    </>
    );
};


/* ═══ 招牌列（兩個社群、四個分頁共用一份）═══════════════════════════════
 * 左：這個分頁是什麼 —— 關鍵字底下畫一道手寫重點線。
 * 右：字標，點一下換到另一個社群。
 *
 * 為什麼收成一份：跑步／健身各有一份、排行頁又各有一份，同一條招牌列
 * 在四個檔案裡複製了四次，改一次就得改四個地方（介面標準 §8）。
 *
 * ⚠️ 字標是「換社群」的入口，不是裝飾：
 *    以前只有動態頁最底下那張「健身社群」探索卡進得去，
 *    在排行／社團／我的分頁根本換不了社群。
 *    旁邊那顆 ⇄ 是讓人知道它點得下去 —— 沒有它就只是一個字標。
 */
const COMMUNITY_META = {
    run: { other: 'fitness', route: '/fitness-community-mobile', otherName: '健身社群', Wordmark: StrideWordmark },
    fitness: { other: 'run', route: '/social-mobile', otherName: '跑步社群', Wordmark: KineticWordmark },
};

/* 每個分頁的補充語。
   ⚠️ 關鍵字（動態／排行／社團／我的）不在這裡再寫一次 —— 直接取自 COMMUNITY_TABS。
      分頁列與招牌列講的是同一個詞，抄兩份遲早會有一邊改了另一邊沒改（§8）。 */
const TAB_TAIL = {
    run: { feed: '紀錄你的每一步', ranking: '看看你的位置', squads: '找一起跑的人', profile: '獎章與紀錄' },
    fitness: { feed: '鍛造更強的自己', ranking: '看看你的強度', squads: '找一起練的人', profile: '' },
};
const tabLabel = (id) => (COMMUNITY_TABS.find((t) => t.id === id) || COMMUNITY_TABS[0]).label;

/**
 * 字標 ＋ ⇄：點一下換到另一個社群。
 * 抽成獨立元件是因為「動態」分頁不放招牌列（上面的分頁列已經寫了「動態」，
 * 再寫一次「動態，紀錄你的每一步」是同一件事講兩次，§3），
 * 字標改放到官方活動那一列的右邊 —— 同一顆按鈕，只有一份定義。
 */
export const CommunitySwitch = ({ community = 'run' }) => {
    const navigate = useNavigate();
    const meta = COMMUNITY_META[community] || COMMUNITY_META.run;
    const Wordmark = meta.Wordmark;
    return (
        <motion.button
            {...pressProps('pill')}
            onClick={() => { triggerHaptic('medium'); navigate(meta.route); }}
            aria-label={`切換到${meta.otherName}`}
            style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7,
                background: 'none', border: 'none', padding: '6px 0 6px 8px',
                minHeight: 44, cursor: 'pointer',
            }}
        >
            <ArrowLeftRight size={13} strokeWidth={2.4} style={{ color: 'rgba(22,20,21,0.38)' }} />
            <Wordmark compact />
        </motion.button>
    );
};

/**
 * @param {'run'|'fitness'} community
 * @param {'feed'|'ranking'|'squads'|'profile'} tab
 */
export const CommunityMasthead = ({ community = 'run', tab = 'feed' }) => {
    const word = tabLabel(tab);
    /* 健身的「我的」沒有自己的說法 → 退回跑步那一份，不要留一句空的。 */
    const rest = (TAB_TAIL[community] || TAB_TAIL.run)[tab] || TAB_TAIL.run[tab] || '';

    return (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 20, paddingLeft: 24, paddingRight: 24 }}>
            {/* 左側飾條 — Coral + 鈦金屬光澤雙層 */}
            <div style={{
                width: 2, borderRadius: 99, flexShrink: 0, alignSelf: 'stretch', minHeight: 30,
                background: 'linear-gradient(180deg, #F95C4B 0%, #F95C4B 55%, rgba(151,166,182,0.9) 55%, rgba(255,255,255,0.95) 72%, rgba(151,166,182,0.7) 100%)',
                boxShadow: '0 1px 4px rgba(249,92,75,0.25)',
            }} />

            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                {/* 這一句底下畫一道手寫重點線，標出「現在在哪一個分頁」。
                    ⚠️ 兩個坑：
                      ① 線不能用 absolute 塞進 .truncate 的 <p> 裡 —— truncate 是
                         overflow:hidden，掛在 top:100% 的東西會被整條切掉，看不見。
                         改成 inline-block 包住 <p>，線當一般的區塊接在下面（與每日提示卡同一個寫法）。
                      ② 線畫在整句底下，不是只畫在那兩個字底下 —— HandWave 的
                         viewBox 是 120 單位寬、preserveAspectRatio="none"，
                         硬塞進 28px 寬的兩個字裡，八個波會擠成一團毛球。 */}
                <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', minWidth: 0 }}>
                    <p className="truncate" style={{
                        fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                        color: 'rgba(22,20,21,0.55)', margin: 0,
                    }}>
                        <span style={{ color: '#161415', fontWeight: 600 }}>{word}</span>
                        {rest ? `，${rest}。` : ''}
                    </p>
                    <HandWave color="#F95C4B" height={6} style={{ marginTop: 1 }} />
                </span>

                <CommunitySwitch community={community} />
            </div>
        </div>
    );
};

/* ═══ 載入骨架 ═══
   跟 FeedPostShell 同一個版型（IG 式：頭像列 → 左右滿版媒體 → 動作列 → 兩行字），
   載入完成時不會「從卡片跳成滿版」。 */
export const FeedCardSkeleton = () => (
    <div style={{ marginBottom: 28 }} aria-hidden>
        <div className="flex items-center gap-3" style={{ padding: '0 16px 10px' }}>
            <div className="w-9 h-9 rounded-full ti-skeleton" />
            <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-3 w-24 rounded-full ti-skeleton" />
                <div className="h-2.5 w-16 rounded-full ti-skeleton" />
            </div>
        </div>
        <div className="w-full ti-skeleton" style={{ aspectRatio: '4 / 5' }} />
        <div className="flex gap-4" style={{ padding: '14px 16px 0' }}>
            <div className="h-6 w-10 rounded-full ti-skeleton" />
            <div className="h-6 w-10 rounded-full ti-skeleton" />
            <div className="h-6 w-6 rounded-full ti-skeleton" />
        </div>
        <div className="flex flex-col gap-1.5" style={{ padding: '12px 16px 0' }}>
            <div className="h-3 w-4/5 rounded-full ti-skeleton" />
            <div className="h-3 w-3/5 rounded-full ti-skeleton" />
        </div>
    </div>
);

/* ═══ 空狀態（依篩選與社群給不同引導）═══ */
export const FeedEmptyState = ({ filter, onDiscover, onCreate, community = 'run' }) => {
    const isFollowing = filter === 'following';
    const peer = community === 'fitness' ? '訓練夥伴' : '跑友';
    const what = community === 'fitness' ? '訓練菜單' : '訓練與路線';

    return (
        <div
            className="mx-4 mt-6 mb-10 flex flex-col items-center text-center px-6 py-12 rounded-[28px]"
            style={{ background: '#E8E9E6', border: '1px solid rgba(207,198,184,0.6)' }}
        >
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(22,20,21,0.06)' }}>
                {isFollowing ? <Users size={24} color={C.pebble} /> : <Plus size={24} color={C.pebble} />}
            </div>
            <p style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, color: C.black }}>
                {isFollowing ? '還沒有追蹤的動態' : '探索區暫時沒有新貼文'}
            </p>
            <p className="leading-relaxed mb-6 max-w-[240px]" style={{ fontSize: 13, color: C.pebble }}>
                {isFollowing
                    ? `追蹤${peer}，這裡就會出現他們的${what}。或先發一則紀錄，讓別人找到你。`
                    : '稍後再來看看，或直接分享你自己的訓練。'}
            </p>
            <div className="flex gap-3">
                {isFollowing && (
                    <motion.button
                        {...pressProps('cta')}
                        onClick={onDiscover}
                        aria-label={`探索${peer}`}
                        className="px-5 py-2.5 rounded-full"
                        style={{ fontSize: 13, fontWeight: 800, background: C.coral, color: '#fff', border: 'none', boxShadow: '0 8px 20px rgba(249,92,75,0.3)' }}
                    >
                        探索{peer}
                    </motion.button>
                )}
                <motion.button
                    {...pressProps('cta')}
                    onClick={onCreate}
                    aria-label="分享訓練"
                    className="px-5 py-2.5 rounded-full"
                    style={{ fontSize: 13, fontWeight: 800, background: 'rgba(22,20,21,0.06)', color: C.black, border: 'none' }}
                >
                    分享訓練
                </motion.button>
            </div>
        </div>
    );
};

/**
 * ═══ 取不到動態時的提示 ═══
 * 誠實說明現在看到的不是完整的牆，而且要說對原因。
 *
 * 這裡原本寫死「目前連不到伺服器」。但正式站的實際狀況是後端 500 ——
 * 使用者照著提示換 Wi-Fi、重開機，怎麼弄都沒用，因為畫面講的
 * 跟實際發生的不是同一件事。原因一律由 utils/apiFailure 判斷後傳進來。
 *
 * @param {string} reason 已經寫好的那一句（來自 failureLine）
 */
export const FeedOfflineNotice = ({ reason }) => (
    <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        role="status"
        style={{
            margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12,
            background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(249,92,75,0.22)',
            display: 'flex', alignItems: 'center', gap: 10,
        }}
    >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: C.coral, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(22,20,21,0.65)' }}>
            {reason || '動態讀不到'}，先只顯示這台裝置上的貼文。下拉重新整理可以再試一次。
        </p>
    </motion.div>
);

export default { COMMUNITY_TABS, CommunityTabBar, CommunityMasthead, CommunitySwitch, FeedCardSkeleton, FeedEmptyState, FeedOfflineNotice };
