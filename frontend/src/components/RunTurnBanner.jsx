import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { bannerTextFor } from '../utils/routeNavigation';

/* ════════════════════════════════════════════════════════════════════
   RunTurnBanner — 跑步中的路口提示（Google Maps 風格 / DRVN 材質）

   來源：使用者在「路線探索」畫的路線 → routeNavigation 幾何解算。
   沒有街道資料，所以講的是「300 公尺後 右轉」而不是街名 —
   對跑者來說這反而更好用：眼睛不用離開路面太久。

   狀態：
     · 正常  → 深色 Liquid Glass，轉彎箭頭 + 距離倒數 + 下一個路口預告
     · 接近  → 距離 < 50m 時整張卡點亮、箭頭脈動
     · 偏離  → 轉珊瑚色警示，直接告訴你偏了多遠
     · 抵達  → 綠色完成態
   ════════════════════════════════════════════════════════════════ */

const ARROW_PATHS = {
    // 直行
    up: 'M12 20V5M12 5l-5 5M12 5l5 5',
    // 右轉
    right: 'M7 20v-7a4 4 0 0 1 4-4h6M17 9l-4-4M17 9l-4 4',
    left: 'M17 20v-7a4 4 0 0 0-4-4H7M7 9l4-4M7 9l4 4',
    'slight-right': 'M8 20v-5a5 5 0 0 1 2-4l5-4M15 7h3v3',
    'slight-left': 'M16 20v-5a5 5 0 0 0-2-4L9 7M9 7H6v3',
    'sharp-right': 'M8 20V12M8 12a4 4 0 0 1 4-4h5M17 8l-4-3.5M17 8l-4 3.5',
    'sharp-left': 'M16 20V12M16 12a4 4 0 0 0-4-4H7M7 8l4-3.5M7 8l4 3.5',
    uturn: 'M8 20V11a4 4 0 0 1 8 0v3M16 14l-2.5-2.5M16 14l2.5-2.5',
    flag: 'M6 21V4M6 4h11l-2 3.5L17 11H6',
};

