/**
 * trainingFocus.js — 這一期的目標（Training Focus）單一真相源
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   使用者原本要分別走進三個系統（重訓 wizard / 跑步 builder / 營養策略）
 *   各設定一次，彼此不知道對方排了幾天 → 排出「跑 5 天 ＋ 重訓 5 天」這種
 *   生理上跑不完的課表，也沒有「我這一季到底在幹嘛」的完整感。
 *
 * 設計原則：**從使用者想要什麼出發**，不是從訓練學名詞出發。
 *   使用者說得出口的是「我想維持好身材」「我想練 HYROX」「我只想有健康的
 *   生活習慣」——所以選項就長這樣；系統負責把它翻譯成三張課表的參數，
 *   而且全部只是「推薦」，每一項都能再進去細調或直接跳過。
 *
 * 這支檔案是「目標 → 三項處方」的唯一計算來源：
 *   1. FOCUS_OPTIONS      使用者選的目標
 *   2. resolveWeeklySplit 依目標/程度/路線分配「重訓天數 × 跑步趟數」，
 *                         並在超標時說明「砍了什麼、為什麼砍」
 *   3. buildFocusPlan     產出三項處方（跑步 / 重訓 / 營養）＋要帶進生成器的參數
 *   4. checkWeeklyLoad    給「沒走引導流程、自己設計計劃」的人做天數守門
 *   5. readModuleStatus   誠實讀「三項是不是真的已經有計劃」（讀真實存檔，不看旗標）
 *
 * 訓練學依據（每條處方都要對得回這裡）：
 *   · ACSM 成人建議：每週 150 分鐘中強度有氧 ＋ ≥2 天阻力訓練。
 *   · 同期訓練干擾效應（concurrent training interference）：高量耐力與高頻
 *     肌力同時堆到最大會互相吃掉適應，所以任何目標都必須有「主角 / 配角」。
 *   · 每週至少 1 天完全休息（本檔硬上限 HARD_MAX_TOTAL_DAYS = 6）。
 *   · 蛋白質 1.6–2.2 g/kg／日；熱量赤字上限約 −500 kcal／日。
 *
 * ⚠ 誠實數據鐵律：營養處方需要體組成才算得準。沒有 InBody 一律標「預估」，
 *   並優先引導使用者去量一次（見 evaluateInBodyGate）。
 */

import { getLevelCode } from './UnifiedTrainingEngine';
import { readJSON } from './safeStorage';
import { loadCachedBricks } from './dailyAgenda';
import { activeStrengthPlanId, readStrengthPlanDays } from './strengthPlanCompletion';

// ══════════════════════════════════════════════════════════════════════
// 1 · 目標選項（使用者說得出口的話，不是訓練學名詞）
// ══════════════════════════════════════════════════════════════════════

/**
 * 每個目標都帶三份東西，缺一不可：
 *   · moduleRoles  三個系統在這一期各自是「主課」還是「輔助」，以及為什麼
 *   · coachNotes   真正的排課鐵則（同期訓練干擾、順序、減量、赤字上限）
 *   · caveat       這一期做不到的事 —— 誠實揭露比多賣一個賣點重要
 */
export const FOCUS_OPTIONS = [
    {
        id: 'habit',
        kicker: 'HABIT',
        label: '養成健康生活習慣',
        sub: '動起來，而且能一直動下去',
        blurb: '一週最多 4 天、留 3 天休息。重訓做全身，跑步只跑講得出話的配速。',
        moduleRoles: { strength: 'core', run: 'core', nutrition: 'support' },
        roleReason: {
            strength: '每週 2 天阻力訓練是健康效益的地板（ACSM），這一期不能少。',
            run: '每週 150 分鐘中強度有氧同樣是地板，用最輕鬆的方式湊滿。',
            nutrition: '先建立紀錄習慣就好，這一期不急著動熱量。',
        },
        coachNotes: [
            '先求有再求好：一週真的出門 3–4 次就算成功，強度不是這一期的重點。',
            '重訓兩天都做全身（蹲、推、拉、髖鉸鏈），不要拆部位 —— 一週只練兩天還拆部位，每個部位要七天才碰一次。',
            '跑步全部用「能講完整句子」的配速；喘到說不出話就是太快了。',
        ],
    },
    {
        id: 'shape',
        kicker: 'SHAPE',
        label: '維持現在的好身材',
        sub: '守住體態與體能，不用再往上加',
        blurb: '份量可以少，強度要守住。每個大部位每週碰一次就夠維持。',
        moduleRoles: { strength: 'core', run: 'support', nutrition: 'support' },
        roleReason: {
            strength: '維持肌肉靠的是「強度還在」，重訓是這一期唯一不能省的。',
            run: '保住心肺底子，份量不用多。',
            nutrition: '熱量抓在維持附近，體重穩住就是達標。',
        },
        coachNotes: [
            '維持靠強度、不靠份量：組數可以少，重量不要降 —— 掉重量才是掉肌肉的開始。',
            '每個大部位每週碰到一次就夠；忙的那週砍組數，不要整週停掉。',
            '體重每週上下 1 公斤內都算正常波動，不用追著調整。',
        ],
    },
    {
        id: 'build',
        kicker: 'BUILD',
        label: '增肌變壯',
        sub: '把重量與肌肉練上去',
        blurb: '重訓是主課，跑步只打底。每個部位每週 10–20 組，熱量抓在維持或小幅盈餘。',
        moduleRoles: { strength: 'core', run: 'support', nutrition: 'core' },
        roleReason: {
            strength: '這一期的主課，所有安排都繞著它轉。',
            run: '只當打底：維持心肺，不搶走恢復資源。',
            nutrition: '沒有足夠的熱量與蛋白質，練得再兇也長不出來。',
        },
        coachNotes: [
            '每個部位每週累積 10–20 組有效組，分兩次做完比一次做完好。',
            '跑步這一期只當打底：全部輕鬆跑、不排間歇 —— 高強度有氧會吃掉下肢的肌肥大適應。',
            '重訓日與跑步日盡量錯開；真的同一天，先重訓、隔 6 小時以上再跑。',
            '增肌是慢的：一個月體重上升 0.5–1% 就是好速度，再快多半是脂肪。',
        ],
    },
    {
        id: 'lean',
        kicker: 'LEAN',
        label: '減脂練線條',
        sub: '把體脂降下來，線條顯出來',
        blurb: '熱量缺口靠飲食做，有氧幫忙加大；重訓照練保住肌肉，蛋白質拉到 2.2 g/kg。',
        moduleRoles: { strength: 'core', run: 'support', nutrition: 'core' },
        roleReason: {
            strength: '赤字期的保肌關鍵；沒有它，體重掉下來但體態不會變好。',
            run: '把熱量缺口做出來，比單靠少吃輕鬆也好維持。',
            nutrition: '減脂的成敗八成在這裡，這一期它是主角。',
        },
        coachNotes: [
            '熱量缺口決定掉多少，重訓決定掉的是什麼 —— 兩個都要，不能只做有氧。',
            '重量維持住，靠減組數控制疲勞；赤字期還想加重是最快受傷的路。',
            '每週體重掉 0.5–1% 就好；掉太快一定連肌肉一起掉。',
            '每日缺口不超過 500 大卡；停滯先檢查步數與睡眠，不要一路往下砍。',
        ],
    },
    {
        id: 'endurance',
        kicker: 'ENDURANCE',
        label: '跑步表現',
        sub: '把距離跑出來，配速穩下來',
        blurb: '每週一趟強度課、其餘輕鬆跑，每 4 週減量一次。重訓只做防傷與經濟性。',
        moduleRoles: { strength: 'support', run: 'core', nutrition: 'support' },
        roleReason: {
            strength: '防傷與跑步經濟性的保險，不是拿來練大的。',
            run: '這一期的主課，所有安排都繞著它轉。',
            nutrition: '不做大幅赤字：能量不足會先犧牲恢復與免疫。',
        },
        coachNotes: [
            '八成輕鬆、兩成辛苦（80/20）。輕鬆跑跑太快是業餘跑者最常見的錯誤。',
            '重訓走大重量低次數（4–6 下），練的是神經與經濟性不是肌肥大 —— 別練到腿廢掉隔天跑不動。',
            '每 4 週減量一週，週量砍 30–40%，適應是在減量週長出來的。',
            '這一期不做大幅熱量赤字；長距離日之前要吃夠碳水。',
        ],
    },
    {
        id: 'hybrid',
        kicker: 'HYBRID',
        label: '跑步 × 重訓 雙主課',
        sub: '兩邊都想練，不想放掉任何一邊',
        blurb: '跑步與重訓各佔一半。關鍵不在練多少，在兩邊不要互相踩到。',
        caveat: 'HYROX 專項站（雪橇、SkiErg、壁球投、沙袋）動作庫沒有，這一期練的是底子。',
        moduleRoles: { strength: 'core', run: 'core', nutrition: 'support' },
        roleReason: {
            strength: '雙主課之一：力量與肌耐力，不是拿來當跑步的配菜。',
            run: '雙主課之一：維持週量與有氧引擎。',
            nutrition: '熱量抓在維持 —— 這種訓練量下做赤字，兩邊表現會一起掉。',
        },
        coachNotes: [
            '兩邊都是主課，所以排課順序最重要：強度跑與重腿日至少隔一天。',
            '同一天要做兩項時，先做這一期比較在意的那一項，中間至少隔 6 小時。',
            '有氧以輕鬆跑為主，間歇一週最多一次 —— 否則會兩邊都練不起來。',
            '這種訓練量下不做熱量赤字；睡不飽的那週先砍跑步的強度課，不要砍重訓的重量。',
        ],
    },
];

