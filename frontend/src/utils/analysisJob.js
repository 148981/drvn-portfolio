/**
 * analysisJob.js
 * ──────────────────────────────────────────────────────────────────
 * 持久化「動作分析工作」的進度狀態，讓使用者在分析途中切回訓練頁
 * (WorkoutSession) 再切回分析頁時，loading 畫面不會消失、進度也不會
 * 從 0 重新計時。
 *
 * 問題根因：
 *   /upload-mobile (UploadMobile) 的 processingProgress 是元件區域 state，
 *   App.jsx 的 <Routes> 以 pathname 為 key，導航離開再回來會「重新掛載」
 *   元件 → state 歸零 → loading overlay 消失、計時重來、後端輪詢中斷。
 *
 * 解法：
 *   把 { jobId, progress, stage, startedAt, multiExercise, exerciseKey, ... }
 *   寫進 sessionStorage。UploadMobile 掛載時 rehydrate，若仍有未完成的 job
 *   就直接接手繼續輪詢，畫面立刻顯示正確進度。
 * ──────────────────────────────────────────────────────────────────
 */

const KEY = 'drvn:analysisJob';
const EVT = 'drvn-analysis-job-change';

const DEFAULT = {
    active: false,        // 是否有進行中的分析
    jobId: null,          // 後端 async 工作編號
    status: 'idle',       // 'idle' | 'running' | 'done' | 'error'
    progress: 0,          // 0..100（顯示用，已含上傳 + 後端映射）
    stage: '',            // 後端回報的階段文字
    startedAt: 0,         // Date.now() 開始時間（跨掛載沿用，計時器才不會歸零）
    multiExercise: false,
    exerciseKey: null,
    exerciseName: '',
    exerciseNameEn: '',
    isSideView: false,
    result: null,         // 完成後的結果（done 時填入）
    error: null,
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

export function getAnalysisJob() {
    return read();
}

/** 開始一個新的分析工作（上傳前呼叫，先記住參數與起始時間）。 */
export function startAnalysisJob({
    multiExercise = false, exerciseKey = null, exerciseName = '',
    exerciseNameEn = '', isSideView = false,
} = {}) {
    write({
        ...DEFAULT,
        active: true,
        status: 'running',
        progress: 1,
        stage: '',
        startedAt: Date.now(),
        multiExercise, exerciseKey, exerciseName, exerciseNameEn, isSideView,
    });
}

/** 拿到後端 jobId 後寫入，重掛載時就能接手繼續輪詢。 */
export function setAnalysisJobId(jobId) {
    const cur = read();
    if (!cur.active) return;
    write({ ...cur, jobId });
}

/** 更新進度 / 階段。 */
export function updateAnalysisJob({ progress, stage } = {}) {
    const cur = read();
    if (!cur.active) return;
    write({
        ...cur,
        ...(progress != null ? { progress: Math.max(0, Math.min(100, Math.round(progress))) } : {}),
        ...(stage != null ? { stage } : {}),
    });
}

/** 標記完成並存下結果。 */
export function finishAnalysisJob(result) {
    const cur = read();
    write({ ...cur, active: false, status: 'done', progress: 100, result: result ?? null });
}

/** 標記失敗。 */
export function failAnalysisJob(error) {
    const cur = read();
    write({ ...cur, active: false, status: 'error', error: String(error || '分析失敗') });
}

/** 清空（離開結果頁 / 重新分析時呼叫）。 */
export function clearAnalysisJob() {
    write({ ...DEFAULT });
}

/** 訂閱狀態變化。回傳 unsubscribe。 */
export function subscribeAnalysisJob(cb) {
    const handler = (e) => cb(e.detail || read());
    window.addEventListener(EVT, handler);
    const storageHandler = (e) => { if (e.key === KEY) cb(read()); };
    window.addEventListener('storage', storageHandler);
    return () => {
        window.removeEventListener(EVT, handler);
        window.removeEventListener('storage', storageHandler);
    };
}
