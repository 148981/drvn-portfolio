/**
 * titleEngine.js — DRVN 稱號系統（Identity Titles）v2 · 雙軸人格解鎖
 * ──────────────────────────────────────────────────────────────────────
 * 解鎖語意（本版重點）：
 *   稱號標籤（圖二）= 對應「人格」（圖一）。
 *   只要使用者「曾經被偵測過」擁有某個跑步 / 健身人格，對應稱號就永久解鎖。
 *   → 不是看當下數據夠不夠，而是看歷史上曾不曾出現過該人格。
 *
 * 資料流：
 *   1. computeTitles({ userId, cardio, strength }) 先用 personaDetector
 *      對「當下」資料判定 → 併進 detectedPersonas store（只增不減）。
 *   2. 稱號的 unlocked 狀態，一律讀 detectedPersonas store（= 曾偵測過）。
 *
 * 回傳（沿用舊形狀，UI 免大改）：
 *   { running: Title[], fitness: Title[], hybrid: Title[], all: Title[], suggested }
 *   Title = { id, label, poeticZh, sub, emoji, category, unlocked, reason, unlockedAt }
 * ──────────────────────────────────────────────────────────────────────
 */

import {
    RUNNING_PERSONAS, FITNESS_PERSONAS, HYBRID_PERSONAS,
} from './personaCatalog';
import { detectAllPersonas } from './personaDetector';
import {
    recordDetectedPersonas, getDetectedPersonas, getUnlockedAt,
} from './detectedPersonas';
import {
    TITLE_LEVELS, TITLE_MODES, titleByMode, getUserXPAndTitle, titleGate, titleGateData,
} from './growthAchievements';

const CATEGORY_OF = (persona, category) => ({
    id: persona.id,
    label: persona.label,
    poeticZh: persona.poeticZh,
    sub: persona.sub,
    emoji: persona.emoji,
    category,
});

/**
 * 主函式：計算所有稱號的解鎖狀態（依「曾偵測過」的人格）。
 * @param {object} p
 * @param {string} p.userId    使用者 id（解鎖記錄依此分開）
 * @param {object[]} p.cardio  跑步 session（可選；有給就順便偵測並記錄）
 * @param {object[]} p.strength 重訓 session（可選）
 * @param {boolean} p.record   是否把本次偵測結果併進解鎖記錄（預設 true）
 * @param {object} p.personality 相容舊參數（目前不需要，保留避免呼叫端報錯）
 */
export function computeTitles({
    userId = 'guest', cardio = [], strength = [], record = true, personality = null,
} = {}) {
    // 1) 對「當下」資料做雙軸偵測
    let detectedNow = { running: [], fitness: [], hybrid: [], all: [] };
    try {
        detectedNow = detectAllPersonas({ cardio, strength });
    } catch (_) {}

    // 2) 併進「曾偵測過」的永久集合（只增不減）
    if (record && detectedNow.all.length) {
        try { recordDetectedPersonas(userId, detectedNow.all); } catch (_) {}
    }

    // 3) 解鎖狀態一律讀「曾偵測過」集合
    const unlockedSet = new Set(getDetectedPersonas(userId));

    const build = (persona, category) => {
        const base = CATEGORY_OF(persona, category);
        const unlocked = unlockedSet.has(persona.id);
        const unlockedAt = unlocked ? getUnlockedAt(userId, persona.id) : null;
        const justNow = detectedNow.all.includes(persona.id);
        return {
            ...base,
            unlocked,
            unlockedAt,
            reason: unlocked
                ? '曾偵測到此人格，已永久解鎖'
                : `尚未偵測到「${persona.poeticZh}」人格`,
            active: justNow, // 此人格是否在「本次」也被偵測到（可用於 UI 高亮）
        };
    };

    const running = RUNNING_PERSONAS.map((p) => build(p, 'running'));
    const fitness = FITNESS_PERSONAS.map((p) => build(p, 'fitness'));
    const hybrid = HYBRID_PERSONAS.map((p) => build(p, 'hybrid'));
    const all = [...running, ...fitness, ...hybrid];

    // 建議稱號：最近一次新解鎖者優先；否則已解鎖中解鎖時間最新者
    const unlocked = all.filter((t) => t.unlocked);
    const suggested = unlocked.length
        ? unlocked.reduce((best, t) => ((t.unlockedAt || 0) > (best.unlockedAt || 0) ? t : best), unlocked[0])
        : null;

    return { running, fitness, hybrid, all, suggested };
}

// 把 Title 轉成 featuredTitle store 需要的形狀
export function toFeatured(title, showOnHome = true) {
    if (!title) return null;
    return {
        id: title.id,
        label: title.label,
        poeticZh: title.poeticZh,
        emoji: title.emoji,
        sub: title.sub,
        category: title.category || null,   // 🎨 主頁稱號依屬性上色用
        showOnHome,
    };
}


