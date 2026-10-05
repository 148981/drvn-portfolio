// 🔧 必須是第一個 import：打包版(file://)時把空 host 的 API 請求改寫到正式後端。
//    import 即自動安裝攔截，確保在任何 API 請求發出前生效。
import './utils/apiHostFix'

// 🔐 資安稽核 Step 2：後端加上全域身分攔截後，raw fetch() 也必須帶 JWT。
//    必須緊接在 apiHostFix 之後 —— 先補 Authorization 再交給它改寫網址。
import './utils/apiAuthHeader'

// 🩹 帳號隔離：必須在任何元件讀 localStorage 之前跑（換帳號時歸檔/還原全域 key）
import { syncUserScope } from './utils/userScopedStorage'
syncUserScope()

// 🩹 訪客保護：只有「使用者已明確選擇以訪客身分繼續」時才背景換匿名 JWT。
//    ⚠️ 不能無條件呼叫 —— 那會在使用者還沒看過登入頁時就幫他建立身分。
import { ensureGuestToken } from './utils/guestAuth'
ensureGuestToken()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { SWRConfig } from 'swr'
import './index.css'
import App from './App.jsx'
import { EventBusProvider } from './contexts/EventBusContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { registerServiceWorker } from './utils/serviceWorkerRegistration';
import { globalSWRConfig } from './lib/swrConfig.js'
import { installGlobalHaptics } from './utils/globalHaptics';
import { confirmDialog } from './utils/toast';

// 🎛️ 全域 haptic — 一次掛上，所有 <button>/[role=button]/<a>/range/checkbox/radio
//    自動會在手機上振動。元件層的 hapticTap() 仍保留，雙保險。
installGlobalHaptics();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SWRConfig value={globalSWRConfig}>
      <HashRouter>
        <MotionConfig reducedMotion="user">
          <LanguageProvider>
            <EventBusProvider>
              <App />
            </EventBusProvider>
          </LanguageProvider>
        </MotionConfig>
      </HashRouter>
    </SWRConfig>
  </StrictMode>,
)

// 🔥 註冊 Service Worker
//    更新問題已修正：sw.js 改為「導航/HTML 網路優先」，連線時永遠拿到最新版殼，
//    僅 hash 命名的不可變資源走快取優先；離線時才退回快取與 offline.html。
//
// ⚠️ 僅在 production build 註冊 SW。
//    開發模式 (npm run dev) 下，SW 會快取舊的 hashed chunk，當專案資料夾被複製
//    或 dev port 改變時，瀏覽器會同時載入「SW 快取的舊 React」與「Vite 提供的新 React」，
//    導致 "Invalid hook call / more than one copy of React" 與路由失效（點擊不更新畫面）。
//    因此 dev 模式改為主動「反註冊既有 SW 並清空快取」，確保永遠拿到最新模組。
if (import.meta.env.PROD) {
  registerServiceWorker();
} else if ('serviceWorker' in navigator) {
  // Dev：清掉任何殘留的 SW 與其快取，避免舊 chunk 造成 React/Router 雙實例
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

// 🔥 監聽 Service Worker 更新
window.addEventListener('swUpdate', async (event) => {
  console.log('✨ New app version available!');

  const shouldUpdate = await confirmDialog('有新版本可用，是否立即更新？', { confirmText: '更新' });
  if (shouldUpdate) {
    /* sw.js 在 install 就 skipWaiting()：使用者按「更新」時新版多半已經接手，
       registration.waiting 是 null —— 原本直接 .postMessage 會 throw，按了沒反應。
       還在等待 → 叫它接手、接手後重載；已經接手 → 直接重載拿新版殼。 */
    const waiting = event.detail?.registration?.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }
});

// 🔥 監聽同步完成
window.addEventListener('syncComplete', (event) => {
  console.log('✅ Background sync completed:', event.detail);
});

/* 🗑️ 已移除「TEMPORARY WIPE FOR USER」：開發期一次性清資料的程式，
   會把所有含 'u_' 的 key 刪掉（u_<uid>_onboarding_plan、u_<uid>_run_day_overrides…）。
   上架後每一個從舊版升級、還沒跑過它的使用者，第一次開新版就會丟掉本機計劃。 */
