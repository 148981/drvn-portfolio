import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { pressProps } from '../utils/nutritionMotion';
import { brandColors as BRAND } from '../utils/colors';
import { haptic } from '../utils/haptics';
import { msUntilMonthEnd } from '../utils/leagueStore';
import { posOf, gatesOf, zoneOf, actionLine } from '../utils/leagueStanding';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LeagueStandingCard —— 「我這個月在哪」的唯一一張卡
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 取代什麼（2026-09 收斂）：
 *   排行頁頂端本來疊了兩張卡 ——
 *     ① LeagueBanner：DIVISION RANKING / BLACK CARD / 本月結算倒數 + 「晉升預覽」鈕
 *     ② MonthlyProgressCard：Your Progress 本月 vs 上月 / 大字里程 / delta
 *   兩張各有自己的中標、自己的大數字，而且都沒有回答最基本的那三題：
 *   我在哪？要去哪？現在該做什麼？「黑卡」三個字不會告訴你離晉升還差幾名，
 *   「晉升預覽」是給開發者看的字（介面標準 §3），倒數只是壓力不是資訊。
 *
 * 現在的規則（介面標準 §4 進度／目標類元件）：
 *   • 一張卡只回答兩件事：這一期的目標（晉升／不掉段）與現在在哪（名次）
 *   • 現況與目標畫在「同一條軌道」上，不是分散在兩段文字裡
 *   • 三種值用形狀區分：實心填滿＝我現在的位置、虛線＝晉升／降級線
 *   • 只有一個大數字（名次）。里程退成footer一行小字，不跟它搶
 *   • 最後一行是動作句，不是狀態標籤
 *
 * 沒資料就整塊不渲染（§5）：沒名次 → 回 null，由頁面自己的空狀態給一條路。
 * 只在「本月」有意義：上月／總榜是在翻歷史，晉升軌道不該出現在那裡。
 */

const C = {
    ink: '#161415', paper: '#F6F4F1', coral: '#F95C4B',
    stone: '#E4DED2', pebble: '#CFC6B8',
};
/* 全 app 共用的進場曲線（§7）。轉場 ≤400ms，軌道填滿是資料揭露、稍長一點。 */
const RISE_EASE = [0.16, 1, 0.3, 1];

/** 軌道上的一條閘門。`tone` 只影響標籤顏色 —— 線本身一律 Paper 白（見下）。 */
const Gate = ({ at, label, tone }) => (
    <div style={{ position: 'absolute', left: `${at * 100}%`, top: -5, bottom: -5, pointerEvents: 'none' }}>
        {/* 虛線＝「線」，不是「進度」。跟實心填滿一眼分得開（§4）。
            ⚠️ 線一律用 Paper 白：它會同時壓在「已填滿的珊瑚」與「空軌道的深色」上，
               染成警示紅的話在珊瑚上就看不見了。哪一條是降級線由下面的標籤講。 */}
        <div style={{
            width: 0, height: '100%',
            borderLeft: '1.5px dashed rgba(246,244,241,0.85)',
            transform: 'translateX(-0.75px)',
        }} />
        <span style={{
            position: 'absolute', top: '100%', left: 0, transform: 'translateX(-50%)',
            marginTop: 6, whiteSpace: 'nowrap',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: tone,
        }}>{label}</span>
    </div>
);

/**
 * 增減。
 * ⚠️ 方向由文字自己講（「比上月多 12 km」「＋2 次」「−3 次」），不是只靠顏色 ——
 *    深底上的綠與紅對色弱使用者幾乎一樣。顏色只是加強，拿掉也讀得懂。
 * ⚠️ 顏色只從色票取（§9）：進步用 sage（brandColors.sage），
 *    持平／退步用 Paper 降透明度。退步不用警示紅 —— 少跑了幾公里不是警報，
 *    而且 #D94030 在全 app 是「警示」的意思，借來用會讓語意漂掉。
 */
