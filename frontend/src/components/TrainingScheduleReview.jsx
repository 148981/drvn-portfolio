import React, { useMemo, useState } from 'react';
import { buildWeeklyAgenda, loadStrengthInputs, loadCachedBricks } from '../utils/dailyAgenda';

const labels = ['一', '二', '三', '四', '五', '六', '日'];
export default function TrainingScheduleReview({ userId, strength, running, onChange }) {
    const [overrides, setOverrides] = useState({});
    const [weekIndex, setWeekIndex] = useState(0);
    const inputs = useMemo(() => {
        const current = loadStrengthInputs(userId);
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(`u_${userId}_run_day_overrides`) || '{}'); } catch { /* optional */ }
        const p = strength || current.plan;
        const activeWeek = strength ? weekIndex + 1 : current.activeWeek;
        const days = p?.weeks?.[activeWeek - 1]?.days || [];
        const calendar = Object.fromEntries(days.filter(d => d.calendarDay != null).map((d, i) => [Number(d.calendarDay) % 7, d.day_number || d.dayNumber || i + 1]));
        return { plan: p, activeWeek, weeklySchedule: strength ? calendar : current.weeklySchedule,
            cardioBricks: running ? running.weeks?.[weekIndex]?.bricks || [] : loadCachedBricks(userId),
            dayOverrides: { ...(running ? {} : saved), ...overrides } };
    }, [userId, strength, running, overrides, weekIndex]);
    const agenda = useMemo(() => buildWeeklyAgenda(inputs), [inputs]);
    const move = (brick, index) => {
        const next = { ...overrides, [brick.brick_id]: index };
        setOverrides(next); onChange?.(next);
    };
    const count = Math.max(strength?.weeks?.length || 1, running?.weeks?.length || 1);
    return <section aria-label="健身與跑步排程確認" style={{ margin: '16px 0', padding: 16, background: '#F6F4F1', border: '1px solid #CFC6B8', borderRadius: 16, color: '#161415' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>健身與跑步日期確認</h3>
        <p style={{ fontSize: 12 }}>同日兩项會列出提醒；改期只在確認儲存後套用。沒有合適日期時，請回課表調整頻率。</p>
        {count > 1 && <label>查看週次 <select aria-label="排程週次" value={weekIndex} onChange={e => setWeekIndex(Number(e.target.value))}>{Array.from({ length: count }, (_, i) => <option key={i} value={i}>第 {i + 1} 週</option>)}</select></label>}
        {agenda.map((d, i) => <div key={i} style={{ borderTop: '1px solid #ddd', padding: '8px 0', fontSize: 12 }}>
            週{labels[i]}：{d.strength ? `健身 ${d.strength.focus || ''}` : ''}{d.strength && d.run ? ' ＋ ' : ''}{d.run ? d.run.title || '跑步' : !d.strength ? '休息' : ''}
            {d.run && <select aria-label={`週${labels[i]}跑步改期`} value={i} onChange={e => move(d.run, Number(e.target.value))} style={{ marginLeft: 8 }}>
                {labels.map((l, j) => <option key={j} value={j} disabled={j !== i && !!agenda[j].run}>週{l}{j !== i && !agenda[j].run && !agenda[j].strength && !agenda[(j + 6) % 7].strength?.legDay ? '（建議）' : ''}</option>)}
            </select>}
            {d.strength && d.run && <div style={{ color: '#D94030' }}>同日有兩項訓練，可選其他日期。</div>}
            {d.warnings.map((w, j) => <div key={j} style={{ color: '#D94030', marginTop: 3 }}>{w}</div>)}
        </div>)}
        {!!agenda.unplacedRuns?.length && <p role="alert">有 {agenda.unplacedRuns.length} 堂跑步尚無可用日期，請減少本週趟數或重新安排。</p>}
    </section>;
}
