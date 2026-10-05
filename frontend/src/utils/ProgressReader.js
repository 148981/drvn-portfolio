// src/utils/ProgressReader.js — Cross-System Data Aggregator
import { getUserId } from './auth';
import { toLocalDateKey } from './localDate';
export const STORAGE_KEYS = {
    CARDIO_SESSIONS: 'cardio_sessions', STRENGTH_HISTORY: 'workout_history',
    NUTRITION_LOG: 'nutrition_log', JOURNEY_STATE: 'master_journey',
};
const ZONE_LABELS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];
const getWeekBounds = (offset = 0) => {
    const now = new Date(), mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + (offset * 7)); mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    return { start: mon, end: sun };
};
const getDayIndex = d => (d.getDay() + 6) % 7;
const getWeekNumber = (start, now) => Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(start).setHours(0, 0, 0, 0)) / (7 * 86400000)) + 1;

const readCardio = (wb) => {
    try {
        const wlog = JSON.parse(localStorage.getItem('weeklyCardioLog') || '{}');
        const wStart = wlog.weekStart ? new Date(wlog.weekStart) : null;
        if (wStart && wStart >= wb.start) return (wlog.sessions || []).map((s, i) => ({ date: s.ts, distance: s.km, sessionIndex: i }));
        const raw = localStorage.getItem(STORAGE_KEYS.CARDIO_SESSIONS); if (!raw) return [];
        return JSON.parse(raw).filter(s => { const d = new Date(s.date || s.timestamp || s.startTime); return d >= wb.start && d <= wb.end; });
    } catch { return []; }
};
const readStrength = (wb) => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.STRENGTH_HISTORY); if (!raw) return [];
        return JSON.parse(raw).filter(w => { const d = new Date(w.date || w.completedAt || w.timestamp); return d >= wb.start && d <= wb.end; });
    } catch { return []; }
};
const readNutrition = (wb) => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.NUTRITION_LOG); if (!raw) return [];
        return JSON.parse(raw).filter(e => { const d = new Date(e.date || e.timestamp); return d >= wb.start && d <= wb.end; });
    } catch { return []; }
};

const aggregateCardio = (sessions, target) => {
    const emptyZ = { 'Zone 1': 0, 'Zone 2': 0, 'Zone 3': 0, 'Zone 4': 0, 'Zone 5': 0 };
    if (!sessions.length) return { totalKm: 0, sessionCount: 0, avgPace: null, zoneDistribution: { ...emptyZ }, zoneMinutes: { ...emptyZ }, dailyKm: [0, 0, 0, 0, 0, 0, 0], avgHR: null, maxHR: null, totalDurationMin: 0, completionPercent: 0, sessionCompletionPercent: 0 };
    let totalKm = 0, totalDur = 0, totalHR = 0, hrCount = 0, maxHR = 0;
    const dailyKm = [0, 0, 0, 0, 0, 0, 0], zoneMin = { ...emptyZ };
    sessions.forEach(s => {
        const km = parseFloat(s.distance || s.distanceKm || s.distance_km || 0); totalKm += km;
        const dur = parseFloat(s.duration || s.durationSec || (s.durationMin || 0) * 60 || 0); totalDur += dur;
        const d = new Date(s.date || s.timestamp || s.startTime || Date.now()); dailyKm[getDayIndex(d)] += km;
        const hr = parseFloat(s.avgHeartRate || s.avgHR || s.avg_hr || 0);
        if (hr > 0) { totalHR += hr; hrCount++; if (hr > maxHR) maxHR = hr; }
        const mhr = parseFloat(s.maxHeartRate || s.maxHR || s.max_hr || 0); if (mhr > maxHR) maxHR = mhr;
        if (s.zoneMinutes) Object.entries(s.zoneMinutes).forEach(([z, m]) => { if (zoneMin[z] !== undefined) zoneMin[z] += parseFloat(m); });
        else if (s.zones && Array.isArray(s.zones)) s.zones.forEach(z => { const l = `Zone ${z.zone}`; if (zoneMin[l] !== undefined) zoneMin[l] += parseFloat(z.minutes || z.duration || 0); });
        else for (let i = 1; i <= 5; i++) { const k = `zone${i}Min`; if (s[k]) zoneMin[`Zone ${i}`] += parseFloat(s[k]); }
    });
    const totalZ = Object.values(zoneMin).reduce((a, b) => a + b, 0);
    const zoneDist = {}; ZONE_LABELS.forEach(z => { zoneDist[z] = totalZ > 0 ? Math.round(zoneMin[z] / totalZ * 100) : 0; });
    const durMin = totalDur / 60, avgPace = totalKm > 0 ? durMin / totalKm : null;
    const tKm = target?.km || 0, tSess = target?.sessionsPerWeek || 0;
    return { totalKm: Math.round(totalKm * 100) / 100, sessionCount: sessions.length, avgPace: avgPace ? Math.round(avgPace * 100) / 100 : null, zoneDistribution: zoneDist, zoneMinutes: zoneMin, dailyKm, avgHR: hrCount > 0 ? Math.round(totalHR / hrCount) : null, maxHR: maxHR || null, totalDurationMin: Math.round(durMin), completionPercent: tKm > 0 ? Math.min(100, Math.round(totalKm / tKm * 100)) : 0, sessionCompletionPercent: tSess > 0 ? Math.min(100, Math.round(sessions.length / tSess * 100)) : 0 };
};

