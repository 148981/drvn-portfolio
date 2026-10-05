// ============================================================================
// fix-ios-paths.mjs — iOS 打包版(file://)路徑修正
// ----------------------------------------------------------------------------
// 問題：前端許多圖片 / 資源寫成絕對路徑（開頭斜線），例如
//   src="/desktop/x.png"、url('/images/y.png')、"/download/z.png"
// 在瀏覽器(http://)下正常，但 iOS App 以 file:// 載入時，開頭斜線會被
// 解析成「檔案系統根目錄」(file:///desktop/...) → 找不到 → 所有圖片破圖。
//
// 解法：把 build 出來的 index.html 裡，指向「本地資源資料夾」的絕對路徑
//   開頭斜線移除，改成相對路徑（相對於 index.html 所在的 dist/）。
//   只處理我們自己打包的資源資料夾，避免動到 http(s):// 等外部網址。
//
// 用法（已接進 npm run build:ios）：node scripts/fix-ios-paths.mjs
// ============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const indexPath = join(DIST, 'index.html');

if (!existsSync(indexPath)) {
  console.error('[fix-ios-paths] 找不到', indexPath, '— 請先 build');
  process.exit(1);
}

// 自動偵測 dist 底下的「資源資料夾」（這些就是會被絕對路徑引用的對象）
const resourceDirs = readdirSync(DIST, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  // assets 是 vite 自己的輸出，相對路徑已正確（./assets），不需處理
  .filter((name) => name !== 'assets');

let html = readFileSync(indexPath, 'utf8');
let totalReplaced = 0;

for (const dir of resourceDirs) {
  // 把  "/dir/...   '/dir/...   (/dir/...   =/dir/...  等開頭斜線去掉 → 變相對
  // 用前置字元分組，避免誤改到 http://host/dir 這種（前面是字母不會被選中）
  const re = new RegExp(`([("'\\s=])\\/(${dir}\\/)`, 'g');
  const before = html;
  html = html.replace(re, `$1$2`);
  const count = (before.match(re) || []).length;
  if (count > 0) {
    totalReplaced += count;
    console.log(`[fix-ios-paths] /${dir}/ → ${dir}/  共 ${count} 處`);
  }
}

writeFileSync(indexPath, html, 'utf8');
console.log(`[fix-ios-paths] ✅ 完成，共修正 ${totalReplaced} 處絕對路徑（資料夾：${resourceDirs.join(', ')})`);
