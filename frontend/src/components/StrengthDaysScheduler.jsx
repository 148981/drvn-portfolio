/* ══════════════════════════════════════════════════════════════════════════
   StrengthDaysScheduler — 重訓訓練日安排（中控台專用）
   ──────────────────────────────────────────────────────────────────────────
   2026-09：從訓練計劃頁搬過來。計劃頁只顯示、不編輯，避免同一件事兩個入口。

   原本計劃頁的防呆只擋「超過上限」，有三個洞：
     ① 沒有下限 —— 可以把訓練日全部取消變成 0 天，整份課表無處可去
     ② 靜默重排 —— 取消某天後所有天重新編號，第 2 天「背」會無聲變成第 1 天
                    落到別的星期，使用者完全不知道課表被打亂
     ③ 不足不提示 —— 課表要 4 天卻只選 3 天也能存，有一天永遠排不進去

   這裡的防呆：
     ① 必須剛好選滿課表需要的天數，不足或超過都不能儲存，並說明還差幾天
     ② 儲存前先把「哪一天的課會落到星期幾」整張表攤開給使用者看
     ③ 同部位連續兩天給軟性警告（恢復不足），提醒但不阻擋
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import apiClient from '../api/client';

const C = { paper: '#F6F4F1', pebble: '#CFC6B8', ink: '#161415', coral: '#F95C4B', ember: '#D94030', olive: '#5A7A3A' };
const RULE = `1px solid ${C.pebble}`;
const DISPLAY = 'var(--font-display), "Tenor Sans", sans-serif';

// UI 由週一排到週日；JS 的 getDay() 是週日=0，兩者要換算
const UI_DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const uiToJs = (uiIdx) => (uiIdx + 1) % 7;
const jsSortKey = (jsIdx) => (jsIdx === 0 ? 7 : jsIdx);   // 週日排最後

export default function StrengthDaysScheduler({ userId, onSaved }) {
    const [plan, setPlan] = useState(null);
    const [selected, setSelected] = useState([]);       // JS weekday indices
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [open, setOpen] = useState(false);

    // ── 讀課表 + 目前的訓練日設定 ──────────────────────────────────
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        (async () => {
            try {
                const { data } = await apiClient.get(`/api/plan/${userId}/latest`);
                if (alive) setPlan(data?.plan || data || null);
            } catch { /* 取不到就維持 null，下面會顯示「尚未建立課表」 */ }
        })();
        try {
            const raw = localStorage.getItem(`weeklyTrainingDays_${userId}`);
            const parsed = raw ? JSON.parse(raw) : null;
            const wk = parsed?.[1] || {};
            setSelected(Object.keys(wk).map(Number).sort((a, b) => jsSortKey(a) - jsSortKey(b)));
        } catch { /* 壞掉的舊資料就當作沒設定 */ }
        return () => { alive = false; };
    }, [userId]);

    // ── 課表需要幾天、每天練什麼 ───────────────────────────────────
    const sessions = useMemo(() => {
        const days = plan?.weeks?.[0]?.days || [];
        return days
            .filter(d => d?.exercises?.length > 0)
            .map((d, i) => ({ n: i + 1, focus: d.focus || d.workout_name || `第 ${i + 1} 天` }));
    }, [plan]);
    const required = sessions.length || plan?.days_per_week || 0;

    // ── 防呆 ① 天數必須剛好 ────────────────────────────────────────
    const diff = selected.length - required;
    const countOk = required > 0 && diff === 0;

    // ── 防呆 ② 攤開「哪一天的課落到星期幾」────────────────────────
    const mapping = useMemo(() => {
        const ordered = [...selected].sort((a, b) => jsSortKey(a) - jsSortKey(b));
        return ordered.map((jsIdx, i) => ({
            jsIdx,
            weekday: UI_DAYS[(jsIdx + 6) % 7],
            session: sessions[i] || null,
        }));
    }, [selected, sessions]);

    // ── 防呆 ③ 同部位連續兩天 ──────────────────────────────────────
    const backToBack = useMemo(() => {
        const hits = [];
        for (let i = 1; i < mapping.length; i++) {
            const prev = mapping[i - 1], cur = mapping[i];
            if (!prev.session || !cur.session) continue;
            const gap = jsSortKey(cur.jsIdx) - jsSortKey(prev.jsIdx);
            if (gap === 1 && prev.session.focus === cur.session.focus) {
                hits.push(`週${prev.weekday}、週${cur.weekday} 連續兩天都練「${cur.session.focus}」`);
            }
        }
        return hits;
    }, [mapping]);

    const toggle = useCallback((jsIdx) => {
        haptic('light');
        setMsg('');
        setSelected(prev => prev.includes(jsIdx)
            ? prev.filter(d => d !== jsIdx)
            : [...prev, jsIdx].sort((a, b) => jsSortKey(a) - jsSortKey(b)));
    }, []);

    const save = useCallback(async () => {
        if (!countOk || saving) return;
        setSaving(true);
        try {
            const reindexed = {};
            [...selected].sort((a, b) => jsSortKey(a) - jsSortKey(b))
                .forEach((jsIdx, i) => { reindexed[jsIdx] = i + 1; });

            const raw = localStorage.getItem(`weeklyTrainingDays_${userId}`);
            const prev = raw ? JSON.parse(raw) : {};
            const totalWeeks = Object.keys(prev).length || 4;
            const updated = {};
            for (let w = 1; w <= totalWeeks; w++) updated[w] = reindexed;

            localStorage.setItem(`weeklyTrainingDays_${userId}`, JSON.stringify(updated));
            await apiClient.put(`/api/plan/${userId}/schedule`, { user_id: userId, schedule: updated });
            setMsg('已儲存，課表已依新的訓練日重新對應。');
            if (onSaved) onSaved(updated);
        } catch {
            setMsg('尚未確認儲存。本機已更新，請確認連線後再開一次這頁同步。');
        } finally { setSaving(false); }
    }, [countOk, saving, selected, userId, onSaved]);

    if (!plan) return null;

    return (
        <section aria-label="重訓訓練日安排" style={{ borderTop: RULE, paddingTop: 16, marginTop: 4 }}>
            <motion.button {...pressProps('row')} type="button" onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.ink,
                }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>重訓訓練日</span>
                <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.50)' }}>
                    {selected.length ? mapping.map(m => `週${m.weekday}`).join('、') : '尚未安排'}
                    <span style={{ marginLeft: 8, color: C.coral, fontWeight: 700 }}>{open ? '收合' : '調整'}</span>
                </span>
            </motion.button>

            {open && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
                    {required > 0 && (
                        <p style={{ fontSize: 12, lineHeight: 1.7, color: 'rgba(22,20,21,0.55)', margin: '0 0 10px' }}>
                            這份課表有 {required} 天，請選滿 {required} 天。
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: 5 }}>
                        {UI_DAYS.map((zh, uiIdx) => {
                            const jsIdx = uiToJs(uiIdx);
                            const on = selected.includes(jsIdx);
                            return (
                                <motion.button {...pressProps('row')} key={zh} type="button" onClick={() => toggle(jsIdx)}
                                    style={{
                                        flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                                        fontSize: 13, fontWeight: 800,
                                        border: on ? `1.5px solid ${C.ink}` : `1px solid rgba(22,20,21,0.14)`,
                                        background: on ? C.ink : '#fff',
                                        color: on ? C.paper : 'rgba(22,20,21,0.45)',
                                    }}>{zh}</motion.button>
                            );
                        })}
                    </div>

                    {/* 防呆 ②：儲存前先攤開對應關係，不讓課表靜默搬家 */}
                    {selected.length > 0 && (
                        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: 'rgba(22,20,21,0.035)' }}>
                            {mapping.map((m, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                    padding: '5px 0', fontSize: 12.5, color: C.ink,
                                }}>
                                    <span style={{ fontWeight: 700 }}>週{m.weekday}</span>
                                    <span style={{ color: m.session ? 'rgba(22,20,21,0.62)' : C.ember }}>
                                        {m.session ? `第 ${m.session.n} 天 · ${m.session.focus}` : '沒有課表可排'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 防呆 ①：天數不符就不給存，並說清楚差多少 */}
                    {required > 0 && diff !== 0 && (
                        <p role="status" style={{ fontSize: 12, fontWeight: 700, color: C.ember, margin: '12px 0 0' }}>
                            {diff < 0 ? `還要再選 ${-diff} 天` : `多選了 ${diff} 天，請取消 ${diff} 天`}
                        </p>
                    )}

                    {/* 防呆 ③：同部位連續兩天 —— 提醒但不阻擋 */}
                    {backToBack.length > 0 && (
                        <p role="status" style={{ fontSize: 12, lineHeight: 1.7, color: 'rgba(22,20,21,0.62)', margin: '10px 0 0' }}>
                            {backToBack.join('；')}。同部位連兩天恢復不足，建議中間隔一天。
                        </p>
                    )}

                    <motion.button {...pressProps('row')} type="button" disabled={!countOk || saving} onClick={save}
                        style={{
                            width: '100%', marginTop: 14, padding: 13, borderRadius: 12, border: 0,
                            cursor: countOk && !saving ? 'pointer' : 'not-allowed',
                            background: countOk ? C.ink : 'rgba(22,20,21,0.10)',
                            color: countOk ? C.paper : 'rgba(22,20,21,0.35)',
                            fontSize: 13.5, fontWeight: 800, fontFamily: DISPLAY, letterSpacing: '0.04em',
                        }}>
                        {saving ? '儲存中…' : '儲存訓練日'}
                    </motion.button>

                    {msg && <p role="status" style={{ fontSize: 12, color: 'rgba(22,20,21,0.62)', margin: '10px 0 0' }}>{msg}</p>}
                </motion.div>
            )}
        </section>
    );
}
