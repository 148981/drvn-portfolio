/**
 * LoginPage.jsx — DRVN ISSUE Nº05 · Editorial Edition
 *
 * 設計語言：時尚雜誌排版 × 城市運動 × 手繪質感
 *  - 圖一風格：解構式拆字、出血大字、左下數據格柵
 *  - 圖二風格：散落關鍵字標籤、襯線 italic 混搭
 *  - 圖三風格：手繪圈圈、底線標記、宣言式版面
 *  - 圖四風格：襯線 + 手寫筆觸、向右箭頭引導
 *  - 圖五配色：#262523 / #F6F4F1 / #B9C8D7 / #F95C4B
 *
 * ⚠️  邏輯不可動：
 *   - fetchUserProfile / detectProvider / handleOAuth / handleGuestLogin
 *   - handleEnter / handleSwitchUser / showPrivacy modal trigger
 *   - state hooks: profile / loading / showPrivacy / entering / loadingProvider
 *   - props: onLoginSuccess / onSwitchUser
 *
 * 圖片串接：
 *   背景    → /desktop/_ (25).jpeg  (Central Park)
 *   上方插圖 → /desktop/master.jpeg  (運動人群)
 *   用戶頭貼 → /api/users/:id/avatar  或 data/uploads/profiles/
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { getUserId, setAuthChoice } from '../utils/auth';
import { migrateUserData } from '../utils/userStorage';
import { syncUserScope } from '../utils/userScopedStorage';
import { resolveApiBase } from '../utils/apiHostFix';
import LegalSheet from './LegalSheet';


/* ── IMAGE PATHS ────── */
const IMG_BG = '/desktop/_ (25).jpeg';
const IMG_MASTER = '/desktop/master.jpeg';

/* ══════════════════════════════════════
   DESIGN TOKENS — 圖五配色系統
══════════════════════════════════════ */
const CARBON      = '#262523';   // Charcoal Black — 主背景
const SMOKE       = '#F6F4F1';   // White Smoke — 主文字
const SILVER      = '#B9C8D7';   // Metallic Silver — 次要 / 手繪元素
const ORANGE      = '#F95C4B';   // Red Orange — accent
/* Swiss-minimal 淺色版 token */
const PAPER       = '#F6F4F1';   // 暖白底
const INK         = '#161415';   // 主文字 / 深黑
const PEBBLE      = '#CFC6B8';   // 髮絲線 / 邊框
const INK_SOFT    = 'rgba(22,20,21,0.55)';
const INK_FAINT   = 'rgba(22,20,21,0.38)';
const INK_GHOST   = 'rgba(22,20,21,0.12)';
const SMOKE_DIM   = 'rgba(245,245,245,0.55)';
const SMOKE_MUTE  = 'rgba(245,245,245,0.32)';
const SMOKE_GHOST = 'rgba(245,245,245,0.14)';
const SILVER_DIM  = 'rgba(185,200,215,0.4)';

// 舊 token 相容（PrivacyModal 內部仍會用到）
const BLACK = CARBON;
const WHITE = SMOKE;
const DIM = SMOKE_GHOST;

/* 字型系統 —— 雜誌語言 */
const FONT_DISPLAY = '"Tenor Sans","Noto Sans TC",system-ui,sans-serif'; // §2: display 一律 Tenor，serif 僅限報告封面
const FONT_SANS    = '"Helvetica Neue","Helvetica","Arial Black",sans-serif';
const FONT_MONO    = '"JetBrains Mono","SF Mono","Courier New",monospace';
const FONT_HAND    = '"Caveat","Kalam","Bradley Hand","Comic Sans MS",cursive';

/* 紙張紋理 */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23g)' opacity='0.13'/%3E%3C/svg%3E")`;

/* ── BACKEND API + LOCAL TOKEN FALLBACK ──────────────── */
const detectProvider = (p) => {
    if (!p) return 'GUEST';
    if (p.provider) return p.provider.toUpperCase();
    if (p.iss && p.iss.includes('line')) return 'LINE';
    if (p.iss && p.iss.includes('google')) return 'GOOGLE';
    if (p.sub && /^U[a-f0-9]{32}$/.test(p.sub)) return 'LINE';
    if (p.email) return 'GOOGLE';
    return 'OAUTH';
};

