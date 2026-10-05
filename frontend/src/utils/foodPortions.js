/**
 * foodPortions.js — 「這個食物在台灣日常裡怎麼被量」的對照表
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   食物資料庫一律以「每 100 公克」計，所以記錄介面只能給
 *   ×0.5 / ×1 / ×1.5 / ×2（＝ 50 / 100 / 150 / 200 公克）。
 *   但沒有人是用公克吃飯的 —— 使用者心裡想的是「一碗飯」「兩顆蛋」
 *   「一塊雞胸」，要他自己換算成公克，等於每記一餐就要做一次數學。
 *
 * 誠實鐵律（本檔的核心約束）：
 *   只有「確定知道日常單位」的食物才給家常份量。猜不到就老實給公克，
 *   不編一個好看但錯的單位 —— 生米（稉米 348 kcal/100g）如果被當成
 *   「一碗飯 200g」，熱量會直接多算一倍以上，那比沒有份量更糟。
 *   所以：關鍵字比對命中才給單位，未命中一律回公克級距。
 *
 * 資料來源：份量重量取自衛福部「食物代換表」與市售常見規格
 * （一碗白飯 200g、一顆雞蛋可食部 55g、一片吐司 30g⋯），
 * 都是可查證的常見值，不是估計。
 */

import { SIZE_FACTORS, SIZE_LABELS } from '../data/dishLibrary';

/** 未命中時的公克級距（維持原本行為，只是加上看得懂的提示） */
const FALLBACK = {
    unit: null,
    options: [
        { label: '50 g', grams: 50, hint: '約半個手掌' },
        { label: '100 g', grams: 100, hint: '約一個手掌' },
        { label: '150 g', grams: 150, hint: '約一個手掌半' },
        { label: '200 g', grams: 200, hint: '約兩個手掌' },
    ],
    defaultIndex: 1,
};

/**
 * 對照表。`any` 命中其一即算；`not` 命中任一就排除（擋掉生／熟混淆）。
 * 排在前面的規則優先。
 */
const TABLE = [
    // ── 蛋 ─────────────────────────────────────────────────────────
    {
        any: ['雞蛋', '水煮蛋', '荷包蛋', '煎蛋', '滷蛋', '茶葉蛋', '蒸蛋', '炒蛋', '鴨蛋', '鵝蛋'],
        options: [
            { label: '1 顆', grams: 55 },
            { label: '2 顆', grams: 110 },
            { label: '3 顆', grams: 165 },
        ],
        defaultIndex: 0,
    },
    // ── 熟飯（生米絕對不能進來）────────────────────────────────────
    {
        any: ['白飯', '糙米飯', '五穀飯', '紫米飯', '米飯', '炒飯', '油飯', '燉飯', '飯糰'],
        not: ['米粉', '米漿', '米酒', '米醋'],
        options: [
            { label: '半碗', grams: 100 },
            { label: '1 碗', grams: 200 },
            { label: '便當飯', grams: 250 },
            { label: '大碗', grams: 300 },
        ],
        defaultIndex: 1,
    },
    // ── 熟麵 ───────────────────────────────────────────────────────
    {
        any: ['麵條', '拉麵', '烏龍麵', '意麵', '陽春麵', '義大利麵', '米粉', '冬粉', '河粉', '板條'],
        options: [
            { label: '小碗', grams: 150 },
            { label: '1 碗', grams: 220 },
            { label: '大碗', grams: 300 },
        ],
        defaultIndex: 1,
    },
    // ── 麵包類 ─────────────────────────────────────────────────────
    { any: ['吐司', '土司'], options: [{ label: '1 片', grams: 30 }, { label: '2 片', grams: 60 }], defaultIndex: 0 },
    { any: ['饅頭'], options: [{ label: '1 個', grams: 90 }, { label: '半個', grams: 45 }], defaultIndex: 0 },
    { any: ['貝果'], options: [{ label: '1 個', grams: 90 }], defaultIndex: 0 },
    { any: ['水餃', '餃子'], options: [{ label: '5 顆', grams: 100 }, { label: '10 顆', grams: 200 }], defaultIndex: 1 },
    { any: ['包子'], options: [{ label: '1 顆', grams: 100 }], defaultIndex: 0 },
    // ── 肉／魚（一份 ≈ 一個手掌）───────────────────────────────────
    {
        any: ['雞胸', '雞腿', '雞排', '牛排', '豬排', '里肌', '梅花', '鮭魚', '鯖魚', '鱈魚', '鮪魚', '蝦仁', '牛肉', '豬肉', '雞肉', '魚片'],
        // 肉鬆／肉脯／肉乾是「配飯的一小撮」，不是一個手掌的份量（熱量密度差三倍以上）
        not: ['肉脯', '肉鬆', '肉乾', '肉酥', '肉紙', '香腸', '培根'],
        options: [
            { label: '半份', grams: 75, hint: '半個手掌' },
            { label: '1 份', grams: 150, hint: '一個手掌、約一塊雞胸' },
            { label: '大份', grams: 225, hint: '一個半手掌' },
        ],
        defaultIndex: 1,
    },
    // ── 豆製品 ─────────────────────────────────────────────────────
    { any: ['豆腐'], options: [{ label: '半盒', grams: 150 }, { label: '1 盒', grams: 300 }], defaultIndex: 0 },
    { any: ['豆漿'], options: [{ label: '1 杯', grams: 240 }, { label: '大杯', grams: 450 }], defaultIndex: 0 },
    { any: ['豆干', '豆乾'], options: [{ label: '1 塊', grams: 35 }, { label: '3 塊', grams: 105 }], defaultIndex: 1 },
    // ── 乳品／飲料 ─────────────────────────────────────────────────
    {
        any: ['牛奶', '鮮乳', '優酪乳', '拿鐵', '豆奶', '果汁', '運動飲料', '可樂', '紅茶', '綠茶', '奶茶'],
        options: [
            { label: '1 杯', grams: 240 },
            { label: '中杯', grams: 350 },
            { label: '大杯', grams: 500 },
        ],
        defaultIndex: 0,
    },
    { any: ['優格'], options: [{ label: '1 杯', grams: 150 }], defaultIndex: 0 },
    { any: ['起司', '乳酪'], options: [{ label: '1 片', grams: 20 }, { label: '2 片', grams: 40 }], defaultIndex: 0 },
    // ── 水果 ───────────────────────────────────────────────────────
    { any: ['香蕉'], options: [{ label: '1 根', grams: 100 }, { label: '半根', grams: 50 }], defaultIndex: 0 },
    { any: ['蘋果', '芭樂', '水梨', '柳丁', '橘子'], options: [{ label: '1 顆', grams: 150 }, { label: '半顆', grams: 75 }], defaultIndex: 0 },
    { any: ['甘藷', '地瓜', '番薯'], not: ['甘藷葉', '甘藷粉'], options: [{ label: '1 條', grams: 150 }, { label: '半條', grams: 75 }], defaultIndex: 0 },
    { any: ['芋頭', '馬鈴薯', '玉米'], options: [{ label: '1 個', grams: 150 }, { label: '半個', grams: 75 }], defaultIndex: 0 },
    // ── 補給品／零食 ───────────────────────────────────────────────
    { any: ['高蛋白', '乳清', '蛋白粉'], options: [{ label: '1 匙', grams: 30 }, { label: '2 匙', grams: 60 }], defaultIndex: 0 },
    { any: ['堅果', '杏仁', '腰果', '花生', '核桃'], options: [{ label: '1 把', grams: 30 }, { label: '半把', grams: 15 }], defaultIndex: 0 },
    // ── 蔬菜（一份 ≈ 煮熟半碗）─────────────────────────────────────
    {
        any: ['青菜', '菠菜', '高麗菜', '甘藍', '花椰菜', '青江菜', '地瓜葉', '甘藷葉', '空心菜', '大陸妹', '生菜', '小白菜'],
        options: [
            { label: '半碗', grams: 50, hint: '煮熟一份' },
            { label: '1 碗', grams: 100 },
        ],
        defaultIndex: 0,
    },
];

