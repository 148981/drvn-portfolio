/**
 * cloudSync.js — localStorage 資料的雲端備份/還原（offline-first）
 * ================================================================
 * 原則：localStorage 永遠是主來源；雲端只做 best-effort 備份與「換機還原」。
 * 所有呼叫都包 try/catch、失敗回 false/null，絕不擋 UI。
 */
import apiClient from '../api/client';
import { getUserId } from './auth';

// ── P5：失敗重試佇列 ─────────────────────────────────────────────
// pushBlob 失敗（離線 / 401 / 後端睡眠）時，把 key 記入佇列；
// 下次 flushCloudQueue() 時讀「當下最新的本地值」重送（不存資料本身，避免佔用配額）。
const QUEUE_KEY = 'drvn:cloudSyncQueue';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, 50))); } catch { /* ignore */ }
}
function enqueue(cloudKey, storageKey) {
  const q = readQueue();
  if (!q.some(item => item.cloudKey === cloudKey)) {
    q.push({ cloudKey, storageKey, ts: Date.now() });
    writeQueue(q);
  }
}

/**
 * 重送佇列中的備份。應在 app 啟動 / 恢復連線時呼叫。
 * @returns {Promise<number>} 成功重送的筆數
 */
export async function flushCloudQueue() {
  const q = readQueue();
  if (q.length === 0) return 0;
  let ok = 0;
  const remain = [];
  for (const item of q) {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(item.storageKey)); } catch { /* ignore */ }
    if (data === null || data === undefined) continue; // 本地已無資料 → 放棄
    const success = await pushBlob(item.cloudKey, data, { noQueue: true });
    if (success) ok++;
    else remain.push(item);
  }
  writeQueue(remain);
  return ok;
}

/**
 * 把資料推上雲端（trainingRecords / workout_history 由後端做合併，其餘覆寫）。
 * fire-and-forget 用。失敗時若提供 storageKey 會進入重試佇列。
 * @param {string} key      雲端 key（白名單內）
 * @param {*}      data     資料
 * @param {object} [opts]   { storageKey?: string, noQueue?: boolean }
 */
export async function pushBlob(key, data, opts = {}) {
  try {
    const uid = getUserId();
    if (!uid) return false;
    await apiClient.post(`/api/userdata/${uid}/${key}`, { data });
    return true;
  } catch {
    if (!opts.noQueue && opts.storageKey) enqueue(key, opts.storageKey);
    return false;
  }
}

/** 從雲端取回資料；沒有或失敗回 null。 */
export async function pullBlob(key) {
  try {
    const uid = getUserId();
    if (!uid) return null;
    const res = await apiClient.get(`/api/userdata/${uid}/${key}`);
    return res?.data?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 換機還原：當本地該 key 為空、雲端有資料時，把雲端寫回 localStorage。
 * 不覆蓋已有的本地資料（避免蓋掉離線編輯）。回傳是否有套用雲端資料。
 * @param {string} storageKey  localStorage key
 * @param {string} cloudKey    雲端 key（白名單內）
 * @param {(arr:any)=>boolean} isEmpty  判斷本地是否視為空
 */
export async function hydrateIfLocalEmpty(storageKey, cloudKey, isEmpty) {
  try {
    let localRaw = null;
    try { localRaw = localStorage.getItem(storageKey); } catch { /* ignore */ }
    let localVal = null;
    try { localVal = localRaw ? JSON.parse(localRaw) : null; } catch { localVal = null; }

    const localEmpty = isEmpty ? isEmpty(localVal) : (!localVal || (Array.isArray(localVal) && localVal.length === 0));
    if (!localEmpty) return false; // 本地有資料 → 不動

    const cloud = await pullBlob(cloudKey);
    const cloudHas = Array.isArray(cloud) ? cloud.length > 0 : !!cloud;
    if (!cloudHas) return false;

    localStorage.setItem(storageKey, JSON.stringify(cloud));
    return true;
  } catch {
    return false;
  }
}
