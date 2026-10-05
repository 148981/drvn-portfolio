// /src/data/globalExerciseRegistry.js

import { EXERCISE_MASTER_DB, EXERCISE_TRANSLATION_DICT } from './exerciseDatabase';
import { CHEST_PLAN } from './chestPlanData';
import { BACK_PLAN } from './backPlanData';
import { SHOULDER_ARM_PLAN } from './shoulderArmPlanData';
import { FULLBODY_PLAN } from './fullbodyPlanData';
import { CORE_PLAN } from './corePlanData';
import { GLUTE_PLAN } from './glutePlanData';
import { LEG_PLAN } from './legPlanData';

const ALL_PLANS = [CHEST_PLAN, BACK_PLAN, SHOULDER_ARM_PLAN, FULLBODY_PLAN, CORE_PLAN, GLUTE_PLAN, LEG_PLAN];

// ─── 🌟 Infrastructure Layer: Normalization & Maps ──────────────────────────

/**
 * 語意標準化 (Semantic Normalization)
 * 修正版：保留中文、英文、數字、空格與連字號
 */
const normalize = (s) => (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// 1. 建立拆分地圖 (解決中英文 Key 互相覆蓋的 Bug)
const NAME_MAP = new Map();
const NAME_EN_MAP = new Map();
const TRANSLATION_MAP = new Map();

EXERCISE_MASTER_DB.forEach(ex => {
    if (ex.name) NAME_MAP.set(normalize(ex.name), ex);
    if (ex.nameEn) NAME_EN_MAP.set(normalize(ex.nameEn), ex);
});

Object.entries(EXERCISE_TRANSLATION_DICT).forEach(([zh, en]) => {
    // ✅ 修正點 1：Key (中文) 需要正規化以便模糊搜尋，
    // 但 Value (英文) 絕對不能正規化！必須保留原大小寫與特殊符號給圖片 API 使用
    TRANSLATION_MAP.set(normalize(zh), en); 
});

const ANALYZE_CACHE = new Map();

// ─── 🌟 Layer 1: Lookup Layer ────────────────────────────────────────────────

const lookupExercise = (name, nameEn) => {
    const nZh = normalize(name);
    const nEn = normalize(nameEn);
    const rawTransEn = TRANSLATION_MAP.get(nZh);

    return NAME_MAP.get(nZh) || 
           NAME_EN_MAP.get(nEn) || 
           // ✅ 修正點 2：用來查內部 DB 的時候才把翻譯出來的英文 normalize
           (rawTransEn ? NAME_EN_MAP.get(normalize(rawTransEn)) : null);
};

const MAX_CACHE_SIZE = 500;

// ─── 🌟 Layer 2: Rule-Based Classifier (Scoring Engine) ──────────────────────

const classifyByRules = (n) => {
    const scores = { push: 0, back: 0, lower: 0, core: 0, arms: 0, shoulder: 0 };
    
    // ── 🚀 特殊攔截：先於所有 scoring，強制校正特殊動作 ──
    const isReversePecDeck = /(reverse.*pec|pec.*reverse)/.test(n);
    const isReverseNordic = /reverse.*nordic/.test(n); // ✅ 新增：攔截 Reverse Nordic

    // Category Scoring Matrix
    if (!isReversePecDeck && /(bench|chest|胸|臥推|夾胸|pec|fly|飛鳥|incline|decline|伏地挺身|俯臥撐|push[- ]?up)/.test(n)) scores.push += 10;
    // pull-up / chin-up → back (vertical pull)
    if (/(row|pulldown|引體|划船|下拉|back|lat |pull[- ]?up|chin[- ]?up|wide.*grip.*pull)/.test(n)) scores.back += 10;
    if (/(squat|leg press|extension.*leg|leg.*ext|深蹲|腿舉|腿伸展|踢腿|lunge|弓箭步|腿)/.test(n)) scores.lower += 8;
    if (/(glute|ham|rdl|deadlift|硬舉|羅馬尼亞|臀|橋式|外展|hip thrust|臀推|hip|thrust)/.test(n)) scores.lower += 8;
    if (/(腹|核心|plank|crunch|捲腹|卷腹|棒式|抬腿|死蟲|俄羅斯|ab wheel|rollout)/.test(n)) scores.core += 10;

    // 肩膀獨立權重（含 Reverse Pec Deck → 後三角）
    if (isReversePecDeck || /(shoulder|delt|肩|overhead|推舉|臉拉|face pull|平舉|側平舉)/.test(n)) {
        scores.shoulder += 10;
    }
    
    // ✅ 修正點：遇到 nordic 必須歸類為下肢，絕對不能讓 'curl' 誤判為手臂
    if (/(二頭|彎舉|curl|bicep|三頭|下壓|skull|tricep|臂)/.test(n)) {
        if (/(彎舉.*腿|腿彎舉|nordic)/.test(n)) scores.lower += 10;
        else scores.arms += 10;
    }

    let bodyCategory = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a), ['other', 0])[0];
    if (scores[bodyCategory] === 0) bodyCategory = 'other';
    
    // 將肩膀映射回 Push 類別
    if (bodyCategory === 'shoulder') bodyCategory = 'push';

    // Sub-part & Pattern Inference
    let subPart = 'other', pattern = 'other';
    
    // 🚀 補充：小腿分類攔截
    if (/(calf|calves|提踵|小腿)/.test(n)) {
        bodyCategory = 'lower';
        subPart = 'calves';
        pattern = 'calf_iso';
    }

    if (bodyCategory === 'push' && subPart !== 'calves') {
        if (isReversePecDeck) {
            // Reverse Pec Deck = 後三角機器，固定歸後三角
            subPart = 'delt_rear'; pattern = 'delt_rear_iso';
        } else if (/(shoulder|delt|肩|overhead|平舉|face pull|reverse.*fly|bent.?over.*fly|俯身飛鳥)/.test(n)) {
            if (/(side|lateral|側平舉|側|平舉)/.test(n) && !/(front|前束|前)/.test(n)) { subPart = 'delt_side'; pattern = 'lateral_raise'; }
            else if (/(rear|posterior|後束|俯身飛鳥|臉拉|face pull|reverse)/.test(n)) { subPart = 'delt_rear'; pattern = 'delt_rear_iso'; }
            else { subPart = 'delt_front'; pattern = 'overhead_press'; }
        } else {
            if (/(incline|上斜|上胸)/.test(n)) { subPart = 'chest_upper'; pattern = 'press_incline'; }
            // 🚨 強制將低位夾胸、下斜、雙槓全部綁定為 chest_lower
            else if (/(decline|下斜|下胸|雙槓|dip|low.cable|低位)/.test(n)) { subPart = 'chest_lower'; pattern = 'press_decline'; }
            else { subPart = 'chest_mid'; pattern = 'press_flat'; }
            // 飛鳥模式判定
            if (/(fly|飛鳥|夾胸)/.test(n)) pattern = 'fly';
        }
    } else if (bodyCategory === 'back') {
        // Pull-ups / Chin-ups → 垂直拉力 = 背部闊度
        if (/(pulldown|lat |下拉|引體|pull[- ]?up|chin[- ]?up|wide.*grip)/.test(n)) { subPart = 'back_width'; pattern = 'pull_vertical'; }
        else { subPart = 'back_thickness'; pattern = 'pull_horizontal'; }
    } else if (bodyCategory === 'lower' && subPart !== 'calves') {
        // ✅ 新增：最優先攔截 Reverse Nordic Curl 歸為股四頭
        if (isReverseNordic) {
            subPart = 'quads';
            pattern = 'knee_dominant';
        } else if (/(hip thrust|臀推|橋式|glute bridge|frog pump|青蛙橋式)/.test(n)) {
            subPart = 'glutes';
            pattern = 'glute_thrust';
        } else if (/(abduction|外展|蚌殼|clamshell|髖外展)/.test(n)) {
            subPart = 'glutes';
            pattern = 'glute_abduction';
        } else if (/(squat|leg press|深蹲|腿舉|lunge|弓箭步|分腿蹲|後跨步弓箭步|保加利亞)/.test(n)) {
            subPart = /分腿蹲|保加利亞|後跨步/.test(n) ? 'glutes' : 'quads';
            pattern = /分腿蹲|保加利亞|後跨步/.test(n) ? 'knee_dominant_uni' : 'knee_dominant';
        } else {
            subPart = 'hamstrings';
            // 補充：腿彎舉加上孤立標籤
            pattern = /(curl|彎舉)/.test(n) ? 'ham_iso' : 'hip_hinge';
        }
    } else if (bodyCategory === 'arms') {
        if (/(二頭|彎舉|curl|bicep)/.test(n)) { subPart = 'biceps'; pattern = 'bicep_curl'; }
        else { subPart = 'triceps'; pattern = 'tricep_ext'; }
    } else if (bodyCategory === 'core') {
        subPart = 'core'; pattern = 'core_stability';
    }

    // CNS Scoring
    let cnsScore = 0;
    if (/(deadlift|squat|深蹲|硬舉|bench press|臥推|overhead press|推舉|pull.up|引體|barbell.*row|槓鈴.*划船|臀推|保加利亞|分腿蹲)/.test(n)) cnsScore += 3;
    if (/(barbell|槓鈴)/.test(n)) cnsScore += 1;
    
    // 🚨 修正：擴大降級範圍，確保啞鈴、史密斯、高腳杯、羅馬尼亞硬舉等變體絕對不會被誤判為 Tier 1
    if (/(smith|machine|dumbb?ell|啞鈴|器械|cable|滑輪|goblet|高腳杯|romanian|羅馬尼亞|rdl|split|保加利亞|分腿蹲)/.test(n)) cnsScore -= 1;
    
    let cns = 'low', tier = 3;
    if (cnsScore >= 4) { cns = 'extreme'; tier = 1; } // 必須 >=4 才是 Tier 1 (例如：深蹲 + 槓鈴)
    else if (cnsScore >= 3) { cns = 'high'; tier = 1; }
    else if (cnsScore >= 2) { cns = 'medium'; tier = 2; } // 啞鈴臥推會落在這裡

    return { bodyCategory, subPart, pattern, cns, tier };
};

