import React from 'react';
import { motion } from 'framer-motion';
// 🎨 與最新動態共用同一份卡片外殼（金屬底／玻璃罩／浮水印／獎牌徽章／一起練）
import {
    SportGlyph as ChromeGlyph, SportWatermark, MedalBadge, MedalList, CompanionLine,
    metalCardStyle, CardMaterialLayers,
} from './ui/ActivityCardChrome';
import { sportIconSrc, hasSportIcon } from '../utils/sportIcons';

/**
 * FriendActivityCard — 好友動態卡（版型對齊「最近動態」ActivityFeedMobile）
 * ──────────────────────────────────────────────────────────────────────
 * 目的：讓「好友動態」與首頁「最近動態」長得一樣——同一套運動色 liquid-glass 卡、
 *       運動圖示磚、大級數據、路線縮圖。差別只在頂列多一個「好友頭像 + 名字」。
 *
 * 刻意「自給自足」：不引入 Leaflet（用輕量 SVG RouteMini 畫路線縮圖），
 * 避免把地圖套件拉進社群頁造成 bundle 膨脹。
 *
 * props.activity 需正規化為：
 *   { sport, distance, durationSec, paceSec, elev, volumeKg, sets, route, prCount,
 *     medals, companions, createdAt }
 * props.friend（可選）：{ name, discriminator, avatar, init, isMe }
 * props.onClick / props.onPeekProfile
 */

const C = { ink: '#161415', coral: '#F95C4B' };

const SPORT_ZH = {
    running: '跑步', run: '跑步', free: '自由跑', cycling: '自行車',
    trail_running: '越野跑', trail: '越野跑', hiking: '健行', hike: '健行',
    swimming: '游泳', swim: '游泳', skiing: '滑雪', ski: '滑雪',
    strength: '重訓', gym: '重訓', cardio: '有氧', hiit: '間歇',
};
const SPORT_COLOR = {
    running: '#F0876E', run: '#F0876E', free: '#F0876E', cycling: '#78A0D2',
    trail_running: '#7EC8B4', trail: '#7EC8B4', hiking: '#8FB56A',
    swimming: '#5EB6CC', swim: '#5EB6CC', skiing: '#B48CD2', ski: '#B48CD2',
    strength: '#C9A25A', gym: '#C9A25A', cardio: '#F0876E', hiit: '#E07A9A',
};
const keyOf = (s) => String(s || 'running').toLowerCase();
const labelOf = (s) => SPORT_ZH[keyOf(s)] || '運動';
const colorOf = (s) => SPORT_COLOR[keyOf(s)] || C.coral;

