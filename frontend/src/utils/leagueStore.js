/**
 * leagueStore.js — 聯盟階級持久化工具
 * 使用 localStorage 儲存當前階級與待晉升狀態
 */

export const LEAGUES = [
    {
        id: 'bronze',
        label: 'BRONZE',
        displayLabel: 'Bronze',
        // Matte Pebble-Stone — entry warmth, no gloss
        color: '#CFC6B8',
        gradient: 'linear-gradient(135deg, #6A6058 0%, #9A9088 28%, #B8AEA4 44%, #CFC6B8 52%, #B8AEA4 62%, #8A8078 78%, #5A5048 100%)',
        textGradient: 'linear-gradient(135deg, #7A7068 0%, #ACA29A 30%, #CFC6B8 46%, #E4DED2 54%, #C4BAB0 68%, #8A8078 100%)',
        tier: 'ENTRY',
        bgColor: '#0E0D0C',
        glowColor: 'rgba(207,198,184,0.22)',
        particleWarm: '180,170,158',
        particleBright: '228,222,210',
        rank: 0,
    },
    {
        id: 'silver',
        label: 'SILVER',
        displayLabel: 'Silver',
        // Brushed Stone — warm satin, never chrome
        color: '#E4DED2',
        gradient: 'linear-gradient(135deg, #7A7470 0%, #AEA8A2 28%, #CEC8C2 44%, #E4DED2 52%, #D0CAC4 62%, #A0988E 78%, #706860 100%)',
        textGradient: 'linear-gradient(135deg, #8A8480 0%, #B8B2AC 30%, #D8D2CC 46%, #F0EAE4 54%, #D4CEC8 68%, #908880 100%)',
        tier: 'CHALLENGER',
        bgColor: '#0C0B0A',
        glowColor: 'rgba(228,222,210,0.20)',
        particleWarm: '207,198,184',
        particleBright: '240,236,228',
        rank: 1,
    },
    {
        id: 'gold',
        label: 'GOLD',
        displayLabel: 'Gold',
        // Matte Coral-Ember — the system accent, desaturated for metal feel
        color: '#D94030',
        gradient: 'linear-gradient(135deg, #6A1A10 0%, #A83020 28%, #C84030 44%, #D94030 52%, #C03828 62%, #902818 78%, #5A1208 100%)',
        textGradient: 'linear-gradient(135deg, #7A2018 0%, #B83828 30%, #D44838 46%, #F05C4B 54%, #D04030 68%, #A02820 100%)',
        tier: 'LEGACY_ELITE',
        bgColor: '#0D0604',
        glowColor: 'rgba(217,64,48,0.28)',
        particleWarm: '217,64,48',
        particleBright: '249,92,75',
        rank: 2,
    },
    {
        id: 'black',
        label: 'BLACK CARD',
        displayLabel: 'Black Card',
        // Deep Black + Paper frost — matte obsidian with Paper edge catch
        color: '#F6F4F1',
        gradient: 'linear-gradient(135deg, #1A1818 0%, #2E2C2A 28%, #424040 44%, #585450 52%, #3E3C3A 62%, #242220 78%, #141212 100%)',
        textGradient: 'linear-gradient(135deg, #888480 0%, #AEA8A4 30%, #CCC8C4 46%, #F6F4F1 54%, #D0CCC8 68%, #9A9490 100%)',
        tier: 'OBSIDIAN_ELITE',
        bgColor: '#080706',
        glowColor: 'rgba(246,244,241,0.14)',
        particleWarm: '207,198,184',
        particleBright: '246,244,241',
        rank: 3,
    },
];

const STORAGE_KEY = 'fitpulse_league';
const PENDING_KEY = 'fitpulse_pending_promotion';

export const getCurrentLeague = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const found = LEAGUES.find(l => l.id === saved);
            if (found) return found;
        }
    } catch (_) {}
    // 🩹 誠實數據：沒參加過任何段位結算 → 從最低階開始。
    //    之前預設 Gold(rank 2) 會讓新帳號憑空 +600 XP（段位每階 +300），
    //    等級頁看起來像模擬數據。段位請用真實週結算爬上去。
    return LEAGUES[0];
};

export const setCurrentLeague = (leagueId) => {
    try { localStorage.setItem(STORAGE_KEY, leagueId); } catch (_) {}
    window.dispatchEvent(new CustomEvent('leagueChanged', { detail: { leagueId } }));
};

export const getTargetLeague = (currentLeague) => {
    const next = LEAGUES.find(l => l.rank === currentLeague.rank + 1);
    return next || null;
};

/** 設定待晉升邀請（週末時呼叫） */
export const setPendingPromotion = () => {
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({
            timestamp: Date.now(),
            shown: false,
        }));
    } catch (_) {}
};

