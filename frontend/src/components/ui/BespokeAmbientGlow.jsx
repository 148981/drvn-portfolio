import React from 'react';
import { motion, useTime, useTransform } from 'framer-motion';

/**
 * BespokeAmbientGlow — Ambient Gradient Loop (三色循環呼吸光)
 *
 * 設計語言（依產品設計總監回饋 · 2026-07 重寫）：
 *   ✗ 不是 RGB 那種很炫的燈效。
 *   ✓ 像 Apple / Nothing / Oura：非常慢、幾乎感覺不到在移動的「呼吸光」。
 *   ✓ 三盞光暈以 easeInOutSine 極慢起伏，主導色在三色之間輪替：
 *         Color1 → Color2 → Color3 → Color1（約 30 秒一圈）
 *     每個顏色停留 8–12 秒，過渡走 easeInOutSine（非線性、更自然）。
 *   ✓ 只在頁面上半（標題附近）發光，往下用 mask 乾淨淡出。
 *
 * 全天候三時段（依裝置時間自動切換）：
 *   🌅 Morning 06:00–10:00 — Gold #F8D36B / Sage Mint #C8E6C9 / Soft Coral #F88A73（健康・活力・開始）
 *   🌞 Day     10:00–18:00 — Coral #FF8A73 / Gold #FFD36B / Sky #BFE7FF（專注・訓練・能量）
 *   🌆 Evening 18:00–21:00 — 由活力過渡到放鬆（琥珀漸轉藍）
 *   🌙 Night   21:00–06:00 — Moon Blue #8DBEFF / Sage #9FD8B5 / Lavender #B8B4F7（恢復・平靜・睡眠）
 *
 * 亮度不等權（讓主光源自然浮現），Glow 走「陽光灑進來」而非「舞台燈」。
 * 教學模式進行中自動凍結（監聽 drvn:onboarding-state）。
 */

// 每色：[r,g,b, weight]  weight = 相對亮度（主光源=1.0）
const PALETTES = {
    // 🌅 Morning — Gold 主光源(100%) / Mint(85%) / Coral(90%)
    morning: {
        base: 'linear-gradient(115deg, rgba(248,211,107,0.34) 0%, rgba(200,230,201,0.26) 45%, rgba(248,138,115,0.30) 100%)',
        colors: [
            { rgb: [248, 211, 107], weight: 1.00 }, // Morning Gold
            { rgb: [200, 230, 201], weight: 0.85 }, // Sage Mint
            { rgb: [248, 138, 115], weight: 0.90 }, // Soft Coral
        ],
    },
    // 🌞 Day — 瑞士極簡冷調（2026-07 改版）：米色紙底太暖，白天光帶改走
    //    低飽和的 藍・綠・黃 三色，像北歐畫廊的自然天光，冷暖平衡不膩。
    //    🔵 Glacier Blue #A9C7DC（主光源・冷靜）
    //    🟢 Sage Green   #B7CCB2（自然・呼吸）
    //    🟡 Pale Straw   #E9D8A6（一抹麥稈黃收暖，避免整片偏冷）
    // 🌞 Day — 「日落雪酪」四色帶（2026-07 使用者指定色票）：
    //    #FF9A8B 珊瑚粉 → #FFC3A0 蜜桃 → #FECF6A 金黃 → #A1E3FF 天空藍
    //    底層光洗鋪滿四色漸層；三盞流動光暈取 珊瑚粉(主)/金黃/天空藍，
    //    蜜桃色由珊瑚與金黃交疊處自然融出。
    day: {
        base: 'linear-gradient(115deg, rgba(255,154,139,0.36) 0%, rgba(255,195,160,0.30) 34%, rgba(254,207,106,0.30) 62%, rgba(161,227,255,0.32) 100%)',
        colors: [
            { rgb: [255, 154, 139], weight: 1.00 }, // Coral Pink #FF9A8B（主光源）
            { rgb: [254, 207, 106], weight: 0.88 }, // Golden #FECF6A
            { rgb: [161, 227, 255], weight: 0.85 }, // Sky #A1E3FF
        ],
    },
    // 🌆 Evening — 「暮色雪酪」（2026-07 使用者指定）：
    //    左上一抹檸檬黃夕光 → 珊瑚粉霞 → 長春花藍紫暮色。
    //    主光源給長春花藍（入夜前的平靜），黃與粉作餘暉點綴。
    evening: {
        base: 'linear-gradient(160deg, rgba(255,240,170,0.34) 0%, rgba(240,160,140,0.32) 38%, rgba(183,166,232,0.30) 70%, rgba(140,152,240,0.36) 100%)',
        colors: [
            { rgb: [140, 152, 240], weight: 1.00 }, // 🔵 Periwinkle #8C98F0（主光源）
            { rgb: [240, 160, 140], weight: 0.92 }, // 🌸 Coral Dusk #F0A08C（霞粉）
            { rgb: [255, 240, 170], weight: 0.85 }, // 🍋 Lemon Glow #FFF0AA（殘照黃）
        ],
    },
    // 🌙 Night — 「極光雪酪」（2026-07 使用者指定，對照色票卡）：
    //    Tea Green #ECFFBE / Mauve #BCA4F5 / Sky Blue #81CFFF。
    //    主光源給 Mauve（夜的柔紫），天藍鋪冷底、茶綠當一抹微光。
    night: {
        base: 'linear-gradient(160deg, rgba(236,255,190,0.30) 0%, rgba(188,164,245,0.34) 45%, rgba(129,207,255,0.34) 100%)',
        colors: [
            { rgb: [188, 164, 245], weight: 1.00 }, // 💜 Mauve #BCA4F5（主光源）
            { rgb: [129, 207, 255], weight: 0.92 }, // 🔵 Sky Blue #81CFFF
            { rgb: [236, 255, 190], weight: 0.82 }, // 🍵 Tea Green #ECFFBE
        ],
    },
};

