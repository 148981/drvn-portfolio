import React from 'react';
import { formatPace as fmtPace } from '../utils/format';


// 🚩 核心配色：Minimalist Premium System
const T = {
    primary: '#F95C4B', // Coral
    stone: '#E4DED2',   // Stone (次要文字、邊框)
    pebble: '#CFC6B8',  // Pebble (過渡色)
    paper: '#F6F4F1',   // Paper (主要對比文字色)
    bg: '#000000',      // Deep Pure Black (背景)
    surface: 'rgba(228, 222, 210, 0.05)', // 基於 Stone 的極透底色
    text: {
        bright: '#FFFFFF', // 主要亮色
        subtle: 'rgba(255, 255, 255, 0.65)', // 微調亮色次要文字
        micro: 'rgba(255, 255, 255, 0.35)', // 極淡文字
    },
};

// 🆎 統一字型
//   Tenor Sans 只有 Regular 一個字重（專案只載入 TenorSans-Regular），fontWeight:700 對它無效，
//   這是分享小卡看起來偏細、對比不夠的原因。改用「有真實粗體字檔」的 Plus Jakarta Sans：
//   - FONT_STAT：數字 → Plus Jakarta Sans 800（運動雜誌粗體感，數字更明顯）
//   - FONT_LABEL：小標 → Plus Jakarta Sans 700（幾何無襯線 = 瑞士極簡粗小標）
const FONT_NUM = '"Plus Jakarta Sans", "Tenor Sans", system-ui, sans-serif';   // 舊名保留相容
const FONT_STAT = '"Plus Jakarta Sans", "Tenor Sans", system-ui, sans-serif';  // 數字（配 fontWeight:800）
const FONT_LABEL = '"Plus Jakarta Sans", system-ui, sans-serif';               // 小標（配 fontWeight:700）

// 🟢 瑞士極簡：深色「橡膠地墊」質感底（用 radial dots 疊在純黑上模擬圖一的點狀紋理）。
//    這是 CSS 生成、可被 html2canvas 擷取，不依賴外部圖片。
const swissMatBg = (alpha = 1) => ({
    background: `
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.025) 0.6px, transparent 1.4px) 0 0 / 26px 26px,
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.02) 0.6px, transparent 1.4px) 13px 13px / 26px 26px,
        #0B0B0C
    `,
    // 透明度線性：整張卡的不透明度直接等於 alpha（0→100% 線性）
    opacity: alpha,
});

// --- Helper: Pace Formatter ---
export const formatPace = fmtPace;   // 🩹 J: 單一真相源 → utils/format.js

