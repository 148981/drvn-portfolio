import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';

/* ════════════════════════════════════════════════════════════
   PostBodyCards — DRVN 共用貼文呈現組件
   發帖預覽 (IGPostComposer) 與 Feed 貼文卡 (SocialHubMobile) 共用
   同一個呈現，確保「預覽 = 發出去」完全一致。
   風格：瑞士極簡編輯排版（Paper 暖白底、輕量大數字、tracked-caps、hairline 行）。
══════════════════════════════════════════════════════════════ */

const FONT_SANS = 'var(--font-body)';
const FONT_MONO = 'var(--font-mono)';
const CORAL = '#F95C4B';
const INK = '#161415';

const PACE_LABEL = { easy: '輕鬆跑', tempo: '節奏跑', interval: '間歇 / 速度', long: 'LSD 長跑' };
const FIT_PACE_LABEL = { easy: '輕鬆泵感', tempo: '穩定增肌', interval: '大重量力量', long: '超級組 / 力竭' };

const cardShell = {
    position: 'relative', width: '100%', borderRadius: 28, overflow: 'hidden',
    background: 'linear-gradient(160deg, #F6F4F1 0%, #F2ECE2 100%)',
    border: '1px solid rgba(207,198,184,0.85)',
    boxShadow: '0 10px 30px -14px rgba(32,32,32,0.16), inset 0 1px 0 rgba(255,255,255,0.85)',
    padding: '28px 24px', color: INK,
};

const Kicker = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 2, height: 11, borderRadius: 99, background: CORAL }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(22,20,21,0.55)' }}>
            {children}
        </span>
    </div>
);

const Row = ({ k, v }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid rgba(22,20,21,0.10)' }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(22,20,21,0.45)' }}>{k}</span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 16, fontWeight: 500, color: INK, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
);

/* ── 純數據卡（跑步 / 健身）──
   props: { type:'run'|'fitness', bigValue, bigUnit, label, rows:[[k,v],...], date, empty } */
export function DataStatCard({ type = 'run', bigValue, bigUnit, label, rows = [], date, empty = false, bleed = false }) {
    return (
        <div style={bleed ? { ...cardShell, borderRadius: 0, border: 'none', boxShadow: 'none', padding: '32px 24px' } : cardShell}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                <Kicker>{empty ? '預覽' : (type === 'run' ? '跑步' : '重訓')}</Kicker>
                {date && <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.04em', color: 'rgba(22,20,21,0.4)' }}>{date}</span>}
            </div>
            {empty ? (
                <div style={{ padding: '12px 0' }}>
                    <p style={{ fontFamily: FONT_SANS, fontSize: 22, fontWeight: 300, color: 'rgba(22,20,21,0.3)', letterSpacing: '-0.02em', margin: 0 }}>選一筆下方的訓練</p>
                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.4)', margin: '6px 0 0', fontFamily: FONT_SANS }}>預覽會出現在這裡</p>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: FONT_SANS, fontSize: 72, fontWeight: 300, color: INK, letterSpacing: '-0.04em', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>
                            {bigValue}
                        </span>
                        <span style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 600, color: 'rgba(22,20,21,0.45)' }}>{bigUnit}</span>
                    </div>
                    <p style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(22,20,21,0.45)', margin: '0 0 20px' }}>{label}</p>
                    {rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
                </>
            )}
        </div>
    );
}

/* ── 揪團卡（跑步約跑 / 健身約練）──
   props: { meetup:{when,place,dist,pace,route,slots}, onJoin, joinLabel, isFitness } */
export function MeetupCard({ meetup = {}, onJoin, joinLabel = '我要參加', isFitness = false }) {
    const paceLabel = (isFitness ? FIT_PACE_LABEL : PACE_LABEL)[meetup.pace] || meetup.pace || (isFitness ? '輕鬆泵感' : '輕鬆跑');
    const rows = [
        meetup.place ? ['地點', meetup.place] : null,
        meetup.dist ? (isFitness ? ['時長', `${meetup.dist} 分鐘`] : ['距離', `${meetup.dist} 公里`]) : null,
        meetup.route ? [isFitness ? '部位' : '路線', meetup.route] : null,
        ['名額', meetup.slots ? `${meetup.slots} 人` : '不限'],
    ].filter(Boolean);
    return (
        <div style={cardShell}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <Kicker>揪團</Kicker>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.35)' }}>{meetup.when || '時間未定'}</span>
            </div>
            {/* 大標 */}
            <p style={{ fontFamily: FONT_SANS, fontSize: 30, fontWeight: 300, color: INK, letterSpacing: '-0.02em', lineHeight: 1.0, margin: '0 0 4px' }}>
                {isFitness ? '揪團健身' : '揪團約跑'}
            </p>
            <p style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(22,20,21,0.45)', margin: '0 0 18px' }}>{paceLabel}</p>
            {rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
            <motion.button {...pressProps('row')}
 onClick={onJoin}
 style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: 99, cursor: 'pointer',
 background: CORAL, color: '#fff', border: 'none',
 fontFamily: FONT_SANS, fontSize: 14, fontWeight: 800, letterSpacing: '0.02em', minHeight: 44 }}>
                {joinLabel}
            </motion.button>
        </div>
    );
}

export default { DataStatCard, MeetupCard };
