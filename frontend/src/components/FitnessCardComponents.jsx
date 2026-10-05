import React from 'react';
import { exerciseVolume } from '../utils/strengthMath';

// ════════════════════════════════════════════════════════════════
//  DRVN 分享卡 — 運動風 × 瑞士雜誌 × 資訊極簡
//  字體：
//    · 最大數字 / 標籤 → Michroma（運動感幾何寬體，大寫寬字距）
//    · 數據讀值        → JetBrains Mono（tabular-nums）
//    · 中文動作名      → Noto Sans TC
//  設計：資訊極簡、大膽留白、左對齊、Pebble 細線、Coral 單一焦點。
//  全面無 italic / monospace黑體（避免 html2canvas 跑版）。
// ════════════════════════════════════════════════════════════════

// ── DRVN 七色 ──
const INK    = '#161415';
const PAPER  = '#F6F4F1';
const STONE  = '#E4DED2';
const MIST   = '#E8E9E6';   // 唯一冷灰（misty grey）
const PEBBLE = '#CFC6B8';   // 暖砂（pebble）
const CORAL  = '#F95C4B';
const EMBER  = '#D94030';

// 鈦金屬質感分隔線：細鈦金漸層 + 上緣高光 bevel（html2canvas 友善，純 CSS 漸層）
const TitaniumRule = ({ style }) => (
    <div style={{ position: 'relative', height: 3, margin: '0 0 14px', ...style }}>
        {/* 主鈦金線：橫向金屬漸層 */}
        <div style={{
            position: 'absolute', left: 0, right: 0, top: 1, height: 1.5, borderRadius: 1,
            background: 'linear-gradient(90deg, rgba(207,198,184,0.10) 0%, rgba(207,198,184,0.55) 22%, rgba(232,233,230,0.85) 50%, rgba(207,198,184,0.55) 78%, rgba(207,198,184,0.10) 100%)',
        }} />
        {/* 上緣高光（金屬反光） */}
        <div style={{
            position: 'absolute', left: '10%', right: '10%', top: 0, height: 1, borderRadius: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
        }} />
    </div>
);

// ── 字體 ──
const SPORT  = "'Michroma', 'Tenor Sans', sans-serif";  // 運動風：大數字
const TITLE  = "'Manrope', 'Noto Sans TC', sans-serif"; // 大小標題（kicker / heading）
const SCRIPT = "'Caveat', cursive";                     // 手寫風（LAB）
const MONO   = "'JetBrains Mono', 'SF Mono', monospace"; // 數據讀值
const TC     = "'Noto Sans TC', sans-serif";             // 中文

