/**
 * membership.js — 會員身分與「哪些功能要會員」的唯一定義
 * ══════════════════════════════════════════════════════════════════════
 * 原則（見《DRVN 付費模式分析》）：
 *   · 紀錄、固定課表、安全（減量、過負荷警示）永遠免費
 *   · 會員買的是「會自動調整、看得更深、預測得出來」
 *   · 減量永遠免費，自動加量才是會員
 *
 * 會員身分的真相源在後端 GET /api/membership/me（已含付費牆開關）。
 * 這裡只做三件事：抓回來、快取、讓畫面訂閱變化。
 * 還沒抓到（離線、首次開啟）時：付費牆沒開 → 視為會員；開了 → 用上次快取。
 *
 * 開發預覽：dev build 可在「登入設定」切換「預覽免費版／會員版」，只影響本機畫面。
 */
import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { FLAGS } from '../config/featureFlags';
import { getUserId, isLoggedIn } from './auth';
import { setReadinessSignalGate } from './readiness';
import { poseCheckAllowed, setFeatureGate, MEMBERSHIP_PLANS, planByProduct, readRenewal, renewalStorageKey, effectiveMembershipCache } from './memberLimits';

/** 會員功能清單（畫面上講給使用者聽的名字；付費牆也從這裡取） */
export const MEMBER_FEATURES = {
    sessionWeight:   { title: '每次訓練帶好重量', line: '依你每一組的紀錄，告訴你今天練多重' },
    autoProgress:    { title: '訓練太輕鬆自動加量', line: '照你填的體感，下週自動升一級' },
    runAutoProgress: { title: '跑得順自動加里程', line: '週結算判定升階，下週里程自動加上去' },
    seasonAuto:      { title: '換季一鍵套用', line: '依這一季的紀錄，直接改好下一季' },
    // 名單跟 utils/advancedCharts 的 CHART_REGISTRY 對得上；進階模式跟進階圖表是同一個開關
    advancedCharts:  { title: '進階圖表', line: 'VO₂max、體能與新鮮度、訓練負荷、動態代謝' },
    readiness:       { title: '準備度加入睡眠與 HRV', line: '對照你自己 30 天的睡眠、HRV、靜息心率' },
    forecast:        { title: '成效預測', line: '照著練會進步多少、體態往哪走' },
    runAnalysis:     { title: '完整跑步分析', line: '教練全部建議、配速心率曲線、跑姿與負荷' },
    strengthAnalysis:{ title: '完整健身分析', line: '分數拆解、逐項判讀、容量與 1RM 成長趨勢' },
    monthlyReport:   { title: '月報', line: '每個月的訓練、跑步、營養總結與季回饋' },
    reportPdf:       { title: '匯出 PDF 報告', line: '月報與進化日誌排版好的 A4 報告' },
    courses:         { title: '進階課程完整版', line: '型男、翹臀、HYROX 等五門課第 2 週起' },
    placePlans:      { title: '依地點排課', line: '健身房只排有的器材，跑點排適合的課' },
    // 完整歷史、健身人格 2026-09 起改免費：資料本來就是使用者的；健身人格是分享的誘因
    // 姿勢檢查 2026-09 起全部免費、不限次數（本地運算、還在收集回饋），不在會員清單上
};

/** 方案與價格：唯一一份在 utils/memberLimits（純函式檔，首頁提醒也要讀），這裡轉出 */
export { MEMBERSHIP_PLANS, planByProduct, renewalReminder } from './memberLimits';

const EVENT = 'drvn:membership-changed';
const PREVIEW_KEY = 'drvn_membership_preview';          // 'free' | 'member'（僅開發）
const cacheKey = (uid) => `drvn_membership_${uid || 'guest'}`;
const devPreviewAllowed = () => !!(FLAGS.devTools || import.meta.env?.DEV);

function readCache(uid) {
    try {
        const raw = localStorage.getItem(cacheKey(uid));
        const v = raw ? JSON.parse(raw) : null;
        return v && typeof v.is_member === 'boolean' ? effectiveMembershipCache(v) : null;
    } catch (_) { return null; }
}

