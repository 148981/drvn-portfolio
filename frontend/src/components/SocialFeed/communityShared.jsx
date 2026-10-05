// ════════════════════════════════════════════════════════════════════
//  communityShared.jsx
//  跑步社群 (SocialHubMobile) 與健身社群 (FitnessCommunityPage) 共用的
//  JSX 元件。兩頁配色 (C) 略有差異，故一律以 props 傳入 colors，避免硬編。
//
//  共用：PortalSheet / Lbl / renderCaption / CommentSheet / EditPostSheet / HeroCards
//  不共用（刻意保留各頁專屬設計）：OfficialEventsBanner、RunCard/StrengthCard 卡片渲染
// ════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, ArrowUp, Activity, RefreshCcw, Heart, MessageCircle, UserPlus, MapPin, Check, ChevronRight } from 'lucide-react';
import { VISIBILITY_OPTIONS, COMMUNITY_TARGETS } from '../../utils/followGraph';
import { triggerHaptic, timeAgo } from './communityHelpers';

import api from '../../api/client';
// 🪪 我在社群裡叫什麼名字（留言不再一律署名「我」）
import { appendIdentity, getDisplayName } from '../../utils/socialIdentity';
import { getUserId } from '../../utils/auth';
import { reportContent, blockUser, isHiddenContent, isBlockedUser, useModerationVersion } from '../../utils/moderation';

/** 把 sheet 渲染到 body 之上，確保 z-index 不被父層 stacking context 壓住 */
export const PortalSheet = ({ children }) =>
    createPortal(<div style={{ position: 'relative', zIndex: 100100 }}>{children}</div>, document.body);

/** 小型 uppercase 標籤 */
export const Lbl = ({ c, children, style = {} }) => (
    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: c, ...style }}>
        {children}
    </span>
);

/** 將 @提及 高亮。accent = 點綴色 (各頁的 coral) */
export const renderCaption = (text, accent = '#F95C4B') => {
    if (!text) return null;
    return text.split(/(@\w+)/g).map((part, i) =>
        part.startsWith('@')
            ? <span key={i} className="font-black" style={{ color: accent }}>{part}</span>
            : part
    );
};

