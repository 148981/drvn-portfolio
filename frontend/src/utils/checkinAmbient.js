// ══════════════════════════════════════════════════════════════════════════
// 🎨 checkinAmbient — 打卡體驗的「時段漸層主題」單一真相源
//
// 使用者要求：「根據不同時段給予不同顏色搭配去做漸層色背景，讓整體有變化活潑感。」
//
// 一天切成 7 個時段，每段有自己的色票（取自使用者提供的 Muzli 色票組）：
//   05–08 破曉   Sunrise Glow   #FF9A8B / #FFC3A0 / #FECF6A / #A1E3FF   淺
//   08–11 早晨   MP059 淺側     Morning Snow / Amazon Mist / Aqua Mist   淺
//   11–15 正午   MP082          奶白 → 金黃 → 磚紅                        淺
//   15–18 午後   MP072 淺側     Palladian / Oatmeal / Burning Flame       淺
//   18–21 黃昏   MP113          Habañero × Aster Blue × Deep Space Royal  深
//   21–01 夜晚   MP113 深側     Deep Space Royal → Deadly Depths          深
//   01–05 深夜   MP072 深側     Blue Fantastic → Abyssal Anchorfish Blue  深
//
// 深淺主題會自動翻轉文字色（dark → Paper 淺字；light → Ink 深字），
// 所以呼叫端一律用 A.ink / A.inkSoft / A.inkFaint，不要自己寫死顏色。
//
// 用法：
//   const A = checkinAmbient();          // 依現在時間（可傳 Date 覆寫）
//   style={{ background: A.bg, color: A.ink }}
//   A.accent / A.hairline / A.slotLabel / A.dark
// ══════════════════════════════════════════════════════════════════════════

const PAPER = '#F6F4F1';
const INK = '#161415';

// 依明暗自動生出整組文字階層 —— 呼叫端不用再自己調透明度
const textScale = (dark) => (dark
    ? {
        ink: PAPER,
        inkSoft: 'rgba(246,244,241,0.72)',
        inkFaint: 'rgba(246,244,241,0.48)',
        inkGhost: 'rgba(246,244,241,0.30)',
        hairline: '1px solid rgba(246,244,241,0.16)',
        hairlineStrong: '1px solid rgba(246,244,241,0.30)',
        line: 'rgba(246,244,241,0.16)',
        veil: 'rgba(255,255,255,0.10)',        // 淡片（chip / 玻璃底）
        veilBorder: 'rgba(255,255,255,0.18)',
    }
    : {
        ink: INK,
        inkSoft: 'rgba(22,20,21,0.58)',
        inkFaint: 'rgba(22,20,21,0.40)',
        inkGhost: 'rgba(22,20,21,0.26)',
        hairline: '1px solid rgba(22,20,21,0.10)',
        hairlineStrong: '1px solid rgba(22,20,21,0.20)',
        line: 'rgba(22,20,21,0.10)',
        veil: 'rgba(255,255,255,0.42)',
        veilBorder: 'rgba(22,20,21,0.08)',
    });

const mk = (o) => ({ ...o, ...textScale(o.dark) });

// ── 05–08 破曉 · Sunrise Glow（圖六）────────────────────────────────
//    桃粉 → 蜜黃 → 天藍。一天裡最柔的一段，適合「今天才剛開始」。
const DAWN = mk({
    id: 'dawn',
    dark: false,
    slotLabel: '破曉',
    accent: '#E8613F',
    bg: [
        'radial-gradient(120% 80% at 12% 4%, rgba(255,154,139,0.62) 0%, transparent 58%)',
        'radial-gradient(100% 70% at 92% 18%, rgba(254,207,106,0.55) 0%, transparent 55%)',
        'radial-gradient(130% 90% at 78% 104%, rgba(161,227,255,0.55) 0%, transparent 60%)',
        'linear-gradient(168deg, #FFE9E2 0%, #FFF3E0 46%, #EAF4FB 100%)',
    ].join(', '),
    glow: 'rgba(255,195,160,0.35)',
});

