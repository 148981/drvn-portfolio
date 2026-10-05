/**
 * TemplateUploadMobile.jsx — 標準動作模板建立
 * ───────────────────────────────────────────────────────────────
 * 設計：瑞士雜誌排版 · 啞光紙質 · 圖二四色配色
 *   #F6F4F1 White Smoke · #F6F4F1 啞光紙
 *   #B9C8D7 Metallic Silver — 金屬銀（點綴）
 *   #F95C4B Red Orange — 強調色
 *   #262523 Charcoal Black — 主文字
 *
 * 已修：
 *   - 用 useRef 主動觸發 file picker（避開 framer-motion 動畫干擾 label）
 *   - 重新選檔時徹底清空 error/result/progress
 *   - 前端預檢（檔案大小過小直接警告，不打後端）
 *   - 後端錯誤訊息本地化 + 給可操作建議
 * ───────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Upload, CheckCircle2, AlertTriangle,
  FileVideo, ClipboardList, RotateCcw, Camera, Check, Aperture, Info,
} from 'lucide-react';
import apiClient from '../api/client';
import CameraAngleFinder from './CameraAngleFinder';
import ProcessingSpinner from './ProcessingSpinner';
import { hapticTap, hapticSuccess, hapticCelebrate, hapticWarning } from '../utils/haptics';
import InAppRecorder from './InAppRecorder';
import ViewPicker from './ViewPicker';
import { specFor, rigFor } from '../lib/exerciseSpec';
import { resolveApiBase } from '../utils/apiHostFix';

/** 模板至少要幾支。少於這個數，DBA 疊出來的模板等於在描摹單一次表現。 */
const MIN_CLIPS = 3;

// ═══════════════════════════════════════════════════════════════════════════
// 【裝置端建模】在手機上先跑 MediaPipe 抽每幀骨架 → 只上傳骨架(小 JSON)，
//   不再上傳整支影片、也不勞後端重跑 MediaPipe。跟「分析」同一種前置處理。
//   用 full 模型，跟 iOS 原生分析 + 後端建模一致。
// ═══════════════════════════════════════════════════════════════════════════
const MP_VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const MP_WASM_DIR = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MP_MODEL_FULL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

/**
 * 🛑 逾時包裝 —— 這整段最重要的一行。
 *
 * 原本這條 WASM 路徑**沒有任何逾時**：CDN 動態 import、WASM 下載、模型下載、
 * 影片 metadata、逐幀回呼，任何一個卡住都是 promise 永遠不 settle，
 * 於是「建立模板中…」的轉圈會轉到天荒地老，而且**永遠不會退回上傳路徑**
 * （後備機制寫了等於沒寫，因為它只在 reject 時才啟動）。
 * 使用者看到的就是「手機建不了模板」。
 */
