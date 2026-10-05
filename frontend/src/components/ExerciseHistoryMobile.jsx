/**
 * ExerciseHistoryMobile.jsx — 動作偵測 · 歷史紀錄
 * ───────────────────────────────────────────────────────────────
 * 指標檢視沿用結果頁「進步趨勢」設計語彙：
 *   瑞士雜誌排版 · 啞光紙質 · 鈦金屬點綴 · 單一強調色 FF4628
 * ───────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, TrendingUp } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { getUserId } from '../utils/auth';
import apiClient from '../api/client';
import { EXERCISE_LIST } from '../lib/exerciseSpec';

/* ── 指標中文對照（與結果頁一致）────────────────────────── */
const METRIC_ZH = {
  'L Elbow': '左肘軌跡', 'R Elbow': '右肘軌跡', 'Torso Lean': '軀幹前傾',
  'Tempo': '節奏控制', 'Elbow Sym': '左右對稱', 'Stability': '核心穩定',
  'Shrug': '聳肩控制',
  'L Knee': '左膝軌跡', 'R Knee': '右膝軌跡', 'Hip Depth': '下蹲深度',
  'Knee Sym': '膝蓋對稱', 'Knee Valgus': '膝蓋內夾',
  'Hip Hinge': '髖鉸鏈', 'Back Flat': '背部平直', 'Bar Path': '槓鈴軌跡',
  'Elbow Flare': '手肘外展', 'Wrist Align': '手腕對齊', 'Shoulder Retract': '肩胛收緊',
  'L Overhead': '左側過頭', 'R Overhead': '右側過頭',
  'Torso Hinge': '軀幹角度', 'Hip Stability': '髖部穩定',
  // v4.6 信任度修正後的新標籤
  'Forearm Vertical': '前臂垂直', 'Grip Width': '握距一致',
  'Pull Depth': '拉桿幅度', 'Bar Tilt': '桿面水平', 'Body Line': '軀幹水平',
  'L Arm': '左臂軌跡', 'R Arm': '右臂軌跡', 'Torso': '軀幹穩定',
  'Symmetry': '左右對稱', 'Shoulder': '肩部位置',
};
const zh = (k) => (k === '__overall__' ? '綜合分數' : (METRIC_ZH[k] || k));

/* ── 色票（圖二四色系統）──────────────────────────────────── */
const C = {
  smoke: '#F6F4F1', paper: '#F6F4F1', paperDeep: '#ECEAE5',
  ink: '#262523', steel: '#6E6E6E', faint: '#9C9C9C',
  line: '#DCDCDC', lineStrong: '#C7C7C7',
  orange: '#F95C4B', ember: '#D8331C', orangeWash: 'rgba(255,70,40,0.10)',
  ti1: '#F6F4F1',
};
const TITANIUM_DARK = 'linear-gradient(168deg, #2C2C2A 0%, #1A1A18 100%)';
const FONT_STACK = '"Helvetica Neue", -apple-system, sans-serif';
const MONO_STACK = '"SF Mono", "JetBrains Mono", Menlo, monospace';

// 【v4.6】核心五動作在前；滑輪下拉已自新分析入口移除，
//   此處保留在最後，讓使用者仍能查看既有的歷史紀錄。
/* ⚠️ 這裡以前自己維護一份動作清單（6 個），選擇頁另外維護一份（5 個）——
   同一個 app 兩頁看到的動作數量不一樣。改讀 lib/exerciseSpec 的單一清單。 */
const EXERCISES = EXERCISE_LIST.map((e) => ({
  key: e.key, name_zh: e.name, name_en: e.nameEn.toUpperCase(),
  color: e.tint, imgSrc: e.image,
}));

/* ════════════════════════════════════════════════════════════
   趨勢折線圖 — 啞光紙底 + 橘色漸層填充
   ════════════════════════════════════════════════════════════ */
const TrendChart = ({ data, dataKey }) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id="ehTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.orange} stopOpacity={0.20} />
          <stop offset="100%" stopColor={C.orange} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={C.line} />
      <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: C.line }}
        tick={{ fontSize: 11, fill: C.faint, fontWeight: 700 }} />
      <YAxis domain={[0, 100]} tickLine={false} axisLine={{ stroke: C.line }}
        tick={{ fontSize: 11, fill: C.faint }} width={30} />
      <Tooltip
        cursor={{ stroke: C.lineStrong, strokeWidth: 1 }}
        contentStyle={{
          background: C.ink, borderRadius: 8, border: 'none',
          fontSize: 11, padding: '6px 10px',
        }}
        labelStyle={{ color: '#FFF', fontSize: 11 }}
        itemStyle={{ color: C.orange, fontSize: 11, fontWeight: 700 }} />
      <Area type="monotone" dataKey={dataKey} name="分數"
        stroke={C.orange} strokeWidth={2.5} fill="url(#ehTrendFill)"
        dot={{ r: 3, fill: C.orange, strokeWidth: 0 }}
        activeDot={{ r: 5, fill: '#FFF', stroke: C.orange, strokeWidth: 2 }}
        animationDuration={900} />
    </AreaChart>
  </ResponsiveContainer>
);

