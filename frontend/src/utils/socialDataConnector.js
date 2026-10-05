/**
 * socialDataConnector.js — Central data layer for social features
 */
import { getUserId } from './auth';
import { PERMANENT_AXES, QUARTERLY_AXES, formatTarget } from './challengeRegistry';
import { uStorage } from './userStorage';
import { toLocalDateKey } from './localDate';
import { buildPRTimeline } from './personalRecords';
import { epleyE1RMStrict } from './strengthMath';
import apiClient from '../api/client';

const K = { profile: (uid) => `social_profile_${uid}`, following: (uid) => `following_${uid}`, clubs: 'strava_clubs', clubsUser: (uid) => `strava_clubs_${uid}`, membership: (uid) => `squad_membership_${uid}` };

/* ═══ XP TIERS ═══ */
export const XP_TIERS = [
    { id: 'beginner', label: '初學者', minXP: 0, icon: '', color: '#8FA87A' },
    { id: 'intermediate', label: '中級', minXP: 200, icon: '', color: '#6BAACC' },
    { id: 'advanced', label: '進階', minXP: 800, icon: '', color: '#E67E51' },
    { id: 'elite', label: '精英', minXP: 2000, icon: '', color: '#A78BCC' },
    { id: 'legend', label: '傳奇', minXP: 5000, icon: '', color: '#D4A843' },
];
export const getUserTier = (xp) => { for (let i = XP_TIERS.length - 1; i >= 0; i--) { if (xp >= XP_TIERS[i].minXP) return XP_TIERS[i]; } return XP_TIERS[0]; };

/* ═══ REGIONS / LOCATION AREAS ═══ */
export const REGIONS = [
    { id: 'taipei', label: '台北市' }, { id: 'newtaipei', label: '新北市' },
    { id: 'taoyuan', label: '桃園市' }, { id: 'taichung', label: '台中市' },
    { id: 'tainan', label: '台南市' }, { id: 'kaohsiung', label: '高雄市' },
    { id: 'hsinchu', label: '新竹市' }, { id: 'other', label: '其他' },
];

export const LOCATION_AREAS = {
    '台北市': ['大安區', '信義區', '中正區', '松山區', '南港區', '內湖區', '士林區', '北投區', '中山區', '萬華區', '大同區', '文山區'],
    '新北市': ['板橋區', '中和區', '永和區', '新店區', '三重區', '蘆洲區', '汐止區', '淡水區', '林口區', '土城區'],
    '台中市': ['西屯區', '北屯區', '南屯區', '西區', '中區', '東區', '太平區', '大里區'],
    '高雄市': ['前鎮區', '鳳山區', '左營區', '三民區', '苓雅區', '鼓山區'],
    '桃園市': ['桃園區', '中壢區', '龜山區', '八德區'],
    '台南市': ['東區', '中西區', '安平區', '北區', '南區'],
    '新竹市': ['東區', '北區', '香山區'],
};

/* ═══ TAG LIBRARY ═══ */
export const TAG_LIBRARY = {
    run: [
        { id: 't1', label: '晨跑', emoji: '' }, { id: 't2', label: '夜跑', emoji: '' },
        { id: 't3', label: '河濱', emoji: '' }, { id: 't4', label: '公園', emoji: '' },
        { id: 't5', label: '山路', emoji: '' }, { id: 't6', label: '馬拉松', emoji: '' },
        { id: 't7', label: '半馬', emoji: '' }, { id: 't8', label: '間歇', emoji: '' },
        { id: 't9', label: 'LSD', emoji: '' }, { id: 't10', label: '新手友善', emoji: '' },
        { id: 't11', label: '配速訓練', emoji: '' }, { id: 't12', label: '越野', emoji: '' },
        { id: 't13', label: '趣味跑', emoji: '' }, { id: 't14', label: '減重', emoji: '' },
    ],
    strength: [
        { id: 's1', label: '力量舉', emoji: '' }, { id: 's2', label: 'SBD', emoji: '' },
        { id: 's3', label: '健美', emoji: '' }, { id: 's4', label: 'CrossFit', emoji: '' },
        { id: 's5', label: '新手友善', emoji: '' }, { id: 's6', label: '進階', emoji: '' },
        { id: 's7', label: '自由重量', emoji: '' }, { id: 's8', label: '機械式', emoji: '' },
        { id: 's9', label: '增肌', emoji: '' }, { id: 's10', label: '減脂', emoji: '' },
        { id: 's11', label: '上半身', emoji: '' }, { id: 's12', label: '下半身', emoji: '' },
        { id: 's13', label: '核心', emoji: '' }, { id: 's14', label: '功能性訓練', emoji: '' },
    ],
    // 混合社團（跑步＋健身）：跑步與健身各取代表性標籤，避免整版全是跑步標籤。
    multisport: [
        { id: 'm1', label: '晨跑', emoji: '' }, { id: 'm2', label: '夜跑', emoji: '' },
        { id: 'm3', label: '河濱', emoji: '' }, { id: 'm4', label: '間歇', emoji: '' },
        { id: 'm5', label: '力量舉', emoji: '' }, { id: 'm6', label: '增肌', emoji: '' },
        { id: 'm7', label: '減脂', emoji: '' }, { id: 'm8', label: '核心', emoji: '' },
        { id: 'm9', label: '功能性訓練', emoji: '' }, { id: 'm10', label: 'CrossFit', emoji: '' },
        { id: 'm11', label: '新手友善', emoji: '' }, { id: 'm12', label: '減重', emoji: '' },
    ],
};

/* ═══ SOCIAL PROFILE ═══ */
export const getSocialProfile = (uid) => { try { return JSON.parse(localStorage.getItem(K.profile(uid))) || {}; } catch { return {}; } };
export const saveSocialProfile = (uid, p) => localStorage.setItem(K.profile(uid), JSON.stringify(p));

/* ═══ FOLLOW SYSTEM ═══ */
export const getFollowing = (uid) => { try { return JSON.parse(localStorage.getItem(K.following(uid))) || []; } catch { return []; } };
export const saveFollowing = (uid, list) => localStorage.setItem(K.following(uid), JSON.stringify(list));
export const followUser = (uid, targetId) => { const f = getFollowing(uid); if (!f.includes(targetId)) f.push(targetId); saveFollowing(uid, f); return f; };
export const unfollowUser = (uid, targetId) => { const f = getFollowing(uid).filter(id => id !== targetId); saveFollowing(uid, f); return f; };

export const MOCK_USERS = [
    { id: 'user_123', name: '我', avatar: '我', bio: '目標：硬舉 220kg！', city: '台北市', level: 45, stats: { runs: 55, lifts: 210, distance: 156 } },
    { id: 'u1', name: '冠甫', avatar: '冠', bio: '前任社長，現在專心練配速', city: '台北市', level: 42, stats: { runs: 89, lifts: 156, distance: 247 } },
    { id: 'u2', name: 'Sarah', avatar: 'S', bio: '半馬訓練中', city: '台北市', level: 38, stats: { runs: 120, likes: 45, distance: 380 } },
    { id: 'u7', name: 'David', avatar: 'D', bio: '馬拉松完賽 3 次', city: '台北市', level: 40, stats: { runs: 150, lifts: 20, distance: 520 } },
    { id: 'u3', name: 'Mike', avatar: 'M', bio: 'Push Pull Legs', city: '新北市', level: 35, stats: { runs: 30, lifts: 200, distance: 95 } },
    { id: 'u4', name: 'Emily', avatar: 'E', bio: '台中跑團', city: '台中市', level: 31, stats: { runs: 95, lifts: 60, distance: 310 } },
    { id: 'u5', name: 'Jason', avatar: 'J', bio: 'CrossFit & Trail', city: '高雄市', level: 28, stats: { runs: 55, lifts: 130, distance: 180 } },
    { id: 'u8', name: 'Amy', avatar: 'A', bio: '瑜珈 + 重訓', city: '新北市', level: 22, stats: { runs: 20, lifts: 80, distance: 60 } },
    { id: 'u6', name: 'Lily', avatar: 'L', bio: '健身新手', city: '台南市', level: 15, stats: { runs: 12, lifts: 40, distance: 35 } },
];

/* ═══ CLUBS ═══
 * 本機儲存採 per-user key（strava_clubs_<uid>），避免多帳號在同一裝置互相污染。
 * 舊版共用 key（strava_clubs）在首次讀取時自動遷移到目前使用者名下後清除。
 * ⚠ localStorage 換裝置/被 WKWebView 清掉即消失 → 重要資料的真相源是後端，
 *   由 hydrateClubsFromBackend() 在進入社群頁時把後端社團校正回本機（reconcile 模式）。
 */
export const getClubs = (uid = getUserId()) => {
    try {
        const perUser = localStorage.getItem(K.clubsUser(uid));
        if (perUser != null) return JSON.parse(perUser);
        // 一次性遷移：把舊的共用 key 搬到目前使用者名下
        const legacy = localStorage.getItem(K.clubs);
        if (legacy != null) {
            localStorage.setItem(K.clubsUser(uid), legacy);
            try { localStorage.removeItem(K.clubs); } catch { /* ignore */ }
            return JSON.parse(legacy);
        }
        return null;
    } catch { return null; }
};
export const saveClubs = (c, uid = getUserId()) => localStorage.setItem(K.clubsUser(uid), JSON.stringify(c));

/**
 * 後端社團 → 本機校正（reconcile）。
 * localStorage 是快取、後端是真相源。進入社群頁時呼叫：
 *   1. 讀使用者在後端的 squad membership（GET /api/squads/{id} 逐一取，或用 list 過濾）
 *   2. 把後端社團轉成前端 club 形狀，與本機清單以 squadId 去重合併
 *   3. 合併結果回寫本機，並回傳給呼叫端 setState
 * 任何一步失敗都靜默降級為「只用本機資料」，絕不阻斷畫面。
 *
 * @param {string} uid
 * @param {object} apiClient  由呼叫端注入（避免此工具檔直接相依 api）
 * @param {Array}  localClubs 目前本機清單
 * @returns {Promise<Array|null>} 合併後的清單；無變動或失敗時回 null
 */
export const hydrateClubsFromBackend = async (uid, apiClient, localClubs = []) => {
    if (!uid || !apiClient) return null;
    try {
        // 後端把「我加入的社團 id」存在 memberships；透過各社團 GET 取完整資料。
        const memResp = await apiClient.get('/api/squads/mine', { params: { user_id: uid } });
        const backendSquads = memResp?.data?.squads;
        if (!Array.isArray(backendSquads)) return null;

        // 後端形狀 → 前端 club 形狀
        const toClub = (s) => ({
            id: `c_${s.id}`,
            squadId: s.id,
            name: s.name,
            type: s.type,
            desc: s.description || '',
            avatar: s.avatar || '🏃',
            cover: s.cover_url || undefined,
            location: s.location || '',
            isPublic: (s.privacy || 'public') === 'public',
            members: s.members || (s.member_list || []).length || 1,
            maxMembers: 50,
            isJoined: true,
            createdAt: s.created_at || new Date().toISOString(),
            leaderId: s.leader_id,
            leaderName: s.leader_name || '我',
            feed: s.feed || [],
            leaderboard: (s.member_list || []).map(m => ({
                userId: m.user_id, name: m.name, avatar: m.avatar,
                distance: 0, volume: 0, runs: 0, sessions: 0, role: m.role || 'member',
            })),
            activeChallenges: s.active_challenges || [],
            customChallenges: s.custom_challenges || [],
            chat: s.chat || [],
            pendingApprovals: s.pending_approvals || [],
            vibeTier: s.vibe_tier || 'bronze',
            trophyCabinet: s.trophy_cabinet || [],
        });

        const merged = backendSquads.map(s => {
            const club = toClub(s);
            const previous = localClubs.find(c => (c.squadId || c.id) === s.id);
            return { ...previous, ...club, id: previous?.id || club.id };
        });
        saveClubs(merged, uid);
        return merged;
    } catch {
        return null; // 靜默降級：後端不可用時純用本機
    }
};
export const MAX_SQUADS = 3;
export const getSquadMembership = (uid) => { try { return JSON.parse(localStorage.getItem(K.membership(uid))) || []; } catch { return []; } };
export const saveSquadMembership = (uid, ids) => localStorage.setItem(K.membership(uid), JSON.stringify(ids.slice(0, MAX_SQUADS)));

