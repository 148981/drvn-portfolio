/**
 * ══════════════════════════════════════════════════════════════════════════
 * ClubDiscussion — 社團討論（不只是打字）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 使用者：「討論這邊要加一些互動功能，不然只能文字討論」。
 *
 * 三種訊息，同一條時間軸：
 *   text    一般訊息（可回覆成一串、可 @提及成員）
 *   photo   照片 —— 練完傳一張，比打三行字快
 *   poll    投票 —— 「這週六幾點跑？」直接在討論串裡選，即時看到票數
 *   meetup  揪團 —— 「明早 7 點河濱」按一下加入，看得到誰要來
 *
 * ⚠️ 照片一定要先縮圖再存：club.chat 是存在本機的（localStorage 有 ~5MB 上限），
 *    直接塞原圖的 base64 一張就爆，而且爆掉的是整個社團資料不是只有那張圖。
 *    所以固定壓到長邊 1280、JPEG 0.7，並在寫入前擋掉異常大的結果。
 *
 * 每一則都能按「快速反應」（讚 / 加油 / 我也要），一次點擊就有回饋，
 * 不用每次都打字。所有狀態存回 club 物件（onUpdate），跟現有聊天同一份資料。
 *
 * 無 emoji：頭像用姓名首字，反應用 lucide 線性圖示（DRVN 介面鐵律）。
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ThumbsUp, Flame, Users, BarChart3, CalendarPlus, X, Plus, Check, ImagePlus, CornerDownRight, AtSign } from 'lucide-react';
import apiClient from '../../api/client';
import { pressProps } from '../../utils/nutritionMotion';
import { toast } from '../../utils/toast';
import { markBlockedLocally } from '../../utils/moderation';

const C = { paper: '#F6F4F1', ink: '#161415', pebble: '#CFC6B8', stone: '#E4DED2', coral: '#F95C4B', sub: '#8A7E73' };

const initialOf = (n) => String(n || '?').trim().charAt(0).toUpperCase();

/** 上限：單張壓完之後的 base64 位元組數（約 900KB，超過就請使用者換一張）。 */
const MAX_PHOTO_BYTES = 900 * 1024;

/** 檔案 → 縮圖後的 data URL。長邊上限 1280、JPEG 0.7。 */
const shrinkImage = (file, maxSide = 1280, quality = 0.7) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀不到這個檔案'));
    reader.onload = () => {
        const img = new window.Image();
        img.onerror = () => reject(new Error('這不是能顯示的圖片'));
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});
const nowLabel = () => new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * 把訊息文字裡的 @名字 標成 coral。
 * 比對真實成員名單，避免把一般的 @ 當成提及（例如貼網址、email）。
 */
const renderWithMentions = (text, names) => {
    const str = String(text ?? '');
    if (!str.includes('@') || !names.length) return str;
    // 長名字優先，避免「@小明」把「@小明家」切錯
    const sorted = [...names].sort((a, b) => b.length - a.length);
    const out = [];
    let i = 0, key = 0;
    while (i < str.length) {
        if (str[i] === '@') {
            const hit = sorted.find((n) => n && str.startsWith(n, i + 1));
            if (hit) {
                out.push(<span key={key++} style={{ color: C.coral, fontWeight: 800 }}>@{hit}</span>);
                i += hit.length + 1;
                continue;
            }
        }
        const next = str.indexOf('@', i + 1);
        const end = next === -1 ? str.length : next;
        out.push(str.slice(i, end));
        i = end;
    }
    return out;
};

/** 快速反應的定義（無 emoji，全 SVG）。 */
const REACTIONS = [
    { key: 'like', Icon: ThumbsUp, label: '讚' },
    { key: 'fire', Icon: Flame, label: '加油' },
    { key: 'join', Icon: Users, label: '我也要' },
];

