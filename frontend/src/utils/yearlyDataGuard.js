/**
 * yearlyDataGuard.js — 一年資料資產守護（P1/P2 修復）
 * ====================================================================
 * 問題：trainingRecords、workout_history、currentPlan、season、
 *       completed_workouts、userProfile 全部只活在 localStorage，
 *       換機 / 重灌 / iOS 清 WKWebView 快取 = 一年紀錄歸零。
 *
 * 策略（offline-first 不變）：
 *   1. backupNow()：把關鍵 key 打包推上 /api/userdata（後端對
 *      trainingRecords / workout_history 做「合併」，被本地裁剪掉的
 *      舊紀錄仍保留在雲端）。
 *   2. restoreIfEmpty()：登入 / 換機後，本地為空的 key 從雲端還原。
 *   3. startGuard()：app 啟動後自動排程 — 啟動 8 秒後備份一次、
 *      每 30 分鐘備份、切到背景（visibilitychange hidden）時備份，
 *      並先 flush 失敗重試佇列。
 *
 * 所有操作 best-effort，絕不擋 UI、絕不覆蓋本地既有資料。
 */
import { pushBlob, pullBlob, flushCloudQueue } from './cloudSync';
import { uRawKey } from './userStorage';

// ── key 對照：cloudKey → 取得本地值 / 寫回本地 ─────────────────────
function keyMap(uid) {
  const raw = (k) => `${k}_${uid}`;
  return [
    {
      cloudKey: 'trainingRecords',
      storageKey: uRawKey(uid, 'trainingRecords'),
      isEmpty: (v) => !v || Object.keys(v).length === 0,
    },
    {
      cloudKey: 'workout_history',
      storageKey: uRawKey(uid, 'workout_history'),
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    },
    {
      cloudKey: 'currentPlan',
      storageKey: raw('currentPlan'),
      isEmpty: (v) => !v,
    },
    {
      cloudKey: 'season',
      storageKey: raw('season'),
      isEmpty: (v) => !v,
    },
    {
      cloudKey: 'userProfile',
      storageKey: 'userProfile',
      isEmpty: (v) => !v || Object.keys(v).length === 0,
    },
    {
      // week1-4 完成狀態合併為一份 blob
      cloudKey: 'completed_workouts',
      composite: true,
      read: () => {
        const out = {};
        for (let w = 1; w <= 4; w++) {
          try {
            const raw2 = localStorage.getItem(`completed_workouts_${uid}_week${w}`);
            if (raw2) out[`week${w}`] = JSON.parse(raw2);
          } catch { /* ignore */ }
        }
        return out;
      },
      write: (data) => {
        if (!data || typeof data !== 'object') return;
        for (let w = 1; w <= 4; w++) {
          const v = data[`week${w}`];
          if (v !== undefined && localStorage.getItem(`completed_workouts_${uid}_week${w}`) === null) {
            try { localStorage.setItem(`completed_workouts_${uid}_week${w}`, JSON.stringify(v)); } catch { /* ignore */ }
          }
        }
      },
      isEmpty: (v) => !v || Object.keys(v).length === 0,
    },
  ];
}

function readLocal(entry) {
  if (entry.composite) return entry.read();
  try {
    const raw = localStorage.getItem(entry.storageKey);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; } // season 可能是純字串數字
  } catch { return null; }
}

/** 立即備份所有關鍵 key（best-effort，逐 key 獨立失敗）。 */
export async function backupNow(userId) {
  if (!userId) return 0;
  let ok = 0;
  for (const entry of keyMap(userId)) {
    const val = readLocal(entry);
    if (val === null || val === undefined || entry.isEmpty(val)) continue;
    const success = await pushBlob(entry.cloudKey, val, {
      storageKey: entry.composite ? undefined : entry.storageKey,
    });
    if (success) ok++;
  }
  return ok;
}

/** 換機還原：只在本地為空時套用雲端資料，絕不覆蓋本地。 */
export async function restoreIfEmpty(userId) {
  if (!userId) return 0;
  let restored = 0;
  for (const entry of keyMap(userId)) {
    const local = readLocal(entry);
    if (!entry.isEmpty(local)) continue; // 本地有資料 → 不動
    const cloud = await pullBlob(entry.cloudKey);
    if (cloud === null || cloud === undefined || entry.isEmpty(cloud)) continue;
    try {
      if (entry.composite) entry.write(cloud);
      else localStorage.setItem(entry.storageKey, typeof cloud === 'string' ? cloud : JSON.stringify(cloud));
      restored++;
    } catch { /* quota 等問題不擋流程 */ }
  }
  if (restored > 0) console.log(`[yearlyDataGuard] 換機還原完成：${restored} 個 key`);
  return restored;
}

// ── 自動排程 ────────────────────────────────────────────────────────
let _started = false;
let _intervalId = null;

/**
 * 啟動守護：app 進入主畫面後呼叫一次（重複呼叫無害）。
 * @param {string} userId
 */
export function startGuard(userId) {
  if (_started || !userId) return;
  _started = true;

  // 1) 啟動後：JWT 滑動續期 → 還原（換機情境）→ flush 重試佇列 → 首次備份
  setTimeout(async () => {
    try {
      const { maybeRefreshToken } = await import('./auth');
      await maybeRefreshToken();
    } catch { /* ignore */ }
    try {
      await restoreIfEmpty(userId);
      await flushCloudQueue();
      await backupNow(userId);
    } catch { /* ignore */ }
  }, 8000);

  // 2) 週期備份：每 30 分鐘
  _intervalId = setInterval(() => { backupNow(userId); }, 30 * 60 * 1000);

  // 3) 切到背景時備份（使用者關 app 前最後機會）
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') backupNow(userId);
    });
  } catch { /* SSR / 非瀏覽器環境 */ }
}

export function stopGuard() {
  _started = false;
  if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
}
