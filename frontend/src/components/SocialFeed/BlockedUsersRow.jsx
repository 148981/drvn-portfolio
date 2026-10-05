/**
 * BlockedUsersRow — 「我的」分頁裡的封鎖名單入口 + 名單 sheet
 * ─────────────────────────────────────────────────────────────
 * App Store 1.2：使用者要能封鎖，也要找得到自己封鎖了誰、能解除。
 * 以前 utils/moderation 有 unblockUser，但整個 App 沒有任何地方呼叫 ——
 * 封鎖之後就再也解不開（被封鎖的人連動態都看不到，沒有入口可以點回去）。
 *
 * 資料：GET /api/moderation/blocks（含名字）＋本機還沒同步上去的封鎖。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, X, ChevronRight } from 'lucide-react';
import { pressProps } from '../../utils/nutritionMotion';
import { fetchBlockedUsers, unblockUser, useModerationVersion } from '../../utils/moderation';
import { getUserId } from '../../utils/auth';

const INK = '#161415';
const PAPER = '#F6F4F1';
const MUTED = 'rgba(22,20,21,0.55)';

function readLocalBlocked() {
    try {
        const v = JSON.parse(localStorage.getItem(`drvn_moderation_${getUserId() || 'guest'}`) || '{}') || {};
        return Array.isArray(v.blocked) ? v.blocked.map(String) : [];
    } catch { return []; }
}

export default function BlockedUsersRow() {
    const [open, setOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);
    useModerationVersion();

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const server = await fetchBlockedUsers();
            const ids = new Set(server.map((u) => String(u.user_id)));
            // 離線時封鎖、還沒同步的：也列出來，才解得開
            const localOnly = readLocalBlocked().filter((id) => !ids.has(id)).map((user_id) => ({ user_id, name: '' }));
            setUsers([...server, ...localOnly]);
        } catch {
            setError('封鎖名單載入失敗');
            setUsers(readLocalBlocked().map((user_id) => ({ user_id, name: '' })));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (open) load(); }, [open, load]);

    const handleUnblock = async (u) => {
        if (busyId) return;
        setBusyId(u.user_id);
        const ok = await unblockUser(u.user_id, u.name || '');
        setBusyId(null);
        if (ok) setUsers((list) => list.filter((x) => x.user_id !== u.user_id));
    };

    const sheet = (
        <AnimatePresence>
            {open && (
                <motion.div key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 100300, background: 'rgba(22,20,21,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        style={{ width: '100%', maxWidth: 440, background: PAPER, borderRadius: '28px 28px 0 0', maxHeight: '75dvh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 10px' }}>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK }}>封鎖名單</h3>
                            <motion.button {...pressProps('icon')} type="button" aria-label="關閉封鎖名單" onClick={() => setOpen(false)}
                                style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} color={INK} />
                            </motion.button>
                        </div>
                        <p style={{ margin: '0 20px 10px', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                            封鎖的人看不到你的動態與留言，你也看不到他的。解除後不會自動恢復好友或追蹤。
                        </p>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px max(20px, env(safe-area-inset-bottom))' }}>
                            {loading ? (
                                <p style={{ fontSize: 13, color: MUTED, padding: '20px 0', textAlign: 'center' }}>載入中…</p>
                            ) : (
                                <>
                                    {error && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0' }}>
                                            <span style={{ fontSize: 13, color: '#D94030', fontWeight: 700 }}>{error}</span>
                                            <motion.button {...pressProps('row')} type="button" onClick={load}
                                                style={{ border: 'none', background: 'rgba(22,20,21,0.06)', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 800, color: INK }}>重試</motion.button>
                                        </div>
                                    )}
                                    {users.length === 0 && !error && (
                                        <p style={{ fontSize: 14, fontWeight: 600, color: MUTED, padding: '24px 0', textAlign: 'center' }}>沒有封鎖任何人</p>
                                    )}
                                    {users.map((u) => (
                                        <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid rgba(22,20,21,0.07)' }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(22,20,21,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: INK, flexShrink: 0 }}>
                                                {(u.name || '?').charAt(0)}
                                            </div>
                                            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {u.name || '已封鎖的使用者'}
                                            </span>
                                            <motion.button {...pressProps('row')} type="button" disabled={busyId === u.user_id}
                                                onClick={() => handleUnblock(u)}
                                                style={{ border: '1px solid rgba(22,20,21,0.18)', background: 'transparent', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 800, color: INK, opacity: busyId === u.user_id ? 0.5 : 1 }}>
                                                {busyId === u.user_id ? '處理中…' : '解除封鎖'}
                                            </motion.button>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const count = readLocalBlocked().length;
    return (
        <>
            <motion.button {...pressProps('card')} type="button" onClick={() => setOpen(true)}
                aria-label="封鎖名單"
                className="w-full flex items-center justify-between mb-4"
                style={{ padding: '14px 16px', borderRadius: 18, border: '1px solid rgba(207,198,184,0.7)', background: 'rgba(255,255,255,0.55)', cursor: 'pointer', textAlign: 'left' }}>
                <span className="flex items-center gap-3">
                    <Ban size={18} color={MUTED} />
                    <span>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: INK }}>封鎖名單</span>
                        <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>
                            {count > 0 ? `已封鎖 ${count} 人，可在這裡解除` : '查看或解除你封鎖的人'}
                        </span>
                    </span>
                </span>
                <ChevronRight size={16} color={MUTED} />
            </motion.button>
            {typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet}
        </>
    );
}