const Delta = ({ dir, text }) => {
    if (!text) return null;
    const color = dir === 'up' ? BRAND.sage : 'rgba(246,244,241,0.50)';
    return <span style={{ fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{text}</span>;
};

const LeagueStandingCard = ({
    league, nextLeague,
    rank, total,
    promoCount = 0, releCount = 0,
    progress = null,
    kind = 'run',
    canClaim = false,
    onClaim = null,
}) => {
    const reduced = useReducedMotion();
    const [open, setOpen] = useState(false);

    /* 「剩 0 天結算」不是句子。不到一天就直接說今天。
       ⚠️ 依賴留空是刻意的：這張卡不需要跨午夜自己更新，
          重新進頁面就會重算；每分鐘重算反而讓整張卡跟著重繪。 */
    const settleIn = useMemo(() => {
        const d = Math.ceil(msUntilMonthEnd(new Date()) / 86400000);
        return d <= 0 ? '今天結算' : `剩 ${d} 天結算`;
    }, []);

    // §5 沒資料 → 整塊不渲染
    if (!Number.isFinite(rank) || !Number.isFinite(total) || total < 1) return null;

    /* 位置、閘門、分區、動作句全部來自 utils/leagueStanding（純函式、有斷言）。 */
    const mePos = posOf(rank, total);          // 0~1 的軌道位置，不是「我這個人」
    const gates = gatesOf(total, promoCount, releCount);
    const zone = zoneOf(rank, total, promoCount, releCount);
    const inPromo = zone === 'promote';
    const inRele = zone === 'relegate';
    const action = actionLine(rank, total, promoCount, releCount, nextLeague?.displayLabel || null);

    /* footer：跟自己比。收成一行 —— 這裡不可以再出現第二個大數字（§4）。
       ⚠️ progress.hasData 是「跑步或重訓任一有資料」。只跑步的人在健身排行上
          會拿到 hasData=true 但訓練量是 0 —— 那就變成「顯示 0 假裝有資料」（§5）。
          所以這裡要按這一頁的項目各自再擋一次。 */
    const isRun = kind === 'run';
    const hasOwnData = progress && progress.hasData && (isRun
        ? ((progress.thisMonth?.count || 0) > 0 || (progress.lastMonth?.count || 0) > 0)
        : ((progress.thisStrength?.count || 0) > 0 || (progress.lastStrength?.count || 0) > 0));
    const p = hasOwnData ? progress : null;

    /* 重訓次數的增減 computeMonthlyProgress 沒有算（deltas.count 是跑步次數），
       在這裡從 thisStrength / lastStrength 補一份，形狀與 mkDelta 一致。 */
    const strengthCountDelta = p ? (() => {
        const diff = (p.thisStrength?.count || 0) - (p.lastStrength?.count || 0);
        return { value: Math.abs(diff), raw: diff, dir: diff === 0 ? 'flat' : (diff > 0 ? 'up' : 'down') };
    })() : null;
    const mainVal = p ? (isRun ? p.thisMonth.distance : +(p.thisStrength.volume / 1000).toFixed(1)) : null;
    const mainUnit = isRun ? 'km' : 't';
    const mainDelta = p ? (isRun ? p.deltas.distance : p.deltas.volume) : null;
    const deltaText = mainDelta && mainDelta.dir !== 'flat'
        ? `比上月${mainDelta.dir === 'up' ? '多' : '少'} ${isRun ? mainDelta.value : (mainDelta.value / 1000).toFixed(1)} ${mainUnit}`
        : (mainDelta ? '跟上月持平' : null);

    const rows = p ? (isRun
        ? [
            ['里程', `${p.thisMonth.distance} km`, p.deltas.distance, 'km'],
            ['次數', `${p.thisMonth.count} 次`, p.deltas.count, '次'],
            ['配速', p.thisMonth.avgPace > 0 ? `${Math.floor(p.thisMonth.avgPace / 60)}'${String(Math.round(p.thisMonth.avgPace % 60)).padStart(2, '0')}"` : '—', p.deltas.pace, 's'],
        ]
        : [
            ['訓練量', `${(p.thisStrength.volume / 1000).toFixed(1)} t`, p.deltas.volume, 't'],
            ['次數', `${p.thisStrength.count} 次`, strengthCountDelta, '次'],
        ]) : [];

    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: RISE_EASE }}
            style={{
                margin: '10px 16px 14px', borderRadius: 18, overflow: 'hidden', position: 'relative',
                background: 'linear-gradient(180deg, rgba(44,42,38,0.66) 0%, rgba(22,20,21,0.80) 55%, rgba(16,14,15,0.86) 100%)',
                backdropFilter: 'blur(30px) saturate(185%)', WebkitBackdropFilter: 'blur(30px) saturate(185%)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20), 0 18px 40px -18px rgba(0,0,0,0.42)',
            }}
        >
            {/* 拉絲鈦金屬紋理（材質取自設計系統，不在這裡自訂顏色 §9） */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, backgroundImage: "url('/desktop/11.jpeg')", backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.14, mixBlendMode: 'luminosity' }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '20px 20px 18px' }}>
                {/* ── 中標：這一期是什麼、還剩多久 ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(246,244,241,0.45)' }}>
                        本月 · {settleIn}
                    </span>
                    {/* 段位是身分，不是主角數字 —— 做成小徽章 */}
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        padding: '4px 9px', borderRadius: 8,
                        background: 'rgba(246,244,241,0.10)', border: '1px solid rgba(246,244,241,0.22)',
                    }}>
                        <Trophy size={11} strokeWidth={2.2} color={C.stone} />
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: C.paper }}>
                            {league?.displayLabel || '—'}
                        </span>
                    </span>
                </div>

                {/* ── 主角：我第幾名 ── */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 2px' }}>
                    <span style={{ fontSize: 44, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.03em', color: C.paper, fontVariantNumeric: 'tabular-nums' }}>
                        {rank}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(246,244,241,0.55)' }}>
                        / {total} 人
                    </span>
                </div>

                {/* ── 一條軌道：實心＝我在哪，虛線＝晉升／降級線 ── */}
                <div style={{ position: 'relative', marginTop: 22, marginBottom: 30 }}>
                    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(246,244,241,0.12)' }}>
                        <motion.div
                            initial={reduced ? false : { width: 0 }}
                            animate={{ width: `${mePos * 100}%` }}
                            transition={{ duration: 0.6, ease: RISE_EASE, delay: 0.08 }}
                            style={{
                                height: '100%', borderRadius: 3,
                                background: inRele ? '#D94030' : inPromo ? C.coral : 'rgba(246,244,241,0.55)',
                            }}
                        />
                        {/* 我的位置：實心點，永遠貼在填滿的端點上（§4 記號旁的數字要跟著記號走） */}
                        <motion.span aria-hidden
                            initial={reduced ? false : { left: '0%' }}
                            animate={{ left: `${mePos * 100}%` }}
                            transition={{ duration: 0.6, ease: RISE_EASE, delay: 0.08 }}
                            style={{
                                position: 'absolute', top: '50%', width: 12, height: 12, borderRadius: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: inRele ? '#D94030' : inPromo ? C.coral : C.paper,
                                boxShadow: '0 0 0 3px rgba(22,20,21,0.55)',
                            }}
                        />
                        {gates.map((g) => (
                            <Gate key={g.label} at={g.at} label={g.label}
                                tone={g.label === '降級線' ? 'rgba(217,64,48,0.8)' : 'rgba(246,244,241,0.55)'} />
                        ))}
                    </div>
                </div>

                {/* ── 動作句 ──────────────────────────────────────────────
                    ⚠️ 不可點的時候就不要做成 <button>：一顆 disabled 的鈕仍然會被
                       當成可點元素（觸控區檢查會抓到 19px 高的「按鈕」），
                       而且按下去沒反應本身就是壞回饋。只有真的能領晉升時才是鈕，
                       那時觸控區補到 44px（§6）。 */}
                {canClaim ? (
                    <motion.button
                        {...pressProps('row')}
                        onClick={() => { haptic('medium'); onClaim && onClaim(); }}
                        style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            padding: '12px 0', margin: '-12px 0 -6px', minHeight: 44,
                            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.coral, letterSpacing: '-0.005em' }}>
                            領取你的晉升
                        </span>
                        <ChevronRight size={14} strokeWidth={2.6} color={C.coral} />
                    </motion.button>
                ) : (
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.coral, letterSpacing: '-0.005em' }}>
                        {action}
                    </p>
                )}
            </div>

            {/* ── footer：跟自己比。一行講完，點開才有細項 ── */}
            {p && (
                <>
                    <motion.button
                        {...pressProps('row')}
                        onClick={() => { haptic('light'); setOpen(v => !v); }}
                        aria-expanded={open}
                        style={{
                            position: 'relative', zIndex: 1, width: 'calc(100% - 40px)', margin: '0 20px',
                            padding: '13px 0', background: 'none', border: 'none',
                            borderTop: '1px solid rgba(246,244,241,0.12)',
                            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.paper, whiteSpace: 'nowrap' }}>
                            本月 {mainVal} {mainUnit}
                        </span>
                        <Delta dir={mainDelta?.dir} text={deltaText} />
                        <span style={{ flex: 1 }} />
                        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex', opacity: 0.5 }}>
                            <ChevronDown size={16} color={C.paper} />
                        </motion.span>
                    </motion.button>

                    <AnimatePresence initial={false}>
                        {open && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.28, ease: RISE_EASE }}
                                style={{ overflow: 'hidden', position: 'relative', zIndex: 1 }}
                            >
                                {/* ⚠️ 只用 11 / 13 兩級字（加上主角的 44 剛好 3 級，§1 上限）。
                                    細項不做成「大數字 ＋ 標籤 ＋ 說明」的三層格子 ——
                                    那會在同一張卡裡再長出一組數據主角。 */}
                                <div style={{ padding: '0 20px 18px', display: 'flex', gap: 14 }}>
                                    {rows.map(([label, val, d, unit]) => (
                                        <div key={label} style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(246,244,241,0.40)', margin: '0 0 6px' }}>{label}</p>
                                            <p style={{ fontSize: 13, fontWeight: 700, color: C.paper, margin: 0, letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{val}</p>
                                            <p style={{ margin: '3px 0 0' }}>
                                                <Delta
                                                    dir={d?.dir}
                                                    text={!d || d.dir === 'flat' ? '持平'
                                                        : unit === 's' ? `快 ${d.value} 秒`
                                                            : unit === 't' ? `${d.dir === 'up' ? '+' : '-'}${(d.value / 1000).toFixed(1)} t`
                                                                : `${d.dir === 'up' ? '+' : '-'}${d.value} ${unit}`}
                                                />
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </motion.div>
    );
};

export default LeagueStandingCard;
