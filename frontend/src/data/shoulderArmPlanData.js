import applyWeek4Deload from '../utils/planDeloadNormalizer';
// 肩臂立體雕塑計畫 v4 — 三個等級，動作庫真正分級 (肩膀 + 二頭 + 三頭)
//
//  新手  : 啞鈴 + 椅子，居家可執行，專注肩推與基礎彎舉/伸展
//  中階  : 健身房基礎，引入槓鈴肩推 / 繩索側平舉 / 臉拉，全方位刺激 3D 肩膀與手臂
//  精熟  : 超級組格式，肩部超級組 + 手臂拮抗超級組，極致充血與代謝壓力
//
//  設計原則（教練視角）：
//  ─ 確保三角肌的三個頭（前束、中束、後束）都得到充分鍛鍊
//  ─ 將耗能最大的肩推動作排在每日首位 (Tier 1)
//  ─ 4 週採用技術建立 → 容量累積 → 強度突破 → 主動恢復的週期化架構

const SS_GAP    = 15;   // 超級組組內銜接秒數 (A 做完直接接 B)
const TRANSITION = 45;  // 動作間換器材時間

/* ═══════════════════════════════════════════════════════
   基礎動作工廠函式 (已與 EXERCISE_MASTER_DB 完美對齊)
═══════════════════════════════════════════════════════ */

// ── 新手動作庫（啞鈴 + 椅子）──────────────────────────
const DB_SH_PRESS= (s,r,rest,note) => ({ name:'啞鈴肩推',      nameEn:'Dumbbell Shoulder Press',   sets:s, reps:r, rest, target:'三角肌前束、中束', tier:2, ...(note?{note}:{}) });
const DB_LAT_RAISE=(s,r,rest,note) => ({ name:'啞鈴側平舉',    nameEn:'Dumbbell Lateral Raise',     sets:s, reps:r, rest, target:'三角肌中束',       tier:3, ...(note?{note}:{}) });
const DB_CURL    = (s,r,rest,note) => ({ name:'啞鈴彎舉',      nameEn:'Dumbbell Bicep Curl',        sets:s, reps:r, rest, target:'二頭肌',           tier:3, ...(note?{note}:{}) });
const OHD_TRI    = (s,r,rest,note) => ({ name:'過頭三頭伸展',  nameEn:'Overhead Tricep Extension',  sets:s, reps:r, rest, target:'三頭肌長頭',       tier:3, ...(note?{note}:{}) });
const HAMMER     = (s,r,rest,note) => ({ name:'錘式彎舉',      nameEn:'Hammer Curl',                sets:s, reps:r, rest, target:'二頭肌、肱肌',     tier:3, ...(note?{note}:{}) });

// ── 中階動作庫（健身房：槓鈴 / 牧師台 / 繩索）──────────
const BB_OHP     = (s,r,rest,note) => ({ name:'槓鈴肩推',      nameEn:'Barbell Overhead Press',     sets:s, reps:r, rest, target:'三角肌前束、整體核心', tier:1, ...(note?{note}:{}) });
const CAB_LAT    = (s,r,rest,note) => ({ name:'繩索側平舉',    nameEn:'Cable Lateral Raise',        sets:s, reps:r, rest, target:'三角肌中束',         tier:3, unilateral:true, ...(note?{note}:{}) });
const FACE_PULL  = (s,r,rest,note) => ({ name:'繩索面拉',      nameEn:'Cable Face Pull',            sets:s, reps:r, rest, target:'三角肌後束、上背',   tier:3, ...(note?{note}:{}) });
const EZ_CURL    = (s,r,rest,note) => ({ name:'EZ Bar 彎舉',   nameEn:'EZ Bar Curl',                sets:s, reps:r, rest, target:'二頭肌、肱橈肌',     tier:3, ...(note?{note}:{}) });
const SKULL      = (s,r,rest,note) => ({ name:'仰臥三頭伸展',  nameEn:'Skull Crushers',             sets:s, reps:r, rest, target:'三頭肌長頭',         tier:3, ...(note?{note}:{}) });
const CABLE_PUSH = (s,r,rest,note) => ({ name:'三頭肌下壓',    nameEn:'Triceps Pushdown',           sets:s, reps:r, rest, target:'三頭肌外側頭',       tier:3, ...(note?{note}:{}) });

