/**
 * Tag to Muscle Group Mapping System
 * Maps pain-point hashtags to anatomical muscle groups for visualization
 */

export const TAG_TO_MUSCLES = {
    // 體態改善類
    "#改善圓肩": ["posterior_deltoid", "trapezius", "rhomboid", "infraspinatus"],
    "#駝背矯正": ["upper_back", "trapezius", "rhomboid", "erector_spinae"],
    "#骨盆前傾": ["glutes", "hamstrings", "core", "hip_flexors"],
    "#腰痠背痛": ["lower_back", "erector_spinae", "core"],

    // 肌肉強化類
    "#增強胸肌": ["pectoralis_major", "pectoralis_minor", "anterior_deltoid"],
    "#壯大背肌": ["latissimus_dorsi", "trapezius", "rhomboid", "teres_major"],
    "#強化核心": ["rectus_abdominis", "obliques", "transverse_abdominis"],
    "#粗壯手臂": ["biceps", "triceps", "forearm"],
    "#練出腹肌": ["rectus_abdominis", "obliques"],
    "#腿部訓練": ["quadriceps", "hamstrings", "glutes", "calves"],
    "#肩膀增肌": ["deltoids", "trapezius"],

    // 力量提升類
    "#提升臥推": ["pectoralis_major", "triceps", "anterior_deltoid"],
    "#深蹲進步": ["quadriceps", "glutes", "hamstrings", "core"],
    "#硬舉突破": ["erector_spinae", "glutes", "hamstrings", "trapezius"],
    "#爆發力": ["fast_twitch_全身"],

    // 減脂塑形類
    "#消除啤酒肚": ["rectus_abdominis", "obliques", "core"],
    "#甩掉蝴蝶袖": ["triceps"],
    "#緊實大腿": ["quadriceps", "hamstrings", "adductors"],
    "#翹臀計劃": ["glutes", "hamstrings"],

    // 運動表現類
    "#增強爆發力": ["全身複合肌群"],
    "#提升耐力": ["心肺_全身耐力肌"],
    "#運動表現": ["全身功能性"],
};

export const MUSCLE_GROUPS = {
    // 胸部
    pectoralis_major: {
        name: "胸大肌",
        category: "chest",
        svgId: "chest-major"
    },
    pectoralis_minor: {
        name: "胸小肌",
        category: "chest",
        svgId: "chest-minor"
    },

    // 背部
    latissimus_dorsi: {
        name: "闊背肌",
        category: "back",
        svgId: "back-lats"
    },
    trapezius: {
        name: "斜方肌",
        category: "back",
        svgId: "back-traps"
    },
    rhomboid: {
        name: "菱形肌",
        category: "back",
        svgId: "back-rhomboid"
    },
    erector_spinae: {
        name: "豎脊肌",
        category: "back",
        svgId: "back-erector"
    },
    teres_major: {
        name: "大圓肌",
        category: "back",
        svgId: "back-teres"
    },
    infraspinatus: {
        name: "棘下肌",
        category: "back",
        svgId: "back-infra"
    },

    // 肩部
    anterior_deltoid: {
        name: "前三角肌",
        category: "shoulders",
        svgId: "shoulder-anterior"
    },
    posterior_deltoid: {
        name: "後三角肌",
        category: "shoulders",
        svgId: "shoulder-posterior"
    },
    deltoids: {
        name: "三角肌",
        category: "shoulders",
        svgId: "shoulder-all"
    },

    // 手臂
    biceps: {
        name: "二頭肌",
        category: "arms",
        svgId: "arm-biceps"
    },
    triceps: {
        name: "三頭肌",
        category: "arms",
        svgId: "arm-triceps"
    },
    forearm: {
        name: "前臂",
        category: "arms",
        svgId: "arm-forearm"
    },

    // 核心
    rectus_abdominis: {
        name: "腹直肌",
        category: "core",
        svgId: "core-rectus"
    },
    obliques: {
        name: "腹斜肌",
        category: "core",
        svgId: "core-obliques"
    },
    transverse_abdominis: {
        name: "腹橫肌",
        category: "core",
        svgId: "core-transverse"
    },
    core: {
        name: "核心肌群",
        category: "core",
        svgId: "core-all"
    },

    // 下背
    lower_back: {
        name: "下背部",
        category: "lowerback",
        svgId: "back-lower"
    },

    // 腿部
    quadriceps: {
        name: "股四頭肌",
        category: "legs",
        svgId: "leg-quads"
    },
    hamstrings: {
        name: "膕繩肌",
        category: "legs",
        svgId: "leg-hamstrings"
    },
    glutes: {
        name: "臀大肌",
        category: "legs",
        svgId: "leg-glutes"
    },
    calves: {
        name: "小腿肌",
        category: "legs",
        svgId: "leg-calves"
    },
    adductors: {
        name: "內收肌",
        category: "legs",
        svgId: "leg-adductors"
    },
    hip_flexors: {
        name: "髖屈肌",
        category: "legs",
        svgId: "leg-hip-flexors"
    },

    // 上背
    upper_back: {
        name: "上背部",
        category: "back",
        svgId: "back-upper"
    },
};

/**
 * Get muscle groups from selected hashtags
 * @param {string[]} hashtags - Array of hashtag strings (e.g., ["#改善圓肩", "#增強胸肌"])
 * @returns {string[]} - Array of unique muscle group IDs
 */
export const getMusclesFromTags = (hashtags) => {
    if (!hashtags || hashtags.length === 0) return [];

    const muscles = new Set();

    hashtags.forEach(tag => {
        /* 標籤是逐字查表的。全庫把「計畫」統一成「計劃」之後，
           使用者先前存下來的「#翹臀計畫」就查不到了 —— 查不到不會報錯，
           只會安靜地少算一組肌群。舊寫法退一步再查一次。 */
        const tagMuscles = TAG_TO_MUSCLES[tag]
            || TAG_TO_MUSCLES[String(tag).replace(/計畫/g, '計劃')];
        if (tagMuscles) {
            tagMuscles.forEach(muscle => muscles.add(muscle));
        }
    });

    return Array.from(muscles);
};

/**
 * Get muscle details from muscle IDs
 * @param {string[]} muscleIds - Array of muscle IDs
 * @returns {object[]} - Array of muscle detail objects
 */
export const getMuscleDetails = (muscleIds) => {
    return muscleIds
        .map(id => MUSCLE_GROUPS[id])
        .filter(Boolean);
};

/**
 * Get all unique categories from muscle IDs
 * @param {string[]} muscleIds - Array of muscle IDs
 * @returns {string[]} - Array of unique categories
 */
export const getMuscleCategories = (muscleIds) => {
    const categories = new Set();
    muscleIds.forEach(id => {
        const muscle = MUSCLE_GROUPS[id];
        if (muscle) categories.add(muscle.category);
    });
    return Array.from(categories);
};

export default {
    TAG_TO_MUSCLES,
    MUSCLE_GROUPS,
    getMusclesFromTags,
    getMuscleDetails,
    getMuscleCategories
};
