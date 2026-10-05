/**
 * MemoryKit — 健身房記憶／跑步記憶共用的版面零件（FINAL DRVN design system）
 * ─────────────────────────────────────────────────────────────
 * 版面由上到下：
 *   深色拉絲鈦牆（照片本身是表面＋深漬，後面一盞暖色氛圍燈）
 *     ├ 總數：大的細數字＋小單位（進場 count-up）
 *     └ 液態玻璃卡浮在牆上（拉絲透過玻璃糊成柔焦反光 —— 硬金屬對軟玻璃）
 *       卡內用方角硬線切三欄（圓殼撞直線）
 *   → 地圖（圖像層；圖例用 Liquid Glass 浮在上面）
 *   → 冷色 Mist 底上的髮絲線清單（次要的內容退到冷色後面）
 * 珊瑚一頁只用一次，由頁面自己決定用在哪（深色上用 Ember）。
 * 圓角只用六階：12 / 18 / 24 / 28 / 36 / 999。
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { PRESS_SCALE, PRESS_SPRING, riseIn } from '../../utils/nutritionMotion';
import haptic from '../../utils/haptics';
import darkBrush from '../../assets/titanium-dark-brushed.jpeg';

export const INK = '#161415';
export const PAPER = '#F6F4F1';
export const MIST = '#E8E9E6';
export const PEBBLE = '#CFC6B8';
export const CORAL = '#F95C4B';
export const EMBER = '#D94030';
export const MUTED = 'rgba(22,20,21,0.45)';
export const FAINT = 'rgba(22,20,21,0.40)';
export const HAIR = 'rgba(22,20,21,0.08)';
const ON_DARK = 'rgba(246,244,241,0.66)';     // 深色上的次要字：≥ 50% 才過 AA
const ON_DARK_RULE = 'rgba(207,198,184,0.30)';

/** 按壓：只縮放，不蓋掉進場動畫的 easing */
const tap = (size) => ({ whileTap: { scale: PRESS_SCALE[size] ?? PRESS_SCALE.row, transition: PRESS_SPRING } });

/** 大數字進場 count-up（0.9s，house easing）；之後數字變動直接換，不重跑 */
function useCountUp(target, decimals = 0) {
    const reduce = useReducedMotion();
    const done = useRef(false);
    const [v, setV] = useState(() => (reduce ? target : 0));
    useEffect(() => {
        if (reduce || done.current || !Number.isFinite(target)) { setV(target); return undefined; }
        let raf;
        const t0 = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 4);
        const tick = (now) => {
            const t = Math.min(1, (now - t0) / 900);
            setV(target * ease(t));
            if (t < 1) raf = requestAnimationFrame(tick); else done.current = true;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, reduce]);
    return Number(v || 0).toFixed(decimals);
}

/**
 * 地圖一開就把所有點（和路線）框進來。
 * ⚠️ 容器掛載那一刻常常是 0 寬（進場動畫），MapAutoResize 之後用 pan:false 修尺寸，
 *    會把中心留在左上 —— 點全部擠到左邊。所以每次尺寸一變就重框一次，
 *    直到使用者自己拖或縮放地圖為止（那之後不再搶鏡頭）。
 */
export function FitToPoints({ points = [], maxZoom = 15, bottomPad = 64 }) {
    const map = useMap();
    useEffect(() => {
        const pts = points.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
        if (!pts.length) return undefined;
        let touched = false;
        const el = map.getContainer();
        const fit = () => {
            if (touched) return;
            try {
                if (!el.clientWidth || !el.clientHeight) return;
                map.invalidateSize({ animate: false, pan: false });
                if (pts.length === 1) map.setView(pts[0], maxZoom, { animate: false });
                else map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [28, 28], paddingBottomRight: [28, bottomPad], maxZoom, animate: false });   // 底部預設留給左下的圖例
            } catch { /* 地圖已卸載 */ }
        };
        const markTouched = () => { touched = true; };
        map.on('resize', fit);
        el.addEventListener('pointerdown', markTouched, { passive: true });
        el.addEventListener('wheel', markTouched, { passive: true });
        const timers = [0, 250, 700, 1400].map((ms) => setTimeout(fit, ms));
        return () => {
            map.off('resize', fit);
            el.removeEventListener('pointerdown', markTouched);
            el.removeEventListener('wheel', markTouched);
            timers.forEach(clearTimeout);
        };
    }, [map, points, maxZoom, bottomPad]);
    return null;
}