/* ═══ CLUB LEVELS — 里程碑雙引擎制 ═══ */
/* 升級條件 A: completedExpeditions (完成遠征數) */
/* 升級條件 B: activeWeeks (累積滿載活躍週數) */
// Dual-engine level system removed as per user request. We now use Vibe Tier.
export const VIBE_TIERS = [
    { id: 'bronze', rank: 1, name: 'Bronze', nameZh: '寧靜', icon: '', minRate: 0, minActive: 0, color: '#CD7F32', glow: 'none', cardBg: 'rgba(255,255,255,0.85)', cardBorder: 'rgba(0,0,0,0.05)', auraCss: '', desc: '社團剛甦醒，等待成員點亮光環' },
    { id: 'silver', rank: 2, name: 'Silver', nameZh: '起步', icon: '', minRate: 0.20, minActive: 2, color: '#A0A0A8', glow: '0 0 12px rgba(160,160,168,0.3)', cardBg: 'rgba(245,245,250,0.9)', cardBorder: 'rgba(160,160,168,0.25)', auraCss: 'linear-gradient(135deg, #C0C0C8, #E8E8F0, #C0C0C8)', desc: '20% 成員已活躍！銀光初現' },
    { id: 'gold', rank: 3, name: 'Gold', nameZh: '熱絡', icon: '', minRate: 0.50, minActive: 3, color: '#D4A843', glow: '0 0 20px rgba(212,168,67,0.35), 0 0 40px rgba(212,168,67,0.1)', cardBg: 'linear-gradient(135deg, rgba(255,248,235,0.95), rgba(255,243,220,0.9))', cardBorder: 'rgba(212,168,67,0.3)', auraCss: 'linear-gradient(135deg, #D4A843, #E8C87A, #D4A843)', desc: '50% 成員活躍！金質微光綻放' },
    { id: 'diamond', rank: 4, name: 'Diamond', nameZh: '共振', icon: '', minRate: 0.80, minActive: 5, color: '#A78BCC', glow: '0 0 25px rgba(167,139,204,0.4), 0 0 60px rgba(167,139,204,0.15), inset 0 0 20px rgba(167,139,204,0.05)', cardBg: 'linear-gradient(135deg, rgba(240,235,255,0.95), rgba(230,220,255,0.9))', cardBorder: 'rgba(167,139,204,0.4)', auraCss: 'linear-gradient(135deg, #A78BCC, #C8A8F0, #7B68EE, #A78BCC)', desc: '80% 成員共振！終極視覺盛宴' },
];

/**
 * 社團本週的活躍程度。比例與人數兩個門檻都要過：
 *   寧靜 —              起步 ≥ 20% 且 ≥ 2 人
 *   熱絡 ≥ 50% 且 ≥ 3 人  共振 ≥ 80% 且 ≥ 5 人
 * ⚠️ 以前只看比例：一個人的社團只要自己練一次 = 100% = 共振。
 * activeCount 沒給（舊呼叫端）→ 只看比例，行為不變。
 */
export const getVibeTier = (activeRate, activeCount = Infinity) => {
    for (let i = VIBE_TIERS.length - 1; i >= 0; i--) {
        const t = VIBE_TIERS[i];
        if (activeRate >= t.minRate && activeCount >= (t.minActive || 0)) return t;
    }
    return VIBE_TIERS[0];
};

/** 某一階需要幾位成員本週活躍（比例換算與最低人數取大的那個） */
export const vibeTierNeed = (tier, totalMembers) =>
    Math.max(Math.ceil((tier?.minRate || 0) * Math.max(totalMembers || 0, 1)), tier?.minActive || 0);

/** Club level definitions (XP-based legacy system) */
export const CLUB_LEVELS = [
    { id: 'rookie', label: '新手俱樂部', icon: '', color: '#8FA87A' },
    { id: 'rising', label: '上升俱樂部', icon: '', color: '#6BAACC' },
    { id: 'elite', label: '精英俱樂部', icon: '', color: '#E67E51' },
    { id: 'champion', label: '冠軍俱樂部', icon: '', color: '#A78BCC' },
    { id: 'legend', label: '傳奇俱樂部', icon: '', color: '#D4A843' },
];

/** 向後相容：舊版 xp-based 也能用 */
export const getClubLevelLegacy = (xp) => {
    const thresholds = [0, 500, 1500, 4000, 10000];
    for (let i = CLUB_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= thresholds[i]) return CLUB_LEVELS[i];
    }
    return CLUB_LEVELS[0];
};

/* ═══ SYSTEM CHALLENGES — Story-themed + Dynamic Scaling ═══ */
/* perMember: target = perMember × club.members */
/* badge: 完成後收藏徽章 | vibeBoost: 完成時活躍度加成% | color: 專屬色 */
/* ════════════════════════════════════════════════════════════════════
   社團定位（Club Positioning）
   每種社團都有清楚的「主指標」，挑戰任務圍繞該指標設計，並全部對應到
   app 真正能記錄的運動資料（getRecordedChallengeProgress 可自動換算）。
   - 跑步 run        主指標：里程 (km)        輔：運動時間、跑步次數
   - 重訓 strength   主指標：累積訓練量 (kg)  輔：訓練次數、訓練時間
   - 騎行 cycling    主指標：里程 (km)        輔：運動時間、騎乘次數
   - 多元 multisport 主指標：運動時間/次數     （游泳/登山/瑜珈/HIIT 共用）
   ════════════════════════════════════════════════════════════════════ */
export const CLUB_FOCUS = {
    run: { label: '跑步社團', metric: '里程 (km)', unit: 'km' },
    strength: { label: '健身社團', metric: '累積訓練量 (kg)', unit: 'kg' },
    multisport: { label: '混合社團', metric: '里程 (km) + 累積訓練量 (kg)', unit: 'km' },
    other: { label: '混合社團', metric: '里程 (km) + 累積訓練量 (kg)', unit: 'km' },
};
export const getClubFocus = (type) => CLUB_FOCUS[type] || CLUB_FOCUS.other;

