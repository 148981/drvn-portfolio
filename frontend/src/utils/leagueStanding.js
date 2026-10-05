/**
 * ══════════════════════════════════════════════════════════════════════════
 * leagueStanding — 「我在這個月的哪裡」的純計算（單一真相源，§8）
 * ══════════════════════════════════════════════════════════════════════════
 * 卡片只負責畫；名次→軌道位置、晉升/降級線在哪、該顯示哪一句動作句，
 * 全部在這裡算。純函式，可以用 node 斷言直接驗（§11）。
 *
 * ⚠️ 晉升/降級的比例（30%）不在這支定義 —— 那是 leagueStore.computeSettlement
 *    的規則，呼叫端把算好的 promoCount / releCount 傳進來。
 *    在這裡再寫一次 0.3 就會變成第二份定義，兩邊哪天不同步，
 *    畫面上的線就會跟月底真正的結算結果對不起來。
 */

/** 名次 → 軌道位置（0 = 最後一名，1 = 第一名）。取格子中心，第一名不會貼死右緣。 */
export const posOf = (rank, total) => {
    if (!Number.isFinite(rank) || !Number.isFinite(total) || total < 1) return 0;
    return Math.min(1, Math.max(0, (total - rank + 0.5) / total));
};

/** 晉升線在軌道上的位置；沒有晉升區（或全員晉升）→ null，不畫。 */
export const promoGateAt = (total, promoCount) =>
    (promoCount > 0 && promoCount < total) ? (total - promoCount) / total : null;

/** 降級線在軌道上的位置；沒有降級區 → null，不畫。 */
export const releGateAt = (total, releCount) =>
    (releCount > 0 && total - releCount + 1 > 1) ? releCount / total : null;

/**
 * 軌道上要畫幾條線、各自在哪、叫什麼。
 * ⚠️ 人少的時候兩條線會重疊：晉升線 = (total−promoCount)/total、
 *    降級線 = releCount/total，兩者相等的條件是 promoCount + releCount === total。
 *    以 30% 計，2 人（1+1）與 4 人（2+2）剛好就是這個情況 ——
 *    好友榜常常就是兩三個人，那時兩個標籤會疊在同一個位置變成一團黑。
 *    沒有「守段區」時本來就只有一條分界線，合成一條並改名。
 * @returns {{at:number,label:string}[]}
 */
export const gatesOf = (total, promoCount, releCount) => {
    const pg = promoGateAt(total, promoCount);
    const rg = releGateAt(total, releCount);
    if (pg === null && rg === null) return [];
    if (pg === null) return [{ at: rg, label: '降級線' }];
    if (rg === null) return [{ at: pg, label: '晉升線' }];
    // 沒有守段區 → 一條分界線
    if (promoCount + releCount >= total) return [{ at: pg, label: '升降分界' }];
    return [{ at: rg, label: '降級線' }, { at: pg, label: '晉升線' }];
};

/** 我在哪一區。 */
export const zoneOf = (rank, total, promoCount, releCount) => {
    if (rank <= promoCount) return 'promote';
    if (rank >= total - releCount + 1) return 'relegate';
    return 'hold';
};

/**
 * 動作句 —— 動詞開頭、講「再做什麼會怎樣」（§3）。
 * @param {string} nextLabel 下一段位的顯示名；已在最高段傳 null
 */
export const actionLine = (rank, total, promoCount, releCount, nextLabel) => {
    // 人數不足、沒有升降區（promoCount=0）→ 不能講「再前進 N 名就進晉升區」，那一區根本不存在
    if (!(promoCount > 0) && !(releCount > 0)) return '再邀好友一起練，人數夠了月底才會升降';
    const zone = zoneOf(rank, total, promoCount, releCount);
    if (zone === 'promote') {
        return nextLabel ? `守到月底就升上 ${nextLabel}` : '守到月底就留在最高段';
    }
    if (zone === 'relegate') {
        return `再前進 ${rank - (total - releCount + 1) + 1} 名就脫離降級區`;
    }
    return `再前進 ${rank - promoCount} 名就進晉升區`;
};

export default { posOf, promoGateAt, releGateAt, gatesOf, zoneOf, actionLine };
