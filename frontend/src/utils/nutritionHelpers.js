import { editorialColors } from './colors';
import { haptic } from './haptics';
/**
 * nutritionHelpers.js
 * ──────────────────────────────────────────────────────────────────
 * 從 NutritionPageMobile.jsx（6700+ 行）抽出的純函式與設計常數。
 * 這些項目不依賴任何 React 狀態，獨立出來可降低主元件體積、便於重用與測試，
 * 且不改變任何 render 行為（P2-4 安全拆分第一步）。
 * ──────────────────────────────────────────────────────────────────
 */

/** 是否含中文字元 */
export const containsChinese = (text) => /[一-龥]/.test(text || '');

/** 飲食計劃類型的圖示 / 標籤 / 色 */
/**
 * 目標主題：三種目標的識別，全 app 只有這一份。
 *
 * 為什麼統一：原本這裡（總覽頁）與精靈裡的 GOAL_META 各寫各的顏色 ——
 * 同一份增肌計劃在總覽是橄欖綠 #5A7A3A、在精靈裡是金色 #D4A843，
 * 而 #D4A843 根本不在色票裡（金色在設計系統裡是成就徽章專用）。
 *
 * 現在三種目標一律用品牌強調色 Coral：一頁一個強調色是鐵律，
 * 目標的識別交給文字，不靠顏色分。
 * icon 是 GoalIcon 的類型代號，不是 emoji（介面無 emoji 鐵律）。
 *
 * 為什麼 label 改成中文：介面是中文的，卻在最大的那行字印「BULK」，
 * 使用者要先翻譯一次才知道自己在看什麼。code 保留英文代號給
 * 需要窄字寬的地方（例如 9px 追蹤大寫的 kicker）使用。
 * bulk 叫「增重」不叫「增肌」—— 熱量只能決定體重往哪走，
 * 長不長得出肌肉要看有沒有重訓，不能在標籤上先承諾。
 * verb 是給「一般會建議先＿＿」這類句子用的動詞。
 */
export const GOAL_THEME = {
    cut: { icon: 'cut', label: '減脂', code: 'CUT', verb: '減脂', color: '#F95C4B', desc: '把體脂降下來', sign: -1 },
    recomp: { icon: 'recomp', label: '體態重塑', code: 'RECOMP', verb: '維持', color: '#F95C4B', desc: '體重先穩住，慢慢調比例', sign: -1 },
    bulk: { icon: 'bulk', label: '增重', code: 'BULK', verb: '增重', color: '#F95C4B', desc: '體重往上帶，配合重訓才長肌肉', sign: 1 },
};

/** 舊名沿用（總覽頁在用），指向同一份資料。 */
export const PLAN_META = GOAL_THEME;

/** 智慧來源偵測：TFDA / USDA / 台灣四大通路 / 全球庫 / 最近紀錄 */
export const getFoodSourceInfo = (food) => {
    // 🍱 整份餐點（dishLibrary）：由 TFDA 原料組成算出來的一整份外食
    if (food.is_dish) {
        return { label: '整份餐點', icon: '', color: '#161415', bg: 'rgba(22,20,21,0.08)' };
    }
    if (food.is_tfda) {
        return { label: 'TFDA 官方', icon: '🧬', color: '#F95C4B', bg: 'rgba(249,92,75,0.1)' };
    }
    if (food.is_usda || food.source === 'usda') {
        return { label: 'USDA 標準', icon: '🇺🇸', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' };
    }
    const brands = (food.brands || '').toLowerCase();
    if (brands.includes('7-eleven') || brands.includes('統一') || brands.includes('seven')) {
        return { label: '7-11', icon: '🏪', color: '#FE5000', bg: 'rgba(254,80,0,0.1)' };
    }
    if (brands.includes('全家') || brands.includes('familymart')) {
        return { label: '全家', icon: '🏪', color: '#007A33', bg: 'rgba(0,122,51,0.1)' };
    }
    if (brands.includes('萊爾富') || brands.includes('hilife')) {
        return { label: '萊爾富', icon: '🏪', color: '#D71718', bg: 'rgba(215,23,24,0.1)' };
    }
    if (brands.includes('全聯') || brands.includes('pxmart')) {
        return { label: '全聯', icon: '🏪', color: '#004A99', bg: 'rgba(0,74,153,0.1)' };
    }
    if (food.is_global) {
        return { label: '全球庫', icon: '🌍', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' };
    }
    return { label: '最近紀錄', icon: '🕒', color: '#71717A', bg: 'rgba(113,113,122,0.1)' };
};

/** Haptic feedback 工具 */
export const triggerHaptic = (type = 'light') => haptic(type);

/** 清理食物名稱並提取屬性標籤 */
export const processFoodName = (name = '') => {
    const tagPatterns = [
        { regex: /低脂/g, tag: '低脂' },
        { regex: /高蛋白/g, tag: '高蛋白' },
        { regex: /無糖/g, tag: '無糖' },
        { regex: /有機/g, tag: '有機' },
        { regex: /全穀/g, tag: '全穀' },
    ];
    const tags = [];
    let cleanName = name;
    tagPatterns.forEach(({ regex, tag }) => {
        if (regex.test(cleanName)) {
            tags.push(tag);
            cleanName = cleanName.replace(regex, '').trim();
        }
    });
    return { cleanName: cleanName || name, tags };
};

/** Swiss-Noir CMF 色票（營養頁專用） */
export const C = editorialColors;

/** 材質漸層 */
export const TEXTURES = {
    titaniumMistMatte: 'linear-gradient(145deg, #F6F4F1 0%, #E4DED2 100%)',
    titaniumPebbleMatte: 'linear-gradient(145deg, #CFC6B8 0%, #E4DED2 100%)',
    titaniumObsidianMatte: 'linear-gradient(145deg, #161415 0%, #2A2A2A 100%)',
    wood: 'linear-gradient(135deg, #6D3D2F 0%, #3E2723 100%)',
};

/** 液態玻璃輸入框樣式 */
export const GLASS_INPUT = {
    fontFamily: '"Tenor Sans", sans-serif',
    background: 'rgba(246, 244, 241, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.85)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,1), 0 2px 8px rgba(22,20,21,0.03)',
    color: '#161415',
    transition: 'all 0.2s',
};
