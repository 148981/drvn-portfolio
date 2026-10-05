/**
 * PoseFeedbackCard — 姿勢分析結果頁底部：「這次分析準不準？」
 * ─────────────────────────────────────────────────────────────
 * 姿勢分析 2026-09 起全部免費、不限次數（本地運算），還在收集回饋。
 * 一題三選一（準／部分準／不準），不準或部分準再追問哪裡不準（可複選、可寫一句）。
 * 答案送 /api/membership/survey（kind=pose，feature=動作 key），統計頁同一頁看得到。
 * 同一次分析只問一次（sessionKey）。
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { toast } from '../utils/toast';
import { SURVEY_REASONS, submitSurvey, surveyAsked, markSurveyAsked } from '../utils/membership';

const INK = '#161415';
const CORAL = '#F95C4B';
const VERDICT = [['accurate', '很準'], ['partly', '部分準'], ['inaccurate', '不準']];

export default function PoseFeedbackCard({ sessionKey, exerciseKey }) {
    const key = String(sessionKey || '');
    const [done, setDone] = useState(() => !!key && surveyAsked('pose', key));
    const [verdict, setVerdict] = useState(null);
    const [issues, setIssues] = useState([]);
    const [note, setNote] = useState('');
    if (!key || done) return null;

    const detailReasons = SURVEY_REASONS.pose.filter(([id]) => !VERDICT.some(([v]) => v === id));
    const send = (v = verdict) => {
        haptic('light');
        submitSurvey('pose', [v, ...issues].slice(0, 3), { note, feature: exerciseKey || null });
        markSurveyAsked('pose', key);
        setDone(true);
        toast.success('謝謝，這會拿來把分析調得更準');
    };
    const chip = (on) => ({
        minHeight: 44, padding: '0 14px', borderRadius: 22, fontSize: 14, fontWeight: 600, color: INK,
        background: on ? 'rgba(249,92,75,0.10)' : 'rgba(22,20,21,0.04)',
        border: `1.5px solid ${on ? CORAL : 'rgba(22,20,21,0.10)'}`,
    });

    return (
        <section style={{ padding: '24px 20px 8px' }}>
            <div style={{ borderTop: '1px solid rgba(207,198,184,0.7)', paddingTop: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>這次分析準不準？</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(22,20,21,0.5)', marginTop: 4 }}>姿勢分析還在調整中，你的回答會直接拿來改進</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {VERDICT.map(([id, label]) => (
                        <motion.button key={id} {...pressProps('pill')} aria-pressed={verdict === id}
                            onClick={() => { haptic('light'); if (id === 'accurate') { send(id); } else { setVerdict(id); } }}
                            style={chip(verdict === id)}>
                            {label}
                        </motion.button>
                    ))}
                </div>
                {verdict && (
                    <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginTop: 14 }}>哪裡不準？最多選兩個</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {detailReasons.map(([id, label]) => {
                                const on = issues.includes(id);
                                return (
                                    <motion.button key={id} {...pressProps('pill')} aria-pressed={on}
                                        onClick={() => setIssues((x) => (on ? x.filter((y) => y !== id) : x.length >= 2 ? x : [...x, id]))}
                                        style={chip(on)}>
                                        {label}
                                    </motion.button>
                                );
                            })}
                        </div>
                        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2}
                            placeholder="例如：第 3 下明明有蹲到底，卻說太淺"
                            style={{ width: '100%', marginTop: 10, borderRadius: 18, padding: '12px 14px', resize: 'none', fontSize: 14,
                                background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.10)', color: INK, outline: 'none' }} />
                        <motion.button {...pressProps('cta')} onClick={() => send()}
                            style={{ width: '100%', height: 48, marginTop: 10, borderRadius: 24, background: CORAL, color: '#fff', fontSize: 14, fontWeight: 800 }}>
                            送出回饋
                        </motion.button>
                    </>
                )}
            </div>
        </section>
    );
}
