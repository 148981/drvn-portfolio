import { cacheRunCycle } from './trainingFocus';
import { cacheWeekBricks } from './dailyAgenda';
import { activateStrengthPlan } from './strengthPlanCompletion';
import { toLocalDateKey } from './localDate';

export const newProgramId = () => globalThis.crypto?.randomUUID?.() || `program_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const copy = v => JSON.parse(JSON.stringify(v));
const revisions = new Map();
export const programRevision = userId => revisions.get(userId) || 0;

export function selectCourseLevels(course, strengthLevel, runLevel) {
    const strength = course?.levels?.[strengthLevel];
    const running = course?.levels?.[runLevel];
    if (!strength?.weeks?.length || !running?.weeks?.length) throw new Error('找不到所選難度的課程');
    const hasRuns = running.weeks.some(w => w.runPlan?.length);
    if (hasRuns && running.weeks.length !== strength.weeks.length) throw new Error('兩種難度的課程週數不一致');
    const result = copy(course);
    result.levels[strengthLevel].weeks = strength.weeks.map((w, i) => ({ ...copy(w),
        runPlan: copy(running.weeks[i]?.runPlan || []),
        weekMileageKm: (running.weeks[i]?.runPlan || []).reduce((s, r) => s + Number(r.distance_km || 0), 0),
    }));
    result.track_levels = { strength: strengthLevel, running: runLevel };
    return result;
}

export function prepareCourseProgram(course, strengthLevel, runLevel, { programId = newProgramId(), startDate = toLocalDateKey(new Date()) } = {}) {
    const selected = selectCourseLevels(course, strengthLevel, runLevel);
    const weeks = selected.levels[strengthLevel].weeks;
    const source = { id: course.id, name: course.name, strengthLevel, runLevel };
    const strength = {
        ...copy(course), levels: undefined, weeks, plan_id: `${programId}:strength`,
        name: course.name, plan_name: course.name, startDate, cycleWeeks: weeks.length,
        days_per_week: selected.levels[strengthLevel].recommendedDays,
        source_course: source, track_levels: selected.track_levels, cycle_id: programId,
    };
    strength.weeks.forEach((w, wi) => {
        w.week_number = wi + 1;
        w.days.forEach((d, di) => { d.day_number = di + 1; d.source_session_id = `${programId}:strength:w${wi + 1}:d${di + 1}`; });
    });
    const running = weeks.some(w => w.runPlan.length) ? {
        plan_type: 'cardio', goal: course.bodyPart === 'hybrid_fatloss' ? 'fat_loss' : 'race_5k_10k',
        current_level: runLevel, start_date: startDate, total_weeks: weeks.length,
        sessions_per_week: weeks[0].runPlan.length, source_course: source,
        meta: { include_strength: false, pacing_mode: 'effort', source: 'coach_course', baseline_pace_5k_sec: null },
        weeks: weeks.map((w, wi) => ({ week_index: wi + 1, phase: wi === weeks.length - 1 ? 'taper' : 'base', settlement: null,
            target_mileage_km: w.weekMileageKm,
            bricks: w.runPlan.map((r, ri) => ({ ...copy(r), brick_id: `${programId}:run:w${wi + 1}:s${ri + 1}`,
                source_session_id: `${course.id}:${runLevel}:w${wi + 1}:s${ri + 1}`,
                source_prescription: copy(r), status: 'pending',
                type: ['tempo', 'interval'].includes(r.subtype) ? 'speed' : r.subtype === 'long' ? 'long' : 'recovery',
                title: `${r.distance_km} 公里 · ${r.subtype}`, prescription_note: r.note || '',
                rpe_band: { min: Number(String(r.rpe || '3').match(/\d+/)?.[0]) || 3, max: Number(String(r.rpe || '4').match(/\d+/g)?.at(-1)) || 4, label: r.rpe || '依體感', color: '#7BD3A5' },
                target_pace_sec: null, target_pace_label: '依課程體感', duration_min: null,
            })),
        })),
    } : null;
    return { program_id: programId, strength, running };
}

export function publishProgram(userId, result) {
    revisions.set(userId, programRevision(userId) + 1);
    if (result.strength) {
        const p = result.strength;
        let prevId = null;
        try { prevId = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null')?.plan_id || null; } catch { /* unreadable cache */ }
        const isNewPlan = prevId !== p.plan_id;
        localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(p));
        localStorage.setItem('currentPlan', JSON.stringify(p));
        localStorage.setItem('currentPlanId', p.plan_id);
        // 星期排程：使用者排的（training_schedule）> 課程自帶的 calendarDay > 都沒有。
        // 以前只看 calendarDay —— 精靈排的、中控改的星期每次開中控都被洗成空的。
        const schedules = strengthScheduleFromPlan(p);
        if (schedules) localStorage.setItem(`weeklyTrainingDays_${userId}`, JSON.stringify(schedules));
        // 換了一份新計劃又沒有排程 → 清掉舊的，讓頁面依新計劃的天數重排；
        // 不然 5 天的新課表套在 3 天的舊排程上，第 4、5 天永遠不會出現在首頁。
        else if (isNewPlan) localStorage.removeItem(`weeklyTrainingDays_${userId}`);
        if (isNewPlan) {
            // 週回饋旗標是「每一週一個」，不分計劃 —— 新計劃要重新開始，不然第 1 週已填過就不再問。
            const n = Math.max(4, p.weeks?.length || 0);
            for (let w = 1; w <= n; w++) localStorage.removeItem(`week_feedback_${userId}_week${w}`);
        }
        activateStrengthPlan(userId, p.plan_id);
    }
    if (result.running) {
        const p = result.running;
        let previous;
        try { previous = JSON.parse(localStorage.getItem(`u_${userId}_onboarding_cardio_plan`) || 'null'); } catch { /* no readable cache */ }
        localStorage.setItem(`u_${userId}_onboarding_cardio_plan`, JSON.stringify(p));
        cacheRunCycle(userId, p);
        const offset = Math.floor((new Date() - new Date(`${p.start_date}T00:00:00`)) / 604800000);
        cacheWeekBricks(userId, p.weeks[Math.max(0, offset)]?.bricks || []);
        localStorage.setItem(`u_${userId}_run_day_overrides`, JSON.stringify(p.day_overrides || {}));
        if (previous?.plan_id !== p.plan_id) localStorage.removeItem(`u_${userId}_run_tweaks`);
    }
    if (result.nutrition) localStorage.setItem(`drvn_nutrition_plan_${userId}`, JSON.stringify(result.nutrition));
    for (const [key, history] of Object.entries(result.reviews || {})) {
        if (Array.isArray(history)) localStorage.setItem(`drvn:training-review:${userId}:${key}`, JSON.stringify(history));
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('training-program-changed'));
}

/** 回傳 { [week]: { [jsWeekday]: dayNumber } }，沒有任何排程時回傳 null。 */
export function strengthScheduleFromPlan(p) {
    const nonEmpty = (sched) => sched && typeof sched === 'object'
        && Object.values(sched).some(w => w && typeof w === 'object' && Object.keys(w).length > 0);
    const ts = p?.training_schedule;
    if (nonEmpty(ts)) {
        const out = {};
        Object.entries(ts).forEach(([week, map]) => {
            if (!map || typeof map !== 'object') return;
            out[week] = Object.fromEntries(Object.entries(map)
                .map(([js, n]) => [Number(js) % 7, Number(n)])
                .filter(([js, n]) => Number.isInteger(js) && n > 0));
        });
        if (nonEmpty(out)) return out;
    }
    const fromCourse = {};
    (p?.weeks || []).forEach((w, wi) => {
        fromCourse[wi + 1] = Object.fromEntries((w.days || []).filter(d => d.calendarDay != null)
            .map((d, di) => [Number(d.calendarDay) % 7, d.day_number || d.dayNumber || di + 1]));
    });
    return nonEmpty(fromCourse) ? fromCourse : null;
}

export async function activateProgram(userId, program, apiClient) {
    const key = `drvn:pending-program:${userId}`;
    const pending = readPendingProgram(userId);
    if (pending && pending.program_id !== program.program_id) {
        /* 上一份還沒確認同步（上次送出時斷線）。以前直接丟錯，
           使用者在這一頁怎麼按都是同一句「請先到中控重試」，整個卡住。
           現在先把上一份補送（伺服器用交易收據去重，送兩次不會變兩份），成功了再送這一份；
           連不上就講清楚是網路，恢復後在原地再按一次就好。 */
        try {
            await sendProgram(userId, pending, apiClient, key);
        } catch (error) {
            const status = error?.response?.status;
            if (!(status >= 400 && status < 500 && ![408, 429].includes(status))) {
                const e = new Error('目前連不上伺服器，恢復連線後再按一次');
                e.code = 'offline';
                throw e;
            }
            // 上一份被伺服器拒絕（已作廢）→ sendProgram 已清掉它，繼續送這一份
        }
    }
    return sendProgram(userId, program, apiClient, key);
}

async function sendProgram(userId, program, apiClient, key) {
    // Persist the exact request before sending. A lost response can be retried
    // after reload using the server's existing transaction receipt.
    localStorage.setItem(key, JSON.stringify(program));
    let data;
    try {
        ({ data } = await apiClient.post('/api/training-program/activate', { ...program, user_id: userId }));
    } catch (error) {
        const status = error?.response?.status;
        if (status >= 400 && status < 500 && ![408, 429].includes(status)) localStorage.removeItem(key);
        throw error;
    }
    if (data?.status !== 'success') throw new Error('計劃尚未成功啟用');
    publishProgram(userId, data);
    localStorage.removeItem(key);
    return data;
}

export function readPendingProgram(userId) {
    try { return JSON.parse(localStorage.getItem(`drvn:pending-program:${userId}`)) || null; } catch { return null; }
}

/**
 * 掛載型套裝（跑者護甲那種：只排重訓、跑步沿用使用者原本的）在啟用時，
 * 把使用者現有的跑步計劃「接」到這個 program 上，中控台才看得到同一週裡
 * 重訓與跑步怎麼併。
 *
 * ⚠️ 原本的守門是 `!Object.keys(overrides).length → 直接回傳`，意思是
 *    「只有使用者手動改過日期才接」。改期那一塊 UI 拿掉之後 overrides 永遠
 *    是空的，於是跑者護甲從此再也不會接上跑步軌 —— 課表啟用了，中控台卻
 *    只看得到重訓。現在只要有跑步計劃就接。
 *
 * 沒有跑步計劃也照樣回傳 program：使用者本來就可以只練重訓，
 * 不該因為沒排跑步就開始不了這門課。只有「改了日期卻沒有計劃可改」才是錯。
 */
export function withExistingRunSchedule(userId, program, overrides) {
    if (program.running) return program;          // 這門課自己帶跑步處方，不必外接
    const ov = overrides || {};
    let running = null;
    try { running = JSON.parse(localStorage.getItem(`u_${userId}_onboarding_cardio_plan`) || 'null'); }
    catch { running = null; }
    if (!running?.plan_id) {
        if (Object.keys(ov).length) throw new Error('請先同步目前跑步計劃，再確認改期');
        return program;                            // 還沒排跑步 —— 只啟用重訓那一軌
    }
    return { ...program, running_schedule: { plan_id: running.plan_id, day_overrides: ov } };
}

export async function retryPendingProgram(userId, apiClient) {
    const pending = readPendingProgram(userId);
    return pending ? activateProgram(userId, pending, apiClient) : null;
}

export async function refreshProgram(userId, apiClient, isActive = () => true) {
    const revision = programRevision(userId);
    const { data } = await apiClient.get(`/api/training-program/${userId}/current`);
    if (!isActive() || revision !== programRevision(userId)) return false;
    // Missing cloud tracks do not erase legacy local-only plans.
    publishProgram(userId, data);
    return true;
}
