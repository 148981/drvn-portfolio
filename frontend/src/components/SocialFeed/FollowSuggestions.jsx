import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { X, Search, ChevronDown, Check, UserPlus, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../../utils/haptics';
import {
    searchUsers, getSuggestions,
    follow as followUserApi, unfollow as unfollowUserApi,
    RELATION, relationIn,
} from '../../utils/followGraph';
import ProfilePreviewSheet from '../ProfilePreviewSheet';

const triggerHaptic = (style = 'medium') => haptic(style);

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FollowSuggestions — 「找人追蹤」面板（跑步 × 健身共用）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 這面板解決的問題：
 *   之前 app 裡「根本沒有地方可以主動追蹤別人」——只有一排推薦卡，
 *   推薦名單裡沒有的人就完全找不到。
 *
 * 現在有三層：
 *   1. 搜尋列   輸入名稱 / user id / 好友碼(Name#1234) 都能找到人
 *   2. 推薦區   後端 suggestions-v2 演算法（共同好友＞同運動＞近期活躍＞同城市）
 *               並且會顯示「為什麼推薦他」，不是黑箱
 *   3. 展開     預設收合成一排橫向卡，展開後是完整直式清單
 *
 * sport prop：跑步社群傳 'run'、健身社群傳 'strength'。
 *   → 只影響推薦排序，追蹤關係本身兩邊完全同步（同一張 followGraph）。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const CORAL = '#F95C4B';

/* ─── 單列使用者（展開清單／搜尋結果共用）─── */
const UserRow = ({ user, relation, busy, onFollow, onUnfollow, onPeek, colors }) => {
    const isFollowing = relation === RELATION.FOLLOWING || relation === RELATION.FRIEND;
    const C = colors;

    // 關係徽章：好友 / 追蹤你（＝我的粉絲，追回去很自然）
    const badge = relation === RELATION.FRIEND ? '好友'
        : (user.follows_you || relation === RELATION.FAN) ? '追蹤你' : null;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 py-3"
            style={{ borderBottom: '1px solid rgba(22,20,21,0.06)' }}
        >
            <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                role="button" aria-label={`看 ${user.name || '這位使用者'} 的個人資料`}
                onClick={() => { triggerHaptic('light'); onPeek && onPeek(user); }}
                style={{ background: 'rgba(22,20,21,0.06)', cursor: 'pointer' }}>
                {user.avatar && (String(user.avatar).startsWith('data:') || String(user.avatar).startsWith('http') || String(user.avatar).startsWith('/'))
                    ? <img loading="lazy" decoding="async" src={user.avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[16px] font-black" style={{ color: C.text }}>{(user.name || '?').slice(0, 1)}</span>}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <p className="text-[14px] font-bold truncate" style={{ color: C.text }}>{user.name}</p>
                    {user.discriminator && (
                        <span className="text-[11px] font-medium flex-shrink-0" style={{ color: C.text, opacity: 0.3 }}>
                            #{user.discriminator}
                        </span>
                    )}
                    {badge && (
                        <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: 'rgba(249,92,75,0.10)', color: CORAL }}>{badge}</span>
                    )}
                </div>
                {/* 誠實：只顯示演算法真的成立的理由，沒有就留空，不硬掰 */}
                {(user.reason || user.bio) && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: C.text, opacity: 0.42 }}>
                        {user.reason || user.bio}
                    </p>
                )}
            </div>

            <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic(isFollowing ? 'light' : 'medium'); isFollowing ? onUnfollow(user.user_id || user.id) : onFollow(user.user_id || user.id); }}
 disabled={busy}
 className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-black flex items-center gap-1.5"
 style={{
 background: isFollowing ? 'rgba(22,20,21,0.06)' : CORAL,
 color: isFollowing ? C.text : '#FFFFFF',
 border: 'none',
 opacity: busy ? 0.5 : 1,
 minWidth: 84,
 justifyContent: 'center',
 }}
 >
                {busy ? <Loader size={12} className="animate-spin" />
                    : isFollowing ? <><Check size={12} strokeWidth={3} />追蹤中</>
                        : <><UserPlus size={12} strokeWidth={2.5} />追蹤</>}
            </motion.button>
        </motion.div>
    );
};

