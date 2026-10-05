/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SkeletonLoader — 漸進式骨架屏元件庫
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 設計原則：
 *   1. 骨架積木（Atoms）：SkeletonBlock, SkeletonText, SkeletonAvatar, SkeletonStat
 *   2. 頁面骨架（Templates）：每個主要頁面一個專用版型
 *   3. 呼吸燈動畫：純 CSS keyframes，GPU 加速，不影響 Layout
 *   4. 固定尺寸：與真實內容一致，防止 Layout Shift
 *
 * 顏色系統（對應 app 深色主題）：
 *   --sk-base:    #262523  (卡片底色)
 *   --sk-shine:   #2E2C2A  (高光掃過色)
 *   --sk-radius:  12px
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../../utils/nutritionMotion';

/* ─── 全域 CSS（Pulse 動畫）─── */
const SKELETON_STYLES = `
  @keyframes sk-pulse {
    0%   { opacity: 1; }
    50%  { opacity: 0.45; }
    100% { opacity: 1; }
  }
  @keyframes sk-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  .sk-pulse {
    animation: sk-pulse 1.6s ease-in-out infinite;
    will-change: opacity;
  }
  .sk-shimmer {
    background: linear-gradient(
      90deg,
      #262523 25%,
      #2E2C2A 50%,
      #262523 75%
    );
    background-size: 800px 100%;
    animation: sk-shimmer 1.6s linear infinite;
    will-change: background-position;
  }
`;

/** 注入樣式（只執行一次）*/
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const tag = document.createElement('style');
  tag.textContent = SKELETON_STYLES;
  document.head.appendChild(tag);
}
injectStyles();

/* ═══════════════════════════════════════════════════════
   ① ATOMS — 基礎積木元件
═══════════════════════════════════════════════════════ */

/**
 * SkeletonBlock — 通用矩形佔位符
 * @param {{ w?, h?, radius?, className?, style?, shimmer? }} props
 */
export const SkeletonBlock = ({
  w = '100%',
  h = 16,
  radius = 10,
  className = '',
  style = {},
  shimmer = false,
}) => (
  <div
    className={shimmer ? `sk-shimmer ${className}` : `sk-pulse ${className}`}
    style={{
      width: w,
      height: h,
      borderRadius: radius,
      background: shimmer ? undefined : '#262523',
      flexShrink: 0,
      ...style,
    }}
  />
);

/**
 * SkeletonText — 文字行佔位符（可多行）
 */
export const SkeletonText = ({ lines = 1, w = '100%', lineH = 14, gap = 8, lastW = '70%' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBlock
        key={i}
        w={i === lines - 1 && lines > 1 ? lastW : w}
        h={lineH}
        radius={6}
      />
    ))}
  </div>
);

/**
 * SkeletonAvatar — 圓形頭像佔位符
 */
export const SkeletonAvatar = ({ size = 44 }) => (
  <SkeletonBlock w={size} h={size} radius={size / 2} />
);

/**
 * SkeletonStat — 統計數字卡佔位符（大數字 + 標籤）
 */
export const SkeletonStat = ({ w = 80, compact = false }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: w }}>
    <SkeletonBlock w="60%" h={compact ? 22 : 28} radius={6} />
    <SkeletonBlock w="80%" h={10} radius={4} />
  </div>
);

/**
 * SkeletonCard — 帶圓角邊框的卡片容器
 */
