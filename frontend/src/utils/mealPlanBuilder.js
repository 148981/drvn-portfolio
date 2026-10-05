/**
 * mealPlanBuilder.js — 把「每日目標」翻成一個吃得懂的框架
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   設定完目標後，app 只丟四個數字（2310 kcal、P150、C260、F64）。
 *   那是營養師的語言，不是「我等一下要吃什麼」的答案。
 *
 * 為什麼不開菜單：
 *   指名「早餐吃三顆蛋加吐司」會變成替使用者決定人生 —— 他可能不吃蛋、
 *   在外面、或今天就是想吃麵。真正有用的是「這一餐大概多少、怎麼組」，
 *   餐點只當比例尺（「差不多是一個便當的量」），不是命令。
 *
 * 所以輸出三層：
 *   1. 每餐配額 —— 這一餐大約多少熱量、多少蛋白質
 *   2. 每餐怎麼組 —— 一個手掌蛋白質＋一份主食＋一份蔬菜（秤不到也做得到）
 *   3. 比例尺 —— 「這個量大約等於：雞腿便當(小份)／牛肉麵」，只是幫忙抓感覺
 *
 * 誠實鐵律：份量是一般值估算，不是哪一家店的實測值，也不是醫療或營養處方。
 */

import { DISHES, SIZE_LABELS, scaleDish } from '../data/dishLibrary';

/** 時段分配：一般作息與台灣外食習慣（早餐偏小、午晚為主）。 */
export const SLOTS = [
    { key: 'breakfast', label: '早餐', share: 0.25 },
    { key: 'lunch', label: '午餐', share: 0.35 },
    { key: 'dinner', label: '晚餐', share: 0.30 },
    { key: 'snack', label: '點心', share: 0.10 },
];

const SIZES = ['small', 'normal', 'large'];

/** 一道菜在哪個份量最接近這個熱量。 */
function bestFit(dish, budgetKcal) {
    let best = null;
    for (const size of SIZES) {
        const s = scaleDish(dish, size);
        const diff = Math.abs(s.calories - budgetKcal);
        if (!best || diff < best.diff) best = { size, sizeLabel: SIZE_LABELS[size], diff, ...s };
    }
    return best;
}

/** 找出幾個「大約就是這個熱量」的常見餐點，純粹當比例尺用。 */
function scaleExamples(budgetKcal, limit = 2, preferred = new Set(), mainMeal = true) {
    const hits = [];
    for (const dish of DISHES) {
        if (!dish.components.length) continue;          // 手動筆（乳清）不當比例尺
        // 正餐的比例尺不可以是手搖或甜點：蛋白質密度太低的東西撐不起一餐，
        // 拿它當「午餐大約長這樣」會直接教錯。
        if (mainMeal && dish.calories > 0 && (dish.protein / dish.calories) * 500 < 8) continue;
        // 使用者自己選的東西放寬到 ±20%：那是他真的會吃的，比「剛好的陌生菜」有用
        const tolerance = preferred.has(dish.id) ? 0.20 : 0.12;
        for (const size of SIZES) {
            const s = scaleDish(dish, size);
            const diff = Math.abs(s.calories - budgetKcal);
            if (diff <= budgetKcal * tolerance) {
                hits.push({
                    id: dish.id, name: dish.name, sizeLabel: SIZE_LABELS[size],
                    calories: s.calories, diff, group: dish.group,
                    preferred: preferred.has(dish.id),
                });
                break;                                   // 一道菜只取最接近的那個份量
            }
        }
    }
    // 自己選的排前面（同樣接近時，他會吃的那個才有用）
    hits.sort((a, b) => (b.preferred - a.preferred) || (a.diff - b.diff));
    // 盡量不同類別（一個外食、一個自己煮），讓比例尺涵蓋不同情境
    const picked = [];
    for (const h of hits) {
        if (picked.length >= limit) break;
        if (picked.some((p) => p.group === h.group) && hits.length > limit) continue;
        picked.push(h);
    }
    for (const h of hits) {
        if (picked.length >= limit) break;
        if (!picked.includes(h)) picked.push(h);
    }
    return picked;
}

/**
 * @param {{calories:number, protein:number, carbs?:number, fats?:number}} targets
 * @param {{bodyWeight?:number, preferredIds?:string[], preferredBySlot?:Record<string,string[]>}} opts
 */
