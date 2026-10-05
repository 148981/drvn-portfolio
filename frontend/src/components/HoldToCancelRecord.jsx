import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Trash2 } from 'lucide-react';
import { haptic } from '../utils/haptics';
import { confirmDialog } from '../utils/toast';

/**
 * HoldToCancelRecord — 「取消這筆紀錄」長按按鈕（結算頁共用）
 * ─────────────────────────────────────────────────────────────
 * 互動：長按 1.2 秒，外圈進度環跑滿 → 跳出確認對話框 → 確認才執行 onCancel。
 * 防誤觸：單點/短按無效；進度環中途放開即歸零。
 * 用法：
 *   <HoldToCancelRecord onCancel={async () => { ...刪除紀錄... }} />
 */
const HOLD_MS = 1200;
const R = 21;                       // 進度環半徑
const CIRC = 2 * Math.PI * R;

const HoldToCancelRecord = ({ onCancel, label = '長按取消紀錄', dark = false }) => {
    const [progress, setProgress] = useState(0); // 0..1
    const [busy, setBusy] = useState(false);
    const rafRef = useRef(null);
    const startRef = useRef(0);
    const doneRef = useRef(false);

    const stop = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (!doneRef.current) setProgress(0);
    }, []);

    const fire = useCallback(async () => {
        doneRef.current = true;
        haptic('heavy');
        const ok = await confirmDialog('確定要取消這筆紀錄嗎？資料將被刪除，無法復原。', { danger: true });
        doneRef.current = false;
        setProgress(0);
        if (!ok) return;
        setBusy(true);
        try { await onCancel?.(); } finally { setBusy(false); }
    }, [onCancel]);

    const begin = useCallback((e) => {
        if (busy || doneRef.current) return;
        e.preventDefault();
        haptic('light');
        startRef.current = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - startRef.current) / HOLD_MS);
            setProgress(p);
            if (p >= 1) { stop(); fire(); return; }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [busy, fire, stop]);

    const ink = dark ? 'rgba(246,244,241,0.55)' : 'rgba(22,20,21,0.45)';
    const ring = dark ? 'rgba(246,244,241,0.15)' : 'rgba(22,20,21,0.12)';

    return (
        <div className="flex flex-col items-center gap-2 select-none" style={{ touchAction: 'none' }}>
            <motion.button {...pressProps('row')}
 aria-label={label}
 onPointerDown={begin}
 onPointerUp={stop}
 onPointerLeave={stop}
 onPointerCancel={stop}
 onContextMenu={(e) => e.preventDefault()}
 disabled={busy}
 className="relative flex items-center justify-center"
 style={{ width: 52, height: 52, background: 'none', border: 'none', cursor: 'pointer', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
 >
                {/* 外圈進度環 */}
                <svg width="52" height="52" viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
                    <circle cx="26" cy="26" r={R} fill="none" stroke={ring} strokeWidth="2.5" />
                    <circle
                        cx="26" cy="26" r={R} fill="none"
                        stroke="#D94030" strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={CIRC * (1 - progress)}
                        style={{ transition: progress === 0 ? 'stroke-dashoffset 0.3s ease' : 'none' }}
                    />
                </svg>
                <Trash2 size={17} style={{ color: progress > 0 ? '#D94030' : ink, transition: 'color 0.2s' }} />
            </motion.button>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', color: ink }}>
                {busy ? '取消中…' : label}
            </span>
        </div>
    );
};

export default HoldToCancelRecord;
