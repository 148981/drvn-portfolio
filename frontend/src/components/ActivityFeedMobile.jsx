import './ActivityFeedGlass.css';
// ActivityFeedMobile.jsx
// ──────────────────────────────────────────────────────────────────────────
// 最新動態 — 近 30 天所有運動紀錄時間軸（DRVN design system）。
//   • 大卡 Liquid Glass 設計（參考 Strava）：左側簡易數據 + 右側路線縮圖。
//   • 依運動種類用「極淡的 hello mix 配色」分類（玻璃微光暈 + 圖示底 + 左色條）。
//   • 每張卡都是 Liquid Glass 材質；點一筆 → 進該當次結算頁。
//   • 近 30 天；無紀錄時顯示模擬數據預覽（標「示意」，不可點進）。無 emoji，全 SVG 圖示。
// ──────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import RouteSnapshotMap from './RouteSnapshotMap';
import MapAutoResize from './MapAutoResize';
import { motion, AnimatePresence } from 'framer-motion';
// 🎬 互動回饋預設 —— 與飲食系統共用同一份按壓手感（見 utils/nutritionMotion.jsx）
import { pressProps } from '../utils/nutritionMotion';
import { Activity, ThumbsUp, MessageCircle, Share2, Users, Send, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Polyline, CircleMarker } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
// 🪪 留言/按讚的作者名字（原本讀 localStorage 'userName'，但那個 key 全站沒人寫）
import { getDisplayName } from '../utils/socialIdentity';
import { sportIconSrc, hasSportIcon } from '../utils/sportIcons';
import { getSessionCompanions } from '../utils/trainingCompanions';
import { toast } from '../utils/toast';
// 🧩 動態與社群共用同一份紀錄（抓取／正規化／去重／獎牌都在這裡）
import { loadMyActivities, withinDays, parseSessionDate } from '../utils/activityFeedSource';
// 🎨 卡片外殼（金屬底／玻璃罩／浮水印／獎牌徽章）—— 與社群動態共用同一份
import {
    SportGlyph, SportWatermark, MedalBadge, MedalList,
} from './ui/ActivityCardChrome';

const C = { paper: '#F6F4F1', ink: '#161415', coral: '#F95C4B', pebble: 'rgba(22,20,21,0.08)', sub: 'rgba(22,20,21,0.5)' };

// 運動類型 → 中文名（無 emoji）
const SPORT_ZH = {
    running: '跑步', run: '跑步', free: '自由跑',
    cycling: '自行車', trail_running: '越野跑', trail: '越野跑',
    hiking: '健行', hike: '健行', swimming: '游泳', swim: '游泳',
    skiing: '滑雪', ski: '滑雪', strength: '重訓', gym: '重訓',
    cardio: '有氧', hiit: '間歇', rowing: '划船', elliptical: '橢圓機',
};
// 運動卡染色：跑步墨黑、重訓 Coral，其餘保留各運動色系。
const SPORT_COLOR = {
    strength: '#F95C4B', gym: '#F95C4B',                        // Coral
    running: '#161415', run: '#161415', free: '#161415',       // 墨黑
    swimming: '#9AB2D4', swim: '#9AB2D4',                      // Clear Day 藍
    trail_running: '#AAD59E', trail: '#AAD59E',                // Apple 綠
    hiking: '#AAD59E',                                          // Apple 綠
    cycling: '#CDBCDB',                                         // Viola 紫
    skiing: '#CDBCDB', ski: '#CDBCDB',                         // Viola 紫
    cardio: '#F6C3AE', hiit: '#F6C3AE',                        // Rosehip 粉
    rowing: '#F6C3AE', elliptical: '#F6C3AE',                  // Rosehip 粉
};
const sportKey = (s) => String(s?.sport || s?.sportType || s?.type || s?.metrics?.type || 'running').toLowerCase();
const labelFor = (s) => s?.sportLabel || s?.sport_label || SPORT_ZH[sportKey(s)] || '運動';
const colorFor = (s) => SPORT_COLOR[sportKey(s)] || C.coral;