// ── 08–11 早晨 · MP059 淺側（圖三）─────────────────────────────────
//    雪白 → 薄荷灰 → 水藍。清醒、乾淨，一點 Toxic Orange 當提神的那一下。
const MORNING = mk({
    id: 'morning',
    dark: false,
    slotLabel: '早晨',
    accent: '#FF6037',
    bg: [
        'radial-gradient(110% 75% at 8% 6%, rgba(245,244,237,0.95) 0%, transparent 60%)',
        'radial-gradient(95% 65% at 96% 12%, rgba(255,96,55,0.20) 0%, transparent 55%)',
        'radial-gradient(130% 95% at 62% 106%, rgba(160,201,203,0.55) 0%, transparent 62%)',
        'linear-gradient(166deg, #F7F6F0 0%, #ECECDC 52%, #D8E7E7 100%)',
    ].join(', '),
    glow: 'rgba(160,201,203,0.32)',
});

// ── 11–15 正午 · MP082（圖五）──────────────────────────────────────
//    奶白 → 金黃 → 磚紅。日正當中，能量最滿的一段。
const MIDDAY = mk({
    id: 'midday',
    dark: false,
    slotLabel: '正午',
    accent: '#B0454E',
    bg: [
        'radial-gradient(115% 78% at 14% 2%, rgba(250,249,246,0.96) 0%, transparent 58%)',
        'radial-gradient(95% 62% at 88% 74%, rgba(242,193,78,0.62) 0%, transparent 56%)',
        'radial-gradient(125% 88% at 22% 108%, rgba(176,69,78,0.42) 0%, transparent 60%)',
        'linear-gradient(170deg, #FBF8F3 0%, #F6E7C8 58%, #E8BFA8 100%)',
    ].join(', '),
    glow: 'rgba(242,193,78,0.34)',
});

// ── 15–18 午後 · MP072 淺側（圖四）─────────────────────────────────
//    Palladian → Oatmeal → Burning Flame。斜射的光，暖而不燙。
const AFTERNOON = mk({
    id: 'afternoon',
    dark: false,
    slotLabel: '午後',
    accent: '#A35139',
    bg: [
        'radial-gradient(112% 76% at 10% 4%, rgba(238,233,223,0.96) 0%, transparent 58%)',
        'radial-gradient(98% 66% at 94% 68%, rgba(255,177,98,0.62) 0%, transparent 56%)',
        'radial-gradient(125% 90% at 30% 108%, rgba(163,81,57,0.34) 0%, transparent 60%)',
        'linear-gradient(168deg, #F3EFE6 0%, #E4DACA 55%, #D9B393 100%)',
    ].join(', '),
    glow: 'rgba(255,177,98,0.34)',
});

// ── 18–21 黃昏 · MP113（圖二）── 深色從這裡開始 ──────────────────
//    Habañero 的橘壓在 Deep Space Royal 的藍上 —— 一天最戲劇的那 3 小時。
const DUSK = mk({
    id: 'dusk',
    dark: true,
    slotLabel: '黃昏',
    accent: '#F98513',
    bg: [
        'radial-gradient(105% 62% at 82% 96%, rgba(249,133,19,0.78) 0%, transparent 58%)',
        'radial-gradient(95% 60% at 14% 8%, rgba(155,172,216,0.42) 0%, transparent 58%)',
        'radial-gradient(130% 95% at 50% 40%, rgba(34,51,130,0.72) 0%, transparent 66%)',
        'linear-gradient(168deg, #3A4A87 0%, #2A3160 52%, #6B3A22 100%)',
    ].join(', '),
    glow: 'rgba(249,133,19,0.30)',
});

