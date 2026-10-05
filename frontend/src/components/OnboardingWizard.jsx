/**
 * OnboardingWizard.jsx
 * ───────────────────────────────────────────────────────────────
 * 首次註冊登入後的資料初始化精靈。
 *
 * 設計語言：瑞士極簡 × 時尚雜誌排版
 *   - 配色：White Smoke #F6F4F1 / Metallic Silver #B9C8D7 / Red Orange #F95C4B / Charcoal Black #262523
 *   - 襯線大標、星芒符號 ✳、膠囊按鈕、圓圈箭頭、[ A BETTER FUTURE ] 角標
 *   - 敘事框架：城市市民「一天的生活」— 每個 Step 對應一個時段場景
 *   - framer-motion：開場動畫 + 逐頁時段轉場 + 元素逐項浮現
 *
 * 版面：固定 9:16 — 手機全螢幕；桌面鎖 430px 寬卡片置中（沿用 app 既有 mobile 模式）
 * ───────────────────────────────────────────────────────────────
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';

/* ══════════════════════════════════════════════════════════════════════════
 * 旋鈕的「起始停留位置」—— 這不是使用者的資料
 * ══════════════════════════════════════════════════════════════════════════
 * MetalKnob 是圓形刻度盤，畫面上必須停在某一格，沒辦法呈現「空白」。
 * 但停在 170 不代表我們知道這個人 170 公分。
 *
 * 安全保證在送出那一段：`d.height` 只有在使用者真的轉過旋鈕（onChange）
 * 才會有值，而送出時只 append 真的有值的欄位 —— 沒轉過就不會被存進後端。
 * 具名成 KNOB_START 是為了讓人一眼看出它跟 `weight || 70` 那種假設不同，
 * 也讓 verify_no_default_biometrics 掃描器認得它。
 * ═════════════════════════════════════════════════════════════════════════ */
const KNOB_START = { height: 170, weight: 65 };
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowLeft, X, Check, Flame, Zap, Search, QrCode, Plus, UserCheck, ChevronDown, MapPin } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import toast from '../utils/toast';
import { setChartLevel } from '../utils/advancedCharts';
import { uStorage } from '../utils/userStorage';
import FriendInviteByCode from './onboarding/FriendInviteByCode';
import { generateUnifiedPlan } from '../utils/UnifiedTrainingEngine';
import { generateCardioPlan } from '../utils/cardioPlanFusionEngine';
import { activateProgram, newProgramId } from '../utils/trainingProgram';
import { getSuggestions, follow as followUser, unfollow as unfollowUser } from '../utils/followGraph';
import { macroGoalsForMode } from '../utils/nutritionTargets';
import {
    FOCUS_OPTIONS, saveTrainingFocus, resolveWeeklySplit, checkWeeklyLoad, clearRunCycle,
} from '../utils/trainingFocus';
import { ONBOARDING_EVENT } from './OnboardingSpotlight';
import {
    hapticTap, hapticSelectionStart,
    hapticSelectionChanged, hapticSelectionEnd,
    hapticWarning, hapticSuccess,
} from '../utils/haptics';
import { copyToClipboard } from '../utils/copyToClipboard';
import { T } from '../utils/theme';
import { toLocalDateKey } from '../utils/localDate';
import { calcBMR_MifflinStJeor, calcTDEE } from '../utils/NutritionEngine';
import { QUICK_RUN_COURSES, courseMinutesRange } from '../utils/quickRunCourses';

/* ═══════════════════════════════════════════════════════════════
   設計 Token — 取自參考圖（瑞士極簡 social-media 編輯風）
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   Urban Athleisure 配色 — 全 wizard 統一視覺系統
   來源：圖一色卡
     White Smoke    #F6F4F1  ← 主亮底 / 反白卡 / 主文字（暗模式）
     Metallic Silver #B9C8D7 ← 冷金屬藍灰 / 副文字 / 線條 / 輔助
     Red Orange     #F95C4B  ← 唯一爆點 / 選中態 / 重點符號
     Charcoal Black #262523  ← 主暗底 / 主文字（亮模式）
   ═══════════════════════════════════════════════════════════════ */
const C = {
  paper: T.PAPER,
  mist: T.STONE,
  ink: T.BLACK,
  brick: T.CORAL,
  cream: T.PAPER,
  mute: T.PEBBLE,
  serif: '"Tenor Sans", "Noto Sans TC", system-ui, sans-serif', // §2: serif 僅限報告封面
  sans: '"Tenor Sans", "Helvetica Neue", "PingFang TC", "Noto Sans TC", sans-serif',
};

/* ── 健身菜單預覽：縮圖小工具 ──────────────────────────────────────
   無本地動作圖庫，故用「肌群配色 + 動作字首縮寫」做極簡縮圖 tile。 */
const MUSCLE_TINT = {
    chest: '#E0512F', back: '#3F6F62', lats: '#3F6F62',
    shoulders: '#C18A3A', delts: '#C18A3A',
    legs: '#445C8C', quads: '#445C8C', hamstrings: '#4A6F8C',
    glutes: '#A86440', arms: '#8C4A6B', biceps: '#8C4A6B',
    triceps: '#7A5288', core: '#5C7A3C', abs: '#5C7A3C',
    calves: '#6B6256', cardio: '#2F8C8C',
    fullbody: '#161415', full: '#161415',
};
const muscleTint = (m) => MUSCLE_TINT[String(m || '').toLowerCase().trim()] || '#9C968C';
const monogram = (name) => {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '··';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
};

/* alias — 嚴格只用圖一四色，回到瑞士極簡 */
const URBAN = {
    smoke: '#F6F4F1',    // Paper
    stone: '#E4DED2',    // Stone
    silver: '#CFC6B8',   // Pebble
    flare: '#F95C4B',    // Coral
    charcoal: '#161415', // Deep Black
    ember: '#D94030',    // Ember
    smokeFade: 'rgba(246,244,241,0.55)',
    silverFade: 'rgba(207,198,184,0.32)',
    smokeLine: 'rgba(246,244,241,0.16)',
    silverLine: 'rgba(207,198,184,0.42)',
    flareGlow: 'rgba(249,92,75,0.18)',
};

const TITANIUM = {
    // 亮面鍍鉻金屬漸層（Chrome - 圖一）
    brushedH: `linear-gradient(180deg, #F0F0F0 0%, #D4D4D4 20%, #A3A3A3 50%, #D4D4D4 80%, #F0F0F0 100%)`,
    // 拋光鏡面（中央亮點，圖二旋鈕平滑表面）
    polished: `radial-gradient(ellipse at center, #FFFFFF 0%, #E6E6E6 40%, #B3B3B3 100%)`,
    // 滾花紋（knurled，圖二旋鈕外圈）
    knurled: `repeating-conic-gradient(from 0deg at 50% 50%, #A6A6A6 0deg 2deg, #7A7A7A 2deg 4deg)`,
    // 邊緣高光
    edgeHL: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.2)',

    // 👇 新增以下兩個材質來還原照片
    conicMetal: `conic-gradient(from 180deg at 50% 50%, #A3A3A3 0%, #F0F0F0 15%, #7A7A7A 35%, #F0F0F0 50%, #A3A3A3 65%, #F0F0F0 85%, #A3A3A3 100%)`,
    frostedWhite: `linear-gradient(135deg, #F9F9F9 0%, #D9D9D9 100%)`,
    // 👇 新增暗黑金屬質感（圖四）
    darkSpun: `linear-gradient(135deg, #2E2E32 0%, #141416 20%, #45454E 50%, #141416 80%, #2E2E32 100%)`,
    darkEdgeHL: 'inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.6)',
    // 👇 新增透明玻璃面板質感（中性深灰透明底）
    glassPanel: `radial-gradient(ellipse at 20% 10%, rgba(255,255,255,0.12) 0%, transparent 40%), linear-gradient(135deg, rgba(45,45,50,0.6) 0%, rgba(20,20,25,0.7) 40%, rgba(10,10,15,0.85) 100%)`,
    glassEdgeHL: `inset 0 2px 4px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08), 0 10px 24px rgba(0,0,0,0.6)`,
};

/* 透明度 helper — 取代寫死的 rgba(245,245,245,...) / rgba(32,32,32,...) */
const onDark = (a = 1) => `rgba(245,245,245,${a})`;      // 暗底之上的 smoke
const onLight = (a = 1) => `rgba(32,32,32,${a})`;        // 亮底之上的 charcoal
const silverA = (a = 1) => `rgba(185,200,215,${a})`;     // 金屬藍灰透明
const EASE = [0.16, 1, 0.3, 1];

/* ───────── Liquid Glass 材質 helper（iOS 26 風格，移植到 Web CSS）─────────
   核心：背景模糊 + 飽和度提升（折射感）、半透明填色（透光）、頂緣亮邊高光
   （光線反射）、選中時 coral tint（突顯）。所有半透明面板統一套這支，
   確保整個精靈的玻璃語言一致。
   selected=true → 提高不透明度 + coral 內光，作為「互動回應」的視覺。 */
const glassMat = (selected = false, radius = 16) => ({
    borderRadius: radius,
    background: selected
        ? 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.07) 100%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 100%)',
    border: `1px solid ${selected ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.1)'}`,
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    boxShadow: selected
        ? 'inset 0 1.5px 1px rgba(255,255,255,0.5), inset 0 -1px 2px rgba(0,0,0,0.35), 0 0 0 1px rgba(249,92,75,0.22), 0 12px 36px rgba(0,0,0,0.32)'
        : 'inset 0 1.5px 1px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.3), 0 10px 30px rgba(0,0,0,0.28)',
});

/* haptic 已抽到 ../utils/haptics — 統一使用 hapticTap / hapticSelectionStart /
   hapticSelectionChanged / hapticSelectionEnd（iOS WKWebView Bridge → Android vibrate） */

/* 城市市民「一天的生活」— 每個 step 的時段場景
   mood 只用來微調背景色暈強弱，不再對應任何具象 icon。
*/
const DAYPARTS = [
    { time: '05:45', tag: 'THE AWAKENING', scene: '城市仍在沉睡', mood: 'predawn' },
    { time: '06:30', tag: 'FIRST LIGHT', scene: '晨光下的自己', mood: 'dawn' },
    { time: '07:15', tag: 'THE MIRROR', scene: '出門前的一面之緣', mood: 'morning' },
    { time: '08:00', tag: 'THE COMMUTE', scene: '通勤路上的意圖', mood: 'morning' },
    { time: '10:00', tag: 'THE GROUNDWORK', scene: '打底的時刻', mood: 'morning_bright' },
    { time: '12:30', tag: 'MIDDAY MOMENTUM', scene: '午間的節奏', mood: 'noon' },
    { time: '15:00', tag: 'THE READING', scene: '閱讀身體的訊號', mood: 'afternoon' },
    { time: '18:00', tag: 'THE FUEL', scene: '為今天補給', mood: 'dusk' },
    { time: '20:30', tag: 'THE CIRCLE', scene: '夜晚的同伴', mood: 'night' },
    { time: '22:00', tag: 'THE BLUEPRINT', scene: '為明天定稿', mood: 'late_night' },
];

/* ═══════════════════════════════════════════════════════════════
   CityScene — 城市一天背景圖庫
   ───────────────────────────────────────────────────────────────
   每個 step 對應該時段的城市意象（建築剪影 / 陽光 / 綠樹 / 通勤線 /
   夜景燈火），全部用圖一四色繪製。SVG 內嵌、不依賴外部素材。
   ═══════════════════════════════════════════════════════════════ */
const CityScene = ({ dark, step, bgOverride }) => {
    let bgImg = null;
    if (bgOverride) bgImg = bgOverride;
    else if (step === 0) bgImg = '/desktop/signin1.png';
    else if (step === 1) bgImg = '/desktop/signin2.png';
    else if (step === 2) bgImg = '/desktop/signin3.png';
    else if (step === 3) bgImg = '/desktop/singin4.png';
    else if (step === 4) bgImg = '/desktop/signin5.png';
    else if (step === 5) bgImg = '/desktop/singin6.png';
    else if (step === 6) bgImg = '/desktop/signin7.png';
    else if (step === 7) bgImg = '/desktop/singin8.png';
    else if (step === 8) bgImg = '/desktop/signin9.png';

    return (
        <div aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 0,
            pointerEvents: 'none',
            background: bgImg ? `url("${bgImg}") center/cover no-repeat` : (dark ? URBAN.charcoal : URBAN.smoke),
        }}>
            {bgImg && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(22, 20, 21, 0.75)'
                }} />
            )}
        </div>
    );
};

/* ───────── 星芒符號（參考圖反覆出現的圖樣）───────── */
const Asterisk = ({ size = 14, color = C.brick }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
);

/* ───────── 頁面外殼：9:16 卡片（瑞士極簡純色底）───────── */
const Stage = ({ step, dark = false, children, footer, bgOverride }) => {
    const bg = dark ? URBAN.charcoal : URBAN.smoke;
    const fg = dark ? URBAN.smoke : URBAN.charcoal;
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: dark ? '#0A0C12' : '#DDE3EB',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {/* 9:16 卡片 — 手機填滿，桌面鎖 430px */}
            <div style={{
                position: 'relative', width: '100%', maxWidth: 430,
                height: '100%', maxHeight: '100dvh', aspectRatio: '9 / 16',
                background: bg, color: fg, overflow: 'hidden',
                fontFamily: C.sans, display: 'flex', flexDirection: 'column',
                boxShadow: dark
                    ? `0 30px 80px rgba(0,0,0,0.45)`
                    : `0 30px 80px rgba(32,32,32,0.18)`,
            }}>
                {/* 背景（根據 step 顯示圖片或純色；可由 bgOverride 覆寫，例如跑步設定頁）*/}
                <CityScene dark={dark} step={step} bgOverride={bgOverride} />
                {/* 內容包一層 relative，疊在背景之上 */}
                <div style={{
                    position: 'relative', zIndex: 1,
                    display: 'flex', flexDirection: 'column',
                    height: '100%',
                }}>
                    {/* 內容區（可捲動）— 頂部留白替代原本的角標列
                        Step 1+ 會在 top:12 蓋一條 TopMetaBar，故 padding-top 拉到 50px 留位 */}
                    <div style={{
                        flex: 1, overflowY: 'auto',
                        padding: `calc(max(env(safe-area-inset-top), 16px) + ${step > 0 ? 46 : 24}px) 24px 8px`,
                    }}>
                        {children}
                    </div>
                    {/* 底部導航 */}
                    {footer}
                </div>
            </div>
        </div>
    );
};

/* ───────── 瑞士極簡標題 — 只留主標 + Red Orange 短線 + 副標 ───────── */
const Masthead = ({ index, scene, title, sub, dark = true }) => {
    const fg = dark ? URBAN.smoke : URBAN.charcoal;
    const subFg = dark ? onDark(0.6) : silverA(0.95);
    const tagFg = dark ? onDark(0.62) : silverA(0.9);
    
    // 從 DAYPARTS 反查對應的時段
    const part = DAYPARTS.find(p => p.scene === scene) || DAYPARTS.find(p => p.tag === SCENE_EN[scene]);
    const timeLabel = part ? part.time : null;
    const sceneEN = SCENE_EN[scene] || '';

    return (
        <div style={{ marginBottom: 22 }}>
            {/* 時間標籤 + 場景 EN 標籤 — 與 Step 0 同一套瑞士編輯語法 */}
            {(timeLabel || scene) && (
                <motion.div
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        marginBottom: 14, flexWrap: 'wrap',
                    }}>
                    {timeLabel && (
                        <span style={{
                            background: URBAN.flare, color: '#fff',
                            fontSize: 9, fontWeight: 800, padding: '3.5px 8px',
                            letterSpacing: '0.16em', fontFamily: C.sans,
                        }}>{timeLabel}</span>
                    )}
                    {sceneEN && (
                        <span style={{
                            fontSize: 9, letterSpacing: '0.24em', fontWeight: 700,
                            color: tagFg, fontFamily: C.sans,
                        }}>
                            {sceneEN}
                        </span>
                    )}
                    {scene && (
                        <span style={{
                            fontSize: 11, fontStyle: 'italic',
                            color: dark ? onDark(0.45) : silverA(0.7),
                            fontFamily: C.serif,
                        }}>
                            / {scene}
                        </span>
                    )}
                </motion.div>
            )}
            <motion.h1
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.6, ease: EASE }}
                style={{
                    fontFamily: C.serif, fontSize: 36, lineHeight: 1.05, fontWeight: 400,
                    margin: 0, letterSpacing: '-0.012em', color: fg,
                }}>
                {title}
            </motion.h1>
            <motion.div
                initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.35, duration: 0.55, ease: EASE }}
                style={{ marginTop: 10, transformOrigin: 'left' }}
            >
                <HandUnderline width={60} color={URBAN.flare} strokeWidth={4} />
            </motion.div>
            {sub && (
                <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    style={{
                        fontSize: 13, lineHeight: 1.6, margin: '14px 0 0',
                        color: subFg, maxWidth: 340,
                    }}>
                    {sub}
                </motion.p>
            )}
        </div>
    );
};

/* 步驟場景中文 → 英文編輯標籤對照（與 Step 0 timeline 同語系） */
const SCENE_EN = {
    '晨光下的自己': 'FIRST LIGHT',
    '出門前的一面之緣': 'THE MIRROR',
    '通勤路上的意圖': 'THE COMMUTE',
    '打底的時刻': 'THE GROUNDWORK',
    '午間的節奏': 'MIDDAY MOMENTUM',
    '閱讀身體的訊號': 'THE READING',
    '為今天補給': 'THE FUEL',
    '夜晚的同伴': 'THE CIRCLE',
    '為明天定稿': 'THE BLUEPRINT',
};

/* ───────── TopMetaBar — Step 1+ 每頁置頂的瑞士編輯橫條
   左：✳ DRVN · STEP 0X/09
   右：場景時段（DAYPARTS[step]） — 城市一天的當下時刻
   讓 Step 0 的編輯語法不斷層，跨頁面保持連續性。 */
