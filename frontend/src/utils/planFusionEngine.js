import { getCategorizedGlobalLibrary, analyzeExercise, getMacroMuscle, isAntagonistPair, isAgonistPair } from '../data/globalExerciseRegistry';
// 🌐 共用中文命名表 + 確定性標題（與 UnifiedTrainingEngine 同步，單一真相來源）
import { buildDeterministicTitle, detectMusclesFromText, SPLIT_FOCUS } from './planNaming';

// 🚫 動作排除清單：太冷門 / 命名重複（合併到標準版）/ 居家替代，不放進正式菜單。
//    其中合併別名的（羅馬椅挺身→45度背伸展、俯身划船→槓鈴划船、寬握引體→引體向上、
//    對握下拉→下拉、Hyperextensions→45度背伸展）排除後，引擎會自動選標準版補上。
const EXCLUDED_EXERCISES = new Set([
    '繩索直臂肩推', '繩索臀推', '墊高後跨步弓箭步', 'B字站位硬舉', '青蛙橋式',
    '超人式', 'Band Lateral Raise',
    '羅馬椅挺身', 'Hyperextensions', '俯身划船', '寬握引體', '對握下拉',
]);
const isExcludedExercise = (name) => EXCLUDED_EXERCISES.has((name || '').trim());

// 🎓 進階限定動作：技術門檻高 / 受傷風險高 / 需要良好控制，「不放進新手第一輪菜單」。
//    新手會改拿安全的機械/啞鈴/基礎槓鈴版本；中階以上才解鎖這些。
const ADVANCED_ONLY_EXERCISES = new Set([
    '硬舉', 'Pendlay 划船', '雙槓臂屈伸', 'Arnold Press',
    '保加利亞分腿蹲', '腹輪', '懸垂舉腿', '農夫行走',
]);
// 依使用者難度判斷該動作是否「現在可用」：新手排除進階限定動作。
const isLevelAllowed = (name, difficultyLevel) =>
    difficultyLevel !== 'beginner' || !ADVANCED_ONLY_EXERCISES.has((name || '').trim());

/**
 * ⚡️ 估算動作時間 (同步真實數據，廢除硬編碼公式)
 * @param {Object} chunk 動作組 (單一或超級組)
 * @param {boolean} isFirstLift 是否為當日首項 (用於力量舉組數加成)
 * @param {string} style 訓練風格 (powerlifting/bodybuilding)
 * @param {number} overrideSets 可選：覆蓋原始組數 (用於週期化重算)
 * @param {Object} adaptiveProfile 可選：使用者自適應配置
 */
const parseRestToMinutes = (rest, fallback = 1.5) => {
    if (rest === null || rest === undefined) return fallback;

    // ── 數字型別：明確帶單位判斷 ──────────────────────────────────
    // 訓練中的「純數字 rest」幾乎全部是秒數（15, 30, 60, 90, 120...）
    // 只有 <= 5 的整數可能是「分鐘」（1min, 1.5min, 2min, 3min, 5min）
    // 6 秒 ~ 5 分鐘之間的歧義區，優先視為秒（實務上 6 秒是合理超級組銜接）
    if (typeof rest === 'number') {
        if (!Number.isFinite(rest) || rest <= 0) return fallback;
        return rest > 5 ? rest / 60 : rest; // <= 5 → 分鐘；> 5 → 秒
    }

    const s = String(rest).trim().toLowerCase();

    // 明確帶「分鐘」單位
    const minMatch = s.match(/^(\d+(?:\.\d+)?)\s*(min|mins|m|分鐘|分)$/);
    if (minMatch) return parseFloat(minMatch[1]);

    // 明確帶「秒」單位
    const secMatch = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds|秒)$/);
    if (secMatch) return parseFloat(secMatch[1]) / 60;

    // 純數字字串：同樣用 > 5 判斷
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) return n > 5 ? n / 60 : n;

    return fallback;
};

/**
 * 🔍 解析遞減組階數 (例如 "12 -> 10 -> 8 -> 6" 為 4 階)
 */
const getDropSetStages = (reps) => {
    if (!reps) return 1;
    const repsStr = String(reps);
    if (!repsStr.includes('->')) return 1;
    const stages = repsStr.split('->').length;
    return stages > 1 ? stages : 1;
};

/**
 * ⚡️ 物理模型升級版：精準估算動作時間
 */
// 🔴 Fix(setupBuffer): 依器材類型動態計算換器械緩衝時間
// 舊版硬編碼 1.0 分鐘對徒手/彈力帶動作明顯高估（徒手蚌殼式哪需要 1 分鐘準備？）
// 現在：槓鈴 1.5min（需調重量+換片）> 機器/滑輪 1.0min > 啞鈴/壺鈴 0.75min > 徒手/彈力帶 0.3min
const getSetupBuffer = (items = []) => {
    const firstEx = items[0];
    if (!firstEx) return 0.75;
    const eq = (firstEx.equipment || analyzeExercise(firstEx).equipment || '').toLowerCase();
    if (eq === 'barbell') return 1.5;
    if (eq === 'machine' || eq === 'cable') return 1.0;
    if (eq === 'dumbbell' || eq === 'kettlebell') return 0.75;
    if (eq === 'bodyweight' || eq === 'band' || eq === 'resistance_band') return 0.3;
    return 0.75; // default
};

const estimateExerciseTime = (chunk, isFirstLift, style, overrideSets = null, adaptiveProfile = {}) => {
    const efficiencyFactor = adaptiveProfile.supersetEfficiency || 1.1;
    const setupBuffer = getSetupBuffer(chunk.items); // 🔴 Fix(setupBuffer): 動態器材緩衝

    // 常規動作的工作時間模型 (根據次數範圍估算)
    const getWorkTimePerSet = (info, reps) => {
        const stages = getDropSetStages(reps);
        if (stages > 1) {
            // 遞減組公式：每一階約需 0.6 分鐘 (35秒)，4 階即為 2.4 分鐘的工作時間
            return stages * 0.6;
        }
        // 常規組：Tier 1 重點動作動作較慢，Tier 2-3 節奏較快
        return info.tier === 1 ? 0.8 : 0.7;
    };

    if (chunk.isSuperset) {
        // 🌟 超級組模型（對齊 SOP 第五階段公式）：
        // Time = Σ(Sets × (1 + RestMins)) + Sets × 1.5
        // 其中：1 代表每組 1 分鐘工作時間，RestMins 為各動作休息，Sets × 1.5 為超級組切換開銷
        const rounds = Math.max(...chunk.items.map(ex => parseInt(String(ex.sets)) || 3));

        // Σ(Sets × (1 + RestMins))：各動作工作時間 + 各自休息
        const mainTime = chunk.items.reduce((sum, ex) => {
            const sets = parseInt(String(ex.sets)) || rounds;
            const restMin = parseRestToMinutes(ex.rest, 1.5);
            return sum + sets * (1 + restMin);
        }, 0);

        // 超級組切換開銷：Sets × 1.5 分鐘
        const supersetBonus = rounds * 1.5;

        return (mainTime + supersetBonus + setupBuffer) * efficiencyFactor;
    }

    let chunkTime = 0;
    chunk.items.forEach(ex => {
        const info = analyzeExercise(ex);
        const sets = overrideSets !== null
            ? overrideSets
            : (parseInt(String(ex.sets)) || (style === 'powerlifting' && isFirstLift && info.tier === 1 ? 5 : 4));

        const workTime = getWorkTimePerSet(info, ex.reps);

        const restStr = typeof ex.rest === 'number' ? `${ex.rest}s` : (ex.rest || (info.tier === 1 ? '150s' : '90s'));
        const match = restStr.match(/(\d+)/);
        const restVal = (match ? parseInt(match[1]) : 90) / 60;

        // 遞減組即使 rest 為 0，每一大組後通常仍需 1.5 分鐘回氣
        const actualRest = ((ex.isDropSet || getDropSetStages(ex.reps) > 1) && restVal < 0.1) ? 1.5 : restVal;

        chunkTime += (sets * (workTime + actualRest));
    });

    return chunkTime + setupBuffer;
};

/**
 * ⚡️ 動作自動補位機制 (Backfill) - 根據 SOP 第四階段「時間背包」
 */
const performBackfill = (currentExercises, currentTime, targetTime, focus, style, globalExistingNames, isCnsMaxedOut = false, categorizedLibrary, subPartLoadCount = {}, volumeCaps = {}, catLoadCount = {}, maxPerCatMap = {}, usedPatterns = new Set(), adaptiveProfile = {}, difficultyLevel = 'intermediate', dynamicMaxSets = null) => {
    const allUsedNames = new Set([...currentExercises.map(ex => ex.name), ...Array.from(globalExistingNames || [])]);

    // 🚨 終極修復 1：把 [...currentExercises] 改為空陣列 []
    // 阻斷複製人源頭，只回傳真正被 AI 補位的動作
    let backfilledEx = [], totalTime = currentTime;
    let totalSets = currentExercises.reduce((acc, ex) => acc + (parseInt(ex.sets) || 3), 0);
    // 🚀 充血不榨乾優化 1：下修 Backfill 引擎的容量天花板
    const MAX_SETS = dynamicMaxSets !== null ? dynamicMaxSets : ((style === 'powerlifting') ? 22 : 28);

    // 🌟 核心修復：精準計算目前課表各部位數量，缺最多的優先補！(Scarcity Priority)
    const getMuscleCount = (key, exercises) => {
        return exercises.filter(ex => {
            const info = analyzeExercise(ex);
            if (key === 'chest') return info.bodyCategory === 'push' && (info.subPart || '').startsWith('chest');
            if (key === 'shoulder') return info.bodyCategory === 'push' && (info.subPart || '').startsWith('delt');
            if (key === 'triceps') return info.subPart === 'triceps';
            if (key === 'biceps') return info.subPart === 'biceps';
            if (key === 'back') return info.bodyCategory === 'back';
            if (key === 'quads') return info.subPart === 'quads';
            if (key === 'glutes') return info.subPart === 'glutes';
            if (key === 'hamstrings') return info.subPart === 'hamstrings';
            if (key === 'core') return info.bodyCategory === 'core';
            return false;
        }).length;
    };

    const backfillConfig = [
        { key: 'chest', label: '胸', libraryKey: 'chest' },
        { key: 'shoulder', label: '肩', libraryKey: 'shoulder' },
        { key: 'triceps', label: '三頭', libraryKey: 'triceps' },
        { key: 'biceps', label: '二頭', libraryKey: 'biceps' },
        { key: 'back', label: '背', libraryKey: 'back' },
        // 🔴 Fix(firewall): 移除 quads label 的「推」與 glutes/hamstrings label 的「拉」
        // 原本「推/拉」是給上肢 PPL 標題用的，誤植在下肢 config 會讓「推力強化」日把 quads
        // 的 isTargetMuscle 判為 true、「拉力強化」日把 glutes/hamstrings 判為 true，
        // 造成腿臀動作穿透進推/拉日（違反 SOP 第一階段部位防火牆）。
        { key: 'quads', label: '下肢|腿|前側|四頭', libraryKey: 'quads' },
        { key: 'glutes', label: '後側|臀|蜜桃|後鏈', libraryKey: 'glutes' },
        { key: 'hamstrings', label: '腿後|後鏈', libraryKey: 'hamstrings' },
        { key: 'core', label: '核心|腹', libraryKey: 'core' }
    ];

    // 🔴 Fix(firewall): allowedCats 提前宣告，供 targets fallback 收斂使用
    const allowedCats = new Set();
    if (/胸|肩|推/.test(focus)) allowedCats.add('push');
    if (/背|拉/.test(focus)) allowedCats.add('back');
    if (/腿|下肢|臀|腿部/.test(focus)) allowedCats.add('lower');
    if (/臂|二頭|三頭/.test(focus)) allowedCats.add('arms');
    if (/腹|核心/.test(focus)) allowedCats.add('core');

    // 🔴 Fix(firewall): 把 backfillConfig 的肌群 key 對應回主 category，
    // 讓 targets fallback 只退回「當日合法 category」的肌群，而非全部肌群。
    const CONFIG_KEY_TO_CAT = {
        chest: 'push', shoulder: 'push', triceps: 'arms', biceps: 'arms',
        back: 'back', quads: 'lower', glutes: 'lower', hamstrings: 'lower', core: 'core'
    };

    let targets = backfillConfig.filter(t => new RegExp(t.label).test(focus));
    if (targets.length === 0) {
        // 🔴 Fix(firewall): fallback 不再無腦退回全部，只退回 allowedCats 涵蓋的肌群
        targets = backfillConfig.filter(t => allowedCats.has(CONFIG_KEY_TO_CAT[t.key]));
        // 真的連 allowedCats 都空（理論上不該發生）才退回全部，避免完全補不到位
        if (targets.length === 0) targets = backfillConfig;
    }
    targets.sort((a, b) => getMuscleCount(a.key, currentExercises) - getMuscleCount(b.key, currentExercises));

    for (const target of targets) {
        const fillers = (categorizedLibrary[target.libraryKey] || [])
            .filter(ex => {
                const info = analyzeExercise(ex);
                if (info.role === 'main') return false;

                // 🚨 核心修復 1：Backfill 必須遵守「替代優先策略」
                const isPatternBlocked = info.variationGroup !== 'other' && usedPatterns.has(info.variationGroup);

                // 如果模式重複，檢查該肌群是否有「非重複」的替代品可用
                if (isPatternBlocked) {
                    const hasAlternative = (categorizedLibrary[target.libraryKey] || []).some(alt => {
                        const altInfo = analyzeExercise(alt);
                        return !allUsedNames.has(alt.name) &&
                            (altInfo.variationGroup === 'other' || !usedPatterns.has(altInfo.variationGroup));
                    });
                    // 只有在「有替代品」的情況下才阻擋重複模式，確保不會因為去重導致補位完全失敗
                    if (hasAlternative) return false;

                    /* 🔴 2026-09 修正：沒有替代品時的逃生門要有上限。
                       SOP 第四階段：「同一天內，相同力學模式只能出現一次，
                       **除非總數極少**」——逃生門的用意是避免課表被去重清空，
                       而不是在已經排滿的日子還硬塞第二個同模式動作。
                       實測：leg+glute 精熟 6 天，當日已有 6 個動作仍補進
                       第二個 quad_iso（腿伸展 + 反向北歐腿）。
                       改為只在「當日動作數 < 4」時才允許重複，
                       已經夠多就寧可少補一個，也不犧牲力學多樣性。 */
                    if ((currentExercises?.length || 0) >= 4) return false;
                }

                // 🚨 確認是否為下胸動作
                const isLowerChest = info.subPart === 'chest_lower' || /(decline|下斜|下胸|雙槓|dip|low.cable|低位)/i.test(ex.name || '');

                // 🔴 Fix(firewall): 硬性閘門——filler 的 bodyCategory 必須落在當日 allowedCats。
                // 移除原本的「|| allowedCats.size === 0」無腦放行，並把 isTargetMuscle 也夾在
                // allowedCats 之內，徹底阻斷腿臀動作穿透進推/拉日。
                const catAllowed = allowedCats.has(info.bodyCategory);
                return !allUsedNames.has(ex.name) &&
                    !isExcludedExercise(ex.name) && // 🚫 排除冷門/重複命名動作
                    isLevelAllowed(ex.name, difficultyLevel) && // 🎓 新手排除進階限定動作
                    catAllowed &&
                    !(isCnsMaxedOut && info.cns === 'extreme') &&
                    (difficultyLevel !== 'beginner' || info.tier <= 3) && // 🚨 放寬限制：允許新手使用 Tier 3 動作補位，確保庫存充足
                    (difficultyLevel === 'advanced' || !isLowerChest); // 🚨 補位引擎同步封鎖下胸
            })
            .sort((a, b) => {
                const aInfo = analyzeExercise(a);
                const bInfo = analyzeExercise(b);

                // 🚨 核心修復：先挑「沒撞 Pattern」的動作
                const aBlocked = aInfo.variationGroup !== 'other' && usedPatterns.has(aInfo.variationGroup) ? 1 : 0;
                const bBlocked = bInfo.variationGroup !== 'other' && usedPatterns.has(bInfo.variationGroup) ? 1 : 0;

                if (aBlocked !== bBlocked) return aBlocked - bBlocked;
                return aInfo.tier - bInfo.tier;
            });

        for (const filler of fillers) {
            const info = analyzeExercise(filler);
            const limit = volumeCaps[info.subPart] ?? volumeCaps.default ?? 2;

            // 🌟 核心修復：在 Backfill 階段也給予肩部免死金牌，防堵穿透擠兌
            const isShoulderStarved = (info.subPart || '').startsWith('delt') &&
                new RegExp('肩').test(focus) &&
                ((subPartLoadCount['delt_front'] || 0) + (subPartLoadCount['delt_side'] || 0) + (subPartLoadCount['delt_rear'] || 0)) < 1;

            if ((catLoadCount[info.bodyCategory] || 0) >= (maxPerCatMap[info.bodyCategory] || MAX_SETS) && !isShoulderStarved) continue;
            if ((subPartLoadCount[info.subPart] || 0) >= limit) continue;

            const fillerSets = filler.defaultSets || 3;
            const fillerChunk = {
                isSuperset: false,
                items: [{
                    ...filler,
                    sets: fillerSets,
                    reps: filler.defaultReps || (info.tier === 1 && style === 'powerlifting' ? '3-5' : '8-12'),
                    rest: filler.defaultRest || (info.tier === 1 ? '150s' : '90s')
                }]
            };
            const fillerTime = estimateExerciseTime(fillerChunk, false, style, null, adaptiveProfile);

            // 🚨 核心修復 4：Backfill 內部必須同步 MAX_SETS 檢查，防止容量溢出 (Bug #11)
            if (totalSets + fillerSets > MAX_SETS || totalTime + fillerTime >= targetTime) break;

            backfilledEx.push(fillerChunk.items[0]);

            // 🛡️ 核心修復：豁免動作 (Main/Core) 不參與去重系統，防止自相殘殺 (Surgery 3)
            if (info.role !== 'main' && info.subPart !== 'core') {
                allUsedNames.add(filler.name);
            }
            catLoadCount[info.bodyCategory] = (catLoadCount[info.bodyCategory] || 0) + fillerSets;
            subPartLoadCount[info.subPart] = (subPartLoadCount[info.subPart] || 0) + 1;

            // 🚀 95 分版本：Backfill 只記錄輔助的變體組
            if (info.variationGroup !== 'other' && info.role !== 'main') usedPatterns.add(info.variationGroup);

            totalTime += fillerTime;
            totalSets += fillerSets;
        }
    }

    return { exercises: backfilledEx, time: totalTime };
};