/* ══════════════════════════════════════════════════════════════════════
   稱號 v3 — 稱號的唯一來源是「成就獎牌換來的 XP 等級」
   ──────────────────────────────────────────────────────────────────────
   ⚠️ 為什麼改：專案裡原本有兩套稱號，而且互不相干。
      ① growthAchievements 的 TITLE_LEVELS —— 真正的成長階梯，
         由成就獎牌 ＋ 訓練 ＋ 里程 ＋ 段位換算成 XP 往上爬：
         健身：健身房新手 → … → 業餘賽選手 → IFBB Pro → Olympia
         跑步：Parkrun Regular → … → Diamond League → World Class → Olympian
         混合：Weekend Warrior → … → 標鐵三項 → IRONMAN → Kona
      ② personaCatalog 的人格標籤（巡航／長程／築基／容量…）——
         跟 XP、跟獎牌完全無關，是另一套用跑步/重訓數據即時判定的東西。
      個人檔案的「稱號」區塊掛的是 ②，所以使用者辛苦拿到的獎牌
      跟他能掛在身上的稱號之間沒有任何關係。稱號只能有一個來源，
      而那個來源必須是獎牌 → XP → 等級這條看得到、追得到的線。

   computeTitles（②）保留給人格分析頁用，不再驅動「稱號」。
   ══════════════════════════════════════════════════════════════════════ */
export function computeLevelTitles({ userId = 'guest' } = {}) {
    let totalXP = 0, currentLevel = null, nextLevel = null, xpNeededForNext = 0, levelIndexByMode = {}, gateNeeds = {};
    try {
        const r = getUserXPAndTitle(userId) || {};
        totalXP = r.totalXP || 0;
        currentLevel = r.currentLevel || null;
        nextLevel = r.nextLevel || null;
        xpNeededForNext = r.xpNeededForNext || 0;
        levelIndexByMode = r.levelIndexByMode || {};
        gateNeeds = r.gateNeeds || {};
    } catch (_) { /* 沒資料就是 0 XP，全部鎖著 */ }
    let gateData = {};
    try { gateData = titleGateData(userId); } catch (_) { gateData = {}; }

    /* 解鎖 = XP 到了 且 這一階（以及前面每一階）的真實門檻都過了。
       鎖著的原因只講一件事：XP 不夠就講 XP，XP 夠了就講還差哪個真實條件。 */
    const buildMode = (mode) => {
        const reached = levelIndexByMode[mode.id] ?? 0;
        return TITLE_LEVELS.map((lv, i) => {
            const label = titleByMode(lv, mode.id);
            const unlocked = i <= reached;
            const xpOk = totalXP >= lv.minXP;
            const gate = titleGate(i, mode.id, gateData);
            let reason;
            if (unlocked) reason = '已解鎖';
            else if (!xpOk) reason = `還差 ${Math.max(0, lv.minXP - totalXP)} XP`;
            else if (!gate.ok) reason = `還要：${gate.needs.join('、')}`;
            else reason = '先解鎖前一階';
            return {
                id: `${mode.id}:${i}`,
                label,
                poeticZh: label,        // 這套稱號沒有另一個文青版，中英同一個
                emoji: lv.emoji,
                category: mode.id,      // strength / run / hybrid
                color: lv.color,
                glow: lv.glow,
                minXP: lv.minXP,
                step: i + 1,
                unlocked,
                // 目前站在哪一階
                isCurrent: i === reached,
                reason,
            };
        });
    };

    const byMode = {};
    TITLE_MODES.forEach((m) => { byMode[m.id] = buildMode(m); });
    return { totalXP, currentLevel, nextLevel, xpNeededForNext, modes: TITLE_MODES, byMode, levelIndexByMode, gateNeeds };
}

/* 掛在身上的稱號要「現在仍然成立」：
   舊版存下來的 label（例如改名前的「奧林匹亞」）或後來才加上門檻而不再成立的那一階，
   讀出來時一律用 id 重新對一次 —— 名字換成現在的名字；鎖著的就退回這個模式實際站到的那一階。 */
export function validateFeatured(userId, featured) {
    if (!featured || typeof featured.id !== 'string') return featured || null;
    const m = /^(strength|run|hybrid):(\d+)$/.exec(featured.id);
    if (!m) return featured;          // 舊的人格稱號等其他來源：原樣
    try {
        const { byMode, levelIndexByMode } = computeLevelTitles({ userId });
        const list = byMode[m[1]] || [];
        let opt = list[Number(m[2])];
        if (!opt) return null;
        if (!opt.unlocked) opt = list[levelIndexByMode[m[1]] ?? 0];
        return { ...featured, ...levelToFeatured(opt, featured.showOnHome ?? true) };
    } catch (_) {
        return featured;
    }
}

// 等級稱號 → featuredTitle store 的形狀
export function levelToFeatured(title, showOnHome = true) {
    if (!title) return null;
    return {
        id: title.id,
        label: title.label,
        poeticZh: title.label,
        emoji: title.emoji,
        category: title.category || null,
        color: title.color || null,
        glow: title.glow || null,
        showOnHome,
    };
}