/* 從 profile 的多個欄位歸納當前 provider，做 UI 高亮判斷使用
   ── 不會修改後端傳回的 profile，只用來決定 isActive
   ── 比對來源：profile.provider, userId 前綴 (LINE_/GOOGLE_/FB_/APPLE_),
                avatarUrl 網域，displayName 規則 */
const resolveProvider = (profile) => {
    if (!profile) return null;
    const direct = (profile.provider || '').toString().toUpperCase();
    if (['LINE', 'GOOGLE', 'FACEBOOK', 'APPLE'].includes(direct)) return direct;

    const uid = (profile.userId || '').toString().toUpperCase();
    if (uid.startsWith('LINE_') || uid.startsWith('LINE-') || /^U[A-F0-9]{32}/.test(uid)) return 'LINE';
    if (uid.startsWith('GOOGLE_') || uid.startsWith('GOOGLE-') || uid.startsWith('GG_')) return 'GOOGLE';
    if (uid.startsWith('FACEBOOK_') || uid.startsWith('FB_') || uid.startsWith('FB-')) return 'FACEBOOK';
    if (uid.startsWith('APPLE_') || uid.startsWith('APPLE-') || uid.startsWith('AP_')) return 'APPLE';

    const av = (profile.avatarUrl || '').toString().toLowerCase();
    if (av.includes('line-scdn') || av.includes('profile.line')) return 'LINE';
    if (av.includes('googleusercontent') || av.includes('googleapis')) return 'GOOGLE';
    if (av.includes('fbcdn') || av.includes('facebook')) return 'FACEBOOK';
    if (av.includes('appleid') || av.includes('apple.com')) return 'APPLE';

    return null; // 無法明確判斷
};

const fetchUserProfile = async (userId) => {
    let jwtProfile = null;
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) b64 += '=';
            const p = JSON.parse(atob(b64));
            const uid = p.id || p.sub || p.user_id || userId;
            jwtProfile = {
                userId: uid,
                displayName: p.name || p.sub || '使用者',
                nameEn: (p.name || 'USER').toUpperCase(),
                avatarUrl: p.picture || p.avatar_url || p.avatar || null,
                isLoggedIn: true,
                lastLogin: p.iat ? new Date(p.iat * 1000).toISOString() : null,
                tier: 'STANDARD',
                provider: detectProvider(p),
            };
        } catch (_) { }
    }

    try {
        // 弱網保護：這支只是拿來高亮「上次用哪個登入方式」，等太久沒有意義。
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`/api/users/${userId}/profile`, { signal: ctrl.signal })
            .finally(() => clearTimeout(t));
        if (r.ok) {
            const backendProfile = await r.json();
            if (jwtProfile?.avatarUrl && (!backendProfile.avatarUrl || backendProfile.avatarUrl.startsWith('/api/'))) {
                backendProfile.avatarUrl = jwtProfile.avatarUrl;
            }
            if (!backendProfile.provider && jwtProfile?.provider) {
                backendProfile.provider = jwtProfile.provider;
            }
            return backendProfile;
        }
    } catch (_) { }

    if (jwtProfile) return jwtProfile;

    return {
        userId,
        displayName: '訪客用戶',
        nameEn: 'GUEST USER',
        avatarUrl: null,
        isLoggedIn: false,
        lastLogin: null,
        tier: 'STANDARD',
    };
};

/* ══════════════════════════════════════
   手繪 SVG 元素庫
══════════════════════════════════════ */

/** 手繪圈圈 */
function HandCircle({ color = ORANGE, strokeWidth = 2.4, opacity = 0.85, rotate = -3 }) {
    return (
        <svg viewBox="0 0 200 80" width="100%" height="100%" preserveAspectRatio="none"
            style={{ transform: `rotate(${rotate}deg)` }}>
            <path
                d="M 18,42 Q 14,16 56,12 Q 110,6 158,14 Q 188,20 184,42 Q 188,66 138,72 Q 78,76 36,68 Q 12,62 18,42 Z"
                fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={opacity} />
        </svg>
    );
}

/** 手繪底線 */
function HandUnderline({ color = ORANGE, strokeWidth = 2.6, opacity = 0.9 }) {
    return (
        <svg viewBox="0 0 240 18" width="100%" height="100%" preserveAspectRatio="none">
            <path d="M 4,10 Q 60,2 120,8 T 236,7" fill="none" stroke={color}
                strokeWidth={strokeWidth} strokeLinecap="round" opacity={opacity} />
            <path d="M 12,14 Q 90,11 200,13" fill="none" stroke={color}
                strokeWidth={strokeWidth * 0.6} strokeLinecap="round" opacity={opacity * 0.5} />
        </svg>
    );
}