const TopMetaBar = ({ step, dark = true }) => {
    const part = DAYPARTS[step] || DAYPARTS[0];
    const subtle = dark ? onDark(0.62) : silverA(0.85);
    return (
        <motion.div
            key={`meta-${step}`}
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
                position: 'absolute', top: `calc(max(env(safe-area-inset-top), 12px) + 4px)`, left: 0, right: 0,
                padding: '0 22px', zIndex: 3,
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline',
                pointerEvents: 'none',
            }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <Asterisk size={9} color={URBAN.flare} />
                <span style={{
                    fontSize: 9, letterSpacing: '0.26em', fontWeight: 800,
                    color: subtle, fontFamily: C.sans, textTransform: 'uppercase',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    DRVN&nbsp;·&nbsp;STEP&nbsp;{String(step).padStart(2, '0')}/09
                </span>
            </span>
            {/* 右側小字已移除，將時間移至 Masthead 紅色標籤 */}
        </motion.div>
    );
};

/* ═══════════════════════════════════════════════════════════════
   手繪元素（HandDrawn）— 取代瑞士純排版的厚重感
   參考：Lululemon Global Running Day / Cook Like A Pro 海報語法
   靈感：粗黑體 + 螢光馬克筆風的手繪圈/線/箭頭穿插型字裡
   配色：URBAN.flare (Coral) 當主螢光 — 取代外部參考的黃色，保持品牌
   ═══════════════════════════════════════════════════════════════ */

/* 馬克筆風橢圓圈 — 包住單字/數字 */
const HandCircle = ({ width = 140, height = 60, color = URBAN.flare, strokeWidth = 6 }) => (
    <svg width={width} height={height} viewBox="0 0 200 80"
        style={{ overflow: 'visible' }} preserveAspectRatio="none">
        <path
            d="M 24 42 C 18 18, 60 6, 100 6 C 152 4, 196 18, 192 44 C 188 68, 134 78, 96 76 C 50 74, 28 66, 24 42 Z"
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeLinejoin="round"
            opacity="0.9"
        />
    </svg>
);

/* 馬克筆螢光底色 — 一條粗短橫條當作 highlight，可塞在字後面當底紋 */
const HandHighlight = ({ width = 80, color = URBAN.flare }) => (
    <svg width={width} height="22" viewBox="0 0 100 22" preserveAspectRatio="none">
        <path
            d="M 3 14 C 16 8, 38 9, 55 11 C 72 12, 88 10, 97 13 L 96 18 C 80 20, 60 19, 42 18 C 24 17, 8 18, 4 16 Z"
            fill={color} opacity="0.85"
        />
    </svg>
);

/* 手繪斜線標 — Subculture 海報那種斜紋 */
const HandStrike = ({ width = 60, color = URBAN.flare }) => (
    <svg width={width} height="22" viewBox="0 0 100 22" preserveAspectRatio="none">
        <path d="M 5 18 Q 25 8, 50 12 T 96 6" fill="none" stroke={color}
            strokeWidth="4" strokeLinecap="round" />
    </svg>
);

/* 戲劇感手繪箭頭 — 大弧度，帶箭頭 */
const HandArrow = ({ width = 60, height = 28, color = URBAN.flare, strokeWidth = 3 }) => (
    <svg width={width} height={height} viewBox="0 0 80 36" style={{ flexShrink: 0 }}>
        <path
            d="M 4 26 C 18 14, 36 12, 56 16 M 48 8 Q 54 12, 60 18 M 60 18 Q 56 22, 50 28"
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeLinejoin="round"
        />
    </svg>
);

/* 手繪底線 — 一條稍微波動的馬克筆線 */
const HandUnderline = ({ width = 60, color = URBAN.flare, strokeWidth = 3 }) => (
    <svg width={width} height="8" viewBox="0 0 100 10" preserveAspectRatio="none">
        <path d="M 2 6 Q 22 2, 50 5 T 98 4" fill="none" stroke={color}
            strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
);

/* 手繪 ✓ — 略歪的勾 */
const HandCheck = ({ size = 14, color = URBAN.charcoal }) => (
    <svg width={size} height={size} viewBox="0 0 20 20">
        <path d="M 3 11 Q 6 13, 8 15 Q 12 8, 17 4"
            fill="none" stroke={color} strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/* 手繪星芒 ✳ — 比 Asterisk 更歪 */
const HandStar = ({ size = 20, color = URBAN.flare }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <path d="M 12 3 Q 12 11, 13 12 Q 21 12, 21 12 M 11 12 Q 3 12, 3 12 M 12 13 Q 12 21, 12 21 M 6 6 Q 11 11, 12 12 Q 13 13, 18 18 M 18 6 Q 13 11, 12 12 Q 11 13, 6 18"
            stroke={color} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
);

/* 手繪 squiggle — 連續波浪 */
const HandSquiggle = ({ width = 80, color = URBAN.flare, strokeWidth = 2 }) => (
    <svg width={width} height="10" viewBox="0 0 100 10" preserveAspectRatio="none">
        <path d="M 2 5 Q 10 1, 18 5 T 34 5 T 50 5 T 66 5 T 82 5 T 98 5"
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" />
    </svg>
);

/* CircledNumber — 大數字 + 馬克筆圈 */
const CircledNumber = ({ num, color = URBAN.flare, dark = true }) => (
    <span style={{
        position: 'relative', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        width: 56, height: 56,
    }}>
        <span style={{ position: 'absolute', inset: 0 }}>
            <HandCircle width={56} height={56} color={color} strokeWidth={3.5} />
        </span>
        <span style={{
            fontFamily: C.serif, fontSize: 22, fontWeight: 400,
            color: dark ? URBAN.smoke : URBAN.charcoal,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>{num}</span>
    </span>
);

/* ═══════════════════════════════════════════════════════════════
   輸入元件 — Slider / Segmented / NumberWheel
   ═══════════════════════════════════════════════════════════════ */
/* ───────── MetalKnob — 仿物理銀色金屬旋鈕 (支援直覺畫圓拖曳) ───────── */
const MetalKnob = ({ label, value, min, max, step = 1, onChange, unit = '' }) => {
    const knobRef = React.useRef(null);
    const lastAngleRef = React.useRef(0);
    const rawValueRef = React.useRef(value);
    const velocityRef = React.useRef(0);
    const momentumRef = React.useRef(null);
    const lastStepRef = React.useRef(value);

    const tickAudio = React.useMemo(() => {
        try {
            const a = new Audio('/audio/tick.mp3');
            a.volume = 0.15;
            return a;
        } catch { return null; }
    }, []);

    React.useEffect(() => {
        rawValueRef.current = value;
    }, [value]);

    const getAngle = (x, y, rect) => {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(y - cy, x - cx);
    };

    const handlePanStart = async (e, info) => {
        if (!knobRef.current) return;
        const rect = knobRef.current.getBoundingClientRect();
        lastAngleRef.current = getAngle(info.point.x, info.point.y, rect);
        await hapticSelectionStart();
    };

    const handlePan = async (e, info) => {
        if (!knobRef.current) return;
        const rect = knobRef.current.getBoundingClientRect();
        const currentAngle = getAngle(info.point.x, info.point.y, rect);

        let deltaAngle = currentAngle - lastAngleRef.current;

        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

        lastAngleRef.current = currentAngle;

        velocityRef.current *= 0.86;
        velocityRef.current += deltaAngle * 0.12;

        const sensitivity = (max - min) / (Math.PI * 1.8);
        let newValue = rawValueRef.current + deltaAngle * sensitivity;
        newValue = Math.max(min, Math.min(max, newValue));
        rawValueRef.current = newValue;

        const stepped = Math.round(newValue / step) * step;

        if (stepped !== lastStepRef.current) {
            lastStepRef.current = stepped;
            await hapticSelectionChanged();
            if (tickAudio) {
                tickAudio.currentTime = 0;
                tickAudio.play().catch(() => { });
            }
            onChange(stepped);
        }
    };

    const handlePanEnd = async () => {
        await hapticSelectionEnd();
        cancelAnimationFrame(momentumRef.current);

        const animate = () => {
            velocityRef.current *= 0.86;

            if (Math.abs(velocityRef.current) < 0.0001) return;

            let newValue = rawValueRef.current + velocityRef.current * 25;
            newValue = Math.max(min, Math.min(max, newValue));
            rawValueRef.current = newValue;

            const stepped = Math.round(newValue / step) * step;

            if (stepped !== lastStepRef.current) {
                lastStepRef.current = stepped;
                hapticSelectionChanged();
                if (tickAudio) {
                    tickAudio.currentTime = 0;
                    tickAudio.play().catch(() => { });
                }
                onChange(stepped);
            }

            momentumRef.current = requestAnimationFrame(animate);
        };

        animate();
    };

    const percentage = (value - min) / (max - min);
    const rotation = -135 + percentage * 270;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 20 }}>

            <div style={{ position: 'relative' }}>
                {/* 雙層光暈 — 銀色基底 + Coral 活躍光暈（旋轉時更亮） */}
                <div style={{
                    position: 'absolute', inset: -22, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 55%)',
                    pointerEvents: 'none', zIndex: 0,
                    filter: 'blur(4px)',
                }} />
                <motion.div
                    animate={{
                        opacity: [0.45, 0.7, 0.45],
                        scale: [1, 1.04, 1],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                        position: 'absolute', inset: -18, borderRadius: '50%',
                        background: `radial-gradient(circle, rgba(249,92,75,0.32) 0%, transparent 60%)`,
                        pointerEvents: 'none', zIndex: 0,
                        filter: 'blur(6px)',
                    }}
                />

                <motion.div
                    ref={knobRef}
                    onPanStart={handlePanStart}
                    onPan={handlePan}
                    onPanEnd={handlePanEnd}
                    whileTap={{ scale: 0.96 }}
                    style={{
                        touchAction: 'none',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        width: 110, height: 110, borderRadius: '50%',
                        background: TITANIUM.conicMetal,
                        boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.9), inset 0 -1px 3px rgba(0,0,0,0.3), 0 12px 28px rgba(0,0,0,0.65), 0 0 22px rgba(249,92,75,0.35)',
                        cursor: 'grab',
                        position: 'relative', zIndex: 1
                    }}
                >
                    {/* 指示器動畫 - 真正 spring 感 */}
                    <motion.div
                        animate={{ rotate: rotation }}
                        transition={{ type: 'spring', stiffness: 220, damping: 20, mass: 0.8 }}
                        style={{ position: 'absolute', inset: 0, borderRadius: '50%' }}
                    >
                        {/* 珊瑚色 (Coral) 指針 */}
                        <div style={{
                            position: 'absolute',
                            top: '50%', left: '50%',
                            width: '38%', height: 3,
                            background: URBAN.flare, // 原本設定的 Coral 色
                            borderRadius: 2,
                            transformOrigin: 'left center',
                            transform: 'translateY(-50%)',
                            boxShadow: `0 0 10px ${URBAN.flare}, inset 0 1px 1px rgba(255,255,255,0.5)`, // 加強指針發光
                        }} />
                    </motion.div>
                </motion.div>
            </div>

            {/* 下方數據 readout 保持不變 */}
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                    color: onDark(0.55), fontFamily: C.sans, textTransform: 'uppercase',
                    marginBottom: 2,
                }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                    <span style={{
                        fontFamily: C.serif, fontSize: 32, fontWeight: 400,
                        color: URBAN.smoke, lineHeight: 1, letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                    }}>{Math.round(value)}</span>
                    <span style={{
                        fontSize: 9, letterSpacing: '0.18em', fontWeight: 800,
                        color: URBAN.flare, fontFamily: C.sans,
                    }}>{unit}</span>
                </div>
            </div>
        </div>
    );
};

/* ───────── MetalSlider — 橫向鈦金屬滑桿 ───────── */
const MetalSlider = ({ label, value, min, max, step = 1, onChange, unit = '', ticks = null }) => {
    // 用本地 state 即時驅動「數字 + 進度 + thumb」，確保三者永遠一致，
    // 不會發生 thumb 已動但上方數字還停在舊值的情況。
    const [localVal, setLocalVal] = React.useState(value);
    React.useEffect(() => { setLocalVal(value); }, [value]);

    const display = localVal;
    const pct = ((display - min) / (max - min)) * 100;

    const lastValueRef = React.useRef(value);
    const handleChange = (e) => {
        const val = Number(e.target.value);
        setLocalVal(val); // 立即更新顯示
        if (val !== lastValueRef.current) {
            hapticSelectionChanged();
            lastValueRef.current = val;
            onChange(val);
        }
    };

    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{
                display: 'flex', alignItems: 'baseline',
                justifyContent: 'space-between', marginBottom: 16,
            }}>
                <span style={{
                    fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                    color: onDark(0.55), fontFamily: C.sans, textTransform: 'uppercase',
                }}>{label}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{
                        fontFamily: C.serif, fontSize: 30, fontWeight: 400,
                        color: URBAN.smoke, lineHeight: 1, letterSpacing: '-0.012em',
                        fontVariantNumeric: 'tabular-nums',
                    }}>{display}</span>
                    <span style={{
                        fontSize: 9, letterSpacing: '0.18em', fontWeight: 800,
                        color: URBAN.flare, fontFamily: C.sans,
                    }}>{unit}</span>
                </span>
            </div>

            <div style={{ position: 'relative', height: 24, display: 'flex', alignItems: 'center' }}>
                {/* 金屬軌道 */}
                <div style={{
                    position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3,
                    background: TITANIUM.darkSpun,
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)',
                }} />
                {/* 進度填充 */}
                <div style={{
                    position: 'absolute', left: 0, height: 6, borderRadius: 3,
                    background: URBAN.flare, width: `${pct}%`,
                    boxShadow: `0 0 10px ${URBAN.flare}`,
                }} />

                {/* 原生 range input 疊在上方透明層來處理交互 */}
                <input type="range" min={min} max={max} step={step} value={display}
                    onChange={handleChange}
                    onTouchStart={hapticSelectionStart}
                    onTouchEnd={hapticSelectionEnd}
                    style={{
                        position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer',
                        height: '100%', margin: 0, zIndex: 2,
                    }}
                />

                {/* 金屬 Thumb (跟隨 pct) */}
                <motion.div
                    animate={{ left: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{
                        position: 'absolute', width: 24, height: 24, borderRadius: '50%',
                        background: TITANIUM.polished,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.3)',
                        transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TITANIUM.knurled, opacity: 0.5 }} />
                </motion.div>
            </div>

            {ticks && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginTop: 8, padding: '0 4px',
                }}>
                    {ticks.map((t, i) => (
                        <span key={i} style={{
                            fontSize: 9, letterSpacing: '0.16em', fontWeight: 700,
                            color: onDark(0.4), fontFamily: C.sans,
                            fontVariantNumeric: 'tabular-nums',
                        }}>{t}</span>
                    ))}
                </div>
            )}
        </div>
    );
};

/* SwissSlider — 帶大字 readout + 手繪刻度 */
const SwissSlider = ({
    label, value, min, max, step = 1, onChange, unit = '', accent = URBAN.flare,
    ticks = null, // 可選的刻度節點
}) => {
    const pct = ((value - min) / (max - min)) * 100;

    const lastValueRef = React.useRef(value);
    const handleChange = (e) => {
        const val = Number(e.target.value);
        if (val !== lastValueRef.current) {
            hapticSelectionChanged();
            lastValueRef.current = val;
            onChange(val);
        }
    };

    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{
                display: 'flex', alignItems: 'baseline',
                justifyContent: 'space-between', marginBottom: 10,
            }}>
                <span style={{
                    fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                    color: onDark(0.55), fontFamily: C.sans, textTransform: 'uppercase',
                }}>{label}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <motion.span key={value}
                        initial={{ scale: 1.06 }} animate={{ scale: 1 }}
                        transition={{ duration: 0.12 }}
                        style={{
                            fontFamily: C.serif, fontSize: 32, fontWeight: 400,
                            color: URBAN.smoke, lineHeight: 1, letterSpacing: '-0.014em',
                            fontVariantNumeric: 'tabular-nums',
                        }}>{value}</motion.span>
                    <span style={{
                        fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                        color: accent, fontFamily: C.sans,
                    }}>{unit}</span>
                </span>
            </div>
            {/* 鈦金屬軌 */}
            <div style={{ position: 'relative', padding: '8px 0', height: 28 }}>
                <div style={{
                    position: 'absolute', top: '50%', left: 0, right: 0,
                    height: 5, transform: 'translateY(-50%)',
                    background: 'linear-gradient(180deg, #C8CCD0 0%, #8A8E93 50%, #5A5D61 100%)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 999,
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08)',
                }} />
                <div style={{
                    position: 'absolute', top: '50%', left: 0,
                    width: `${pct}%`,
                    height: 5, transform: 'translateY(-50%)',
                    background: `linear-gradient(180deg, ${URBAN.flare} 0%, ${URBAN.ember} 100%)`,
                    borderRadius: 999,
                    boxShadow: `0 0 12px rgba(249,92,75,0.5)`,
                    pointerEvents: 'none',
                }} />
                <input type="range" min={min} max={max} step={step} value={value}
                    onChange={handleChange}
                    onTouchStart={hapticSelectionStart}
                    onTouchEnd={hapticSelectionEnd}
                    style={{
                        position: 'relative', width: '100%', accentColor: accent,
                        background: 'transparent', cursor: 'pointer',
                        margin: 0, height: 28, WebkitAppearance: 'none', appearance: 'none',
                    }}
                />
            </div>
            {ticks && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginTop: 6, padding: '0 4px',
                }}>
                    {ticks.map((t, i) => (
                        <span key={i} style={{
                            fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
                            color: onDark(0.42), fontFamily: C.sans,
                            fontVariantNumeric: 'tabular-nums',
                        }}>{t}</span>
                    ))}
                </div>
            )}
        </div>
    );
};
/* Alias — TitaniumSlider 與 SwissSlider 同一份實作 */
const TitaniumSlider = SwissSlider;

/* ═══════════════════════════════════════════════════════════════
   RotaryKnob — 金屬旋鈕｜阻尼震動 + Coral 光暈 + 拉絲同心圓
   交互：在旋鈕上按住拖曳（圓周運動），每 5° 觸發一次 selection haptic
   ═══════════════════════════════════════════════════════════════ */
