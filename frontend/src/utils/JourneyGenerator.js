// src/utils/JourneyGenerator.js

import { conductBaselineAssessment } from './BaselineTest';
import { generatePlanWithSplitType } from './SplitTypeSystem';
import { calcBMR_MifflinStJeor, calcTDEE } from './NutritionEngine';

// ==========================================
// 🏋️ TAG → MUSCLE GROUP MAPPING
// ==========================================
const TAG_MUSCLE_MAP = {
    '#ChestGains': { name: '胸部 (Chest)', muscles: ['胸大肌', '前三角肌', '肱三頭肌'] },
    '#BigArms': { name: '手臂 (Arms)', muscles: ['肱二頭肌', '肱三頭肌', '前臂'] },
    '#Glutes': { name: '臀腿 (Glutes&Legs)', muscles: ['臀大肌', '股四頭肌', '腿後腱'] },
    '#Shoulders': { name: '肩部 (Shoulders)', muscles: ['前/側/後三角肌', '斜方肌'] },
    '#BackGains': { name: '背部 (Back)', muscles: ['背闊肌', '菱形肌', '肱二頭肌'] },
    '#CoreStrength': { name: '核心 (Core)', muscles: ['腹直肌', '腹斜肌', '腰方肌'] },
};

const TAG_LABEL_MAP = {
    '#LoseWeight': '減脂',
    '#FatBurn': '燃脂',
    '#BuildMuscle': '增肌',
    '#GetStrong': '增力',
    '#Performance': '體能提升',
    '#ChestGains': '胸部雕塑',
    '#BigArms': '手臂圍粗',
    '#Glutes': '臀腿翹臀',
    '#Shoulders': '肩膀三維',
    '#BackGains': '厚背訓練',
    '#CoreStrength': '核心強化',
};

// ==========================================
// 🌐 MAIN EXPORT: generateHolisticJourney
// ==========================================
export const generateHolisticJourney = (userId, formData) => {
    const tags = formData.urban_tags || [];
    const freq = formData.weekly_frequency || 3;
    const rawSplit = formData.workout_split || 'PPL';

    const splitMap = { 'PPL': 'foundation', 'Body_Part': 'precision', 'Full_Body': 'pulse' };
    const splitType = splitMap[rawSplit] || 'foundation';
    const goal = formData.goal || 'General Fitness';

    const assessment = conductBaselineAssessment({
        pushUpReps: formData.pushUpMax || 15,
        squatReps: formData.squatMax || 25,
        plankSeconds: formData.plankMax || 45
    });

    const strengthPlan = generatePlanWithSplitType(
        assessment,
        splitType,
        {
            intensity: (formData.experience_level || 3) >= 5 ? 'high' : 'medium',
            history: 'regular',
            daysPerWeek: freq
        }
    );

    const schedule = generateWeeklyLayout(freq, splitType, tags);
    const weeklyTargets = generateProgressiveTargets(tags, formData);

    return {
        journeyId: `journey_${Date.now()}`,
        userId,
        goal,
        currentWeek: 1,
        durationWeeks: 4,
        tags,
        baseNutrition: formData.diet_preference || 'Balanced',
        strengthPlan,
        schedule,
        weeklyTargets,
        userProfile: {
            // 不補預設值：缺就是缺，下游要顯示「去補資料」
            weight: formData.weight ?? null,
            height: formData.height ?? null,
            age: formData.age ?? null,
            gender: formData.gender || 'M'
        }
    };
};

// ==========================================
// 📅 WEEKLY LAYOUT GENERATOR
// ==========================================
const generateWeeklyLayout = (freq, splitType, tags) => {
    const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const layout = Array.from({ length: 7 }, (_, i) => ({
        dayIndex: i, dayName: dayNames[i],
        strength: false, cardio: false,
        nutrition: 'Balanced', workoutRefIndex: null
    }));

    let strengthIndices = [];
    if (splitType === 'foundation') {
        strengthIndices = freq >= 6 ? [0, 1, 2, 4, 5, 6] : [0, 2, 4];
    } else if (splitType === 'pulse') {
        strengthIndices = [0, 2, 4];
    } else {
        strengthIndices = freq >= 5 ? [0, 1, 2, 3, 4] : [0, 1, 3, 4];
    }
    strengthIndices = strengthIndices.slice(0, freq);

    let wc = 0;
    strengthIndices.forEach(idx => {
        layout[idx].strength = true;
        layout[idx].workoutRefIndex = wc++;
        layout[idx].nutrition = 'High_Protein';
    });

    const isFatLoss = tags.some(t => ['#LoseWeight', '#FatBurn'].includes(t));
    const isPerf = tags.some(t => ['#Performance'].includes(t));
    if (isFatLoss || isPerf) {
        const rest = [0, 1, 2, 3, 4, 5, 6].filter(i => !layout[i].strength);
        rest.slice(0, 2).forEach(i => { layout[i].cardio = true; layout[i].nutrition = 'High_Carb'; });
    }
    return layout;
};