function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} 逾時（${Math.round(ms / 1000)} 秒）`)), ms);
    }),
  ]);
}

const MP_INIT_TIMEOUT = 45000;    // 首次要下載 wasm + 約 9MB 模型，給寬一點
const MP_META_TIMEOUT = 15000;    // 影片 metadata
// （逐格 seek 之後不再需要「畫格停住」偵測；每次 seek 自己有 8 秒逾時）

let _mpLandmarker = null;
let _mpInitFailed = false;        // 失敗過就別再等一次，直接走上傳
async function _getLandmarker() {
  if (_mpLandmarker) return _mpLandmarker;
  if (_mpInitFailed) throw new Error('裝置端模型先前初始化失敗');
  try {
    _mpLandmarker = await withTimeout((async () => {
      const vision = await import(/* @vite-ignore */ MP_VISION_BUNDLE);
      const { PoseLandmarker, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(MP_WASM_DIR);
      try {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL_FULL, delegate: 'GPU' },
          runningMode: 'VIDEO', numPoses: 1,
        });
      } catch (gpuErr) {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL_FULL, delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1,
        });
      }
    })(), MP_INIT_TIMEOUT, '載入裝置端模型');
    return _mpLandmarker;
  } catch (e) {
    _mpInitFailed = true;
    throw e;
  }
}

/**
 * 抽完之後檢查骨架到底像不像「一個人在做動作」。
 *
 * 為什麼一定要有這關：裝置端抽取失敗的方式往往**不是拋例外**，而是安靜地
 * 吐出一整包沒有意義的座標（影片沒真的解碼、取到黑畫面、鏡頭沒對到人…）。
 * 這種資料送到後端只會換回一句「偵測不到動作週期」，使用者完全不知道
 * 是自己動作有問題還是手機根本沒看到 —— 那正是這個專題在批評的失敗模式。
 * 與其把爛資料送出去，不如當場判定裝置端不可信，退回上傳讓後端重跑。
 *
 * 回傳 null ＝ 看起來正常；回傳字串 ＝ 不可信的原因（會顯示給使用者）。
 */
function inspectFrames(frames) {
  // 10 幀 = 0.5 秒，切不出任何動作週期。一次完整動作至少要 2 秒。
  if (!frames || frames.length < 40) return `有效幀數只有 ${frames ? frames.length : 0}（至少需要 40）`;
  // 全身 33 點裡「移動幅度最大」的那一點有沒有真的在動（與動作種類無關）
  let best = 0;
  for (let j = 0; j < 33; j++) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < frames.length; i++) {
      const p = frames[i].world[j];
      if (!p) continue;
      const y = p[1];
      if (!Number.isFinite(y)) continue;
      if (y < mn) mn = y;
      if (y > mx) mx = y;
    }
    if (mx > mn) best = Math.max(best, mx - mn);
  }
  // 公尺為單位。真的做一下深蹲/臥推，最大位移不可能小於 5 公分。
  if (!(best > 0.05)) return `骨架幾乎沒有位移（最大 ${(best * 100).toFixed(1)} 公分，影片可能沒解碼成功）`;

  let vs = 0, n = 0;
  for (let i = 0; i < frames.length; i++) {
    const v = frames[i].vis;
    if (!v) continue;
    for (const j of [11, 12, 23, 24, 25, 26]) { if (Number.isFinite(v[j])) { vs += v[j]; n++; } }
  }
  const visAvg = n ? vs / n : 0;
  if (!(visAvg > 0.3)) return `軀幹與下肢可見度過低（平均 ${visAvg.toFixed(2)}）`;
  return null;
}

/** MediaRecorder 產生的 blob 常常 duration = Infinity，要先逼瀏覽器算出真實長度。 */
async function resolveDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return withTimeout(new Promise((res, rej) => {
    const done = () => {
      video.removeEventListener('durationchange', onDur);
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = 0;
        res(video.duration);
      } else rej(new Error('影片長度無法判讀'));
    };
    const onDur = () => { if (Number.isFinite(video.duration) && video.duration > 0) done(); };
    video.addEventListener('durationchange', onDur);
    // 往極大值 seek，瀏覽器會被迫把真實時長算出來
    try { video.currentTime = 1e7; } catch (e) { rej(e); }
  }), 8000, '判讀影片長度');
}

/** 用 WASM MediaPipe 把一支影片抽成每幀骨架 {world,image,vis}（約壓到 20fps 控制上傳量）。 */
async function extractClipFramesWASM(file, onFrac) {
  const lm = await _getLandmarker();
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url; video.muted = true; video.playsInline = true;
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  // ⚠️ 必須真的掛進 DOM。detached 的 <video> 在 iOS WKWebView 上
  //   不保證會解碼出可讀的畫格。
  // ⚠️⚠️ 也不能縮成 1×1 —— iOS 對「幾乎沒有面積」的影片會停止更新畫格，
  //   抽出來就是一包沒意義的座標，送到後端只會換回「偵測不到動作週期」。
  //   移到畫面外、但保留真實尺寸才會正常解碼。
  Object.assign(video.style, {
    position: 'fixed', left: '-10000px', top: '0',
    width: '320px', height: 'auto', opacity: '0.01',
    pointerEvents: 'none', zIndex: '-1',
  });
  document.body.appendChild(video);

  try {
    await withTimeout(new Promise((res, rej) => {
      if (video.readyState >= 1) { res(); return; }
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('影片讀取失敗（格式可能不支援）'));
    }), MP_META_TIMEOUT, '讀取影片');

    const dur = await resolveDuration(video);
    if (!(dur > 0) || !Number.isFinite(dur)) throw new Error('影片長度為 0 或無法判讀');

    // ══════════════════════════════════════════════════════════════════
    // 逐格 seek 取樣（不播放）
    // ══════════════════════════════════════════════════════════════════
    //   原本是「播放影片、在畫格回呼裡抽」。兩個致命問題：
    //     ① iOS 會把 play() 接管成全螢幕播放器 —— 使用者看到影片預覽跳出來，
    //        手動滑掉之後播放就暫停了，抽幀迴圈永遠等不到下一幀。
    //     ② 取樣率被裝置速度綁架：手機推論一幀要 200–400ms，影片卻照真實時間
    //        前進，實際只抽得到 3–5fps，跟後端影片路徑的 20fps 不是同一回事。
    //   改成主動 seek 到指定時間點再推論：不播放（不會全螢幕、不會有預覽），
    //   而且取樣間隔固定，跟後端 20fps 對齊 —— 兩條路徑建出來的模板才可比。
    const BASE_STEP = 1 / 20;         // 與後端 SKIP=round(fps/20) 對齊
    const MIN_FRAMES = 40;            // 20fps × 2 秒 —— 一次完整動作的下限
    const MIN_COVER_RATIO = 0.6;      // 至少涵蓋影片六成，否則只拍到半個動作
    let step = BASE_STEP;
    const HARD_MS = Math.min(180000, dur * 6000 + 20000);
    const frames = [];
    const t0 = Date.now();
    let tFirst = null, tLast = null, probed = false;

    const seekTo = (t) => withTimeout(new Promise((res, rej) => {
      const onSeeked = () => { cleanup(); res(); };
      const onErr = () => { cleanup(); rej(new Error('影片 seek 失敗')); };
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onErr);
      };
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onErr);
      try { video.currentTime = t; } catch (e) { cleanup(); rej(e); }
    }), 8000, '影片 seek');

    for (let t = 0; t < dur - 0.01; t += step) {
      if (Date.now() - t0 > HARD_MS) break;
      await seekTo(Math.min(t, dur - 0.01));
      try {
        const r = lm.detectForVideo(video, Math.max(1, Math.round(t * 1000)));
        const w = r.worldLandmarks && r.worldLandmarks[0];
        const im = r.landmarks && r.landmarks[0];
        if (w && im && w.length >= 33) {
          frames.push({
            world: w.map(p => [p.x, p.y, p.z]),
            image: im.map(p => [p.x, p.y]),
            vis: im.map(p => (p.visibility != null ? p.visibility : 1)),
          });
          if (tFirst === null) tFirst = t;
          tLast = t;
        }
      } catch (_e) { /* 單幀推論失敗就略過這一格 */ }

      // 🔴 跑滿 8 幀後估一次速度，跟不上就放大取樣間隔。
      //   原本固定 20fps：手機推論一幀 300–500ms，時間用完就直接 break，
      //   只抽到影片前面一小段 —— 送出去必然「偵測不到動作週期」。
      //   寧可 10fps 涵蓋整段，也不要 20fps 只涵蓋前 40%。
      if (!probed && frames.length === 8) {
        probed = true;
        const perFrame = (Date.now() - t0) / 8;
        const budgetLeft = HARD_MS - (Date.now() - t0);
        const framesLeft = Math.max(1, (dur - t) / step);
        if (perFrame * framesLeft > budgetLeft) {
          const affordable = Math.max(1, Math.floor(budgetLeft / Math.max(1, perFrame)));
          step = Math.max(BASE_STEP, (dur - t) / affordable);
        }
      }
      if (onFrac && dur) onFrac(Math.min(1, t / dur));
    }

    // 🔴 fps 必須來自「實際取樣格線」，不是 frames.length / dur。
    //   舊寫法在迴圈提早結束時會算出 7fps（真實取樣是 20fps），後端拿這個
    //   錯誤的時間基準去切動作週期，怎麼切都切不出來。
    //   這就是「網頁版可以、手機說偵測不到」的成因 —— 網頁版跑得完，手機跑不完。
    const sampleFps = Math.max(1, Math.round(1 / step));
    const covered = (tFirst !== null && tLast !== null) ? (tLast - tFirst) : 0;

    if (frames.length < MIN_FRAMES || covered < Math.min(2.0, dur * 0.5)
        || covered < dur * MIN_COVER_RATIO) {
      throw new Error(
        `裝置端只涵蓋 ${covered.toFixed(1)}／${dur.toFixed(1)} 秒（${frames.length} 幀 · `
        + `${sampleFps}fps），不足以判讀完整動作`);
    }

    // 送出去之前先確認這包骨架像不像一個人在做動作 —— 不像就別送，退回上傳。
    const bad = inspectFrames(frames);
    if (bad) throw new Error(bad);
    return { fps: sampleFps, frames };
  } finally {
    try { video.pause(); } catch (_e) { /* 已經停了 */ }
    try { video.removeAttribute('src'); video.load(); } catch (_e) { /* 忽略 */ }
    try { video.remove(); } catch (_e) { /* 忽略 */ }
    URL.revokeObjectURL(url);
  }
}

// ─── 色票 ─────────────────────────────────────
const C = {
  smoke: '#F6F4F1',
  paper: '#F6F4F1',
  paperDeep: '#EFEEEC',
  silver: '#B9C8D7',
  silverLite: '#D7DFE6',
  silverDeep: '#8FA1B3',
  orange: '#F95C4B',
  orangeLite: '#FF7A60',
  orangeDeep: '#D8331C',
  orangeWash: 'rgba(255,70,40,0.10)',
  ink: '#262523',
  inkSoft: '#3A3A3A',
  sub: '#6E6E6E',
  faint: '#9C9C9C',
  hairline: '#DCDCDC',
  hairlineStrong: '#C7C7C7',
};

const SILVER_BG = `linear-gradient(150deg, ${C.silverLite} 0%, ${C.silver} 50%, ${C.silverDeep} 100%)`;
const MATTE_PAPER = `linear-gradient(180deg, ${C.paper} 0%, #F4F3F1 100%)`;
const MATTE_BLACK = `linear-gradient(180deg, #262523 0%, #161415 100%)`;
const BRUSHED_TI_LITE = 'linear-gradient(135deg, #F6F4F1 0%, #E8ECEF 25%, #C9D4DF 50%, #B4C2D0 75%, #9AA9B8 100%)';
const BRUSHED_GUNPOWDER = `
  linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.05) 32%, rgba(255,255,255,0.5) 38%, rgba(255,255,255,0.85) 41%, rgba(255,255,255,0.1) 47%, transparent 55%),
  linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 3px 100% repeat,
  linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px) 0 0 / 7px 100% repeat,
  linear-gradient(90deg, rgba(0,0,0,0.2) 1px, transparent 1px) 0 0 / 5px 100% repeat,
  linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px) 0 0 / 11px 100% repeat,
  linear-gradient(180deg, #262523 0%, #161415 40%, #0A0A0A 100%)
`;
const FONT_STACK = '"Helvetica Neue", -apple-system, sans-serif';
const MONO_STACK = '"SF Mono", "JetBrains Mono", Menlo, monospace';
const EASE_SWISS = [0.16, 1, 0.3, 1];

// 【v9.2】原本這裡有一份 EXERCISE_INFO，寫著「深蹲用正側面 90 度、臥推用
//   側後方 45 度俯拍」—— 那是實驗之前的版本，而實驗結論剛好相反：
//   深蹲正側面對膝內夾只掉 8.9 分（抓不到），臥推正側面骨長差 32–47%（拒答）。
//   同一張表在三個檔案各有一份，全部收斂到 lib/exerciseSpec.js。

/**
 * 把後端錯誤訊息本地化 + 給可操作建議
 */
function localizeError(raw) {
  const s = String(raw || '');
  if (/No valid reps?|valid repetitions/i.test(s)) {
    return {
      title: '無法偵測到動作週期',
      tips: [
        '影片中需包含至少 1 次完整動作（上→下→上）',
        '建議全身入鏡、光線充足',
        '正面或側面拍攝皆可（依動作而定）',
      ],
      // 後端會附上「實際收到幾幀、切割訊號動態範圍多少」，由呼叫端接上去。
      // 沒有這段的話，「動作有問題」和「資料根本沒進來」看起來一模一樣。
    };
  }
  if (/timeout/i.test(s)) {
    return {
      title: '處理逾時',
      tips: ['影片太長或網路較慢，建議裁剪到 30 秒內再試'],
    };
  }
  if (/too small|too short|invalid file/i.test(s)) {
    return {
      title: '影片無效或太短',
      tips: ['請上傳至少 2 秒以上、解析度足夠的影片'],
    };
  }
  return { title: '建立失敗', tips: [s || '請稍後再試'] };
}

const TemplateUploadMobile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { exerciseKey, exerciseName, exerciseNameEn } = location.state || {};

  const [files, setFiles] = useState([]);
  // ── 【v9.2】內建錄影流程：每一支都先對角度再錄 ──────────────
  //   模板是整套評分的基準，建模影片的角度歪了，後面每支受測影片都跟著歪。
  //   所以模板拍攝比受測拍攝**更嚴格**，不是更寬鬆。
  const [clips, setClips] = useState([]);          // [{ file, verified, off }]
  const [captureStage, setCaptureStage] = useState(null);   // angle | record
  const [angleResult, setAngleResult] = useState(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  // 【v9.3】一個動作可以有多個機位，各建各的模板 ——
  //   正面量得到膝內夾、正側面量得到蹲深與軀幹，是不同的量。
  const [viewCode, setViewCode] = useState(
    () => location.state?.viewCode || specFor(exerciseKey)?.primaryView || null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageText, setStageText] = useState('');
  const [builtViews, setBuiltViews] = useState({});
  // 已有模板時預設顯示「現況卡」，按了重建才進入拍攝流程
  const [rebuilding, setRebuilding] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // 主動觸發檔案選擇（避開 framer-motion 攔截 label）
  const triggerFilePicker = () => {
    if (uploading) return;
    if (fileInputRef.current) {
      // 重置 input.value，避免「選同一個檔案不觸發 onChange」
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const resetAll = () => {
    setFiles([]);
    setError(null);
    setResult(null);
    setProgress(0);
  };

  // 查這個動作已經建好哪些機位的模板 —— 選擇器上顯示綠點
  useEffect(() => {
    let alive = true;
    if (!exerciseKey) return undefined;
    apiClient.get('/api/multi-exercise/exercises')
      .then(r => {
        if (!alive) return;
        const ex = (r.data?.exercises || []).find(e => e.key === exerciseKey);
        setBuiltViews(ex?.templates || {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [exerciseKey, result]);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    // 徹底清掉上一輪的狀態（避免「一上傳就出現舊錯誤」的視覺錯覺）
    setError(null);
    setResult(null);
    setProgress(0);

    if (selected.length === 0) {
      setFiles([]);
      return;
    }

    // 前端預檢：檔案太小（< 100KB）必定無法分析
    const tinyOnes = selected.filter(f => f.size < 100 * 1024);
    if (tinyOnes.length === selected.length) {
      setFiles([]);
      setError({
        title: '影片檔案太小',
        tips: ['請選擇至少 100KB、長度大於 2 秒的影片'],
      });
      return;
    }

    /* 🛡️ 上傳前先擋超大檔。
       ⚠️ 上限對齊 main.py 的 _MAX_BODY_BYTES_LARGE（1GB，涵蓋
          /api/multi-exercise/template*），不是一般 API 的 25MB —— 之前寫 25MB
          是抄錯常數，把正常的手機影片（一支動輒 30–150MB）全擋在前端，
          使用者只會看到「影片太大」卻不知道其實傳得上去。
       這裡取 200MB：真正的 413 界線在 1GB，但單支超過 200MB 在行動網路上
       等待時間已經不合理，先勸使用者裁剪比較誠實。 */
    const MAX_BYTES = 200 * 1024 * 1024;
    const tooBig = selected.filter(f => f.size > MAX_BYTES);
    if (tooBig.length) {
      const mb = (b) => (b / 1024 / 1024).toFixed(1);
      setFiles([]);
      setError({
        title: `影片太大（單支上限 200 MB）`,
        tips: [
          `${tooBig.map(f => `${f.name}：${mb(f.size)} MB`).join('、')}`,
          '建議用手機內建剪輯裁到 10–15 秒，只留完整動作的幾下',
          '或在「設定 → 相機 → 錄影格式」改成 720p / 30fps 再拍一次',
        ],
      });
      return;
    }

    setFiles(selected);
  };

  // 建模工作進度輪詢（影片路徑、裝置端路徑共用同一套背景任務）
  // ⚠️ 一定要有總時限。原本只要後端任務永遠不回 done/error，
  //   這個 interval 就會無限輪詢，前端停在轉圈畫面沒有任何說法。
  const POLL_MAX_MS = 10 * 60 * 1000;
  const pollTemplateJob = (jobId) => new Promise((resolve, reject) => {
    let miss = 0;
    const t0 = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - t0 > POLL_MAX_MS) {
        clearInterval(timer);
        reject(new Error('伺服器建模逾時（超過 10 分鐘沒有回應）'));
        return;
      }
      try {
        const st = await apiClient.get(
          `/api/multi-exercise/analyze-status/${jobId}`, { timeout: 15000 });
        const d = st.data || {};
        if (Number.isFinite(d.percent)) setProgress(p => Math.max(p, 10, d.percent));
        if (d.stage) setStageText(d.stage);
        if (d.status === 'done') { clearInterval(timer); resolve(d.result); }
        else if (d.status === 'error') {
          clearInterval(timer);
          const e = new Error(d.error || '建立失敗');
          e.detail = d.error_detail || null;
          reject(e);
        }
      } catch (e) {
        if (++miss > 5) { clearInterval(timer); reject(e); }   // 容忍短暫斷線
      }
    }, 1200);
  });

  // 舊路徑：上傳整支影片，讓後端跑 MediaPipe（裝置端抽取失敗時的後備）
  const buildByUpload = async (send) => {
    const formData = new FormData();
    formData.append('exercise_key', exerciseKey);
    if (viewCode) formData.append('view', viewCode);
    send.forEach(f => formData.append('files', f));
    setStageText('上傳影片');
    const start = await apiClient.post('/api/multi-exercise/template-async', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
      onUploadProgress: (evt) => {
        if (!evt.total) return;
        // 上傳佔 0–40%：原本只佔 0–10%，整支影片上傳時畫面會一直停在 0%，看起來像當掉。
        setProgress(p => Math.max(p, Math.floor((evt.loaded / evt.total) * 40)));
        const mb = (b) => (b / 1024 / 1024).toFixed(1);
        setStageText(`上傳影片 ${mb(evt.loaded)}／${mb(evt.total)} MB`);
      },
    });
    const jobId = start.data?.job_id;
    if (!jobId) throw new Error('伺服器未回傳工作編號');
    return pollTemplateJob(jobId);
  };

  // 新路徑：手機端先抽骨架（前置處理），只上傳骨架 JSON 給後端建模
  const buildOnDevice = async (send) => {
    setStageText('裝置端擷取骨架');
    const clipsPayload = [];
    for (let i = 0; i < send.length; i++) {
      const { fps, frames } = await extractClipFramesWASM(
        send[i],
        (fr) => setProgress(Math.min(48, Math.floor(((i + fr) / send.length) * 48))));
      if (frames.length >= 40) clipsPayload.push({ fps, frames });
      // 抽取品質看得見 —— 之後若還是失敗，光看這行就知道是「抽太少」還是「後端切不出來」
      setStageText(`裝置端擷取骨架 ${i + 1}／${send.length}（${frames.length} 幀 · ${fps}fps）`);
    }
    if (clipsPayload.length < MIN_CLIPS) {
      throw new Error(`裝置端只抽到 ${clipsPayload.length} 支有效影片的骨架，改用上傳`);
    }
    setStageText('上傳骨架 · 建立模板');
    setProgress(50);
    const start = await apiClient.post('/api/multi-exercise/template-from-pose-async',
      { exercise_key: exerciseKey, view: viewCode || null, clips: clipsPayload },
      { headers: { 'Content-Type': 'application/json' }, timeout: 300000 });
    const jobId = start.data?.job_id;
    if (!jobId) throw new Error('伺服器未回傳工作編號');
    return pollTemplateJob(jobId);
  };

  // iOS 原生路徑（最快）：請 Swift 端挑影片、裝置端抽骨架、上傳骨架，回 job_id 給我們輪詢
  const nativeAvailable = () => !!(window.webkit?.messageHandlers?.poseAnalyzer);
  const buildOnDeviceNative = () => new Promise((resolve, reject) => {
    const reqId = `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // 【修】原本寫死 `http://${hostname}:8000`。打包版的網頁 origin 是 drvn://app，
    //   hostname 是 "app" → 傳給 Swift 的是 http://app:8000，URLSession 直接 DNS 失敗。
    //   Swift 不會經過 apiHostFix 的 fetch/XHR 攔截，所以要在這裡就解析成正式後端。
    const apiBase = resolveApiBase();
    const prev = window.nativeBridge?.onNativeEvent;
    if (!window.nativeBridge) window.nativeBridge = {};
    let done = false;
    const cleanup = () => { window.nativeBridge.onNativeEvent = prev; };
    window.nativeBridge.onNativeEvent = (jsonStr) => {
      if (prev) { try { prev(jsonStr); } catch (_e) { /* swallow */ } }
      let evt; try { evt = JSON.parse(jsonStr); } catch (_e) { return; }
      if (!evt || typeof evt !== 'object') return;
      const rid = evt.requestId || evt.data?.requestId;
      if (rid && rid !== reqId) return;                    // 只收自己這次的事件
      if (evt.type === 'poseProgress') {
        const pct = Number(evt.percent ?? evt.data?.percent ?? 0);
        const stg = String(evt.stage ?? evt.data?.stage ?? '');
        if (Number.isFinite(pct)) setProgress(Math.max(2, Math.min(49, Math.round(pct))));
        const ZH = { loading: '讀取影片', detecting: '裝置端擷取骨架', extracting: '裝置端擷取骨架', uploading: '上傳骨架 · 建立模板' };
        if (stg) setStageText(ZH[stg] || stg);
      } else if (evt.type === 'poseTemplateJob') {
        if (done) return; done = true; cleanup();
        const jobId = evt.jobId || evt.data?.jobId;
        if (!jobId) { reject(new Error('原生未回傳工作編號')); return; }
        setProgress(50); setStageText('建立模板');
        pollTemplateJob(jobId).then(resolve).catch(reject);
      } else if (evt.type === 'poseError') {
        if (done) return; done = true; cleanup();
        reject(new Error(evt.error || evt.data?.error || '原生建模失敗'));
      }
    };
    try {
      setStageText('選擇建模影片');
      window.webkit.messageHandlers.poseAnalyzer.postMessage({
        action: 'pickAndBuildTemplate',
        exerciseKey, view: viewCode || '', apiBase, requestId: reqId,
        // 建模端點要求登入；Swift 的 URLSession 不會經過 apiClient，token 要自己帶過去
        authToken: (() => { try { return localStorage.getItem('auth_token') || ''; } catch (_e) { return ''; } })(),
      });
    } catch (e) { cleanup(); reject(e); }
  });

  // iOS 原生路徑（App 內錄影 / 已選好的檔案）：
  //   原本這些檔案只能走 WebView 裡的 WASM MediaPipe —— 在 iPhone 上逐格 seek + 推論
  //   又慢又常失敗，失敗後就退回「整支影片上傳、後端重跑」，行動網路上非常慢。
  //   改成把影片分段交給 Swift：原生解碼 + MediaPipe（GPU），只上傳骨架 JSON。
  //   舊版 App（Swift 還沒有這個 action）會回 poseError，自然退回 WASM → 上傳。
  const blobToBase64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); res(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => rej(new Error('讀取影片失敗'));
    r.readAsDataURL(blob);
  });
  const buildNativeFromFiles = (send) => new Promise((resolve, reject) => {
    const reqId = `tmplf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const apiBase = resolveApiBase();
    const prev = window.nativeBridge?.onNativeEvent;
    if (!window.nativeBridge) window.nativeBridge = {};
    let done = false;
    let ackWaiter = null;
    const cleanup = () => { window.nativeBridge.onNativeEvent = prev; };
    const fail = (e) => {
      if (done) return; done = true; cleanup();
      try { window.webkit.messageHandlers.poseAnalyzer.postMessage({ action: 'discardTemplateClips', requestId: reqId }); } catch (_e) { /* ignore */ }
      reject(e);
    };
    window.nativeBridge.onNativeEvent = (jsonStr) => {
      if (prev) { try { prev(jsonStr); } catch (_e) { /* swallow */ } }
      let evt; try { evt = JSON.parse(jsonStr); } catch (_e) { return; }
      if (!evt || typeof evt !== 'object') return;
      const rid = evt.requestId || evt.data?.requestId;
      if (rid !== reqId) return;
      if (evt.type === 'poseChunkAck') {
        if (ackWaiter) { const w = ackWaiter; ackWaiter = null; w(); }
      } else if (evt.type === 'poseProgress') {
        const pct = Number(evt.percent ?? evt.data?.percent ?? 0);
        const stg = String(evt.stage ?? evt.data?.stage ?? '');
        if (Number.isFinite(pct)) setProgress(p => Math.max(p, Math.min(49, Math.round(pct))));
        const ZH = { extracting: '手機端擷取骨架', uploading: '上傳骨架 · 建立模板' };
        if (stg) setStageText(ZH[stg] || stg);
      } else if (evt.type === 'poseTemplateJob') {
        if (done) return; done = true; cleanup();
        const jobId = evt.jobId || evt.data?.jobId;
        if (!jobId) { reject(new Error('原生未回傳工作編號')); return; }
        setProgress(p => Math.max(p, 50)); setStageText('建立模板');
        pollTemplateJob(jobId).then(resolve).catch(reject);
      } else if (evt.type === 'poseError') {
        fail(new Error(evt.error || evt.data?.error || '原生建模失敗'));
      }
    };
    (async () => {
      const CHUNK = 512 * 1024;
      const totalBytes = send.reduce((s, f) => s + (f.size || 0), 0) || 1;
      let sentBytes = 0;
      for (let i = 0; i < send.length; i++) {
        const f = send[i];
        setStageText(`交給手機端處理 ${i + 1}／${send.length}`);
        for (let off = 0; off < f.size; off += CHUNK) {
          if (done) return;
          const data = await blobToBase64(f.slice(off, off + CHUNK));
          await new Promise((res, rej) => {
            const timer = setTimeout(() => { ackWaiter = null; rej(new Error('手機端沒有回應')); }, 15000);
            ackWaiter = () => { clearTimeout(timer); res(); };
            window.webkit.messageHandlers.poseAnalyzer.postMessage({
              action: 'templateClipChunk', requestId: reqId, index: i, data,
            });
          });
          sentBytes += Math.min(CHUNK, f.size - off);
          setProgress(p => Math.max(p, 2 + Math.floor((sentBytes / totalBytes) * 8)));
        }
      }
      if (done) return;
      setStageText('手機端擷取骨架');
      window.webkit.messageHandlers.poseAnalyzer.postMessage({
        action: 'buildTemplateFromClips', requestId: reqId,
        exerciseKey, view: viewCode || '', apiBase,
        authToken: (() => { try { return localStorage.getItem('auth_token') || ''; } catch (_e) { return ''; } })(),
      });
    })().catch(fail);
  });

  // iOS 原生入口：由 Swift 自己挑影片、裝置端抽骨架、上傳骨架。
  // 比 WASM 快很多，但它必須自己開 PHPicker，所以只能當「還沒有素材」時的入口。
  const handleNativeBuild = async () => {
    if (uploading) return;
    setUploading(true); setProgress(2); setError(null);
    try {
      // 原生端若沒回事件（例如使用者在相簿頁把 App 切到背景），
      // 這個 promise 不會 settle —— 一樣要有時限，不能讓轉圈無限轉。
      const data = await withTimeout(buildOnDeviceNative(), 15 * 60 * 1000, '原生建模');
      setProgress(100); setStageText('完成');
      hapticCelebrate();
      setResult(data);
    } catch (err) {
      console.error('Native template build failed:', err);
      hapticTap();
      const d = err.response?.data || err.detail || {};
      if (d.error === 'template_insufficient') {
        setError({ title: '資料不足，沒有建立模板', tips: [d.message, d.reason].filter(Boolean) });
      } else {
        setError(localizeError(d.error || err.message || 'Failed to build template'));
      }
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleBuild = async () => {
    const send = clips.length ? clips.map(c => c.file) : files;
    if (send.length === 0 || uploading) return;
    setUploading(true);
    setProgress(5);
    setError(null);
    let nativeWhy = null;   // 原生路徑失敗原因（最後若整體失敗，一併顯示給使用者）

    try {
      // 順序：① iOS 原生（影片分段交給 Swift，原生解碼 + MediaPipe，最快）
      //       ② WebView 裡的 WASM MediaPipe（網頁版 / 舊版 App）
      //       ③ 整支影片上傳，後端重跑（最後後備，行動網路上最慢）
      // 🛟 總看門狗：底下每一段都已各自有逾時，這層是最後保險 ——
      //   任何情況下轉圈都不可以無限轉下去，一定要給使用者一個說法。
      const data = await withTimeout((async () => {
        if (nativeAvailable()) {
          try {
            return await buildNativeFromFiles(send);
          } catch (natErr) {
            nativeWhy = natErr?.message || String(natErr);
            console.warn('手機原生擷取失敗，改用網頁擷取：', nativeWhy);
            // 後端已經明確回「資料不足」就不要再換路徑重跑 —— 換路徑也是同樣的影片
            if (natErr?.detail?.error === 'template_insufficient') throw natErr;
            setStageText('改用網頁端擷取骨架');
            setProgress(5);
          }
        }
        try {
          return await buildOnDevice(send);
        } catch (devErr) {
          // 裝置端失敗是預期內的（模型下載不到、影片解不開、iOS 不給逐幀回呼…），
          // 重點是**一定要走到這裡**，而不是卡在上面永遠不 settle。
          const why = devErr?.message || String(devErr);
          console.warn('裝置端擷取失敗，改用上傳影片：', why);
          setStageText(`裝置端不可用（${why}），改用上傳`);
          setProgress(8);
          return await buildByUpload(send);  // 後備：上傳整支影片，後端跑 MediaPipe
        }
      })(), 15 * 60 * 1000, '建立模板');

      setProgress(100);
      setStageText('完成');
      hapticCelebrate();
      setResult(data);
    } catch (err) {
      console.error('Template build failed:', err);
      hapticTap();
      // 【v9.3】收斂安全閘：後端明確回「資料不足」時，直接照它的說明顯示
      // 同步路徑走 err.response.data；背景任務路徑走 err.detail
      const d = err.response?.data || err.detail || {};
      if (d.error === 'template_insufficient') {
        setError({
          title: '資料不足，沒有建立模板',
          tips: [d.message, d.reason].filter(Boolean),
        });
      } else {
        const raw = d.error || err.message || 'Failed to build template';
        const e = localizeError(raw);
        // 後端若附了實測診斷（幾幀 / 訊號範圍），一併顯示 ——
        // 這是「動作真的沒做完」和「影片根本沒解碼」的分辨依據。
        if (d.reason) e.tips = [...(e.tips || []), d.reason];
        if (nativeWhy) e.tips = [...(e.tips || []), `手機端擷取：${nativeWhy}`];
        setError(e);
      }
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  // ── 無 exerciseKey 防呆 ──
  if (!exerciseKey) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: C.smoke, fontFamily: FONT_STACK,
      }}>
        <div style={{ textAlign: 'center', color: C.sub }}>
          <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: C.ink }}>
            尚未選擇動作
          </p>
          <motion.button {...pressProps('row')} onClick={() => navigate('/exercise-selector-mobile')} style={{
 background: 'none', border: 'none', color: C.orange,
 fontWeight: 700, textDecoration: 'underline', cursor: 'pointer',
 }}>
            返回選擇動作
          </motion.button>
        </div>
      </div>
    );
  }

  const spec = specFor(exerciseKey, viewCode);
  const rig = rigFor(exerciseKey, viewCode);
  const existingTpl = builtViews?.[viewCode] || null;
  const showBuilder = !existingTpl || rebuilding;
  const total = clips.length || files.length;
  const ready = total >= MIN_CLIPS && !uploading;

  // ── 對角度 ──
  if (captureStage === 'angle') {
    return (
      <CameraAngleFinder
        exerciseKey={exerciseKey}
        viewCode={viewCode}
        exerciseName={exerciseName}
        purpose="template"
        onReady={(r) => { setAngleResult(r); setCaptureStage('record'); }}
        onSkip={() => { setAngleResult({ verified: false }); setCaptureStage('record'); }}
        onCancel={() => setCaptureStage(null)}
      />
    );
  }

  // ── 錄影 ──
  if (captureStage === 'record') {
    // 【v9.3】用 off（離目標角度），不是 relAzimuth ——
    //   正側面目標是 90°，用 relAzimuth 的話對準時會顯示「離基準 90°」
    const off = angleResult?.skeletonOff
      ?? (Number.isFinite(angleResult?.off) ? Math.abs(angleResult.off) : null);
    return (
      <InAppRecorder
        exerciseName={exerciseName}
        viewName={spec?.viewName || '自選機位'}
        angleNote={angleResult?.verified && off != null ? `離已驗證機位 ${Math.round(off)}°` : '角度未驗證'}
        onCancel={() => setCaptureStage('angle')}
        onDone={(file) => {
          setClips(cs => [...cs, { file, verified: !!angleResult?.verified, off }]);
          setCaptureStage(null);
        }}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100dvh', maxWidth: 440, margin: '0 auto',
      background: C.smoke, fontFamily: FONT_STACK,
      display: 'flex', flexDirection: 'column', color: C.ink,
    }}>
      {/* 隱藏 input — 由 ref 主動觸發 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* ────── HEADER ────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_SWISS }}
        style={{ padding: '52px 20px 0' }}>
        {/* 返回鈕 */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => navigate('/exercise-selector-mobile')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none',
            cursor: 'pointer', marginBottom: 24,
            color: C.ink, padding: 0,
          }}>
          <ArrowLeft size={18} color={C.ink} strokeWidth={2} />
          <span style={{
            fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            BACK
          </span>
        </motion.button>

        {/* 雜誌 overline */}
        <div style={{
          fontFamily: MONO_STACK, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.26em', color: C.faint, marginBottom: 10,
        }}>
          動作偵測&nbsp;·&nbsp;模板建立
        </div>

        {/* 主標題 */}
        <h1 style={{
          fontSize: 34, fontWeight: 800, color: C.ink, margin: 0,
          letterSpacing: '-0.035em', lineHeight: 1.0,
        }}>
          模板建立
        </h1>

        {/* 編號副標 + 橘色短線 */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14,
          paddingBottom: 12, borderBottom: `2px solid ${C.ink}`,
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', bottom: -2, left: 0,
            width: 32, height: 2, background: C.orange,
          }} />
          <span style={{
            fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800,
            color: C.orange, letterSpacing: '0.04em',
          }}>
            T·01
          </span>
          <span style={{
            fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
            color: C.sub, letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>
            {exerciseNameEn || exerciseName || 'Template'}
          </span>
        </div>
      </motion.div>

      {/* ────── BODY ────── */}
      <div style={{
        flex: 1, padding: '20px 20px 0',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>

        {/* ══════════════════════════════════════════════════════
            步驟條 —— 三步，每步一句話。不要一次把規則全倒出來。
            ══════════════════════════════════════════════════════ */}
        {!result && !uploading && showBuilder && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_SWISS }}
            style={{ display: 'flex', gap: 8 }}>
            {['對角度', '錄 3 支', '建立'].map((t, i) => {
              const done = i === 0 ? clips.length > 0 : i === 1 ? clips.length >= MIN_CLIPS : false;
              const now = i === 0 ? clips.length === 0 : i === 1 ? clips.length > 0 && clips.length < MIN_CLIPS : clips.length >= MIN_CLIPS;
              return (
                <div key={t} style={{
                  flex: 1, padding: '9px 10px', borderRadius: 10, textAlign: 'center',
                  background: now ? C.ink : done ? 'rgba(110,143,74,0.12)' : C.paperDeep,
                  border: `1px solid ${now ? C.ink : done ? 'rgba(110,143,74,0.3)' : C.hairline}`,
                }}>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em',
                    color: now ? 'rgba(246,244,241,0.5)' : done ? '#6E8F4A' : C.faint,
                  }}>{`0${i + 1}`}</div>
                  <div style={{
                    fontSize: 12.5, fontWeight: 800, marginTop: 3,
                    color: now ? '#F6F4F1' : done ? '#4E6B33' : C.faint,
                  }}>{t}</div>
                </div>
              );
            })}
          </motion.div>
        )}

        {!result && !uploading && (
          <ViewPicker
            exerciseKey={exerciseKey}
            value={viewCode}
            onChange={(v) => {
              setViewCode(v); setClips([]); setRebuilding(false);
              setAngleResult(null); setShowWhy(false); resetAll();
            }}
            templates={builtViews}
          />
        )}

        {/* ══════════════════════════════════════════════════════
            這個機位已經有模板 —— 先講清楚現況，再問要不要重建。
            重建只會覆蓋「目前選到的這個機位」，另一個機位不受影響
            （後端 template_{key}__{view}.npz，每個機位一個檔）。
            ══════════════════════════════════════════════════════ */}
        {!result && !uploading && existingTpl && !rebuilding && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_SWISS }}
            style={{
              background: C.paper, borderRadius: 4, overflow: 'hidden',
              border: `1px solid ${C.hairline}`, position: 'relative',
            }}>
            <span aria-hidden style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#5A7A3A',
            }} />
            <div style={{ padding: '18px 18px 18px 21px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
                letterSpacing: '0.2em', color: '#5A7A3A', textTransform: 'uppercase',
              }}>
                <Check size={11} strokeWidth={3.4} />已就緒
              </div>
              <div style={{
                fontSize: 26, fontWeight: 300, color: C.ink, letterSpacing: '-0.03em',
                lineHeight: 1.12, marginTop: 9,
              }}>{spec?.viewName} 已有模板</div>

              <div style={{ height: 1, background: C.hairline, margin: '15px 0 13px' }} />

              <div style={{ display: 'flex', gap: 30 }}>
                <div>
                  <div style={{
                    fontSize: 28, fontWeight: 300, color: C.ink, lineHeight: 1,
                    letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
                  }}>{existingTpl.reps || '—'}</div>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.18em', color: C.faint, textTransform: 'uppercase', marginTop: 6,
                  }}>Reps</div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: C.sub, margin: 0 }}>
                    這個機位的分析會拿這份模板當基準。
                  </p>
                </div>
              </div>

              <motion.button {...pressProps('row')}
 onClick={() => { hapticWarning(); setConfirmRebuild(true); }}
 style={{
 width: '100%', height: 48, marginTop: 16, borderRadius: 4,
 background: 'transparent', border: `1px solid ${C.hairlineStrong}`,
 color: C.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer',
 }}>
                重新建立這個機位的模板
              </motion.button>
              <p style={{
                fontSize: 11.5, lineHeight: 1.55, color: C.faint,
                margin: '9px 0 0', textAlign: 'center',
              }}>
                只會覆蓋 {spec?.viewName}，其他機位的模板不受影響
              </p>
            </div>
          </motion.div>
        )}

        {/* ── 主 CTA：直接講怎麼拍，理由收在問號裡 ── */}
        {!result && !uploading && showBuilder && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE_SWISS }}
            style={{
              background: C.paper, borderRadius: 4,
              border: `1px solid ${C.hairline}`, padding: '20px 20px 18px',
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: MONO_STACK, fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
                  color: C.orange, textTransform: 'uppercase',
                }}>怎麼拍</div>
                <div style={{
                  fontSize: 30, fontWeight: 300, color: C.ink, letterSpacing: '-0.035em',
                  lineHeight: 1.1, marginTop: 9,
                }}>{spec?.viewName || '參考影片'}</div>
              </div>
              <motion.button {...pressProps('row')}
 onClick={() => setShowWhy(v => !v)}
 aria-label="為什麼是這個角度"
 style={{
 width: 30, height: 30, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
 border: `1px solid ${showWhy ? C.orange : C.hairlineStrong}`,
 background: showWhy ? C.orange : 'transparent',
 color: showWhy ? '#fff' : C.sub,
 fontSize: 14, fontWeight: 600, lineHeight: 1,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 transition: 'all .2s',
 }}>?</motion.button>
            </div>

            <div style={{ height: 1, background: C.hairline, margin: '16px 0 14px' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[rig?.hold, rig?.mount, spec?.framing].filter(Boolean).map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{
                    fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700,
                    color: C.faint, flexShrink: 0, letterSpacing: '0.08em',
                  }}>{`0${i + 1}`}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, color: C.inkSoft }}>{t}</span>
                </div>
              ))}
            </div>

            <AnimatePresence initial={false}>
              {showWhy && spec?.validatedView && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_SWISS }}
                  style={{ overflow: 'hidden' }}>
                  <div style={{
                    marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.hairline}`,
                    fontSize: 12.5, lineHeight: 1.65, color: C.sub,
                  }}>
                    {spec.evidence}
                    <div style={{ height: 1, background: C.hairline, margin: '11px 0' }} />
                    {spec.catches?.length > 0
                      ? <>抓得到：<b style={{ color: C.ink, fontWeight: 600 }}>{spec.catches.join('、')}</b>。</>
                      : <>量得到：<b style={{ color: C.ink, fontWeight: 600 }}>{(spec.metrics || []).join('、')}</b>。</>}
                    {spec.blind?.length > 0 && <>{' '}這個角度量不到：{spec.blind.join('、')}。</>}
                    <div style={{ height: 1, background: C.hairline, margin: '11px 0' }} />
                    模板是整套評分的基準。每一支都要在同一個角度，否則後面每支受測影片都會跟著歪。
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button {...pressProps('row')}
 onClick={() => setCaptureStage('angle')}
 style={{
 width: '100%', height: 52, marginTop: 18, borderRadius: 4, border: 'none',
 background: C.ink, color: '#F6F4F1', cursor: 'pointer',
 fontSize: 15, fontWeight: 600, letterSpacing: '0.01em',
 }}>
              錄第 {clips.length + 1} 支
            </motion.button>
          </motion.div>
        )}

        {/* ── 已錄好的片段 ── */}
        {!result && !uploading && showBuilder && clips.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              borderRadius: 14, background: C.paper, border: `1px solid ${C.hairline}`,
              padding: '13px 15px',
            }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{
                fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em',
                color: C.faint, textTransform: 'uppercase',
              }}>CLIPS</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: C.ink }}>
                {clips.length} / {MIN_CLIPS}
                <span style={{ color: C.faint, fontWeight: 500 }}> 支</span>
              </span>
            </div>
            {clips.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderTop: i ? `1px solid ${C.hairline}` : 'none',
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                  background: c.verified ? 'rgba(110,143,74,0.14)' : 'rgba(255,70,40,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {c.verified
                    ? <Check size={13} color="#6E8F4A" strokeWidth={3} />
                    : <AlertTriangle size={12} color={C.orange} strokeWidth={2.4} />}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>
                  第 {i + 1} 支{c.off != null ? ` · 離基準 ${Math.round(c.off)}°` : ' · 角度未驗證'}
                </span>
                <motion.button {...pressProps('row')} onClick={() => setClips(cs => cs.filter((_, j) => j !== i))}
 aria-label={`刪除第 ${i + 1} 支`}
 style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, fontSize: 17, lineHeight: 1 }}>×</motion.button>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── 次要：從相簿批次選（角度不受控，會標明）── */}
        {!result && !uploading && showBuilder && (
          <div style={{
            borderRadius: 14, background: '#E8E9E6',
            border: `1px solid ${C.hairline}`, overflow: 'hidden',
          }}>
            <motion.button {...pressProps('row')} onClick={() => setShowLegacy(v => !v)} style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 11,
 padding: '13px 15px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
 }}>
              <Upload size={16} color={C.sub} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: C.inkSoft }}>
                已經拍好了？批次從相簿選
              </span>
              <span style={{
                fontSize: 18, color: C.faint, lineHeight: 1,
                transform: showLegacy ? 'rotate(45deg)' : 'none', transition: 'transform .22s',
              }}>＋</span>
            </motion.button>
            <AnimatePresence initial={false}>
              {showLegacy && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_SWISS }}
                  style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '0 15px 15px' }}>
                    <div style={{
                      display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(255,70,40,0.08)', marginBottom: 11,
                    }}>
                      <AlertTriangle size={14} color={C.orange} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 11.5, lineHeight: 1.55, color: C.sub }}>
                        模板的角度沒被驗證過，之後每一支受測影片都會沿用這個基準。
                      </span>
                    </div>
                    <div role="button" tabIndex={0}
                      onClick={triggerFilePicker}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerFilePicker(); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                        height: 50, borderRadius: 10, cursor: 'pointer', background: C.paper,
                        border: `1.5px dashed ${C.hairlineStrong}`,
                      }}>
                      <Upload size={16} color={C.silverDeep} strokeWidth={2} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>
                        {files.length ? `已選 ${files.length} 支` : '選擇影片（可多選）'}
                      </span>
                    </div>

                    {/* iOS 原生：Swift 端挑片 + 裝置端抽骨架，只上傳骨架。
                        比網頁版快很多，但它會自己開系統相簿，所以只在「還沒選任何素材」時出現。 */}
                    {nativeAvailable() && clips.length === 0 && files.length === 0 && (
                      <>
                        <div
                          role="button" tabIndex={0}
                          onClick={() => { hapticSuccess(); handleNativeBuild(); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNativeBuild(); }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                            height: 50, borderRadius: 10, cursor: 'pointer', marginTop: 10,
                            background: C.ink, border: 'none',
                          }}>
                          <Aperture size={16} color="#F6F4F1" strokeWidth={2} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#F6F4F1' }}>
                            用 iPhone 相簿直接建模（最快）
                          </span>
                        </div>
                        <p style={{
                          fontSize: 11, lineHeight: 1.5, color: C.faint,
                          margin: '7px 0 0', textAlign: 'center',
                        }}>
                          手機端抽骨架，只上傳骨架資料，不必上傳整支影片
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}


        {/* 處理中 —— 跟動作分析用同一個 ProcessingSpinner，進度是後端真的回報的 */}
        {uploading && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(245,245,245,0.94)', backdropFilter: 'blur(10px)',
          }}>
            <ProcessingSpinner
              progress={progress}
              title="建立模板中..."
              subtitle={stageText || `${exerciseName || ''} · ${spec?.viewName || ''}`}
            />
          </div>
        )}

        {/* ══ 完成 ══════════════════════════════════════════════
            模板建好 = 這個動作從「不能分析」變成「可以分析」，
            是整個流程的關卡，值得一個明確的完成畫面 + 震動。
            ══════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_SWISS }}
              style={{
                background: C.paper, borderRadius: 4,
                border: `1px solid ${C.hairline}`, padding: '24px 20px 20px',
              }}>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.42, delay: 0.08, ease: EASE_SWISS }}
                style={{
                  width: 52, height: 52, borderRadius: 999, background: '#5A7A3A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Check size={28} color="#F6F4F1" strokeWidth={3} />
              </motion.div>

              <div style={{
                fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em',
                color: '#5A7A3A', textTransform: 'uppercase', marginTop: 18,
              }}>Template ready</div>
              <div style={{
                fontSize: 30, fontWeight: 300, color: C.ink, letterSpacing: '-0.035em',
                lineHeight: 1.1, marginTop: 9,
              }}>模板建立完成</div>

              <div style={{ height: 1, background: C.hairline, margin: '18px 0 14px' }} />

              <div style={{ display: 'flex', gap: 28 }}>
                <div>
                  <div style={{
                    fontSize: 34, fontWeight: 300, color: C.ink, letterSpacing: '-0.03em',
                    lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                  }}>{result.total_reps ?? total}</div>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                    color: C.faint, textTransform: 'uppercase', marginTop: 7,
                  }}>Reps</div>
                </div>
                <div>
                  <div style={{
                    fontSize: 34, fontWeight: 300, color: C.ink, letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}>{spec?.viewName || '—'}</div>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                    color: C.faint, textTransform: 'uppercase', marginTop: 7,
                  }}>View</div>
                </div>
              </div>

              <p style={{ fontSize: 12.5, lineHeight: 1.65, color: C.sub, margin: '16px 0 0', maxWidth: '32ch' }}>
                之後這個機位的每一支影片，都會拿來跟這份模板比。
                想換基準隨時可以重建。
              </p>

              {/* 資料量剛好過門檻但偏少 → 明講刻度自由度不足，建議補拍 */}
              {result?.quality?.level === 'weak' && (
                <div style={{
                  marginTop: 14, padding: '12px 14px', borderRadius: 4,
                  background: 'rgba(255,70,40,0.07)',
                  borderLeft: `3px solid ${C.orange}`,
                }}>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 12, fontWeight: 800,
                    letterSpacing: '0.18em', color: C.orange, textTransform: 'uppercase',
                  }}>基準偏弱</div>
                  <p style={{ fontSize: 12, lineHeight: 1.6, color: C.sub, margin: '6px 0 0' }}>
                    {result.quality.note}
                  </p>
                </div>
              )}

              <motion.button {...pressProps('row')}
 onClick={() => {
 hapticSuccess();
 navigate('/upload-mobile', {
 // 【v9.3】要帶 viewCode，否則會跳回主機位 ——
 // 剛建好側面模板卻被導到「還沒有正面 0° 的模板」
 state: { exerciseKey, exerciseName, exerciseNameEn, multiExercise: true, viewCode },
 });
 }}
 style={{
 width: '100%', height: 52, marginTop: 20, borderRadius: 4, border: 'none',
 background: C.ink, color: '#F6F4F1', cursor: 'pointer',
 fontSize: 15, fontWeight: 600, letterSpacing: '0.01em',
 }}>
                開始分析我的動作
              </motion.button>
              <motion.button {...pressProps('row')}
 onClick={() => { hapticTap(); setClips([]); setRebuilding(false); resetAll(); }}
 style={{
 width: '100%', marginTop: 12, background: 'none', border: 'none', cursor: 'pointer',
 color: C.faint, fontSize: 13, fontWeight: 500, padding: '8px 0',
 }}>
                重新建立模板
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 錯誤訊息卡 — 結構化、有 tips */}
        <AnimatePresence>
          {error && !uploading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: EASE_SWISS }}
              style={{
                padding: 16, borderRadius: 12,
                background: C.orangeWash, border: `1px solid ${C.orange}55`,
              }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                <AlertTriangle size={20} color={C.orange}
                  strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13.5, fontWeight: 800, color: C.orangeDeep,
                    letterSpacing: '-0.005em', marginBottom: 6,
                  }}>
                    {error.title}
                  </div>
                  {Array.isArray(error.tips) && error.tips.length > 0 && (
                    <ul style={{
                      margin: 0, padding: 0, listStyle: 'none',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      {error.tips.map((t, i) => (
                        <li key={i} style={{
                          fontSize: 12, color: C.orangeDeep, lineHeight: 1.5,
                          opacity: 0.85, display: 'flex',
                          alignItems: 'flex-start', gap: 6,
                        }}>
                          <span style={{
                            width: 3, height: 3, borderRadius: '50%',
                            background: C.orangeDeep, marginTop: 7, flexShrink: 0,
                          }} />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={resetAll}
                    style={{
                      marginTop: 11, padding: '6px 12px', borderRadius: 8,
                      background: 'transparent', border: `1px solid ${C.orange}66`,
                      color: C.orange, cursor: 'pointer',
                      fontFamily: MONO_STACK, fontSize: 12, fontWeight: 800,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                    }}>
                    重新選擇影片
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 建立模板 ── */}
        {!result && showBuilder && (
          <motion.button
            whileTap={ready ? { scale: 0.99 } : {}}
            onClick={() => { hapticSuccess(); handleBuild(); }}
            disabled={!ready || uploading}
            style={{
              width: '100%', height: 54, borderRadius: 14, border: 'none',
              cursor: ready && !uploading ? 'pointer' : 'not-allowed',
              background: ready && !uploading ? C.ink : C.paperDeep,
              color: ready && !uploading ? '#F6F4F1' : C.faint,
              fontSize: 15, fontWeight: 700, letterSpacing: '0.01em',
            }}>
            {uploading ? '建立中…' : ready ? `用這 ${total} 支建立模板` : `還差 ${MIN_CLIPS - total} 支`}
          </motion.button>
        )}


      </div>

      {/* ══ 重建確認 ══════════════════════════════════════════
          重建會整份換掉 —— 之後這個機位的每一次分析都改用新的基準，
          舊的分數就不再可比。這是不可逆的決定，必須明確問過。
          ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {confirmRebuild && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setConfirmRebuild(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 70,
              background: 'rgba(22,20,21,0.45)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}>
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.3, ease: EASE_SWISS }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 360, background: C.paper,
                borderRadius: 4, padding: '24px 22px',
              }}>
              <div style={{
                fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
                letterSpacing: '0.22em', color: C.orange, textTransform: 'uppercase',
              }}>Replace template</div>
              <div style={{
                fontSize: 24, fontWeight: 300, color: C.ink, letterSpacing: '-0.03em',
                lineHeight: 1.15, marginTop: 9,
              }}>要重新建立<br />{spec?.viewName} 的模板嗎？</div>

              <div style={{ height: 1, background: C.hairline, margin: '16px 0 14px' }} />

              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {[
                  '現有模板會被整份取代，無法還原。',
                  '之後這個機位的分數會改用新基準，跟舊紀錄不能直接比。',
                  `只影響 ${spec?.viewName}，其他機位的模板不變。`,
                  '要重新錄 3 支標準動作；建立成功後才會覆蓋。',
                ].map((t, i) => (
                  <li key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'baseline',
                    fontSize: 12.5, lineHeight: 1.6, color: C.sub, marginTop: i ? 7 : 0,
                  }}>
                    <span style={{ color: C.hairlineStrong, flexShrink: 0 }}>·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <motion.button {...pressProps('row')}
 onClick={() => { hapticSuccess(); setConfirmRebuild(false); setRebuilding(true); setClips([]); resetAll(); }}
 style={{
 width: '100%', height: 50, marginTop: 20, borderRadius: 4, border: 'none',
 background: C.ink, color: '#F6F4F1', cursor: 'pointer',
 fontSize: 15, fontWeight: 600,
 }}>
                重新建立
              </motion.button>
              <motion.button {...pressProps('row')}
 onClick={() => { hapticTap(); setConfirmRebuild(false); }}
 style={{
 width: '100%', marginTop: 10, padding: '11px 0', background: 'none',
 border: 'none', cursor: 'pointer', color: C.sub, fontSize: 13.5, fontWeight: 600,
 }}>
                保留現有模板
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div style={{ padding: '24px 20px 28px', textAlign: 'center' }}>
        <p style={{
          fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
          color: C.faint, letterSpacing: '0.24em',
          textTransform: 'uppercase', margin: 0,
        }}>
          MULTI-EXERCISE&nbsp;AI&nbsp;COACH&nbsp;·&nbsp;V1.0
        </p>
      </div>
    </div>
  );
};

export default TemplateUploadMobile;
