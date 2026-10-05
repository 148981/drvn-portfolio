import axios from 'axios';
import indexedDBManager from '../utils/indexedDB';

const apiClient = axios.create({
    // 與 config/api.js 一致：優先 VITE_API_URL（忽略 localhost 以免覆蓋區網/手機連線）
    baseURL: (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost'))
        ? import.meta.env.VITE_API_URL
        : `http://${window.location.hostname}:8000`,
    timeout: 15000, // deep analysis 計算複雜，給足 15 秒
    maxContentLength: 500 * 1024 * 1024, // 500 MB — 允許大影片上傳
    maxBodyLength: 500 * 1024 * 1024,    // 500 MB — axios 預設太小會擋大檔案
    headers: {
        'Content-Type': 'application/json',
    },
});

// ── Auto-attach JWT Bearer token ────────────────────────────────
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // 📶 弱網分流：大檔上傳（FormData，如影片/頭貼）不適用一般 15s timeout。
    //    只在呼叫端沒有自訂 timeout 時放寬到 120s，避免弱網上傳必失敗。
    if (typeof FormData !== 'undefined' && config.data instanceof FormData
        && (config.timeout === undefined || config.timeout === apiClient.defaults.timeout)) {
        config.timeout = 120000;
    }
    return config;
});

// ── Auto-redirect to /login on 401 ──────────────────────────────
// 用 CustomEvent 通知 React（而非強制 location.href，以支援 SPA router）
apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            // HashRouter：路由在 hash 裡，只看 pathname 永遠判斷不到「人已經在登入頁」
            const loc = `${window.location.pathname}${window.location.hash}`;
            const isAuthRoute = loc.includes('/login') || loc.includes('/auth-callback');
            /* 🔁 過期請求不能登出新身分：登入前發出、登入後才回來的 401，
               帶的是舊 token —— 若照樣清掉 auth_token，剛登入的人會立刻被踢回登入頁。
               只有「送出的 token 就是目前這一張」（或兩邊都沒有）才算真的失效。 */
            const sentAuth = err.config?.headers?.Authorization || err.config?.headers?.authorization || '';
            let currentToken = null;
            try { currentToken = localStorage.getItem('auth_token'); } catch { /* localStorage 不可用 */ }
            const staleRequest = !!currentToken && sentAuth !== `Bearer ${currentToken}`;
            if (!isAuthRoute && !staleRequest) {
                localStorage.removeItem('auth_token');
                /* ⚠️ 這裡原本連 drvn_auth_choice 一起清掉，訪客會被鎖死：
                   訪客的匿名 token 過期 → 401 → 清掉「我選擇以訪客身分繼續」這個旗標
                   → ensureGuestToken() 下次看到旗標不是 'guest' 就直接 return
                   → 永遠拿不到新 token → 每一支私人 API 都 401
                   → 首頁三張統計卡永遠是「部分紀錄暫時無法載入」。
                   token 是憑證（過期要丟），登入方式是使用者的選擇（不該被 401 撤銷）。
                   正式帳號才清，讓他重新選；訪客保留選擇，下一次啟動自動換新 token。 */
                try {
                    if (localStorage.getItem('drvn_auth_choice') !== 'guest') {
                        localStorage.removeItem('drvn_auth_choice');
                    }
                } catch { /* localStorage 不可用 */ }
                // 🔐 token 失效 → 也清掉 Keychain，避免重裝後還原到已失效的登入
                try { window.webkit?.messageHandlers?.authBridge?.postMessage({ action: 'clear' }); } catch (_) {}
                // 發送 custom event，讓 App.jsx 的 auth-changed 監聽器接手，
                // 透過 React Router navigate() 跳轉，避免整頁重載
                window.dispatchEvent(new CustomEvent('auth-changed', { detail: { reason: '401' } }));
            }
        }
        return Promise.reject(err);
    }
);