// 挑戰命名採「{當月}{目標}挑戰」(Strava 風格)；title 為不含月份的基底名，
// 月份前綴由 UI 依當月帶入。goal = 清楚的目標說明；unit 皆為可記錄的真實指標。
export const CLUB_CHALLENGES = {
    // 跑步社團 — 以「里程」為主軸，搭配時間與次數
    run: [
        { id: 'rc1', title: '全員出席挑戰', theme: 'Roll Call', desc: '本月每位成員至少出來跑一次，點亮社團的活躍光環。', goal: '每人至少完成 1 次跑步', perMember: 1, unit: '人次', icon: '', duration: '7天', category: 'mission', badge: '點名之光', badgeEn: 'Roll Call', material: 'linen', vibeBoost: 10, color: '#8FA87A' },
        { id: 'rc2', title: '晨跑 5 公里挑戰', theme: 'Early Bird', desc: '社團每位成員本月累積完成 5 公里晨跑，一起喚醒城市。', goal: '每人累積跑 5 公里', perMember: 5, unit: 'km', icon: '', duration: '7天', category: 'mission', badge: '破曉五里', badgeEn: 'Early Bird', material: 'linen', vibeBoost: 12, color: '#FFB347' },
        { id: 'rc3', title: '本月 30 公里里程挑戰', theme: 'Monthly Base', desc: '穩定累積跑量，社團每人本月跑滿 30 公里。', goal: '每人累積里程 30 公里', perMember: 30, unit: 'km', icon: '', duration: '30天', category: 'challenge', badge: '月度基線', badgeEn: 'Monthly Base', material: 'clay', vibeBoost: 15, color: '#6BAACC' },
        { id: 'rc4', title: '半程馬拉松挑戰', theme: 'Half Marathon', desc: '社團每人累積 21.1 公里，征服半程馬拉松的距離。', goal: '每人累積里程 21.1 公里', perMember: 21.1, unit: 'km', icon: '', duration: '30天', category: 'challenge', badge: '半程弧線', badgeEn: 'Half Marathon', material: 'porphyry', vibeBoost: 18, color: '#D4A843' },
        { id: 'rc5', title: '全程馬拉松挑戰', theme: 'Full Marathon', desc: '社團每人累積 42.2 公里，跑完一場完整的馬拉松。', goal: '每人累積里程 42.2 公里', perMember: 42.2, unit: 'km', icon: '', duration: '30天', category: 'challenge', badge: '完賽刻度', badgeEn: 'Full Marathon', material: 'patina', vibeBoost: 22, color: '#E67E51' },
        { id: 'rc6', title: '百公里跑者挑戰', theme: 'Centurion', desc: '社團每人本月累積 100 公里，成為真正的百K跑者。', goal: '每人累積里程 100 公里', perMember: 100, unit: 'km', icon: '', duration: '30天', category: 'challenge', badge: '百里門檻', badgeEn: 'Centurion', material: 'patina', vibeBoost: 28, color: '#A78BCC' },
        { id: 'rc7', title: '跑步 12 次規律挑戰', theme: 'Consistency', desc: '規律才是進步的關鍵，社團每人本月完成 12 次跑步。', goal: '每人完成 12 次跑步', perMember: 12, unit: '次', icon: '', duration: '30天', category: 'challenge', badge: '節奏成形', badgeEn: 'Consistency', material: 'clay', vibeBoost: 16, color: '#8FA87A' },
        { id: 'rc8', title: '累積 300 分鐘有氧挑戰', theme: 'Time on Feet', desc: '社團每人本月累積 300 分鐘的跑步時間。', goal: '每人累積跑步 300 分鐘', perMember: 300, unit: '分鐘', icon: '', duration: '30天', category: 'challenge', badge: '時間積層', badgeEn: 'Time on Feet', material: 'clay', vibeBoost: 18, color: '#4898C0' },
        { id: 'rc9', title: '破 PB 挑戰', theme: 'New Record', desc: '本月社團每人至少刷新一項個人紀錄（1K / 3K / 5K / 10K / 半馬）。', goal: '每人本月破 1 項 PB', perMember: 1, unit: 'PB', icon: '', duration: '30天', category: 'challenge', badge: '紀錄更迭', badgeEn: 'New Record', material: 'patina', vibeBoost: 20, color: '#F95C4B' },
        { id: 'rc10', title: '夜跑週挑戰', theme: 'Night Shift', desc: '社團每人本週完成 3 次夜跑（19:00 後），點亮城市夜色。', goal: '每人本週夜跑 3 次', perMember: 3, unit: '夜跑', icon: '', duration: '7天', category: 'mission', badge: '城市夜航', badgeEn: 'Night Shift', material: 'clay', vibeBoost: 14, color: '#6A6F75' },
        { id: 'rc11', title: '爬升 500 公尺挑戰', theme: 'The Ascent', desc: '社團每人本月累積爬升 500 公尺，把坡道踩在腳下。', goal: '每人累積爬升 500 公尺', perMember: 500, unit: 'm', icon: '', duration: '30天', category: 'challenge', badge: '海拔痕跡', badgeEn: 'The Ascent', material: 'porphyry', vibeBoost: 18, color: '#8A6B4E' },
        { id: 'rc12', title: '雙人團練挑戰', theme: 'Better Together', desc: '本月與社團夥伴一起訓練 2 次（系統自動偵測同行），一起變強。', goal: '每人完成 2 次團練', perMember: 2, unit: '團練', icon: '', duration: '30天', category: 'challenge', badge: '並肩座標', badgeEn: 'Better Together', material: 'clay', vibeBoost: 22, color: '#8FA87A' },
        { id: 'rc13', title: '本週出門兩次挑戰', theme: 'Twice Out', desc: '這禮拜出門跑兩次就好，把節奏接回來。', goal: '每人本週跑 2 次', perMember: 2, unit: '次', icon: '', duration: '7天', category: 'mission', badge: '再次啟程', badgeEn: 'Twice Out', material: 'linen', vibeBoost: 10, color: '#6BAACC' },
        { id: 'rc14', title: '本週 30 分鐘有氧挑戰', theme: 'Thirty', desc: '這禮拜累積跑 30 分鐘，一趟就能完成。', goal: '每人本週累積 30 分鐘', perMember: 30, unit: '分鐘', icon: '', duration: '7天', category: 'mission', badge: '半小時的風', badgeEn: 'Thirty', material: 'linen', vibeBoost: 10, color: '#4898C0' },
    ],
    // 重訓社團 — 以「累積訓練量 (kg)」為主軸，搭配次數與時間
    strength: [
        { id: 'sc1', title: '全員進場挑戰', theme: 'No One Left Behind', desc: '本月每位成員至少走進重訓室一次。', goal: '每人至少完成 1 次訓練', perMember: 1, unit: '人次', icon: '', duration: '7天', category: 'mission', badge: '無人缺席', badgeEn: 'No One Left Behind', material: 'linen', vibeBoost: 10, color: '#CD7F32' },
        { id: 'sc2', title: '一噸俱樂部挑戰', theme: 'One Ton Club', desc: '社團每位成員本週累積舉起 1,000 公斤訓練量。', goal: '每人累積 1,000 公斤訓練量', perMember: 1000, unit: 'kg', icon: '', duration: '7天', category: 'mission', badge: '第一噸重', badgeEn: 'One Ton Club', material: 'linen', vibeBoost: 12, color: '#8FA87A' },
        { id: 'sc3', title: '本月 5 噸訓練量挑戰', theme: 'Tonnage', desc: '穩定累積訓練量，社團每人本月舉起 5,000 公斤。', goal: '每人累積 5,000 公斤訓練量', perMember: 5000, unit: 'kg', icon: '', duration: '30天', category: 'challenge', badge: '五噸累積', badgeEn: 'Tonnage', material: 'clay', vibeBoost: 16, color: '#D4A843' },
        { id: 'sc4', title: '十噸巨獸挑戰', theme: 'The Leviathan', desc: '社團每位成員本月累積 10,000 公斤，征服傳說中的巨獸。', goal: '每人累積 10,000 公斤訓練量', perMember: 10000, unit: 'kg', icon: '', duration: '30天', category: 'challenge', badge: '巨獸之影', badgeEn: 'The Leviathan', material: 'porphyry', vibeBoost: 22, color: '#6BAACC' },
        { id: 'sc5', title: '百噸推進挑戰', theme: 'Rocket Launch', desc: '社團每位成員累積 100,000 公斤，把訓練化為前進的推力。', goal: '每人累積 100,000 公斤訓練量', perMember: 100000, unit: 'kg', icon: '', duration: '90天', category: 'challenge', badge: '百噸推力', badgeEn: 'Rocket Launch', material: 'patina', vibeBoost: 28, color: '#A78BCC' },
        { id: 'sc6', title: '訓練 12 次規律挑戰', theme: 'Consistency', desc: '規律訓練才有成果，社團每人本月完成 12 次訓練。', goal: '每人完成 12 次訓練', perMember: 12, unit: '次', icon: '', duration: '30天', category: 'challenge', badge: '穩定出席', badgeEn: 'Consistency', material: 'clay', vibeBoost: 16, color: '#CD7F32' },
        { id: 'sc7', title: '累積 600 分鐘訓練挑戰', theme: 'Time Under Tension', desc: '社團每人本月累積 600 分鐘的訓練時間。', goal: '每人累積訓練 600 分鐘', perMember: 600, unit: '分鐘', icon: '', duration: '30天', category: 'challenge', badge: '張力沉積', badgeEn: 'Time Under Tension', material: 'clay', vibeBoost: 18, color: '#4898C0' },
        { id: 'sc8', title: '破 1RM 挑戰', theme: 'New Max', desc: '本月社團每人至少刷新一個動作的推估 1RM。', goal: '每人本月破 1 項 1RM', perMember: 1, unit: '1RM', icon: '', duration: '30天', category: 'challenge', badge: '臨界更新', badgeEn: 'New Max', material: 'patina', vibeBoost: 22, color: '#F95C4B' },
        { id: 'sc9', title: '三大項全勤挑戰', theme: 'The Big Three', desc: '本月每人深蹲、臥推、硬舉各至少練 1 次，把根基練穩。', goal: '每人三大項各 1 次', perMember: 3, unit: '大項', icon: '', duration: '30天', category: 'challenge', badge: '三項根基', badgeEn: 'The Big Three', material: 'porphyry', vibeBoost: 16, color: '#8A6B4E' },
        { id: 'sc10', title: '雙人團練挑戰', theme: 'Iron Brothers', desc: '本月與社團夥伴一起進場訓練 2 次，互相補位互相推。', goal: '每人完成 2 次團練', perMember: 2, unit: '團練', icon: '', duration: '30天', category: 'challenge', badge: '同場之鐵', badgeEn: 'Iron Brothers', material: 'clay', vibeBoost: 22, color: '#8FA87A' },
        { id: 'sc12', title: '本週進場兩次挑戰', theme: 'Twice In', desc: '這禮拜進健身房兩次就好，先把習慣接回來。', goal: '每人本週訓練 2 次', perMember: 2, unit: '次', icon: '', duration: '7天', category: 'mission', badge: '兩次進場', badgeEn: 'Twice In', material: 'linen', vibeBoost: 10, color: '#6BAACC' },
        { id: 'sc13', title: '本週練一個大項挑戰', theme: 'One Big Lift', desc: '這禮拜深蹲、臥推、硬舉任選一項練到，根基先顧好。', goal: '每人本週練 1 個大項', perMember: 1, unit: '大項', icon: '', duration: '7天', category: 'mission', badge: '一項根基', badgeEn: 'One Big Lift', material: 'clay', vibeBoost: 12, color: '#8A6B4E' },
        { id: 'sc11', title: '訓練 20 次高頻挑戰', theme: 'Grind Mode', desc: '進階者專屬，社團每人本月完成 20 次訓練。', goal: '每人完成 20 次訓練', perMember: 20, unit: '次', icon: '', duration: '30天', category: 'challenge', badge: '高頻運轉', badgeEn: 'Grind Mode', material: 'porphyry', vibeBoost: 26, color: '#A78BCC' },
    ],
    // 混合社團 = 跑步 + 健身 全部任務（於 getClubChallenges 動態合併）
};

/**
 * 取得社團任務清單。
 * - 跑步 run / 健身 strength：各自專屬任務。
 * - 混合 multisport：同時包含「跑步 + 健身」兩種任務（依使用者需求）。
 * - 其他未定義類型：回退到混合清單，避免「沒東西」。
 */
export const getClubChallenges = (type) => {
    if (type === 'run') return CLUB_CHALLENGES.run;
    if (type === 'strength') return CLUB_CHALLENGES.strength;
    // 混合及其他 → 跑步 + 健身 全部包含
    return [...CLUB_CHALLENGES.run, ...CLUB_CHALLENGES.strength];
};

/** 動態計算挑戰目標（根據社團人數縮放）*/
export const getChallengeTarget = (challenge, memberCount) => {
    if (challenge.fixedTarget) return challenge.fixedTarget;
    return Math.ceil((challenge.perMember || 1) * Math.max(memberCount, 1));
};

