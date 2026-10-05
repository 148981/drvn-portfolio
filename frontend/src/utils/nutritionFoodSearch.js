import { DISHES } from '../data/dishLibrary';

// Search/calculator values always represent 100 g; portions remain explicit.
/* 餐點沒有自己的圖示時，用名字挑一個。
   以前一律吃呼叫端的 fallback，所以計劃裡挑的那幾樣在快速新增全部長一樣（一排 ⭐），
   分不出哪個是哪個。順序由細到粗，先命中的贏。 */
const DISH_EMOJI_RULES = [
    [/便當|自助餐/, '🍱'], [/雞排|炸雞/, '🍗'], [/雞腿|雞肉|火雞/, '🍗'],
    [/牛肉麵|拉麵|麵線|油麵|意麵/, '🍜'], [/水餃|餃/, '🥟'], [/包子|饅頭/, '🥟'],
    [/燒餅|油條|吐司|麵包|三明治/, '🥪'], [/漢堡/, '🍔'], [/飯糰/, '🍙'],
    [/炒飯|滷肉飯|雞肉飯|白飯|粥/, '🍚'], [/火鍋|湯/, '🍲'],
    [/鯖魚|鮭魚|魚|蝦|蟹|海鮮/, '🐟'], [/豬|排骨|里肌|培根/, '🥩'], [/牛/, '🥩'],
    [/蛋/, '🥚'], [/豆腐|豆漿|黃豆|豆/, '🫘'],
    [/青菜|甘藍|菠菜|花椰|青江|生菜|沙拉|菜/, '🥬'],
    [/奶茶|紅茶|綠茶|咖啡|拿鐵|飲/, '🥤'], [/牛奶|優格|乳/, '🥛'],
    [/水果|香蕉|蘋果|芭樂|橘|莓/, '🍎'], [/蛋糕|甜點|冰|布丁|餅乾/, '🍰'],
    [/堅果|杏仁|腰果/, '🥜'], [/油|醬/, '🫒'],
];
const GROUP_EMOJI = { bento: '🍱', store: '🏪', street: '🍢', home: '🍳' };
export function dishEmoji(dish) {
    const name = String(dish?.name || '');
    for (const [re, emoji] of DISH_EMOJI_RULES) if (re.test(name)) return emoji;
    return GROUP_EMOJI[dish?.group] || '🍽️';
}

export function dishSearchFood(dish) {
    const grams = Number(dish.servingGrams);
    if (!(grams > 0)) return null;
    const result = { id: `dish_${dish.id}`, name: dish.name, serving_size_g: grams,
        servingGrams: grams, is_dish: true, dish, emoji: dishEmoji(dish) };
    for (const key of ['calories', 'protein', 'carbs', 'fats', 'fiber']) {
        result[key] = Math.round(Number(dish[key] || 0) / grams * 1000) / 10;
    }
    return result;
}

export function preferredSearchFoods(preferences) {
    const lists = Array.isArray(preferences) ? [preferences] : Object.values(preferences || {});
    const ids = new Set(lists.filter(Array.isArray).flat());
    return DISHES.filter(d => ids.has(d.id)).map(dishSearchFood).filter(Boolean);
}

export function foodSearchSignature(food) {
    // Two different foods with similar macros must both remain searchable.
    return `${String(food.name || '').trim().toLocaleLowerCase()}|${food.brand || ''}|${food.calories}|${food.protein}|${food.carbs}|${food.fats}`;
}
