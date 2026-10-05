import React, { useMemo, useEffect, useState } from 'react';
import HandWave from './ui/HandWave';
import { splitHint } from '../utils/hintCopy';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { strengthSeasonDone } from '../utils/trainingFocus';
import { getTodayReadiness, readinessLabel, readinessSourceLine } from '../utils/readiness';

// ─────────────────────────────────────────────────────────────
//  DailyInsightCard — 「每日摘要 / 三大系統」輪播頁（嵌在首頁公告輪播內）
//  顯示 Readiness / Recovery / 建議；點卡片 → 展開跑步/健身/營養三大系統狀態。
//  三大系統演算法來自 /api/review/system-status/{userId}（mock 優先、能算真實就覆蓋）。
//  sheet 用 portal 掛到 body，才不會被輪播的 transform 影響定位。
// ─────────────────────────────────────────────────────────────

const CORAL = '#F95C4B';
const RECOVERY_LABEL = { Ready: '極佳', Good: '良好', Fair: '普通', Low: '偏低', Rest: '需休息', Recovering: '恢復中' };
const SYS_TINT = { running: '#F0876E', strength: '#C9A25A', nutrition: '#5A7A3A' };
/* 中標：這一句在回答「這是哪一個系統的事」。與 utils/homeAlerts 的 eyebrow
   同一份詞彙，兩種卡在輪播裡輪流出現，講法必須一致。
   ⚠️ 不要加「提醒」兩個字 —— 整張卡本來就是提醒，中標再講一次
      等於把同一件事講兩遍（介面標準 §2）。 */
const SYS_KIND = { running: '跑步', strength: '健身', nutrition: '營養' };

/* 三個系統各自的入口與「還沒開始時該做的那一件事」。
   ≤8 字，動詞開頭 —— 使用者要的是一條路，不是一句「你沒有」。 */
const SYS_ROUTE = {
    running: '/cardio-tracker-mobile',
    strength: '/luxury-plan-view-mobile',
    nutrition: '/nutrition-mobile',
};
const SYS_ACTION = {
    running: '去排跑步計劃',
    strength: '去看課表',
    nutrition: '去記錄飲食',
};

