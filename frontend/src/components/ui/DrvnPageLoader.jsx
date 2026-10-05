/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DrvnPageLoader — 全站統一整頁載入動畫（單一真相源）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 為什麼要有這支：
 *   之前每個頁面各自寫 `LOADING...` / `Loading...` / spinner，
 *   字體、顏色、節奏全都不一樣 —— 使用者在頁面之間切換時會看到
 *   四五種不同的等待畫面，整個 app 的「臉」在載入這一刻就破了。
 *   從此所有整頁等待畫面一律用這支。
 *
 * 設計語言（對齊 final-drvn-design-system）：
 *   · 瑞士編輯風：uppercase kicker + tracking，資訊只有一行
 *   · 一條 Coral 掃描線（不是轉圈圈）— 呼應 app 的量測/數據感
 *   · 三顆節拍點：把「等待」變成有節奏的呼吸，而不是凍住
 *   · 深淺兩種主題：深色沉浸頁用 dark、紙感頁用 light
 *
 * 用法：
 *   if (loading) return <DrvnPageLoader label="INBODY" caption="讀取身體組成…" />;
 *   <DrvnPageLoader theme="light" inline />   // 卡片內嵌用
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React from 'react';

const THEMES = {
    dark: {
        bg: '#161415',
        text: 'rgba(255,255,255,0.92)',
        sub: 'rgba(255,255,255,0.38)',
        track: 'rgba(255,255,255,0.10)',
        dot: 'rgba(255,255,255,0.55)',
    },
    light: {
        bg: '#F6F4F1',
        text: '#161415',
        sub: 'rgba(22,20,21,0.40)',
        track: 'rgba(22,20,21,0.08)',
        dot: 'rgba(22,20,21,0.45)',
    },
};

const CORAL = '#F95C4B';

const LOADER_CSS = `
@keyframes drvn-scan {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes drvn-beat {
  0%, 100% { opacity: 0.25; transform: scale(0.82); }
  40%      { opacity: 1;    transform: scale(1); }
}
@keyframes drvn-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.drvn-loader__scan {
  /* 連續掃描用 linear —— house 曲線會在兩端「煞車」，
     在無限循環的掃描線上看起來像卡頓而不是勻速量測。
     這是 Definition §2.1 的合理例外：非進場動畫、非位移動畫。 */
  position: absolute; inset: 0;
  animation: drvn-scan 1.5s linear infinite;
  will-change: transform;
}
.drvn-loader__dot {
  width: 4px; height: 4px; border-radius: 50%;
  animation: drvn-beat 1.4s ease-in-out infinite;
  will-change: opacity, transform;
}
.drvn-loader__in { animation: drvn-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .drvn-loader__scan, .drvn-loader__dot, .drvn-loader__in { animation: none !important; }
  .drvn-loader__scan { transform: none; opacity: 0.6; }
  .drvn-loader__dot  { opacity: 0.6; }
}
`;

/**
 * @param {string}  label    大標 kicker（英文、uppercase）— 讓使用者知道在等什麼
 * @param {string}  caption  中文副標，一句話說明；可省略
 * @param {'dark'|'light'} theme
 * @param {boolean} inline   true = 只佔滿父容器（卡片內用），false = 整頁
 */
export const DrvnPageLoader = ({
    label = 'DRVN',
    caption = '',
    theme = 'dark',
    inline = false,
}) => {
    const t = THEMES[theme] || THEMES.dark;

    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            style={{
                minHeight: inline ? 180 : '100dvh',   /* dvh：iOS 網址列伸縮不跳動（Definition §1.5） */
                width: '100%',
                background: inline ? 'transparent' : t.bg,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 18,
                padding: 24,
            }}
        >
            <style>{LOADER_CSS}</style>

            <div className="drvn-loader__in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', maxWidth: 240 }}>
                {/* Kicker */}
                <p style={{
                    margin: 0,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.42em',
                    textIndent: '0.42em',
                    textTransform: 'uppercase',
                    color: t.text,
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}>
                    {label}
                </p>

                {/* Coral 掃描線 — 取代轉圈圈，呼應量測/數據感 */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: 1.5,
                    background: t.track,
                    overflow: 'hidden',
                    borderRadius: 2,
                }}>
                    <div className="drvn-loader__scan">
                        <div style={{
                            width: '100%',
                            height: '100%',
                            background: `linear-gradient(90deg, transparent 0%, ${CORAL}00 15%, ${CORAL}CC 50%, ${CORAL}00 85%, transparent 100%)`,
                        }} />
                    </div>
                </div>

                {/* 三顆節拍點 */}
                <div style={{ display: 'flex', gap: 6 }}>
                    {[0, 1, 2].map(i => (
                        <span
                            key={i}
                            className="drvn-loader__dot"
                            style={{ background: i === 1 ? CORAL : t.dot, animationDelay: `${i * 0.16}s` }}
                        />
                    ))}
                </div>

                {caption ? (
                    <p style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        color: t.sub,
                        textAlign: 'center',
                        fontFamily: "'Noto Sans TC', sans-serif",
                    }}>
                        {caption}
                    </p>
                ) : null}
            </div>
        </div>
    );
};

export default DrvnPageLoader;