export const uploadExpertVideo = async (files) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    const response = await apiClient.post('/upload/expert', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const addExpertVideos = async (files) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    const response = await apiClient.post('/upload/expert/add', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const uploadUserVideo = async (file, isSideView = false, userId = null, coachId = null, onProgress = null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('is_side_view', isSideView);
    if (userId) formData.append('user_id', userId);
    if (coachId) formData.append('coach_id', coachId);

    const response = await apiClient.post('/upload/user', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
            if (onProgress) {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percentCompleted);
            }
        }
    });
    return response.data;
};

export const checkBackendHealth = async () => {
    try {
        await apiClient.get('/');
        return true;
    } catch (e) {
        return false;
    }
};

export const getCoachMatches = async (userId) => {
    const response = await apiClient.get(`/api/coaches/match/${userId}`);
    return response.data;
};

export const saveWorkout = async (workoutData) => {
    if (!workoutData.user_id) {
        console.error('❌ [API] Cannot save workout: user_id is missing', workoutData);
        throw new Error('user_id is required to save workout');
    }

    // 為每筆重訓建立穩定 id（離線排隊 / 去重用）。若呼叫端沒給就現場產生。
    const sessionId = workoutData.session_id || `lift_${workoutData.user_id}_${Date.now()}`;

    try {
        // Use standard JSON for structured data without files
        const response = await apiClient.post('/api/workout/save', workoutData);
        // ✅ 線上成功：仍寫一筆「已同步」到本機，讓歷史/離線檢視一致，且不會被同步迴圈重送
        try {
            await indexedDBManager.saveWorkout(workoutData.user_id, {
                session_id: sessionId,
                kind: 'strength',
                endpoint: '/api/workout/save',
                payload: workoutData,
                timestamp: Date.now(),
                synced: true,
            });
        } catch (_) { /* 本機備份失敗不影響線上結果 */ }
        return response.data;
    } catch (err) {
        // ❌ POST 失敗（多半是離線/斷線）：寫入 IndexedDB 待同步，絕不讓重訓紀錄遺失
        console.warn('⚠️ [API] saveWorkout 失敗，改存本機待同步:', err?.message || err);
        await indexedDBManager.saveWorkout(workoutData.user_id, {
            session_id: sessionId,
            kind: 'strength',
            endpoint: '/api/workout/save',
            payload: workoutData,
            timestamp: Date.now(),
            synced: false,
        });
        // 回傳離線標記給呼叫端，讓 UI 可顯示「已存本機，待連線同步」而非真正的錯誤
        return { offline: true, queued: true, session_id: sessionId };
    }
};

// 重訓離線同步：把 IndexedDB 內所有未同步的「重訓」紀錄重新 POST 上去。
// 接受 { onProgress(done,total) }，回傳實際成功上傳的筆數。供 SyncStatusIndicator 呼叫。
// 🔒 同一時間只跑一輪：啟動自動同步、回到線上、手動「同步」按鈕可能同時觸發，
//    兩輪一起跑會把同一筆重訓上傳兩次（後端沒有去重）。第二個呼叫者直接等第一輪的結果。
let _strengthSyncInFlight = null;
export const syncPendingStrengthWorkouts = (userId, opts = {}) => {
    if (!userId) return Promise.resolve(0);
    if (_strengthSyncInFlight) return _strengthSyncInFlight;
    _strengthSyncInFlight = _syncPendingStrengthWorkouts(userId, opts)
        .finally(() => { _strengthSyncInFlight = null; });
    return _strengthSyncInFlight;
};
const _syncPendingStrengthWorkouts = async (userId, { onProgress } = {}) => {
    const unsynced = await indexedDBManager.getUnsyncedWorkouts(userId);
    // 只挑重訓（有 endpoint=/api/workout/save 或 kind=strength）。跑步紀錄交給 cardio 自己的迴圈。
    const liftItems = unsynced.filter(
        (w) => w.workout?.kind === 'strength' || w.workout?.endpoint === '/api/workout/save'
    );
    const total = liftItems.length;
    if (total === 0) return 0;
    if (onProgress) onProgress(0, total);

    let synced = 0;
    for (let i = 0; i < liftItems.length; i++) {
        const item = liftItems[i];
        try {
            const payload = item.workout?.payload;
            if (payload) {
                const res = await apiClient.post('/api/workout/save', payload);
                if (res.status === 200 || res.status === 201) {
                    await indexedDBManager.markWorkoutSynced(item.id);
                    synced++;
                }
            }
        } catch (e) {
            console.warn(`重訓同步失敗 ${item.id}:`, e?.message || e);
        }
        if (onProgress) onProgress(i + 1, total);
    }
    return synced;
};