/* ─── 橫向推薦卡（收合狀態）─── */
const UserPostcard = ({ user, isFollowed, busy, onFollow, onUnfollow, onPeek, colors }) => {
    const [particles, setParticles] = useState([]);
    const C = colors;

    const handleToggle = () => {
        const id = user.user_id || user.id;
        if (isFollowed) { onUnfollow(id); return; }

        triggerHaptic('medium');
        // ✨ 追蹤成功的 coral 粒子爆發 — 讓「按下去」有實體的回饋
        const burstCount = 16;
        setParticles(Array.from({ length: burstCount }).map((_, i) => {
            const angle = (i * 360 / burstCount) + (Math.random() * 16 - 8);
            const distance = 32 + Math.random() * 40;
            const pool = [CORAL, '#D4A853', '#FFFFFF'];
            return {
                id: Math.random(),
                x: Math.cos(angle * Math.PI / 180) * distance,
                y: Math.sin(angle * Math.PI / 180) * distance,
                size: 3 + Math.random() * 4,
                color: pool[Math.floor(Math.random() * pool.length)],
            };
        }));
        setTimeout(() => setParticles([]), 700);
        onFollow(id);
    };

    return (
        <div className="flex-shrink-0 w-[148px] rounded-[18px] relative p-3 flex flex-col" style={{
            background: 'linear-gradient(#E8E9E6, #E8E9E6) padding-box, linear-gradient(135deg, rgba(210,212,215,1) 0%, rgba(150,155,160,0.1) 45%, rgba(220,225,230,0.9) 100%) border-box',
            border: '1px solid transparent',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.6)',
        }}>
            <div className="w-full aspect-square rounded-full overflow-hidden bg-black/5 relative shadow-inner"
                role="button" aria-label={`看 ${user.name || '這位使用者'} 的個人資料`}
                onClick={() => { triggerHaptic('light'); onPeek && onPeek(user); }}
                style={{ cursor: 'pointer' }}>
                {user.avatar && (String(user.avatar).startsWith('data:') || String(user.avatar).startsWith('http') || String(user.avatar).startsWith('/')) ? (
                    <img loading="lazy" decoding="async" src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                    <span className="w-full h-full flex items-center justify-center text-3xl font-bold" style={{ color: '#161415' }}>
                        {(user.name || 'U').slice(0, 1)}
                    </span>
                )}
                {user.follows_you && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-black tracking-wider shadow-sm"
                        style={{ background: CORAL, color: 'white' }}>追蹤你</div>
                )}
            </div>

            <div className="mt-4 flex flex-col flex-1 justify-between text-left">
                <div>
                    <h4 className="text-[15px] font-black leading-[1.1] tracking-tight truncate" style={{ color: C.text }}>
                        {user.name}
                    </h4>
                    <p className="text-[11px] mt-1.5 leading-snug font-medium line-clamp-2" style={{ color: C.text, opacity: 0.4 }}>
                        {user.reason || user.bio || ''}
                    </p>
                </div>

                <div className="relative mt-5">
                    <AnimatePresence>
                        {particles.map(p => (
                            <motion.div
                                key={p.id}
                                initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                                animate={{ x: p.x, y: p.y, scale: 0.2, opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.55, ease: 'easeOut' }}
                                style={{
                                    position: 'absolute', left: '20%', top: '50%',
                                    width: p.size, height: p.size, borderRadius: '50%',
                                    background: p.color, pointerEvents: 'none', zIndex: 20,
                                }}
                            />
                        ))}
                    </AnimatePresence>

                    <motion.button {...pressProps('pill')}
 onClick={handleToggle}
 disabled={busy}
 className="px-5 py-2 rounded-full text-[11px] font-black cursor-pointer inline-flex shadow-sm"
 style={{
 background: isFollowed ? 'rgba(0,0,0,0.06)' : CORAL,
 color: isFollowed ? C.text : '#FFFFFF',
 border: 'none',
 opacity: busy ? 0.5 : 1,
 }}
 >
                        {isFollowed ? '追蹤中' : '追蹤'}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

