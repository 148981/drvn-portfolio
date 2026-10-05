// ══════════════════════════════════════════════════════════════════════════
// 🇨🇭 swissUI — 瑞士時尚大膽極簡的設計 token（單一真相源）
//
// 使用者要求：「這邊 UI 幫我重新做設計，我要瑞士時尚大膽極簡風。」
//
// 三個字的操作型定義：
//   時尚 = 克制。少數幾個元素，但每個都放對位置。
//   大膽 = 極端對比。一個大到有點誇張的數字，其餘全部縮到 Micro。
//          不要中間值 —— 中間值就是平庸。
//   極簡 = 用留白與髮絲線分隔，不用圓角卡片堆疊。
//
// 硬規則（違反就不是這個風格）：
//   1. 字級只有 5 階，不得自由發揮中間值。
//   2. 一頁只能有一個 Coral 焦點。
//   3. 分隔一律用 1px 髮絲線，不用陰影卡片。
//   4. 8pt 網格：頁面左右 padding 24、區塊間距 32。
// ══════════════════════════════════════════════════════════════════════════

export const SWISS = {
    // ── 顏色（只有這四個 + 一個 Coral）──
    paper: '#F6F4F1',
    ink: '#161415',
    stone: '#E4DED2',
    coral: '#F95C4B',

    // ── 8pt 網格 ──
    pagePadding: 24,
    sectionGap: 32,
    hairline: '1px solid rgba(22,20,21,0.08)',
    hairlineStrong: '1px solid rgba(22,20,21,0.14)',
};

// ══════════════════════════════════════════════════════════════════════════
// 📐 字級階梯 — 只有 5 階。要大就大到底，要小就小到底，沒有中間值。
// ══════════════════════════════════════════════════════════════════════════
export const TYPE = {
    /** 頁面唯一主角數字／字（大膽的來源） */
    display: {
        fontSize: 44,
        fontWeight: 300,
        letterSpacing: '-0.03em',
        lineHeight: 1.0,
        fontFamily: '"Tenor Sans", -apple-system, sans-serif',
    },
    /** 區塊標題 */
    title: {
        fontSize: 26,
        fontWeight: 400,
        letterSpacing: '-0.015em',
        lineHeight: 1.25,
        fontFamily: '"Tenor Sans", -apple-system, sans-serif',
    },
    /** 內文 */
    body: {
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.6,
        letterSpacing: 0,
    },
    /** 欄位標籤 */
    label: {
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
    },
    /** kicker（瑞士編輯風的小標） */
    micro: {
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
    },
};

/** 依主角字數自動降階，避免長數字撐破版面（大膽但不失控） */
export const displaySize = (text, base = 44) => {
    const len = String(text ?? '').length;
    if (len <= 5) return base;
    if (len === 6) return base - 6;
    if (len === 7) return base - 12;
    return base - 18;
};

/** 髮絲線分隔的清單容器 —— 取代圓角卡片堆疊 */
export const hairlineList = {
    display: 'flex',
    flexDirection: 'column',
};

/** 清單中的一列（最後一列不畫底線） */
export const hairlineRow = (isLast = false) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottom: isLast ? 'none' : SWISS.hairline,
});

/**
 * 區塊 kicker + 標題（瑞士編輯風的標準開場）
 * 用法：<div style={sectionHead.wrap}> … </div>
 */
export const sectionHead = {
    wrap: { marginBottom: 16 },
    rule: { width: 16, height: 1, background: 'rgba(22,20,21,0.28)', marginBottom: 8 },
    kicker: { ...TYPE.micro, color: 'rgba(22,20,21,0.40)' },
    title: { ...TYPE.title, color: SWISS.ink, margin: '6px 0 0' },
};

/** 左側編號（01 / 02 / 03）— 雜誌感的來源，且完全不佔色彩預算 */
export const indexNumber = {
    ...TYPE.micro,
    fontSize: 9,
    letterSpacing: '0.16em',
    color: 'rgba(22,20,21,0.28)',
    fontVariantNumeric: 'tabular-nums',
    width: 22,
    flexShrink: 0,
};

/** 文字型 CTA（取代 Coral 膠囊按鈕，一頁只留一個 Coral） */
export const textCTA = (accent = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    ...TYPE.label,
    fontSize: 11,
    color: accent ? SWISS.coral : 'rgba(22,20,21,0.55)',
});

/** 數字＋單位的標準排法（單位永遠比數字小很多 → 對比） */
export const metric = (size = 44) => ({
    value: { ...TYPE.display, fontSize: size, color: SWISS.ink, fontVariantNumeric: 'tabular-nums' },
    unit: { ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.38)', marginLeft: 4 },
    label: { ...TYPE.micro, color: 'rgba(22,20,21,0.38)', display: 'block', marginTop: 8 },
});

export default { SWISS, TYPE, displaySize, hairlineList, hairlineRow, sectionHead, indexNumber, textCTA, metric };
