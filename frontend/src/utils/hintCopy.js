/**
 * hintCopy.js —— 提示文案的純邏輯（單一真相源）
 * ══════════════════════════════════════════════════════════════════
 * ⚠️ 為什麼不放在 HandWave.jsx：元件檔匯出非元件會觸發
 *    react-refresh/only-export-components（與 utils/cardioPlanCommit.js
 *    當初從元件搬出來是同一個原因）。純函式一律住 utils。
 */
/**
 * splitHint —— 把一句提示拆成「動作」與「理由」。
 *
 * DRVN 的提示句一律是「動作，理由」：
 *     再練一次，總訓練量再疊一層。
 *     去記今天吃了什麼（沒有逗號 → 整句都是動作）
 * 跳色就跳在動作那一截：有顏色的是「要做的事」，墨黑的是「為什麼」。
 * 拆法收在這裡一份，兩種提示卡共用，不會各拆各的。
 */
export function splitHint(text) {
    const t = String(text || '').trim();
    if (!t) return { lead: '', rest: '' };

    // ① 「動作，理由」——逗號前面那一截就是動作
    const i = t.search(/[，,]/);
    if (i > 0 && i <= 12) return { lead: t.slice(0, i), rest: t.slice(i) };

    /* ② 沒有逗號時只跳動詞。DRVN 的提示一律以「去…」開頭。
          ⚠️ 不能寫成 /^去[\u4e00-\u9fff]{1,2}/ —— 那會貪心吃到下一個字
             （「去記今天吃了什麼」變成跳「去記今」）。動詞要逐個列，長的排前面。 */
    const v = t.match(/^(去(?:延續|結算|完成|看|練|記|填|跑|補|改|試|選|設))/);
    if (v) return { lead: v[1], rest: t.slice(v[1].length) };

    // ③ 認不出動作就整句不跳色 —— 寧可不跳，也不要把一整行都染色
    return { lead: '', rest: t };
}