/* ═══ TROPHY CATALOG — 成就庫三大系列 ═══ */
export const TROPHY_CATALOG = {
    collective: {
        seriesName: '共振拓印', 
        seriesNameEn: 'Resonance Imprint',
        seriesIcon: '', 
        seriesDesc: '社團整體的活躍度與互動軌跡。',
        style: 'clay', 
        badges: [
            { id: 'col_pulse', title: '微弱脈搏', titleZh: '微弱脈搏', icon: '', desc: '連續 3 天，社團每日至少有 1 名成員上傳運動紀錄。', color: '#E6E1D8', material: 'linen' },
            { id: 'col_sync', title: '潮汐同頻', titleZh: '潮汐同頻', icon: '', desc: '單日內，社團活躍打卡人數超過總人數的 50%。', color: '#BBAFA0', material: 'clay' },
            { id: 'col_vibe', title: '靜水深流', titleZh: '靜水深流', icon: '淵', desc: '社團 Vibe 活躍度連續 4 週維持在 Gold (50%+) 以上。', color: '#7B827A', material: 'porphyry' },
            { id: 'col_matrix', title: '矩陣覺醒', titleZh: '矩陣覺醒', icon: '', desc: '社團總成員數突破 50 人，且當週活躍度達 Diamond (80%+)。', color: '#8A6B4E', material: 'patina' },
            { id: 'col_gravity', title: '引力牽引', titleZh: '引力牽引', icon: '', desc: '社團貼文累積獲得 5,000 次 Kudos (互相按讚互動)。', color: '#4A4C48', material: 'porphyry' },
            { id: 'col_photo', title: '光合作用', titleZh: '光合作用', icon: '', desc: '社團累積產生 100 篇附帶實景照片的運動貼文。', color: '#C4B9A9', material: 'linen' },
            { id: 'col_year', title: '歲月沉積', titleZh: '歲月沉積', icon: '', desc: '社團成立時間正式滿 365 天。', color: '#5C564D', material: 'patina' }
        ]
    },
    division: {
        seriesName: '動態策展', 
        seriesNameEn: 'Dynamic Curation',
        seriesIcon: '', 
        seriesDesc: '將時間與重力，轉譯為生活裡的實體雕塑。',
        style: 'clay', // 延續霧面黏土與高級紙材的設定
        badges: {
            run: [
                { id: 'run_dawn', title: '白晝序章', titleZh: '白晝序章', icon: '', desc: '社團累積完成 50 次清晨時段（05:00-07:00）的跑步紀錄。', color: '#D5C7B8', material: 'linen' },
                { id: 'run_stealth', title: '城市暗房', titleZh: '城市暗房', icon: '', desc: '社團累積完成 50 次夜晚時段（20:00-23:59）的跑步紀錄。', color: '#6A6F75', material: 'porphyry' },
                { id: 'run_crust', title: '步態策展', titleZh: '步態策展', icon: '', desc: '社團成員「總累積里程」合計突破 5,000 公里。', color: '#888C86', material: 'porphyry' },
                { id: 'run_meridian', title: '流動座標', titleZh: '流動座標', icon: '', desc: '單日內，社團成員合計跑步里程超過 100 公里。', color: '#8A6B4E', material: 'patina' },
                { id: 'run_altitude', title: '海拔輪廓', titleZh: '海拔輪廓', icon: '', desc: '社團單月內「總爬升高度」累積達 10,000 公尺。', color: '#A89F91', material: 'clay' },
                { id: 'run_uniform', title: '同頻對白', titleZh: '同頻對白', icon: '', desc: '單次實體團練中，至少 5 名成員完成 5K，且彼此平均配速誤差在 10 秒內。', color: '#9CA39A', material: 'clay' },
                { id: 'run_epic', title: '長篇敘事', titleZh: '長篇敘事', icon: '', desc: '單一成員單次跑步距離超過 42.195 公里（全程馬拉松），為社團貢獻史詩數據。', color: '#C9A66B', material: 'patina' },
                { id: 'run_perpetual', title: '恆定日常', titleZh: '恆定日常', icon: '', desc: '連續 30 天，每天都有至少 1 名成員上傳跑步紀錄，無一中斷。', color: '#5C564D', material: 'porphyry' }
            ],
            strength: [
                { id: 'str_rupture', title: '留白的張力', titleZh: '留白的張力', icon: '', desc: '單週內，社團累積完成 50 次重訓打卡紀錄。', color: '#C4B9A9', material: 'linen' },
                { id: 'str_conservation', title: '重力美學', titleZh: '重力美學', icon: '', desc: '社團成員「總訓練容量 (Volume)」累積突破 100,000 公斤。', color: '#9CA39A', material: 'clay' },
                { id: 'str_defy', title: '密度的詩意', titleZh: '密度的詩意', icon: '', desc: '單日內，社團成員合計舉起超過 10,000 公斤的訓練容量。', color: '#7B827A', material: 'porphyry' },
                { id: 'str_forge', title: '鍛造儀式', titleZh: '鍛造儀式', icon: '', desc: '連續 30 天，每天都有至少 1 名成員上傳重訓紀錄，無一中斷。', color: '#8A6B4E', material: 'patina' },
                { id: 'str_structure', title: '骨架重構', titleZh: '骨架重構', icon: '', desc: '社團累積完成 1,000 組三項核心動作（深蹲、硬舉、臥推）。', color: '#888C86', material: 'porphyry' },
                { id: 'str_peak', title: '臨界微光', titleZh: '臨界微光', icon: '', desc: '單週內，社團有至少 5 名成員打破個人的 1RM（單下最大重量）紀錄。', color: '#A09384', material: 'clay' },
                { id: 'str_time', title: '沉浸法則', titleZh: '沉浸法則', icon: '', desc: '單月內，社團成員累積完成 200 小時的總重訓時長。', color: '#D5C7B8', material: 'linen' },
                { id: 'str_growth', title: '有機擴張', titleZh: '有機擴張', icon: '', desc: '社團單週總訓練容量，比起上一週成長幅度達 20% 以上。', color: '#6A6F75', material: 'porphyry' }
            ]
        }
    }
};

/* ═══ APEX UPGRADE REQS ═══ */
export const APEX_UPGRADE_REQS = {
    C: { name: '潛能 (Potential)', color: '#A0A0A8', bg: '#2D2D35', req: '完成 3 次史詩遠征', badgeTint: 'grayscale(0.5)' },
    B: { name: '卓越 (Excellence)', color: '#E0E0E0', bg: '#404048', req: '10 週活躍 + 5 個默契徽章', badgeTint: 'none' },
    A: { name: '精英 (Elite)', color: '#333333', bg: '#FFD70030', req: '20 週活躍 + 社團等級 5', badgeGlow: '0 0 20px #FFD700' },
    S: { name: '巔峰 (Apex)', color: '#FFD700', bg: 'linear-gradient(135deg, #000, #333)', req: '完成所有徽章 + Vibe 90%', aura: true },
};

/* ═══ OFFICIAL EVENTS — 全平台 / 社團活動 Banner ═══ */
/* ══════════════════════════════════════════════════════════════════════
 * 官方活動（季度賽事）
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 稽核前這裡是四筆寫死日期的活動（6/15、7/4、8/10、9/1），
 *    橫幅的過濾條件是 endDate >= now —— 最後一檔 9/7 結束之後
 *    activeEvents.length === 0，OfficialEventsBanner 直接 return null，
 *    整個「官方活動」區塊靜默消失。使用者看到的是功能不見了，
 *    不是「這季還沒開始」。
 *
 * 改成依當季生成：一季一檔，日期由季度邊界算出來，永遠不會空。
 * 達標條件與獎勵徽章直接引用 challengeRegistry 的季度軸 ——
 * 「參加活動 → 解鎖季度徽章」兩邊是同一份定義。
 */
export const QUARTER_THEMES = [
    {
        q: 1, title: 'WINTER BASE', subtitle: '冬訓期',
        desc: '天冷才是把底子打厚的時候。這一季我們堆里程，不追配速。',
        fullDesc: '沒有比賽的季節，是拉開差距的季節。當別人在等天氣變好，我們把有氧底盤一層一層疊上去 —— 春天開跑的時候，差別就在這三個月。',
        image: '/images/season_q1_winter.png',
        gradient: 'linear-gradient(135deg, #8FA9C4, #5B7089)',
    },
    {
        q: 2, title: 'SPRING OPENER', subtitle: '春季啟程',
        desc: '回溫了，賽季開始。把冬天累積的底子換成成績。',
        fullDesc: '路跑賽程表在這一季排得最滿。冬訓存下來的那些公里，現在該領出來用了。',
        image: '/images/season_q2_spring.png',
        gradient: 'linear-gradient(135deg, #A8C49A, #6E8F62)',
    },
    {
        q: 3, title: 'PEAK HEAT', subtitle: '盛夏強度',
        desc: '最難練的一季。撐過去的人，秋天會知道差別。',
        fullDesc: '高溫把每一次訓練的成本都拉高，所以這一季的門檻反而最誠實 —— 出得了門，就已經贏過大半。',
        image: '/images/season_q3_summer.png',
        gradient: 'linear-gradient(135deg, #F0A868, #D9673B)',
    },
    {
        q: 4, title: 'FINAL COUNT', subtitle: '年度結算',
        desc: '一年的最後一段。把數字補到你想看到的位置。',
        fullDesc: '年度總結就要產出了。這一季每一筆紀錄都會被算進你今年的年鑑裡。',
        image: '/images/season_q4_autumn.png',
        gradient: 'linear-gradient(135deg, #C4A484, #8A6B4E)',
    },
];

const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 某個日期落在第幾季（1-4）。 */
export const quarterOf = (d = new Date()) => Math.floor(d.getMonth() / 3) + 1;

/**
 * 指定日期所屬季度的官方活動。日期由季度邊界算出，所以永遠是「進行中」。
 * @param {Date} date
 */
export const quarterEventFor = (date = new Date()) => {
    const y = date.getFullYear();
    const q = quarterOf(date);
    const theme = QUARTER_THEMES[q - 1];
    const start = new Date(y, (q - 1) * 3, 1);
    const end = new Date(y, q * 3, 0);          // 該季最後一天
    // 主目標取季度跑量軸的第三階（中間偏難，不會一開季就達標、也不會遙不可及）
    const kmAxis = QUARTERLY_AXES.find((a) => a.id === 'q_km');
    const main = kmAxis?.steps?.[2] || kmAxis?.steps?.[0];
    return {
        id: `oe_${y}Q${q}`,
        quarter: q,
        year: y,
        title: theme.title,
        subtitle: theme.subtitle,
        desc: theme.desc,
        fullDesc: theme.fullDesc,
        image: theme.image,
        gradient: theme.gradient,
        startDate: isoDate(start),
        endDate: isoDate(end),
        goal: `本季累積 ${main?.target ?? 100} km`,
        icon: '',
        scope: 'global',
        unit: 'km',
        targetPerMember: main?.target ?? 100,
        badgeId: main?.asset || null,
        /* 這一季打完可以拿到的所有徽章 —— 直接引用季度軸，
           活動與成就頁講的是同一件事。 */
        rewards: QUARTERLY_AXES.flatMap((a) => a.steps.map((st) => st.name)),
        badgeIds: QUARTERLY_AXES.flatMap((a) => a.steps.map((st) => st.asset)),
    };
};

/* 一次性的特別活動寫在這裡（例如跟賽事合作）。
   有進行中的特別活動時，橫幅會把它排在季度活動前面。 */
export const MANUAL_EVENTS = [];

/**
 * 現在該顯示哪些官方活動。永遠至少回一筆（當季那檔）。
 * ⚠️ 呼叫端請用這支，不要直接對 OFFICIAL_EVENTS 做 endDate 過濾 ——
 *    那正是上一版整區消失的原因。
 */
export const getOfficialEvents = (date = new Date()) => {
    const live = MANUAL_EVENTS.filter((e) => new Date(e.endDate) >= date);
    return [...live, quarterEventFor(date)];
};

/** 向後相容：模組載入當下的活動清單。 */
export const OFFICIAL_EVENTS = getOfficialEvents();


/* ═══ PERMANENT CHALLENGES (常駐挑戰) ═══ */
/* 常駐挑戰 —— 從 challengeRegistry 生成，不再手寫第二份。
   社群頁要的是「這個軸是什麼、有幾階、範圍多大」；
   「我現在在第幾階」是每個人不一樣的，由 axisStatus() 當場算。 */
const SPORT_TO_CATEGORY = { run: 'running', strength: 'strength', both: 'consistency' };

export const PERMANENT_CHALLENGES = PERMANENT_AXES.map((axis) => {
    const first = axis.steps[0];
    const last = axis.steps[axis.steps.length - 1];
    const range = axis.steps.length > 1
        ? `${formatTarget(axis, first.target)} → ${formatTarget(axis, last.target)} ${axis.unit}`
        : `${formatTarget(axis, first.target)} ${axis.unit}`;
    return {
        id: axis.id,
        axisId: axis.id,
        titleZh: axis.label,
        titleEn: axis.en.toUpperCase(),
        desc: axis.blurb,
        goal: axis.steps.length > 1 ? `${range} · ${axis.steps.length} 階` : range,
        icon: '',
        category: SPORT_TO_CATEGORY[axis.sport] || 'consistency',
        field: axis.field,
        unit: axis.unit,
        resets: axis.resets,
        lowerIsBetter: !!axis.lowerIsBetter,
        tierCount: axis.steps.length,
        tiers: axis.steps.map((st) => ({ target: st.target, name: st.name, badgeId: st.asset })),
        rewards: axis.steps.map((st) => st.name),
    };
});


/* ═══ MEMBER ROLES ═══ */
/* ═══ 社團角色 —— 只有兩層：管理層 vs 一般成員 ═══
 *
 * 原本有四階（社長 / 管理員 / 版主 / 成員）。「版主」的權限是管理員的子集、
 * 又沒有任何畫面說得出它跟管理員差在哪，只是把「誰是管理層」這條線弄糊。
 * 收成三個角色、兩個層級：社長與管理員同屬管理層，其餘都是成員。
 *
 * `tier` 是給 UI 分組用的；`can` 是給人看的白話說明（權限要講得出來，
 * 不能只有一個 permissions 陣列讓使用者自己猜）。
 */
