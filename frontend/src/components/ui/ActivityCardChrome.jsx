/**
 * ══════════════════════════════════════════════════════════════════════════
 * ActivityCardChrome — 運動動態卡的「外殼」單一真相源
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 最新動態（ActivityFeedMobile）與社群動態（SocialPage / FriendActivityCard）
 * 顯示的是同一批訓練，卡片本來卻是兩份各自維護的樣式 ——
 * 改了一邊另一邊就對不上，使用者會覺得是兩個不同的 App。
 *
 * 材質（依 DRVN 設計語言）：
 *   底  拉絲金屬霧面 `.ti-surface-photo`（真實金屬紋 + 白玻璃罩）
 *   ↑   運動語義色極淡一層（讓卡片有這個運動的溫度，但不蓋掉金屬紋）
 *   ↑   大浮水印（重訓＝啞鈴；其他＝該運動圖示）— 像壓在金屬上的紋，不是貼圖
 *   ↑   Liquid Glass 罩 `.ti-glass-veil`
 *   ↑   內容（z-index 3）
 *
 * 破紀錄徽章與獎牌明細也在這裡，名次一律吃 utils/prMedals 的判定。
 */

import React from 'react';
import { medalSrc } from '../../utils/sportIcons';
import { summarizeMedals } from '../../utils/prMedals';

const INK = '#161415';

