import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Info, X, Settings, Users, MapPin } from 'lucide-react';
import { REGIONS, getSocialProfile, saveSocialProfile, getUserTier, XP_TIERS, buildMyRankingEntry } from '../utils/socialDataConnector';
import { getUserId } from '../utils/auth';
import SelfComparisonBanner from './SelfComparisonBanner';

import api from '../api/client';

const C = { 
    text: '#161415',   // Deep Black
    sub: '#8A7E73',    // Warm Grey
    accent: '#F95C4B', // Coral
    ember: '#D94030',  // Ember
    paper: '#F6F4F1',  // Paper
    stone: '#E4DED2',  // Stone
    pebble: '#CFC6B8', // Pebble
    gold: '#D4A843',   // Honey/Gold
    sage: '#5A7A3A'    // Sage Green
};

const PODIUM_META = [
    { rank: 2, height: 'h-20', bar: 'linear-gradient(180deg, #E4DED2, #CFC6B8)', crown: '2', crownSz: 20, avSz: 48, nameSz: '11px', glow: 'rgba(207,198,184,0.3)' },
    { rank: 1, height: 'h-28', bar: 'linear-gradient(180deg, #FBD58E, #D4A843)', crown: '1', crownSz: 26, avSz: 60, nameSz: '13px', glow: 'rgba(212,168,67,0.4)' },
    { rank: 3, height: 'h-14', bar: 'linear-gradient(180deg, #F95C4B, #D94030)', crown: '3', crownSz: 18, avSz: 44, nameSz: '11px', glow: 'rgba(217,64,48,0.3)' },
];

