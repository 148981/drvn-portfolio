import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Upload, Play, Download, CheckCircle2, XCircle, Loader, FolderOpen } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import axios from 'axios';

/**
 * 測試模式 · 本機研究工具（批次）
 * ──────────────────────────────────────────────────────────
 * 20 個定義好的上傳點 → 一鍵「開始分析」（總進度 + 每支分析進度）→ UI 直接出圖。
 *
 * 【v2 精簡版 2026-07】原本 26 支 × 8 下 = 208 下，受試者做不完、分析也太久。
 *   依「每張圖真正需要的最小樣本」重算：模板是把所有 reps 池化後做 DBA，
 *   所以建模看的是「總下數」不是「影片數」→ 4 支×8 下砍成 2 支×6 下（12 reps 已足夠收斂）；
 *   重測一致性 SD 需要 n≥3 takes → 有經驗側面維持 3 支（不可再砍）；
 *   刻意錯影片不計入計次正確率（actual_reps=null）→ 次數可自由降到 4 下；
 *   結果：36 支（每個動作 18 支 × 2 個機位配對），S1–S7 每張圖的樣本數都在。
 * 打「本機後端」(localhost:8000, research_server) 跑，不碰雲端、不動上面兩張卡。
 * 用 start_local.command 一鍵啟動後端+前端。
 */
const CORAL = '#E1613F', TEAL = '#3A7CA5', GRAY = '#9AA0A6', GREEN = '#5B9A6B', AMBER = '#D9A441', PURP = '#7C6BAF';
const EXS = [{ key: 'squat', zh: '深蹲' }, { key: 'bench_press', zh: '臥推' }];
// ── 每支影片的明確拍攝規格（可重現）──
// mainName/subName = 這個動作的「主機位 / 對照機位」中文名（會直接印在卡片上）
// sideMode        = 送給後端的 is_side_view。⚠️ 這個旗標不是「機位名稱」而是
//                   「近側肢體會不會擋住遠側」的宣告，它會做兩件事：
//                     (1) 把 front_only_metrics（深蹲＝膝內塌 Knee Valgus）權重歸零
//                     (2) 把可見度門檻放寬成 body .45 / joint .35
//                   深蹲改成從背後拍之後，兩條腿都是真的看得到、沒有遠側幻覺點位，
//                   所以 sideMode=false：膝內塌照常計分（刻意錯 A 才抓得到），
//                   門檻也維持 .60/.65 —— 跟建模端用的門檻一致。
// 【v5.3】A/B 兩個機位是**要被比較的兩個候選**，不是「主要 + 附屬」。
//   產品上線只會有一台鏡頭，所以這次實驗的核心問題就是「哪一個角度最好」。
//   選這兩個候選的理由：它們各自代表一個解剖平面，涵蓋不同的錯誤模式。
const SPEC = {
  squat: {
    sideMode: false,
    // 【v5.3】主機位由「斜前方 45°」改成「正側面 90°」。
    //   45° 是想同時看兩個平面的折衷，但實測兩邊都沒看好：
    //     · 遠側（左）腿被軀幹擋住 → L Knee 整段只有 165.9°–178.1°（動態範圍 12°），
    //       而同一下的 R Knee 是 94.5°–170.6°（範圍 76°）——左膝從頭到尾沒彎過
    //     · 矢狀面指標（蹲深、軀幹前傾）被 cos45°≈0.71 壓縮
    //   可交付率試算：正側面 90° = 70%、斜前方 45° = 51%、正面 0° = 42%。
    //   深蹲權重最重的 Hip Depth(0.32) + Torso Lean(0.28) 都是矢狀面 → 正側面最划算。
    // 【v6.4】取景要求的措辭修正。
    //   實查 multi_exercise.py：深蹲七個指標只用到 肩(11,12)、髖(23,24)、
    //   膝(25,26)、踝(27,28)，腳掌點位 29–32 完全沒被引用。
    //   但踝離腳底只有 6–8 cm（全身高度的 <5%），所以「只要到腳踝」
    //   實務上等於「全身入鏡」—— 別把它講成放寬，會誤導現場取景。
    //   真正要強調的是**動作最低點**：站直時全身都在、蹲到底髖部掉出
    //   下緣，是最常見的失敗。平均取景率 95% 看起來很漂亮，
    //   但被裁掉的那幾幀正是 Hip Depth 唯一有資訊的地方。
    mainName: '正側面 90°', subName: '正面 0°', natName: '自選機位',
    sideAngle: '正側面 90°（鏡頭約髖高、不要俯拍、距 2.5–3 m、全身入鏡，蹲到最低點也不出框）',
    frontAngle: '正面 0°（鏡頭正對、約髖高、距 2.5–3 m、全身入鏡，蹲到最低點也不出框）',
    natAngle: '受測者自己找位置（唯一要求：全身入鏡、蹲到最低點也不出框。'
            + '不要量角度、不要參考上面兩個機位，就照平常會怎麼架手機就怎麼架）',
    // 兩支刻意錯各做「一種」錯誤，而且**兩個機位都要拍**，
    // 才能回答「這個錯誤是抓不到，還是這個機位抓不到」。
    // A（深度不足）＝矢狀面錯誤 → 預期正側面抓得到
    // B（膝蓋內夾）＝額狀面錯誤 → 預期只有正面抓得到
    bad: ['刻意犯錯 A：只蹲到 1/4、不到平行（深度不足）', '刻意犯錯 B：全程膝蓋內夾（knee valgus）'],
  },
  bench_press: {
    sideMode: false,
    // 正側面 90°：矢狀面（肘角幅度、槓下放深度）最準。
    //   實測近側手臂在槓到胸時肘角 92.0°，離解剖標準 90° 只差 2.0°；
    //   遠側手臂讀到 109.8°（差 19.8°）是幻覺點位 → 已由 bilateral_pairs 自動收斂成單側。
    // 正上方俯視：額狀面（握距、肘外展）唯一測得到的機位。
    //   實測正側面量到的握距是 2.5–3.0 倍肩寬，解剖上不可能（典型 1.5–2.0），
    //   因為腕距與肩距都被透視壓縮 —— 那是 z 雜訊不是握距。
    mainName: '正側面 90°', subName: '正上方俯視', natName: '自選機位',
    sideAngle: '正側面 90°（鏡頭與胸口同高、務必放低不要俯拍、頭到髖入鏡）',
    frontAngle: '正上方俯視（鏡頭在正上方往下拍，看握距與肘外展）',
    natAngle: '受測者自己找位置（唯一要求：頭到髖入鏡、動作全程不出框。'
            + '不要量角度、不要參考上面兩個機位，就照平常會怎麼架手機就怎麼架）',
    // A、B 兩種錯誤**都是額狀面**，這正是上一批資料臥推完全抓不到的原因：
    //   刻意做 T 字外展，Elbow Flare 只從 56.58° 變成 55.72°（Δ = −0.86°）。
    //   這次兩個機位都拍，就能證明那是機位限制而不是系統失效。
    bad: ['刻意犯錯 A：手臂與軀幹夾角過開（肘外展、接近 T 字）', '刻意犯錯 B：握距過窄（雙手明顯窄於肩）'],
  },
};

// ══════════════════════════════════════════════════════════════════════════
// 【v5.3 實驗設計改版】把「機位」升格成真正的實驗因子
// ══════════════════════════════════════════════════════════════════════════
// 舊設計的三個問題（2026-07-27 兩批資料實測後確認）：
//
//  ① **機位比較做不出來**：對照機位（front）每個動作只有 1 支，而且
//     刻意錯只在主機位拍。兩個機位之間沒有共同的比較基準，
//     「哪個角度比較好」這個問題無法回答。
//
//  ② **沒有對照機位的模板**：不同機位量到的是不同的量（正側面的
//     Elbow Flare 是 z 雜訊、正上方才是真的外展角），數值不可互比。
//     所以每個機位都必須有自己的黃金模板，不能共用。
//
//  ③ **未配對**：同一個動作在兩個機位分開拍，變成獨立樣本，
//     統計力低。**兩台手機同時拍**就變成配對比較，同一次動作、
//     同一個疲勞狀態，差異純粹來自機位——這才乾淨。
//
// 新設計：每個條件都在 A/B 兩個機位各留一格，**同一次動作同時錄兩台**。
// 拍攝次數跟舊版一樣（每個動作 9 次），但影片數變 18 支、資訊量翻倍。
//
//   viewKey = 'A' 主機位、'B' 對照機位。兩者都會各自建模、各自評分。
const ROLES = [
  // 建模：兩個機位各自建自己的模板（不可共用，見上面②）
  { role: 'template', zh: '建模', n: 2, reps: 6, view: 'side',  build: true, group: 'exp', subject: 'p01', quality: 'na',   study: 'TPL' },
  { role: 'template_b', zh: '建模·對照機位', n: 2, reps: 6, view: 'front', build: true, group: 'exp', subject: 'p01', quality: 'na', study: 'TPL' },
  // 標準動作：兩個機位各 3 支 → 機位間可配對比較，也撐得起重測信度
  { role: 'exp_side',  zh: '有經驗·{v}', n: 3, reps: 5, view: 'side',  group: 'exp', subject: 'p01', quality: 'good', study: 'S2' },
  { role: 'exp_front', zh: '有經驗·{v}', n: 3, reps: 5, view: 'front', group: 'exp', subject: 'p01', quality: 'good', study: 'S1' },
  // 刻意錯：**兩個機位都要拍**。這是舊設計最大的缺口——
  //   臥推的兩種刻意錯都是額狀面錯誤，正側面在物理上抓不到，
  //   但因為沒有對照機位的刻意錯，看不出來是機位的問題還是系統的問題。
  { role: 'exp_bad',   zh: '有經驗·{v}·刻意錯', n: 2, reps: 4, view: 'side',  group: 'exp', subject: 'p01', quality: 'bad', study: 'S3' },
  { role: 'exp_bad_b', zh: '有經驗·{v}·刻意錯', n: 2, reps: 4, view: 'front', group: 'exp', subject: 'p01', quality: 'bad', study: 'S3' },
  // 新手：兩個機位各 2 支
  { role: 'nov_side',  zh: '新手·{v}', n: 2, reps: 5, view: 'side',  group: 'nov', subject: 'p02', quality: 'good', study: 'S5' },
  { role: 'nov_front', zh: '新手·{v}', n: 2, reps: 5, view: 'front', group: 'nov', subject: 'p02', quality: 'good', study: 'S5' },
  // ── 【v5.6】C 機位：受測者「自己找」的角度 ────────────────────────────
  //   為什麼要有第三個機位 —— A(90°)、B(0°) 是兩個端點，可以標定「品質隨角度
  //   怎麼衰減」，但真實使用者不會拿量角器站位：他們會自己微調到一個
  //   「全身塞得進畫面、動作全程不出框」的位置，那個角度由場地與器材決定。
  //   固定拍 45° 只是換一個我們規定的角度，一樣不是使用者的真實行為。
  //
  //   所以 C 機位**不指定角度**，由受測者自己架，系統再從骨架反推實際幾度
  //   （measurability.estimate_view_angle）。這樣實驗涵蓋的範圍就明確了：
  //     0° ────────── C（自然選擇，實測幾度算幾度）────────── 90°
  //   結論可以寫成「建議 X°，使用者自然選的 Y° 損失 Z%」，而不是二選一。
  //
  //   C 獨立拍一輪、不與 A/B 配對 —— 配對會破壞它的生態效度（一旦知道旁邊
  //   還架著研究員的機位，就不是「自己找」了）。5 支剛好夠算 D 與 CV。
  //   【v6.3】C 升格為主要實驗組。理由：「哪個機位比較好」是研究員的問題，
  //   使用者不會為了配合演算法搬手機 —— 他們架在一個「全身拍得到、動作不出框」
  //   的位置就期待 App 能用。所以真正要驗證的是「系統能不能在使用者給的機位下
  //   穩定運作」，那需要完整的信度（重測 SD 至少 3 支）與效度（兩種刻意錯）。
  //   A/B 則降格為**邊界驗證組**：證明「抓不到」是機位遮擋、不是演算法失效。
  { role: 'template_c', zh: '建模·{v}', n: 2, reps: 6, view: 'nat', build: true, group: 'exp', subject: 'p01', quality: 'na', study: 'TPL' },
  { role: 'exp_nat',    zh: '有經驗·{v}', n: 3, reps: 5, view: 'nat', group: 'exp', subject: 'p01', quality: 'good', study: 'S6' },
  { role: 'exp_bad_c',  zh: '有經驗·{v}·刻意錯', n: 2, reps: 4, view: 'nat', group: 'exp', subject: 'p01', quality: 'bad', study: 'S6' },
  { role: 'nov_nat',    zh: '新手·{v}', n: 1, reps: 5, view: 'nat', group: 'nov', subject: 'p02', quality: 'good', study: 'S6' },

  // ══════════════════════════════════════════════════════════════════════
  // 【v9.1】補強組 —— 針對前一輪稽核抓到的三個弱點，只補「改變論證強度」的兩項
  // ══════════════════════════════════════════════════════════════════════
  //
  // ── 優先一：角度掃描（S7，深蹲 6 支）─────────────────────────────────
  //   本專題的核心主張是「效度隨相機角度衰減」，但目前只有 5 個角度：
  //       0° · 20.3° · 27.7° · 63.7° · 74.7°
  //   30–64° 之間完全沒有資料 → 容差為什麼取 30° 目前是**推論**，不是量測。
  //   補 40° 與 60° 兩個角度後，這條衰減曲線就有 7 個點、中間不再有洞，
  //   容差可以直接從曲線讀出來。
  //
  //   ⚠️ 關鍵：角度要用**身體朝向**定義，不是房間。實測深7 相機架在房間 90°，
  //      但受測者站的方向讓有效角度只剩 63.7°（差了 26°）。
  //      拍攝時請站定後先確認「肩線與鏡頭的夾角」，不要只量地板。
  //
  //   每個角度需要 2 支標準（算得出組內平均）＋ 1 支刻意膝內夾（算掉分）。
  { role: 'ang40_std', zh: '角度掃描 40°·標準', n: 2, reps: 5, view: 'a40',
    group: 'exp', subject: 'p01', quality: 'good', study: 'S7', onlyEx: 'squat' },
  { role: 'ang40_bad', zh: '角度掃描 40°·刻意膝內夾', n: 1, reps: 4, view: 'a40',
    group: 'exp', subject: 'p01', quality: 'bad', study: 'S7', onlyEx: 'squat' },
  { role: 'ang60_std', zh: '角度掃描 60°·標準', n: 2, reps: 5, view: 'a60',
    group: 'exp', subject: 'p01', quality: 'good', study: 'S7', onlyEx: 'squat' },
  { role: 'ang60_bad', zh: '角度掃描 60°·刻意膝內夾', n: 1, reps: 4, view: 'a60',
    group: 'exp', subject: 'p01', quality: 'bad', study: 'S7', onlyEx: 'squat' },

];
// 一鍵匯入用：檔名前綴 → 動作（多寫幾種寫法，免得現場命名不一致）
// ⚠️ 要與 run_flat.py 的 PREFIX 保持一致
const PREFIX_MAP = {
  // 臥推：推 / 臥 / 臥推 / 胸推 / bench / bp
  '推': 'bench_press', '臥': 'bench_press', '臥推': 'bench_press', '胸推': 'bench_press',
  '胸': 'bench_press', 'bench': 'bench_press', 'bp': 'bench_press',
  // 深蹲：蹲 / 深 / 深蹲 / squat / sq
  '蹲': 'squat', '深': 'squat', '深蹲': 'squat', 'squat': 'squat', 'sq': 'squat',
};
const viewZh = (exKey, view) =>
  view === 'front' ? SPEC[exKey].subName
    : view === 'nat' ? SPEC[exKey].natName
      : view === 'a40' ? '角度掃描 40°'
        : view === 'a60' ? '角度掃描 60°'
          : SPEC[exKey].mainName;
// 【v5.3】前端的 'side' / 'front' 是「主機位 / 對照機位」的代號，
//   真正送給後端的是 measurability.py 裡的機位代號（決定哪些指標算得出來）。
//   兩者必須對得起來，否則 gating 會套錯表。
const VIEW_KEYS = ['side', 'front', 'nat'];
const VIEW_CODE = {
  // nat 給 oblique_45 只是「還沒量到之前的預設」——真正的機位以
  // measurability.estimate_view_angle() 從骨架反推出來的角度為準。
  // 【v9.1】a40 / a60 是角度掃描組 —— 兩者都送 **frontal_0**，不是 oblique_45。
  //
  //   這個實驗要回答的是：「拿**已驗證的正面模板**，把相機移開 N 度會怎樣」。
  //   所以它們必須跟正面 0° 用同一份黃金模板、同一組尺規、同一張信度表，
  //   唯一改變的變因才會是「角度」。若送 oblique_45 就會去比自選機位的模板
  //   （建在 ~21°），變成「不同模板 × 不同角度」兩個變因同時動，衰減曲線就解讀不了。
  //
  //   後端不會因此誤發保固：pose_gate 會用骨架反推的實測角度去比
  //   VALIDATED_CAMERA_POSE['squat']['frontal_0']，超過 30° 容差就不宣告。
  //   換句話說，這批影片正是拿來**檢驗那道容差關卡本身**的。
  squat:       { side: 'sagittal_90', front: 'frontal_0', nat: 'oblique_45',
                 a40: 'frontal_0', a60: 'frontal_0' },
  bench_press: { side: 'sagittal_90', front: 'overhead',  nat: 'oblique_45' },
};
const viewCodeOf = (exKey, view) => (VIEW_CODE[exKey] || {})[view] || 'sagittal_90';

// 【v9.1】角度掃描組的拍攝指引。
//   ⚠️ 40° / 60° 指的是「相機光軸與**身體正面**的夾角」，不是與牆壁或地板。
//   實測教訓：深7 相機架在房間的 90° 側面，但受測者站的方向讓有效角度
//   只剩 63.7°（差了 26°）。所以現場一定要以身體為基準對齊。
const ANG_SPEC = {
  a40: '相機與**身體正面**夾 40°（不是與牆壁）。站定後先確認：肩線在畫面上的寬度'
     + '應該約為正面拍攝時的 0.77 倍（cos40°）。全身入鏡、蹲到最低點不出框。',
  a60: '相機與**身體正面**夾 60°。肩線寬度約為正面的 0.50 倍（cos60°）。'
     + '與 40° 那組使用同一個站位、只移動相機，避免混入站姿差異。',
};
// 【v5.3】B 機位的每一格，都對應到 A 機位的某一格（同一次動作、兩台同時錄）。
//   卡片上要標出來，不然現場會不知道哪兩支該一起拍。
const PAIR_OF = { template_b: 'template', exp_front: 'exp_side', exp_bad_b: 'exp_bad', nov_front: 'nov_side' };

// 【v5.6】卡片順序＝現場拍攝順序。A/B 是同一次動作兩台同時錄，所以配對的
//   兩格必須**相鄰**（做完一次動作就填掉連續兩格），而不是 A 全部排完再排 B。
//   C 機位是獨立一輪，排在最後。
const ROLE_GROUPS = [
  ['template', 'template_b'],    // 建模：A、B 交錯
  ['exp_side', 'exp_front'],     // 標準動作
  ['exp_bad', 'exp_bad_b'],      // 刻意錯
  ['nov_side', 'nov_front'],     // 新手
  ['template_c'],                // ── 以下 C 機位，受測者自己架、獨立一輪 ──
  ['exp_nat'],
  ['exp_bad_c'],
  ['nov_nat'],
  // ── 【v9.1】補強組，接在既有 26 格之後（深27… / 推27…）──────────────
  //   刻意排在最後：既有 26 支的檔名編號不變，補拍不影響已收的資料。
  ['ang40_std'], ['ang40_bad'], ['ang60_std'], ['ang60_bad'],   // S7 角度掃描（僅深蹲）
];
const ROLE_BY_NAME = Object.fromEntries(ROLES.map(r => [r.role, r]));