const DailyInsightCard = ({ userId, recoveryStatus, todayWorkout }) => {
    const navigate = useNavigate();
    const [status, setStatus] = useState(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    /* 這一季練完、報告還沒看 → 這張卡就換成「去看結晶」的入口。
       平常它是每日提示，不會天天在那邊喊收成。 */
    const [harvest, setHarvest] = useState(false);
    const [ritual, setRitual] = useState(false);
    useEffect(() => {
        if (!userId) return;
        try { setHarvest(strengthSeasonDone(userId)); } catch { setHarvest(false); }
    }, [userId]);

    // 開封儀式：短暫的全螢幕轉場，然後才進報告。不做成落落長的動畫。
    const openHarvest = () => {
        const reduced = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            navigate('/luxury-plan-view-mobile', { state: { openCycleRecap: true } });
            return;
        }
        setRitual(true);
        setTimeout(() => {
            navigate('/luxury-plan-view-mobile', { state: { openCycleRecap: true } });
        }, 1500);
    };

    useEffect(() => {
        let alive = true;
        if (!userId) return undefined;
        (async () => {
            try {
                const { data } = await apiClient.get(`/api/review/system-status/${userId}`);
                if (alive && data?.status) setStatus(data.status);
            } catch (_) { /* 靜默 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    /* 🛌 準備度 = 訓練負荷（後端算的肌群恢復）＋ 睡眠 ＋ HRV ＋ 靜息心率。
       沒有健康資料就只剩訓練負荷 —— 那正是使用者要的退回行為。
       一個訊號都沒有 → computeReadiness 回 null，下面整塊不顯示。 */
    /* ⚠️ 以前這裡的訓練負荷取後端 system-status（或 battery_level），
       首頁卡取後端 battery_level，跑步頁取本機肌群紀錄 —— 三套數字。
       現在全部走 getTodayReadiness，同一個人同一時間只會有一個準備度。 */
    const ready = useMemo(() => getTodayReadiness(userId), [userId]);
    const readiness = ready?.score ?? NaN;
    /* 後端的 recovery 文字已經不用了 —— 準備度的狀態文字現在統一由
       utils/readiness 的 readinessLabel 產生（同一套門檻只能有一份）。 */
    // 🔴 零模擬數據：後端 is_mock（無任何真實資料時的捏造狀態）一律不顯示，
    //    改用誠實的「引導型」佔位文案 — 告訴使用者做什麼才會長出資料。
    const systems = (status?.is_mock ? null : status?.systems) || {
        running: { label: '跑步', state: '—', line: '完成一次跑步後顯示你的跑步狀態。' },
        strength: { label: '健身', state: '—', line: '完成一次重訓後顯示你的健身狀態。' },
        nutrition: { label: '營養', state: '—', line: '記錄飲食後顯示你的營養狀態。' },
    };

    // ✨ Daily Insight — 一句「帶領進步」的正向回饋。每 3 小時輪替一次(隨時間更換)，
    //    句子精簡不冗長；有真實系統資料時優先用系統的正向短句。
    const [insightTick, setInsightTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setInsightTick(t => t + 1), 10 * 60 * 1000); // 每 10 分鐘重算，跨 3 小時桶時換句
        return () => clearInterval(id);
    }, []);
    const dailyInsight = React.useMemo(() => {
        const bucket = Math.floor(Date.now() / (3 * 60 * 60 * 1000)); // 每 3 小時一個桶
        const POSITIVE = ['進步中', '穩定成長', '達標', '突破', '進步', '蓄勢中', '聰明減量', '再加一份', '起步'];
        const keys = ['running', 'strength', 'nutrition'].filter(k => systems[k]?.line && systems[k].state !== '—');
        const pos = keys.filter(k => POSITIVE.includes(systems[k].state));
        const pool = pos.length ? pos : keys;
        if (pool.length && !status?.is_mock) {
            const k = pool[bucket % pool.length];
            /* 大字講「現在是什麼狀況」的那一句，不是「健身：起步」這種標籤 ——
               四個字擺在一張卡裡等於什麼都沒說。狀態本身改用下面那排狀態列呈現。 */
            return { tint: SYS_TINT[k], kind: SYS_KIND[k], text: systems[k].line };
        }
        // 精簡模板（每句盡量一行）
        const T = [
            { kind: SYS_KIND.running, tint: SYS_TINT.running, text: '完成今天第一趟，數據就開始為你說話。' },
            { kind: SYS_KIND.running, tint: SYS_TINT.running, text: '規律是引擎，每天一點就拉開距離。' },
            { kind: SYS_KIND.strength, tint: SYS_TINT.strength, text: '再練一次，總訓練量再疊一層。' },
            { kind: SYS_KIND.nutrition, tint: SYS_TINT.nutrition, text: '好好恢復，努力正轉成實力。' },
            { kind: SYS_KIND.running, tint: SYS_TINT.running, text: '再跑一趟長跑，本月里程再進一步。' },
            { kind: SYS_KIND.nutrition, tint: SYS_TINT.nutrition, text: '補足蛋白質，修復效率更好。' },
            { kind: SYS_KIND.strength, tint: SYS_TINT.strength, text: '穩住節奏，突破就在前面。' },
            { kind: SYS_KIND.nutrition, tint: SYS_TINT.nutrition, text: '喝夠水，表現和恢復都更穩。' },
        ];
        return T[bucket % T.length];
    }, [systems, status, insightTick]);

    return (
        <>
            {/* 輪播頁本體：填滿容器高度、可點 */}
            <motion.button {...pressProps('card')}
 onClick={() => (harvest ? openHarvest() : setSheetOpen(true))}
 className="w-full h-full text-left"
 style={{
 position: 'relative', overflow: 'hidden', borderRadius: 18, cursor: 'pointer',
 background: '#FFFFFF',
 borderTop: '1.5px solid rgba(255,255,255,0.9)', borderBottom: '1px solid rgba(255,255,255,0.2)',
 borderLeft: '1px solid rgba(255,255,255,0.6)', borderRight: '1px solid rgba(255,255,255,0.2)',
 padding: '9px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
 }}
 >
                <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(120deg, rgba(249,92,75,0.12) 0%, rgba(249,92,75,0) 40%, rgba(120,150,220,0.08) 80%, rgba(120,150,220,0) 100%)' }} />

                {/* 拉絲反光留著（.ti-sheen，樣式在 styles/titanium-system.css）。
                    ⚠️ 左右兩道 .ti-rail 收邊已移除：卡上已經有中標、大字、
                       波浪記號三層，再加兩條直立色條只是多一層噪訊，
                       而且跟波浪搶同一個「這裡是重點」的角色。 */}
                <span aria-hidden className="ti-sheen" />

                {/* 中標 ＋ 一行大字 ＋ 手寫感的重點波浪。
                    中標回答「這是哪一種提醒」，大字回答「所以要做什麼」，
                    波浪把那一句標起來 —— 三件事各自只出現一次。 */}
                <div className="relative flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        {!harvest && (
                            <p style={{
                                color: CORAL, fontSize: 11, fontWeight: 600,
                                letterSpacing: '0.06em', margin: '0 0 3px',
                            }}>
                                {dailyInsight.kind}
                            </p>
                        )}
                        <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                            <p style={{
                                color: '#161415',
                                margin: 0,
                                /* 字要大，但要細 —— 這一句是提醒，不是標題 */
                                fontSize: harvest ? 26 : 19,
                                fontWeight: harvest ? 800 : 300,
                                lineHeight: harvest ? 1.1 : 1.22,
                                letterSpacing: harvest ? '-0.035em' : '-0.015em',
                                ...(harvest
                                    ? { display: 'inline-block', transform: 'skewX(-9deg)', transformOrigin: 'left bottom', whiteSpace: 'nowrap' }
                                    /* paddingBottom 是給波浪站的位置：overflow 是切在 padding box，
                                       所以留這 7px，絕對定位的波浪才不會被 line-clamp 切掉。
                                       marginBottom 補回去，版面高度不變。 */
                                    : {
                                        display: '-webkit-box', WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                        paddingBottom: 7, marginBottom: -7,
                                    }),
                            }}>
                                {harvest ? '你這個月的努力結晶' : (() => {
                                    /* 跳色：動作那一截上色、理由留墨黑。
                                       眼睛先抓到「要做什麼」，再讀「為什麼」。 */
                                    const { lead, rest } = splitHint(dailyInsight.text);
                                    /* ⚠️ 波浪要長在「動作」這一截底下，不是整段底下。
                                       原本 HandWave 放在 <p> 後面當兄弟節點，寬度 100%：
                                       文字一折成兩行，波浪就跑到第二行底下、橫跨整張卡，
                                       而且 120 單位的波形被拉到卡寬之後幾乎變成兩條直線 ——
                                       那就是畫面上看到的破版。 */
                                    return (<>
                                        {lead && (
                                            <span style={{
                                                color: CORAL, fontWeight: 600,
                                                position: 'relative', display: 'inline-block',
                                            }}>
                                                {lead}
                                                <HandWave color={CORAL} height={6}
                                                    style={{ position: 'absolute', left: 0, right: 0, bottom: -5 }} />
                                            </span>
                                        )}
                                        {rest}
                                    </>);
                                })()}
                            </p>
                        </span>
                    </div>
                    <ChevronRight size={16} strokeWidth={2.4} className="shrink-0"
                        style={{ color: harvest ? CORAL : 'rgba(22,20,21,0.32)' }} />
                </div>

            </motion.button>

            {/* 開封儀式：進報告前的一個短暫停頓。只有一句話、一道光，1.5 秒就走。 */}
            {createPortal(
                <AnimatePresence>
                    {ritual && (
                        <motion.div
                            className="fixed inset-0 z-[1000010] flex flex-col items-center justify-center px-8"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.35 }}
                            style={{ background: '#0B0A0A' }}
                        >
                            <motion.div
                                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 }}
                                style={{ height: 1.5, width: 132, background: CORAL, borderRadius: 99, transformOrigin: 'center' }}
                            />
                            <motion.p
                                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1], delay: 0.32 }}
                                style={{
                                    marginTop: 22, color: '#F6F4F1', fontSize: 30, fontWeight: 900,
                                    letterSpacing: '-0.035em', lineHeight: 1.15, textAlign: 'center',
                                    display: 'inline-block', transform: 'skewX(-9deg)',
                                }}
                            >
                                你這個月的努力結晶
                            </motion.p>
                            <motion.span
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, delay: 0.75 }}
                                className="uppercase"
                                style={{
                                    marginTop: 16, fontSize: 10, fontWeight: 800, letterSpacing: '0.3em',
                                    color: 'rgba(246,244,241,0.42)',
                                }}
                            >
                                Opening
                            </motion.span>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 三大系統展開 — 置中的 liquid glass 卡（portal → body，避免被輪播 transform 影響） */}
            {createPortal(
                <AnimatePresence>
                    {sheetOpen && (
                        <motion.div
                            className="fixed inset-0 z-[1000004] flex items-center justify-center px-5"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSheetOpen(false)}
                            style={{ background: 'rgba(22,20,21,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                        >
                            <motion.div
                                initial={{ scale: 0.94, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 10 }}
                                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full relative overflow-hidden"
                                style={{
                                    /* 🇨🇭 Swiss 極簡：純米白平面、細硬邊、大留白、單一 coral 強調 */
                                    maxWidth: 400, maxHeight: '82dvh', overflowY: 'auto', borderRadius: 20,
                                    background: '#F6F4F1',
                                    border: '1px solid rgba(22,20,21,0.10)',
                                    boxShadow: '0 30px 70px -22px rgba(0,0,0,0.42)',
                                    padding: '24px 22px 22px',
                                }}
                            >
                                {/* Header — kicker + 細長 coral 記號，無玻璃反射 */}
                                <div className="relative flex items-start justify-between mb-6">
                                    <div>
                                        <div style={{ width: 22, height: 2, background: CORAL, marginBottom: 10 }} />
                                        <span className="text-[12px] font-black tracking-[0.04em] text-[#161415]">三大系統 · 目前狀態</span>
                                    </div>
                                    <motion.button {...pressProps('row')} onClick={() => setSheetOpen(false)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(22,20,21,0.12)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <X size={16} color="#161415" />
                                    </motion.button>
                                </div>

                                {/* 準備度 / 恢復 — 兩欄大數字，中間僅一條髮絲線。
                                    算不出來就整塊不顯示：兩個「—」並排等於把「我沒有資料」講兩遍。 */}
                                {/* ⚠️ 以前這裡是兩個 46px 大字並排：「準備度 100」與「恢復 極佳」——
                                    但那是同一個數字換兩種說法，兩個大字互搶主角，
                                    而且「準備度」三個字本身沒有回答它是什麼。
                                    現在一個主角數字 ＋ 一行講清楚它從哪來。
                                    算不出來（還沒有訓練紀錄）→ 整塊不顯示，下面三列本來就會給路。 */}
                                {Number.isFinite(readiness) && (
                                    <div className="relative mb-6">
                                        <div className="text-[11px] font-extrabold tracking-[0.06em] text-[#161415]/45 mb-2">準備度</div>
                                        <div className="text-[46px] font-light leading-[0.9]" style={{ color: CORAL, fontVariantNumeric: 'tabular-nums' }}>{Math.round(readiness)}</div>
                                        <div className="text-[11px] font-bold text-[#161415]/45 mt-2">
                                            {readinessLabel(readiness)} · {readinessSourceLine(ready?.from || [])}
                                        </div>
                                    </div>
                                )}

                                {/* 系統列 —— 每一列都點得下去。
                                    ⚠️ 這張表以前是唯讀的：跟使用者說「完成一次跑步後顯示你的跑步狀態」，
                                       然後沒有給他任何一條路去完成那一次跑步，底下再補一句
                                       「完成第一次訓練後，這裡會換成你的真實狀態」——
                                       同一句話講兩遍，而且兩遍都只是在講他沒有。
                                       現在每一列都是一個入口，沒資料時直接寫「該做什麼」。 */}
                                <div className="relative">
                                    {['running', 'strength', 'nutrition'].filter(k => systems[k]).map((k, idx) => {
                                        const sys = systems[k];
                                        const hasReal = !!sys.state && sys.state !== '—' && !status?.is_mock;
                                        return (
                                            <motion.button
                                                key={k}
                                                {...pressProps('row')}
                                                onClick={() => { setSheetOpen(false); navigate(SYS_ROUTE[k]); }}
                                                className="w-full text-left"
                                                style={{ padding: '16px 0', borderTop: idx === 0 ? '1px solid rgba(22,20,21,0.12)' : 'none', borderBottom: '1px solid rgba(22,20,21,0.12)', background: 'transparent', display: 'block' }}
                                            >
                                                <div className="flex items-baseline justify-between mb-1.5">
                                                    <div className="flex items-baseline gap-2.5">
                                                        <span className="text-[11px] font-black tabular-nums text-[#161415]/35">0{idx + 1}</span>
                                                        <span className="text-[15px] font-bold text-[#161415]" style={{ letterSpacing: '0.01em' }}>{sys.label}</span>
                                                    </div>
                                                    <span className="text-[11px] font-black tracking-[0.16em] flex items-center gap-1"
                                                        style={{ color: hasReal ? SYS_TINT[k] : CORAL }}>
                                                        {hasReal ? sys.state : SYS_ACTION[k]}
                                                        <ChevronRight size={13} strokeWidth={2.6} />
                                                    </span>
                                                </div>
                                                {hasReal && (
                                                    <p className="text-[13px] leading-[1.65] text-[#161415]/70" style={{ fontWeight: 400 }}>{sys.line}</p>
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

export default DailyInsightCard;