const aggregateStrength = (workouts, target) => {
    const empty = { workoutsCompleted: 0, totalSets: 0, totalReps: 0, totalVolume: 0, muscleVolume: {}, avgRPE: null, completionPercent: 0, muscleCompletionMap: {}, dailyWorkouts: [false, false, false, false, false, false, false] };
    if (!workouts.length) {
        try {
            const uid = getUserId();
            const plan = JSON.parse(localStorage.getItem(`currentPlan_${uid}`) || 'null');
            const week = plan?.weeks?.[0]; if (!week) return empty;
            let sC = 0, sT = 0; week.days.forEach(d => (d.exercises || []).forEach(ex => (ex.sets || []).forEach(set => { sT++; if (set.completed) sC++; })));
            const tS = target?.totalSets || sT;
            return { ...empty, totalSets: sC, completionPercent: tS > 0 ? Math.min(100, Math.round(sC / tS * 100)) : 0 };
        } catch { return empty; }
    }
    let totalSets = 0, totalReps = 0, totalVolume = 0, totalRPE = 0, rpeCount = 0;
    const muscleVolume = {}, dailyWorkouts = [false, false, false, false, false, false, false];
    workouts.forEach(w => {
        const d = new Date(w.date || w.completedAt || w.timestamp); dailyWorkouts[getDayIndex(d)] = true;
        (w.exercises || w.completedExercises || []).forEach(ex => {
            const m = (ex.muscleGroup || ex.muscle || ex.targetMuscle || 'unknown').toLowerCase();
            if (!muscleVolume[m]) muscleVolume[m] = { sets: 0, reps: 0, volume: 0 };
            const sets = ex.sets || ex.completedSets || [];
            if (Array.isArray(sets)) { sets.forEach(set => { const r = parseFloat(set.reps || set.actualReps || 0), wt = parseFloat(set.weight || set.actualWeight || 0); totalSets++; totalReps += r; totalVolume += r * wt; muscleVolume[m].sets++; muscleVolume[m].reps += r; muscleVolume[m].volume += r * wt; }); }
            else if (typeof sets === 'number') { const r = parseFloat(ex.reps || 0), wt = parseFloat(ex.weight || 0); totalSets += sets; totalReps += r * sets; totalVolume += r * sets * wt; muscleVolume[m].sets += sets; muscleVolume[m].reps += r * sets; muscleVolume[m].volume += r * sets * wt; }
            if (ex.rpe) { totalRPE += parseFloat(ex.rpe); rpeCount++; }
        });
        if (w.rpe && !rpeCount) { totalRPE += parseFloat(w.rpe); rpeCount++; }
    });
    const tS = target?.totalSets || 0;
    const muscleCompletionMap = {};
    const details = Array.isArray(target?.muscleDetails) ? target.muscleDetails : Object.entries(target?.muscleDetails || {}).map(([k, v]) => ({ ...v, name: k }));
    (details || []).forEach(d => { const muscle = d.name || d.key; const actual = (muscleVolume[(muscle || '').toLowerCase()] || {}).sets || 0; const tgt = d.sets || 0; muscleCompletionMap[muscle] = tgt > 0 ? Math.min(100, Math.round(actual / tgt * 100)) : 0; });
    return { workoutsCompleted: workouts.length, totalSets, totalReps, totalVolume: Math.round(totalVolume), muscleVolume, avgRPE: rpeCount > 0 ? Math.round(totalRPE / rpeCount * 10) / 10 : null, completionPercent: tS > 0 ? Math.min(100, Math.round(totalSets / tS * 100)) : (workouts.length > 0 ? 50 : 0), muscleCompletionMap, dailyWorkouts };
};

