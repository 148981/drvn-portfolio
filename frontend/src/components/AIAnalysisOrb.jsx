import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { getOrbState, subscribeOrb, closeOrb, setOrbAnalysisRoute } from '../utils/aiAnalysisOrb';
import { hapticWarning, hapticTap } from '../utils/haptics';

/**
 * AIAnalysisOrb
 * ───────────────────────────────────────────────────────────────
 * A persistent Liquid-Glass floating sprite that represents the in-progress
 * AI movement analysis. Rendered once at the App level (outside <Routes>) so it
 * survives page navigation.
 *
 * Tap = TOGGLE between the analysis page and the live workout page (both ways,
 * even mid-analysis) so the user can flip back and forth without losing either.
 * The ring stays synced to the live analysis progress the whole time.
 * Long-press = haptic + dismiss.
 *
 * Styling lives in styles/liquid-glass.css (.lg-orb*).
 */
// 正規化路徑：容忍 query(?)、hash(#)、結尾斜線，避免 startsWith 判錯。
const normalizePath = (p) => (p || '').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
// 判斷某 path 是否「就是」健身頁（或其子路徑）
const isWorkoutPath = (path, returnTo) => {
    const wp = normalizePath(returnTo);
    const cp = normalizePath(path);
    return !!wp && (cp === wp || cp.startsWith(wp + '/'));
};

