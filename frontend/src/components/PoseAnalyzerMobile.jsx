/**
 * PoseAnalyzerMobile.jsx
 * ═══════════════════════════════════════════════════════════════
 * 混合邊緣運算架構的前端核心元件（Phase 4）
 *
 * ── 兩條偵測路徑 ───────────────────────────────────────────────
 *  A) iOS App 內（首選 / 預設）：
 *     1. 直接呼叫 window.webkit.messageHandlers.poseAnalyzer.postMessage(...)
 *        由 Swift（ios/FitnessApp/PoseAnalyzer.swift）端：
 *           PHPicker 選影片 → AVAssetReader 逐幀 → MediaPipe full 模型
 *           → PoseFeatureExtractors.swift 算 7 維特徵
 *     2. 監聽 window.nativeBridge.onNativeEvent → poseProgress / poseResult
 *     3. 拿 features JSON → POST /api/analyze_set （合約不動）
 *
 *  B) 瀏覽器（fallback / 開發）：
 *     原 WASM lite 流程保留，方便桌機除錯。
 *
 *  ⚠️ 重要：A 路徑用 full 模型（和後端模板對齊），B 路徑是 lite
 *     會有系統性誤差，但開發除錯不需要精準度，所以保留。
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Camera, CameraOff, Play, Square, RotateCcw, Zap, Eye, EyeOff, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { gradeOf } from './motion/DiagnosisComponents';
import { createExtractor, SUPPORTED_EXERCISES } from '../utils/poseFeatureExtractors';
import { getUserId } from '../utils/auth';

import UploadMobile from './UploadMobile';
import ResultViewMobile from './ResultViewMobile';
import ResultCarousel from './ResultCarousel';
import ProcessingSpinner from './ProcessingSpinner';
import { specFor, rigFor, RIG, EXERCISE_ORDER } from '../lib/exerciseSpec';
import { ensureAuthBeforeFetch } from '../utils/guestAuth';

// ─── Color Palette (瑞士雜誌 · 金屬材質色票) ──────────────────────────────────
const C = {
  black: '#161415',     // Deep Black - 壓陣底色、主標題文字
  paper: '#F6F4F1',     // Paper - 高光、最高亮度的金屬反光
  stone: '#E4DED2',     // Stone - 淺金屬底色
  pebble: '#CFC6B8',    // Pebble - 深金屬底色、分割線、金屬絲線
  coral: '#F95C4B',     // Coral - 一般強調色
  ember: '#D94030',     // Ember - 深底色上的強烈強調色 / 數據滿載的顏色

  // 語義對應
  bg: '#F6F4F1',        // 系統底色用 Paper
  text: '#161415',
  sub: '#6C6A66',       // 保持一個深灰色用於次要文字
};

// 噴砂金屬漸層 (Sandblasted Metal Gradient)
const METAL_PANEL_BG = `linear-gradient(135deg, ${C.paper} 0%, ${C.stone} 50%, ${C.pebble} 100%)`;
const TITANIUM_DIAL_BG = METAL_PANEL_BG;
const TITANIUM_CARD_BG = METAL_PANEL_BG;

const FONT_STACK = '"Helvetica Neue", -apple-system, sans-serif';
const MONO_STACK = '"SF Mono", "JetBrains Mono", Menlo, monospace';

// 分析 loading 畫面：固定全螢幕並置中（避免方框卡片偏移／跑出畫面）
const LOADING_CENTER_WRAP = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: C.bg,
  boxSizing: 'border-box',
};

// ─── MediaPipe CDN（WASM fallback 用） ───────────────────────────────────────
const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MEDIAPIPE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// ─── Native bridge 偵測 ────────────────────────────────────────────────────
//   iOS App 內 WebView 把 PoseAnalyzer 註冊成 messageHandler 'poseAnalyzer'。
//   只要這個 handler 存在 → 走 Swift 原生偵測；否則 fallback 到 WASM。
const hasNativePoseAnalyzer = () =>
  typeof window !== 'undefined' &&
  !!window.webkit?.messageHandlers?.poseAnalyzer;

// 用 prefix 標記本元件發出的 requestId，event listener 才不會誤收他人的事件
const REQ_PREFIX = 'pose_';

// ─── Exercise Config ────────────────────────────────────────────────────────
/* ══════════════════════════════════════════════════════════════════════════
 * 【v8.6】拍攝機位改成「實驗驗證過的」，不是憑直覺寫的
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 舊版與實驗結論直接矛盾（最新一輪：46 支，2026-08-04）：
 *   squat       舊寫「正側面 90 度」→ 實測正側面對膝內夾只掉 8.9 分，跌破 20 分門檻
 *                                     正面 0° 才抓得到（掉 56.8 分）
 *   bench_press 舊寫「側後方 45 度」→ 實測正側面前臂骨長左右差 32–47%，系統直接拒答
 *                                     正上方俯視才抓得到（掉 40.3 分）
 *
 * 為什麼會這樣：機位決定「動作的關鍵幾何落在影像的哪一維」。
 *   · 膝蓋內夾是**額狀面**（左右方向）的偏移 → 正側面拍時它正對鏡頭，投影退化
 *   · 肘外展是上臂與肩線的夾角 → 只有正上方俯視時兩者都落在影像平面上
 *
 * `verified` 標的是「這個機位對這個錯誤，實驗證明真的會掉分」。
 * 沒有 verified 的動作＝還沒跑過三道關卡驗證，只給參考分數、不宣告偵測能力。
 */
