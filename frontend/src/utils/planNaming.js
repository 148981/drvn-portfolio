// ════════════════════════════════════════════════════════════════
//  planNaming.js — 兩引擎共用的「中文命名單一真相來源 (SSOT)」
//
//  目的（依使用者 SOP 與需求）：
//   1. 全站計劃顯示統一成中文（不再出現 Push — Chest / Upper Body 等英文）
//   2. 同部位 → 同卡牌：計劃標題後綴改用「以肌群組合為 seed」的確定性算法，
//      取代原本 generateFusionName 的 Math.random()。
//   3. 兩個引擎 (planFusionEngine / UnifiedTrainingEngine) 共用同一張 focus 命名表，
//      確保相同分化在兩邊輸出完全一致的字串。
//
//  ⚠️ 修改命名請只改這一個檔案，兩個引擎都會同步。
// ════════════════════════════════════════════════════════════════

/* ── 1. 英文肌群 key → 中文標籤 ───────────────────────────────── */
export const MUSCLE_LABEL_ZH = {
    chest: '胸',
    shoulders: '肩',
    triceps: '三頭',
    biceps: '二頭',
    arms: '臂',
    back: '背',
    quads: '腿前',
    hamstrings: '腿後',
    legs: '腿',
    glutes: '臀',
    calves: '小腿',
    core: '核心',
    abs: '核心',
};

export const zhMuscle = (m) => MUSCLE_LABEL_ZH[m] || m;

/* ── 2. 計劃標題：確定性（seed）生成器 ─────────────────────────
   同一組肌群永遠對應同一個標題，後綴用肌群組合 hash 選定，不再隨機。
   後綴詞庫對齊 App 高端語氣（與 preset 計劃「雕塑/鍛造/重塑/覺醒」一致）。 */
const TITLE_CANON_ORDER = ['胸', '肩', '臂', '背', '腿', '腿前', '腿後', '臀', '核心', '小腿'];

// 精選後綴 — 比原本的「草稿/切片/手記」更有訓練語感、更高端
const TITLE_SUFFIXES = ['鍛造', '雕塑', '進化', '強化', '覺醒', '重塑', '塑形', '構築'];

// 簡單確定性字串 hash（FNV-1a 變體），保證跨裝置一致
const stableHash = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
};

/**
 * 依肌群中文標籤陣列生成「同部位 → 同標題」的確定性名稱。
 * @param {string[]} muscleLabelsZh 例如 ['胸','肩','臂']
 * @returns {string} 例如 '胸·肩·臂 鍛造'
 */
export const buildDeterministicTitle = (muscleLabelsZh) => {
    const uniq = [...new Set(muscleLabelsZh.filter(Boolean))];
    if (uniq.length === 0) return '客製化訓練計劃';
    // 依固定順序排序，確保 ['肩','胸'] 與 ['胸','肩'] 得到相同 key
    const ordered = uniq.slice().sort(
        (a, b) => {
            const ia = TITLE_CANON_ORDER.indexOf(a);
            const ib = TITLE_CANON_ORDER.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        }
    );
    const key = ordered.join('·');
    const suffix = TITLE_SUFFIXES[stableHash(key) % TITLE_SUFFIXES.length];
    return `${key} ${suffix}`;
};

/**
 * 從來源計劃名稱字串偵測肌群（沿用 generateFusionName 的關鍵字邏輯），
 * 再交給 buildDeterministicTitle。
 * @param {string} allText 所有來源計劃名稱串接
 */
const TITLE_MUSCLE_MAP = [
    { keys: ['胸', 'chest', '臥推', '胸肌', '鋼鐵胸', '胸甲'], label: '胸' },
    { keys: ['肩', 'shoulder', '三角', '肩推', '南瓜肩', '肩膀'], label: '肩' },
    { keys: ['臂', 'arm', '二頭', '三頭', '彎舉', '手臂'], label: '臂' },
    { keys: ['背', 'back', '划船', '引體', '闊背', '硬舉', '拉力', '倒三角'], label: '背' },
    { keys: ['腿', 'leg', '深蹲', '股四頭', '分腿', '腿推', '下肢'], label: '腿' },
    { keys: ['臀', 'glute', '臀推', '橋式', '蚌殼', '蜜桃'], label: '臀' },
    { keys: ['腹', 'core', '核心', '捲腹'], label: '核心' },
];

export const detectMusclesFromText = (allText = '') => {
    const found = [];
    TITLE_MUSCLE_MAP.forEach(({ keys, label }) => {
        if (keys.some(k => allText.includes(k)) && !found.includes(label)) found.push(label);
    });
    return found;
};

/* ── 3. 共用 focus 命名表（兩引擎一致）─────────────────────────
   key 對齊 UnifiedTrainingEngine 的分化 id，字串對齊 planFusionEngine
   的中文語彙，確保同一種分化在兩邊輸出完全相同的 focus。 */