// ── 反應列 ────────────────────────────────────────────────────────────────
const ReactionBar = ({ msg, userId, onToggle }) => {
    const reactions = msg.reactions || {};
    return (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {REACTIONS.map(({ key, Icon, label }) => {
                const list = Array.isArray(reactions[key]) ? reactions[key] : [];
                const mine = list.includes(userId);
                const count = list.length;
                return (
                    <motion.button
                        {...pressProps('pill')}
                        key={key}
                        onClick={() => onToggle(msg.id, key)}
                        aria-pressed={mine}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                            background: mine ? 'rgba(249,92,75,0.10)' : 'rgba(22,20,21,0.04)',
                            border: `1px solid ${mine ? 'rgba(249,92,75,0.35)' : 'rgba(22,20,21,0.08)'}`,
                            color: mine ? C.coral : 'rgba(22,20,21,0.55)',
                        }}
                    >
                        <Icon size={13} strokeWidth={2.2} color={mine ? C.coral : 'rgba(22,20,21,0.5)'} />
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                        {count > 0 && (
                            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800 }}>{count}</span>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
};

// ── 投票卡 ────────────────────────────────────────────────────────────────
const PollCard = ({ msg, userId, onVote }) => {
    const options = msg.options || [];
    const votes = msg.votes || {};                       // { optionIndex: [userId] }
    const total = Object.values(votes).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
    const myVote = Object.entries(votes).find(([, arr]) => Array.isArray(arr) && arr.includes(userId))?.[0];

    return (
        <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <BarChart3 size={13} color={C.coral} strokeWidth={2.4} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: C.coral }}>投票</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: '0 0 12px', lineHeight: 1.45 }}>{msg.text}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {options.map((opt, idx) => {
                    const list = Array.isArray(votes[idx]) ? votes[idx] : [];
                    const pct = total > 0 ? Math.round((list.length / total) * 100) : 0;
                    const mine = String(myVote) === String(idx);
                    return (
                        <motion.button
                            {...pressProps('row')}
                            key={idx}
                            onClick={() => onVote(msg.id, idx)}
                            style={{
                                position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
                                padding: '11px 13px', borderRadius: 12, overflow: 'hidden',
                                background: C.paper,
                                border: `1px solid ${mine ? 'rgba(249,92,75,0.45)' : 'rgba(22,20,21,0.10)'}`,
                            }}
                        >
                            {/* 票數長條當底 */}
                            <span aria-hidden style={{
                                position: 'absolute', inset: 0, width: `${pct}%`,
                                background: mine ? 'rgba(249,92,75,0.12)' : 'rgba(22,20,21,0.05)',
                                transition: 'width .35s cubic-bezier(0.16,1,0.3,1)',
                            }} />
                            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {mine && <Check size={14} color={C.coral} strokeWidth={3} />}
                                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.ink }}>{opt}</span>
                                {total > 0 && (
                                    <span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>
                                        {list.length} 票 · {pct}%
                                    </span>
                                )}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.4)', margin: '9px 0 0' }}>
                {total > 0 ? `${total} 人已投票` : '還沒有人投票 — 當第一個'}
            </p>
        </div>
    );
};

// ── 揪團卡 ────────────────────────────────────────────────────────────────
const MeetupCard = ({ msg, userId, onJoin }) => {
    const joined = Array.isArray(msg.joined) ? msg.joined : [];
    const mine = joined.some((j) => j.userId === userId);
    return (
        <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <CalendarPlus size={13} color={C.coral} strokeWidth={2.4} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: C.coral }}>揪團</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: '0 0 4px', lineHeight: 1.45 }}>{msg.text}</p>
            {msg.when && (
                <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.55)', margin: '0 0 12px' }}>{msg.when}</p>
            )}
            <motion.button
                {...pressProps('cta')}
                onClick={() => onJoin(msg.id)}
                style={{
                    width: '100%', minHeight: 44, borderRadius: 999, cursor: 'pointer', border: 'none',
                    background: mine ? 'rgba(22,20,21,0.06)' : C.ink,
                    color: mine ? C.ink : C.paper,
                    fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
                }}
            >
                {mine ? '已加入 — 點一下取消' : '我要參加'}
            </motion.button>
            {joined.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>
                        {joined.length} 人要來
                    </span>
                    <span style={{ fontSize: 12.5, color: 'rgba(22,20,21,0.45)' }}>
                        {joined.slice(0, 3).map((j) => j.name).join('、')}{joined.length > 3 ? ` 等 ${joined.length} 人` : ''}
                    </span>
                </div>
            )}
        </div>
    );
};

