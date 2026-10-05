import applyWeek4Deload from '../utils/planDeloadNormalizer';
// 科學化全身線條雕塑計畫 — 三個等級：新手 / 中階 / 精熟
// 根據全身高頻率訓練與 PHA（外周心臟作用）原則設計：
//  • 新手  : 4 個複合動作（深蹲/硬舉/推/拉），25–30 min
//  • 中階  : 5 個動作（全身A/B交替，加入單側與垂直推），30–35 min
//  • 精熟  : 3 個上下半身超級組（深蹲+划船、硬舉+胸推），35–40 min

/* ─── TIME UTILITIES ────────────────────────────────────────── */

const EXEC_SEC     = 25;   // sec/set — bilateral exercise
const EXEC_SEC_UNI = 45;   // sec/set — unilateral (both sides sequential)
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
   EXERCISE HELPERS (FULL BODY) - 已與黃金大腦完美對齊
═══════════════════════════════════════════════════════ */

// Bilateral exercises (雙側複合動作)
const GOBLET_SQUAT = (s, r, rest, note) => ({ name: '高腳杯深蹲',       nameEn: 'Goblet Squat',          sets: s, reps: r, rest, target: '股四頭、臀部、核心', tier: 2, ...(note ? { note } : {}) });
const DB_RDL       = (s, r, rest, note) => ({ name: '羅馬尼亞硬舉',     nameEn: 'Romanian Deadlift',     sets: s, reps: r, rest, target: '腿後側、臀部、下背', tier: 2, ...(note ? { note } : {}) });
const DB_ROW       = (s, r, rest, note) => ({ name: '俯身划船',         nameEn: 'Bent Over Row',         sets: s, reps: r, rest, target: '背闊肌、二頭肌',     tier: 2, ...(note ? { note } : {}) });
const FLOOR_PRESS  = (s, r, rest, note) => ({ name: '啞鈴地板胸推',     nameEn: 'Dumbbell Floor Press',  sets: s, reps: r, rest, target: '胸大肌、三頭肌',     tier: 2, ...(note ? { note } : {}) });
const OHP          = (s, r, rest, note) => ({ name: '啞鈴肩推',         nameEn: 'Dumbbell Shoulder Press',sets: s, reps: r, rest, target: '三角肌、三頭肌',     tier: 2, ...(note ? { note } : {}) });
const GLUTE_BRIDGE = (s, r, rest, note) => ({ name: '橋式',             nameEn: 'Glute Bridge',          sets: s, reps: r, rest, target: '臀大肌、核心',       tier: 3, ...(note ? { note } : {}) });

// Unilateral / Alternating exercises (單側動作)
const REV_LUNGE    = (s, r, rest, note) => ({ name: '後跨步弓箭步',     nameEn: 'Reverse Lunge',         sets: s, reps: r, rest, target: '下肢綜合、平衡',     tier: 2, unilateral: true, ...(note ? { note } : {}) });
const SINGLE_ROW   = (s, r, rest, note) => ({ name: '單臂啞鈴划船',     nameEn: 'Single Arm Dumbbell Row',sets: s, reps: r, rest, target: '背闊肌 (單側收縮)',  tier: 2, unilateral: true, ...(note ? { note } : {}) });

// Superset helpers (上下半身拮抗配對 PHA)
// Pair 1: Squat (Lower) + Row (Upper Pull)
const SS_SQUAT     = (s, r, rest_pair, note) => ({ name: '高腳杯深蹲',       nameEn: 'Goblet Squat',          sets: s, reps: r, rest: SS_GAP, target: '下肢前側',     tier: 2, superset: true,  supersetGroup: 'A', note: note || '超級組 A ➜ 直接接划船' });
const SS_ROW       = (s, r, rest_pair, note) => ({ name: '俯身划船',         nameEn: 'Bent Over Row',         sets: s, reps: r, rest: rest_pair, target: '上半身拉',     tier: 2, supersetGroup: 'A', note: note || `超級組 A ✓ 休息 ${rest_pair} 秒` });
// Pair 2: RDL (Lower Hinge) + Press (Upper Push)
const SS_RDL       = (s, r, rest_pair, note) => ({ name: '羅馬尼亞硬舉',     nameEn: 'Romanian Deadlift',     sets: s, reps: r, rest: SS_GAP, target: '下肢後側',     tier: 2, superset: true,  supersetGroup: 'B', note: note || '超級組 B ➜ 直接接地胸推' });
const SS_PRESS     = (s, r, rest_pair, note) => ({ name: '啞鈴地板胸推',     nameEn: 'Dumbbell Floor Press',  sets: s, reps: r, rest: rest_pair, target: '上半身推',     tier: 2, supersetGroup: 'B', note: note || `超級組 B ✓ 休息 ${rest_pair} 秒` });
// Pair 3: Unilateral Leg + Shoulders (Accessories/Core)
const SS_LUNGE     = (s, r, rest_pair, note) => ({ name: '後跨步弓箭步',     nameEn: 'Reverse Lunge',         sets: s, reps: r, rest: SS_GAP, target: '下肢綜合',     tier: 2, superset: true,  supersetGroup: 'C', unilateral: true, note: note || '超級組 C ➜ 直接接肩推' });
const SS_OHP       = (s, r, rest_pair, note) => ({ name: '啞鈴肩推',         nameEn: 'Dumbbell Shoulder Press',sets: s, reps: r, rest: rest_pair, target: '肩膀與核心',   tier: 2, supersetGroup: 'C', note: note || `超級組 C ✓ 休息 ${rest_pair} 秒` });


