/**
 * ══════════════════════════════════════════════════════════════════════════
 * FeedPost —— 動態牆一則貼文的外框（IG 版型）
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   頭像  名字（與 A 等 N 人）                         ⋯
 *         地點／這次的成果
 *   ────────────── 媒體：左右滿版，不留卡片邊距 ──────────────
 *   ♡ 36   💬 13   ↗                                     （動作列）
 *   名字 標題 內文……                                      （兩行，超過收成「更多」）
 *   賽段徽章／揪團卡
 *   17 分鐘前
 *
 * 為什麼收成一份：跑步社群的 RunCard 與健身社群的 StrengthCard 各自畫了一套
 * 頭像列、選單、按讚列，已經開始漂移 —— 健身那邊的分享鍵只會震動、
 * 選單對「別人的貼文」也秀出編輯／刪除、作者名直接印「訪客用戶」。
 * 外框收成這一份，兩邊只負責畫自己的媒體區。
 *
 * 可點元素一律 pressProps ＋ 觸控區 ≥ 44（介面標準 §1.4 §8）。
 */
import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Send, MoreHorizontal, Pencil, Trash2, Copy, MapPin, Flag, Ban } from 'lucide-react';
import { REPORT_REASONS, reportContent, blockUser, isHiddenContent, isBlockedUser, useModerationVersion } from '../../utils/moderation';
import { pressProps } from '../../utils/nutritionMotion';
import { triggerHaptic, resolvePostAvatar, resolvePostAuthorName, resolvePostDate, timeAgo } from './communityHelpers';
import { renderCaption } from './communityShared';
import { sharePost, postSummary } from '../../utils/sharePost';
import { toast } from '../../utils/toast';
import { VISIBILITY_OPTIONS } from '../../utils/followGraph';

const INK = '#161415';
const CORAL = '#F95C4B';
const EMBER = '#D94030';
const PAPER = '#F6F4F1';
export const FEED_MAX_W = 440;

/* 這一則實際多寬 —— 媒體區的 DRVN 卡牌要照寬度等比縮放。
   以前寫死 window.innerWidth - 56，換了外框寬度就全部對不上。 */
export const useMeasuredWidth = (ref) => {
    const [w, setW] = useState(() => Math.min(typeof window !== 'undefined' ? window.innerWidth : 390, FEED_MAX_W));
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const read = () => {
            const x = Math.round(el.getBoundingClientRect().width);
            if (x > 0) setW((prev) => (prev === x ? prev : x));
        };
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return w;
};

