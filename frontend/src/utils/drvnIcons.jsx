/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * drvnIcons — emoji → lucide 單色線性圖示的映射（DRVN UIUX Definition §6.3）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 為什麼要有這支：
 *   2026-07-21 稽核在 63 個一級頁面裡找到 920 處 emoji 出現在會被渲染的 UI —
 *   運動別圖示、目標類型、徽章、頭像選項、成就標籤。
 *
 *   emoji 是目前最傷「瑞士極簡」定位的一件事：
 *     · 它是彩色的 —— 直接破壞「一頁一個 Coral」的色彩預算
 *     · 它是別人家的設計語言 —— Apple / Google / Samsung 各畫各的
 *     · 它在不同系統長得不一樣 —— 同一個畫面在兩支手機上是兩種風格
 *     · 它和 Tenor Sans 放在一起像兩個 app 拼起來的
 *
 *   換成 lucide 線性圖示後：單色、可繼承文字顏色階梯、線寬和字重同一套語言。
 *
 * 用法：
 *   import { SportIcon, GoalIcon, iconFor } from '../utils/drvnIcons';
 *
 *   <SportIcon type="run" size={18} />            // 取代 '🏃'
 *   <GoalIcon type="cut" size={16} />             // 取代 '🔥'
 *   const Icon = iconFor('🏋️'); <Icon size={16} /> // 通用回退
 *
 * 鐵律：介面元素一律用這裡的圖示。
 *       唯一例外是極少數敘事型文案（教練說的一句話）。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React from 'react';
import { Footprints, Bike, Mountain, Waves, Activity, Heart, Flame, Zap, Target, TrendingUp, TrendingDown, Trophy, Award, Medal, Timer, Clock, MapPin, Route, Wind, Moon, Sun, Sunrise, Droplets, Utensils, Beef, Wheat, Salad, Apple, Users, User, MessageCircle, Star, Sparkles, Crown, Shield, BarChart3, LineChart, Gauge, Scale, Ruler, CheckCircle2, AlertCircle, Info, Lock, Bell, Calendar, Music, Camera, Settings, Home, Bookmark, Repeat, Snowflake } from 'lucide-react';
import { DrvnLift as Dumbbell } from '../components/ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴

/* ═══════════════════════════════════════════════════════════════════════
   1 · 運動別（取代 CardioTracker / OnboardingWizard 的 🏃🚴⛰️🏊🥾）
   ═══════════════════════════════════════════════════════════════════════ */
export const SPORT_ICONS = {
    run: Footprints,
    running: Footprints,
    cycling: Bike,
    bike: Bike,
    trail: Mountain,
    trail_running: Mountain,
    hike: Mountain,
    hiking: Mountain,
    swim: Waves,
    swimming: Waves,
    strength: Dumbbell,
    fitness: Dumbbell,
    lift: Dumbbell,
    walk: Footprints,
    walking: Footprints,
    yoga: Activity,
    hiit: Zap,
    cardio: Heart,
    other: Activity,
};

export const SportIcon = ({ type, size = 18, strokeWidth = 1.8, ...rest }) => {
    const Icon = SPORT_ICONS[String(type || '').toLowerCase()] || Activity;
    return <Icon size={size} strokeWidth={strokeWidth} {...rest} />;
};

/* ═══════════════════════════════════════════════════════════════════════
   2 · 營養目標類型（取代 NutritionPage 的 🔥⚡💪）
   ═══════════════════════════════════════════════════════════════════════ */
export const GOAL_ICONS = {
    cut: TrendingDown,       // 減脂 —— 往下的趨勢線，比火焰更準確
    recomp: Repeat,          // 體態重塑 —— 交換／重組
    bulk: TrendingUp,        // 增肌 —— 往上的趨勢線
    maintain: Activity,
};

export const GoalIcon = ({ type, size = 18, strokeWidth = 1.8, ...rest }) => {
    const Icon = GOAL_ICONS[String(type || '').toLowerCase()] || Activity;
    return <Icon size={size} strokeWidth={strokeWidth} {...rest} />;
};

/* ═══════════════════════════════════════════════════════════════════════
   3 · 營養素 / 打卡項目（取代 🥩🍽️💧）
   ═══════════════════════════════════════════════════════════════════════ */
export const NUTRIENT_ICONS = {
    protein: Beef,
    carbs: Wheat,
    fats: Droplets,
    fiber: Salad,
    water: Droplets,
    calories: Flame,
    meal: Utensils,
    fruit: Apple,
};

export const NutrientIcon = ({ type, size = 16, strokeWidth = 1.8, ...rest }) => {
    const Icon = NUTRIENT_ICONS[String(type || '').toLowerCase()] || Utensils;
    return <Icon size={size} strokeWidth={strokeWidth} {...rest} />;
};

