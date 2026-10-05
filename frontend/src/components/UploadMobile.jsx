/**
 * UploadMobile.jsx — 動作偵測 · 影片上傳
 * ───────────────────────────────────────────────────────────────
 * 設計語彙：瑞士雜誌排版 · 啞光紙質 · 金屬銀漸層點綴 · 圖二四色配色
 *   #F6F4F1 (White Smoke) — 底色 / 卡片
 *   #B9C8D7 (Metallic Silver) — 金屬銀漸層點綴
 *   #F95C4B (Red Orange) — 強調色
 *   #262523 (Charcoal Black) — 主文字 / 重點壓陣
 * ───────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Camera, ChevronLeft, Check, AlertTriangle, Aperture, Info, Plus, Minus
} from 'lucide-react';
import { canStartPoseCheck, refreshMembership } from '../utils/membership';
import CameraAngleFinder from './CameraAngleFinder';
import InAppRecorder from './InAppRecorder';
import ViewPicker from './ViewPicker';
import { specFor, rigFor } from '../lib/exerciseSpec';
import { useNavigate, useLocation } from 'react-router-dom';
import { getOrbState, setOrbProgress, completeOrb, failOrb } from '../utils/aiAnalysisOrb';
import {
  getAnalysisJob, startAnalysisJob, setAnalysisJobId,
  updateAnalysisJob, finishAnalysisJob, failAnalysisJob, clearAnalysisJob,
} from '../utils/analysisJob';
import ProcessingSpinner from './ProcessingSpinner';
import { uploadUserVideo } from '../api/client';
import apiClient from '../api/client';
import { ensureAuthBeforeFetch } from '../utils/guestAuth';

// ─── 色票（圖二四色 + 衍生中性色） ─────────────────────────
const C = {
  smoke: '#F6F4F1',          // White Smoke — 系統底色
  paper: '#F6F4F1',          // 啞光紙白 — 卡片表面
  paperDeep: '#EFEEEC',      // 啞光紙凹 — 凹槽 / 次級卡
  silver: '#B9C8D7',         // Metallic Silver — 金屬銀
  silverLite: '#D7DFE6',     // 銀霧（淺）
  silverDeep: '#8FA1B3',     // 銀霧（深）
  orange: '#F95C4B',         // Red Orange — 強調色
  orangeWash: 'rgba(255,70,40,0.10)',
  orangeDeep: '#D8331C',
  ink: '#262523',            // Charcoal Black — 主文字
  inkSoft: '#3A3A3A',        // 次級深色
  sub: '#6E6E6E',            // 次要文字
  faint: '#9C9C9C',          // 弱化文字
  hairline: '#DCDCDC',       // 分隔細線
  hairlineStrong: '#C7C7C7',
};

// 金屬銀漸層 — 用於小型點綴（圖標 / 滑動高光），不再大面積使用
const SILVER_BG = `linear-gradient(150deg, ${C.silverLite} 0%, ${C.silver} 50%, ${C.silverDeep} 100%)`;
// 啞光紙質感 — 極輕微的微差，不是金屬反光
const MATTE_PAPER = `linear-gradient(180deg, ${C.paper} 0%, #F4F3F1 100%)`;
// 鈦金屬亮面 — PANTONE 20-0005 TPM Chrome
const BRUSHED_TI_LITE = 'linear-gradient(135deg, #F6F4F1 0%, #E8ECEF 25%, #C9D4DF 50%, #B4C2D0 75%, #9AA9B8 100%)';
const BRUSHED_GUNPOWDER_HAIRLINE = `
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

// 單支影片上限：對齊 api/client.js 的 maxBodyLength（500MB），超過 axios 會直接丟錯、
//   使用者只看到一串英文。先在這裡擋下並說清楚怎麼辦。
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
// 輪詢總時限：後端也有 10 分鐘無進度的看門狗，這裡是前端最後保險 —— 轉圈不能無限轉。
const POLL_MAX_MS = 20 * 60 * 1000;

/** 把 axios / 後端錯誤轉成看得懂的中文（後端可能回 error / message / reason / detail）。 */
function describeError(err) {
  const d = err?.response?.data || {};
  const status = err?.response?.status;
  if (status === 413) return '影片太大，伺服器收不下。請裁短或改用 1080p / 30fps 再拍一次。';
  if (status === 429) return '分析次數太頻繁，請稍等一下再試。';
  if (status === 404 && d.reason) return d.reason;
  const msg = d.message || (typeof d.error === 'string' ? d.error : '') || d.reason
    || (typeof d.detail === 'string' ? d.detail : '');
  if (msg && msg !== 'not_video') return msg;
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
    return '連線逾時。網路可能不穩，請換到 Wi-Fi 後重試。';
  }
  if (!err?.response && /network/i.test(err?.message || '')) {
    return '網路連線中斷，請確認網路後重試。';
  }
  return err?.message && /[\u4e00-\u9fff]/.test(err.message) ? err.message : '分析失敗，請重試。';
}