export const MEMBER_ROLES = [
    {
        id: 'leader', label: '社長', tier: 'staff', color: '#D4A843',
        permissions: ['all'],
        summary: '社團的擁有者，只有一位',
        can: ['審核加入申請', '指派／移除管理員', '編輯社團資料與封面', '發布公告', '開啟每月挑戰', '移除成員', '解散社團'],
    },
    {
        id: 'admin', label: '管理員', tier: 'staff', color: '#6BAACC',
        permissions: ['approve', 'post_announcement', 'create_event', 'create_challenge', 'kick'],
        summary: '社長指派，幫忙管社團',
        can: ['審核加入申請', '發布公告', '開啟每月挑戰', '發起活動', '移除成員'],
        cannot: ['指派或移除管理員', '解散社團'],
    },
    {
        id: 'member', label: '成員', tier: 'member', color: '#8B7355',
        permissions: ['post', 'chat', 'rsvp'],
        summary: '社團的一般成員',
        can: ['在討論區發言', '發起投票', '揪團一起練', '參加活動與挑戰', '查看動態與排行', '隨時退出社團'],
        cannot: ['審核加入申請', '發布公告', '開啟挑戰', '移除成員'],
    },
];

/** 兩個層級的說明（權限頁分組用）。 */
export const ROLE_TIERS = [
    { id: 'staff', label: '管理層', desc: '負責讓社團運作：審核、公告、挑戰、成員管理' },
    { id: 'member', label: '一般成員', desc: '社團的主體：交流、揪團、參加' },
];

/** 舊資料可能還存著 'moderator' → 一律視為管理員（權限最接近）。 */
export const normalizeRoleId = (roleId) => (roleId === 'moderator' ? 'admin' : (roleId || 'member'));

export const isStaff = (roleId) => getRoleInfo(roleId)?.tier === 'staff';

export const getRoleInfo = (roleId) =>
    MEMBER_ROLES.find(r => r.id === normalizeRoleId(roleId)) || MEMBER_ROLES[2];
export const hasPermission = (roleId, perm) => {
    const role = getRoleInfo(roleId);
    return role?.permissions.includes('all') || role?.permissions.includes(perm);
};

/* ═══ LEVEL REQUIREMENTS (取代 XP_FORMULA) ═══ */
export const LEVEL_REQUIREMENTS = {
    conditionA: {
        title: '條件 A：虛擬遠征',
        desc: '完成指定數量的史詩遠征，目標隨人數自動縮放',
        icon: '',
        rules: [
            { level: 'Bronze  Silver', requirement: '完成 2 趟遠征' },
            { level: 'Silver  Gold', requirement: '完成 3 趟遠征' },
            { level: 'Gold  Platinum', requirement: '完成 5 趟遠征' },
            { level: 'Platinum  Diamond', requirement: '完成 8 趟遠征' },
        ]
    },
    conditionB: {
        title: '條件 B：穩定活躍',
        desc: '累積足夠的「滿載活躍週」（≥30% 成員運動 = 1 週）',
        icon: '',
        rules: [
            { level: 'Bronze  Silver', requirement: '3 個活躍週' },
            { level: 'Silver  Gold', requirement: '4 個活躍週' },
            { level: 'Gold  Platinum', requirement: '6 個活躍週' },
            { level: 'Platinum  Diamond', requirement: '10 個活躍週' },
        ]
    }
};

/* XP_FORMULA 已被 LEVEL_REQUIREMENTS 取代 — 保留空殼避免 import 報錯 */
export const XP_FORMULA = {
    run: { title: '跑步社團升級條件', rules: LEVEL_REQUIREMENTS.conditionA.rules.map(r => ({ action: r.level, xp: r.requirement })) },
    strength: { title: '健身社團升級條件', rules: LEVEL_REQUIREMENTS.conditionA.rules.map(r => ({ action: r.level, xp: r.requirement })) },
};

/* ═══════════════════════════════════════════════════════════════
   每週共振與活力系統 (Weekly Vibe & Resonance System)
   ═══════════════════════════════════════════════════════════════ */

// VIBE_TIERS moved to top.


const getWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
};

export const checkWeeklyReset = (club) => {
    const weekStart = getWeekStart();
    if (!club.weeklyResetDate || club.weeklyResetDate < weekStart) {
        const prevTier = club.vibeTier || 'bronze';
        const prevWeek = club.weeklyResetDate ? toLocalDateKey(new Date(club.weeklyResetDate)) : 'unknown';
        const history = club.vibeHistory || [];
        if (club.weeklyResetDate) { history.push({ week: prevWeek, tier: prevTier }); if (history.length > 12) history.shift(); }
        return { ...club, weeklyContributions: {}, weeklyResetDate: weekStart, vibeTier: 'bronze', vibeHistory: history };
    }
    return club;
};

export const getWeeklyVibeData = (club) => {
    const contributions = club.weeklyContributions || {};
    const activeCount = Object.values(contributions).filter(Boolean).length;
    const totalMembers = Math.max(club.members || 1, 1);
    const activeRate = activeCount / totalMembers;
    const tier = getVibeTier(activeRate, activeCount);
    const tierIdx = VIBE_TIERS.findIndex(t => t.id === tier.id);
    const nextTier = VIBE_TIERS[tierIdx + 1] || null;
    const membersNeeded = nextTier ? Math.max(0, vibeTierNeed(nextTier, totalMembers) - activeCount) : 0;
    // 下一階要的人數比社團總人數還多 → 光靠大家都練也上不去，要先招人
    const needsMoreMembers = !!nextTier && (nextTier.minActive || 0) > totalMembers;
    return { tier, activeRate, activeCount, totalMembers, activePercent: Math.round(activeRate * 100), membersNeeded, needsMoreMembers, nextTier, contributions, history: club.vibeHistory || [] };
};

export const recordMemberActivity = (club, memberId) => {
    const updated = checkWeeklyReset(club);
    const contributions = { ...(updated.weeklyContributions || {}) };
    if (contributions[memberId]) return updated;
    contributions[memberId] = true;
    const totalMembers = Math.max(updated.members || 1, 1);
    const activeCount = Object.values(contributions).filter(Boolean).length;
    const activeRate = activeCount / totalMembers;
    const tier = getVibeTier(activeRate, activeCount);
    return { ...updated, weeklyContributions: contributions, vibeTier: tier.id };
};

/* ══════════════════════════════════════════════════════════════════════════
 * ⏱️ 挑戰的時間窗 —— 這是整個任務系統最關鍵的一件事
 * ══════════════════════════════════════════════════════════════════════════
 * 稽核前所有進度都只統計「本週（一～日）」，卻拿去比對 30 天／90 天的目標：
 * 「本月 100 公里」實際上是拿這週的里程去比整月目標，等於永遠不可能達成。
 *
 * 現在窗口跟著挑戰自己的期間走，而且對齊日曆邊界（不是往回推 N 天），
 * 這樣才跟展示櫃以「月」去重的邏輯一致：
 *     7 天   → 本週（週一 00:00 ～ 週日 23:59）
 *     30 天  → 本月 1 號 ～ 月底
 *     90 天  → 本季第一天 ～ 季末
 */
export const challengeWindow = (challenge, now = new Date()) => {
    const days = parseInt(String(challenge?.duration || '').replace(/[^0-9]/g, ''), 10);
    const d = Number.isFinite(days) ? days : 7;
    if (d <= 7) {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const from = new Date(now); from.setDate(diff); from.setHours(0, 0, 0, 0);
        const to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999);
        return { from, to, span: 'week' };
    }
    if (d <= 31) {
        const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { from, to, span: 'month' };
    }
    const qFirst = Math.floor(now.getMonth() / 3) * 3;
    const from = new Date(now.getFullYear(), qFirst, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), qFirst + 3, 0, 23, 59, 59, 999);
    return { from, to, span: 'quarter' };
};

/** 本週的窗（維持舊呼叫端的預設行為）。 */
const thisWeekWindow = (now = new Date()) => challengeWindow({ duration: '7天' }, now);

const BIG_THREE = [
    { key: 'squat', match: /深蹲|squat/i },
    { key: 'bench', match: /臥推|bench/i },
    { key: 'deadlift', match: /硬舉|硬拉|deadlift/i },
];

const _readRuns = (userId) => {
    let arr = [];
    try {
        const wlog = JSON.parse(localStorage.getItem('weeklyCardioLog') || '{}');
        if (Array.isArray(wlog.sessions)) arr = wlog.sessions;
    } catch { /* ignore */ }
    if (!arr.length) {
        try { arr = uStorage(userId).get('cardio_sessions', []) || []; } catch { arr = []; }
    }
    return Array.isArray(arr) ? arr : [];
};

