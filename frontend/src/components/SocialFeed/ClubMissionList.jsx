/**
 * ══════════════════════════════════════════════════════════════════════════
 * ClubMissionList — 社團任務清單（唯一的一套進度系統）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼重架（使用者：「圖一跟圖二的分類要搞好，要不要就圖二這個一般任務就好了」）：
 *
 * 社團原本有兩套平行的進度系統：
 *   總覽 · MISSIONS   四筆任務，各有目標與你的貢獻
 *   展示庫 · 社團徽章  四個徽章，其中一個的條件是「完成 1 個社團任務」
 * 同一件事記兩本帳，兩份清單長得一樣、都是 0%，使用者當然分不出差別。
 *
 * 現在社團只有一套貨幣 —— 任務。用資料裡本來就有、UI 卻從沒用過的
 * `category` 欄位分成兩級（見 socialDataConnector.CHALLENGE_KINDS）：
 *
 *   任務 MISSION    7 天 · 低門檻 · 全員一起
 *   挑戰 CHALLENGE  30–90 天 · 累積型 · 高門檻
 *
 * 徽章不在社團頁出現 —— 它們留在「個人成就」頁（社團分類），
 * 因為那本來就是跨全站的統計層，不該在社團裡再開一份。
 */

import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CHALLENGE_KINDS, groupChallengesByKind, challengeStatus } from '../../utils/socialDataConnector';

const C = {
    paper: '#F6F4F1', mist: '#E8E9E6', ink: '#161415',
    pebble: '#CFC6B8', sub: '#8A7E73', coral: '#F95C4B', sage: '#5A7A3A',
};

const DISPLAY = '"Plus Jakarta Sans", "Noto Sans TC", sans-serif';

const daysOf = (c) => {
    const n = parseInt(String(c?.duration || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
};

// ── 單一列 ────────────────────────────────────────────────────────────────
const MissionRow = ({ c, idx, userId, onOpen, onCancel, showContribution = true }) => {
    const { prog, target, pct, done } = challengeStatus(c, userId);
    const days = daysOf(c);
    return (
        <>
            {idx > 0 && (
                <div style={{
                    height: 5,
                    background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.32) 0px, rgba(255,255,255,0.32) 0.5px, rgba(255,255,255,0) 1px, rgba(58,52,44,0.10) 1.7px, rgba(255,255,255,0) 2.6px), linear-gradient(180deg, #F3EFE7 0%, #D9D2C5 46%, #B3A994 70%, #E4DED2 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 2px rgba(58,52,44,0.22)',
                }} />
            )}
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx, 6) * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onOpen?.(c)}
                whileTap={{ scale: 0.99 }}
                className="cursor-pointer"
                style={{ background: C.paper, padding: '16px 18px' }}
            >
                {/* Kicker：編號 + 主題 + 天數 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: C.sub, fontVariantNumeric: 'tabular-nums', fontFamily: DISPLAY }}>
                        {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {/* 🩹 開錯的任務原本本月完全無法取消，只能等換月被蓋掉。
                            管理層要收得回來 —— 取消之後在 MANAGE 那份清單會重新出現。 */}
                        {onCancel && (
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => { e.stopPropagation(); onCancel(c); }}
                                aria-label={`取消「${c.title}」`}
                                title="取消這個任務"
                                style={{
                                    width: 22, height: 22, borderRadius: 999, flexShrink: 0, padding: 0, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'transparent', border: `1px solid ${C.pebble}`,
                                }}>
                                <X size={11} color={C.sub} strokeWidth={2.4} />
                            </motion.button>
                        )}
                        {days && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: '0.04em' }}>{days} 天</span>
                        )}
                        {c.theme && (
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.coral, fontFamily: DISPLAY }}>
                                {c.theme}
                            </span>
                        )}
                    </div>
                </div>

                <h4 style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em', color: C.ink, margin: '0 0 12px', fontFamily: DISPLAY }}>
                    {c.title}
                </h4>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{ fontSize: 34, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', color: done ? C.sage : C.ink, fontVariantNumeric: 'tabular-nums', fontFamily: DISPLAY }}>
                            {Math.round(pct)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 400, color: C.sub }}>%</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: C.sub, fontFamily: DISPLAY }}>
                        目標 {target} {c.unit}
                    </span>
                </div>

                <div style={{ height: 3, borderRadius: 3, background: C.pebble, position: 'relative', overflow: 'hidden' }}>
                    <motion.div
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: done ? C.sage : C.coral }}
                    />
                </div>

                {showContribution && (
                    <p style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, margin: '9px 0 0' }}>
                        你已貢獻 <span style={{ color: C.coral, fontWeight: 800 }}>{prog.toLocaleString()} {c.unit}</span>
                        {done ? ' · 你已達標' : ` · 還差 ${(target - prog).toLocaleString()} ${c.unit} 達標`}
                    </p>
                )}
            </motion.div>
        </>
    );
};

