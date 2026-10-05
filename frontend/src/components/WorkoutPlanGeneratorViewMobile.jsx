/**
 * WorkoutPlanGeneratorViewMobile  v4
 * Steps: 0=體能基礎  1=偏好設定  2=生成計劃總覽 (支援展開自訂動作與調整)
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sparkles, CheckCircle2, Edit2, Plus, X, TrendingUp, ChevronRight, Check, Info, Trash2, MoreHorizontal, Shield, Lightbulb, ArrowLeftRight } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import {
    MUSCLES, CATEGORY_LIMITS,
    conductBaselineAssessment, generateUnifiedPlan,
    autoDetectSessionDuration, autoDetectSplitType,
    ALL_EXERCISES_MAP, ALL_EXERCISES,
    estimateDayMinutes,
    getLevelCode,
    recommendAlternatives, STRICT_BW_PULLS,
} from '../utils/UnifiedTrainingEngine';
import { SwapChooserSheet } from './SeasonChangeList';
import BaselineTestFlow from './BaselineTestUI';
import FirstTimeHint from './FirstTimeHint';
import { computeStrengthForecast, getLatestInbody } from '../utils/strengthOutcomeForecast';
import { ExerciseDetailSheet as RichExerciseDetailSheet } from './WorkoutPreviewSheet';
import apiClient from '../api/client';
import WeekScheduleStrip from './WeekScheduleStrip';
import { haptic } from '../utils/haptics';
import { canUse, openPaywall } from '../utils/membership';
import { loadGymMemory, customGyms, adaptPlanForGym } from '../utils/gymMemory';
import MemberLockCard from './MemberLockCard';
import { activateStrengthPlan } from '../utils/strengthPlanCompletion';
import { activateProgram, newProgramId, withExistingRunSchedule } from '../utils/trainingProgram';
import { findExerciseByName, getExerciseNameZh } from '../utils/exerciseDB';
import { getUserId } from '../utils/auth';
import { uGet, uStorage } from '../utils/userStorage';
import { suggestNextFocus } from '../utils/seasonTransition';
import { markReviewed } from '../utils/trainingFocus';   // 換部位重排：新計劃啟用後才標記收官看過
import {
    getFocusOption, checkWeeklyLoad, loadTrainingFocus,
    readWeeklyRunSessions, readRunPlanStrengthSessions,
    readStrengthWeekdays, weekdaysZh, WEEKDAY_LABEL,
} from '../utils/trainingFocus';
import { defaultStrengthWeekdays, previewWeek, runTypeZh } from '../utils/dailyAgenda';
import { previewSplitFocus } from '../utils/planNaming';
import { recordFirst, recordPlanLive } from '../utils/momentEngine';
import { takeRedesignSnapshot, readRedesignSnapshot, clearRedesignSnapshot, summarizeRedesign } from '../utils/planRedesignDiff';   // 換部位重排：回收官頁說明改了什麼
import DataPulse from './ui/DataPulse';
import { brandColors as C } from '../utils/colors';
import { toast } from '../utils/toast';

// --- DESIGN TOKENS ---
const BG      = C.paper; 
const ORANGE  = C.coral; 
const MUTED   = 'var(--text-muted, rgba(22, 20, 21, 0.45))';
const DAY_COLORS = [C.coral, C.coral, C.coral, C.coral]; 
const PEEK_HEIGHT = 115;  
const TOTAL_STEPS = 3;

const CARD    = 'var(--card-bg, rgba(22, 20, 21, 0.04))';
const DARK    = 'var(--text-dark, #161415)';
const color   = MUTED;
const BORDER  = 'var(--border-color, rgba(22, 20, 21, 0.10))';
const BEIGE   = C.paper2; // Stone

const GLASS_STYLE = {
    background: 'rgba(22, 20, 21, 0.04)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(22, 20, 21, 0.10)',
    borderRadius: 18,
};

const INNER_GLASS = {
    background: 'rgba(255, 255, 255, 0.35)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
    border: '1px solid rgba(255, 255, 255, 0.5)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.6)',
    borderRadius: 24,
};

// 步驟主題 (步驟 2 替換為金屬材質)
const STEP_THEMES = [
    { bg: '#0B0A0A', bgImg: null, text: C.paper, headerText: C.paper, mode: 'dark' },
    { bg: C.paper2, bgImg: null, text: C.ink, headerText: C.ink, mode: 'light' },
    { bg: '#8C8C8C', bgImg: '/desktop/11.jpeg', text: C.ink, headerText: C.ink, mode: 'metal' },
];

// Liquid Glass Design System (iOS 26 Spec)
// 落實 .tint(Color) 與 .interactive()，嚴格禁用 Opaque Background
const getLiquidGlassStyle = (isActive, mode = 'dark', isProminent = false) => {
    const isLight = mode === 'light' || mode === 'metal';
    
    // 基礎玻璃材質 (.regular)：淺色底加白霧 + 細墨邊，讓卡片邊界清楚
    const baseGlass = isLight ? 'rgba(255, 255, 255, 0.55)' : 'rgba(30, 30, 30, 0.25)';
    const baseBorder = isLight ? 'rgba(22, 20, 21, 0.10)' : 'rgba(255, 255, 255, 0.1)';

    // 染色玻璃材質 (.tint)：淺色底要用飽和 coral，否則白字會糊在粉色上
    const tintGlass = isLight
        ? 'linear-gradient(145deg, rgba(249, 92, 75, 0.94) 0%, rgba(217, 64, 48, 0.94) 100%)'
        : 'rgba(249, 92, 75, 0.35)';
    const tintBorder = 'rgba(249, 92, 75, 1)';

    // 主按鈕高亮材質 (.glassProminent)
    const prominentGlass = 'rgba(249, 92, 75, 0.5)';

    return {
        background: isProminent ? prominentGlass : (isActive ? tintGlass : baseGlass),
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: `1.5px solid ${isProminent || isActive ? tintBorder : baseBorder}`,
        boxShadow: isActive || isProminent
            ? (isLight
                ? '0 10px 28px rgba(217,64,48,0.32), inset 0 1px 0 rgba(255,255,255,0.35)'
                : '0 12px 40px rgba(249,92,75,0.35), inset 0 2px 6px rgba(255,255,255,0.4)')
            : (isLight
                ? 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 10px rgba(22,20,21,0.06)'
                : 'inset 0 1px 2px rgba(255,255,255,0.15), 0 4px 16px rgba(0,0,0,0.05)'),
        borderRadius: 24, // Bento Box 統一倒角
        color: isLight && !isActive && !isProminent ? C.ink : C.paper,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden'
    };
};

// TAG COLORS PER CATEGORY
const TAG_COLORS = {
    problems: { bg: 'rgba(249,92,75,0.08)', activeBg: C.coral, border: 'rgba(249,92,75,0.20)', activeBorder: C.coral, text: C.coralDeep, activeText: C.white },
    muscles:  { bg: 'rgba(22,20,21,0.05)',  activeBg: C.ink, border: 'rgba(22,20,21,0.15)',  activeBorder: C.ink, text: C.ink, activeText: C.paper },
    physique: { bg: 'rgba(217,64,48,0.06)', activeBg: C.coralDeep, border: 'rgba(217,64,48,0.18)', activeBorder: C.coralDeep, text: C.coralDeep, activeText: C.white },
};

// EXERCISE LIBRARY FOR PICKER
const EXERCISE_LIBRARY = {
    Chest: ['Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Barbell Press', 'Incline Dumbbell Press', 'Chest Dips', 'Push Ups', 'Cable Crossover', 'Pec Deck Fly', 'Dumbbell Fly'],
    Back: ['Deadlift', 'Barbell Row', 'Pull Ups', 'Chin Ups', 'Wide Grip Lat Pulldown', 'Seated Cable Row', 'Single Arm Dumbbell Row', 'T-Bar Row', 'Straight Arm Pulldown', 'Hyperextensions'],
    Shoulders: ['Barbell Overhead Press', 'Dumbbell Overhead Press', 'Arnold Press', 'Dumbbell Lateral Raise', 'Cable Lateral Raise', 'Front Raise', 'Reverse Pec Deck', 'Face Pulls'],
    Arms: ['Barbell Bicep Curl', 'Dumbbell Bicep Curl', 'Hammer Curls', 'Preacher Curls', 'Skull Crushers', 'Tricep Pushdown', 'Rope Pushdown', 'Overhead Tricep Extension', 'Tricep Dips'],
    Legs: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Goblet Squat', 'Bulgarian Split Squat', 'Walking Lunges', 'Hip Thrusts', 'Glute Bridge', 'Calf Raises', 'Leg Extensions', 'Lying Leg Curls'],
    Core: ['Plank', 'Ab Wheel Rollout', 'Hanging Leg Raise', 'Cable Crunch', 'Russian Twists', 'Bicycle Crunches', 'Leg Raises', 'Dead Bug', 'Side Plank', 'V-Up'],
};

const guessMuscleName = (name) => {
    const n = name.toLowerCase();
    if (n.includes('bench') || n.includes('chest') || n.includes('dip') || n.includes('push up') || n.includes('fly') || n.includes('crossover')) return 'chest';
    if (n.includes('deadlift') || n.includes('row') || n.includes('pull') || n.includes('lat') || n.includes('hyper')) return 'back';
    if (n.includes('overhead press') || n.includes('lateral') || n.includes('arnold') || n.includes('face pull') || n.includes('front raise') || n.includes('pec deck')) return 'shoulders';
    if (n.includes('curl') || n.includes('hammer') || n.includes('preacher')) return 'biceps';
    if (n.includes('skull') || n.includes('pushdown') || n.includes('tricep') || n.includes('rope push')) return 'triceps';
    if (n.includes('squat') || n.includes('lunge') || n.includes('leg press') || n.includes('leg ext')) return 'quads';
    if (n.includes('romanian') || n.includes('leg curl') || n.includes('sumo')) return 'hamstrings';
    if (n.includes('hip thrust') || n.includes('glute') || n.includes('kickback')) return 'glutes';
    if (n.includes('calf')) return 'calves';
    if (n.includes('plank') || n.includes('crunch') || n.includes('ab ') || n.includes('leg raise') || n.includes('rollout') || n.includes('dead bug') || n.includes('v-up')) return 'core';
    return 'general';
};

// ── 胸/背 平衡提示：偵測使用者選了其一卻漏掉另一 ──
// 回傳 { missing: 'chest'|'back', present } 或 null
const detectBalanceGap = (plan) => {
    const tags = (plan?.selected_hashtags || []).map(t => String(t).toLowerCase());
    const hasChest = tags.includes('chest');
    const hasBack = tags.includes('back');
    if (hasBack && !hasChest) return { missing: 'chest', present: 'back' };
    if (hasChest && !hasBack) return { missing: 'back', present: 'chest' };
    return null;
};

// 為缺少的肌群挑一個最合適的「複合動作」（依器材/等級篩選，優先 Tier 低=大重量）
const pickCompoundFor = (muscle, plan, existingNames = new Set()) => {
    const equipment = plan?.equipment_preference || 'mixed';
    const level = plan?.user_level || 'beginner';
    const pool = (ALL_EXERCISES || [])
        .filter(e => e.muscle === muscle)
        .filter(e => e.cat === 'compound' || e.tier <= 2) // 複合為主
        .filter(e => !existingNames.has(e.name))
        .filter(e => (level !== 'beginner' || (e.diff ?? 0) < 3))
        .filter(e => {
            if (equipment === 'bodyweight') return e.eq === 'bodyweight' || e.eq === 'band';
            return true;
        })
        .sort((a, b) => (a.tier - b.tier) || ((a.diff ?? 0) - (b.diff ?? 0)));
    return pool[0] || (ALL_EXERCISES || []).find(e => e.muscle === muscle && !existingNames.has(e.name)) || null;
};

// 與引擎一致的肌群排序權重（下肢 > 胸/肩 > 背 > 臂 > 核心）
const MUSCLE_PRIORITY = {
    quads: 1, hamstrings: 1, glutes: 1, calves: 1,
    chest: 2, shoulders: 2, back: 3, biceps: 4, triceps: 4, core: 5,
};
// 把單一新動作插入正確位置：熱身永遠最前；主訓練先依肌群分群（依原始出現順序＋權重），
// 群內再依 Tier 排序，確保同肌群動作聚在一起、且大重量(T1)在前。
const insertOrdered = (exList, newEx) => {
    const warm = exList.filter(e => e.isWarmup);
    const main = exList.filter(e => !e.isWarmup);
    const combined = [...main, newEx];
    // 各肌群在「原本動作」中的首次出現位置（新動作沿用既有群組順序）
    const firstSeen = {};
    main.forEach((e, i) => { if (firstSeen[e.muscle] === undefined) firstSeen[e.muscle] = i; });
    const groupKey = (m) => firstSeen[m] !== undefined
        ? firstSeen[m]                      // 既有群組：維持原順序
        : 1000 + (MUSCLE_PRIORITY[m] || 99); // 全新群組：依權重排到後段
    const idxOf = combined.map((e, i) => i);
    idxOf.sort((a, b) => {
        const ea = combined[a], eb = combined[b];
        const ga = groupKey(ea.muscle), gb = groupKey(eb.muscle);
        if (ga !== gb) return ga - gb;
        const ta = ea.tier || 3, tb = eb.tier || 3;
        if (ta !== tb) return ta - tb;
        return a - b; // 穩定：維持原相對順序
    });
    return [...warm, ...idxOf.map(i => combined[i])];
};

// 找出最適合插入該肌群動作的「那一天」：已含該肌群動作最多的日（其次：含拮抗肌群的日）
const findTargetDayIdx = (days, muscle, antagonist) => {
    let best = -1, bestScore = -1;
    days.forEach((day, i) => {
        const ex = (day.exercises || []).filter(e => !e.isWarmup);
        const sameCnt = ex.filter(e => e.muscle === muscle).length;
        const antaCnt = ex.filter(e => e.muscle === antagonist).length;
        const score = sameCnt * 10 + antaCnt; // 優先同肌群最多的日
        if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
};

// MUSCLE CHIP COLORS
const MC = (m = '') => {
    const k = m.toLowerCase();
    // 淺色卡片底上的高對比標籤：淡色填底 + 飽和深色文字 + 同色系邊框
    if (k.includes('chest')) return { bg: 'rgba(193,74,74,0.14)', text: '#A83232', border: 'rgba(168,50,50,0.35)' };
    if (k.includes('back')) return { bg: 'rgba(204,85,20,0.14)', text: '#B5491C', border: 'rgba(181,73,28,0.35)' };
    if (k.includes('shoulder')) return { bg: 'rgba(191,142,20,0.16)', text: '#946C0E', border: 'rgba(148,108,14,0.35)' };
    if (k.includes('quad') || k.includes('leg') || k.includes('glute') || k.includes('hamstring') || k.includes('calv')) return { bg: 'rgba(95,128,64,0.16)', text: '#4F6E3A', border: 'rgba(79,110,58,0.35)' };
    if (k.includes('bicep') || k.includes('tricep') || k.includes('arm')) return { bg: 'rgba(191,142,20,0.16)', text: '#946C0E', border: 'rgba(148,108,14,0.35)' };
    if (k.includes('core') || k.includes('ab')) return { bg: 'rgba(70,70,70,0.12)', text: '#3A3A3A', border: 'rgba(58,58,58,0.3)' };
    return { bg: 'rgba(70,70,70,0.10)', text: '#3A3A3A', border: 'rgba(58,58,58,0.25)' };
};

// 依「部位」對應的 emoji — 沒有照片時的縮圖 fallback
const MUSCLE_EMOJI = (ex = {}) => {
    const k = `${ex.muscle || ''} ${ex.zone || ''} ${ex.name || ''}`.toLowerCase();
    if (/chest|pec|bench|臥推|胸/.test(k)) return '🫀';      // 胸
    if (/back|lat|row|pull|deadlift|划船|引體|背|硬舉/.test(k)) return '🪽'; // 背
    if (/shoulder|delt|press|raise|肩/.test(k)) return '🏔️'; // 肩
    if (/bicep|二頭|curl/.test(k)) return '💪';              // 二頭
    if (/tricep|三頭|pushdown|extension|skull/.test(k)) return '🦾'; // 三頭
    if (/quad|squat|股四頭|lunge|leg press|extension/.test(k)) return '🦵'; // 股四頭
    if (/glute|臀|thrust|bridge|kickback|hydrant/.test(k)) return '🍑'; // 臀
    if (/hamstring|腿後|nordic|leg curl|rdl|romanian/.test(k)) return '🦿'; // 腿後
    if (/calf|calves|小腿/.test(k)) return '🦶';             // 小腿
    if (/core|ab|腹|核心|plank|crunch|wheel|rollout|raise/.test(k)) return '🔥'; // 核心
    if (/cardio|run|warm/.test(k)) return '🏃';              // 暖身/有氧
    return '🏋️';                                            // 預設
};

// ZONE 與 中文部位名稱對照表
const ZONE_ZH = {
    'chest-mid': '中胸', 'chest-upper': '上胸', 'chest-lower': '下胸',
    'back-lats': '背闊', 'back-mid': '背厚', 'back-lower': '下背',
    'shoulders-press': '三角肌', 'shoulders-lateral': '中束',
    'shoulders-rear': '後束', 'shoulders-front': '前束',
    'biceps': '二頭', 'triceps': '三頭',
    'quads-squat': '股四頭', 'quads-iso': '股四頭',
    'hamstrings-hinge': '腿後側', 'hamstrings-iso': '腿後側',
    'glutes-thrust': '臀大肌', 'glutes-iso': '臀大肌', 'glutes-abduct': '臀中肌',
    'calves': '小腿', 'core': '核心',
};

const EQ_LABEL = {
    barbell:    '槓鈴',
    dumbbell:   '啞鈴',
    cable:      '繩索',
    machine:    '器械',
    bodyweight: '徒手',
    band:       '彈力帶',
    kettlebell: '壺鈴',
};

const ExerciseRowWithPhoto = React.memo(({ ex, exIdx, activeWeek, dIdx, setDetailTarget, onShowInfo, handleDelete, onSwap }) => {
    const [thumb, setThumb] = useState(null);
    const dragControls = useDragControls();

    useEffect(() => {
        let cancelled = false;
        findExerciseByName(ex.nameEn || ex.name).then(data => {
            if (!cancelled && data?.imageUrls?.length) setThumb(data.imageUrls[0]);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [ex.name, ex.nameEn]);

    const zoneLabel = ZONE_ZH[ex.zone] || null;
    const eqLabel   = EQ_LABEL[ex.eq] || null;
    const badgeText = [zoneLabel, eqLabel].filter(Boolean).join(' · ');
    const mc = MC(ex.muscle || '');

    return (
        <Reorder.Item value={ex} dragListener={false} dragControls={dragControls} style={{ listStyle: 'none' }}>
            <div
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 單擊 → 豐富資訊卡 (目標肌群/動作說明/中英)
                    onShowInfo?.({ ex, wIdx: activeWeek, dIdx, exIdx });
                }}
                onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 雙擊 → 編輯數值卡 (組數/次數/休息/器材)
                    setDetailTarget({ ex, wIdx: activeWeek, dIdx, exIdx });
                }}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px 12px 10px', borderRadius: 18,
                    background: 'rgba(255, 255, 255, 0.4)',
                    backdropFilter: 'blur(40px) saturate(200%)',
                    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.05), inset 0 2px 4px rgba(255,255,255,0.8)',
                    marginBottom: 10, cursor: 'pointer', userSelect: 'none',
                }}>
                {/* 拖曳圖示 (手機可觸控) */}
                <div onPointerDown={e => dragControls.start(e)} style={{ fontSize: 14, color: 'rgba(22,20,21,0.3)', flexShrink: 0, padding: '10px 8px', cursor: 'grab', touchAction: 'none' }}>⣿</div>

            {/* 動作縮圖 */}
            <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
                background: 'rgba(22,20,21,0.05)', border: '1px solid rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>
                {thumb
                    ? <img loading="lazy" decoding="async" src={thumb} alt={ex.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 24 }} role="img" aria-label={ex.muscle || '動作'}>{MUSCLE_EMOJI(ex)}</span>
                }
            </div>

            {/* 動作名稱與組數次數 */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* 自己換過的動作：名稱用珊瑚色，一眼看得出哪些是換進來的 */}
                <div style={{
                    fontSize: 15, fontWeight: 800, color: ex._swappedFrom ? C.coral : C.ink, letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                    {getExerciseNameZh(ex.name)}
                </div>
                {/* 幾組幾次 */}
                <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(22,20,21,0.5)', letterSpacing: '0.1em', marginTop: 3 }}>
                    {ex.sets} 組 · {ex.isDropSet ? '遞減 ' : ''}{String(ex.reps ?? '').replace(/\s*->\s*/g, '→')} 次 {ex.rest ? `· ${ex.rest}` : ''}
                </div>
                {/* 分類與器材標籤 */}
                {badgeText && (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', marginTop: 5,
                        padding: '3px 9px', borderRadius: 99,
                        background: mc.bg, border: `1px solid ${mc.border}`,
                    }}>
                        <span style={{
                            fontSize: 9, fontWeight: 800, color: mc.text,
                            textTransform: 'uppercase', letterSpacing: '0.06em'
                        }}>
                            {badgeText}
                        </span>
                    </div>
                )}
            </div>

            {/* 換動作：同部位的其他動作，不用刪掉再從頭找、也不會被推去練別的部位 */}
            {onSwap && (
                <motion.button whileTap={{ scale: 0.9 }} aria-label={`換掉${getExerciseNameZh(ex.name)}`}
                    onClick={e => { e.stopPropagation(); haptic('light'); onSwap({ ex, dIdx, exIdx }); }}
                    style={{ minWidth: 44, height: 44, padding: '0 10px', borderRadius: 12, background: 'rgba(22,20,21,0.06)', border: '1px solid rgba(22,20,21,0.12)', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 800 }}>
                    <ArrowLeftRight size={15} /> 換
                </motion.button>
            )}
            {/* 刪除按鈕 */}
            <motion.button whileTap={{ scale: 0.9 }} aria-label={`刪除${getExerciseNameZh(ex.name)}`}
                onClick={e => { e.stopPropagation(); handleDelete(activeWeek, dIdx, exIdx); }}
                style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249, 92, 75, 0.2)', border: '1px solid rgba(249, 92, 75, 0.1)', color: C.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <Trash2 size={16} />
            </motion.button>
            </div>
        </Reorder.Item>
    );
});