/** 地圖上的點：實心＝主要、空心＝其他、珊瑚＝這一頁的焦點 */
export const dotIcon = (kind = 'solid') => L.divIcon({
    className: '',
    html: kind === 'hollow'
        ? `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid ${INK};box-shadow:0 3px 8px rgba(0,0,0,.2)"></div>`
        : `<div style="width:16px;height:16px;border-radius:50%;background:${kind === 'coral' ? CORAL : INK};border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.25)"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
});

/** 地圖外框（圖像層）＋ Liquid Glass 圖例浮在左下 */
export function MapFrame({ children, legend = [], height = 200, radius = 24, gap = 16 }) {
    return (
        <motion.div {...riseIn(2)} style={{ position: 'relative', height, borderRadius: radius, overflow: 'hidden', marginBottom: gap, border: `1px solid ${HAIR}`, isolation: 'isolate' }}>
            {children}
            {legend.length > 0 && (
                <div className="lg-glass lg-glass--frost" style={{
                    position: 'absolute', left: 12, bottom: 12, zIndex: 500, pointerEvents: 'none',
                    display: 'flex', gap: 12, alignItems: 'center', padding: '7px 12px', borderRadius: 999,
                }}>
                    {legend.map((l) => (
                        <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: INK }}>
                            <span style={{ width: 9, height: 9, borderRadius: 99, flexShrink: 0, ...l.swatch }} />{l.label}
                        </span>
                    ))}
                </div>
            )}
        </motion.div>
    );
}


/**
 * 深色拉絲鈦牆：平的深色底 → 鈦（final §4.5）。照片是 import 進來的，iOS 單檔打包會一起內嵌。
 * ambient：warm（回顧／記錄）｜ cool ｜ coral ｜ null 關掉。一個場景只有一盞。
 */
export function DarkWall({ children, ambient = 'warm' }) {
    return (
        <motion.section {...riseIn(0)} className="ti-surface-dark ti-brushed-dark"
            style={{ '--ti-brush-dark-img': `url(${darkBrush})`, overflow: 'hidden', borderRadius: 28, padding: '22px 16px 16px', marginBottom: 16 }}>
            {ambient && <div aria-hidden className={`ti-ambient${ambient === 'coral' ? '' : ` ti-ambient--${ambient}`}`} />}
            <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
        </motion.section>
    );
}

/**
 * 牆上的主數字：英文小標（字距拉開）→ 大的細數字＋小單位 → 方角硬線 → 一行補充。
 * accent＝數字用 Ember（深色上的珊瑚），這頁的焦點就在這。
 */
export function WallHero({ kicker, meta, value, decimals = 0, unit, footLabel, footValue, accent = false }) {
    const shown = useCountUp(Number(value) || 0, decimals);
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: ON_DARK }}>{kicker}</span>
                {meta && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: ON_DARK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{meta}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
                <span style={{ fontSize: 76, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', color: accent ? EMBER : PAPER }}>{shown}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: ON_DARK }}>{unit}</span>
            </div>
            {footValue && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 18, paddingTop: 12, borderTop: `1.5px solid ${ON_DARK_RULE}`, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: ON_DARK, flexShrink: 0 }}>{footLabel}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: PAPER, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{footValue}</span>
                </div>
            )}
        </div>
    );
}

/** 牆上一組玻璃卡的標題列 */
export function WallLabel({ title, meta }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', margin: '24px 2px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: ON_DARK }}>{title}</span>
            {meta && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: ON_DARK, fontVariantNumeric: 'tabular-nums' }}>{meta}</span>}
        </div>
    );
}

/** 液態玻璃卡（浮在深鈦牆上）：名稱 → 方角硬線 → 三欄（小標在上、細數字在下） */
export function GlassCard({ title, cols = [], index = 0, onClick }) {
    return (
        <motion.button {...riseIn(Math.min(index + 1, 6))} {...tap('card')}
            onClick={() => { haptic('light'); onClick?.(); }}
            className="lg-glass lg-glass--ondark"
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 18, padding: '15px 16px 14px', marginBottom: 10, cursor: 'pointer', textAlign: 'left', display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: PAPER, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                <ChevronRight size={18} color={ON_DARK} style={{ flexShrink: 0 }} />
            </div>
            <div style={{ height: 1.5, background: ON_DARK_RULE, margin: '12px 0 10px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                {cols.map((c, i) => (
                    <div key={c.label} style={{ minWidth: 0, paddingLeft: i ? 12 : 0, borderLeft: i ? `1px solid ${ON_DARK_RULE}` : 'none' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: ON_DARK }}>{c.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: PAPER, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</div>
                    </div>
                ))}
            </div>
        </motion.button>
    );
}

/** 方角硬線＋三欄資料（淺色詳情頁用） */
export function StatCols({ cols = [], size = 19, rule = '12px 0 10px' }) {
    return (
        <>
            <div style={{ height: 1.5, background: PEBBLE, margin: rule }} />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                {cols.map((c, i) => (
                    <div key={c.label} style={{ minWidth: 0, paddingLeft: i ? 12 : 0, borderLeft: i ? `1px solid rgba(207,198,184,0.7)` : 'none' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: FAINT }}>{c.label}</div>
                        <div style={{ fontSize: size, fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</div>
                    </div>
                ))}
            </div>
        </>
    );
}

/** 次要清單：冷色 Mist 底（退到後面）＋髮絲線分隔，不裝盒子 */
export function HairlineList({ title, items = [] }) {
    if (!items.length) return null;
    return (
        <motion.section {...riseIn(3)} style={{ background: MIST, borderRadius: 28, padding: '16px 18px 4px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: FAINT, margin: '0 0 2px' }}>{title}</div>
            {items.map((it, i) => (
                <motion.button key={it.key} {...tap('row')} onClick={() => { haptic('light'); it.onClick?.(); }}
                    style={{
                        width: '100%', minHeight: 64, padding: '12px 0', border: 'none', borderBottom: i < items.length - 1 ? `1px solid rgba(22,20,21,0.09)` : 'none',
                        background: 'none', color: INK, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</span>
                    </span>
                    <ChevronRight size={18} color={FAINT} style={{ flexShrink: 0 }} />
                </motion.button>
            ))}
        </motion.section>
    );
}

/** 頁首：返回鍵＋細字大標題（一頁一個） */
export function PageHead({ title, onBack }) {
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <motion.button {...tap('icon')} onClick={() => { haptic('light'); onBack(); }} aria-label="返回"
                    style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </motion.button>
            </div>
            <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 20 }}>{title}</div>
        </>
    );
}

export const PAGE_STYLE = {
    maxWidth: 440, marginInline: 'auto', boxSizing: 'border-box',
    padding: 'calc(12px + env(safe-area-inset-top)) 20px calc(96px + env(safe-area-inset-bottom))',
};

/** 忘記／刪除：文字用淡墨，紅色留給確認視窗 —— 詳情頁的焦點不被危險鍵搶走 */
export const quietDangerStyle = {
    minHeight: 48, borderRadius: 18, border: `1px solid ${HAIR}`, background: 'none',
    color: 'rgba(22,20,21,0.62)', fontSize: 14, fontWeight: 800, cursor: 'pointer',
};