// ─── 🌟 Layer 3: Meta Builder (UI & Logic mapping) ──────────────────────────

const buildExerciseMeta = (baseInfo, classified) => {
    const { bodyCategory, subPart, pattern, cns, tier } = classified;
    
    const SUB_PART_DISPLAY = {
        chest_upper: '上胸', chest_mid: '中胸', chest_lower: '下胸',
        back_width: '背部闊度', back_thickness: '背部厚度',
        delt_front: '前三角', delt_side: '中三角', delt_rear: '後三角',
        biceps: '二頭肌', triceps: '三頭肌',
        quads: '股四頭', glutes: '臀大肌', hamstrings: '腿後側',
        core: '核心', calves: '小腿', other: '其他',
        // Muscle fallbacks
        chest: '胸部', back: '背部', shoulders: '肩部', shoulder: '肩部'
    };

    const role = tier === 1 ? 'main' : (tier === 2 ? 'secondary' : 'accessory');
    
    // 🛡️ 核心修復：優先保留資料庫或計畫中自訂的 target 標籤 (Bug #5)，並加上防禦性 Fallback
    const targetLabel = baseInfo.targetLabel || 
                        baseInfo.target || 
                        SUB_PART_DISPLAY[subPart] || 
                        SUB_PART_DISPLAY[baseInfo.muscle] || 
                        subPart || 
                        baseInfo.muscle || 
                        '其他';
    
    return {
        ...baseInfo,
        bodyCategory, subPart, targetLabel, tier, cns, pattern, role,
        variationGroup: baseInfo.variationGroup || baseInfo.pattern || pattern
    };
};

