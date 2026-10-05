import React, { useEffect, useState, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { migrateUserData } from '../utils/userStorage';
import { syncUserScope, adoptCurrentData } from '../utils/userScopedStorage';
import { clearAuthChoice, setAuthChoice } from '../utils/auth';
import { resolveApiBase } from '../utils/apiHostFix';


// ── useAuth hook ────────────────────────────────────────────────────
export const useAuth = () => {
    const getUser = () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return null;
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            const payload = JSON.parse(jsonPayload);
            if (payload.exp * 1000 < Date.now()) {
                localStorage.removeItem('auth_token');
                return null;
            }
            return payload;
        } catch (e) {
            console.error("Token parse failed", e);
            return null;
        }
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('userId');
        // ★ v2.4 登出要一併清掉「登入選擇」旗標，否則下次開機會被判定成已登入
        try { localStorage.removeItem('drvn_auth_choice'); } catch { /* */ }
        syncUserScope();   // 🩹 帳號隔離：登出即歸檔本人資料
        // HashRouter：用 hash 導向登入頁（pathname /login 會被網址清洗器改走）
        window.location.hash = '#/login';
        window.location.reload();
    };

    const getAuthHeader = () => {
        const token = localStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    return { user: getUser(), logout, getAuthHeader, isLoggedIn: !!getUser() };
};

// 已知的「沒帶 userId 前綴的全域 legacy key」清單
// — 有任何一個存在於 localStorage 就代表訪客曾經產生過資料
const GLOBAL_LEGACY_KEYS = [
    'userProfile', 'selectedCoach', 'analysisResult',
    'trainingRecords', 'master_journey', 'currentWorkoutPlan',
    'savedFusionPlans', 'masterJourneyCardOrder', 'userRadarScores',
    'cardio_sessions', 'weeklyCardioLog', 'workout_history',
    'nutrition_log', 'user_profile_cache',
    'user_avatar_photo', 'user_cover_photo',
    'profileStickerPos', 'profileShowStickers', 'profileActiveStickers',
    'socialPosts', 'shoes', 'currentShoe', 'goals', 'selectedLeague',
];

// ── 檢查訪客是否有實際資料值得詢問 ────────────────────────────────
//   1. 任何 key 含 guestId（u_xxx_、customSchedule_xxx、tdee_cache_xxx…）
//   2. 已知舊版「全域沒帶 userId」的 legacy key 有實際值
const guestHasData = (guestId) => {
    if (!guestId) return false;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.includes(guestId)) return true;
        if (GLOBAL_LEGACY_KEYS.includes(k) && localStorage.getItem(k) !== null) {
            return true;
        }
    }
    return false;
};

// ── 刪除訪客資料（選擇「不帶入」時清掉，避免孤島） ────────────────
const clearGuestData = (guestId) => {
    if (!guestId) return;
    const toDelete = new Set();
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.includes(guestId)) toDelete.add(k);
        if (GLOBAL_LEGACY_KEYS.includes(k)) toDelete.add(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('guest_user_id');
    console.log(`[AuthCallback] 已清除訪客資料：${toDelete.size} 筆（${guestId}）`);
};

