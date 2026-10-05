/**
 * ModerationMenu — 「⋯」→ 檢舉／封鎖（App Store 1.2）
 * ─────────────────────────────────────────────────────────────
 * 社群牆（FeedPost）有自己的選單；好友動態、留言、個人資料預覽以前沒有任何
 * 檢舉或封鎖入口。這個元件給那些地方用同一套行為（utils/moderation）。
 *
 * props:
 *   type       'post' | 'comment' | 'user'
 *   targetId   被檢舉內容的 id（type='user' 時就是對方 user_id）
 *   authorId   內容作者（封鎖對象）
 *   authorName 顯示用
 *   snapshot   檢舉當下的內文（被刪改也看得到）
 *   label      有給就渲染成文字按鈕，否則是「⋯」圖示
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Flag, Ban, X } from 'lucide-react';
import { pressProps } from '../../utils/nutritionMotion';
import { REPORT_REASONS, reportContent, blockUser, unblockUser, isBlockedUser } from '../../utils/moderation';
import { getUserId } from '../../utils/auth';

const INK = '#161415';
const PAPER = '#F6F4F1';
const MUTED = 'rgba(22,20,21,0.55)';

export default function ModerationMenu({ type = 'post', targetId, authorId, authorName = '', snapshot = '', label = null, color = MUTED, onDone }) {
    const [mode, setMode] = useState(null);   // null | 'menu' | 'report' | 'block'
    const [busy, setBusy] = useState(false);
    if (!authorId || String(authorId) === String(getUserId())) return null;
    const blocked = isBlockedUser(authorId);
    const close = () => { if (!busy) setMode(null); };

    const doReport = async (reason) => {
        if (busy) return;
        setBusy(true);
        const ok = await reportContent({ type, id: targetId || authorId, authorId, reason, snapshot });
        setBusy(false);
        setMode(null);
        if (ok) onDone?.('report');
    };
    const doBlock = async () => {
        if (busy) return;
        setBusy(true);
        const ok = blocked ? await unblockUser(authorId, authorName) : await blockUser(authorId, authorName);
        setBusy(false);
        setMode(null);
        if (ok) onDone?.(blocked ? 'unblock' : 'block');
    };

    const row = (key, text, onClick, danger = false, Icon = null) => (
        <motion.button key={key} {...pressProps('row')} type="button" disabled={busy} onClick={onClick}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 4px', border: 'none', borderTop: '1px solid rgba(22,20,21,0.07)', background: 'transparent', textAlign: 'left', fontSize: 15, fontWeight: 700, color: danger ? '#D94030' : INK, opacity: busy ? 0.5 : 1 }}>
            {Icon && <Icon size={17} color={danger ? '#D94030' : INK} />}
            {text}
        </motion.button>
    );

    const title = mode === 'report' ? '為什麼要檢舉？' : mode === 'block' ? (blocked ? `解除封鎖 ${authorName || '這位使用者'}？` : `封鎖 ${authorName || '這位使用者'}？`) : (authorName || '更多');
    const sheet = (
        <AnimatePresence>
            {mode && (
                <motion.div key="mod" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483100, background: 'rgba(22,20,21,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        style={{ width: '100%', maxWidth: 440, background: PAPER, borderRadius: '28px 28px 0 0', padding: '16px 20px max(20px, env(safe-area-inset-bottom))' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK }}>{title}</h3>
                            <motion.button {...pressProps('icon')} type="button" aria-label="關閉" onClick={close}
                                style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} color={INK} />
                            </motion.button>
                        </div>
                        {mode === 'menu' && (
                            <>
                                {row('report', type === 'user' ? '檢舉這位使用者' : '檢舉', () => setMode('report'), false, Flag)}
                                {row('block', blocked ? `解除封鎖 ${authorName}` : `封鎖 ${authorName}`, () => setMode('block'), !blocked, Ban)}
                            </>
                        )}
                        {mode === 'report' && REPORT_REASONS.map(([id, text]) => row(id, text, () => doReport(id)))}
                        {mode === 'block' && (
                            <>
                                <p style={{ margin: '0 0 6px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                                    {blocked
                                        ? '解除後你們會再看到彼此的動態與留言，不會自動恢復好友或追蹤。'
                                        : '封鎖後你們互相看不到動態與留言，也會解除好友與追蹤。可在「我的 › 封鎖名單」解除。'}
                                </p>
                                {row('confirm', blocked ? '解除封鎖' : '確定封鎖', doBlock, !blocked, Ban)}
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <>
            {label ? (
                <motion.button {...pressProps('row')} type="button" onClick={(e) => { e.stopPropagation(); setMode('menu'); }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color }}>
                    {label}
                </motion.button>
            ) : (
                <motion.button {...pressProps('icon')} type="button" aria-label="檢舉或封鎖" onClick={(e) => { e.stopPropagation(); setMode('menu'); }}
                    style={{ width: 36, height: 36, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <MoreHorizontal size={18} color={color} />
                </motion.button>
            )}
            {typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet}
        </>
    );
}