export const getFocusOption = (id) => FOCUS_OPTIONS.find((f) => f.id === id) || null;

/**
 * 三個項目的預設勾選狀態 —— 只用註冊時填的訓練路線決定「一開始勾什麼」，
 * 使用者在頁面上改過之後就以他的選擇為準。
 */
export function defaultInclude(path = 'full') {
    return {
        run: path !== 'lifting_only',
        strength: path !== 'cardio_only',
        nutrition: true,
    };
}

// ══════════════════════════════════════════════════════════════════════
// 2 · 每週訓練負荷法典
// ══════════════════════════════════════════════════════════════════════

/** 全域硬上限：每週至少留 1 天完全休息，任何目標都不得突破。 */
export const HARD_MAX_TOTAL_DAYS = 6;

/** 各目標的建議上限與最低休息日（restDays = 7 − 實際出門天數）。 */
export const FOCUS_LOAD_LAW = {
    habit: { maxTotalDays: 4, minRestDays: 3, primary: 'balanced' },
    shape: { maxTotalDays: 5, minRestDays: 2, primary: 'strength' },
    build: { maxTotalDays: 6, minRestDays: 1, primary: 'strength' },
    lean: { maxTotalDays: 6, minRestDays: 1, primary: 'strength' },
    endurance: { maxTotalDays: 6, minRestDays: 1, primary: 'run' },
    hybrid: { maxTotalDays: 6, minRestDays: 1, primary: 'balanced' },
};

export const getFocusLaw = (focusId) => FOCUS_LOAD_LAW[focusId] || FOCUS_LOAD_LAW.shape;

/** 新手的總負荷上限比等級法典再保守一階（法典管的是重訓，這裡管的是總天數）。 */
const LEVEL_TOTAL_CAP = { beginner: 4, intermediate: 6, advanced: 6 };

/**
 * 基礎配額：目標 → 三項的起始參數。
 * muscleOrder = 目標肌群的推薦順序，會依等級法典的 maxMuscleTags 取前 N 個
 * 當作「均衡預設」帶進重訓 wizard —— 使用者進去照樣能改。
 */
const BASE_SPLIT = {
    habit: {
        strengthDays: 2, runSessions: 2, runGoal: 'aerobic_base', totalWeeks: 8,
        style: 'bodybuilding', muscleOrder: ['legs', 'back', 'core', 'chest', 'shoulders', 'arms'],
    },
    shape: {
        strengthDays: 3, runSessions: 2, runGoal: 'aerobic_base', totalWeeks: 8,
        style: 'bodybuilding', muscleOrder: ['legs', 'back', 'chest', 'shoulders', 'core', 'arms'],
    },
    build: {
        strengthDays: 4, runSessions: 2, runGoal: 'aerobic_base', totalWeeks: 8,
        style: 'bodybuilding', muscleOrder: ['legs', 'back', 'chest', 'shoulders', 'arms', 'core'],
    },
    lean: {
        strengthDays: 3, runSessions: 3, runGoal: 'fat_loss', totalWeeks: 8,
        style: 'bodybuilding', muscleOrder: ['legs', 'back', 'chest', 'shoulders', 'core', 'arms'],
    },
    endurance: {
        strengthDays: 2, runSessions: 4, runGoal: 'race_5k_10k', totalWeeks: 12,
        style: 'strength', muscleOrder: ['legs', 'core', 'back', 'shoulders', 'chest', 'arms'],
    },
    hybrid: {
        strengthDays: 3, runSessions: 3, runGoal: 'race_5k_10k', totalWeeks: 12,
        style: 'strength', muscleOrder: ['legs', 'back', 'core', 'shoulders', 'chest', 'arms'],
    },
};

/**
 * 依目標 / 程度 / 訓練路線，分配一週的重訓天數與跑步趟數。
 *
 * 演算法（每一步都會記錄在 adjustments，讓使用者看得到為什麼被砍）：
 *   ① 取目標的基礎配額
 *   ② 依訓練路線與「使用者要不要這一項」歸零
 *   ③ 套重訓等級法典上限（新手 4 / 中階 5 / 高階 5）
 *   ④ 若「重訓天數 ＋ 跑步趟數」超過上限：先砍配角，砍到底才砍主角
 *   ⑤ 仍超標 → 把配角的其中幾趟併到重訓日（同日只允許輕鬆跑，不排強度）
 *
 * @returns {{strengthDays:number, runSessions:number, sharedDays:number,
 *            totalDays:number, restDays:number, adjustments:string[]}}
 */
