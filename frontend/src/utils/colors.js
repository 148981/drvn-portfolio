/**
 * colors.js — DRVN Swiss Editorial 色票（單一來源）
 * ──────────────────────────────────────────────────────────────────
 * 對應 design-taste-frontend「Color Consistency」原則。
 *
 * 背景：專案內以 inline style 硬編碼色值達 9,000+ 處，其中 #161415、
 * #F95C4B 等出現上千次。改色時得全域搜尋取代，極易遺漏。此檔將實際
 * 使用的色票收斂為具名常數，供 JS / inline style 引用：
 *
 *   import { brandColors as C } from '../utils/colors';
 *   <div style={{ background: C.ink, color: C.coral }} />
 *
 * 與 design-tokens.css 的 --drvn-* 變數一一對應；CSS 用變數、JS 用此檔。
 * 數值即現行設計實際色，替換為常數不改變外觀，只讓未來改色變成「改一處」。
 * ──────────────────────────────────────────────────────────────────
 */

export const brandColors = {
    ink:       '#161415', // 主前景 / 深底
    coral:     '#F95C4B', // 主強調色
    coralDeep: '#D94030', // hover / pressed
    paper:     '#F6F4F1', // 淺色頁面底
    paper2:    '#E4DED2', // 次層米色
    sand:      '#CFC6B8', // 沙色分隔
    stone:     '#262523', // 深灰卡片底
    stone2:    '#33302C', // 深灰次層
    cream:     '#E0D8D3', // 深底上的淺色文字
    bronze:    '#C68E5D', // 古銅點綴
    sage:      '#8F9E8B', // 灰綠點綴
    clay:      '#8B7F72', // 灰棕點綴
    goldSoft:  '#D4C5A5', // 柔金
    white:     '#FFFFFF',
    blackSoft: '#161415', // 近黑沉浸底
};

/**
 * 帶透明度的常用 coral / ink，集中管理避免各處自行湊 rgba。
 */
export const brandAlpha = {
    coral10: 'rgba(249, 92, 75, 0.10)',
    coral15: 'rgba(249, 92, 75, 0.15)',
    coral45: 'rgba(249, 92, 75, 0.45)',
    ink40:   'rgba(22, 20, 21, 0.40)',
    ink55:   'rgba(22, 20, 21, 0.55)',
    ink08:   'rgba(22, 20, 21, 0.08)',
    white90: 'rgba(255, 255, 255, 0.90)',
    white55: 'rgba(255, 255, 255, 0.55)',
};

/**
 * editorialColors — DRVN Swiss Editorial 內頁色表（單一來源）
 * ──────────────────────────────────────────────────────────────────
 * 背景：專案內逾 30 個組件各自宣告 `const C = {...}` 編輯風色表，key 命名
 * 慣例一致 (paper/stone/coral/pebble/ember/black...)，但散落各檔導致改色困難。
 * 此處將「跨檔多數共識值」收斂為單一來源，供值與共識一致的組件直接引用：
 *
 *   import { editorialColors as C } from '../utils/colors';
 *
 * 注意：少數組件刻意使用「偏離共識」的色值（如排行榜深色主題把 paper/black 對調、
 * 月報自有較淺色票），那些檔保留自己的本地 C，不在此收斂範圍，以免改變既有畫面。
 * ──────────────────────────────────────────────────────────────────
 */
export const editorialColors = {
    accent: '#F95C4B',
    bg: '#F6F4F1',
    black: '#161415',
    border: 'rgba(22, 20, 21, 0.12)',
    card: '#FFFFFF',
    coral: '#F95C4B',
    deepBlack: '#161415',
    ember: '#D94030',
    faint: '#9C9C9C',
    gold: '#D4A843',
    hairline: '#DCDCDC',
    hairlineStrong: '#C7C7C7',
    ink: '#262523',
    inkSoft: '#3A3A3A',
    mist: '#E8E9E6',
    orange: '#FF4628',
    orangeDeep: '#D8331C',
    orangeWash: 'rgba(255,70,40,0.10)',
    page: '#F6F4F1',
    paper: '#F6F4F1',
    paperDeep: '#EFEEEC',
    pebble: '#CFC6B8',
    sage: '#7A9468',
    silver: '#B9C8D7',
    silverDeep: '#8FA1B3',
    silverLite: '#D7DFE6',
    smoke: '#F6F4F1',
    stone: '#E4DED2',
    sub: '#6E6E6E',
    text: '#161415',
    textDim: 'rgba(22,20,21,0.3)',
    textHero: '#161415',
    textMuted: '#8A7E73',
    textPrimary: '#161415',
    white: '#FFFFFF',
};

export default brandColors;
