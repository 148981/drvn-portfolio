import applyWeek4Deload from '../utils/planDeloadNormalizer';
// 科學化蜜桃臀雕塑計畫 — 三個等級：新手 / 中階 / 精熟
// 根據針對臀大肌、臀中肌、臀小肌的解剖學與肌肥大原則設計：
//  • 新手  : 4 個動作，建立臀部啟動與鉸鏈基礎，25–30 min
//  • 中階  : 5 個動作（切分 橋式推舉主導 / 硬舉伸展主導），30–35 min
//  • 精熟  : 3 個超級組（極致拉伸 ➜ 頂峰收縮 無縫配對），35–40 min

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
   EXERCISE HELPERS (GLUTE-FOCUSED) - 與大腦完美對齊版
═══════════════════════════════════════════════════════ */

// Bilateral exercises (雙側)
const HIP_THRUST   = (s, r, rest, note) => ({ name: '槓鈴臀推',         nameEn: 'Barbell Hip Thrust',    sets: s, reps: r, rest, target: '臀大肌 (頂峰收縮)', tier: 2, ...(note ? { note } : {}) });
const GLUTE_BRIDGE = (s, r, rest, note) => ({ name: '橋式',             nameEn: 'Glute Bridge',          sets: s, reps: r, rest, target: '臀大肌',           tier: 3, ...(note ? { note } : {}) });
const FROG_PUMP    = (s, r, rest, note) => ({ name: '青蛙橋式',         nameEn: 'Frog Pump',             sets: s, reps: r, rest, target: '臀大肌、臀中肌',   tier: 3, ...(note ? { note } : {}) });
const SUMO_SQUAT   = (s, r, rest, note) => ({ name: '相撲深蹲',         nameEn: 'Sumo Squat',            sets: s, reps: r, rest, target: '臀大肌、大腿內側', tier: 2, ...(note ? { note } : {}) });
const DB_RDL       = (s, r, rest, note) => ({ name: '啞鈴羅馬尼亞硬舉', nameEn: 'Dumbbell Romanian Deadlift', sets: s, reps: r, rest, target: '臀大肌 (拉伸)、腿後', tier: 2, ...(note ? { note } : {}) });
const BACK_EXTENSION = (s, r, rest, note) => ({ name: '羅馬椅挺身',     nameEn: 'Back Extension',        sets: s, reps: r, rest, target: '上臀大肌',         tier: 3, ...(note ? { note } : {}) });

// Unilateral / Abduction exercises (單側/外展)
const BULGARIAN    = (s, r, rest, note) => ({ name: '保加利亞分腿蹲',   nameEn: 'Bulgarian Split Squat', sets: s, reps: r, rest, target: '臀大肌下緣、股四頭', tier: 2, unilateral: true, ...(note ? { note } : {}) });
const B_STANCE_RDL = (s, r, rest, note) => ({ name: 'B字站位硬舉',      nameEn: 'B-Stance Romanian Deadlift',          sets: s, reps: r, rest, target: '單側臀大肌 (拉伸)',   tier: 2, unilateral: true, ...(note ? { note } : {}) });
const DEFICIT_LUNGE= (s, r, rest, note) => ({ name: '墊高後跨步弓箭步', nameEn: 'Deficit Reverse Lunge', sets: s, reps: r, rest, target: '臀大肌下緣',         tier: 2, unilateral: true, ...(note ? { note } : {}) });
const CLAMSHELL    = (s, r, rest, note) => ({ name: '側躺蚌殼式',       nameEn: 'Clamshell',             sets: s, reps: r, rest, target: '臀中肌 (上臀飽滿度)', tier: 3, unilateral: true, ...(note ? { note } : {}) });
const SIDE_ABD     = (s, r, rest, note) => ({ name: '側臥髖外展',       nameEn: 'Side Lying Hip Abduction', sets: s, reps: r, rest, target: '臀中/小肌',      tier: 3, unilateral: true, ...(note ? { note } : {}) });