/* ═══ 照片：一張就單張，多張就左右滑（右上角 1/5、底部圓點）═══ */
export const PostPhotos = ({ post }) => {
    const raw = post.raw || {};
    const list = (Array.isArray(post.images) && post.images.length) ? post.images
        : (Array.isArray(raw.images) && raw.images.length) ? raw.images
        : [post.photo || post.routeImg || raw.photo_url].filter(Boolean);
    const [idx, setIdx] = useState(0);
    const scroller = useRef(null);
    if (!list.length) return null;

    const ratio = post.orientation === 'landscape' ? '16 / 10' : '4 / 5';
    const many = list.length > 1;
    const onScroll = () => {
        const el = scroller.current;
        if (!el) return;
        const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        if (i !== idx) setIdx(i);
    };

    return (
        <div style={{ position: 'relative', background: INK }}>
            <div
                ref={scroller}
                onScroll={many ? onScroll : undefined}
                className="no-scrollbar"
                style={{
                    display: 'flex', overflowX: many ? 'auto' : 'hidden', overflowY: 'hidden',
                    scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y',
                }}
            >
                {list.map((src, i) => (
                    <div key={i} style={{ flex: '0 0 100%', aspectRatio: ratio, scrollSnapAlign: 'start', position: 'relative' }}>
                        <img
                            loading={i === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false}
                            src={src} alt={post.caption || '貼文照片'}
                            style={{
                                width: '100%', height: '100%', display: 'block', objectFit: 'cover',
                                // 發文時拖的照片位置只對第一張（編輯器也只有那一張能拖）
                                objectPosition: i === 0 ? `50% ${post.imgPos ?? 50}%` : '50% 50%',
                            }}
                        />
                    </div>
                ))}
            </div>
            {many && (
                <>
                    <span aria-hidden style={{
                        position: 'absolute', top: 12, right: 12, padding: '4px 9px', borderRadius: 99,
                        background: 'rgba(22,20,21,0.62)', color: PAPER, fontSize: 12, fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
                    }}>{idx + 1}/{list.length}</span>
                    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
                        {list.map((_, i) => (
                            <span key={i} style={{
                                width: 6, height: 6, borderRadius: 3,
                                background: i === idx ? PAPER : 'rgba(246,244,241,0.45)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'background 0.2s',
                            }} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

/* ═══ 選單：由下彈出（跟留言、編輯同一種 sheet，不再是飄在按鈕旁的小框）═══ */
const PostMenuSheet = ({ open, onClose, items }) => createPortal(
    <AnimatePresence>
        {open && (
            <React.Fragment key="post-menu">
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(22,20,21,0.42)', zIndex: 100300 }}
                />
                <motion.div
                    role="menu"
                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                    style={{
                        position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: FEED_MAX_W, margin: '0 auto',
                        zIndex: 100301, padding: '0 10px', boxSizing: 'border-box',
                        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                    }}
                >
                    <div style={{ background: PAPER, borderRadius: 22, overflow: 'hidden', boxShadow: '0 -8px 40px rgba(22,20,21,0.18)' }}>
                        {items.map((it, i) => (
                            <motion.button
                                key={it.id} {...pressProps('row')} role="menuitem"
                                onClick={() => { onClose(); it.run(); }}
                                style={{
                                    width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '0 20px', background: 'transparent', border: 'none', cursor: 'pointer',
                                    borderTop: i ? '1px solid rgba(22,20,21,0.07)' : 'none', textAlign: 'left',
                                    color: it.danger ? EMBER : INK, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-body)',
                                }}
                            >
                                <it.Icon size={19} strokeWidth={1.9} color={it.danger ? EMBER : 'rgba(22,20,21,0.6)'} />
                                {it.label}
                            </motion.button>
                        ))}
                    </div>
                    <motion.button
                        {...pressProps('row')} onClick={onClose}
                        style={{
                            width: '100%', minHeight: 54, marginTop: 8, borderRadius: 22, border: 'none', cursor: 'pointer',
                            background: PAPER, color: INK, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-body)',
                        }}
                    >
                        取消
                    </motion.button>
                </motion.div>
            </React.Fragment>
        )}
    </AnimatePresence>,
    document.body,
);

const iconBtn = {
    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0,
};
const countStyle = { fontSize: 14, fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums', lineHeight: 1 };

/**
 * @param {object}   post
 * @param {boolean}  isOwner         自己的貼文才有編輯／刪除
 * @param {boolean}  hideHeader
 * @param {'plain'|'card'} surface   plain＝直接鋪在動態牆上；card＝放在深色 sheet 裡時包一層紙色底
 * @param {(width:number)=>React.ReactNode} renderMedia   媒體區（照片或 DRVN 卡牌），拿到實際寬度
 * @param {React.ReactNode} after    文字下面的附加區（賽段徽章、揪團卡）
 */
export const FeedPostShell = ({
    post, isOwner = false, hideHeader = false, surface = 'plain',
    onKudo, onComment, onShowKudoers, onEdit, onDelete,
    renderMedia, after = null,
}) => {
    const rootRef = useRef(null);
    const mediaRef = useRef(null);
    const capRef = useRef(null);
    const width = useMeasuredWidth(rootRef);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuMode, setMenuMode] = useState(null);   // null | 'report' | 'block'
    const [expanded, setExpanded] = useState(false);
    useModerationVersion();   // 檢舉／封鎖後立刻重畫（藏起來）
    const [clamped, setClamped] = useState(false);

    const name = resolvePostAuthorName(post);
    const avatar = resolvePostAvatar(post, isOwner);
    const date = resolvePostDate(post);
    const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
    // IG 第二行：有地點放地點，沒有就放這次的成果（沒有真實數據就不放）
    const sub = post.location || postSummary(post);
    const hasText = !!(post.title || post.caption);
    const vis = post.visibility && post.visibility !== 'public'
        ? VISIBILITY_OPTIONS.find((v) => v.id === post.visibility)?.label : null;
    const interactive = !!(onKudo || onComment);

    // 內文超過兩行才出現「更多」—— 量實際高度，不用字數猜
    useLayoutEffect(() => {
        const el = capRef.current;
        if (!el || expanded) return;
        setClamped(el.scrollHeight - el.clientHeight > 2);
    }, [post.caption, post.title, expanded, width]);

    const doShare = async () => {
        triggerHaptic('light');
        const r = await sharePost(post, { mediaEl: mediaRef.current, authorName: name });
        if (r === 'copied') toast.success('已複製貼文內容');
        else if (r === 'download') toast.success('已存成圖片');
        else if (r === 'failed') toast.error('這台裝置沒辦法分享');
    };
    const doCopy = async () => {
        try {
            await navigator.clipboard.writeText([post.title, post.caption].filter(Boolean).join('\n'));
            toast.success('已複製內文');
        } catch { toast.error('沒辦法複製'); }
    };

    // 編輯／刪除只給作者自己 —— 以前每一則（包括別人的）都秀這兩個
    // 別人的貼文：檢舉、封鎖作者（App Store 1.2 使用者內容必備）
    const authorId = post.uId || post.user_id || null;
    const snapshot = [post.title, post.caption].filter(Boolean).join('\n');
    const baseItems = (isOwner ? [
        onEdit && { id: 'edit', label: '編輯貼文', Icon: Pencil, run: () => onEdit(post) },
        { id: 'share', label: '分享', Icon: Send, run: doShare },
        onDelete && { id: 'delete', label: '刪除貼文', Icon: Trash2, danger: true, run: () => onDelete(post.id) },
    ] : [
        { id: 'share', label: '分享', Icon: Send, run: doShare },
        hasText && { id: 'copy', label: '複製內文', Icon: Copy, run: doCopy },
        { id: 'report', label: '檢舉貼文', Icon: Flag, danger: true, run: () => { setMenuMode('report'); setMenuOpen(true); } },
        authorId && { id: 'block', label: `封鎖 ${name}`, Icon: Ban, danger: true, run: () => { setMenuMode('block'); setMenuOpen(true); } },
    ]).filter(Boolean);
    const items = menuMode === 'report'
        ? REPORT_REASONS.map(([rid, label]) => ({
            id: rid, label, Icon: Flag,
            run: () => { setMenuMode(null); reportContent({ type: 'post', id: post.id, authorId, reason: rid, snapshot }); },
        }))
        : menuMode === 'block'
            ? [{ id: 'confirm-block', label: `確定封鎖，互相看不到動態與留言`, Icon: Ban, danger: true, run: () => { setMenuMode(null); blockUser(authorId, name); } }]
            : baseItems;

    const media = renderMedia ? renderMedia(width) : null;
    const card = surface === 'card';
    // 檢舉過的貼文、封鎖的人：不顯示
    if (!isOwner && (isHiddenContent(post.id) || isBlockedUser(authorId))) return null;

    return (
        <motion.article
            ref={rootRef}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{
                color: INK, marginBottom: card ? 0 : 28, minWidth: 0,
                ...(card ? { background: PAPER, borderRadius: 24, overflow: 'hidden', paddingTop: 12, paddingBottom: 16 } : {}),
            }}
        >
            {!hideHeader && (
                <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 10px 16px', minWidth: 0 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                        background: 'rgba(22,20,21,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 800, color: INK,
                    }}>
                        {avatar
                            ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (post.init || name[0] || '·')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {name}
                            {tags.length > 0 && (
                                <span style={{ fontWeight: 500, color: 'rgba(22,20,21,0.5)' }}>
                                    {' '}與 {tags[0]}{tags.length > 1 ? ` 等 ${tags.length} 人` : ''}
                                </span>
                            )}
                        </p>
                        {sub && (
                            <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 500, color: 'rgba(22,20,21,0.5)', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                {post.location && <MapPin size={11} strokeWidth={2} style={{ flexShrink: 0 }} />}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{sub}</span>
                            </p>
                        )}
                    </div>
                    {items.length > 0 && (
                        <motion.button
                            {...pressProps('icon')} aria-label="貼文選項" aria-haspopup="menu" aria-expanded={menuOpen}
                            onClick={() => { triggerHaptic('light'); setMenuOpen(true); }}
                            style={iconBtn}
                        >
                            <MoreHorizontal size={20} color="rgba(22,20,21,0.7)" />
                        </motion.button>
                    )}
                </header>
            )}

            {media && <div ref={mediaRef} style={{ width: '100%', overflow: 'hidden' }}>{media}</div>}

            {interactive && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 0' }}>
                    <motion.button
                        {...pressProps('icon')} aria-label={post.myKudo ? '取消讚' : '按讚'} aria-pressed={!!post.myKudo}
                        onClick={() => { if (!onKudo) return; triggerHaptic('light'); onKudo(post.id); }}
                        style={iconBtn}
                    >
                        <Heart size={25} strokeWidth={1.8} color={post.myKudo ? CORAL : INK} fill={post.myKudo ? CORAL : 'none'} />
                    </motion.button>
                    {post.kudos > 0 && (
                        <motion.button
                            {...pressProps('pill')} aria-label={`${post.kudos} 人說讚，查看是誰`}
                            onClick={() => { if (onShowKudoers) { triggerHaptic('light'); onShowKudoers(post.id); } }}
                            style={{ ...iconBtn, width: 'auto', minWidth: 44, marginLeft: -8, justifyContent: 'flex-start', paddingLeft: 2 }}
                        >
                            <span style={countStyle}>{post.kudos}</span>
                        </motion.button>
                    )}
                    <motion.button
                        {...pressProps('icon')} aria-label="留言"
                        onClick={() => { if (!onComment) return; triggerHaptic('light'); onComment(post.id); }}
                        style={{ ...iconBtn, width: 'auto', minWidth: 44, gap: 6, padding: '0 8px' }}
                    >
                        <MessageCircle size={24} strokeWidth={1.8} color={INK} />
                        {post.commentCount > 0 && <span style={countStyle}>{post.commentCount}</span>}
                    </motion.button>
                    <motion.button {...pressProps('icon')} aria-label="分享" onClick={doShare} style={iconBtn}>
                        <Send size={23} strokeWidth={1.8} color={INK} />
                    </motion.button>
                </div>
            )}

            {hasText && (
                <div style={{ padding: interactive ? '2px 16px 0' : '10px 16px 0', minWidth: 0 }}>
                    <p
                        ref={capRef}
                        onClick={() => { if (clamped && !expanded) setExpanded(true); }}
                        style={{
                            margin: 0, fontSize: 14, lineHeight: 1.5, color: 'rgba(22,20,21,0.88)',
                            wordBreak: 'break-word', whiteSpace: 'pre-line',
                            ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
                        }}
                    >
                        <span style={{ fontWeight: 700, color: INK, marginRight: 6 }}>{name}</span>
                        {post.title && <span style={{ fontWeight: 700, color: INK, marginRight: 6 }}>{post.title}</span>}
                        {renderCaption(post.caption, CORAL)}
                    </p>
                    {clamped && !expanded && (
                        <motion.button
                            {...pressProps('pill')} onClick={() => setExpanded(true)}
                            style={{ background: 'none', border: 'none', padding: '4px 0', minHeight: 28, color: 'rgba(22,20,21,0.45)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                        >
                            更多
                        </motion.button>
                    )}
                </div>
            )}

            {after && <div style={{ padding: '10px 16px 0', minWidth: 0 }}>{after}</div>}

            <p style={{ margin: '6px 16px 0', fontSize: 12, color: 'rgba(22,20,21,0.42)' }}>
                {timeAgo(date)}{vis ? ` · ${vis}` : ''}
            </p>

            <PostMenuSheet open={menuOpen} onClose={() => { setMenuOpen(false); setMenuMode(null); }} items={items} />
        </motion.article>
    );
};

export default FeedPostShell;
