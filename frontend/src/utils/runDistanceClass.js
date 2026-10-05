// ══════════════════════════════════════════════════════════════════════════
// 🏃 跑步里程分級 — 「名稱要跟著里程走」的單一真相源
//
// 使用者回報：
//   「長跑里程調整應該定成在某個範圍內，這樣跑者才不會在短跑上面加太多距離、
//     結果還是短跑的命名。所以在一定里程以下就要把該計劃調整變成短跑計劃，
//     那超過某里程就變成長跑計劃的概念。」
//   「標題顯示什麼 7.7 公里長跑之類的，你要隨著里程去調整名稱。」
//
// 規則（依一般跑步訓練實務）：
//   短距離  < 6 km      —— 輕鬆跑 / 恢復跑 / 間歇的常見範圍
//   中距離  6 – 12 km   —— 節奏跑 / 一般有氧課
//   長距離  > 12 km     —— 真正的「長跑」（LSD）
//
// 任何地方要判斷「這是不是長跑」「這課該叫什麼」都走這裡，不要各自寫死。
// ══════════════════════════════════════════════════════════════════════════

export const DISTANCE_BANDS = {
    SHORT_MAX: 6,    // < 6 km 為短距離
    MID_MAX: 12,     // 6–12 km 為中距離；> 12 km 為長距離
};

/** 里程 → 'short' | 'mid' | 'long' */
export const classifyDistance = (km) => {
    const d = Number(km) || 0;
    if (d <= 0) return 'short';
    if (d < DISTANCE_BANDS.SHORT_MAX) return 'short';
    if (d <= DISTANCE_BANDS.MID_MAX) return 'mid';
    return 'long';
};

export const DISTANCE_BAND_LABEL = { short: '短距離', mid: '中距離', long: '長距離' };
/** 分級對應的 UI 標籤（圖一課表卡上的 EASY / MEDIUM / LONG chip） */
export const DISTANCE_BAND_CHIP = {
    short: { text: 'EASY', zh: '短距離', color: '#5A7A3A', bg: 'rgba(90,122,58,0.10)' },
    mid: { text: 'MEDIUM', zh: '中距離', color: '#B8860B', bg: 'rgba(184,134,11,0.10)' },
    long: { text: 'LONG', zh: '長距離', color: '#C2571F', bg: 'rgba(194,87,31,0.10)' },
};

// 訓練意圖優先於距離的課別 —— 間歇/節奏/重訓的重點不是里程，不因距離改名。
const INTENT_LOCKED = new Set(['strength', 'interval', 'tempo']);

/**
 * 依實際里程「校正」課表類型。
 *
 * 使用者要求：
 *   「3.2 公里叫輕鬆跑，那如果跑者一直加里程到 16 公里呢？應該就是升級成長跑了吧。
 *     那中間其實應該再加個中距離。」
 *
 * 對照表（純距離驅動的三段）：
 *   < 6 km   → easy      輕鬆跑
 *   6–12 km  → medium    中距離跑   ← v2 新增，以前這一段會被錯誤地降級成輕鬆跑
 *   > 12 km  → long      長跑
 *
 * 例外：recovery（恢復跑）在短距離帶保留原名（恢復慢跑），因為它有明確的訓練意圖。
 */
export const reconcileSubtypeWithDistance = (subtype, km) => {
    if (INTENT_LOCKED.has(subtype)) return subtype;
    const band = classifyDistance(km);
    // 恢復跑只要還在短距離帶就維持恢復跑（超出就依距離升級）
    if (subtype === 'recovery' && band === 'short') return 'recovery';
    return { short: 'easy', mid: 'medium', long: 'long' }[band] || 'easy';
};

/** 課表標題 — 名稱一定跟著里程走，不會再出現「7.7 公里長跑」。 */
export const titleForRun = (subtype, km) => {
    const fixed = reconcileSubtypeWithDistance(subtype, km);
    const d = Number(km) || 0;
    // 整數不補小數點（16 公里，不是 16.0 公里）
    const prefix = d > 0 ? `${Number.isInteger(d) ? d : d.toFixed(1)} 公里 ` : '';
    return {
        long: `${prefix}長跑`,
        medium: `${prefix}中距離跑`,
        tempo: `${prefix}節奏跑`,
        interval: `${prefix}間歇跑`,
        easy: `${prefix}輕鬆跑`,
        recovery: `${prefix}恢復慢跑`,
        strength: '重訓交叉訓練',
    }[fixed] || `${prefix}跑步`;
};