/* ═══ COMMENT SHEET (玻璃材質 + 無障礙 aria-label，統一採跑步頁版本) ═══ */
export const CommentSheet = ({ postId, onClose, userId, C, mockComments = {}, onPosted }) => {
    // 呼叫端不一定會傳 userId（有幾處沒傳），沒傳就自己取，
    // 否則留言快取的 key 會變成 undefined，所有帳號又共用同一格。
    const myId = userId || getUserId() || 'local';
    const [comments, setComments] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [likedMap, setLikedMap] = useState({});
    const [replyTo, setReplyTo] = useState(null);
    const [confirmBlock, setConfirmBlock] = useState(null);   // 封鎖要按兩下（第二下才生效）
    useModerationVersion();

    /* 🔑 留言快取的 key 原本是 `drvn_comments_${postId}` —— 沒有帶 userId。
       貼文本身是用 uStorage(userId) 命名空間隔離的，留言卻是全域的，
       同一台裝置換帳號登入，上一個人的留言會直接出現在新帳號眼裡。
       補上 userId 後兩者的隔離規則才一致。 */
    const LS_KEY = `drvn_comments_${myId}_${postId}`;
    const LEGACY_KEY = `drvn_comments_${postId}`;   // 舊格式：只讀不寫，讓既有留言不會消失
    const readLocal = () => {
        try {
            const cur = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
            if (cur.length) return cur;
            return JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
        } catch { return []; }
    };
    const writeLocal = (list) => { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ok */ } };

    useEffect(() => {
        setLoading(true);
        const local = readLocal();
        api.get(`/api/activities/${postId}/comments`, { params: { user_id: myId } })
            .then(r => {
                const server = r.data?.comments || [];
                // 合併後端 + 本地（本地優先補上後端沒有的）
                const merged = [...server, ...local.filter(l => !server.some(s => (s.id || s.comment_id) === l.id))];
                setComments(merged);
            })
            .catch(() => setComments(local.length ? local : (mockComments[postId] || [])))
            .finally(() => setLoading(false));
    }, [postId]);

    const submit = async () => {
        if (!text.trim()) return;
        const body = replyTo ? `@${replyTo} ${text.trim()}` : text.trim();
        // 🪪 作者名字原本寫死「我」，而且會被送進後端 ——
        //    也就是說資料庫裡每個人的留言作者都叫「我」，別人看到的全部署名「我」。
        const myName = getDisplayName(myId);
        const c = { id: `t${Date.now()}`, user_id: myId, user_name: myName, content: body, created_at: new Date().toISOString() };
        const next = [...comments, c];
        setComments(next); setText(''); setReplyTo(null);
        writeLocal([...readLocal(), c]); // 立即存本地，確保不論後端有無都看得到
        if (onPosted) onPosted(postId); // 通知父層留言數 +1
        try {
            const fd = new FormData();
            appendIdentity(fd, myId);
            fd.append('content', c.content);
            await api.post(`/api/activities/${postId}/comments`, fd);
        } catch {
            /* 本機已存，留言不會不見；但要讓使用者知道別人現在還看不到。 */
            try {
                const { toast } = await import('../../utils/toast');
                toast.info('留言先存在這台裝置上，連上線後才會同步給其他人');
            } catch { /* toast 不可用不影響留言 */ }
        }
    };

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm" style={{ zIndex: 100200 }} onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }} className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto" style={{ zIndex: 100201 }}>
                <div style={{
                    background: '#F6F4F1',
                    borderTop: '1px solid rgba(207,198,184,0.8)',
                    borderRadius: '28px 28px 0 0', maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.18)'
                }}>
                    {/* 拖曳條 */}
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.18)' }} />
                    </div>
                    {/* 置中標題 + 關閉（IG 式） */}
                    <div style={{ padding: '10px 20px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'var(--font-body)' }}>留言</h3>
                        <motion.button {...pressProps('row')} aria-label="關閉留言" onClick={() => { triggerHaptic('light'); onClose(); }} style={{ position: 'absolute', right: 16, width: 30, height: 30, borderRadius: 15, background: 'rgba(0,0,0,0.05)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={15} color={C.sub} /></motion.button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 16px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 140 }}>
                        {loading ? (
                            <p className="text-center py-6 text-[12px]" style={{ color: C.sub }}>載入中...</p>
                        ) : comments.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '36px 0 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 24, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <MessageCircle size={20} color={C.sub} strokeWidth={1.8} />
                                </div>
                                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>還沒有留言</p>
                                <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>留下第一則留言吧</p>
                            </div>
                        ) : (
                            comments.filter((c) => !isHiddenContent(c.id || c.comment_id) && !isBlockedUser(c.user_id)).map(c => {
                                const cid = c.id || c.comment_id;
                                const isOthers = !!c.user_id && c.user_id !== myId;
                                const liked = !!likedMap[cid];
                                const likeCount = (c.like_count || 0) + (liked ? 1 : 0);
                                return (
                                    <div key={cid} style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.text, background: 'rgba(0,0,0,0.06)', fontFamily: 'var(--font-body)' }}>
                                            {(c.user_name || c.userName || 'U')[0]}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.text }}>
                                                <span style={{ fontWeight: 700, marginRight: 7, fontFamily: 'var(--font-body)' }}>{c.user_name || c.userName}</span>
                                                {c.content}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 5 }}>
                                                <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, color: C.sub }}>{c.time || timeAgo(c.created_at)}</span>
                                                {likeCount > 0 && <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, color: C.sub }}>{likeCount} 個讚</span>}
                                                <motion.button {...pressProps('row')} onClick={() => setReplyTo(c.user_name || c.userName)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: 'var(--font-body)' }}>回覆</motion.button>
                                                {/* App Store 1.2：別人的留言可以檢舉、封鎖 */}
                                                {isOthers && (
                                                    <motion.button {...pressProps('row')} onClick={() => reportContent({ type: 'comment', id: cid, authorId: c.user_id, reason: 'harassment', snapshot: c.content })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: 'var(--font-body)' }}>檢舉</motion.button>
                                                )}
                                                {isOthers && (
                                                    confirmBlock === cid
                                                        ? <motion.button {...pressProps('row')} onClick={() => { setConfirmBlock(null); blockUser(c.user_id, c.user_name || c.userName); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 800, color: '#D94030', fontFamily: 'var(--font-body)' }}>確定封鎖？</motion.button>
                                                        : <motion.button {...pressProps('row')} onClick={() => setConfirmBlock(cid)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: 'var(--font-body)' }}>封鎖</motion.button>
                                                )}
                                            </div>
                                        </div>
                                        <motion.button {...pressProps('row')} aria-label="讚留言" onClick={() => setLikedMap(m => ({ ...m, [cid]: !m[cid] }))} style={{ background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', alignSelf: 'flex-start' }}>
                                            <Heart size={14} color={liked ? C.highlight : C.sub} fill={liked ? C.highlight : 'none'} strokeWidth={2} />
                                        </motion.button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    {/* IG 式 emoji 快捷反應列 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        {['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'].map(em => (
                            <motion.button {...pressProps('row')} key={em} onClick={() => { triggerHaptic('light'); setText(t => t + em); }}
 style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 22, lineHeight: 1, transition: 'transform 0.1s' }}
 onMouseDown={e => e.currentTarget.style.transform = 'scale(1.3)'}
 onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
 onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                {em}
                            </motion.button>
                        ))}
                    </div>
                    {/* IG 式輸入列：頭像 + pill 輸入框 + 送出 */}
                    <div style={{ padding: '10px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 20px))', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.text, background: 'rgba(0,0,0,0.06)', fontFamily: 'var(--font-body)' }}>我</div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 16px', borderRadius: 24, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.03)' }}>
                            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
                                placeholder={replyTo ? `回覆 @${replyTo}…` : '新增留言…'}
                                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'var(--font-body)' }} />
                            <motion.button {...pressProps('row')} aria-label="送出留言" onClick={() => { triggerHaptic('medium'); submit(); }} disabled={!text.trim()}
 style={{ width: 32, height: 32, borderRadius: 18, flexShrink: 0, background: text.trim() ? C.highlight : 'rgba(0,0,0,0.06)', border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>
                                <ArrowUp size={16} color={text.trim() ? '#fff' : C.sub} strokeWidth={2.5} />
                            </motion.button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ SEGMENT BADGES — 這趟跑步在賽段拿到的成績（接真後端 by-session） ═══
   無成果就什麼都不渲染（graceful，不佔位、不塞假資料）。 */
export const SegmentBadges = ({ sessionId, userId, C }) => {
    const [results, setResults] = useState([]);

    useEffect(() => {
        if (!sessionId) return;
        let alive = true;
        const url = `/api/segments/by-session/${encodeURIComponent(sessionId)}` + (userId ? `?user_id=${encodeURIComponent(userId)}` : '');
        api.get(url)
            .then(r => { if (alive) setResults(r.data?.segment_results || []); })
            .catch(() => { if (alive) setResults([]); });
        return () => { alive = false; };
    }, [sessionId, userId]);

    if (!results.length) return null;

    // 最多顯示前 3 個（KOM/PR/名次已在後端排序好）
    const top = results.slice(0, 3);

    const ordinal = (n) => (n === 1 ? '🏆 KOM' : `#${n}`);

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 10px' }}>
            {top.map((r) => {
                const isTop = r.is_kom;
                const isPr = r.is_pr && !r.is_kom;
                const bg = isTop ? C.coral : isPr ? 'rgba(249,92,75,0.12)' : 'rgba(22,20,21,0.06)';
                const fg = isTop ? '#fff' : C.textPrimary || '#161415';
                const label = r.rank ? ordinal(r.rank) : '完成';
                return (
                    <div key={r.segment_id}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: bg, color: fg,
                            borderRadius: 999, padding: '5px 11px',
                            fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
                            border: isTop ? 'none' : '1px solid rgba(22,20,21,0.08)',
                        }}
                        title={`${r.segment_name}${r.total_athletes ? ` · ${r.total_athletes} 人挑戰` : ''}`}>
                        <span style={{ fontWeight: 900 }}>{label}</span>
                        <span style={{ opacity: isTop ? 0.85 : 0.6, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.segment_name}
                        </span>
                        {isPr && <span style={{ color: isTop ? '#fff' : C.coral, fontWeight: 900 }}>⭐PR</span>}
                    </div>
                );
            })}
        </div>
    );
};

