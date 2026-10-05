/**
 * ══════════════════════════════════════════════════════════════════════════
 * SquadsView — DRVN 社團
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 社團的用處（產品定義 —— 動任何一行之前先讀這段）：
 *
 *   主軸    人。交流、開團、揪活動、互動討論，找到有共同愛好的人。
 *           社團存在的理由是「這裡有跟我練一樣東西的人」，不是「這裡有任務可以刷」。
 *
 *   加分項  任務。每月固定的社團挑戰（不是每次隨機生成，是同一組每月循環）。
 *           它給這群人一個共同的形狀，但沒有它社團依然成立。
 *
 *   加分項  徽章。同一個固定挑戰完成越多次，階級越高
 *           （1 次銅 / 3 次銀 / 6 次金 / 12 次鉑金）。展示櫃只回答這一件事。
 *
 * 這個優先序決定了分頁順序（總覽 → 動態 → 討論 → 排行 → 展示櫃）：
 * 主要的互動場排前面，加分項排後面。改版時不要把任務或徽章往前挪。
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { failureDetail, failureLine } from '../utils/apiFailure';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
// 🎬 互動回饋預設 —— 與飲食系統共用同一份按壓手感（見 utils/nutritionMotion.jsx）
import { pressProps } from '../utils/nutritionMotion';
import {
    Users, ChevronLeft, Plus, X, Check, Crown, Target, Flame, MapPin, Clock, UserPlus,
    Calendar, Camera, Search, ChevronRight, TrendingUp, Award, Lock, Settings, Globe, Info,
    Upload, CornerDownRight, Edit3, Trash2, Trophy, Megaphone
} from 'lucide-react';
import ChallengeIcon, { CHALLENGE_ICONS } from './ui/ChallengeIcon';
import { getClubs, saveClubs, hydrateClubsFromBackend, getClubLevelLegacy, getClubChallenges, getClubFocus, getChallengeTarget, getRecordedChallengeProgress, MEMBER_ROLES, getRoleInfo, hasPermission, XP_FORMULA, LEVEL_REQUIREMENTS, TAG_LIBRARY, LOCATION_AREAS, REGIONS, VIBE_TIERS, getVibeTier, vibeTierNeed, getWeeklyVibeData, recordMemberActivity, checkWeeklyReset, getWorkoutDataForMember, getMemberStreak, bumpMemberStreak, TROPHY_CATALOG, OFFICIAL_EVENTS, ensureMonthlyChallenges, clubFixedChallengeIds, checkMissionUnlock, MISSION_MIN_MEMBERS, loadSquadMemberTotals, squadChallengeProgress, ROLE_TIERS, isStaff, checkClubCreation, CLUB_CREATION_RULES } from '../utils/socialDataConnector';
import { getUserId } from '../utils/auth';
/* 🪪 我在社群裡叫什麼名字 —— 社團的成員、申請、聊天、建立者一律走這支。
   稽核前這些全部寫死 '我'，而且會被送進後端：
   私密社團的加入申請顯示「我」，管理員根本看不出是誰要加入；
   後端的社團成員名字也統統存成「我」。 */
import { getDisplayName } from '../utils/socialIdentity';
import apiClient from '../api/client';
import { mediaUrl } from '../utils/apiHostFix';
import CreateChallengeModal from './CreateChallengeModal';
import { confirmDialog, toast } from '../utils/toast';
import { recordFirst } from '../utils/momentEngine';
// 🏋️ 揪團開課表：一個社團跟同一份課表，看得到彼此的進度
import SquadPlanPanel from './SocialFeed/SquadPlanPanel';
// 🟢 社團動態的真實訓練卡（與最新動態／社群同一張卡）
import ClubActivityFeed from './SocialFeed/ClubActivityFeed';
// 🏅 社團徽章 = 個人成就系統的 'squad' 分類（同一套分級、計入總徽章）
// 🎯 社團唯一的一套進度系統：任務（短期）／挑戰（長期累積）
import { ActiveMissions } from './SocialFeed/ClubMissionList';
// 🏅 展示櫃：完成固定挑戰的累積次數 → 社團徽章（加分項）
import ClubBadgeCabinet from './SocialFeed/ClubBadgeCabinet';
// 💬 社團討論：投票 / 揪團 / 快速反應（不只文字）
import ClubDiscussion from './SocialFeed/ClubDiscussion';
const PortalSheet = ({ children }) => createPortal(<div style={{ position: 'relative', zIndex: 100100 }}>{children}</div>, document.body);

/* Inline fallback — prevents ReferenceError if socialDataConnector hot-reload is delayed */
const APEX_UPGRADE_REQS = {
    C: { name: '潛能', color: '#A0A0A8', bg: 'rgba(0,0,0,0.04)', req: '完成 3 次史詩遠征' },
    B: { name: '卓越', color: '#E8E9E6', bg: 'rgba(0,0,0,0.06)', req: '10 週活躍 + 5 個默契徽章' },
    A: { name: '精英', color: '#D4A843', bg: 'rgba(255,215,0,0.08)', req: '20 週活躍 + 社團等級 5' },
    S: { name: '巔峰', color: '#FF8C00', bg: 'linear-gradient(135deg, #161415, #262523)', req: '完成所有徽章 + 活躍程度 90%', aura: true },
};

const C = {
    text: '#161415',   // Deep Black (極致深黑，用於主要文字與高對比卡片)
    sub: '#8A7E73',   // 暖灰 (次要文字)
    accent: '#F95C4B',   // Coral (珊瑚橘，用於點綴與重要數據)
    ember: '#D94030',   // Ember
    sage: '#5A7A3A',
    gold: '#D4A843',
    paper: '#F6F4F1',   // Paper (米白紙質，全頁背景)
    stone: '#E4DED2',   // Stone (淺灰石材，一般卡片底色)
    pebble: '#CFC6B8',   // Pebble (邊框與分隔線)
    marbleTexture: 'transparent',
};

/* ═══════════════════════════════════════════════════════════════════════
 * 社團封面 —— 系統預設圖庫由後端提供
 * ═══════════════════════════════════════════════════════════════════════
 * 以前這些圖只存在前端 bundle 裡（/desktop/…）。結果是：
 *   · 在別台裝置、別的環境建立的社團，封面路徑對不上就開天窗
 *   · 沒選封面的社團 cover 是 undefined → <img src={undefined}> 什麼都不畫，
 *     只剩底下的漸層（使用者回報：圖六「怎麼沒有圖片」）
 *
 * 現在圖庫放在後端 backend/assets/squad_covers，掛在 /squad-assets。
 * 那個目錄跟著映像檔走（不是 Railway Volume），所以任何環境一開機就有。
 * 前端仍保留 App 內建的同一批當退路 —— 弱網／離線時封面照樣看得到。
 */
/** /squad-assets/… → 後端絕對網址；其他（使用者自己上傳的 dataURL、舊路徑）原樣。
    ⚠️ 一定要走 mediaUrl —— 打包版是用 drvn:// 載入的，
       自己用 window.location.hostname 拼會連到一個不存在的主機，
       而且是靜靜地放不出來（見 utils/apiHostFix.js）。 */
const squadAssetUrl = (u) => (typeof u === 'string' && u.startsWith('/squad-assets/'))
    ? (mediaUrl(u) || u) : u;

/** 後端那張載不到時，退回 App 內建的同一張 */
const BUNDLED_COVER = {
    'squad_running_club_cover.png': '/desktop/squad_running_club_cover.png',
    'squad_running_club_cover_03.png': '/desktop/squad_running_club_cover_03.png',
    'squad_running_club_cover_04.png': '/desktop/squad_running_club_cover_04.png',
    'squad_running_club_cover_05.png': '/desktop/squad_running_club_cover_05.png',
    'squad_running_club_cover_06.png': '/desktop/squad_running_club_cover_06.png',
    'squad_strength_club_cover.png': '/images/swiss_editorial_barbell_1780937208348.png',
};
/** 掛在每一個封面 <img> 上：後端圖失敗 → 換內建那張；內建也失敗就不再重試 */
const onCoverError = (e) => {
    const el = e?.currentTarget;
    if (!el || el.dataset.fellBack === '1') return;
    const file = String(el.src || '').split('/').pop().split('?')[0];
    const local = BUNDLED_COVER[file];
    if (!local) return;
    el.dataset.fellBack = '1';
    el.src = local;
};

const SQUAD_RUN_COVER = '/squad-assets/squad_running_club_cover.png';
const LEGACY_SQUAD_COVERS = new Set([
    'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&q=80',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
    '/desktop/squad_running_club_cover_02.png',
]);
const normalizeSquadCover = (cover) => LEGACY_SQUAD_COVERS.has(cover) ? SQUAD_RUN_COVER : cover;

/* 🩹 cover_02 與 cover.png 是同一場景同一群人的兩個版本 —— 選封面時前兩張看起來一樣，
   使用者會以為自己點錯。拿掉重複的那張，並補一張重訓封面（社團類型現在可以選健身）。 */
const COVERS = [
    SQUAD_RUN_COVER,
    '/squad-assets/squad_running_club_cover_03.png',
    '/squad-assets/squad_running_club_cover_04.png',
    '/squad-assets/squad_running_club_cover_05.png',
    '/squad-assets/squad_running_club_cover_06.png',
    '/squad-assets/squad_strength_club_cover.png',
];

/** 這個社團要畫哪一張封面。**永遠有一張** —— 社團沒有「沒封面」這個狀態。 */
const squadCover = (club) =>
    squadAssetUrl(normalizeSquadCover(club?.cover) || COVERS[0]);

/* ═══════════════════════════════════════════════════════════════════════
 * 社團類型 —— 決定挑戰題庫、主指標，以及畫面上的「稱呼」
 * ═══════════════════════════════════════════════════════════════════════
 * 使用者：「跑步就用跑、健身就用健身的」「社長或管理員也可以改」
 *        「設定那邊要可以更改說要是健身社團還是跑步社團還是混合的」
 *
 * 所以：稱呼跟著類型走（有預設），社長／管理員可以在設定裡改類型，
 *       也可以直接把稱呼改成自己想要的字（memberNoun）。
 */
/* ⚠️ 「混合」在建立精靈裡的 id 是 multisport（TYPE_LABEL_MAP／TYPE_PREFIX_MAP 也是），
   設定頁如果另外叫 mixed，同一種社團就會有兩個名字：用精靈建的社團打開設定會三個都沒選中。
   一律以 multisport 為準，mixed 只當舊資料的別名。 */
const CLUB_TYPES = [
    { id: 'run', label: '跑步社團', sub: '里程・時間・次數', en: 'Running Club', watermark: '跑步', noun: '跑者' },
    { id: 'strength', label: '健身社團', sub: '訓練量・次數', en: 'Strength Club', watermark: '健身', noun: '訓練者' },
    { id: 'multisport', label: '混合社團', sub: '跑步＋健身任務', en: 'Athletics Club', watermark: '混合', noun: '運動員' },
];
const normalizeClubType = (t) => (t === 'mixed' ? 'multisport' : (t || 'multisport'));
/* 卡片上的類型字：跑步／健身／混合 —— 以前卡片寫 RUNNING / LIFTING / MULTI SPORT（§10 英文只留品牌字） */
const clubTypeZh = (t) => (CLUB_TYPES.find((x) => x.id === normalizeClubType(t))?.label || '社團').replace('社團', '');

/* 後端社團 → 探索頁卡片需要的形狀。
   探索頁原本只 filter 本機的 clubs（＝我自己已經有的），所以「搜尋公開社團」
   永遠搜不到任何別人的社團，空狀態出不去。後端 GET /api/squads/ 本來就支援
   search / privacy / type，只是前端從來沒呼叫過。 */
const toDiscoverClub = (sq) => ({
    id: `c_${sq.id}`,
    squadId: sq.id,
    name: sq.name || '未命名社團',
    type: normalizeClubType(sq.type),
    desc: sq.description || '',
    avatar: sq.avatar || null,
    cover: sq.cover_url || COVERS[0],
    location: sq.location || '',
    isPublic: (sq.privacy || 'public') === 'public',
    members: sq.members || (sq.member_list || []).length || 1,
    isJoined: false,
    leaderId: sq.leader_id,
    leaderName: sq.leader_name || '',
    leaderboard: (sq.member_list || []).map((m) => ({
        userId: m.user_id, name: m.name, avatar: m.avatar, role: m.role || 'member',
        distance: 0, volume: 0, runs: 0, sessions: 0,
    })),
    pendingApprovals: sq.pending_approvals || [],
    weeklyContributions: sq.weekly_contributions || {},
    activeChallenges: [], customChallenges: [], chat: [], feed: [], trophyCabinet: [],
    _remote: true,
});
const clubTypeMeta = (t) => CLUB_TYPES.find((x) => x.id === normalizeClubType(t)) || CLUB_TYPES[2];