export default function AIAnalysisOrb() {
    const navigate = useNavigate();
    const location = useLocation();
    const [state, setState] = useState(getOrbState);
    // 預設停在右側、底部建立貼文 FAB 與底部導覽列「之上」，避免與 + 鈕重疊。
    // FAB 約在 bottom 90px、orb 高 64px，再往上留間距 → 距底約 230px。
    const [pos, setPos] = useState({ x: window.innerWidth - 84, y: Math.max(140, window.innerHeight - 230) });
    const [dragging, setDragging] = useState(false);

    // 用 ref 鏡射最新 location，讓 handleTap 與 useEffect 用同一套來源（避免
    // window.location 與 useLocation 在 navigation race 下短暫不一致）。
    const locRef = useRef(location);
    locRef.current = location;
    // pos 也鏡射成 ref，讓 onPointerDown 可以用 [] 依賴、不再每次點擊後重建。
    const posRef = useRef(pos);
    posRef.current = pos;

    useEffect(() => subscribeOrb(setState), []);

    // Auto-track the analysis page: whenever we're on an analysis-flow route
    // (not the workout), remember it so a tap can toggle straight back to it.
    useEffect(() => {
        const s = getOrbState();
        if (!s.active) return;
        const workoutPath = normalizePath(s.returnTo);
        const onWorkout = isWorkoutPath(location.pathname, s.returnTo);
        // ⛑ 絕不把「健身頁本身」寫進 analysisTo，否則之後點浮球只會原地跳同一條 URL（看似點不動）。
        if (!onWorkout && normalizePath(location.pathname) !== workoutPath) {
            setOrbAnalysisRoute(location.pathname);   // 寫原始 path（保留 query）
        }
    }, [location.pathname]);

    // keep orb on-screen if viewport resizes
    useEffect(() => {
        const onResize = () =>
            setPos((p) => ({
                x: Math.min(p.x, window.innerWidth - 72),
                y: Math.min(p.y, window.innerHeight - 96),
            }));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const LONG_PRESS_MS = 550;          // 長按關閉門檻
    const [holdProgress, setHoldProgress] = useState(0);  // 0..1 長按關閉視覺
    const holdTimer = useRef(null);
    const holdRaf = useRef(null);
    const didLongPress = useRef(false);
    // 只有「在 WorkoutSession 頁」才允許關閉浮球，否則關掉就回不去健身進度了。
    // 用 ref 鏡射，避開 onPointerDown 長壽命 closure 讀到 stale 值。
    const canCloseRef = useRef(false);
    const [blockedClose, setBlockedClose] = useState(false);  // 在外面想關時的提示

    const clearHold = () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        if (holdRaf.current) { cancelAnimationFrame(holdRaf.current); holdRaf.current = null; }
        setHoldProgress(0);
    };

    // ── tap = 跳轉；長按 = 震動關閉；拖曳 = 移動 ──
    const onPointerDown = useCallback((e) => {
        // ⚠️ 不用 setPointerCapture：這顆球是常駐元件，跨頁導航時若仍持有捕捉，
        //    下一次手勢的事件路由會錯亂。改用 window 監聽即可穩定運作。
        setDragging(false);
        didLongPress.current = false;
        const start = { px: e.clientX, py: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false, t: performance.now() };

        // 長按蓄力視覺 + 到門檻就關閉
        const holdStart = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - holdStart) / LONG_PRESS_MS);
            setHoldProgress(p);
            if (p < 1 && !start.moved) holdRaf.current = requestAnimationFrame(tick);
        };
        holdRaf.current = requestAnimationFrame(tick);
        holdTimer.current = setTimeout(() => {
            if (!start.moved) {
                didLongPress.current = true;
                clearHold();
                if (canCloseRef.current) {
                    hapticWarning();    // 關閉的震動回饋
                    closeOrb();         // 只有在 WorkoutSession 頁才能關閉
                } else {
                    // 不在訓練頁長按 → 不關閉，提示使用者先回到訓練頁
                    hapticWarning();
                    setBlockedClose(true);
                    setTimeout(() => setBlockedClose(false), 2200);
                }
            }
        }, LONG_PRESS_MS);

        const move = (ev) => {
            const dx = ev.clientX - start.px;
            const dy = ev.clientY - start.py;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                start.moved = true;
                setDragging(true);
                clearHold();            // 一旦拖曳就取消長按關閉
            }
            setPos({
                x: Math.max(8, Math.min(window.innerWidth - 72, start.ox + dx)),
                y: Math.max(8, Math.min(window.innerHeight - 96, start.oy + dy)),
            });
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            clearHold();
            // snap to nearest horizontal edge
            setPos((p) => ({ ...p, x: p.x + 32 < window.innerWidth / 2 ? 12 : window.innerWidth - 72 }));
            setTimeout(() => setDragging(false), 0);
            // 只要「沒有拖曳」且「還沒觸發長按關閉」就視為單擊跳轉。
            //   ⚠️ 不再用 heldMs < LONG_PRESS_MS 當門檻：跨頁導航會讓主執行緒卡頓，
            //      實體快速點擊的 pointerdown→up 間隔可能 >550ms，被誤判成「不是單擊」
            //      → 第二、三次點擊就沒反應。didLongPress 旗標已足夠區分長按。
            if (!start.moved && !didLongPress.current) {
                handleTapRef.current?.();   // 短點 → 跳轉（透過 ref，永遠呼叫最新版本）
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => () => clearHold(), []);

    // 鏡射「是否在 WorkoutSession 頁」到 ref，供長按關閉判斷使用。
    useEffect(() => {
        const s = getOrbState();
        canCloseRef.current = isWorkoutPath(location.pathname, s.returnTo);
    }, [location.pathname, state]);

    // 短點 = 在「分析流程頁」與「健身中頁」之間來回切換（切換時浮球不關閉）。
    //   ┌ 在健身頁  → 跳到分析頁：done 去結果頁，否則去 analysisTo（退回動作選擇頁）
    //   └ 不在健身頁 → 跳回健身中（returnTo）
    // 一律讀「即時」狀態（getOrbState + locRef），且用正規化路徑比對，
    // 避免任何 stale closure / 尾斜線·query 差異，所以無論來回切幾次方向都正確。
    const handleTap = () => {
        const s = getOrbState();
        if (!s.active) return;
        hapticTap();
        const workoutPath = normalizePath(s.returnTo);
        const onWorkout = isWorkoutPath(locRef.current.pathname, s.returnTo);

        if (onWorkout) {
            // 在健身頁 → 去分析流程頁（done 優先去結果頁）
            if (s.phase === 'done' && s.resultTo && normalizePath(s.resultTo) !== workoutPath) {
                navigate(s.resultTo, s.resultState ? { state: s.resultState } : undefined);
            } else {
                // ⛑ 防呆：analysisTo 若不小心等於健身頁（或沒值）→ fallback 到動作選擇頁，
                //    避免 navigate 到同一條 URL 而看似「點不動」。
                const target = (s.analysisTo && normalizePath(s.analysisTo) !== workoutPath)
                    ? s.analysisTo
                    : '/exercise-selector-mobile';
                navigate(target, { state: { fromWorkout: true } });
            }
        } else if (s.returnTo) {
            // 在分析頁 → 切回健身中
            navigate(s.returnTo, s.returnState ? { state: s.returnState } : undefined);
        }
    };
    // 把最新的 handleTap 放進 ref，讓長壽命的 onPointerDown closure 永遠呼叫到最新版本。
    const handleTapRef = useRef(handleTap);
    handleTapRef.current = handleTap;

    if (!state.active) return null;

    // Outer wrapper is NOT clipped, so the progress ring (inset:-5px) and the
    // label (top:70px) remain visible even though .lg-orb has overflow:hidden.
    const isDone = state.phase === 'done' || (state.progress >= 100 && !state.busy);
    const isWaiting = state.phase === 'waiting';   // 還沒真的開始分析
    const holding = holdProgress > 0.02;
    const onWorkout = isWorkoutPath(location.pathname, state.returnTo);
    const pct = Math.round(state.progress || 0);

    // Label reflects where a tap will take you (toggle), while surfacing the real state.
    const tapLabel = onWorkout
        ? (isDone ? '分析完成 · 點我看結果'
            : isWaiting ? '等待分析 · 點我去上傳'
                : `分析中 ${pct}% · 點我看分析`)
        : '點我回到訓練';

    // 長按時的提示：在訓練頁可關閉；不在訓練頁則提醒先回訓練頁
    const holdLabel = onWorkout ? '持續按住關閉' : '請先回到訓練頁才能關閉';

    return (
        <div
            style={{
                position: 'fixed', left: pos.x, top: pos.y, width: 64, height: 64, zIndex: 9999,
                // 長按時整顆稍微縮小、變淡，暗示「就要關閉」
                transform: `scale(${1 - holdProgress * 0.22})`,
                opacity: 1 - holdProgress * 0.45,
                transition: holding ? 'none' : 'transform .2s ease, opacity .2s ease',
                touchAction: 'none',
            }}
            onPointerDown={onPointerDown}
            role="button"
            aria-label={onWorkout ? '查看分析，長按關閉' : '回到訓練'}
        >
            <div className="lg-orb-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
                {/* progress ring — sits outside the clipped orb */}
                <div
                className="lg-orb__ring"
                style={{ '--p': state.progress, position: 'absolute', zIndex: 2, ...(state.busy ? { animation: 'lg-orb-spin 1.1s linear infinite, orb-ring-pulse 1s infinite alternate' } : {}) }}
            />
            {/* 長按關閉的環形指示（白色細描邊隨 holdProgress 繞圈） */}
            {holding && (
                <svg style={{ position: 'absolute', inset: -3, width: 'calc(100% + 6px)', height: 'calc(100% + 6px)', zIndex: 3, pointerEvents: 'none' }} viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.4"
                        strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - holdProgress}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.9))' }} />
                </svg>
            )}
            <div className={`lg-orb${state.busy ? ' lg-orb--busy' : ''}`} style={{ position: 'absolute', inset: 0, left: 'auto', top: 'auto' }}>
                {onWorkout ? (
                    // 在訓練頁：點我去看分析/結果 → 顯示 logo
                    <img loading="lazy" decoding="async" src="/desktop/6666.png" alt="logo" style={{ width: 44, height: 44, zIndex: 10, objectFit: 'contain' }} />
                ) : (
                    // 在分析頁：點我回訓練 → 顯示返回箭頭
                    <ChevronLeft size={24} strokeWidth={2.6} />
                )}
            </div>
                {!dragging && (
                    <span className="lg-orb__label">
                        {blockedClose ? '請先回到訓練頁才能關閉'
                            : holding ? holdLabel : tapLabel}
                    </span>
                )}
            </div>
        </div>
    );
}