/** 手繪箭頭 */
function HandArrow({ color = SMOKE, size = 18 }) {
    return (
        <svg viewBox="0 0 60 24" width={size * 2.2} height={size} fill="none">
            <path d="M 4,12 Q 22,11 50,12" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M 42,5 L 52,12 L 42,19" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

/** 手繪星星 */
function HandStar({ size = 14, color = SILVER, rotate = 0 }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
            <path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 22 L10.5 12.5 L3 11 L10.5 9.5 Z"
                fill={color} opacity="0.9" />
        </svg>
    );
}

/* 隱私權政策／服務條款：直接用 App 內同一份正式文件（LegalSheet ← data/legalDocs.json）。
   ⚠️ 以前這裡是一段自己寫的摘要，內容跟正式政策對不上（寫「資料存台灣境內」「privacy@drvn.app」
   「Cookie」），兩個連結還打開同一個視窗、看不到服務條款 —— 審查員從登入頁點進來看到的是錯的。 */

/* ══════════════════════════════════════
   USER AVATAR
══════════════════════════════════════ */
function UserAvatar({ url, size = 42, tier }) {
    const [ok, setOk] = useState(false);
    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            {!ok && (
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: SMOKE_GHOST, animation: 'shimmer 1.5s infinite',
                }} />
            )}
            <img loading="lazy" decoding="async" src={url} alt="user"
                onLoad={() => setOk(true)}
                onError={() => setOk(true)}
                style={{
                    width: size, height: size, borderRadius: '50%', objectFit: 'cover',
                    opacity: ok ? 1 : 0, transition: 'opacity 0.3s ease',
                    filter: 'grayscale(0.2) contrast(1.05)',
                }} />
            <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `1px solid ${tier === 'ATHLETE' ? ORANGE : SMOKE_GHOST}`,
            }} />
            <div style={{
                position: 'absolute', bottom: 1, right: 1,
                width: 9, height: 9, borderRadius: '50%',
                background: ORANGE, border: `1.5px solid ${CARBON}`,
            }} />
        </div>
    );
}

