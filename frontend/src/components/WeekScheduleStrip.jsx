import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { buildWeeklyAgenda, loadPlannedRunBricks } from '../utils/dailyAgenda';

/**
 * WeekScheduleStrip —— 這一週的重訓＋跑步，七天排成一排，一眼看完。
 * ════════════════════════════════════════════════════════════════
 * ⚠️ 取代原本的「健身與跑步日期確認」清單：七行「週二：休息」、一個週次下拉、
 *    一段「同日兩项會列出提醒；改期只在確認儲存後套用…」的說明 ——
 *    要讀完七行字才知道哪天練什麼。現在是一排七格：
 *      深色 = 重訓（寫練什麼）、珊瑚 = 跑步、淡色 = 休息；同一天兩項就疊兩塊。
 *    排法與首頁／週課表同一支 buildWeeklyAgenda，這裡看到的就是之後真的會排的。
 * 只在已經有跑步計劃時出現（沒有跑步的話，「預定排在 一／三／五」一行就夠了）。
 */
const LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 「推力強化 (胸・肩・三頭)（強化 肩）」→「推」：格子只放得下一兩個字 */
const shortFocus = (focus = '') => {
    const f = String(focus);
    if (/全身/.test(f)) return '全身';
    if (/上半身|胸背/.test(f)) return '上半身';
    if (/下肢|下半身|腿|臀/.test(f)) return '腿';
    if (/拉/.test(f)) return '拉';
    if (/推/.test(f)) return '推';
    if (/肩|臂/.test(f)) return '肩臂';
    if (/核心|腹/.test(f)) return '核心';
    return '重訓';
};
const RUN_ZH = { easy: '輕鬆跑', long: '長跑', tempo: '節奏跑', interval: '間歇', recovery: '恢復跑', strength: '肌力' };
const shortRun = (run) => RUN_ZH[String(run?.type || run?.workout_type || '').toLowerCase()] || '跑步';

/**
 * @param {object} props
 * @param {Array}  [props.week]      已經算好的 7 天（previewWeek / buildWeeklyAgenda 的輸出）；有給就直接畫
 * @param {object} [props.strength]  重訓計劃（沒給 week 時自己算，跑步用已排的跑步課表）
 * @param {function} [props.onMoveStrength] (fromIdx, toIdx) => void；有給就能調整：點重訓格、再點要換過去的那天
 *        （idx 0 = 週一）。跑步會自己繞開重訓重新排。
 */
export default function WeekScheduleStrip({ userId, strength, week = null, onMoveStrength = null }) {
    const [picked, setPicked] = useState(null);
    const editable = typeof onMoveStrength === 'function';
    const agenda = useMemo(() => {
        if (Array.isArray(week) && week.length === 7) return week;
        const days = strength?.weeks?.[0]?.days || [];
        const weeklySchedule = Object.fromEntries(days
            .filter((d) => d.calendarDay != null)
            .map((d, i) => [Number(d.calendarDay) % 7, d.day_number || d.dayNumber || i + 1]));
        try {
            return buildWeeklyAgenda({
                plan: strength, activeWeek: 1, weeklySchedule,
                cardioBricks: loadPlannedRunBricks(userId), dayOverrides: {},
            });
        } catch { return []; }
    }, [userId, strength, week]);

    if (!agenda?.length) return null;
    const clash = agenda.filter((d) => d.strength && d.run).length;

    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {agenda.map((d, i) => {
                    const rest = !d.strength && !d.run;
                    const onTap = () => {
                        if (!editable) return;
                        if (d.strength) { haptic('light'); setPicked(picked === i ? null : i); return; }
                        if (picked != null) { onMoveStrength(picked, i); setPicked(null); }
                    };
                    const isPicked = picked === i;
                    const target = editable && picked != null && !d.strength;
                    return (
                        <motion.div key={i} {...(editable ? pressProps('row') : {})} onClick={onTap}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, cursor: editable ? 'pointer' : 'default',
                                borderRadius: 14, outline: isPicked ? '2px solid #F95C4B' : target ? '2px dashed rgba(249,92,75,0.55)' : 'none', outlineOffset: 2 }}>
                            <span style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.45)' }}>{LABELS[i]}</span>
                            {d.strength && (
                                <span style={{ minHeight: 44, borderRadius: 12, background: '#161415', color: '#F6F4F1', fontSize: 12, fontWeight: 800,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 2px', lineHeight: 1.15 }}>
                                    {shortFocus(d.strength.focus)}
                                </span>
                            )}
                            {d.run && (
                                <span style={{ minHeight: d.strength ? 30 : 44, borderRadius: 12, background: '#F95C4B', color: '#FFF', fontSize: 11, fontWeight: 800,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 2px', lineHeight: 1.15 }}>
                                    {shortRun(d.run)}
                                </span>
                            )}
                            {rest && (
                                <span style={{ minHeight: 44, borderRadius: 12, border: '1px dashed rgba(22,20,21,0.18)', color: 'rgba(22,20,21,0.35)', fontSize: 11, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    休
                                </span>
                            )}
                        </motion.div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#161415', marginRight: 4 }} />重訓</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#F95C4B', marginRight: 4 }} />跑步</span>
                {clash > 0 && <span style={{ color: '#D94030' }}>{clash} 天同日兩項</span>}
                {editable && <span style={{ marginLeft: 'auto', color: picked != null ? '#D94030' : 'rgba(22,20,21,0.5)' }}>{picked != null ? '點要換過去的那天' : '點重訓格可換日'}</span>}
            </div>
        </div>
    );
}
