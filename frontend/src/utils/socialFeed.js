/**
 * ══════════════════════════════════════════════════════════════════════════
 * SOCIAL FEED — 動態牆貼文的單一資料層
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼有這個檔案（2026-09 社群稽核）：
 *
 * 動態牆的貼文有兩個來源 —— 本機 localStorage（發文當下先存，離線也看得到）
 * 與後端 /api/feed/global。這兩份資料原本各自在
 * SocialHubMobile.jsx 與 FitnessCommunityPage.jsx 裡「各映射一次」，
 * 兩頁共四份映射邏輯，於是出現三個實際會壞的問題：
 *
 *  1. 同一篇貼文出現兩次
 *     發文時同時寫本機（activity_id = 'local_...'）與後端（後端生自己的 uuid），
 *     重載時兩份都進 feed。頁面雖然有依 id 去重，但兩份 id 本來就不同，
 *     去重完全沒作用 —— 使用者看到自己每一篇都貼了兩遍。
 *
 *  2. 順序不是時間順序
 *     合併寫成 [...local, ...server]，本機的永遠排在前面。
 *     朋友一分鐘前的貼文會沉在你上個月的貼文下面。
 *
 *  3. 同一個 bug 只修一半
 *     本機分支修好了「照片貼文不要被當成 0 公里跑步卡」、也還原了
 *     title / tags / location / meetup / 照片位置 / drvnCard；
 *     後端分支卻還寫死 type: 'run'（健身頁寫死 'fitness'）、
 *     而且那些欄位一個都沒還原。同一份資料走不同路徑就長得不一樣。
 *
 * 所以：映射、去重、排序只有這一份。要改行為就改這裡，
 * 不會再發生「跑步頁修好了、健身頁沒修」。
 */

// ── 型別判定 ──────────────────────────────────────────────────────────────
// 純照片／文字貼文絕對不能被當成跑步或健身紀錄 ——
// 否則會渲染成 0.00 公里的跑步卡或 0 公斤的訓練卡，看起來像壞掉。
export const resolvePostType = (a = {}, fallbackCommunity = 'run') => {
    const at = a.activity_type || a.type;
    if (at === 'post') return 'post';
    if (at === 'fitness' || at === 'strength' || a.community === 'fitness') return 'fitness';
    if (at === 'run' || a.community === 'cardio' || a.community === 'run') return 'run';
    // 舊資料沒有 activity_type：用這一頁的社群屬性當退路
    return fallbackCommunity === 'fitness' ? 'fitness' : 'run';
};

// ── session_data 安全解析 ────────────────────────────────────────────────
// session_data 可能是字串也可能已經是物件；直接 JSON.parse 會整面牆炸掉。
const readSession = (a = {}) => {
    const sd = a.session_data;
    if (!sd) return {};
    if (typeof sd === 'object') return sd;
    try { return JSON.parse(sd); } catch { return {}; }
};

const pickDrvnCard = (a = {}) => {
    if (a.drvnCard) return a.drvnCard;
    if (a.drvn_card) return a.drvn_card;
    const sd = readSession(a);
    return sd.drvnCard || sd.drvn_card || null;
};

/**
 * 把任何來源的貼文正規化成畫面用的統一形狀。
 *
 * ⚠️ 欄位「只加不減」：本機分支曾經因為沒還原 title/tags/location/meetup
 *    而讓使用者「發完文點回來就變樣」。這裡一律完整帶出，
 *    後端沒有的欄位就是 null / []，不會憑空消失。
 *
 * @param {object} a                 原始貼文（後端 item 或 localStorage 項目）
 * @param {'server'|'local'} source  來源，決定去重時誰優先
 * @param {'run'|'fitness'} community 這一頁的社群，只在資料沒標型別時當退路
 */