const fmtDur = (sec) => {
    if (!sec) return '—';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const fmtPace = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"` : '—');
const WEEKDAY = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

const SportGlyph = ({ sport, size = 22, color = C.ink }) => {
    const k = keyOf(sport);
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (k) {
        case 'cycling': return (<svg {...p}><circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17l4-7h5l-3 7M10 10l-1.5-3H6" /></svg>);
        case 'trail_running': case 'trail': return (<svg {...p}><path d="M3 19l5-9 4 6 3-5 6 8z" /></svg>);
        case 'hiking': case 'hike': return (<svg {...p}><circle cx="13" cy="4.5" r="1.6" /><path d="M13 8l-2 5 3 2 1 5M11 13l-3 1-2 5M16 9l2 1 2-1M6 21V11" /></svg>);
        case 'swimming': case 'swim': return (<svg {...p}><circle cx="15" cy="7" r="1.6" /><path d="M5 13c1.5-1 2.5-1 4 0s2.5 1 4 0M5 17c1.5-1 2.5-1 4 0s2.5 1 4 0M8 13l4-3 3 2" /></svg>);
        case 'strength': case 'gym': return (<svg {...p}><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></svg>);
        case 'cardio': case 'hiit': return (<svg {...p}><path d="M3 12h4l2-5 3 10 2-5h7" /></svg>);
        default: return (<svg {...p}><circle cx="15" cy="4.5" r="1.6" /><path d="M14 8l-3 3 2 3 1 5M11 11l-3 1-1 4M13 14l4 1" /></svg>);
    }
};

const RouteMini = ({ route, color, size = 72 }) => {
    let points = null;
    if (Array.isArray(route) && route.length >= 2) {
        try {
            const lats = route.map((p) => p.lat ?? p[0]);
            const lngs = route.map((p) => p.lng ?? p[1]);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
            const range = Math.max(maxLat - minLat, maxLng - minLng) || 0.0001;
            const pad = 8, scale = (size - pad * 2) / range;
            points = route.map((p) => {
                const lat = p.lat ?? p[0], lng = p.lng ?? p[1];
                return `${pad + (lng - minLng) * scale},${size - (pad + (lat - minLat) * scale)}`;
            }).join(' ');
        } catch { points = null; }
    }
    const deco = `${8},${size * 0.7} ${size * 0.3},${size * 0.35} ${size * 0.55},${size * 0.6} ${size - 8},${size * 0.25}`;
    const pts = points || deco;
    const last = pts.split(' ').pop().split(',');
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', opacity: points ? 1 : 0.5 }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            {last.length === 2 && <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />}
        </svg>
    );
};

const FriendActivityCard = ({ activity, friend, index = 0, onClick, onPeekProfile }) => {
    const a = activity || {};
    const k = keyOf(a.sport);
    const isStrength = k === 'strength' || k === 'gym';
    const isBasic = k !== 'running' && k !== 'run' && k !== 'free';
    const col = colorOf(a.sport);
    const sd = a.createdAt ? new Date(a.createdAt) : new Date();
    const prCount = Number(a.prCount || 0) || 0;

    const metrics = isStrength ? [
        { v: a.volumeKg > 0 ? Math.round(a.volumeKg).toLocaleString() : '—', u: 'KG', label: '訓練量' },
        { v: a.durationSec > 0 ? fmtDur(a.durationSec) : '—', u: '', label: '時間' },
        { v: a.sets > 0 ? String(a.sets) : '—', u: '組', label: '組數' },
    ] : [
        { v: a.distance > 0 ? Number(a.distance).toFixed(2) : '—', u: 'KM', label: '距離' },
        { v: a.durationSec > 0 ? fmtDur(a.durationSec) : '—', u: '', label: '時間' },
        isBasic
            ? { v: a.elev > 0 ? Math.round(a.elev) : '—', u: 'M', label: '爬升' }
            : { v: a.paceSec > 0 ? fmtPace(a.paceSec) : '—', u: '/KM', label: '配速' },
    ];

    return (
        <motion.button
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.05, 0.4) }}
            onClick={onClick}
            className="ti-surface-photo"
            style={metalCardStyle({ clickable: !!onClick })}
        >
            {/* 🪙 材質層：金屬色溫 → 大浮水印 → Liquid Glass 罩 → 左緣色條 */}
            <CardMaterialLayers color={col} />
            <div style={{ position: 'relative', zIndex: 3 }}>

            {/* 好友頭像 + 名字（比最近動態多這一列） */}
            {friend && (
                <div
                    onClick={(e) => { e.stopPropagation(); onPeekProfile?.(friend.uId); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, position: 'relative' }}
                >
                    <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${col}55`, background: '#fff', flexShrink: 0 }}>
                        {friend.avatar
                            ? <img loading="lazy" src={friend.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontStyle: 'italic', color: C.ink }}>{friend.init}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{friend.name}</span>
                        {friend.discriminator && <span style={{ fontSize: 11, fontStyle: 'italic', color: 'rgba(22,20,21,0.4)', marginLeft: 4 }}>#{friend.discriminator}</span>}
                        {friend.isMe && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: '#fff', background: C.coral, padding: '1px 6px', borderRadius: 99 }}>你</span>}
                    </div>
                </div>
            )}

            {/* 頂列：運動圖示 + 名稱 + 日期 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, position: 'relative' }}>
                {/* 運動圖示：不加白色格子，直接放圖 —— 與最新動態同一顆 icon
                    （使用者：「不要做格子在卡牌上，那個 icon 用跟最近動態一樣的」） */}
                <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                    {hasSportIcon(keyOf(a.sport))
                        ? <img src={sportIconSrc(keyOf(a.sport))} alt={labelOf(a.sport)} style={{ width: 36, height: 36, objectFit: 'contain' }} />
                        : <ChromeGlyph sport={a.sport} size={26} color={col} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{labelOf(a.sport)}</span>
                        {/* 🏅 破紀錄徽章（與最新動態同一套判定） */}
                        <MedalBadge medals={a.medals} />
                    </div>
                    {prCount > 0 && !(a.medals || []).length && (
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#B8860B', marginTop: 2 }}>破 {prCount} 項紀錄</div>
                    )}
                    <MedalList medals={a.medals} max={3} />
                    <CompanionLine companions={a.companions} color={col} strength={isStrength} compact />
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.55)' }}>
                        {sd.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} {WEEKDAY[sd.getDay()]}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.35)', marginTop: 2 }}>
                        {sd.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                </div>
            </div>

            {/* 下列：數據 + 路線縮圖 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
                {/* 🏋️ 大啞鈴浮水印（與最新動態同一份） */}
                <SportWatermark strength={isStrength} color={col} />
                <div style={{ display: 'flex', gap: 20, position: 'relative' }}>
                    {metrics.map((mt, idx) => (
                        <div key={idx}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                                <span style={{ fontSize: 23, fontWeight: 300, color: C.ink, letterSpacing: '-0.02em' }} className="tabular-nums">{mt.v}</span>
                                {mt.u && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.45)' }}>{mt.u}</span>}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.4)', letterSpacing: '0.08em', marginTop: 2 }}>{mt.label}</div>
                        </div>
                    ))}
                </div>
                {!isStrength && (
                    <div style={{ flexShrink: 0 }}>
                        <RouteMini route={a.route} color={C.ink} size={72} />
                    </div>
                )}
            </div>
            </div>{/* /內容層 */}
        </motion.button>
    );
};

export default FriendActivityCard;
