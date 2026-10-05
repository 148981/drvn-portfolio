/**
 * foodGuidance.js — 依「你真的吃過的東西」給下一期的飲食建議
 * ══════════════════════════════════════════════════════════════════════
 * 每一期回饋時跑一次，結果存起來給快速新增用（建議卡）。三種建議，依序：
 *
 *   ① 留著：你常吃、而且適合這一期目標的（不要叫人放棄做得到的東西）
 *   ② 換掉：你常吃、但不太適合的 → 同一餐、同一種買法（便當店換便當店、超商換超商）裡
 *            比較好的那一個，並講清楚好在哪（蛋白質多幾克、少幾大卡）
 *   ③ 試試：你還沒吃過、但對這個目標特別有幫助的（每餐最多兩個）
 *
 * 評分依據（每一條都對應到研究，不是口味偏好）：
 *   · 蛋白質密度（每 100 大卡幾克）—— 減脂期吃夠蛋白質才保得住肌肉
 *       ISSN 2017 立場聲明：1.4–2.0 g/kg；熱量赤字時更高
 *     每餐 ≥ 0.4 g/kg 蛋白質（Schoenfeld & Aragon 2018）
 *   · 能量密度（每公克幾大卡）—— 同樣的飽足感吃進比較少熱量（Rolls，低能量密度飲食）
 *   · 纖維（每 100 大卡幾克）—— 每天 25–29 g 起跳（Reynolds 2019, Lancet）
 *   · 含糖飲料、油炸與高度加工 —— 含糖飲料與體重增加相關（Malik 2013）；
 *       高度加工飲食讓人每天自然多吃約 500 大卡（Hall 2019）
 *   · 增重期：熱量要夠、蛋白質照樣要夠，速度每週 0.25–0.5% 體重（Iraki 2019）
 *
 * 誠實：營養數字來自衛福部 TFDA 成分資料庫算出的常見餐點（data/dishLibrary），
 *       少數補充品項是一般份量的估算，畫面上一律寫「一般份量」。
 * 純函式；node 驗證腳本直接 import。
 * ══════════════════════════════════════════════════════════════════════
 */
import { DISHES } from '../data/dishLibrary';

export const GUIDANCE_SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const SLOT_ZH = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snacks: '點心' };
const DISH_SLOT = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'snack' };
export const PROTEIN_PER_MEAL_G_PER_KG = 0.4;

/* 補充品項：DISHES 是「餐點」，減脂／增重常用的單品（舒肥雞胸、茶葉蛋、希臘優格…）不在裡面。
   數值是一般份量的估算（參考 TFDA 成分資料庫的同類食材），標 estimate。 */
export const EXTRA_FOODS = [
    { id: 'x_sousvide_chicken', name: '舒肥雞胸（一包）', group: 'store', slots: ['lunch', 'dinner', 'snack'], servingGrams: 100, calories: 115, protein: 24, carbs: 1, fats: 2, fiber: 0, estimate: true },
    { id: 'x_tea_egg', name: '茶葉蛋（一顆）', group: 'store', slots: ['breakfast', 'snack'], servingGrams: 55, calories: 75, protein: 7, carbs: 1, fats: 5, fiber: 0, estimate: true },
    { id: 'x_greek_yogurt', name: '無糖希臘優格（一杯）', group: 'store', slots: ['breakfast', 'snack'], servingGrams: 100, calories: 80, protein: 9, carbs: 4, fats: 3, fiber: 0, estimate: true },
    { id: 'x_edamame', name: '毛豆（一盒）', group: 'store', slots: ['snack', 'lunch', 'dinner'], servingGrams: 100, calories: 125, protein: 13, carbs: 9, fats: 5, fiber: 6, estimate: true },
    { id: 'x_guava', name: '芭樂（一顆）', group: 'home', slots: ['snack', 'breakfast'], servingGrams: 200, calories: 76, protein: 1.4, carbs: 18, fats: 0.2, fiber: 6, estimate: true },
    { id: 'x_banana', name: '香蕉（一根）', group: 'home', slots: ['snack', 'breakfast'], servingGrams: 100, calories: 85, protein: 1.5, carbs: 22, fats: 0.1, fiber: 1.6, estimate: true },
    { id: 'x_unsweet_soy', name: '無糖豆漿（中杯）', group: 'store', slots: ['breakfast', 'snack'], servingGrams: 360, calories: 126, protein: 13, carbs: 2.5, fats: 6.8, fiber: 4.7, estimate: true },
    { id: 'x_whole_milk', name: '全脂鮮奶（一瓶 290ml）', group: 'store', slots: ['breakfast', 'snack'], servingGrams: 290, calories: 180, protein: 9, carbs: 14, fats: 10, fiber: 0, estimate: true },
    { id: 'x_nuts', name: '綜合堅果（一小包 30g）', group: 'store', slots: ['snack'], servingGrams: 30, calories: 180, protein: 6, carbs: 6, fats: 15, fiber: 2.5, estimate: true },
    { id: 'x_pb_toast', name: '花生醬吐司（兩片）', group: 'home', slots: ['breakfast', 'snack'], servingGrams: 80, calories: 270, protein: 10, carbs: 31, fats: 12, fiber: 3, estimate: true },
];

