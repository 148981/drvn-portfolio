import applyWeek4Deload from '../utils/planDeloadNormalizer';
// src/data/backPlanData.js

const SS_GAP    = 15;
const TRANSITION = 45;

export const calcExDuration = (ex) => {
  const EXEC_SEC     = ex.unilateral ? 45 : 25;
  const interSetRest = ex.superset ? SS_GAP : (ex.rest || 60);
  const restTime     = (ex.sets - 1) * interSetRest;
  const trans        = ex.superset ? SS_GAP : TRANSITION;
  return Math.round((ex.sets * EXEC_SEC) + restTime + trans);
};

export const trimDay = (exercises, targetMinutes) => {
  const budget = targetMinutes * 60;
  let total    = 0;
  const result = [];
  for (const ex of exercises) {
    const dur = calcExDuration(ex);
    if (total + dur <= budget + 180) { 
      result.push({ ...ex, durationSec: dur });
      total += dur;
    }
    if (total >= budget) break;
  }
  return { exercises: result, totalSec: total };
};

/* ═══════════════════════════════════════════════════════
   基礎動作工廠函式 (已與 EXERCISE_MASTER_DB 完美對齊)
═══════════════════════════════════════════════════════ */

// ── 垂直拉 (Vertical Pull) ──
const PULL_UP     = (s, r, rest, note) => ({ name: '引體向上',     nameEn: 'Pull Up',               sets: s, reps: r, rest, target: '背部闊度', tier: 1, ...(note ? { note } : {}) });
const PULLDOWN    = (s, r, rest, note) => ({ name: '下拉',         nameEn: 'Lat Pulldown',          sets: s, reps: r, rest, target: '背部闊度', tier: 2, ...(note ? { note } : {}) });
const REV_PULLDOWN= (s, r, rest, note) => ({ name: '反手下拉',     nameEn: 'Reverse Grip Pulldown', sets: s, reps: r, rest, target: '下背闊肌', tier: 2, ...(note ? { note } : {}) });
const STR_ARM     = (s, r, rest, note) => ({ name: '直臂下拉',     nameEn: 'Straight Arm Pulldown', sets: s, reps: r, rest, target: '背闊肌拉伸', tier: 3, ...(note ? { note } : {}) });

// ── 水平拉 (Horizontal Pull) ──
const BB_ROW      = (s, r, rest, note) => ({ name: '槓鈴划船',     nameEn: 'Barbell Row',           sets: s, reps: r, rest, target: '背部厚度', tier: 1, ...(note ? { note } : {}) });
const PENDLAY_ROW = (s, r, rest, note) => ({ name: 'Pendlay 划船', nameEn: 'Pendlay Row',           sets: s, reps: r, rest, target: '背部厚度爆發力', tier: 1, ...(note ? { note } : {}) });
const BENT_ROW    = (s, r, rest, note) => ({ name: '俯身划船',     nameEn: 'Bent Over Row',         sets: s, reps: r, rest, target: '背部厚度', tier: 2, ...(note ? { note } : {}) });
const SEATED_ROW  = (s, r, rest, note) => ({ name: '坐姿划船',     nameEn: 'Seated Cable Row',      sets: s, reps: r, rest, target: '中背厚度', tier: 2, ...(note ? { note } : {}) });
const SA_DB_ROW   = (s, r, rest, note) => ({ name: '單臂啞鈴划船', nameEn: 'Single Arm Dumbbell Row', sets: s, reps: r, rest, target: '背闊肌單側', tier: 2, unilateral: true, ...(note ? { note } : {}) });
const T_BAR_ROW   = (s, r, rest, note) => ({ name: 'T槓划船',      nameEn: 'T-Bar Row',             sets: s, reps: r, rest, target: '中背厚度', tier: 2, ...(note ? { note } : {}) });

// ── 後側動力鍊與細節 (Posterior Chain & Details) ──
const DEADLIFT    = (s, r, rest, note) => ({ name: '硬舉',         nameEn: 'Deadlift',              sets: s, reps: r, rest, target: '後側動力鍊', tier: 1, ...(note ? { note } : {}) });
const BACK_EXT    = (s, r, rest, note) => ({ name: '羅馬椅挺身',   nameEn: 'Back Extension',        sets: s, reps: r, rest, target: '下背豎脊肌', tier: 3, ...(note ? { note } : {}) });
const FACE_PULL   = (s, r, rest, note) => ({ name: '繩索面拉',     nameEn: 'Cable Face Pull',       sets: s, reps: r, rest, target: '後三角與菱形肌', tier: 3, ...(note ? { note } : {}) });
const SUPERMAN    = (s, r, rest, note) => ({ name: '超人式',       nameEn: 'Superman',              sets: s, reps: r, rest, target: '下背穩定', tier: 3, ...(note ? { note } : {}) });
const DB_SHRUG    = (s, r, rest, note) => ({ name: '啞鈴聳肩',     nameEn: 'Dumbbell Shrug',        sets: s, reps: r, rest, target: '上斜方肌', tier: 3, ...(note ? { note } : {}) });

