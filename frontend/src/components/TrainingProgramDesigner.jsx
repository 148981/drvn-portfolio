import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import apiClient from '../api/client';
import { buildPersonalProgram } from '../utils/personalTrainingProgram';
import { activateProgram } from '../utils/trainingProgram';
import { toLocalDateKey } from '../utils/localDate';
import TrainingScheduleReview from './TrainingScheduleReview';

const levels = [['beginner', '低／新手'], ['intermediate', '中／中階'], ['advanced', '高／進階']];
const inputStyle = { width: '100%', padding: 9, border: '1px solid #CFC6B8', borderRadius: 8, background: '#fff', color: '#161415' };
export default function TrainingProgramDesigner({ userId, onlyTrack = null, onDone, onClose }) {
    const [config, setConfig] = useState({ include: Object.fromEntries(['strength', 'running', 'nutrition'].map(k => [k, !onlyTrack || onlyTrack === k])),
        startDate: toLocalDateKey(new Date()), strengthLevel: 'beginner', runLevel: 'beginner', strengthDays: 3,
        runSessions: 3, runWeeks: 6, nutritionWeeks: 8, weeklyKm: 0, equipment: 'mixed', style: 'bodybuilding',
        runGoal: 'aerobic_base', nutritionGoal: 'recomp', weight: '', height: '', age: '', gender: '', activity: 1.4, injuries: [], muscles: [] });
    const [preview, setPreview] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
    const [overrides, setOverrides] = useState({});
    const change = (key, value) => { setConfig(c => ({ ...c, [key]: value })); setPreview(null); setError(''); };
    const select = (key, label, options) => <label style={{ display: 'block', margin: '12px 0', fontSize: 13 }}>{label}<select style={inputStyle} aria-label={label} value={config[key]} onChange={e => change(key, e.target.value)}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
    const number = (key, label, min, max) => <label style={{ display: 'block', margin: '10px 0', fontSize: 13 }}>{label}<input style={inputStyle} aria-label={label} type="number" min={min} max={max} value={config[key]} onChange={e => change(key, e.target.value)} /></label>;
    const submit = async () => {
        if (!preview || saving) return;
        setSaving(true); setError('');
        try {
            const program = { ...preview, ...(preview.running ? { running: { ...preview.running, day_overrides: overrides } } : {}) };
            if (!preview.running && Object.keys(overrides).length) {
                const existing = JSON.parse(localStorage.getItem(`u_${userId}_onboarding_cardio_plan`) || 'null');
                if (!existing?.plan_id) throw new Error('請先同步目前跑步計劃，再確認改期');
                program.running_schedule = { plan_id: existing.plan_id, day_overrides: overrides };
            }
            await activateProgram(userId, program, apiClient);
            onDone?.();
        } catch (error) { setError(error?.response?.status === 409 ? '目前計劃已變更，請回中控重新同步後確認安排。' : '尚未確認同步。請重試同一份預覽，或回中控使用「重試並確認計劃」。'); }
        finally { setSaving(false); }
    };
    return <section aria-label="設計三項計劃" style={{ margin: '20px 0', padding: 18, background: '#eee9e1', borderRadius: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>設計並開始你的計劃</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7 }}>選擇要開始新週期的項目；其他項目繼續原週期。確認後會一起啟用所選計劃。</p>
        <fieldset disabled={saving} style={{ border: 0, padding: 0 }}>
            {Object.entries({ strength: '健身', running: '跑步', nutrition: '營養' }).map(([key, label]) => <label key={key} style={{ marginRight: 14 }}><input type="checkbox" checked={config.include[key]} onChange={e => change('include', { ...config.include, [key]: e.target.checked })} /> {label}</label>)}
            <label style={{ display: 'block', marginTop: 12 }}>開始日期<input style={inputStyle} aria-label="開始日期" type="date" value={config.startDate} onChange={e => change('startDate', e.target.value)} /></label>
            {config.include.strength && <div>{select('strengthLevel', '健身難度', levels)}{select('strengthDays', '健身天數／週', [1, 2, 3, 4, 5, 6].map(n => [n, `${n} 天`]))}
                {select('equipment', '健身器材', [['mixed', '健身房與徒手'], ['bodyweight', '徒手／彈力帶'], ['equipment', '器材訓練']])}
                {select('style', '健身目標', [['bodybuilding', '肌肉與體態'], ['strength', '力量']])}
                <p style={{ fontSize: 12 }}>健身採四週進程。更細的動作與組次可在課表內調整。</p>
                <div style={{ fontSize: 12 }}>需避開的部位：{['shoulder', 'knee', 'back', 'wrist'].map((key, i) => <label key={key} style={{ marginRight: 8 }}><input type="checkbox" checked={config.injuries.includes(key)} onChange={e => change('injuries', e.target.checked ? [...config.injuries, key] : config.injuries.filter(k => k !== key))} />{['肩', '膝', '背', '腕'][i]}</label>)}</div>
            </div>}
            {config.include.running && <div>{select('runLevel', '跑步難度', levels)}{select('runSessions', '跑步趟數／週', [3, 4, 5, 6].map(n => [n, `${n} 趟`]))}
                {select('runGoal', '跑步目標', [['aerobic_base', '建立有氧基礎'], ['fat_loss', '規律跑步與減脂'], ['race_5k_10k', '5K／10K']])}
                {select('runWeeks', '跑步週期', [4, 6, 8, 10, 12, 14].map(n => [n, `${n} 週`]))}{number('weeklyKm', '目前實際每週跑量（公里，新開始填 0）', 0, 250)}</div>}
            {config.include.nutrition && <div>{select('nutritionGoal', '營養目標', [['recomp', '維持與體態重組'], ['cut', '減脂'], ['bulk', '增重增肌']])}
                {select('nutritionWeeks', '營養檢視週期', [4, 6, 8, 12, 16].map(n => [n, `${n} 週`]))}
                {number('weight', '目前體重（公斤）', 25, 350)}{number('height', '身高（公分）', 100, 250)}{number('age', '年齡', 18, 109)}
                {select('gender', '營養公式使用的生理性別', [['', '請選擇'], ['male', '男性'], ['female', '女性']])}
                {select('activity', '日常活動程度（含平常運動）', [[1.2, '大多久坐'], [1.4, '輕度活動'], [1.6, '中度活動']])}
                <p style={{ fontSize: 12 }}>熱量與體重目標是估計值；啟用後可在營養頁依量測、飲食偏好及實際進度細調。</p>
            </div>}
            <motion.button {...pressProps('row')} type="button" style={inputStyle} onClick={() => { try { setPreview(buildPersonalProgram(config)); setOverrides({}); setError(''); } catch (e) { setError(e.message); } }}>生成預覽</motion.button>
        </fieldset>
        {error && <p role="alert" style={{ color: '#D94030' }}>{error}</p>}
        {preview && <div><h3>確認這次啟用的計劃</h3>
            {preview.strength && <p>健身：{preview.strength.weeks.length} 週，每週 {preview.strength.days_per_week} 天。{preview.strength.time_hint || ''}</p>}
            {preview.running && <p>跑步：{preview.running.weeks.length} 週，首週 {preview.running.weeks[0].target_mileage_km} 公里。</p>}
            {preview.nutrition && <p>營養：{preview.nutrition.cycleWeeks} 週檢視，每日約 {preview.nutrition.adjustedIntake} kcal，蛋白質 {preview.nutrition.newProtein} g（估計）。</p>}
            {(preview.strength || preview.running) && <TrainingScheduleReview key={preview.program_id} userId={userId} strength={preview.strength} running={preview.running} onChange={setOverrides} />}
            <motion.button {...pressProps('row')} type="button" disabled={saving} onClick={submit} style={{ ...inputStyle, background: '#161415', color: '#fff' }}>{saving ? '正在啟用…' : '確認安排並開始所選計劃'}</motion.button>
        </div>}
        <motion.button {...pressProps('row')} type="button" disabled={saving} onClick={onClose} style={{ marginTop: 12 }}>收起設計</motion.button>
    </section>;
}