export function resolveWeeklySplit({
    focusId = 'shape', level = 'beginner', path = 'full', include = null,
} = {}) {
    const base = BASE_SPLIT[focusId] || BASE_SPLIT.shape;
    const law = getFocusLaw(focusId);
    const adjustments = [];

    // 🔑 使用者在這一頁勾的（include）才是權威；註冊時填的訓練路線只負責決定「預設勾什麼」。
    //    否則會發生「選了雙主課、重訓也開著，卻因為舊的 cardio_only 設定排出 0 天重訓」。
    const hasLift = include
        ? include.strength !== false
        : (path === 'full' || path === 'lifting_only');
    const hasRun = include
        ? include.run !== false
        : (path === 'full' || path === 'cardio_only');

    let strengthDays = hasLift ? base.strengthDays : 0;
    let runSessions = hasRun ? base.runSessions : 0;

    if (!hasLift && base.strengthDays > 0) adjustments.push('這一期沒有排重訓。');
    if (!hasRun && base.runSessions > 0) adjustments.push('這一期沒有排跑步。');

    // ③ 重訓等級法典（單一真相源：UnifiedTrainingEngine.getLevelCode）
    const levelLaw = getLevelCode(level);
    if (strengthDays > levelLaw.maxDaysPerWeek) {
        adjustments.push(`${levelLaw.label}階段每週重訓上限 ${levelLaw.maxDaysPerWeek} 天，重訓從 ${strengthDays} 天調到 ${levelLaw.maxDaysPerWeek} 天。`);
        strengthDays = levelLaw.maxDaysPerWeek;
    }

    // ④ 總天數收斂
    const capByLevel = LEVEL_TOTAL_CAP[level] ?? HARD_MAX_TOTAL_DAYS;
    const maxTotal = Math.min(law.maxTotalDays, 7 - law.minRestDays, capByLevel, HARD_MAX_TOTAL_DAYS);

    // 下限：
    //   · 重訓永遠 ≥2 天 —— ACSM 對成人的阻力訓練建議是每週至少 2 天。
    //   · 跑步在「不是主角」時可以砍到 1 趟：總天數吃緊時，寧可保住主角的
    //     訓練效果，也不要兩邊都稀釋成沒有刺激的量。
    const minStrength = hasLift ? 2 : 0;
    const minRun = hasRun
        ? (law.primary === 'run' || law.primary === 'balanced' ? 2 : 1)
        : 0;

    const shrink = (whichFirst) => {
        const order = whichFirst === 'strength'
            ? ['run', 'strength']
            : whichFirst === 'run'
                ? ['strength', 'run']
                // balanced：先砍多的那一項；一樣多時砍跑步（重訓是核心迴圈，優先保住）
                : (runSessions >= strengthDays ? ['run', 'strength'] : ['strength', 'run']);
        for (const target of order) {
            while (strengthDays + runSessions > maxTotal) {
                if (target === 'run' && runSessions > minRun) runSessions -= 1;
                else if (target === 'strength' && strengthDays > minStrength) strengthDays -= 1;
                else break;
            }
        }
    };
    const before = { s: strengthDays, r: runSessions };
    shrink(law.primary);
    if (before.s !== strengthDays || before.r !== runSessions) {
        adjustments.push(`每週最多 ${maxTotal} 天出門（至少留 ${7 - maxTotal} 天完全休息），已調整為重訓 ${strengthDays} 天 × 跑步 ${runSessions} 趟。`);
    }

    // ⑤ 還是塞不下 → 同日合併（重訓日的跑步只排輕鬆跑，先重訓後跑）
    let sharedDays = 0;
    if (strengthDays + runSessions > maxTotal) {
        sharedDays = Math.min(strengthDays, strengthDays + runSessions - maxTotal);
        adjustments.push(`有 ${sharedDays} 天會是「重訓 ＋ 輕鬆跑」同一天：先重訓再跑，那天不排強度課，避免同期訓練互相吃掉適應。`);
    }

    const totalDays = Math.min(7, strengthDays + runSessions - sharedDays);
    return {
        strengthDays,
        runSessions,
        sharedDays,
        totalDays,
        restDays: Math.max(0, 7 - totalDays),
        totalWeeks: base.totalWeeks,
        adjustments,
    };
}

export const WEEKDAY_LABEL = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * buildWeekPattern —— 把「重訓 N 天 ＋ 跑步 M 趟」攤成看得見的一週。
 *
 * 排法有兩條真的規則，不是隨便填格子：
 *   ① 訓練日平均攤開 —— 休息日夾在中間才有恢復意義，全部擠在週末等於沒休。
 *   ② 重訓與跑步交錯 —— 同一種連兩天會把疲勞疊在同一套系統上（同期訓練干擾）。
 * 回傳長度 7 的陣列（週一到週日）：'strength' | 'run' | 'rest'。
 */
export function buildWeekPattern({ strengthDays = 0, runSessions = 0 } = {}) {
    const N = 7;
    const slots = Array(N).fill('rest');
    let s = Math.max(0, Math.min(N, Number(strengthDays) || 0));
    let r = Math.max(0, Math.min(N, Number(runSessions) || 0));
    const total = Math.min(N, s + r);
    if (total <= 0) return slots;

    // ① 平均鋪開訓練日
    const used = new Set();
    const days = [];
    for (let i = 0; i < total; i++) {
        let d = Math.round((i * N) / total) % N;
        while (used.has(d)) d = (d + 1) % N;
        used.add(d);
        days.push(d);
    }
    days.sort((a, b) => a - b);

    // ② 交錯填入，份量多的那一項先卡位
    let prev = null;
    const preferStrength = s >= r;
    for (const d of days) {
        let pick;
        if (s > 0 && r > 0) {
            pick = prev === 'strength' ? 'run' : prev === 'run' ? 'strength' : (preferStrength ? 'strength' : 'run');
        } else {
            pick = s > 0 ? 'strength' : 'run';
        }
        if (pick === 'strength' && s === 0) pick = 'run';
        if (pick === 'run' && r === 0) pick = 'strength';
        if (pick === 'strength') s -= 1; else r -= 1;
        slots[d] = pick;
        prev = pick;
    }
    return slots;
}

// ══════════════════════════════════════════════════════════════════════
// 3 · InBody 閘門（營養處方的前置條件）
// ══════════════════════════════════════════════════════════════════════

/** 超過這個天數的量測，不足以支撐「這一期」的熱量處方 → 建議重量一次。 */
export const INBODY_STALE_DAYS = 30;

const normalizeInBody = (r) => {
    if (!r) return null;
    const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
        date: r.measurement_date || r.date || r.created_at || null,
        weight: num(r.weight_kg ?? r.weight),
        bodyFat: num(r.body_fat_percent ?? r.body_fat_percentage),
        smm: num(r.smm ?? r.skeletal_muscle_mass ?? r.muscle_mass),
    };
};

/** 讀最新一筆 InBody（與營養／健身預測同一份資料源：inbody_local_<uid>）。 */
export function readLatestInBody(userId) {
    try {
        const arr = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const sorted = [...arr].sort(
            (a, b) => new Date(b.measurement_date || b.date || b.created_at || 0)
                - new Date(a.measurement_date || a.date || a.created_at || 0)
        );
        const latest = normalizeInBody(sorted[0]);
        return latest?.weight ? latest : null;
    } catch {
        return null;
    }
}

/**
 * 營養處方的資料閘門。
 * @returns {{status:'missing'|'stale'|'ok', ageDays:number|null, record:object|null, message:string}}
 */
export function evaluateInBodyGate(userId) {
    const record = readLatestInBody(userId);
    if (!record) {
        return {
            status: 'missing',
            ageDays: null,
            record: null,
            message: '還沒量過體組成。填一次體重與體脂，熱量與蛋白質才算得準；現在只能給預估值。',
        };
    }
    const t = new Date(record.date || 0).getTime();
    const ageDays = Number.isFinite(t) && t > 0
        ? Math.floor((Date.now() - t) / 86400000)
        : null;
    if (ageDays == null || ageDays > INBODY_STALE_DAYS) {
        return {
            status: 'stale',
            ageDays,
            record,
            message: ageDays == null
                ? '最新一筆量測沒有日期，建議重量一次再開熱量處方。'
                : `最新一筆量測是 ${ageDays} 天前。體重與體脂已經可能不同了，建議更新後再開這一期的熱量。`,
        };
    }
    return { status: 'ok', ageDays, record, message: `體組成資料是 ${ageDays} 天前量的，可以直接用。` };
}

// ══════════════════════════════════════════════════════════════════════
// 4 · 三項處方
// ══════════════════════════════════════════════════════════════════════

/**
 * 依目標與體脂率決定營養策略（app 內既有三檔：cut / recomp / bulk）。
 * 沒有體脂資料 → 回中性選擇並標記 estimated。
 */
function resolveNutritionGoalType({ focusId, bodyFat, gender }) {
    const female = String(gender || '').toLowerCase().startsWith('f') || gender === '女';
    const highBF = female ? 30 : 21;
    const lowBF = female ? 22 : 13;

    // 目標本身就決定方向的兩個
    if (focusId === 'lean') {
        if (bodyFat == null) return { goalType: 'cut', reason: '減脂期走熱量赤字。還沒量過體組成，先用估算值，量測後會重算。' };
        return bodyFat <= lowBF
            ? { goalType: 'recomp', reason: `體脂已經 ${bodyFat}%，再切下去會掉肌肉。改用維持附近的熱量做身體重組。` }
            : { goalType: 'cut', reason: `體脂 ${bodyFat}%，用每日約 −400 kcal 的赤字往下切，蛋白質拉高保住肌肉。` };
    }
    if (focusId === 'habit' || focusId === 'shape' || focusId === 'hybrid' || focusId === 'endurance') {
        if (bodyFat != null && bodyFat >= highBF && focusId !== 'endurance' && focusId !== 'hybrid') {
            return { goalType: 'cut', reason: `體脂 ${bodyFat}% 偏高，先做小幅赤字，訓練表現與關節負擔都會改善。` };
        }
        return {
            goalType: 'recomp',
            reason: focusId === 'endurance' || focusId === 'hybrid'
                ? '賽事取向不做大幅赤字，熱量抓在維持附近確保訓練吃得消。'
                : '熱量抓在維持附近搭配高蛋白，體重穩住、體組成慢慢往好的方向走。',
        };
    }
    // build
    if (bodyFat == null) return { goalType: 'recomp', reason: '沒有體脂資料，先給中性的維持偏微赤字，量測後會重算。' };
    if (bodyFat >= highBF) return { goalType: 'cut', reason: `體脂 ${bodyFat}% 偏高，先把體脂降下來再堆肌肉會更有效率。` };
    if (bodyFat <= lowBF) return { goalType: 'bulk', reason: `體脂 ${bodyFat}% 已經夠低，這一期可以吃到小幅盈餘專心長肌肉。` };
    return { goalType: 'recomp', reason: `體脂 ${bodyFat}% 在中段，用維持附近的熱量搭配高蛋白做身體重組。` };
}

