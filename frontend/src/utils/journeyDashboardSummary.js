// Calendar-week summaries. Date-only API values are local dates, not UTC midnight.
export function localRecordDate(raw) {
    if (!raw) return new Date(NaN);
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(raw);
}

export function dashboardWeekWindow(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const previous = new Date(start);
    previous.setDate(previous.getDate() - 7);
    return { start, previous, end: now };
}

export function inDashboardWeek(raw, { start, end }) {
    const date = localRecordDate(raw);
    return date >= start && date <= end;
}

export function positiveGoal(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function nutritionWeekAverage(history, window) {
    const days = new Map();
    for (const row of Array.isArray(history) ? history : []) {
        if (!inDashboardWeek(row.date, window)) continue;
        const calories = Number(row.summary?.calories ?? row.calories);
        const protein = Number(row.summary?.protein ?? row.protein);
        if (!Number.isFinite(calories) || calories <= 0) continue;
        days.set(String(row.date).slice(0, 10), { calories, protein: Number.isFinite(protein) && protein >= 0 ? protein : null });
    }
    const records = [...days.values()];
    if (!records.length) return { calories: null, protein: null, days: 0 };
    return {
        calories: Math.round(records.reduce((sum, row) => sum + row.calories, 0) / records.length),
        protein: records.every(row => row.protein !== null)
            ? Math.round(records.reduce((sum, row) => sum + row.protein, 0) / records.length) : null,
        days: records.length,
    };
}

export function bodyMeasurementPair(rows) {
    const valid = (Array.isArray(rows) ? rows : []).filter(row => row &&
        Number.isFinite(localRecordDate(row.measurement_date || row.date).getTime()))
        .map(row => ({ ...row,
            weight_kg: row.weight_kg ?? row.weight,
            skeletal_muscle_mass: row.skeletal_muscle_mass ?? row.muscle_mass,
            body_fat_percent: row.body_fat_percent ?? row.body_fat,
        }))
        .sort((a, b) => localRecordDate(b.measurement_date || b.date) - localRecordDate(a.measurement_date || a.date));
    const current = valid[0] || null;
    // 同一天重複匯入／修改不當成新的一次身體變化。
    const currentDay = String(current?.measurement_date || current?.date || '').slice(0, 10);
    const previous = valid.find(row => String(row.measurement_date || row.date).slice(0, 10) !== currentDay) || null;
    return { current, previous };
}
