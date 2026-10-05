import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { Lock, Check } from 'lucide-react';
import { getFeaturedTitle, setFeaturedTitle } from '../utils/featuredTitle';
import { computeLevelTitles, levelToFeatured } from '../utils/titleEngine';

/* ─────────────────────────────────────────────────────────────
   IdentityTitlePicker — 稱號

   ⚠️ 2026-09 改版：稱號的來源換掉了。
      以前掛的是 personaCatalog 的人格標籤（巡航／長程／爬升／築基／
      容量／紀律…），那套是拿當下的跑步與重訓數據即時判定出來的，
      跟成就獎牌、跟 XP 等級沒有任何關係 —— 使用者拿到的獎牌，
      跟他能掛在身上的稱號是兩條不相干的線。
      現在統一成一條：成就獎牌 → XP → 等級稱號，
      也就是成就頁那組「健身房新手 → … → 奧林匹亞」的階梯。
      三種身份（健身／跑步／混合）是同一條 XP 線的三種說法，
      所以解鎖到第幾階是一樣的，只是名字不同，由使用者挑喜歡的那個。
   ───────────────────────────────────────────────────────────── */

const CORAL = '#F95C4B';

const IdentityTitlePicker = ({ userId, theme = 'dark' }) => {
    const [featured, setFeaturedState] = useState(() => getFeaturedTitle(userId));
    const light = theme === 'light';

    const T = light
        ? {
            heading: 'rgba(22,20,21,0.45)', card: 'rgba(22,20,21,0.03)', cardBorder: 'rgba(22,20,21,0.1)',
            groupLabel: 'rgba(22,20,21,0.42)', featuredText: '#161415', mutedText: 'rgba(22,20,21,0.45)',
            chipBg: 'rgba(22,20,21,0.05)', chipBorder: 'rgba(22,20,21,0.12)', chipText: 'rgba(22,20,21,0.85)',
            lockedBg: 'rgba(22,20,21,0.02)', lockedText: 'rgba(22,20,21,0.32)', hint: 'rgba(22,20,21,0.42)',
            toggleOff: 'rgba(22,20,21,0.15)', track: 'rgba(22,20,21,0.08)',
        }
        : {
            heading: 'rgba(255,255,255,0.45)', card: 'rgba(255,255,255,0.05)', cardBorder: 'rgba(255,255,255,0.1)',
            groupLabel: 'rgba(255,255,255,0.45)', featuredText: '#fff', mutedText: 'rgba(255,255,255,0.5)',
            chipBg: 'rgba(255,255,255,0.08)', chipBorder: 'rgba(255,255,255,0.14)', chipText: 'rgba(255,255,255,0.88)',
            lockedBg: 'rgba(255,255,255,0.04)', lockedText: 'rgba(255,255,255,0.32)', hint: 'rgba(255,255,255,0.45)',
            toggleOff: 'rgba(0,0,0,0.5)', track: 'rgba(255,255,255,0.1)',
        };

    const { totalXP, nextLevel, xpNeededForNext, modes, byMode, gateNeeds = {} } =
        useMemo(() => computeLevelTitles({ userId }), [userId]);

    const select = (opt) => {
        haptic('light');
        const next = levelToFeatured(opt, featured?.showOnHome ?? true);
        setFeaturedState(next);
        setFeaturedTitle(userId, next);
    };
    const clear = () => { haptic('light'); setFeaturedState(null); setFeaturedTitle(userId, null); };
    const toggleHome = () => {
        if (!featured) return;
        haptic('light');
        const next = { ...featured, showOnHome: !featured.showOnHome };
        setFeaturedState(next);
        setFeaturedTitle(userId, next);
    };

    const Chip = ({ opt }) => {
        const isSel = featured?.id === opt.id;
        const isLocked = !opt.unlocked;
        return (
            <motion.button {...pressProps('pill')}
                onClick={() => !isLocked && select(opt)}
                disabled={isLocked}
                title={opt.reason}
                className="flex items-center gap-1.5 rounded-full relative"
                style={{
                    padding: '8px 13px', fontSize: 13, fontWeight: 700,
                    cursor: isLocked ? 'default' : 'pointer',
                    background: isSel ? CORAL : (isLocked ? T.lockedBg : T.chipBg),
                    color: isSel ? '#fff' : (isLocked ? T.lockedText : T.chipText),
                    border: `1px solid ${isSel ? CORAL : T.chipBorder}`,
                }}
            >
                {isLocked && <Lock size={12} />}
                {isSel && <Check size={13} />}
                <span style={{ whiteSpace: 'nowrap' }}>{opt.label}</span>
                {/* 現在站的那一階 —— 不是選中，是「你目前的實力在這」 */}
                {opt.isCurrent && !isSel && (
                    <span style={{
                        marginLeft: 2, fontSize: 11, fontWeight: 800,
                        color: isLocked ? T.lockedText : CORAL,
                    }}>現在</span>
                )}
            </motion.button>
        );
    };

    return (
        <div className="space-y-3">
            <div className="text-[12px] font-bold tracking-[0.04em] px-1" style={{ color: T.heading }}>稱號</div>
            <div className="rounded-[18px] p-4 space-y-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}`, backdropFilter: 'blur(12px)' }}>

                {/* 目前選的稱號 ＋ 要不要顯示在首頁 */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        {featured
                            ? <span className="font-bold text-[15px] truncate" style={{ color: T.featuredText }}>{featured.poeticZh || featured.label}</span>
                            : <span className="text-[13px]" style={{ color: T.mutedText }}>尚未選擇稱號</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {featured && (
                            <motion.button {...pressProps('pill')} onClick={clear}
                                className="text-[12px] font-bold" style={{ color: T.mutedText, minHeight: 44, padding: '0 6px' }}>清除</motion.button>
                        )}
                        <motion.button {...pressProps('icon')}
                            onClick={toggleHome}
                            aria-label="顯示在首頁名稱旁"
                            aria-pressed={Boolean(featured?.showOnHome)}
                            disabled={!featured}
                            className="w-11 h-6 rounded-full relative transition-colors duration-300 shadow-inner"
                            style={{ background: featured?.showOnHome ? CORAL : T.toggleOff, opacity: featured ? 1 : 0.4, border: '1px solid rgba(255,255,255,0.15)' }}
                        >
                            <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform duration-300"
                                style={{ transform: featured?.showOnHome ? 'translateX(22px)' : 'translateX(4px)' }} />
                        </motion.button>
                    </div>
                </div>

                {/* 現在的進度 —— 稱號怎麼來的，就寫在這裡，不用另外解釋 */}
                <div>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <span className="text-[13px] font-bold" style={{ color: T.featuredText, fontVariantNumeric: 'tabular-nums' }}>
                            {totalXP.toLocaleString()} 點
                        </span>
                        <span className="text-[12px] font-semibold" style={{ color: T.mutedText }}>
                            {nextLevel ? `再 ${xpNeededForNext.toLocaleString()} 點解鎖下一階` : '已經到頂'}
                        </span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: T.track }}>
                        <div style={{
                            height: '100%', borderRadius: 99, background: CORAL,
                            width: nextLevel && xpNeededForNext > 0
                                ? `${Math.max(2, Math.min(100, 100 - (xpNeededForNext / Math.max(1, nextLevel.minXP)) * 100))}%`
                                : '100%',
                        }} />
                    </div>
                    <p className="text-[12px] mt-2" style={{ color: T.hint }}>
                        拿成就獎牌、完成訓練、累積里程都會加點數。開啟後稱號會顯示在首頁名稱旁。
                    </p>
                </div>

                {/* 三種身份：同一條 XP，但後面幾階要真的做到才掛得上（IFBB Pro、Marathoner、IRONMAN…）。
                    XP 夠了卻卡在門檻 → 那一組下面直接寫還差什麼，不用點進去猜。 */}
                {modes.map((m) => (
                    <div key={m.id}>
                        <div className="text-[12px] font-bold mb-2" style={{ color: T.groupLabel }}>{m.label}</div>
                        <div className="flex flex-wrap gap-2">
                            {(byMode[m.id] || []).map((opt) => <Chip key={opt.id} opt={opt} />)}
                        </div>
                        {(gateNeeds[m.id] || []).length > 0 && (
                            <p className="text-[12px] font-semibold mt-2" style={{ color: T.mutedText }}>
                                下一階還要：{gateNeeds[m.id].join('、')}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default IdentityTitlePicker;
