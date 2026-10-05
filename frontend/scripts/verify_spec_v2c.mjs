// 🧪 E1–E3 瑞士大膽極簡 UI — 驗收「設計規則是否真的被遵守」
//   純視覺無法自動截圖比對，但「規則」可以驗：
//   字級只有 5 階、一頁一個 Coral、髮絲線取代圓角卡、8pt 網格。
//   npx esbuild scripts/verify_spec_v2c.mjs --bundle --platform=node --format=cjs --outfile=/tmp/s4.cjs && node /tmp/s4.cjs
import fs from 'node:fs';
import path from 'node:path';
import { SWISS, TYPE, displaySize, hairlineRow, indexNumber, textCTA } from '../src/utils/swissUI.js';

let pass = 0, fail = 0;
const ok = (n, c, e = '') => {
    if (c) { pass++; console.log(`  ✅ ${n}`); }
    else { fail++; console.log(`  ❌ ${n} ${e}`); }
};

const SRC = path.resolve(process.cwd(), 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

console.log('\n── E2. 字級階梯：只有 5 階 ──');
const steps = Object.keys(TYPE);
ok('恰好 5 階', steps.length === 5, steps.join(','));
ok('階名正確', ['display', 'title', 'body', 'label', 'micro'].every((k) => steps.includes(k)));
ok('Display 44 / weight 300', TYPE.display.fontSize === 44 && TYPE.display.fontWeight === 300);
ok('Title 26 / weight 400', TYPE.title.fontSize === 26 && TYPE.title.fontWeight === 400);
ok('Body 15 / weight 500', TYPE.body.fontSize === 15 && TYPE.body.fontWeight === 500);
ok('Label 11 / tracking 0.18em', TYPE.label.fontSize === 11 && TYPE.label.letterSpacing === '0.18em');
ok('Micro 9 / tracking 0.28em', TYPE.micro.fontSize === 9 && TYPE.micro.letterSpacing === '0.28em');
ok('對比極端：Display 是 Micro 的 4.8 倍以上',
    TYPE.display.fontSize / TYPE.micro.fontSize >= 4.8,
    String(TYPE.display.fontSize / TYPE.micro.fontSize));

console.log('\n── E2. 8pt 網格與髮絲線 ──');
ok('頁面 padding 24', SWISS.pagePadding === 24);
ok('區塊間距 32', SWISS.sectionGap === 32);
ok('髮絲線是 1px', /^1px solid/.test(SWISS.hairline), SWISS.hairline);
ok('清單列上下 padding 16（8 的倍數）',
    hairlineRow(false).paddingTop === 16 && hairlineRow(false).paddingBottom === 16);
ok('最後一列不畫底線', hairlineRow(true).borderBottom === 'none');
ok('非最後一列畫髮絲線', hairlineRow(false).borderBottom === SWISS.hairline);

console.log('\n── E2. 色票只有四個 + 一個 Coral ──');
const colorKeys = Object.keys(SWISS).filter((k) => /^(paper|ink|stone|coral)$/.test(k));
ok('色票恰好 4 個', colorKeys.length === 4, colorKeys.join(','));
ok('Coral = #F95C4B', SWISS.coral === '#F95C4B');
ok('Paper = #F6F4F1', SWISS.paper === '#F6F4F1');
ok('編號用低對比灰（不佔色彩預算）', /rgba\(22,20,21,0\.28\)/.test(indexNumber.color), indexNumber.color);
ok('文字 CTA 預設不是 Coral（把 Coral 留給焦點）',
    textCTA(false).color !== SWISS.coral, textCTA(false).color);
ok('需要時才給 Coral', textCTA(true).color === SWISS.coral);

console.log('\n── E2. 大膽：長字自動降階但不失控 ──');
ok('5 字以內用滿 44', displaySize('10.22') === 44);
ok('7 字降到 32（1:06:39 不撐破）', displaySize('1:06:39') === 32);
ok('降階有下限，不會縮成小字', displaySize('123456789012') >= 26, String(displaySize('123456789012')));

console.log('\n── E3. 逐頁：裝飾性元素是否真的被移除 ──');

const checkin = read('components/DailyCheckinPanel.jsx');
ok('圖五：移除時段漸層背景照片（改 Paper 底）',
    /background: SWISS\.paper/.test(checkin) && !/background: A\.bg/.test(checkin));
ok('圖五：移除呼吸光暈裝飾', !/呼吸縮放/.test(checkin));
ok('圖五：改用髮絲線清單', /hairlineList/.test(checkin) && /hairlineRow/.test(checkin));
ok('圖五：清單有左側編號', /indexNumber/.test(checkin));
ok('圖五：CTA 改文字型（不是三顆 Coral 膠囊）',
    /textCTA/.test(checkin) && !/boxShadow: '0 6px 16px -4px rgba\(249,92,75/.test(checkin));
ok('圖五：不再用 glassCardStyle 包每一列',
    !/\.\.\.glassCardStyle\(it\.done\)/.test(checkin));

const editor = read('components/CardioPlanEditor.jsx');
ok('圖一：課表列不再是圓角玻璃卡',
    !/className="rounded-\[18px\] p-4 relative overflow-hidden"/.test(editor));
ok('圖一：改用髮絲線分隔', /borderBottom: SWISS\.hairline/.test(editor));
ok('圖一：有左側編號', /indexNumber/.test(editor));
ok('圖一：里程數字升到 Display 階', /\.\.\.TYPE\.display, fontSize: 38/.test(editor));
ok('圖一：chip 不再用底色方塊', !/background: chip\.bg/.test(editor));

const builder = read('components/CardioPlanBuilder.jsx');
ok('圖二：週數不再是 6 個圓角方塊',
    !/className="h-14 rounded-\[18px\] flex items-center justify-center relative overflow-hidden/.test(builder));
ok('圖二：改髮絲線單列', /borderTop: SWISS\.hairline, borderBottom: SWISS\.hairline/.test(builder));
ok('圖二：選中放大到 34、未選 17（極端對比）',
    /fontSize: active \? 34 : 17/.test(builder));

const settle = read('components/WeekSettlementSheet.jsx');
ok('圖三：背景改 Paper（不用 radial 漸層）',
    /background: SWISS\.paper/.test(settle) && !/radial-gradient\(120% 70%/.test(settle));
ok('圖三：肯定文案升到 Display 階', /\.\.\.TYPE\.display, fontSize: 38/.test(settle));
ok('圖三：沒有訓練紀錄時整塊評分不出現', /\{hasRecord && \(/.test(settle));
ok('圖三：評語列改髮絲線（不是深色圓角卡）',
    !/rounded-\[24px\] p-5 mb-2 relative z-10 flex items-center justify-between/.test(settle));

console.log(`\n═══ 結果：${pass} 通過 / ${fail} 失敗 ═══\n`);
if (fail > 0) process.exit(1);