// ==========================================
// 🎯 PROGRESSIVE TARGETS (Detailed)
// ==========================================
const generateProgressiveTargets = (tags, formData = {}) => {
    const isFatLoss = tags.some(t => ['#LoseWeight', '#FatBurn'].includes(t));
    const isPerf = tags.some(t => ['#Performance'].includes(t));
    const isMuscleBuild = tags.some(t => ['#BuildMuscle', '#GetStrong'].includes(t));

    // Which muscle groups did the user target?
    const focusMuscleEntries = Object.entries(TAG_MUSCLE_MAP).filter(([tag]) => tags.includes(tag));
    const selectedTagLabels = tags.filter(t => TAG_LABEL_MAP[t]).map(t => TAG_LABEL_MAP[t]);

    const baseCardioKm = isPerf ? 10 : isFatLoss ? 8 : 5;
    const baseSets = focusMuscleEntries.length > 0 ? 12 : 10;
    const weight = formData.weight ?? null;

    const splitMap = { 'PPL': 'PPL（推拉腿）', 'Body_Part': 'Bro Split（部位分化）', 'Full_Body': '全身循環訓練' };
    const splitName = splitMap[formData.workout_split] || 'PPL（推拉腿）';
    const freq = formData.weekly_frequency || 3;

    return Array.from({ length: 4 }, (_, i) => {
        const week = i + 1;

        // --- CARDIO TARGET ---
        let cardioKm, cardioZone, zonePercent, cardioDesc;
        if (isPerf) {
            cardioKm = baseCardioKm + i * 1.5;
            cardioZone = week >= 3 ? 'Zone 4' : 'Zone 3';
            zonePercent = week >= 3 ? 75 : 65;
            cardioDesc = `每次跑量 ${(cardioKm / 2).toFixed(1)}km，其中 ${zonePercent}% 維持在 ${cardioZone} (85–95% HRmax)，提升最大攝氧量。`;
        } else if (isFatLoss) {
            cardioKm = baseCardioKm + i * 2;
            cardioZone = week >= 3 ? 'Zone 3' : 'Zone 2';
            zonePercent = week >= 3 ? 60 : 80;
            cardioDesc = `每次跑量 ${(cardioKm / 2).toFixed(1)}km，${zonePercent}% 維持在 ${cardioZone} (${week >= 3 ? '70–80' : '60–70'}% HRmax)，最大化脂肪氧化效率。`;
        } else {
            cardioKm = Math.max(3, 5 - i * 0.5);
            cardioZone = 'Zone 2';
            zonePercent = 80;
            cardioDesc = `輕鬆恢復跑 ${cardioKm.toFixed(1)}km，80% 維持 Zone 2 (60–70% HRmax)，避免干擾增肌效果。`;
        }

        // --- STRENGTH TARGET (per-muscle breakdown) ---
        const muscleDetails = buildMuscleDetails(focusMuscleEntries, baseSets, i, isMuscleBuild, isFatLoss);
        const totalVolume = muscleDetails.reduce((acc, m) => acc + m.sets * m.reps, 0);
        const rpe = isFatLoss ? 7 : (isMuscleBuild ? Math.min(7 + i, 9) : 7 + i);
        const weekWeight = focusMuscleEntries.length > 0 ? (20 + i * 2.5) : (15 + i * 2.5);

        // --- AI REASONING (tag-specific) ---
        const ai_reasoning = buildAiReasoning(tags, selectedTagLabels, week, cardioKm, cardioZone, zonePercent,
            muscleDetails, rpe, freq, splitName);

        return {
            week,
            cardio: {
                km: cardioKm,
                zone: cardioZone,
                zonePercent,
                desc: cardioDesc
            },
            strength: {
                focus: focusMuscleEntries.length > 0
                    ? focusMuscleEntries.map(([, v]) => v.name).join('、')
                    : '全身均衡',
                muscleDetails,      // [{name, sets, reps, volume, note}]
                totalVolume,
                setsPerMuscle: baseSets + i,
                rpe,
                weightEst: weekWeight
            },
            ai_reasoning,
            nutrition: {
                deficit_or_surplus: isFatLoss ? -300 + i * 50 : (isMuscleBuild ? 300 : 0)
            }
        };
    });
};

