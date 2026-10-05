import React, { useMemo, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, ReferenceLine, CartesianGrid,
    AreaChart, Area,
} from 'recharts';
import {
    TrendingUp, Target, Zap, Clock, Trophy,
    AlertCircle, Brain, ArrowUpRight, ArrowDownRight,
    CheckCircle, Minus, ShieldCheck, Snowflake, Database,
    Scale, TrendingDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { runDynamicTDEE } from '../utils/DynamicTDEEEngine';
import { calcSmartBMR } from '../utils/NutritionEngine';
import { getUserId } from '../utils/auth';
import { computeCutProgress, formatEta, cycleWeightSeries } from '../utils/cutProgress';
import { editorialColors } from '../utils/colors';
import { readableNutritionDays, nutritionCalendarWindow, nutritionTrendSeries } from '../utils/nutritionHistory';
import MemberLockCard from './MemberLockCard';

// ── 品牌色票 ──────────────────────────────────────────────────────────────────
const C = editorialColors;

// ── 資料清洗（去除生理不可能數值）────────────────────────────────────────────
const sanitize = readableNutritionDays;

const fmt = (n) => Math.round(n).toLocaleString();
const sign = (n) => (n > 0 ? '+' : '') + fmt(n);

// ── 瑞士極簡 Card 殼 ──────────────────────────────────────────────────────────
// 頂部 2px Coral rule + 白底 + Stone 邊框
const Card = ({ children, accent = C.coral, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.3 }}
        style={{ background: '#fff', border: `1px solid ${C.stone}`, borderTop: `2px solid ${accent}` }}
        className="rounded-none p-6"
    >
        {children}
    </motion.div>
);

// ── 標籤（瑞士樣式：全大寫 + 極細追蹤）──────────────────────────────────────
const Label = ({ children, color = C.pebble }) => (
    <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-1" style={{ color }}>{children}</p>
);

// ── 圖表 Tooltip ──────────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: C.black, border: `1px solid ${C.pebble}30` }}
            className="px-3 py-2 shadow-xl">
            <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: C.pebble }}>{label}</p>
            {payload.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-px" style={{ background: e.color }} />
                    <span className="font-black tabular-nums text-xs text-white">{e.value}</span>
                    <span className="text-[11px] font-bold" style={{ color: C.pebble }}>{e.name}</span>
                </div>
            ))}
        </div>
    );
};


// ─────────────────────────────────────────────────────────────────────────────
// 00  減脂／增重進度（永遠顯示 — 這不是進階分析，是最基本的那個問題）
// ─────────────────────────────────────────────────────────────────────────────
//  一個減脂的人心裡只有三句話：「我掉了幾公斤」「我掉得夠快嗎」「還要多久」。
//  這張卡回答完這三句，其餘全部降階。
//  層級：kicker → 大數字 → 進度軌 → 三個支撐數字 → 配速 → 一句處方。
//
//  ⚠️ 依據一律是「實測體重」。熱量結餘推估出來的曲線不是進度，
//     拿它冒充事實違反誠實數據鐵律 —— 沒量過就顯示空狀態並引導去量。
//     達標日也用「實際配速」重算，不沿用承諾當下用目標配速寫死的那個日期。
//
//  📌 2026-09 合併：原本「目標配速引擎」是獨立一張卡，但它跟這張卡呼叫的是
//     同一支 computeCutProgress()。分成兩張的結果是同一份事實被拆成兩半，
//     使用者要自己把「已減 2.1 公斤」跟「每週 -0.35 公斤」對起來。
//     而且配速那張還被 advanced 開關擋住 —— 最該讓人看到的「你走得對不對」
//     預設是看不到的。現在合成一張，且不受進階開關影響。
/* 這一期的實測體重（只畫量過的點，不內插）＋目標線。兩個點以上才畫 ——
   一個點連不成趨勢，硬畫只會讓人以為中間都量過。 */
