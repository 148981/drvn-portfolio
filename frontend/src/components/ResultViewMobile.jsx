/**
 * ResultViewMobile.jsx — 動作偵測分析結果頁
 * ───────────────────────────────────────────────────────────────
 * 重新設計：瑞士雜誌排版 · 鈦金屬質感 · 單一強調色 (FF4628)
 *
 * 資訊架構（由上而下，依「使用者最需要知道什麼」排序）：
 *  1. 鈦金屬分數錶盤 — 一眼看到整體表現與等級
 *  2. 重點診斷       — 自動把最弱項排到最前，「弱項一眼可見」
 *  3. 七項指標總表   — 完整指標，弱項用強調色拉高層級
 *  4. 動作對照軌     — 自己 vs 教練標準的逐幀曲線
 *  5. 歷史趨勢       — 「進步看得到」
 * ───────────────────────────────────────────────────────────────
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  motion, AnimatePresence, useMotionValue, useTransform,
  useInView, animate, useSpring,
} from 'framer-motion';
import {
  Home, RotateCcw, Trophy, AlertTriangle, AlertCircle, Play, ChevronRight,
  Trash2, TrendingUp, Activity, Plus, Minus, ChevronLeft,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  Area, AreaChart, ReferenceArea,
} from 'recharts';
import { getUserId } from '../utils/auth';
import { clearAnalysisJob } from '../utils/analysisJob';
import { GradeBar, PriorityCard, StatChip, gradeOf } from './motion/DiagnosisComponents';
import { toast, confirmDialog } from '../utils/toast';
import { FLAGS } from '../config/featureFlags';
import apiClient from '../api/client';
import { recordAction } from '../utils/momentEngine';
import { uGet, uSet } from '../utils/userStorage';

/* 指標中文對照 — 涵蓋後端所有動作的 metric_labels
 * (滑輪下拉/深蹲/硬舉/臥推/肩推/划船 的指標名稱各不相同) */
import { specFor, uncoveredReasons } from '../lib/exerciseSpec';
import PoseFeedbackCard from './PoseFeedbackCard';

const METRIC_ZH = {
  // 共用 / 滑輪下拉
  'L Elbow': '左肘軌跡', 'R Elbow': '右肘軌跡', 'Torso Lean': '軀幹前傾',
  'Tempo': '節奏控制', 'Elbow Sym': '左右對稱', 'Stability': '核心穩定',
  'Shrug': '聳肩控制',
  // 深蹲
  'L Knee': '左膝軌跡', 'R Knee': '右膝軌跡', 'Hip Depth': '下蹲深度',
  'Knee Sym': '膝蓋對稱', 'Knee Valgus': '膝蓋內夾',
  // 硬舉
  'Hip Hinge': '髖鉸鏈', 'Back Flat': '背部平直', 'Bar Path': '槓鈴軌跡',
  // 臥推
  'Elbow Flare': '手肘外展', 'Wrist Align': '手腕對齊', 'Shoulder Retract': '肩胛收緊',
  // 肩推
  'L Overhead': '左側過頭', 'R Overhead': '右側過頭',
  // 划船
  'Torso Hinge': '軀幹角度', 'Hip Stability': '髖部穩定',
  // v4.6 信任度修正後的新標籤
  'Forearm Vertical': '前臂垂直', 'Grip Width': '握距一致',
  'Pull Depth': '拉桿幅度', 'Bar Tilt': '桿面水平', 'Body Line': '軀幹水平',
  // 舊版相容
  'L Arm': '左臂軌跡', 'R Arm': '右臂軌跡', 'Torso': '軀幹穩定',
  'Symmetry': '左右對稱', 'Shoulder': '肩部位置',
};

/* 把英文指標名轉成顯示用中文 */
const zh = (k) => METRIC_ZH[k] || k;

/* ══════════════════════════════════════════════════════════════════
   每個指標的個別教練回饋
   ══════════════════════════════════════════════════════════════════
   分數的意義：以「教練自己重複做兩次的差距」為單位。
   90 分以上 = 落在教練自身的重複性範圍內，那不是缺點，是雜訊，不用講。
   所以這裡分三級，只有真的偏離才給具體做法。
   ────────────────────────────────────────────────────────────────── */
const METRIC_COACH = {
  'L Knee': {
    axis: '左膝屈曲角（度）— 打直是 0°，越彎數字越大', shape: '下蹲時角度變大（彎曲加深），起身時回到接近 0',
    w: '左膝在下蹲時往前推過多或軌跡飄',
    fix: '想著「用腳跟推地板」，膝蓋對準第二腳趾，不要讓它超過腳尖太多。' },
  'R Knee': {
    axis: '右膝屈曲角（度）— 打直是 0°，越彎數字越大', shape: '下蹲時角度變大（彎曲加深），起身時回到接近 0',
    w: '右膝在下蹲時往前推過多或軌跡飄',
    fix: '想著「用腳跟推地板」，膝蓋對準第二腳趾，不要讓它超過腳尖太多。' },
  'Torso Lean': {
    axis: '軀幹前傾角（度）— 站直是 0°，只算前後方向，左右歪不算', shape: '下蹲時前傾增加、到最低點達峰值，起身回正',
    w: '上半身倒得比教練前面，接近早安式',
    fix: '下蹲時胸口保持朝前、核心繃住；重量太重會自然變成用背扛，先降重量。' },
  'Hip Depth': {
    axis: '大腿與地面的夾角（度）— 0° 剛好是大腿平行地面', shape: '單一個峰頂，越高代表蹲越深；站直約 −90°',
    w: '蹲得比教練淺，沒到大腿與地面平行',
    fix: '慢一點下去，感覺髖低於膝再起身。蹲不下去多半是腳踝活動度，先做背屈伸展。' },
  'Knee Sym': {
    axis: '左右膝屈曲角差了幾 %（0% 代表完全對稱）', shape: '全程應該貼近 0，兩腿同步彎同步起',
    w: '左右腿出力不平均，重心偏一邊',
    fix: '對著鏡子做，確認兩邊膝蓋同時彎、同時起。單邊弱可以補分腿蹲。' },
  'Knee Valgus': {
    axis: '膝間距比踝間距窄了幾成（0 = 膝踝同寬，越大＝膝越往內夾）', shape: '全程應該平穩，起身瞬間往上衝就是內夾',
    w: '起身時膝蓋往內塌（knee valgus）',
    fix: '起身瞬間想著「把地板往外撕開」，讓膝蓋往外頂住。這是最該優先修的一項。' },
  'Stability': {
    axis: '重心偏離兩腳中線幾 %（以兩腳間距為尺）', shape: '越平越好，尖峰代表那一瞬間重心偏到一邊',
    w: '重心偏離兩腳中線比教練多',
    fix: '放慢節奏、核心先繃住再下蹲，不要靠慣性彈起來。' },
  'Elbow Flare': {
    axis: '上臂與軀幹的夾角（度）', shape: '下放時角度增加，最低點是峰值；90° 接近 T 字',
    w: '手肘外展比教練開，接近 T 字',
    fix: '把手肘收到與身體約 45–75°，想著「把槓往腳的方向掰」。外展過開最傷肩。' },
  'Forearm Vertical': {
    axis: '前臂偏離垂直的角度（度）', shape: '最低點應該接近 0（前臂垂直地面）',
    w: '前臂沒有保持垂直，手腕吃到力',
    fix: '調整握距讓最低點時前臂垂直地面，槓壓在掌根不是手指。' },
  'Elbow Sym': {
    axis: '左右肘角度差 ÷ 肩寬', shape: '全程應該貼近 0',
    w: '左右手肘角度不一致',
    fix: '確認握距對稱、槓在胸口置中；單邊弱可補啞鈴推。' },
  'Grip Width': {
    axis: '握距 ÷ 肩寬', shape: '全程幾乎是一條水平線，握距不該變',
    w: '握距與教練不同，力矩會跟著變',
    fix: '固定用同一個握距（滾花刻度當記號），不然每次量到的都不是同一件事。' },
  'Tempo': {
    axis: '向心佔整下的比例', shape: '離心（放下）應該比向心（推起）慢',
    w: '向心／離心比例與教練差距大',
    fix: '離心（放下）刻意放慢到 2 秒以上，向心再穩定推起。' },
  'Hip Hinge': {
    axis: '髖角（度）', shape: '起槓時髖先往後推、角度先變小',
    w: '髖沒有先推回去，變成用蹲的硬拉',
    fix: '起始時想「屁股先碰後面的牆」，槓到膝蓋時上身約 45° 前傾。' },
  'Back Flat': {
    axis: '脊椎中立度（偏離直線的程度）', shape: '全程越平越好，隆起代表圓背',
    w: '背部沒保持中立，出現圓背',
    fix: '起槓前先把胸口打開、闊背繃緊；圓背風險高，寧可降重量。' },
  'Bar Path': {
    axis: '槓鈴水平偏移量', shape: '越接近一條垂直線越好',
    w: '槓鈴軌跡偏離身體',
    fix: '槓貼著小腿垂直上下，不要往前繞。' },
};

/**
 * 這一項要不要特別講、講什麼。
 *   fine  ≥85 落在教練自身重複性內 → 一句帶過，不佔版面
 *   watch 70–85 看得出差異但還不到明顯偏離
 *   fix   <70  統計上已明顯偏離，給具體做法
 */
function metricAdvice(key, score) {
  const t = METRIC_COACH[key];
  if (!Number.isFinite(score)) return null;
  if (score >= 85) {
    return { level: 'fine', head: '這項沒問題', body: '落在教練自己重複做兩次的差距範圍內，不用特別調整。' };
  }
  if (score >= 70) {
    return {
      level: 'watch', head: '可以再收一點',
      body: t ? `${t.w}，但幅度還不大。${t.fix}` : '與教練標準有可見差距，維持注意即可。',
    };
  }
  return {
    level: 'fix', head: '這項要優先修',
    body: t ? `${t.w}。${t.fix}` : '與教練標準明顯偏離，建議降低重量把動作做穩再加。',
  };
}

// ─── Color Palette (圖二四色系統 · 啞光紙質 + 鈦金屬刻度點綴) ────────────────
// 1) White Smoke #F6F4F1 — 系統底色
// 2) Metallic Silver #B9C8D7 — 金屬銀（點綴，不大面積）
// 3) Red Orange #F95C4B — 強調色
// 4) Charcoal Black #262523 — 主文字 / 錶盤
const C = {
  // 主四色（圖二）
  smoke: '#F6F4F1',       // White Smoke — 系統底
  silver: '#B9C8D7',      // Metallic Silver — 金屬銀
  orange: '#F95C4B',      // Red Orange — 強調色
  ink: '#262523',         // Charcoal Black — 主文字

  // 衍生中性
  paper: '#F6F4F1',       // 啞光紙白（卡片）
  paperDeep: '#EFEEEC',   // 啞光紙凹
  paperWarm: '#F6F4F1',   // 暖紙底
  hairline: '#DCDCDC',
  hairlineStrong: '#C7C7C7',
  sub: '#6E6E6E',
  faint: '#9C9C9C',
  inkSoft: '#3A3A3A',

  // 銀漸層分層
  silverLite: '#D7DFE6',
  silverDeep: '#8FA1B3',

  // 強調色衍生
  orangeDeep: '#D8331C',
  orangeLite: '#FF7A60',
  orangeWash: 'rgba(255,70,40,0.10)',

  // 錶盤深色（圖三那種純黑啞光）
  dialBlack: '#161415',     // 啞光黑底
  dialBlackLite: '#262626', // 啞光微差
  dialEdge: '#3A3A3A',      // 啞光邊緣

  // 別名（向後相容舊程式碼）
  black: '#262523',
  stone: '#EFEEEC',
  pebble: '#DCDCDC',
  coral: '#F95C4B',
  bg: '#F6F4F1',
  text: '#262523',
  graphite: '#262523',
  steel: '#6E6E6E',
  ti1: '#F6F4F1',
  ti2: '#EFEEEC',
  ti3: '#DCDCDC',
  ti4: '#C7C7C7',
  ti5: '#9C9C9C',
  ember: '#D8331C',
};

