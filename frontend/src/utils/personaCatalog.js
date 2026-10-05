/**
 * personaCatalog.js — DRVN 雙軸人格 × 文青稱號目錄
 * ──────────────────────────────────────────────────────────────────────
 * 設計理念（對應 Identity & Biometrics 頁）：
 *
 *   圖一 = 兩條「人格軸」，各自獨立判定：
 *     • RUNNING 跑步人格 — 只看跑步（cardio）數據：配速穩定度、爬升、
 *       夜跑/晨跑、無氧比、里程…
 *     • FITNESS 健身人格 — 只看重訓（strength）數據：訓練量、RPE、
 *       完成率、紀律、頻率…
 *
 *   圖二 = 文青風「稱號標籤」。
 *     解鎖規則：只要使用者「曾經被偵測過」擁有某個人格（不論那一次
 *     是否為當下主人格），對應的稱號標籤就永久解鎖。
 *     → 一個人格 = 一個稱號。id 一一對應，方便 titleEngine 直接查。
 *
 * label 為稱號（英文運動風，沿用圖二既有 chip 文案），
 * poeticZh 為文青版中文稱號（給圖二標籤主要顯示），
 * sub 為一句文青短註解。
 * ──────────────────────────────────────────────────────────────────────
 */

// ── 跑步人格（每個 persona = 一個稱號 chip）──────────────────────────
export const RUNNING_PERSONAS = [
    {
        id: 'road_runner',
        label: 'Cruise',
        poeticZh: '巡航',
        emoji: '',
        sub: '穩定的公路節奏',
        // 判定：有穩定的公路跑基礎（次數足、配速不飄）
        detect: (c) => c.runCount >= 3 && c.paceStability >= 55,
    },
    {
        id: 'marathon_builder',
        label: 'Distance',
        poeticZh: '長程',
        emoji: '',
        sub: '把距離一哩一哩累積',
        detect: (c) => c.totalDistance >= 60 || (c.runCount >= 8 && c.avgDistance >= 8),
    },
    {
        id: 'hill_hunter',
        label: 'Ascent',
        poeticZh: '爬升',
        emoji: '',
        sub: '把坡道踩在腳下',
        detect: (c) => c.totalElev >= 500 || c.avgElev >= 120,
    },
    {
        id: 'night_runner',
        label: 'Nocturne',
        poeticZh: '夜行',
        emoji: '',
        sub: '在城市入睡後出發',
        detect: (c) => c.nightRuns >= 3,
    },
    {
        id: 'dawn_chaser',
        label: 'Daybreak',
        poeticZh: '破曉',
        emoji: '',
        sub: '總在天光之前先醒來',
        detect: (c) => c.dawnRuns >= 3,
    },
    {
        id: 'metronome',
        label: 'Tempo',
        poeticZh: '節拍',
        emoji: '',
        sub: '配速穩定不走音',
        detect: (c) => c.paceStability >= 78 && c.runCount >= 4,
    },
    {
        id: 'tempo_wolf',
        label: 'Threshold',
        poeticZh: '臨界',
        emoji: '',
        sub: '在乳酸邊緣掌控節奏',
        detect: (c) => c.anaerobicPct >= 28 && c.runCount >= 5,
    },
];

// ── 健身人格（每個 persona = 一個稱號 chip）──────────────────────────
export const FITNESS_PERSONAS = [
    {
        id: 'iron_apprentice',
        label: 'Foundation',
        poeticZh: '築基',
        emoji: '',
        sub: '把基本動作練精',
        detect: (s) => s.strengthCount >= 3,
    },
    {
        id: 'tonnage_titan',
        label: 'Volume',
        poeticZh: '容量',
        emoji: '',
        sub: '累積可觀的訓練總量',
        detect: (s) => s.totalVolume >= 30000 || (s.strengthCount >= 6 && s.avgVolume >= 4000),
    },
    {
        id: 'grind_smith',
        label: 'Discipline',
        poeticZh: '紀律',
        emoji: '',
        sub: '規律地把課表完成',
        detect: (s) => s.discipline >= 72 && s.strengthCount >= 4,
    },
    {
        id: 'pain_broker',
        label: 'Intensity',
        poeticZh: '強度',
        emoji: '',
        sub: '穩定落在高強度區間',
        detect: (s) => s.avgRPE >= 8 && s.strengthCount >= 5,
    },
    {
        id: 'steady_hand',
        label: 'Precision',
        poeticZh: '執行',
        emoji: '',
        sub: '課表完成度極高',
        detect: (s) => s.completion >= 85 && s.strengthCount >= 4,
    },

    /* ── 2026-09 補齊 ──────────────────────────────────────────────
       原本健身只有 5 個人格，跑步有 7 個 —— 同一頁的兩條軸一邊厚一邊薄。
       而且缺的那兩個恰好是重訓最關鍵的兩件事：
         ① 有沒有在加重量（漸進超負荷，決定成效的唯一變數）
         ② 有沒有練得平均（只練喜歡的部位是最常見的問題）
       兩個都從既有 session 算得出來，不需要新資料。 */
    {
        id: 'progress_seeker',
        label: 'Progress',
        poeticZh: '漸進',
        emoji: '',
        sub: '重量一次比一次重',
        // 後段訓練的最重一組比前段高 8% 以上
        detect: (s) => s.progression >= 8 && s.strengthCount >= 4,
    },
    {
        id: 'whole_builder',
        label: 'Balance',
        poeticZh: '均衡',
        emoji: '',
        sub: '六大部位都有練到',
        detect: (s) => s.partsCovered >= 5 && s.strengthCount >= 4,
    },
];

// ── 混合人格（雙軸都被偵測過才解鎖，屬進階彩蛋）──────────────────────
export const HYBRID_PERSONAS = [
    {
        id: 'hybrid_athlete',
        label: 'Hybrid',
        poeticZh: '全能',
        emoji: '',
        sub: '跑力與力量兼具',
        // detect 需要兩軸資訊，於 detector 內特別處理
        detect: (both) => both.runCount >= 3 && both.strengthCount >= 3,
    },
];

// id → persona 定義的快查表（給 titleEngine / UI 用）
export const PERSONA_BY_ID = {};
[...RUNNING_PERSONAS, ...FITNESS_PERSONAS, ...HYBRID_PERSONAS].forEach((p) => {
    PERSONA_BY_ID[p.id] = p;
});

// 分類標記
export const RUNNING_IDS = RUNNING_PERSONAS.map((p) => p.id);
export const FITNESS_IDS = FITNESS_PERSONAS.map((p) => p.id);
export const HYBRID_IDS = HYBRID_PERSONAS.map((p) => p.id);