const GOAL_TYPE_META = {
    cut: { label: '減脂', kcalBias: -400, proteinPerKg: 2.2 },
    recomp: { label: '身體重組', kcalBias: -100, proteinPerKg: 2.0 },
    bulk: { label: '增肌', kcalBias: 250, proteinPerKg: 1.8 },
};

const RUN_GOAL_LABEL = {
    fat_loss: '減脂燃燒',
    aerobic_base: '有氧基礎',
    race_5k_10k: '5K / 10K',
    race_half: '半程馬拉松',
    race_full: '全程馬拉松',
};

const STYLE_LABEL = { bodybuilding: '肌肥大', strength: '力量 / 功能性' };
const LEVEL_LABEL = { beginner: '新手', intermediate: '中階', advanced: '高階' };
export const MUSCLE_LABEL = {
    chest: '胸', back: '背', shoulders: '肩', arms: '手臂', core: '核心', legs: '腿', glutes: '臀',
};

/**
 * 主函式：目標 → 三項處方。
 * @param {object} p
 * @param {string} p.focusId   FOCUS_OPTIONS.id
 * @param {string} p.level     beginner | intermediate | advanced
 * @param {string} p.path      full | lifting_only | cardio_only
 * @param {object} p.include   { run, strength, nutrition } —— 使用者要不要這一項
 * @param {string} p.userId    用來讀 InBody（可省略 → 營養處方標為預估）
 */
export function buildFocusPlan({
    focusId: rawFocusId = 'shape',
    level = 'beginner',
    path = 'full',
    include = null,
    userId = null,
    gender = '',
    weightKg = null,
} = {}) {
    // 先正規化：認不得的 id（例如舊版存檔）一律退回第一個目標，
    // 而且後面每一段都用同一個 focusId —— 避免「標題寫 A、參數用 B」的錯搭。
    const focus = getFocusOption(rawFocusId) || FOCUS_OPTIONS[0];
    const focusId = focus.id;
    const base = BASE_SPLIT[focusId];
    const split = resolveWeeklySplit({ focusId, level, path, include });

    /* 每個系統用自己的自然長度，不互相遷就（見檔頭「三個系統各跑各的週期」）。
       共同起點取「按下開始設定那一天」(setupAt) —— 不能用 new Date()：
       那會變成「每次重新 render 的今天」，週一設跑步、週五設重訓就各記一天。 */
    const planWeeks = base.totalWeeks;
    const startDate = (userId ? readFocusRaw(userId)?.setupAt : null) || toDayKey(new Date());

    const gate = userId ? evaluateInBodyGate(userId) : { status: 'missing', ageDays: null, record: null, message: '' };
    const bodyFat = gate.record?.bodyFat ?? null;
    const bodyWeight = gate.record?.weight ?? (Number(weightKg) || null);
    const { goalType, reason } = resolveNutritionGoalType({ focusId, bodyFat, gender });
    const meta = GOAL_TYPE_META[goalType];
    const proteinG = bodyWeight ? Math.round(bodyWeight * meta.proteinPerKg) : null;

    const runGoal = base.runGoal;
    const trainingStyle = level === 'beginner' ? 'bodybuilding' : base.style;
    // 單次時長讀等級法典（新手 50 / 中階 60 / 高階 75），不另外編一組數字
    const levelLaw = getLevelCode(level);
    const sessionMins = levelLaw.sessionMins;
    // 均衡預設：依目標的優先順序取前 N 個部位（N = 等級法典的標籤上限）
    const targetMuscles = base.muscleOrder.slice(0, levelLaw.maxMuscleTags || 4);
    const muscleText = targetMuscles.map((m) => MUSCLE_LABEL[m] || m).join('、');

    const wantNutrition = include ? include.nutrition !== false : true;

    const modules = [
        split.runSessions > 0 && {
            key: 'run',
            title: '跑步',
            headline: `${RUN_GOAL_LABEL[runGoal] || runGoal} · 每週 ${split.runSessions} 趟`,
            detail: focusId === 'endurance' || focusId === 'hybrid'
                ? `${planWeeks} 週：每週 1 趟強度課、其餘輕鬆跑，週量每 4 週減量一次。`
                : focusId === 'lean'
                    ? `${planWeeks} 週：Z2 慢跑堆燃脂時間，搭配短版間歇拉後燃。`
                    : `${planWeeks} 週：八成以上輕鬆跑，讓同樣配速的心率降下來。`,
            route: '/cardio-plan-builder',
            role: focus.moduleRoles?.run || 'support',
            roleReason: focus.roleReason?.run || '',
            stats: [
                { value: split.runSessions, unit: '趟／週', accent: true },
                { value: planWeeks, unit: '週' },
            ],
            params: [
                ['課表類型', RUN_GOAL_LABEL[runGoal] || runGoal],
                ['程度', LEVEL_LABEL[level] || level],
            ],
            seed: {
                goal: runGoal,
                sessionsPerWeek: split.runSessions,
                totalWeeks: planWeeks,     // 跑步自己的長度（比賽/目標決定）
                startDate,                 // 這一次設定的共同起點
                currentLevel: level,
                includeStrength: split.strengthDays > 0,
            },
        },
        split.strengthDays > 0 && {
            key: 'strength',
            title: '重訓',
            headline: `${STYLE_LABEL[trainingStyle]} · 每週 ${split.strengthDays} 天`,
            detail: focusId === 'habit'
                ? `全身均衡，先把 ${muscleText} 的基本動作模式練熟，不追求力竭。`
                : focusId === 'endurance'
                    ? `重訓是保養：${muscleText} 的複合動作維持力量，不追加量。`
                    : focusId === 'lean'
                        ? `赤字期靠重訓保肌：重量盡量不降，靠減少組數控制疲勞，重點 ${muscleText}。`
                        : focusId === 'hybrid'
                            ? `大重量複合動作 ＋ 推拉搬運，重點 ${muscleText}，練得動也跑得動。`
                            : `${STYLE_LABEL[trainingStyle]}為主，重點 ${muscleText}，每個部位每週練到 1–2 次、逐週加重。`,
            route: '/workout-plan-mobile',
            role: focus.moduleRoles?.strength || 'support',
            roleReason: focus.roleReason?.strength || '',
            stats: [
                { value: split.strengthDays, unit: '天／週', accent: true },
                { value: sessionMins, unit: '分／次' },
            ],
            params: [
                ['訓練風格', STYLE_LABEL[trainingStyle]],
                ['預設部位', `${muscleText}（可改）`],
                ['程度', LEVEL_LABEL[level] || level],
                ['一個區塊', `${CYCLE_BLOCK_WEEKS} 週（Base → Build → Peak → Deload）`],
            ],
            seed: {
                daysPerWeek: split.strengthDays,
                trainingStyle,
                level,
                equipment: 'mixed',
                targetMuscles,
                // 重訓引擎一次產 4 週（Base→Build→Peak→Deload），這是它的自然週期。
                // 練完一輪用它現成的「繼續下一季」加重，不受其他系統的長度影響。
                startDate,
            },
        },
        wantNutrition && {
            key: 'nutrition',
            title: '營養',
            headline: proteinG
                ? `${meta.label} · 蛋白質 ${proteinG} g／日`
                : `${meta.label} · 待量測後給出數字`,
            detail: reason,
            route: '/nutrition-mobile',
            role: focus.moduleRoles?.nutrition || 'support',
            roleReason: focus.roleReason?.nutrition || '',
            stats: [
                { value: meta.kcalBias > 0 ? `+${meta.kcalBias}` : `${meta.kcalBias}`, unit: 'kcal／日', accent: true },
                { value: proteinG ?? '—', unit: 'g 蛋白質' },
            ],
            params: [
                ['策略', meta.label],
                ['達標日', '依你設的速度自己算'],
                ['資料來源', gate.status === 'ok' ? `InBody · ${gate.ageDays} 天前` : '尚無實測，數字為預估'],
            ],
            seed: {
                goalType,
                kcalBias: meta.kcalBias,
                proteinPerKg: meta.proteinPerKg,
                /* 不指定達標日：減 10 公斤本來就要 20 週，
                   蓋一個日期不會讓它變快，只會顯示一個處方到不了的數字。
                   達標日由 pace 與目標體重自己算。 */
            },
            gate,
            estimated: gate.status !== 'ok',
        },
    ].filter(Boolean);

    const outMins = split.strengthDays * sessionMins + split.runSessions * 40;
    const narrative = split.totalDays === 0
        ? '這一期沒有排任何訓練項目。'
        : `一週出門 ${split.totalDays} 天、留 ${split.restDays} 天休息，約 ${Math.max(1, Math.round(outMins / 60))} 小時。`;

    return {
        focus,
        focusId,
        level,
        path,
        split,
        startDate,
        modules,
        narrative,
        coachNotes: focus.coachNotes || [],
        caveat: focus.caveat || null,
        headline: `${focus.label} · 重訓 ${split.strengthDays} 天 × 跑步 ${split.runSessions} 趟`,
        generatedAt: new Date().toISOString(),
    };
}