// 金屬銀漸層 — 限定小面積點綴（圖標、刻度高光）
const SILVER_BG = `linear-gradient(150deg, ${C.silverLite} 0%, ${C.silver} 50%, ${C.silverDeep} 100%)`;

// 啞光紙質感 — 取代過去的拉絲鈦
const MATTE_PAPER = `linear-gradient(180deg, ${C.paper} 0%, #F4F3F1 100%)`;
const MATTE_PAPER_WARM = `linear-gradient(180deg, ${C.paperWarm} 0%, #ECEAE5 100%)`;

// 啞光黑色（用於錶盤底盤、AR 按鈕等需要深色的地方）
const MATTE_BLACK = `linear-gradient(180deg, ${C.dialBlackLite} 0%, ${C.dialBlack} 100%)`;

// 向後相容（內部仍使用這些名稱）
const BRUSHED_TI = MATTE_PAPER;
const BRUSHED_TI_LINES = 'none';
const METAL_PANEL_BG = MATTE_PAPER;
const BRUSHED_TI_DARK = MATTE_BLACK;

const FONT_STACK = '"Helvetica Neue", -apple-system, sans-serif';
const MONO_STACK = '"SF Mono", "JetBrains Mono", Menlo, monospace';

const EASE_SWISS = [0.16, 1, 0.3, 1];
const EASE_SPRING = [0.34, 1.56, 0.64, 1];

