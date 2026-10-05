/**
 * ══════════════════════════════════════════════════════════════════════════
 * ClubActivityFeed — 社團動態（全體成員 · 只顯示當天）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 使用者原話：「這週誰在動就是那個最近動態啊，你幹嘛分開」——
 * 上一版把「成員每週彙總列」和「我的訓練卡」做成兩塊，等於同一件事講兩次。
 * 這一版只有一塊：**社團裡每個人今天練了什麼**，用跟最新動態一樣的訓練卡。
 *
 * 資料來源：GET /api/squads/{squadId}/activity?days=1
 *   後端以「社團成員名單」為範圍撈逐場紀錄（不是只有好友、也不是每週彙總）。
 *   days=1 = 只看今天：社團動態要回答「現在誰在動」，不是一條翻不完的歷史。
 *
 * 舊端點不可用時（後端還沒部署）→ 退回只顯示自己的今日紀錄，
 * 並誠實說明「只看得到你自己」，不假裝別人沒練（鐵律 1）。
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import FriendActivityCard from '../FriendActivityCard';
import apiClient from '../../api/client';
import { loadMyActivities, parseSessionDate, isStrengthSession } from '../../utils/activityFeedSource';
import { getUserId } from '../../utils/auth';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** 今天的起點（本地時間 00:00）。 */
export const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

/** 後端 activity → FriendActivityCard 的 activity 形狀。 */
const toCardActivity = (a) => {
    const m = a.metrics || {};
    return {
        sport: a.sport || 'running',
        distance: num(m.distance),
        durationSec: num(m.duration),
        paceSec: num(m.pace),
        elev: num(m.elevationGain),
        volumeKg: num(m.volume),
        sets: num(m.sets),
        route: Array.isArray(a.route) ? a.route : [],
        prCount: num(a.prCount),
        medals: Array.isArray(a.medals) ? a.medals : [],
        companions: Array.isArray(a.companions) ? a.companions : [],
        createdAt: a.createdAt,
    };
};

const ClubActivityFeed = ({ squadId, userId: propUserId, myName = '我' }) => {
    const userId = propUserId || getUserId();
    const [items, setItems] = useState(null);      // null = 未載入（三態）
    const [onlyMine, setOnlyMine] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let dead = false;

        // 退路：後端沒有 /activity 時，至少顯示自己今天的紀錄
        const loadMineToday = async () => {
            try {
                const { sessions } = await loadMyActivities(userId, { limit: 40 });
                const t0 = startOfToday().getTime();
                const mine = sessions.filter((s) => {
                    const d = parseSessionDate(s);
                    return d && d.getTime() >= t0;
                });
                if (dead) return;
                setOnlyMine(true);
                setItems(mine.map((s) => {
                    const mm = s.metrics || {};
                    return {
                        key: s.session_id,
                        member: { uId: userId, name: myName, init: (myName || '我').charAt(0).toUpperCase(), isMe: true, avatar: null },
                        activity: {
                            sport: s.sport || (isStrengthSession(s) ? 'strength' : 'running'),
                            distance: num(mm.distance ?? mm.distance_km),
                            durationSec: num(mm.duration),
                            paceSec: num(mm.avgPace ?? mm.pace_per_km ?? mm.pace),
                            elev: num(mm.elevationGain ?? mm.elevation_gain),
                            volumeKg: num(mm.volume),
                            sets: num(mm.sets),
                            route: s.route || [],
                            prCount: num(s.pr_count),
                            medals: Array.isArray(s.medals) ? s.medals : [],
                            companions: Array.isArray(s.companions) ? s.companions : [],
                            createdAt: (parseSessionDate(s) || new Date()).toISOString(),
                        },
                    };
                }));
            } catch (_) {
                if (!dead) { setFailed(true); setItems([]); }
            }
        };

        (async () => {
            if (!squadId) return loadMineToday();
            try {
                const r = await apiClient.get(`/api/squads/${squadId}/activity`, { params: { days: 1 } });
                const acts = r?.data?.activities;
                if (!Array.isArray(acts)) throw new Error('bad shape');
                if (dead) return;
                setOnlyMine(false);
                setItems(acts.map((a, i) => ({
                    key: a.sessionId || `${a.userId}_${i}`,
                    member: {
                        uId: a.userId,
                        name: a.userId === userId ? myName : (a.name || '成員'),
                        avatar: a.avatar || null,
                        init: (a.name || '成員').charAt(0).toUpperCase(),
                        isMe: a.userId === userId,
                    },
                    activity: toCardActivity(a),
                })));
            } catch (_) {
                // 端點還沒上線 / 連不到 → 退回只顯示自己的
                if (!dead) await loadMineToday();
            }
        })();

        return () => { dead = true; };
    }, [squadId, userId, myName]);

    if (items === null) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1].map((i) => (
                    <div key={i} style={{ height: 150, borderRadius: 24, background: 'rgba(22,20,21,0.05)' }} />
                ))}
            </div>
        );
    }

    if (failed) {
        return (
            <div style={{ padding: '22px 18px', textAlign: 'center', background: '#F6F4F1', border: '1px dashed rgba(22,20,21,0.18)', borderRadius: 18 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#161415', margin: 0 }}>動態暫時載不出來</p>
                <p style={{ fontSize: 12.5, color: 'rgba(22,20,21,0.5)', margin: '6px 0 0', lineHeight: 1.6 }}>大家的紀錄都在，稍後再回來看看。</p>
            </div>
        );
    }

    if (items.length === 0) {
        /* 🩹 只讀得到自己的時候，不能斷言「今天還沒有人動」——
           社團裡可能十個人都練了，我只是看不到。空狀態要說的是「我看不到」，
           不是「沒有發生」（鐵律：真實數據不造假）。 */
        return (
            <div style={{ padding: '26px 20px', textAlign: 'center', background: '#F6F4F1', border: '1px dashed rgba(22,20,21,0.18)', borderRadius: 18 }}>
                <Activity size={26} color="rgba(22,20,21,0.28)" strokeWidth={1.8} style={{ margin: '0 auto 10px' }} />
                <p style={{ fontSize: 14, fontWeight: 800, color: '#161415', margin: 0 }}>
                    {onlyMine ? '今天你還沒有紀錄' : '今天還沒有人動'}
                </p>
                <p style={{ fontSize: 12.5, color: 'rgba(22,20,21,0.5)', margin: '6px 0 0', lineHeight: 1.65 }}>
                    {onlyMine
                        ? '目前只讀得到你自己的紀錄 — 其他成員的動態要連上伺服器才看得到。'
                        : '練一次，成為今天第一個點亮社團的人。'}
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {onlyMine && (
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.42)', margin: '0 4px 2px', lineHeight: 1.5 }}>
                    目前只讀得到你自己的紀錄 — 成員動態需要後端更新後才會出現。
                </p>
            )}
            {items.map((it, i) => (
                <motion.div
                    key={it.key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 6) * 0.06 }}
                >
                    <FriendActivityCard activity={it.activity} friend={it.member} index={i} />
                </motion.div>
            ))}
        </div>
    );
};

export default ClubActivityFeed;
