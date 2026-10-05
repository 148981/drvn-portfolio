/**
 * SwissMoment.jsx — 滿版瑞士極簡儀式感時刻 v2（多巴胺主題版）
 * ═══════════════════════════════════════════════════════════
 * 監聽 momentEngine 的 drvn:moment 事件，任何頁面都能觸發。
 *
 * v2 依回饋升級：
 *   🎨 主題色面（payload.theme）：mist/pebble 交替、coral/ember 多巴胺滿版、
 *      sage/slate/gold 對齊最新動態卡的種類配色 —— 告別單調全黑。
 *   🎬 字體動畫：逐段 spring 彈跳進場（stagger）、accent 關鍵詞
 *      額外 overshoot pop＋色暈；kicker 短劃由 0 長出。
 *   📳 雙段震動：出場 medium → 關鍵詞 pop 瞬間 heavy → 點掉 light。
 *
 * 佇列化：連續觸發不疊圖，一次一則；收場後廣播 drvn:moment-idle
 * 讓首開簡報等開屏彈窗排隊。
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MOMENT_EVENT } from '../utils/momentEngine';
import { haptic } from '../utils/haptics';

const EASE = [0.16, 1, 0.3, 1];

/* ♿️ 系統要求減少動態時，儀式只留「內容」，不留「動作」。
   注意是「跳過動畫」不是「跳過時刻」—— 把整則靜音，使用者就再也
   看不到計劃成立、破紀錄這些事發生過了。 */
const reduceMotion = () => {
    try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; }
    catch { return false; }
};

/* ── ⌨️ 打字機節奏參數 ─────────────────────────────────────── */
const CHAR_STAGGER = 0.034;   // 每個字之間的間隔（秒）
const TYPE_BASE_DELAY = 0.26; // 第一個字出現前的等待

/* 🔢 數字步進累加：從 0 一路加到目標值（取代突兀的直接跳出） */
const CountUp = ({ target, delay, duration }) => {
    const [val, setVal] = useState(() => (reduceMotion() ? target : 0));
    useEffect(() => {
        if (reduceMotion()) { setVal(target); return undefined; }
        const n = parseFloat(target);
        if (!isFinite(n)) { setVal(target); return undefined; }
        const decimals = (String(target).split('.')[1] || '').length;
        const ctrl = animate(0, n, {
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (v) => setVal(decimals ? v.toFixed(decimals) : Math.round(v)),
        });
        return () => ctrl.stop();
    }, [target, delay, duration]);
    // tabular-nums：累加時每個位數等寬，數字跳動不會左右晃
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{val}</span>;
};

