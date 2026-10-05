/**
 * 痛點標籤資料庫
 * 分類：姿勢問題、肌肉失衡、疼痛改善、運動表現
 */

export const painPointCategories = {
    posture: {
        label: '姿勢問題',
        color: '#FF6B6B',
        tags: [
            {
                id: 'round_shoulders',
                name: '#改善圓肩',
                muscles: ['posterior_deltoid', 'trapezius', 'rhomboids', 'infraspinatus'],
                description: '強化後側肩膀和上背，拉回圓肩',
                priority: ['back', 'shoulders']
            },
            {
                id: 'forward_head',
                name: '#改善頭前傾',
                muscles: ['trapezius', 'neck_extensors', 'deep_neck_flexors'],
                description: '強化頸部深層肌群，改善烏龜頸',
                priority: ['back', 'core']
            },
            {
                id: 'anterior_pelvic_tilt',
                name: '#改善骨盆前傾',
                muscles: ['core', 'glutes', 'hamstrings'],
                description: '強化核心和臀部，矯正骨盆角度',
                priority: ['core', 'legs']
            },
            {
                id: 'posterior_pelvic_tilt',
                name: '#改善骨盆後傾',
                muscles: ['hip_flexors', 'lower_back', 'quads'],
                description: '放鬆臀部、強化髖屈肌和下背',
                priority: ['legs', 'core']
            },
            {
                id: 'kyphosis',
                name: '#改善駝背',
                muscles: ['trapezius', 'rhomboids', 'erector_spinae', 'posterior_deltoid'],
                description: '全面強化背部肌群，挺直脊椎',
                priority: ['back']
            },
            {
                id: 'lordosis',
                name: '#改善腰椎前凸',
                muscles: ['core', 'glutes', 'hamstrings'],
                description: '穩定腰椎，減少過度彎曲',
                priority: ['core', 'legs']
            }
        ]
    },

    muscle_imbalance: {
        label: '肌肉失衡',
        color: '#4ECDC4',
        tags: [
            {
                id: 'weak_chest',
                name: '#增強胸肌',
                muscles: ['chest'],
                description: '全方位發展胸部力量和體積',
                priority: ['chest']
            },
            {
                id: 'weak_back',
                name: '#增強背肌',
                muscles: ['latissimus_dorsi', 'trapezius', 'rhomboids', 'teres_major'],
                description: '打造強壯背部，改善體態',
                priority: ['back']
            },
            {
                id: 'weak_legs',
                name: '#增強腿部',
                muscles: ['quads', 'hamstrings', 'glutes', 'calves'],
                description: '全面發展下肢力量和爆發力',
                priority: ['legs']
            },
            {
                id: 'weak_shoulders',
                name: '#增強肩膀',
                muscles: ['anterior_deltoid', 'medial_deltoid', 'posterior_deltoid'],
                description: '360度肩膀發展，預防受傷',
                priority: ['shoulders']
            },
            {
                id: 'weak_arms',
                name: '#增強手臂',
                muscles: ['biceps', 'triceps', 'forearms'],
                description: '打造粗壯手臂圍度',
                priority: ['arms']
            },
            {
                id: 'weak_core',
                name: '#增強核心',
                muscles: ['core', 'obliques', 'transverse_abdominis'],
                description: '建立強大核心穩定性',
                priority: ['core']
            },
            {
                id: 'weak_glutes',
                name: '#增強臀部',
                muscles: ['glutes', 'hip_abductors', 'hip_external_rotators'],
                description: '強化臀部力量，改善下肢功能',
                priority: ['legs']
            },
            {
                id: 'left_right_imbalance',
                name: '#改善左右失衡',
                muscles: ['full_body'],
                description: '單邊訓練為主，平衡左右力量',
                priority: ['chest', 'back', 'legs', 'shoulders']
            }
        ]
    },

    pain_relief: {
        label: '疼痛改善',
        color: '#95E1D3',
        tags: [
            {
                id: 'lower_back_pain',
                name: '#改善下背痛',
                muscles: ['core', 'glutes', 'hamstrings', 'erector_spinae'],
                description: '強化核心和臀部，減輕下背負擔',
                priority: ['core', 'legs']
            },
            {
                id: 'knee_pain',
                name: '#改善膝蓋痛',
                muscles: ['quads', 'hamstrings', 'glutes', 'hip_adductors'],
                description: '平衡腿部力量，穩定膝關節',
                priority: ['legs']
            },
            {
                id: 'shoulder_pain',
                name: '#改善肩膀痛',
                muscles: ['rotator_cuff', 'posterior_deltoid', 'trapezius'],
                description: '強化旋轉肌群，穩定肩關節',
                priority: ['shoulders', 'back']
            },
            {
                id: 'neck_pain',
                name: '#改善頸部痛',
                muscles: ['trapezius', 'neck_extensors', 'scalenes'],
                description: '放鬆過緊肌肉，強化弱側',
                priority: ['back']
            },
            {
                id: 'plantar_fasciitis',
                name: '#改善足底筋膜炎',
                muscles: ['calves', 'tibialis_anterior', 'foot_intrinsics'],
                description: '強化小腿和足部肌群',
                priority: ['legs']
            }
        ]
    },

    performance: {
        label: '運動表現',
        color: '#F38181',
        tags: [
            {
                id: 'increase_bench',
                name: '#提升臥推重量',
                muscles: ['chest', 'triceps', 'anterior_deltoid'],
                description: '專項訓練，突破臥推瓶頸',
                priority: ['chest', 'arms']
            },
            {
                id: 'increase_squat',
                name: '#提升深蹲重量',
                muscles: ['quads', 'glutes', 'hamstrings', 'core'],
                description: '專項訓練，突破深蹲瓶頸',
                priority: ['legs', 'core']
            },
            {
                id: 'increase_deadlift',
                name: '#提升硬舉重量',
                muscles: ['erector_spinae', 'glutes', 'hamstrings', 'trapezius', 'forearms'],
                description: '專項訓練，突破硬舉瓶頸',
                priority: ['back', 'legs']
            },
            {
                id: 'increase_pullup',
                name: '#增加引體次數',
                muscles: ['latissimus_dorsi', 'biceps', 'trapezius'],
                description: '背部專項，提升引體向上能力',
                priority: ['back', 'arms']
            },
            {
                id: 'muscle_gain',
                name: '#增肌增重',
                muscles: ['full_body'],
                description: '高容量訓練，全身肌肉發展',
                priority: ['chest', 'back', 'legs']
            },
            {
                id: 'fat_loss',
                name: '#減脂塑形',
                muscles: ['full_body'],
                description: '高強度間歇，保持肌肉量',
                priority: ['legs', 'core', 'chest']
            },
            {
                id: 'athletic_performance',
                name: '#提升爆發力',
                muscles: ['fast_twitch'],
                description: '爆發力訓練，提升運動表現',
                priority: ['legs', 'core']
            },
            {
                id: 'endurance',
                name: '#增強耐力',
                muscles: ['slow_twitch'],
                description: '肌耐力訓練，延長運動時間',
                priority: ['legs', 'core', 'back']
            },
            {
                id: 'flexibility',
                name: '#提升柔軟度',
                muscles: ['hamstrings', 'hip_flexors', 'shoulders'],
                description: '拉筋伸展，增加關節活動度',
                priority: ['legs', 'shoulders']
            }
        ]
    }
};