export const SkeletonCard = ({ children, h, radius = 16, style = {} }) => (
  <div
    style={{
      background: '#1C1A19',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: radius,
      padding: 16,
      minHeight: h,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * SkeletonBadge — 小標籤佔位符
 */
export const SkeletonBadge = ({ w = 60 }) => (
  <SkeletonBlock w={w} h={22} radius={11} />
);

/* ═══════════════════════════════════════════════════════
   ② PAGE SKELETONS — 頁面級骨架版型
═══════════════════════════════════════════════════════ */

const Row = ({ children, gap = 12, align = 'center' }) => (
  <div style={{ display: 'flex', gap, alignItems: align }}>{children}</div>
);
const Col = ({ children, gap = 12, flex }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, flex }}>{children}</div>
);
const Spacer = ({ h }) => <div style={{ height: h }} />;

/* ── 1. Dashboard（主頁）骨架 ── */
export const DashboardSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    {/* 頂部 Header */}
    <Spacer h={20} />
    <Row gap={12} align="center">
      <SkeletonAvatar size={42} />
      <Col gap={6} flex={1}>
        <SkeletonBlock w="55%" h={13} radius={6} />
        <SkeletonBlock w="35%" h={10} radius={4} />
      </Col>
      <SkeletonBlock w={36} h={36} radius={18} />
    </Row>

    <Spacer h={24} />

    {/* 主 Hero 卡 */}
    <SkeletonCard h={160} radius={20}>
      <Col gap={10}>
        <Row gap={8}>
          <SkeletonBadge w={70} />
          <SkeletonBadge w={50} />
        </Row>
        <SkeletonBlock w="75%" h={26} radius={8} />
        <SkeletonText lines={2} lineH={12} lastW="55%" />
        <Spacer h={8} />
        <SkeletonBlock w={120} h={38} radius={19} />
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 今日統計列 */}
    <SkeletonCard h={80} radius={16}>
      <Row gap={0} align="center">
        {[1, 2, 3].map((i) => (
          <React.Fragment key={i}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <SkeletonStat compact />
            </div>
            {i < 3 && (
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.06)' }} />
            )}
          </React.Fragment>
        ))}
      </Row>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 快速行動按鈕列 */}
    <Row gap={10}>
      {[1, 2, 3].map((i) => (
        <SkeletonCard key={i} h={72} radius={14} style={{ flex: 1, padding: 12 }}>
          <Col gap={8} align="center">
            <SkeletonBlock w={28} h={28} radius={14} />
            <SkeletonBlock w="70%" h={10} radius={4} />
          </Col>
        </SkeletonCard>
      ))}
    </Row>

    <Spacer h={14} />

    {/* 活動 Feed 卡片 */}
    {[1, 2].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={100} radius={16}>
          <Row gap={12} align="flex-start">
            <SkeletonBlock w={48} h={48} radius={12} />
            <Col gap={8} flex={1}>
              <SkeletonBlock w="60%" h={14} radius={6} />
              <SkeletonText lines={2} lineH={11} lastW="40%" />
              <SkeletonBadge w={55} />
            </Col>
          </Row>
        </SkeletonCard>
        <Spacer h={10} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 2. Training Record（訓練紀錄）骨架 ── */
export const TrainingRecordSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />
    {/* 搜尋欄 */}
    <SkeletonBlock w="100%" h={44} radius={22} />
    <Spacer h={14} />

    {/* 篩選 tag 列 */}
    <Row gap={8}>
      {[60, 80, 55, 70].map((w, i) => <SkeletonBadge key={i} w={w} />)}
    </Row>
    <Spacer h={14} />

    {/* 統計摘要卡 */}
    <SkeletonCard h={90} radius={16}>
      <Row gap={0} align="center">
        {[1, 2, 3, 4].map((i) => (
          <React.Fragment key={i}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <SkeletonStat compact w={60} />
            </div>
            {i < 4 && (
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.06)' }} />
            )}
          </React.Fragment>
        ))}
      </Row>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 記錄列表 */}
    {[1, 2, 3, 4, 5].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={88} radius={14}>
          <Row gap={12} align="center">
            <SkeletonBlock w={44} h={44} radius={12} />
            <Col gap={7} flex={1}>
              <SkeletonBlock w="55%" h={14} radius={6} />
              <SkeletonBlock w="70%" h={11} radius={4} />
              <Row gap={8}>
                <SkeletonBadge w={50} />
                <SkeletonBadge w={60} />
              </Row>
            </Col>
            <SkeletonBlock w={22} h={22} radius={11} />
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 3. Workout Plan（訓練計劃）骨架 ── */
export const WorkoutPlanSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />

    {/* 計劃標題區 */}
    <SkeletonCard h={120} radius={20}>
      <Col gap={10}>
        <SkeletonBadge w={80} />
        <SkeletonBlock w="70%" h={22} radius={8} />
        <SkeletonText lines={2} lineH={11} lastW="50%" />
        <Row gap={10}>
          <SkeletonStat compact w={70} />
          <SkeletonStat compact w={70} />
          <SkeletonStat compact w={70} />
        </Row>
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 週次選擇 tab */}
    <Row gap={8}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonBlock key={i} w={60} h={34} radius={17} />
      ))}
    </Row>

    <Spacer h={14} />

    {/* 訓練日卡片列表 */}
    {[1, 2, 3, 4, 5].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={100} radius={14}>
          <Row gap={14} align="center">
            <div style={{ width: 44, textAlign: 'center' }}>
              <SkeletonBlock w={28} h={28} radius={14} style={{ margin: '0 auto 6px' }} />
              <SkeletonBlock w={28} h={10} radius={4} style={{ margin: '0 auto' }} />
            </div>
            <Col gap={8} flex={1}>
              <SkeletonBlock w="60%" h={15} radius={6} />
              <Row gap={6}>
                {[45, 60, 55].map((w, j) => <SkeletonBadge key={j} w={w} />)}
              </Row>
              <SkeletonBlock w="80%" h={11} radius={4} />
            </Col>
            <SkeletonBlock w={36} h={36} radius={18} />
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 4. Cardio / Running（有氧訓練）骨架 ── */
export const CardioSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />

    {/* 地圖/路線圖佔位 */}
    <SkeletonBlock w="100%" h={200} radius={20} shimmer />
    <Spacer h={14} />

    {/* 核心指標列 */}
    <SkeletonCard h={100} radius={16}>
      <Row gap={0} align="center">
        {['距離', '配速', '時間', '心率'].map((_, i, arr) => (
          <React.Fragment key={i}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <SkeletonStat compact w={60} />
            </div>
            {i < arr.length - 1 && (
              <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.06)' }} />
            )}
          </React.Fragment>
        ))}
      </Row>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 心率區間圖 */}
    <SkeletonCard h={140} radius={16}>
      <Col gap={10}>
        <SkeletonBlock w="40%" h={14} radius={6} />
        <Row gap={4} align="flex-end" style={{ height: 80 }}>
          {[55, 80, 100, 70, 40, 60, 75].map((h, i) => (
            <div key={i} style={{ flex: 1 }}>
              <SkeletonBlock w="100%" h={`${h}%`} radius={4} />
            </div>
          ))}
        </Row>
        <Row gap={8}>
          {[1, 2, 3, 4, 5].map((i) => <SkeletonBadge key={i} w={36} />)}
        </Row>
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 歷史記錄 */}
    {[1, 2, 3].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={80} radius={14}>
          <Row gap={12} align="center">
            <SkeletonBlock w={40} h={40} radius={10} />
            <Col gap={6} flex={1}>
              <SkeletonBlock w="55%" h={13} radius={5} />
              <Row gap={6}>
                <SkeletonStat compact w={50} />
                <SkeletonStat compact w={50} />
                <SkeletonStat compact w={50} />
              </Row>
            </Col>
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 5. Progress（進度分析）骨架 ── */
export const ProgressSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />

    {/* 時間範圍 tabs */}
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {[50, 50, 50, 50].map((w, i) => (
        <SkeletonBlock key={i} w={w} h={30} radius={15} />
      ))}
    </Row>

    <Spacer h={16} />

    {/* 主趨勢折線圖 */}
    <SkeletonCard h={200} radius={18} style={{ padding: '16px' }}>
      <Col gap={12}>
        <SkeletonBlock w="45%" h={14} radius={6} />
        <SkeletonBlock w="100%" h={140} radius={8} shimmer />
        <Row gap={16} style={{ justifyContent: 'center' }}>
          {[1, 2, 3].map((i) => (
            <Row key={i} gap={6} align="center">
              <SkeletonBlock w={10} h={10} radius={5} />
              <SkeletonBlock w={40} h={10} radius={4} />
            </Row>
          ))}
        </Row>
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 肌群分析網格 */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} h={90} radius={14}>
          <Col gap={8}>
            <SkeletonBlock w="50%" h={11} radius={4} />
            <SkeletonBlock w="75%" h={22} radius={6} />
            <SkeletonBlock w="100%" h={6} radius={3} />
          </Col>
        </SkeletonCard>
      ))}
    </div>

    <Spacer h={14} />

    {/* InBody 分數環形圖佔位 */}
    <SkeletonCard h={160} radius={18}>
      <Row gap={16} align="center">
        <SkeletonBlock w={120} h={120} radius={60} />
        <Col gap={10} flex={1}>
          {[1, 2, 3, 4].map((i) => (
            <Row key={i} gap={8} align="center">
              <SkeletonBlock w={8} h={8} radius={4} />
              <Col gap={4} flex={1}>
                <SkeletonBlock w="60%" h={10} radius={4} />
                <SkeletonBlock w="90%" h={6} radius={3} />
              </Col>
            </Row>
          ))}
        </Col>
      </Row>
    </SkeletonCard>
  </div>
);