/* ══════════════════════════════════════
   OAUTH BUTTON — 共用組件（雜誌風）
══════════════════════════════════════ */
function OAuthRow({ provider, label, icon, onClick, loadingProvider, isActive = false }) {
    const isLoading = loadingProvider === provider;
    const [hover, setHover] = useState(false);
    const [press, setPress] = useState(false);

    /* 已登入此 provider → 整張卡片 coral 強調 */
    const activeBg     = 'rgba(255,70,40,0.10)';
    const activeBgHov  = 'rgba(255,70,40,0.16)';
    const activeBorder = 'rgba(255,70,40,0.55)';
    const activeBorderHov = ORANGE;

    return (
        <motion.button {...pressProps('row')} onClick={onClick}
 onMouseEnter={() => setHover(true)}
 onMouseLeave={() => { setHover(false); setPress(false); }}
 onMouseDown={() => setPress(true)}
 onMouseUp={() => setPress(false)}
 onTouchStart={() => setPress(true)}
 onTouchEnd={() => setPress(false)}
 style={{
 display: 'flex', alignItems: 'center', gap: 14,
 padding: '14px 14px 14px 18px',
 background: isActive
 ? (hover ? activeBgHov : activeBg)
 : (press
 ? 'rgba(255,70,40,0.08)'
 : hover
 ? 'rgba(245,245,245,0.06)'
 : 'rgba(245,245,245,0.025)'),
 border: `1px solid ${isActive
 ? (hover ? activeBorderHov : activeBorder)
 : (hover ? 'rgba(245,245,245,0.32)' : 'rgba(245,245,245,0.18)')}`,
 borderLeft: `${isActive ? 4 : 3}px solid ${isActive ? ORANGE : (hover ? ORANGE : SILVER_DIM)}`,
 cursor: 'pointer',
 transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
 width: '100%',
 position: 'relative',
 boxShadow: isActive
 ? `0 0 0 1px rgba(255,70,40,0.18), 0 6px 18px rgba(255,70,40,0.22), inset 0 0 24px rgba(255,70,40,0.06)`
 : (hover
 ? '0 4px 14px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(245,245,245,0.04)'
 : '0 2px 6px rgba(0,0,0,0.18)'),
 transform: press ? 'translateY(1px)' : 'translateY(0)',
 }}>
            {/* icon */}
            <span style={{ width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
            </span>

            {/* label — 襯線 italic（active 變 coral） */}
            <span style={{
                flex: 1, textAlign: 'left',
                fontFamily: '"Tenor Sans", sans-serif',
                fontSize: 17, textTransform: 'uppercase',
                color: isActive ? ORANGE : SMOKE,
                letterSpacing: '0.05em', lineHeight: 1,
                transition: 'color 0.18s ease',
                textShadow: isActive ? '0 0 12px rgba(255,70,40,0.4)' : 'none',
            }}>
                {label}
            </span>

            {/* ACTIVE 徽章 — 已登入 provider 顯示 */}
            {isActive && (
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 8px',
                    background: ORANGE,
                    fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700,
                    color: CARBON, letterSpacing: '0.22em',
                    boxShadow: '0 0 12px rgba(255,70,40,0.5)',
                }}>
                    <span style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: CARBON,
                        animation: 'activePulse 1.6s ease-in-out infinite',
                    }} />
                    ACTIVE
                </span>
            )}

            {/* mono provider tag */}
            <span style={{
                fontFamily: FONT_MONO, fontSize: 9,
                color: isActive ? ORANGE : (hover ? ORANGE : SMOKE_MUTE),
                letterSpacing: '0.28em', transition: 'color 0.18s ease',
                padding: '3px 7px',
                border: `1px solid ${isActive ? ORANGE : (hover ? ORANGE : SMOKE_GHOST)}`,
            }}>
                {provider.toUpperCase()}
            </span>

            {/* loading or arrow */}
            {isLoading ? (
                <span style={{
                    width: 14, height: 14, border: `1.4px solid ${SMOKE_GHOST}`,
                    borderTopColor: ORANGE, borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite', flexShrink: 0,
                }} />
            ) : (
                <span style={{
                    fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                    color: isActive ? ORANGE : (hover ? ORANGE : SMOKE_DIM),
                    fontSize: 16, transition: 'all 0.18s ease',
                    transform: (isActive || hover) ? 'translateX(3px)' : 'none', display: 'inline-block',
                    flexShrink: 0,
                    textShadow: isActive ? '0 0 8px rgba(255,70,40,0.6)' : 'none',
                }}>→</span>
            )}
        </motion.button>
    );
}