// 扁平化所有標籤（方便查詢）
export const allPainPointTags = Object.values(painPointCategories)
    .flatMap(category => category.tags);

// 根據標籤 ID 獲取標籤信息
export const getTagById = (tagId) => {
    return allPainPointTags.find(tag => tag.id === tagId);
};

// 根據標籤名稱獲取標籤信息
export const getTagByName = (tagName) => {
    return allPainPointTags.find(tag => tag.name === tagName);
};

// 根據標籤獲取目標肌群
export const getMusclesFromTags = (tagNames) => {
    const muscles = new Set();
    tagNames.forEach(tagName => {
        const tag = getTagByName(tagName);
        if (tag) {
            tag.muscles.forEach(muscle => muscles.add(muscle));
        }
    });
    return Array.from(muscles);
};

// 根據標籤獲取訓練優先級
export const getTrainingPriorities = (tagNames) => {
    const priorities = new Set();
    tagNames.forEach(tagName => {
        const tag = getTagByName(tagName);
        if (tag) {
            tag.priority.forEach(p => priorities.add(p));
        }
    });
    return Array.from(priorities);
};

// 獲取所有標籤名稱（用於下拉選單）
export const getAllTagNames = () => {
    return allPainPointTags.map(tag => tag.name);
};

// 按分類獲取標籤
export const getTagsByCategory = (categoryKey) => {
    return painPointCategories[categoryKey]?.tags || [];
};

export default {
    painPointCategories,
    allPainPointTags,
    getTagById,
    getTagByName,
    getMusclesFromTags,
    getTrainingPriorities,
    getAllTagNames,
    getTagsByCategory
};