const aggregateNutrition = (logs, target) => {
    if (!logs.length) return { avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFats: 0, totalCalories: 0, daysLogged: 0, dailyCalories: [0, 0, 0, 0, 0, 0, 0], calorieCompliance: 0, proteinCompliance: 0, overallCompliance: 0, mode: target?.mode || 'maintenance' };
    const daily = {}, daysCal = [0, 0, 0, 0, 0, 0, 0];
    logs.forEach(e => {
        const d = new Date(e.date || e.timestamp), key = toLocalDateKey(d), idx = getDayIndex(d);
        if (!daily[key]) daily[key] = { calories: 0, protein: 0, carbs: 0, fats: 0 };
        const add = obj => { daily[key].calories += parseFloat(obj.calories || obj.kcal || obj.totalCalories || 0); daily[key].protein += parseFloat(obj.protein || obj.proteinG || 0); daily[key].carbs += parseFloat(obj.carbs || obj.carbsG || obj.carbohydrates || 0); daily[key].fats += parseFloat(obj.fats || obj.fatG || obj.fat || 0); };
        e.meals && Array.isArray(e.meals) ? e.meals.forEach(add) : add(e);
        daysCal[idx] = daily[key].calories;
    });
    const days = Object.values(daily), n = days.length;
    const avg = key => n > 0 ? Math.round(days.reduce((s, d) => s + d[key], 0) / n) : 0;
    const aC = avg('calories'), aP = avg('protein'), aK = avg('carbs'), aF = avg('fats');
    const tC = target?.calories || 0, tP = target?.protein || 0;
    let calC = 0; if (tC > 0 && n > 0) { const r = aC / tC; calC = r >= 0.9 && r <= 1.1 ? 100 : r < 0.9 ? Math.round(r / 0.9 * 100) : Math.max(0, Math.round((1 - (r - 1.1) / 0.3) * 100)); }
    const proC = tP > 0 && n > 0 ? Math.min(100, Math.round(aP / tP * 100)) : 0;
    const logC = Math.min(100, Math.round(n / 7 * 100));
    return { avgCalories: aC, avgProtein: aP, avgCarbs: aK, avgFats: aF, totalCalories: Math.round(days.reduce((s, d) => s + d.calories, 0)), daysLogged: n, dailyCalories: daysCal, calorieCompliance: calC, proteinCompliance: proC, overallCompliance: Math.round(calC * 0.4 + proC * 0.4 + logC * 0.2), mode: target?.mode || 'maintenance' };
};

