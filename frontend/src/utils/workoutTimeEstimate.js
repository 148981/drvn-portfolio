/**
 * workoutTimeEstimate.js — 訓練時長 / 卡路里估算（單一真相源）
 * ─────────────────────────────────────────────────────────
 * 【為什麼存在】planFusionEngine 的 day.time 是「排程預算用」的粗估：
 *   Σ 組數 ×（工作 + 組間休息），**沒有計入**：
 *     · 換器械/裝槓緩衝（實測每動作 ≈ 1 分鐘）
 *     · 暖身與收操（≈ 5 分鐘）
 *   → 4 動作推力日會顯示 33–35 分，實際上健身房走完要 45 分上下，
 *   使用者會覺得「時間預測過於樂觀」。
 *
 * 本模組提供「對使用者顯示」的誠實估算（逐動作推算 + 緩衝 + 暖身），
 * 首頁今日焦點卡與計劃預覽頁共用；引擎的排程預算公式不動
 * （動排程公式會改變時間背包截斷 → 影響整個課表生成，屬另一層決策）。
 *
 * 卡路里：MET 法（Compendium of Physical Activities）
 *   HIIT/循環 7.5、複合大重量 5.5、多動作肌肥大 4.8、恢復型 4.2。
 *   kcal = MET × 體重(kg) × 時數 — 時長修正後 kcal 也會自然變準。
 */

// 解析 rest 字串為「秒數」，支援 "90s", "90", "NO REST", "0s", 數字
export const parseRestSecs = (restRaw) => {
    if (restRaw === null || restRaw === undefined) return null;
    const s = String(restRaw).trim().toLowerCase();
    if (s === '' || s === 'no rest' || s === 'norest' || s === '0s' || s === '0') return 0;
    const match = s.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
};

// 是否為複合/大重量動作（中英雙語）
export const isCompoundExercise = (name = '') => {
    const n = name.toLowerCase();
    const EN = ['squat', 'deadlift', 'bench press', 'overhead press', 'barbell row',
        'pull up', 'pullup', 'pull-up', 'leg press', 'hip thrust', 'lunge'];
    const ZH = ['深蹲', '硬舉', '臥推', '肩推', '划船', '引體向上', '腿推', '臀推', '弓箭步',
        '槓鈴', '上斜', '下斜', '窄握', '寬握'];
    return EN.some(k => n.includes(k)) || ZH.some(k => name.includes(k));
};

const maxRepOf = (ex, fallback = 12) => {
    const parts = (ex.reps || '').toString().split('-').map(p => parseInt(p)).filter(Boolean);
    return parts.length ? Math.max(...parts) : fallback;
};

// 組間休息（秒）：計劃給定優先，否則依動作型態/次數
export const getDefaultRestSecs = (ex) => {
    const fromPlan = parseRestSecs(ex.rest);
    if (fromPlan !== null) return fromPlan;
    const maxRep = maxRepOf(ex);
    if (isCompoundExercise(ex.name) && maxRep <= 6) return 180;
    if (isCompoundExercise(ex.name) && maxRep <= 10) return 120;
    if (isCompoundExercise(ex.name)) return 90;
    if (maxRep >= 15) return 45;
    return 75;
};

// 單組工作時間（秒）
export const getSetDurationSecs = (ex) => {
    const name = (ex.name || '').toLowerCase();
    const maxRep = maxRepOf(ex);
    if (name.includes('plank') || name.includes('hold') || name.includes('wall sit') ||
        ex.name?.includes('棒式') || ex.name?.includes('平板')) return 60;
    if (name.includes('run') || name.includes('jump') || name.includes('burpee') ||
        name.includes('mountain climber')) return Math.min(maxRep * 3, 90);
    if (isCompoundExercise(ex.name)) return Math.min(maxRep * 4, 70);
    return Math.min(maxRep * 3, 55);
};

/** 誠實的單日訓練時長（分鐘）：逐動作 + 換器械緩衝 + 暖身 */
export const estimateDayMinutes = (day) => {
    const exercises = day?.exercises || [];
    if (!exercises.length) {
        // 沒動作明細才退回引擎粗估
        const parsed = parseInt(day?.time || day?.estimated_time);
        return !isNaN(parsed) && parsed > 0 ? parsed : 45;
    }
    const totalSecs = exercises.reduce((total, ex) => {
        const sets = parseInt(ex.sets) || 3;
        return total + sets * (getSetDurationSecs(ex) + getDefaultRestSecs(ex)) + 60; // +60s 換器械
    }, 0);
    return Math.round((totalSecs + 5 * 60) / 60);  // +5min 暖身/收操
};

const isHIITSession = (exercises = [], focus = '') => {
    const f = (focus || '').toLowerCase();
    if (f.includes('hiit') || f.includes('cardio') || f.includes('circuit') ||
        f.includes('有氧') || f.includes('循環')) return true;
    const kw = ['jump', 'burpee', 'mountain climber', 'sprint', 'run', '波比', '跳繩'];
    return exercises.some(ex => kw.some(k => (ex.name || '').toLowerCase().includes(k)));
};
const isHeavySession = (exercises = [], focus = '') => {
    const f = (focus || '').toLowerCase();
    if (f.includes('power') || f.includes('strength') || f.includes('powerlifting')) return true;
    // 【v4.8b 誠實卡路里】只有「低次數(≤6)大重量複合動作」才算 heavy（MET 5.5）。
    //   舊版「含任一複合動作即 heavy」讓幾乎所有課表（臥推/深蹲天天有）都拿
    //   最高檔 MET → 卡路里系統性高估 20~30%。
    //   Compendium：一般 8-15 reps 阻力訓練 ≈ 3.5-5.0 MET，powerlifting 才 6.0。
    return exercises.some(ex => isCompoundExercise(ex.name) && maxRepOf(ex) <= 6);
};

/** MET 法卡路里（kcal） */
export const estimateDayCalories = (day, durationMins, weightKg = 70) => {
    const exercises = day?.exercises || [];
    if (!exercises.length) return 0;
    const focus = day?.focus || '';
    let met;
    if (isHIITSession(exercises, focus)) met = 7.5;        // HIIT / 循環
    else if (isHeavySession(exercises, focus)) met = 5.5;  // 低次數複合大重量
    else if (exercises.some(ex => isCompoundExercise(ex.name))) met = 4.9; // 一般複合肌肥大（v4.8b 中間檔）
    else if (exercises.length >= 6) met = 4.8;             // 多動作隔離肌肥大
    else met = 4.2;                                        // 少動作 / 恢復型
    return Math.round(met * weightKg * (durationMins / 60));
};
