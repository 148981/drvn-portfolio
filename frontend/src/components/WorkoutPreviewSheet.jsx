/**
 * WORKOUT PREVIEW SHEET  v2
 * ——————————————————————————————
 * Centered modal. Shows duration (plan-based), calories (MET),
 * muscle groups, equipment, hashtag tags, exercise list w/ thumbnails.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, Clock, Flame, Zap, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { findExerciseByName } from '../utils/exerciseDB';
import { haptic } from '../utils/haptics';
import { toZhExerciseName } from '../utils/exerciseNameZh';
import { getUserId } from '../utils/auth';
import useGymChoice from '../hooks/useGymChoice';
import GymChoiceRow from './GymChoiceRow';

// ─── Design tokens (luxury palette) ──────────────────────────────────────────
// 器材中文標籤（與 LuxuryPlanViewMobile 一致）
const EQ_LABEL = {
    barbell: '槓鈴', dumbbell: '啞鈴', cable: '纜繩',
    machine: '機械', bodyweight: '自重', band: '彈力帶',
};

const P = {
    paper: '#F6F4F1',
    stone: '#E4DED2',
    pebble: '#CFC6B8',
    dark: '#161415',
    mid: 'rgba(246, 244, 241, 0.6)',
    muted: 'rgba(246, 244, 241, 0.35)',
    coral: '#F95C4B',
    ember: '#D94030',
    titanium: '#B8B8B8', // Matte Silver Trim
    glass: 'rgba(255, 255, 255, 0.08)',
    // ── Liquid Glass (pebble white + coral) tokens ──
    inkSoft: 'rgba(43,39,34,0.62)',   // secondary text on light glass
    inkFaint: 'rgba(43,39,34,0.40)',   // tertiary / labels on light glass
    glassLite: 'rgba(255,255,255,0.55)',   // frosted pebble glass fill
    glassStroke: 'rgba(255,255,255,0.55)', // bright glass edge
};

const TEXTURES = {
    wood: 'url("/desktop/666.jpeg")',
    woodOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))',
    titanium: 'linear-gradient(145deg, #909090 0%, #B8B8B8 100%)',
    pebbleTitanium: 'linear-gradient(145deg, #BDB2A2 0%, #CFC6B8 100%)',
    satinSilver: 'linear-gradient(135deg, #B8B8B8 0%, #EBEBEB 30%, #FFFFFF 50%, #EBEBEB 70%, #B8B8B8 100%)',
    carbon: 'linear-gradient(45deg, #161415 25%, #262626 25%, #262626 50%, #161415 50%, #161415 75%, #262626 75%, #262626 100%)',
};

// ─── Z-INDEX LAYERS (集中管理，確立相對關係) ───
const Z_LAYERS = {
    base: 1,
    navBar: 99999,   // 底部導航列 (CapsuleNavigation 目前為 99999)
    floatingBtn: 100000,  // 浮動按鈕 (FAB)
    modalBackdrop: 999998,  // 彈出視窗遮罩（必須大於 navBar，完整覆蓋）
    modalContent: 999999   // 彈出視窗本體
};

const triggerHaptic = (style = 'medium') => haptic(style);


// ─────────────────────────────────────────
// DURATION HELPERS
// ─────────────────────────────────────────

// 解析 rest 字串為「秒數」，支援 "90s", "90", "NO REST", "0s", 數字
const parseRestSecs = (restRaw) => {
    if (restRaw === null || restRaw === undefined) return null;
    const s = String(restRaw).trim().toLowerCase();
    // 明確為「無休息」
    if (s === '' || s === 'no rest' || s === 'norest' || s === '0s' || s === '0') return 0;
    const match = s.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
};

// 判斷是否為複合/大重量動作（中英文雙語）
const isCompoundExercise = (name = '') => {
    const n = name.toLowerCase();
    const EN = ['squat', 'deadlift', 'bench press', 'overhead press', 'barbell row',
        'pull up', 'pullup', 'pull-up', 'leg press', 'hip thrust', 'lunge'];
    const ZH = ['深蹲', '硬舉', '臥推', '肩推', '划船', '引體向上', '腿推', '臀推', '弓箭步',
        '槓鈴', '上斜', '下斜', '窄握', '寬握'];
    return EN.some(k => n.includes(k)) || ZH.some(k => name.includes(k));
};

const getDefaultRestSecs = (ex) => {
    // 優先用計劃給定的休息時間
    const fromPlan = parseRestSecs(ex.rest);
    if (fromPlan !== null) return fromPlan;

    const repsStr = (ex.reps || '').toString();
    const maxRep = (() => {
        const parts = repsStr.split('-').map(p => parseInt(p)).filter(Boolean);
        return parts.length ? Math.max(...parts) : 12;
    })();
    if (isCompoundExercise(ex.name) && maxRep <= 6) return 180;
    if (isCompoundExercise(ex.name) && maxRep <= 10) return 120;
    if (isCompoundExercise(ex.name)) return 90;
    if (maxRep >= 15) return 45;
    return 75;
};

const getSetDurationSecs = (ex) => {
    const name = (ex.name || '').toLowerCase();
    const repsStr = (ex.reps || '10').toString();
    const maxRep = (() => {
        const parts = repsStr.split('-').map(p => parseInt(p)).filter(Boolean);
        return parts.length ? Math.max(...parts) : 12;
    })();
    // 靜態撐體類（棒式、靜蹲等）
    if (name.includes('plank') || name.includes('hold') || name.includes('wall sit') ||
        ex.name?.includes('棒式') || ex.name?.includes('平板')) return 60;
    // 有氧爆發類
    if (name.includes('run') || name.includes('jump') || name.includes('burpee') ||
        name.includes('mountain climber')) return Math.min(maxRep * 3, 90);
    // 複合大重量（中英文）
    if (isCompoundExercise(ex.name)) return Math.min(maxRep * 4, 70);
    return Math.min(maxRep * 3, 55);
};

const getDurationMins = (day) => {
    // 【v4.8 誠實時長】改以「逐動作推算」優先 —— 引擎的 day.time 只算
    //   組數×(工作+休息)，沒計入換器械緩衝(每動作~1min)與暖身(5min)，
    //   4 動作日會少估 8~12 分鐘（使用者回報「時間預測過於樂觀」的根因）。
    //   只有拿不到動作明細時才退回引擎粗估。
    const exercises = day?.exercises || [];
    if (!exercises.length) {
        if (day?.time) {
            const parsed = parseInt(day.time);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        return 45;
    }
    const totalSecs = exercises.reduce((total, ex) => {
        const sets = parseInt(ex.sets) || 3;
        const execSecs = getSetDurationSecs(ex);
        const restSecs = getDefaultRestSecs(ex);
        // 工作時間 + 組間休息（每組後都休息）+ 換器械緩衝 1 min
        return total + sets * (execSecs + restSecs) + 60;
    }, 0);
    // 加 5 min 暖身/整理
    return Math.round((totalSecs + 5 * 60) / 60);
};

// ─────────────────────────────────────────
// CALORIES — MET-based
// ─────────────────────────────────────────

// 判斷是否為高 CNS 大重量日（中英文）
const isHeavySession = (exercises = [], focus = '') => {
    const f = focus.toLowerCase();
    if (f.includes('power') || f.includes('strength') || f.includes('powerlifting')) return true;
    // 【v4.8b 誠實卡路里】只有「低次數(≤6)大重量複合動作」才算 heavy（MET 5.5）。
    //   舊版「含任一複合動作即 heavy」會讓幾乎所有課表（臥推/深蹲天天有）
    //   都拿最高檔 MET → 卡路里系統性高估 20~30%。
    //   依 Compendium of Physical Activities：一般 8-15 reps 阻力訓練 ≈ 3.5-5.0 MET，
    //   僅 powerlifting / 低次數大重量達 6.0。
    return exercises.some(ex => {
        if (!isCompoundExercise(ex.name)) return false;
        const parts = (ex.reps || '').toString().split('-').map(p => parseInt(p)).filter(Boolean);
        const maxRep = parts.length ? Math.max(...parts) : 12;
        return maxRep <= 6;
    });
};

// 判斷是否為 HIIT/有氧日（中英文）
const isHIITSession = (exercises = [], focus = '') => {
    const f = focus.toLowerCase();
    if (f.includes('hiit') || f.includes('cardio') || f.includes('circuit') ||
        f.includes('有氧') || f.includes('循環')) return true;
    const cardioKw = ['jump', 'burpee', 'mountain climber', 'sprint', 'run', '波比', '跳繩'];
    return exercises.some(ex => cardioKw.some(k => (ex.name || '').toLowerCase().includes(k)));
};

const estimateCalories = (day, durationMins, weightKg = 70) => {
    const exercises = day?.exercises || [];
    if (!exercises.length) return 0;
    const focus = day?.focus || '';

    // MET 分層（與 planFusionEngine 的分化邏輯對齊）
    // 【v4.8b】新增「一般含複合動作」中間檔 4.9 —— heavy 判定收緊後，
    //   臥推/深蹲等 8-12 reps 肌肥大課表落在此檔，不再全部誤入 5.5。
    let met;
    if (isHIITSession(exercises, focus)) met = 7.5;   // HIIT / 有氧電路
    else if (isHeavySession(exercises, focus)) met = 5.5;   // 低次數複合大重量
    else if (exercises.some(ex => isCompoundExercise(ex.name))) met = 4.9;   // 一般複合肌肥大
    else if (exercises.length >= 6) met = 4.8;   // 多動作隔離肌肥大
    else met = 4.2;   // 少動作 / 恢復型
    return Math.round(met * weightKg * (durationMins / 60));
};

// ─────────────────────────────────────────
// MUSCLE GROUPS
// ─────────────────────────────────────────
const extractMuscleGroups = (exercises = []) => {
    const seen = new Set();
    const order = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Glutes', 'Full Body'];
    exercises.forEach(ex => {
        (ex.muscle || ex.target_group || '').split('/').forEach(part => {
            const m = part.trim();
            if (m) seen.add(m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
        });
    });
    return [...seen].sort((a, b) => {
        const ia = order.findIndex(o => a.toLowerCase().includes(o.toLowerCase()));
        const ib = order.findIndex(o => b.toLowerCase().includes(o.toLowerCase()));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
};

// ─────────────────────────────────────────
// EQUIPMENT
// ─────────────────────────────────────────
const EQUIPMENT_RULES = [
    { keyword: ['barbell', 'deadlift', 'squat', 'bench press', 'overhead press', 'barbell row'], label: 'Barbell', icon: '🏋️' },
    { keyword: ['dumbbell', 'db ', 'lateral raise', 'fly', 'curl', 'kickback'], label: 'Dumbbell', icon: '💪' },
    { keyword: ['cable', 'pulldown', 'pushdown', 'face pull', 'seated cable'], label: 'Cable', icon: '🔩' },
    { keyword: ['machine', 'leg press', 'leg extension', 'leg curl', 'pec deck'], label: 'Machine', icon: '⚙️' },
    { keyword: ['pull up', 'pull-up', 'pullup', 'chin up', 'chin-up'], label: 'Pull-up Bar', icon: '🔧' },
    { keyword: ['pushup', 'push up', 'push-up', 'dip', 'plank', 'lunge', 'mountain'], label: 'Bodyweight', icon: '🤸' },
];

const extractEquipment = (exercises = []) => {
    const found = new Map();
    exercises.forEach(ex => {
        const name = (ex.name || '').toLowerCase();
        EQUIPMENT_RULES.forEach(rule => {
            if (rule.keyword.some(kw => name.includes(kw))) {
                if (!found.has(rule.label)) found.set(rule.label, rule.icon);
            }
        });
    });
    return [...found.entries()].map(([label, icon]) => ({ label, icon }));
};

// ─────────────────────────────────────────
// COLOUR HELPERS
// ─────────────────────────────────────────
// 🈶 肌群 → 中文（BACK/SHOULDERS… → 背/肩…；已是中文原樣）
const ZH_MUSCLE_TAG = { chest: '胸', back: '背', shoulders: '肩', shoulder: '肩', arms: '手臂', arm: '手臂', legs: '腿', leg: '腿', core: '核心', abs: '腹', glutes: '臀', glute: '臀', 'full body': '全身', quads: '股四頭', hamstrings: '腿後', biceps: '二頭', triceps: '三頭' };
const zhMuscleTag = (m) => ZH_MUSCLE_TAG[String(m || '').trim().toLowerCase()] || m;

const muscleChipStyle = (muscle = '') => {
    const m = muscle.toLowerCase();
    if (m.includes('chest')) return { bg: 'rgba(255,140,102,0.15)', text: '#E65C30', border: 'rgba(255,140,102,0.30)' };
    if (m.includes('back')) return { bg: 'rgba(160,196,255,0.15)', text: '#3B82F6', border: 'rgba(160,196,255,0.30)' };
    if (m.includes('leg') || m.includes('quad') || m.includes('ham'))
        return { bg: 'rgba(167,243,208,0.25)', text: '#059669', border: 'rgba(167,243,208,0.40)' };
    if (m.includes('glut')) return { bg: 'rgba(253,186,116,0.15)', text: '#EA580C', border: 'rgba(253,186,116,0.30)' };
    if (m.includes('shoulder')) return { bg: 'rgba(253,224,71,0.25)', text: '#D97706', border: 'rgba(253,224,71,0.40)' };
    if (m.includes('arm') || m.includes('bicep') || m.includes('tricep'))
        return { bg: 'rgba(196,181,253,0.15)', text: '#7C3AED', border: 'rgba(196,181,253,0.30)' };
    if (m.includes('core') || m.includes('ab'))
        return { bg: 'rgba(252,165,165,0.15)', text: '#DC2626', border: 'rgba(252,165,165,0.30)' };
    return { bg: 'rgba(0,0,0,0.04)', text: 'rgba(0,0,0,0.6)', border: 'rgba(0,0,0,0.08)' };
};

const tagColor = (tag = '') => {
    const t = tag.toLowerCase();
    if (t.includes('pain') || t.includes('posture') || t.includes('mobility')) return P.ember;
    if (t.includes('fat') || t.includes('lose') || t.includes('weight')) return '#D97706';
    if (t.includes('muscle') || t.includes('strong') || t.includes('pr') || t.includes('bench') || t.includes('squat') || t.includes('dead')) return P.coral;
    return P.coral; // Default to Coral for a unified boutique look
};

// ─────────────────────────────────────────
// EXERCISE DETAIL SHEET (Luxury bottom sheet)
// ─────────────────────────────────────────
// ─── 翻譯工具（MyMemory 免費 API + localStorage 快取）────────────────────────
// v2：v1 曾把「MYMEMORY WARNING…」錯誤字串快取起來，導致額度恢復後仍一直顯示警告。
// 升版 key 直接讓舊的中毒快取失效。
const TRANSLATE_CACHE_KEY = 'exercise_instruction_translations_v2';

// 判斷 MyMemory 回傳是否為「額度用盡 / 錯誤」訊息（而非真正的翻譯）。
// 額度滿時 API 會把警告字串塞進 translatedText，必須擋掉、不能當成翻譯顯示。
function isMyMemoryError(s) {
    if (!s) return true;
    const u = s.toUpperCase();
    return u.includes('MYMEMORY WARNING')
        || u.includes('USED ALL AVAILABLE FREE TRANSLATIONS')
        || u.includes('TRANSLATED.NET')
        || u.includes('QUERY LENGTH LIMIT')
        || u.includes('INVALID');
}

function getTranslateCache() {
    try {
        const raw = JSON.parse(localStorage.getItem(TRANSLATE_CACHE_KEY) || '{}');
        // 防禦：清掉任何先前誤存的錯誤字串，避免污染顯示
        let dirty = false;
        for (const k of Object.keys(raw)) {
            if (isMyMemoryError(raw[k])) { delete raw[k]; dirty = true; }
        }
        if (dirty) { try { localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(raw)); } catch { } }
        return raw;
    } catch { return {}; }
}
function setTranslateCache(cache) {
    try { localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(cache)); } catch { }
}

async function translateText(text) {
    const cache = getTranslateCache();
    if (cache[text] && !isMyMemoryError(cache[text])) return cache[text];
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-TW`;
        const res = await fetch(url);
        const json = await res.json();
        const translated = json?.responseData?.translatedText;
        const status = json?.responseStatus;
        // 額度用盡時 API 會回 quotaFinished:true → 直接視為失敗，退英文。
        if (json?.quotaFinished === true) return text;
        // 只有「成功 + 非錯誤訊息 + 與原文不同」才視為有效翻譯並快取。
        if (translated && translated !== text
            && !isMyMemoryError(translated)
            && (status === 200 || status === '200' || status == null)) {
            const newCache = getTranslateCache();
            newCache[text] = translated;
            setTranslateCache(newCache);
            return translated;
        }
    } catch { }
    return text; // 失敗 / 額度滿 → 回傳原文（英文），不顯示警告字串
}

async function translateInstructions(instructions) {
    if (!instructions || instructions.length === 0) return [];
    return Promise.all(instructions.map(step => translateText(step)));
}
// ─────────────────────────────────────────────────────────────────────────────

export const ExerciseDetailSheet = ({ ex, dbData: initialDbData, onClose, actionLabel, onAction }) => {
    const [dbData, setDbData] = useState(initialDbData);
    const [loading, setLoading] = useState(!initialDbData);
    const [imgIdx, setImgIdx] = useState(0);
    const [lastWeightData, setLastWeightData] = useState(null); // { weight, reps, date }
    const [translatedInstructions, setTranslatedInstructions] = useState(null);
    const [translating, setTranslating] = useState(false);
    const [showChinese, setShowChinese] = useState(true); // 語言切換，預設中文

    // 讀取 localStorage 歷史重量
    useEffect(() => {
        if (!ex.name) return;
        try {
            const raw = localStorage.getItem('workout_history');
            if (!raw) return;
            const history = JSON.parse(raw);
            // 從最新到最舊掃描，找到第一筆有這個動作且有重量的記錄
            for (let i = history.length - 1; i >= 0; i--) {
                const w = history[i];
                const exList = w.exercises || w.completedExercises || [];
                const found = exList.find(e =>
                    (e.name || '').toLowerCase().trim() === ex.name.toLowerCase().trim()
                );
                if (found) {
                    const sets = found.sets || found.completedSets || [];
                    const weightedSets = sets.filter(s => s.weight && parseFloat(s.weight) > 0);
                    if (weightedSets.length > 0) {
                        const maxW = Math.max(...weightedSets.map(s => parseFloat(s.weight)));
                        const lastSet = weightedSets[weightedSets.length - 1];
                        setLastWeightData({
                            weight: maxW,
                            reps: lastSet.reps || '—',
                            date: w.date || w.completedAt || w.timestamp || null,
                        });
                        break;
                    }
                }
            }
        } catch (e) { /* ignore */ }
    }, [ex.name]);

    useEffect(() => {
        if (!dbData && (ex.nameEn || ex.name)) {
            setLoading(true);
            // 優先用英文名查 DB（exerciseDB 的對照表 key 多為英文，命中率高）；
            // 找不到再退回中文名。修正「過頭三頭伸展」等中文名查無圖片的問題。
            const lookup = async () => {
                let data = ex.nameEn ? await findExerciseByName(ex.nameEn) : null;
                if (!data && ex.name) data = await findExerciseByName(ex.name);
                return data;
            };
            lookup().then(data => {
                setDbData(data || null);
                setLoading(false);
            }).catch(() => {
                setLoading(false);
            });
        }
    }, [ex.name, ex.nameEn, dbData]);

    // 按需翻譯：只在用戶選中文且尚未翻譯時才呼叫 API
    useEffect(() => {
        const rawInstructions = dbData?.instructions || [];
        if (!showChinese || rawInstructions.length === 0 || translatedInstructions) return;
        setTranslating(true);
        translateInstructions(rawInstructions).then(result => {
            setTranslatedInstructions(result);
            setTranslating(false);
        });
    }, [showChinese, dbData, translatedInstructions]);

    // 翻譯是否「沒成功」（額度滿/失敗 → 回傳的仍是英文原文）。用來提示使用者。
    const rawForCheck = dbData?.instructions || [];
    const translationUnavailable = showChinese
        && Array.isArray(translatedInstructions)
        && translatedInstructions.length > 0
        && rawForCheck.length > 0
        && translatedInstructions.every((t, i) => t === rawForCheck[i]);

    const images = dbData?.imageUrls || [];
    const hasImages = images.length > 0;

    const mc = muscleChipStyle(ex.muscle || '');
    const sets = parseInt(ex.sets) || 3;

    const primaryMuscles = dbData?.primaryMuscles || (ex.muscle ? [ex.muscle] : []);
    const secondaryMuscles = dbData?.secondaryMuscles || [];
    const rawInstructions = dbData?.instructions || [];
    // 根據語言切換顯示對應版本
    const instructions = showChinese
        ? (translatedInstructions || rawInstructions)
        : rawInstructions;
    const level = dbData?.level || null;
    const equipment = dbData?.equipment || null;

    const levelColor = level === 'beginner' ? '#059669' : level === 'intermediate' ? '#D97706' : level === 'expert' ? P.ember : P.muted;

    const nextImg = (e) => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length); };
    const prevImg = (e) => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length); };

    return ReactDOM.createPortal(
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                key="ex-detail-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    zIndex: Z_LAYERS.modalContent + 10,
                    background: 'rgba(22,20,21,0.72)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                }}
            >
                {/* Bottom Sheet */}
                <motion.div
                    key="ex-detail-sheet"
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 36 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '100%', maxWidth: 480,
                        maxHeight: '92dvh',
                        borderRadius: '20px 20px 0 0',
                        background: P.paper,
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden',
                        fontFamily: 'var(--font-body)',
                        boxShadow: '0 -20px 60px rgba(22,20,21,0.25)',
                    }}
                >
                    {/* Pill */}
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4, flexShrink: 0 }}>
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: P.pebble }} />
                    </div>

                    {/* Image area */}
                    <div style={{ position: 'relative', flexShrink: 0, height: hasImages ? 220 : 0, background: hasImages ? P.stone : 'transparent', overflow: 'hidden' }}>
                        {hasImages && (
                            <>
                                <motion.img
                                    key={imgIdx}
                                    src={images[imgIdx]}
                                    alt={ex.name}
                                    initial={{ opacity: 0, scale: 1.04 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.35 }}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                                {/* Dark gradient overlay at bottom */}
                                <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: 60, background: `linear-gradient(to top, ${P.paper}cc, transparent)` }} />
                                {/* Image nav */}
                                {images.length > 1 && (
                                    <>
                                        <motion.button {...pressProps('row')} aria-label="上一個" onClick={prevImg} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', background: 'rgba(22,20,21,0.38)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <ChevronLeft size={14} color={P.paper} />
                                        </motion.button>
                                        <motion.button {...pressProps('row')} aria-label="下一個" onClick={nextImg} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', background: 'rgba(22,20,21,0.38)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <ChevronRight size={14} color={P.paper} />
                                        </motion.button>
                                        {/* Dot indicators */}
                                        <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                                            {images.map((_, di) => (
                                                <div key={di} style={{ width: di === imgIdx ? 10 : 4, height: 3, borderRadius: 99, background: di === imgIdx ? P.coral : P.pebble, transition: 'all 0.3s' }} />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                        {/* Close button (top right, always visible) */}
                        <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: `rgba(22,20,21,${hasImages ? '0.45' : '0.07'})`, border: `1px solid rgba(22,20,21,${hasImages ? '0.0' : '0.08'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}
 >
                            <X size={13} color={hasImages ? P.paper : P.dark} strokeWidth={2.5} />
                        </motion.button>
                    </div>

                    {/* Scrollable content */}
                    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '18px 20px 36px' }}>

                        {/* Name + meta — Swiss editorial：大寫 kicker → 輕量大標 → 一行 hairline meta */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.32em', color: 'rgba(22,20,21,0.32)', marginBottom: 10 }}>
                                Exercise · 動作
                            </div>
                            <h2 style={{ margin: 0, fontSize: 30, fontFamily: 'var(--font-display)', fontWeight: 400, color: P.dark, letterSpacing: '-0.025em', lineHeight: 1.04 }}>
                                {ex.name}
                            </h2>
                            {(level || equipment) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                                    {level && (
                                        <>
                                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: levelColor }}>
                                                {level}
                                            </span>
                                        </>
                                    )}
                                    {level && equipment && <span style={{ width: 3, height: 3, borderRadius: '50%', background: P.pebble }} />}
                                    {equipment && (
                                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.45)' }}>
                                            {equipment}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Hairline rule (full-bleed feel) */}
                        <div style={{ height: 1.5, background: P.dark, marginBottom: 22 }} />

                        {/* Plan prescription — Swiss data row：輕量大數字 × 細窄大寫標籤，直角 Pebble 分隔線 */}
                        <div style={{ marginBottom: 24 }}>
                            <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', color: 'rgba(22,20,21,0.32)' }}>本次計劃 · Prescription</p>
                            <div style={{ display: 'flex', alignItems: 'stretch' }}>
                                {[
                                    { v: sets, l: 'Sets · 組' },
                                    { v: ex.reps || '—', l: 'Reps · 次' },
                                    ...(ex.rest ? [{ v: ex.rest, l: 'Rest · 休' }] : []),
                                ].map((c, i, arr) => (
                                    <React.Fragment key={c.l}>
                                        <div style={{ flex: 1, textAlign: 'left' }}>
                                            <div style={{ fontSize: String(c.v).length > 3 ? 30 : 42, fontWeight: 300, color: P.dark, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 0.9 }}>{c.v}</div>
                                            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.40)', marginTop: 10 }}>{c.l}</div>
                                        </div>
                                        {i < arr.length - 1 && (
                                            <div style={{ width: 1.5, alignSelf: 'stretch', background: P.pebble }} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>

                        {/* Last Weight — Swiss：頂線分隔，左標籤右數值，數字輕量 tabular */}
                        <div style={{ marginBottom: 24 }}>
                            <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', color: 'rgba(22,20,21,0.32)' }}>上次重量 · Last Load</p>
                            {lastWeightData ? (
                                <div style={{ display: 'flex', alignItems: 'stretch', borderTop: `1.5px solid ${P.dark}`, borderBottom: `1px solid ${P.pebble}` }}>
                                    <div style={{ flex: 2, padding: '14px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                            <span style={{ fontSize: 34, fontWeight: 300, color: P.coral, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 0.9 }}>{lastWeightData.weight}</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(249,92,75,0.7)' }}>kg</span>
                                        </div>
                                        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(249,92,75,0.6)', marginTop: 9 }}>最大重量 · Max</div>
                                    </div>
                                    <div style={{ width: 1, alignSelf: 'stretch', background: P.pebble }} />
                                    <div style={{ flex: 1, padding: '14px 0 14px 16px' }}>
                                        <div style={{ fontSize: 28, fontWeight: 300, color: P.dark, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 0.9 }}>{lastWeightData.reps}</div>
                                        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.40)', marginTop: 9 }}>次 · Reps</div>
                                    </div>
                                    {lastWeightData.date && (
                                        <>
                                            <div style={{ width: 1, alignSelf: 'stretch', background: P.pebble }} />
                                            <div style={{ flex: 1.4, padding: '14px 0 14px 16px' }}>
                                                <div style={{ fontSize: 17, fontWeight: 400, color: P.dark, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1 }}>
                                                    {new Date(lastWeightData.date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                                </div>
                                                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.40)', marginTop: 13 }}>日期 · Date</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div style={{ padding: '14px 0', borderTop: `1.5px solid ${P.dark}`, borderBottom: `1px solid ${P.pebble}` }}>
                                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(22,20,21,0.32)', fontWeight: 500, letterSpacing: '0.04em' }}>尚無歷史紀錄 · No records yet</p>
                                </div>
                            )}
                        </div>

                        {/* Muscles — Swiss：只保留主要目標肌群，扁平大寫 + Coral 底線 */}
                        {primaryMuscles.length > 0 && (
                            <div style={{ marginBottom: 24 }}>
                                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', color: 'rgba(22,20,21,0.32)' }}>目標肌群 · Target</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
                                    {primaryMuscles.map(m => (
                                        <span key={m} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: P.dark, borderBottom: `2px solid ${P.coral}`, paddingBottom: 2 }}>
                                            {zhMuscleTag(m)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Instructions */}
                        {!loading && rawInstructions.length > 0 && (
                            <div>
                                <div style={{ height: 1.5, background: P.dark, marginBottom: 18 }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', color: 'rgba(22,20,21,0.32)' }}>動作說明 · Form</p>
                                    {/* 語言切換 — Swiss：直角分段，細邊框 */}
                                    <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 6, border: `1.5px solid ${P.dark}`, overflow: 'hidden' }}>
                                        <motion.button {...pressProps('row')}
 onClick={() => setShowChinese(true)}
 style={{
 padding: '5px 12px', border: 'none', borderRight: `1.5px solid ${P.dark}`, cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', transition: 'all 0.18s',
 background: showChinese ? P.dark : 'transparent',
 color: showChinese ? P.paper : 'rgba(22,20,21,0.45)',
 }}
 >
                                            {translating && showChinese ? '譯…' : '中文'}
                                        </motion.button>
                                        <motion.button {...pressProps('row')}
 onClick={() => setShowChinese(false)}
 style={{
 padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'all 0.18s',
 background: !showChinese ? P.dark : 'transparent',
 color: !showChinese ? P.paper : 'rgba(22,20,21,0.45)',
 }}
 >
                                            EN
                                        </motion.button>
                                    </div>
                                </div>
                                {/* 翻譯暫時無法使用（額度滿）→ 顯示英文，並清楚告知 */}
                                {translationUnavailable && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, padding: '9px 12px', borderRadius: 12, background: 'rgba(217,64,48,0.06)', border: '1px solid rgba(217,64,48,0.16)' }}>
                                        <span style={{ fontSize: 11, lineHeight: 1.5, color: P.ember, fontWeight: 600 }}>
                                            中文翻譯今日額度已用完，暫時顯示英文原文。明日恢復後會自動翻譯。
                                        </span>
                                    </div>
                                )}
                                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
                                    {instructions.map((step, si) => (
                                        <li key={si} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '13px 0', borderTop: si === 0 ? 'none' : `1px solid ${P.stone}` }}>
                                            {/* Step number — Swiss：輕量大寫序號，無框 */}
                                            <span style={{ flexShrink: 0, width: 22, fontSize: 13, fontWeight: 400, color: P.coral, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1.5, paddingTop: 1 }}>
                                                {String(si + 1).padStart(2, '0')}
                                            </span>
                                            <p style={{ margin: 0, fontSize: 13, color: 'rgba(22,20,21,0.72)', lineHeight: 1.6, fontWeight: 500 }}>{step}</p>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}

                        {/* Loading State */}
                        {loading && (
                            <div style={{ padding: '40px 0', textAlign: 'center' }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${P.pebble}`, borderTopColor: P.coral, animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                                <p style={{ margin: '12px 0 0', fontSize: 9, color: P.muted, fontWeight: 700, letterSpacing: '0.1em' }}>FETCHING DATABASE...</p>
                                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            </div>
                        )}

                        {/* Empty state：資料庫沒有這個動作的圖片/說明（非翻譯問題，是真的查無資料） */}
                        {!loading && (!dbData || rawInstructions.length === 0) && (
                            <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                                {!hasImages && (
                                    <Dumbbell size={30} color={P.pebble} strokeWidth={1.5} style={{ margin: '0 auto 12px' }} />
                                )}
                                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: P.dark }}>
                                    此動作暫無示範圖片與說明
                                </p>
                                <p style={{ margin: 0, fontSize: 11.5, color: P.muted, lineHeight: 1.6 }}>
                                    動作資料庫尚未收錄「{ex.name}」的教學內容。<br />
                                    你仍可依上方的組數、次數與休息時間進行訓練。
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 固定底部動作列：用於「新增動作」流程，點擊把此動作加入課表 — Swiss 直角 Coral 條 */}
                    {actionLabel && onAction && (
                        <div style={{ flexShrink: 0, padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', borderTop: `1.5px solid ${P.dark}`, background: P.paper }}>
                            <motion.button
                                whileTap={{ scale: 0.985 }}
                                onClick={() => { onAction(ex); onClose(); }}
                                style={{ width: '100%', padding: '16px 0', border: 'none', borderRadius: 8, background: P.coral, color: '#FFF', fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
                            >
                                <Plus size={16} strokeWidth={2.6} /> {actionLabel}
                            </motion.button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

// ─────────────────────────────────────────
// SUPERSET THUMBNAIL (lazy image loader)
// ─────────────────────────────────────────
const SupersetThumb = ({ name, nameEn }) => {
    const [img, setImg] = useState(null);
    useEffect(() => {
        let c = false;
        if ((nameEn || name) && typeof findExerciseByName === 'function') {
            // 英文名優先，找不到再退中文名
            (async () => {
                let d = nameEn ? await findExerciseByName(nameEn) : null;
                if (!d && name) d = await findExerciseByName(name);
                if (!c && d?.imageUrls?.[0]) setImg(d.imageUrls[0]);
            })().catch(() => { });
        }
        return () => { c = true; };
    }, [name, nameEn]);
    return img
        ? <img loading="lazy" decoding="async" src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <Dumbbell size={14} color="rgba(22,20,21,0.3)" strokeWidth={2} />;
};

// ─────────────────────────────────────────
// EXERCISE ROW
// ─────────────────────────────────────────
const ExerciseRow = ({ ex, index, onTap }) => {
    const [img, setImg] = useState(null);
    const [dbData, setDbData] = useState(null);
    // 🆕 細部位+器材提示（中胸·槓鈴），與深色計劃頁同一份資料來源 analyzeExercise
    const [meta, setMeta] = useState({ targetLabel: '', eqLabel: '' });

    useEffect(() => {
        let cancelled = false;
        if (typeof findExerciseByName === 'function') {
            (async () => {
                let data = ex.nameEn ? await findExerciseByName(ex.nameEn) : null;
                if (!data && ex.name) data = await findExerciseByName(ex.name);
                return data;
            })().then(data => {
                if (!cancelled) {
                    setDbData(data || null);
                    if (data?.imageUrls?.[0]) setImg(data.imageUrls[0]);
                }
            }).catch(() => { });
        }
        // 動態載入動作分析，取得細部位標籤；器材標籤由 ex.eq 對照（與 LuxuryPlanViewMobile 一致）
        import('../data/globalExerciseRegistry').then(({ analyzeExercise }) => {
            if (cancelled) return;
            try {
                const info = analyzeExercise(ex);
                const eqLabel = EQ_LABEL[ex.eq] || (ex.eq ? String(ex.eq).toUpperCase() : '');
                setMeta({ targetLabel: info?.targetLabel || '', eqLabel });
            } catch { /* 取不到就不顯示這行 */ }
        }).catch(() => { });
        return () => { cancelled = true; };
    }, [ex.name, ex.nameEn]);

    const mc = muscleChipStyle(ex.muscle || '');
    const sets = parseInt(ex.sets) || 3;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 + index * 0.04, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onTap && onTap(ex, dbData)}
            style={{
                // 瑞士極簡：無 bento 面板，hairline 橫線分隔；保留左側縮圖
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 2px',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                borderBottom: '1px solid rgba(43,39,34,0.10)',
            }}
            whileTap={{ scale: 0.99 }}
        >
            <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#EAE6DF', border: `1px solid rgba(0,0,0,0.05)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {img ? <img loading="lazy" decoding="async" src={img} alt={ex.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Dumbbell size={18} color={P.inkFaint} strokeWidth={2} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: P.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>{ex.name}</div>
                {/* 🆕 細部位 · 器材（如 中胸 · 槓鈴），珊瑚色細部位 + 灰色器材 */}
                {(meta.targetLabel || meta.eqLabel) && (
                    <div style={{ fontSize: 11, marginTop: 2, letterSpacing: '0.04em', fontWeight: 600 }}>
                        <span style={{ color: P.coral }}>{meta.targetLabel}</span>
                        {meta.targetLabel && meta.eqLabel && <span style={{ color: 'rgba(22,20,21,0.30)', margin: '0 5px' }}>·</span>}
                        {/* 🆕 器材標籤加深 */}
                        <span style={{ color: 'rgba(22,20,21,0.62)' }}>{meta.eqLabel}</span>
                    </div>
                )}
                <div style={{ fontSize: 9, fontWeight: 600, color: P.inkFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3, fontFamily: '"Geist Mono", monospace' }}>
                    {sets} sets × {ex.reps}{ex.rest ? `  ·  ${ex.rest} rest` : ''}
                </div>
                {/* 🏋️ 照健身房換過的動作：標出原本是什麼 */}
                {ex.gymOrig?.name && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: P.ember, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        取代 {toZhExerciseName(ex.gymOrig.name)}
                    </div>
                )}
            </div>
            {ex.muscle && (
                <div style={{ padding: '4px 9px', borderRadius: 99, background: 'transparent', border: `1px solid rgba(249,92,75,0.4)`, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: P.ember, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{zhMuscleTag(ex.muscle.split('/')[0].trim())}</span>
                </div>
            )}
            <ChevronRight size={14} color={P.inkFaint} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        </motion.div>
    );
};

// ─────────────────────────────────────────
// MINI STAT CARD
// ─────────────────────────────────────────
const MiniStat = ({ icon: Icon, value, unit, label, color, delay }) => (
    // 💧 黑色 Liquid Glass 統計卡：深墨半透明 + backdrop 模糊（拉絲金屬底透進來）
    //    + 頂部 specular 受光面 + 髮絲反光邊 —— 金屬牆上浮著深色玻璃磚。
    <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, ease: [0.16, 1, 0.3, 1] }}
        style={{
            flex: 1, borderRadius: 18, padding: '14px 12px',
            position: 'relative', overflow: 'hidden', isolation: 'isolate',
            display: 'flex', flexDirection: 'column', gap: 8,
            background: 'linear-gradient(160deg, rgba(28,25,23,0.80) 0%, rgba(16,15,14,0.88) 100%)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.16)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(0,0,0,0.35), 0 10px 26px -10px rgba(0,0,0,0.45)',
        }}
    >
        {/* 頂部 specular 受光面 */}
        <span aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit',
            background: 'radial-gradient(130% 60% at 20% -10%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%)',
        }} />
        <Icon size={14} color="rgba(246,244,241,0.75)" strokeWidth={2} style={{ position: 'relative', zIndex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, position: 'relative', zIndex: 1 }}>
            <span style={{ fontSize: 24, fontWeight: 400, color: '#F6F4F1', fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(246,244,241,0.45)', marginLeft: 1, fontFamily: '"Geist Mono", monospace' }}>{unit}</span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(246,244,241,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: '"Geist Mono", monospace', position: 'relative', zIndex: 1 }}>{label}</span>
    </motion.div>
);

// ─────────────────────────────────────────
// CHIP
// ─────────────────────────────────────────
const Chip = ({ label, icon, bg, text, border }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 99, background: 'transparent', border: `1px solid ${border}`, marginRight: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: text, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
    </div>
);

// ─────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────
const SectionLabel = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', marginBottom: 12 }}>
        <h3 style={{ margin:0, fontSize: 9, fontWeight:600, letterSpacing:'0.28em', textTransform:'uppercase', color:'rgba(43,39,34,0.55)', fontFamily:'"Geist Mono", monospace' }}>{children}</h3>
        <div style={{ flex: 1, height: 1, background: 'rgba(43,39,34,0.10)' }} />
    </div>
);

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
const WorkoutPreviewSheet = ({
    day,
    cardColor = '#FF9E80',
    weekdayName = 'TODAY',
    planTags = [],
    userWeightKg = 70,
    userId: userIdProp,
    onStart,
    onClose,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    /* 左上角：回到健身頁（計劃頁）。從首頁點今日焦點打開時，這是去看整份課表的路；
       本來就在計劃頁打開的話，關掉就是回到健身頁。 */
    const goPlanPage = () => {
        haptic('light');
        onClose?.();
        if (location.pathname !== '/luxury-plan-view-mobile') navigate('/luxury-plan-view-mobile');
    };
    /* 🏋️ 在哪間練：選了健身房，下面的菜單（動作、器材、時長）就換成這間做得到的。
       選擇跟著課表帶進訓練頁（day.gymChoice），由 useGymSession 記錄這一場在哪練。 */
    const userId = userIdProp || (() => { try { return getUserId(); } catch { return null; } })();
    const planExercises = useMemo(() => day?.exercises || [], [day]);
    const gymChoice = useGymChoice({ userId, exercises: planExercises, enabled: planExercises.length > 0 });
    const exercises = gymChoice.exercises;
    const viewDay = useMemo(() => (day ? { ...day, exercises } : day), [day, exercises]);
    const durationMins = useMemo(() => getDurationMins(viewDay), [viewDay]);
    const calories = useMemo(() => estimateCalories(viewDay, durationMins, userWeightKg), [viewDay, durationMins, userWeightKg]);
    const startWithGym = () => onStart && onStart(day ? { ...day, exercises, gymChoice: gymChoice.choice } : day, gymChoice.choice);
    const muscleGroups = useMemo(() => extractMuscleGroups(exercises), [exercises]);
    const equipment = useMemo(() => extractEquipment(exercises), [exercises]);
    const totalSets = exercises.reduce((s, ex) => s + (parseInt(ex.sets) || 3), 0);
    const focusLabel = day?.focus ? day.focus.split('(')[0].replace(/\+/g, ' ').trim().toUpperCase() : 'TRAINING';

    // ── Exercise detail popup state ──
    const [detailEx, setDetailEx] = useState(null);   // plan ex object
    const [detailDbData, setDetailDbData] = useState(null);   // exerciseDB data

    // ── 暖身動作預設收合：使用者進來先看到「動作計劃」，而非一長串暖身清單 ──
    const [warmupOpen, setWarmupOpen] = useState(false);

    const handleExTap = (ex, dbData) => {
        setDetailEx(ex);
        setDetailDbData(dbData);
    };
    const handleDetailClose = () => {
        setDetailEx(null);
        setDetailDbData(null);
    };

    // Filter planTags relevant to this session's muscles
    const relevantTags = planTags.filter(tag => {
        const t = tag.toLowerCase().replace('#', '');
        return muscleGroups.some(m => {
            const ml = m.toLowerCase();
            if (t.includes('chest') && ml.includes('chest')) return true;
            if (t.includes('arm') && (ml.includes('arm') || ml.includes('bicep') || ml.includes('tricep'))) return true;
            if ((t.includes('glute') || t.includes('booty')) && (ml.includes('glut') || ml.includes('leg'))) return true;
            if (t.includes('back') && ml.includes('back')) return true;
            if (t.includes('shoulder') && ml.includes('shoulder')) return true;
            if ((t.includes('leg') || t.includes('squat')) && (ml.includes('leg') || ml.includes('quad'))) return true;
            if ((t.includes('core') || t.includes('abs')) && (ml.includes('core') || ml.includes('ab'))) return true;
            return false;
        });
    }).slice(0, 4);
    const displayTags = relevantTags.length > 0 ? relevantTags : planTags.slice(0, 4);

    const mainPortal = ReactDOM.createPortal(
        <AnimatePresence>
            {/* Backdrop — also acts as flex container for centering */}
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: Z_LAYERS.modalBackdrop,
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px 14px',
                }}
            >
                {/* ── CENTERED MODAL ── */}
                <motion.div
                    key="modal"
                    initial={{ scale: 0.88, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.88, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '100%', maxWidth: 400,
                        maxHeight: '82dvh',
                        borderRadius: 28,
                        // 🆕 DRVN：底材質 = 11.jpeg 拉絲金屬照片直接當 modal 背景圖（四角被 borderRadius 裁切）
                        backgroundImage: "url('/desktop/11.jpeg')",
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: '1px solid rgba(255,255,255,0.6)',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        isolation: 'isolate',
                        // 🆕 特斯拉質感紅光暈（加強版）：大卡牌四周明顯但不刺眼的 coral 外發光
                        boxShadow: [
                            'inset 0 1px 0 rgba(255,255,255,0.75)',
                            'inset 0 -1px 2px rgba(255,255,255,0.25)',
                            '0 0 0 1.5px rgba(249,92,75,0.22)',        // 細紅色內描邊（更實）
                            '0 0 22px rgba(249,92,75,0.40)',           // 近層柔紅光（更亮）
                            '0 0 56px rgba(249,92,75,0.28)',           // 中層紅暈
                            '0 0 110px rgba(249,92,75,0.16)',          // 遠層大面積暈散
                            '0 24px 60px -18px rgba(43,39,34,0.42)',   // 原本的深度陰影
                        ].join(', ')
                    }}
                >
                    {/* 🆕 Liquid Glass 鏡面反光：左上角的柔光斜帶（光線打在玻璃上的反射） */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, borderRadius: 'inherit',
                        background: 'radial-gradient(120% 80% at 18% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 45%), linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 26%)',
                        mixBlendMode: 'screen',
                    }} />

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        {/* Top glow line */}
                        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)`, pointerEvents: 'none' }} />

                        <div style={{
                            padding: '24px 20px 20px',
                            borderBottom: '1px solid rgba(43,39,34,0.10)',
                            flexShrink: 0,
                            position: 'relative',
                            overflow: 'hidden'
                        }}>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'relative', zIndex: 1 }}>
                                <motion.button {...pressProps('row')} onClick={goPlanPage}
                                    style={{ height: 44, padding: '0 16px 0 10px', borderRadius: 999, background: 'rgba(255,255,255,0.55)', border: `1px solid ${P.glassStroke}`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: P.dark, fontSize: 14, fontWeight: 800 }}>
                                    <ChevronLeft size={18} color={P.dark} strokeWidth={2.4} />
                                    健身頁
                                </motion.button>
                                <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', border: `1px solid ${P.glassStroke}`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <X size={14} color={P.inkSoft} strokeWidth={2.6} />
                                </motion.button>
                            </div>

                            {/* Day badge + title */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24, position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    width: 68, height: 68, borderRadius: 24, flexShrink: 0,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    position: 'relative', overflow: 'hidden', isolation: 'isolate',
                                    // 🆕 Liquid Glass DAY 徽章：半透明亮玻璃 + 鏡面反光邊
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 50%, rgba(255,255,255,0.50) 100%)',
                                    backdropFilter: 'blur(20px) saturate(180%)',
                                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                                    border: '1px solid rgba(255,255,255,0.7)',
                                    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.8), inset 0 -2px 6px rgba(255,255,255,0.2), 0 8px 22px rgba(43,39,34,0.14)',
                                }}>
                                    {/* 鏡面高光 */}
                                    <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit', background: 'radial-gradient(120% 75% at 22% 0%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 50%)', mixBlendMode: 'screen' }} />
                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#161415', opacity: 0.6, letterSpacing: '0.2em', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>DAY</span>
                                    <span style={{ fontSize: 32, fontWeight: 900, color: '#161415', fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', lineHeight: 1 }}>{day?.dayNumber || 1}</span>
                                </div>
                                <div style={{ paddingTop: 2 }}>
                                    <div style={{ fontSize: 28, fontWeight: 400, color: P.dark, fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', letterSpacing: '0.05em', lineHeight: 1 }}>{(() => {
                                        const ZH_DAY = { SUNDAY: '星期日', MONDAY: '星期一', TUESDAY: '星期二', WEDNESDAY: '星期三', THURSDAY: '星期四', FRIDAY: '星期五', SATURDAY: '星期六', TODAY: '今天' };
                                        return ZH_DAY[String(weekdayName).toUpperCase()] || weekdayName;
                                    })()}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                        <div style={{ width: 18, height: 2, background: P.coral, borderRadius: 99 }} />
                                        <div style={{ fontSize: 9, fontWeight: 700, color: P.inkSoft, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{focusLabel}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Stat row */}
                            <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 1 }}>
                                {/* DRVN：一個畫面一個 Coral（給 START）。數據圖示降為中性深墨 */}
                                <MiniStat icon={Clock} value={durationMins} unit="min" label="時長" color="#161415" delay={0.05} />
                                <MiniStat icon={Flame} value={calories} unit="kcal" label="預估消耗" color="#161415" delay={0.09} />
                                <MiniStat icon={Dumbbell} value={exercises.length} unit="" label="動作數" color="#161415" delay={0.12} />
                            </div>
                        </div>

                        {/* ── SCROLLABLE BODY ── */}
                        <style>{`
                        .no-scrollbar::-webkit-scrollbar { display: none; }
                        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                    `}</style>
                        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

                            {planExercises.length > 0 && gymChoice.ready && (
                                <div style={{ padding: '14px 16px 0' }}>
                                    <SectionLabel>訓練地點</SectionLabel>
                                    <GymChoiceRow g={gymChoice} />
                                </div>
                            )}

                            {muscleGroups.length > 0 && (
                                <div style={{ padding: '14px 16px 0' }}>
                                    <SectionLabel>訓練肌群</SectionLabel>
                                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                        {muscleGroups.map(m => {
                                            const s = muscleChipStyle(m);
                                            // 🈶 肌群標籤中文化（BACK/SHOULDERS… → 背/肩…）
                                            const ZH_MUSCLE = { chest: '胸', back: '背', shoulders: '肩', shoulder: '肩', arms: '手臂', arm: '手臂', legs: '腿', leg: '腿', core: '核心', abs: '腹', glutes: '臀', 'full body': '全身', quads: '股四頭', hamstrings: '腿後' };
                                            const zh = ZH_MUSCLE[String(m).trim().toLowerCase()] || m;
                                            return <Chip key={m} label={zh} bg={s.bg} text={s.text} border={s.border} />;
                                        })}
                                    </div>
                                </div>
                            )}

                            {equipment.length > 0 && (
                                <div style={{ padding: '12px 16px 0' }}>
                                    <SectionLabel>所需器材</SectionLabel>
                                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                        {equipment.map(eq => (
                                            <Chip key={eq.label} label={eq.label} icon={eq.icon} bg="transparent" text={P.inkSoft} border={'rgba(43,39,34,0.20)'} />
                                        ))}
                                    </div>
                                </div>
                            )}



                            {/* ── WARM-UP（預設收合，瑞士極簡可展開列）── */}
                            {(day?.warmup || []).length > 0 && (
                                <div style={{ padding: '14px 16px 0' }}>
                                    {/* 可點擊的收合標頭：沿用 SectionLabel 語彙 + 右側計數與箭頭 */}
                                    <motion.button {...pressProps('row')}
 onClick={() => setWarmupOpen(o => !o)}
 style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 8,
 padding: '0 2px', marginBottom: warmupOpen ? 12 : 0,
 background: 'transparent', border: 'none', cursor: 'pointer',
 WebkitTapHighlightColor: 'transparent',
 }}
 >
                                        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: '0.28em', color: 'rgba(43,39,34,0.55)', fontFamily: '"Geist Mono", monospace' }}>暖身動作</h3>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: P.inkFaint, fontFamily: '"Geist Mono", monospace', letterSpacing: '0.05em' }}>{(day.warmup).length}</span>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(43,39,34,0.10)' }} />
                                        <ChevronRight
                                            size={13} color={P.inkFaint} strokeWidth={2.4}
                                            style={{ transform: warmupOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)', flexShrink: 0 }}
                                        />
                                    </motion.button>
                                    <AnimatePresence initial={false}>
                                        {warmupOpen && (
                                            <motion.div
                                                key="warmup-list"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                                                style={{ overflow: 'hidden' }}
                                            >
                                                {(day.warmup).map((ex, i) => (
                                                    <div
                                                        key={i}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 12,
                                                            padding: '12px 0', borderBottom: '1px solid rgba(43,39,34,0.08)'
                                                        }}
                                                    >
                                                        {/* Swiss editorial：以單色索引標記取代 emoji */}
                                                        <span style={{ width: 22, flexShrink: 0, fontSize: 11, fontWeight: 500, color: P.inkFaint, fontFamily: '"Geist Mono", monospace', letterSpacing: '0.05em' }}>
                                                            {String(i + 1).padStart(2, '0')}
                                                        </span>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 500, color: P.dark, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>{ex.name}</div>
                                                            <div style={{ fontSize: 9, color: P.inkFaint, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2, fontFamily: '"Geist Mono", monospace' }}>{ex.reps}</div>
                                                        </div>
                                                        <span style={{ fontSize: 11, color: P.inkFaint, fontWeight: 500, fontFamily: '"Geist Mono", monospace' }}>{ex.time}m</span>
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            <div style={{ padding: '14px 16px 0' }}>
                                <SectionLabel>動作計劃</SectionLabel>
                                {(() => {
                                    // ── Build superset / drop-set groups ──────────────
                                    const exList = exercises || [];
                                    const groups = [];
                                    let idx = 0;
                                    while (idx < exList.length) {
                                        const ex = exList[idx];
                                        const ssId = ex.supersetId || ex.supersetGroup;
                                        if (ssId) {
                                            const pair = [];
                                            while (idx < exList.length && (exList[idx].supersetId || exList[idx].supersetGroup) === ssId) {
                                                pair.push(exList[idx]); idx++;
                                            }
                                            groups.push({ type: 'superset', pair, supersetType: pair[0]?.supersetType });
                                        } else {
                                            groups.push({ type: 'standalone', ex, origIdx: idx }); idx++;
                                        }
                                    }

                                    let ssCounter = 0;
                                    return groups.map((g, gi) => {
                                        // ── SUPERSET CARD ──────────────────────────────
                                        if (g.type === 'superset') {
                                            ssCounter++;
                                            const isAntag = g.supersetType === 'antagonist';
                                            // 強調色：拮抗組 coral，燃盡組 ember（皆於淺色玻璃上可讀）
                                            const ssBg = isAntag ? P.coral : P.ember;
                                            const ssLabel = isAntag ? '拮抗肌超級組' : '力竭超級組';
                                            const letters = 'ABCDEFGH';
                                            return (
                                                <motion.div key={gi}
                                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.06 + gi * 0.04 }}
                                                    style={{
                                                        // 瑞士極簡：無 bento 面板，左側 coral 細線標記超級組，底部 hairline 分隔
                                                        position: 'relative',
                                                        padding: '14px 2px 16px 14px',
                                                        borderLeft: `2px solid ${ssBg}`,
                                                        borderBottom: '1px solid rgba(43,39,34,0.10)',
                                                    }}
                                                >
                                                    {/* Header */}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 8 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            {/* 超級組：實心膠囊強調（拮抗 coral / 燃盡 ember），與收尾組一致 */}
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: ssBg, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                                                                {isAntag ? <Zap size={11} color="#fff" strokeWidth={2.4} /> : <Flame size={11} color="#fff" strokeWidth={2.4} />}
                                                                SS{ssCounter}
                                                            </span>
                                                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: P.inkSoft }}>{ssLabel}</span>
                                                        </div>
                                                    </div>
                                                    {/* Exercises in pair */}
                                                    {g.pair.map((ex, pi) => (
                                                        <div key={pi} style={{ paddingLeft: 8 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 6, cursor: 'pointer' }}
                                                                onClick={() => handleExTap && handleExTap(ex, null)}>
                                                                <div style={{ width: 42, height: 42, borderRadius: 0, overflow: 'hidden', flexShrink: 0, background: 'rgba(43,39,34,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <SupersetThumb name={ex.name} nameEn={ex.nameEn} />
                                                                </div>
                                                                <div style={{
                                                                    width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900,
                                                                    background: pi === 0 ? ssBg : 'rgba(43,39,34,0.1)', color: pi === 0 ? '#fff' : P.inkSoft
                                                                }}>
                                                                    {letters[pi] || pi + 1}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 13, fontWeight: 500, color: P.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>{ex.name}</div>
                                                                    <div style={{ fontSize: 12, fontWeight: 600, color: P.inkFaint, letterSpacing: '0.1em', marginTop: 2, fontFamily: '"Geist Mono", monospace' }}>
                                                                        {ex.sets} 組 × {ex.reps}{ex.rest === '0s' ? <span style={{ color: ssBg, marginLeft: 5, fontWeight: 900 }}>不休息</span> : ex.rest ? `  ·  ${ex.rest}` : ''}
                                                                    </div>
                                                                </div>
                                                                <ChevronRight size={13} color={P.inkFaint} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                                            </div>
                                                            {pi < g.pair.length - 1 && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 48, marginBottom: 2 }}>
                                                                    <div style={{ width: 1, height: 8, background: `${ssBg}66`, borderRadius: 1 }} />
                                                                    <span style={{ fontSize: 9, fontWeight: 900, color: ssBg, letterSpacing: '0.2em', textTransform: 'uppercase' }}>→ NEXT</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            );
                                        }

                                        // ── FINISHER DROP SET ──────────────────────────
                                        const { ex } = g;
                                        if (ex?.isDropSet) {
                                            return (
                                                <motion.div key={gi}
                                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.06 + gi * 0.04 }}
                                                    style={{
                                                        // 瑞士極簡：左側 ember 細線標記收尾組，底部 hairline 分隔，無面板
                                                        position: 'relative',
                                                        padding: '14px 2px 16px 14px',
                                                        borderLeft: `2px solid ${P.ember}`,
                                                        borderBottom: '1px solid rgba(43,39,34,0.10)',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, position: 'relative', zIndex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            {/* 收尾組：實心珊瑚膠囊，明顯標示這是強度收尾段 */}
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: P.ember, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                                                                <Flame size={11} color="#fff" strokeWidth={2.4} /> 收尾組
                                                            </span>
                                                            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: P.inkSoft }}>遞減組</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ paddingLeft: 4, cursor: 'pointer', position: 'relative' }} onClick={() => handleExTap && handleExTap(ex, null)}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 4 }}>
                                                            <div style={{ width: 38, height: 38, borderRadius: 0, overflow: 'hidden', flexShrink: 0, background: 'rgba(43,39,34,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <SupersetThumb name={ex.name} nameEn={ex.nameEn} />
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: 12, fontWeight: 500, color: P.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>{ex.name}</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: P.inkFaint, letterSpacing: '0.1em', marginTop: 2, fontFamily: '"Geist Mono", monospace' }}>
                                                                    {ex.sets} 組 × {ex.reps} · <span style={{ fontWeight: 900, color: P.ember }}>NO REST</span>
                                                                </div>
                                                            </div>
                                                            <ChevronRight size={11} color={P.ember} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        }

                                        // ── REGULAR STANDALONE ─────────────────────────
                                        return <ExerciseRow key={`${gi}-${ex.name}`} ex={ex} index={gi} onTap={handleExTap} />;
                                    });
                                })()}
                            </div>

                            <div style={{ height: 6 }} />
                        </div>

                        <div style={{ padding: '14px 16px 18px', flexShrink: 0, background: 'linear-gradient(to top, rgba(246,244,241,0.55) 40%, rgba(246,244,241,0) 100%)', borderTop: '1px solid rgba(43,39,34,0.06)', position: 'relative', zIndex: 1 }}>
                            {/* 開始訓練 — 與跑步頁 START 一致的 Liquid Glass coral 材質 */}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                                onClick={() => { triggerHaptic('heavy'); startWithGym(); }}
                                style={{
                                    width: '100%', height: 58, borderRadius: 24,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                                    position: 'relative', overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.38)',
                                    background: 'linear-gradient(145deg, rgba(249,92,75,0.72) 0%, rgba(255,122,107,0.58) 40%, rgba(249,92,75,0.65) 70%, rgba(217,64,48,0.78) 100%)',
                                    backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
                                    WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
                                    boxShadow: '0 16px 36px -8px rgba(249,92,75,0.52), 0 4px 12px -2px rgba(249,92,75,0.28), inset 0 2px 3px rgba(255,255,255,0.48), inset 0 -2px 6px rgba(180,40,28,0.22)',
                                }}
                            >
                                {/* 頂部高光弧 */}
                                <span style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '38%', pointerEvents: 'none', borderRadius: '0 0 999px 999px', background: 'linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0) 100%)', filter: 'blur(2px)' }} />
                                {/* 底部折射邊 */}
                                <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%', pointerEvents: 'none', borderRadius: '0 0 22px 22px', background: 'linear-gradient(0deg, rgba(255,255,255,0.12) 0%, transparent 100%)' }} />
                                <Play size={18} fill="currentColor" strokeWidth={0} style={{ color: '#fff', marginLeft: 4, position: 'relative', zIndex: 10, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }} />
                                <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: '0.26em', textTransform: 'uppercase', position: 'relative', zIndex: 10, fontFamily: '"Tenor Sans",sans-serif', textShadow: '0 1px 8px rgba(180,40,28,0.45)' }}>開始訓練</span>
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );

    return (
        <>
            {mainPortal}
            {detailEx && (
                <ExerciseDetailSheet
                    key={detailEx.name}
                    ex={detailEx}
                    dbData={detailDbData}
                    onClose={handleDetailClose}
                />
            )}
        </>
    );
};

export default WorkoutPreviewSheet;
