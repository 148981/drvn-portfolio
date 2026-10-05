/**
 * ══════════════════════════════════════════════════════════════════════════
 * MissingDataRow — 「這裡少了什麼，去哪裡補」
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 規則：**沒有真實資料就不顯示數字，改成顯示這一列。**
 *
 * 以前缺體重就用 70 公斤頂上去、缺身高就用 170 —— 使用者看到的是一組
 * 從不存在的人算出來的數字，而且存進後端之後會被當成「已知值」自我固化。
 * 現在缺什麼就講什麼，並且給一個點得下去的入口。
 *
 * 介面標準 §5：沒到資料門檻 → **整個區塊不渲染**，換成一張只有一行大字的
 *   動作卡。不附說明、不附進度、不附目標數字，也不要掛在空區塊「下面」——
 *   要的是取代，不是附加。
 * 介面標準 §7：可點元素一律有 pressProps，重要動作有 haptic。
 *
 * 用法：
 *   const gate = biometricsGate(userId, userProfile);
 *   if (!gate.ok) return <MissingDataRow gate={gate} />;
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { pressProps } from '../../utils/nutritionMotion';
import { haptic } from '../../utils/haptics';

const CORAL = '#F95C4B';
const BLACK = '#161415';

/**
 * @param {{ok:boolean, missing:string[], label:string, route:string}} gate
 *        biometrics.biometricsGate() 的回傳值
 * @param {string} [returnTo] 補完之後要回哪一頁
 * @param {object} [style]
 */
export default function MissingDataRow({ gate, returnTo = null, style = {} }) {
    const navigate = useNavigate();
    if (!gate || gate.ok) return null;

    return (
        <motion.button
            {...pressProps('cta')}
            type="button"
            onClick={() => {
                try { haptic('light'); } catch { /* 沒有震動就算了 */ }
                navigate(gate.route, returnTo ? { state: { returnTo } } : undefined);
            }}
            style={{
                width: '100%', minHeight: 44,
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px', borderRadius: 18, cursor: 'pointer',
                background: '#fff', border: '1px solid rgba(22,20,21,0.12)',
                textAlign: 'left', position: 'relative', overflow: 'hidden',
                ...style,
            }}
        >
            <span aria-hidden className="ti-rail" />
            <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 700, color: BLACK }}>
                {gate.label}
            </span>
            <ChevronRight size={18} color={CORAL} strokeWidth={2.2} />
        </motion.button>
    );
}