// 天氣：溫度 + 簡短天況（有存才顯示）
const weatherText = (s) => {
    const w = s?.weather;
    if (!w) return null;
    const t = w.temperature != null ? `${Math.round(w.temperature)}°` : null;
    const cond = w.condition || '';
    return [t, cond].filter(Boolean).join(' ') || null;
};
// 時間 HH:MM
const timeText = (d) => (d ? d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

// 星期幾（週一…週日）
const WEEKDAY_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const weekdayText = (d) => (d ? WEEKDAY_ZH[d.getDay()] : '');

// 重訓部位：把 muscles / focus_group 轉成中文短字串（最多 3 個）
const MUSCLE_ZH = {
    chest: '胸', back: '背', shoulders: '肩', shoulder: '肩', arms: '手臂', arm: '手臂',
    biceps: '二頭', triceps: '三頭', legs: '腿', leg: '腿', quads: '股四頭', hamstrings: '腿後',
    glutes: '臀', core: '核心', abs: '腹', calves: '小腿', 'full body': '全身', fullbody: '全身',
    上半身: '上半身', 下半身: '下半身',
};
const muscleText = (s) => {
    let list = Array.isArray(s?.muscles) ? s.muscles.filter(Boolean) : [];
    if (!list.length && s?.focus_group) list = [s.focus_group];
    if (!list.length) return '';
    const zh = list.slice(0, 3).map((m) => {
        const k = String(m).trim().toLowerCase();
        return MUSCLE_ZH[k] || MUSCLE_ZH[String(m).trim()] || String(m).trim();
    });
    return zh.join(' · ');
};

// 運動線稿圖示改用共用外殼 ui/ActivityCardChrome 的 SportGlyph（原本這裡有一份一模一樣的）

// 路線縮圖（有 GPS 用真實座標；無 GPS 用該運動的簽名式裝飾線）
const RouteMini = ({ route, color, size = 88 }) => {
    let points = null;
    if (Array.isArray(route) && route.length >= 2) {
        try {
            const lats = route.map(p => p.lat ?? p[0]);
            const lngs = route.map(p => p.lng ?? p[1]);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
            const range = Math.max(maxLat - minLat, maxLng - minLng) || 0.0001;
            const pad = 8, scale = (size - pad * 2) / range;
            points = route.map(p => {
                const lat = p.lat ?? p[0], lng = p.lng ?? p[1];
                return `${pad + (lng - minLng) * scale},${size - (pad + (lat - minLat) * scale)}`;
            }).join(' ');
        } catch { points = null; }
    }
    // 無真實路線 → 一條柔和裝飾曲線（示意）
    const deco = `${8},${size * 0.7} ${size * 0.3},${size * 0.35} ${size * 0.55},${size * 0.6} ${size - 8},${size * 0.25}`;
    const pts = points || deco;
    const last = pts.split(' ').pop().split(',');
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', opacity: points ? 1 : 0.5 }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            {last.length === 2 && <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />}
        </svg>
    );
};

// ──────────────────────────────────────────────────────────────────────────
// 活動卡下方全寬「真實路線地圖」（Leaflet + CartoDB 免 token 圖磚）。
//   • 只在有 GPS route（≥2 點）時渲染；輕量、唯讀（不可拖曳/縮放，避免與卡片點擊衝突）。
//   • 自動 fit 路線範圍；起點白點、終點珊瑚點。與 SegmentExplorer 同一套地圖語言。
// ──────────────────────────────────────────────────────────────────────────
const normalizeRoute = (route) => {
    if (!Array.isArray(route)) return [];
    return route
        .map(p => [Number(p?.lat ?? p?.[0]), Number(p?.lng ?? p?.[1])])
        .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
};

// 掛在 MapContainer 內：把地圖視野 fit 到整條路線
const FitRoute = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (!points || points.length < 2) return;
        try {
            const bounds = L.latLngBounds(points);
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
        } catch (e) { console.warn('[FeedRouteMap] fitBounds skipped:', e?.message); }
        // 地圖在卡片動畫/佈局後可能尺寸未定，補一次 invalidateSize
        const t = setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 250);
        return () => clearTimeout(t);
    }, [points, map]);
    return null;
};