// Superset helpers (預先疲勞 + 完美配對)
// Pair 1: Pre-exhaustion (Clamshell) + Peak Contraction (Thrust)
const SS_CLAM_THRUST = (s, r, rest_pair) => ({ name: '側躺蚌殼式',       nameEn: 'Clamshell',             sets: s, reps: r, rest: SS_GAP, target: '預先疲勞側臀',     tier: 3, superset: true,  supersetGroup: 'A', unilateral: true, note: '超級組 A ➜ 直接接大重量臀推' });
const SS_THRUST    = (s, r, rest_pair) => ({ name: '槓鈴臀推',         nameEn: 'Barbell Hip Thrust',    sets: s, reps: r, rest: rest_pair, target: '臀大肌徹底榨乾', tier: 2, supersetGroup: 'A', note: `超級組 A ✓ 休息 ${rest_pair} 秒` });
// Pair 2: Unilateral Glute + Sumo Squat
const SS_LUNGE     = (s, r, rest_pair) => ({ name: '墊高後跨步弓箭步', nameEn: 'Deficit Reverse Lunge', sets: s, reps: r, rest: SS_GAP, target: '下臀線條',     tier: 2, superset: true,  supersetGroup: 'B', unilateral: true, note: '超級組 B ➜ 直接接相撲深蹲' });
const SS_SUMO      = (s, r, rest_pair) => ({ name: '相撲深蹲',         nameEn: 'Sumo Squat',            sets: s, reps: r, rest: rest_pair, target: '整體臀大肌',   tier: 2, supersetGroup: 'B', note: `超級組 B ✓ 休息 ${rest_pair} 秒` });
// Pair 3: Upper Glute Burnout (Abduction + Frog Pump)
const SS_ABD       = (s, r, rest_pair) => ({ name: '機械髖外展',       nameEn: 'Seated Hip Abduction',  sets: s, reps: r, rest: SS_GAP, target: '側臀/上臀',    tier: 3, superset: true,  supersetGroup: 'C', note: '超級組 C ➜ 直接接青蛙橋式' });
const SS_FROG      = (s, r, rest_pair) => ({ name: '青蛙橋式',         nameEn: 'Frog Pump',             sets: s, reps: r, rest: rest_pair, target: '臀肌徹底力竭', tier: 3, supersetGroup: 'C', note: `超級組 C ✓ 休息 ${rest_pair} 秒` });

// Alternative Superset Pairs
const SS_SIDE_ABD  = (s, r, rest_pair) => ({ name: '側臥髖外展',       nameEn: 'Side Lying Hip Abduction', sets: s, reps: r, rest: SS_GAP, target: '預先疲勞',     tier: 3, superset: true,  supersetGroup: 'A', unilateral: true, note: '超級組 A ➜ 直接接橋式' });
const SS_BRIDGE    = (s, r, rest_pair) => ({ name: '橋式',             nameEn: 'Glute Bridge',          sets: s, reps: r, rest: rest_pair, target: '臀大肌',       tier: 3, supersetGroup: 'A', note: `超級組 A ✓ 休息 ${rest_pair} 秒` });
const SS_BULG_SS   = (s, r, rest_pair) => ({ name: '保加利亞分腿蹲',   nameEn: 'Bulgarian Split Squat', sets: s, reps: r, rest: SS_GAP, target: '下臀/股四頭',  tier: 2, superset: true,  supersetGroup: 'B', unilateral: true, note: '超級組 B ➜ 直接接相撲深蹲' });



