/**
 * DevMomentPreview.jsx — ✨ Swiss Moment 模擬回饋入口（驗收用，可整顆移除）
 * ─────────────────────────────────────────────────────────
 * 依需求暫掛在主頁右上四顆圓鈕旁：點開列出「全部」滿版回饋種類，
 * 每列附註觸發時機，點一下即預覽實際滿版動畫。
 * 驗收完畢 → 到 ActionFirstDashboardMobile 移除 <DevMomentPreview/> 一行即可。
 */

import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ChevronRight } from 'lucide-react';
import { fireMoment } from '../utils/momentEngine';

const CASES = [
    { note: '連續開啟 · 小里程碑（只在 2/3/5/10/21/75/150 天發，四色輪轉）', kicker: 'DAY 5 · 連續開啟', theme: 'viola',
      parts: [['第 ', 'dim'], ['5 天', 'accent'], ['報到。\n比鬧鐘還準。', 'main']], holdMs: 2600 },
    { note: '連續開啟 · 大里程碑（7/14/30/50/100/200/365 → Brick 滿版）', kicker: 'DAY 30 · 連續開啟', theme: 'brick',
      parts: [['第 30 天', 'accent'], ['。\n這不是熱情，是人格。', 'main']], holdMs: 3400 },
    { note: '回歸時刻（斷 3 天以上回來 → Rosehip）', kicker: 'WELCOME BACK', theme: 'rosehip',
      parts: [['離開 ', 'dim'], ['5 天', 'main'], ['。\n回來，只花了', 'dim'], ['一次點擊', 'accent'], ['。', 'main']], holdMs: 3000 },
    { note: '今日任務全完成（第 1/3/7/15/30/60/100 個全完成日 → Sunshine）', kicker: 'TODAY · COMPLETE', theme: 'sunshine',
      parts: [['清單', 'dim'], ['清空', 'accent'], ['。\n肌肉知道你來過。', 'main']], holdMs: 3200 },
    { note: '破 PR（第 1/2/4/7/12/20/30… 個破 PR 日 → Sunshine）', kicker: 'PERSONAL RECORD', theme: 'sunshine',
      parts: [['一口氣破 ', 'dim'], ['3 項紀錄', 'accent'], ['。\n昨天的你剛被超車。', 'main']], holdMs: 3200 },
    { note: '清晨訓練彩蛋（4-7 點存訓練，第 1/3/7/15… 次 → Clear Day）', kicker: 'EARLY BIRD', theme: 'clearday',
      parts: [['清晨 6 點', 'accent'], ['。\n全世界還在賴床，', 'dim'], ['你在練。', 'main']], holdMs: 3000 },
    { note: '深夜訓練彩蛋（22 點後存訓練，第 1/3/7/15… 次 → Viola）', kicker: 'NIGHT SHIFT', theme: 'viola',
      parts: [['23 點還在練', 'accent'], ['。\n夜色都替你讓路。', 'main']], holdMs: 3000 },
    { note: '週全勤（第 1/2/4/8/16/26/52 個全勤週 → Apple）', kicker: 'PERFECT WEEK', theme: 'apple',
      parts: [['一週', 'dim'], ['全勤', 'accent'], ['。\n課表被你打卡打服了。', 'main']], holdMs: 3200 },
    { note: '第 1 次完成動作分析（行為里程碑 1/3/7/15/30/60/100 → Viola）', kicker: 'FIRST TIME', theme: 'viola',
      parts: [['第一次', 'accent'], ['完成動作分析。\n', 'main'], ['萬事起頭難，你剛把難字劃掉。', 'dim']], holdMs: 2800 },
    { note: '第 3 次完成訓練紀錄（Brick）', kicker: 'MILESTONE · 3RD', theme: 'brick',
      parts: [['第三次', 'accent'], ['完成訓練紀錄。\n', 'main'], ['身體開始背下這件事了。', 'dim']], holdMs: 2800 },
    { note: '第 7 次完成跑步紀錄（Clear Day）', kicker: 'MILESTONE · 7TH', theme: 'clearday',
      parts: [['第七次', 'accent'], ['完成跑步紀錄。\n', 'main'], ['不用提醒，你自己就來了。', 'dim']], holdMs: 2800 },
    { note: '第 30 次記錄飲食（中期里程碑示意 → Apple）', kicker: 'MILESTONE · 30TH', theme: 'apple',
      parts: [['第 30 次', 'accent'], ['記錄飲食。\n', 'main'], ['別人叫堅持，你叫習慣。', 'dim']], holdMs: 2800 },
    /* ── 一次性「第一次」時刻（recordFirst 系列，只慶祝一次）── */
    { note: '第一次加入社團（Clear Day）', kicker: 'FIRST SQUAD', theme: 'clearday',
      parts: [['加入第一個', 'dim'], ['社團', 'accent'], ['。\n訓練，從此有人陪。', 'main']], holdMs: 3000 },
    { note: '第一個好友入列（接受邀請時 → Viola）', kicker: 'FIRST ALLY', theme: 'viola',
      parts: [['第一個', 'dim'], ['戰友', 'accent'], ['入列。\n互相追蹤，互相不放過。', 'main']], holdMs: 3000 },
    { note: '第一次解鎖人格（人格頁揭示後延遲 2.4s → Brick）', kicker: 'NEW PERSONA', theme: 'brick',
      parts: [['解鎖新人格：', 'dim'], ['街跑型', 'accent'], ['。\n你又多了一種練法。', 'main']], holdMs: 3000 },
    { note: '第一首訓練歌入庫（Rosehip）', kicker: 'FIRST TRACK', theme: 'rosehip',
      parts: [['第一首', 'dim'], ['訓練歌', 'accent'], ['入庫。\n配樂到位，開練。', 'main']], holdMs: 3000 },
    { note: '第一筆 InBody（新填寫存檔時 → Apple）', kicker: 'BASELINE SET', theme: 'apple',
      parts: [['第一筆 ', 'dim'], ['InBody', 'accent'], ['。\n從今天起，變化有據可查。', 'main']], holdMs: 3000 },
    { note: '第一份健身計劃生成（確認存檔 → Brick）', kicker: 'FIRST PLAN', theme: 'brick',
      parts: [['第一份', 'dim'], ['健身計劃', 'accent'], ['生成。\n紙上談兵，結束了。', 'main']], holdMs: 3000 },
    { note: '第一份跑步計劃生成（Clear Day）', kicker: 'FIRST PLAN', theme: 'clearday',
      parts: [['第一份', 'dim'], ['跑步計劃', 'accent'], ['生成。\n路線畫好了，等你踩。', 'main']], holdMs: 3000 },
    { note: '第一份營養策略上線（Apple）', kicker: 'FIRST STRATEGY', theme: 'apple',
      parts: [['第一份', 'dim'], ['營養策略', 'accent'], ['上線。\n連吃，都開始有戰術了。', 'main']], holdMs: 3000 },
    { note: '第一篇發文（composer 關閉後 → Sunshine）', kicker: 'FIRST POST', theme: 'sunshine',
      parts: [['第一篇', 'dim'], ['發文', 'accent'], ['。\n讓汗水也有觀眾。', 'main']], holdMs: 3000 },
    { note: '第一次融合計劃（按「開始計劃」時 → Viola）', kicker: 'FUSION', theme: 'viola',
      parts: [['第一次', 'dim'], ['融合計劃', 'accent'], ['。\n兩套課表，煉成你的。', 'main']], holdMs: 3000 },
    { note: '首訪進化日誌（離開頁面時才發，避開教學 → Mist）', kicker: 'EVOLUTION LOG', theme: 'mist',
      parts: [['進化日誌', 'accent'], ['開張。\n之後的每一滴汗，都記帳。', 'main']], holdMs: 3000 },
];

