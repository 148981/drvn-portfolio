/**
 * taskCategories.js — 任務類別 → 色彩 token（單一真相源）
 * ─────────────────────────────────────────────────────────
 * key 對齊 getTodayCheckinItems 的 item.key；fallback 用 sub 中文名。
 * 原則（DRVN design system）：低飽和 Loewe 輔助色、同明度階，
 * 彼此可區分但不搶「一卡一焦點」的 Coral 主色。
 *   text/bg/bar  = 亮底（Paper）用
 *   textDark     = 深色玻璃面板用（提高明度以過 WCAG AA）
 */
export const TASK_CATEGORY_STYLES = {
    strength:  { zh: '重訓',    text: '#D94030', bg: 'rgba(249,92,75,0.10)',   bar: '#F95C4B', textDark: '#FF9C8E' },
    run:       { zh: '跑步',    text: '#5A6B7A', bg: 'rgba(139,157,171,0.16)', bar: '#8B9DAB', textDark: '#AFC2D2' },
    nutrition: { zh: '營養',    text: '#5A7A3A', bg: 'rgba(90,122,58,0.10)',   bar: '#8F9E8B', textDark: '#B4CD96' },
    inbody:    { zh: '身體數據', text: '#A8703D', bg: 'rgba(198,142,93,0.14)',  bar: '#C68E5D', textDark: '#E5B584' },
    review:    { zh: '回顧',    text: '#8F7A45', bg: 'rgba(212,197,165,0.24)', bar: '#D4C5A5', textDark: '#E6D6AE' },
    default:   { zh: '任務',    text: 'rgba(22,20,21,0.45)', bg: 'rgba(22,20,21,0.05)', bar: '#CFC6B8', textDark: 'rgba(246,244,241,0.5)' },
};

export const categoryStyle = (keyOrSub) => {
    if (TASK_CATEGORY_STYLES[keyOrSub]) return TASK_CATEGORY_STYLES[keyOrSub];
    const bySub = Object.values(TASK_CATEGORY_STYLES).find((c) => c.zh === keyOrSub);
    return bySub || TASK_CATEGORY_STYLES.default;
};
