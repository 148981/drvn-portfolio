// 課表 ID 是完成紀錄的身分；舊 per-week keys 僅作為目前課表的相容鏡像。
const scopeKey = (user, plan) => `drvn:strength-completion:${encodeURIComponent(user)}:${encodeURIComponent(plan)}`;
const ownerKey = user => `drvn:strength-completion-owner:${user}`;
const read = (storage, key, fallback) => {
    try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const days = value => Array.isArray(value) ? [...new Set(value.map(Number).filter(n => Number.isInteger(n) && n > 0))] : [];
const legacyKey = (user, week) => `completed_workouts_${user}_week${week}`;

export function activeStrengthPlanId(user, storage = localStorage) {
    const cached = read(storage, `currentPlan_${user}`, {});
    return storage.getItem(`active_plan_id_${user}`) || cached.plan_id || cached.id || null;
}

export function readStrengthPlanDays(user, planId, week, storage = localStorage) {
    if (!user || !planId) return [];
    return days(read(storage, scopeKey(user, planId), {})[week]);
}

/** 這一期（整個計劃，跨所有週）到目前為止完成幾堂。0 = 一堂都沒練。
 *  給「週期結束了要說什麼」用：沒練過就不能說「待回饋」。 */
export function strengthPlanCompletedCount(user, planId, weeks, storage = localStorage) {
    if (!user || !planId) return 0;
    const all = read(storage, scopeKey(user, planId), {});
    let n = 0;
    for (let w = 1; w <= (Number(weeks) || 0); w++) n += days(all[w]).length;
    return n;
}

export function activateStrengthPlan(user, planId, storage = localStorage) {
    if (!user || !planId) return;
    const previous = storage.getItem(ownerKey(user)) || storage.getItem(`active_plan_id_${user}`);
    const prefix = `completed_workouts_${user}_week`;
    const keys = [];
    const snapshot = {};
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const week = Number(key.slice(prefix.length));
        if (!Number.isInteger(week) || week < 1) continue;
        keys.push(key);
        snapshot[week] = days(read(storage, key, []));
    }
    if (previous) {
        const saved = read(storage, scopeKey(user, previous), {});
        for (const [week, completed] of Object.entries(snapshot)) saved[week] = days([...(saved[week] || []), ...completed]);
        storage.setItem(scopeKey(user, previous), JSON.stringify(saved));
    } else if (keys.length) {
        // 無法證明舊標記屬於哪份課表時保留備份，不把它算進新課表。
        storage.setItem(`drvn:strength-completion-unattributed:${user}`, JSON.stringify(snapshot));
    }
    keys.forEach(key => storage.removeItem(key));
    const current = read(storage, scopeKey(user, planId), {});
    for (const [week, completed] of Object.entries(current)) storage.setItem(legacyKey(user, week), JSON.stringify(days(completed)));
    storage.setItem(ownerKey(user), String(planId));
    storage.setItem(`active_plan_id_${user}`, String(planId));
}

export function recordStrengthPlanDay(user, planId, week, day, storage = localStorage) {
    week = Number(week); day = Number(day);
    if (!user || !planId || !Number.isInteger(week) || week < 1 || !Number.isInteger(day) || day < 1) return false;
    const saved = read(storage, scopeKey(user, planId), {});
    saved[week] = days([...(saved[week] || []), day]);
    storage.setItem(scopeKey(user, planId), JSON.stringify(saved));
    // 晚到的 A 課表完成事件只更新 A 的紀錄，不能動 B 的相容鏡像。
    if (String(activeStrengthPlanId(user, storage)) === String(planId)) {
        if (storage.getItem(ownerKey(user)) !== String(planId)) activateStrengthPlan(user, planId, storage);
        const combined = days([...days(read(storage, legacyKey(user, week), [])), ...saved[week]]);
        storage.setItem(legacyKey(user, week), JSON.stringify(combined));
    }
    return true;
}

/** recordStrengthPlanDay 的反向：結算頁「長按取消紀錄」要把剛打的勾拿掉，
 *  不然紀錄刪了、課表那天卻還是完成，週完成度與週回饋都會跟著錯。 */
export function unrecordStrengthPlanDay(user, planId, week, day, storage = localStorage) {
    week = Number(week); day = Number(day);
    if (!user || !planId || !Number.isInteger(week) || week < 1 || !Number.isInteger(day) || day < 1) return false;
    const saved = read(storage, scopeKey(user, planId), {});
    saved[week] = days(saved[week]).filter(d => d !== day);
    storage.setItem(scopeKey(user, planId), JSON.stringify(saved));
    // 相容鏡像只屬於目前課表；別的課表的取消不能動它（同 recordStrengthPlanDay）
    if (String(activeStrengthPlanId(user, storage)) === String(planId)) {
        const mirror = days(read(storage, legacyKey(user, week), [])).filter(d => d !== day);
        storage.setItem(legacyKey(user, week), JSON.stringify(mirror));
    }
    return true;
}

export function resetStrengthPlanCompletion(user, planId, storage = localStorage) {
    if (!user || !planId) return;
    const key = scopeKey(user, planId);
    const previous = storage.getItem(key);
    if (previous) storage.setItem(`${key}:archive:${Date.now()}`, previous);
    storage.setItem(key, '{}');
    if (String(activeStrengthPlanId(user, storage)) === String(planId)) {
        const prefix = `completed_workouts_${user}_week`;
        const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
        keys.filter(k => k?.startsWith(prefix)).forEach(k => storage.removeItem(k));
    }
}