// --- Helper: 從 cardioData 取出可顯示的日期字串 ──
const formatCardDate = (data) => {
    let d;
    const raw = data?.timestamp ?? data?.created_at ?? data?.date;
    if (raw) {
        d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
        if (isNaN(d.getTime())) d = new Date();
    } else {
        d = new Date();
    }
    // 例：JUN 29（圖一大寫風格）
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

// --- Helper: 運動類型 footer 文字（如 RUN × BIKE / RUN / RIDE）──
const SPORT_FOOTER = {
    running: 'RUN', run: 'RUN', free: 'RUN',
    cycling: 'BIKE', trail_running: 'TRAIL', trail: 'TRAIL',
    hiking: 'HIKE', hike: 'HIKE', swimming: 'SWIM', swim: 'SWIM', skiing: 'SKI', ski: 'SKI',
};
const sportFooter = (data) => {
    // 🗑️ 依需求：三種分享模板底部不再顯示 RUN / RIDE 等運動小字（一律不加）。
    void data; void SPORT_FOOTER;
    return '';
};

// --- Helper: 安全取數值 ──
const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const fmtClock = (sec) => `${Math.floor(sec / 60)}'${String(Math.floor(sec % 60)).padStart(2, '0')}"`;

// --- Helper: Minimalist Route Map (SVG) ---
export const RouteThumbnail = ({ route, color, size = 60, strokeWidth = 3 }) => {
    if (!route || route.length < 2) return null;
    try {
        const lats = route.map(p => p.lat !== undefined ? p.lat : p[0]);
        const lngs = route.map(p => p.lng !== undefined ? p.lng : p[1]);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const range = Math.max(maxLat - minLat, maxLng - minLng) || 0.0001;
        const padding = 6;
        const scale = (size - padding * 2) / range;

        const points = route.map(p => {
            const lat = p.lat !== undefined ? p.lat : p[0];
            const lng = p.lng !== undefined ? p.lng : p[1];
            const x = padding + (lng - minLng) * scale;
            const y = size - (padding + (lat - minLat) * scale);
            return `${x},${y}`;
        }).join(' ');

        // 終點小圓點（圖一風格）
        const last = points.split(' ').pop().split(',');
        return (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
                <polyline points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
                {last.length === 2 && <circle cx={last[0]} cy={last[1]} r={strokeWidth * 1.3} fill={color} />}
            </svg>
        );
    } catch (e) { return null; }
};

// 共用：頂部 kicker 線（DRVN CARDIO LAB —— JUN 29）
const SwissKicker = ({ label, date, align = 'left' }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: T.primary, letterSpacing: '0.24em', fontFamily: FONT_LABEL }}>{label}</span>
        <span style={{ flex: align === 'center' ? '0 0 40px' : 1, height: 1, background: T.primary, opacity: 0.7 }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: T.primary, letterSpacing: '0.24em', fontFamily: FONT_LABEL }}>{date}</span>
    </div>
);

// 共用：一組「運動雜誌粗數字 + 瑞士粗小標」（左對齊瑞士排版）
const SwissMetric = ({ value, unit, label, size = 64 }) => (
    <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: size, fontWeight: 800, color: T.paper, lineHeight: 0.95, letterSpacing: '-0.01em', fontFamily: FONT_STAT }}>{value}</span>
            {unit && <span style={{ fontSize: 15, fontWeight: 700, color: T.text.subtle, letterSpacing: '0.08em', fontFamily: FONT_LABEL }}>{unit}</span>}
        </div>
        <p style={{ fontSize: 9, fontWeight: 700, color: T.text.subtle, letterSpacing: '0.28em', textTransform: 'uppercase', margin: '8px 0 0', fontFamily: FONT_LABEL }}>{label}</p>
    </div>
);

// =====================================================
// 1. Running Feature Card — 瑞士極簡時尚（直式海報）
// =====================================================
export const RunningFeatureCard = ({ data, bgOpacity = 35, forCapture = false }) => {
    const stats = data?.stats || {};
    const distance = num(stats.distance);
    const pace = num(stats.avgPace ?? stats.pace);
    const duration = num(stats.duration ?? stats.duration_seconds);
    const alpha = Math.max(0, Math.min(100, bgOpacity)) / 100;

    return (
        <div style={{ width: 320, height: 500, position: 'relative', borderRadius: 28, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, ...swissMatBg(alpha) }} />
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: '30px 28px 34px' }}>
                <SwissKicker label="DRVN CARDIO LAB" date={formatCardDate(data)} />

                {/* 主數字：距離（最大、細字） */}
                <div style={{ marginTop: 34 }}>
                    <SwissMetric value={distance.toFixed(2)} unit="KM" label="Distance" size={84} />
                </div>

                {/* 次要兩格 */}
                <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <span style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
                    <SwissMetric value={formatPace(pace)} unit="/KM" label="Pace" size={48} />
                    <SwissMetric value={fmtClock(duration)} label="Moving Time" size={48} />
                </div>

                <div style={{ flex: 1 }} />
                {/* 路線 + footer */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <RouteThumbnail route={data?.route} color={T.primary} size={88} strokeWidth={2.5} />
                    <span style={{ fontSize: 9, fontWeight: 400, color: T.text.micro, letterSpacing: '0.3em', fontFamily: FONT_NUM }}>{sportFooter(data)}</span>
                </div>
            </div>
        </div>
    );
};

