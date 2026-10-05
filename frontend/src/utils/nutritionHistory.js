import { logicalDayKey } from './dailyAgenda';
import { toLocalDateKey } from './localDate';

export function readableNutritionDays(days = []) {
    return (Array.isArray(days) ? days : []).filter(d => {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return false;
        const values = ['calories', 'protein', 'carbs', 'fats'].map(k => Number(d[k] ?? 0));
        return values.every(v => Number.isFinite(v) && v >= 0)
            && (Number(d.meal_count) > 0 || values.some(v => v > 0));
    }).sort((a, b) => a.date.localeCompare(b.date));
}

// Always return actual calendar dates, including gaps. Missing logs are not
// zero intake and must not be stitched into a consecutive-day streak.
export function nutritionCalendarWindow(days, length = 7, now = new Date()) {
    const end = new Date(`${logicalDayKey(now)}T12:00:00`);
    const byDate = new Map(readableNutritionDays(days).map(d => [d.date, d]));
    return Array.from({ length }, (_, i) => {
        const day = new Date(end); day.setDate(day.getDate() - length + 1 + i);
        const date = toLocalDateKey(day), found = byDate.get(date);
        return { ...(found || { calories: null, protein: null, carbs: null, fats: null }),
            date, logged: !!found, label: ['日', '一', '二', '三', '四', '五', '六'][day.getDay()] };
    });
}

export function nutritionTrendSeries(days, metric, now = new Date()) {
    return nutritionCalendarWindow(days, 14, now).map((d, i, all) => {
        const window = all.slice(Math.max(0, i - 6), i + 1).filter(x => x.logged);
        return { ...d, day: `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`,
            [metric]: d.logged ? Number(d[metric] || 0) : null,
            avg: d.logged && window.length >= 3 ? Math.round(window.reduce((s, x) => s + Number(x[metric] || 0), 0) / window.length) : null };
    });
}