// ── 21–01 夜晚 · MP113 深側（圖二）─────────────────────────────────
//    Deep Space Royal → Deadly Depths，只留一顆 Habañero 的餘燼。
const NIGHT = mk({
    id: 'night',
    dark: true,
    slotLabel: '夜晚',
    accent: '#F98513',
    bg: [
        'radial-gradient(90% 55% at 86% 92%, rgba(249,133,19,0.36) 0%, transparent 58%)',
        'radial-gradient(95% 62% at 12% 10%, rgba(155,172,216,0.26) 0%, transparent 58%)',
        'radial-gradient(135% 100% at 48% 46%, rgba(34,51,130,0.62) 0%, transparent 68%)',
        'linear-gradient(168deg, #223382 0%, #1A2059 50%, #111144 100%)',
    ].join(', '),
    glow: 'rgba(155,172,216,0.22)',
});

// ── 01–05 深夜 · MP072 深側（圖四）─────────────────────────────────
//    Blue Fantastic → Abyssal Anchorfish Blue。安靜到底，只留一絲爐火。
const LATE_NIGHT = mk({
    id: 'lateNight',
    dark: true,
    slotLabel: '深夜',
    accent: '#FFB162',
    bg: [
        'radial-gradient(85% 50% at 84% 94%, rgba(255,177,98,0.26) 0%, transparent 56%)',
        'radial-gradient(95% 62% at 14% 12%, rgba(44,59,77,0.85) 0%, transparent 60%)',
        'radial-gradient(135% 100% at 50% 48%, rgba(27,38,50,0.80) 0%, transparent 70%)',
        'linear-gradient(168deg, #2C3B4D 0%, #22303F 52%, #1B2632 100%)',
    ].join(', '),
    glow: 'rgba(255,177,98,0.18)',
});

export const AMBIENT_SLOTS = [DAWN, MORNING, MIDDAY, AFTERNOON, DUSK, NIGHT, LATE_NIGHT];

/**
 * 依時間取得該時段的漸層主題。
 * @param {Date} date 預設為現在
 */
export function checkinAmbient(date = new Date()) {
    const h = (date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()).getHours();
    if (h >= 5 && h < 8) return DAWN;
    if (h >= 8 && h < 11) return MORNING;
    if (h >= 11 && h < 15) return MIDDAY;
    if (h >= 15 && h < 18) return AFTERNOON;
    if (h >= 18 && h < 21) return DUSK;
    if (h >= 21 || h < 1) return NIGHT;
    return LATE_NIGHT;               // 01–05
}

/** 開發/預覽用：依 id 取主題（AMBIENT_SLOTS 的 id） */
export function ambientById(id) {
    return AMBIENT_SLOTS.find((s) => s.id === id) || checkinAmbient();
}

// 🧊 Liquid Glass 小卡樣式 — blur + 邊光，浮在漸層上。
//    傳入主題 A 才能在淺色漸層上也看得見（淺底要用白霧＋深邊，深底才用白邊）。
export function glassCardStyle(done = false, A = null) {
    const dark = A ? A.dark : true;
    const accent = A?.accent || '#F95C4B';
    if (dark) {
        return {
            background: done
                ? `linear-gradient(135deg, ${hexA(accent, 0.24)} 0%, ${hexA(accent, 0.10)} 100%)`
                : 'linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 100%)',
            backdropFilter: 'blur(18px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
            border: '1px solid rgba(255,255,255,0.24)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.42), 0 10px 26px -14px rgba(0,0,0,0.45)',
        };
    }
    return {
        background: done
            ? `linear-gradient(135deg, ${hexA(accent, 0.16)} 0%, ${hexA(accent, 0.06)} 100%)`
            : 'linear-gradient(135deg, rgba(255,255,255,0.66) 0%, rgba(255,255,255,0.34) 100%)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        border: '1px solid rgba(255,255,255,0.72)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 24px -16px rgba(22,20,21,0.35)',
    };
}

/** #RRGGBB → rgba()，給玻璃底染上該時段的 accent */
export function hexA(hex, a = 1) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    if (!m) return `rgba(249,92,75,${a})`;
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}

export default { checkinAmbient, ambientById, glassCardStyle, hexA, AMBIENT_SLOTS };
