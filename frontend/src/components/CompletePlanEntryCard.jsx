/** Plan management entry: calendar expiry is distinct from workout completion. */

import './JourneyMaterials.css';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { haptic } from '../utils/haptics';
import { readModuleStatus, summariseCycles } from '../utils/trainingFocus';
import { activeStrengthPlanId, strengthPlanCompletedCount } from '../utils/strengthPlanCompletion';

const INK = '#161415';
const CORAL = '#F95C4B';   // 提示一律用亮珊瑚；最深的 Ember 不拿來當文字色
const MODULE_LABEL = { run: '跑步', strength: '重訓', nutrition: '營養' };

export default function CompletePlanEntryCard({ userId }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [status, setStatus] = useState(() => readModuleStatus(userId));
    const [sum, setSum] = useState(() => summariseCycles(userId));

    /* 隨時保持最新 —— 「哪一項跑完了要回饋」是會自己到期的事，
       不能等使用者重新整理才發現。四個來源都接上：
         · 回到前景 / 切回這個分頁
         · 路由變動（從計劃生成頁回來）
         · 每分鐘輕量重算（跨過午夜那一刻就會亮起來）
         · 別的分頁寫了計劃（storage 事件）
       重算只是讀三筆 localStorage，成本可以忽略。 */
    useEffect(() => {
        const refresh = () => { setStatus(readModuleStatus(userId)); setSum(summariseCycles(userId)); };
        refresh();
        const timer = setInterval(refresh, 60000);
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('storage', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [userId, location.key]);

    const finished = sum.finishedCount > 0;
    const emptyStrengthCycle = Boolean(sum.cycles.strength?.finished) &&
        strengthPlanCompletedCount(userId, activeStrengthPlanId(userId), sum.cycles.strength?.weeks) === 0;
    const emptyCycle = sum.finishedKeys.length === 1 && sum.finishedKeys[0] === 'strength' && emptyStrengthCycle;
    const finishedNames = sum.finishedKeys.map(key => MODULE_LABEL[key] || key).join('、');

    return (
        <motion.div
            /* 一開始就是不透明的，動畫只負責上浮 —— 跟進化日誌那張同一個道理：
               把「看得見」綁在動畫上，動畫沒跑完就變成一塊點得到卻看不見的區域。 */
            initial={{ opacity: 1, y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.99 }}
            onClick={() => { haptic('light'); navigate('/training-focus'); }}
            className="journey-control-card journey-pearl-glass mx-4 mt-2 mb-3 cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); haptic('light'); navigate('/training-focus'); }
            }}
        >
            {/* 圓角變小之後左右內距也跟著收回正常值（膠囊才需要 26px 讓開圓弧） */}
            <div className="journey-material-content journey-pearl-content">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{
                            margin: 0, fontSize: 17, lineHeight: 1.25, fontWeight: 700,
                            letterSpacing: '-0.01em', color: INK,
                        }}>
                            {emptyCycle ? `${finishedNames}週期已結束` : finished ? `${finishedNames}到期 · 待回饋` : '我的訓練計劃'}
                        </h3>
                    </div>

                    <div
                        className="journey-pearl-arrow"
                        style={{
                            flexShrink: 0, width: 34, height: 34, borderRadius: 999,
                            background: finished ? CORAL : INK,
                            boxShadow: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <ArrowRight size={14} strokeWidth={2.6} color="#F6F4F1" />
                    </div>
                </div>

                <div className="journey-module-status">
                    {['run', 'strength', 'nutrition'].map(key => {
                        const cycle = sum.cycles[key];
                        /* ⚠️ 欄位名是 cycle.weeks，不是 JSDoc 寫的 totalWeeks（toCycle 實際回傳沒有那個鍵）。
                           「已設定」只說得出有沒有設定，說不出走到哪；有週期就直接講第幾／共幾週。 */
                        const label = cycle
                            ? (cycle.finished ? (key === 'strength' && emptyStrengthCycle ? '已到期' : '待回饋') : `第 ${cycle.weekIndex} / ${cycle.weeks} 週`)
                            : (status[key] ? '已設定' : '未設定');
                        return <span key={key}>{MODULE_LABEL[key]}<strong>{label}</strong></span>;
                    })}
                </div>
            </div>
        </motion.div>
    );
}