const ALL_FOODS = [...DISHES, ...EXTRA_FOODS];

const SUGARY_DRINK = /奶茶|珍珠|紅茶(?!.*無糖)|綠茶(?!.*無糖)|汽水|可樂|果汁|手搖|含糖|拿鐵(?!.*無糖)|冰沙|養樂多|運動飲料/;
const FRIED_OR_UPF = /炸|雞排|薯條|洋芋片|泡麵|香腸|熱狗|培根|鹹酥|甜甜圈|速食|鍋貼|油條|燒餅/;
const DESSERT = /蛋糕|甜點|冰淇淋|餅乾|布丁|巧克力|麵包(?!.*全麥)|菠蘿|鬆餅/;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v * 10) / 10;
export const cleanFoodName = (n) => String(n || '').replace(/\s*[0.]+\s*$/, '').replace(/\s+/g, ' ').trim();

/** 計劃的目標類型 → 評分模式 */
export const guidanceGoal = (goalType) => (goalType === 'bulk' ? 'bulk' : goalType === 'cut' ? 'cut' : 'maintain');

/**
 * 一份食物（一次吃的量）對這個目標好不好：0–100 分，附上為什麼。
 * @param {{name,calories,protein,carbs,fats,fiber,grams?}} f  一份的總量
 */
export function scoreFood(f, goal = 'cut', { refKcal = 500 } = {}) {
    const kcal = num(f.calories);
    if (kcal <= 0) return { score: 50, notes: [], flags: {} };
    const name = String(f.name || '');
    const pPer100 = (num(f.protein) * 100) / kcal;
    const fibPer100 = (num(f.fiber) * 100) / kcal;
    const fatShare = (num(f.fats) * 9) / kcal;
    const grams = num(f.grams);
    const ed = grams > 0 ? kcal / grams : null;
    const flags = {
        sugaryDrink: SUGARY_DRINK.test(name) && num(f.protein) < 5,
        fried: FRIED_OR_UPF.test(name),
        dessert: DESSERT.test(name),
    };
    const notes = [];
    let s;
    if (goal === 'bulk') {
        s = clamp((pPer100 / 8) * 35, 0, 35)
            + clamp((kcal / Math.max(150, refKcal)) * 25, 0, 25)  // 一份就給得出這一餐該有的熱量
            + clamp((fibPer100 / 2) * 10, 0, 10)
            + (fatShare <= 0.45 ? 10 : fatShare >= 0.6 ? 0 : 10 * (0.6 - fatShare) / 0.15)
            + clamp(((num(f.carbs) * 4) / kcal) * 20, 0, 10);    // 碳水是訓練的燃料
        if (flags.sugaryDrink) s -= 15;
        if (flags.fried) s -= 8;
        s = s / 90 * 100;
    } else {
        const edScore = ed == null ? 10 : ed <= 1 ? 20 : ed >= 2.5 ? 0 : 20 * (2.5 - ed) / 1.5;
        s = clamp((pPer100 / 10) * 40, 0, 40)
            + edScore
            + clamp((fibPer100 / 2) * 15, 0, 15)
            + (fatShare <= 0.3 ? 10 : fatShare >= 0.55 ? 0 : 10 * (0.55 - fatShare) / 0.25);
        const pen = goal === 'cut' ? 1 : 0.7;
        if (flags.sugaryDrink) s -= 30 * pen;
        if (flags.fried) s -= 15 * pen;
        if (flags.dessert) s -= 15 * pen;
        s = s / 85 * 100;
    }
    if (pPer100 >= 8) notes.push('蛋白質密度高');
    if (fibPer100 >= 1.5) notes.push('纖維多');
    if (flags.sugaryDrink) notes.push('含糖飲料');
    if (flags.fried) notes.push('油炸／加工');
    return { score: clamp(r0(s), 0, 100), notes, flags, pPer100: r1(pPer100), ed: ed == null ? null : r1(ed) };
}

