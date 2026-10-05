import applyWeek4Deload from '../utils/planDeloadNormalizer';
// src/data/chestPlanData.js

const SS_GAP    = 15;   // 超級組組內銜接秒數
const TRANSITION = 45;  // 動作間換器材時間

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

// ── 標準動作庫 ──
const BB_BENCH   = (s, r, rest, note) => ({ name: '槓鈴臥推',       nameEn: 'Barbell Bench Press',    sets: s, reps: r, rest, target: '中胸整體厚度', tier: 1, ...(note ? { note } : {}) });
const BB_INC     = (s, r, rest, note) => ({ name: '上斜槓鈴臥推',   nameEn: 'Incline Barbell Press',  sets: s, reps: r, rest, target: '上胸厚度',     tier: 1, ...(note ? { note } : {}) });
const DB_BENCH   = (s, r, rest, note) => ({ name: '啞鈴臥推',       nameEn: 'Dumbbell Bench Press',   sets: s, reps: r, rest, target: '中胸活動度',   tier: 2, ...(note ? { note } : {}) });
const DB_INC     = (s, r, rest, note) => ({ name: '上斜啞鈴推舉',   nameEn: 'Incline Dumbbell Press', sets: s, reps: r, rest, target: '上胸線條',     tier: 2, ...(note ? { note } : {}) });
const MACH_PRESS = (s, r, rest, note) => ({ name: '機械胸推',       nameEn: 'Machine Chest Press',    sets: s, reps: r, rest, target: '中胸張力',     tier: 2, ...(note ? { note } : {}) });
const MACH_INC   = (s, r, rest, note) => ({ name: '上斜機械胸推',   nameEn: 'Incline Machine Press',  sets: s, reps: r, rest, target: '上胸張力',     tier: 2, ...(note ? { note } : {}) });
const PEC_DECK   = (s, r, rest, note) => ({ name: '蝴蝶機夾胸',     nameEn: 'Pec Deck Fly',           sets: s, reps: r, rest, target: '胸肌中線',     tier: 3, ...(note ? { note } : {}) });
const CAB_MID    = (s, r, rest, note) => ({ name: '繩索夾胸',       nameEn: 'Cable Crossover',        sets: s, reps: r, rest, target: '胸肌整體輪廓', tier: 3, ...(note ? { note } : {}) });
const CAB_HIGH   = (s, r, rest, note) => ({ name: '高位繩索夾胸',   nameEn: 'High Cable Crossover',   sets: s, reps: r, rest, target: '下胸外緣',     tier: 3, ...(note ? { note } : {}) });
const CAB_LOW    = (s, r, rest, note) => ({ name: '低位繩索夾胸',   nameEn: 'Low Cable Crossover',    sets: s, reps: r, rest, target: '上胸內側',     tier: 3, ...(note ? { note } : {}) });
const DB_FLY     = (s, r, rest, note) => ({ name: '啞鈴飛鳥',       nameEn: 'Dumbbell Fly',           sets: s, reps: r, rest, target: '中胸拉伸',     tier: 3, ...(note ? { note } : {}) });
const DB_INC_FLY = (s, r, rest, note) => ({ name: '上斜啞鈴飛鳥',   nameEn: 'Incline Dumbbell Fly',   sets: s, reps: r, rest, target: '上胸拉伸',     tier: 3, ...(note ? { note } : {}) });
const PUSHUP     = (s, r, rest, note) => ({ name: '伏地挺身',       nameEn: 'Push-up',                sets: s, reps: r, rest, target: '整體肌耐力',   tier: 3, ...(note ? { note } : {}) });
const DIPS       = (s, r, rest, note) => ({ name: '雙槓臂屈伸',     nameEn: 'Chest Dips',             sets: s, reps: r, rest, target: '下胸與三頭',   tier: 2, ...(note ? { note } : {}) });