export function buildMealPlan(targets, opts = {}) {
    const dayKcal = Math.max(800, Math.round(Number(targets?.calories) || 0));
    const dayProtein = Math.max(40, Math.round(Number(targets?.protein) || 0));
    // 沒有真實體重就是 null；下游要用「每公斤幾克」的地方自己判斷，不拿 65 湊
    const bodyWeight = Number(opts.bodyWeight) > 0 ? Number(opts.bodyWeight) : null;

    /* 偏好以「每一餐」為單位：使用者想的是「早餐吃什麼、午餐吃什麼」，
       不是「這道菜屬於便當店還是麵店」。舊的 preferredIds（不分餐）仍相容。 */
    const bySlot = (opts.preferredBySlot && typeof opts.preferredBySlot === 'object') ? opts.preferredBySlot : {};
    const flatIds = Array.isArray(opts.preferredIds) ? opts.preferredIds : [];
    const preferred = new Set([...flatIds, ...Object.values(bySlot).flat().filter(Boolean)]);

    /* 每一餐的「配置」：三大營養素各多少、在這一餐的熱量裡各佔多少。
       比例用熱量算（蛋白質 4、碳水 4、脂肪 9 kcal/g），所以那條比例條
       就是這一餐真正的樣子，不是隨手畫的裝飾。 */
    const dayCarbs = Math.max(0, Math.round(Number(targets?.carbs) || 0));
    const dayFats = Math.max(0, Math.round(Number(targets?.fats) || 0));

    const meals = SLOTS.map((slot) => {
        const kcal = Math.round(dayKcal * slot.share);
        const protein = Math.round(dayProtein * slot.share);
        const carbs = Math.round(dayCarbs * slot.share);
        const fats = Math.round(dayFats * slot.share);

        const pK = protein * 4, cK = carbs * 4, fK = fats * 9;
        const totalK = pK + cK + fK;
        const pct = (v) => (totalK > 0 ? Math.round((v / totalK) * 100) : 0);
        // 少了碳水或脂肪就不要畫配置：畫出來會變成「蛋白質 100%」，那是說謊。
        const hasMacros = dayCarbs > 0 && dayFats > 0 && totalK > 0;
        const composition = hasMacros
            ? [
                { key: 'protein', label: '蛋白質', grams: protein, pct: pct(pK) },
                { key: 'carbs', label: '主食', grams: carbs, pct: pct(cK) },
                { key: 'fats', label: '油脂', grams: fats, pct: pct(fK) },
            ]
            : [];

        return {
            ...slot, kcal, protein, carbs, fats, composition,
            veg: slot.key === 'snack' ? null : '一份蔬菜 · 煮熟約半碗',
            examples: scaleExamples(kcal, slot.key === 'snack' ? 1 : 2, preferred, slot.key !== 'snack'),
        };
    });

    /* 🍱 你選的東西怎麼排進一天 —— 這才是「怎麼搭配」的答案。
       每一樣都找出「放哪一餐最接近該餐配額」，並附上該吃的份量。
       份量調到最大還是差太多的（例如珍奶配午餐），老實說「當點心比較合適」。 */
    const assigned = [];
    for (const slot of SLOTS) {
        for (const id of (bySlot[slot.key] || [])) assigned.push({ id, slotKey: slot.key });
    }
    for (const id of flatIds) {
        if (!assigned.some((a) => a.id === id)) assigned.push({ id, slotKey: null });
    }

    const yourPicks = assigned
        .map(({ id, slotKey }) => ({ dish: DISHES.find((d) => d.id === id), slotKey }))
        .filter((x) => x.dish)
        .map(({ dish, slotKey }) => {
            let best = null;
            if (slotKey) {
                // 他自己說這一餐吃這個 —— 照他說的排，只把份量調到最接近該餐配額
                const slot = SLOTS.find((s2) => s2.key === slotKey) || SLOTS[0];
                const budget = Math.round(dayKcal * slot.share);
                const fit = bestFit(dish, budget);
                best = { slot, fit, ratio: fit.diff / budget };
            } else {
                for (const slot of SLOTS) {
                    const budget = Math.round(dayKcal * slot.share);
                    const fit = bestFit(dish, budget);
                    const ratio = fit.diff / budget;
                    if (!best || ratio < best.ratio) best = { slot, fit, ratio };
                }
            }
            /* 蛋白質密度太低的東西（手搖、甜點）不可以被排成正餐。
               系統說「午餐喝珍奶」是專業上的錯，不是排版問題。 */
            const proteinPer500 = best.fit.calories > 0
                ? (best.fit.protein / best.fit.calories) * 500 : 0;
            const snackOnly = proteinPer500 < 8;
            // 他親口說這一餐吃這個，就不要偷偷搬走 —— 只提醒「這一餐要另外補蛋白質」。
            if (snackOnly && !slotKey) {
                const snack = SLOTS[SLOTS.length - 1];
                const fit = bestFit(dish, Math.round(dayKcal * snack.share));
                best = { slot: snack, fit, ratio: fit.diff / Math.round(dayKcal * snack.share) };
            }

            return {
                id: dish.id,
                name: dish.name,
                snackOnly,
                chosenSlot: !!slotKey,
                slotLabel: best.slot.label,
                sizeLabel: best.fit.sizeLabel,
                calories: best.fit.calories,
                protein: best.fit.protein,
                // 差距超過該餐配額的 30% 就不假裝它剛好 —— 只說「當配菜或分兩餐」
                fits: best.ratio <= 0.3,
            };
        })
        .sort((a, b) => SLOTS.findIndex(s2 => s2.label === a.slotLabel) - SLOTS.findIndex(s2 => s2.label === b.slotLabel));

    // 每餐怎麼組 —— 用秤不到也做得到的單位講
    const guidance = [
        '訓練後那一餐蛋白質不要低於 30 g。',
        // 沒有真實體重就不給喝水量 —— 算出來會是「水一天約 0 ml」
        ...(bodyWeight ? [`水一天約 ${Math.round(bodyWeight * 35)} ml，訓練日再多 500。`] : []),
        '吃得比較隨性的那幾天，先顧蛋白質跟蔬菜就好。',
    ];

    /* ── 幫他配一餐，不是把他選的全部倒進去 ──────────────────────────────
       原本這裡是 `m.picks = yourPicks.filter(...)` —— 只要屬於這一餐的
       全部列出來。使用者在上一頁挑了三個午餐，總覽就三個都排在午餐底下，
       看起來像「這餐要吃 802 + 806 + 702 = 2310 大卡」。
       他要的是「幫我配」，不是「把我選的還給我」。

       改成：從他選的裡面挑「這一餐該吃的那一份」——
         · 優先挑最接近該餐熱量配額的（bestFit 已經算好 diff）
         · 蛋白質太低的（手搖、甜點）不當正餐主角，只當附加
         · 主角挑完還差 15% 以上的配額，才補第二樣
       其餘沒被排進來的，收在 alternatives，讓他知道「還可以換這些」。 */
    for (const m of meals) {
        const mine = yourPicks.filter((x) => x.slotLabel === m.label);
        const budget = m.kcal || 0;

        // 主角：蛋白質足夠、且熱量最接近配額的那一個
        const mains = mine.filter(x => !x.snackOnly)
            .sort((a, b) => Math.abs(a.calories - budget) - Math.abs(b.calories - budget));
        const chosen = [];
        if (mains.length) chosen.push(mains[0]);

        // 還差很多才補第二樣（例如主角只有 300 大卡、配額 876）
        const used = () => chosen.reduce((s, x) => s + (x.calories || 0), 0);
        if (budget > 0 && used() < budget * 0.85) {
            const filler = mine
                .filter(x => !chosen.includes(x))
                .sort((a, b) => Math.abs((used() + a.calories) - budget) - Math.abs((used() + b.calories) - budget))[0];
            if (filler && used() + filler.calories <= budget * 1.25) chosen.push(filler);
        }
        // 完全沒有夠格當正餐的，就用他選的第一個（總比空白好）
        if (!chosen.length && mine.length) chosen.push(mine[0]);

        m.picks = chosen;
        m.alternatives = mine.filter(x => !chosen.includes(x));
        m.picksKcal = used();
    }

    return {
        target: { calories: dayKcal, protein: dayProtein },
        meals,
        yourPicks,
        guidance,
        disclaimer: '份量是一般值估算，不是醫療或營養處方。',
    };
}

export default buildMealPlan;
