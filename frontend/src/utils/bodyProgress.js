// ══════════════════════════════════════════════════════════════════════════
// 🧪 bodyProgress —— 「身體到底有沒有變好」的唯一判定
//
// 為什麼需要這支：進化日誌與 JourneySinceCard 原本各寫了一份
// 「最後一筆 減 第一筆 > 0 就算進步」。於是骨骼肌 +0.1kg 也會被判定成增肌，
// 還配上一句「增肌是全健身房最慢的一件事，而你正在做到」。
//
// 但 InBody（BIA）本來就有重測誤差 —— 換個時間量、水喝多喝少都會晃。
// 0.1kg 分不出是真的長了肌肉，還是量測噪音。app 不能講自己撐不住的話。
//
// 規則：變化量要「大於量測誤差」才算數。沒到門檻就是還看不出來，
// 顯示最新數值即可，不說進步、也不說退步。
// ══════════════════════════════════════════════════════════════════════════

/**
 * 判定門檻 —— 全專案只有這一份，要調就調這裡。
 * 數值取自 BIA 體組成分析的重測誤差上緣（保守側）。
 */
export const BODY_PROGRESS = {
    MIN_SMM_KG: 0.5,   // 骨骼肌：重測誤差約 ±0.3~0.5 kg，取上緣
    MIN_BF_PCT: 1.0,   // 體脂率：重測誤差約 ±0.5~1.0 %，取上緣
    MIN_POINTS: 2,     // 要比較就至少兩筆（也是趨勢線能畫出來的最低筆數）
};

/** 兩個量測值的差（到小數一位）。任一為空回 null —— 沒資料就是沒資料。 */
export const deltaOf = (from, to) =>
    (from != null && to != null && Number.isFinite(from) && Number.isFinite(to)
        ? +((to - from).toFixed(1))
        : null);

/** 骨骼肌真的變多了（超過量測誤差）。 */
export const gainedMuscle = (smmDelta) =>
    smmDelta != null && smmDelta >= BODY_PROGRESS.MIN_SMM_KG;

/** 體脂率真的變低了（超過量測誤差）。 */
export const lostFat = (bfDelta) =>
    bfDelta != null && bfDelta <= -BODY_PROGRESS.MIN_BF_PCT;

/** 身體重組：增肌與減脂同時成立 —— 這是強主張，兩邊都要過門檻。 */
export const isRecomp = (smmDelta, bfDelta) =>
    gainedMuscle(smmDelta) && lostFat(bfDelta);

/** 整體有變好：增肌或減脂，任一成立。 */
export const bodyImproved = (smmDelta, bfDelta) =>
    gainedMuscle(smmDelta) || lostFat(bfDelta);

/** 夠不夠畫趨勢線。 */
export const enoughToCompare = (count) => Number(count) >= BODY_PROGRESS.MIN_POINTS;

export default {
    BODY_PROGRESS, deltaOf, gainedMuscle, lostFat, isRecomp, bodyImproved, enoughToCompare,
};