// ── 超級組動作庫 ──
const SS_DB_BENCH = (s, r, rp, note) => ({ name: '啞鈴臥推',     nameEn: 'Dumbbell Bench Press',   sets: s, reps: r, rest: SS_GAP, target: '預先疲勞', tier: 2, superset: true, supersetGroup: 'SS1', ...(note ? { note } : {}) });
const SS_DB_FLY   = (s, r, rp, note) => ({ name: '啞鈴飛鳥',     nameEn: 'Dumbbell Fly',           sets: s, reps: r, rest: rp,     target: '極限拉伸', tier: 3, supersetGroup: 'SS1', ...(note ? { note } : {}) });
const SS_DB_INC   = (s, r, rp, note) => ({ name: '上斜啞鈴推舉', nameEn: 'Incline Dumbbell Press', sets: s, reps: r, rest: SS_GAP, target: '預先疲勞', tier: 2, superset: true, supersetGroup: 'SS1', ...(note ? { note } : {}) });
const SS_INC_FLY  = (s, r, rp, note) => ({ name: '上斜啞鈴飛鳥', nameEn: 'Incline Dumbbell Fly',   sets: s, reps: r, rest: rp,     target: '極限拉伸', tier: 3, supersetGroup: 'SS1', ...(note ? { note } : {}) });
// 精熟用：第二組超級組 (SS2) — 上胸推 + 上胸飛鳥 榨乾
const SS2_DB_INC  = (s, r, rp, note) => ({ name: '上斜啞鈴推舉', nameEn: 'Incline Dumbbell Press', sets: s, reps: r, rest: SS_GAP, target: '上胸預先疲勞', tier: 2, superset: true, supersetGroup: 'SS2', ...(note ? { note } : {}) });
const SS2_INC_FLY = (s, r, rp, note) => ({ name: '上斜啞鈴飛鳥', nameEn: 'Incline Dumbbell Fly',   sets: s, reps: r, rest: rp,     target: '上胸極限拉伸', tier: 3, supersetGroup: 'SS2', ...(note ? { note } : {}) });

