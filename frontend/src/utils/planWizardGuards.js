/**
 * planWizardGuards.js — 營養計劃精靈的防呆規則（單一真相源）
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼抽出來：
 *   「哪一步沒填完不能往下」原本寫在元件裡，只看 stepDone.*（碰過沒），
 *   所以使用者可以設出「增重，但目標體重比現在低」這種不可能的計劃，
 *   系統照樣讓他過關，最後算出一份自相矛盾的建議。
 *
 * 規則的原則：
 *   · 擋下來一定要說得出為什麼，而且是使用者看得懂的話
 *   · 能給解法就給（缺 InBody → 直接帶去量測）
 *   · 可跳過的步驟不要擋（「常吃什麼」沒挑就給一般建議）
 *   · 只擋「不可能或明顯有害」的，不擋「我覺得不夠好」的 —— 那是使用者的自由
 */

/** 目標與現況差距上限：超過三成先設階段性目標，才不會做出一份撐不完的計劃。 */
export const MAX_GOAL_GAP_RATIO = 0.35;
export const BF_MIN = 5;
export const BF_MAX = 45;

/**
 * @param {number} step 0=目標類型 1=目標數字 2=達標速度 3=常吃什麼 4=總覽
 * @param {object} ctx
 * @returns {{code:string, msg:string, needsMeasure?:boolean}|null} null = 可以往下
 */
export function stepIssue(step, ctx = {}) {
    const {
        goalType, hasInBody, stepDone = {},
        targetWeight, targetBodyFat, currentWeight, weeklyChange,
    } = ctx;
    const nowW = Number(currentWeight) || 0;

    if (step === 0) {
        if (!stepDone.mode) return { code: 'no_mode', msg: '先選一個目標類型' };
        return null;
    }

    if (step === 1) {
        if (!hasInBody) {
            return { code: 'no_inbody', msg: '先量體重與體脂，這一步的數字才算得準', needsMeasure: true };
        }
        if (!stepDone.target) return { code: 'not_confirmed', msg: '確認一下目標數字（可以用 ± 微調）' };
        if (!(Number(targetWeight) > 0)) return { code: 'no_target', msg: '目標體重還沒設定' };
        if (goalType === 'bulk' && targetWeight <= nowW) {
            return { code: 'bulk_down', msg: '增重的目標體重要比現在高' };
        }
        if (goalType === 'cut' && targetWeight >= nowW) {
            return { code: 'cut_up', msg: '減脂的目標體重要比現在低' };
        }
        if (nowW > 0 && Math.abs(targetWeight - nowW) > nowW * MAX_GOAL_GAP_RATIO) {
            return { code: 'too_far', msg: '目標和現在差超過三成，先設一個階段性目標比較實際' };
        }
        if (targetBodyFat !== null && targetBodyFat !== undefined
            && (targetBodyFat < BF_MIN || targetBodyFat > BF_MAX)) {
            return { code: 'bf_range', msg: `目標體脂請設在 ${BF_MIN}–${BF_MAX}% 之間` };
        }
        return null;
    }

    if (step === 2) {
        if (!stepDone.pace) return { code: 'no_pace', msg: '選一個達標速度' };
        if (!(Math.abs(Number(weeklyChange) || 0) > 0)) {
            return { code: 'zero_pace', msg: '這個速度算不出每週變化，換一個' };
        }
        return null;
    }

    // 第 4 步「常吃什麼」可以跳過：沒挑就是給一般建議，不擋人
    return null;
}

/** 每一步是否已經可以直接跳過去（進度列上點得動）。 */
export function unlockedSteps(ctx) {
    const ok0 = !stepIssue(0, ctx);
    const ok1 = ok0 && !stepIssue(1, ctx);
    const ok2 = ok1 && !stepIssue(2, ctx);
    return [true, ok0, ok1, ok2, ok2];
}

export default stepIssue;
