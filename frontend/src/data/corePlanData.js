import applyWeek4Deload from '../utils/planDeloadNormalizer';
// 3D 核心腹肌雕塑計畫 v1 — 三個等級，涵蓋屈曲、抗伸展、抗旋轉
//
//  新手  : 瑜珈墊居家，喚醒深層腹橫肌與基礎腹直肌（死蟲式、棒式、捲腹）
//  中階  : 健身房基礎，加入負重與懸垂，增加腹肌厚度（繩索捲腹、懸垂抬腿）
//  精熟  : 超級組格式，極限抗伸展與側腹破壞（腹輪、負重側棒式、高強度超級組）
//
//  設計原則（教練視角）：
//  ─ 核心肌群恢復極快，可承受較高頻率（每週 3-4 次），訓練時間約 15-25 分鐘，極適合作為外加課表
//  ─ 動作包含：脊椎屈曲（上腹）、骨盆後傾（下腹）、抗伸展（腹橫肌）、抗旋轉（腹內外斜肌）
//  ─ 4 週採用動作控制 → 容量累積 → 負重突破 → 主動恢復的週期化架構

const SS_GAP    = 15;   // 超級組組內銜接秒數 (A 做完直接接 B)
const TRANSITION = 40;  // 核心動作換器材時間通常較短

/* ═══════════════════════════════════════════════════════
   基礎動作工廠函式 (已與 EXERCISE_MASTER_DB 完美對齊)
   ─ reps 欄位若為支撐型動作，可視為「秒數 (Seconds)」
═══════════════════════════════════════════════════════ */

// ── 新手動作庫（徒手 / 瑜珈墊）──────────────────────────
const CRUNCH     = (s,r,rest,note) => ({ name:'卷腹',          nameEn:'Crunch',               sets:s, reps:r, rest, target:'腹直肌上段',       tier:3, ...(note?{note}:{}) });
const LEG_RAISE  = (s,r,rest,note) => ({ name:'仰臥抬腿',      nameEn:'Lying Leg Raise',      sets:s, reps:r, rest, target:'腹直肌下段',       tier:3, ...(note?{note}:{}) });
const PLANK      = (s,r,rest,note) => ({ name:'平板支撐',      nameEn:'Plank',                sets:s, reps:r, rest, target:'腹橫肌、核心穩定', tier:3, ...(note?{note}:{}) });
const RUSSIAN    = (s,r,rest,note) => ({ name:'俄羅斯轉體',    nameEn:'Russian Twist',        sets:s, reps:r, rest, target:'腹內外斜肌',       tier:3, unilateral:true, ...(note?{note}:{}) });
const DEAD_BUG   = (s,r,rest,note) => ({ name:'死蟲式',        nameEn:'Dead Bug',             sets:s, reps:r, rest, target:'深層核心、協調性', tier:3, unilateral:true, ...(note?{note}:{}) });

// ── 中階動作庫（健身房：纜繩 / 單槓 / 負重）──────────
const CAB_CRUNCH = (s,r,rest,note) => ({ name:'繩索捲腹',      nameEn:'Cable Crunch',         sets:s, reps:r, rest, target:'腹直肌（負重增厚）', tier:2, ...(note?{note}:{}) });
const HANG_LEG   = (s,r,rest,note) => ({ name:'懸垂舉腿',      nameEn:'Hanging Leg Raise',    sets:s, reps:r, rest, target:'腹直肌下段、髂腰肌', tier:3, ...(note?{note}:{}) });
const AB_WHEEL   = (s,r,rest,note) => ({ name:'腹輪',          nameEn:'Ab Wheel Rollout',     sets:s, reps:r, rest, target:'整體核心（抗伸展）', tier:3, ...(note?{note}:{}) });
const SIDE_PLANK = (s,r,rest,note) => ({ name:'側棒式',        nameEn:'Side Plank',           sets:s, reps:r, rest, target:'腹斜肌、腰方肌',     tier:3, unilateral:true, ...(note?{note}:{}) });
const CABLE_TWIST= (s,r,rest,note) => ({ name:'繩索伐木',      nameEn:'Cable Woodchopper',    sets:s, reps:r, rest, target:'腹內外斜肌（爆發力）',tier:3, unilateral:true, ...(note?{note}:{}) });

