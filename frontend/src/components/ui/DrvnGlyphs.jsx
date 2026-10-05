/**
 * ══════════════════════════════════════════════════════════════════════════
 * DrvnGlyphs — DRVN 自己的圖示
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要這支：
 *   「重訓」這件事在 App 裡出現幾十次（首頁補課卡、中控週曆、成就、社團、
 *   紀錄頁…），全部都借 lucide 的 Dumbbell —— 那是一支短柄啞鈴，跟 DRVN
 *   徽章系統裡的槓鈴（Barbell_shaft ＋ 階梯式槓片）不是同一個東西。
 *   同一個語意在 App 裡有兩種長相 = 違反介面標準 §9。
 *
 *   所以重訓的圖示收在這裡一份。要換圖只動這支檔，57 個使用端不用再碰。
 *
 * 用法跟 lucide 完全一樣（size / strokeWidth / color / className 都吃）：
 *   import { DrvnLift } from './ui/DrvnGlyphs';
 *   <DrvnLift size={18} strokeWidth={2.2} color="#F95C4B" />
 *
 * ⚠️ 使用端多半寫成 `import { DrvnLift as Dumbbell }`：
 *    刻意只換 import 那一行，不去改元件內部幾十處 `Dumbbell` 識別字 ——
 *    動作資料裡有「Dumbbell Press」這種字串，全域換字會把資料一起改掉。
 */

import React from 'react';

/**
 * 槓鈴 —— 中央槓身，兩側各兩片階梯式槓片加套筒。
 * 取自徽章系統的槓鈴造型（three/clubMissionBadge.js 的 Barbell_shaft／
 * Weight_plate_face），拉平成 24×24 的線性圖示。
 */
export const DrvnLift = ({ size = 24, strokeWidth = 2, color = 'currentColor', ...rest }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="round"
        {...rest}
    >
        {/* 槓身 */}
        <path d="M8.5 12h7" />
        {/* 內側大槓片 */}
        <path d="M8.5 6.75v10.5" />
        <path d="M15.5 6.75v10.5" />
        {/* 外側小槓片 */}
        <path d="M5.5 9v6" />
        <path d="M18.5 9v6" />
        {/* 套筒端點 */}
        <path d="M2.75 10.75v2.5" />
        <path d="M21.25 10.75v2.5" />
    </svg>
);

export default { DrvnLift };