const FeedRouteMap = ({ route, color = C.coral, height = 150, bleed = false }) => {
    const points = useMemo(() => normalizeRoute(route), [route]);
    if (points.length < 2) return null;
    const start = points[0];
    const end = points[points.length - 1];
    return (
        <div
            // 阻止地圖區域的點擊冒泡到卡片（避免點地圖就進入結算頁）
            onClick={(e) => e.stopPropagation()}
            /* bleed：貼文模式 —— 地圖就是這則貼文的「照片」，左右貼齊螢幕、不留圓角 */
            style={bleed
                ? { margin: '14px -18px 0', height, overflow: 'hidden', position: 'relative' }
                : { marginTop: 14, height, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(22,20,21,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)', position: 'relative' }}
        >
            {/* 動態牆的路線縮圖跟 Strava 一樣用靜態圖：iOS 上是 Apple Maps 快照（立即、清楚），
                網頁版拿不到快照才退回 Leaflet。 */}
            <RouteSnapshotMap route={points} color={color} padding={22} fallback={() => (
            <MapContainer className={mapThemeClass('light')}
                bounds={L.latLngBounds(points)}
                boundsOptions={{ padding: [24, 24], maxZoom: 16 }}
                zoomControl={false}
                attributionControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                boxZoom={false}
                keyboard={false}
                style={{ width: '100%', height: '100%', background: '#EFECE7' }}
            >
                {/* 貼文縮圖不畫地名層：主角是路線，不是路名。 */}
                <MapAutoResize />
                <DrvnTileLayer style="minimal" labels={false} opacity={0.92} />
                <FitRoute points={points} />
                {/* 路線光暈 + 主線 */}
                <Polyline positions={points} pathOptions={{ color, weight: 8, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }} />
                <Polyline positions={points} pathOptions={{ color, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
                {/* 起點（白）/ 終點（色） */}
                <CircleMarker center={start} radius={5} pathOptions={{ color, weight: 2.5, fillColor: '#fff', fillOpacity: 1 }} />
                <CircleMarker center={end} radius={5.5} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }} />
            </MapContainer>
            )} />
        </div>
    );
};

const fmtPace = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"` : "--'--\"");

// 🏅 破紀錄的判定與名次一律由 utils/prMedals 提供（原本這裡有一份重複的 PR 預覽邏輯，已移除）

// 📍 每張動態卡的地點列：有存地名直接用；舊有氧紀錄用路線起點反解（含快取）
const CardLocation = ({ session, inline = false }) => {
    const [name, setName] = useState(session.location_name || session.locationName || null);
    useEffect(() => {
        let alive = true;
        if (!name && !session.mock && Array.isArray(session.route) && session.route.length > 0) {
            import('../utils/locationName').then(({ cachedRouteLocationName }) =>
                cachedRouteLocationName(session.session_id, session.route)
            ).then((n) => { if (alive && n) setName(n); }).catch(() => { /* 取不到就不顯示 */ });
        }
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!name) return null;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: inline ? 0 : 3, justifyContent: inline ? 'flex-start' : 'flex-end', minWidth: 0 }}>
            <MapPin size={11} color="var(--activity-muted, rgba(22,20,21,0.6))" strokeWidth={2.2} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))', maxWidth: inline ? 180 : 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
            </span>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────
