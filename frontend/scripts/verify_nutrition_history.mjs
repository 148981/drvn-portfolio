import assert from 'node:assert/strict';
import { readableNutritionDays, nutritionCalendarWindow, nutritionTrendSeries } from '../src/utils/nutritionHistory.js';
const now = new Date('2026-09-08T18:00:00');
const rows = [
    {date:'2026-08-01',calories:2100,protein:150},
    {date:'2026-09-02',calories:2000,protein:140},
    {date:'2026-09-04',calories:2200,protein:155},
    {date:'2026-09-08',calories:80,protein:0},
    {date:'2026-09-07',calories:0,protein:0,meal_count:0},
];
const days = nutritionCalendarWindow(rows,7,now);
assert.equal(days.length,7);
assert.equal(days[0].date,'2026-09-02');
assert.equal(days.at(-1).date,'2026-09-08');
assert.equal(days.filter(d=>d.logged).length,3);
assert.equal(days.find(d=>d.date==='2026-09-07').calories,null);
assert.equal(readableNutritionDays(rows).find(d=>d.date==='2026-09-08').calories,80,'a small meal must remain visible');
const trend=nutritionTrendSeries(rows,'calories',now);
assert.equal(trend.length,14);
assert.equal(trend.at(-1).avg,1427);
assert.equal(trend.at(-2).avg,null,'a missing day is a gap, not an inferred point');
assert.equal(trend.find(d=>d.date==='2026-09-02').avg,null,'future logs cannot change a past average');
assert.equal(nutritionCalendarWindow(rows,7,new Date('2026-09-08T03:00:00')).at(-1).date,'2026-09-07');
console.log('PASS: real calendar windows, gaps, small meals, trailing averages, no future leakage, 06:00 day boundary');