const norm = (s) => String(s || '').toLowerCase().trim();

/**
 * 取得一個食物的份量選項。
 * @param {{name?:string, serving_size_g?:number}} food
 * @returns {{ options:{label:string,grams:number,hint?:string}[], defaultIndex:number, matched:boolean }}
 */
export function getPortions(food) {
    // 🍱 整份餐點（dishLibrary）：問「小份 / 正常 / 大份」，不問公克。
    //    沒有人在自助餐檯前秤過菜，也沒有人知道一碗牛肉麵幾公克。
    //    倍率與標籤都取自 dishLibrary，維持單一真相源。
    if (food?.is_dish && Number(food.servingGrams) > 0) {
        const base = Number(food.servingGrams);
        return {
            options: ['small', 'normal', 'large'].map((k) => ({
                label: SIZE_LABELS[k],
                grams: Math.round(base * SIZE_FACTORS[k]),
            })),
            defaultIndex: 1,
            matched: true,
        };
    }

    const name = norm(food?.name);
    if (name) {
        for (const rule of TABLE) {
            if (rule.not && rule.not.some((k) => name.includes(norm(k)))) continue;
            if (rule.any.some((k) => name.includes(norm(k)))) {
                return { options: rule.options, defaultIndex: rule.defaultIndex, matched: true };
            }
        }
    }

    // 收藏項目自己帶了有意義的單份重量（例如水煮蛋 50g）→ 以它為主軸展開
    const base = Number(food?.serving_size_g);
    if (Number.isFinite(base) && base > 0 && base !== 100) {
        return {
            options: [
                { label: '半份', grams: Math.round(base / 2) },
                { label: '1 份', grams: Math.round(base) },
                { label: '2 份', grams: Math.round(base * 2) },
            ],
            defaultIndex: 1,
            matched: true,
        };
    }

    return { ...FALLBACK, matched: false };
}

/** 預設要帶入的公克數（打開食物時就填好，使用者多半不用再動） */
export function defaultGrams(food) {
    const p = getPortions(food);
    return p.options[p.defaultIndex]?.grams || 100;
}

export default getPortions;
