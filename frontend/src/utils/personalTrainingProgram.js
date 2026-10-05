import { generateUnifiedPlan } from './UnifiedTrainingEngine';
import { generateCardioPlan } from './cardioPlanFusionEngine';
import { calcBMR_MifflinStJeor, calcTDEE, calcTargetCalories, calcMacros } from './NutritionEngine';
import { newProgramId } from './trainingProgram';
import { toLocalDateKey } from './localDate';

export function buildPersonalProgram(config, now = new Date()) {
    const startDate = config.startDate || toLocalDateKey(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(new Date(`${startDate}T00:00:00`).getTime())) throw new Error('請選擇有效起始日期');
    const result = { program_id: newProgramId() };
    if (config.include.strength) {
        const p = generateUnifiedPlan({ level: config.strengthLevel, daysPerWeek: Number(config.strengthDays),
            equipment: config.equipment, selectedHashtags: config.muscles || [], injuries: config.injuries || [], trainingStyle: config.style || 'bodybuilding' });
        result.strength = { ...p, name: '我的健身計劃', startDate, cycleWeeks: p.weeks.length, source: 'control_center' };
    }
    if (config.include.running) result.running = generateCardioPlan({ goal: config.runGoal || 'aerobic_base',
        currentLevel: config.runLevel, sessionsPerWeek: Number(config.runSessions), totalWeeks: Number(config.runWeeks),
        currentWeeklyKm: Number(config.weeklyKm), includeStrength: false, startDate });
    if (config.include.nutrition) {
        const weight = Number(config.weight), height = Number(config.height), age = Number(config.age);
        if (!(weight > 25 && weight < 350 && height > 100 && height < 250 && age >= 18 && age < 110)) throw new Error('營養估算需要有效的體重、身高與成年年齡；也可以先取消營養項目，稍後設定');
        if (!['male', 'female'].includes(config.gender)) throw new Error('請選擇營養公式使用的生理性別');
        const goalType = config.nutritionGoal || 'recomp';
        const mode = goalType === 'cut' ? 'cutting' : goalType === 'bulk' ? 'bulking' : 'maintenance';
        const bmr = calcBMR_MifflinStJeor({ weight, height, age, gender: config.gender });
        const tdee = calcTDEE(bmr, Number(config.activity) || 1.4);
        const calorieTarget = Math.max(bmr, calcTargetCalories(mode, tdee).targetCalories);
        const macros = calcMacros(calorieTarget, weight, config.include.strength && config.include.running ? 'mixed' : config.include.strength ? 'strength' : 'cardio', mode);
        const weeks = Number(config.nutritionWeeks);
        if (!(weeks >= 2 && weeks <= 52)) throw new Error('營養週期需介於 2 至 52 週');
        const end = new Date(`${startDate}T00:00:00`); end.setDate(end.getDate() + weeks * 7);
        const weeklyChange = (macros.actualCalories - tdee) * 7 / 7700;
        result.nutrition = { goalType, currentWeight: weight,
            targetWeight: Math.round((weight + weeklyChange * weeks) * 10) / 10,
            pace: Math.abs(weeklyChange), weeklyChange, currentBF: null, targetBodyFat: null,
            recommendedIntake: macros.actualCalories, adjustedIntake: macros.actualCalories,
            newProtein: macros.protein, newCarbs: macros.carbs, newFat: macros.fat,
            tdee, intrinsicTDEE: tdee, bmr, bmrMethod: 'Mifflin-St Jeor',
            committedAt: new Date(`${startDate}T00:00:00`).getTime(), etaDate: end.toISOString(),
            cycleWeeks: weeks, startDate, source: 'control_center', estimated: true,
            estimateNote: '依基本身體資料估算；體重目標為能量換算參考，不是保證結果，請依實際趨勢回報调整。' };
    }
    if (!result.strength && !result.running && !result.nutrition) throw new Error('請至少選一項計劃');
    return result;
}