const _readLifts = (userId) => {
    try {
        const raw = localStorage.getItem('workout_history');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
};

const _dateOf = (x) => new Date(
    x?.date || x?.completedAt || x?.timestamp || x?.ts || x?.startTime || x?.created_at || 0
);
const _setsOf = (w) => {
    const out = [];
    (w?.exercises || w?.completedExercises || []).forEach((ex) => {
        const name = String(ex?.name || ex?.exercise || '');
        (ex?.sets || ex?.completedSets || []).forEach((st) => {
            out.push({ name, reps: parseFloat(st?.reps || 0), weight: parseFloat(st?.weight || 0) });
        });
    });
    return out;
};

/**
 * 某位成員在指定時間窗內的真實運動數據。
 * @param {string} memberId
 * @param {{from:Date,to:Date}} [window] 預設本週
 */
export const getWorkoutDataForMember = (memberId, window) => {
    const w = window && window.from instanceof Date ? window : thisWeekWindow();
    const inWin = (v) => { const d = _dateOf({ date: v }); return d >= w.from && d <= w.to; };
    const isMe = memberId === getUserId();
    const empty = {
        hasValidWorkout: false, strengthSessions: 0, cardioSessions: 0,
        totalDistKm: 0, totalVolume: 0, totalDurationMin: 0,
        totalElevM: 0, runPRs: 0, liftPRs: 0, bigLifts: 0,
    };
    if (!isMe) return empty;   // 其他成員的紀錄前端拿不到

    const allRuns = _readRuns(memberId);
    const allLifts = _readLifts(memberId);
    const runs = allRuns.filter((s) => inWin(s.ts || s.date || s.timestamp || s.startTime));
    const lifts = allLifts.filter((x) => inWin(x.date || x.completedAt || x.timestamp));

    const totalDistKm = runs.reduce((sum, s) => {
        const raw = parseFloat(s.distance || s.distanceKm || s.km || 0);
        // distance 有時是公尺（> 1000 幾乎不可能是公里）
        return sum + (raw > 1000 ? raw / 1000 : raw);
    }, 0);
    const totalElevM = runs.reduce((sum, s) => sum + Math.max(0, parseFloat(
        s.elevationGain ?? s.elevation_gain ?? s.metrics?.elevationGain
        ?? s.stats?.elevationGain ?? s.elevation ?? 0
    ) || 0), 0);
    const totalVolume = lifts.reduce((sum, w2) =>
        sum + _setsOf(w2).reduce((v, st) => v + (st.reps * st.weight || 0), 0), 0);
    const totalDurationMin = runs.reduce((sum, s) => sum + parseFloat(
        s.duration || s.durationMin || (s.durationSec || 0) / 60 || 0
    ), 0) + lifts.length * 45;

    /* 跑步 PB：buildPRTimeline 只在「刷新紀錄」時才推一筆，
       所以窗內的筆數就是這段期間破了幾項紀錄。 */
    let runPRs = 0;
    try {
        const tl = buildPRTimeline(allRuns) || {};
        Object.values(tl).forEach((list) => {
            (list || []).forEach((e) => { if (inWin(e.date)) runPRs += 1; });
        });
    } catch { /* ignore */ }

    /* 重訓 PB：逐動作比「窗內最佳 e1RM」與「窗前最佳 e1RM」，高過才算破。 */
    let liftPRs = 0;
    try {
        const before = {}, within = {};
        allLifts.forEach((w2) => {
            const t = _dateOf(w2);
            const bucket = t < w.from ? before : (t <= w.to ? within : null);
            if (!bucket) return;
            _setsOf(w2).forEach((st) => {
                if (!(st.weight > 0) || !(st.reps > 0)) return;
                const e = epleyE1RMStrict(st.weight, st.reps);
                if (!(e > 0)) return;
                const k = st.name.trim().toLowerCase();
                if (!k) return;
                if (!(bucket[k] >= e)) bucket[k] = e;
            });
        });
        Object.entries(within).forEach(([k, e]) => { if (e > (before[k] || 0)) liftPRs += 1; });
    } catch { /* ignore */ }

    // 夜跑：19:00 之後開始的跑步（文案寫夜跑就要真的只算夜跑）
    const nightRuns = runs.filter((sx) => {
        const h = _dateOf({ date: sx.ts || sx.date || sx.timestamp || sx.startTime }).getHours();
        return h >= 19 || h < 4;
    }).length;

    // 團練：存檔時偵測到有同行夥伴的那幾場
    let buddySessions = 0;
    try {
        const map = JSON.parse(localStorage.getItem('drvn_session_companions') || '{}');
        buddySessions = Object.entries(map).filter(([k, arr]) =>
            Array.isArray(arr) && arr.length > 0 && inWin(k)
        ).length;
    } catch { /* ignore */ }

    // 三大項：窗內練到幾個不同的大項
    const hit = new Set();
    lifts.forEach((w2) => _setsOf(w2).forEach((st) => {
        BIG_THREE.forEach((b) => { if (b.match.test(st.name)) hit.add(b.key); });
    }));

    return {
        hasValidWorkout: lifts.length > 0 || totalDistKm >= 2 || totalDurationMin >= 30,
        strengthSessions: lifts.length,
        cardioSessions: runs.length,
        totalDistKm: Math.round(totalDistKm * 100) / 100,
        totalVolume: Math.round(totalVolume),
        totalDurationMin: Math.round(totalDurationMin),
        totalElevM: Math.round(totalElevM),
        runPRs, liftPRs, bigLifts: hit.size, nightRuns, buddySessions,
    };
};

/**
 * 依「app 真正能記錄的運動資料」換算挑戰進度。
 * 時間窗由挑戰自己的 duration 決定（見 challengeWindow），
 * 所以 30 天的挑戰比的是整個月、90 天的比整季 —— 不再拿本週去比整月。
 * 每一個上架的單位都要在這裡有對應分支；回 null 代表「這個單位追蹤不到」，
 * 那種挑戰不該上架（見 CLUB_CHALLENGES 的自檢）。
 */
export const getRecordedChallengeProgress = (challenge, userId) => {
    if (!challenge) return null;
    const d = getWorkoutDataForMember(userId, challengeWindow(challenge));
    switch (challenge.unit) {
        case 'km': return d.totalDistKm;
        case 'm': return d.totalElevM;
        case 'hr': return Math.round((d.totalDurationMin / 60) * 10) / 10;
        case '分鐘': return d.totalDurationMin;
        case '人次':
        case '次': return d.cardioSessions + d.strengthSessions;
        case 'kg': return d.totalVolume;
        case 'PB': return d.runPRs;
        case '1RM': return d.liftPRs;
        case '大項': return d.bigLifts;
        case '夜跑': return d.nightRuns;
        case '團練': return d.buddySessions;
        default: return null;
    }
};

/** 這個單位追蹤得到嗎？上架前自檢用。 */
export const TRACKABLE_UNITS = ['km', 'm', 'hr', '分鐘', '人次', '次', 'kg', 'PB', '1RM', '大項', '夜跑', '團練'];

/* ═══ 連續打卡 STREAK（個人 × 社團，以週為單位）═══
   以「週一為一週起點」計算。使用者本週留下有效運動 → 該週標記達標；
   若上週也達標則連續週數 +1，中斷則歸 1。資料存本機，供 M2 連續打卡視覺使用。*/
const _weekKeyFor = (date) => {
    const now = new Date(date);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now); monday.setDate(diff); monday.setHours(0, 0, 0, 0);
    return toLocalDateKey(monday);
};
export const getCurrentWeekKey = () => _weekKeyFor(new Date());
export const getPrevWeekKey = () => { const d = new Date(); d.setDate(d.getDate() - 7); return _weekKeyFor(d); };

const _streakKey = (clubId, userId) => `drvn_streak_${clubId}_${userId}`;

export const getMemberStreak = (clubId, userId) => {
    try {
        const raw = localStorage.getItem(_streakKey(clubId, userId));
        const s = raw ? JSON.parse(raw) : { lastWeek: null, count: 0 };
        const cur = getCurrentWeekKey(), prev = getPrevWeekKey();
        // 連續只在「本週或上週」有達標時仍存活；否則視為中斷
        let count = s.count || 0;
        if (s.lastWeek !== cur && s.lastWeek !== prev) count = 0;
        return { count, thisWeekDone: s.lastWeek === cur };
    } catch { return { count: 0, thisWeekDone: false }; }
};

export const bumpMemberStreak = (clubId, userId) => {
    try {
        const key = _streakKey(clubId, userId);
        const raw = localStorage.getItem(key);
        const s = raw ? JSON.parse(raw) : { lastWeek: null, count: 0 };
        const cur = getCurrentWeekKey(), prev = getPrevWeekKey();
        if (s.lastWeek === cur) return { count: s.count || 1, thisWeekDone: true }; // 本週已計過
        const count = s.lastWeek === prev ? (s.count || 0) + 1 : 1;
        localStorage.setItem(key, JSON.stringify({ lastWeek: cur, count }));
        return { count, thisWeekDone: true };
    } catch { return { count: 1, thisWeekDone: true }; }
};

/* ═══ RANKING HELPERS ═══ */
export const buildMyRankingEntry = (userId, type, periodDays = 30) => {
    const profile = getSocialProfile(userId);
    return { user_id: userId, user_name: profile.displayName || '我', avatar: '我', city: profile.city || '', xp_level: 0, score: 0, monthly_distance: 0, monthly_volume: 0 };
};


/* ══════════════════════════════════════════════════════════════════════════
 * 🏺 社團成就統計 — 給 growthAchievements 的 'squad' 分類用
 * ══════════════════════════════════════════════════════════════════════════
 * 使用者原話：「都已經加入社團了怎麼還會有『加入第一個社團』啦，
 *              我覺得這邊就是用只有在社團可以獲得的獎章去做」。
 *
 * 兩個問題一起修：
 *   1. 「加入社團」這種一進來就必然成立的事不該是成就 —— 改成
 *      「只有在社團裡才做得到」的四件事（一起練 / 連續出力 / 完成社團任務）。
 *   2. 舊的 squadCount 讀的是 K.membership，但社團頁加入時寫的是 K.clubsUser，
 *      兩個 store 對不起來 → 明明已加入卻顯示 0%。這裡以「實際的社團清單」為準。
 *
 * 全部只用本機已存在的真實紀錄，算不出來就回 0，不猜。
 */
/**
 * 每一筆社團固定挑戰各自完成過幾次（跨所有已加入的社團加總）。
 * @returns {{[configId: string]: number}} 例如 { rc4: 3, sc1: 1 }
 *
 * 為什麼要分開算：成就頁的社團徽章從「四個通用徽章」改成
 * 「每一筆任務各自升階」（完成 1／3／6／12 個月 → 銅／銀／金／鉑金），
 * 需要的是每筆任務的次數，不是 getSquadAchievementStats 的總和。
 *
 * 真相源同樣是展示櫃 trophyCabinet（以月份去重、永久保存），
 * 再補上「這個月剛達標、還沒被 ensureMonthlyChallenges 寫進展示櫃」的那幾筆 ——
 * 不然剛完成的當下成就頁不會亮，要等換月才補上。
 */
export const getSquadMissionCounts = (uid = getUserId()) => {
    const out = {};
    if (!uid) return out;

    let clubs = [];
    try { clubs = getClubs(uid) || []; } catch { clubs = []; }
    if (!Array.isArray(clubs)) clubs = [];

    const thisMonth = currentMonthKey();
    clubs.forEach((c) => {
        const cabinet = Array.isArray(c?.trophyCabinet) ? c.trophyCabinet : [];
        cabinet.forEach((t) => {
            const cfg = String(t?.configId || t?.badgeId || '');
            if (!cfg) return;
            out[cfg] = (out[cfg] || 0) + Math.max(0, Number(t?.count) || 0);
        });
        // 這個月剛達標、展示櫃還沒收到的
        const recorded = new Set(
            cabinet
                .filter((t) => Array.isArray(t?.months) && t.months.includes(thisMonth))
                .map((t) => String(t.configId || t.badgeId))
        );
        (c.activeChallenges || []).forEach((ch) => {
            try {
                const cfg = String(ch?.configId || ch?.id || '');
                if (!cfg || recorded.has(cfg)) return;
                const target = Number(ch?.target) || 0;
                if (target > 0 && Number(getRecordedChallengeProgress(ch, uid)) >= target) {
                    out[cfg] = (out[cfg] || 0) + 1;
                }
            } catch { /* ignore */ }
        });
    });
    return out;
};

export const getSquadAchievementStats = (uid = getUserId()) => {
    const out = { joinedClubs: 0, streakWeeks: 0, missionsDone: 0, togetherSessions: 0 };
    if (!uid) return out;

    let clubs = [];
    try { clubs = getClubs(uid) || []; } catch { clubs = []; }
    if (!Array.isArray(clubs)) clubs = [];

    // 已加入的社團（以社團頁真正在用的那份清單為準）
    const joined = clubs.filter((c) => c && (
        c.isJoined === true
        || String(c.leader_id || '') === String(uid)
        || (Array.isArray(c.member_list) && c.member_list.some((m) => String(m?.user_id) === String(uid)))
        || (Array.isArray(c.leaderboard) && c.leaderboard.some((m) => String(m?.userId) === String(uid)))
    ));
    out.joinedClubs = joined.length;
    // 舊 membership store 若有值也一併採計（換裝置/舊資料）
    try {
        const legacy = (getSquadMembership(uid) || []).length;
        if (legacy > out.joinedClubs) out.joinedClubs = legacy;
    } catch { /* ignore */ }

    // 連續為社團出力的最長週數（取所有社團中最高的）
    joined.forEach((c) => {
        try {
            const st = getMemberStreak(c.id || c.squad_id, uid);
            if (st && st.count > out.streakWeeks) out.streakWeeks = st.count;
        } catch { /* ignore */ }
    });

    /* 完成的社團任務數。
       以前只看「這個月現在的進度有沒有達標」，所以九月完成、十月一號進度歸零，
       個人成就那枚「任務達成」就跟著掉回 0% —— 已經拿到的徽章會消失。
       展示櫃（trophyCabinet）才是完成紀錄的真相源：它以月份去重、永久保存。
       這裡改成以它為準，再補上「這個月剛達標、但還沒被 ensureMonthlyChallenges
       寫進展示櫃」的那幾筆，所以剛完成的當下就看得到，也不會重複計算。 */
    const thisMonth = currentMonthKey();
    joined.forEach((c) => {
        const cabinet = Array.isArray(c?.trophyCabinet) ? c.trophyCabinet : [];
        // ① 展示櫃裡的歷史完成次數（count = 完成過幾個月）
        cabinet.forEach((t) => { out.missionsDone += Math.max(0, Number(t?.count) || 0); });
        // ② 這個月剛達標、展示櫃還沒收到的
        const recordedThisMonth = new Set(
            cabinet
                .filter((t) => Array.isArray(t?.months) && t.months.includes(thisMonth))
                .map((t) => String(t.configId || t.badgeId))
        );
        (c.activeChallenges || []).forEach((ch) => {
            try {
                const cfg = String(ch?.configId || ch?.id || '');
                if (recordedThisMonth.has(cfg)) return;          // 已經記在展示櫃 → 不重複算
                const prog = getRecordedChallengeProgress(ch, uid);
                const target = Number(ch?.target) || 0;
                if (target > 0 && Number(prog) >= target) out.missionsDone += 1;
            } catch { /* ignore */ }
        });
    });

    // 和夥伴一起練過幾場（存檔時寫進 drvn_session_companions 的真實偵測結果）
    try {
        const map = JSON.parse(localStorage.getItem('drvn_session_companions') || '{}');
        out.togetherSessions = Object.values(map).filter(
            (arr) => Array.isArray(arr) && arr.length > 0
        ).length;
    } catch { /* ignore */ }

    return out;
};