// ── 精熟超級組動作（纜繩 / EZ Bar / 啞鈴，快速換組）────────────
// 肩膀超級組 (Push)
const SS_SH_A = (s,r,rp) => ({ name:'啞鈴肩推',     nameEn:'Dumbbell Press',        sets:s, reps:r, rest:SS_GAP, target:'三角肌前中束', tier:2, superset:true, supersetGroup:'SS1', note:'超級組 SS1-A ➜ 接側平舉' });
const SS_SH_B = (s,r,rp) => ({ name:'啞鈴側平舉',   nameEn:'DB Lateral Raise',      sets:s, reps:r, rest:rp,     target:'三角肌中束',   tier:3, supersetGroup:'SS1', note:`超級組 SS1-B ✓ 休息 ${rp} 秒` });
// 手臂拮抗超級組 (Arm Antagonist)
const SS_ARM_A= (s,r,rp) => ({ name:'EZ Bar 彎舉',  nameEn:'EZ Bar Curl',           sets:s, reps:r, rest:SS_GAP, target:'二頭肌',       tier:3, superset:true, supersetGroup:'SS2', note:'超級組 SS2-A ➜ 接三頭下壓' });
const SS_ARM_B= (s,r,rp) => ({ name:'三頭肌下壓',   nameEn:'Triceps Pushdown',      sets:s, reps:r, rest:rp,     target:'三頭肌外側頭', tier:3, supersetGroup:'SS2', note:`超級組 SS2-B ✓ 休息 ${rp} 秒` });
// 精熟 Finisher（後束雕塑）
const FINISHER= (s,r,rest,note) => ({ name:'繩索面拉', nameEn:'Cable Face Pull',    sets:s, reps:r, rest, target:'三角肌後束（改善圓肩）', tier:3, ...(note?{note}:{}) });