// Build per-muscle detail rows
const buildMuscleDetails = (focusEntries, baseSets, weekIdx, isMuscleBuild, isFatLoss) => {
    if (focusEntries.length === 0) {
        // No specific focus: show generic full-body
        return [
            { name: '推系列（胸/肩/三頭）', sets: baseSets + weekIdx, reps: 10, note: '複合動作為主' },
            { name: '拉系列（背/二頭）', sets: baseSets + weekIdx, reps: 10, note: '垂直+水平拉' },
            { name: '腿部（股四/臀腿）', sets: baseSets + weekIdx, reps: 12, note: '深蹲/硬拉' }
        ];
    }
    return focusEntries.map(([tag, { name, muscles }]) => {
        const sets = baseSets + weekIdx * 2;
        const reps = isMuscleBuild ? 8 : (isFatLoss ? 15 : 12);
        return {
            name,
            muscles: muscles.join('、'),
            sets,
            reps,
            volume: sets * reps,
            note: isMuscleBuild ? '漸進加重 2.5kg/週' : (isFatLoss ? '高次數燃脂' : '標準肌肥大範圍')
        };
    });
};

// Build rich AI reasoning text
const buildAiReasoning = (tags, labels, week, cardioKm, cardioZone, zonePercent, muscles, rpe, freq, splitName) => {
    const tagStr = labels.length > 0 ? labels.join('、') : '全方位健身';
    const muscleStr = muscles.map(m => `${m.name}（${m.sets}組×${m.reps}下）`).join('、');

    const isFatLoss = tags.some(t => ['#LoseWeight', '#FatBurn'].includes(t));
    const isPerf = tags.some(t => ['#Performance'].includes(t));
    const isMuscle = tags.some(t => ['#BuildMuscle', '#GetStrong'].includes(t));

    let strategy = '';
    if (isFatLoss && isMuscle) {
        strategy = `採「增肌減脂」雙軌策略：有氧鎖定 ${cardioZone}（最佳脂肪氧化區），重訓 RPE ${rpe} 維持肌肉刺激。`;
    } else if (isFatLoss) {
        strategy = `專注 #FatBurn：${zonePercent}% 時間維持 ${cardioZone} 燃脂區，重訓維持 RPE ${rpe} 避免掉肌。`;
    } else if (isPerf) {
        strategy = `#Performance 模式：${cardioZone} 提升最大攝氧量 (VO₂max)，重訓保持 RPE ${rpe} 爆發力。`;
    } else {
        strategy = `增肌為主：有氧降至最低避免干擾效應，全力投入重訓 RPE ${rpe}。`;
    }

    return `W${week} 標籤：${tagStr}。${strategy} 本週訓練部位：${muscleStr}。採 ${splitName}，每週 ${freq} 天，跑量 ${cardioKm.toFixed(0)}km。`;
};

// ==========================================
// 🍽️ DYNAMIC NUTRITION ENGINE
// ==========================================
export const calculateDailyNutrition = (dayContext, userProfile, weeklyTarget) => {
    const weight = userProfile?.weight ?? null;
    // 🩹 原本把性別寫死成男性（+5）。身高/年齡的預設值改由引擎統一提供。
    //    ×1.55 是「計劃假設的中度活動」，是刻意的（見 nutritionProjection.js），保留。
    const baseTDEE = calcTDEE(calcBMR_MifflinStJeor({
        weight,
        height: userProfile?.height,
        age: userProfile?.age,
        gender: userProfile?.gender,
    }), 1.55);

    let targetCals = baseTDEE + (weeklyTarget?.nutrition?.deficit_or_surplus || 0);
    let p = Math.round(weight * 1.8);
    let c = 150;
    let f = 60;
    let message = '';

    if (dayContext?.cardio) {
        const dailyKm = (weeklyTarget?.cardio?.km || 5) / 2;
        const burn = Math.round(dailyKm * weight * 1.03);
        targetCals += burn;
        c += Math.round((burn * 0.7) / 4);
        p += Math.round((burn * 0.3) / 4);
        message = `🏃 有氧日：預估消耗 ${burn} 大卡，已補充碳水 +${Math.round((burn * 0.7) / 4)}g、蛋白質 +${Math.round((burn * 0.3) / 4)}g。`;
    } else if (dayContext?.strength) {
        targetCals += 250;
        p = Math.round(weight * 2.2);
        f = Math.round(weight * 0.9);
        c = Math.max(100, Math.round((targetCals - (p * 4 + f * 9)) / 4));
        message = `💪 重訓日：蛋白質提高至 ${p}g (2.2g/kg)，額外補充 250 大卡。`;
    } else {
        p = Math.round(weight * 1.6);
        c = Math.round(weight * 1.2);
        f = Math.round(weight * 1.0);
        targetCals = Math.round(baseTDEE * 0.95);
        message = `😴 休息日：降低碳水至 ${c}g，提高優質脂肪，專注修復。`;
    }

    return { calories: targetCals, macros: { protein: p, carbs: c, fat: f }, message };
};
