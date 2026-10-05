// ════════════════════════════════════════════════════════════════
//  exerciseNameZh.js — 生成引擎(英文動作庫)的英文→中文動作名稱在地化
//
//  UnifiedTrainingEngine 的動作庫是英文 (Barbell Bench Press…)，而 preset/融合
//  計劃用中文。為了全站一致，生成的課表輸出前把動作名譯成中文。
//  先用既有 EXERCISE_TRANSLATION_DICT(中→英) 反轉，缺的用下方補充表補齊。
// ════════════════════════════════════════════════════════════════
import { EXERCISE_TRANSLATION_DICT } from '../data/exerciseDatabase';

// 補充：既有字典沒涵蓋的常用動作 (英 → 中)
const SUPPLEMENT_EN_ZH = {
    'Band Chest Press': '彈力帶胸推',
    'Neutral Grip Push Ups': '握把伏地挺身',
    'Incline Push Ups': '上斜伏地挺身',
    'Dumbbell Floor Press': '啞鈴地板臥推',
    'Band Chest Fly': '彈力帶夾胸',
    'Band Pushdown': '彈力帶三頭下壓',
    'Dumbbell Kickback': '啞鈴三頭後踢',
    'Dumbbell Rear Delt Fly': '啞鈴俯身反向飛鳥',
    'Band Rear Delt Fly': '彈力帶反向飛鳥',
    'Prone Y Raise': '俯臥 Y 字上舉',
    'Band Good Morning': '彈力帶早安式',
    'Band Leg Curl': '彈力帶腿彎舉',
    'Frog Pump': '青蛙臀橋',
    'Band Hip Abduction': '彈力帶髖外展',
    'Pallof Press': '帕洛夫推',
    'Hollow Body Hold': '空心支撐',
    'Reverse Crunch': '反向捲腹',
    'Incline Barbell Press': '上斜槓鈴臥推',
    'Chest Dips': '胸部雙槓臂屈伸',
    'Push Ups': '伏地挺身',
    'Cable Crossover': '繩索夾胸',
    'Dumbbell Overhead Press': '啞鈴肩推',
    'Arnold Press': '阿諾肩推',
    'Band Lateral Raise': '彈力帶側平舉',
    'Front Raise': '前平舉',
    'Reverse Pec Deck': '反向蝴蝶機',
    'Face Pulls': '繩索面拉',
    'Band Face Pull': '彈力帶面拉',
    'External Rotation': '肩外旋',
    'Band Pull Apart': '彈力帶後拉',
    'Close Grip Bench Press': '窄握臥推',
    'Tricep Dips': '三頭雙槓臂屈伸',
    'Tricep Pushdown': '三頭肌下壓',
    'Diamond Push Ups': '鑽石伏地挺身',
    'Rope Pushdown': '繩索三頭下壓',
    'Overhead Tricep Extension': '過頭三頭伸展',
    'Band Tricep Extension': '彈力帶三頭伸展',
    'Deadlift': '硬舉',
    'Barbell Row': '槓鈴划船',
    'Pull Ups': '引體向上',
    'Wide Grip Lat Pulldown': '寬握滑輪下拉',
    'Chin Ups': '反手引體向上',
    'Seated Cable Row': '坐姿划船',
    'Single Arm Dumbbell Row': '單臂啞鈴划船',
    'T-Bar Row': 'T槓划船',
    'Band Row': '彈力帶划船',
    'Straight Arm Pulldown': '直臂下拉',
    'Hyperextensions': '羅馬椅背伸展',
    'Bird Dog': '鳥狗式',
    'Superman Hold': '超人式',
    'Cat Cow': '貓牛式',
    'Barbell Bicep Curl': '槓鈴彎舉',
    'EZ Bar Curl': 'EZ槓彎舉',
    'Hammer Curls': '錘式彎舉',
    'Preacher Curls': '牧師椅彎舉',
    'Incline Dumbbell Curl': '上斜啞鈴彎舉',
    'Concentration Curl': '集中彎舉',
    'Cable Curl': '繩索彎舉',
    'Band Bicep Curl': '彈力帶彎舉',
    'Barbell Back Squat': '槓鈴深蹲',
    'Barbell Front Squat': '槓鈴前蹲',
    'Bodyweight Squat': '徒手深蹲',
    'Dumbbell Romanian Deadlift': '啞鈴羅馬尼亞硬舉',
    // 🔧 修正：槓鈴 RDL 過去因反轉字典撞名被翻成「啞鈴羅馬尼亞硬舉」→ 同日出現兩個同名動作
    'Romanian Deadlift': '羅馬尼亞硬舉',
    // ➕ [徒手庫補強] 新增動作的中文名
    'Decline Push Ups': '腳墊高伏地挺身',
    'Pike Push Ups': '派克伏地挺身',
    'Band Shoulder Press': '彈力帶肩推',
    'Inverted Row': '反向划船',
    'Band Lat Pulldown': '彈力帶滑輪下拉',
    'Band Hammer Curl': '彈力帶錘式彎舉',
    'Bench Dips': '板凳撐體',
    'Reverse Lunge': '後弓步蹲',
    'Wall Sit': '靠牆深蹲',
    'Single Leg Romanian Deadlift': '單腳羅馬尼亞硬舉',
    'Sliding Leg Curl': '滑行腿彎舉',
    'Single Leg Glute Bridge': '單腳臀橋',
    'Single Leg Calf Raise': '單腳提踵',
    'Good Morning': '早安式體前屈',
    'Hip Thrusts': '槓鈴臀推',
    '45° Back Extension': '45度背伸展',
    'Glute Bridge': '臀橋',
    'Machine Hip Abduction': '機械髖外展',
    'Cable Kickback': '繩索後踢臀',
    'Band Kickback': '彈力帶後踢臀',
    'Clamshells': '蚌殼式',
    'Quadruped Hip Extension': '四足跪姿後踢',
    'Calf Raises': '站姿提踵',
    'Seated Calf Raises': '坐姿提踵',
    'V-Up': 'V字捲腹',
    'Russian Twists': '俄羅斯轉體',
    'Bicycle Crunches': '腳踏車捲腹',
    'Leg Raises': '抬腿',
    'Hip Flexor Stretch': '髖屈肌伸展',
    'Ankle Mobility Drill': '踝關節活動度',
    'Pigeon Pose': '鴿式',
    'Glute Bridge Hold': '臀橋停留',
    'Shoulder Dislocates': '肩部繞環',
    'Wall Slides': '靠牆滑行',
};