export const getWorkoutHistory = async (userId, limit = 10) => {
    const response = await apiClient.get(`/api/workout/history/${userId}?limit=${limit}`);
    return response.data;
};

export const getProgressStats = async (userId) => {
    const response = await apiClient.get(`/api/workout/progress/${userId}`);
    return response.data;
};

export const updateProgram = async (data) => {
    const response = await apiClient.put('/api/program/update', data);
    return response.data;
};

export const getCardioRuns = async (userId, limit = 50) => {
    const response = await apiClient.get(`/api/cardio/${userId}/runs?limit=${limit}`);
    return response.data;
};

export const getNutritionHistory = async (userId, days = 7) => {
    // Use the SQL endpoint — that's where meal logs are actually stored (nutrition.db)
    const response = await apiClient.get(`/api/nutrition/sql/history/${userId}?days=${days}`);
    return response.data;
};

/**
 * getDashboardData — 一次平行取得 Dashboard 所需的所有資料
 * 原本依序呼叫 3 個 API 需要 ~600ms，平行後只需最慢的那個 ~200ms
 *
 * 🔴 Fix: 改用 Promise.allSettled，確保任一 API 失敗不會連帶其他資料一起消失。
 * 失敗的項目回傳 null，呼叫端可顯示部分內容而非整頁空白。
 *
 * Usage:
 *   const { history, stats, nutrition } = await getDashboardData(userId);
 */
export const getDashboardData = async (userId, { historyLimit = 10, nutritionDays = 7 } = {}) => {
    const [historyResult, statsResult, nutritionResult] = await Promise.allSettled([
        getWorkoutHistory(userId, historyLimit),
        getProgressStats(userId),
        getNutritionHistory(userId, nutritionDays),
    ]);

    const extract = (result, label) => {
        if (result.status === 'fulfilled') return result.value;
        console.warn(`[getDashboardData] ${label} failed:`, result.reason?.message || result.reason);
        return null;
    };

    return {
        history:   extract(historyResult,   'workout history'),
        stats:     extract(statsResult,     'progress stats'),
        nutrition: extract(nutritionResult, 'nutrition history'),
    };
};

/**
 * getStandbyData — 待機畫面（StandbyScreen）所需的聚合資料
 *
 * 平行抓取 5 個後端端點，任一失敗不影響其他（Promise.allSettled），
 * 並映射成 StandbyScreen 期望的格式：
 *   { userId, displayName, healthData, trainingData, goalData, socialData, nutritionData }
 *
 * ⚠️ 注意：steps / heartRate / hrv / sleepHrs / bodyFat 屬於 HealthKit
 * 即時量測數據，只在運動進行中才有；待機畫面為閒置展示，這些欄位
 * 以最近一次紀錄或合理預設值呈現（不會顯示假的即時心率）。
 */
