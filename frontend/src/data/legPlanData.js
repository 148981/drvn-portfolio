import applyWeek4Deload from '../utils/planDeloadNormalizer';
// 科學化下肢肌肥大計畫 v3 — 三個等級：新手 / 中階 / 精熟
// 根據目前主流科學化肌肥大訓練邏輯重新設計：
//  • 新手  : 4 個全身性下肢動作，建立 Squat/Hinge 基礎，25–30 min
//  • 中階  : 5 個動作（切分股四頭主導日 / 臀腿後側主導日），30–35 min
//  • 精熟  : 3 個拮抗肌超級組（前側與後側無縫配對），35–40 min

/* ─── TIME UTILITIES ────────────────────────────────────────── */

const EXEC_SEC     = 25;   // sec/set — bilateral exercise
const EXEC_SEC_UNI = 45;   // sec/set — unilateral (both legs sequential)
const TRANSITION   = 45;   // sec between exercises (realistic setup time)
const SS_GAP       = 15;   // sec — intra-superset handoff (A → B)

export const calcExDuration = (ex) => {
  const execPerSet   = ex.unilateral ? EXEC_SEC_UNI : EXEC_SEC;
  const execTime     = ex.sets * execPerSet;
  const interSetRest = ex.superset ? SS_GAP : ex.rest;
  const restTime     = (ex.sets - 1) * interSetRest;
  const trans        = ex.superset ? SS_GAP : TRANSITION;
  return Math.round(execTime + restTime + trans);
};

export const trimDay = (exercises, targetMinutes) => {
  const budget = targetMinutes * 60;
  let total    = 0;
  const result = [];
  for (const ex of exercises) {
    const dur = calcExDuration(ex);
    if (total + dur <= budget + 150) { 
      result.push({ ...ex, durationSec: dur });
      total += dur;
    }
    if (total >= budget) break;
  }
  return { exercises: result, totalSec: total };
};

/* ═══════════════════════════════════════════════════════
   EXERCISE HELPERS (SCIENCE-BASED LEGS) - 已與黃金大腦完美對齊
═══════════════════════════════════════════════════════ */

// Bilateral exercises (雙側)
const GOBLET_SQUAT = (s, r, rest, note) => ({ name: '高腳杯深蹲',       nameEn: 'Goblet Squat',          sets: s, reps: r, rest, target: '股四頭肌、臀大肌', tier: 2, ...(note ? { note } : {}) });
const HEEL_SQUAT   = (s, r, rest, note) => ({ name: '墊高腳跟深蹲',     nameEn: 'Heel Elevated Squat',   sets: s, reps: r, rest, target: '股四頭肌(淚滴肌)', tier: 2, ...(note ? { note } : {}) });
const DB_RDL       = (s, r, rest, note) => ({ name: '羅馬尼亞硬舉',     nameEn: 'Romanian Deadlift',     sets: s, reps: r, rest, target: '腿後側、臀大肌',   tier: 2, ...(note ? { note } : {}) });
const HIP_THRUST   = (s, r, rest, note) => ({ name: '槓鈴臀推',         nameEn: 'Barbell Hip Thrust',    sets: s, reps: r, rest, target: '臀大肌',           tier: 2, ...(note ? { note } : {}) });
const GLUTE_BRIDGE = (s, r, rest, note) => ({ name: '橋式',             nameEn: 'Glute Bridge',          sets: s, reps: r, rest, target: '臀大肌',           tier: 3, ...(note ? { note } : {}) });
const CALF_RAISE   = (s, r, rest, note) => ({ name: '站姿提踵',         nameEn: 'Standing Calf Raise',   sets: s, reps: r, rest, target: '小腿肌群',         tier: 3, ...(note ? { note } : {}) });
const LEG_EXTENSION= (s, r, rest, note) => ({ name: '腿伸展',           nameEn: 'Leg Extension',         sets: s, reps: r, rest, target: '股四頭肌(股直肌)', tier: 3, ...(note ? { note } : {}) });
const LEG_CURL     = (s, r, rest, note) => ({ name: '腿彎舉',           nameEn: 'Leg Curl',              sets: s, reps: r, rest, target: '腿後側(膕繩肌)',   tier: 3, ...(note ? { note } : {}) });

