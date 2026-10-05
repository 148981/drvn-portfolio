// featureFlags.js — V1 上架功能開關（單一事實來源）
// ─────────────────────────────────────────────────────────────────
// 依《DRVN_FinalReviewBoard_審查報告_20260709》的取捨：
// V1 縮小面積、集中 QA；要恢復任一功能 → 把對應 flag 改回 true 即可（一行）。
//
// 使用方式：
//   import { FLAGS } from '../config/featureFlags';
//   {FLAGS.arAnalysis && <Route ... />}
//   {FLAGS.arAnalysis && <ARButton ... />}
//
// 注意：關閉的路由一律 redirect 回 /mobile-home（App.jsx 統一處理），
// 舊連結 / 通知深連結不會 404。

export const FLAGS = {
    // ── V1 延後（審查報告 §E）──
    arAnalysis: true,       // AR 動作回放（ar / ar-mobile）—— 結算頁「AR·疊合回放」按鈕
    poseAnalyzer: false,    // 邊緣運算姿態分析（pose-analyzer）
    segmentExplorer: false, // 路段探索（segment-explorer-mobile）

    // ── V1 保留（與核心流程深度綁定，勿關）──
    gearGarage: true,       // 裝備庫：跑鞋里程與 CardioTracker 綁定，關掉會斷跑步流程

    // ── 會員付費牆 ──
    // App 內購（StoreKit）上線前保持 false：伺服器還拿不到會員資料時，
    // 預設所有人都能用會員功能，行為跟現在一樣。真正的判斷以後端
    // /api/membership/me 為準（後端也有同名開關 MEMBERSHIP_GATE_ENABLED）。
    membershipGate: false,

    // ── 開發工具（只在 dev build 出現，正式版自動消失）──
    devTools: import.meta.env.DEV, // login-settings-mobile（User ID 切換器）等
};

export default FLAGS;
