/**
 * dishLibrary.js — 台灣常見餐點（自動產生，請勿手改）
 * ══════════════════════════════════════════════════════════════════════
 * 產生器：backend/data/build_dish_library.py
 * 資料來源：衛福部 TFDA 食品成分資料庫（每 100 公克值）
 *
 * 為什麼要有這一層：
 *   TFDA 收的是「原料」不是「餐點」—— 便當 0 筆、滷肉飯 0 筆、牛肉麵 0 筆。
 *   使用者吃的是一整份混在一起的東西，沒辦法拆料、更沒辦法秤重。
 *   所以這裡把常見餐點寫成「原料 × 公克」的組成，數字是**算出來的**，
 *   每一道都附組成，UI 可以攤開讓使用者看、也可以微調（例如飯只吃一半）。
 *
 * 份量只問小／正常／大（0.7 / 1.0 / 1.35 倍）——
 * 沒有人在自助餐檯前秤過菜；人答得出來的問題才會有答案。
 * 這是一般份量的估算，不是你那一家店的實測值。
 */

export const SIZE_FACTORS = {"small": 0.7, "normal": 1.0, "large": 1.35};

export const SIZE_LABELS = { small: '小份', normal: '正常', large: '大份' };

export const MEAL_SLOTS = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '點心',
};

export const DISH_GROUPS = {
    bento: '自助餐／便當店',
    street: '麵店／小吃',
    store: '超商／速食',
    home: '自己煮／健身餐',
};