// Unilateral / Asymmetrical exercises (單側/不對稱)
const BULGARIAN    = (s, r, rest, note) => ({ name: '保加利亞分腿蹲',   nameEn: 'Bulgarian Split Squat', sets: s, reps: r, rest, target: '股四頭肌、臀部',   tier: 2, unilateral: true, ...(note ? { note } : {}) });
const B_STANCE_RDL = (s, r, rest, note) => ({ name: 'B字站位硬舉',      nameEn: 'B-Stance Romanian Deadlift',          sets: s, reps: r, rest, target: '腿後側、臀下部',   tier: 2, unilateral: true, ...(note ? { note } : {}) });
const REV_LUNGE    = (s, r, rest, note) => ({ name: '墊高後跨步弓箭步', nameEn: 'Deficit Reverse Lunge', sets: s, reps: r, rest, target: '下肢綜合',         tier: 2, unilateral: true, ...(note ? { note } : {}) });

// Superset helpers (拮抗肌超級組配對)
// Pair 1: Quad Compound + Hamstring Isolation (避免中軸壓迫)
const SS_SQUAT     = (s, r, rest_pair, note) => ({ name: '墊高腳跟深蹲',     nameEn: 'Heel Elevated Squat',   sets: s, reps: r, rest: SS_GAP, target: '股四頭肌',     tier: 2, superset: true,  supersetGroup: 'A', note: note || '超級組 A ➜ 直接接腿彎舉' });
const SS_LEG_CURL  = (s, r, rest_pair, note) => ({ name: '腿彎舉',           nameEn: 'Leg Curl',              sets: s, reps: r, rest: rest_pair, target: '腿後側',       tier: 3, supersetGroup: 'A', note: note || `超級組 A ✓ 休息 ${rest_pair} 秒` });
// Pair 2: Hamstring Compound + Quad Isolation (避免中軸壓迫)
const SS_RDL       = (s, r, rest_pair, note) => ({ name: '羅馬尼亞硬舉',     nameEn: 'Romanian Deadlift',     sets: s, reps: r, rest: SS_GAP, target: '腿後側',       tier: 2, superset: true,  supersetGroup: 'B', note: note || '超級組 B ➜ 直接接腿伸展' });
const SS_LEG_EXT   = (s, r, rest_pair, note) => ({ name: '腿伸展',           nameEn: 'Leg Extension',         sets: s, reps: r, rest: rest_pair, target: '股四頭肌',     tier: 3, supersetGroup: 'B', note: note || `超級組 B ✓ 休息 ${rest_pair} 秒` });
// Pair 2.5: Unilateral Variations
const SS_BULG      = (s, r, rest_pair, note) => ({ name: '保加利亞分腿蹲',   nameEn: 'Bulgarian Split Squat', sets: s, reps: r, rest: SS_GAP, target: '股四頭肌、臀部', tier: 2, superset: true,  supersetGroup: 'B', unilateral: true, note: note || '超級組 B ➜ 直接接下個動作' });
const SS_B_RDL     = (s, r, rest_pair, note) => ({ name: 'B字站位硬舉',      nameEn: 'B-Stance Romanian Deadlift',          sets: s, reps: r, rest: SS_GAP, target: '腿後側、臀大肌', tier: 2, superset: true, supersetGroup: 'B', unilateral: true, note: note || '超級組 B ➜ 直接接下個動作' });
// Pair 3: Glutes + Calves
const SS_THRUST    = (s, r, rest_pair, note) => ({ name: '槓鈴臀推',         nameEn: 'Barbell Hip Thrust',    sets: s, reps: r, rest: SS_GAP, target: '臀大肌',       tier: 2, superset: true,  supersetGroup: 'C', note: note || '超級組 C ➜ 直接接提踵' });
const SS_CALF      = (s, r, rest_pair, note) => ({ name: '站姿提踵',         nameEn: 'Standing Calf Raise',   sets: s, reps: r, rest: rest_pair, target: '小腿肌群',     tier: 3, supersetGroup: 'C', note: note || `超級組 C ✓ 休息 ${rest_pair} 秒` });