// 1. 打散訓練天數 (排程智慧化)
const getSmartWeekday = (dayIndex, totalDays) => {
    const schedules = {
        1: ['WED'],                           // 練1天：週三
        2: ['MON', 'THU'],                    // 練2天：週一、四
        3: ['MON', 'WED', 'FRI'],             // 練3天：週一、三、五
        4: ['MON', 'TUE', 'THU', 'FRI'],      // 練4天：做二休一
        5: ['MON', 'TUE', 'WED', 'FRI', 'SAT'], // 練5天：週四、日休
        6: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], // 練6天：週日休
        7: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    };
    const schedule = schedules[totalDays] || schedules[7];
    return schedule[dayIndex % schedule.length];
};

// 🚨 將原本的 targetTimeMinutes 參數改為可選，並在內部自動覆寫
export const fuseWorkoutPlans = (plans, daysPerWeek = 4, sourceLevelsMap = {}, trainingStyle = 'bodybuilding', _ignoredTime = null, adaptiveProfile = {}, difficultyLevel = 'intermediate', intensity = 'medium') => {
    if (!plans || plans.length === 0) return null;

    // 🎯 核心升級：系統智能指派「黃金訓練時長」 (廢除 UI 手動設定)
    // 根據運動科學，不同難度與風格有其最佳的神經集中時間
    const targetTimeMinutes = (() => {
        if (trainingStyle === 'powerlifting') {
            // 健力模式：組間休息長，總時間必須拉長
            if (difficultyLevel === 'beginner') return 50; // 新手健力 (抓大約 3 個動作)
            if (difficultyLevel === 'advanced') return 90; // 精熟健力 (5x5 加上極長休息)
            return 75; // 中階健力
        } else {
            // 健美模式：組間休息短，講求密度與充血感
            if (difficultyLevel === 'beginner') return 45; // 新手健美 (體能適應期)
            if (difficultyLevel === 'advanced') return 75; // 精熟健美 (高容量、超級組)
            return 60; // 中階健美
        }
    })();

    let prevDayExtremeCNS = false;
    const planExistingNames = new Set();
    const mainLiftMemory = {}; // 🌟 95 分版本核心：主動作跨週記憶鎖定 { focusKey: exerciseName }
    // 🏷️ 確定性命名生成器 — 「同部位 → 同標題」
    //    後綴改用肌群組合的 stable hash（取代 Math.random），保證相同肌群每次都產生相同名稱。
    //    肌群偵測與命名邏輯統一移至 planNaming.js（兩引擎共用單一真相來源）。
    const generateFusionName = (_plans, _splitLabel) => {
        const allText = _plans.map(p => p.name || '').join(' ');
        const found = detectMusclesFromText(allText);
        if (found.length > 0) return buildDeterministicTitle(found);
        // 偵測不到肌群時，退回以 splitLabel 為 seed 的確定性名稱
        return buildDeterministicTitle([_splitLabel || '複合']);
    };
    // planNames 需等 splitLabel 完全初始化後才能計算，移至 return 前執行

    // 🛡️ 效能修復：在最外層只抓取一次，避免迴圈內重複運算 128 次
    const categorizedLibrary = getCategorizedGlobalLibrary();

    /* ── 1. 動作去重與超級組降級 (SOP 第一階段) ── */
    // 🔧 等級退化解析：來源計劃若缺請求的難度（例：胸/背只有 beginner/intermediate，
    //    使用者卻選了 advanced），退回「不超過請求、且最接近」的可用等級，避免產生空計劃。
    const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
    const resolveLevel = (p) => {
        const avail = Object.keys(p.levels || {});
        if (!avail.length) return undefined;
        const requested = (sourceLevelsMap && typeof sourceLevelsMap === 'object' ? sourceLevelsMap[p.id] : sourceLevelsMap)
            || difficultyLevel;
        if (requested && p.levels[requested]) return requested;          // 直接命中
        const reqRank = LEVEL_RANK[requested] ?? 1;
        // 取「rank ≤ 請求」中最高者；若請求比所有可用都低，取可用中最低者
        const sorted = avail.slice().sort((a, b) => (LEVEL_RANK[a] ?? 0) - (LEVEL_RANK[b] ?? 0));
        const notAbove = sorted.filter(l => (LEVEL_RANK[l] ?? 0) <= reqRank);
        return (notAbove.length ? notAbove[notAbove.length - 1] : sorted[0]);
    };
    let allExercises = [];
    plans.forEach(p => {
        const targetLevel = resolveLevel(p) || 'beginner';
        const week1 = p.levels?.[targetLevel]?.weeks?.[0];
        if (!week1?.days) return;

        week1.days.forEach((d, dayIdx) => {
            (d.exercises || []).forEach(ex => {
                // 🌟 SOP 1-1：全域去重豁免權 (Tier 1 與核心必修可重複)
                const info = analyzeExercise(ex);
                const canRepeat = info.role === 'main' || info.subPart === 'core' || ex.isCoreRequired;

                if (!canRepeat && allExercises.some(e => e.name === ex.name)) return;

                const scopedGroup = ex.supersetGroup ? `${p.id}::d${dayIdx}::${ex.supersetGroup}` : undefined;
                allExercises.push({ ...ex, sourcePlan: p.name, supersetGroup: scopedGroup });
            });
        });
    });

    const groupCounts = {};
    allExercises.forEach(ex => { if (ex.supersetGroup) groupCounts[ex.supersetGroup] = (groupCounts[ex.supersetGroup] || 0) + 1; });
    // 孤兒修復 (Orphan Fix)
    allExercises = allExercises.map(ex => {
        if (ex.supersetGroup && groupCounts[ex.supersetGroup] < 2) {
            const { supersetGroup, superset, ...rest } = ex;
            return rest;
        }
        return ex;
    });

    const supersetMap = {};
    allExercises.forEach(ex => {
        if (ex.supersetGroup) {
            if (!supersetMap[ex.supersetGroup]) supersetMap[ex.supersetGroup] = [];
            supersetMap[ex.supersetGroup].push(ex);
        }
    });

    /* ── 4. 分類池建立 ── */
    // 🌟 核心升級：貫徹「以後都一樣的動作庫」原則
    // 在分流前，強制將所有來自計劃的動作「升級」為 EXERCISE_MASTER_DB 的標準版本
    const pools = { push: [], back: [], lower: [], core: [], arms: [] };
    allExercises.forEach(ex => {
        if (ex._processed) return;

        // 🔍 這裡會自動從 EXERCISE_MASTER_DB 抓取專家級參數 (Tier, CNS, Pattern)
        const info = analyzeExercise(ex);

        if (ex.supersetGroup) {
            const group = supersetMap[ex.supersetGroup];
            group.forEach(gEx => {
                const gInfo = analyzeExercise(gEx);
                gEx._processed = true;
                // 同步升級群組內的動作屬性
                Object.assign(gEx, gInfo);
            });

            // 🛡️ 核心修復 1：在檢查前，先計算部位種類與手臂衝突狀態
            const categories = new Set();
            let hasBiceps = false;
            let hasTriceps = false;

            let hasExtreme = false;
            const highCnsCount = group.filter(gEx => {
                const gInfo = analyzeExercise(gEx);
                categories.add(gInfo.bodyCategory);
                if (gInfo.subPart === 'biceps') hasBiceps = true;
                if (gInfo.subPart === 'triceps') hasTriceps = true;
                if (gInfo.cns === 'extreme') hasExtreme = true;
                return gInfo.cns === 'extreme' || gInfo.cns === 'high';
            }).length;

            if (hasExtreme || highCnsCount >= 2) {
                group.forEach(gEx => {
                    gEx.wasOrphan = true;
                    delete gEx.supersetGroup;
                    delete gEx.supersetId;
                    delete gEx.superset;
                    const gInfo = analyzeExercise(gEx);
                    pools[gInfo.bodyCategory]?.push({ isSuperset: false, items: [gEx], tier: gInfo.tier, cns: gInfo.cns });
                });
            } else {
                group.sort((a, b) => analyzeExercise(a).tier - analyzeExercise(b).tier);
                const firstInfo = analyzeExercise(group[0]);
                pools[firstInfo.bodyCategory]?.push({ isSuperset: true, items: group, tier: firstInfo.tier, cns: firstInfo.cns });
            }
        } else {
            ex._processed = true;
            // 升級單一動作屬性
            Object.assign(ex, info);
            pools[info.bodyCategory]?.push({ isSuperset: false, items: [ex], tier: info.tier, cns: info.cns });
        }
    });

    /* ── 5. 單日排序與動態週滾動引擎 ── */
    const cnsWeight = { extreme: 1, high: 2, medium: 3, low: 4 };

    const buildDayExercises = (chunks, weekIdx = 0, dayFocus = '', trainingStyle, targetTimeMinutes, mainLiftMemory = {}, splitMode, prevDayExtremeCNS = false) => {
        const focusKey = dayFocus.replace(/\s/g, ''); // 用於跨週鎖定的 Key
        const subPartOrder = {
            quads: 10, glutes: 11, hamstrings: 12,
            chest_mid: 20, chest_upper: 21, chest_lower: 22,
            back_width: 30, back_thickness: 31,
            delt_front: 40, delt_side: 41, delt_rear: 42,
            triceps: 80, biceps: 81, core: 90
        };

        // 🚀 Adaptive System 注入點 1：部位容量天花板
        // 系統會記住使用者哪些部位需要多練，哪些部位容易過度訓練
        const SUB_PART_VOLUME_CAPS = {
            quads: 3, glutes: 2, hamstrings: 2, calves: 1,
            // 🚨 修改 4：將 chest_upper 從 2 下修為 1，保留空間給中胸，防止上胸擠兌
            chest_mid: 2, chest_upper: 1, chest_lower: 1,
            back_width: 2, back_thickness: 2,
            delt_front: 1, delt_side: 2, delt_rear: 1,
            biceps: 2, triceps: 2,
            core: 99,
            default: 2,
            ...(adaptiveProfile.volumeCapsOverride || {}) // 👈 覆蓋預設值
        };

        // 🔥 【智慧動態防護網】：解決前三角過度疲勞
        if (dayFocus.includes('胸') && dayFocus.includes('肩')) {
            // 練胸日，前三角已經被代償很多了，強制將前三角孤立動作上限設為 0
            // 逼迫 Backfill 與主引擎只能抓「中三角」與「後三角」
            SUB_PART_VOLUME_CAPS.delt_front = 0;
            SUB_PART_VOLUME_CAPS.delt_side = 3;  // 放寬中三角配額來補足肩部總量
        }

        // ⚡️ 語意映射表：解決中文標題與英文 Cat 的匹配
        const catMap = { push: '胸|肩', back: '背', lower: '腿|下肢|臀', arms: '臂|二頭|三頭', core: '腹|核心' };

        // ⚡️ 建立當日合法部位防火牆 (SOP 第一階段)
        // 🚨 核心修復 5：Regex Tokenization - 中文不需要單詞邊界
        const isMatch = (term, text) => new RegExp(term).test(text);

        const allowedCats = new Set();
        // 🚨 修正：擴增關鍵字，防止 FullBody (全身、四頭、後鏈) 找不到對應肌群而掉塊
        if (isMatch('胸|肩|推|全身', dayFocus)) allowedCats.add('push');
        if (isMatch('背|拉|全身', dayFocus)) allowedCats.add('back');
        if (isMatch('腿|下肢|臀|四頭|後鏈|全身', dayFocus)) allowedCats.add('lower');
        if (isMatch('臂|二頭|三頭|全身', dayFocus)) allowedCats.add('arms');
        if (isMatch('腹|核心|全身', dayFocus)) allowedCats.add('core');

        // ⚡️ 修正：超級組跨界拆解 (Superset De-contamination) + 深拷貝隔離 (Surgery 1)
        let pool = chunks.map((c, idx) => {
            const validItems = c.items.filter(it => {
                if (isExcludedExercise(it.name)) return false; // 🚫 排除冷門/重複命名動作
                if (!isLevelAllowed(it.name, difficultyLevel)) return false; // 🎓 新手排除進階限定動作
                const info = analyzeExercise(it);
                const catMatch = allowedCats.has(info.bodyCategory) || allowedCats.size === 0;
                // 🚨 新手防護網：全面禁用 Tier 3 孤立動作
                // 🚨 新手防護網：適度開放 Tier 3 孤立動作，確保動作能順利湊滿 3 個
                const tierMatch = difficultyLevel !== 'beginner' || info.tier <= 3;

                // 🚨 下胸防護網 (Double Check)：精熟難度以下，禁用所有下胸動作與雙槓
                const isLowerChest = info.subPart === 'chest_lower' || /(decline|下斜|下胸|雙槓|dip|low.cable|低位)/i.test(it.name || '');
                const lowerChestMatch = difficultyLevel === 'advanced' || !isLowerChest;

                return catMatch && tierMatch && lowerChestMatch;
            });
            if (validItems.length === 0) return null;

            // 🛡️ 核心修復：深拷貝隔離，只保留必要欄位，防止參照污染 (Surgery 1)
            return {
                id: c.id,
                priority: c.priority,
                pattern: c.pattern,
                items: validItems.map(it => ({ ...it })), // 再次深拷貝 items
                isSuperset: validItems.length > 1,
                _origIdx: idx,
                _rejected: 0 // 重置懲罰值
            };
        }).filter(Boolean);

        // 週次旋轉 + 重新生成變化種子(variationSeed)：種子非 0 時連 W1 也旋轉 → 「重新生成」可換一批動作。
        //   variationSeed 預設 0，一般生成完全不受影響（維持同設定→同課表的確定性）。
        const rotSeed = weekIdx + (adaptiveProfile?.variationSeed || 0);
        if (rotSeed > 0 && pool.length > 1) {
            const offset = rotSeed % pool.length;
            pool = [...pool.slice(offset), ...pool.slice(0, offset)];
        }

        let selectedChunks = [], expectedTime = 10, totalSets = 0;
        let subPartLoadCount = {};
        let usedPatterns = new Set();

        // 🚨 核心修復 7：Adaptive Volume Capacity (自適應容量)
        const avgSetTime = adaptiveProfile.avgSetTime || 2.8;
        const DYNAMIC_MAX_SETS = Math.max(8, Math.floor((targetTimeMinutes - 10) / avgSetTime));
        // 🚀 充血不榨乾優化 2：動態調降單日極限容量，把 35 壓到 28
        const MAX_SETS = (trainingStyle === 'powerlifting')
            ? Math.min(22, DYNAMIC_MAX_SETS)
            : Math.min(28, DYNAMIC_MAX_SETS);

        // 🌟 每日動作數量上限：嚴格對齊難易度設定
        const MAX_CHUNKS = (() => {
            // 🔴 Fix(beginner-starved)：新手不分風格一律 3 個動作，與「黃金訓練時長」互相矛盾。
            //   實測（全組合 W1）：beginner/健美 每天只有 2.99 個動作、19 分鐘、9.3 組 ——
            //   只達成宣告目標 45 分的 41%，而中階 68%、精熟 85%。每天 9 組也低於
            //   新手阻力訓練指引（ACSM：8–10 個動作 × 1–3 組）的合理下限。
            //   健力維持 3 個：3 個大重量複合 + 長組間休息本來就是新手健力的標準處方
            //   （StrongLifts / Starting Strength），實測也已達成 65%，不需要動。
            //   健美改 4：實驗 3→4 得到 3.84 動作 / 24 分 / 11.9 組；再放到 5 完全沒有變化
            //   （綁定點在動作池與時間預算，不在這個上限），所以 4 就是正確答案。
            if (difficultyLevel === 'beginner') {
                return trainingStyle === 'powerlifting' ? 3 : 4;
            }
            if (trainingStyle === 'powerlifting') {
                // 🚨 修正補回：健力模式也要區分中階(4個動作)與精熟(5個動作)
                return difficultyLevel === 'advanced' ? 5 : 4;
            }
            if (difficultyLevel === 'advanced') return 6; // 🔴 精熟健美：由 7 下修為 6 (使用者要求，避免動作過多)
            return 6; // intermediate
        })();

        // 🚨 核心修復：引入「當日隔離去重」，防止週內 Day 1 動作污染後續訓練天
        const dayExistingNames = new Set();
        let hasTodayExtreme = false;
        let lastAddedCat = null;
        let catLoadCount = { push: 0, back: 0, lower: 0, arms: 0, core: 0 }; // 🌟 升級：追蹤主肌群容量

        // 🌟 新增：計算當日標題對應的總權重，用於後續飢餓度比例計算
        // 🚀 Adaptive System 注入點 2：部位飢餓度權重
        // 系統可以根據使用者的弱項，動態調高某個部位被抽中的機率
        const CAT_WEIGHTS = {
            lower: 5, back: 4, push: 4, arms: 2, core: 1,
            ...(adaptiveProfile.categoryWeightsOverride || {}) // 👈 覆蓋預設值
        };
        // 🔴 Fix(dead-quota)：黃金比例只能分配給「今天真的有動作可選」的部位。
        //   舊版用 allowedCats 算分母 —— 全身日的 allowedCats 固定是
        //   {push, back, lower, arms, core}，權重合計 16。但如果使用者只選了
        //   「肩臂＋胸」，池子裡根本沒有 back / lower / core，它們卻仍佔走
        //   10/16 的組數預算。那些配額永遠沒有動作能填，於是整天只擠得出
        //   2 個動作、24 分鐘（目標是 45 分），而且第二天因為可選的一樣少，
        //   只能靠 rescue 重複同樣兩個動作 —— 這就是 A/B 兩天長得一模一樣的原因。
        //
        //   實測（肩臂＋胸 · 2 天 · beginner）：池子有 16 個 chunk，舊版產出 2 個。
        //   把分母改成「實際有貨的部位」後，push 與 arms 才拿得到完整預算。
        const catsWithStock = new Set();
        pool.forEach(c => {
            const cat = analyzeExercise(c.items[0]).bodyCategory;
            if (allowedCats.has(cat)) catsWithStock.add(cat);
        });
        // 池子空的時候退回原本的 allowedCats，維持既有行為（交給後面的 rescue 處理）
        const quotaCats = catsWithStock.size ? catsWithStock : allowedCats;
        const todayTotalWeight = Array.from(quotaCats).reduce((acc, cat) => acc + (CAT_WEIGHTS[cat] || 2), 0) || 1;

        // 🌟 核心修復：預先算出所有肌群的黃金比例天花板，供補位引擎同步使用
        // 🌟 修正：把天花板從「動作數」擴充為「組數容量」
        const avgSets = trainingStyle === 'powerlifting' ? 4 : 3;
        const maxPerCatMap = {};
        // 沒庫存的部位仍給一個保底值 —— 補位引擎(performBackfill)會從全域動作庫
        // 撈動作補進來，那時候這個部位就有貨了，不能因為分配時是 0 就把它鎖死。
        allowedCats.forEach(cat => {
            const ratio = (CAT_WEIGHTS[cat] || 2) / todayTotalWeight;
            maxPerCatMap[cat] = Math.max(1, Math.ceil(MAX_SETS * ratio));
        });

        // 🔒 95 分版本核心：優先塞入跨週記憶中的主動作
        if (mainLiftMemory[focusKey]) {
            const lockedName = mainLiftMemory[focusKey];
            const lockedChunk = pool.find(c => c.items.some(ex => ex.name === lockedName));

            // 🔴 Fix(memory-bypasses-CNS)：主動作記憶不得凌駕「跨日神經避震器」。
            //   這條鎖是「四週用同一個主動作」的一致性設計，但它在所有 CNS 檢查之前
            //   強制 push，等於開了一個後門：只要昨天已經有 extreme，今天照樣被塞進
            //   同一個 extreme 主動作。實測 back+core 2 天（D1/D2 同一個 focus key）
            //   就是這樣讓「硬舉」連續兩天出現，違反 SOP 第五階段。
            //   一致性可以讓步，神經安全不行 —— 昨天是 extreme 就跳過這個鎖，
            //   讓後面的正常挑選流程去選一個不是 extreme 的主動作。
            const lockedIsExtreme = !!lockedChunk
                && lockedChunk.items.some(ex => analyzeExercise(ex).cns === 'extreme');
            if (lockedChunk && lockedIsExtreme && prevDayExtremeCNS) {
                // 不鎖了，交給主迴圈；pool 保持原樣，該動作會在 CNS 閘門被擋下
            } else if (lockedChunk) {
                selectedChunks.push(lockedChunk);
                pool = pool.filter(c => c !== lockedChunk);

                lockedChunk.items.forEach(ex => {
                    const info = analyzeExercise(ex);
                    dayExistingNames.add(ex.name);
                    const sets = parseInt(ex.sets) || 3;
                    totalSets += sets;
                    catLoadCount[info.bodyCategory] = (catLoadCount[info.bodyCategory] || 0) + sets;
                    subPartLoadCount[info.subPart] = (subPartLoadCount[info.subPart] || 0) + 1;
                    // 主動作不計入 usedPatterns 防止把自己鎖死
                    // 🛡️ P0 修復（單日 CNS 互斥）：強制塞入的記憶主動作若本身是 extreme，
                    // 必須同步點亮 hasTodayExtreme，否則下方主迴圈的 extreme 互斥鎖會以為
                    // 今天還沒有 extreme，放行第二個極限動作（深蹲+硬舉/相撲深蹲同日），違反 SOP 第四階段。
                    if (info.cns === 'extreme') hasTodayExtreme = true;
                });
            }
        }

        // --- 階段一：動態挑選與飢餓加權 ---
        const initialPoolSize = pool.length; // 🛡️ Bug 5: 快照初始大小
        let consecutiveRejections = 0;
        let safetyCounter = 0;
        const MAX_ITERATIONS = 100; // 🛡️ 核心修復：防止無限迴圈安全鎖 (Surgery 4)

        while (pool.length > 0 && totalSets < MAX_SETS && safetyCounter < MAX_ITERATIONS) {
            safetyCounter++;
            // 🛡️ 優化閾值：防止空轉 (Bug #3)
            if (consecutiveRejections > Math.min(initialPoolSize, pool.length) * 2) {
                break;
            }

            pool.sort((a, b) => {
                // 🛡️ 退件懲罰：被拒絕過的動作排到最後面
                const aReject = a._rejected || 0;
                const bReject = b._rejected || 0;
                if (aReject !== bReject) return aReject - bReject;
                const aInfo = analyzeExercise(a.items[0]), bInfo = analyzeExercise(b.items[0]);

                // 🛡️ 核心修復：進化版「絕對飢餓階級 (Hunger Hierarchy)」
                // 徹底解決胸肩擠兌問題，只要標題有寫的肌群，沒吃到第一口肉前享有絕對優先權
                const getHungerLevel = (info) => {
                    // Level 3: 瀕臨餓死 (標題有寫，但目前動作數為 0，擁有絕對插隊權！)
                    if ((info.subPart || '').startsWith('delt') && dayFocus.includes('肩')) {
                        const deltCount = (subPartLoadCount['delt_front'] || 0) + (subPartLoadCount['delt_side'] || 0) + (subPartLoadCount['delt_rear'] || 0);
                        if (deltCount < 1) return 3;
                    }
                    if ((info.subPart || '').startsWith('chest') && dayFocus.includes('胸')) {
                        const chestCount = (subPartLoadCount['chest_upper'] || 0) + (subPartLoadCount['chest_mid'] || 0) + (subPartLoadCount['chest_lower'] || 0);
                        if (chestCount < 1) return 3;
                    }
                    // 👇 新增：下肢部位的絕對飢餓防護！
                    if (info.subPart === 'glutes' && dayFocus.includes('臀')) {
                        if ((subPartLoadCount['glutes'] || 0) < 1) return 3;
                    }
                    if (info.subPart === 'hamstrings' && dayFocus.includes('腿後')) {
                        if ((subPartLoadCount['hamstrings'] || 0) < 1) return 3;
                    }
                    if (info.subPart === 'quads' && (dayFocus.includes('腿前') || dayFocus.includes('四頭'))) {
                        if ((subPartLoadCount['quads'] || 0) < 1) return 3;
                    }

                    // Level 2: 正常飢餓 (容量天花板還沒滿)
                    const regex = catMap[info.bodyCategory] ? new RegExp(catMap[info.bodyCategory]) : /(?!)/;
                    const min = todayTotalWeight > 0 ? Math.floor(MAX_SETS * (CAT_WEIGHTS[info.bodyCategory] || 2) / todayTotalWeight) : 1;
                    if (regex.test(dayFocus) && (catLoadCount[info.bodyCategory] || 0) < min) return 2;

                    // Level 1: 吃飽了
                    return 1;
                };

                const hungerA = getHungerLevel(aInfo);
                const hungerB = getHungerLevel(bInfo);

                // 如果飢餓等級不同，直接讓越餓的插隊，無視層級 (Tier) 輾壓！
                if (hungerA !== hungerB) return hungerB - hungerA;

                // 🌟 修復：黃金血統優先權 (Golden DB Priority)
                // 檢查動作的來源是否為 'DRVN 黃金庫' (在 getGlobalExerciseLibrary 中定義的標籤)
                // 給予來自黃金庫的動作極大的加分 (因為我們要越小的值排越前面，所以非黃金動作給予 +500 懲罰)
                const isAGolden = a.items[0].sourcePlan === 'DRVN 黃金庫';
                const isBGolden = b.items[0].sourcePlan === 'DRVN 黃金庫';
                const aGoldenPenalty = isAGolden ? 0 : 500;
                const bGoldenPenalty = isBGolden ? 0 : 500;

                // 🌟 SOP 第四階段：權重四級跳排序
                // Step 1: 部位群聚 (Category)
                if (aInfo.bodyCategory !== bInfo.bodyCategory) {
                    const catO = { lower: 1, push: 2, back: 3, arms: 4, core: 5 };
                    return (catO[aInfo.bodyCategory] || 9) - (catO[bInfo.bodyCategory] || 9);
                }

                // Step 2: 層級 (Tier)
                if (aInfo.tier !== bInfo.tier) return aInfo.tier - bInfo.tier;

                // Step 3: 神經壓力 (CNS) 降序 (極端壓力排在最前面)
                const cnsScoreA = cnsWeight[aInfo.cns] || 4;
                const cnsScoreB = cnsWeight[bInfo.cns] || 4;
                if (cnsScoreA !== cnsScoreB) return cnsScoreA - cnsScoreB;

                // Step 4: 子部位順序與其他懲罰 (Golden/Load)
                // 🔥 【修改後】：將 100 改成 500！施加極端懲罰逼迫分散肌群
                const aScore = (subPartOrder[aInfo.subPart] || 99) + ((subPartLoadCount[aInfo.subPart] || 0) * 500) + aGoldenPenalty;
                const bScore = (subPartOrder[bInfo.subPart] || 99) + ((subPartLoadCount[bInfo.subPart] || 0) * 500) + bGoldenPenalty;
                if (aScore !== bScore) return aScore - bScore;
                // 🔧 重新生成變化：同分(等價)動作之間用 variationSeed 打散，讓「重新生成」能換一批動作。
                //    variationSeed=0 時回傳 0 → 完全穩定確定（同設定→同課表），不影響一般生成。
                const vs = adaptiveProfile?.variationSeed || 0;
                if (vs) {
                    const h = (s) => { let x = (vs * 2654435761) >>> 0; for (let i = 0; i < s.length; i++) x = ((x * 31) + s.charCodeAt(i)) >>> 0; return x; };
                    return h(a.items[0].name) - h(b.items[0].name);
                }
                return 0;
            });

            const bestChunk = pool.shift();

            const allowDuplicate = bestChunk.items.some(ex => {
                const info = analyzeExercise(ex);
                return info.tier === 1 && dayFocus.includes('力量');
            });

            bestChunk.items = bestChunk.items.map(ex => {
                const info = analyzeExercise(ex);

                // 🚀 95 分版本升級：主動作永遠不被替換，且不計入重複限制
                if (dayExistingNames.has(ex.name) && info.role !== 'main' && !allowDuplicate && info.bodyCategory !== 'core') {
                    // 🌟 修正 (Bug-Fix)：補上防呆機制，保護 startsWith
                    let libKey = 'other';
                    if (info.bodyCategory === 'push' && (info.subPart || '').startsWith('chest')) libKey = 'chest';
                    else if (info.bodyCategory === 'push' && (info.subPart || '').startsWith('delt')) libKey = 'shoulder';
                    else if (info.bodyCategory === 'back') libKey = 'back';
                    else if (info.bodyCategory === 'lower') libKey = info.subPart; // Directly matches 'quads', 'glutes', 'hamstrings'
                    else if (info.bodyCategory === 'arms') libKey = info.subPart;
                    else if (info.bodyCategory === 'core') libKey = 'core';

                    const candidates = categorizedLibrary[libKey] || [];
                    const replacement = candidates.find(r => {
                        const rInfo = analyzeExercise(r);
                        // 🌟 SOP v5.0 升級：單日去重為鐵律，但跨日 (planExistingNames) 賦予 T1 與 Core 豁免權
                        const isExempt = rInfo.tier === 1 || rInfo.subPart === 'core';
                        return !dayExistingNames.has(r.name) &&
                            (!planExistingNames.has(r.name) || isExempt) &&
                            rInfo.subPart === info.subPart;
                    });

                    if (replacement) {
                        dayExistingNames.add(ex.name); // 🔒 鎖定被替換的原始動作名稱
                        return {
                            ...replacement,
                            sets: ex.sets, reps: ex.reps, rest: ex.rest,
                            wasOrphan: ex.wasOrphan, // 繼承標籤
                            sourcePlan: 'AI 智能替換'
                        };
                    }
                    // 🌟 修正：替換失敗時應直接跳過動作，不保留重複 (Bug #1)
                    return null;
                }
                return ex;
            }).filter(Boolean); // 移除 null 動作

            bestChunk.items = bestChunk.items.filter(ex => {
                const info = analyzeExercise(ex);
                const allowDuplicate = info.tier === 1 && dayFocus.includes('力量');
                // 🚨 修正 (Bug 8)：同步套用新的 allowDuplicate，並改用 dayExistingNames
                return !dayExistingNames.has(ex.name) || allowDuplicate || info.bodyCategory === 'core' || (ex.sourcePlan || '').includes('AI');
            });

            if (bestChunk.items.length === 0) continue;

            const info = analyzeExercise(bestChunk.items[0]);

            // 🌟 核心修復 1：精準預判容量天花板 (SOP 第四階段 - Volume Caps)
            // 不再只看目前數量，而是計算「目前累積 + 即將加入的新增量」
            const incomingSubPartCounts = {};
            bestChunk.items.forEach(ex => {
                const sp = analyzeExercise(ex).subPart;
                incomingSubPartCounts[sp] = (incomingSubPartCounts[sp] || 0) + 1;
            });

            // 嚴格攔截：檢查「預計新增後」是否會打破上限 (如 2 + 2 > 3)
            const hasOverloadedSubPart = Object.keys(incomingSubPartCounts).some(sp => {
                const limit = SUB_PART_VOLUME_CAPS[sp] || SUB_PART_VOLUME_CAPS.default;
                const projectedVolume = (subPartLoadCount[sp] || 0) + incomingSubPartCounts[sp];
                return sp !== 'core' && projectedVolume > limit;
            });

            if (hasOverloadedSubPart) {
                bestChunk._rejected = (bestChunk._rejected || 0) + 1;
                pool.push(bestChunk);
                consecutiveRejections++;
                continue; // 觸發天花板阻斷
            }

            // 根據該部位的權重佔比，動態算出它今天應該分配到幾個動作
            const maxPerCat = maxPerCatMap[info.bodyCategory] || MAX_SETS;


            // 嚴格攔截：如果這個肌群已經拿滿了它的黃金比例容量，就退件給別人！
            // 🌟 核心修復：發放免死金牌！防止股四頭把下肢容量吃光，導致臀部/腿後掛零
            const isShoulderStarved = (info.subPart || '').startsWith('delt') &&
                dayFocus.includes('肩') &&
                ((subPartLoadCount['delt_front'] || 0) + (subPartLoadCount['delt_side'] || 0) + (subPartLoadCount['delt_rear'] || 0)) < 1;

            const isGluteStarved = info.subPart === 'glutes' && dayFocus.includes('臀') && (subPartLoadCount['glutes'] || 0) < 1;
            const isHamStarved = info.subPart === 'hamstrings' && dayFocus.includes('腿後') && (subPartLoadCount['hamstrings'] || 0) < 1;

            if ((catLoadCount[info.bodyCategory] || 0) >= maxPerCat && !isShoulderStarved && !isGluteStarved && !isHamStarved) {
                // 🛡️ 修復：推回 pool 尾端給後續再評估，不直接丟棄
                bestChunk._rejected = (bestChunk._rejected || 0) + 1;
                pool.push(bestChunk);
                consecutiveRejections++;
                continue;
            }

            // 🌟 核心修復 2：全面封鎖力學模式偷渡 (SOP 第四階段 - Pattern Trimming)
            const duplicatePatterns = bestChunk.items
                .map(ex => analyzeExercise(ex))
                // 🚀 SOP 4.0 修正：不再只擋 Tier 1，單日模式必須唯一
                .filter(info => info.variationGroup !== 'other' && info.role !== 'main' && usedPatterns.has(info.variationGroup))
                .map(info => info.variationGroup);

            if (duplicatePatterns.length > 0) {
                // 若有重複，掃描備用池是否有同部位但不同模式的替代品
                const hasAlternative = pool.some(c =>
                    analyzeExercise(c.items[0]).bodyCategory === info.bodyCategory &&
                    c.items.every(ex => {
                        const p = analyzeExercise(ex).variationGroup;
                        // 🚨 此處的 .includes(p) 現在可以正確阻擋重複的字串了
                        return !usedPatterns.has(p) && !duplicatePatterns.includes(p);
                    })
                );

                /* 只要有替代方案，就嚴格拒絕重複模式，確保力學多樣性。
                   🔴 2026-09 補強：`pool.length > 2` 的用意是「池子快空了就別再挑剔，
                   免得課表排不滿」。但那個逃生門沒有上限 —— 6 天課表排到後段時
                   池子本來就會見底，於是已經有 4~6 個動作的日子還是被塞進第二個
                   同模式動作（實測 leg+glute 精熟 6 天：腿伸展 + 反向北歐腿，
                   兩個都是 quad_iso）。SOP 第四階段允許的例外是「總數極少」，
                   不是「池子空了」。當日動作已達 4 個就一律拒絕重複模式。 */
                const dayHasEnough = selectedChunks.flatMap(c => c.items).length >= 4;
                if (hasAlternative || pool.length > 2 || dayHasEnough) {
                    bestChunk._rejected = (bestChunk._rejected || 0) + 1;
                    pool.push(bestChunk);
                    consecutiveRejections++;
                    continue;
                }
            }

            // 🛡️ P0 修復（單日 CNS 互斥）：掃描整個 chunk（含超級組成員），而非只看 items[0]，
            // 避免「非 extreme 打頭、extreme 藏在第二個」的超級組偷渡第二個極限動作。
            const chunkHasExtreme = bestChunk.items.some(ex => analyzeExercise(ex).cns === 'extreme');
            if (chunkHasExtreme) {
                if (hasTodayExtreme || prevDayExtremeCNS) {
                    bestChunk._rejected = (bestChunk._rejected || 0) + 1;
                    pool.push(bestChunk);
                    consecutiveRejections++;
                    continue;
                }
            }

            const chunkTime = estimateExerciseTime(bestChunk, totalSets === 0, trainingStyle, null, adaptiveProfile);

            // 🚨 手術 2：修正致命的 ReferenceError，使用正確的 expectedTime 與 targetTimeMinutes
            if (expectedTime + chunkTime > targetTimeMinutes) {
                // 🛡️ SOP 修正：已經接近上限時，不再硬塞
                // 🚨 新手防護：確保新手至少能拿到約 8-9 組 (保證出滿 3 個動作)，不要提早 break
                const minRequiredSets = difficultyLevel === 'beginner' ? 8 : 12;
                if (totalSets >= minRequiredSets) {
                    const currentCat = info.bodyCategory;
                    const nextChunk = pool[0];
                    const nextInfo = nextChunk ? analyzeExercise(nextChunk.items[0]) : null;

                    // 只有同肌群還有後續可排時，才允許暫時跳過；否則直接停
                    if (!nextInfo || nextInfo.bodyCategory !== currentCat) {
                        break;
                    }
                }
            }

            // 🚨 SOP 第四階段：最終容量與時間攔截網 (封鎖穿透效應)
            const incomingSets = bestChunk.items.reduce((acc, ex) => acc + (parseInt(ex.sets) || 3), 0);

            // 如果加上這個動作會打破容量天花板，且當天已經累積了一定的基礎訓練量 (>15組)
            if (totalSets + incomingSets > MAX_SETS && totalSets >= 15) {
                bestChunk._rejected = (bestChunk._rejected || 0) + 1;
                pool.push(bestChunk);
                consecutiveRejections++;
                continue;
            }

            // --- 確定加入後的狀態更新 ---
            consecutiveRejections = 0; // 成功加入，重置拒絕計數
            selectedChunks.push(bestChunk);
            expectedTime += chunkTime;

            bestChunk.items.forEach(ex => {
                const exInfo = analyzeExercise(ex);
                dayExistingNames.add(ex.name);
                planExistingNames.add(ex.name); // 🚀 修復 Risk #4：主引擎也更新全局去重清單

                // 🔒 95 分版本：如果是第一次遇到主動作且記憶為空，鎖定它
                // 🚨 核心修復 3：只鎖定「原汁原味」的主動作，避免鎖到 AI 替換品 (Bug #12)
                if (exInfo.role === 'main' && !mainLiftMemory[focusKey] && ex.sourcePlan !== 'AI 智能替換') {
                    mainLiftMemory[focusKey] = ex.name;
                }

                const sets = parseInt(ex.sets) || 3;
                totalSets += sets;
                catLoadCount[exInfo.bodyCategory] = (catLoadCount[exInfo.bodyCategory] || 0) + sets;
                subPartLoadCount[exInfo.subPart] = (subPartLoadCount[exInfo.subPart] || 0) + 1;

                /* 🚀 核心修復：主動作也必須註冊 pattern！
                   (因攔截器已豁免 role === 'main'，註冊 pattern 才能正確防堵後續進來的 T2/T3 同模式冗餘動作)

                   🔴 2026-09 修正：原本這裡多一個 `exInfo.tier <= 2` 條件，
                   等於「只有 T1／T2 會登記模式，T3 孤立動作永遠不登記」——
                   但 SOP 第四階段的「孤立動作模式收斂」規範的就是 T3。
                   實際後果（自動驗收 315 組全部命中同一個病灶）：
                     側躺蚌殼式(T3, glute_abduction) 進場但沒登記
                       → 機械髖外展(T3, 同模式) 檢查時看不到重複 → 一起排進同一天
                   這正是 SOP 驗收工具箱裡「挑了蚌殼式就該拒絕機械外展」那條案例。
                   下方 backfill 路徑（performBackfill）本來就沒有 tier 限制，
                   兩條路徑本來就不一致；改成一致，以 role 而非 tier 判斷。 */
                if (exInfo.variationGroup !== 'other') {
                    usedPatterns.add(exInfo.variationGroup);
                }
            });

            // 🛡️ P0 修復：同樣掃整個 chunk 來點亮 hasTodayExtreme（與上方互斥鎖一致）。
            if (chunkHasExtreme) hasTodayExtreme = true;
            lastAddedCat = info.bodyCategory;

            if (selectedChunks.length >= MAX_CHUNKS) break;
        }

        // --- 階段二：AI 補位 (Backfill) ---
        // 🚨 終極改法：防過熱 (Overheating Fix)
        // 1. 新手「只看個數」，絕對不管時間！滿 3 個就不准再補！
        // 2. 進階模式若時間已經超過 (targetTime - 10)，就強制停止 Backfill，防止 89 分鐘慘劇
        const isTimeNearLimit = expectedTime >= targetTimeMinutes - 10;
        const isTimeShort = expectedTime < targetTimeMinutes - 5 && totalSets < MAX_SETS;

        const shouldBackfill = difficultyLevel === 'beginner'
            ? selectedChunks.length < MAX_CHUNKS
            : (selectedChunks.length < MAX_CHUNKS && !isTimeNearLimit && isTimeShort);

        if (shouldBackfill) {

            // 給予補位引擎充裕的虛擬時間，防止因為 targetTime 較短而在 Backfill 內部提早 break
            const virtualTargetTime = Math.max(targetTimeMinutes, expectedTime + 20);

            const { exercises: filledEx, time: filledTime } = performBackfill(
                selectedChunks.flatMap(c => c.items),
                expectedTime, virtualTargetTime, dayFocus, trainingStyle, // 👈 傳入 virtualTargetTime
                planExistingNames,
                (hasTodayExtreme || prevDayExtremeCNS),
                categorizedLibrary,
                subPartLoadCount,
                SUB_PART_VOLUME_CAPS,
                catLoadCount,
                maxPerCatMap,
                usedPatterns,
                adaptiveProfile,
                difficultyLevel,
                MAX_SETS
            );

            // 🚨 手術 3：貫徹 SOP 1-1 豁免權，確保核心與 Tier 1 在補位時不被誤殺
            filledEx.filter(e => {
                const info = analyzeExercise(e);
                return !planExistingNames.has(e.name) || info.role === 'main' || info.subPart === 'core';
            }).forEach(filler => {
                // 🔪 補位時嚴格攔截：只要滿了，後面送來的動作一律拒收！
                if (selectedChunks.length >= MAX_CHUNKS) return;
                selectedChunks.push({ isSuperset: false, items: [filler] });
                planExistingNames.add(filler.name);
            });
            expectedTime = filledTime;
        }

        // --- 階段二·B：⚡️ 掉塊救援 (Anti-Collapse Emergency Backfill) ---
        // 🔴 Fix(collapse): 跨日去重 (planExistingNames) 會把某肌群庫存吃光，
        // 導致週末/後段訓練日掉到只剩 1-2 個動作。這裡做最後一道救援：
        // 若該日仍低於絕對最小動作數，放寬跨日去重 (傳入空 Set) 再補一次，
        // 寧可讓某動作跨日重複，也不要讓使用者面對空洞的一天。
        const RESCUE_MIN_CHUNKS = difficultyLevel === 'beginner' ? 3 : 4;
        if (selectedChunks.length < RESCUE_MIN_CHUNKS && selectedChunks.length < MAX_CHUNKS) {
            const rescueTargetTime = Math.max(targetTimeMinutes, expectedTime + 20);
            const { exercises: rescueEx, time: rescueTime } = performBackfill(
                selectedChunks.flatMap(c => c.items),
                expectedTime, rescueTargetTime, dayFocus, trainingStyle,
                new Set(),                       // 👈 放寬跨日去重
                (hasTodayExtreme || prevDayExtremeCNS),
                categorizedLibrary,
                subPartLoadCount,
                SUB_PART_VOLUME_CAPS,
                catLoadCount,
                maxPerCatMap,
                usedPatterns,
                adaptiveProfile,
                difficultyLevel,
                MAX_SETS
            );
            // 只接受「當日尚未出現」的動作 (避免同一天內重複)，跨日重複則允許
            rescueEx.forEach(filler => {
                if (selectedChunks.length >= RESCUE_MIN_CHUNKS) return;
                if (dayExistingNames.has(filler.name)) return;
                selectedChunks.push({ isSuperset: false, items: [filler] });
                dayExistingNames.add(filler.name);
            });
            expectedTime = rescueTime;
        }

        // --- 階段三：⚡️ 健力專屬防線：主動作強制徵召 (Main Lift Guarantee) ---
        // 既然全局庫有王牌動作，如果使用者選的課表裡剛好沒有，我們就在健力模式下幫他「跨庫調用」出來！
        const hasMainLift = selectedChunks.some(c => c.items.some(ex => analyzeExercise(ex).role === 'main'));

        if (!hasMainLift && trainingStyle === 'powerlifting') {
            const targetCats = Array.from(allowedCats);
            let emergencyMain = null;

            for (const cat of targetCats) {
                // 🛡️ 修復破綻 3：如果是手臂或核心日，不需要強制徵召三大項，直接跳過！
                if (cat === 'arms' || cat === 'core') continue;

                let libKeys = [];
                if (cat === 'push') libKeys = ['chest', 'shoulder'];
                else if (cat === 'lower') {
                    // 🛡️ 修復破綻 2：精準判定標題！如果標題沒有提到腿前/四頭，就絕對不要抓 quads (保護沙漏型)
                    // 🚨 終極修正：使用正則表達式排除「腿後」，確保只有真正的腿前/全腿才抓 quads
                    const wantsQuads = /腿(?!後)|前|四頭/.test(dayFocus);
                    libKeys = wantsQuads ? ['quads', 'glutes', 'hamstrings'] : ['glutes', 'hamstrings'];
                }
                else if (cat === 'back') libKeys = ['back'];

                for (const libKey of libKeys) {
                    const candidates = categorizedLibrary[libKey] || [];
                    // 🛡️ P0 修復（單日 CNS 互斥）：強制徵召主動作時也要守住「同日 extreme ≤ 1」。
                    //   若當日(或昨日)已有 extreme，禁止再徵召另一個 extreme 複合
                    //   （例：相撲深蹲 secondary-extreme 已在場，又徵召槓鈴深蹲 main-extreme → 雙 extreme）。
                    const blockExtreme = hasTodayExtreme || prevDayExtremeCNS;
                    const globalMainLift = candidates.find(ex => {
                        const i = analyzeExercise(ex);
                        if (i.role !== 'main') return false;
                        if (planExistingNames.has(ex.name) || dayExistingNames.has(ex.name)) return false;
                        if (blockExtreme && i.cns === 'extreme') return false;
                        return true;
                    });

                    if (globalMainLift) {
                        emergencyMain = { isSuperset: false, items: [{ ...globalMainLift, sourcePlan: 'DRVN 健力核心徵召' }] };
                        break;
                    }
                }
                if (emergencyMain) break;
            }

            if (emergencyMain) {
                // 若已滿，先 pop 掉 Tier 最低（最不重要）的一個再塞
                if (selectedChunks.length >= MAX_CHUNKS) {
                    selectedChunks.sort((a, b) => analyzeExercise(b.items[0]).tier - analyzeExercise(a.items[0]).tier);
                    const removed = selectedChunks.shift(); // 移除 Tier 最高（最末位的輔助）
                    expectedTime -= estimateExerciseTime(removed, true, trainingStyle, null, adaptiveProfile);
                    totalSets -= (parseInt(removed.items[0].sets) || 3);
                }
                selectedChunks.unshift(emergencyMain); // 🌟 強制加入清單的最前面
                const info = analyzeExercise(emergencyMain.items[0]);
                expectedTime += estimateExerciseTime(emergencyMain, true, trainingStyle, null, adaptiveProfile);
                totalSets += (parseInt(emergencyMain.items[0].sets) || 3);
                dayExistingNames.add(emergencyMain.items[0].name);
                planExistingNames.add(emergencyMain.items[0].name);
                catLoadCount[info.bodyCategory] = (catLoadCount[info.bodyCategory] || 0) + (parseInt(emergencyMain.items[0].sets) || 3);
                // 🛡️ 徵召的主動作若為 extreme，點亮旗標維持狀態一致
                if (info.cns === 'extreme') hasTodayExtreme = true;

                // 鎖定主動作記憶，確保四週週期化的一致性
                if (!mainLiftMemory[focusKey]) mainLiftMemory[focusKey] = emergencyMain.items[0].name;
            }
        }

        // --- 階段四：⚡️ 最終群聚排序 (SOP 第四階段：演算法自然浮現機制) ---
        // 🚨 廢除強迫置頂的寫死邏輯，直接讓演算法的權重排序發揮作用！
        const SUB_PART_CLUSTER_WEIGHT = {
            chest_mid: 10, chest_upper: 10, chest_lower: 10,
            delt_front: 20, delt_side: 20, delt_rear: 20,
            back_width: 30, back_thickness: 30,
            quads: 40, hamstrings: 44, glutes: 45, calves: 48,
            biceps: 50, triceps: 55, core: 60
        };

        // 🔴 Fix(clustering): 部位群聚必須優先於 Tier！
        // 舊版「Tier 絕對優先」會把 Tier 3 的胸部孤立動作 (如蝴蝶機夾胸) 排到
        // Tier 2 核心動作 (繩索捲腹/死蟲式) 後面，導致胸的動作被拆散、孤零零掉在最下面，
        // 與上方的胸推/上斜推分離。改為「先把同一肌群群聚在一起，肌群內再依 Tier→CNS 排序」，
        // 讓所有胸動作 (重→輕) 連在一起，接著肩、接著核心，符合使用者預期的閱讀順序。
        // 大肌群之間的先後仍由 SUB_PART_CLUSTER_WEIGHT 控制 (胸10→肩20→背30→腿40→臂50→核心60)。
        // 🔴 Fix(focus-cluster): 當日「焦點肌群」的群聚必須排第一。
        // 例：拉力日同時有「背部複合(拉)」與「後三角孤立(推/肩)」時，
        // 原本肩群(20) < 背群(30) 會讓後三角孤立收尾動作跑到背部複合動作前面。
        // 改為依 dayFocus 把焦點大肌群提到最前，焦點內再依 Tier→CNS 排序，
        // 讓主要複合動作領先、孤立/收尾動作自然墊後。
        const focusBoost = { push: 99, back: 99, lower: 99, arms: 99, core: 99 };
        // 依 dayFocus 關鍵字標記焦點順序（越小越前）
        let _fp = 0;
        if (/腿|下肢|臀|四頭|後鏈/.test(dayFocus)) focusBoost.lower = _fp++;
        if (/背|拉/.test(dayFocus)) focusBoost.back = _fp++;
        if (/胸|肩|推/.test(dayFocus)) focusBoost.push = _fp++;
        if (/臂|二頭|三頭/.test(dayFocus)) focusBoost.arms = _fp++;
        if (/腹|核心/.test(dayFocus)) focusBoost.core = _fp++;

        const getMacroClusterRank = (info) => {
            // 先看焦點順序（焦點肌群一定在前），同焦點層級再用固定群聚權重細分。
            const fb = focusBoost[info.bodyCategory];
            const focusRank = (fb !== undefined && fb < 99) ? fb * 1000 : 90000;
            const w = SUB_PART_CLUSTER_WEIGHT[info.subPart];
            const baseRank = (w !== undefined)
                ? Math.floor(w / 10) * 10
                : ({ push: 10, back: 30, lower: 40, arms: 50, core: 60 }[info.bodyCategory] || 99);
            return focusRank + baseRank;
        };

        selectedChunks.sort((cA, cB) => {
            const aI = analyzeExercise(cA.items[0]), bI = analyzeExercise(cB.items[0]);

            // 👑 Step 1: 部位群聚絕對優先 — 同一大肌群的動作一定排在一起
            // (胸 → 肩 → 背 → 腿 → 臂 → 核心)，不會被 Tier 拆散。
            const macroA = getMacroClusterRank(aI);
            const macroB = getMacroClusterRank(bI);
            if (macroA !== macroB) return macroA - macroB;

            // 👑 Step 2: 同肌群內，層級優先 (Tier 1 大重量複合動作先做，孤立動作墊後)
            // 這讓「啞鈴臥推 (Tier1) → 上斜推 (Tier2) → 蝴蝶機夾胸 (Tier3)」自然由重到輕排列。
            if (aI.tier !== bI.tier) return aI.tier - bI.tier;

            // 👑 Step 3: 同肌群同 Tier 內，遵循神經壓力遞減 (先做最耗能的 extreme/high 動作)
            const cnsScoreA = cnsWeight[aI.cns] || 4;
            const cnsScoreB = cnsWeight[bI.cns] || 4;
            if (cnsScoreA !== cnsScoreB) return cnsScoreA - cnsScoreB;

            // 👑 Step 4: 最後用細部位權重微調 (例如中胸/上胸/下胸的相對順序)
            const weightA = SUB_PART_CLUSTER_WEIGHT[aI.subPart] || 99;
            const weightB = SUB_PART_CLUSTER_WEIGHT[bI.subPart] || 99;
            return weightA - weightB;
        });

        // 🔴 Fix(no-isolation-lead): 每天必須由「複合動作」開場，絕不讓 t3 孤立/收尾動作領頭。
        // 焦點群聚排序偶爾會讓某焦點肌群「只有孤立動作」時排到最前（例：背伸展/面拉領頭）。
        // 保險規則：若首個 chunk 是 tier≥3 孤立、且當日存在 tier≤2 複合，
        // 就把第一個複合 chunk 提到最前（訓練原則：每天從最重的複合動作開始）。
        if (selectedChunks.length > 1) {
            const tierOf = (c) => analyzeExercise(c.items[0]).tier || 3;
            if (tierOf(selectedChunks[0]) >= 3) {
                const firstCompoundIdx = selectedChunks.findIndex(c => tierOf(c) <= 2);
                if (firstCompoundIdx > 0) {
                    const [compound] = selectedChunks.splice(firstCompoundIdx, 1);
                    selectedChunks.unshift(compound);
                }
            }
        }

        // 🔪🔥 【終極暴力防線：動作數與時間雙重裁切】 🔥🔪
        // 1. 先無情切斷超過難度上限的動作 (預防 Backfill 暴走)
        if (selectedChunks.length > MAX_CHUNKS) {
            selectedChunks = selectedChunks.slice(0, MAX_CHUNKS);
        }

        // 2. 🛡️ 修復破綻 1：尊重時間預算！
        // 如果時間依舊嚴重超標，允許從尾巴砍掉輔助動作，但必須守住「絕對底線」
        const ABSOLUTE_MIN_CHUNKS = difficultyLevel === 'beginner' ? 3 : 4;
        while (expectedTime > targetTimeMinutes + 5 && selectedChunks.length > ABSOLUTE_MIN_CHUNKS) {
            const removed = selectedChunks.pop(); // 直接從尾部砍掉 Tier 最低的輔助動作
            expectedTime -= estimateExerciseTime(removed, false, trainingStyle, null, adaptiveProfile);
        }

        // Step 4: Final flattening and tag cleanup
        const seenNames = new Set(); // 🚨 終極修復 2：加回最終去重防線
        const finalCleanedEx = selectedChunks.flatMap(c => {
            const isRealSuperset = c.items.length >= 2;
            return c.items.map(ex => {
                if (!isRealSuperset) {
                    const isOrphan = ex.wasOrphan || !!(ex.supersetGroup || ex.isSuperset || ex.superset_id);
                    const {
                        supersetGroup, supersetId, superset, isSuperset, wasOrphan,
                        superset_group, superset_id, superset_index, superset_label,
                        ...cleanEx
                    } = ex;
                    return {
                        ...cleanEx,
                        sourcePlan: isOrphan
                            ? (cleanEx.sourcePlan ? `${cleanEx.sourcePlan} (Orphan Down-tier)` : 'AI Down-tier')
                            : (cleanEx.sourcePlan || 'DRVN Library')
                    };
                }
                return ex;
            });
        }).map(ex => {
            // 🚨 在這裡攔截所有殘留的重複動作
            const key = (ex.name || '').trim();
            if (key && seenNames.has(key)) return null;
            if (key) seenNames.add(key);
            return ex;
        }).filter(Boolean); // 過濾掉剛才標記為 null 的複製人

        // 🌟 Stage 4: Dynamic Superset Engine — 主動尋偶版 (Matchmaking)
        // 修復「線性相鄰謬誤」：Stage 4 排序後同肌群已群聚，
        // 只看下一個永遠配不到拮抗肌，現在改為往後掃描整個陣列主動抽出最佳伴侶。
        if (trainingStyle !== 'powerlifting' && difficultyLevel !== 'beginner') {
            let ssCounter = 0;
            const burnoutMuscles = new Set(); // 🔥 新增：追蹤已榨乾肌群

            for (let i = 0; i < finalCleanedEx.length - 1; i++) {
                const curr = finalCleanedEx[i];

                // 基礎防護：已配對或 Tier 1 絕不捲入超級組
                if (curr.supersetGroup || curr.tier === 1) continue;
                const cInfo = analyzeExercise(curr);

                // 🚨 心肺安全鎖：高/極高 CNS 的動作禁止組成超級組
                // 防止「深蹲 + 硬舉」「保加利亞 + 腿推」等殺心肺組合出現
                if (cInfo.cns === 'extreme' || cInfo.cns === 'high') continue;

                let partnerIdx = -1;
                let ssType = null;
                const macro = getMacroMuscle(cInfo); // 🔥 新增：取得目前動作的大肌群分類

                // 主動尋偶：往後掃描所有剩餘動作，找最適合的伴侶
                for (let j = i + 1; j < finalCleanedEx.length; j++) {
                    const candidate = finalCleanedEx[j];
                    if (candidate.supersetGroup || candidate.tier === 1) continue;

                    const candInfo = analyzeExercise(candidate);
                    if (candInfo.cns === 'extreme' || candInfo.cns === 'high') continue;

                    /* 🔴 2026-09 修正：超級組內部也要守「模式收斂」。
                       原本配對只檢查「同肌群 + 都是 T3」，沒有比對力學模式，
                       於是會把兩個同模式的孤立動作配成一組：
                         反向北歐腿(quad_iso) ＋ 腿伸展(quad_iso) → SS_FUSION_0
                       整個 chunk 被當成一個單位送審，而 duplicatePatterns 只比對
                       chunk 外的 usedPatterns，永遠看不到 chunk 成員之間的重複，
                       所以這種配對可以整組偷渡過模式收斂檢查。
                       榨乾組的本意是「同肌群、不同動作模式」輪流轟炸，
                       同模式配同模式只是把同一件事做兩次，不符 SOP 力學多樣性。 */
                    if (cInfo.variationGroup !== 'other'
                        && candInfo.variationGroup === cInfo.variationGroup) continue;

                    // 🚨 修改 1：榨乾組嚴格限制只能是 Tier 3 配 Tier 3，徹底放過 Tier 2 大重量動作
                    if (difficultyLevel === 'advanced' && isAgonistPair(cInfo, candInfo) && !burnoutMuscles.has(macro)) {
                        if (cInfo.tier >= 3 && candInfo.tier >= 3) {
                            partnerIdx = j;
                            ssType = 'burnout';
                            burnoutMuscles.add(macro); // 🔥 紀錄：這個肌群已經被榨乾過了！
                            break;
                        }
                    }

                    // 次選拮抗組 (Antagonist)：不同肌群、互為拮抗
                    if (partnerIdx === -1 && isAntagonistPair(cInfo, candInfo)) {
                        partnerIdx = j;
                        ssType = 'antagonist';
                        break;
                    }
                }

                // 配對成功：將伴侶從原位抽出，安插到 curr 的下一格
                if (partnerIdx !== -1) {
                    const partner = finalCleanedEx.splice(partnerIdx, 1)[0];
                    finalCleanedEx.splice(i + 1, 0, partner);

                    const ssId = `SS_FUSION_${ssCounter++}`;
                    curr.supersetGroup = ssId;
                    partner.supersetGroup = ssId;
                    curr.supersetType = ssType;
                    partner.supersetType = ssType;
                    curr.rest = '0s';
                    curr.note = ssType === 'antagonist'
                        ? 'Antagonist Superset：接續下個動作不休息'
                        : 'Burnout Superset：徹底榨乾目標肌群';

                    i++; // 跳過剛配對好的伴侶，不重複評估
                }
            }
        }

        return {
            exercises: finalCleanedEx,
            expectedTime: expectedTime
        };
    };

    /* ── 8. 智能分化 ── (動態生成引擎) */
    const days = [];

    // 1. 🌟 終極細化偵測：徹底拆解 Push 與 Lower，精準捕捉真實意圖
    const chestChunks = pools.push.filter(c => analyzeExercise(c.items[0]).subPart.startsWith('chest'));
    const shoulderChunks = pools.push.filter(c => analyzeExercise(c.items[0]).subPart.startsWith('delt'));
    const quadChunks = pools.lower.filter(c => analyzeExercise(c.items[0]).subPart === 'quads');
    const hamChunks = pools.lower.filter(c => analyzeExercise(c.items[0]).subPart === 'hamstrings');
    const gluteChunks = pools.lower.filter(c => analyzeExercise(c.items[0]).subPart === 'glutes');

    const posteriorChainChunks = [...gluteChunks, ...hamChunks];

    const hasChest = chestChunks.length > 0;
    const hasShoulder = shoulderChunks.length > 0;
    const hasQuads = quadChunks.length > 0;
    const hasGlutes = gluteChunks.length > 0 || hamChunks.length > 0;
    const hasBack = pools.back.length > 0;
    const hasArms = pools.arms.length > 0;
    const hasCore = pools.core.length > 0;

    let splitMode = 'Custom';
    let splitLabel = '客製化重點分化';

    const addDayBase = (focus, chunks) => days.push({ focus, _originalChunks: chunks });

    // 🔴 Fix(honest-title)：標題只能講「這天真的有的東西」。
    //   舊版全身日的標題寫死成「推·四頭主導」「拉·後鏈主導」，但使用者若只選了
    //   肩臂＋胸，池子裡一條腿的動作都沒有，標題卻照樣宣告四頭與後鏈 ——
    //   而且 B 日標成「拉」卻只排得出推的動作。這跟本專題「先宣告自己做得到什麼」
    //   的原則正好相反，所以標題一律由實際內容產生。
    const CAT_ZH = { lower: '下肢', push: '推', back: '拉', arms: '臂', core: '核心' };
    const CAT_ORDER = ['lower', 'push', 'back', 'arms', 'core'];
    const titleFromChunks = (prefix, chunkList) => {
        const cats = new Set();
        (chunkList || []).forEach(c => {
            const it = c?.items?.[0];
            if (it) cats.add(analyzeExercise(it).bodyCategory);
        });
        const names = CAT_ORDER.filter(c => cats.has(c)).map(c => CAT_ZH[c]);
        return names.length ? `${prefix} (${names.join('·')})` : prefix;
    };

    // =====================================================================
    // 🌟 排列組合分流引擎 (Permutation Routing Engine) - 防掉塊升級版
    // =====================================================================

    // 🎯 優先判定：daysPerWeek ≤ 2 → 強制 FullBody A/B 退化 (SOP 第三階段)
    // 每週只練 1-2 天時，用全身綜合循環取代任何分化模式
    if (daysPerWeek <= 2) {
        splitMode = 'FullBodyAB';
        // A 側＝推 + 股四頭；B 側＝拉 + 後鏈。手臂與核心量小、恢復快，兩天都可用。
        const aSide = [...pools.push, ...quadChunks];
        const bSide = [...pools.back, ...posteriorChainChunks];
        const shared = [...pools.arms, ...pools.core];

        // 🔴 舊版無論如何都把「所有部位」同時丟給 A 和 B，只有排列順序不同。
        //   但排程階段會依 Tier→CNS 重新排序（SOP 第四階段 權重四級跳），
        //   順序差異會被抹平 → A 和 B 選出來的動作**完全一樣**。
        //   要讓 A/B 真的不同，必須給不同的內容，而不是不同的順序。
        const canSplit = aSide.length >= 2 && bSide.length >= 2;

        if (canSplit) {
            splitLabel = '全身綜合循環 A/B';
            const aChunks = [...aSide, ...shared];
            const bChunks = [...bSide, ...shared];
            const aTitle = titleFromChunks('全身結構 A', aChunks);
            const bTitle = titleFromChunks('全身結構 B', bChunks);
            for (let i = 0; i < daysPerWeek; i++) {
                i % 2 === 0 ? addDayBase(aTitle, aChunks) : addDayBase(bTitle, bChunks);
            }
        } else {
            // 推/拉其中一側根本沒有內容 → 不要假裝有 A/B 兩種日。
            //   （例：只選「肩臂＋胸」時沒有任何拉的動作，硬分只會產生兩天一樣、
            //     而且標題寫著「拉·後鏈」卻全是推的動作。）
            splitLabel = '全身綜合循環';
            const allChunks = [...aSide, ...bSide, ...shared];
            const title = titleFromChunks('全身訓練', allChunks);
            for (let i = 0; i < daysPerWeek; i++) addDayBase(title, allChunks);
        }
    }
    // 🎯 案例 A：比基尼 / 沙漏型專項 (肩 + 背 + 臀) - 完美避開胸與粗腿
    else if (hasShoulder && hasBack && hasGlutes && !hasChest && !hasQuads) {
        splitMode = 'Hourglass';
        splitLabel = '沙漏型雕塑 (肩·背·臀)';

        // 🛡️ 防掉塊：如果用戶偷夾帶了手臂，將其併入上半身日
        const upperHourglass = [...pools.back, ...shoulderChunks, ...(hasArms ? pools.arms : [])];

        for (let i = 0; i < daysPerWeek; i++) {
            if (daysPerWeek === 3) {
                // 3天分化：背肩 -> 臀核 -> 全身綜合
                if (i === 0) addDayBase('上半身輪廓 (背·肩)', upperHourglass);
                else if (i === 1) addDayBase('下肢後鏈 (臀·核心)', [...posteriorChainChunks, ...pools.core]);
                else addDayBase('全身沙漏型強化 (肩·背·臀)', [...upperHourglass, ...posteriorChainChunks]);
            } else {
                // 4天以上交替：後鏈 -> 肩背
                i % 2 === 0
                    ? addDayBase('後鏈與蜜桃臀 (背·臀)', [...pools.back, ...posteriorChainChunks])
                    : addDayBase('肩頸線條與核心 (肩·腹)', [...shoulderChunks, ...pools.core, ...(hasArms ? pools.arms : [])]);
            }
        }
    }
    // 🎯 案例 B：街健 / Bro Split (胸 + 手臂 + 腹)
    else if (hasChest && hasArms && !hasBack && !hasGlutes && !hasQuads) {
        splitMode = 'ChestArms';
        splitLabel = '胸臂強化特訓';

        // 🛡️ 防掉塊：如果用戶偷夾帶了肩膀，將其併入胸推日
        const pushChunks = [...chestChunks, ...(hasShoulder ? shoulderChunks : [])];
        const pushTitle = hasShoulder ? '推力結構 (胸·肩·核心)' : '胸大肌結構 (胸·核心)';

        for (let i = 0; i < daysPerWeek; i++) {
            i % 2 === 0
                ? addDayBase(pushTitle, [...pushChunks, ...pools.core])
                : addDayBase('手臂維度 (二頭·三頭)', [...pools.arms, ...pools.core]);
        }
    }
    // 🎯 案例 C：經典全選 (胸+背+肩+臂+腿) -> 走原本的 PPL 或 Upper/Lower
    // 🛡️ 放寬條件：男生常略過臀部孤立動作，改成 (hasQuads || hasGlutes) 容錯率更高
    else if (hasChest && hasBack && (hasQuads || hasGlutes)) {
        if (daysPerWeek === 3 || daysPerWeek === 6) {
            splitMode = 'PPL'; splitLabel = '標準推拉腿 (PPL)';
            for (let i = 0; i < daysPerWeek; i++) {
                // pools.push 本身就包含了胸跟肩，不會掉塊
                if (i % 3 === 0) addDayBase(SPLIT_FOCUS.push, [...pools.push, ...pools.arms.filter(c => analyzeExercise(c.items[0]).subPart === 'triceps')]);
                else if (i % 3 === 1) addDayBase(SPLIT_FOCUS.pull, [...pools.back, ...pools.arms.filter(c => analyzeExercise(c.items[0]).subPart === 'biceps')]);
                else addDayBase(SPLIT_FOCUS.legs, [...pools.lower]);
            }
        } else if (daysPerWeek === 4) {
            splitMode = 'UpperLower'; splitLabel = '標準上下肢分化 (Upper/Lower)';
            const upperChunks = [...pools.push, ...pools.back, ...pools.arms];
            const lowerChunks = [...pools.lower, ...pools.core];
            for (let i = 0; i < daysPerWeek; i++) {
                if (i % 2 === 0) addDayBase(SPLIT_FOCUS.upper, upperChunks);
                else addDayBase('下半身與核心 (腿·臀·腹)', lowerChunks);
            }
        } else if (daysPerWeek === 5) {
            splitMode = 'ArnoldClassic'; 
            splitLabel = '阿諾經典分化';
            const arnoldPattern = ['chest-back', 'shoulder-arms', 'leg', 'chest-back', 'shoulder-arms'];
            for (let i = 0; i < 5; i++) {
                if (arnoldPattern[i] === 'chest-back') 
                    addDayBase(SPLIT_FOCUS.chest_back, [...chestChunks, ...pools.back]);
                else if (arnoldPattern[i] === 'shoulder-arms')
                    addDayBase(SPLIT_FOCUS.shoulder_arms, [...shoulderChunks, ...pools.arms, ...pools.core]);
                else
                    addDayBase(SPLIT_FOCUS.legs, [...pools.lower, ...pools.core]);
            }
        } else {
            // 同上：A/B 要靠「不同內容」而不是「不同順序」才會真的不同，標題依實際內容產生。
            splitMode = 'FullBody'; splitLabel = '全身綜合循環 (Full Body)';
            const aSide = [...pools.push, ...quadChunks];
            const bSide = [...pools.back, ...posteriorChainChunks];
            const shared = [...pools.arms, ...pools.core];
            if (aSide.length >= 2 && bSide.length >= 2) {
                const aChunks = [...aSide, ...shared];
                const bChunks = [...bSide, ...shared];
                const aTitle = titleFromChunks('全身結構 A', aChunks);
                const bTitle = titleFromChunks('全身結構 B', bChunks);
                for (let i = 0; i < daysPerWeek; i++) {
                    i % 2 === 0 ? addDayBase(aTitle, aChunks) : addDayBase(bTitle, bChunks);
                }
            } else {
                const allChunks = [...aSide, ...bSide, ...shared];
                const title = titleFromChunks('全身訓練', allChunks);
                for (let i = 0; i < daysPerWeek; i++) addDayBase(title, allChunks);
            }
        }
    }
    // 🎯 案例 D：純下肢專項
    else if ((hasQuads || hasGlutes) && !hasChest && !hasShoulder && !hasBack && !hasArms) {
        splitMode = 'LowerSpecialty'; splitLabel = '下肢專項特訓';
        const coreTag = hasCore ? '·核心' : '';

        // 🔴 Fix(glute-drift): 只有「股四頭」與「臀/後鏈」兩側都有足夠動作量時，才做前/後鏈交替分化。
        // 舊版無條件交替，會讓「只選臀」的使用者偶數天拿到空的 quadChunks，
        // 進而被 backfill 硬補成整天股四頭——第一天毫無臀刺激（違反使用者意圖）。
        // 門檻：兩側皆 >= 2 chunk 才前/後鏈交替；任一側不足就改「綜合下肢日」每天混練，
        // 避免硬拆出只有 1 個動作的空洞日（會被 backfill 補成偏離意圖的內容）。
        const quadChunkCount = quadChunks.length;
        const posteriorChunkCount = posteriorChainChunks.length;
        const allLowerChunks = [...quadChunks, ...posteriorChainChunks];

        if (hasQuads && hasGlutes && quadChunkCount >= 2 && posteriorChunkCount >= 2) {
            for (let i = 0; i < daysPerWeek; i++) {
                i % 2 === 0
                    ? addDayBase(`前側主導 (股四頭${coreTag})`, [...quadChunks, ...pools.core])
                    : addDayBase(`後鏈主導 (臀大肌·腿後${coreTag})`, [...posteriorChainChunks, ...pools.core]);
            }
        } else if (hasGlutes && !hasQuads) {
            // 🔴 純臀/後鏈專項：每天都以臀與腿後為主，標題與內容一致
            const gluteTitle = `臀與後鏈雕塑 (臀大肌·腿後${coreTag})`;
            for (let i = 0; i < daysPerWeek; i++) {
                addDayBase(gluteTitle, [...posteriorChainChunks, ...pools.core]);
            }
        } else if (hasQuads && !hasGlutes) {
            // 🔴 純股四頭專項：每天都以股四頭為主
            const quadTitle = `股四頭專項 (前側主導${coreTag})`;
            for (let i = 0; i < daysPerWeek; i++) {
                addDayBase(quadTitle, [...quadChunks, ...pools.core]);
            }
        } else {
            // 🔴 兩側都有但任一側 chunk < 2：不硬拆，改綜合下肢日，標題依實際內容組合
            const parts = [];
            if (hasQuads) parts.push('股四頭');
            if (hasGlutes) parts.push('臀·腿後');
            const mixTitle = `綜合下肢 (${parts.join('·')}${coreTag})`;
            for (let i = 0; i < daysPerWeek; i++) {
                addDayBase(mixTitle, [...allLowerChunks, ...pools.core]);
            }
        }
    }
    // 🎯 案例 E：動態組合 (使用者隨機散選，例如：胸+腿+臀) -> 這裡也要改用細化的 Chunks
    else {
        splitMode = 'DynamicTargeted'; splitLabel = '針對性動態分化';

        let upperFocusNames = [];
        let upperChunks = [];
        if (hasChest) { upperFocusNames.push('胸'); upperChunks.push(...chestChunks); }
        if (hasShoulder) { upperFocusNames.push('肩'); upperChunks.push(...shoulderChunks); }
        if (hasBack) { upperFocusNames.push('背'); upperChunks.push(...pools.back); }
        if (hasArms) { upperFocusNames.push('臂'); upperChunks.push(...pools.arms); }

        let lowerFocusNames = [];
        let lowerChunks = [];
        if (hasQuads) { lowerFocusNames.push('腿前'); lowerChunks.push(...quadChunks); }
        if (hasGlutes) { lowerFocusNames.push('臀/腿後'); lowerChunks.push(...posteriorChainChunks); }
        if (hasCore) { lowerFocusNames.push('腹'); lowerChunks.push(...pools.core); }

        const upperTitle = `上半身專項 (${upperFocusNames.join('·')})`;
        const lowerTitle = `下半身專項 (${lowerFocusNames.join('·')})`;

        for (let i = 0; i < daysPerWeek; i++) {
            if ((hasQuads || hasGlutes) && upperChunks.length > 0) {
                // 有上也有下，就交替排
                i % 2 === 0 ? addDayBase(upperTitle, upperChunks) : addDayBase(lowerTitle, lowerChunks);
            } else {
                // 只有上或只有下，全塞讓後續引擎自己根據 CNS 和容量天花板挑
                addDayBase(`針對性特訓 (${[...upperFocusNames, ...lowerFocusNames].join('·')})`, [...upperChunks, ...lowerChunks]);
            }
        }
    }

    /* ── 9. 四週週期化與驗收 (SOP 第五階段) ── */
    const fusedWeeks = [1, 2, 3, 4].map((w, wIdx) => {
        // 🛡️ 核心修復：新的一週開始前，清空去重記憶！確保可以執行漸進式超負荷
        planExistingNames.clear();

        let prevCNS = false; // 🛡️ 核心修復：解除外部 Race Condition (Bug #6)

        return {
            weekNumber: w,
            name: w === 4 ? '減量超補補償期' : w === 1 ? '結構徵召期' : '容量累積期',
            days: days.map((d, dIdx) => {
                const result = buildDayExercises(
                    d._originalChunks || [],
                    wIdx,
                    d.focus,
                    trainingStyle,
                    targetTimeMinutes,
                    mainLiftMemory,
                    splitMode,
                    prevCNS
                );

                const { exercises: weeklyEx } = result;
                prevCNS = weeklyEx.some(ex => analyzeExercise(ex).cns === 'extreme');

                // 🛡️ 核心修復：SOP 第四階段「標題最終清洗 (Final Title Sanitizer)」
                // 確保標題絕對對齊實練內容，不論分化邏輯如何跳躍
                const finalFocus = (() => {
                    const actualCats = new Set(weeklyEx.map(ex => analyzeExercise(ex).bodyCategory));
                    let cleanedFocus = d.focus;

                    // 掃描標題中提到的肌群，如果實練內容裡沒有，就抹除它
                    if (!actualCats.has('core')) cleanedFocus = cleanedFocus.replace(/[·及與]?(核心|腹|腹部)/g, '');
                    if (!actualCats.has('push')) cleanedFocus = cleanedFocus.replace(/[·及與]?(胸|肩|推力)/g, '');
                    if (!actualCats.has('back')) cleanedFocus = cleanedFocus.replace(/[·及與]?(背|拉力)/g, '');
                    if (!actualCats.has('lower')) cleanedFocus = cleanedFocus.replace(/[·及與]?(腿|下肢|臀|腿部)/g, '');
                    if (!actualCats.has('arms')) cleanedFocus = cleanedFocus.replace(/[·及與]?(臂|二頭|三頭|手臂)/g, '');

                    // 清理殘留的括號或分隔符
                    cleanedFocus = cleanedFocus.replace(/\(\s*[·]\s*/, '(').replace(/\s*[·]\s*\)/, ')').replace(/\(\s*\)/, '').trim();
                    return cleanedFocus || d.focus; // 若洗完變空的則回退原標題
                })();

                // 🛡️ 核心修復：週期化時間重新校準 (Time Recalculation)
                // 廢除硬編碼公式，統一調用 estimateExerciseTime 並傳入 overrideSets，確保與選動作邏輯 100% 同步
                let actualWeeklyTime = 0;

                // 1. 先處理週期化組數與屬性注入
                // 🚀 充血不榨乾優化 3：精熟(Advanced) 預設改為 4 組，5 組保留給超負荷週
                const baseSets = trainingStyle === 'powerlifting'
                    ? 3
                    : (difficultyLevel === 'beginner' ? 3 : 4);

                let dropSetCount = 0;
                // 🚨 修改 2：嚴格限制每天只能有 1 個 Drop Set
                const MAX_DROP_SETS_PER_DAY = 1;

                const finalExercises = weeklyEx.map((ex, exIdx) => {
                    const info = analyzeExercise(ex);

                    // 🚀 充血不榨乾優化 4：階層化組數校正 (Tier-based Sets) 
                    // 孤立動作(Tier 3+) 不需要跟主動作做一樣多組，自動降 1 組
                    let tierAdjustedBaseSets = baseSets;
                    if (trainingStyle !== 'powerlifting' && info.tier >= 3) {
                        tierAdjustedBaseSets = Math.max(2, baseSets - 1);
                    }

                    // 🛡️ Week4 減量修正：SOP 要求 sets × 0.6，
                    // 基準為 Week2/3 的峰值組數（peakSets），而非 Week1 基礎量
                    // 🔴 Fix(deload-plfix): Powerlifting 模式 baseSets=3 不走 tier-adjusted 加成，
                    // peakSets 必須用 baseSets 而非 tierAdjustedBaseSets，避免 PL Week2/3 只有 3 組
                    // 但 peakSets 卻為 4 造成 Deload 多估 1 組的誤差
                    const peakSets = trainingStyle === 'powerlifting'
                        ? baseSets           // PL：peak = baseSets（3組），deload = floor(3×0.6)=2 ✅
                        : tierAdjustedBaseSets + 1; // 健美：peak = tier-adjusted+1，deload = floor(peak×0.6) ✅
                    let targetSets = w === 4
                        ? Math.max(2, Math.floor(peakSets * 0.6))
                        : (w === 2 || w === 3)
                            ? peakSets
                            : tierAdjustedBaseSets;

                    // 🚀 充血不榨乾優化 5：超級組防護網 (Superset Volume Cap)
                    // 強制攔截：榨乾組(burnout)最多3組，拮抗組(antagonist)最多4組
                    if (ex.supersetType === 'burnout') {
                        targetSets = Math.min(targetSets, 3);
                    } else if (ex.supersetType === 'antagonist' || ex.supersetGroup) {
                        targetSets = Math.min(targetSets, 4);
                    }

                    // 原本的 targetSets 算完之後，在它下方加入這段補償邏輯：
                    // 🔧 v9.2: Deload 週強制忽略 intensity offset，防止恢復週被抵消
                    let intensityOffset = 0;
                    if (w !== 4) {
                        if (intensity === 'low') intensityOffset = -1;
                        if (intensity === 'high') intensityOffset = 1;
                    }

                    // 加上偏移量，但保護底線：減量週至少1組，一般週至少2組
                    const minSets = w === 4 ? 1 : 2; 
                    targetSets = Math.max(minSets, targetSets + intensityOffset);

                    // 🛡️ 修復：掃描後面【所有】動作，確認同大肌群真的已全部出完
                    const remainingEx = weeklyEx.slice(exIdx + 1);
                    // 🚨 修改 3：加上 exIdx 條件，強制只允許在課表的「倒數一兩個動作」觸發遞減組
                    const isAbsolutelyLastOfItsMuscleGroup = !remainingEx.some(e => {
                        const eInfo = analyzeExercise(e);
                        return getMacroMuscle(eInfo) === getMacroMuscle(info);
                    }) && exIdx >= weeklyEx.length - 2;

                    // 🛡️ Drop Set 安全防護網：改為白名單機制
                    const dropSetSafeEquipment = ['machine', 'cable', 'dumbbell'];
                    const dropSetSafeSubParts = ['biceps', 'triceps', 'delt_side', 'delt_rear', 'chest_mid', 'back_width', 'calves', 'hamstrings'];
                    const isSafeForDropSet = info.tier >= 3 &&
                        dropSetSafeEquipment.includes(info.equipment || ex.equipment) &&
                        dropSetSafeSubParts.includes(info.subPart);

                    // 🚨 終極護城河：精熟 + 非健力 + 絕對部位收尾 + 安全動作 + 非主動作 + 未被捲入超級組 + 當日配額未滿
                    const isDropSetEligible = difficultyLevel === 'advanced' &&
                        trainingStyle !== 'powerlifting' &&
                        isAbsolutelyLastOfItsMuscleGroup &&
                        isSafeForDropSet &&
                        info.role !== 'main' &&
                        !ex.supersetGroup &&
                        dropSetCount < MAX_DROP_SETS_PER_DAY;

                    if (isDropSetEligible) dropSetCount++;

                    // 🌟 健力與健美的精準 Reps/Rest 矩陣
                    let targetReps, targetRest;

                    if (trainingStyle === 'powerlifting') {
                        const isAdv = difficultyLevel === 'advanced';
                        const isBeg = difficultyLevel === 'beginner';
                        const isDeload = w === 4; // 🚨 抓出第四週 (減量超補期)

                        if (info.tier === 1) {
                            if (isBeg) {
                                // 🛡️ 修復破綻 2：讓新手健力在第四週也能降至 2 組減量
                                targetSets = isDeload ? 2 : 3;
                                targetReps = '8';
                                targetRest = '180s';
                            } else {
                                if (w === 1) { targetSets = isAdv ? 5 : 4; targetReps = '5'; }       // 結構徵召
                                else if (w === 2) { targetSets = isAdv ? 5 : 4; targetReps = '3-5'; } // 強度累積
                                else if (w === 3) { targetSets = isAdv ? 6 : 5; targetReps = '5/3/1'; } // 峰值
                                else { targetSets = isAdv ? 3 : 2; targetReps = '5'; } // 減量
                                targetRest = '240s';
                            }
                        }
                        else if (info.tier === 2) {
                            // 🚨 修正：如果是減量週，輔助動作強制降至 2 組
                            targetSets = isDeload ? 2 : (isAdv ? 4 : 3);
                            targetReps = '5-8';
                            targetRest = '180s';
                        }
                        else {
                            // 🚨 修正：如果是減量週，孤立動作強制降至 2 組
                            targetSets = isDeload ? 2 : (isAdv ? 3 : 2);
                            targetReps = '8-10';
                            targetRest = '120s';
                        }
                    } else if (difficultyLevel === 'beginner') {
                        targetReps = '12-15'; targetRest = '60s'; // 新手先用輕重量打底
                    } else {
                        // 健美模式
                        if (difficultyLevel === 'advanced') {
                            targetReps = info.tier === 1 ? '5-8' : '10-15';
                            targetRest = info.tier === 1 ? '120s' : '90s';
                        } else {
                            targetReps = '8-12'; targetRest = '90s';
                        }
                    }

                    const finalReps = isDropSetEligible ? '12 -> 10 -> 8 -> 6' : targetReps;
                    const finalRest = ex.rest === '0s' ? '0s' : (isDropSetEligible ? '0s' : targetRest);

                    return {
                        ...ex,
                        targetLabel: info.targetLabel,
                        sets: isDropSetEligible ? 4 : targetSets,
                        reps: finalReps,
                        rest: finalRest,
                        ...(isDropSetEligible ? { isDropSet: true, note: 'Drop Set - Each set to failure then reduce weight by 20%' } : {}),
                    };
                });

                // 🛡️ P1 修復：單日總組數硬上限收斂 (Day-level Volume Hard Cap / SOP 硬性不變量)
                // 週期化注入組數時，每個動作各自算 sets，advanced 峰值週(W2/W3)疊起來可能突破
                // SOP 硬上限（健美 28 / 健力 22）→ junk volume / 過度訓練。這裡在時間重算「之前」
                // 做一次收斂：超標時，從「Tier 最高(孤立) → 組數最多」的動作優先各減 1 組，
                // 主動作(role==='main')與 Drop Set 永不被削，孤立動作不低於 2 組、其餘不低於 minSets。
                const DAY_SETS_HARD_CAP = trainingStyle === 'powerlifting' ? 22 : 28;
                const sumSets = (arr) => arr.reduce((s, e) => s + (parseInt(e.sets) || 0), 0);
                let guard = 0;
                while (sumSets(finalExercises) > DAY_SETS_HARD_CAP && guard < 200) {
                    guard++;
                    // 候選：可削的動作（非主、非 Drop Set、目前 sets 還在底線以上）
                    const trimmable = finalExercises
                        .map((e, i) => ({ e, i, info: analyzeExercise(e) }))
                        .filter(({ e, info }) => {
                            const floor = info.tier >= 3 ? 2 : 2; // 孤立與一般動作底線都先抓 2 組
                            return info.role !== 'main' && !e.isDropSet && (parseInt(e.sets) || 0) > floor;
                        })
                        // 先削 Tier 最高(最孤立) → 同 Tier 削組數最多者
                        .sort((a, b) => (b.info.tier - a.info.tier) || ((parseInt(b.e.sets) || 0) - (parseInt(a.e.sets) || 0)));
                    if (trimmable.length === 0) break; // 全部都到底線了，無法再削（避免動到主動作）
                    const tgt = trimmable[0];
                    finalExercises[tgt.i] = { ...tgt.e, sets: (parseInt(tgt.e.sets) || 0) - 1 };
                }

                // 🔧 1.4 孤立動作模式收斂 (SOP 第四階段：同日相同力學模式只留一個)
                //   保險網：少數 5 日分化的補位路徑會讓同 variationGroup 的兩個孤立動作同日並存
                //   (例：直臂下拉 + 繩索直臂肩推 皆 lat_stretch)。這裡在輸出前做最後收斂：
                //   同一 variationGroup 的孤立動作(role!=='main')只保留首個，多餘者在「總數仍足夠」時移除。
                //   已配成超級組者跳過(避免製造孤兒)，主動作不收斂。
                {
                    const FLOOR = difficultyLevel === 'beginner' ? 3 : 4;
                    const seenVG = new Set();
                    // 🔴 Fix(ss-exempt)：原本超級組成員被完全豁免於模式收斂，
                    //   但當一天的動作**全部**都配成超級組時（例如 leg+glute 6 天 advanced 的
                    //   後鏈日），收斂等於整段被跳過 —— 實測 W1D6 同時出現「腿伸展」與
                    //   「反向北歐腿」，兩個都是 quad_iso，而且那天標題是「後鏈主導」。
                    //   之所以豁免是怕拆對產生孤兒，但**下一段 1.5 就是孤兒修復**，
                    //   會把落單的伴侶自動降級為獨立動作並補回 90 秒組間休息。
                    //   所以這裡改成照常收斂，孤兒交給既有機制處理。
                    //   排序：先掃非超級組，再掃超級組成員 —— 同模式衝突時優先犧牲
                    //   超級組那一個（獨立動作的編排意圖比較明確）。
                    const scanOrder = [
                        ...finalExercises.filter((ex) => !ex.supersetGroup),
                        ...finalExercises.filter((ex) => ex.supersetGroup),
                    ];
                    const removable = [];
                    scanOrder.forEach((ex) => {
                        const info = analyzeExercise(ex);
                        if (info.role === 'main' || info.variationGroup === 'other') return;
                        if (seenVG.has(info.variationGroup)) removable.push(ex);
                        else seenVG.add(info.variationGroup);
                    });
                    // 從尾端移除多餘同模式動作，但維持每日動作數不低於底線
                    for (let r = removable.length - 1; r >= 0 && finalExercises.length > FLOOR; r--) {
                        const idx = finalExercises.indexOf(removable[r]);
                        if (idx !== -1) finalExercises.splice(idx, 1);
                    }
                }

                // 🔧 1.5 超級組 key 一致性收斂 (SOP 第一階段：孤兒 / 配對破裂修復)
                //   來源超級組在去重時被 scope 成 `planId::dN::G`，但從動作庫補位的同伴可能
                //   保留原始 key `G`，造成同一對超級組「尾碼相同、key 不一致」→ UI 配對破裂、
                //   被驗收腳本判為孤兒。這裡在輸出前統一收斂：
                //   (1) 同日尾碼相同的兩個單員群組 → 合併為同一 canonical key（重新配對）
                //   (2) 真正落單者 → 清除 superset 標記，降級為獨立動作
                {
                    const tailOf = (g) => String(g).split('::').pop();
                    const byId = {};
                    finalExercises.forEach((ex) => { if (ex.supersetGroup) (byId[ex.supersetGroup] ||= []).push(ex); });
                    const singletons = Object.entries(byId).filter(([, m]) => m.length < 2);
                    const handled = new Set();
                    singletons.forEach(([gid, mem]) => {
                        if (handled.has(gid)) return;
                        const tail = tailOf(gid);
                        const partner = singletons.find(([g2]) => g2 !== gid && !handled.has(g2) && tailOf(g2) === tail);
                        if (partner) {
                            // 重新配對：統一成 scoped key（較具識別性者）
                            const canonical = gid.includes('::') ? gid : (partner[0].includes('::') ? partner[0] : gid);
                            [...mem, ...partner[1]].forEach(e => { e.supersetGroup = canonical; });
                            handled.add(gid); handled.add(partner[0]);
                        } else {
                            // 真孤兒 → 降級為獨立動作（清掉所有 superset 痕跡，補回正常組間休息）
                            mem.forEach(e => {
                                delete e.supersetGroup; delete e.superset; delete e.isSuperset;
                                delete e.supersetId; delete e.superset_id; delete e.supersetType; delete e.wasOrphan;
                                if (e.rest === '0s') e.rest = '90s';
                            });
                            handled.add(gid);
                        }
                    });
                    // 將同組成員聚到相鄰位置（維持首次出現順序），確保 UI 超級組正確渲染
                    const seen = new Set();
                    const clustered = [];
                    finalExercises.forEach((ex) => {
                        if (seen.has(ex)) return;
                        clustered.push(ex); seen.add(ex);
                        if (ex.supersetGroup) {
                            finalExercises.forEach((e2) => {
                                if (!seen.has(e2) && e2.supersetGroup === ex.supersetGroup) { clustered.push(e2); seen.add(e2); }
                            });
                        }
                    });
                    finalExercises.length = 0;
                    finalExercises.push(...clustered);
                }

                // 2. 重新分組以計算時間 (考慮超級組加成)
                const tempChunks = [];
                const processedIndices = new Set();
                finalExercises.forEach((ex, idx) => {
                    if (processedIndices.has(idx)) return;
                    const gid = ex.supersetGroup || ex.superset_id || ex.supersetId;
                    if (gid) {
                        const group = finalExercises.filter((e, i) => (e.supersetGroup || e.superset_id || e.supersetId) === gid);
                        group.forEach(ge => {
                            const originalIdx = finalExercises.indexOf(ge);
                            if (originalIdx !== -1) processedIndices.add(originalIdx);
                        });
                        tempChunks.push({ isSuperset: true, items: group });
                    } else {
                        tempChunks.push({ isSuperset: false, items: [ex] });
                        processedIndices.add(idx);
                    }
                });

                tempChunks.forEach(c => {
                    actualWeeklyTime += estimateExerciseTime(c, actualWeeklyTime === 0, trainingStyle, null, adaptiveProfile);
                });

                return {
                    dayNumber: dIdx + 1,
                    weekday: getSmartWeekday(dIdx, days.length),
                    focus: finalFocus,
                    time: Math.round(actualWeeklyTime),
                    exercises: finalExercises
                };
            })
        };
    });

    // 🔴 Fix(inverted-wave)：單日組數上限把波浪載荷弄反了，這裡把它扳回來。
    //
    //   DAY_SETS_HARD_CAP（健美 28 / 健力 22）是**逐週獨立**套用的。W2/W3 是峰值週、
    //   組數最高 → 超標最多 → 被削最兇；W4 減量週組數最低 → 幾乎不被削。
    //   結果就是「越該練重的那一週被砍越多」。
    //
    //   實測 肩臂+胸 · 1 天 · advanced/bodybuilding/high 的 EZ Bar 彎舉：
    //       W1 = 4 組、W2 = 2、W3 = 2、W4 = 3   ← 減量週反而比超負荷週還多
    //
    //   W2/W3 已經卡在硬上限、不能往上加，所以正確做法是**把 W1 壓到不高於 W2/W3**，
    //   讓 W1 ≤ W2/W3 的遞增關係重新成立（W4 的減量由下面既有的區塊負責）。
    //   只動非主動作、且不低於 2 組底線，主動作與 Drop Set 不碰。
    {
        const [w1, w2, w3, w4] = fusedWeeks;
        const setsOfEx = (e) => parseInt(e.sets) || 0;
        // 同一天、同名動作在 W2/W3 的實際組數下限（＝真正的峰值，已被硬上限削過）
        const actualPeak = (di, name) => {
            const v = [w2, w3]
                .map((w) => (w?.days?.[di]?.exercises || []).find((x) => x.name === name))
                .filter(Boolean).map(setsOfEx);
            return v.length ? Math.min(...v) : null;
        };
        const clampWeek = (wk, cmp) => {
            if (!wk) return;
            (wk.days || []).forEach((d, di) => {
                (d.exercises || []).forEach((e, ei) => {
                    const info = analyzeExercise(e);
                    if (info.role === 'main' || e.isDropSet) return;   // 主動作與 Drop Set 不動
                    const peak = actualPeak(di, e.name);
                    if (peak == null) return;                          // W2/W3 沒這個動作就不比
                    if (cmp(setsOfEx(e), peak)) d.exercises[ei] = { ...e, sets: Math.max(2, peak) };
                });
            });
        };
        // W1 不得高於實際峰值（否則 W1 → W2 是遞減）
        clampWeek(w1, (cur, peak) => cur > peak);
        // W4 也不得高於實際峰值 —— W4 是用「理論峰值」算 ×0.6 的，
        //   但 W2/W3 已被硬上限削到更低，導致減量週反而比超負荷週重。
        clampWeek(w4, (cur, peak) => cur > peak);
    }

    // 🔧 減量週(W4)總量保證 (SOP 第五階段)：逐日確保「動作數不超過一般週(W1)、且總組數不高於 W1」。
    //   週次旋轉與核心必修會讓 W4 某些日選到比 W1 多的動作，造成「減量週反而加量」。
    //   這裡逐日校正：先把多出的孤立/輔助動作(非主)從尾端裁掉對齊 W1 動作數，
    //   若總組數仍 ≥ W1，再對孤立動作逐組降至底線 2，直到嚴格低於 W1。
    {
        const w1 = fusedWeeks[0], w4 = fusedWeeks[3];
        const daySets = (d) => (d.exercises || []).reduce((s, e) => s + (parseInt(e.sets) || 0), 0);
        const weekSets = (w) => (w.days || []).reduce((s, d) => s + daySets(d), 0);
        if (w1 && w4) {
            // 1) 逐日動作數對齊：W4 每日不得多於對應 W1 日（移除非主、未捲入超級組者，避免拆對成孤兒）
            w4.days.forEach((d4, i) => {
                const d1 = w1.days[i];
                if (!d1) return;
                while ((d4.exercises || []).length > d1.exercises.length) {
                    const idx = [...d4.exercises].reverse().findIndex(e => analyzeExercise(e).role !== 'main' && !e.supersetGroup);
                    if (idx === -1) break;
                    d4.exercises.splice(d4.exercises.length - 1 - idx, 1);
                }
            });
            // 2) 週總組數保證：W4 整週總量必須「嚴格低於」W1（涵蓋 2 日 FullBody A/B 日次錯位的情況）。
            //    逐步把 W4 內「非主、未捲入超級組、tier≥3」的孤立動作降至底線 2；仍不夠時移除多餘孤立動作。
            let guard = 0;
            while (weekSets(w4) >= weekSets(w1) && guard < 300) {
                guard++;
                const cands = [];
                w4.days.forEach((d4) => d4.exercises.forEach((e, idx) => {
                    const info = analyzeExercise(e);
                    if (info.role !== 'main' && !e.supersetGroup) cands.push({ d4, idx, e, info });
                }));
                // 先降組數（>2 者），再考慮移除（已到底線 2 的孤立動作）
                const reducible = cands.filter(c => (parseInt(c.e.sets) || 0) > 2)
                    .sort((a, b) => (b.info.tier - a.info.tier) || ((parseInt(b.e.sets) || 0) - (parseInt(a.e.sets) || 0)));
                if (reducible.length) {
                    const t = reducible[0];
                    t.d4.exercises[t.idx] = { ...t.e, sets: (parseInt(t.e.sets) || 0) - 1 };
                    continue;
                }
                // 全到底線 → 移除一個最高 tier 的孤立動作（保留每日至少 2 個動作）
                const removable = cands.filter(c => c.d4.exercises.length > 2)
                    .sort((a, b) => b.info.tier - a.info.tier)[0];
                if (removable) { removable.d4.exercises.splice(removable.idx, 1); continue; }
                // 仍卡住（多出的是「非主超級組」核心對）→ 整組移除一個非主超級組，避免製造孤兒
                let removedGroup = false;
                for (const d4 of w4.days) {
                    const groups = {};
                    d4.exercises.forEach((e, idx) => { if (e.supersetGroup) (groups[e.supersetGroup] ||= []).push(idx); });
                    const target = Object.entries(groups).find(([, idxs]) =>
                        idxs.every(i => analyzeExercise(d4.exercises[i]).role !== 'main')
                        && d4.exercises.length - idxs.length >= 2);
                    if (target) {
                        target[1].sort((a, b) => b - a).forEach(i => d4.exercises.splice(i, 1));
                        removedGroup = true; break;
                    }
                }
                if (removedGroup) continue;
                // 最終保險：減量週仍超標（多出的都是 main 角色，如硬舉/懸垂舉腿/腹輪）→
                //   對組數最高的 main 動作降 1 組（最低 2）。減量週降 main 組數是合理的。
                const mainReducible = w4.days
                    .flatMap(d4 => d4.exercises.map((e, idx) => ({ d4, idx, e })))
                    .filter(c => (parseInt(c.e.sets) || 0) > 2)
                    .sort((a, b) => (parseInt(b.e.sets) || 0) - (parseInt(a.e.sets) || 0))[0];
                if (!mainReducible) break;
                mainReducible.d4.exercises[mainReducible.idx] = { ...mainReducible.e, sets: (parseInt(mainReducible.e.sets) || 0) - 1 };
            }
        }
    }

    const splitLabels = { PPL: '標準推拉腿 (PPL) 循環', ArnoldClassic: '阿諾經典拮抗分化', ArnoldPushArms: '錯峰推力手臂分化', LowerAB: '下肢前後側 A/B 輪替', UpperLower: '標準上下肢分化' };

    // 🌟 核心修復：精準計算「每日平均真實訓練時間」
    // 🔴 Fix(time-banner): 排除第4週(減量超補期)。減量週時長明顯低於一般週(常少 30-40%)，
    // 納入平均會把 banner 拉低，讓使用者誤以為一般訓練日也只需這麼短。banner 應反映
    // 使用者主要會經歷的「一般/峰值週」時長體感。
    let totalPlanTime = 0;
    let totalActiveDays = 0;
    fusedWeeks.forEach(w => {
        if (w.weekNumber === 4) return; // 跳過減量週
        w.days.forEach(d => {
            if (d.exercises && d.exercises.length > 0) {
                totalPlanTime += d.time;
                totalActiveDays++;
            }
        });
    });

    // 算出平均值，若異常則退回 targetTimeMinutes
    const avgPlanTime = totalActiveDays > 0 ? Math.round(totalPlanTime / totalActiveDays) : targetTimeMinutes;
    // 動態產生 UI 需要的字串格式 (例如: 55-65分鐘)
    const dynamicTimeRange = `${Math.max(10, avgPlanTime - 5)}-${avgPlanTime + 5}分鐘`;

    // ✅ splitLabel 此時已完整初始化，可安全呼叫
    const planNames = generateFusionName(plans, splitLabel);

    return {
        id: `fusion_${Date.now()}`,
        isFusion: true,
        name: planNames,
        bodyPartLabel: splitLabel,
        description: `基於 ${splitLabel} 邏輯優化。`,
        duration: 28,
        estimatedTime: dynamicTimeRange, // 🚨 終極修復：打通資料流，把算好的真實時間餵給前端！
        tags: [splitLabel, '動態補位', 'CNS保護'],
        levels: {
            fusion: {
                key: 'fusion',
                label: '智能客製',
                recommendedDays: daysPerWeek,
                weeks: fusedWeeks,
            },
        },
    };
};
