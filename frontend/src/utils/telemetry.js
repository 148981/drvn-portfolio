/**
 * telemetry.js — 自建觀測性（前端側）
 * ====================================================================
 * 目標：上市後能回答「有沒有人當機」「漏斗掉在哪」「D1/D7 有多少人回來」。
 *
 * 設計：
 *   - track(name, props)：記一筆事件到記憶體佇列
 *   - 全域錯誤攔截：window.onerror + unhandledrejection → type:'error'
 *   - 批次上報：每 30 秒 / 佇列滿 20 筆 / 切到背景時 flush
 *   - 完全 fire-and-forget：任何失敗都吞掉，絕不影響 UI
 *   - 上報失敗 → 留在 localStorage 緩衝（上限 100 筆），下次啟動重送
 *
 * 核心漏斗事件（在對應位置呼叫 track）：
 *   app_open / onboarding_completed / workout_completed / cardio_completed
 *   season_continued / plan_created / notif_perm_granted / notif_perm_denied
 */
import apiClient from '../api/client';

const BUFFER_KEY = 'drvn:telemetryBuffer';
const FLUSH_INTERVAL = 30 * 1000;
const FLUSH_AT = 20;
const BUFFER_CAP = 100;

let _queue = [];
let _userId = null;
let _started = false;
let _timer = null;

function loadBuffer() {
  try { return JSON.parse(localStorage.getItem(BUFFER_KEY)) || []; } catch { return []; }
}
function saveBuffer(arr) {
  try { localStorage.setItem(BUFFER_KEY, JSON.stringify(arr.slice(-BUFFER_CAP))); } catch { /* ignore */ }
}

/** 記一筆事件（隨處可呼叫，init 前呼叫也安全）。 */
export function track(name, props = null, type = 'event') {
  try {
    if (!name) return;
    _queue.push({ name: String(name).slice(0, 64), props, type, ts: Date.now() });
    if (_queue.length >= FLUSH_AT) flush();
  } catch { /* ignore */ }
}

/** 記一筆錯誤。 */
export function trackError(name, props = null) {
  track(name, props, 'error');
}

export async function flush() {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, FLUSH_AT * 2);
  try {
    await apiClient.post('/api/telemetry/events', {
      user_id: _userId,
      events: batch,
    });
  } catch {
    // 上報失敗 → 存 localStorage，下次啟動重送
    saveBuffer([...loadBuffer(), ...batch]);
  }
}

async function resendBuffered() {
  const buffered = loadBuffer();
  if (buffered.length === 0) return;
  try {
    await apiClient.post('/api/telemetry/events', { user_id: _userId, events: buffered.slice(0, 50) });
    saveBuffer(buffered.slice(50));
  } catch { /* 下次再試 */ }
}

/** App 啟動時呼叫一次（App.jsx）。重複呼叫無害。 */
export function initTelemetry(userId) {
  if (_started) return;
  _started = true;
  _userId = userId || null;

  // 1) 全域錯誤攔截（當機可見性）
  try {
    window.addEventListener('error', (e) => {
      trackError('js_error', {
        message: String(e?.message || '').slice(0, 300),
        source: String(e?.filename || '').slice(0, 200),
        line: e?.lineno,
        stack: String(e?.error?.stack || '').slice(0, 500),
        path: window.location?.hash || '',
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      trackError('unhandled_rejection', {
        reason: String(e?.reason?.message || e?.reason || '').slice(0, 300),
        stack: String(e?.reason?.stack || '').slice(0, 500),
        path: window.location?.hash || '',
      });
    });
  } catch { /* ignore */ }

  // 2) app_open（D1/D7 回訪的原料：後端以 user_id + 日期去重即可算留存）
  track('app_open', { path: window.location?.hash || '' });

  // 3) 排程 flush
  _timer = setInterval(flush, FLUSH_INTERVAL);
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  } catch { /* ignore */ }

  // 4) 啟動後重送上次失敗的
  setTimeout(resendBuffered, 12000);
}

export function stopTelemetry() {
  _started = false;
  if (_timer) { clearInterval(_timer); _timer = null; }
}
