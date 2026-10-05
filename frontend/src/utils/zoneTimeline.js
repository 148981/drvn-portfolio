// ════════════════════════════════════════════════════════════════════════
//  zoneTimeline.js — 把心率串流切成「時間軸上的心率區間分段」
//
//  結算頁原本只有一條「各區總佔比」的堆疊長條（依區間輕→重排序），
//  看得出你在有氧區待了 40%，卻看不出那 40% 是「開頭跑太快」還是
//  「最後衝刺」——這兩件事的訓練意義完全不同。
//
//  這支檔案產生真正的時間序列分段：第幾分到第幾分在哪一區。
//  兩條長條分別回答不同問題，所以結算頁要並存：
//    ① 時間軸（本檔）→ 這趟「怎麼跑的」
//    ② 總佔比（既有）→ 這趟「總共練到什麼」
//
//  ⚠ 歷史坑：舊版曾用「樣本數」畫長條、用「秒數」算圖例，兩個來源不同
//    → 長條看起來 80%、圖例寫 1%。本檔一律以「秒」為單位，
//    且時間軸與佔比都由同一批 segments 導出，不會再對不上。
// ════════════════════════════════════════════════════════════════════════

export const ZONE_ORDER = ['recovery', 'fat-burn', 'aerobic', 'anaerobic', 'extreme'];

export const ZONE_LABELS = {
    recovery: '熱身區',
    'fat-burn': '燃脂區',
    aerobic: '有氧區',
    anaerobic: '無氧區',
    extreme: '極限區',
};

/** 與 index.css 的 --zone-* 完全一致（那邊是 CSS 變數，這裡畫 inline 用） */
export const ZONE_COLORS = {
    recovery: '#AAB39F',
    'fat-burn': '#9FB3B3',
    aerobic: '#D1B3B3',
    anaerobic: '#D1A58F',
    extreme: '#B88A8A',
};

/** 固定門檻，與結算頁既有邏輯一致（避免兩處各判一套） */
export function hrToZone(hr) {
    const v = Number(hr);
    if (!Number.isFinite(v) || v < 40) return null;
    if (v <= 130) return 'recovery';
    if (v <= 150) return 'fat-burn';
    if (v <= 170) return 'aerobic';
    if (v <= 190) return 'anaerobic';
    return 'extreme';
}

export const fmtClock = (sec) => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * 從心率串流建出時間軸分段。
 *
 * @param {number[]} hrArr       心率序列（等距取樣；上傳後通常每 5 秒一點）
 * @param {number[]} [timestamps] 對應的時間戳（毫秒或秒都吃）。沒有就用 durationSec 均分
 * @param {number}   durationSec 本次總時長（秒）——時間軸的實際長度以它為準
 * @param {object}   [opts]
 * @param {number}   [opts.minSegmentSec=25]  小於這個秒數的碎段會被併進鄰段（避免長條變彩色雜訊）
 * @returns {{
 *   segments: {zone:string,startSec:number,endSec:number,durSec:number}[],
 *   totals: Record<string, number>,   // 每區總秒數
 *   totalSec: number,
 *   sampleSec: number,
 *   ok: boolean
 * }}
 */
