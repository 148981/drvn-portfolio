import React, { useEffect, useRef, useState } from 'react';

/**
 * CountUp — 大 metric 進場數字動畫（規範 §6.5）
 * 0 → 值、0.9s、house easing、tabular-nums 防跳動。
 * 尊重 prefers-reduced-motion（直接顯示終值）。
 * 禁止用於數值「更新」場合（更新用上滑換位，見 §6.5）。
 */
const houseEase = (p) => 1 - Math.pow(1 - p, 4); // ≈ cubic-bezier(0.16,1,0.3,1)

const CountUp = ({ value, decimals = 0, duration = 900, className, style }) => {
    const end = parseFloat(value) || 0;
    const reduced = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const [display, setDisplay] = useState(reduced ? end : 0);
    const raf = useRef(null);

    useEffect(() => {
        if (reduced) { setDisplay(end); return; }
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            setDisplay(end * houseEase(p));
            if (p < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [end, duration, reduced]);

    return (
        <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
            {display.toFixed(decimals)}
        </span>
    );
};

export default CountUp;