/* ═══════════════════════════════════════════════════════
   GLUTE PLAN
═══════════════════════════════════════════════════════ */
export const GLUTE_PLAN = {
  id: 'glute-hypertrophy-science',
  name: '極致蜜桃臀雕塑計畫',
  subtitle: '專注臀部啟動與立體感打造的科學課表',
  bodyPart: 'glutes',
  bodyPartLabel: '臀部',
  duration: 30,
  coverImage: '/images/glute-workout-cover.jpg',
  description: '針對臀大肌、臀中肌與臀小肌全面設計。從建立骨盆正位與肌肉感受度開始，過渡到大重量拉伸（硬舉）與頂峰收縮（臀推），並透過外展動作填補側臀凹陷，打造渾圓飽滿、不下垂的完美蜜桃臀。',
  tags: ['蜜桃臀', '側臀飽滿', '下臀線條', '骨盆穩定'],

  levels: {

    /* ╔══════════════════════════════════════════════╗
       ║  新手 — BEGINNER                             ║
       ║  4 動作 × 每週 3 天                           ║
       ║  核心：喚醒「臀肌失憶症」，建立正確骨盆後傾與發力 ║
       ╚══════════════════════════════════════════════╝ */
    beginner: {
      key: 'beginner',
      label: '新手',
      labelEn: 'Beginner',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '25-30',
      equipment: ['啞鈴', '彈力帶 (可選)'],
      targetArea: '整體臀大肌、臀中肌',
      intensity: '低至中等',
      expectedGain: '改善臀肌無力，臀部開始變挺、變緊實',
      benefits: [
        '喚醒久坐導致的「臀肌失憶症」',
        '學會臀推時的骨盆後傾技巧，不腰痠',
        '透過硬舉建立臀腿分離度',
        '蚌殼式強化臀中肌，改善假跨寬',
      ],
      periodization: {
        phase1: { name: '肌肉喚醒', weeks: '第 1–2 週', focus: '建立大腦與臀部的神經連結', reps: '12–15 次', intensity: '輕重量或徒手' },
        phase2: { name: '阻力適應', weeks: '第 3–4 週', focus: '逐步增加啞鈴負重', reps: '10–12 次', intensity: '中等重量' },
      },
      weeks: [
        /* ── 第 1 週（3×12，60 秒休息）── */
        {
          weekNumber: 1, name: '肌肉喚醒期',
          days: [
            {
              dayNumber: 1, focus: '臀肌全面啟動', time: 16,
              exercises: [ GLUTE_BRIDGE(3,12,60,'下巴微收，骨盆後傾頂起'), DB_RDL(3,12,60,'想像用臀部去關後面的門'), SUMO_SQUAT(3,12,60), CLAMSHELL(3,12,60,'感受側邊屁股痠痛') ],
            },
            {
              dayNumber: 2, focus: '臀肌全面啟動', time: 16,
              exercises: [ DB_RDL(3,12,60), GLUTE_BRIDGE(3,12,60), SUMO_SQUAT(3,12,60,'站距加寬，膝蓋朝向腳尖'), CLAMSHELL(3,12,60) ],
            },
            {
              dayNumber: 3, focus: '臀肌全面啟動', time: 16,
              exercises: [ GLUTE_BRIDGE(3,15,60), DB_RDL(3,12,60), SUMO_SQUAT(3,12,60), SIDE_ABD(3,15,60,'替換蚌殼式，直腿上抬') ],
            },
          ],
        },
        /* ── 第 2 週（3×15，60 秒休息）── */
        {
          weekNumber: 2, name: '耐力與感受度累積',
          days: [
            {
              dayNumber: 1, focus: '臀肌全面啟動', time: 18,
              exercises: [ GLUTE_BRIDGE(3,15,60), DB_RDL(3,12,60), SUMO_SQUAT(3,15,60), CLAMSHELL(3,15,60) ],
            },
            {
              dayNumber: 2, focus: '臀肌全面啟動', time: 18,
              exercises: [ DB_RDL(3,12,60), GLUTE_BRIDGE(3,15,60), SUMO_SQUAT(3,15,60), CLAMSHELL(3,15,60) ],
            },
            {
              dayNumber: 3, focus: '臀肌全面啟動', time: 18,
              exercises: [ GLUTE_BRIDGE(3,15,60,'頂部夾緊停頓2秒'), DB_RDL(3,12,60), SUMO_SQUAT(3,15,60), SIDE_ABD(3,15,60) ],
            },
          ],
        },
        /* ── 第 3 週（4×10，75 秒休息）── */
        {
          weekNumber: 3, name: '強度提升',
          days: [
            {
              dayNumber: 1, focus: '增加阻力挑戰', time: 25,
              exercises: [ GLUTE_BRIDGE(4,10,75,'腹部放啞鈴加重'), DB_RDL(4,10,75,'手持更重的啞鈴'), SUMO_SQUAT(4,10,75), CLAMSHELL(4,12,75) ],
            },
            {
              dayNumber: 2, focus: '增加阻力挑戰', time: 25,
              exercises: [ DB_RDL(4,10,75), GLUTE_BRIDGE(4,10,75), SUMO_SQUAT(4,10,75), CLAMSHELL(4,12,75) ],
            },
            {
              dayNumber: 3, focus: '增加阻力挑戰', time: 25,
              exercises: [ GLUTE_BRIDGE(4,12,75), DB_RDL(4,10,75), SUMO_SQUAT(4,12,75), SIDE_ABD(4,15,75) ],
            },
          ],
        },
        /* ── 第 4 週（4×12，75 秒休息）── */
        {
          weekNumber: 4, name: '巔峰突破',
          days: [
            {
              dayNumber: 1, focus: '全方位蜜桃臀', time: 25,
              exercises: [ GLUTE_BRIDGE(4,12,75,'本月最重量'), DB_RDL(4,12,75), SUMO_SQUAT(4,12,75), CLAMSHELL(4,15,75) ],
            },
            {
              dayNumber: 2, focus: '全方位蜜桃臀', time: 25,
              exercises: [ DB_RDL(4,12,75), GLUTE_BRIDGE(4,12,75), SUMO_SQUAT(4,12,75), CLAMSHELL(4,15,75) ],
            },
            {
              dayNumber: 3, focus: '全方位蜜桃臀', time: 25,
              exercises: [ GLUTE_BRIDGE(4,15,75,'最後一練！'), DB_RDL(4,12,75), SUMO_SQUAT(4,15,75), SIDE_ABD(4,20,75) ],
            },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════╗
       ║  中階 — INTERMEDIATE                         ║
       ║  5 動作 × 每週 4 天                           ║
       ║  核心：Day A 頂峰收縮與側臀 / Day B 極致拉伸與下臀 ║
       ╚══════════════════════════════════════════════╝ */
    intermediate: {
      key: 'intermediate',
      label: '中階',
      labelEn: 'Intermediate',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '30-35',
      equipment: ['啞鈴', '椅子', '書本(墊腳尖)'],
      targetArea: '上臀飽滿度、微笑曲線',
      intensity: '中等至高',
      expectedGain: '臀部維度增加，側臀凹陷改善，微笑線清晰',
      benefits: [
        '肩靠椅背臀推帶來極致的大重量收縮',
        'B字站位與墊高弓箭步，專注改善單邊臀部形狀與下臀線',
        '加入青蛙橋式與外展，針對上臀與側臀打造 3D 立體感',
        '分離不同發力機制的動作，讓肌肥大效益最大化',
      ],
      periodization: {
        phase1: { name: '機制作為', weeks: '第 1–2 週', focus: '適應肩靠椅背與單側發力', reps: '10–12 次', intensity: '中等重量' },
        phase2: { name: '立體雕刻', weeks: '第 3–4 週', focus: '追求力竭、提升代謝壓力', reps: '12–15 次', intensity: '中大重量' },
      },
      weeks: [
        /* ── 第 1 週（4×10，60 秒休息）── */
        {
          weekNumber: 1, name: '分化訓練建立期',
          days: [
            {
              dayNumber: 1, focus: '頂峰收縮與側臀 Day A', time: 28,
              exercises: [
                HIP_THRUST(4,10,60,'肩胛下緣靠椅，下巴微收'), SUMO_SQUAT(4,10,60), FROG_PUMP(4,15,60,'腳底板互對，快速收縮'), SIDE_ABD(4,12,60,'左右各12下'), CLAMSHELL(4,12,60),
              ],
            },
            {
              dayNumber: 2, focus: '極致拉伸與下臀 Day B', time: 28,
              exercises: [
                B_STANCE_RDL(4,10,60,'後腳點地，重心全在前腳臀部'), BACK_EXTENSION(4,12,60,'專注上臀大肌收縮'), GLUTE_BRIDGE(4,12,60), BULGARIAN(3,10,60,'降低下背壓力，著重下臀'),
              ],
            },
            {
              dayNumber: 3, focus: '頂峰收縮與側臀 Day A', time: 28,
              exercises: [
                HIP_THRUST(4,10,60), SUMO_SQUAT(4,10,60), FROG_PUMP(4,15,60), SIDE_ABD(4,12,60), CLAMSHELL(4,12,60),
              ],
            },
            {
              dayNumber: 4, focus: '極致拉伸與下臀 Day B', time: 28,
              exercises: [
                B_STANCE_RDL(4,10,60), BACK_EXTENSION(4,12,60), GLUTE_BRIDGE(4,12,60), BULGARIAN(3,10,60),
              ],
            },
          ],
        },
        /* ── 第 2 週（4×12，60 秒休息）── */
        {
          weekNumber: 2, name: '訓練量遞增',
          days: [
            {
              dayNumber: 1, focus: '頂峰收縮與側臀 Day A', time: 28,
              exercises: [
                HIP_THRUST(4,12,60), SUMO_SQUAT(4,12,60), FROG_PUMP(4,20,60), SIDE_ABD(4,15,60), CLAMSHELL(4,15,60),
              ],
            },
            {
              dayNumber: 2, focus: '極致拉伸與下臀 Day B', time: 28,
              exercises: [
                B_STANCE_RDL(4,12,60), BACK_EXTENSION(4,15,60), GLUTE_BRIDGE(4,15,60), BULGARIAN(3,12,60),
              ],
            },
            {
              dayNumber: 3, focus: '頂峰收縮與側臀 Day A', time: 28,
              exercises: [
                HIP_THRUST(4,12,60), SUMO_SQUAT(4,12,60), FROG_PUMP(4,20,60), SIDE_ABD(4,15,60), CLAMSHELL(4,15,60),
              ],
            },
            {
              dayNumber: 4, focus: '極致拉伸與下臀 Day B', time: 28,
              exercises: [
                B_STANCE_RDL(4,12,60), BACK_EXTENSION(4,15,60), GLUTE_BRIDGE(4,15,60), BULGARIAN(3,12,60),
              ],
            },
          ],
        },
        /* ── 第 3 週（4×12，75 秒休息，加重）── */
        {
          weekNumber: 3, name: '強度衝刺',
          days: [
            {
              dayNumber: 1, focus: '頂峰收縮與側臀 Day A', time: 30,
              exercises: [
                HIP_THRUST(4,12,75,'加重挑戰'), SUMO_SQUAT(4,12,75), FROG_PUMP(4,20,75), SIDE_ABD(4,15,75), CLAMSHELL(4,15,75),
              ],
            },
            {
              dayNumber: 2, focus: '極致拉伸與下臀 Day B', time: 30,
              exercises: [
                B_STANCE_RDL(4,12,75,'感受單側臀部撕裂感'), BACK_EXTENSION(4,15,75), GLUTE_BRIDGE(4,15,75), BULGARIAN(4,12,75),
              ],
            },
            {
              dayNumber: 3, focus: '頂峰收縮與側臀 Day A', time: 30,
              exercises: [
                HIP_THRUST(4,12,75), SUMO_SQUAT(4,12,75), FROG_PUMP(4,20,75), SIDE_ABD(4,15,75), CLAMSHELL(4,15,75),
              ],
            },
            {
              dayNumber: 4, focus: '極致拉伸與下臀 Day B', time: 30,
              exercises: [
                B_STANCE_RDL(4,12,75), BACK_EXTENSION(4,15,75), GLUTE_BRIDGE(4,15,75), BULGARIAN(4,12,75),
              ],
            },
          ],
        },
        /* ── 第 4 週（4×15，75 秒休息，最高訓練量）── */
        {
          weekNumber: 4, name: '巔峰訓練量',
          days: [
            {
              dayNumber: 1, focus: '頂峰收縮與側臀 Day A', time: 30,
              exercises: [
                HIP_THRUST(4,15,75,'本月衝刺'), SUMO_SQUAT(4,15,75), FROG_PUMP(4,25,75), SIDE_ABD(4,20,75), CLAMSHELL(4,20,75),
              ],
            },
            {
              dayNumber: 2, focus: '極致拉伸與下臀 Day B', time: 30,
              exercises: [
                B_STANCE_RDL(4,15,75), BACK_EXTENSION(4,20,75), GLUTE_BRIDGE(4,20,75), BULGARIAN(4,15,75),
              ],
            },
            {
              dayNumber: 3, focus: '頂峰收縮與側臀 Day A', time: 30,
              exercises: [
                HIP_THRUST(4,15,75), SUMO_SQUAT(4,15,75), FROG_PUMP(4,25,75), SIDE_ABD(4,20,75), CLAMSHELL(4,20,75),
              ],
            },
            {
              dayNumber: 4, focus: '極致拉伸與下臀 Day B', time: 30,
              exercises: [
                B_STANCE_RDL(4,15,75,'最後一練！'), BACK_EXTENSION(4,20,75), GLUTE_BRIDGE(4,20,75), BULGARIAN(4,15,75),
              ],
            },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════╗
       ║  精熟 — ADVANCED                             ║
       ║  3 個超級組 × 每週 4 天                       ║
       ║  核心：預先疲勞、極致拉伸與頂峰收縮的超級配對    ║
       ╚══════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟',
      labelEn: 'Advanced',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '35-40',
      equipment: ['啞鈴', '椅子', '書本(墊腳尖)', '彈力帶(可選)'],
      targetArea: '整體臀部極限充血、3D立體化',
      intensity: '高至極高',
      expectedGain: '突破臀圍生長停滯期，獲得最完美的微笑曲線與飽滿上臀',
      benefits: [
        '先以孤立動作預先疲勞臀肌，再用複合動作榨乾，降低心肺負擔',
        '單邊下臀動作接相撲深蹲，最大化代謝壓力，引發深層肌肉破壞',
        '機械外展接青蛙橋式的「收尾(Finisher)超級組」，徹底榨乾側臀與上臀',
        '高密度訓練帶來驚人的充血感(Pump)與卡路里消耗',
      ],
      periodization: {
        phase1: { name: '超級組適應', weeks: '第 1–2 週', focus: '熟悉預先疲勞帶來的強烈痠痛、90秒休息', reps: '10–12 次', intensity: '中至大重量' },
        phase2: { name: '極限代謝', weeks: '第 3–4 週', focus: '縮短休息至75秒、挑戰肌肉泵感', reps: '12–15 次', intensity: '大重量' },
      },
      weeks: [
        /* ── 第 1 週（4 組，10 次，配對休息 90 秒）── */
        {
          weekNumber: 1, name: '超級組適應期',
          days: [
            {
              dayNumber: 1, focus: '超級組 A+B+C', time: 32,
              exercises: [
                SS_CLAM_THRUST(4,10,90), SS_THRUST(4,10,90),
                SS_LUNGE(4,10,90), SS_SUMO(4,10,90),
                SS_ABD(4,12,90), SS_FROG(4,15,90),
              ],
            },
            {
              dayNumber: 2, focus: '變化超級組', time: 32,
              exercises: [
                SS_SIDE_ABD(4,10,90), SS_BRIDGE(4,10,90),
                SS_BULG_SS(4,10,90), SS_SUMO(4,10,90),
                SS_ABD(4,12,90), SS_FROG(4,15,90),
              ],
            },
            {
              dayNumber: 3, focus: '超級組 A+B+C', time: 32,
              exercises: [
                SS_CLAM_THRUST(4,10,90), SS_THRUST(4,10,90),
                SS_LUNGE(4,10,90), SS_SUMO(4,10,90),
                SS_ABD(4,12,90), SS_FROG(4,15,90),
              ],
            },
            {
              dayNumber: 4, focus: '變化超級組', time: 32,
              exercises: [
                SS_SIDE_ABD(4,10,90), SS_BRIDGE(4,10,90),
                SS_BULG_SS(4,10,90), SS_SUMO(4,10,90),
                SS_ABD(4,12,90), SS_FROG(4,15,90),
              ],
            },
          ],
        },
        /* ── 第 2 週（4 組，12 次，配對休息 90 秒）── */
        {
          weekNumber: 2, name: '訓練量提升',
          days: [
            {
              dayNumber: 1, focus: '超級組 A+B+C', time: 32,
              exercises: [
                SS_CLAM_THRUST(4,12,90), SS_THRUST(4,12,90),
                SS_LUNGE(4,12,90), SS_SUMO(4,12,90),
                SS_ABD(4,15,90), SS_FROG(4,20,90),
              ],
            },
            {
              dayNumber: 2, focus: '變化超級組', time: 32,
              exercises: [
                SS_SIDE_ABD(4,12,90), SS_BRIDGE(4,12,90),
                SS_BULG_SS(4,12,90), SS_SUMO(4,12,90),
                SS_ABD(4,15,90), SS_FROG(4,20,90),
              ],
            },
            {
              dayNumber: 3, focus: '超級組 A+B+C', time: 32,
              exercises: [
                SS_CLAM_THRUST(4,12,90), SS_THRUST(4,12,90),
                SS_LUNGE(4,12,90), SS_SUMO(4,12,90),
                SS_ABD(4,15,90), SS_FROG(4,20,90),
              ],
            },
            {
              dayNumber: 4, focus: '變化超級組', time: 32,
              exercises: [
                SS_SIDE_ABD(4,12,90), SS_BRIDGE(4,12,90),
                SS_BULG_SS(4,12,90), SS_SUMO(4,12,90),
                SS_ABD(4,15,90), SS_FROG(4,20,90),
              ],
            },
          ],
        },
        /* ── 第 3 週（4 組，12/15 次，配對休息縮短至 75 秒）── */
        {
          weekNumber: 3, name: '強度壓縮',
          days: [
            {
              dayNumber: 1, focus: '超級組 縮短休息', time: 30,
              exercises: [
                SS_CLAM_THRUST(4,12,75), SS_THRUST(4,12,75),
                SS_LUNGE(4,12,75), SS_SUMO(4,15,75),
                SS_ABD(4,15,75), SS_FROG(4,25,75),
              ],
            },
            {
              dayNumber: 2, focus: '變化超級組 縮短休息', time: 30,
              exercises: [
                SS_SIDE_ABD(4,12,75), SS_BRIDGE(4,15,75),
                SS_BULG_SS(4,12,75), SS_SUMO(4,15,75),
                SS_ABD(4,15,75), SS_FROG(4,25,75),
              ],
            },
            {
              dayNumber: 3, focus: '超級組 縮短休息', time: 30,
              exercises: [
                SS_CLAM_THRUST(4,12,75), SS_THRUST(4,12,75),
                SS_LUNGE(4,12,75), SS_SUMO(4,15,75),
                SS_ABD(4,15,75), SS_FROG(4,25,75),
              ],
            },
            {
              dayNumber: 4, focus: '變化超級組 縮短休息', time: 30,
              exercises: [
                SS_SIDE_ABD(4,12,75), SS_BRIDGE(4,15,75),
                SS_BULG_SS(4,12,75), SS_SUMO(4,15,75),
                SS_ABD(4,15,75), SS_FROG(4,25,75),
              ],
            },
          ],
        },
        /* ── 第 4 週（5 組大重量與高次數，配對休息 75 秒）── */
        {
          weekNumber: 4, name: '巔峰爆發',
          days: [
            {
              dayNumber: 1, focus: '超級組 5 組衝刺', time: 37,
              exercises: [
                SS_CLAM_THRUST(5,12,75), SS_THRUST(5,12,75),
                SS_LUNGE(5,12,75), SS_SUMO(5,15,75),
                SS_ABD(5,20,75), SS_FROG(5,30,75),
              ],
            },
            {
              dayNumber: 2, focus: '變化超級組 5 組衝刺', time: 37,
              exercises: [
                SS_SIDE_ABD(5,12,75), SS_BRIDGE(5,15,75),
                SS_BULG_SS(5,12,75), SS_SUMO(5,15,75),
                SS_ABD(5,20,75), SS_FROG(5,30,75),
              ],
            },
            {
              dayNumber: 3, focus: '超級組 5 組衝刺', time: 37,
              exercises: [
                SS_CLAM_THRUST(5,12,75), SS_THRUST(5,12,75),
                SS_LUNGE(5,12,75), SS_SUMO(5,15,75),
                SS_ABD(5,20,75), SS_FROG(5,30,75),
              ],
            },
            {
              dayNumber: 4, focus: '變化超級組 最終衝刺', time: 37,
              exercises: [
                SS_SIDE_ABD(5,12,75), SS_BRIDGE(5,15,75),
                SS_BULG_SS(5,12,75), SS_SUMO(5,15,75),
                SS_ABD(5,20,75), SS_FROG(5,30,75),
              ],
            },
          ],
        },
      ],
    },
  },
};


// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(GLUTE_PLAN);