// ── 運動 → SVG 線稿（無 emoji，全站共用這一份）─────────────────────────────
export const SportGlyph = ({ sport, size = 22, color = INK }) => {
    const k = String(sport || 'running').toLowerCase();
    const p = {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
    };
    switch (k) {
        case 'cycling': case 'bike':
            return (<svg {...p}><circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17l4-7h5l-3 7M10 10l-1.5-3H6" /></svg>);
        case 'trail_running': case 'trail':
            return (<svg {...p}><path d="M3 19l5-9 4 6 3-5 6 8z" /></svg>);
        case 'hiking': case 'hike':
            return (<svg {...p}><circle cx="13" cy="4.5" r="1.6" /><path d="M13 8l-2 5 3 2 1 5M11 13l-3 1-2 5M16 9l2 1 2-1M6 21V11" /></svg>);
        case 'swimming': case 'swim':
            return (<svg {...p}><circle cx="15" cy="7" r="1.6" /><path d="M5 13c1.5-1 2.5-1 4 0s2.5 1 4 0M5 17c1.5-1 2.5-1 4 0s2.5 1 4 0M8 13l4-3 3 2" /></svg>);
        case 'skiing': case 'ski':
            return (<svg {...p}><circle cx="14" cy="5" r="1.5" /><path d="M5 19l13-3M7 12l4 2-1 4M11 8l3 4 4 1" /></svg>);
        case 'strength': case 'gym':
            return (<svg {...p}><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></svg>);
        case 'cardio': case 'hiit': case 'rowing': case 'elliptical':
            return (<svg {...p}><path d="M3 12h4l2-5 3 10 2-5h7" /></svg>);
        default:
            return (<svg {...p}><circle cx="15" cy="4.5" r="1.6" /><path d="M14 8l-3 3 2 3 1 5M11 11l-3 1-1 4M13 14l4 1" /></svg>);
    }
};

// ── 大啞鈴（浮水印用；比 lucide 的粗線 icon 更像器材本身）────────────────
/* ⚠️ 五個矩形一定要「互相重疊」才會融成一個啞鈴剪影。
   第一版留了 2–3px 的縫、又加了 stroke，渲染出來是五塊分開的灰色圓角方塊，
   完全看不出是啞鈴（螢幕截圖驗證後才發現）。這裡改成純 fill + 重疊。 */
export const DumbbellMark = ({ color = '#7E838B' }) => (
    <svg viewBox="0 0 124 48" width="100%" height="100%" aria-hidden focusable="false">
        <g fill={color}>
            <rect x="0" y="12" width="15" height="24" rx="5" />
            <rect x="11" y="2" width="18" height="44" rx="7" />
            <rect x="26" y="17" width="72" height="14" rx="7" />
            <rect x="95" y="2" width="18" height="44" rx="7" />
            <rect x="109" y="12" width="15" height="24" rx="5" />
        </g>
    </svg>
);

/**
 * 卡片上的大浮水印。壓在金屬底上、Liquid Glass 之下 ——
 * 遠看就知道這張卡是什麼運動，近看不會跟數據搶。
 */
export const SportWatermark = ({ sport, color, strength }) => {
    /* 只有重訓放浮水印。跑步／有氧卡下方本來就有整條真實路線地圖當視覺主體，
       再壓一個運動圖示上去只會跟日期、地點、配速打架（截圖驗證過）。 */
    if (!strength) return null;
    const k = String(sport || '').toLowerCase();
    return (
        <span
            aria-hidden
            style={{
                /* z-index 2 = 在霧面玻璃罩之上、內容之下。
                   放在玻璃底下試過：7px 的 backdrop blur 會把它整個糊掉，
                   等於沒有浮水印。浮水印要「在卡牌上」，不是在卡牌裡面。 */
                /* 掛在「數據列」上（呼叫端把它放進數據列 div），垂直置中對齊數字。
                   ⚠ 原本是相對整張卡片絕對定位在 top:86 —— 短卡（沒有菜單那種）
                   高度只有 ~140px，啞鈴下半截直接被 overflow 切掉，看起來像壞圖。
                   改成貼著數據列，卡片多長都對得準。 */
                position: 'absolute', zIndex: 0, pointerEvents: 'none',
                right: -28, top: '50%', width: 206, height: 78,
                transform: 'translateY(-50%) rotate(-12deg)',
                // 半透 + 下緣一道白高光，像壓在金屬面上的紋
                opacity: 0.24,
                filter: 'drop-shadow(0 1.5px 0 rgba(255,255,255,0.85))',
            }}
        >
            <DumbbellMark color="#7E838B" />
        </span>
    );
};

/**
 * 🏅 破紀錄徽章 — 有金/銀/銅才出現，釘在運動圖示磚的右上角。
 * 「這次有沒有破紀錄」要一眼看到；破了什麼留給下面的 MedalList。
 */
export const MedalBadge = ({ medals = [] }) => {
    const list = Array.isArray(medals) ? medals.filter((m) => m && m.rank) : [];
    if (!list.length) return null;
    const sum = summarizeMedals(list);
    if (!sum.total) return null;
    const ranks = [];
    if (sum.gold) ranks.push('PR');
    if (sum.silver) ranks.push('2nd');
    if (sum.bronze) ranks.push('3rd');
    /* 行內小藥丸，放在標題旁邊。
       原本是絕對定位釘在運動圖示磚的右上角 —— 實際渲染出來會壓到標題和
       「胸 / 背·二頭」那行，三面獎牌擠在 44px 的角上也糊成一團。 */
    return (
        <span
            aria-label={`破紀錄 ${sum.total} 面獎牌`}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
                padding: '2px 7px 2px 4px', borderRadius: 999, verticalAlign: 'middle',
                background: 'rgba(255,255,255,0.82)',
                border: '1px solid rgba(255,255,255,0.95)',
                boxShadow: '0 2px 6px -2px rgba(40,42,50,0.26), inset 0 1px 0 rgba(255,255,255,1)',
            }}
        >
            {ranks.slice(0, 3).map((r) => (
                <img key={r} src={medalSrc(r)} alt="" style={{ width: 13, height: 13, objectFit: 'contain' }} />
            ))}
            <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 900, color: '#8A6B22' }}>
                {sum.total}
            </span>
        </span>
    );
};

