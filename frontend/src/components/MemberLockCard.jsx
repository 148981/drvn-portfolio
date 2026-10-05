/**
 * MemberLockCard — 會員功能在免費版的位置（一行大字的動作卡）
 * ─────────────────────────────────────────────────────────────
 * 介面標準 §5：沒有的東西不畫空殼，只放一張動作卡取代整個區塊。
 * 同一畫面最多放一張（付費模式分析：同一畫面最多一個會員標記）。
 */
import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { pressProps } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { MEMBER_FEATURES, openPaywall } from '../utils/membership';

export default function MemberLockCard({ feature, label, dark = false, style }) {
    const f = MEMBER_FEATURES[feature];
    if (!f) return null;
    const text = label || `解鎖${f.title}`;
    return (
        <motion.button
            {...pressProps('card')}
            onClick={() => { haptic('light'); openPaywall(feature); }}
            style={{
                width: '100%', minHeight: 56, borderRadius: 20, padding: '0 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: dark ? 'rgba(246,244,241,0.06)' : 'rgba(22,20,21,0.04)',
                border: `1px solid ${dark ? 'rgba(246,244,241,0.10)' : 'rgba(22,20,21,0.08)'}`,
                color: dark ? '#F6F4F1' : '#161415',
                fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', textAlign: 'left',
                ...style,
            }}
        >
            <span>{text}</span>
            <ChevronRight size={18} color="#F95C4B" strokeWidth={2.5} />
        </motion.button>
    );
}