// ══════════════════════════════════════════════════════════════════════
// 5 · 天數守門（給沒走引導流程、自己設計計劃的人）
// ══════════════════════════════════════════════════════════════════════

/**
 * 跨系統的每週天數合理性檢查。
 * @returns {{severity:'ok'|'warn'|'block', totalDays:number, restDays:number,
 *            maxTotal:number, title:string, message:string}}
 */
export function checkWeeklyLoad({ strengthDays = 0, runSessions = 0, level = 'beginner', focusId = null } = {}) {
    const total = Math.max(0, Number(strengthDays) || 0) + Math.max(0, Number(runSessions) || 0);
    const law = focusId ? getFocusLaw(focusId) : null;
    const capByLevel = LEVEL_TOTAL_CAP[level] ?? HARD_MAX_TOTAL_DAYS;
    const maxTotal = Math.min(
        law ? law.maxTotalDays : HARD_MAX_TOTAL_DAYS,
        capByLevel,
        HARD_MAX_TOTAL_DAYS
    );
    const restDays = Math.max(0, 7 - total);

    if (total >= 7) {
        return {
            severity: 'block',
            totalDays: total,
            restDays: 0,
            maxTotal,
            title: `每週安排 ${total} 次訓練`,
            /* ⚠️ 這句會直接印在中控台的提示卡上，卡寬只有 ~318px。
               原本三行的說明（含「肌肉是在休息時長的」這種原理）在手機上是一整塊字，
               正是「小字太多」的來源。理由留給 `?`，這裡只講結論。 */
            message: '請調整課表，每週至少保留 1 天休息',
        };
    }
    if (total > maxTotal) {
        return {
            severity: 'warn',
            totalDays: total,
            restDays,
            maxTotal,
            title: `每週共 ${total} 次訓練，建議減量`,
            message: `重訓與跑步合計，建議減至 ${maxTotal} 次`,
        };
    }
    if (strengthDays >= 4 && runSessions >= 4) {
        return {
            severity: 'warn',
            totalDays: total,
            restDays,
            maxTotal,
            title: '兩邊都開到最大',
            message: '挑一項當主角，另一項降一天',
        };
    }
    return { severity: 'ok', totalDays: total, restDays, maxTotal, title: '', message: '' };
}

// ══════════════════════════════════════════════════════════════════════
// 6 · 儲存（per-user key）＋ 三項完成狀態（讀真實存檔）
// ══════════════════════════════════════════════════════════════════════

const FOCUS_KEY = (uid) => `drvn_training_focus_${uid || 'guest'}`;

/** 讀使用者目前的目標；沒設過回 null（呼叫端要顯示誠實空狀態）。 */
export function loadTrainingFocus(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(FOCUS_KEY(userId)) || 'null');
        if (raw && getFocusOption(raw.focusId)) return raw;
    } catch { /* 髒資料 → 當成沒設過 */ }
    return null;
}

/** 寫入／更新目標（會保留既有欄位）。 */
export function saveTrainingFocus(userId, patch = {}) {
    const next = { ...(readFocusRaw(userId) || {}), ...patch, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(FOCUS_KEY(userId), JSON.stringify(next)); } catch { /* 容量滿 → 不阻擋流程 */ }
    return next;
}

// ══════════════════════════════════════════════════════════════════════
// 統一週期 —— 三個系統同一天開始、同一天結束
// ══════════════════════════════════════════════════════════════════════
/*
 * 三個系統各跑各的週期，不互相遷就。
 *
 * 因為它們的長度天生就不一樣，而且是被不同的東西決定的：
 *   · 重訓 —— 4 週一個區塊（Base→Build→Peak→Deload），週期化訓練的最小完整單位
 *   · 跑步 —— 8–14 週，通常綁比賽日
 *   · 營養 —— 綁體組成距離：減 10 公斤本來就要 20 週，跟訓練節奏無關
 * 硬拉成同一天結束，一定有一項要被迫說謊（重訓跑半個區塊、或營養顯示一個
 * 處方到不了的達標日）。
 *
 * 真正該共用的是「每週總負荷」—— 那是週的事，跟週期長度無關，
 * 由 checkWeeklyLoad 負責，本來就在跑。
 *
 * 所以這裡的角色是**中控台**：讀三個系統各自的計劃，算各自走到第幾週、
 * 誰結束了該去結算。使用者隨時進來都看得到全貌，不用等到某個共同的日子。
 */
/* 週期不透過 loadTrainingFocus 讀 —— 那支會因為 focusId 認不得就整筆回 null，
   等於一個壞掉的目標代號會把週期一起弄不見。週期是獨立的事實，分開讀。 */
function readFocusRaw(userId) {
    try { return JSON.parse(localStorage.getItem(FOCUS_KEY(userId)) || 'null'); }
    catch { return null; }
}

export const CYCLE_BLOCK_WEEKS = 4;
const REVIEW_KEY = (uid) => `drvn_focus_reviewed_${uid || 'guest'}`;
const DAY_MS = 86400000;

const toDayKey = (d) => {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};
const parseDayKey = (s) => {
    if (!s) return null;
    const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * 這一期走到哪了。沒開始過就回 null —— 不假裝有週期。
 * @returns {{weeks, startDate, endDate, weekIndex, totalWeeks, daysLeft, finished, blocks}|null}
 */
/** 把「起始日 ＋ 幾週」換算成進度。讀不到就回 null，不虛報。 */
function toCycle(startRaw, weeks, today) {
    const start = startRaw instanceof Date ? startRaw : parseDayKey(startRaw);
    const w = Number(weeks) || 0;
    if (!start || Number.isNaN(start.getTime()) || w <= 0) return null;
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getTime() + w * 7 * DAY_MS);
    const elapsed = Math.floor((now - start) / DAY_MS);
    return {
        weeks: w,
        startDate: toDayKey(start),
        endDate: toDayKey(end),
        weekIndex: Math.min(w, Math.max(1, Math.floor(elapsed / 7) + 1)),
        daysLeft: Math.max(0, Math.ceil((end - now) / DAY_MS)),
        finished: now >= end,
    };
}

