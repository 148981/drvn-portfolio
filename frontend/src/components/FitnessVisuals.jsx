import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react'; // Using Lucide 'Trophy' instead of react-icons 'FaTrophy' to match project

// ==========================================
// 1. 肥大模式：VolumeLoader (金色分段進度條)
// ==========================================
export const VolumeLoader = ({ actual, target }) => {
    // 設定分段數量，創造「塊狀感」
    const segments = 12;
    // 計算要填滿多少段 (最多不超過 segments)
    const filledSegments = Math.min(Math.round((actual / target) * segments), segments);

    // Loewe 金色色碼
    const goldColor = "#C5A059";

    return (
        <div className="w-full">
            <div className="flex justify-between text-xs text-stone-400 mb-2">
                <span className="uppercase tracking-wider font-medium text-gold-500 text-[#C5A059]">Volume Loading</span>
                <span className="font-mono text-[#3D3D3D]">{actual} / {target} Sets</span>
            </div>
            {/* 分段條容器 */}
            <div className="flex gap-1 h-3">
                {[...Array(segments)].map((_, i) => {
                    const isFilled = i < filledSegments;
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scaleY: 0.5 }}
                            animate={{
                                opacity: isFilled ? 1 : 0.2,
                                scaleY: 1,
                                backgroundColor: isFilled ? goldColor : "#57534E", // 亮金 vs 暗灰
                                boxShadow: isFilled ? `0 0 8px ${goldColor}40` : "none" // 微弱發光
                            }}
                            transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.05 }} // 順序點亮動畫
                            className="flex-1 rounded-[1px]"
                        />
                    );
                })}
            </div>
        </div>
    );
};

// ==========================================
// 2. 力量模式：StrengthGauge (琥珀色衝擊波量表)
// ==========================================
export const StrengthGauge = ({ currentWeight, prevMax }) => {
    // prevMax 為 null/0 代表「尚無歷史可比」→ 不假造 PR、也不觸發衝擊波。
    const hasHistory = prevMax != null && prevMax > 0;
    const isPR = hasHistory && currentWeight > prevMax;
    // 有歷史才跟歷史比；沒歷史就滿環呈現當前值（不除以假造值）。
    const percentage = hasHistory
        ? Math.min(currentWeight / (prevMax * 1.1 || 1), 1)
        : 1;

    // SVG 圓環參數
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage * circumference);

    const amberColor = "#F59E0B"; // 琥珀色

    return (
        <div className="relative flex flex-col items-center justify-center w-32 h-32 mx-auto">
            {/* --- 琥珀色衝擊波特效 (只在破 PR 時觸發) --- */}
            <AnimatePresence>
                {isPR && (
                    <>
                        {/* 產生多個擴散波紋 */}
                        {[...Array(3)].map((_, i) => (
                            <motion.div
                                key={`shockwave-${i}`}
                                initial={{ scale: 0.8, opacity: 0.8, borderColor: amberColor }}
                                animate={{
                                    scale: 2,
                                    opacity: 0,
                                    borderWidth: "1px"
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    delay: Math.min(i, 6) * 0.4, // 錯開波紋時間
                                    ease: "easeOut"
                                }}
                                className="absolute inset-0 rounded-full border-2 z-0"
                                style={{ borderColor: amberColor }}
                            />
                        ))}
                    </>
                )}
            </AnimatePresence>

            {/* --- 核心圓形量表 (SVG) --- */}
            <svg className="absolute inset-0 w-full h-full transform -rotate-90 z-10 overflow-visible">
                {/* 背景灰環 */}
                <circle
                    cx="64" cy="64" r={radius}
                    stroke="#44403C" strokeWidth="6" fill="none"
                    opacity="0.2"
                />
                {/* 進度亮環 */}
                <motion.circle
                    cx="64" cy="64" r={radius}
                    stroke={amberColor} strokeWidth="6" fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ filter: `drop-shadow(0 0 6px ${amberColor})` }} // 發光效果
                />
            </svg>

            {/* 中間文字顯示 */}
            <div className="relative z-20 text-center flex flex-col items-center">
                {isPR && <Trophy className="text-amber-400 w-4 h-4 mb-1 animate-bounce" />}
                <span className="text-2xl font-bold text-[#EEDC82] leading-none drop-shadow-md">{currentWeight}</span>
                <span className="text-[9px] text-stone-400 uppercase mt-1">Max KG</span>
                {isPR && <span className="text-[11px] text-amber-400 font-bold mt-1">+NEW PR!</span>}
            </div>
        </div>
    );
};

// ==========================================
// 3. 修復模式：StructuralAlignment (7天追蹤器)
// ==========================================
export const StructuralAlignment = ({ weeklyLogs }) => {
    // weeklyLogs 範例: [true, true, false, true, false, false, false] (週一到週日)
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const completedCount = weeklyLogs.filter(Boolean).length;
    const isConsistencyGood = completedCount >= 4; // 一週做4天以上為佳

    const activeColor = "#5A7A3A"; // 修復綠 (Emerald)
    const inactiveColor = "#292524"; // 深灰

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-3 text-xs">
                <span className="uppercase tracking-wider font-medium text-stone-500">Consistency</span>
                <span className={`${isConsistencyGood ? "text-emerald-600" : "text-stone-500"} font-mono font-bold`}>
                    {completedCount}/7 Days
                </span>
            </div>
            <div className="flex justify-between px-2">
                {weeklyLogs.map((isDone, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                        {/* 光點 */}
                        <motion.div
                            initial={false}
                            animate={{
                                backgroundColor: isDone ? activeColor : "#D1D1D1", // Modified for lighter theme background if needed
                                scale: isDone ? 1.2 : 1,
                                boxShadow: isDone ? `0 0 10px ${activeColor}80` : "none"
                            }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="w-3 h-3 rounded-full"
                        />
                        {/* 星期標示 */}
                        <span className={`text-[11px] font-medium ${isDone ? "text-stone-600" : "text-stone-400"}`}>
                            {days[i]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
