/**
 * TrainingFocusPlannerMobile — 訓練中控台
 * ══════════════════════════════════════════════════════════════════════
 * 這一頁的角色（2026-08 定案）：**只監測，不生成**。
 *
 * 原本這裡是「一次把三張課表配好」的引導流程。實際做出來之後發現：
 * 跑步與重訓的「組合價值」沒有想像中高 —— 兩邊的計劃生成、進度追蹤、
 * 期末回饋，各自系統本來就都做得很完整了。真正缺的是一個
 * **一次看完三個系統的快捷檢查點**：
 *
 *   · 哪一項還沒開始
 *   · 哪一項走到第幾季、第幾週了
 *   · 哪一項這一輪跑完了、該去回饋換下一輪
 *
 * 所以這裡不再有自己的「計劃」概念，也不存目標 —— 只讀三個系統各自的
 * 真實存檔，把狀態並排顯示，點下去就是各系統自己的頁面。
 * 每一項的週期長度由該系統自己決定（重訓 4 週一季、跑步依計劃、
 * 營養依達標日），這裡不去對齊它們。
 *
 * 唯一保留的跨系統判斷：一週總天數（同期訓練干擾是「週」的事，
 * 跟週期長度無關），因為那是任何單一系統都看不到的資訊。
 *
 * 所有數字來自 utils/trainingFocus.js 的 readSystemCycles（單一真相源），
 * 本檔只負責畫。讀不到就顯示「還沒排」，不虛報。
 */

import './TrainingSystemGlass.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Info } from 'lucide-react';
import { getUserId } from '../utils/auth';
import { haptic } from '../utils/haptics';
import {
    readModuleStatus, readSystemCycles, readSystemDetails, splitLabel,
    readWeeklyStrengthDays, readWeeklyRunSessions, checkWeeklyLoad, readTrainingLinkage,
    strengthSeasonDone,
} from '../utils/trainingFocus';
import { buildWeeklyAgenda, loadWeekInputs, loadStrengthInputs, loadCachedBricks, pickOverloadTarget, loadRunTweaks, saveRunTweak, markAdviceApplied, wasAdviceApplied, clearAdviceApplied } from '../utils/dailyAgenda';
import { readPendingProgram, retryPendingProgram, refreshProgram } from '../utils/trainingProgram';
import apiClient from '../api/client';
import TrainingHistoryCalendar from './TrainingHistoryCalendar';
import { cacheRunCycle } from '../utils/trainingFocus';
import { computeCutProgress } from '../utils/cutProgress';
import { cacheWeekBricks, logicalNow } from '../utils/dailyAgenda';

/** 週一起算，跟 dailyAgenda.buildWeeklyAgenda 的 idx 對齊 */
const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日'];


const C = {
    paper: '#F6F4F1',
    pebble: '#CFC6B8',
    ink: '#161415',
    coral: '#F95C4B',
    ember: '#D94030',
    olive: '#5A7A3A',
};
const RULE = `1px solid ${C.pebble}`;

/* 改期被擋下來的理由 —— 重訓與跑步兩條改期流程共用同一組字。
   兩邊各寫一份的話，其中一邊被改掉就會出現「同一條規則兩種說法」。 */
const MOVE_DENY = {
    sameDay: '現在就在這天',
    needRest: '一週要留 1 天完全休息',
};
const DISPLAY = 'var(--font-display), "Tenor Sans", sans-serif';

const Kicker = ({ children, color = 'rgba(22,20,21,0.38)', style }) => (
    <p style={{
        margin: 0, fontSize: 9, fontWeight: 900, letterSpacing: '0.24em',
        textTransform: 'uppercase', color, fontFamily: DISPLAY, ...style,
    }}>{children}</p>
);

/* 呼吸燈 —— 沿用 WorkoutSessionViewMobile 已在用的 drvnAcceptGlow 節奏
   （Coral、2.2s、克制的光暈）。刻意不重用 BreathingAura：那是 280–340px 的
   心率大氣泡，套進 44px 的日曆格尺寸完全不對，也偏離這頁的瑞士極簡。
   prefers-reduced-motion 一定要能關掉 —— 會呼吸的東西對前庭敏感的人是負擔。 */
const GLOW_CSS = `
@keyframes drvnDayGlow {
    0%, 100% { box-shadow: 0 0 0 1px rgba(249,92,75,0.25), 0 0 12px rgba(249,92,75,0.18); }
    50%      { box-shadow: 0 0 0 1px rgba(249,92,75,0.45), 0 0 22px rgba(249,92,75,0.36); }
}
.drvn-day-glow { animation: drvnDayGlow 2.2s ease-in-out infinite; }

/* 「該去回饋」的呼吸紅邊已經搬到 TrainingSystemGlass.css 的 .is-due ——
   那裡才是這張卡的材質定義處。同一個效果只能有一份（單一真相源）。 */

@media (prefers-reduced-motion: reduce) {
    .drvn-day-glow { animation: none; box-shadow: 0 0 0 1px rgba(249,92,75,0.45); }
}
`;

const RISE = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 460, damping: 34, mass: 0.7 } },
};
const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };

/**
 * 三個系統各自的去處。
 * 沒排 → 去建立；進行中 → 去看課表；跑完 → 去該系統的結算/回饋畫面。
 * 這些畫面三邊本來都有，這裡只負責把人帶過去。
 */
const SYSTEMS = [
    {
        key: 'run',
        title: '跑步',
        empty: '還沒排跑步計劃',
        create: { path: '/cardio-plan-builder' },
        open: { path: '/cardio-microcycle-inbox' },
        settle: { path: '/cardio-microcycle-inbox' },
    },
    {
        key: 'strength',
        title: '重訓',
        empty: '還沒排重訓課表',
        create: { path: '/workout-plan-mobile' },
        open: { path: '/luxury-plan-view-mobile' },
        /* ⚠️ settle 一定要帶 openCycleRecap。少了它，點「這輪跑完了 · 去回饋」
           只會走到計劃頁，什麼都不會跳出來 —— 使用者會以為按鈕壞了。
           入口寫了什麼，到目的地就要真的發生（drvn-interface-standard §9）。 */
        settle: { path: '/luxury-plan-view-mobile', state: { openCycleRecap: true } },
    },
    {
        key: 'nutrition',
        title: '營養',
        empty: '還沒設定營養策略',
        create: { path: '/nutrition-mobile', state: { openPlanner: true } },
        open: { path: '/nutrition-mobile' },
        settle: { path: '/nutrition-mobile', state: { openPlanner: true } },
    },
];

// ══════════════════════════════════════════════════════════════════════
// 一列 = 一個系統
// ══════════════════════════════════════════════════════════════════════

