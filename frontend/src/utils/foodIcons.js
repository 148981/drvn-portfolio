/**
 * foodIcons.js — 每一樣食物的圖示（emoji 或自己拍的照片）
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼要有這個：
 *   食物庫給的 emoji 常常對不上。使用者的「雞腿便當」是巷口那家的樣子，
 *   不是 🍱。讓他自己換 —— 換過一次，之後在快速加入、飲食日記、食物詳情
 *   全部都跟著換，因為大家都從這裡讀。
 *
 * 為什麼用食物名稱當 key：
 *   同一樣食物在不同來源（TFDA／USDA／自建）有不同 id，用 id 會換一個地方
 *   就失效。名稱是使用者眼中的同一性。
 *
 * 照片一律壓成 128px 的 JPEG 再存 —— localStorage 只有幾 MB，
 * 原檔一張就能塞爆，之後所有偏好設定都會一起寫不進去。
 */

const key = (userId) => `drvn_food_icons_${userId || 'guest'}`;

/** @returns {Record<string, {emoji?:string, image?:string}>} */
export function readFoodIcons(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(key(userId)) || '{}');
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    } catch { return {}; }
}

function writeFoodIcons(userId, map) {
    try {
        localStorage.setItem(key(userId), JSON.stringify(map));
        return true;
    } catch {
        // 配額滿了就老實回 false，讓呼叫端說得出「存不下」而不是靜靜失敗
        return false;
    }
}

/** 設定某樣食物的圖示；`{emoji}` 或 `{image}` 二選一，兩個都沒有＝還原預設。 */
export function setFoodIcon(userId, name, icon) {
    if (!name) return false;
    const map = readFoodIcons(userId);
    if (!icon || (!icon.emoji && !icon.image)) delete map[name];
    else map[name] = icon.image ? { image: icon.image } : { emoji: icon.emoji };
    return writeFoodIcons(userId, map);
}

/** 讀某樣食物該顯示什麼：使用者設定的 > 食物本身帶的 > 預設。 */
export function resolveFoodIcon(icons, food, fallbackEmoji = '🍽️') {
    const override = food?.name ? icons?.[food.name] : null;
    if (override?.image) return { image: override.image, emoji: null };
    if (override?.emoji) return { image: null, emoji: override.emoji };
    if (food?.image) return { image: food.image, emoji: null };
    return { image: null, emoji: food?.emoji || fallbackEmoji };
}

/** 挑得動的常見食物 emoji —— 照「一餐會出現的東西」分組，不是照 Unicode 排序。 */
export const FOOD_EMOJIS = [
    '🍚', '🍱', '🍜', '🍝', '🍞', '🥖', '🥯', '🌾',
    '🍗', '🍖', '🥩', '🍤', '🐟', '🥚', '🫘', '🧀',
    '🥦', '🥬', '🥗', '🍅', '🥕', '🌽', '🍄', '🥑',
    '🍎', '🍌', '🍊', '🍓', '🍇', '🍉', '🥝', '🍍',
    '🥛', '☕', '🧋', '🥤', '🍺', '🧃', '💧', '🍵',
    '🍫', '🍪', '🍰', '🍦', '🥜', '🍿', '🥨', '🍩',
];

/**
 * 把使用者選的照片壓成小圖的 dataURL。
 * @param {File} file
 * @param {number} size 最長邊像素
 * @returns {Promise<string>} JPEG dataURL
 */
export function compressImageToDataUrl(file, size = 128) {
    return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type)) {
            reject(new Error('不是圖片檔'));
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const scale = Math.min(1, size / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                // 方形裁切：圖示是方的，直接縮會變形
                const side = Math.min(w, h);
                canvas.width = side;
                canvas.height = side;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, (w - side) / -2, (h - side) / -2, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            } catch (e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀不起來')); };
        img.src = url;
    });
}

export default readFoodIcons;
