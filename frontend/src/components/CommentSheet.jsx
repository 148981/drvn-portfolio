/* ⚠️ 死碼 — 全專案零引用（2026-09 社群稽核）
   ────────────────────────────────────────────────────────────────
   零 import。實際在用的是 SocialFeed/communityShared.jsx 匯出的 CommentSheet。
   保留只是因為稽核當下沒有直接刪檔的權限；確認過沒有其他用途後
   可以整支移除，不影響任何畫面。 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import api from '../api/client';

// ─────────────────────────────────────────────────────────────
// 💬 CommentSheet — 社群留言 UI（接真後端 comments API）
//
// 底部彈出式留言面板：載入留言串 + 留言輸入框。
// GET  /api/activities/{id}/comments  → { comments:[...], count }
// POST /api/activities/{id}/comments  (Form: user_id, user_name, content)
// 跨帳戶持久化到 comments.json。
// ─────────────────────────────────────────────────────────────

const timeAgo = (iso) => {
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return '剛剛';
        if (m < 60) return `${m} 分鐘前`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} 小時前`;
        const d = Math.floor(h / 24);
        return `${d} 天前`;
    } catch { return ''; }
};

const CommentSheet = ({ open, onClose, activityId, currentUserId, currentUserName, onCountChange }) => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const listEndRef = useRef(null);

    const fetchComments = useCallback(async () => {
        if (!activityId) return;
        setLoading(true);
        try {
            const res = await api.get(`/api/activities/${activityId}/comments`);
            setComments(res?.data?.comments || []);
        } catch {
            setComments([]);
        } finally {
            setLoading(false);
        }
    }, [activityId]);

    useEffect(() => {
        if (open) fetchComments();
    }, [open, fetchComments]);

    const handleSend = async () => {
        const content = text.trim();
        if (!content || sending) return;
        setSending(true);
        // 樂觀插入
        const optimistic = {
            comment_id: `tmp_${Date.now()}`,
            user_id: currentUserId,
            user_name: currentUserName || 'You',
            content,
            created_at: new Date().toISOString(),
            _pending: true,
        };
        setComments((prev) => [...prev, optimistic]);
        setText('');
        try {
            const fd = new FormData();
            fd.append('user_id', String(currentUserId || ''));
            fd.append('user_name', String(currentUserName || 'You'));
            fd.append('content', content);
            const res = await api.post(`/api/activities/${activityId}/comments`, fd);
            const saved = res?.data;
            // 用真實回傳替換樂觀項
            setComments((prev) => prev.map((c) => (c.comment_id === optimistic.comment_id ? (saved || { ...optimistic, _pending: false }) : c)));
            onCountChange?.(activityId);
        } catch {
            // 失敗 → 移除樂觀項
            setComments((prev) => prev.filter((c) => c.comment_id !== optimistic.comment_id));
            setText(content); // 還原輸入
        } finally {
            setSending(false);
            setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[10000000] flex items-end justify-center"
                    style={{ background: 'rgba(8,7,9,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                >
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-white rounded-t-[28px] flex flex-col"
                        style={{ maxHeight: '78dvh', minHeight: '46dvh' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/8">
                            <span className="text-[14px] font-black tracking-[0.02em]" style={{ color: '#161415' }}>
                                留言{comments.length > 0 ? ` · ${comments.length}` : ''}
                            </span>
                            <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,20,21,0.06)' }}>
                                <X size={16} strokeWidth={2.4} style={{ color: 'rgba(22,20,21,0.55)' }} />
                            </motion.button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {loading ? (
                                <div className="space-y-3">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="w-8 h-8 rounded-full ti-skeleton shrink-0" />
                                            <div className="flex-1 space-y-1.5">
                                                <div className="h-2.5 w-20 rounded ti-skeleton" />
                                                <div className="h-2.5 w-full rounded ti-skeleton" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : comments.length === 0 ? (
                                <div className="text-center py-10" style={{ color: 'rgba(22,20,21,0.4)' }}>
                                    <p className="text-[13px] font-bold">還沒有留言</p>
                                    <p className="text-[11px] mt-1">當第一個留言的人吧！</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {comments.map((c) => {
                                        const isMine = c.user_id === currentUserId;
                                        return (
                                            <div key={c.comment_id} className="flex gap-3" style={{ opacity: c._pending ? 0.55 : 1 }}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[12px] font-black"
                                                    style={{ background: isMine ? '#F95C4B' : '#161415' }}>
                                                    {(c.user_name || 'A')[0]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-[12px] font-black truncate" style={{ color: '#161415' }}>
                                                            {isMine ? '你' : (c.user_name || 'Athlete')}
                                                        </span>
                                                        <span className="text-[11px] font-bold shrink-0" style={{ color: 'rgba(22,20,21,0.35)' }}>
                                                            {timeAgo(c.created_at)}
                                                        </span>
                                                    </div>
                                                    <p className="text-[13px] leading-snug mt-0.5 break-words" style={{ color: 'rgba(22,20,21,0.78)' }}>
                                                        {c.content}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={listEndRef} />
                                </div>
                            )}
                        </div>

                        {/* Composer */}
                        <div className="px-4 py-3 border-t border-black/8 flex items-center gap-2.5"
                            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                            <input
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                                placeholder="留個言…"
                                maxLength={300}
                                className="flex-1 h-10 px-4 rounded-full text-[13px] outline-none"
                                style={{ background: 'rgba(22,20,21,0.05)', color: '#161415' }}
                            />
                            <motion.button {...pressProps('icon')}
 onClick={handleSend}
 disabled={!text.trim() || sending}
 className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
 style={{ background: text.trim() ? '#F95C4B' : 'rgba(22,20,21,0.12)' }}
 aria-label="送出留言"
 >
                                <Send size={16} strokeWidth={2.4} style={{ color: text.trim() ? '#FFFFFF' : 'rgba(22,20,21,0.4)' }} />
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CommentSheet;