// 🎨 主題表：bg / dim(弱字) / main(主字) / accent(關鍵詞) / glow(氛圍光暈)
//    v3 換上「Bright, Vibrant & Fun」多巴胺六色（Rosehip/Brick/Viola/
//    Sunshine/Apple/Clear Day）——淺色面一律 ink 主字 + Brick 關鍵詞
//   （藍配橘、綠配橘的互補撞色正是多巴胺精神）；Brick 滿版反轉用紙白＋墨。
const THEMES = {
    rosehip:  { bg: '#F6C3AE', dim: 'rgba(22,20,21,0.48)',  main: '#161415', accent: '#F0743E', glow: 'rgba(240,116,62,0.30)', kick: 'rgba(22,20,21,0.48)' },
    brick:    { bg: '#F0743E', dim: 'rgba(246,244,241,0.66)', main: '#F6F4F1', accent: '#161415', glow: 'rgba(255,255,255,0.28)', kick: 'rgba(246,244,241,0.62)' },
    viola:    { bg: '#CDBCDB', dim: 'rgba(22,20,21,0.48)',  main: '#161415', accent: '#F0743E', glow: 'rgba(240,116,62,0.24)', kick: 'rgba(22,20,21,0.48)' },
    sunshine: { bg: '#FDD848', dim: 'rgba(22,20,21,0.5)',   main: '#161415', accent: '#F0743E', glow: 'rgba(240,116,62,0.28)', kick: 'rgba(22,20,21,0.5)' },
    apple:    { bg: '#AAD59E', dim: 'rgba(22,20,21,0.5)',   main: '#161415', accent: '#F0743E', glow: 'rgba(240,116,62,0.24)', kick: 'rgba(22,20,21,0.5)' },
    clearday: { bg: '#9AB2D4', dim: 'rgba(22,20,21,0.5)',   main: '#161415', accent: '#F0743E', glow: 'rgba(240,116,62,0.26)', kick: 'rgba(22,20,21,0.5)' },
    // 品牌基底（保留相容）
    mist:   { bg: '#E8E9E6', dim: 'rgba(22,20,21,0.42)',  main: '#161415', accent: '#F95C4B', glow: 'rgba(249,92,75,0.20)',  kick: 'rgba(22,20,21,0.45)' },
    pebble: { bg: '#CFC6B8', dim: 'rgba(22,20,21,0.48)',  main: '#161415', accent: '#D8331C', glow: 'rgba(216,51,28,0.16)',  kick: 'rgba(22,20,21,0.48)' },
    coral:  { bg: '#F95C4B', dim: 'rgba(246,244,241,0.62)', main: '#F6F4F1', accent: '#161415', glow: 'rgba(255,255,255,0.24)', kick: 'rgba(246,244,241,0.6)' },
    ember:  { bg: '#D94030', dim: 'rgba(246,244,241,0.6)',  main: '#F6F4F1', accent: '#161415', glow: 'rgba(255,255,255,0.22)', kick: 'rgba(246,244,241,0.6)' },
    sage:   { bg: '#8F9E8B', dim: 'rgba(246,244,241,0.62)', main: '#F6F4F1', accent: '#161415', glow: 'rgba(22,20,21,0.16)',  kick: 'rgba(246,244,241,0.6)' },
    slate:  { bg: '#8B9DAB', dim: 'rgba(246,244,241,0.62)', main: '#F6F4F1', accent: '#161415', glow: 'rgba(22,20,21,0.16)',  kick: 'rgba(246,244,241,0.6)' },
    gold:   { bg: '#D4C5A5', dim: 'rgba(22,20,21,0.45)',  main: '#161415', accent: '#D8331C', glow: 'rgba(216,51,28,0.14)',  kick: 'rgba(22,20,21,0.48)' },
    night:  { bg: '#121110', dim: 'rgba(246,244,241,0.42)', main: '#F6F4F1', accent: '#F95C4B', glow: 'rgba(249,92,75,0.20)', kick: 'rgba(246,244,241,0.45)' },
};