/* ── Location Modal ── */
const LocationModal = ({ profile, onClose, onSave }) => {
    const [city, setCity] = useState(profile.city || '');
    const [name, setName] = useState(profile.displayName || '');
    return (
        <motion.div className="fixed inset-0 z-[100100] flex items-center justify-center px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onClose()}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div className="relative w-full max-w-[340px] rounded-[28px] p-7 shadow-2xl"
                style={{ background: C.paper }}
                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-[18px] font-black" style={{ color: C.text }}>地區設定</h3>
                    <motion.button {...pressProps('icon')} onClick={() => onClose()} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><X size={16} /></motion.button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-[11px] font-bold text-[#8A7E73] ml-1 mb-1 block">顯示名稱</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full h-11 px-4 rounded-[18px] bg-black/5 text-[14px] font-bold outline-none" />
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-[#8A7E73] ml-1 mb-1 block">選擇城市</label>
                        <div className="grid grid-cols-3 gap-2">
                            {REGIONS.map(r => (
                                <motion.button {...pressProps('row')} key={r.id} onClick={() => setCity(r.label)} className="py-2.5 rounded-[12px] text-[12px] font-bold"
 style={{ background: city === r.label ? 'rgba(143,168,122,0.15)' : 'rgba(0,0,0,0.03)', color: city === r.label ? '#5A7A3A' : '#8A7E73', border: city === r.label ? '1px solid #5A7A3A' : '1px solid transparent' }}>{r.label}</motion.button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex gap-3">
                    <motion.button {...pressProps('cta')} onClick={() => onClose()} className="flex-1 py-3 rounded-full text-[14px] font-bold bg-black/5" style={{ color: C.sub }}>取消</motion.button>
                    <motion.button {...pressProps('cta')} onClick={() => { onSave({ ...profile, city, displayName: name }); }} disabled={!city}
 className="flex-1 py-3 rounded-full text-[14px] font-black text-white disabled:opacity-50" style={{ background: '#5A7A3A' }}>儲存</motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};

/* ── Formula Modal ── */
const FormulaModal = ({ type, onClose }) => (
    <motion.div className="fixed inset-0 z-[100100] flex items-center justify-center px-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <motion.div className="relative w-full max-w-[340px] rounded-[28px] p-7 shadow-2xl"
            style={{ background: C.paper }}
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={e => e.stopPropagation()}>
            <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><X size={16} color={C.sub} /></motion.button>
            <div className="flex items-center gap-2 mb-5"><Trophy size={18} color={C.gold} /><p className="text-[15px] font-black" style={{ color: C.text }}>排行分數算法</p></div>
            <div className="p-4 rounded-[18px]" style={{ background: type === 'run' ? 'rgba(230,126,81,0.08)' : 'rgba(143,168,122,0.1)' }}>
                <p className="text-[12px] font-black tracking-widest mb-2" style={{ color: type === 'run' ? C.accent : C.sage }}>{type === 'run' ? '跑步積分' : '健身積分'}</p>
                {(type === 'run' ? [
                    ['月跑量（km）','× 2 分',''],['連續訓練天數','× 5 分',''],['PR 突破次數','× 20 分',''],['配速 < 5:30/km','+ 15 分',''],
                ] : [
                    ['月訓練量（kg ÷ 10）','分',''],['連續訓練天數','× 5 分',''],['PR 突破次數','× 20 分',''],['月訓練次數','× 3 分',''],
                ]).map(([l,f,i]) => (
                    <div key={l} className="flex items-center justify-between py-1">
                        <span className="text-[12px] font-bold" style={{ color: `${C.text}B0` }}>{l}</span>
                        <span className="text-[12px] font-black" style={{ color: type === 'run' ? C.accent : C.sage }}>{f}</span>
                    </div>
                ))}
            </div>
            <p className="text-[11px] text-center mt-3" style={{ color: C.sub }}>
                等級：{XP_TIERS.map(t => t.label).join(' · ')}
            </p>
        </motion.div>
    </motion.div>
);

/* ── Podium ── */
const Podium = ({ top3, type, userId }) => {
    const order = [{ u: top3[1], m: PODIUM_META[0] }, { u: top3[0], m: PODIUM_META[1] }, { u: top3[2], m: PODIUM_META[2] }];
    const ac = type === 'run' ? C.accent : C.sage;
    return (
        <div className="relative flex items-end justify-center gap-2 pt-6 pb-2">
            {order.map(({ u, m }) => {
                if (!u) return <div key={m.rank} className="flex-1" />;
                const stat = type === 'run' ? `${u.monthly_distance?.toFixed(1) ?? 0} km` : `${((u.monthly_volume || 0) / 1000).toFixed(1)} t`;
                const me = u.user_id === userId;
                return (
                    <div key={m.rank} className="flex-1 flex flex-col items-center">
                        <div className="text-center mb-1" style={{ fontSize: m.crownSz }}>{m.crown}</div>
                        <div className="rounded-full flex items-center justify-center font-bold mb-1.5 relative"
                            style={{ width: m.avSz, height: m.avSz, background: 'rgba(255,255,255,0.85)', fontSize: m.avSz * 0.45, boxShadow: `0 4px 20px ${m.glow}, 0 0 0 2px ${me ? ac : 'rgba(255,255,255,0.9)'}` }}>
                            {u.avatar || (u.user_name ? u.user_name[0] : (u.name ? u.name[0] : 'U'))}
                            {me && <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: C.text, fontSize: 11, color: 'white', fontWeight: 900 }}>ME</div>}
                        </div>
                        <p className="font-black text-center truncate w-full px-1" style={{ fontSize: m.nameSz, color: C.text }}>{u.user_name}</p>
                        <p className="font-black text-center" style={{ fontSize: 14, color: ac }}>{u.score}</p>
                        <p className="text-[11px] font-bold text-center mb-1" style={{ color: C.sub }}>{stat}</p>
                        <div className={`w-full ${m.height} rounded-t-[18px] flex items-center justify-center`} style={{ background: m.bar, boxShadow: `0 -4px 16px ${m.glow}` }}>
                            <span className="text-white font-black text-lg opacity-50">#{m.rank}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/* ── User Row ── */
const rowRise = (i=0) => ({
    initial:{ opacity:0, y:14 },
    animate:{ opacity:1, y:0 },
    transition:{ duration:.6, ease:[0.16,1,0.3,1], delay: Math.min(i,6)*.06 }
});

const UserRow = ({ user, rank, type, isMe, index = 0 }) => {
    const ac = type === 'run' ? C.accent : C.sage;
    const stat = type === 'run' ? `${user.monthly_distance?.toFixed(1) ?? 0} km` : `${((user.monthly_volume || 0) / 1000).toFixed(1)} t`;
    const tier = getUserTier(user.xp_level || 0);
    return (
        <motion.div {...rowRise(index)} className="flex items-center gap-3 px-4 py-3 rounded-[18px]"
            style={{ background: isMe ? `${C.accent}12` : C.paper, border: isMe ? `1.5px solid ${C.accent}40` : `1px solid ${C.pebble}30` }}>
            <span className="w-6 text-[12px] font-black text-center" style={{ color: C.sub }}>{rank}</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg" style={{ background: 'rgba(0,0,0,0.05)' }}>{user.avatar || (user.user_name ? user.user_name[0] : (user.name ? user.name[0] : 'U'))}</div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-black truncate" style={{ color: C.text }}>{user.user_name}</p>
                    {isMe && <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full" style={{ background: ac, color: 'white' }}>你</span>}
                </div>
                <p className="text-[11px] font-bold" style={{ color: C.sub }}>{tier.icon} {tier.label} · {user.city || ''}</p>
            </div>
            <div className="text-right">
                <p className="text-[15px] font-black" style={{ color: ac }}>{user.score ?? 0}</p>
                <p className="text-[11px] font-bold" style={{ color: C.sub }}>{stat}</p>
            </div>
        </motion.div>
    );
};

/* ── Squad Row ── */
const SquadRow = ({ squad, rank, index = 0 }) => {
    const LVLS = [{ l:1,i:'B',c:'#CD7F32' },{ l:2,i:'S',c:'#A0A0A8' },{ l:3,i:'G',c:'#D4A843' },{ l:4,i:'D',c:'#6BAACC' },{ l:5,i:'P',c:'#A78BCC' }];
    const lv = LVLS.find(l => l.l === (squad.level || 1)) || LVLS[0];
    return (
        <motion.div {...rowRise(index)} className="flex items-center gap-3 px-4 py-3 rounded-[18px]"
            style={{ background: C.paper, border: `1px solid ${C.pebble}30` }}>
            <span className="w-6 text-[14px] font-black text-center" style={{ color: rank <= 3 ? C.gold : C.sub }}>
                {rank <= 3 ? String(rank) : rank}
            </span>
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-lg overflow-hidden" style={{ border: `1.5px solid ${lv.c}30` }}>
                {squad.cover ? <img loading="lazy" decoding="async" src={squad.cover} alt="" className="w-full h-full object-cover" /> : squad.avatar || (squad.name ? squad.name[0] : 'S')}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black truncate" style={{ color: C.text }}>{squad.name}</p>
                <p className="text-[11px] font-bold" style={{ color: C.sub }}>{lv.i} Lv.{squad.level} · {squad.members} 成員</p>
            </div>
            <div className="text-right">
                <p className="text-[15px] font-black" style={{ color: lv.c }}>{squad.xp}</p>
                <p className="text-[9px] font-bold uppercase" style={{ color: C.sub }}>XP</p>
            </div>
        </motion.div>
    );
};

/* ═══ MAIN ═══ */
const RankingBoard = ({ type = 'run', userId = getUserId() }) => {
    const [period, setPeriod] = useState('month');
    const [scope, setScope] = useState('global');
    const [rankings, setRankings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showFormula, setShowFormula] = useState(false);
    const [showLocation, setShowLocation] = useState(false);
    const [profile, setProfile] = useState(() => getSocialProfile(userId));

    const actualType = type === 'run' || type === 'running' ? 'run' : 'strength';
    const ac = actualType === 'run' ? C.accent : C.sage;
    const myEntry = useMemo(() => buildMyRankingEntry(userId, actualType, period === 'week' ? 7 : period === 'month' ? 30 : 365), [userId, actualType, period]);

    const [isSeed, setIsSeed] = useState(false);

    const fetch = useCallback(async () => {
        setLoading(true);
        setIsSeed(false);
        try {
            if (scope === 'squad') {
                const clubs = JSON.parse(localStorage.getItem('strava_clubs') || '[]');
                const filtered = clubs.filter(c => c.type === actualType).sort((a, b) => (b.xp || 0) - (a.xp || 0));
                setRankings(filtered);
                setLoading(false);
                return;
            }
            // 🔴 接真實後端排行：不再用假競爭者填榜。後端回傳 is_seed=true 代表
            //    全平台還沒有人上榜，此時只放使用者自己的真實成績，並顯示
            //    「成為第一位上榜的人」引導，而非偽造的對手名次。
            const res = await api.get('/api/leaderboard', { params: { type: actualType, period, limit: 50 } });
            let data = res.data?.rankings || res.data || [];
            const seed = res.data?.is_seed === true || data.length === 0;
            setIsSeed(seed && (!myEntry || myEntry.score <= 0));
            if (!data.some(u => u.user_id === userId) && myEntry.score > 0) data.push(myEntry);
            data.sort((a, b) => (b.score || 0) - (a.score || 0));
            setRankings(data);
        } catch {
            // 後端不可達：只顯示使用者本地計算出的真實成績（若有），絕不偽造對手。
            const data = (myEntry && myEntry.score > 0) ? [myEntry] : [];
            setIsSeed(data.length === 0);
            setRankings(data);
        } finally { setLoading(false); }
    }, [actualType, period, scope, myEntry, userId]);

    useEffect(() => { fetch(); }, [fetch]);

    const filtered = useMemo(() => {
        if (scope === 'squad') return rankings;
        if (scope === 'city') { const c = profile.city; return c ? rankings.filter(u => u.city === c) : rankings; }
        if (scope === 'level') { const t = getUserTier(myEntry.xp_level || 0).id; return rankings.filter(u => getUserTier(u.xp_level || 0).id === t); }
        return rankings;
    }, [rankings, scope, profile.city, myEntry.xp_level]);

    const isSquad = scope === 'squad';
    const top3 = isSquad ? [] : filtered.slice(0, 3);
    const rest = isSquad ? filtered : filtered.slice(3);

    const handleSaveLocation = (updated) => {
        saveSocialProfile(userId, updated);
        setProfile(updated);
        setShowLocation(false);
        setScope('city');
    };

    return (
        <div className="flex flex-col gap-4">
            {/* 🪞 Self-Comparison — 「我有沒有比上週厲害」擺在社群名次之前（真正提高留存的關鍵） */}
            <SelfComparisonBanner type={actualType} userId={userId} />

            {/* Period */}
            <div className="flex items-center gap-2">
                <div className="flex gap-1 p-1 rounded-full flex-1" style={{ background: C.pebble, border: `1px solid ${C.pebble}` }}>
                    {[['week','本週'],['month','本月'],['all','總排行']].map(([v,l]) => (
                        <motion.button {...pressProps('cta')} key={v} onClick={() => setPeriod(v)} className="flex-1 py-2 rounded-full text-[12px] font-bold"
 style={{ background: period === v ? 'white' : 'transparent', color: period === v ? C.text : C.sub, boxShadow: period === v ? '0 2px 8px rgba(0,0,0,0.06)' : 'none' }}>{l}</motion.button>
                    ))}
                </div>
                <motion.button {...pressProps('icon')} onClick={() => setShowFormula(true)} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
 style={{ background: C.paper, border: `1px solid ${C.pebble}` }}><Info size={16} color={C.sub} /></motion.button>
            </div>

            {/* Scope */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {[['global','全球'],['city',`同城${profile.city ? ` · ${profile.city}` : ''}`],['level',`同等級 · ${getUserTier(myEntry.xp_level || 0).icon}`],['squad','社團排行']].map(([v,l]) => (
                    <motion.button {...pressProps('icon')} key={v} onClick={() => { if (v === 'city' && !profile.city) { setShowLocation(true); return; } setScope(v); }}
 className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-bold"
 style={{ background: scope === v ? C.accent : C.paper, color: scope === v ? 'white' : C.sub, border: `1px solid ${scope === v ? 'transparent' : C.pebble}` }}>{l}</motion.button>
                ))}
                <motion.button {...pressProps('icon')} onClick={() => setShowLocation(true)} className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
 style={{ background: C.paper, border: `1px solid ${C.pebble}` }}><Settings size={14} color={C.sub} /></motion.button>
            </div>

            {scope === 'city' && !profile.city && (
                <div onClick={() => setShowLocation(true)} className="p-3 rounded-[18px] text-center cursor-pointer" style={{ background: `${ac}10`, border: `1px solid ${ac}20` }}>
                    <p className="text-[12px] font-bold" style={{ color: ac }}>請先設定地區</p>
                </div>
            )}

            {/* Content */}
            {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-[18px] ti-skeleton" />)
            : filtered.length === 0 ? (
                <div className="text-center py-12 px-6" style={{ color: C.sub }}>
                    <Trophy size={32} className="mx-auto mb-3" style={{ color: ac, opacity: 0.7 }} />
                    {isSeed ? (
                        <>
                            <p className="text-[14px] font-black mb-1" style={{ color: C.text }}>成為第一位上榜的人</p>
                            <p className="text-[12px] font-bold">完成一次{actualType === 'run' ? '跑步' : '訓練'}，你的成績就會出現在這裡。</p>
                        </>
                    ) : (
                        <p className="text-[13px] font-bold">這個範圍目前還沒有上榜的人</p>
                    )}
                </div>
            ) : isSquad ? (
                <div className="flex flex-col gap-2">{filtered.map((s, i) => <SquadRow key={s.id} squad={s} rank={i + 1} index={i} />)}</div>
            ) : (
                <>
                    {top3.length > 0 && (
                        <div className="rounded-[24px] overflow-hidden px-3 pt-2 pb-0 shadow-sm" style={{ background: C.stone, border: `1px solid ${C.pebble}40` }}>
                            <p className="text-[12px] font-black text-center tracking-widest mb-1" style={{ color: C.sub }}>頒獎台</p>
                            <Podium top3={top3} type={actualType} userId={userId} />
                        </div>
                    )}
                    {rest.length > 0 && <div className="flex flex-col gap-2 mt-1">{rest.map((u, i) => <UserRow key={u.user_id || i} user={u} rank={i + 4} type={actualType} isMe={u.user_id === userId} index={i} />)}</div>}
                </>
            )}

            <AnimatePresence>
                {showFormula && <FormulaModal type={actualType} onClose={() => setShowFormula(false)} />}
                {showLocation && <LocationModal profile={profile} onClose={() => setShowLocation(false)} onSave={handleSaveLocation} />}
            </AnimatePresence>
        </div>
    );
};

export default RankingBoard;