// ─── 🌟 Coordinator: analyzeExercise ───────────────────────────────────────

export const analyzeExercise = (ex) => {
    const rawName = (ex.name || '').trim();
    const rawNameEn = (ex.nameEn || '').trim();
    
    // 🛡️ 核心修復：防止 normalize collision，使用安全的分隔符 (Bug #4)
    const cacheKey = `${normalize(rawName)}__${normalize(rawNameEn)}`;
    
    if (ANALYZE_CACHE.has(cacheKey)) return ANALYZE_CACHE.get(cacheKey);

    const matched = lookupExercise(rawName, rawNameEn);
    const n = normalize(rawName + ' ' + rawNameEn);
    const classified = classifyByRules(n);

    // 正確 Merge 邏輯：保留 DB 資料，避免被預設值覆蓋，且對 db.cat 進行對應轉換
    let merged;
    if (matched) {
        const matchedCopy = { ...matched };
        if ('cat' in matchedCopy) {
            matchedCopy.bodyCategory = matchedCopy.cat;
            delete matchedCopy.cat;
        }
        merged = {
            ...classified,
            ...Object.fromEntries(
                Object.entries(matchedCopy).filter(([, v]) => v !== undefined && v !== null)
            )
        };
    } else {
        merged = { name: rawName, nameEn: rawNameEn || rawName, ...classified };
    }

    // Fallback to TRANSLATION_MAP if nameEn is missing
    if (!merged.nameEn) {
        // ✅ 修正點 3：直接將保留原始大小寫與符號的英文賦值給 nameEn
        merged.nameEn = TRANSLATION_MAP.get(normalize(merged.name)) || rawNameEn || '';
    }

    const result = buildExerciseMeta(ex, merged);

    // 🛡️ 核心修復：快取限制 (Simple LRU) 防止記憶體滲漏 (Bug #3)
    if (ANALYZE_CACHE.size > MAX_CACHE_SIZE) {
        const firstKey = ANALYZE_CACHE.keys().next().value;
        ANALYZE_CACHE.delete(firstKey);
    }
    
    ANALYZE_CACHE.set(cacheKey, result);
    return result;
};