export const getWeeklyProgress = (journey, weekOverride = null) => {
    if (!journey) return { error: 'No active journey' };
    const curWeek = weekOverride || getWeekNumber(journey.createdAt, new Date());
    const clamped = Math.max(1, Math.min(curWeek, journey.durationWeeks || 4));
    const weekTarget = journey.weeklyTargets?.find(t => t.week === clamped) || journey.weeklyTargets?.[0];
    if (!weekTarget) return { error: 'No targets found', week: clamped };
    const wb = getWeekBounds(clamped - curWeek);
    const cardio = aggregateCardio(readCardio(wb), weekTarget.cardio);
    const strength = aggregateStrength(readStrength(wb), weekTarget.strength);
    const nutrition = aggregateNutrition(readNutrition(wb), weekTarget.nutrition);
    const overall = Math.round(cardio.completionPercent * 0.35 + strength.completionPercent * 0.35 + nutrition.overallCompliance * 0.30);
    const todayIdx = getDayIndex(new Date());
    const dailyActivity = Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], hasCardio: cardio.dailyKm[i] > 0, hasStrength: strength.dailyWorkouts[i], hasNutrition: nutrition.dailyCalories[i] > 0, cardioKm: cardio.dailyKm[i], nutritionCal: nutrition.dailyCalories[i], scheduled: journey.schedule?.[i] || null }));
    let streak = 0;
    for (let i = todayIdx; i >= 0; i--) { const day = dailyActivity[i], sch = day.scheduled; if (!sch) break; if ((sch.strength && day.hasStrength) || (sch.cardio && day.hasCardio) || sch.rest) streak++; else break; }
    return { week: clamped, phase: weekTarget.phase, phaseLabel: { BASE: 'Foundation', BUILD: 'Build', PEAK: 'Peak', DELOAD: 'Deload' }[weekTarget.phase] || weekTarget.phase, targets: weekTarget, cardio, strength, nutrition, overallCompletion: overall, dailyActivity, streak, aiReasoning: weekTarget.ai_reasoning || '', weekBounds: { start: wb.start.toISOString(), end: wb.end.toISOString() } };
};

export const getJourneyTrend = (journey) => {
    if (!journey) return [];
    return Array.from({ length: journey.durationWeeks || 4 }, (_, i) => {
        const s = getWeeklyProgress(journey, i + 1);
        return { week: i + 1, phase: s.phase, cardioKm: s.cardio?.totalKm || 0, cardioTarget: s.targets?.cardio?.km || 0, strengthSets: s.strength?.totalSets || 0, strengthTarget: s.targets?.strength?.totalSets || 0, avgCalories: s.nutrition?.avgCalories || 0, calorieTarget: s.targets?.nutrition?.calories || 0, overallCompletion: s.overallCompletion || 0 };
    });
};

export const getZoneCompliance = (cardioProgress, cardioTarget) => {
    if (!cardioProgress || !cardioTarget) return null;
    const tDist = cardioTarget.zoneDistribution || {}, aDist = cardioProgress.zoneDistribution || {};
    let totalDev = 0; const zones = {};
    ZONE_LABELS.forEach(z => { const t = tDist[z] || 0, a = aDist[z] || 0; zones[z] = { target: t, actual: a, delta: a - t }; totalDev += Math.abs(a - t); });
    return { zones, compliance: Math.max(0, Math.round(100 - totalDev / 2)) };
};

export const getMuscleBalance = (strengthProgress, strengthTarget) => {
    if (!strengthProgress || !strengthTarget) return null;
    const actual = strengthProgress.muscleVolume || {};
    const details = Array.isArray(strengthTarget.muscleDetails) ? strengthTarget.muscleDetails : Object.entries(strengthTarget.muscleDetails || {}).map(([k, v]) => ({ ...v, name: k }));
    const muscles = {};
    (details || []).forEach(d => { const muscle = d.name || d.key, key = (muscle || '').toLowerCase(), tgt = d.sets || 0, act = (actual[key] || {}).sets || 0, comp = tgt > 0 ? Math.round(act / tgt * 100) : 0; muscles[muscle] = { targetSets: tgt, actualSets: act, completion: Math.min(150, comp), status: comp >= 90 ? 'on_track' : comp >= 50 ? 'behind' : comp > 0 ? 'minimal' : 'missed', sourceTags: d.sourceTags || [] }; });
    Object.entries(actual).forEach(([m, v]) => { if (!muscles[m] && !muscles[m.charAt(0).toUpperCase() + m.slice(1)]) muscles[m] = { targetSets: 0, actualSets: v.sets, completion: 100, status: 'bonus', sourceTags: [] }; });
    return muscles;
};

