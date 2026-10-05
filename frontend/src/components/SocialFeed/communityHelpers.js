// ════════════════════════════════════════════════════════════════════
import { haptic } from '../../utils/haptics';
import { uStorage } from '../../utils/userStorage';
import { getUserId } from '../../utils/auth';
//  communityHelpers.js
//  跑步社群 (SocialHubMobile) 與健身社群 (FitnessCommunityPage) 共用的
//  純函式 helpers。抽出以根治「改一邊忘了另一邊」的同步問題。
//  注意：此檔不含 JSX，僅純邏輯。需要 JSX 的共用元件見 communityShared.jsx。
// ════════════════════════════════════════════════════════════════════

/** 觸覺回饋（iOS WebKit bridge → navigator.vibrate fallback） */
export const triggerHaptic = (style = 'medium') => haptic(style);

/** 發文者頭貼與 Profile 同源：自己的貼文讀 user_avatar_photo（與個人頁同一張），
 *  他人貼文有 avatar 欄位才顯示，否則回傳 null（呼叫端退回字母縮寫）。 */
export const resolvePostAvatar = (post, isOwner) => {
    const a = post?.avatar;
    if (a && (String(a).startsWith('data:') || String(a).startsWith('http'))) return a;
    if (!isOwner) return null;
    try { return uStorage(getUserId()).get('user_avatar_photo', null); } catch { return null; }
};

/** 貼文時間戳：日期＋時間（兩個社群統一格式，例：7/9 · 08:07 pm） */
export const fmtPostTime = (createdAt) => {
    const d = new Date(createdAt || Date.now());
    return `${d.getMonth() + 1}/${d.getDate()} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase()}`;
};

/** ISO 時間 → 「剛剛 / N 分鐘前 / N 小時前 / N 天前 / M 月 D 日」
 *  ⚠️ 原本不到一分鐘會顯示「0分鐘前」、一年前的貼文顯示「365天前」、
 *     解析失敗顯示「NaN天前」。 */
export const timeAgo = (iso) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '剛剛';
    if (m < 60) return `${m} 分鐘前`;
    if (m < 1440) return `${Math.floor(m / 60)} 小時前`;
    if (m < 10080) return `${Math.floor(m / 1440)} 天前`;
    const d = new Date(t);
    const md = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()} 年 ${md}`;
};

/* 🗓️ 貼文時間／作者防呆（原本定義在 SocialHubMobile，只有跑步社群用得到；
   健身社群自己讀 post.userName，遇到「訪客用戶」就照印。收成一份兩邊共用）。
   規則：一律用「發文者發文當下」的名稱與時間，多來源依序 fallback，
   全部解析失敗才用現在時間，永不顯示 NaN。 */
export const resolvePostDate = (post = {}) => {
    const raw = post.raw || {};
    const candidates = [
        post.createdAt, post.created_at, post.date, post.timestamp,
        raw.created_at, raw.createdAt,
        post.drvnCard?.dateIso, raw.drvnCard?.dateIso,
        post.session_data?.drvnCard?.dateIso,
    ];
    for (const c of candidates) {
        if (c == null || c === '') continue;
        const d = new Date(typeof c === 'number' && c < 1e12 ? c * 1000 : c);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
};

export const resolvePostAuthorName = (post = {}) => {
    const raw = post.raw || {};
    const n = post.userName || post.user_name || raw.user_name || raw.userName
        || post.author?.name || post.profile?.name;
    const s = String(n || '').trim();
    // 「訪客用戶 / User / Guest」這種佔位名稱不該出現在別人看得到的貼文上
    if (!s || /^(user|guest|訪客用戶|訪客|unknown)$/i.test(s)) return '我';
    return s;
};

/** 秒 → 配速字串 m'ss" */
export const fmtPace = (s) => `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;

/** 秒 → 時間字串 h:mm:ss / m:ss */
export const fmtTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
        : `${m}:${String(s % 60).padStart(2, '0')}`;
};

/** GPS 路線陣列 → SVG path d 字串 */
export const getSvgPathFromRoute = (route, width = 300, height = 120) => {
    if (!route || !Array.isArray(route) || route.length < 2) return '';
    const validPoints = route.map(p => {
        if (Array.isArray(p)) return { lat: p[0], lng: p[1] };
        return p;
    }).filter(p => p && typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng));
    if (validPoints.length < 2) return '';
    const lats = validPoints.map(p => p.lat);
    const lngs = validPoints.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const scale = Math.min(width / lngRange, height / latRange) * 0.75;
    if (!isFinite(scale)) return '';
    const offsetX = (width - lngRange * scale) / 2;
    const offsetY = (height - latRange * scale) / 2;
    return validPoints.map((p, i) => {
        const x = (p.lng - minLng) * scale + offsetX;
        const y = height - ((p.lat - minLat) * scale + offsetY);
        if (isNaN(x) || isNaN(y)) return '';
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(' ');
};