// Alternative Superset Pairs for variety
const SS_GOBLET    = (s, r, rest_pair, note) => ({ name: '高腳杯深蹲',       nameEn: 'Goblet Squat',          sets: s, reps: r, rest: SS_GAP, target: '股四頭肌、臀部', tier: 2, superset: true,  supersetGroup: 'A', note: note || '超級組 A ➜ 直接接硬舉' });
const SS_LUNGE     = (s, r, rest_pair, note) => ({ name: '墊高後跨步弓箭步', nameEn: 'Deficit Reverse Lunge', sets: s, reps: r, rest: SS_GAP, target: '下肢綜合',     tier: 2, superset: true,  supersetGroup: 'B', unilateral: true, note: note || '超級組 B ➜ 直接接臀推' });
const SS_BRIDGE    = (s, r, rest_pair, note) => ({ name: '橋式',             nameEn: 'Glute Bridge',          sets: s, reps: r, rest: rest_pair, target: '臀大肌',       tier: 3, supersetGroup: 'B', note: note || `超級組 B ✓ 休息 ${rest_pair} 秒` });


/* ═══════════════════════════════════════════════════════
   LEG PLAN
═══════════════════════════════════════════════════════ */
export const LEG_PLAN = {
  id: 'leg-hypertrophy-science',
  name: '科學化下肢肌肥大計畫',
  subtitle: '基於解剖學的最佳腿部雕塑方案',
  bodyPart: 'legs',
  bodyPartLabel: '腿部',
  duration: 30,
  coverImage: '/images/leg-workout-cover.jpg',
  description: '融合現代肌肥大科學（Hypertrophy Science），透過墊高腳跟增加股四頭肌張力、B字站位隔離單邊腿後側，並在進階階段使用拮抗肌超級組技術。用最聰明的方式榨乾每一絲腿部肌肉，打造完美下肢比例。',
  tags: ['肌肥大科學', '深蹲硬舉力學', '淚滴肌雕刻', '飽滿蜜桃臀'],

  levels: {

    /* ╔══════════════════════════════════════════════╗
       ║  新手 — BEGINNER                             ║
       ║  4 雙側動作 × 每週 3 天                       ║
       ║  核心：掌握 Squat (深蹲) 與 Hinge (鉸鏈) 模式   ║
       ╚══════════════════════════════════════════════╝ */
    beginner: {
      key: 'beginner',
      label: '新手',
      labelEn: 'Beginner',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '25-30',
      equipment: ['啞鈴', '椅子 (可選)'],
      targetArea: '整體下肢與核心',
      intensity: '低至中等',
      expectedGain: '掌握正確發力，下肢基礎力量顯著提升',
      benefits: [
        '建立深蹲與硬舉的最佳力學軌跡',
        '學會使用髖關節(Hinge)而非下背發力',
        '啟動因久坐而休眠的臀大肌',
        '穩固膝關節與腳踝活動度',
      ],
      periodization: {
        phase1: { name: '神經適應', weeks: '第 1–2 週', focus: '慢速離心、感受肌肉發力', reps: '10–12 次', intensity: '輕至中等' },
        phase2: { name: '結構強化', weeks: '第 3–4 週', focus: '逐步增加啞鈴負重', reps: '10–12 次', intensity: '中等重量' },
      },
      weeks: [
        /* ── 第 1 週（3×10，60 秒休息）── */
        {
          weekNumber: 1, name: '動作建構期',
          days: [
            {
              dayNumber: 1, focus: '下肢基礎建立', time: 16,
              exercises: [ GOBLET_SQUAT(3,10,60,'背部挺直，蹲至大腿平行地面'), DB_RDL(3,10,60,'臀部往後推，感受腿後側拉伸'), GLUTE_BRIDGE(3,10,60), CALF_RAISE(3,10,60) ],
            },
            {
              dayNumber: 2, focus: '後側發力強化', time: 16,
              exercises: [ DB_RDL(3,10,60), GOBLET_SQUAT(3,10,60), GLUTE_BRIDGE(3,10,60,'頂部夾緊臀部停頓1秒'), CALF_RAISE(3,10,60) ],
            },
            {
              dayNumber: 3, focus: '下肢綜合', time: 16,
              exercises: [ GOBLET_SQUAT(3,12,60), DB_RDL(3,10,60), GLUTE_BRIDGE(3,12,60), CALF_RAISE(3,12,60) ],
            },
          ],
        },
        /* ── 第 2 週（3×12，60 秒休息）── */
        {
          weekNumber: 2, name: '肌耐力累積',
          days: [
            {
              dayNumber: 1, focus: '下肢基礎建立', time: 16,
              exercises: [ GOBLET_SQUAT(3,12,60), DB_RDL(3,12,60), GLUTE_BRIDGE(3,12,60), CALF_RAISE(3,12,60) ],
            },
            {
              dayNumber: 2, focus: '後側發力強化', time: 16,
              exercises: [ DB_RDL(3,12,60), GOBLET_SQUAT(3,12,60), GLUTE_BRIDGE(3,12,60), CALF_RAISE(3,12,60) ],
            },
            {
              dayNumber: 3, focus: '下肢綜合', time: 16,
              exercises: [ GOBLET_SQUAT(3,12,60,'嘗試拿重一點的啞鈴'), DB_RDL(3,12,60), GLUTE_BRIDGE(3,15,60), CALF_RAISE(3,15,60) ],
            },
          ],
        },
        /* ── 第 3 週（4×10，75 秒休息）── */
        {
          weekNumber: 3, name: '強度提升',
          days: [
            {
              dayNumber: 1, focus: '下肢基礎建立', time: 25,
              exercises: [ GOBLET_SQUAT(4,10,75,'加重挑戰'), DB_RDL(4,10,75), GLUTE_BRIDGE(4,10,75), CALF_RAISE(4,12,75) ],
            },
            {
              dayNumber: 2, focus: '後側發力強化', time: 25,
              exercises: [ DB_RDL(4,10,75), GOBLET_SQUAT(4,10,75), GLUTE_BRIDGE(4,10,75), CALF_RAISE(4,12,75) ],
            },
            {
              dayNumber: 3, focus: '下肢綜合', time: 25,
              exercises: [ GOBLET_SQUAT(4,11,75), DB_RDL(4,11,75), GLUTE_BRIDGE(4,11,75), CALF_RAISE(4,15,75) ],
            },
          ],
        },
        /* ── 第 4 週（4×12，75 秒休息）── */
        {
          weekNumber: 4, name: '巔峰突破',
          days: [
            {
              dayNumber: 1, focus: '下肢基礎建立', time: 25,
              exercises: [ GOBLET_SQUAT(4,12,75,'本月最重量'), DB_RDL(4,12,75), GLUTE_BRIDGE(4,12,75), CALF_RAISE(4,15,75) ],
            },
            {
              dayNumber: 2, focus: '後側發力強化', time: 25,
              exercises: [ DB_RDL(4,12,75), GOBLET_SQUAT(4,12,75), GLUTE_BRIDGE(4,12,75), CALF_RAISE(4,15,75) ],
            },
            {
              dayNumber: 3, focus: '下肢綜合', time: 25,
              exercises: [ GOBLET_SQUAT(4,12,75,'本月最後一練！'), DB_RDL(4,12,75), GLUTE_BRIDGE(4,15,75), CALF_RAISE(4,20,75) ],
            },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════╗
       ║  中階 — INTERMEDIATE                         ║
       ║  5 動作 × 每週 4 天 (前後側分離訓練)            ║
       ║  核心：Day A 專攻股四頭 / Day B 專攻腿後側與臀   ║
       ╚══════════════════════════════════════════════╝ */
    intermediate: {
      key: 'intermediate',
      label: '中階',
      labelEn: 'Intermediate',
      recommendedDays: 2,
      recommendedDaysLabel: '建議每週 2 天',
      durationPerSession: '30-35',
      equipment: ['啞鈴', '椅子', '書本(墊腳尖)'],
      targetArea: '股四頭肌分離度、蜜桃臀',
      intensity: '中等至高',
      expectedGain: '大腿前側出現淚滴線條，臀位顯著提高',
      benefits: [
        '透過墊高腳跟深蹲，最大化股四頭肌張力',
        'B字站位硬舉完美隔離單邊腿後側與臀部',
        '分離訓練讓單一肌群獲得充分刺激與恢復',
        '保加利亞分腿蹲大幅改善左右腿肌力失衡',
      ],
      periodization: {
        phase1: { name: '分化適應', weeks: '第 1–2 週', focus: '適應墊高與B字站位技巧', reps: '10–12 次', intensity: '中等重量' },
        phase2: { name: '肌肥大衝刺', weeks: '第 3–4 週', focus: '追求力竭、提升代謝壓力', reps: '12–15 次', intensity: '中大重量' },
      },
      weeks: [
        /* ── 第 1 週（4×10，60 秒休息）── */
        {
          weekNumber: 1, name: '分化訓練建立期',
          days: [
            {
              dayNumber: 1, focus: '股四頭主導 Day A', time: 28,
              exercises: [
                HEEL_SQUAT(4, '10-12', 60, '腳跟踩在書本上，膝蓋自然往前推'), 
                BULGARIAN(4, '10-12', 60, '左右各10-12下'), 
                LEG_EXTENSION(4, '12-15', 60, '頂部收縮停頓1秒'), 
                CALF_RAISE(4, '12-15', 60),
              ],
            },
            {
              dayNumber: 2, focus: '腿後/臀主導 Day B', time: 28,
              exercises: [
                DB_RDL(4, '10-12', 60), 
                HIP_THRUST(4, '10-12', 60, '肩胛骨下緣靠著椅子邊緣'), 
                B_STANCE_RDL(4, '10-12', 60, '後腳僅腳尖點地輔助平衡'), 
                LEG_CURL(4, '12-15', 60, '離心控制慢放'), 
                CALF_RAISE(4, '12-15', 60),
              ],
            },
          ],
        },
        /* ── 第 2 週（4×12，60 秒休息）── */
        {
          weekNumber: 2, name: '訓練量遞增',
          days: [
            {
              dayNumber: 3, focus: '股四頭主導 Day A', time: 28,
              exercises: [
                HEEL_SQUAT(4, '10-12', 60), 
                BULGARIAN(4, '10-12', 60, '適度加重'), 
                LEG_EXTENSION(4, '12-15', 60), 
                CALF_RAISE(4, '12-15', 60),
              ],
            },
            {
              dayNumber: 4, focus: '腿後/臀主導 Day B', time: 28,
              exercises: [
                DB_RDL(4, '10-12', 60), 
                HIP_THRUST(4, '10-12', 60, '頂部收縮用力'), 
                B_STANCE_RDL(4, '10-12', 60), 
                LEG_CURL(4, '12-15', 60), 
                CALF_RAISE(4, '12-15', 60),
              ],
            },
          ],
        },
        /* ── 第 3 週（4×12，75 秒休息，加重）── */
        {
          weekNumber: 3, name: '強度衝刺',
          days: [
            {
              dayNumber: 5, focus: '股四頭主導 Day A', time: 30,
              exercises: [
                HEEL_SQUAT(4, '8-10', 75, '比上週加重'), 
                BULGARIAN(4, '8-10', 75), 
                LEG_EXTENSION(4, '10-12', 75), 
                CALF_RAISE(4, '15-20', 75),
              ],
            },
            {
              dayNumber: 6, focus: '腿後/臀主導 Day B', time: 30,
              exercises: [
                DB_RDL(4, '8-10', 75, '加重挑戰'), 
                HIP_THRUST(4, '8-10', 75), 
                B_STANCE_RDL(4, '8-10', 75), 
                LEG_CURL(4, '10-12', 75), 
                CALF_RAISE(4, '15-20', 75),
              ],
            },
          ],
        },
        /* ── 第 4 週（4×15，75 秒休息，最高訓練量）── */
        {
          weekNumber: 4, name: '巔峰訓練量',
          days: [
            {
              dayNumber: 7, focus: '股四頭主導 Day A', time: 30,
              exercises: [
                HEEL_SQUAT(4, '8-10', 75, '本月衝刺'), 
                BULGARIAN(4, '8-10', 75), 
                LEG_EXTENSION(4, '10-12', 75, '最後加一個遞減組'), 
                CALF_RAISE(4, '15-20', 75),
              ],
            },
            {
              dayNumber: 8, focus: '腿後/臀主導 Day B', time: 30,
              exercises: [
                DB_RDL(4, '8-10', 75), 
                HIP_THRUST(4, '8-10', 75, '維持良好收縮品質'), 
                B_STANCE_RDL(4, '8-10', 75), 
                LEG_CURL(4, '10-12', 75, '最後加一個遞減組'), 
                CALF_RAISE(4, '15-20', 75),
              ],
            },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════╗
       ║  精熟 — ADVANCED                             ║
       ║  3 個拮抗肌超級組 × 每週 4 天                 ║
       ║  核心：前側(股四頭) ➜ 後側(腿後) 無縫銜接，榨乾體能║
       ╚══════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟',
      labelEn: 'Advanced',
      recommendedDays: 2,
      recommendedDaysLabel: '建議每週 2 天',
      durationPerSession: '35-40',
      equipment: ['啞鈴', '椅子', '書本(墊腳尖)'],
      targetArea: '整體下肢與心肺',
      intensity: '高至極高',
      expectedGain: '下肢肌力與爆發力雙修，肌肉線條立體分明',
      benefits: [
        '拮抗肌超級組(Antagonist Supersets)帶來極限代謝壓力',
        '前側發力時後側拉伸休息，大幅提升訓練密度與效率',
        '避免雙重複合動作中軸壓迫，確保下背安全',
        '突破傳統直線組的維度與力量生長停滯期',
      ],
      periodization: {
        phase1: { name: '超級組適應', weeks: '第 1–2 週', focus: '熟悉心肺壓力、90 秒組間休息', reps: '10–12 次', intensity: '中至大重量' },
        phase2: { name: '強度壓縮', weeks: '第 3–4 週', focus: '縮短組間休息至 75 秒、增加組數', reps: '12 次', intensity: '大重量' },
      },
      weeks: [
        /* ── 第 1 週（4 組，10 次，配對休息 90 秒）── */
        {
          weekNumber: 1, name: '超級組適應期',
          days: [
            {
              dayNumber: 1, focus: '超級組 A+B+C', time: 32,
              exercises: [
                SS_SQUAT(4,10,90), SS_LEG_CURL(4,10,90),
                SS_RDL(4,10,90), SS_LEG_EXT(4,10,90),
                SS_THRUST(4,10,90), SS_CALF(4,15,90),
              ],
            },
            {
              dayNumber: 2, focus: '變化超級組', time: 32,
              exercises: [
                SS_GOBLET(4,10,90), SS_LEG_CURL(4,10,90),
                SS_B_RDL(4,10,90), SS_LEG_EXT(4,10,90),
                SS_THRUST(4,10,90), SS_CALF(4,15,90),
              ],
            },
          ],
        },
        /* ── 第 2 週（4 組，12 次，配對休息 90 秒）── */
        {
          weekNumber: 2, name: '訓練量提升',
          days: [
            {
              dayNumber: 3, focus: '超級組 A+B+C', time: 32,
              exercises: [
                SS_SQUAT(4,12,90), SS_LEG_CURL(4,12,90),
                SS_RDL(4,12,90), SS_LEG_EXT(4,12,90),
                SS_THRUST(4,12,90), SS_CALF(4,15,90),
              ],
            },
            {
              dayNumber: 4, focus: '變化超級組', time: 32,
              exercises: [
                SS_GOBLET(4,12,90), SS_LEG_CURL(4,12,90),
                SS_B_RDL(4,12,90), SS_LEG_EXT(4,12,90),
                SS_THRUST(4,12,90), SS_CALF(4,15,90),
              ],
            },
          ],
        },
        /* ── 第 3 週（4 組，12 次，配對休息縮短至 75 秒）── */
        {
          weekNumber: 3, name: '強度壓縮',
          days: [
            {
              dayNumber: 5, focus: '超級組 縮短休息', time: 30,
              exercises: [
                SS_SQUAT(4,12,75), SS_LEG_CURL(4,12,75),
                SS_RDL(4,12,75), SS_LEG_EXT(4,12,75),
                SS_THRUST(4,12,75), SS_CALF(4,20,75),
              ],
            },
            {
              dayNumber: 6, focus: '變化超級組 縮短休息', time: 30,
              exercises: [
                SS_GOBLET(4,12,75), SS_LEG_CURL(4,12,75),
                SS_B_RDL(4,12,75), SS_LEG_EXT(4,12,75),
                SS_THRUST(4,12,75), SS_CALF(4,20,75),
              ],
            },
          ],
        },
        /* ── 第 4 週（5 組，12 次，配對休息 75 秒，最高訓練量）── */
        {
          weekNumber: 4, name: '巔峰爆發',
          days: [
            {
              dayNumber: 7, focus: '超級組 5 組衝刺', time: 37,
              exercises: [
                SS_SQUAT(5,12,75), SS_LEG_CURL(5,12,75),
                SS_RDL(5,12,75), SS_LEG_EXT(5,12,75),
                SS_THRUST(5,12,75), SS_CALF(5,20,75),
              ],
            },
            {
              dayNumber: 8, focus: '變化超級組 最終衝刺', time: 37,
              exercises: [
                SS_GOBLET(5,12,75), SS_LEG_CURL(5,12,75),
                SS_B_RDL(5,12,75), SS_LEG_EXT(5,12,75),
                SS_THRUST(5,12,75), SS_CALF(5,20,75),
              ],
            },
          ],
        },
      ],
    },
  },
};

// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(LEG_PLAN);
