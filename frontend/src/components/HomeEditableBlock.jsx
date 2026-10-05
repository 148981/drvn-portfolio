// 🏠 HomeEditableBlock — 主頁卡牌的「長按編輯」外殼（Apple 桌面 icon 風格）
//
// - 長按（550ms）任意卡牌 → onLongPress()（主頁進入編輯模式，所有 block 開始抖動）
// - 編輯模式：卡牌抖動（jiggle）、右上角出現 ⊖ 移除鈕、內容點擊被攔截（不會誤導頁）
// - 非編輯模式：完全透明，不影響原本卡牌的任何互動

import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';

let jiggleStyleInjected = false;
const injectJiggleStyle = () => {
    if (jiggleStyleInjected || typeof document === 'undefined') return;
    jiggleStyleInjected = true;
    const el = document.createElement('style');
    el.textContent = `
@keyframes drvnJiggle {
  0%   { transform: rotate(-0.4deg); }
  50%  { transform: rotate(0.4deg); }
  100% { transform: rotate(-0.4deg); }
}
@keyframes drvnRemovePop {
  0% { transform: scale(0); opacity: 0; }
  70% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}`;
    document.head.appendChild(el);
};

const LONG_PRESS_MS = 550;
const MOVE_CANCEL_PX = 12;

export default function HomeEditableBlock({
    id,
    editMode = false,
    removable = true,
    onLongPress = () => {},
    onRemove = () => {},
    children,
    className = '',
    style = {},
}) {
    injectJiggleStyle();
    const timerRef = useRef(null);
    const startPosRef = useRef(null);

    const clear = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        startPosRef.current = null;
    }, []);

    const onStart = useCallback((x, y) => {
        if (editMode) return; // 已在編輯模式，長按不重複觸發
        startPosRef.current = { x, y };
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            // 🍎 原生長按質感：UIImpactFeedbackGenerator .rigid —
            //    與 iOS 桌面長按進入編輯模式相同的短促脆震（非綿長的 medium）
            try { haptic('rigid'); } catch (_) { /* 非 iOS */ }
            onLongPress();
        }, LONG_PRESS_MS);
    }, [editMode, onLongPress]);

    const onMove = useCallback((x, y) => {
        const s = startPosRef.current;
        if (!s) return;
        if (Math.abs(x - s.x) > MOVE_CANCEL_PX || Math.abs(y - s.y) > MOVE_CANCEL_PX) clear();
    }, [clear]);

    // 每個 block 用 id hash 給一點相位差，抖動不同步、更像 iOS 桌面
    const delay = (() => {
        let h = 0;
        for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 997;
        return -(h % 30) / 100; // -0.00s ~ -0.29s
    })();

    return (
        <div
            data-home-block={id}
            className={className}
            style={{
                position: 'relative',
                animation: editMode ? `drvnJiggle 0.3s ease-in-out infinite` : 'none',
                animationDelay: editMode ? `${delay}s` : '0s',
                ...style,
            }}
            onTouchStart={(e) => { const t = e.touches[0]; if (t) onStart(t.clientX, t.clientY); }}
            onTouchMove={(e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }}
            onTouchEnd={clear}
            onTouchCancel={clear}
            onMouseDown={(e) => onStart(e.clientX, e.clientY)}
            onMouseMove={(e) => onMove(e.clientX, e.clientY)}
            onMouseUp={clear}
            onMouseLeave={clear}
        >
            {children}

            {/* 編輯模式：透明攔截層（擋掉卡牌本身的點擊/導頁） */}
            {editMode && (
                <div
                    style={{ position: 'absolute', inset: 0, zIndex: 60, cursor: 'default', borderRadius: 24 }}
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onTouchEnd={(e) => { e.stopPropagation(); }}
                />
            )}

            {/* 編輯模式：右上角 ⊖ 移除鈕 */}
            {editMode && removable && (
                <motion.button {...pressProps('row')}
 aria-label={`移除卡牌 ${id}`}
 onClick={(e) => {
 e.stopPropagation(); e.preventDefault();
 try { haptic('light'); } catch (_) { /* ignore */ }
 onRemove(id);
 }}
 onTouchEnd={(e) => {
 e.stopPropagation(); e.preventDefault();
 try { haptic('light'); } catch (_) { /* ignore */ }
 onRemove(id);
 }}
 style={{
 position: 'absolute', top: -7, right: -5, zIndex: 70,
 width: 26, height: 26, borderRadius: '50%',
 background: 'rgba(22,20,21,0.92)',
 border: '1.5px solid rgba(255,255,255,0.85)',
 color: '#F6F4F1',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 fontSize: 17, fontWeight: 900, lineHeight: 1,
 boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
 animation: 'drvnRemovePop 0.25s ease-out both',
 cursor: 'pointer', padding: 0,
 }}
 >
                    −
                </motion.button>
            )}
        </div>
    );
}