function broadcast() {
    try { window.dispatchEvent(new CustomEvent(EVENT)); } catch (_) { /* ignore */ }
}

/** 開發預覽覆寫：'free' | 'member' | null */
export function getMembershipPreview() {
    if (!devPreviewAllowed()) return null;
    try {
        const v = localStorage.getItem(PREVIEW_KEY);
        return v === 'free' || v === 'member' ? v : null;
    } catch (_) { return null; }
}

export function setMembershipPreview(mode) {
    if (!devPreviewAllowed()) return;
    try {
        if (mode === 'free' || mode === 'member') localStorage.setItem(PREVIEW_KEY, mode);
        else localStorage.removeItem(PREVIEW_KEY);
    } catch (_) { /* ignore */ }
    broadcast();
}

/** 目前是否為會員（同步判斷，任何地方都用這支） */
export function isMember() {
    const preview = getMembershipPreview();
    if (preview) return preview === 'member';
    const cached = readCache(getUserId());
    if (cached) return cached.is_member;
    return !FLAGS.membershipGate;
}

/** 付費牆是否在運作（後端開關；開發預覽時視為運作中）。沒運作時不顯示任何會員入口 */
export function isGateActive() {
    if (getMembershipPreview()) return true;
    const cached = readCache(getUserId());
    if (cached && typeof cached.gate_enabled === 'boolean') return cached.gate_enabled;
    return !!FLAGS.membershipGate;
}

/** 真的有訂閱（試用中／有效／寬限期）—— 設定頁顯示「管理訂閱」用 */
export function isSubscribed() {
    const preview = getMembershipPreview();
    if (preview) return preview === 'member';
    const cached = readCache(getUserId());
    return !!cached && ['trial', 'active', 'grace'].includes(cached.status);
}

/** 永久免費會員（後端 FREE_MEMBERS 名單或創始會員）：'free_list' | 'founding' | null */
export function compReason() {
    const cached = readCache(getUserId());
    return cached && cached.status === 'comp' ? (cached.comp_reason || 'free_list') : null;
}

/** 這個會員功能現在能不能用 */
export function canUse(feature) {
    if (!MEMBER_FEATURES[feature]) return true;   // 不在清單上 = 免費功能
    return isMember();
}

/** 姿勢檢查這個月還能不能做（次數由後端 /api/membership/me 回報，後端也會擋） */
export function canStartPoseCheck() {
    const cached = readCache(getUserId());
    return poseCheckAllowed(cached?.pose_checks_used ?? 0, isMember());
}

// 準備度：睡眠／HRV／靜息心率是會員；訓練負荷（肌群恢復）永遠免費。
// readiness.js 保持純函式，由這裡把「能不能用」注入進去。
setReadinessSignalGate(() => canUse('readiness'));
// 提醒／首頁提示這些純工具檔透過 memberLimits.featureAllowed 問同一個問題
setFeatureGate((feature) => canUse(feature));

/** 向後端更新會員狀態（登入後、回到 App 時呼叫） */
export async function refreshMembership() {
    const uid = getUserId();
    try {
        const res = await apiClient.get('/api/membership/me');
        const data = res?.data;
        if (data && typeof data.is_member === 'boolean' && uid === getUserId()) saveMembership(data);
        return data || null;
    } catch (_) {
        return null;   // 離線：沿用快取，不改變畫面
    }
}

// ── App 內購（iOS StoreKit 2 橋接，見 ios/FitnessApp/StoreManager.swift）────────
//   網頁 → 原生：window.webkit.messageHandlers.purchase.postMessage({ action, productId })
//   原生 → 網頁：window 事件 'drvn:iap'（products / purchased / pending / cancelled / failed / entitlements）
//   買到的交易一律送後端驗 Apple 簽章才算數（POST /api/membership/apple/verify）。
//   驗證結果再廣播 'drvn:iap-done'：{ kind: 'purchase' | 'restore' | 'sync', ok, reason, count }
export const IAP_EVENT = 'drvn:iap';
export const IAP_DONE_EVENT = 'drvn:iap-done';