/* ═══════════════════════════════════════════════════════
   FULL BODY PLAN
═══════════════════════════════════════════════════════ */
export const FULLBODY_PLAN = {
  id: 'fullbody-sculpt-science',
  name: '科學化全身線條雕塑計畫',
  subtitle: '高效率燃脂與肌肉均衡發展',
  bodyPart: 'fullbody',
  bodyPartLabel: '全身',
  duration: 30,
  coverImage: '/images/fullbody-workout-cover.jpg',
  description: '結合高頻率全身訓練與 PHA（外周心臟作用）原理，每次訓練都能啟動全身高達 80% 的肌肉群。這份計畫能最大化卡路里消耗，同時建立勻稱的胸背與緊實的臀腿線條，是最適合居家或忙碌現代人的終極雕塑方案。',
  tags: ['全身燃脂', '肌肉勻稱', '高效率', '體態雕塑'],

  levels: {

    /* ╔══════════════════════════════════════════════╗
       ║  新手 — BEGINNER                             ║
       ║  4 動作 × 每週 3 天                           ║
       ║  核心：掌握人體四大基本動作模式                 ║
       ╚══════════════════════════════════════════════╝ */
    beginner: {
      key: 'beginner',
      label: '新手',
      labelEn: 'Beginner',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '25-30',
      equipment: ['啞鈴', '墊子'],
      targetArea: '全身主要大肌群',
      intensity: '低至中等',
      expectedGain: '建立全身基礎肌力，顯著提升基礎代謝率',
      benefits: [
        '一次學會深蹲、硬舉、推、拉四大基本動作',
        '高頻率刺激全身，新手期增肌減脂效果最快',
        '建立良好的核心穩定與關節連動能力',
        '養成每週規律運動且不至於過度疲勞的習慣',
      ],
      periodization: {
        phase1: { name: '動作建構', weeks: '第 1–2 週', focus: '控制離心、確保姿勢正確', reps: '10–12 次', intensity: '輕至中等' },
        phase2: { name: '肌力累積', weeks: '第 3–4 週', focus: '穩步增加啞鈴重量', reps: '10–12 次', intensity: '中等重量' },
      },
      weeks: [
        /* ── 第 1 週（3×10，60 秒休息）── */
        {
          weekNumber: 1, name: '全身啟動期',
          days: [
            {
              dayNumber: 1, focus: '全身基礎平衡', time: 16,
              exercises: [ GOBLET_SQUAT(3,10,60), FLOOR_PRESS(3,10,60,'手肘微內收，感受胸肌出力'), DB_ROW(3,10,60,'背部保持平直'), GLUTE_BRIDGE(3,10,60) ],
            },
            {
              dayNumber: 2, focus: '全身基礎平衡', time: 16,
              exercises: [ DB_RDL(3,10,60), DB_ROW(3,10,60), FLOOR_PRESS(3,10,60), GOBLET_SQUAT(3,10,60) ],
            },
            {
              dayNumber: 3, focus: '全身基礎平衡', time: 16,
              exercises: [ GOBLET_SQUAT(3,12,60), FLOOR_PRESS(3,12,60), DB_ROW(3,12,60), GLUTE_BRIDGE(3,12,60) ],
            },
          ],
        },
        /* ── 第 2 週（3×12，60 秒休息）── */
        {
          weekNumber: 2, name: '肌耐力建立',
          days: [
            {
              dayNumber: 1, focus: '全身基礎平衡', time: 16,
              exercises: [ GOBLET_SQUAT(3,12,60), FLOOR_PRESS(3,12,60), DB_ROW(3,12,60), DB_RDL(3,12,60) ],
            },
            {
              dayNumber: 2, focus: '全身基礎平衡', time: 16,
              exercises: [ DB_RDL(3,12,60), DB_ROW(3,12,60), FLOOR_PRESS(3,12,60), GLUTE_BRIDGE(3,12,60) ],
            },
            {
              dayNumber: 3, focus: '全身基礎平衡', time: 16,
              exercises: [ GOBLET_SQUAT(3,15,60,'嘗試挑戰15下'), FLOOR_PRESS(3,15,60), DB_ROW(3,15,60), GLUTE_BRIDGE(3,15,60) ],
            },
          ],
        },
        /* ── 第 3 週（4×10，75 秒休息）── */
        {
          weekNumber: 3, name: '阻力提升',
          days: [
            {
              dayNumber: 1, focus: '全身阻力挑戰', time: 25,
              exercises: [ GOBLET_SQUAT(4,10,75,'加重啞鈴'), FLOOR_PRESS(4,10,75), DB_ROW(4,10,75), GLUTE_BRIDGE(4,12,75) ],
            },
            {
              dayNumber: 2, focus: '全身阻力挑戰', time: 25,
              exercises: [ DB_RDL(4,10,75,'加重啞鈴'), DB_ROW(4,10,75), FLOOR_PRESS(4,10,75), GOBLET_SQUAT(4,10,75) ],
            },
            {
              dayNumber: 3, focus: '全身阻力挑戰', time: 25,
              exercises: [ GOBLET_SQUAT(4,12,75), FLOOR_PRESS(4,12,75), DB_ROW(4,12,75), DB_RDL(4,12,75) ],
            },
          ],
        },
        /* ── 第 4 週（4×12，75 秒休息）── */
        {
          weekNumber: 4, name: '巔峰突破',
          days: [
            {
              dayNumber: 1, focus: '全身巔峰訓練', time: 25,
              exercises: [ GOBLET_SQUAT(4,12,75,'本月最重量'), FLOOR_PRESS(4,12,75), DB_ROW(4,12,75), GLUTE_BRIDGE(4,15,75) ],
            },
            {
              dayNumber: 2, focus: '全身巔峰訓練', time: 25,
              exercises: [ DB_RDL(4,12,75), DB_ROW(4,12,75), FLOOR_PRESS(4,12,75), GOBLET_SQUAT(4,12,75) ],
            },
            {
              dayNumber: 3, focus: '全身巔峰訓練', time: 25,
              exercises: [ GOBLET_SQUAT(4,12,75,'最後一練全力以赴！'), FLOOR_PRESS(4,12,75), DB_ROW(4,12,75), DB_RDL(4,12,75) ],
            },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════╗
       ║  中階 — INTERMEDIATE                         ║
       ║  5 動作 × 每週 4 天 (Day A / Day B)           ║
       ║  核心：增加動作多樣性（垂直推、單側），提高頻率 ║
       ╚══════════════════════════════════════════════╝ */
    intermediate: {
      key: 'intermediate',
      label: '中階',
      labelEn: 'Intermediate',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '30-35',
      equipment: ['啞鈴', '椅子', '墊子'],
      targetArea: '全身肌肉線條、左右對稱性',
      intensity: '中等至高',
      expectedGain: '肌肉量顯著增加，體態變得緊實有線條',
      benefits: [
        '透過 Day A/B 課表交替，確保肌肉有足夠恢復期卻又保持高頻率刺激',
        '加入肩推(垂直推)，讓上半身視覺更立體，呈現倒三角與直角肩',
        '單手划船與弓箭步能改善左右半邊的力量不平衡',
        '整體訓練量增加，加速卡路里消耗與體脂下降',
      ],
      periodization: {
        phase1: { name: '容量適應', weeks: '第 1–2 週', focus: '熟悉 A/B 日切換、控制單側穩定', reps: '10–12 次', intensity: '中等重量' },
        phase2: { name: '肌肥大衝刺', weeks: '第 3–4 週', focus: '挑戰每組最後2下力竭', reps: '12–15 次', intensity: '中大重量' },
      },
      weeks: [
        /* ── 第 1 週（4×10，60 秒休息）── */
        {
          weekNumber: 1, name: '全身分化建立期',
          days: [
            {
              dayNumber: 1, focus: '全身 A (深蹲/水平推拉)', time: 28,
              exercises: [ GOBLET_SQUAT(4,10,60), FLOOR_PRESS(4,10,60), DB_ROW(4,10,60), REV_LUNGE(4,10,60,'左右各10下'), GLUTE_BRIDGE(4,12,60) ],
            },
            {
              dayNumber: 2, focus: '全身 B (硬舉/垂直推/單側拉)', time: 28,
              exercises: [ DB_RDL(4,10,60), OHP(4,10,60,'保持核心繃緊，背部微靠椅背'), SINGLE_ROW(4,10,60,'感受單側背闊肌收縮'), GOBLET_SQUAT(4,10,60), FLOOR_PRESS(4,10,60) ],
            },
            {
              dayNumber: 3, focus: '全身 A (深蹲/水平推拉)', time: 28,
              exercises: [ GOBLET_SQUAT(4,10,60), FLOOR_PRESS(4,10,60), DB_ROW(4,10,60), REV_LUNGE(4,10,60), GLUTE_BRIDGE(4,12,60) ],
            },
            {
              dayNumber: 4, focus: '全身 B (硬舉/垂直推/單側拉)', time: 28,
              exercises: [ DB_RDL(4,10,60), OHP(4,10,60), SINGLE_ROW(4,10,60), GOBLET_SQUAT(4,10,60), FLOOR_PRESS(4,10,60) ],
            },
          ],
        },
        /* ── 第 2 週（4×12，60 秒休息）── */
        {
          weekNumber: 2, name: '訓練量遞增',
          days: [
            {
              dayNumber: 1, focus: '全身 A (深蹲/水平推拉)', time: 28,
              exercises: [ GOBLET_SQUAT(4,12,60), FLOOR_PRESS(4,12,60), DB_ROW(4,12,60), REV_LUNGE(4,12,60), GLUTE_BRIDGE(4,15,60) ],
            },
            {
              dayNumber: 2, focus: '全身 B (硬舉/垂直推/單側拉)', time: 28,
              exercises: [ DB_RDL(4,12,60), OHP(4,12,60), SINGLE_ROW(4,12,60), GOBLET_SQUAT(4,12,60), FLOOR_PRESS(4,12,60) ],
            },
            {
              dayNumber: 3, focus: '全身 A (深蹲/水平推拉)', time: 28,
              exercises: [ GOBLET_SQUAT(4,12,60), FLOOR_PRESS(4,12,60), DB_ROW(4,12,60), REV_LUNGE(4,12,60), GLUTE_BRIDGE(4,15,60) ],
            },
            {
              dayNumber: 4, focus: '全身 B (硬舉/垂直推/單側拉)', time: 28,
              exercises: [ DB_RDL(4,12,60), OHP(4,12,60), SINGLE_ROW(4,12,60), GOBLET_SQUAT(4,12,60), FLOOR_PRESS(4,12,60) ],
            },
          ],
        },
        /* ── 第 3 週（4×12，75 秒休息，加重）── */
        {
          weekNumber: 3, name: '強度衝刺',
          days: [
            {
              dayNumber: 1, focus: '全身 A (深蹲/水平推拉)', time: 30,
              exercises: [ GOBLET_SQUAT(4,12,75,'全面加重'), FLOOR_PRESS(4,12,75), DB_ROW(4,12,75), REV_LUNGE(4,12,75), GLUTE_BRIDGE(4,15,75) ],
            },
            {
              dayNumber: 2, focus: '全身 B (硬舉/垂直推/單側拉)', time: 30,
              exercises: [ DB_RDL(4,12,75,'加重'), OHP(4,12,75), SINGLE_ROW(4,12,75), GOBLET_SQUAT(4,12,75), FLOOR_PRESS(4,12,75) ],
            },
            {
              dayNumber: 3, focus: '全身 A (深蹲/水平推拉)', time: 30,
              exercises: [ GOBLET_SQUAT(4,12,75), FLOOR_PRESS(4,12,75), DB_ROW(4,12,75), REV_LUNGE(4,12,75), GLUTE_BRIDGE(4,15,75) ],
            },
            {
              dayNumber: 4, focus: '全身 B (硬舉/垂直推/單側拉)', time: 30,
              exercises: [ DB_RDL(4,12,75), OHP(4,12,75), SINGLE_ROW(4,12,75), GOBLET_SQUAT(4,12,75), FLOOR_PRESS(4,12,75) ],
            },
          ],
        },
        /* ── 第 4 週（4×15，75 秒休息，最高訓練量）── */
        {
          weekNumber: 4, name: '巔峰訓練量',
          days: [
            {
              dayNumber: 1, focus: '全身 A (深蹲/水平推拉)', time: 30,
              exercises: [ GOBLET_SQUAT(4,15,75,'本月衝刺'), FLOOR_PRESS(4,15,75), DB_ROW(4,15,75), REV_LUNGE(4,15,75), GLUTE_BRIDGE(4,20,75) ],
            },
            {
              dayNumber: 2, focus: '全身 B (硬舉/垂直推/單側拉)', time: 30,
              exercises: [ DB_RDL(4,15,75), OHP(4,15,75), SINGLE_ROW(4,12,75,'維持12下確保品質'), GOBLET_SQUAT(4,15,75), FLOOR_PRESS(4,15,75) ],
            },
            {
              dayNumber: 3, focus: '全身 A (深蹲/水平推拉)', time: 30,
              exercises: [ GOBLET_SQUAT(4,15,75), FLOOR_PRESS(4,15,75), DB_ROW(4,15,75), REV_LUNGE(4,15,75), GLUTE_BRIDGE(4,20,75) ],
            },
            {
              dayNumber: 4, focus: '全身 B (硬舉/垂直推/單側拉)', time: 30,
              exercises: [ DB_RDL(4,15,75,'最後一練！'), OHP(4,15,75), SINGLE_ROW(4,12,75), GOBLET_SQUAT(4,15,75), FLOOR_PRESS(4,15,75) ],
            },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════╗
       ║  精熟 — ADVANCED                             ║
       ║  3 個超級組 (上下半身拮抗配對) × 每週 4 天      ║
       ║  核心：產生極大外周心臟作用 (PHA)，榨乾體能   ║
       ╚══════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟',
      labelEn: 'Advanced',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '35-40',
      equipment: ['啞鈴', '椅子', '墊子'],
      targetArea: '全身極限燃脂、肌肉耐受力',
      intensity: '高至極高',
      expectedGain: '體脂率顯著下降，肌肉密度與線條刻畫達到巔峰',
      benefits: [
        '上下半身交替的 PHA 超級組，讓心跳率居高不下，燃脂效果等同高強度間歇(HIIT)',
        '下肢訓練時上肢休息（反之亦然），能在短時間內塞入巨大訓練量',
        '深蹲接划船、硬舉接胸推，完美平衡人體前後側張力',
        '極度考驗心肺耐力與意志力，突破體能與體態的最終高原期',
      ],
      periodization: {
        phase1: { name: '超級組適應', weeks: '第 1–2 週', focus: '適應劇烈的心肺壓力、90秒休息', reps: '10–12 次', intensity: '中至大重量' },
        phase2: { name: '極限代謝', weeks: '第 3–4 週', focus: '縮短休息至75秒、挑戰肌肉泵感', reps: '12–15 次', intensity: '大重量' },
      },
      weeks: [
        /* ── 第 1 週（4 組，10 次，配對休息 90 秒）── */
        {
          weekNumber: 1, name: '代謝適應期',
          days: [
            {
              dayNumber: 1, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,10,90), SS_ROW(4,10,90),
                SS_RDL(4,10,90), SS_PRESS(4,10,90),
                SS_LUNGE(4,10,90), SS_OHP(4,10,90),
              ],
            },
            {
              dayNumber: 2, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,10,90), SS_ROW(4,10,90),
                SS_RDL(4,10,90), SS_PRESS(4,10,90),
                SS_LUNGE(4,10,90), SS_OHP(4,10,90),
              ],
            },
            {
              dayNumber: 3, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,10,90), SS_ROW(4,10,90),
                SS_RDL(4,10,90), SS_PRESS(4,10,90),
                SS_LUNGE(4,10,90), SS_OHP(4,10,90),
              ],
            },
            {
              dayNumber: 4, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,10,90), SS_ROW(4,10,90),
                SS_RDL(4,10,90), SS_PRESS(4,10,90),
                SS_LUNGE(4,10,90), SS_OHP(4,10,90),
              ],
            },
          ],
        },
        /* ── 第 2 週（4 組，12 次，配對休息 90 秒）── */
        {
          weekNumber: 2, name: '訓練量提升',
          days: [
            {
              dayNumber: 1, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,12,90), SS_ROW(4,12,90),
                SS_RDL(4,12,90), SS_PRESS(4,12,90),
                SS_LUNGE(4,12,90), SS_OHP(4,12,90),
              ],
            },
            {
              dayNumber: 2, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,12,90), SS_ROW(4,12,90),
                SS_RDL(4,12,90), SS_PRESS(4,12,90),
                SS_LUNGE(4,12,90), SS_OHP(4,12,90),
              ],
            },
            {
              dayNumber: 3, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,12,90), SS_ROW(4,12,90),
                SS_RDL(4,12,90), SS_PRESS(4,12,90),
                SS_LUNGE(4,12,90), SS_OHP(4,12,90),
              ],
            },
            {
              dayNumber: 4, focus: '全身 PHA 超級組', time: 32,
              exercises: [
                SS_SQUAT(4,12,90), SS_ROW(4,12,90),
                SS_RDL(4,12,90), SS_PRESS(4,12,90),
                SS_LUNGE(4,12,90), SS_OHP(4,12,90),
              ],
            },
          ],
        },
        /* ── 第 3 週（4 組，12/15 次，配對休息縮短至 75 秒）── */
        {
          weekNumber: 3, name: '強度與心肺壓縮',
          days: [
            {
              dayNumber: 1, focus: '全身 PHA 縮短休息', time: 30,
              exercises: [
                SS_SQUAT(4,12,75), SS_ROW(4,12,75),
                SS_RDL(4,12,75), SS_PRESS(4,12,75),
                SS_LUNGE(4,12,75), SS_OHP(4,15,75),
              ],
            },
            {
              dayNumber: 2, focus: '全身 PHA 縮短休息', time: 30,
              exercises: [
                SS_SQUAT(4,12,75), SS_ROW(4,12,75),
                SS_RDL(4,12,75), SS_PRESS(4,12,75),
                SS_LUNGE(4,12,75), SS_OHP(4,15,75),
              ],
            },
            {
              dayNumber: 3, focus: '全身 PHA 縮短休息', time: 30,
              exercises: [
                SS_SQUAT(4,12,75), SS_ROW(4,12,75),
                SS_RDL(4,12,75), SS_PRESS(4,12,75),
                SS_LUNGE(4,12,75), SS_OHP(4,15,75),
              ],
            },
            {
              dayNumber: 4, focus: '全身 PHA 縮短休息', time: 30,
              exercises: [
                SS_SQUAT(4,12,75), SS_ROW(4,12,75),
                SS_RDL(4,12,75), SS_PRESS(4,12,75),
                SS_LUNGE(4,12,75), SS_OHP(4,15,75),
              ],
            },
          ],
        },
        /* ── 第 4 週（5 組大重量與高次數，配對休息 75 秒）── */
        {
          weekNumber: 4, name: '全身極限燃燒',
          days: [
            {
              dayNumber: 1, focus: '全身 PHA 5 組衝刺', time: 37,
              exercises: [
                SS_SQUAT(5,12,75), SS_ROW(5,12,75),
                SS_RDL(5,12,75), SS_PRESS(5,12,75),
                SS_LUNGE(5,12,75), SS_OHP(5,15,75),
              ],
            },
            {
              dayNumber: 2, focus: '全身 PHA 5 組衝刺', time: 37,
              exercises: [
                SS_SQUAT(5,12,75), SS_ROW(5,12,75),
                SS_RDL(5,12,75), SS_PRESS(5,12,75),
                SS_LUNGE(5,12,75), SS_OHP(5,15,75),
              ],
            },
            {
              dayNumber: 3, focus: '全身 PHA 5 組衝刺', time: 37,
              exercises: [
                SS_SQUAT(5,12,75), SS_ROW(5,12,75),
                SS_RDL(5,12,75), SS_PRESS(5,12,75),
                SS_LUNGE(5,12,75), SS_OHP(5,15,75),
              ],
            },
            {
              dayNumber: 4, focus: '全身 PHA 最終衝刺', time: 37,
              exercises: [
                SS_SQUAT(5,12,75), SS_ROW(5,12,75),
                SS_RDL(5,12,75), SS_PRESS(5,12,75),
                SS_LUNGE(5,12,75), SS_OHP(5,15,75),
              ],
            },
          ],
        },
      ],
    },
  },
};

// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(FULLBODY_PLAN);
