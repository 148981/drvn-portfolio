/**
 * StandbyScreen.jsx — DRVN ISSUE No.05 · Editorial Edition
 *
 * 設計語言：時尚雜誌排版 × 城市運動 × 手繪質感
 *
 * 排版邏輯：
 *  - 圖一風格：解構式拆字、出血大字、左下數據格柵
 *  - 圖二風格：散落關鍵字標籤、襯線 italic 混搭
 *  - 圖三風格：手繪圈圈、底線標記、宣言式版面
 *  - 圖四風格：襯線 + 手寫筆觸、向右箭頭引導
 *  - 圖五配色：#262523 / #F6F4F1 / #B9C8D7 / #F95C4B
 *
 * 6 張海報：
 *  S1 · HeartbeatEditorial — 心率宣言 + 解構標籤
 *  S2 · DayCountIssue      — 大數字日期 + 訓練格柵
 *  S3 · GoalManifesto      — 手寫宣言 + 圈圈進度
 *  S4 · WatchFaceCouture   — 高級錶盤 + 時尚數據
 *  S5 · QuoteMagazine      — 雜誌封面式名言
 *  S6 · PortraitFeature    — 人像專題報導
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getStandbyData } from '../api/client';

/* ══════════════════════════════════════
   DESIGN TOKENS — 圖五配色系統
══════════════════════════════════════ */
const CARBON     = '#262523';   // Charcoal Black — 主背景
const SMOKE      = '#F6F4F1';   // White Smoke — 主文字
const SILVER     = '#B9C8D7';   // Metallic Silver — 次要 / 手繪元素
const ORANGE     = '#F95C4B';   // Red Orange — accent
const SMOKE_DIM  = 'rgba(245,245,245,0.55)';
const SMOKE_MUTE = 'rgba(245,245,245,0.32)';
const SMOKE_GHOST = 'rgba(245,245,245,0.14)';
const SILVER_DIM = 'rgba(185,200,215,0.4)';

/* 字型系統 —— 雜誌語言 */
const FONT_DISPLAY = '"Tenor Sans","Noto Sans TC",system-ui,sans-serif';   // §2: display 一律 Tenor，serif 僅限報告封面
const FONT_SANS    = '"Helvetica Neue","Helvetica","Arial Black",sans-serif';              // 無襯線 — 理性
const FONT_MONO    = '"JetBrains Mono","SF Mono","Courier New",monospace';                 // 等寬 — 數據
const FONT_HAND    = '"Caveat","Kalam","Bradley Hand","Comic Sans MS",cursive';            // 手寫 — 標記

/* 紙張紋理 + 顆粒感 */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23g)' opacity='0.13'/%3E%3C/svg%3E")`;

/* 格紋背景（圖三靈感） */
const GRID_BG = `linear-gradient(${SMOKE_GHOST} 1px, transparent 1px), linear-gradient(90deg, ${SMOKE_GHOST} 1px, transparent 1px)`;

/* ══════════════════════════════════════
   QUOTES — 雜誌式封面語
══════════════════════════════════════ */
// 真實運動員完整語錄（健身/跑步為主），控制在滿版一句可讀的長度。
const QUOTES = [
  { text: '最後三、四下，才是讓肌肉生長的關鍵。', author: 'Arnold Schwarzenegger' },
  { text: '每個人都想成功，但沒人想舉那些該死的重量。', author: 'Ronnie Coleman' },
  { text: '痛苦是短暫的，放棄是永遠的。', author: 'Eliud Kipchoge' },
  { text: '沒有人類極限這回事。', author: 'Eliud Kipchoge' },
  { text: '大腦說到極限時，你其實只用了四成。', author: 'David Goggins' },
  { text: '在終點休息，而不是在半途。', author: 'Kobe Bryant' },
  { text: '我可以接受失敗，但無法接受不去嘗試。', author: 'Michael Jordan' },
  { text: '別人休息的時候，正是我超越的時候。', author: 'Michael Phelps' },
  { text: '它不會變輕鬆，你只會變更快。', author: 'Greg LeMond' },
  { text: '跑得慢沒關係，停下來才輸。', author: 'Mo Farah' },
  { text: '紀律，就是做你不想做但必須做的事。', author: 'Mike Tyson' },
  { text: '我不相信天分，我相信重複。', author: 'Conor McGregor' },
  { text: '身體會記住每一次你沒有放棄。', author: 'Kílian Jornet' },
  { text: '把每一次試舉，都當成人生唯一一次。', author: 'Lasha Talakhadze' },
  { text: '離開健身房前，先確定自己毫無保留。', author: 'Tom Platz' },
  { text: '訓練時流的汗，是比賽時的底氣。', author: 'Usain Bolt' },
];

/* ══════════════════════════════════════
   DATA LOADER
══════════════════════════════════════ */
const FALLBACK_DATA = (userId) => ({
  userId, displayName: 'ATHLETE',
  healthData: { steps: 0, stepGoal: 10000, heartRate: 0, sleepHrs: 0, bodyFat: 0, hrv: 0 },
  trainingData: {
    streak: 0, weekSessions: 0, weekGoal: 6, totalMins: 0,
    personalBest: { label: 'TRAINING', value: '—', date: '—' },
    lastWorkout: 'TRAINING', caloriesWeek: 0,
  },
  goalData: {
    weeklyGoal: 6, weeklyDone: 0, monthGoal: 24, monthDone: 0,
    bodyFatGoal: 0, stepGoalHitRate: 0,
  },
  socialData: { rank: 0, likes: 0, followers: 0, feedCount: 0 },
  nutritionData: {
    calories: 0, calorieGoal: 2000, protein: 0, proteinGoal: 120,
    carbs: 0, fats: 0, water: 0, mealCount: 0,
  },
  inbodyData: {
    hasData: false, measuredAt: '', bodyFatPercent: 0, skeletalMuscle: 0,
    weightKg: 0, bmi: 0, bodyFatTarget: 0, weightTarget: 0,
  },
  runningData: {
    totalRuns: 0, totalDistance: 0, totalDuration: 0, totalCalories: 0,
    avgPaceSec: 0, avgCadence: 0, avgHr: 0,
  },
});