const iapBridge = () => { try { return window.webkit?.messageHandlers?.purchase || null; } catch (_) { return null; } };
export const iapAvailable = () => !!iapBridge();

/** 叫原生做事：'products' | 'buy' | 'restore' | 'sync'。沒有原生橋接（網頁版）回 false */
export function iapSend(action, productId) {
    const bridge = iapBridge();
    if (!bridge) return false;
    try { bridge.postMessage(productId ? { action, productId } : { action }); return true; } catch (_) { return false; }
}

const PAID = ['trial', 'active', 'grace'];

function saveMembership(data) {
    if (!data || typeof data.is_member !== 'boolean') return;
    const prev = readCache(getUserId());
    try { localStorage.setItem(cacheKey(getUserId()), JSON.stringify({ ...data, fetched_at: Date.now() })); } catch (_) { /* ignore */ }
    /* 剛開始訂閱（含免費試用）→ 進階圖表直接打開。
       新手在 onboarding 會被設成「基本圖表」，不打開的話，付完錢回到分析頁畫面一模一樣。
       只在「從沒訂閱變成訂閱」那一刻做一次，之後使用者自己關掉就尊重他。 */
    if (PAID.includes(data.status) && !PAID.includes(prev?.status)) {
        try {
            localStorage.setItem('drvn_chart_level', 'advanced');
            localStorage.setItem('drvn_advanced_charts', '1');
            window.dispatchEvent(new CustomEvent('drvn:advanced-charts-changed', { detail: { pref: 'advanced' } }));
        } catch (_) { /* ignore */ }
    }
    broadcast();
}

/** 把 Apple 簽的交易送後端驗證；回 { ok, reason } —— reason: login | invalid | network */
export async function verifyAppStoreTransactions(transactions = []) {
    if (!isLoggedIn()) return { ok: false, reason: 'login' };
    const uid = getUserId();
    try {
        const res = await apiClient.post('/api/membership/apple/verify', { transactions });
        if (uid !== getUserId()) return { ok: false, reason: 'login' };
        if (typeof res?.data?.is_member !== 'boolean') return { ok: false, reason: 'invalid' };
        saveMembership(res?.data);
        return { ok: true, data: res?.data };
    } catch (e) {
        const code = e?.response?.status;
        return { ok: false, reason: code === 401 ? 'login' : code === 400 ? 'invalid' : 'network' };
    }
}

function iapDone(detail) {
    try { window.dispatchEvent(new CustomEvent(IAP_DONE_EVENT, { detail })); } catch (_) { /* ignore */ }
}

let iapListening = false;
/** 全域只掛一次：購買、恢復、背景續訂／家長核准進來的交易都在這裡送後端 */
export function ensureIapListener() {
    if (iapListening || typeof window === 'undefined' || !window.addEventListener) return;
    iapListening = true;
    window.addEventListener(IAP_EVENT, async (e) => {
        const d = e?.detail || {};
        if (d.renewal !== undefined) handleRenewal(d.renewal);
        if (d.type === 'purchased' && d.transaction) {
            iapDone({ kind: 'purchase', ...(await verifyAppStoreTransactions([d.transaction])) });
        } else if (d.type === 'entitlements') {
            const list = Array.isArray(d.transactions) ? d.transactions : [];
            const kind = d.restore ? 'restore' : 'sync';
            if (!list.length) { iapDone({ kind, ok: true, count: 0 }); return; }
            iapDone({ kind, count: list.length, ...(await verifyAppStoreTransactions(list)) });
        }
    });
}

// ── 續訂狀態（手機 StoreKit 回報）：方案頁、扣款前提醒、退訂問卷都讀這一份 ──────────
//   { productId, expiresAt(ms), willAutoRenew, isTrial, firstRenewal, displayPrice }
const renewalKey = renewalStorageKey;
const surveyKey = (uid) => `drvn_member_survey_${uid || 'guest'}`;

export function getRenewal() {
    return readRenewal(getUserId());
}

