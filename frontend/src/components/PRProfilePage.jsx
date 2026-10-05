// PRProfilePage.jsx
// ──────────────────────────────────────────────────────────────────────────
// 🏆 PR 檔案（公里制）— 使用者的完整個人紀錄總覽。
//   資料來源：/api/cardio/analytics/pr-profile/{userId}
//     每個標準距離（1K/3K/5K/10K/半馬/全馬）：
//       • current   現任 PR（分段最佳努力）
//       • top3      歷史前三快（金/銀/銅）
//       • timeline  歷年 PR 進程（每次紀錄被刷新的節點）→ 折線圖
//   設計：DRVN 瑞士極簡 — hairline 分隔、大字等寬數字、單一 coral 強調。
// ──────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { medalSrc } from '../utils/sportIcons';
import { brandColors as C } from '../utils/colors';

const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';

const fmtSec = (sec) => {
    if (!sec || sec <= 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const fmtPace = (sec) => {
    if (!sec || sec <= 0) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
};

// 距離排序（短→長）
const ORDER = ['1K', '3K', '5K', '10K', 'HALF', 'FULL'];

const PRProfilePage = ({ userId: propUserId }) => {
    const navigate = useNavigate();
    const userId = propUserId || getUserId();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await apiClient.get(`/api/cardio/analytics/pr-profile/${userId}`);
                if (!cancelled) setProfile(r.data);
            } catch (e) {
                console.warn('[PRProfile] load failed:', e?.message);
            }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [userId]);

    const distances = profile?.distances || {};
    const keys = ORDER.filter((k) => distances[k]);

    return (
        <div style={{ minHeight: '100dvh', background: C.paper, maxWidth: 430, margin: '0 auto', fontFamily: SWISS_FONT, paddingBottom: 120 }}>
            {/* Header — Swiss editorial */}
            <div style={{ padding: '56px 22px 8px' }}>
                <motion.button {...pressProps('row')} onClick={() => navigate(-1)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 16 }}>
                    <ArrowLeft size={20} color={C.ink} />
                </motion.button>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.coral, letterSpacing: '0.24em', marginBottom: 4 }}>Personal Records · 公里制</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, color: C.ink, letterSpacing: '-0.04em', lineHeight: 0.95, margin: 0, textTransform: 'uppercase' }}>PR 檔案</h1>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginTop: 10, lineHeight: 1.6 }}>
                    每個距離取「連續分段最佳努力」計算 — 看你的紀錄怎麼一路被自己刷新。
                </p>
            </div>

            <div style={{ padding: '8px 22px' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                        {[0, 1, 2].map((i) => <div key={i} style={{ height: 120, borderRadius: 20, background: 'rgba(22,20,21,0.05)' }} />)}
                    </div>
                ) : keys.length === 0 ? (
                    <div style={{ marginTop: 24, padding: '28px 20px', borderRadius: 20, background: 'rgba(22,20,21,0.03)', textAlign: 'center' }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: C.ink, margin: 0 }}>還沒有 PR 紀錄</p>
                        <p style={{ fontSize: 11.5, color: 'rgba(22,20,21,0.5)', marginTop: 8, lineHeight: 1.7 }}>
                            完成一次 1 公里以上的跑步，這裡就會開始記錄你在各距離的最快成績與歷年變化。
                        </p>
                    </div>
                ) : (
                    keys.map((k, idx) => {
                        const d = distances[k];
                        const tl = (d.timeline || []).map((t, i) => ({ ...t, idx: i, dateShort: String(t.date).slice(2, 10) }));
                        const improvedSec = tl.length > 1 ? Math.round(tl[0].sec - tl[tl.length - 1].sec) : 0;
                        return (
                            <motion.section
                                key={k}
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-30px' }}
                                transition={{ duration: 0.45, delay: Math.min(idx * 0.04, 0.2) }}
                                style={{ borderTop: '1px solid rgba(0,0,0,0.10)', padding: '20px 0' }}
                            >
                                {/* 距離標題 + 現任 PR */}
                                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(22,20,21,0.45)', letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 6 }}>— {d.label}</div>
                                        <div className="tabular-nums" style={{ fontSize: 34, fontWeight: 900, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
                                            {fmtSec(d.current?.sec)}
                                            <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(22,20,21,0.45)', marginLeft: 8 }}>{fmtPace(d.current?.pace_sec)}/km</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="tabular-nums" style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.45)' }}>{d.current?.date || ''}</div>
                                        <div className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.35)', marginTop: 3 }}>共 {d.attempts} 次達標</div>
                                    </div>
                                </div>

                                {/* 累積進步量 */}
                                {improvedSec > 0 && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '4px 10px', borderRadius: 99, background: 'rgba(90,122,58,0.10)' }}>
                                        <TrendingDown size={11} style={{ color: '#5A7A3A' }} />
                                        <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 900, color: '#5A7A3A' }}>
                                            歷年共快了 {fmtSec(improvedSec)}（{tl.length - 1} 次刷新）
                                        </span>
                                    </div>
                                )}

                                {/* 歷年 PR 折線 — 縱軸為完成時間（越低越快），每個點都是一次「破紀錄」 */}
                                {tl.length > 1 && (
                                    <div style={{ height: 110, marginTop: 14 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={tl} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                                <XAxis dataKey="dateShort" tick={{ fontSize: 11, fill: 'rgba(22,20,21,0.35)', fontWeight: 700 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                                <YAxis
                                                    reversed={false}
                                                    domain={['dataMin - 20', 'dataMax + 20']}
                                                    tick={{ fontSize: 11, fill: 'rgba(22,20,21,0.35)', fontWeight: 700 }}
                                                    axisLine={false} tickLine={false} width={38}
                                                    tickFormatter={(v) => fmtSec(v)}
                                                />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', fontSize: 11, fontFamily: SWISS_FONT }}
                                                    formatter={(v) => [fmtSec(v), '完成時間']}
                                                    labelFormatter={(l) => `20${l}`}
                                                />
                                                <Line type="monotone" dataKey="sec" stroke={C.coral} strokeWidth={2.5} dot={{ r: 3.5, fill: C.coral, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                        <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.35)', fontWeight: 700, margin: '2px 0 0 4px' }}>▼ 每個點＝一次刷新紀錄，線越往下代表越快</p>
                                    </div>
                                )}

                                {/* 歷史前三快 — 金/銀/銅 */}
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: tl.length > 1 ? 22 : 14 }}>
                                    {(d.top3 || []).map((t, i) => {
                                        // 🆕 當次剛達成、且成為現任 PR 的紀錄 → 標 NEW
                                        const isNew = (t.session_id && d.current?.session_id && t.session_id === d.current.session_id)
                                            || (!t.session_id && d.current?.date && t.date === d.current.date && i === 0);
                                        return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <img src={medalSrc(i + 1)} alt={`第${i + 1}`} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                                <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.55)' }}>{t.date}</span>
                                                {isNew && (
                                                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', color: '#fff', background: C.coral, borderRadius: 5, padding: '2px 5px' }}>NEW</span>
                                                )}
                                            </div>
                                            <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 900, color: i === 0 ? C.coral : C.ink }}>
                                                {fmtSec(t.sec)}
                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.4)', marginLeft: 6 }}>{fmtPace(t.pace_sec)}/km</span>
                                            </span>
                                        </div>
                                        );
                                    })}
                                </div>
                            </motion.section>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default PRProfilePage;