const SLOTS = [];
EXS.forEach(ex => {
  let seq = 0;                       // 全域序號 = 檔名的數字（蹲7 → 第 7 張卡）
  ROLE_GROUPS.forEach(group => {
    const rs = group.map(n => ROLE_BY_NAME[n]).filter(Boolean);
    const maxN = Math.max(...rs.map(r => r.n));
    for (let i = 1; i <= maxN; i++) {
      rs.forEach(r => {
        if (i > r.n) return;
        // 【v9.1】onlyEx：角度掃描組只拍深蹲（膝內夾是額狀面錯誤，
        //   角度衰減最明顯；臥推再掃一遍不會多得到資訊，只會多 6 支要拍）
        if (r.onlyEx && r.onlyEx !== ex.key) return;
      seq += 1;
      const zh = r.zh.replace('{v}', viewZh(ex.key, r.view));
      SLOTS.push({
        id: `${ex.key}_${r.role}_${i}`, ex: ex.key, exZh: ex.zh, ...r, zh, idx: i,
        seq,                                        // ← 檔名對位用的序號
        pairRole: PAIR_OF[r.role] || null,          // ← 這格要跟哪一格同時拍
        pairIdx: PAIR_OF[r.role] ? i : null,
        // 真正送給後端的側面模式旗標：只有「主機位」且該動作宣告為側拍時才 true
        sideView: r.view === 'side' && SPEC[ex.key].sideMode === true,
        viewAngle: r.view === 'front' ? SPEC[ex.key].frontAngle
          : r.view === 'nat' ? SPEC[ex.key].natAngle
            : r.view === 'a40' ? ANG_SPEC.a40
              : r.view === 'a60' ? ANG_SPEC.a60
                : SPEC[ex.key].sideAngle,
        label: `${ex.zh}·${zh} #${i}`,
      });
      });
    }
  });
});
/** 找出某個 B 機位卡片配對的 A 機位卡片全域序號 */
const pairSeqOf = (s) => {
  if (!s.pairRole) return null;
  const t = SLOTS.find(x => x.ex === s.ex && x.role === s.pairRole && x.idx === s.pairIdx);
  return t ? t.seq : null;
};

const specOf = (s) => {
  const sp = SPEC[s.ex]; if (!sp) return '';
  const n = s.reps;
  // ⚠️ C 機位（nat）不能落到 sideAngle —— 那會在卡片上印出「正側面 90°、
  //    鏡頭約髖高、距 2.5–3 m」，現場就照著架了，C 的生態效度直接毀掉。
  const ang = s.view === 'front' ? sp.frontAngle
    : s.view === 'nat' ? sp.natAngle
      : sp.sideAngle;
  if (s.build) return `有經驗者「標準」動作 ${n} 下 · ${ang}`;
  // 【v5.3】刻意錯現在兩個機位都要拍，錯誤內容依 idx 對應（A/B），與機位無關
  if (s.quality === 'bad') return `${n} 下 · ${ang} · ${sp.bad[(s.idx - 1) % sp.bad.length]}`;
  if (s.group === 'nov') return `新手「自然」動作 ${n} 下 · ${ang}`;
  return `標準 ${n} 下 · ${ang}`;
};

/** 卡片一行摘要：現場總覽清單用。刻意錯要標出「哪一種錯」。 */
const shortOf = (s) => {
  const sp = SPEC[s.ex];
  if (s.build) return '建模';
  if (s.quality === 'bad') return sp.bad[(s.idx - 1) % sp.bad.length];
  if (s.group === 'nov') return '新手 p02';
  return '標準';
};
const VIEW_TAG = { side: 'A', front: 'B', nat: 'C' };