const UploadMobile = ({ userId, selectedCoach, onAnalyzeComplete, onFileSelect }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSideView, setIsSideView] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [error, setError] = useState(null);
  const [isDragHover, setIsDragHover] = useState(false);
  const fileInputRef = useRef(null);

  const exerciseKeyEarly = location.state?.exerciseKey || null;
  // 【v9.3】分析也要能選機位 —— 模板既然分機位建，分析當然要指定用哪一份。
  //   正面量得到膝內夾、正側面量得到蹲深與軀幹，是不同的量。
  /* ⚠️ 一定要先讀 location.state.viewCode。TemplateUploadMobile 與結果頁的
     「再測一次」都會把使用者實際選的機位帶過來；不讀的話會被重設回主機位，
     剛建好側面模板的人會看到「還沒有正面 0° 的模板」。 */
  const [viewCode, setViewCode] = useState(
    () => location.state?.viewCode || specFor(exerciseKeyEarly)?.primaryView || null);
  const spec = specFor(exerciseKeyEarly, viewCode);
  const rig = rigFor(exerciseKeyEarly, viewCode);

  // ── 內建拍攝流程：angle（對角度）→ record（錄影）→ null（回列表）──
  //   從相簿選的舊路徑收在 showLegacyUpload 裡，不再是主要入口。
  const [captureStage, setCaptureStage] = useState(null);
  const [showLegacyUpload, setShowLegacyUpload] = useState(false);
  const [angleResult, setAngleResult] = useState(null);
  const [showWhy, setShowWhy] = useState(false);
  // { [view]: {exists, reps} } —— null = 還在查
  const [tplMap, setTplMap] = useState(null);

  // ── v4.1 階段計時器狀態 ─────────────────────────────────────
  const [stageTimings, setStageTimings] = useState([]);   // [{stage, ms}, ...]
  const [currentStageMs, setCurrentStageMs] = useState(0); // 目前階段已耗時
  const [totalMs, setTotalMs] = useState(0);               // 整體已耗時
  const analysisStartRef = useRef(0);          // 整個分析開始的時間戳
  const stageStartRef = useRef(0);             // 目前階段開始的時間戳
  const prevStageRef = useRef('');             // 上一個 stage 名稱
  const timerIdRef = useRef(null);

  // ── 【v9.2】沒有該機位的模板就不能分析 ────────────────────────
  //   模板是評分的基準；沒有基準卻硬給分數，就是這個專題整篇在反對的事。
  useEffect(() => {
    let alive = true;
    if (!exerciseKeyEarly) { setTplMap({}); return undefined; }
    apiClient.get('/api/multi-exercise/exercises')
      .then(r => {
        if (!alive) return;
        const ex = (r.data?.exercises || []).find(e => e.key === exerciseKeyEarly);
        setTplMap(ex?.templates || {});
      })
      .catch(() => { if (alive) setTplMap(null); });   // 查不到就不擋，交給後端判
    return () => { alive = false; };
  }, [exerciseKeyEarly]);

  // 選到的機位有沒有模板。tplMap 為 null（查不到後端）時不擋。
  // 【v9.3】不能拿 _legacy 當任何機位的模板 —— 那份是 v5.3 之前的共用檔，
  //   機位未知。拿它去比正側面的影片，比到的是投影差異不是動作差異。
  const hasTpl = tplMap === null ? null
    : (viewCode ? !!tplMap[viewCode]?.exists : true);

  // 每 200ms 更新 currentStageMs / totalMs，提供即時跑秒效果
  useEffect(() => {
    if (processingProgress > 0 && processingProgress < 100) {
      if (!analysisStartRef.current) {
        // 用持久化的 startedAt 換算（跨頁重掛載也能延續總計時，不會歸零重來）
        const job = getAnalysisJob();
        const elapsedMs = job.startedAt ? (Date.now() - job.startedAt) : 0;
        analysisStartRef.current = performance.now() - elapsedMs;
        stageStartRef.current = performance.now();
      }
      timerIdRef.current = setInterval(() => {
        const now = performance.now();
        setCurrentStageMs(now - stageStartRef.current);
        setTotalMs(now - analysisStartRef.current);
      }, 200);
      return () => clearInterval(timerIdRef.current);
    } else {
      // 結束 / 重置
      if (timerIdRef.current) clearInterval(timerIdRef.current);
      if (processingProgress === 0) {
        analysisStartRef.current = 0;
        stageStartRef.current = 0;
        prevStageRef.current = '';
        setStageTimings([]);
        setCurrentStageMs(0);
        setTotalMs(0);
      }
    }
  }, [processingProgress]);

  // 當 processingStage 改變 → 將前一個 stage 的耗時計入 stageTimings
  useEffect(() => {
    if (!processingStage) return;
    const now = performance.now();
    if (prevStageRef.current && prevStageRef.current !== processingStage) {
      const elapsed = now - stageStartRef.current;
      setStageTimings((prev) => [
        ...prev,
        { stage: prevStageRef.current, ms: elapsed },
      ]);
    }
    if (!analysisStartRef.current) analysisStartRef.current = now;
    stageStartRef.current = now;
    prevStageRef.current = processingStage;
    setCurrentStageMs(0);
  }, [processingStage]);

  // 分析完成（progress 到 100）→ 把最後一個 stage 也封存
  useEffect(() => {
    if (processingProgress >= 100 && prevStageRef.current) {
      const now = performance.now();
      setStageTimings((prev) => {
        // 避免重複封存
        if (prev.length && prev[prev.length - 1].stage === prevStageRef.current) {
          return prev;
        }
        return [...prev, { stage: prevStageRef.current, ms: now - stageStartRef.current }];
      });
      // 最終總時間 console 印出，方便除錯
      console.info('[Analysis Timing]', {
        total: ((now - analysisStartRef.current) / 1000).toFixed(2) + 's',
        stages: stageTimings,
      });
    }
  }, [processingProgress]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 🔮 把分析進度同步到 AI 分析浮球的進度環（若此次分析是從訓練中暫停進來的）
  // 分析進度 → 浮球進度環（完成的 completeOrb 在取得 result 後另外呼叫，這裡只更新進度/旋轉）
  useEffect(() => {
    const orb = getOrbState();
    if (!orb.active) return;
    if (processingProgress > 0 && processingProgress < 100) {
      setOrbProgress(processingProgress, '分析中…');
    }
  }, [processingProgress]);

  // 主動觸發 input 開啟檔案選擇器（避開 framer-motion 動畫干擾 label 行為）
  const triggerFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // 處理拖放上傳
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragHover(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    // 用人造 event 走原本的 handleFileUpload 流程
    handleFileUpload({ target: { files: [file] } });
  };

  const multiExercise = location.state?.multiExercise || false;
  const exerciseKey = location.state?.exerciseKey || null;
  const exerciseName = location.state?.exerciseName || '';
  const exerciseNameEn = location.state?.exerciseNameEn || '';

  // 旗標：避免重掛載時重複啟動輪詢
  const pollingRef = useRef(false);
  // 取消：停止輪詢 / 中止上傳；lastFileRef 給「重試」用（App 內錄的影片不必重拍）
  const cancelledRef = useRef(false);
  const abortRef = useRef(null);
  const stopPollRef = useRef(null);
  const lastFileRef = useRef(null);

  // ── 共用：輪詢後端真實進度，直到 done / error ──
  //   抽成獨立函式，讓「首次上傳後」與「跨頁重掛載 rehydrate」都能呼叫，
  //   並把進度寫進持久化 store（切回訓練頁再回來時 loading 才不會消失/歸零）。
  const runPolling = (jobId) => {
    if (!jobId) return Promise.reject(new Error('缺少工作編號'));
    pollingRef.current = true;
    return new Promise((resolve, reject) => {
      let stopped = false;
      let miss = 0;
      const t0 = Date.now();
      stopPollRef.current = () => {
        stopped = true;
        pollingRef.current = false;
        const e = new Error('已取消分析。');
        e.cancelled = true;
        reject(e);
      };
      const poll = async () => {
        if (stopped) return;
        if (Date.now() - t0 > POLL_MAX_MS) {
          stopped = true;
          pollingRef.current = false;
          reject(new Error('分析逾時，20 分鐘都沒有結果。請重新上傳一次。'));
          return;
        }
        try {
          const st = await apiClient.get(
            `/api/multi-exercise/analyze-status/${jobId}`, { timeout: 15000 });
          const d = st.data || {};
          const displayPct = 15 + Math.floor((d.percent || 0) * 0.85);
          if (d.stage) setProcessingStage(d.stage);
          setProcessingProgress(displayPct);
          // 同步寫進持久化 store
          updateAnalysisJob({ progress: displayPct, stage: d.stage });
          // 🔮 直接更新浮球進度環 — 不依賴 UploadMobile 是否掛載，
          //    所以切回訓練頁時浮球進度仍會即時前進（解決「浮球停在 36%」）。
          if (getOrbState().active && displayPct < 100) {
            setOrbProgress(displayPct, d.stage || '分析中…');
          }
          if (d.status === 'done') {
            stopped = true;
            pollingRef.current = false;
            setProcessingProgress(100);
            resolve(d.result);
            return;
          }
          if (d.status === 'error') {
            stopped = true;
            pollingRef.current = false;
            reject(new Error(d.error || '分析失敗，請重試。'));
            return;
          }
          miss = 0;
          setTimeout(poll, 800);   // 每 0.8 秒輪詢一次
        } catch (pollErr) {
          if (stopped) return;
          // 404 = 工作記錄不在了（後端重啟）→ 再輪也沒用；其餘（斷線、逾時）容忍幾次再放棄
          const st = pollErr?.response?.status;
          if (st !== 404 && st !== 401 && ++miss <= 5) {
            setTimeout(poll, 2000);
            return;
          }
          stopped = true;
          pollingRef.current = false;
          reject(pollErr);
        }
      };
      poll();
    });
  };

  // ── 完成後的收尾：標記浮球 / 持久化 store，並導向結果頁 ──
  const handleAnalysisDone = (result) => {
    finishAnalysisJob(result);
    refreshMembership();   // 這個月的姿勢檢查次數 +1（由後端回報）
    if (getOrbState().active) {
      completeOrb({ resultTo: '/result-mobile', resultState: { result }, label: '分析完成 · 點我看結果' });
    }
    if (onAnalyzeComplete) onAnalyzeComplete(result);
    else navigate('/result-mobile', { state: { result } });
  };

  // ── Rehydrate：掛載時若 store 內有未完成的 job，立即接手 ──
  //   這解決了「切回訓練頁再回分析頁 → loading 消失 / 進度歸零」的問題。
  useEffect(() => {
    const job = getAnalysisJob();
    if (!job.active || job.status !== 'running') {
      // 若上一輪已完成但還沒被結果頁消化，這裡不主動跳轉，交給正常流程。
      return;
    }
    // 立刻還原畫面進度（避免閃現 0）
    setProcessingProgress(job.progress || 1);
    setProcessingStage(job.stage || '');
    // 若有 jobId 且目前沒有在輪詢 → 接手繼續輪詢
    if (job.jobId && !pollingRef.current) {
      runPolling(job.jobId)
        .then((result) => handleAnalysisDone(result))
        .catch((err) => {
          if (err?.cancelled) return;      // 使用者按了取消，已由 handleCancel 收尾
          console.error('Resume polling failed', err);
          setError(describeError(err));
          setProcessingProgress(0);
          setProcessingStage('');
          failAnalysisJob(err.message);
          failOrb();
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    // 同一支影片可以再選一次（不然 onChange 不會觸發）
    try { if (e.target.value) e.target.value = ''; } catch (_) { /* ignore */ }

    // 型別 / 大小先在前端擋，不要等上傳完才失敗
    if (file.type && !file.type.startsWith('video/')) {
      setError('這不是影片檔。請選擇 MP4 或 MOV 格式的影片。');
      return;
    }
    if (file.size === 0) {
      setError('影片是空的，請重新錄一次。');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`影片 ${(file.size / 1024 / 1024).toFixed(0)} MB，超過 500 MB 上限。請裁到 1 分鐘內，只留 3–5 下完整動作。`);
      return;
    }
    lastFileRef.current = file;
    cancelledRef.current = false;

    if (onFileSelect) {
      onFileSelect(file, isSideView, exerciseKey, viewCode);
      return;
    }

    // 姿勢檢查 2026-09 起全部免費、不限次數（canStartPoseCheck 永遠放行；保留呼叫點以便日後再收）
    if (!canStartPoseCheck()) {
      try { e.target.value = ''; } catch (_) { /* ignore */ }
      return;
    }

    setProcessingProgress(1);
    setProcessingStage('');
    // 開一個持久化 job（記住起始時間 / 參數），跨頁重掛載才能延續
    startAnalysisJob({ multiExercise, exerciseKey, exerciseName, exerciseNameEn, isSideView });
    try {
      if (multiExercise && exerciseKey) {
        const formData = new FormData();
        formData.append('exercise_key', exerciseKey);
        formData.append('file', file);
        formData.append('is_side_view', isSideView);
        // 【v9.2】一定要帶 view，否則後端會去找 v5.3 之前的舊檔名，
        //   明明剛建好的分機位模板會被判成「沒有模板」。
        if (viewCode) formData.append('view', viewCode);
        if (userId) formData.append('user_id', userId);

        // ── 1. 上傳影片並建立分析工作（上傳進度對應 0~15%）──
        setProcessingStage('上傳影片中');
        updateAnalysisJob({ stage: '上傳影片中', progress: 1 });
        await ensureAuthBeforeFetch();   // 訪客沒 token 時先補換，不然上傳完才 401
        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
        abortRef.current = ac;
        const startRes = await apiClient.post('/api/multi-exercise/analyze-async', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,          // 行動網路上傳大影片 2 分鐘常常不夠
          ...(ac ? { signal: ac.signal } : {}),
          onUploadProgress: (evt) => {
            if (evt.total) {
              const up = Math.min(15, Math.floor((evt.loaded / evt.total) * 15));
              setProcessingProgress(up);
              updateAnalysisJob({ progress: up });
            }
          },
        });
        abortRef.current = null;
        if (cancelledRef.current) {
          // 上傳剛好在按取消的同時完成 → 後端工作也要叫停，否則它會照樣寫進歷史
          if (startRes.data?.job_id) {
            apiClient.post(`/api/multi-exercise/analyze-cancel/${startRes.data.job_id}`, null, { timeout: 8000 })
              .catch(() => { /* ignore */ });
          }
          return;
        }
        const jobId = startRes.data?.job_id;
        if (!jobId) throw new Error('伺服器未回傳工作編號');
        setAnalysisJobId(jobId);   // 持久化 jobId → 重掛載可接手輪詢

        // ── 2. 輪詢後端真實進度（後端 0~100% 映射到顯示 15~100%）──
        //    後端逐階段回報：擷取骨架 → 切割動作 → 比對標準 → 產生 AR 影片
        const result = await runPolling(jobId);

        // ✅ 分析「真正結束」後才收尾並跳結果頁
        handleAnalysisDone(result);
      } else {
        const result = await uploadUserVideo(
          file, isSideView, userId, selectedCoach?.coach_id || 'default',
          (percent) => {
            const p = 10 + Math.floor(percent * 0.8);
            setProcessingProgress(p);
            updateAnalysisJob({ progress: p });
          });
        if (cancelledRef.current) return;   // 使用者已取消 → 不要再跳結果頁
        setProcessingProgress(100);
        finishAnalysisJob(result);
        if (onAnalyzeComplete) onAnalyzeComplete(result);
        // 🩹 原本導向 /cardio-results-mobile —— 那條路由不存在（白畫面），
        //    而且 state key 是 results（結算頁讀的是 cardioData），會掉進 mock 假資料。
        //    這裡分析的是動作影片，正確落點與 App.jsx 給的 onAnalyzeComplete 一致。
        else navigate('/result-mobile', { state: { result } });
      }
    } catch (err) {
      abortRef.current = null;
      if (cancelledRef.current || err?.cancelled || err?.code === 'ERR_CANCELED') return;  // 已由 handleCancel 收尾
      console.error('Upload failed', err);
      if (err.response?.status === 403 && err.response?.data?.error === 'membership_required') {
        // 後端判定這個月的免費次數用完（例如另一台裝置剛用掉）→ 同一張付費牆，不顯示錯誤字串
        setProcessingProgress(0);
        setProcessingStage('');
        failAnalysisJob('membership_required');
        failOrb();
        refreshMembership();
        return;
      }
      setError(describeError(err));
      setProcessingProgress(0);
      setProcessingStage('');
      failAnalysisJob(err.message);
      failOrb();
    }
  };

  // ── 取消分析：中止上傳 / 停止輪詢、通知後端不要寫歷史，畫面與浮球都回到可操作狀態 ──
  const handleCancel = () => {
    cancelledRef.current = true;
    const jobId = getAnalysisJob().jobId;
    try { abortRef.current?.abort(); } catch (_) { /* ignore */ }
    abortRef.current = null;
    if (stopPollRef.current) { try { stopPollRef.current(); } catch (_) { /* ignore */ } }
    stopPollRef.current = null;
    pollingRef.current = false;
    if (jobId) {
      apiClient.post(`/api/multi-exercise/analyze-cancel/${jobId}`, null, { timeout: 8000 })
        .catch(() => { /* 取消請求失敗也不影響前端收尾 */ });
    }
    clearAnalysisJob();
    failOrb('已取消 · 點我重新分析');
    setProcessingProgress(0);
    setProcessingStage('');
    setError(null);
  };

  const handleRetry = () => {
    const f = lastFileRef.current;
    if (!f) return;
    handleFileUpload({ target: { files: [f] } });
  };

  // coach-mobile（Select Coach）已廢棄；返回一律回到動作選擇 / 分析入口，
  // 避免分析出錯按返回時跳到廢棄的選教練頁。
  const backPath = multiExercise ? '/exercise-selector-mobile' : '/analysis-choice-mobile';

  // ── 內建拍攝：角度引導 ─────────────────────────────────────
  //   角度沒對，後面的分數再漂亮都不代表什麼（實測 >30° 連標準動作都只剩 22 分）
  if (captureStage === 'angle') {
    return (
      <CameraAngleFinder
        exerciseKey={exerciseKey}
        viewCode={viewCode}
        exerciseName={exerciseName}
        onReady={(r) => { setAngleResult(r); setCaptureStage('record'); }}
        onSkip={() => { setAngleResult({ verified: false }); setCaptureStage('record'); }}
        onCancel={() => setCaptureStage(null)}
      />
    );
  }

  // ── 內建拍攝：錄影 ────────────────────────────────────────
  if (captureStage === 'record') {
    // 【v9.3】用 off（離目標角度）而不是 relAzimuth（相對身體正面的原始方位）
    const off = angleResult?.skeletonOff
      ?? (Number.isFinite(angleResult?.off) ? Math.abs(angleResult.off) : null);
    return (
      <InAppRecorder
        exerciseName={multiExercise ? exerciseName : ''}
        viewName={spec?.viewName || '自選機位'}
        angleNote={angleResult?.verified && off != null
          ? `離已驗證機位 ${Math.round(off)}°`
          : (angleResult?.verified === false ? '角度未驗證' : null)}
        onCancel={() => setCaptureStage(angleResult ? 'angle' : null)}
        onDone={(file) => {
          setCaptureStage(null);
          handleFileUpload({ target: { files: [file] } });
        }}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100dvh', maxWidth: 440, margin: '0 auto',
      background: C.smoke, fontFamily: FONT_STACK, position: 'relative',
      display: 'flex', flexDirection: 'column', color: C.ink,
    }}>
      {/* ──────────────────  PROCESSING OVERLAY  ────────────────── */}
      {processingProgress > 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(245,245,245,0.94)', backdropFilter: 'blur(10px)',
        }}>
          <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ProcessingSpinner
              progress={processingProgress}
              title="分析中..."
              subtitle={processingStage || (multiExercise ? exerciseName : '動作生物力學引擎')}
              stageTimings={stageTimings}
              currentStageMs={currentStageMs}
              totalMs={totalMs}
            />
            {/* 取消：分析可能要一兩分鐘，一定要有出口 */}
            <motion.button {...pressProps('row')}
              onClick={handleCancel}
              style={{
                marginTop: 18, minWidth: 140, height: 44, padding: '0 22px', borderRadius: 12,
                border: `1px solid ${C.hairlineStrong}`, background: C.paper, color: C.inkSoft,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
              取消分析
            </motion.button>
          </div>
        </div>
      )}

      {/* ──────────────────  HEADER  ────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_SWISS }}
        style={{ padding: '52px 20px 0' }}>

        {/* 返回鈕 — 啞光紙質 + 細鈦邊 */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => navigate(backPath)}
          style={{
            width: 42, height: 42, borderRadius: 12, cursor: 'pointer',
            border: `1px solid ${C.hairlineStrong}`,
            background: C.paper,
            marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 0 #fff inset, 0 2px 6px rgba(32,32,32,0.04)',
          }}>
          <ChevronLeft size={18} color={C.ink} strokeWidth={2} />
        </motion.button>

        {/* 雜誌式 overline */}
        <div style={{
          fontFamily: MONO_STACK,
          fontSize: 12, fontWeight: 700, letterSpacing: '0.26em',
          color: C.faint, textTransform: 'uppercase', marginBottom: 12,
        }}>
          動作偵測&nbsp;·&nbsp;影片分析
        </div>

        {/* 主標題 — 瑞士大字 */}
        <h1 style={{
          fontSize: 34, fontWeight: 800, color: C.ink, margin: 0,
          letterSpacing: '-0.035em', lineHeight: 1.0,
        }}>
          {multiExercise ? exerciseName : '上傳訓練影片'}
        </h1>

        {/* 編號副標 + 紅線 */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14,
          paddingBottom: 12, borderBottom: `2px solid ${C.ink}`,
          position: 'relative',
        }}>
          {/* 底線左端的橘色短條（重點點綴） */}
          <div style={{
            position: 'absolute', bottom: -2, left: 0,
            width: 32, height: 2, background: C.orange,
          }} />
          <span style={{
            fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800,
            color: C.orange, letterSpacing: '0.04em',
          }}>
            02
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, letterSpacing: '-0.005em' }}>
            {multiExercise && exerciseNameEn
              ? `${exerciseNameEn} · 上傳後立即比對教練標準`
              : '上傳後立即比對教練標準動作'}
          </span>
        </div>
      </motion.div>

      {/* ──────────────────  CONTENT  ────────────────── */}
      <div style={{ flex: 1, padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 教練資訊（如有） */}
        {!multiExercise && selectedCoach && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: EASE_SWISS }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12,
              background: C.paper, border: `1px solid ${C.hairline}`,
              boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset',
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, background: SILVER_BG,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 2px 4px rgba(143,161,179,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Aperture size={18} color={C.ink} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{
                fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                color: C.faint, textTransform: 'uppercase',
              }}>
                COACH
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginTop: 2 }}>
                {selectedCoach.name}
              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            主要入口：App 內建拍攝
            ──────────────────────────────────────────────────────
            實測：離已驗證機位超過 30°，連標準動作都只剩 22–26 分（正面 93）
            —— 角度不對整個量測就失效。從相簿選的影片，系統只能事後
            才發現角度不對，使用者已經練完了。所以「先對角度再拍」是主路徑。
            ══════════════════════════════════════════════════════ */}
        {/* ── 選機位 —— 兩頁共用同一個元件，長相與語意必須一致 ── */}
        <ViewPicker
          exerciseKey={exerciseKeyEarly}
          value={viewCode}
          onChange={(v) => { setViewCode(v); setAngleResult(null); setError(null); setShowWhy(false); }}
          templates={tplMap}
          requireTemplate
        />

        {/* 沒有該機位的模板 → 擋在這裡，先去建模板 */}
        {hasTpl === false && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_SWISS }}
            style={{
              borderRadius: 16, background: C.paper, overflow: 'hidden',
              border: `1px solid ${C.hairlineStrong}`, position: 'relative',
            }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: C.orange }} />
            <div style={{ padding: '18px 18px 18px 21px' }}>
              <div style={{
                fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em',
                color: C.orange, textTransform: 'uppercase',
              }}>NO TEMPLATE</div>
              <div style={{
                fontSize: 21, fontWeight: 300, color: C.ink, letterSpacing: '-0.02em',
                marginTop: 8, lineHeight: 1.25,
              }}>還沒有{spec?.viewName || ''}的模板</div>
              <p style={{ fontSize: 12.5, lineHeight: 1.65, color: C.sub, margin: '10px 0 0', maxWidth: '30ch' }}>
                分數是「跟教練的標準動作比」算出來的。沒有基準就給分數，等於憑空生一個數字。
                先錄 3 支標準動作當模板。
              </p>
              <motion.button {...pressProps('row')}
 onClick={() => navigate('/template-upload-mobile', {
 state: { ...location.state, viewCode },
 })}
 style={{
 width: '100%', height: 48, marginTop: 15, borderRadius: 12, border: 'none',
 background: C.ink, color: '#F6F4F1', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
 }}>
                去建立模板
              </motion.button>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_SWISS }}
          style={{
            background: C.paper, borderRadius: 4,
            border: `1px solid ${C.hairline}`, padding: '20px 20px 18px',
            opacity: hasTpl === false ? 0.4 : 1,
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
              }}>{spec?.viewName || '自選機位'}</div>
            </div>
            {/* 所有理由收在這一個問號裡 */}
            <motion.button {...pressProps('row')}
 onClick={() => { setShowWhy(v => !v); }}
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

          {/* 就三行，講完怎麼架 */}
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
                  抓得到：<b style={{ color: C.ink, fontWeight: 600 }}>{spec.catches.join('、')}</b>；
                  抓不到、系統不會宣告：{spec.blind.join('、')}。
                  <div style={{ height: 1, background: C.hairline, margin: '11px 0' }} />
                  請至少做 3 下完整反覆，系統會自動過濾起步與收操的不穩定軌跡。
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button {...pressProps('row')}
 onClick={() => { if (hasTpl !== false) setCaptureStage('angle'); }}
 disabled={hasTpl === false}
 style={{
 width: '100%', height: 52, marginTop: 18, borderRadius: 4, border: 'none',
 background: hasTpl === false ? '#DCDDDA' : C.ink,
 color: hasTpl === false ? C.faint : '#F6F4F1',
 fontSize: 15, fontWeight: 600, letterSpacing: '0.01em',
 cursor: hasTpl === false ? 'not-allowed' : 'pointer',
 }}>
            開始對角度
          </motion.button>
        </motion.div>

        {/* 隱藏 input — 由 ref 主動觸發 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {/* 已有模板 → 提供重建入口（分析的基準想換隨時可以換） */}
        {hasTpl === true && (
          <motion.button {...pressProps('row')}
 onClick={() => navigate('/template-upload-mobile', {
 state: { ...location.state, viewCode },
 })}
 style={{
 width: '100%', padding: '11px 14px', borderRadius: 4, cursor: 'pointer',
 background: 'transparent', border: `1px solid ${C.hairline}`,
 display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
 }}>
            <span style={{
              width: 5, height: 5, borderRadius: 999, background: '#5A7A3A', flexShrink: 0,
            }} />
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>
              {spec?.viewName} 的模板已就緒
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.orange }}>重建</span>
          </motion.button>
        )}

        {/* ── 次要入口：已經拍好了 ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, ease: EASE_SWISS }}
          style={{
            borderRadius: 14, background: '#E8E9E6',
            border: `1px solid ${C.hairline}`, overflow: 'hidden',
          }}>
          <motion.button {...pressProps('row')}
 onClick={() => setShowLegacyUpload(v => !v)}
 style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 11,
 padding: '13px 15px', background: 'none', border: 'none', cursor: 'pointer',
 textAlign: 'left',
 }}>
            <Upload size={16} color={C.sub} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: C.inkSoft }}>
              已經拍好了？從相簿選擇
            </span>
            <span style={{
              fontSize: 18, color: C.faint, lineHeight: 1,
              transform: showLegacyUpload ? 'rotate(45deg)' : 'none', transition: 'transform .22s',
            }}>＋</span>
          </motion.button>
          <AnimatePresence initial={false}>
            {showLegacyUpload && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_SWISS }}
                style={{ overflow: 'hidden' }}>
                <div style={{ padding: '0 15px 15px' }}>
                  <div style={{
                    display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(255,70,40,0.08)', marginBottom: 12,
                  }}>
                    <AlertTriangle size={14} color={C.orange} strokeWidth={2.2}
                      style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 11.5, lineHeight: 1.55, color: C.sub }}>
                      系統無法事先知道這支影片的拍攝角度。分析後若量到超過 30° 容差，
                      報告上會標明<b style={{ color: C.ink }}>「此機位未驗證」</b>並建議重拍。
                    </span>
                  </div>

                  <div
                    role="button" tabIndex={0}
                    onClick={triggerFilePicker}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerFilePicker(); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragHover(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragHover(false); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                      height: 50, borderRadius: 10, cursor: 'pointer',
                      background: C.paper,
                      border: `1.5px dashed ${isDragHover ? C.orange : C.hairlineStrong}`,
                      transition: 'border-color .2s',
                    }}>
                    <Upload size={16} color={C.silverDeep} strokeWidth={2} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>
                      選擇影片檔（MP4 · MOV）
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* 錯誤訊息 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px 14px', borderRadius: 12,
              background: C.orangeWash, border: `1px solid ${C.orange}`,
              display: 'flex', alignItems: 'flex-start', gap: 9,
            }}>
            <AlertTriangle size={17} color={C.orange} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.orange }}>{error}</span>
            {lastFileRef.current && (
              <motion.button {...pressProps('row')} onClick={handleRetry}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
                  border: 'none', background: C.orange, color: '#fff', fontSize: 12.5, fontWeight: 700,
                }}>
                重試
              </motion.button>
            )}
          </motion.div>
        )}

      </div>

      <div style={{ padding: '20px', height: 24 }} />
    </div>
  );
};

export default UploadMobile;