/* ── 6. Nutrition（營養）骨架 ── */
export const NutritionSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />

    {/* 今日熱量環形圖 */}
    <SkeletonCard h={180} radius={20}>
      <Row gap={20} align="center">
        <SkeletonBlock w={130} h={130} radius={65} shimmer />
        <Col gap={12} flex={1}>
          <SkeletonStat w={80} />
          {['碳水', '蛋白', '脂肪'].map((_, i) => (
            <Row key={i} gap={8} align="center">
              <SkeletonBlock w={10} h={10} radius={5} />
              <Col gap={3} flex={1}>
                <SkeletonBlock w="55%" h={11} radius={4} />
                <SkeletonBlock w="80%" h={6} radius={3} />
              </Col>
            </Row>
          ))}
        </Col>
      </Row>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 每餐記錄 */}
    {['早餐', '午餐', '晚餐', '點心'].map((_, i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={70} radius={14}>
          <Row gap={12} align="center">
            <SkeletonBlock w={36} h={36} radius={10} />
            <Col gap={6} flex={1}>
              <SkeletonBlock w="40%" h={13} radius={5} />
              <SkeletonBlock w="65%" h={10} radius={4} />
            </Col>
            <SkeletonBlock w={50} h={13} radius={5} />
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 7. Social / Community（社群）骨架 ── */
export const SocialSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />

    {/* 搜尋欄 */}
    <SkeletonBlock w="100%" h={44} radius={22} />
    <Spacer h={14} />

    {/* 分類 tabs */}
    <Row gap={8}>
      {[55, 70, 60, 65].map((w, i) => <SkeletonBlock key={i} w={w} h={32} radius={16} />)}
    </Row>
    <Spacer h={16} />

    {/* 貼文卡片 */}
    {[1, 2, 3].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={180} radius={16}>
          <Col gap={12}>
            <Row gap={10} align="center">
              <SkeletonAvatar size={40} />
              <Col gap={5} flex={1}>
                <SkeletonBlock w="45%" h={13} radius={5} />
                <SkeletonBlock w="30%" h={10} radius={4} />
              </Col>
              <SkeletonBlock w={24} h={24} radius={12} />
            </Row>
            <SkeletonBlock w="100%" h={100} radius={12} shimmer />
            <SkeletonText lines={2} lineH={11} lastW="45%" />
            <Row gap={16}>
              <SkeletonBadge w={50} />
              <SkeletonBadge w={50} />
              <SkeletonBadge w={50} />
            </Row>
          </Col>
        </SkeletonCard>
        <Spacer h={10} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 8. Weekly Recap（週報）骨架 ── */
export const WeeklyRecapSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />

    {/* 週摘要卡 */}
    <SkeletonCard h={140} radius={20}>
      <Col gap={12}>
        <SkeletonBlock w="40%" h={12} radius={5} />
        <SkeletonBlock w="65%" h={28} radius={8} />
        <Row gap={10}>
          {[1, 2, 3, 4].map((i) => <SkeletonStat key={i} compact w={60} />)}
        </Row>
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 活動日曆格 */}
    <SkeletonCard h={90} radius={16}>
      <Col gap={8}>
        <SkeletonBlock w="30%" h={11} radius={4} />
        <Row gap={6}>
          {['一', '二', '三', '四', '五', '六', '日'].map((_, i) => (
            <Col key={i} gap={4} align="center" flex={1}>
              <SkeletonBlock w={10} h={10} radius={3} />
              <SkeletonBlock w="80%" h={32} radius={8} />
            </Col>
          ))}
        </Row>
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* 圖表列 */}
    <SkeletonCard h={160} radius={16}>
      <Col gap={10}>
        <SkeletonBlock w="50%" h={14} radius={6} />
        <SkeletonBlock w="100%" h={110} radius={8} shimmer />
      </Col>
    </SkeletonCard>

    <Spacer h={14} />

    {/* AI 洞察列表 */}
    {[1, 2].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={80} radius={14}>
          <Row gap={12} align="center">
            <SkeletonBlock w={38} h={38} radius={10} />
            <Col gap={7} flex={1}>
              <SkeletonBlock w="55%" h={13} radius={5} />
              <SkeletonText lines={2} lineH={10} lastW="40%" />
            </Col>
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 9. Gym Bag / Gear（裝備清單）骨架 ── */
export const GymBagSkeleton = () => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />
    <SkeletonBlock w="55%" h={22} radius={8} />
    <Spacer h={6} />
    <SkeletonBlock w="40%" h={12} radius={5} />
    <Spacer h={20} />

    {/* 分類列 */}
    <Row gap={8}>
      {[60, 70, 55, 65, 50].map((w, i) => <SkeletonBadge key={i} w={w} />)}
    </Row>
    <Spacer h={16} />

    {[1, 2, 3, 4, 5, 6].map((i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={72} radius={14}>
          <Row gap={12} align="center">
            <SkeletonBlock w={46} h={46} radius={12} />
            <Col gap={6} flex={1}>
              <SkeletonBlock w="50%" h={14} radius={5} />
              <SkeletonBlock w="70%" h={11} radius={4} />
            </Col>
            <SkeletonBlock w={28} h={28} radius={14} />
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── 10. Generic List（通用列表）骨架 ── */
export const ListSkeleton = ({ count = 5 }) => (
  <div style={{ padding: '0 16px', maxWidth: 430, margin: '0 auto' }}>
    <Spacer h={20} />
    <SkeletonBlock w="50%" h={20} radius={8} />
    <Spacer h={16} />
    {Array.from({ length: count }).map((_, i) => (
      <React.Fragment key={i}>
        <SkeletonCard h={80} radius={14}>
          <Row gap={12} align="center">
            <SkeletonBlock w={44} h={44} radius={12} />
            <Col gap={8} flex={1}>
              <SkeletonBlock w="60%" h={14} radius={6} />
              <SkeletonText lines={2} lineH={10} lastW="40%" />
            </Col>
          </Row>
        </SkeletonCard>
        <Spacer h={8} />
      </React.Fragment>
    ))}
  </div>
);

/* ── Error State 元件 ── */
export const SkeletonError = ({ message = '載入失敗', onRetry }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      gap: 16,
    }}
  >
    <div style={{ fontSize: 40 }}>⚠️</div>
    <p style={{ color: '#CFC6B8', fontSize: 14, textAlign: 'center', margin: 0 }}>{message}</p>
    {onRetry && (
      <motion.button {...pressProps('row')}
 onClick={onRetry}
 style={{
 background: '#F95C4B',
 color: '#fff',
 border: 'none',
 borderRadius: 24,
 padding: '10px 24px',
 fontSize: 14,
 fontWeight: 700,
 cursor: 'pointer',
 letterSpacing: '0.05em',
 }}
 >
        重新載入
      </motion.button>
    )}
  </div>
);

/* ── Skeleton 類型 Map（供 PageSkeletonWrapper 使用）── */
export const SKELETON_MAP = {
  dashboard:      DashboardSkeleton,
  trainingRecord: TrainingRecordSkeleton,
  workoutPlan:    WorkoutPlanSkeleton,
  cardio:         CardioSkeleton,
  progress:       ProgressSkeleton,
  nutrition:      NutritionSkeleton,
  social:         SocialSkeleton,
  weeklyRecap:    WeeklyRecapSkeleton,
  gymBag:         GymBagSkeleton,
  list:           ListSkeleton,
};