const SwissMoment = () => {
    const navigate = useNavigate();
    const [current, setCurrent] = useState(null);
    const queue = useRef([]);
    const timer = useRef(null);
    const popTimer = useRef(null);

    const showNext = () => {
        const next = queue.current.shift();
        if (!next) { setCurrent(null); return; }
        setCurrent(next);
        try { haptic('medium'); } catch { /* */ }
        // ⌨️ 打字機需要的總時長（依字數估）→ 震動、收場時間都跟著字數走
        const chars = (next.parts || []).reduce((s, [t]) => s + String(t).length, 0);
        const typeMs = reduceMotion() ? 0 : Math.min(1500, Math.round(chars * CHAR_STAGGER * 1000));
        // 📳 第二段震動：對準打字進行到 accent 關鍵詞的區段（約 55% 處）
        clearTimeout(popTimer.current);
        popTimer.current = setTimeout(() => { try { haptic('heavy'); } catch { /* */ } }, TYPE_BASE_DELAY * 1000 + typeMs * 0.55);
        clearTimeout(timer.current);
        // ★ 有行動按鈕的時刻不自動關 —— 那是要使用者做決定的，不是看過就算
        if (next.cta?.label) return;
        // hold 依打字時長自動延長，確保打完後仍有完整閱讀時間
        timer.current = setTimeout(dismiss, (next.holdMs || 2600) + Math.round(typeMs * 0.8));
    };
    const dismiss = () => {
        clearTimeout(timer.current);
        clearTimeout(popTimer.current);
        try { haptic('light'); } catch { /* */ }
        setCurrent(null);
        // 收場動畫後接下一則；佇列清空 → 清旗標 + 廣播 idle（首開簡報等此訊號）
        setTimeout(() => {
            if (queue.current.length) { showNext(); return; }
            try {
                window.__drvnMomentActive = false;
                window.dispatchEvent(new CustomEvent('drvn:moment-idle'));
            } catch { /* */ }
        }, 420);
    };

    useEffect(() => {
        const h = (e) => {
            const p = e.detail;
            if (!p || !Array.isArray(p.parts)) return;
            queue.current.push(p);
            if (!current && queue.current.length === 1) showNext();
        };
        window.addEventListener(MOMENT_EVENT, h);
        return () => {
            window.removeEventListener(MOMENT_EVENT, h);
            clearTimeout(timer.current); clearTimeout(popTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    /** 行動時刻：按下按鈕 → 收掉這一則並導到指定路徑／發出事件 */
    const handleCta = (m) => {
        try { haptic('medium'); } catch { /* */ }
        const cta = m?.cta || {};
        dismiss();
        setTimeout(() => {
            try {
                if (cta.event) window.dispatchEvent(new CustomEvent(cta.event, { detail: cta.detail || null }));
                if (cta.to) navigate(cta.to, cta.state ? { state: cta.state } : undefined);
            } catch (err) { console.warn('[moment] CTA 失敗:', err?.message); }
        }, 380);
    };

    const T = THEMES[current?.theme] || THEMES.night;
    const RM = reduceMotion();

    return createPortal(
        <AnimatePresence>
            {current && (
                <motion.div
                    key="swiss-moment"
                    initial={RM ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: RM ? 0 : 0.38 } }}
                    transition={{ duration: RM ? 0 : 0.4, ease: EASE }}
                    onClick={dismiss}
                    role="status"
                    style={{
                        position: 'fixed', inset: 0, zIndex: 2147483640,
                        /* 裡面那顆 380px 的氛圍光暈是 right:-18%，沒有 overflow 會伸出畫面，
                           在手機上可能把整頁推出一條橫向捲動。 */
                        overflow: 'hidden',
                        background: T.bg,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        padding: '0 34px',
                        cursor: 'pointer',
                        paddingTop: 'env(safe-area-inset-top, 0px)',
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    {/* 氛圍光暈：呼吸縮放（單一光源）。減少動態 → 靜止不呼吸 */}
                    <motion.div
                        aria-hidden
                        initial={RM ? false : { scale: 0.5, opacity: 0 }}
                        animate={RM ? { scale: 1, opacity: 1 } : { scale: [0.9, 1.06, 0.98], opacity: 1 }}
                        transition={RM ? { duration: 0 } : { scale: { duration: 3.2, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }, opacity: { duration: 0.8 } }}
                        style={{
                            position: 'absolute', top: '14%', right: '-18%',
                            width: 380, height: 380, borderRadius: '50%',
                            background: `radial-gradient(circle, ${T.glow} 0%, transparent 62%)`,
                            pointerEvents: 'none',
                        }}
                    />

                    {/* kicker：短劃由 0 長出 + 文字滑入 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
                        <motion.span
                            aria-hidden
                            initial={RM ? false : { width: 0 }}
                            animate={{ width: 22 }}
                            transition={RM ? { duration: 0 } : { delay: 0.18, duration: 0.5, ease: EASE }}
                            style={{ height: 2, background: T.accent, display: 'inline-block' }}
                        />
                        <motion.span
                            initial={RM ? false : { opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={RM ? { duration: 0 } : { delay: 0.22, duration: 0.55, ease: EASE }}
                            style={{
                                fontSize: 9, fontWeight: 900, letterSpacing: '0.34em',
                                textTransform: 'uppercase', color: T.kick,
                            }}
                        >
                            {current.kicker || 'DRVN'}
                        </motion.span>
                    </div>

                    {/* 滿版敘事大字：⌨️ 打字機逐字蹦出（spring）＋ 🔢 數字步進累加 */}
                    <p style={{
                        margin: 0, fontSize: 44, fontWeight: 300,
                        letterSpacing: '-0.02em', lineHeight: 1.3,
                        fontFamily: '"Manrope", "Noto Sans TC", sans-serif',
                    }}>
                        {(() => {
                            let seq = 0; // 全域字序：跨 parts 連續計數，打字節奏才會一致
                            return current.parts.map(([text, tone], i) => {
                                const isAccent = tone === 'accent' || tone === 'coral';
                                const color = isAccent ? T.accent : (tone === 'dim' ? T.dim : T.main);
                                const weight = isAccent ? 500 : (tone === 'dim' ? 300 : 400);
                                // 先把數字整段抓出來（"14 天" → ["14", " 天"]）：
                                // 數字 → CountUp 步進累加；其餘 → 逐字彈出
                                const tokens = String(text).split(/(\d+(?:\.\d+)?)/).filter(t => t !== '');
                                return (
                                    <span key={i} style={{ color, fontWeight: weight, textShadow: isAccent ? `0 0 26px ${T.glow}` : 'none' }}>
                                        {/* ♿️ 減少動態：不逐字彈跳，整段一次顯示（換行照樣要斷） */}
                                        {RM && String(text).split('\n').map((ln, j) => (
                                            <React.Fragment key={j}>{j > 0 && <br />}{ln}</React.Fragment>
                                        ))}
                                        {!RM && tokens.map((tk, j) => {
                                            if (/^\d+(?:\.\d+)?$/.test(tk)) {
                                                const d = TYPE_BASE_DELAY + seq * CHAR_STAGGER;
                                                seq += tk.length;
                                                // 累加時長隨位數放大（大數字加久一點，更有份量感）
                                                const dur = Math.min(1.3, 0.45 + tk.replace('.', '').length * 0.22);
                                                return (
                                                    <motion.span
                                                        key={j}
                                                        initial={{ opacity: 0, y: 22, scale: isAccent ? 0.55 : 0.8 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        transition={{ delay: d, type: 'spring', stiffness: 420, damping: 22 }}
                                                        style={{ display: 'inline-block', transformOrigin: 'left bottom' }}
                                                    >
                                                        <CountUp target={tk} delay={d + 0.08} duration={dur} />
                                                    </motion.span>
                                                );
                                            }
                                            return tk.split('').map((ch, k) => {
                                                if (ch === '\n') return <br key={`${j}-${k}`} />;
                                                const d = TYPE_BASE_DELAY + seq * CHAR_STAGGER;
                                                seq += 1;
                                                return (
                                                    <motion.span
                                                        key={`${j}-${k}`}
                                                        initial={{ opacity: 0, y: isAccent ? 18 : 12, scale: isAccent ? 0.55 : 0.85 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        transition={{ delay: d, type: 'spring', stiffness: 520, damping: isAccent ? 20 : 30 }}
                                                        style={{ display: 'inline-block', whiteSpace: 'pre', transformOrigin: 'left bottom' }}
                                                    >{ch}</motion.span>
                                                );
                                            });
                                        })}
                                    </span>
                                );
                            });
                        })()}
                    </p>

                    {/* ★ v2.3 行動時刻 —— 有些提示不只是「看過就好」，
                        像「這期結束了 → 看下一套」、「下週已調整 → 看課表」。
                        給一顆大按鈕，不要逼使用者自己去猜該去哪。 */}
                    {current.cta?.label && (
                        <motion.button
                            initial={RM ? false : { opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={RM ? { duration: 0 } : { delay: 0.75, duration: 0.5, ease: EASE }}
                            onClick={(e) => { e.stopPropagation(); handleCta(current); }}
                            style={{
                                marginTop: 34,
                                alignSelf: 'flex-start',
                                height: 52,
                                padding: '0 30px',
                                borderRadius: 999,
                                border: 'none',
                                background: T.main,
                                color: T.bg,
                                fontSize: 13,
                                fontWeight: 800,
                                letterSpacing: '0.14em',
                                cursor: 'pointer',
                                boxShadow: `0 14px 30px -14px ${T.glow}`,
                            }}
                        >
                            {current.cta.label}
                        </motion.button>
                    )}

                    {/* 底部品牌收筆 */}
                    <motion.div
                        initial={RM ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={RM ? { duration: 0 } : { delay: 0.6, duration: 0.6 }}
                        style={{
                            position: 'absolute', left: 34, right: 34,
                            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                    >
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '0.06em' }}>
                            {current.cta?.label ? '或點背景略過' : '點一下繼續'}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.3em', color: T.accent }}>
                            DRVN
                        </span>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default SwissMoment;