const WeightTrendMini = ({ userId, activePlan, target, accent }) => {
    const series = useMemo(() => cycleWeightSeries(userId || getUserId(), activePlan), [userId, activePlan]);
    if (series.length < 2) return null;
    const ws = series.map((x) => x.weight).concat(target ? [target] : []);
    const dom = [Math.floor(Math.min(...ws) - 1), Math.ceil(Math.max(...ws) + 1)];
    return (
        <div className="mb-6">
            <Label>實測體重 · {series.length} 次量測</Label>
            <div style={{ height: 120, marginLeft: -18 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={C.stone} strokeDasharray="2 4" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.pebble, fontWeight: 700 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis domain={dom} tick={{ fontSize: 10, fill: C.pebble, fontWeight: 700 }} axisLine={false} tickLine={false} width={40} />
                        {target ? <ReferenceLine y={target} stroke={C.black} strokeDasharray="4 4" label={{ value: `目標 ${target}`, position: 'insideTopRight', fontSize: 10, fill: C.black, fontWeight: 800 }} /> : null}
                        <Tooltip content={<Tip />} />
                        <Line type="linear" dataKey="weight" name="kg" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: accent, strokeWidth: 0 }} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const CutProgressCard = ({ userId, activePlan, validDays = [], targets = {} }) => {
    const p = useMemo(
        () => computeCutProgress(userId || getUserId(), activePlan),
        [userId, activePlan]
    );

    // ── 配速：有實測體重就用實測，沒有才退回熱量結餘推估（並標「預估」）──
    //    這段原本住在 PacingEngineCard 裡，計算邏輯原封不動搬過來。
    const pacing = useMemo(() => {
        if (validDays.length < 3 || !(Number(targets.tdee) > 0)) return null;
        const r7 = nutritionCalendarWindow(validDays).filter(d => d.logged);
        if (r7.length < 3) return null;
        const avgIntake = Math.round(r7.reduce((s, d) => s + (d.calories || 0), 0) / r7.length);
        const estTDEE = Number(targets.tdee);
        const targetCal = targets.calories || estTDEE;
        return {
            estTDEE,
            estTargetPace: ((targetCal - estTDEE) * 7) / 7700,
            estActualPace: ((avgIntake - estTDEE) * 7) / 7700,
            weeklyNet: Math.round((avgIntake - estTDEE) * 7),
            mode: targets.mode || (targets.calories < estTDEE ? 'cutting' : 'maintenance'),
        };
    }, [validDays, targets]);

    if (p.status === 'no_plan') return null;

    const accent = p.offTrack ? C.ember : C.coral;
    const kicker = p.measuredAt
        ? `Progress · 實測 ${p.measuredAt.getMonth() + 1}/${p.measuredAt.getDate()}`
        : 'Progress · 尚無量測';

    // ── 還沒有量測 / 剛開始：誠實空狀態，不畫假的軌道與數字 ──
    //    但配速的「預估值」還是給 —— 標清楚是推估，總比什麼都不說好。
    if (p.status !== 'ok') {
        return (
            <Card accent={C.pebble} delay={0}>
                <Label>{kicker}</Label>
                <h3 className="text-xl font-black mb-2" style={{ color: C.black }}>{p.headline}</h3>
                <p className="text-[11px] leading-relaxed" style={{ color: C.black + 'aa' }}>{p.support}</p>
                {p.startWeight != null && p.targetWeight != null && (
                    <div className="mt-4 pt-4 flex items-baseline gap-2" style={{ borderTop: `1px solid ${C.stone}` }}>
                        <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: C.pebble }}>起點</span>
                        <span className="text-sm font-black tabular-nums" style={{ color: C.black }}>{p.startWeight}</span>
                        <span className="text-[11px] font-black" style={{ color: C.pebble }}>→</span>
                        <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: C.pebble }}>目標</span>
                        <span className="text-sm font-black tabular-nums" style={{ color: C.black }}>{p.targetWeight}</span>
                        <span className="text-[11px] font-bold" style={{ color: C.pebble }}>KG</span>
                    </div>
                )}
                {pacing && (
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.stone}` }}>
                        <Label>照吃的量推算 · 尚未量測</Label>
                        <p className="text-[11px] leading-relaxed" style={{ color: C.black + 'aa' }}>
                            目前的攝取換算下來大約是每週 {pacing.estActualPace > 0 ? '+' : ''}{pacing.estActualPace.toFixed(2)} kg。
                            這是以已記錄飲食推算，漏記會讓估算失真；請以多次體重量測的趨勢確認。
                        </p>
                    </div>
                )}
            </Card>
        );
    }

    const cells = [
        p.offTrack && p.remainingKg > 0
            ? { label: p.direction === 'bulk' ? '還要增' : '還要減', value: `${p.remainingKg}`, unit: 'KG' }
            : p.overshootKg > 0.3
            ? { label: '已超過', value: `${p.overshootKg}`, unit: 'KG' }
            : { label: '還剩', value: `${p.remainingKg}`, unit: 'KG' },
        { label: '目前', value: `${p.weekIndex}`, unit: '週' },
        {
            // 「— 需調整」看不出是什麼意思：照現在的速度到不到得了，直接講
            label: '預計達標',
            value: p.etaReachable ? (formatEta(p.etaDate) || '已達標') : '到不了',
            unit: p.etaReachable ? '' : '照現在',
        },
    ];

    /* 進度軌：把起點、現在、目標放在同一條真實的刻度上。
       以前只畫「起點 → 目標」的填滿長度，走反方向時填滿是 0，
       「現在」那個點就黏在起點上 —— 看不出其實已經往反方向走了 9.7 kg。 */
    const lo = Math.min(p.startWeight, p.currentWeight, p.targetWeight);
    const hi = Math.max(p.startWeight, p.currentWeight, p.targetWeight);
    const pos = (v) => (hi - lo > 0 ? ((v - lo) / (hi - lo)) * 100 : 50);
    const sPos = pos(p.startWeight), cPos = pos(p.currentWeight), tPos = pos(p.targetWeight);
    const marks = [
        { k: 'start', v: p.startWeight, x: sPos, label: '起點' },
        { k: 'target', v: p.targetWeight, x: tPos, label: '目標' },
        { k: 'now', v: p.currentWeight, x: cPos, label: '現在' },
    ];

    return (
        <Card accent={accent} delay={0}>
            <Label color={p.ageDays > 30 ? C.ember : C.pebble}>
                {kicker}{p.ageDays > 30 ? ` · ${p.ageDays} 天前，建議重量` : ''}
            </Label>

            {/* 第一眼：這一期到底移動了多少 */}
            <div className="flex items-baseline gap-2 mb-6">
                <span
                    className="tabular-nums"
                    style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: accent }}
                >
                    {Math.abs(p.movedKg)}
                </span>
                <span className="text-[12px] font-black tracking-[0.2em] pb-1" style={{ color: C.pebble }}>
                    {p.offTrack
                        ? (p.direction === 'bulk' ? 'KG · 體重反而少了' : 'KG · 體重反而多了')
                        : (p.direction === 'bulk' ? '已增 KG' : '已減 KG')}
                </span>
            </div>

            {/* 進度軌：起點、目標、現在放在同一條刻度上（走反方向時看得出往哪邊偏了多少） */}
            <div className="mb-2" style={{ padding: '0 6px' }}>
                <div className="relative w-full" style={{ height: 22 }}>
                    <div className="absolute left-0 right-0" style={{ top: 9, height: 4, background: C.stone }} />
                    {/* 起點 → 目標：該走的那一段 */}
                    <div className="absolute" style={{ top: 9, height: 4, left: `${Math.min(sPos, tPos)}%`, width: `${Math.abs(tPos - sPos)}%`, background: 'rgba(22,20,21,0.14)' }} />
                    {/* 起點 → 現在：實際走的那一段（往目標是 coral、走反是 ember 斜紋） */}
                    <div className="absolute" style={{
                        top: 9, height: 4, left: `${Math.min(sPos, cPos)}%`, width: `${Math.abs(cPos - sPos)}%`,
                        background: p.offTrack ? `repeating-linear-gradient(135deg, ${C.ember} 0 4px, rgba(217,64,48,0.45) 4px 8px)` : accent,
                    }} />
                    <div className="absolute -translate-x-1/2" style={{ left: `${sPos}%`, top: 4, width: 2, height: 14, background: C.pebble }} />
                    <div className="absolute -translate-x-1/2" style={{ left: `${tPos}%`, top: 2, width: 10, height: 18, border: `2px solid ${C.black}`, background: '#fff' }} />
                    <div className="absolute -translate-x-1/2 border-2 border-white" style={{ left: `${cPos}%`, top: 4, width: 14, height: 14, borderRadius: 999, background: accent, boxShadow: '0 1px 3px rgba(32,32,32,.25)' }} />
                </div>
            </div>
            <div className="flex justify-between mb-6">
                {[...marks].sort((a, b) => a.v - b.v).map((m) => (
                    <span key={m.k} className="text-[12px] font-black tracking-[0.1em] tabular-nums"
                        style={{ color: m.k === 'now' ? C.black : C.pebble }}>
                        {m.label} {m.v}{m.k === 'now' ? ' KG' : ''}
                    </span>
                ))}
            </div>

            {/* 數字合不合理、目標方向對不對 —— 先講，不然下面整張卡都是建立在錯的數字上 */}
            {(p.implausible || p.targetMismatch) && (
                <div className="flex items-start gap-3 p-3 mb-6" style={{ background: 'rgba(217,64,48,0.07)' }}>
                    <div className="w-0.5 self-stretch shrink-0" style={{ background: C.ember }} />
                    <p className="text-[12px] font-bold leading-relaxed" style={{ color: C.black }}>
                        {p.implausible
                            ? `${p.startWeight} → ${p.currentWeight} kg，平均每週 ${Math.abs(p.actualPaceKgWk)} kg，比身體一般能變化的快很多。是不是量錯、換了一台秤，或起點那筆不是你的？到身體數據裡修正那一筆，這張卡就會變準。`
                            : `目標 ${p.targetWeight} kg 跟計劃方向對不起來（${p.direction === 'bulk' ? '增重，但目標比起點輕' : '減脂，但目標比起點重'}）。到飲食計劃重新設定目標。`}
                    </p>
                </div>
            )}

            <WeightTrendMini userId={userId} activePlan={activePlan} target={p.targetWeight} accent={accent} />

            {/* 支撐數字：直角資料列（1px 髮絲分隔，不用巢狀方框） */}
            <div className="grid grid-cols-3 gap-px" style={{ background: C.stone }}>
                {cells.map((c) => (
                    <div key={c.label} className="p-3" style={{ background: C.paper }}>
                        <Label>{c.label}</Label>
                        <p className="text-lg font-black tabular-nums leading-none" style={{ color: C.black }}>
                            {c.value}
                            {c.unit && <span className="text-[11px] font-bold ml-1" style={{ color: C.pebble }}>{c.unit}</span>}
                        </p>
                    </div>
                ))}
            </div>

            {!p.etaReachable && (
                <p className="text-[11px] leading-relaxed mt-4" style={{ color: C.black + 'aa' }}>{p.support}</p>
            )}

            {/* ── 走多快：目標配速 vs 實際配速（原「目標配速引擎」卡）───────────
                前面回答了「走到哪」，這裡回答「走得對不對」。
                來源誠實標示：磅秤上的數字叫「實測」，用熱量結餘算的叫「預估」。 */}
            {pacing && (() => {
                const hasMeasured = p.actualPaceKgWk != null;
                const shownPace = hasMeasured ? p.actualPaceKgWk : pacing.estActualPace;
                const shownTargetPace = p.targetPaceKgWk != null ? p.targetPaceKgWk : pacing.estTargetPace;
                const { mode, weeklyNet } = pacing;

                // ⚖️ 處方一律依「實際在發生的事」判斷 —— 有實測體重就用實測，沒有才退回熱量推估。
                //    原本全部依熱量推估，會出現「照你吃的應該在掉」但磅秤根本沒動時，
                //    系統還在說「完美的減脂節奏」。那是最傷信任的一種錯。
                const src = hasMeasured ? '實測' : '推估';
                let paceAccent = C.coral;
                let msg = `配速接近目標——${src}體重${shownPace < 0 ? '每週降低' : '每週增加'} ${Math.abs(shownPace).toFixed(2)} kg。`;

                if (mode === 'cutting' && shownPace > 0.05) {
                    paceAccent = C.ember;
                    msg = hasMeasured
                        ? `體重實際往上走（+${shownPace.toFixed(2)} kg/週）。若非刻意增肌，先檢查份量與零食，或把有氧加回來。`
                        : `熱量盈餘（${sign(weeklyNet)} kcal/週）。若非增肌期，建議增加有氧或減少零食。`;
                } else if (mode === 'cutting' && shownPace < -0.75) {
                    paceAccent = C.pebble;
                    msg = `減重速度偏快（${Math.abs(shownPace).toFixed(2)} kg/週）。確保蛋白質 ≥ ${targets.protein || 120}g 防止肌肉流失。`;
                } else if (mode === 'bulking' && shownPace > 0.5) {
                    paceAccent = C.ember;
                    msg = `增重速度偏快，可能積累多餘脂肪，建議控制在 0.2-0.3 kg/週。`;
                } else if (mode === 'cutting' && shownPace < 0) {
                    msg = hasMeasured
                        ? `磅秤在往下走，方向對了。偶爾多吃不影響整體趨勢。`
                        : `照目前的攝取推算是往下走的；量一次體重就能確認。`;
                }

                return (
                    <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${C.stone}` }}>
                        <Label>每公斤 7700 大卡推算</Label>
                        <div className="grid grid-cols-2 gap-px mt-3 mb-4" style={{ background: C.stone }}>
                            <div className="p-4" style={{ background: C.paper }}>
                                <Label>目標配速</Label>
                                <p className="text-2xl font-black tabular-nums" style={{ color: C.black }}>
                                    {shownTargetPace > 0 ? '+' : ''}{shownTargetPace.toFixed(2)}
                                    <span className="text-xs font-bold ml-1" style={{ color: C.pebble }}>kg/週</span>
                                </p>
                            </div>
                            <div className="p-4" style={{ background: paceAccent + '10' }}>
                                {/* 誠實標示來源：實測 = 磅秤上的數字；預估 = 依熱量結餘推算 */}
                                <Label color={paceAccent}>{hasMeasured ? '實際（實測）' : '實際（預估）'}</Label>
                                <p className="text-2xl font-black tabular-nums" style={{ color: paceAccent }}>
                                    {shownPace > 0 ? '+' : ''}{shownPace.toFixed(2)}
                                    <span className="text-xs font-bold ml-1 opacity-60">kg/週</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 p-3" style={{ background: C.paper }}>
                            <div className="w-0.5 self-stretch shrink-0" style={{ background: paceAccent }} />
                            <p className="text-[11px] font-medium leading-relaxed" style={{ color: C.black + 'aa' }}>{msg}</p>
                        </div>
                    </div>
                );
            })()}
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 01  七日執行報告
// ─────────────────────────────────────────────────────────────────────────────
const AdherenceCard = ({ validDays, targets }) => {
    const last7 = nutritionCalendarWindow(validDays);

    const days = last7.map(d => {
        const calPct = targets.calories ? d.calories / targets.calories : 1;
        const proPct = targets.protein  ? d.protein  / targets.protein  : 1;
        const hit    = d.logged && targets.calories > 0 && targets.protein > 0 && calPct >= 0.85 && calPct <= 1.20 && proPct >= 0.88;
        const close  = d.logged && !hit && calPct >= 0.70 && calPct <= 1.30 && proPct >= 0.70;
        return { label: d.label, logged: d.logged, hit, close, calPct, proPct };
    });

    const perfect  = days.filter(d => d.hit).length;
    const partial  = days.filter(d => d.close).length;
    const recorded = days.filter(d => d.logged).length;
    const adherence = recorded ? Math.round((perfect / recorded) * 100) : 0;
    const streak = (() => { let s = 0; for (let i = days.length-1; i>=0; i--) { if (days[i].hit || days[i].close) s++; else break; } return s; })();

    const dotColor = (d) => d.hit ? C.coral : d.close ? C.pebble : C.stone;

    return (
        <Card accent={C.coral} delay={0}>
            {/* 頭部 */}
            <div className="flex justify-between items-baseline mb-6">
                <div>
                    <Label>最近七個日曆日 · 已記錄 {recorded}/7 天</Label>
                    <h3 className="text-xl font-black" style={{ color: C.black }}>七日執行報告</h3>
                </div>
                <div className="text-right">
                    <p className="text-[11px]" style={{ color: C.black }}>已記錄日符合參考</p>
                    <span className="text-4xl font-black tabular-nums" style={{ color: C.coral }}>{adherence}</span>
                    <span className="text-sm font-black" style={{ color: C.pebble }}>%</span>
                </div>
            </div>

            {/* 7 天方格 */}
            <div className="flex gap-1.5 mb-5">
                {last7.length === 0
                    ? Array(7).fill(0).map((_, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                            <div className="w-full aspect-square" style={{ background: C.stone }} />
                            <span className="text-[11px] font-black uppercase" style={{ color: C.pebble }}>-</span>
                        </div>
                    ))
                    : days.map((d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                            <div className="w-full aspect-square flex items-center justify-center"
                                style={{ background: dotColor(d) + '20', border: `1.5px solid ${dotColor(d)}` }}>
                                {d.logged ? <div className="w-2 h-2 rounded-full" style={{ background: dotColor(d) }} /> : <span className="text-[11px]">未記</span>}
                            </div>
                            <span className="text-[11px] font-black" style={{ color: C.pebble }}>{d.label}</span>
                        </div>
                    ))
                }
            </div>

            {/* 三格數字 */}
            <div className="grid grid-cols-3 divide-x" style={{ borderTop: `1px solid ${C.stone}`, borderBottom: `1px solid ${C.stone}`, borderColor: C.stone }}>
                {[
                    { label: '符合參考', value: perfect, color: C.coral },
                    { label: '接近達標', value: partial, color: C.pebble },
                    { label: '連續天', value: streak, color: C.black },
                ].map(({ label, value, color }) => (
                    <div key={label} className="py-4 text-center" style={{ borderColor: C.stone }}>
                        <p className="text-2xl font-black tabular-nums" style={{ color }}>{value}</p>
                        <Label color={C.pebble}>{label}</Label>
                    </div>
                ))}
            </div>

            {/* 洞察 */}
            <p className="text-[11px] font-medium leading-relaxed mt-4" style={{ color: C.black + 'aa' }}>
                百分比只比較已記錄日與目前目標，不代表身體成效；未記錄不等於沒吃。若只記一餐，請先補齊當天飲食再判讀。
            </p>
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 02  動態代謝引擎（四個黃金法則）
// ─────────────────────────────────────────────────────────────────────────────

const TREND_LABEL = { gaining: '體重上升中', losing: '體重下降中', stable: '體重穩定', unknown: '趨勢未知' };
// 色票內建色 —— 原本用了 #38BDF8（天藍）與 #86EFAC（薄荷綠），
// 兩個都不在 DRVN 的色票裡，而且「下降＝綠色」等於替使用者判斷好壞：
// 同一個下降對減脂是好事、對增重是壞事，這張卡並不知道他在做哪一種。
// 方向只用中性色區分，好壞交給有計劃資訊的卡去講。
const TREND_COLOR = { gaining: C.coral, losing: C.black, stable: C.pebble, unknown: C.pebble };

const DynamicTDEECard = ({ validDays, userId = getUserId(), profile = {}, bmrOverride = null }) => {
    // ── 計算 BMR（優先用 InBody 的 Katch-McArdle）────────────────────────────
    const bmr = useMemo(() => {
        if (bmrOverride) return bmrOverride;
        try {
            const inbodyRaw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
            const latest = inbodyRaw.sort((a, b) =>
                new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date)
            )[0] || null;
            return calcSmartBMR(profile, latest).bmr;
        } catch { return 1500; }
    }, [userId, profile, bmrOverride]);

    // ── 跑動態 TDEE 引擎 ─────────────────────────────────────────────────────
    const result = useMemo(() =>
        runDynamicTDEE({ mealHistory: validDays, bmr, userId }),
        [validDays, bmr, userId]
    );

    const {
        tdee, confidence, frozen, frozenFrom, bmrFloor,
        message, foodDays, weightRecords, smoothed,
        trendKgPerDay, weightTrend, avgDailyCalories,
        rawTDEE, wasCappedByBMR,
    } = result;

    // ── 狀態顏色、圖示 ───────────────────────────────────────────────────────
    const statusMeta = frozen
        ? { color: C.silverDeep, bg: 'rgba(143,161,179,0.14)', Icon: Snowflake,    label: '凍結上週數值' }
        : confidence === 'sufficient'
        ? { color: C.coral,   bg: 'rgba(249,92,75,0.10)',   Icon: ShieldCheck,  label: '動態估算啟動' }
        : { color: C.pebble,  bg: 'rgba(207,198,184,0.20)', Icon: AlertCircle,  label: '數據收集中' };

    // ── 體重 EMA 圖表資料 ────────────────────────────────────────────────────
    const chartData = (smoothed || []).map(p => ({
        date:  p.date.slice(5),   // MM-DD
        raw:   +p.rawWeight.toFixed(1),
        ema:   +p.ema.toFixed(2),
    }));

    // 每日體重變化 → 換算週速度
    const weeklyWeightDelta = +(trendKgPerDay * 7).toFixed(2);

    return (
        <Card accent={frozen ? C.silverDeep : C.coral} delay={0.08}>
            {/* 標題列 */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <Label>依體重變化反推</Label>
                    <p className="text-base font-black" style={{ color: C.black }}>動態代謝估算</p>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full"
                    style={{ background: statusMeta.bg }}>
                    <statusMeta.Icon size={12} style={{ color: statusMeta.color }} />
                    <span className="text-[11px] font-black tracking-widest uppercase"
                        style={{ color: statusMeta.color }}>
                        {statusMeta.label}
                    </span>
                </div>
            </div>

            {/* 主數字 */}
            <div className="flex items-end gap-3 mb-5">
                <div>
                    <p className="text-[12px] font-bold tracking-widest mb-1"
                        style={{ color: C.pebble }}>
                        {frozen ? '凍結 TDEE' : '估算 TDEE'}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black tabular-nums tracking-tighter"
                            style={{ color: frozen ? C.silverDeep : C.black }}>
                            {fmt(tdee)}
                        </span>
                        <span className="text-sm font-black" style={{ color: C.pebble }}>kcal/day</span>
                    </div>
                    {wasCappedByBMR && (
                        <p className="text-[11px] font-bold mt-0.5" style={{ color: C.ember }}>
                            ⚠ 受 BMR 安全網保護（原始估算 {fmt(rawTDEE)}）
                        </p>
                    )}
                </div>
                <div className="flex flex-col gap-1 ml-auto text-right">
                    <div className="text-[11px] font-bold" style={{ color: C.pebble }}>BMR 下限</div>
                    <div className="text-base font-black" style={{ color: C.pebble }}>{fmt(bmrFloor)}</div>
                    <div className="text-[11px]" style={{ color: C.pebble }}>BMR × 1.1</div>
                </div>
            </div>

            {/* 三格統計 */}
            <div className="grid grid-cols-3 divide-x mb-5" style={{ borderColor: C.stone }}>
                {[
                    { label: '有效飲食天', value: foodDays, unit: '天', good: foodDays >= 4 },
                    { label: '體重量測', value: weightRecords, unit: '次', good: weightRecords >= 2 },
                    { label: '平均攝入', value: avgDailyCalories ? fmt(avgDailyCalories) : '—', unit: 'kcal', good: true },
                ].map(({ label, value, unit, good }) => (
                    <div key={label} className="text-center py-3" style={{ borderColor: C.stone }}>
                        <p className="text-xl font-black tabular-nums" style={{ color: good ? C.black : C.ember }}>
                            {value}
                            <span className="text-[11px] font-bold ml-0.5" style={{ color: C.pebble }}>{unit}</span>
                        </p>
                        <Label color={C.pebble}>{label}</Label>
                    </div>
                ))}
            </div>

            {/* 體重趨勢圖（有資料才顯示） */}
            {chartData.length >= 2 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <Label>InBody 體重趨勢（EMA 平滑）</Label>
                        <div className="flex items-center gap-1.5">
                            <div className="w-8 h-px" style={{ background: TREND_COLOR[weightTrend] }} />
                            <span className="text-[11px] font-black" style={{ color: TREND_COLOR[weightTrend] }}>
                                {TREND_LABEL[weightTrend]}
                            </span>
                            {trendKgPerDay !== 0 && (
                                <span className="text-[11px] font-bold" style={{ color: C.pebble }}>
                                    {weeklyWeightDelta > 0 ? '+' : ''}{weeklyWeightDelta} kg/週
                                </span>
                            )}
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={80}>
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor={TREND_COLOR[weightTrend]} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={TREND_COLOR[weightTrend]} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.pebble }} axisLine={false} tickLine={false} />
                            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: C.pebble }} axisLine={false} tickLine={false} width={28} />
                            <Tooltip
                                content={({ active, payload }) => active && payload?.length ? (
                                    <div style={{ background: C.black, border: `1px solid ${C.pebble}30` }}
                                        className="px-2 py-1.5">
                                        <p className="text-[11px] font-bold text-white">{payload[0]?.payload?.date}</p>
                                        <p className="text-[11px] font-black" style={{ color: TREND_COLOR[weightTrend] }}>
                                            EMA {payload.find(p => p.dataKey === 'ema')?.value} kg
                                        </p>
                                        {payload.find(p => p.dataKey === 'raw') && (
                                            <p className="text-[11px]" style={{ color: C.pebble }}>
                                                原始 {payload.find(p => p.dataKey === 'raw')?.value} kg
                                            </p>
                                        )}
                                    </div>
                                ) : null}
                            />
                            {/* 原始點（散點用小 dot） */}
                            <Line dataKey="raw" type="monotone" stroke={C.pebble} strokeWidth={0}
                                dot={{ r: 2.5, fill: C.pebble, strokeWidth: 0 }} activeDot={false} />
                            {/* EMA 平滑線 */}
                            <Area dataKey="ema" type="monotone"
                                stroke={TREND_COLOR[weightTrend]} strokeWidth={2}
                                fill="url(#weightGrad)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* 狀態訊息 */}
            <div className="flex items-start gap-3 p-3" style={{ background: frozen ? 'rgba(143,161,179,0.12)' : C.paper }}>
                <div className="w-0.5 self-stretch shrink-0"
                    style={{ background: frozen ? C.silverDeep : C.coral }} />
                <div>
                    {frozen && frozenFrom && (
                        <p className="text-[11px] font-black mb-0.5" style={{ color: C.silverDeep }}>
                            凍結自 {frozenFrom}
                        </p>
                    )}
                    <p className="text-[11px] font-medium leading-relaxed"
                        style={{ color: C.black + '99' }}>
                        {message}
                    </p>
                </div>
            </div>
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 03  ❌ PacingEngineCard 已併入上方「減脂／增重進度」（2026-09 資訊重複稽核）
// ─────────────────────────────────────────────────────────────────────────────
//  它和 CutProgressCard 呼叫的是同一支 computeCutProgress()、講的是同一件事：
//  這一期走得對不對。分成兩張卡的結果是使用者要在兩處之間自己對照
//  「我減了 2.1 公斤」和「我每週 -0.35 公斤」是不是同一回事 —— 那本來就是同一回事。
//
//  現在同一張卡回答完整的三句話：走到哪 → 走多快 → 要不要調整。
//  順帶解決一個更嚴重的問題：配速原本被 advanced 開關擋住，
//  預設使用者根本看不到「你走得太快/太慢」這個最該知道的判斷。

// ─────────────────────────────────────────────────────────────────────────────
// 04  每日趨勢（柱狀 + 均線）
// ─────────────────────────────────────────────────────────────────────────────
const TrendChartCard = ({ validDays, targets }) => {
    const [metric, setMetric] = useState('calories');

    // 一天的資料畫不出趨勢：一根柱子加一個點的圖看起來像壞掉，
    // 不如老實說還要幾天。（下面的 early return 在 hooks 之後，順序安全。）
    const chartData = nutritionTrendSeries(validDays, metric);
    const recorded = chartData.filter(d => d.logged).length;
    const enough = recorded >= 3;

    const tgtVal  = { calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fats: targets.fats };
    const barFill = metric === 'calories' ? C.coral + '50' : C.pebble + '80';
    const lineFill = metric === 'calories' ? C.coral : metric === 'protein' ? C.ember : C.black;

    const TABS = [
        { key: 'calories', label: '熱量' },
        { key: 'protein',  label: '蛋白質' },
        { key: 'carbs',    label: '碳水' },
        { key: 'fats',     label: '脂肪' },
    ];

    if (!enough) {
        return (
            <Card accent={C.pebble} delay={0.15}>
                <Label>最近 14 天</Label>
                <h3 className="text-xl font-black mb-2" style={{ color: C.black }}>每日趨勢</h3>
                <p className="text-[11px] leading-relaxed" style={{ color: C.black + 'aa' }}>
                    最近 14 天有 {recorded} 天飲食紀錄，累積 3 天後顯示趨勢。未記錄的日期會保留空白。
                </p>
            </Card>
        );
    }

    return (
        <Card accent={C.coral} delay={0.15}>
            <div className="flex justify-between items-baseline mb-5">
                <div>
                    <Label>最近 14 天</Label>
                    <h3 className="text-xl font-black" style={{ color: C.black }}>每日趨勢</h3>
                </div>
            </div>

            {/* Tab */}
            <div className="flex mb-5" style={{ borderBottom: `1px solid ${C.stone}` }}>
                {TABS.map(t => (
                    <motion.button {...pressProps('cta')} key={t.key} onClick={() => setMetric(t.key)}
 className="flex-1 pb-2 text-[11px] font-black uppercase tracking-widest"
 style={{
 color: metric === t.key ? C.coral : C.pebble,
 borderBottom: metric === t.key ? `2px solid ${C.coral}` : '2px solid transparent',
 marginBottom: -1,
 }}>
                        {t.label}
                    </motion.button>
                ))}
            </div>

            <div className="h-[160px] w-full -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={C.stone} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false}
                            tick={{ fontSize: 11, fill: C.pebble, fontWeight: 800, letterSpacing: 1 }} dy={8} minTickGap={14} />
                        <YAxis axisLine={false} tickLine={false}
                            tick={{ fontSize: 11, fill: C.pebble, fontWeight: 800 }} dx={-4} />
                        <Tooltip content={<Tip />} cursor={{ stroke: C.stone, strokeWidth: 1 }} />
                        {tgtVal[metric] && (
                            <ReferenceLine y={tgtVal[metric]} stroke={C.coral} strokeDasharray="3 6" strokeOpacity={0.5} />
                        )}
                        <Bar dataKey={metric} name={metric === 'calories' ? 'kcal' : 'g'}
                            fill={barFill} radius={0} maxBarSize={18} />
                        <Line type="monotone" dataKey="avg" name="均線"
                            stroke={lineFill} strokeWidth={2} dot={false}
                            activeDot={{ r: 4, fill: lineFill, stroke: '#fff', strokeWidth: 2 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* 這條線取的是「前後各 3 天」的置中平均，不是 7 日移動平均 ——
                最後一天只有 4 天可平均，寫成「7日均線」是不準的說法。 */}
            <p className="text-[12px] font-black tracking-[0.18em] text-center mt-3" style={{ color: C.pebble }}>
                柱＝當日已記錄 · 線＝過去 7 天有紀錄日的平均（至少 3 天） · 虛線＝目前目標；空白＝未記錄，不是零攝取。
            </p>
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 05  進食時鐘
// ─────────────────────────────────────────────────────────────────────────────
const MealTimingClock = ({ meals = [] }) => {
    const SIZE = 210, CX = 105, CY = 105, R = 80;
    const hToRad = h => (h / 24) * 2 * Math.PI - Math.PI / 2;
    const pt = (r, a) => ({ x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
    const arc = (r, s, e) => {
        const sp = pt(r, hToRad(s)), ep = pt(r, hToRad(e));
        return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${e-s>12?1:0} 1 ${ep.x} ${ep.y}`;
    };

    // 🔥 iOS Safari 不認識 "YYYY-MM-DD HH:MM:SS"（SQLite 格式），必須換成 T 分隔
    const parseTS = (ts) => {
        if (!ts) return null;
        const d = new Date(ts.replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
    };

    const mealDots = useMemo(() => meals
        .map(m => ({ m, d: parseTS(m.timestamp) }))
        .filter(({ d }) => d !== null)
        .map(({ m, d }) => {
            const h = d.getHours() + d.getMinutes() / 60;
            return { ...pt(R, hToRad(h)), h, cal: m.calories || 0, name: m.name || '' };
        }), [meals]);

    const timingStats = useMemo(() => {
        const timedMeals = meals
            .map(m => ({ m, d: parseTS(m.timestamp) }))
            .filter(({ d }) => d !== null);

        if (timedMeals.length === 0) return null; // 無時間資料

        const total = meals.reduce((s, m) => s + (m.calories || 0), 0);
        const late  = timedMeals
            .filter(({ d }) => d.getHours() >= 20)
            .reduce((s, { m }) => s + (m.calories || 0), 0);
        const hrs = timedMeals
            .map(({ d }) => d.getHours() + d.getMinutes() / 60)
            .sort((a, b) => a - b);

        const firstH = hrs[0];
        const lastH  = hrs[hrs.length - 1];
        const eatingWindow = lastH - firstH;            // 進食窗口（小時）
        const fastingH     = Math.round(24 - eatingWindow); // 估算斷食時間

        const fmt = h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

        return {
            total, late, hrs,
            firstH, lastH, eatingWindow, fastingH,
            lateNightPct: total > 0 ? Math.round(late / total * 100) : 0,
            fmt,
            count: timedMeals.length,
        };
    }, [meals]);

    // 時段顏色（全改為品牌色）
    const dotColor = h => h >= 20 ? C.ember : h >= 17 ? C.black : h >= 11 ? C.coral : C.pebble;

    return (
        <Card accent={C.black} delay={0.20}>
            <div className="flex justify-between items-baseline mb-5">
                <div>
                    <Label>最近的進食時間</Label>
                    <h3 className="text-xl font-black" style={{ color: C.black }}>進食時鐘</h3>
                </div>
                <div className="text-right">
                    {/* ⚠️ 斷食時數 = 24 − 進食窗口。只有一筆紀錄時窗口是 0，
                        直接印出來會變成「24h 斷食」—— 他今天明明吃過了。
                        至少兩筆帶時間的紀錄才算得出窗口，否則只報餐數。 */}
                    {timingStats && timingStats.count >= 2 ? (<>
                        <span className="text-3xl font-black tabular-nums" style={{ color: C.black }}>{timingStats.fastingH}</span>
                        <span className="text-xs font-black ml-1" style={{ color: C.pebble }}>h 斷食</span>
                    </>) : timingStats ? (
                        <span className="text-xs font-black" style={{ color: C.pebble }}>再記一餐才算得出窗口</span>
                    ) : (
                        <span className="text-xs font-black" style={{ color: C.pebble }}>無時間資料</span>
                    )}
                </div>
            </div>

            <div className="flex justify-center mb-4">
                <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                    {/* 外圈軌道 */}
                    <circle cx={CX} cy={CY} r={R} fill="none" stroke={C.stone} strokeWidth={1.5} />
                    {/* 時段弧 */}
                    <path d={arc(R, 5,  10)} fill="none" stroke={C.pebble} strokeWidth={5} strokeLinecap="butt" opacity={0.5} />
                    <path d={arc(R, 11, 14)} fill="none" stroke={C.coral}  strokeWidth={5} strokeLinecap="butt" opacity={0.4} />
                    <path d={arc(R, 17, 21)} fill="none" stroke={C.black}  strokeWidth={5} strokeLinecap="butt" opacity={0.2} />
                    <path d={arc(R, 21, 23.8)} fill="none" stroke={C.ember} strokeWidth={4} strokeLinecap="butt" opacity={0.35} />
                    {/* 刻度 */}
                    {[0,6,12,18].map(h => {
                        const p = pt(R + 12, hToRad(h));
                        return <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                            fontSize={11} fontWeight={900} fill={C.pebble}>{h}</text>;
                    })}
                    {/* 中心 */}
                    {/* 中央的數字要跟圓周上的點同一個來源，否則「3 餐」卻只有 2 個點 */}
                    <text x={CX} y={CY-8} textAnchor="middle" fontSize={26} fontWeight={900} fill={C.black}>{mealDots.length}</text>
                    <text x={CX} y={CY+12} textAnchor="middle" fontSize={11} fontWeight={800} fill={C.pebble} letterSpacing="2">餐點</text>
                    {/* 餐點 */}
                    {mealDots.length > 0
                        ? mealDots.map((d, i) => (
                            <g key={i}>
                                <circle cx={d.x} cy={d.y} r={7}  fill="white" />
                                <circle cx={d.x} cy={d.y} r={5}  fill={dotColor(d.h)} />
                            </g>
                          ))
                        : <text x={CX} y={CY+32} textAnchor="middle" fontSize={11} fill={C.pebble}>今日尚無記錄</text>
                    }
                </svg>
            </div>

            {/* 圖例 */}
            <div className="flex justify-center gap-4 mb-4" style={{ borderTop: `1px solid ${C.stone}`, paddingTop: 12 }}>
                {[
                    [C.pebble, '早餐 5–10h'],
                    [C.coral,  '午餐 11–14h'],
                    [C.black,  '晚餐 17–21h'],
                    [C.ember,  '宵夜 21h+'],
                ].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-1">
                        <div className="w-2 h-2" style={{ background: color }} />
                        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.pebble }}>{label}</span>
                    </div>
                ))}
            </div>

            {/* 洞察 */}
            {(() => {
                // ── 沒有帶時間戳的紀錄 ──
                if (!timingStats) return (
                    <div className="flex items-start gap-3 p-3" style={{ background: C.paper }}>
                        <div className="w-0.5 self-stretch shrink-0" style={{ background: C.stone }} />
                        <p className="text-[11px] font-medium leading-relaxed" style={{ color: C.black + '88' }}>
                            尚未偵測到進食時間。記錄餐點後，這裡會根據你的進食節奏給出個人化建議。
                        </p>
                    </div>
                );

                const { count, firstH, lastH, eatingWindow, fastingH, lateNightPct, fmt } = timingStats;

                // ── 只有一筆記錄，無法算窗口 ──
                if (count === 1) {
                    const h = firstH;
                    const timeStr = fmt(h);
                    let msg = `今日只記錄了一筆（${timeStr}）。`;
                    if (h < 10) msg += '建議補充午餐與晚餐，維持穩定血糖與代謝。';
                    else if (h >= 17) msg += '只有晚間紀錄，白天能量攝取可能不足，建議補充早午餐。';
                    else msg += '多餐制有助於維持穩定能量與代謝率。';
                    return (
                        <div className="flex items-start gap-3 p-3" style={{ background: C.paper }}>
                            <div className="w-0.5 self-stretch shrink-0" style={{ background: C.pebble }} />
                            <p className="text-[11px] font-medium leading-relaxed" style={{ color: C.black + 'aa' }}>{msg}</p>
                        </div>
                    );
                }

                // ── 多筆記錄，完整分析 ──
                let accent = C.pebble;
                let msg = '';

                if (lateNightPct > 30) {
                    // 宵夜熱量佔比過高 → 最優先警示
                    accent = C.ember;
                    msg = `${lateNightPct}% 的熱量在晚上 8 點後攝取，干擾睡眠品質與脂肪代謝。建議在睡前 2–3 小時結束進食，並把碳水挪到中午或訓練後。`;
                } else if (lastH >= 21) {
                    // 最後一餐太晚
                    accent = C.ember;
                    msg = `最後一餐在 ${fmt(lastH)}，略晚。晚上 9 點前結束進食能幫助身體修復與荷爾蒙分泌。`;
                } else if (firstH >= 11) {
                    // 第一餐太晚開始
                    accent = C.pebble;
                    msg = `首次進食在 ${fmt(firstH)}，偏晚開始。早上 10 點前攝取早餐有助於啟動代謝、穩定全天能量。`;
                } else if (fastingH >= 16) {
                    // ⚠️ 這裡刻意「不」慶祝長時間空腹，也不引導使用者把窗口再縮短。
                    //    運動科學規則書禁止建議任何極端斷食法；對這個年齡層的使用者，
                    //    鼓勵壓縮進食時間本身就是風險。只報事實，並提醒吃夠。
                    accent = C.pebble;
                    msg = `進食都集中在 ${Math.round(eatingWindow)} 小時內（${fmt(firstH)} – ${fmt(lastH)}）。窗口這麼短，要確認一天的蛋白質與總熱量有吃夠。`;
                } else if (fastingH >= 12) {
                    accent = C.coral;
                    msg = `進食窗口 ${Math.round(eatingWindow)} 小時，晚間熱量 ${lateNightPct}%，作息穩定。`;
                } else {
                    // 進食窗口過長
                    accent = C.pebble;
                    msg = `進食窗口 ${Math.round(eatingWindow)} 小時（${fmt(firstH)} – ${fmt(lastH)}）。試著把最後一餐提前到晚上 8 點前，讓身體有更長修復時間。`;
                }

                return (
                    <div className="flex items-start gap-3 p-3" style={{ background: C.paper }}>
                        <div className="w-0.5 self-stretch shrink-0" style={{ background: accent }} />
                        <p className="text-[11px] font-medium leading-relaxed" style={{ color: C.black + 'aa' }}>{msg}</p>
                    </div>
                );
            })()}
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 06  食物 ROI 榜
// ─────────────────────────────────────────────────────────────────────────────
const FoodROICard = ({ meals = [] }) => {
    const { heroes, assassins } = useMemo(() => {
        const map = {};
        meals.forEach(m => {
            const k = m.name || '未知';
            if (!map[k]) map[k] = { name: k, protein: 0, fats: 0, calories: 0 };
            map[k].protein  += m.protein  || 0;
            map[k].fats     += m.fats     || 0;
            map[k].calories += m.calories || 0;
        });
        const items    = Object.values(map);
        const totalPro = items.reduce((s, i) => s + i.protein, 0) || 1;
        const totalFat = items.reduce((s, i) => s + i.fats, 0)    || 1;
        // 只列真的有貢獻的：原本不論數值都取前三名，
        // 結果一杯無糖茶會被列進「隱藏脂肪刺客」並標 0g —— 那不是刺客。
        return {
            heroes:    items.filter(i => i.protein > 0).sort((a,b)=>b.protein-a.protein).slice(0,3)
                           .map(i => ({ ...i, pct: Math.round(i.protein/totalPro*100) })),
            assassins: items.filter(i => i.fats > 0).sort((a,b)=>b.fats-a.fats).slice(0,3)
                           .map(i => ({ ...i, pct: Math.round(i.fats/totalFat*100) })),
        };
    }, [meals]);

    const Row = ({ item, color, unit, value, pct, max }) => (
        <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-black uppercase tracking-wide truncate w-16 shrink-0" style={{ color: C.black }}>
                {item.name}
            </span>
            <div className="flex-1 h-px relative" style={{ background: C.stone }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(pct/max*100)}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    className="absolute top-1/2 -translate-y-1/2 h-[3px]" style={{ background: color }} />
            </div>
            <span className="text-[11px] font-black tabular-nums w-8 text-right shrink-0" style={{ color }}>
                {Math.round(value)}{unit}
            </span>
            <span className="text-[11px] font-bold w-6 text-right shrink-0" style={{ color: C.pebble }}>{pct}%</span>
        </div>
    );

    return (
        <Card accent={C.ember} delay={0.25}>
            <div className="flex justify-between items-baseline mb-6">
                <div>
                    <Label>今天吃的</Label>
                    <h3 className="text-xl font-black" style={{ color: C.black }}>食物 ROI 榜</h3>
                </div>
            </div>

            {meals.length === 0 ? (
                <p className="text-center text-xs font-bold py-8" style={{ color: C.pebble }}>今日尚無飲食記錄</p>
            ) : (<>
                {/* 蛋白質英雄 */}
                <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2" style={{ background: C.coral }} />
                        <Label color={C.black}>蛋白質 MVP</Label>
                    </div>
                    {heroes.length === 0
                        ? <p className="text-[11px]" style={{ color: C.pebble }}>今天記錄的餐點都沒有蛋白質。</p>
                        : heroes.map((item, i) => (
                            <Row key={i} item={item} color={C.coral} unit="g"
                                value={item.protein} pct={item.pct} max={heroes[0]?.pct || 1} />
                        ))}
                </div>

                <div style={{ borderTop: `1px solid ${C.stone}` }} className="mb-5" />

                {/* 脂肪刺客 */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2" style={{ background: C.ember }} />
                        <Label color={C.black}>隱藏脂肪刺客</Label>
                    </div>
                    {assassins.length === 0
                        ? <p className="text-[11px]" style={{ color: C.pebble }}>今天沒有明顯的脂肪來源。</p>
                        : assassins.map((item, i) => (
                            <Row key={i} item={item} color={C.ember} unit="g"
                                value={item.fats} pct={item.pct} max={assassins[0]?.pct || 1} />
                        ))}
                </div>

                {/* 洞察 */}
                {heroes[0] && (
                    <div className="flex items-start gap-3 p-3 mt-4" style={{ background: C.paper }}>
                        <div className="w-0.5 self-stretch shrink-0" style={{ background: C.coral }} />
                        <p className="text-[11px] font-medium leading-relaxed" style={{ color: C.black + 'aa' }}>
                            「{heroes[0].name}」今日最強蛋白質來源（{heroes[0].pct}%）。
                            {assassins[0] && assassins[0].name !== heroes[0].name
                                ? `「${assassins[0].name}」帶來了 ${assassins[0].pct}% 的脂肪，下次注意份量。`
                                : ''}
                        </p>
                    </div>
                )}
            </>)}
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 主組件
// ─────────────────────────────────────────────────────────────────────────────
const NutritionAnalysis = ({
    nutritionHistory = [],
    targets          = {},
    meals            = [],
    userId           = 'user1',
    profile          = {},
    activePlan       = null,   // ⚖️ 減脂/增重計劃（進度卡用）
    showTdee         = true,   // 動態代謝估算（會員的進階圖表，見 utils/advancedCharts）
    showMealTiming   = true,   // 進食時鐘（會員的進階圖表）
    locked           = false,  // 免費版：進階圖表的位置只放一張會員卡
}) => {
    const validDays = useMemo(() => sanitize(nutritionHistory), [nutritionHistory]);

    // Data now comes pre-filtered (logged_only=true from backend), so 1 day is enough to show analysis.
    // Cards that genuinely need more days (進度卡的配速列、TrendChartCard) guard themselves.
    if (validDays.length < 1) {
        // ⚖️ 體重進度不依賴飲食紀錄 —— 有計劃就該看得到，
        //    不能因為這幾天沒記飲食就把「我減了幾公斤」一起藏起來。
        return (
            <div className="flex flex-col gap-4 pb-6">
                <CutProgressCard userId={userId} activePlan={activePlan} targets={targets} />
                {/* 沒資料時只顯示該做的事：記錄之後會出現什麼，一張小卡講完 */}
                <Card accent={C.pebble} delay={0.05}>
                    <Label>飲食分析 · 還沒有紀錄</Label>
                    <p className="text-[15px] font-black mb-3" style={{ color: C.black }}>記錄飲食之後，這裡會出現</p>
                    {['七日執行：熱量與蛋白質有沒有吃到', '每日趨勢：哪幾天吃多、哪幾天吃少', '食物排行：哪些東西給你最多蛋白質'].map((t) => (
                        <p key={t} className="text-[12px] font-bold leading-relaxed py-1.5" style={{ color: C.black + 'aa', borderTop: `1px solid ${C.stone}` }}>{t}</p>
                    ))}
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 pb-6">
            {/* ⚖️ 減脂／增重進度 + 配速（永遠顯示，不受「進階圖表」開關影響）——
                「我掉了幾公斤、掉得夠快嗎、還要多久」不是進階分析，
                是使用者最基本的三個問題。原本前兩者被拆成兩張卡、
                而且配速那張還被 advanced 擋住，預設完全看不到。 */}
            <CutProgressCard  userId={userId} activePlan={activePlan} validDays={validDays} targets={targets} />
            {/* 基本分析（永遠顯示）：七日執行報告 */}
            <AdherenceCard    validDays={validDays} targets={targets} />
            {/* 🔬 進階：動態代謝引擎（會員）；免費版在這裡放唯一一張會員卡 */}
            {showTdee && <DynamicTDEECard  validDays={nutritionHistory} userId={userId} profile={profile} />}
            {!showTdee && locked && <MemberLockCard feature="advancedCharts" label="解鎖動態代謝估算" />}
            {/* 基本分析（永遠顯示）：每日趨勢 */}
            <TrendChartCard   validDays={validDays} targets={targets} />
            {/* 🔬 進階：進食時鐘（只在進階圖表開啟時顯示） */}
            {showMealTiming && <MealTimingClock  meals={meals} />}
            {/* 基本分析（永遠顯示）：食物 ROI 榜 */}
            <FoodROICard      meals={meals} />
        </div>
    );
};

export default NutritionAnalysis;
