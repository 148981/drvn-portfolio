/**
 * RewardUnlockAnimation.jsx — 通用「獲取動畫」元件（貼紙 / 徽章 / 段位共用）
 * ──────────────────────────────────────────────────────────────────
 * 設計語言：DRVN Swiss Editorial（瑞士高級雜誌時尚質感）
 *   - 暖中性 Paper 畫布、單一強調色、細 hairline 分隔、tracked 大寫小標
 *   - 編輯排版細節：四角註冊標記(registration tick)、Nº 索引、雙框內襯
 *   - 依 tier（gold/silver/bronze/platinum）自動切換金屬色點綴，其餘走 Coral
 *   - 進場沉穩不浮誇（~1.6s），給「會心一笑」感，不打斷流程
 *
 * 用法：
 *   <RewardUnlockAnimation reward={reward} onClose={() => setReward(null)} />
 *
 * reward 形狀：{ id, name, emoji, kind, unlockText, tier? }
 *   kind: 'league_club' | 'milestone' | 'badge'
 *   tier: 'gold' | 'silver' | 'bronze' | 'platinum'（可選，league/徽章用）
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { brandColors as C } from '../utils/colors';
import CrystalBadge3D from './CrystalBadge3D';
import {ALL_3D_BADGES} from '../utils/benchBadgeAssets';
import {clubMissionBadgeId} from '../utils/clubMissionBadgeAssets';

const KIND_LABEL = {
    league_club: '段位俱樂部',
    milestone: '里程碑貼紙',
    badge: '徽章',
};

const isLeague = (kind) => kind === 'league_club';

// 依 tier 給金屬色點綴（在 Paper 上需可讀，故 accent 取較深值，ring 取較亮值）
const TIER_THEME = {
    gold:     { accent: '#B8862F', ring: '#D4A853', tag: 'GOLD' },
    silver:   { accent: '#8A8A92', ring: '#B9B9C2', tag: 'SILVER' },
    bronze:   { accent: '#A8693B', ring: '#C08050', tag: 'BRONZE' },
    platinum: { accent: '#6E6A86', ring: '#B8AFD0', tag: 'PLATINUM' },
};

// 從 reward 推導 tier：優先 reward.tier，其次從名稱字樣猜
const resolveTier = (reward) => {
    const t = (reward.tier || '').toLowerCase();
    if (TIER_THEME[t]) return t;
    const name = (reward.name || '').toLowerCase();
    if (name.includes('gold') || reward.name?.includes('金')) return 'gold';
    if (name.includes('platinum') || reward.name?.includes('白金')) return 'platinum';
    if (name.includes('silver') || reward.name?.includes('銀')) return 'silver';
    if (name.includes('bronze') || reward.name?.includes('銅')) return 'bronze';
    return null;
};

// 簡短 Nº 索引：用 id 取穩定 3 碼數字，純編輯裝飾
const indexNo = (reward) => {
    const s = String(reward.id || reward.name || 'drvn');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return String((h % 999) + 1).padStart(3, '0');
};

// 四角註冊標記（registration tick）——瑞士印刷風細節
function CornerTick({ pos, color, inset = 16, size = 10 }) {
    const v = { top: pos.includes('t') ? inset : 'auto', bottom: pos.includes('b') ? inset : 'auto', left: pos.includes('l') ? inset : 'auto', right: pos.includes('r') ? inset : 'auto' };
    return (
        <div style={{ position: 'absolute', width: size, height: size, ...v, opacity: 0.5, zIndex: 3, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 1, background: color, transform: 'translateY(-50%)' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, height: '100%', width: 1, background: color, transform: 'translateX(-50%)' }} />
        </div>
    );
}

export default function RewardUnlockAnimation({ reward, onClose, autoCloseMs = 7000 }) {
    const modelId=reward&&(clubMissionBadgeId(reward.badgeId||reward.id,reward.tier)||Object.keys(ALL_3D_BADGES).find(id=>id===(reward.badgeId||reward.id)||reward.image===`/images/badges/3d/${ALL_3D_BADGES[id].asset}.png`));
    const [readyReward,setReadyReward]=useState(null);
    useEffect(() => {
        if (!reward) return;
        if(modelId&&readyReward!==reward)return;
        const t = setTimeout(() => onClose && onClose(), autoCloseMs);
        return () => clearTimeout(t);
    }, [reward, autoCloseMs, onClose,modelId,readyReward]);

    // 獲取獎章是「沉浸慶祝時刻」→ 顯示期間隱藏底部膠囊導航，離開時還原。
    useEffect(() => {
        if (!reward) return;
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
        };
    }, [reward]);

    if (typeof document === 'undefined') return null;

    const tier = reward ? resolveTier(reward) : null;
    const theme = tier ? TIER_THEME[tier] : null;
    const accent = theme ? theme.accent : C.coral;     // 強調色（細線 / 標籤）
    const ring = theme ? theme.ring : C.coral;         // 勳章環色
    const tagText = theme ? theme.tag : (isLeague(reward?.kind) ? 'CLUB' : 'NEW');

    const eyebrowLeft = isLeague(reward?.kind) ? '段位達成' : '已解鎖';

    return createPortal(
        <AnimatePresence>
            {reward && (
                <motion.div
                    key="reward-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        display: 'flex', flexDirection: 'column',
                        background: C.paper,
                        fontFamily: 'var(--font-body)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                    }}
                >
                    {/* 極淡氛圍光暈：只在畫面上方鋪一層暖色，襯出徽章，不搶主體 */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        background: `radial-gradient(90% 60% at 50% 34%, ${ring}1F 0%, transparent 62%)`,
                    }} />

                    {/* 註冊標記只保留底部兩角 — 頂部的滿版細線與上方兩角會被靈動島切到，已移除。 */}
                    <CornerTick pos="bl" color={accent} inset={22} size={11} />
                    <CornerTick pos="br" color={accent} inset={22} size={11} />

                    {/* ── 上：Eyebrow（tracked 大寫 · 細體） ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.28 } }}
                        style={{
                            position: 'relative', zIndex: 2,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                            paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 54px) + 24px)',
                        }}
                    >
                        <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.32em', color: 'rgba(22,20,21,0.50)' }}>
                            {eyebrowLeft}
                        </span>
                        <span style={{ width: 22, height: 1, background: 'rgba(22,20,21,0.20)' }} />
                        <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.32em', color: accent }}>
                            UNLOCKED
                        </span>
                    </motion.div>

                    {/* ── 中：徽章主體（畫面 50%） ── */}
                    <div style={{
                        position: 'relative', zIndex: 2,
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 24px',
                    }}>
                        <motion.div
                            initial={{ scale: 0.72, opacity: 0, y: 12 }}
                            animate={{ scale: 1, opacity: 1, y: 0, transition: { delay: 0.16, type: 'spring', stiffness: 220, damping: 20 } }}
                            style={{
                                width: '50dvh', maxWidth: '82vw', aspectRatio: '1 / 1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {modelId ? (
                                <div className="reward-model" style={{width:'100%',height:'100%',pointerEvents:'none'}}>
                                    <style>{'.reward-model button,.reward-model [role="status"]{display:none}'}</style>
                                    <CrystalBadge3D key={reward.id} badgeId={modelId} name={reward.name} image={reward.image} celebrate onReady={()=>setReadyReward(reward)}/>
                                </div>
                            ) : reward.image ? (
                                <img
                                    src={reward.image}
                                    alt={reward.name}
                                    style={{
                                        width: '100%', height: '100%', objectFit: 'contain',
                                        filter: `drop-shadow(0 24px 48px ${ring}44) drop-shadow(0 8px 20px rgba(0,0,0,0.18))`,
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: '78%', height: '78%', borderRadius: '50%',
                                    background: 'linear-gradient(160deg, #FFFFFF 0%, #ECE7DF 100%)',
                                    border: `1px solid ${ring}66`,
                                    boxShadow: `inset 0 2px 4px rgba(255,255,255,0.9), 0 24px 48px -18px ${ring}55`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '22dvh', lineHeight: 1,
                                }}>
                                    {reward.emoji || '🏅'}
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* ── 下：tier 標籤 → 名稱 → hairline → 說明 → footer ── */}
                    <div style={{
                        position: 'relative', zIndex: 2,
                        textAlign: 'center', padding: '0 32px',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 40px)',
                    }}>
                        {/* tier 標籤（極簡：小字 · 不用框） */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.42 } }}
                            style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.30em', color: accent, marginBottom: 14 }}
                        >
                            {tagText}
                        </motion.div>

                        {/* 名稱：大而細的編輯標題 */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.48 } }}
                            style={{ fontSize: 34, fontWeight: 300, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16 }}
                        >
                            {reward.name}
                        </motion.div>

                        {/* hairline 分隔 */}
                        <motion.div
                            initial={{ scaleX: 0 }} animate={{ scaleX: 1, transition: { delay: 0.54, duration: 0.4 } }}
                            style={{ width: 40, height: 1, background: 'rgba(22,20,21,0.22)', margin: '0 auto 16px', transformOrigin: 'center' }}
                        />

                        {/* 類別 + 獲取方式（細體） */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.6 } }}
                            style={{ marginBottom: 26 }}
                        >
                            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.40)', marginBottom: 6 }}>
                                {KIND_LABEL[reward.kind] || '收藏'}
                            </div>
                            {reward.unlockText && (
                                <div style={{ fontSize: 12.5, fontWeight: 400, color: C.clay, lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                                    {reward.unlockText}
                                </div>
                            )}
                        </motion.div>

                        {/* Footer：Nº 索引 + 關閉提示 */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.72 } }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                borderTop: '1px solid rgba(22,20,21,0.10)', paddingTop: 14,
                                maxWidth: 340, margin: '0 auto',
                            }}
                        >
                            <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.18em', color: 'rgba(22,20,21,0.38)' }}>
                                Nº {indexNo(reward)}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.34)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: accent }} />
                                點任意處關閉
                            </span>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
