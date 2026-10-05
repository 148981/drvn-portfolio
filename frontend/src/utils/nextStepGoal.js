// ─────────────────────────────────────────────────────────────
// 🎯 Next-Step Goal — 跑完當下的「下一步」小目標產生器
//
// 為什麼：留存最強的時刻是「剛跑完、還有成就感」那幾秒。若結果頁只給數據
// 就結束，使用者得自己想「下次跑什麼」，那股動力就浪費掉。這支工具把
// 「這次的表現」接到「下次一個明確、可達成的小目標」。
//
// 智慧混合優先序（取第一個成立的）：
//   1. 破紀錄在望 — 距離離最遠紀錄很近 → 「再 X 公里破最遠紀錄」
//   2. 配速進步   — 有歷史配速基準 → 「下次平均配速快 5 秒/km」
//   3. 規律養成   — 沒有足夠歷史 → 「保持節奏，X 天內再跑一次」
//
// 這支「只讀」：吃 personalRecords + 本次數據，不寫入、不碰計劃資料。
// 計劃情境（有 this-week brick）由卡片端負責切換，不在這裡處理。
// ─────────────────────────────────────────────────────────────

import { computePersonalRecords, formatPaceSec } from './personalRecords';

const PACE_IMPROVE_SEC = 5;          // 配速進步目標：快 5 秒/km
const DISTANCE_PR_NEAR_KM = 1.5;     // 離最遠紀錄這麼近就鼓勵衝
const REGULARITY_DAYS = 3;           // 規律養成：建議幾天內再跑

const normalizeFinished = (cardioData) => {
    const s = cardioData?.stats || cardioData || {};
    const distanceKm = Number(s.distance ?? s.distance_km ?? 0) || 0;
    const durationSec = Number(s.duration ?? 0) || 0;
    let avgPaceSec = Number(s.pace ?? s.avgPace ?? 0) || 0;
    if (!(avgPaceSec > 0) && distanceKm > 0 && durationSec > 0) {
        avgPaceSec = Math.round(durationSec / distanceKm);
    }
    return { distanceKm, durationSec, avgPaceSec };
};

/**
 * 由「本次跑步 + 歷史」產生下一步小目標（free-run 情境）。
 * @param {object} cardioData 本次（含 stats）
 * @param {Array}  priorRuns  歷史跑步（不含本次）
 * @returns {{ type, eyebrow, title, detail, targetPaceSec?, targetDistanceKm? }}
 */
export const buildNextStepGoal = (cardioData, priorRuns = []) => {
    const cur = normalizeFinished(cardioData);
    const pr = computePersonalRecords(priorRuns);

    // ── 1. 破紀錄在望（距離） ──
    const longest = pr.longestDistance?.distanceKm || 0;
    if (longest > 0 && cur.distanceKm > 0) {
        const gap = longest - cur.distanceKm;
        // 本次已逼近最遠（差距小且為正）→ 鼓勵下次補上破紀錄
        if (gap > 0 && gap <= DISTANCE_PR_NEAR_KM) {
            const target = Number((longest + 0.1).toFixed(1));
            return {
                type: 'DISTANCE',
                eyebrow: '下一步 · 破最遠紀錄',
                title: `再 ${(target - cur.distanceKm).toFixed(1)} 公里就破紀錄`,
                detail: `你的最遠是 ${longest.toFixed(1)} 公里，下次跑到 ${target.toFixed(1)} 公里改寫它。`,
                targetDistanceKm: target,
            };
        }
    }

    // ── 2. 配速進步 ──
    if (cur.avgPaceSec > 0 && (pr.bestAvgPace || pr.totalRuns > 0)) {
        const target = cur.avgPaceSec - PACE_IMPROVE_SEC;
        return {
            type: 'PACE',
            eyebrow: '下一步 · 配速進步',
            title: `下次配速挑戰 ${formatPaceSec(target)}`,
            detail: `這次平均 ${formatPaceSec(cur.avgPaceSec)}，下次試著快 ${PACE_IMPROVE_SEC} 秒/公里，先撐前 3 公里。`,
            targetPaceSec: target,
        };
    }

    // ── 3. 規律養成（首次 / 資料不足） ──
    return {
        type: 'REGULARITY',
        eyebrow: '下一步 · 養成節奏',
        title: `${REGULARITY_DAYS} 天內再跑一次`,
        detail: cur.distanceKm > 0
            ? `好的開始！趁手感還在，${REGULARITY_DAYS} 天內再出門一次，把跑步變成習慣。`
            : `${REGULARITY_DAYS} 天內再跑一次，讓身體記住節奏。`,
    };
};

/**
 * 判斷「剛跑完這一場」是否達成了先前存下的目標。
 * 用於跑完自動清掉已達成的舊目標，避免主頁顯示過時目標。
 * @param {object} finishedRun 本次（含 stats 或扁平欄位）
 * @param {object} savedGoal   先前 buildNextStepGoal/buildPlanNextStep 存下的目標
 * @returns {boolean} 是否達成（達成 → 呼叫端清掉）
 */
export const isGoalAchieved = (finishedRun, savedGoal) => {
    if (!savedGoal || !savedGoal.type) return false;
    const cur = normalizeFinished(finishedRun);

    switch (savedGoal.type) {
        case 'DISTANCE':
            // 距離目標：本次距離 ≥ 目標距離（給 50m 容差）
            return savedGoal.targetDistanceKm > 0 && cur.distanceKm + 0.05 >= savedGoal.targetDistanceKm;
        case 'PACE':
            // 配速目標：本次平均配速 ≤ 目標（秒/km，越小越快；給 2 秒容差）
            return savedGoal.targetPaceSec > 0 && cur.avgPaceSec > 0 && cur.avgPaceSec <= savedGoal.targetPaceSec + 2;
        case 'REGULARITY':
            // 規律目標：只要這次有實際跑（距離 > 0）就算完成「再跑一次」
            return cur.distanceKm > 0;
        case 'PLAN':
            // 計劃下一課：距離達標即視為完成（無距離門檻 → 有跑就算）
            return savedGoal.targetDistanceKm > 0
                ? cur.distanceKm + 0.05 >= savedGoal.targetDistanceKm
                : cur.distanceKm > 0;
        case 'FIRST':
            return cur.distanceKm > 0;
        default:
            return false;
    }
};

/**
 * 計劃情境：把一個 this-week brick 轉成「下一課」卡片內容。
 * @param {object} brick { title, distance_km, focus, day, ... }
 */
export const buildPlanNextStep = (brick) => {
    if (!brick) return null;
    const dist = Number(brick.distance_km ?? brick.distanceKm ?? 0) || 0;
    const title = brick.title || brick.name || '下一堂課';
    return {
        type: 'PLAN',
        eyebrow: '下一步 · 計劃下一課',
        title: String(title).slice(0, 24),
        detail: dist > 0
            ? `你的訓練計劃安排了 ${dist.toFixed(1)} 公里。準備好就開始下一堂。`
            : `你的訓練計劃還有下一堂課，準備好就出發。`,
        targetDistanceKm: dist || undefined,
    };
};
