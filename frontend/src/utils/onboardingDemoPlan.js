/**
 * onboardingDemoPlan.js — 新手教學專用「模擬已生成計劃」
 * ─────────────────────────────────────────────────────────────────────
 * 用途：
 *   使用者在註冊精靈裡可以「略過健身計劃生成」。但新手聚光燈教學
 *   （OnboardingSpotlight）會帶使用者進入計劃頁逐一介紹工具列、週次、
 *   訓練排程、恢復狀態等組件 —— 若計劃頁是空的（No Active Plan），
 *   這些 data-onboard 目標就不存在，教學會框到空白畫面。
 *
 *   因此教學「進入計劃頁前」會呼叫 installDemoPlan() 注入一份示範計劃，
 *   讓 LuxuryPlanView 正常渲染所有組件；教學結束時呼叫 removeDemoPlan()
 *   還原使用者原本的狀態（空計劃者回到空計劃，原本有計劃者完整還原）。
 *
 * 設計重點：
 *   · 計劃物件需含 plan_id —— LuxuryPlanViewMobile 的 localStorage 還原
 *     邏輯要求 parsed.plan_id 存在才會採用。
 *   · 標上 _isOnboardingDemo 旗標，方便辨識與清除。
 *   · 不依賴後端、不依賴 generateUnifiedPlan，內容固定、輕量、可預期。
 * ───────────────────────────────────────────────────────────────────── */

const PLAN_KEY = (uid) => `currentPlan_${uid}`;
// 備份 key：注入示範計劃前，把使用者原本的 currentPlan 暫存於此
const BACKUP_KEY = (uid) => `__onboard_plan_backup_${uid}`;
// 旗標：標記目前 currentPlan 是教學示範計劃（避免誤判 / 重複注入）
const FLAG_KEY = (uid) => `__onboard_demo_plan_active_${uid}`;

/** 產生一個示範訓練日 */
const demoDay = (dayNumber, focus, shortFocus, exercises) => ({
    day_id: `demo-d${dayNumber}`,
    dayNumber,
    focus,
    shortFocus,
    time: String(28 + dayNumber * 6),
    exercises: exercises.map((e, i) => ({
        id: `demo-d${dayNumber}-e${i}`,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        rest: e.rest || 90,
        muscle: e.muscle,
    })),
});

