/**
 * MemberPageGate — 整頁都是會員功能時（月報、健身人格）包在路由外面
 * ─────────────────────────────────────────────────────────────
 * 免費版不畫空殼、不畫模糊的假資料：只有一個大標、一張會員卡、一個返回。
 * 會員或付費牆沒開 → 直接顯示原頁面。
 */
import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { pressProps, riseIn } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { useMembership, MEMBER_FEATURES } from '../utils/membership';
import MemberLockCard from './MemberLockCard';

export default function MemberPageGate({ feature, label, children }) {
    const navigate = useNavigate();
    const { canUse } = useMembership();
    if (canUse(feature)) return children;
    const f = MEMBER_FEATURES[feature] || {};
    return (
        <div className="min-h-[100dvh] flex flex-col justify-end"
            style={{ background: '#F6F4F1', padding: '0 20px calc(env(safe-area-inset-bottom, 0px) + 120px)' }}>
            <motion.div {...riseIn(0)} style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#161415' }}>
                {f.title}
            </motion.div>
            <motion.div {...riseIn(1)} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.45)', marginTop: 10 }}>
                {f.line}
            </motion.div>
            <motion.div {...riseIn(2)} style={{ marginTop: 28 }}>
                <MemberLockCard feature={feature} label={label} />
            </motion.div>
            <motion.button {...riseIn(3)} {...pressProps('row')}
                onClick={() => { haptic('light'); navigate(-1); }}
                style={{ marginTop: 12, minHeight: 48, fontSize: 14, fontWeight: 700, color: 'rgba(22,20,21,0.55)' }}>
                返回
            </motion.button>
        </div>
    );
}
