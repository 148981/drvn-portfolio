/**
 * prRank.js — PR 在所有 DRVN 使用者裡的名次（前端這一半）
 * ──────────────────────────────────────────────────────────────
 * 後端：POST /api/pr-rank/submit（backend/api_pr_rank.py）
 *   送自己每一項 PR 的最佳值 → 回每一項的 { rank, total, top_pct, next_value, top_value, lower_better }。
 * 卡片上的值是排好版的字串（14:23、5'27"、1,234 kg），這裡轉回數字：
 *   時間 → 秒；配速 → 秒/公里；其他 → 數字本身（單位跟著那張卡）。
 */
import apiClient from '../api/client';

export const PACE_IDS = new Set(['fastest_1k', 'best_pace_ever']);
export const DURATION_IDS = new Set(['fastest_5k', 'fastest_10k', 'half_marathon', 'full_marathon', 'longest_duration']);

export function parseRecordValue(rec) {
    const v = rec?.result?.value;
    if (v == null) return NaN;
    const s = String(v).trim();
    const pace = /^(\d+)'(\d{1,2})"?$/.exec(s);
    if (pace) return Number(pace[1]) * 60 + Number(pace[2]);
    if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
}

const two = (n) => String(Math.floor(n)).padStart(2, '0');
/** 把「差多少」排回跟卡片同一種寫法 */
export function formatGap(recId, diff, unit = '') {
    const d = Math.abs(diff);
    if (PACE_IDS.has(recId)) return d >= 60 ? `${Math.floor(d / 60)}'${two(d % 60)}"` : `${Math.round(d)} 秒`;
    if (DURATION_IDS.has(recId)) {
        if (d < 60) return `${Math.round(d)} 秒`;
        const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = Math.round(d % 60);
        return h ? `${h}:${two(m)}:${two(s)}` : `${m} 分 ${s} 秒`;
    }
    const r = Math.round(d * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

const _cache = new Map();   // recId → { at, data }
let _inflight = null;

/** 把這一頁所有已解鎖的 PR 一次送上去，回傳 { [recId]: rankInfo }。60 秒內重複呼叫用快取。 */
export async function submitPRRanks(records = [], { force = false } = {}) {
    const items = records
        .filter((r) => r?.result)
        .map((r) => ({ id: r.id, value: parseRecordValue(r) }))
        .filter((it) => Number.isFinite(it.value) && it.value > 0);
    if (!items.length) return {};
    const fresh = !force && items.every((it) => {
        const c = _cache.get(it.id);
        return c && Date.now() - c.at < 60000 && c.value === it.value;
    });
    if (fresh) return Object.fromEntries(items.map((it) => [it.id, _cache.get(it.id).data]));
    if (_inflight) return _inflight;
    _inflight = apiClient.post('/api/pr-rank/submit', { records: items })
        .then((res) => {
            const ranks = res?.data?.ranks || {};
            items.forEach((it) => { if (ranks[it.id]) _cache.set(it.id, { at: Date.now(), value: it.value, data: ranks[it.id] }); });
            return ranks;
        })
        .finally(() => { _inflight = null; });
    return _inflight;
}

/** 級距：前 1% / 5% / 10% / 25% / 50% / 其餘 —— 畫面上那條分段軌道用 */
export const RANK_BRACKETS = [
    { max: 1, label: '前 1%' },
    { max: 5, label: '前 5%' },
    { max: 10, label: '前 10%' },
    { max: 25, label: '前 25%' },
    { max: 50, label: '前 50%' },
    { max: 100, label: '其餘' },
];
export const bracketIndex = (topPct) => RANK_BRACKETS.findIndex((b) => topPct <= b.max);