// Swiss 瑞士極簡風分類小標
const SLabel = ({ children, mode }) => {
    const isLight = mode === 'light' || mode === 'metal';
    return (
        <p style={{
            fontSize: 12, fontWeight: 900, color: isLight ? C.ink : C.paper, opacity: 0.78,
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, marginTop: 24,
            fontFamily: 'var(--font-body)'
        }}>{children}</p>
    );
};

const TagChip = ({ id, info, isSelected, onToggle, category = 'problems' }) => {
    const c = TAG_COLORS[category] || TAG_COLORS.problems;
    return (
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => onToggle(id)}
            style={{
                display: 'inline-flex', alignItems: 'center', padding: '9px 18px', borderRadius: 99,
                margin: '0 8px 8px 0',
                border: `1.5px solid ${isSelected ? c.activeBorder : c.border}`,
                background: isSelected ? c.activeBg : c.bg,
                cursor: 'pointer', transition: 'all 0.2s'
            }}>
            {isSelected && <Check size={11} color={c.activeText} style={{ marginRight: 5, flexShrink: 0 }} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? c.activeText : c.text, letterSpacing: '0.02em' }}>
                {info.label}
            </span>
        </motion.button>
    );
};

//  EXERCISE PICKER MODAL 
const ExercisePicker = ({ onSelect, onClose }) => {
    const [cat, setCat] = useState(null);
    const cats = Object.keys(EXERCISE_LIBRARY);

    useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = originalStyle; };
    }, []);

    const modalContent = (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}>
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                onClick={e => e.stopPropagation()}
                style={{ width: 'calc(100% - 32px)', maxWidth: 430, background: C.paper, borderRadius: '24px', height: 560, maxHeight: '85dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
                <div style={{ padding: '24px 24px 16px', borderBottom: `2px solid #161415`, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    {cat && <motion.button {...pressProps('row')} onClick={() => setCat(null)} style={{ width: 40, height: 40, borderRadius: '50%', background: 'transparent', border: '1px solid rgba(22,20,21,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={20} color={C.ink} /></motion.button>}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{cat || 'CATEGORIES'}</div>
                        <div style={{ fontSize: 9, color: 'rgba(22,20,21,0.5)', fontWeight: 800, letterSpacing: '0.15em', marginTop: 6, textTransform: 'uppercase' }}>{cat ? 'SELECT EXERCISE' : 'SELECT MUSCLE GROUP'}</div>
                    </div>
                    <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', background: C.ink, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={20} color={C.paper} /></motion.button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 30px' }}>
                    {!cat ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {cats.map((c, i) => (
                                <motion.button key={c} whileTap={{ scale: 0.98 }} onClick={() => setCat(c)}
                                    style={{ padding: '24px 0', borderBottom: `1px solid rgba(22,20,21,0.1)`, background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 22, fontWeight: 900, color: C.ink, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>{c}</span>
                                    <ChevronRight size={20} color="rgba(22,20,21,0.3)" />
                                </motion.button>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {EXERCISE_LIBRARY[cat].map(name => (
                                <motion.button key={name} whileTap={{ scale: 0.98 }} onClick={() => onSelect(name)}
                                    style={{ padding: '24px 0', borderBottom: `1px solid rgba(22,20,21,0.1)`, background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                                    <div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{getExerciseNameZh(name)}</div>
                                        {getExerciseNameZh(name) !== name && (
                                            <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', fontWeight: 600, marginTop: 2 }}>{name}</div>
                                        )}
                                        {(() => {
                                            const eng = ALL_EXERCISES_MAP?.[name];
                                            const s = eng?.sets ?? 3;
                                            const r = eng?.reps ?? '10-12';
                                            const rest = eng?.rest ?? '90s';
                                            const eq = eng?.eq ?? 'dumbbell';
                                            return (
                                                <div style={{ fontSize: 12, color: 'rgba(22,20,21,0.5)', marginTop: 6, fontWeight: 800, letterSpacing: '0.15em' }}>
                                                    {s} 組 · {r} 次 · {rest} · {eq}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <Plus size={20} color={C.ink} />
                                </motion.button>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );

    return createPortal(modalContent, document.body);
};

// \u2500\u2500\u2500 PICKER OPTIONS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const FIELD_OPTIONS = {
    sets: ['1', '2', '3', '4', '5', '6'],
    reps: ['5', '6', '8', '5-8', '6-10', '8-12', '10-12', '12-15', '12-20', '15-20', '20+'],
    rest: ['30s', '45s', '60s', '90s', '120s', '150s', '180s'],
    eq:   ['bodyweight', 'dumbbell', 'barbell', 'cable', 'band', 'machine', 'kettlebell'],
    time: ['2', '3', '4', '5', '6', '7', '8', '10'],
};
const FIELD_LABELS = { sets: '組數', reps: '次數', rest: '休息', eq: '器材', time: '時間 (min)' };

// \u2500\u2500\u2500 EXERCISE DETAIL SHEET \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const ExerciseDetailSheet = ({ target, onClose, onPickerOpen, onUpdate }) => {
    const [localEx,     setLocalEx]     = useState(null);
    const [dirty,       setDirty]       = useState(false);
    const [activeField, setActiveField] = useState(null);
    const [allImgs,     setAllImgs]     = useState([]);
    const [imgIdx,      setImgIdx]      = useState(0);

    useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = originalStyle; };
    }, []);

    useEffect(() => {
        if (target?.ex) {
            setLocalEx({ ...target.ex });
            setDirty(false);
            setActiveField(null);
            setAllImgs([]);
            setImgIdx(0);
            findExerciseByName(target.ex.nameEn || target.ex.name).then(data => {
                if (data?.imageUrls?.length) setAllImgs(data.imageUrls);
            }).catch(() => {});
        }
    }, [target]);

    if (!target || !localEx) return null;

    const handlePick = (field, value) => {
        setLocalEx(prev => ({ ...prev, [field]: value }));
        setDirty(true);
        setActiveField(null);
    };
    const handleSave = () => { if (dirty && onUpdate) onUpdate(localEx); onClose(); };

    const Cell = ({ label, field, value, wide = false }) => {
        const active = activeField === field;
        return (
            <motion.div whileTap={{ scale: 0.97 }}
                onClick={() => setActiveField(p => p === field ? null : field)}
                style={{
                    flex: wide ? 2 : 1, padding: wide ? '14px 18px' : '16px 8px',
                    textAlign: wide ? 'left' : 'center', cursor: 'pointer',
                    background: active ? C.ink : 'transparent',
                    transition: 'background 0.12s',
                }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.26em', textTransform: 'uppercase', color: active ? 'rgba(246,244,241,0.45)' : 'rgba(22,20,21,0.35)', marginBottom: 7 }}>
                    {label}
                </div>
                <div style={{ fontSize: wide ? 15 : 24, fontWeight: 900, color: active ? C.paper : C.ink, letterSpacing: wide ? '0.03em' : '-0.02em', fontFamily: 'var(--font-body)', lineHeight: 1 }}>
                    {value || '無'}
                </div>
            </motion.div>
        );
    };

    const modalContent = (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => { if (activeField) setActiveField(null); else handleSave(); }}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                onClick={e => e.stopPropagation()}
                style={{ width: 'calc(100% - 32px)', maxWidth: 430, background: C.paper, borderRadius: '24px', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>

                {/* Hero image */}
                {allImgs.length > 0 && (
                    <div style={{ position: 'relative', height: 196, overflow: 'hidden', flexShrink: 0, background: C.paper2 }}>
                        <motion.img key={imgIdx} src={allImgs[imgIdx]} alt={localEx.name}
                            initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: 72, background: 'linear-gradient(to top, #F6F4F1, transparent)' }} />
                        {allImgs.length > 1 && (
                            <>
                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i + 1) % allImgs.length); }}
 style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', background: 'rgba(22,20,21,0.4)', border: 'none', cursor: 'pointer', color: C.paper, fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    ❯
                                </motion.button>
                                <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                                    {allImgs.map((_, di) => (
                                        <button key={di} onClick={(e) => { e.stopPropagation(); setImgIdx(di); }}
                                            style={{ width: di === imgIdx ? 16 : 4, height: 4, borderRadius: 99, background: di === imgIdx ? C.ink : C.sand, border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s' }} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

                    {/* Name + meta */}
                    <div style={{ padding: '16px 20px 0' }}>
                        {localEx.muscle && (
                            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.coral, borderBottom: '1px solid #F95C4B', paddingBottom: 2 }}>
                                {localEx.muscle}
                            </span>
                        )}
                        <h2 style={{ fontSize: 26, fontWeight: 900, color: C.ink, margin: '8px 0 3px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                            {localEx.name}
                        </h2>
                        <p style={{ fontSize: 9, color: 'rgba(22,20,21,0.38)', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 16px' }}>
                            {localEx.cat === 'compound' ? 'Compound' : localEx.cat === 'isolation' ? 'Isolation' : 'Corrective'}
                            {localEx.tier ? ` · Tier ${localEx.tier}` : ''}
                        </p>
                    </div>

                    {/* Swiss stat grid with hairline borders */}
                    <div style={{ margin: '0 20px 10px', border: '1.5px solid #CFC6B8', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', borderBottom: '1px solid #CFC6B8' }}>
                            <Cell label="SETS" field="sets" value={localEx.sets} />
                            <div style={{ width: 1, background: C.sand, flexShrink: 0 }} />
                            <Cell label="REPS" field="reps" value={localEx.reps} />
                            <div style={{ width: 1, background: C.sand, flexShrink: 0 }} />
                            <Cell label="REST" field="rest" value={localEx.rest ? `${localEx.rest}` : '無'} />
                        </div>
                        <div style={{ display: 'flex' }}>
                            <Cell label="器材 Equipment" field="eq" value={localEx.eq} wide />
                            <div style={{ width: 1, background: C.sand, flexShrink: 0 }} />
                            <Cell label="時間 Duration" field="time" value={localEx.time ? `${localEx.time} min` : '無'} wide />
                        </div>
                    </div>

                    {/* Mini picker tray */}
                    <AnimatePresence>
                        {activeField && (
                            <motion.div key={activeField}
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                                transition={{ duration: 0.15 }}
                                style={{ margin: '0 20px 10px', background: C.paper2, border: '1px solid #CFC6B8', borderRadius: 6, padding: '12px 14px' }}>
                                <div style={{ fontSize: 9, fontWeight: 900, color: C.coral, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 10 }}>
                                    {FIELD_LABELS[activeField]}
                                </div>
                                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
                                    {(FIELD_OPTIONS[activeField] || []).map(opt => {
                                        const isSel = String(localEx[activeField]) === String(opt);
                                        return (
                                            <motion.button key={opt} whileTap={{ scale: 0.93 }}
                                                onClick={() => handlePick(activeField, opt)}
                                                style={{ flexShrink: 0, padding: '8px 16px', border: `1.5px solid ${isSel ? C.ink : C.sand}`, background: isSel ? C.ink : 'transparent', color: isSel ? C.paper : C.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderRadius: 4 }}>
                                                {opt}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Action buttons  Swiss full-width split */}
                    <div style={{ display: 'flex', margin: '0 20px 40px', border: '1.5px solid #161415', borderRadius: 6, overflow: 'hidden' }}>
                        <motion.button whileTap={{ scale: 0.98 }} onClick={onClose}
                            style={{ flex: 1, padding: '16px 0', background: 'transparent', border: 'none', borderRight: '1px solid #161415', color: C.ink, fontSize: 13, fontWeight: 900, cursor: 'pointer', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                            關閉
                        </motion.button>
                        <motion.button whileTap={dirty ? { scale: 0.98 } : {}}
                            onClick={dirty ? handleSave : undefined}
                            style={{ flex: 2, padding: '16px 0', background: C.ink, border: 'none', color: C.paper, fontSize: 12, fontWeight: 900, cursor: dirty ? 'pointer' : 'default', letterSpacing: '0.14em', textTransform: 'uppercase', opacity: dirty ? 1 : 0.85 }}>
                            {dirty ? '確認修改' : '點擊上方數值修改'}
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );

    return createPortal(modalContent, document.body);
};


// INLINE PLAN EDITOR
const InlinePlanEditor = ({ plan, onPlanChange, onAddTarget }) => {
    const [activeWeek, setActiveWeek] = useState(0);
    const [expandedDay, setExpandedDay] = useState(null);
    const [pickerTarget, setPickerTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [previewEx, setPreviewEx] = useState(null);      // 新增動作流程：選了動作先預覽 { ex, target }
    const [infoEx, setInfoEx] = useState(null);            // 計劃內動作：點下去看豐富資訊卡
    const [swapTarget, setSwapTarget] = useState(null);    // 換動作：{ ex, dIdx, exIdx }
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    // 當細節編輯器儲存時，同步更新至外部 plan
    const handleUpdateExercise = useCallback((updatedEx) => {
        if (!detailTarget) return;
        const { wIdx, dIdx, exIdx } = detailTarget;
        const newPlan = JSON.parse(JSON.stringify(plan));
        newPlan.weeks[wIdx].days[dIdx].exercises[exIdx] = updatedEx;
        onPlanChange(newPlan);
        // 同步更新 detailTarget 讓選中狀態保持最新
        setDetailTarget(prev => prev ? { ...prev, ex: updatedEx } : null);
    }, [detailTarget, plan, onPlanChange]);

    const handleDragEnd = (wIdx, dIdx) => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        if (dragItem.current === dragOverItem.current) return;
        mutate(p => {
            const exList = p.weeks[wIdx].days[dIdx].exercises.filter(e => !e.isWarmup);
            const warmupList = p.weeks[wIdx].days[dIdx].exercises.filter(e => e.isWarmup);
            const dragged = exList.splice(dragItem.current, 1)[0];
            exList.splice(dragOverItem.current, 0, dragged);
            p.weeks[wIdx].days[dIdx].exercises = [...warmupList, ...exList];
        });
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const weeks = plan?.weeks || [];

    const mutate = useCallback((fn) => {
        const next = JSON.parse(JSON.stringify(plan));
        fn(next);
        onPlanChange(next);
    }, [plan, onPlanChange]);

    const handleDelete = (wIdx, dIdx, exIdx) => {
        mutate(p => p.weeks[wIdx].days[dIdx].exercises.splice(exIdx, 1));
    };

    // ── 胸/背平衡：一鍵把缺少的肌群補入正確的那一天（所有週同步）──
    const balanceGap = useMemo(() => detectBalanceGap(plan), [plan]);
    const [balanceAdded, setBalanceAdded] = useState(false);

    // 目標日：以目前顯示週的日清單來判定（每週分化相同，故索引共用）
    const balanceTargetDayIdx = useMemo(() => {
        if (!balanceGap) return -1;
        const days = weeks[activeWeek]?.days || [];
        return findTargetDayIdx(days, balanceGap.missing, balanceGap.present);
    }, [balanceGap, weeks, activeWeek]);

    const handleAddBalance = useCallback(() => {
        if (!balanceGap) return;
        /* ⚠️ 以前這顆按鈕直接把一個背部動作「塞進」現有的日子：
              不看時間預算（一天多 5–8 分鐘）、不照週期給組數（減量週也是滿組）、
              不經過關節限制與等級閘門，目標部位也沒真的加上「背」——
              等於在引擎排好的課表外面另外貼一塊。
           現在：把「背」加進目標部位，整份課表交給引擎重排（天數、時間、週期、傷病都重新算）。 */
        if (onAddTarget) { onAddTarget(balanceGap.missing); return; }
        if (balanceTargetDayIdx < 0) return;
        const muscle = balanceGap.missing;
        // 目標日的分化焦點（如 UPPER / PULL）→ 所有同焦點的日都要一起補
        const refDays = weeks[activeWeek]?.days || [];
        const targetFocus = (refDays[balanceTargetDayIdx]?.shortFocus)
            || (refDays[balanceTargetDayIdx]?.focus) || null;
        const sameFocusIdxs = refDays
            .map((d, i) => ({ i, f: d.shortFocus || d.focus }))
            .filter(x => x.f === targetFocus)
            .map(x => x.i);
        const dayIdxs = sameFocusIdxs.length ? sameFocusIdxs : [balanceTargetDayIdx];

        // 為每個目標日各挑一個複合動作（同日內全計劃去重，避免重複名稱）
        const used = new Set();
        weeks.forEach(w => (w.days || []).forEach(d => (d.exercises || []).forEach(e => used.add(e.name))));
        const pick = pickCompoundFor(muscle, plan, used);
        if (!pick) { toast.info('找不到適合的動作'); return; }

        mutate(p => {
            p.weeks.forEach(w => {
                dayIdxs.forEach(di => {
                    const day = w.days?.[di];
                    if (!day) return;
                    // 若該日已有這個補入肌群的動作則跳過（避免重複按）
                    if ((day.exercises || []).some(e => e._balanceAdded && e.muscle === muscle)) return;
                    const newEx = { ...pick, _balanceAdded: true };
                    day.exercises = insertOrdered(day.exercises || [], newEx);
                });
            });
        });
        setBalanceAdded(true);
        const zh = muscle === 'chest' ? '胸部' : '背部';
        const dayLabel = dayIdxs.map(i => i + 1).join('、');
        toast.success(`已將 ${pick.name}（${zh}）加入第 ${dayLabel} 天`);
    }, [balanceGap, balanceTargetDayIdx, weeks, activeWeek, plan, mutate, onAddTarget]);

    // 由動作名稱建出完整動作物件 (含引擎參數 fallback)
    const buildExFromName = (name) => {
        const eng = ALL_EXERCISES_MAP?.[name];
        return {
            name,
            nameEn: eng?.nameEn || name,   // 供豐富卡用英文名優先查 DB，避免錯圖
            muscle: eng?.muscle || guessMuscleName(name),
            cat: eng?.cat || 'compound',
            sets: eng?.sets || 3,
            reps: eng?.reps || '10-12',
            rest: eng?.rest || '90s',
            time: eng?.time || 8,
            diff: eng?.diff || 1,
            eq: eng?.eq || 'dumbbell',
            tier: eng?.tier || 3
        };
    };

    // ── 換動作（同部位）：整個週期「這一天」的同一個動作一起換，各週自己的組數／次數／休息保留 ──
    const level = String(plan?.user_level || 'beginner').toLowerCase();
    const swapOptions = useMemo(() => {
        if (!swapTarget) return [];
        const day = weeks[activeWeek]?.days?.[swapTarget.dIdx];
        const dayNames = (day?.exercises || []).flatMap(e => [e.name, e.nameEn]).filter(Boolean);
        return recommendAlternatives(
            { ...swapTarget.ex, nameEn: swapTarget.ex.nameEn || swapTarget.ex.name },
            { level, equipment: plan?.equipment_preference || 'mixed', injuries: plan?.injuries || [], exclude: dayNames, limit: 6 },
        );
    }, [swapTarget, weeks, activeWeek, level, plan?.equipment_preference, plan?.injuries]);

    const swapAcrossWeeks = (dIdx, fromName, picked) => {
        const en = picked?.nameEn || picked?.name;
        if (!en || en === fromName) return false;
        const already = (weeks[activeWeek]?.days?.[dIdx]?.exercises || []).some(e => e.name === en || e.nameEn === en);
        if (already) { toast.info('這一天已經有這個動作了'); return false; }
        const eng = ALL_EXERCISES_MAP?.[en] || buildExFromName(en);
        const ident = Object.fromEntries(['zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time']
            .filter(k => eng[k] !== undefined).map(k => [k, eng[k]]));
        mutate(p => p.weeks.forEach(w => {
            const d = w.days?.[dIdx];
            if (!d) return;
            d.exercises = (d.exercises || []).map(e => {
                if (e.isWarmup || e.name !== fromName) return e;
                const next = { ...e, ...ident, name: en, nameEn: en, _swappedFrom: e._swappedFrom || fromName };
                // 換回原本那個就不算換過
                if (next._swappedFrom === en) delete next._swappedFrom;
                // 引體向上是拉自己的體重：非高階給做得到的 6–10（原本若是 12–15 這種滑輪次數會做不完）
                if (STRICT_BW_PULLS.has(en) && level !== 'advanced') {
                    const hi = Number(String(next.reps || '').split(/[-→>]/).pop());
                    if (!Number.isFinite(hi) || hi > 10) next.reps = '6-10';
                }
                delete next.suggestedWeight; delete next.suggestedWeightEach; delete next.note;
                delete next._balanceAdded;
                return next;
            });
        }));
        haptic('success');
        toast.success(`已換成${getExerciseNameZh(en)}（整個週期的這一天都換了）`);
        return true;
    };

    // 在選擇器點動作 → 先開「豐富資訊卡」預覽 (含目標肌群/動作說明)，再由卡片「加入課表」確認
    const handlePickerSelect = (name) => {
        const t = pickerTarget;
        setPreviewEx({ ex: buildExFromName(name), target: t });
        setPickerTarget(null);
    };

    // 預覽卡按「加入課表」→ 實際寫入計劃
    const handleConfirmAdd = (ex) => {
        const t = previewEx?.target;
        if (!t) return;
        if (t.swapFrom) {   // 從「換動作」進動作庫挑的：一樣整個週期一起換
            swapAcrossWeeks(t.dIdx, t.swapFrom, ex);
            setPreviewEx(null);
            return;
        }
        mutate(p => {
            if (t.exIdx === null) p.weeks[t.wIdx].days[t.dIdx].exercises.push(ex);
            else p.weeks[t.wIdx].days[t.dIdx].exercises[t.exIdx] = ex;
        });
        setPreviewEx(null);
    };

    if (!weeks.length) return null;

    return (
        <div style={{ marginTop: 4 }}>
            {/* Week tabs */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 18 }}>
                {weeks.map((w, idx) => (
                    <motion.button key={idx} whileTap={{ scale: 0.94 }} onClick={() => setActiveWeek(idx)}
                        style={{
                            flexShrink: 0, padding: '10px 22px', borderRadius: 99, 
                            border: `1.5px solid ${activeWeek === idx ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`, 
                            cursor: 'pointer',
                            background: activeWeek === idx 
                                ? 'linear-gradient(135deg, #F6F4F1 0%, #CFC6B8 100%)' 
                                : 'rgba(0,0,0,0.25)', 
                            backdropFilter: 'blur(25px)', transition: 'all 0.2s',
                            boxShadow: activeWeek === idx ? 'inset 0 1.5px 1px rgba(255,255,255,0.65)' : 'none'
                        }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: activeWeek === idx ? C.ink : '#FFF', letterSpacing: '0.02em' }}>第 {w.week_number} 週</div>
                        {w.phase && <div style={{ fontSize: 11, color: activeWeek === idx ? 'rgba(22,20,21,0.6)' : 'rgba(255,255,255,0.6)', fontWeight: 800, marginTop: 1 }}>{({ BASE: '基礎', BUILD: '加量', PEAK: '高峰', DELOAD: '減量', TAPER: '減量' })[String(w.phase).toUpperCase()] || w.phase}</div>}
                    </motion.button>
                ))}
            </div>

            {/* Day cards */}
            <AnimatePresence mode="wait">
                <motion.div key={activeWeek} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                    {(weeks[activeWeek]?.days || []).map((day, dIdx) => {
                        const colorHex = DAY_COLORS[dIdx % DAY_COLORS.length];
                        const exercises = (day.exercises || []).filter(e => !e.isWarmup);
                        const warmup = day.warmup || (day.exercises || []).filter(e => e.isWarmup);
                        const isExp = expandedDay === dIdx;
                        return (
                            <div key={dIdx} style={{ ...INNER_GLASS, marginBottom: 16 }}>
                                {/* Header */}
                                <div onClick={() => setExpandedDay(isExp ? null : dIdx)}
                                    style={{ padding: '20px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', background: isExp ? `rgba(255,255,255,0.2)` : 'transparent', transition: 'background 0.2s', borderRadius: isExp ? '24px 24px 0 0' : 24 }}>
                                    <div style={{ width: 46, height: 46, borderRadius: 18, background: colorHex, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 8px 24px ${colorHex}50, inset 0 2px 4px rgba(255,255,255,0.5)` }}>
                                        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-body)' }}>{dIdx + 1}</span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: C.ink, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{String(day.focus || '').replace(/[（(].*$/, '').trim() || `第 ${dIdx + 1} 天`}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', fontWeight: 800, marginTop: 4, letterSpacing: '0.05em' }}>
                                            {exercises.length} 個動作 · 總耗時約 {estimateDayMinutes(exercises, warmup)} min
                                        </div>
                                    </div>
                                    <motion.div animate={{ rotate: isExp ? 90 : 0 }} transition={{ duration: 0.2 }}>
                                        <ChevronRight size={20} color="rgba(22,20,21,0.3)" />
                                    </motion.div>
                                </div>

                                {/* Expanded */}
                                <AnimatePresence>
                                    {isExp && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
                                            <div style={{ padding: '0 16px 16px' }}>
                                                {/* 胸/背平衡提示橫幅（在所有同焦點的目標日顯示） */}
                                                {balanceGap && balanceTargetDayIdx >= 0 && (
                                                    (day.shortFocus || day.focus) === (weeks[activeWeek]?.days?.[balanceTargetDayIdx]?.shortFocus || weeks[activeWeek]?.days?.[balanceTargetDayIdx]?.focus)
                                                ) && (() => {
                                                    const zh = balanceGap.missing === 'chest' ? '胸部' : '背部';
                                                    const presentZh = balanceGap.present === 'chest' ? '胸' : '背';
                                                    const already = (day.exercises || []).some(e => e._balanceAdded && e.muscle === balanceGap.missing);
                                                    return (
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: 12,
                                                            padding: '12px 14px', borderRadius: 18, marginBottom: 14,
                                                            background: 'rgba(249,92,75,0.10)',
                                                            border: '1px solid rgba(249,92,75,0.30)',
                                                        }}>
                                                            <div style={{ width: 30, height: 30, borderRadius: 12, background: 'rgba(249,92,75,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <Info size={16} color={C.coral} />
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, lineHeight: 1.35 }}>
                                                                    你選了{presentZh}卻沒選{zh === '胸部' ? '胸' : '背'}
                                                                </div>
                                                                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.55)', marginTop: 2, lineHeight: 1.3 }}>
                                                                    為維持推拉平衡，建議補一個{zh}複合動作
                                                                </div>
                                                            </div>
                                                            <motion.button
                                                                whileTap={{ scale: 0.94 }}
                                                                disabled={already}
                                                                onClick={(e) => { e.stopPropagation(); handleAddBalance(); }}
                                                                style={{
                                                                    flexShrink: 0, padding: '8px 14px', borderRadius: 12,
                                                                    border: 'none', cursor: already ? 'default' : 'pointer',
                                                                    background: already ? 'rgba(22,20,21,0.12)' : C.coral,
                                                                    color: already ? 'rgba(22,20,21,0.5)' : '#FFF',
                                                                    fontSize: 12, fontWeight: 800, letterSpacing: '0.02em',
                                                                    display: 'flex', alignItems: 'center', gap: 5,
                                                                }}>
                                                                {already ? <><Check size={14} /> 已加入</> : <><Plus size={14} /> 加入{zh}</>}
                                                            </motion.button>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Warmup */}
                                                {warmup.length > 0 && (
                                                    <div style={{ marginBottom: 16 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(22,20,21,0.4)', letterSpacing: '0.2em', marginBottom: 10 }}>熱身</div>
                                                        {warmup.map((w, i) => (
                                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 18, background: 'rgba(255,255,255,0.4)', border: `1px solid rgba(255,255,255,0.6)`, marginBottom: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                                                                <span style={{ fontSize: 14 }}>🔥</span>
                                                                <span style={{ fontSize: 14, color: C.ink, fontWeight: 800 }}>{getExerciseNameZh(w.name)}</span>
                                                                <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', fontWeight: 800, marginLeft: 'auto' }}>{/^\d+$/.test(String(w.reps ?? '').trim()) ? `${w.reps} 下` : w.reps}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Exercises */}
                                                <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(22,20,21,0.4)', letterSpacing: '0.2em', marginBottom: 10 }}>主要訓練</div>
                                                <Reorder.Group axis="y" values={exercises} onReorder={(newOrder) => {
                                                    mutate(p => {
                                                        const warmupList = p.weeks[activeWeek].days[dIdx].exercises.filter(e => e.isWarmup);
                                                        p.weeks[activeWeek].days[dIdx].exercises = [...warmupList, ...newOrder];
                                                    });
                                                }} style={{ padding: 0, margin: 0, listStyle: 'none' }}>
                                                    {exercises.map((ex, mapIdx) => {
                                                        const trueExIdx = day.exercises.findIndex(e => e === ex);
                                                        return (
                                                            <ExerciseRowWithPhoto
                                                                key={`${ex.name}-${trueExIdx}`}
                                                                ex={ex}
                                                                exIdx={trueExIdx}
                                                                activeWeek={activeWeek}
                                                                dIdx={dIdx}
                                                                setDetailTarget={setDetailTarget}
                                                                onShowInfo={setInfoEx}
                                                                handleDelete={handleDelete}
                                                                onSwap={setSwapTarget}
                                                            />
                                                        );
                                                    })}
                                                </Reorder.Group>
                                                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setPickerTarget({ wIdx: activeWeek, dIdx, exIdx: null })}
                                                    style={{ width: '100%', padding: '14px', borderRadius: 18, border: `1.5px dashed rgba(22,20,21,0.2)`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                                                    <Plus size={16} color="rgba(22,20,21,0.4)" />
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(22,20,21,0.6)', letterSpacing: '0.1em' }}>新增動作</span>
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </motion.div>
            </AnimatePresence>

            {/* 換動作：同部位推薦 ＋ 從動作庫挑 */}
            <SwapChooserSheet
                open={!!swapTarget}
                fromName={swapTarget ? getExerciseNameZh(swapTarget.ex.name) : ''}
                currentName={null}
                options={swapOptions}
                onPick={(o) => {
                    const t = swapTarget;
                    setSwapTarget(null);
                    if (o && t) swapAcrossWeeks(t.dIdx, t.ex.name, o);
                }}
                onLibrary={() => {
                    const t = swapTarget;
                    setSwapTarget(null);
                    if (t) setPickerTarget({ wIdx: activeWeek, dIdx: t.dIdx, exIdx: t.exIdx, swapFrom: t.ex.name });
                }}
                onClose={() => setSwapTarget(null)} />

            {/* Exercise picker */}
            <AnimatePresence>
                {pickerTarget && <ExercisePicker onSelect={handlePickerSelect} onClose={() => setPickerTarget(null)} />}
            </AnimatePresence>

            {/* Exercise detail sheet */}
            <AnimatePresence>
                {detailTarget && (
                    <ExerciseDetailSheet
                        target={detailTarget}
                        onClose={() => setDetailTarget(null)}
                        onUpdate={handleUpdateExercise}
                        onPickerOpen={() => {
                            setPickerTarget({
                                wIdx: detailTarget.wIdx,
                                dIdx: detailTarget.dIdx,
                                exIdx: detailTarget.exIdx
                            });
                            setDetailTarget(null);
                        }}
                    />
                )}
            </AnimatePresence>

            {/* 新增動作預覽：豐富資訊卡 + 「加入課表」 */}
            <AnimatePresence>
                {previewEx && (
                    <RichExerciseDetailSheet
                        ex={previewEx.ex}
                        onClose={() => setPreviewEx(null)}
                        actionLabel="加入課表"
                        onAction={handleConfirmAdd}
                    />
                )}
            </AnimatePresence>

            {/* 計劃內動作：單擊看豐富資訊卡 (目標肌群/動作說明/中英) */}
            <AnimatePresence>
                {infoEx && (
                    <RichExerciseDetailSheet
                        ex={infoEx.ex}
                        onClose={() => setInfoEx(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

//  STEP META + STACKED CARD DESIGN 
const STEP_META = [
    { label: '體能基礎設定', sub: '基礎級別 · 身體限制' },
    { label: '訓練偏好設定', sub: '目標肌群 · 天數與器材' },
    { label: '生成計劃總覽', sub: '課表檢視與自訂' },
];

const StepCard = ({ stepIdx, activeStep, setActiveStep, completedSteps, onActivate, onBack, pending = null, children }) => {
    const isActive = activeStep === stepIdx;
    const isPast = stepIdx < activeStep;
    const isFuture = stepIdx > activeStep;
    const meta = STEP_META[stepIdx];
    const theme = STEP_THEMES[stepIdx];

    const futureCount = TOTAL_STEPS - stepIdx;

    return (
        <motion.div
            initial={false}
            animate={{
                y: isActive ? 0 : isPast ? '-100%' : `calc(100% - ${PEEK_HEIGHT * futureCount}px)`,
                boxShadow: isFuture ? '0 -10px 30px rgba(0,0,0,0.15)' : 'none'
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            style={{
                position: 'absolute', inset: 0,
                backgroundColor: theme.bg,
                backgroundImage: theme.bgImg ? `url("${theme.bgImg}")` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: theme.text,
                '--text-dark': (theme.text === C.blackSoft || theme.text === C.ink) ? C.ink : C.white,
                '--text-muted': (theme.text === C.blackSoft || theme.text === C.ink) ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.45)',
                '--border-color': (theme.text === C.blackSoft || theme.text === C.ink) ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)',
                '--card-bg': (theme.text === C.blackSoft || theme.text === C.ink) ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.06)',
                zIndex: isActive ? 10 : isFuture ? 20 + stepIdx : 5,
                borderRadius: 0, // 設置卡片無圓角，融入極簡風格
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {/* 針對金屬背景的特殊玻璃高光疊加 */}
            {theme.mode === 'metal' && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%)',
                    mixBlendMode: 'overlay', pointerEvents: 'none'
                }} />
            )}
            {/* 頂部 Peek Header */}
            <div
                onClick={() => isFuture && onActivate(stepIdx)}
                style={{
                    height: isActive ? 'auto' : PEEK_HEIGHT,
                    padding: isActive ? 'max(64px,env(safe-area-inset-top,64px)) 32px 24px' : '0 32px',
                    display: 'flex', alignItems: isActive ? 'flex-start' : 'center',
                    flexShrink: 0, cursor: isFuture ? 'pointer' : 'default',
                    borderBottom: isActive ? `1px solid ${theme.text}20` : 'none',
                    position: 'relative'
                }}>

                {isActive ? (
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                        {/* 返回鍵列 */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                            <motion.button {...pressProps('row')} 
 onClick={(e) => {
 e.stopPropagation();
 if (stepIdx === 0) {
 if (onBack) onBack();
 } else {
 setActiveStep(stepIdx - 1);
 }
 }}
 style={{
 background: theme.text === C.ink ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.15)',
 backdropFilter: 'blur(16px)',
 WebkitBackdropFilter: 'blur(16px)',
 border: `1.2px solid ${theme.text}25`,
 borderRadius: '50%',
 width: 40,
 height: 40,
 color: theme.headerText,
 cursor: 'pointer',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
 transition: 'all 0.2s ease',
 outline: 'none'
 }}
 >
                                <ArrowLeft size={20} color={theme.headerText} />
                            </motion.button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                            <div style={{
                                fontSize: 130, fontWeight: 900,
                                color: theme.headerText,
                                opacity: 0.25,
                                fontFamily: 'var(--font-body)',
                                lineHeight: 0.8,
                                letterSpacing: '-0.05em',
                                pointerEvents: 'none',
                                marginRight: -10, // Create slight overlap with title
                            }}>
                                {`0${stepIdx + 1}`}
                            </div>
                            <div style={{ position: 'relative', zIndex: 2, paddingLeft: 10, paddingTop: 10 }}>
                                <div style={{ 
                                    fontSize: 36, fontWeight: 900, 
                                    color: theme.headerText, 
                                    letterSpacing: '-0.03em', lineHeight: 1.1 
                                }}>
                                    {meta.label}
                                </div>
                                {meta.sub && <div style={{ fontSize: 14, color: theme.headerText, opacity: 0.6, fontWeight: 700, marginTop: 4 }}>{meta.sub}</div>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* 顯示步驟編號 */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: 24,
                            transform: 'translateY(-50%)',
                            fontSize: 64,
                            fontWeight: 900,
                            color: theme.headerText,
                            opacity: 0.25,
                            fontFamily: 'var(--font-body)',
                            lineHeight: 1,
                            letterSpacing: '-0.05em',
                            pointerEvents: 'none',
                            zIndex: 0,
                            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}>
                            {`0${stepIdx + 1}`}
                        </div>

                        <div style={{ 
                            position: 'relative', 
                            zIndex: 1, 
                            paddingLeft: 48,
                            transition: 'all 0.4s ease'
                        }}>
                            <div style={{ 
                                fontSize: 18, 
                                fontWeight: 900, 
                                color: theme.headerText, 
                                letterSpacing: '-0.03em',
                                lineHeight: 1.1
                            }}>
                                {meta.label}
                            </div>
                            {isFuture && pending
                                ? <div style={{ fontSize: 13, color: theme.headerText, opacity: 0.75, fontWeight: 700, marginTop: 4 }}>還沒選：{pending}</div>
                                : meta.sub && <div style={{ fontSize: 13, color: theme.headerText, opacity: 0.6, fontWeight: 700, marginTop: 4 }}>{meta.sub}</div>}
                        </div>

                        {isFuture && (
                            <motion.div 
                                animate={{ opacity: [0.35, 1, 0.35] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                style={{
                                    position: 'absolute',
                                    right: 32,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    zIndex: 10,
                                    cursor: 'pointer'
                                }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: pending ? 'rgba(128,128,128,0.8)' : C.coral }}>{pending ? '先選完' : '下一步'}</span>
                                <ChevronRight size={14} color={C.coral} />
                            </motion.div>
                        )}
                    </>
                )}
            </div>

            {/* 步驟內容區區域 */}
            {isActive && (
                <div style={{
                    flex: 1, 
                    minHeight: 0,
                    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                    padding: '24px 20px',
                    paddingBottom: PEEK_HEIGHT * (TOTAL_STEPS - activeStep - 1) + 120,
                    position: 'relative',
                    zIndex: 5
                }}>
                    {children}
                </div>
            )}
        </motion.div>
    );
};

// MAIN COMPONENT

const WorkoutPlanGeneratorViewMobile = ({ userId, assessment, manualLevel: propManualLevel, onBack, onPlanGenerated }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = React.useState(false);
    const [manualLevel, setManualLevel] = React.useState(propManualLevel || '');
    const [selectedHashtags, setSelectedHashtags] = React.useState([]);
    const [seasonSuggest, setSeasonSuggest] = React.useState(null);   // 換季：依上一季建議的部位與原因
    const [seasonNo, setSeasonNo] = React.useState(null);
    // 🔗 從「肌肉平衡分析」帶弱項進來 → 自動預選這些目標肌群（教練建議串聯健身計劃）。
    const _location = useLocation();
    const _focusParts = _location?.state?.focusParts;
    // 🎯 從「完整計劃」引導頁帶進來的處方（訓練重點 → 天數/風格/程度/器材）
    const _focusSeed = _location?.state?.focusSeed || null;
    const [scheduleOverrides, setScheduleOverrides] = useState({});
    // returnTo：從引導頁進來時，返回鍵與「生成完成」都要回到那一頁繼續設定下一項
    const _returnTo = _location?.state?.returnTo || null;
    const _seasonRedesignState = _location?.state?.seasonRedesign || null;
    const goBack = React.useCallback(() => {
        if (_returnTo) { navigate(_returnTo); return; }
        /* 從季末收官「換部位」進來、沒生成就返回 → 回到收官那張（季數、收官都還沒動），
           舊計劃快照用不到了，清掉；不是丟回首頁讓人找不到剛剛的回饋。 */
        if (_seasonRedesignState) {
            try { clearRedesignSnapshot(localStorage, userId || getUserId()); } catch { /* */ }
            navigate('/luxury-plan-view-mobile', { replace: true, state: { openCycleRecap: true } });
            return;
        }
        if (onBack) onBack();
    }, [_returnTo, _seasonRedesignState, navigate, onBack, userId]);
    React.useEffect(() => {
        if (Array.isArray(_focusParts) && _focusParts.length) {
            setSelectedHashtags(prev => (prev.length ? prev : _focusParts.slice(0, 6)));
            // 從「完整計劃」引導頁來的部位是「目標的均衡預設」，不是肌肉平衡分析的結果 —
            // 兩者文案不能混用，否則等於對使用者說謊。那條路徑的提示由 focusSeed 統一發。
            if (!_focusSeed) {
                const zh = { legs: '腿', back: '背', chest: '胸', shoulders: '肩', arms: '手臂', core: '核心' };
                const names = _focusParts.map(p => zh[p] || p).join('、');
                try { toast.success(`教練建議：本次計劃已優先加強「${names}」（來自肌肉平衡分析）`); } catch { /* */ }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
        if (!_focusSeed) return;
        if (_focusSeed.level) setManualLevel(_focusSeed.level);
        if (_focusSeed.daysPerWeek) { setDaysPerWeek(_focusSeed.daysPerWeek); setDaysPicked(true); }
        if (_focusSeed.trainingStyle) { setTrainingStyle(_focusSeed.trainingStyle); setStylePicked(true); }
        if (_focusSeed.equipment) { setEquipmentPreference(_focusSeed.equipment); setEnvPicked(true); }
        if (Array.isArray(_focusSeed.targetMuscles) && _focusSeed.targetMuscles.length) {
            setSelectedHashtags(prev => (prev.length ? prev : _focusSeed.targetMuscles.slice(0, 6)));
        }
        // 從「完整計劃」進來一律停在第一步：
        // 那一頁只是摘要，真正的選擇在這裡 —— 要使用者把預選的標籤親眼看過一遍
        // 再往下生成，而不是把結果直接丟給他。
        setActiveStep(0);
        setCompletedSteps([0]);
        try {
            const f = getFocusOption(_location?.state?.focusId);
            const zh = { legs: '腿', back: '背', chest: '胸', shoulders: '肩', arms: '手臂', core: '核心' };
            const parts = (_focusSeed.targetMuscles || []).map(m => zh[m] || m).join('、');
            toast.success(
                `已依「${f?.label || '你的目標'}」預選：每週 ${_focusSeed.daysPerWeek} 天`
                + (parts ? ` · ${parts}` : '') + '，都可以自己改'
            );
        } catch { /* */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [limitations, setLimitations] = React.useState([]);
    /* 每一步都要「親手選過」才能往下：預設值只是畫面上的起點，不算使用者的選擇。
       ⚠️ 以前天數預設 4、器材預設混合、風格預設肌肥大，使用者什麼都沒點也能直接生成 ——
          生出來的課表跟他本人一點關係都沒有。 */
    const [limitsAnswered, setLimitsAnswered] = React.useState(false);
    const [daysPicked, setDaysPicked] = React.useState(false);
    const [envPicked, setEnvPicked] = React.useState(false);
    const [stylePicked, setStylePicked] = React.useState(false);
    const [daysPerWeek, setDaysPerWeek] = React.useState(4);
    const [activeStep, setActiveStep] = React.useState(0);
    const [completedSteps, setCompletedSteps] = React.useState([0, 1, 2]);
    /* 從季末收官按「換部位，重排一份」進來 → 直接停在選部位的那一步，並說清楚接下來按哪裡。
       （介面標準：導航過去也要告訴他到了之後怎麼改，不是丟到第一頁讓他自己找。） */
    React.useEffect(() => {
        const n = _location?.state?.seasonRedesign;
        if (!n) return;
        let sug = null;
        try {
            const uid = userId || getUserId();
            const prev = JSON.parse(localStorage.getItem(`currentPlan_${uid}`) || 'null');
            const lv = String(prev?.user_level || '').toLowerCase();
            if (['beginner', 'intermediate', 'advanced'].includes(lv)) setManualLevel(lv);
            if (Array.isArray(prev?.injuries)) setLimitations(prev.injuries);
            setLimitsAnswered(true);
            /* 換季只改部位 —— 天數、環境、目標沿用上一季，全部預先選好，
               使用者看一眼部位建議、直接按生成就好（不用把整份問卷再填一次）。想改的一樣可以點。 */
            const d = Number(prev?.days_per_week);
            if (d >= 2 && d <= 5) { setDaysPerWeek(d); setDaysPicked(true); }
            const eqPref = { gym: 'equipment', home: 'bodyweight' }[prev?.equipment_preference] || prev?.equipment_preference;
            if (['mixed', 'bodyweight', 'equipment'].includes(eqPref)) { setEquipmentPreference(eqPref); setEnvPicked(true); }
            if (['bodybuilding', 'strength'].includes(prev?.training_style)) { setTrainingStyle(prev.training_style); setStylePicked(true); }
            // 🏋️ 上一季排給哪間健身房，重排也照那間（還記著器材才有效；不是會員就不會套）
            if (prev?.gymId) setPlanGymId(prev.gymId);
            /* 下一季練哪裡：看上一季每個部位實際做了幾組（seasonTransition.suggestNextFocus，季末收官同一支） */
            let records = [];
            try { records = Object.values(uStorage(uid).get('trainingRecords', {}) || {}); } catch { /* */ }
            const since = prev?.startDate ? new Date(prev.startDate).getTime() : 0;
            sug = suggestNextFocus(prev, records, { sinceMs: Number.isFinite(since) ? since : 0 });
            if (sug?.focus?.length) {
                setSelectedHashtags([...sug.focus, ...(sug.boosts || [])]);
                setSeasonSuggest(sug);
            }
        } catch { /* 讀不到上一份 → 留在第一步自己選 */ }
        setActiveStep(1);
        /* 不跳 toast：一條浮在標題上的通知會蓋住頁面、又帶一個 emoji，
           「已依上一季預選」這件事改由重點部位上方那張建議卡自己說（Season 幾、改什麼、維持什麼）。 */
        setSeasonNo(n);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [generatedPlan, setGeneratedPlan] = React.useState(null);
    // 自動排課失敗（引擎丟錯）→ 讓確認按鈕與第三步說清楚，而不是停在「先把前兩步選完」
    const [genError, setGenError] = React.useState(false);
    // 送出中的 program_id：同一份課表重試沿用，見 handleConfirm
    const programIdRef = useRef(null);
    const confirmingRef = useRef(false);   // 防連點：setLoading 還沒生效前的第二下不送第二次
    const [pushUpMax, setPushUpMax] = React.useState('');
    const [squatMax, setSquatMax] = React.useState('');
    const [plankMax, setPlankMax] = React.useState('');
    const [showTest, setShowTest] = React.useState(false);
    const [equipmentPreference, setEquipmentPreference] = React.useState('mixed');
    // 🏋️ 依健身房排課（會員）：記住器材的健身房最多 3 間，選了就只排那間做得到的動作
    const [planGymId, setPlanGymId] = React.useState(null);
    const planGyms = React.useMemo(() => {
        try { return customGyms(loadGymMemory(userId || getUserId())); } catch { return []; }
    }, [userId]);
    const [trainingStyle, setTrainingStyle] = React.useState('bodybuilding');
    const [planName, setPlanName] = React.useState('\u6211\u7684\u8a13\u7df4\u8a08\u756b');
    const [planPatchReady, setPlanPatchReady] = React.useState(true);

    const currentLevel = manualLevel || (assessment && assessment.level) || 'beginner';

    const toggleLimitation = (key) => {
        setLimitsAnswered(true);
        setLimitations(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const levelLaw = getLevelCode(currentLevel);

    /** 要進到第 stepIdx 步之前，還有哪些沒選（按順序） */
    const missingBefore = (stepIdx) => {
        const m = [];
        if (stepIdx >= 1) {
            if (!manualLevel && !assessment?.level) m.push('程度');
            if (!limitsAnswered) m.push('關節狀況');
        }
        if (stepIdx >= 2) {
            if (!selectedHashtags.some(t => ['chest', 'back', 'legs'].includes(t))) m.push('重點部位');
            if (!daysPicked) m.push('每週天數');
            if (!envPicked) m.push('訓練環境');
            if (currentLevel !== 'beginner' && !stylePicked) m.push('訓練目標');
        }
        return m;
    };

    /* ⚖️ 能認真加強幾個部位，是「一週有幾天可以練」決定的，不是程度決定的。
       一週 3 天就是 3 個重點部位 —— 每天一個重點 ＋ 基礎動作，才練得到位；
       鋪到 6 個部位卻只有 3 天，每個部位七天才碰一次，等於每個都沒練到。
       跑步排到 4 趟以上再收一個：腿的恢復被吃掉，能吸收的重訓部位就更少。

       程度管的是另外兩件事，而且都在引擎裡做，不在這裡：
         · 動作怎麼篩（安全性與複雜度，新手不排高技術動作）
         · 每個動作幾組（新手少組數、進階才堆量）
       所以這裡不再用 levelLaw.maxMuscleTags。 */
    const runSessionsNow = React.useMemo(() => {
        try { return readWeeklyRunSessions(userId || getUserId()); } catch { return 0; }
    }, [userId]);
    /* 📅 天數的單一真相源（部位上限、推薦天數、哪些天數鎖住，全部從這裡算）：
         最多能排幾天 = min(程度上限, 目標的每週出門上限 − 跑步趟數, 5)，至少 2 天（ACSM 下限）。
       ⚠️ 以前還沒選天數時，部位上限用的是預設 3 天 —— 先選 4 個部位會被擋；
          選完部位再把天數調少，部位又被靜靜砍掉。兩步互相打架，選項一直變。
          現在：還沒選天數時，部位上限用「最多能排幾天」；選天數時，少於部位需要的天數直接鎖住並說明。 */
    /* ════ 部位選擇規則（單一真相源）════════════════════════════════════
         重點部位：胸／背／腿，至少選 1 個、最多 3 個。
           選的 → 課表圍著它排、每週練 2 次以上、每天先練、組數最多。
           沒選的 → 仍然會練（每週至少 1 個動作的維持量），只是不加量。
         輔助部位：肩／手臂／核心，不用選就會練到（推拉複合動作＋維持量）。
           點選 ＝「加強」：另外加獨立動作。能加強幾個看天數（2 天 1 個、3 天 2 個、4 天以上 3 個），
           天數太少還加太多，每個都只是蜻蜓點水。
       引擎收到的 selectedHashtags ＝ 重點部位 ＋ 加強的輔助部位；維持量由引擎自己補（UnifiedTrainingEngine 維持量）。 */
    const FOCUS_TAGS = ['chest', 'back', 'legs'];
    const ACC_TAGS = ['shoulders', 'arms', 'core'];
    const boostCapForDays = React.useCallback((d) => (d <= 2 ? 1 : d === 3 ? 2 : 3), []);
    const focusPicked = selectedHashtags.filter(t => FOCUS_TAGS.includes(t));
    const boostsPicked = selectedHashtags.filter(t => ACC_TAGS.includes(t));
    const maxFeasibleDays = React.useMemo(() => {
        let maxTotal = 6;
        try {
            const fid = loadTrainingFocus(userId || getUserId())?.focusId || null;
            maxTotal = checkWeeklyLoad({ strengthDays: 2, runSessions: runSessionsNow, level: currentLevel, focusId: fid }).maxTotal || 6;
        } catch { /* */ }
        return Math.max(2, Math.min(levelLaw.maxDaysPerWeek, maxTotal - runSessionsNow, 6 - runSessionsNow, 5));
    }, [levelLaw, runSessionsNow, currentLevel, userId]);
    // 新手一天只排 3 個動作：重點部位選幾個，就少幾個加強名額（先把胸背腿的基本動作練起來）
    //   新手一天只有 3 個動作：名額 ＝ 天數 − 重點部位數；手臂算 2 個（二頭＋三頭）。
    //   例：2 天只選胸 → 1 個名額（肩或核心）；3 天只選背 → 2 個名額（手臂，或肩＋核心）。
    const boostDays = daysPicked ? daysPerWeek : maxFeasibleDays;
    const boostUnits = (tags) => tags.reduce((a, t) => a + (t === 'arms' && currentLevel === 'beginner' ? 2 : 1), 0);
    const boostCap = currentLevel !== 'beginner'
        ? boostCapForDays(boostDays)
        : Math.max(0, Math.min(3, boostDays - focusPicked.length));
    // 加強了 n 個輔助部位，至少要幾天
    const minDaysForTags = React.useMemo(() => {
        const units = boostsPicked.reduce((a, t) => a + (t === 'arms' && currentLevel === 'beginner' ? 2 : 1), 0);
        for (let d = 2; d <= 5; d++) {
            const cap = currentLevel !== 'beginner' ? boostCapForDays(d) : Math.max(0, Math.min(3, d - focusPicked.length));
            if (cap >= units) return d;
        }
        return 5;
    }, [boostsPicked, focusPicked.length, currentLevel, boostCapForDays]);
    // 推薦天數：程度的常用天數（新手 3、中高階 4），至少滿足部位需要，最多不超過能排的上限
    /* 推薦天數看「一週總共練幾天」（重訓＋跑步），不是只看重訓：
         新手一週 4 天、中高階 5 天，其餘是完全休息日 —— 肌肉跟神經都在休息日長回來。
       ⚠️ 以前推薦只看程度（中高階 4 天），已經排 2 趟跑步的人會被推薦到一週練 6 天、只休 1 天。 */
    const recommendedDays = React.useMemo(() => {
        const targetTotal = currentLevel === 'beginner' ? 4 : 5;
        const byLoad = Math.max(2, targetTotal - runSessionsNow);
        return Math.min(maxFeasibleDays, Math.max(byLoad, minDaysForTags));
    }, [currentLevel, runSessionsNow, maxFeasibleDays, minDaysForTags]);
    const recommendReason = runSessionsNow > 0
        ? `加 ${runSessionsNow} 趟跑步，一週練 ${recommendedDays + runSessionsNow} 天、休 ${Math.max(0, 7 - recommendedDays - runSessionsNow)} 天`
        : `一週練 ${recommendedDays} 天、休 ${7 - recommendedDays} 天`;
    /* 兩個坑要一起避開：
       ① toast 不能寫在 setState 的 updater 裡 —— React 嚴格模式會把 updater
          跑兩次來偵測不純的函式，寫在裡面的提示就會冒出兩張。
       ② 但把判斷移到外面之後，如果只讀 state，連續快點時每一下都讀到同一份
          舊值，上限就擋不住（點四下會全部加進去）。
       所以用一個同步更新的 ref 當「目前選了什麼」的即時真相：
       判斷與提示都在外面做，而且每一下都看得到前一下的結果。 */
    const tagsRef = React.useRef(selectedHashtags);
    React.useEffect(() => { tagsRef.current = selectedHashtags; }, [selectedHashtags]);

    const toggleTag = (id) => {
        const cur = tagsRef.current || [];
        if (cur.includes(id)) {
            if (FOCUS_TAGS.includes(id) && cur.filter(t => FOCUS_TAGS.includes(t)).length <= 1) {
                toast.error('至少留 1 個重點部位');
                return;
            }
            const next = cur.filter(t => t !== id);
            tagsRef.current = next;
            setSelectedHashtags(next);
            return;
        }
        if (ACC_TAGS.includes(id) && boostUnits([...cur.filter(t => ACC_TAGS.includes(t)), id]) > boostCap) {
            toast.error(boostCap === 0 ? '新手先練重點部位' : (id === 'arms' && currentLevel === 'beginner') ? '手臂算 2 個名額' : `最多加強 ${boostCap} 個`);
            return;
        }
        const next = [...cur, id];
        tagsRef.current = next;
        setSelectedHashtags(next);
    };

    // 加強上限變小（例：程度改成新手、天數上限跟著變）→ 收斂加強的輔助部位，並說拿掉了哪個
    React.useEffect(() => {
        setSelectedHashtags(prev => {
            const acc = prev.filter(t => ACC_TAGS.includes(t));
            if (boostUnits(acc) <= boostCap) return prev;
            const keep = [];
            acc.forEach(t => { if (boostUnits([...keep, t]) <= boostCap) keep.push(t); });
            const removed = acc.filter(t => !keep.includes(t));
            setTimeout(() => { try { toast.info(`先取消加強：${removed.map(t => MUSCLES[t]?.label || t).join('、')}`); } catch { /* */ } }, 0);
            return prev.filter(t => !removed.includes(t));
        });
    }, [boostCap, currentLevel]);

    // 等級只管天數上限（新手不排 6 天），部位數量不再受等級限制
    React.useEffect(() => {
        const law = getLevelCode(currentLevel);
        setDaysPerWeek(d => Math.min(d, law.maxDaysPerWeek));
    }, [currentLevel]);

    // 🤝 拮抗肌 / 推拉平衡建議表
    // 選了某部位時，若其拮抗夥伴尚未被選，建議使用者「一起練」以避免肌力失衡、
    // 並讓演算法能排出更完整、不會掉塊的推拉計劃。
    // chest(水平推) ↔ back(水平拉)；shoulders(垂直推) ↔ back(垂直拉)；
    // legs(股四頭) 的拮抗(臀/腿後)已內含在 legs 之中，arms(二/三頭)自成拮抗，故不額外建議。
    const ANTAGONIST_SUGGEST = {
        chest: { partner: 'back', reason: '胸與背為水平推拉拮抗肌' },
        back: { partner: 'chest', reason: '背與胸為水平推拉拮抗肌' },
        shoulders: { partner: 'back', reason: '肩(推)與背(拉)可平衡肩關節' },
    };

    // 🤝 由目前選擇「衍生」出建議（useMemo → 永遠與選擇同步，不會重複、不會閃一下就消失）
    // 只取第一條尚未滿足的建議顯示，避免一次塞太多訊息。
    const antagonistHint = React.useMemo(() => {
        for (const id of selectedHashtags) {
            const sug = ANTAGONIST_SUGGEST[id];
            if (sug && !selectedHashtags.includes(sug.partner)) {
                const partnerName = MUSCLES[sug.partner]?.label || sug.partner;
                return { partner: sug.partner, partnerName, reason: sug.reason };
            }
        }
        return null;
    }, [selectedHashtags]);

    // ⚠️ 涵蓋度檢查：直接比對「實際生成的計劃」有沒有練到使用者選的每個部位。
    // 天數太少 + 選太多部位時 (尤其 2 天)，全身循環塞不下所有肌群，會漏掉某些部位。
    // 這裡不靠猜測，而是讀真實的 generatedPlan，找出「選了卻整週沒練到」的部位再提示。
    const coverageWarning = React.useMemo(() => {
        if (!generatedPlan || selectedHashtags.length === 0) return null;
        // 標籤 → 底層肌群
        const TAG_MUSCLES = {
            chest: ['chest'], back: ['back'], shoulders: ['shoulders'],
            arms: ['biceps', 'triceps'], core: ['core'],
            legs: ['quads', 'hamstrings', 'glutes'],
        };
        const week1 = generatedPlan.weeks?.[0]
            || generatedPlan.levels?.[Object.keys(generatedPlan.levels || {})[0]]?.weeks?.[0];
        if (!week1?.days) return null;
        const practiced = new Set();
        week1.days.forEach(d => (d.exercises || []).forEach(e => {
            if (!e.isWarmup && e.tier !== 4 && e.muscle) practiced.add(e.muscle);
        }));
        const missing = selectedHashtags.filter(tag => {
            const need = TAG_MUSCLES[tag];
            return need && !need.some(m => practiced.has(m));
        });
        if (missing.length === 0) return null;
        const labels = missing.map(t => MUSCLES[t]?.label || t);
        return { missing, labels };
    }, [generatedPlan, selectedHashtags]);

    // 🚦 跨系統天數守門 —— 使用者若沒走「完整計劃」引導、自己在這裡排天數，
    //    仍要看見「重訓天數 ＋ 已排定的跑步趟數」的總量是否合理。
    //    跑步趟數讀真實存檔（本週跑步磚 → 註冊時的計劃），讀不到就當 0、不虛報。
    const plannedRunSessions = React.useMemo(() => {
        try { return readWeeklyRunSessions(userId || getUserId()); } catch { return 0; }
    }, [userId]);
    // 目標名稱（用來說明「這些預選是依什麼推薦的」）
    const _focusLabel = React.useMemo(() => {
        try { return getFocusOption(_location?.state?.focusId)?.label || '你的目標'; }
        catch { return '你的目標'; }
    }, [_location]);

    const activeFocusId = React.useMemo(() => {
        try { return loadTrainingFocus(userId || getUserId())?.focusId || null; } catch { return null; }
    }, [userId]);
    const weeklyLoad = React.useMemo(() => checkWeeklyLoad({
        strengthDays: daysPerWeek,
        runSessions: plannedRunSessions,
        level: currentLevel,
        focusId: activeFocusId,
    }), [daysPerWeek, plannedRunSessions, currentLevel, activeFocusId]);

    // 衝突時的建議天數：降到「不吃光整週」且不低於 ACSM 每週 2 天
    const suggestedDays = React.useMemo(() => Math.max(
        2, Math.min(levelLaw.maxDaysPerWeek, (weeklyLoad.maxTotal || 6) - plannedRunSessions)
    ), [levelLaw, weeklyLoad.maxTotal, plannedRunSessions]);

    // 「一鍵調整」到底解不解得掉？跑步排太多的時候，重訓就算砍到 ACSM 下限
    // （每週 2 天）總量還是超標 —— 那就不能假裝這一按就沒事了，要講清楚。
    const fixLandsClean = React.useMemo(
        () => suggestedDays + plannedRunSessions <= Math.min(weeklyLoad.maxTotal || 6, 6),
        [suggestedDays, plannedRunSessions, weeklyLoad.maxTotal]
    );

    // 這個天數會不會讓一週完全沒有休息日？（硬限制：至少留 1 天）
    const dayExceedsRest = React.useCallback(
        (d) => plannedRunSessions > 0 && (d + plannedRunSessions) >= 7,
        [plannedRunSessions]
    );

    // ══════════════════════════════════════════════════════════════════
    // 📅 跨系統排課預告 —— 選完天數就要知道「是哪幾天」。
    //    重訓日是錨點：有自訂排程就用它，沒有就用 buildWeeklyAgenda 的預設分佈
    //    （同一份 DEFAULT_STRENGTH_SPREAD，預告和實際排出來不會對不上）。
    //    跑步沒有固定星期，是繞著重訓落位的 —— 所以這裡反過來算「跑步會去哪」。
    // ══════════════════════════════════════════════════════════════════
    const strengthDayPlan = React.useMemo(() => {
        let saved = [];
        try { saved = readStrengthWeekdays(userId || getUserId()); } catch { /* 讀不到就用預設 */ }
        if (saved.length === daysPerWeek) return saved;
        return defaultStrengthWeekdays(daysPerWeek);
    }, [userId, daysPerWeek]);

    /* 已經有跑步計劃的話，重訓要去配合它 —— 用中控台同一支 buildWeeklyAgenda 算。
       ⚠️ 原本用 proposeComplementDays，它只收 { takenDays, need }：拿不到課種、
          也不知道哪天是腿日，所以下面那句「質量跑另外避開腿日隔天」做不到，
          排出來的星期也跟中控台不一樣。 */
    /* 🗓️ 使用者可以在七天格子上改重訓排在星期幾（點重訓格、再點要換過去的那天）。
       改過的星期存在 customWeekdays；天數一變就重設回預設分佈。
       確認計劃時寫進 weeklyTrainingDays_<uid>（中控台／首頁讀的同一份），生成後的計劃就照這個排。 */
    const [customWeekdays, setCustomWeekdays] = React.useState(null);
    React.useEffect(() => { setCustomWeekdays(null); }, [daysPerWeek]);
    const strengthWeekdays = (customWeekdays && customWeekdays.length === daysPerWeek) ? customWeekdays : strengthDayPlan;
    const scheduleMap = React.useMemo(() => {
        const monFirst = [...strengthWeekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        return Object.fromEntries(monFirst.map((js, i) => [js, i + 1]));
    }, [strengthWeekdays]);
    const moveStrengthDay = React.useCallback((fromIdx, toIdx) => {
        const fromJs = (fromIdx + 1) % 7, toJs = (toIdx + 1) % 7;
        const cur = [...strengthWeekdays];
        if (!cur.includes(fromJs) || cur.includes(toJs)) return;
        setCustomWeekdays(cur.map((d) => (d === fromJs ? toJs : d)));
        haptic('success');
    }, [strengthWeekdays]);

    const runDayPreview = React.useMemo(() => {
        const uid = userId || getUserId();
        const days = previewSplitFocus(daysPerWeek);
        const week = previewWeek(uid, { strengthDays: days, weeklySchedule: scheduleMap });
        const out = [];
        const warnings = [];
        week.forEach((d, i) => {
            if (d.run) out.push({ idx: i, label: WEEKDAY_LABEL[i], type: d.run.subtype || d.run.type });
            (d.warnings || []).forEach((w) => warnings.push(`週${WEEKDAY_LABEL[i]}：${String(w).replace(/^⚠️\s*/, '')}`));
        });
        return { week, days: out, warnings: [...new Set(warnings)] };
    }, [userId, daysPerWeek, scheduleMap]);
    // 空檔不夠 → 會有幾趟跑步跟重訓擠在同一天（使用者現在就該知道，不是排完才發現）
    const runOverlap = Math.max(0, plannedRunSessions - (7 - strengthWeekdays.length));

    // ══════════════════════════════════════════════════════════════════
    // 🦵 腿部重疊 —— 跨系統最容易撞在一起、使用者又看不見的地方。
    //    跑步計劃的交叉訓練本來就在練腿；這裡再排大腿量，同一組肌肉一週被打兩次。
    //    偵測到就給兩條真的能按下去的路：改處方，或減天數。
    // ══════════════════════════════════════════════════════════════════
    const runStrengthSessions = React.useMemo(() => {
        try { return readRunPlanStrengthSessions(userId || getUserId()); } catch { return 0; }
    }, [userId]);
    const legsSelected = React.useMemo(
        () => (selectedHashtags || []).some((t) => t === 'legs' || t === 'glutes'),
        [selectedHashtags]
    );
    // 已經是力量取向 → 已經跟跑步互補，不用再吵
    const legOverlap = runStrengthSessions > 0 && legsSelected && trainingStyle !== 'strength';

    /** 一鍵：把腿改成跟跑步互補的「跑者力量課」（低次數大重量，不疊肌肥大疲勞）。 */
    const applyRunnerLegPreset = React.useCallback(() => {
        setTrainingStyle('strength'); setStylePicked(true);
        setSelectedHashtags((prev) => (prev.includes('legs') ? prev : [...prev, 'legs'].slice(0, 6)));
        toast.success('腿部已改成力量取向：低次數大重量，跟跑步的功能性課同方向');
    }, []);

    const handleConfirm = async () => {
        if (!generatedPlan) {
            // 以前直接 return：按了沒反應。講清楚為什麼沒東西可以存。
            toast.error(genError ? '這組設定排不出課表，換一下部位或天數再試' : '課表還在排，等一下再按');
            return;
        }
        const missing = missingBefore(2);
        if (missing.length) { toast.error(`還沒選：${missing.join('、')}`); return; }
        if (confirmingRef.current) return;
        confirmingRef.current = true;
        setLoading(true);
        const currentUserId = userId || getUserId();
        /* 換部位重排：這一季還沒收過官才算數。同一份收官已經用重排結算過（例如按瀏覽器上一頁回來又生成一次）
           → 當一般生成，不再改季數、不再出摘要。 */
        const redesignSeason = Number(_location?.state?.seasonRedesign);
        const doneKey = _location?.state?.cycleDoneKey || null;
        let redesignLive = false;
        try { redesignLive = redesignSeason > 0 && !(doneKey && localStorage.getItem(doneKey) === 'true'); } catch { redesignLive = redesignSeason > 0; }
        /* 換部位重排：季數與換季歷史寫進課表本身（會上傳後端）——
           以前只寫在本機那一份，換裝置／重新登入後季數倒回 1、平台期判斷接不上。 */
        let redesignCarry = {};
        if (redesignLive) {
            try {
                const pre = readRedesignSnapshot(localStorage, currentUserId, { cycleDoneKey: doneKey });
                redesignCarry = { season: redesignSeason, ...(Array.isArray(pre?.history) ? { _seasonHistory: pre.history } : {}) };
            } catch { redesignCarry = { season: redesignSeason }; }
        }
        try {
            // 統一週期：完整計劃流程帶進來的共同起點寫進課表。
            // LuxuryPlanViewMobile 與 homeAlerts 都是先讀 plan.startDate，寫了就會對齊。
            // 精靈排好的星期跟著計劃一起存上後端，換裝置／重新整理才不會掉回預設。
            const trainingSchedule = {};
            (generatedPlan.weeks || []).forEach((_, wi) => { trainingSchedule[wi + 1] = { ...scheduleMap }; });
            const planToSave = {
                ...generatedPlan, name: planName, ...redesignCarry,
                ...(Object.keys(scheduleMap || {}).length ? { training_schedule: trainingSchedule } : {}),
                ...(_focusSeed?.startDate ? {
                    startDate: _focusSeed.startDate,
                    cycleWeeks: _focusSeed.cycleWeeks || null,
                    cycleBlocks: _focusSeed.blocks || null,
                } : {}),
            };
            /* 同一份課表重按（上次斷線）要沿用同一個 program_id：
               換新 id 的話，activateProgram 會把上一份當成「待補送」先送，再送這份 → 伺服器收到兩份。 */
            const sig = JSON.stringify(planToSave);
            if (!programIdRef.current || programIdRef.current.sig !== sig) {
                programIdRef.current = { sig, id: newProgramId() };
            }
            const savedData = await activateProgram(currentUserId, withExistingRunSchedule(currentUserId,
                { program_id: programIdRef.current.id, strength: planToSave }, scheduleOverrides), apiClient);
            if (savedData?.status !== 'success' || !savedData?.strength?.plan_id) {
                throw new Error('保存計劃未回傳有效識別碼');
            }
            const planId = savedData.strength.plan_id;
            const finalPlan = savedData.strength;
            localStorage.setItem('currentPlan', JSON.stringify(finalPlan));
            localStorage.setItem('currentPlanId', planId);
            localStorage.setItem(`currentPlan_${currentUserId}`, JSON.stringify(finalPlan));
            // 🗓️ 精靈裡排好（或手動調過）的星期，寫進中控台／首頁共用的排程 —— 每一週都照這個排
            try {
                const sched = {};
                (finalPlan.weeks || []).forEach((_, wi) => { sched[wi + 1] = { ...scheduleMap }; });
                localStorage.setItem(`weeklyTrainingDays_${currentUserId}`, JSON.stringify(sched));
            } catch { /* 排程寫不進去就沿用預設分佈 */ }
            localStorage.setItem('currentPlan_user', JSON.stringify(finalPlan));

            const selectedTagLabels = selectedHashtags;
            localStorage.setItem('userPlanTags', JSON.stringify(selectedTagLabels));

            activateStrengthPlan(currentUserId, planId);
            localStorage.removeItem(`muscle_training_${currentUserId}`);
            programIdRef.current = null;   // 已送達，下一份課表用新的 id

            /* 從季末收官「換部位，重排一份」進來的：新計劃真的啟用了，才把季數 +1、標記收官看過。
               （收官那邊不再先寫 —— 中途返回或送出失敗，舊計劃不能被當成下一季。） */
            let shownPlan = finalPlan;
            if (redesignLive) {
                /* 舊計劃快照是收官頁按「去換部位」時存的（這時 currentPlan 已經被新的蓋掉了）。
                   對不上這一次收官、或放太久過期 → 不給摘要，不拿別份計劃來比。 */
                const snap = takeRedesignSnapshot(localStorage, currentUserId, { cycleDoneKey: doneKey });
                try { localStorage.setItem(`season_${currentUserId}`, String(redesignSeason)); } catch { /* */ }
                if (doneKey) { try { localStorage.setItem(doneKey, 'true'); } catch { /* */ } }
                try { markReviewed(currentUserId, 'strength'); } catch { /* */ }
                // 每週回饋是「這一季」的：新一季第 1 週要重新問（原地換季同一條規則）
                try {
                    const nWeeks = Math.max(snap?.plan?.weeks?.length || 0, (finalPlan?.weeks || []).length, 4);
                    for (let w = 1; w <= nWeeks; w++) localStorage.removeItem(`week_feedback_${currentUserId}_week${w}`);
                } catch { /* */ }
                let redesign = null;
                try { redesign = snap ? summarizeRedesign(snap.plan, finalPlan, { nameOf: getExerciseNameZh }) : null; } catch { redesign = null; }
                /* 回收官頁給看「改了什麼」：跟原地換季同一個欄位（_seasonApplied），頁首小卡也會留到新一季第一堂 */
                shownPlan = {
                    ...finalPlan, ...redesignCarry, season: redesignSeason,
                    _seasonApplied: { season: redesignSeason, kind: 'redesign', label: '換部位重排', at: Date.now(), rows: [], redesign },
                };
                try { localStorage.setItem(`currentPlan_${currentUserId}`, JSON.stringify(shownPlan)); } catch { /* */ }
            }

            if (onPlanGenerated) {
                onPlanGenerated(finalPlan);
            }

            // ✨ 第一份健身計劃生成 → 滿版時刻。SwissMoment 是全域 portal，
            //    跨頁 navigate 也不會被打斷，正好落在「確認 → 進入計劃頁」的空檔。
            // 不是第一份也要有回饋：每次按下開始，都當場看到「計劃成立」（跑步計劃同一支，不節流）
            // 換部位重排：回到收官頁的「改了什麼」就是這一刻的回饋，不再疊一張「計劃成立」滿版
            try {
                const first = recordFirst(currentUserId, 'gen_workout_plan');
                if (!first && !redesignLive) recordPlanLive(currentUserId, { weeks: (finalPlan?.weeks || []).length, kind: 'strength' });
                haptic('success');
            } catch { /* */ }

            // 從「完整計劃」引導頁來的 → 回那一頁（那邊會自動打勾並帶到下一步）；
            // 從季末收官換部位來的 → 回計劃頁、打開「改了什麼」（replace：上一頁不會回到產生器再生一次）；
            // 一般路徑維持原本行為：直接進計劃頁看課表。
            if (redesignLive) {
                navigate('/luxury-plan-view-mobile', { replace: true, state: { plan: shownPlan, seasonRedesignDone: redesignSeason } });
            } else if (_returnTo) {
                toast.success('健身計劃已建立');
                navigate(_returnTo);
            } else {
                navigate('/luxury-plan-view-mobile', {
                    state: { plan: finalPlan }
                });
            }
        } catch (error) {
            console.error('保存計劃錯誤:', error);
            // 斷線：activateProgram 已給了能照做的那句話（恢復連線後在原地再按一次）
            toast.error(error?.code === 'offline'
                ? error.message
                : '計劃尚未確認同步，請回中控「重試並確認計劃」；若設定被拒絕，請重新確認課表。');
        } finally {
            confirmingRef.current = false;
            setLoading(false);
        }
    };

    const handlePeekClick = (stepIdx) => {
        if (stepIdx > activeStep) {
            const missing = missingBefore(stepIdx);
            if (missing.length) {
                haptic('heavy');
                toast.error(`還沒選：${missing.join('、')}`);
                return;
            }
        }
        haptic('light');
        setActiveStep(stepIdx);
    };

    // ⚖️ [S-03] 新手建議重量需要體重與性別。
    //    calcSuggestedWeight() 只在 level === 'beginner' && userBodyWeight 有值時才算，
    //    而本頁過去兩個參數都沒傳 —— 於是從「AI 生成訓練計劃」進來的新手
    //    永遠拿不到起始重量，偏偏那正是最需要它的入口。
    //    來源優先序：最新 InBody（實測）→ 個人檔案快取 → 舊版全域 key。
    //    三者都沒有就回 null —— 沒有體重就不給數字，不猜（誠實數據原則）。
    const bodyMetrics = React.useMemo(() => {
        const uid = userId || getUserId();
        let weight = null;
        let gender = '';
        try {
            const ib = getLatestInbody(uid);
            const w = Number(ib?.weight_kg);
            if (Number.isFinite(w) && w > 0) weight = w;
        } catch { /* 沒有 InBody → 往下找個人檔案 */ }
        try {
            const cache = uGet(uid, 'user_profile_cache', {}) || {};
            if (!weight) {
                const w = Number(cache.weight_kg ?? cache.weight);
                if (Number.isFinite(w) && w > 0) weight = w;
            }
            if (cache.gender) gender = cache.gender;
        } catch { /* 髒資料 → 當成沒有 */ }
        try {
            const pf = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
            if (!weight) {
                const w = Number(pf.weight_kg ?? pf.weight ?? pf.current_weight);
                if (Number.isFinite(w) && w > 0) weight = w;
            }
            if (!gender && pf.gender) gender = pf.gender;
        } catch { /* 髒資料 → 當成沒有 */ }
        // 不知道就是 null —— 下游的建議重量會自己判斷要不要顯示
        return { weight, gender: ['male', 'female'].includes(String(gender)) ? gender : null };
    }, [userId]);

    // 換部位重排：上一季的動作名稱，讓引擎把輔助動作換掉至少 30%（週期輪換標準 S3／S5）
    const rotateFrom = React.useMemo(() => {
        if (!_location?.state?.seasonRedesign) return null;
        try {
            const snap = readRedesignSnapshot(localStorage, userId || getUserId(), { cycleDoneKey: _location?.state?.cycleDoneKey });
            const names = (snap?.plan?.weeks?.[0]?.days || []).flatMap(d => (d.exercises || []).filter(e => !e.isWarmup).map(e => e.name)).filter(Boolean);
            return names.length ? names : null;
        } catch { return null; }
    }, [_location?.state?.seasonRedesign, _location?.state?.cycleDoneKey, userId]);

    // Auto-generate plan dynamically as settings change
    React.useEffect(() => {
        const level = manualLevel || assessment?.level || 'beginner';
        try {
            const plan = generateUnifiedPlan({
                level,
                injuries: limitations,        // 🔧 修：把使用者選的關節限制真正傳進引擎（原本沒傳→傷病過濾從未生效）
                selectedHashtags,
                daysPerWeek,
                equipment: equipmentPreference, // 🔧 修：傳入器材偏好（mixed/bodyweight/equipment）
                trainingStyle,                  // 🔧 修：傳入訓練風格（肌肥大/力量）
                userBodyWeight: bodyMetrics.weight, // 🔧 修：新手建議重量（null 時引擎自動略過）
                userGender: bodyMetrics.gender,     // 🔧 修：新手建議重量的性別係數
                rotateFrom,                         // 換季重排：避免生出跟上一季幾乎一樣的課表
            });
            // 🏋️ 指定健身房 → 這間沒有的器材換成做得到的（同一條規則：utils/gymMemory.adaptPlanForGym）
            const gym = planGymId && equipmentPreference !== 'bodyweight' && canUse('placePlans')
                ? planGyms.find((g) => g.id === planGymId) : null;
            if (gym) {
                const r = adaptPlanForGym(plan, gym, userId || getUserId());
                setGeneratedPlan({ ...r.plan, gymId: gym.id, gymName: gym.name, gymChanges: r.changes });
                setGenError(false);
                return;
            }
            setGeneratedPlan(plan);
            setGenError(false);
        } catch (e) {
            console.error('Auto generation failed:', e);
            /* 以前只 log：畫面留著上一組設定排出來的舊課表（或空白），按確認會存到不符合現在選項的那份。
               清掉並標記錯誤，第三步與確認鈕會說明要換設定。 */
            setGeneratedPlan(null);
            setGenError(true);
        }
    }, [manualLevel, assessment, limitations, selectedHashtags, daysPerWeek, equipmentPreference, trainingStyle, bodyMetrics, planGymId, planGyms, userId, rotateFrom]);

    return (
        <div style={{
            height: '100dvh',
            width: '100vw',
            background: '#0B0A0A',
            color: C.white,
            fontFamily: 'var(--font-body)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* 首次進入 AI 計劃生成 → 操作步驟教學（看過一次即不再出現） */}
            <FirstTimeHint
                tipKey="first-plan-generator"
                title="AI 生成訓練計劃"
                steps={[
                    '選程度與每週訓練天數',
                    '有舊傷就勾關節限制',
                    '預覽滿意再確認',
                ]}
            />
            <div style={{ paddingTop: 20, paddingBottom: 120, paddingLeft: 20, paddingRight: 20, maxWidth: 500, margin: '0 auto' }}>
                <div style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 6px', color: C.white }}>
                        {activeStep === 0 ? '先說你的狀況' : activeStep === 1 ? '想怎麼練' : '你的課表'}
                    </h1>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 600, margin: 0 }}>
                        {`第 ${activeStep + 1} 步，共 3 步 · 每一項都選了才能往下`}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Step 0 */}
                    <StepCard stepIdx={0} activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} onActivate={handlePeekClick} onBack={goBack}>
                        {/* 🍱 Bento: 1大2小 網格 */}
                        <div style={{ marginBottom: 32 }}>
                            <SLabel mode={STEP_THEMES[0].mode}>程度</SLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {[
                                    { val: 'beginner',     num: '01', zh: '新手', sub: '練不到半年', span: 2 },
                                    { val: 'intermediate', num: '02', zh: '中階', sub: '規律練半年以上', span: 1 },
                                    { val: 'advanced',     num: '03', zh: '進階', sub: '規律練兩年以上', span: 1 },
                                ].map((opt) => {
                                    const sel = manualLevel === opt.val;
                                    return (
                                        <motion.button key={opt.val} whileTap={{ scale: 0.96 }} onClick={() => setManualLevel(sel ? '' : opt.val)}
                                            style={{
                                                ...getLiquidGlassStyle(sel, STEP_THEMES[0].mode),
                                                gridColumn: `span ${opt.span}`, padding: opt.span === 2 ? '24px' : '16px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', 
                                                minHeight: opt.span === 2 ? 140 : 150, cursor: 'pointer'
                                            }}>
                                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ fontSize: 13, fontWeight: 900, opacity: sel ? 0.95 : 0.55, letterSpacing: '0.1em', fontFamily: 'var(--font-body)' }}>{opt.num}</span>
                                                {sel && <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.ink }} />}
                                            </div>
                                            <div style={{ textAlign: 'left', marginTop: 'auto' }}>
                                                <div style={{ fontSize: opt.span === 2 ? 30 : 22, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>{opt.zh}</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, opacity: sel ? 0.9 : 0.72, marginTop: 6 }}>{opt.sub}</div>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 🍱 Bento: 3x2 完美正方形網格 */}
                        <div style={{ marginBottom: 24 }}>
                            <SLabel mode={STEP_THEMES[0].mode}>關節狀況（會避開不適合的動作）</SLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                {[['膝蓋','knee'],['下背','back'],['肩膀','shoulder'],['手腕','wrist'],['髖部','hip'],['腳踝','ankle']].map(([zh, key]) => {
                                    const sel = limitations.includes(key);
                                    return (
                                        <motion.button key={key} whileTap={{ scale: 0.94 }} onClick={() => toggleLimitation(key)}
                                            style={{
                                                ...getLiquidGlassStyle(sel, STEP_THEMES[0].mode),
                                                aspectRatio: '1 / 1', padding: '12px 8px', // 📐 強制正方形
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
                                            }}>
                                            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>{zh}</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, opacity: sel ? 0.8 : 0.45 }}>{sel ? '會避開' : '會痛就點'}</span>
                                        </motion.button>
                                    );
                                })}
                            </div>
                            {/* 「都沒有」也是一個答案 —— 要點了才算回答過 */}
                            <motion.button whileTap={{ scale: 0.97 }}
                                onClick={() => { setLimitations([]); setLimitsAnswered(true); }}
                                style={{
                                    ...getLiquidGlassStyle(limitsAnswered && limitations.length === 0, STEP_THEMES[0].mode),
                                    width: '100%', marginTop: 12, minHeight: 56, cursor: 'pointer',
                                    fontSize: 16, fontWeight: 900,
                                }}>
                                都沒有，關節都 OK
                            </motion.button>
                        </div>
                    </StepCard>

                    {/* Step 1: 訓練偏好設定 */}
                    <StepCard stepIdx={1} activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} onActivate={handlePeekClick} onBack={goBack} pending={missingBefore(1).join('、') || null}>
                        
                        {/* 🍱 Bento Glass: 目標肌群 2x3 網格 (可自由複選，不限數量) */}
                        <div style={{ marginBottom: 32, marginTop: 10 }}>
                            <SLabel mode={STEP_THEMES[1].mode}>重點部位</SLabel>
                            <p style={{ margin: '-6px 0 12px', fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.62)' }}>課表照推／拉／腿排；選的先練、多練一天</p>
                            {/* 換季：依上一季實際練的組數預選（suggestNextFocus），每個部位一句原因 */}
                            {seasonSuggest && (() => {
                                /* 列點：建議調整（改成什麼＋為什麼）／可以維持（為什麼不用動）。
                                   下面的部位卡已經照「建議調整」預選好，這裡只負責說理由；想改直接點下面的卡。 */
                                const L = seasonSuggest.label;
                                const Row = ({ dot, head, why }) => (
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
                                        <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, marginTop: 7, flexShrink: 0 }} />
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{head}</span>
                                            {why && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.55)', marginTop: 1 }}>{why}</span>}
                                        </span>
                                    </div>
                                );
                                return (
                                    <div style={{ margin: '0 0 14px', padding: '14px 16px 10px', borderRadius: 18, background: '#FBFAF8', border: '1px solid rgba(22,20,21,0.08)', boxShadow: '0 6px 18px -14px rgba(22,20,21,0.3)' }}>
                                        <div style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>{seasonNo ? `Season ${seasonNo} 建議` : '依上一季建議'}</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginTop: 2 }}>
                                            {seasonSuggest.basedOn === 'records' ? '看上一季實際練了幾組' : '看上一季課表排了幾組'} · 已經選好，天數與器材沿用上一季
                                        </div>
                                        {seasonSuggest.changes?.length > 0 && (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: '#D94030', margin: '12px 0 2px' }}>建議調整</div>
                                                {seasonSuggest.changes.map((c) => <Row key={c.tag} dot="#F95C4B" head={`${L(c.tag)} → ${c.to}`} why={c.why} />)}
                                            </>
                                        )}
                                        {seasonSuggest.keeps?.length > 0 && (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(22,20,21,0.5)', margin: '10px 0 2px' }}>可以維持</div>
                                                {seasonSuggest.keeps.map((k) => <Row key={k.tag} dot="rgba(22,20,21,0.3)" head={L(k.tag)} why={k.why} />)}
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                            {/* 推薦依據：讓使用者知道這些預選是從哪來的 */}
                            {_focusSeed && (
                                <div style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 7,
                                    margin: '0 0 10px', lineHeight: 1.5,
                                }}>
                                    <span style={{
                                        flexShrink: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em',
                                        padding: '2px 6px', borderRadius: 99, background: '#161415', color: '#F6F4F1',
                                    }}>推薦</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.62)' }}>
                                        依你選的「{_focusLabel}」預選最平衡的部位組合，想改直接點就好
                                    </span>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                {FOCUS_TAGS.map((id, index) => {
                                    const info = MUSCLES[id];
                                    const sel = selectedHashtags.includes(id);
                                    return (
                                        <motion.button key={id} {...pressProps('card')} onClick={() => { haptic('light'); toggleTag(id); }}
                                            style={{
                                                ...getLiquidGlassStyle(sel, STEP_THEMES[1].mode),
                                                padding: '14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 104,
                                                cursor: 'pointer',
                                            }}>
                                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ fontSize: 11, fontWeight: 800, opacity: sel ? 0.95 : 0.55 }}>0{index + 1}</span>
                                                {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF', boxShadow: '0 0 10px #FFF' }} />}
                                            </div>
                                            <div style={{ textAlign: 'left', marginTop: 'auto' }}>
                                                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{info?.label}</div>
                                                <div style={{ fontSize: 11, fontWeight: 800, marginTop: 4, opacity: sel ? 0.9 : 0.55 }}>{sel ? '重點' : '維持'}</div>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* 輔助部位：不用選就會練到；點選＝加強（另外加獨立動作），數量看天數 */}
                            <SLabel mode={STEP_THEMES[1].mode}>{`輔助部位（可加強 ${boostCap} 個）`}</SLabel>
                            <p style={{ margin: '-6px 0 12px', fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.62)' }}>都會練到；點選＝另外多加動作</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                {ACC_TAGS.map((id) => {
                                    const info = MUSCLES[id];
                                    const sel = selectedHashtags.includes(id);
                                    return (
                                        <motion.button key={id} {...pressProps('card')} onClick={() => { haptic('light'); toggleTag(id); }}
                                            style={{
                                                ...getLiquidGlassStyle(sel, STEP_THEMES[1].mode),
                                                padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minHeight: 72,
                                                cursor: 'pointer', borderRadius: 18,
                                            }}>
                                            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{id === 'core' ? '核心' : info?.label}</div>
                                            <div style={{ fontSize: 11, fontWeight: 800, opacity: sel ? 0.95 : 0.55 }}>{sel ? '加強' : '會練到'}</div>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* 🤝 拮抗肌建議：常駐橫幅 (跟著選擇即時更新，不會閃一下就消失) */}
                            <AnimatePresence>
                                {antagonistHint && (
                                    <motion.div
                                        key={antagonistHint.partner}
                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '14px 16px', borderRadius: 16,
                                            background: 'rgba(255,107,74,0.12)',
                                            border: '1px solid rgba(255,107,74,0.35)',
                                        }}>
                                            <Lightbulb size={16} strokeWidth={2.2} color="#D94030" style={{ flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
                                                    推薦搭配「{antagonistHint.partnerName}」一起練
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(22,20,21,0.58)', marginTop: 2, lineHeight: 1.4 }}>
                                                    {antagonistHint.reason}，可平衡肌力並讓計劃更完整
                                                </div>
                                            </div>
                                            <motion.button
                                                whileTap={{ scale: 0.94 }}
                                                onClick={() => toggleTag(antagonistHint.partner)}
                                                style={{
                                                    flexShrink: 0, padding: '8px 14px', borderRadius: 12, border: 'none',
                                                    background: '#FF6B4A', color: '#FFF', fontSize: 12, fontWeight: 800,
                                                    letterSpacing: '0.02em', cursor: 'pointer',
                                                }}>
                                                加入
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 🍱 Bento Glass: 天數 1x4 */}
                        <div style={{ marginBottom: 32 }}>
                            <SLabel mode={STEP_THEMES[1].mode}>每週練幾天</SLabel>
                            {/* 推薦天數：同時考慮程度、已排的跑步、選了幾個部位（單一真相源 recommendedDays） */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-4px 0 12px' }}>
                                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#F95C4B', color: '#FFF' }}>推薦 {recommendedDays} 天</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.62)' }}>{recommendReason}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                {[2, 3, 4, 5].map((d) => {
                                    const sel = daysPicked && daysPerWeek === d;
                                    // ⚖️ [教練法典] 新手每週上限 4 天：恢復與睡眠比多練一天更能帶來成長
                                    const levelLocked = d > levelLaw.maxDaysPerWeek;
                                    // 🚦 跨系統硬限制：加上已排定的跑步趟數後不得吃光整週（至少留 1 天完全休息）
                                    const restLocked = !levelLocked && (dayExceedsRest(d) || d > maxFeasibleDays);
                                    // 部位比天數多：練不到位，鎖住並說明（不再偷偷砍掉已選的部位）
                                    const tagLocked = !levelLocked && !restLocked && d < minDaysForTags;
                                    const locked = levelLocked || restLocked || tagLocked;
                                    const isRec = !locked && d === recommendedDays;
                                    return (
                                        <motion.button key={d} whileTap={{ scale: locked ? 1 : 0.94 }}
                                            onClick={() => {
                                                if (levelLocked) {
                                                    toast.error(`${levelLaw.label}階段建議每週最多 ${levelLaw.maxDaysPerWeek} 天，恢復是成長的一部分`);
                                                    return;
                                                }
                                                if (restLocked) {
                                                    toast.error(`重訓最多 ${maxFeasibleDays} 天`);
                                                    return;
                                                }
                                                if (tagLocked) {
                                                    toast.error(`至少要 ${minDaysForTags} 天`);
                                                    return;
                                                }
                                                haptic('light');
                                                setDaysPerWeek(d); setDaysPicked(true);
                                            }}
                                            style={{
                                                ...getLiquidGlassStyle(sel, STEP_THEMES[1].mode),
                                                aspectRatio: '1 / 1', padding: '12px', cursor: locked ? 'not-allowed' : 'pointer',
                                                opacity: locked ? 0.35 : 1, filter: locked ? 'grayscale(0.8)' : 'none',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                            <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: 'var(--font-body)', color: sel ? '#FFF' : 'inherit' }}>{d}</span>
                                            <span style={{ fontSize: 11, fontWeight: 800, opacity: sel ? 0.9 : (isRec ? 1 : 0.55), marginTop: 4, color: sel ? '#FFF' : (isRec ? '#D94030' : 'inherit') }}>{tagLocked ? '加強太多' : locked ? '不建議' : isRec ? '推薦' : d > recommendedDays ? '偏多' : '天'}</span>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* 📅 排課預告：選完天數就看得到「是哪幾天」，
                                以及已排定的跑步會被排去哪 —— 兩個系統的日期在同一個畫面講完。 */}
                            {daysPicked && strengthWeekdays.length > 0 && (
                                <div style={{ marginTop: 12, paddingLeft: 2 }}>
                                    <p style={{
                                        fontSize: 13, fontWeight: 800, color: C.ink,
                                        letterSpacing: '-0.01em', margin: 0,
                                    }}>
                                        預定排在 {weekdaysZh([...strengthWeekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)))}
                                    </p>
                                    {plannedRunSessions > 0 && runOverlap > 0 && (
                                        <p style={{
                                            fontSize: 11, fontWeight: 500, color: 'rgba(22,20,21,0.58)',
                                            lineHeight: 1.5, marginTop: 4, marginBottom: 0,
                                        }}>
                                            {runOverlap > 0
                                                ? `${plannedRunSessions} 趟跑步只剩 ${7 - strengthWeekdays.length} 天空檔，會有 ${runOverlap} 趟跟重訓同日。`
                                                : runDayPreview.days.length
                                                    ? `跑步排在 ${runDayPreview.days.map((d) => `週${d.label}`).join(' · ')}（${runDayPreview.days.map((d) => runTypeZh(d.type)).join(' · ')}）`
                                                    : `${plannedRunSessions} 趟跑步會繞開這幾天排。`}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* 🚦 跨系統天數提醒：重訓天數 ＋ 已排定的跑步趟數是否合理
                                （沒走「完整計劃」引導、自己排課的人也一定看得到） */}
                            <AnimatePresence>
                                {weeklyLoad.severity !== 'ok' && plannedRunSessions > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 12,
                                            padding: '14px 16px', borderRadius: 16,
                                            background: weeklyLoad.severity === 'block'
                                                ? 'rgba(217,64,48,0.14)' : 'rgba(245,158,11,0.12)',
                                            border: `1px solid ${weeklyLoad.severity === 'block'
                                                ? 'rgba(217,64,48,0.45)' : 'rgba(245,158,11,0.4)'}`,
                                        }}>
                                            <Info size={16} color={weeklyLoad.severity === 'block' ? '#D94030' : '#F59E0B'}
                                                style={{ flexShrink: 0, marginTop: 1 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
                                                    {weeklyLoad.title}
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(22,20,21,0.60)', marginTop: 3, lineHeight: 1.5 }}>
                                                    {weeklyLoad.message}
                                                </div>
                                                {/* 解不掉就直說 —— 跑步排太多的時候，重訓砍到底也還是超標。 */}
                                                {!fixLandsClean && (
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#D94030', marginTop: 5, lineHeight: 1.5 }}>
                                                        重訓減到 {suggestedDays} 天，一週還是 {suggestedDays + plannedRunSessions} 天。跑步那邊也要減。
                                                    </div>
                                                )}
                                                {/* 一鍵解掉衝突：直接把重訓天數降到不衝突的上限，
                                                    並提供入口去看跑步那邊到底排了什麼。 */}
                                                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                                    {suggestedDays < daysPerWeek && (
                                                        <motion.button {...pressProps('row')}
 onClick={() => { setDaysPerWeek(suggestedDays); setDaysPicked(true); toast.success(`已調整為每週 ${suggestedDays} 天重訓`); }}
 style={{
 border: 'none', cursor: 'pointer', borderRadius: 10,
 padding: '8px 12px', background: '#161415', color: '#F6F4F1',
 fontSize: 11.5, fontWeight: 800,
 }}>
                                                            重訓減為 {suggestedDays} 天
                                                        </motion.button>
                                                    )}
                                                    <motion.button {...pressProps('row')}
 onClick={() => navigate('/cardio-microcycle-inbox')}
 style={{
 border: '1px solid rgba(22,20,21,0.25)', cursor: 'pointer', borderRadius: 10,
 padding: '8px 12px', background: 'transparent', color: 'rgba(22,20,21,0.70)',
 fontSize: 11.5, fontWeight: 800,
 }}>
                                                        看跑步計劃
                                                    </motion.button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* 🦵 腿部重疊 —— 跑步的交叉訓練已經在練腿，這裡再排大腿量會疊。
                                不只是提醒：兩個做法都做成一按就套用，套完可以馬上看差在哪。 */}
                            <AnimatePresence>
                                {legOverlap && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{
                                            padding: '14px 16px', borderRadius: 16,
                                            background: 'rgba(22,20,21,0.05)',
                                            border: '1px solid rgba(22,20,21,0.16)',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                                <Info size={16} color="rgba(22,20,21,0.55)" style={{ flexShrink: 0, marginTop: 1 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
                                                        跑步計劃每週已有 {runStrengthSessions} 堂肌力課，也在練腿
                                                    </div>
                                                    <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(22,20,21,0.60)', marginTop: 3, lineHeight: 1.5 }}>
                                                        {currentLevel === 'beginner'
                                                            ? '同一組肌肉一週被打兩次，恢復不完。建議把重訓天數降一天。'
                                                            : '同一組肌肉一週被打兩次，恢復不完。選一個做法就好。'}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                                        {currentLevel !== 'beginner' && (
                                                            <motion.button {...pressProps('row')}
 onClick={applyRunnerLegPreset}
 style={{
 border: 'none', cursor: 'pointer', borderRadius: 10,
 padding: '8px 12px', background: '#161415', color: '#F6F4F1',
 fontSize: 11.5, fontWeight: 800,
 }}>
                                                                腿改成跑者力量課
                                                            </motion.button>
                                                        )}
                                                        {daysPerWeek > 2 && (
                                                            <motion.button {...pressProps('row')}
 onClick={() => {
 setDaysPerWeek(daysPerWeek - 1);
 toast.success(`已減為每週 ${daysPerWeek - 1} 天重訓`);
 }}
 style={{
 border: '1px solid rgba(22,20,21,0.25)', cursor: 'pointer', borderRadius: 10,
 padding: '8px 12px', background: 'transparent', color: 'rgba(22,20,21,0.70)',
 fontSize: 11.5, fontWeight: 800,
 }}>
                                                                重訓減為 {daysPerWeek - 1} 天
                                                            </motion.button>
                                                        )}
                                                        {generatedPlan && (
                                                            <motion.button {...pressProps('row')}
 onClick={() => handlePeekClick(2)}
 style={{
 border: '1px solid rgba(22,20,21,0.25)', cursor: 'pointer', borderRadius: 10,
 padding: '8px 12px', background: 'transparent', color: 'rgba(22,20,21,0.70)',
 fontSize: 11.5, fontWeight: 800,
 }}>
                                                                看變更效果
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* 七天一排看完重訓＋跑步，點重訓格可以換日；確認計劃時照這個排 */}
                            {generatedPlan && daysPicked && (
                                <WeekScheduleStrip userId={userId || getUserId()} strength={generatedPlan}
                                    week={(() => { try { return previewWeek(userId || getUserId(), { strengthDays: generatedPlan.weeks?.[0]?.days || [], weeklySchedule: scheduleMap }); } catch { return null; } })()}
                                    onMoveStrength={moveStrengthDay} />
                            )}
                            {generatedPlan?.time_hint && (
                                <div role="status" style={{ marginTop: 12, padding: '14px 16px', borderRadius: 16, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: C.ink }}>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>訓練時間超出預算</div>
                                    <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{generatedPlan.time_hint}</div>
                                </div>
                            )}
                            {/* ⚠️ 這裡以前有一整段「訓練量分配」說明（三行、一堆組數與但書）——
                                   超過介面標準的說明上限，而且數字在第 3 步總覽已經有了。 */}

                            {/* ⚠️ 涵蓋度提示：天數太少塞不下所選部位時，建議增加天數 */}
                            <AnimatePresence>
                                {coverageWarning && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '14px 16px', borderRadius: 16,
                                            background: 'rgba(245,158,11,0.12)',
                                            border: '1px solid rgba(245,158,11,0.4)',
                                        }}>
                                            <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
                                                    {`${daysPerWeek} 天可能練不完選的部位`}
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(22,20,21,0.58)', marginTop: 2, lineHeight: 1.4 }}>
                                                    {`本週可能漏掉「${coverageWarning.labels.join('、')}」。建議增加訓練天數，讓每個部位都練得到`}
                                                </div>
                                            </div>
                                            {daysPerWeek < levelLaw.maxDaysPerWeek && (
                                                <motion.button
                                                    whileTap={{ scale: 0.94 }}
                                                    onClick={() => setDaysPerWeek(d => Math.min(levelLaw.maxDaysPerWeek, d + 1))}
                                                    style={{
                                                        flexShrink: 0, padding: '8px 14px', borderRadius: 12, border: 'none',
                                                        background: '#F59E0B', color: '#FFF', fontSize: 12, fontWeight: 800,
                                                        letterSpacing: '0.02em', cursor: 'pointer', whiteSpace: 'nowrap',
                                                    }}>
                                                    +1 天
                                                </motion.button>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 🍱 Bento Glass: 器材與環境 1大2小 */}
                        <div style={{ marginBottom: 32 }}>
                            <SLabel mode={STEP_THEMES[1].mode}>在哪裡練</SLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {[
                                    { val: 'mixed',      num: '01', zh: '健身房＋自重', sub: '最有彈性', span: 2 },
                                    { val: 'bodyweight', num: '02', zh: '在家徒手', sub: '不用器材', span: 1 },
                                    { val: 'equipment',  num: '03', zh: '健身房', sub: '槓鈴、機械都有', span: 1 }
                                ].map((opt) => {
                                    const sel = envPicked && equipmentPreference === opt.val;
                                    return (
                                        <motion.button key={opt.val} whileTap={{ scale: 0.96 }} onClick={() => { setEquipmentPreference(opt.val); setEnvPicked(true); }}
                                            style={{
                                                ...getLiquidGlassStyle(sel, STEP_THEMES[1].mode),
                                                gridColumn: `span ${opt.span}`, padding: opt.span === 2 ? '24px' : '16px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: opt.span === 2 ? 130 : 140, cursor: 'pointer'
                                            }}>
                                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ fontSize: 13, fontWeight: 900, opacity: sel ? 0.95 : 0.55, letterSpacing: '0.1em', fontFamily: 'var(--font-body)' }}>{opt.num}</span>
                                                {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF', boxShadow: '0 0 10px #FFF' }} />}
                                            </div>
                                            <div style={{ textAlign: 'left', marginTop: 'auto' }}>
                                                <div style={{ fontSize: opt.span === 2 ? 26 : 20, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{opt.zh}</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, opacity: sel ? 0.9 : 0.72 }}>{opt.sub}</div>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 🏋️ 哪一間健身房（記住器材的健身房才列，最多 3 間） */}
                        {planGyms.length > 0 && equipmentPreference !== 'bodyweight' && (
                            <div style={{ marginTop: -16, marginBottom: 32 }}>
                                <SLabel mode={STEP_THEMES[1].mode}>哪一間</SLabel>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {[{ id: null, name: '不指定' }, ...planGyms].map((g) => {
                                        const sel = planGymId === g.id;
                                        return (
                                            <motion.button key={g.id || 'none'} whileTap={{ scale: 0.94 }}
                                                onClick={() => {
                                                    if (g.id && !canUse('placePlans')) { openPaywall('placePlans'); return; }
                                                    setPlanGymId(g.id);
                                                }}
                                                style={{
                                                    ...getLiquidGlassStyle(sel, STEP_THEMES[1].mode),
                                                    minHeight: 44, padding: '0 16px', borderRadius: 999, cursor: 'pointer',
                                                    fontSize: 14, fontWeight: 800, maxWidth: '100%', minWidth: 0,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                {g.name}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                                {generatedPlan?.gymId && generatedPlan.gymChanges?.length > 0 && (
                                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.72, marginTop: 10 }}>
                                        {`${generatedPlan.gymChanges.length} 個動作換成這間有的器材`}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 🍱 Bento Glass: 訓練風格 2格橫向 */}
                        {currentLevel !== 'beginner' && (
                            <div style={{ marginBottom: 32 }}>
                                <SLabel mode={STEP_THEMES[1].mode}>主要目標</SLabel>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    {[
                                        { val: 'bodybuilding', num: '01', zh: '肌肥大', sub: '8–12 RM · 中等負荷' },
                                        { val: 'strength',     num: '02', zh: '最大肌力', sub: '3–6 RM · 大重量' }
                                    ].map((opt) => {
                                        const sel = stylePicked && trainingStyle === opt.val;
                                        return (
                                            <motion.button key={opt.val} whileTap={{ scale: 0.96 }} onClick={() => { setTrainingStyle(opt.val); setStylePicked(true); }}
                                                style={{
                                                    ...getLiquidGlassStyle(sel, STEP_THEMES[1].mode),
                                                    padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 120, cursor: 'pointer'
                                                }}>
                                                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <span style={{ fontSize: 13, fontWeight: 900, opacity: sel ? 0.95 : 0.55, letterSpacing: '0.1em', fontFamily: 'var(--font-body)' }}>{opt.num}</span>
                                                    {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF', boxShadow: '0 0 10px #FFF' }} />}
                                                </div>
                                                <div style={{ textAlign: 'left', marginTop: 'auto' }}>
                                                    <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{opt.zh}</div>
                                                    <div style={{ fontSize: 12, fontWeight: 700, opacity: sel ? 0.9 : 0.72, marginTop: 6 }}>{opt.sub}</div>
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </StepCard>


                    {/* Step 2 */}
                    <StepCard stepIdx={2} activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} onActivate={handlePeekClick} onBack={goBack} pending={missingBefore(2).join('、') || null}>

                        {generatedPlan ? (<>
                            <SLabel mode={STEP_THEMES[2].mode}>計劃名稱</SLabel>
                            <div style={{ marginBottom: 32 }}>
                                <input type="text" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="自訂訓練計劃"
                                    style={{ 
                                        ...getLiquidGlassStyle(false, STEP_THEMES[2].mode),
                                        width: '100%', padding: '24px 20px', fontSize: 22, fontWeight: 900, color: C.ink,
                                        outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s', letterSpacing: '-0.02em'
                                    }}
                                />
                            </div>

                            {/* ══ 總覽：一行講完這份課表，再用兩個數字講「照著練會怎樣」 ══════════
                                ⚠️ 以前是 LEVEL／FREQ／AVG TIME／COVERAGE／FORECAST 五段英文標題，
                                   預測是三張卡、每張一個區間（+2.5–4.2%、+0.17–0.33 kg）再加一段但書 ——
                                   數字越多越看不出重點。現在：區間取中間值寫「約」，一行一個結果。 */}
                            {(() => {
                                const allDays = generatedPlan.weeks.flatMap(w => w.days);
                                const avgMin = allDays.length ? Math.round(allDays.reduce((sum, d) => {
                                    const main = (d.exercises || []).filter(e => !e.isWarmup && e.tier !== 4);
                                    const warm = d.warmup || (d.exercises || []).filter(e => e.isWarmup);
                                    return sum + estimateDayMinutes(main, warm);
                                }, 0) / allDays.length) : null;
                                const order = ['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core'];
                                const zh = { chest:'胸', back:'背', shoulders:'肩', biceps:'二頭', triceps:'三頭', quads:'大腿前', hamstrings:'大腿後', glutes:'臀', calves:'小腿', core:'核心' };
                                const present = new Set();
                                (generatedPlan.weeks?.[0]?.days || []).forEach(d =>
                                    (d.exercises || []).filter(e => !e.isWarmup).forEach(e => { if (e.muscle) present.add(e.muscle); }));
                                const parts = order.filter(m => present.has(m));
                                const LV = { beginner: '新手', intermediate: '中階', advanced: '進階' };
                                const fc = computeStrengthForecast({
                                    level: currentLevel, daysPerWeek, trainingStyle,
                                    weeks: generatedPlan.weeks?.length || 4, plan: generatedPlan, inbody: getLatestInbody(),
                                });
                                const mid = (a) => (Array.isArray(a) ? (Number(a[0]) + Number(a[1])) / 2 : null);
                                const strMid = mid(fc.strengthGainPct);
                                const smmMid = mid(fc.smmGainKg);
                                const smmTo = Array.isArray(fc.projectedSMM) ? Math.round(mid(fc.projectedSMM) * 10) / 10 : null;
                                const row = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid rgba(22,20,21,0.12)' };
                                return (
                                    <>
                                        <div style={{ marginBottom: 28, padding: '0 8px' }}>
                                            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, color: C.ink }}>
                                                每週 {generatedPlan.days_per_week} 天{avgMin ? ` · 約 ${avgMin} 分鐘` : ''}
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(22,20,21,0.6)', marginTop: 8 }}>
                                                {LV[String(generatedPlan.user_level || '').toLowerCase()] || ''}{parts.length ? ` · 練到 ${parts.map(m => zh[m] || m).join('、')}` : ''}
                                            </div>
                                        </div>

                                        {/* 💳 成效預測是會員功能：免費版不畫預測，只放一張會員卡（課表本身照常） */}
                                        {canUse('forecast') ? (<>
                                        <SLabel mode={STEP_THEMES[2].mode}>照著練 {fc.weeks} 週</SLabel>
                                        <div style={{ marginBottom: 36, padding: '0 8px' }}>
                                            {strMid != null && (
                                                <div style={row}>
                                                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>主項重量</span>
                                                    <span style={{ fontSize: 26, fontWeight: 900, color: '#D94030', letterSpacing: '-0.02em' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(22,20,21,0.5)', marginRight: 4 }}>約</span>+{Math.round(strMid)}%
                                                    </span>
                                                </div>
                                            )}
                                            {smmMid != null && (
                                                <div style={row}>
                                                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
                                                        肌肉量
                                                        {smmTo != null && <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)', marginTop: 2 }}>{fc.baselineSMM} → {smmTo} kg</span>}
                                                    </span>
                                                    <span style={{ fontSize: 26, fontWeight: 900, color: '#D94030', letterSpacing: '-0.02em' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(22,20,21,0.5)', marginRight: 4 }}>約</span>+{Math.round(smmMid * 10) / 10} kg
                                                    </span>
                                                </div>
                                            )}
                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)', marginTop: 10 }}>
                                                前提：吃夠熱量與蛋白質
                                                {smmTo == null && (
                                                    <motion.button {...pressProps('row')} onClick={() => navigate('/body-analysis-mobile')}
                                                        style={{ marginLeft: 8, padding: 0, background: 'none', border: 'none', fontSize: 12, fontWeight: 800, color: '#D94030', cursor: 'pointer' }}>
                                                        量 InBody 看起點 ›
                                                    </motion.button>
                                                )}
                                            </div>
                                        </div>
                                        </>) : (
                                            <div style={{ marginBottom: 36, padding: '0 8px' }}>
                                                <MemberLockCard feature="forecast" label="看會進步多少" />
                                            </div>
                                        )}
                                    </>
                                );
                            })()}

                            <SLabel mode={STEP_THEMES[2].mode}>想換動作？點一下就能改</SLabel>
                            <div style={{ marginBottom: 40, ...getLiquidGlassStyle(false, STEP_THEMES[2].mode), padding: '16px' }}>
                                <InlinePlanEditor plan={generatedPlan} onPlanChange={setGeneratedPlan} onAddTarget={(m) => {
                                    const tag = m === 'back' ? 'back' : m === 'chest' ? 'chest' : m;
                                    if (selectedHashtags.includes(tag)) return;
                                    toggleTag(tag);   // 胸／背是重點部位，沒有數量上限
                                    haptic('success');
                                    toast.success(`已把「${tag === 'back' ? '背' : '胸'}」加進目標，課表重新排好了`);
                                }} />
                            </div>

                            {/* 🚀 最終確認按鈕：.glassProminent 高亮透色玻璃 */}
                            <div style={{ marginTop: 24, paddingBottom: 60 }}>
                                <motion.button whileTap={{ scale: 0.96 }} onClick={handleConfirm} disabled={loading}
                                    style={{ 
                                        ...getLiquidGlassStyle(false, STEP_THEMES[2].mode, true), // 啟用 Prominent 模式
                                        width: '100%', padding: '24px', cursor: 'pointer', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, 
                                        letterSpacing: '0.1em', border: 'none'
                                    }}>
                                    {loading ? (
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#FFF', animation: 'spin 1s linear infinite' }} />
                                    ) : (
                                        <><CheckCircle2 size={20} color="#FFF" /><span style={{ fontSize: 16, fontWeight: 900, color: '#FFF' }}>開始這份課表</span></>
                                    )}
                                </motion.button>
                            </div>
                        </>) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', opacity: 0.4 }}>
                                <div style={{ fontSize: 48, fontWeight: 900, fontFamily: 'var(--font-body)', color: C.ink }}>...</div>
                                <p style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginTop: 16 }}>{genError ? '這組設定排不出課表，換一下部位或天數' : '先把前兩步選完'}</p>
                            </div>
                        )}
                    </StepCard>

                </div>
            </div>

            

            <style>{`
                @keyframes spin{to{transform:rotate(360deg)}}
                *{-webkit-tap-highlight-color:transparent}
                .beige-placeholder::placeholder {
                    color: rgba(245, 230, 211, 0.45) !important;
                    opacity: 1;
                }
            `}</style>
        </div>
    );
};

export default WorkoutPlanGeneratorViewMobile;