// 🤝 同跑者 + 💬 留言 + ↗ 分享 — 活動卡底部社群列（參考 Strava 詳情頁排版）。
//   • 同跑者：自動偵測（時間+路線吻合，不限好友）；對方已完賽 → 直接顯示對方數據。
//   • 留言：按讚/留言掛在該次 session_id 上（後端 /api/activities/{id}/…）。
//   • 分享：跳回該次跑步的打卡頁（結束當下錯過分享，之後隨時可補）。
// ──────────────────────────────────────────────────────────────────────────
const FeedSocialBar = ({ session, color, onShare, strength = false }) => {
    const sid = session.session_id;
    const userId = getUserId();
    // 🤝 同跑者：優先用「後端 session 內存的 companions」（跨裝置可見），
    //    沒有才退回本機快取（離線 / 舊資料）。
    const [companions] = useState(() => {
        const remote = Array.isArray(session.companions) ? session.companions : [];
        if (remote.length) return remote;
        return sid ? getSessionCompanions(sid) : [];
    });
    const [kudosCount, setKudosCount] = useState(null);
    const [liked, setLiked] = useState(false);
    const [comments, setComments] = useState(null); // null = 未載入
    const [showComments, setShowComments] = useState(false);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);

    // 首次展開留言區才載入（避免整條時間軸一次打幾十支 API）
    const loadSocial = async () => {
        if (!sid) return;
        try {
            const [k, c] = await Promise.all([
                apiClient.get(`/api/activities/${sid}/kudos`).catch(() => null),
                apiClient.get(`/api/activities/${sid}/comments`).catch(() => null),
            ]);
            if (k?.data) {
                setKudosCount(k.data.count ?? 0);
                setLiked((k.data.kudoers || []).some((u) => u.user_id === userId));
            }
            if (c?.data) setComments(c.data.comments || []);
        } catch (_) { /* 社群後端不可用 → 保持隱藏計數 */ }
    };
    useEffect(() => { loadSocial(); /* 掛載時載一次計數 */ }, [sid]); // eslint-disable-line

    const toggleLike = async (e) => {
        e.stopPropagation();
        if (!sid) return;
        const next = !liked;
        setLiked(next);
        setKudosCount((v) => Math.max(0, (v || 0) + (next ? 1 : -1)));
        try {
            const fd = new FormData();
            fd.append('user_id', userId);
            fd.append('user_name', getDisplayName(userId));
            fd.append('action', next ? 'add' : 'remove');
            await apiClient.post(`/api/activities/${sid}/kudos`, fd);
        } catch (_) {
            /* ⚠️ 稽核前：失敗不吭聲，愛心停在已按的狀態，
               直到下次重新載入才無聲無息彈回去 —— 使用者只會覺得
               「我明明按了怎麼不見了」。現在立刻回滾並說明。 */
            setLiked(!next);
            setKudosCount((v) => Math.max(0, (v || 0) + (next ? -1 : 1)));
            try {
                const { toast } = await import('../utils/toast');
                toast.error('按讚沒有送出去，請稍後再試');
            } catch { /* toast 不可用不影響流程 */ }
        }
    };

    const sendComment = async (e) => {
        e?.stopPropagation?.();
        const text = draft.trim();
        if (!text || !sid || sending) return;
        setSending(true);
        try {
            const fd = new FormData();
            fd.append('user_id', userId);
            fd.append('user_name', getDisplayName(userId));
            fd.append('content', text);
            const r = await apiClient.post(`/api/activities/${sid}/comments`, fd);
            setComments((prev) => [...(prev || []), r?.data || { user_name: '我', content: text, created_at: new Date().toISOString() }]);
            setDraft('');
        } catch (_) {
            toast?.error?.('留言送出失敗，稍後再試');
        }
        setSending(false);
    };

    return (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, position: 'relative' }}>
            {/* 🤝 同跑者列 — 不論是否好友；對方完賽 → 顯示數據 */}
            {companions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, '--activity-ink': '#161415', '--activity-muted': '#625d59', padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={13} color={color} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--activity-ink, #161415)' }}>
                            {/* 使用者要的是「跟誰」，不是「跟幾個人」——名字放在最前面 */}
                            和 {companions.slice(0, 2).map((cp) => cp.name || '夥伴').join('、')}
                            {companions.length > 2 ? ` 等 ${companions.length} 人` : ''} 一起{strength ? '練' : '跑'}
                        </span>
                    </div>
                    {companions.slice(0, 3).map((cp) => (
                        <div key={cp.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 19 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(22,20,21,0.7)' }}>
                                {cp.name}
                                {/* 誠實標記：社群「一起練」按過加入 = 確定；時間/GPS 吻合 = 偵測 */}
                                {cp.confidence === 'confirmed'
                                    ? <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 800, color, letterSpacing: '0.04em' }}>一起練</span>
                                    : (cp.isFriend === false ? '（非好友）' : '')}
                            </span>
                            {cp.stats ? (
                                <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))' }}>
                                    {strength || cp.type === 'strength'
                                        /* 🏋️ 重訓同行者：顯示訓練量 / 組數 */
                                        ? [cp.stats.volume > 0 ? `${Math.round(cp.stats.volume).toLocaleString()} kg` : '', cp.stats.sets > 0 ? `${cp.stats.sets} 組` : ''].filter(Boolean).join(' · ') || '訓練中'
                                        : `${cp.stats.distance > 0 ? `${cp.stats.distance.toFixed(2)} km` : ''}${cp.stats.pace > 0 ? ` · ${fmtPace(cp.stats.pace)}/km` : ''}`}
                                </span>
                            ) : (
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))' }}>尚未結束</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 讚 · 留言 · 分享 三鍵列 */}
            <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(22,20,21,0.08)', paddingTop: 10, gap: 6 }}>
                <motion.button {...pressProps('row')} onClick={toggleLike} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <ThumbsUp size={17} color={liked ? color : 'var(--activity-ink, #161415)'} fill={liked ? color : 'none'} strokeWidth={2} />
                    {kudosCount > 0 && <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: liked ? color : 'rgba(22,20,21,0.55)' }}>{kudosCount}</span>}
                </motion.button>
                <motion.button {...pressProps('row')}
 onClick={(e) => { e.stopPropagation(); setShowComments((v) => !v); if (comments === null) loadSocial(); }}
 style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer' }}
 >
                    <MessageCircle size={17} color="var(--activity-ink, #161415)" strokeWidth={2} />
                    {(comments?.length || 0) > 0 && <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: 'var(--activity-muted, rgba(22,20,21,0.6))' }}>{comments.length}</span>}
                </motion.button>
                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); onShare?.(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Share2 size={17} color="var(--activity-ink, #161415)" strokeWidth={2} />
                </motion.button>
            </div>

            {/* 💬 留言區（展開式） */}
            <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(comments || []).map((cm, ci) => (
                                <div key={cm.comment_id || ci} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 900, color: 'var(--activity-ink, #161415)' }}>
                                        {(cm.user_name || 'U')[0]}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--activity-ink, #161415)', marginRight: 6 }}>{cm.user_name || 'User'}</span>
                                        <span style={{ fontSize: 12, color: 'var(--activity-muted, rgba(22,20,21,0.6))', lineHeight: 1.5 }}>{cm.content}</span>
                                    </div>
                                </div>
                            ))}
                            {(comments || []).length === 0 && (
                                <span style={{ fontSize: 11, color: 'var(--activity-muted, rgba(22,20,21,0.6))', fontWeight: 600 }}>還沒有留言 — 說點什麼吧</span>
                            )}
                            {/* 輸入列 */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') sendComment(e); }}
                                    placeholder="留言…"
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 12, border: '1px solid rgba(22,20,21,0.12)', background: 'rgba(255,255,255,0.7)', fontSize: 12, outline: 'none', color: C.ink }}
                                />
                                <motion.button {...pressProps('row')} aria-label="送出" onClick={sendComment} disabled={sending || !draft.trim()} style={{ width: 34, height: 34, borderRadius: 12, border: 'none', background: draft.trim() ? color : 'rgba(22,20,21,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <Send size={14} color={draft.trim() ? '#fff' : 'rgba(22,20,21,0.35)'} />
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
const fmtDur = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
// 日期解析走共用來源，避免動態／社群兩邊各寫一份（同一筆紀錄兩個日期）
const parseDate = parseSessionDate;

// （🔴 零模擬數據原則：原 MOCK 示意假卡已移除 — 無紀錄時顯示誠實空狀態邀請卡）

const ActivityFeedMobile = ({ userId: propUserId }) => {
    const navigate = useNavigate();
    const userId = propUserId || getUserId();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    // 🩹 三態修正（pitfalls：空狀態 ≠ 錯誤狀態）：兩個來源都掛掉 → 顯示「載入失敗＋重試」，
    //    而不是誤導使用者「沒有紀錄」的空狀態。
    const [loadError, setLoadError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadError(false);
            try {
                /* 🧩 單一真相源：有氧＋重訓的抓取／正規化／去重／金銀銅獎牌
                   全部在 utils/activityFeedSource，社群動態讀的是同一支。
                   兩頁再也不會出現「這裡 14 筆、那裡說還沒有動態」。 */
                const { sessions, failed } = await loadMyActivities(userId, { limit: 200 });
                if (cancelled) return;
                if (failed) setLoadError(true);
                setSessions(sessions);
            } catch (e) {
                console.warn('[ActivityFeed] load failed:', e?.message);
                if (!cancelled) setLoadError(true);
            }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [userId, reloadKey]);

    // 近 30 天（來源已排序、已去重、已標獎牌）
    const { recent, isMock } = useMemo(() => {
        const real = withinDays(sessions || [], 30);
        // 🔴 零模擬數據原則：沒有真實紀錄 → 誠實空狀態邀請卡，不擺示意假卡
        return { recent: real, isMock: real.length === 0 };
    }, [sessions]);

    const grouped = useMemo(() => {
        const map = new Map();
        recent.forEach(s => {
            const d = parseDate(s) || new Date();
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(s);
        });
        return Array.from(map.entries());
    }, [recent]);

    // 📊 頭部統計拆成兩類：健身（筆數＋總公斤）／有氧（筆數＋總公里）
    const headStats = useMemo(() => {
        let gymCount = 0, gymKg = 0, cardioCount = 0, cardioKm = 0;
        recent.forEach((s) => {
            const k = sportKey(s);
            if (k === 'strength' || k === 'gym') {
                gymCount += 1;
                gymKg += Number(s.metrics?.volume) || 0;
            } else {
                cardioCount += 1;
                cardioKm += Number(s.metrics?.distance) || 0;
            }
        });
        return { gymCount, gymKg, cardioCount, cardioKm };
    }, [recent]);

    /**
     * 開啟該筆紀錄。
     * @param {object} s     動態卡資料
     * @param {object} opts  { share:true } → 直接開分享工作室
     *
     * ⚠ 分享的返回動線（使用者回報「分享按完返回會找不到頁面」）：
     *   分享頁一律帶著 from='/activity-feed-mobile' 進去，
     *   關閉分享就回到這條時間軸，不會掉進沒有來源的中間頁。
     */
    const openSession = (s, opts = {}) => {
        if (s.mock || !s.session_id) return;
        const share = !!opts.share;
        const k = sportKey(s);
        if (k === 'strength' || k === 'gym') {
            // 🆕 重訓 → 開啟「該次」重訓結果頁（圖四同款瑞士極簡結算頁，含分享成果三張卡）
            // 🩹 只帶「按下完成」的動作/組數 — 沒做的不出現在做完的菜單裡
            const raw = s.raw || { session_id: s.session_id, ...s };
            let ex = raw.exercises;
            if (typeof ex === 'string') { try { ex = JSON.parse(ex); } catch { ex = []; } }
            if (Array.isArray(ex)) {
                ex = ex
                    .map((e) => ({
                        ...e,
                        sets: Array.isArray(e.sets) ? e.sets.filter((st) => st?.completed !== false) : e.sets,
                    }))
                    .filter((e) => (Array.isArray(e.sets) ? e.sets.length > 0 : (e.completed !== false)));
            }
            navigate('/strength-session-mobile', {
                state: {
                    from: '/activity-feed-mobile',
                    record: { ...raw, exercises: Array.isArray(ex) ? ex : [] },
                    openShare: share,
                },
            });
            return;
        }
        navigate(`/running-analysis-mobile/${s.session_id}`, {
            state: { from: '/activity-feed-mobile', openCheckIn: share },
        });
    };

    return (
        <div style={{ minHeight: '100dvh', background: C.paper, maxWidth: 430, margin: '0 auto', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', paddingBottom: 'var(--nav-clearance, 150px)' }}>
            {/* Header — 無返回鍵：此頁掛在底部導航下（一級頁），返回動線交給導航列
                標題略下移、並與下方卡牌留出呼吸間距 */}
            <div style={{ padding: '78px 18px 24px' }}>
                {/* ⚠️ 以前上面有一行「Activity Feed · 近 30 天」—— 英文小標跟大標講同一件事。
                    「近 30 天」收進下面那行統計。 */}
                <h1 style={{ fontSize: 40, fontWeight: 900, color: 'var(--activity-ink, #161415)', letterSpacing: '-0.04em', lineHeight: 0.95, margin: 0 }}>最新動態</h1>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginTop: 10 }} className="tabular-nums">
                    {(headStats.gymCount > 0 || headStats.cardioCount > 0) && '近 30 天 · '}
                    {headStats.gymCount > 0 && <>{headStats.gymCount} 筆健身 累積 {Math.round(headStats.gymKg).toLocaleString()} kg</>}
                    {headStats.gymCount > 0 && headStats.cardioCount > 0 && ' · '}
                    {headStats.cardioCount > 0 && <>{headStats.cardioCount} 筆有氧 累積 {headStats.cardioKm.toFixed(1)} km</>}
                </div>
            </div>

            {/* 貼文串左右不留邊（IG 式滿版）；載入／錯誤／空狀態仍留 18px 邊 */}
            <div style={{ padding: loading || loadError || isMock ? '0 18px' : 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[0, 1, 2].map(i => <div key={i} style={{ height: 128, borderRadius: 24, background: 'rgba(22,20,21,0.05)', animation: 'pulse 1.5s infinite' }} />)}
                    </div>
                ) : loadError ? (
                    /* 🩹 錯誤狀態（與空狀態分離）：連不上後端 → 說實話＋給重試 */
                    <div style={{
                        padding: '40px 24px', borderRadius: 26, textAlign: 'center',
                        background: 'rgba(22,20,21,0.04)', border: '1px dashed rgba(22,20,21,0.18)',
                    }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--activity-ink, #161415)', marginBottom: 8 }}>
                            動態載入失敗
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--activity-muted, rgba(22,20,21,0.6))', marginBottom: 18 }}>
                            紀錄都還在，再試一次就好
                        </div>
                        <motion.button {...pressProps('row')}
 onClick={() => setReloadKey(k => k + 1)}
 style={{
 padding: '11px 26px', borderRadius: 999, border: 'none',
 background: C.ink, color: '#F6F4F1', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em',
 }}
 >
                            重新載入
                        </motion.button>
                    </div>
                ) : (
                    <>
                        {/* 🔴 零模擬數據：無紀錄 → 誠實空狀態（邀請開始，而非假卡示意） */}
                        {/* 零資料 → 只有一件事：去完成第一筆（介面標準 §5）。不擺假卡、不寫說明段落。 */}
                        {/* 第一次的邀請放在畫面正中央 —— 空白頁只有這一件事要做，不要縮在最上面 */}
                        {isMock && (
                            <div style={{ minHeight: 'calc(100dvh - 300px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <motion.button {...pressProps('card')}
                                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                                onClick={() => {
                                    import('../utils/telemetry').then(({ track }) => track('first_record_cta')).catch(() => {});
                                    navigate('/mobile-home');
                                }}
                                className="activity-liquid-card"
                                style={{ '--activity-tint': `${C.coral}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, cursor: 'pointer' }}
                            >
                                <span style={{ position: 'relative', zIndex: 3, fontSize: 17, fontWeight: 800, color: 'var(--activity-ink, #161415)' }}>去完成第一次訓練</span>
                                <span style={{ position: 'relative', zIndex: 3, fontSize: 20, color: 'var(--activity-ink, #161415)' }}>›</span>
                            </motion.button>
                            </div>
                        )}
                        {grouped.map(([dateKey, items], gi) => {
                            const d = new Date(dateKey);
                            const dateLabel = d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
                            return (
                                <div key={dateKey} style={{ marginBottom: 22 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(22,20,21,0.42)', letterSpacing: '0.16em', padding: '0 18px 10px' }}>{dateLabel}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {items.map((s, i) => {
                                            const m = s.metrics || {};
                                            const dist = Number(m.distance) || 0;
                                            const dur = Number(m.duration || m.duration_seconds) || 0;
                                            const pace = Number(m.avgPace || m.pace_per_km || m.pace) || 0;
                                            const elev = Number(m.elevationGain || m.elevation_gain) || 0;
                                            const k = sportKey(s);
                                            const isStrength = k === 'strength' || k === 'gym';
                                            const isBasic = k !== 'running' && k !== 'run' && k !== 'free';
                                            const col = colorFor(s);
                                            const darkGlass = ['running', 'run', 'free'].includes(k);
                                            // 🏅 完整獎牌陣列（金/銀/銅名次 + 距離），依名次排序（PR→2nd→3rd）
                                            /* 🏅 金銀銅：跑步與重訓都由 utils/prMedals 統一判定（已依名次排序）。
                                               重訓過去拿不到獎牌，就是因為這裡只讀 s.medals 而重訓從不寫這欄。 */
                                            const cardMedals = Array.isArray(s.medals) ? s.medals : [];
                                            // 主要指標與次要指標（重訓改用 訓練量/時間/組數）
                                            const vol = Number(m.volume) || 0;
                                            const sets = Number(m.sets) || 0;
                                            const metrics = isStrength ? [
                                                { v: vol > 0 ? Math.round(vol).toLocaleString() : '—', u: 'kg', label: '訓練量' },
                                                { v: dur > 0 ? fmtDur(dur) : '—', u: '', label: '時間' },
                                                { v: sets > 0 ? String(sets) : '—', u: '組', label: '組數' },
                                            ] : [
                                                { v: dist > 0 ? dist.toFixed(2) : '—', u: 'km', label: '距離' },
                                                { v: dur > 0 ? fmtDur(dur) : '—', u: '', label: '時間' },
                                                isBasic
                                                    ? { v: elev > 0 ? Math.round(elev) : '—', u: 'm', label: '爬升' }
                                                    : { v: pace > 0 ? fmtPace(pace) : '—', u: '/km', label: '配速' },
                                            ];
                                            const sd = parseDate(s) || new Date();
                                            const wx = weatherText(s);
                                            return (
                                                <motion.div
                                                    key={s.session_id || `${dateKey}-${i}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: Math.min(gi * 0.04 + i * 0.03, 0.4) }}
                                                    onClick={() => openSession(s)}
                                                    /* IG 式貼文：左右滿版、沒有圓角；每種運動的玻璃色調（--activity-tint）照舊 */
                                                    className={`activity-liquid-card activity-liquid-card--post${darkGlass ? ' activity-liquid-card--dark' : ''}`}
                                                    style={{ '--activity-tint': `${col}${darkGlass ? 'e8' : '52'}`, cursor: s.mock ? 'default' : 'pointer', opacity: s.mock ? 0.92 : 1 }}
                                                >
                                                    {/* ── 內容層：浮在 Liquid Glass 罩之上（z-index 3）── */}
                                                    <div style={{ position: 'relative', zIndex: 3 }}>

                                                    {/* 貼文頭：頭像（運動圖示）＋ 名稱・時間 ＋ 第二行地點・天氣。
                                                        ⚠️ 日期不再放右上角 —— 上面的日期分組已經講過一次。 */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, position: 'relative' }}>
                                                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.62)', border: '1px solid rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            {hasSportIcon(k)
                                                                ? <img src={sportIconSrc(k)} alt={labelFor(s)} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                                                                : <SportGlyph sport={k} size={20} color={col} />}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                                                                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--activity-ink, #161415)' }}>{labelFor(s)}</span>
                                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))' }}>{weekdayText(sd)} {timeText(sd)}</span>
                                                                <MedalBadge medals={cardMedals} />
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, minWidth: 0 }}>
                                                                {isStrength && muscleText(s)
                                                                    ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted)' }}>{muscleText(s)}</span>
                                                                    : <CardLocation session={s} inline />}
                                                                {wx && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))', whiteSpace: 'nowrap' }}>{wx}</span>}
                                                            </div>
                                                            <MedalList medals={cardMedals} />
                                                        </div>
                                                    </div>

                                                    {/* 下列：數據列。跑步/有氧不再放右邊迷你路徑(下方已有大地圖)，
                                                        三項數據改為平均分佈整張卡；重訓維持右側啞鈴符號。 */}
                                                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
                                                        {/* 🏋️ 大啞鈴浮水印 — 貼著數據列，卡片多長都對得準 */}
                                                        <SportWatermark strength={isStrength} color={col} />
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, gap: 8, position: 'relative' }}>
                                                            {metrics.map((mt, idx) => (
                                                                <div key={idx}>
                                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                                                                        <span style={{ fontSize: 23, fontWeight: 300, color: 'var(--activity-ink, #161415)', letterSpacing: '-0.02em' }} className="tabular-nums">{mt.v}</span>
                                                                        {mt.u && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))' }}>{mt.u}</span>}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))', letterSpacing: '0.08em', marginTop: 2 }}>{mt.label}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {/* 啞鈴改成整張卡的大浮水印（SportWatermark），這裡不再放小 icon */}
                                                    </div>

                                                    {/* 🆕 重訓：數據下方的「簡略菜單」— 動作名 + 組數 × 最重（一眼看課表內容） */}
                                                    {isStrength && Array.isArray(s.raw?.exercises) && s.raw.exercises.length > 0 && (
                                                        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.55)' }}>
                                                            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--activity-muted, rgba(22,20,21,0.6))', letterSpacing: '0.18em', marginBottom: 6 }}>
                                                                菜單 · {s.raw.exercises.length} 個動作
                                                            </div>
                                                            {s.raw.exercises.slice(0, 4).map((ex, xi) => {
                                                                const doneSets = (Array.isArray(ex.sets) ? ex.sets : (ex.detailedSets || [])).filter(st => st && (st.completed || (st.weight && st.reps)));
                                                                const setCount = ex.setsCount || doneSets.length;
                                                                const maxW = Math.max(0, ex.weight || 0, ...doneSets.map(st => parseFloat(st.weight) || 0));
                                                                return (
                                                                    <div key={xi} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '3px 0' }}>
                                                                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '62%' }}>{ex.name}</span>
                                                                        <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))' }}>
                                                                            {setCount > 0 ? `${setCount} 組` : ''}{maxW > 0 ? ` · ${Math.round(maxW)}kg` : ''}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {s.raw.exercises.length > 4 && (
                                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--activity-muted, rgba(22,20,21,0.6))', marginTop: 4 }}>
                                                                    還有 {s.raw.exercises.length - 4} 個動作
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 全寬真實路線地圖 — 只有「非重訓且有 GPS」時顯示 */}
                                                    {!isStrength && <FeedRouteMap route={s.route} color={col} height={220} bleed />}

                                                    {/* 🤝 同跑者 + 讚/留言/分享（跑步類且非示意資料） */}
                                                    {!isStrength && !s.mock && s.session_id && (
                                                        <FeedSocialBar
                                                            session={s}
                                                            color={darkGlass ? '#FFB4A9' : col}
                                                            onShare={() => openSession(s, { share: true })}
                                                        />
                                                    )}

                                                    {/* 🆕 🏋️ 重訓卡也有社群列：一起練的人 + 讚/留言/分享
                                                        分享 → 直接開該次結果頁的「分享成果」三張卡選擇頁（圖四流程） */}
                                                    {isStrength && !s.mock && s.session_id && (
                                                        <FeedSocialBar
                                                            session={s}
                                                            color={col}
                                                            strength
                                                            onShare={() => openSession(s, { share: true })}
                                                        />
                                                    )}
                                                    </div>{/* /內容層 */}
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            <style>{`@keyframes pulse { 0%,100%{opacity:0.4;} 50%{opacity:0.15;} }`}</style>
        </div>
    );
};

export default ActivityFeedMobile;