// ─── 🌟 Library Management ───────────────────────────────────────────────────

export const getGlobalExerciseLibrary = () => {
    const exerciseMap = new Map();

    // 1. 唯一來源：黃金庫 (EXERCISE_MASTER_DB)
    // 貫徹「以後都一樣的動作庫」原則，徹底切斷與舊計畫硬編碼動作的連結
    EXERCISE_MASTER_DB.forEach(dbEx => {
        const info = analyzeExercise(dbEx);
        const key = normalize(info.name);
        exerciseMap.set(key, { ...info, sourcePlan: 'DRVN 黃金庫' });
    });

    return Array.from(exerciseMap.values());
};

export const getCategorizedGlobalLibrary = () => {
    const all = getGlobalExerciseLibrary();
    
    const SUBPART_GROUPS = {
        chest: ['chest_upper', 'chest_mid', 'chest_lower'],
        shoulder: ['delt_front', 'delt_side', 'delt_rear'],
        quads: ['quads'],
        glutes: ['glutes'],
        hamstrings: ['hamstrings'],
        biceps: ['biceps'],
        triceps: ['triceps'],
        calves: ['calves']
    };

    const categorized = {
        chest: all.filter(e => SUBPART_GROUPS.chest.includes(e.subPart)),
        back: all.filter(e => e.bodyCategory === 'back'),
        shoulder: all.filter(e => SUBPART_GROUPS.shoulder.includes(e.subPart)),
        quads: all.filter(e => e.subPart === 'quads'),
        glutes: all.filter(e => e.subPart === 'glutes'),
        hamstrings: all.filter(e => e.subPart === 'hamstrings'),
        biceps: all.filter(e => e.subPart === 'biceps'),
        triceps: all.filter(e => e.subPart === 'triceps'),
        calves: all.filter(e => e.subPart === 'calves'),
        core: all.filter(e => e.bodyCategory === 'core'),
        other: all.filter(e => e.bodyCategory === 'other')
    };

    Object.keys(categorized).forEach(k => categorized[k].sort((a, b) => a.tier - b.tier));
    return categorized;
};

export const searchGlobalExercises = (query) => {
    if (!query) return [];
    const nQuery = normalize(query).replace(/\s+/g, '');
    return getGlobalExerciseLibrary().filter(ex => 
        normalize(ex.name).replace(/\s+/g, '').includes(nQuery) || 
        normalize(ex.nameEn).replace(/\s+/g, '').includes(nQuery)
    );
};

// ─── 🌟 Layer 4: Biomechanics & Superset Engine (拮抗與力學引擎) ──────────────

/**
 * 正規化巨觀肌群 (Macro Muscle Group)
 * 將細節部位 (subPart) 收斂為生物力學上的巨觀發力單元，用於超級組與 Drop Set 精準判定
 */
