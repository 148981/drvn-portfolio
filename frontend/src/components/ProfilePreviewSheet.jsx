/**
 * ProfilePreviewSheet — 個人資料預覽（別人點你、或你點自己時看到的那一張）
 * ─────────────────────────────────────────────────────────────────────
 * 不是整頁個人頁，是一張「名片」：一眼看懂這個人是誰、練什麼、在哪個社團。
 *   上：深色拉絲鈦牆 —— 頭像、名字、稱號（自己的才有：稱號存在自己手機上）、所在地
 *   中：自介（最多三行）→ 三個數字（訓練次數／跑了幾公里／重訓幾次）用 1.5px 直角硬線隔開
 *   下：加入的社團 → 徽章（自己的：本機算出並同步到後端；別人的：讀後端同步的那份）
 *   底：看完整個人頁
 * 資料：GET /api/social/friends/profile/{uid}（名字、頭像、自介、數據，可互看）
 *       GET /api/squads/user/{uid}/memberships（社團，可互看）；自己的再併本機社團。
 * 沒有的欄位就不顯示，不放佔位字。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin } from 'lucide-react';
import apiClient from '../api/client';
import { pressProps } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { getUserId, resolveDisplayName } from '../utils/auth';
import { getFeaturedTitle } from '../utils/featuredTitle';
import { getClubs } from '../utils/socialDataConnector';
import { getMyShowcaseBadges, syncShowcaseBadges } from '../utils/showcaseBadges';
import darkBrush from '../assets/titanium-dark-brushed.jpeg';
import ModerationMenu from './SocialFeed/ModerationMenu';

const INK = '#161415';
const PAPER = '#F6F4F1';
const MUTED = 'rgba(22,20,21,0.55)';
const FAINT = 'rgba(22,20,21,0.40)';

const isImg = (a) => typeof a === 'string' && (/^(https?:|data:|\/)/.test(a));

export default function ProfilePreviewSheet({ open, userId: targetId, seed = null, onClose, onOpenFull, fullLabel = '看完整個人頁' }) {
    const me = getUserId();
    const uid = targetId || me;
    const isSelf = uid === me;
    const [p, setP] = useState(seed);
    const [squads, setSquads] = useState([]);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!open || !uid) return undefined;
        let alive = true;
        setP(seed);
        setLoadError('');
        apiClient.get(`/api/social/friends/profile/${uid}`)
            .then((r) => { if (alive && r?.data) setP((prev) => ({ ...(prev || {}), ...r.data })); })
            .catch((err) => {
                // 以前失敗完全不吭聲，畫面只剩一個「—」；說清楚是找不到人還是連不上
                if (!alive) return;
                setLoadError(err?.response?.status === 404 ? '找不到這位使用者' : '個人資料載入失敗，請稍後再試');
            });
        apiClient.get(`/api/squads/user/${uid}/memberships`)
            .then((r) => { if (alive) setSquads(r?.data?.squads || []); })
            .catch(() => { if (alive) setSquads([]); });
        return () => { alive = false; };
    }, [open, uid]); // eslint-disable-line react-hooks/exhaustive-deps

    // 社團：後端的 ＋ 自己手機上的（自己才有），同名去重
    const clubNames = useMemo(() => {
        const names = squads.map((s) => s?.name).filter(Boolean);
        if (isSelf) {
            try { (getClubs(uid) || []).forEach((c) => { if (c?.name) names.push(c.name); }); } catch { /* ignore */ }
        }
        return [...new Set(names)].slice(0, 6);
    }, [squads, isSelf, uid]);

    const title = isSelf ? (getFeaturedTitle(uid)?.label || '') : (p?.title || '');
    // 徽章：自己的直接用本機算的（順便同步給別人看）；別人的讀後端
    const myBadges = useMemo(() => (isSelf && open ? getMyShowcaseBadges(uid) : []), [isSelf, uid, open]);
    useEffect(() => { if (isSelf && open && myBadges.length) syncShowcaseBadges(uid, myBadges); }, [isSelf, open, uid, myBadges]);
    const badges = (isSelf ? myBadges : (Array.isArray(p?.badges) ? p.badges : [])).slice(0, 12);

    const name = (isSelf ? resolveDisplayName(uid, p?.name) : p?.name) || '—';
    const disc = p?.discriminator && p.discriminator !== '0000' ? `#${p.discriminator}` : '';
    const s = p?.stats || {};
    const stats = [
        { k: '訓練', v: s.total_workouts, u: '次' },
        { k: '跑步', v: s.run_distance != null ? Math.round(s.run_distance) : null, u: 'km' },
        { k: '重訓', v: s.strength_count, u: '次' },
    ].filter((x) => x.v != null);

    const ui = (
        <AnimatePresence>
            {open && (
                <motion.div key="pp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}
                    onClick={onClose}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(22,20,21,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0, transition: { duration: 0.16 } }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            width: '100%', maxWidth: 440, boxSizing: 'border-box', background: PAPER, color: INK,
                            borderRadius: '36px 36px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)',
                        }}>
                        {/* 上：深色拉絲鈦牆 */}
                        <div className="ti-surface-dark ti-brushed-dark" style={{ '--ti-brush-dark-img': `url(${darkBrush})`, position: 'relative', overflow: 'hidden', padding: '14px 20px 20px', flexShrink: 0 }}>
                            <div className="ti-ambient ti-ambient--warm" aria-hidden />
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div aria-hidden style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(246,244,241,0.35)', margin: '0 auto 12px' }} />
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ width: 72, height: 72, borderRadius: 999, overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(246,244,241,0.35)', background: 'rgba(246,244,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>
                                        {isImg(p?.avatar) ? <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p?.avatar || '🏃')}
                                    </div>
                                    {/* App Store 1.2：別人的個人資料可以檢舉、封鎖（或解除封鎖） */}
                                    {!isSelf && (
                                        <span style={{ marginLeft: 'auto' }}>
                                            <ModerationMenu type="user" targetId={uid} authorId={uid} authorName={p?.name || ''}
                                                snapshot={[p?.name, p?.bio].filter(Boolean).join('\n')} color={PAPER}
                                                onDone={(what) => { if (what === 'block') onClose(); }} />
                                        </span>
                                    )}
                                    <motion.button {...pressProps('icon')} type="button" aria-label="關閉" onClick={() => { haptic('light'); onClose(); }}
                                        style={{ width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(246,244,241,0.2)', background: 'rgba(246,244,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <X size={18} color={PAPER} />
                                    </motion.button>
                                </div>
                                <div style={{ marginTop: 14, color: PAPER, fontFamily: "'Tenor Sans', sans-serif", fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>
                                    {name}<span style={{ fontSize: 15, color: 'rgba(246,244,241,0.5)', marginLeft: 6 }}>{disc}</span>
                                </div>
                                {title && (
                                    <div style={{ marginTop: 8, fontFamily: '"ChironSungHK", "Noto Serif TC", serif', fontStyle: 'italic', fontWeight: 600, fontSize: 17, color: '#F2C7A8', letterSpacing: '0.04em' }}>
                                        {title}
                                    </div>
                                )}
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'rgba(246,244,241,0.66)' }}>
                                    {p?.city && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} />{p.city}</span>}
                                    {p?.tag && <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(246,244,241,0.12)', fontSize: 11, letterSpacing: '0.12em' }}>{String(p.tag).toUpperCase()}</span>}
                                </div>
                            </div>
                        </div>

                        {/* 中下：捲動區 */}
                        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '18px 20px 12px' }}>
                            {loadError && !p?.name && (
                                <p role="alert" style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#D94030' }}>{loadError}</p>
                            )}
                            {p?.bio ? (
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: INK, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.bio}</p>
                            ) : isSelf ? (
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: FAINT }}>還沒寫自介</p>
                            ) : null}

                            {stats.length > 0 && (
                                <div style={{ display: 'flex', marginTop: 16, borderTop: '1.5px solid #CFC6B8', paddingTop: 12 }}>
                                    {stats.map((x, i) => (
                                        <div key={x.k} style={{ flex: 1, minWidth: 0, paddingLeft: i ? 12 : 0, marginLeft: i ? 12 : 0, borderLeft: i ? '1.5px solid #CFC6B8' : 'none' }}>
                                            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: FAINT }}>{x.k}</div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
                                                <span className="ti-metric" style={{ fontSize: 26 }}>{Number(x.v).toLocaleString()}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{x.u}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: FAINT }}>社團</div>
                                {clubNames.length ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                        {clubNames.map((n) => (
                                            <span key={n} style={{ padding: '7px 12px', borderRadius: 999, background: '#E8E9E6', fontSize: 13, fontWeight: 700 }}>{n}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 14, fontWeight: 600, color: MUTED, marginTop: 6 }}>還沒加入社團</div>
                                )}
                            </div>

                            <div style={{ marginTop: 18 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: FAINT }}>徽章</div>
                                    {badges.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: FAINT }}>{badges.length} 枚</div>}
                                </div>
                                {badges.length ? (
                                    <div className="hide-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', marginTop: 8, paddingBottom: 4 }}>
                                        {badges.map((b) => (
                                            <div key={b.id} style={{ width: 88, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 88, height: 88, borderRadius: 24, background: '#fff', border: '1px solid rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px -14px rgba(32,32,32,0.25)' }}>
                                                    {b.image
                                                        ? <img src={b.image} alt="" style={{ width: 70, height: 70, objectFit: 'contain' }} />
                                                        : <span style={{ fontSize: 36 }}>{b.icon || '🏅'}</span>}
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: 'center', lineHeight: 1.3, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 14, fontWeight: 600, color: MUTED, marginTop: 6 }}>還沒有解鎖徽章</div>
                                )}
                            </div>
                        </div>

                        {onOpenFull && (
                            <div style={{ padding: '8px 20px max(20px, env(safe-area-inset-bottom))', flexShrink: 0 }}>
                                <motion.button {...pressProps('cta')} type="button"
                                    onClick={() => { haptic('light'); onOpenFull(); }}
                                    className="ti-btn-dark"
                                    style={{ width: '100%', height: 52, borderRadius: 999, fontSize: 15, letterSpacing: '0.08em', textTransform: 'none' }}>
                                    {fullLabel}
                                </motion.button>
                            </div>
                        )}
                        {!onOpenFull && <div style={{ height: 'max(16px, env(safe-area-inset-bottom))', flexShrink: 0 }} />}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui;
}
