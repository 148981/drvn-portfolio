// ══════════════════════════════════════════════════════════════════════════
// 📍 journeyPlaces —— 把每一筆紀錄上的地名，彙整成「你練過的地方」
//
// 地名哪裡來：存檔當下做一次性定位再反解（utils/locationName），
// 重訓存在 location_name、有氧同名欄位。粒度是「行政區 · 城市」，
// 不是健身房店名 —— 所以這裡講「地方」，不講「健身房」，不宣稱做不到的事。
//
// 沒定位到的那幾次就是沒有：不猜、不補、不拿最近一次的地名頂替。
// ══════════════════════════════════════════════════════════════════════════

/** 清單最多列幾個（其餘用總數交代）—— 全專案只有這一份。 */
export const PLACES_TOP_N = 8;

const toDate = (v) => {
    const d = v instanceof Date ? v : new Date(v);
    return d instanceof Date && !Number.isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
};

/**
 * @param {Array<{ name?:string, kind:'strength'|'run', date?:Date|string|number }>} entries
 * @returns {{ places:Array, top:Array, count:number, recorded:number }}
 *   places[i] = { name, strength, run, total, lastDate }
 */
export const buildPlaces = (entries = []) => {
    const map = new Map();

    for (const e of entries) {
        const name = typeof e?.name === 'string' ? e.name.trim() : '';
        if (!name) continue;                       // 沒地名 → 這一筆不列入
        const hit = map.get(name) || { name, strength: 0, run: 0, total: 0, lastDate: null };
        if (e.kind === 'run') hit.run += 1; else hit.strength += 1;
        hit.total += 1;
        const d = toDate(e.date);
        if (d && (!hit.lastDate || d > hit.lastDate)) hit.lastDate = d;
        map.set(name, hit);
    }

    const places = [...map.values()].sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        const at = a.lastDate ? a.lastDate.getTime() : 0;
        const bt = b.lastDate ? b.lastDate.getTime() : 0;
        if (bt !== at) return bt - at;
        return a.name.localeCompare(b.name, 'zh-Hant');
    });

    return {
        places,
        top: places.slice(0, PLACES_TOP_N),
        count: places.length,
        recorded: places.reduce((s, p) => s + p.total, 0),
    };
};

/**
 * 一行說明：只有兩種運動都有才拆數字，單一種就不重複右側那個總次數。
 * @returns {string}
 */
export const placeDetail = (p, fmtDate) => {
    const parts = [];
    if (p.strength > 0 && p.run > 0) parts.push(`重訓 ${p.strength} · 跑步 ${p.run}`);
    else if (p.run > 0) parts.push('跑步');
    else parts.push('重訓');
    if (p.lastDate && typeof fmtDate === 'function') parts.push(`上次 ${fmtDate(p.lastDate)}`);
    return parts.join(' · ');
};

export default { PLACES_TOP_N, buildPlaces, placeDetail };