/** 置頂公告的常用格式 —— 面對空白框最難的是「要寫什麼」。 */
const ANNOUNCEMENT_MAX = 200;
/** 公告的相對時間：太舊的公告要看得出來已經舊了。 */
const announceAgo = (iso) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} 小時前`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(t).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
};
const ANNOUNCEMENT_TEMPLATES = [
    { label: '本週團練', text: '本週日 06:00 河濱公園集合，10K 團練。\n配速分兩組：6:00／7:00。雨天改期，前一晚在討論區公布。' },
    { label: '賽事提醒', text: '報名提醒：XX 路跑 3/31 截止。\n有要一起報的在討論區留言，可以揪同一波出發時間。' },
    { label: '新成員歡迎', text: '歡迎新加入的夥伴！\n先到「總覽」看本月固定挑戰，留下第一筆貢獻；有問題直接在討論區問。' },
    { label: '社團規則', text: '社團規則：\n1. 尊重每個人的配速與程度\n2. 揪團請準時，不能到請提前說\n3. 討論區只聊訓練相關' },
    { label: '本月目標', text: '本月目標：全社累積達成固定挑戰。\n每個人留一筆就算數，展示櫃的階級會跟著往上。' },
];
/** 這個社團怎麼稱呼成員：社長自訂優先，否則用類型的預設。 */
const memberNoun = (club) => String(club?.memberNoun || '').trim() || clubTypeMeta(club?.type).noun;
const AVATARS = ['🏃', '🏋️', '💪', '🔥', '⚡', '🌟', '🌿', '💥', '🦁', '🎯', '🏆', '🚀'];

const MOCK_CLUBS = [
    {
        id: 'c1', name: 'Diamond 共振 (80%+)', type: 'run',
        privacy: 'public',
        cover: COVERS[0], avatar: '💎', customAvatar: null, location: '台北市', members: 156,
        isJoined: true, desc: '【展示：Diamond 共振】超過 80% 活躍度。波浪將充滿並漸變為深邃紫色。',
        announcement: '📌 這是 Diamond 等級的展示社團。',
        level: 5, xp: 15600, leaderId: getUserId(), leaderName: '我', completedExpeditions: 12, activeWeeks: 25,
        weeklyContributions: Array.from({ length: 85 }).reduce((acc, _, i) => ({ ...acc, ['u' + i]: true }), { [getUserId()]: true }),
        vibeTier: 'diamond', vibeHistory: [], feed: [], events: [],
        leaderboard: [
            { userId: getUserId(), name: '我', avatar: '🏃', distance: 45000, runs: 5, role: 'leader' },
            { userId: 'u_sarah', name: 'Sarah', avatar: '🌟', distance: 38000, runs: 6, role: 'admin' },
            { userId: 'u_david', name: 'David', avatar: '🦁', distance: 22000, runs: 4, role: 'moderator' },
            { userId: 'u_mike', name: 'Mike', avatar: '💪', distance: 18000, runs: 4, role: 'member' },
            { userId: 'u_emily', name: 'Emily', avatar: '🔥', distance: 15000, runs: 3, role: 'member' },
            { userId: 'u_amy', name: 'Amy', avatar: '🧘', distance: 12000, runs: 2, role: 'member' },
        ],
        lastWeekLeaderboard: [
            { userId: 'u_sarah', name: 'Sarah', avatar: '🌟', distance: 52000 },
            { userId: getUserId(), name: '我', avatar: '🏃', distance: 41000 },
            { userId: 'u_david', name: 'David', avatar: '🦁', distance: 28000 },
        ],
        activeChallenges: [
            { id: 'ch1', type: 'expedition', title: '晨鳥行動', theme: 'Morning Bird', icon: '🌅', desc: '連續早晨 6 點前運動打卡', progress: 28, target: 50, unit: '人次', duration: 7, contributors: [getUserId(), 'u_sarah', 'u_david'], vibeBoost: 15, badge: '🌅', color: '#D4A843' },
            { id: 'ch2', type: 'sync', title: '燃脂突擊', theme: 'Fat Burn Hero', icon: '🔥', desc: '全體累積燃燒 50,000 大卡', progress: 7500, target: 50000, unit: 'kcal', duration: 14, contributors: ['u_mike', 'u_emily', 'u_amy'], vibeBoost: 20, badge: '🔥', color: '#E67E51' },
            { id: 'ch3', type: 'popup', title: '週末巡航', theme: 'Weekend Cruise', icon: '🚴', desc: '週末單車繞行 100 公里', progress: 85, target: 100, unit: 'km', duration: 2, contributors: [getUserId(), 'u_sarah'], vibeBoost: 5, badge: '🚴', color: '#4898C0' },
            { id: 'ch4', type: 'expedition', title: '核心靜心', theme: 'Core Zen', icon: '🧘', desc: '全員累積完成 100 小時瑜珈/核心', progress: 100, target: 100, unit: 'hr', duration: 30, contributors: ['u_amy', 'u_sarah', getUserId(), 'u_emily'], vibeBoost: 30, badge: '🧘', color: '#3DB87A' },
            { id: 'ch5', type: 'sync', title: '極光探索', theme: 'Aurora Hunt', icon: '🌌', desc: '全體累積夜跑 500 公里', progress: 420, target: 500, unit: 'km', duration: 21, contributors: [getUserId(), 'u_mike'], vibeBoost: 25, badge: '🌌', color: '#A78BCC' },
        ],
        customChallenges: [],
        chat: [
            { id: 101, userId: 'u_sarah', name: 'Sarah', avatar: '🌟', text: '大家今天有去運動嗎？', time: '14:20' },
            { id: 102, userId: 'u_amy', name: 'Amy', avatar: '🧘', text: '剛做完 1 小時瑜珈，身心舒暢 🌿', time: '14:25' },
            { id: 103, userId: 'u_mike', name: 'Mike', avatar: '💪', text: '強喔！我等下要去跑 5K', time: '14:26' },
            { id: 104, userId: getUserId(), name: '我', avatar: '🏃', text: '我也想去，幾點集合？', time: '14:30' },
            { id: 105, userId: 'u_mike', name: 'Mike', avatar: '💪', text: '16:00 老地方見！', time: '14:32' },
            { id: 106, userId: getUserId(), name: '我', avatar: '🏃', text: '加一！我也去', time: '14:35' },
        ],
        pendingApprovals: [],
        trophyCabinet: [
            { badgeId: 'col_pulse', icon: '🕯️', title: '微弱脈搏' },
            { badgeId: 'col_sync', icon: '🌊', title: '潮汐同頻' },
            { badgeId: 'col_vibe', icon: '淵', title: '靜水深流' },
            { badgeId: 'col_matrix', icon: '🌖', title: '矩陣覺醒' },
            { badgeId: 'col_gravity', icon: '🪐', title: '引力牽引' },
            { badgeId: 'col_photo', icon: '🎞️', title: '光合作用' },
            { badgeId: 'col_year', icon: '🕰️', title: '歲月沉積' },
            { badgeId: 'run_dawn', icon: '🥛', title: '白晝序章' },
            { badgeId: 'run_stealth', icon: '🎞️', title: '城市暗房' },
            { badgeId: 'run_crust', icon: '🖋️', title: '步態策展' },
            { badgeId: 'run_meridian', icon: '🧭', title: '流動座標' },
            { badgeId: 'run_altitude', icon: '⛰️', title: '海拔輪廓' },
            { badgeId: 'run_uniform', icon: '〰️', title: '同頻對白' },
            { badgeId: 'run_epic', icon: '📖', title: '長篇敘事' },
            { badgeId: 'run_perpetual', icon: '☕', title: '恆定日常' },
            { badgeId: 'str_rupture', icon: '🪵', title: '留白的張力' },
            { badgeId: 'str_conservation', icon: '⚖️', title: '重力美學' },
            { badgeId: 'str_defy', icon: '🪨', title: '密度的詩意' },
            { badgeId: 'str_forge', icon: '🕯️', title: '鍛造儀式' },
            { badgeId: 'str_structure', icon: '📐', title: '骨架重構' },
            { badgeId: 'str_peak', icon: '✨', title: '臨界微光' },
            { badgeId: 'str_time', icon: '⏳', title: '沉浸法則' },
            { badgeId: 'str_growth', icon: '🪴', title: '有機擴張' }
        ]
    },
    {
        id: 'c2', name: 'Gold 熱絡 (50-79%)', type: 'strength',
        privacy: 'public',
        cover: COVERS[1], avatar: '🥇', customAvatar: null, location: '台中市', members: 100,
        isJoined: true, desc: '【展示：Gold 熱絡】介於 50% 到 79% 活躍度。波浪為金色。',
        announcement: '📌 這是 Gold 等級的展示社團。',
        level: 3, xp: 8400, leaderId: getUserId(), leaderName: '我', completedExpeditions: 5, activeWeeks: 12,
        weeklyContributions: Array.from({ length: 65 }).reduce((acc, _, i) => ({ ...acc, ['u' + i]: true }), { [getUserId()]: true }),
        vibeTier: 'gold', vibeHistory: [], feed: [], events: [],
        leaderboard: [{ userId: getUserId(), name: '我', avatar: '🏋️', volume: 15000, sessions: 4, role: 'leader' }],
        chat: [
            { id: 201, userId: 'u_mike', name: 'Mike', avatar: '💪', text: '有人要練腿嗎？', time: '09:00' },
            { id: 202, userId: getUserId(), name: '我', avatar: '🏋️', text: '我可以，但我 10 點才行', time: '09:05' },
        ],
        lastWeekLeaderboard: [],
        activeChallenges: [], customChallenges: [], pendingApprovals: [], trophyCabinet: []
    },
    {
        id: 'c3', name: 'Silver 起步 (20-49%)', type: 'run',
        privacy: 'public',
        cover: COVERS[2], avatar: '🥈', customAvatar: null, location: '高雄市', members: 100,
        isJoined: true, desc: '【展示：Silver 起步】介於 20% 到 49% 活躍度。波浪為銀灰色。',
        announcement: '📌 這是 Silver 等級的展示社團。',
        level: 2, xp: 3200, leaderId: getUserId(), leaderName: '我', completedExpeditions: 2, activeWeeks: 4,
        weeklyContributions: Array.from({ length: 35 }).reduce((acc, _, i) => ({ ...acc, ['u' + i]: true }), { [getUserId()]: true }),
        vibeTier: 'silver', vibeHistory: [], feed: [], events: [],
        leaderboard: [{ userId: getUserId(), name: '我', avatar: '🏃', distance: 20, runs: 2, role: 'leader' }],
        lastWeekLeaderboard: [],
        activeChallenges: [], customChallenges: [], chat: [], pendingApprovals: [], trophyCabinet: []
    },
    {
        id: 'c4', name: 'Bronze 寧靜 (0-19%)', type: 'strength',
        privacy: 'public',
        cover: COVERS[3], avatar: '🥉', customAvatar: null, location: '新竹市', members: 100,
        isJoined: true, desc: '【展示：Bronze 寧靜】低於 20% 活躍度。波浪為古銅色。',
        announcement: '📌 這是 Bronze 等級的展示社團。',
        level: 1, xp: 950, leaderId: getUserId(), leaderName: '我', completedExpeditions: 0, activeWeeks: 1,
        weeklyContributions: Array.from({ length: 12 }).reduce((acc, _, i) => ({ ...acc, ['u' + i]: true }), { [getUserId()]: true }),
        vibeTier: 'bronze', vibeHistory: [], feed: [], events: [],
        leaderboard: [{ userId: getUserId(), name: '我', avatar: '🏋️', volume: 5000, sessions: 1, role: 'leader' }],
        lastWeekLeaderboard: [],
        activeChallenges: [], customChallenges: [], chat: [], pendingApprovals: [], trophyCabinet: []
    },
    {
        id: 'c_pro_elite', name: '山海征服者 | 超級社團', type: 'multisport',
        privacy: 'invite_only',
        cover: COVERS[0], avatar: '🏔️', customAvatar: null, location: '宜蘭縣', members: 128,
        isJoined: true, desc: '致力於挑戰極限的跨領域社團。無論是百岳縱走還是健力三項，我們都在這裡挑戰自我。',
        announcement: '📢 本週日 06:00 集合於草嶺古道，進行 10K 山徑越野。',
        level: 5, xp: 45000, leaderId: getUserId(), leaderName: '我', completedExpeditions: 12, activeWeeks: 52,
        weeklyContributions: { [getUserId()]: true, 'u_sarah': true, 'u_mike': true, 'u_leo': true },
        vibeTier: 'diamond', vibeHistory: [], feed: [], events: [],
        leaderboard: [
            { userId: getUserId(), name: '我', avatar: '🏔️', distance: 42000, volume: 15000, runs: 4, sessions: 5, role: 'leader' },
            { userId: 'u_sarah', name: 'Sarah', avatar: '🌟', distance: 38000, volume: 22000, runs: 5, sessions: 6, role: 'admin' },
            { userId: 'u_mike', name: 'Mike', avatar: '💪', distance: 12000, volume: 45000, runs: 1, sessions: 8, role: 'moderator' },
            { userId: 'u_leo', name: 'Leo', avatar: '🦅', distance: 28000, volume: 8000, runs: 3, sessions: 3, role: 'member' },
        ],
        pendingApprovals: [
            { userId: 'u_new_1', name: '王小明', avatar: '🚴', requestedAt: '30 分鐘前', note: '嗨！我是三鐵愛好者，剛搬到宜蘭希望加入大家。' },
            { userId: 'u_new_2', name: '林嘉嘉', avatar: '🔥', requestedAt: '5 小時前', note: '重訓資歷 3 年，想找跑步夥伴。' },
        ],
        activeChallenges: [], customChallenges: [], chat: [], trophyCabinet: []
    }
];

// 社團 ID 前綴對照（與後端 _generate_squad_id 一致）
const SQUAD_PREFIX_MAP = { run: 'RUN', strength: 'STR', cycling: 'CYC', multisport: 'MLT', yoga: 'YGA', hiit: 'HIT', swimming: 'SWM', hiking: 'HIK', other: 'OTH' };

// 🔑 確保每個社團都有「可顯示、可複製、可搜尋」且一致的 squadId。
//    舊版/種子社團只有內部 id（如 'c1'）而無 squadId，會造成管理頁顯示 'c1'、
//    但 ID 搜尋只比對 squadId → 永遠查不到。這裡用既有 id 衍生一個穩定代碼，
//    同一個 id 永遠對應同一組代碼（不需持久化，每次載入結果一致）。
const ensureSquadId = (club) => {
    if (!club) return club;
    if (club.squadId) return club;
    const prefix = SQUAD_PREFIX_MAP[club.type] || 'SQD';
    const raw = String(club.id || '').replace(/[^a-zA-Z0-9]/g, '');
    const suffix = (raw.slice(-4) || '0001').toUpperCase().padStart(4, '0');
    return { ...club, squadId: `${prefix}-${suffix}` };
};

// 🔴 只載入真實社團。沒有真實資料時回傳空陣列，讓畫面顯示真正的
//    「No Squads Yet」空狀態，而非偽造的「展示社團」（會讓社交歸屬感失真）。
//    需要展示用假社團時，於 URL 加 ?demoSquads=1。
const loadClubs = () => {
    const real = getClubs();
    if (real && real.length) return real.map(club => ensureSquadId({ ...club, cover: normalizeSquadCover(club.cover) }));
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demoSquads') === '1') {
        return MOCK_CLUBS.map(ensureSquadId);
    }
    return [];
};
/* ═══ ACTIVE CHALLENGE DETAIL SHEET ═══ */
const ActiveChallengeDetailSheet = ({ challenge, club, userId, totals, onClose, ac }) => {
    /* 🩹 這裡原本把「我一個人本週的資料」標成「社團總進度」，
       而目標是「每人 × 人數」——10 人社團目標 50km，我跑 5km 顯示 10%，
       看起來像全團只跑了 5km，等於叫一個人扛全團的目標，數字也是錯的。
       全社團的數字只有後端知道；拿不到時就誠實說只看得到自己的。 */
    const myProg = getRecordedChallengeProgress(challenge, userId) ?? (challenge.progress || 0);
    const clubProg = squadChallengeProgress(challenge, totals);
    const clubWide = clubProg != null;
    const shown = clubWide ? clubProg : myProg;
    const prog = Math.min(shown, challenge.target || shown);
    const pct = Math.min(100, (prog / Math.max(challenge.target, 1)) * 100);
    const cColor = challenge.color || ac;

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100100] bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ y: '100%', opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 220 }} className="fixed bottom-0 left-0 right-0 z-[100100] bg-[#F6F4F1] rounded-t-[28px] pt-4 pb-8 flex flex-col items-center shadow-2xl">
                <div className="w-12 h-1.5 bg-black/10 rounded-full mb-6 shrink-0" />

                <div className="w-full px-6 flex flex-col overflow-y-auto max-h-[85dvh] custom-scrollbar pb-6 relative">
                    <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="absolute right-0 top-0 w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><X size={16} /></motion.button>

                    {/* Header — editorial kicker + title + goal */}
                    <div className="pr-12 mb-5">
                        {challenge.theme && <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.accent, margin: '0 0 8px', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{challenge.theme}</p>}
                        <h3 style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.text, margin: 0, fontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif' }}>{challenge.title}</h3>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.sub, margin: '7px 0 0' }}>目標 · {challenge.target} {challenge.unit}</p>
                    </div>

                    {challenge.desc && <p style={{ fontSize: 13.5, lineHeight: 1.7, fontWeight: 400, color: 'rgba(22,20,21,0.62)', margin: '0 0 18px', fontFamily: '"Noto Sans TC", sans-serif' }}>{challenge.desc}</p>}

                    {/* HERO — 社團總進度（焦點：大輕量數字 · Mist 冷底退讓層 · 單一 Coral 尺規） */}
                    <div style={{ background: '#E8E9E6', border: `1px solid ${C.pebble}`, borderRadius: 20, padding: '20px 20px 18px', marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.4)', margin: 0, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                                {clubWide ? '社團總進度' : '你的貢獻'}
                            </p>
                            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.sub, margin: 0, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{challenge.target} {challenge.unit}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 14 }}>
                            <span style={{ fontSize: 56, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', color: pct >= 100 ? C.sage : C.text, fontVariantNumeric: 'tabular-nums', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{Math.round(pct)}</span>
                            <span style={{ fontSize: 18, fontWeight: 400, color: C.sub }}>%</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 3, background: C.pebble, overflow: 'hidden', position: 'relative' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: pct >= 100 ? C.sage : C.accent }} />
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: C.sub, margin: '12px 0 0', fontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif' }}>
                            {clubWide ? (
                                <>
                                    {totals.activeMembers} 位成員有紀錄
                                    {myProg > 0 && <> · 你貢獻了 <span style={{ color: C.accent, fontWeight: 800 }}>{myProg.toLocaleString()} {challenge.unit}</span></>}
                                </>
                            ) : myProg > 0 ? (
                                <>你已貢獻 <span style={{ color: C.accent, fontWeight: 800 }}>{myProg.toLocaleString()} {challenge.unit}</span></>
                            ) : '你還沒有貢獻'}
                        </p>
                        {!clubWide && (
                            <p style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(22,20,21,0.42)', margin: '7px 0 0', lineHeight: 1.6 }}>
                                目前只讀得到你自己的紀錄，其他成員的累積要等連上伺服器才會併進來。
                            </p>
                        )}
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ COMMENT SHEET (IG-style with replies + @mentions) ═══ */

/* ══════════════════════════════════════════════════════════════════════════
 * 揪活動的「不用從零開始」素材
 * ══════════════════════════════════════════════════════════════════════════
 * 使用者：「讓使用者不一定要全部手寫，可以多一點選項固定格式」。
 * 面對一張全空的表單最花時間的不是打字，是決定要寫什麼。
 * 範本填好八成，剩下改時間地點就能發。
 */
const EVENT_TEMPLATES = [
    { key: 'weekend', types: ['run', 'multisport'], label: '週末團練', icon: 'globe', title: '週末團練', time: '07:00', target: 10, unit: 'km',
      desc: '河濱集合，一起跑 10K。分兩組配速，慢的那組一定有人陪。' },
    { key: 'night5k', types: ['run', 'multisport'], label: '夜跑 5K', icon: 'flame', title: '夜跑 5K', time: '19:30', target: 5, unit: 'km',
      desc: '下班後輕鬆 5K，跑完可以一起吃個東西。' },
    { key: 'lsd', types: ['run', 'multisport'], label: 'LSD 長跑', icon: 'timer', title: 'LSD 長距離', time: '06:00', target: 18, unit: 'km',
      desc: '長距離慢跑，全程用聊天配速。自備水或補給。' },
    { key: 'interval', types: ['run', 'multisport'], label: '間歇課表', icon: 'bolt', title: '間歇訓練', time: '19:00', target: 8, unit: 'km',
      desc: '暖身 2K → 400m × 8（組間慢跑 200m）→ 收操。跑錶記得開。' },
    { key: 'lift', types: ['strength', 'multisport'], label: '一起重訓', icon: 'strength', title: '一起練', time: '19:00', target: 3000, unit: 'kg',
      desc: '一起去健身房，互相補位。菜單各自跑，最後比總量。' },
    { key: 'legday', types: ['strength', 'multisport'], label: '腿日', icon: 'strength', title: '腿日', time: '19:00', target: 4000, unit: 'kg',
      desc: '深蹲主項 + 腿推 + 腿彎舉。有人幫忙看深度跟補位。' },
    { key: 'newbie', types: ['run', 'strength', 'multisport'], label: '新手友善', icon: 'target', title: '新手友善場', time: '10:00', target: 3, unit: 'km',
      desc: '第一次來的優先。全程有人帶，不會被丟包，強度自己抓。' },
    { key: 'race', types: ['run', 'multisport'], label: '賽前備賽', icon: 'flag', title: '賽前團練', time: '06:30', target: 12, unit: 'km',
      desc: '模擬比賽日：一樣的時間、一樣的補給、一樣的配速。' },
];
const EVENT_TIME_PRESETS = ['06:00', '07:00', '10:00', '18:30', '19:00', '20:00'];
/** 報名截止了沒。沒設截止日就用活動當天；都沒有就永遠開著。 */
const eventSignupClosed = (ev) => {
    const day = ev?.rsvpDeadline || ev?.date;
    if (!day) return false;
    const end = new Date(`${day}T23:59:59`);
    return Number.isFinite(end.getTime()) && Date.now() > end.getTime();
};
const EVENT_BRING_PRESETS = ['水壺', '毛巾', '補給', '跑錶', '手套', '健身房會員卡', '換洗衣物'];
const EVENT_COST_PRESETS = [
    { key: 'free', label: '免費' },
    { key: 'split', label: '費用平分' },
    { key: 'self', label: '各付各的' },
];

/* ═══ 揪一場活動（CLUB EVENT）══════════════════════════════════════════
   這張表單本來叫「建立自訂挑戰」，但入口按鈕寫「張貼第一則公告」、
   區塊標題寫「Bulletin Board」—— 同一個東西三個名字，而且它填的是
   日期／時間／地點／人數上限，明明就是揪一場活動。
   社團的主軸是「交流、開團、揪活動」，所以正名為活動，三個地方統一。 */
const CreateCustomChallengeSheet = ({ onClose, onCreate, clubType, defaultLocation = '', ac }) => {
    const [d, setD] = useState({
        title: '', desc: '', date: '', time: '', location: defaultLocation || '',
        icon: 'medal', xpReward: 50, maxParticipants: 20, target: 10,
        unit: clubType === 'run' ? 'km' : 'kg',
        // ── 報名設定（使用者：「要報名的人的選項等等都要做好」）──────────
        rsvpRequired: true,      // 要不要報名（false = 直接來就好）
        rsvpDeadline: '',        // 報名截止日，空白 = 活動當天
        waitlist: true,          // 額滿後開候補
        cost: 'free',            // free / split / self
        bring: [],               // 要帶什麼
    });
    const [appliedTpl, setAppliedTpl] = useState(null);
    /* ⚠️ 這裡比對的必須是正規化後的類型 —— 混合社團的 id 是 multisport，
       寫成 'mixed' 會讓混合社團的範本列整排空掉。 */
    const normType = normalizeClubType(clubType);
    const templates = EVENT_TEMPLATES.filter((t) => t.types.includes(normType) || normType === 'multisport');

    /** 套用範本：只填「還沒動過」的欄位，不要覆蓋使用者已經打的字。 */
    const applyTemplate = (t) => {
        setAppliedTpl(t.key);
        setD((p) => ({
            ...p,
            icon: t.icon,
            title: p.title.trim() && appliedTpl === null ? p.title : t.title,
            desc: p.desc.trim() && appliedTpl === null ? p.desc : t.desc,
            time: p.time && appliedTpl === null ? p.time : t.time,
            target: t.target,
            unit: t.unit,
        }));
    };
    const toggleBring = (item) => setD((p) => ({
        ...p,
        bring: p.bring.includes(item) ? p.bring.filter((x) => x !== item) : [...p.bring, item],
    }));

    const inputStyle = {
        width: '100%', padding: '12px 0', fontSize: 16, fontWeight: 700, color: C.text,
        background: 'transparent', border: 'none', borderBottom: `2px solid ${C.text}`,
        borderRadius: 0, outline: 'none', transition: 'border-color 0.2s', fontFamily: 'inherit'
    };
    const labelStyle = {
        fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase',
        color: C.sub, display: 'block', marginBottom: 4
    };

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100100] bg-black/70 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 280 }} className="fixed bottom-0 left-0 right-0 z-[100100] max-w-[440px] mx-auto">
                <div style={{ background: '#F6F4F1', borderTop: `3px solid ${C.text}`, paddingBottom: 'max(24px,env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', maxHeight: '90dvh' }}>

                    {/* Masthead */}
                    <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.stone}`, flexShrink: 0, position: 'relative' }}>
                        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>
                            CLUB EVENT
                        </p>
                        <h3 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, textTransform: 'uppercase', fontFamily: 'var(--font-display)', margin: 0 }}>
                            揪一場活動
                        </h3>
                        <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ position: 'absolute', top: 22, right: 24, width: 34, height: 34, borderRadius: '50%', background: C.text, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={15} color="#F6F4F1" />
                        </motion.button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                        {/* 範本 —— 不用從一張全空的表單開始 */}
                        <div>
                            <label style={labelStyle}>從範本開始 TEMPLATE</label>
                            <div className="flex gap-2 flex-wrap">
                                {templates.map((t) => {
                                    const on = appliedTpl === t.key;
                                    return (
                                        <motion.button {...pressProps('pill')} key={t.key} onClick={() => applyTemplate(t)}
                                            style={{
                                                padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
                                                background: on ? C.text : 'white',
                                                border: `1px solid ${on ? C.text : C.pebble}`,
                                                fontSize: 12.5, fontWeight: 700, color: on ? '#F6F4F1' : C.text,
                                            }}>{t.label}</motion.button>
                                    );
                                })}
                            </div>
                            <p style={{ fontSize: 11, color: C.sub, marginTop: 7, lineHeight: 1.6 }}>
                                套用之後每一欄都還能改，只是不用從空白開始。
                            </p>
                        </div>

                        {/* Icon Selection */}
                        <div>
                            <label style={labelStyle}>活動圖示 ICON</label>
                            <div className="flex gap-2 flex-wrap">
                                {CHALLENGE_ICONS.map(({ key, label, Icon }) => (
                                    <motion.button {...pressProps('row')} key={key} title={label} aria-label={label}
 onClick={() => setD(p => ({ ...p, icon: key }))}
 style={{ width: 42, height: 42, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', background: d.icon === key ? C.text : C.stone, border: d.icon === key ? `2px solid ${C.text}` : `1px solid ${C.pebble}` }}>
                                        <Icon size={19} color={d.icon === key ? '#F6F4F1' : C.text} strokeWidth={1.9} />
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label style={labelStyle}>活動名稱 TITLE</label>
                            <input value={d.title} onChange={e => setD(p => ({ ...p, title: e.target.value }))} placeholder="例：週六早上團練 5K" style={{ ...inputStyle, borderColor: d.title ? C.text : C.pebble }} />
                        </div>

                        {/* Description */}
                        <div>
                            <label style={labelStyle}>詳細說明 DESCRIPTION</label>
                            <textarea value={d.desc} onChange={e => setD(p => ({ ...p, desc: e.target.value }))} placeholder="集合方式、配速、要帶什麼..." rows={2} style={{ ...inputStyle, resize: 'none', borderColor: d.desc ? C.text : C.pebble }} />
                        </div>

                        {/* Date & Time */}
                        <div className="grid grid-cols-2 gap-6">
                            <div><label style={labelStyle}>日期 DATE</label><input type="date" value={d.date} onChange={e => setD(p => ({ ...p, date: e.target.value }))} style={{ ...inputStyle, borderColor: d.date ? C.text : C.pebble }} /></div>
                            <div><label style={labelStyle}>時間 TIME</label><input type="time" value={d.time} onChange={e => setD(p => ({ ...p, time: e.target.value }))} style={{ ...inputStyle, borderColor: d.time ? C.text : C.pebble }} /></div>
                        </div>
                        <div className="flex gap-2 flex-wrap" style={{ marginTop: -10 }}>
                            {EVENT_TIME_PRESETS.map((t) => (
                                <motion.button {...pressProps('pill')} key={t} onClick={() => setD(p => ({ ...p, time: t }))}
                                    style={{
                                        padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                                        background: d.time === t ? C.text : 'transparent',
                                        border: `1px solid ${d.time === t ? C.text : C.pebble}`,
                                        fontSize: 12, fontWeight: 700, color: d.time === t ? '#F6F4F1' : C.sub,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>{t}</motion.button>
                            ))}
                        </div>

                        {/* Location */}
                        <div>
                            <label style={labelStyle}>地點 LOCATION</label>
                            <input value={d.location} onChange={e => setD(p => ({ ...p, location: e.target.value }))} placeholder="例：大安森林公園" style={{ ...inputStyle, borderColor: d.location ? C.text : C.pebble }} />
                        </div>

                        {/* Target & Unit & Max */}
                        <div className="grid grid-cols-3 gap-4">
                            <div><label style={labelStyle}>目標 TARGET</label><input type="number" value={d.target} onChange={e => setD(p => ({ ...p, target: +e.target.value }))} style={{ ...inputStyle, borderColor: d.target ? C.text : C.pebble, textAlign: 'center', fontSize: 18, fontFamily: 'var(--font-display)' }} /></div>
                            <div>
                                <label style={labelStyle}>單位 UNIT</label>
                                <select value={d.unit} onChange={e => setD(p => ({ ...p, unit: e.target.value }))} style={{ ...inputStyle, borderColor: C.pebble, padding: '10px 0' }}>
                                    <option value="km">km</option>
                                    <option value="kg">kg</option>
                                    <option value="次">次</option>
                                    <option value="分鐘">分鐘</option>
                                </select>
                            </div>
                            <div><label style={labelStyle}>人數上限 MAX</label><input type="number" value={d.maxParticipants} onChange={e => setD(p => ({ ...p, maxParticipants: +e.target.value }))} style={{ ...inputStyle, borderColor: d.maxParticipants ? C.text : C.pebble, textAlign: 'center', fontSize: 18, fontFamily: 'var(--font-display)' }} /></div>
                        </div>

                        {/* ══ 報名設定 ══════════════════════════════════════════
                            使用者：「要報名的人的選項等等都要做好」。
                            揪團最後會卡在三件事：到底要不要報名、幾點截止、額滿怎麼辦。
                            這三件講清楚，活動卡上才有東西可以顯示。 */}
                        <div style={{ padding: '16px 18px', background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 4 }}>
                            <label style={{ ...labelStyle, marginBottom: 12 }}>報名設定 SIGN-UP</label>

                            {/* 要不要報名 */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                {[{ v: true, l: '需要報名', s: '看得到誰會來、可設上限' }, { v: false, l: '自由參加', s: '不用報名，直接來' }].map((o) => {
                                    const on = d.rsvpRequired === o.v;
                                    return (
                                        <motion.button {...pressProps('row')} key={String(o.v)}
                                            onClick={() => setD(p => ({ ...p, rsvpRequired: o.v }))}
                                            style={{
                                                flex: 1, padding: '10px 10px', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                                                background: on ? C.text : 'transparent', border: `1.5px solid ${on ? C.text : C.pebble}`,
                                            }}>
                                            <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: on ? '#F6F4F1' : C.text }}>{o.l}</span>
                                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: on ? 'rgba(246,244,241,0.62)' : C.sub, marginTop: 2, lineHeight: 1.35 }}>{o.s}</span>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {d.rsvpRequired && (
                                <>
                                    <div style={{ marginBottom: 14 }}>
                                        <label style={{ ...labelStyle, marginBottom: 6 }}>報名截止 DEADLINE</label>
                                        <input type="date" value={d.rsvpDeadline} max={d.date || undefined}
                                            onChange={e => setD(p => ({ ...p, rsvpDeadline: e.target.value }))}
                                            style={{ ...inputStyle, borderColor: d.rsvpDeadline ? C.text : C.pebble }} />
                                        <p style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>留空 = 活動當天都還能報。</p>
                                    </div>

                                    <motion.button {...pressProps('row')} onClick={() => setD(p => ({ ...p, waitlist: !p.waitlist }))}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                                            background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                        }}>
                                        <span style={{
                                            width: 20, height: 20, flexShrink: 0, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: d.waitlist ? C.text : 'transparent', border: `1.5px solid ${d.waitlist ? C.text : C.pebble}`,
                                        }}>{d.waitlist && <Check size={13} color="#F6F4F1" strokeWidth={3} />}</span>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>額滿後開候補名單</span>
                                    </motion.button>
                                </>
                            )}

                            {/* 費用 */}
                            <div style={{ marginTop: 8 }}>
                                <label style={{ ...labelStyle, marginBottom: 6 }}>費用 COST</label>
                                <div className="flex gap-2 flex-wrap">
                                    {EVENT_COST_PRESETS.map((c) => {
                                        const on = d.cost === c.key;
                                        return (
                                            <motion.button {...pressProps('pill')} key={c.key} onClick={() => setD(p => ({ ...p, cost: c.key }))}
                                                style={{
                                                    padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
                                                    background: on ? C.text : 'transparent', border: `1px solid ${on ? C.text : C.pebble}`,
                                                    fontSize: 12.5, fontWeight: 700, color: on ? '#F6F4F1' : C.sub,
                                                }}>{c.label}</motion.button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 要帶什麼 */}
                            <div style={{ marginTop: 16 }}>
                                <label style={{ ...labelStyle, marginBottom: 6 }}>要帶什麼 BRING</label>
                                <div className="flex gap-2 flex-wrap">
                                    {EVENT_BRING_PRESETS.map((item) => {
                                        const on = d.bring.includes(item);
                                        return (
                                            <motion.button {...pressProps('pill')} key={item} onClick={() => toggleBring(item)}
                                                style={{
                                                    padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                                                    background: on ? C.text : 'transparent', border: `1px solid ${on ? C.text : C.pebble}`,
                                                    fontSize: 12.5, fontWeight: 700, color: on ? '#F6F4F1' : C.sub,
                                                }}>{item}</motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Cover Photo */}
                        <div>
                            <label style={labelStyle}>封面照片 COVER PHOTO</label>
                            <label className="block h-32 overflow-hidden flex items-center justify-center cursor-pointer transition-colors" style={{ background: C.stone, border: `1.5px dashed ${C.pebble}`, borderRadius: 4 }}>
                                {d.cover ? <img loading="lazy" decoding="async" src={d.cover} className="w-full h-full object-cover filter grayscale-20 contrast-110" /> : <div className="text-center" style={{ color: C.sub }}><Camera size={24} className="mx-auto mb-2" /><span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em' }}>上傳底部照片</span></div>}
                                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setD(p => ({ ...p, cover: ev.target.result })); r.readAsDataURL(f); } }} />
                            </label>
                        </div>

                        {/* Reward Summary */}
                        <div style={{ padding: '16px 20px', background: C.text, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="flex-1">
                                <p style={{ fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 4 }}>獎勵</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#F6F4F1' }}>完成獲得徽章進度</p>
                            </div>
                            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
                            <div className="flex-1 text-right">
                                <p style={{ fontSize: 12, fontWeight: 800, color: C.sub, marginBottom: 4 }}>活躍程度</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#F6F4F1' }}>動態活躍度 +1</p>
                            </div>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div style={{ padding: '16px 24px 0', borderTop: `1px solid ${C.stone}`, flexShrink: 0 }}>
                        <motion.button {...pressProps('row')} onClick={() => {
 if (!d.title.trim()) return;
 let autoXp = 30; // Base
 if (clubType === 'run') autoXp += Math.min(d.target * 5, 20);
 else autoXp += Math.min(Math.floor(d.target / 500), 20);
 onCreate({ ...d, xpReward: autoXp });
 }} disabled={!d.title.trim()}
 style={{ width: '100%', height: 52, background: d.title.trim() ? C.text : C.pebble, border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#F6F4F1', cursor: d.title.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
                            發布活動 CREATE
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ EDIT CLUB INFO SHEET — Swiss Magazine Edition ═══ */
const EditClubSheet = ({ club, field, userId, onClose, onSave, ac }) => {
    const fileRef = useRef(null);
    const coverFileRef = useRef(null);
    const [data, setData] = useState({
        name: club.name || '', desc: club.desc || '',
        location: club.location || '', announcement: club.announcement || '',
        // 社團類型：決定挑戰題庫、主指標與畫面上的稱呼（社長／管理員可改）
        type: normalizeClubType(club.type),
        memberNoun: club.memberNoun || '',
        // 封面右下角的大字：預設不顯示，由社長／管理員在設定裡自己決定要放什麼
        heroWord: club.heroWord || '',
        avatar: club.avatar || '🏃', customAvatar: club.customAvatar || null, cover: normalizeSquadCover(club.cover) || COVERS[0]
    });
    const typeChanged = data.type !== normalizeClubType(club.type);
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setData(d => ({ ...d, customAvatar: ev.target.result }));
        reader.readAsDataURL(file);
    };
    const handleCoverUpload = (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setData(d => ({ ...d, cover: ev.target.result }));
        reader.readAsDataURL(file);
    };

    const inputStyle = {
        width: '100%', padding: '13px 16px', fontSize: 15, fontWeight: 600, color: C.text,
        background: 'white', border: `1.5px solid ${C.pebble}`, borderRadius: 4,
        outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border 0.15s',
    };
    const labelStyle = {
        fontSize: 9, fontWeight: 900, letterSpacing: '0.28em', textTransform: 'uppercase',
        color: C.sub, display: 'block', marginBottom: 8,
    };

    /* 換社團類型 → 挑戰題庫整組換掉，所以本月已帶入的固定挑戰必須重算，
       不然畫面上會留著上一個類型的題目（跑步社團卻掛著臥推挑戰）。 */
    const buildPatch = () => {
        const patch = { ...data };
        if (field === 'announcement') {
            // 公告要記得是誰、什麼時候貼的 —— 只有一行字沒人知道是不是舊的
            patch.announcementMeta = patch.announcement
                ? { by: userId || null, byName: getDisplayName(userId), at: new Date().toISOString() }
                : null;
        }
        if (typeChanged) {
            patch.fixedChallengeIds = null;
            patch.challengeMonth = null;
            patch.activeChallenges = (club.activeChallenges || []).filter((c) => c.custom);
        }
        return patch;
    };

    const sportBlock = (
        <>
                        {/* 社團類型 —— 決定挑戰題庫、主指標與稱呼 */}
                        <div>
                            <span style={labelStyle}>社團類型</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {CLUB_TYPES.map((t) => {
                                    const on = data.type === t.id;
                                    return (
                                        <motion.button {...pressProps('row')} key={t.id}
                                            onClick={() => setData((d) => ({ ...d, type: t.id }))}
                                            style={{
                                                flex: 1, padding: '11px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                                                background: on ? C.text : 'white',
                                                border: `1.5px solid ${on ? C.text : C.pebble}`,
                                            }}>
                                            <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: on ? '#F6F4F1' : C.text, letterSpacing: '-0.01em' }}>{t.label}</span>
                                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: on ? 'rgba(246,244,241,0.62)' : C.sub, marginTop: 2, lineHeight: 1.35 }}>{t.sub}</span>
                                        </motion.button>
                                    );
                                })}
                            </div>
                            {typeChanged && (
                                <p style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, margin: '8px 0 0', lineHeight: 1.6 }}>
                                    換類型會重新帶入這個類型的每月固定挑戰，已完成的紀錄與展示櫃徽章都會保留。
                                </p>
                            )}
                        </div>

                        {/* 成員稱呼 —— 預設跟著類型走，社長／管理員可以自己改 */}
                        <div>
                            <span style={labelStyle}>成員稱呼</span>
                            <input
                                value={data.memberNoun}
                                onChange={(e) => setData((d) => ({ ...d, memberNoun: e.target.value.slice(0, 12) }))}
                                placeholder={clubTypeMeta(data.type).noun}
                                style={inputStyle} />
                            <p style={{ fontSize: 11, color: C.sub, marginTop: 6, lineHeight: 1.6 }}>
                                顯示在人數旁邊。留空就用「{clubTypeMeta(data.type).noun}」。
                            </p>
                        </div>

                        {/* 封面大字 —— 預設不顯示，有權限的人才能在這裡設定 */}
                        <div>
                            <span style={labelStyle}>封面大字</span>
                            <input
                                value={data.heroWord}
                                onChange={(e) => setData((d) => ({ ...d, heroWord: e.target.value.slice(0, 8) }))}
                                placeholder="例如：TPE RUN"
                                style={inputStyle} />
                            <p style={{ fontSize: 11, color: C.sub, marginTop: 6, lineHeight: 1.6 }}>
                                顯示在封面照片右下角，最多 8 個字。留空就不顯示。
                            </p>
                        </div>
        </>
    );

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100100] bg-black/70 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 280 }}
                className="fixed bottom-0 left-0 right-0 z-[100100] max-w-[440px] mx-auto">
                <div style={{
                    background: '#F6F4F1', borderTop: `3px solid ${C.text}`,
                    padding: 0, paddingBottom: 'max(24px,env(safe-area-inset-bottom))',
                    display: 'flex', flexDirection: 'column', maxHeight: '90dvh',
                }}>
                    {/* Masthead */}
                    <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.stone}`, flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, marginTop: 2, background: C.text, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={15} color="#F6F4F1" />
                        </motion.button>
                        <div>
                            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>
                                {field === 'info' ? 'EDIT PROFILE' : field === 'type' ? 'SPORT & WORDING' : 'ANNOUNCEMENT'}
                            </p>
                            <h3 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, textTransform: 'uppercase', fontFamily: 'var(--font-display)', margin: 0 }}>
                                {field === 'info' ? '編輯社團資料' : field === 'type' ? '類型、稱呼與封面大字' : '置頂公告'}
                            </h3>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                        {field === 'info' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {sportBlock}

                                {/* Cover */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <span style={labelStyle}>封面照片</span>
                                        <motion.button {...pressProps('row')} onClick={() => coverFileRef.current?.click()} style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Upload size={11} /> 上傳封面
                                        </motion.button>
                                        <input ref={coverFileRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
                                    </div>
                                    <div style={{ height: 130, overflow: 'hidden', marginBottom: 10, position: 'relative' }}>
                                        <img loading="lazy" decoding="async" src={squadAssetUrl(data.cover)} onError={onCoverError} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%) contrast(1.1)' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(22,20,21,0.4), transparent)' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                                        {COVERS.map((url, i) => (
                                            <div key={i} onClick={() => setData(d => ({ ...d, cover: url }))}
                                                style={{ width: 52, height: 36, flexShrink: 0, cursor: 'pointer', overflow: 'hidden', border: data.cover === url ? `2px solid ${C.text}` : `2px solid transparent`, opacity: data.cover === url ? 1 : 0.5, transition: 'all 0.15s', borderRadius: 2 }}>
                                                <img loading="lazy" decoding="async" src={squadAssetUrl(url)} onError={onCoverError} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Avatar */}
                                <div>
                                    <span style={labelStyle}>社團頭貼</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                                        <div style={{ width: 52, height: 52, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, background: C.stone, border: `2px solid ${C.text}`, overflow: 'hidden', flexShrink: 0 }}>
                                            {data.customAvatar ? <img loading="lazy" decoding="async" src={data.customAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : data.avatar}
                                        </div>
                                        <motion.button {...pressProps('row')} onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', background: C.stone, border: `1px solid ${C.pebble}`, borderRadius: 4, fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Upload size={12} /> 上傳圖片
                                        </motion.button>
                                        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {AVATARS.map(a => (
                                            <motion.button {...pressProps('row')} key={a} onClick={() => setData(d => ({ ...d, avatar: a, customAvatar: null }))}
 style={{ width: 36, height: 36, fontSize: 18, cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', background: !data.customAvatar && data.avatar === a ? C.text : C.stone, border: !data.customAvatar && data.avatar === a ? `2px solid ${C.text}` : `2px solid transparent` }}>
                                                {a}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* Name */}
                                <div>
                                    <span style={labelStyle}>社團名稱</span>
                                    <input value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} style={{ ...inputStyle, borderColor: data.name ? C.text : C.pebble }} />
                                </div>

                                {/* Desc */}
                                <div>
                                    <span style={labelStyle}>社團介紹</span>
                                    <textarea value={data.desc} onChange={e => setData(d => ({ ...d, desc: e.target.value }))} rows={3}
                                        style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }} />
                                </div>

                                {/* Location */}
                                <div>
                                    <span style={labelStyle}>所在地區</span>
                                    <input value={data.location} onChange={e => setData(d => ({ ...d, location: e.target.value }))} style={inputStyle} />
                                </div>

                                {/* Squad ID display */}
                                {club.squadId && (
                                    <div style={{ padding: '14px 16px', background: C.stone, border: `1px solid ${C.pebble}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub }}>社團 ID</span>
                                        <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.12em', color: C.text, fontFamily: 'monospace' }}>{club.squadId}</span>
                                    </div>
                                )}
                            </div>
                        ) : field === 'type' ? (
                            /* 齒輪選單直接進來的專用頁 —— 只有這兩件事，不用捲過封面跟頭貼 */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                                {sportBlock}
                                {/* 改完長什麼樣，當場就看得到 */}
                                <div>
                                    <span style={labelStyle}>預覽</span>
                                    <div style={{ background: C.text, borderRadius: 4, padding: '18px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(246,244,241,0.7)', margin: '0 0 6px' }}>
                                                {clubTypeMeta(data.type).label}
                                            </p>
                                            {String(data.heroWord || '').trim() && (
                                                <p style={{ fontSize: 30, fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.04em', color: 'rgba(246,244,241,0.22)', margin: 0, lineHeight: 1 }}>
                                                    {String(data.heroWord).trim()}
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: 34, fontWeight: 900, color: C.accent, margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{club.members || 1}</p>
                                            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(246,244,241,0.7)', margin: '3px 0 0' }}>
                                                {String(data.memberNoun || '').trim() || clubTypeMeta(data.type).noun}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {/* 🩹 公告本來只有一個空白框 —— 面對空白框最難的是「要寫什麼」。
                                    給幾個常用格式當起點，改幾個字就能發。 */}
                                <div>
                                    <span style={labelStyle}>快速範本</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {ANNOUNCEMENT_TEMPLATES.map((t) => (
                                            <motion.button {...pressProps('pill')} key={t.label}
                                                onClick={() => setData((d) => ({ ...d, announcement: t.text }))}
                                                style={{
                                                    padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                                                    background: 'white', border: `1px solid ${C.pebble}`,
                                                    fontSize: 12.5, fontWeight: 700, color: C.text,
                                                }}>{t.label}</motion.button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                        <span style={labelStyle}>公告內容</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: data.announcement.length > ANNOUNCEMENT_MAX ? C.accent : C.sub, fontVariantNumeric: 'tabular-nums' }}>
                                            {data.announcement.length}/{ANNOUNCEMENT_MAX}
                                        </span>
                                    </div>
                                    <textarea value={data.announcement}
                                        onChange={e => setData(d => ({ ...d, announcement: e.target.value.slice(0, ANNOUNCEMENT_MAX) }))} rows={6}
                                        placeholder="例：本週日 06:00 河濱集合，10K 團練。雨天改室內，前一晚在討論區公布。"
                                        style={{ ...inputStyle, resize: 'none', lineHeight: 1.7 }} />
                                    <p style={{ fontSize: 11, color: C.sub, marginTop: 8, lineHeight: 1.6 }}>
                                        公告會置頂在總覽最上方，並標示是誰、什麼時候發的。
                                    </p>
                                </div>

                                {/* 預覽 —— 發出去長什麼樣，發之前就看得到 */}
                                {data.announcement.trim() && (
                                    <div>
                                        <span style={labelStyle}>預覽</span>
                                        <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: 14, background: 'white', padding: '12px 14px', borderRadius: 4, border: `1px solid ${C.pebble}`, borderLeftWidth: 2, borderLeftColor: C.accent }}>
                                            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.38em', textTransform: 'uppercase', color: C.accent, margin: '0 0 5px' }}>— Announcement</p>
                                            <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.6, color: C.text, margin: 0, whiteSpace: 'pre-wrap' }}>{data.announcement}</p>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '8px 0 0' }}>{getDisplayName(userId)} · 剛剛</p>
                                        </div>
                                    </div>
                                )}

                                {club.announcement && (
                                    <motion.button {...pressProps('row')}
                                        onClick={() => setData((d) => ({ ...d, announcement: '' }))}
                                        style={{
                                            alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 4, cursor: 'pointer',
                                            background: 'transparent', border: `1px solid ${C.pebble}`,
                                            fontSize: 12.5, fontWeight: 800, color: C.sub,
                                        }}>取消置頂</motion.button>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '16px 24px 0', borderTop: `1px solid ${C.stone}`, flexShrink: 0 }}>
                        <motion.button {...pressProps('row')} onClick={() => { onSave(buildPatch()); onClose(); }} style={{
 width: '100%', height: 50, background: C.text, border: 'none', borderRadius: 4,
 fontSize: 13, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
 color: '#F6F4F1', cursor: 'pointer',
 }}>儲存變更</motion.button>
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ CHALLENGES SHEET (Mission Activation) ═══ */
const ChallengesSheet = ({ club, onClose, onUpdate, ac }) => {
    const clubType = club.type || 'run';
    /* 人數門檻：任務的目標是「每人 × 人數」，人太少就不是「一起達成」。
       不夠時不只把按鈕關掉，要講清楚還差幾個人。 */
    const unlock = checkMissionUnlock(club);
    // 社團定位：依類型決定主指標，任務皆圍繞此指標並對應真實可記錄資料
    const focus = getClubFocus(clubType);
    // 依社團類型取對應任務（跑步/騎行/重訓/多元…），保證非空
    const missions = getClubChallenges(clubType);

    // DRVN 月度挑戰計劃：以「當月 + 挑戰名稱」命名（Strava 風格），並標明本月期間
    const MONTH_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const _now = new Date();
    const _month = _now.getMonth();            // 0~11
    const _year = _now.getFullYear();
    const _monthNum = _month + 1;
    const _lastDay = new Date(_year, _monthNum, 0).getDate();
    const monthZh = MONTH_ZH[_month];          // 例：六月
    const periodText = `${_monthNum}月1日 到 ${_year}年${_monthNum}月${_lastDay}日`;
    const planName = (m) => `${monthZh}${m.title}`;
    const PLAN_TAG = 'DRVN';

    const handleActivate = (m) => {
        const target = getChallengeTarget(m, club.members || 1);
        const newChallenge = {
            id: `sys_${Date.now()}_${m.id}`,
            configId: m.id,
            title: planName(m),
            theme: m.theme,
            desc: m.desc,
            icon: m.icon,
            target,
            unit: m.unit,
            progress: 0,
            participants: [],
            isSystem: true,
            color: m.color || ac,
            badge: m.badge,
            vibeBoost: m.vibeBoost,
            duration: m.duration,
            category: m.category || 'mission'
        };
        onUpdate({ ...club, activeChallenges: [newChallenge, ...(club.activeChallenges || [])] });
        onClose();
    };

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100100] bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 z-[100100] max-w-[440px] mx-auto">
                <div style={{ background: C.paper, borderRadius: '28px 32px 0 0', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', paddingBottom: 'max(20px,env(safe-area-inset-bottom))' }}>
                    <div className="p-6 flex justify-between items-center border-b" style={{ borderColor: C.pebble }}>
                        <div>
                            <h3 className="text-[20px] font-black uppercase tracking-tighter" style={{ color: C.text }}>社團任務清單</h3>
                            <p className="text-[12px] font-bold tracking-widest" style={{ color: C.sub }}>DRVN 月度挑戰計劃</p>
                            <p className="text-[11px] font-bold mt-1" style={{ color: C.accent }}>{focus.label} · 主指標：{focus.metric}</p>
                        </div>
                        <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center bg-stone-100" style={{ background: C.stone }}><X size={18} /></motion.button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {/* 人數不到 → 先講清楚為什麼開不了、還差幾個人，而不是給一排點不動的按鈕 */}
                        {!unlock.ok && (
                            <div style={{ padding: '15px 17px', borderRadius: 16, background: 'white', border: `1px dashed ${C.pebble}` }}>
                                <p style={{ fontSize: 14, fontWeight: 900, color: C.text, margin: 0 }}>
                                    滿 {unlock.need} 人才能開任務
                                </p>
                                <p style={{ fontSize: 12.5, fontWeight: 500, color: C.sub, margin: '7px 0 0', lineHeight: 1.65 }}>
                                    任務的目標是「每人 × 人數」，人太少就變成自己跟自己比。
                                    目前 {unlock.members} 人，還差 <span style={{ color: C.accent, fontWeight: 800 }}>{unlock.short}</span> 人 ——
                                    把社團 ID 分享出去，或到討論區揪人。
                                </p>
                            </div>
                        )}
                        {missions.map((m) => {
                            const isActive = (club.activeChallenges || []).some(c => c.configId === m.id);
                            return (
                                <div key={m.id} className="p-5 rounded-[24px] relative overflow-hidden transition-all border-2"
                                    style={{ background: 'white', borderColor: isActive ? C.accent : C.pebble }}>
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="w-14 h-14 rounded-[18px] flex items-center justify-center shadow-sm" style={{ background: `${m.color}15` }}><ChallengeIcon id={m.icon} size={24} color={m.color} fallback={m.category === 'challenge' ? 'trophy' : 'target'} /></div>
                                        <div className="flex-1">
                                            {/* DRVN 計劃標籤 */}
                                            <p className="text-[12px] font-black tracking-widest mb-1" style={{ color: m.color }}>{PLAN_TAG} 月度計劃</p>
                                            <h4 className="text-[16px] font-black tracking-tight leading-snug" style={{ color: C.text }}>{planName(m)}</h4>
                                        </div>
                                    </div>
                                    <p className="text-[13px] font-medium leading-relaxed mb-3" style={{ color: C.sub }}>{m.desc}</p>

                                    {/* 清楚的目標與期間（Strava 風格） */}
                                    <div className="mb-1 space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <Target size={13} color={m.color} style={{ flexShrink: 0 }} />
                                            <span className="text-[12px] font-bold" style={{ color: C.text }}>{m.goal || `${m.perMember}${m.unit}/人`}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Calendar size={13} color={C.sub} style={{ flexShrink: 0 }} />
                                            <span className="text-[11px] font-medium" style={{ color: C.sub }}>{periodText}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 mt-3 border-t border-dashed" style={{ borderColor: C.pebble }}>
                                        <div className="flex gap-4">
                                            <div><p className="text-[12px] font-bold" style={{ color: C.sub }}>目標累積</p><p className="text-[13px] font-black">{m.perMember}{m.unit}/人</p></div>
                                            <div><p className="text-[12px] font-bold" style={{ color: C.sub }}>週期</p><p className="text-[13px] font-black">{m.duration}</p></div>
                                        </div>
                                        {isActive ? (
                                            <span className="px-4 py-1.5 rounded-full text-[12px] font-black bg-[#5A7A3A]/10 text-[#5A7A3A] border border-[#5A7A3A]/25">進行中</span>
                                        ) : unlock.ok ? (
                                            <motion.button {...pressProps('pill')}
 onClick={() => handleActivate(m)}
 className="px-6 py-2 rounded-full text-[12px] font-black tracking-widest "
 style={{ background: C.text, color: C.paper }}>
                                                開啟任務
                                            </motion.button>
                                        ) : (
                                            <span className="px-4 py-1.5 rounded-full text-[12px] font-black"
                                                style={{ background: 'rgba(22,20,21,0.06)', color: C.sub, border: `1px solid ${C.pebble}` }}>
                                                還差 {unlock.short} 人
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ MEMBERS LIST SHEET — Swiss Magazine Edition ═══ */
const MembersListSheet = ({ club, canAdmin, amLeader = false, onClose, onUpdate }) => {
    /* 🩹 權限面板白紙黑字寫「管理員不能：指派管理員」，但程式只檢查 canAdmin，
       管理員因此可以互相升降級，社長無從阻止。說得到就要做得到。 */
    /* 🩹 權限說明本來整段攤在標題底下，佔掉半個視窗才看到第一位成員 ——
       這份說明是「想知道時才需要」的東西，收進右上角的問號裡。 */
    const [showRoles, setShowRoles] = useState(false);
    const [selMember, setSelMember] = useState(null);
    const [kickTarget, setKickTarget] = useState(null);
    const members = club.leaderboard || [];

    /* ══════════════════════════════════════════════════════════════════
       ⚠️ 成員管理原本「只改本機」
       ══════════════════════════════════════════════════════════════════
       核准／拒絕／改角色／踢除四個動作以前都只做 onUpdate() → 寫 localStorage，
       後端 api_squads.py 明明有對應端點卻一個都沒被呼叫。結果是：
         · 社長按「核准」→ 申請者那邊什麼都不會發生，名冊只在社長手機上多一個人
         · 按「踢除」→ 被踢的人下次打開 app 還在社團裡
       改成先打後端、成功才更新畫面；失敗一定要說，不能靜悄悄地假裝成功。 */
    const opId = getUserId();
    const sid = club.squadId || club.id;
    const [busy, setBusy] = useState(null);

    const callSquad = async (path, body, method = 'post') => {
        const url = `/api/squads/${encodeURIComponent(sid)}/${path}`;
        return method === 'patch' ? apiClient.patch(url, body) : apiClient.post(url, body);
    };

    const handleUpdateRole = async (mId, newRole) => {
        setBusy(mId);
        try {
            await callSquad('role', { target_user_id: mId, new_role: newRole, operator_id: opId }, 'patch');
        } catch (err) {
            toast.error(failureDetail(err, '角色'));
            setBusy(null);
            return;
        }
        const nl = members.map(m => m.userId === mId ? { ...m, role: newRole } : m);
        onUpdate({ ...club, leaderboard: nl });
        setBusy(null);
        setSelMember(null);
    };

    const handleKick = async (mId) => {
        setBusy(mId);
        try {
            await callSquad('kick', { target_user_id: mId, operator_id: opId });
        } catch (err) {
            toast.error(failureDetail(err, '成員'));
            setBusy(null);
            return;
        }
        const nl = members.filter(m => m.userId !== mId);
        onUpdate({ ...club, leaderboard: nl, members: Math.max(0, (club.members || 1) - 1) });
        setBusy(null);
        setKickTarget(null);
        setSelMember(null);
    };

    const pending = club.pendingApprovals || [];

    const handleApprove = async (req) => {
        setBusy(req.userId);
        try {
            await callSquad('approve', { target_user_id: req.userId, operator_id: opId });
        } catch (err) {
            toast.error(failureDetail(err, '申請'));
            setBusy(null);
            return;
        }
        // 核准：加入成員名冊（指標歸零起算）並從待審清單移除
        const newMember = {
            userId: req.userId, name: req.name, avatar: req.avatar || null, role: 'member',
            distance: 0, volume: 0, runs: 0, sessions: 0,
        };
        const welcome = { id: Date.now(), userId: 'system', name: '系統', avatar: null, text: `歡迎 ${req.name} 加入 — 先到「總覽」看看本月任務，留下你的第一筆貢獻吧`, time: '剛剛', system: true };
        onUpdate({
            ...club,
            leaderboard: [...members, newMember],
            pendingApprovals: pending.filter(p => p.userId !== req.userId),
            members: (club.members || members.length) + 1,
            chat: [...(club.chat || []), welcome],
        });
        setBusy(null);
    };

    const handleReject = async (req) => {
        setBusy(req.userId);
        try {
            await callSquad('reject', { target_user_id: req.userId, operator_id: opId });
        } catch (err) {
            toast.error(failureDetail(err, '申請'));
            setBusy(null);
            return;
        }
        onUpdate({ ...club, pendingApprovals: pending.filter(p => p.userId !== req.userId) });
        setBusy(null);
    };

    const ROLE_LABEL = { leader: 'President', admin: 'Director', moderator: 'Editor', member: 'Member' };
    const ROLE_COLOR = { leader: C.gold, admin: C.accent, moderator: C.sage, member: C.sub };

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100100] bg-black/70 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 280 }}
                className="fixed bottom-0 left-0 right-0 z-[100100] max-w-[440px] mx-auto">
                <div style={{
                    background: '#F6F4F1',
                    borderRadius: '0',
                    maxHeight: '90dvh',
                    display: 'flex',
                    flexDirection: 'column',
                    paddingBottom: 'max(24px,env(safe-area-inset-bottom))',
                    borderTop: `3px solid ${C.text}`,
                }}>
                    {/* Header — editorial masthead style，X 移到左上角避免遮擋人數 */}
                    <div style={{ padding: '22px 24px 16px', borderBottom: `1px solid ${C.stone}`, position: 'relative', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            {/* Close — left side */}
                            <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{
 width: 34, height: 34, borderRadius: '50%', flexShrink: 0, marginTop: 2,
 background: C.text, border: 'none', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}><X size={15} color="#F6F4F1" /></motion.button>

                            {/* Title */}
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>ROSTER</p>
                                <h3 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, textTransform: 'uppercase', fontFamily: 'var(--font-display)', margin: 0 }}>
                                    社團成員
                                </h3>
                            </div>

                            {/* Member count — far right, no overlap */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: C.text, fontFamily: 'var(--font-display)', fontStyle: 'italic', margin: 0 }}>{members.length}</p>
                                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: C.sub }}>{memberNoun(club)}</p>
                            </div>

                            {/* 誰能做什麼 —— 收在右上角的問號 */}
                            <motion.button {...pressProps('row')} aria-label="各階級能做什麼"
                                aria-expanded={showRoles}
                                onClick={() => setShowRoles((v) => !v)}
                                style={{
                                    position: 'absolute', top: 18, right: 18, width: 26, height: 26, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                    background: showRoles ? C.text : 'transparent',
                                    color: showRoles ? '#F6F4F1' : C.sub,
                                    border: `1.5px solid ${showRoles ? C.text : C.pebble}`,
                                    fontSize: 13, fontWeight: 900, lineHeight: 1, padding: 0,
                                }}>?</motion.button>
                        </div>

                        {/* 誰能做什麼 —— 只有兩層：管理層 vs 一般成員。
                            權限要講得出來，不能只給一個顏色點讓使用者自己猜；
                            但也不該擋在成員名單前面，所以預設收起來。 */}
                        {showRoles && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                            {ROLE_TIERS.map((t) => {
                                const roles = MEMBER_ROLES.filter((r) => r.tier === t.id);
                                return (
                                    <div key={t.id} style={{ background: 'white', border: `1px solid ${C.stone}`, borderRadius: 12, padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                                            <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{t.label}</span>
                                            <span style={{ fontSize: 12, color: C.sub }}>
                                                {roles.map((r) => r.label).join(' · ')}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: 12.5, color: C.sub, margin: '0 0 9px', lineHeight: 1.55 }}>{t.desc}</p>
                                        {roles.map((r) => (
                                            <div key={r.id} style={{ marginTop: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.label}</span>
                                                    <span style={{ fontSize: 12, color: C.sub }}>{r.summary}</span>
                                                </div>
                                                <p style={{ fontSize: 12.5, color: C.sub, margin: 0, lineHeight: 1.6, paddingLeft: 12 }}>
                                                    可以：{r.can.join('、')}
                                                </p>
                                                {r.cannot && (
                                                    <p style={{ fontSize: 12.5, color: 'rgba(22,20,21,0.38)', margin: '3px 0 0', lineHeight: 1.6, paddingLeft: 12 }}>
                                                        不能：{r.cannot.join('、')}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </motion.div>
                        )}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0 0' }}>
                        {/* 待審申請（僅管理員可見、可核准/拒絕） */}
                        {canAdmin && pending.length > 0 && (
                            <div style={{ marginBottom: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 20px 10px' }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.accent }}>待審申請</span>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: 'white', background: C.accent, borderRadius: 999, padding: '1px 7px' }}>{pending.length}</span>
                                    <div style={{ flex: 1, height: 1, background: C.stone }} />
                                </div>
                                {pending.map((req) => (
                                    <div key={req.userId} style={{ padding: '12px 20px', background: '#FBEDE8', borderBottom: `1px solid ${C.stone}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'white', border: `1px solid ${C.pebble}` }}>{req.avatar || '🏃'}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: 14, fontWeight: 900, color: C.text, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{req.name}</p>
                                                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.sub, marginTop: 2 }}>{req.requestedAt || '剛剛'}</p>
                                            </div>
                                        </div>
                                        {req.note && <p style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, margin: '8px 0 0' }}>「{req.note}」</p>}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                            <motion.button {...pressProps('row')} onClick={() => handleApprove(req)} style={{ flex: 1, padding: '9px', background: C.text, border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', color: '#F6F4F1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Check size={13} /> 核准</motion.button>
                                            <motion.button {...pressProps('row')} onClick={() => handleReject(req)} style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${C.pebble}`, borderRadius: 4, fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', cursor: 'pointer', color: C.sub }}>拒絕</motion.button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {members.map((m, idx) => (
                            <motion.div key={m.userId}
                                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(idx, 6) * 0.04, duration: 0.3 }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '14px 20px',
                                    background: 'white',
                                    borderBottom: `1px solid ${C.stone}`,
                                }}>
                                {/* Rank number */}
                                <span style={{ fontSize: 11, fontWeight: 900, color: C.pebble, width: 22, flexShrink: 0, textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</span>

                                {/* Avatar */}
                                <div style={{
                                    width: 44, height: 44, borderRadius: 4, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 22, background: C.stone,
                                    border: m.role === 'leader' ? `2px solid ${C.gold}` : m.role === 'admin' ? `2px solid ${C.accent}40` : `1px solid ${C.pebble}`,
                                }}>{m.avatar}</div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 14, fontWeight: 900, color: C.text, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{m.name}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: ROLE_COLOR[m.role] || C.sub, flexShrink: 0 }} />
                                        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: ROLE_COLOR[m.role] || C.sub }}>
                                            {ROLE_LABEL[m.role] || 'Member'}
                                        </p>
                                        {(club.type === 'run' ? m.distance > 0 : m.volume > 0) && <span style={{ fontSize: 11, color: C.pebble }}>· {club.type === 'run' ? `${(m.distance / 1000).toFixed(1)}km` : `${(m.volume || 0).toLocaleString()}kg`}</span>}
                                    </div>
                                </div>

                                {/* Action */}
                                {canAdmin && m.role !== 'leader' && (
                                    <motion.button {...pressProps('row')} onClick={() => setSelMember(m)} style={{
 width: 32, height: 32, borderRadius: 4,
 background: C.stone, border: `1px solid ${C.pebble}`,
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
 }}><Edit3 size={13} color={C.sub} /></motion.button>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Role Edit Modal */}
            <AnimatePresence>
                {selMember && (
                    <div className="fixed inset-0 z-[100200] flex items-center justify-center px-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelMember(null)} />
                        <motion.div initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="relative w-full max-w-xs shadow-2xl overflow-hidden"
                            style={{ background: '#F6F4F1', borderRadius: 4, borderTop: `3px solid ${C.text}` }}>
                            {/* Modal Header */}
                            <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${C.stone}` }}>
                                <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>MANAGE</p>
                                <h4 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', color: C.text }}>{selMember.name}</h4>
                            </div>
                            <div style={{ padding: '16px 24px 24px' }}>
                                {['admin', 'member'].map(role => {
                                  const locked = !amLeader;   // 指派／移除管理員：只有社長
                                  return (
                                    <motion.button {...pressProps('row')} key={role} disabled={locked}
 onClick={() => { if (!locked) handleUpdateRole(selMember.userId, role); }}
 style={{
 width: '100%', padding: '14px 20px', marginBottom: 8, borderRadius: 4,
 fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
 cursor: locked ? 'default' : 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 opacity: locked && selMember.role !== role ? 0.4 : 1,
 background: selMember.role === role ? C.text : 'white',
 color: selMember.role === role ? '#F6F4F1' : C.text,
 border: `1.5px solid ${selMember.role === role ? C.text : C.pebble}`,
 }}>
                                        <span>{role === 'admin' ? '設為管理員' : '一般成員'}</span>
                                        {selMember.role === role && <Check size={14} />}
                                    </motion.button>
                                  );
                                })}
                                {!amLeader && (
                                    <p style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, margin: '2px 0 10px', lineHeight: 1.6 }}>
                                        只有社長能指派或移除管理員。
                                    </p>
                                )}
                                <motion.button {...pressProps('row')} onClick={() => setKickTarget(selMember)}
 style={{
 width: '100%', padding: '12px 20px', borderRadius: 4, marginTop: 8,
 fontSize: 12, fontWeight: 900, letterSpacing: '0.15em',
 cursor: 'pointer', background: 'transparent', color: C.accent,
 border: `1.5px dashed ${C.accent}50`,
 }}>踢除成員</motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Kick Confirm */}
            <AnimatePresence>
                {kickTarget && (
                    <div className="fixed inset-0 z-[100300] flex items-center justify-center px-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/70" onClick={() => setKickTarget(null)} />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="relative w-full max-w-xs shadow-2xl"
                            style={{ background: '#F6F4F1', borderRadius: 4, borderTop: `3px solid ${C.accent}`, padding: 28 }}>
                            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 8 }}>CONFIRM ACTION</p>
                            <h4 style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 8 }}>踢除 {kickTarget.name}？</h4>
                            <p style={{ fontSize: 12, color: C.sub, marginBottom: 24 }}>此操作無法復原。該成員將被移出社團。</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <motion.button {...pressProps('row')} onClick={() => setKickTarget(null)} style={{ flex: 1, padding: '12px', background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 4, fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', color: C.sub }}>取消</motion.button>
                                <motion.button {...pressProps('row')} onClick={() => handleKick(kickTarget.userId)} style={{ flex: 1, padding: '12px', background: C.accent, border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', color: 'white' }}>確認踢除</motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </PortalSheet>
    );
};

/* ═══ 社團階級系統 — 可互動階梯探索器 (Interactive Division Ladder) ═══ */
const XpInfoSheet = ({ club, vibe, onClose }) => {
    const vibeData = getWeeklyVibeData(club);
    const total = vibeData.totalMembers || 0;
    const activeCount = vibeData.activeCount || 0;
    const activePct = vibeData.activePercent || 0;
    // 由高到低排序，階梯由上往下＝由高階到低階
    const ladder = useMemo(() => [...VIBE_TIERS].sort((a, b) => b.rank - a.rank), []);
    const nextTier = VIBE_TIERS.find(t => t.rank === vibe.rank + 1) || null;

    // 距離某階級所需的活躍人數
    const membersNeeded = (tier) => Math.max(0, vibeTierNeed(tier, total) - activeCount);
    const tooSmall = (tier) => (tier.minActive || 0) > total;   // 社團人數本身就不夠

    // 朝下一階的進度（0~100）
    const progressToNext = (() => {
        if (!nextTier) return 100;
        const need = vibeTierNeed(nextTier, total);
        return Math.max(0, Math.min(100, (activeCount / Math.max(1, need)) * 100));
    })();

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100100] bg-black/80 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 30 }}
                className="fixed inset-x-3 z-[100100] max-w-[380px] mx-auto"
                style={{ top: 'max(40px,env(safe-area-inset-top))', bottom: 'max(20px,env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="lg-glass lg-glass--dark" style={{ borderRadius: 26, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '100%' }}>

                    {/* Header */}
                    <div style={{ padding: '20px 22px 16px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', margin: 0, fontFamily: 'var(--font-display)' }}>活躍程度</h3>
                            </div>
                            <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={15} color="#fff" /></motion.button>
                        </div>

                        {/* 目前狀態 + 朝下一階的進度 */}
                        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: `1px solid ${vibe.color}33` }}>
                            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                                <div className="flex items-center gap-2">
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: vibe.color, boxShadow: `0 0 8px ${vibe.color}` }} />
                                    <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>目前：{vibe.nameZh}</span>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 900, color: vibe.color, fontVariantNumeric: 'tabular-nums' }}>{activeCount}/{total} 人</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${progressToNext}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                                    style={{ position: 'absolute', inset: 0, right: 'auto', background: `linear-gradient(90deg, ${vibe.color}, ${nextTier ? nextTier.color : vibe.color})`, boxShadow: `0 0 8px ${vibe.color}90` }} />
                            </div>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '8px 0 0', lineHeight: 1.4 }}>
                                {!nextTier
                                    ? <>已經是最高等級</>
                                    : tooSmall(nextTier)
                                        ? <>要到 <b style={{ color: nextTier.color }}>{nextTier.nameZh}</b>，社團至少要有 <b style={{ color: '#fff' }}>{nextTier.minActive}</b> 位成員</>
                                        : <>再 <b style={{ color: '#fff' }}>{membersNeeded(nextTier)}</b> 人本週有運動，就升到 <b style={{ color: nextTier.color }}>{nextTier.nameZh}</b></>}
                            </p>
                        </div>
                    </div>

                    {/* 階級一覽（簡易顯示） */}
                    <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 4px' }}>
                        {ladder.map(tier => {
                            const achieved = vibe.rank >= tier.rank;
                            const isCurrent = vibe.rank === tier.rank;
                            const locked = vibe.rank < tier.rank;
                            return (
                                <div key={tier.id} className="flex items-center gap-3"
                                    style={{
                                        marginBottom: 8, borderRadius: 14, padding: '11px 14px',
                                        background: isCurrent ? `linear-gradient(135deg, ${tier.color}22, rgba(255,255,255,0.04))` : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${isCurrent ? tier.color + '66' : 'rgba(255,255,255,0.08)'}`,
                                    }}>
                                    {/* 階級色塊 */}
                                    <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tier.auraCss || tier.color, opacity: locked ? 0.45 : 1, filter: locked ? 'grayscale(0.6)' : 'none' }}>
                                        {locked
                                            ? <Lock size={12} color="rgba(255,255,255,0.85)" />
                                            : <span style={{ fontSize: 12, fontWeight: 900, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>{tier.rank}</span>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="flex items-center gap-2">
                                            <span style={{ fontSize: 15, fontWeight: 900, color: locked ? 'rgba(255,255,255,0.55)' : '#fff' }}>{tier.nameZh}</span>
                                            {isCurrent && <span style={{ fontSize: 12, fontWeight: 900, color: '#0A0A0B', background: tier.color, padding: '2px 8px', borderRadius: 999 }}>目前</span>}
                                        </div>
                                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
                                            {tier.minRate > 0 ? `${Math.round(tier.minRate * 100)}% 成員活躍 · 至少 ${tier.minActive} 人` : '起點'}
                                        </p>
                                    </div>
                                    {achieved && <Check size={16} color={tier.color} style={{ flexShrink: 0 }} />}
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer 說明 */}
                    <div style={{ flexShrink: 0, padding: '12px 18px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, margin: 0 }}>
                            每週一重新計算，看本週有運動的成員比例與人數。
                        </p>
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};



/* ═══ ADMIN PANEL SHEET — Swiss Magazine Edition ═══ */
const AdminPanelSheet = ({ club, onClose, onEditInfo, onManageMembers, onManageMissions, onPostActivity, onDissolve, onLeave, ac, userId, canAdmin = true, clubType, publishMine = true, onTogglePublish }) => {
    const isRunClub = (club.type || clubType) === 'run';
    const myMember = (club.leaderboard || []).find((m) => String(m.userId) === String(userId));
    const isLeader = String(club.leaderId) === String(userId) || myMember?.role === 'leader';
    const pendingCount = (club.pendingApprovals || []).length;
    const [copied, setCopied] = useState(false);
    const [dissolveHold, setDissolveHold] = useState(0); // 0-100 progress
    const [dissolveReady, setDissolveReady] = useState(false);
    const dissolveTimerRef = useRef(null);
    const dissolveRafRef = useRef(null);

    const handleCopyId = () => {
        const idToCopy = club.squadId || club.id;
        if (idToCopy) {
            navigator.clipboard.writeText(idToCopy).catch(() => { });
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const startDissolveHold = () => {
        const start = Date.now();
        const duration = 2200; // 2.2s hold
        const tick = () => {
            const elapsed = Date.now() - start;
            const pct = Math.min(100, (elapsed / duration) * 100);
            setDissolveHold(pct);
            if (pct < 100) {
                dissolveRafRef.current = requestAnimationFrame(tick);
            } else {
                setDissolveReady(true);
            }
        };
        dissolveRafRef.current = requestAnimationFrame(tick);
    };

    const cancelDissolveHold = () => {
        if (dissolveRafRef.current) cancelAnimationFrame(dissolveRafRef.current);
        if (!dissolveReady) setDissolveHold(0);
    };

    const menuItems = ([
        {
            /* 🩹 社團類型／成員稱呼原本埋在「編輯社團資料」裡，要捲過封面、頭貼、名稱
               才看得到 —— 使用者從齒輪點進來找不到，等於這個設定不存在。
               拉到第一層，而且把「現在是什麼」直接寫在副標上。 */
            icon: <Globe size={18} color={C.text} />,
            label: '類型、稱呼與封面大字',
            sub: `${clubTypeMeta(club.type).label} · 成員稱呼「${memberNoun(club)}」 · 封面大字${String(club.heroWord || '').trim() ? `「${String(club.heroWord).trim()}」` : '：不顯示'}`,
            onClick: () => onEditInfo('type'),
            light: true,
            staffOnly: true,
        },
        {
            icon: <Edit3 size={18} color={C.text} />,
            label: '編輯社團資料',
            sub: 'Edit Profile & Cover',
            onClick: () => onEditInfo(),
            light: true,
            staffOnly: true,
        },
        {
            icon: <Users size={18} color={C.text} />,
            label: '成員與申請清單',
            sub: canAdmin ? 'Manage Roster & Approvals' : '看看社團裡有誰',
            badge: pendingCount,
            onClick: () => onManageMembers(),
            light: true,
        },
        {
            icon: <Crown size={18} color={C.text} />,
            label: '管理置頂公告',
            sub: 'Pin Announcement',
            onClick: () => onEditInfo('announcement'),
            light: true,
            staffOnly: true,
        },
        {
            icon: <Trophy size={18} color={C.gold} />,
            label: '建立任務',
            sub: 'Create Challenge',
            onClick: () => onManageMissions(),
            light: false,
            staffOnly: true,
        },
        {
            icon: <Megaphone size={18} color={C.sage} />,
            label: '發佈活動',
            sub: 'Post Squad Event',
            onClick: () => onPostActivity(),
            light: false,
            staffOnly: true,
        },
    /* 一般成員看到一整排點下去會被拒絕的按鈕，比看不到更難懂 ——
       名冊人人可看，其餘管理項目只給管理層。 */
    ]).filter((it) => !it.staffOnly || canAdmin);

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%', opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 32, stiffness: 280 }}
                className="fixed bottom-0 left-0 right-0 z-[150] flex flex-col shadow-2xl"
                /* ⚠️ 一定要封頂。少了 maxHeight，項目一多整張就頂到瀏海底下，
                   「社團管理設定」被時間蓋住（使用者回報：圖七破版）。
                   封頂之後內容自己捲，標題永遠在安全區之內。 */
                style={{ background: '#F6F4F1', borderRadius: '0', borderTop: `3px solid ${C.text}`, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', paddingBottom: 'max(28px,env(safe-area-inset-bottom))', maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>

                {/* Masthead */}
                <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.stone}`, position: 'relative' }}>
                    <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>Management Hub</p>
                    <h3 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, textTransform: 'uppercase', fontFamily: 'var(--font-display)', margin: '0 0 14px' }}>
                        社團管理設定
                    </h3>
                    {/* Squad ID + Copy Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.sub, marginBottom: 2 }}>Squad Identity</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    fontSize: 15,
                                    fontWeight: 900,
                                    letterSpacing: '0.05em',
                                    color: C.text,
                                    fontFamily: 'monospace',
                                    background: C.stone,
                                    padding: '4px 10px',
                                    borderRadius: 4,
                                    border: `1px solid ${C.pebble}`,
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                                }}>
                                    {club.squadId || club.id}
                                </span>
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    onClick={handleCopyId}
                                    style={{
                                        padding: '5px 12px',
                                        background: copied ? C.sage : C.text,
                                        borderRadius: 4,
                                        fontSize: 9,
                                        fontWeight: 900,
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        color: 'white',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                    }}>
                                    {copied ? <Check size={10} strokeWidth={4} /> : <Users size={10} strokeWidth={4} />}
                                    {copied ? 'Copied' : 'Copy ID'}
                                </motion.button>
                            </div>
                        </div>
                    </div>
                    <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{
 position: 'absolute', top: 22, right: 24,
 width: 34, height: 34, borderRadius: '50%',
 background: C.text, border: 'none', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}><X size={15} color="#F6F4F1" /></motion.button>
                </div>

                {/* 我的隱私 — 公布運動進度（所有成員皆可設定） */}
                <div style={{ padding: '16px 24px', borderBottom: `6px solid ${C.stone}` }}>
                    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 12 }}>我的隱私</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.stone, border: `1px solid ${C.pebble}` }}>
                            {publishMine ? <Globe size={18} color={C.text} /> : <Lock size={18} color={C.sub} />}
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 15, fontWeight: 900, color: C.text, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 3 }}>公布我的運動進度</p>
                            <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: '0.03em', lineHeight: 1.4 }}>{publishMine ? `開啟中 · 你的本週${isRunClub ? '跑步' : '訓練'}會出現在「動態」讓社團看見` : '關閉中 · 你的運動進度僅自己可見'}</p>
                        </div>
                        {/* iOS 風格開關 */}
                        <motion.button {...pressProps('row')} onClick={onTogglePublish} aria-label="toggle publish" style={{ flexShrink: 0, width: 50, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 3, background: publishMine ? C.text : C.pebble, transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: publishMine ? 'flex-end' : 'flex-start' }}>
                            <motion.div layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} style={{ width: 24, height: 24, borderRadius: '50%', background: C.paper, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                        </motion.button>
                    </div>
                </div>

                {/* Menu Items */}
                <div style={{ padding: '8px 0', flex: 1 }}>
                    {menuItems.map((item, i) => (
                        <motion.button {...pressProps('row')} key={i} onClick={item.onClick} style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 16,
 padding: '16px 24px',
 background: 'transparent', border: 'none', cursor: 'pointer',
 borderBottom: `1px solid ${C.stone}`,
 textAlign: 'left',
 transition: 'background 0.1s',
 }}
 onMouseDown={e => e.currentTarget.style.background = C.stone}
 onMouseUp={e => e.currentTarget.style.background = 'transparent'}
 onTouchStart={e => e.currentTarget.style.background = C.stone}
 onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
 >
                            {/* Icon */}
                            <div style={{
                                width: 42, height: 42, flexShrink: 0, borderRadius: 4,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: item.light ? C.stone : C.text,
                                border: `1px solid ${C.pebble}`,
                                position: 'relative',
                            }}>
                                {item.light ? item.icon : React.cloneElement(item.icon, { color: '#F6F4F1' })}
                                {item.badge > 0 && (
                                    <div style={{
                                        position: 'absolute', top: -5, right: -5,
                                        width: 18, height: 18, borderRadius: '50%',
                                        background: C.accent, border: '2px solid #F6F4F1',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, fontWeight: 900, color: 'white',
                                    }}>{item.badge}</div>
                                )}
                            </div>

                            {/* Text */}
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 15, fontWeight: 900, color: C.text, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 3 }}>{item.label}</p>
                                <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: '0.05em' }}>{item.sub}</p>
                            </div>

                            <ChevronRight size={16} color={C.pebble} />
                        </motion.button>
                    ))}
                </div>

                {/* 🩹 退出社團：加入之後全 app 沒有任何離開的方法，
                    一般成員只能等管理員把自己踢掉。社長要先解散或交接，所以不給退出。 */}
                {!isLeader && (
                    <div style={{ padding: '18px 24px 0', borderTop: `1px solid ${C.stone}` }}>
                        <motion.button {...pressProps('row')} onClick={onLeave}
                            style={{
                                width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                                background: 'transparent', border: `1.5px solid ${C.pebble}`, borderRadius: 4, cursor: 'pointer', color: C.sub,
                            }}>
                            <CornerDownRight size={15} />
                            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em' }}>退出社團</span>
                        </motion.button>
                    </div>
                )}

                {/* Danger Zone — long press to unlock */}
                {isLeader && (
                    <div style={{ padding: '20px 24px 0', borderTop: `1px solid ${C.stone}` }}>
                        {dissolveReady ? (
                            <motion.button
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                onClick={onDissolve}
                                style={{ width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: C.accent, border: 'none', borderRadius: 4, cursor: 'pointer', color: 'white' }}>
                                <Trash2 size={15} />
                                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase' }}>確認解散社團</span>
                            </motion.button>
                        ) : (
                            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4, border: `1.5px dashed ${C.accent}40` }}>
                                {/* Progress fill */}
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${dissolveHold}%`, background: `${C.accent}18`, transition: dissolveHold === 0 ? 'width 0.3s' : 'none', pointerEvents: 'none' }} />
                                {/* Bottom progress bar */}
                                <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, width: `${dissolveHold}%`, background: C.accent, transition: dissolveHold === 0 ? 'width 0.3s' : 'none' }} />
                                <motion.button {...pressProps('row')}
 onMouseDown={startDissolveHold}
 onMouseUp={cancelDissolveHold}
 onMouseLeave={cancelDissolveHold}
 onTouchStart={startDissolveHold}
 onTouchEnd={cancelDissolveHold}
 style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: C.accent, position: 'relative', zIndex: 1 }}>
                                    <Trash2 size={15} />
                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', }}>
                                        {dissolveHold > 0 ? `長按中… ${Math.round(dissolveHold)}%` : '長按解散社團'}
                                    </span>
                                </motion.button>
                            </div>
                        )}
                        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.sub, opacity: 0.4, textAlign: 'center', marginTop: 10 }}>Danger Zone — Irreversible</p>
                    </div>
                )}
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ CREATE CLUB WIZARD — Swiss Magazine Edition ═══ */
const TYPE_PREFIX_MAP = {
    run: 'RUN', strength: 'STR', cycling: 'CYC', multisport: 'MLT',
    yoga: 'YGA', hiit: 'HIT', swimming: 'SWM', hiking: 'HIK', other: 'OTH',
};
const TYPE_LABEL_MAP = {
    run: '跑步', strength: '健身', cycling: '騎行', multisport: '混合',
    yoga: '瑜珈', hiit: 'HIIT', swimming: '游泳', hiking: '登山健行', other: '其他',
};
// 建立社團時的類型選項 —— 與設定頁共用同一份 CLUB_TYPES，id 不會再對不上
const WIZARD_TYPES = CLUB_TYPES.map((t) => ({ type: t.id, label: t.label.replace('社團', ''), sub: t.sub }));

const CreateClubWizard = ({ onClose, onCreate, clubType }) => {
    const [step, setStep] = useState(1); // 1=identity, 2=details, 3=settings
    const [data, setData] = useState({
        name: '', desc: '', avatar: null, customAvatar: null,
        cover: COVERS[0], isPublic: true, location: '', tags: [],
        type: clubType || 'run',
    });
    const fileRef = useRef(null);
    const coverFileRef = useRef(null);
    const [submitting, setSubmitting] = useState(false); // 防止建立期間重複點擊
    /* 🏗️ 建立門檻（實績 + 天數 + 社長上限）。
       原本沒有任何限制 —— 任何人都能無限開空社團，稀釋搜尋結果。
       差多少一定要講出來，不能只把按鈕變灰讓人不知道為什麼。 */
    const creation = useMemo(() => checkClubCreation(getUserId()), []);
    const tags = TAG_LIBRARY[data.type] || TAG_LIBRARY.run;
    const prefix = TYPE_PREFIX_MAP[data.type] || 'OTH';
    const previewId = `${prefix}-XXXX`;

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setData(d => ({ ...d, customAvatar: ev.target.result }));
        reader.readAsDataURL(file);
    };

    const handleCoverUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setData(d => ({ ...d, cover: ev.target.result }));
        reader.readAsDataURL(file);
    };

    const canNext1 = data.name.trim().length >= 2;
    const canNext2 = !!data.location;
    const canSubmit = canNext1 && canNext2;

    const STEPS = [
        { n: 1, label: '名稱' },
        { n: 2, label: '介紹' },
        { n: 3, label: '權限' },
    ];

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100100] bg-black/70 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 280 }}
                className="fixed bottom-0 left-0 right-0 z-[100100] max-w-[440px] mx-auto">

                <div style={{
                    background: '#F6F4F1',
                    borderRadius: '0',
                    borderTop: `3px solid ${C.text}`,
                    display: 'flex', flexDirection: 'column',
                    maxHeight: '92dvh',
                    paddingBottom: 'max(24px,env(safe-area-inset-bottom))',
                }}>

                    {/* Masthead */}
                    <div style={{ padding: '22px 24px 16px', borderBottom: `1px solid ${C.stone}`, flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                {/* 原本這裡還有一行英文「NEW SQUAD」——跟下面的「建立社團」是同一句話，刪掉。 */}
                                <h3 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, textTransform: 'uppercase', fontFamily: 'var(--font-display)', margin: 0 }}>
                                    建立社團
                                </h3>
                                {/* Squad ID preview */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: C.sub }}>預覽 ID：</span>
                                    <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.15em', color: C.text, fontFamily: 'monospace', background: C.stone, padding: '2px 8px', borderRadius: 3 }}>{previewId}</span>
                                </div>
                            </div>
                            <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{
 width: 32, height: 32, borderRadius: '50%',
 background: C.text, border: 'none', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
 }}><X size={14} color="#F6F4F1" /></motion.button>
                        </div>

                        {/* Step progress — editorial horizontal rule style */}
                        <div style={{ display: 'flex', gap: 4 }}>
                            {STEPS.map(s => (
                                <div key={s.n} style={{ flex: 1 }}>
                                    <div style={{
                                        height: 2.5, borderRadius: 2,
                                        background: step >= s.n ? C.text : C.stone,
                                        transition: 'background 0.3s',
                                        marginBottom: 4,
                                    }} />
                                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: step >= s.n ? C.text : C.sub }}>{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                        <AnimatePresence mode="wait">

                            {/* Step 1 — Identity */}
                            {step === 1 && (
                                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

                                    {/* Cover */}
                                    <div style={{ marginBottom: 20 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub }}>封面照片</p>
                                            <motion.button {...pressProps('row')} onClick={() => coverFileRef.current?.click()} style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Upload size={11} /> 自訂</motion.button>
                                            <input ref={coverFileRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
                                        </div>
                                        <div style={{ position: 'relative', height: 140, overflow: 'hidden', marginBottom: 10, borderRadius: 0 }}>
                                            <img loading="lazy" decoding="async" src={squadAssetUrl(data.cover)} onError={onCoverError} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(30%) contrast(1.1)' }} />
                                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(22,20,21,0.5), transparent)' }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                                            {COVERS.map((url, i) => (
                                                <div key={i} onClick={() => setData(d => ({ ...d, cover: url }))}
                                                    style={{ width: 52, height: 36, flexShrink: 0, cursor: 'pointer', overflow: 'hidden', border: data.cover === url ? `2px solid ${C.text}` : `2px solid transparent`, opacity: data.cover === url ? 1 : 0.5, transition: 'all 0.15s', borderRadius: 2 }}>
                                                    <img loading="lazy" decoding="async" src={squadAssetUrl(url)} onError={onCoverError} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Avatar */}
                                    <div style={{ marginBottom: 20 }}>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 10 }}>社團頭貼</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                                            <div style={{ width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, background: C.stone, border: `2px solid ${C.text}`, overflow: 'hidden', borderRadius: 4 }}>
                                                {data.customAvatar ? <img loading="lazy" decoding="async" src={data.customAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : data.avatar}
                                            </div>
                                            <motion.button {...pressProps('row')} onClick={() => fileRef.current?.click()} style={{ padding: '8px 16px', background: C.stone, border: `1px solid ${C.pebble}`, borderRadius: 4, fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}><Camera size={12} /> 自訂上傳</motion.button>
                                            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {AVATARS.map(a => (
                                                <motion.button {...pressProps('row')} key={a} onClick={() => setData(d => ({ ...d, avatar: a, customAvatar: null }))}
 style={{ width: 38, height: 38, fontSize: 20, cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', background: !data.customAvatar && data.avatar === a ? C.text : C.stone, border: !data.customAvatar && data.avatar === a ? `2px solid ${C.text}` : `2px solid transparent` }}>
                                                    {a}
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Name */}
                                    <div style={{ marginBottom: 16 }}>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 8 }}>社團名稱 *</p>
                                        <input value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                                            placeholder="例如：大安森林夜跑團"
                                            style={{ width: '100%', padding: '13px 16px', fontSize: 16, fontWeight: 700, color: C.text, background: 'white', border: `1.5px solid ${data.name.trim().length > 0 && !canNext1 ? C.accent : data.name ? C.text : C.pebble}`, borderRadius: 4, outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s', fontFamily: 'inherit' }} />
                                        {data.name.trim().length > 0 && !canNext1 && (
                                            <p style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginTop: 6 }}>名稱至少需要 2 個字（目前 {data.name.trim().length} 字）</p>
                                        )}
                                    </div>

                                    {/* Desc */}
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 8 }}>社團介紹</p>
                                        <textarea value={data.desc} onChange={e => setData(d => ({ ...d, desc: e.target.value }))}
                                            placeholder="寫下社團的宗旨、固定訓練時間..."
                                            rows={3}
                                            style={{ width: '100%', padding: '13px 16px', fontSize: 14, fontWeight: 500, color: C.text, background: 'white', border: `1.5px solid ${C.pebble}`, borderRadius: 4, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }} />
                                    </div>
                                </motion.div>
                            )}

                            {/* Step 2 — Details */}
                            {step === 2 && (
                                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

                                    {/* Type selector */}
                                    <div style={{ marginBottom: 24 }}>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 12 }}>社團類型</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                            {WIZARD_TYPES.map(({ type, label, sub }) => {
                                                const pfx = TYPE_PREFIX_MAP[type];
                                                const sel = data.type === type;
                                                return (
                                                    <motion.button {...pressProps('row')} key={type} onClick={() => setData(d => ({ ...d, type, tags: [] }))}
 style={{ padding: '14px 10px', borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s', background: sel ? C.text : 'white', border: `1.5px solid ${sel ? C.text : C.pebble}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
                                                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: sel ? C.accent : C.pebble, fontFamily: 'monospace' }}>{pfx}</span>
                                                        <span style={{ fontSize: 15, fontWeight: 900, color: sel ? '#F6F4F1' : C.text, lineHeight: 1 }}>{label}</span>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: sel ? 'rgba(246,244,241,0.6)' : C.sub, lineHeight: 1.2 }}>{sub}</span>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Region — 手動輸入（下拉的縣市/行政區資料不完整，改由使用者自填最準） */}
                                    <div style={{ marginBottom: 24 }}>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 12 }}>所在地區</p>
                                        <div style={{ position: 'relative' }}>
                                            <MapPin size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: C.sub, opacity: 0.5 }} />
                                            <input value={data.location} onChange={e => setData(d => ({ ...d, location: e.target.value }))}
                                                placeholder="例如：新北市板橋區 / Tokyo"
                                                style={{ width: '100%', padding: '13px 14px 13px 36px', fontSize: 15, fontWeight: 700, color: C.text, background: 'white', border: `1.5px solid ${data.location ? C.text : C.pebble}`, borderRadius: 4, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border 0.2s' }} />
                                        </div>
                                        <p style={{ fontSize: 11, fontWeight: 500, color: C.sub, marginTop: 6 }}>填縣市或更精確的地點，方便附近的人找到你的社團</p>
                                    </div>

                                    {/* Tags */}
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 12 }}>社團標籤 (最多 5 個)</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {tags.map(t => {
                                                const isSel = data.tags.includes(t.label);
                                                return (
                                                    <motion.button {...pressProps('row')} key={t.id} onClick={() => {
 if (isSel) setData(d => ({ ...d, tags: d.tags.filter(l => l !== t.label) }));
 else if (data.tags.length < 5) setData(d => ({ ...d, tags: [...d.tags, t.label] }));
 }} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s', background: isSel ? C.text : 'white', color: isSel ? '#F6F4F1' : C.sub, border: `1px solid ${isSel ? C.text : C.pebble}` }}>
                                                        {t.emoji} {t.label}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Step 3 — Settings */}
                            {step === 3 && (
                                <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

                                    {/* Privacy */}
                                    <div style={{ marginBottom: 28 }}>
                                        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', color: C.sub, marginBottom: 12 }}>隱私設定</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            {[
                                                { val: true, icon: <Globe size={22} />, label: '公開社團', sub: '誰都找得到，也能直接加入' },
                                                { val: false, icon: <Lock size={22} />, label: '私密社團', sub: '要你核准才進得來' },
                                            ].map(opt => (
                                                <motion.button {...pressProps('row')} key={String(opt.val)} onClick={() => setData(d => ({ ...d, isPublic: opt.val }))}
 style={{ padding: '18px 16px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', background: data.isPublic === opt.val ? C.text : 'white', border: `1.5px solid ${data.isPublic === opt.val ? C.text : C.pebble}`, borderRadius: 4 }}>
                                                    <div style={{ color: data.isPublic === opt.val ? '#F6F4F1' : C.sub, marginBottom: 10 }}>{opt.icon}</div>
                                                    <p style={{ fontSize: 13, fontWeight: 900, color: data.isPublic === opt.val ? '#F6F4F1' : C.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{opt.label}</p>
                                                    <p style={{ fontSize: 11, fontWeight: 500, color: data.isPublic === opt.val ? 'rgba(250,250,248,0.5)' : C.sub, lineHeight: 1.4 }}>{opt.sub}</p>
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Summary card — editorial */}
                                    <div style={{ background: C.stone, borderTop: `2px solid ${C.text}`, padding: '20px 20px' }}>
                                        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', color: C.accent, marginBottom: 12 }}>確認一下</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                                            <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: 'white', border: `1.5px solid ${C.pebble}`, borderRadius: 4, flexShrink: 0, overflow: 'hidden' }}>
                                                {data.customAvatar ? <img loading="lazy" decoding="async" src={data.customAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : data.avatar}
                                            </div>
                                            <div>
                                                <p style={{ fontSize: 16, fontWeight: 900, color: C.text, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{data.name || '—'}</p>
                                                <p style={{ fontSize: 11, fontWeight: 700, color: C.sub, marginTop: 3 }}>{data.location || '地區未設定'} · {data.isPublic ? '公開' : '私密'}</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: C.sub, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Squad ID：</span>
                                            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.12em', color: C.text, fontFamily: 'monospace', background: 'white', padding: '3px 10px', borderRadius: 3, border: `1px solid ${C.pebble}` }}>{previewId}</span>
                                            <span style={{ fontSize: 11, color: C.sub, fontStyle: 'italic' }}>(建立後自動分配)</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer Navigation */}
                    <div style={{ padding: '16px 24px 0', borderTop: `1px solid ${C.stone}`, flexShrink: 0, display: 'flex', gap: 10 }}>
                        {step > 1 && (
                            <motion.button {...pressProps('row')} onClick={() => setStep(s => s - 1)} style={{ width: 48, height: 48, flexShrink: 0, background: C.stone, border: `1px solid ${C.pebble}`, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text }}>
                                <ChevronLeft size={20} />
                            </motion.button>
                        )}
                        {/* 開團條件：沒過的話要看得到「差多少」 */}
                        {step === 3 && !creation.allowed && (
                            <div style={{ width: '100%', marginBottom: 14, padding: '14px 16px', background: 'white', border: `1px solid ${C.stone}`, borderRadius: 12 }}>
                                <p style={{ fontSize: 13.5, fontWeight: 800, color: C.text, margin: '0 0 3px' }}>還差一點就能開團</p>
                                <p style={{ fontSize: 12.5, color: C.sub, margin: '0 0 11px', lineHeight: 1.6 }}>
                                    社團的價值來自裡面有人，所以先練一陣子再開團。
                                </p>
                                {creation.checks.map((ck) => (
                                    <div key={ck.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0' }}>
                                        <span style={{
                                            width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: ck.met ? 'rgba(90,122,58,0.14)' : 'rgba(22,20,21,0.06)',
                                            border: `1px solid ${ck.met ? 'rgba(90,122,58,0.5)' : 'rgba(22,20,21,0.14)'}`,
                                        }}>
                                            {ck.met && (
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5A7A3A" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                            )}
                                        </span>
                                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: ck.met ? C.sub : C.text }}>{ck.label}</span>
                                        <span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, color: ck.met ? C.sub : C.accent }}>
                                            {ck.reverse ? `${ck.current} / 上限 ${ck.need}` : `${ck.current} / ${ck.need}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {step < 3 ? (
                            <motion.button {...pressProps('row')} onClick={() => setStep(s => s + 1)} disabled={step === 1 ? !canNext1 : !canNext2}
 style={{ flex: 1, height: 48, background: (step === 1 ? canNext1 : canNext2) ? C.text : C.stone, border: 'none', borderRadius: 4, cursor: (step === 1 ? canNext1 : canNext2) ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', color: (step === 1 ? canNext1 : canNext2) ? '#F6F4F1' : C.sub, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                下一步 <ChevronRight size={14} />
                            </motion.button>
                        ) : (
                            <motion.button {...pressProps('row')}
 onClick={async () => {
 if (submitting || !canSubmit || !creation.allowed) return;
 setSubmitting(true);
 try { await onCreate(data); }
 finally { setSubmitting(false); }
 }}
 disabled={!canSubmit || submitting || !creation.allowed}
 style={{ flex: 1, height: 52, background: (canSubmit && !submitting && creation.allowed) ? C.accent : C.stone, border: 'none', borderRadius: 4, cursor: (canSubmit && !submitting && creation.allowed) ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: (canSubmit && !submitting && creation.allowed) ? 'white' : C.sub, transition: 'all 0.2s' }}>
                                {submitting ? '建立中…' : (creation.allowed ? '立即建立社團' : '尚未達到開團條件')}
                            </motion.button>
                        )}
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ CANVAS AURORA VIBE WAVE (高斯峰形・非線性呼吸・顏色層次版) ═══ */
const ThreeVibeWave = ({ tierLevel, tierFill, c1, c2 }) => {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);
    const startRef = useRef(null);

    const c3Map = { 0: '#D4A870', 1: '#78C8E8', 2: '#F0C840', 3: '#C878F0' };
    const c3 = c3Map[tierLevel] || c3Map[0];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const t = tierFill / 100;

        // hex → [r,g,b]
        const hexToRgb = (h) => [
            parseInt(h.slice(1, 3), 16),
            parseInt(h.slice(3, 5), 16),
            parseInt(h.slice(5, 7), 16),
        ];

        // 非線性呼吸：峰頂停留久、谷底快速掠過
        const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

        // 高斯峰形
        const gaussPeak = (x, center, sigma) => {
            const dx = (x - center) / sigma;
            return Math.exp(-dx * dx * 0.5);
        };

        const rgb1 = hexToRgb(c1);
        const rgb2 = hexToRgb(c2);
        const rgb3 = hexToRgb(c3);

        // 峰定義：[x位置, sigma寬度, 基礎高度, rgb, 速度, 相位偏移]
        const peaks = [
            { cx: 0.22, sig: 0.18 + t * 0.08, baseH: 0.28 + t * 0.52, rgb: rgb1, spd: 0.80, phase: 0.00 },
            { cx: 0.58, sig: 0.14 + t * 0.07, baseH: 0.20 + t * 0.45, rgb: rgb2, spd: 0.65, phase: 0.38 },
            { cx: 0.82, sig: 0.12 + t * 0.06, baseH: 0.16 + t * 0.38, rgb: rgb3, spd: 0.55, phase: 0.62 },
            { cx: 0.42, sig: 0.10 + t * 0.05, baseH: 0.10 + t * 0.28, rgb: rgb2, spd: 0.72, phase: 0.50 },
        ];

        const draw = (ts) => {
            if (!startRef.current) startRef.current = ts;
            const time = (ts - startRef.current) / 6000; // 6s 完整週期

            const W = canvas.width;
            const H = canvas.height;
            ctx.clearRect(0, 0, W, H);

            // 逐列計算疊加光量
            const colR = new Float32Array(W);
            const colG = new Float32Array(W);
            const colB = new Float32Array(W);

            for (let px = 0; px < W; px++) {
                const nx = px / W;

                for (const p of peaks) {
                    // 非線性呼吸
                    const phase = (time * p.spd + p.phase) % 1;
                    const breath = easeInOutSine(Math.abs(Math.sin(phase * Math.PI)));

                    // 峰高 = 基礎 + 呼吸振幅
                    const amp = 0.06 + t * 0.16;
                    const peakH = p.baseH + breath * amp;

                    // 峰頂緩慢水平漂移
                    const driftAmp = 0.035 + t * 0.055;
                    const driftPhase = (time * p.spd * 0.28 + p.phase * 1.7) % 1;
                    const cx = p.cx + Math.sin(driftPhase * Math.PI * 2) * driftAmp;

                    const brightness = gaussPeak(nx, cx, p.sig) * peakH;

                    // 顏色層次：亮度高 → 偏亮色，亮度低 → 偏深色
                    const colorRatio = Math.min(1, brightness / Math.max(p.baseH * 0.6, 0.01));
                    const mix = 0.55 + colorRatio * 0.45;

                    colR[px] += p.rgb[0] * brightness * mix;
                    colG[px] += p.rgb[1] * brightness * mix;
                    colB[px] += p.rgb[2] * brightness * mix;
                }
            }

            // 逐列渲染垂直漸層
            for (let px = 0; px < W; px++) {
                const cr = Math.min(255, colR[px]);
                const cg = Math.min(255, colG[px]);
                const cb = Math.min(255, colB[px]);
                const maxA = Math.min(1, (cr + cg + cb) / (255 * 1.4));
                if (maxA < 0.005) continue;

                const grad = ctx.createLinearGradient(0, H, 0, 0);
                const r = cr | 0, g = cg | 0, b = cb | 0;
                grad.addColorStop(0, `rgba(${r},${g},${b},${maxA.toFixed(3)})`);
                grad.addColorStop(0.32, `rgba(${r},${g},${b},${(maxA * 0.52).toFixed(3)})`);
                grad.addColorStop(0.62, `rgba(${r},${g},${b},${(maxA * 0.16).toFixed(3)})`);
                grad.addColorStop(1, `rgba(0,0,0,0)`);

                ctx.fillStyle = grad;
                ctx.fillRect(px, 0, 1, H);
            }

            // 底部薄光帶（把各峰底部連起來）
            const [br, bg, bb] = rgb1;
            const baseGrad = ctx.createLinearGradient(0, H, 0, H - 14);
            baseGrad.addColorStop(0, `rgba(${br},${bg},${bb},${(0.18 + t * 0.22).toFixed(3)})`);
            baseGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = baseGrad;
            ctx.fillRect(0, 0, W, H);

            rafRef.current = requestAnimationFrame(draw);
        };

        // canvas 尺寸同步容器
        const resizeObserver = new ResizeObserver(() => {
            if (!canvas.parentElement) return;
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = Math.round(rect.width * Math.min(window.devicePixelRatio, 2));
            canvas.height = Math.round(rect.height * Math.min(window.devicePixelRatio, 2));
        });
        resizeObserver.observe(canvas.parentElement);

        // 初始尺寸
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect) {
            const dpr = Math.min(window.devicePixelRatio, 2);
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        }

        rafRef.current = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(rafRef.current);
            resizeObserver.disconnect();
        };
    }, [tierLevel, tierFill, c1, c2, c3]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        />
    );
};

/* ═══ LIGHTWEIGHT LIQUID CHALLENGE CARD ═══ */
const WaveformChallengeCard = ({ c, club, userId, ac, canAdmin, onUpdate, onView }) => {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);
    const startRef = useRef(null);

    const pct = Math.min(100, (c.progress / Math.max(c.target, 1)) * 100);
    const contribs = c.contributors || [];
    const isComplete = pct >= 100;
    const cColor = c.color || ac || '#4898C0'; // Add fallback color
    const [badgeAnim, setBadgeAnim] = useState(null);

    // ── 依任務屬性 (type/theme) 判斷顏色主題 (對應 Figure 2 的四種典雅色彩) ──
    const getTheme = (c) => {
        const themeName = (c.theme || '').toLowerCase();
        // 語意化映射到四種新色彩
        if (themeName.includes('burn') || themeName.includes('hero') || c.type === 'sync') return 'orange'; // 燃脂突擊 -> 橘色
        if (themeName.includes('zen') || themeName.includes('yoga') || c.type === 'wellness') return 'olive'; // 核心靜心 -> 橄欖綠
        if (themeName.includes('bird') || themeName.includes('morning')) return 'yellow'; // 晨鳥行動 -> 黃色
        return 'cream'; // 週末巡航、極光探索 -> 奶油白
    };

    // 這四種主題：底色統一用 Paper，波浪填充用圖二的四種套色
    const THEMES = {
        orange: {
            bg: C.stone,
            text: C.text,
            subText: C.sub,
            fills: ['rgba(232,122,30,0.85)', 'rgba(232,122,30,0.55)', 'rgba(232,122,30,0.30)'],
            line: 'rgba(255,180,100,0.85)',
            glow: 'rgba(232,122,30,0.40)',
            shimmer: 'rgba(255,200,140,0.50)',
            accent: '#C96000',
            border: C.pebble,
            shadow: 'rgba(0,0,0,0.4)',
        },
        olive: {
            bg: C.stone,
            text: C.text,
            subText: C.sub,
            fills: ['rgba(123,148,93,0.85)', 'rgba(123,148,93,0.55)', 'rgba(123,148,93,0.30)'],
            line: 'rgba(160,200,120,0.85)',
            glow: 'rgba(123,148,93,0.40)',
            shimmer: 'rgba(180,220,140,0.50)',
            accent: '#4F7030',
            border: C.pebble,
            shadow: 'rgba(0,0,0,0.4)',
        },
        yellow: {
            bg: C.stone,
            text: C.text,
            subText: C.sub,
            fills: ['rgba(248,227,112,0.90)', 'rgba(248,227,112,0.60)', 'rgba(248,227,112,0.35)'],
            line: 'rgba(255,245,160,0.90)',
            glow: 'rgba(248,227,112,0.50)',
            shimmer: 'rgba(255,250,200,0.55)',
            accent: '#A68A00',
            border: C.pebble,
            shadow: 'rgba(0,0,0,0.4)',
        },
        cream: {
            bg: C.stone,
            text: C.text,
            subText: C.sub,
            fills: ['rgba(212, 168, 67, 0.85)', 'rgba(212, 168, 67, 0.55)', 'rgba(212, 168, 67, 0.30)'],
            line: 'rgba(255,255,255,0.4)',
            glow: 'rgba(212, 168, 67, 0.40)',
            shimmer: 'rgba(255,255,255,0.30)',
            accent: '#8A8168',
            border: C.pebble,
            shadow: 'rgba(0,0,0,0.4)',
        },
    };

    const theme = THEMES[getTheme(c)] || THEMES.orange;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // 波浪間距展開，提升寬幅政悸度讓波峰足夠顧眼
        const WAVES = [
            { amp: 0.12, freq: 1.2, spd: 0.45, ph: 0.00, fillIdx: 0 },
            { amp: 0.09, freq: 1.9, spd: 0.33, ph: 1.57, fillIdx: 1 },
            { amp: 0.06, freq: 0.8, spd: 0.25, ph: 3.14, fillIdx: 2 },
        ];

        // 3~4 個高光漂移點
        const GLINTS = [
            { rx: 0.20, ry: 0.55, spd: 0.35, ph: 0.0 },
            { rx: 0.62, ry: 0.40, spd: 0.28, ph: 2.1 },
            { rx: 0.82, ry: 0.65, spd: 0.42, ph: 1.3 },
            { rx: 0.44, ry: 0.30, spd: 0.22, ph: 3.8 },
        ];

        const buildWavePath = (W, H, baseY, wave, t) => {
            const path = new Path2D();
            path.moveTo(0, H);
            const steps = Math.ceil(W / 3); // 每 3px 一個點就夠，更省
            for (let i = 0; i <= steps; i++) {
                const x = (i / steps) * W;
                const nx = x / W;
                const y = baseY
                    + Math.sin(nx * Math.PI * wave.freq + t * wave.spd * Math.PI + wave.ph) * H * wave.amp
                    + Math.sin(nx * Math.PI * wave.freq * 1.5 - t * wave.spd * 0.5 * Math.PI) * H * wave.amp * 0.3;
                path.lineTo(x, y);
            }
            path.lineTo(W, H);
            path.closePath();
            return path;
        };

        const draw = (ts) => {
            if (!startRef.current) startRef.current = ts;
            const t = (ts - startRef.current) / 1000;
            const W = canvas.width;
            const H = canvas.height;

            ctx.clearRect(0, 0, W, H);

            // pct=15 時，實際 fillFrac = 0.32 + 0.15*0.63 = 0.415，繓對有明顯的水波高度
            const minFill = 0.32;
            const maxFill = 0.95;
            const fillFrac = minFill + (pct / 100) * (maxFill - minFill);
            const breathe = Math.sin(t * 0.5) * 0.010;
            const baseY = H * (1 - fillFrac + breathe);

            // ── 1. 背景（水面以上）
            ctx.fillStyle = theme.bg;
            ctx.fillRect(0, 0, W, H);

            // ── 2. 三層波浪疊加（從後往前）
            WAVES.forEach((wave, wi) => {
                const layerBase = baseY + wi * H * 0.018; // 後層略低
                const path = buildWavePath(W, H, layerBase, wave, t);

                const grad = ctx.createLinearGradient(0, layerBase, 0, H);
                const fills = theme.fills;
                grad.addColorStop(0, fills[wi] || fills[fills.length - 1]);
                grad.addColorStop(0.7, fills[Math.min(wi + 1, fills.length - 1)]);
                grad.addColorStop(1, fills[Math.min(wi + 1, fills.length - 1)]);  // 底部保持調性，不要源成黑色

                ctx.fillStyle = grad;
                ctx.fill(path);
            });

            // ── 3. 橫向流動光澤
            const shineX = (Math.sin(t * 0.28) * 0.5 + 0.5) * W;
            const shineGrad = ctx.createLinearGradient(shineX - W * 0.3, 0, shineX + W * 0.3, 0);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
            shineGrad.addColorStop(0.4, theme.shimmer);
            shineGrad.addColorStop(0.5, theme.shimmer.replace(/[\d.]+\)$/, '0.60)'));
            shineGrad.addColorStop(0.6, theme.shimmer);
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.fillStyle = shineGrad;
            ctx.fill(buildWavePath(W, H, baseY, WAVES[0], t));

            // ── 4. 主波輪廓線（發光邊緣）
            const topPath = new Path2D();
            const steps2 = Math.ceil(W / 3);
            for (let i = 0; i <= steps2; i++) {
                const x = (i / steps2) * W;
                const nx = x / W;
                const y = baseY
                    + Math.sin(nx * Math.PI * WAVES[0].freq + t * WAVES[0].spd * Math.PI) * H * WAVES[0].amp
                    + Math.sin(nx * Math.PI * WAVES[0].freq * 1.5 - t * WAVES[0].spd * 0.5 * Math.PI) * H * WAVES[0].amp * 0.3;
                if (i === 0) topPath.moveTo(x, y);
                else topPath.lineTo(x, y);
            }
            ctx.strokeStyle = theme.line;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = theme.glow;
            ctx.shadowBlur = 10;
            ctx.stroke(topPath);
            ctx.shadowBlur = 0;

            // ── 5. 高光漂移點（screen 混合）
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            for (const g of GLINTS) {
                const gx = (g.rx + Math.sin(t * g.spd + g.ph) * 0.10) * W;
                const gy = (g.ry + Math.cos(t * g.spd * 0.8 + g.ph) * 0.06)
                    * (H - baseY) + baseY;
                const gr = W * (0.06 + Math.sin(t * g.spd * 1.2 + g.ph) * 0.02);
                const ga = 0.14 + Math.sin(t * g.spd + g.ph) * 0.06;

                const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
                rg.addColorStop(0, theme.shimmer.replace(/[\d.]+\)$/, `${ga + 0.15})`));
                rg.addColorStop(0.4, theme.shimmer.replace(/[\d.]+\)$/, `${ga * 0.5})`));
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath();
                ctx.arc(gx, gy, gr, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            rafRef.current = requestAnimationFrame(draw);
        };

        const init = () => {
            if (!canvas.parentElement) return;
            const dpr = Math.min(window.devicePixelRatio, 2);
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            ctx.scale(dpr, dpr);
        };

        const ro = new ResizeObserver(init);
        if (canvas.parentElement) { ro.observe(canvas.parentElement); init(); }
        rafRef.current = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
    }, [pct, cColor]);

    return (
        <div
            onClick={() => onView(c)}
            style={{
                borderRadius: 28, marginBottom: 16, overflow: 'hidden',
                cursor: 'pointer', position: 'relative',
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                boxShadow: `0 14px 40px ${theme.shadow}, 0 2px 6px rgba(0,0,0,0.25)`,
                transition: 'transform 0.15s',
            }}
            onPointerDown={e => e.currentTarget.style.transform = 'scale(0.985)'}
            onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
            <div style={{ position: 'relative', height: 160 }}>
                <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

                {/* 頂部：圖示 + 標題 + 操作 */}
                <div style={{ position: 'absolute', top: 14, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: 13,
                            background: 'rgba(255,255,255,0.65)',
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${theme.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 2px 8px rgba(0,0,0,0.05)`,
                        }}><ChallengeIcon id={c.icon} size={19} color={theme.text} fallback={c.category === 'challenge' ? 'trophy' : 'target'} /></div>
                        <div>
                            <p style={{ color: theme.text, fontSize: 14, fontWeight: 900, lineHeight: 1.2, margin: 0, textShadow: '0 1px 2px rgba(255,255,255,0.9)' }}>{c.title}</p>
                            {c.theme && <p style={{ color: theme.accent, fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0, opacity: 0.9 }}>{c.theme}</p>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {/* 「領取」按鈕已移除 —— 完成的挑戰現在會自動累積進展示櫃
                            （見 socialDataConnector.ensureMonthlyChallenges）。
                            要使用者手動按一下才算數，就會有人忘了按、數字就不準。 */}
                        {canAdmin && (
                            <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); onUpdate({ ...club, activeChallenges: club.activeChallenges.filter(ch => ch.id !== c.id) }); }}
 style={{ width: 30, height: 30, borderRadius: 15, background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Trash2 size={13} color={theme.subText} />
                            </motion.button>
                        )}
                    </div>
                </div>

                {/* 底部：百分比 + 貢獻者 */}
                <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 3 }}>
                    <div>
                        <span style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: theme.text, textShadow: `0 0 16px rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.05)` }}>
                            {Math.round(pct)}%
                        </span>
                        <p style={{ color: theme.subText, fontSize: 11, fontWeight: 700, margin: '2px 0 0' }}>
                            {(c.progress || 0).toLocaleString()} / {(c.target || 0).toLocaleString()} {c.unit}
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                            {contribs.slice(0, 4).map((uid, i) => {
                                const m = (club.leaderboard || []).find(mb => mb.userId === uid);
                                /* 🩹 原本沒有頭像就印一個 👤 —— 四個貢獻者長得一模一樣，等於沒有資訊。
                                   改成名字首字：至少看得出是誰，也不用 emoji。 */
                                const initial = String(m?.name || '').trim().charAt(0).toUpperCase();
                                return <div key={uid} title={m?.name || ''} style={{ width: 24, height: 24, borderRadius: 12, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)', border: `1.5px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: theme.text, marginLeft: i > 0 ? -7 : 0, zIndex: 4 - i, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                                    {m?.avatar || initial || <Users size={11} strokeWidth={2.2} color={theme.subText} />}
                                </div>;
                            })}
                        </div>
                        <p style={{ color: theme.subText, fontSize: 11, fontWeight: 700, margin: 0 }}>{contribs.length} 人貢獻中</p>
                    </div>
                </div>
            </div>

            {/* 底部資訊條 */}
            <div style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(12px)', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                {c.vibeBoost && <>
                    <Flame size={11} color={theme.text} />
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, opacity: 0.9 }}>完成後活躍程度 +{c.vibeBoost}%</span>
                </>}
                {c.badge && <span style={{ color: theme.text, fontSize: 11, fontWeight: 700, marginLeft: 'auto', textShadow: '0 1px 2px rgba(255,255,255,0.3)' }}>{isComplete ? '已完成' : '完成解鎖徽章'}</span>}
            </div>

            {/* ── 徽章領取動畫 Portal ── */}
            {createPortal(
                <AnimatePresence>
                    {badgeAnim && (
                        <motion.div
                            key="badge-anim-modal"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 999999,
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(0,0,0,0.75)',
                                backdropFilter: 'blur(12px)',
                            }}
                            onClick={() => setBadgeAnim(null)}
                        >
                            {/* 光環背景 */}
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: [0, 1.3, 1], opacity: [0, 0.4, 0.15] }}
                                transition={{ duration: 0.7, ease: 'easeOut' }}
                                style={{
                                    position: 'absolute',
                                    width: 280, height: 280,
                                    borderRadius: '50%',
                                    background: `radial-gradient(circle, ${badgeAnim.color}80, transparent 70%)`,
                                    filter: 'blur(20px)',
                                }}
                            />

                            {/* 粒子爆炸（用 CSS 模擬） */}
                            {[...Array(8)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                    animate={{
                                        x: Math.cos((i / 8) * Math.PI * 2) * 120,
                                        y: Math.sin((i / 8) * Math.PI * 2) * 120,
                                        opacity: 0,
                                        scale: 0.3,
                                    }}
                                    transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
                                    style={{
                                        position: 'absolute',
                                        width: 8, height: 8,
                                        borderRadius: '50%',
                                        background: badgeAnim.color,
                                        boxShadow: `0 0 10px ${badgeAnim.color}`,
                                    }}
                                />
                            ))}

                            {/* 主徽章 */}
                            <motion.div
                                initial={{ scale: 0, rotate: -180, y: -60 }}
                                animate={{ scale: 1, rotate: 0, y: 0 }}
                                transition={{ type: 'spring', damping: 14, stiffness: 180, delay: 0.05 }}
                                style={{
                                    width: 120, height: 120,
                                    borderRadius: 36,
                                    background: `linear-gradient(145deg, ${badgeAnim.color}30, ${badgeAnim.color}60)`,
                                    border: `3px solid ${badgeAnim.color}80`,
                                    boxShadow: `0 0 40px ${badgeAnim.color}60, 0 0 80px ${badgeAnim.color}30, inset 0 2px 4px rgba(255,255,255,0.3)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 60, marginBottom: 24,
                                    position: 'relative',
                                }}
                            >
                                <span style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))' }}>
                                    {badgeAnim.icon}
                                </span>
                                {/* 閃光掃過 */}
                                <motion.div
                                    initial={{ x: -120, opacity: 0 }}
                                    animate={{ x: 120, opacity: [0, 0.6, 0] }}
                                    transition={{ duration: 0.6, delay: 0.4 }}
                                    style={{
                                        position: 'absolute', inset: 0,
                                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
                                        borderRadius: 36,
                                        overflow: 'hidden',
                                    }}
                                />
                            </motion.div>

                            {/* 文字 */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                style={{ textAlign: 'center' }}
                            >
                                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 900, letterSpacing: '0.3em', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                    <Award size={13} strokeWidth={2.2} /> 成就解鎖
                                </p>
                                <h2 style={{ color: 'white', fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
                                    {badgeAnim.title}
                                </h2>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700 }}>
                                    已加入成就展示庫
                                </p>
                            </motion.div>

                            {/* 底部進度條倒數 */}
                            <motion.div
                                initial={{ width: '60%' }}
                                animate={{ width: 0 }}
                                transition={{ duration: 2.5, delay: 0.3, ease: 'linear' }}
                                style={{
                                    height: 2,
                                    background: badgeAnim.color,
                                    borderRadius: 1,
                                    marginTop: 32,
                                    boxShadow: `0 0 8px ${badgeAnim.color}`,
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

/* ═══ CLUB DETAIL VIEW ═══ */
const ClubDetail = ({ club, onBack, onUpdate, userId, clubType }) => {
    const [tab, setTab] = useState('overview');
    const [showAdmin, setShowAdmin] = useState(false);
    /* 🩹 從「社團管理設定」點進去的子視窗，關掉之後應該回到管理設定，
       而不是一路彈回社團首頁 —— 使用者要連續改好幾項時每次都得重新點進來。
       從別處（例如點人數）開的同一個視窗則維持關掉就回原地。 */
    const [returnToAdmin, setReturnToAdmin] = useState(false);
    /* 全體成員的真實累積（後端）。拿不到就是 null —— 畫面要改口說
       「只看得到你自己的」，不能拿我一個人的數字冒充全社團。 */
    const [memberTotals, setMemberTotals] = useState(null);
    const openFromAdmin = (open) => { setShowAdmin(false); setReturnToAdmin(true); open(); };
    const closeSub = (close) => () => {
        close();
        if (returnToAdmin) { setReturnToAdmin(false); setShowAdmin(true); }
    };
    const [editField, setEditField] = useState(null);
    const [showMembers, setShowMembers] = useState(false);
    const [showXpInfo, setShowXpInfo] = useState(false);
    const [showChallenges, setShowChallenges] = useState(false);
    const [showPostActivity, setShowPostActivity] = useState(false);
    const [publishMine, setPublishMine] = useState(() => {
        try { return localStorage.getItem(`drvn_publish_${club.id}_${userId}`) !== 'false'; } catch { return true; }
    });
    const togglePublishMine = () => {
        setPublishMine(prev => {
            const nv = !prev;
            try { localStorage.setItem(`drvn_publish_${club.id}_${userId}`, String(nv)); } catch { /* ignore */ }
            return nv;
        });
    };
    const [viewingChallenge, setViewingChallenge] = useState(null);

    /* 📅 每月固定挑戰：自動帶入 + 自動累積。
       進到社團就檢查一次 —— 換月了就自動換上這個月的固定那組，
       已完成的自動記進展示櫃（以「完成過哪幾個月」去重，重複執行不會膨脹）。
       changed=false 時不寫回，避免無限的 update → render 迴圈。 */
    useEffect(() => {
        if (!club?.id) return;
        const { club: next, changed, newlyCompleted } = ensureMonthlyChallenges(club, userId);
        if (!changed) return;
        onUpdate(next);
        /* 自動累積不能靜悄悄 —— 使用者完成了一個挑戰，要讓他知道升到第幾階。
           newlyCompleted 是冪等的，同一筆只會回報一次，不會每次進來都跳。 */
        (newlyCompleted || []).forEach((n) => {
            const tierOf = (c) => (c >= 12 ? '鉑金' : c >= 6 ? '金牌' : c >= 3 ? '銀牌' : '銅牌');
            toast.success(`「${n.title}」完成 ${n.count} 次 — ${tierOf(n.count)}`);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [club?.id, club?.challengeMonth]);


    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const newMsg = { id: Date.now(), userId, name: getDisplayName(userId), avatar: null, image: event.target.result, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            onUpdate({ ...club, chat: [...(club.chat || []), newMsg] });
        };
        reader.readAsDataURL(file);
    };

    const sendSystemMsg = (text) => {
        const newMsg = { id: Date.now(), userId, name: getDisplayName(userId), avatar: null, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        onUpdate({ ...club, chat: [...(club.chat || []), newMsg] });
    };
    const handleDissolveClub = async () => {
        if ((await confirmDialog('確定要解散此社團嗎？此操作無法復原。', { danger: true }))) {
            onUpdate({ ...club, _dissolve: true });
        }
    };

    /* 退出社團：後端有 POST /{squad_id}/leave，前端一直沒有接。
       後端失敗就不要假裝退出成功 —— 那會讓本機看不到、別人卻還看得到我。 */
    const handleLeaveClub = async () => {
        const ok = await confirmDialog(
            `退出之後就看不到「${club.name}」的動態與討論，要再加入得重新申請。`,
            { title: '退出社團？', confirmText: '退出', cancelText: '留下', danger: true },
        );
        if (!ok) return;
        try {
            await apiClient.post(`/api/squads/${encodeURIComponent(club.squadId || club.id)}/leave`, { user_id: userId });
        } catch (err) {
            toast.error(failureDetail(err, '社團'));
            return;
        }
        toast.success(`已退出「${club.name}」`);
        onUpdate({ ...club, _leave: true });
    };


    // Safety check matching SquadsView destructuring
    /* 分頁順序 = 社團的用處由重到輕。
       社團的主軸是「人」：交流、開團、揪活動、討論；任務與徽章都只是加分項。
       原本的順序把「討論」排在最後一個，等於把最主要的互動場藏到最深 —— 現在往前。 */
    const TABS = [
        { id: 'overview', label: '總覽' },       // 這個社團是誰、現在什麼狀況
        { id: 'activity', label: '動態' },       // 今天誰在動
        { id: 'posts', label: '討論' },          // 交流 / 投票 / 揪團 ← 主要互動
        { id: 'leaderboard', label: '排行' },    // 人的比較
        { id: 'showroom', label: '展示櫃' },     // 加分項：固定挑戰的徽章
    ];

    useEffect(() => {
        let dead = false;
        const sid = club.squadId || club.id;
        loadSquadMemberTotals(sid, { days: 30 })
            .then((t) => { if (!dead) setMemberTotals(t); })
            .catch(() => { if (!dead) setMemberTotals({ ok: false }); });
        return () => { dead = true; };
    }, [club.squadId, club.id]);

    const ac = clubType === 'run' ? C.accent : C.sage;
    const vibeData = getWeeklyVibeData(club);
    const vibe = vibeData.tier;
    const myMember = club.leaderboard?.find(m => String(m.userId) === String(userId));
    const amLeader = club.leaderId === userId || myMember?.role === 'leader';
    const canAdmin = amLeader || myMember?.role === 'admin';

    // Added: Color variables for Vibe Progress Board
    const fillColor = vibe.color || (vibe.id === 'diamond' ? '#A7C7E7' : (vibe.id === 'gold' ? C.gold : (vibe.id === 'silver' ? '#C0C0C0' : C.accent)));
    const fillColorDeep = vibe.colorDeep || (vibe.id === 'diamond' ? '#4A90E2' : (vibe.id === 'gold' ? '#D4A843' : (vibe.id === 'silver' ? '#8C8C8C' : C.ember)));

    // ── Bookshelf Constants (Restoration) ──
    const SHELF_COLORS = {
        collective: { bar: '#BBAFA0', nameEn: 'Resonance Imprint', glass: 'rgba(187,175,160,0.15)', glow: 'rgba(187,175,160,0.3)', border: 'rgba(255,255,255,0.45)', style: 'clay', bg: '/download/-5.jpg' },
        division: { bar: '#888C86', nameEn: 'Dynamic Curation', glass: 'rgba(136,140,134,0.15)', glow: 'rgba(136,140,134,0.3)', border: 'rgba(255,255,255,0.45)', style: 'clay', bg: '/download/-2.jpg' },
        epic: { bar: '#A0A0A8', nameEn: 'Epics', glass: 'rgba(160,160,168,0.1)', glow: 'rgba(160,160,168,0.3)', border: 'rgba(255,255,255,0.45)', style: 'metal', bg: '/download/-2.jpg' },
        sync: { bar: '#4898C0', nameEn: 'Snergy', glass: 'rgba(72,152,192,0.15)', glow: 'rgba(72,152,192,0.3)', border: 'rgba(255,255,255,0.45)', style: 'crystal', bg: '/download/-5.jpg' },
        popup: { bar: '#E87A50', nameEn: 'Popups', glass: 'rgba(232,122,80,0.15)', glow: 'rgba(232,122,80,0.3)', border: 'rgba(255,255,255,0.45)', style: 'neon', bg: '/download/-3.jpg' },
        legacy: { bar: '#D4A843', nameEn: 'Legacy', glass: 'rgba(212,168,67,0.15)', glow: 'rgba(212,168,67,0.3)', border: 'rgba(255,255,255,0.45)', style: 'metal', bg: '/download/-6.jpg' },
    };

    // ═══════════════════════════════════════════════════════════════
    //  成就架構：軌道 (Track) × 階級 (Tier)
    //  ── 任務的 unit  → 落到哪一條「軌道」(里程/噸位/節奏/時長/出席)
    //  ── 任務的 perMember 目標量(由小到大) → 軌道內的「階級」(Bronze→Diamond)
    //  ── 徽章名只取核心名（去掉「本月/當月/X月」時間前綴）；count 記月度累計枚數
    //  徽章呈現只吃這三個欄位，之後換成設計稿時對映關係不變。
    // ═══════════════════════════════════════════════════════════════
    const sportType = club.type || clubType;
    const TIERS = [
        { key: 'bronze', label: 'Bronze', zh: '銅', color: '#C0844F' },
        { key: 'silver', label: 'Silver', zh: '銀', color: '#9DA2AC' },
        { key: 'gold', label: 'Gold', zh: '金', color: '#D4A84F' },
        { key: 'platinum', label: 'Platinum', zh: '白金', color: '#9C8FC0' },
        { key: 'diamond', label: 'Diamond', zh: '鑽石', color: '#6FA8DC' },
    ];
    /* 舊「木架展示庫」的 tracks 計算已移除 —— 那一頁改成「任務紀錄」之後
       這段每次 render 都白跑一次（把所有挑戰依單位分軌、算五階分級），
       但沒有任何畫面在讀它。 */


    // ── Weekly Vibe System ──
    const isDiamond = vibe.id === 'diamond';
    const isGoldPlus = vibe.id === 'gold' || isDiamond;

    // Auto-sync my workout data into club contributions
    const [streak, setStreak] = useState({ count: 0, thisWeekDone: false });
    useEffect(() => {
        const myData = getWorkoutDataForMember(userId);
        if (myData.hasValidWorkout && !(club.weeklyContributions || {})[userId]) {
            const updated = recordMemberActivity(club, userId);
            onUpdate(updated);
            bumpMemberStreak(club.id, userId);
        }
        setStreak(getMemberStreak(club.id, userId));
    }, [club.id]);

    // 🟢 真實數據：DEMO 灌入已移除（2026-07-06）。
    // 徽章只能透過「挑戰真實達標 → isComplete → 領取」進入 cabinet；
    // 空展示庫顯示鎖定徽章 = 誠實的目標牆，符合「不做假競爭」哲學。
    useEffect(() => {
        // demo 已停用（保留空 effect 維持 hook 順序）
    }, [club.id, club.trophyCabinet?.length]);


    /* 取消一個進行中的任務。取消之後在「建立任務」那份清單會重新出現，
       所以是可逆的 —— 但還是要確認，因為大家的貢獻進度會跟著消失。 */
    const handleCancelChallenge = async (c) => {
        const ok = await confirmDialog(
            `「${c.title}」會從總覽移除，大家在這個任務上的進度也不會再顯示。之後可以從「建立任務」重新開啟。`,
            { title: '取消這個任務？', confirmText: '取消任務', cancelText: '留著', danger: true },
        );
        if (!ok) return;
        const key = (x) => x.id || x.configId;
        onUpdate({ ...club, activeChallenges: (club.activeChallenges || []).filter((x) => key(x) !== key(c)) });
        toast.success(`已取消「${c.title}」`);
    };

    const handleCreateCustomChallenge = (data) => {
        const nc = { ...data, id: `cc_${Date.now()}`, isSystem: false, createdBy: userId, rsvpList: [userId] };
        onUpdate({ ...club, customChallenges: [...(club.customChallenges || []), nc] });
        setShowPostActivity(false);
    };

    return createPortal(
        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28 }}
            className="fixed inset-0 z-[100] flex flex-col overflow-y-auto custom-scrollbar" style={{ background: '#E8E9E6' }}>

            {/* ─── 頂部導航 (透明懸浮) ─── */}
            <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-[max(14px,env(safe-area-inset-top))] pb-2 flex justify-between items-start pointer-events-none">
                <motion.button {...pressProps('pill')} onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto backdrop-blur-md"
 style={{ background: 'rgba(22,20,21,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <ChevronLeft color="#F6F4F1" size={22} />
                </motion.button>
                <motion.button {...pressProps('pill')} onClick={() => setShowAdmin(true)} className="w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto backdrop-blur-md"
 style={{ background: 'rgba(22,20,21,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <Settings color="#F6F4F1" size={18} />
                </motion.button>
            </div>

            {/* ─── SWISS EDITORIAL HERO ─── */}
            <div className="relative w-full" style={{ background: '#E8E9E6' }}>

                {/* Cover image — full bleed, angled clip */}
                {/* 上下比例 ≈ 1:3 —— 封面佔一份，底下的內容佔三份。
                    以前是寫死的 300px，在 iPhone 上等於 36% 的螢幕都給了一張照片，
                    真正要看的東西（公告、課表、任務）全部被推到第二屏。
                    改用 dvh 才會跟著機型走，clamp 保證小機不塌、大機不爆。 */}
                {/* 封面往下讓出返回／設定那排按鈕（safe-area + 14 + 40 + 10），
                    不然在手機上按鈕會壓在照片上、跟上面的類型字卡在一起。 */}
                <div className="relative w-full overflow-hidden" style={{ marginTop: 'calc(env(safe-area-inset-top, 0px) + 64px)', height: 'clamp(150px, 20dvh, 240px)', clipPath: 'polygon(0 0, 100% 0, 100% 92%, 0 100%)' }}>
                    <img loading="lazy" decoding="async" src={squadCover(club)} onError={onCoverError} alt="" className="w-full h-full object-cover" style={{ filter: 'contrast(1.06) saturate(0.88)' }} />
                    {/* Two-layer fade: dark from bottom + paper from left column */}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(22,20,21,0.82) 0%, rgba(22,20,21,0.22) 52%, transparent 100%)' }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(22,20,21,0.55) 0%, transparent 55%)' }} />

                    {/* 封面大字：預設不顯示，只有社長／管理員在設定裡填了才出現 */}
                    {String(club.heroWord || '').trim() && (
                        <div className="absolute bottom-4 right-0 pointer-events-none overflow-hidden" style={{ maxWidth: '60%' }}>
                            <p className="font-black uppercase leading-none tracking-tighter select-none"
                                style={{ fontSize: 'clamp(40px, 11dvh, 70px)', color: 'rgba(246,244,241,0.85)', fontFamily: '"Plus Jakarta Sans", sans-serif', fontStyle: 'italic', letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>
                                {String(club.heroWord).trim()}
                            </p>
                        </div>
                    )}

                    {/* Top-left issue metadata strip — overlaid on image */}
                    {/* 封面已經整個移到按鈕下方，類型字放回封面左上角就好 */}
                    <div className="absolute left-5 flex items-center gap-3" style={{ top: 16 }}>
                        <div style={{ width: 20, height: 1, background: 'rgba(246,244,241,0.5)' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(246,244,241,0.7)' }}>
                            {clubTypeMeta(club.type).label}
                        </span>
                        <div style={{ width: 20, height: 1, background: 'rgba(246,244,241,0.5)' }} />
                    </div>
                </div>

                {/* Below-image editorial block */}
                <div className="relative z-10 px-5 pt-4 pb-4">

                    {/* Swiss horizontal rule */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 1, height: 44, background: C.pebble, flexShrink: 0 }} />
                        {/* ⚠️ minWidth:0 —— 少了它，長社團名會把右邊的人數推出畫面 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Overline category slug */}
                            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.38em', textTransform: 'uppercase', color: C.sub, marginBottom: 5, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                                <MapPin size={8} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                {club.location}&nbsp;&nbsp;·&nbsp;&nbsp;Est.&nbsp;{club.createdAt ? new Date(club.createdAt).getFullYear() : 2026}
                            </p>
                            {/* Club name — Swiss bold condensed */}
                            <h1 style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.025em', color: C.text, fontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {club.name}
                            </h1>
                        </div>

                        {/* Right: editorial member count */}
                        <motion.button {...pressProps('pill')} onClick={() => setShowMembers(true)} className="flex flex-col items-end flex-shrink-0 cursor-pointer" style={{ gap: 2 }}>
                            <div style={{ width: '100%', height: 1, background: C.accent, marginBottom: 3 }} />
                            <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: C.accent, fontFamily: '"Plus Jakarta Sans", sans-serif', fontVariantNumeric: 'tabular-nums' }}>
                                {club.members}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: C.sub }}>
                                {memberNoun(club)}
                            </span>
                        </motion.button>
                    </div>

                    {/* Avatar + squad ID inline row（氛圍燈彩蛋移到此「頭貼層」，無底框、依真實階級變色、點擊開啟階級系統） */}
                    <div className="relative flex items-center gap-3 mt-0">
                        {/* 氛圍燈特效 — 漂浮於頭貼層後方，柔邊融入背景 */}
                        <motion.button
                            onClick={() => setShowXpInfo(true)}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
                            whileTap={{ scale: 0.99 }}
                            aria-label="社團活躍程度 — 點一下看怎麼升級"
                            className="absolute"
                            style={{
                                left: 0, right: 0, bottom: 0, height: 84,
                                padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', zIndex: 0,
                                // 與頭貼重疊、底部貼齊：光最濃在底部中央，往上與兩側柔化
                                WebkitMaskImage: 'radial-gradient(120% 140% at 50% 100%, #000 35%, transparent 100%)',
                                maskImage: 'radial-gradient(120% 140% at 50% 100%, #000 35%, transparent 100%)',
                            }}>
                            <div className="absolute inset-0" style={{ opacity: 0.85 }}>
                                <VibeEnergyRibbon tierId={vibe.id} />
                            </div>
                            <motion.span className="absolute"
                                style={{ right: 10, bottom: 10, width: 6, height: 6, borderRadius: '50%', background: fillColor, boxShadow: `0 0 10px ${fillColor}` }}
                                animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1.2, 0.9] }}
                                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />
                        </motion.button>

                        {/* 社團頭貼：圓角方塊（跟人的圓形頭貼區分；直角方框太硬） */}
                        <div className="relative" style={{ zIndex: 1, width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: C.text, borderRadius: 12, overflow: 'hidden' }}>
                            {club.customAvatar ? <img loading="lazy" decoding="async" src={club.customAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : club.avatar}
                        </div>
                        {club.squadId && (
                            <span className="relative" style={{ zIndex: 1, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: C.sub, fontFamily: 'monospace', border: `1px solid ${C.pebble}`, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.7)' }}>
                                {club.squadId}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── LIQUID GLASS TAB NAVIGATION ─── */}
            <div className="sticky top-[max(60px,env(safe-area-inset-top))] z-40 px-4 mb-6 pt-2" style={{ background: `linear-gradient(180deg, #E8E9E6 0%, #E8E9E6 38%, rgba(232,233,230,0.72) 68%, rgba(232,233,230,0) 100%)` }}>
                <div className="flex gap-1 overflow-x-auto no-scrollbar"
                    style={{ padding: '2px 0' }}>
                    {TABS.map((t) => {
                        const isActive = tab === t.id;
                        return (
                            <motion.button {...pressProps('pill')} key={t.id} onClick={() => setTab(t.id)}
 className="relative flex-shrink-0 "
 style={{
 padding: '9px 15px',
 borderRadius: 13,
 color: isActive ? C.text : C.sub,
 fontWeight: isActive ? 800 : 600,
 fontSize: 9,
 textTransform: 'uppercase',
 letterSpacing: '0.16em',
 fontFamily: '"Plus Jakarta Sans", sans-serif',
 background: 'transparent',
 zIndex: 1,
 }}>
                                {isActive && (
                                    <motion.div layoutId="club-tab-glass" className="lg-glass lg-glass--frost absolute inset-0"
                                        style={{ borderRadius: 13, zIndex: -1, boxShadow: 'none' }}
                                        transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                                )}
                                <span style={{ position: 'relative' }}>{t.label}</span>
                                {isActive && (
                                    <motion.div layoutId="club-tab-dot" className="absolute"
                                        style={{ bottom: 4, left: '50%', x: '-50%', width: 14, height: 2, borderRadius: 2, background: C.accent }} />
                                )}
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* ─── Content Area ─── */}
            <div className="flex-1 w-full px-5 pb-32">
                {tab === 'overview' && (
                    <div className="space-y-10">
                        {/* Swiss editorial announcement block */}
                        <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: 16 }}>
                            {club.announcement ? (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.38em', textTransform: 'uppercase', color: C.accent, marginBottom: 5, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                                            — Announcement
                                        </p>
                                        {canAdmin && (
                                            <motion.button {...pressProps('row')} onClick={() => setEditField('announcement')}
                                                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: C.sub }}>
                                                編輯
                                            </motion.button>
                                        )}
                                    </div>
                                    {/* 一行公告看不出是不是三個月前的 —— 誰發的、什麼時候發的要講 */}
                                    <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.6, color: C.text, whiteSpace: 'pre-wrap', fontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif', margin: 0 }}>
                                        {String(club.announcement).replace(/^[^\p{L}\p{N}]*\s*/u, '')}
                                    </p>
                                    {club.announcementMeta?.at && (
                                        <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, margin: '7px 0 0' }}>
                                            {club.announcementMeta.byName || '管理層'} · {announceAgo(club.announcementMeta.at)}
                                        </p>
                                    )}
                                </div>
                            ) : canAdmin ? (
                                <motion.button {...pressProps('row')} onClick={() => setEditField('announcement')}
                                    style={{ display: 'block', marginBottom: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                                    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.38em', textTransform: 'uppercase', color: C.accent, margin: '0 0 5px' }}>— Announcement</p>
                                    <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, margin: 0 }}>發一則置頂公告，讓大家一進來就看到 ›</p>
                                </motion.button>
                            ) : null}
                            <p style={{ fontSize: 13, lineHeight: 1.7, fontWeight: 400, color: C.sub, fontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif' }}>{club.desc}</p>
                        </div>

                        {/* 🏋️ 共同課表 —— 社團原本只有聊天、公告、排行，沒有一起做的事。
                            一群人會留下來的原因是「我們在練同一份課表」：
                            有共同的下一步，也看得到誰跟上了。 */}
                        <SquadPlanPanel
                            /* 🩹 後端只認 squadId（RUN-0042 這種），自建社團的 club.id 是
                               c_<timestamp> —— 傳 id 會讓共同課表與社團動態一律 404，
                               而且同一顆按鈕在「用 ID 加入的社團」上卻正常，最難查。 */
                            squadId={club.squadId || club.id}
                            userId={userId}
                            canManage={canAdmin}
                            onToast={(m) => toast.success(m)}
                        />

                        {/* 4. 揪活動 —— 沒有活動且非管理層時整段不渲染，避免空白佔位 */}
                        {((club.customChallenges || []).length > 0 || canAdmin) && (
                        <div className="mt-4">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: (club.customChallenges || []).length === 0 ? 0 : 20 }}>
                                <div>
                                    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.40em', textTransform: 'uppercase', color: C.sub, margin: '0 0 3px', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Gather</p>
                                    <h3 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif', textTransform: 'uppercase', letterSpacing: '-0.03em', margin: 0 }}>揪活動</h3>
                                </div>
                                <div style={{ flex: 1, height: 1, background: C.pebble }} />
                                {canAdmin && (
                                    <motion.button {...pressProps('row')} onClick={() => setShowPostActivity(true)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.text, flexShrink: 0 }}>
                                        <Plus size={16} color={C.paper} strokeWidth={2.5} />
                                    </motion.button>
                                )}
                            </div>
                            {(club.customChallenges || []).length === 0 ? (
                                /* 空狀態：僅管理員看得到一行精簡提示，不再撐出大塊虛線空白 */
                                <motion.button {...pressProps('row')} onClick={() => setShowPostActivity(true)} className="w-full mt-3 py-3 text-[9px] font-black uppercase tracking-[0.25em] flex items-center justify-center gap-2 " style={{ color: C.sub, border: `1px dashed ${C.pebble}`, borderRadius: 10, background: 'transparent' }}>
                                    <Plus size={13} strokeWidth={2.5} /> 揪第一場活動
                                </motion.button>
                            ) : (
                            <div className="flex gap-6 overflow-x-auto pb-10 pt-2 no-scrollbar -mx-5 px-5 snap-x snap-mandatory">
                                {(
                                    (club.customChallenges || []).map((cc, idx) => {
                                        /* 報名狀態：幾個人來了、還有沒有位子、截止了沒。
                                           舊版只有一顆 I'M IN，按下去之後沒有任何人知道到底幾個人要來。 */
                                        const rsvp = Array.isArray(cc.rsvpList) ? cc.rsvpList : [];
                                        const cap = Number(cc.maxParticipants) > 0 ? Number(cc.maxParticipants) : null;
                                        const going = cap ? rsvp.slice(0, cap) : rsvp;
                                        const waiting = cap ? rsvp.slice(cap) : [];
                                        const myIdx = rsvp.indexOf(userId);
                                        const isJoined = myIdx >= 0;
                                        const onWaitlist = isJoined && cap != null && myIdx >= cap;
                                        const full = cap != null && rsvp.length >= cap;
                                        const closed = eventSignupClosed(cc);
                                        const needsRsvp = cc.rsvpRequired !== false;
                                        const rotations = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2'];
                                        const rotation = rotations[idx % rotations.length];
                                        return (
                                            <div key={cc.id} className={`flex-shrink-0 w-[280px] relative transition-all active:scale-95 snap-center ${rotation}`}
                                                style={{
                                                    background: `linear-gradient(to bottom, #F6F4F1 0%, #F6F4F1 100%)`,
                                                    borderRadius: '1px',
                                                    borderTop: `14px solid ${idx % 2 === 0 ? C.text : C.accent}`,
                                                    padding: '28px 24px 24px',
                                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 30px -5px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)'
                                                }}>

                                                {/* Paper Grain Overlay */}
                                                <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply" style={{
                                                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                                                }} />

                                                {/* Physical Punch Hole / Pin (Positioned on the bar) */}
                                                <div className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full z-20"
                                                    style={{
                                                        background: idx % 2 === 0 ? 'white' : 'white',
                                                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1)',
                                                        opacity: 0.9,
                                                        border: `1.5px solid ${idx % 2 === 0 ? C.text : C.accent}`
                                                    }}>
                                                    <div className="absolute inset-[2px] rounded-full bg-black/10" />
                                                </div>

                                                <div className="relative z-10 flex justify-between items-start mb-6">
                                                    <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm" style={{ background: 'white', border: `1.5px solid ${C.text}` }}><ChallengeIcon id={cc.icon} size={20} color={C.text} /></div>
                                                    <div className="text-right">
                                                        <p className="text-[32px] font-black leading-none italic" style={{ color: C.text, fontFamily: 'var(--font-display)' }}>{cc.date ? cc.date.split('-')[2] : '--'}</p>
                                                        <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40" style={{ color: C.text }}>{cc.date ? cc.date.split('-')[1] + 'M' : 'TBD'}</p>
                                                    </div>
                                                </div>

                                                <div className="relative z-10">
                                                    <h4 className="text-[19px] font-black leading-tight uppercase mb-3 tracking-tighter" style={{ color: C.text }}>{cc.title}</h4>
                                                    <p className="text-[13px] font-medium leading-relaxed mb-6 line-clamp-3 opacity-70" style={{ color: C.text, minHeight: '4em' }}>{cc.desc || 'Join the movement.'}</p>

                                                    <div className="space-y-2 mb-5 border-t border-black/5 pt-5">
                                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest" style={{ color: C.text }}><Clock size={12} className="opacity-40" /> <span>{cc.time || 'Schedule TBD'}</span></div>
                                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest" style={{ color: C.text }}><MapPin size={12} className="opacity-40" /> <span className="truncate">{cc.location || 'Location TBD'}</span></div>
                                                        {Array.isArray(cc.bring) && cc.bring.length > 0 && (
                                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest" style={{ color: C.text }}>
                                                                <Info size={12} className="opacity-40" /> <span className="truncate">帶 {cc.bring.join('、')}</span>
                                                            </div>
                                                        )}
                                                        {cc.cost && cc.cost !== 'free' && (
                                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest" style={{ color: C.text }}>
                                                                <Info size={12} className="opacity-40" /> <span>{(EVENT_COST_PRESETS.find(x => x.key === cc.cost) || {}).label || ''}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 誰要來 —— 報名這件事要看得到人，不然按了跟沒按一樣 */}
                                                    {needsRsvp && (
                                                        <div style={{ marginBottom: 14 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                                                <span style={{ fontSize: 12, fontWeight: 900, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                                                                    {going.length}{cap ? ` / ${cap}` : ''} 人報名
                                                                </span>
                                                                {waiting.length > 0 && (
                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>候補 {waiting.length}</span>
                                                                )}
                                                                {cc.rsvpDeadline && (
                                                                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: closed ? C.accent : C.sub }}>
                                                                        {closed ? '已截止' : `${cc.rsvpDeadline.slice(5).replace('-', '/')} 截止`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                {going.slice(0, 6).map((uid, i) => {
                                                                    const m = (club.leaderboard || []).find((mb) => String(mb.userId) === String(uid));
                                                                    const nm = uid === userId ? getDisplayName(userId) : (m?.name || '成員');
                                                                    return (
                                                                        <div key={uid} title={nm} style={{
                                                                            width: 24, height: 24, borderRadius: 12, marginLeft: i > 0 ? -7 : 0, zIndex: 6 - i,
                                                                            background: 'white', border: `1.5px solid ${C.text}`,
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 11, fontWeight: 900, color: C.text,
                                                                        }}>{String(nm).trim().charAt(0).toUpperCase()}</div>
                                                                    );
                                                                })}
                                                                {going.length > 6 && (
                                                                    <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, color: C.sub }}>+{going.length - 6}</span>
                                                                )}
                                                                {going.length === 0 && (
                                                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>還沒有人報名 — 當第一個</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!needsRsvp ? (
                                                        <div className="w-full py-3.5 text-center" style={{ border: `1.5px dashed ${C.pebble}` }}>
                                                            <span style={{ fontSize: 12, fontWeight: 800, color: C.sub }}>自由參加 · 直接來就好</span>
                                                        </div>
                                                    ) : (() => {
                                                        // 不能報名的兩種情況要說出原因，不是給一顆按不動的按鈕
                                                        const blocked = !isJoined && (closed || (full && cc.waitlist === false));
                                                        const label = isJoined
                                                            ? (onWaitlist ? '候補中 · 取消' : '已報名 · 取消')
                                                            : closed ? '報名已截止'
                                                                : full ? (cc.waitlist === false ? '已額滿' : '額滿 · 排候補')
                                                                    : '我要報名';
                                                        return (
                                                            <motion.button {...pressProps('cta')} disabled={blocked}
                                                                onClick={() => {
                                                                    if (blocked) return;
                                                                    const nf = (club.customChallenges || []).map(item => item.id === cc.id
                                                                        ? { ...item, rsvpList: isJoined ? rsvp.filter(id => id !== userId) : [...rsvp, userId] }
                                                                        : item);
                                                                    onUpdate({ ...club, customChallenges: nf });
                                                                }}
                                                                className="w-full py-3.5 text-[11px] font-black tracking-[0.2em] relative overflow-hidden"
                                                                style={{
                                                                    background: blocked ? 'transparent' : isJoined ? 'transparent' : C.text,
                                                                    color: blocked ? C.sub : isJoined ? C.text : 'white',
                                                                    border: `1.5px solid ${blocked ? C.pebble : C.text}`,
                                                                    borderRadius: '0px',
                                                                    cursor: blocked ? 'default' : 'pointer',
                                                                }}>
                                                                {label}
                                                            </motion.button>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            )}
                        </div>
                        )}

                        {/* 🎯 進行中的任務 —— 分「任務（短期全員）」與「挑戰（長期累積）」兩級。
                            兩級的差別來自資料裡本來就有的 category 欄位，UI 過去完全沒用到，
                            所以四筆長得一模一樣，使用者看不出誰是誰。 */}
                        <ActiveMissions
                            challenges={club.activeChallenges || []}
                            userId={userId}
                            onOpen={(c) => setViewingChallenge(c)}
                            onCancel={handleCancelChallenge}
                            canAdmin={canAdmin}
                            onManage={() => setShowChallenges(true)}
                        />
                    </div>
                )}

                {/* 展示櫃 —— 加分項中的加分項。
                    只回答一件事：這個社團的固定挑戰，我完成過幾次了。
                    1 次銅 / 3 次銀 / 6 次金 / 12 次鉑金。 */}
                {tab === 'showroom' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pb-24 pt-6 px-4">
                        <ClubBadgeCabinet
                            trophyCabinet={club.trophyCabinet || []}
                            clubType={club.type || clubType}
                            fixedIds={clubFixedChallengeIds(club)}
                        />
                    </motion.div>
                )}

                {tab === 'activity' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4 pb-20">
                        {/* ─── 本週戰報 + 成員運動進度（合併單卡，無 emoji 線性圖示） ─── */}
                        {(() => {
                            const isRun = (club.type || clubType) === 'run';
                            const withPct = (club.activeChallenges || []).map(c => {
                                const lp = getRecordedChallengeProgress(c, userId);
                                const prog = lp != null ? Math.min(lp, c.target || lp) : (c.progress || 0);
                                return { c, prog, pct: Math.min(100, (prog / Math.max(c.target, 1)) * 100) };
                            });
                            const nearest = withPct.filter(x => x.pct < 100).sort((a, b) => b.pct - a.pct)[0];
                            const tierZh = vibeData.tier.nameZh || vibeData.tier.name || '';

                            const myData = getWorkoutDataForMember(userId);
                            const calc = (m) => {
                                const isMe = String(m.userId) === String(userId);
                                if (isRun) {
                                    const km = isMe ? myData.totalDistKm : (m.distance || 0) / 1000;
                                    const runs = isMe ? myData.cardioSessions : (m.runs || 0);
                                    return { isMe, val: km, has: km > 0 || runs > 0, primary: `${km.toFixed(1)} km`, sub: runs > 0 ? `本週 ${runs} 次跑步` : '本週跑步' };
                                }
                                const vol = isMe ? myData.totalVolume : (m.volume || 0);
                                const sess = isMe ? myData.strengthSessions : (m.sessions || 0);
                                return { isMe, val: vol, has: vol > 0 || sess > 0, primary: `${vol.toLocaleString()} kg`, sub: sess > 0 ? `本週 ${sess} 次訓練` : '本週訓練' };
                            };
                            const all = (club.leaderboard || []).map(m => ({ m, ...calc(m) })).filter(x => x.has);
                            const myItem = all.find(x => x.isMe);
                            const publicItems = all.filter(x => !(x.isMe && !publishMine)).sort((a, b) => b.val - a.val);
                            const initial = (n) => (n || '?').trim().charAt(0).toUpperCase();
                            const wkLeader = [...all].sort((a, b) => b.val - a.val)[0];
                            // 本週戰報告示列 — 全部接真實／即時資料（活躍度、連續、任務進度、本週領跑者）
                            const bulletin = [];
                            bulletin.push({ Icon: TrendingUp, text: `本週活躍度 ${vibeData.activePercent}%`, tag: tierZh });
                            // 🩹 「本週是否已運動」以成員真實本週數據為準，不再只看可能過期的 streak 快取
                            //    （修正：同一畫面顯示「本週領跑者 我 5.4km」卻又說「本週尚未運動」的矛盾）。
                            const myActiveThisWeek = (myData.cardioSessions > 0) || (myData.strengthSessions > 0) || (myData.totalDistKm > 0) || (myData.totalVolume > 0);
                            const weekDone = streak.thisWeekDone || myActiveThisWeek;
                            bulletin.push({
                                Icon: Flame,
                                accent: !weekDone,
                                text: weekDone
                                    ? (streak.count > 0 ? `你已連續 ${streak.count} 週為社團出力` : '本週已留下一筆 — 繼續保持點亮連續')
                                    : '本週尚未運動 — 留下一筆即點亮連續',
                                tag: weekDone ? '已達標' : '待運動',
                            });
                            if (nearest) bulletin.push({ Icon: Target, text: `「${nearest.c.title}」進度 ${Math.round(nearest.pct)}%`, tag: `還差 ${(nearest.c.target - nearest.prog).toLocaleString()} ${nearest.c.unit}` });
                            bulletin.push(wkLeader ? { Icon: Crown, text: `本週領跑者 ${wkLeader.m.name}`, tag: wkLeader.primary } : { Icon: Users, text: '本週尚無成員運動紀錄', tag: null });
                            /* 真的比得出來的領跑者：只有拿到全體資料時才算數 */
                            const topLive = memberTotals?.ok
                                ? Object.values(memberTotals.byUser).sort((a, b) => (isRun ? b.distanceKm - a.distanceKm : b.volumeKg - a.volumeKg))[0]
                                : null;

                            /* 📊 本週社團的「一個主角數字」：全社團這週一起累積了多少。
                               原本這張卡是四行 12.5px 的小字（活躍度／連續／任務／領跑者），
                               每一行都同樣大小、沒有主角，所以看起來像系統 log 而不是戰報。
                               改成：一個大數字 + 三個支撐數據，其餘降級。 */
                            /* 🩹 all[] 對「不是我」的成員一律算 0（資料在別人裝置上），
                               所以這個「全社團累積」其實只有我一個人的數字。
                               後端讀得到就用真的；讀不到就改口說是「你這週」，不冒充全社團。 */
                            const liveClub = memberTotals?.ok ? memberTotals : null;
                            const clubWideWeek = !!liveClub;
                            const clubTotal = liveClub
                                ? (isRun ? liveClub.total.distanceKm : liveClub.total.volumeKg)
                                : all.reduce((acc, x) => acc + (x.val || 0), 0);
                            const activeCount = liveClub ? liveClub.activeMembers : all.length;
                            const totalUnit = isRun ? 'KM' : 'KG';
                            const totalText = isRun
                                ? clubTotal.toFixed(1)
                                : Math.round(clubTotal).toLocaleString();

                            return (
                                <>
                                <div className="ti-surface-dark" style={{ position: 'relative', borderRadius: 24, overflow: 'hidden' }}>                                    {/* 黑色鈦金屬拉絲：真實拉絲照片低透疊加 + 對角金屬掃光 */}
                                    <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/desktop/11.jpeg')", backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.16, mixBlendMode: 'luminosity', pointerEvents: 'none' }} />
                                    <div className="ti-sheen ti-sheen-dark" />
                                    <div style={{ position: 'relative', zIndex: 1, padding: '20px 20px 18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                            <div>
                                                <p className="ti-kicker ti-kicker-on-dark" style={{ margin: 0, fontFamily: 'var(--font-display)' }}>
                                                    {clubWideWeek ? `Last ${liveClub.days} Days · 社團戰報` : 'This Week · 你這週'}
                                                </p>
                                                <p style={{ fontSize: 13, fontWeight: 500, color: 'rgba(246,244,241,0.62)', margin: '6px 0 0' }}>
                                                    {clubWideWeek
                                                        ? (activeCount > 0 ? `${activeCount} 位成員一起累積` : '這段時間還沒有人留下紀錄')
                                                        : (activeCount > 0 ? '目前只讀得到你自己的紀錄' : '這週還沒有留下紀錄')}
                                                </p>
                                            </div>
                                            {streak.count > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', flexShrink: 0 }}>
                                                    <Flame size={13} color="#F95C4B" strokeWidth={2.4} />
                                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: '#F6F4F1', lineHeight: 1 }}>{streak.count}</span>
                                                    <span style={{ fontSize: 12, color: 'rgba(246,244,241,0.55)' }}>週連續</span>
                                                </span>
                                            )}
                                        </div>

                                        {/* 主角：本週社團累積 */}
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 4px' }}>
                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 58, fontWeight: 300, letterSpacing: '-0.04em', color: '#F6F4F1', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>
                                                {activeCount > 0 ? totalText : '—'}
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(246,244,241,0.55)' }}>{totalUnit}</span>
                                        </div>

                                        {/* 支撐數據：三格，各自小標在下 */}
                                        <div style={{ display: 'flex', gap: 10, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                                            {[
                                                { v: `${vibeData.activePercent}%`, l: '本週活躍度' },
                                                clubWideWeek
                                                    ? { v: topLive ? topLive.name : '—', l: '領跑者' }
                                                    : { v: '—', l: '領跑者 · 待同步' },
                                                { v: weekDone ? '已達標' : '待運動', l: '我這週', accent: !weekDone },
                                            ].map((x, xi) => (
                                                <div key={xi} style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{
                                                        fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, margin: 0,
                                                        color: x.accent ? '#F95C4B' : '#F6F4F1',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>{x.v}</p>
                                                    <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(246,244,241,0.5)', margin: '4px 0 0' }}>{x.l}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* 進行中的任務 → 真的畫一條進度條，不要只寫一行「進度 0%」 */}
                                        {nearest && (
                                            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                                                    <p style={{ fontSize: 13.5, fontWeight: 700, color: '#F6F4F1', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {nearest.c.title}
                                                    </p>
                                                    <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'rgba(246,244,241,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                                                        還差 {(nearest.c.target - nearest.prog).toLocaleString()} {nearest.c.unit}
                                                    </span>
                                                </div>
                                                <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.max(2, Math.round(nearest.pct))}%`, height: '100%', borderRadius: 999, background: '#F95C4B' }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ⚠️ 「這週誰在動」整張卡已移除 —— 它跟下面的「近期動態」是同一件事，
                                    分成兩塊等於同一件事講兩次（使用者原話：「這週誰在動就是那個最近動態啊」）。
                                    成員彙總改由上方戰報的「N 位成員一起累積」表達，逐場紀錄一律走動態卡。 */}

                                {/* ── 近期動態：與「最新動態／社群」同一張訓練卡 ──
                                    使用者要的是「團員有幹嘛」，四行小字答不了這個問題；
                                    這裡放真正的訓練卡（金屬霧面＋獎牌＋一起練），
                                    三個頁面的卡片語言一致，不用重新學一次。 */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 4px 12px' }}>
                                        <p className="ti-kicker" style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Today</p>
                                        <h4 style={{ fontSize: 18, fontWeight: 400, color: '#161415', letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-display)' }}>今日動態</h4>
                                        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.45)' }}>
                                            {new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                        </span>
                                    </div>
                                    <ClubActivityFeed
                                        squadId={club.squadId || club.squad_id || club.id}
                                        userId={userId}
                                        myName={getDisplayName(userId)}
                                    />
                                </div>
                                </>
                            );
                        })()}

                        {/* 發文/動態牆已移除：本頁以「本週戰報＋這週誰在動＋近期動態」為主 */}
                        {/* 🗑 這裡原本有第二道「社團動態牆」（貼文＋按讚＋留言），
                            整段包在 {false && …} 裡永遠不會顯示，而且它跟「討論」分頁
                            講的是同一件事 —— 同一個社團兩個發言的地方，正是使用者說的
                            「你幹嘛分開」。所以不復活它，改把留言串與 @提及搬進討論分頁。 */}
                    </motion.div>
                )}

                {/* Leaderboard Tab (Impact Ticket Styles) */}
                {tab === 'leaderboard' && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
                        className="space-y-4 pt-6 pb-20">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.sub }}>
                                {memberTotals?.ok ? `LAST ${memberTotals.days} DAYS` : 'MONTHLY LEADERBOARD'}
                            </span>
                            <span style={{ flex: 1, height: 1, background: C.stone }} />
                            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', color: C.text }}>
                                {memberTotals?.ok ? `近 ${memberTotals.days} 天排行` : '本月排行'}
                            </span>
                        </div>
                        {/* 讀不到別人的紀錄時要講出來 —— 一排 0.0 KM 會讓人以為大家都沒練 */}
                        {memberTotals && !memberTotals.ok && (
                            <p style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(22,20,21,0.45)', margin: '0 0 2px', paddingLeft: 2, lineHeight: 1.6 }}>
                                目前只讀得到你自己的紀錄，其他成員的數字要連上伺服器才會更新。
                            </p>
                        )}
                        {(() => {
                          // 依社團類型決定排行指標：跑步=距離(km)、重訓=訓練量(kg)
                          const isRunBoard = normalizeClubType(club.type || clubType) === 'run';
                          /* 🩹 leaderboard 裡的 distance/volume 從加入那天起就一直是 0，
                             全檔沒有任何地方更新它 —— 排行榜其實是「加入順序」。
                             真正的數字只有後端知道（/api/squads/{id}/activity）。 */
                          const liveOf = (m) => memberTotals?.ok
                              ? (memberTotals.byUser[String(m.userId)] || null)
                              : null;
                          const myWeek = getWorkoutDataForMember(userId);
                          const periodVal = (m) => {
                              const live = liveOf(m);
                              if (live) return isRunBoard ? live.distanceKm * 1000 : live.volumeKg;
                              // 沒有後端資料時，只有「我自己」有真實數字可以用
                              if (String(m.userId) === String(userId)) {
                                  return isRunBoard ? myWeek.totalDistKm * 1000 : myWeek.totalVolume;
                              }
                              return isRunBoard ? (m.distance || 0) : (m.volume || 0);
                          };
                          const lbSorted = [...(club.leaderboard || [])].sort((a, b) => periodVal(b) - periodVal(a));
                          const fmtVal = (v) => isRunBoard ? (v / 1000).toFixed(1) : Math.round(v).toLocaleString();
                          return lbSorted.map((m, idx) => {
                            const isMe = String(m.userId) === String(userId);
                            const rank = idx + 1;
                            return (
                                <motion.div key={m.userId}
                                    variants={{ hidden: { opacity: 0, x: -24, scale: 0.97 }, visible: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } } }}
                                    className="relative flex overflow-hidden shadow-sm"
                                    whileTap={{ scale: 0.98 }}
                                    style={{ background: C.paper, border: `2px solid ${C.text}`, borderRadius: 18 }}>

                                    {/* Left Rank Segment */}
                                    <div className="w-16 flex flex-col items-center justify-center shrink-0 border-r-2 border-dashed"
                                        style={{ background: isMe ? C.accent : C.text, borderColor: C.pebble }}>
                                        <span className="text-[9px] font-black uppercase tracking-widest leading-none mb-1"
                                            style={{ color: isMe ? C.text : C.sub }}>RANK</span>
                                        <span className="text-[32px] font-black italic leading-none"
                                            style={{ color: isMe ? C.text : C.paper, fontFamily: 'var(--font-display)' }}>{rank}</span>
                                    </div>

                                    {/* Content Segment */}
                                    <div className="flex-1 p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                                                style={{ background: C.stone, border: `1px solid ${C.pebble}` }}>{m.avatar}</div>
                                            <div>
                                                <h4 className="text-[15px] font-black uppercase tracking-tighter" style={{ color: C.text }}>{m.name}</h4>
                                                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.sub }}>{m.role || 'Member'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[22px] font-black italic leading-none tracking-tighter"
                                                style={{ color: isMe ? C.accent : C.text, fontFamily: 'var(--font-display)' }}>
                                                {fmtVal(periodVal(m))}
                                            </span>
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40" style={{ color: C.sub }}>{isRunBoard ? 'KM DIST' : 'KG VOL'}</span>
                                        </div>
                                    </div>

                                    {isMe && (
                                        <div className="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-black uppercase"
                                            style={{ background: C.accent, color: C.text }}>IT'S YOU</div>
                                    )}
                                </motion.div>
                            );
                          });
                        })()}
                    </motion.div>
                )}

                {/* Posts/Chat Tab (Editorial Discussion) */}
                {tab === 'posts' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {/* 💬 討論不再只有文字：投票、揪團、每則都能一鍵反應
                            （使用者：「這邊要加一些互動功能，不然只能文字討論」） */}
                        <ClubDiscussion
                            club={club}
                            userId={userId}
                            myName={getDisplayName(userId)}
                            members={club.leaderboard || []}
                            onUpdate={onUpdate}
                        />
                    </motion.div>
                )}
            </div>

            {/* Sheets & Modals */}
            <AnimatePresence>{showChallenges && <ChallengesSheet club={club} onClose={closeSub(() => setShowChallenges(false))} onUpdate={onUpdate} ac={ac} />}</AnimatePresence>
            <AnimatePresence>{showMembers && <MembersListSheet club={club} canAdmin={canAdmin} amLeader={amLeader} onClose={closeSub(() => setShowMembers(false))} onUpdate={onUpdate} />}</AnimatePresence>
            <AnimatePresence>{showXpInfo && <XpInfoSheet club={club} vibe={vibe} onClose={() => setShowXpInfo(false)} />}</AnimatePresence>
            <AnimatePresence>{viewingChallenge && <ActiveChallengeDetailSheet challenge={viewingChallenge} club={club} userId={userId} totals={memberTotals} onClose={() => setViewingChallenge(null)} ac={ac} />}</AnimatePresence>

            <AnimatePresence>
                {showAdmin && (
                    <AdminPanelSheet
                        club={club}
                        ac={ac}
                        userId={userId}
                        clubType={clubType}
                        canAdmin={canAdmin}
                        publishMine={publishMine}
                        onTogglePublish={togglePublishMine}
                        onClose={() => { setReturnToAdmin(false); setShowAdmin(false); }}
                        onEditInfo={(field) => openFromAdmin(() => setEditField(field || 'info'))}
                        onManageMembers={() => openFromAdmin(() => setShowMembers(true))}
                        onManageMissions={() => openFromAdmin(() => setShowChallenges(true))}
                        onPostActivity={() => openFromAdmin(() => setShowPostActivity(true))}
                        onDissolve={handleDissolveClub}
                        onLeave={handleLeaveClub}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showPostActivity && (
                    <CreateCustomChallengeSheet
                        onClose={closeSub(() => setShowPostActivity(false))}
                        onCreate={handleCreateCustomChallenge}
                        clubType={club.type || clubType}
                        defaultLocation={club.location || ''}
                        ac={ac}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {editField && (
                    <EditClubSheet
                        club={club}
                        field={editField}
                        userId={userId}
                        ac={ac}
                        onClose={closeSub(() => setEditField(null))}
                        onSave={(data) => onUpdate({ ...club, ...data })}
                    />
                )}
            </AnimatePresence>

        </motion.div>,
        document.body
    );
};

/* ═══ JOIN REQUEST MODAL ═══ */
const JoinRequestModal = ({ club, userId, onClose, onRequest }) => {
    const [message, setMessage] = useState('');
    const [sent, setSent] = useState(false);
    const [sending, setSending] = useState(false);

    /* 🩹 原本沒有 await 就直接 setSent(true) —— 送失敗照樣顯示「申請已送出」。
       等結果出來再決定要說什麼，失敗時把視窗留著讓人可以再按一次。 */
    const handleSend = async () => {
        if (sending) return;
        setSending(true);
        try {
            await onRequest(club.squadId || club.id, {
                userId, message, requestedAt: new Date().toISOString(),
                name: getDisplayName(userId), avatar: null,
            });
            setSent(true);
            setTimeout(onClose, 1800);
        } catch {
            // 失敗訊息由 handleJoinRequest 統一用 toast 說明，這裡只要讓按鈕可以再按
        } finally {
            setSending(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 280 }}
                style={{ position: 'relative', width: '100%', maxWidth: 440, background: '#F6F4F1', borderTop: `3px solid ${C.text}`, padding: 0, paddingBottom: 'max(28px,env(safe-area-inset-bottom))' }}>

                {/* Club preview strip */}
                <div style={{ height: 80, position: 'relative', overflow: 'hidden' }}>
                    <img loading="lazy" decoding="async" src={squadCover(club)} onError={onCoverError} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(40%) contrast(1.1)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(22,20,21,0.85), rgba(22,20,21,0.2))' }} />
                    <div style={{ position: 'absolute', bottom: 14, left: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: C.stone, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{club.avatar}</div>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1 }}>{club.name}</p>
                            {club.squadId && <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', fontFamily: 'monospace' }}>{club.squadId}</p>}
                        </div>
                    </div>
                    <div style={{ position: 'absolute', top: 12, right: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: club.isPublic ? '#5A7A3A' : C.gold, background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 2 }}>
                            {club.isPublic ? '公開社團' : '私人社團'}
                        </span>
                    </div>
                </div>

                <div style={{ padding: '22px 24px 0' }}>
                    {sent ? (
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                            <p style={{ fontSize: 18, fontWeight: 900, color: C.text, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>申請已送出</p>
                            <p style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>等待社長或管理員審核後即可加入</p>
                        </motion.div>
                    ) : (
                        <>
                            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>JOIN REQUEST</p>
                            <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: C.text, textTransform: 'uppercase', fontFamily: 'var(--font-display)', marginBottom: 18 }}>申請加入社團</h3>

                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: C.sub, marginBottom: 8 }}>附上申請訊息（選填）</p>
                            <textarea value={message} onChange={e => setMessage(e.target.value)}
                                placeholder="例如：我每週跑步三次，希望加入這個優質社群！"
                                rows={3}
                                style={{ width: '100%', padding: '13px 16px', fontSize: 14, fontWeight: 500, color: C.text, background: 'white', border: `1.5px solid ${C.pebble}`, borderRadius: 4, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6, marginBottom: 6 }} />
                            <p style={{ fontSize: 11, color: C.sub, fontStyle: 'italic', marginBottom: 20 }}>
                                {club.isPublic ? '此為公開社團，申請後社長或管理員審核即可加入。' : '此為私人社團，需審核通過才能加入。'}
                            </p>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <motion.button {...pressProps('row')} onClick={onClose} style={{ flex: 1, height: 48, background: 'white', border: `1.5px solid ${C.pebble}`, borderRadius: 4, fontSize: 12, fontWeight: 900, letterSpacing: '0.15em', cursor: 'pointer', color: C.sub }}>取消</motion.button>
                                <motion.button {...pressProps('row')} onClick={handleSend} disabled={sending} style={{ flex: 2, height: 48, background: C.text, border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1, color: '#F6F4F1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <UserPlus size={15} /> {sending ? '送出中…' : '送出申請'}
                                </motion.button>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};



/* ═══ 輕量級 CSS 氛圍燈 (底部火爐波浪流動版) ═══ */
const VibeEnergyRibbon = ({ tierId = 'gold' }) => {
    // 色彩組合：[深底色, 中層主色, 核心高光色]
    const PALETTES = {
        diamond: ['#1A237E', '#4A90E2', '#00FFFF'],
        gold: ['#5C3A00', '#D4A843', '#F8E370'],
        silver: ['#262523', '#8C8C96', '#E8E9E6'],
        bronze: ['#4A1500', '#B03A10', '#F95C4B'],
    };

    const colors = PALETTES[tierId] || PALETTES.gold;

    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', zIndex: 0, pointerEvents: 'none' }}>

            {/* 1. 底部基底廣域光 (火爐底部的悶燒感) */}
            <div style={{
                position: 'absolute',
                bottom: '-20%', left: '-10%', right: '-10%', height: '80%',
                background: `linear-gradient(to top, ${colors[0]} 10%, transparent 100%)`,
                filter: 'blur(20px)',
                opacity: 0.8
            }} />

            {/* 2. 波浪 A: 左側緩慢起伏 */}
            <motion.div
                animate={{ x: ['-10%', '15%', '-10%'], scaleY: [1, 1.4, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    position: 'absolute', bottom: '-50%', left: '-10%', width: '70%', height: '140%',
                    background: `radial-gradient(ellipse at bottom, ${colors[1]} 0%, transparent 70%)`,
                    filter: 'blur(35px)', mixBlendMode: 'screen', transformOrigin: 'bottom'
                }}
            />

            {/* 3. 波浪 B: 右側交錯起伏 */}
            <motion.div
                animate={{ x: ['10%', '-15%', '10%'], scaleY: [1.3, 0.9, 1.3], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    position: 'absolute', bottom: '-50%', right: '-10%', width: '80%', height: '130%',
                    background: `radial-gradient(ellipse at bottom, ${colors[0]} 0%, transparent 70%)`,
                    filter: 'blur(40px)', mixBlendMode: 'screen', transformOrigin: 'bottom'
                }}
            />

            {/* 4. 波浪 C: 中間高光核心 (火爐中心最亮處，呼吸頻率較快) */}
            <motion.div
                animate={{ x: ['-5%', '8%', '-5%'], scaleY: [0.8, 1.6, 0.8], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    position: 'absolute', bottom: '-40%', left: '15%', width: '70%', height: '100%',
                    background: `radial-gradient(ellipse at bottom, ${colors[2]} 0%, transparent 65%)`,
                    filter: 'blur(25px)', mixBlendMode: 'screen', transformOrigin: 'bottom'
                }}
            />

            {/* SVG 底片雜訊覆蓋 (Film Grain) */}
            <div style={{
                position: 'absolute', inset: 0, opacity: 0.15, mixBlendMode: 'overlay',
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
            }} />
        </div>
    );
};

export default function SquadsView({ type = 'run', userId = null }) {
    const [clubs, setClubs] = useState(() => loadClubs()); // lazy init — eliminates extra render (rerender-lazy-state-init)
    const [selectedClub, setSelectedClub] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState('');
    const [section, setSection] = useState('my');
    const [joinTarget, setJoinTarget] = useState(null); // club to join — triggers modal
    const [idSearch, setIdSearch] = useState('');       // private ID search field

    // 🔄 Switch Bottom Navigation based on internal view state
    useEffect(() => {
        const isInternalView = !!selectedClub || showCreate;
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', {
            detail: { hidden: isInternalView }
        }));
        return () => {
            window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
        };
    }, [selectedClub, showCreate]);

    // removed: useEffect setClubs — replaced by lazy useState initializer above

    // 🔄 進頁時向後端校正（reconcile）：localStorage 是快取、後端是真相源。
    //    修掉「建立社團後重開／換裝置就不見」— localStorage 被 WKWebView 清掉時，
    //    仍能從後端 memberships 把使用者的社團拉回本機。失敗則靜默沿用本機資料。
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        (async () => {
            const merged = await hydrateClubsFromBackend(userId, apiClient, loadClubs());
            if (!cancelled && merged) {
                setClubs(merged.map(club => ensureSquadId({ ...club, cover: normalizeSquadCover(club.cover) })));
            }
        })();
        return () => { cancelled = true; };
    }, [userId]);

    const clubType = type === 'run' || type === 'running' ? 'run' : 'strength';

    const ac = clubType === 'run' ? C.accent : C.sage;

    const handleUpdateClub = useCallback((updated) => {
        // 解散（社長）或退出（成員）—— 兩者都是把這個社團從我的清單移除
        if (updated._dissolve || updated._leave) {
            const newList = clubs.filter(c => c.id !== updated.id);
            setClubs(newList);
            saveClubs(newList);
            setSelectedClub(null);
            return;
        }
        const newList = clubs.map(c => c.id === updated.id ? updated : c);
        setClubs(newList);
        saveClubs(newList);
        setSelectedClub(updated);
    }, [clubs]);

    const handleCreate = async (data) => {
        const resolvedType = data.type || clubType;

        // 🔗 先嘗試後端建立 → 取得「全域唯一」squadId（修掉 client 端撞 ID 的 bug）
        let squadId = null;
        try {
            const resp = await apiClient.post('/api/squads/create', {
                name: data.name,
                type: resolvedType,
                privacy: data.isPublic === false ? 'private' : 'public',
                description: data.description || data.desc || '',
                cover_url: data.cover || null,
                avatar: data.avatar || '🏃',
                location: data.location || null,
                region: data.region || null,
                tags: data.tags || [],
                creator_id: userId,
                creator_name: getDisplayName(userId),
            });
            // 後端回傳 { squad: { id, ... } }，id 即全域唯一 squadId
            squadId = resp?.data?.squad?.id || null;
        } catch (err) {
            toast.error(failureDetail(err, '社團'));
            return;
        }
        // 後端不可用 → fallback 本地生成（離線仍可建立，連線後可再同步）
        if (!squadId) { toast.error('伺服器未回傳社團資料，請重試'); return; }

        const nc = {
            id: `c_${Date.now()}`,
            ...data,
            type: resolvedType,
            squadId,
            members: 1,
            maxMembers: 50,
            isJoined: true,
            createdAt: new Date().toISOString(),
            leaderId: userId,
            leaderName: getDisplayName(userId),
            weeklyDistance: 0,
            weeklyMembers: 1,
            feed: [],
            leaderboard: [
                { userId, name: getDisplayName(userId), avatar: data.avatar || null, distance: 0, volume: 0, runs: 0, sessions: 0, role: 'leader' }
            ],
            activeChallenges: [],
            customChallenges: [],
            chat: [],
            pendingApprovals: [],
            weeklyContributions: { [userId]: true },
            weeklyResetDate: new Date().toISOString(),
            vibeTier: 'bronze',
            vibeHistory: [],
            trophyCabinet: [],
        };
        const newList = [...clubs, nc];
        setClubs(newList);
        try {
            saveClubs(newList);
        } catch (err) {
            // localStorage 寫入失敗（容量滿/隱私模式）時不阻斷建立流程，至少 in-memory 先生效
            console.error('saveClubs failed:', err);
        }
        setShowCreate(false);
        // 建立後切到「我的」區並直接打開新社團，避免使用者以為沒成功
        setSection('my');
        setSelectedClub(nc);
    };

    // Handle join request — adds to pendingApprovals of that club
    const handleJoinRequest = async (clubId, reqData) => {
        const club = clubs.find(c => c.id === clubId);
        try {
            await apiClient.post(`/api/squads/${encodeURIComponent(club?.squadId || clubId)}/join`, {
                user_id: userId, user_name: getDisplayName(userId), avatar: reqData.avatar || null, note: reqData.message || '',
            });
        } catch (err) {
            toast.error(err?.response?.data?.detail || '申請未送出，請稍後重試');
            throw err;
        }
    };

    const handleDirectJoin = async (club) => {
        try {
            const response = await apiClient.post(`/api/squads/${encodeURIComponent(club.squadId || club.id)}/join`, {
                user_id: userId, user_name: getDisplayName(userId), avatar: null, note: '',
            });
            if (response.data.status === 'pending') {
                toast.success('申請已送出，等待審核');
                return;
            }
            const merged = await hydrateClubsFromBackend(userId, apiClient, clubs);
            if (merged) {
                setClubs(merged);
                setSelectedClub(merged.find(c => c.squadId === (club.squadId || club.id)) || null);
            }
            toast.success(`已加入「${club.name}」`);
            try { recordFirst(userId, 'join_squad'); } catch { /* optional celebration */ }
        } catch (err) {
            toast.error(failureDetail(err, '社團'));
        }
    };

    // 統一入口：依公開/私密決定加入方式
    const handleJoinClick = (club) => {
        if (club.isPublic === false) setJoinTarget(club); // 私密 → 申請審核
        else handleDirectJoin(club);                       // 公開 → 直接加入
    };

    // ── Search & Filter Logic ──
    // Public clubs: searchable by name; Private clubs: only surfaced if user types exact squadId
    const searchTrimmed = search.trim();
    const idSearchTrimmed = idSearch.trim().toUpperCase();

    /* ══════════════════════════════════════════════════════════════════
       探索公開社團 —— 真的去後端搜
       ══════════════════════════════════════════════════════════════════
       原本只 filter 本機 clubs（都是我已加入的），所以「輸入名稱搜尋」永遠
       0 筆，探索分頁是一個出不去的空狀態。改成打 GET /api/squads/。
       ⚠️ 不依分頁類型過濾 —— 那正是「建了健身團就消失」那類 bug 的來源，
          類型改用卡片上的標籤呈現，讓使用者自己看。 */
    const [remoteDiscover, setRemoteDiscover] = useState(null);   // null = 還沒查
    const [discoverBusy, setDiscoverBusy] = useState(false);
    /* 失敗時存「那一句話」而不是 true —— 伺服器 500 跟你沒網路是兩回事，
       畫面不能一律說成「連不到伺服器」。 */
    const [discoverFailed, setDiscoverFailed] = useState(null);

    useEffect(() => {
        let dead = false;
        setDiscoverBusy(true);
        const t = setTimeout(async () => {
            try {
                const resp = await apiClient.get('/api/squads/', {
                    params: { privacy: 'public', limit: 20, ...(searchTrimmed ? { search: searchTrimmed } : {}) },
                });
                if (dead) return;
                const list = Array.isArray(resp?.data?.squads) ? resp.data.squads : [];
                setRemoteDiscover(list.map(toDiscoverClub));
                setDiscoverFailed(null);
            } catch (err) {
                if (dead) return;
                setRemoteDiscover([]);
                setDiscoverFailed(failureLine(err, '社團'));   // 「找不到」和「沒有社團」是兩件事
            } finally {
                if (!dead) setDiscoverBusy(false);
            }
        }, searchTrimmed ? 350 : 0);   // 打字的時候 debounce
        return () => { dead = true; clearTimeout(t); };
    }, [searchTrimmed]);

    const publicDiscover = useMemo(() => {
        const joined = new Set(clubs.filter(c => c.isJoined).map(c => String(c.squadId || c.id)));
        const seen = new Set();
        const out = [];
        // 後端結果優先（那才是真的「別人的社團」）
        for (const c of (remoteDiscover || [])) {
            const key = String(c.squadId || c.id);
            if (joined.has(key) || seen.has(key)) continue;
            seen.add(key); out.push(c);
        }
        // 本機還沒加入的（例如展示用社團）補在後面
        for (const c of clubs) {
            const key = String(c.squadId || c.id);
            if (c.isJoined || seen.has(key) || c.isPublic === false) continue;
            if (searchTrimmed && !String(c.name || '').toLowerCase().includes(searchTrimmed.toLowerCase())) continue;
            seen.add(key); out.push(c);
        }
        return out;
    }, [clubs, remoteDiscover, searchTrimmed]);

    // ID 搜尋結果：以「精準 ID」比對，同時接受 squadId 或內部 id（兼容舊/種子社團）。
    // 不再限制 isPublic / isJoined —— ID 是精準碼，找到就該顯示；
    // 已加入的情況改在 UI 顯示「開啟」而非「查無」（先前社長搜自己社團必定查無的 bug）。
    const matchSquadCode = (c) => {
        const code = (c.squadId || c.id || '').toString().toUpperCase();
        return code === idSearchTrimmed;
    };
    const privateIdResult = idSearchTrimmed.length >= 3
        ? clubs.find(matchSquadCode)
        : null;
    // 後端全域查詢結果（本機 clubs 沒有時，跨裝置/帳號用）
    const [remoteIdResult, setRemoteIdResult] = useState(null);
    const [idSearching, setIdSearching] = useState(false);

    // 🌐 本機找不到時 → 打後端 GET /api/squads/{id} 做全域查詢，
    //    讓「別人建立、不在我本機清單」的社團也能用 ID 找到並申請加入。
    useEffect(() => {
        // 本機已找到，或字數不足 → 不查後端
        if (privateIdResult || idSearchTrimmed.length < 3) {
            setRemoteIdResult(null);
            setIdSearching(false);
            return;
        }
        let cancelled = false;
        setIdSearching(true);
        const t = setTimeout(async () => {
            try {
                const resp = await apiClient.get(`/api/squads/${encodeURIComponent(idSearchTrimmed)}`);
                const s = resp?.data?.squad || resp?.data;
                if (!cancelled && s && s.id) {
                    // 後端社團 shape → 前端 club shape（僅供顯示＋申請加入）
                    setRemoteIdResult({
                        id: s.id,
                        squadId: s.id,
                        name: s.name,
                        avatar: s.avatar || '🏃',
                        cover: normalizeSquadCover(s.cover_url || s.cover),
                        members: s.members ?? (s.member_list?.length || 0),
                        isPublic: s.privacy !== 'private',
                        type: s.type,
                        isJoined: (s.member_list || []).some(m => m.user_id === userId),
                        _remote: true,
                    });
                } else if (!cancelled) {
                    setRemoteIdResult(null);
                }
            } catch (_) {
                if (!cancelled) setRemoteIdResult(null);  // 404 / 離線 → 視為查無
            } finally {
                if (!cancelled) setIdSearching(false);
            }
        }, 350);  // debounce，避免每打一個字就打一次後端
        return () => { cancelled = true; clearTimeout(t); };
    }, [idSearchTrimmed, privateIdResult, userId]);

    // 最終要顯示的 ID 搜尋結果：本機優先，否則用後端查到的
    const idResult = privateIdResult || remoteIdResult;

    /* 🩹 這裡原本只留「跟當前分頁同類型」的社團 —— 但建立精靈允許在跑步社群頁
       開一個健身社團，建完看得到、按返回就從「我的社團」消失，像被吃掉。
       我加入的社團一律要看得到；分頁只決定排序（同類型的排前面），不決定存在與否。 */
    const myClubs = useMemo(() => {
        const mine = clubs.filter((c) => c.isJoined);
        const rank = (c) => {
            const t = normalizeClubType(c.type);
            if (t === clubType) return 0;
            if (t === 'multisport') return 1;
            return 2;
        };
        return [...mine].sort((a, b) => rank(a) - rank(b));
    }, [clubs, clubType]);

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar" style={{ background: 'transparent', paddingBottom: 'max(80px, env(safe-area-inset-bottom))' }}>
            <div className="px-4 mt-0">
                <AnimatePresence>{selectedClub && <ClubDetail club={selectedClub} onBack={() => setSelectedClub(null)} onUpdate={handleUpdateClub} userId={userId} clubType={clubType} />}</AnimatePresence>
                <AnimatePresence>{showCreate && <CreateClubWizard onClose={() => setShowCreate(false)} onCreate={handleCreate} clubType={clubType} />}</AnimatePresence>
                <AnimatePresence>{joinTarget && <JoinRequestModal club={joinTarget} userId={userId} onClose={() => setJoinTarget(null)} onRequest={handleJoinRequest} />}</AnimatePresence>

                {!selectedClub && <>
                    {/* ── 我的社團 / 探索社團 ──
                        ⚠️ 原本每個分頁上面還有一行英文（JOINED / DISCOVER）—— 就是下面中文的翻譯（§3）；
                           右邊的 RESET 會把整台裝置的社團清單清空，放在「建立」旁邊太容易誤按，而且一般使用者用不到。 */}
                    <div className="flex items-center gap-6 mb-6 border-b border-black/10 relative z-10" style={{ paddingBottom: 12 }}>
                        {[
                            { id: 'my', zh: '我的社團' },
                            { id: 'explore', zh: '探索社團' },
                        ].map(({ id, zh }) => (
                            <motion.button key={id} {...pressProps('pill')} onClick={() => setSection(id)}
                                aria-pressed={section === id}
                                className="relative flex items-center"
                                style={{ minHeight: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: section === id ? 1 : 0.4, transition: 'opacity 0.2s' }}
                            >
                                <span className="text-[19px] font-bold" style={{ fontFamily: 'var(--font-display)', color: C.text, whiteSpace: 'nowrap' }}>{zh}</span>
                                {section === id && (
                                    <motion.div layoutId="navIndicator" className="absolute left-0 w-full" style={{ bottom: -13, height: 2, borderRadius: 2, background: C.text }} />
                                )}
                            </motion.button>
                        ))}
                        <div className="flex-1" />
                        <motion.button {...pressProps('pill')} onClick={() => setShowCreate(true)}
                            className="flex items-center gap-1.5"
                            style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: 'none', background: C.text, color: C.paper, fontSize: 14, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <Plus size={15} strokeWidth={2.6} /> 建立
                        </motion.button>
                    </div>

                    <AnimatePresence mode="wait">
                        {section === 'my' ? (
                            <motion.div key="my" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                                {myClubs.length > 0 ? (
                                    <div className="no-scrollbar" style={{
                                        display: 'flex', gap: 14,
                                        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                                        padding: '4px 0 24px',
                                        scrollSnapType: 'x mandatory',
                                        marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
                                    }}>
                                        {myClubs.map((club, i) => {
                                            const vb = getWeeklyVibeData(club);
                                            return (
                                                <motion.div key={club.id}
                                                    {...pressProps('card')}
                                                    initial={{ opacity: 0, y: 30 }}
                                                    animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 5) * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
                                                    onClick={() => setSelectedClub(club)}
                                                    className="flex-shrink-0 relative overflow-hidden cursor-pointer"
                                                    style={{ width: 256, height: 336, background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 24, scrollSnapAlign: 'start', boxShadow: '0 12px 32px -18px rgba(22,20,21,0.3)' }}>

                                                    <div className="w-full relative overflow-hidden" style={{ height: '62%' }}>
                                                        <img
                                                            src={squadCover(club)} onError={onCoverError} alt="" loading="lazy" decoding="async"
                                                            className="w-full h-full object-cover" style={{ filter: 'grayscale(25%) contrast(1.05)' }}
                                                        />
                                                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(22,20,21,0.55), transparent 55%, rgba(22,20,21,0.2))' }} />
                                                        <span className="absolute" style={{
                                                            top: 12, right: 12, padding: '5px 10px', borderRadius: 999,
                                                            background: 'rgba(22,20,21,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                                                            color: C.paper, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                                                        }}>{club.members} 位成員</span>
                                                    </div>

                                                    <div className="absolute bottom-0 left-0 right-0 flex flex-col justify-between" style={{ height: '38%', padding: '14px 16px 14px' }}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                <span style={{ color: C.accent }}>{clubTypeZh(club.type)}</span> · 活躍程度 {vb.tier.nameZh}
                                                            </p>
                                                            <h3 className="line-clamp-1" style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.2, fontFamily: 'var(--font-display)', color: C.text }}>
                                                                {club.name}
                                                            </h3>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${C.pebble}`, paddingTop: 10, minWidth: 0 }}>
                                                            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                                                                <div className="flex items-center justify-center overflow-hidden flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(22,20,21,0.06)', fontSize: 14 }}>
                                                                    {club.customAvatar ? <img loading="lazy" decoding="async" src={club.customAvatar} alt="" className="w-full h-full object-cover" /> : club.avatar}
                                                                </div>
                                                                {club.location && <span style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{club.location}</span>}
                                                            </div>
                                                            <span style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                <b style={{ color: C.text }}>{vb.activeCount}/{vb.totalMembers}</b> 人活躍
                                                            </span>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}

                                        <motion.button
                                            {...pressProps('card')}
                                            onClick={() => setShowCreate(true)}
                                            className="flex-shrink-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
                                            style={{ width: 156, height: 336, background: 'rgba(255,255,255,0.45)', border: `1.5px dashed ${C.pebble}`, borderRadius: 24, scrollSnapAlign: 'start' }}>
                                            <span className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: 14, border: `1.5px solid ${C.text}`, color: C.text }}>
                                                <Plus size={20} strokeWidth={1.8} />
                                            </span>
                                            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: C.text }}>建立社團</span>
                                        </motion.button>
                                    </div>
                                ) : (
                                    <div className="text-center" style={{ padding: '48px 20px', background: 'rgba(255,255,255,0.5)', border: `1px solid ${C.pebble}`, borderRadius: 24 }}>
                                        <Users size={30} style={{ opacity: 0.2, margin: '0 auto 12px', color: C.text }} />
                                        <p style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, fontFamily: 'var(--font-display)', color: C.text }}>還沒加入社團</p>
                                        <motion.button {...pressProps('pill')} onClick={() => setSection('explore')}
                                            style={{ minHeight: 44, padding: '0 22px', borderRadius: 999, border: 'none', background: C.text, color: C.paper, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                                            去探索社團
                                        </motion.button>
                                    </div>
                                )}

                                {myClubs.length > 0 && (
                                    <div className="mt-6 mb-4 flex justify-around items-center" style={{ padding: '20px 0', borderTop: '1px solid rgba(22,20,21,0.1)', borderBottom: '1px solid rgba(22,20,21,0.1)' }}>
                                        {[
                                            { zh: '總成員', value: myClubs.reduce((s, q) => s + q.members, 0) },
                                            { zh: '進行中挑戰', value: myClubs.reduce((s, q) => s + (q.activeChallenges?.length || 0), 0) },
                                            { zh: '社團數', value: myClubs.length },
                                        ].map(({ zh, value }, i) => (
                                            <div key={zh} className="flex flex-col items-center flex-1 relative">
                                                {i !== 0 && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[1px] h-10 bg-black/10" />}
                                                <p style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 300, lineHeight: 1, fontFamily: 'var(--font-display)', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.sub }}>{zh}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div key="explore" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>

                                {/* ── 搜尋公開社團 —— 輸入框自己說明要做什麼，不另外寫一句解釋（§4.1）── */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 6px 0 16px', background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 16, marginBottom: 12 }}>
                                    <Search size={16} color={C.sub} style={{ flexShrink: 0 }} />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋公開社團"
                                        style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: C.text, outline: 'none' }} />
                                    {search && (
                                        <motion.button {...pressProps('icon')} aria-label="清除搜尋" onClick={() => setSearch('')}
                                            style={{ width: 44, height: 44, borderRadius: 999, background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                            <X size={16} color={C.sub} />
                                        </motion.button>
                                    )}
                                </div>

                                {/* ── 私人社團：輸入 ID ──
                                    ⚠️ 原本是土黃色左邊條＋直角方框，跟整個 App 的色票與圓角都不一致。 */}
                                <div style={{ marginBottom: 26, padding: 16, background: 'rgba(255,255,255,0.5)', border: `1px solid ${C.pebble}`, borderRadius: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                        <Lock size={13} color={C.text} />
                                        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.text }}>私人社團</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input value={idSearch} onChange={e => setIdSearch(e.target.value.toUpperCase())}
                                            placeholder="輸入社團 ID（例：STR-0042）"
                                            style={{ flex: 1, minWidth: 0, minHeight: 46, padding: '0 14px', fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: C.text, background: 'white', border: `1.5px solid ${idSearch ? C.text : C.pebble}`, borderRadius: 14, outline: 'none', boxSizing: 'border-box' }} />
                                        {idSearch && (
                                            <motion.button {...pressProps('icon')} aria-label="清除 ID" onClick={() => setIdSearch('')}
                                                style={{ width: 46, height: 46, background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                                <X size={16} color={C.sub} />
                                            </motion.button>
                                        )}
                                    </div>

                                    {idSearchTrimmed.length >= 3 && (
                                        <div style={{ marginTop: 12 }}>
                                            {idResult ? (
                                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                                    style={{ background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 16, overflow: 'hidden' }}>
                                                    <div style={{ height: 64, position: 'relative', overflow: 'hidden' }}>
                                                        <img loading="lazy" decoding="async" src={squadAssetUrl(idResult.cover)} onError={onCoverError} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(30%)' }} />
                                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(22,20,21,0.5)' }} />
                                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, minWidth: 0 }}>
                                                            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(246,244,241,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{idResult.avatar}</span>
                                                            <div style={{ minWidth: 0 }}>
                                                                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'white', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{idResult.name}</p>
                                                                <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{idResult.members} 位成員</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                                                        {idResult.isJoined ? (
                                                            <motion.button {...pressProps('pill')} onClick={() => { const local = clubs.find(matchSquadCode); if (local) setSelectedClub(local); }}
                                                                style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, background: 'rgba(22,20,21,0.06)', border: 'none', fontSize: 14, fontWeight: 800, color: C.text, cursor: 'pointer' }}>
                                                                已加入 · 開啟
                                                            </motion.button>
                                                        ) : (
                                                            <motion.button {...pressProps('pill')} onClick={() => handleJoinClick(idResult)}
                                                                style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, background: C.text, border: 'none', fontSize: 14, fontWeight: 800, color: C.paper, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <UserPlus size={14} /> {idResult.isPublic !== false ? '加入' : '申請加入'}
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <p style={{ fontSize: 12, color: C.sub, margin: '4px 2px 0' }}>{idSearching ? '搜尋中…' : '找不到這個 ID'}</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── 公開社團 ── */}
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <h3 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: 0, fontFamily: 'var(--font-display)' }}>公開社團</h3>
                                    {!discoverBusy && !discoverFailed && publicDiscover.length > 0 && (
                                        <span style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{publicDiscover.length} 個</span>
                                    )}
                                </div>

                                {publicDiscover.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {publicDiscover.map((club, i) => {
                                            const vb = getWeeklyVibeData(club);
                                            const isPending = (club.pendingApprovals || []).some(p => p.userId === userId);
                                            return (
                                                <motion.div key={club.id}
                                                    initial={{ opacity: 0, y: 16 }}
                                                    animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 5) * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
                                                    style={{ background: 'white', border: `1px solid ${C.pebble}`, borderRadius: 20, overflow: 'hidden', display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
                                                    <div style={{ width: 84, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                                                        <img src={squadCover(club)} onError={onCoverError} alt="" loading="lazy" decoding="async"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%) contrast(1.05)' }} />
                                                    </div>
                                                    <div style={{ flex: 1, padding: '12px 12px 12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, gap: 10 }}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <p className="line-clamp-1" style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{club.name}</p>
                                                            <p style={{ margin: 0, fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                <span style={{ color: C.accent, fontWeight: 700 }}>{clubTypeZh(club.type)}</span>
                                                                {club.location ? ` · ${club.location}` : ''} · {club.members} 位成員 · 活躍程度 {vb.tier.nameZh}
                                                            </p>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                            {isPending ? (
                                                                <span style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: C.sub, background: 'rgba(22,20,21,0.05)' }}>審核中</span>
                                                            ) : (
                                                                <motion.button {...pressProps('pill')} onClick={() => handleJoinClick(club)}
                                                                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, background: C.text, border: 'none', fontSize: 14, fontWeight: 800, color: C.paper, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <UserPlus size={14} /> {club.isPublic !== false ? '加入' : '申請加入'}
                                                                </motion.button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                ) : discoverBusy ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {[0, 1, 2].map(i => (
                                            <div key={i} className="ti-skeleton" style={{ height: 104, borderRadius: 20 }} />
                                        ))}
                                    </div>
                                ) : (
                                    /* 空狀態只講一句（§7）；連不到 ≠ 沒有社團，文字要分開 */
                                    <div style={{ textAlign: 'center', padding: '32px 16px', border: `1px dashed ${C.pebble}`, borderRadius: 20 }}>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                                            {discoverFailed ? '連不上伺服器，稍後再試'
                                                : searchTrimmed ? `沒有叫「${searchTrimmed}」的公開社團` : '還沒有公開社團'}
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>}
            </div>
        </div>
    );
}