export const getMacroMuscle = (info) => {
    if (!info) return null;
    if (info.bodyCategory === 'back') return 'back';
    if ((info.subPart || '').startsWith('chest')) return 'chest';
    if ((info.subPart || '').startsWith('delt')) return 'shoulder';
    if (info.subPart === 'biceps') return 'biceps';
    if (info.subPart === 'triceps') return 'triceps';
    if (info.subPart === 'quads') return 'quads';           // 腿前側
    if (info.subPart === 'glutes' || info.subPart === 'hamstrings') return 'glutes_hams'; // 為了燃盡超級組(Agonist)，把臀和腿後視為同一個大肌群
    if (info.bodyCategory === 'core') return 'core';
    return info.subPart || info.bodyCategory;
};

/**
 * 判斷兩個動作是否符合「進階拮抗肌群」 (Advanced Antagonist Pairs)
 * 基於生物力學發力平面的精準比對，確保兩肌肉群在超級組中能獲得 100% 的神經與 ATP 恢復
 */
export const isAntagonistPair = (infoA, infoB) => {
    if (!infoA || !infoB) return false;

    const subA = infoA.subPart || '';
    const subB = infoB.subPart || '';

    // 輔助函式：確保 A 和 B 剛好一左一右命中兩個力學條件
    const match = (cond1A, cond1B, cond2A, cond2B) => 
        (cond1A && cond2B) || (cond1B && cond2A);

    // ── 1. 手臂單關節拮抗 (Elbow Flexion ↔ Extension) ──
    // 二頭肌 ↔ 三頭肌 (經典無爭議)
    if (match(subA === 'biceps', subB === 'biceps', subA === 'triceps', subB === 'triceps')) return true;

    // ── 2. 下肢前後鏈拮抗 (Anterior ↔ Posterior Chain) ──
    // 股四頭 (主導膝伸) ↔ 臀大肌/腿後鏈 (主導髖伸/膝屈)
    if (match(subA === 'quads', subB === 'quads', subA === 'glutes_hams', subB === 'glutes_hams')) return true;

    // ── 3. 水平推拉拮抗 (Horizontal Push ↔ Horizontal Pull) ──
    // 臥推/平推 (中胸/下胸) ↔ 划船 (背部厚度)
    const isHorizPush = (info) => info.subPart === 'chest_mid' || info.subPart === 'chest_lower';
    const isHorizPull = (info) => info.subPart === 'back_thickness';
    if (match(isHorizPush(infoA), isHorizPush(infoB), isHorizPull(infoA), isHorizPull(infoB))) return true;

    // ── 4. 垂直推拉拮抗 (Vertical Push ↔ Vertical Pull) ──
    // 肩推/側平舉 (前中束) ↔ 下拉/引體向上 (背部闊度)
    // 🚨 [進階防護網]：嚴格把「後三角 (delt_rear)」排除！因為後三角在拉力動作中是協同肌，不是拮抗肌！
    const isVertPush = (info) => info.subPart === 'delt_front' || info.subPart === 'delt_side';
    const isVertPull = (info) => info.subPart === 'back_width';
    if (match(isVertPush(infoA), isVertPush(infoB), isVertPull(infoA), isVertPull(infoB))) return true;

    // ── 5. 高角度推拉拮抗 (Incline Push ↔ Vertical Pull) ──
    // 上斜胸推 ↔ 引體向上/下拉 (經典阿諾時期健美超級組)
    const isUpperChest = (info) => info.subPart === 'chest_upper';
    if (match(isUpperChest(infoA), isUpperChest(infoB), isVertPull(infoA), isVertPull(infoB))) return true;

    return false;
};

/**
 * 判斷兩個動作是否符合「燃盡超級組」的部位條件 (Agonist / Same Muscle)
 */
export const isAgonistPair = (infoA, infoB) => {
    const macA = getMacroMuscle(infoA);
    const macB = getMacroMuscle(infoB);
    // 必須有值且兩者完全隸屬於同一巨觀肌群
    return Boolean(macA && macB && (macA === macB));
};

export default {
    getGlobalExerciseLibrary,
    getCategorizedGlobalLibrary,
    analyzeExercise,
    searchGlobalExercises,
    // 🌟 新增匯出生物力學判定函數
    getMacroMuscle,
    isAntagonistPair,
    isAgonistPair
};
