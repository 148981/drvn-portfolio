import React from 'react';
import { motion } from 'framer-motion';

/* ════════════════════════════════════════════════════════════════════
   PlanProgressTracker — 你現在走到哪了

   兩條軌道疊在一起就把話說完了：
     · 灰線 = 時間走了多少（日曆不會等人）
     · 實線 = 你實際跑了多少
   差距就是「跟上了沒」。不嘮叨、不催、不用紅字罵人 —— 只給事實。

   刻意不做「補償」：欠下的公里不會堆到下一週。
   那正是安全閘在擋的暴衝，而且分母一浮動，完成度就沒有意義了。
   ════════════════════════════════════════════════════════════════════ */

const EASE = [0.16, 1, 0.3, 1];

const PlanProgressTracker = ({ snapshot, compact = false, bare = false, slim = false, extra = null }) => {
    if (!snapshot) return null;
    const { week, totalWeeks, daysLeft, doneRatio, dueRatio, gapPts, onTrack, actualKm, plannedKm } = snapshot;

    const donePct = Math.round(doneRatio * 100);
    const duePct = Math.round(dueRatio * 100);
    const accent = onTrack ? '#7BA05B' : gapPts > 25 ? '#F95C4B' : '#FF9800';

    const line = gapPts <= -5
        ? `超前 ${Math.abs(gapPts)} 個百分點 — 記得別把下週的量也一起跑掉。`
        : onTrack
            ? '跟得上進度。'
            : `落後 ${gapPts} 個百分點。不用補跑 — 下週的量會自動調到你做得到的位置。`;

    /* slim 版：只剩進度 —— 一行「第幾週・本週幾堂・還剩幾天」＋ 一條軌道（數字、完成度、公里）。
       這一頁要一進來就看到訓練卡，頁首不能佔掉半個螢幕。 */
    if (slim) {
        return (
            <div>
                <div className="flex items-baseline gap-2" style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>
                    <span>第 {week}／{totalWeeks} 週</span>
                    {extra && <span>· {extra}</span>}
                    <span className="ml-auto tabular-nums">{daysLeft > 0 ? `還剩 ${daysLeft} 天` : '已結束'}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                    <span className="font-light tabular-nums" style={{ fontSize: 28, lineHeight: 1, letterSpacing: '-0.03em', color: accent, minWidth: 56 }}>
                        {donePct}<span style={{ fontSize: 14, opacity: 0.6 }}>%</span>
                    </span>
                    <div className="relative flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.08)' }}>
                        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${duePct}%`, width: 2, background: 'rgba(22,20,21,0.34)', borderRadius: 2 }} />
                        <motion.div className="h-full rounded-full"
                            initial={{ width: 0 }} animate={{ width: `${Math.min(100, donePct)}%` }}
                            transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
                            style={{ background: `linear-gradient(90deg, ${accent}AA, ${accent})` }} />
                    </div>
                    <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.6)', whiteSpace: 'nowrap' }}>
                        {actualKm}<span style={{ opacity: 0.6 }}> / {plannedKm} km</span>
                    </span>
                </div>
            </div>
        );
    }

    /* ★ v2.4 bare 版：不包框。
       進度不該被關在一張卡裡 —— 它是這一頁的標題級資訊，
       用大字排版直接站在頁面上，靠髮絲線分區就夠了。 */
    if (bare) {
        return (
            <div className="relative">
                <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-[12px] font-black tracking-[0.26em]" style={{ color: 'rgba(22,20,21,0.42)' }}>
                        第 {week} / {totalWeeks} 週
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(22,20,21,0.10)' }} />
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.42)' }}>
                        {daysLeft > 0 ? `還剩 ${daysLeft} 天` : '已結束'}
                    </span>
                </div>

                {/* 完成度 —— 這一頁最大的數字 */}
                <div className="flex items-end gap-4">
                    <div className="flex items-baseline">
                        <motion.span
                            className="font-light tabular-nums"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: EASE }}
                            style={{ fontSize: 72, lineHeight: 0.82, letterSpacing: '-0.05em', color: accent }}
                        >
                            {donePct}
                        </motion.span>
                        <span className="text-[22px] font-light" style={{ color: accent, opacity: 0.55 }}>%</span>
                    </div>

                    <div className="pb-2 flex flex-col gap-0.5">
                        <span className="text-[12px] font-black tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.42)' }}>
                            完成度
                        </span>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.40)' }}>
                            照時間 {duePct}%
                        </span>
                    </div>

                    <div className="ml-auto pb-2 text-right">
                        <div className="text-[19px] font-light tabular-nums" style={{ color: 'rgba(22,20,21,0.78)' }}>
                            {actualKm}
                            <span className="text-[11px] opacity-45"> / {plannedKm} km</span>
                        </div>
                    </div>
                </div>

                {/* 細軌：灰刻度＝時間、實線＝你 */}
                <div className="relative h-[5px] rounded-full overflow-hidden mt-4" style={{ background: 'rgba(22,20,21,0.07)' }}>
                    <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{ left: `${duePct}%`, width: 2, background: 'rgba(22,20,21,0.34)', borderRadius: 2 }}
                    />
                    <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, donePct)}%` }}
                        transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
                        style={{ background: `linear-gradient(90deg, ${accent}AA, ${accent})`, boxShadow: `0 0 8px ${accent}55` }}
                    />
                </div>

                <p className="text-[11.5px] leading-relaxed mt-2.5 m-0" style={{ color: 'rgba(22,20,21,0.55)' }}>
                    {line}
                </p>
            </div>
        );
    }

    return (
        <div
            className="rounded-[22px] p-4 relative overflow-hidden"
            style={{
                background: 'linear-gradient(150deg, #FBFAF8 0%, #F3EEE6 58%, #ECE4D7 100%)',
                border: '1px solid rgba(255,255,255,0.92)',
                boxShadow: '0 10px 24px -14px rgba(22,20,21,0.18), inset 0 1px 0 rgba(255,255,255,1)',
            }}
        >
            {/* 標頭：第幾週 / 剩幾天 */}
            <div className="flex items-baseline justify-between mb-3">
                <span className="text-[12px] font-black tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.42)' }}>
                    第 {week} / {totalWeeks} 週
                </span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    {daysLeft > 0 ? `還剩 ${daysLeft} 天` : '已結束'}
                </span>
            </div>

            {/* 兩個大數字：完成度 vs 該跑到 */}
            <div className="flex items-end gap-5 mb-3.5">
                <div>
                    <div className="flex items-baseline gap-1">
                        <motion.span
                            className="font-light tabular-nums"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, ease: EASE }}
                            style={{ fontSize: 42, lineHeight: 0.9, letterSpacing: '-0.04em', color: accent }}
                        >
                            {donePct}
                        </motion.span>
                        <span className="text-[14px] font-light" style={{ color: 'rgba(22,20,21,0.45)' }}>%</span>
                    </div>
                    <div className="text-[12px] font-black tracking-[0.20em] mt-1.5" style={{ color: 'rgba(22,20,21,0.42)' }}>
                        完成度
                    </div>
                </div>

                <div className="pb-1">
                    <div className="flex items-baseline gap-1">
                        <span className="font-light tabular-nums" style={{ fontSize: 24, lineHeight: 0.9, color: 'rgba(22,20,21,0.40)' }}>
                            {duePct}
                        </span>
                        <span className="text-[11px] font-light" style={{ color: 'rgba(22,20,21,0.32)' }}>%</span>
                    </div>
                    <div className="text-[12px] font-black tracking-[0.20em] mt-1.5" style={{ color: 'rgba(22,20,21,0.32)' }}>
                        照時間該跑到
                    </div>
                </div>

                <div className="ml-auto text-right pb-1">
                    <div className="text-[15px] font-light tabular-nums" style={{ color: 'rgba(22,20,21,0.72)' }}>
                        {actualKm}<span className="text-[11px] opacity-50"> / {plannedKm} km</span>
                    </div>
                </div>
            </div>

            {/* 雙軌：灰線 = 時間、實線 = 你 */}
            <div className="relative h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.07)' }}>
                {/* 時間刻度 */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${duePct}%`, width: 2, background: 'rgba(22,20,21,0.34)', borderRadius: 2 }}
                />
                <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, donePct)}%` }}
                    transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
                    style={{ background: `linear-gradient(90deg, ${accent}AA, ${accent})`, boxShadow: `0 0 8px ${accent}55` }}
                />
            </div>

            {!compact && (
                <p className="text-[11px] leading-relaxed mt-2.5 m-0" style={{ color: 'rgba(22,20,21,0.58)' }}>
                    {line}
                </p>
            )}
        </div>
    );
};

export default PlanProgressTracker;
