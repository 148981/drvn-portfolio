import assert from 'node:assert/strict';
import { DISHES, searchDishes } from '../src/data/dishLibrary.js';
import { dishSearchFood, preferredSearchFoods, foodSearchSignature } from '../src/utils/nutritionFoodSearch.js';
import { committedNutritionGoals } from '../src/utils/nutritionTargets.js';
import { nutritionHintFor } from '../src/utils/dailyAgenda.js';

for (const dish of DISHES) {
    const food = dishSearchFood(dish);
    assert.ok(food && food.serving_size_g > 0);
    for (const key of ['calories', 'protein', 'carbs', 'fats', 'fiber']) {
        assert.ok(Math.abs(food[key] * food.serving_size_g / 100 - Number(dish[key] || 0)) < food.serving_size_g / 2000 + 0.01, `${dish.name}: ${key} portion round trip`);
    }
}
assert.equal(preferredSearchFoods({ lunch: [DISHES[0].id], dinner: [DISHES[0].id], snack: null }).length, 1);
assert.ok(searchDishes('蛋').length > 0);
assert.notEqual(foodSearchSignature({ name: '雞肉', calories: 100 }), foodSearchSignature({ name: '魚肉', calories: 100 }));
const plan = { adjustedIntake: 2100, recommendedIntake: 2000, newProtein: 150, newCarbs: 240, newFat: 60, goalType: 'recomp', tdee: 2100 };
assert.deepEqual(committedNutritionGoals(plan), { calories: 2100, protein: 150, carbs: 240, fats: 60, tdee: 2100, mode: 'maintenance' });
assert.equal(committedNutritionGoals({ ...plan, newProtein: -1 }), null);
assert.equal(committedNutritionGoals(null), null);
for (const kind of ['strength', 'run', 'dual', 'rest', 'makeup']) {
    assert.equal(nutritionHintFor(kind, {}, null, 1).kcalPct, 0, 'schedule advice must not change the confirmed calorie target');
}
assert.ok(!nutritionHintFor('run', {}, {weeks: Array.from({length:8},()=>({name:'base'}))}, 4).message.includes('減量'));
console.log(`PASS: ${DISHES.length} dish portion conversions; preferred foods, single-character search, distinct foods, committed targets`);