export const SPLIT_FOCUS = {
    // PPL
    push: '推力強化 (胸·肩·三頭)',
    pull: '拉力強化 (背·二頭)',
    legs: '下肢結構 (腿·臀)',
    legs_glute_priority: '下肢結構 (臀部優先)',

    // 精準單部位分化 (precision)
    chest: '胸大肌結構 (胸·三頭)',
    back: '背肌結構 (背·二頭)',
    glutes: '臀與後鏈雕塑 (臀·腿後)',
    quads: '股四頭專項 (腿前·腿後)',
    shoulders: '肩部立體 (肩·二頭·三頭)',
    biceps: '手臂維度 (二頭·三頭)',
    core: '核心結構 (腹)',

    // 全身循環 (Full Body)
    fb_a: '全身結構 A (推·股四頭)',
    fb_b: '全身結構 B (拉·後鏈)',
    fb_c: '全身結構 C (綜合)',

    // 上下肢 (Upper / Lower)
    upper: '上半身結構 (胸·背·肩·臂)',
    upper_a: '上半身 A (推 — 胸·肩·三頭)',
    upper_b: '上半身 B (拉 — 背·二頭·後肩)',
    lower: '下肢結構 (腿·臀)',
    lower_a: '下肢 A (股四頭主導)',
    lower_b: '下肢 B (後鏈主導 — 臀·腿後)',

    // 阿諾經典分化 (Arnold)
    chest_back: '胸背拮抗 (推拉同日)',
    shoulder_arms: '肩臂雕塑 (肩·二頭·三頭)',
    arnold_legs: '下肢結構 (腿·臀)',
};

/**
 * 把「主分化 focus + 被 hashtag 提升的肌群」組成中文 focus。
 * @param {string} baseFocus 例如 SPLIT_FOCUS.push
 * @param {string[]} boostedMuscleKeys 英文 key 陣列，例如 ['biceps']
 */
/**
 * 一週練 N 天時，每一天的部位名稱（預覽用）。
 *
 * 值一律取自上面的 SPLIT_FOCUS，不另外寫一組字串 —— 排程要靠名字裡的
 * 「腿／臀」判斷腿日（dailyAgenda.isLegDay），自己拼一份就會判錯。
 *
 * @param {number} n 一週天數
 * @returns {Array<{dayNumber:number, focus:string}>}
 */
export const previewSplitFocus = (n) => {
    const F = SPLIT_FOCUS;
    const BY_DAYS = {
        1: [F.fullbody || F.legs],
        2: [F.upper || F.push, F.legs],
        3: [F.push, F.pull, F.legs],
        4: [F.push, F.pull, F.legs, F.upper || F.shoulders],
        5: [F.push, F.pull, F.legs, F.chest, F.back],
        6: [F.push, F.pull, F.legs, F.push, F.pull, F.legs],
    };
    const list = BY_DAYS[Math.max(1, Math.min(6, Number(n) || 1))] || BY_DAYS[3];
    return list.map((focus, i) => ({ dayNumber: i + 1, focus: focus || `Day ${i + 1}` }));
};

export const withBoostedFocus = (baseFocus, boostedMuscleKeys = []) => {
    const labels = [...new Set(boostedMuscleKeys.map(zhMuscle))];
    if (!labels.length) return baseFocus;
    return `${baseFocus}（強化 ${labels.join('·')}）`;
};


/* ══════════════════════════════════════════════════════════════════════════
 * 計劃標題
 * ══════════════════════════════════════════════════════════════════════════
 * 引擎產出的計劃沒有人取過名字，以前一律叫 'My Training Plan' ——
 * 英文、而且每個人的計劃都同一個名字。
 *
 * 這裡定義「沒取過名字時要顯示什麼」。判斷放在顯示端而不是改資料：
 * 已經存好的舊計劃（全都叫 My Training Plan）不用做資料轉檔就會跟著變。
 * 使用者自己改過名字的計劃不受影響。
 * ═════════════════════════════════════════════════════════════════════════ */

/** 這些都算「沒取過名字」。 */
export const GENERIC_PLAN_NAMES = new Set([
    'My Training Plan', 'My Journey', 'My Plan', 'Untitled Plan',
    '我的訓練計劃', '我的健身計劃', '我的計劃',
    // 舊存檔裡留的是「計畫」——要認得出來，否則會被當成使用者自訂的名字
    '我的訓練計畫', '我的計畫',
]);

/** 某個人的預設計劃標題。 */
export const ownerPlanName = (userName) =>
    `${String(userName || '').trim() || '我'}的健身計劃`;

/** 要顯示的計劃標題：取過名字就用它，沒取過就用「某某的健身計劃」。 */
export const displayPlanName = (storedName, userName) => {
    const n = String(storedName || '').trim();
    return (!n || GENERIC_PLAN_NAMES.has(n)) ? ownerPlanName(userName) : n;
};
