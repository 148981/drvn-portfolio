/**
 * ══════════════════════════════════════════════════════════════════════════
 * ClubBadgeCabinet — 社團展示櫃（完成固定挑戰的累積次數 → 社團徽章）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 社團的用處（使用者定義，這份檔案照它做）：
 *
 *   主軸   交流、開團、揪活動、互動討論 —— 找到有共同愛好的人。
 *   加分項 任務：每月固定的社團挑戰。
 *   加分項 徽章：同一個固定挑戰完成越多次，階級越高。
 *
 * 所以這一頁是「加分項的加分項」——它不該搶戲，只要回答一件事：
 * 「這個社團的固定挑戰，我完成過幾次了？」
 *
 * ⚠️ 這個模型本來是壞的：領取時存的 badgeId 是 `sys_<timestamp>_<configId>`，
 *    也就是**每個月產生的新 instance id**。同一個固定挑戰下個月再完成，
 *    會被當成另一枚徽章新增一筆，count 永遠停在 1 ——
 *    「完成幾次」這件事根本累積不起來。修法：改用 configId 當累積的鑰匙
 *    （見 SquadsView 領取按鈕），這裡也一律以 configId 聚合。
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, ChevronDown } from 'lucide-react';
import { getClubChallenges } from '../../utils/socialDataConnector';
import {clubMissionBadgeImage} from '../../utils/clubMissionBadgeAssets.js';
import {createPortal} from 'react-dom';
import CrystalBadge3D from '../CrystalBadge3D';

const C = {
    paper: '#F6F4F1', mist: '#E8E9E6', ink: '#161415',
    pebble: '#CFC6B8', sub: '#8A7E73', coral: '#F95C4B', sage: '#5A7A3A',
};
const DISPLAY = '"Plus Jakarta Sans", "Noto Sans TC", sans-serif';

/* 完成次數 → 階級。與個人徽章同一組四階語彙，顏色改成淺底可讀的版本
   （growthAchievements 的 TIER_META 是為深色成就頁調的，放這裡對比度不及格）。 */
export const COUNT_TIERS = [
    { key: 'platinum', label: '鉑金', need: 12, ink: '#4F5A66', bg: 'rgba(79,90,102,0.10)' },
    { key: 'gold', label: '金牌', need: 6, ink: '#9A7415', bg: 'rgba(154,116,21,0.10)' },
    { key: 'silver', label: '銀牌', need: 3, ink: '#6F757E', bg: 'rgba(111,117,126,0.10)' },
    { key: 'bronze', label: '銅牌', need: 1, ink: '#A5622A', bg: 'rgba(165,98,42,0.09)' },
];

/** 完成 n 次 → 目前階級（沒到 1 次回 null）。 */
export const tierForCount = (n) => COUNT_TIERS.find((t) => n >= t.need) || null;
/** 下一階（已滿階回 null）。 */
export const nextTierForCount = (n) => {
    const asc = [...COUNT_TIERS].reverse();
    return asc.find((t) => n < t.need) || null;
};

/** 去掉月份前綴（「六月晨跑 5 公里挑戰」→「晨跑 5 公里挑戰」）。 */
const stripMonth = (t) => String(t || '').replace(/^(本月|當月|[一二三四五六七八九十]+月)\s*/, '');