/** 建立一份完整的四週示範計劃 */
export function buildDemoPlan() {
    const dayA = () => demoDay(1, 'UPPER · PUSH', '推', [
        { name: 'Barbell Bench Press', sets: 4, reps: '8-10', muscle: 'Chest', rest: 120 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', muscle: 'Chest' },
        { name: 'Overhead Press', sets: 3, reps: '8-10', muscle: 'Shoulders' },
        { name: 'Triceps Rope Pushdown', sets: 3, reps: '12-15', muscle: 'Triceps' },
    ]);
    const dayB = () => demoDay(2, 'LOWER · LEGS', '腿', [
        { name: 'Back Squat', sets: 4, reps: '6-8', muscle: 'Quads', rest: 150 },
        { name: 'Romanian Deadlift', sets: 3, reps: '8-10', muscle: 'Hamstrings' },
        { name: 'Walking Lunge', sets: 3, reps: '12 / leg', muscle: 'Glutes' },
        { name: 'Standing Calf Raise', sets: 4, reps: '15-20', muscle: 'Calves' },
    ]);
    const dayC = () => demoDay(3, 'UPPER · PULL', '拉', [
        { name: 'Pull-Up', sets: 4, reps: '6-10', muscle: 'Back', rest: 120 },
        { name: 'Barbell Row', sets: 3, reps: '8-10', muscle: 'Back' },
        { name: 'Face Pull', sets: 3, reps: '15-20', muscle: 'Rear Delts' },
        { name: 'Dumbbell Curl', sets: 3, reps: '10-12', muscle: 'Biceps' },
    ]);

    const makeWeek = (phaseLabel) => ({
        phase: phaseLabel,
        days: [dayA(), dayB(), dayC()],
    });

    return {
        plan_id: 'onboarding-demo-plan',
        plan_name: 'Sample Training Plan',
        name: 'Sample Training Plan',
        split_type: 'PPL',
        split_label: 'Push · Pull · Legs',
        training_style: 'hypertrophy',
        session_duration: 45,
        user_level: 'beginner',
        days_per_week: 3,
        selected_hashtags: ['#Chest', '#Back', '#Legs'],
        selected_tags: ['#Chest', '#Back', '#Legs'],
        equipment_preference: 'gym',
        injuries: [],
        user_profile: { level: 'beginner', assessment: {} },
        superset_enabled: false,
        is_first_plan: false,           // 不觸發計劃頁自己的歡迎彈窗
        _isOnboardingDemo: true,        // 教學示範旗標
        ai_insight: '這是教學導覽用的示範課表，完成教學後即會清除。',
        weeks: [
            makeWeek('FOUNDATION'),
            makeWeek('ACCUMULATION'),
            makeWeek('INTENSIFICATION'),
            makeWeek('PEAK PERFORMANCE'),
        ],
        created_at: new Date().toISOString(),
    };
}

/**
 * 注入示範計劃。
 *  - 若使用者本來就有真實計劃 → 不動它（回傳 false，代表沒注入）
 *  - 若計劃頁是空的 → 把示範計劃寫進 currentPlan，並備份原值
 * @returns {boolean} 是否實際注入了示範計劃
 */
export function installDemoPlan(userId) {
    if (!userId) return false;
    try {
        // 已經注入過 → 不重複
        if (localStorage.getItem(FLAG_KEY(userId)) === 'true') return true;

        const existing = localStorage.getItem(PLAN_KEY(userId));
        if (existing) {
            try {
                const parsed = JSON.parse(existing);
                // 使用者已有真實計劃 → 教學直接用真實計劃，不注入示範
                if (parsed && parsed.plan_id && !parsed._isOnboardingDemo) {
                    return false;
                }
            } catch { /* 解析失敗就當作沒有計劃，往下注入 */ }
        }

        // 備份原本的值（可能是 null）
        localStorage.setItem(BACKUP_KEY(userId), existing == null ? '__null__' : existing);
        // 寫入示範計劃
        localStorage.setItem(PLAN_KEY(userId), JSON.stringify(buildDemoPlan()));
        localStorage.setItem(FLAG_KEY(userId), 'true');
        console.log('[OnboardingDemo] 已注入教學示範計劃');
        return true;
    } catch (e) {
        console.warn('[OnboardingDemo] installDemoPlan 失敗', e);
        return false;
    }
}

/**
 * 移除示範計劃，還原使用者原本的狀態。
 * 教學結束 / 跳過時呼叫。
 */
export function removeDemoPlan(userId) {
    if (!userId) return;
    try {
        if (localStorage.getItem(FLAG_KEY(userId)) !== 'true') return;

        const backup = localStorage.getItem(BACKUP_KEY(userId));
        if (backup == null || backup === '__null__') {
            // 原本沒有計劃 → 移除，計劃頁回到空狀態
            localStorage.removeItem(PLAN_KEY(userId));
        } else {
            // 原本有計劃 → 完整還原
            localStorage.setItem(PLAN_KEY(userId), backup);
        }
        localStorage.removeItem(BACKUP_KEY(userId));
        localStorage.removeItem(FLAG_KEY(userId));
        console.log('[OnboardingDemo] 已移除教學示範計劃並還原原狀態');
    } catch (e) {
        console.warn('[OnboardingDemo] removeDemoPlan 失敗', e);
    }
}

/** 目前 currentPlan 是否為教學示範計劃 */
export function isDemoPlanActive(userId) {
    if (!userId) return false;
    try {
        return localStorage.getItem(FLAG_KEY(userId)) === 'true';
    } catch { return false; }
}