const piecewise = (d) => { d = Math.max(0, d); return d <= 10 ? 100 - d * .5 : d <= 40 ? 95 - (d - 10) * (25 / 30) : d <= 80 ? 70 - (d - 40) * (35 / 40) : 30; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

const Card = ({ title, sub, children }) => (
  <div className="rounded-2xl bg-[#F6F4F1] text-[#2B2B2B] p-3 shadow-lg">
    <div className="px-1 mb-1"><div className="text-sm font-semibold">{title}</div>{sub && <div className="text-[11px] text-gray-500">{sub}</div>}</div>
    {children}
  </div>
);
const Stat = ({ label, value, tone }) => (
  <div className={`p-3 rounded-2xl text-center ${tone === 'bad' ? 'bg-amber-500/15' : tone === 'good' ? 'bg-green-500/15' : 'bg-white/5'}`}>
    <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
    <div className="text-lg font-semibold mt-0.5">{value}</div>
  </div>
);

const PoseValidationMobile = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const bulkRef = useRef(null);
  const pendingRef = useRef(null);
  const [importMsg, setImportMsg] = useState('');
  const [phase, setPhase] = useState('');   // 【v7】現在在建模還是受測
  const [dragging, setDragging] = useState(false);
  const [api, setApi] = useState('http://localhost:8000');
  const [files, setFiles] = useState({});      // slotId -> File
  const [st, setSt] = useState({});             // slotId -> {state,pct,score,reps}
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [stdReps, setStdReps] = useState(5);   // 「標準/新手」影片統一 5 下（建模 6 下、刻意錯 4 下不算計次）
  const [tplDbg, setTplDbg] = useState({});     // ex -> template debug
  const [results, setResults] = useState([]);   // analysis payloads
  const [health, setHealth] = useState('');
  const [healthMsg, setHealthMsg] = useState('');
  const [fatal, setFatal] = useState('');       // 全域錯誤橫幅（把後端真正的錯誤講出來）

  // ── 單支重跑（補拍用）───────────────────────────────────────────
  //   為什麼要這個：整包重跑要 58 支、跑很久。補拍了某幾支之後，
  //   只想把那幾支重新分析、拿到 JSON 去更新研究資料，不該把整批再跑一次。
  //   走的是和研究批次完全同一支端點（analyze-async + debug=true），
  //   所以出來的 result 結構與整包跑的一模一樣，可以直接合併。
  const RR_EX = [['bench_press', '臥推'], ['squat', '深蹲']];
  const RR_VIEW = [['side', '正側面 90°'], ['front', '正面／俯視'], ['nat', '自選機位']];
  const RR_COND = [
    ['錯誤B', '刻意錯 · 錯誤B'], ['錯誤A', '刻意錯 · 錯誤A'],
    ['std', '標準組'], ['nov', '新手'],
  ];
  const RR_VIEWZH = {
    bench_press: { front: '正上方俯視', side: '正側面 90°', nat: '自選機位' },
    squat: { front: '正面 0°', side: '正側面 90°', nat: '自選機位' },
  };
  const RR_VIEWCODE = {
    bench_press: { front: 'overhead', side: 'sagittal_90', nat: 'oblique_45' },
    squat: { front: 'frontal_0', side: 'sagittal_90', nat: 'oblique_45' },
  };
  const [rrRows, setRrRows] = useState([]);      // [{file, ex, vw, cd, pct, state, msg, score}]
  const [rrRunning, setRrRunning] = useState(false);
  const [rrOut, setRrOut] = useState(null);      // 下載用的 blob url
  const rrInputRef = useRef(null);

  // 檔名猜動作／機位／條件。猜錯可以在表格裡直接改，猜對就少點幾下。
  const rrGuess = (name) => {
    const ex = /推|臥|胸|bench|bp/i.test(name) ? 'bench_press'
      : (/蹲|深|squat|sq/i.test(name) ? 'squat' : 'bench_press');
    const vw = /俯|over|上方/i.test(name) ? 'front'
      : (/側|side|sag/i.test(name) ? 'side'
        : (/自選|nat|obl/i.test(name) ? 'nat' : 'front'));
    const cd = /肘外展|外展|flare|膝內夾|內夾|valgus/i.test(name) ? '錯誤B'
      : (/握距|grip|蹲深|深度|depth/i.test(name) ? '錯誤A'
        : (/新手|nov/i.test(name) ? 'nov' : 'std'));
    return { ex, vw, cd };
  };

  const rrAdd = (files) => {
    const add = Array.from(files || []).map(f => ({
      file: f, ...rrGuess(f.name), pct: 0, state: 'queued', msg: '待跑', score: null,
    }));
    setRrRows(prev => [...prev, ...add]);
    setRrOut(null);
  };
  const rrPatch = (i, patch) => setRrRows(prev => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const runRerun = async () => {
    if (!rrRows.length || rrRunning) return;
    setRrRunning(true); setRrOut(null);
    const done = [];
    for (let i = 0; i < rrRows.length; i++) {
      const row = rrRows[i];
      try {
        rrPatch(i, { state: 'uploading', pct: 2, msg: '上傳中…' });
        const fd = new FormData();
        fd.append('exercise_key', row.ex);
        fd.append('file', row.file);
        fd.append('view', row.vw);
        fd.append('is_side_view', row.vw === 'side' ? 'true' : 'false');
        fd.append('debug', 'true');        // 一定要 debug，per_rep 指標才會回來
        fd.append('user_id', row.cd === 'nov' ? 'p02' : 'p01');
        const start = await axios.post(`${api}/api/multi-exercise/analyze-async`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: e => {
            if (e.total) rrPatch(i, { pct: Math.min(30, Math.round((e.loaded / e.total) * 30)) });
          },
        });
        const job = start.data?.job_id;
        if (!job) throw new Error('後端沒有回傳 job_id');
        const result = await new Promise((resolve, reject) => {
          const tick = async () => {
            try {
              const s = await axios.get(`${api}/api/multi-exercise/analyze-status/${job}`, { timeout: 20000 });
              const d = s.data || {};
              if (d.status === 'error' || d.status === 'failed') return reject(new Error(d.error || '分析失敗'));
              rrPatch(i, { state: 'processing', pct: 30 + Math.round((d.percent || 0) * 0.7), msg: d.stage || '分析中' });
              if (d.result) return resolve(d.result);
              setTimeout(tick, 900);
            } catch (err) { reject(err); }
          };
          tick();
        });
        const isBad = row.cd === '錯誤A' || row.cd === '錯誤B';
        result.source = {
          study: isBad ? 'S3' : 'S2',
          exercise: row.ex, view: row.vw,
          quality: isBad ? 'bad' : 'good',
          group: row.cd === 'nov' ? 'nov' : 'exp',
          subject: row.cd === 'nov' ? 'p02' : 'p01',
          role: row.cd,
          view_zh: (RR_VIEWZH[row.ex] || {})[row.vw] || row.vw,
          view_code: (RR_VIEWCODE[row.ex] || {})[row.vw] || row.vw,
          view_angle: '',
          actual_reps: null,
          err_type: isBad ? row.cd : null,
          source_file: row.file.name,
          rerun_at: new Date().toISOString(),
        };
        done.push(result);
        const sc = result.overallScore == null ? '無總分' : `${Math.round(result.overallScore)} 分`;
        rrPatch(i, { state: 'done', pct: 100, msg: sc, score: result.overallScore });
      } catch (e) {
        rrPatch(i, { state: 'error', pct: 0, msg: explain(e, api) });
      }
    }
    setRrRunning(false);
    if (done.length) {
      const blob = new Blob([JSON.stringify({
        _note: 'DRVN 單支重跑輸出；analyses 結構與整包研究 JSON 相同，可直接合併',
        generated_at: new Date().toISOString(),
        analyses: done,
      }, null, 1)], { type: 'application/json' });
      setRrOut({ url: URL.createObjectURL(blob), n: done.length });
    }
  };

  // ── 骨架示範影片產生器（給海報 QR 影片用；獨立於研究批次）──
  const [skFiles, setSkFiles] = useState([]);   // 選到的示範片 File[]
  const [skJobs, setSkJobs] = useState([]);     // [{name,pct,state,url,err}]
  const [skRunning, setSkRunning] = useState(false);
  const skInputRef = useRef(null);

  const runSkeleton = async () => {
    if (!skFiles.length || skRunning) return;
    setSkRunning(true);
    setSkJobs(skFiles.map(f => ({ name: f.name, pct: 0, state: 'queued', url: null, err: null })));
    const updJob = (i, patch) => setSkJobs(prev => prev.map((j, k) => (k === i ? { ...j, ...patch } : j)));
    for (let i = 0; i < skFiles.length; i++) {
      try {
        const fd = new FormData();
        fd.append('file', skFiles[i]);
        updJob(i, { state: 'uploading', pct: 2 });
        const start = await axios.post(`${api}/research/skeleton`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: e => { if (e.total) updJob(i, { state: 'uploading', pct: Math.min(30, Math.round((e.loaded / e.total) * 30)) }); },
        });
        const job = start.data?.job_id;
        if (!job) throw new Error('後端沒有回傳 job_id');
        await new Promise((resolve, reject) => {
          const tick = async () => {
            try {
              const s = await axios.get(`${api}/research/skeleton-status/${job}`, { timeout: 15000 });
              const d = s.data || {};
              if (d.state === 'error') return reject(new Error(d.error || '處理失敗'));
              updJob(i, { state: 'processing', pct: 30 + Math.round((d.percent || 0) * 0.7) });
              if (d.state === 'done' && d.fid) { updJob(i, { state: 'done', pct: 100, url: `${api}/research/skeleton/${d.fid}` }); return resolve(); }
              setTimeout(tick, 700);
            } catch (err) { reject(err); }
          };
          tick();
        });
      } catch (e) {
        const stc = e?.response?.status;
        const d = e?.response?.data;
        const detail = (d && (d.error || d.detail)) || e?.message || '失敗';
        const msg = stc
          ? `HTTP ${stc}｜${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
          + (stc === 404 ? '（後端沒這個端點——請關掉 start_local.command 重跑一次載入新端點）' : '')
          : `${detail}（多半是後端沒開／位址不對，先按上面「測試連線」）`;
        updJob(i, { state: 'error', err: msg });
      }
    }
    setSkRunning(false);
  };

  // ── 把 axios / FastAPI 的錯誤翻成「看得懂而且知道要去修哪裡」的一句話 ──
  const explain = (err, apiUrl) => {
    if (err?.jobError) return `分析失敗：${err.message}`;   // 後端跑起來了但這支影片處理不出來
    const r = err?.response;
    if (r?.status === 404 && (r.data?.retryable || /job not found/i.test(JSON.stringify(r.data || ''))))
      return '工作記錄遺失（後端在分析途中重啟過）。影片本身沒問題，重跑這一支即可。';
    if (r?.status === 413) return '影片太大被後端擋掉（413）。完整後端 main.py 的請求上限預設 25MB —— '
      + '請更新到已放寬影片路徑的版本並重啟後端，或改跑 research_server（start_local.command）。';
    if (r) {   // 後端有回，但回 4xx/5xx → 是分析本身出問題，不是連線問題
      const d = r.data;
      const detail = typeof d === 'string' ? d
        : (d?.error || d?.detail || JSON.stringify(d || {}).slice(0, 300));
      return `後端回 ${r.status}：${detail}`;
    }
    if (err?.code === 'ECONNABORTED') return '逾時（影片太長或機器太慢），可先縮短影片再試';
    // 完全沒有 response = 根本沒連上 / 被 CORS 擋掉
    const onDevice = !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(window.location.origin);
    const big = err?.config?.data instanceof FormData;
    return `連不到後端 ${apiUrl}（${err?.message || 'Network Error'}）。`
      + (big ? '⚠️ 這是帶影片的上傳請求。如果「測試連線」是綠的、只有上傳失敗，'
        + '通常是後端把超大 body 擋掉、而且那個 413 沒帶 CORS 標頭，瀏覽器就只回報 Network Error。'
        + '請確認後端已更新 limit_body_size（影片路徑放寬到 1GB）並重啟。 ' : '')
      + (onDevice
        ? '⚠️ 你現在是在手機/裝置上開這個頁面，localhost 指的是「手機自己」，不是你的 Mac。'
        + '請把上面網址改成 Mac 的區網 IP（例如 http://192.168.x.x:8000），並確認後端是用 --host 0.0.0.0 啟動。'
        : '請先執行 start_local.command，看到「後端就緒 ✓」再回來按「測試連線」。');
  };

  const pick = (id) => { pendingRef.current = id; inputRef.current?.click(); };
  const onFile = (e) => {
    const f = e.target.files?.[0]; const id = pendingRef.current;
    if (f && id) { setFiles(p => ({ ...p, [id]: f })); setSt(p => ({ ...p, [id]: { state: 'ready', pct: 100 } })); }
    if (inputRef.current) inputRef.current.value = '';
  };
  const chosen = SLOTS.filter(s => files[s.id]).length;

  // ── 一鍵匯入整包資料夾 ───────────────────────────────────────
  // 檔名就是對位規則：推1…推18 → 臥推第 1–18 張卡、蹲1…蹲18 → 深蹲第 1–18 張卡，
  // 序號＝下面卡片由上而下的順序。「推 4 .MOV」這種夾雜空格的也吃得下。
  const bulkFile = (name) => {
    const stem = name.replace(/\.[^.]+$/, '').replace(/[\s　]/g, '');
    const m = stem.match(/^([一-鿿A-Za-z_]+?)0*(\d+)$/);
    if (!m) return null;
    const key = m[1];
    const ex = PREFIX_MAP[key] || PREFIX_MAP[key.toLowerCase()];
    return ex ? { ex, num: parseInt(m[2], 10) } : null;
  };
  const importFiles = (fileList) => {
    const arr = Array.from(fileList || []).filter(f => /\.(mp4|mov|m4v|avi)$/i.test(f.name));
    if (!arr.length) { setImportMsg('沒有找到影片檔（.mp4 / .mov / .m4v / .avi）。'); return; }
    const nextFiles = {}, nextSt = {}, unknown = [], dup = [];
    arr.forEach(f => {
      const hit = bulkFile(f.name);
      if (!hit) { unknown.push(f.name); return; }
      const slot = SLOTS.filter(s => s.ex === hit.ex)[hit.num - 1];
      if (!slot) { unknown.push(`${f.name}（序號 ${hit.num} 超出 1–${SLOTS.filter(x => x.ex === hit.ex).length}）`); return; }
      if (nextFiles[slot.id]) { dup.push(f.name); return; }
      nextFiles[slot.id] = f; nextSt[slot.id] = { state: 'ready', pct: 100 };
    });
    const n = Object.keys(nextFiles).length;
    setFiles(p => ({ ...p, ...nextFiles }));
    setSt(p => ({ ...p, ...nextSt }));
    const missing = SLOTS.filter(s => !nextFiles[s.id]).map(s => `${s.exZh}#${SLOTS.filter(x => x.ex === s.ex).indexOf(s) + 1}`);
    setImportMsg(
      `已對位 ${n}/${SLOTS.length} 支。`
      + (missing.length ? ` 缺：${missing.join('、')}。` : ' 全部到齊 ✓')
      + (unknown.length ? ` 認不出檔名（跳過）：${unknown.join('、')}。檔名要長這樣：推1.MOV / 蹲7.MOV。` : '')
      + (dup.length ? ` 序號重複、只取第一支：${dup.join('、')}。` : '')
    );
  };
  const onBulk = (e) => { importFiles(e.target.files); if (bulkRef.current) bulkRef.current.value = ''; };

  // 兩段式健康檢查：
  //   1) /research/health —— 精簡本機後端 research_server.py 才有
  //   2) 上面 404 的話，改探 /api/multi-exercise/exercises —— 完整後端 main.py 也掛了
  //      同一組姿態分析路由，所以「404 但姿態路由在」其實完全可以跑，不該擋下來。
  //   兩個都 404 = 8000 埠被不相干的程式佔住了。
  const checkHealth = async () => {
    setHealth('checking'); setHealthMsg('');
    const done = (ok, msg) => { setHealth(ok ? 'ok' : 'bad'); setHealthMsg(msg); return { ok, msg }; };
    try {
      const r = await axios.get(`${api}/research/health`, { timeout: 4000 });
      if (r.data?.status === 'ok') return done(true, '後端已連線（research_server 精簡模式）');
    } catch (err) {
      if (err?.response?.status !== 404) return done(false, explain(err, api));
      // 404 → 繼續往下探，可能是完整後端
    }
    try {
      await axios.get(`${api}/api/multi-exercise/exercises`, { timeout: 4000 });
      return done(true, '後端已連線（完整後端 main.py — 沒有 /research/health，但姿態分析路由都在，可以直接跑）');
    } catch (err2) {
      if (err2?.response?.status === 404) {
        return done(false, `${api} 上有服務在跑，但它連姿態分析路由都沒有。`
          + '八成是 8000 埠被別的程式佔住，research_server 根本沒起來。'
          + '先關掉佔用者：終端機執行 lsof -ti:8000 | xargs kill，再跑 start_local.command。');
      }
      return done(false, explain(err2, api));
    }
  };

  // 進頁面就先探一次，不用等使用者想到要按「測試連線」
  useEffect(() => { checkHealth(); /* eslint-disable-next-line */ }, []);

  const run = async () => {
    setFatal('');
    // 先確認後端活著再開始 —— 否則整批會一支一支「失敗」，看起來像分析壞掉，
    // 實際上只是後端沒開，很難 debug。
    const h = await checkHealth();
    if (!h.ok) { setFatal('沒有開始分析 — ' + h.msg); return; }
    setRunning(true); setTotal(0); setResults([]); setTplDbg({}); setPhase('');
    const ax = axios.create({ baseURL: api, timeout: 900000 });
    const tpl = {}; const res = [];
    const totalN = SLOTS.filter(s => files[s.id]).length || 1;
    let done = 0;
    const upd = (id, o) => setSt(p => ({ ...p, [id]: { ...(p[id] || {}), ...o } }));
    for (const ex of EXS.map(e => e.key)) {
      // ── 建模：【v5.3】每個機位各建一份模板 ──────────────────────────
      //   不同機位量到的不是同一個量（正側面的 Elbow Flare 是 z 雜訊、
      //   正上方才是真的外展角），拿 A 機位的模板比 B 機位的影片，
      //   比到的是投影差異不是動作差異。實測同一個人同一個深蹲，
      //   Torso Lean 在兩個機位分別是 15.68° 和 3.87°。
      // 【v7】記錄每個機位的模板這一輪有沒有「真的重建」。
      //   舊版：建模影片沒選就 continue，直接拿磁碟上的舊模板去評分 ——
      //   完全沒有提示。實測踩過：使用者只上傳受測影片重跑，以為套用了
      //   新版演算法，結果分數一模一樣，因為可觀測性與分數尺規都是
      //   **建模階段**算完存進模板的，模板沒重建等於什麼都沒改。
      const rebuilt = {};
      for (const vw of VIEW_KEYS) {
        const bs = SLOTS.filter(s => s.ex === ex && s.build && s.view === vw && files[s.id]);
        const need = SLOTS.filter(s => s.ex === ex && s.build && s.view === vw);
        if (!bs.length) {
          if (need.length) {
            setFatal(p => p || `⚠️ ${EXS.find(e => e.key === ex)?.zh}·${viewZh(ex, vw)} 沒有選建模影片`
              + `（第 ${need.map(s => s.seq).join('、')} 支）→ 會沿用磁碟上的舊模板，`
              + `新版的可觀測性判定與分數尺規不會生效。`);
          }
          rebuilt[vw] = false;
          continue;
        }
        const viewCode = viewCodeOf(ex, vw);
        // 【v8.7】信度校準集：同機位的「標準動作」影片（quality==='good'、
        //   非新手、非建模）。這些影片沒有參與建模，所以拿它們量出來的
        //   重測 CV 不受「模板由自己做出來、自己評自己永遠正常」的循環性影響。
        //
        //   為什麼非做不可：建模只有 2 支，自估 CV 恆 ≈ 0，信度關卡等於沒開。
        //   實測後果 —— 深蹲自選機位 Torso Lean 的子分數是 80/84/5（CV 0.79），
        //   早該被擋下不計分，卻照樣以 0.56 的權重進總分，
        //   讓一支動作完全正常的影片拿到 45 分。
        //   改用獨立校準後：標準組 45/89/91 → 99/100/100，
        //   而且偵測力反而變強（深蹲正面膝內夾 +35.9 → +42.8）。
        //
        //   ⚠️ 這批影片同時也是受測的標準組，所以**重測信度**是在自己身上量的
        //   （等同 psychometrics 的 item analysis，可接受但要揭露）。
        //   效度結果不受影響 —— 刻意錯影片完全沒有參與校準。
        //
        // 【v8.9】改成建模完之後**一支一支**呼叫 /calibrate，不再併進建模請求。
        //   v8.7 把 3 支校準影片跟 2 支建模影片放同一個 FormData，
        //   body 從 2 支變 5 支 → 被後端 limit_body_size 擋掉，
        //   瀏覽器只回報 Network Error，整輪建模全滅（實際踩過）。
        // ⚠️【v9.1】必須鎖 subject === 'p01'。
        //   重測信度的定義是「**同一個人**、同一機位、重複拍，分數飄多少」。
        //   目前 v9.1 補的是新手 #2（group='nov'）已被 group 條件擋掉，
        //   但只要未來加入「第 2 位有經驗受測者」，不鎖 subject 就會被一起
        //   收進校準集 → 量到的變成「個體間變異」，信度被高估成不可信，
        //   關卡會誤擋掉本來穩定的指標。這道鎖是預防性的，不要拿掉。
        const cal = SLOTS.filter(s => s.ex === ex && s.view === vw && !s.build
          && s.quality === 'good' && s.group === 'exp' && s.subject === 'p01'
          && files[s.id]);
        setPhase(`階段 1／2　建模：${EXS.find(e => e.key === ex)?.zh} · ${viewZh(ex, vw)}（${bs.length} 支）`);
        const fd = new FormData();
        fd.append('exercise_key', ex); fd.append('debug', 'true');
        fd.append('view', viewCode);
        bs.forEach(s => fd.append('files', files[s.id]));
        bs.forEach(s => upd(s.id, { state: 'uploading', pct: 5 }));
        try {
          const r = await ax.post('/api/multi-exercise/template', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: e => { if (e.total) { const up = Math.min(92, Math.round(e.loaded / e.total * 92)); bs.forEach(s => upd(s.id, { state: 'analyzing', pct: up })); } },
          });
          tpl[`${ex}__${vw}`] = r.data?.debug || null;
          if (vw === 'side') tpl[ex] = r.data?.debug || null;   // 舊圖表相容
          bs.forEach(s => { upd(s.id, { state: 'done', pct: 100 }); });
          rebuilt[vw] = true;
        } catch (err) {
          const msg = explain(err, api);
          bs.forEach(s => upd(s.id, { state: 'error', pct: 0, err: msg }));
          setFatal(p => p || `建模失敗（${ex} · ${viewZh(ex, vw)}）：${msg}`);
          rebuilt[vw] = false;
        }
        done += bs.length; setTotal(Math.round(done / totalN * 100));

        // ── 信度校準：模板建好之後才跑，一次一支 ─────────────────────────
        //   用沒參與建模的標準動作影片量每個指標的重測 CV。
        //   建模只有 2 支，自估 CV 恆 ≈ 0，信度關卡等於沒開；實測後果是
        //   深蹲自選機位 Torso Lean 子分數 80/84/5（CV 0.79）照樣計分，
        //   讓一支動作正常的影片拿到 45 分。
        //   ⚠️ 這批影片同時也是受測的標準組，所以「重測信度」是在自己身上量的
        //   （等同 psychometrics 的 item analysis，可接受但要在論文揭露）。
        //   效度結果不受影響 —— 刻意錯影片完全沒有參與校準。
        if (rebuilt[vw] && cal.length >= 3) {
          for (let ci = 0; ci < cal.length; ci++) {
            setPhase(`階段 1／2　信度校準：${EXS.find(e => e.key === ex)?.zh} · `
              + `${viewZh(ex, vw)}（${ci + 1}/${cal.length}）`);
            const cfd = new FormData();
            cfd.append('exercise_key', ex);
            cfd.append('view', viewCode);
            cfd.append('reset', ci === 0 ? 'true' : 'false');   // 第一支清掉上輪累積
            cfd.append('file', files[cal[ci].id]);
            try {
              const cr = await ax.post('/api/multi-exercise/calibrate', cfd,
                { headers: { 'Content-Type': 'multipart/form-data' } });
              if (cr.data?.status === 'written' && tpl[`${ex}__${vw}`]) {
                // 把校準結果掛回模板 debug，研究報告才看得到 CV 與被擋的指標
                tpl[`${ex}__${vw}`].calib_cv = cr.data.cv;
                tpl[`${ex}__${vw}`].calib_n = cr.data.n;
                tpl[`${ex}__${vw}`].cv_source = 'calibration';
              }
            } catch (err) {
              // 校準失敗不該讓整輪掛掉 —— 沒有 CV 就退回驗證表，
              // 那是保守方向。但一定要讓使用者看見，否則會誤以為關卡有跑。
              setFatal(p => p || `信度校準失敗（${ex} · ${viewZh(ex, vw)} 第 ${ci + 1} 支）：`
                + `${explain(err, api)}　→ 這個機位會退回查表版的信度門檻。`);
              break;
            }
          }
        }
      }
      // ── 受測 ──
      //   【v7】建模失敗的機位，其受測影片直接跳過 —— 拿失敗/過期的模板
      //   去評分，會產出看起來正常但完全沒有意義的分數。
      const ts = SLOTS.filter(s => s.ex === ex && !s.build && files[s.id]);
      setPhase(`階段 2／2　受測：${EXS.find(e => e.key === ex)?.zh}（${ts.length} 支）`);
      for (const s of ts) {
        if (rebuilt[s.view] === false && SLOTS.some(x => x.ex === ex && x.build && x.view === s.view)) {
          upd(s.id, { state: 'error', pct: 0,
            err: `跳過：${viewZh(ex, s.view)} 的模板這一輪沒有重建成功，`
               + `拿舊模板評出來的分數沒有意義。請補上建模影片（第 `
               + `${SLOTS.filter(x => x.ex === ex && x.build && x.view === s.view).map(x => x.seq).join('、')} 支）後重跑。` });
          done += 1; setTotal(Math.round(done / totalN * 100));
          continue;
        }
        // 【v7.2】單支自動重試：後端重啟造成的 404 會讓這一支拿不到結果，
        //   但影片本身沒問題，重送即可。最多重試 2 次、每次間隔遞增。
        let _attempt = 0;
        while (true) {
        try {
          const fd = new FormData();
          fd.append('exercise_key', ex); fd.append('file', files[s.id]);
          // 【v5.3】改送明確的機位代號。舊的 is_side_view(bool) 表達力不足——
          //   它在 2026-07-27 兩批資料裡 16 支影片全部都是 false，
          //   導致視角相關的計分邏輯從未執行，「機位」這個實驗因子等於沒操作到。
          //   仍保留 is_side_view 是為了後端舊路徑的相容。
          fd.append('view', viewCodeOf(s.ex, s.view));
          fd.append('is_side_view', s.sideView); fd.append('debug', 'true');
          upd(s.id, { state: 'uploading', pct: 1 });
          const start = await ax.post('/api/multi-exercise/analyze-async', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: e => { if (e.total) upd(s.id, { state: 'uploading', pct: Math.min(30, Math.round(e.loaded / e.total * 30)) }); },
          });
          const job = start.data?.job_id;
          if (!job) throw Object.assign(new Error('後端沒有回傳 job_id'), { jobError: true });
          await new Promise((resolve, reject) => {
            // ⚠️ 總時限。沒有的話，只要後端任務一直停在 processing，
            //   這個 tick 迴圈就永遠跑下去，整批驗證卡在那一支上不動也不報錯。
            const _t0 = Date.now();
            const POLL_MAX_MS = 10 * 60 * 1000;
            const tick = async () => {
              if (Date.now() - _t0 > POLL_MAX_MS) {
                reject(Object.assign(new Error('後端分析逾時（超過 10 分鐘沒有結果）'),
                                     { retryable: true }));
                return;
              }
              try {
                const stt = await ax.get(`/api/multi-exercise/analyze-status/${job}`, { timeout: 15000 });
                const d = stt.data || {};
                upd(s.id, { state: 'analyzing', pct: 30 + Math.round((d.percent || 0) * 0.7) });
                if (d.status === 'done') {
                  const rec = d.result || {};
                  rec.source = {
                    study: s.study, exercise: ex, view: s.view, quality: s.quality,
                    group: s.group, subject: s.subject, role: s.role,
                    view_zh: s.zh, view_angle: s.viewAngle, side_mode: s.sideView,  // 讓 JSON 自己講清楚是哪個機位拍的
                    view_code: viewCodeOf(s.ex, s.view),   // 【v5.3】對應 measurability 的機位代號
                    // 【v5.3】刻意錯也要有 ground truth。舊版這裡是 null，
                    //   結果最可能讓計次出錯的那幾支反而無法驗證
                    //   （實測臥推刻意錯 B 做 4 下卻偵測到 6 下，多算 2 下但無從證實）。
                    actual_reps: Number(s.reps),
                    err_type: (s.quality === 'bad' ? `錯誤${String.fromCharCode(64 + s.idx)}` : null),
                  };
                  res.push(rec);
                  // 有效權重：被拍到、真正計入分數的權重比例。遠小於 1 就代表
                  // 大半指標因為看不到被丟掉，剩下少數撐起全部分數 → 分數不可信。
                  const prs = (rec.debug || {}).per_rep || [];
                  const mrs = prs.map(r => r.measured_ratio).filter(v => v != null);
                  const dropped = [...new Set(prs.flatMap(r => r.dropped_metrics || []))];
                  const unmeas = [...new Set(prs.flatMap(r => r.unmeasurable || []))];
                  const collapsed = [...new Set(prs.flatMap(r => r.collapsed_bilateral || []))];
                  upd(s.id, {
                    state: 'done', pct: 100,
                    // 【v7.1】量不到的指標太多時後端會作廢分數（overallScore = null）。
                    //   實測：有效權重 <30% 的那批平均 99 分、≥70% 的平均 77 分 ——
                    //   量到越少分數越高，因為沒量到就不扣分。給一個看起來正常
                    //   卻無意義的分數，比不給分危險得多。
                    score: rec.scoreVoid || rec.overallScore == null ? null : Math.round(rec.overallScore),
                    scoreVoid: !!rec.scoreVoid, scoreVoidReason: rec.scoreVoidReason,
                    reps: rec.repCount,
                    // 【v7】計次信心度：多條候選訊號的共識程度。
                    //   低信心代表「不同訊號數出來的次數不一致」——
                    //   這時次數與分數都不該拿去做統計。
                    countConf: rec.countConfidence, countConsensus: rec.countConsensus,
                    // 【v8.2】計次可信度：由實測的「機位 × 計次正確率」決定。
                    //   臥推俯視/正側面數不準是投影幾何的必然，不是 bug。
                    countRel: rec.countReliability || null,
                    // 【v8】三道關卡的結果：量得到 → 量得準 → 這個角度管得到哪些錯誤
                    scoredMetrics: rec.scoredMetrics || [],
                    reliability: rec.reliability || {},
                    canDetect: rec.detectableErrors || [],
                    cannotDetect: rec.undetectableErrors || [],
                    mr: mrs.length ? mean(mrs) : null, dropped, unmeas, collapsed,
                    // 有效權重過低時分數沒有意義（實測有支影片 7 個指標剩 1 個，
                    // 卻照樣算出 37 分）。把「靠幾個指標撐起來的」講清楚。
                    nMetrics: (() => {
                      const w = prs[0]?.final_weights || {};
                      return Object.values(w).filter(v => v > 0.001).length || null;
                    })(),
                    vq: (rec.debug || {}).meta?.view_quality ?? null,
                    // 【v5.5】從骨架反推的實際機位角度 —— 驗證「我以為拍 90°，實際幾度」
                    viewDeg: (rec.debug || {}).meta?.measured_view_deg ?? null,
                    bv: (rec.debug || {}).meta?.bilateral_visibility ?? null,
                    repOk: (rec.debug || {}).meta?.rep_count_reliable ?? true,
                    segWhy: (rec.debug || {}).meta?.seg_signal_why ?? '',
                    framing: (rec.debug || {}).meta?.framing ?? null,
                  });
                  resolve(); return;
                }
                if (d.status === 'error') { reject(Object.assign(new Error(d.error || '未知錯誤'), { jobError: true })); return; }
                setTimeout(tick, 800);
              } catch (e) {
                // 【v7.2】404 = 後端的工作記錄不見了（純記憶體，後端一重啟就沒了）。
                //   這不是這支影片的問題，重送一次就好 —— 標記成可重試，
                //   讓外層自動重跑，不要讓整批因為一支而中斷。
                if (e?.response?.status === 404) {
                  reject(Object.assign(new Error('工作記錄遺失（後端可能重啟過）'),
                                       { retryable: true }));
                  return;
                }
                reject(e);
              }
            }; tick();
          });
          break;                                   // 成功就跳出重試迴圈
        } catch (err) {
          const canRetry = (err?.retryable || err?.response?.status === 404) && _attempt < 2;
          if (canRetry) {
            _attempt += 1;
            upd(s.id, { state: 'analyzing', pct: 1,
                        err: `工作記錄遺失，自動重試第 ${_attempt} 次…` });
            await new Promise(r => setTimeout(r, 1500 * _attempt));
            continue;                              // 重送同一支
          }
          const msg = explain(err, api)
            + (_attempt ? `（已自動重試 ${_attempt} 次仍失敗）` : '');
          upd(s.id, { state: 'error', pct: 0, err: msg });
          setFatal(p => p || `${s.exZh}·${s.zh} #${s.idx} 失敗：${msg}`);
          break;
        }
        }
        done += 1; setTotal(Math.round(done / totalN * 100));
      }
    }
    setTplDbg(tpl); setResults(res); setRunning(false); setPhase('');
  };

  // ── 圖表資料 ──
  const byEx = (ex) => results.filter(r => r.source?.exercise === ex);

  // ══════════════════════════════════════════════════════════════════
  // 【v7】平面族架構的三張核心圖
  //
  // 為什麼要換掉「機位比較」的框架 —— 實測 52 支資料顯示：
  //   同一個人做同樣的標準動作，換機位後指標絕對值差 11–87%。
  //   原因不是尺度沒正規化（距離型指標都已除以股骨長/髖寬/肩寬，
  //   與身高無關），而是 MediaPipe 的 world 座標是單目推估的 3D 重建，
  //   同一個真實三維量從不同角度重建出來就是不同數字。
  //
  //   但把比較限縮到「兩個機位都量得到那個指標」之後，離散度大幅收斂
  //   （膝內夾 21%→2%、肘外展 28%→5%）。所以可轉移性的邊界不是
  //   「角度 vs 距離」，是**這個量在不在該機位看得見的平面上**。
  // ══════════════════════════════════════════════════════════════════
  const BILAT = { squat: ['L Knee', 'R Knee'], bench_press: ['L Elbow', 'R Elbow'] };
  const PEAK_MIN = new Set(['L Knee', 'R Knee', 'L Elbow', 'R Elbow', 'Forearm Vertical']);
  // 差值型指標：兩個帶雜訊的量相減，雜訊疊加、訊號縮小 → 實測族內離散 26–54%
  const DIFF_METRICS = new Set(['Knee Sym', 'Elbow Sym', 'Stability']);

  /** 一支影片 → 某指標每個 rep 的極值的中位數 */
  const peakOf = (r, lab) => {
    const vs = [];
    (r.chartsData || []).forEach(rep => {
      const c = rep?.[lab]; if (!c || !c.length) return;
      const u = c.map(p => p.user).filter(v => v != null && isFinite(v));
      if (u.length) vs.push(PEAK_MIN.has(lab) ? Math.min(...u) : Math.max(...u));
    });
    if (!vs.length) return null;
    vs.sort((a, b) => a - b);
    return vs[Math.floor(vs.length / 2)];
  };
  const stdVids = (ex, vw) => results.filter(r => r.source?.exercise === ex
    && r.source?.view === vw && r.source?.quality === 'good' && r.source?.group === 'exp');
  const medPeak = (ex, vw, lab) => {
    const v = stdVids(ex, vw).map(r => peakOf(r, lab)).filter(x => x != null);
    if (!v.length) return null;
    v.sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const visOf = (ex, vw) => {
    const agg = {};
    results.filter(r => r.source?.exercise === ex && r.source?.view === vw).forEach(r =>
      (r.debug?.per_rep || []).forEach(p => (p.metrics || []).forEach(m => {
        if (m.visibility != null) (agg[m.label] ||= []).push(m.visibility);
      })));
    return Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, mean(v)]));
  };
  const weightOf = (ex, vw) => {
    const agg = {};
    results.filter(r => r.source?.exercise === ex && r.source?.view === vw).forEach(r =>
      (r.debug?.per_rep || []).forEach(p => (p.metrics || []).forEach(m => {
        (agg[m.label] ||= []).push(m.weight || 0);
      })));
    return Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, mean(v)]));
  };

  /** 圖 V1 平面族判定 —— 機位歸屬是「量出來的」，不是我指定的 */
  const planeFamily = useMemo(() => EXS.map(e => {
    const pair = BILAT[e.key]; if (!pair) return null;
    const rows = VIEW_KEYS.map(vw => {
      const vm = visOf(e.key, vw);
      const a = vm[pair[0]], b = vm[pair[1]];
      if (a == null || b == null) return null;
      const ratio = Math.max(a, b) > 0 ? Math.min(a, b) / Math.max(a, b) : 0;
      return {
        view: vw, zh: viewZh(e.key, vw), ratio,
        fam: ratio >= 0.70 ? '額狀面系' : ratio < 0.40 ? '矢狀面系' : '斜角',
        a, b, la: pair[0], lb: pair[1],
      };
    }).filter(Boolean);
    return rows.length ? { ex: e, rows } : null;
  }).filter(Boolean), [results]);

  /** 圖 V2 可觀測性矩陣 —— 每個機位量得到哪些指標、為什麼量不到 */
  const observability = useMemo(() => EXS.map(e => {
    const labs = byEx(e.key)[0]?.debug?.meta?.metric_labels
      || Object.keys(visOf(e.key, 'side'));
    if (!labs.length) return null;
    const rows = VIEW_KEYS.map(vw => {
      const vm = visOf(e.key, vw), wm = weightOf(e.key, vw);
      if (!Object.keys(vm).length) return null;
      return { view: vw, zh: viewZh(e.key, vw),
        cells: labs.map(lab => ({ lab, vis: vm[lab], used: (wm[lab] || 0) > 1e-6 })) };
    }).filter(Boolean);
    return rows.length ? { ex: e, labs, rows } : null;
  }).filter(Boolean), [results]);

  /** 圖 V3【核心】跨平面族 vs 同平面族的一致性
   *  直接回答「預先做好的模板，能不能拿給使用者用自己的角度拍」。 */
  const transferability = useMemo(() => EXS.map(e => {
    const labs = byEx(e.key)[0]?.debug?.meta?.metric_labels || [];
    if (!labs.length) return null;
    const rows = labs.map(lab => {
      const A = medPeak(e.key, 'side', lab);      // 矢狀面系
      const B = medPeak(e.key, 'front', lab);     // 額狀面系
      const Cv = medPeak(e.key, 'nat', lab);      // 額狀面系（使用者自選）
      if (A == null || B == null || Cv == null) return null;
      const cross = Math.abs(A - B) / Math.max(Math.abs(A), Math.abs(B), 1e-6) * 100;
      const m = (B + Cv) / 2;
      const within = Math.abs(B - Cv) / 2 / Math.max(Math.abs(m), 1e-6) * 100;
      return { lab, cross, within, isDiff: DIFF_METRICS.has(lab) };
    }).filter(Boolean);
    return rows.length ? { ex: e, rows } : null;
  }).filter(Boolean), [results]);
  const scoresOf = (arr, f) => arr.filter(f).map(r => r.overallScore).filter(v => v != null);
  const scatter = useMemo(() => {
    const out = [];
    results.forEach(r => ((r.debug || {}).per_rep || []).forEach(rp => rp.metrics.forEach(m => { if (m.weighted_loss != null) out.push({ x: Math.min(100, m.weighted_loss), y: m.sub_score }); })));
    return out;
  }, [results]);
  const curvePts = useMemo(() => Array.from({ length: 51 }, (_, k) => ({ x: k * 2, y: piecewise(k * 2) })), []);
  const effData = useMemo(() => {
    const k = ['pose_extraction', 'smoothing_segmentation', 'scoring']; const zh = { pose_extraction: '骨架擷取', smoothing_segmentation: '平滑切割', scoring: '評分' };
    return k.map(s => ({ name: zh[s], s: +mean(results.map(r => (r.debug?.timings_sec || {})[s]).filter(v => v != null)).toFixed(2) }));
  }, [results]);
  const repcount = useMemo(() => results.filter(r => r.source?.actual_reps).map((r, i) => ({ name: `${r.source.exercise.slice(0, 4)}${i + 1}`, actual: r.source.actual_reps, detected: r.repCount })), [results]);

  // ══════════════════════════════════════════════════════════════════════
  // 【v5.3】新增的研究圖表資料
  // ══════════════════════════════════════════════════════════════════════

  /** Cohen's d —— 兩組平均差 ÷ 合併標準差。<0.8 代表這個對比講不出話。 */
  /** 【v8.6】效果量改用穩健統計（中位數 + MAD）。
   *
   *  為什麼一定要換：n 只有 4–5 支時，單一離群值會同時
   *    ① 把平均拉走（分子縮小）　② 把 SD 撐大（分母膨脹）
   *  兩邊夾殺。實測臥推自選機位：
   *    含離群 [100, 96, 91, 44]  平均 82.7  SD 26.0  →  d = 0.05
   *    剔除後 [100, 96, 91]      中位 96.0  MAD 4.4  →  d = 1.16
   *  一支影片讓判別力差了 23 倍 —— 那不是「這個機位不好」，是統計方法不穩健。
   *
   *  而且那支離群影片的**量測值其實正常**（相機方位只差 4°），
   *  是模板尺規（用 n=2 估的）把正常差異放大成 10 個標準差。
   */
  const median = (a) => {
    const s = [...a].filter(Number.isFinite).sort((x, y) => x - y);
    if (!s.length) return NaN;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const madOf = (a) => {
    const m = median(a);
    return median(a.map(x => Math.abs(x - m))) * 1.4826;
  };
  /** 偏離中位數 > k 倍 MAD 的視為離群，回傳 {keep, dropped} */
  const dropOutliers = (a, k = 2.5) => {
    const m = median(a), s = madOf(a);
    if (!Number.isFinite(s) || s < 1e-12) return { keep: a, dropped: [] };
    const keep = a.filter(x => Math.abs(x - m) / s <= k);
    const dropped = a.filter(x => Math.abs(x - m) / s > k);
    return keep.length >= 2 ? { keep, dropped } : { keep: a, dropped: [] };
  };
  const cohensD = (a, b) => {
    if (a.length < 2 || b.length < 2) return null;
    const { keep } = dropOutliers(a);
    const sa = madOf(keep), sb = madOf(b);
    const p = Math.sqrt((sa * sa + sb * sb) / 2);
    if (p > 1e-9) return (median(keep) - median(b)) / p;
    // MAD 退化（樣本幾乎相同）時退回傳統算法，但仍用剔除離群後的資料
    const va = keep.reduce((s, x) => s + (x - mean(keep)) ** 2, 0) / Math.max(keep.length - 1, 1);
    const vb = b.reduce((s, x) => s + (x - mean(b)) ** 2, 0) / Math.max(b.length - 1, 1);
    const q = Math.sqrt((va + vb) / 2);
    return q > 0 ? (mean(keep) - mean(b)) / q : null;
  };
  /** 傳統算法 —— 報告上要並列，差很多本身就是重要資訊 */
  const cohensDClassic = (a, b) => {
    if (a.length < 2 || b.length < 2) return null;
    const va = a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1);
    const vb = b.reduce((s, x) => s + (x - mean(b)) ** 2, 0) / (b.length - 1);
    const p = Math.sqrt((va + vb) / 2);
    return p > 0 ? (mean(a) - mean(b)) / p : null;
  };

  /** 圖 S1【改版】機位比較：哪個角度真的比較好？
   *  舊版只比「兩個機位的平均分數」，那沒有意義——不同機位量到的是不同的量，
   *  分數高低可能純粹來自投影差異（實測同一個深蹲，Torso Lean 在兩個機位
   *  分別是 15.68° 和 3.87°）。要回答「哪個角度好」，要看的是：
   *    ① 可交付率：這個機位能真的算出多少比例的評分權重
   *    ② 鑑別度 d：這個機位分不分得出標準 vs 刻意錯
   *    ③ 有效權重：實際計入分數的權重（被幻覺點位丟掉多少）
   *  只有三者一起看才知道「分數高」是因為量得準，還是因為根本沒量到。 */
  const viewCompare = useMemo(() => EXS.map(e => {
    const rows = VIEW_KEYS.map(vw => {
      const inView = byEx(e.key).filter(r => r.source?.view === vw);
      // 【v7.2】被作廢的機位 overallScore = null，混進來會讓 mean/SD 變 NaN、整張圖空白。
      const good = inView.filter(r => r.source?.quality === 'good' && r.source?.group === 'exp').map(r => r.overallScore).filter(v => v != null);
      const bad = inView.filter(r => r.source?.quality === 'bad').map(r => r.overallScore).filter(v => v != null);
      const vqs = inView.map(r => r.debug?.meta?.view_quality).filter(v => v != null);
      const mrs = inView.flatMap(r => (r.debug?.per_rep || []).map(p => p.measured_ratio)).filter(v => v != null);
      const d = cohensD(good, bad);
      return {
        name: viewZh(e.key, vw), vw, n: inView.length,
        good: good.length ? +mean(good).toFixed(1) : null,
        bad: bad.length ? +mean(bad).toFixed(1) : null,
        gap: (good.length && bad.length) ? +(mean(good) - mean(bad)).toFixed(1) : null,
        d: d == null ? null : +d.toFixed(2),
        vq: vqs.length ? +(mean(vqs) * 100).toFixed(0) : null,
        mr: mrs.length ? +(mean(mrs) * 100).toFixed(0) : null,
      };
    }).filter(r => r.n > 0);
    // 勝出判準：先看鑑別度，沒有刻意錯資料時退回可交付率
    const ranked = [...rows].sort((a, b) => (b.d ?? -9) - (a.d ?? -9) || (b.vq ?? 0) - (a.vq ?? 0));
    return { ex: e, rows, best: ranked[0] || null };
  }), [results]);

  /** 圖 S6【新】每一種刻意錯，是被哪個指標抓到的？
   *  偏差倍率 = 刻意錯組的偏差 ÷ 標準組的偏差。>1.8 才算真的抓到。
   *  這張圖是「操弄檢核（manipulation check）」——如果某個錯誤沒有任何
   *  指標亮起來，那不是評分問題，是這個機位在物理上量不到那個錯誤。 */
  const errorCatch = useMemo(() => EXS.map(e => {
    const labs = byEx(e.key)[0]?.debug?.meta?.metric_labels || [];
    const devOf = (rs, lab) => {
      const v = rs.flatMap(r => (r.debug?.per_rep || []).flatMap(p =>
        (p.metrics || []).filter(m => m.label === lab && m.directional_loss != null).map(m => m.directional_loss)));
      return v.length ? mean(v) : null;
    };
    return VIEW_KEYS.map(vw => {
      const inView = byEx(e.key).filter(r => r.source?.view === vw);
      const good = inView.filter(r => r.source?.quality === 'good' && r.source?.group === 'exp');
      const badGroups = [...new Set(inView.filter(r => r.source?.quality === 'bad').map(r => r.source?.err_type))].filter(Boolean).sort();
      if (!good.length || !badGroups.length) return null;
      const data = labs.map(lab => {
        const g = devOf(good, lab);
        const row = { metric: lab };
        badGroups.forEach(et => {
          const b = devOf(inView.filter(r => r.source?.err_type === et), lab);
          row[et] = (g && g > 1e-9 && b != null) ? +(b / g).toFixed(2) : null;
        });
        return row;
      }).filter(r => badGroups.some(et => r[et] != null));
      return { ex: e, vw, viewName: viewZh(e.key, vw), badGroups, data };
    }).filter(Boolean);
  }).flat(), [results]);

  /** 圖 S7【新】指標貢獻度：每個指標實際拿到多少權重、被丟掉的原因。
   *  v5.3 把深蹲收斂到 2 個核心、臥推 3 個核心，這張圖用來驗證
   *  「權重真的落在看得到的指標上」，而不是被幻覺點位吃掉。 */
  const weightAudit = useMemo(() => EXS.map(e => VIEW_KEYS.map(vw => {
    const inView = byEx(e.key).filter(r => r.source?.view === vw);
    if (!inView.length) return null;
    const labs = inView[0]?.debug?.meta?.metric_labels || [];
    const data = labs.map(lab => {
      const ws = inView.flatMap(r => (r.debug?.per_rep || []).map(p => (p.final_weights || {})[lab])).filter(v => v != null);
      return { metric: lab, w: ws.length ? +(mean(ws) * 100).toFixed(1) : 0 };
    });
    const lost = [...new Set(inView.flatMap(r => (r.debug?.per_rep || []).flatMap(p =>
      [...(p.unmeasurable || []), ...(p.collapsed_bilateral || []), ...(p.dropped_metrics || [])])))];
    return { ex: e, viewName: viewZh(e.key, vw), data, lost };
  }).filter(Boolean)).flat(), [results]);

  /** 圖 S8【新·最重要】逐指標 × 逐機位的量測品質比較
   *
   *  為什麼需要這張：比較兩個機位不能比「可交付率」——那只反映我給哪些指標
   *  比較高的權重，是循環論證。而且兩個機位測的指標集合如果不重疊，
   *  根本就沒得比。
   *
   *  實測也證明「這個機位測不到那個指標」基本上是錯的：深蹲 L Knee 在正面
   *  的動態範圍是 45.2°、在正側面只有 12.1°（正面測得**更好** 372%）；
   *  臥推七個指標有五個在對照機位的訊號一樣強或更強（85–140%）。
   *  真正測不到的只有 Stability（1%）。
   *
   *  所以改成**同一個指標、兩個機位各量一次，比量測品質**。三個標準都與
   *  機位無關，可以公平比較：
   *
   *    ① 反應倍率 responsiveness ＝ 刻意錯偏差 ÷ 標準組偏差
   *       這個機位對「該抓的錯誤」有沒有反應。1.0 = 完全沒反應。
   *    ② 重測 CV repeatability ＝ 標準組內的變異係數
   *       同一人重複做，這個機位量出來穩不穩。越小越好。
   *    ③ 動態範圍 resolution ＝ 訊號的擺幅
   *       擺幅越大，同樣的雜訊造成的相對誤差越小。
   *
   *  綜合分 ＝ 反應倍率 ÷ 重測 CV（能抓到錯、又量得穩，才是好機位）。
   */
  const metricByView = useMemo(() => EXS.map(e => {
    const labs = byEx(e.key)[0]?.debug?.meta?.metric_labels || [];
    if (!labs.length) return null;
    const pull = (rs, lab) => rs.flatMap(r => (r.debug?.per_rep || []).flatMap(p =>
      (p.metrics || []).filter(m => m.label === lab && m.directional_loss != null)
        .map(m => m.directional_loss)));
    const rows = labs.map(lab => {
      const row = { metric: lab };
      VIEW_KEYS.forEach(vw => {
        const inView = byEx(e.key).filter(r => r.source?.view === vw);
        const good = pull(inView.filter(r => r.source?.quality === 'good' && r.source?.group === 'exp'), lab);
        const bad = pull(inView.filter(r => r.source?.quality === 'bad'), lab);
        if (!good.length) return;
        const g = mean(good);
        // ① 反應倍率
        row[`${vw}_resp`] = (bad.length && g > 1e-9) ? +(mean(bad) / g).toFixed(2) : null;
        // ② 重測 CV（%）—— 標準組內部的變異
        row[`${vw}_cv`] = g > 1e-9 ? +(std(good) / g * 100).toFixed(0) : null;
        // ③ 綜合：抓得到錯 ÷ 量得穩
        const rp = row[`${vw}_resp`], cv = row[`${vw}_cv`];
        row[`${vw}_score`] = (rp != null && cv != null && cv > 0) ? +(rp / (cv / 100)).toFixed(1) : null;
      });
      // 哪個機位把「這個指標」發揮得最好
      const cand = VIEW_KEYS.map(vw => ({ vw, s: row[`${vw}_score`] })).filter(x => x.s != null);
      row.best = cand.length ? cand.sort((a, b) => b.s - a.s)[0].vw : null;
      return row;
    }).filter(r => VIEW_KEYS.some(vw => r[`${vw}_resp`] != null));
    // 逐指標投票 → 哪個機位在最多指標上勝出
    const votes = {};
    rows.forEach(r => { if (r.best) votes[r.best] = (votes[r.best] || 0) + 1; });
    return { ex: e, rows, votes };
  }).filter(Boolean), [results]);

  /** 圖 S9【新·最終裁決】機位總評分 —— 到底該用哪一個機位？
   *
   *  為什麼不能直接比兩個機位的平均總分
   *  ──────────────────────────────────
   *  兩個機位用的指標集合不同、權重也不同，85 分和 85 分代表的不是同一件事。
   *  直接比大小是拿蘋果比橘子。
   *
   *  正確做法：比**結果面**的指標。產品真正在意的不是「量到幾個關節角度」，
   *  而是「這台鏡頭能不能讓 App 好用」，那可以拆成五個都與指標集合無關的結果：
   *
   *    ① 錯誤覆蓋率  這個機位抓得到幾種刻意錯（倍率 >1.8 才算）  ← 最重要
   *    ② 鑑別度 d    標準組 vs 刻意錯的總分分得開嗎
   *    ③ 計次 OBO    ±1 次以內的比例（完全與機位無關）
   *    ④ 重測信度    同一人重複拍的分數穩定度（1 − 標準化 SD）
   *    ⑤ 可交付率    這個機位能誠實交付多少比例的評分
   *
   *  五項各自標準化到 0–1，加權合成「機位總評分」。
   *
   *  ⚠️ 合成權重本身也是主觀的 —— 所以另外跑 **敏感度分析**：
   *     隨機抽 200 組權重，看勝出者換不換人。
   *     如果某個機位在 90%+ 的權重配置下都贏，這個結論才站得住；
   *     如果勝負隨權重翻盤，就要老實說「兩個機位各有所長，無法單選」。
   */
  const viewVerdict = useMemo(() => EXS.map(e => {
    const comps = VIEW_KEYS.map(vw => {
      const inView = byEx(e.key).filter(r => r.source?.view === vw);
      if (!inView.length) return null;
      const good = inView.filter(r => r.source?.quality === 'good' && r.source?.group === 'exp');
      const bad = inView.filter(r => r.source?.quality === 'bad');
      // 【v7.2】濾掉被作廢機位的 null 分數，否則 mean/SD → NaN
      const gs = good.map(r => r.overallScore).filter(v => v != null);
      const bs = bad.map(r => r.overallScore).filter(v => v != null);

      // ① 錯誤覆蓋率：幾種刻意錯真的讓**總分掉下來**
      //
      // 【v8.6 兩次修正的過程，留著當方法論紀錄】
      //
      //   原版：掃全部指標，任一指標偏離 >1.8 倍就算「抓到」
      //         → 三個機位一律 100%。這一欄佔 30% 權重（最重）卻完全不鑑別，
      //           純粹稀釋掉真正有鑑別力的 d。更糟的是深蹲自選機位
      //           Knee Valgus 偏離 6.2 倍被判「抓到」，但它沒計分、總分反而上升。
      //           等於在替一個交付不出來的能力背書。
      //
      //   第一次改：只掃 scoredMetrics（真正計分的指標）
      //         → 六個機位全部變成 50%。還是不鑑別。
      //           原因：1.8 倍是**指標層**的判準，而指標偏離不等於總分下降 ——
      //           中間還隔著權重、評分曲線、與其他指標的稀釋。
      //
      //   最終：直接量**總分**。這才是產品交付給使用者的東西。
      //         判準沿用效度關卡的 20 分（≈ 一個字母等第），前後一致。
      //         實測結果立刻分得開：深蹲 50/100/0%、臥推 0/50/0%。
      //
      // 代價：cover 與鑑別度 d 會相關（都基於總分）。這是誠實的相關 ——
      //   cover 量「抓得到幾種錯」（廣度），d 量「分得多開」（強度），
      //   兩者本來就該同向。用不相關但也不代表交付能力的代理指標來
      //   營造「五個獨立面向」的假象，才是真的有問題。
      const errTypes = [...new Set(bad.map(r => r.source?.err_type).filter(Boolean))];
      const scoredLabs = [...new Set(inView.flatMap(r => r.scoredMetrics || []))];
      const allLabs = inView[0]?.debug?.meta?.metric_labels || [];
      const pull = (rs, lab) => rs.flatMap(r => (r.debug?.per_rep || []).flatMap(p =>
        (p.metrics || []).filter(m => m.label === lab && m.directional_loss != null).map(m => m.directional_loss)));

      // 【v8.9】改成**連續**版本，不再是「掉 ≥20 分才算抓到」的階梯。
      //
      //   階梯版有兩個毛病：
      //     ① 只有 2 種刻意錯 → 分母是 2 → 這一欄只可能是 0% / 50% / 100%。
      //        它佔 30% 權重（五項裡最重），解析度卻最粗。
      //     ② 門檻附近會突然翻轉。實測臥推俯視：
      //          肘外展 +19.4　握距 +18.4
      //          門檻 15 → 100%　門檻 20 → 0%
      //        兩個錯誤都掉了 18–19 分，抓得其實不錯，卻因為差 0.6 分
      //        被判「完全抓不到」。而 20 這個數字是我們自己訂的。
      //
      //   連續版：每種錯誤記 min(掉分 / 20, 1)，再平均。
      //     · 20 分仍是「完全抓到」的錨點（與效度關卡一致，沒有換標準）
      //     · 但 19 分記 95%，不會歸零
      //     · 對門檻的選擇不再敏感 —— 口試被問「為什麼是 20」時好回答
      //   實測差異：臥推俯視 0% → 93%，深蹲自選 0% → 26%。
      const COVER_DROP = 20;      // 與 measurability 的效度門檻同一個數字
      const coverOf = et => {
        const es = bad.filter(r => r.source?.err_type === et)
                      .map(r => r.overallScore).filter(v => v != null);
        if (!gs.length || !es.length) return null;
        return Math.min(Math.max(mean(gs) - mean(es), 0) / COVER_DROP, 1);
      };
      const coverEach = errTypes.map(et => ({ et, v: coverOf(et) })).filter(x => x.v != null);
      const cover = coverEach.length
        ? coverEach.reduce((a, b) => a + b.v, 0) / coverEach.length : null;
      // 完全抓到（≥20 分）的錯誤清單 —— 文字說明還是要講「幾種完全抓到」，
      // 那比一個百分比好懂。兩者並列，不互相取代。
      const caught = errTypes.filter(et => (coverOf(et) ?? 0) >= 1);
      // 每種錯誤實際掉幾分 —— 報告上要能看到原始數字，不能只給一個比例。
      const coverDetail = errTypes.map(et => {
        const es = bad.filter(r => r.source?.err_type === et)
                      .map(r => r.overallScore).filter(v => v != null);
        return { et, drop: (gs.length && es.length) ? mean(gs) - mean(es) : null };
      });
      // 診斷用：訊號層面「其實量得到、但沒轉成分數」的錯誤。
      // 這是**可改進空間**，不是已交付的能力，所以獨立呈現、不進總評分。
      const caughtSignal = errTypes.filter(et => {
        const errRows = bad.filter(r => r.source?.err_type === et);
        return allLabs.some(lab => {
          const g = pull(good, lab), b = pull(errRows, lab);
          return g.length && b.length && mean(g) > 1e-9 && (mean(b) / mean(g)) > 1.8;
        });
      });
      const coverSignal = errTypes.length ? caughtSignal.length / errTypes.length : null;

      // ② 鑑別度 d
      const d = cohensD(gs, bs);

      // ③ 計次 OBO(±1)
      const cnt = inView.filter(r => r.source?.actual_reps != null);
      const obo = cnt.length ? cnt.filter(r => Math.abs(r.repCount - r.source.actual_reps) <= 1).length / cnt.length : null;

      // ④ 重測信度：標準組分數 SD（除以 100 標準化後取反）
      const rel = gs.length > 1 ? Math.max(0, 1 - std(gs) / 25) : null;

      // ⑤ 可交付率
      const vqs = inView.map(r => r.debug?.meta?.view_quality).filter(v => v != null);
      const vq = vqs.length ? mean(vqs) : null;

      // 【重要】資料完整性判定。用舊資料模擬時發現一個 bug：對照機位只有
      //   1 支影片、沒有刻意錯，大部分欄位是 null，卻因為「缺的項目直接跳過、
      //   剩下的重新正規化」拿到滿分勝出 —— 變成「資料越少分數越高」。
      //   錯誤覆蓋率與鑑別度都需要該機位自己的刻意錯影片，缺了就不能裁決。
      const ready = cover != null && d != null && gs.length >= 2 && bs.length >= 1;
      const missing = [];
      if (cover == null || bs.length < 1) missing.push('缺刻意錯影片');
      if (gs.length < 2) missing.push('標準組不足 2 支');

      // 【v8.6】區分「資料不足」與「系統判定這個機位不給分」。
      //   兩者都會讓 gs 是空的，但意義完全相反：
      //     資料不足 → 不知道這個機位好不好，不能下結論
      //     系統作廢 → 已經知道了，而且結論是「不能用」
      //   全部影片都被作廢，就是後者。
      const voided = inView.length > 0 && inView.every(r => r.scoreVoid);
      const voidReason = voided
        ? (inView.find(r => r.scoreVoidReason)?.scoreVoidReason || '系統判定此機位不給分')
        : null;

      return { vw, name: viewZh(e.key, vw), n: inView.length, cover, d, obo, rel, vq,
               caught, errTypes, ready, missing, voided, voidReason,
               coverDetail, coverSignal, caughtSignal, scoredLabs };
    }).filter(Boolean);

    // 【v8.6】被系統作廢的機位要**排除在排名之外**，而不是讓整張裁決卡消失。
    //
    //   起因：骨長關卡把臥推正側面判定為不給分（前臂左右差 33%），
    //   於是它的 gs/bs 都是空的 → ready=false → 整個臥推的機位裁決卡不顯示。
    //   但「這個機位不能用」本身就是最強的裁決結果，把它當成缺資料而
    //   拒絕比較其他兩個機位，是把結論當成錯誤處理。
    //
    //   正確做法：作廢機位以 ⛔ 列在表上、附上物理原因，但不參與加權排名
    //   （它沒有分數可以比）。剩下的機位照常裁決。
    const live = comps.filter(c => !c.voided);
    const dead = comps.filter(c => c.voided);
    // 只有「非作廢」的機位需要資料完整。至少要有兩個才能比。
    if (live.length < 2 || live.some(c => !c.ready)) {
      return { ex: e, comps, live, dead, verdict: null, robust: null, notReady: true };
    }

    // 各項標準化到 0–1（d 先壓到 0–4 的合理範圍）
    // ⚠️ 正規化的基準只看 live（未作廢）機位。作廢機位沒有分數，
    //    讓它參與 max 只會把其他人的相對位置壓歪。
    const norm = (key, cap) => {
      const vals = live.map(c => c[key]).filter(v => v != null);
      if (!vals.length) return () => null;
      const hi = cap ?? Math.max(...vals, 1e-9);
      return (v) => (v == null ? null : Math.max(0, Math.min(1, v / hi)));
    };
    const nD = norm('d', 4);
    const axes = [
      { key: 'cover', zh: '錯誤覆蓋率', w: 0.30, f: c => c.cover },
      { key: 'd', zh: '鑑別度 d', w: 0.25, f: c => nD(c.d) },
      { key: 'obo', zh: '計次 OBO', w: 0.20, f: c => c.obo },
      { key: 'rel', zh: '重測信度', w: 0.15, f: c => c.rel },
      { key: 'vq', zh: '可交付率', w: 0.10, f: c => c.vq },
    ];
    // 缺失的項目一律計 0，不再「跳過後重新正規化」——否則資料少的機位反而佔便宜。
    // 分母固定是全部權重，所有機位站在同一個基準上。
    const scoreWith = (ws) => live.map(c => {
      const tot = ws.reduce((a, b) => a + b, 0);
      let s = 0;
      axes.forEach((a, i) => { const v = a.f(c); s += (v == null ? 0 : v) * ws[i]; });
      return { vw: c.vw, name: c.name, s: tot > 0 ? s / tot : 0 };
    });
    const base = scoreWith(axes.map(a => a.w));
    const verdict = [...base].sort((x, y) => y.s - x.s);

    // 敏感度分析：隨機 200 組權重，看勝出者換不換人
    const wins = {};
    for (let k = 0; k < 200; k++) {
      const ws = axes.map(() => Math.random());
      const top = scoreWith(ws).sort((x, y) => y.s - x.s)[0];
      wins[top.vw] = (wins[top.vw] || 0) + 1;
    }
    const topVw = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
    const robust = { vw: topVw[0], pct: Math.round(topVw[1] / 200 * 100) };

    return {
      ex: e, comps, live, dead, axes, verdict, robust,
      // 雷達圖只畫參與比較的機位。作廢機位畫成一團 0 沒有資訊量，
      // 反而會被誤讀成「量到了但表現差」——它是根本沒量到。
      radar: axes.map(a => {
        const row = { axis: a.zh };
        live.forEach(c => { const v = a.f(c); row[c.name] = v == null ? 0 : +(v * 100).toFixed(0); });
        return row;
      }),
    };
  }), [results]);

  /** 計次正確率（含刻意錯組）：MAE / OBO(±1) / 完全正確 —— 文獻標準組合 */
  const countStats = useMemo(() => {
    const rows = results.filter(r => r.source?.actual_reps != null);
    if (!rows.length) return null;
    const err = rows.map(r => r.repCount - r.source.actual_reps);
    return {
      n: rows.length,
      exact: +(err.filter(x => x === 0).length / err.length * 100).toFixed(0),
      obo: +(err.filter(x => Math.abs(x) <= 1).length / err.length * 100).toFixed(0),
      mae: +mean(err.map(Math.abs)).toFixed(2),
      bias: +mean(err).toFixed(2),
    };
  }, [results]);

  const dlAll = () => {
    const blob = new Blob([JSON.stringify({ templates: tplDbg, analyses: results }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `drvn_research_all_${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  const stColor = (s) => s === 'done' ? 'text-green-400' : s === 'error' ? 'text-red-400' : s === 'ready' ? 'text-white/70' : 'text-[#F46554]';

  return (
    <div className="min-h-[100dvh] bg-[#161415] text-[#F6F4F1] font-sans page-top-safe" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="pt-16 px-5 pb-3 flex items-center gap-3">
        <motion.button {...pressProps('pill')} onClick={() => navigate('/analysis-choice-mobile')} className="p-2 -ml-2 rounded-full "><ArrowLeft size={22} /></motion.button>
        <div className="flex items-center gap-2"><FlaskConical size={20} className="text-[#F46554]" /><h1 className="text-2xl font-semibold tracking-tight">測試模式 · 研究批次</h1></div>
      </div>

      <div className="px-5 space-y-4" style={{ paddingBottom: 'var(--nav-clearance, 96px)' }}>
        {/* 本機後端 */}
        <div className="rounded-2xl bg-white/5 p-4 space-y-2">
          <div className="text-[12px] tracking-widest text-white/40">本機後端位址（start_local.command 啟動）</div>
          <div className="flex gap-2">
            <input value={api} onChange={e => setApi(e.target.value)} className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-sm outline-none" />
            <motion.button {...pressProps('row')} onClick={checkHealth} className="px-3 py-2 rounded-xl bg-white/10 text-sm">測試連線</motion.button>
          </div>
          {health === 'checking' && <div className="text-xs text-white/50">檢查後端中…</div>}
          {health === 'ok' && <div className="text-xs text-green-400">✓ 後端已連線</div>}
          {health === 'bad' && <div className="text-xs text-red-400 leading-snug">✗ {healthMsg || '連不到後端'}</div>}
          <div className="flex items-center gap-2 text-[11px] text-white/50">標準/新手組每支次數
            <input type="number" value={stdReps} onChange={e => setStdReps(e.target.value)} className="w-16 bg-white/10 rounded-lg px-2 py-1 text-white text-sm" />
            <span>（只有 good 影片拿來算計次正確率；建模 6 下、刻意錯 4 下不列入）</span></div>
        </div>

        {/* 骨架示範影片產生器（給海報 QR 影片用） */}
        <div className="rounded-2xl bg-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Play size={16} className="text-[#F46554]" />
            <div className="text-sm font-semibold">骨架示範影片產生器</div>
          </div>
          <div className="text-[11px] text-white/50 leading-snug">
            上傳影片 → 產生加了骨架的 mp4，給簡報／海報 QR 影片用。
            <span className="text-white/35"> 建議各一支：深蹲正面標準、深蹲正面刻意內夾、深蹲正側面、臥推。前兩支最精華。</span>
          </div>
          <input ref={skInputRef} type="file" accept="video/*" multiple className="hidden"
            onChange={e => { setSkFiles(Array.from(e.target.files || [])); setSkJobs([]); }} />
          <motion.button {...pressProps('cta')} onClick={() => skInputRef.current?.click()}
 className="w-full py-2.5 rounded-xl bg-white/10 text-sm flex items-center justify-center gap-2">
            <Upload size={15} /> 選擇影片{skFiles.length ? `（已選 ${skFiles.length} 支）` : ''}
          </motion.button>
          {skFiles.length > 0 && (
            <motion.button {...pressProps('cta')} onClick={runSkeleton} disabled={skRunning}
 className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${skRunning ? 'bg-white/10 text-white/40' : 'bg-[#F46554] text-white'}`}>
              {skRunning ? (<><Loader size={15} className="animate-spin" /> 產生中…</>) : (<><Play size={15} /> 產生骨架影片</>)}
            </motion.button>
          )}
          {skJobs.length > 0 && (
            <div className="space-y-1.5">
              {skJobs.map((j, i) => (
                <div key={i} className="rounded-xl bg-black/25 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate">{j.name}</span>
                    {j.state === 'done'
                      ? <a href={j.url} download className="text-green-400 flex items-center gap-1 shrink-0"><Download size={14} /> 下載</a>
                      : j.state === 'error'
                        ? <span className="text-red-400 shrink-0">✗ 失敗</span>
                        : <span className="text-white/50 shrink-0">{j.pct}%</span>}
                  </div>
                  {j.state === 'error' && <div className="mt-1 text-[11px] text-red-300 leading-snug break-all">{j.err}</div>}
                  {j.state !== 'done' && j.state !== 'error' && (
                    <div className="mt-1 h-1 rounded bg-white/10 overflow-hidden">
                      <div className="h-full bg-[#F46554] transition-all" style={{ width: `${j.pct}%` }} />
                    </div>)}
                </div>
              ))}
            </div>
          )}
        </div>


        {/* 單支重跑（補拍用）：只重跑補拍的那幾支，輸出可合併的 JSON */}
        <div className="rounded-2xl bg-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader size={16} className="text-[#F46554]" />
            <div className="text-sm font-semibold">單支重跑（補拍用）</div>
          </div>
          <div className="text-[11px] text-white/50 leading-snug">
            補拍了某幾支之後用這裡重跑就好，不用把整包 58 支再跑一次。
            走的是和研究批次<b className="text-white/70">同一支端點</b>（<span className="font-mono">analyze-async</span> ＋ debug），
            輸出的 JSON 可直接合併回研究資料。
          </div>
          <div className="rounded-xl bg-white/5 p-2.5 text-[11px] text-white/45 leading-snug">
            下拉選單的<b>錯誤A／錯誤B</b>要和批次腳本一致：<b>錯誤A ＝ 肘外展</b>、<b>錯誤B ＝ 握距過窄</b>
            （深蹲則為 <b>錯誤A ＝ 蹲深不足</b>、<b>錯誤B ＝ 膝內夾</b>）。選錯會讓合併後的辨識效度對到錯的目標指標。
          </div>
          <input ref={rrInputRef} type="file" accept="video/*" multiple className="hidden"
            onChange={e => { rrAdd(e.target.files); e.target.value = ''; }} />
          <motion.button {...pressProps('cta')} onClick={() => rrInputRef.current?.click()}
 className="w-full py-2.5 rounded-xl bg-white/10 text-sm flex items-center justify-center gap-2">
            <Upload size={15} /> 選擇補拍影片{rrRows.length ? `（已選 ${rrRows.length} 支）` : ''}
          </motion.button>

          {rrRows.length > 0 && (
            <div className="space-y-1.5">
              {rrRows.map((r, i) => (
                <div key={i} className="rounded-xl bg-black/25 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-mono text-[11px]">{r.file.name}</span>
                    {r.state === 'done' ? <span className="text-green-400 shrink-0">✓ {r.msg}</span>
                      : r.state === 'error' ? <span className="text-red-400 shrink-0">✗ 失敗</span>
                        : <span className="text-white/50 shrink-0">{r.msg}</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[['ex', RR_EX], ['vw', RR_VIEW], ['cd', RR_COND]].map(([k, opts]) => (
                      <select key={k} value={r[k]} disabled={rrRunning}
                        onChange={e => rrPatch(i, { [k]: e.target.value })}
                        className="bg-white/10 rounded-lg px-1.5 py-1 text-[11px] outline-none">
                        {opts.map(([v, t]) => <option key={v} value={v} className="bg-[#1A1A1A]">{t}</option>)}
                      </select>
                    ))}
                  </div>
                  {r.state === 'error' && <div className="text-[11px] text-red-300 leading-snug break-all">{r.msg}</div>}
                  {r.state !== 'done' && r.state !== 'error' && r.pct > 0 && (
                    <div className="h-1 rounded bg-white/10 overflow-hidden">
                      <div className="h-full bg-[#F46554] transition-all" style={{ width: `${r.pct}%` }} />
                    </div>)}
                  {!rrRunning && (
                    <motion.button {...pressProps('row')} onClick={() => setRrRows(prev => prev.filter((_, k) => k !== i))}
 className="text-[11px] text-white/35">移除</motion.button>)}
                </div>
              ))}
              <motion.button {...pressProps('cta')} onClick={runRerun} disabled={rrRunning}
 className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${rrRunning ? 'bg-white/10 text-white/40' : 'bg-[#F46554] text-white'}`}>
                {rrRunning ? (<><Loader size={15} className="animate-spin" /> 重跑中…</>) : (<><Play size={15} /> 開始重跑</>)}
              </motion.button>
            </div>
          )}

          {rrOut && (
            <a href={rrOut.url} download={`drvn_rerun_${Date.now()}.json`}
              className="w-full py-2.5 rounded-xl bg-green-500/15 text-green-300 text-sm font-semibold flex items-center justify-center gap-2">
              <Download size={15} /> 下載 JSON（{rrOut.n} 支）
            </a>
          )}
        </div>

        {/* 拍攝規格總則 — 邊拍邊對的檢查清單 */}
        <div className="rounded-2xl bg-[#F46554]/10 p-3 text-[11px] text-[#F9B49F] leading-relaxed">
          <b className="text-white/90">拍攝規格總則</b>
          <span className="text-white/45">（固定才可重現）</span>

          <ol className="list-decimal pl-4 mt-2 space-y-1.5">
            <li><b>兩台手機同時拍。</b>深蹲＝正側面 90°＋正面 0°；臥推＝正側面 90°＋正上方俯視。</li>
            <li><b>次數依卡片標示。</b>建模 6 下、標準／新手 5 下、刻意錯 4 下 —— 不多不少。</li>
            <li><b>從站直／鎖死起始位開始錄，也停在起始位。</b>頭尾留發呆片段會多算次數。</li>
            <li><b>刻意錯也要兩個機位都拍。</b></li>
            <li><b>不要俯拍</b>（正上方那台除外）—— 俯角會把動作幅度壓掉一半。深蹲鏡頭約髖高，臥推與胸口同高。</li>
            <li>鏡子不要在鏡頭正對面；開拍前確認背景沒人在動。</li>
            <li>同一機位、高度、光線。建模與受測用不同影片。</li>
            <li>每個動作 9 次，影片數是以前的兩倍。</li>
          </ol>

          <p className="mt-2.5 text-white/40">
            為什麼要同時拍：同一次動作、同一疲勞狀態，差異才純粹來自機位，
            否則會變成獨立樣本、統計力低很多。上一批刻意錯只拍主機位，
            臥推兩種錯誤完全抓不到，分不清是系統失效還是機位看不到。
          </p>
        </div>

        {/* 一鍵匯入整包資料夾 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); importFiles(e.dataTransfer?.files); }}
          className={`rounded-2xl p-4 border-2 border-dashed transition-colors ${dragging ? 'border-[#F46554] bg-[#F46554]/10' : 'border-white/15 bg-white/5'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={16} className="text-[#F46554]" />
            <div className="text-sm font-semibold">一鍵匯入（推薦）</div>
          </div>
          <div className="text-[11px] text-white/50 leading-snug mb-3">
            檔名就是對位規則，數字＝下面卡片由上而下的順序。
            把 {SLOTS.length} 支<b>全選</b>拖進這個框，或按下面的按鈕多選。
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-white/40">
              <div>深蹲 <b className="text-white/70">蹲1…蹲{SLOTS.filter(s => s.ex === 'squat').length}</b></div>
              <div>臥推 <b className="text-white/70">推1…推{SLOTS.filter(s => s.ex === 'bench_press').length}</b></div>
            </div>
            <div className="mt-1 text-white/35">
              前綴這些寫法都吃得下：深蹲＝<code>蹲 / 深 / 深蹲 / squat / sq</code>、
              臥推＝<code>推 / 臥 / 臥推 / 胸推 / bench / bp</code>。
              大小寫、副檔名、夾雜空格（<code>深 4 .MOV</code>）都無所謂。
            </div>
          </div>
          <motion.button {...pressProps('row')} onClick={() => bulkRef.current?.click()} disabled={running}
 className="w-full py-3 rounded-xl bg-white/10 text-sm font-medium disabled:opacity-40">
            選擇整包影片（可多選）
          </motion.button>
          <input ref={bulkRef} type="file" accept="video/*" multiple className="hidden" onChange={onBulk} />
          {importMsg && (
            <div className={`mt-2 text-[11px] leading-snug ${importMsg.includes('全部到齊') ? 'text-green-400' : 'text-[#F9B49F]'}`}>
              {importMsg}
            </div>
          )}
        </div>

        {/* 20 個上傳點 */}
        <div className="space-y-3">
          {EXS.map(ex => (
            <div key={ex.key} className="rounded-2xl bg-white/5 p-3">
              <div className="text-sm font-semibold mb-2">{ex.zh} <span className="text-white/40 text-[11px]">{SLOTS.filter(s => s.ex === ex.key && files[s.id]).length}/{SLOTS.filter(s => s.ex === ex.key).length} 已選</span></div>

              {/* 【v5.3】機位對照卡 —— 現場架機時看這一格就夠 */}
              <div className="rounded-xl bg-black/25 p-2.5 mb-2 text-[11px] leading-relaxed">
                <div className="text-white/70 font-semibold mb-1.5 text-[11px]">📷 A／B 兩台同時錄，C 最後單獨一輪</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-2" style={{ background: '#3A7CA518', borderLeft: '3px solid #3A7CA5' }}>
                    <div className="font-semibold" style={{ color: '#7FB4D6' }}>A 機位 · {SPEC[ex.key].mainName}</div>
                    <div className="text-white/45 mt-0.5">{SPEC[ex.key].sideAngle}</div>
                    <div className="text-white/30 mt-1">
                      {SLOTS.filter(s => s.ex === ex.key && s.view === 'side').length} 支
                      （{SPEC[ex.key].mainName.includes('側') ? '矢狀面：幅度、深度、軀幹' : '額狀面'}）
                    </div>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: '#7C6BAF18', borderLeft: '3px solid #7C6BAF' }}>
                    <div className="font-semibold" style={{ color: '#B0A4E0' }}>B 機位 · {SPEC[ex.key].subName}</div>
                    <div className="text-white/45 mt-0.5">{SPEC[ex.key].frontAngle}</div>
                    <div className="text-white/30 mt-1">
                      {SLOTS.filter(s => s.ex === ex.key && s.view === 'front').length} 支
                      （{ex.key === 'squat' ? '額狀面：膝內塌、左右對稱' : '額狀面：握距、肘外展'}）
                    </div>
                  </div>
                </div>
                <div className="rounded-lg p-2 mt-2" style={{ background: '#5B9A6B18', borderLeft: '3px solid #5B9A6B' }}>
                  <div className="font-semibold" style={{ color: '#8FC79E' }}>C 機位 · {SPEC[ex.key].natName}（最後單獨拍一輪）</div>
                  <div className="text-white/45 mt-0.5">{SPEC[ex.key].natAngle}</div>
                  <div className="text-white/30 mt-1">
                    {SLOTS.filter(s => s.ex === ex.key && s.view === 'nat').length} 支
                    · A/B 是量角度的兩個端點，C 是<b className="text-white/55">使用者真的會怎麼架</b>；
                    系統會自動從骨架反推 C 實際是幾度
                  </div>
                </div>
                <div className="text-white/35 mt-1.5">
                  標了「⇄ 與第 N 支同時拍」的那一格，就是同一次動作的另一台。
                  三個機位<b className="text-white/55">各自建模</b>，模板不共用。
                  <b className="text-white/55"> C 機位要等 A/B 全部拍完再架</b>，
                  而且架的人就是受測者本人 —— 先看過標準機位就不算「自己找」了。
                </div>
              </div>

              {/* ── 現場總覽清單：26 支一次看完，不用捲過 26 張大卡片 ─────────
                  重新錄影時最需要的是「等一下總共要做幾組、每組做什麼」，
                  上傳卡片一張一頁太慢。這裡壓成一行一支。 */}
              <details className="rounded-xl bg-black/25 p-2.5 mb-2 text-[11px]" open>
                <summary className="text-white/70 font-semibold text-[11px] cursor-pointer select-none">
                  📋 現場清單 · {ex.zh} 共 {SLOTS.filter(s => s.ex === ex.key).length} 支
                  <span className="text-white/30 font-normal">（點一下收合）</span>
                </summary>

                <div className="mt-2 rounded-lg p-2" style={{ background: '#B4553318', borderLeft: '3px solid #B45533' }}>
                  <div className="font-semibold" style={{ color: '#E08A6B' }}>出門前確認</div>
                  <div className="text-white/45 mt-0.5">
                    · <b className="text-white/70">要第二個人（新手 p02）</b>：
                    第 {SLOTS.filter(s => s.ex === ex.key && s.subject === 'p02').map(s => s.seq).join('、')} 支
                    共 {SLOTS.filter(s => s.ex === ex.key && s.subject === 'p02').length} 支要由沒訓練經驗的人做。
                    人沒約到，經驗差異那組結論會開天窗。
                  </div>
                  <div className="text-white/45 mt-0.5">
                    · <b className="text-white/70">C 機位判成「等效正側面」是正常的</b>，不要因此重架。
                    那代表使用者自然架的位置本來就拿不到額狀面 —— 這正是要回答的問題。
                  </div>
                  <div className="text-white/45 mt-0.5">
                    · 每支之間休息 2 分鐘、全程同一個重量、次數<b className="text-white/70">剛好那麼多下</b>。
                  </div>
                </div>

                <div className="mt-2 space-y-px">
                  {SLOTS.filter(s => s.ex === ex.key).map((s, i, arr) => {
                    const tag = VIEW_TAG[s.view];
                    const col = s.view === 'nat' ? '#5B9A6B' : s.view === 'side' ? '#3A7CA5' : '#7C6BAF';
                    const pseq = pairSeqOf(s);
                    // C 機位第一支之前插一條分隔線：現場要換一輪、換架法
                    const newBlock = i > 0 && arr[i - 1].view !== 'nat' && s.view === 'nat';
                    return (
                      <div key={s.id}>
                        {newBlock && (
                          <div className="text-[11px] text-white/40 py-1 mt-1 border-t border-white/10">
                            ↓ 以上 A/B 全部拍完，收掉研究員的機位，
                            <b className="text-white/60">由受測者自己架 C</b>
                          </div>
                        )}
                        <div className={`flex items-center gap-1.5 py-0.5 ${files[s.id] ? 'opacity-40' : ''}`}>
                          <span className="text-white/30 w-9 shrink-0 tabular-nums">
                            {files[s.id] ? '✓' : '☐'} {ex.zh.slice(0, 1)}{s.seq}
                          </span>
                          <span className="shrink-0 px-1 rounded font-bold"
                            style={{ background: col + '30', color: col === '#3A7CA5' ? '#7FB4D6' : col === '#7C6BAF' ? '#B0A4E0' : '#8FC79E' }}>
                            {tag}
                          </span>
                          <span className="text-white/60 shrink-0 tabular-nums">{s.reps} 下</span>
                          <span className={s.quality === 'bad' ? 'text-amber-300/80' : 'text-white/70'}>
                            {shortOf(s)}
                          </span>
                          {pseq && <span className="text-white/25 shrink-0">⇄{ex.zh.slice(0, 1)}{pseq}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-white/30 mt-2 pt-1.5 border-t border-white/10">
                  檔名照序號存成 <b className="text-white/50">{ex.zh.slice(0, 1)}1.MOV … {ex.zh.slice(0, 1)}{SLOTS.filter(s => s.ex === ex.key).length}.MOV</b>，
                  回來用上面的「一鍵匯入」整包丟進來就會自動對位。
                </div>
              </details>

              <div className="space-y-1.5">
                {SLOTS.filter(s => s.ex === ex.key).map(s => {
                  const stt = st[s.id] || {}; const has = !!files[s.id];
                  // 【v5.3】機位提示：A/B 用不同顏色，一眼看出這支要用哪台拍
                  const isA = s.view === 'side';
                  const isC = s.view === 'nat';
                  const camColor = isC ? '#5B9A6B' : isA ? '#3A7CA5' : '#7C6BAF';
                  const camText = isC ? '#8FC79E' : isA ? '#7FB4D6' : '#B0A4E0';
                  const camName = viewZh(s.ex, s.view);
                  const pSeq = pairSeqOf(s);
                  return (
                    <div key={s.id} className="rounded-xl bg-black/20 p-2"
                      style={{ borderLeft: `3px solid ${camColor}` }}>
                      <div className="flex items-center gap-2">
                        <motion.button {...pressProps('icon')} onClick={() => pick(s.id)} disabled={running} className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${has ? 'bg-green-500/20' : 'bg-[#F46554]/80'}`}>
                          {stt.state === 'done' ? <CheckCircle2 size={16} className="text-green-400" /> : stt.state === 'error' ? <XCircle size={16} className="text-red-400" /> : (stt.state === 'uploading' || stt.state === 'analyzing') ? <Loader size={16} className="animate-spin" /> : <Upload size={15} />}
                        </motion.button>
                        <div className="flex-1 min-w-0">
                          {/* 機位徽章 + 檔名序號 —— 現場最需要看到的兩件事 */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="text-[11px] px-1.5 py-[1px] rounded font-semibold shrink-0"
                              style={{ background: camColor + '22', color: camText }}>
                              📷 {isA ? 'A' : 'B'}機位 · {camName}
                            </span>
                            <span className="text-[11px] px-1.5 py-[1px] rounded bg-white/8 text-white/50 shrink-0">
                              檔名 {s.ex === 'squat' ? '蹲' : '推'}{s.seq}
                            </span>
                            {pSeq && (
                              <span className="text-[11px] text-white/35 shrink-0">
                                ⇄ 與第 {pSeq} 支同時拍
                              </span>
                            )}
                            {isC && (
                              <span className="text-[11px] shrink-0" style={{ color: '#8FC79E' }}>
                                ⚑ 自己架、角度不限
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] leading-tight truncate">{s.zh} <span className="text-white/35">#{s.idx}</span>{s.build && <span className="text-[#F9B49F]"> · 建模</span>}</div>
                          <div className="text-[11px] text-white/45 leading-snug">{specOf(s)}</div>
                          <div className={`text-[11px] leading-tight truncate mt-0.5 ${stColor(stt.state)}`}>
                            {stt.state === 'done' ? (s.build ? '建模完成' : stt.scoreVoid ? `不評分 · ${stt.reps} 次` : `分數 ${stt.score} · ${stt.reps} 次${stt.reps != null && !s.build && s.quality === 'good' && stt.reps !== s.reps ? `（應為 ${s.reps}）` : ''}`) : stt.state === 'error' ? '失敗' : has ? (stt.state === 'uploading' ? '上傳中' : stt.state === 'analyzing' ? '分析中' : (files[s.id]?.name || '已選')) : '未選影片'}
                          </div>
                          {stt.state === 'done' && stt.viewDeg != null && (() => {
                            // 目標角度：主機位（side）= 90°、對照機位（front）= 0°
                            // 【v5.8】只顯示數值，**不判定「偏離」**。
                            //   從骨架反推機位角度的方法對「軀幹長」的定義非常敏感：
                            //   MediaPipe 的髖點稍微偏低，肩寬/軀幹長就從解剖值 0.76
                            //   掉到 0.445，換算出來一律變成 ~55°。實測三種機位
                            //   （正側面 90°、正上方 0°、正面 0°）全都被判成 48–58°，
                            //   等於在對拍對的人亂噴紅字。在方法本身可靠之前，
                            //   這個數字只當參考，不當判定。
                            return (
                              <div className="text-[11px] leading-snug mt-0.5 text-white/30">
                                幾何角度粗估 {stt.viewDeg}°（僅參考，此估計法不可靠）
                              </div>
                            );
                          })()}
                          {/* 【v5.8】真正的機位判定：左右肢體活動範圍比。
                              比幾何角度可靠，而且直接說明「這個機位遮住了什麼」。 */}
                          {stt.state === 'done' && stt.countConf === 'low' && (
                            <div className="text-[11px] leading-snug mt-0.5 text-red-400">
                              ⚠️ 次數信心度低（候選訊號共識 {stt.countConsensus || '—'}）——
                              不同訊號數出來的次數不一致，這支的次數與分數都不要進統計
                            </div>
                          )}
                          {stt.state === 'done' && stt.bv && (
                            <div className={`text-[11px] leading-snug mt-0.5 ${stt.bv.ratio >= 0.7 ? 'text-white/45' : stt.bv.ratio >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                              左右對稱度 {Math.round(stt.bv.ratio * 100)}%
                              {stt.bv.occluded_side
                                /* ⚠️ ranges 在 basis='visibility' 時是**可見度 0–1**，不是角度。
                                   之前一律加「°」，0.255 看起來像「膝角只動 0.255 度」，
                                   會被誤讀成訊號壞掉；其實是「這一側只有 25.5% 看得到」。 */
                                ? ` · ${stt.bv.occluded_side} 被遮擋（${Object.entries(stt.bv.ranges)
                                  .map(([k, v]) => stt.bv.basis === 'visibility'
                                    ? `${k} 可見度 ${Math.round(v * 100)}%`
                                    : `${k} ${v}°`).join(' / ')}）`
                                : ' · 兩側都看得到'}
                            </div>
                          )}
                          {stt.state === 'done' && stt.framing && stt.framing.in_frame_ratio < 0.98 && (
                            <div className={`text-[11px] leading-snug mt-0.5 ${stt.framing.in_frame_ratio >= 0.9 ? 'text-amber-400' : 'text-red-400'}`}>
                              取景 {Math.round(stt.framing.in_frame_ratio * 100)}% 全身在框內
                              {Object.keys(stt.framing.joints || {}).length
                                ? ` · 出框：${Object.entries(stt.framing.joints).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join('、')}`
                                : ''}
                            </div>
                          )}
                          {/* 【v7】次數的可信度改由「多條候選訊號的共識」決定，
                              不再說「這個機位量不到動作平面」——那句話對正側面
                              是錯的（正側面量得到腕高度，共識通常很好）。
                              實測：低信心的 6 支全部真的數錯，高信心 29/34 正確。 */}
                          {stt.state === 'done' && stt.repOk === false && stt.countConf !== 'low' && (
                            <div className="text-[11px] leading-snug mt-1 px-1.5 py-1 rounded"
                              style={{ background: '#D9A44122', color: '#E8C77A' }}>
                              ⚠️ 計次訊號本身活動範圍不足{stt.segWhy ? `（${stt.segWhy}）` : ''}，
                              次數可能不準。
                            </div>
                          )}
                          {/* 【v7】改掉「分數不可信：只剩 N 個指標」這個誤導性的訊息。
                              正側面與正面本來就量不同平面的東西 —— 正側面量得到
                              深度與軀幹前傾、量不到膝內夾，那是**幾何事實不是故障**。
                              拿「7 個指標」當基準去喊不可信，等於把系統正常運作
                              當成錯誤，而且會把真正的異常淹沒掉。

                              改成跟**同機位的其他影片**比：同一個機位下，每支影片
                              應該量到差不多的東西（指標集是建模階段一次決定、
                              該機位所有影片共用的）。明顯比同儕少，才是真的有問題。 */}
                          {stt.state === 'done' && stt.scoreVoid && (
                            <div className="text-[11px] leading-snug mt-1 px-1.5 py-1 rounded"
                              style={{ background: '#C1553C33', color: '#F9B49F' }}>
                              ⛔ 此機位不評分：{stt.scoreVoidReason || '量到的指標太少'}
                            </div>
                          )}
                          {/* 【v8.2】計次可信度。低可信度不是「這支壞掉」，
                              是「這個角度在物理上就數不準」—— 講清楚原因跟替代方案。 */}
                          {stt.state === 'done' && stt.countRel
                            && stt.countRel.level === 'low' && (
                            <div className="text-[11px] leading-snug mt-1 px-1.5 py-1 rounded"
                              style={{ background: '#E8B87A22', color: '#E8B87A' }}>
                              🔢 次數需要確認：{stt.countRel.reason}
                              {stt.countRel.advice && (
                                <div style={{ color: '#FFFFFF80' }}>{stt.countRel.advice}</div>
                              )}
                            </div>
                          )}
                          {/* 【v8】分數的「保固範圍」。不是警告，是說明書 ——
                              每個角度本來就只看得到某些平面的錯誤，講清楚它管到哪裡，
                              比含糊地喊「分數可能不準」有用得多。 */}
                          {stt.state === 'done' && !stt.scoreVoid
                            && (stt.canDetect?.length > 0 || stt.cannotDetect?.length > 0) && (
                            <div className="text-[11px] leading-snug mt-1 px-1.5 py-1 rounded space-y-0.5"
                              style={{ background: '#FFFFFF0A', color: '#FFFFFFB0' }}>
                              {stt.scoredMetrics?.length > 0 && (
                                <div style={{ color: '#FFFFFF80' }}>
                                  計分指標 {stt.scoredMetrics.length} 項：{stt.scoredMetrics.join('、')}
                                </div>
                              )}
                              {stt.canDetect?.length > 0 && (
                                <div style={{ color: '#8FD9A8' }}>
                                  ✅ 這個角度抓得到：{stt.canDetect.map(e => e.name).join('、')}
                                </div>
                              )}
                              {stt.cannotDetect?.length > 0 && (
                                <div style={{ color: '#E8B87A' }}>
                                  ⛔ 抓不到：{stt.cannotDetect.map(e => e.name).join('、')}
                                  <span style={{ color: '#FFFFFF55' }}>（換角度才量得到）</span>
                                </div>
                              )}
                            </div>
                          )}
                          {stt.state === 'done' && stt.mr != null && (() => {
                            const peers = SLOTS.filter(x => x.ex === s.ex && x.view === s.view && !x.build)
                              .map(x => st[x.id]).filter(x => x && x.state === 'done' && x.mr != null);
                            const med = peers.length >= 2
                              ? peers.map(p => p.mr).sort((a, b) => a - b)[Math.floor(peers.length / 2)]
                              : null;
                            // 只有「比同機位同儕明顯低」才算異常
                            const below = med != null && stt.mr < med - 0.15;
                            const famZh = s.view === 'side' ? '矢狀面系'
                              : '額狀面系';
                            const famWhat = s.view === 'side'
                              ? (s.ex === 'squat' ? '前後／上下的量：蹲深、軀幹前傾、近側膝角'
                                : '前後／上下的量：前臂垂直、槓路、近側肘角')
                              : (s.ex === 'squat' ? '左右的量：膝內夾、左右對稱、雙膝角'
                                : '左右的量：握距、肘外展、左右對稱');
                            return (
                              <>
                                <div className={`text-[11px] leading-snug mt-0.5 ${below ? 'text-red-400' : 'text-white/40'}`}>
                                  {famZh} · 量到 {stt.nMetrics ?? '?'} 個指標（{Math.round(stt.mr * 100)}%）
                                  <span className="text-white/30"> — {famWhat}</span>
                                  {stt.dropped?.length ? (
                                    <span className="text-white/30"> · 此平面量不到：{stt.dropped.join('、')}</span>
                                  ) : ''}
                                </div>
                                {below && (
                                  <div className="text-[11px] leading-snug mt-1 px-1.5 py-1 rounded"
                                    style={{ background: '#E1613F22', color: '#F9B49F' }}>
                                    ⚠️ 這支比同機位其他影片少量到東西
                                    （{Math.round(stt.mr * 100)}% vs 同機位中位數 {Math.round(med * 100)}%）
                                    —— 不是機位的問題，是這支影片本身有狀況（遮擋、出框或骨架追丟）。
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {stt.state === 'error' && stt.err && <div className="text-[11px] text-red-300/80 leading-snug mt-0.5 whitespace-pre-wrap">{stt.err}</div>}
                        </div>
                      </div>
                      {(stt.pct != null && stt.state !== 'ready') && <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#F46554]" style={{ width: `${stt.pct}%` }} /></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onFile} />

        {/* 開始分析 + 總進度 */}
        <div className="rounded-2xl bg-white/5 p-4 space-y-2 sticky bottom-2">
          {fatal && <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-2.5 text-[11px] text-red-200 leading-snug whitespace-pre-wrap">{fatal}</div>}
          <motion.button {...pressProps('row')} onClick={run} disabled={running || chosen === 0} className="w-full py-4 rounded-2xl bg-[#F46554] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 ">
            <Play size={18} /> {running ? '分析中…' : `開始分析（${chosen} 支）`}
          </motion.button>
          {(running || total > 0) && (
            <div><div className="flex justify-between text-xs mb-1"><span>總進度</span><span>{total}%</span></div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#F46554] transition-all" style={{ width: `${total}%` }} /></div>
              {/* 【v7】52 支跑起來要十幾分鐘，不顯示階段會看不出卡在哪。
                  而且「建模先跑完才跑受測」這件事本身要讓人看得見 ——
                  可觀測性判定與分數尺規都是建模階段算的。 */}
              {phase && <div className="text-[11px] text-white/45 mt-1">{phase}</div>}</div>
          )}
        </div>

        {/* 結果圖表 */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold">研究圖表</div>
              <motion.button {...pressProps('row')} onClick={dlAll} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs flex items-center gap-1"><Download size={14} /> 下載全部 JSON</motion.button></div>

            {/* ══════════════════════════════════════════════════════════
                【v7】平面族三張核心圖 —— 放最前面，這是實驗的主結論
                ══════════════════════════════════════════════════════════ */}

            {/* ── V1 平面族判定 ───────────────────────────────────── */}
            {planeFamily.map(({ ex: e, rows }) => (
              <Card key={`pf_${e.key}`} title={`${e.zh} · V1 平面族判定`}
                sub="機位歸屬是從骨架量出來的，不是事先指定">
                <div className="space-y-1.5">
                  {rows.map(r => {
                    const col = r.fam === '矢狀面系' ? '#3A7CA5' : r.fam === '額狀面系' ? '#5B9A6B' : '#D69E2E';
                    return (
                      <div key={r.view} className="text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="w-24 shrink-0 text-gray-600">{r.zh}</span>
                          <div className="flex-1 h-4 rounded bg-gray-200 relative overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${r.ratio * 100}%`, background: col }} />
                            <div className="absolute inset-y-0" style={{ left: '40%', width: 1, background: '#C1553C' }} />
                            <div className="absolute inset-y-0" style={{ left: '70%', width: 1, background: '#4F9D69' }} />
                          </div>
                          <span className="w-28 shrink-0 text-right font-semibold" style={{ color: col }}>
                            {r.ratio.toFixed(2)} {r.fam}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 pl-24">
                          {r.la} {r.a.toFixed(2)} / {r.lb} {r.b.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                  左右成對肢體的可見度比。<b>&lt; 0.40</b> 一側被擋 = 矢狀面系（量前後/上下）；
                  <b> ≥ 0.70</b> 兩側都看得到 = 額狀面系（量左右）。
                  兩條細線就是門檻。
                </div>
              </Card>
            ))}

            {/* ── V2 可觀測性矩陣 ─────────────────────────────────── */}
            {observability.map(({ ex: e, labs, rows }) => (
              <Card key={`ob_${e.key}`} title={`${e.zh} · V2 可觀測性矩陣`}
                sub="每個機位量得到哪些指標（數字＝實測可見度）">
                <div className="overflow-x-auto">
                  <table className="text-[11px] w-full">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left pr-1 font-normal">機位</th>
                        {labs.map(l => <th key={l} className="px-0.5 font-normal" style={{ writingMode: 'vertical-rl' }}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.view}>
                          <td className="pr-1 text-gray-600 whitespace-nowrap">{r.zh}</td>
                          {r.cells.map(c => {
                            const v = c.vis;
                            const bg = v == null ? '#EEE' : v >= 0.8 ? '#4F9D6933' : v >= 0.55 ? '#D69E2E33' : '#C1553C33';
                            const fg = v == null ? '#999' : v >= 0.55 ? '#2B2B2B' : '#C1553C';
                            return (
                              <td key={c.lab} className="px-0.5 py-1 text-center"
                                style={{ background: bg, color: fg, fontWeight: c.used ? 700 : 400 }}>
                                {v == null ? '—' : v.toFixed(2)}<br />
                                <span className="text-[11px]">{c.used ? '計分' : '不計'}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-500 mt-2">
                  粗體＝實際進入計分。可見度高卻標「不計」，代表被投影退化或先驗規則擋掉。
                </div>
              </Card>
            ))}

            {/* ── V3【核心】跨平面族 vs 同平面族 ──────────────────── */}
            {transferability.map(({ ex: e, rows }) => {
              const mx = Math.max(...rows.flatMap(r => [r.cross, r.within]), 20);
              return (
                <Card key={`tf_${e.key}`} title={`${e.zh} · V3 預建模板能不能轉移`}
                  sub="同一個人同樣的標準動作，換機位後指標值差多少">
                  <div className="space-y-2">
                    {rows.map(r => (
                      <div key={r.lab}>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="text-gray-700">{r.lab}{r.isDiff && <span className="text-amber-600"> ◆</span>}</span>
                          <span className="text-gray-400">
                            跨族 {r.cross.toFixed(0)}%　族內 {r.within.toFixed(0)}%
                            {r.within < 15 && !r.isDiff && <b style={{ color: '#4F9D69' }}> ✓ 可轉移</b>}
                          </span>
                        </div>
                        <div className="h-2 rounded bg-gray-100 mb-0.5">
                          <div className="h-full rounded" style={{ width: `${Math.min(100, r.cross / mx * 100)}%`, background: '#C1553C' }} />
                        </div>
                        <div className="h-2 rounded bg-gray-100">
                          <div className="h-full rounded" style={{ width: `${Math.min(100, r.within / mx * 100)}%`, background: '#4F9D69' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                    <span style={{ color: '#C1553C' }}>■ 跨平面族</span>（A 正側面 vs B）
                    <span style={{ color: '#4F9D69' }}>■ 同平面族內</span>（B vs C 自選）<br />
                    綠條明顯比紅條短 = <b>預建模板可在同平面族內轉移</b>，跨族不可。
                    <span className="text-amber-600">◆</span> 是差值型指標（兩個帶雜訊的量相減，雜訊放大），族內也不穩。
                  </div>
                </Card>
              );
            })}

            {/* ══ 圖 S9【最終裁決】機位總評分 —— 放在最前面，這是整個實驗的結論 ══
                不能直接比兩個機位的平均總分：指標集合不同、權重不同，
                85 分和 85 分代表的不是同一件事。改成比五個「結果面」的指標，
                它們都與指標集合無關。合成權重本身也是主觀的，所以另外跑
                敏感度分析：隨機 200 組權重，看勝出者換不換人。 */}
            {/* 資料不足時明說，不要硬給答案 */}
            {viewVerdict.filter(v => v.notReady && v.comps.length > 0).map(({ ex: e, comps, live = [], dead = [] }) => (
              <Card key={`vvn_${e.key}`} title={`${e.zh} · 機位最終裁決`}
                sub="資料不足，無法裁決">
                <div className="text-[11px] leading-relaxed" style={{ color: '#B4622F' }}>
                  這個動作還不能比較機位，缺的部分：
                  <ul className="mt-1 space-y-0.5">
                    {comps.map(c => (
                      <li key={c.vw}>
                        · <b>{c.name}</b>（{c.n} 支）
                        {c.voided ? '：⛔ 系統判定不給分（不是缺資料）'
                          : c.missing?.length ? `：${c.missing.join('、')}` : '：✓ 資料完整'}
                      </li>
                    ))}
                    {live.length < 2 && dead.length > 0 &&
                      <li>· 扣掉被作廢的機位後，剩下不到兩個可比較</li>}
                    {comps.length < 2 && <li>· 只有一個機位有資料</li>}
                  </ul>
                  <div className="mt-2 text-[#9AA0A6]">
                    錯誤覆蓋率與鑑別度都需要**該機位自己的刻意錯影片**。
                    照 v3 拍攝清單兩台手機同時拍，兩個機位各有 2 支刻意錯 + 3 支標準，就跑得出來了。
                  </div>
                </div>
              </Card>
            ))}

            {viewVerdict.filter(v => v.verdict).map(({ ex: e, comps, live, dead, axes, verdict, robust, radar }) => {
              const win = verdict[0], lose = verdict[1];
              const decisive = robust.pct >= 80;
              // 表格與雷達圖只呈現參與比較的機位；被作廢的另外列在下方，
              // 附上物理原因 —— 它不是「表現差」，是「根本量不到」。
              const cols = live;
              return (
                <Card key={`vv_${e.key}`}
                  title={`🏆 ${e.zh} · 機位最終裁決`}
                  sub={decisive
                    ? `${win.name} 勝出（總評分 ${(win.s * 100).toFixed(0)} vs ${(lose.s * 100).toFixed(0)}）`
                    : `⚠ 勝負不穩定，兩個機位各有所長`}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <div className="text-2xl font-bold" style={{ color: decisive ? GREEN : AMBER }}>
                      {win.name}
                    </div>
                    <div className="text-[11px] text-[#9AA0A6]">
                      {(win.s * 100).toFixed(0)} / 100
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={210}>
                    <RadarChart data={radar} outerRadius="72%">
                      <PolarGrid stroke="#EAE7E1" />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      {/* 【v8】三個機位要三種顏色。舊版用 [TEAL, CORAL][i % 2]，
                          第 3 個機位（自選）會跟第 1 個（正側面）撞成同一個藍，
                          圖例上完全分不出來。 */}
                      {cols.map((c, i) => (
                        <Radar key={c.vw} name={c.name} dataKey={c.name}
                          stroke={[TEAL, CORAL, PURP][i % 3]} fill={[TEAL, CORAL, PURP][i % 3]}
                          fillOpacity={0.20} />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto -mx-1 px-1 mt-1">
                    <table className="w-full text-[11px] border-collapse">
                      <thead><tr className="text-left text-[#9AA0A6]">
                        <th className="py-1 pr-2 font-medium">評比項目</th>
                        <th className="py-1 px-1 font-medium text-right">權重</th>
                        {cols.map(c => <th key={c.vw} className="py-1 pl-2 font-medium text-right">{c.name}</th>)}
                      </tr></thead>
                      <tbody>
                        {axes.map(a => (
                          <tr key={a.key}>
                            <td className="py-1 pr-2">{a.zh}</td>
                            <td className="py-1 px-1 text-right text-[#9AA0A6]">{(a.w * 100).toFixed(0)}%</td>
                            {cols.map(c => {
                              const v = a.f(c);
                              const all = cols.map(x => a.f(x)).filter(x => x != null);
                              const isTop = v != null && all.length > 1 && v >= Math.max(...all);
                              return <td key={c.vw} className="py-1 pl-2 text-right"
                                style={{ color: isTop ? GREEN : undefined, fontWeight: isTop ? 600 : 400 }}>
                                {v == null ? '—' : `${(v * 100).toFixed(0)}%`}
                              </td>;
                            })}
                          </tr>
                        ))}
                        <tr className="border-t border-[#EAE7E1]">
                          <td className="py-1 pr-2 font-semibold">機位總評分</td>
                          <td />
                          {cols.map(c => {
                            const s = verdict.find(v => v.vw === c.vw)?.s ?? 0;
                            return <td key={c.vw} className="py-1 pl-2 text-right font-bold"
                              style={{ color: c.vw === win.vw ? GREEN : undefined }}>
                              {(s * 100).toFixed(0)}
                            </td>;
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* 被系統作廢的機位：不參與排名，但一定要列出來。
                      它在這張表上缺席不是因為沒資料，而是因為結論已經下了 ——
                      漏掉的話，讀者會以為我們只測了兩個機位。 */}
                  {(dead || []).length > 0 && (
                    <div className="mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
                      style={{ background: '#FCF3F2', border: '1px solid #E8C4BE', color: '#8A4A3C' }}>
                      <b>⛔ 未納入比較的機位</b>
                      {(dead || []).map(c => (
                        <div key={c.vw} className="mt-1">
                          · <b>{c.name}</b>（{c.n} 支）：系統判定不給分，因此沒有分數可以參與加權排名。
                          <div className="mt-0.5 text-[#9A6A5C]">{c.voidReason}</div>
                        </div>
                      ))}
                      <div className="mt-1.5 text-[#9A6A5C]">
                        這不是「表現差」，是「量不到」—— 判準來自骨長左右對稱性這個物理約束，
                        與分數高低無關。對產品而言，結論比排名更強：這個角度不該被使用。
                      </div>
                    </div>
                  )}
                  <div className="text-[11px] mt-2 leading-relaxed"
                    style={{ color: decisive ? '#9AA0A6' : '#B4622F' }}>
                    <b>敏感度分析：</b>隨機抽 200 組合成權重，{viewZh(e.key, robust.vw)} 在 <b>{robust.pct}%</b> 的配置下勝出。
                    {decisive
                      ? '　結論對權重不敏感，可以直接採用。'
                      : '　勝負會隨權重翻盤 —— 代表兩個機位各有所長，不該單選。這本身就是結論：單機位有結構性上限。'}
                    <br />
                    註：不能直接比兩個機位的平均總分（指標集合與權重都不同，85 分 ≠ 85 分）。
                    這裡比的五項都是<b>結果面</b>的指標，與用了哪些指標無關。
                    {win.n ? '' : ''}
                  </div>
                  {cols.some(c => c.errTypes?.length) && (
                    <div className="text-[11px] text-[#9AA0A6] mt-1 leading-relaxed">
                      錯誤覆蓋（連續計分：每種錯誤記 min(掉分/20, 1) 再平均，
                      20 分＝完全抓到）：{cols.map(c =>
                        `${c.name} ${c.cover == null ? '—' : (c.cover * 100).toFixed(0) + '%'}`
                        + `（完全抓到 ${c.caught.length}/${c.errTypes.length}）`
                      ).join('　·　')}
                      <br />
                      逐項掉分：{cols.map(c =>
                        `${c.name}〔${(c.coverDetail || []).map(x =>
                          `${x.et} ${x.drop == null ? '—' : (x.drop >= 0 ? '+' : '') + x.drop.toFixed(1)}`
                        ).join('／')}〕`
                      ).join('　')}
                      {/* 訊號量得到、但沒轉成分數的部分。這是可改進空間，不是已交付的能力，
                          所以獨立一行、也不進總評分 —— 避免替交付不出來的能力背書。 */}
                      {cols.some(c => (c.coverSignal ?? 0) > (c.cover ?? 0)) && (
                        <>
                          <br />
                          <span className="text-[#B57A19]">
                            訊號層面其實量得到的：{cols.map(c =>
                              `${c.name} ${(c.caughtSignal || []).length}/${c.errTypes.length}`
                            ).join('　·　')}
                            　→ 與上面的差額 ＝「量得到但沒轉成分數」，屬於換指標／調權重可改善的空間，
                            不計入這個機位目前的交付能力。
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}

            {/* DBA 建模（每動作） */}
            {EXS.filter(e => tplDbg[e.key]).map(e => {
              const d = tplDbg[e.key];
              const lenData = (d.con_lengths || []).map((c, i) => ({ rep: i + 1, con: c, ecc: d.ecc_lengths?.[i] }));
              const L = (d.template_seg_curve || []).length;
              const resData = Array.from({ length: L }, (_, i) => { const row = { i, template: d.template_seg_curve[i] }; (d.resampled_seg_curves || []).slice(0, 4).forEach((c, k) => row['r' + k] = c[i]); return row; });
              // 【v8.5】圖上畫的指標，與「用來把 rep 對齊」的訊號可能不是同一條 ——
              //   不標清楚會讓人以為曲線亂跳＝演算法壞掉。舊版一律畫第 0 欄
              //   （L Knee／L Elbow），而正側面時那正是被遮擋的遠側肢體。
              //
              // 【v8.6】Y 軸自動縮放。舊版讓 recharts 自己決定，實際上會從 0 起算，
              //   於是「動態範圍小的指標」看起來像一條直線：
              //     深蹲正側面  R Knee            單 rep 振幅 108.4°  → 圖上很戲劇化
              //     臥推正側面  Forearm Vertical  單 rep 振幅  13.3°  → 畫在 0–100 軸上全平
              //   兩者的 DBA 收斂程度其實差不多（抹掉 4% vs 27%，都正常）。
              //   「臥推怎麼那麼平」是**軸的問題，不是資料的問題** —— 這種視覺假象
              //   會讓人誤判演算法失效，必須修掉。
              //   做法：取所有曲線的真實範圍，上下各留 8% 邊界。
              const _vals = resData.flatMap(r => Object.entries(r)
                .filter(([k]) => k !== 'i').map(([, v]) => v))
                .filter(v => typeof v === 'number' && isFinite(v));
              const _lo = _vals.length ? Math.min(..._vals) : 0;
              const _hi = _vals.length ? Math.max(..._vals) : 1;
              const _pad = Math.max((_hi - _lo) * 0.08, 1e-6);
              const yDomain = _vals.length
                ? [+(_lo - _pad).toFixed(2), +(_hi + _pad).toFixed(2)]
                : ['auto', 'auto'];
              const _amp = _hi - _lo;
              return (
                <Card key={e.key} title={`${e.zh} · DBA 建模`}
                  sub={`L=${d.L}（向心${d.median_con}/離心${d.median_ecc}）· 圖示指標 ${d.segment_metric_label}`
                    + `（振幅 ${_amp.toFixed(1)}）`
                    + (d.align_signal ? `　│　rep 對齊用 ${d.align_signal.replace('counting:', '')}` : '')}>
                  <div className="grid grid-cols-1 gap-2">
                    <ResponsiveContainer width="100%" height={150}><BarChart data={lenData} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="rep" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="con" name="向心" fill={CORAL} /><Bar dataKey="ecc" name="離心" fill={TEAL} /></BarChart></ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={160}><LineChart data={resData} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="i" tick={{ fontSize: 11 }} /><YAxis domain={yDomain} tick={{ fontSize: 11 }} allowDecimals /><Tooltip />{[0, 1, 2, 3].map(k => <Line key={k} dataKey={'r' + k} stroke="#B9C4CE" dot={false} strokeWidth={1} isAnimationActive={false} />)}<Line dataKey="template" name="DBA 模板" stroke={CORAL} dot={false} strokeWidth={2.4} isAnimationActive={false} /></LineChart></ResponsiveContainer>
                    <div className="text-[11px] text-[#9AA0A6] -mt-1 leading-relaxed">
                      Y 軸依實際範圍縮放（{yDomain[0]}–{yDomain[1]}），不從 0 起算 ——
                      不同指標的量綱差很多（膝角擺盪逾 100°、前臂垂直度只有十幾度），
                      固定軸會讓後者看起來像沒在動。灰線為各支建模影片，紅線為 DBA 收斂後的模板。
                    </div>
                    {(d.dba_convergence || []).length > 0 && <ResponsiveContainer width="100%" height={140}><LineChart data={d.dba_convergence} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="iter" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line dataKey="change" name="DBA 收斂" stroke={CORAL} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} /></LineChart></ResponsiveContainer>}
                  </div>
                </Card>
              );
            })}

            {/* 有經驗 vs 新手（每動作，headline） */}
            {EXS.map(e => {
              // ⚠️ 必須排除 quality==='bad'：刻意錯影片的組別也是 exp，
              //    不濾掉會把「有經驗」的平均硬拉低，經驗差異就被自己的錯誤示範洗掉。
              const arr = byEx(e.key);
              const exp = scoresOf(arr, r => r.source.group === 'exp' && r.source.quality === 'good');
              const nov = scoresOf(arr, r => r.source.group === 'nov' && r.source.quality === 'good');
              if (!exp.length || !nov.length) return null;
              return <Card key={e.key} title={`${e.zh} · 有經驗 vs 新手`} sub={`差 ${(mean(exp) - mean(nov)).toFixed(1)} 分（越大＝越分得出經驗）`}>
                <ResponsiveContainer width="100%" height={160}><BarChart data={[{ g: '有經驗', v: +mean(exp).toFixed(1) }, { g: '新手', v: +mean(nov).toFixed(1) }]} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="g" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="v" radius={[6, 6, 0, 0]}><Cell fill={GREEN} /><Cell fill={AMBER} /></Bar></BarChart></ResponsiveContainer>
              </Card>;
            })}

            {/* 好 vs 壞 */}
            {EXS.map(e => {
              const arr = byEx(e.key); const good = scoresOf(arr, r => r.source.quality === 'good'); const bad = scoresOf(arr, r => r.source.quality === 'bad');
              if (!good.length || !bad.length) return null;
              return <Card key={e.key} title={`${e.zh} · 標準 vs 刻意錯`} sub={`差 ${(mean(good) - mean(bad)).toFixed(1)} 分（抓得到錯）`}>
                <ResponsiveContainer width="100%" height={150}><BarChart data={[{ g: '標準', v: +mean(good).toFixed(1) }, { g: '刻意錯', v: +mean(bad).toFixed(1) }]} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="g" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="v" radius={[6, 6, 0, 0]}><Cell fill={GREEN} /><Cell fill={CORAL} /></Bar></BarChart></ResponsiveContainer>
              </Card>;
            })}

            {/* ══ 圖 S1【改版】機位比較：哪個角度真的比較好？ ══════════════
                舊版只比兩個機位的平均分數，但那沒有意義——不同機位量到的是
                不同的量，分數高低可能純粹來自投影差異（實測同一個深蹲，
                Torso Lean 在兩個機位分別是 15.68° 和 3.87°）。
                要回答「哪個角度好」，必須三個指標一起看。 */}
            {viewCompare.filter(v => v.rows.length > 0).map(({ ex: e, rows, best }) => (
              <Card key={`vc_${e.key}`} title={`${e.zh} · 機位比較（哪個角度最好）`}
                sub={best ? `勝出：${best.name}${best.d != null ? `　鑑別度 d=${best.d}` : ''}` : '需要兩個機位都有資料'}>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-[11px] border-collapse">
                    <thead><tr className="text-left text-[#9AA0A6]">
                      <th className="py-1 pr-2 font-medium">機位</th>
                      <th className="py-1 px-1 font-medium text-right">n</th>
                      <th className="py-1 px-1 font-medium text-right">可交付率</th>
                      <th className="py-1 px-1 font-medium text-right">有效權重</th>
                      <th className="py-1 px-1 font-medium text-right">標準</th>
                      <th className="py-1 px-1 font-medium text-right">刻意錯</th>
                      <th className="py-1 pl-1 font-medium text-right">d</th>
                    </tr></thead>
                    <tbody>{rows.map(r => (
                      <tr key={r.vw} className={r === best ? 'font-semibold' : ''}
                        style={{ color: r === best ? GREEN : undefined }}>
                        <td className="py-1 pr-2">{r.name}{r === best ? ' ★' : ''}</td>
                        <td className="py-1 px-1 text-right">{r.n}</td>
                        <td className="py-1 px-1 text-right">{r.vq != null ? `${r.vq}%` : '—'}</td>
                        <td className="py-1 px-1 text-right">{r.mr != null ? `${r.mr}%` : '—'}</td>
                        <td className="py-1 px-1 text-right">{r.good ?? '—'}</td>
                        <td className="py-1 px-1 text-right">{r.bad ?? '—'}</td>
                        <td className="py-1 pl-1 text-right"
                          style={{ color: r.d == null ? undefined : (r.d >= 0.8 ? GREEN : CORAL) }}>
                          {r.d ?? '—'}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="vq" name="可交付率%" fill={PURP} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="good" name="標準組分數" fill={GREEN} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="bad" name="刻意錯分數" fill={CORAL} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-[11px] text-[#9AA0A6] mt-1 leading-relaxed">
                  可交付率＝這個機位能真的算出多少比例的評分權重；有效權重＝實際計入分數的比例。
                  兩者都低而分數卻很高，代表分數是少數指標撐起來的，不可信。
                  d ≥ 0.8 才代表這個機位分得出好壞。
                </div>
              </Card>
            ))}

            {/* ══ 圖 S8【新·最重要】逐指標 × 逐機位：同一個指標，哪個角度量得最好？ ══
                比較兩個機位不能比「可交付率」——那只反映權重怎麼配，是循環論證；
                而且兩個機位測的指標集合若不重疊，根本沒得比。
                改成同一個指標在兩個機位各量一次，用與機位無關的品質標準比。 */}
            {metricByView.filter(m => m.rows.length > 0).map(({ ex: e, rows, votes }) => {
              const win = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
              return (
                <Card key={`mbv_${e.key}`} title={`${e.zh} · 逐指標機位比較（同一指標哪個角度最好）`}
                  sub={win ? `${viewZh(e.key, win[0])} 在 ${win[1]}/${rows.length} 個指標上勝出` : '需要兩個機位都有刻意錯資料'}>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-left text-[#9AA0A6]">
                          <th className="py-1 pr-2 font-medium" rowSpan={2}>指標</th>
                          {VIEW_KEYS.map(vw => (
                            <th key={vw} className="py-1 px-1 font-medium text-center border-l border-[#EAE7E1]" colSpan={2}>
                              {viewZh(e.key, vw)}
                            </th>
                          ))}
                          <th className="py-1 pl-1 font-medium text-right" rowSpan={2}>勝出</th>
                        </tr>
                        <tr className="text-left text-[#9AA0A6]">
                          {VIEW_KEYS.map(vw => ([
                            <th key={`${vw}r`} className="py-1 px-1 font-normal text-right border-l border-[#EAE7E1]">反應</th>,
                            <th key={`${vw}c`} className="py-1 px-1 font-normal text-right">CV</th>,
                          ]))}
                        </tr>
                      </thead>
                      <tbody>{rows.map(r => (
                        <tr key={r.metric}>
                          <td className="py-1 pr-2">{r.metric}</td>
                          {VIEW_KEYS.map(vw => ([
                            <td key={`${vw}r`} className="py-1 px-1 text-right border-l border-[#EAE7E1]"
                              style={{ color: r[`${vw}_resp`] == null ? undefined : (r[`${vw}_resp`] > 1.8 ? GREEN : (r[`${vw}_resp`] < 1.3 ? CORAL : undefined)) }}>
                              {r[`${vw}_resp`] != null ? `${r[`${vw}_resp`]}×` : '—'}
                            </td>,
                            <td key={`${vw}c`} className="py-1 px-1 text-right text-[#9AA0A6]">
                              {r[`${vw}_cv`] != null ? `${r[`${vw}_cv`]}%` : '—'}
                            </td>,
                          ]))}
                          <td className="py-1 pl-1 text-right font-semibold" style={{ color: GREEN }}>
                            {r.best ? viewZh(e.key, r.best) : '—'}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="text-[11px] text-[#9AA0A6] mt-2 leading-relaxed">
                    <b>反應</b>＝刻意錯的偏差是標準組的幾倍（1.0 ＝ 這個機位對該錯誤毫無反應，&gt;1.8 才算抓到）。
                    <b>CV</b>＝標準組內的變異係數，同一人重複做量出來穩不穩，越小越好。
                    <b>勝出</b>＝反應 ÷ CV，能抓到錯又量得穩的那個機位。
                    <br />
                    這張表才是「哪個角度好」的答案——因為每一列比的都是<b>同一個指標</b>，
                    與權重怎麼配無關。
                  </div>
                </Card>
              );
            })}

            {/* ══ 圖 S6【新】操弄檢核：每一種刻意錯，是被哪個指標抓到的？ ══
                偏差倍率 = 刻意錯組偏差 ÷ 標準組偏差。>1.8 才算真的抓到。
                如果某個錯誤沒有任何指標亮起來，那不是評分問題，
                是這個機位在物理上量不到那個錯誤。 */}
            {errorCatch.filter(g => g.data.length > 0).map(g => {
              const caught = g.badGroups.filter(et => g.data.some(d => (d[et] ?? 0) > 1.8));
              const missed = g.badGroups.filter(et => !caught.includes(et));
              return (
                <Card key={`ec_${g.ex.key}_${g.vw}`}
                  title={`${g.ex.zh} · ${g.viewName} · 操弄檢核`}
                  sub={missed.length ? `⚠ ${missed.join('、')} 沒有任何指標抓到（此機位量不到）` : '所有刻意錯都有指標抓到 ✓'}>
                  <ResponsiveContainer width="100%" height={30 + g.data.length * 26}>
                    <BarChart data={g.data} layout="vertical" margin={{ top: 6, right: 12, bottom: 0, left: 44 }}>
                      <CartesianGrid stroke="#EAE7E1" />
                      <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                      <YAxis type="category" dataKey="metric" tick={{ fontSize: 11 }} width={92} />
                      <Tooltip formatter={v => `${v}×`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {g.badGroups.map((et, i) => (
                        <Bar key={et} dataKey={et} name={et} fill={[CORAL, TEAL][i % 2]} radius={[0, 4, 4, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-[11px] text-[#9AA0A6] mt-1 leading-relaxed">
                    倍率＝刻意錯的偏差是標準組的幾倍。1.0 ＝ 感測器對這個錯誤毫無反應；
                    要 &gt; 1.8 才算真的抓到。
                  </div>
                </Card>
              );
            })}

            {/* ══ 圖 S7【新】權重稽核：權重真的落在看得到的指標上嗎？ ══ */}
            {weightAudit.filter(w => w.data.length > 0).map(w => (
              <Card key={`wa_${w.ex.key}_${w.viewName}`}
                title={`${w.ex.zh} · ${w.viewName} · 指標權重實際分配`}
                sub={w.lost.length ? `${w.lost.length} 個指標被排除` : '全部指標都計入'}>
                <ResponsiveContainer width="100%" height={30 + w.data.length * 24}>
                  <BarChart data={w.data} layout="vertical" margin={{ top: 6, right: 12, bottom: 0, left: 44 }}>
                    <CartesianGrid stroke="#EAE7E1" />
                    <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="metric" tick={{ fontSize: 11 }} width={92} />
                    <Tooltip formatter={v => `${v}%`} />
                    <Bar dataKey="w" name="實際權重" radius={[0, 4, 4, 0]}>
                      {w.data.map((x, i) => <Cell key={i} fill={x.w > 0 ? TEAL : '#E5E2DC'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {w.lost.length > 0 && (
                  <div className="text-[11px] text-[#B4622F] mt-1 leading-relaxed">
                    被排除：{w.lost.slice(0, 6).join('；')}
                  </div>
                )}
              </Card>
            ))}

            {/* 重測信度（同機位、同條件重複拍的分數變異） */}
            {EXS.map(e => {
              const arr = byEx(e.key);
              const rows = VIEW_KEYS.map(vw => {
                const s = scoresOf(arr, r => r.source.view === vw && r.source.quality === 'good' && r.source.group === 'exp');
                return { g: viewZh(e.key, vw), sd: s.length > 1 ? +std(s).toFixed(1) : null, n: s.length };
              }).filter(r => r.sd != null);
              if (!rows.length) return null;
              return <Card key={`rel_${e.key}`} title={`${e.zh} · 重測信度`}
                sub="同一人同機位重複拍的分數標準差（越小＝系統越穩定）">
                <ResponsiveContainer width="100%" height={140}><BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="g" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={v => `SD ${v}`} /><Bar dataKey="sd" fill={TEAL} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
              </Card>;
            })}

            {/* 評分效度散點 */}
            {scatter.length > 0 && <Card title="評分效度：真實資料落在三段式曲線" sub="每點＝一 rep 一指標">
              <ResponsiveContainer width="100%" height={190}><ScatterChart margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis type="number" dataKey="x" domain={[0, 100]} tick={{ fontSize: 11 }} /><YAxis type="number" dataKey="y" domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Scatter data={curvePts} line={{ stroke: CORAL, strokeWidth: 2 }} shape="circle" fill={CORAL} /><Scatter data={scatter} fill={TEAL} /></ScatterChart></ResponsiveContainer>
            </Card>}

            {/* 計次 + 效能 —— 【v5.3】加上文獻標準的 MAE / OBO 指標 */}
            {repcount.length > 0 && <Card title="計次正確率"
              sub={countStats ? `n=${countStats.n}　完全正確 ${countStats.exact}%　OBO(±1) ${countStats.obo}%　MAE ${countStats.mae}　bias ${countStats.bias > 0 ? '+' : ''}${countStats.bias}` : '偵測 vs 實際'}>
              <ResponsiveContainer width="100%" height={160}><BarChart data={repcount} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="actual" name="實際" fill={GRAY} /><Bar dataKey="detected" name="偵測" fill={CORAL} /></BarChart></ResponsiveContainer>
              <div className="text-[11px] text-[#9AA0A6] mt-1 leading-relaxed">
                MAE 與 OBO(±1) 是計次任務的文獻標準指標。刻意錯組現在也有 ground truth，
                全部影片都納入計算（舊版刻意錯不填實際次數，最可能出錯的那幾支反而驗證不到）。
              </div>
            </Card>}
            <Card title="分階段效能（平均秒）" sub={`共 ${results.length} 支`}>
              <ResponsiveContainer width="100%" height={150}><BarChart data={effData} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#EAE7E1" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="s" radius={[6, 6, 0, 0]}>{effData.map((x, i) => <Cell key={i} fill={[CORAL, AMBER, TEAL][i]} />)}</Bar></BarChart></ResponsiveContainer>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PoseValidationMobile;