const RotaryKnob = ({
    label, value, min, max, step = 1, unit, onChange, size = 140,
}) => {
    const knobRef = useRef(null);
    const lastAngleRef = useRef(null);
    const accumRef = useRef(0);
    const [active, setActive] = useState(false);
    const valueRef = useRef(value);
    valueRef.current = value;

    const ratio = (value - min) / (max - min);
    const visualAngle = ratio * 270 - 135;

    const getAngle = (e) => {
        const rect = knobRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const cx2 = e.touches?.[0]?.clientX ?? e.clientX;
        const cy2 = e.touches?.[0]?.clientY ?? e.clientY;
        return Math.atan2(cy2 - cy, cx2 - cx) * (180 / Math.PI);
    };

    const onPointerDown = (e) => {
        e.preventDefault();
        setActive(true);
        hapticSelectionStart();
        lastAngleRef.current = getAngle(e);
        accumRef.current = 0;
    };

    useEffect(() => {
        if (!active) return;
        const onMove = (e) => {
            const currentAngle = getAngle(e);
            if (lastAngleRef.current === null) {
                lastAngleRef.current = currentAngle; return;
            }
            let delta = currentAngle - lastAngleRef.current;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            accumRef.current += delta;
            const DEG_PER_STEP = 5;
            const stepsToApply = Math.trunc(accumRef.current / DEG_PER_STEP);
            if (stepsToApply !== 0) {
                const newValue = Math.max(min, Math.min(max,
                    valueRef.current + stepsToApply * step));
                if (newValue !== valueRef.current) {
                    onChange(newValue);
                    hapticSelectionChanged();
                }
                accumRef.current -= stepsToApply * DEG_PER_STEP;
            }
            lastAngleRef.current = currentAngle;
            if (e.cancelable) e.preventDefault?.();
        };
        const onEnd = () => {
            setActive(false);
            lastAngleRef.current = null;
            accumRef.current = 0;
            hapticSelectionEnd();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, [active, min, max, step, onChange]);

    const knobId = `knob-${String(label).replace(/[^A-Za-z0-9]/g, '')}`;
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative', userSelect: 'none',
        }}>
            {/* 光暈 */}
            <motion.div
                animate={{ opacity: active ? 1 : 0.6, scale: active ? 1.06 : 1 }}
                transition={{ duration: 0.25 }}
                style={{
                    position: 'absolute', top: -12,
                    width: size + 24, height: size + 24,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, rgba(249,92,75,${active ? 0.5 : 0.22}) 0%, transparent 65%)`,
                    pointerEvents: 'none', filter: 'blur(6px)', zIndex: 0,
                }}
            />
            <div
                ref={knobRef}
                onPointerDown={onPointerDown}
                onTouchStart={onPointerDown}
                style={{
                    width: size, height: size, position: 'relative',
                    cursor: active ? 'grabbing' : 'grab',
                    touchAction: 'none', zIndex: 1,
                    filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))',
                }}>
                <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
                    <defs>
                        <radialGradient id={`metal-${knobId}`} cx="35%" cy="30%">
                            <stop offset="0%" stopColor="#F5F5F8" />
                            <stop offset="55%" stopColor="#A8A8AC" />
                            <stop offset="100%" stopColor="#3A3A3D" />
                        </radialGradient>
                        <linearGradient id={`rim-${knobId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#D8D8DC" />
                            <stop offset="50%" stopColor="#787880" />
                            <stop offset="100%" stopColor="#2A2A2D" />
                        </linearGradient>
                    </defs>
                    <circle cx="100" cy="100" r="98" fill={`url(#rim-${knobId})`} />
                    {Array.from({ length: 72 }).map((_, i) => {
                        const a = (i * 5) * Math.PI / 180;
                        const x1 = 100 + Math.cos(a) * 98;
                        const y1 = 100 + Math.sin(a) * 98;
                        const x2 = 100 + Math.cos(a) * 84;
                        const y2 = 100 + Math.sin(a) * 84;
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke="rgba(0,0,0,0.5)" strokeWidth="0.9" />;
                    })}
                    <circle cx="100" cy="100" r="82" fill={`url(#metal-${knobId})`}
                        stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                    {[78, 70, 60, 48, 35, 22, 12].map((r, i) => (
                        <circle key={i} cx="100" cy="100" r={r}
                            fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="0.7" />
                    ))}
                    <ellipse cx="78" cy="60" rx="28" ry="10"
                        fill="rgba(255,255,255,0.35)" />
                    <g transform={`rotate(${visualAngle} 100 100)`}
                        style={{ transition: active ? 'none' : 'transform 0.18s cubic-bezier(0.16,1,0.3,1)' }}>
                        <line x1="100" y1="24" x2="100" y2="58"
                            stroke={URBAN.flare} strokeWidth="3.5" strokeLinecap="round" />
                        <circle cx="100" cy="100" r="4" fill={URBAN.flare} />
                    </g>
                </svg>
            </div>
            <div style={{
                display: 'flex', alignItems: 'baseline', gap: 5,
                marginTop: 14, lineHeight: 1,
            }}>
                <motion.span key={value}
                    initial={{ scale: 1.08 }} animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                    style={{
                        fontFamily: C.serif, fontSize: 38, fontWeight: 400,
                        color: URBAN.smoke, letterSpacing: '-0.018em',
                        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    }}>{value}</motion.span>
                <span style={{
                    fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                    color: URBAN.flare, fontFamily: C.sans,
                }}>{unit}</span>
            </div>
            <div style={{
                fontSize: 9, letterSpacing: '0.24em', fontWeight: 800,
                color: onDark(0.55), fontFamily: C.sans, marginTop: 6,
            }}>{label}</div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════
   VerticalSlider — 體脂率 / SMM 用，鈦金屬縱軌 + Coral 填充
   ═══════════════════════════════════════════════════════════════ */
const VerticalSlider = ({ label, value, min, max, step = 1, unit, onChange, height = 160 }) => {
    const lastValueRef = useRef(value);
    const ratio = ((value - min) / (max - min));
    const filledH = ratio * height;
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <motion.span key={value}
                    initial={{ scale: 1.08 }} animate={{ scale: 1 }}
                    transition={{ duration: 0.12 }}
                    style={{
                        fontFamily: C.serif, fontSize: 26, color: URBAN.smoke,
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>{value}</motion.span>
                <span style={{
                    fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                    color: URBAN.flare, fontFamily: C.sans,
                }}>{unit}</span>
            </div>
            <div style={{
                position: 'relative', width: 36, height,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}>
                <div style={{
                    position: 'absolute', left: '50%', top: 0, bottom: 0,
                    width: 6, transform: 'translateX(-50%)',
                    background: 'linear-gradient(90deg, #585A5E 0%, #C8CCD0 50%, #5A5D61 100%)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 999,
                    boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.5)',
                }} />
                <div style={{
                    position: 'absolute', left: '50%', bottom: 0,
                    width: 6, height: filledH,
                    transform: 'translateX(-50%)',
                    background: `linear-gradient(0deg, ${URBAN.flare} 0%, ${URBAN.ember} 100%)`,
                    borderRadius: 999,
                    boxShadow: `0 0 10px rgba(249,92,75,0.45)`,
                    pointerEvents: 'none', transition: 'height 0.15s ease',
                }} />
                <input
                    type="range" min={min} max={max} step={step} value={value}
                    onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v !== lastValueRef.current) {
                            hapticSelectionChanged(); lastValueRef.current = v;
                        }
                        onChange(v);
                    }}
                    onTouchStart={hapticSelectionStart}
                    onTouchEnd={hapticSelectionEnd}
                    style={{
                        position: 'absolute',
                        width: height, height: 36,
                        WebkitAppearance: 'none', appearance: 'none',
                        background: 'transparent', cursor: 'pointer',
                        accentColor: URBAN.flare, margin: 0, padding: 0,
                        opacity: 0.001,
                        top: '50%', left: '50%',
                        transform: 'rotate(-90deg)',
                        marginLeft: -height / 2, marginTop: -18,
                    }}
                />
            </div>
            <div style={{
                fontSize: 9, letterSpacing: '0.24em', fontWeight: 800,
                color: onDark(0.55), fontFamily: C.sans, textTransform: 'uppercase',
            }}>{label}</div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════
   DrumPicker — 錶冠／量尺式橫向 picker，中央 indicator + scroll-snap
   每個刻度 10px；scroll 觸發 selection haptic
   ═══════════════════════════════════════════════════════════════ */
const DrumPicker = ({
    label, value, min, max, step = 1, unit, onChange, accent = URBAN.flare,
}) => {
    const scrollRef = useRef(null);
    const TICK = 12; // 刻度間距拉寬一點，更有呼吸感
    const totalSteps = Math.floor((max - min) / step);
    const isProgrammaticRef = useRef(false);
    const lastValueRef = useRef(value);

    useEffect(() => {
        if (!scrollRef.current) return;
        if (value === lastValueRef.current) return; // 避免與使用者原生滑動衝突

        lastValueRef.current = value;
        const targetIndex = Math.round((value - min) / step);
        const targetScroll = targetIndex * TICK;
        if (Math.abs(scrollRef.current.scrollLeft - targetScroll) > 2) {
            isProgrammaticRef.current = true;
            scrollRef.current.scrollLeft = targetScroll;
            setTimeout(() => { isProgrammaticRef.current = false; }, 60);
        }
    }, [value, min, step]);

    const onScroll = (e) => {
        if (isProgrammaticRef.current) return;
        const idx = Math.round(e.target.scrollLeft / TICK);
        const newVal = Math.max(min, Math.min(max, min + idx * step));
        if (newVal !== lastValueRef.current) {
            lastValueRef.current = newVal;
            hapticSelectionChanged();
            onChange(newVal);
        }
    };

    return (
        <div style={{ marginBottom: 24 }}>
            {/* 標題與大字數據 */}
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-end', marginBottom: 16,
            }}>
                <span style={{
                    fontSize: 9, letterSpacing: '0.2em', fontWeight: 800,
                    color: onDark(0.55), fontFamily: C.sans,
                }}>{label}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <motion.span key={value}
                        initial={{ scale: 1.05, opacity: 0.8 }} animate={{ scale: 1, opacity: 1 }}
                        style={{
                            fontFamily: C.serif, fontSize: 36, fontWeight: 400,
                            color: URBAN.smoke, lineHeight: 0.9, letterSpacing: '-0.02em',
                            fontVariantNumeric: 'tabular-nums',
                        }}>{value}</motion.span>
                    <span style={{ fontSize: 9, letterSpacing: '0.15em', fontWeight: 700, color: accent }}>{unit}</span>
                </span>
            </div>

            {/* 表冠滑動區 */}
            <div style={{
                position: 'relative', height: 60,
                background: 'rgba(255,255,255,0.03)', // 深邃玻璃底
                borderRadius: 12, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* 中央指示器 (小圓點 + 亮色刻度) */}
                <div style={{
                    position: 'absolute', left: '50%', top: 12, bottom: 12,
                    width: 2, transform: 'translateX(-50%)',
                    background: '#fff', borderRadius: 2, zIndex: 3,
                    boxShadow: `0 0 10px rgba(255,255,255,0.5)`,
                }}>
                    <div style={{
                        position: 'absolute', top: -8, left: -2, width: 6, height: 6,
                        borderRadius: '50%', background: accent,
                    }} />
                </div>

                {/* 左右邊緣漸層遮罩 (製造圓柱體立體感) */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', background: 'linear-gradient(90deg, #0A0C12 0%, transparent 100%)', zIndex: 2, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%', background: 'linear-gradient(-90deg, #0A0C12 0%, transparent 100%)', zIndex: 2, pointerEvents: 'none' }} />

                <div
                    ref={scrollRef} onScroll={onScroll}
                    onTouchStart={hapticSelectionStart} onTouchEnd={hapticSelectionEnd}
                    style={{
                        position: 'relative', zIndex: 3, // 確保在漸層遮罩之上，接收觸控
                        height: '100%', overflowX: 'auto', overflowY: 'hidden',
                        scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                    }}
                    className="drvn-no-scrollbar"
                >
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        height: '100%', padding: '0 50%', position: 'relative',
                    }}>
                        {Array.from({ length: totalSteps + 1 }).map((_, i) => {
                            const v = min + i * step;
                            const isMajor = i % 10 === 0;
                            const isMid = i % 5 === 0 && !isMajor;
                            return (
                                <div key={i} style={{
                                    width: TICK, flexShrink: 0, scrollSnapAlign: 'center',
                                    height: '100%', display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', position: 'relative'
                                }}>
                                    <div style={{
                                        width: 1.5,
                                        height: isMajor ? 24 : isMid ? 16 : 10,
                                        background: isMajor ? 'rgba(255,255,255,0.8)' : isMid ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
                                        borderRadius: 2,
                                    }} />
                                    {/* 只在大刻度顯示數字 */}
                                    {isMajor && (
                                        <span style={{
                                            position: 'absolute', top: 4,
                                            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                                            fontFamily: C.sans, fontVariantNumeric: 'tabular-nums',
                                        }}>{v}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* Segmented — 1–5 個選項的水平分段選擇器（取代多個 Pill） */
const Segmented = ({ options, value, onChange, dark = true }) => (
    <div style={{
        display: 'flex', gap: 0,
        ...(dark
            ? glassMat(false, 12)
            : { background: 'transparent', border: `1px solid ${silverA(0.5)}`, borderRadius: 12 }),
        overflow: 'hidden',
        marginBottom: 18,
    }}>
        {options.map((o, i) => {
            const sel = value === o.v;
            return (
                <motion.button
                    key={o.v} type="button" whileTap={{ scale: 0.96 }}
                    onClick={() => {
                        hapticTap();
                        onChange(o.v);
                    }}
                    style={{
                        flex: 1, padding: '11px 6px', cursor: 'pointer',
                        background: sel ? (dark ? URBAN.smoke : URBAN.charcoal) : 'transparent',
                        color: sel ? (dark ? URBAN.charcoal : URBAN.smoke) : (dark ? URBAN.smoke : URBAN.charcoal),
                        border: 'none',
                        borderRight: i < options.length - 1
                            ? `1px solid ${dark ? 'rgba(255, 255, 255, 0.1)' : silverA(0.5)}` : 'none',
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
                        fontFamily: C.sans,
                        transition: 'all .18s ease',
                    }}>
                    {o.label}
                </motion.button>
            );
        })}
    </div>
);

/* ───────── IntentBanner — 跨頁延伸的「INTENT」摘要列
   一旦使用者在 Step 3 選了意圖，後續所有健身相關頁面 (Step 4、5)
   都會在頁首掛這一條，讓「意圖」始終可視，避免使用者忘記為何要做這些選擇。
   也順便露出「Virtual Coach 會推薦哪一個有氧計劃」。 */
const IntentBanner = ({ intentMeta, dark = true }) => {
    if (!intentMeta) return null;
    const recoCardio = intentMeta.cardio;
    return (
        <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 14px', marginBottom: 16,
                border: `1px solid ${dark ? URBAN.silverLine : silverA(0.45)}`,
                borderRadius: 12,
                background: dark ? 'rgba(245,245,245,0.02)' : 'rgba(32,32,32,0.04)',
            }}>
            <Asterisk size={11} color={URBAN.flare} />
            <span style={{
                fontSize: 12, letterSpacing: '0.22em', fontWeight: 800,
                color: dark ? onDark(0.55) : silverA(0.85),
                fontFamily: C.sans,
            }}>意圖</span>
            <span style={{
                flex: 1, fontSize: 12.5, fontWeight: 600,
                color: dark ? URBAN.smoke : URBAN.charcoal,
                lineHeight: 1.35, minWidth: 0,
            }}>
                {intentMeta.label}
                <span style={{
                    fontWeight: 500, opacity: 0.65, marginLeft: 6,
                }}>· {intentMeta.desc}</span>
            </span>
            {recoCardio && (
                <span style={{
                    fontSize: 9, letterSpacing: '0.18em', fontWeight: 800,
                    padding: '3px 7px',
                    background: 'rgba(249,92,75,0.16)',
                    color: URBAN.flare,
                    fontFamily: C.sans, flexShrink: 0,
                }}>{recoCardio.tag}</span>
            )}
        </motion.div>
    );
};

/* ───────── SectionNo — 編號式 Swiss 段落表頭 ─────────
   01  NAME 稱呼 ~~~~~~~~~~~~~~~
*/
const SectionNo = ({ no, label, dark = true }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 16 }}>
        <span style={{ fontFamily: C.serif, fontSize: 22, color: URBAN.flare, lineHeight: 1 }}>{no}</span>
        <span style={{ fontSize: 9, letterSpacing: '0.2em', fontWeight: 800, color: dark ? 'rgba(245,245,245,0.7)' : '#666', fontFamily: C.sans }}>
            {label}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
    </div>
);

/* 逐項浮現容器 */
// Reveal — 子元素入場：spring physics + 輕微 blur in，比原本的 fade-up 更有質感
const Reveal = ({ children, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{
            delay: 0.32 + delay,
            // spring 比固定 ease 更有「生命感」
            type: 'spring', stiffness: 280, damping: 24, mass: 0.85,
            // filter 走 tween (spring 不支援字串)
            filter: { duration: 0.5, ease: EASE, delay: 0.32 + delay },
        }}
    >
        {children}
    </motion.div>
);

/* ───────── 跑步基準線：5K 完賽時間 → 每公里秒數（Jack Daniels VDOT） ─────────
   與 CardioPlanBuilder 的 FIVE_K_OPTIONS 一致，確保兩處引擎讀到同樣的 pace 基準。 */
const RUN_BASELINE_5K = [
    { label: '< 20 分鐘',  paceSec: Math.round((19 * 60) / 5) },
    { label: '20–25 分鐘', paceSec: Math.round((22 * 60) / 5) },
    { label: '25–30 分鐘', paceSec: Math.round((27 * 60) / 5) },
    { label: '30–35 分鐘', paceSec: Math.round((32 * 60) / 5) },
    { label: '35–40 分鐘', paceSec: Math.round((37 * 60) / 5) },
    { label: '40–50 分鐘', paceSec: Math.round((44 * 60) / 5) },
    { label: '> 50 分鐘',  paceSec: Math.round((52 * 60) / 5) },
    { label: '未測過 5K',  paceSec: null },
];

const fmtPace = (sec) => {
    if (!sec) return null;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}'${String(s).padStart(2, '0')}"/km`;
};

/* 跑步目標（鏡像 CardioPlanBuilder 的 GOALS，讓精靈內也能完整選） */
const RUN_GOALS = [
    { v: 'fat_loss',     tag: 'METABOLIC',   label: '減脂燃燒',   peak: '尖峰 20–30 km/週' },
    { v: 'aerobic_base', tag: 'MAF 80/20',   label: '有氧基礎',   peak: '尖峰 30–40 km/週' },
    { v: 'race_5k_10k',  tag: 'RACE PREP',   label: '5K / 10K',  peak: '尖峰 40–50 km/週' },
    { v: 'race_half',    tag: '14-WK CYCLE', label: '半程馬拉松', peak: '尖峰 50–65 km/週' },
    { v: 'race_full',    tag: '14-WK CYCLE', label: '全程馬拉松', peak: '尖峰 70–90 km/週' },
];
const RUN_WEEK_OPTIONS = [4, 6, 8, 10, 12, 14];

/* BuildPlanToggle — Step 5 前置詢問：「現在建立計劃」還是「之後再建」
   on=true → 展開完整設定選項並在註冊時生成；off → 收合、跳過生成（保留空狀態）。 */
const BuildPlanToggle = ({ kind, on, onToggle }) => {
    const isRun = kind === 'run';
    return (
        <Reveal>
            <div style={{ padding: '18px 18px', marginBottom: 18, ...glassMat(on, 16) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, paddingRight: 12 }}>
                        <div style={{
                            fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                            color: onDark(0.5), fontFamily: C.sans, marginBottom: 5,
                        }}>{isRun ? 'RUNNING PLAN' : 'STRENGTH PLAN'}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: URBAN.smoke, fontFamily: C.sans, marginBottom: 3 }}>
                            {on ? `現在就建立${isRun ? '跑步' : '健身'}計劃` : `之後再建立${isRun ? '跑步' : '健身'}計劃`}
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: onDark(0.55), fontFamily: C.sans }}>
                            {on
                                ? `引擎會依下方選項，在註冊完成時直接生成完整${isRun ? '跑步' : '健身'}計劃。`
                                : `先略過，計劃頁維持空狀態，你可以隨時在主頁重新開啟精靈建立。`}
                        </div>
                    </div>
                    {/* 玻璃開關 */}
                    <motion.button {...pressProps('row')}
 type="button"
 onClick={() => { hapticTap(); onToggle(!on); }}
 style={{
 width: 52, height: 30, borderRadius: 999, position: 'relative',
 cursor: 'pointer', flexShrink: 0, border: 'none',
 background: on ? URBAN.flare : 'rgba(255,255,255,0.14)',
 boxShadow: on ? `0 0 12px ${URBAN.flare}66, inset 0 1px 2px rgba(255,255,255,0.3)` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
 transition: 'background .25s ease',
 }}>
                        <motion.div
                            animate={{ left: on ? 24 : 2 }}
                            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                            style={{
                                position: 'absolute', top: 2, width: 26, height: 26, borderRadius: '50%',
                                background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
                            }}
                        />
                    </motion.button>
                </div>
            </div>
        </Reveal>
    );
};

/* RunBaselineCard — 嵌入註冊精靈的跑步基準線收集卡（沿用精靈深色玻璃語言）
   - 目前平均週跑量（MetalSlider，漸進式超負荷起點）
   - 最近一次 5K 完賽時間（選項卡 → 推算各區間配速，未測則走 RPE 體感模式） */
const RunBaselineCard = ({ goal, totalWeeks, weeklyKm, pace5k, onChangeGoal, onChangeWeeks, onChangeWeeklyKm, onChangePace5k }) => {
    const easyPace = pace5k ? pace5k + 90 : null; // Jack Daniels: easy ≈ 5K pace + 90s
    return (
        <>
            {/* ── 跑步目標 ── */}
            <Reveal delay={0.04}>
                <SectionNo no="05" label="GOAL 跑步目標" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                    {RUN_GOALS.map((g) => {
                        const sel = goal === g.v;
                        return (
                            <motion.button
                                key={g.v} type="button" whileTap={{ scale: 0.98 }}
                                onClick={() => onChangeGoal(g.v)}
                                style={{
                                    width: '100%', textAlign: 'left', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '14px 18px', ...glassMat(sel, 14),
                                    transition: 'all .22s cubic-bezier(0.16,1,0.3,1)',
                                }}>
                                <div>
                                    <div style={{
                                        fontSize: 9, letterSpacing: '0.2em', fontWeight: 800,
                                        color: sel ? URBAN.flare : onDark(0.45), fontFamily: C.sans, marginBottom: 4,
                                    }}>{g.tag}</div>
                                    <div style={{
                                        fontSize: 16, fontWeight: 700, fontFamily: C.sans,
                                        color: sel ? URBAN.smoke : 'rgba(245,245,245,0.68)',
                                    }}>{g.label}</div>
                                </div>
                                <span style={{
                                    fontSize: 11, fontFamily: C.sans, fontWeight: 600,
                                    color: sel ? onDark(0.6) : onDark(0.4),
                                }}>{g.peak}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </Reveal>

            {/* ── 週期長度 ── */}
            <Reveal delay={0.10}>
                <SectionNo no="06" label="DURATION 週期長度" />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontFamily: C.serif, fontSize: 56, lineHeight: 1, color: URBAN.smoke, fontVariantNumeric: 'tabular-nums' }}>{totalWeeks}</span>
                    <span style={{ fontSize: 9, letterSpacing: '0.2em', fontWeight: 800, color: onDark(0.5), fontFamily: C.sans }}>WEEKS</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginBottom: 18 }}>
                    {RUN_WEEK_OPTIONS.map((w) => {
                        const sel = totalWeeks === w;
                        return (
                            <motion.button
                                key={w} type="button" whileTap={{ scale: 0.95 }}
                                onClick={() => onChangeWeeks(w)}
                                style={{
                                    padding: '12px 0', cursor: 'pointer',
                                    ...glassMat(sel, 12),
                                    fontSize: 15, fontWeight: 800, fontFamily: C.sans,
                                    color: sel ? URBAN.smoke : onDark(0.55),
                                    fontVariantNumeric: 'tabular-nums',
                                    transition: 'all .2s ease',
                                }}>{w}</motion.button>
                        );
                    })}
                </div>
            </Reveal>

            <Reveal delay={0.16}>
                <SectionNo no="07" label="WEEKLY VOLUME 目前平均週跑量" />
                <MetalSlider
                    label="CURRENT 目前週跑量"
                    value={weeklyKm}
                    min={0} max={120} step={5}
                    unit="KM/W"
                    onChange={onChangeWeeklyKm}
                    ticks={[0, 30, 60, 90, 120]}
                />
                <div style={{
                    fontSize: 11, color: onDark(0.45), fontFamily: C.serif,
                    fontStyle: 'italic', marginTop: -8, marginBottom: 18,
                }}>
                    {weeklyKm === 0
                        ? '/ 選 0 代表你是全新跑者，引擎會從最保守的起點起步。'
                        : '/ 引擎將從你真實的訓練量出發，逐週漸進、避免受傷。'}
                </div>
            </Reveal>

            <Reveal delay={0.38}>
                <SectionNo no="08" label="5K BENCHMARK 最近一次 5K 完賽" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {RUN_BASELINE_5K.map((opt) => {
                        const isActive = pace5k === opt.paceSec || (opt.paceSec === null && pace5k === null);
                        return (
                            <motion.button
                                key={opt.label} type="button" whileTap={{ scale: 0.98 }}
                                onClick={() => { hapticTap(); onChangePace5k(opt.paceSec); }}
                                style={{
                                    width: '100%', textAlign: 'left', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '15px 18px', ...glassMat(isActive, 14),
                                    transition: 'all .22s cubic-bezier(0.16,1,0.3,1)',
                                }}>
                                <span style={{
                                    fontSize: 14, fontWeight: 600, fontFamily: C.sans,
                                    color: isActive ? URBAN.smoke : 'rgba(245,245,245,0.62)', letterSpacing: '0.02em',
                                }}>{opt.label}</span>
                                {opt.paceSec && (
                                    <span style={{ textAlign: 'right' }}>
                                        <span style={{
                                            display: 'block', fontSize: 9, letterSpacing: '0.18em', fontWeight: 800,
                                            color: onDark(0.4), fontFamily: C.sans,
                                        }}>EASY PACE</span>
                                        <span style={{
                                            fontFamily: C.serif, fontSize: 15,
                                            color: isActive ? URBAN.flare : onDark(0.7),
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>{fmtPace(opt.paceSec + 90)}</span>
                                    </span>
                                )}
                            </motion.button>
                        );
                    })}
                </div>

                {/* 配速 / RPE 預覽 */}
                {easyPace ? (
                    <div style={{ padding: '16px 18px', ...glassMat(false, 14) }}>
                        <div style={{
                            fontSize: 12, letterSpacing: '0.24em', fontWeight: 800,
                            color: onDark(0.5), fontFamily: C.sans, marginBottom: 12,
                        }}>ENGINE PACE ZONES / 引擎將使用的配速區間</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                            {[
                                { label: '恢復', pace: easyPace + 30, color: '#A5C4FF' },
                                { label: '輕鬆', pace: easyPace, color: '#7BD3A5' },
                                { label: '節奏', pace: Math.round(pace5k * 1.05), color: '#D8F382' },
                                { label: '間歇', pace: Math.round(pace5k * 0.95), color: URBAN.flare },
                            ].map(({ label, pace, color }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: onDark(0.6), fontFamily: C.sans }}>{label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: URBAN.smoke, fontFamily: C.serif, fontVariantNumeric: 'tabular-nums' }}>{fmtPace(pace)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{
                        padding: '16px 18px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px dashed rgba(255,255,255,0.16)',
                    }}>
                        <div style={{
                            fontSize: 12, letterSpacing: '0.2em', fontWeight: 800,
                            color: onDark(0.45), fontFamily: C.sans, marginBottom: 8,
                        }}>RPE 體感模式啟動</div>
                        <p style={{ fontSize: 12, lineHeight: 1.5, color: onDark(0.6), fontFamily: C.sans, margin: 0 }}>
                            缺乏基準配速時，引擎會改以 <b style={{ color: URBAN.smoke }}>RPE 自覺費力程度</b> 引導訓練。日後補上測驗成績即可解鎖精準配速區間。
                        </p>
                    </div>
                )}
            </Reveal>
        </>
    );
};

/* ───────── 輸入欄（瑞士極簡）───────── */
const Field = ({ label, value, onChange, type = 'text', placeholder, suffix, dark = true, max, min, maxLength }) => (
    <label style={{ display: 'block', marginBottom: 16 }}>
        {label && (
            <span style={{
                display: 'block', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: dark ? onDark(0.5) : silverA(0.85), marginBottom: 6,
            }}>
                {label}
            </span>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <input
                type={type} value={value} placeholder={placeholder} max={max} min={min} maxLength={maxLength}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    flex: 1, background: 'transparent', border: 'none',
                    borderBottom: `1px solid ${dark ? onDark(0.4) : URBAN.charcoal}`,
                    fontFamily: C.serif, fontSize: 24, padding: '3px 0',
                    color: dark ? URBAN.smoke : URBAN.charcoal, outline: 'none', width: '100%',
                }}
            />
            {suffix && <span style={{
                fontSize: 12, color: dark ? onDark(0.6) : silverA(0.95), paddingBottom: 5,
            }}>{suffix}</span>}
        </div>
    </label>
);

/* ───────── 選項卡（瑞士極簡）───────── */
const OptionCard = ({ no, title, desc, selected, onClick, dark = true, compact }) => {
    const baseFg = dark ? URBAN.smoke : URBAN.charcoal;
    const lineCol = dark ? URBAN.silverLine : silverA(0.55);
    return (
        <motion.button
            type="button" onClick={(e) => {
                hapticTap();
                onClick(e);
            }}
            whileTap={{ scale: 0.985 }}
            style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 13,
                padding: compact ? '13px 16px' : '17px 18px', marginBottom: 9,
                background: selected ? (dark ? URBAN.smoke : URBAN.charcoal) : (dark ? 'rgba(255, 255, 255, 0.04)' : 'transparent'),
                color: selected ? (dark ? URBAN.charcoal : URBAN.smoke) : baseFg,
                border: `1px solid ${selected ? (dark ? URBAN.smoke : URBAN.charcoal) : (dark ? 'rgba(255, 255, 255, 0.18)' : lineCol)}`,
                boxShadow: selected ? 'none' : (dark ? 'inset 0 1.5px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.2), 0 12px 36px rgba(0,0,0,0.2)' : 'none'),
                backdropFilter: selected ? 'none' : 'blur(32px) saturate(150%)',
                WebkitBackdropFilter: selected ? 'none' : 'blur(32px) saturate(150%)',
                borderRadius: 12,
                transition: 'all .22s ease',
            }}
        >
            {no && (
                <span style={{
                    fontSize: 9, letterSpacing: '0.1em',
                    minWidth: 22, opacity: 0.55,
                }}>{no}</span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                    display: 'block', fontSize: 15, fontWeight: 600,
                    letterSpacing: '0.005em',
                }}>{title}</span>
                {desc && (
                    <span style={{
                        display: 'block', fontSize: 11.5, marginTop: 2,
                        opacity: 0.62,
                    }}>{desc}</span>
                )}
            </span>
            <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `1px solid ${selected ? 'currentColor' : lineCol}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {selected && <Check size={11} strokeWidth={2.5} />}
            </span>
        </motion.button>
    );
};

/* ───────── Step 3 專屬：意圖卡 + 飲食 chip（瑞士極簡）───────── */

/* 意圖卡（瑞士極簡）— 與 OptionCard 同骨架，多 #Tag 主標 + 有氧建議副資訊
   選擇某個意圖時，下方會顯示「Virtual Coach 會推薦哪一個有氧計劃」。
   這層橫線與標籤排版完全參考瑞士雜誌的「次要資訊欄」邏輯：
   左：分類標籤（小寫字距 .22em）／右：對應計劃中文名 + 預估時長。 */
const IntentCard = ({ tag, desc, cardio, selected, onClick }) => (
    <motion.button
        type="button" onClick={(e) => {
            hapticTap();
            onClick(e);
        }}
        whileTap={{ scale: 0.985 }}
        layout
        style={{
            width: '100%', textAlign: 'left', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 0,
            padding: cardio ? '14px 16px 12px' : '17px 18px', marginBottom: 9,
            background: selected ? URBAN.smoke : 'rgba(255, 255, 255, 0.04)', // 微白底色加強反光
            color: selected ? URBAN.charcoal : URBAN.smoke,
            border: `1px solid ${selected ? URBAN.smoke : 'rgba(255, 255, 255, 0.18)'}`, // 增強玻璃邊框
            boxShadow: selected ? 'none' : 'inset 0 1.5px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.2), 0 12px 36px rgba(0,0,0,0.2)', // 更強的 Liquid Glass 邊緣光
            backdropFilter: selected ? 'none' : 'blur(32px) saturate(150%)',
            WebkitBackdropFilter: selected ? 'none' : 'blur(32px) saturate(150%)',
            borderRadius: 12, // 與 Step 4 一致的圓角
            transition: 'all .22s ease',
            overflow: 'hidden',
        }}
    >
        {/* 主標 + 選中圓圈 */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                    display: 'block', fontSize: 15, fontWeight: 600,
                    letterSpacing: '0.005em',
                }}>
                    {tag}
                </span>
                {desc && (
                    <span style={{
                        display: 'block', fontSize: 11.5, marginTop: 2, opacity: 0.62,
                    }}>
                        {desc}
                    </span>
                )}
            </span>
            <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `1px solid ${selected ? 'currentColor' : URBAN.silverLine}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {selected && <Check size={11} strokeWidth={2.5} />}
            </span>
        </span>
        {/* 有氧建議列 — Virtual Coach 推薦的有氧計劃 */}
        {cardio && (
            <span style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginTop: 10, paddingTop: 9,
                borderTop: `1px dashed ${selected ? 'rgba(22,20,21,0.18)' : 'rgba(245,245,245,0.16)'}`,
            }}>
                <span style={{
                    fontSize: 11, letterSpacing: '0.04em', fontWeight: 800,
                    padding: '3px 7px',
                    background: selected ? URBAN.flare : 'rgba(249,92,75,0.16)',
                    color: selected ? '#fff' : URBAN.flare,
                    fontFamily: C.sans,
                }}>{cardio.tag}</span>
                <span style={{
                    fontSize: 11, letterSpacing: '0.04em',
                    opacity: 0.78, fontFamily: C.sans,
                }}>
                    有氧建議 · <b style={{ opacity: 1 }}>{cardio.name}</b>
                </span>
                <span style={{ flex: 1 }} />
                <span style={{
                    fontSize: 11, fontWeight: 700,
                    opacity: 0.55, fontFamily: C.sans,
                    fontVariantNumeric: 'tabular-nums',
                }}>{cardio.mins} 分鐘</span>
            </span>
        )}
    </motion.button>
);