function SystemRow({ sys, has, cycle, details = [], onGo, seasonDone = false }) {
    /* 兩種「該去回饋」：日曆走完（finished），或整季提早練完（seasonDone）。
       兩者都要亮，不然使用者提早練完整季會完全沒有被提醒。 */
    const expired = !!cycle?.finished || seasonDone;
    const pct = cycle ? Math.min(100, Math.round((cycle.weekIndex / cycle.weeks) * 100)) : 0;

    // 右邊那句話就是這一項的全部狀態，不要再補第二句
    const rightText = expired
        ? (seasonDone && !cycle?.finished ? '已完成 · 去回饋' : '已到期 · 去回饋')
        : cycle
            ? `第 ${cycle.weekIndex} / ${cycle.weeks} 週`
            : has ? '已建立' : '還沒排';

    return (
        <motion.div variants={RISE}>
            <motion.button {...pressProps('card')}
                type="button"
                onClick={() => { haptic('light'); onGo(); }}
                className={`training-system-glass training-system-glass--${sys.key}${expired ? ' is-due' : ''}`}
                style={{
                    width: '100%', cursor: 'pointer', textAlign: 'left', display: 'block',
                    padding: '15px 16px 14px', borderRadius: 20, boxSizing: 'border-box',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                        width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: 99, flexShrink: 0,
                        background: expired ? C.ember : has ? C.olive : 'transparent',
                        border: has || expired ? 'none' : `1.5px solid ${C.pebble}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0,
                    }}>
                        {expired
                            ? <span style={{ fontSize: 11, fontWeight: 900, color: '#FFF', lineHeight: 1 }}>!</span>
                            : has && <Check size={11} strokeWidth={3} color="#FFF" />}
                    </span>

                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--system-ink)', flexShrink: 0, letterSpacing: '-0.01em' }}>{sys.title}</span>

                    {/* 重訓是一季一季往下走的，季數放在名字旁邊 */}
                    {cycle?.season > 0 && (
                        <span style={{
                            fontSize: 11, fontWeight: 900, letterSpacing: '0.10em',
                            padding: '2px 6px', borderRadius: 99, flexShrink: 0, whiteSpace: 'nowrap',
                            border: `1px solid ${C.pebble}`, color: 'var(--system-muted)',
                        }}>第 {cycle.season} 季</span>
                    )}

                    {/* ⚠️ minWidth:0 —— 沒有它，這段文字會把整列撐出卡片右緣（390pt 下就破版） */}
                    <span style={{
                        fontSize: 12.5, fontWeight: expired ? 800 : 700, marginLeft: 'auto', minWidth: 0,
                        color: expired ? 'var(--system-action)' : 'var(--system-muted)',
                        display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                        overflow: 'hidden',
                    }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{rightText}</span>
                        <ArrowRight size={13} strokeWidth={2.6} style={{ flexShrink: 0 }} />
                    </span>
                </div>

                {/* 這一輪在練什麼 —— 每一條都是該系統存檔裡的真實數字 */}
                {details.length > 0 && (
                    <p style={{
                        margin: '7px 0 0 28px', fontSize: 11.5, lineHeight: 1.5,
                        color: 'var(--system-muted)', fontWeight: 500,
                    }}>{details.join(' · ')}</p>
                )}

                {cycle ? (
                    <div style={{ height: 3, borderRadius: 99, marginTop: 11, background: 'var(--system-track)', overflow: 'hidden' }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${expired ? 100 : pct}%` }}
                            transition={{ type: 'spring', stiffness: 260, damping: 34, delay: 0.12 }}
                            style={{ height: '100%', borderRadius: 99, background: 'var(--system-action)' }}
                        />
                    </div>
                ) : (
                    <p style={{ margin: '6px 0 0 28px', fontSize: 11.5, color: 'var(--system-muted)' }}>
                        {has ? '進度資料不足，點進去看課表' : sys.empty}
                    </p>
                )}
            </motion.button>
        </motion.div>
    );
}

/**
 * WeekPlan —— 這一週實際怎麼排。
 *
 * 直接用 dailyAgenda.buildWeeklyAgenda（首頁「今日議程」在用的同一支）——
 * 中控台不自己排一套，不然兩個地方會給出不一樣的星期幾。
 * 它會把重訓日與跑步磚落位（跑步繞著重訓排、避開重腿日的隔天），
 * 排不出來就顯示休息。
 */