/** 一筆飲食紀錄是哪一餐（跟快速新增的分頁同一套時間規則） */
export function slotOfEntry(e) {
    const t = e?.timestamp ? new Date(String(e.timestamp).replace(' ', 'T')) : null;
    const h = t && Number.isFinite(t.getTime()) ? t.getHours() : null;
    if (h == null) return null;
    if (h >= 5 && h < 11) return 'breakfast';
    if (h >= 11 && h < 16) return 'lunch';
    if (h >= 16 && h < 21) return 'dinner';
    return 'snacks';
}

const isWater = (e) => /^hydration$|^水$|^water$/i.test(String(e?.name || '').trim()) || (num(e?.calories) === 0 && num(e?.water_ml) > 0);

/** 每一餐常吃什麼：名字相同的合在一起，算平均一份的營養 */
export function habitsBySlot(days = []) {
    const out = { breakfast: new Map(), lunch: new Map(), dinner: new Map(), snacks: new Map() };
    (days || []).forEach((d) => (d?.meals || []).forEach((e) => {
        if (!e || isWater(e) || num(e.calories) <= 0) return;
        const slot = slotOfEntry(e) || 'snacks';
        const name = cleanFoodName(e.name);
        if (!name) return;
        const m = out[slot];
        const h = m.get(name) || { name, count: 0, calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, grams: 0, days: new Set() };
        h.count += 1;
        h.days.add(d.date);
        ['calories', 'protein', 'carbs', 'fats', 'fiber', 'grams'].forEach((k) => { h[k] += num(e[k]); });
        m.set(name, h);
    }));
    const res = {};
    GUIDANCE_SLOTS.forEach((s) => {
        res[s] = [...out[s].values()].map((h) => ({
            name: h.name, count: h.count, dayCount: h.days.size,
            calories: r0(h.calories / h.count), protein: r1(h.protein / h.count), carbs: r1(h.carbs / h.count),
            fats: r1(h.fats / h.count), fiber: r1(h.fiber / h.count), grams: r0(h.grams / h.count),
        })).sort((a, b) => b.count - a.count);
    });
    return res;
}

/** 常吃的東西對得上哪一道餐點（拿來判斷「買法」：便當店、超商、小吃…） */
function matchDish(name) {
    const n = cleanFoodName(name);
    return ALL_FOODS.find((d) => d.name === n || n.includes(d.name.replace(/（.*?）/g, ''))
        || (d.aliases || []).some((a) => a && n.includes(a))) || null;
}

/* 一樣東西在一餐裡扮演什麼：飲料、小點（< 300 大卡）、正餐。
   換的時候角色要一樣 —— 珍珠奶茶要換成另一杯飲料，不是換成一個便當。 */
const DRINK_NAME = /豆漿|奶茶|鮮奶|牛奶|紅茶|綠茶|咖啡|拿鐵|飲|汽水|可樂|果汁|乳清|優酪|冰沙/;
export const roleOf = (f) => (DRINK_NAME.test(String(f?.name || '')) ? 'drink' : num(f?.calories) < 300 ? 'side' : 'meal');

const asFood = (d) => ({ name: d.name, calories: d.calories, protein: d.protein, carbs: d.carbs, fats: d.fats, fiber: d.fiber, grams: d.servingGrams });

/** 「好在哪」：只講差得夠多的那兩三件事 */
function diffReason(from, to) {
    const parts = [];
    const dp = r0(num(to.protein) - num(from.protein));
    const dk = r0(num(to.calories) - num(from.calories));
    const df = r1(num(to.fiber) - num(from.fiber));
    if (dp >= 5) parts.push(`蛋白質多 ${dp}g`);
    if (dk <= -80) parts.push(`少 ${-dk} 大卡`);
    else if (dk >= 80) parts.push(`多 ${dk} 大卡`);
    if (df >= 2) parts.push(`纖維多 ${df}g`);
    return parts.slice(0, 3).join('、');
}