// 反轉既有字典(中→英) 成 英→中，再疊上補充表
const EN_ZH = {};
for (const [zh, en] of Object.entries(EXERCISE_TRANSLATION_DICT || {})) {
    if (en && !EN_ZH[en]) EN_ZH[en] = zh;
}
Object.assign(EN_ZH, SUPPLEMENT_EN_ZH);

// 大小寫不敏感查詢用
const EN_ZH_LC = {};
for (const [en, zh] of Object.entries(EN_ZH)) EN_ZH_LC[en.toLowerCase()] = zh;

// 中→英反查（同一張表反過來用，不另外維護第二份對照）
const ZH_EN = {};
for (const [en, zh] of Object.entries(EN_ZH)) if (!ZH_EN[zh]) ZH_EN[zh] = en;

/** 中文動作名 → 英文（查無則原樣回傳）。替代動作系統靠它把中文課表接回動作庫。 */
export const toEnExerciseName = (zh) => {
    if (!zh) return zh;
    return ZH_EN[String(zh).trim()] || zh;
};

/** 英文動作名 → 中文（查無則原樣回傳） */
export const toZhExerciseName = (en) => {
    if (!en) return en;
    return EN_ZH[en] || EN_ZH_LC[String(en).toLowerCase()] || en;
};

export default toZhExerciseName;