function WeekPlan({ week, todayIdx, onEditStrength, onEditRun, onMoveRun, onMoveStrength, strengthMoveOptions, runMoveOptions, flagIdx = -1, onGoFlagged }) {
    /* 改期狀態只有一份：哪一天、哪一項。重訓與跑步共用同一個選日面板，
       兩邊的規則、擋人理由、長相都一樣，使用者不用學兩套。 */
    const [moving, setMoving] = useState(null);         // { idx, kind: 'strength' | 'run' }
    const [blockNote, setBlockNote] = useState('');     // 點到排不下的那天時的說明

    const options = useMemo(() => {
        if (!moving) return null;
        const fn = moving.kind === 'strength' ? strengthMoveOptions : runMoveOptions;
        return fn ? fn(moving.idx) : null;
    }, [moving, strengthMoveOptions, runMoveOptions]);

    // 七天全灰 → 直接講原因，不要讓使用者一個一個點才發現沒得選
    const note = options && options.every((o) => !o.ok)
        ? '這週排滿了，先減一天訓練才有空間'
        : blockNote;

    if (!week?.length) return null;

    const movingCell = moving ? week[moving.idx] : null;
    const movingRun = moving?.kind === 'run' ? movingCell?.run : null;
    const movingBrickId = movingRun ? (movingRun.brick_id || movingRun.brickId) : null;
    // 面板標題講的是「你點的那一塊」，不是抽象的「重訓／跑步」
    const movingLabel = !moving ? ''
        : moving.kind === 'strength'
            ? splitLabel(movingCell?.strength?.focus || movingCell?.strength?.name)
            : (movingRun?.distance_km ? `${Math.round(movingRun.distance_km)}K 跑步` : '跑步');
    return (
      <div>
        <div style={{ display: 'flex', gap: 6 }}>
            {week.map((d, i) => {
                const hasS = !!d.strength;
                const hasR = !!d.run;
                const today = i === todayIdx;
                const rest = !hasS && !hasR;
                /* 🩹 2026-08 稽核：buildWeeklyAgenda 早就逐日算好了 warnings 與 highLoad，
                   但這個元件以前只解構 strength / run，這些欄位一個都沒讀 ——
                   「哪一天該調整」的答案一直躺在資料裡沒被畫出來。 */
                const hasWarn = (Array.isArray(d.warnings) && d.warnings.length > 0) || !!d.highLoad;
                // 呼吸燈只給「建議去改的那一天」，不是所有有警告的天都閃，
                // 否則整排都在閃就等於沒有重點。
                const glow = i === flagIdx;
                const runBrickId = hasR ? (d.run.brick_id || d.run.brickId) : null;
                /* 被標記那天：直接套用建議（合併/改期）。
                   跑步格：點下去改期（挑星期）——距離/負荷才進編輯器。
                   純重訓格：點下去進課表編輯（重訓日決定跑步能排哪）。 */
                const onCell = () => {
                    haptic('light');
                    if (glow && onGoFlagged) { onGoFlagged(); return; }
                };
                const clickable = glow && !!onGoFlagged;
                /* 點哪一塊就改哪一項 —— 同一天同時有重訓和跑步時，
                   使用者不必先選「要動哪個」，直接點想動的那塊。 */
                const pick = (kind) => (e) => {
                    e.stopPropagation(); haptic('light');
                    setBlockNote('');
                    setMoving((cur) => (cur && cur.idx === i && cur.kind === kind ? null : { idx: i, kind }));
                };
                const pickStrength = pick('strength');
                const pickRun = pick('run');
                const picking = moving?.idx === i;
                /* 正在挑日子時，可以放的那幾天直接在這排亮起來 ——
                   「點你要動的那塊 → 點要放的那天」，不必先看下面的面板。 */
                const opt = moving && options ? options[i] : null;
                const landable = !!(opt?.ok);
                const drop = () => {
                    haptic('light');
                    if (!landable) { setBlockNote(opt?.reason || ''); return; }
                    if (moving.kind === 'run') {
                        if (onMoveRun && movingBrickId) onMoveRun(movingBrickId, i);
                    } else if (onMoveStrength) {
                        onMoveStrength(moving.idx, i);
                    }
                    setMoving(null); setBlockNote('');
                };
                return (
                    <motion.div
                        key={i}
                        variants={RISE}
                        onClick={moving && !picking ? drop : clickable ? onCell : undefined}
                        style={{
                            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 5,
                            cursor: (moving && !picking) || clickable ? 'pointer' : 'default',
                            outline: picking ? `2px solid ${C.coral}` : 'none', outlineOffset: 2, borderRadius: 10,
                            // 挑日子時，放不下的那幾天退到背景，只留得選的那幾天
                            opacity: moving && !picking && !landable ? 0.32 : 1,
                            transition: 'opacity .16s ease',
                        }}
                    >
                        {/* ⚠️ 390pt 下一格只有約 44px，放得下 3 個字。
                            以前寫成「一 · 今天」= 4 字，每一次都折成兩行 ——
                            今天改用顏色＋底線標，不用多出來的字標。 */}
                        <span style={{
                            fontSize: 12, fontWeight: today ? 900 : 800, letterSpacing: '0.04em',
                            color: today ? C.coral : 'rgba(22,20,21,0.38)',
                            whiteSpace: 'nowrap', lineHeight: 1.2, paddingBottom: 2,
                            borderBottom: `2px solid ${today ? C.coral : 'transparent'}`,
                        }}>{WEEKDAY_ZH[i]}</span>

                        <div
                            className={glow ? 'drvn-day-glow' : undefined}
                            title={hasWarn ? d.warnings?.join('\n') : undefined}
                            style={{
                            position: 'relative',
                            width: '100%', minHeight: 68, borderRadius: 12, padding: '8px 3px',
                            background: moving && !picking && landable
                                ? 'rgba(249,92,75,0.07)'
                                : rest ? 'transparent' : 'rgba(22,20,21,0.04)',
                            /* 呼吸燈刻意只走 box-shadow、不動 border —— 「今天」用的是實線外框，
                               兩者疊在同一格時才不會打架（2026-08 稽核）。 */
                            border: moving && !picking && landable
                                ? `1.5px dashed ${C.coral}`
                                : today ? `1.5px solid ${C.coral}`
                                    : rest ? `1px dashed ${C.pebble}` : '1px solid rgba(22,20,21,0.10)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                        }}>
                            {/* 有警告但不是建議優先改的那天 → 靜態小點，不搶注意力 */}
                            {hasWarn && !glow && (
                                <span style={{
                                    position: 'absolute', top: 3, right: 3,
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: 'rgba(217,64,48,0.70)',
                                }} />
                            )}
                            {hasS && (
                                <span
                                    onClick={onMoveStrength ? pickStrength : undefined}
                                    style={{
                                        fontSize: 14, fontWeight: 800, lineHeight: 1.15, textAlign: 'center',
                                        color: C.paper, background: C.ink, borderRadius: 7, padding: '5px 9px',
                                        cursor: onMoveStrength ? 'pointer' : 'default',
                                    }}>{splitLabel(d.strength.focus || d.strength.name)}</span>
                            )}
                            {hasR && (
                                <span
                                    onClick={onMoveRun && runBrickId ? pickRun : undefined}
                                    style={{
                                        fontSize: 14, fontWeight: 800, lineHeight: 1.15, textAlign: 'center',
                                        color: '#FFF', background: C.coral, borderRadius: 7, padding: '5px 6px',
                                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        cursor: onMoveRun && runBrickId ? 'pointer' : 'default',
                                    }}>{d.run.distance_km ? `${Math.round(d.run.distance_km)}K` : '跑步'}</span>
                            )}
                            {rest && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.34)' }}>休息</span>
                            )}
                        </div>
                    </motion.div>
                );
            })}
        </div>

        {/* 改期面板：重訓與跑步共用。排不下的那幾天直接變灰，點下去說明為什麼 ——
            能不能排是把候選排法丟回排課函式跑出來的，不是另寫一套規則。 */}
        {moving && options && (
            <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    marginTop: 10, padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.12)',
                }}
            >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
                    把週{WEEKDAY_ZH[moving.idx]}的「{movingLabel}」改到哪一天？
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {WEEKDAY_ZH.map((zh, j) => {
                        const opt = options[j] || { ok: false, reason: '' };
                        const here = j === moving.idx;
                        const accent = moving.kind === 'run' ? C.coral : C.ink;
                        return (
                            <motion.button {...pressProps('row')} key={j} type="button"
                                onClick={() => {
                                    if (!opt.ok) { haptic('light'); setBlockNote(opt.reason || ''); return; }
                                    if (moving.kind === 'run') {
                                        if (onMoveRun && movingBrickId) onMoveRun(movingBrickId, j);
                                    } else if (onMoveStrength) {
                                        onMoveStrength(moving.idx, j);
                                    }
                                    setMoving(null); setBlockNote('');
                                }}
                                style={{
                                    flex: 1, padding: '8px 0', borderRadius: 8,
                                    cursor: opt.ok ? 'pointer' : 'default',
                                    fontSize: 12, fontWeight: 800,
                                    border: here ? `1.5px solid ${accent}` : `1px solid ${opt.ok ? 'rgba(22,20,21,0.28)' : 'rgba(22,20,21,0.10)'}`,
                                    background: here ? 'rgba(22,20,21,0.08)' : '#fff',
                                    color: C.ink, opacity: opt.ok ? 1 : 0.3,
                                }}>{zh}</motion.button>
                        );
                    })}
                </div>
                {note && (
                    <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: C.coral }}>
                        {note}
                    </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <motion.button {...pressProps('row')} type="button"
                        onClick={() => { setMoving(null); setBlockNote(''); }}
 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        取消
                    </motion.button>
                    {moving.kind === 'strength' && onEditStrength && (
                        <motion.button {...pressProps('row')} type="button" onClick={onEditStrength}
 style={{ fontSize: 11, fontWeight: 700, color: C.coral, background: 'none', border: 'none', cursor: 'pointer' }}>
                            改課表內容
                        </motion.button>
                    )}
                    {moving.kind === 'run' && onEditRun && (
                        <motion.button {...pressProps('row')} type="button" onClick={onEditRun}
 style={{ fontSize: 11, fontWeight: 700, color: C.coral, background: 'none', border: 'none', cursor: 'pointer' }}>
                            改距離強度
                        </motion.button>
                    )}
                </div>
            </motion.div>
        )}
      </div>
    );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