// =====================================================
// 2. Pace Apex Card — 瑞士極簡時尚（最快分段聚焦）
// =====================================================
export const RunningApexCard = ({ data, bgOpacity = 85, forCapture = false }) => {
    const stats = data?.stats || {};
    const pace = num(stats.avgPace ?? stats.pace);
    // 🏁 最快分段 —【誠實 + 排除尾段】
    //    ① 尾段（不足 1 公里）不參與比較 —— 0.22km 跑 56 秒會變成假的「4'14"/km 最快段」。
    //    ② 沒有真實逐段資料時，舊版用 `pace - 15` 生一個假的「最快配速」，
    //       所以使用者的分享卡才會出現與平均配速一模一樣的 6'17" 當 NEW APEX。
    //       現在改為誠實顯示整趟平均，標題也跟著改，不再謊稱那是最快段。
    const fullSplits = (Array.isArray(stats.splits) ? stats.splits : []).filter((s) => {
        if (s?.partial === true) return false;
        const km = num(s?.distanceKm ?? s?.distance_km, 1);
        return !(km > 0 && km < 0.95);
    });
    const splitPaces = fullSplits.map(s => num(s.pace ?? s.time, 0)).filter(p => p >= 150 && p <= 1200);
    const hasRealSplits = splitPaces.length >= 2
        && (Math.max(...splitPaces) - Math.min(...splitPaces)) >= 2;
    const fastest = hasRealSplits ? Math.min(...splitPaces) : pace;
    const kicker = hasRealSplits ? 'FASTEST SPLIT' : 'AVERAGE PACE';
    const eyebrow = hasRealSplits ? 'New Apex' : 'Session Pace';
    const alpha = Math.max(0, Math.min(100, bgOpacity)) / 100;

    return (
        <div style={{ width: 320, height: 420, position: 'relative', borderRadius: 28, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, ...swissMatBg(alpha) }} />
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: '30px 28px 34px' }}>
                <SwissKicker label={kicker} date={formatCardDate(data)} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: T.primary, letterSpacing: '0.36em', textTransform: 'uppercase', margin: '0 0 14px', fontFamily: FONT_LABEL }}>{eyebrow}</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontSize: 92, fontWeight: 800, color: T.paper, lineHeight: 0.9, letterSpacing: '-0.02em', fontFamily: FONT_STAT }}>{formatPace(fastest)}</span>
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: T.text.subtle, letterSpacing: '0.28em', textTransform: 'uppercase', margin: '14px 0 0', fontFamily: FONT_LABEL }}>Pace / KM</p>
                </div>

                {/* 🗺️ 路徑旁加上里程（使用者要求：只有配速看不出跑了多遠） */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                        <RouteThumbnail route={data?.route} color={T.primary} size={80} strokeWidth={2.5} />
                        {num(stats.distance) > 0 && (
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, paddingBottom: 4 }}>
                                <span style={{ fontSize: 30, fontWeight: 800, color: T.paper, lineHeight: 1, letterSpacing: '-0.01em', fontFamily: FONT_STAT }}>
                                    {num(stats.distance).toFixed(2)}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: T.text.subtle, letterSpacing: '0.2em', fontFamily: FONT_LABEL }}>KM</span>
                            </span>
                        )}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 400, color: T.text.micro, letterSpacing: '0.3em', fontFamily: FONT_NUM }}>{sportFooter(data)}</span>
                </div>
            </div>
        </div>
    );
};