const ResultViewMobile = ({ inlineResult, inlineViewHistory, onRetry }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const result = inlineResult || location.state?.result;

  const viewHistoryMode = inlineViewHistory !== undefined ? inlineViewHistory : location.state?.viewHistory;
  const [activeTab, setActiveTab] = useState(viewHistoryMode ? 'history' : 'analysis');
  const [activeChartMetric, setActiveChartMetric] = useState(null);
  const [showUncovered, setShowUncovered] = useState(false);
  const [activeHistoryMetric, setActiveHistoryMetric] = useState(null);
  const [activeRepIndex, setActiveRepIndex] = useState(0);
  const [repsExpanded, setRepsExpanded] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [previousScore, setPreviousScore] = useState(null);
  const userId = getUserId();

  /* ── 再測一次 ─────────────────────────────────────────────
     ⚠️ 以前是直接 navigate('/upload-mobile')，什麼都不帶。
        UploadMobile 的 `if (multiExercise && exerciseKey)` 因此走 else 分支，
        掉進 v5 的舊 /upload/user 管線 —— 那條路寫進歷史的動作名稱是寫死的
        「Bicep Curl」、時長永遠 0、而且沒有 exerciseKey，歷史頁會直接濾掉它。
        使用者按「再測一次」等於靜靜地換了一台引擎，而且結果會憑空消失。
        帶齊 exerciseKey / multiExercise / viewCode 才會走回同一條分析路。 */
  const goReAnalyze = useCallback(() => {
    const exerciseKey = result?.exerciseKey || null;
    if (!exerciseKey) { navigate('/exercise-selector-mobile'); return; }
    navigate('/upload-mobile', {
      state: {
        exerciseKey,
        exerciseName: result?.exerciseName || null,
        exerciseNameEn: result?.exerciseNameEn || null,
        multiExercise: true,
        // 用同一個機位重測，成績才比得起來
        viewCode: result?.view || result?.debug?.meta?.view || null,
      },
    });
  }, [result, navigate]);

  /* ── 進到結果頁 = 分析已真正結束 → 清空持久化分析 job ────────
     （否則下次進 /upload-mobile 會 rehydrate 到這筆舊的 done job） */
  useEffect(() => {
    if (result) clearAnalysisJob();
  }, [result]);

  /* ✨ Swiss Moment · 前幾次里程碑：完成第 1/3/7 次動作分析 → 滿版遞進回饋。
     以 session_id 防重（回看同一筆結果不重複計數）。 */
  useEffect(() => {
    const sid = result?.session_id;
    if (!sid || !userId) return;
    try {
      if (uGet(userId, 'momentPoseSeen', '') === sid) return;
      uSet(userId, 'momentPoseSeen', sid);
      recordAction(userId, 'pose_analysis', '完成動作分析');
    } catch { /* */ }
  }, [result, userId]);

  /* ── 抓上一次分數供比較 ─────────────────────────────────── */
  useEffect(() => {
    const fetchComparison = async () => {
      if (!result || !userId) return;
      try {
        // 🔧 改用 apiClient：走 VITE_API_URL + 自動帶 JWT（寫死 :8000 上線會斷、
        //    raw fetch 沒帶 Authorization 會被後端 enforce_owner 擋下）
        const res = await apiClient.get(`/api/workout/history/${userId}`);
        {
          const data = res.data || {};
          const sorted = (data.history || []).sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          const currentId = result.session_id || result.id;
          /* 只跟「同一個動作、而且真的有分數」的上一次比 —— 原本會抓到別的動作
             或重訓課表的分數，深蹲跟臥推比出一個「進步 +12」毫無意義。 */
          const key = result.exerciseKey || null;
          const prev = sorted.find(s => s.session_id !== currentId && s.id !== currentId
            && s.exerciseKey && (!key || s.exerciseKey === key)
            && Number.isFinite(Number(s.overall_score)) && s.overall_score !== null);
          setPreviousScore(prev ? Number(prev.overall_score) : null);
        }
      } catch (e) {
        console.error('Failed to fetch history for comparison', e);
      }
    };
    fetchComparison();
  }, [result, userId]);

  /* ── 刪除單筆紀錄 ──────────────────────────────────────── */
  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!(await confirmDialog('確定要刪除這筆紀錄嗎？', { danger: true }))) return;

    // mock 資料只存在前端，直接移除即可
    if (sessionId && sessionId.toString().startsWith('mock_')) {
      setHistoryData(prev => prev.filter(s => s.session_id !== sessionId));
      return;
    }

    if (!userId || !sessionId) {
      toast.error('刪除失敗：缺少使用者或紀錄編號');
      return;
    }

    try {
      // 使用 POST /api/workout/history/delete（user_id 制）
      // POST 是為了繞過 iOS WebView / Safari 對 DELETE 的 CORS preflight 限制
      // 🔧 改用 apiClient：走 VITE_API_URL + 自動帶 JWT
      await apiClient.post('/api/workout/history/delete',
        { user_id: userId, workout_id: sessionId });
      // 只有伺服器確認刪除成功，才從畫面移除（避免「假刪除」重整後又出現）
      setHistoryData(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (err) {
      console.error('Error deleting session:', err);
      if (err.response) {
        const msg = err.response.status === 404 ? '找不到這筆紀錄' : '刪除失敗，請稍後再試';
        toast.info(msg);
      } else {
        toast.error('刪除失敗：無法連線到伺服器');
      }
    }
  };

  /* ── 詳情頁刪除：刪掉後返回歷史列表 ─────────────────────── */
  const handleDeleteSessionDetail = async (sessionId) => {
    if (!(await confirmDialog('確定要刪除這筆紀錄嗎？', { danger: true }))) return;

    // mock 資料：沒有後端紀錄，直接返回列表
    if (sessionId && sessionId.toString().startsWith('mock_')) {
      navigate('/result-mobile', { state: { viewHistory: true } });
      return;
    }

    if (!userId || !sessionId) {
      toast.error('刪除失敗：缺少使用者或紀錄編號');
      return;
    }

    try {
      // 🔧 改用 apiClient：走 VITE_API_URL + 自動帶 JWT
      await apiClient.post('/api/workout/history/delete',
        { user_id: userId, workout_id: sessionId });
      // 刪除成功 → 回到歷史列表（會重新抓取最新資料）
      navigate('/result-mobile', { state: { viewHistory: true } });
    } catch (err) {
      console.error('Error deleting session:', err);
      if (err.response) {
        const msg = err.response.status === 404 ? '找不到這筆紀錄' : '刪除失敗，請稍後再試';
        toast.info(msg);
      } else {
        toast.error('刪除失敗：無法連線到伺服器');
      }
    }
  };

  /* ── 抓歷史資料 ────────────────────────────────────────── */
  useEffect(() => {
    if (activeTab !== 'history') return;
    const fetchHistory = async () => {
      try {
        // 🔧 改用 apiClient：走 VITE_API_URL + 自動帶 JWT
        const response = await apiClient.get(`/api/workout/history/${userId}`);
        const data = response.data || {};
        const formatted = (data.history || []).map(session => {
          let flat = {};
          let raw = session.metrics;
          try {
            if (typeof raw === 'string') {
              try { raw = JSON.parse(raw); } catch { raw = {}; }
            }
            if (Array.isArray(raw)) {
              raw.forEach(m => { if (m.subject && m.A !== undefined) flat[m.subject] = m.A; });
            } else if (raw && typeof raw === 'object') {
              flat = raw;
            }
          } catch (err) {
            console.error('Error processing metrics', session.session_id, err);
          }
          return {
            ...session,
            date: session.timestamp
              ? new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : 'N/A',
            ...flat,
          };
        }).reverse();

        /* ⚠️ 只留「這個動作的動作分析紀錄」。
           以前是「有 metrics 或 overall_score 就收」，於是深蹲與臥推畫在同一條
           趨勢線上，連重訓課表完成寫進去的分數也一起收進來 —— 那條線不代表
           任何一件事。動作分析紀錄一定帶 exerciseKey，重訓紀錄沒有。 */
        const key = result?.exerciseKey || null;
        const valid = formatted.filter(s =>
          s.exerciseKey && (!key || s.exerciseKey === key) &&
          (s.overall_score !== undefined || s.metrics !== undefined));
        setHistoryData(valid.length > 0 ? valid : []);
      } catch (e) {
        console.log('Error fetching history:', e);
        setHistoryData([]);
      }
    };
    fetchHistory();
    // result?.exerciseKey 進 deps：換了動作要重抓，否則趨勢會停在上一個動作
  }, [activeTab, userId, result?.exerciseKey]);

  /* ── 同步 tab 狀態 ─────────────────────────────────────── */
  useEffect(() => {
    if (location.state?.viewHistory !== undefined) {
      setActiveTab(location.state.viewHistory ? 'history' : 'analysis');
    } else if (result) {
      setActiveTab('analysis');
    }
  }, [location.key, location.state, result]);

  /* ── 把 metrics 正規化成 [{subject, A}] ─────────────────── */
  const metricList = useMemo(() => {
    if (!result?.metrics) return [];
    if (Array.isArray(result.metrics)) {
      // 【v9.3】A 是 null / NaN 代表「這個機位量不到」，不是 0 分。
      //   舊版用 `m.A !== undefined ? m.A : (m.value || 0)`，null 會原樣留下
      //   然後在圖表被畫成 0 —— 從歷史點進來整排變成 0.0% 需加強。
      return result.metrics.map(m => {
        const v = m.A ?? m.value;
        const ok = Number.isFinite(v);
        return {
          subject: m.subject || m.name || '—',
          A: ok ? v : null,
          fullMark: 100,
          occluded: !!m.occluded || !ok,
        };
      });
    }
    if (typeof result.metrics === 'object') {
      return Object.keys(result.metrics).map(k => {
        const v = result.metrics[k];
        return {
          subject: k,
          A: Number.isFinite(v) ? v : null,
          fullMark: 100,
          occluded: !Number.isFinite(v),
        };
      });
    }
    return [];
  }, [result]);

  /* ── 弱項排序：分數由低到高，「弱項一眼可見」 ───────────
     被遮蔽的指標排除在外 —— 它沒有有效資料，不該被當成弱項。 */
  /* 這支影片的機位規格（單一真相來源）。
     ⚠️ Hook 必須在任何 early return 之前，不能放在空狀態判斷後面。 */
  /* ⚠️ 一定要傳 result.view —— 不傳的話 specFor 會退回主機位，
     使用者用側面拍，畫面卻宣告「正面 0° 抓得到膝蓋內夾」。 */
  const resultSpec = specFor(result?.exerciseKey, result?.view || result?.debug?.meta?.view);
  /* 這個機位「做過對照實驗、確認抓得到」的指標 —— 直接讀 spec 的 key。
     以前是拿 catches 的中文去跟 METRIC_ZH 互相包含比對，
     「肘外展過開」與「手肘外展」互不包含，臥推的徽章永遠不亮。 */
  const validatedMetricKeys = useMemo(
    () => new Set(resultSpec?.catchMetrics || []),
    [resultSpec]);

  const rankedMetrics = useMemo(
    () => metricList.filter(m => !m.occluded).sort((a, b) => a.A - b.A),
    [metricList]);

  /* ── 視角遮蔽的指標：因拍攝角度該側肢體偵測不到 ──────────
     這些指標不列入弱項、不畫圖、不誤扣分，僅以空狀態提示。 */
  const occludedMetrics = useMemo(() => {
    if (Array.isArray(result?.occludedMetrics) && result.occludedMetrics.length > 0)
      return result.occludedMetrics;
    return metricList.filter(m => m.occluded).map(m => m.subject);
  }, [result, metricList]);

  /* ── 修正建議：優先用後端 feedback，否則由弱項生成 ──────── */
  const corrections = useMemo(() => {
    const fb = result?.feedback;
    if (Array.isArray(fb) && fb.length > 0) {
      return fb
        .filter(item => item.type !== 'occluded')   // 被遮蔽的不算修正建議
        .map(item => ({
          title: item.title,
          score: item.score ?? 0,
          problem: item.desc || '此項目偏離理想範圍。',
          fix: item.fix || '依照教練標準曲線調整動作節奏。',
        }))
        .sort((a, b) => a.score - b.score);
    }
    // fallback：用最弱的 2 項生成
    return rankedMetrics.slice(0, 2).map(m => ({
      title: zh(m.subject),
      score: m.A,
      problem: `${zh(m.subject)}的軌跡與標準動作有明顯落差。`,
      fix: '放慢這個段落，對照下方教練曲線逐幀調整。',
    }));
  }, [result, rankedMetrics]);

  /* ── 是否有真實逐幀曲線資料 ─────────────────────────────
     後端 analyze_set 會回傳 chartsData；但歷史紀錄不一定存。
     沒有真實資料時整段「動作對照」隱藏，不顯示誤導空狀態。 */
  const hasChartData = useMemo(() => {
    const cd = result?.chartsData;
    return Array.isArray(cd) && cd.some(rep =>
      rep && typeof rep === 'object' &&
      Object.values(rep).some(v => Array.isArray(v) && v.length > 0));
  }, [result]);

  /* ── 動態指標清單 ────────────────────────────────────────
     直接用 chartsData 實際的 key，不論後端是哪個動作
     (深蹲/硬舉/臥推… 指標名各不相同) 都對得上。 */
  const chartMetricKeys = useMemo(() => {
    const rep = result?.chartsData?.[activeRepIndex];
    if (!(rep && typeof rep === 'object')) return [];
    // 量不到（該角度遮蔽）的指標不進圖表——例如正面量不到下蹲深度/核心穩定
    const occl = new Set(metricList.filter(m => m.occluded).map(m => m.subject));
    const keys = Object.keys(rep).filter(k =>
      Array.isArray(rep[k]) && rep[k].length > 0 && !occl.has(k));
    const scoreOf = (k) => { const m = metricList.find(mm => mm.subject === k); return m ? m.A : 999; };
    // 可宣告(已驗證) 排最左；其次弱項在前
    keys.sort((a, b) => {
      const va = validatedMetricKeys.has(a) ? 0 : 1, vb = validatedMetricKeys.has(b) ? 0 : 1;
      if (va !== vb) return va - vb;
      return scoreOf(a) - scoreOf(b);
    });
    return keys;
  }, [result, activeRepIndex, metricList, validatedMetricKeys]);

  /* ── 最弱指標 — 分數最低、最需要加強的那一項 ──────────────
     動作對照是要看「哪裡要加強」，所以預設展示最弱項。 */
  const weakestChartMetric = useMemo(() => {
    for (const m of rankedMetrics) {           // rankedMetrics 已由低到高排序
      if (chartMetricKeys.includes(m.subject)) return m.subject;
    }
    return chartMetricKeys[0] || null;
  }, [rankedMetrics, chartMetricKeys]);

  /* result 載入後，曲線指標預設選「最弱項」 */
  useEffect(() => {
    if (chartMetricKeys.length > 0 &&
      (!activeChartMetric || !chartMetricKeys.includes(activeChartMetric))) {
      setActiveChartMetric(weakestChartMetric || chartMetricKeys[0]);
    }
  }, [chartMetricKeys, activeChartMetric, weakestChartMetric]);

  /* ── 最佳表現 rep — 找出分數最高的那一次反覆動作 ─────────
     fatigueData 每筆是 {rep, score}，挑分數最高者並對齊 chartsData。*/
  const bestRepIndex = useMemo(() => {
    const fd = result?.fatigueData;
    const repCount = Array.isArray(result?.chartsData) ? result.chartsData.length : 0;
    if (!Array.isArray(fd) || fd.length === 0 || repCount === 0) return 0;
    let best = 0;
    fd.forEach((d, i) => {
      if (i < repCount && (d?.score ?? 0) > (fd[best]?.score ?? 0)) best = i;
    });
    return Math.min(best, repCount - 1);
  }, [result]);

  const bestRepScore = useMemo(() => {
    const s = result?.fatigueData?.[bestRepIndex]?.score;
    return typeof s === 'number' ? Math.round(s) : null;
  }, [result, bestRepIndex]);

  /* result 載入後，預設優先顯示最佳 rep，且 REP 列預設收合 */
  useEffect(() => {
    setActiveRepIndex(bestRepIndex);
    setRepsExpanded(false);
  }, [bestRepIndex]);

  /* 歷史頁指標清單 — 從歷史紀錄掃出所有出現過的指標名 */
  const historyMetricKeys = useMemo(() => {
    const seen = new Set();
    historyData.forEach(s => {
      Object.keys(METRIC_ZH).forEach(k => {
        if (s[k] !== undefined) seen.add(k);
      });
    });
    return [...seen];
  }, [historyData]);

  useEffect(() => {
    const valid = ['__overall__', ...historyMetricKeys];
    if (!activeHistoryMetric || !valid.includes(activeHistoryMetric)) {
      setActiveHistoryMetric('__overall__');
    }
  }, [historyMetricKeys, activeHistoryMetric]);

  const getAnalysisChartData = () => {
    if (result?.chartsData?.[activeRepIndex] && activeChartMetric) {
      const d = result.chartsData[activeRepIndex][activeChartMetric];
      if (Array.isArray(d) && d.length > 0) return d;
    }
    return [];
  };
  const analysisChartData = getAnalysisChartData();

  /* ── 【v9.3】分數低於門檻時，在圖上標出偏離最差的那一段 ─────────
     只在 <85 分才標 —— 85 分以上的偏差落在教練自身重複性範圍內，
     那個區段標出來只是雜訊，會讓使用者以為自己做錯了。 */
  const chartHighlight = useMemo(() => {
    const mv = metricList.find(m => m.subject === activeChartMetric);
    if (!mv || !Number.isFinite(mv.A) || mv.A >= 85) return null;
    const d = analysisChartData.filter(p => Number.isFinite(p.user) && Number.isFinite(p.expert));
    if (d.length < 8) return null;
    // 滑動視窗找「跟教練差最多」的一段（視窗 = 全長的 1/5）
    const w = Math.max(3, Math.round(d.length / 5));
    let best = -1, bi = 0;
    for (let i = 0; i + w <= d.length; i++) {
      let sum = 0;
      for (let j = i; j < i + w; j++) sum += Math.abs(d[j].user - d[j].expert);
      if (sum > best) { best = sum; bi = i; }
    }
    return { x1: d[bi].frame, x2: d[bi + w - 1].frame };
  }, [analysisChartData, activeChartMetric, metricList]);

  /* ════════════════════════════════════════════════════════
     空狀態
     ════════════════════════════════════════════════════════ */
  if (!result && activeTab === 'analysis') {
    return (
      <div className="ms-screen" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 32,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--ms-accent-wash)', marginBottom: 20,
        }}>
          <AlertTriangle size={26} color="var(--ms-accent)" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          尚無分析結果
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ms-ink-2)', textAlign: 'center', margin: '0 0 28px' }}>
          上傳一段訓練影片，立即取得動作評分
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <motion.button {...pressProps('row')} onClick={() => setActiveTab('history')} className="ms-press" style={{
 padding: '13px 22px', borderRadius: 'var(--ms-r-sm)',
 background: 'var(--ms-surface)', border: '1px solid var(--ms-line)',
 fontSize: 12, fontWeight: 800, letterSpacing: '0.14em',
 textTransform: 'uppercase', color: 'var(--ms-ink)', cursor: 'pointer',
 }}>
            查看歷史
          </motion.button>
          <motion.button {...pressProps('row')} onClick={onRetry ? onRetry : goReAnalyze} className="ms-press" style={{
 padding: '13px 22px', borderRadius: 'var(--ms-r-sm)',
 background: 'var(--ms-ink)', border: 'none',
 fontSize: 12, fontWeight: 800, letterSpacing: '0.14em',
 textTransform: 'uppercase', color: 'var(--ms-paper)', cursor: 'pointer',
 }}>
            前往上傳
          </motion.button>
        </div>
      </div>
    );
  }

  /* 【v8.6】overallScore 可能是 null —— 沒有任何指標同時通過「量得到」與
     「量得準」兩關時後端會作廢分數。硬轉成 0 會讓使用者以為自己得 0 分，
     那比不給分危險得多（實測：有效權重 <30% 的影片平均拿 99 分，
     因為沒量到的指標一律零扣分）。 */
  const scoreVoid = !!result?.scoreVoid || result?.overallScore == null;
  const score = scoreVoid ? null : Math.round(result.overallScore);
  // 作廢時整個錶盤區塊不會 render，但仍給安全預設，避免任何路徑碰到 grade.key
  const grade = scoreVoid ? { key: 'void', en: 'N/A', label: '不評分' } : gradeOf(score);
  const improved = !scoreVoid && previousScore !== null && score > previousScore;
  const delta = improved ? (score - previousScore).toFixed(0) : 0;

  /* 這次分數的「保固範圍」—— 後端三道關卡的結果。
     分數單獨出現是有害的：使用者無法分辨「動作真的好」與
     「系統根本沒看到你哪裡做錯」。 */
  const canDetect = Array.isArray(result?.detectableErrors) ? result.detectableErrors : [];
  const cannotDetect = Array.isArray(result?.undetectableErrors) ? result.undetectableErrors : [];
  const scoredMetrics = Array.isArray(result?.scoredMetrics) ? result.scoredMetrics : [];
  /* 【v9.3】舊的歷史紀錄只存了分數與指標數值，沒存關卡判定。
     那種情況下不能推論「一個指標都沒過關」—— 那會跟畫面上的 93 分互相矛盾。
     沒有這個欄位就什麼都不宣稱，而不是宣稱最壞的情況。 */
  const hasGateInfo = Array.isArray(result?.scoredMetrics)
    || Array.isArray(result?.detectableErrors)
    || !!result?.poseGate;
  const countRel = result?.countReliability || null;
  // 【v9.2】事後從骨架反推的真實相機角度（拍攝前的羅盤只是估計）
  const poseGate = result?.poseGate || null;
  // 這支影片是什麼動作 → 拿它的機位規格（單一真相來源）

  const angleOk = poseGate?.ok !== false;

  return (
    <div className="ms-screen" style={{ paddingBottom: 120 }}>

      {/* ════════════════ HEADER (鈦金屬質感) ════════════════ */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_SWISS }}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '52px 20px 0',
        }}>
        {/* 左上角：返回「動作選擇」頁，方便連續分析下一個動作 */}
        <TitaniumIconButton onClick={() => { clearAnalysisJob(); navigate('/exercise-selector-mobile'); }}>
          <ChevronLeft size={18} color={C.ink} strokeWidth={2} />
        </TitaniumIconButton>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
            color: C.steel, letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>
            MOTION&nbsp;·&nbsp;ANALYSIS&nbsp;·&nbsp;REPORT
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, letterSpacing: '-0.015em',
            color: C.ink, marginTop: 4, display: 'flex',
            alignItems: 'center', gap: 7, justifyContent: 'center',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: C.ink, flexShrink: 0,
            }} />
            {(result?.exerciseName || result?.exercise_name || 'Form Analysis').replace(/[🔵🟢🟡🔴🟠🟣]/g, '').trim()}
          </div>
        </div>

        <TitaniumIconButton onClick={onRetry ? onRetry : goReAnalyze}>
          <RotateCcw size={16} color={C.ink} strokeWidth={1.8} />
        </TitaniumIconButton>
      </motion.header>

      {/* ════════════════ TAB SWITCH (啞光紙底凹槽) ════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: EASE_SWISS }}
        style={{ padding: '22px 20px 0' }}>
        <div style={{
          position: 'relative',
          display: 'flex', padding: 4, borderRadius: 12, gap: 0,
          background: C.paperDeep,
          border: `1px solid ${C.hairline}`,
          boxShadow: `inset 0 2px 3px rgba(32,32,32,0.05)`,
        }}>
          {[
            { id: 'analysis', label: '本次分析', sub: 'SESSION' },
            { id: 'history', label: '進步趨勢', sub: 'TREND' },
          ].map(t => {
            const active = activeTab === t.id;
            return (
              <motion.button {...pressProps('row')} key={t.id}
 onClick={() => {
 if (t.id === 'analysis' && !result) { navigate('/analysis-choice-mobile'); return; }
 setActiveTab(t.id);
 }}
 style={{
 position: 'relative', flex: 1, padding: '11px 0', borderRadius: 9,
 cursor: 'pointer', border: 'none', background: 'transparent',
 zIndex: 1, color: active ? C.ink : C.sub,
 transition: 'color 0.3s ease',
 }}>
                {active && (
                  <motion.div
                    layoutId="tab-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 9,
                      background: C.paper,
                      border: `1px solid ${C.hairlineStrong}`,
                      boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 5px rgba(32,32,32,0.06)',
                      zIndex: -1,
                    }} />
                )}
                <div style={{
                  fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em',
                }}>
                  {t.label}
                </div>
                <div style={{
                  fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.18em', marginTop: 2,
                  color: active ? C.orange : C.faint,
                }}>
                  {t.sub}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════
          ANALYSIS TAB
          ════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'analysis' && result ? (
          <motion.div key="analysis"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}>

            {/* ── 分數作廢：明講算不出來，不要給一個看起來正常的假分數 ──── */}
            {scoreVoid && (
              <section style={{ padding: '32px 20px 4px' }}>
                <div style={{
                  background: 'rgba(225,97,63,0.08)', border: '1px solid rgba(225,97,63,0.28)',
                  borderRadius: 16, padding: '20px 18px',
                }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.orange, marginBottom: 8 }}>
                    這個角度算不出有意義的分數
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: C.sub }}>
                    {result?.scoreVoidReason
                      || '沒有任何指標同時通過「量得到」與「量得準」兩關。'}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.sub, marginTop: 10, opacity: 0.8 }}>
                    硬給一個分數只會誤導你 —— 量不到的指標不會扣分，
                    算出來的分數反而會偏高。
                  </div>
                </div>
              </section>
            )}

            {/* ── 鈦金屬分數錶盤 ───────────────────────────── */}
            {!scoreVoid && (
            <section style={{ padding: '36px 20px 8px', textAlign: 'center' }}>
              <WatchDialScore score={score} />

              {/* 等級判讀 + 進步徽章 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.2, ease: EASE_SWISS }}
                style={{ marginTop: 24 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '8px 16px', borderRadius: 99,
                  background: MATTE_BLACK,
                  border: `1px solid ${C.dialEdge}`,
                  boxShadow: '0 4px 12px rgba(32,32,32,0.18)',
                }}>
                  <motion.span
                    animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      width: 6, height: 6, borderRadius: 99,
                      background: grade.key === 'weak' ? C.orange
                        : grade.key === 'watch' ? C.orangeLite : '#9BD5A0',
                      boxShadow: `0 0 8px ${grade.key === 'weak' ? C.orange : grade.key === 'watch' ? C.orangeLite : '#9BD5A0'}`,
                    }} />
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                    color: '#F6F4F1', textTransform: 'uppercase',
                    fontFamily: MONO_STACK,
                  }}>
                    {grade.en} · {grade.label}
                  </span>
                </div>

                {improved && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 1.5 }}
                    style={{
                      marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 13px', borderRadius: 99, marginLeft: 8,
                      background: `linear-gradient(135deg, ${C.orange}, ${C.ember})`,
                      boxShadow: `0 4px 12px rgba(255,90,31,0.25)`,
                    }}>
                    <TrendingUp size={12} color="#fff" strokeWidth={2.5} />
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: '#fff',
                      fontFamily: MONO_STACK, letterSpacing: '0.04em',
                    }}>
                      +{delta} vs LAST
                    </span>
                  </motion.div>
                )}
              </motion.div>
            </section>
            )}

            {/* ══════════════════════════════════════════════════════════
                【v8.6】分數的「保固範圍」—— 這一區不可省略
                ══════════════════════════════════════════════════════════
                一個單獨出現的「85 分」是有害的：使用者無法分辨
                「動作真的好」與「系統根本沒看到你哪裡做錯」。後者危險得多。

                實測依據（46 支影片，2026-08-04）：
                  深蹲正面   抓得到膝內夾（刻意做錯掉 56.8 分）
                  深蹲正側面 抓不到（只掉 8.9 分，跌破 20 分門檻）
                  臥推俯視   抓得到肘外展（掉 40.3 分）
                  臥推正側面 前臂骨長左右差 32–47% → 系統直接拒答
                同一套演算法、同一個人、同一次動作，換個角度就從
                「明確抓得到」掉到「量不到」。
                ══════════════════════════════════════════════════════════ */}
            {/* ══════════════════════════════════════════════════════════
                只講兩件事：這次有沒有抓到目標錯誤、角度在不在保固內。
                其餘（量不到哪些、計分幾項）全部收進下面的收折區。
                ══════════════════════════════════════════════════════════ */}
            {(poseGate || resultSpec?.catches?.length > 0) && (
              <section style={{ padding: '20px 20px 0' }}>
                <div style={{
                  borderRadius: 14, padding: angleOk ? '11px 14px' : '15px 17px',
                  background: 'rgba(255,255,255,0.55)',
                  border: `1px solid ${angleOk ? C.dialEdge : 'rgba(249,92,75,0.35)'}`,
                }}>
                  {/* ① 目標錯誤有沒有抓到（成功時整列縮小成一行）*/}
                  {resultSpec?.catches?.length > 0 && (() => {
                    const hit = canDetect.some(e => resultSpec.catches.includes(e.name));
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{
                          width: angleOk ? 18 : 22, height: angleOk ? 18 : 22, borderRadius: 999, flexShrink: 0,
                          background: hit ? '#5A7A3A' : C.orange,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {hit
                            ? <Trophy size={angleOk ? 10 : 12} color="#fff" strokeWidth={2.6} />
                            : <AlertTriangle size={12} color="#fff" strokeWidth={2.6} />}
                        </span>
                        <span style={{ fontSize: angleOk ? 13 : 15, fontWeight: 800, color: C.ink }}>
                          {resultSpec.catches.join('、')}
                          <span style={{ color: hit ? '#5A7A3A' : C.orange, marginLeft: 6 }}>
                            {hit ? '有偵測' : '這次沒偵測'}
                          </span>
                        </span>
                        {/* 成功時把角度收進同一行右側，不再占一整塊 */}
                        {angleOk && poseGate && Number.isFinite(poseGate.offset_deg) && (
                          <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: '#5A7A3A', fontFamily: MONO_STACK }}>
                            {Math.round(poseGate.offset_deg)}° · 保固內
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* ② 角度：超出保固單獨警示；或成功但沒宣告目標錯誤時，補一行角度 */}
                  {poseGate && Number.isFinite(poseGate.offset_deg) && (!angleOk || !resultSpec?.catches?.length) && (
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 8,
                      marginTop: resultSpec?.catches?.length ? 12 : 0,
                      paddingTop: resultSpec?.catches?.length ? 12 : 0,
                      borderTop: resultSpec?.catches?.length ? `1px solid ${C.dialEdge}` : 'none',
                    }}>
                      <span style={{
                        fontSize: angleOk ? 18 : 22, fontWeight: 300, letterSpacing: '-0.02em',
                        color: angleOk ? '#5A7A3A' : C.orange, fontVariantNumeric: 'tabular-nums',
                      }}>{Math.round(poseGate.offset_deg)}°</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                        {angleOk ? '角度在保固範圍內' : `超出 ${poseGate.tol ?? 30}° 保固，分數僅供參考`}
                      </span>
                    </div>
                  )}

                  {!angleOk && (
                    <motion.button {...pressProps('row')}
 onClick={() => navigate('/exercise-selector-mobile')}
 style={{
 width: '100%', height: 42, marginTop: 12, borderRadius: 10, border: 'none',
 background: C.ink, color: '#F6F4F1', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
 }}>
                      重新拍一次
                    </motion.button>
                  )}
                </div>
              </section>
            )}

            {/* ── 先改這裡：分析一結束就講最該修的 1–2 項 + 怎麼改 ── */}
            {corrections.filter(c => c.score < 85).length > 0 && (
              <section style={{ padding: '18px 20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: C.orange }}>FIX FIRST</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>先改這裡</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {corrections.filter(c => c.score < 85).slice(0, 2).map((c, i) => (
                    <div key={i} style={{
                      borderRadius: 14, padding: '13px 15px',
                      background: 'rgba(249,92,75,0.06)', border: '1px solid rgba(249,92,75,0.28)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 999, flexShrink: 0, background: C.orange,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: '#fff',
                        }}>{i + 1}</span>
                        <span style={{ fontSize: 14.5, fontWeight: 800, color: C.ink }}>{c.title}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700, color: C.orange, fontVariantNumeric: 'tabular-nums' }}>{Math.round(c.score)} 分</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, marginTop: 6 }}>{c.problem}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(22,20,21,0.08)' }}>
                        <span style={{ color: C.orange, marginRight: 5 }}>→ 怎麼改：</span>{c.fix}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── AR 疊合回放 CTA（往上移：疊影是最重要的一步）── */}
            {FLAGS.arAnalysis && result.arVideoUrl && (
              <section style={{ padding: '18px 20px 0' }}>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => navigate('/ar-mobile', { state: {
                    videoUrl: result.arVideoUrl,
                    repSegments: result.repSegments || [],
                    fatigueData: result.fatigueData || [],
                    repCorrections: result.repCorrections || [],
                    goldenPose: result.goldenPose || null,
                    userPose: result.userPose || null,
                    poseDrawIdx: result.poseDrawIdx || null,
                  } })}
                  style={{
                    width: '100%', padding: '15px', borderRadius: 12,
                    background: BRUSHED_TI_DARK, border: `1px solid ${C.ti5}`, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 20px rgba(0,0,0,0.18)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                  <Play size={14} fill={C.orange} color={C.orange} />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: C.ti1, fontFamily: MONO_STACK }}>
                    AR&nbsp;·&nbsp;疊上教練骨架
                  </span>
                </motion.button>
                <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.4, color: C.ink3 || '#8A857D', textAlign: 'center' }}>
                  ⓘ 此疊合回放僅供<b>本次分析當下</b>檢視，<b>不會存進歷史紀錄</b>；離開結算頁後就不再保留。
                </div>
              </section>
            )}

            {/* ── 七項指標總表 ─────────────────────────────── */}
            {metricList.length > 0 && (
              <section style={{ padding: '24px 20px 8px' }}>
                <ExpandableMetalCard title={`${rankedMetrics.length} 項可量測指標 · METRICS`} serial="RADAR.02">
                  {rankedMetrics.length > 0 ? (
                    <TitaniumRadarChart
                      data={rankedMetrics.map(m => ({
                        subject: zh(m.subject), key: m.subject, value: m.A,
                      }))}
                    />
                  ) : (
                    <div style={{ padding: '26px 16px' }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>
                        這筆紀錄沒有可畫的指標數值
                      </p>
                      <p style={{
                        fontSize: 12.5, fontWeight: 500, color: C.sub,
                        lineHeight: 1.6, margin: '8px 0 0',
                      }}>
                        {hasGateInfo ? '這個角度沒有量到可信的數值。' : '舊紀錄只留了總分，重新分析一次就會有。'}
                      </p>
                    </div>
                  )}

                  <div style={{
                    height: 1, margin: '20px 0 18px',
                    background: `linear-gradient(90deg, transparent, ${C.ti5}66, transparent)`,
                  }} />

                  {/* 指標條 — 依分數排序，弱項在最上；已驗證的加勾 */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {rankedMetrics.map((m, i) => (
                      <BarChartItem key={m.subject}
                        index={i}
                        label={zh(m.subject)}
                        value={m.A}
                        declared={validatedMetricKeys.has(m.subject)}
                        active={activeChartMetric === m.subject}
                        onClick={() => setActiveChartMetric(m.subject)} />
                    ))}
                  </div>

                  {/* 圖例：可量測 vs 可宣告 */}
                  {validatedMetricKeys.size > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginTop: 14, paddingTop: 12,
                      borderTop: `1px solid ${C.ti5}33`,
                      fontSize: 11, fontWeight: 600, color: C.sub, lineHeight: 1.5,
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                        fontSize: 9, fontWeight: 900, color: '#2F8F6B',
                        padding: '2px 5px', borderRadius: 3,
                        background: 'rgba(47,143,107,0.10)', border: '1px solid rgba(47,143,107,0.27)',
                        letterSpacing: '0.1em',
                      }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2F8F6B' }} />
                        可宣告
                      </span>
                      <span>＝這個角度實驗已驗證效度、可直接對外宣告的指標；其餘為可量測但未列入宣告。</span>
                    </div>
                  )}
                </ExpandableMetalCard>
              </section>
            )}

            {/* ══════════════════════════════════════════════════════
                未列入評分的項目 —— 預設收折，展開後以條列說明
                ══════════════════════════════════════════════════════ */}
            {hasGateInfo && occludedMetrics.length > 0 && (
              <section style={{ padding: '24px 20px 8px' }}>
                <div style={{
                  borderRadius: 12, overflow: 'hidden',
                  background: 'rgba(22,20,21,0.03)',
                  border: `1px solid ${C.dialEdge}`,
                }}>
                  <motion.button {...pressProps('row')}
 onClick={() => setShowUncovered(v => !v)}
 style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
 padding: '13px 15px', background: 'none', border: 'none',
 cursor: 'pointer', textAlign: 'left',
 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.ink }}>
                      未列入評分的項目
                    </span>
                    <span style={{
                      fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700, color: C.sub,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{occludedMetrics.length}</span>
                    <span style={{
                      fontSize: 17, color: C.sub, lineHeight: 1,
                      transform: showUncovered ? 'rotate(45deg)' : 'none',
                      transition: 'transform .22s',
                    }}>＋</span>
                  </motion.button>

                  <AnimatePresence initial={false}>
                    {showUncovered && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE_SWISS }}
                        style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '0 15px 15px' }}>
                          <p style={{
                            fontSize: 12.5, fontWeight: 600, color: C.ink,
                            margin: '0 0 10px', lineHeight: 1.5,
                          }}>{occludedMetrics.map(zh).join('、')}</p>
                          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                            {uncoveredReasons(result?.exerciseKey, result?.view || result?.debug?.meta?.view).map((line, i) => (
                              <li key={i} style={{
                                display: 'flex', gap: 8, alignItems: 'baseline',
                                fontSize: 12.5, fontWeight: 500, color: C.sub,
                                lineHeight: 1.6, marginTop: i ? 7 : 0,
                              }}>
                                <span style={{ color: C.pebble, flexShrink: 0 }}>·</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* ── 動作對照軌 — 你 vs 教練 ───────────────────── */}
            {hasChartData && chartMetricKeys.length > 0 && (
              <section style={{ padding: '24px 20px 8px' }}>
                <ExpandableMetalCard
                  title={`動作對照 · ${activeChartMetric ? zh(activeChartMetric) : '逐幀曲線'}`}
                  serial="DEV.03">

                  {/* 極簡說明文字 + Rep 總數徽章 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 16, paddingBottom: 12,
                    borderBottom: `1px solid ${C.ti5}33`,
                  }}>
                    {/* Rep 總數徽章 —— 不論 1 rep 或多 rep 都顯示，讓使用者一眼確認計次 */}
                    {Array.isArray(result.chartsData) && result.chartsData.length > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 99,
                        background: BRUSHED_TI_DARK,
                        border: `1px solid ${C.ti5}66`,
                        fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800,
                        letterSpacing: '0.08em', color: C.ti1,
                        flexShrink: 0, marginLeft: 8,
                      }}>
                        <span style={{ color: C.orange }}>●</span>
                        {result.chartsData.length}&nbsp;REPS
                      </span>
                    )}
                  </div>

                  {/* 指標選擇 rail — 最弱項加橘色標記 */}
                  <div className="ms-no-scrollbar" style={{
                    display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14,
                  }}>
                    {chartMetricKeys.map(k => {
                      const active = activeChartMetric === k;
                      const isWeakest = k === weakestChartMetric;
                      return (
                        <motion.button key={k}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setActiveChartMetric(k)}
                          style={{
                            flexShrink: 0, padding: '6px 11px', borderRadius: 99,
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            border: `1px solid ${active ? C.ink : isWeakest ? C.orange : C.ti5 + '55'}`,
                            background: active ? BRUSHED_TI_DARK : 'transparent',
                            color: active ? C.ti1 : isWeakest ? C.ember : C.steel,
                            letterSpacing: '0.01em',
                            transition: 'all 0.2s ease',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}>
                          <span>{zh(k)}</span>
                          {validatedMetricKeys.has(k) && (
                            <span title="這個角度實驗已驗證效度，可直接對外宣告" style={{
                              padding: '1.5px 5px', borderRadius: 99,
                              background: active ? 'rgba(255,255,255,0.22)' : 'rgba(47,143,107,0.14)',
                              color: active ? '#fff' : '#2F8F6B',
                              fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                            }}>可宣告</span>
                          )}
                          {isWeakest && (
                            <span style={{
                              padding: '1.5px 5px', borderRadius: 99,
                              background: C.orange, color: '#fff',
                              fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                            }}>
                              弱項
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Rep 選擇器 — 最佳表現自動置前並標記 */}
                  {result.chartsData?.length > 1 && (
                    <>
                      {/* 最佳表現提示列 */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%', background: C.orange,
                        }} />
                        <span style={{
                          fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.08em', color: C.steel,
                        }}>
                          最佳表現&nbsp;·&nbsp;第 {bestRepIndex + 1} 次
                          {bestRepScore != null ? ` — ${bestRepScore} 分` : ''}（已優先顯示）
                        </span>
                      </div>

                      <div className="ms-no-scrollbar" style={{
                        display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12,
                      }}>
                        {/* 收合時只顯示當前那一次；展開時顯示全部 */}
                        {(repsExpanded
                          ? result.chartsData.map((_, i) => i)
                          : [activeRepIndex]
                        ).map(idx => {
                          const active = activeRepIndex === idx;
                          const isBest = idx === bestRepIndex;
                          return (
                            <motion.button key={idx}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setActiveRepIndex(idx)}
                              style={{
                                flexShrink: 0, padding: '5px 10px', borderRadius: 99,
                                fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                                cursor: 'pointer', textTransform: 'uppercase',
                                fontFamily: MONO_STACK,
                                border: `1px solid ${active ? C.orange : isBest ? C.ink : C.ti5 + '66'}`,
                                background: active ? C.orange : isBest ? BRUSHED_TI_DARK : 'transparent',
                                color: active ? '#fff' : isBest ? C.ti1 : C.steel,
                                display: 'flex', alignItems: 'center', gap: 5,
                              }}>
                              <span>REP&nbsp;{String(idx + 1).padStart(2, '0')}</span>
                              {isBest && (
                                <span style={{
                                  padding: '1.5px 5px', borderRadius: 99,
                                  background: active ? 'rgba(255,255,255,0.24)' : C.orange,
                                  color: '#fff', fontSize: 11, fontWeight: 800,
                                  letterSpacing: '0.04em',
                                }}>
                                  最佳
                                </span>
                              )}
                            </motion.button>
                          );
                        })}

                        {/* 展開 / 收合 切換鈕 */}
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setRepsExpanded(v => !v)}
                          style={{
                            flexShrink: 0, padding: '5px 11px', borderRadius: 99,
                            fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                            cursor: 'pointer', fontFamily: MONO_STACK,
                            border: `1px dashed ${C.ti4}`,
                            background: 'transparent', color: C.steel,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          {repsExpanded ? (
                            <><Minus size={11} />收合</>
                          ) : (
                            <><Plus size={11} />展開 {result.chartsData.length - 1}</>
                          )}
                        </motion.button>
                      </div>
                    </>
                  )}

                  {/* 漸層折線圖 */}
                  <div style={{ height: 200, position: 'relative' }}>
                    {/* 縱軸方向提示：讓 1 / 0 / -1 讀成「高/低」而不是死數字 */}
                    <span style={{ position: 'absolute', top: 2, left: 44, zIndex: 2, pointerEvents: 'none',
                      fontFamily: MONO_STACK, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: C.steel }}>高 ▲</span>
                    <span style={{ position: 'absolute', bottom: 20, left: 44, zIndex: 2, pointerEvents: 'none',
                      fontFamily: MONO_STACK, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: C.steel }}>低 ▼</span>
                    {analysisChartData.length > 0 ? (
                      <>
                        <GradientLineChart
                          key={`${activeChartMetric}-${activeRepIndex}`}
                          data={analysisChartData}
                          highlight={chartHighlight}
                          xKey="frame"
                          series={[
                            { key: 'expert', label: '教練標準', color: C.steel, dashed: true },
                            { key: 'user', label: '你的動作', color: C.orange, fill: true },
                          ]}
                        />
                        {/* 遮蔽警告 Badge */}
                        {analysisChartData.filter(d => d.user == null || Number.isNaN(d.user)).length / analysisChartData.length > 0.85 && (
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            background: 'rgba(22, 20, 21, 0.85)',
                            border: `1px solid ${C.pebble}33`,
                            backdropFilter: 'blur(8px)',
                            padding: '6px 14px', borderRadius: 18,
                            display: 'flex', alignItems: 'center', gap: 6,
                            pointerEvents: 'none',
                          }}>
                            <AlertCircle size={14} color={C.orange} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.paper, letterSpacing: '0.04em' }}>
                              ⚠️ 視角嚴重遮蔽
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <EmptyMini text="此項目尚無逐幀資料" />
                    )}
                  </div>

                  {/* 圖例 */}
                  <div style={{
                    display: 'flex', justifyContent: 'center', gap: 28, marginTop: 14,
                  }}>
                    <Legend color={C.orange} label="你的動作" />
                    <Legend color={C.steel} label="教練標準" dashed />
                  </div>

                  {/* 怎麼看這張圖 — 縱軸是相對數值(非單位)，重點是兩條貼不貼 */}
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(22,20,21,0.03)', border: `1px solid ${C.ti5}33`,
                    fontSize: 11, fontWeight: 500, color: C.sub, lineHeight: 1.6,
                  }}>
                    <span style={{ fontWeight: 800, color: C.ink }}>怎麼看：</span>
                    橫軸＝一次動作（開始→最低→回到起點）；縱軸＝這個指標的實際量測值（度或百分比，見下方說明），
                    <span style={{ fontWeight: 700, color: C.ink }}>你的橘線越貼近教練灰虛線就越標準</span>，
                    紅框就是你偏離教練最多的那一段。
                  </div>

                  {/* ── 這一項的個別回饋 ──────────────────────────
                      使用者點哪個指標，就講那一項怎麼加強。
                      ≥85 分只用一行帶過 —— 那是教練自身的重複性範圍，
                      硬要講會變成雜訊，反而蓋掉真正該修的那一項。 */}
                  {(() => {
                    const mv = metricList.find(m => m.subject === activeChartMetric);
                    const adv = mv ? metricAdvice(activeChartMetric, mv.A) : null;
                    if (!adv) return null;
                    const tone = adv.level === 'fix' ? C.orange
                      : adv.level === 'watch' ? '#B07B39' : '#5A7A3A';
                    const coach = METRIC_COACH[activeChartMetric];
                    return (
                      <div style={{
                        marginTop: 18, paddingTop: 16,
                        borderTop: `1px solid ${C.dialEdge}`,
                      }}>
                        {/* 這張圖在看什麼 —— 沒有這段，曲線只是兩條線 */}
                        {coach && (
                          <div style={{
                            padding: '11px 13px', borderRadius: 10, marginBottom: 14,
                            background: 'rgba(22,20,21,0.035)',
                          }}>
                            <div style={{
                              fontSize: 12, fontWeight: 800, letterSpacing: '0.18em',
                              color: C.sub, textTransform: 'uppercase',
                            }}>怎麼看</div>
                            <div style={{ marginTop: 7, fontSize: 12.5, lineHeight: 1.6, color: C.sub }}>
                              <b style={{ color: C.ink, fontWeight: 700 }}>縱軸</b>　{coach.axis}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.6, color: C.sub }}>
                              <b style={{ color: C.ink, fontWeight: 700 }}>正常長相</b>　{coach.shape}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 800, color: tone, letterSpacing: '-0.005em',
                          }}>{adv.head}</span>
                          <span style={{
                            marginLeft: 'auto', fontFamily: MONO_STACK, fontSize: 11,
                            fontWeight: 700, color: C.sub, fontVariantNumeric: 'tabular-nums',
                          }}>{Math.round(mv.A)} 分</span>
                        </div>
                        {adv.level !== 'fine' && (
                          <p style={{
                            fontSize: 12.5, fontWeight: 500, lineHeight: 1.65,
                            color: C.sub, margin: '7px 0 0',
                          }}>{adv.body}</p>
                        )}
                      </div>
                    );
                  })()}
                </ExpandableMetalCard>
              </section>
            )}

            {/* 姿勢分析還在收集回饋：這次準不準（同一次分析只問一次；看歷史紀錄時不問） */}
            {!viewHistoryMode && (
              <PoseFeedbackCard
                sessionKey={result?.session_id || result?.sessionId || result?.debug?.meta?.session_id || result?.created_at || result?.timestamp}
                exerciseKey={result?.exerciseKey || null}
              />
            )}

          </motion.div>
        ) : (
          /* ════════════════════════════════════════════════
             HISTORY TAB — 進步看得到
             ════════════════════════════════════════════════ */
          <motion.div key="history"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}>

            <section style={{ padding: '32px 20px 8px' }}>
              <SectionHead index="01" title="七項指標趨勢" note={`${historyData.length} 筆紀錄`} />

              {/* 指標選擇 rail — 鈦金屬膠囊 */}
              <div className="ms-no-scrollbar" style={{
                display: 'flex', gap: 6, overflowX: 'auto', margin: '16px 0 4px',
              }}>
                {['__overall__', ...historyMetricKeys].map(m => {
                  const active = activeHistoryMetric === m;
                  return (
                    <motion.button key={m}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setActiveHistoryMetric(m)}
                      style={{
                        flexShrink: 0, padding: '7px 14px', borderRadius: 99,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${active ? C.ink : C.ti5}55`,
                        background: active ? BRUSHED_TI_DARK : 'transparent',
                        color: active ? C.ti1 : C.steel,
                        transition: 'all 0.2s ease',
                      }}>
                      {m === '__overall__' ? '綜合分數' : zh(m)}
                    </motion.button>
                  );
                })}
              </div>

              {/* 鈦金屬卡片包住的漸層折線圖 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_SWISS }}
                style={{
                  marginTop: 14, padding: 18, borderRadius: 18,
                  background: BRUSHED_TI,
                  border: `1px solid ${C.ti4}`,
                  boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 24px rgba(140,135,128,0.18)',
                }}>
                {/* 圖頂部統計列 */}
                {historyData.length > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', marginBottom: 14,
                    paddingBottom: 12, borderBottom: `1px solid ${C.ti5}33`,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
                        color: C.steel, letterSpacing: '0.18em',
                      }}>
                        LATEST
                      </div>
                      <div style={{
                        fontFamily: FONT_STACK, fontSize: 26, fontWeight: 200,
                        color: C.ink, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 4,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {(() => {
                          const raw = activeHistoryMetric === '__overall__'
                            ? historyData[historyData.length - 1]?.overall_score
                            : historyData[historyData.length - 1]?.[activeHistoryMetric];
                          const v = Number(raw);
                          // 這次量不到 / 作廢（null）→ 顯示「—」，不顯示 0（Number(null) 會是 0）
                          return raw != null && raw !== '' && Number.isFinite(v) ? Math.round(v) : '—';
                        })()}
                      </div>
                    </div>
                    <HistoryDeltaBadge data={historyData} metric={activeHistoryMetric} />
                  </div>
                )}
                <div style={{ height: 220 }}>
                  {historyData.length > 0 ? (
                    <GradientLineChart
                      key={activeHistoryMetric}
                      data={historyData}
                      xKey="date"
                      yMax={100}
                      connectNulls={true}
                      series={[{
                        key: activeHistoryMetric === '__overall__' ? 'overall_score' : activeHistoryMetric,
                        label: '趨勢', color: C.orange, fill: true, dots: true,
                      }]}
                    />
                  ) : (
                    <EmptyMini text="尚無歷史紀錄" />
                  )}
                </div>
              </motion.div>
            </section>

            {/* 改善洞察 — 拉絲鈦金屬卡 */}
            {historyData.length > 1 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease: EASE_SWISS }}
                style={{ padding: '18px 20px 0' }}>
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  borderRadius: 18, padding: 20,
                  background: BRUSHED_TI_DARK,
                  border: `1px solid ${C.ti5}`,
                  boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 6px 20px rgba(0,0,0,0.2)',
                }}>
                  {/* 橘色光斑 — 右下角的光線反射 */}
                  <div style={{
                    position: 'absolute', right: -40, bottom: -40,
                    width: 120, height: 120, borderRadius: '50%',
                    background: `radial-gradient(circle, ${C.orange}44, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: `linear-gradient(135deg, ${C.orange}, ${C.ember})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <TrendingUp size={12} color="#fff" strokeWidth={2.5} />
                      </div>
                      <span style={{
                        fontFamily: MONO_STACK, fontSize: 12, fontWeight: 700,
                        color: C.ti3, letterSpacing: '0.22em', textTransform: 'uppercase',
                      }}>
                        改善洞察&nbsp;·&nbsp;INSIGHT
                      </span>
                    </div>
                    {(() => {
                      const insight = buildTrendInsight(historyData, activeHistoryMetric);
                      const metricName = activeHistoryMetric === '__overall__'
                        ? '綜合動作評分' : zh(activeHistoryMetric);
                      return (
                        <p style={{
                          fontSize: 13.5, lineHeight: 1.65, color: C.ti1,
                          fontWeight: 500, margin: 0, letterSpacing: '0.005em',
                        }}>
                          近 <span style={{
                            fontFamily: MONO_STACK, color: C.orange, fontWeight: 800,
                          }}>{historyData.length}</span> 次分析中，你的
                          <strong style={{ color: '#fff', fontWeight: 800 }}>
                            「{metricName}」
                          </strong>
                          {insight.summary}
                          {insight.advice && (
                            <span style={{ color: C.ti2 }}>{insight.advice}</span>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </motion.section>
            )}

            {/* 紀錄列表 */}
            <section style={{ padding: '24px 20px 8px' }}>
              <SectionHead index="02" title="歷次紀錄" note={`${historyData.length} 筆`} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                {historyData.length > 0 ? historyData.map((session, idx) => {
                  /* 作廢的分數（null）不能顯示成 0 分 —— 那等於替使用者編一個分數 */
                  const sVoid = session.overall_score == null || !Number.isFinite(Number(session.overall_score));
                  const sScore = sVoid ? null : Math.round(Number(session.overall_score));
                  const sg = sVoid ? { key: 'void' } : gradeOf(sScore);
                  return (
                    <div key={idx}
                      onClick={() => {
                        let parsed = [];
                        let raw = session.metrics;
                        try {
                          if (typeof raw === 'string') {
                            try { raw = JSON.parse(raw); } catch { /* noop */ }
                          }
                          if (Array.isArray(raw)) {
                            parsed = raw.map(m => ({
                              subject: m.subject || m.name || '—',
                              A: m.A !== undefined ? m.A : (m.value || 0), fullMark: 100,
                            }));
                          } else if (raw && typeof raw === 'object') {
                            parsed = Object.keys(raw).map(k => ({
                              subject: k, A: raw[k], fullMark: 100,
                            }));
                          }
                        } catch (e) { console.error(e); }
                        navigate('/result-mobile', {
                          state: {
                            result: {
                              ...session,
                              overallScore: sVoid ? null : Number(session.overall_score),
                              metrics: parsed,
                              chartsData: session.chartsData || [],
                              feedback: session.feedback || [],
                              arVideoUrl: session.arVideoUrl || null,
                              repSegments: session.repSegments || [],
                            },
                            viewHistory: false,
                          },
                        });
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 14px', cursor: 'pointer',
                        borderRadius: 12,
                        background: BRUSHED_TI,
                        border: `1px solid ${C.ti4}88`,
                        boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset',
                      }}>
                      {/* 分數方塊 — 鈦金屬凹槽 */}
                      <div style={{
                        width: 50, height: 50, borderRadius: 12,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        background: sg.key === 'weak'
                          ? `linear-gradient(135deg, ${C.orange}, ${C.ember})`
                          : BRUSHED_TI_DARK,
                        border: `1px solid ${sg.key === 'weak' ? C.ember : C.ti5}`,
                        boxShadow: sg.key === 'weak'
                          ? `0 4px 12px rgba(255,90,31,0.25)`
                          : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                      }}>
                        <span style={{
                          fontFamily: FONT_STACK, fontSize: 18, fontWeight: 700, lineHeight: 1,
                          color: '#fff', fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.02em',
                        }}>
                          {sVoid ? '—' : sScore}
                        </span>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: C.ink,
                          letterSpacing: '-0.005em',
                        }}>
                          {new Date(session.timestamp || session.date).toLocaleDateString()}
                        </div>
                        <div style={{
                          fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
                          color: C.steel, letterSpacing: '0.16em', marginTop: 3,
                          textTransform: 'uppercase',
                        }}>
                          {(session.reps_count || 0)} REPS ·{' '}
                          {(session.duration_seconds ? Math.round(session.duration_seconds / 60) : 0)} MIN
                        </div>
                      </div>

                      <motion.button {...pressProps('row')} onClick={(e) => handleDeleteSession(e, session.session_id)}
 style={{
 width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
 background: 'rgba(255,255,255,0.4)',
 border: `1px solid ${C.ti5}55`,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}>
                        <Trash2 size={13} color={C.steel} strokeWidth={1.8} />
                      </motion.button>
                      <ChevronRight size={16} color={C.steel} strokeWidth={2} />
                    </div>
                  );
                }) : (
                  <div className="ms-card" style={{ padding: 32, textAlign: 'center' }}>
                    <Activity size={28} color="var(--ms-ink-3)" style={{ margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ms-ink-2)', margin: 0 }}>
                      完成第一次分析後，這裡會顯示你的進步軌跡
                    </p>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════ FOOTER ACTION ════════════════ */}
      <div style={{ padding: '28px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/mobile-home')}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: 'transparent',
            border: `1.5px solid ${C.ink}`,
            cursor: 'pointer', fontSize: 12, fontWeight: 800,
            letterSpacing: '0.18em', color: C.ink, textTransform: 'uppercase',
            fontFamily: MONO_STACK,
          }}>
          ← 返回主畫面
        </motion.button>

        {/* 詳情頁刪除：只有在檢視「已儲存的歷史紀錄」時才出現 */}
        {(result?.session_id || result?.id) && (
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => handleDeleteSessionDetail(result.session_id || result.id)}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              background: 'transparent',
              border: `1.5px solid ${C.ember}`,
              cursor: 'pointer', fontSize: 9, fontWeight: 800,
              letterSpacing: '0.16em', color: C.ember, textTransform: 'uppercase',
              fontFamily: MONO_STACK,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            <Trash2 size={13} color={C.ember} strokeWidth={2} />
            刪除這筆紀錄
          </motion.button>
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   WatchDialScore — 圖三風格刻度盤
   深色啞光底盤 + 高對比白/橘鈦金屬刻度 + 數字 count-up
   ════════════════════════════════════════════════════════════ */
function WatchDialScore({ score = 87 }) {
  const totalTicks = 60;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-30px' });
  const [displayScore, setDisplayScore] = useState(0);
  const [activeTickCount, setActiveTickCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, score, {
      duration: 1.9,
      ease: EASE_SWISS,
      onUpdate: (v) => {
        setDisplayScore(v);
        setActiveTickCount(Math.round((v / 100) * totalTicks));
      },
    });
    return () => controls.stop();
  }, [inView, score]);

  return (
    <div ref={ref} style={{
      width: 240, height: 240,
      margin: '0 auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {/* 啞光黑底盤 — 圖三風格，純粹深色、無金屬反光 */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={inView ? { scale: 1, opacity: 1 } : {}}
        transition={{ duration: 0.9, ease: EASE_SWISS }}
        style={{
          position: 'absolute', inset: 8,
          borderRadius: '50%',
          background: MATTE_BLACK,
          border: `1px solid ${C.dialEdge}`,
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.05),
            inset 0 -1px 0 rgba(0,0,0,0.3),
            0 18px 38px -10px rgba(32,32,32,0.45),
            0 6px 14px -4px rgba(32,32,32,0.18)
          `,
        }} />

      {/* 內圈微亮環 — 啞光不反光，僅微差 */}
      <div style={{
        position: 'absolute', inset: 28, borderRadius: '50%',
        border: `0.5px solid rgba(255,255,255,0.05)`,
        pointerEvents: 'none',
      }} />

      {/* 60 刻度 — 圖三那種厚實短粗刻度 */}
      <svg width="240" height="240" viewBox="0 0 100 100" style={{ position: 'absolute', zIndex: 2 }}>
        <defs>
          {/* 鈦金屬白刻度漸層 — 模擬刻度本身的鈦金屬反光 */}
          <linearGradient id="tickTi" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#E8ECF0" />
            <stop offset="100%" stopColor="#B9C8D7" />
          </linearGradient>
          {/* 橘色強調刻度漸層 */}
          <linearGradient id="tickOrange" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#FF7A60" />
            <stop offset="50%" stopColor="#F95C4B" />
            <stop offset="100%" stopColor="#D8331C" />
          </linearGradient>
          {/* 未達標刻度 — 微透鈦灰 */}
          <linearGradient id="tickDim" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="rgba(185,200,215,0.18)" />
            <stop offset="100%" stopColor="rgba(143,161,179,0.08)" />
          </linearGradient>
          <filter id="tickGlowOrange" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
        </defs>

        {Array.from({ length: totalTicks }).map((_, i) => {
          const isActive = i < activeTickCount;
          const isMajor = i % 5 === 0;
          const isQuad = i % 15 === 0;
          const angle = i * (360 / totalTicks);

          // 圖三的厚實刻度感：用矩形而非細線
          // 達標前 80% 用鈦白、最後 20% 用橘色（高達標的視覺爆發）
          const isOrange = isActive && i >= Math.round(totalTicks * 0.8);
          const fillUrl = !isActive
            ? 'url(#tickDim)'
            : isOrange
              ? 'url(#tickOrange)'
              : 'url(#tickTi)';

          // 刻度寬度與長度（圖三：四分點最粗、主刻度次之、副刻度最細）
          const w = isQuad ? 1.6 : isMajor ? 1.2 : 0.85;
          const len = isQuad ? 7.5 : isMajor ? 6.5 : 5.2;
          const y1 = 5;
          const y2 = y1 + len;

          return (
            <g key={i} transform={`rotate(${angle} 50 50)`}>
              <rect
                x={50 - w / 2} y={y1}
                width={w} height={len}
                rx={0.2}
                fill={fillUrl}
                filter={isOrange && isQuad ? 'url(#tickGlowOrange)' : undefined}
              />
              {/* 主刻度的鈦金屬反光（一條微亮的左邊高光） */}
              {isActive && isMajor && (
                <rect
                  x={50 - w / 2} y={y1}
                  width={0.35} height={len}
                  fill="rgba(255,255,255,0.8)"
                  opacity={0.7}
                />
              )}
            </g>
          );
        })}

        {/* 12/3/6/9 點位的微點 */}
        {[0, 90, 180, 270].map(angle => (
          <circle key={angle}
            cx="50" cy="50" r="0.5"
            transform={`rotate(${angle} 50 50) translate(0 -16)`}
            fill="rgba(185,200,215,0.4)"
          />
        ))}
      </svg>

      {/* 中央排版 — 啞光黑底 + 白色 / 橘色文字 */}
      <div style={{
        position: 'relative', zIndex: 3, textAlign: 'center',
        fontFamily: FONT_STACK,
      }}>
        <div style={{
          fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.32em',
          color: C.silver, textTransform: 'uppercase',
          marginBottom: 6, opacity: 0.7,
        }}>
          DRVN&nbsp;·&nbsp;FORM
        </div>
        <div style={{
          fontSize: 64, fontWeight: 200,
          letterSpacing: '-0.055em', color: '#F6F4F1', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 1px 0 rgba(0,0,0,0.4)',
        }}>
          {Math.round(displayScore)}
        </div>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.34em',
          color: C.silver, textTransform: 'uppercase', marginTop: 6,
          fontFamily: MONO_STACK, opacity: 0.55,
        }}>
          POINTS
        </div>
        {/* 橘色細線分隔 */}
        <div style={{
          width: 26, height: 1.2, margin: '8px auto 0',
          background: C.orange,
          boxShadow: `0 0 4px ${C.orange}`,
        }} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TitaniumIconButton — 啞光紙質迷你按鈕（精緻細邊）
   ════════════════════════════════════════════════════════════ */
function TitaniumIconButton({ children, onClick }) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      style={{
        width: 42, height: 42, borderRadius: 12, cursor: 'pointer',
        background: C.paper,
        border: `1px solid ${C.hairlineStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 4px rgba(32,32,32,0.05)',
      }}>
      {children}
    </motion.button>
  );
}

/* ════════════════════════════════════════════════════════════
   TitaniumRadarChart — 自繪 SVG 雷達圖（瑞士質感 · 七邊形）
   ════════════════════════════════════════════════════════════ */
function TitaniumRadarChart({ data = [] }) {
  const n = data.length;
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const R = 92; // 最大半徑
  const ringCount = 4;

  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-30px' });

  // hooks 之後才提早 return（修正 rules-of-hooks）
  if (n === 0) return null;

  // 每個指標的角度（12 點鐘方向開始，順時針）
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;

  // 計算多邊形頂點
  const polygonPoints = (radius) =>
    Array.from({ length: n }).map((_, i) => {
      const a = angle(i);
      return `${cx + Math.cos(a) * radius},${cy + Math.sin(a) * radius}`;
    }).join(' ');

  // 數據多邊形
  const dataPoints = data.map((d, i) => {
    const a = angle(i);
    const r = (d.value / 100) * R;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, ...d };
  });
  const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div ref={ref} style={{
      position: 'relative', width: '100%', maxWidth: size,
      margin: '8px auto 4px', aspectRatio: '1 / 1',
    }}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="48%" r="58%">
            <stop offset="0%" stopColor={C.ti1} stopOpacity="0.8" />
            <stop offset="100%" stopColor={C.ti3} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="radarFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.orange} stopOpacity="0.42" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* 背景圓暈 */}
        <circle cx={cx} cy={cy} r={R + 2} fill="url(#radarBg)" />

        {/* 同心七邊形 */}
        {Array.from({ length: ringCount }).map((_, i) => (
          <polygon key={i}
            points={polygonPoints(R * ((i + 1) / ringCount))}
            fill="none"
            stroke={C.ti5}
            strokeOpacity={0.22 + (i === ringCount - 1 ? 0.18 : 0)}
            strokeWidth={i === ringCount - 1 ? 1 : 0.7}
            strokeDasharray={i === ringCount - 1 ? 'none' : '2 3'}
          />
        ))}

        {/* 軸線 */}
        {Array.from({ length: n }).map((_, i) => {
          const a = angle(i);
          return (
            <line key={i}
              x1={cx} y1={cy}
              x2={cx + Math.cos(a) * R}
              y2={cy + Math.sin(a) * R}
              stroke={C.ti5}
              strokeOpacity={0.18}
              strokeWidth={0.7}
            />
          );
        })}

        {/* 數據多邊形 — 動畫 draw */}
        <motion.polygon
          points={dataPath}
          fill="url(#radarFill)"
          stroke={C.orange}
          strokeWidth={1.6}
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.9, delay: 0.2, ease: EASE_SWISS }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* 數據點 */}
        {dataPoints.map((p, i) => (
          <motion.g key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.04, ease: EASE_SPRING }}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="#fff" />
            <circle cx={p.x} cy={p.y} r={2.4} fill={C.orange} />
          </motion.g>
        ))}

        {/* 中心點 */}
        <circle cx={cx} cy={cy} r={1.8} fill={C.ti5} />
      </svg>

      {/* 標籤 — 絕對定位在多邊形外 */}
      {data.map((d, i) => {
        const a = angle(i);
        const lx = cx + Math.cos(a) * (R + 18);
        const ly = cy + Math.sin(a) * (R + 18);
        return (
          <motion.div key={i}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.4, delay: 0.5 + i * 0.04 }}
            style={{
              position: 'absolute',
              left: `${(lx / size) * 100}%`,
              top: `${(ly / size) * 100}%`,
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              minWidth: 48,
            }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: C.steel,
              letterSpacing: '0.04em', lineHeight: 1.1, whiteSpace: 'nowrap',
            }}>
              {d.subject}
            </div>
            <div style={{
              fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700,
              color: d.value < 60 ? C.orange : C.ink,
              fontVariantNumeric: 'tabular-nums', marginTop: 1,
            }}>
              {Math.round(d.value)}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   GradientLineChart — 漸層折線圖（recharts AreaChart 包裝）
   ════════════════════════════════════════════════════════════ */
function GradientLineChart({ data, xKey, series = [], yMax, connectNulls = false, highlight = null }) {
  const ref = useRef(null);
  const gradId = useMemo(() => `glc-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${gradId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.42} />
                <stop offset="55%" stopColor={s.color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {/* 【v9.3】偏離最大的區段 —— 只在分數低於門檻時才畫，
              不然滿分的圖上還標紅色反而誤導 */}
          {highlight && (
            <ReferenceArea x1={highlight.x1} x2={highlight.x2}
              fill={C.orange} fillOpacity={0.14} stroke={C.orange}
              strokeOpacity={0.35} strokeDasharray="3 3" />
          )}
          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={`${C.ti5}33`} />
          <XAxis dataKey={xKey} tickLine={false}
            axisLine={{ stroke: `${C.ti5}55` }}
            tick={{ fontSize: 11, fill: C.steel, fontFamily: MONO_STACK }} />
          <YAxis
            domain={yMax ? [0, yMax] : ['auto', 'auto']}
            tickLine={false}
            axisLine={{ stroke: `${C.ti5}55` }}
            tick={{ fontSize: 11, fill: C.ink, fontFamily: MONO_STACK }}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: `${C.orange}88`, strokeWidth: 1, strokeDasharray: '3 3' }}
            contentStyle={{
              background: BRUSHED_TI_DARK, borderRadius: 12, border: `1px solid ${C.ti5}`,
              fontSize: 11, padding: '6px 10px', color: C.ti1,
              boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            }}
            labelStyle={{ color: C.ti3, fontFamily: MONO_STACK, fontSize: 11 }}
            itemStyle={{ color: C.ti1 }}
          />
          {series.map((s, i) => (
            <Area key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.dashed ? 1.8 : 2.4}
              strokeDasharray={s.dashed ? '4 4' : '0'}
              fill={s.fill ? `url(#${gradId}-${i})` : 'transparent'}
              dot={s.dots ? { r: 3, fill: s.color, stroke: '#fff', strokeWidth: 1.5 } : false}
              activeDot={{ r: 5, fill: '#fff', stroke: s.color, strokeWidth: 2 }}
              isAnimationActive={true}
              animationDuration={1100}
              animationEasing="ease-out"
              connectNulls={connectNulls}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   HistoryDeltaBadge — 進步幅度徽章
   ════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   buildTrendInsight — 依實際數據產生「改善洞察」文字
   不再寫死「呈現上升趨勢」；而是根據整體趨勢 + 最近一次變化
   分別給出「穩定進步 / 持平 / 略有回落」等貼近真實的描述。
   ════════════════════════════════════════════════════════════ */
function buildTrendInsight(data, metric) {
  const k = metric === '__overall__' ? 'overall_score' : metric;
  const series = (data || [])
    .map(d => d?.[k])
    .filter(v => typeof v === 'number' && !Number.isNaN(v));

  if (series.length < 2) {
    return { summary: '紀錄還不夠多，再多做幾次分析就能看出趨勢。', advice: '' };
  }

  const first = series[0];
  const last = series[series.length - 1];
  const best = Math.max(...series);
  const avg = series.reduce((s, v) => s + v, 0) / series.length;
  const overallDelta = last - first;          // 整體變化（第一次 → 最近一次）
  const recentDelta = last - series[series.length - 2]; // 最近一次相較前一次

  const fmt = (n) => (Math.round(n * 10) / 10);

  // 以「整體變化」為主軸判斷趨勢，閾值 ±2 分內視為持平
  if (overallDelta >= 2) {
    return {
      summary: `整體上升了約 ${fmt(overallDelta)} 分，動作品質穩定進步中。`,
      advice: recentDelta < 0
        ? `最近一次略低於上一次，屬正常波動，維持穩定節奏即可。`
        : `保持目前的訓練節奏，並持續對照教練示範曲線。`,
    };
  }

  if (overallDelta <= -2) {
    return {
      summary: `整體下降了約 ${fmt(Math.abs(overallDelta))} 分，最近的動作品質略有回落。`,
      advice: `建議放慢速度、把每一次動作做確實，重新對齊教練示範曲線。`,
    };
  }

  // 持平：再看最近一次的短期變化補充說明
  if (recentDelta >= 2) {
    return {
      summary: `整體維持穩定，且最近一次回升了約 ${fmt(recentDelta)} 分，狀態正在回穩。`,
      advice: `延續這次的手感，把好的動作模式固定下來。`,
    };
  }
  if (recentDelta <= -2) {
    return {
      summary: `整體維持穩定，最近一次略微下滑了約 ${fmt(Math.abs(recentDelta))} 分。`,
      advice: `留意是否因疲勞影響，下一次回到專注的節奏即可。`,
    };
  }

  return {
    summary: `表現相當穩定，平均維持在 ${fmt(avg)} 分（最佳 ${fmt(best)} 分）。`,
    advice: `想再突破的話，可嘗試提高負荷或加強較弱的指標。`,
  };
}

function HistoryDeltaBadge({ data, metric }) {
  if (!data || data.length < 2) return null;
  const k = metric === '__overall__' ? 'overall_score' : metric;
  const latest = data[data.length - 1]?.[k];
  const prev = data[data.length - 2]?.[k];
  if (latest == null || prev == null) return null;
  const delta = latest - prev;
  const pos = delta >= 0;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: 99,
      background: pos
        ? `linear-gradient(135deg, ${C.orange}, ${C.ember})`
        : `linear-gradient(135deg, ${C.steel}, #3D4046)`,
      boxShadow: pos ? '0 3px 10px rgba(255,90,31,0.22)' : 'none',
    }}>
      <TrendingUp size={11} color="#fff" strokeWidth={2.5}
        style={{ transform: pos ? 'none' : 'scaleY(-1)' }} />
      <span style={{
        fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800, color: '#fff',
        letterSpacing: '0.04em',
      }}>
        {pos ? '+' : ''}{delta.toFixed(1)}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ExpandableMetalCard — 啞光紙質卡（瑞士雜誌標頭 + Framer 展開）
   ════════════════════════════════════════════════════════════ */
function ExpandableMetalCard({ title, serial = 'SYS.01', style = {}, children }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, ease: EASE_SWISS }}
      style={{
        background: C.paper,
        border: `1px solid ${C.hairline}`,
        boxShadow: `
          0 1px 0 rgba(255,255,255,0.9) inset,
          0 6px 18px rgba(32,32,32,0.05),
          0 1px 3px rgba(32,32,32,0.04)
        `,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 18,
        position: 'relative',
        ...style,
      }}>
      {/* ── 面板頭部 ── */}
      <motion.button {...pressProps('row')}
 onClick={() => setIsExpanded(!isExpanded)}
 style={{
 width: '100%', padding: '18px 20px', background: 'transparent', border: 'none',
 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 cursor: 'pointer', textAlign: 'left', position: 'relative', zIndex: 1,
 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 序號 — 雜誌式 mono（橘色點綴） */}
          <span style={{
            fontFamily: MONO_STACK,
            fontSize: 11, color: C.orange, fontWeight: 800,
            letterSpacing: '0.06em',
            padding: '3px 7px', borderRadius: 4,
            background: C.orangeWash,
            border: `1px solid ${C.orange}33`,
          }}>
            [{serial}]
          </span>
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
            color: C.ink, textTransform: 'uppercase',
          }}>
            {title}
          </span>
        </div>

        {/* 切換鈕 — 啞光迷你方塊 */}
        <motion.div
          animate={{ rotate: isExpanded ? 0 : 180 }}
          transition={{ duration: 0.3, ease: EASE_SWISS }}
          style={{
            width: 24, height: 24, borderRadius: 7,
            background: C.paperDeep,
            border: `1px solid ${C.hairline}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {isExpanded
            ? <Minus size={13} strokeWidth={2.4} color={C.ink} />
            : <Plus size={13} strokeWidth={2.4} color={C.ink} />}
        </motion.div>
      </motion.button>

      {/* ── 內容區 ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE_SWISS }}
            style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              padding: '0 20px 20px',
              borderTop: `1px solid ${C.hairline}`,
            }}>
              <div style={{ marginTop: 18 }}>
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════
   BarChartItem — 鈦金屬凹槽 + 漸層橘色填充 + 排名標號
   ════════════════════════════════════════════════════════════ */
function BarChartItem({ index = 0, label, value, max = 100, active = true, onClick, declared = false }) {
  const formattedValue = typeof value === 'number' ? value.toFixed(1) : '0.0';
  const pct = Math.min((value / max) * 100, 100);
  const isWeak = value < 60;
  const isStrong = value >= 85;
  const DECL = '#2F8F6B';   // 可宣告 = 此角度實驗已驗證的效度指標（沉穩綠）

  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });

  return (
    <motion.div ref={ref}
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5, delay: Math.min(index, 6) * 0.06, ease: EASE_SWISS }}
      whileHover={onClick ? { x: 1 } : {}}
      style={{
        marginBottom: 18, fontFamily: FONT_STACK,
        cursor: onClick ? 'pointer' : 'default',
        opacity: active ? 1 : 0.5,
        position: 'relative',
      }}>
      {/* ── 標籤列 ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 7,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700,
            color: C.steel, letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 800, color: C.ink,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {label}
          </span>
          {declared && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 900, color: DECL,
              padding: '2px 5px', borderRadius: 3,
              background: `${DECL}1A`, letterSpacing: '0.1em',
              border: `1px solid ${DECL}44`,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: DECL }} />
              可宣告
            </span>
          )}
          {isWeak && (
            <span style={{
              fontSize: 12, fontWeight: 900, color: C.orange,
              padding: '2px 5px', borderRadius: 3,
              background: `${C.orange}1A`, letterSpacing: '0.12em',
            }}>需加強</span>
          )}
          {isStrong && (
            <span style={{
              fontSize: 12, fontWeight: 900, color: C.ink,
              padding: '2px 5px', borderRadius: 3,
              background: 'rgba(0,0,0,0.06)', letterSpacing: '0.12em',
            }}>優秀</span>
          )}
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, color: C.ink,
          fontFamily: MONO_STACK, fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}>
          {formattedValue}
          <span style={{ fontSize: 11, color: C.steel, marginLeft: 2 }}>%</span>
        </span>
      </div>

      {/* ── 鈦金屬凹槽 ── */}
      <div style={{
        height: 7, borderRadius: 99,
        background: `linear-gradient(180deg, ${C.ti4} 0%, ${C.ti3} 40%, ${C.ti2} 100%)`,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 -1px 0 rgba(255,255,255,0.6)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* 填充條 — 橘色漸層 */}
        <motion.div
          initial={{ width: 0 }}
          animate={inView ? { width: `${pct}%` } : { width: 0 }}
          transition={{ duration: 1.1, delay: Math.min(index, 6) * 0.06 + 0.2, ease: EASE_SWISS }}
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            background: isWeak
              ? `linear-gradient(90deg, ${C.ember} 0%, ${C.orange} 100%)`
              : isStrong
                ? `linear-gradient(90deg, ${C.ink} 0%, ${C.graphite} 100%)`
                : `linear-gradient(90deg, ${C.orangeLite} 0%, ${C.orange} 100%)`,
            borderRadius: 99,
            boxShadow: isWeak ? `0 0 8px ${C.orange}55` : 'none',
          }}
        />
        {/* 末端高光小點 */}
        <motion.div
          initial={{ opacity: 0, left: 0 }}
          animate={inView ? { opacity: 1, left: `${pct}%` } : {}}
          transition={{ duration: 1.1, delay: Math.min(index, 6) * 0.06 + 0.2, ease: EASE_SWISS }}
          style={{
            position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
            width: 4, height: 4, borderRadius: '50%',
            background: '#fff',
            boxShadow: `0 0 4px ${isWeak ? C.orange : isStrong ? C.ink : C.orangeLite}`,
            pointerEvents: 'none',
          }}
        />
      </div>
    </motion.div>
  );
}

/* ── Section 標頭 — 瑞士編號式（鈦金屬版） ───────────────── */
function SectionHead({ index, title, note }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: EASE_SWISS }}
      style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingBottom: 10, borderBottom: `1.5px solid ${C.ink}`,
        position: 'relative',
      }}>
      {/* 底線上的橘色短條 */}
      <div style={{
        position: 'absolute', bottom: -1.5, left: 0,
        width: 28, height: 1.5, background: C.orange,
      }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800,
          color: C.orange, letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          [{index}]
        </span>
        <h3 style={{
          fontSize: 16, fontWeight: 800, margin: 0,
          letterSpacing: '-0.02em', color: C.ink,
        }}>
          {title}
        </h3>
      </div>
      {note && <span style={{
        fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
        color: C.steel, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>{note}</span>}
    </motion.div>
  );
}

function Legend({ color, label, dashed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 18, height: 2.5, borderRadius: 99,
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
          : color,
      }} />
      <span style={{
        fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
        color: C.steel, letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>{label}</span>
    </div>
  );
}

function EmptyMini({ text }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <Activity size={26} color={C.steel} strokeWidth={1.6} />
      <span style={{
        fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
        color: C.steel, letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>{text}</span>
    </div>
  );
}

export default ResultViewMobile;
