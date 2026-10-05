/**
 * 數據同步狀態指示器 (Intuitive Edition + Progress)
 * ------------------------------------------------------------------
 * 目標：讓使用者「不看英文也能秒懂」目前是 線上同步 / 離線暫存 / 同步中，
 *       並在上傳時看到真實的逐筆進度。
 *
 * 設計重點：
 *   1. 收合圖示極簡：只用「雲朵顏色」表達狀態。
 *        - 已全部同步 → 白色雲朵
 *        - 有資料待同步 → coral 色雲朵（不顯示小圓點、不顯示數字 badge）
 *        - 離線 → coral 色 CloudOff
 *        - 同步中 → 旋轉的 RefreshCw
 *      筆數與細節點進去（展開面板）才顯示。材質為 Liquid Glass。
 *   2. 真實進度條：按下「立即同步」時，會逐筆回報 (done / total)，
 *      面板與展開列都顯示填滿的進度條與「上傳 N / M 筆」。
 *   3. 已是最新提示：沒有任何待同步資料時按同步鈕，閃一個勾勾「已是最新狀態」。
 *   4. 恢復連線橫幅：離線→重新連線時自動同步並顯示橫幅（含進度）。
 *   5. 首次離線安心卡：第一次離線時彈出一次性說明卡。
 *
 * 同步函式契約（向後相容）：
 *   onSync / onRetrySync 會被以一個物件參數呼叫：
 *       await onSync({ onProgress: (done, total) => void })
 *   - 若同步函式回傳數字，視為「實際同步的筆數」（用來判斷是否「已是最新」）。
 *   - 舊版不接受參數的同步函式仍可運作（只是沒有逐筆進度）。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useVisibilityInterval } from '../hooks/useVisibilityInterval';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wifi, WifiOff, Cloud, CloudOff, RefreshCw, CheckCircle,
    Clock, ChevronLeft, ChevronDown, Smartphone, ShieldCheck
} from 'lucide-react';
import indexedDBManager from '../utils/indexedDB';
import { getUserId } from '../utils/auth';

const FIRST_OFFLINE_SEEN_KEY = 'drvn_offline_intro_seen';

// ────────────────────────────────────────────────────────────
// Liquid Glass 材質 — Stone 暖灰色系（iOS 26 風格）
// 依 liquid-glass-design 原則：半透明底 + 多層反光邊 + 內陰影製造厚度，
// 讓玻璃「折射」周圍光線。Stone 取暖灰米色（#78716C / stone-500 家族）。
// ────────────────────────────────────────────────────────────
const STONE_GLASS = {
    // 改為 Stone (#E4DED2) 暖石色系 Liquid Glass
    background: 'linear-gradient(145deg, rgba(228, 222, 210, 0.75) 0%, rgba(228, 222, 210, 0.45) 100%)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
    borderTop: '1px solid rgba(255, 255, 255, 0.9)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
    borderRight: '1px solid rgba(228, 222, 210, 0.5)',
    borderBottom: '1px solid rgba(228, 222, 210, 0.3)',
    boxShadow: '0 8px 24px -4px rgba(43,39,34,0.12), inset 0 1.5px 2px rgba(255,255,255,0.7), inset 0 -1px 2px rgba(228,222,210,0.1)'
};

// 🧊 Mist 冷調玻璃 — 只給收合狀態的雲朵鈕用：在這條暖色工具列上當「冷色退後層」，
//    靠溫度差（cool vs warm）跟教練/計劃信箱做材質分層，而非再加顏色。
const MIST_GLASS = {
    // Mist #E8E9E6 冷中性玻璃（綠通道略高於紅，偏冷）
    background: 'linear-gradient(145deg, rgba(232, 233, 230, 0.82) 0%, rgba(220, 222, 219, 0.5) 100%)',
    backdropFilter: 'blur(28px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
    borderTop: '1px solid rgba(255, 255, 255, 0.9)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.55)',
    borderRight: '1px solid rgba(200, 204, 200, 0.5)',
    borderBottom: '1px solid rgba(196, 200, 196, 0.4)',
    boxShadow: '0 6px 18px -5px rgba(60,64,60,0.14), inset 0 1.5px 2px rgba(255,255,255,0.7), inset 0 -1px 2px rgba(200,204,200,0.2)'
};

// 面板表頭/分隔線用的 stone 表面色
const STONE_SURFACE = 'rgba(245,242,238,0.08)';

const CORAL = '#F95C4B';

const SyncStatusIndicator = ({
    userId = getUserId(),
    onSync,
    lastSyncTime: propLastSyncTime,
    isSyncing: propIsSyncing,
    syncError: propSyncError,
    onRetrySync,
    style,
    // 🆕 hideWhenIdle：平時（已連線且沒有待同步資料）完全不顯示，
    //    只有離線、同步中、或有待同步資料時才浮現。用於計劃頁等「不產生新資料」的畫面。
    hideWhenIdle = false,
    // 🆕 compact：嵌在工具列（跑步頁 navbar）時使用 — 點雲朵「直接開固定定位的詳細面板」，
    //    不再展開成中間那條會把工具列撐出畫面的長膠囊。
    compact = false,
}) => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState(propLastSyncTime || null);
    const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | success | error
    const [showDetails, setShowDetails] = useState(false);
    const [unsyncedCount, setUnsyncedCount] = useState(0);
    const [isCollapsed, setIsCollapsed] = useState(true);

    // 進度：{ done, total } 或 null
    const [progress, setProgress] = useState(null);
    // 「已是最新」短暫提示
    const [upToDateFlash, setUpToDateFlash] = useState(false);

    // 恢復連線橫幅
    const [reconnectBanner, setReconnectBanner] = useState(null); // null | 'syncing' | 'done'
    const [bannerCount, setBannerCount] = useState(0);

    // 首次離線安心卡
    const [showOfflineIntro, setShowOfflineIntro] = useState(false);

    const wasOfflineRef = useRef(!navigator.onLine);
    const bannerTimerRef = useRef(null);
    const flashTimerRef = useRef(null);

    // ── 衍生狀態 ───────────────────────────────────────────
    const mode = isSyncing || syncStatus === 'syncing'
        ? 'syncing'
        : !isOnline
            ? 'offline'
            : syncStatus === 'error'
                ? 'error'
                : unsyncedCount > 0
                    ? 'pending'
                    : 'synced';

    // 收合圖示：顏色即狀態
    const cloudColor =
        mode === 'pending' || mode === 'offline' || mode === 'error' ? CORAL : '#161415';

    const THEME = {
        synced: { icon: '#5A7A3A', label: '已同步', Icon: Cloud },
        // 🆕 待同步直接標示筆數 — 使用者不用點開就知道「還有幾筆沒上雲」
        pending: { icon: CORAL, label: unsyncedCount > 0 ? `待同步 ${unsyncedCount} 筆` : '待同步', Icon: Cloud },
        offline: { icon: CORAL, label: '離線暫存中', Icon: CloudOff },
        syncing: { icon: '#60A5FA', label: '同步中…', Icon: RefreshCw },
        error: { icon: CORAL, label: '同步失敗 · 點我重試', Icon: CloudOff },
    }[mode];

    // ── 網路上下線監聽 ──────────────────────────────────────
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            if (wasOfflineRef.current) {
                wasOfflineRef.current = false;
                runReconnectSync();
            }
        };
        const handleOffline = () => {
            setIsOnline(false);
            wasOfflineRef.current = true;
            try {
                if (!localStorage.getItem(FIRST_OFFLINE_SEEN_KEY)) {
                    setShowOfflineIntro(true);
                }
            } catch (_) { /* noop */ }
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 載入上次同步時間 + 定期檢查待同步筆數 ───────────────
    useEffect(() => {
        const loadInitialData = async () => {
            if (!propLastSyncTime) {
                const storedTime = await indexedDBManager.getSyncStatus(`lastWorkoutSync_${userId}`);
                if (storedTime) setLastSyncTime(new Date(storedTime).getTime());
            }
            checkUnsyncedItems();
        };
        loadInitialData();
        // 30s 輪詢改由 useVisibilityInterval 負責（背景時自動暫停）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, propLastSyncTime]);

    // ── 同步外部 props ──────────────────────────────────────
    useEffect(() => {
        if (propIsSyncing !== undefined) setIsSyncing(propIsSyncing);
        if (propSyncError !== undefined && propSyncError !== null) setSyncStatus('error');
        if (propLastSyncTime !== undefined && propLastSyncTime !== null) {
            setLastSyncTime(propLastSyncTime);
            setSyncStatus('success');
            setTimeout(() => setSyncStatus('idle'), 2000);
        }
    }, [propIsSyncing, propSyncError, propLastSyncTime]);

    const checkUnsyncedItems = useCallback(async () => {
        try {
            const unsynced = await indexedDBManager.getUnsyncedWorkouts(userId);
            const unsyncedPlans = await indexedDBManager.getUnsyncedPlans(userId);
            const total = unsynced.length + unsyncedPlans.length;
            setUnsyncedCount(total);
            return total;
        } catch (error) {
            console.error('Failed to check unsynced items:', error);
            return 0;
        }
    }, [userId]);

    // 每 30 秒檢查未同步項目；分頁切到背景時自動暫停，回前景立即補檢查一次。
    // 必須放在 checkUnsyncedItems 定義「之後」，否則會觸發 TDZ ReferenceError。
    useVisibilityInterval(checkUnsyncedItems, 30000);

    // 共用的同步呼叫：傳入 onProgress 回呼，回傳「實際同步筆數」
    const invokeSync = async () => {
        const handler = onSync || onRetrySync;
        if (!handler) return 0;
        const onProgress = (done, total) => {
            if (total > 0) setProgress({ done, total });
        };
        const result = await handler({ onProgress });
        // 同步函式可回傳數字（同步筆數）；否則用 0
        return typeof result === 'number' ? result : null;
    };

    const flashUpToDate = () => {
        setUpToDateFlash(true);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setUpToDateFlash(false), 2200);
    };

    // ── 核心同步流程（手動點擊用） ──────────────────────────
    const handleSync = async () => {
        if (isSyncing || !isOnline) return;

        // 先看有沒有東西要同步
        const pending = await checkUnsyncedItems();
        if (pending === 0) {
            // 沒東西 → 提示「已是最新」，不進入 syncing 狀態
            flashUpToDate();
            return;
        }

        setIsSyncing(true);
        setSyncStatus('syncing');
        setProgress({ done: 0, total: pending });
        try {
            await invokeSync();
            // 🩹 v2：同步後用「剩餘筆數」誠實判定結果 — 舊版不管有沒有真的傳上去
            //    都顯示成功，使用者點了沒反應也不知道為什麼。
            const remaining = await checkUnsyncedItems();
            if (remaining >= pending) {
                // 一筆都沒送出去 → 明確標示失敗（面板會顯示原因與重試指引）
                setSyncStatus('error');
                setTimeout(() => setSyncStatus('idle'), 6000);
            } else {
                const now = Date.now();
                setLastSyncTime(now);
                await indexedDBManager.updateSyncStatus(`lastManualSync_${userId}`, new Date(now).toISOString());
                setSyncStatus('success');
                if (remaining === 0) flashUpToDate(); // ✅ 全部送完 → 勾勾回饋，計數歸零看得見
                setTimeout(() => setSyncStatus('idle'), 2500);
            }
        } catch (error) {
            setSyncStatus('error');
            setTimeout(() => setSyncStatus('idle'), 5000);
        } finally {
            setIsSyncing(false);
            setTimeout(() => setProgress(null), 800);
        }
    };

    // ── 恢復連線自動同步（含橫幅 + 進度） ───────────────────
    const runReconnectSync = async () => {
        const pending = await checkUnsyncedItems();
        setBannerCount(pending);
        setReconnectBanner('syncing');
        if (pending > 0) {
            setIsSyncing(true);
            setSyncStatus('syncing');
            setProgress({ done: 0, total: pending });
        }
        try {
            await invokeSync();
            await checkUnsyncedItems();
            const now = Date.now();
            setLastSyncTime(now);
            await indexedDBManager.updateSyncStatus(`lastManualSync_${userId}`, new Date(now).toISOString());
            setSyncStatus('success');
            setTimeout(() => setSyncStatus('idle'), 2500);
        } catch (error) {
            setSyncStatus('error');
            setTimeout(() => setSyncStatus('idle'), 5000);
        } finally {
            setIsSyncing(false);
            setTimeout(() => setProgress(null), 800);
            setReconnectBanner('done');
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            bannerTimerRef.current = setTimeout(() => setReconnectBanner(null), 2500);
        }
    };

    const dismissOfflineIntro = () => {
        setShowOfflineIntro(false);
        try { localStorage.setItem(FIRST_OFFLINE_SEEN_KEY, '1'); } catch (_) { /* noop */ }
    };

    const formatTimeSince = (timestamp) => {
        if (!timestamp) return '尚未同步';
        const diff = Date.now() - timestamp;
        if (diff < 60000) return '剛剛';
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} 分鐘前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小時前`;
        return `${Math.floor(hours / 24)} 天前`;
    };

    const StateIcon = THEME.Icon;
    const pct = progress && progress.total > 0
        ? Math.min(100, Math.round((progress.done / progress.total) * 100))
        : 0;

    // 進度條小元件（面板/列共用）— 🩹 文字改深墨色（原本白字在淺色石玻璃上看不見）
    const ProgressBar = ({ compact = false }) => (
        <div className={compact ? 'w-full' : 'w-full space-y-1.5'}>
            {!compact && (
                <div className="flex justify-between text-[11px]">
                    <span style={{ color: 'rgba(22,20,21,0.6)' }}>正在上傳到雲端</span>
                    <span className="font-semibold tabular-nums" style={{ color: '#161415' }}>
                        {progress.done} / {progress.total} 筆
                    </span>
                </div>
            )}
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.10)' }}>
                <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg,#60A5FA,#3B82F6)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }}
                />
            </div>
        </div>
    );

    // 🆕 hideWhenIdle：一切正常（已連線、沒有待同步、沒有同步中、沒有任何橫幅/提示卡）時，
    //    整個元件不渲染，畫面保持乾淨。只要一離線或有待同步資料就會立刻浮現。
    if (
        hideWhenIdle &&
        mode === 'synced' &&
        !reconnectBanner &&
        !showOfflineIntro &&
        !upToDateFlash
    ) {
        return null;
    }

    return (
        <>
            {/* ════════════════ 主指示器 ════════════════ */}
            <div
                className="fixed right-4 z-[10000] flex flex-col items-end gap-2"
                style={{
                    top: 'calc(env(safe-area-inset-top, 50px) + 8px)',
                    ...style
                }}
            >
                <AnimatePresence mode="wait">
                    {(isCollapsed || compact) ? (
                        // ── 收合：極簡，只用雲朵顏色表達狀態 ──
                        // compact（工具列內嵌）：點雲朵直接開固定面板，不展開成長膠囊（會把工具列撐出畫面）
                        <motion.button
                            key="collapsed"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            onClick={() => (compact ? setShowDetails((v) => !v) : setIsCollapsed(false))}
                            whileTap={{ scale: 0.92 }}
                            aria-label={`同步狀態：${THEME.label}`}
                            className="relative w-11 h-11 rounded-full flex items-center justify-center"
                            style={MIST_GLASS}
                        >
                            {/* 同步中：環形進度圈 */}
                            {mode === 'syncing' && progress && progress.total > 0 && (
                                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" width="44" height="44">
                                    <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                                    <motion.circle
                                        cx="22" cy="22" r="19" fill="none" stroke="#60A5FA" strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeDasharray={2 * Math.PI * 19}
                                        animate={{ strokeDashoffset: 2 * Math.PI * 19 * (1 - pct / 100) }}
                                        transition={{ ease: 'easeOut', duration: 0.3 }}
                                    />
                                </svg>
                            )}

                            <motion.div
                                animate={mode === 'syncing' ? { rotate: 360 } : { rotate: 0 }}
                                transition={mode === 'syncing'
                                    ? { duration: 1.4, repeat: Infinity, ease: 'linear' }
                                    : { duration: 0.3 }}
                            >
                                <StateIcon size={19} style={{ color: mode === 'syncing' ? '#60A5FA' : cloudColor }} />
                            </motion.div>

                            {/* 🆕 待同步筆數小徽章 — 收合時也一眼看到還有幾筆沒上雲 */}
                            {mode === 'pending' && unsyncedCount > 0 && (
                                <span
                                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center tabular-nums"
                                    style={{ background: CORAL, color: '#fff', fontSize: 11, fontWeight: 900, border: '1.5px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 6px rgba(249,92,75,0.4)' }}
                                >
                                    {unsyncedCount > 9 ? '9+' : unsyncedCount}
                                </span>
                            )}

                            {/* 「已是最新」勾勾閃一下 */}
                            <AnimatePresence>
                                {upToDateFlash && (
                                    <motion.span
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                        style={{ background: '#5A7A3A', border: '2px solid rgba(20,19,21,0.9)' }}
                                    >
                                        <CheckCircle size={11} className="text-white" />
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    ) : (
                        // ── 展開：圖示 + 中文短標籤 + 詳細面板 ──
                        <motion.div
                            key="expanded"
                            initial={{ width: 44, opacity: 0 }}
                            animate={{ width: 'auto', opacity: 1 }}
                            exit={{ width: 44, opacity: 0 }}
                            className="flex flex-col items-end gap-2"
                        >
                            <motion.div
                                whileTap={{ scale: 0.97 }}
                                className="flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-full"
                                style={{ ...STONE_GLASS, color: '#161415' }}
                            >
                                {/* 主區：點一下開關詳細面板（同步失敗時點了直接重試） */}
                                <motion.button {...pressProps('row')}
 onClick={() => (mode === 'error' ? handleSync() : setShowDetails(!showDetails))}
 className="flex items-center gap-2.5 bg-transparent border-0 p-0 cursor-pointer"
 >
                                    <motion.div
                                        animate={mode === 'syncing' ? { rotate: 360 } : { rotate: 0 }}
                                        transition={mode === 'syncing'
                                            ? { duration: 1.4, repeat: Infinity, ease: 'linear' }
                                            : {}}
                                    >
                                        <StateIcon size={15} style={{ color: THEME.icon }} />
                                    </motion.div>

                                    <span className="text-[12px] font-bold tracking-wide whitespace-nowrap text-[#161415]">
                                        {mode === 'syncing' && progress
                                            ? `上傳 ${progress.done}/${progress.total}`
                                            : THEME.label}
                                    </span>
                                </motion.button>

                                {/* 🆕 一鍵同步 — 有待同步資料且在線上時，pill 上直接給「同步」小鈕，
                                    不必再點進面板找按鈕（少兩步）。 */}
                                {mode === 'pending' && isOnline && (
                                    <motion.button {...pressProps('pill')}
 onClick={handleSync}
 aria-label="立即同步"
 className="flex items-center gap-1 px-2.5 py-1 rounded-full border-0 cursor-pointer"
 style={{ background: CORAL, color: '#fff' }}
 >
                                        <RefreshCw size={11} />
                                        <span className="text-[11px] font-black whitespace-nowrap">同步</span>
                                    </motion.button>
                                )}

                                {/* 收合鈕：點一下收回成圓圖示（同時關閉面板） */}
                                <motion.button {...pressProps('icon')}
 onClick={() => { setShowDetails(false); setIsCollapsed(true); }}
 aria-label="收合"
 className="ml-0.5 p-1 rounded-full hover:bg-black/5 bg-transparent border-0 cursor-pointer"
 >
                                    <ChevronLeft size={13} className="text-[#161415] opacity-60" />
                                </motion.button>
                            </motion.div>

                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 詳細面板 — portal 到 body。
                    🛠 修「跑步頁點雲朵沒反應」：跑步頁工具列外層有 transform/backdrop-filter
                    ＋圓角 overflow 裁切，position:fixed 在 transform 祖先裡會退化成相對該
                    祖先定位 → 面板被工具列整個剪掉（有開但看不見）。portal 掛 body 後，
                    跑步頁與健身計劃頁的雲朵行為完全一致。 */}
                {createPortal(
                <AnimatePresence>
                                {showDetails && (
                                    <>
                                    {/* 深色遮罩 — 點外面關閉 */}
                                    <motion.div
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        onClick={() => setShowDetails(false)}
                                        style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                        className="rounded-[22px] overflow-hidden"
                                        /* 🛠 置中彈窗（modal）：portal 到 body + 水平置中、垂直約 1/4 處，
                                           跑步頁與健身計劃頁行為一致 */
                                        style={{
                                            ...STONE_GLASS,
                                            position: 'fixed',
                                            top: '24dvh',
                                            left: 0,
                                            right: 0,
                                            margin: '0 auto',
                                            width: 'min(320px, calc(100vw - 48px))',
                                            zIndex: 10001,
                                            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                                        }}
                                    >
                                        <div className="px-4 py-3 border-b border-[#161415]/10 flex justify-between items-center" style={{ background: STONE_SURFACE }}>
                                            <h3 className="text-[12px] font-bold text-[#161415] flex items-center gap-2">
                                                <StateIcon size={13} style={{ color: THEME.icon === '#FFFFFF' ? '#161415' : THEME.icon }} />
                                                {THEME.label}
                                            </h3>
                                            <ChevronDown size={14} className="text-[#161415]/40" />
                                        </div>

                                        <div className="p-4 space-y-3.5">
                                            {/* 同步中 → 進度條 */}
                                            {mode === 'syncing' && progress ? (
                                                <ProgressBar />
                                            ) : (
                                                <p className="text-[12px] leading-relaxed text-[#161415]/70">
                                                    {mode === 'offline'
                                                        ? '目前沒有網路，但你可以繼續使用。所有紀錄會先安全存在這支手機，等連上網路就會自動同步到雲端，不會遺失。'
                                                        : mode === 'error'
                                                            ? '剛才上傳失敗（可能是網路不穩或伺服器忙碌）。你的紀錄仍安全存在手機裡，按下方按鈕重試即可。'
                                                            : mode === 'pending'
                                                                ? `已連上網路，還有 ${unsyncedCount} 筆資料準備上傳。按下方按鈕即可立即同步。`
                                                                : '所有資料都已安全同步到雲端，換裝置登入也看得到。'}
                                                </p>
                                            )}

                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-[#161415]/60">網路狀態</span>
                                                <div className="flex items-center gap-1.5">
                                                    {isOnline
                                                        ? <Wifi size={12} className="text-green-600" />
                                                        : <WifiOff size={12} style={{ color: CORAL }} />}
                                                    <span className="text-[12px] font-semibold" style={{ color: isOnline ? '#059669' : CORAL }}>
                                                        {isOnline ? '已連線' : '無網路'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-[#161415]/60">上次同步</span>
                                                <div className="flex items-center gap-1.5 text-[#161415]">
                                                    <Clock size={11} className="text-[#161415]/40" />
                                                    <span className="text-[12px] tabular-nums">{formatTimeSince(lastSyncTime)}</span>
                                                </div>
                                            </div>

                                            <motion.button
                                                whileTap={{ scale: 0.96 }}
                                                onClick={handleSync}
                                                disabled={!isOnline || isSyncing}
                                                className="w-full py-2.5 rounded-xl font-bold text-[12px] flex items-center justify-center gap-2 transition-all"
                                                style={{
                                                    background: isOnline && !isSyncing ? '#161415' : 'rgba(22,20,21,0.1)',
                                                    color: isOnline && !isSyncing ? '#fff' : 'rgba(22,20,21,0.4)',
                                                }}
                                            >
                                                {isSyncing ? (
                                                    <><RefreshCw size={13} className="animate-spin" /> 上傳中…</>
                                                ) : upToDateFlash ? (
                                                    <><CheckCircle size={13} className="text-green-600" /> 已是最新狀態</>
                                                ) : isOnline ? (
                                                    <><RefreshCw size={13} /> 立即同步到雲端</>
                                                ) : (
                                                    <>等待網路連線</>
                                                )}
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                    </>
                                )}
                </AnimatePresence>,
                document.body)}
            </div>

            {/* ════════════════ 恢復連線自動同步橫幅（含進度） ════════════════ */}
            <AnimatePresence>
                {reconnectBanner && (
                    <motion.div
                        key="reconnect-banner"
                        initial={{ opacity: 0, y: -24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -24 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        className="fixed left-1/2 -translate-x-1/2 z-[10001] flex flex-col gap-1.5 px-4 py-2.5 rounded-[18px]"
                        style={{
                            top: 'calc(env(safe-area-inset-top, 50px) + 8px)',
                            ...STONE_GLASS,
                            maxWidth: 'min(92vw, 360px)',
                            minWidth: '240px',
                        }}
                    >
                        {/* 🩹 文字改深墨色（原本白字在淺色石玻璃上看不見） */}
                        {reconnectBanner === 'syncing' ? (
                            <>
                                <div className="flex items-center gap-2.5">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                                        <RefreshCw size={15} style={{ color: '#3B82F6' }} />
                                    </motion.div>
                                    <span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: '#161415' }}>
                                        {progress && progress.total > 0
                                            ? `已連線，正在自動同步 ${progress.done}/${progress.total} 筆`
                                            : bannerCount > 0
                                                ? `已連線，正在自動同步 ${bannerCount} 筆…`
                                                : '已連線，正在同步…'}
                                    </span>
                                </div>
                                {progress && progress.total > 0 && <ProgressBar compact />}
                            </>
                        ) : (
                            <div className="flex items-center gap-2.5">
                                <CheckCircle size={15} style={{ color: '#5A7A3A' }} />
                                <span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: '#161415' }}>
                                    全部已同步到雲端
                                </span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════ 首次離線安心提示卡 ════════════════ */}
            <AnimatePresence>
                {showOfflineIntro && (
                    <motion.div
                        key="offline-intro-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10002] flex items-end justify-center px-4 pb-8"
                        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                        onClick={dismissOfflineIntro}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0, scale: 0.96 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 60, opacity: 0, scale: 0.96 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-[360px] rounded-3xl overflow-hidden"
                            style={STONE_GLASS}
                        >
                            <div className="px-6 pt-7 pb-2 flex flex-col items-center text-center">
                                <div
                                    className="w-14 h-14 rounded-[18px] flex items-center justify-center mb-4"
                                    style={{ background: 'rgba(249,92,75,0.15)' }}
                                >
                                    <CloudOff size={26} style={{ color: CORAL }} />
                                </div>
                                <h2 className="text-[18px] font-bold mb-1.5" style={{ color: '#161415' }}>沒有網路也能繼續訓練</h2>
                                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.6)' }}>
                                    現在偵測不到網路，但別擔心 — App 會照常運作。
                                </p>
                            </div>

                            <div className="px-6 py-4 space-y-3">
                                <div className="flex items-start gap-3">
                                    <Smartphone size={18} style={{ color: CORAL }} className="mt-0.5 shrink-0" />
                                    <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.75)' }}>
                                        你的所有紀錄會<span className="font-semibold" style={{ color: '#161415' }}>先安全存在這支手機</span>。
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Cloud size={18} style={{ color: '#5A7A3A' }} className="mt-0.5 shrink-0" />
                                    <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.75)' }}>
                                        一旦<span className="font-semibold" style={{ color: '#161415' }}>連回網路，就會自動同步</span>到雲端，完全不用手動操作。
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <ShieldCheck size={18} style={{ color: '#3B82F6' }} className="mt-0.5 shrink-0" />
                                    <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.75)' }}>
                                        工具列的<span className="font-semibold" style={{ color: '#161415' }}>雲朵變成珊瑚色＋數字</span>，就代表還有幾筆資料等待同步。
                                    </p>
                                </div>
                            </div>

                            <div className="px-6 pb-6 pt-2">
                                <motion.button {...pressProps('cta')}
 onClick={dismissOfflineIntro}
 className="w-full py-3.5 rounded-[18px] font-bold text-[14px]"
 style={{ background: '#161415', color: '#fff' }}
 >
                                    我知道了
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default SyncStatusIndicator;