// =====================================================
// 3. Physio Card — 圖一風格（DRVN CARDIO LAB 瑞士極簡）
// =====================================================
// 共用：底部「平行三數據」列（瑞士極簡，等寬、髮絲分隔、不與小標重疊）
const SwissTripleRow = ({ items }) => (
    <div style={{ display: 'flex', width: '100%' }}>
        {items.map((it, i) => (
            <div key={it.label} style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
                paddingLeft: i === 0 ? 0 : 14,
                borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.14)',
            }}>
                <span style={{
                    fontSize: 9, fontWeight: 700, color: T.text.subtle, letterSpacing: '0.2em',
                    textTransform: 'uppercase', fontFamily: FONT_LABEL, whiteSpace: 'nowrap',
                }}>{it.label}</span>
                <span style={{
                    display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap',
                }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: T.paper, lineHeight: 1, letterSpacing: '-0.01em', fontFamily: FONT_STAT }}>{it.value}</span>
                    {it.unit && <span style={{ fontSize: 11, fontWeight: 700, color: T.text.subtle, letterSpacing: '0.06em', fontFamily: FONT_LABEL }}>{it.unit}</span>}
                </span>
            </div>
        ))}
    </div>
);

export const RunningPhysioCard = ({ data, bgOpacity = 90, forCapture = false }) => {
    const stats = data?.stats || {};
    const distance = num(stats.distance);
    const pace = num(stats.avgPace ?? stats.pace);
    const duration = num(stats.duration ?? stats.duration_seconds);
    const alpha = Math.max(0, Math.min(100, bgOpacity)) / 100;

    // 🏅 破紀錄偵測 → 顯示金屬飾條（沒有就不顯示，不假造）
    const prMarkers = (data?.deepData?.achievements?.milestone_markers || []).filter(m => m?.rank === 'PR');
    const hasRecord = prMarkers.length > 0 || (Array.isArray(data?.newRecords) && data.newRecords.length > 0);
    const recordKm = prMarkers.length > 0 ? prMarkers[0].distance : null;

    return (
        <div style={{ width: 320, height: 560, position: 'relative', borderRadius: 28, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, ...swissMatBg(alpha) }} />
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: '30px 28px 30px' }}>
                {/* 頂部 kicker 線 */}
                <SwissKicker label="DRVN CARDIO LAB" date={formatCardDate(data)} />

                {/* 🥇 金屬飾條：只有真的破紀錄才出現（瑞士極簡 + 拉絲金屬） */}
                {hasRecord && (
                    <div style={{
                        marginTop: 18, display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: 'linear-gradient(100deg, #b8b2a5 0%, #efe9dc 22%, #cfc7b8 50%, #efe9dc 78%, #b8b2a5 100%)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 8px -4px rgba(0,0,0,0.5)',
                    }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#2a2620', letterSpacing: '0.24em', fontFamily: FONT_NUM }}>NEW RECORD</span>
                        {recordKm != null && (
                            <span style={{ fontSize: 11, fontWeight: 500, color: '#4a453b', letterSpacing: '0.08em', fontFamily: FONT_NUM }}>{recordKm}K BEST</span>
                        )}
                    </div>
                )}

                {/* HERO：地圖最大 — 佔據卡片主視覺 */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, marginTop: 14 }}>
                    <RouteThumbnail route={data?.route} color={T.primary} size={230} strokeWidth={3} />
                </div>

                {/* 底部：平行三數據（等寬、不重疊、不破圖） */}
                <div style={{ marginTop: 18 }}>
                    <span style={{ display: 'block', height: 1, background: 'rgba(255,255,255,0.14)', marginBottom: 16 }} />
                    <SwissTripleRow items={[
                        { value: distance.toFixed(2), unit: 'KM', label: 'Distance' },
                        { value: formatPace(pace), unit: '/KM', label: 'Pace' },
                        { value: fmtClock(duration), unit: '', label: 'Time' },
                    ]} />
                    <span style={{ display: 'block', marginTop: 16, fontSize: 9, fontWeight: 400, color: T.text.micro, letterSpacing: '0.32em', textAlign: 'right', fontFamily: FONT_NUM }}>{sportFooter(data)}</span>
                </div>
            </div>
        </div>
    );
};
