import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lightbulb } from 'lucide-react';
import { hasSeenTip, markTipSeen } from '../utils/firstVisitCoach';
import { haptic } from '../utils/haptics';

/* ════════════════════════════════════════════════════════════════════════
   FirstTimeHint — 首次操作情境教學卡（通用）
   ────────────────────────────────────────────────────────────────────────
   在使用者「第一次」進入某個操作流程（建立計劃、融合計劃、自訂課表…）時，
   在畫面底部浮一張操作步驟卡。看過即記錄（firstVisitCoach，per-user），
   之後不再打擾。「設定 → 重啟教學導覽」會重置所有提示。

   ⚠️ 這張卡以前是整片暗化 + blur 的 modal。那樣是無效的：
      卡片在講「上面那個大弧是什麼」「下面三個環點下去會怎樣」，
      可是使用者正好看不到大弧也看不到環 —— 他只能把卡關掉，然後忘記。
      現在背景完全不動、也不吃點擊：一邊讀一邊看得到在講哪一塊，
      想直接操作也可以，卡片就跟著留在下面。
      （drvn-interface-standard §4.3）

   ⚠️ 步驟上限 3 條、每條 ≤ 20 字。需要 4 條以上才講得完，代表那個畫面
      本身太複雜，要改的是畫面不是說明。多給的會被截掉，這是刻意的。

   用法：
     <FirstTimeHint
        tipKey="first-plan-fusion"
        title="計劃融合怎麼玩"
        steps={['選 2–3 個計劃', '設定難度與天數', '按下生成']}
        show={fusionMode}          // 選填：額外開關（預設 true = 掛載即判斷）
     />
   ════════════════════════════════════════════════════════════════════════ */
const MAX_STEPS = 3;

export default function FirstTimeHint({ tipKey, title, steps = [], show = true, kicker = '第一次來' }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!show || !tipKey) return undefined;
        if (hasSeenTip(tipKey)) return undefined;
        // 等頁面進場動畫落定再浮出來
        const t = setTimeout(() => setVisible(true), 650);
        return () => clearTimeout(t);
    }, [show, tipKey]);

    const close = () => {
        try { markTipSeen(tipKey); } catch { /* ignore */ }
        haptic('light');
        setVisible(false);
    };

    const items = steps.slice(0, MAX_STEPS);

    return createPortal(
        <AnimatePresence>
            {visible && (
                <div
                    key={`hint-${tipKey}`}
                    /* ⚠️ pointer-events:none —— 背景不吃點擊，使用者可以一邊讀一邊操作。
                       只有卡片本身收回點擊。 */
                    style={{
                        position: 'fixed', insetInline: 0, bottom: 0, top: 0, zIndex: 2147483000,
                        pointerEvents: 'none',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    }}
                >
                    <motion.div
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0, transition: { duration: 0.22 } }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        role="dialog"
                        aria-label={title}
                        style={{
                            pointerEvents: 'auto',
                            width: 'calc(100% - 24px)', maxWidth: 400, boxSizing: 'border-box',
                            /* 讓開底部導覽列，不然卡片會壓在導覽列上 */
                            marginBottom: 'calc(env(safe-area-inset-bottom, 12px) + 84px)',
                            background: 'linear-gradient(160deg, rgba(249,247,244,0.97) 0%, rgba(238,232,223,0.95) 100%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                            backdropFilter: 'blur(24px) saturate(160%)',
                            border: '1px solid rgba(255,255,255,0.65)',
                            borderRadius: 24, padding: '18px 18px 16px',
                            boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.85), 0 20px 48px -16px rgba(22,20,21,0.42)',
                            position: 'relative',
                        }}
                    >
                        {/* 關閉 */}
                        <motion.button {...pressProps('icon')}
                            onClick={close}
                            aria-label="關閉提示"
                            style={{
                                position: 'absolute', top: 12, right: 12,
                                width: 28, height: 28, borderRadius: 99,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(32,32,32,0.06)',
                                border: '1px solid rgba(32,32,32,0.1)',
                                color: 'rgba(32,32,32,0.55)', cursor: 'pointer',
                            }}
                        >
                            <X size={14} strokeWidth={2.2} />
                        </motion.button>

                        {/* kicker */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 9, letterSpacing: '0.22em', fontWeight: 700,
                            color: '#D94030', textTransform: 'uppercase', marginBottom: 7,
                        }}>
                            <Lightbulb size={12} strokeWidth={2.4} /> {kicker}
                        </div>

                        {/* 標題 */}
                        <h3 style={{
                            margin: '0 0 12px', fontSize: 19, fontWeight: 800,
                            letterSpacing: '-0.01em', color: '#161415', lineHeight: 1.2,
                            paddingRight: 34,
                        }}>
                            {title}
                        </h3>

                        {/* 步驟 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                            {items.map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <span style={{
                                        width: 19, height: 19, borderRadius: 99, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(249,92,75,0.14)',
                                        border: '1px solid rgba(249,92,75,0.3)',
                                        fontSize: 10.5, fontWeight: 800, color: '#D94030', marginTop: 1,
                                    }}>{i + 1}</span>
                                    {/* ⚠️ minWidth:0 —— 少了它，長句子會把整列撐出卡片右緣 */}
                                    <p style={{
                                        margin: 0, minWidth: 0, fontSize: 13.5, lineHeight: 1.55,
                                        color: 'rgba(22,20,21,0.82)', fontWeight: 500,
                                    }}>{s}</p>
                                </div>
                            ))}
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={close}
                            style={{
                                width: '100%', height: 42, borderRadius: 99,
                                background: '#F95C4B', border: 'none', color: '#F6F4F1',
                                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                boxShadow: '0 8px 20px -6px rgba(255,70,40,0.5)',
                            }}
                        >
                            知道了
                        </motion.button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