const fetchUserData = async (userId) => {
  try {
    const data = await getStandbyData(userId);
    return data || FALLBACK_DATA(userId);
  } catch (err) {
    console.warn('[StandbyScreen] getStandbyData failed, using fallback:', err?.message || err);
    return FALLBACK_DATA(userId);
  }
};

/* ══════════════════════════════════════
   手繪 SVG 元素庫
══════════════════════════════════════ */

/** 手繪圈圈 — 圖三/圖四標誌性元素 */
function HandCircle({ color = ORANGE, strokeWidth = 2.4, opacity = 0.85, rotate = -3 }) {
  return (
    <svg viewBox="0 0 200 80" width="100%" height="100%" preserveAspectRatio="none"
      style={{ transform: `rotate(${rotate}deg)` }}>
      <path
        d="M 18,42 Q 14,16 56,12 Q 110,6 158,14 Q 188,20 184,42 Q 188,66 138,72 Q 78,76 36,68 Q 12,62 18,42 Z"
        fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={opacity}
        strokeDasharray="0" />
    </svg>
  );
}

/** 手繪底線 — 簽名式底線 */
function HandUnderline({ color = ORANGE, strokeWidth = 2.6, opacity = 0.9 }) {
  return (
    <svg viewBox="0 0 240 18" width="100%" height="100%" preserveAspectRatio="none">
      <path d="M 4,10 Q 60,2 120,8 T 236,7" fill="none" stroke={color}
        strokeWidth={strokeWidth} strokeLinecap="round" opacity={opacity} />
      <path d="M 12,14 Q 90,11 200,13" fill="none" stroke={color}
        strokeWidth={strokeWidth * 0.6} strokeLinecap="round" opacity={opacity * 0.5} />
    </svg>
  );
}

/** 手繪箭頭 — 圖四向右引導 */
function HandArrow({ color = SMOKE, size = 28 }) {
  return (
    <svg viewBox="0 0 60 24" width={size * 2.5} height={size} fill="none">
      <path d="M 4,12 Q 22,11 50,12" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M 42,5 L 52,12 L 42,19" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** 編輯星標 */
function EditorialAsterisk({ size = 22, color = ORANGE }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L12 22 M2 12 L22 12 M4.9 4.9 L19.1 19.1 M19.1 4.9 L4.9 19.1"
        stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 心率波形 ECG */
function HeartbeatECG({ color = ORANGE, opacity = 0.95, strokeWidth = 1.6 }) {
  const pts = "0,50 28,50 36,12 48,88 58,50 78,50 88,32 98,68 108,50 158,50 168,22 180,78 190,50 240,50";
  return (
    <svg viewBox="0 0 240 100" width="100%" height="100%" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
    </svg>
  );
}

/** 手繪頂點符號 — 散落點綴 */
function HandStar({ size = 16, color = SILVER, rotate = 0 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 22 L10.5 12.5 L3 11 L10.5 9.5 Z"
        fill={color} opacity="0.9" />
    </svg>
  );
}

/** 手繪劃線標記 — strikethrough/highlight */
function HandStrike({ color = ORANGE, opacity = 0.7 }) {
  return (
    <svg viewBox="0 0 100 12" width="100%" height="100%" preserveAspectRatio="none">
      <path d="M 2,6 Q 30,3 60,7 T 98,5" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity={opacity} />
    </svg>
  );
}

/* ══════════════════════════════════════
   SLIDE 1 — BodyCompositionEditorial · 身體組成
   一頁一主角：體脂率（最近一次 InBody 量測，App 內真實紀錄）
   ⚠️ 原本的心率頁依賴手錶數據，已依產品規範移除，
      改用使用者自己輸入/量測的 InBody 身體組成（永遠有真實來源）。
══════════════════════════════════════ */
function BodyCompositionEditorial({ d, bo }) {
  const b = d.inbodyData || {};
  const hasData = !!b.hasData && (b.bodyFatPercent > 0 || b.weightKg > 0);
  const fat = b.bodyFatPercent || 0;
  const toGoal = (b.bodyFatTarget > 0 && fat > 0) ? Math.round((fat - b.bodyFatTarget) * 10) / 10 : null;
  // 量測日期 → MM.DD
  const measured = (b.measuredAt || '').toString().slice(5, 10).replace('-', '.');

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col"
      style={{ background: CARBON, transform: `translate(${bo.x}px,${bo.y}px)` }}>

      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.55 }} />

      {/* 頂部 — 雜誌刊頭 */}
      <div className="relative z-10 flex justify-between items-start px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 40px) + 18px)' }}>
        <div>
          <p className="leading-none" style={{ fontFamily: FONT_SANS, fontWeight: 900, fontSize: 22, letterSpacing: '-0.04em', color: SMOKE }}>
            DRVN<span style={{ color: ORANGE }}>.</span>
          </p>
          <p className="mt-1 tracking-[0.32em]" style={{ fontFamily: FONT_MONO, fontSize: 11, color: SMOKE_MUTE }}>
            ISSUE Nº 05 · BODY
          </p>
        </div>
        <p className="text-right tracking-[0.22em] leading-[1.6]" style={{ fontFamily: FONT_MONO, fontSize: 11, color: SMOKE_MUTE }}>
          THE<br />COMPOSITION<br />REPORT
        </p>
      </div>

      {/* 中段 — 標題 */}
      <div className="relative z-10 px-6 mt-5">
        <div className="relative inline-block">
          <h1 style={{
            fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 400,
            fontSize: 'clamp(48px, 13vw, 72px)', lineHeight: 0.88,
            color: SMOKE, letterSpacing: '-0.03em',
          }}>
            the shape
          </h1>
        </div>
        <h1 className="mt-1" style={{
          fontFamily: FONT_SANS, fontWeight: 900,
          fontSize: 'clamp(38px, 11vw, 56px)', lineHeight: 0.9,
          color: SMOKE, letterSpacing: '-0.05em',
        }}>
          OF PROGRESS.
        </h1>
        <p className="mt-3" style={{
          fontFamily: FONT_HAND, fontSize: 19, color: SILVER, fontStyle: 'italic',
          transform: 'rotate(-1.5deg)', display: 'inline-block',
        }}>
          — your latest InBody, on record.
        </p>
      </div>

      {/* ECG 線改為裝飾性節奏線 — 出血橫切 */}
      <div className="relative z-10 mt-6 px-6" style={{ height: 40 }}>
        <HeartbeatECG color={ORANGE} opacity={0.9} strokeWidth={1.5} />
      </div>

      {/* 底部 — 主角數據：體脂率（InBody 真實量測） */}
      <div className="relative z-10 flex-1 flex items-end px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 70px)' }}>
        <div className="w-full border-t pt-4" style={{ borderColor: SMOKE_GHOST }}>
          <p className="tracking-[0.28em] mb-2" style={{ fontFamily: FONT_MONO, fontSize: 11, color: SMOKE_MUTE }}>
            BODY FAT{measured ? ` · MEASURED ${measured}` : ''}
          </p>
          <div className="flex items-end gap-3">
            <p style={{
              fontFamily: FONT_SANS, fontWeight: 200,
              fontSize: 'clamp(96px, 30vw, 150px)', lineHeight: 0.82,
              color: SMOKE, letterSpacing: '-0.05em',
            }}>
              {hasData && fat > 0 ? fat.toFixed(1) : '--'}
            </p>
            <p className="mb-3" style={{ fontFamily: FONT_MONO, fontSize: 13, color: ORANGE, letterSpacing: '0.18em' }}>
              %
            </p>
          </div>
          {/* 輔助：體重 / 骨骼肌（同概念：身體組成） */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span style={{ width: 7, height: 7, borderRadius: 99, background: ORANGE, display: 'block' }} />
            {hasData ? (
              <>
                <p style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 18, color: SMOKE }}>
                  {b.weightKg > 0 ? `${b.weightKg} kg` : ''}
                  {b.skeletalMuscle > 0 ? ` · 骨骼肌 ${b.skeletalMuscle} kg` : ''}
                </p>
                {toGoal != null && toGoal > 0 && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.2em' }}>
                    · {toGoal}% TO GOAL
                  </span>
                )}
              </>
            ) : (
              <p style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 18, color: SMOKE }}>
                尚無量測 <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.2em' }}>· LOG YOUR FIRST INBODY</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   SLIDE 2 — TrainingRhythmPoster · 訓練節奏
   圖一靈感：瑞士排版海報 —— 網格線 + 超大字 + 垂直數據編排
   一頁一概念（訓練累積）：連續天數（主角）、本週次數、總訓練分鐘
   資料來源：monthly-report.overview（best_streak / avg_weekly_sessions /
             total_duration_mins）
