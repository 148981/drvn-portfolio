/**
 * ══════════════════════════════════════════════════════════════════════════
 * biometrics — 使用者的身體數據。只回真的，沒有就是 null。
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要這支：
 *   營養引擎以前缺資料就自己編一個頂上 —— `parseFloat(weight) || 70`、
 *   `height || 170`、`age || 25`、`gender || 'male'`，而且同一組預設值被
 *   複製在 8 支檔案裡。結果是全新使用者按一下「減脂」就會送出：
 *
 *       熱量 1859   蛋白 0g   脂肪 0g   碳水 465g
 *
 *   熱量是用「70kg／170cm／25歲／男」這個不存在的人算的，蛋白與脂肪用真實的
 *   0 —— 一半假一半真，然後存進後端當成這個人的目標（也是 Apple Watch 的
 *   唯一資料源），下次再被當成「已知值」優先採用，錯誤自我固化。
 *
 *   規則改成：**有量到才顯示，沒量到就給入口。**
 *   這支負責回答「我們真的知道什麼」，以及「缺的要去哪補」。
 *
 * 介面標準 §5：沒資料就只顯示「去把資料補上」那一件事，不編數字、不畫空圖。
 * 介面標準 §8：這是全專案唯一一份身體數據的真相源，要用就 import。
 */

/** InBody 紀錄存這裡。全站 30 處都用原生 localStorage 讀這個 key。 */
const INBODY_KEY = (userId) => `inbody_local_${userId}`;

/** 落在合理區間才算數；超出範圍的髒資料一律當作沒有。營養引擎共用同一份。 */
export const inRange = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && n > lo && n < hi ? n : null;
};

/** 'male' | 'female' | null。中英文都吃，認不出來就是 null。 */
export const normalizeGender = (g) => {
    const s = String(g ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s.startsWith('m') || s === '男' || s === '男性') return 'male';
    if (s.startsWith('f') || s === '女' || s === '女性') return 'female';
    return null;
};

/** 最新一筆 InBody 量測；沒有就 null。 */
export function latestMeasurement(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(INBODY_KEY(userId)) || '[]');
        if (!Array.isArray(raw) || !raw.length) return null;
        const sorted = [...raw].sort((a, b) =>
            new Date(b?.measurement_date || b?.date || 0) - new Date(a?.measurement_date || a?.date || 0));
        return sorted[0] || null;
    } catch { return null; }
}

/** 算熱量處方至少要有這四項。 */
export const REQUIRED_FOR_NUTRITION = ['weight', 'height', 'age', 'gender'];

const ZH = { weight: '體重', height: '身高', age: '年齡', gender: '性別' };

/**
 * 這個人「真的知道」的身體數據。每個欄位要嘛是真值，要嘛是 null —— 不會有假值。
 *
 * @param {string} userId
 * @param {object|null} profile 使用者檔案（App 的全域狀態），可省略
 * @returns {{
 *   weight:number|null, height:number|null, age:number|null,
 *   gender:'male'|'female'|null, bodyFat:number|null, muscleMass:number|null,
 *   measuredAt:string|null, missing:string[], ok:boolean
 * }}
 */
export function readBiometrics(userId, profile = null) {
    const m = latestMeasurement(userId);
    const p = profile || {};

    // 後端的使用者檔案欄位叫 weight_kg／height_cm（onboarding 存的就是這兩個），
    // 只認 current_weight／height 的話，剛填完 onboarding 的人會被當成「沒填體重」擋在營養頁外。
    const weight = inRange(m?.weight_kg ?? m?.weight, 20, 300) ?? inRange(p.current_weight, 20, 300)
        ?? inRange(p.weight_kg, 20, 300) ?? inRange(p.weight, 20, 300);
    const height = inRange(m?.height ?? m?.height_cm, 80, 250) ?? inRange(p.height, 80, 250) ?? inRange(p.height_cm, 80, 250);
    const age = inRange(m?.age, 5, 120) ?? inRange(p.age, 5, 120);
    const gender = normalizeGender(p.gender ?? m?.gender);
    const bodyFat = inRange(m?.body_fat_percent ?? m?.body_fat_percentage, 1, 70);
    const muscleMass = inRange(m?.skeletal_muscle_mass ?? m?.smm, 5, 100);

    const vals = { weight, height, age, gender };
    const missing = REQUIRED_FOR_NUTRITION.filter((k) => vals[k] == null);

    return {
        weight, height, age, gender, bodyFat, muscleMass,
        measuredAt: m?.measurement_date || m?.date || null,
        missing,
        ok: missing.length === 0,
    };
}

