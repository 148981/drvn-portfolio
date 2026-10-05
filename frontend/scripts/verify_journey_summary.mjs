import assert from 'node:assert/strict';
import { dashboardWeekWindow, inDashboardWeek, nutritionWeekAverage, positiveGoal, bodyMeasurementPair } from '../src/utils/journeyDashboardSummary.js';
const week = dashboardWeekWindow(new Date(2026, 8, 20, 12));
assert.equal(week.start.getDay(), 1);
assert.equal(week.start.getDate(), 14);
assert.equal(inDashboardWeek('2026-09-13', week), false);
assert.equal(inDashboardWeek('2026-09-14', week), true);
assert.equal(inDashboardWeek('2026-09-21', week), false);
assert.equal(inDashboardWeek('invalid', week), false);
assert.equal(dashboardWeekWindow(new Date(2026, 8, 21)).start.getDate(), 21);
assert.deepEqual(nutritionWeekAverage([{date:'2026-09-10',summary:{calories:1800,protein:90}}],week), {calories:null,protein:null,days:0});
assert.deepEqual(nutritionWeekAverage([
    {date:'2026-09-14',summary:{calories:1600,protein:80}},
    {date:'2026-09-15',summary:{calories:2000,protein:100}},
    {date:'2026-09-21',summary:{calories:9999,protein:999}},
],week), {calories:1800,protein:90,days:2});
assert.equal(nutritionWeekAverage([{date:'2026-09-14',calories:2000}],week).protein,null);
for (const value of [null, undefined, '', 0, -5, 'bad', Infinity]) assert.equal(positiveGoal(value),null);
assert.equal(positiveGoal('150'),150);
const pair = bodyMeasurementPair([
    {date:'2026-09-12',weight:65}, {date:'2026-09-12',weight:65},
    {date:'2026-09-01',weight:66}, {date:'invalid',weight:100},
]);
assert.equal(pair.current.weight_kg,65);
assert.equal(pair.previous.weight_kg,66);
assert.equal(bodyMeasurementPair([{date:'2026-09-12'},{date:'2026-09-12'}]).previous,null);
console.log('PASS: week boundary, future/invalid dates, empty nutrition, missing protein/goal, duplicate InBody dates.');
