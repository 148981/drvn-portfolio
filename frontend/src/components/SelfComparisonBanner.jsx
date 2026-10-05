import React, { useEffect, useState } from 'react';
import apiClient, { getWorkoutHistory } from '../api/client';
import { getUserId } from '../utils/auth';

// ─────────────────────────────────────────────────────────────
//  SelfComparisonBanner — 「你 vs 上週的自己」
//  研究顯示真正提高留存的是 Self-Comparison，不是 Social-Comparison。
//  放在排行榜最上方，把「我有沒有比上週厲害」擺在「我輸給誰」之前。
//  無資料 → 不渲染。
// ─────────────────────────────────────────────────────────────

const CORAL = '#F95C4B';
const GREEN = '#5A7A3A';
const INK = '#161415';

// ISO 週一 00:00
const mondayOf = (offsetWeeks = 0) => {
    const now = new Date();
    const day = now.getDay() || 7;
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(now.getDate() - (day - 1) - offsetWeeks * 7);
    return d;
};

const SelfComparisonBanner = ({ type = 'run', userId: propUserId }) => {
    const userId = propUserId || getUserId();
    const isRun = type === 'run' || type === 'running';
    const [data, setData] = useState(null); // { thisVal, lastVal }

    useEffect(() => {
        let alive = true;
        if (!userId) return undefined;
        const thisMon = mondayOf(0), lastMon = mondayOf(1);
        (async () => {
            try {
                if (isRun) {
                    const r = await apiClient.get(`/api/cardio/sessions/${userId}?limit=120`);
                    const sessions = r.data?.sessions || [];
                    let tv = 0, lv = 0;
                    sessions.forEach((s) => {
                        const m = s.metrics || s || {};
                        const dist = Number(m.distance_km ?? m.distance ?? 0) || 0;
                        const ts = s.created_at || s.timestamp; const d = ts ? new Date(ts) : null;
                        if (!d || isNaN(d.getTime())) return;
                        if (d >= thisMon) tv += dist; else if (d >= lastMon && d < thisMon) lv += dist;
                    });
                    if (alive) setData({ thisVal: tv, lastVal: lv });
                } else {
                    const raw = await getWorkoutHistory(userId, 200).then(d => (d?.history && Array.isArray(d.history) ? d.history : (Array.isArray(d) ? d : []))).catch(() => []);
                    let tv = 0, lv = 0;
                    raw.forEach((w) => {
                        const vol = Number(w.total_volume ?? w.volume ?? 0) || 0;
                        const ts = w.timestamp || w.date; const d = ts ? new Date(ts) : null;
                        if (!d || isNaN(d.getTime())) return;
                        if (d >= thisMon) tv += vol; else if (d >= lastMon && d < thisMon) lv += vol;
                    });
                    if (alive) setData({ thisVal: tv, lastVal: lv });
                }
            } catch (_) { /* 靜默 */ }
        })();
        return () => { alive = false; };
    }, [userId, isRun]);

    if (!data || (data.thisVal <= 0 && data.lastVal <= 0)) return null;

    const unit = isRun ? 'km' : 'kg';
    const fmt = (v) => isRun ? v.toFixed(1) : Math.round(v).toLocaleString();
    const { thisVal, lastVal } = data;
    const delta = thisVal - lastVal;
    const pct = lastVal > 0 ? (delta / lastVal) * 100 : null;
    const ahead = delta >= 0;

    let line;
    if (lastVal <= 0) {
        line = '這是你本週的基準——下週就有得比了。';
    } else if (ahead) {
        line = `已經比上週的自己多了 ${fmt(Math.abs(delta))} ${unit}${pct != null ? `（+${Math.round(pct)}%）` : ''}，繼續超越。`;
    } else {
        line = `再 ${fmt(Math.abs(delta))} ${unit} 就追上上週的自己了。`;
    }

    return (
        <div style={{
            padding: '16px 18px', borderRadius: 20, position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(249,92,75,0.12), rgba(249,92,75,0.03))',
            border: '1px solid rgba(249,92,75,0.22)',
        }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: CORAL, marginBottom: 8 }}>
                你 vs 上週的自己
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 34, fontWeight: 300, color: INK, letterSpacing: '-0.02em' }}>{fmt(thisVal)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>{unit} · 本週</span>
                {lastVal > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: ahead ? GREEN : CORAL }}>
                        {ahead ? '▲' : '▼'} {pct != null ? `${Math.abs(Math.round(pct))}%` : fmt(Math.abs(delta))}
                    </span>
                )}
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'rgba(22,20,21,0.75)', margin: '8px 0 0', fontWeight: 500 }}>{line}</p>
        </div>
    );
};

export default SelfComparisonBanner;