export const getStandbyData = async (userId) => {
    const safeUid = userId || 'guest';

    const get = (url) => apiClient.get(url).then(r => r.data);

    const [reportR, profileR, goalsR, cardioR, nutritionR, inbodyR, runWeekR] = await Promise.allSettled([
        get(`/api/user/monthly-report/${safeUid}`),
        get(`/api/user/profile/${safeUid}`),
        get(`/api/user/goals/${safeUid}`),
        get(`/api/cardio/${safeUid}/stats`),
        get(`/api/nutrition/daily/${safeUid}`),   // 今日營養攝取
        get(`/api/user/inbody-history/${safeUid}?limit=1`), // 最近一次 InBody 量測
        get(`/api/cardio/analytics/summary/${safeUid}?period=week`), // 本週跑步累積
    ]);

    const pick = (res) => (res.status === 'fulfilled' ? res.value : null);
    const report    = pick(reportR)    || {};
    const profile   = pick(profileR)   || {};
    const goals     = pick(goalsR)?.goals || {};
    const cardio    = pick(cardioR)    || {};
    const nutrition = pick(nutritionR) || {};
    // InBody：取最近一筆量測紀錄（history 已依日期降冪排序）
    const inbodyHist = pick(inbodyR)?.history || [];
    const inbody     = inbodyHist[0] || {};
    // 本週跑步：/api/cardio/analytics/summary?period=week → { analytics: {...} }
    const runWeek    = pick(runWeekR)?.analytics || {};

    const overview = report.overview || {};
    const fitness  = report.fitness || {};
    const reportCardio = report.cardio || {};

    // ── 顯示名稱：profile.name / nickname → report.meta.user_name → fallback ──
    const displayName = (
        profile.name || profile.nickname || profile.display_name ||
        report.meta?.user_name || 'ATHLETE'
    ).toString().toUpperCase();

    // ── 數值工具：取數字、四捨五入、保底 ──
    const num = (v, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    };

    // ── 訓練數據 ──
    const weekSessions = num(overview.avg_weekly_sessions, num(fitness.sessions, 0));
    const weeklyFreqGoal = num(profile.weekly_frequency, 6) || 6;
    const fitnessCalories = num(fitness.calories) ||
        num(fitness.sessions) * 300;  // 粗估：每場約 300 kcal
    const caloriesWeek = Math.round(
        num(reportCardio.total_calories) + fitnessCalories
    ) || num(cardio.total_calories);

    // 最佳個人紀錄：取 monthly-report 的第一筆 PR
    const topPr = (fitness.prs && fitness.prs[0]) || {};
    const personalBest = {
        label: (topPr.exercise || topPr.name || topPr.label || 'TRAINING').toString().toUpperCase(),
        value: (topPr.value != null
            ? `${topPr.value}${topPr.unit || (typeof topPr.value === 'number' ? 'KG' : '')}`
            : `${num(fitness.best_score, 0)}PT`),
        date: (topPr.date || report.meta?.month || '').toString().slice(5).replace('-', '.') || '—',
    };

    return {
        userId: safeUid,
        displayName,

        healthData: {
            // 心率：跑步月報的平均心率 > 個人檔案靜息心率
            heartRate:  num(reportCardio.avg_hr, 0) || num(profile.resting_hr, 0),
            // 註：steps / sleepHrs / hrv 需 HealthKit 被動同步，目前後端無此資料來源，
            //     待機畫面不再做這幾頁；保留欄位避免其他呼叫端壞掉。
            steps:      0,
            stepGoal:   10000,
            sleepHrs:   0,
            hrv:        0,
            bodyFat:    num(inbody.body_fat_percent, num(profile.body_fat_percent, 0)),
        },

        // InBody 身體組成 — 最近一次量測（/api/user/inbody-history）
        // 量測欄位名稱對齊後端 workout_history.calculate_inbody_trends 追蹤的指標
        inbodyData: {
            hasData:        inbodyHist.length > 0,
            measuredAt:     inbody.measurement_date || '',
            bodyFatPercent: num(inbody.body_fat_percent, num(profile.body_fat_percent, 0)),
            skeletalMuscle: num(inbody.skeletal_muscle_mass, num(profile.skeletal_muscle_mass, 0)),
            weightKg:       num(inbody.weight_kg, num(profile.weight_kg, 0)),
            bmi:            num(inbody.bmi, num(profile.bmi, 0)),
            // 目標值（goals）— 給「現況→目標」進度用
            bodyFatTarget:  num(goals.body_fat_target, num(profile.body_fat_goal, 0)),
            weightTarget:   num(goals.weight_target, num(profile.target_weight, 0)),
        },

        // 本週跑步累積 — /api/cardio/analytics/summary?period=week
        // analytics 回傳：total_runs / total_distance(km) / total_duration(sec) /
        //               avg_pace(sec/km) / avg_cadence / avg_hr / total_calories
        runningData: {
            totalRuns:     num(runWeek.total_runs, 0),
            totalDistance: num(runWeek.total_distance, 0),   // km
            totalDuration: num(runWeek.total_duration, 0),   // 秒
            totalCalories: num(runWeek.total_calories, 0),
            avgPaceSec:    num(runWeek.avg_pace, 0),         // 秒 / km
            avgCadence:    num(runWeek.avg_cadence, 0),
            avgHr:         num(runWeek.avg_hr, 0),
        },

        trainingData: {
            streak:       num(overview.best_streak, 0),
            weekSessions: Math.round(weekSessions),
            weekGoal:     weeklyFreqGoal,
            totalMins:    num(fitness.total_duration_mins,
                              Math.round(num(overview.total_hours) * 60)),
            personalBest,
            lastWorkout:  (fitness.last_focus || fitness.last_workout || 'TRAINING')
                              .toString().toUpperCase(),
            caloriesWeek,
        },

        goalData: {
            weeklyGoal:      weeklyFreqGoal,
            weeklyDone:      Math.round(weekSessions),
            monthGoal:       num(goals.monthly_target, weeklyFreqGoal * 4) || weeklyFreqGoal * 4,
            monthDone:       num(overview.active_days, num(fitness.sessions, 0)),
            bodyFatGoal:     num(goals.body_fat_target, num(profile.body_fat_goal, 0)),
            stepGoalHitRate: num(overview.consistency_pct, 0),
        },

        socialData: {
            rank:      num(profile.rank, num(profile.xp_level, 0)),
            likes:     num(profile.total_likes, 0),
            followers: num(profile.followers_count, num(profile.followers, 0)),
            feedCount: num(fitness.sessions, 0),
        },

        // 今日營養攝取 — /api/nutrition/daily 回傳 { meals, summary }
        nutritionData: (() => {
            const sum = nutrition.summary || {};
            // 卡路里目標：goals 設定 > monthly-report 營養目標 > 預設 2000
            const calorieGoal = num(goals.calorie_target,
                num(report.nutrition?.targets?.calories, 2000)) || 2000;
            const proteinGoal = num(goals.protein_target,
                num(report.nutrition?.targets?.protein, 120)) || 120;
            return {
                calories:    num(sum.calories, 0),
                calorieGoal,
                protein:     num(sum.protein, 0),
                proteinGoal,
                carbs:       num(sum.carbs, 0),
                fats:        num(sum.fats, 0),
                water:       num(sum.water, 0),       // 杯數 / ml 依後端
                mealCount:   Array.isArray(nutrition.meals) ? nutrition.meals.length : 0,
            };
        })(),

        // 標記哪些資料來源成功，方便 debug
        _meta: {
            reportOk:    reportR.status === 'fulfilled',
            profileOk:   profileR.status === 'fulfilled',
            goalsOk:     goalsR.status === 'fulfilled',
            cardioOk:    cardioR.status === 'fulfilled',
            nutritionOk: nutritionR.status === 'fulfilled',
            inbodyOk:    inbodyR.status === 'fulfilled',
            runWeekOk:   runWeekR.status === 'fulfilled',
        },
    };
};

export default apiClient;
