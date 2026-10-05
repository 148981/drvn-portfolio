import React from 'react';
import { Play, Pause, Flame, Heart, List, Watch } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * LiveActivityCard — 磨砂玻璃統一頂欄
 * 
 * 所有即時數據（計時、卡路里、心率）合併為一個磨砂玻璃條，
 * 風格統一、乾淨極簡。
 */
const LiveActivityCard = ({
    durationSeconds = 0,
    calories = 0,
    heartRate = 0,
    /**
     * 🆕 hasWatchData
     *  true  → 真的有從 Apple Watch / HealthKit 拿到實時數據，顯示真實值
     *  false → 沒手錶或未授權，顯示 "--"，並在 hover 時提示連接 Apple Watch
     */
    hasWatchData = true,
    watchConnected = false,   // 🆕 手錶是否已連線（顯示狀態點）
    watchRecording = false,   // 🆕 手錶是否正在記錄
    isPaused = false,
    onTogglePause,
    onTapQueue,
}) => {
    // 沒手錶資料時顯示 "--"，避免 0 被渲染成數字
    const showHR  = hasWatchData && heartRate != null && Number(heartRate) > 0;
    const showCal = hasWatchData && calories  != null && Number(calories)  > 0;
    const tooltipNoWatch = '尚未偵測到 Apple Watch，請於手錶開啟 FitnessApp 並開始訓練';
    const formatTime = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
            style={{ paddingTop: 'max(20px, env(safe-area-inset-top, 20px))' }}
        >
            <div className="px-4 pb-3">
                {/* ── ✨ Liquid Glass 統一頂欄 (iOS 26) ── */}
                <div
                    className="pointer-events-auto relative isolate flex items-center gap-3 px-4 py-3 overflow-hidden"
                    style={{
                        // 半透明深色玻璃基底 + 高飽和折射，讓背後內容透出色彩
                        background: 'linear-gradient(180deg, rgba(44,40,42,0.55) 0%, rgba(20,18,19,0.62) 100%)',
                        backdropFilter: 'blur(36px) saturate(190%) brightness(1.05)',
                        WebkitBackdropFilter: 'blur(36px) saturate(190%) brightness(1.05)',
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        boxShadow: [
                            'inset 0 1px 1px rgba(255,255,255,0.28)',   // 頂部高光（玻璃厚度感）
                            'inset 0 -1px 1px rgba(0,0,0,0.25)',         // 底部陰影
                            'inset 0 0 0 1px rgba(255,255,255,0.06)',    // 邊緣內描邊
                            '0 10px 34px rgba(0, 0, 0, 0.28)',           // 投影
                        ].join(', '),
                        borderRadius: '24px'
                    }}
                >
                    {/* 鏡面高光：頂部反射的一道弧形光，liquid glass 的招牌反光 */}
                    <div
                        className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.02) 60%, transparent 100%)',
                            borderRadius: '24px 24px 40% 40%',
                            mixBlendMode: 'screen',
                        }}
                    />
                    {/* Pause/Resume Button */}
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePause?.();
                        }}
                        className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                        style={{
                            // ✨ 鈦金屬 (Titanium) 質感
                            background: 'linear-gradient(135deg, #B0ADA7 0%, #D8D6D2 25%, #9B9893 50%, #C6C3BF 75%, #85827D 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.9), inset 0 -1px 2px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.15)',
                        }}
                    >
                        {/* 金屬反光 */}
                        <span className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
                              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)', mixBlendMode: 'soft-light' }} />
                        {isPaused ? (
                            <Play size={15} className="relative z-10 text-[#161415] ml-0.5" fill="currentColor" />
                        ) : (
                            <Pause size={15} className="relative z-10 text-[#161415]" fill="currentColor" />
                        )}
                    </motion.button>

                    {/* Timer */}
                    <motion.span
                        key={Math.floor(durationSeconds / 60)}
                        initial={{ opacity: 0.7, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative z-10 text-[28px] font-medium text-[#F6F4F1] leading-none tracking-tight"
                    >
                        {formatTime(durationSeconds)}
                    </motion.span>

                    {/* Stats + Queue Tap Zone */}
                    <motion.div
                        className="relative z-10 flex items-center gap-3 flex-1 justify-end cursor-pointer"
                        onClick={onTapQueue}
                        whileTap={{ scale: 0.95 }}
                    >
                        {/* ⌚ 手錶 icon 指示燈（只用 icon，不顯示文字）：
                            有連線/有數據 → coral 呼吸燈；沒手錶 → 灰色靜止 */}
                        {(() => {
                            const lit = showHR || watchConnected;   // 連線或有數據 = 亮起
                            const iconColor = lit ? '#F95C4B' : 'rgba(246,244,241,0.30)';
                            return (
                                <div className="flex items-center" title={showHR ? '手錶心率偵測中' : watchConnected ? '手錶已連線' : '未偵測到手錶'}>
                                    <motion.span
                                        animate={lit ? { scale: [1, 1.16, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 1 }}
                                        transition={lit ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                                        style={{ display: 'inline-flex', filter: lit ? 'drop-shadow(0 0 5px #F95C4B)' : 'none' }}
                                    >
                                        <Watch size={14} strokeWidth={2.3} style={{ color: iconColor }} />
                                    </motion.span>
                                </div>
                            );
                        })()}
                        <div className="w-px h-4 bg-white/20" />

                        {/* Calories */}
                        <div
                            className="flex items-center gap-1.5"
                            title={showCal ? '' : tooltipNoWatch}
                        >
                            <Flame size={14} className={showCal ? 'text-[#F59E0B]' : 'text-[#F6F4F1]/25'} fill={showCal ? '#F59E0B' : 'none'} />
                            <motion.span
                                key={showCal ? Math.round(calories) : 'dash'}
                                initial={{ scale: 1.15 }}
                                animate={{ scale: 1 }}
                                className={`text-sm font-medium ${showCal ? 'text-[#F6F4F1]' : 'text-[#F6F4F1]/35'}`}
                            >
                                {showCal ? Math.round(calories) : '--'}
                            </motion.span>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-4 bg-white/20" />

                        {/* Heart Rate */}
                        <div
                            className="flex items-center gap-1.5"
                            title={showHR ? '' : tooltipNoWatch}
                        >
                            <motion.div
                                animate={{ scale: showHR ? [1, 1.2, 1] : 1 }}
                                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.4 }}
                            >
                                <Heart size={14} className={showHR ? 'text-[#EF4444]' : 'text-[#F6F4F1]/25'} fill={showHR ? '#EF4444' : 'none'} />
                            </motion.div>
                            <span className={`text-sm font-medium ${showHR ? 'text-[#F6F4F1]' : 'text-[#F6F4F1]/35'}`}>
                                {showHR ? Math.round(heartRate) : '--'}
                            </span>
                        </div>

                        {/* Queue icon hint */}
                        <div className="w-px h-4 bg-white/20" />
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <List size={13} className="text-[#F6F4F1]/70" />
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default LiveActivityCard;