const TurnArrow = ({ icon, size = 26, color = '#F6F4F1', strokeWidth = 2.2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d={ARROW_PATHS[icon] || ARROW_PATHS.up} />
    </svg>
);

const fmtRemaining = (m) => {
    if (m == null) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
};

const RunTurnBanner = ({ nav, routeName, onDismiss }) => {
    if (!nav?.current) return null;

    const { current, next, distanceToTurnM, remainingM, offRoute, offRouteM, progress } = nav;
    const arriving = current.type.id === 'arrive';
    const imminent = !offRoute && distanceToTurnM != null && distanceToTurnM < 50;
    const arrived = arriving && distanceToTurnM < 25;

    // 狀態配色
    const accent = offRoute ? '#F95C4B' : arrived ? '#7BD3A5' : imminent ? '#FFB4A2' : '#F6F4F1';
    const tileBg = offRoute
        ? 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)'
        : arrived
            ? 'linear-gradient(135deg, #7BD3A5 0%, #4EA87C 100%)'
            : imminent
                ? 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)'
                : 'rgba(255,255,255,0.10)';

    // Apple Maps 式樣的兩行文案（距離 / 完整指令句）— 由 routeNavigation 統一產生
    const text = bannerTextFor(current, distanceToTurnM);

    return (
        <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="pointer-events-auto relative overflow-hidden"
            style={{
                borderRadius: 24,
                background: offRoute
                    ? 'linear-gradient(180deg, rgba(90,28,22,0.72) 0%, rgba(48,16,13,0.80) 100%)'
                    : 'linear-gradient(180deg, rgba(44,40,42,0.62) 0%, rgba(20,18,19,0.72) 100%)',
                backdropFilter: 'blur(34px) saturate(180%)',
                WebkitBackdropFilter: 'blur(34px) saturate(180%)',
                border: `1px solid ${offRoute ? 'rgba(249,92,75,0.45)' : 'rgba(255,255,255,0.18)'}`,
                boxShadow: [
                    'inset 0 1px 1px rgba(255,255,255,0.26)',
                    'inset 0 -1px 1px rgba(0,0,0,0.25)',
                    '0 12px 34px rgba(0,0,0,0.34)',
                ].join(', '),
            }}
        >
            {/* 接近路口 → 整條卡的呼吸暈光 */}
            {imminent && !arrived && (
                <motion.span
                    className="absolute inset-0 pointer-events-none"
                    animate={{ opacity: [0.25, 0.6, 0.25] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ background: 'radial-gradient(70% 120% at 14% 50%, rgba(249,92,75,0.35) 0%, transparent 70%)' }}
                />
            )}

            {/* ══ Apple Maps 式樣：左邊大轉向圖示、右邊第一行大距離、第二行完整指令句 ══ */}
            <div className="relative flex items-start gap-4 px-4 pt-4 pb-3">
                {/* 轉彎圖示 —— 放大到 Apple Maps 的尺度，跑步中只用餘光就看得到 */}
                <motion.div
                    className="shrink-0 flex items-center justify-center"
                    animate={imminent && !arrived ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: 54, height: 54 }}
                >
                    <TurnArrow
                        icon={offRoute ? 'uturn' : current.type.icon}
                        size={50}
                        color={offRoute ? '#FFB4A2' : arrived ? '#7BD3A5' : '#FFFFFF'}
                        strokeWidth={2}
                    />
                </motion.div>

                {/* 主文案：距離在上（大），完整句子在下 */}
                <div className="flex-1 min-w-0 pt-0.5">
                    {offRoute ? (
                        <>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[34px] font-normal leading-none tabular-nums" style={{ color: '#FFB4A2', letterSpacing: '-0.02em' }}>
                                    {Math.round(offRouteM)}
                                </span>
                                <span className="text-[17px] font-normal" style={{ color: 'rgba(255,180,162,0.75)' }}>公尺</span>
                            </div>
                            <div className="text-[17px] font-normal leading-snug mt-1" style={{ color: '#F6F4F1' }}>
                                偏離路線，往回走回到路線上
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-baseline gap-1.5">
                                <motion.span
                                    key={text.distanceText}
                                    initial={{ opacity: 0.35, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-[34px] font-normal leading-none tabular-nums"
                                    style={{ color: accent, letterSpacing: '-0.02em' }}
                                >
                                    {text.distanceText}
                                </motion.span>
                                {text.unit && (
                                    <span className="text-[17px] font-normal" style={{ color: 'rgba(246,244,241,0.66)' }}>
                                        {text.unit}
                                    </span>
                                )}
                            </div>
                            <div className="text-[17px] font-normal leading-snug mt-1" style={{ color: '#F6F4F1' }}>
                                {text.sentence}
                            </div>
                        </>
                    )}
                </div>

                {/* 下一個路口預告 */}
                {!offRoute && next && !arrived && (
                    <div className="shrink-0 flex flex-col items-center gap-1 pl-3 pt-1"
                        style={{ borderLeft: '1px solid rgba(255,255,255,0.12)' }}>
                        <span className="text-[12px] font-black tracking-[0.18em]" style={{ color: 'rgba(246,244,241,0.38)' }}>
                            接著
                        </span>
                        <TurnArrow icon={next.type.icon} size={20} color="rgba(246,244,241,0.66)" strokeWidth={2.2} />
                    </div>
                )}
            </div>

            {/* 路線進度 + 剩餘距離 */}
            <div className="relative px-4 pb-3">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
                    <motion.div
                        className="h-full rounded-full"
                        animate={{ width: `${Math.round((progress || 0) * 100)}%` }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            background: offRoute
                                ? 'linear-gradient(90deg, #F95C4B, #FFB4A2)'
                                : 'linear-gradient(90deg, #F6F4F1, rgba(246,244,241,0.55))',
                        }}
                    />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[12px] font-black tracking-[0.16em] truncate max-w-[55%]"
                        style={{ color: 'rgba(246,244,241,0.42)' }}>
                        {routeName || '自訂路線'}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(246,244,241,0.55)' }}>
                        剩 {fmtRemaining(remainingM)}
                    </span>
                </div>
            </div>

            {/* 收起 */}
            {onDismiss && (
                <motion.button {...pressProps('icon')}
 onClick={onDismiss}
 aria-label="關閉路線導航"
 className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
 style={{ background: 'rgba(255,255,255,0.10)' }}
 >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(246,244,241,0.7)" strokeWidth="3" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </motion.button>
            )}
        </motion.div>
    );
};

export const RunTurnBannerHost = ({ show, ...props }) => (
    <AnimatePresence>{show ? <RunTurnBanner key="turn" {...props} /> : null}</AnimatePresence>
);

export default RunTurnBanner;
