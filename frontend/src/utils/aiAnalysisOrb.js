/**
 * aiAnalysisOrb.js
 * ──────────────────────────────────────────────────────────────────
 * Tiny state store for the "AI Analysis floating sprite (orb)".
 *
 * Flow:
 *   1. User taps "AI Analysis" inside the paused workout → openOrb() saves the
 *      route to return to (the live workout) and shows the glass orb, then the
 *      app navigates to the exercise-analysis page (圖三).
 *   2. While the user records / analyses a movement, callers update progress via
 *      setOrbProgress(0..100) so the orb's ring fills up.
 *   3. When the user taps the orb, returnFromOrb() navigates back to the saved
 *      workout route and hides the orb — resuming the workout exactly where it
 *      was paused.
 *
 * State is mirrored to sessionStorage so it survives React route remounts
 * (App.jsx <Routes> is keyed by pathname and fully rebuilds on navigation).
 * ──────────────────────────────────────────────────────────────────
 */

const KEY = 'drvn:aiOrb';
const EVT = 'drvn-ai-orb-change';

const DEFAULT = {
    active: false,        // is the orb showing?
    phase: 'waiting',     // 'waiting'(尚未開始) → 'analyzing'(分析中) → 'done'(完成)
    returnTo: null,       // route to jump back to the live workout (省時)
    returnState: null,    // router state to restore (e.g. the workout `day`)
    analysisTo: null,     // the analysis page to jump to (auto-tracked as user moves)
    resultTo: null,       // route to view the finished analysis result
    resultState: null,    // router state carrying the analysis result
    progress: 0,          // 0..100 analysis progress for the ring
    busy: false,          // analysing right now → spinning ring
    label: 'AI 分析中',   // small bubble label under the orb
};

function read() {
    try {
        const raw = sessionStorage.getItem(KEY);
        return raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
    } catch {
        return { ...DEFAULT };
    }
}

function write(next) {
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch { /* ignore */ }
}

export function getOrbState() {
    return read();
}

/** Show the orb and remember where to return. */
export function openOrb({ returnTo, returnState = null, analysisTo = null, label } = {}) {
    write({
        ...read(),
        active: true,
        phase: 'waiting',     // 還沒真的開始分析 → 不顯示「分析中」、不轉圈
        returnTo: returnTo ?? read().returnTo,
        returnState: returnState ?? read().returnState,
        analysisTo: analysisTo ?? read().analysisTo,
        resultTo: null,
        resultState: null,
        busy: false,          // 等待中不旋轉
        progress: 0,
        label: label ?? '等待分析',
    });
}

/** Remember the current analysis page so the orb can toggle back to it. */
export function setOrbAnalysisRoute(analysisTo) {
    const cur = read();
    if (!cur.active || !analysisTo) return;
    if (cur.analysisTo === analysisTo) return;
    write({ ...cur, analysisTo });
}

/** Update the ring fill (0..100). 真的開始有進度 → 進入 analyzing 並開始轉圈。 */
export function setOrbProgress(progress, label) {
    const cur = read();
    if (!cur.active) return;
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    const startedAnalyzing = p > 0 && cur.phase !== 'done';
    write({
        ...cur,
        progress: p,
        ...(startedAnalyzing ? { phase: 'analyzing', busy: true } : {}),
        ...(label ? { label } : {}),
    });
}

/** Toggle the spinning "busy" shimmer. */
export function setOrbBusy(busy, label) {
    const cur = read();
    if (!cur.active) return;
    write({ ...cur, busy: !!busy, ...(label ? { label } : {}) });
}

/**
 * Mark analysis finished (full ring, not spinning).
 * Pass where to view the result so a tap on the orb opens it.
 */
export function completeOrb({ resultTo, resultState = null, label } = {}) {
    const cur = read();
    if (!cur.active) return;
    write({
        ...cur,
        phase: 'done',
        busy: false,
        progress: 100,
        resultTo: resultTo ?? cur.resultTo,
        resultState: resultState ?? cur.resultState,
        label: label ?? '分析完成 · 點我看結果',
    });
}

/**
 * 分析失敗 / 取消：浮球退回「等待分析」，不能停在轉圈。
 * （原本只有 completeOrb，失敗時浮球會永遠停在 analyzing + busy。）
 */
export function failOrb(label) {
    const cur = read();
    if (!cur.active) return;
    write({
        ...cur,
        phase: 'waiting',
        busy: false,
        progress: 0,
        resultTo: null,
        resultState: null,
        label: label ?? '分析未完成 · 點我重試',
    });
}

/** Hide the orb entirely. */
export function closeOrb() {
    write({ ...DEFAULT });
}

/** Subscribe to orb state changes. Returns an unsubscribe fn. */
export function subscribeOrb(cb) {
    const handler = (e) => cb(e.detail || read());
    window.addEventListener(EVT, handler);
    // storage event for cross-tab / other-document updates
    const storageHandler = (e) => { if (e.key === KEY) cb(read()); };
    window.addEventListener('storage', storageHandler);
    return () => {
        window.removeEventListener(EVT, handler);
        window.removeEventListener('storage', storageHandler);
    };
}

export const ORB_RETURN_TO_KEY = KEY;