// readJSON 已統一改用 safeStorage 的版本（支援 fallback，且會清除損壞資料）

/* 跑步計劃存在後端，本地只有「本週跑步磚」的快取（沒有起訖日）。
   中控台要算週期就得有起始日與週數，所以在「存檔」與「抓到最新計劃」兩個
   時機把這兩個欄位快取下來。這是衍生快取不是第二份真相：只存兩個數字，
   來源永遠是後端那份計劃。 */
const RUN_CYCLE_KEY = (uid) => `drvn_run_cycle_${uid || 'guest'}`;

export function cacheRunCycle(userId, plan) {
    const startDate = plan?.start_date || plan?.startDate || null;
    const weeks = Number(plan?.total_weeks) || plan?.weeks?.length || 0;
    if (!startDate || !weeks) return null;
    const meta = {
        startDate: String(startDate).slice(0, 10), weeks,
        planId: plan?.plan_id || plan?.id || null,
        goal: plan?.goal || plan?.meta?.goal || null,
        sourceCourse: plan?.source_course || null,
    };
    try { localStorage.setItem(RUN_CYCLE_KEY(userId), JSON.stringify(meta)); } catch { /* */ }
    return meta;
}

export function clearRunCycle(userId) {
    try { localStorage.removeItem(RUN_CYCLE_KEY(userId)); } catch { /* */ }
}

/** 中控只報告實際連結，不因兩邊名稱相同就認定是同一套裝。 */
export function readTrainingLinkage(userId) {
    const strength = readJSON(`currentPlan_${userId}`);
    const run = readJSON(RUN_CYCLE_KEY(userId));
    if (!strength?.source_course) return null;
    const name = strength.source_course.name || '目前套裝';
    if (strength.linked_cardio_plan_id) {
        const linked = strength.linked_cardio_plan_id === run?.planId;
        return {
            status: linked ? 'linked' : 'separated',
            /* 印在中控台的提示卡上，一行講完就好 —— 細節在下面的週課表裡看得到。 */
            message: linked
                ? `「${name}」的健身與跑步已連接`
                : `「${name}」搭配的跑步計劃還沒連接`,
        };
    }
    if (strength.courseSystem === 'hybrid') {
        return { status: 'external', message: run?.planId
            ? `「${name}」沿用目前的跑步計劃`
            : `「${name}」還需要一份跑步計劃` };
    }
    return { status: 'strength', message: `「${name}」只管健身，跑步各走各的` };
}

/**
 * 中控台的資料來源：三個系統各自的週期，各算各的。
 *
 * 全部讀該系統自己的存檔，不另外記一份 —— 記兩份就會有兩份不一樣的真相。
 *   · 跑步 —— u_<uid>_onboarding_cardio_plan：start_date ＋ total_weeks（或週數）
 *   · 重訓 —— currentPlan_<uid>：startDate / created_at ＋ weeks.length（引擎固定 4）
 *   · 營養 —— drvn_nutrition_plan_<uid>：committedAt ＋ etaDate（依 pace 算出的達標日）
 *
 * @returns {{run:cycle|null, strength:cycle|null, nutrition:cycle|null}}
 */
export function readSystemCycles(userId, today = new Date()) {
    const runPlan = readJSON(`u_${userId}_onboarding_cardio_plan`);
    const liftPlan = readJSON(`currentPlan_${userId}`);
    const nutriPlan = readJSON(`drvn_nutrition_plan_${userId}`);

    /* 現行計劃的週期快取優先。註冊流程那份 u_<uid>_onboarding_cardio_plan
       只在「還沒存進後端」的空窗期有意義，而且之後永遠不會再被更新 ——
       讓它優先的話，使用者換過幾次計劃，中控台還是顯示註冊那天那一份。 */
    const runMeta = readJSON(RUN_CYCLE_KEY(userId));
    const run = runMeta
        ? toCycle(runMeta.startDate, runMeta.weeks, today)
        : runPlan?.weeks?.length
            ? toCycle(
                runPlan.start_date || runPlan.startDate,
                runPlan.total_weeks || runPlan.meta?.totals?.total_weeks || runPlan.weeks.length,
                today
            )
            : null;

    const strength = liftPlan?.weeks?.length
        ? (() => {
            const c = toCycle(
                liftPlan.startDate || liftPlan.start_date || liftPlan.created_at,
                liftPlan.weeks.length,
                today
            );
            if (!c) return null;
            // 重訓是一季一季（4 週一個區塊）往下走的，季數要顯示出來
            let season = Number(liftPlan.season) || 0;
            if (!season) {
                try { season = Number(localStorage.getItem(`season_${userId}`)) || 1; } catch { season = 1; }
            }
            return { ...c, season };
        })()
        : null;

    // 營養的長度 = 承諾日到達標日；達標日是 pace 與目標體重自己算出來的，不是我們指定的
    let nutrition = null;
    if (nutriPlan?.goalType && nutriPlan.committedAt) {
        // committedAt 是 epoch 毫秒 → 先切到當天午夜，才跟另外兩個系統同基準
        const c = new Date(nutriPlan.committedAt);
        const startedAt = new Date(c.getFullYear(), c.getMonth(), c.getDate());
        const eta = nutriPlan.etaDate ? new Date(nutriPlan.etaDate) : null;
        /* 達標日早於承諾日 = 沿用了舊的手動日期，那是壞資料。
           clamp 成 1 週只會顯示一個假的「第 1 / 1 週」然後七天後說跑完了 ——
           寧可不顯示週期，也不要編一個。 */
        const spanWeeks = eta && !Number.isNaN(eta.getTime())
            ? Math.round((eta - startedAt) / (7 * DAY_MS))
            : 0;
        nutrition = spanWeeks >= 1 ? toCycle(startedAt, spanWeeks, today) : null;
    }

    return { run, strength, nutrition };
}

/**
 * 中控台的摘要：幾項結束了、下一個什麼時候到、走得最遠的是哪一項。
 * 給首頁入口卡與完成頁用，兩邊講同一句話。
 */
export function summariseCycles(userId, today = new Date()) {
    const cycles = readSystemCycles(userId, today);
    const list = MODULE_KEYS.map((k) => ({ key: k, cycle: cycles[k] })).filter((x) => x.cycle);
    const finished = list.filter((x) => x.cycle.finished);
    const live = list.filter((x) => !x.cycle.finished);
    const soonest = live.length
        ? live.reduce((a, b) => (b.cycle.daysLeft < a.cycle.daysLeft ? b : a))
        : null;
    return {
        cycles,
        total: list.length,
        finishedKeys: finished.map((x) => x.key),
        finishedCount: finished.length,
        liveCount: live.length,
        soonest,
    };
}

export const MODULE_KEYS = ['run', 'strength', 'nutrition'];

const RUN_GOAL_ZH = {
    fat_loss: '減脂燃燒', aerobic_base: '有氧基礎',
    race_5k_10k: '5K / 10K', race_half: '半馬', race_full: '全馬',
};
const PHASE_ZH = { base: '打底', build: '累積', peak: '強化', deload: '減量' };

/**
 * 訓練日的分類縮寫：推 / 拉 / 腿 …
 * 課表本身的名字是「推力強化 (胸・肩・三頭)」這種完整敘述，適合在課表頁看，
 * 但放進中控台的一行摘要或七分之一寬的格子只會被截斷成看不懂的字串。
 * 完整名稱點進課表就有，這裡只要一眼分得出是哪一類。
 */
export const splitLabel = (raw) => {
    const t = String(raw || '');
    if (/推|PUSH/i.test(t)) return '推';
    if (/拉|PULL/i.test(t)) return '拉';
    if (/腿|臀|下肢|LEG|LOWER/i.test(t)) return '腿';
    if (/上肢|UPPER/i.test(t)) return '上肢';
    if (/核心|腹|CORE/i.test(t)) return '核心';
    if (/全身|FULL/i.test(t)) return '全身';
    return t.slice(0, 2) || '重訓';
};
/**
 * 訓練日的短名稱：'A｜單腿與臀 · 骨盆穩定' → '單腿與臀'。
 *
 * splitLabel 壓到 1–2 字，是給七分之一寬的格子用的；這支留 4–6 字，
 * 給「這套一週練什麼」那種一行摘要用 —— 那裡有空間，壓到「腿」反而看不懂。
 * 兩支放在一起，才不會有人又在元件裡自己寫第三套切字規則。
 */