// 【v9.2】改由 lib/exerciseSpec.js 衍生 —— 這張表以前在三個檔案各一份，
//   而且都停在實驗之前的版本（深蹲寫正側面、臥推寫 45° 俯拍），
//   等於 App 在推薦自己的實驗已經證明沒用的角度。現在只有一個來源。
const EXERCISE_INFO = Object.fromEntries(EXERCISE_ORDER.map((k) => {
  const sp = specFor(k);
  const rig = rigFor(k);
  return [k, {
    name: sp?.name || k,
    nameEn: sp?.nameEn || '',
    icon: '',
    view: sp?.rig === RIG.OVERHEAD ? 'overhead' : (sp?.validatedView === 'sagittal_90' ? 'side' : 'front'),
    viewCode: sp?.validatedView || null,
    verified: sp?.validatedView ? { check: (sp.catches || [])[0] } : null,
    guide: {
      direction: sp?.viewName || '尚未驗證',
      height: rig?.mount || '—',
      desc: sp?.validatedView
        ? sp.evidence
        : (sp?.reason || '此動作尚未經過角度效度驗證，分數僅供參考。'),
    },
  }];
}));

// ─── Drawing Helpers (WASM live preview 用) ─────────────────────────────────

const POSE_CONNECTIONS = [
  [11, 13], [13, 15], // Left arm
  [12, 14], [14, 16], // Right arm
  [11, 12],           // Shoulders
  [11, 23], [12, 24], // Torso
  [23, 24],           // Hips
  [23, 25], [25, 27], // Left leg
  [24, 26], [26, 28], // Right leg
];