══════════════════════════════════════ */
function TrainingRhythmPoster({ d, bo }) {
  const { trainingData: t } = d;
  const streak = t.streak || 0;
  const dd = String(streak).padStart(2, '0');

  // 海報網格線位置
  const vLines = [20, 40, 60, 80];
  const hLines = [18, 38, 58, 78];

  return (
    <div className="relative w-full h-full overflow-hidden"
      style={{ background: CARBON, transform: `translate(${bo.x}px,${bo.y}px)` }}>

      {/* 淡網格線 — 瑞士版面骨架 */}
      <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" aria-hidden>
        {vLines.map((p, i) => (
          <line key={`v${i}`} x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%"
            stroke={SMOKE_GHOST} strokeWidth="1" />
        ))}
        {hLines.map((p, i) => (
          <line key={`h${i}`} x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`}
            stroke={SMOKE_GHOST} strokeWidth="1" />
        ))}
      </svg>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.4 }} />

      {/* 頂部刊頭 */}
      <div className="relative z-10 px-6 flex justify-between items-start"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 40px) + 18px)' }}>
        <div>
          <p className="leading-none" style={{ fontFamily: FONT_SANS, fontWeight: 900, fontSize: 22, letterSpacing: '-0.04em', color: SMOKE }}>
            DRVN<span style={{ color: ORANGE }}>.</span>
          </p>
          <p className="mt-1 tracking-[0.3em]" style={{ fontFamily: FONT_MONO, fontSize: 11, color: SMOKE_MUTE }}>
            ISSUE Nº 05 · TRAINING
          </p>
        </div>
        {/* 旋轉側標 */}
        <p style={{
          fontFamily: FONT_MONO, fontSize: 9, color: ORANGE, letterSpacing: '0.2em',
          writingMode: 'vertical-rl', textTransform: 'uppercase',
        }}>
          Consistency Report
        </p>
      </div>

      {/* 主標題 — 超大字 */}
      <div className="relative z-10 px-6 mt-5">
        <h1 style={{
          fontFamily: FONT_SANS, fontWeight: 900,
          fontSize: 'clamp(58px, 17vw, 86px)', lineHeight: 0.86,
          color: SMOKE, letterSpacing: '-0.05em',
        }}>
          TRAINING
        </h1>
        <h1 style={{
          fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 400,
          fontSize: 'clamp(58px, 17vw, 86px)', lineHeight: 0.92,
          color: ORANGE, letterSpacing: '-0.03em', marginLeft: '14%',
        }}>
          rhythm.
        </h1>
      </div>

      {/* 主角數據 — 巨大連續天數，垂直編排 */}
      <div className="absolute z-10" style={{ left: 24, top: '37%' }}>
        <p className="mb-1" style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.2em' }}>
          STREAK
        </p>
        <div className="relative inline-block">
          <p style={{
            fontFamily: FONT_SANS, fontWeight: 900,
            fontSize: 'clamp(170px, 50vw, 270px)',
            lineHeight: 0.78, color: SMOKE, letterSpacing: '-0.08em',
          }}>
            {dd}
          </p>
          <div className="absolute" style={{ bottom: 22, left: '6%', width: '88%', height: 14 }}>
            <HandUnderline color={ORANGE} strokeWidth={3} opacity={0.95} />
          </div>
        </div>
        <p className="mt-1" style={{
          fontFamily: FONT_HAND, fontSize: 24, color: SILVER, fontStyle: 'italic',
          transform: 'rotate(-3deg)', display: 'inline-block', lineHeight: 1,
        }}>
          consecutive days.
        </p>
      </div>

      {/* 底部 — 兩個輔助數據（同概念：訓練累積），垂直格柵 */}
      <div className="absolute left-6 right-6 z-10 grid grid-cols-2"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 34px) + 62px)',
          borderTop: `1px solid ${SMOKE_GHOST}`, paddingTop: 14,
        }}>
        <div>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.2em' }}>
            THIS WEEK
          </p>
          <p className="mt-1" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 32, color: SMOKE, lineHeight: 1 }}>
            {t.weekSessions}<span style={{ color: SMOKE_DIM, fontSize: 18 }}> / {t.weekGoal}</span>
          </p>
          <p className="mt-1" style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.14em' }}>
            SESSIONS
          </p>
        </div>
        <div style={{ borderLeft: `1px solid ${SMOKE_GHOST}`, paddingLeft: 16 }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.2em' }}>
            TOTAL TIME
          </p>
          <p className="mt-1" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 32, color: SMOKE, lineHeight: 1 }}>
            {t.totalMins}<span style={{ color: SMOKE_DIM, fontSize: 16 }}> min</span>
          </p>
          <p className="mt-1" style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.14em' }}>
            THIS MONTH
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   SLIDE 3 — GoalManifesto
   圖三靈感：格紋背景 + 宣言式手繪
══════════════════════════════════════ */
function GoalManifesto({ d, bo }) {
  const { goalData: g } = d;
  const pct = g.weeklyGoal ? Math.round((g.weeklyDone / g.weeklyGoal) * 100) : 0;
  const mPct = g.monthGoal ? Math.round((g.monthDone / g.monthGoal) * 100) : 0;

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col"
      style={{ background: CARBON, transform: `translate(${bo.x}px,${bo.y}px)` }}>

      {/* 格紋背景 — 圖三標誌性元素 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: GRID_BG, backgroundSize: '32px 32px', opacity: 0.55 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.4 }} />

      {/* 頂部 */}
      <div className="relative z-10 px-6 flex justify-between items-start"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 40px) + 18px)' }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.28em' }}>
          ⊹ DRVN MANIFESTO ⊹
        </p>
        <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.22em' }}>
          GOAL · 03
        </p>
      </div>

      {/* 中段 — 圖三宣言「clarity is a deletion process」改編 */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6">
        <div className="relative">
          {/* 第一行 */}
          <div className="relative inline-block">
            <h1 style={{
              fontFamily: FONT_SANS, fontWeight: 900,
              fontSize: 'clamp(38px, 11vw, 56px)', lineHeight: 0.94,
              color: SMOKE, letterSpacing: '-0.04em',
            }}>
              "strength
            </h1>
          </div>

          <h1 style={{
            fontFamily: FONT_SANS, fontWeight: 900,
            fontSize: 'clamp(38px, 11vw, 56px)', lineHeight: 0.94,
            color: SMOKE, letterSpacing: '-0.04em',
          }}>
            is a
          </h1>

          <h1 style={{
            fontFamily: FONT_SANS, fontWeight: 900,
            fontSize: 'clamp(38px, 11vw, 56px)', lineHeight: 0.94,
            color: SMOKE, letterSpacing: '-0.04em',
          }}>
            daily
          </h1>

          {/* 最後一字 italic + 手繪底線 */}
          <div className="relative inline-block">
            <h1 style={{
              fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 400,
              fontSize: 'clamp(44px, 13vw, 64px)', lineHeight: 0.94,
              color: SMOKE, letterSpacing: '-0.02em',
            }}>
              process."
            </h1>
            <div className="absolute" style={{ bottom: 8, left: 4, width: '76%', height: 12 }}>
              <HandUnderline color={ORANGE} strokeWidth={3.2} opacity={0.95} />
            </div>
          </div>
        </div>

        {/* 手寫副標 */}
        <p className="mt-3" style={{
          fontFamily: FONT_HAND, fontSize: 18, color: SMOKE_DIM, fontStyle: 'italic',
          transform: 'rotate(-1deg)', display: 'inline-block', lineHeight: 1.1,
        }}>
          — train, repeat, transcend.
        </p>
      </div>

      {/* 底部 — 進度數據（圖三克制風格） */}
      <div className="relative z-10 px-6 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 56px)', borderTop: `1px solid ${SMOKE_GHOST}` }}>

        {/* 進度條 */}
        {[
          { label: 'WEEKLY', val: pct, done: g.weeklyDone, total: g.weeklyGoal, unit: 'sessions' },
          { label: 'MONTHLY', val: mPct, done: g.monthDone, total: g.monthGoal, unit: 'days' },
        ].map((bar, i) => (
          <div key={i} className={i === 0 ? '' : 'mt-3'}>
            <div className="flex items-baseline justify-between mb-1">
              <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.22em' }}>
                {bar.label}
              </p>
              <p style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 14, color: SMOKE }}>
                {bar.done}<span style={{ color: SMOKE_DIM }}>/{bar.total}</span> <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: SMOKE_DIM }}>{bar.unit}</span>
              </p>
            </div>
            <div style={{ height: 2, background: SMOKE_GHOST, position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 0, width: `${Math.min(bar.val, 100)}%`,
                background: ORANGE, transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        ))}

        {/* 達成率 — 與目標進度同概念的唯一輔助數據 */}
        <div className="flex items-center gap-2 mt-3">
          <span style={{ width: 6, height: 6, borderRadius: 99, background: ORANGE, display: 'block' }} />
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.18em' }}>
            CONSISTENCY · <span style={{ color: ORANGE, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 13 }}>{g.stepGoalHitRate}%</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   HealthKit 步數 hook —— 只在 iOS WebView 拿得到，否則回傳 null
   bridge: window.webkit.messageHandlers.fitnessApp → getSteps
   回傳事件: window.nativeBridge.onNativeEvent → { type:'stepsResult', steps }
══════════════════════════════════════ */
function useTodaySteps() {
  const [steps, setSteps] = useState(null);
  useEffect(() => {
    const requestSteps = () => {
      try {
        const bridge = window?.webkit?.messageHandlers?.fitnessApp;
        if (bridge) bridge.postMessage({ type: 'getSteps' });
      } catch (_) { /* 非 iOS */ }
    };
    const prev = window.nativeBridge?.onNativeEvent;
    if (!window.nativeBridge) window.nativeBridge = {};
    window.nativeBridge.onNativeEvent = (jsonStr) => {
      if (prev) { try { prev(jsonStr); } catch (_) { } }
      try {
        const evt = JSON.parse(jsonStr);
        if (evt && evt.type === 'stepsResult') {
          const n = parseInt(evt.steps ?? evt.data?.steps ?? 0, 10);
          if (!isNaN(n)) setSteps(n);
        }
      } catch (_) { }
    };
    requestSteps();
    const t = setInterval(requestSteps, 60_000);
    return () => {
      clearInterval(t);
      if (window.nativeBridge) window.nativeBridge.onNativeEvent = prev;
    };
  }, []);
  return steps; // null = 尚未拿到（非 iOS 或還沒回傳）
}

/* ══════════════════════════════════════
   SLIDE 5 — 本週跑步錶盤
   distanceKm: 本週總距離  ·  goalKm: 週里程目標（用於弧長）
══════════════════════════════════════ */
function CoutureWatchFace({ distanceKm = 0, goalKm = 20 }) {
  const cx = 160, cy = 160, R = 138;
  const toRad = a => (a * Math.PI) / 180;
  // 週里程錶盤：以 goalKm 為滿圈，弧長對應本週累積距離
  const ratio = goalKm > 0 ? Math.min(distanceKm / goalKm, 1) : 0;
  const arcAngle = ratio * 360;
  const arcEnd = toRad(arcAngle - 90);
  const arcX = cx + R * Math.cos(arcEnd);
  const arcY = cy + R * Math.sin(arcEnd);
  const largeArc = arcAngle > 180 ? 1 : 0;

  // 60 細刻度 — 高級錶盤質感
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const angle = i * 6 - 90;
    const isMajor = i % 5 === 0;
    const r1 = isMajor ? R - 18 : R - 10;
    return {
      x1: cx + r1 * Math.cos(toRad(angle)),
      y1: cy + r1 * Math.sin(toRad(angle)),
      x2: cx + R * Math.cos(toRad(angle)),
      y2: cy + R * Math.sin(toRad(angle)),
      major: isMajor,
    };
  });

  return (
    <svg viewBox="0 0 320 320" width="100%" height="100%">
      <defs>
        <radialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(185,200,215,0.06)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R - 12} fill="url(#dialGlow)" />

      {/* 雙圈 — 高級錶款細節 */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={SMOKE_GHOST} strokeWidth="1" />
      <circle cx={cx} cy={cy} r={R - 22} fill="none" stroke={SMOKE_GHOST} strokeWidth="0.6" />

      {/* 刻度 */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={t.major ? SMOKE_DIM : SMOKE_MUTE}
          strokeWidth={t.major ? 1.8 : 0.8} />
      ))}

      {/* 刻度數字 — 12/3/6/9 點位置標示週里程刻度 */}
      {[
        { x: cx, y: cy - R + 28, label: '12' },
        { x: cx + R - 28, y: cy + 4, label: '3' },
        { x: cx, y: cy + R - 22, label: '6' },
        { x: cx - R + 28, y: cy + 4, label: '9' },
      ].map((m, i) => (
        <text key={i} x={m.x} y={m.y} textAnchor="middle" fill={SILVER}
          fontFamily={FONT_DISPLAY} fontStyle="italic" fontSize="13" fontWeight="500">
          {m.label}
        </text>
      ))}

      {/* 週里程進度弧 */}
      {ratio > 0 && (
        <path
          d={`M ${cx} ${cy - R} A ${R} ${R} 0 ${largeArc} 1 ${arcX} ${arcY}`}
          fill="none" stroke={ORANGE} strokeWidth="3.5" strokeLinecap="round" opacity="0.95"
        />
      )}

      {/* 中央 — 主角數據：本週跑步總距離 */}
      <text x={cx} y={cy - 30} textAnchor="middle"
        fill={SMOKE_MUTE} fontSize="9" fontFamily={FONT_MONO} letterSpacing="3">
        THIS WEEK · DISTANCE
      </text>

      <text x={cx} y={cy + 22} textAnchor="middle"
        fill={SMOKE} fontSize="62" fontFamily={FONT_SANS}
        fontWeight="200" letterSpacing="-0.04em">
        {distanceKm ? distanceKm.toFixed(1) : '0.0'}<tspan fontSize="22" fill={ORANGE}> km</tspan>
      </text>

      {/* 底部週目標小資訊 */}
      <line x1={cx - 34} y1={cy + 44} x2={cx + 34} y2={cy + 44} stroke={SMOKE_GHOST} strokeWidth="0.6" />
      <text x={cx} y={cy + 64} textAnchor="middle"
        fill={SMOKE_DIM} fontSize="9" fontFamily={FONT_MONO} letterSpacing="2">
        WEEKLY GOAL {goalKm} KM
      </text>
    </svg>
  );
}

/* ══════════════════════════════════════
   SLIDE 5 — RunningWeekCouture · 本週跑步
   高級錶盤呈現有氧組件的「最近一週累積跑步數據」
   一頁一概念（本週跑步）：總距離（主角）、平均配速、跑步次數
   附帶今日步數（HealthKit，只在 iPhone 上才有）
   資料來源：/api/cardio/analytics/summary?period=week → runningData
══════════════════════════════════════ */
function WatchFaceCouture({ d, bo }) {
  const { runningData: r } = d;
  const todaySteps = useTodaySteps();

  // 平均配速 秒/km → m'ss"
  const paceLabel = r.avgPaceSec > 0
    ? `${Math.floor(r.avgPaceSec / 60)}'${String(Math.round(r.avgPaceSec % 60)).padStart(2, '0')}"`
    : '--';
  // 本週總時間 秒 → 分鐘
  const totalMin = Math.round((r.totalDuration || 0) / 60);

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col"
      style={{ background: CARBON, transform: `translate(${bo.x}px,${bo.y}px)` }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.5 }} />

      {/* 頂部刊頭 */}
      <div className="relative z-10 px-6 flex justify-between items-start"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 40px) + 18px)' }}>
        <div>
          <p style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 22, color: SMOKE, lineHeight: 1 }}>
            Mileage
          </p>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.28em', marginTop: 4 }}>
            CARDIO · 05
          </p>
        </div>
        <div className="text-right">
          <p style={{ fontFamily: FONT_HAND, fontSize: 20, color: ORANGE, fontStyle: 'italic', lineHeight: 1, transform: 'rotate(-2deg)', display: 'inline-block' }}>
            every mile, this week.
          </p>
        </div>
      </div>

      {/* 中央錶盤 — 本週跑步距離 */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="relative" style={{ width: '92%', maxWidth: 340, aspectRatio: '1/1' }}>
          <CoutureWatchFace distanceKm={r.totalDistance} goalKm={20} />
          <div className="absolute" style={{ top: -8, left: -4 }}>
            <HandStar size={14} color={ORANGE} rotate={20} />
          </div>
          <div className="absolute" style={{ bottom: 8, right: -6 }}>
            <HandStar size={12} color={SILVER} rotate={-30} />
          </div>
        </div>
      </div>

      {/* 底部 — 三欄：平均配速、跑步次數、今日步數 */}
      <div className="relative z-10 px-6 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 56px)', borderTop: `1px solid ${SMOKE_GHOST}` }}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { l: 'AVG PACE', v: paceLabel, u: '/ km' },
            { l: 'RUNS', v: r.totalRuns || 0, u: `· ${totalMin} min` },
            {
              l: 'STEPS · TODAY',
              v: todaySteps == null ? '--' : todaySteps.toLocaleString('en-US'),
              u: todaySteps == null ? 'iPhone' : 'steps',
            },
          ].map((item, i) => (
            <div key={i} style={{
              borderLeft: i > 0 ? `1px solid ${SMOKE_GHOST}` : 'none',
              paddingLeft: i > 0 ? 12 : 0,
            }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.18em' }}>{item.l}</p>
              <div className="flex items-baseline gap-1 mt-1.5">
                <p style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 24, color: SMOKE, lineHeight: 1 }}>
                  {item.v}
                </p>
              </div>
              <p className="mt-1" style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.12em' }}>
                {item.u}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   SLIDE 4 — QuoteMagazine
   圖二+圖四靈感：雜誌封面式名言 + 今日營養
══════════════════════════════════════ */
function QuoteMagazine({ d, q, bo }) {
  const { nutritionData: n } = d;

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col"
      style={{ background: CARBON, transform: `translate(${bo.x}px,${bo.y}px)` }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.5 }} />

      {/* 頂部 — 雜誌標題 */}
      <div className="relative z-10 px-6 flex justify-between items-start"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 40px) + 18px)' }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.32em' }}>
          TIPS · FOR · ATHLETES
        </p>
      </div>

      {/* 中央 — 圖四式排版：襯線 + 圈圈 + 手寫副標 */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6">

        {/* 編輯星標點綴 */}
        <div className="mb-3 ml-1">
          <EditorialAsterisk size={20} color={ORANGE} />
        </div>

        {/* 名言 — 完整一句、滿版襯線大字 + 底線 */}
        <div className="relative inline-block self-start">
          <h1 style={{
            fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500,
            fontSize: 'clamp(34px, 9vw, 58px)', lineHeight: 1.12,
            color: SMOKE, letterSpacing: '-0.025em',
          }}>
            「{q.text}」
          </h1>
          <div className="absolute" style={{ bottom: -2, left: 0, width: '58%', height: 10 }}>
            <HandUnderline color={ORANGE} strokeWidth={2.8} opacity={0.9} />
          </div>
        </div>

        {/* 手寫作者 — 圖四「Designer Edition」靈感 */}
        <div className="mt-6 flex items-center gap-3">
          <HandArrow color={SMOKE_DIM} size={18} />
          <p style={{
            fontFamily: FONT_HAND, fontSize: 26, color: SILVER, fontStyle: 'italic',
            transform: 'rotate(-2deg)', display: 'inline-block', lineHeight: 1,
          }}>
            — {q.author}.
          </p>
        </div>

        {/* 散落點綴 */}
        <div className="absolute" style={{ top: '15%', right: 24 }}>
          <HandStar size={14} color={ORANGE} rotate={15} />
        </div>
        <div className="absolute" style={{ top: '35%', right: 12 }}>
          <HandStar size={9} color={SILVER} rotate={-25} />
        </div>
      </div>

      {/* 底部 — 今日營養（一頁一概念：飲食攝取，最多 3 個數據） */}
      <div className="relative z-10 px-6 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 56px)', borderTop: `1px solid ${SMOKE_GHOST}` }}>
        <p className="mb-3" style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.28em' }}>
          TODAY'S INTAKE
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { l: 'CALORIES', v: (n?.calories || 0).toLocaleString(), u: `/ ${(n?.calorieGoal || 0).toLocaleString()} kcal`, accent: true },
            { l: 'PROTEIN',  v: `${n?.protein || 0}`, u: 'g' },
            { l: 'WATER',    v: `${n?.water || 0}`, u: 'ml' },
          ].map((item, i) => (
            <div key={i} style={{
              borderLeft: i > 0 ? `1px solid ${SMOKE_GHOST}` : 'none',
              paddingLeft: i > 0 ? 14 : 0,
            }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_MUTE, letterSpacing: '0.2em' }}>
                {item.l}
              </p>
              <p className="mt-1.5" style={{
                fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 28,
                color: item.accent ? ORANGE : SMOKE, lineHeight: 1,
              }}>
                {item.v}
              </p>
              <p className="mt-1" style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.12em' }}>
                {item.u}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   SLIDE 6 — PortraitFeature · 人像專題封面
   純封面：人像 + 今日大日期 + 名言（不放重複數據）
══════════════════════════════════════ */
function PortraitFeature({ q, bo }) {
  const today = new Date();
  const dd = today.getDate().toString().padStart(2, '0');
  const mon = today.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const year = today.getFullYear();

  return (
    <div className="relative w-full h-full overflow-hidden"
      style={{ background: CARBON, transform: `translate(${bo.x}px,${bo.y}px)` }}>

      {/* 全版人像 + 灰階 + 暗化 */}
      <img loading="lazy" decoding="async"
        src="/desktop/331.jpeg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'grayscale(0.9) brightness(0.85) contrast(1.15)' }}
      />
      <div className="absolute inset-0" style={{
        background: `linear-gradient(180deg, rgba(32,32,32,0.7) 0%, rgba(32,32,32,0.35) 35%, rgba(32,32,32,0.85) 75%, ${CARBON} 100%)`,
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.55 }} />

      {/* 頂部 — 雜誌刊頭 */}
      <div className="absolute left-0 right-0 z-10 px-6 flex justify-between items-start"
        style={{ top: 'calc(env(safe-area-inset-top, 40px) + 18px)' }}>
        <div>
          <p style={{ fontFamily: FONT_SANS, fontWeight: 900, fontSize: 24, color: SMOKE, letterSpacing: '-0.04em', lineHeight: 1 }}>
            DRVN<span style={{ color: ORANGE }}>.</span>
          </p>
          <p className="mt-1" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 13, color: SILVER }}>
            An urban edition.
          </p>
        </div>
        <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.22em', textAlign: 'right', lineHeight: 1.5 }}>
          ISSUE Nº 05<br />
          {mon} {year}
        </p>
      </div>

      {/* 中央 — 圖一「03」式巨大數字 + 手繪標記 */}
      <div className="absolute z-10" style={{ left: 20, top: '35%' }}>
        <div className="relative">
          <p style={{
            fontFamily: FONT_SANS, fontWeight: 900,
            fontSize: 'clamp(140px, 42vw, 220px)', lineHeight: 0.82,
            color: SMOKE, letterSpacing: '-0.07em',
          }}>
            {dd}
          </p>
          {/* 手繪底線 */}
          <div className="absolute" style={{ bottom: 6, left: 0, width: '90%', height: 14 }}>
            <HandUnderline color={ORANGE} strokeWidth={3.2} opacity={0.95} />
          </div>
        </div>
        <p className="mt-2" style={{
          fontFamily: FONT_HAND, fontSize: 22, color: SILVER, fontStyle: 'italic',
          transform: 'rotate(-3deg)', display: 'inline-block', lineHeight: 1,
        }}>
          a city day.
        </p>
      </div>

      {/* 右側散落星 */}
      <div className="absolute z-10" style={{ top: '38%', right: 20 }}>
        <HandStar size={16} color={ORANGE} rotate={18} />
      </div>
      <div className="absolute z-10" style={{ top: '46%', right: 38 }}>
        <HandStar size={10} color={SILVER} rotate={-20} />
      </div>

      {/* 底部 — 純封面：引言名言（不放重複數據） */}
      <div className="absolute left-0 right-0 bottom-0 z-10 px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 60px)' }}>

        {/* 細線（無 QUOTE 小標） */}
        <div className="flex items-center gap-3 mb-4">
          <span style={{ width: 28, height: 1.5, background: ORANGE, display: 'block' }} />
        </div>

        {/* 名言大標題 — 完整一句、滿版 */}
        <div className="relative inline-block">
          <h2 style={{
            fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500,
            fontSize: 'clamp(30px, 8.5vw, 46px)', lineHeight: 1.14,
            color: SMOKE, letterSpacing: '-0.02em',
          }}>
            「{q.text}」
          </h2>
          <div className="absolute" style={{ bottom: -4, left: 0, width: '52%', height: 9 }}>
            <HandUnderline color={ORANGE} strokeWidth={2.6} opacity={0.9} />
          </div>
        </div>

        {/* 手寫作者 */}
        <p className="mt-4" style={{
          fontFamily: FONT_HAND, fontSize: 22, color: SILVER, fontStyle: 'italic',
          transform: 'rotate(-2deg)', display: 'inline-block', lineHeight: 1,
        }}>
          — {q.author}.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   底部互動提示 — 連點兩下解鎖
══════════════════════════════════════ */
function TapToContinue({ armed = false }) {
  return (
    <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
      <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
        <path d="M2 12 L11 2 L20 12" stroke={SMOKE_DIM}
          strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ animation: 'chevFloat 1.8s ease-in-out infinite' }} />
      </svg>
      <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: SMOKE_DIM, letterSpacing: '0.32em' }}>
        {armed ? 'TAP AGAIN TO UNLOCK' : 'DOUBLE-TAP TO UNLOCK'}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════
   迷你時鐘 — 右上角
