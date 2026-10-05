import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../../api/client';
import { pressProps } from '../../utils/nutritionMotion';

/**
 * SquadPlanPanel — 揪團開課表
 * ══════════════════════════════════════════════════════════════════════
 * 社團原本只有聊天、公告、排行 —— 沒有任何「一起做的事」。
 * 一群人真正黏住的原因是「我們現在在練同一份課表」：
 * 有共同的下一步，也看得到誰跟上了。
 *
 * 這一頁只回答三件事：
 *   我們在練什麼 · 我跟到哪 · 大家跟到哪
 * 進度是各自回報的真實次數，沒回報就是 0，不推估。
 */

const C = {
    ink: '#161415',
    sub: 'rgba(22,20,21,0.52)',
    hair: 'rgba(22,20,21,0.12)',
    paper: '#F6F4F1',
    accent: '#F95C4B',
};

export const SquadPlanPanel = ({ squadId, userId, canManage = false, onToast }) => {
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [sessions, setSessions] = useState(12);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!squadId) return;
        try {
            const res = await apiClient.get(`/api/squads/${encodeURIComponent(squadId)}/plan`);
            setPlan(res?.data?.plan || null);
        } catch (err) {
            console.warn('社團課表讀取失敗', err?.message || err);
        } finally {
            setLoading(false);
        }
    }, [squadId]);

    useEffect(() => { load(); }, [load]);

    const me = plan?.members?.find((m) => m.user_id === userId) || null;

    const create = async () => {
        if (!title.trim()) { onToast?.('先幫這份課表取個名字'); return; }
        setBusy(true);
        try {
            const res = await apiClient.post(`/api/squads/${encodeURIComponent(squadId)}/plan`, {
                operator_id: userId, title: title.trim(), total_sessions: Number(sessions) || 12,
            });
            setPlan(res?.data?.plan || null);
            setCreating(false);
            setTitle('');
            onToast?.('課表開好了，大家一起跟');
        } catch (err) {
            onToast?.(err?.response?.data?.detail || '開課表失敗，請重試');
        } finally { setBusy(false); }
    };

    const bump = async (delta) => {
        if (!me) return;
        const next = Math.max(0, Math.min(plan.total_sessions, me.completed + delta));
        if (next === me.completed) return;
        setBusy(true);
        try {
            const res = await apiClient.post(`/api/squads/${encodeURIComponent(squadId)}/plan/progress`, {
                user_id: userId, completed: next,
            });
            setPlan(res?.data?.plan || null);
        } catch (err) {
            onToast?.(err?.response?.data?.detail || '更新失敗，請重試');
        } finally { setBusy(false); }
    };

    const endPlan = async () => {
        setBusy(true);
        try {
            await apiClient.delete(`/api/squads/${encodeURIComponent(squadId)}/plan`, { params: { operator_id: userId } });
            setPlan(null);
            onToast?.('課表已結束');
        } catch (err) {
            onToast?.(err?.response?.data?.detail || '結束失敗，請重試');
        } finally { setBusy(false); }
    };

    if (loading) {
        return <p style={{ fontSize: 13, color: C.sub, padding: '20px 0' }}>載入課表中…</p>;
    }

    // ── 還沒有課表 ──────────────────────────────────────────────────
    if (!plan) {
        return (
            <div style={{ background: C.paper, borderRadius: 22, padding: 20, border: `1px solid ${C.hair}` }}>
                {!creating ? (
                    <>
                        <p style={{ fontSize: 17, fontWeight: 800, color: C.ink, marginBottom: 6 }}>還沒有共同課表</p>
                        <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, marginBottom: canManage ? 16 : 0 }}>
                            開一份大家一起跟，就看得到誰練到哪。
                        </p>
                        {canManage && (
                            <motion.button
                                {...pressProps('cta')} type="button" onClick={() => setCreating(true)}
                                style={{
                                    width: '100%', minHeight: 48, borderRadius: 999, border: 'none', cursor: 'pointer',
                                    background: C.ink, color: C.paper, fontSize: 15, fontWeight: 800,
                                }}
                            >
                                開一份課表
                            </motion.button>
                        )}
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.sub, display: 'block', marginBottom: 8 }}>
                                課表名稱
                            </label>
                            <input
                                type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                placeholder="例如：八週有氧打底"
                                style={{
                                    width: '100%', background: 'transparent', border: 'none',
                                    borderBottom: `1px solid ${C.hair}`, padding: '8px 0',
                                    fontSize: 17, fontWeight: 700, color: C.ink, outline: 'none',
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.sub, display: 'block', marginBottom: 8 }}>
                                總共幾次
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                                <motion.button {...pressProps('icon')} type="button" aria-label="減少次數"
                                    onClick={() => setSessions((v) => Math.max(1, v - 1))}
                                    style={{ width: 42, height: 42, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', fontSize: 20, cursor: 'pointer' }}>−</motion.button>
                                <span className="tabular-nums" style={{ fontSize: 32, fontWeight: 800, color: C.ink, minWidth: 60, textAlign: 'center' }}>
                                    {sessions}
                                </span>
                                <motion.button {...pressProps('icon')} type="button" aria-label="增加次數"
                                    onClick={() => setSessions((v) => Math.min(365, v + 1))}
                                    style={{ width: 42, height: 42, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', fontSize: 20, cursor: 'pointer' }}>+</motion.button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <motion.button {...pressProps('cta')} type="button" onClick={create} disabled={busy}
                                style={{ flex: 2, minHeight: 48, borderRadius: 999, border: 'none', cursor: 'pointer', background: C.ink, color: C.paper, fontSize: 15, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
                                {busy ? '建立中…' : '開始'}
                            </motion.button>
                            <motion.button {...pressProps('cta')} type="button" onClick={() => setCreating(false)}
                                style={{ flex: 1, minHeight: 48, borderRadius: 999, cursor: 'pointer', background: 'transparent', color: C.ink, border: `1px solid ${C.hair}`, fontSize: 15, fontWeight: 800 }}>
                                取消
                            </motion.button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── 有課表 ─────────────────────────────────────────────────────
    return (
        <div style={{ background: C.paper, borderRadius: 22, padding: 20, border: `1px solid ${C.hair}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{plan.title}</p>
                <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: C.sub, whiteSpace: 'nowrap' }}>
                    共 {plan.total_sessions} 次
                </span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 18 }}>
                全隊平均 {plan.squad_pct}%
                {plan.finished_count > 0 && ` · ${plan.finished_count} 人完成`}
            </p>

            {/* 我的進度：唯一可以按的地方 */}
            {me && (
                <div style={{ background: 'rgba(22,20,21,0.04)', borderRadius: 18, padding: 16, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.sub, marginBottom: 4 }}>我的進度</p>
                            <p className="tabular-nums" style={{ fontSize: 26, fontWeight: 800, color: C.ink, lineHeight: 1 }}>
                                {me.completed} <span style={{ fontSize: 14, fontWeight: 700, color: C.sub }}>/ {plan.total_sessions}</span>
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <motion.button {...pressProps('icon')} type="button" aria-label="少一次" disabled={busy}
                                onClick={() => bump(-1)}
                                style={{ width: 44, height: 44, borderRadius: 999, border: `1px solid ${C.hair}`, background: 'transparent', fontSize: 20, cursor: 'pointer' }}>−</motion.button>
                            <motion.button {...pressProps('icon')} type="button" aria-label="完成一次" disabled={busy}
                                onClick={() => bump(1)}
                                style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: C.accent, color: C.paper, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>+</motion.button>
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence initial={false}>
                {plan.members.map((m) => (
                    <motion.div key={m.user_id} layout style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                            <span style={{ fontSize: 13, fontWeight: m.user_id === userId ? 800 : 700, color: m.user_id === userId ? C.ink : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {m.user_id === userId ? '你' : m.name}
                                {m.role === 'leader' && ' · 團長'}
                            </span>
                            <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: m.finished ? C.accent : C.sub, whiteSpace: 'nowrap' }}>
                                {m.completed}/{plan.total_sessions}{m.finished ? ' ✓' : ''}
                            </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'rgba(22,20,21,0.09)', overflow: 'hidden' }}>
                            <motion.div
                                animate={{ width: `${m.pct}%` }}
                                transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                                style={{ height: '100%', borderRadius: 999, background: m.user_id === userId ? C.ink : C.accent, opacity: m.user_id === userId ? 1 : 0.55 }}
                            />
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {canManage && (
                <motion.button {...pressProps('cta')} type="button" onClick={endPlan} disabled={busy}
                    style={{
                        width: '100%', minHeight: 44, borderRadius: 999, marginTop: 8, cursor: 'pointer',
                        background: 'transparent', color: C.sub, border: `1px solid ${C.hair}`, fontSize: 13, fontWeight: 800,
                    }}>
                    結束這份課表
                </motion.button>
            )}
        </div>
    );
};

export default SquadPlanPanel;