function drawSkeleton(ctx, landmarks, width, height) {
  if (!landmarks || landmarks.length === 0) return;

  // 骨骼：亮銀金屬線條
  ctx.strokeStyle = 'rgba(223, 228, 234, 0.92)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 6;
  POSE_CONNECTIONS.forEach(([i, j]) => {
    const a = landmarks[i], b = landmarks[j];
    if (a && b && a.visibility > 0.5 && b.visibility > 0.5) {
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
  });
  ctx.shadowBlur = 0;

  // 關節點
  [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => {
    const lm = landmarks[i];
    if (lm && lm.visibility > 0.5) {
      const confident = lm.visibility > 0.8;
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, confident ? 5.5 : 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = confident ? '#F95C4B' : '#B9C8D7';
      ctx.fill();
      ctx.strokeStyle = '#F6F4F1';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const PoseAnalyzerMobile = () => {
  const navigate = useNavigate();

  // ── State ──
  // phase: select | setup | live | analyzing | results | native-detecting
  //   native-detecting：iOS 內 Swift 端正在跑骨架偵測（取代 WASM 的 setup+live）。
  const [phase, setPhase] = useState('select');
  const [exerciseKey, setExerciseKey] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [frameCount, setFrameCount] = useState(0);
  const [lowVisWarning, setLowVisWarning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [modelLoadProgress, setModelLoadProgress] = useState('');

  // ── Native phase state（只有 native 路徑用） ──
  const [nativeProgress, setNativeProgress] = useState(0);   // 0~100
  const [nativeStage, setNativeStage] = useState('準備中');    // 'loading' | 'detecting' | 'extracting' | 'scoring'
  const [useNative] = useState(hasNativePoseAnalyzer);       // 整個 session 都鎖在一條路徑

  // ── Refs ──
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const extractorRef = useRef(null);
  const featuresBufferRef = useRef([]);
  const animFrameRef = useRef(null);
  const rvfcRef = useRef(null);              // requestVideoFrameCallback handle
  const timerRef = useRef(null);
  const fpsRef = useRef(30);
  const lastTimestampRef = useRef(-1);       // 上一個處理過的影片秒數（逐幀去重用）
  const lastTsMsRef = useRef(0);             // 上一個送進 MediaPipe 的毫秒戳（需嚴格遞增）
  const recordingRef = useRef(false);        // 錄製旗標 —— RVFC 迴圈讀這個（讀 state 會 stale）
  const showSkeletonRef = useRef(true);      // 同上：迴圈讀 ref 版的 showSkeleton
  const sampleStatsRef = useRef({ first: -1, last: -1, count: 0 }); // 算真實取樣 fps 用
  const nativeRequestIdRef = useRef(null);
  const nativeViewRef = useRef(null);   // 【v9.3】原生路徑要用哪個機位的模板   // 配對 Swift 回來的事件
  const nativeIsSideViewRef = useRef(false); // 提交給 backend 用

  // ──────────────────────────────────────────────────────────────────────────
  // 共用：把 features 送後端評分 (兩條路徑都用)
  // ──────────────────────────────────────────────────────────────────────────
  const sendFeaturesToBackend = useCallback(async ({
    features, exerciseKey: exKey, fps, isSideView, view,
  }) => {
    // 清理：每幀都是長度 7 的數字 / null（NaN 轉 null 才能 JSON 序列化）
    const clean = (Array.isArray(features) ? features : [])
      .filter(f => Array.isArray(f) && f.length === 7)
      .map(f => f.map(v => (typeof v === 'number' && isFinite(v)) ? v : null));

    if (clean.length < 10) {
      throw new Error('有效特徵幀數不足，請確認鏡頭能完整拍到身體。');
    }

    const apiBase = `http://${window.location.hostname}:8000`;
    const payload = {
      exercise_key: exKey,
      features: clean,
      fps: fps || 30,
      is_side_view: !!isSideView,
      // 【v9.3】原生路徑也要指定機位，否則後端只能用檔名猜哪一份模板
      ...(view ? { view } : {}),
      user_id: getUserId(),
    };

    console.log(`📤 送出 ${clean.length} 幀特徵 → /api/analyze_set (native=${useNative})`);

    // 後端以 JWT 判定身分（不再信任 payload.user_id），raw fetch 要自己帶 token
    // 訪客啟動時換 token 失敗（離線／後端冷啟動）→ 這裡補換一次，不然整段分析直接 401
    await ensureAuthBeforeFetch();
    let token = '';
    try { token = localStorage.getItem('auth_token') || ''; } catch (_e) { /* ignore */ }
    const resp = await fetch(`${apiBase}/api/analyze_set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Server error ${resp.status}`);
    }
    return resp.json();
  }, [useNative]);

  // ──────────────────────────────────────────────────────────────────────────
  // Native 路徑：請 Swift 端做骨架偵測 + 特徵擷取
  // ──────────────────────────────────────────────────────────────────────────
  const requestNativeAnalysis = useCallback((exKey, isSideView) => {
    if (!hasNativePoseAnalyzer()) {
      setError('Native pose analyzer 未掛載 — 請確認在 iOS App 內執行。');
      return;
    }
    const requestId = `${REQ_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    nativeRequestIdRef.current = requestId;
    nativeIsSideViewRef.current = !!isSideView;

    setNativeProgress(0);
    setNativeStage('開啟相簿');
    setPhase('native-detecting');
    setError(null);

    try {
      window.webkit.messageHandlers.poseAnalyzer.postMessage({
        action: 'pickAndAnalyze',
        exerciseKey: exKey,
        requestId,
      });
      console.log('[Native] postMessage pickAndAnalyze', { exKey, requestId });
    } catch (err) {
      console.error('Native bridge postMessage failed:', err);
      setError(`無法呼叫 Swift 端：${err.message}`);
      setPhase('select');
    }
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // 監聽 Swift 端事件（用既有 onNativeEvent prev-callback chain）
  //   - poseProgress：更新進度條
  //   - poseResult：拿 features → 送後端 → 切到 results
  //   - poseError：顯示錯誤，回到 select
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!useNative) return;   // 瀏覽器 fallback 不掛
    const prev = window.nativeBridge?.onNativeEvent;
    if (!window.nativeBridge) window.nativeBridge = {};

    window.nativeBridge.onNativeEvent = (jsonStr) => {
      // 1. 先把事件鏈傳給之前的監聽者（其他模組可能在用）
      if (prev) { try { prev(jsonStr); } catch (_) { /* swallow */ } }

      // 2. 解析自己關心的事件
      let evt;
      try { evt = JSON.parse(jsonStr); } catch (_) { return; }
      if (!evt || typeof evt !== 'object') return;

      const myReqId = nativeRequestIdRef.current;
      const eventReqId = evt.requestId || evt.data?.requestId;
      // 只處理屬於本元件的事件（看 prefix 或當前 requestId）
      if (myReqId && eventReqId && eventReqId !== myReqId) return;
      if (eventReqId && !String(eventReqId).startsWith(REQ_PREFIX)) return;

      switch (evt.type) {
        case 'poseProgress': {
          const pct = Number(evt.percent ?? evt.data?.percent ?? 0);
          const stg = String(evt.stage ?? evt.data?.stage ?? '');
          setNativeProgress(Math.max(0, Math.min(99, Math.round(pct))));
          const ZH = {
            loading: '讀取影片', detecting: '偵測骨架',
            extracting: '擷取特徵', scoring: '計算分數',
          };
          if (stg) setNativeStage(ZH[stg] || stg);
          break;
        }
        case 'poseResult': {
          const features = evt.features || evt.data?.features || [];
          const fps = Number(evt.fps ?? evt.data?.fps ?? 30) || 30;
          const exKey = String(evt.exerciseKey || evt.data?.exerciseKey || exerciseKey || '');
          const isSide = evt.isSideView ?? evt.data?.isSideView ?? nativeIsSideViewRef.current;

          setNativeProgress(99);
          setNativeStage('計算分數');
          setPhase('analyzing');

          sendFeaturesToBackend({
            features, exerciseKey: exKey, fps, isSideView: isSide,
            view: nativeViewRef.current,
          })
            .then(data => {
              setResults(data);
              setPhase('results');
              console.log('📊 分析結果 (native):', data);

              // 🦴 把評分結果交回 Swift，啟動原生 AR 骨架疊合回放。
              //   骨架座標一直留在地端（邊緣運算），後端只回傳「哪幾下、分數多少」。
              //   Swift 端用快取的「原始影片 + 逐幀骨架」，配上這裡的 repSegments /
              //   fatigueData / feedback，挑出 best / worst rep 後全螢幕彈出 ARPlaybackView。
              try {
                if (hasNativePoseAnalyzer()
                  && Array.isArray(data.repSegments) && data.repSegments.length) {
                  window.webkit.messageHandlers.poseAnalyzer.postMessage({
                    action: 'showARPlayback',
                    requestId: eventReqId,
                    exerciseName: data.exerciseName || '',
                    overallScore: data.overallScore ?? 0,
                    repSegments: data.repSegments,
                    fatigueData: data.fatigueData || [],
                    feedback: data.feedback || [],
                  });
                  console.log('[Native] postMessage showARPlayback', eventReqId);
                }
              } catch (e) {
                console.warn('showARPlayback bridge failed:', e);
              }

              nativeRequestIdRef.current = null;
            })
            .catch(err => {
              console.error('analyze_set failed:', err);
              setError(`評分失敗：${err.message}`);
              setPhase('select');
              nativeRequestIdRef.current = null;
            });
          break;
        }
        case 'poseError': {
          const msg = String(evt.error || evt.data?.error || '未知錯誤');
          console.error('[Native poseError]', msg);
          setError(`偵測失敗：${msg}`);
          setPhase('select');
          nativeRequestIdRef.current = null;
          break;
        }
        default:
          // 不關心的 type，已經傳給 prev 了，這裡略過
          break;
      }
    };

    return () => {
      // 還原 callback 鏈
      if (window.nativeBridge) window.nativeBridge.onNativeEvent = prev;
    };
  }, [useNative, exerciseKey, sendFeaturesToBackend]);

  // 把 showSkeleton state 鏡射到 ref —— RVFC 迴圈是長壽命 closure，只能讀 ref
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);

  // ── Load MediaPipe WASM (僅 fallback 用) ──
  const loadMediaPipe = useCallback(async () => {
    setModelLoadProgress('載入 MediaPipe 模型...');
    try {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const { PoseLandmarker, FilesetResolver } = vision;

      setModelLoadProgress('初始化 WASM 引擎...');
      const wasmFileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

      setModelLoadProgress('下載姿態模型...');
      // 優先用 GPU(WebGL) delegate；某些瀏覽器 / 無障礙顯卡環境會初始化失敗，
      // 失敗時自動退回 CPU，避免整個模型載入直接掛掉。
      let landmarker;
      let usedDelegate = 'GPU';
      try {
        landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      } catch (gpuErr) {
        console.warn('GPU delegate 不可用，改用 CPU：', gpuErr?.message || gpuErr);
        usedDelegate = 'CPU';
        landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      }

      landmarkerRef.current = landmarker;
      setIsModelLoaded(true);
      setModelLoadProgress('');
      console.log(`✅ MediaPipe Pose Landmarker loaded (${usedDelegate}, WASM fallback)`);
    } catch (err) {
      console.error('MediaPipe load error:', err);
      setError(`模型載入失敗: ${err.message}`);
      setModelLoadProgress('');
    }
  }, []);

  // ── Handle File Select（UploadMobile 觸發） ──
  //   native：忽略 file（Swift 會自己跳 PHPicker）→ 直接呼叫 native flow
  //   WASM：原本流程
  const handleFileSelect = async (file, isSideView, overrideExerciseKey, viewCode) => {
    const exKey = overrideExerciseKey || exerciseKey;
    if (overrideExerciseKey) setExerciseKey(overrideExerciseKey);
    nativeViewRef.current = viewCode || null;

    if (useNative) {
      // ❗ Native 路徑：不需要 WebView 端的 file，Swift 會自己選
      requestNativeAnalysis(exKey, isSideView);
      return;
    }

    // ── WASM fallback ──
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setIsVideoLoaded(false);

    setPhase('setup');
    if (!isModelLoaded) {
      await loadMediaPipe();
    }
    setPhase('live');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 以下為 WASM fallback 專屬：逐幀偵測 + 即時錄製
  // ──────────────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────────────
  // 逐幀偵測 —— 用 requestVideoFrameCallback（RVFC）取代 requestAnimationFrame
  //
  //   ❌ 舊版用 RAF：RAF 跟著「螢幕更新率」跑（60/120Hz），影片只有 ~30fps，
  //      同一幀會被重複偵測 2~4 次：
  //        · MediaPipe 算力白白浪費 2~4 倍 → 分析慢
  //        · featuresBuffer 幀數與真實幀數脫鉤 → 送後端的 fps 永遠是錯的 30
  //          → find_peaks 的 rep 切割距離算錯 → 計次忽多忽少（「抓影片不穩」）
  //   ❌ 舊版還有個更致命的 bug：processFrame 是依賴 [isRecording] 的 useCallback，
  //      startAnalysis 先 setIsRecording(true) 再呼叫「舊的」processFrame，
  //      RAF 自我遞迴鎖死在那顆舊 closure 裡 → isRecording 永遠讀到 false
  //      → 特徵一筆都沒進 buffer（骨架畫得出來、但分數全 0 / 幀數不足）。
  //   ✅ 新版：RVFC 每「呈現一幀」才回呼一次，逐幀對齊、不重不漏；
  //      metadata.mediaTime 是該幀在影片中的精確秒數（單調遞增），
  //      用它去重、收尾時再換算出「真實取樣 fps」回報後端。
  //      錄製旗標 / showSkeleton 一律走 ref，避開長壽命 closure 的 stale 問題。
  // ──────────────────────────────────────────────────────────────────────────
  const processVideoFrame = useCallback((now, metadata) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    const useRVFC = typeof video.requestVideoFrameCallback === 'function';
    const scheduleNext = () => {
      if (video.paused || video.ended) return;
      if (useRVFC) {
        rvfcRef.current = video.requestVideoFrameCallback(processVideoFrame);
      } else {
        animFrameRef.current = requestAnimationFrame(() => processVideoFrame());
      }
    };

    // 此幀在影片中的精確秒數：RVFC 用 metadata.mediaTime；RAF fallback 退回 currentTime
    const mediaTime = (metadata && typeof metadata.mediaTime === 'number')
      ? metadata.mediaTime
      : video.currentTime;

    // 去重：同一幀被重複呈現（高刷新率螢幕上 RAF fallback 必然發生）→ 不重跑偵測
    if (mediaTime <= lastTimestampRef.current + 1e-4) {
      scheduleNext();
      return;
    }
    lastTimestampRef.current = mediaTime;

    const ctx = canvas.getContext('2d');
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      // detectForVideo 要求「嚴格遞增」的毫秒時間戳
      const tsMs = Math.max(lastTsMsRef.current + 1, Math.round(mediaTime * 1000));
      lastTsMsRef.current = tsMs;
      const result = landmarker.detectForVideo(video, tsMs);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (result.landmarks && result.landmarks.length > 0) {
        const imageLandmarks = result.landmarks[0];
        const worldLandmarks = result.worldLandmarks?.[0];

        if (showSkeletonRef.current) {
          drawSkeleton(ctx, imageLandmarks, canvas.width, canvas.height);
        }

        const keyVis = [11, 12, 13, 14, 15, 16, 23, 24].map(i => imageLandmarks[i]?.visibility || 0);
        const avgVis = keyVis.reduce((a, b) => a + b, 0) / keyVis.length;
        setLowVisWarning(avgVis < 0.5);

        if (recordingRef.current && worldLandmarks && extractorRef.current) {
          const { features } = extractorRef.current(worldLandmarks, imageLandmarks);
          featuresBufferRef.current.push(features);
          const st = sampleStatsRef.current;
          if (st.first < 0) st.first = mediaTime;
          st.last = mediaTime;
          st.count += 1;
          // 每 5 幀才更新一次 UI 計數，避免每幀 re-render 拖慢主執行緒
          if (st.count === 1 || st.count % 5 === 0) setFrameCount(st.count);
        }
      } else {
        setLowVisWarning(true);
      }
    } catch (err) {
      // MediaPipe 偶爾在壞幀拋錯 —— 略過該幀、繼續跑
    }

    scheduleNext();
  }, []);

  // Start Analysis
  const startAnalysis = useCallback(() => {
    const video = videoRef.current;
    if (!exerciseKey || !video) return;

    featuresBufferRef.current = [];
    // 真實取樣 fps 要收尾才算得出來；先用 30 建 extractor
    // （fps 只影響穩定度特徵的滑動窗大小，容差大，不影響後端切割）。
    extractorRef.current = createExtractor(exerciseKey, 30);
    sampleStatsRef.current = { first: -1, last: -1, count: 0 };
    lastTimestampRef.current = -1;
    lastTsMsRef.current = 0;
    setFrameCount(0);

    recordingRef.current = true;   // ← 迴圈讀這顆 ref，不是 isRecording state
    setIsRecording(true);

    try { video.currentTime = 0; } catch (e) { /* noop */ }
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay 限制，忽略 */ });

    if (typeof video.requestVideoFrameCallback === 'function') {
      rvfcRef.current = video.requestVideoFrameCallback(processVideoFrame);
    } else {
      animFrameRef.current = requestAnimationFrame(() => processVideoFrame());
    }
  }, [exerciseKey, processVideoFrame]);

  // 取消尚在排程的逐幀回呼（RVFC / RAF 兩種都清）
  const cancelFrameLoop = useCallback(() => {
    const video = videoRef.current;
    if (video && rvfcRef.current != null &&
      typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(rvfcRef.current);
    }
    rvfcRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Stop Camera —— 中止偵測迴圈，不送後端（使用者按返回時用）
  const stopCamera = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);
    cancelFrameLoop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) { /* noop */ }
    }
  }, [cancelFrameLoop]);

  // Stop Recording & Send to Backend
  //   ⚠️ 必須在 handleVideoEnded 之上宣告，否則 useCallback 依賴陣列會碰到 TDZ
  const stopRecording = useCallback(async () => {
    recordingRef.current = false;
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelFrameLoop();
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) { /* noop */ }
    }

    const rawFeatures = featuresBufferRef.current;
    if (rawFeatures.length < 10) {
      setError('錄製時間太短，至少需要 1 秒以上的動作。');
      setPhase('live');
      return;
    }

    // 真實取樣 fps：用實際抓到的幀數 ÷ 影片時間跨度算出來，不再寫死 30。
    // 後端 find_peaks 的 rep 切割距離 = fps × min_rep_sec，靠這個值才準。
    const st = sampleStatsRef.current;
    const span = st.last - st.first;
    const trueFps = (span > 0.2 && st.count > 1)
      ? Math.min(120, Math.max(5, (st.count - 1) / span))
      : 30;
    fpsRef.current = trueFps;
    console.log(`🎞️ 真實取樣 fps = ${trueFps.toFixed(2)}（${st.count} 幀 / ${span.toFixed(2)}s）`);

    setPhase('analyzing');

    try {
      const info = EXERCISE_INFO[exerciseKey];
      const isSide = info?.view === 'side';
      const data = await sendFeaturesToBackend({
        features: rawFeatures,
        exerciseKey,
        fps: trueFps,
        isSideView: isSide,
      });
      setResults(data);
      setPhase('results');
      console.log('📊 分析結果 (WASM):', data);
    } catch (err) {
      console.error('Analysis error:', err);
      setError(`分析失敗: ${err.message}`);
      setPhase('live');
    }
  }, [exerciseKey, sendFeaturesToBackend, cancelFrameLoop]);

  // Auto stop when video ends
  const handleVideoEnded = useCallback(() => {
    setIsRecording(false);
    stopRecording();
  }, [stopRecording]);

  // Cleanup —— 卸載時清掉計時器、尚在排程的逐幀回呼，並釋放 MediaPipe
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const video = videoRef.current;
      if (video && rvfcRef.current != null &&
        typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(rvfcRef.current);
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (landmarkerRef.current) {
        landmarkerRef.current.close?.();
      }
    };
  }, []);

  // Select Exercise & Enter Setup
  const selectExercise = useCallback((key) => {
    setExerciseKey(key);
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  // Format Time
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Phase: Select Exercise ──
  if (phase === 'select') {
    return (
      <UploadMobile
        userId={getUserId()}
        onFileSelect={handleFileSelect}
      />
    );
  }

  // ── Phase: Setup / Model Loading (WASM only) ──
  if (phase === 'setup') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: C.bg, fontFamily: FONT_STACK,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        maxWidth: 440, margin: '0 auto', padding: 32,
      }}>
        <div style={{ position: 'relative', width: 96, height: 96, marginBottom: 28 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', background: TITANIUM_DIAL_BG,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -2px 4px rgba(151,166,182,0.3)',
          }} />
          <div style={{
            position: 'absolute', inset: 12, borderRadius: '50%', background: C.bg,
            boxShadow: 'inset 0 2px 5px rgba(32,32,32,0.1)',
          }} />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="32" fill="none"
                stroke={C.coral} strokeWidth="3" strokeLinecap="round"
                strokeDasharray="50 150" />
            </svg>
          </motion.div>
        </div>

        <div style={{
          fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
          color: C.sub, textTransform: 'uppercase', marginBottom: 8,
        }}>
          動作偵測引擎
        </div>
        <p style={{
          fontSize: 16, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.01em',
        }}>
          {modelLoadProgress || '準備中...'}
        </p>
        <p style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
          首次載入約需 5–10 秒
        </p>
      </div>
    );
  }

  // ── Phase: Native Detecting (iOS app 內 Swift 端正在跑) ──
  if (phase === 'native-detecting') {
    return (
      <div style={LOADING_CENTER_WRAP}>
        <ProcessingSpinner
          progress={nativeProgress}
          title={`${nativeStage}…`}
          subtitle="動作偵測 · 原生引擎 (full)" />
      </div>
    );
  }

  // ── Phase: Analyzing (送 features 到後端評分) ──
  if (phase === 'analyzing') {
    return (
      <div style={LOADING_CENTER_WRAP}>
        <ProcessingSpinner
          progress={95}
          title="分析中..."
          subtitle="動作生物力學引擎" />
      </div>
    );
  }

  // ── Phase: Results ──
  if (phase === 'results' && results) {
    return (
      <ResultCarousel
        highlightsData={results.highlights}
        onRetry={() => {
          setPhase('select');
          setResults(null);
          setError(null);
        }}
      />
    );
  }

  // ── Phase: Live Camera (WASM fallback) ──
  const info = EXERCISE_INFO[exerciseKey];
  const ready = isVideoLoaded && isModelLoaded;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.black, fontFamily: FONT_STACK,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      maxWidth: 440, margin: '0 auto',
    }}>
      {/* ── Camera Stage ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} src={videoUrl} playsInline muted
          onLoadedMetadata={() => setIsVideoLoaded(true)}
          onEnded={handleVideoEnded}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />

        <canvas ref={canvasRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

        {/* Corner viewfinder brackets */}
        {[
          { top: 86, left: 16, borders: 'top-left' },
          { top: 86, right: 16, borders: 'top-right' },
          { bottom: 16, left: 16, borders: 'bottom-left' },
          { bottom: 16, right: 16, borders: 'bottom-right' },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute', width: 22, height: 22, pointerEvents: 'none',
            ...(c.top !== undefined ? { top: c.top } : {}),
            ...(c.bottom !== undefined ? { bottom: c.bottom } : {}),
            ...(c.left !== undefined ? { left: c.left } : {}),
            ...(c.right !== undefined ? { right: c.right } : {}),
            borderTop: c.borders.includes('top') ? '2px solid rgba(223,228,234,0.7)' : 'none',
            borderBottom: c.borders.includes('bottom') ? '2px solid rgba(223,228,234,0.7)' : 'none',
            borderLeft: c.borders.includes('left') ? '2px solid rgba(223,228,234,0.7)' : 'none',
            borderRight: c.borders.includes('right') ? '2px solid rgba(223,228,234,0.7)' : 'none',
          }} />
        ))}

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '50px 16px 14px',
          background: 'linear-gradient(180deg, rgba(32,32,32,0.78) 0%, transparent 100%)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <motion.button {...pressProps('row')} onClick={() => { stopCamera(); setPhase('select'); }}
 className="ms-tap" style={{
 width: 38, height: 38, borderRadius: 11, cursor: 'pointer',
 background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.16)',
 backdropFilter: 'blur(8px)',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}>
            <ChevronLeft size={18} color="#F6F4F1" />
          </motion.button>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
              color: 'rgba(242,241,238,0.5)', textTransform: 'uppercase',
            }}>
              即時動作偵測
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#F6F4F1', marginTop: 1 }}>
              {info?.name}
            </div>
          </div>

          <motion.button {...pressProps('row')} onClick={() => setShowSkeleton(!showSkeleton)}
 className="ms-tap" style={{
 width: 38, height: 38, borderRadius: 11, cursor: 'pointer',
 background: showSkeleton ? C.coral : 'rgba(255,255,255,0.12)',
 border: `1px solid ${showSkeleton ? C.coral : 'rgba(255,255,255,0.16)'}`,
 backdropFilter: 'blur(8px)',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}>
            {showSkeleton ? <Eye size={16} color="#F6F4F1" /> : <EyeOff size={16} color="#F6F4F1" />}
          </motion.button>
        </div>

        {/* ── 拍攝角度建議 (僅在未錄影時顯示) ── */}
        <AnimatePresence>
          {!isRecording && info?.guide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                position: 'absolute', top: '50%', left: 24, right: 24,
                transform: 'translateY(-50%)',

                // 🌟 柔和平滑鋼鐵 (Smooth Steel #5A5A59) 質感
                background: `
                  radial-gradient(circle at 50% -20%, rgba(255,255,255,0.3) 0%, transparent 80%),
                  linear-gradient(120deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 35%, transparent 50%, rgba(255,255,255,0.1) 55%, transparent 65%, rgba(0,0,0,0.25) 100%),
                  #5A5A59
                `,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',

                borderTop: '1px solid rgba(255, 255, 255, 0.4)',
                borderBottom: '1px solid rgba(0, 0, 0, 0.4)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
                borderRight: '1px solid rgba(0, 0, 0, 0.2)',

                borderRadius: 18,
                padding: '24px 20px',
                textAlign: 'center',
                boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.2)',
                zIndex: 10,
              }}
            >
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 99, padding: '6px 12px', marginBottom: 16,
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2), 0 1px 1px rgba(255,255,255,0.1)',
              }}>
                <Camera size={14} color={C.paper} style={{ marginRight: 6 }} />
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: C.paper, }}>
                  最佳拍攝視角建議
                </span>
              </div>

              {/* 方位與高度雙區塊並排 */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.12)',
                  padding: '10px 8px', borderRadius: 12,
                  borderTop: '1px solid rgba(0,0,0,0.2)',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4, fontWeight: 700 }}>水平方位</div>
                  <div style={{
                    fontSize: 15, fontWeight: 800, color: C.paper,
                    textShadow: '0 1px 2px rgba(0,0,0,0.4)'
                  }}>
                    {info.guide.direction}
                  </div>
                </div>

                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.12)',
                  padding: '10px 8px', borderRadius: 12,
                  borderTop: '1px solid rgba(0,0,0,0.2)',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4, fontWeight: 700 }}>相機高度 / 仰角</div>
                  <div style={{
                    fontSize: 15, fontWeight: 800, color: C.paper,
                    textShadow: '0 1px 2px rgba(0,0,0,0.4)'
                  }}>
                    {info.guide.height}
                  </div>
                </div>
              </div>

              <p style={{
                margin: 0, fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)', fontWeight: 500,
                textShadow: '0 1px 2px rgba(0,0,0,0.4)'
              }}>
                {info.guide.desc}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* REC status pill */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(32,32,32,0.82)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 99, padding: '7px 14px',
              }}>
              <span className="ms-breathe" style={{
                width: 7, height: 7, borderRadius: 99, background: C.coral,
              }} />
              <span style={{
                fontFamily: MONO_STACK, fontSize: 11.5, fontWeight: 800, color: '#F6F4F1',
              }}>
                {formatTime(elapsedSec)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Low Visibility Warning */}
        <AnimatePresence>
          {lowVisWarning && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                position: 'absolute', bottom: 28, left: 16, right: 16,
                background: 'rgba(255,70,40,0.94)', borderRadius: 12, padding: '11px 14px',
                display: 'flex', alignItems: 'center', gap: 9,
                boxShadow: '0 8px 24px -10px rgba(0,0,0,0.5)',
              }}>
              <AlertTriangle size={16} color="#F6F4F1" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F6F4F1' }}>
                骨架偵測信心不足 — 請調整角度或光線
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom Control Bar ── */}
      <div style={{
        padding: '18px 24px 34px', background: C.black,
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{
          textAlign: 'center', marginBottom: 14,
          fontSize: 12, fontWeight: 800, letterSpacing: '0.16em',
          color: 'rgba(242,241,238,0.4)', textTransform: 'uppercase',
        }}>
          {isRecording ? '偵測中 · 完成動作後自動結束'
            : ready ? '按下開始 · 對齊取景框'
              : '影片載入中…'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {!isRecording ? (
            <motion.button whileTap={{ scale: 0.92 }}
              onClick={startAnalysis} disabled={!ready}
              style={{
                width: 74, height: 74, borderRadius: '50%', cursor: ready ? 'pointer' : 'default',
                background: ready ? C.coral : 'rgba(255,255,255,0.1)',
                border: `3px solid ${ready ? 'rgba(255,70,40,0.3)' : 'rgba(255,255,255,0.08)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: ready ? 1 : 0.5,
                boxShadow: ready ? '0 0 0 8px rgba(255,70,40,0.10)' : 'none',
              }}>
              <Play size={26} color="#F6F4F1" fill="#F6F4F1" />
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.92 }}
              onClick={stopRecording}
              style={{
                width: 74, height: 74, borderRadius: '50%', cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)',
                border: '3px solid rgba(255,255,255,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Square size={22} color={C.coral} fill={C.coral} />
            </motion.button>
          )}
        </div>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            onClick={() => setError(null)}
            style={{
              position: 'absolute', bottom: 132, left: 16, right: 16,
              background: C.coral, borderRadius: 12, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
            }}>
            <AlertTriangle size={16} color="#F6F4F1" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F6F4F1', flex: 1 }}>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PoseAnalyzerMobile;
