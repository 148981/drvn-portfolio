import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import MapAutoResize from './MapAutoResize';
import { pressProps } from '../utils/nutritionMotion';
import { Trophy, TrendingUp, MapPin, Plus, Crown, X, Undo, Trash2, Edit2, Timer, Zap, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, Polyline, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { toast } from '../utils/toast';
import { getOneShotLocation } from '../utils/nativeLocation';

/* ════════════════════════════════════════════════════════════════
   SegmentExplorerMobile — Titanium / Swiss-editorial redesign
   Palette: Black #161415 · Paper #F6F4F1 · Stone #E4DED2
            Pebble #CFC6B8 · Coral #F95C4B · Ember #D94030
   ════════════════════════════════════════════════════════════════ */

// ─── Geometry helpers (defined outside the component) ───────────────
const haversineM = (a, b) => {
    const R = 6371000;
    const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const cumulativeKm = (waypoints) => {
    let total = 0;
    return waypoints.map((wp, i) => {
        if (i === 0) return 0;
        total += haversineM(waypoints[i - 1], wp) / 1000;
        return total;
    });
};

const centroid = (wps) => ({
    lat: wps.reduce((s, w) => s + w.lat, 0) / wps.length,
    lng: wps.reduce((s, w) => s + w.lng, 0) / wps.length,
});

// ─── Map marker HTML (titanium-tone) ────────────────────────────────
const routeLabelHtml = (name, totalKm) => `
    <div style="
        background: linear-gradient(135deg, #2A2724 0%, #161415 100%);
        color: #F6F4F1;
        padding: 6px 13px;
        border-radius: 20px;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.12);
        white-space: nowrap; pointer-events: none;
    ">
        <span style="color:#F95C4B;font-size:11px;line-height:1;">●</span>
        <span style="font-size:11px;font-weight:800;letter-spacing:0.01em;">${name}</span>
        <span style="width:1px;height:12px;background:rgba(255,255,255,0.18);"></span>
        <span style="font-size:11px;font-weight:700;color:rgba(246,244,241,0.62);">${totalKm} km</span>
    </div>
`;

const waypointChipHtml = (num, kmStr, isStart, isEnd) => {
    const ringColor = isStart ? '#161415' : isEnd ? '#D94030' : '#CFC6B8';
    const numColor = isStart || isEnd ? '#FFFFFF' : '#161415';
    const badge = isStart
        ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);
               background:#161415;color:#F6F4F1;font-size:6px;font-weight:900;
               padding:1px 5px;border-radius:4px;white-space:nowrap;letter-spacing:0.08em;">起點</div>`
        : isEnd
        ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);
               background:#D94030;color:#fff;font-size:6px;font-weight:900;
               padding:1px 5px;border-radius:4px;white-space:nowrap;letter-spacing:0.08em;">終點</div>`
        : '';
    return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;position:relative;">
        ${badge}
        <div style="
            background:${ringColor};
            border: 2.5px solid #F6F4F1;
            border-radius: 50%;
            width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            color: ${numColor}; font-weight: 900; font-size: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            margin-top: ${isStart || isEnd ? '8px' : '0'};
        ">${num}</div>
        <div style="
            background: linear-gradient(135deg,#2A2724,#161415);
            color: #F6F4F1;
            font-size: 8px; font-weight: 800;
            padding: 1px 6px; border-radius: 6px;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.12);
            line-height: 1.6;
        ">${kmStr} km</div>
    </div>`;
};

// 地圖容器尺寸變動（進/出滿版編輯）時，通知 Leaflet 重算尺寸，避免圖磚破圖/偏移。
const MapResizer = ({ trigger }) => {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 260);
        return () => clearTimeout(t);
    }, [trigger, map]);
    return null;
};

// 把地圖視角飛到指定的點位範圍（編輯既有路線時用，讓畫面跳到那條路徑所在地）
const MapFocus = ({ waypoints }) => {
    const map = useMap();
    const lastKeyRef = useRef('');
    useEffect(() => {
        if (!waypoints || waypoints.length === 0) return;
        // 以「點數 + 首尾座標」當 key，避免每次 render 都重飛；只有目標真的換了才飛。
        const first = waypoints[0], last = waypoints[waypoints.length - 1];
        const key = `${waypoints.length}:${first.lat.toFixed(5)},${first.lng.toFixed(5)}:${last.lat.toFixed(5)},${last.lng.toFixed(5)}`;
        if (key === lastKeyRef.current) return;
        lastKeyRef.current = key;
        try {
            if (waypoints.length === 1) {
                map.flyTo([first.lat, first.lng], 16, { duration: 0.8 });
            } else {
                const bounds = L.latLngBounds(waypoints.map(w => [w.lat, w.lng]));
                map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 0.8 });
            }
        } catch { /* ignore */ }
    }, [waypoints, map]);
    return null;
};

const MapClickHandler = ({ onMapClick, isCreating }) => {
    const onMapClickRef = useRef(onMapClick);
    useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
    const isCreatingRef = useRef(isCreating);
    useEffect(() => { isCreatingRef.current = isCreating; }, [isCreating]);
    useMapEvents({
        click: (e) => {
            if (isCreatingRef.current) {
                onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
            }
        }
    });
    return null;
};

// ─── Format helpers ─────────────────────────────────────────────────
const fmtPace = (sec) => {
    if (!sec || sec <= 0) return '--';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
};
const fmtTime = (sec) => {
    if (!sec || sec <= 0) return '--';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * SegmentExplorerMobile — titanium redesign
 */
const SegmentExplorerMobile = ({ onClose }) => {
    const [segments, setSegments] = useState([]);
    const [selectedSegment, setSelectedSegment] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newSegment, setNewSegment] = useState({ name: '', waypoints: [] });
    const [selectedHistoryRoute, setSelectedHistoryRoute] = useState(null);
    // 進入編輯時鎖定的「初始點集」— 只用來讓地圖飛到該路線一次，不隨後續加/退點而重飛。
    const [editFocusWaypoints, setEditFocusWaypoints] = useState(null);

    const containerRef = useRef(null);
    // 編輯既有路線時，記住「進入編輯前的原始狀態」，按取消可還原。
    const editOriginalRef = useRef(null);

    useEffect(() => {
        const handleDefault = () => {
            const defaultCoords = { lat: 25.033, lng: 121.565 };
            setUserLocation(defaultCoords);
            fetchNearbySegments(defaultCoords.lat, defaultCoords.lng);
        };

        // 🔧 改走原生橋接優先（iOS 打包版避免醜定位提示與失敗），取不到就用預設座標
        getOneShotLocation({ timeout: 3000 }).then((coords) => {
            if (coords) {
                setUserLocation(coords);
                fetchNearbySegments(coords.lat, coords.lng);
            } else {
                handleDefault();
            }
        });
    }, []);

    const fetchNearbySegments = async (lat, lng) => {
        try {
            setLoading(true);
            const response = await apiClient.get(`/api/segments/nearby?lat=${lat}&lng=${lng}&radius=10`);
            setSegments(response.data.segments || []);
        } catch (error) {
            console.error('Error fetching segments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSegment = async () => {
        if (!newSegment.name || newSegment.waypoints.length < 2) {
            toast.error('請輸入路段名稱並至少設置 2 個點位（點擊地圖添加）');
            return;
        }
        try {
            let totalDistance = 0;
            for (let i = 0; i < newSegment.waypoints.length - 1; i++) {
                totalDistance += calculateDistance(newSegment.waypoints[i], newSegment.waypoints[i + 1]);
            }
            const segmentData = {
                name: newSegment.name,
                waypoints: newSegment.waypoints,
                distance_meters: Math.round(totalDistance),
                elevation_gain: 0,
                difficulty_rating: 3,
                created_by_user_id: getUserId(),
            };
            let response;
            if (editingId) {
                response = await apiClient.put(`/api/segments/${editingId}`, segmentData);
                setSegments(segments.map(s => s.segment_id === editingId ? { ...s, ...response.data } : s));
                toast.success(`路段「${segmentData.name}」已更新`);
            } else {
                response = await apiClient.post('/api/segments/create', segmentData);
                setSegments([...segments, response.data]);
                toast.success(`路段「${response.data.name}」已建立`);
            }
            resetCreation();
        } catch (error) {
            console.error('Error saving segment:', error);
            toast.error('儲存失敗，請稍後再試');
        }
    };

    const handleDeleteSegment = async (e, segmentId) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await apiClient.delete(`/api/segments/${segmentId}`);
            setSegments(prev => prev.filter(s => s.segment_id !== segmentId));
            if (selectedSegment?.segment_id === segmentId) setSelectedSegment(null);
        } catch (error) {
            console.error("Error deleting segment:", error);
            setSegments(prev => prev.filter(s => s.segment_id !== segmentId));
        }
    };

    const handleEditClick = (e, segment) => {
        e.preventDefault();
        e.stopPropagation();
        // 記住原始狀態（深拷貝），取消時用它還原
        editOriginalRef.current = {
            name: segment.name,
            waypoints: JSON.parse(JSON.stringify(segment.waypoints || [])),
        };
        setNewSegment({ name: segment.name, waypoints: segment.waypoints || [] });
        setEditingId(segment.segment_id);
        setCreating(true);
        setSelectedSegment(segment);
        // 鎖定初始點集 → 讓地圖飛到這條路線所在地（之後加/退點不會重飛）
        setEditFocusWaypoints((segment.waypoints || []).map(w => ({ lat: w.lat, lng: w.lng })));
        if (containerRef.current) containerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    };

    // 完整關閉編輯／建立並清空
    const resetCreation = () => {
        setCreating(false);
        setEditingId(null);
        setNewSegment({ name: '', waypoints: [] });
        editOriginalRef.current = null;
        setEditFocusWaypoints(null);
    };

    // 取消：編輯既有路線 → 還原成編輯前的樣子並退出；新建路線 → 直接清空退出。
    // 取消：直接退出編輯，不寫入。伺服器上的既有路線維持原樣（只有按「更新路線」才會 PUT）。
    const handleCancel = () => {
        resetCreation();
    };

    const calculateDistance = (point1, point2) => {
        const R = 6371000;
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
        const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;
        const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // 返回上一步：移除最後一個點（一步一步往回退，含上次已儲存載入的點）
    const removeLastWaypoint = () => {
        setNewSegment(prev => ({ ...prev, waypoints: prev.waypoints.slice(0, -1) }));
    };

    const handleMapClick = useCallback((coords) => {
        setNewSegment(prev => ({ ...prev, waypoints: [...prev.waypoints, { lat: coords.lat, lng: coords.lng }] }));
    }, []);

    // ── Locating state ──
    if (!userLocation) {
        return (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center" style={{ backgroundColor: '#F6F4F1' }}>
                <div className="text-center">
                    <div className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center ti-surface ti-r-md">
                        <Navigation size={22} className="text-[#161415] animate-pulse" />
                    </div>
                    <p className="ti-kicker">定位中</p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            /* 地圖鋪滿整頁 —— 這一頁的主角是地圖，不是它上面的標題。
               整頁不捲動：要看的東西分成「地圖」與「底部抽屜」兩層。 */
            className="fixed inset-0 z-[60] overflow-hidden"
            style={{ backgroundColor: '#F6F4F1' }}
        >
            {/* ── 浮在地圖上的頁首 ──
                一頁一個標題、一句狀態就夠。原本是三層英文（kicker ＋ 兩行大標
                ＋ 「0 Routes Nearby」），佔掉第一屏一半、而且沒有一個字是中文。 */}
            <div
                className="absolute top-0 left-0 right-0 z-[1000] px-5 pb-4 flex items-start justify-between pointer-events-none"
                style={{
                    paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)',
                    background: 'linear-gradient(180deg, rgba(246,244,241,0.92) 40%, rgba(246,244,241,0))',
                }}
            >
                <div className="pointer-events-auto" style={{ minWidth: 0 }}>
                    <h2 className="ti-display" style={{ fontSize: 26, lineHeight: 1.1, margin: 0 }}>路線</h2>
                    <p className="text-[12px] font-bold mt-1" style={{ color: 'var(--ti-ink-soft)' }}>
                        {creating ? '點地圖放點，至少 2 個' : `附近 ${segments.length} 條`}
                    </p>
                </div>
                <motion.button {...pressProps('pill')} aria-label="關閉"
                    onClick={onClose}
                    className="pointer-events-auto w-11 h-11 ti-surface ti-r-md flex items-center justify-center text-[#161415] relative overflow-hidden flex-shrink-0"
                >
                    <span className="ti-sheen" />
                    <X size={20} className="relative z-10" />
                </motion.button>
            </div>


                {/* ── 地圖：永遠滿版 ──
                    以前只有「規劃中」才滿版，平常是一張正方形小卡 —— 要在那麼小的
                    地圖上點出一條路線幾乎不可能，使用者得先按下 ＋ 才有得操作。 */}
                <div className="absolute inset-0 z-0 overflow-hidden" style={{ background: '#E4DED2' }}>
                    <div className="w-full h-full overflow-hidden relative" style={{ background: '#E4DED2' }}>

                        {/* Creation / Edit controls — DRVN：Paper 面板 + 鈦金屬主鍵 + Coral 還原。
                            滿版時：面板貼底並加上安全區距離，避免被 home indicator 卡到。 */}
                        {creating && (
                            <div
                                className="absolute left-4 right-4 z-[1000] ti-surface ti-r-lg p-3 overflow-hidden"
                                style={{ bottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <span className="ti-sheen" />
                                <div className="flex items-center gap-2 mb-2.5 relative z-10">
                                    <input
                                        type="text"
                                        placeholder="命名路徑..."
                                        value={newSegment.name}
                                        onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
                                        className="flex-1 bg-white rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#161415] border border-[#CFC6B8] focus:outline-none focus:border-[#161415]"
                                        style={{ fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif' }}
                                    />
                                    {/* 目前在第幾步（= 已放的點數）*/}
                                    {/* 點數 ＋ 目前總長度：規劃路線時真正要看的是「這條多長」 */}
                                    <span className="ti-chip px-3 py-2 rounded-full whitespace-nowrap flex-shrink-0" style={{ letterSpacing: '0.04em' }}>
                                        {newSegment.waypoints.length} 點
                                        {newSegment.waypoints.length > 1 && (() => {
                                            const km = cumulativeKm(newSegment.waypoints).slice(-1)[0];
                                            return ` · ${km.toFixed(2)} km`;
                                        })()}
                                    </span>
                                </div>
                                <div className="flex gap-2 relative z-10">
                                    <motion.button {...pressProps('cta')}
 onClick={handleCreateSegment}
 disabled={!newSegment.name || newSegment.waypoints.length < 2}
 className="ti-btn-dark flex-1 py-3 rounded-xl text-[13px] disabled:opacity-40"
 style={{ letterSpacing: '0.08em', fontWeight: 800 }}
 >
                                        {editingId ? '更新路線' : '儲存路線'}
                                    </motion.button>
                                    {/* 返回上一步：一步一步往回退（含上次已儲存的點），珊瑚色強調 */}
                                    <motion.button {...pressProps('pill')}
 onClick={removeLastWaypoint}
 disabled={newSegment.waypoints.length === 0}
 title="返回上一步"
 className="flex items-center gap-1.5 px-3.5 rounded-xl justify-center disabled:opacity-40"
 style={{ background: 'rgba(217,64,48,0.12)', color: '#D94030', fontWeight: 800, fontSize: 12 }}
 >
                                        <Undo size={15} />
                                        返回
                                    </motion.button>
                                    <motion.button {...pressProps('pill')}
 onClick={handleCancel}
 className="ti-chip px-4 rounded-xl"
 style={{ letterSpacing: '0.04em', fontWeight: 800 }}
 >
                                        取消
                                    </motion.button>
                                </div>
                            </div>
                        )}

                        <MapContainer
                            center={[userLocation.lat, userLocation.lng]}
                            zoom={14}
                            scrollWheelZoom={true}
                            zoomControl={false}
                            className={`${mapThemeClass('light')} w-full h-full`}
                        >
                            <MapAutoResize />
                            <DrvnTileLayer style="minimal" />
                            <MapResizer trigger={creating} />
                            <MapClickHandler onMapClick={handleMapClick} isCreating={creating} />
                            {/* 編輯既有路線時，把畫面飛到那條路徑所在地（只在進入編輯的初始點集時飛一次）*/}
                            {editingId && <MapFocus waypoints={editFocusWaypoints} />}

                            {userLocation && (
                                <Marker
                                    position={[userLocation.lat, userLocation.lng]}
                                    icon={L.divIcon({
                                        className: '',
                                        html: '<div style="width:14px;height:14px;background:#F95C4B;border:3px solid #F6F4F1;border-radius:50%;box-shadow:0 0 0 4px rgba(249,92,75,0.2),0 4px 12px rgba(0,0,0,0.3);"></div>',
                                        iconSize: [14, 14],
                                        iconAnchor: [7, 7]
                                    })}
                                />
                            )}

                            {segments.map((seg, idx) => {
                                const waypoints = seg.waypoints || [];
                                if (waypoints.length < 2) return null;
                                // 正在編輯這條路線時，隱藏它的靜態圖層，只顯示下方可編輯的即時圖層
                                // （否則按「返回」只縮短編輯圖層，這條靜態線仍留在地圖上）。
                                if (editingId && seg.segment_id === editingId) return null;
                                const isSelected = selectedSegment?.segment_id === seg.segment_id;
                                return (
                                    <React.Fragment key={seg.segment_id}>
                                        <Polyline
                                            positions={waypoints.map(w => [w.lat, w.lng])}
                                            pathOptions={{
                                                color: isSelected ? '#161415' : '#F95C4B',
                                                weight: isSelected ? 6 : 4,
                                                opacity: isSelected ? 0.95 : 0.8
                                            }}
                                        />
                                        {isSelected ? (() => {
                                            const cumKm = cumulativeKm(waypoints);
                                            const totalKm = cumKm[cumKm.length - 1].toFixed(2);
                                            const center = centroid(waypoints);
                                            return [
                                                <Marker
                                                    key={`${seg.segment_id}-label`}
                                                    position={[center.lat, center.lng]}
                                                    zIndexOffset={500}
                                                    icon={L.divIcon({
                                                        className: '',
                                                        html: routeLabelHtml(seg.name || `Route ${idx + 1}`, totalKm),
                                                        iconSize: [200, 32],
                                                        iconAnchor: [100, 16]
                                                    })}
                                                />,
                                                ...waypoints.map((wp, wpIdx) => {
                                                    const isFirst = wpIdx === 0;
                                                    const isLast = wpIdx === waypoints.length - 1 && wpIdx > 0;
                                                    const kmStr = cumKm[wpIdx].toFixed(2);
                                                    const num = String(wpIdx + 1);
                                                    const chipH = isFirst || isLast ? 56 : 44;
                                                    return (
                                                        <Marker
                                                            key={`${seg.segment_id}-wp-${wpIdx}`}
                                                            position={[wp.lat, wp.lng]}
                                                            icon={L.divIcon({
                                                                className: '',
                                                                html: waypointChipHtml(num, kmStr, isFirst, isLast),
                                                                iconSize: [70, chipH],
                                                                iconAnchor: [35, isFirst || isLast ? 32 : 12]
                                                            })}
                                                        />
                                                    );
                                                })
                                            ];
                                        })() : (
                                            <Marker
                                                position={[waypoints[0].lat, waypoints[0].lng]}
                                                icon={L.divIcon({
                                                    className: '',
                                                    html: `<div style="
                                                        width:22px;height:22px;
                                                        background:linear-gradient(135deg,#2A2724,#161415);
                                                        border:2px solid #F6F4F1;border-radius:50%;
                                                        box-shadow:0 2px 6px rgba(0,0,0,0.4);
                                                        display:flex;align-items:center;justify-content:center;
                                                        color:#F6F4F1;font-weight:800;font-size:10px;
                                                    ">${idx + 1}</div>`,
                                                    iconSize: [22, 22],
                                                    iconAnchor: [11, 11]
                                                })}
                                            />
                                        )}
                                    </React.Fragment>
                                );
                            })}

                            {creating && newSegment.waypoints.length > 1 && (
                                <Polyline
                                    positions={newSegment.waypoints.map(w => [w.lat, w.lng])}
                                    pathOptions={{ color: '#161415', weight: 3, dashArray: '5, 5' }}
                                />
                            )}
                            {creating && (() => {
                                const wps = newSegment.waypoints;
                                const cumKm = cumulativeKm(wps);
                                return wps.map((wp, i) => {
                                    const isFirst = i === 0;
                                    const isLast = i === wps.length - 1 && i > 0;
                                    const kmStr = cumKm[i].toFixed(2);
                                    const num = String(i + 1);
                                    const chipH = isFirst || isLast ? 56 : 44;
                                    return (
                                        <Marker
                                            key={`wp-${i}`}
                                            position={[wp.lat, wp.lng]}
                                            interactive={false}
                                            icon={L.divIcon({
                                                className: '',
                                                html: waypointChipHtml(num, kmStr, isFirst, isLast),
                                                iconSize: [70, chipH],
                                                iconAnchor: [35, isFirst || isLast ? 32 : 12]
                                            })}
                                        />
                                    );
                                });
                            })()}
                        </MapContainer>
                    </div>
                </div>

                {/* ── 我的路線：浮在地圖底部的抽屜 ──
                    規劃中整個收起來，那時候整片地圖都要留給使用者點。 */}
                {!creating && (
                <div
                    className="absolute left-0 right-0 bottom-0 z-[600] px-4 pt-3 overflow-y-auto"
                    style={{
                        maxHeight: '46dvh',
                        paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 16px)',
                        background: 'linear-gradient(180deg, rgba(246,244,241,0) 0%, rgba(246,244,241,0.94) 14%, #F6F4F1 26%)',
                        borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    }}
                >
                    <div className="flex items-center gap-2.5 mb-3 sticky top-0" style={{ background: 'transparent' }}>
                        <TrendingUp size={15} style={{ color: 'var(--ti-ink-soft)' }} />
                        <span className="ti-display" style={{ fontSize: 17 }}>我的路線</span>
                        {segments.length > 0 && (
                            <span className="text-[12px] font-bold" style={{ color: 'var(--ti-ink-soft)' }}>{segments.length}</span>
                        )}
                        {/* 有字的鍵才知道按下去會發生什麼 —— 原本是地圖右上一顆裸的 ＋，
                            跟關閉鈕擠在一起，而且沒有人知道它會開什麼。 */}
                        <motion.button {...pressProps('pill')}
                            onClick={() => setCreating(true)}
                            className="ti-btn-dark ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full flex-shrink-0"
                            style={{ fontSize: 12.5, fontWeight: 800 }}
                        >
                            <Plus size={15} strokeWidth={2.6} />
                            規劃路線
                        </motion.button>
                    </div>

                <div className="grid grid-cols-1 gap-3.5">
                    {loading ? (
                        [0, 1].map(i => (
                            <div key={i} className="ti-skeleton ti-r-xl" style={{ height: 132 }} />
                        ))
                    ) : segments.length === 0 ? (
                        /* 沒資料就只顯示「去把資料補上」那一件事 ——
                           用一顆真的會開始規劃的按鈕，不是用小字教人去按右上角。 */
                        <motion.button {...pressProps('card')}
                            onClick={() => setCreating(true)}
                            className="ti-surface ti-r-xl py-9 w-full text-center relative overflow-hidden"
                        >
                            <span className="ti-sheen" />
                            <MapPin size={24} className="mx-auto mb-2.5 relative z-10" style={{ color: 'var(--ti-ink-faint)' }} />
                            <p className="text-[15px] font-bold relative z-10" style={{ color: 'var(--ti-ink)' }}>規劃第一條路線</p>
                        </motion.button>
                    ) : (
                        segments.map((seg, idx) => {
                            const segmentId = seg.segment_id || seg.id;
                            const isSelected = selectedSegment?.segment_id === segmentId;
                            return (
                                <motion.div
                                    key={segmentId || idx}
                                    layout
                                    onClick={() => { setSelectedSegment(seg); setSelectedHistoryRoute(seg); }}
                                    className="ti-surface ti-r-xl p-5 cursor-pointer transition-transform active:scale-[0.98] relative overflow-hidden"
                                    style={isSelected ? { boxShadow: '0 0 0 2px #161415, 0 14px 34px rgba(22,20,21,0.1)' } : {}}
                                >
                                    <span className="ti-sheen" />
                                    {/* Index badge */}
                                    <div className="absolute top-5 right-5 w-8 h-8 ti-surface-dark rounded-full flex items-center justify-center font-black text-[12px] text-[#F6F4F1] z-10">
                                        {idx + 1}
                                    </div>

                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="max-w-[58%]">
                                                <h3 className="ti-display text-lg leading-tight break-words" style={{ fontWeight: 600 }}>
                                                    {seg.name}
                                                </h3>
                                            </div>
                                            <div className="flex items-center gap-2 mr-10">
                                                <motion.button {...pressProps('icon')}
 onClick={(e) => { e.stopPropagation(); handleEditClick(e, seg); }}
 className="w-9 h-9 ti-surface-pale rounded-full flex items-center justify-center text-[#161415]"
 aria-label="Edit"
 >
                                                    <Edit2 size={15} />
                                                </motion.button>
                                                <motion.button {...pressProps('icon')}
 onClick={(e) => { e.stopPropagation(); handleDeleteSegment(e, segmentId); }}
 className="w-9 h-9 ti-surface-pale rounded-full flex items-center justify-center"
 style={{ color: '#D94030' }}
 aria-label="Delete"
 >
                                                    <Trash2 size={15} />
                                                </motion.button>
                                            </div>
                                        </div>

                                        {/* Metrics row */}
                                        <div className="flex gap-6 mt-5 pt-4" style={{ borderTop: '1px solid var(--ti-pebble)' }}>
                                            <div>
                                                <p className="ti-kicker mb-1">距離</p>
                                                <p className="ti-metric ti-mono text-[19px]">
                                                    {(seg.distance_meters / 1000).toFixed(2)}
                                                    <span className="text-[11px] ml-0.5" style={{ color: 'var(--ti-ink-faint)' }}>km</span>
                                                </p>
                                            </div>
                                            <div>
                                                <p className="ti-kicker mb-1">點數</p>
                                                <p className="ti-metric ti-mono text-[19px]">{seg.waypoints?.length || 0}</p>
                                            </div>
                                            <div>
                                                <p className="ti-kicker mb-1.5">難度</p>
                                                <div className="flex gap-1 mt-1.5">
                                                    {[...Array(5)].map((_, i) => (
                                                        <div
                                                            key={i}
                                                            className="w-1.5 h-1.5 rounded-full"
                                                            style={{ background: i < (seg.difficulty_rating || 3) ? '#161415' : 'var(--ti-pebble)' }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>
                </div>
                )}

            <AnimatePresence>
                {selectedHistoryRoute && (
                    <RouteHistoryModal
                        route={selectedHistoryRoute}
                        onClose={() => setSelectedHistoryRoute(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════════
   RouteHistoryModal — real PR data from cardio history
   PR is derived from /api/segments/{id}/personal-record, which scans
   the user's tagged cardio sessions. Falls back to an empty state
   when the user has never run this route.
   ════════════════════════════════════════════════════════════════ */
const RouteHistoryModal = ({ route, onClose }) => {
    const [pr, setPr] = useState(null);     // { has_record, attempts, best_pace_sec, best_time_sec, best_effort_score }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!route) return;
        let cancelled = false;
        const segmentId = route.segment_id || route.id;
        setLoading(true);
        setError(false);
        (async () => {
            try {
                const userId = getUserId();
                const res = await apiClient.get(
                    `/api/segments/${segmentId}/personal-record?user_id=${encodeURIComponent(userId)}`
                );
                if (!cancelled) setPr(res.data);
            } catch (e) {
                console.error('Error fetching segment PR:', e);
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [route]);

    if (!route) return null;

    const hasRecord = pr?.has_record;
    const attempts = pr?.attempts || 0;
    const distanceKm = (route.distance_meters / 1000).toFixed(2);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
            style={{ background: 'rgba(22,20,21,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 24, scale: 0.96 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 24, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="w-full max-w-sm ti-surface ti-r-xl p-6 relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <span className="ti-sheen" />

                {/* Close */}
                <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-4 right-4 w-9 h-9 ti-surface-pale rounded-full flex items-center justify-center text-[#161415] z-20"
 >
                    <X size={17} />
                </motion.button>

                {/* Header */}
                <div className="mb-6 pr-10 relative z-10">
                    <p className="ti-kicker mb-1.5">路線紀錄</p>
                    <h3 className="ti-display text-[26px]" style={{ fontWeight: 600 }}>
                        {route.name || '自訂路線'}
                    </h3>
                    <div className="flex items-center gap-3 mt-3 text-[12px] font-bold" style={{ color: 'var(--ti-ink-soft)' }}>
                        <span className="flex items-center gap-1.5">
                            <MapPin size={13} /> {distanceKm} km
                        </span>
                        <span className="w-1 h-1 rounded-full" style={{ background: 'var(--ti-pebble)' }} />
                        <span className="flex items-center gap-1.5">
                            <TrendingUp size={13} />
                            {loading ? '—' : `${attempts} 次挑戰`}
                        </span>
                    </div>
                </div>

                {/* ── PR body ── */}
                <div className="relative z-10">
                    {loading ? (
                        <div className="flex flex-col gap-3">
                            <div className="ti-skeleton ti-r-md" style={{ height: 76 }} />
                            <div className="flex gap-3">
                                <div className="ti-skeleton ti-r-md flex-1" style={{ height: 96 }} />
                                <div className="ti-skeleton ti-r-md flex-1" style={{ height: 96 }} />
                            </div>
                        </div>
                    ) : error ? (
                        <div className="ti-surface-pale ti-r-md py-8 text-center">
                            <p className="text-sm font-bold" style={{ color: 'var(--ti-ink-soft)' }}>無法載入紀錄</p>
                        </div>
                    ) : !hasRecord ? (
                        <div className="ti-surface-pale ti-r-md py-9 px-5 text-center">
                            <Crown size={24} className="mx-auto mb-3" style={{ color: 'var(--ti-ink-faint)' }} />
                            <p className="text-sm font-bold" style={{ color: 'var(--ti-ink)' }}>尚無個人紀錄</p>
                            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--ti-ink-soft)' }}>
                                跑步時選擇這條路徑，<br />完成後就會自動建立你的 PR。
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {/* Best pace — hero metric */}
                            <div className="ti-surface-coral ti-r-md p-4 flex items-center justify-between relative overflow-hidden">
                                <span className="ti-sheen ti-sheen-dark" />
                                <div className="flex items-center gap-3.5 relative z-10">
                                    <div className="w-11 h-11 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(255,255,255,0.2)' }}>
                                        <Crown size={20} strokeWidth={2.4} className="text-white" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-black tracking-[0.04em] text-white/70">最佳配速</p>
                                        <p className="ti-mono text-2xl font-bold text-white leading-none mt-1">
                                            {fmtPace(pr.best_pace_sec)}
                                            <span className="text-[11px] font-medium opacity-70 ml-1">/km</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Fastest time + Effort score */}
                            <div className="flex gap-3">
                                <div className="ti-surface-pale ti-r-md p-4 flex-1 flex flex-col items-center text-center relative overflow-hidden">
                                    <span className="ti-sheen" />
                                    <Timer size={17} className="mb-2 relative z-10" style={{ color: 'var(--ti-ink-faint)' }} />
                                    <p className="ti-kicker mb-1.5 relative z-10">最快完成</p>
                                    <p className="ti-mono text-xl font-bold relative z-10" style={{ color: 'var(--ti-ink)' }}>
                                        {fmtTime(pr.best_time_sec)}
                                    </p>
                                </div>
                                <div className="ti-surface-pale ti-r-md p-4 flex-1 flex flex-col items-center text-center relative overflow-hidden">
                                    <span className="ti-sheen" />
                                    <Zap size={17} className="mb-2 relative z-10" style={{ color: '#F95C4B' }} />
                                    <p className="ti-kicker mb-1.5 relative z-10">最高耗力分數</p>
                                    <p className="ti-mono text-xl font-bold relative z-10" style={{ color: 'var(--ti-ink)' }}>
                                        {pr.best_effort_score != null ? Math.round(pr.best_effort_score) : '--'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* CTA */}
                <motion.button {...pressProps('cta')}
 onClick={onClose}
 className="ti-btn-primary w-full mt-6 py-3.5 rounded-[18px] text-xs relative z-10"
 >
                    跑這條路線
                </motion.button>
            </motion.div>
        </motion.div>
    );
};

export default SegmentExplorerMobile;
