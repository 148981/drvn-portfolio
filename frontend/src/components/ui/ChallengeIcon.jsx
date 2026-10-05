/**
 * ══════════════════════════════════════════════════════════════════════════
 * ChallengeIcon — 任務／挑戰的圖示（線條 SVG，不用 emoji）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要這支：
 *   建立自訂挑戰的圖示選擇器原本是一排 emoji（🏅🏆⚡🔥💪…）。
 *   1. 產品鐵律：UI 不出現 emoji —— 全站其他地方都是線條 SVG，只有這裡破格。
 *   2. emoji 由使用者的作業系統畫，iOS／Android／桌機長得都不一樣，
 *      而這個圖示會出現在社團卡片上，等於社團的門面不受設計系統控制。
 *   3. 系統內建的月度挑戰早就已經是 icon: '' —— 只有自訂挑戰還留著 emoji，
 *      同一排卡片兩種語彙。
 *
 * 存的是 **key**（'medal'、'flame'…）不是圖形本身，所以之後換圖不用動資料。
 * 舊資料存的是 emoji，這裡用 LEGACY 表對回來，不用寫資料轉檔。
 */

import React from 'react';
import { Medal, Trophy, Zap, Flame, Target, Globe, Flag, Timer, Rocket } from 'lucide-react';
import { DrvnLift as Dumbbell } from './DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴

/** 選擇器上的十個選項（順序即畫面順序）。 */
export const CHALLENGE_ICONS = [
    { key: 'medal', label: '獎牌', Icon: Medal },
    { key: 'trophy', label: '獎盃', Icon: Trophy },
    { key: 'bolt', label: '爆發', Icon: Zap },
    { key: 'flame', label: '連續', Icon: Flame },
    { key: 'strength', label: '重訓', Icon: Dumbbell },
    { key: 'target', label: '目標', Icon: Target },
    { key: 'globe', label: '里程', Icon: Globe },
    { key: 'flag', label: '完賽', Icon: Flag },
    { key: 'timer', label: '配速', Icon: Timer },
    { key: 'rocket', label: '突破', Icon: Rocket },
];

const BY_KEY = Object.fromEntries(CHALLENGE_ICONS.map((i) => [i.key, i.Icon]));

/** 舊資料（emoji）→ 新的 key。沒對到的一律走預設，不會壞掉。 */
const LEGACY = {
    '🏅': 'medal', '🥇': 'medal', '🏆': 'trophy', '⚡': 'bolt', '⚡️': 'bolt',
    '🔥': 'flame', '💪': 'strength', '🏋️': 'strength', '🎯': 'target',
    '🌍': 'globe', '🏁': 'flag', '⏱️': 'timer', '⏱': 'timer', '🚀': 'rocket',
    '🏃': 'globe', '🌟': 'medal',
};

/** 任何存下來的值 → 一個確定畫得出來的 key。 */
export const resolveChallengeIcon = (value, fallback = 'target') => {
    const v = String(value ?? '').trim();
    if (BY_KEY[v]) return v;
    if (LEGACY[v]) return LEGACY[v];
    return fallback;
};

/**
 * @param {string} id       存下來的圖示值（key 或舊的 emoji）
 * @param {string} fallback 沒有值時用哪一個（例：任務用 target、挑戰用 trophy）
 */
const ChallengeIcon = ({ id, size = 20, color = '#161415', strokeWidth = 1.9, fallback = 'target', style }) => {
    const Icon = BY_KEY[resolveChallengeIcon(id, fallback)] || Target;
    return <Icon size={size} color={color} strokeWidth={strokeWidth} style={style} aria-hidden focusable="false" />;
};

export default ChallengeIcon;
