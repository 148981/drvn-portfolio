/**
 * strengthCoachNotes.js — 重訓進階圖表的「結論＋該做什麼」
 * ══════════════════════════════════════════════════════════════════════
 * 跑步的圖表有 coachAnalysisEngine.chartCoachNote；重訓這邊的 ACWR、肌群分布
 * 以前只給數字和一個狀態字（「1.4 · 注意」），付費的人要的是結論，不是儀表板。
 *
 * 每一條回 { title, action }：
 *   title   ≤ 20 字，現在是什麼狀況（帶關鍵數字）
 *   action  ≤ 24 字，下一次訓練要做什麼
 * 資料不足回 null —— 畫面就不放，不編結論。
 * ══════════════════════════════════════════════════════════════════════
 */

/** ACWR：這週量 ÷ 4 週平均。門檻與 TrainingRecordPageMobile 的 status 同一套 */
export function acwrNote(acwr) {
    if (!acwr || acwr.status === 'insufficient' || !Number.isFinite(Number(acwr.ratio))) return null;
    const pct = Math.round((Number(acwr.ratio) - 1) * 100);
    switch (acwr.status) {
        case 'danger':
            return { title: `這週量比平常多 ${pct}%`, action: '明天休息，下一次每個動作少 2 組' };
        case 'caution':
            return { title: `這週量比平常多 ${pct}%`, action: '下一次每個動作少 1 組，重量不變' };
        case 'detraining':
            return { title: `這週量比平常少 ${Math.abs(pct)}%`, action: '把漏掉的那一天補回來' };
        default:
            return pct >= 5
                ? { title: `這週比平常多 ${pct}%，節奏剛好`, action: '照課表練，身體跟得上' }
                : { title: '負荷穩定在安全區', action: '照課表練，上次做滿的動作可以加重' };
    }
}

/**
 * 過去 7 天各部位的量（[{ name:'胸', volume }]）→ 最該補的一件事。
 * 看兩件教練最在意的事：推拉平衡（胸 vs 背）、有沒有練腿。
 */
export function muscleBalanceNote(volumeByMuscle = []) {
    const v = Object.fromEntries((volumeByMuscle || []).map((m) => [m.name, Number(m.volume) || 0]));
    const total = Object.values(v).reduce((a, b) => a + b, 0);
    const trained = Object.values(v).filter((x) => x > 0).length;
    if (total <= 0 || trained < 2) return null;
    const chest = v['胸'] || 0, back = v['背'] || 0, legs = v['腿'] || 0;
    if (chest > 0 && back < chest * 0.7) {
        return { title: `背的量只有胸的 ${Math.round((back / chest) * 100)}%`, action: '下一次先練背，多做 2 組划船' };
    }
    if (back > 0 && chest < back * 0.5) {
        return { title: `胸的量只有背的 ${Math.round((chest / back) * 100)}%`, action: '下一次先練胸，多做 2 組推' };
    }
    if (legs < total * 0.2) {
        return { title: `腿只佔這週的 ${Math.round((legs / total) * 100)}%`, action: '這週再排一次腿' };
    }
    return { title: '各部位分配平均', action: '照課表練' };
}

export default { acwrNote, muscleBalanceNote };