// ── 超級組動作庫 ──
const SS_PULLDOWN_A = (s, r, rp, note) => ({ name: '下拉',     nameEn: 'Lat Pulldown',          sets: s, reps: r, rest: SS_GAP, target: '預先疲勞', tier: 2, superset: true, supersetGroup: 'SS1', ...(note ? { note } : {}) });
const SS_STR_ARM_B  = (s, r, rp, note) => ({ name: '直臂下拉', nameEn: 'Straight Arm Pulldown', sets: s, reps: r, rest: rp,     target: '極限拉伸', tier: 3, supersetGroup: 'SS1', ...(note ? { note } : {}) });
const SS_FACE_A     = (s, r, rp, note) => ({ name: '繩索面拉', nameEn: 'Cable Face Pull',       sets: s, reps: r, rest: SS_GAP, target: '中背細節', tier: 3, superset: true, supersetGroup: 'SS2', ...(note ? { note } : {}) });
const SS_STR_ARM_B2 = (s, r, rp, note) => ({ name: '直臂下拉', nameEn: 'Straight Arm Pulldown', sets: s, reps: r, rest: rp,     target: '極限拉伸', tier: 3, supersetGroup: 'SS2', ...(note ? { note } : {}) });

/* ═══════════════════════════════════════════════════════
   BACK PLAN DATA
═══════════════════════════════════════════════════════ */
export const BACK_PLAN = {
  id: 'back_mastery_001',
  name: '倒三角鍛造：全方位背肌覺醒計畫',
  bodyPartLabel: '背部',
  duration: 28,
  tags: ['背闊肌', '倒三角', '厚度建立', '引體向上'],
  description: '專為打造寬闊、厚實且充滿細節的背肌而設計。從喚醒背闊肌的收縮感知開始，結合垂直與水平拉的複合動作，全面刺激背闊肌、斜方肌、菱形肌與豎脊肌。有效改善駝背與圓肩，為你打造挺拔迷人的倒三角身型。',
  levels: {
    beginner: {
      key: 'beginner',
      label: '初階 (寬度與發力建立)',
      recommendedDays: 2,
      recommendedDaysLabel: '建議每週 2 天',
      durationPerSession: '40-45',
      equipment: ['滑輪機', '啞鈴', '機械式器材', '體重'],
      targetArea: '背部整體輪廓、背闊肌基礎發力',
      expectedGain: '建立背肌啟動感知，減少手臂代償，提升基礎拉力 15-20%',
      benefits: [
        '學會肩胛骨的下沉與後收，建立正確發力模式。',
        '改善長期久坐造成的圓肩與駝背。',
        '強化核心與下背部穩定度。'
      ],
      periodization: {
        phase1: { name: '神經喚醒期', weeks: '第 1-2 週', focus: '肩胛骨控制與減少二頭肌代償', reps: '12-15 下', intensity: '中等 (RPE 6-7)' },
        phase2: { name: '肌肥大生長期', weeks: '第 3-4 週', focus: '增加訓練容量與背部充血感', reps: '8-12 下', intensity: '中高 (RPE 7-8)' }
      },
      weeks: [
        {
          weekNumber: 1,
          name: '基礎寬度與發力',
          days: [
            {
              dayNumber: 1, focus: '垂直拉與背闊肌感知', time: 40,
              exercises: [
                PULLDOWN(3, '12', 60, '寬握：挺胸，想像手肘往地板方向砸'),
                STR_ARM(3, '15', 60, '使用極輕重量，手肘微彎並鎖死角度，專專感受背部夾緊'),
                SEATED_ROW(3, '12', 90, '機械式：拉起時肩胛骨夾緊，控制離心'),
                BACK_EXT(2, '12-15', 60, '感受下背部(豎脊肌)出力，切勿過度過伸')
              ]
            },
            {
              dayNumber: 2, focus: '水平拉與中背部', time: 40,
              exercises: [
                SEATED_ROW(3, '12', 60, '窄握：保持身體微後傾，不要隨重量大幅擺動'),
                SA_DB_ROW(3, '10 / 每側', 90, '想像將啞鈴放入口袋，背部發力啟動'),
                REV_PULLDOWN(3, '12', 60, '更強調下背闊肌，手肘貼緊身體下拉'),
                FACE_PULL(3, '15', 60, '鍛鍊三角肌中下束與旋轉肌群，改善體態')
              ]
            }
          ]
        },
        {
          weekNumber: 2,
          name: '訓練容量增加',
          days: [
            {
              dayNumber: 3, focus: '垂直拉與背闊肌感知', time: 45,
              exercises: [
                PULLDOWN(4, '10-12', 60, '寬握'),
                STR_ARM(3, '15', 60),
                SEATED_ROW(4, '10-12', 90, '機械式'),
                SUPERMAN(3, '停頓2秒x10次', 60)
              ]
            },
            {
              dayNumber: 4, focus: '水平拉與中背部', time: 45,
              exercises: [
                SEATED_ROW(4, '10-12', 60, '窄握'),
                SA_DB_ROW(3, '10 / 每側', 90),
                PULL_UP(3, '力竭 (約8-10下)', 90, '使用彈力帶或輔助機械，控制下降速度'),
                FACE_PULL(3, '15', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 3,
          name: '肌肥大突破',
          days: [
            {
              dayNumber: 5, focus: '整體寬度與力量', time: 50,
              exercises: [
                PULLDOWN(4, '8-10', 90, '寬握：挑戰比上週更重的重量'),
                REV_PULLDOWN(3, '10-12', 90, '反手/窄握：強調背闊肌中下段'),
                BENT_ROW(3, '10', 90, '使用啞鈴：核心收緊，背部平直'),
                BACK_EXT(3, '15', 60, '可抱啞鈴負重')
              ]
            },
            {
              dayNumber: 6, focus: '厚度堆疊與立體感', time: 50,
              exercises: [
                SEATED_ROW(4, '8-10', 90, '寬握：強調斜方肌中下束與菱形肌'),
                SA_DB_ROW(4, '8-10 / 每側', 90),
                STR_ARM(3, '12', 60, '最後加遞減組'),
                DB_SHRUG(3, '15', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 4,
          name: '細節雕刻與鞏固',
          days: [
            {
              dayNumber: 7, focus: '超級組與極致泵感', time: 50,
              exercises: [
                PULL_UP(4, '8-10', 90, '輔助引體向上'),
                SS_PULLDOWN_A(3, '10', 120, '超級組 A ➜ 直接接直臂下拉'),
                SS_STR_ARM_B(3, '12', 120, '超級組 B ✓'),
                SEATED_ROW(3, '12', 60, '機械式')
              ]
            },
            {
              dayNumber: 8, focus: '力竭與成果驗收', time: 50,
              exercises: [
                BENT_ROW(4, '8-10', 90, '使用啞鈴'),
                SEATED_ROW(3, '10-12', 90, '窄握'),
                FACE_PULL(4, '12-15', 60),
                BACK_EXT(3, '力竭', 60, '最高點停頓2秒')
              ]
            }
          ]
        }
      ]
    },
    intermediate: {
      key: 'intermediate',
      label: '中階 (厚度與細節雕刻)',
      recommendedDays: 2,
      recommendedDaysLabel: '建議每週 2-3 天',
      durationPerSession: '55-60',
      equipment: ['槓鈴', '啞鈴', '滑輪機', '單槓'],
      targetArea: '背闊肌寬度極限、中背厚度、下背強化',
      expectedGain: '背部肌肉細節分明，提升大重量划船與引體向上能力',
      benefits: [
        '突破引體向上次數，達成自體重量拉力目標。',
        '透過自由重量（槓鈴）建立強大的後側動力鍊。',
        '打造立體的背部肌肉溝槽（聖誕樹）。'
      ],
      periodization: {
        phase1: { name: '力量與厚度建立', weeks: '第 1-2 週', focus: '大重量複合拉力動作', reps: '6-8 下', intensity: '高 (RPE 8-9)' },
        phase2: { name: '細節與代謝壓力', weeks: '第 3-4 週', focus: '多角度刺激、離心控制', reps: '10-12 下', intensity: '極高 (RPE 9)' }
      },
      weeks: [
        {
          weekNumber: 1,
          name: '絕對力量與大肌群',
          days: [
            {
              dayNumber: 1, focus: '垂直拉與寬度', time: 55,
              exercises: [
                PULL_UP(4, '力竭 (目標 6-10)', 120, '若能輕鬆超過10下可加負重'),
                BB_ROW(4, '6-8', 120),
                PULLDOWN(3, '10-12', 90, '窄握/V把'),
                SA_DB_ROW(3, '10 / 每側', 90)
              ]
            },
            {
              dayNumber: 2, focus: '後側動力鍊與厚度', time: 55,
              exercises: [
                DEADLIFT(4, '5-8', 180, '注意核心穩定，若下背不適可換羅馬尼亞硬舉'),
                T_BAR_ROW(4, '8-10', 120, '胸靠式：純粹孤立背闊肌，避免下背代償'),
                PULLDOWN(3, '10-12', 90, '對握'),
                STR_ARM(3, '12-15', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 2,
          name: '訓練量累積',
          days: [
            {
              dayNumber: 3, focus: '垂直拉與寬度', time: 55,
              exercises: [
                PULL_UP(4, '力竭 (目標 8-12)', 120, '嘗試每組多拉1下'),
                BB_ROW(4, '8', 120),
                PULLDOWN(4, '10-12', 90, '窄握/V把'),
                SA_DB_ROW(4, '10 / 每側', 90)
              ]
            },
            {
              dayNumber: 4, focus: '後側動力鍊與厚度', time: 55,
              exercises: [
                DEADLIFT(4, '5-8', 180),
                T_BAR_ROW(4, '10', 120, '胸靠式'),
                PULLDOWN(4, '10-12', 90, '對握'),
                STR_ARM(3, '15', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 3,
          name: '強度衝刺',
          days: [
            {
              dayNumber: 5, focus: '垂直拉與寬度', time: 55,
              exercises: [
                PULL_UP(4, '力竭 (目標 6-8)', 120, '加掛腰帶負重'),
                BB_ROW(4, '5-6', 120, '加重挑戰'),
                PULLDOWN(3, '8-10', 90, '窄握/V把'),
                SA_DB_ROW(3, '8 / 每側', 90, '加重，控制離心')
              ]
            },
            {
              dayNumber: 6, focus: '後側動力鍊與厚度', time: 55,
              exercises: [
                DEADLIFT(4, '4-6', 180, '挑戰大重量'),
                T_BAR_ROW(4, '6-8', 120, '胸靠式：加重挑戰'),
                PULLDOWN(3, '8-10', 90, '對握'),
                STR_ARM(4, '12', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 4,
          name: '立體感極限轟炸',
          days: [
            {
              dayNumber: 7, focus: '背部全方位榨乾', time: 60,
              exercises: [
                PULL_UP(4, '5-8', 120, '負重引體向上'),
                PENDLAY_ROW(4, '6-8', 120, '若下背感到疲勞，適度降重確保皆能從地面爆發拉起'),
                SEATED_ROW(3, '10', 90, '遞減組：降重再做力竭'),
                SS_FACE_A(3, '12', 90, '超級組 A ➜ 直接接直臂下拉'),
                SS_STR_ARM_B2(3, '12', 90, '超級組 B ✓')
              ]
            }
          ]
        }
      ]
    },

    /* ╔══════════════════════════════════════════════════════╗
       ║  精熟 (PRO) — 寬度/厚度分化 + 超級組 + 硬舉後鏈            ║
       ║  Day A 垂直拉(寬度) / Day B 水平拉+硬舉(厚度)，3 天/週     ║
       ╚══════════════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟 (極限轟炸)',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '55-65',
      equipment: ['槓鈴', '啞鈴', '滑輪機', '單槓', 'T槓'],
      targetArea: '背闊肌極限寬度、中背厚度、後鏈與豎脊肌',
      expectedGain: '以引體/硬舉大重量複合 + 超級組打造極致倒三角',
      benefits: [
        '引體向上與硬舉建立絕對拉力與後鏈厚度。',
        '下拉+直臂下拉超級組預先疲勞背闊肌，最大化感受度。',
        '寬度/厚度分化，闊背與中背無死角。'
      ],
      periodization: {
        phase1: { name: '拉力打底', weeks: '第 1-2 週', focus: '大重量垂直/水平拉，建立張力', reps: '6-10 下', intensity: '高 (RPE 8-9)' },
        phase2: { name: '代謝轟炸', weeks: '第 3-4 週', focus: '超級組與孤立延長 TUT', reps: '10-15 下', intensity: '極高 (RPE 9-10)' }
      },
      weeks: [
        {
          weekNumber: 1, name: '拉力打底期',
          days: [
            { dayNumber: 1, focus: '垂直拉與寬度超級組', time: 60,
              exercises: [ PULL_UP(4, '6-10', 150, '力竭為止，必要時彈力帶輔助'), SS_PULLDOWN_A(3, '10', 90, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(3, '12-15', 90, '超級組 SS1 ✓ 極限拉伸'), SEATED_ROW(3, '10-12', 90), FACE_PULL(3, '15', 60) ] },
            { dayNumber: 2, focus: '水平拉與後鏈厚度', time: 62,
              exercises: [ DEADLIFT(4, '5-8', 180, '保持中立脊椎，後鏈發力'), BB_ROW(4, '6-8', 120), T_BAR_ROW(3, '8-10', 90), SA_DB_ROW(3, '10', 90), BACK_EXT(3, '12-15', 60) ] },
            { dayNumber: 3, focus: '垂直拉與寬度超級組', time: 60,
              exercises: [ PULL_UP(4, '6-10', 150), SS_PULLDOWN_A(3, '10', 90, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(3, '12-15', 90, '超級組 SS1 ✓'), REV_PULLDOWN(3, '10-12', 90), FACE_PULL(3, '15', 60) ] },
          ]
        },
        {
          weekNumber: 2, name: '容量累積期',
          days: [
            { dayNumber: 4, focus: '垂直拉與寬度超級組', time: 62,
              exercises: [ PULL_UP(4, '8-10', 150), SS_PULLDOWN_A(4, '12', 90, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(4, '15', 90, '超級組 SS1 ✓'), SEATED_ROW(3, '12', 90), FACE_PULL(3, '15', 60) ] },
            { dayNumber: 5, focus: '水平拉與後鏈厚度', time: 64,
              exercises: [ DEADLIFT(4, '5-8', 180), BB_ROW(4, '8', 120), T_BAR_ROW(4, '10', 90), SA_DB_ROW(3, '12', 90), BACK_EXT(3, '15', 60) ] },
            { dayNumber: 6, focus: '垂直拉與寬度超級組', time: 62,
              exercises: [ PULL_UP(4, '8-10', 150), SS_PULLDOWN_A(4, '12', 90, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(4, '15', 90, '超級組 SS1 ✓'), REV_PULLDOWN(3, '12', 90), FACE_PULL(3, '15', 60) ] },
          ]
        },
        {
          weekNumber: 3, name: '強度衝刺期',
          days: [
            { dayNumber: 7, focus: '垂直拉與寬度超級組', time: 62,
              exercises: [ PULL_UP(5, '5-6', 180, '負重挑戰'), SS_PULLDOWN_A(3, '8', 90, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(3, '12', 90, '超級組 SS1 ✓'), SEATED_ROW(4, '10', 90), FACE_PULL(3, '15', 60) ] },
            { dayNumber: 8, focus: '水平拉與後鏈厚度', time: 64,
              exercises: [ DEADLIFT(4, '3-5', 210, '加重挑戰最大肌力'), BB_ROW(4, '6', 120), T_BAR_ROW(4, '8', 90), SA_DB_ROW(3, '10', 90), BACK_EXT(3, '12', 60) ] },
            { dayNumber: 9, focus: '垂直拉與寬度超級組', time: 62,
              exercises: [ PULL_UP(5, '5-6', 180), SS_PULLDOWN_A(3, '8', 90, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(3, '12', 90, '超級組 SS1 ✓'), REV_PULLDOWN(4, '10', 90), FACE_PULL(3, '15', 60) ] },
          ]
        },
        {
          weekNumber: 4, name: '減量超補週',
          days: [
            { dayNumber: 10, focus: '垂直拉與寬度超級組', time: 45,
              exercises: [ PULL_UP(2, '8', 120), SS_PULLDOWN_A(2, '12', 75, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(2, '15', 75, '超級組 SS1 ✓'), SEATED_ROW(2, '12', 75), FACE_PULL(2, '15', 60) ] },
            { dayNumber: 11, focus: '水平拉與後鏈厚度', time: 45,
              exercises: [ DEADLIFT(2, '6', 150), BB_ROW(2, '8', 90), T_BAR_ROW(2, '10', 75), SA_DB_ROW(2, '12', 75), BACK_EXT(2, '15', 60) ] },
            { dayNumber: 12, focus: '垂直拉與寬度超級組', time: 45,
              exercises: [ PULL_UP(2, '8', 120), SS_PULLDOWN_A(2, '12', 75, '超級組 SS1 ➜ 接直臂下拉'), SS_STR_ARM_B(2, '15', 75, '超級組 SS1 ✓'), REV_PULLDOWN(2, '12', 75), FACE_PULL(2, '15', 60) ] },
          ]
        }
      ]
    }
  }
};

// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(BACK_PLAN);