// ── 一個層級的區塊（任務 / 挑戰）────────────────────────────────────────
const KindSection = ({ kind, items, userId, onOpen, onCancel, manageSlot }) => {
    const meta = CHALLENGE_KINDS[kind];
    if (!items.length) return null;
    return (
        <div style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10, padding: '0 4px' }}>
                <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.40em', textTransform: 'uppercase', color: C.sub, margin: '0 0 3px', fontFamily: DISPLAY }}>
                        {meta.en}
                    </p>
                    <h3 style={{ fontSize: 20, fontWeight: 900, color: C.ink, letterSpacing: '-0.03em', margin: 0, fontFamily: DISPLAY }}>
                        {meta.label}
                    </h3>
                </div>
                <div style={{ flex: 1, height: 1, background: C.pebble, marginBottom: 7 }} />
                {manageSlot}
            </div>
            {/* 這一級是什麼、為什麼要做 —— 兩級的差別要講出來，不能只靠標題 */}
            <p style={{ fontSize: 12.5, fontWeight: 500, color: C.sub, margin: '0 4px 12px', lineHeight: 1.6 }}>
                {meta.blurb}
            </p>
            <div style={{ background: C.mist, border: `1px solid ${C.pebble}`, borderRadius: 16, overflow: 'hidden' }}>
                {items.map((c, i) => (
                    <MissionRow key={c.id || i} c={c} idx={i} userId={userId} onOpen={onOpen} onCancel={onCancel} />
                ))}
            </div>
        </div>
    );
};

/**
 * 進行中的任務與挑戰（總覽用）。
 */
export const ActiveMissions = ({ challenges = [], userId, onOpen, onCancel, canAdmin, onManage }) => {
    const grouped = groupChallengesByKind(challenges);
    const total = grouped.mission.length + grouped.challenge.length;

    const manageBtn = canAdmin ? (
        <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onManage}
            style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase',
                color: C.coral, border: `1px solid ${C.coral}`, background: 'transparent',
                padding: '4px 10px', fontFamily: DISPLAY, flexShrink: 0, cursor: 'pointer', marginBottom: 5,
            }}
        >
            Manage
        </motion.button>
    ) : null;

    if (total === 0) {
        return (
            <div style={{ background: C.mist, border: `1px solid ${C.pebble}`, borderRadius: 16, padding: '30px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, margin: 0 }}>還沒有進行中的任務</p>
                <p style={{ fontSize: 12.5, color: C.sub, margin: '7px 0 0', lineHeight: 1.6 }}>
                    {canAdmin ? '點「Manage」開一個，社團才有共同目標。' : '等社長開任務，或到討論區提議一個。'}
                </p>
                {canAdmin && <div style={{ marginTop: 14 }}>{manageBtn}</div>}
            </div>
        );
    }

    return (
        <div>
            <KindSection kind="mission" items={grouped.mission} userId={userId} onOpen={onOpen}
                onCancel={canAdmin ? onCancel : null}
                manageSlot={grouped.mission.length ? manageBtn : null} />
            <KindSection kind="challenge" items={grouped.challenge} userId={userId} onOpen={onOpen}
                onCancel={canAdmin ? onCancel : null}
                manageSlot={grouped.mission.length ? null : manageBtn} />
        </div>
    );
};

/* CompletedMissions 已移除 —— 展示櫃改成「完成固定挑戰幾次 → 分階徽章」，
   實作在 SocialFeed/ClubBadgeCabinet.jsx。 */

export default { ActiveMissions };