══════════════════════════════════════ */
function MiniClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const hh = t.getHours().toString().padStart(2, '0');
  const mm = t.getMinutes().toString().padStart(2, '0');
  return (
    <p style={{
      fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 400,
      fontSize: 17, letterSpacing: '0.02em', color: SMOKE, opacity: 0.75, lineHeight: 1,
    }}>
      {hh}<span className="animate-pulse" style={{ opacity: 0.55 }}>:</span>{mm}
    </p>
  );
}

/* ══════════════════════════════════════
   IDLE TRIGGER — 30 秒無互動自動進入
══════════════════════════════════════ */
/* useStandbyTrigger 已搬到 hooks/useStandbyTrigger.js ——
   hook 留在這裡會逼 App.jsx 靜態 import 整支檔案（1,219 行 / 約 53 KB）
   而待機畫面其實只在閒置 3 分鐘後才需要。這裡保留 re-export 供既有呼叫端使用。 */
export { useStandbyTrigger, STANDBY_IDLE_MS } from '../hooks/useStandbyTrigger';

/* ══════════════════════════════════════
   MAIN
══════════════════════════════════════ */
const SLIDE_DUR = 12000;
const BURN_MS = 3 * 60 * 1000;
const BURN_PX = 6;
// 一頁一概念：S1 身體組成(InBody) / S2 訓練節奏 / S3 目標進度 / S4 名言+營養 / S5 本週跑步 / S6 封面
// ⚠️ 不放任何依賴手錶的即時數據（心率/HRV/睡眠），全部改用 App 內真實紀錄。
const SLIDES = [BodyCompositionEditorial, TrainingRhythmPoster, GoalManifesto, QuoteMagazine, WatchFaceCouture, PortraitFeature];
const EXIT_DOUBLE_TAP_MS = 500;

