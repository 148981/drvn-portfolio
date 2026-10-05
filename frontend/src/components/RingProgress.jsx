import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, animate } from 'framer-motion';

/**
 * Ring Progress Component for Plan View Header
 * Shows overall completion with week indicator in center
 * v2: SVG stroke-dashoffset 動畫進場 + 弧頭金色光暈 + 數字敘事浮現
 */
const RingProgress = ({ value, week, total, size = 80, strokeWidth = 8 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const targetOffset = circumference - (value / 100) * circumference;

    // SVG 動畫：從空圈 → 目標值
    const circleRef = useRef(null);
    const [labelVisible, setLabelVisible] = useState(false);

    useEffect(() => {
        const circle = circleRef.current;
        if (!circle) return;

        // 初始設定為空
        circle.style.strokeDashoffset = circumference;

        // 短暫延遲後開始動畫，讓頁面先渲染
        const timer = setTimeout(() => {
            circle.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
            circle.style.strokeDashoffset = targetOffset;

            // 數字在圓弧快完成時才浮現 (80% 時間點)
            const labelTimer = setTimeout(() => setLabelVisible(true), 960);
            return () => clearTimeout(labelTimer);
        }, 80);

        return () => clearTimeout(timer);
    }, [circumference, targetOffset]);

    // value 變化時更新動畫
    useEffect(() => {
        const circle = circleRef.current;
        if (!circle || !labelVisible) return;
        circle.style.transition = 'stroke-dashoffset 0.7s ease-out';
        circle.style.strokeDashoffset = targetOffset;
    }, [targetOffset, labelVisible]);

    const cx = size / 2;
    const cy = size / 2;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
                style={{ overflow: 'visible' }}
            >
                <defs>
                    {/* 弧頭光暈濾鏡 */}
                    <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Background ring */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="rgba(212, 197, 165, 0.1)"
                    strokeWidth={strokeWidth}
                />

                {/* Progress ring - 動畫主角 */}
                <circle
                    ref={circleRef}
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="#D4C5A5"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference}
                    strokeLinecap="round"
                    filter="url(#ring-glow)"
                    style={{
                        filter: 'drop-shadow(0 0 4px rgba(212,197,165,0.7)) drop-shadow(0 0 8px rgba(212,197,165,0.35))',
                    }}
                />
            </svg>

            {/* Center content - 數字延遲浮現 */}
            <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center"
                initial={{ opacity: 0, y: 6 }}
                animate={labelVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
            >
                <span className="text-[#D4C5A5] text-xs font-medium">Week</span>
                <span className="text-white text-2xl font-bold">{week}/{total}</span>
            </motion.div>
        </div>
    );
};

export default RingProgress;
