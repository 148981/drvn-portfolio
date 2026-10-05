/**
 * CourseGate — 進階課程第 2 週起的會員界線（包在訓練畫面外面）
 * ─────────────────────────────────────────────────────────────
 * 鋼骨基石與自己產生／自訂的計劃永遠不擋；其他五門課第 1 週免費試上，
 * 第 2 週起要會員。所有「開始訓練」的入口（首頁今日焦點、計劃頁、週課表）
 * 最後都進 /training-session-mobile，所以只在這裡擋一次，不在各入口各寫一份。
 *
 * 擋下時：課程暫停在原處、進度與紀錄都留著；會員一解鎖就從這一週接著練。
 * 畫面只有一件事（介面標準 §5）：一個大標、一張會員卡、一個替代出口。
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { pressProps, riseIn } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { getUserId } from '../utils/auth';
import { useMembership } from '../utils/membership';
import { courseWeekLocked, isMemberCourse, FREE_COURSE_WEEKS } from '../utils/memberLimits';
import MemberLockCard from './MemberLockCard';

function readActivePlan(userId) {
    try { return JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null'); } catch { return null; }
}

export default function CourseGate({ day = {}, userId, children }) {
    const navigate = useNavigate();
    const { member } = useMembership();
    const uid = userId || getUserId();

    const gate = useMemo(() => {
        const plan = readActivePlan(uid);
        if (!plan || !isMemberCourse(plan)) return null;
        // 這一天要屬於目前的課程（首頁今日焦點可能沒帶 plan_id → 視為目前的計劃）
        const dayPlanId = day?.plan_id;
        const planIds = [plan.plan_id, plan.id, plan.source_course?.id].filter(Boolean);
        if (dayPlanId && !planIds.includes(dayPlanId)) return null;
        const week = Number(day?.week_number) || 1;
        if (!courseWeekLocked(plan, week, member)) return null;
        return { week, name: plan.source_course?.name || plan.plan_name || plan.name || '這門課' };
    }, [uid, day, member]);

    if (!gate) return children;

    return (
        <div className="min-h-[100dvh] flex flex-col justify-end"
            style={{ background: '#F6F4F1', padding: '0 20px calc(env(safe-area-inset-bottom, 0px) + 40px)' }}>
            <motion.div {...riseIn(0)} style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#161415' }}>
                第 {FREE_COURSE_WEEKS} 週練完了
            </motion.div>
            <motion.div {...riseIn(1)} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.45)', marginTop: 10 }}>
                {gate.name}的進度都留著，解鎖後從第 {gate.week} 週接著練
            </motion.div>
            <motion.div {...riseIn(2)} style={{ marginTop: 28 }}>
                <MemberLockCard feature="courses" label={`繼續第 ${gate.week} 週`} />
            </motion.div>
            <motion.button {...riseIn(3)} {...pressProps('row')}
                onClick={() => { haptic('light'); navigate('/master-journey-mobile'); }}
                style={{ marginTop: 12, minHeight: 48, fontSize: 14, fontWeight: 700, color: 'rgba(22,20,21,0.55)' }}>
                改練鋼骨基石
            </motion.button>
        </div>
    );
}
