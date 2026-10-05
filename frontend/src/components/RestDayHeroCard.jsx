import { toZhExerciseName } from '../utils/exerciseNameZh';
import React from 'react';
import { motion } from 'framer-motion';

/**
 * ══════════════════════════════════════════════════════════════
 * REST DAY HERO CARD — Swiss-Noir "Hardware-Grade" Edition
 * ══════════════════════════════════════════════════════════════
 * Refined card with brushed metal textures, specular highlights,
 * and boutique-watch typography.
 * ══════════════════════════════════════════════════════════════
 */

const TEXTURES = {
    titaniumObsidian: 'linear-gradient(135deg, #161415 0%, #1E1C1D 25%, #262523 50%, #1A1819 75%, #161415 100%)',
    titaniumCoral: 'linear-gradient(135deg, #E24837 0%, #ED5847 30%, #F46554 50%, #ED5847 70%, #C23324 100%)',
    titaniumSilver: 'linear-gradient(to bottom, #FFFFFF 0%, #F8F8F8 30%, #EBEBEB 50%, #C0C0C0 70%, #FFFFFF 100%)',
};

// ── Auto-detect split from exercise names ────────────────────────────────────
const PUSH_KW = ['bench', 'press', 'dip', 'chest', 'fly', 'flye', 'push', '臥推', '飛鳥', '胸', '肩推', 'dumbbell press'];
const PULL_KW = ['row', 'deadlift', 'pull', 'chin', 'lat', 'cable pull', 'barbell row', '划船', '引體向上', '硬舉', '背', '下拉'];
const LEGS_KW = ['squat', 'lunge', 'leg', 'calf', 'hip thrust', 'rdl', '深蹲', '弓箭步', '腿', '臀推', '小腿'];

function detectSplit(exercises = []) {
    let push = 0, pull = 0, legs = 0;
    exercises.forEach(ex => {
        const n = (ex.name || '').toLowerCase();
        if (PUSH_KW.some(k => n.includes(k))) push++;
        if (PULL_KW.some(k => n.includes(k))) pull++;
        if (LEGS_KW.some(k => n.includes(k))) legs++;
    });
    const max = Math.max(push, pull, legs);
    if (max === 0) return null;
    if (legs === max) return 'LEG PROTOCOL';
    if (pull === max) return 'PULL PROTOCOL';
    return 'PUSH PROTOCOL';
}