/* ══════════════════════════════════════════════════════════════════════════
 * 🎯 社團任務的兩個層級 —— 社團裡「唯一」的一套進度系統
 * ══════════════════════════════════════════════════════════════════════════
 * 稽核前社團同時有兩套平行進度：總覽的 MISSIONS 和展示庫的社團徽章，
 * 而且其中一個徽章的條件就是「完成 1 個社團任務」—— 同一件事記兩本帳，
 * 使用者看到兩份長得一樣、都是 0% 的清單，當然分不出差別。
 *
 * 現在收斂成一套貨幣（任務），用資料裡本來就有、但 UI 從沒用過的 category 欄位分兩級：
 *
 *   任務 MISSION    短期（7 天）· 低門檻 · 全員一起 → 目的是「把人拉回來」
 *   挑戰 CHALLENGE  長期（30–90 天）· 累積型 · 高門檻 → 目的是「給有企圖心的人一個大目標」
 *
 * 兩級的差別要讓使用者一眼看懂，所以連「為什麼要做」都一起帶出去。
 */
export const CHALLENGE_KINDS = {
    mission: {
        id: 'mission',
        label: '任務',
        en: 'Missions',
        blurb: '短期、大家一起達成 — 留下一筆就算數',
    },
    challenge: {
        id: 'challenge',
        label: '挑戰',
        en: 'Challenges',
        blurb: '長期累積的大目標 — 一個月起跳',
    },
};