export const DISHES = [
    {
        "id": "bento_chicken_leg",
        "name": "雞腿便當",
        "group": "bento",
        "aliases": [
            "雞腿飯",
            "便當",
            "雞腿"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 473,
        "calories": 802,
        "protein": 37.9,
        "carbs": 106.9,
        "fats": 23.2,
        "fiber": 2.2,
        "components": [
            {
                "name": "白飯",
                "grams": 250,
                "calories": 458,
                "source": "TFDA"
            },
            {
                "name": "去皮去骨雞腿",
                "grams": 130,
                "calories": 214,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 8,
                "calories": 71,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 60,
                "calories": 12,
                "source": "TFDA"
            },
            {
                "name": "雞滷蛋",
                "grams": 25,
                "calories": 48,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_pork_chop",
        "name": "排骨便當",
        "group": "bento",
        "aliases": [
            "排骨飯",
            "豬排飯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 430,
        "calories": 791,
        "protein": 29.4,
        "carbs": 105.3,
        "fats": 26.6,
        "fiber": 2.2,
        "components": [
            {
                "name": "白飯",
                "grams": 250,
                "calories": 458,
                "source": "TFDA"
            },
            {
                "name": "豬大里肌",
                "grams": 110,
                "calories": 233,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 10,
                "calories": 88,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 60,
                "calories": 12,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_chicken_chop",
        "name": "雞排便當",
        "group": "bento",
        "aliases": [
            "雞排飯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 458,
        "calories": 846,
        "protein": 28.8,
        "carbs": 121.7,
        "fats": 25.4,
        "fiber": 2.3,
        "components": [
            {
                "name": "白飯",
                "grams": 250,
                "calories": 458,
                "source": "TFDA"
            },
            {
                "name": "雞排",
                "grams": 120,
                "calories": 220,
                "source": "TFDA"
            },
            {
                "name": "炸粉",
                "grams": 18,
                "calories": 69,
                "source": "USDA"
            },
            {
                "name": "大豆油",
                "grams": 10,
                "calories": 88,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 60,
                "calories": 12,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_braised_leg",
        "name": "滷雞腿飯",
        "group": "bento",
        "aliases": [
            "滷雞腿"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 450,
        "calories": 681,
        "protein": 34.3,
        "carbs": 104.0,
        "fats": 12.4,
        "fiber": 2.3,
        "components": [
            {
                "name": "白飯",
                "grams": 250,
                "calories": 458,
                "source": "TFDA"
            },
            {
                "name": "去皮去骨雞腿",
                "grams": 130,
                "calories": 214,
                "source": "TFDA"
            },
            {
                "name": "青江菜",
                "grams": 70,
                "calories": 9,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_minced_pork",
        "name": "滷肉飯（小碗）",
        "group": "bento",
        "aliases": [
            "滷肉飯",
            "魯肉飯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 230,
        "calories": 469,
        "protein": 14.0,
        "carbs": 73.8,
        "fats": 12.1,
        "fiber": 1.1,
        "components": [
            {
                "name": "白飯",
                "grams": 180,
                "calories": 329,
                "source": "TFDA"
            },
            {
                "name": "豬絞肉",
                "grams": 45,
                "calories": 95,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 5,
                "calories": 44,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_turkey_rice",
        "name": "雞肉飯",
        "group": "bento",
        "aliases": [
            "火雞肉飯",
            "嘉義雞肉飯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 265,
        "calories": 495,
        "protein": 18.9,
        "carbs": 82.0,
        "fats": 9.0,
        "fiber": 1.2,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "火雞肉",
                "grams": 60,
                "calories": 85,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 5,
                "calories": 44,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_buffet_meat",
        "name": "自助餐 三菜一肉",
        "group": "bento",
        "aliases": [
            "自助餐",
            "夾菜",
            "便當店自助餐"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 492,
        "calories": 639,
        "protein": 32.6,
        "carbs": 89.4,
        "fats": 16.1,
        "fiber": 4.0,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "里肌肉",
                "grams": 80,
                "calories": 87,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 70,
                "calories": 14,
                "source": "TFDA"
            },
            {
                "name": "菠菜",
                "grams": 70,
                "calories": 18,
                "source": "TFDA"
            },
            {
                "name": "雞蛋豆腐",
                "grams": 60,
                "calories": 47,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 12,
                "calories": 106,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_buffet_veg",
        "name": "自助餐 素食",
        "group": "bento",
        "aliases": [
            "素食自助餐",
            "素便當"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 430,
        "calories": 561,
        "protein": 15.7,
        "carbs": 89.9,
        "fats": 15.1,
        "fiber": 4.7,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "傳統豆腐",
                "grams": 80,
                "calories": 77,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 70,
                "calories": 14,
                "source": "TFDA"
            },
            {
                "name": "花椰菜",
                "grams": 70,
                "calories": 16,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 10,
                "calories": 88,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_fish",
        "name": "鯖魚便當",
        "group": "bento",
        "aliases": [
            "魚便當",
            "烤魚便當"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 410,
        "calories": 880,
        "protein": 24.9,
        "carbs": 105.4,
        "fats": 38.4,
        "fiber": 2.2,
        "components": [
            {
                "name": "白飯",
                "grams": 250,
                "calories": 458,
                "source": "TFDA"
            },
            {
                "name": "鯖魚",
                "grams": 100,
                "calories": 410,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 60,
                "calories": 12,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "bento_shrimp_fried_rice",
        "name": "蝦仁炒飯",
        "group": "bento",
        "aliases": [
            "炒飯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 412,
        "calories": 743,
        "protein": 20.4,
        "carbs": 124.4,
        "fats": 17.4,
        "fiber": 1.8,
        "components": [
            {
                "name": "白飯",
                "grams": 300,
                "calories": 549,
                "source": "TFDA"
            },
            {
                "name": "草蝦仁",
                "grams": 50,
                "calories": 22,
                "source": "TFDA"
            },
            {
                "name": "雞蛋",
                "grams": 50,
                "calories": 66,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 12,
                "calories": 106,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "side_fried_chicken_chop",
        "name": "炸雞排（單點）",
        "group": "bento",
        "aliases": [
            "雞排"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 200,
        "calories": 521,
        "protein": 27.4,
        "carbs": 22.8,
        "fats": 34.5,
        "fiber": 0.2,
        "components": [
            {
                "name": "雞排",
                "grams": 160,
                "calories": 293,
                "source": "TFDA"
            },
            {
                "name": "炸粉",
                "grams": 25,
                "calories": 95,
                "source": "USDA"
            },
            {
                "name": "大豆油",
                "grams": 15,
                "calories": 133,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "side_braised_egg",
        "name": "滷蛋（一顆）",
        "group": "bento",
        "aliases": [
            "滷蛋"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 55,
        "calories": 105,
        "protein": 8.6,
        "carbs": 3.5,
        "fats": 6.3,
        "fiber": 0.0,
        "components": [
            {
                "name": "雞滷蛋",
                "grams": 55,
                "calories": 105,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "side_blanched_veg",
        "name": "燙青菜（一份）",
        "group": "bento",
        "aliases": [
            "燙青菜",
            "青菜"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 103,
        "calories": 47,
        "protein": 0.8,
        "carbs": 4.6,
        "fats": 3.0,
        "fiber": 1.1,
        "components": [
            {
                "name": "甘藍",
                "grams": 100,
                "calories": 20,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 3,
                "calories": 27,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_beef_noodle",
        "name": "牛肉麵",
        "group": "street",
        "aliases": [
            "牛肉麵"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 370,
        "calories": 537,
        "protein": 30.7,
        "carbs": 71.8,
        "fats": 14.3,
        "fiber": 2.3,
        "components": [
            {
                "name": "衛生油麵",
                "grams": 220,
                "calories": 359,
                "source": "TFDA"
            },
            {
                "name": "牛嫩肩里肌火鍋片",
                "grams": 90,
                "calories": 169,
                "source": "TFDA"
            },
            {
                "name": "酸菜",
                "grams": 20,
                "calories": 4,
                "source": "TFDA"
            },
            {
                "name": "青江菜",
                "grams": 40,
                "calories": 5,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_plain_noodle",
        "name": "陽春麵（小）",
        "group": "street",
        "aliases": [
            "陽春麵",
            "乾麵",
            "小麵"
        ],
        "slots": [
            "lunch",
            "dinner",
            "breakfast"
        ],
        "servingGrams": 216,
        "calories": 350,
        "protein": 10.3,
        "carbs": 56.8,
        "fats": 9.3,
        "fiber": 1.4,
        "components": [
            {
                "name": "衛生油麵",
                "grams": 180,
                "calories": 293,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 6,
                "calories": 53,
                "source": "TFDA"
            },
            {
                "name": "青江菜",
                "grams": 30,
                "calories": 4,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_beef_noodle_dry",
        "name": "牛肉乾麵",
        "group": "street",
        "aliases": [
            "乾拌牛肉麵"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 318,
        "calories": 599,
        "protein": 30.1,
        "carbs": 70.3,
        "fats": 22.2,
        "fiber": 1.3,
        "components": [
            {
                "name": "衛生油麵",
                "grams": 220,
                "calories": 359,
                "source": "TFDA"
            },
            {
                "name": "牛嫩肩里肌火鍋片",
                "grams": 90,
                "calories": 169,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 8,
                "calories": 71,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_rice_noodle_soup",
        "name": "米粉湯",
        "group": "street",
        "aliases": [
            "米粉",
            "米粉湯"
        ],
        "slots": [
            "lunch",
            "dinner",
            "breakfast"
        ],
        "servingGrams": 135,
        "calories": 252,
        "protein": 6.5,
        "carbs": 47.9,
        "fats": 3.2,
        "fiber": 0.9,
        "components": [
            {
                "name": "秈米粉",
                "grams": 55,
                "calories": 200,
                "source": "TFDA"
            },
            {
                "name": "豬絞肉",
                "grams": 20,
                "calories": 42,
                "source": "TFDA"
            },
            {
                "name": "白蘿蔔",
                "grams": 60,
                "calories": 10,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_dumpling10",
        "name": "水餃（10 顆）",
        "group": "street",
        "aliases": [
            "水餃",
            "餃子"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 250,
        "calories": 498,
        "protein": 18.5,
        "carbs": 49.2,
        "fats": 25.2,
        "fiber": 4.5,
        "components": [
            {
                "name": "熟水餃",
                "grams": 250,
                "calories": 498,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_potsticker",
        "name": "鍋貼（10 個）",
        "group": "street",
        "aliases": [
            "鍋貼"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 250,
        "calories": 595,
        "protein": 19.5,
        "carbs": 65.5,
        "fats": 28.2,
        "fiber": 3.8,
        "components": [
            {
                "name": "豬肉鍋貼",
                "grams": 250,
                "calories": 595,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_wonton_soup",
        "name": "餛飩湯",
        "group": "street",
        "aliases": [
            "餛飩",
            "扁食"
        ],
        "slots": [
            "lunch",
            "dinner",
            "breakfast"
        ],
        "servingGrams": 150,
        "calories": 243,
        "protein": 9.2,
        "carbs": 24.3,
        "fats": 12.1,
        "fiber": 2.5,
        "components": [
            {
                "name": "熟水餃",
                "grams": 120,
                "calories": 239,
                "source": "TFDA"
            },
            {
                "name": "青江菜",
                "grams": 30,
                "calories": 4,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_meat_thick_soup",
        "name": "肉羹湯",
        "group": "street",
        "aliases": [
            "肉羹",
            "羹湯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 300,
        "calories": 741,
        "protein": 29.1,
        "carbs": 56.7,
        "fats": 44.1,
        "fiber": 2.7,
        "components": [
            {
                "name": "肉羹",
                "grams": 300,
                "calories": 741,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_cantonese_congee",
        "name": "廣東粥",
        "group": "street",
        "aliases": [
            "粥",
            "鹹粥"
        ],
        "slots": [
            "breakfast",
            "dinner"
        ],
        "servingGrams": 400,
        "calories": 324,
        "protein": 19.6,
        "carbs": 36.4,
        "fats": 11.2,
        "fiber": 0.8,
        "components": [
            {
                "name": "廣東粥",
                "grams": 400,
                "calories": 324,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_scallion_pancake",
        "name": "蔥油餅",
        "group": "street",
        "aliases": [
            "蔥抓餅",
            "蔥油餅"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 120,
        "calories": 366,
        "protein": 10.0,
        "carbs": 56.3,
        "fats": 11.2,
        "fiber": 2.9,
        "components": [
            {
                "name": "蔥油餅",
                "grams": 120,
                "calories": 366,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_shaobing_youtiao",
        "name": "燒餅油條",
        "group": "street",
        "aliases": [
            "燒餅",
            "油條"
        ],
        "slots": [
            "breakfast"
        ],
        "servingGrams": 150,
        "calories": 621,
        "protein": 14.2,
        "carbs": 68.4,
        "fats": 32.3,
        "fiber": 2.0,
        "components": [
            {
                "name": "燒餅",
                "grams": 90,
                "calories": 291,
                "source": "TFDA"
            },
            {
                "name": "油條",
                "grams": 60,
                "calories": 331,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_egg_pancake",
        "name": "蛋餅",
        "group": "street",
        "aliases": [
            "蛋餅"
        ],
        "slots": [
            "breakfast"
        ],
        "servingGrams": 131,
        "calories": 287,
        "protein": 10.9,
        "carbs": 31.6,
        "fats": 13.3,
        "fiber": 0.9,
        "components": [
            {
                "name": "冷凍蛋餅皮",
                "grams": 70,
                "calories": 162,
                "source": "TFDA"
            },
            {
                "name": "雞蛋",
                "grams": 55,
                "calories": 73,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 6,
                "calories": 53,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_soy_milk",
        "name": "豆漿（大杯）",
        "group": "street",
        "aliases": [
            "豆漿"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 450,
        "calories": 158,
        "protein": 16.2,
        "carbs": 3.1,
        "fats": 8.5,
        "fiber": 5.9,
        "components": [
            {
                "name": "豆漿",
                "grams": 450,
                "calories": 158,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_hotpot_slices",
        "name": "火鍋（牛肉片）",
        "group": "street",
        "aliases": [
            "火鍋",
            "小火鍋"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 520,
        "calories": 748,
        "protein": 41.4,
        "carbs": 89.1,
        "fats": 24.8,
        "fiber": 2.7,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "牛嫩肩里肌火鍋片",
                "grams": 120,
                "calories": 226,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 80,
                "calories": 16,
                "source": "TFDA"
            },
            {
                "name": "冷凍貢丸",
                "grams": 40,
                "calories": 98,
                "source": "TFDA"
            },
            {
                "name": "嫩豆腐",
                "grams": 80,
                "calories": 42,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "street_fried_rice_noodle",
        "name": "炒米粉",
        "group": "street",
        "aliases": [
            "炒米粉"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 160,
        "calories": 416,
        "protein": 8.9,
        "carbs": 60.7,
        "fats": 14.7,
        "fiber": 0.9,
        "components": [
            {
                "name": "秈米粉",
                "grams": 70,
                "calories": 254,
                "source": "TFDA"
            },
            {
                "name": "豬絞肉",
                "grams": 30,
                "calories": 64,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 50,
                "calories": 10,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 10,
                "calories": 88,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_onigiri",
        "name": "御飯糰（一顆）",
        "group": "store",
        "aliases": [
            "御飯糰",
            "飯糰",
            "三角飯糰"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 100,
        "calories": 219,
        "protein": 5.8,
        "carbs": 36.6,
        "fats": 5.5,
        "fiber": 1.9,
        "components": [
            {
                "name": "三角飯糰",
                "grams": 100,
                "calories": 219,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_sticky_rice_ball",
        "name": "傳統飯糰",
        "group": "store",
        "aliases": [
            "糯米飯糰",
            "飯糰"
        ],
        "slots": [
            "breakfast"
        ],
        "servingGrams": 180,
        "calories": 603,
        "protein": 10.6,
        "carbs": 68.9,
        "fats": 31.7,
        "fiber": 2.0,
        "components": [
            {
                "name": "糯米飯糰",
                "grams": 180,
                "calories": 603,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_ham_egg_sandwich",
        "name": "火腿蛋三明治",
        "group": "store",
        "aliases": [
            "三明治",
            "超商三明治"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 130,
        "calories": 358,
        "protein": 14.2,
        "carbs": 36.7,
        "fats": 17.2,
        "fiber": 1.7,
        "components": [
            {
                "name": "火腿蛋三明治",
                "grams": 130,
                "calories": 358,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_toast2",
        "name": "吐司（兩片）",
        "group": "store",
        "aliases": [
            "吐司",
            "土司"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 60,
        "calories": 173,
        "protein": 5.7,
        "carbs": 29.2,
        "fats": 3.8,
        "fiber": 1.8,
        "components": [
            {
                "name": "土司",
                "grams": 60,
                "calories": 173,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_burger",
        "name": "漢堡",
        "group": "store",
        "aliases": [
            "漢堡",
            "牛肉堡"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 200,
        "calories": 518,
        "protein": 21.3,
        "carbs": 56.0,
        "fats": 23.3,
        "fiber": 4.3,
        "components": [
            {
                "name": "漢堡包",
                "grams": 90,
                "calories": 290,
                "source": "TFDA"
            },
            {
                "name": "冷凍牛肉漢堡肉",
                "grams": 90,
                "calories": 224,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 20,
                "calories": 4,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_pizza2",
        "name": "披薩（兩片）",
        "group": "store",
        "aliases": [
            "披薩",
            "比薩"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 200,
        "calories": 540,
        "protein": 24.0,
        "carbs": 71.8,
        "fats": 17.4,
        "fiber": 4.0,
        "components": [
            {
                "name": "披薩",
                "grams": 200,
                "calories": 540,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_fries",
        "name": "薯條（中份）",
        "group": "store",
        "aliases": [
            "薯條"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 127,
        "calories": 280,
        "protein": 2.5,
        "carbs": 29.3,
        "fats": 17.2,
        "fiber": 4.0,
        "components": [
            {
                "name": "冷凍馬鈴薯條",
                "grams": 115,
                "calories": 174,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 12,
                "calories": 106,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_bubble_tea",
        "name": "珍珠奶茶（大杯）",
        "group": "store",
        "aliases": [
            "珍奶",
            "珍珠奶茶",
            "手搖"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 700,
        "calories": 658,
        "protein": 1.4,
        "carbs": 125.3,
        "fats": 16.8,
        "fiber": 0.0,
        "components": [
            {
                "name": "珍珠奶茶",
                "grams": 700,
                "calories": 658,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_milk_tea",
        "name": "奶茶（中杯）",
        "group": "store",
        "aliases": [
            "奶茶"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 500,
        "calories": 210,
        "protein": 2.5,
        "carbs": 47.5,
        "fats": 1.5,
        "fiber": 0.0,
        "components": [
            {
                "name": "奶茶",
                "grams": 500,
                "calories": 210,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_black_tea",
        "name": "紅茶（大杯）",
        "group": "store",
        "aliases": [
            "紅茶"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 700,
        "calories": 259,
        "protein": 0.0,
        "carbs": 64.4,
        "fats": 0.0,
        "fiber": 0.0,
        "components": [
            {
                "name": "紅茶",
                "grams": 700,
                "calories": 259,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_pineapple_bun",
        "name": "菠蘿麵包",
        "group": "store",
        "aliases": [
            "菠蘿麵包",
            "麵包"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 90,
        "calories": 340,
        "protein": 8.3,
        "carbs": 46.4,
        "fats": 13.5,
        "fiber": 0.8,
        "components": [
            {
                "name": "菠蘿麵包",
                "grams": 90,
                "calories": 340,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_meat_floss_bun",
        "name": "肉鬆麵包",
        "group": "store",
        "aliases": [
            "肉鬆麵包"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 90,
        "calories": 386,
        "protein": 7.3,
        "carbs": 42.8,
        "fats": 20.6,
        "fiber": 2.8,
        "components": [
            {
                "name": "肉鬆麵包",
                "grams": 90,
                "calories": 386,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_frozen_dumpling",
        "name": "冷凍水餃（10 顆）",
        "group": "store",
        "aliases": [
            "冷凍水餃"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 250,
        "calories": 520,
        "protein": 20.2,
        "carbs": 55.2,
        "fats": 24.2,
        "fiber": 2.2,
        "components": [
            {
                "name": "冷凍豬肉水餃",
                "grams": 250,
                "calories": 520,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "store_frozen_fried_rice",
        "name": "冷凍炒飯（一包）",
        "group": "store",
        "aliases": [
            "冷凍炒飯"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 270,
        "calories": 400,
        "protein": 12.7,
        "carbs": 66.4,
        "fats": 9.2,
        "fiber": 7.3,
        "components": [
            {
                "name": "冷凍蝦仁炒飯",
                "grams": 270,
                "calories": 400,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_chicken_rice_veg",
        "name": "雞胸＋白飯＋青菜",
        "group": "home",
        "aliases": [
            "健身餐",
            "雞胸餐",
            "備餐"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 455,
        "calories": 681,
        "protein": 54.5,
        "carbs": 86.5,
        "fats": 11.1,
        "fiber": 3.2,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "去皮雞胸肉",
                "grams": 150,
                "calories": 248,
                "source": "USDA"
            },
            {
                "name": "花椰菜",
                "grams": 100,
                "calories": 23,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 5,
                "calories": 44,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_beef_rice_veg",
        "name": "牛肉＋白飯＋青菜",
        "group": "home",
        "aliases": [
            "牛肉餐"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 435,
        "calories": 675,
        "protein": 33.0,
        "carbs": 88.9,
        "fats": 20.4,
        "fiber": 2.3,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "牛嫩肩里肌火鍋片",
                "grams": 130,
                "calories": 244,
                "source": "TFDA"
            },
            {
                "name": "甘藍",
                "grams": 100,
                "calories": 20,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 5,
                "calories": 44,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_salmon_rice",
        "name": "鮭魚＋白飯＋青菜",
        "group": "home",
        "aliases": [
            "鮭魚餐"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 430,
        "calories": 618,
        "protein": 36.4,
        "carbs": 85.6,
        "fats": 13.3,
        "fiber": 3.7,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "大西洋鮭魚切片",
                "grams": 130,
                "calories": 226,
                "source": "TFDA"
            },
            {
                "name": "菠菜",
                "grams": 100,
                "calories": 26,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_egg3_toast",
        "name": "三顆蛋＋吐司",
        "group": "home",
        "aliases": [
            "早餐蛋",
            "蛋吐司"
        ],
        "slots": [
            "breakfast"
        ],
        "servingGrams": 230,
        "calories": 435,
        "protein": 26.3,
        "carbs": 32.1,
        "fats": 23.0,
        "fiber": 1.8,
        "components": [
            {
                "name": "雞蛋",
                "grams": 165,
                "calories": 218,
                "source": "TFDA"
            },
            {
                "name": "土司",
                "grams": 60,
                "calories": 173,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 5,
                "calories": 44,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_oat_milk",
        "name": "燕麥＋牛奶",
        "group": "home",
        "aliases": [
            "燕麥粥",
            "早餐燕麥"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 310,
        "calories": 399,
        "protein": 14.3,
        "carbs": 51.9,
        "fats": 14.9,
        "fiber": 5.1,
        "components": [
            {
                "name": "燕麥",
                "grams": 60,
                "calories": 244,
                "source": "TFDA"
            },
            {
                "name": "全脂鮮乳",
                "grams": 250,
                "calories": 155,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_tofu_rice",
        "name": "豆腐＋白飯＋青菜",
        "group": "home",
        "aliases": [
            "素食餐",
            "豆腐餐"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 506,
        "calories": 624,
        "protein": 26.6,
        "carbs": 88.0,
        "fats": 17.7,
        "fiber": 5.6,
        "components": [
            {
                "name": "白飯",
                "grams": 200,
                "calories": 366,
                "source": "TFDA"
            },
            {
                "name": "傳統豆腐",
                "grams": 200,
                "calories": 192,
                "source": "TFDA"
            },
            {
                "name": "青江菜",
                "grams": 100,
                "calories": 13,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 6,
                "calories": 53,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_chicken_salad",
        "name": "雞胸沙拉",
        "group": "home",
        "aliases": [
            "沙拉",
            "生菜沙拉"
        ],
        "slots": [
            "lunch",
            "dinner",
            "snack"
        ],
        "servingGrams": 388,
        "calories": 362,
        "protein": 48.4,
        "carbs": 9.5,
        "fats": 13.6,
        "fiber": 2.3,
        "components": [
            {
                "name": "去皮雞胸肉",
                "grams": 150,
                "calories": 248,
                "source": "USDA"
            },
            {
                "name": "結球萵苣",
                "grams": 150,
                "calories": 20,
                "source": "TFDA"
            },
            {
                "name": "金女小番茄",
                "grams": 80,
                "calories": 24,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 8,
                "calories": 71,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_sweet_potato_egg",
        "name": "地瓜＋水煮蛋",
        "group": "home",
        "aliases": [
            "地瓜蛋"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 260,
        "calories": 316,
        "protein": 16.5,
        "carbs": 40.1,
        "fats": 9.8,
        "fiber": 3.6,
        "components": [
            {
                "name": "紅肉甘藷",
                "grams": 150,
                "calories": 171,
                "source": "TFDA"
            },
            {
                "name": "雞蛋",
                "grams": 110,
                "calories": 145,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_protein_shake",
        "name": "乳清蛋白（一匙）",
        "group": "home",
        "aliases": [
            "高蛋白",
            "乳清",
            "蛋白飲"
        ],
        "slots": [
            "snack"
        ],
        "servingGrams": 30,
        "calories": 120,
        "protein": 24.0,
        "carbs": 3.0,
        "fats": 1.5,
        "fiber": 0.0,
        "components": [],
        "note": "市售乳清一匙（30g）常見標示值；實際請以你那罐的營養標示為準。"
    },
    {
        "id": "home_banana_milk",
        "name": "香蕉＋牛奶",
        "group": "home",
        "aliases": [
            "香蕉牛奶"
        ],
        "slots": [
            "breakfast",
            "snack"
        ],
        "servingGrams": 350,
        "calories": 245,
        "protein": 9.1,
        "carbs": 34.8,
        "fats": 9.1,
        "fiber": 2.0,
        "components": [
            {
                "name": "北蕉",
                "grams": 100,
                "calories": 90,
                "source": "TFDA"
            },
            {
                "name": "全脂鮮乳",
                "grams": 250,
                "calories": 155,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_dumpling_home",
        "name": "自己煮水餃（12 顆）",
        "group": "home",
        "aliases": [
            "煮水餃"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 300,
        "calories": 597,
        "protein": 22.2,
        "carbs": 59.1,
        "fats": 30.3,
        "fiber": 5.4,
        "components": [
            {
                "name": "熟水餃",
                "grams": 300,
                "calories": 597,
                "source": "TFDA"
            }
        ],
        "note": null
    },
    {
        "id": "home_noodle_egg",
        "name": "煮麵＋蛋＋青菜",
        "group": "home",
        "aliases": [
            "煮麵"
        ],
        "slots": [
            "lunch",
            "dinner"
        ],
        "servingGrams": 360,
        "calories": 456,
        "protein": 19.1,
        "carbs": 65.6,
        "fats": 13.4,
        "fiber": 2.4,
        "components": [
            {
                "name": "衛生油麵",
                "grams": 200,
                "calories": 326,
                "source": "TFDA"
            },
            {
                "name": "雞蛋",
                "grams": 55,
                "calories": 73,
                "source": "TFDA"
            },
            {
                "name": "青江菜",
                "grams": 100,
                "calories": 13,
                "source": "TFDA"
            },
            {
                "name": "大豆油",
                "grams": 5,
                "calories": 44,
                "source": "TFDA"
            }
        ],
        "note": null
    }
];

/** 這個時段可以吃的餐點（使用者是用「早餐吃什麼」在想事情）。 */
export function dishesForSlot(slotKey) {
    return DISHES.filter(d => (d.slots || []).includes(slotKey));
}

/** 依關鍵字找餐點（比對名稱與別名）。回傳最多 limit 筆。 */
export function searchDishes(query, limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 1) return [];
    const hits = DISHES.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.aliases || []).some(a => a.toLowerCase().includes(q))
    );
    // 名稱開頭命中的排前面，其次短名優先（短名通常就是使用者想的那道）
    hits.sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        return a.name.length - b.name.length;
    });
    return hits.slice(0, limit);
}

/** 取某個份量下的營養值。size = 'small' | 'normal' | 'large' */
export function scaleDish(dish, size = 'normal') {
    const f = SIZE_FACTORS[size] ?? 1;
    return {
        calories: Math.round(dish.calories * f),
        protein: Math.round(dish.protein * f * 10) / 10,
        carbs: Math.round(dish.carbs * f * 10) / 10,
        fats: Math.round(dish.fats * f * 10) / 10,
        fiber: Math.round(dish.fiber * f * 10) / 10,
        grams: Math.round(dish.servingGrams * f),
    };
}

export default DISHES;