/* ══════════════════════════════════════
   MAIN LOGIN PAGE
══════════════════════════════════════ */
export default function LoginPage({ onLoginSuccess, onSwitchUser }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [entering, setEntering] = useState(false);
    const [loadingProvider, setLoadingProvider] = useState(null);

    const userId = getUserId() || 'guest';

    /* ⚠️ App 打包版的網址是 drvn://app —— 自己拼 `http://${hostname}:8000` 會變成 http://app:8000。
       fetch 會被 apiHostFix 攔下改寫，但登入網址是用 postMessage 交給原生的登入視窗，
       不經過那層改寫 → 原生打開一個不存在的主機，按了 LINE／Google／Facebook 只會一直轉圈。
       一律用 resolveApiBase()：打包版走正式後端，瀏覽器開發維持原本的推導。 */
    const API_BASE = resolveApiBase();

    useEffect(() => {
        fetchUserProfile(userId).then(p => {
            setProfile(p);
            if (p) migrateUserData?.(p.userId);
        }).finally(() => setLoading(false));
    }, [userId]);

    /* 伺服器沒設好的登入方式不顯示（例如 Apple 登入要付開發者年費後才能設定）——
       按了才跳「還沒開通」比不顯示更糟。讀不到就全部照常顯示。 */
    const [providers, setProviders] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch(`${API_BASE}/api/auth/providers`).then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d && typeof d === 'object') setProviders(d); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    const handleOAuth = async (provider) => {
        if (loadingProvider) return;
        setLoadingProvider(provider);
        // ⚠️ 這裡「刻意不蓋章」：drvn_auth_choice 是開機路由唯一認的旗標，
        //    在按下按鈕的當下就寫，等於把「我點了」當成「我登入了」。
        //    使用者在 Google 頁面取消 → 旗標留著、token 沒有 →
        //    下次開機直接被送進主頁，每一支私人 API 都 401。
        //    正確的蓋章時機只有一個：AuthCallbackPage.finalizeLogin 真的拿到 token 之後。
        try {
            const frontendUrl = encodeURIComponent(window.location.origin);
            if (window?.webkit?.messageHandlers?.openOAuth) {
                window.webkit.messageHandlers.openOAuth.postMessage(
                    `${API_BASE}/api/auth/${provider}?native=1`
                );
                // 登入視窗被關掉（取消）時原生不會回報 —— 不能讓按鈕永遠在轉圈
                setTimeout(() => setLoadingProvider((p) => (p === provider ? null : p)), 12000);
            } else {
                window.location.href = `${API_BASE}/api/auth/${provider}?frontend_url=${frontendUrl}`;
            }
        } catch (err) {
            setLoadingProvider(null);
        }
    };

    const handleGuestLogin = () => {
        if (loadingProvider) return;
        setLoadingProvider('guest');
        const guestId = getUserId();
        localStorage.setItem('userId', guestId);
        setAuthChoice('guest');   // ★ v2.4 明確記錄：使用者選了訪客
        syncUserScope();   // 🩹 帳號隔離
        import('../utils/guestAuth').then(m => m.ensureGuestToken()).catch(() => {});   // 🩹 訪客匿名 token
        // ⚠️ HashRouter：改 hash 再 reload。原本 replace('/sunlight-intro-mobile')
        //    會把 pathname 改掉，被 App.jsx 網址清洗器導回 #/mobile-home，
        //    導致訪客跳過登入成功頁與首次設定精靈。
        setTimeout(() => {
            window.location.hash = '#/sunlight-intro-mobile';
            window.location.reload();
        }, 500);
    };

    const handleEnter = useCallback(() => {
        if (entering) return;
        setEntering(true);
        setTimeout(() => onLoginSuccess?.(profile), 280);
    }, [entering, onLoginSuccess, profile]);

    const handleSwitchUser = useCallback(() => {
        onSwitchUser?.();
    }, [onSwitchUser]);

    const today = new Date();
    const dd = today.getDate().toString().padStart(2, '0');
    const mon = today.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
    const year = today.getFullYear();

    /* 當前已登入的 provider（多來源歸納）→ 用於高亮對應卡片
       loading 中或無法判斷都回 null，不會誤亮 */
    const activeProvider = (!loading && profile?.isLoggedIn) ? resolveProvider(profile) : null;

    /* ── OAuth icon set ── */
    const LineIcon = (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#161415">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
    );

    const GoogleIcon = (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#161415">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    );

    const FacebookIcon = (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#161415">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    );

    const AppleIcon = (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#161415">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.39c1.37.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4zm-3.03-17.3c.06 2.3-1.7 4.18-3.9 4-.32-2.17 1.76-4.18 3.9-4z" />
        </svg>
    );

    return (
        // ── Swiss-minimal · 暖白 Paper 編輯風登入 ──────────────────────────
        <div style={{
            minHeight: '100dvh', background: PAPER,
            display: 'flex', flexDirection: 'column',
            position: 'relative', overflow: 'hidden',
            fontFamily: FONT_DISPLAY, color: INK,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
            {/* 極淡顆粒紙張紋理 — 只給一點材質，不搶版面 */}
            <div style={{
                position: 'fixed', inset: 0, backgroundImage: GRAIN,
                opacity: 0.04, pointerEvents: 'none', zIndex: 0,
            }} />
            {/* ★ v2.4 右上 Coral 氛圍改成「會呼吸」——
                原本是靜止的一團光，看起來像壁紙。讓它有心跳，畫面就有生命。 */}
            <div className="lp-breathe" style={{
                position: 'fixed', top: '-12%', right: '-18%', width: '70vw', height: '70vw',
                background: 'radial-gradient(circle at center, rgba(249,92,75,0.14) 0%, rgba(249,92,75,0) 62%)',
                pointerEvents: 'none', zIndex: 0,
            }} />

            {/* ════ ★ v2.4 運動活力層 ════════════════════════════════
                三個安靜但會動的元素，讓這頁「像運動 App」而不是表單：
                  1. 跑者軌跡：一條 Coral 線持續由左掃到右（像 GPS 軌跡在畫）
                  2. 配速刻度：右側細直條，像碼表的秒針格
                  3. 心跳點：wordmark 的句點按心律脈動
                全部 pointer-events:none，不影響任何操作。
                ══════════════════════════════════════════════════ */}
            <svg
                aria-hidden
                viewBox="0 0 400 120"
                preserveAspectRatio="none"
                style={{
                    position: 'fixed', top: '18%', left: 0, right: 0, width: '100%', height: 120,
                    pointerEvents: 'none', zIndex: 0, opacity: 0.5,
                }}
            >
                {/* 軌跡：起伏像跑過城市的路線 */}
                <path
                    className="lp-trail"
                    d="M -20,78 C 40,78 58,34 96,34 C 132,34 146,86 188,86 C 226,86 240,28 286,28 C 330,28 344,70 420,70"
                    fill="none" stroke={ORANGE} strokeWidth="1.6" strokeLinecap="round"
                />
                {/* 沿軌跡奔跑的光點 */}
                <circle className="lp-runner" r="3.2" fill={ORANGE}>
                    <animateMotion
                        dur="7s" repeatCount="indefinite"
                        path="M -20,78 C 40,78 58,34 96,34 C 132,34 146,86 188,86 C 226,86 240,28 286,28 C 330,28 344,70 420,70"
                    />
                </circle>
            </svg>

            {/* 配速刻度 —— 右緣的細格線，像碼表 */}
            <div aria-hidden style={{
                position: 'fixed', top: 0, bottom: 0, right: 0, width: 14,
                pointerEvents: 'none', zIndex: 0, opacity: 0.35,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', alignItems: 'flex-end',
            }}>
                {Array.from({ length: 22 }).map((_, i) => (
                    <span key={i} className="lp-tick" style={{
                        display: 'block', height: 1,
                        width: i % 5 === 0 ? 12 : 6,
                        background: i % 5 === 0 ? ORANGE : PEBBLE,
                        animationDelay: `${i * 0.09}s`,
                    }} />
                ))}
            </div>

            {/* ════ Swiss masthead — 留白 · 左對齊 · 大字輕量 ════ */}
            <div style={{
                position: 'relative', zIndex: 2,
                padding: 'calc(env(safe-area-inset-top, 16px) + 22px) 28px 0',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* 頂列：返回 + 日期 kicker */}
                <div className="lp-rise" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <motion.button {...pressProps('row')} onClick={handleSwitchUser}
 style={{
 width: 38, height: 38, borderRadius: '50%',
 background: 'rgba(255,255,255,0.55)', border: `1px solid ${INK_GHOST}`,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 cursor: 'pointer', flexShrink: 0,
 backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
 }}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ stroke: INK }}>
                            <path d="M10 3L5 8L10 13" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </motion.button>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_FAINT, letterSpacing: '0.22em', margin: 0 }}>
                        {mon} {dd} · TAIPEI
                    </p>
                </div>

                {/* kicker overline */}
                <p className="lp-rise" style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, color: INK_FAINT, letterSpacing: '0.3em', margin: '54px 0 0', animationDelay: '0.06s' }}>
                    THE URBAN ATHLETE&rsquo;S JOURNAL
                </p>

                {/* 大字輕量 wordmark — 唯一 Coral 焦點是句點 */}
                <h1 className="lp-rise" style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 400,
                    fontSize: 'clamp(72px, 24vw, 128px)', lineHeight: 0.9,
                    letterSpacing: '-0.04em', color: INK, margin: '10px 0 0',
                    animationDelay: '0.12s',
                }}>
                    drvn<span className="lp-heart" style={{ color: ORANGE, display: 'inline-block' }}>.</span>
                </h1>

                {/* standfirst */}
                <p className="lp-rise" style={{
                    fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 400,
                    fontSize: 18, color: INK_SOFT, margin: '14px 0 0', lineHeight: 1.35,
                    maxWidth: '24ch', animationDelay: '0.18s',
                }}>
                    move with intent — 為都市運動者打造的訓練誌。
                </p>

                {/* 髮絲線 */}
                <div className="lp-rise" style={{ height: 1, background: PEBBLE, opacity: 0.7, margin: '28px 0 0', animationDelay: '0.24s' }} />
            </div>

            {/* ════ Swiss AUTH — 乾淨登入列 ════ */}
            <div style={{
                position: 'relative', zIndex: 2, flex: 1,
                display: 'flex', flexDirection: 'column',
                padding: '24px 28px calc(env(safe-area-inset-bottom, 16px) + 22px)',
            }}>
                {/* kicker 列 */}
                <div className="lp-rise" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', animationDelay: '0.26s' }}>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, color: INK_FAINT, letterSpacing: '0.28em', margin: 0 }}>SIGN IN</p>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_FAINT, letterSpacing: '0.22em', margin: 0 }}>04 · PROVIDERS</p>
                </div>

                {/* provider 列 — 暖白玻璃 row、髮絲邊、深色 icon */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {[
                        { id: 'line', label: 'LINE', icon: LineIcon },
                        { id: 'google', label: 'Google', icon: GoogleIcon },
                        { id: 'facebook', label: 'Facebook', icon: FacebookIcon },
                        { id: 'apple', label: 'Apple', icon: AppleIcon },
                    ].filter((p) => providers?.[p.id] !== false).map((p, i) => {
                        const active = activeProvider === p.id.toUpperCase();
                        const isLoading = loadingProvider === p.id;
                        return (
                            <motion.button {...pressProps('row')} key={p.id} onClick={() => handleOAuth(p.id)} className="lp-rise lp-row"
 style={{
 animationDelay: `${0.3 + i * 0.05}s`,
 display: 'flex', alignItems: 'center', gap: 14,
 width: '100%', padding: '16px 18px', cursor: 'pointer',
 background: active ? 'rgba(249,92,75,0.06)' : 'rgba(255,255,255,0.6)',
 border: `1px solid ${active ? 'rgba(249,92,75,0.45)' : INK_GHOST}`,
 borderRadius: 16,
 backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
 }}>
                                <span style={{ display: 'flex', width: 22, justifyContent: 'center' }}>{p.icon}</span>
                                <span style={{ flex: 1, textAlign: 'left', fontFamily: FONT_DISPLAY, fontSize: 16, color: INK, letterSpacing: '0.01em' }}>{p.label}</span>
                                {isLoading ? (
                                    <span style={{ width: 15, height: 15, border: `1.6px solid ${INK_GHOST}`, borderTopColor: ORANGE, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                ) : active ? (
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: ORANGE }}>目前帳號</span>
                                ) : (
                                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ stroke: INK_FAINT }}><path d="M6 3l5 5-5 5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                )}
                            </motion.button>
                        );
                    })}
                </div>

                {/* or 分隔 */}
                <div className="lp-rise" style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '20px 0 16px', animationDelay: '0.52s' }}>
                    <div style={{ flex: 1, height: 1, background: PEBBLE, opacity: 0.7 }} />
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_FAINT, letterSpacing: '0.2em', margin: 0 }}>OR</p>
                    <div style={{ flex: 1, height: 1, background: PEBBLE, opacity: 0.7 }} />
                </div>

                {/* 訪客 */}
                <motion.button {...pressProps('row')} onClick={handleGuestLogin} className="lp-rise lp-row" style={{
 animationDelay: '0.56s',
 alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 10,
 padding: '10px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
 }}>
                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: INK_SOFT, letterSpacing: '0.04em' }}>以訪客身分繼續</span>
                    {loadingProvider === 'guest' ? (
                        <span style={{ width: 13, height: 13, border: `1.5px solid ${INK_GHOST}`, borderTopColor: ORANGE, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ stroke: INK_SOFT }}><path d="M6 3l5 5-5 5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                </motion.button>

                <div style={{ flex: 1 }} />

                {/* Privacy footer */}
                <p className="lp-rise" style={{ fontFamily: FONT_DISPLAY, fontSize: 11.5, color: INK_FAINT, textAlign: 'center', margin: '24px 0 0', lineHeight: 1.7, animationDelay: '0.6s' }}>
                    繼續即表示同意{' '}
                    <motion.button {...pressProps('row')} onClick={() => setShowPrivacy('privacy')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: INK, fontFamily: FONT_DISPLAY, fontSize: 11.5, textDecoration: 'underline', textDecorationColor: ORANGE, textUnderlineOffset: 3 }}>隱私權政策</motion.button>
                    {' '}及{' '}
                    <motion.button {...pressProps('row')} onClick={() => setShowPrivacy('terms')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: INK, fontFamily: FONT_DISPLAY, fontSize: 11.5, textDecoration: 'underline', textDecorationColor: ORANGE, textUnderlineOffset: 3 }}>服務條款</motion.button>
                </p>

                {/* 刊尾 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${PEBBLE}` }}>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_FAINT, letterSpacing: '0.24em', margin: 0 }}>DRVN © {year}</p>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: ORANGE, letterSpacing: '0.24em', margin: 0 }}>v 4.0</p>
                </div>
            </div>

            {/* 隱私權政策／服務條款（showPrivacy = 'privacy' | 'terms' | false） */}
            <LegalSheet doc={showPrivacy || null} onClose={() => setShowPrivacy(false)} />

            {/* Keyframes */}
            <style>{`
                @keyframes pulseGlow  { 0%,100%{opacity:1} 50%{opacity:0.35} }
                @keyframes slideUp    { from{transform:translateY(100%)} to{transform:translateY(0)} }
                @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
                @keyframes shimmer    {
                    0%  { background-color: rgba(245,245,245,0.06); }
                    50% { background-color: rgba(245,245,245,0.14); }
                    100%{ background-color: rgba(245,245,245,0.06); }
                }
                @keyframes activePulse {
                    0%,100% { opacity: 1; transform: scale(1); }
                    50%     { opacity: 0.35; transform: scale(0.85); }
                }
                /* Swiss 進場：淡入 + 上升（House easing），逐項 stagger */
                @keyframes lpRise {
                    from { opacity: 0; transform: translateY(16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .lp-rise { opacity: 0; animation: lpRise 0.62s cubic-bezier(0.16,1,0.3,1) both; }
                .lp-row { transition: transform 0.14s ease, background 0.2s ease, border-color 0.2s ease; }
                .lp-row:active { transform: scale(0.985); }

                /* ★ v2.4 運動活力層 ───────────────────────────────── */

                /* 氛圍光呼吸 —— 慢，像休息心率 */
                @keyframes lpBreathe {
                    0%,100% { opacity: 0.75; transform: scale(1); }
                    50%     { opacity: 1;    transform: scale(1.06); }
                }
                .lp-breathe { animation: lpBreathe 6s ease-in-out infinite; }

                /* 跑者軌跡：線條像被「畫出來」，畫完停一下再重畫 */
                @keyframes lpTrail {
                    0%   { stroke-dashoffset: 620; opacity: 0; }
                    12%  { opacity: 0.9; }
                    62%  { stroke-dashoffset: 0; opacity: 0.9; }
                    88%  { stroke-dashoffset: 0; opacity: 0; }
                    100% { stroke-dashoffset: 620; opacity: 0; }
                }
                .lp-trail {
                    stroke-dasharray: 620;
                    animation: lpTrail 7s cubic-bezier(0.45,0,0.25,1) infinite;
                }
                /* 光點跟著軌跡跑，快到終點才亮起來 */
                @keyframes lpRunner { 0%,6%{opacity:0} 14%{opacity:1} 60%{opacity:1} 72%,100%{opacity:0} }
                .lp-runner { animation: lpRunner 7s linear infinite; filter: drop-shadow(0 0 5px rgba(249,92,75,0.9)); }

                /* 配速刻度：由上往下依序閃一下，像碼表在走 */
                @keyframes lpTick { 0%,72%,100% { opacity: 0.30; } 78% { opacity: 1; } }
                .lp-tick { animation: lpTick 2.4s ease-in-out infinite; }

                /* 句點心跳 —— 兩下一組（lub-dub），不是單純的閃爍 */
                @keyframes lpHeart {
                    0%,58%,100% { transform: scale(1); }
                    64%         { transform: scale(1.28); }
                    70%         { transform: scale(1); }
                    76%         { transform: scale(1.18); }
                    82%         { transform: scale(1); }
                }
                .lp-heart { animation: lpHeart 2.6s ease-in-out infinite; transform-origin: center bottom; }

                @media (prefers-reduced-motion: reduce) {
                    .lp-rise { opacity: 1; animation: none; }
                    .lp-breathe, .lp-trail, .lp-runner, .lp-tick, .lp-heart { animation: none; }
                }
            `}</style>
        </div>
    );
}
