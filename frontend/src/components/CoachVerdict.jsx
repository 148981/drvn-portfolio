/**
 * CoachVerdict — 圖表下方的「結論＋下一步」（重訓進階圖表用）
 * 一行大字（現在怎樣）＋一行小字（下一次做什麼）。沒有結論就不畫。
 */
import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function CoachVerdict({ note, dark = false, style }) {
    if (!note?.title) return null;
    const ink = dark ? '#F6F4F1' : '#161415';
    return (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${dark ? 'rgba(246,244,241,0.12)' : 'rgba(22,20,21,0.08)'}`, ...style }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: ink, letterSpacing: '-0.01em' }}>{note.title}</div>
            {note.action && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, minWidth: 0 }}>
                    <ArrowRight size={13} color="#F95C4B" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: dark ? 'rgba(246,244,241,0.72)' : 'rgba(22,20,21,0.62)', minWidth: 0 }}>{note.action}</span>
                </div>
            )}
        </div>
    );
}
