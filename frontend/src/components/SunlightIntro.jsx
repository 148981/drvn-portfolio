import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../utils/auth';

/**
 * SunlightIntro — 登入成功提示（瑞士極簡風）
 * ───────────────────────────────────────────────────────────────
 * 取代舊版「MORNING RUN / START YOUR DAY」開場動畫。
 * 任何登入方式（LINE / Google / Facebook / 訪客）成功後，都會短暫帶過
 * 這個極簡提示，約 1.6 秒後自動進入下一步：
 *   • 尚未完成「首次設定精靈」→ /onboarding-wizard
 *   • 已完成              → /mobile-home（直接進主頁）
 */

const PAPER = '#F6F4F1';
const INK = '#161415';
const CORAL = '#F95C4B';
const MUTE = '#9C968C';
const FONT = "'Helvetica Neue', 'PingFang TC', 'Noto Sans TC', sans-serif";

/** 問後端「這個帳號填過資料了嗎」最多等這麼久；逾時就照本機旗標走。 */
const PROFILE_CHECK_MS = 4000;

const SunlightIntro = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // 判斷是否已完成首次設定精靈 —— 只認「這個帳號」自己的旗標。
        // 以前還認一個全裝置共用的 onboarding_completed：A 填完、登出，
        // B 在同一支手機註冊新帳號就直接跳過精靈，進到沒有身體資料也沒有計劃的首頁。
        const userId = getUserId();
        try { localStorage.removeItem('onboarding_completed'); } catch { /* 舊版殘留的全域旗標 */ }
        const onboardingDone = !!userId && !!localStorage.getItem(`onboarding_${userId}`);

        let cancelled = false;

        // ── 重裝 / 換裝置情境 ────────────────────────────────────────────
        // localStorage 是空的，但後端已有這個帳號的完整 profile
        // → 不再逼使用者重跑「首次填寫資料精靈」，直接進主頁。
        const checkBackendProfile = async () => {
            if (onboardingDone || !userId || userId.startsWith('guest_')) return onboardingDone;
            const ctrl = new AbortController();
            const abortTimer = setTimeout(() => ctrl.abort(), PROFILE_CHECK_MS);
            try {
                const { API_BASE_URL } = await import('../config/api');
                const token = localStorage.getItem('auth_token');
                const res = await fetch(`${API_BASE_URL}/api/user/profile/${userId}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    signal: ctrl.signal,
                });
                if (res.ok) {
                    const p = await res.json();
                    // 有核心資料（身高/體重/年齡任一）就視為已完成初始化
                    if (p && p.user_id && (p.height_cm || p.weight_kg || p.age)) {
                        localStorage.setItem(`onboarding_${userId}`, 'true');
                        return true;
                    }
                }
            } catch { /* 後端不可達 / 逾時 → 照原邏輯走精靈 */ }
            finally { clearTimeout(abortTimer); }
            return onboardingDone;
        };

        // ⚠️ 這一頁是 zIndex 9999 的全螢幕過場，沒有任何離開的方法 ——
        //    所以「一定要走下一步」不能靠後端。收訊差的時候 fetch 可以卡住幾十秒，
        //    使用者就會盯著一張不動的登入成功畫面。因此：
        //      · AbortController 在 PROFILE_CHECK_MS 砍掉請求
        //      · 外面再套一層 race，就算 fetch 連 abort 都沒反應也照樣往下走
        const minDelay = new Promise((r) => setTimeout(r, 1650));
        const capped = Promise.race([
            checkBackendProfile(),
            new Promise((r) => setTimeout(() => r(onboardingDone), PROFILE_CHECK_MS + 500)),
        ]);
        Promise.all([capped, minDelay]).then(([done]) => {
            if (cancelled) return;
            navigate(done ? '/mobile-home' : '/onboarding-wizard', { replace: true });
        });

        return () => { cancelled = true; };
    }, [navigate]);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: PAPER, zIndex: 9999,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '0 32px', fontFamily: FONT,
        }}>
            {/* 頂部極簡角標 */}
            <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                    position: 'absolute', top: 'max(34px, env(safe-area-inset-top))',
                    left: 0, right: 0, textAlign: 'center',
                    fontSize: 9, letterSpacing: '0.34em', color: MUTE,
                    textTransform: 'uppercase', fontWeight: 600,
                }}>
                DRVN · Authenticated
            </motion.div>

            {/* 勾勾 — 圓圈 + 描邊動畫 */}
            <motion.svg width="66" height="66" viewBox="0 0 66 66" fill="none"
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
                <circle cx="33" cy="33" r="31" stroke={INK} strokeWidth="1.4" />
                <motion.path
                    d="M21 34 L30 43 L46 24"
                    stroke={CORAL} strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ delay: 0.25, duration: 0.5, ease: 'easeOut' }} />
            </motion.svg>

            {/* 主標 */}
            <motion.h1
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                style={{
                    margin: '26px 0 0', fontSize: 30, fontWeight: 800,
                    letterSpacing: '-0.02em', color: INK,
                }}>
                登入成功
            </motion.h1>

            {/* 細線 */}
            <motion.div
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                style={{
                    width: 40, height: 2, background: CORAL,
                    margin: '16px 0', transformOrigin: 'center',
                }} />

            {/* 副標 */}
            <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                style={{
                    margin: 0, fontSize: 9, letterSpacing: '0.26em',
                    color: MUTE, textTransform: 'uppercase', fontWeight: 600,
                }}>
                Login Successful
            </motion.p>

            {/* 底部進場提示 */}
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.95, duration: 0.5 }}
                style={{
                    position: 'absolute', bottom: 'max(40px, env(safe-area-inset-bottom))',
                    left: 0, right: 0, textAlign: 'center',
                    fontSize: 12, letterSpacing: '0.2em', color: MUTE,
                }}>
                正在進入 …
            </motion.div>
        </div>
    );
};

export default SunlightIntro;
