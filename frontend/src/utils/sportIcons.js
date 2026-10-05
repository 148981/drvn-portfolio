// sportIcons.js
// ──────────────────────────────────────────────────────────────────────────
// 運動類型 → 圖示，破紀錄名次 → 獎牌（金/銀/銅）。
// 圖檔放在 public/icon/，以 /icon/xxx.png 引用（build 後仍在）。
// ──────────────────────────────────────────────────────────────────────────

// 運動類型 → 圖示檔
const SPORT_ICON_FILE = {
    running: 'runicon', run: 'runicon', free: 'runicon',
    trail_running: 'wildrunicon', trail: 'wildrunicon',
    cycling: 'cyclingicon', bike: 'cyclingicon',
    hiking: 'hikingicon', hike: 'hikingicon',
    swimming: 'swimicon', swim: 'swimicon',
    skiing: 'skiicon', ski: 'skiicon',
    strength: 'workouticon', gym: 'workouticon',   // 重訓 / 健身 → 啞鈴 workout icon
};

/** 依運動類型回傳圖示路徑；未知則用跑步。 */
export function sportIconSrc(sport) {
    const k = String(sport || 'running').toLowerCase();
    const file = SPORT_ICON_FILE[k] || 'runicon';
    return `/icon/${file}.png`;
}

/** 是否有對應運動圖（沒有的類型如重訓/有氧回 false，讓 UI 退回線稿）。 */
export function hasSportIcon(sport) {
    const k = String(sport || '').toLowerCase();
    return !!SPORT_ICON_FILE[k];
}

// 名次 → 獎牌圖
const MEDAL_FILE = { PR: 'goldicon', gold: 'goldicon', '1st': 'goldicon', '1': 'goldicon', 1: 'goldicon',
    '2nd': 'silvericon', silver: 'silvericon', '2': 'silvericon', 2: 'silvericon',
    '3rd': 'bronzeicon', bronze: 'bronzeicon', '3': 'bronzeicon', 3: 'bronzeicon' };

/** 名次('PR'|'2nd'|'3rd'|1|2|3) → 獎牌圖路徑；預設金牌。 */
export function medalSrc(rank = 'PR') {
    const file = MEDAL_FILE[rank] || 'goldicon';
    return `/icon/${file}.png`;
}

/** 名次 → 中文標籤。 */
export function medalLabel(rank = 'PR') {
    const r = String(rank).toLowerCase();
    if (r === 'pr' || r === '1' || r === 'gold') return '個人紀錄';
    if (r === '2nd' || r === '2' || r === 'silver') return '第 2 佳';
    if (r === '3rd' || r === '3' || r === 'bronze') return '第 3 佳';
    return '個人紀錄';
}

export default { sportIconSrc, hasSportIcon, medalSrc, medalLabel };
