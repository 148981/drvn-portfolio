import React from 'react';
import { motion } from 'framer-motion';

/**
 * KineticWordmark — Fitness Community 招牌字標（單一來源共用組件）
 * 黑鈦漸層 "Kinetic." ＋ 淡液態玻璃灰飾條壓在右側字母。
 * 動畫與 StrideWordmark 完全一致：字標由上而下落定（y:-24→0, 0.55s），
 * 飾條 0.8s 後由左展開（scaleX, circOut）— 健身社群 / 健身排行共用同一節奏。
 */
const EASE = [0.4, 0, 0.2, 1];

/** @param {boolean} compact 收窄版：跟旁邊的字排同一行（與 StrideWordmark 同規則）。 */
const KineticWordmark = ({ compact = false }) => (
    <div style={{ position: 'relative', display: compact ? 'inline-block' : 'block' }}>
        {/* 淡液態玻璃灰飾條（與 Stride 同位置、同動畫） */}
        <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8, ease: 'circOut' }}
            style={{
                position: 'absolute',
                left: '46.5%',
                right: '11.5%',
                bottom: compact ? 2 : 'clamp(4px, 1.5vw, 8px)',
                height: compact ? 7 : 'clamp(14px, 4.5vw, 24px)',
                background: 'linear-gradient(135deg, rgba(244,245,246,0.42) 0%, rgba(224,225,228,0.38) 48%, rgba(212,214,217,0.40) 56%, rgba(230,231,233,0.38) 72%, rgba(248,249,250,0.46) 100%)',
                backdropFilter: 'blur(10px) saturate(1.05)',
                WebkitBackdropFilter: 'blur(10px) saturate(1.05)',
                border: '1px solid rgba(255,255,255,0.45)',
                borderRadius: '3px',
                boxShadow: '0 4px 14px rgba(120,124,130,0.10), inset 0 1px 1px rgba(255,255,255,0.7)',
                transformOrigin: 'left center',
                zIndex: 0,
                pointerEvents: 'none',
            }}
        />
        <div style={{ overflow: 'hidden', position: 'relative', zIndex: 1 }}>
            <motion.h1
                initial={{ opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
                style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: compact ? 22 : 'clamp(40px, 13vw, 68px)',
                    fontWeight: 700,
                    lineHeight: 0.92,
                    margin: 0,
                    width: compact ? 'auto' : '100%',
                    display: 'flex',
                    justifyContent: compact ? 'flex-start' : 'space-between',
                    letterSpacing: compact ? '-0.02em' : undefined,
                    // 黑色高級金屬質感（黑鈦 / 啞黑金屬）
                    background: 'linear-gradient(165deg, #2C2C30 0%, #050506 22%, #3A3A40 40%, #0A0A0C 55%, #4E4E55 66%, #08080A 80%, #1C1C20 100%)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent', color: 'transparent',
                    textShadow: '0 1px 0 rgba(255,255,255,0.18)',
                }}
            >
                {'Kinetic.'.split('').map((ch, i) => (
                    <span key={i} style={{ display: 'inline-block' }}>{ch}</span>
                ))}
            </motion.h1>
        </div>
    </div>
);

export default KineticWordmark;