/** 獎牌明細：本場金銀銅幾面 + 破了哪幾項（最多 4 項）。 */
export const MedalList = ({ medals = [], max = 2 }) => {
    const list = Array.isArray(medals) ? medals.filter((m) => m && m.rank) : [];
    if (!list.length) return null;
    const sum = summarizeMedals(list);
    const parts = [];
    if (sum.gold) parts.push(`金 ${sum.gold}`);
    if (sum.silver) parts.push(`銀 ${sum.silver}`);
    if (sum.bronze) parts.push(`銅 ${sum.bronze}`);
    return (
        <>
            {parts.length > 0 && (
                <div style={{ fontSize: 11, fontWeight: 800, color: '#B8860B', marginTop: 3, letterSpacing: '0.02em' }}>
                    本場獎牌 {parts.join(' · ')}　共 {sum.total} 面
                </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginTop: 3, maxWidth: 210 }}>
                {list.slice(0, max).map((md, mi) => (
                    <span key={md.key || mi} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <img src={medalSrc(md.rank)} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.68)' }}>
                            {md.label}{md.detail ? ` ${md.detail}` : ''}
                        </span>
                    </span>
                ))}
                {list.length > max && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.4)' }}>+{list.length - max}</span>
                )}
            </div>
        </>
    );
};

/** 金屬霧面卡的外框樣式（搭配 className="ti-surface-photo" 使用）。 */
export const metalCardStyle = ({ clickable = true, dimmed = false } = {}) => ({
    width: '100%', textAlign: 'left', cursor: clickable ? 'pointer' : 'default',
    position: 'relative', overflow: 'hidden', borderRadius: 26, padding: '18px 20px',
    isolation: 'isolate',
    border: '1px solid rgba(255,255,255,0.92)',
    boxShadow: `0 14px 32px -16px rgba(40,42,50,0.34), 0 2px 6px rgba(40,42,50,0.05),
                inset 0 1.5px 1px rgba(255,255,255,1), inset 0 -2px 6px rgba(180,186,198,0.22)`,
    opacity: dimmed ? 0.92 : 1,
});

/**
 * 卡片的材質層（放在卡片容器內、內容之前）：
 * 運動色薄層 → 大浮水印 → Liquid Glass 罩 → 左緣色條。
 * 內容記得包一層 `style={{ position:'relative', zIndex:3 }}`。
 */
export const CardMaterialLayers = ({ color }) => (
    <>
        <span aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 0, borderRadius: 'inherit', pointerEvents: 'none',
            background: `linear-gradient(150deg, ${color}2B 0%, ${color}12 46%, transparent 80%)`,
        }} />
        <span className="ti-glass-veil" aria-hidden />
        {/* 拉絲髮絲紋：玻璃罩的 blur 會把底下照片的金屬紋磨掉，
            補一層極細的方向性紋路，霧面才還是「金屬」霧面而不是一片奶油色。 */}
        <span aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', borderRadius: 'inherit',
            background: `repeating-linear-gradient(90deg,
                rgba(255,255,255,0) 0px, rgba(255,255,255,0.55) 0.5px, rgba(255,255,255,0) 1px,
                rgba(116,120,130,0.07) 1.7px, rgba(255,255,255,0) 2.7px)`,
        }} />
        <span aria-hidden style={{
            position: 'absolute', left: 0, top: 16, bottom: 16, width: 3, zIndex: 2,
            borderRadius: '0 3px 3px 0', background: color, opacity: 0.7,
        }} />
    </>
);

/**
 * 🤝 一起練 — 卡片上的同行者列。
 * 資料來自存檔時寫進 session 的 companions（社群「一起練」按了加入的人，
 * 或時間＋GPS 偵測到的同行者）。沒有就整列不出現，不擺空殼。
 */
export const CompanionLine = ({ companions = [], color = '#F95C4B', strength = false, compact = false }) => {
    const list = Array.isArray(companions) ? companions.filter((c) => c && (c.userId || c.user_id)) : [];
    if (!list.length) return null;
    const names = list.slice(0, 2).map((c) => c.name || '夥伴').join('、');
    const more = list.length > 2 ? ` 等 ${list.length} 人` : '';
    const verb = strength ? '練' : '跑';
    if (compact) {
        return (
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.55)', marginTop: 3 }}>
                和 {names}{more} 一起{verb}
            </div>
        );
    }
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 11px', borderRadius: 12,
            background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.65)', marginTop: 12,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#161415' }}>
                和 {names}{more} 一起{verb}
            </span>
        </div>
    );
};

export default {
    SportGlyph, DumbbellMark, SportWatermark,
    MedalBadge, MedalList, CompanionLine,
    metalCardStyle, CardMaterialLayers,
};