export function buildZoneTimeline(hrArr, timestamps, durationSec, opts = {}) {
    const minSegmentSec = Number(opts.minSegmentSec) || 25;
    const empty = { segments: [], totals: {}, totalSec: 0, sampleSec: 0, ok: false };

    if (!Array.isArray(hrArr) || hrArr.length < 4) return empty;

    // ── 1. 建立「每個樣本的時間位置（秒）」 ────────────────────────────
    const n = hrArr.length;
    let tSec = null;
    if (Array.isArray(timestamps) && timestamps.length === n) {
        const t0 = Number(timestamps[0]);
        const tN = Number(timestamps[n - 1]);
        if (Number.isFinite(t0) && Number.isFinite(tN) && tN > t0) {
            // 毫秒 vs 秒：跨度 > 天數級距就當毫秒
            const div = (tN - t0) > 86400 ? 1000 : 1;
            tSec = timestamps.map((t) => (Number(t) - t0) / div);
        }
    }
    const total = Number(durationSec) > 0
        ? Number(durationSec)
        : (tSec ? tSec[n - 1] : (n - 1) * 5);
    if (!(total > 0)) return empty;
    if (!tSec) {
        // 沒有時間戳 → 假設等距取樣，用總時長均分（這是降取樣後最常見的情況）
        const step = total / Math.max(1, n - 1);
        tSec = Array.from({ length: n }, (_, i) => i * step);
    }
    const sampleSec = total / Math.max(1, n - 1);

    // ── 2. 逐樣本判區，連續同區合併成 run ──────────────────────────────
    const raw = [];
    for (let i = 0; i < n; i++) {
        const z = hrToZone(hrArr[i]);
        if (!z) continue;                       // 心率無效（<40）→ 跳過，不猜
        const start = tSec[i];
        const end = i < n - 1 ? tSec[i + 1] : total;
        const last = raw[raw.length - 1];
        if (last && last.zone === z && Math.abs(last.endSec - start) < sampleSec * 1.5) {
            last.endSec = end;
        } else {
            raw.push({ zone: z, startSec: start, endSec: end });
        }
    }
    if (!raw.length) return empty;

    // ── 3. 併掉碎段：< minSegmentSec 的段落吸收進較長的鄰段 ────────────
    //    真實心率會在門檻附近抖動，不併的話一分鐘內可能切出十幾段，
    //    畫出來像彩色雜訊，反而看不出「哪一段在哪一區」。
    let segs = raw.map((s) => ({ ...s, durSec: s.endSec - s.startSec }));
    let changed = true;
    while (changed && segs.length > 1) {
        changed = false;
        let worst = -1, worstDur = Infinity;
        segs.forEach((s, i) => {
            if (s.durSec < minSegmentSec && s.durSec < worstDur) { worstDur = s.durSec; worst = i; }
        });
        if (worst === -1) break;
        const prev = segs[worst - 1], next = segs[worst + 1];
        // 併進「比較長的那個鄰居」——保留主導區間的完整性
        const intoPrev = prev && (!next || prev.durSec >= next.durSec);
        if (intoPrev) prev.endSec = segs[worst].endSec;
        else if (next) next.startSec = segs[worst].startSec;
        else break;
        segs.splice(worst, 1);
        segs = segs.map((s) => ({ ...s, durSec: s.endSec - s.startSec }));
        // 相鄰同區 → 再合併一次
        for (let i = segs.length - 1; i > 0; i--) {
            if (segs[i].zone === segs[i - 1].zone) {
                segs[i - 1].endSec = segs[i].endSec;
                segs[i - 1].durSec = segs[i - 1].endSec - segs[i - 1].startSec;
                segs.splice(i, 1);
            }
        }
        changed = true;
    }

    // ── 4. 各區總秒數（直接由 segments 加總 → 與長條同一個真相源）──────
    const totals = {};
    ZONE_ORDER.forEach((z) => { totals[z] = 0; });
    segs.forEach((s) => { totals[s.zone] = (totals[s.zone] || 0) + s.durSec; });
    const totalSec = segs.reduce((a, s) => a + s.durSec, 0);

    return { segments: segs, totals, totalSec, sampleSec, ok: segs.length > 0 && totalSec > 0 };
}

/** 時間軸底下的刻度（0 / ¼ / ½ / ¾ / 終點） */
export function timelineTicks(totalSec, count = 5) {
    if (!(totalSec > 0)) return [];
    return Array.from({ length: count }, (_, i) => {
        const pct = i / (count - 1);
        return { pct: pct * 100, label: fmtClock(totalSec * pct) };
    });
}