/* ═══════════════════════════════════════════════════════
   SHOULDER & ARM PLAN
═══════════════════════════════════════════════════════ */
export const SHOULDER_ARM_PLAN = {
  id: 'shoulder-arm-sculpt-30',
  name: '3D 南瓜肩與手臂雕塑計畫',
  subtitle: '打造寬闊肩膀與結實手臂的完美比例',
  bodyPart: 'shoulders_arms',
  bodyPartLabel: '肩部與手臂',
  duration: 28,
  coverImage: '/images/shoulder-arm-cover.jpg',
  description: '科學化「肩臂日」訓練計畫。將三角肌（前、中、後束）與二頭、三頭肌結合，最大化上半身視覺寬度。提供啞鈴居家入門、健身房全方位器材、以及極致充血的超級組三個等級。',
  tags: ['3D南瓜肩', '手臂塑形', '漸進式超負荷', '黃金比例'],

  levels: {

    /* ╔══════════════════════════════════════════════════════╗
       ║  新手 — 居家 / 健身房皆可                             ║
       ║  動作庫：肩推、側平舉、二頭彎舉、過頭伸展、錘式         ║
       ╚══════════════════════════════════════════════════════╝ */
    beginner: {
      key: 'beginner',
      label: '新手',
      labelEn: 'Beginner',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '35-40',
      equipment: ['啞鈴', '椅子'],
      targetArea: '三角肌、二頭肌、三頭肌',
      intensity: '低至中等',
      expectedGain: '肩膀變寬，手臂圍增加，建立基礎力量',
      benefits: [
        '5 個動作涵蓋肩部與手臂所有主要肌束',
        '無須健身房，一對啞鈴與椅子即可執行',
        '優先執行肩推建立核心與推力基礎',
      ],
      periodization: {
        phase1: { name: '動作熟悉', weeks: '第 1 週', focus: '建立正確軌跡，感受肩膀發力', reps: '10–12 次', intensity: 'RPE 6–7' },
        phase2: { name: '容量累積', weeks: '第 2 週', focus: '相同重量多 2 下，感受肌肉充血', reps: '12 次', intensity: 'RPE 7' },
        phase3: { name: '強度提升', weeks: '第 3 週', focus: '嘗試加重，次數回到 10 下', reps: '10 次（加重）', intensity: 'RPE 8' },
        phase4: { name: '主動恢復', weeks: '第 4 週', focus: '減重 30%，高次數泵感', reps: '15 次（輕鬆）', intensity: 'RPE 6' },
      },
      weeks: [
        {
          weekNumber: 1, name: '技術建立期',
          days: [
            { dayNumber: 1, focus: '肩推主導 + 雙臂基礎', time: 35,
              exercises: [ DB_SH_PRESS(3,10,75,'背部貼緊椅背不拱腰'), DB_LAT_RAISE(3,10,60,'手肘微彎，手腕不要高於手肘'), DB_CURL(3,10,60), OHD_TRI(3,10,60), HAMMER(3,10,60) ] },
            { dayNumber: 2, focus: '肩推主導 + 雙臂基礎', time: 35,
              exercises: [ DB_SH_PRESS(3,10,75), DB_LAT_RAISE(3,10,60), DB_CURL(3,10,60), OHD_TRI(3,10,60), HAMMER(3,10,60) ] },
            { dayNumber: 3, focus: '肩推主導 + 雙臂基礎', time: 35,
              exercises: [ DB_SH_PRESS(3,10,75), DB_LAT_RAISE(3,10,60), DB_CURL(3,10,60), OHD_TRI(3,10,60), HAMMER(3,10,60) ] },
          ],
        },
        {
          weekNumber: 2, name: '容量累積期',
          days: [
            { dayNumber: 1, focus: '肩推主導 + 雙臂基礎', time: 38,
              exercises: [ DB_SH_PRESS(3,12,75), DB_LAT_RAISE(3,12,60), DB_CURL(3,12,60), OHD_TRI(3,12,60), HAMMER(3,12,60) ] },
            { dayNumber: 2, focus: '肩推主導 + 雙臂基礎', time: 38,
              exercises: [ DB_SH_PRESS(3,12,75), DB_LAT_RAISE(3,12,60), DB_CURL(3,12,60), OHD_TRI(3,12,60), HAMMER(3,12,60) ] },
            { dayNumber: 3, focus: '肩推主導 + 雙臂基礎', time: 38,
              exercises: [ DB_SH_PRESS(3,12,75), DB_LAT_RAISE(3,12,60), DB_CURL(3,12,60), OHD_TRI(3,12,60), HAMMER(3,12,60) ] },
          ],
        },
        {
          weekNumber: 3, name: '強度突破期',
          days: [
            { dayNumber: 1, focus: '肩推主導 + 雙臂基礎', time: 40,
              exercises: [ DB_SH_PRESS(4,10,90,'全面加重 2.5kg'), DB_LAT_RAISE(4,10,75,'側平舉維持重量即可'), DB_CURL(4,10,75,'加重'), OHD_TRI(4,10,75,'加重'), HAMMER(3,10,60) ] },
            { dayNumber: 2, focus: '肩推主導 + 雙臂基礎', time: 40,
              exercises: [ DB_SH_PRESS(4,10,90), DB_LAT_RAISE(4,10,75), DB_CURL(4,10,75), OHD_TRI(4,10,75), HAMMER(3,10,60) ] },
            { dayNumber: 3, focus: '肩推主導 + 雙臂基礎', time: 40,
              exercises: [ DB_SH_PRESS(4,10,90), DB_LAT_RAISE(4,10,75), DB_CURL(4,10,75), OHD_TRI(4,10,75), HAMMER(3,10,60) ] },
          ],
        },
        {
          weekNumber: 4, name: '主動恢復期',
          days: [
            { dayNumber: 1, focus: '輕重量 · 高次數泵感', time: 35,
              exercises: [ DB_SH_PRESS(3,15,60,'降重30%'), DB_LAT_RAISE(3,15,60), DB_CURL(3,15,60), OHD_TRI(3,15,60), HAMMER(3,15,60) ] },
            { dayNumber: 2, focus: '輕重量 · 高次數泵感', time: 35,
              exercises: [ DB_SH_PRESS(3,15,60), DB_LAT_RAISE(3,15,60), DB_CURL(3,15,60), OHD_TRI(3,15,60), HAMMER(3,15,60) ] },
            { dayNumber: 3, focus: '輕重量 · 高次數泵感', time: 35,
              exercises: [ DB_SH_PRESS(3,15,60), DB_LAT_RAISE(3,15,60), DB_CURL(3,15,60), OHD_TRI(3,15,60), HAMMER(3,15,60) ] },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════════════╗
       ║  中階 — 健身房全器材                                  ║
       ║  動作庫：槓鈴肩推、繩索側平舉、臉拉、EZ彎舉、Skull     ║
       ╚══════════════════════════════════════════════════════╝ */
    intermediate: {
      key: 'intermediate',
      label: '中階',
      labelEn: 'Intermediate',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '45-55',
      equipment: ['槓鈴', 'EZ Bar', '啞鈴', '繩索機'],
      targetArea: '3D 三角肌、二頭肌全區、三頭肌長頭 & 外側頭',
      intensity: '中等至高',
      expectedGain: '肩膀變挺拔，手臂維度顯著增加',
      benefits: [
        '槓鈴肩推 (OHP) 建立上肢絕對推力',
        '繩索側平舉與臉拉，無死角刺激中後束',
        '4 天訓練，頻率提升帶來更快進步',
      ],
      periodization: {
        phase1: { name: '槓鈴適應', weeks: '第 1 週', focus: '熟悉槓鈴肩推核心穩定', reps: '10–12 次', intensity: 'RPE 7' },
        phase2: { name: '容量衝刺', weeks: '第 2 週', focus: '增加每組次數，測試各器材重量', reps: '12 次', intensity: 'RPE 7–8' },
        phase3: { name: '重量突破', weeks: '第 3 週', focus: '槓鈴嘗試加重 2.5–5 kg', reps: '8–10 次（更重）', intensity: 'RPE 8–9' },
        phase4: { name: '主動恢復', weeks: '第 4 週', focus: '降重量，維持動作質量', reps: '15 次（輕鬆）', intensity: 'RPE 6' },
      },
      weeks: [
        {
          weekNumber: 1, name: '技術建立期',
          days: [
            { dayNumber: 1, focus: '肩部與手臂綜合', time: 48,
              exercises: [ BB_OHP(4,10,90,'收緊核心，槓鈴直線上下'), CAB_LAT(3,10,60,'單側進行，感受中束發力'), EZ_CURL(4,10,75), SKULL(4,10,75), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60,'針對後束，不要用背闊代償') ] },
            { dayNumber: 2, focus: '肩部與手臂綜合', time: 48,
              exercises: [ BB_OHP(4,10,90), CAB_LAT(3,10,60), EZ_CURL(4,10,75), SKULL(4,10,75), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
            { dayNumber: 3, focus: '肩部與手臂綜合', time: 48,
              exercises: [ BB_OHP(4,10,90), CAB_LAT(3,10,60), EZ_CURL(4,10,75), SKULL(4,10,75), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
            { dayNumber: 4, focus: '肩部與手臂綜合', time: 48,
              exercises: [ BB_OHP(4,10,90), CAB_LAT(3,10,60), EZ_CURL(4,10,75), SKULL(4,10,75), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
          ],
        },
        {
          weekNumber: 2, name: '容量累積期',
          days: [
            { dayNumber: 1, focus: '肩部與手臂綜合', time: 50,
              exercises: [ BB_OHP(4,12,90), CAB_LAT(3,12,60), EZ_CURL(4,12,75), SKULL(4,12,75), CABLE_PUSH(3,12,60), FACE_PULL(3,15,60) ] },
            { dayNumber: 2, focus: '肩部與手臂綜合', time: 50,
              exercises: [ BB_OHP(4,12,90), CAB_LAT(3,12,60), EZ_CURL(4,12,75), SKULL(4,12,75), CABLE_PUSH(3,12,60), FACE_PULL(3,15,60) ] },
            { dayNumber: 3, focus: '肩部與手臂綜合', time: 50,
              exercises: [ BB_OHP(4,12,90), CAB_LAT(3,12,60), EZ_CURL(4,12,75), SKULL(4,12,75), CABLE_PUSH(3,12,60), FACE_PULL(3,15,60) ] },
            { dayNumber: 4, focus: '肩部與手臂綜合', time: 50,
              exercises: [ BB_OHP(4,12,90), CAB_LAT(3,12,60), EZ_CURL(4,12,75), SKULL(4,12,75), CABLE_PUSH(3,12,60), FACE_PULL(3,15,60) ] },
          ],
        },
        {
          weekNumber: 3, name: '強度突破期',
          days: [
            { dayNumber: 1, focus: '加重衝刺', time: 52,
              exercises: [ BB_OHP(4,8,120,'加重，休息拉長至2分鐘'), CAB_LAT(4,10,60), EZ_CURL(4,8,90,'加重'), SKULL(4,8,90,'加重'), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
            { dayNumber: 2, focus: '加重衝刺', time: 52,
              exercises: [ BB_OHP(4,8,120), CAB_LAT(4,10,60), EZ_CURL(4,8,90), SKULL(4,8,90), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
            { dayNumber: 3, focus: '加重衝刺', time: 52,
              exercises: [ BB_OHP(4,8,120), CAB_LAT(4,10,60), EZ_CURL(4,8,90), SKULL(4,8,90), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
            { dayNumber: 4, focus: '加重衝刺', time: 52,
              exercises: [ BB_OHP(4,8,120), CAB_LAT(4,10,60), EZ_CURL(4,8,90), SKULL(4,8,90), CABLE_PUSH(3,10,60), FACE_PULL(3,12,60) ] },
          ],
        },
        {
          weekNumber: 4, name: '主動恢復期',
          days: [
            { dayNumber: 1, focus: '輕重量高次數', time: 42,
              exercises: [ BB_OHP(3,15,60,'降重30%'), CAB_LAT(3,15,60), EZ_CURL(3,15,60), SKULL(3,15,60), CABLE_PUSH(3,15,60), FACE_PULL(3,15,60) ] },
            { dayNumber: 2, focus: '輕重量高次數', time: 42,
              exercises: [ BB_OHP(3,15,60), CAB_LAT(3,15,60), EZ_CURL(3,15,60), SKULL(3,15,60), CABLE_PUSH(3,15,60), FACE_PULL(3,15,60) ] },
            { dayNumber: 3, focus: '輕重量高次數', time: 42,
              exercises: [ BB_OHP(3,15,60), CAB_LAT(3,15,60), EZ_CURL(3,15,60), SKULL(3,15,60), CABLE_PUSH(3,15,60), FACE_PULL(3,15,60) ] },
            { dayNumber: 4, focus: '輕重量高次數', time: 42,
              exercises: [ BB_OHP(3,15,60), CAB_LAT(3,15,60), EZ_CURL(3,15,60), SKULL(3,15,60), CABLE_PUSH(3,15,60), FACE_PULL(3,15,60) ] },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════════════╗
       ║  精熟 — 超級組格式，極致充血線條                      ║
       ║  動作庫：肩部SS、手臂SS、後束Finisher                 ║
       ╚══════════════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟',
      labelEn: 'Advanced',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '45-55',
      equipment: ['啞鈴', 'EZ Bar', '雙側繩索機', '斜板椅'],
      targetArea: '三角肌全區 + 雙臂',
      intensity: '高至極高',
      expectedGain: '南瓜肩與馬蹄形三頭成型，時間極度壓縮',
      benefits: [
        '肩膀預先疲勞：肩推接側平舉，徹底榨乾中前束',
        '手臂拮抗超級組：二頭充血時三頭恢復，效率最高',
        '臉拉作為 Finisher，完善整體肩部健康與後束厚度',
      ],
      periodization: {
        phase1: { name: '超級組節奏適應', weeks: '第 1 週', focus: '熟悉 A→B 換組節奏，不追重量', reps: 'SS: 10 次/動作', intensity: 'RPE 7' },
        phase2: { name: '訓練量提升', weeks: '第 2 週', focus: '12 次，感受最後 2 下的燃燒感', reps: 'SS: 12 次/動作', intensity: 'RPE 7–8' },
        phase3: { name: '重量壓縮', weeks: '第 3 週', focus: '加重，縮短組間休息，製造最大代謝壓力', reps: 'SS: 10 次（更重）', intensity: 'RPE 8.5–9' },
        phase4: { name: '主動恢復', weeks: '第 4 週', focus: '2 組超級組，高次數泵感，讓肌肉充分恢復', reps: 'SS: 15 次（輕）', intensity: 'RPE 6' },
      },
      weeks: [
        {
          weekNumber: 1, name: '超級組節奏適應期',
          days: [
            { dayNumber: 1, focus: '肩部 SS + 手臂 SS + 後束', time: 48,
              exercises: [ SS_SH_A(4,10,90), SS_SH_B(4,10,90), SS_ARM_A(4,10,90), SS_ARM_B(4,10,90), FINISHER(3,15,60) ] },
            { dayNumber: 2, focus: '肩部 SS + 手臂 SS + 後束', time: 48,
              exercises: [ SS_SH_A(4,10,90), SS_SH_B(4,10,90), SS_ARM_A(4,10,90), SS_ARM_B(4,10,90), FINISHER(3,15,60) ] },
            { dayNumber: 3, focus: '肩部 SS + 手臂 SS + 後束', time: 48,
              exercises: [ SS_SH_A(4,10,90), SS_SH_B(4,10,90), SS_ARM_A(4,10,90), SS_ARM_B(4,10,90), FINISHER(3,15,60) ] },
            { dayNumber: 4, focus: '肩部 SS + 手臂 SS + 後束', time: 48,
              exercises: [ SS_SH_A(4,10,90), SS_SH_B(4,10,90), SS_ARM_A(4,10,90), SS_ARM_B(4,10,90), FINISHER(3,15,60) ] },
          ],
        },
        {
          weekNumber: 2, name: '訓練量提升期',
          days: [
            { dayNumber: 1, focus: '肩部 SS + 手臂 SS + 後束', time: 50,
              exercises: [ SS_SH_A(4,12,90), SS_SH_B(4,12,90), SS_ARM_A(4,12,90), SS_ARM_B(4,12,90), FINISHER(3,15,60) ] },
            { dayNumber: 2, focus: '肩部 SS + 手臂 SS + 後束', time: 50,
              exercises: [ SS_SH_A(4,12,90), SS_SH_B(4,12,90), SS_ARM_A(4,12,90), SS_ARM_B(4,12,90), FINISHER(3,15,60) ] },
            { dayNumber: 3, focus: '肩部 SS + 手臂 SS + 後束', time: 50,
              exercises: [ SS_SH_A(4,12,90), SS_SH_B(4,12,90), SS_ARM_A(4,12,90), SS_ARM_B(4,12,90), FINISHER(3,15,60) ] },
            { dayNumber: 4, focus: '肩部 SS + 手臂 SS + 後束', time: 50,
              exercises: [ SS_SH_A(4,12,90), SS_SH_B(4,12,90), SS_ARM_A(4,12,90), SS_ARM_B(4,12,90), FINISHER(3,15,60) ] },
          ],
        },
        {
          weekNumber: 3, name: '強度突破期',
          days: [
            { dayNumber: 1, focus: '加重衝刺，縮短組間 75s', time: 45,
              exercises: [ SS_SH_A(4,10,75), SS_SH_B(4,10,75), SS_ARM_A(4,10,75), SS_ARM_B(4,10,75), FINISHER(3,15,60) ] },
            { dayNumber: 2, focus: '加重衝刺，縮短組間 75s', time: 45,
              exercises: [ SS_SH_A(4,10,75), SS_SH_B(4,10,75), SS_ARM_A(4,10,75), SS_ARM_B(4,10,75), FINISHER(3,15,60) ] },
            { dayNumber: 3, focus: '加重衝刺，縮短組間 75s', time: 45,
              exercises: [ SS_SH_A(4,10,75), SS_SH_B(4,10,75), SS_ARM_A(4,10,75), SS_ARM_B(4,10,75), FINISHER(3,15,60) ] },
            { dayNumber: 4, focus: '加重衝刺，縮短組間 75s', time: 45,
              exercises: [ SS_SH_A(4,10,75), SS_SH_B(4,10,75), SS_ARM_A(4,10,75), SS_ARM_B(4,10,75), FINISHER(3,15,60) ] },
          ],
        },
        {
          weekNumber: 4, name: '主動恢復期',
          days: [
            { dayNumber: 1, focus: '減少組數，輕重量充血', time: 32,
              exercises: [ SS_SH_A(2,15,90), SS_SH_B(2,15,90), SS_ARM_A(2,15,90), SS_ARM_B(2,15,90), FINISHER(2,15,60) ] },
            { dayNumber: 2, focus: '減少組數，輕重量充血', time: 32,
              exercises: [ SS_SH_A(2,15,90), SS_SH_B(2,15,90), SS_ARM_A(2,15,90), SS_ARM_B(2,15,90), FINISHER(2,15,60) ] },
            { dayNumber: 3, focus: '減少組數，輕重量充血', time: 32,
              exercises: [ SS_SH_A(2,15,90), SS_SH_B(2,15,90), SS_ARM_A(2,15,90), SS_ARM_B(2,15,90), FINISHER(2,15,60) ] },
            { dayNumber: 4, focus: '減少組數，輕重量充血', time: 32,
              exercises: [ SS_SH_A(2,15,90), SS_SH_B(2,15,90), SS_ARM_A(2,15,90), SS_ARM_B(2,15,90), FINISHER(2,15,60) ] },
          ],
        },
      ],
    },
  },
};

// 輔助函式（供其他頁面使用）
export const calcExDuration = (ex) => {
  const EXEC_SEC     = ex.unilateral ? 45 : 25;
  const interSetRest = ex.superset ? SS_GAP : ex.rest;
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
    if (total + dur <= budget + 180) { // Allow slight overhead
      result.push({ ...ex, durationSec: dur });
      total += dur;
    }
    if (total >= budget) break;
  }
  return { exercises: result, totalSec: total };
};

// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(SHOULDER_ARM_PLAN);