export default function StandbyScreen({
  userId = 'user-001',
  onExit = () => { },
  isActiveWorkout = false,
}) {
  const [data, setData] = useState(null);
  const [cur, setCur] = useState(0);
  // 💬 語錄與 slide 脫鉤：語錄庫比頁數多，每次換頁順序輪播下一句（起點隨機）
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [fade, setFade] = useState(true);
  const [burn, setBurn] = useState({ x: 0, y: 0 });
  const [armed, setArmed] = useState(false);

  const lastTapRef = useRef(0);
  const armTimerRef = useRef(null);

  const handleScreenTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < EXIT_DOUBLE_TAP_MS) {
      clearTimeout(armTimerRef.current);
      lastTapRef.current = 0;
      setArmed(false);
      onExit();
    } else {
      lastTapRef.current = now;
      setArmed(true);

      setFade(false);
      setTimeout(() => {
        setCur(c => (c + 1) % SLIDES.length);
        setQuoteIdx(qi => (qi + 1) % QUOTES.length);
        setFade(true);
      }, 320);

      clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => {
        setArmed(false);
        lastTapRef.current = 0;
      }, EXIT_DOUBLE_TAP_MS);
    }
  }, [onExit]);

  useEffect(() => () => clearTimeout(armTimerRef.current), []);
  useEffect(() => { fetchUserData(userId).then(setData); }, [userId]);

  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCur(p => (p + 1) % SLIDES.length);
        setQuoteIdx(qi => (qi + 1) % QUOTES.length);
        setFade(true);
      }, 380);
    }, SLIDE_DUR);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setBurn({
      x: Math.round((Math.random() - .5) * 2 * BURN_PX),
      y: Math.round((Math.random() - .5) * 2 * BURN_PX),
    }), BURN_MS);
    return () => clearInterval(id);
  }, []);

  if (isActiveWorkout) return null;

  if (!data) return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: CARBON }}>
      <div className="w-5 h-5 rounded-full border" style={{
        borderColor: SMOKE_GHOST, borderTopColor: ORANGE,
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const Slide = SLIDES[cur];
  const quote = QUOTES[quoteIdx % QUOTES.length];

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: CARBON, touchAction: 'none', zIndex: 2147483000, cursor: 'pointer' }}
      onClick={handleScreenTap}
      onTouchEnd={e => { e.preventDefault(); handleScreenTap(); }}
    >
      {/* 字體載入 — Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=JetBrains+Mono:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      {/* 迷你時鐘 — 右上 */}
      <div className="absolute right-5 z-50"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          transform: `translate(${burn.x}px,${burn.y}px)`,
        }}>
        <MiniClock />
      </div>

      {/* 當前 slide */}
      <div className="absolute inset-0" style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.42s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <Slide d={data} q={quote} bo={burn} />
      </div>

      {/* 底部提示 */}
      <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center pt-10"
        style={{
          background: 'none',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 26px)',
          transform: `translate(${burn.x}px,${burn.y}px)`,
        }}>
        <TapToContinue armed={armed} />
      </div>

      {/* 進度指示點 */}
      <div className="absolute left-0 right-0 z-40 flex justify-center gap-[5px]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        {SLIDES.map((_, i) => (
          <div key={i} style={{
            width: i === cur ? 18 : 4, height: 2.5, borderRadius: 2,
            background: i === cur ? ORANGE : SMOKE_GHOST,
            transition: 'width 0.4s ease, background 0.4s ease',
          }} />
        ))}
      </div>

      <style>{`
        @keyframes chevFloat { 0%,100% { transform: translateY(0); opacity: 0.55 } 50% { transform: translateY(-3px); opacity: 1 } }
      `}</style>
    </div>
  );
}

/*
 * ── 使用範例 ───────────────────────────────────────
 *
 * import StandbyScreen, { useStandbyTrigger } from './StandbyScreen';
 *
 * function App() {
 *   const [showStandby, setShowStandby] = useState(false);
 *   const isRunning = useSelector(s => s.workout.isActive);
 *
 *   useStandbyTrigger({
 *     isActiveWorkout: isRunning,
 *     onStandby: () => setShowStandby(true),
 *   });
 *
 *   return (
 *     <>
 *       <YourMainApp />
 *       {showStandby && (
 *         <StandbyScreen
 *           userId={user.id}
 *           isActiveWorkout={isRunning}
 *           onExit={() => setShowStandby(false)}
 *         />
 *       )}
 *     </>
 *   );
 * }
 */