// ── 建立投票 / 揪團的小面板 ───────────────────────────────────────────────
const Composer = ({ mode, onCancel, onSubmit }) => {
    const [text, setText] = useState('');
    const [when, setWhen] = useState('');
    const [options, setOptions] = useState(['', '']);
    const isPoll = mode === 'poll';
    const valid = isPoll
        ? text.trim() && options.filter((o) => o.trim()).length >= 2
        : text.trim();

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            style={{ padding: 16, borderRadius: 18, background: C.paper, border: `1px solid ${C.pebble}`, marginBottom: 12 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {isPoll ? <BarChart3 size={15} color={C.coral} strokeWidth={2.4} /> : <CalendarPlus size={15} color={C.coral} strokeWidth={2.4} />}
                <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{isPoll ? '發起投票' : '揪團一起練'}</span>
                <motion.button {...pressProps('icon')} onClick={onCancel} aria-label="取消"
                    style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={15} color={C.ink} />
                </motion.button>
            </div>

            <input
                value={text} onChange={(e) => setText(e.target.value)}
                placeholder={isPoll ? '想問大家什麼？' : '要練什麼？例如：河濱 10K 輕鬆跑'}
                style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: `1px solid ${C.pebble}`, background: '#fff', fontSize: 14, color: C.ink, outline: 'none', marginBottom: 10 }}
            />

            {isPoll ? (
                <>
                    {options.map((o, i) => (
                        <input
                            key={i} value={o}
                            onChange={(e) => setOptions((p) => p.map((x, xi) => (xi === i ? e.target.value : x)))}
                            placeholder={`選項 ${i + 1}`}
                            style={{ width: '100%', padding: '10px 13px', borderRadius: 12, border: `1px solid ${C.pebble}`, background: '#fff', fontSize: 13.5, color: C.ink, outline: 'none', marginBottom: 8 }}
                        />
                    ))}
                    {options.length < 5 && (
                        <motion.button {...pressProps('row')} onClick={() => setOptions((p) => [...p, ''])}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999, border: `1px dashed ${C.pebble}`, background: 'transparent', cursor: 'pointer', marginBottom: 10 }}>
                            <Plus size={13} color={C.sub} /><span style={{ fontSize: 12.5, fontWeight: 700, color: C.sub }}>加一個選項</span>
                        </motion.button>
                    )}
                </>
            ) : (
                <input
                    value={when} onChange={(e) => setWhen(e.target.value)}
                    placeholder="時間地點，例如：週六 07:00 大稻埕"
                    style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: `1px solid ${C.pebble}`, background: '#fff', fontSize: 13.5, color: C.ink, outline: 'none', marginBottom: 10 }}
                />
            )}

            <motion.button
                {...pressProps('cta')} disabled={!valid}
                onClick={() => onSubmit(isPoll
                    ? { type: 'poll', text: text.trim(), options: options.map((o) => o.trim()).filter(Boolean), votes: {} }
                    : { type: 'meetup', text: text.trim(), when: when.trim(), joined: [] })}
                style={{
                    width: '100%', minHeight: 44, borderRadius: 999, border: 'none', cursor: valid ? 'pointer' : 'default',
                    background: valid ? C.ink : 'rgba(22,20,21,0.10)', color: valid ? C.paper : 'rgba(22,20,21,0.35)',
                    fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
                }}
            >
                發布
            </motion.button>
        </motion.div>
    );
};

