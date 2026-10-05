import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// iOS App 打包版以 file:// 載入時，把所有 JS/CSS inline 進單一 index.html，
// 徹底避免 file:// 下跨檔 ES module import 被擋而白屏。只在 BUILD_TARGET=ios 啟用。
import { viteSingleFile } from 'vite-plugin-singlefile'

const IS_IOS = process.env.BUILD_TARGET === 'ios'

// Plugin to force charset=utf-8 on all JS/JSX files to prevent iOS Safari encoding fallback
const charsetPlugin = () => ({
  name: 'force-charset',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const originalSetHeader = res.setHeader;
      res.setHeader = function (name, value) {
        if (name.toLowerCase() === 'content-type' && typeof value === 'string') {
          if (value.includes('javascript') || value.includes('json') || value.includes('text/')) {
            if (!value.includes('charset')) {
              value += '; charset=utf-8';
            }
          }
        }
        return originalSetHeader.call(this, name, value);
      };
      next();
    });
  }
});

export default defineConfig({
  plugins: [react(), charsetPlugin(), ...(IS_IOS ? [viteSingleFile()] : [])],
  base: './',
  // 🛡️ 修復 "useNavigate() may be used only in the context of a <Router>"：
  // 強制 react / react-dom / react-router(-dom) 全專案只解析到「同一份」module 實例，
  // 並要求 dev 預打包時把 router 核心與 dom 綁在一起 prebundle，
  // 避免 context provider 與 hook 落在不同實例（常見於專案資料夾被複製、.vite 快取殘留時）。
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react-router', 'react-router-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5179,
    strictPort: false,
    /* 🩹 改用輪詢監看檔案。
       這個專案資料夾會被外部工具（Claude 的橋接）寫入，那種寫入不一定會
       觸發 macOS 的 FSEvents —— 結果是檔案在硬碟上已經改了，vite 卻沒被叫醒，
       瀏覽器一直拿到記憶體裡那份舊的，看起來就像「改了沒效」。
       輪詢比較吃一點 CPU，但只影響開發模式，build 完全不受影響。 */
    watch: { usePolling: true, interval: 300 },
    hmr: {
      protocol: 'ws',
      // 不寫死 port，讓 HMR 自動跟隨 server 實際使用的 port
    }
  },
  build: {
    // 提高單檔警告門檻（大型 component 會被 split，不用警告）
    chunkSizeWarningLimit: 600,
    // 🔴 Fix(console-leak): Production build 移除 console.log/warn/info/debug，
    // 但「保留 console.error」——讓正式環境的真實錯誤仍能被使用者回報/監控工具捕捉。
    // 開發環境 (npm run dev) 不受影響，所有 log 照常顯示，方便除錯。
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,  // 不全清，改用 pure_funcs 精準移除（保留 console.error）
        drop_debugger: true,  // 移除 debugger 斷點
        pure_funcs: ['console.log', 'console.warn', 'console.info', 'console.debug'],
      },
    },
    // Let Rollup follow the dependency graph. Forcing all remaining libraries
    // into a shared vendor chunk produced cycles with charts/data and a runtime
    // "is not a function" during production startup. Dynamic page imports still
    // split normally; the iOS single-file plugin inlines its build as before.
  }
})

// iOS 打包：BUILD_TARGET=ios npm run build；viteSingleFile 負責內嵌資源。