const DevMomentPreview = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            {/* 入口鈕：與四顆圓鈕同規格，✨ 標記 + DEV 角標 */}
            <motion.button {...pressProps('pill')}
 onClick={() => setOpen(true)}
 aria-label="模擬回饋預覽（驗收用）"
 className="lg-circle w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shrink-0"
 style={{ background: 'linear-gradient(180deg, #2A2624 0%, #161415 100%)', position: 'relative' }}
 >
                <Sparkles size={16} color="#F95C4B" />
                <span style={{
                    position: 'absolute', top: -4, right: -6, fontSize: 11, fontWeight: 900,
                    letterSpacing: '0.08em', color: '#F6F4F1', background: '#F95C4B',
                    padding: '1px 4px', borderRadius: 99,
                }}>DEV</span>
            </motion.button>

            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setOpen(false)}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 2147483630,
                                background: 'rgba(22,20,21,0.5)', backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            }}
                        >
                            <motion.div
                                initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%', maxWidth: 430, maxHeight: '78dvh', overflowY: 'auto',
                                    background: '#F6F4F1', borderRadius: '24px 24px 0 0',
                                    padding: '22px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                    <div>
                                        <div style={{ width: 22, height: 2, background: '#F95C4B', marginBottom: 10 }} />
                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.26em', color: '#161415' }}>
                                            SWISS MOMENT · 模擬回饋預覽
                                        </p>
                                        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(22,20,21,0.5)', lineHeight: 1.6 }}>
                                            驗收用清單 — 點任一列預覽實際滿版動畫。確認完畢後移除此入口。
                                        </p>
                                    </div>
                                    <motion.button {...pressProps('row')} onClick={() => setOpen(false)} style={{ width: 30, height: 30, borderRadius: 99, border: '1px solid rgba(22,20,21,0.12)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                        <X size={15} color="#161415" />
                                    </motion.button>
                                </div>

                                {CASES.map((c, i) => (
                                    <motion.button {...pressProps('row')}
 key={i}
 onClick={() => { setOpen(false); setTimeout(() => fireMoment(c), 250); }}
 style={{
 width: '100%', textAlign: 'left', cursor: 'pointer',
 padding: '13px 2px', background: 'transparent', border: 'none',
 borderBottom: '1px solid rgba(22,20,21,0.10)',
 display: 'flex', alignItems: 'center', gap: 10,
 }}
 >
                                        <span style={{ width: 3, height: 22, borderRadius: 2, background: '#F95C4B', flexShrink: 0, opacity: 0.7 }} />
                                        <span style={{ flex: 1 }}>
                                            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#161415' }}>
                                                {c.parts.map(p => p[0]).join('').replace(/\n/g, '')}
                                            </span>
                                            <span style={{ display: 'block', fontSize: 11, color: 'rgba(22,20,21,0.48)', marginTop: 3 }}>
                                                {c.note}
                                            </span>
                                        </span>
                                        <ChevronRight size={14} color="rgba(22,20,21,0.35)" />
                                    </motion.button>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

export default DevMomentPreview;