// 卡片標題：「DRVN」用 Manrope、「LAB」用 Caveat 手寫風
// 🔧 line-height 給足 + overflow visible，避免 Caveat 手寫字的上下緣被裁
const DrvnLab = ({ size = 17, color = PAPER }) => (
    <h1 style={{ margin: 0, lineHeight: 1.5, display: 'inline-flex', alignItems: 'baseline', gap: 8, overflow: 'visible' }}>
        <span style={{ fontFamily: TITLE, fontSize: size, fontWeight: 800, color, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1.4 }}>DRVN</span>
        <span style={{ fontFamily: SCRIPT, fontSize: size * 1.7, fontWeight: 600, color, letterSpacing: '0.01em', lineHeight: 1.2, position: 'relative', top: size * 0.12 }}>Lab</span>
    </h1>
);

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// ── 卡片底（單層 solid，html2canvas 友善） ──
const cardBase = (opacity = 92, { radius = 28, dark = true } = {}) => {
    const a = Math.max(0, Math.min(100, opacity)) / 100;
    return {
        background: dark ? `rgba(20,18,19,${a})` : `rgba(246,244,241,${a})`,
        borderRadius: radius,
        border: dark ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${PEBBLE}`,
        boxShadow: dark ? '0 24px 60px rgba(0,0,0,0.55)' : '0 18px 44px rgba(22,20,21,0.16)',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
    };
};

// 玻璃上緣高光
const Sheen = ({ dark = true }) => (
    <>
        <div aria-hidden style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
            background: dark
                ? 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 100%)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%)',
            pointerEvents: 'none', zIndex: 0,
        }} />
        <div aria-hidden style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
            background: dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.85)',
            pointerEvents: 'none', zIndex: 0,
        }} />
    </>
);

// kicker（Manrope uppercase 寬字距）— 小標字體加粗(800)
const Kicker = ({ children, color, style }) => (
    <p style={{
        fontFamily: TITLE, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: color || 'rgba(255,255,255,0.78)',
        margin: 0, lineHeight: 1.3, ...style,
    }}>{children}</p>
);

// =====================================================
// 1. FeatureCard — POSTER（今日 MVP：總訓練量 + 組數）
// =====================================================
export const FeatureCard = ({ processedExercises = [], prExercises = [], totalVolume = 0, durationSeconds = 0, calories = 0, heartRate = 0, completedDate, locationName = '', photoBg, showDataOnly = false, bgOpacity = 10, minH }) => {
    const totalSets = processedExercises.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);

    const body = (
        <div data-export-card style={{
            flex: 1, width: '100%', height: '100%', minHeight: minH || '100%', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column',
            ...cardBase(photoBg ? 0 : bgOpacity, { radius: 36, dark: true }),
        }}>
            <Sheen dark />
            {photoBg && (
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0.06) 52%, rgba(0,0,0,0.74) 72%, rgba(0,0,0,0.94) 100%)', zIndex: 0 }} />
            )}
            <div style={{ position: 'absolute', top: -56, left: -56, width: 240, height: 240, background: `radial-gradient(circle, ${CORAL}24 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

            {/* TOP */}
            <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '34px 28px 0' }}>
                <div>
                    <DrvnLab size={17} />
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: TITLE, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0, letterSpacing: '0.04em' }}>{new Date(completedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    {/* 🩹 這裡原本寫死 'Taipei City' —— 不管在哪練、有沒有定位，分享卡都印台北。
                       這是要被貼到社群上的圖，寫死地點就是造假。沒有地點就不印這一行。 */}
                    {locationName ? (
                        <Kicker style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: '0.16em', marginTop: 3 }}>{locationName}</Kicker>
                    ) : null}
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 24 }} />

            {/* BOTTOM */}
            <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, padding: '0 28px 34px' }}>
                {/* 總訓練量大數字(Manrope)
                    🩹 原本標「今日 MVP」但顯示的是總訓練量 —— 名不符實（MVP 應該是某個動作）。
                    改標「Total Volume · 總訓練量」，誠實描述這個數字是什麼。 */}
                <div style={{ marginBottom: 24 }}>
                    <Kicker color={CORAL} style={{ fontSize: 13, letterSpacing: '0.18em', marginBottom: 14 }}>Total Volume · 總訓練量</Kicker>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '100%', overflow: 'visible' }}>
                        <span style={{
                            // 主數字用 Michroma（運動風）；line-height 給足避免上下緣被裁；寬體依長度縮放避免溢出
                            fontFamily: SPORT, fontWeight: 400, lineHeight: 1.25,
                            fontSize: fmt(totalVolume).length >= 7 ? 40 : fmt(totalVolume).length >= 6 ? 46 : 52,
                            letterSpacing: '0.01em', color: CORAL, fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap', display: 'inline-block',
                        }}>{fmt(totalVolume)}</span>
                        <span style={{ fontFamily: SPORT, fontSize: 15, fontWeight: 400, color: CORAL, opacity: 0.72, letterSpacing: '0.04em', paddingBottom: 8, lineHeight: 1.25 }}>KG</span>
                    </div>
                    <p style={{ display: 'flex', alignItems: 'baseline', gap: 5, margin: '12px 0 0' }}>
                        <span style={{ fontFamily: SPORT, fontSize: 14, fontWeight: 400, color: PAPER, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em', lineHeight: 1.25, display: 'inline-block' }}>{totalSets}</span>
                        <span style={{ fontFamily: TITLE, fontSize: 9, fontWeight: 800, color: PEBBLE, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{totalSets === 1 ? 'Set' : 'Sets'}</span>
                    </p>
                </div>

                {/* 細項：時間 / 熱量 / 心率（數字 Manrope、小標 Pebble 色） */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 14, marginBottom: 18 }}>
                    {[
                        { label: 'Time', value: Math.floor(durationSeconds / 60), unit: 'MIN' },
                        { label: 'Burn', value: calories, unit: 'KCAL' },
                        { label: 'HR', value: heartRate, unit: 'BPM' },
                    ].map(({ label, value, unit }) => (
                        <div key={label} style={{ borderLeft: `1.5px solid ${PEBBLE}66`, paddingLeft: 10 }}>
                            <Kicker style={{ fontSize: 9, letterSpacing: '0.14em', color: PEBBLE, marginBottom: 5 }}>{label}</Kicker>
                            <p style={{ fontFamily: TITLE, fontSize: 17, fontWeight: 700, color: PAPER, margin: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{value}<span style={{ fontSize: 11, marginLeft: 3, opacity: 0.7, fontWeight: 600 }}>{unit}</span></p>
                        </div>
                    ))}
                </div>

                {/* 鈦金屬分隔線 */}
                <TitaniumRule />

                {/* Key Movements（小標 Pebble、數字 Manrope） */}
                <div>
                    <Kicker style={{ color: PEBBLE, letterSpacing: '0.2em', marginBottom: 10 }}>Key Movements</Kicker>
                    {processedExercises.slice(0, 3).map((ex, i) => {
                        const exVol = ex.sets?.reduce((acc, s) => acc + ((parseInt(s.weight) || 0) * (parseInt(s.reps) || 0)), 0) || 0;
                        const isPR = prExercises.some(p => p.name === ex.name);
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 18 }}>
                                {/* 🔧 用 JS 截斷名稱(不靠 CSS overflow:hidden)，徹底避免 html2canvas 把下緣裁掉 */}
                                <span style={{ fontFamily: TC, fontSize: 11, fontWeight: 500, color: PAPER, flex: 1, minWidth: 0, whiteSpace: 'nowrap', paddingRight: 8, lineHeight: 1.5 }}>{(ex.name || '').length > 22 ? (ex.name || '').slice(0, 21) + '…' : ex.name}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                    {/* PR 去框：只留 coral 文字，不要方塊背景/邊框（依需求） */}
                                    {isPR && <span style={{ fontFamily: TITLE, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: CORAL }}>PR</span>}
                                    <span style={{ fontFamily: TITLE, fontSize: 12, fontWeight: 700, color: CORAL, fontVariantNumeric: 'tabular-nums' }}>{fmt(exVol)} <span style={{ fontSize: 11, opacity: 0.6 }}>KG</span></span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    if (showDataOnly) return body;
    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: photoBg ? 'transparent' : `rgba(0,0,0,${bgOpacity / 100})` }}>
            {photoBg && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${photoBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
            {body}
        </div>
    );
};

// =====================================================
// 2. PeakCard — PR 主角卡（瑞士極簡 × 大膽藝術）
//    🩹 依需求重做：中間這張卡牌 = 展示「這次的 PR」——哪個動作 + 破了多少。
//    以前是三個平均大小的數字（總量/組數/MVP），主角不明確；現在把 PR 動作名
//    與 PR 重量放大成主視覺，總量/組數退為底部細線資訊。
// =====================================================
export const PeakCard = ({ featuredPR = { name: 'Workout', weight: 0 }, isNewRecord, totalVolume = 0, totalSets = 0, bgOpacity = 90 }) => {
    const prName = featuredPR?.name || 'Workout';
    const prWeight = fmt(featuredPR?.weight || 0);
    return (
        <div data-export-card style={{ ...cardBase(bgOpacity, { radius: 28, dark: true }), padding: '30px 30px 32px', width: 340, minHeight: 440, display: 'flex', flexDirection: 'column' }}>
            <Sheen dark />
            {/* Coral 氛圍微光（PR 是高光時刻，光暈更聚焦） */}
            <div style={{ position: 'absolute', top: -30, right: -60, width: 240, height: 240, background: `radial-gradient(circle, ${CORAL}2A 0%, transparent 68%)`, pointerEvents: 'none', zIndex: 0 }} />

            {/* Header */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'auto' }}>
                <DrvnLab size={15} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: CORAL, boxShadow: `0 0 8px ${CORAL}` }} />
                    <Kicker style={{ color: CORAL, fontSize: 11 }}>{isNewRecord ? 'New PR' : 'Peak Lift'}</Kicker>
                </span>
            </div>

            {/* 主角：PR 動作 + 重量 —— 大膽、左對齊、超大留白 */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                {/* 動作名（藝術性大標） */}
                <p style={{
                    fontFamily: TC, fontWeight: 700, color: PAPER, margin: '0 0 4px',
                    fontSize: prName.length > 14 ? 26 : prName.length > 9 ? 32 : 40,
                    lineHeight: 1.05, letterSpacing: '-0.02em', wordBreak: 'break-word',
                }}>{prName}</p>
                {/* 🩹 沒破紀錄卻標「個人紀錄」= 造假。右上角的徽章早就分得清 New PR / Peak Lift，
                   這一行卻永遠寫「個人紀錄」，同一張卡自相矛盾。跟著 isNewRecord 走。 */}
                <Kicker style={{ color: MIST, fontSize: 12, letterSpacing: '0.22em', marginBottom: 18 }}>
                    {isNewRecord ? '個人紀錄 · Personal Record' : '本次最重 · Top Set'}
                </Kicker>

                {/* PR 重量：超大數字 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, overflow: 'visible' }}>
                    <span style={{
                        fontFamily: SPORT, fontWeight: 400, lineHeight: 1.1,
                        fontSize: prWeight.length >= 5 ? 62 : prWeight.length >= 4 ? 74 : 86,
                        letterSpacing: '-0.01em', color: CORAL, fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap', display: 'inline-block',
                        textShadow: `0 0 30px ${CORAL}44`,
                    }}>{prWeight}</span>
                    <span style={{ fontFamily: SPORT, fontSize: 18, fontWeight: 400, color: CORAL, opacity: 0.8, letterSpacing: '0.04em', paddingBottom: 12 }}>KG</span>
                </div>
            </div>

            {/* 底部細線資訊：總量 / 組數（退為配角） */}
            <div style={{ position: 'relative', zIndex: 1, marginTop: 26, paddingTop: 16, borderTop: `1px solid ${PEBBLE}44`, display: 'flex', gap: 28 }}>
                <div>
                    <Kicker style={{ color: MIST, fontSize: 9, letterSpacing: '0.18em', marginBottom: 4 }}>Total Volume</Kicker>
                    <p style={{ fontFamily: TITLE, fontSize: 16, fontWeight: 700, color: PAPER, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVolume)}<span style={{ fontSize: 11, marginLeft: 3, opacity: 0.65 }}>KG</span></p>
                </div>
                <div>
                    <Kicker style={{ color: MIST, fontSize: 9, letterSpacing: '0.18em', marginBottom: 4 }}>Total Sets</Kicker>
                    <p style={{ fontFamily: TITLE, fontSize: 16, fontWeight: 700, color: PAPER, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{totalSets}<span style={{ fontSize: 11, marginLeft: 3, opacity: 0.65 }}>SETS</span></p>
                </div>
            </div>
        </div>
    );
};

// =====================================================
// 3. ReportCard — 極簡清單卡（運動風 + 瑞士排版）
// =====================================================
export const ReportCard = ({ processedExercises = [], calories = 0, bgOpacity = 93 }) => (
    <div data-export-card style={{ ...cardBase(bgOpacity, { radius: 28, dark: true }), padding: '28px 28px 22px', width: 320 }}>
        <Sheen dark />
        <div style={{ position: 'absolute', bottom: -32, left: -32, width: 130, height: 130, background: `radial-gradient(circle, ${CORAL}20 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

        {/* Header — DRVN(Manrope) + Lab(Caveat)，刪除 CALIBRATED METRICS 副標 */}
        <div style={{ position: 'relative', zIndex: 1, borderBottom: `1px solid ${PEBBLE}55`, paddingBottom: 14, marginBottom: 14 }}>
            <DrvnLab size={17} />
        </div>

        {/* 動作清單 —— 🩹 依需求：顯示今日「全部」動作（不再只截前 4 個）。
            動作多時自動壓縮行距/字級，讓整份菜單都進得了同一張分享卡。 */}
        {(() => {
            const list = processedExercises || [];
            const many = list.length > 6;              // 動作多 → 緊湊模式
            const rowPad = many ? '5px 0' : '8px 0';
            const nameSize = many ? 11 : 12;
            const setSize = many ? 18 : 24;
            const cut = many ? 16 : 20;
            return (
                <div style={{ position: 'relative', zIndex: 1 }}>
                    {list.map((ex, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: rowPad }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontFamily: TC, fontSize: nameSize, fontWeight: 500, color: PAPER, display: 'block', lineHeight: 1.4, marginBottom: many ? 2 : 4, whiteSpace: 'nowrap' }}>{(ex.name || '').length > cut ? (ex.name || '').slice(0, cut - 1) + '…' : ex.name}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ height: 1, flex: 1, background: `${PEBBLE}44`, minWidth: 10 }} />
                                    <span style={{ fontFamily: TITLE, fontSize: many ? 9 : 10, fontWeight: 700, color: CORAL, whiteSpace: 'nowrap', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>AVG {ex.avgWeight}KG</span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span style={{ fontFamily: SPORT, fontSize: setSize, fontWeight: 400, color: CORAL, letterSpacing: '0.01em', lineHeight: 1.2, display: 'block', fontVariantNumeric: 'tabular-nums', overflow: 'visible' }}>{ex.setsCount}</span>
                                <Kicker style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: '0.14em', marginTop: many ? 1 : 4, fontSize: 9 }}>Sets</Kicker>
                            </div>
                        </div>
                    ))}
                </div>
            );
        })()}
    </div>
);
