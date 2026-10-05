/**
 * Checklist Manager — 每日 Checklist 系統
 * 自動根據 Master Journey 4 週計劃產生每日任務 + 使用者自訂
 * 使用 localStorage 做輕量化儲存
 */

const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const NUTRITION_META = {
    High_Protein: { label: '高蛋白飲食', emoji: '🥩' },
    High_Carb: { label: '高碳水飲食', emoji: '🍚' },
    Balanced: { label: '均衡飲食', emoji: '🥗' },
    Low_Calorie: { label: '熱量控制飲食', emoji: '🥦' },
    High_Performance: { label: '競技表現飲食', emoji: '⚡' },
    Recovery: { label: '恢復飲食', emoji: '🌿' },
};

// ────────────────────────────────────────
// helpers
// ────────────────────────────────────────
const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getTodayIdx = () => {
    const jsDay = new Date().getDay();
    return jsDay === 0 ? 6 : jsDay - 1; // MON=0 … SUN=6
};

// ────────────────────────────────────────
// Auto-gen from journey
// ────────────────────────────────────────
export const generateTodayChecklist = (journey, weeklyTarget) => {
    const items = [];
    if (!journey?.schedule) return items;

    const todayIdx = getTodayIdx();
    const dayPlan = journey.schedule[todayIdx];
    if (!dayPlan) return items;

    const isRest = !dayPlan.strength && !dayPlan.cardio;

    if (dayPlan.strength) {
        const dayNum = (dayPlan.workoutRefIndex || 0) + 1;
        const rpe = weeklyTarget?.strength?.rpe || 7;
        const sets = weeklyTarget?.strength?.setsPerMuscle || 10;
        items.push({
            id: `auto_strength_${todayIdx}`,
            name: `完成重訓 Day ${dayNum}`,
            detail: `RPE ${rpe} · ${sets} 組/部位`,
            emoji: '🏋️',
            type: 'strength',
            auto: true,
        });
    }

    if (dayPlan.cardio) {
        const km = weeklyTarget?.cardio?.km || 5;
        const zone = weeklyTarget?.cardio?.zone || 'Zone 2';
        items.push({
            id: `auto_cardio_${todayIdx}`,
            name: `跑步 ${typeof km === 'number' ? km.toFixed(1) : km} km`,
            detail: `${zone} · ${weeklyTarget?.cardio?.zonePercent || 80}% 目標`,
            emoji: '🏃',
            type: 'cardio',
            auto: true,
        });
    }

    // Nutrition
    const nutType = dayPlan.nutrition || 'Balanced';
    const nutMeta = NUTRITION_META[nutType] || NUTRITION_META.Balanced;
    items.push({
        id: `auto_nutrition_${todayIdx}`,
        name: `遵循${nutMeta.label}`,
        detail: '記錄今日飲食攝取',
        emoji: nutMeta.emoji,
        type: 'nutrition',
        auto: true,
    });

    if (isRest) {
        items.push({
            id: `auto_rest_${todayIdx}`,
            name: '伸展放鬆 15 分鐘',
            detail: '讓肌肉充分恢復',
            emoji: '🧘',
            type: 'rest',
            auto: true,
        });
    }

    // Always add hydration
    items.push({
        id: 'auto_water',
        name: '喝滿 2000ml 水',
        detail: '維持代謝與運動表現',
        emoji: '💧',
        type: 'health',
        auto: true,
    });

    // Always add sleep
    items.push({
        id: 'auto_sleep',
        name: '睡滿 7 小時',
        detail: '充分恢復是成長的關鍵',
        emoji: '😴',
        type: 'lifestyle',
        auto: true,
    });

    return items;
};

// ────────────────────────────────────────
// Custom Items CRUD
// ────────────────────────────────────────
const customKey = (userId) => `checklist_custom_${userId}`;

export const getCustomItems = (userId) => {
    try {
        return JSON.parse(localStorage.getItem(customKey(userId)) || '[]');
    } catch { return []; }
};

export const addCustomItem = (userId, item) => {
    const items = getCustomItems(userId);
    const newItem = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: item.name,
        emoji: item.emoji || '📝',
        type: item.type || 'other',
        detail: item.detail || '',
        auto: false,
    };
    items.push(newItem);
    localStorage.setItem(customKey(userId), JSON.stringify(items));
    return newItem;
};

export const removeCustomItem = (userId, itemId) => {
    const items = getCustomItems(userId).filter(i => i.id !== itemId);
    localStorage.setItem(customKey(userId), JSON.stringify(items));
};

// ────────────────────────────────────────
// Daily State (toggle / progress)
// ────────────────────────────────────────
const stateKey = (userId) => `checklist_state_${userId}_${todayKey()}`;

export const getDailyState = (userId) => {
    try {
        return JSON.parse(localStorage.getItem(stateKey(userId)) || '{}');
    } catch { return {}; }
};

export const toggleItem = (userId, itemId) => {
    const state = getDailyState(userId);
    state[itemId] = !state[itemId];
    localStorage.setItem(stateKey(userId), JSON.stringify(state));
    return state[itemId]; // returns new checked state
};

export const isItemChecked = (userId, itemId) => {
    return !!getDailyState(userId)[itemId];
};

export const getDailyProgress = (userId, allItems) => {
    const state = getDailyState(userId);
    const total = allItems.length;
    const completed = allItems.filter(i => state[i.id]).length;
    return {
        completed,
        total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
};

// ────────────────────────────────────────
// Streak tracking
// ────────────────────────────────────────
export const getStreakDays = (userId) => {
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = `checklist_state_${userId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        try {
            const state = JSON.parse(localStorage.getItem(key) || 'null');
            if (!state) break;
            const vals = Object.values(state);
            if (vals.length === 0) break;
            const allDone = vals.every(v => v === true);
            if (allDone) {
                streak++;
            } else if (i > 0) {
                // Today is allowed to be incomplete
                break;
            }
        } catch {
            break;
        }
    }
    return streak;
};

// ────────────────────────────────────────
// Item type metadata
// ────────────────────────────────────────
export const CHECKLIST_TYPES = [
    { id: 'strength', label: '訓練', emoji: '🏋️' },
    { id: 'cardio', label: '有氧', emoji: '🏃' },
    { id: 'nutrition', label: '飲食', emoji: '🥗' },
    { id: 'lifestyle', label: '作息', emoji: '😴' },
    { id: 'supplement', label: '補給', emoji: '💊' },
    { id: 'other', label: '其他', emoji: '📝' },
];

export const getTypeColor = (type) => {
    const map = {
        strength: '#3A5635',
        cardio: '#D57B0E',
        nutrition: '#6B8E23',
        rest: '#8B7355',
        health: '#4A90D9',
        lifestyle: '#7B68EE',
        supplement: '#CD853F',
        other: '#8B7F72',
    };
    return map[type] || '#8B7F72';
};