// ── 匯入確認 Dialog ────────────────────────────────────────────────
const ImportDialog = ({ onImport, onSkip }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 24px',
        }}
    >
        <motion.div
            initial={{ scale: 0.88, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            style={{
                background: '#161415',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 28,
                padding: '32px 28px',
                maxWidth: 360,
                width: '100%',
                textAlign: 'center',
            }}
        >
            {/* Icon */}
            <div style={{ fontSize: 44, marginBottom: 16 }}>📦</div>

            {/* Title */}
            <p style={{
                fontSize: 18, fontWeight: 800, color: '#F6F4F1',
                letterSpacing: '-0.3px', marginBottom: 10,
            }}>
                帶入訪客資料？
            </p>

            {/* Body */}
            <p style={{
                fontSize: 13, color: 'rgba(246,244,241,0.5)',
                lineHeight: 1.65, marginBottom: 28,
            }}>
                你在訪客模式下的訓練紀錄、個人檔案與貼文，
                可以匯入到這個帳號。<br /><br />
                <span style={{ color: 'rgba(246,244,241,0.3)' }}>
                    若不帶入，訪客資料將會清除，帳號從空白開始。
                </span>
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <motion.button {...pressProps('row')}
 onClick={onImport}
 style={{
 width: '100%', padding: '14px 0',
 background: '#F95C4B', border: 'none',
 borderRadius: 18, fontSize: 14,
 fontWeight: 800, color: '#fff',
 letterSpacing: '0.04em', cursor: 'pointer',
 }}
 >
                    是，帶入訪客資料
                </motion.button>
                <motion.button {...pressProps('row')}
 onClick={onSkip}
 style={{
 width: '100%', padding: '14px 0',
 background: 'rgba(255,255,255,0.06)',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 18, fontSize: 14,
 fontWeight: 700, color: 'rgba(246,244,241,0.6)',
 cursor: 'pointer',
 }}
 >
                    不，帳號從空白開始
                </motion.button>
            </div>
        </motion.div>
    </motion.div>
);

/* 登入沒成功時，使用者唯一看得到的解釋。代碼由後端 make_error_redirect 決定。 */
const ERROR_ZH = {
    oauth_mismatch_state:  '這次登入等太久了，請再試一次',
    apple_cancelled:       '你在 Apple 那邊取消了登入',
    apple_not_configured:  'Apple 登入還沒開通，先用其他方式登入',
    apple_no_code:         'Apple 沒有把登入結果帶回來，請再試一次',
    apple_exchange_failed: '沒辦法跟 Apple 確認你的身分，請再試一次',
    apple_error:           'Apple 登入沒有完成，請再試一次',
    no_token:             '沒有收到登入結果，請再試一次',
};
const errorZh = (code) => ERROR_ZH[code] || '登入沒有完成，請再試一次';

// ── AuthCallbackPage ───────────────────────────────────────────────
const AuthCallbackPage = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState('processing');
    // 'processing' | 'ask_import' | 'success' | 'error'

    // 暫存 token / userId / dest，等使用者選擇後再寫入
    const [pending, setPending] = useState(null);
    const [errorCode, setErrorCode] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const userId = params.get('user_id') || params.get('userId');
        const error = params.get('error');

        if (error) {
            // 登入失敗／使用者取消 → 一定要把殘留的登入旗標清乾淨，
            // 否則下次開機 hasSignedIn() 會誤判成「登入過」，把人送進沒有 token 的主頁。
            clearAuthChoice();
            setErrorCode(error);
            setStatus('error');
            setTimeout(() => navigate('/login?error=' + error), 2500);
            return;
        }

        if (token) {
            // ⚠️ 兩個都要看：
            //   - localStorage.userId    → 上一個帳號（可能是 line_xxx 也可能是 guest_xxx）
            //   - guest_user_id          → 訪客 ID 是獨立 key，即使 userId 是 OAuth 也可能仍有 guest 殘留
            // 我們關心的是「有沒有訪客身份的殘留資料」，所以優先看 guest_user_id
            const guestUserId = localStorage.getItem('guest_user_id');
            const lastUserId = localStorage.getItem('userId');
            const prevUserId = guestUserId || lastUserId;

            // 觸發條件擴大：只要符合下列任一就跳對話框，絕對不自動合併
            //   (a) guest_user_id 存在 + 不等於新 OAuth UUID
            //   (b) 沒有 guest_user_id 但有任何 GLOBAL_LEGACY_KEYS 殘留 (= 訪客曾在這個瀏覽器存過資料)
            //   (c) lastUserId 是另一個帳號 (跨帳號切換也算)
            const isGuestPrev = !!guestUserId && guestUserId !== userId;
            const hasGlobalResidue = GLOBAL_LEGACY_KEYS.some(
                k => localStorage.getItem(k) !== null
            );
            const isDifferentLastUser = !!lastUserId && lastUserId !== userId;
            const hasGuestData =
                userId &&
                (
                    (isGuestPrev && guestHasData(guestUserId)) ||
                    (hasGlobalResidue && isDifferentLastUser) ||
                    (hasGlobalResidue && !lastUserId)  // 完全沒登入過但有訪客舊資料
                );

            if (hasGuestData) {
                // 有訪客資料 → 先問使用者「要不要帶入」（絕對不會自動轉）
                setPending({ token, userId, prevUserId: guestUserId });
                setStatus('ask_import');
            } else {
                // 沒有訪客資料 / 同一帳號 → 直接完成
                finalizeLogin({ token, userId, migrate: false, prevUserId });
            }
            return;
        }

        // No token
        // 沒帶 token 回來 = 這次登入沒有成功，旗標同樣不能留。
        clearAuthChoice();
        setErrorCode('no_token');
        setStatus('error');
        // ⚠️ HashRouter：用 /#/login，避免 pathname 觸發 App.jsx 網址清洗器多繞一次
        setTimeout(() => window.location.replace('/#/login'), 2500);
    }, []);

    // ── 寫入 token + userId，並視需要遷移，然後跳轉 ──────────────
    const finalizeLogin = useCallback(async ({ token, userId, migrate, prevUserId }) => {
        if (migrate && prevUserId) {
            // 1. 前端 localStorage 遷移 (u_<id>_* keys)
            migrateUserData(prevUserId, userId);
            // 2. 後端 JSON 資料合併 (user_profiles.json / user_<uuid>_plans.json 等)
            //    🔐 後端要我們證明這份訪客資料是自己的：覆蓋之前先把訪客的匿名 token 留下來一起送
            //    （原生殼層可能已把正式 token 寫進 auth_token，所以只取「真的是這個訪客」的那張）
            const prevToken = localStorage.getItem('auth_token');
            const guestToken = (() => {
                try {
                    let b = (prevToken || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                    while (b.length % 4) b += '=';
                    return JSON.parse(atob(b))?.id === prevUserId ? prevToken : null;
                } catch { return null; }
            })();
            //    必須先把 token 寫入 localStorage，後端才能驗證 JWT
            localStorage.setItem('auth_token', token);
            if (userId) localStorage.setItem('userId', userId);
            adoptCurrentData();   // 🩹 訪客升級：本機資料直接過戶（後端同步 merge）
            // fire-and-forget，等不到也沒關係 (頁面 900ms 後會 reload)
            //    ⚠️ 一定要打完整網址：App 裡相對路徑會變成 drvn://app/api/...，被本機殼層回成 index.html，合併永遠沒送到後端
            //    keepalive：頁面 900ms 後 reload，請求還在路上也不會被砍掉
            fetch(`${resolveApiBase()}/api/auth/merge_guest_data`, {
                method: 'POST',
                keepalive: true,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    guest_id: prevUserId, guest_token: guestToken,
                    guest_secret: localStorage.getItem('drvn_guest_secret'),   // utils/guestAuth 綁定訪客用的裝置密語
                }),
            }).then(r => r.json()).then(j => {
                console.log('[AuthCallback] 後端 merge 結果:', j);
            }).catch(err => {
                console.warn('[AuthCallback] 後端 merge 失敗 (前端仍會繼續):', err);
            });
        } else if (!migrate && prevUserId) {
            // 清掉孤立的訪客資料
            clearGuestData(prevUserId);
            localStorage.setItem('auth_token', token);
            if (userId) localStorage.setItem('userId', userId);
            syncUserScope();   // 🩹 不帶訪客資料 → 還原此帳號自己的歸檔
        } else {
            localStorage.setItem('auth_token', token);
            if (userId) localStorage.setItem('userId', userId);
            syncUserScope();   // 🩹 一般登入：切到此帳號的資料
        }

        // ★ v2.4 OAuth 成功 → 蓋章「這個人真的登入過」，
        //   開機路由只認這個旗標（不再把自動產生的訪客 id 當成登入）。
        try {
            const prov = (userId || '').toString().toLowerCase();
            setAuthChoice(
                prov.startsWith('line') ? 'line'
                    : prov.startsWith('google') || prov.startsWith('gg') ? 'google'
                    : prov.startsWith('fb') || prov.startsWith('facebook') ? 'facebook'
                    : prov.startsWith('apple') || prov.startsWith('ap_') ? 'apple'
                    : 'oauth',
            );
        } catch { /* 蓋章失敗不擋登入 */ }

        // Notify WKWebView native app (iOS ASWebAuthenticationSession flow)
        if (window?.webkit?.messageHandlers?.authSuccess) {
            window.webkit.messageHandlers.authSuccess.postMessage({ token, userId });
        }

        // 一律導向「登入成功提示」(SunlightIntro 重寫後的瑞士極簡 toast)。
        // 由該頁短暫顯示成功動畫後，再依 onboarding 狀態決定進「首次設定精靈」
        // 或直接進「主頁」—— 避免這裡與成功提示頁各顯示一次成功畫面（雙畫面）。
        setStatus('processing');
        // ⚠️ 強制整頁重載，讓 App.jsx 重新讀取正確的 OAuth userId。
        //    HashRouter：用 /#/ 前綴，pathname 維持 / 才不會被 App.jsx 網址清洗器再繞一次。
        setTimeout(() => { window.location.replace('/#/sunlight-intro-mobile'); }, 300);
    }, []);

    const handleImport = () => {
        if (!pending) return;
        finalizeLogin({ ...pending, migrate: true });
    };

    const handleSkip = () => {
        if (!pending) return;
        finalizeLogin({ ...pending, migrate: false });
    };

    return (
        <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: '#F6F4F1' }}>
            <AnimatePresence mode="wait">
                {status === 'ask_import' && (
                    <ImportDialog key="dialog" onImport={handleImport} onSkip={handleSkip} />
                )}

                {status !== 'ask_import' && (
                    <motion.div
                        key="status"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center gap-5"
                    >
                        {status === 'processing' && (
                            <>
                                <div className="animate-spin" style={{
                                    width: 46, height: 46, borderRadius: '50%',
                                    border: '1.5px solid rgba(22,20,21,0.14)', borderTopColor: '#F95C4B',
                                }} />
                                <p style={{ fontSize: 15, color: 'rgba(22,20,21,0.55)', margin: 0 }}>正在確認你的帳號</p>
                            </>
                        )}
                        {status === 'success' && (
                            <>
                                <div style={{ width: 28, height: 1, background: '#F95C4B' }} />
                                <p style={{ fontSize: 17, color: '#161415', margin: 0 }}>登入成功</p>
                            </>
                        )}
                        {status === 'error' && (
                            <>
                                <div style={{ width: 28, height: 1, background: 'rgba(22,20,21,0.2)' }} />
                                <p style={{ fontSize: 17, color: '#161415', margin: 0 }}>{errorZh(errorCode)}</p>
                                <p style={{ fontSize: 13, color: 'rgba(22,20,21,0.45)', margin: 0 }}>正在帶你回登入頁</p>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AuthCallbackPage;
