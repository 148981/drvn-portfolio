// sync_legal.mjs — 法律文件只改 frontend/src/data/legalDocs.json，這支把它複製到 backend/legal_docs.json
// （Railway 只部署 backend/，後端公開頁 /legal/* 讀那份複本）。
import fs from 'node:fs';
const src = 'src/data/legalDocs.json';
const dst = '../backend/legal_docs.json';
fs.copyFileSync(src, dst);
console.log(`✓ 已同步 ${src} → ${dst}`);