export const updateWeeklyTarget = (journeyId, weekNumber, updates) => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.JOURNEY_STATE); if (!raw) return { error: 'No journey found' };
        const journey = JSON.parse(raw); if (journey.journeyId !== journeyId) return { error: 'Journey ID mismatch' };
        const idx = journey.weeklyTargets?.findIndex(t => t.week === weekNumber); if (idx === -1 || idx == null) return { error: 'Week not found' };
        const t = journey.weeklyTargets[idx];
        if (updates.cardio) t.cardio = { ...t.cardio, ...updates.cardio };
        if (updates.strength) t.strength = { ...t.strength, ...updates.strength };
        if (updates.nutrition) t.nutrition = { ...t.nutrition, ...updates.nutrition };
        t._userModified = true; t._modifiedAt = new Date().toISOString();
        journey.weeklyTargets[idx] = t;
        localStorage.setItem(STORAGE_KEYS.JOURNEY_STATE, JSON.stringify(journey));
        const uid = getUserId();
        localStorage.setItem(`masterJourney_${uid}`, JSON.stringify(journey));
        return journey;
    } catch (e) { return { error: e.message }; }
};

export const getQuickStats = (journey) => {
    const p = getWeeklyProgress(journey); if (p.error) return null;
    return { week: p.week, phase: p.phaseLabel, overall: p.overallCompletion, cardioKm: p.cardio.totalKm, cardioTarget: p.targets.cardio?.km || 0, strengthSets: p.strength.totalSets, strengthTarget: p.targets.strength?.totalSets || 0, avgCalories: p.nutrition.avgCalories, calorieTarget: p.targets.nutrition?.calories || 0, streak: p.streak };
};

// ── Legacy exports for backward compat ───────────────────────
export const getWeeklyCardioLog = () => {
    try {
        const wlog = JSON.parse(localStorage.getItem('weeklyCardioLog') || '{}');
        const sessions = wlog.sessions || [];
        return { km: sessions.reduce((s, x) => s + (x.km || 0), 0), sessions };
    } catch { return { km: 0, sessions: [] }; }
};

export const getWeeklyStrengthProgress = (userId, currentWeek = 1) => {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        const weekData = plan?.weeks?.[currentWeek - 1];
        if (!weekData) return { volumeDone: 0, volumeTotal: 0, setsCompleted: 0, setsTotal: 0, daysCompleted: 0 };
        let vD = 0, vT = 0, sC = 0, sT = 0, dC = 0;
        weekData.days.forEach(day => {
            if (!day.exercises) return;
            let dayDone = true;
            day.exercises.forEach(ex => (ex.sets || []).forEach(set => {
                sT++; const vol = (set.reps || 10) * (set.weight || 20); vT += vol;
                if (set.completed) { sC++; vD += vol; } else dayDone = false;
            }));
            if (dayDone && day.exercises.length > 0) dC++;
        });
        return { volumeDone: vD, volumeTotal: vT, setsCompleted: sC, setsTotal: sT, daysCompleted: dC };
    } catch { return { volumeDone: 0, volumeTotal: 0, setsCompleted: 0, setsTotal: 0, daysCompleted: 0 }; }
};

export default { getWeeklyProgress, getJourneyTrend, getZoneCompliance, getMuscleBalance, updateWeeklyTarget, getQuickStats, STORAGE_KEYS };