// ── 精熟超級組動作（高強度、極限力竭）────────────
// 上下腹超級組 (Upper & Lower Abs)
const SS_CORE_A1 = (s,r,rp) => ({ name:'懸垂舉腿', nameEn:'Hanging Leg Raise', sets:s, reps:r, rest:SS_GAP, target:'下腹', tier:3, superset:true, supersetGroup:'SS1', note:'超級組 SS1-A ➜ 盡量不晃動，做完接繩索捲腹' });
const SS_CORE_A2 = (s,r,rp) => ({ name:'繩索捲腹', nameEn:'Cable Crunch',      sets:s, reps:r, rest:rp,     target:'上腹', tier:2, supersetGroup:'SS1', note:`超級組 SS1-B ✓ 休息 ${rp} 秒` });
// 側腹與抗旋轉超級組 (Obliques)
const SS_CORE_B1 = (s,r,rp) => ({ name:'繩索伐木', nameEn:'Cable Woodchopper', sets:s, reps:r, rest:SS_GAP, target:'側腹', tier:3, superset:true, supersetGroup:'SS2', unilateral:true, note:'超級組 SS2-A ➜ 爆發發力，接側棒式' });
const SS_CORE_B2 = (s,r,rp) => ({ name:'側棒式',   nameEn:'Side Plank Dip',    sets:s, reps:r, rest:rp,     target:'側腹', tier:3, supersetGroup:'SS2', unilateral:true, note:`超級組 SS2-B ✓ 休息 ${rp} 秒` });
// 精熟 Finisher（極限抗伸展）
const CORE_FINISHER = (s,r,rest,note) => ({ name:'腹輪', nameEn:'Ab Wheel Rollout', sets:s, reps:r, rest, target:'核心徹底力竭', tier:3, ...(note?{note}:{}) });