/**
 * @param {string}   userId
 * @param {string[]} following        目前追蹤中的 id 清單（由 useFollowing 提供）
 * @param {function} onFollowChange   追蹤狀態變動時回呼（傳入最新 following 陣列）
 * @param {object}   colors
 * @param {'run'|'strength'|null} sport  推薦排序用的運動別；關係本身不分家
 * @param {object}   graph            完整關係圖（用來顯示好友/粉絲徽章）
 */
const FollowSuggestions = ({ userId, following = [], onFollowChange, colors, sport = null, graph = null }) => {
    const C = colors || { text: '#161415', sub: 'rgba(22,20,21,0.6)', highlight: CORAL };

    const [dismissed, setDismissed] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSug, setLoadingSug] = useState(true);

    // 搜尋
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);   // null = 尚未搜尋
    const [searching, setSearching] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [peekUser, setPeekUser] = useState(null);   // 點頭像 → 個人資料預覽
    const debounceRef = useRef(null);

    /* ── 推薦（後端 suggestions-v2；失敗回退舊端點；再失敗就空，不放假人）── */
    useEffect(() => {
        let alive = true;
        setLoadingSug(true);
        (async () => {
            const list = await getSuggestions(userId, { sport, limit: 16 });
            if (!alive) return;
            setSuggestions((list || []).filter(u => u.user_id !== userId));
            setLoadingSug(false);
        })();
        return () => { alive = false; };
    }, [userId, sport]);

    /* ── 搜尋：300ms debounce，避免每個字都打一次後端 ── */
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = query.trim();
        if (!q) { setResults(null); setSearching(false); return; }

        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            const r = await searchUsers(q, userId);
            setResults(r);
            setSearching(false);
        }, 300);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, userId]);

    const doFollow = useCallback(async (targetId) => {
        setBusyId(targetId);
        const g = await followUserApi(targetId, userId);
        setBusyId(null);
        onFollowChange && onFollowChange(g?.following || [...following, targetId]);
    }, [userId, following, onFollowChange]);

    const doUnfollow = useCallback(async (targetId) => {
        setBusyId(targetId);
        const g = await unfollowUserApi(targetId, userId);
        setBusyId(null);
        onFollowChange && onFollowChange(g?.following || following.filter(id => id !== targetId));
    }, [userId, following, onFollowChange]);

    const relationOf = (uid) => (graph ? relationIn(graph, uid, userId)
        : (following.includes(uid) ? RELATION.FOLLOWING : RELATION.NONE));

    if (dismissed) return null;

    const searchMode = !!query.trim();
    const listToShow = searchMode ? (results || []) : suggestions;

    return (
        <div className="mx-4 mb-6 rounded-[28px] p-5 relative"
            style={{ background: 'rgba(22,20,21,0.02)', border: '1px solid rgba(22,20,21,0.05)' }}>

            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    {/* 原本是「找人追蹤」小標 ＋「People to Follow」主標 —— 同義的東西疊了兩層。
                        收成單一中文主標：一個焦點、不重複。 */}
                    <p className="text-[15px] font-black" style={{ color: C.text }}>找人追蹤</p>
                </div>
                <motion.button {...pressProps('icon')}
 onClick={() => setDismissed(true)}
 aria-label="關閉推薦"
 className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center transition-opacity hover:opacity-70"
 >
                    <X size={14} color={C.text} />
                </motion.button>
            </div>

            {/* ── 搜尋列 — 只吃完整好友碼（名稱#四碼）──
                    🔴 資安稽核 C-1：原本後端用 `查詢字串 in user_id` 做子字串比對，
                       且不需登入 —— 搜一個常見字元就能撈出 20 組真實 user_id，
                       是越權攻擊鏈的第一步。已收斂為精準比對，模糊搜尋不再支援。 */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full mb-3"
                style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(22,20,21,0.08)' }}>
                <Search size={15} color={C.text} opacity={0.35} strokeWidth={2.2} />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="輸入好友碼"
                    aria-label="搜尋使用者"
                    className="flex-1 bg-transparent border-none outline-none text-[13px] font-medium"
                    style={{ color: C.text, fontFamily: "'Noto Sans TC', sans-serif" }}
                />
                {searching && <Loader size={13} className="animate-spin" color={CORAL} />}
                {!!query && !searching && (
                    <motion.button {...pressProps('icon')} onClick={() => setQuery('')} aria-label="清除搜尋"
 className="w-5 h-5 rounded-full bg-black/8 flex items-center justify-center">
                        <X size={10} color={C.text} />
                    </motion.button>
                )}
            </div>

            {/* ── 搜尋結果 ── */}
            {searchMode && (
                <div>
                    {searching && (results === null) ? (
                        <p className="text-center py-6 text-[12px] font-bold" style={{ color: C.text, opacity: 0.35 }}>搜尋中…</p>
                    ) : listToShow.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-[13px] font-black" style={{ color: C.text, opacity: 0.5 }}>找不到「{query}」</p>
                            <p className="text-[11px] mt-1.5" style={{ color: C.text, opacity: 0.35 }}>
                                試試對方的完整好友碼，例如 Mia#1234
                            </p>
                        </div>
                    ) : (
                        <div>
                            {listToShow.map(u => (
                                <UserRow
                                    key={u.user_id}
                                    user={u}
                                    relation={relationOf(u.user_id)}
                                    busy={busyId === u.user_id}
                                    onFollow={doFollow}
                                    onUnfollow={doUnfollow}
                                    onPeek={setPeekUser}
                                    colors={C}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── 推薦區（非搜尋狀態）── */}
            {!searchMode && (
                <>
                    {loadingSug ? (
                        <div className="flex gap-3 overflow-hidden pb-1">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="flex-shrink-0 w-[148px] h-[236px] rounded-[18px] ti-skeleton"
                                    style={{ background: 'rgba(22,20,21,0.04)' }} />
                            ))}
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-[13px] font-black" style={{ color: C.text, opacity: 0.5 }}>目前沒有推薦</p>
                            <p className="text-[11px] mt-1.5" style={{ color: C.text, opacity: 0.35 }}>
                                用上面的搜尋列，直接找你認識的人。
                            </p>
                        </div>
                    ) : expanded ? (
                        /* 展開：完整直式清單 */
                        <motion.div layout>
                            {suggestions.map(u => (
                                <UserRow
                                    key={u.user_id}
                                    user={u}
                                    relation={relationOf(u.user_id)}
                                    busy={busyId === u.user_id}
                                    onFollow={doFollow}
                                    onUnfollow={doUnfollow}
                                    onPeek={setPeekUser}
                                    colors={C}
                                />
                            ))}
                        </motion.div>
                    ) : (
                        /* 收合：橫向卡片 */
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                            {suggestions.slice(0, 6).map(u => (
                                <UserPostcard
                                    key={u.user_id}
                                    user={u}
                                    colors={C}
                                    busy={busyId === u.user_id}
                                    isFollowed={following.includes(u.user_id)}
                                    onFollow={doFollow}
                                    onUnfollow={doUnfollow}
                                    onPeek={setPeekUser}
                                />
                            ))}
                        </div>
                    )}

                    {/* 展開／收合 */}
                    {suggestions.length > 3 && (
                        <motion.button {...pressProps('row')}
 onClick={() => { setExpanded(e => !e); triggerHaptic('light'); }}
 className="w-full mt-3 py-2.5 rounded-full flex items-center justify-center gap-1.5 text-[12px] font-black "
 style={{ background: 'rgba(22,20,21,0.04)', color: C.text }}
 >
                            {expanded ? '收合' : `展開全部 ${suggestions.length} 位`}
                            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex' }}>
                                <ChevronDown size={14} strokeWidth={2.5} />
                            </motion.span>
                        </motion.button>
                    )}
                </>
            )}
            <ProfilePreviewSheet
                open={!!peekUser}
                userId={peekUser?.user_id || peekUser?.id}
                seed={peekUser ? { name: peekUser.name, discriminator: peekUser.discriminator, avatar: peekUser.avatar, bio: peekUser.bio } : null}
                onClose={() => setPeekUser(null)}
            />
        </div>
    );
};

export default FollowSuggestions;