const RestDayHeroCard = ({
    title = null,
    subtitle = "REST DAY",
    subtitleEn = "",
    imageSrc = "/assets/kettlebell_woman.png",
    delay = 0,
    onClick = null,
    isRestDay = true,
    exercises = [],
    estimatedTime = 45,
    exerciseCount = 0,
    date = "",
    dayOfWeek = "",
    recoveryInfo = null,
    focusParts = "",   // 🈶 今日訓練部位（如「胸 · 肩 · 三頭」）— 瑞士極簡小字呈現
    className = ""
}) => {
    // Resolve display title
    const displayTitle = title
        || (!isRestDay && detectSplit(exercises))
        || (isRestDay ? '恢復期' : '訓練日');

    const bgGradient = isRestDay ? TEXTURES.titaniumObsidian : TEXTURES.titaniumCoral;
    const woodBackground = 'none'; // User requested Charcoal Black for Rest Day
    const labelColor = isRestDay ? 'rgba(246,244,241,0.30)' : 'rgba(255,255,255,0.40)';
    const textColor = '#F6F4F1';
    const topExercises = (exercises || []).slice(0, 3);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, type: 'spring', stiffness: 220, damping: 25 }}
            whileTap={onClick ? { scale: 0.97 } : {}}
            onClick={onClick}
            className={`w-full relative group ${className}`}
            style={{ cursor: onClick ? 'pointer' : undefined }}
        >
            {/* ── Athlete image — outside overflow-hidden so it's never clipped ── */}
            {imageSrc && (
                <motion.img
                    initial={{ x: 80, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    src={imageSrc}
                    alt="Athlete"
                    className="absolute pointer-events-none"
                    style={{
                        right: isRestDay ? '-32%' : '-40%',
                        /* 訓練日：人站在卡片下緣，只從上緣探出 26px。
                           ⚠️ 高度用 calc(100% + 26px) 而不是寫死的 px —— 容器就是這張卡，
                              所以不論卡片因為標題長度或有沒有恢復資訊而變高變矮，
                              「探出多少」永遠是這 26px。原本寫死 300px：卡片只有 180 左右，
                              人整個飛到卡片外面，頭超出畫面、腳還擋住星期膠囊的最後兩顆。 */
                        bottom: isRestDay ? '-18px' : 0,
                        height: isRestDay ? '230px' : 'calc(100% + 26px)',
                        width: 'auto',
                        objectFit: 'contain',
                        zIndex: 20,
                        filter: isRestDay
                            ? 'brightness(0.85) drop-shadow(-15px 15px 30px rgba(0,0,0,0.4))'
                            : 'brightness(0.9) drop-shadow(-15px 15px 30px rgba(0,0,0,0.6))',
                    }}
                />
            )}
            <div
                className="relative w-full rounded-[28px] overflow-hidden shadow-2xl transition-all duration-500"
                style={{
                    background: bgGradient,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    minHeight: isRestDay ? 150 : 175,
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: isRestDay
                        ? '0 8px 64px 12px rgba(249, 92, 75, 0.16), inset 0 1px 0 rgba(255,255,255,0.05)'
                        : '0 8px 64px 12px rgba(249, 92, 75, 0.16), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
            >
                {/* Texture Overlay — SVG noise (CDN-free, 生產環境穩定) */}
                <div
                    className="absolute inset-0 pointer-events-none mix-blend-overlay"
                    style={{
                        opacity: isRestDay ? 0.06 : 0.22,
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
                    }}
                />

                {/* Specular Highlight Sheen (Ultrafine Atmospheric Transition) */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.025] to-transparent pointer-events-none" />

                {/* Decorative Elements */}
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/[0.03] pointer-events-none" />

                {/* ── Athlete image (rendered outside overflow-hidden wrapper via portal-like z-layer) ── */}

                {/* ── Text Content ── */}
                {/* 文字區寬度維持 72% —— 右邊要留給運動員照片（right: -40%）。
                    量過了：佐證列最長的情況（「120 分鐘 · 12 個動作 · 恢復 100%」）
                    實際排版後只有 167px，72% 在 375 寬的 SE 上仍有 217px 可用，不需要加寬。
                    原本會折行的成因是舊樣式（12px + font-black + tracking-widest，
                    而且拆成兩個並排區塊），不是容器太窄。 */}
                <div className="relative z-20 p-6 pr-0" style={{ maxWidth: '72%' }}>
                    {/* Header Strip */}
                    <div className="flex items-center gap-2 mb-3">
                        {/* §1 最小字級 11px —— 這裡原本是 9px（區塊中標的規格是 11–12 / 800）。 */}
                        <span style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: '0.22em',
                            color: '#F6F4F1',
                            fontFamily: 'system-ui, sans-serif',
                            opacity: 0.85
                        }}>
                            {subtitle}
                        </span>
                        {date && (
                            <span className="text-[11px] font-medium" style={{ color: 'rgba(246,244,241,0.6)', letterSpacing: '0.1em' }}>
                                / {date} {dayOfWeek}
                            </span>
                        )}
                    </div>

                    {/* Main Title */}
                    <h2 style={{
                        fontSize: 30,
                        fontWeight: 400,
                        color: '#F6F4F1',
                        lineHeight: 1.05,
                        letterSpacing: '-0.01em',
                        fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                        marginBottom: 16,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                    }}>
                        {displayTitle}
                    </h2>

                    {/* Exercises List (Active Day) */}
                    {!isRestDay && topExercises.length > 0 && (
                        <div className="flex flex-col gap-2 mb-5">
                            {topExercises.map((ex, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-white/40" />
                                    <span className="text-[11px] font-medium text-white/80 line-clamp-1"
                                        style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', letterSpacing: '0.02em' }}>
                                        {/* 🈶 動作名稱中文化：優先中文名，英文名過翻譯表 */}
                                        {toZhExerciseName(ex.name || ex.nameEn) || ex.name || ex.nameEn}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 🇨🇭 今日訓練部位 — 瑞士極簡：短 hairline 收筆 + tracked 大字距小字，
                        取代原本的動作清單（動作細節點進預覽頁再看） */}
                    {!isRestDay && focusParts && (
                        <div className="flex items-center gap-2.5 mb-4">
                            <span aria-hidden style={{ width: 16, height: 1, background: 'rgba(255,255,255,0.55)' }} />
                            {/* 同上：9px → 11px */}
                            <span className="text-[11px] font-bold"
                                style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: '0.24em', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                {focusParts}
                            </span>
                        </div>
                    )}

                    {/* ── 佐證列：時間 · 動作數 · 恢復，一行講完 ──────────────────
                        ⚠️ 原本是兩個並排的區塊（「40 MIN · 5 個動作」＋「100% 最佳狀態」），
                           各自 12px font-black tracking-widest。文字區只有卡寬的 72%，
                           390 寬的手機上兩塊加起來約 260px、放不下 228px → 兩塊都折行，
                           一張卡底下擠出四行小字，看起來就是「卡住」。
                        改成一條 nowrap 的字串（介面標準 §2：三個以上的並列數字收成一行），
                        並照 §1 把輔助文字調回 11px / 600 / 正常字距 ——
                        font-black + tracking-widest 是「區塊中標」的規格，不是佐證的。 */}
                    {(() => {
                        /* §8 沒資料 → 不顯示：recoveryStatus 物件存在不代表 battery_level 算得出來，
                           不先擋一次會印出「恢復 undefined%」。 */
                        const battery = Number(recoveryInfo?.battery_level);
                        const parts = [
                            !isRestDay ? `${estimatedTime} 分鐘` : null,
                            !isRestDay ? `${exerciseCount || (exercises && exercises.length) || 0} 個動作` : null,
                            Number.isFinite(battery) ? `準備度 ${Math.round(battery)}%` : null,
                        ].filter(Boolean);
                        if (parts.length === 0) return null;
                        return (
                        <p style={{
                            margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
                            color: labelColor, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {parts.join('  ·  ')}
                        </p>
                        );
                    })()}
                </div>

                {/* Diamond-Cut Edge Effect */}
                <div className="absolute inset-0 border-[0.5px] border-white/10 rounded-[28px] pointer-events-none" />
            </div>
        </motion.div>
    );
};

export default RestDayHeroCard;

