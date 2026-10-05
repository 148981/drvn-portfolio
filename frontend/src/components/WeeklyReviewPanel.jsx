import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';

// ─────────────────────────────────────────────────────────────
//  WeeklyReviewPanel — 每週回顧（逐肌群）
//  嵌入 FeedbackResultModal（第四週結算）頂部。資料來自 /api/review/weekly/{userId}
//  逐肌群訓練量增減 + 力量/肌肥大/一致性 + 最佳肌群 + 一句突破 + 下週建議。
//  無資料 → 不渲染。
// ─────────────────────────────────────────────────────────────

const INK = '#161415';
const CORAL = '#F95C4B';
const GREEN = '#5A7A3A';

const WeeklyReviewPanel = ({ userId: propUserId }) => {
    const userId = propUserId || getUserId();
    const [rv, setRv] = useState(null);

    useEffect(() => {
        let alive = true;
        if (!userId) return undefined;
        (async () => {
            try {
                const { data } = await apiClient.get(`/api/review/weekly/${userId}`);
                if (alive && data?.review) setRv(data.review);
            } catch (_) { /* 靜默 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    // 沒有真實訓練紀錄 → 整塊不渲染。
    // 舊版是照樣畫五條肌群長條圖，只在標題後面加「· 示意」——
    // 那五個數字（胸 5200 kg…）是後端編的，不是這位使用者的。
    if (!rv || rv.is_mock || !(rv.muscles || []).length) return null;

    const maxVol = Math.max(1, ...(rv.muscles || []).map(m => m.volume || 0));

    return (
        <div style={{ marginBottom: 22, padding: '16px 16px 18px', borderRadius: 18, background: 'rgba(22,20,21,0.03)', border: '1px solid rgba(22,20,21,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.45)' }}>
                    本週回顧
                </span>
                {rv.best_muscle && (
                    <span style={{ fontSize: 11, fontWeight: 900, color: CORAL }}>最佳肌群 · {rv.best_muscle}</span>
                )}
            </div>

            {/* 力量 / 肌肥大 / 一致性 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {(rv.metrics || []).map((m, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.45)', marginBottom: 3 }}>{m.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 300, color: m.up ? GREEN : CORAL }}>{m.delta}</div>
                    </div>
                ))}
            </div>

            {/* 逐肌群 mini bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {(rv.muscles || []).map((m, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 30, fontSize: 11, fontWeight: 800, color: INK, flexShrink: 0 }}>{m.name}</span>
                        <div style={{ flex: 1, height: 7, borderRadius: 5, background: 'rgba(22,20,21,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(4, Math.round((m.volume / maxVol) * 100))}%`, height: '100%', borderRadius: 5, background: m.status === '本週最佳' ? `linear-gradient(90deg, ${CORAL}, #D94030)` : 'rgba(22,20,21,0.5)' }} />
                        </div>
                        <span style={{ width: 44, textAlign: 'right', fontSize: 11, fontWeight: 800, color: m.up ? GREEN : CORAL, flexShrink: 0 }}>{m.delta}</span>
                    </div>
                ))}
            </div>

            {/* 一句突破 + 下週建議 */}
            {rv.summary && (
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: INK, margin: '0 0 8px', fontWeight: 500 }}>{rv.summary}</p>
            )}
            {rv.next_week && (
                <div style={{ borderLeft: `2px solid ${CORAL}`, paddingLeft: 10 }}>
                    <p style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(22,20,21,0.72)', margin: 0 }}>{rv.next_week}</p>
                </div>
            )}
        </div>
    );
};

export default WeeklyReviewPanel;