/** 取得待晉升邀請，若存在且未超過 7 天則返回 */
export const getPendingPromotion = () => {
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const age = Date.now() - data.timestamp;
        if (age > 30 * 24 * 3600 * 1000) { localStorage.removeItem(PENDING_KEY); return null; }
        return data;
    } catch (_) { return null; }
};

export const clearPendingPromotion = () => {
    try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
};

/** 判斷現在是否週末（週六或週日） */
export const isWeekend = () => {
    const day = new Date().getDay();
    return day === 0 || day === 6;
};

/**
 * 判斷現在是否處於「月底結算窗口」= 每月最後 3 天。
 * 每月結算改用此判斷（取代原本的週末 isWeekend）。
 */
export const isMonthEndWindow = (d = new Date()) => {
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() > daysInMonth - 3; // 最後 3 天
};

/** 距離本月結算（月底）還有多少毫秒 */
export const msUntilMonthEnd = (d = new Date()) => {
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
    return Math.max(0, end - d);
};

/* ══════════════════════════════════════════════════════════════
 *  賽季結算引擎 — 依名次「升 / 降 / 守」並記錄歷史（之前缺這段）
 *  規則：前 30% 晉升、後 30% 降級、其餘留段；最高/最低段不再上/下。
 * ══════════════════════════════════════════════════════════════ */
const HISTORY_KEY = 'fitpulse_league_history';
const LAST_SETTLED_KEY = 'fitpulse_league_last_settled';
const PROMO_PCT = 0.30;
const RELE_PCT = 0.30;

/** 純函式：給名次/總人數/目前段位 → 算出升降結果（不寫入，可單元測試） */
// 🔴 人數太少不結算：好友榜只有自己（1 人）時，第 1 名＝前 30% → 每個月自動晉升一階，
//    一個人沒有任何競爭就能一路升到 Black Card。少於 3 人一律守段。
//    排行頁的 promoCount/releCount 也用這個門檻（人少時不畫升降區），卡片與結算才會一致。
export const MIN_SETTLE_COHORT = 3;

export const computeSettlement = ({ rank, total, league }) => {
    const lg = league || getCurrentLeague();
    if (!rank || !total || total < MIN_SETTLE_COHORT) return { outcome: 'stay', from: lg, to: lg };
    const promoCut = Math.ceil(total * PROMO_PCT);
    const releFrom = total - Math.ceil(total * RELE_PCT) + 1;
    const up = LEAGUES.find(l => l.rank === lg.rank + 1);
    const down = LEAGUES.find(l => l.rank === lg.rank - 1);
    if (rank <= promoCut && up) return { outcome: 'promote', from: lg, to: up };
    if (rank >= releFrom && down) return { outcome: 'relegate', from: lg, to: down };
    return { outcome: 'stay', from: lg, to: lg };
};

/** 取得段位變化歷史（最新在前） */
export const getLeagueHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
};
const recordLeagueHistory = (entry) => {
    try {
        const h = getLeagueHistory();
        h.unshift(entry);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
    } catch (_) {}
};

/** 是否已結算過此賽季（避免同賽季重複結算） */
export const isSettledForSeason = (seasonId) => {
    try { return localStorage.getItem(LAST_SETTLED_KEY) === String(seasonId); } catch { return false; }
};

/**
 * 執行賽季結算：依名次升/降/守，寫入新段位並記錄歷史。
 * @returns {{ outcome, from, to, entry }}
 */
export const settleLeague = ({ rank, total, seasonId = null } = {}) => {
    const league = getCurrentLeague();
    const res = computeSettlement({ rank, total, league });
    const entry = {
        date: new Date().toISOString(), seasonId, rank, total,
        fromId: league.id, fromLabel: league.label,
        toId: res.to.id, toLabel: res.to.label, outcome: res.outcome,
    };
    if (res.outcome !== 'stay') setCurrentLeague(res.to.id); // 真正改變段位（含降級）
    recordLeagueHistory(entry);
    if (seasonId != null) { try { localStorage.setItem(LAST_SETTLED_KEY, String(seasonId)); } catch (_) {} }
    return { ...res, entry };
};

/** 賽季 id：改以「月」為單位（每月一個賽季週期）。供「同賽季只結算一次」判斷。 */
export const getCurrentSeasonId = (d = new Date()) => {
    return `${d.getFullYear()}-M${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * 賽季結束自動結算：若「本月尚未結算」且已進入月底結算窗口(seasonEnded=true)，
 * 用目前名次跑一次結算。回傳結算結果或 null（不需結算）。
 * @param {boolean} [p.seasonEnded] 是否已到結算窗口；預設用 isMonthEndWindow() 自動判斷。
 */
export const maybeSettleSeason = ({ rank, total, seasonEnded } = {}) => {
    const seasonId = getCurrentSeasonId();
    const ended = seasonEnded == null ? isMonthEndWindow() : seasonEnded;
    if (!ended || isSettledForSeason(seasonId)) return null;
    if (!rank || !total) return null;
    return settleLeague({ rank, total, seasonId });
};