/* ═══════════════════════════════════════════════════════
   CORE & ABS PLAN
═══════════════════════════════════════════════════════ */
export const CORE_PLAN = {
  id: 'core-abs-sculpt-30',
  name: '3D 核心腹肌雕塑計畫',
  subtitle: '打造立體冰塊腹肌與鋼鐵核心',
  bodyPart: 'core',
  bodyPartLabel: '核心',
  duration: 28,
  coverImage: '/images/core-workout-cover.jpg', // 你可以在專案中補上這張圖
  description: '跳脫只做仰臥起坐的盲區！從「脊椎屈曲、抗伸展、抗旋轉」三個科學維度，全方位刺激腹直肌、腹斜肌與深層腹橫肌。不論是居家徒手入門，還是健身房負重增厚，都能打造如同鎧甲般的立體腹肌。',
  tags: ['馬甲線/冰塊腹', '核心強化', '居家可執行', '防護腰椎'],

  levels: {

    /* ╔══════════════════════════════════════════════════════╗
       ║  新手 — 瑜珈墊 / 居家皆可                             ║
       ║  特色：重視感受度，避免腰痠。時間短，適合排在重訓後        ║
       ╚══════════════════════════════════════════════════════╝ */
    beginner: {
      key: 'beginner',
      label: '新手',
      labelEn: 'Beginner',
      recommendedDays: 3,
      recommendedDaysLabel: '建議每週 3 天',
      durationPerSession: '15-20',
      equipment: ['瑜珈墊'],
      targetArea: '腹直肌、腹內外斜肌、深層核心',
      intensity: '低至中等',
      expectedGain: '喚醒核心發力，平坦小腹，改善骨盆前傾',
      benefits: [
        '死蟲式與棒式有效啟動深層腹橫肌，保護下背',
        '無器材需求，適合每天睡前或重訓後附加執行',
        '漸進式增加秒數與次數，溫和不傷腰',
      ],
      periodization: {
        phase1: { name: '核心喚醒', weeks: '第 1 週', focus: '不追求次數，確認下背貼地不腰痠', reps: '10–12 次', intensity: 'RPE 6' },
        phase2: { name: '耐力建立', weeks: '第 2 週', focus: '支撐秒數與次數微增', reps: '15 次 / 40秒', intensity: 'RPE 7' },
        phase3: { name: '容量突破', weeks: '第 3 週', focus: '縮短休息時間，感受極致腹部酸脹', reps: '15 次 / 45秒', intensity: 'RPE 8' },
        phase4: { name: '主動恢復', weeks: '第 4 週', focus: '次數降回基準，專注頂峰收縮', reps: '12 次 / 30秒', intensity: 'RPE 6' },
      },
      weeks: [
        {
          weekNumber: 1, name: '核心喚醒期',
          days: [
            { dayNumber: 1, focus: '上下腹基礎建立', time: 15,
              exercises: [ CRUNCH(3,12,60,'下背貼緊地面，只起肩膀'), LEG_RAISE(3,12,60,'下放時慢，腰不可懸空'), PLANK(3,30,60,'支撐 30 秒，夾臀收腹'), DEAD_BUG(2,10,45,'左右各10下，協調控制') ] },
            { dayNumber: 2, focus: '側腹與核心穩定', time: 15,
              exercises: [ RUSSIAN(3,12,60,'左右各12下，頭跟著轉'), CRUNCH(3,12,60), PLANK(3,30,60), DEAD_BUG(2,10,45) ] },
            { dayNumber: 3, focus: '綜合核心全餐', time: 15,
              exercises: [ LEG_RAISE(3,12,60), RUSSIAN(3,12,60), CRUNCH(3,12,60), PLANK(3,30,60) ] },
          ],
        },
        {
          weekNumber: 2, name: '耐力建立期',
          days: [
            { dayNumber: 1, focus: '上下腹基礎建立', time: 18,
              exercises: [ CRUNCH(3,15,60), LEG_RAISE(3,15,60), PLANK(3,40,60,'支撐 40 秒'), DEAD_BUG(3,12,45) ] },
            { dayNumber: 2, focus: '側腹與核心穩定', time: 18,
              exercises: [ RUSSIAN(3,15,60), CRUNCH(3,15,60), PLANK(3,40,60), DEAD_BUG(3,12,45) ] },
            { dayNumber: 3, focus: '綜合核心全餐', time: 18,
              exercises: [ LEG_RAISE(3,15,60), RUSSIAN(3,15,60), CRUNCH(3,15,60), PLANK(3,40,60) ] },
          ],
        },
        {
          weekNumber: 3, name: '容量突破期',
          days: [
            { dayNumber: 1, focus: '組間縮短 45s', time: 20,
              exercises: [ CRUNCH(4,15,45,'增加一組，休息變短'), LEG_RAISE(4,15,45), PLANK(3,45,45,'支撐 45 秒'), DEAD_BUG(3,15,45) ] },
            { dayNumber: 2, focus: '組間縮短 45s', time: 20,
              exercises: [ RUSSIAN(4,15,45), CRUNCH(4,15,45), PLANK(3,45,45), DEAD_BUG(3,15,45) ] },
            { dayNumber: 3, focus: '組間縮短 45s', time: 20,
              exercises: [ LEG_RAISE(4,15,45), RUSSIAN(4,15,45), CRUNCH(4,15,45), PLANK(3,45,45) ] },
          ],
        },
        {
          weekNumber: 4, name: '主動恢復期',
          days: [
            { dayNumber: 1, focus: '輕鬆控制節奏', time: 15,
              exercises: [ CRUNCH(3,12,60,'頂點停頓一秒'), LEG_RAISE(3,12,60), PLANK(2,30,60), DEAD_BUG(2,10,45) ] },
            { dayNumber: 2, focus: '輕鬆控制節奏', time: 15,
              exercises: [ RUSSIAN(3,12,60), CRUNCH(3,12,60), PLANK(2,30,60), DEAD_BUG(2,10,45) ] },
            { dayNumber: 3, focus: '輕鬆控制節奏', time: 15,
              exercises: [ LEG_RAISE(3,12,60), RUSSIAN(3,12,60), CRUNCH(3,12,60), PLANK(2,30,60) ] },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════════════╗
       ║  中階 — 健身房基礎                                    ║
       ║  特色：加入阻力與單槓，讓腹肌真正「增厚」變成冰塊        ║
       ╚══════════════════════════════════════════════════════╝ */
    intermediate: {
      key: 'intermediate',
      label: '中階',
      labelEn: 'Intermediate',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '20-25',
      equipment: ['繩索機', '單槓', '健腹輪'],
      targetArea: '腹直肌厚度、強韌核心',
      intensity: '中等至高',
      expectedGain: '腹肌塊狀變大、刻痕加深，核心抗伸展力提升',
      benefits: [
        '繩索捲腹提供恆定阻力，真正將腹肌當作大肌肉訓練',
        '懸垂抬腿極大幅度刺激下腹與髂腰肌',
        '健腹輪挑戰核心極限抗伸展能力',
      ],
      periodization: {
        phase1: { name: '負重適應', weeks: '第 1 週', focus: '抓到繩索與懸垂的發力感', reps: '10–12 次', intensity: 'RPE 7' },
        phase2: { name: '容量衝刺', weeks: '第 2 週', focus: '每組多做 2-3 下', reps: '12-15 次', intensity: 'RPE 8' },
        phase3: { name: '厚度突破', weeks: '第 3 週', focus: '繩索加重，懸垂追求更高角度', reps: '8–10 次（加重）', intensity: 'RPE 9' },
        phase4: { name: '主動恢復', weeks: '第 4 週', focus: '不加重，改以徒手動作為主', reps: '15 次', intensity: 'RPE 6' },
      },
      weeks: [
        {
          weekNumber: 1, name: '負重適應期',
          days: [
            { dayNumber: 1, focus: '厚度建立 (腹直肌)', time: 20,
              exercises: [ CAB_CRUNCH(4,12,60,'感受腹肌像捲地毯一樣彎曲'), HANG_LEG(3,10,60,'不要用慣性甩動'), SIDE_PLANK(3,30,45,'每側 30 秒'), CRUNCH(3,15,45) ] },
            { dayNumber: 2, focus: '抗伸展與抗旋轉', time: 20,
              exercises: [ AB_WHEEL(3,8,75,'推到腰不痠的極限即可'), CABLE_TWIST(3,12,60,'用軀幹發力帶動手臂'), CAB_CRUNCH(3,12,60), PLANK(3,45,45) ] },
            { dayNumber: 3, focus: '厚度建立 (腹直肌)', time: 20,
              exercises: [ HANG_LEG(4,10,60), CAB_CRUNCH(4,12,60), SIDE_PLANK(3,30,45), LEG_RAISE(3,15,45) ] },
            { dayNumber: 4, focus: '抗伸展與抗旋轉', time: 20,
              exercises: [ CABLE_TWIST(4,12,60), AB_WHEEL(3,8,75), HANG_LEG(3,10,60), PLANK(3,45,45) ] },
          ],
        },
        {
          weekNumber: 2, name: '容量衝刺期',
          days: [
            { dayNumber: 1, focus: '厚度建立 (腹直肌)', time: 22,
              exercises: [ CAB_CRUNCH(4,15,60), HANG_LEG(4,12,60), SIDE_PLANK(3,40,45,'每側 40 秒'), CRUNCH(3,20,45) ] },
            { dayNumber: 2, focus: '抗伸展與抗旋轉', time: 22,
              exercises: [ AB_WHEEL(4,10,75), CABLE_TWIST(4,15,60), CAB_CRUNCH(3,15,60), PLANK(3,60,45,'支撐 60 秒') ] },
            { dayNumber: 3, focus: '厚度建立 (腹直肌)', time: 22,
              exercises: [ HANG_LEG(4,12,60), CAB_CRUNCH(4,15,60), SIDE_PLANK(3,40,45), LEG_RAISE(3,20,45) ] },
            { dayNumber: 4, focus: '抗伸展與抗旋轉', time: 22,
              exercises: [ CABLE_TWIST(4,15,60), AB_WHEEL(4,10,75), HANG_LEG(3,12,60), PLANK(3,60,45) ] },
          ],
        },
        {
          weekNumber: 3, name: '厚度突破期',
          days: [
            { dayNumber: 1, focus: '大重量刺激', time: 24,
              exercises: [ CAB_CRUNCH(4,10,75,'加重 1 格'), HANG_LEG(4,10,75,'膝蓋盡量碰胸'), SIDE_PLANK(3,45,45), CRUNCH(3,15,45) ] },
            { dayNumber: 2, focus: '大重量刺激', time: 24,
              exercises: [ AB_WHEEL(4,12,75,'挑戰推更遠'), CABLE_TWIST(4,10,75,'加重 1 格'), CAB_CRUNCH(3,10,60), PLANK(3,60,45) ] },
            { dayNumber: 3, focus: '大重量刺激', time: 24,
              exercises: [ HANG_LEG(4,10,75), CAB_CRUNCH(4,10,75), SIDE_PLANK(3,45,45), LEG_RAISE(3,15,45) ] },
            { dayNumber: 4, focus: '大重量刺激', time: 24,
              exercises: [ CABLE_TWIST(4,10,75), AB_WHEEL(4,12,75), HANG_LEG(3,10,60), PLANK(3,60,45) ] },
          ],
        },
        {
          weekNumber: 4, name: '主動恢復期',
          days: [
            { dayNumber: 1, focus: '回歸徒手控制', time: 18,
              exercises: [ CRUNCH(3,15,45), LEG_RAISE(3,15,45), PLANK(3,45,45), SIDE_PLANK(2,30,45) ] },
            { dayNumber: 2, focus: '回歸徒手控制', time: 18,
              exercises: [ RUSSIAN(3,15,45), CRUNCH(3,15,45), PLANK(3,45,45), DEAD_BUG(2,12,45) ] },
            { dayNumber: 3, focus: '回歸徒手控制', time: 18,
              exercises: [ LEG_RAISE(3,15,45), CRUNCH(3,15,45), PLANK(3,45,45), SIDE_PLANK(2,30,45) ] },
            { dayNumber: 4, focus: '回歸徒手控制', time: 18,
              exercises: [ RUSSIAN(3,15,45), DEAD_BUG(3,12,45), CRUNCH(3,15,45), PLANK(3,45,45) ] },
          ],
        },
      ],
    },

    /* ╔══════════════════════════════════════════════════════╗
       ║  精熟 — 超級組格式                                    ║
       ║  特色：極致壓縮時間，讓核心呈現燃燒狀態，適合收尾摧殘      ║
       ╚══════════════════════════════════════════════════════╝ */
    advanced: {
      key: 'advanced',
      label: '精熟',
      labelEn: 'Advanced',
      recommendedDays: 4,
      recommendedDaysLabel: '建議每週 4 天',
      durationPerSession: '20-30',
      equipment: ['單槓', '繩索機', '健腹輪', '啞鈴'],
      targetArea: '整體核心抗疲勞度、冰塊盒立體度',
      intensity: '極高',
      expectedGain: '打造猶如盔甲般的強悍核心，突破腹肌發展瓶頸',
      benefits: [
        '無縫接軌的超級組，將代謝壓力推向極致',
        '下腹接上腹 (SS1)，側腹接抗側彎 (SS2)，邏輯完美無死角',
        '腹輪 Finisher 強迫核心在疲勞狀態下維持穩定',
      ],
      periodization: {
        phase1: { name: '超級組適應', weeks: '第 1 週', focus: '習慣 A→B 的燃燒感', reps: 'SS: 12 次', intensity: 'RPE 7' },
        phase2: { name: '燃燒極限', weeks: '第 2 週', focus: '次數拉高，休息不變', reps: 'SS: 15 次', intensity: 'RPE 8' },
        phase3: { name: '厚度壓縮', weeks: '第 3 週', focus: '纜繩加重，強迫出力', reps: 'SS: 10 次（重）', intensity: 'RPE 9' },
        phase4: { name: '主動恢復', weeks: '第 4 週', focus: '取消超級組，單組執行', reps: '15 次（輕）', intensity: 'RPE 6' },
      },
      weeks: [
        {
          weekNumber: 1, name: '超級組適應期',
          days: [
            { dayNumber: 1, focus: '上下腹 SS + 側腹 SS + 腹輪', time: 25,
              exercises: [ SS_CORE_A1(3,12,60), SS_CORE_A2(3,12,60), SS_CORE_B1(3,12,60), SS_CORE_B2(3,30,60,'30秒'), CORE_FINISHER(2,10,60) ] },
            { dayNumber: 2, focus: '上下腹 SS + 側腹 SS + 腹輪', time: 25,
              exercises: [ SS_CORE_A1(3,12,60), SS_CORE_A2(3,12,60), SS_CORE_B1(3,12,60), SS_CORE_B2(3,30,60), CORE_FINISHER(2,10,60) ] },
            { dayNumber: 3, focus: '上下腹 SS + 側腹 SS + 腹輪', time: 25,
              exercises: [ SS_CORE_A1(3,12,60), SS_CORE_A2(3,12,60), SS_CORE_B1(3,12,60), SS_CORE_B2(3,30,60), CORE_FINISHER(2,10,60) ] },
            { dayNumber: 4, focus: '上下腹 SS + 側腹 SS + 腹輪', time: 25,
              exercises: [ SS_CORE_A1(3,12,60), SS_CORE_A2(3,12,60), SS_CORE_B1(3,12,60), SS_CORE_B2(3,30,60), CORE_FINISHER(2,10,60) ] },
          ],
        },
        {
          weekNumber: 2, name: '燃燒極限期',
          days: [
            { dayNumber: 1, focus: '高次數超級組', time: 28,
              exercises: [ SS_CORE_A1(3,15,60), SS_CORE_A2(3,15,60), SS_CORE_B1(3,15,60), SS_CORE_B2(3,40,60,'40秒'), CORE_FINISHER(3,12,60) ] },
            { dayNumber: 2, focus: '高次數超級組', time: 28,
              exercises: [ SS_CORE_A1(3,15,60), SS_CORE_A2(3,15,60), SS_CORE_B1(3,15,60), SS_CORE_B2(3,40,60), CORE_FINISHER(3,12,60) ] },
            { dayNumber: 3, focus: '高次數超級組', time: 28,
              exercises: [ SS_CORE_A1(3,15,60), SS_CORE_A2(3,15,60), SS_CORE_B1(3,15,60), SS_CORE_B2(3,40,60), CORE_FINISHER(3,12,60) ] },
            { dayNumber: 4, focus: '高次數超級組', time: 28,
              exercises: [ SS_CORE_A1(3,15,60), SS_CORE_A2(3,15,60), SS_CORE_B1(3,15,60), SS_CORE_B2(3,40,60), CORE_FINISHER(3,12,60) ] },
          ],
        },
        {
          weekNumber: 3, name: '厚度壓縮期',
          days: [
            { dayNumber: 1, focus: '加重，組間短休', time: 28,
              exercises: [ SS_CORE_A1(4,10,45,'加組數，縮短休息'), SS_CORE_A2(4,10,45,'纜繩加重'), SS_CORE_B1(4,10,45,'加重'), SS_CORE_B2(4,45,45,'45秒'), CORE_FINISHER(3,15,60) ] },
            { dayNumber: 2, focus: '加重，組間短休', time: 28,
              exercises: [ SS_CORE_A1(4,10,45), SS_CORE_A2(4,10,45), SS_CORE_B1(4,10,45), SS_CORE_B2(4,45,45), CORE_FINISHER(3,15,60) ] },
            { dayNumber: 3, focus: '加重，組間短休', time: 28,
              exercises: [ SS_CORE_A1(4,10,45), SS_CORE_A2(4,10,45), SS_CORE_B1(4,10,45), SS_CORE_B2(4,45,45), CORE_FINISHER(3,15,60) ] },
            { dayNumber: 4, focus: '加重，組間短休', time: 28,
              exercises: [ SS_CORE_A1(4,10,45), SS_CORE_A2(4,10,45), SS_CORE_B1(4,10,45), SS_CORE_B2(4,45,45), CORE_FINISHER(3,15,60) ] },
          ],
        },
        {
          weekNumber: 4, name: '主動恢復期',
          days: [
            { dayNumber: 1, focus: '取消超級組，恢復徒手', time: 18,
              exercises: [ CRUNCH(3,15,45), LEG_RAISE(3,15,45), PLANK(3,45,45), SIDE_PLANK(2,30,45) ] },
            { dayNumber: 2, focus: '取消超級組，恢復徒手', time: 18,
              exercises: [ RUSSIAN(3,15,45), CRUNCH(3,15,45), PLANK(3,45,45), DEAD_BUG(2,12,45) ] },
            { dayNumber: 3, focus: '取消超級組，恢復徒手', time: 18,
              exercises: [ LEG_RAISE(3,15,45), CRUNCH(3,15,45), PLANK(3,45,45), SIDE_PLANK(2,30,45) ] },
            { dayNumber: 4, focus: '取消超級組，恢復徒手', time: 18,
              exercises: [ RUSSIAN(3,15,45), DEAD_BUG(3,12,45), CRUNCH(3,15,45), PLANK(3,45,45) ] },
          ],
        },
      ],
    },
  },
};

// 🔧 SOP 第五階段：載入時就地把第4週正規化為減量週（sets×0.6, 最少2組）
applyWeek4Deload(CORE_PLAN);