/** 一筆任務屬於哪一級。舊資料沒有 category 時，用天數推斷（7 天以內＝任務）。 */
export const challengeKind = (c) => {
    const cat = String(c?.category || '').toLowerCase();
    if (cat === 'mission' || cat === 'challenge') return cat;
    const days = parseInt(String(c?.duration || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(days) && days <= 7 ? 'mission' : 'challenge';
};

/** 把一份任務清單依層級分組，順序固定：先任務、後挑戰。 */
export const groupChallengesByKind = (list = []) => {
    const out = { mission: [], challenge: [] };
    (Array.isArray(list) ? list : []).forEach((c) => { out[challengeKind(c)].push(c); });
    return out;
};

/**
 * 這筆任務完成了沒 —— 以真實運動紀錄為準（沒紀錄就是沒完成，不用存檔值灌水）。
 * @returns {{prog:number, target:number, pct:number, done:boolean}}
 */
export const challengeStatus = (c, userId) => {
    const target = Number(c?.target) || 0;
    const live = getRecordedChallengeProgress(c, userId);
    const prog = live != null ? Math.min(live, target || live) : Number(c?.progress) || 0;
    const pct = target > 0 ? Math.min(100, (prog / target) * 100) : 0;
    return { prog, target, pct, done: target > 0 && prog >= target };
};


/* ══════════════════════════════════════════════════════════════════════════
 * 📅 每月固定挑戰 —— 自動帶入 + 自動累積
 * ══════════════════════════════════════════════════════════════════════════
 * 產品定義：任務是「每月固定」的一組，不是社長每次手動挑。
 * 每個月自動換上同一組挑戰，完成了就自動累積進展示櫃（不用按領取）。
 *
 * ⚠️ 自動累積最容易寫錯的地方是「冪等」：
 *    如果只做 count++，那使用者每重新整理一次、每切一次分頁都會再加一次，
 *    展示櫃上的「完成 8 次」就是假的 —— 而這個數字正是徽章分階的依據。
 *    所以累積的真相源是 `months: ['2026-09', ...]`（完成過哪幾個月），
 *    count 由它推導。同一個月無論被呼叫幾次，結果都一樣。
 */
export const currentMonthKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const MONTH_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

/** 把一筆完成的挑戰記進展示櫃（以 configId 聚合、以月份去重）。 */
const recordCompletion = (cabinet, ch, monthKey) => {
    const cfg = ch.configId || ch.id;
    const list = [...(cabinet || [])];
    const idx = list.findIndex((t) => (t.configId || t.badgeId) === cfg);
    if (idx === -1) {
        list.push({
            configId: cfg,
            badgeId: cfg,
            title: String(ch.title || '').replace(/^(本月|當月|[一二三四五六七八九十]+月)\s*/, ''),
            months: [monthKey],
            count: 1,
            earnedAt: new Date().toISOString(),
        });
        return { list, changed: true };
    }
    const entry = list[idx];
    const months = Array.isArray(entry.months) ? entry.months : [];
    if (months.includes(monthKey)) return { list, changed: false };   // 這個月已經記過 → 不重複加
    const nextMonths = [...months, monthKey];
    /* 舊資料可能只有 count 沒有 months。把「舊制累積了幾次」固定成一個 offset 存起來
       （只算一次），之後 count 就永遠是 offset + months.length ——
       這樣重算幾次都一樣，不會因為反覆呼叫而愈加愈多。 */
    const legacyOffset = Number.isFinite(entry.legacyCount)
        ? entry.legacyCount
        : Math.max(0, (Number(entry.count) || 0) - months.length);
    list[idx] = {
        ...entry,
        months: nextMonths,
        legacyCount: legacyOffset,
        count: legacyOffset + nextMonths.length,
        earnedAt: new Date().toISOString(),
    };
    return { list, changed: true };
};

/**
 * 確保這個社團掛的是「本月」的固定挑戰，並把已完成的自動累積進展示櫃。
 * 純函式：回傳 { club, changed }，changed=false 時呼叫端不必寫回（避免無謂的 re-render）。
 *
 * @param {object} club
 * @param {string} userId 用來算「我」的完成進度
 */
/* ══════════════════════════════════════════════════════════════════════════
 * 每個社團的「固定挑戰」是哪幾個
 * ══════════════════════════════════════════════════════════════════════════
 * 使用者的定義：「任務是固定的，每月都有固定的社團挑戰；展示櫃展現的是
 * 完成這個固定挑戰幾次，就會有特別的社團徽章。」
 *
 * 「固定」有兩層意思，兩層都要成立才會有徽章可以累積：
 *   ① 每個月都會出現   → 換月自動帶入新的一輪（見 ensureMonthlyChallenges）
 *   ② 每個月都是同一個 → 這個社團的固定挑戰不會換題目，
 *                        所以「完成幾次」= 連續幾個月做到（1／3／6／12 個月）
 *
 * ⚠️ 上一版直接把整份 catalog（12 筆）每個月全部掛上去 ——
 *    這正是使用者說的「有點多、不知道在幹嘛」，而且題目每個月都一樣多，
 *    展示櫃會列出 12 個永遠停在 0 的格子。改成每月固定兩筆：一個任務、一個挑戰。
 *
 * 選哪兩筆：社團第一次帶入時決定並存進 club.fixedChallengeIds，之後不再變動。
 * 沒有存過的舊社團 → 用 club.id 算一個穩定的雜湊來挑，不會每次開頁都換一個。
 */
const hashStr = (str) => {
    let h = 0;
    for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) | 0;
    return Math.abs(h);
};

/* ══════════════════════════════════════════════════════════════════════════
 * 社團成員的真實累積 —— 「社團總進度」不能只算我自己
 * ══════════════════════════════════════════════════════════════════════════
 * getWorkoutDataForMember 對「不是我」的成員一律回 0（資料在別人的裝置上，
 * 前端拿不到）。但畫面上寫的是「社團總進度」「全社團本週累積」「排行榜」，
 * 目標又是「每人 × 人數」—— 等於叫一個人扛全團的目標，而且數字是錯的。
 *
 * 正確的來源是後端：GET /api/squads/{id}/activity 會回全體成員的逐場紀錄。
 * 這支把它彙總成「每位成員的累積」。
 *
 * ⚠️ 拿不到就要回 ok:false，讓畫面改口說「只看得到你自己的」——
 *    絕不可以拿我一個人的數字冒充全社團（鐵律：真實數據不造假）。
 */
export async function loadSquadMemberTotals(squadId, { days = 30 } = {}) {
    const empty = { ok: false, days, byUser: {}, total: { distanceKm: 0, volumeKg: 0, sessions: 0, durationMin: 0 }, activeMembers: 0 };
    if (!squadId) return empty;
    try {
        const r = await apiClient.get(`/api/squads/${encodeURIComponent(squadId)}/activity`, {
            params: { days, limit_per_member: 100 },
        });
        const acts = r?.data?.activities;
        if (!Array.isArray(acts)) return empty;

        const byUser = {};
        for (const a of acts) {
            const uid = String(a?.userId || '');
            if (!uid) continue;
            const m = a.metrics || {};
            const row = byUser[uid] || (byUser[uid] = { name: a.name || '成員', distanceKm: 0, volumeKg: 0, sessions: 0, durationMin: 0 });
            row.distanceKm += Number(m.distance) || 0;
            row.volumeKg += Number(m.volume) || 0;
            row.durationMin += (Number(m.duration) || 0) / 60;
            row.sessions += 1;
        }
        const total = { distanceKm: 0, volumeKg: 0, sessions: 0, durationMin: 0 };
        for (const row of Object.values(byUser)) {
            row.distanceKm = Math.round(row.distanceKm * 100) / 100;
            row.volumeKg = Math.round(row.volumeKg);
            row.durationMin = Math.round(row.durationMin);
            total.distanceKm += row.distanceKm;
            total.volumeKg += row.volumeKg;
            total.sessions += row.sessions;
            total.durationMin += row.durationMin;
        }
        total.distanceKm = Math.round(total.distanceKm * 100) / 100;
        return { ok: true, days, byUser, total, activeMembers: Object.keys(byUser).length };
    } catch {
        return empty;
    }
}

/** 一筆挑戰的「全社團進度」——只有在真的讀得到全體資料時才回數字，否則回 null。 */
export const squadChallengeProgress = (challenge, totals) => {
    if (!totals?.ok || !challenge) return null;
    switch (challenge.unit) {
        case 'km': return totals.total.distanceKm;
        case 'kg': return totals.total.volumeKg;
        case '分鐘': return totals.total.durationMin;
        case 'hr': return Math.round((totals.total.durationMin / 60) * 10) / 10;
        case '人次':
        case '次': return totals.total.sessions;
        default: return null;
    }
};

/* ══════════════════════════════════════════════════════════════════════════
 * 開任務的人數門檻
 * ══════════════════════════════════════════════════════════════════════════
 * 社團任務的目標是「每人 × 人數」——一個人的社團開任務，等於自己跟自己比，
 * 進度條永遠是自己推的，也不會有「大家一起達成」的感覺。
 * 人數不到就先不開，並且明確告訴使用者還差幾個人（不是把按鈕變灰而已）。
 */
export const MISSION_MIN_MEMBERS = 3;

/** 這個社團現在能不能開任務。回傳 { ok, members, need, short }。 */
export const checkMissionUnlock = (club) => {
    const members = Math.max(0, Number(club?.members) || (club?.leaderboard || []).length || 0);
    const need = MISSION_MIN_MEMBERS;
    return { ok: members >= need, members, need, short: Math.max(0, need - members) };
};

/* 每個月自動掛幾筆。
   原本是任務 1 筆 ＋ 挑戰 1 筆，而且一旦存進 club.fixedChallengeIds 就永遠不換題目 ——
   23 筆的目錄實際上只有 2 筆在跑，其餘 21 筆要社長手動開。
   現在改成每月輪一組：數量提高，而且題目跟著月份轉，一年下來大部分題目都會輪到。 */
export const MONTHLY_MISSION_SLOTS = 2;
export const MONTHLY_CHALLENGE_SLOTS = 3;

/**
 * 這個社團「這個月」要跑的那幾筆挑戰的 configId。
 * 社團自己的雜湊決定起點（不同社團不會同題），月份決定位移（同社團每月換題）。
 * @param {object} club
 * @param {string} monthKey 'YYYY-MM'，預設本月
 */
export const clubFixedChallengeIds = (club, monthKey = currentMonthKey()) => {
    const catalog = getClubChallenges(club?.type || 'run') || [];
    if (!catalog.length) return [];

    /* 社長手動釘選的那組（club.pinnedChallengeIds）優先，且永遠不輪替。
       舊欄位 fixedChallengeIds 曾被當成「永久凍結」用，這裡不再讀它當快取，
       否則每月輪替會被舊資料卡死。 */
    const pinned = Array.isArray(club?.pinnedChallengeIds) ? club.pinnedChallengeIds : null;
    if (pinned && pinned.length && pinned.every((id) => catalog.some((c) => c.id === id))) return pinned;

    const seed = hashStr(club?.id || club?.name || 'club');
    const [y, m] = String(monthKey).split('-').map(Number);
    const monthIdx = (Number.isFinite(y) && Number.isFinite(m)) ? y * 12 + (m - 1) : 0;

    const take = (kind, n) => {
        const pool = catalog.filter((c) => challengeKind(c) === kind);
        if (!pool.length) return [];
        const out = [];
        for (let i = 0; i < Math.min(n, pool.length); i++) {
            out.push(pool[(seed + monthIdx * n + i) % pool.length].id);
        }
        return [...new Set(out)];
    };
    return [...take('mission', MONTHLY_MISSION_SLOTS), ...take('challenge', MONTHLY_CHALLENGE_SLOTS)];
};

/**
 * 這個社團「本月該掛的固定挑戰」是不是已經缺了。
 * 缺的情況有兩種：名額被調大了，或是社長取消掉其中幾筆之後又換了月。
 * （社長自訂的 custom 挑戰不算在名額內。）
 */
const needsRefill = (club, monthKey = currentMonthKey()) => {
    const want = clubFixedChallengeIds(club, monthKey);
    if (!want.length) return false;
    const have = new Set(
        (club.activeChallenges || [])
            .filter((c) => !c.custom && c.monthKey === monthKey)
            .map((c) => c.configId || c.id)
    );
    return want.some((id) => !have.has(id));
};

export const ensureMonthlyChallenges = (club, userId) => {
    if (!club) return { club, changed: false, newlyCompleted: [] };
    const mk = currentMonthKey();
    const monthZh = MONTH_ZH[new Date().getMonth()];
    let cabinet = club.trophyCabinet || [];
    let changed = false;
    // 這一次「新記到」的完成 —— 呼叫端拿它來慶祝（冪等，所以同一筆只會回報一次）
    const newlyCompleted = [];

    // ① 先結算目前掛著的挑戰：完成的就記進展示櫃（同月冪等）
    (club.activeChallenges || []).forEach((ch) => {
        const target = Number(ch?.target) || 0;
        if (target <= 0) return;
        const live = getRecordedChallengeProgress(ch, userId);
        const prog = live != null ? live : Number(ch.progress) || 0;
        if (prog < target) return;
        // 用這筆挑戰自己的月份記帳（上個月的挑戰就記上個月）
        const r = recordCompletion(cabinet, ch, ch.monthKey || mk);
        cabinet = r.list;
        if (r.changed) {
            changed = true;
            const cfg = ch.configId || ch.id;
            const entry = r.list.find((t) => (t.configId || t.badgeId) === cfg);
            newlyCompleted.push({ title: entry?.title || ch.title, count: entry?.count || 1 });
        }
    });

    /* ② 本月的固定挑戰已經掛好了 → 只回寫展示櫃。
       ⚠️ 不能只比對月份。名額（MONTHLY_MISSION_SLOTS / MONTHLY_CHALLENGE_SLOTS）
          從 1+1 調成 2+3 之後，已經寫過 challengeMonth 的社團會被這個 return
          擋住，整個月都停在舊的兩筆 —— 使用者看到的是「設定改了但沒生效」，
          而且要等下個月才會補上。所以掛著的筆數對不上應掛筆數時要重算。 */
    if (club.challengeMonth === mk && !needsRefill(club, mk)) {
        return changed
            ? { club: { ...club, trophyCabinet: cabinet }, changed: true, newlyCompleted }
            : { club, changed: false, newlyCompleted: [] };
    }

    // ③ 換月：自動帶入這個月的固定那一組（保留社長自訂的挑戰）
    //    人數不到門檻就先不帶 —— 一個人的社團掛著「每人 5 公里 × 1」不是任務。
    if (!checkMissionUnlock(club).ok) {
        return changed
            ? { club: { ...club, trophyCabinet: cabinet }, changed: true, newlyCompleted }
            : { club, changed: false, newlyCompleted: [] };
    }
    //    只帶「這個社團的固定挑戰」，不是整份 catalog ——
    //    每月同一題，完成次數才累積得起來（1 次銅、3 次銀、6 次金、12 次鉑金＝一年）。
    const catalog = getClubChallenges(club.type || 'run') || [];
    const fixedIds = clubFixedChallengeIds(club, mk);   // 用這個月的月份鍵，換月才會換題
    const memberCount = Math.max(Number(club.members) || 1, 1);
    const fixed = catalog.filter((m) => fixedIds.includes(m.id)).map((m) => ({
        id: `m_${mk}_${m.id}`,
        configId: m.id,
        monthKey: mk,
        title: `${monthZh}${m.title}`,
        theme: m.theme,
        desc: m.desc,
        goal: m.goal,
        unit: m.unit,
        duration: m.duration,
        category: m.category,
        color: m.color,
        vibeBoost: m.vibeBoost,
        target: getChallengeTarget(m, memberCount),
        progress: 0,
    }));
    const custom = (club.activeChallenges || []).filter((c) => c.custom);

    return {
        club: { ...club, activeChallenges: [...fixed, ...custom], challengeMonth: mk, fixedChallengeIds: fixedIds, trophyCabinet: cabinet },
        changed: true,
        newlyCompleted,
    };
};


/* ══════════════════════════════════════════════════════════════════════════
 * 🏗️ 建立社團的門檻
 * ══════════════════════════════════════════════════════════════════════════
 * 稽核前：完全沒有任何限制，任何人都能無限開社團。
 *
 * 社團的價值來自「裡面有人」，最該防的是一堆零成員的空社團稀釋搜尋結果。
 * 兩道門檻，各擋一種問題：
 *   實績      有練過才開得了團 —— 擋掉還沒開始用就先開團的空殼
 *   社長上限  同時最多當幾個社團的社長 —— 擋掉一個人開十個團
 *
 * 設計原則：**不是把按鈕變灰就算了**。差多少要講出來，讓人知道怎麼達標
 * （回傳 current / need，UI 直接畫進度）。
 */
export const CLUB_CREATION_RULES = {
    minWorkouts: 10,      // 累積訓練次數（重訓 + 有氧都算）
    minAccountDays: 14,   // 加入 DRVN 的天數
    maxOwned: 2,          // 同時最多當幾個社團的社長
};

/** 累積訓練次數（重訓 + 有氧，全期間不是本週）。 */
const lifetimeWorkoutCount = (uid) => {
    let n = 0;
    try {
        const raw = localStorage.getItem('workout_history');
        if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) n += a.length; }
    } catch { /* 髒資料當作 0，不猜 */ }
    try {
        const a = uStorage(uid).get('cardio_sessions', []) || [];
        if (Array.isArray(a)) n += a.length;
    } catch { /* ignore */ }
    return n;
};

/** 我現在是幾個社團的社長。 */
export const ownedClubCount = (uid = getUserId()) => {
    /* ⚠️ 社長在資料裡有三種寫法，只認一種的話這道門檻會永遠不觸發
       （比沒有門檻更糟：看起來有擋，其實沒擋）：
         leaderId   前端建立時寫的（camelCase）
         leader_id  後端 /api/squads 回來的（snake_case）
         leaderboard 裡 role === 'leader' 的那一筆（舊資料 / 轉讓後） */
    const me = String(uid);
    try {
        return (getClubs(uid) || []).filter((c) => {
            if (!c) return false;
            if (String(c.leaderId) === me || String(c.leader_id) === me) return true;
            return (c.leaderboard || []).some(
                (m) => String(m?.userId) === me && m?.role === 'leader'
            );
        }).length;
    } catch { return 0; }
};

/**
 * 能不能建立社團。
 * @returns {{allowed:boolean, checks:{id,label,current,need,met,hint}[]}}
 */
export const checkClubCreation = (uid = getUserId()) => {
    const R = CLUB_CREATION_RULES;

    const workouts = lifetimeWorkoutCount(uid);

    let days = 0;
    try {
        // 同步讀已落檔的加入日；讀不到就用 0（寧可擋住也不要放行一個算不出來的條件）
        const raw = localStorage.getItem(`drvn_join_date_${uid}`);
        if (raw) {
            const d = new Date(raw);
            if (!isNaN(d)) days = Math.max(1, Math.floor((Date.now() - d.getTime()) / 86400000) + 1);
        }
    } catch { /* ignore */ }

    const owned = ownedClubCount(uid);

    const checks = [
        {
            id: 'workouts', label: '累積訓練次數',
            current: workouts, need: R.minWorkouts,
            met: workouts >= R.minWorkouts,
            hint: '練過才知道自己想找什麼樣的隊友',
        },
        {
            id: 'days', label: '加入 DRVN 天數',
            current: days, need: R.minAccountDays,
            met: days >= R.minAccountDays,
            hint: '先用一陣子，再決定要不要開團',
        },
        {
            id: 'owned', label: '目前擔任社長的社團',
            current: owned, need: R.maxOwned,
            met: owned < R.maxOwned,
            reverse: true,   // 這一項是「不能超過」，UI 要反過來講
            hint: `一個人最多同時經營 ${R.maxOwned} 個社團`,
        },
    ];

    return { allowed: checks.every((c) => c.met), checks };
};