/** 課別 → 顯示用 chip（給圖一的課表卡）。距離驅動的課別直接對應分級色。 */
export const chipForRun = (subtype, km) => {
    const fixed = reconcileSubtypeWithDistance(subtype, km);
    if (fixed === 'interval') return { text: 'INTERVAL', zh: '間歇', color: '#C2321F', bg: 'rgba(194,50,31,0.10)' };
    if (fixed === 'tempo') return { text: 'TEMPO', zh: '節奏', color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' };
    if (fixed === 'strength') return { text: 'STRENGTH', zh: '重訓', color: '#161415', bg: 'rgba(22,20,21,0.06)' };
    if (fixed === 'recovery') return { text: 'RECOVERY', zh: '恢復', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' };
    return DISTANCE_BAND_CHIP[classifyDistance(km)] || DISTANCE_BAND_CHIP.short;
};

/**
 * 調整里程時的允許範圍 —— 避免「在短跑上加太多距離」。
 * 使用者可調的上下限依課表類型給，超出就自動轉成另一種課（由 titleForRun 反映）。
 * @returns {{ min:number, max:number, step:number, hint:string }}
 */
export const distanceRangeFor = (subtype, baseKm = 0) => {
    const base = Number(baseKm) || 0;
    switch (subtype) {
        case 'recovery':
            return { min: 2, max: 6, step: 0.5, hint: '恢復跑重點是「輕」，超過 6 公里就失去恢復意義。' };
        case 'interval':
            return { min: 3, max: 10, step: 0.5, hint: '間歇的總量不宜過長，強度才是重點。' };
        case 'tempo':
            return { min: 4, max: 14, step: 0.5, hint: '節奏跑維持在可持續的乳酸閾值區間。' };
        case 'long':
            return { min: 10, max: Math.max(32, Math.ceil(base * 1.3)), step: 0.5, hint: '長跑單次增量建議不超過上次的 10%。' };
        case 'medium':
            return { min: 6, max: 16, step: 0.5, hint: '超過 12 公里會自動改列為長跑課。' };
        case 'easy':
        default:
            return { min: 2, max: 12, step: 0.5, hint: '超過 6 公里會自動改列為中距離課。' };
    }
};

/**
 * 給 ± 調整器用的「下一步會發生什麼」預覽。
 * 跨越分級邊界時要能提前告訴使用者名稱會變 —— 不要讓它默默改掉。
 * @returns {{ nextKm:number, willChangeBand:boolean, nextTitle:string, atLimit:boolean, hint:string }}
 */
export const previewDistanceStep = (subtype, km, direction = 1, baseKm = 0) => {
    const { min, max, step, hint } = distanceRangeFor(subtype, baseKm);
    const cur = Number(km) || 0;
    const raw = cur + step * (direction >= 0 ? 1 : -1);
    const nextKm = Math.min(max, Math.max(min, Math.round(raw * 2) / 2));
    const atLimit = nextKm === cur;   // 已到上下限，按了也不動
    return {
        nextKm,
        atLimit,
        willChangeBand: classifyDistance(nextKm) !== classifyDistance(cur),
        nextTitle: titleForRun(subtype, nextKm),
        hint,
    };
};

/** 夾住使用者輸入的里程到合理範圍內。 */
export const clampRunDistance = (subtype, km, baseKm = 0) => {
    const { min, max } = distanceRangeFor(subtype, baseKm);
    const d = Number(km) || 0;
    return Math.min(max, Math.max(min, Math.round(d * 2) / 2));
};

/** 全域最短里程 —— 再短就沒有訓練意義（等於所有課別 min 的最小值） */
export const GLOBAL_MIN_KM = 2;

/**
 * ★ 使用者按 +/- 時真正該落到的距離。
 *
 * 修掉一個會把人卡死的 bug：
 *   舊版用「目前課別」的 min/max 去夾。輕鬆跑加到 6 公里會升級成中距離，
 *   而中距離的 min 是 6 —— 於是再按減號時被夾回 6，永遠降不回去。
 *   往上也一樣：輕鬆跑 max 是 12，就跨不過 12 公里變成長跑。
 *
 * 正解：課別是「距離的結果」，不是距離的牢籠。
 *   先用目標距離決定它會變成哪一課別，再用那個課別的上限封頂；
 *   下限一律用全域值 —— 距離降下去，它自然就不再是那個課別了。
 */
export const stepRunDistance = (subtype, currentKm, delta, baseKm = 0) => {
    const cur = Number(currentKm) || 0;
    const raw = Math.round((cur + delta) * 2) / 2;
    if (raw <= GLOBAL_MIN_KM) return GLOBAL_MIN_KM;
    const resolved = reconcileSubtypeWithDistance(subtype, raw);
    // ⚠️ baseKm 一定要是「歷史長跑基準」，不能拿正在編輯的當前值。
    //    長跑上限是 max(32, base×1.3)：若把當前值當 base，每按一次 +
    //    上限就跟著漲，會一路失控爬到 44 公里以上（棘輪效應）。
    //    沒有明確基準就用固定的 32 公里天花板。
    const { max } = distanceRangeFor(resolved, Number(baseKm) || 0);
    return Math.min(max, raw);
};

/** 這一磚實際可調的範圍（給 UI 顯示「已到上／下限」用，與 stepRunDistance 同一套規則） */
export const effectiveRangeFor = (subtype, currentKm = 0) => {
    const { max, hint } = distanceRangeFor(subtype, currentKm);
    return { min: GLOBAL_MIN_KM, max, step: 0.5, hint };
};