/**
 * 主函式：依這一期吃過的東西，給每一餐的建議。
 * @param {{ days:Array, goalType:string, weightKg?:number, dailyKcal?:number, slotShares?:Record<string,number> }} input
 * @returns {{ goal, basedOnDays:number, slots: Record<slot,{ targetKcal, proteinPerMeal, keep:[], swaps:[], discover:[] }>, insights:[] }}
 */
export function recommendFoods({ days = [], goalType = 'cut', weightKg = 0, dailyKcal = 0, slotShares = null } = {}) {
    const goal = guidanceGoal(goalType);
    const habits = habitsBySlot(days);
    const shares = slotShares || { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snacks: 0.10 };
    const proteinPerMeal = weightKg > 0 ? r0(weightKg * PROTEIN_PER_MEAL_G_PER_KG) : null;
    const loggedDays = new Set((days || []).filter((d) => (d?.meals || []).some((e) => num(e?.calories) > 0)).map((d) => d.date)).size;

    // 使用者習慣的「買法」：常吃的東西對到的餐點群組（便當店、超商…）
    const groupUse = {};
    GUIDANCE_SLOTS.forEach((s) => habits[s].forEach((h) => { const d = matchDish(h.name); if (d) groupUse[d.group] = (groupUse[d.group] || 0) + h.count; }));

    const slots = {};
    const usedIds = new Set();
    GUIDANCE_SLOTS.forEach((slot) => {
        const targetKcal = dailyKcal > 0 ? r0(dailyKcal * (shares[slot] || 0.25)) : null;
        const fits = (d) => (d.slots || []).includes(DISH_SLOT[slot]);
        const kcalOk = (d) => {
            if (!targetKcal) return true;
            if (goal === 'bulk') return d.calories >= targetKcal * 0.5 && d.calories <= targetKcal * 1.5;
            return d.calories <= targetKcal * 1.25 && d.calories >= (slot === 'snacks' ? 40 : targetKcal * 0.35);
        };
        const sOpt = { refKcal: targetKcal || (slot === 'snacks' ? 250 : 600) };
        const scored = habits[slot].map((h) => ({ ...h, ...scoreFood(h, goal, sOpt) }));
        const habitNames = new Set(scored.map((h) => h.name));

        // ① 留著：常吃（至少兩次）而且適合
        const keep = scored.filter((h) => h.count >= 2 && h.score >= 65).slice(0, 2)
            .map((h) => ({ name: h.name, count: h.count, score: h.score, why: h.notes.filter((n) => !/含糖|油炸/.test(n)).join('、') || '適合這一期' }));

        // ② 換掉：常吃但分數低 → 同一餐、同一種買法裡比較好的
        const swaps = [];
        scored.filter((h) => h.count >= 2 && h.score < 50).slice(0, 3).forEach((h) => {
            const src = matchDish(h.name);
            // 早餐本來就吃得少：早餐裡不是飲料的都算「一餐」，換成另一份早餐
            //   點心時段裡不是飲料的都算「小點」（宵夜的洋芋片就是小點，不管幾大卡）
            const base = roleOf(h);
            const role = base === 'drink' ? 'drink' : slot === 'breakfast' ? 'meal' : slot === 'snacks' ? 'side' : base;
            const okFor = (d) => {
                if (role === 'meal') return fits(d) && kcalOk(d) && roleOf(d) !== 'drink' && (slot === 'breakfast' || roleOf(d) === 'meal');
                if (role === 'drink') return roleOf(d) === 'drink' && d.calories <= Math.max(300, h.calories * 1.3);
                return roleOf(d) === 'side' && d.calories <= Math.max(300, h.calories * 1.3);   // 飲料換飲料、小點換小點
            };
            const cands = ALL_FOODS.filter((d) => okFor(d) && !habitNames.has(d.name) && !usedIds.has(d.id))
                .map((d) => ({ d, s: scoreFood(asFood(d), goal, sOpt).score }))
                .filter((x) => x.s >= h.score + 15)
                .sort((a, b) => ((src && b.d.group === src.group) - (src && a.d.group === src.group)) || (b.s - a.s));
            const best = cands[0];
            if (!best) return;
            usedIds.add(best.d.id);
            swaps.push({
                from: { name: h.name, count: h.count, calories: h.calories, protein: h.protein, score: h.score, flags: h.flags },
                to: { ...best.d, score: best.s },
                why: diffReason(h, best.d) || '更適合這一期',
                sameGroup: !!(src && src.group === best.d.group),
            });
        });

        // ③ 試試：沒吃過、對這個目標特別好的；先挑你平常會去買的那種地方
        const discover = ALL_FOODS.filter((d) => fits(d) && kcalOk(d) && !habitNames.has(d.name) && !usedIds.has(d.id))
            .map((d) => ({ d, ...scoreFood(asFood(d), goal, sOpt) }))
            .filter((x) => x.score >= 70)
            .sort((a, b) => ((groupUse[b.d.group] || 0) > 0) - ((groupUse[a.d.group] || 0) > 0) || (b.score - a.score))
            .slice(0, 2)
            .map((x) => {
                usedIds.add(x.d.id);
                const why = [];
                if (proteinPerMeal && slot !== 'snacks' && x.d.protein >= proteinPerMeal) why.push(`一份就有 ${r0(x.d.protein)}g 蛋白質`);
                else if (x.pPer100 >= 8) why.push('蛋白質密度高');
                if (goal !== 'bulk' && x.ed != null && x.ed <= 1.2) why.push('份量大、熱量低');
                if (goal === 'bulk' && x.d.calories >= 400) why.push(`一份 ${x.d.calories} 大卡，吃得到量`);
                if (num(x.d.fiber) >= 4) why.push('纖維多');
                return { ...x.d, score: x.score, why: why.slice(0, 2).join('、') || '適合這一期' };
            });

        slots[slot] = { targetKcal, proteinPerMeal: slot === 'snacks' ? null : proteinPerMeal, keep, swaps, discover };
    });

    // 整體觀察：含糖飲料、點心佔比（講得出數字才講）
    const insights = [];
    const allHabits = GUIDANCE_SLOTS.flatMap((s) => habits[s]);
    const drinkCount = allHabits.filter((h) => SUGARY_DRINK.test(h.name) && h.protein < 5).reduce((s, h) => s + h.count, 0);
    if (loggedDays >= 5 && drinkCount / loggedDays >= 0.4 && goal !== 'bulk') {
        insights.push({ code: 'sugary_drinks', text: `含糖飲料平均每 ${Math.max(1, Math.round(loggedDays / drinkCount))} 天一杯。換成無糖茶或無糖豆漿，是最不痛的少吃方式。` });
    }
    const kcalBy = (s) => habits[s].reduce((t, h) => t + h.calories * h.count, 0);
    const total = GUIDANCE_SLOTS.reduce((t, s) => t + kcalBy(s), 0);
    if (total > 0 && kcalBy('snacks') / total >= 0.25 && goal !== 'bulk') {
        insights.push({ code: 'snack_share', text: `點心和宵夜佔了 ${r0(kcalBy('snacks') / total * 100)}% 的熱量（建議約一成）。把蛋白質移到正餐，點心比較不會餓出來。` });
    }
    if (goal === 'bulk' && loggedDays >= 5) {
        const mealCount = ['breakfast', 'lunch', 'dinner'].filter((s) => habits[s].length > 0).length;
        if (mealCount < 3) insights.push({ code: 'skip_meals', text: `有一餐常常沒記到（${['breakfast', 'lunch', 'dinner'].filter((s) => !habits[s].length).map((s) => SLOT_ZH[s]).join('、')}）。增重最難的是吃得到量，少一餐就很難補回來。` });
    }

    return { goal, basedOnDays: loggedDays, slots, insights };
}

/** 給快速新增的建議卡：這一餐要放哪幾張（換掉的在前，試試的在後） */
export function quickAddSuggestions(guidance, slot, limit = 3) {
    const s = guidance?.slots?.[slot];
    if (!s) return [];
    return [
        ...s.swaps.map((x) => ({ kind: 'swap', food: x.to, why: `取代${x.from.name}：${x.why}` })),
        ...s.discover.map((x) => ({ kind: 'discover', food: x, why: x.why })),
    ].slice(0, limit);
}

export default recommendFoods;