// ══════════════════════════════════════════════════════════════════════════
const ClubDiscussion = ({ club, userId, myName = '我', members = [], onUpdate }) => {
    const [draft, setDraft] = useState('');
    const [composer, setComposer] = useState(null);   // 'poll' | 'meetup' | null
    const fileRef = useRef(null);
    const inputRef = useRef(null);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [photoError, setPhotoError] = useState('');
    /* 回覆與 @提及 —— 從那道死掉的「動態牆」搬過來的東西，
       放在真正有內容的地方（討論），而不是另外再開一面牆。 */
    const [replyTo, setReplyTo] = useState(null);      // { id, name, text }
    const [expanded, setExpanded] = useState({});      // msgId → 是否展開全部回覆
    const [mentionQuery, setMentionQuery] = useState(null);   // null = 沒在挑人

    const memberNames = useMemo(
        () => (members || []).map((m) => String(m?.name || '').trim()).filter(Boolean),
        [members],
    );
    const mentionHits = useMemo(() => {
        if (mentionQuery == null) return [];
        const q = mentionQuery.toLowerCase();
        return (members || [])
            .filter((m) => m?.name && (!q || String(m.name).toLowerCase().includes(q)))
            .slice(0, 5);
    }, [mentionQuery, members]);

    const [chat, setChat] = useState([]);
    const [syncError, setSyncError] = useState('');
    const busy = useRef(false);
    const endpoint = `/api/squads/${encodeURIComponent(club.squadId || club.id)}/discussion`;
    useEffect(() => {
        let active = true;
        const refresh = async () => {
            if (busy.current || document.hidden) return;
            try {
                const { data } = await apiClient.get(endpoint);
                if (active && !busy.current) { setChat(data.chat || []); setSyncError(''); }
            } catch { if (active) setSyncError('討論暫時無法同步，請確認網路後重試。'); }
        };
        setChat([]);
        refresh();
        const timer = setInterval(refresh, 10000);
        return () => { active = false; clearInterval(timer); };
    }, [endpoint]);
    const act = async (payload) => {
        if (busy.current) return false;
        busy.current = true;
        try {
            const { data } = await apiClient.post(endpoint, payload);
            setChat(data.chat || []);
            setSyncError('');
            return true;
        } catch (err) {
            setSyncError(err?.response?.data?.detail || '操作未完成，請確認網路後重試。');
            return false;
        } finally { busy.current = false; }
    };
    const send = async () => {
        const text = draft.trim();
        if (!text) return;
        const ok = await act(replyTo
            ? { action: 'reply', message_id: String(replyTo.id), text }
            : { action: 'post', client_id: crypto.randomUUID(), type: 'text', text });
        if (ok) { setDraft(''); setReplyTo(null); setMentionQuery(null); }
    };

    /** 輸入框變動時偵測 @ —— 游標前最後一個 @ 之後還沒有空白就進入挑人模式。 */
    const onDraftChange = (v) => {
        setDraft(v);
        const at = v.lastIndexOf('@');
        if (at === -1) { setMentionQuery(null); return; }
        const after = v.slice(at + 1);
        setMentionQuery(/\s/.test(after) ? null : after);
    };

    const pickMention = (name) => {
        const at = draft.lastIndexOf('@');
        const next = `${draft.slice(0, at)}@${name} `;
        setDraft(next);
        setMentionQuery(null);
        inputRef.current?.focus();
    };

    /* 選了照片：縮圖 → 檢查大小 → 和一般訊息一樣進同一條時間軸。
       失敗一定要說出來 —— 選了照片卻什麼都沒發生，使用者會以為是自己按錯。 */
    const pickPhoto = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';                    // 同一張圖再選一次也要能觸發
        if (!file) return;
        if (!file.type?.startsWith('image/')) { setPhotoError('只能傳圖片檔'); return; }
        setPhotoBusy(true); setPhotoError('');
        try {
            const dataUrl = await shrinkImage(file);
            if (dataUrl.length > MAX_PHOTO_BYTES) {
                setPhotoError('這張圖太大了，換一張或先裁切一下');
                return;
            }
            if (await act({ action: 'post', client_id: crypto.randomUUID(), type: 'photo', image: dataUrl, text: draft.trim() })) setDraft('');
        } catch (err) {
            setPhotoError(err?.message || '照片處理失敗，請再試一次');
        } finally {
            setPhotoBusy(false);
        }
    };

    const publish = async (payload) => {
        if (await act({ action: 'post', client_id: crypto.randomUUID(), ...payload })) setComposer(null);
    };
    const toggleReaction = (id, key) => act({ action: 'reaction', message_id: String(id), key });
    const vote = (id, index) => act({ action: 'vote', message_id: String(id), index: Number(index) });
    const joinMeetup = id => act({ action: 'meetup', message_id: String(id) });


    return (
        <div className="flex flex-col pt-4 pb-32">
            {syncError && <p role="alert" style={{ color: C.coral, padding: 12 }}>{syncError}</p>}
            <div className="flex-1 px-1" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {chat.length === 0 && (
                    <div style={{ padding: '30px 22px', textAlign: 'center', background: C.paper, border: `1px dashed ${C.pebble}`, borderRadius: 18 }}>
                        <p style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: 0 }}>還沒有人開口</p>
                        <p style={{ fontSize: 13, color: 'rgba(22,20,21,0.5)', margin: '7px 0 0', lineHeight: 1.65 }}>
                            打字、發起投票，或直接揪一場團練。
                        </p>
                    </div>
                )}

                {chat.map((msg) => {
                    const isMe = String(msg.userId) === String(userId);
                    if (msg.system) {
                        return (
                            <div key={msg.id} style={{ display: 'flex', justifyContent: 'center' }}>
                                <div style={{ padding: '7px 15px', borderRadius: 999, background: C.stone, border: `1px solid ${C.pebble}`, maxWidth: '90%' }}>
                                    <p style={{ fontSize: 12.5, fontWeight: 700, color: C.sub, margin: 0 }}>{msg.text}</p>
                                </div>
                            </div>
                        );
                    }

                    const canDelete = isMe || members.some(m => String(m.userId) === String(userId) && ['leader', 'admin', 'moderator'].includes(m.role));
                    const rich = msg.type === 'poll' || msg.type === 'meetup' || msg.type === 'photo';
                    return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: rich ? 'stretch' : (isMe ? 'flex-end' : 'flex-start') }}>
                            <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
                                {canDelete && <button onClick={() => { if (window.confirm('確定刪除這則討論？')) act({ action: 'delete', message_id: String(msg.id) }); }} style={{ fontSize: 12, color: C.sub }}>刪除</button>}
                                {/* App Store 1.2：檢舉進全站佇列（24 小時內處理）；封鎖對人生效，全站同步、可在封鎖名單解除 */}
                                {!isMe && <><button onClick={async () => { if (await act({ action: 'report', message_id: String(msg.id), text: '不當內容' })) toast.success('已檢舉，我們會在 24 小時內處理'); }} style={{ fontSize: 12, color: C.sub }}>檢舉</button>
                                <button onClick={async () => { if (window.confirm('封鎖後你們互相看不到討論與動態，確定封鎖？') && await act({ action: 'block', message_id: String(msg.id) })) { markBlockedLocally(msg.userId); toast.success('已封鎖，可在「我的 › 封鎖名單」解除'); } }} style={{ fontSize: 12, color: C.sub }}>封鎖</button></>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, maxWidth: rich ? '100%' : '88%', width: rich ? '100%' : 'auto' }}>
                                {!isMe && !rich && (
                                    <div style={{ width: 32, height: 32, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.stone, border: `1px solid ${C.pebble}`, fontSize: 13, fontWeight: 800, color: C.ink }}>
                                        {initialOf(msg.name)}
                                    </div>
                                )}
                                <div style={{
                                    flex: rich ? 1 : 'initial',
                                    padding: rich ? 16 : '12px 15px',
                                    borderRadius: 18,
                                    background: rich ? C.paper : (isMe ? C.ink : C.paper),
                                    color: rich ? C.ink : (isMe ? C.paper : C.ink),
                                    border: rich || !isMe ? `1px solid ${C.pebble}` : 'none',
                                    borderBottomRightRadius: !rich && isMe ? 5 : 18,
                                    borderBottomLeftRadius: !rich && !isMe ? 5 : 18,
                                }}>
                                    {(!isMe || rich) && (
                                        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: C.coral, margin: '0 0 5px', textTransform: 'uppercase' }}>
                                            {isMe ? myName : msg.name}
                                        </p>
                                    )}
                                    {msg.type === 'poll' && <PollCard msg={msg} userId={userId} onVote={vote} />}
                                    {msg.type === 'meetup' && <MeetupCard msg={msg} userId={userId} onJoin={joinMeetup} />}
                                    {msg.type === 'photo' && (
                                        <>
                                            <img
                                                src={msg.image} alt={msg.text || '社團照片'}
                                                loading="lazy" decoding="async"
                                                style={{ width: '100%', display: 'block', borderRadius: 12, border: `1px solid ${C.pebble}`, background: C.stone }}
                                            />
                                            {msg.text && (
                                                <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, margin: '10px 0 0', color: C.ink }}>{msg.text}</p>
                                            )}
                                        </>
                                    )}
                                    {!rich && <p style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.6, margin: 0 }}>{renderWithMentions(msg.text, memberNames)}</p>}
                                </div>
                            </div>

                            {/* 快速反應：每一則都能一鍵回應，不用打字 */}
                            <div style={{ paddingLeft: !isMe && !rich ? 42 : 0, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <ReactionBar msg={msg} userId={userId} onToggle={toggleReaction} />
                                {!msg.system && (
                                    <motion.button {...pressProps('pill')}
                                        onClick={() => { setReplyTo({ id: msg.id, name: msg.name, text: msg.text || '' }); inputRef.current?.focus(); }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999,
                                            background: 'transparent', border: `1px solid ${C.pebble}`, cursor: 'pointer',
                                        }}>
                                        <CornerDownRight size={12} color={C.sub} strokeWidth={2.2} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>回覆</span>
                                    </motion.button>
                                )}
                            </div>

                            {/* 回覆串：預設只顯示兩則，其餘收起來 —— 不讓一長串把時間軸洗掉 */}
                            {(msg.replies || []).length > 0 && (() => {
                                const all = msg.replies;
                                const open = !!expanded[msg.id];
                                const shown = open ? all : all.slice(-2);
                                return (
                                    <div style={{ marginTop: 7, paddingLeft: !isMe && !rich ? 42 : 12, display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
                                        {!open && all.length > 2 && (
                                            <motion.button {...pressProps('pill')} onClick={() => setExpanded((e) => ({ ...e, [msg.id]: true }))}
                                                style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: C.sub }}>
                                                查看全部 {all.length} 則回覆
                                            </motion.button>
                                        )}
                                        {shown.map((r) => (
                                            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderLeft: `2px solid ${C.pebble}`, paddingLeft: 10 }}>
                                                <div style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.stone, border: `1px solid ${C.pebble}`, fontSize: 11, fontWeight: 800, color: C.ink }}>
                                                    {initialOf(r.name)}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <span style={{ fontSize: 11.5, fontWeight: 800, color: C.coral, letterSpacing: '0.06em' }}>{r.name}</span>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.3)', marginLeft: 7 }}>{r.time}</span>
                                                    <p style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.55, color: C.ink, margin: '2px 0 0' }}>
                                                        {renderWithMentions(r.text, memberNames)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.3)', marginTop: 5, letterSpacing: '0.08em' }}>{msg.time}</span>
                        </div>
                    );
                })}
            </div>

            {/* 底部輸入區 */}
            <div className="fixed left-0 right-0 max-w-[440px] mx-auto px-4 pt-2"
                style={{ boxSizing: 'border-box', background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderTop: `1px solid ${C.pebble}`, bottom: 0, paddingBottom: 'max(12px,env(safe-area-inset-bottom))' }}>
                <AnimatePresence>
                    {composer && <Composer mode={composer} onCancel={() => setComposer(null)} onSubmit={publish} />}
                </AnimatePresence>

                {!composer && (
                    <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
                        <motion.button {...pressProps('pill')} onClick={() => setComposer('poll')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999, background: 'rgba(22,20,21,0.05)', border: `1px solid ${C.pebble}`, cursor: 'pointer', flexShrink: 0 }}>
                            <BarChart3 size={13} color={C.ink} strokeWidth={2.2} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>投票</span>
                        </motion.button>
                        <motion.button {...pressProps('pill')} onClick={() => setComposer('meetup')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999, background: 'rgba(22,20,21,0.05)', border: `1px solid ${C.pebble}`, cursor: 'pointer', flexShrink: 0 }}>
                            <CalendarPlus size={13} color={C.ink} strokeWidth={2.2} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>揪團</span>
                        </motion.button>
                        <motion.button {...pressProps('pill')} disabled={photoBusy} onClick={() => fileRef.current?.click()}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999, background: 'rgba(22,20,21,0.05)', border: `1px solid ${C.pebble}`, cursor: photoBusy ? 'default' : 'pointer', opacity: photoBusy ? 0.55 : 1, flexShrink: 0 }}>
                            <ImagePlus size={13} color={C.ink} strokeWidth={2.2} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{photoBusy ? '處理中…' : '照片'}</span>
                        </motion.button>
                        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
                    </div>
                )}

                {photoError && (
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: C.coral, margin: '0 0 8px', paddingLeft: 4 }}>{photoError}</p>
                )}

                {/* 正在回覆誰 —— 沒有這一行，回覆送出去會像是憑空多一則訊息 */}
                {replyTo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', marginBottom: 8, borderRadius: 12, background: 'rgba(22,20,21,0.04)', border: `1px solid ${C.pebble}` }}>
                        <CornerDownRight size={13} color={C.coral} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: 11.5, fontWeight: 800, color: C.coral, margin: 0 }}>回覆 {replyTo.name}</p>
                            <p style={{ fontSize: 12.5, fontWeight: 500, color: C.sub, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {replyTo.text || '（照片／投票／揪團）'}
                            </p>
                        </div>
                        <motion.button {...pressProps('icon')} aria-label="取消回覆" onClick={() => setReplyTo(null)}
                            style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                            <X size={13} color={C.sub} />
                        </motion.button>
                    </div>
                )}

                {/* @提及：打 @ 就從真實成員名單挑，不用自己拼名字 */}
                {mentionQuery != null && mentionHits.length > 0 && (
                    <div style={{ marginBottom: 8, borderRadius: 12, background: 'white', border: `1px solid ${C.pebble}`, overflow: 'hidden' }}>
                        {mentionHits.map((m) => (
                            <motion.button {...pressProps('row')} key={m.userId || m.name}
                                onClick={() => pickMention(m.name)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                    background: 'transparent', border: 'none', borderBottom: `1px solid ${C.stone}`, cursor: 'pointer', textAlign: 'left',
                                }}>
                                <span style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.stone, border: `1px solid ${C.pebble}`, fontSize: 11, fontWeight: 800, color: C.ink }}>
                                    {initialOf(m.name)}
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{m.name}</span>
                            </motion.button>
                        ))}
                    </div>
                )}

                {/* ⚠️ 這一列以前會整條凸出螢幕右緣，送出鍵被切掉一半（使用者回報：圖六）。
                       成因不是寬度算錯，是 <input> 的內建最小寬度：flex:1 只給「可以長大」，
                       沒有 minWidth:0 就縮不到比內容還窄，而 input 預設 size=20，
                       再加上一個 14 字的 placeholder，整列就被撐開了。
                       兩件事一起改：minWidth:0，以及 placeholder 只留該講的那四個字 ——
                       旁邊就有一顆 @ 鈕，不需要用小字教人怎麼提及成員。 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, boxSizing: 'border-box', background: C.paper, border: `1px solid ${C.pebble}`, borderRadius: 999, paddingLeft: 16, paddingRight: 5, paddingTop: 5, paddingBottom: 5 }}>
                    <input
                        ref={inputRef}
                        type="text" value={draft} size={1}
                        onChange={(e) => onDraftChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') { setReplyTo(null); setMentionQuery(null); } }}
                        placeholder={replyTo ? `回覆 ${replyTo.name}` : '說點什麼…'}
                        style={{ background: 'transparent', border: 'none', flex: 1, minWidth: 0, width: '100%', fontSize: 14, fontWeight: 500, outline: 'none', color: C.ink }}
                    />
                    {memberNames.length > 0 && (
                        <motion.button {...pressProps('icon')} aria-label="提及成員"
                            onClick={() => { onDraftChange(`${draft}${draft.endsWith(' ') || !draft ? '' : ' '}@`); inputRef.current?.focus(); }}
                            style={{ width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                            <AtSign size={15} color={C.sub} strokeWidth={2.2} />
                        </motion.button>
                    )}
                    <motion.button {...pressProps('icon')} onClick={send} aria-label="送出"
                        style={{ width: 34, height: 34, borderRadius: 999, border: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: draft.trim() ? C.ink : 'rgba(22,20,21,0.12)' }}>
                        <Send size={16} color={draft.trim() ? C.paper : 'rgba(22,20,21,0.4)'} strokeWidth={2.4} />
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default ClubDiscussion;