/* ═══ KUDOS SHEET — 誰按了讚（接真後端 GET /api/activities/{id}/kudos） ═══ */
export const KudosSheet = ({ postId, onClose, C }) => {
    const [kudoers, setKudoers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        api.get(`/api/activities/${postId}/kudos`)
            .then(r => { if (alive) setKudoers(r.data?.kudoers || []); })
            .catch(() => { if (alive) setKudoers([]); })   // 無資料/離線：顯示空狀態，不塞假資料
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [postId]);

    return (
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }} className="fixed bottom-0 left-0 right-0 z-[80] max-w-[440px] mx-auto">
                <div style={{
                    background: 'rgba(255, 253, 248, 0.78)',
                    backdropFilter: 'blur(32px) saturate(1.8)', WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                    borderTop: '1.5px solid rgba(255,255,255,0.9)',
                    borderRadius: '28px 28px 0 0', maxHeight: '70dvh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)'
                }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                            按讚 {kudoers.length > 0 ? `· ${kudoers.length}` : ''}
                        </h3>
                        <motion.button {...pressProps('row')} aria-label="關閉按讚名單" onClick={() => { triggerHaptic('light'); onClose(); }} style={{ width: 32, height: 32, borderRadius: 18, background: 'rgba(0,0,0,0.05)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color={C.sub} /></motion.button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 120 }}>
                        {loading ? <p className="text-center py-6 text-[12px]" style={{ color: C.sub }}>載入中...</p>
                            : kudoers.length === 0 ? <p className="text-center py-10 text-[13px] font-bold" style={{ color: C.sub }}>還沒有人按讚 — 當第一個吧</p>
                                : kudoers.map((k, i) => (
                                    <div key={k.user_id + '_' + i} className="flex items-center gap-3 py-2">
                                        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-black" style={{ background: 'rgba(0,0,0,0.06)', color: C.text }}>{k.init || (k.user_name || 'U')[0]}</div>
                                        <span className="text-[14px] font-bold" style={{ color: C.text }}>{k.user_name}</span>
                                        {k.created_at && <span className="text-[11px] ml-auto" style={{ color: C.sub }}>{timeAgo(k.created_at)}</span>}
                                    </div>
                                ))}
                    </div>
                </div>
            </motion.div>
        </>
    );
};

/* ═══ EDIT POST SHEET —— 編輯貼文（跟發文同一組欄位）═══
 * 稽核前只能改內文一個欄位，而且存檔從來沒進伺服器（PUT 少帶 user_id → 422）。
 * 現在：標題、內文、標註用戶、地點、誰可以看、發布到哪、照片位置 —— 發文時能填的，
 * 發完都改得回來；只把「有改的欄位」送出去。
 * 版型照 IG：上方「取消 · 編輯貼文 · 完成」，鍵盤彈出也按得到完成。 */
export const EditPostSheet = ({ post, onClose, onSave, C = {} }) => {
    const INK = C.text || '#161415';
    const CORAL = C.coral || '#F95C4B';

    const initial = useMemo(() => {
        const comm = post.targets || post.communities;
        return {
            title: post.title || '',
            caption: post.caption || '',
            location: post.location || '',
            tags: Array.isArray(post.tags) ? post.tags.filter(Boolean) : [],
            visibility: post.visibility || 'public',
            // 舊貼文沒有 targets → 兩個社群都看得到（socialFeed.belongsHere 的規則），勾選要照實呈現
            communities: Array.isArray(comm) ? comm : ['run', 'fitness'],
            imgPos: post.imgPos ?? 50,
        };
    }, [post]);
    const [f, setF] = useState(initial);
    const [open, setOpen] = useState({ tags: false, location: false });
    const [tagInput, setTagInput] = useState('');
    const [users, setUsers] = useState(null);   // null = 還沒載入
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    const raw = post.raw || {};
    const photo = post.photo || raw.photo_url || (Array.isArray(post.images) ? post.images[0] : null) || null;
    const isPhotoPost = !!photo && (post.type === 'post' || post.activity_type === 'post' || raw.activity_type === 'post');

    // 只送有改的欄位
    const patch = {};
    ['title', 'caption', 'location', 'visibility', 'imgPos'].forEach((k) => {
        const a = typeof f[k] === 'string' ? f[k].trim() : f[k];
        const b = typeof initial[k] === 'string' ? initial[k].trim() : initial[k];
        if (a !== b) patch[k] = typeof f[k] === 'string' ? f[k].trim() : f[k];
    });
    if (JSON.stringify(f.tags) !== JSON.stringify(initial.tags)) patch.tags = f.tags;
    if ([...f.communities].sort().join() !== [...initial.communities].sort().join()) patch.communities = f.communities;
    const dirty = Object.keys(patch).length > 0;
    // 純文字貼文不能把字全部刪光（那等於刪文，應該走刪除）
    const blank = !f.caption.trim() && !f.title.trim() && !photo && !post.drvnCard && !post.meetup && !post.stats?.distance;

    useEffect(() => {
        if (!open.tags || users !== null) return;
        api.get('/api/user/profiles').then((r) => {
            const me = getUserId();
            const list = Object.entries(r?.data || {})
                .map(([id, p]) => ({ id, name: p?.name || p?.displayName || p?.username || '' }))
                .filter((u) => u.name && u.id !== me);
            setUsers(list);
        }).catch(() => setUsers([]));
    }, [open.tags, users]);
    const q = tagInput.trim().toLowerCase();
    const suggestions = (q && Array.isArray(users))
        ? users.filter((u) => u.name.toLowerCase().includes(q) && !f.tags.includes(u.name)).slice(0, 5)
        : [];

    const handleSave = async () => {
        if (!dirty || saving || blank) return;
        setSaving(true);
        triggerHaptic('medium');
        const ok = await onSave(post.id, patch);
        setSaving(false);
        if (ok !== false) onClose();
    };

    const rowBtn = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%',
        minHeight: 52, padding: '0 2px', background: 'none', border: 'none', cursor: 'pointer',
        borderTop: '1px solid rgba(22,20,21,0.08)', textAlign: 'left',
    };
    const input = {
        width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 14px', borderRadius: 14,
        border: '1px solid rgba(22,20,21,0.12)', background: '#fff', outline: 'none',
        fontSize: 15, color: INK, fontFamily: 'var(--font-body)',
    };
    const label = { fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)', margin: '22px 2px 10px', letterSpacing: '0.02em' };

    return (
        <PortalSheet>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0" style={{ zIndex: 100200, background: 'rgba(22,20,21,0.42)' }} onClick={onClose} />
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 260 }}
                className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto"
                style={{ zIndex: 100201 }}
                role="dialog" aria-label="編輯貼文"
            >
                <div style={{
                    background: '#F6F4F1', borderRadius: '28px 28px 0 0', boxShadow: '0 -8px 40px rgba(22,20,21,0.16)',
                    maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(22,20,21,0.18)' }} />
                    </div>

                    {/* 取消 · 編輯貼文 · 完成 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px', borderBottom: '1px solid rgba(22,20,21,0.07)' }}>
                        <motion.button {...pressProps('pill')} onClick={onClose}
                            style={{ minWidth: 64, minHeight: 44, background: 'none', border: 'none', fontSize: 15, color: 'rgba(22,20,21,0.6)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            取消
                        </motion.button>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK, fontFamily: 'var(--font-body)' }}>編輯貼文</h3>
                        <motion.button {...pressProps('pill')} onClick={handleSave} disabled={!dirty || saving || blank}
                            style={{
                                minWidth: 64, minHeight: 44, background: 'none', border: 'none', fontSize: 15, fontWeight: 800,
                                color: (!dirty || blank) ? 'rgba(22,20,21,0.25)' : CORAL,
                                cursor: (!dirty || saving || blank) ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
                            }}>
                            {saving ? '儲存中' : '完成'}
                        </motion.button>
                    </div>

                    <div style={{ overflowY: 'auto', padding: '16px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                        {/* 照片＋文字（IG：縮圖在左、文字在右）*/}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {photo && (
                                <div style={{ width: 76, aspectRatio: post.orientation === 'landscape' ? '16 / 10' : '4 / 5', borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: INK }}>
                                    <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `50% ${f.imgPos}%`, display: 'block' }} />
                                </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <input value={f.title} onChange={(e) => set('title', e.target.value.slice(0, 80))} placeholder="標題（選填）"
                                    style={{ ...input, minHeight: 44, fontWeight: 700, border: 'none', background: 'transparent', padding: '0 2px' }} />
                                <textarea value={f.caption} onChange={(e) => set('caption', e.target.value.slice(0, 2200))} placeholder="寫點什麼…"
                                    autoFocus rows={4}
                                    style={{ ...input, minHeight: 96, padding: '4px 2px', border: 'none', background: 'transparent', lineHeight: 1.6, resize: 'none' }} />
                            </div>
                        </div>

                        {isPhotoPost && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, marginTop: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.6)', flexShrink: 0 }}>照片位置</span>
                                <input type="range" min={0} max={100} step={1} value={f.imgPos}
                                    onChange={(e) => set('imgPos', Number(e.target.value))}
                                    aria-label="照片上下位置" style={{ flex: 1, minWidth: 0, accentColor: CORAL }} />
                            </label>
                        )}

                        {/* 標註用戶 */}
                        <div style={{ marginTop: 14 }}>
                            <motion.button {...pressProps('row')} style={rowBtn} onClick={() => setOpen((o) => ({ ...o, tags: !o.tags }))}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                    <UserPlus size={18} color="rgba(22,20,21,0.55)" strokeWidth={1.8} />
                                    <span style={{ fontSize: 15, color: INK }}>標註用戶</span>
                                </span>
                                {f.tags.length > 0
                                    ? <span style={{ fontSize: 13, color: CORAL, flexShrink: 0 }}>{f.tags.length} 人</span>
                                    : <ChevronRight size={18} color="rgba(22,20,21,0.3)" />}
                            </motion.button>
                            {open.tags && (
                                <div style={{ padding: '4px 0 12px' }}>
                                    <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="搜尋用戶名稱" style={input} />
                                    {q && (
                                        <div style={{ marginTop: 6 }}>
                                            {users === null ? (
                                                <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.4)', margin: '8px 2px' }}>載入中…</p>
                                            ) : suggestions.length === 0 ? (
                                                <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.4)', margin: '8px 2px' }}>找不到「{tagInput.trim()}」</p>
                                            ) : suggestions.map((u) => (
                                                <motion.button {...pressProps('row')} key={u.id}
                                                    onClick={() => { set('tags', [...f.tags, u.name]); setTagInput(''); triggerHaptic('light'); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                                    <span style={{ width: 28, height: 28, borderRadius: 99, background: 'rgba(22,20,21,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{u.name[0]}</span>
                                                    <span style={{ fontSize: 14, color: INK }}>{u.name}</span>
                                                </motion.button>
                                            ))}
                                        </div>
                                    )}
                                    {f.tags.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                            {f.tags.map((t) => (
                                                <motion.button {...pressProps('pill')} key={t} aria-label={`移除 ${t}`}
                                                    onClick={() => set('tags', f.tags.filter((x) => x !== t))}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 12px', borderRadius: 99, border: 'none', background: 'rgba(22,20,21,0.06)', fontSize: 13, color: INK, cursor: 'pointer' }}>
                                                    @{t} <X size={12} />
                                                </motion.button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 地點 */}
                            <motion.button {...pressProps('row')} style={rowBtn} onClick={() => setOpen((o) => ({ ...o, location: !o.location }))}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                    <MapPin size={18} color="rgba(22,20,21,0.55)" strokeWidth={1.8} />
                                    <span style={{ fontSize: 15, color: INK }}>地點</span>
                                </span>
                                {f.location.trim()
                                    ? <span style={{ fontSize: 13, color: CORAL, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.location.trim()}</span>
                                    : <ChevronRight size={18} color="rgba(22,20,21,0.3)" />}
                            </motion.button>
                            {open.location && (
                                <div style={{ padding: '4px 0 12px', display: 'flex', gap: 8 }}>
                                    <input value={f.location} onChange={(e) => set('location', e.target.value.slice(0, 80))} placeholder="輸入地點" style={{ ...input, flex: 1, minWidth: 0 }} />
                                    {f.location && (
                                        <motion.button {...pressProps('pill')} onClick={() => set('location', '')}
                                            style={{ minWidth: 64, minHeight: 44, borderRadius: 14, border: 'none', background: 'rgba(22,20,21,0.06)', fontSize: 14, color: INK, cursor: 'pointer' }}>
                                            清除
                                        </motion.button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 誰可以看 */}
                        <p style={label}>誰可以看</p>
                        <div style={{ display: 'flex', padding: 4, borderRadius: 14, background: 'rgba(22,20,21,0.05)', gap: 4 }}>
                            {VISIBILITY_OPTIONS.map((v) => {
                                const on = f.visibility === v.id;
                                return (
                                    <motion.button {...pressProps('pill')} key={v.id} aria-pressed={on} onClick={() => set('visibility', v.id)}
                                        style={{
                                            flex: 1, minHeight: 44, borderRadius: 11, border: 'none', cursor: 'pointer',
                                            background: on ? INK : 'transparent', color: on ? '#F6F4F1' : 'rgba(22,20,21,0.55)',
                                            fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)',
                                        }}>
                                        {v.label}
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* 發布到 */}
                        <p style={label}>發布到</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {COMMUNITY_TARGETS.map((c) => {
                                const on = f.communities.includes(c.id);
                                return (
                                    <motion.button {...pressProps('pill')} key={c.id} aria-pressed={on}
                                        onClick={() => set('communities', on ? f.communities.filter((x) => x !== c.id) : [...f.communities, c.id])}
                                        style={{
                                            flex: 1, minHeight: 44, borderRadius: 14, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            background: on ? '#fff' : 'transparent',
                                            border: on ? `1.5px solid ${CORAL}` : '1px solid rgba(22,20,21,0.14)',
                                            color: INK, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)',
                                        }}>
                                        {on && <Check size={15} color={CORAL} strokeWidth={2.6} />}
                                        {c.label}
                                    </motion.button>
                                );
                            })}
                        </div>
                        {f.communities.length === 0 && (
                            <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.5)', margin: '10px 2px 0' }}>都不選 → 只會留在你的個人檔案</p>
                        )}
                    </div>
                </div>
            </motion.div>
        </PortalSheet>
    );
};

/* ═══ HERO CARDS (探索入口；左卡為跨社群導引，右卡固定為 Gear Garage) ═══
 *  以 props 描述左卡，避免兩頁各自硬編造成漂移。
 *  primary: { onClick, image, label, titleTop, titleBottom, Icon }
 */
/* 探索入口卡。
   ⚠️ 這一排原本兩張 h-52（208px）＋ mb-8，加上區塊標頭是動態牆最高的一段，
      使用者要一路捲過它才看得到貼文。改成 h-40（160px）＋ mb-5。
   ⚠️ 原本卡上那行小標是 9px（低於介面標準 §1.4 的 11px 下限），
      而且「裝備」小標下面就是「裝備倉庫」—— 同一件事講兩次（§3）。
      標題自己講得清楚，小標整行刪掉。 */
export const HeroCards = ({ navigate, C, primary }) => (
    <div className="px-5 mb-5 relative z-10">
        <div className="grid grid-cols-2 gap-4">
            <div className="relative rounded-[24px] overflow-hidden cursor-pointer h-40 group border border-white/5 shadow-2xl" onClick={primary.onClick}>
                <div className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
                    style={{ backgroundImage: `url(${primary.image})`, filter: 'grayscale(20%) contrast(1.1)' }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
                <div className="relative z-10 p-5 h-full flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center backdrop-blur-md" style={{ background: C.black }}>
                        <primary.Icon size={14} color="#FFFFFF" />
                    </div>
                    <div>
                        <h3 className="font-light text-[26px] leading-[1.1]" style={{ color: '#FFFFFF', fontFamily: '"Tenor Sans", sans-serif', fontStyle: 'italic' }}>
                            {primary.titleTop}<br /><span className="font-bold">{primary.titleBottom}</span>
                        </h3>
                    </div>
                </div>
            </div>

            <div className="relative rounded-[24px] overflow-hidden cursor-pointer h-40 group border border-white/5 shadow-2xl" onClick={() => navigate('/gear-garage-mobile')}>
                <div className="absolute inset-0 bg-cover transition-transform duration-1000 group-hover:scale-105"
                    style={{ backgroundImage: `url(${primary.gearImage})`, backgroundPosition: '85% 45%', filter: 'grayscale(20%) contrast(1.1)' }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
                <div className="relative z-10 p-5 h-full flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center backdrop-blur-md" style={{ background: C.black }}>
                        <RefreshCcw size={14} color="#FFFFFF" />
                    </div>
                    <div>
                        <h3 className="font-light text-[26px] leading-[1.1]" style={{ color: '#FFFFFF', fontFamily: '"Tenor Sans", sans-serif', fontStyle: 'italic' }}>
                            裝備<br /><span className="font-bold">倉庫</span>
                        </h3>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
