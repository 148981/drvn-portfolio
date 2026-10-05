/**
 * leaguePromotionReminder.js — 段位「真實晉升」提示邏輯
 * ──────────────────────────────────────────────────────────
 * 純邏輯工具，不含 UI。判斷使用者是否「剛晉升到更高段位、但還沒去看過」，
 * 用來在首頁輪播秀一張「段位晉升」提醒橫幅（樣式比照營養月報橫幅）。
 *
 * 與「晉升邀請」(buildPromotionAlert / 週末+晉升區) 不同：
 *   - 晉升邀請 = 還沒升，鼓勵你去衝。
 *   - 本檔     = 已經升上去了（rank 變高），提醒你去 check 新段位俱樂部。
 *
 * 偵測方式（不需在每個晉升點埋 hook，自成一格）：
 *   比較「目前段位 rank」與「上次已看過的 rank（leaguePromotionSeenRank）」。
 *   - 第一次呼叫（seen 尚未建立）：把目前 rank 設為基準，不提示
 *     （避免一進來就對既有段位誤報）。
 *   - 目前 rank > 已看過 rank → 代表有新晉升 → show。
 *   - 使用者點開/關閉後呼叫 dismissLeaguePromotion → 把基準推到目前 rank。
 *
 * 用法：
 *   import { shouldShowLeaguePromotion, dismissLeaguePromotion } from '../utils/leaguePromotionReminder';
 *   const r = shouldShowLeaguePromotion(userId);
 *   if (r.show) { ...顯示橫幅，點擊導向 /master-journey-mobile... }
 *   // 使用者看過或關閉後：
 *   dismissLeaguePromotion(userId);
 */

import { uGet, uSet } from './userStorage';
import { getCurrentLeague, LEAGUES } from './leagueStore';

const SEEN_RANK_KEY = 'leaguePromotionSeenRank'; // 已看過的最高段位 rank（數字）
const PENDING_KEY = 'leaguePromotionPending';     // 解鎖動畫播完強制點亮（leagueId 或 null）

const safeLeague = () => {
    try { return getCurrentLeague() || LEAGUES[0]; } catch { return LEAGUES[0]; }
};

/**
 * 強制點亮「段位晉升」提醒（不靠 rank 比對）。
 * 在段位解鎖動畫(league_club)播完時呼叫，確保兩條觸發路徑都會亮橫幅。
 */
export function armLeaguePromotion(userId) {
    const league = safeLeague();
    uSet(userId, PENDING_KEY, league.id || true);
}

/**
 * 是否該顯示「段位晉升」提示。
 * @returns {{ show: boolean, leagueId: string, label: string, rank: number, reason: string }}
 */
export function shouldShowLeaguePromotion(userId) {
    const league = safeLeague();
    const curRank = typeof league.rank === 'number' ? league.rank : 0;
    const base = { show: false, leagueId: league.id, label: league.displayLabel || league.label, rank: curRank, reason: '' };

    const seen = uGet(userId, SEEN_RANK_KEY, null);
    const pending = uGet(userId, PENDING_KEY, null);

    // 第一次：建立基準（用目前段位），讓之後的 rank 比對可運作
    if (seen === null || seen === undefined) {
        uSet(userId, SEEN_RANK_KEY, curRank);
    }

    // 解鎖動畫播完強制點亮（最優先）
    if (pending) {
        return { ...base, show: true, reason: 'armed' };
    }

    // 有新晉升（段位上升）
    if (seen !== null && seen !== undefined && curRank > seen) {
        return { ...base, show: true, reason: 'promoted' };
    }

    return { ...base, reason: 'no_change' };
}

/**
 * 標記「新段位已看過」，把基準推到目前段位，之後不再提示直到下次晉升。
 */
export function dismissLeaguePromotion(userId) {
    const league = safeLeague();
    const curRank = typeof league.rank === 'number' ? league.rank : 0;
    uSet(userId, SEEN_RANK_KEY, curRank);
    uSet(userId, PENDING_KEY, null);
}

export default { shouldShowLeaguePromotion, dismissLeaguePromotion };