export default function TrainingFocusPlannerMobile({ userId: propUserId }) {
    const navigate = useNavigate();
    const location = useLocation();
    const userId = propUserId || getUserId();

    const [status, setStatus] = useState(() => readModuleStatus(userId));
    const [cycles, setCycles] = useState(() => readSystemCycles(userId));
    // 每次重讀存檔就 +1，讓底下的衍生計算跟著重算（不用把 state 當依賴）
    const [tick, setTick] = useState(0);
    const [retrying, setRetrying] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const pendingProgram = readPendingProgram(userId);
    // 進中控時先自動補存一次（不用使用者看懂「同步」是什麼）；只有自動補存失敗才顯示補存卡
    const [autoRetrying, setAutoRetrying] = useState(() => !!readPendingProgram(userId));
    useEffect(() => {
        if (!readPendingProgram(userId)) { setAutoRetrying(false); return undefined; }
        let alive = true;
        retryPendingProgram(userId, apiClient)
            .catch(() => {})
            .finally(() => { if (alive) { setAutoRetrying(false); setTick(n => n + 1); } });
        return () => { alive = false; };
    }, [userId]);
    // 「這一週怎麼排」的規則說明（收在「？」裡，預設收起）
    const [showWeekRule, setShowWeekRule] = useState(false);

    /* 隨時保持最新：回到前景、切分頁、路由變動、每分鐘重算。
       「這一輪跑完了」是會自己到期的事，不該等使用者重新整理才發現。 */
    useEffect(() => {
        const refresh = () => {
            setStatus(readModuleStatus(userId));
            setCycles(readSystemCycles(userId));
            setTick((n) => n + 1);
        };
        refresh();
        const timer = setInterval(refresh, 60000);
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', refresh);
        window.addEventListener('training-program-changed', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('storage', refresh);
            window.removeEventListener('training-program-changed', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [userId, location.key]);

    useEffect(() => {
        let active = true;
        const refresh = () => refreshProgram(userId, apiClient, () => active)
            .then(() => { /* 同步成功不需要通知使用者 —— 他沒要求做這件事 */ })
            // 連不上就安靜用本地資料 —— 「目前是本機資料，連上網會自動更新」是
            // 講系統做了什麼，不是使用者要做什麼（文案規則 §3：禁止系統視角）
            .catch(() => { if (active) setSyncMessage(''); });
        refresh();
        window.addEventListener('focus', refresh);
        window.addEventListener('online', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
    }, [userId, location.key]);

    /* 唯一的跨系統判斷：一週總天數。
       同期訓練干擾是「週」的事，跟各自的週期長度無關 ——
       而且這是任何單一系統都看不到的資訊，只有中控台算得出來。 */
    // 每一列的細節（這一輪在練什麼）
    const details = useMemo(() => {
        void tick;
        try { return readSystemDetails(userId); } catch { return { run: [], strength: [], nutrition: [] }; }
    }, [userId, tick]);

    /* 這一週實際怎麼排 —— 用首頁「今日議程」的同一支排程函式，
       中控台不自己排一套，避免兩個地方講的星期幾不一樣。 */
    const week = useMemo(() => {
        void tick;
        try {
            // 跟首頁同一份輸入 —— 組 inputs 的邏輯只有 dailyAgenda.loadWeekInputs 一份
            const inputs = loadWeekInputs(userId);
            if (!inputs?.plan?.weeks?.length && !inputs.cardioBricks.length) return null;
            return buildWeeklyAgenda(inputs);
        } catch { return null; }
    }, [userId, tick]);

    // 今天是週幾（週一 = 0）
    // 跟首頁 getTodayAgenda 同一條 06:00 日界線；跟著 tick 重算，頁面開著跨日也會換到新的一天
    const todayIdx = useMemo(() => { void tick; return (logicalNow().getDay() + 6) % 7; }, [tick]);

    const load = useMemo(() => {
        void tick;   // 重讀存檔時一起重算
        let strengthDays = 0, runSessions = 0;
        try { strengthDays = readWeeklyStrengthDays(userId); } catch { /* */ }
        try { runSessions = readWeeklyRunSessions(userId); } catch { /* */ }
        if (!strengthDays || !runSessions) return null;
        const r = checkWeeklyLoad({ strengthDays, runSessions });
        return r.severity === 'ok' ? null : r;
    }, [userId, tick]);

    /* 🎯 把「這週太滿」翻譯成「所以是週幾要動、要動什麼、點下去去哪」。
       checkWeeklyLoad 只知道總量、week 只知道逐日細節，pickOverloadTarget 是那座橋。
       呼吸燈要亮哪一格、警示卡的行動按鈕要帶去哪，都只認這一個來源，
       避免兩個功能各自猜一次「是哪一天」而給出不同答案。 */
    const overload = useMemo(() => {
        void tick;
        try {
            const t = pickOverloadTarget(week, load);
            /* 這一週的這一則已經按過「直接幫我改」就不再跳。
               旗標綁週次也綁 brickId：下週又排太滿、或這次要動的是別趟，
               都還是會出現（介面標準 §8）。 */
            if (t && wasAdviceApplied(userId, t.reason, t.brickId)) return null;
            return t;
        } catch { return null; }
    }, [week, load, userId, tick]);

    /* ── 這樣排到底行不行 ─────────────────────────────────────────
       使用者隨時可以改日期，所以每一次改完都要有一個明確的答案：
       可以、有風險（風險是什麼）、還是排太滿（該動哪一天）。
       判斷來源就是排課函式自己逐日算出來的 warnings 與 checkWeeklyLoad —— 
       不另外寫一套規則，畫面上的每一句話才會跟實際排法一致。 */
    const verdict = useMemo(() => {
        if (!week?.length) return null;

        const warns = [];
        week.forEach((d, i) => {
            (d.warnings || []).forEach((w) => {
                warns.push(`週${WEEKDAY_ZH[i]}：${String(w).replace(/^⚠️\s*/, '')}`);
            });
        });
        const unique = [...new Set(warns)];

        // 排太滿是最嚴重的一種，而且 pickOverloadTarget 已經算好該動哪一天
        if (load && load.severity !== 'ok') {
            return {
                tone: load.severity === 'block' ? 'block' : 'warn',
                title: overload ? overload.title : load.title,
                bullets: overload ? overload.bullets : [load.message].filter(Boolean),
            };
        }
        if (unique.length) {
            return {
                tone: 'warn',
                title: unique.length > 1
                    ? `可以這樣排，但有 ${unique.length} 點要注意`
                    : '可以這樣排，但有一點要注意',
                bullets: unique.slice(0, 3),
            };
        }

        const strengthDays = week.filter((d) => d.strength).length;
        const runDays = week.filter((d) => d.run).length;
        if (strengthDays === 0 && runDays === 0) return null;   // 什麼都沒排就不必評論
        const restIdx = week.findIndex((d) => !d.strength && !d.run);
        const parts = [];
        if (strengthDays) parts.push(`重訓 ${strengthDays} 天`);
        if (runDays) parts.push(`跑步 ${runDays} 趟`);
        const shape = parts.join(' ＋ ');
        return {
            tone: 'ok',
            title: '這樣排沒問題',
            bullets: [restIdx >= 0 ? `${shape}，週${WEEKDAY_ZH[restIdx]}完全休息` : shape],
        };
    }, [week, load, overload]);

    /* 剛剛自動改了什麼（給「已幫你改好 · 復原」那一行用）。
       使用者回饋：按了按鈕卻只是被丟進編輯器 → 現在兩種情況都直接改完，
       但一定要留一鍵復原，否則等於幫使用者做了他沒同意的決定。 */
    const [lastFix, setLastFix] = useState(null);

    // 剛剛改了什麼（手動改期的收據）。跟 lastFix 互斥，畫面上永遠只有最新那一次。
    const [changeNote, setChangeNote] = useState('');

    /* 收據要跟現況對得起來才顯示。
       之前這一行會一直掛在那裡 —— 課表後來又被改過，它還在講上一次的事，
       於是畫面上出現「已把週一的跑步併到週五」配上「週四那趟可以合併」。 */
    const fixStillTrue = useCallback((fix) => {
        if (!fix) return false;
        if (fix.kind !== 'merge' || fix.toDayIndex == null) return true;
        const at = week?.[fix.toDayIndex]?.run;
        return !!at && (at.brick_id || at.brickId) === fix.brickId;
    }, [week]);
    const showFix = lastFix && fixStillTrue(lastFix);


    const goFixOverload = useCallback(() => {
        if (!overload) return;
        haptic('light');
        // 「合併」= 改星期 → 寫 dayOverrides。
        // 「減量」= 改強度/距離 → 寫 runTweaks。兩者都在本頁直接完成，不再跳編輯器。
        if (overload.canAutoApply && overload.brickId != null) {
            if (overload.how === 'merge-run') {
                try {
                    const key = `u_${userId}_run_day_overrides`;
                    const ov = JSON.parse(localStorage.getItem(key) || '{}') || {};
                    ov[overload.brickId] = overload.mergeToDayIndex;
                    localStorage.setItem(key, JSON.stringify(ov));
                } catch { /* */ }
                setLastFix({
                    kind: 'merge', brickId: overload.brickId, toDayIndex: overload.mergeToDayIndex,
                    text: `已把週${overload.weekday}的 ${overload.fromLabel} 併到週${overload.mergeToWeekday} 的重訓日後面`,
                });
            } else {
                saveRunTweak(userId, overload.brickId, overload.reduceTweak);
                setLastFix({
                    kind: 'reduce', brickId: overload.brickId,
                    text: `已把週${overload.weekday}的 ${overload.fromLabel} 改成 ${overload.toLabel}`,
                });
            }
            markAdviceApplied(userId, overload.reason, overload.brickId);
            setChangeNote('');
            haptic('success');
            setTick((n) => n + 1);   // 立即重排、畫面同步
            return;
        }
        navigate(overload.route, { state: overload.navState });
    }, [overload, navigate, userId]);

    const undoFixOverload = useCallback(() => {
        if (!lastFix) return;
        haptic('light');
        if (lastFix.kind === 'merge') {
            try {
                const key = `u_${userId}_run_day_overrides`;
                const ov = JSON.parse(localStorage.getItem(key) || '{}') || {};
                delete ov[lastFix.brickId];
                localStorage.setItem(key, JSON.stringify(ov));
            } catch { /* */ }
        } else {
            saveRunTweak(userId, lastFix.brickId, null);
        }
        // 排程退回去了，那一則建議就該重新出現 —— 不清旗標會被永久壓住
        clearAdviceApplied(userId, 'weekly_overload', lastFix.brickId);
        setLastFix(null);
        setTick((n) => n + 1);
    }, [lastFix, userId]);

    // 手動改期：把某支跑步磚移到指定星期（供週曆格點選 / 未來拖動用），寫回並即時重排。
    const moveRunToDay = useCallback((brickId, dayIndex) => {
        if (!brickId || !(dayIndex >= 0 && dayIndex < 7)) return;
        const fromIdx = (week || []).findIndex(
            (d) => d?.run && (d.run.brick_id || d.run.brickId) === brickId
        );
        const runAt = fromIdx >= 0 ? week[fromIdx].run : null;
        const label = runAt?.distance_km ? `${Math.round(runAt.distance_km)}K` : '跑步';
        setLastFix(null);
        setChangeNote(fromIdx >= 0
            ? `已把週${WEEKDAY_ZH[fromIdx]}的 ${label} 移到週${WEEKDAY_ZH[dayIndex]}`
            : `已把 ${label} 移到週${WEEKDAY_ZH[dayIndex]}`);
        try {
            const key = `u_${userId}_run_day_overrides`;
            const ov = JSON.parse(localStorage.getItem(key) || '{}') || {};
            ov[brickId] = dayIndex;
            localStorage.setItem(key, JSON.stringify(ov));
        } catch { /* */ }
        haptic('success');
        setTick((n) => n + 1);
    }, [userId, week]);

    /* ══════════════════════════════════════════════════════════════
       重訓改期 —— 日期調整集中在這張週課表上做，計劃頁不再各調一套。

       防呆不自己寫一套規則，而是「把候選排法丟回 buildWeeklyAgenda 跑一次」，
       看排出來的結果能不能接受。跑步是繞著重訓落位的，重訓一動跑步就跟著動，
       任何自己手算的規則都會跟真正的排課結果對不上。
       ══════════════════════════════════════════════════════════════ */
    const IDX_TO_JSDAY = (idx) => (idx + 1) % 7;   // 週一起算 → JS getDay（週日=0）

    const strengthMoveOptions = useCallback((fromIdx) => {
        const blank = Array.from({ length: 7 }, () => ({ ok: false, reason: '' }));
        if (!(fromIdx >= 0 && fromIdx < 7)) return blank;
        let inputs, bricks = [], dayOverrides = {}, tweaks = {};
        try {
            inputs = loadStrengthInputs(userId);
            bricks = loadCachedBricks(userId) || [];
            dayOverrides = JSON.parse(localStorage.getItem(`u_${userId}_run_day_overrides`) || '{}') || {};
            tweaks = loadRunTweaks(userId);
        } catch { return blank; }
        const dayNum = week?.[fromIdx]?.strength?.dayNumber;
        if (!dayNum) return blank;

        // 目前的重訓排法。空的代表還在用預設分佈 —— 那就先把預設寫成明確的排法，
        // 否則改一天會讓其餘幾天跟著跳掉。
        let base = { ...(inputs.weeklySchedule || {}) };
        if (Object.keys(base).length === 0) {
            (week || []).forEach((d, i) => {
                if (d?.strength?.dayNumber) base[IDX_TO_JSDAY(i)] = d.strength.dayNumber;
            });
        }

        return Array.from({ length: 7 }, (_, toIdx) => {
            if (toIdx === fromIdx) return { ok: false, reason: MOVE_DENY.sameDay };
            const occupied = Object.entries(base).some(
                ([js, n]) => Number(n) !== dayNum && ((Number(js) + 6) % 7) === toIdx
            );
            if (occupied) return { ok: false, reason: '那天已經有重訓' };

            const cand = {};
            Object.entries(base).forEach(([js, n]) => { if (Number(n) !== dayNum) cand[js] = n; });
            cand[IDX_TO_JSDAY(toIdx)] = dayNum;

            let simulated;
            try {
                simulated = buildWeeklyAgenda({
                    ...inputs, weeklySchedule: cand,
                    cardioBricks: bricks, dayOverrides, runTweaks: tweaks,
                });
            } catch { return { ok: false, reason: '' }; }

            if (!simulated.some((d) => !d.strength && !d.run)) {
                return { ok: false, reason: MOVE_DENY.needRest };
            }
            // 排得下，但會壓到跑步 —— 讓使用者自己決定，不擋。
            const clash = simulated[toIdx];
            const warn = clash?.run
                ? (clash.warnings || []).find((w) => w.includes('質量跑') || w.includes('同日')) || ''
                : '';
            return { ok: true, reason: '', warn };
        });
    }, [userId, week]);

    /* 跑步改期的可選日 —— 跟重訓走同一套：把候選排法丟回 buildWeeklyAgenda
       跑一次再看結果。兩邊的互動與擋人理由一致，使用者才不用學兩套。 */
    const runMoveOptions = useCallback((fromIdx) => {
        const blank = Array.from({ length: 7 }, () => ({ ok: false, reason: '' }));
        if (!(fromIdx >= 0 && fromIdx < 7)) return blank;
        const run = week?.[fromIdx]?.run;
        const bid = run && (run.brick_id || run.brickId);
        if (!bid) return blank;

        let inputs, bricks = [], dayOverrides = {}, tweaks = {};
        try {
            inputs = loadStrengthInputs(userId);
            bricks = loadCachedBricks(userId) || [];
            dayOverrides = JSON.parse(localStorage.getItem(`u_${userId}_run_day_overrides`) || '{}') || {};
            tweaks = loadRunTweaks(userId);
        } catch { return blank; }

        return Array.from({ length: 7 }, (_, toIdx) => {
            if (toIdx === fromIdx) return { ok: false, reason: MOVE_DENY.sameDay };
            const other = week[toIdx]?.run;
            if (other && (other.brick_id || other.brickId) !== bid) {
                return { ok: false, reason: '那天已經有一趟跑步' };
            }
            let simulated;
            try {
                simulated = buildWeeklyAgenda({
                    ...inputs, cardioBricks: bricks, runTweaks: tweaks,
                    dayOverrides: { ...dayOverrides, [bid]: toIdx },
                });
            } catch { return { ok: false, reason: '' }; }
            if (!simulated.some((d) => !d.strength && !d.run)) {
                return { ok: false, reason: MOVE_DENY.needRest };
            }
            return { ok: true, reason: '' };
        });
    }, [userId, week]);

    const moveStrengthToDay = useCallback((fromIdx, toIdx) => {
        if (!(fromIdx >= 0 && fromIdx < 7) || !(toIdx >= 0 && toIdx < 7) || fromIdx === toIdx) return;
        const dayNum = week?.[fromIdx]?.strength?.dayNumber;
        if (!dayNum) return;
        const label = splitLabel(week[fromIdx].strength.focus || week[fromIdx].strength.name) || '重訓';
        setLastFix(null);
        setChangeNote(`已把週${WEEKDAY_ZH[fromIdx]}的 ${label} 移到週${WEEKDAY_ZH[toIdx]}`);
        try {
            const { weeklySchedule, activeWeek, plan } = loadStrengthInputs(userId);
            let base = { ...(weeklySchedule || {}) };
            if (Object.keys(base).length === 0) {
                (week || []).forEach((d, i) => {
                    if (d?.strength?.dayNumber) base[IDX_TO_JSDAY(i)] = d.strength.dayNumber;
                });
            }
            const next = {};
            Object.entries(base).forEach(([js, n]) => { if (Number(n) !== dayNum) next[js] = n; });
            next[IDX_TO_JSDAY(toIdx)] = dayNum;

            const all = JSON.parse(localStorage.getItem(`weeklyTrainingDays_${userId}`) || '{}') || {};
            // 重訓的星期是「每週固定」的，不是只改這一週 —— 只改當週的話
            // 下週會跳回原本的日子，使用者會以為沒存到。
            // 週數要以「計劃有幾週」為準。只寫已存在的 key 的話，
            // 使用者先進中控台改日期、還沒開過計劃頁時，第 2 週之後會沒有排程而掉回預設。
            const totalWeeks = Math.max(
                Object.keys(all).length, plan?.weeks?.length || 0, activeWeek, 1
            );
            for (let w = 1; w <= totalWeeks; w++) all[w] = next;
            localStorage.setItem(`weeklyTrainingDays_${userId}`, JSON.stringify(all));
            // 同步後端：換裝置 / 重裝之後才不會拿到舊的星期
            apiClient.put(`/api/plan/${userId}/schedule`, { user_id: userId, schedule: all })
                .catch(() => { /* 離線也要能改，本地已經寫進去了 */ });
        } catch { return; }
        haptic('success');
        setTick((n) => n + 1);
    }, [userId, week]);

    // 重訓整季提早練完 → 也算「該去回饋」，標題的數字要把它算進去
    const seasonDone = useMemo(() => {
        void tick;
        try { return strengthSeasonDone(userId); } catch { return false; }
    }, [userId, tick]);

    const expiredKeys = SYSTEMS
        .filter((s) => cycles[s.key]?.finished || (s.key === 'strength' && seasonDone))
        .map((s) => s.key);
    const notStarted = SYSTEMS.filter((s) => !status[s.key]);
    const live = SYSTEMS.map((s) => cycles[s.key]).filter((c) => c && !c.finished);
    const soonest = live.length ? live.reduce((a, b) => (b.daysLeft < a.daysLeft ? b : a)) : null;

    const linkage = readTrainingLinkage(userId);
    const headline = expiredKeys.length > 0
        ? `有 ${expiredKeys.length} 項跑完了`
        : notStarted.length === SYSTEMS.length
            ? '還沒有任何計劃'
            : notStarted.length > 0
                ? `還有 ${notStarted.length} 項沒排`
                : '三項都在跑';

    /* 整頁只留這一句 —— 標題講「現在是什麼狀況」，這句講「下一步做什麼」。
       再多一句就是把標題重講一次（drvn-interface-standard §4.1）。 */
    const sub = expiredKeys.length > 0
        ? '跑完的那一項去做回饋'
        : notStarted.length === SYSTEMS.length
            ? '從任一項開始都可以'
            : soonest
                ? `最近一項還有 ${soonest.daysLeft} 天結束`
                : '點任一項看課表';

    const go = useCallback((sys) => {
        const cyc = cycles[sys.key];
        const needsReview = cyc?.finished || (sys.key === 'strength' && seasonDone);
        const dest = needsReview ? sys.settle : status[sys.key] ? sys.open : sys.create;
        navigate(dest.path, { state: { ...(dest.state || {}), returnTo: '/training-focus' } });
    }, [navigate, cycles, status, seasonDone]);

    return (
        <div style={{
            minHeight: '100dvh', background: C.paper,
            /* 頁首是 fixed 的（見下），內容要自己讓開它的高度：
               10（上）+ 34（鈕）+ 14（下）+ 1（細線）≈ 59 */
            paddingTop: 'calc(59px + env(safe-area-inset-top))',
            paddingBottom: 'calc(48px + env(safe-area-inset-bottom))',
        }}>
            <style>{GLOW_CSS}</style>

            {/* 頁首 —— 用 portal 掛到 body 再 fixed。
                ⚠️ 這裡原本是 position:sticky，但整個路由被包在一個有 transform 的
                   motion.div 裡（App.jsx 的 SwissRouteLateral），加上 html 有
                   overflow-x:hidden —— 在 iOS WKWebView 上 sticky 會直接失效，
                   頁首跟著捲走，標題就穿到狀態列底下（使用者說的「破版」）。
                   portal + fixed 不吃父層的 transform，所以一定會黏住。 */}
            {createPortal(
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60, background: C.paper,
                paddingTop: 'calc(10px + env(safe-area-inset-top))',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 20px 14px' }}>
                    <motion.button {...pressProps('row')}
 type="button" onClick={() => { haptic('light'); navigate('/mobile-home'); }}
 aria-label="返回"
 style={{
 width: 34, height: 34, borderRadius: 10, border: RULE, background: 'transparent',
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
 }}
 >
                        <ArrowLeft size={16} strokeWidth={2.2} color={C.ink} />
                    </motion.button>
                    <Kicker style={{ flex: 1, minWidth: 0 }}>訓練中控台</Kicker>
                </div>
                <div style={{ height: 1, background: C.pebble, opacity: 0.7 }} />
            </div>, document.body)}

            <motion.div
                variants={STAGGER} initial="hidden" animate="show"
                /* 🔴 字色釘死為墨色：--text-primary 在 design-tokens.css 被定義成
                   rgba(255,255,255,0.95)，body 繼承它 → 這頁任何沒明寫顏色的文字
                   都會變成白字印在米色紙上，等於看不見。不要靠繼承。 */
                style={{ padding: '18px 20px 0', color: C.ink }}
            >
                <motion.div variants={RISE}>
                    <Kicker color={expiredKeys.length ? C.ember : 'rgba(22,20,21,0.38)'}>
                        {expiredKeys.length ? '可以結算' : '總覽'}
                    </Kicker>
                </motion.div>
                <motion.h1
                    variants={RISE}
                    style={{
                        margin: '9px 0 0', fontSize: 27, lineHeight: 1.18, fontWeight: 400,
                        letterSpacing: '-0.02em', color: C.ink, fontFamily: DISPLAY,
                    }}
                >{headline}</motion.h1>
                {linkage && <p role="status" style={{ margin: '12px 0 0', padding: 12, border: RULE, borderRadius: 12, fontSize: 13, lineHeight: 1.7, color: linkage.status === 'separated' ? C.ember : C.ink }}>{linkage.message}</p>}
                <motion.p
                    variants={RISE}
                    style={{ margin: '9px 0 24px', fontSize: 13, lineHeight: 1.65, color: 'rgba(22,20,21,0.55)' }}
                >{sub}</motion.p>

                {/* 上次存課表時網路斷了：課表只在這支手機上、還沒存到雲端。
                    進來時會先自動補存一次；補存成功這張卡就不會出現，只有連不上時才請使用者自己按。 */}
                {pendingProgram && !autoRetrying && <section aria-label="課表還沒存到雲端" style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid rgba(249,92,75,0.35)', background: 'rgba(249,92,75,0.06)', marginTop: 12 }}>
                    <strong style={{ fontSize: 14, color: C.ink }}>新課表還沒存到雲端</strong>
                    <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(22,20,21,0.62)', margin: '4px 0 10px' }}>
                        上次存課表時網路斷了，課表現在只在這支手機上。按一下補存，不會變成兩份。
                    </p>
                    <motion.button {...pressProps('pill')} type="button" disabled={retrying} onClick={async () => {
                        if (retrying) return;
                        setRetrying(true); setSyncMessage('');
                        try { await retryPendingProgram(userId, apiClient); setSyncMessage('已存到雲端'); }
                        catch { setSyncMessage('還是連不上，等網路穩定再按一次'); }
                        finally { setRetrying(false); setTick(n => n + 1); }
                    }} style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: C.ink, color: C.paper, fontSize: 13, fontWeight: 800, cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.6 : 1 }}>
                        {retrying ? '存檔中…' : '補存課表'}
                    </motion.button>
                </section>}
                {syncMessage && <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: syncMessage === '已存到雲端' ? C.olive : C.coral }}>{syncMessage}</p>}
                {/* 計劃設計表單已移除：建立／開始計劃回到各系統自己的頁面（下方每一列點進去）。 */}
                {/* 2026-09：「定期進度回報」已移除。
                    中控只負責「看課程怎麼安排」與「各計劃進度」；
                    回饋回到各系統自己的計劃頁做，並由週期結束的通知帶使用者過去。 */}

                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 要處理的（跑完了、該去回饋）排最上面 —— 跟跑步頁「下一個目標置頂」同一個規則 */}
                    {[...SYSTEMS].sort((a, b) => Number(expiredKeys.includes(b.key)) - Number(expiredKeys.includes(a.key))).map((sys) => (
                        <React.Fragment key={sys.key}><SystemRow
                            key={sys.key}
                            sys={sys}
                            has={!!status[sys.key]}
                            cycle={cycles[sys.key]}
                            details={details[sys.key] || []}
                            onGo={() => go(sys)}
                            seasonDone={sys.key === 'strength' && seasonDone}
                        /></React.Fragment>
                    ))}
                </div>

                {/* 這一週怎麼排 —— 三個系統合起來才看得出來的東西 */}
                {week && (
                    <motion.div variants={RISE} style={{ marginTop: 24 }}>
                        <div style={{
                            paddingBottom: 12, display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', gap: 10,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                                <Kicker>這一週怎麼排</Kicker>
                                {/* 沒有這一行，沒有人知道格子點得下去 */}
                                <span style={{
                                    fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.38)',
                                    whiteSpace: 'nowrap',
                                }}>點課表可改期</span>
                            </div>
                            {/* 排法規則是「看了會安心、但不必每次看」的資訊 → 收進「？」。
                                原本兩段常駐灰字與底下的警示卡同字級同灰度，四段長相一樣，
                                使用者得自己判斷哪段重要 —— 那才是「小字太多」的真正成因。 */}
                            <motion.button {...pressProps('row')}
 type="button"
 onClick={() => { haptic('light'); setShowWeekRule((v) => !v); }}
 aria-expanded={showWeekRule}
 aria-label="這一週怎麼排的規則說明"
 style={{
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 width: 22, height: 22, padding: 0, borderRadius: '50%',
 border: 'none', cursor: 'pointer', flexShrink: 0,
 background: showWeekRule ? 'rgba(22,20,21,0.08)' : 'transparent',
 color: showWeekRule ? C.ink : 'rgba(22,20,21,0.38)',
 transition: 'background 160ms ease, color 160ms ease',
 }}
 >
                                <Info size={14} />
                            </motion.button>
                        </div>
                        <WeekPlan
                            week={week}
                            todayIdx={todayIdx}
                            flagIdx={overload ? overload.dayIndex : -1}
                            onGoFlagged={goFixOverload}
                            onMoveRun={moveRunToDay}
                            onMoveStrength={moveStrengthToDay}
                            strengthMoveOptions={strengthMoveOptions}
                            runMoveOptions={runMoveOptions}
                            onEditStrength={() => navigate('/luxury-plan-view-mobile', {
                                state: { openFullEdit: true, returnTo: '/training-focus' },
                            })}
                            onEditRun={() => navigate('/cardio-plan-editor', {
                                state: { returnTo: '/training-focus' },
                            })}
                        />

                        {/* 減重進度 —— 只有真的在減、而且量得出進度時才出現。
                            這裡原本是四個甜甜圈（早中晚點心的三大營養素）＋一行克數圖例，
                            六七個數字擠在課表底下，但它跟「這週怎麼排」沒有關係。
                            使用者要的只有一件事：原本幾公斤、現在幾公斤、目標幾公斤，
                            以及照這個速度這禮拜會到哪。 */}
                        {(() => {
                            let plan = null;
                            try { plan = JSON.parse(localStorage.getItem(`drvn_nutrition_plan_${userId}`) || 'null'); }
                            catch { plan = null; }

                            const cut = computeCutProgress(userId, plan);
                            // 沒有計劃、沒量過、還沒滿一週、或根本不是在減 → 這裡什麼都不放
                            if (!cut || cut.status !== 'ok' || cut.direction !== 'cut') return null;
                            const { startWeight, currentWeight, targetWeight, progressPct, movedKg, actualPaceKgWk } = cut;
                            if (![startWeight, currentWeight, targetWeight].every(Number.isFinite)) return null;

                            /* 這禮拜預估到哪：用實測配速（kg/週，減重為負）推到本週日。
                               今天就是週日就不預估 —— 那只會把現在的數字再寫一次。 */
                            const daysLeft = 7 - (((new Date().getDay() + 6) % 7) + 1);
                            const projected = (Number.isFinite(actualPaceKgWk) && daysLeft >= 1)
                                ? Math.round((currentWeight + actualPaceKgWk * (daysLeft / 7)) * 10) / 10
                                : null;

                            const pct = Math.max(0, Math.min(100, progressPct ?? 0));
                            return (
                                <div style={{ marginTop: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>減重進度</span>
                                        <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                                            已減 {Math.abs(movedKg)} kg
                                        </span>
                                    </div>

                                    <div style={{ position: 'relative', height: 6, borderRadius: 99, background: 'rgba(22,20,21,0.10)', marginTop: 9 }}>
                                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, borderRadius: 99, background: C.coral }} />
                                        <div style={{
                                            position: 'absolute', top: -3, left: `${pct}%`, marginLeft: -6,
                                            width: 12, height: 12, borderRadius: 99, background: C.paper,
                                            border: `2px solid ${C.coral}`,
                                        }} />
                                    </div>

                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', marginTop: 8,
                                        fontSize: 11, color: 'rgba(22,20,21,0.50)', fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        <span>原本 {startWeight}</span>
                                        <span style={{ fontWeight: 800, color: C.ink }}>目前 {currentWeight}</span>
                                        <span>目標 {targetWeight}</span>
                                    </div>

                                    {projected !== null && (
                                        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'rgba(22,20,21,0.50)', fontVariantNumeric: 'tabular-nums' }}>
                                            照這個速度，這禮拜結束約 {projected} kg
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                        {showWeekRule && (
                            <motion.ul
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                style={{
                                    margin: '10px 2px 0', padding: '0 0 0 15px',
                                    fontSize: 11.5, lineHeight: 1.7, color: 'rgba(22,20,21,0.52)',
                                    listStyle: 'disc',
                                }}
                            >
                                <li>點跑步格可直接改期；重訓格進課表編輯。距離／趟數到訓練磚編輯裡改。</li>
                                {/* 「盡量」不是修辭 —— dailyAgenda.js 的第三層 fallback
                                    在空日不夠時會放棄「不排在腿日隔天」這條限制，只加警告。
                                    文案要跟程式的實際行為一致，不能承諾做不到的事。 */}
                                <li>星期幾是自動排的：跑步會盡量繞開重腿日的隔天。</li>
                                <li>空日不夠時仍會排上，那一格會標記提醒你。</li>
                                <li>改完重訓，這裡會跟著重排。</li>
                            </motion.ul>
                        )}
                    </motion.div>
                )}

                {/* 這樣排行不行 —— 不是只有「排太滿」才說話。
                    使用者隨時可以改日期，所以永遠要有一個明確的答案。 */}
                {verdict && (
                    <motion.div
                        variants={RISE}
                        style={{
                            marginTop: 20, padding: '14px 16px', borderRadius: 16,
                            background: verdict.tone === 'ok' ? 'rgba(46,125,79,0.06)' : 'rgba(22,20,21,0.05)',
                            border: `1px solid ${verdict.tone === 'ok' ? 'rgba(46,125,79,0.22)' : 'rgba(22,20,21,0.16)'}`,
                            display: 'flex', gap: 11, alignItems: 'flex-start',
                        }}
                    >
                        {verdict.tone === 'ok'
                            ? <Check size={16} strokeWidth={3} color="#2E7D4F" style={{ flexShrink: 0, marginTop: 1 }} />
                            : <Info size={16} color="rgba(22,20,21,0.55)" style={{ flexShrink: 0, marginTop: 1 }} />}
                        <div style={{ minWidth: 0, flex: 1 }}>
                            {/* 🩹 2026-08 稽核：這張卡以前只有「你排太滿」＋一段話，
                                沒有任何可點的出路 —— 使用者知道有問題，但不知道該點哪裡。
                                現在標題直接指名是週幾，理由拆成列點，
                                最後給一顆真的會把人帶到該減量位置的按鈕。 */}
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
                                {verdict.title}
                            </p>

                            {/* 這裡原本會列三條 —— 標題已經講完是哪一天、要做什麼，
                                底下再疊三行就變成一整塊字。剩下幾點標題會報數字，
                                細節留在上面那張週曆的當天格子裡。 */}
                            {verdict.bullets[0] && (
                                <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.55, color: 'rgba(22,20,21,0.60)' }}>
                                    {verdict.bullets[0]}
                                </p>
                            )}

                            {/* 找不到可動的那一天時不放按鈕 ——
                                不為了有 CTA 而編一個不存在的建議。 */}
                            {overload && !showFix && (
                                <motion.button {...pressProps('row')}
 type="button"
 onClick={goFixOverload}
 style={{
 marginTop: 12, padding: '10px 16px', borderRadius: 12,
 border: 'none', cursor: 'pointer',
 background: C.ink, color: C.paper,
 fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
 display: 'inline-flex', alignItems: 'center', gap: 6,
 }}
 >
                                    {overload.actionLabel}
                                    <ArrowRight size={13} strokeWidth={2.4} />
                                </motion.button>
                            )}

                            {/* 手動改期的收據：只講剛剛那一次做了什麼，
                                行不行則由上面那句判斷負責（同一份資料，不會互相打架）。 */}
                            {changeNote && !showFix && (
                                <div style={{
                                    marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
                                    fontSize: 11.5, fontWeight: 700, color: 'rgba(22,20,21,0.62)',
                                }}>
                                    <Check size={13} strokeWidth={3} style={{ color: '#2E7D4F', flexShrink: 0 }} />
                                    {changeNote}
                                </div>
                            )}

                            {/* 改完就在原地講清楚「改了什麼」，並留一鍵復原 ——
                                自動幫使用者動課表，一定要能立刻退回去。 */}
                            {showFix && (
                                <div style={{
                                    marginTop: 12, padding: '10px 12px', borderRadius: 12,
                                    background: 'rgba(46,125,79,0.08)', border: '1px solid rgba(46,125,79,0.25)',
                                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                }}>
                                    <Check size={14} strokeWidth={3} style={{ color: '#2E7D4F', flexShrink: 0 }} />
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, lineHeight: 1.45 }}>
                                        {lastFix.text}，週曆已同步
                                    </span>
                                    <motion.button {...pressProps('row')}
 type="button"
 onClick={undoFixOverload}
 style={{
 padding: '6px 12px', borderRadius: 9, cursor: 'pointer',
 background: 'transparent', border: '1px solid rgba(22,20,21,0.22)',
 fontSize: 11, fontWeight: 800, color: C.ink,
 }}
 >
                                        復原
                                    </motion.button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* 訓練月曆：每天練了什麼、有沒有破紀錄、有沒有進步；點那一天看完整紀錄 */}
                <motion.div variants={RISE}><TrainingHistoryCalendar userId={userId} /></motion.div>

                {/* 2026-08 UI 稽核：原本這裡有一段「三個系統各自跑各自的週期…」的常駐灰字。
                    那是給團隊自己的產品定位說明（語氣與檔頭註解一致），不會改變使用者
                    接下來要做的任何事，而且與上面的說明同字級同灰度、加重了版面噪音。已移除。 */}
            </motion.div>
        </div>
    );
}
