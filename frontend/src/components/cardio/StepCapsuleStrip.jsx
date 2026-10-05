import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * 💊 StepCapsuleStrip — Plan 進度膠囊條
 *
 * 設計哲學：跑者喘氣中眼角餘光一掃就能掌握全局，不需要讀「第 4 趟 / 共 8 趟」這種文字。
 *   - 一個膠囊 = 一個 step
 *   - 已完成的 step：100% 填色（暖色 = 高強度、冷色 = 低強度）
 *   - 進行中的 step：依 stepRemaining/duration 動態填色 + 微脈動
 *   - 未來的 step：暗灰，不搶注意力
 *
 * 自動降級：
 *   - steps > 8（例：hill 8 趟）時 gap 縮為 1px、容器內距縮為 2px，避免擠成肉條
 *   - steps > 14 時直接 fallback 為一條總進度條
 *
 * @param {Array}    steps         — activePlan.steps
 * @param {number}   currentIndex  — 當前 step index
 * @param {number}   stepRemaining — 當前 step 剩餘秒數
 * @param {number}   currentPace   — 當前配速
 * @param {string}   [className]   — 外層額外 className
 */
const StepCapsuleStrip = ({ steps = [], currentIndex = 0, stepRemaining = 0, currentPace = 0, className = '' }) => {
    const safeSteps = Array.isArray(steps) ? steps : [];
    const total = safeSteps.length;

    // ⛽ 太多 step 時降階為單一進度條 — 寧可少資訊也不要視覺爆炸
    const useSingleBar = total > 14;
    const dense = total > 8;

    // 🎨 依 targetPace 對應膠囊填色（pace 數值越小 = 越快 = 越紅；越大 = 越慢 = 越藍）
    const colorForStep = (step) => {
        const p = step?.targetPace;
        if (!p || p <= 0) return '#9CA3AF';
        if (p < 280) return '#EB4213';  // 衝刺 — Red
        if (p < 360) return '#F95C4B';  // 快速 — Coral
        if (p < 440) return '#FF99DC';  // 巡航 — Pink
        if (p < 540) return '#D8F382';  // 輕鬆 — Light Green
        return '#A5C4FF';                // 緩走 — Soft Blue
    };

    // 依據圖一配速數字邏輯，動態顯示當前狀態顏色
    const paceColor = (current, target) => {
        if (!current || current <= 0 || !target || target <= 0) return '#C8CCD0'; // 鈦金屬
        const diff = current - target;
        if (diff > 15) return '#FF3D00'; // 橘紅 (太慢)
        if (diff < -15) return '#7FB4E3'; // 冰川藍 (太快)
        return '#3FA787'; // 質感綠 (Perfect)
    };

    // 🧮 把 plan 化成總進度百分比（only for useSingleBar fallback）
    const overallPercent = useMemo(() => {
        if (!total) return 0;
        const completedRatio = currentIndex / total;
        const curStep = safeSteps[currentIndex];
        const curDuration = curStep?.duration || 0;
        const curFraction = curDuration > 0
            ? Math.max(0, Math.min(1, 1 - stepRemaining / curDuration))
            : 0;
        return Math.min(100, (completedRatio + curFraction / total) * 100);
    }, [safeSteps, currentIndex, stepRemaining, total]);

    if (!total) return null;

    // 🚧 Fallback：一條總進度條
    if (useSingleBar) {
        return (
            <div className={`w-full px-4 pt-1 ${className}`} aria-label="Plan progress">
                <div className="relative w-full h-[3px] bg-white/15 rounded-full overflow-hidden">
                    <motion.div
                        className="absolute left-0 top-0 bottom-0 rounded-full"
                        style={{ background: '#F95C4B' }}
                        animate={{ width: `${overallPercent}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                </div>
                <div className="text-[9px] font-bold tracking-widest text-white/40 mt-1 text-center uppercase">
                    Step {currentIndex + 1} / {total}
                </div>
            </div>
        );
    }

    return (
        <div
            className={`w-full ${className}`}
            style={{ paddingLeft: dense ? 8 : 12, paddingRight: dense ? 8 : 12 }}
            aria-label="Plan step capsules"
        >
            {/* 📊 整體進度 % — 讓最上方藍色膠囊條一眼看出總進度 */}
            <div className="flex justify-end mb-1">
                <span className="text-[9px] font-black tracking-widest uppercase share-tech-mono" style={{ color: 'rgba(22, 20, 21, 0.7)' }}>
                    {Math.round(overallPercent)}%
                </span>
            </div>
            <div
                className="flex items-center"
                style={{ gap: dense ? 2 : 4 }}
            >
                {safeSteps.map((step, idx) => {
                    const isPast = idx < currentIndex;
                    const isCurrent = idx === currentIndex;
                    const stepDuration = step?.duration || 1;
                    const fillRatio = isPast
                        ? 1
                        : isCurrent
                            ? Math.max(0, Math.min(1, 1 - stepRemaining / stepDuration))
                            : 0;
                    const baseColor = colorForStep(step);
                    const color = isCurrent ? paceColor(currentPace, step.targetPace) : baseColor;

                    return (
                        <div
                            key={`cap-${idx}`}
                            className="relative flex-1 rounded-full overflow-hidden"
                            style={{
                                height: dense ? 3 : 4,
                                background: 'linear-gradient(to bottom, rgba(200,204,208,0.35) 0%, rgba(150,154,160,0.15) 100%)', // 鈦金屬材質
                                border: '1px solid rgba(255,255,255,0.15)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 1px rgba(255,255,255,0.1)'
                            }}
                        >
                            {/* 填色層 */}
                            <motion.div
                                className="absolute left-0 top-0 bottom-0 rounded-full"
                                style={{ background: color }}
                                animate={{ width: `${fillRatio * 100}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                            {/* 進行中時加上微脈動光暈 — 用 opacity 動畫，避免性能負擔 */}
                            {isCurrent && (
                                <motion.div
                                    className="absolute inset-0 rounded-full"
                                    style={{ background: color, mixBlendMode: 'screen' }}
                                    animate={{ opacity: [0.0, 0.45, 0.0] }}
                                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default StepCapsuleStrip;