export const focusTitle = (raw) => {
    let t = String(raw || '').trim();
    t = t.replace(/^[A-Z]\s*[｜|·．.-]\s*/i, '');   // 去掉 'A｜' 這種日次前綴
    t = t.split(/\s*[·・]\s*|\s*[（(]/)[0].trim();  // 只留第一個重點
    return t.slice(0, 6) || splitLabel(raw);
};

const NUTRI_ZH = { cut: '減脂', recomp: '身體重組', bulk: '增肌' };

/**
 * 中控台每一列要補的「這一輪在練什麼」。
 * 全部讀各系統自己的存檔算出來，讀不到的欄位就不回傳 —— 寧可少一行，不編數字。
 * @returns {{run:string[], strength:string[], nutrition:string[]}} 每項 2–3 條短句
 */
export function readSystemDetails(userId) {
    const out = { run: [], strength: [], nutrition: [] };

    // ── 跑步：這一輪的課表類型 ＋ 本週趟數與里程（本週跑步磚是真實資料）──
    try {
        const meta = readJSON(RUN_CYCLE_KEY(userId));
        if (meta?.goal) out.run.push(RUN_GOAL_ZH[meta.goal] || meta.goal);
        const bricks = loadCachedBricks(userId) || [];
        const runs = bricks.filter((x) => x && x.distance_km != null);
        if (runs.length) {
            out.run.push(`本週 ${runs.length} 趟`);
            const km = runs.reduce((a, x) => a + (Number(x.distance_km) || 0), 0);
            if (km > 0) out.run.push(`${Math.round(km * 10) / 10} 公里`);
        }
    } catch { /* 讀不到就不顯示 */ }

    // ── 重訓：這一季走到第幾週（區塊裡的階段）＋ 每週天數 ──
    try {
        const plan = readJSON(`currentPlan_${userId}`);
        const weeks = plan?.weeks || [];
        if (weeks.length) {
            let activeWeek = 1;
            for (let w = 0; w < weeks.length; w++) {
                let done = [];
                try { done = JSON.parse(localStorage.getItem(`completed_workouts_${userId}_week${w + 1}`)) || []; }
                catch { done = []; }
                activeWeek = w + 1;
                if (done.length < (weeks[w].days?.length || 0)) break;
            }
            const wk = weeks[activeWeek - 1];
            const phase = String(wk?.name || '').toLowerCase();
            if (PHASE_ZH[phase]) out.strength.push(`${PHASE_ZH[phase]}週`);
            const dayCount = wk?.days?.length || 0;
            if (dayCount) out.strength.push(`每週 ${dayCount} 天`);
            // 這一週練哪些部位 —— 用縮寫，完整名稱在課表頁看
            const focus = [...new Set((wk?.days || [])
                .map((d) => splitLabel(d?.focus || d?.name))
                .filter(Boolean))].slice(0, 4);
            if (focus.length) out.strength.push(focus.join('／'));
        }
    } catch { /* */ }

    // ── 營養：策略 ＋ 每日熱量與蛋白質（都是使用者確認過才存的數字）──
    try {
        const n = readJSON(`drvn_nutrition_plan_${userId}`);
        if (n?.goalType) out.nutrition.push(NUTRI_ZH[n.goalType] || n.goalType);
        const kcal = Number(n?.adjustedIntake) || Number(n?.recommendedIntake) || 0;
        if (kcal > 0) out.nutrition.push(`${Math.round(kcal)} kcal／日`);
        const pro = Number(n?.newProtein) || 0;
        if (pro > 0) out.nutrition.push(`蛋白質 ${Math.round(pro)} g`);
    } catch { /* */ }

    return out;
}

/**
 * 使用者「現在有沒有跑步計劃」，以及這一週幾趟、幾公里。
 *
 * 給掛載型套裝（跑者護甲那種：只寫重訓、跑步沿用使用者原本的）用。
 * 那種課的頁面要回答兩個問題：你有跑步計劃嗎？有的話這週跑幾趟？
 * 沒有就回 null —— 呼叫端據此顯示「先去排跑步計劃」這一個動作，
 * 而不是畫一張空的週曆（介面標準 §5：沒資料就只顯示去把資料補上那件事）。
 *
 * ⚠️ 刻意不回傳「星期幾跑」。跑步計劃有自己的排程，跟這門課的重訓日要怎麼
 *    併成一週，只有中控台算得出來 —— 在這裡猜一份就是第二套排程演算法。
 */
export function readRunCommitment(userId) {
    try {
        const meta = readJSON(RUN_CYCLE_KEY(userId));
        if (!meta?.planId) return null;
        const runs = (loadCachedBricks(userId) || []).filter((x) => x && x.distance_km != null);
        const km = runs.reduce((a, x) => a + (Number(x.distance_km) || 0), 0);
        return {
            planId: meta.planId,
            goalLabel: RUN_GOAL_ZH[meta.goal] || null,
            sessionsPerWeek: runs.length,
            weekKm: km > 0 ? Math.round(km * 10) / 10 : null,
        };
    } catch { return null; }
}

/**
 * 開始一輪設定：蓋一個時間戳，三項的「已檢查」全部歸零。
 * 之後每一次重新走這個流程，都要重新把三個系統看過一遍。
 */
export function beginSetup(userId, today = new Date()) {
    const setupAt = toDayKey(today);
    saveTrainingFocus(userId, { setupAt });
    try { localStorage.setItem(REVIEW_KEY(userId), JSON.stringify({ setupAt })); } catch { /* */ }
    return setupAt;
}

/**
 * 「這一項有沒有被使用者親自進去看過一遍」。
 * 只認這一輪設定的紀錄：重新走一次流程就全部歸零，不讓上一次的已讀矇混過關。
 */
export function readReviewed(userId) {
    const setupAt = readFocusRaw(userId)?.setupAt || null;
    try {
        const raw = JSON.parse(localStorage.getItem(REVIEW_KEY(userId)) || 'null');
        if (raw && raw.setupAt === setupAt) {
            return { run: !!raw.run, strength: !!raw.strength, nutrition: !!raw.nutrition };
        }
    } catch { /* 髒資料 → 當成沒看過 */ }
    return { run: false, strength: false, nutrition: false };
}

export function markReviewed(userId, key) {
    const setupAt = readFocusRaw(userId)?.setupAt || null;
    const next = { ...readReviewed(userId), setupAt, [key]: true };
    try { localStorage.setItem(REVIEW_KEY(userId), JSON.stringify(next)); } catch { /* */ }
    return next;
}

export function clearTrainingFocus(userId) {
    try { localStorage.removeItem(REVIEW_KEY(userId)); } catch { /* */ }
    try { localStorage.removeItem(FOCUS_KEY(userId)); } catch { /* */ }
}

/**
 * 誠實讀「三項是不是真的已經有計劃」——讀真實存檔，不看使用者按過什麼旗標。
 * @returns {{strength:boolean, run:boolean, nutrition:boolean, done:number}}
 */
export function readModuleStatus(userId) {
    const has = (fn) => { try { return !!fn(); } catch { return false; } };

    const strength = has(() => {
        const p = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        return p?.weeks?.length > 0;
    });

    const run = has(() => {
        // 本週跑步磚快取（dailyAgenda 單一真相源）→ 沒有就退回註冊時生成的計劃
        if (loadCachedBricks(userId).length > 0) return true;
        const plan = readJSON(`u_${userId}_onboarding_cardio_plan`, null);
        if (plan?.weeks?.length > 0) return true;
        // 存過計劃就會有週期快取（跑步計劃本體在後端）
        const meta = readJSON(RUN_CYCLE_KEY(userId), null);
        return !!(meta?.startDate && meta?.weeks);
    });

    const nutrition = has(() => {
        const p = readJSON(`drvn_nutrition_plan_${userId}`, null);
        return !!p?.goalType;
    });

    return { strength, run, nutrition, done: [strength, run, nutrition].filter(Boolean).length };
}

/**
 * 目前「已排定」的每週跑步趟數（供跨系統天數守門用）。
 * 優先讀本週跑步磚快取（跑步磚 = 有 distance_km 的 brick），
 * 沒有就退回註冊時生成的計劃第 1 週。讀不到回 0（不猜、不虛報）。
 */
export function readWeeklyRunSessions(userId) {
    try {
        const bricks = loadCachedBricks(userId);
        if (Array.isArray(bricks) && bricks.length) {
            const runs = bricks.filter((b) => b && b.distance_km != null).length;
            if (runs > 0) return runs;
        }
    } catch { /* */ }
    try {
        const plan = JSON.parse(localStorage.getItem(`u_${userId}_onboarding_cardio_plan`) || 'null');
        const w = plan?.weeks?.[0];
        if (w) {
            if (Number.isFinite(w.run_sessions)) return w.run_sessions;
            if (Array.isArray(w.bricks)) return w.bricks.filter((b) => b && b.distance_km != null).length;
        }
    } catch { /* */ }
    return 0;
}

/**
 * 跑步計劃這一週排了幾堂「肌力／功能性」課。
 *
 * 為什麼要讀這個：跑步系統的交叉訓練本來就在練腿（單腿、臀、核心的功能性動作）。
 * 如果重訓那邊又排大腿量，同一組肌肉一週被打兩次，恢復不完 —— 這是三個系統之間
 * 最容易發生、使用者也最看不見的重複。讀不到就回 0，絕不虛報。
 */
export function readRunPlanStrengthSessions(userId) {
    const isStrength = (b) => !!b && (b.subtype === 'strength' || b.type === 'strength');
    try {
        const bricks = loadCachedBricks(userId);
        if (Array.isArray(bricks) && bricks.length) {
            const n = bricks.filter(isStrength).length;
            if (n > 0) return n;
        }
    } catch { /* 沒有快取 → 往下讀存檔 */ }
    try {
        const plan = JSON.parse(localStorage.getItem(`u_${userId}_onboarding_cardio_plan`) || 'null');
        const w = plan?.weeks?.[0];
        if (Array.isArray(w?.bricks)) return w.bricks.filter(isStrength).length;
        const totals = plan?.meta?.totals;
        const weeks = plan?.weeks?.length || 0;
        if (weeks > 0 && Number.isFinite(totals?.total_strength_sessions)) {
            return Math.round(totals.total_strength_sessions / weeks);
        }
    } catch { /* 沒有跑步計劃 → 0 */ }
    return 0;
}

const ZH_WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const weekOrder = (d) => (d === 0 ? 7 : d);   // 週日排最後

/** 把 JS weekday 索引陣列轉成「一／三／五」。 */
export const weekdaysZh = (arr) => (arr || []).map((d) => ZH_WEEKDAY[d]).filter(Boolean).join('／');

/**
 * 目前重訓實際排在星期幾（JS getDay 索引，週日=0）。
 * readWeeklyStrengthDays 只回傳「幾天」，這支回傳「哪幾天」——
 * 跨系統要講出「因為健身在一三五」就需要這個。讀不到回空陣列，不猜。
 */
export function readStrengthWeekdays(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(`weeklyTrainingDays_${userId}`) || 'null');
        const wk = raw && raw[1];
        if (wk && typeof wk === 'object') {
            return Object.keys(wk).map(Number)
                .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
                .sort((a, b) => weekOrder(a) - weekOrder(b));
        }
    } catch { /* 壞掉的舊資料就當作沒排 */ }
    return [];
}

