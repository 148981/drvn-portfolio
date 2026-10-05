// ════════════════════════════════════════════════════════════════════════
//  cadenceCoach.js — 跑步中「步頻該怎麼調」的即時提示
//
//  結算頁（coachAnalysisEngine C5）已經會在跑完之後給步頻判讀，但那時候
//  已經來不及改了。跑步中的儀表板要能當下就說「現在該怎麼做」。
//
//  門檻與 coachAnalysisEngine 保持一致（<165 偏低、170–180 理想），
//  否則會發生「跑步中說你 OK、結算頁說你偏低」這種前後矛盾。
//
//  ⚠ 誠實原則：沒有逐秒量測到步頻就回 null，呼叫端顯示 "--"，不猜。
//    建議一律是「維持配速、只改步伐大小」——叫使用者跑更快不是步頻處方。
// ════════════════════════════════════════════════════════════════════════

/** 理想步頻區間（多數休閒跑者）：省力且對膝蓋衝擊較小 */
export const CADENCE_IDEAL = [170, 180];

/**
 * @param {number} spm 當下步頻（步/分鐘）
 * @returns {null | { level:'low'|'slightly-low'|'ideal'|'high', label:string, hint:string, color:string }}
 */
export function cadenceAdvice(spm) {
    const v = Math.round(Number(spm) || 0);
    if (!(v > 0)) return null;

    if (v < 165) {
        return {
            level: 'low',
            label: '步頻偏低',
            // 重點是「配速不用變」——不然使用者會以為要跑更累
            hint: '步子縮小一點、腳步加快，配速不用變。跨步煞車少了，膝蓋負擔會降低。',
            color: '#E8845C',
        };
    }
    if (v < CADENCE_IDEAL[0]) {
        return {
            level: 'slightly-low',
            label: '再快一點',
            hint: `再加快約 ${CADENCE_IDEAL[0] - v} 步/分就進理想區，步伐略縮、速度維持。`,
            color: '#D9B26A',
        };
    }
    if (v <= CADENCE_IDEAL[1]) {
        return {
            level: 'ideal',
            label: '節奏理想',
            hint: `落在 ${CADENCE_IDEAL[0]}–${CADENCE_IDEAL[1]} 的省力區間，維持這個踩踏節奏。`,
            color: '#8FBF9F',
        };
    }
    if (v <= 190) {
        // 181–190 高於理想區但仍屬健康範圍（衝刺/下坡本來就會拉高），不要嚇使用者
        return {
            level: 'ideal',
            label: '節奏偏快',
            hint: `略高於 ${CADENCE_IDEAL[0]}–${CADENCE_IDEAL[1]}，衝刺或下坡本來就會這樣，不用刻意壓。`,
            color: '#8FBF9F',
        };
    }
    return {
        level: 'high',
        label: '步伐偏碎',
        hint: '步頻很高但步幅偏小，可以把步伐稍微放開，讓每一步多推進一點。',
        color: '#9FB3D1',
    };
}
