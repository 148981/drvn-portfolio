/**
 * gymStations.js — 每個動作「實際要用到哪一台器材」
 * ══════════════════════════════════════════════════════════════════════
 * exerciseTaxonomy 的 eq 只有大類（槓鈴／啞鈴／機械／滑輪／徒手／彈力帶），
 * 但健身房缺的是「那一台」：有滑輪機不代表有腿推機，有單槓不代表有雙槓。
 * 健身房記憶（utils/gymMemory）記的就是這一層 —— 使用者說「這間沒有哈克機」，
 * 被排除的是所有要用哈克機的動作，不是整個「機械」大類。
 *
 * 規則：
 *   · 機械動作 → 各自一台（蝴蝶機夾胸與反向蝴蝶機共用一台）
 *   · 滑輪動作 → 滑輪機；下拉與坐姿划船很多健身房是獨立機台，各自一台
 *   · 徒手動作 → 只有要用到器材的才有（單槓、雙槓、腹輪、滑盤），其餘回 null＝哪裡都能做
 *   · 查不到定義的自訂動作 → null（不知道要什麼器材，就不替它下判斷）
 * ══════════════════════════════════════════════════════════════════════
 */
import { defOfExercise, toMacroMuscle } from './exerciseTaxonomy';

/** 器材台 → 中文名（畫面上只顯示這個名字） */
export const STATION_ZH = {
    barbell: '槓鈴', ez_bar: 'EZ 槓', t_bar: 'T 槓划船', dumbbell: '啞鈴', band: '彈力帶',
    cable: '滑輪機', lat_pulldown: '滑輪下拉機', seated_row: '坐姿划船機',
    chest_press: '胸推機', pec_deck: '蝴蝶機', shoulder_press: '肩推機', chest_row: '胸靠划船機',
    roman_chair: '羅馬椅', preacher: '牧師椅', hack_squat: '哈克深蹲機', leg_press: '腿推機',
    smith: '史密斯機', leg_extension: '腿伸展機', leg_curl_seated: '坐姿腿彎舉機',
    leg_curl_lying: '俯臥腿彎舉機', hip_abduction: '髖外展機', calf_standing: '站姿提踵機',
    calf_seated: '坐姿提踵機', pullup_bar: '單槓', dip_bars: '雙槓', low_bar: '低槓',
    ab_wheel: '腹輪', sliders: '滑盤',
};

const BY_NAME = {
    'EZ Bar Curl': 'ez_bar', 'T-Bar Row': 't_bar',
    'Machine Chest Press': 'chest_press', 'Pec Deck Fly': 'pec_deck', 'Reverse Pec Deck': 'pec_deck',
    'Machine Shoulder Press': 'shoulder_press', 'Chest Supported Row': 'chest_row',
    'Hyperextensions': 'roman_chair', '45° Back Extension': 'roman_chair',
    'Preacher Curls': 'preacher', 'Hack Squat': 'hack_squat', 'Leg Press': 'leg_press',
    'Smith Machine Squat': 'smith', 'Leg Extensions': 'leg_extension',
    'Seated Leg Curl': 'leg_curl_seated', 'Lying Leg Curls': 'leg_curl_lying',
    'Machine Hip Abduction': 'hip_abduction', 'Calf Raises': 'calf_standing',
    'Seated Calf Raises': 'calf_seated',
    'Wide Grip Lat Pulldown': 'lat_pulldown', 'Neutral Grip Lat Pulldown': 'lat_pulldown',
    'Seated Cable Row': 'seated_row',
    'Pull Ups': 'pullup_bar', 'Chin Ups': 'pullup_bar', 'Hanging Leg Raise': 'pullup_bar',
    'Chest Dips': 'dip_bars', 'Tricep Dips': 'dip_bars', 'Inverted Row': 'low_bar',
    'Ab Wheel Rollout': 'ab_wheel', 'Sliding Leg Curl': 'sliders',
};

const BY_EQ = { barbell: 'barbell', dumbbell: 'dumbbell', cable: 'cable', band: 'band' };

/**
 * 這個動作要用哪一台。
 * @returns {{ id:string, zh:string, macro:string|null } | null}  null＝不需要器材或查不到
 */
export function stationOf(exercise) {
    const def = defOfExercise(typeof exercise === 'string' ? exercise : exercise?.name);
    if (!def) return null;
    const id = BY_NAME[def.name] || BY_EQ[String(def.eq || '').toLowerCase()] || null;
    if (!id) return null;
    return { id, zh: STATION_ZH[id] || id, macro: toMacroMuscle(def.muscle) };
}

export const stationZh = (id) => STATION_ZH[id] || null;

export default { stationOf, stationZh, STATION_ZH };