/* 飲食型態 chip（瑞士極簡）— 與 Pill 同樣式 */
const DietChip = ({ label, selected, onClick }) => (
    <motion.button
        type="button" onClick={(e) => { hapticTap(); onClick(e); }} whileTap={{ scale: 0.95 }}
        style={{
            padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
            background: selected ? URBAN.smoke : 'transparent',
            color: selected ? URBAN.charcoal : URBAN.smoke,
            border: `1px solid ${selected ? URBAN.smoke : URBAN.silverLine}`,
            transition: 'all .2s ease',
        }}
    >
        {label}
    </motion.button>
);

/* ───────── 膠囊多選（瑞士極簡）───────── */
const Pill = ({ label, selected, onClick, dark = true, disabled = false }) => (
    <motion.button
        type="button"
        disabled={disabled}
        onClick={(e) => { if (disabled) return; hapticTap(); onClick(e); }}
        whileTap={disabled ? undefined : { scale: 0.95 }}
        style={{
            padding: '9px 16px', borderRadius: 999,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500,
            opacity: disabled ? 0.35 : 1,
            background: selected ? (dark ? URBAN.smoke : URBAN.charcoal) : 'transparent',
            color: selected ? (dark ? URBAN.charcoal : URBAN.smoke) : (dark ? URBAN.smoke : URBAN.charcoal),
            border: `1px solid ${selected
                ? (dark ? URBAN.smoke : URBAN.charcoal)
                : (dark ? URBAN.silverLine : silverA(0.55))}`,
            transition: 'all .2s ease',
        }}
    >
        {label}
    </motion.button>
);

/* ═══════════════════════════════════════════════════════════════
   常數
   ═══════════════════════════════════════════════════════════════ */
/* 順序對齊「Virtual Coach 跑步組件」的 carousel 優先序：
   recovery → base → progressive → hill
   讓使用者在這頁的視覺順序，就是稍後在主畫面看到的計劃排序。 */
// 有氧建議直接讀快速訓練的固定課程（名稱、標籤、時長與跑步頁一致）
const quickCourse = (id) => {
    const c = QUICK_RUN_COURSES.find((x) => x.id === id) || QUICK_RUN_COURSES[0];
    return { id: c.id, name: c.title, tag: c.tag, mins: courseMinutesRange(c).replace(/\s*分$/, '') };
};
const INTENT_TAGS = [
    {
        v: 'mindfulness', label: '#Mindfulness', desc: '身心平衡 · 恢復',
        cardio: quickCourse('recovery'),
    },
    {
        v: 'awake', label: '#Awake', desc: '喚醒 · 晨間活力',
        cardio: quickCourse('base'),
    },
    {
        v: 'routine', label: '#Routine', desc: '規律習慣養成',
        cardio: quickCourse('base'),
    },
    {
        v: 'fat_burn', label: '#FatBurn', desc: '減脂優先',
        // 減脂靠總消耗與能持續的量：有氧跑能跑得久、恢復快，比節奏跑更適合當減脂的主課
        cardio: quickCourse('base'),
    },
    {
        v: 'performance', label: '#Performance', desc: '運動表現',
        cardio: quickCourse('hill'),
    },
];

/* ═══════════════════════════════════════════════════════════════
   訓練路線（Step 4 早期分支）— 三選一，決定後續流程
   每條路線都列出會「解鎖」的 App 模組，使用者一次看到完整輪廓。
   ═══════════════════════════════════════════════════════════════ */
const TRAINING_PATHS = [
    {
        v: 'full', label: '完整版', tag: 'FULL',
        sub: '重訓 + 跑步', emoji: '🏋️🏃',
        unlocks: ['健身計劃', '跑步教練', 'PR Tracker', '身體分析', '營養追蹤'],
        recommended: true,
    },
    {
        v: 'cardio_only', label: '只跑步', tag: 'RUN ONLY',
        sub: '輕量跑者', emoji: '🏃',
        unlocks: ['跑步教練', '配速分析', '心率區間', '營養追蹤'],
        skips: ['健身計劃'],
    },
    {
        v: 'lifting_only', label: '只重訓', tag: 'LIFT ONLY',
        sub: '重訓專注', emoji: '💪',
        unlocks: ['健身計劃', 'PR Tracker', '身體分析', '營養追蹤'],
        skips: ['跑步教練（仍可手動使用）'],
    },
];

/* App 模組清單 — Step 7 Discover 用，呼應 BottomNavigation + Home dashboard */
const APP_MODULES = [
    { id: 'home', name: 'Dashboard', desc: '每日訓練主畫面', emoji: '🏠', paths: ['full', 'cardio_only', 'lifting_only'] },
    { id: 'plan', name: '健身計劃', desc: '4 週週期化訓練', emoji: '🏋️', paths: ['full', 'lifting_only'] },
    { id: 'cardio', name: '跑步教練', desc: 'Virtual Coach 配速 / 心率', emoji: '🏃', paths: ['full', 'cardio_only'] },
    { id: 'nutrition', name: '營養追蹤', desc: 'TDEE / 三大營養素', emoji: '🥗', paths: ['full', 'cardio_only', 'lifting_only'] },
    { id: 'pr', name: 'PR Tracker', desc: '個人最佳紀錄', emoji: '💪', paths: ['full', 'lifting_only'] },
    { id: 'video', name: '影片分析', desc: '動作姿勢 AI 偵測', emoji: '🎥', paths: ['full', 'lifting_only'] },
    { id: 'body', name: '身體分析', desc: 'InBody 走勢 / 體脂', emoji: '📊', paths: ['full', 'cardio_only', 'lifting_only'] },
    { id: 'sonic', name: '訓練音樂', desc: 'Sonic Focus 心率引擎', emoji: '🎵', paths: ['full', 'cardio_only', 'lifting_only'] },
    { id: 'social', name: '社群', desc: '好友 / 挑戰 / 排行', emoji: '👥', paths: ['full', 'cardio_only', 'lifting_only'] },
    { id: 'recap', name: '週報', desc: '每週訓練回顧', emoji: '📅', paths: ['full', 'cardio_only', 'lifting_only'] },
];

/* 意圖 → 主要訓練目標的預設對應（取代 Step 5 已移除的 GOALS 標籤） */
const INTENT_TO_GOAL = {
    awake: 'endurance',
    mindfulness: 'general_fitness',
    fat_burn: 'fat_loss',
    performance: 'performance',
    routine: 'general_fitness',
};
const FITNESS_LEVELS = [
    {
        v: 'beginner', no: '01', title: '新手',
        desc: '規律訓練 < 6 個月',
        ref: '3 組 × 8–15 下 · 先學動作',
        load: '負重 RPE 6–7（還能再做 3–4 下）',
    },
    {
        v: 'intermediate', no: '02', title: '中階',
        desc: '規律訓練 6 個月 – 2 年',
        ref: '3–4 組 × 8–12 下 · 複合 + 輔助',
        load: '負重 RPE 7–8（還能再做 2–3 下）',
    },
    {
        v: 'advanced', no: '03', title: '進階',
        desc: '規律訓練 2 年以上',
        ref: '3–4 組 × 6–12 下 · 含孤立訓練',
        load: '負重 RPE 8–9（還能再做 1–2 下）',
    },
];
const INJURIES = [
    { v: 'knee', label: '膝蓋' }, { v: 'back', label: '背部' },
    { v: 'shoulder', label: '肩部' }, { v: 'wrist', label: '手腕' },
    { v: 'hip', label: '髖部' }, { v: 'neck', label: '頸部' }, { v: 'ankle', label: '腳踝' },
];
const GOALS = [
    { v: 'muscle_gain', label: '增肌 / 變壯' }, { v: 'fat_loss', label: '減脂 / 瘦身' },
    { v: 'toning', label: '體態雕塑' }, { v: 'endurance', label: '提升體能 / 心肺' },
    { v: 'performance', label: '運動表現' }, { v: 'general_fitness', label: '維持健康習慣' },
];
const TARGET_MUSCLES = [
    { v: 'chest', label: '胸肌' }, { v: 'back', label: '背部' },
    { v: 'shoulders', label: '肩膀' }, { v: 'arms', label: '手臂' },
    { v: 'legs', label: '腿部' }, { v: 'glutes', label: '臀部' }, { v: 'core', label: '核心' },
];
const EQUIPMENT = [
    { v: 'gym', label: '健身房', desc: '齊全器材' },
    { v: 'home', label: '居家', desc: '啞鈴 / 彈力帶' },
    { v: 'bodyweight', label: '徒手', desc: '無器材' },
];
const NUTRITION_MODES = [
    { v: 'cutting', icon: Flame, title: '減脂', en: 'CUT', desc: '熱量赤字，優先降體脂、保留肌肉。' },
    { v: 'maintenance', icon: Zap, title: '體態重塑', en: 'RECOMP', desc: '熱量持平，同時增肌減脂、雕塑線條。' },
    { v: 'bulking', icon: Dumbbell, title: '增肌', en: 'BULK', desc: '熱量盈餘，優先增加肌肉量與力量。' },
];
const EXERCISE_HABIT = [
    { v: 1.2, label: '幾乎不運動', desc: '久坐辦公 · 一週運動 < 1 次' },
    { v: 1.375, label: '輕度活動', desc: '一週運動 1–2 次' },
    { v: 1.55, label: '中度活動', desc: '一週運動 3–5 次 / 規律訓練' },
    { v: 1.725, label: '高度活動', desc: '一週運動 6–7 次 / 體力勞動' },
    { v: 1.9, label: '極高強度', desc: '一天兩練 / 競技選手' },
];
const DIET_TYPES = [
    { v: 'general', label: '一般飲食' },
    { v: 'high_protein', label: '高蛋白' },
    { v: 'vegetarian', label: '素食 Veggie' },
    { v: 'vegan', label: '全素 Vegan' },
    { v: 'low_carb', label: '低碳 / 生酮' },
    { v: 'high_carb', label: '高碳補給' },
    { v: 'mediterranean', label: '地中海' },
    { v: 'light', label: '清淡少油' },
    { v: 'whole_foods', label: '原型食物' },
    { v: 'intermittent_fasting', label: '168 斷食' },
    { v: 'gluten_free', label: '無麩質' },
    { v: 'paleo', label: '原始人 Paleo' },
];
const STARTER_FOODS = {
    general: [
        { name: '白飯', emoji: '🍚', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, serving_size_g: 100, category: 'lunch' },
        { name: '雞蛋', emoji: '🥚', calories: 78, protein: 6.3, carbs: 0.6, fats: 5.3, serving_size_g: 50, category: 'breakfast' },
        { name: '香蕉', emoji: '🍌', calories: 89, protein: 1.1, carbs: 23, fats: 0.3, serving_size_g: 100, category: 'breakfast' },
    ],
    high_protein: [
        { name: '雞胸肉', emoji: '🍗', calories: 165, protein: 31, carbs: 0, fats: 3.6, serving_size_g: 100, category: 'lunch' },
        { name: '高蛋白飲', emoji: '🥤', calories: 120, protein: 24, carbs: 3, fats: 1.5, serving_size_g: 30, category: 'snacks' },
        { name: '希臘優格', emoji: '🥛', calories: 59, protein: 10, carbs: 3.6, fats: 0.4, serving_size_g: 100, category: 'breakfast' },
    ],
    vegetarian: [
        { name: '豆腐', emoji: '🧈', calories: 76, protein: 8, carbs: 1.9, fats: 4.8, serving_size_g: 100, category: 'lunch' },
        { name: '毛豆', emoji: '🫛', calories: 122, protein: 11, carbs: 10, fats: 5, serving_size_g: 100, category: 'snacks' },
        { name: '燕麥', emoji: '🥣', calories: 389, protein: 17, carbs: 66, fats: 7, serving_size_g: 100, category: 'breakfast' },
    ],
    low_carb: [
        { name: '酪梨', emoji: '🥑', calories: 160, protein: 2, carbs: 9, fats: 15, serving_size_g: 100, category: 'snacks' },
        { name: '鮭魚', emoji: '🐟', calories: 208, protein: 20, carbs: 0, fats: 13, serving_size_g: 100, category: 'dinner' },
        { name: '堅果', emoji: '🥜', calories: 607, protein: 21, carbs: 21, fats: 54, serving_size_g: 100, category: 'snacks' },
    ],
    light: [
        { name: '地瓜', emoji: '🍠', calories: 114, protein: 1.6, carbs: 27.8, fats: 0.1, serving_size_g: 100, category: 'lunch' },
        { name: '燙青菜', emoji: '🥬', calories: 25, protein: 2.5, carbs: 4, fats: 0.3, serving_size_g: 100, category: 'dinner' },
        { name: '雞胸肉', emoji: '🍗', calories: 165, protein: 31, carbs: 0, fats: 3.6, serving_size_g: 100, category: 'lunch' },
    ],
    vegan: [
        { name: '鷹嘴豆', emoji: '🌱', calories: 164, protein: 9, carbs: 27, fats: 3, serving_size_g: 100, category: 'lunch' },
        { name: '無糖豆漿', emoji: '🥛', calories: 54, protein: 3.3, carbs: 6, fats: 1.8, serving_size_g: 240, category: 'breakfast' },
        { name: '藜麥', emoji: '🌾', calories: 222, protein: 8, carbs: 39, fats: 4, serving_size_g: 100, category: 'lunch' },
    ],
    mediterranean: [
        { name: '初榨橄欖油', emoji: '🫒', calories: 884, protein: 0, carbs: 0, fats: 100, serving_size_g: 100, category: 'snacks' },
        { name: '番茄', emoji: '🍅', calories: 18, protein: 0.9, carbs: 3.9, fats: 0.2, serving_size_g: 100, category: 'dinner' },
        { name: '鮪魚', emoji: '🐟', calories: 130, protein: 28, carbs: 0, fats: 1, serving_size_g: 100, category: 'lunch' },
    ],
    high_carb: [
        { name: '義大利麵', emoji: '🍝', calories: 158, protein: 5.8, carbs: 31, fats: 0.9, serving_size_g: 100, category: 'lunch' },
        { name: '糙米飯', emoji: '🍙', calories: 111, protein: 2.6, carbs: 23, fats: 0.9, serving_size_g: 100, category: 'lunch' },
        { name: '燕麥', emoji: '🥣', calories: 389, protein: 17, carbs: 66, fats: 7, serving_size_g: 100, category: 'breakfast' },
    ],
    whole_foods: [
        { name: '地瓜', emoji: '🍠', calories: 114, protein: 1.6, carbs: 27.8, fats: 0.1, serving_size_g: 100, category: 'lunch' },
        { name: '雞蛋', emoji: '🥚', calories: 78, protein: 6.3, carbs: 0.6, fats: 5.3, serving_size_g: 50, category: 'breakfast' },
        { name: '菠菜', emoji: '🥬', calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4, serving_size_g: 100, category: 'dinner' },
    ],
    intermittent_fasting: [
        { name: '黑咖啡', emoji: '☕', calories: 2, protein: 0.3, carbs: 0, fats: 0, serving_size_g: 240, category: 'breakfast' },
        { name: '雞胸肉', emoji: '🍗', calories: 165, protein: 31, carbs: 0, fats: 3.6, serving_size_g: 100, category: 'lunch' },
        { name: '酪梨', emoji: '🥑', calories: 160, protein: 2, carbs: 9, fats: 15, serving_size_g: 100, category: 'snacks' },
    ],
    gluten_free: [
        { name: '糙米飯', emoji: '🍙', calories: 111, protein: 2.6, carbs: 23, fats: 0.9, serving_size_g: 100, category: 'lunch' },
        { name: '鮭魚', emoji: '🐟', calories: 208, protein: 20, carbs: 0, fats: 13, serving_size_g: 100, category: 'dinner' },
        { name: '藜麥', emoji: '🌾', calories: 222, protein: 8, carbs: 39, fats: 4, serving_size_g: 100, category: 'lunch' },
    ],
    paleo: [
        { name: '牛肉', emoji: '🥩', calories: 250, protein: 26, carbs: 0, fats: 17, serving_size_g: 100, category: 'dinner' },
        { name: '雞蛋', emoji: '🥚', calories: 78, protein: 6.3, carbs: 0.6, fats: 5.3, serving_size_g: 50, category: 'breakfast' },
        { name: '堅果', emoji: '🥜', calories: 607, protein: 21, carbs: 21, fats: 54, serving_size_g: 100, category: 'snacks' },
    ],
};

/* DietFoodPreview — 即時預覽：依選的飲食標籤，哪些食物會被加進「食物搜尋」的優先清單
   （對應 submit 時寫入 drvn_starred_foods 的邏輯，讓使用者選完馬上看到結果）*/
// 依名稱判斷食物類別，供素食/全素過濾使用（避免素食者被推薦肉類）
const MEAT_FOODS = ['雞胸肉', '雞肉', '牛肉', '豬肉', '鮭魚', '鮪魚', '魚', '蝦', '海鮮'];
const ANIMAL_PRODUCTS = ['雞蛋', '蛋', '希臘優格', '優格', '牛奶', '起司', '乳酪']; // 蛋奶（全素要排除）
const isMeat = (name) => MEAT_FOODS.some((k) => name.includes(k));
const isAnimalProduct = (name) => ANIMAL_PRODUCTS.some((k) => name.includes(k));

const DietFoodPreview = ({ dietTypes }) => {
    const foods = (() => {
        const picks = dietTypes && dietTypes.length ? dietTypes : ['general'];
        const out = []; const seen = new Set();
        picks.forEach((t) => (STARTER_FOODS[t] || []).forEach((f) => {
            if (!seen.has(f.name)) { seen.add(f.name); out.push(f); }
        }));
        // ── 飲食限制過濾（限制優先於偏好）──
        // 素食：排除肉/魚/海鮮；全素：再排除蛋奶。
        const isVegan = picks.includes('vegan');
        const isVegetarian = picks.includes('vegetarian') || isVegan;
        let filtered = out;
        if (isVegetarian) filtered = filtered.filter((f) => !isMeat(f.name));
        if (isVegan) filtered = filtered.filter((f) => !isAnimalProduct(f.name));
        return filtered;
    })();
    if (foods.length === 0) return null;
    const shown = foods.slice(0, 8);
    return (
        <div style={{ padding: '14px 16px', marginBottom: 22, ...glassMat(false, 14) }}>
            <div style={{
                fontSize: 12, letterSpacing: '0.22em', fontWeight: 800,
                color: onDark(0.5), fontFamily: C.sans, marginBottom: 10,
            }}>
                將優先出現在「食物搜尋」 · {foods.length} 項
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {shown.map((f) => (
                    <span key={f.name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 12, fontWeight: 600, fontFamily: C.sans,
                        padding: '6px 10px', borderRadius: 999,
                        background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(245,245,245,0.78)',
                    }}>
                        <span>{f.emoji}</span>{f.name}
                    </span>
                ))}
                {foods.length > shown.length && (
                    <span style={{
                        fontSize: 12, fontWeight: 700, fontFamily: C.sans,
                        padding: '6px 10px', borderRadius: 999, color: URBAN.flare,
                    }}>+{foods.length - shown.length}</span>
                )}
            </div>
        </div>
    );
};


const goalToMode = (g) =>
    g === 'muscle_gain' ? 'bulking' : g === 'fat_loss' ? 'cutting' : 'maintenance';

/* 精靈的所有欄位與預設值 —— 只有一份。重跑精靈帶入舊資料、恢復草稿都照這張表挑欄位，
   不認得的舊欄位（例如已拿掉的目標體重、隱私三選一）不會被帶回來。
   ⚠️ 身高、體重刻意是空的：旋鈕會顯示 170／65 當起點，但使用者沒轉過就不算數，
      不然一組沒人確認過的預設值會直接變成這個人的身體數據，之後所有熱量都從它算。 */
const ONBOARDING_DEFAULTS = {
    display_name: '', gender: '', birthday: '',
    avatar: '', bio: '', city: '',
    share_activities: true,          // 社群：讓好友看到我的運動動態（後端 /api/social/friends/privacy）
    intent_tag: '', diet_types: [],
    training_path: 'full',           // 'full' | 'cardio_only' | 'lifting_only'
    fitness_level: '', injuries: [],
    training_focus: '',
    goals: [], target_muscles: [], days_per_week: 3, equipment: '',
    run_days_per_week: 3,
    cardio_goal: 'aerobic_base',
    cardio_total_weeks: 8,
    current_weekly_km: 20,
    pace5k_sec: null,
    build_lift_plan: true,
    build_run_plan: true,
    exercise_habit: 1.375,
    height: '', weight: '',
    body_fat_percent: '', skeletal_muscle_mass: '', muscle_percent: '', bmr: '',
    nutrition_mode: '',
};
/* 一週最多排 6 天：至少留 1 天完全休息（跟 checkWeeklyLoad 的 block 線一致） */
const MAX_DAYS_PER_WEEK = 6;
const AGE_MIN = 10;
const AGE_MAX = 100;

const pickKnownFields = (src) => {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const k of Object.keys(ONBOARDING_DEFAULTS)) {
        if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
    }
    return out;
};

/* 存檔失敗時講真正的原因 —— 以前一律「請檢查網路」，資料格式錯也這樣講，使用者只能一直重按 */
const submitErrorMessage = (e) => {
    if (!e?.response) return '連不上伺服器，確認網路後再按一次。';
    const st = e.response.status;
    if (st === 401 || st === 403) return '登入狀態失效，請重新登入後再試。';
    if (st === 400 || st === 422) return '有欄位格式不對，請回前幾頁確認。';
    return '儲存失敗，請再按一次。';
};