/* ── Section 標頭 — 瑞士編號式 ──────────────────────────── */
const SectionHead = ({ index, title, note }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    paddingBottom: 8, borderBottom: `1.5px solid ${C.ink}`,
  }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800, color: C.orange }}>
        {index}
      </span>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: C.ink }}>
        {title}
      </h3>
    </div>
    {note && (
      <span style={{
        fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
        letterSpacing: '0.14em', color: C.faint, textTransform: 'uppercase',
      }}>
        {note}
      </span>
    )}
  </div>
);

const EmptyMini = ({ text }) => (
  <div style={{
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  }}>
    <Activity size={26} color={C.faint} />
    <span style={{
      fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
      letterSpacing: '0.16em', color: C.faint, textTransform: 'uppercase',
    }}>
      {text}
    </span>
  </div>
);

// ══════════════════════════════════════════════════════════════
//  Main Component
// ══════════════════════════════════════════════════════════════
const ExerciseHistoryMobile = () => {
  const navigate = useNavigate();
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeMetric, setActiveMetric] = useState('__overall__');
  const userId = getUserId();

  /* ── 抓取歷史資料 ──────────────────────────────────────── */
  useEffect(() => {
    if (!selectedExercise) return;
    setLoading(true);
    setHistoryData([]);
    setActiveMetric('__overall__');

    const fetchData = async () => {
      try {
        // 🔧 改用 apiClient：走 VITE_API_URL + 自動帶 JWT（寫死 :8000 上線會斷、
        //    raw fetch 沒帶 Authorization 會被後端 enforce_owner 擋下）
        const res = await apiClient.get(
          `/api/workout/history/${userId}?exercise=${selectedExercise.key}`);
        {
          const data = res.data || {};
          const raw = data.history || [];
          const formatted = raw
            // 只保留此動作的偵測紀錄（motion record 都帶 exerciseKey）
            .filter(s => s.exerciseKey === selectedExercise.key)
            .map(session => {
              let flat = {};
              let rawMetrics = session.metrics;
              try {
                if (typeof rawMetrics === 'string') rawMetrics = JSON.parse(rawMetrics);
                if (Array.isArray(rawMetrics)) {
                  rawMetrics.forEach(m => {
                    if (m.subject && m.A !== undefined) flat[m.subject] = m.A;
                  });
                } else if (rawMetrics && typeof rawMetrics === 'object') {
                  flat = rawMetrics;
                }
              } catch (e) { /* ignore */ }
              return {
                ...session,
                date: session.timestamp
                  ? new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : 'N/A',
                ...flat,
              };
            })
            .reverse();
          setHistoryData(formatted);
        }
      } catch (e) {
        /* keep empty */
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedExercise, userId]);

  /* ── 從歷史紀錄掃出實際出現過的指標 ──────────────────────── */
  const metricKeys = useMemo(() => {
    const seen = new Set();
    historyData.forEach(s => {
      Object.keys(METRIC_ZH).forEach(k => {
        if (s[k] !== undefined) seen.add(k);
      });
    });
    return ['__overall__', ...seen];
  }, [historyData]);

  /* 趨勢資料的 dataKey */
  const dataKey = activeMetric === '__overall__' ? 'overall_score' : activeMetric;

  /* 最新值 + 變化量 */
  const latestVal = useMemo(() => {
    if (historyData.length === 0) return null;
    const v = historyData[historyData.length - 1]?.[dataKey];
    return typeof v === 'number' ? Math.round(v) : null;
  }, [historyData, dataKey]);

  const delta = useMemo(() => {
    const vals = historyData.map(s => s[dataKey]).filter(v => typeof v === 'number');
    if (vals.length < 2) return null;
    return Math.round(vals[vals.length - 1] - vals[0]);
  }, [historyData, dataKey]);

  // ════════════════════════════════════════════════════════════
  //  動作選擇輪播（保留原本的深色編輯風格）
  // ════════════════════════════════════════════════════════════
  if (!selectedExercise) {
    return (
      <div
        className="min-h-[100dvh] flex flex-col font-sans relative pb-10 overflow-hidden"
        style={{
          backgroundColor: '#161415', maxWidth: '430px', margin: '0 auto',
          backgroundImage: `url('${encodeURI('/download/_ (2).jpeg')}')`,
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div className="fixed inset-0 bg-black/80 z-0 pointer-events-none" style={{ maxWidth: '430px', margin: '0 auto' }} />

        <div className="pt-16 px-8 pb-4 relative z-10 w-full mb-8">
          <motion.button {...pressProps('row')}
 onClick={() => navigate('/analysis-choice-mobile')}
 className="flex items-center gap-2 mb-10 opacity-30 hover:opacity-100 text-white hover:translate-x-[-4px]"
 >
            <ArrowLeft size={16} />
            <span className="text-[9px] font-black uppercase tracking-[0.3em]">Library</span>
          </motion.button>
          <div className="space-y-3">
            <h1 className="text-6xl font-normal tracking-tighter text-[#F6F4F1] leading-none">
              History
            </h1>
            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">
              Review Performance Data
            </p>
          </div>
        </div>

        <div className="flex-1 relative z-10 w-full flex flex-col justify-center">
          <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar px-8 gap-6 pb-12" style={{ scrollPadding: '2rem' }}>
            {EXERCISES.map((ex) => (
              <div
                key={ex.key}
                onClick={() => setSelectedExercise(ex)}
                className="snap-center shrink-0 w-[85vw] aspect-[3/4.2] rounded-[36px] relative overflow-hidden group shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 cursor-pointer"
                style={{ maxWidth: '340px' }}
              >
                <img loading="lazy" decoding="async" src={ex.imgSrc} alt={ex.name_zh}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/95 z-[15]" />
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-10 text-center">
                  <div className="w-10 h-px bg-white/30 mb-6 group-hover:w-16 transition-all duration-700" />
                  <h3 className="text-5xl font-normal text-white mb-4 leading-[1.1] tracking-tighter drop-shadow-2xl">
                    {ex.name_zh}
                  </h3>
                  <p className="text-[9px] font-black text-white/40 tracking-[0.3em] uppercase">
                    {ex.name_en}
                  </p>
                </div>
                <div className="absolute bottom-12 left-0 right-0 z-30 flex justify-center">
                  <motion.button {...pressProps('icon')} className="px-8 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-[12px] font-black tracking-[0.25em] text-white/60 group-hover:bg-white group-hover:text-black duration-500">
                    點擊查看記錄
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-2 z-10">
          {EXERCISES.map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/20" />
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  指標趨勢檢視 — 瑞士「進步趨勢」設計
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100dvh', maxWidth: 440, margin: '0 auto',
      background: C.smoke, fontFamily: FONT_STACK, color: C.ink,
      paddingBottom: 110,
    }}>
      {/* ── HEADER ── */}
      <div style={{ padding: '52px 20px 0' }}>
        <motion.button {...pressProps('row')}
 onClick={() => setSelectedExercise(null)}
 className="ms-tap"
 style={{
 display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24,
 background: 'none', border: 'none', cursor: 'pointer', padding: 0,
 }}>
          <ArrowLeft size={14} color={C.faint} />
          <span style={{
            fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
            letterSpacing: '0.22em', color: C.faint, textTransform: 'uppercase',
          }}>
            Selection
          </span>
        </motion.button>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              fontSize: 34, fontWeight: 800, color: C.ink, margin: 0,
              letterSpacing: '-0.035em', lineHeight: 1,
            }}>
              {selectedExercise.name_zh}
            </h1>
            <div style={{
              fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.22em', color: C.faint, textTransform: 'uppercase',
              marginTop: 10,
            }}>
              {selectedExercise.name_en}&nbsp;·&nbsp;Progress
            </div>
          </div>
          {/* 鈦金屬圖示磚 */}
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(152deg, #DFE4EA 0%, #B9C8D7 52%, #97A6B6 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -2px 4px rgba(151,166,182,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Dumbbell size={20} color={C.ink} strokeWidth={2} />
          </div>
        </div>

        {/* 紀錄筆數 pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16,
          padding: '7px 14px', borderRadius: 99, background: C.ink,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: C.orange }} />
          <span style={{
            fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
            letterSpacing: '0.14em', color: C.smoke, textTransform: 'uppercase',
          }}>
            {historyData.length} Session{historyData.length !== 1 ? 's' : ''} Recorded
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240,
        }}>
          <div className="ms-breathe" style={{
            width: 10, height: 10, borderRadius: 99, background: C.orange,
          }} />
        </div>
      ) : historyData.length === 0 ? (
        /* 空狀態 */
        <div style={{ padding: '40px 20px 0' }}>
          <div style={{
            background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18,
            padding: 36, textAlign: 'center',
          }}>
            <Activity size={30} color={C.faint} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, margin: 0 }}>
              尚無歷史紀錄
            </p>
            <p style={{ fontSize: 12, color: C.steel, margin: '6px 0 0', lineHeight: 1.6 }}>
              完成第一次 {selectedExercise.name_zh} 分析後，<br />
              這裡會顯示你的進步軌跡。
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── 指標趨勢 ── */}
          <section className="ms-rise" style={{ padding: '30px 20px 8px' }}>
            <SectionHead index="01" title="指標趨勢"
              note={`${historyData.length} 筆紀錄`} />

            {/* 指標選擇 rail */}
            <div className="ms-no-scrollbar" style={{
              display: 'flex', gap: 6, overflowX: 'auto', margin: '16px 0 4px',
            }}>
              {metricKeys.map(m => {
                const active = activeMetric === m;
                return (
                  <motion.button {...pressProps('row')} key={m}
 onClick={() => setActiveMetric(m)}
 className="ms-tap"
 style={{
 flexShrink: 0, padding: '7px 14px', borderRadius: 99,
 fontSize: 11, fontWeight: 700, cursor: 'pointer',
 border: `1px solid ${active ? C.ink : C.lineStrong}`,
 background: active ? C.ink : C.paper,
 color: active ? C.smoke : C.steel,
 transition: 'all 0.2s ease', whiteSpace: 'nowrap',
 }}>
                    {zh(m)}
                  </motion.button>
                );
              })}
            </div>

            {/* 趨勢圖卡 */}
            <div style={{
              marginTop: 14, padding: 18, borderRadius: 18,
              background: C.paper, border: `1px solid ${C.line}`,
              boxShadow: '0 1px 2px rgba(32,32,32,0.04)',
            }}>
              {/* 頂部統計列 */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.line}`,
              }}>
                <div>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
                    color: C.faint, letterSpacing: '0.18em',
                  }}>
                    LATEST&nbsp;·&nbsp;{zh(activeMetric)}
                  </div>
                  <div style={{
                    fontFamily: MONO_STACK, fontSize: 30, fontWeight: 800,
                    color: C.ink, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 5,
                  }}>
                    {latestVal != null ? latestVal : '—'}
                  </div>
                </div>
                {delta != null && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 99,
                    background: delta >= 0 ? C.orangeWash : C.paperDeep,
                  }}>
                    <TrendingUp size={11}
                      color={delta >= 0 ? C.orange : C.steel}
                      style={{ transform: delta >= 0 ? 'none' : 'scaleY(-1)' }} />
                    <span style={{
                      fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800,
                      color: delta >= 0 ? C.orange : C.steel,
                    }}>
                      {delta >= 0 ? '+' : ''}{delta}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ height: 218 }}>
                <TrendChart data={historyData} dataKey={dataKey} />
              </div>
            </div>
          </section>

          {/* ── 改善洞察 ── */}
          {historyData.length > 1 && delta != null && (
            <section style={{ padding: '18px 20px 0' }}>
              <div style={{
                position: 'relative', overflow: 'hidden',
                borderRadius: 18, padding: 20,
                background: TITANIUM_DARK, border: '1px solid #3A3A38',
                boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 6px 20px rgba(0,0,0,0.2)',
              }}>
                <div style={{
                  position: 'absolute', right: -40, bottom: -40,
                  width: 120, height: 120, borderRadius: '50%',
                  background: `radial-gradient(circle, ${C.orange}44, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: `linear-gradient(135deg, ${C.orange}, ${C.ember})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TrendingUp size={12} color="#fff" strokeWidth={2.5} />
                    </div>
                    <span style={{
                      fontFamily: MONO_STACK, fontSize: 12, fontWeight: 700,
                      color: '#DCDCDC', letterSpacing: '0.22em', textTransform: 'uppercase',
                    }}>
                      改善洞察&nbsp;·&nbsp;INSIGHT
                    </span>
                  </div>
                  <p style={{
                    fontSize: 13.5, lineHeight: 1.6, color: C.ti1,
                    fontWeight: 500, margin: 0,
                  }}>
                    過去 <span style={{ fontFamily: MONO_STACK, color: C.orange, fontWeight: 800 }}>
                      {historyData.length}</span> 次紀錄中，你的
                    <strong style={{ color: '#fff', fontWeight: 800 }}>
                      「{zh(activeMetric)}」</strong>
                    {delta >= 0
                      ? <> 進步了 <span style={{ fontFamily: MONO_STACK, color: C.orange, fontWeight: 800 }}>{delta}</span> 分，保持下去。</>
                      : <> 下降了 <span style={{ fontFamily: MONO_STACK, color: C.orange, fontWeight: 800 }}>{Math.abs(delta)}</span> 分，建議多加練習。</>}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── 歷次紀錄 ── */}
          <section style={{ padding: '24px 20px 8px' }}>
            <SectionHead index="02" title="歷次紀錄" note={`${historyData.length} 筆`} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {[...historyData].reverse().map((session, idx) => {
                /* ⚠️ `|| 0` 會把 null 變成 0。0 分代表「做得很差」，
                    null 代表「這個角度量不到、不給分」—— 兩件事差很多。
                    上面 metrics 已經為了同一件事特地保留 null，這裡不能漏。 */
                const sScore = Number.isFinite(session.overall_score)
                    ? Math.round(session.overall_score) : null;
                const weak = sScore != null && sScore < 70;
                return (
                  <div key={session.session_id || idx}
                    onClick={() => {
                      let parsed = [];
                      let raw = session.metrics;
                      try {
                        if (typeof raw === 'string') {
                          try { raw = JSON.parse(raw); } catch { /* noop */ }
                        }
                        if (Array.isArray(raw)) {
                          // 【v9.3】沒量到的指標是 null，不能硬轉成 0 ——
                          //   0 分代表「做得很差」，null 代表「這個角度量不到」，
                          //   兩件事差很多。轉成 0 會讓歷史紀錄整排顯示 0.0% 需加強。
                          parsed = raw.map(m => {
                            const v = m.A ?? m.value;
                            return {
                              subject: m.subject || m.name || '—',
                              A: Number.isFinite(v) ? v : null,
                              fullMark: 100,
                              occluded: !!m.occluded || !Number.isFinite(v),
                            };
                          });
                        } else if (raw && typeof raw === 'object') {
                          parsed = Object.keys(raw).map(k => ({
                            subject: k,
                            A: Number.isFinite(raw[k]) ? raw[k] : null,
                            fullMark: 100,
                            occluded: !Number.isFinite(raw[k]),
                          }));
                        }
                      } catch (e) { /* noop */ }
                      navigate('/result-mobile', {
                        state: {
                          result: {
                            ...session,
                            overallScore: Number.isFinite(session.overall_score)
                              ? session.overall_score : null,
                            metrics: parsed,
                            chartsData: session.chartsData || [],
                            feedback: session.feedback || [],
                            arVideoUrl: session.arVideoUrl || null,
                          },
                          viewHistory: false,
                        },
                      });
                    }}
                    className="ms-press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px', cursor: 'pointer', borderRadius: 12,
                      background: C.paper, border: `1px solid ${C.line}`,
                      boxShadow: '0 1px 2px rgba(32,32,32,0.04)',
                    }}>
                    {/* 分數方塊 */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: weak ? C.orangeWash : C.paperDeep,
                      border: `1px solid ${weak ? C.orange : C.line}`,
                    }}>
                      {/* 不給分的那一次顯示「—」，不是 0 分 */}
                      <span style={{
                        fontFamily: MONO_STACK, fontSize: sScore == null ? 15 : 17,
                        fontWeight: 800, lineHeight: 1,
                        color: sScore == null ? C.faint : (weak ? C.orange : C.ink),
                      }}>
                        {sScore == null ? '—' : sScore}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>
                        {new Date(session.timestamp || session.date).toLocaleDateString()}
                      </div>
                      <div style={{
                        fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
                        color: C.faint, letterSpacing: '0.14em', marginTop: 3,
                        textTransform: 'uppercase',
                      }}>
                        {/* 沒有的欄位就不列出來，不要用 0 冒充有資料 */}
                        {[
                          Number.isFinite(session.reps_count) && session.reps_count > 0
                            ? `${session.reps_count} 次` : null,
                          Number.isFinite(session.duration_seconds) && session.duration_seconds > 0
                            ? `${Math.max(1, Math.round(session.duration_seconds / 60))} 分鐘` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ExerciseHistoryMobile;