// 依小時決定時段
const paletteForHour = (h) => {
    if (h >= 6 && h < 10) return PALETTES.morning;
    if (h >= 10 && h < 18) return PALETTES.day;
    if (h >= 18 && h < 21) return PALETTES.evening;
    return PALETTES.night; // 21:00–06:00
};

// easeInOutSine — 讓色相輪替的過渡更自然（非線性）
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

// 一盞燈的「主導權重」：在整圈中，只有輪到它時亮起，其餘時間淡下。
//   phase 0/1/2 對應三盞燈，彼此錯開 1/3 圈。停留 + easeInOutSine 過渡。
const dominance = (loopT, phase) => {
    // loopT ∈ [0,1)；把它平移到這盞燈的相位窗
    const local = (((loopT - phase / 3) % 1) + 1) % 1; // 0=剛亮起
    // 用平滑三角：0→峰→0，套 easeInOutSine 讓起伏柔和
    const tri = 1 - Math.abs(local * 2 - 1); // 0..1..0
    return easeInOutSine(tri);
};

const BespokeAmbientGlow = ({ forceLightBg = false, forceFullPage = false, transparent = false, absolute = false }) => {
    const time = useTime();

    // 🧊 教學模式進行中 → 凍結 glow
    const [frozen, setFrozen] = React.useState(false);
    React.useEffect(() => {
        const onState = (e) => setFrozen(!!e?.detail?.active);
        window.addEventListener('drvn:onboarding-state', onState);
        return () => window.removeEventListener('drvn:onboarding-state', onState);
    }, []);
    const animated = !frozen;

    // ⏰ 每分鐘重查時段，跨界線自動換色
    const [palette, setPalette] = React.useState(() => paletteForHour(new Date().getHours()));
    React.useEffect(() => {
        const id = setInterval(() => setPalette(paletteForHour(new Date().getHours())), 60000);
        return () => clearInterval(id);
    }, []);

    // 🌬 由左向右 loop：三盞燈等距(相位差 1/3)沿水平方向連續流動，
    //    跑出右邊從左邊接回來。三色彼此交疊、用大 blur 融成一條流動的光帶。
    //    週期約 18 秒（比上一版 22 秒再快一點點）。
    const LOOP = 18000;
    // 每盞燈在畫面中的水平位置(vw)：從 -35vw 流到 135vw，wrap 回來（viewport 相對，flow 一致）。
    const SPAN_L = -35, SPAN_R = 135;
    const flowX = (t, phase) => {
        if (!animated) return `${SPAN_L + (SPAN_R - SPAN_L) * phase}vw`;
        const p = ((((t / LOOP) + phase) % 1) + 1) % 1;
        return `${SPAN_L + (SPAN_R - SPAN_L) * p}vw`;
    };
    // left 用固定值(0)，位移全交給 x（%）——讓三盞燈真正橫向平移
    const x1 = useTransform(time, (t) => flowX(t, 0));
    const x2 = useTransform(time, (t) => flowX(t, 1 / 3));
    const x3 = useTransform(time, (t) => flowX(t, 2 / 3));

    // 不透明度常駐（三色一直都在→融合），僅極輕微呼吸，不再靠明暗輪替
    const mkO = (base) => useTransform(time, (t) => animated ? base + 0.10 * Math.sin(t / 6000) : base);
    const o1 = mkO(0.86 * palette.colors[0].weight);
    const o2 = mkO(0.84 * palette.colors[1].weight);
    const o3 = mkO(0.86 * palette.colors[2].weight);

    const s1 = useTransform(time, (t) => animated ? 1.10 + 0.06 * Math.sin(t / 7000) : 1.10);
    const s2 = useTransform(time, (t) => animated ? 1.12 + 0.06 * Math.cos(t / 8000 + 2.1) : 1.12);
    const s3 = useTransform(time, (t) => animated ? 1.08 + 0.06 * Math.sin(t / 8500 + 4.2) : 1.08);
    const yDrift = (period, amp) => useTransform(time, (t) => animated ? `${Math.sin(t / period) * amp}%` : '0%');
    const y1 = yDrift(11000, 4);
    const y2 = yDrift(12500, 4);
    const y3 = yDrift(14000, 4);

    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    // 柔和 radial glow（大範圍暈開，利於三色融合）——看得見但不過飽和（再亮一點點）
    const glowBg = (c) =>
        `radial-gradient(circle at center, ${rgba(c, 0.66)} 0%, ${rgba(c, 0.31)} 48%, ${rgba(c, 0)} 76%)`;

    const c0 = palette.colors[0].rgb;
    const c1 = palette.colors[1].rgb;
    const c2 = palette.colors[2].rgb;

    // 光暈帶高度：一般頁面約上方 60%，forceFullPage（如登入頁）放寬到 74%
    const bandHeight = forceFullPage ? '74%' : '60%';
    const bandMask = 'linear-gradient(to bottom, black 0%, black 62%, transparent 100%)';

    return (
        <div className={`${absolute ? 'absolute' : 'fixed'} inset-0 z-0 pointer-events-none overflow-hidden ${transparent ? '' : 'bg-[#CFC6B8]'}`}>
            <div
                className="absolute left-0 right-0 top-0 overflow-hidden"
                style={{ height: bandHeight, WebkitMaskImage: bandMask, maskImage: bandMask, filter: 'saturate(1.1)' }} /* Saturation 110% */
            >
                {/* Layer 1 — 滿版靜態光洗（三色底），保證帶內無空白 */}
                <div className="absolute inset-0" style={{ background: palette.base }} />

                {/* Layer 2 — 三盞交疊光暈，主導色以 easeInOutSine 極慢輪替 */}
                {/* c0 = 主光源 amber：範圍最大（佔約 60%） */}
                <motion.div
                    className="absolute rounded-full"
                    style={{
                        top: '-34%', left: 0, marginLeft: '-48vw',
                        width: '96vw', height: '96vw',
                        x: x1, y: y1, scale: s1,
                        background: glowBg(c0),
                        opacity: o1,
                        filter: 'blur(20px)',
                        willChange: 'transform',
                    }}
                />
                <motion.div
                    className="absolute rounded-full"
                    style={{
                        top: '-24%', left: 0, marginLeft: '-37vw',
                        width: '74vw', height: '74vw',
                        x: x2, y: y2, scale: s2,
                        background: glowBg(c1),
                        opacity: o2,
                        filter: 'blur(20px)',
                        willChange: 'transform',
                    }}
                />
                <motion.div
                    className="absolute rounded-full"
                    style={{
                        top: '-28%', left: 0, marginLeft: '-37vw',
                        width: '74vw', height: '74vw',
                        x: x3, y: y3, scale: s3,
                        background: glowBg(c2),
                        opacity: o3,
                        filter: 'blur(20px)',
                        willChange: 'transform',
                    }}
                />
            </div>
        </div>
    );
};

export default BespokeAmbientGlow;
