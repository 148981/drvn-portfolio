import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { brandColors as C } from '../utils/colors';

/**
 * ══════════════════════════════════════════════════════════════
 * NUTRITION DASHBOARD WIDGET — Swiss-Noir Edition
 * ══════════════════════════════════════════════════════════════
 * Hardware-grade arc gauge with precision dial ticks,
 * metallic gradients, and specular highlights.
 * ══════════════════════════════════════════════════════════════
 */

const NutritionDashboardWidget = ({
    caloriesIn = 0,
    caloriesOut = 0,
    calorieGoal = 2000,
    onLogMeal,
    className = ""
}) => {
    // 還沒記錄任何飲食 → 維持儀表質感的「待記錄」態（淡化弧線 + 精緻提示），而非滿是 0 的數字
    if (!caloriesIn && !caloriesOut) {
        return (
            <div className={`relative flex flex-col items-center w-full h-full ${className}`}>
                {/* 卡牌標題（與正常態一致） */}
                <div className="w-full mb-3 px-1 flex justify-between items-center">
                    <h3 className="font-black text-[#161415] text-[12px] tracking-[0.04em] opacity-40">營養</h3>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F95C4B]/40" />
                </div>

                <div className="relative w-full aspect-[1.7/1] flex flex-col items-center justify-end overflow-visible mt-2">
                    {/* 淡化的空弧線 — 保留儀表結構 */}
                    <svg viewBox="0 0 100 55" className="absolute top-0 w-full h-full overflow-visible">
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none" stroke="rgba(22,20,21,0.06)" strokeWidth="7" strokeLinecap="round"
                        />
                        {/* 極淡的 coral 起點，暗示「準備開始」 */}
                        <motion.circle
                            cx="10" cy="50" r="3.5" fill="#F95C4B"
                            initial={{ opacity: 0.2 }}
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    </svg>

                    {/* 中央提示 — 只保留一行小字 kicker */}
                    <motion.button {...pressProps('row')}
 onClick={onLogMeal}
 className="relative z-10 translate-y-1 flex flex-col items-center"
 style={{ background: 'none', border: 'none', cursor: onLogMeal ? 'pointer' : 'default', padding: 0 }}
 >
                        {/* 唯一的小字 kicker */}
                        <span
                            className="text-[#161415]/35"
                            style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.36em', }}
                        >
                            待記錄
                        </span>
                    </motion.button>
                </div>

                {/* 底部提示 — 緊接在上方，間距縮小 */}
                <div className="mt-4 w-full flex flex-col items-center gap-2">
                    <div style={{ width: 28, height: 1, background: 'rgba(249,92,75,0.5)' }} />
                    <div
                        className="text-[#F95C4B]"
                        style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.34em', }}
                    >
                        {onLogMeal ? '點此記錄' : '記錄第一餐'}
                    </div>
                </div>
            </div>
        );
    }

    // 核心計算邏輯
    const netCalories = Math.max(0, caloriesIn);
    const caloriesLeft = Math.max(0, calorieGoal - netCalories);
    const progressPct = Math.min(100, (netCalories / (calorieGoal || 1)) * 100);


    return (
        <div className={`relative flex flex-col items-center w-full h-full ${className}`}>
            {/* 卡牌標題 */}
            <div className="w-full mb-3 px-1 flex justify-between items-center">
                <h3 className="font-black text-[#161415] text-[12px] tracking-[0.04em] opacity-40">營養</h3>
                <div className="w-1.5 h-1.5 rounded-full bg-[#F95C4B] animate-pulse" />
            </div>

            {/* 儀表板核心區塊 */}
            <div className="relative w-full aspect-[2.2/1] flex flex-col items-center justify-end overflow-visible mt-2">

                {/* 左右側數據：IN & OUT */}
                {/* IN / OUT 原本是 7.5px 的英文縮寫 —— 中文使用者要先翻譯才知道
                    哪個是吃進去、哪個是燒掉的。改成中文 + 11px 下限。 */}
                <div className="absolute top-[110%] w-full flex justify-between px-1 pointer-events-none z-10">
                    <div className="text-left flex flex-col items-start text-[#161415]">
                        <div className="text-[11px] font-medium opacity-45 mb-0.5">吃進</div>
                        <p className="text-[17px] font-light leading-none tabular-nums" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                            {Math.round(caloriesIn)}
                        </p>
                    </div>
                    <div className="text-right flex flex-col items-end text-[#161415]">
                        <div className="text-[11px] font-medium opacity-45 mb-0.5">消耗</div>
                        <p className="text-[17px] font-light leading-none tabular-nums" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                            {Math.round(caloriesOut)}
                        </p>
                    </div>
                </div>

                {/* SVG 弧線 */}
                <svg viewBox="0 0 100 55" className="absolute top-0 w-full h-full overflow-visible">
                    <defs>
                        {/* Metallic Coral Gradient */}
                        <linearGradient id="nutriArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#FF7A6B" />
                            <stop offset="45%" stopColor={C.coral} />
                            <stop offset="55%" stopColor={C.coralDeep} />
                            <stop offset="100%" stopColor="#FF7A6B" />
                        </linearGradient>

                        {/* Titanium Specular Sheen */}
                        <linearGradient id="titaniumSpecular" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                            <stop offset="50%" stopColor="rgba(255,255,255,0.4)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                    </defs>

                    {/* Track */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none" stroke="rgba(22,20,21,0.06)" strokeWidth="7" strokeLinecap="round"
                    />

                    {/* Progress */}
                    <motion.path
                        initial={{ strokeDashoffset: 125.6 }}
                        animate={{ strokeDashoffset: 125.6 - (125.6 * (progressPct / 100)) }}
                        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none" stroke="url(#nutriArcGrad)" strokeWidth="7" strokeLinecap="round"
                        strokeDasharray="125.6"
                        style={{ filter: 'drop-shadow(0 2px 5px rgba(249,92,75,0.15))' }}
                    />

                    {/* Specular Edge Highlight */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" strokeLinecap="round"
                        transform="translate(0, -0.5)"
                    />
                </svg>

                {/* 中央淨熱量 (NET) */}
                <div className="text-center relative z-10 translate-y-3">
                    <span className="text-[32px] font-light tracking-tight text-[#161415] leading-none tabular-nums" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                        {Math.round(netCalories)}
                    </span>
                    <p className="text-[11px] font-medium text-black/35 mt-1">
                        已攝取 kcal
                    </p>
                </div>
            </div>

            {/* 底部剩餘熱量提示 —— 原本寫英文 "left to eat"，
                這是整張卡最重要的一句話（他還可以吃多少），不該讓人翻譯。 */}
            <div className="mt-16 text-center w-full">
                <div
                    className="text-[12px] font-bold text-[#F95C4B] bg-[#F95C4B]/6 px-4 py-2 rounded-full inline-block border border-[#F95C4B]/10"
                    style={{ letterSpacing: '0.02em' }}
                >
                    {caloriesIn > calorieGoal ? `超過目標 ${Math.round(caloriesIn - calorieGoal)} kcal` : `距目標 ${Math.round(caloriesLeft)} kcal`}
                </div>
            </div>
        </div>
    );
};

export default NutritionDashboardWidget;