export default function OnboardingWizard() {
    const navigate = useNavigate();
    const TOTAL = 9; // step 0~8
    // 0 WELCOME · 1 YOU · 2 BODY · 3 INTENT · 4 TRAINING PATH
    // 5 TRAINING SETUP (條件式) · 6 NUTRITION · 7 DISCOVER · 8 LAUNCH

    const uid0 = useMemo(() => getUserId(), []);
    const DRAFT_KEY = `onboarding_draft_${uid0}`;

    /* 從「設定 → 重新設定精靈」進來：帶入上一次填的內容，不必從零開始 */
    const prevPrefs = useMemo(() => {
        try {
            const v = JSON.parse(localStorage.getItem(`onboarding_${uid0}`) || 'null');
            return v && typeof v === 'object' ? v : null;
        } catch { return null; }
    }, [uid0]);
    /* 中途關掉 App：回來從上次那一頁繼續 */
    /* 已完成過精靈（或從設定進來）才給「關閉」：首次註冊不能跳過，重跑時要能不改任何東西就離開 */
    const location = useLocation();
    const canClose = !!prevPrefs || location.state?.from === 'settings';
    const draft = useMemo(() => {
        try {
            const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
            return v && typeof v === 'object' && v.d ? v : null;
        } catch { return null; }
    }, [DRAFT_KEY]);

    const [step, setStep] = useState(() => Math.min(Math.max(0, Number(draft?.step) || 0), TOTAL - 1));
    // Step 5 內部分頁：path === 'full' 時，先「跑步設定」再「重訓設定」拆成兩頁
    const [step5Sub, setStep5Sub] = useState(() => (draft?.step5Sub === 'lift' ? 'lift' : 'run'));
    const [dir, setDir] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const submittedRef = useRef(false);
    const [err, setErr] = useState('');
    const [invitedFriends, setInvitedFriends] = useState([]); // 透過好友碼邀請的對象（後端 pending）
    const [friendCodeCopied, setFriendCodeCopied] = useState(false); // STEP 7 COPY 按鈕點擊回饋
    /* 真實好友碼 — 與 /social → FriendsSheet 同一個 API
       來源：GET /api/social/friends/profile/{userId} → { name, discriminator }
       顯示格式：NAME#1234（Discord 風 4 位數識別碼）
       fallback：fetch 失敗時用使用者輸入的暱稱 + 後台 ID 末 4 碼。 */
    const [socialProfile, setSocialProfile] = useState(null);
    useEffect(() => {
        let cancelled = false;
        if (!uid0) return;
        apiClient.get(`/api/social/friends/profile/${uid0}`)
            .then((r) => { if (!cancelled) setSocialProfile(r?.data || null); })
            .catch(() => { /* 不阻擋：fallback 用本地資料 */ });
        return () => { cancelled = true; };
    }, [uid0]);

    /* 推薦追蹤 —— 跟社群頁同一支後端演算法（共同好友＞同運動＞近期活躍＞同城市）。
       以前這裡是 5 個寫死的假人（含編出來的訓練數據），按追蹤也不會送出去。
       沒有可推薦的人就整區不顯示，不拿假人補。 */
    const [suggestions, setSuggestions] = useState(null); // null = 載入中；[] = 沒有
    const [followed, setFollowed] = useState([]);           // 真的追蹤成功的 user_id
    const [followBusy, setFollowBusy] = useState(null);
    useEffect(() => {
        let cancelled = false;
        if (!uid0) { setSuggestions([]); return undefined; }
        getSuggestions(uid0, { limit: 6 })
            .then((list) => { if (!cancelled) setSuggestions(Array.isArray(list) ? list.slice(0, 6) : []); })
            .catch(() => { if (!cancelled) setSuggestions([]); });
        return () => { cancelled = true; };
    }, [uid0]);
    const toggleFollow = useCallback(async (targetId) => {
        if (!targetId || followBusy) return;
        hapticTap();
        const was = followed.includes(targetId);
        setFollowBusy(targetId);
        setFollowed((p) => (was ? p.filter((x) => x !== targetId) : [...p, targetId]));
        try {
            const graph = was ? await unfollowUser(targetId, uid0) : await followUser(targetId, uid0);
            // followGraph 失敗時會自己回滾；以它回來的實際狀態為準，畫面不停在假狀態
            const nowFollowing = Array.isArray(graph?.following) && graph.following.includes(targetId);
            setFollowed((p) => {
                const rest = p.filter((x) => x !== targetId);
                return nowFollowing ? [...rest, targetId] : rest;
            });
            if (nowFollowing === was) hapticWarning();
        } catch {
            setFollowed((p) => (was ? [...p.filter((x) => x !== targetId), targetId] : p.filter((x) => x !== targetId)));
            hapticWarning();
        } finally {
            setFollowBusy(null);
        }
    }, [followed, followBusy, uid0]);

    const [wantTutorial, setWantTutorial] = useState(true); // Step 8：是否要進入教學模式導覽

    const [d, setD] = useState(() => {
        const merged = { ...ONBOARDING_DEFAULTS, ...pickKnownFields(prevPrefs), ...pickKnownFields(draft?.d) };
        ['diet_types', 'injuries', 'goals', 'target_muscles'].forEach((k) => {
            if (!Array.isArray(merged[k])) merged[k] = [];
        });
        ['display_name', 'bio', 'city', 'birthday', 'gender'].forEach((k) => {
            if (typeof merged[k] !== 'string') merged[k] = merged[k] == null ? '' : String(merged[k]);
        });
        merged.days_per_week = Math.min(MAX_DAYS_PER_WEEK, Math.max(1, Number(merged.days_per_week) || 3));
        merged.run_days_per_week = Math.min(MAX_DAYS_PER_WEEK, Math.max(1, Number(merged.run_days_per_week) || 3));
        return merged;
    });
    const set = useCallback((k, v) => setD((p) => ({ ...p, [k]: v })), []);

    /* 草稿：每改一次就存，送出成功才清掉（頭貼不存 —— 太大，而且精靈裡也改不到） */
    useEffect(() => {
        if (submittedRef.current || !uid0) return;
        try {
            const { avatar: _avatar, ...rest } = d;
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, step5Sub, d: rest, savedAt: Date.now() }));
        } catch { /* 隱私模式 / 容量滿：草稿只是方便，不影響流程 */ }
    }, [d, step, step5Sub, DRAFT_KEY, uid0]);

    /* 📍 城市：使用者按「用目前位置」才定位。
       以前一打開歡迎頁就跳定位權限 —— 使用者還不知道要定位做什麼，按了拒絕，
       之後跑步的 GPS 也一起被拒，要去系統設定才救得回來。 */
    const [locating, setLocating] = useState(false);
    const detectCity = useCallback(() => {
        if (!navigator.geolocation || locating) return;
        hapticTap();
        setLocating(true);
        const CITIES = [
            ['台北市', 25.033, 121.565], ['新北市', 25.012, 121.465], ['桃園市', 24.994, 121.301],
            ['台中市', 24.148, 120.674], ['台南市', 22.999, 120.227], ['高雄市', 22.627, 120.301],
            ['基隆市', 25.128, 121.742], ['新竹市', 24.804, 120.971], ['新竹縣', 24.839, 121.004],
            ['苗栗縣', 24.560, 120.821], ['彰化縣', 24.052, 120.516], ['南投縣', 23.961, 120.972],
            ['雲林縣', 23.709, 120.431], ['嘉義市', 23.480, 120.449], ['嘉義縣', 23.452, 120.256],
            ['屏東縣', 22.552, 120.549], ['宜蘭縣', 24.702, 121.738], ['花蓮縣', 23.987, 121.601],
            ['台東縣', 22.758, 121.144], ['澎湖縣', 23.571, 119.579], ['金門縣', 24.437, 118.318],
            ['連江縣', 26.160, 119.951],
        ];
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            let best = null, bestD = Infinity;
            for (const [name, cLat, cLng] of CITIES) {
                const dist = (lat - cLat) ** 2 + (lng - cLng) ** 2;
                if (dist < bestD) { bestD = dist; best = name; }
            }
            if (best) setD((p) => ({ ...p, city: best }));
            setLocating(false);
        }, () => { setLocating(false); hapticWarning(); }, { timeout: 8000, maximumAge: 600000 });
    }, [locating]);

    // 計劃生成 = 路線包含該類 AND 使用者在 Step 5 前置詢問選了「現在建立」
    const pathHasLift = d.training_path === 'full' || d.training_path === 'lifting_only';
    const pathHasRun  = d.training_path === 'full' || d.training_path === 'cardio_only';
    const wantLiftPlan = pathHasLift && d.build_lift_plan;
    const wantRunPlan  = pathHasRun && d.build_run_plan;
    // wantPlan 沿用舊語意（=要不要生成健身計劃），維持既有程式不大改
    const wantPlan = wantLiftPlan;
    /* 訓練經驗：只要這次有建任何一份計劃就要問。
       以前只在重訓頁問 —— 只跑步的人從沒被問過，跑步計劃卻寫死用「中階」產生。 */
    const needLevel = d.training_path === 'cardio_only'
        ? d.build_run_plan
        : (wantLiftPlan || (d.training_path === 'full' && d.build_run_plan));
    const toggleArr = useCallback((k, v) => setD((p) => ({
        ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v],
    })), []);

    // 訓練目標已從 Step 5 移除 — 改由意圖標籤 (Step 3) 推導，
    // 若使用者仍透過其他路徑保留 goals[0]（升級舊資料），優先尊重。
    const primaryGoal = d.goals[0] || INTENT_TO_GOAL[d.intent_tag] || '';
    const age = useMemo(() => {
        if (!d.birthday) return 0;
        const b = new Date(d.birthday);
        if (isNaN(b.getTime())) return 0;
        const now = new Date();
        if (b > now) return 0;  // 未來日期 → 無效
        // 以完整年/月/日計算，避免只用年份相減造成最多 1 歲誤差（連帶影響 BMR/TDEE）
        let a = now.getFullYear() - b.getFullYear();
        const m = now.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
        return Math.max(0, a);
    }, [d.birthday]);
    /* 年齡範圍跟送出時、後端收的範圍是同一條線。
       以前畫面只要求 > 0、生日最早能選 1920 —— 選到 6 歲或 106 歲都能一路填到最後，
       送出時年齡被拿掉、後端拒收，畫面卻說「請檢查網路」。 */
    const ageOk = age >= AGE_MIN && age <= AGE_MAX;
    const birthdayBounds = useMemo(() => {
        const now = new Date();
        const ago = (y) => toLocalDateKey(new Date(now.getFullYear() - y, now.getMonth(), now.getDate()));
        return { min: ago(AGE_MAX + 1), max: ago(AGE_MIN) };
    }, []);

    /* BMR → TDEE（依運動習慣加成）*/
    const tdee = useMemo(() => {
        const w = Number(d.weight), h = Number(d.height);
        if (!w || !h || !age) return 0;
        // 有 InBody 量到的 BMR 就用實測，否則走引擎的 Mifflin-St Jeor。
        const bmr = d.bmr ? Number(d.bmr)
            : calcBMR_MifflinStJeor({ weight: w, height: h, age, gender: d.gender });
        return calcTDEE(bmr, d.exercise_habit);
    }, [d.weight, d.height, d.gender, d.bmr, d.exercise_habit, age]);

    /* Step 6 進來時若還沒選，依意圖推導一個預設（以前在 render 裡 setTimeout 改 state） */
    const fallbackMode = primaryGoal ? goalToMode(primaryGoal) : 'maintenance';
    useEffect(() => {
        if (step === 6 && !d.nutrition_mode) set('nutrition_mode', fallbackMode);
    }, [step, d.nutrition_mode, fallbackMode, set]);

    /* 營養目標 —— 跟營養頁切換模式用同一支算法（utils/nutritionTargets），送出時寫進後端，
       營養頁打開就是使用者在這裡選的模式與熱量，不再一律顯示「維持」。 */
    const nutritionGoals = useMemo(() => macroGoalsForMode({
        mode: d.nutrition_mode || fallbackMode, tdee, weight: d.weight,
    }), [d.nutrition_mode, fallbackMode, tdee, d.weight]);

    /* 🚦 合併天數守門：跑步趟數 ＋ 重訓天數（只算「這次真的要建立」的那些）。
       severity === 'block'（一週 7 天全滿）時擋住下一步 —— 至少留 1 天完全休息。
       full 路線在「跑步」子頁先不算：重訓天數要到下一頁才選，不能拿使用者還沒看到的預設值擋他。 */
    const weeklyLoadPreview = useMemo(() => {
        if (d.training_path === 'full' && step5Sub === 'run') return null;
        const liftDays = (pathHasLift && d.build_lift_plan) ? (d.days_per_week || 0) : 0;
        const runDays = (pathHasRun && d.build_run_plan) ? (d.run_days_per_week || 0) : 0;
        if (!liftDays || !runDays) return null;   // 只有一項 → 沒有跨系統衝突可談
        return checkWeeklyLoad({
            strengthDays: liftDays,
            runSessions: runDays,
            level: d.fitness_level || 'beginner',
            focusId: d.training_focus || null,
        });
    }, [d.training_path, step5Sub, pathHasLift, pathHasRun, d.build_lift_plan, d.build_run_plan, d.days_per_week, d.run_days_per_week, d.fitness_level, d.training_focus]);

    /* 這一頁還缺什麼 —— 「下一步」灰掉時直接寫在按鈕旁，不讓使用者猜 */
    const missingHint = useMemo(() => {
        switch (step) {
            case 1:
                if (!d.display_name.trim()) return '先填你的名字';
                if (!d.gender) return '選一下性別';
                if (!d.birthday) return '選你的生日';
                if (!ageOk) return `年齡需在 ${AGE_MIN}–${AGE_MAX} 歲之間`;
                return '';
            case 2:
                return (d.height && d.weight) ? '' : '轉動旋鈕，設定身高與體重';
            case 3:
                return d.intent_tag ? '' : '選一個意圖';
            case 4:
                return d.training_focus ? '' : '往下選一個訓練重點';
            case 5: {
                if (weeklyLoadPreview?.severity === 'block') return '天數太多，留 1 天休息';
                if (d.training_path === 'full' && step5Sub === 'run') return '';
                if (needLevel && !d.fitness_level) return '選你的訓練經驗';
                if (wantLiftPlan) {
                    if (!d.target_muscles.length) return '至少選 1 個加強部位';
                    if (!d.equipment) return '選訓練場地';
                }
                return '';
            }
            case 6:
                return d.nutrition_mode ? '' : '選一個體態目標';
            default:
                return '';
        }
    }, [step, d, ageOk, weeklyLoadPreview, step5Sub, needLevel, wantLiftPlan]);
    const canNext = !missingHint;
    const isDark = true; // 全面套用深色質感模式

    /* ── 送出 ── */
    const submit = async () => {
        if (submitting) return;
        setSubmitting(true); setErr('');
        try {
            const userId = getUserId();
            if (!userId) throw Object.assign(new Error('no user'), { response: { status: 401 } });
            const _ok = (v, min, max) => {
                const n = Number(v);
                return Number.isFinite(n) && n >= min && n <= max ? n : null;
            };
            const _h = _ok(d.height, 100, 250);
            const _w = _ok(d.weight, 30, 300);
            const _a = _ok(age, AGE_MIN, AGE_MAX);
            const _g = ['male', 'female'].includes(String(d.gender || '').toLowerCase())
                ? String(d.gender).toLowerCase() : null;
            /* 這四項後端必填。前面每一頁都擋過了，這裡是最後一道閘：
               缺了就直接講缺什麼，不要送出去換一個看不懂的錯誤。 */
            if (_h == null || _w == null || _a == null || _g == null) {
                setErr('身高、體重、生日或性別不完整，請回前幾頁確認。');
                return;
            }
            const fd = new FormData();
            fd.append('user_id', userId);
            fd.append('name', d.display_name.trim() || 'Athlete');
            fd.append('height_cm', String(_h));
            fd.append('weight_kg', String(_w));
            fd.append('age', String(_a));
            fd.append('gender', _g);
            fd.append('fitness_level', d.fitness_level || 'beginner');
            // 首登經驗等級（新手/中階/進階）→ 直接決定圖表深度（初階/中階/高階）
            try { setChartLevel(d.fitness_level || 'beginner'); } catch (_) {}
            fd.append('goals', JSON.stringify(d.goals.length ? d.goals : (primaryGoal ? [primaryGoal] : [])));
            fd.append('bio', d.bio.trim());
            fd.append('city', d.city.trim());
            fd.append('tag', d.intent_tag || '');
            if (d.avatar) fd.append('avatar', d.avatar);
            if (d.body_fat_percent) fd.append('body_fat_percent', d.body_fat_percent);
            if (d.skeletal_muscle_mass) fd.append('skeletal_muscle_mass', d.skeletal_muscle_mass);
            if (d.bmr) fd.append('bmr', d.bmr);

            const profileRes = await apiClient.post('/api/user/profile', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            /* 🔗 通知 App 更新全域 userProfile —— App 的 loadProfile 只在掛載時跑一次（訪客不跑），
               不廣播的話營養頁剛完成精靈還是說「先填身體數據」。後端沒回完整資料就用剛送出的值。 */
            try {
                const saved = profileRes?.data && typeof profileRes.data === 'object' && profileRes.data.user_id
                    ? profileRes.data : null;
                window.dispatchEvent(new CustomEvent('drvn:profile-updated', {
                    detail: {
                        user_id: userId,
                        name: d.display_name.trim() || 'Athlete',
                        height_cm: _h, weight_kg: _w, age: _a, gender: _g,
                        fitness_level: d.fitness_level || 'beginner',
                        ...(saved || {}),
                    },
                }));
            } catch { /* 略 */ }

            /* 社群：動態要不要分享給好友（失敗不阻擋，之後可在設定改） */
            try {
                await apiClient.post('/api/social/friends/privacy', {
                    user_id: userId, share_activities: !!d.share_activities,
                });
            } catch { /* 略 */ }

            /* 營養目標寫進後端 —— 營養頁與 Apple Watch 都讀這一份 */
            if (nutritionGoals) {
                try {
                    await apiClient.post('/api/user/nutrition-goals', { user_id: userId, ...nutritionGoals });
                } catch { /* 營養頁之後可再設定 */ }
            }

            const prefs = {
                ...d, age, userId, tdee, followed,
                primary_goal: primaryGoal,
                nutrition_goals: nutritionGoals,
                body_data_source: d.body_fat_percent ? 'inbody' : 'basic',
                plan_generated: wantPlan, // 是否在註冊時就生成了健身計劃
                onboarding_completed: true, completed_at: new Date().toISOString(),
            };
            /* ⚠️ 「已完成精靈」只記在這個帳號自己的 key。
               以前另外寫一個全裝置共用的 onboarding_completed，換帳號會直接跳過精靈。 */
            localStorage.setItem(`onboarding_${userId}`, JSON.stringify(prefs));
            try { localStorage.removeItem('onboarding_completed'); } catch { /* 舊版全域旗標，清掉 */ }

            // 📊 漏斗事件：onboarding_completed（新手漏斗的第一個轉換點）
            import('../utils/telemetry')
                .then(({ track }) => track('onboarding_completed', { plan_generated: wantPlan, rerun: !!prevPrefs }))
                .catch(() => {});

            /* 🔗 同步到首頁／個人頁共用的快取，讓註冊完成後立即顯示名字與頭貼，
               不必等後端往返（首頁 resolveDisplayName 讀 user_profile_cache.name，
               頭貼讀 user_avatar_photo）。 */
            try {
                const cache = uStorage(userId).get('user_profile_cache', {}) || {};
                uStorage(userId).set('user_profile_cache', {
                    ...cache,
                    name: d.display_name.trim() || cache.name || '',
                    gender: _g,
                    age: _a,
                    height_cm: _h,
                    weight_kg: _w,
                    bio: d.bio.trim() || cache.bio || '',
                    city: d.city.trim() || cache.city || '',
                    tag: d.intent_tag || cache.tag,
                });
                if (d.avatar) uStorage(userId).set('user_avatar_photo', d.avatar);
            } catch (e) { console.warn('[Onboarding] profile cache sync skipped', e); }

            /* 把意圖對應的有氧計劃 id 存到全域 key — CardioTrackerMobile 開啟時優先讀這個 */
            try {
                const intentMeta = INTENT_TAGS.find((t) => t.v === d.intent_tag);
                if (intentMeta?.cardio?.id) {
                    localStorage.setItem('drvn_recommended_cardio_id', intentMeta.cardio.id);
                }
                localStorage.setItem('drvn_training_path', d.training_path || 'full');
                /* 🎯 訓練重點 → 寫進單一真相源（utils/trainingFocus），
                   首頁的「完整計劃」入口卡與之後三張課表的處方都讀這裡。 */
                if (d.training_focus) {
                    saveTrainingFocus(userId, {
                        focusId: d.training_focus,
                        level: d.fitness_level || 'beginner',
                        path: d.training_path || 'full',
                        source: 'onboarding',
                    });
                }
                /* 跑步基準線 → 供 CardioPlanBuilder / Virtual Coach 預填，免使用者重填 */
                if (pathHasRun) {
                    localStorage.setItem('drvn_cardio_baseline', JSON.stringify({
                        currentWeeklyKm: Number(d.current_weekly_km) || 0,
                        baselinePace5K: d.pace5k_sec ?? null,
                    }));
                }
            } catch { /* 略 */ }

            /* 🏃 跑步計劃 —— 使用者在 Step 5 選了「現在建立跑步計劃」才生成。
               選「之後再建」不會刪掉現有的計劃（重跑精靈時不該順手清掉人家正在練的課表）。 */
            let cardioPlan = null;
            if (wantRunPlan) {
                try {
                    const focusSplit = resolveWeeklySplit({
                        focusId: d.training_focus || 'maintain',
                        level: d.fitness_level || 'beginner',
                        path: d.training_path || 'full',
                    });
                    const liftDays = wantLiftPlan ? (d.days_per_week || focusSplit.strengthDays) : 0;
                    // 前一頁已守過「合計 ≤ 6」，這裡只是保險，正常情況不會改到使用者選的趟數
                    const runSessions = Math.max(
                        1,
                        Math.min(d.run_days_per_week || focusSplit.runSessions, MAX_DAYS_PER_WEEK - liftDays, MAX_DAYS_PER_WEEK)
                    );
                    cardioPlan = generateCardioPlan({
                        goal: d.cardio_goal || 'aerobic_base',
                        totalWeeks: d.cardio_total_weeks || 8,
                        sessionsPerWeek: runSessions,
                        currentLevel: d.fitness_level || 'beginner',
                        currentWeeklyKm: Number(d.current_weekly_km) || 0,
                        baselinePace5K: d.pace5k_sec ?? null,
                        includeStrength: d.training_path === 'full',
                        startDate: toLocalDateKey(new Date()),
                    });
                    // 先存本機：雲端暫時失敗時，手機上照樣有計劃可練
                    localStorage.setItem(`u_${userId}_onboarding_cardio_plan`, JSON.stringify(cardioPlan));
                } catch (e) { cardioPlan = null; console.warn('[Onboarding] cardio plan gen skipped', e); }
            }

            /* 飲食型態 → nutrition 我的最愛 */
            try {
                const picks = d.diet_types.length ? d.diet_types : ['general'];
                const foods = []; const seen = new Set();
                picks.forEach((t) => (STARTER_FOODS[t] || []).forEach((f) => {
                    if (!seen.has(f.name)) { seen.add(f.name); foods.push({ ...f, starredAt: Date.now() }); }
                }));
                // 飲食限制過濾：素食排除肉/魚，全素再排除蛋奶（與預覽一致）
                const isVegan = picks.includes('vegan');
                const isVegetarian = picks.includes('vegetarian') || isVegan;
                let finalFoods = foods;
                if (isVegetarian) finalFoods = finalFoods.filter((f) => !isMeat(f.name));
                if (isVegan) finalFoods = finalFoods.filter((f) => !isAnimalProduct(f.name));
                if (finalFoods.length) localStorage.setItem('drvn_starred_foods', JSON.stringify(finalFoods));
            } catch { /* 略 */ }

            /* 🏋️ 健身計劃 */
            let liftPlan = null;
            if (wantPlan) {
                try {
                    const plan = generateUnifiedPlan({
                        manualLevel: d.fitness_level || 'beginner',
                        selectedHashtags: d.target_muscles,
                        equipment: d.equipment || 'mixed',
                        injuries: d.injuries,
                        daysPerWeek: d.days_per_week,
                        userBodyWeight: _w,
                        userGender: _g,
                    });
                    localStorage.setItem(`u_${userId}_onboarding_plan`, JSON.stringify(plan));
                    liftPlan = { ...plan, plan_id: plan.plan_id || `onboarding_${userId}_${Date.now()}` };
                    // 先存本機：雲端暫時失敗時，首頁／計劃頁照樣讀得到
                    localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(liftPlan));
                } catch (e) { liftPlan = null; console.warn('[Onboarding] plan gen skipped', e); }
            }

            /* ☁️ 雲端：重訓＋跑步用同一份 program 一次啟用 —— 跟計劃頁、課表精靈走同一條路。
               以前精靈的重訓計劃只存在手機本地：手錶健身頁說「沒有計劃」、換手機就不見、
               重跑精靈產生的新計劃還會被雲端舊計劃蓋回去。
               啟用失敗時計劃仍留在本機，跳提示請使用者之後再確認；不擋使用者進主頁。 */
            if (liftPlan || cardioPlan) {
                try {
                    await activateProgram(userId, {
                        program_id: newProgramId(),
                        ...(liftPlan ? { strength: liftPlan } : {}),
                        ...(cardioPlan ? { running: cardioPlan } : {}),
                    }, apiClient);
                } catch (e) {
                    /* 沒有任何東西排進待同步 —— 別假裝已同步。計劃已存在這支手機，告訴使用者之後要再確認一次；
                       不擋完成精靈。 */
                    console.warn('[Onboarding] cloud activation failed', e);
                    const why = e?.code === 'offline' && e?.message ? `${e.message}。` : '';
                    toast.warning(`${why}計劃已存在這支手機，但還沒同步到雲端，之後請到計劃頁再確認一次。`, 6000);
                }
            }

            submittedRef.current = true;
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* 略 */ }

            navigate('/mobile-home');

            // 使用者在最後一頁選了「要教學」→ 進主頁後觸發新手聚光燈導覽。
            // OnboardingSpotlight 掛在 App 層、全程監聽 ONBOARDING_EVENT，
            // 故即使本精靈已卸載，dispatchEvent 仍會被接到。延遲讓主頁先渲染完成。
            if (wantTutorial) {
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT));
                }, 700);
            }
        } catch (e) {
            console.error('[Onboarding] submit failed', e);
            setErr(submitErrorMessage(e));
        } finally { setSubmitting(false); }
    };

    const next = () => {
        hapticTap();
        // full 路線 Step 5：先 run 子頁 → 再 lift 子頁，才前進到 Step 6
        if (step === 5 && d.training_path === 'full' && step5Sub === 'run') {
            setDir(1); setStep5Sub('lift'); return;
        }
        if (step === TOTAL - 1) { submit(); return; }
        setStep5Sub('run'); // 離開 Step 5 後重置，回來時從 run 子頁開始
        setDir(1); setStep((s) => Math.min(TOTAL - 1, s + 1));
    };
    /* ✕ 關閉：不送出、不動計劃；清掉這次重跑的草稿，下次從上一次的設定重新開始 */
    const closeWizard = () => {
        hapticTap();
        submittedRef.current = true; // 停止草稿自動儲存
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* 略 */ }
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate('/mobile-home', { replace: true });
    };
    const back = () => {
        hapticTap();
        // full 路線 Step 5：在 lift 子頁按返回 → 退回 run 子頁，而非整步退回
        if (step === 5 && d.training_path === 'full' && step5Sub === 'lift') {
            setDir(-1); setStep5Sub('run'); return;
        }
        // 從 Step 6 退回 Step 5（full 路線）時，停在 lift 子頁
        if (step === 6 && d.training_path === 'full') {
            setStep5Sub('lift');
        }
        setDir(-1); setStep((s) => Math.max(0, s - 1));
    };

    /* ── 健身課表雛形預覽（Step 5 重訓子頁，選完即時顯示）── */
    const liftPreview = useMemo(() => {
        if (step !== 5 || !d.build_lift_plan || !d.target_muscles.length || !d.fitness_level) return null;
        try {
            const plan = generateUnifiedPlan({
                manualLevel: d.fitness_level || 'beginner',
                selectedHashtags: d.target_muscles,
                equipment: d.equipment || 'mixed',
                injuries: d.injuries, daysPerWeek: d.days_per_week,
                userBodyWeight: Number(d.weight) > 0 ? Number(d.weight) : null,
                userGender: ['male', 'female'].includes(String(d.gender)) ? d.gender : null,
            });
            const week = plan?.weeks?.[0]?.days || plan?.days || [];
            return week.slice(0, d.days_per_week).map((day) => {
                const exs = day.exercises || day.blocks || [];
                return {
                    label: day.focus || day.shortFocus || day.label || day.name || '訓練日',
                    count: exs.length,
                };
            });
        } catch { return null; }
    }, [step, d.build_lift_plan, d.target_muscles, d.fitness_level, d.equipment, d.injuries, d.days_per_week, d.weight, d.gender]);

    /* ════════════ STEP 畫面 ════════════ */
    const renderInner = () => {
        switch (step) {
            /* ── STEP 0：開場 · 城市的一天 ── */
            case 0:
                return (
                    <div style={{
                        height: "100%", display: "flex", flexDirection: "column",
                        justifyContent: "center", padding: "0 32px", position: "relative"
                    }}>
                        {/* 瑞士極簡點綴：十字網格標記 */}
                        <div style={{ position: 'absolute', top: 48, right: 32, opacity: 0.15 }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 0V14M0 7H14" stroke="#F6F4F1" strokeWidth="1"/></svg>
                        </div>
                        <div style={{ position: 'absolute', bottom: 48, right: 32, opacity: 0.15 }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 0V14M0 7H14" stroke="#F6F4F1" strokeWidth="1"/></svg>
                        </div>

                        {/* 頂部角標：極簡的 Issue 標識 (太金屬質感) */}
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ position: "absolute", top: 60, left: 24, display: "flex", alignItems: "center", gap: 8 }}>
                            <Asterisk size={10} color={URBAN.flare} />
                            <span style={{ 
                                fontSize: 11, letterSpacing: "0.25em", fontWeight: 800,
                                background: 'linear-gradient(90deg, #C8CCD0 0%, #FFFFFF 40%, #8A8E93 100%)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>DRVN / ISSUE Nº01</span>
                        </motion.div>

                        {/* 核心主標：往下移動，保持襯線體與留白 */}
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, ease: EASE }}
                            style={{ marginTop: '12dvh' }}
                        >
                            <h1 style={{ 
                                fontFamily: C.serif, fontSize: 64, lineHeight: 0.9, 
                                fontWeight: 400, color: URBAN.smoke, letterSpacing: "-0.03em",
                                margin: "0 0 16px 0" 
                            }}>
                                城市還沒醒，<br/>
                                <span style={{ fontStyle: "italic", color: URBAN.flare }}>你先醒了。</span>
                            </h1>
                            
                            {/* 鮮明的紅色手繪 underline */}
                            <div style={{ width: 80, marginBottom: 36 }}>
                                <HandUnderline width="100%" color={URBAN.flare} strokeWidth={4} />
                            </div>
                        </motion.div>

                        {/* 太金屬細絲 (Titanium Wire) 視覺分隔 */}
                        <motion.div 
                            initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 1.2, ease: EASE }}
                            style={{
                                width: '100%', height: 1.5, marginBottom: 32, transformOrigin: 'left',
                                background: 'linear-gradient(90deg, rgba(200,204,208,0) 0%, rgba(200,204,208,0.8) 10%, rgba(255,255,255,1) 20%, rgba(138,142,147,0.4) 100%)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: 2
                            }} 
                        />

                        {/* 簡短引導文字 */}
                        <motion.p 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: 0.4, duration: 0.8 }}
                            style={{ 
                                fontSize: 14, lineHeight: 1.6, color: onDark(0.7), 
                                maxWidth: 240, letterSpacing: "0.01em", margin: 0 
                            }}>
                            花 2 分鐘，跟著一天的節奏，打造專屬於你的訓練藍圖。
                        </motion.p>
                        
                        {/* 時間軸改為極簡文字呈現 */}
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: 0.6, duration: 0.8 }}
                            style={{ 
                                marginTop: 48, fontSize: 11, letterSpacing: "0.25em", 
                                color: onDark(0.4), fontWeight: 700, fontFamily: C.sans 
                            }}>
                            05:45 AM — THE AWAKENING
                        </motion.div>
                    </div>
                );
            /* ═══════════════════════════════════════════════════════════════
               新 9-step 流程（瑞士編輯 × 馬克筆手繪）
               1 YOU · 2 BODY · 3 INTENT · 4 TRAINING PATH · 5 SETUP
               6 NUTRITION · 7 DISCOVER · 8 LAUNCH
               設計原則：少字、多滑桿/分段、馬克筆圓圈與箭頭穿插
               ═══════════════════════════════════════════════════════════════ */

            /* ── STEP 1：YOU · 你是誰（合併原 1+2）── */
            case 1:
                return (
                    <>
                        <Masthead index={1} scene="晨光下的自己" title="你是誰" />

                        <Reveal>
                            <SectionNo no="01" label="NAME 稱呼" />
                            {/* 不用額外的 label，直接用 placeholder 引導 */}
                            <Field value={d.display_name} maxLength={20}
                                onChange={(v) => set('display_name', v)} placeholder="你的名字或暱稱" />
                        </Reveal>

                        <Reveal delay={0.06}>
                            <SectionNo no="02" label="GENDER 性別" />
                            <Segmented
                                options={[{ v: 'male', label: '男' }, { v: 'female', label: '女' }]}
                                value={d.gender}
                                onChange={(v) => set('gender', v)}
                            />
                        </Reveal>

                        <Reveal delay={0.12}>
                            <SectionNo no="03" label="BIRTHDAY 生日" />
                            <Field type="date" value={d.birthday}
                                max={birthdayBounds.max}
                                min={birthdayBounds.min}
                                onChange={(v) => set('birthday', v)} />
                            {d.birthday && !ageOk && (
                                <div style={{ fontSize: 12, color: URBAN.flare, fontFamily: C.sans, marginTop: -8, marginBottom: 8 }}>
                                    年齡需在 {AGE_MIN}–{AGE_MAX} 歲之間
                                </div>
                            )}
                            {ageOk && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.94 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.4, ease: EASE }}
                                    style={{
                                        position: 'relative', display: 'inline-flex', alignItems: 'center',
                                        marginTop: 8, padding: '6px 18px',
                                    }}>
                                    <span style={{ position: 'absolute', inset: -2 }}>
                                        <HandCircle width="100%" height="100%" color={URBAN.flare} strokeWidth={3} />
                                    </span>
                                    <span style={{
                                        fontFamily: C.serif, fontSize: 22, fontWeight: 400, color: URBAN.smoke,
                                        lineHeight: 1, marginRight: 6, fontVariantNumeric: 'tabular-nums',
                                    }}>{age}</span>
                                    <span style={{
                                        fontSize: 12, letterSpacing: '0.2em', fontWeight: 800,
                                        color: onDark(0.65), fontFamily: C.sans,
                                    }}>歲</span>
                                </motion.div>
                            )}
                        </Reveal>

                        <Reveal delay={0.18}>
                            <SectionNo no="04" label="ABOUT 關於你 (選填)" />
                            {/* 加上細微的小 label 作為輸入框的附註 */}
                            <Field label="自介 BIO" value={d.bio} maxLength={60}
                                onChange={(v) => set('bio', v)} placeholder="一句話描述自己" />
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Field label="城市 CITY" value={d.city} maxLength={12}
                                        onChange={(v) => set('city', v)} placeholder="例如：台北" />
                                </div>
                                {typeof navigator !== 'undefined' && navigator.geolocation && (
                                    <motion.button type="button" whileTap={{ scale: 0.94 }}
                                        onClick={detectCity} disabled={locating}
                                        style={{
                                            flexShrink: 0, marginBottom: 16, minHeight: 44,
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '0 14px', borderRadius: 999, cursor: 'pointer',
                                            background: 'transparent', border: `1px solid ${URBAN.silverLine}`,
                                            color: onDark(0.75), fontSize: 12, fontWeight: 700, fontFamily: C.sans,
                                            opacity: locating ? 0.5 : 1,
                                        }}>
                                        <MapPin size={13} /> {locating ? '定位中' : '目前位置'}
                                    </motion.button>
                                )}
                            </div>
                        </Reveal>

                        <Reveal delay={0.24}>
                            <SectionNo no="05" label="SHARE 運動動態" />
                            <Segmented
                                options={[
                                    { v: true, label: '分享給好友' },
                                    { v: false, label: '只有自己看' },
                                ]}
                                value={!!d.share_activities}
                                onChange={(v) => set('share_activities', v)}
                            />
                        </Reveal>
                    </>
                );

            /* ── STEP 2：BODY · 你的身體（sliders + InBody accordion）── */
            case 2: {
                const hasInbody = d.body_fat_percent || d.skeletal_muscle_mass;
                return (
                    <>
                        <Masthead index={2} scene="閱讀身體的訊號" title="你的身體" />

                        <Reveal>
                            {/* 身高 / 體重 — 使用原本設計的 MetalKnob 金屬旋鈕（圓形畫圓拖曳 + 動量 + tick 音效） */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-around',
                                alignItems: 'flex-start', gap: 16,
                                marginTop: 8, marginBottom: 14,
                            }}>
                                <MetalKnob
                                    label="身高 HEIGHT"
                                    value={Number(d.height) || KNOB_START.height}
                                    min={100} max={250} step={1} unit="CM"
                                    onChange={(v) => set('height', v)}
                                />
                                <MetalKnob
                                    label="體重 WEIGHT"
                                    value={Number(d.weight) || KNOB_START.weight}
                                    min={30} max={300} step={1} unit="KG"
                                    onChange={(v) => set('weight', v)}
                                />
                            </div>
                        </Reveal>

                        <Reveal delay={0.12}>
                            <SectionNo no="03" label="ACTIVITY" />
                            <Segmented
                                options={[
                                    { v: 1.2, label: '低' },
                                    { v: 1.375, label: '輕' },
                                    { v: 1.55, label: '中' },
                                    { v: 1.725, label: '高' },
                                    { v: 1.9, label: '極' },
                                ]}
                                value={d.exercise_habit}
                                onChange={(v) => set('exercise_habit', v)}
                            />
                            <div style={{ fontSize: 11, color: onDark(0.55), marginTop: -8, marginBottom: 14, fontStyle: 'italic' }}>
                                / {EXERCISE_HABIT.find(h => h.v === d.exercise_habit)?.desc || ''}
                            </div>
                            {tdee > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex', alignItems: 'baseline',
                                        justifyContent: 'space-between',
                                        padding: '12px 14px', borderRadius: 12,
                                        border: `1px solid ${URBAN.silverLine}`,
                                        marginBottom: 14,
                                    }}>
                                    <span style={{
                                        fontSize: 12, letterSpacing: '0.22em', fontWeight: 800,
                                        color: onDark(0.55), fontFamily: C.sans,
                                    }}>每日 TDEE</span>
                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                        <span style={{
                                            fontFamily: C.serif, fontSize: 24, color: URBAN.flare,
                                            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                                        }}>{tdee}</span>
                                        <span style={{
                                            fontSize: 12, letterSpacing: '0.2em', fontWeight: 800,
                                            color: onDark(0.55), fontFamily: C.sans,
                                        }}>大卡</span>
                                    </span>
                                </motion.div>
                            )}
                        </Reveal>

                        <Reveal delay={0.18}>
                            <details onToggle={() => hapticTap()}>
                                <summary style={{
                                    cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                    color: URBAN.flare, margin: '6px 0 16px',
                                    letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <HandStar size={14} color={URBAN.flare} />
                                    InBody 進階（選填）
                                </summary>
                                {/* 體脂 / SMM 改用橫向錶冠滑桿 */}
                                <DrumPicker
                                    label="體脂率 BF"
                                    value={Number(d.body_fat_percent) || 18}
                                    min={4} max={45} step={1} unit="%"
                                    onChange={(v) => set('body_fat_percent', String(v))}
                                />
                                <div style={{ height: 12 }} /> {/* 間距 */}
                                <DrumPicker
                                    label="骨骼肌 SMM"
                                    value={Number(d.skeletal_muscle_mass) || 28}
                                    min={15} max={50} step={1} unit="KG"
                                    onChange={(v) => set('skeletal_muscle_mass', String(v))}
                                />
                                {hasInbody && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 }}>
                                        <span style={{ fontSize: 11, color: URBAN.flare }}>✓ 會用你的體脂與肌肉量計算</span>
                                        {/* 不小心滑到也能取消，不然一組沒量過的數字會被當成 InBody 存進去 */}
                                        <button type="button"
                                            onClick={() => { hapticTap(); setD((p) => ({ ...p, body_fat_percent: '', skeletal_muscle_mass: '' })); }}
                                            style={{
                                                minHeight: 44, padding: '0 6px', background: 'transparent', border: 'none',
                                                fontSize: 12, fontWeight: 700, color: onDark(0.6), cursor: 'pointer',
                                                textDecoration: 'underline', textUnderlineOffset: 3,
                                            }}>不用了</button>
                                    </div>
                                )}
                            </details>
                        </Reveal>
                    </>
                );
            }

            /* ── STEP 3：INTENT · 你的意圖（5 卡，移除飲食 chip）── */
            case 3:
                return (
                    <>
                        <Masthead index={3} scene="通勤路上的意圖" title="你的意圖" />
                        <Reveal>
                            {INTENT_TAGS.map((t) => (
                                <IntentCard
                                    key={t.v}
                                    tag={t.label}
                                    desc={t.desc}
                                    cardio={t.cardio}
                                    selected={d.intent_tag === t.v}
                                    onClick={() => set('intent_tag', t.v)}
                                />
                            ))}
                        </Reveal>
                    </>
                );

            /* ── STEP 4：TRAINING PATH · 訓練路線（早期分支）── */
            case 4:
                return (
                    <>
                        <Masthead index={4} scene="打底的時刻" title="走哪條路線" />
                        <Reveal>
                            {TRAINING_PATHS.map((p, i) => {
                                const sel = d.training_path === p.v;

                                let activeGradient;
                                if (i === 0) {
                                    // Coral 金屬 (最上)
                                    activeGradient = sel
                                        ? 'linear-gradient(135deg, #FFA89F 0%, #F95C4B 30%, #FF897D 50%, #C43C2D 80%, #F95C4B 100%)'
                                        : 'linear-gradient(135deg, #A66A63 0%, #69342F 30%, #945952 50%, #451B18 80%, #6E3933 100%)';
                                } else if (i === 1) {
                                    // Pebble 金屬 (中間)
                                    activeGradient = sel
                                        ? 'linear-gradient(135deg, #F5F0EA 0%, #CFC6B8 30%, #E6DFD5 50%, #A69A88 80%, #CFC6B8 100%)'
                                        : 'linear-gradient(135deg, #8A8377 0%, #544F46 30%, #7A7368 50%, #3D3932 80%, #615A51 100%)';
                                } else {
                                    // Titanium 金屬 (最下)
                                    activeGradient = sel
                                        ? 'linear-gradient(135deg, #F0F0F0 0%, #B0B0B0 30%, #E8E8E8 50%, #808080 80%, #C0C0C0 100%)'
                                        : 'linear-gradient(135deg, #888888 0%, #555555 30%, #777777 50%, #333333 80%, #666666 100%)';
                                }

                                return (
                                    <motion.button
                                        key={p.v} type="button" whileTap={{ scale: 0.97 }}
                                        onClick={() => { hapticTap(); set('training_path', p.v); }} layout
                                        style={{
                                            width: '100%', textAlign: 'left', cursor: 'pointer',
                                            position: 'relative', display: 'flex', flexDirection: 'column',
                                            padding: '22px 20px', marginBottom: 14,
                                            // Liquid Glass 材質（選中時提亮 + coral 內光）
                                            ...glassMat(sel, 16),
                                            transition: 'all .25s cubic-bezier(0.16, 1, 0.3, 1)',
                                            overflow: 'hidden',
                                        }}>

                                        {/* 右上角 Recommended 膠囊 */}
                                        {p.recommended && (
                                            <span style={{
                                                position: 'absolute', top: 16, right: 16,
                                                background: URBAN.flare, color: '#fff',
                                                fontSize: 12, fontWeight: 800, padding: '4px 8px',
                                                letterSpacing: '0.15em', fontFamily: C.sans, borderRadius: 999,
                                            }}>推薦</span>
                                        )}

                                        {/* 頂部區域：巨大的英文 Tag 與中文名稱 */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                                            <div>
                                                <div style={{
                                                    fontFamily: '"Tenor Sans", sans-serif', fontSize: 46, lineHeight: 0.85,
                                                    fontWeight: 400,
                                                    background: activeGradient,
                                                    WebkitBackgroundClip: 'text',
                                                    WebkitTextFillColor: 'transparent',
                                                    color: 'transparent',
                                                    letterSpacing: '-0.02em', marginBottom: 8,
                                                }}>
                                                    {p.tag}
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: sel ? URBAN.smoke : 'rgba(245,245,245,0.6)', letterSpacing: '0.1em' }}>
                                                    {p.label}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 底部數據區：細線分隔，直覺顯示包含模組數 */}
                                        <div style={{
                                            borderTop: `1px solid ${sel ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                            paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'
                                        }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '70%' }}>
                                                {p.unlocks.map((u, j) => (
                                                    <span key={j} style={{
                                                        fontSize: 11, fontFamily: C.sans, fontWeight: 500,
                                                        padding: '4px 8px', borderRadius: 6,
                                                        background: sel ? 'rgba(255,255,255,0.1)' : 'transparent',
                                                        border: sel ? 'none' : '1px solid rgba(255,255,255,0.15)',
                                                        color: sel ? URBAN.smoke : 'rgba(245,245,245,0.6)',
                                                    }}>{u}</span>
                                                ))}
                                            </div>

                                            {/* 雜誌風大數字：05 INCLUDES */}
                                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <span style={{ fontSize: 9, letterSpacing: '0.2em', color: URBAN.flare, fontWeight: 800, marginBottom: 2 }}>INCLUDES</span>
                                                <span style={{
                                                    fontFamily: '"Tenor Sans", sans-serif', fontSize: 32, lineHeight: 0.8,
                                                    background: activeGradient,
                                                    WebkitBackgroundClip: 'text',
                                                    WebkitTextFillColor: 'transparent',
                                                    color: 'transparent',
                                                    fontVariantNumeric: 'tabular-nums'
                                                }}>
                                                    {String(p.unlocks.length).padStart(2, '0')}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </Reveal>

                        {/* 🎯 訓練重點 —— 跑步 / 重訓 / 營養三張課表的共同上位設定。
                            放在註冊流程裡的理由：先有重點，後面的天數與熱量才有依據，
                            也才不會排出「跑 5 趟 ＋ 重訓 5 天」這種執行不了的組合。 */}
                        <Reveal delay={0.12}>
                            <div style={{ marginTop: 26 }}>
                                <div style={{
                                    fontSize: 12, letterSpacing: '0.22em', fontWeight: 800,
                                    color: onDark(0.55), fontFamily: C.sans, textTransform: 'uppercase',
                                    marginBottom: 6,
                                }}>FOCUS 這一期的訓練重點</div>
                                <p style={{
                                    fontSize: 11.5, lineHeight: 1.55, color: onDark(0.42),
                                    fontFamily: C.sans, margin: '0 0 14px',
                                }}>
                                    之後跑步、重訓、營養的天數與熱量都會依這個重點配好，隨時能改。
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    {FOCUS_OPTIONS.map((f) => {
                                        const fsel = d.training_focus === f.id;
                                        return (
                                            <motion.button
                                                key={f.id} type="button" whileTap={{ scale: 0.97 }}
                                                onClick={() => { hapticTap(); set('training_focus', f.id); }}
                                                style={{
                                                    textAlign: 'left', cursor: 'pointer', padding: '14px 14px 13px',
                                                    ...glassMat(fsel, 14),
                                                    transition: 'all .25s cubic-bezier(0.16, 1, 0.3, 1)',
                                                }}>
                                                <div style={{
                                                    fontSize: 9, letterSpacing: '0.2em', fontWeight: 800,
                                                    color: fsel ? URBAN.flare : 'rgba(245,245,245,0.45)',
                                                    fontFamily: C.sans, marginBottom: 8,
                                                }}>{f.kicker}</div>
                                                <div style={{
                                                    fontSize: 14, fontWeight: 700, lineHeight: 1.25,
                                                    color: fsel ? URBAN.smoke : 'rgba(245,245,245,0.72)',
                                                    marginBottom: 4,
                                                }}>{f.label}</div>
                                                <div style={{
                                                    fontSize: 11, lineHeight: 1.45, fontFamily: C.sans,
                                                    color: fsel ? 'rgba(245,245,245,0.7)' : 'rgba(245,245,245,0.42)',
                                                }}>{f.sub}</div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </Reveal>
                    </>
                );

            /* ── STEP 5：TRAINING SETUP · 條件式設定 ── */
            case 5: {
                const path = d.training_path;
                const intentMeta = INTENT_TAGS.find((t) => t.v === d.intent_tag);
                // full 路線拆兩頁：run 子頁只顯示跑步、lift 子頁只顯示重訓
                const showRun = path === 'cardio_only' || (path === 'full' && step5Sub === 'run');
                const showLift = path === 'lifting_only' || (path === 'full' && step5Sub === 'lift');
                return (
                    <>
                        <Masthead index={5}
                            scene={path === 'full'
                                ? (step5Sub === 'run' ? '午間的節奏 · 跑步' : '午間的節奏 · 重訓')
                                : '午間的節奏'}
                            title={showRun ? '跑步設定' : '重訓設定'} />
                        <IntentBanner intentMeta={intentMeta} />

                        {/* ✦ 前置詢問：是否現在建立計劃（跑步 / 健身各自問）*/}
                        {showRun && (
                            <BuildPlanToggle kind="run" on={d.build_run_plan}
                                onToggle={(v) => set('build_run_plan', v)} />
                        )}
                        {showLift && (
                            <BuildPlanToggle kind="lift" on={d.build_lift_plan}
                                onToggle={(v) => set('build_lift_plan', v)} />
                        )}

                        {/* 👉 升級這裡：極簡時尚雜誌風 · 推薦有氧卡牌 (透明玻璃底) */}
                        {showRun && d.build_run_plan && intentMeta?.cardio && (
                            <Reveal delay={0.05}>
                                <div style={{
                                    marginBottom: 22, padding: '20px 18px',
                                    ...glassMat(false, 16),
                                    position: 'relative', overflow: 'hidden'
                                }}>
                                    <div style={{
                                        fontSize: 12, letterSpacing: '0.24em', fontWeight: 800,
                                        color: onDark(0.5), fontFamily: C.sans, marginBottom: 14,
                                    }}>
                                        SUGGESTED CARDIO / 系統推薦有氧
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
                                        <div>
                                            <div style={{
                                                fontFamily: C.serif, fontSize: 32, lineHeight: 0.9,
                                                fontWeight: 400, color: URBAN.smoke, letterSpacing: '-0.02em',
                                                marginBottom: 6
                                            }}>
                                                {intentMeta.cardio.tag}
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(245,245,245,0.75)', letterSpacing: '0.02em' }}>
                                                {intentMeta.cardio.name}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            <span style={{
                                                fontFamily: C.serif, fontSize: 36, lineHeight: 0.8,
                                                color: URBAN.flare, fontVariantNumeric: 'tabular-nums',
                                                fontWeight: 400
                                            }}>
                                                {intentMeta.cardio.mins}
                                            </span>
                                            <span style={{ fontSize: 11, color: onDark(0.4), fontWeight: 800, marginTop: 4 }}>分鐘</span>
                                        </div>
                                    </div>
                                    <div style={{
                                        borderTop: '1px dashed rgba(245,245,245,0.12)', paddingTop: 10,
                                        fontSize: 11, color: onDark(0.55), lineHeight: 1.4
                                    }}>
                                        * 依據 <span style={{ color: URBAN.smoke, fontWeight: 600 }}>{intentMeta.label}</span> 目標調校，註冊後可於模組一鍵啟動。
                                    </div>
                                </div>
                            </Reveal>
                        )}

                        {/* 🏃 跑步計劃完整設定（嵌入步驟）— 跑步子頁顯示
                            僅在「現在建立跑步計劃」時展開完整選項；選之後再建則收合 */}
                        {showRun && d.build_run_plan && (
                            <RunBaselineCard
                                goal={d.cardio_goal}
                                totalWeeks={d.cardio_total_weeks}
                                weeklyKm={d.current_weekly_km}
                                pace5k={d.pace5k_sec}
                                onChangeGoal={(v) => { hapticTap(); set('cardio_goal', v); }}
                                onChangeWeeks={(v) => { hapticTap(); set('cardio_total_weeks', v); }}
                                onChangeWeeklyKm={(v) => set('current_weekly_km', v)}
                                onChangePace5k={(v) => set('pace5k_sec', v)}
                            />
                        )}

                        {/* 訓練經驗 —— 只要這次建任何一份計劃就問（只跑步也要問，跑步計劃依它排強度） */}
                        {needLevel && ((path === 'cardio_only' && showRun) || (path !== 'cardio_only' && showLift)) && (
                            <Reveal>
                                <SectionNo no="01" label="EXPERIENCE 訓練經驗" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                                    {FITNESS_LEVELS.map((f) => {
                                        const sel = d.fitness_level === f.v;
                                        return (
                                            <motion.button
                                                key={f.v} type="button" whileTap={{ scale: 0.98 }}
                                                onClick={() => { hapticTap(); set('fitness_level', f.v); }}
                                                style={{
                                                    width: '100%', textAlign: 'left', cursor: 'pointer',
                                                    padding: '16px 18px', borderRadius: 18, ...glassMat(sel),
                                                    display: 'flex', alignItems: 'flex-start', gap: 14,
                                                    transition: 'all .22s cubic-bezier(0.16,1,0.3,1)',
                                                }}>
                                                <span style={{
                                                    fontFamily: C.serif, fontSize: 26, lineHeight: 1,
                                                    color: sel ? URBAN.flare : onDark(0.5),
                                                    fontVariantNumeric: 'tabular-nums', marginTop: 2,
                                                }}>{f.no}</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                                                        <span style={{
                                                            fontSize: 17, fontWeight: 700, fontFamily: C.sans,
                                                            color: sel ? URBAN.smoke : 'rgba(245,245,245,0.72)',
                                                        }}>{f.title}</span>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, color: onDark(0.5),
                                                            fontFamily: C.sans, letterSpacing: '0.02em',
                                                        }}>{f.desc}</span>
                                                    </div>
                                                    {/* 參考值（重訓用語；只跑步的人不顯示組數與 RPE） */}
                                                    {path !== 'cardio_only' && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, fontFamily: C.sans,
                                                            padding: '3px 8px', borderRadius: 6,
                                                            background: sel ? 'rgba(249,92,75,0.16)' : 'rgba(255,255,255,0.06)',
                                                            color: sel ? URBAN.flare : onDark(0.62),
                                                            border: `1px solid ${sel ? 'rgba(249,92,75,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                                        }}>{f.ref}</span>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, fontFamily: C.sans,
                                                            padding: '3px 8px', borderRadius: 6,
                                                            background: 'rgba(255,255,255,0.05)',
                                                            color: onDark(0.55),
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                        }}>{f.load}</span>
                                                    </div>
                                                    )}
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </Reveal>
                        )}

                        {/* 重訓區塊 — 僅在「現在建立健身計劃」時展開 */}
                        <AnimatePresence>
                            {showLift && d.build_lift_plan && (
                                <motion.div
                                    key="lift"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                                    <Reveal delay={0.06}>
                                        <SectionNo no="02" label="FOCUS 目標肌群" />
                                        {/* 說明：讓使用者知道這是「特別想強化的部位」，課表會多分配容量 */}
                                        <div style={{ fontSize: 11.5, color: onDark(0.5), fontFamily: C.sans, lineHeight: 1.5, marginTop: -4, marginBottom: 12 }}>
                                            選你<span style={{ color: URBAN.flare, fontWeight: 700 }}>特別想加強</span>的部位，課表會替這些肌群安排更多訓練量；沒選到的部位仍會均衡帶到。
                                        </div>
                                        {/* 與 UnifiedTrainingEngine 一致：FOCUS 最多 3 個 — 超過就阻擋 + 觸覺警告 */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                            {TARGET_MUSCLES.map((m) => {
                                                const isSel = d.target_muscles.includes(m.v);
                                                const atCap = d.target_muscles.length >= 3 && !isSel;
                                                return (
                                                    <Pill key={m.v} label={m.label}
                                                        selected={isSel}
                                                        disabled={atCap}
                                                        onClick={() => {
                                                            if (atCap) {
                                                                hapticWarning();
                                                                return;
                                                            }
                                                            toggleArr('target_muscles', m.v);
                                                        }} />
                                                );
                                            })}
                                        </div>
                                        <div style={{
                                            fontSize: 11, color: d.target_muscles.length >= 3 ? URBAN.flare : onDark(0.45),
                                            fontFamily: C.serif, fontStyle: 'italic',
                                            marginTop: 2, marginBottom: 22,
                                        }}>
                                            / 最多 3 個焦點 · 已選 {d.target_muscles.length} / 3
                                        </div>
                                    </Reveal>
                                    <Reveal delay={0.12}>
                                        <SectionNo no="03" label="EQUIPMENT 場地與器材" />
                                        <Segmented
                                            options={EQUIPMENT.map((e) => ({ v: e.v, label: e.label }))}
                                            value={d.equipment}
                                            onChange={(v) => set('equipment', v)}
                                        />
                                    </Reveal>
                                    <Reveal delay={0.18}>
                                        <SectionNo no="04" label="INJURIES 避開部位 (選填)" />
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
                                            {INJURIES.map((i) => (
                                                <Pill key={i.v} label={i.label} dark
                                                    selected={d.injuries.includes(i.v)}
                                                    onClick={() => toggleArr('injuries', i.v)} />
                                            ))}
                                        </div>
                                    </Reveal>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* 👁 健身課表雛形預覽 — 依目前選擇即時生成，讓使用者選完先看到結果 */}
                        {showLift && d.build_lift_plan && liftPreview && liftPreview.length > 0 && (
                            <Reveal delay={0.20}>
                                <div style={{ padding: '16px 18px', marginTop: 6, marginBottom: 6, ...glassMat(false, 16) }}>
                                    <div style={{
                                        fontSize: 12, letterSpacing: '0.22em', fontWeight: 800,
                                        color: onDark(0.5), fontFamily: C.sans, marginBottom: 12,
                                    }}>PLAN PREVIEW · 將生成的課表雛形</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {liftPreview.map((day, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 14px', borderRadius: 12,
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                    <span style={{
                                                        fontFamily: C.serif, fontSize: 15, color: URBAN.flare,
                                                        fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                                                    }}>D{i + 1}</span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: URBAN.smoke, fontFamily: C.sans }}>{day.label}</span>
                                                        {/* Full Body A/B 區別說明 */}
                                                        {/Full Body A/i.test(day.label) && (
                                                            <span style={{ display: 'block', fontSize: 11, color: onDark(0.42), fontFamily: C.sans, marginTop: 1 }}>偏重上肢／推系（胸肩三頭）</span>
                                                        )}
                                                        {/Full Body B/i.test(day.label) && (
                                                            <span style={{ display: 'block', fontSize: 11, color: onDark(0.42), fontFamily: C.sans, marginTop: 1 }}>偏重下肢與拉系（腿背二頭）</span>
                                                        )}
                                                    </span>
                                                </span>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: onDark(0.55), fontFamily: C.sans, flexShrink: 0 }}>
                                                    {day.count} 個動作
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 11, color: onDark(0.4), fontFamily: C.sans, marginTop: 10, lineHeight: 1.4 }}>
                                        * 依你的經驗、焦點肌群、場地與頻率即時試算，確認後於註冊完成時正式生成。
                                    </div>
                                </div>
                            </Reveal>
                        )}

                        {/* 頻率 slider — 僅在該類計劃要建立時顯示
                            🩹 跑步與重訓各自獨立（過去共用 days_per_week → 選 5 天重訓
                               等於也排 5 趟跑步）；full 路線在下方顯示合併後的總天數守門。 */}
                        {((showRun && d.build_run_plan) || (showLift && d.build_lift_plan)) && (
                            <Reveal delay={0.24}>
                                <div style={{ marginTop: 12 }}>
                                    <MetalSlider
                                        label={showRun ? 'FREQUENCY 每週跑步天數' : 'FREQUENCY 每週重訓天數'}
                                        value={showRun ? d.run_days_per_week : d.days_per_week}
                                        min={1} max={MAX_DAYS_PER_WEEK} step={1}
                                        unit={showRun ? 'RUNS' : 'DAYS'}
                                        onChange={(v) => set(showRun ? 'run_days_per_week' : 'days_per_week', v)}
                                        ticks={[1, 2, 3, 4, 5, 6]}
                                    />
                                    {weeklyLoadPreview && weeklyLoadPreview.severity !== 'ok' && (
                                        <div style={{
                                            marginTop: -8, marginBottom: 20, padding: '13px 15px', borderRadius: 14,
                                            background: weeklyLoadPreview.severity === 'block'
                                                ? 'rgba(217,64,48,0.14)' : 'rgba(249,92,75,0.10)',
                                            border: `1px solid ${weeklyLoadPreview.severity === 'block'
                                                ? 'rgba(217,64,48,0.45)' : 'rgba(249,92,75,0.30)'}`,
                                        }}>
                                            <div style={{
                                                fontSize: 12, fontWeight: 800, color: URBAN.smoke,
                                                fontFamily: C.sans, marginBottom: 4,
                                            }}>{weeklyLoadPreview.title}</div>
                                            <div style={{
                                                fontSize: 11, lineHeight: 1.55, color: 'rgba(245,245,245,0.62)',
                                                fontFamily: C.sans,
                                            }}>{weeklyLoadPreview.message}</div>
                                        </div>
                                    )}
                                </div>
                            </Reveal>
                        )}
                    </>
                );
            }

            /* ── STEP 6：NUTRITION · 營養（合併原 diet + 營養）── */
            case 6: {
                const mode = d.nutrition_mode || fallbackMode;
                return (
                    <>
                        <Masthead index={6} scene="為今天補給" title="營養設定" />

                        <Reveal>
                            <SectionNo no="01" label="GOAL 體態目標" />
                            <Segmented
                                options={NUTRITION_MODES.map((m) => ({ v: m.v, label: m.title }))}
                                value={mode}
                                onChange={(v) => set('nutrition_mode', v)}
                            />
                            {/* 選中模式的白話說明，讓使用者知道差別 */}
                            {(() => {
                                const cur = NUTRITION_MODES.find((m) => m.v === mode);
                                if (!cur) return null;
                                return (
                                    <div style={{ fontSize: 11.5, color: onDark(0.5), fontFamily: C.sans, lineHeight: 1.5, marginTop: 10 }}>
                                        <span style={{ color: URBAN.flare, fontWeight: 700 }}>{cur.title}（{cur.en}）</span>：{cur.desc}
                                    </div>
                                );
                            })()}
                            {nutritionGoals && (
                                <div style={{
                                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                                    padding: '12px 14px', borderRadius: 12, marginTop: 14,
                                    border: `1px solid ${URBAN.silverLine}`,
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: onDark(0.6), fontFamily: C.sans }}>每天吃這麼多</span>
                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                        <span style={{
                                            fontFamily: C.serif, fontSize: 24, color: URBAN.flare,
                                            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                                        }}>{nutritionGoals.target_calories.toLocaleString()}</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: onDark(0.55), fontFamily: C.sans }}>大卡</span>
                                    </span>
                                </div>
                            )}
                        </Reveal>

                        <Reveal delay={0.06}>
                            <SectionNo no="02" label="DIET 飲食偏好" />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                {DIET_TYPES.map((t) => (
                                    <Pill key={t.v} label={t.label} dark
                                        selected={d.diet_types.includes(t.v)}
                                        onClick={() => toggleArr('diet_types', t.v)} />
                                ))}
                            </div>
                            {/* 👁 預覽：依選的標籤，這些食物會優先出現在食物搜尋 */}
                            <DietFoodPreview dietTypes={d.diet_types} />
                        </Reveal>

                    </>
                );
            }

            /* ── STEP 7：SOCIAL · 你的社交圈（雜誌封面式社群） ── */
            case 7: {
                const realName = socialProfile?.name || d.display_name?.trim() || 'Athlete';
                const realDisc = socialProfile?.discriminator
                    || String(getUserId()).slice(-4).padStart(4, '0');
                const fullId = `${realName}#${realDisc}`;
                return (
                    <>
                        {/* 封面式 masthead — 大字 + ISSUE 標題 */}
                        <div style={{ marginBottom: 22, position: 'relative' }}>
                            <motion.div
                                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, ease: EASE }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    marginBottom: 14, flexWrap: 'wrap',
                                }}>
                                <span style={{
                                    background: URBAN.flare, color: '#fff',
                                    fontSize: 9, fontWeight: 800, padding: '3.5px 8px',
                                    letterSpacing: '0.16em', fontFamily: C.sans,
                                }}>DAY 07</span>
                                <span style={{
                                    fontSize: 9, letterSpacing: '0.24em', fontWeight: 700,
                                    color: onDark(0.62), fontFamily: C.sans,
                                }}>THE&nbsp;CIRCLE</span>
                                <span style={{
                                    fontSize: 11, fontStyle: 'italic',
                                    color: onDark(0.45), fontFamily: C.serif,
                                }}>/ 夜晚的同伴</span>
                            </motion.div>
                            <motion.h1
                                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.12, duration: 0.6, ease: EASE }}
                                style={{
                                    fontFamily: C.serif, fontSize: 44, lineHeight: 1.02,
                                    fontWeight: 400, margin: 0, color: URBAN.smoke,
                                    letterSpacing: '-0.018em',
                                }}>
                                你的<span style={{
                                    fontStyle: 'italic', color: URBAN.flare,
                                    position: 'relative', display: 'inline-block',
                                }}>
                                    社交圈
                                    <span style={{
                                        position: 'absolute', left: -2, right: -2, bottom: -4,
                                    }}>
                                        <HandUnderline width="100%" color={URBAN.flare} strokeWidth={3} />
                                    </span>
                                </span>
                            </motion.h1>
                        </div>

                        {/* 雜誌封底式好友碼 — 大型 type、橫條切 */}
                        <Reveal>
                            <div style={{
                                marginBottom: 22,
                                background: 'linear-gradient(135deg, rgba(245,245,245,0.05) 0%, rgba(245,245,245,0.02) 100%)',
                                border: `1px solid ${URBAN.silverLine}`,
                                borderRadius: 18, padding: '20px 18px',
                                position: 'relative', overflow: 'hidden',
                            }}>
                                {/* 角標 — 雜誌 issue */}
                                <span style={{
                                    position: 'absolute', top: 12, left: 14,
                                    display: 'flex', alignItems: 'baseline', gap: 5,
                                }}>
                                    <Asterisk size={10} color={URBAN.flare} />
                                    <span style={{
                                        fontSize: 12, letterSpacing: '0.24em', fontWeight: 800,
                                        color: onDark(0.55), fontFamily: C.sans,
                                    }}>好友邀請碼</span>
                                </span>
                                {/* QR 小角 */}
                                <QrCode size={18} style={{
                                    position: 'absolute', top: 13, right: 14,
                                    opacity: 0.7,
                                }} />

                                <div style={{
                                    marginTop: 32, marginBottom: 14,
                                    display: 'flex', alignItems: 'baseline',
                                    flexWrap: 'wrap', gap: 0,
                                }}>
                                    <span style={{
                                        fontFamily: C.serif, fontSize: 42, fontWeight: 400,
                                        color: URBAN.smoke, lineHeight: 1,
                                        letterSpacing: '-0.018em',
                                    }}>{realName}</span>
                                    <span style={{
                                        fontFamily: C.serif, fontSize: 42, fontWeight: 400,
                                        color: URBAN.flare, lineHeight: 1, fontStyle: 'italic',
                                        fontVariantNumeric: 'tabular-nums',
                                        letterSpacing: '-0.014em',
                                    }}>#{realDisc}</span>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                    <motion.button
                                        type="button" whileTap={{ scale: 0.95 }}
                                        // ⚠️ 必須用 onClick 且**同步**呼叫 copyToClipboard —
                                        //   iOS WKWebView 對 clipboard 要求 "user gesture 同 tick"，
                                        //   只要中間多了 await / microtask，剪貼簿寫入就會被 reject。
                                        //   原本的 async/await 寫法雖然 hapticTap 會響，但 execCommand
                                        //   執行時 user gesture 已過期 → 按下去沒東西被複製。
                                        onClick={() => {
                                            const ok = copyToClipboard(fullId);
                                            if (ok) {
                                                hapticSuccess();
                                                setFriendCodeCopied(true);
                                                setTimeout(() => setFriendCodeCopied(false), 1800);
                                            } else {
                                                hapticWarning();
                                            }
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                                            background: friendCodeCopied ? URBAN.flare : URBAN.smoke,
                                            color: friendCodeCopied ? '#fff' : URBAN.charcoal,
                                            border: 'none', borderRadius: 999,
                                            cursor: 'pointer', fontFamily: C.sans,
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            transition: 'background .25s ease, color .25s ease',
                                            // iOS WKWebView 需明確允許 user-select 才能讓 execCommand 抓到內容
                                            WebkitUserSelect: 'text', userSelect: 'text',
                                            WebkitTouchCallout: 'default',
                                        }}>
                                        {friendCodeCopied ? '✓ COPIED' : 'COPY'}
                                        {!friendCodeCopied && (
                                            <HandArrow width={14} height={8} color={URBAN.charcoal} strokeWidth={2.5} />
                                        )}
                                    </motion.button>
                                    <span style={{
                                        fontSize: 11, color: onDark(0.55),
                                        fontFamily: C.serif, fontStyle: 'italic',
                                    }}>在 /social 搜尋我</span>
                                </div>
                            </div>
                        </Reveal>

                        {/* ── 輸入好友碼直接邀請 ── 與既有 followed[] 解耦，走後端 /api/social/friends/request */}
                        <Reveal delay={0.04}>
                            <FriendInviteByCode
                                myUserId={getUserId()}
                                colors={{
                                    flare: URBAN.flare,
                                    smoke: URBAN.smoke,
                                    charcoal: URBAN.charcoal,
                                    silverLine: URBAN.silverLine,
                                    onDark,
                                    serif: C.serif,
                                    sans: C.sans,
                                }}
                                onInvited={(uid) => {
                                    setInvitedFriends((p) => p.includes(uid) ? p : [...p, uid]);
                                }}
                            />
                            {invitedFriends.length > 0 && (
                                <p style={{
                                    fontSize: 11, color: URBAN.flare,
                                    marginTop: -8, marginBottom: 16, textAlign: 'center',
                                    fontFamily: C.serif, fontStyle: 'italic',
                                }}>
                                    已送出 {invitedFriends.length} 份好友邀請 — 待對方接受
                                </p>
                            )}
                        </Reveal>

                        {/* 推薦追蹤 —— 後端真實使用者（共同好友＞同運動＞近期活躍＞同城市）。
                            沒有可推薦的人就整區不顯示；理由只寫真的成立的那一條。 */}
                        {Array.isArray(suggestions) && suggestions.length > 0 && (
                            <Reveal delay={0.08}>
                                <div style={{
                                    display: 'flex', alignItems: 'baseline', gap: 8,
                                    marginBottom: 12,
                                }}>
                                    <Asterisk size={11} color={URBAN.flare} />
                                    <span style={{
                                        fontSize: 12, letterSpacing: '0.24em', fontWeight: 800,
                                        color: onDark(0.58), fontFamily: C.sans,
                                    }}>可能認識的人</span>
                                    <span style={{ flex: 1, height: 1, background: onDark(0.12) }} />
                                </div>
                                <div style={{
                                    display: 'flex', gap: 11, overflowX: 'auto',
                                    margin: '0 -24px', padding: '0 24px 14px',
                                    scrollSnapType: 'x mandatory',
                                    scrollbarWidth: 'none',
                                }} className="drvn-no-scrollbar">
                                    {suggestions.map((a, i) => {
                                        const on = followed.includes(a.user_id);
                                        const busy = followBusy === a.user_id;
                                        const avatarOk = a.avatar && /^(data:|https?:|\/)/.test(String(a.avatar));
                                        const sportLabel = a.sport_type === 'run' ? '跑步'
                                            : a.sport_type === 'strength' ? '重訓'
                                                : a.sport_type === 'multi' ? '跑步＋重訓' : '';
                                        return (
                                            <motion.div key={a.user_id}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.18 + Math.min(i, 5) * 0.06, duration: 0.45 }}
                                                style={{
                                                    flexShrink: 0, width: 152, scrollSnapAlign: 'start',
                                                    position: 'relative',
                                                    background: '#1A1718',
                                                    borderRadius: 12, overflow: 'hidden',
                                                    border: `1px solid ${URBAN.silverLine}`,
                                                    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                                                }}>
                                                <div style={{
                                                    height: 132, position: 'relative',
                                                    background: 'linear-gradient(180deg, #2A2627 0%, #1A1718 100%)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    overflow: 'hidden',
                                                }}>
                                                    {avatarOk ? (
                                                        <img src={a.avatar} alt="" loading="lazy" decoding="async"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <span style={{
                                                            fontFamily: C.serif, fontSize: 52, color: URBAN.smoke,
                                                            opacity: 0.85, lineHeight: 1,
                                                        }}>{monogram(a.name)}</span>
                                                    )}
                                                    {sportLabel && (
                                                        <span style={{
                                                            position: 'absolute', top: 9, left: 9,
                                                            fontSize: 11, fontWeight: 800,
                                                            color: '#fff', fontFamily: C.sans,
                                                            background: 'rgba(0,0,0,0.45)',
                                                            backdropFilter: 'blur(8px)',
                                                            WebkitBackdropFilter: 'blur(8px)',
                                                            padding: '3px 6px', borderRadius: 4,
                                                        }}>{sportLabel}</span>
                                                    )}
                                                </div>
                                                <div style={{ padding: '11px 12px 12px' }}>
                                                    <div style={{
                                                        fontFamily: C.serif, fontSize: 18, fontWeight: 400,
                                                        color: URBAN.smoke, lineHeight: 1.1,
                                                        letterSpacing: '-0.012em',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>{a.name}</div>
                                                    <div style={{
                                                        fontSize: 11, color: onDark(0.45),
                                                        marginTop: 3, fontFamily: C.sans,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>#{a.discriminator}{a.city ? ` · ${a.city}` : ''}</div>
                                                    <div style={{
                                                        fontSize: 11, color: onDark(0.55),
                                                        marginTop: 6, lineHeight: 1.35, minHeight: 15,
                                                        fontFamily: C.sans,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>{a.reason || ''}</div>
                                                    <motion.button type="button" whileTap={{ scale: 0.94 }}
                                                        disabled={busy}
                                                        onClick={() => toggleFollow(a.user_id)}
                                                        style={{
                                                            width: '100%', marginTop: 10, minHeight: 44,
                                                            borderRadius: 999, cursor: busy ? 'default' : 'pointer',
                                                            fontSize: 12, fontWeight: 800,
                                                            background: on ? 'transparent' : URBAN.flare,
                                                            color: on ? URBAN.flare : '#fff',
                                                            border: `1.5px solid ${URBAN.flare}`,
                                                            fontFamily: C.sans,
                                                            opacity: busy ? 0.6 : 1,
                                                            display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center', gap: 5,
                                                        }}>
                                                        {on ? '✓ 已追蹤' : '＋ 追蹤'}
                                                    </motion.button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </Reveal>
                        )}
                    </>
                );
            }

            /* ── STEP 8：LAUNCH · 啟動（解鎖模組 + 教學 + 進場） ── */
            case 8: {
                const path = d.training_path;
                const unlocked = APP_MODULES.filter((m) => m.paths.includes(path));
                return (
                    <div style={{ position: 'relative' }}>
                        {/* 背景氛圍光暈已移除 — 維持乾淨極簡背景 */}

                        {/* 真實內容 */}
                        <div style={{ position: 'relative', zIndex: 1 }}>
                        <Masthead index={8} scene="為明天定稿" title="準備啟動" />

                        {/* 送出前最後確認一次：這一週會排什麼、每天吃多少 */}
                        {(() => {
                            const rows = [
                                wantLiftPlan && ['重訓', `每週 ${d.days_per_week} 天`],
                                wantRunPlan && ['跑步', `每週 ${d.run_days_per_week} 趟`],
                                nutritionGoals && ['每天吃', `${nutritionGoals.target_calories.toLocaleString()} 大卡`],
                            ].filter(Boolean);
                            if (!rows.length) return null;
                            return (
                                <Reveal>
                                    <div style={{
                                        padding: '6px 16px', marginBottom: 22, borderRadius: 16,
                                        ...glassMat(false, 16),
                                    }}>
                                        {rows.map(([k, v], i) => (
                                            <div key={k} style={{
                                                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                                                padding: '11px 0',
                                                borderTop: i ? '1px solid rgba(255,255,255,0.08)' : 'none',
                                            }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: onDark(0.6), fontFamily: C.sans }}>{k}</span>
                                                <span style={{
                                                    fontFamily: C.serif, fontSize: 20, color: URBAN.smoke,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Reveal>
                            );
                        })()}

                        {/* 馬克筆大數字 + 解鎖計數 */}
                        <Reveal>
                            <div style={{
                                display: 'flex', alignItems: 'baseline', gap: 14,
                                marginBottom: 22, position: 'relative',
                            }}>
                                <span style={{
                                    position: 'relative', display: 'inline-flex',
                                    width: 90, height: 80,
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <span style={{ position: 'absolute', inset: 0 }}>
                                        <HandCircle width="100%" height="100%" color={URBAN.flare} strokeWidth={4} />
                                    </span>
                                    <span style={{
                                        fontFamily: C.serif, fontSize: 56, color: URBAN.smoke,
                                        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                                        letterSpacing: '-0.03em',
                                    }}>{unlocked.length}</span>
                                </span>
                                <div>
                                    <div style={{
                                        fontFamily: C.serif, fontSize: 18, color: URBAN.smoke,
                                        lineHeight: 1.1, fontStyle: 'italic',
                                    }}>個模組</div>
                                    <div style={{
                                        fontSize: 12, letterSpacing: '0.2em', fontWeight: 800,
                                        color: onDark(0.55), fontFamily: C.sans, marginTop: 4,
                                    }}>已解鎖</div>
                                </div>
                            </div>
                        </Reveal>

                        {/* 解鎖模組 grid */}
                        <Reveal delay={0.08}>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 9, marginBottom: 22,
                            }}>
                                {unlocked.map((m, i) => (
                                    <motion.div
                                        key={m.id}
                                        // ① 入場 spring + ② 邊框 / 陰影呼吸動畫 (只保留呼吸感，不再有流光)
                                        initial={{ opacity: 0, y: 22, scale: 0.92 }}
                                        animate={{
                                            opacity: 1, y: 0, scale: 1,
                                            // 呼吸：邊框 alpha + box-shadow 強度 在 coral 之間慢慢來回
                                            borderColor: [
                                                'rgba(249, 92, 75, 0.22)',
                                                'rgba(249, 92, 75, 0.45)',
                                                'rgba(249, 92, 75, 0.22)',
                                            ],
                                            boxShadow: [
                                                'inset 0 1.5px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.22), 0 0 0 1px rgba(249,92,75,0.06)',
                                                'inset 0 1.5px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.22), 0 0 0 1px rgba(249,92,75,0.18)',
                                                'inset 0 1.5px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.22), 0 0 0 1px rgba(249,92,75,0.06)',
                                            ],
                                        }}
                                        transition={{
                                            opacity: { delay: 0.12 + i * 0.07, type: 'spring', stiffness: 260, damping: 22 },
                                            y:       { delay: 0.12 + i * 0.07, type: 'spring', stiffness: 260, damping: 22 },
                                            scale:   { delay: 0.12 + i * 0.07, type: 'spring', stiffness: 260, damping: 22 },
                                            borderColor: {
                                                duration: 3.8, repeat: Infinity, ease: 'easeInOut',
                                                delay: 0.6 + (i % 4) * 0.4,
                                            },
                                            boxShadow: {
                                                duration: 3.8, repeat: Infinity, ease: 'easeInOut',
                                                delay: 0.6 + (i % 4) * 0.4,
                                            },
                                        }}
                                        whileHover={{ y: -3, scale: 1.025 }}
                                        whileTap={{ scale: 0.96 }}
                                        style={{
                                            position: 'relative',
                                            padding: '14px 13px 12px',
                                            background: 'rgba(255, 255, 255, 0.045)',
                                            border: '1px solid rgba(249, 92, 75, 0.32)',
                                            backdropFilter: 'blur(32px) saturate(150%)',
                                            WebkitBackdropFilter: 'blur(32px) saturate(150%)',
                                            borderRadius: 13,
                                            display: 'flex', flexDirection: 'column', gap: 4,
                                            overflow: 'hidden',
                                        }}>
                                        {/* Emoji — 維持微飄浮 (呼吸感) */}
                                        <motion.span
                                            animate={{ y: [0, -2, 0] }}
                                            transition={{
                                                duration: 3.2 + (i % 3) * 0.4,
                                                repeat: Infinity, ease: 'easeInOut',
                                                delay: Math.min(i, 6) * 0.2,
                                            }}
                                            style={{
                                                fontSize: 24, lineHeight: 1,
                                                display: 'inline-block',
                                            }}>{m.emoji}</motion.span>

                                        <span style={{
                                            fontSize: 13.5, fontWeight: 700,
                                            color: URBAN.smoke, marginTop: 5,
                                            letterSpacing: '0.01em',
                                        }}>{m.name}</span>
                                        <span style={{
                                            fontSize: 11, opacity: 0.62,
                                        }}>{m.desc}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </Reveal>

                        {/* 跳過的模組 — 灰色 */}
                        {APP_MODULES.filter((m) => !m.paths.includes(path)).length > 0 && (
                            <Reveal delay={0.18}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    marginTop: 4, marginBottom: 8,
                                }}>
                                    <span style={{
                                        fontSize: 12, letterSpacing: '0.22em', fontWeight: 800,
                                        color: onDark(0.4), fontFamily: C.sans,
                                    }}>已略過 · 隨時可從設定開啟</span>
                                </div>
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 7,
                                }}>
                                    {APP_MODULES.filter((m) => !m.paths.includes(path)).map((m) => (
                                        <span key={m.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            padding: '5px 9px',
                                            background: 'rgba(245,245,245,0.05)',
                                            border: `1px solid ${URBAN.silverLine}`,
                                            borderRadius: 999,
                                            fontSize: 11, color: onDark(0.5),
                                        }}>
                                            <span style={{ fontSize: 14, opacity: 0.6 }}>{m.emoji}</span>
                                            <span>{m.name}</span>
                                        </span>
                                    ))}
                                </div>
                            </Reveal>
                        )}

                        {/* 新手教學 toggle */}
                        <Reveal delay={0.24}>
                            <div style={{
                                marginTop: 16, padding: '13px 14px',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: `1px solid rgba(255, 255, 255, 0.18)`,
                                boxShadow: 'inset 0 1.5px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.2), 0 12px 36px rgba(0,0,0,0.2)',
                                backdropFilter: 'blur(32px) saturate(150%)',
                                WebkitBackdropFilter: 'blur(32px) saturate(150%)',
                                borderRadius: 12,
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontSize: 12.5, fontWeight: 600, color: URBAN.smoke,
                                    }}>新手教學導覽</div>
                                    <div style={{
                                        fontSize: 11, color: onDark(0.55), marginTop: 2,
                                    }}>進主畫面後逐步帶你看每個功能。</div>
                                </div>
                                <motion.button
                                    type="button" whileTap={{ scale: 0.94 }}
                                    role="switch" aria-checked={wantTutorial}
                                    onClick={() => { hapticTap(); setWantTutorial(!wantTutorial); }}
                                    style={{
                                        width: 50, height: 30, borderRadius: 999,
                                        border: 'none', cursor: 'pointer', position: 'relative',
                                        padding: 0,
                                        background: wantTutorial ? URBAN.flare : 'rgba(245,245,245,0.22)',
                                        boxShadow: wantTutorial
                                            ? `inset 0 0 0 1px ${URBAN.flare}, 0 2px 8px ${URBAN.flare}55`
                                            : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                                        transition: 'background .25s, box-shadow .25s', flexShrink: 0,
                                    }}>
                                    <motion.span
                                        animate={{ x: wantTutorial ? 22 : 2 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                                        style={{
                                            position: 'absolute', top: 3, left: 0,
                                            width: 24, height: 24, borderRadius: '50%',
                                            background: '#fff',
                                            boxShadow: '0 2px 5px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(0,0,0,0.04)',
                                        }}
                                    />
                                </motion.button>
                            </div>
                        </Reveal>

                        {err && <p style={{ color: URBAN.flare, fontSize: 12, marginTop: 12 }}>{err}</p>}
                        </div>
                    </div>
                );
            }
            default: return null;
        }
    };

    /* ── 底部導航（瑞士極簡）── */
    const footer = (
        <div style={{
            flexShrink: 0,
            padding: `14px 24px max(14px, env(safe-area-inset-bottom))`,
            background: 'transparent',
            borderTop: 'none',
            display: 'flex', alignItems: 'center', gap: 10,
            position: 'relative', zIndex: 2,
        }}>
            <AnimatePresence>
                {step > 0 && (
                    <motion.button
                        key="back-btn"
                        type="button" onClick={back}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        whileHover={{ x: -2 }}
                        whileTap={{ scale: 0.94, x: -4 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontSize: 12, color: isDark ? 'rgba(245,245,245,0.6)' : C.mute,
                            padding: '8px 4px',
                        }}>
                        <ArrowLeft size={14} /> 上一步
                    </motion.button>
                )}
            </AnimatePresence>
            {/* 「下一步」按不了時，直接說還缺什麼（以前只是變灰，使用者得自己猜） */}
            <div style={{
                flex: 1, minWidth: 0, textAlign: 'right',
                fontSize: 12, fontWeight: 600, fontFamily: C.sans, lineHeight: 1.3,
                color: 'rgba(245,245,245,0.62)',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }} aria-live="polite">
                {!canNext && missingHint ? missingHint : ''}
            </div>
            <motion.button type="button" onClick={next}
                disabled={!canNext || submitting}
                whileTap={canNext ? { scale: 0.96 } : {}}
                whileHover={canNext ? { scale: 1.03, boxShadow: `0 8px 24px ${URBAN.flare}55` } : {}}
                animate={canNext ? {
                    boxShadow: [
                        `0 4px 14px ${URBAN.flare}33`,
                        `0 6px 22px ${URBAN.flare}66`,
                        `0 4px 14px ${URBAN.flare}33`,
                    ],
                } : { boxShadow: '0 0 0 rgba(0,0,0,0)' }}
                transition={canNext ? {
                    boxShadow: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
                } : {}}
                style={{
                    position: 'relative', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '13px 24px', borderRadius: 999, border: 'none',
                    cursor: canNext && !submitting ? 'pointer' : 'not-allowed',
                    fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
                    background: canNext ? C.brick : 'rgba(185,200,215,0.28)',
                    color: canNext ? '#fff' : (isDark ? URBAN.silver : silverA(0.9)),
                }}>
                {/* 內部 sweep 光帶 — 引導點擊 */}
                {canNext && !submitting && (
                    <motion.span
                        aria-hidden="true"
                        initial={{ x: '-150%' }}
                        animate={{ x: '180%' }}
                        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute', top: 0, bottom: 0, width: '40%',
                            transform: 'skewX(-18deg)',
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                            pointerEvents: 'none',
                        }}
                    />
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
                    {submitting ? (
                        <motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}>
                            生成中…
                        </motion.span>
                    )
                        : step === 0 ? <>開始這一天 <CircleArrowInline /></>
                            : step === TOTAL - 1 ? <>生成計劃 <Asterisk size={13} color="#fff" /></>
                                : <>下一步 <ArrowRight size={14} /></>}
                </span>
            </motion.button>
        </div>
    );

    // 跑步設定頁（full 路線的 run 子頁，或 cardio_only）使用 run5.png 作背景
    const stageBgOverride =
        step === 5 && (d.training_path === 'cardio_only' || (d.training_path === 'full' && step5Sub === 'run'))
            ? '/desktop/run5.png'
            : null;

    return (
        <Stage step={step} dark={isDark} footer={footer} bgOverride={stageBgOverride}>
            {/* 進度條 */}
            {step > 0 && (
                <div style={{
                    position: 'absolute', top: 'env(safe-area-inset-top)', left: 0, right: 0,
                    height: 2.5, background: isDark ? 'rgba(245,245,245,0.1)' : 'rgba(32,32,32,0.08)',
                    zIndex: 4,
                    overflow: 'hidden',
                }}>
                    <motion.div
                        animate={{ width: `${(step / (TOTAL - 1)) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                        style={{
                            height: '100%',
                            // 進度條加 coral 光暈漸層 + 微脈動
                            background: `linear-gradient(90deg, ${C.brick} 0%, ${URBAN.flare} 100%)`,
                            boxShadow: `0 0 8px ${URBAN.flare}88`,
                        }}
                    >
                        {/* 走光點 — 永遠在最右端閃爍，引導下一步 */}
                        <motion.div
                            aria-hidden="true"
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute', top: -1, right: 0,
                                width: 6, height: 4, borderRadius: 4,
                                background: '#fff',
                                boxShadow: `0 0 8px #fff, 0 0 16px ${URBAN.flare}`,
                            }}
                        />
                    </motion.div>
                </div>
            )}
            {/* ✕ 關閉 —— 只給已完成過精靈的使用者（從設定重跑），每一頁都有 */}
            {canClose && (
                <button
                    type="button" onClick={closeWizard} aria-label="關閉"
                    style={{
                        position: 'absolute', top: 'max(env(safe-area-inset-top), 4px)', right: 8,
                        width: 44, height: 44, zIndex: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: isDark ? 'rgba(245,245,245,0.72)' : C.mute,
                    }}>
                    <X size={20} strokeWidth={2} />
                </button>
            )}
            {/* 全域 TopMetaBar — 把 Step 0 的編輯語法延伸到每一頁 */}
            {step > 0 && <TopMetaBar step={step} dark={isDark} />}
            <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                    key={step === 5 && d.training_path === 'full' ? `5-${step5Sub}` : step} custom={dir}
                    // 升級：x slide + blur in + scale，spring physics
                    initial={{ opacity: 0, x: 36 * dir, scale: 0.985, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -24 * dir, scale: 0.985, filter: 'blur(6px)' }}
                    transition={{
                        type: 'spring', stiffness: 240, damping: 26, mass: 0.85,
                        filter: { duration: 0.35, ease: EASE },
                        opacity: { duration: 0.32, ease: EASE },
                    }}
                    style={{ minHeight: '100%' }}
                >
                    {renderInner()}
                </motion.div>
            </AnimatePresence>
        </Stage>
    );
}

/* helper：label 樣式 */
function labelStyle(dark = true) {
    return {
        display: 'block', fontSize: 9, letterSpacing: '0.16em',
        textTransform: 'uppercase', marginBottom: 10,
        color: dark ? 'rgba(245,245,245,0.5)' : C.mute,
    };
}
/* 開場按鈕用的小圓圈箭頭（白色）*/
function CircleArrowInline() {
    return (
        <span style={{
            width: 20, height: 20, borderRadius: '50%',
            border: '1.5px solid #fff', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
        }}>
            <ArrowRight size={11} color="#fff" strokeWidth={2} />
        </span>
    );
}