/* ═══════════════════════════════════════════════════════
   CHEST PLAN DATA
═══════════════════════════════════════════════════════ */
export const CHEST_PLAN = {
  id: 'chest_mastery_001',
  name: '鋼鐵胸甲：全方位胸肌重塑計畫',
  bodyPartLabel: '胸部',
  duration: 28,
  tags: ['胸大肌', '厚度建立', '中線刻畫', '上胸發展'],
  description: '專為打造飽滿、寬闊且線條分明的胸肌而設計。從基礎推舉力量建立，到進階的角度刺激與中線刻畫。結合多關節複合動作與孤立訓練，全面刺激胸大肌的上、中、下胸纖維，打造立體的鎧甲胸肌。',
  levels: {
    beginner: {
      key: 'beginner',
      label: '初階 (厚度建立)',
      recommendedDays: 2,
      recommendedDaysLabel: '建議每週 2 天',
      durationPerSession: '40-45',
      equipment: ['啞鈴', '機械式器材', '體重'],
      targetArea: '胸肌整體厚度、基礎推力',
      expectedGain: '建立胸部基礎肌肉量，提升推舉力量 15-20%',
      benefits: [
        '掌握正確的胸肌發力感受，減少肩膀代償。',
        '建立基礎推舉力量與肌肉耐力。',
        '改善圓肩，提升上半身挺拔度。'
      ],
      periodization: {
        phase1: { name: '發力建立期', weeks: '第 1-2 週', focus: '動作控制與神經肌肉連結', reps: '10-15 下', intensity: '中等 (RPE 6-7)' },
        phase2: { name: '肌肥大生長期', weeks: '第 3-4 週', focus: '增加訓練容量與肌肉破壞', reps: '8-12 下', intensity: '中高 (RPE 7-8)' }
      },
      weeks: [
        {
          weekNumber: 1,
          name: '基礎厚度與發力',
          days: [
            {
              dayNumber: 1, focus: '平胸與下胸基礎', time: 40,
              exercises: [
                MACH_PRESS(3, '10-12', 60, '包含2組暖身，保持肩胛骨收緊'),
                DB_BENCH(3, '8-10', 90, '手肘微收，避免與肩膀平行'),
                PEC_DECK(3, '15', 60, '感受胸肌中線的擠壓'),
                PUSHUP(2, '力竭', 60, '膝姿退階版')
              ]
            },
            {
              dayNumber: 2, focus: '上胸與整體刺激', time: 40,
              exercises: [
                MACH_INC(3, '10-12', 60, '包含2組暖身，感受鎖骨下方發力'),
                DB_INC(3, '8-10', 90),
                CAB_LOW(3, '15', 60, '針對上胸與中線'),
                PUSHUP(2, '力竭', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 2,
          name: '訓練容量增加',
          days: [
            {
              dayNumber: 3, focus: '平胸與下胸基礎', time: 45,
              exercises: [
                DB_BENCH(4, '8-10', 90, '包含2組暖身'),
                MACH_PRESS(3, '10-12', 60),
                PEC_DECK(4, '12-15', 60),
                PUSHUP(3, '力竭', 60, '手墊高下斜退階')
              ]
            },
            {
              dayNumber: 4, focus: '上胸與整體刺激', time: 45,
              exercises: [
                DB_INC(4, '8-10', 90, '包含2組暖身'),
                MACH_INC(3, '10-12', 60),
                CAB_HIGH(3, '15', 60, '針對下胸外緣'),
                PUSHUP(3, '力竭', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 3,
          name: '肌肥大突破',
          days: [
            {
              dayNumber: 5, focus: '中胸與力量', time: 50,
              exercises: [
                BB_BENCH(4, '8-10', 120, '包含2組暖身，挑戰比上週更重的重量'),
                DB_FLY(3, '12', 90, '控制下放速度，感受拉伸'),
                PEC_DECK(3, '12', 60, '最後一組加遞減組'),
                PUSHUP(3, '力竭', 60)
              ]
            },
            {
              dayNumber: 6, focus: '上胸與立體感', time: 50,
              exercises: [
                BB_INC(4, '8-10', 120, '包含2組暖身'),
                DB_INC_FLY(3, '12', 90),
                CAB_MID(3, '12-15', 60),
                PUSHUP(2, '力竭', 60, '腳墊高上斜進階')
              ]
            }
          ]
        },
        {
          weekNumber: 4,
          name: '線條雕刻與鞏固',
          days: [
            {
              dayNumber: 7, focus: '超級組與充血', time: 50,
              exercises: [
                MACH_PRESS(4, '10', 90),
                SS_DB_BENCH(3, '10', 120, '超級組 A ➜ 直接接飛鳥'),
                SS_DB_FLY(3, '10', 120, '超級組 B ✓'),
                CAB_LOW(3, '15', 60)
              ]
            },
            {
              dayNumber: 8, focus: '力竭與成果驗收', time: 50,
              exercises: [
                DB_INC(4, '8-10', 90),
                DIPS(3, '8-12', 90, '身體微微前傾'),
                CAB_HIGH(3, '15', 60),
                PUSHUP(3, '力竭', 60, '變換寬窄距')
              ]
            }
          ]
        }
      ]
    },
    intermediate: {
      key: 'intermediate',
      label: '中階 (立體雕塑)',
      recommendedDays: 2,
      recommendedDaysLabel: '建議每週 2-3 天',
      durationPerSession: '55-60',
      equipment: ['槓鈴', '啞鈴', '滑輪機', '雙槓'],
      targetArea: '上中下胸均衡發展、中線深度',
      expectedGain: '胸肌輪廓明顯立體，增加外緣寬度與內側溝槽深度',
      benefits: [
        '提升大重量複合動作推舉能力。',
        '改善胸肌上胸不飽滿的問題。',
        '透過不同角度刺激，打造方形鎧甲胸肌。'
      ],
      periodization: {
        phase1: { name: '力量與破壞', weeks: '第 1-2 週', focus: '大重量複合動作，提升機械張力', reps: '6-10 下', intensity: '高 (RPE 8-9)' },
        phase2: { name: '代謝壓力', weeks: '第 3-4 週', focus: '多角度孤立、超級組、延長TUT', reps: '10-15 下', intensity: '極高 (RPE 9)' }
      },
      weeks: [
        {
          weekNumber: 1,
          name: '力量與厚度打底',
          days: [
            {
              dayNumber: 1, focus: '重訓平胸與中線', time: 55,
              exercises: [
                BB_BENCH(4, '6-8', 180, '專注控制離心階段'),
                DB_INC(3, '8-10', 90),
                DIPS(3, '8-12', 90),
                CAB_MID(3, '15', 60)
              ]
            },
            {
              dayNumber: 2, focus: '上胸與肌纖維拉伸', time: 55,
              exercises: [
                BB_INC(4, '6-8', 180),
                DB_BENCH(3, '8-10', 90),
                DB_INC_FLY(3, '12', 90, '最大化胸肌拉伸感'),
                CAB_LOW(3, '12-15', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 2,
          name: '訓練量累積',
          days: [
            {
              dayNumber: 3, focus: '重訓平胸與中線', time: 55,
              exercises: [
                BB_BENCH(4, '8', 180, '維持上週重量，次數推至8下'),
                DB_INC(4, '8-10', 90, '增加一組訓練容量'),
                DIPS(3, '10-12', 90),
                CAB_MID(3, '15', 60)
              ]
            },
            {
              dayNumber: 4, focus: '上胸與肌纖維拉伸', time: 55,
              exercises: [
                BB_INC(4, '8', 180),
                DB_BENCH(4, '8-10', 90),
                DB_INC_FLY(3, '12-15', 90),
                CAB_LOW(3, '15', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 3,
          name: '強度衝刺',
          days: [
            {
              dayNumber: 5, focus: '重訓平胸與中線', time: 55,
              exercises: [
                BB_BENCH(4, '5-6', 180, '增加槓片重量，挑戰神經徵召'),
                DB_INC(3, '8', 90),
                DIPS(3, '8-10', 90, '負重挑戰 (夾啞鈴或負重背心)'),
                CAB_MID(4, '12', 60)
              ]
            },
            {
              dayNumber: 6, focus: '上胸與肌纖維拉伸', time: 55,
              exercises: [
                BB_INC(4, '5-6', 180, '加重挑戰'),
                DB_BENCH(3, '8', 90),
                DB_INC_FLY(3, '10-12', 90, '放慢離心至3秒'),
                CAB_LOW(4, '12', 60)
              ]
            }
          ]
        },
        {
          weekNumber: 4,
          name: '立體感極限雕刻',
          days: [
            {
              dayNumber: 7, focus: '胸肌全方位轟炸', time: 60,
              exercises: [
                BB_BENCH(4, '5-8', 180),
                SS_DB_INC(3, '8', 120, '超級組 A ➜ 直接接飛鳥'),
                SS_INC_FLY(3, '10', 120, '超級組 B ✓'),
                DIPS(3, '8-10', 90, '負重挑戰'),
                CAB_MID(2, '21', 90, '高低中各7下連續做')
              ]
            }
          ]
        }
      ]
    },

    /* ╔══════════════════════════════════════════════════════╗
       ║  精熟 (PRO) — 雙超級組 + 大重量複合，極致代謝壓力          ║
       ║  Day A 中胸厚度 / Day B 上胸雕塑，3 天/週 (A-B-A)         ║
       ╚══════════════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟 (代謝轟炸)',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '55-65',
      equipment: ['槓鈴', '啞鈴', '滑輪機', '雙槓', '斜板椅'],
      targetArea: '上中下胸極限厚度、中線深度、外緣寬度',
      expectedGain: '以超級組與大重量複合榨乾每一束胸纖維，立體鎧甲胸',
      benefits: [
        '大重量槓鈴複合打底，最大化機械張力。',
        '推舉+飛鳥超級組製造極致代謝壓力與泵感。',
        '上中下胸與中線全角度無死角刺激。'
      ],
      periodization: {
        phase1: { name: '張力打底', weeks: '第 1-2 週', focus: '大重量複合，建立機械張力', reps: '6-10 下', intensity: '高 (RPE 8-9)' },
        phase2: { name: '代謝轟炸', weeks: '第 3-4 週', focus: '超級組與孤立延長 TUT', reps: '10-15 下', intensity: '極高 (RPE 9-10)' }
      },
      weeks: [
        {
          weekNumber: 1, name: '張力打底期',
          days: [
            { dayNumber: 1, focus: '中胸厚度超級組', time: 60,
              exercises: [ BB_BENCH(4, '6-8', 150, '離心 3 秒控制'), SS_DB_BENCH(3, '8-10', 90, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(3, '12-15', 90, '超級組 SS1 ✓ 極限拉伸'), DIPS(3, '8-12', 90), CAB_MID(3, '15', 60) ] },
            { dayNumber: 2, focus: '上胸雕塑超級組', time: 60,
              exercises: [ BB_INC(4, '6-8', 150), SS2_DB_INC(3, '8-10', 90, '超級組 SS2 ➜ 接上斜飛鳥'), SS2_INC_FLY(3, '12-15', 90, '超級組 SS2 ✓'), CAB_LOW(3, '15', 60), PEC_DECK(3, '15', 60) ] },
            { dayNumber: 3, focus: '中胸厚度超級組', time: 60,
              exercises: [ BB_BENCH(4, '6-8', 150), SS_DB_BENCH(3, '8-10', 90, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(3, '12-15', 90, '超級組 SS1 ✓'), DIPS(3, '8-12', 90), CAB_HIGH(3, '15', 60) ] },
          ]
        },
        {
          weekNumber: 2, name: '容量累積期',
          days: [
            { dayNumber: 4, focus: '中胸厚度超級組', time: 62,
              exercises: [ BB_BENCH(4, '8', 150), SS_DB_BENCH(4, '10', 90, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(4, '15', 90, '超級組 SS1 ✓'), DIPS(3, '10-12', 90), CAB_MID(3, '15', 60) ] },
            { dayNumber: 5, focus: '上胸雕塑超級組', time: 62,
              exercises: [ BB_INC(4, '8', 150), SS2_DB_INC(4, '10', 90, '超級組 SS2 ➜ 接上斜飛鳥'), SS2_INC_FLY(4, '15', 90, '超級組 SS2 ✓'), CAB_LOW(3, '15', 60), PEC_DECK(3, '15', 60) ] },
            { dayNumber: 6, focus: '中胸厚度超級組', time: 62,
              exercises: [ BB_BENCH(4, '8', 150), SS_DB_BENCH(4, '10', 90, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(4, '15', 90, '超級組 SS1 ✓'), DIPS(3, '10-12', 90), CAB_HIGH(3, '15', 60) ] },
          ]
        },
        {
          weekNumber: 3, name: '強度衝刺期',
          days: [
            { dayNumber: 7, focus: '中胸厚度超級組', time: 62,
              exercises: [ BB_BENCH(5, '5-6', 180, '加重挑戰神經徵召'), SS_DB_BENCH(3, '8', 90, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(3, '12', 90, '超級組 SS1 ✓ 離心 3 秒'), DIPS(3, '8-10', 90, '負重'), CAB_MID(4, '12', 60) ] },
            { dayNumber: 8, focus: '上胸雕塑超級組', time: 62,
              exercises: [ BB_INC(5, '5-6', 180, '加重'), SS2_DB_INC(3, '8', 90, '超級組 SS2 ➜ 接上斜飛鳥'), SS2_INC_FLY(3, '12', 90, '超級組 SS2 ✓'), CAB_LOW(4, '12', 60), PEC_DECK(3, '12-15', 60) ] },
            { dayNumber: 9, focus: '中胸厚度超級組', time: 62,
              exercises: [ BB_BENCH(5, '5-6', 180), SS_DB_BENCH(3, '8', 90, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(3, '12', 90, '超級組 SS1 ✓'), DIPS(3, '8-10', 90, '負重'), CAB_HIGH(4, '12', 60) ] },
          ]
        },
        {
          weekNumber: 4, name: '減量超補週',
          days: [
            { dayNumber: 10, focus: '中胸厚度超級組', time: 45,
              exercises: [ BB_BENCH(2, '8', 120), SS_DB_BENCH(2, '12', 75, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(2, '15', 75, '超級組 SS1 ✓'), DIPS(2, '12', 75), CAB_MID(2, '15', 60) ] },
            { dayNumber: 11, focus: '上胸雕塑超級組', time: 45,
              exercises: [ BB_INC(2, '8', 120), SS2_DB_INC(2, '12', 75, '超級組 SS2 ➜ 接上斜飛鳥'), SS2_INC_FLY(2, '15', 75, '超級組 SS2 ✓'), CAB_LOW(2, '15', 60), PEC_DECK(2, '15', 60) ] },
            { dayNumber: 12, focus: '中胸厚度超級組', time: 45,
              exercises: [ BB_BENCH(2, '8', 120), SS_DB_BENCH(2, '12', 75, '超級組 SS1 ➜ 接飛鳥'), SS_DB_FLY(2, '15', 75, '超級組 SS1 ✓'), DIPS(2, '12', 75), CAB_HIGH(2, '15', 60) ] },
          ]
        }
      ]
    }
  }
};

// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(CHEST_PLAN);
