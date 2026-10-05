import React from 'react';
import { motion } from 'framer-motion';

/**
 * StrideWordmark — Run Community 招牌字標（單一來源共用組件）
 * 黑鈦漸層 "Stride." ＋ 鈦金屬色塊壓 'ide'。
 * 動畫自帶（不吃父層 variants）：字標由上而下落定（y:-24→0, 0.55s），
 * 鈦條 0.8s 後由左展開 — 社團/排行等所有 tab 共用同一節奏。
 *
 * @param {boolean} compact
 *   收窄版：字標縮到一行標籤的高度、寬度只佔自己需要的，可以跟旁邊的字排同一行。
 *   動態牆用這個 —— 原本 clamp(44px,15vw,72px) 的招牌加上副標，
 *   一進頁面整個第一屏都是標題，看不到海報也看不到貼文。
 */
const EASE = [0.4, 0, 0.2, 1];

const StrideWordmark = ({ compact = false }) => (
    <div style={{ position: 'relative', display: compact ? 'inline-block' : 'block' }}>
        {/* 鈦金屬長方形色塊 (Titanium block under 'ide') */}
        <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8, ease: 'circOut' }}
            style={{
                position: 'absolute',
                left: '46.5%',     // 涵蓋 i
                right: '11.5%',    // 涵蓋到 e
                bottom: compact ? 2 : 'clamp(4px, 1.5vw, 8px)',
                height: compact ? 7 : 'clamp(14px, 4.5vw, 24px)',
                background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 35%, #CFC6B8 50%, #E4DED2 65%, #F6F4F1 100%)',
                borderRadius: '2px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.8)',
                transformOrigin: 'left center',
                zIndex: 0
            }}
        />
        <div style={{ overflow: 'hidden', position: 'relative', zIndex: 1 }}>
            <motion.h1
                initial={{ opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
                style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: compact ? 22 : 'clamp(44px, 15vw, 72px)',
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
                {'Stride.'.split('').map((ch, i) => (
                    <span key={i} style={{ display: 'inline-block' }}>{ch}</span>
                ))}
            </motion.h1>
        </div>
    </div>
);

export default StrideWordmark;