/* ── 補資料要去哪一頁 ────────────────────────────────────────────────
   ⚠️ 一律導去 InBody 那一頁是錯的：InBodyInputForm 只收身高與體重，
      **沒有年齡與性別的欄位**。提示說「先填年齡、性別」卻把人送到一個
      填不了年齡性別的頁面，他補完回來還是被擋 —— 死路比假數字更糟。

   個人檔案（/profile-mobile）四項都有：Age / Height / Weight / Gender，
   所以它是唯一「一定補得完」的目的地。只缺體重（最常見）時才導去
   InBody 那頁，因為那裡順便可以量體脂與骨骼肌。
------------------------------------------------------------------- */
export const PROFILE_ROUTE = '/profile-mobile';          // 四項都能填
export const INBODY_ROUTE = '/body-analysis-mobile';     // 只有身高與體重

/** InBody 那一頁填得到的欄位。缺的超出這個範圍就得走個人檔案。 */
const INBODY_CAN_FIX = new Set(['weight', 'height']);

/* ══════════════════════════════════════════════════════════════════════════
 * 哪一個功能需要哪幾項
 * ══════════════════════════════════════════════════════════════════════════
 * 分兩種：
 *   **必要** —— 體重／身高／年齡／性別，幾乎每個處方都要用，
 *              所以 onboarding 第 1、2 步就擋著不填不能過。
 *   **用到才問** —— 其餘的等使用者真的走到那個功能，才在那個位置提醒。
 *              不要一進 App 就把所有欄位丟給他填。
 *
 * 提示要寫清楚「為了什麼」。「先填年齡」使用者不知道關他什麼事；
 * 「要看心率區間，先填年齡」他才知道填完會得到什麼。
 * ═════════════════════════════════════════════════════════════════════════ */
export const FEATURE_NEEDS = {
    nutrition:      { fields: ['weight', 'height', 'age', 'gender'], what: '熱量與營養目標' },
    cycleTracking:  { fields: ['weight'],                            what: '體重目標追蹤' },
    heartZones:     { fields: ['age'],                               what: '心率區間' },
    suggestWeight:  { fields: ['weight', 'gender'],                  what: '建議重量' },
    inbodyScore:    { fields: ['height', 'gender'],                  what: '體型分數' },
    bmi:            { fields: ['height', 'weight'],                  what: 'BMI' },
    ffmi:           { fields: ['height'],                            what: 'FFMI' },
    runKcal:        { fields: ['weight'],                            what: '跑步消耗熱量' },
    waterTarget:    { fields: ['weight'],                            what: '每日喝水量' },
};

/**
 * 某一個功能現在能不能用；不能用的話缺什麼、去哪補、是為了什麼。
 *
 * @param {keyof FEATURE_NEEDS} feature
 * @returns {{ok:boolean, missing:string[], label:string, route:string, what:string}}
 */
export function featureGate(feature, userId, profile = null) {
    const need = FEATURE_NEEDS[feature];
    if (!need) return { ok: true, missing: [], label: '', route: PROFILE_ROUTE, what: '' };

    const b = readBiometrics(userId, profile);
    const missing = need.fields.filter((k) => b[k] == null);
    if (!missing.length) {
        return { ok: true, missing: [], label: '', route: PROFILE_ROUTE, what: need.what };
    }

    const route = missing.every((k) => INBODY_CAN_FIX.has(k)) ? INBODY_ROUTE : PROFILE_ROUTE;
    const zh = missing.map((k) => ZH[k] || k).join('、');
    return {
        ok: false, missing, route, what: need.what,
        label: `要看${need.what}，先填${zh}`,
    };
}

/**
 * 缺資料時畫面該顯示的那一個動作。
 * 只回一句話 —— 不附說明、不附進度、不附假數字（介面標準 §5）。
 *
 * @returns {{ok:boolean, missing:string[], label:string, route:string}}
 */
export function biometricsGate(userId, profile = null) {
    const b = readBiometrics(userId, profile);
    if (b.ok) return { ok: true, missing: [], label: '', route: PROFILE_ROUTE };

    // 缺的全部都在 InBody 那頁填得到 → 送去那裡（順便量體脂）；否則走個人檔案
    const route = b.missing.every((k) => INBODY_CAN_FIX.has(k)) ? INBODY_ROUTE : PROFILE_ROUTE;

    // 只缺一項是最常見的，講得具體一點
    const label = b.missing.length === 1
        ? `先填${ZH[b.missing[0]] || '身體數據'}`
        : `先填身體數據：${b.missing.map((k) => ZH[k] || k).join('、')}`;

    return { ok: false, missing: b.missing, label, route };
}

export default { readBiometrics, biometricsGate, featureGate, FEATURE_NEEDS, latestMeasurement, normalizeGender, PROFILE_ROUTE, INBODY_ROUTE, REQUIRED_FOR_NUTRITION };