/* ═══════════════════════════════════════════════════════════════════════
   4 · 器材（取代 LuxuryPlanView 的 🏋️💪⚙️）
   ═══════════════════════════════════════════════════════════════════════ */
export const EQUIPMENT_ICONS = {
    barbell: Dumbbell,
    dumbbell: Dumbbell,
    cable: Settings,
    machine: Settings,
    bodyweight: User,
    band: Activity,
    kettlebell: Dumbbell,
};

export const EquipmentIcon = ({ type, size = 16, strokeWidth = 1.8, ...rest }) => {
    const Icon = EQUIPMENT_ICONS[String(type || '').toLowerCase()] || Dumbbell;
    return <Icon size={size} strokeWidth={strokeWidth} {...rest} />;
};

/* ═══════════════════════════════════════════════════════════════════════
   5 · 通用 emoji → lucide 回退表
   給還沒逐一改寫、但需要立刻脫離 emoji 的舊資料結構用。
   ═══════════════════════════════════════════════════════════════════════ */
export const EMOJI_MAP = {
    '🏃': Footprints, '🏃‍♂️': Footprints, '🏃‍♀️': Footprints, '👟': Footprints,
    '🚴': Bike, '🚵': Bike,
    '⛰️': Mountain, '🏔️': Mountain, '🥾': Mountain,
    '🏊': Waves, '🌊': Waves,
    '🏋️': Dumbbell, '🏋️‍♂️': Dumbbell, '🏋️‍♀️': Dumbbell, '💪': Dumbbell,
    '🧘': Activity, '🤸': Activity,
    '🔥': Flame, '⚡': Zap, '🎯': Target, '📈': TrendingUp, '📉': TrendingDown,
    '🏆': Trophy, '🥇': Medal, '🥈': Medal, '🥉': Medal, '🏅': Medal, '🎖️': Award,
    '⏱️': Timer, '⏰': Clock, '🕒': Clock, '📅': Calendar,
    '📍': MapPin, '🗺️': Route, '💨': Wind,
    '🌙': Moon, '☀️': Sun, '🌅': Sunrise, '🌤️': Sun, '❄️': Snowflake,
    '💧': Droplets, '🍽️': Utensils, '🥩': Beef, '🍞': Wheat, '🥗': Salad, '🍎': Apple,
    '👥': Users, '👤': User, '💬': MessageCircle,
    '⭐': Star, '✨': Sparkles, '👑': Crown, '🛡️': Shield, '💎': Award,
    '📊': BarChart3, '📉📈': LineChart, '⚖️': Scale, '📏': Ruler, '🎚️': Gauge,
    '✅': CheckCircle2, '⚠️': AlertCircle, 'ℹ️': Info, '🔒': Lock, '🔔': Bell,
    '🎵': Music, '🎶': Music, '📷': Camera, '📸': Camera,
    '⚙️': Settings, '🏠': Home, '🔖': Bookmark, '❤️': Heart, '🫀': Heart,
};

/** 通用回退：拿一個 emoji 換一個 lucide 元件（找不到就給 Activity） */
export const iconFor = (emoji) => EMOJI_MAP[emoji] || Activity;

/**
 * <Ico emoji="🔥" /> — 就地替換用。
 * 讓舊的資料表（icon: '🔥'）不必立刻重構就能脫離 emoji。
 */
export const Ico = ({ emoji, size = 16, strokeWidth = 1.8, ...rest }) => {
    const Icon = iconFor(emoji);
    return <Icon size={size} strokeWidth={strokeWidth} {...rest} />;
};

/* ═══════════════════════════════════════════════════════════════════════
   6 · 頭像選項（取代 UserProfileForm 的 emoji 頭像清單）
   使用者選的是「一個代表自己的符號」，用線性圖示同樣成立，
   而且和 app 的其他圖示是同一套語言。
   ═══════════════════════════════════════════════════════════════════════ */
export const AVATAR_ICONS = [
    { id: 'run', Icon: Footprints, label: '跑者' },
    { id: 'lift', Icon: Dumbbell, label: '重訓' },
    { id: 'fire', Icon: Flame, label: '燃燒' },
    { id: 'bolt', Icon: Zap, label: '爆發' },
    { id: 'yoga', Icon: Activity, label: '伸展' },
    { id: 'bike', Icon: Bike, label: '單車' },
    { id: 'night', Icon: Moon, label: '夜練' },
    { id: 'peak', Icon: Mountain, label: '登頂' },
];

export default {
    SportIcon, GoalIcon, NutrientIcon, EquipmentIcon, Ico,
    SPORT_ICONS, GOAL_ICONS, NUTRIENT_ICONS, EQUIPMENT_ICONS, EMOJI_MAP,
    AVATAR_ICONS, iconFor,
};