export const normalizePost = (a = {}, source = 'server', community = 'run') => {
    const sd = readSession(a);
    const name = a.user_name || a.userName || 'User';
    const type = resolvePostType(a, community);

    return {
        id: a.activity_id || a.id,
        uId: a.user_id || a.uId,
        userName: name,
        init: name[0] || 'U',

        type,
        // 卡片渲染器是先看 raw.activity_type 才看 type，兩者必須一致，
        // 否則會出現「type 說是照片貼文、raw 說是跑步」的分裂狀態。
        activity_type: a.activity_type || type,

        createdAt: a.created_at || a.createdAt || new Date().toISOString(),
        caption: a.caption ?? '',

        // 發文時填的欄位 —— 後端映射原本整組漏掉
        title: a.title || null,
        tags: a.tags || [],
        location: a.location || null,
        meetup: a.meetup || sd.meetup || null,
        orientation: a.orientation || 'portrait',
        imgPos: a.imgPos ?? a.img_pos ?? 50,   // 後端存成 img_pos
        drvnCard: pickDrvnCard(a),

        stats: {
            distance: a.metrics?.distance ?? a.distance_km ?? 0,
            pace: a.metrics?.pace ?? a.pace_per_km ?? 0,
            duration: a.metrics?.duration ?? a.duration_seconds ?? (a.duration_mins ? a.duration_mins * 60 : 0),
            volume: a.metrics?.volume_kg ?? a.volume_kg ?? a.total_volume ?? 0,
            sets: a.sets_completed ?? a.metrics?.sets ?? 0,
            calories: a.metrics?.calories ?? a.calories ?? 0,
            exercises: (a.exercises || []).map(e => ({
                name: e.name || e,
                volume: e.volume || (e.sets?.reduce?.((s, x) => s + (x.weight || 0) * (x.reps || 0), 0)) || 0,
            })),
        },
        metrics: a.metrics || {},
        photo: a.photo || a.photo_url || a.routeImg || null,
        // 多張照片（composer 給 images[]）—— 以前只取第一張，其餘整組掉在映射外面
        images: Array.isArray(a.images) ? a.images.filter(Boolean) : [],

        // 讚與留言：欄位別名兩邊本來各叫各的（comment_count vs comments）
        kudos: a.kudos_count ?? a.kudos ?? 0,
        commentCount: a.comment_count ?? a.comments ?? a.commentCount ?? 0,
        myKudo: a.user_gave_kudo ?? a.myKudo ?? false,

        visibility: a.visibility || a.privacy || 'public',
        communities: a.communities || a.targets || null,

        source,
        raw: a,
    };
};

/**
 * 內容指紋 —— 用來認出「本機這篇」與「後端那篇」其實是同一篇。
 *
 * 為什麼不能只比 id：本機存的是 'local_1725...'，後端存的是 uuid，
 * 兩個永遠不相等，所以依 id 去重抓不到這種重複。
 * 改用「誰、什麼時候（到分鐘）、說了什麼」當指紋。
 * 取到分鐘是因為本機時間與伺服器時間會差幾秒。
 */
export const postFingerprint = (p) => {
    const t = new Date(p.createdAt || 0).getTime();
    const minute = Number.isFinite(t) ? Math.floor(t / 60000) : 0;
    const cap = (p.caption || '').trim().slice(0, 40);
    return `${p.uId || ''}|${minute}|${cap}`;
};

/**
 * 合併本機與後端貼文：去重 → 依時間新到舊排序。
 *
 * 去重規則：同一篇以「後端版本」為準 —— 後端才有真實的讚數、留言數，
 * 以及別人對這篇的互動；本機那份只是發文當下的樂觀副本。
 * 只有後端還沒有的（剛發、或發文失敗）才留本機版本。
 */
export const mergeFeed = (localPosts = [], serverPosts = []) => {
    const byId = new Map();
    const byPrint = new Map();

    // 後端先進場 —— 它是權威版本
    for (const p of serverPosts) {
        if (!p?.id) continue;
        byId.set(p.id, p);
        byPrint.set(postFingerprint(p), p.id);
    }

    for (const p of localPosts) {
        if (!p?.id) continue;
        if (byId.has(p.id)) continue;                    // 同 id：後端已有
        if (byPrint.has(postFingerprint(p))) continue;   // 同內容：就是同一篇的本機副本
        byId.set(p.id, p);
        byPrint.set(postFingerprint(p), p.id);
    }

    return [...byId.values()].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
};

/**
 * 一步到位：把兩邊的原始資料變成可以直接 render 的 feed。
 */
export const buildFeed = ({ local = [], server = [], community = 'run' } = {}) => mergeFeed(
    local.map(a => normalizePost(a, 'local', community)),
    server.map(a => normalizePost(a, 'server', community)),
);

export default { normalizePost, mergeFeed, buildFeed, postFingerprint, resolvePostType };