/* ⚠️ proposeComplementDays 已移除（2026-09）。
   它只收 { takenDays, need }：拿不到課種、也不知道哪天是腿日，
   所以畫面上寫的「長跑排週末、質量跑避開腿日隔天」它結構上就做不到，
   排出來的星期也跟中控台／首頁的 buildWeeklyAgenda 不一樣 —— 同一週兩個答案。

   要預覽「排出來會長怎樣」請用 dailyAgenda.previewWeek()，
   那是中控台、首頁、兩個精靈共用的同一支排程函式。 */


/**
 * 「這一期的收官／回饋看過了」旗標。
 * ⚠️ 以前只用季數當 key（…_s1）：使用者用精靈重新生成一份新計劃時季數不會變，
 *    上一份計劃留下的「看過了」就把新計劃的到期提示整個吃掉 —— 第 28／28 天什麼都不跳。
 *    現在連同計劃 id 一起記，換計劃就是新的一期。
 */
export function cycleShownKey(userId, planId, season) {
    const s = Number(season) || 1;
    /* 2026-09-28：改名 cycle_confirmed_ —— 舊版「點開就算看過」寫下的 cycle_complete_shown_
       不能再算數（使用者點開看一眼就關掉，提醒就永遠消失）。只有按下一季的確認才會寫這個 key。 */
    return planId ? `cycle_confirmed_${userId}_s${s}_${planId}` : `cycle_confirmed_${userId}_s${s}`;
}

/**
 * 重訓這一季是不是練完了、而且還沒去看回饋。
 *
 * 判定條件跟計劃頁觸發「完美收官」的那一套完全一樣（每一週的可訓練日都完成、
 * 且該季的收官畫面還沒顯示過）—— 不然會發生「提醒你去回饋，點進去卻沒東西」。
 * 用完成度而不是日期：使用者提早練完整季，那一刻就該提醒，不必等日曆走完。
 */
export function strengthSeasonDone(userId) {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        const weeks = plan?.weeks;
        if (!Array.isArray(weeks) || weeks.length === 0) return false;

        const planId = activeStrengthPlanId(userId);
        if (!planId) return false;

        for (let w = 1; w <= weeks.length; w++) {
            const days = weeks[w - 1]?.days || [];
            const trainable = days.filter((d) => d?.exercises?.length > 0).length;
            if (trainable === 0) return false;                       // 資料不完整就不亂報
            const done = readStrengthPlanDays(userId, planId, w) || [];
            if (done.length < trainable) return false;
        }

        const season = Number(localStorage.getItem(`season_${userId}`)) || 1;
        return !localStorage.getItem(cycleShownKey(userId, planId, season));
    } catch { return false; }
}

/** 目前「已排定」的每週重訓天數（讀 currentPlan_<uid> 第 1 週）。讀不到回 0。 */
export function readWeeklyStrengthDays(userId) {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        const days = plan?.weeks?.[0]?.days;
        if (Array.isArray(days)) return days.length;
    } catch { /* */ }
    return 0;
}

/**
 * 重訓這一期的日曆走到最後一天（第 28／28 天起），而且這份計劃的收官還沒看過。
 * 跟計劃頁「28 天到了，去回饋這一期」同一套判定：起始日 plan.startDate → start_date → created_at，
 * 最後一天當天就算到期（不是隔天）。練完幾堂不影響 —— 時間到了就該回饋、決定下一期。
 */
export function strengthCycleTimeUp(userId, today = new Date()) {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        const weeks = plan?.weeks?.length || 0;
        const startRaw = plan?.startDate || plan?.start_date || plan?.created_at;
        if (!weeks || !startRaw) return false;
        const start = new Date(startRaw);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);
        const now = new Date(today); now.setHours(0, 0, 0, 0);
        const elapsed = Math.floor((now - start) / DAY_MS);
        if (elapsed + 1 < weeks * 7) return false;
        const season = Number(localStorage.getItem(`season_${userId}`)) || 1;
        return !localStorage.getItem(cycleShownKey(userId, plan?.plan_id || plan?.id, season));
    } catch { return false; }
}

/** 這份重訓計劃的這一季，使用者按過下一季的確認了沒（回饋完成）。首頁提醒與計劃頁同一個旗標。 */
export function strengthCycleConfirmed(userId) {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        const season = Number(localStorage.getItem(`season_${userId}`)) || 1;
        return !!localStorage.getItem(cycleShownKey(userId, plan?.plan_id || plan?.id, season));
    } catch { return false; }
}