function handleRenewal(r) {
    const uid = getUserId();
    try {
        if (r && r.productId) localStorage.setItem(renewalKey(uid), JSON.stringify({ ...r, updatedAt: Date.now() }));
        else localStorage.removeItem(renewalKey(uid));
    } catch (_) { /* ignore */ }
    broadcast();
    // 關掉自動續訂 → 問一次為什麼（同一期訂閱只問一次）
    if (r && r.productId && r.willAutoRenew === false) {
        const key = `${r.productId}:${r.expiresAt}`;
        if (!surveyAsked('cancel', key)) openSurvey('cancel', { key, productId: r.productId });
    }
}

/** 目前會員資料（後端為準）＋ 手機回報的續訂狀態 */
export function membershipInfo() {
    const c = readCache(getUserId()) || {};
    return {
        status: c.status || 'none',
        productId: c.product_id || getRenewal()?.productId || null,
        expiresAt: c.expires_at || null,
        comp: c.status === 'comp' ? (c.comp_reason || 'free_list') : null,
        renewal: getRenewal(),
    };
}

/** 方案名稱＋一句狀態（PREMIER 卡、方案頁共用） */
export function planSummary(info = membershipInfo()) {
    if (info.comp) return { name: info.comp === 'founding' ? '創始會員' : '永久會員', line: '永久免費，不用訂閱' };
    const r = info.renewal;
    const plan = planByProduct(info.productId);
    const periodName = plan ? (plan.id === 'yearly' ? '年訂閱' : '月訂閱') : '會員';
    const per = plan ? (plan.id === 'yearly' ? '年' : '月') : '';
    const exp = r?.expiresAt || (info.expiresAt ? Date.parse(info.expiresAt) : null);
    const d = exp ? new Date(exp) : null;
    const date = d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}月${d.getDate()}日` : null;
    const price = r?.displayPrice || (plan ? `NT$${plan.price.toLocaleString()}` : '');
    const priceLine = price && per ? `${price}／${per}` : '';
    if (info.status === 'grace') return { name: periodName, line: '這期扣款沒成功，請到 Apple 帳號確認付款方式' };
    if (r?.willAutoRenew === false) return { name: periodName, line: date ? `${date} 到期，不會再扣款` : '已取消自動續訂' };
    if (info.status === 'trial' || r?.isTrial) {
        return { name: `免費試用中・${periodName}`, line: date ? `${date} 試用結束${priceLine ? `，之後 ${priceLine}` : ''}` : '免費試用中' };
    }
    return { name: periodName, line: date ? `下次扣款 ${date}${priceLine ? `・${priceLine}` : ''}` : priceLine || 'DRVN 會員' };
}

/** Apple 的訂閱管理頁（取消、換方案都在這裡） */
export function openManageSubscriptions() {
    // App 內走原生 StoreKit（AppStore.showManageSubscriptions）：WKWebView 裡 window.open 按了不會有任何反應
    if (iapAvailable()) { ensureIapListener(); if (iapSend('manage')) return; }
    try { window.open('https://apps.apple.com/account/subscriptions', '_blank'); } catch (_) { /* ignore */ }
}

// ── 會員方案頁（設定頁的 PREMIER 卡、首頁扣款提醒都開這個）──
export const OPEN_PLAN_EVENT = 'drvn:open-plan-sheet';
export function openPlanSheet() {
    try { window.dispatchEvent(new CustomEvent(OPEN_PLAN_EVENT)); } catch (_) { /* ignore */ }
}

// ── 訂閱／退訂原因問卷（後端 /api/membership/survey；統計頁 /api/membership/survey/dashboard）──
//   id 與後端 api_membership.SURVEY_REASONS 同一份
export const SURVEY_REASONS = {
    subscribe: [
        ['auto_adjust', '課表會自動調整、加量'],
        ['analysis', '完整的跑步／健身分析'],
        ['charts', '進階圖表與長期趨勢'],
        ['report', '月報與 PDF 報告'],
        ['courses', '進階課程'],
        ['support', '想支持 DRVN'],
        ['other', '其他'],
    ],
    // 姿勢分析準不準（結果頁 PoseFeedbackCard）：前三個是判定，其餘是「哪裡不準」
    pose: [
        ['accurate', '很準'],
        ['partly', '部分準'],
        ['inaccurate', '不準'],
        ['count', '次數算錯'],
        ['depth', '深度／角度判斷錯'],
        ['skeleton', '骨架沒對上身體'],
        ['advice', '建議不合理'],
        ['filming', '不知道怎麼拍'],
        ['slow', '分析太慢'],
    ],
    cancel: [
        ['price', '太貴了'],
        ['not_used', '會員功能用不太到'],
        ['expectation', '功能不如預期'],
        ['trial_only', '只是想試用看看'],
        ['break', '最近沒在運動'],
        ['other_app', '改用其他 App'],
        ['bug', '遇到問題或錯誤'],
        ['other', '其他'],
    ],
};
export const SURVEY_EVENT = 'drvn:membership-survey';

function surveyState() {
    try { return JSON.parse(localStorage.getItem(surveyKey(getUserId())) || '{}') || {}; } catch (_) { return {}; }
}
export function surveyAsked(kind, key) {
    return !!surveyState()[`${kind}:${key}`];
}
export function markSurveyAsked(kind, key) {
    try {
        const st = surveyState();
        st[`${kind}:${key}`] = Date.now();
        localStorage.setItem(surveyKey(getUserId()), JSON.stringify(st));
    } catch (_) { /* ignore */ }
}
export function openSurvey(kind, extra = {}) {
    try { window.dispatchEvent(new CustomEvent(SURVEY_EVENT, { detail: { kind, ...extra } })); } catch (_) { /* ignore */ }
}
/** 送出問卷；失敗不重試、不擋畫面（統計用，不是必要流程） */
export async function submitSurvey(kind, reasons = [], { note = '', productId = null, feature = null } = {}) {
    try {
        await apiClient.post('/api/membership/survey', {
            kind, reasons, note: String(note || '').slice(0, 300), product_id: productId, feature,
        });
        return true;
    } catch (_) { return false; }
}

/** App 開啟、回到前景時：請原生回報手上有效的訂閱（不跳任何視窗），續訂就這樣補上 */
export function startAppStoreSync() {
    if (!iapAvailable() || !isLoggedIn()) return;
    ensureIapListener();
    iapSend('sync');
}

/** React hook：{ member, canUse } 會隨會員狀態即時更新 */
export function useMembership() {
    const read = () => ({ member: isMember(), gateActive: isGateActive(), subscribed: isSubscribed(), comp: compReason(), info: membershipInfo() });
    const [state, setState] = useState(read);
    const member = state.member;
    useEffect(() => {
        let expiryTimer;
        const sync = () => {
            clearTimeout(expiryTimer);
            setState(read());
            const expires = Date.parse(readCache(getUserId())?.expires_at || '');
            if (Number.isFinite(expires) && expires > Date.now()) {
                expiryTimer = setTimeout(() => { broadcast(); }, Math.min(expires - Date.now() + 10, 2147483647));
            }
        };
        window.addEventListener(EVENT, sync);
        const onStorage = (e) => { if (e.key === PREVIEW_KEY || (e.key || '').startsWith('drvn_membership_')) sync(); };
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', sync);
        sync();
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', sync);
            clearTimeout(expiryTimer);
        };
    }, []);
    return { ...state, canUse: (f) => (MEMBER_FEATURES[f] ? member : true) };
}

// ── 付費牆開啟（任何畫面呼叫；由 App 根層的 MembershipSheet 接）─────────
export const OPEN_PAYWALL_EVENT = 'drvn:open-paywall';
export function openPaywall(feature) {
    try { window.dispatchEvent(new CustomEvent(OPEN_PAYWALL_EVENT, { detail: { feature } })); } catch (_) { /* ignore */ }
}

export default { MEMBER_FEATURES, isMember, canUse, refreshMembership, useMembership, openPaywall };