const BadgeRow = ({ item, idx }) => {
    const { title, from, count, tier, next } = item;
    const badgeArt=clubMissionBadgeImage(item.id,tier?.key);
    const [preview,setPreview]=useState(false);
    const earned = count > 0;
    const ink = tier ? tier.ink : 'rgba(22,20,21,0.28)';
    const toNext = next ? next.need - count : 0;
    const pct = next ? Math.min(100, Math.round((count / next.need) * 100)) : 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(idx, 6) * 0.05 }}
            style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                borderRadius: 18, background: C.paper, marginBottom: 10,
                border: `1px solid ${earned ? ink : 'rgba(22,20,21,0.10)'}`,
                boxShadow: earned ? `0 8px 20px -14px ${ink}` : 'none',
            }}
        >
            {preview&&createPortal(<div role="dialog" aria-modal="true" aria-label={`${title} 3D 徽章`} style={{position:'fixed',inset:0,zIndex:300000,background:'#161415ed',display:'grid',placeItems:'center'}}>
                <div style={{width:'min(90vw,520px)'}}><button autoFocus onClick={()=>setPreview(false)} style={{color:'#f6f4f1',padding:12}} aria-label="關閉徽章">關閉</button><div style={{height:'min(80vw,500px)'}} onKeyDown={event=>{if(event.key==='Escape')setPreview(false);}}><CrystalBadge3D badgeId={`mission_${item.id}`} tier={tier?.key||'bronze'} image={badgeArt} name={title} unlocked={earned}/></div><p style={{color:'#f6f4f1',textAlign:'center'}}>{title} · 完成 {count} 次</p></div>
            </div>,document.body)}
            <div role={badgeArt?'button':undefined} tabIndex={badgeArt?0:undefined} aria-label={badgeArt?`查看${title} 3D 徽章`:undefined} onClick={()=>badgeArt&&setPreview(true)} onKeyDown={event=>{if(badgeArt&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setPreview(true);}}} style={{
                width: badgeArt?80:46, height: badgeArt?80:46, borderRadius: 13, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: tier ? tier.bg : 'rgba(22,20,21,0.04)',
                border: `1px solid ${earned ? ink : 'rgba(22,20,21,0.08)'}`,
            }}>
                {badgeArt ? <img src={badgeArt} alt={`${title}徽章`} width="80" height="80" style={{objectFit:'contain',filter:earned?'none':'grayscale(1)',opacity:earned?1:.4}} /> : earned ? (
                    <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 800, color: ink, fontFamily: DISPLAY }}>
                        ×{count}
                    </span>
                ) : (
                    <Lock size={17} color="rgba(22,20,21,0.28)" strokeWidth={2} />
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: 0, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {title}
                    </p>
                    {tier && (
                        <span style={{
                            flexShrink: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
                            padding: '2px 7px', borderRadius: 999, color: tier.ink, border: `1px solid ${tier.ink}`,
                        }}>
                            {tier.label}
                        </span>
                    )}
                </div>

                <p style={{ fontSize: 12.5, fontWeight: 500, color: C.sub, margin: '4px 0 0', lineHeight: 1.5 }}>
                    {from && from !== title ? `${from} · ` : ''}{earned ? `完成 ${count} 次` : '還沒完成過'}
                    {next ? ` · 再 ${toNext} 次升${next.label}` : ' · 已滿階'}
                </p>

                {next && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'rgba(22,20,21,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 999, background: C.ink, opacity: 0.75 }} />
                        </div>
                        <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.45)', flexShrink: 0 }}>
                            {count}/{next.need}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

/**
 * @param {object[]} trophyCabinet club.trophyCabinet — 領取紀錄（以 configId 聚合）
 * @param {string}   clubType      決定這個社團有哪些固定挑戰
 * @param {string[]} fixedIds      這個社團每月固定跑的那幾筆（socialDataConnector.clubFixedChallengeIds）
 *
 * ⚠️ 沒有 fixedIds 時會退回列出整份 catalog —— 那會出現十幾個永遠停在 0 的格子，
 *    看起來像「我還差很多」，其實那些題目這個社團根本不會開。有就一定要傳。
 *
 * ⚠️ 題目改成每月輪替之後，fixedIds 只代表「這個月在跑的」。
 *    已經拿到的獎盃不能因為這個月沒輪到就從櫃子裡消失 ——
 *    所以顯示的是「這個月在跑的」∪「以前拿過的」。
 */
const ClubBadgeCabinet = ({ trophyCabinet = [], clubType = 'run', fixedIds = null }) => {
    const [showLocked, setShowLocked] = useState(false);

    const { earned, locked } = useMemo(() => {
        const all = getClubChallenges(clubType) || [];
        const earnedIds = new Set(
            (trophyCabinet || [])
                .map((t) => String(t?.configId || t?.badgeId || ''))
                .filter(Boolean)
        );
        const catalog = (Array.isArray(fixedIds) && fixedIds.length)
            ? all.filter((c) => fixedIds.includes(c.id) || earnedIds.has(c.id))
            : all;
        // 以 configId 聚合（舊資料只有 badgeId，退回用結尾比對，盡量救回來）
        const countOf = (cfgId) => (trophyCabinet || []).reduce((sum, t) => {
            const key = t.configId || t.badgeId || '';
            const hit = key === cfgId || String(key).endsWith(`_${cfgId}`);
            return hit ? sum + (Number(t.count) || 1) : sum;
        }, 0);

        const rows = catalog.map((ch) => {
            const count = countOf(ch.id);
            return {
                id: ch.id,
                /* 一律用任務標題（去掉月份前綴）。
                   ⚠️ 原本是 ch.badge || stripMonth(ch.title) —— badge 是題庫裡
                      另取的別名（點名之光、半程弧線…），只有這一個畫面在用。
                      任務卡、成就頁顯示的都是 title，三個地方兩個名字，
                      使用者對不起來這是同一筆任務。 */
                title: stripMonth(ch.title),
            from: stripMonth(ch.title),
            material: ch.material || 'clay',
            color: ch.color || '#CFC6B8',
                count,
                tier: tierForCount(count),
                next: nextTierForCount(count),
            };
        });
        return {
            earned: rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
            locked: rows.filter((r) => r.count === 0),
        };
    }, [trophyCabinet, clubType, fixedIds]);

    return (
        <div>
            <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <h3 style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.03em', color: C.ink, margin: 0, fontFamily: DISPLAY }}>
                        展示櫃
                    </h3>
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>
                        {earned.length} / {earned.length + locked.length}
                    </span>
                </div>
            </div>

            {earned.length === 0 ? (
                <div style={{ padding: '26px 20px', textAlign: 'center', background: C.paper, border: `1px dashed ${C.pebble}`, borderRadius: 18, marginBottom: 14 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, margin: 0 }}>完成一次本月挑戰，拿第一枚徽章</p>
                </div>
            ) : (
                earned.map((it, i) => <BadgeRow key={it.id} item={it} idx={i} />)
            )}

            {locked.length > 0 && (
                <>
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowLocked((v) => !v)}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            minHeight: 44, padding: '0', borderRadius: 999, cursor: 'pointer',
                            background: 'transparent', border: `1px dashed ${C.pebble}`, marginTop: 4,
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>
                            還沒完成的 {locked.length} 個
                        </span>
                        <motion.span animate={{ rotate: showLocked ? 180 : 0 }} style={{ display: 'flex' }}>
                            <ChevronDown size={15} color={C.sub} />
                        </motion.span>
                    </motion.button>

                    {showLocked && (
                        <div style={{ marginTop: 12 }}>
                            {locked.map((it, i) => <BadgeRow key={it.id} item={it} idx={i} />)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ClubBadgeCabinet;
