import React, { useState, useEffect, useMemo, useRef } from 'react';
import { mapThemeClass, getMapStyle } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import MapAutoResize from './MapAutoResize';
import { MapContainer, TileLayer, Polyline, Marker, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Map as MapIcon, Target } from 'lucide-react';
import EffortExplanationModal from './EffortExplanationModal';

// 🔥 Google Fonts for dashboard numbers
const FontImport = () => (
    <style>{`
        
        
        @keyframes shimmer-text {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
    `}</style>
);

// --- Haptic Bridge ---
const triggerNativeHaptic = (style = 'medium') => {
    if (window.webkit?.messageHandlers?.fitnessApp) {
        window.webkit.messageHandlers.fitnessApp.postMessage({ type: 'haptic', style });
    }
};

// --- 0. Waypoint helpers (shared with SegmentExplorer) ---
const haversineM = (a, b) => {
    const R = 6371000;
    const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const cumulativeKm = (wps) => {
    let t = 0;
    return wps.map((wp, i) => { if (i === 0) return 0; t += haversineM(wps[i - 1], wp) / 1000; return t; });
};
const waypointChipHtml = (num, kmStr, isStart, isEnd) => {
    const ring  = isStart ? '#22C55E' : isEnd ? '#EF4444' : '#161415';
    const badge = isStart
        ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);background:#22C55E;color:white;font-size:6px;font-weight:900;padding:1px 4px;border-radius:4px;white-space:nowrap;">起點</div>`
        : isEnd
        ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:6px;font-weight:900;padding:1px 4px;border-radius:4px;white-space:nowrap;">FINISH</div>`
        : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;position:relative;">
        ${badge}
        <div style="background:${ring};border:2.5px solid white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:10px;box-shadow:0 2px 8px rgba(0,0,0,0.45);margin-top:${isStart||isEnd?'8px':'0'};">${num}</div>
        <div style="background:rgba(22,20,21,0.85);color:white;font-size:8px;font-weight:800;padding:1px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);line-height:1.6;">${kmStr} km</div>
    </div>`;
};

// Centroid of a waypoints array — used for placing the route name label
// NaN-safe：先過濾掉無效座標，全部無效時回傳 null（呼叫端需判斷）
const centroid = (wps) => {
    const valid = (wps || [])
        .map(w => [Number(w?.lat), Number(w?.lng)])
        .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
    if (valid.length === 0) return null;
    return {
        lat: valid.reduce((s, [la]) => s + la, 0) / valid.length,
        lng: valid.reduce((s, [, ln]) => s + ln, 0) / valid.length,
    };
};

// Route name + total distance pill shown at centroid
const routeLabelHtml = (name, totalKm) => `
    <div style="
        background: rgba(22,20,21,0.92);
        color: white;
        padding: 6px 12px;
        border-radius: 18px;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.15);
        white-space: nowrap;
        pointer-events: none;
    ">
        <span style="color:#F95C4B;font-size:12px;line-height:1;">●</span>
        <span style="font-size:11px;font-weight:900;letter-spacing:0.01em;">${name}</span>
        <span style="width:1px;height:12px;background:rgba(255,255,255,0.2);"></span>
        <span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);">${totalKm} km</span>
    </div>
`;

// --- 0b. FlyToBounds: pans map to fit a set of lat/lng points ---
const FlyToBounds = ({ waypoints }) => {
    const map = useMap();
    useEffect(() => {
        if (!waypoints || waypoints.length === 0) return;
        // Bug fix: 過濾 NaN/undefined，否則 L.latLngBounds 會拋 (NaN, NaN) error
        const cleanPoints = waypoints
            .map(w => [Number(w?.lat), Number(w?.lng)])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        if (cleanPoints.length === 0) return;
        try {
            const container = map?.getContainer?.();
            if (!container || !container.isConnected) return;
            const bounds = L.latLngBounds(cleanPoints);
            if (bounds.isValid()) {
                map.flyToBounds(bounds, { padding: [60, 60], duration: 1.0, maxZoom: 16 });
            }
        } catch (e) {
            console.warn('[RouteMap] flyToBounds skipped:', e?.message);
        }
    }, [waypoints, map]);
    return null;
};

// --- 1. 計算方位角 ---
const calculateBearing = (start, end) => {
    if (!start || !end) return 0;
    const startLat = (start.lat * Math.PI) / 180;
    const startLng = (start.lng * Math.PI) / 180;
    const endLat = (end.lat * Math.PI) / 180;
    const endLng = (end.lng * Math.PI) / 180;
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
        Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

// --- 2. 耗力與體力配置 ---
const getZoneConfig = (currentPace, avgPace) => {
    if (!currentPace || !avgPace || currentPace > 3600) return { label: '熱身區', color: '#CCD5AE', speed: 4, glow: '0px' };
    const ratio = currentPace / avgPace;
    if (ratio > 1.2) return { label: '熱身區', color: '#D0D9B8', speed: 4, glow: '0px' };
    if (ratio >= 0.9) return { label: '燃脂區', color: '#EACC6E', speed: 1.5, glow: '15px' };
    if (ratio >= 0.8) return { label: '有氧區', color: '#EAA063', speed: 1.0, glow: '10px' };
    if (ratio >= 0.7) return { label: '無氧區', color: '#DE7758', speed: 0.7, glow: '20px' };
    return { label: '極限區', color: '#CE3830', speed: 0.4, glow: '30px' };
};
// --- 3. 絲滑地圖追蹤 (核心修正：全事件監聽) ---
const SmoothMapUpdater = ({ center, isFollowing, setIsFollowing }) => {
    const map = useMap();
    const didInitialZoomRef = useRef(false);

    useEffect(() => {
        // 只要使用者觸摸、點擊或開始移動地圖，就立刻切換為手動模式
        const disableFollow = () => {
            if (isFollowing) {
                console.log("偵測到地圖互動，停止自動追蹤");
                setIsFollowing(false);
            }
        };

        // 監聽地圖上的所有互動事件 (包含點擊標記、縮放、以及任何由使用者引起的移動)
        map.on('movestart', disableFollow);
        map.on('dragstart', disableFollow);
        map.on('mousedown', disableFollow);
        map.on('touchstart', disableFollow);
        map.on('zoomstart', disableFollow);

        // ✅ 為地圖預設縮放按鈕加上震動回饋
        const zoomInBtn = document.querySelector('.leaflet-control-zoom-in');
        const zoomOutBtn = document.querySelector('.leaflet-control-zoom-out');
        const handleZoomHaptic = () => {
            if (typeof triggerNativeHaptic === 'function') {
                triggerNativeHaptic('light');
            }
        };
        if (zoomInBtn) zoomInBtn.addEventListener('click', handleZoomHaptic);
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', handleZoomHaptic);

        return () => {
            map.off('movestart', disableFollow);
            map.off('dragstart', disableFollow);
            map.off('mousedown', disableFollow);
            map.off('touchstart', disableFollow);
            map.off('zoomstart', disableFollow);
            if (zoomInBtn) zoomInBtn.removeEventListener('click', handleZoomHaptic);
            if (zoomOutBtn) zoomOutBtn.removeEventListener('click', handleZoomHaptic);
        };
    }, [map, isFollowing, setIsFollowing]);

    useEffect(() => {
        const observer = new ResizeObserver(() => {
            map.invalidateSize();
        });
        const container = map.getContainer();
        if (container) observer.observe(container);
        return () => observer.disconnect();
    }, [map]);

    const prevIsFollowingRef = useRef(isFollowing);
    useEffect(() => {
        // Bug fix: sanitize lat/lng — NaN/undefined 直接跳過，否則 L.LatLng 拋 (NaN, NaN)
        // center 可能是 {lat,lng} 物件或 [lat,lng] 陣列，兩種都要支援
        const lat = Number(Array.isArray(center) ? center[0] : center?.lat);
        const lng = Number(Array.isArray(center) ? center[1] : center?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        // 🛡 地圖容器在返回導航重掛載時可能尚未就緒；用 try/catch + 容器檢查避免
        //    flyTo 在已銷毀的地圖上計算出 (NaN, NaN) 而導致白屏。
        const safeFlyTo = (targetLat, targetLng, zoom, duration) => {
            try {
                const container = map?.getContainer?.();
                if (!container || !container.isConnected) return;
                const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 16;
                map.flyTo([targetLat, targetLng], safeZoom, { animate: true, duration });
            } catch (e) {
                // flyTo 期間地圖被卸載屬正常情況，靜默忽略避免 crash
                console.warn('[RouteMap] flyTo skipped:', e?.message);
            }
        };

        // 📍 First valid GPS fix — flyTo with zoom 17 (street-level)
        if (!didInitialZoomRef.current) {
            didInitialZoomRef.current = true;
            safeFlyTo(lat, lng, 17, 0.8);
            prevIsFollowingRef.current = isFollowing;
            return;
        }

        if (isFollowing) {
            const justEnabled = !prevIsFollowingRef.current && isFollowing;
            const currentZoom = map?.getZoom?.();
            const targetZoom = justEnabled ? 17 : (Number.isFinite(Number(currentZoom)) ? currentZoom : 16);
            safeFlyTo(lat, lng, targetZoom, justEnabled ? 0.8 : 0.5);
        }
        prevIsFollowingRef.current = isFollowing;
    }, [center, map, isFollowing]);

    return null;
};

// --- Native Bridge Integration Hook ---
const useNativeMapSync = ({ route, currentPosition, metrics, targetSegments, interactive }) => {
    useEffect(() => {
        if (!window.webkit?.messageHandlers?.fitnessApp) return;

        // Initial Show Map - DISABLED for inline map preference
        // const routeCoords = route.map(p => ({ lat: p.lat, lng: p.lng }));
        // window.webkit.messageHandlers.fitnessApp.postMessage({
        //     type: 'showMap',
        //     title: 'Cardio Tracker',
        //     center: currentPosition || { lat: 25.033, lng: 121.565 },
        //     zoom: 16,
        //     route: routeCoords,
        //     currentPosition: currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null
        // });

        // Hide map on unmount
        return () => {
            // window.webkit.messageHandlers.fitnessApp.postMessage({ type: 'hideMap' });
        };
    }, []); // Only run once on mount? Or when?

    // Update route dynamically
    useEffect(() => {
        if (!window.webkit?.messageHandlers?.fitnessApp) return;

        const routeCoords = route.map(p => ({ lat: p.lat, lng: p.lng }));
        window.webkit.messageHandlers.fitnessApp.postMessage({
            type: 'updateMapRoute',
            route: routeCoords,
            currentPosition: currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null
        });
    }, [route, currentPosition]);
};



const hexToRgba = (hex, alpha) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const RouteMap = ({
    route = [],
    currentPosition = null,
    targetSegments = [],
    focusWaypoints = null,  // when set, map flies to fit these waypoints
    className = '',
    metrics = { distance: 0, calories: 0, currentPace: 0, duration: 0, avgPace: 330, score: 0 },
    targetScore = null,
    targetType = null,
    splits = [],
    mapOnly = false,
    hideStats = false,
    interactive = true,
    isFollowing = true, // Received from parent
    setIsFollowing,     // Received from parent
    mapStyle = 'minimal',
    /** Hex colour for the position marker + cone (driven by current HR zone). */
    zoneColor = null,
}) => {
    const [showEffortGuide, setShowEffortGuide] = useState(false);

    // 🧭 Device heading — drives the orientation of the cone like Google Maps.
    //    Source priority:
    //      (1) iOS native CoreLocation heading via `native-location` event
    //      (2) Web DeviceOrientation API (compass)
    //      (3) Fallback: bearing between last two GPS points
    const [deviceHeading, setDeviceHeading] = useState(null);
    useEffect(() => {
        // Listen for native CoreLocation course/heading
        const onNativeLoc = (e) => {
            const d = e?.detail || {};
            // CoreLocation `course` is the direction in which device is travelling.
            // -1 means "not moving" — fall back to compass heading in that case.
            if (typeof d.heading === 'number' && d.heading >= 0) {
                setDeviceHeading(d.heading);
            } else if (typeof d.course === 'number' && d.course >= 0) {
                setDeviceHeading(d.course);
            }
        };
        window.addEventListener('native-location', onNativeLoc);

        // DeviceOrientation (browser compass)
        const onOrient = (ev) => {
            // iOS Safari exposes webkitCompassHeading (true bearing, 0=N, clockwise).
            // Other browsers give `alpha` (counter-clockwise from north → invert).
            let h = null;
            if (typeof ev.webkitCompassHeading === 'number') {
                h = ev.webkitCompassHeading;
            } else if (typeof ev.alpha === 'number') {
                h = (360 - ev.alpha) % 360;
            }
            if (h != null && !Number.isNaN(h)) setDeviceHeading(h);
        };

        // iOS 13+ requires explicit permission（且必須在使用者手勢中呼叫 requestPermission）。
        const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
            && typeof DeviceOrientationEvent.requestPermission === 'function';

        const attachOrientation = () => {
            try {
                if (needsPermission) {
                    DeviceOrientationEvent.requestPermission()
                        .then(state => {
                            if (state === 'granted') {
                                window.addEventListener('deviceorientation', onOrient, true);
                            } else {
                                // 被拒：通知父層顯示輕提示（去設定開羅盤），不靜默吞掉
                                window.dispatchEvent(new CustomEvent('compass-permission', { detail: { state } }));
                            }
                        })
                        .catch(() => {
                            window.dispatchEvent(new CustomEvent('compass-permission', { detail: { state: 'error' } }));
                        });
                } else {
                    // 非 iOS / 不需權限：直接掛載
                    window.addEventListener('deviceorientation', onOrient, true);
                }
            } catch (_) {}
        };

        // 🧭 授權改由「定位準星鈕」這個明確動作觸發（語意清楚、成功率高），
        //    不再被進畫面後任意一次點擊消耗掉。父層點準星鈕 → dispatch 'request-compass'。
        const onRequestCompass = () => attachOrientation();
        window.addEventListener('request-compass', onRequestCompass);

        // 不需權限的瀏覽器（Android / 桌機）仍立即掛載，確保有羅盤就會動
        if (!needsPermission) attachOrientation();

        return () => {
            window.removeEventListener('native-location', onNativeLoc);
            window.removeEventListener('deviceorientation', onOrient, true);
            window.removeEventListener('request-compass', onRequestCompass);
        };
    }, []);

    // Sync with Native Map
    // Sync with Native Map - DISABLED as per user request
    // useNativeMapSync({ route, currentPosition, metrics, targetSegments, interactive });
    const isNative = typeof window !== 'undefined' && window.webkit?.messageHandlers?.fitnessApp;

    // 🇹🇼 Taipei Popular Running Spots (REMOVED as per user request to clean up the map)
    const taipeiSpots = [];

    // 🧭 Heading priority — device compass > bearing-between-last-2-pts > 0
    const bearingHeading = useMemo(() => {
        if (route.length < 2) return null;
        return calculateBearing(route[route.length - 2], route[route.length - 1]);
    }, [route]);
    const heading = useMemo(() => {
        if (deviceHeading != null && !Number.isNaN(deviceHeading)) return deviceHeading;
        if (bearingHeading != null) return bearingHeading;
        return 0;
    }, [deviceHeading, bearingHeading]);

    // Zone colour priority — explicit prop (HR-driven) > pace-derived fallback
    const zone = useMemo(() => {
        const avg = metrics.avgPace > 0 ? metrics.avgPace : 330;
        const fallback = getZoneConfig(metrics.currentPace, avg);
        if (zoneColor) {
            return { ...fallback, color: zoneColor, glow: '14px' };
        }
        return fallback;
    }, [metrics.currentPace, metrics.avgPace, zoneColor]);

    const stats = useMemo(() => {
        return {
            score: Math.round(metrics.score || 0),
            dist: (metrics.distance || 0).toFixed(2),
        };
    }, [metrics.score, metrics.distance]);

    // 🧭 Google-Maps 風格定位指標：恆顯方向扇形光束 + zone 色實心點，隨手機朝向旋轉
    const beamColor = zone.color || '#4285F4';      // zone 色（fallback Google 藍）
    /* 深底與否由樣式自己宣告（utils/mapTiles），不要在這裡再列一次樣式清單 ——
       列兩份的話新增一個深色樣式時一定會漏掉其中一邊。 */
    const styleDef = getMapStyle(mapStyle);
    const isDarkBase = styleDef.dark;
    const ringColor = isDarkBase ? '#0E1216' : '#FFFFFF';  // 外白圈（深底地圖用深底）
    const gid = beamColor.replace('#', '');
    const googleBeamIcon = L.divIcon({
        className: '',
        html: `
            <div style="position: relative; width: 110px; height: 110px; transform: rotate(${heading}deg); transform-origin: center; transition: transform 200ms ease-out; display: flex; align-items: center; justify-content: center;">
                <!-- 方向扇形光束（永遠顯示，朝正上方 = heading 方向） -->
                <svg viewBox="0 0 110 110" style="position: absolute; bottom: 50%; width: 88px; height: 88px; overflow: visible;">
                    <defs>
                        <radialGradient id="beam-${gid}" cx="50%" cy="100%" r="78%">
                            <stop offset="0%" stop-color="${beamColor}" stop-opacity="0.42"/>
                            <stop offset="55%" stop-color="${beamColor}" stop-opacity="0.16"/>
                            <stop offset="100%" stop-color="${beamColor}" stop-opacity="0"/>
                        </radialGradient>
                    </defs>
                    <!-- 從中心點往上散開的扇形（約 70°） -->
                    <path d="M55,110 L24,24 Q55,2 86,24 Z" fill="url(#beam-${gid})" />
                </svg>
                <!-- 中央定位點：zone 色實心 + 白圈 + 投影 -->
                <div style="
                    width: 18px; height: 18px; border-radius: 50%;
                    background: ${beamColor};
                    border: 3px solid ${ringColor};
                    box-shadow: 0 1px 4px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.06);
                    transition: background 350ms ease-out;
                    z-index: 10;
                "></div>
            </div>
        `,
        iconSize: [110, 110], iconAnchor: [55, 55]
    });

    // Goal Logic (With NaN Fix)
    const progressPercent = useMemo(() => {
        if (!targetScore || targetScore <= 0) return 0;
        return Math.min(Math.round((stats.score / Number(targetScore)) * 100), 100);
    }, [stats.score, targetScore]);

    // Original "Rich" Visual Logic
    const isGoalReached = targetScore && stats.score >= targetScore;
    const isChallengeMode = targetType === 'challenge';

    return (
        <div className={`flex flex-col w-full ${className} font-sans`}>
            <FontImport />
            <style>{`
                .leaflet-top.leaflet-left {
                    margin-top: 40px; /* Shift zoom buttons down */
                    margin-left: 18px; /* 與返回鈕左邊緣對齊 */
                }
                .leaflet-control-zoom {
                    border: none !important;
                    box-shadow: none !important;
                    background: transparent !important;
                }
                /* 🔘 縮放鍵 — 收斂成與返回鈕/RV 浮球一致的深 Stone 玻璃語言（四角統一），
                   並收合成一顆「膠囊」（+ 在上、− 在下，中間一條分隔線），減少零散圓鈕的雜亂感。 */
                .leaflet-bar.leaflet-control-zoom {
                    border: none !important;
                    box-shadow: 0 8px 22px -8px rgba(41,37,36,0.32) !important;
                    /* 真 · 液態玻璃：低 alpha 透出地圖（與返回鈕一致） */
                    background: linear-gradient(135deg, rgba(120,113,108,0.30) 0%, rgba(87,83,78,0.34) 55%, rgba(68,64,60,0.40) 100%) !important;
                    -webkit-backdrop-filter: blur(20px) saturate(1.9) !important;
                    backdrop-filter: blur(20px) saturate(1.9) !important;
                    border-radius: 24px !important;
                    overflow: hidden !important;
                    /* 清掉容器自身的 padding / line-height，避免膠囊底部多出一截空白讓「−」沒貼底 */
                    padding: 0 !important;
                    margin: 0 !important;
                    line-height: 0 !important;
                    font-size: 0 !important;
                    border-top: 1.5px solid rgba(245,242,238,0.7) !important;
                    border-left: 1px solid rgba(231,226,220,0.45) !important;
                    border-right: 1px solid rgba(60,56,52,0.25) !important;
                    border-bottom: 1px solid rgba(41,37,36,0.30) !important;
                }
                .leaflet-bar.leaflet-control-zoom a.leaflet-control-zoom-in,
                .leaflet-bar.leaflet-control-zoom a.leaflet-control-zoom-out {
                    background: transparent !important;
                    color: #F6F4F1 !important;
                    border: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 44px !important;
                    height: 44px !important;
                    /* 用 flex 置中字符，兩顆無縫貼齊填滿膠囊（消除預設 line-height 造成的縫隙） */
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    line-height: 1 !important;
                    font-size: 22px !important;
                    transition: transform 0.12s ease, background 0.2s ease !important;
                }
                .leaflet-bar.leaflet-control-zoom a.leaflet-control-zoom-in {
                    border-bottom: 1px solid rgba(245,242,238,0.2) !important;
                    border-radius: 0 !important;
                }
                .leaflet-bar.leaflet-control-zoom a.leaflet-control-zoom-out {
                    border-radius: 0 !important;
                }
                .leaflet-bar.leaflet-control-zoom a:active {
                    transform: scale(0.9) !important;
                }
                .leaflet-bar.leaflet-control-zoom a:hover {
                    background: rgba(255,255,255,0.10) !important;
                }
            `}</style>
            {/* 1. Map Section */}
            {/* 深色模式時給地圖一個深色底，避免半透明深色磚塊被底下淺色 App 背景透出而泛白 */}
            <div className={mapOnly ? "w-full h-full relative" : "w-full h-[230px] rounded-[28px] overflow-hidden relative mb-4 border border-white/10 shadow-2xl"} style={{ backgroundColor: isDarkBase ? '#0E1216' : 'transparent' }}>



                {/* ... Map Content ... */}
                {/* ⚠️ 移除預設台北中心 — 改用 currentPosition / route[0] / 全球安全 fallback。
                    這樣不會在使用者一開啟就被「定位到台北 101」誤導，等 GPS 真實
                    座標進來後 SmoothMapUpdater 會 panTo 過去。 */}
                <MapContainer
                    center={(() => {
                        // Bug fix: 完整 sanitize — NaN/undefined 一律 fallback 到世界視圖
                        const cLat = Number(currentPosition?.lat);
                        const cLng = Number(currentPosition?.lng);
                        if (Number.isFinite(cLat) && Number.isFinite(cLng)) return [cLat, cLng];
                        const rLat = Number(route?.[0]?.lat);
                        const rLng = Number(route?.[0]?.lng);
                        if (Number.isFinite(rLat) && Number.isFinite(rLng)) return [rLat, rLng];
                        return [0, 0];
                    })()}
                    zoom={(() => {
                        const cLat = Number(currentPosition?.lat);
                        const rLat = Number(route?.[0]?.lat);
                        if (Number.isFinite(cLat)) return 17;
                        if (Number.isFinite(rLat)) return 17;
                        return 2;
                    })()}
                    scrollWheelZoom={interactive}
                    dragging={interactive}
                    zoomControl={false}
                    doubleClickZoom={interactive}
                    touchZoom={interactive}
                    boxZoom={interactive}
                    keyboard={interactive}
                    /* ⚠️ 這裡以前有兩個 className：上面一個帶地圖主題、下面一個帶版面。
                       JSX 只留後面那個，所以地圖主題那整條 CSS 從來沒生效過 ——
                       不會壞、不會報錯，只是那個功能安靜地不存在。併成一個，
                       而且深淺直接跟著 mapStyle 走（衛星與 dark 都算深底）。 */
                    className={`${mapThemeClass(isDarkBase ? 'dark' : 'light')} w-full h-full z-10`}
                    style={{ backgroundColor: isDarkBase ? '#0E1216' : 'transparent' }}
                >
                    {/* 衛星以前在這裡自己寫一個 <TileLayer>，等於同一件事有兩份定義：
                        它沒有 maxNativeZoom、沒有 detectRetina、也沒有載不到時的退路。
                        現在四種樣式一律走 DrvnTileLayer，設定只有 utils/mapTiles 一份。
                        ⚠️ key 一定要帶 mapStyle：換樣式時要重建，退路狀態才會歸零。 */}
                    <DrvnTileLayer key={mapStyle} style={mapStyle} />
                    {/* 容器尺寸一變就重算 —— 每一種底圖都要，所以掛在外層 */}
                    <MapAutoResize />
                    <ZoomControl position="topleft" />

                    {/* 傳入控制狀態 */}
                    <SmoothMapUpdater
                        center={currentPosition}
                        isFollowing={isFollowing}
                        setIsFollowing={setIsFollowing}
                    />
                    {/* 選取路徑時自動飛到路徑範圍 */}
                    {focusWaypoints && <FlyToBounds waypoints={focusWaypoints} />}

                    {/* Bug fix: 所有 Polyline / Marker position 都過濾 NaN */}
                    {targetSegments.map((segment, i) => {
                        const clean = (segment.waypoints || [])
                            .map(w => [Number(w?.lat), Number(w?.lng)])
                            .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
                        if (clean.length === 0) return null;
                        /* 白色描邊墊在底下 —— 底圖是全彩的 OSM，主要道路本身就是
                           橘紅色系，沒有描邊的話路線會跟馬路糊在一起。
                           ⚠️ 描邊一定要先畫：Leaflet 照 DOM 順序疊，反過來會蓋住路線。 */
                        return (
                            <React.Fragment key={`segment-${segment.segment_id || i}`}>
                                <Polyline
                                    positions={clean}
                                    pathOptions={{ color: '#FFFFFF', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                                />
                                <Polyline
                                    positions={clean}
                                    pathOptions={{ color: '#F95C4B', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                                />
                            </React.Fragment>
                        );
                    })}
                    {(() => {
                        const clean = (route || [])
                            .map(p => [Number(p?.lat), Number(p?.lng)])
                            .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
                        if (clean.length === 0) return null;
                        // 同上：白描邊在下、實際軌跡在上
                        return (
                            <>
                                <Polyline
                                    positions={clean}
                                    pathOptions={{ color: '#FFFFFF', weight: 11, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                                />
                                <Polyline
                                    positions={clean}
                                    pathOptions={{ color: '#FF4500', weight: 7, lineCap: 'round', lineJoin: 'round' }}
                                />
                            </>
                        );
                    })()}
                    {(() => {
                        const lat = Number(currentPosition?.lat);
                        const lng = Number(currentPosition?.lng);
                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                        return (
                        <Marker
                            key={`me-${Math.round(heading / 2) * 2}-${zone.color}`}
                            position={[lat, lng]}
                            icon={googleBeamIcon}
                            zIndexOffset={2000}
                            eventHandlers={{
                                mousedown: (e) => {
                                    if (setIsFollowing) setIsFollowing(false);
                                    L.DomEvent.stopPropagation(e);
                                },
                                dragstart: () => { if (setIsFollowing) setIsFollowing(false); },
                                click: () => { if (setIsFollowing) setIsFollowing(false); }
                            }}
                        />
                        );
                    })()}

                    {/* Render waypoint order chips + route name label for each target segment */}
                    {targetSegments.map((segment) => {
                        const wps = segment.waypoints || [];
                        if (wps.length === 0) return null;
                        const cumKm    = cumulativeKm(wps);
                        const totalKm  = cumKm[cumKm.length - 1].toFixed(2);
                        const center   = centroid(wps);
                        const segName  = segment.name || `Route ${segment.segment_id || ''}`;
                        // 全部座標都無效時直接跳過，避免 (NaN, NaN) 拋錯
                        if (!center) return null;

                        return (
                            <React.Fragment key={`seg-group-${segment.segment_id || 0}`}>
                                {/* ── Route name + total distance label at centroid ── */}
                                <Marker
                                    position={[center.lat, center.lng]}
                                    zIndexOffset={500}
                                    icon={L.divIcon({
                                        className: '',
                                        html: routeLabelHtml(segName, totalKm),
                                        iconSize: [200, 32],
                                        iconAnchor: [100, 16]
                                    })}
                                />

                                {/* ── Numbered waypoint chips ── */}
                                {wps.map((wp, wpIdx) => {
                                    const wLat = Number(wp?.lat);
                                    const wLng = Number(wp?.lng);
                                    if (!Number.isFinite(wLat) || !Number.isFinite(wLng)) return null;
                                    const isFirst = wpIdx === 0;
                                    const isLast  = wpIdx === wps.length - 1 && wpIdx > 0;
                                    const kmStr   = cumKm[wpIdx].toFixed(2);
                                    const num     = String(wpIdx + 1);
                                    const chipH   = isFirst || isLast ? 56 : 44;
                                    return (
                                        <Marker
                                            key={`seg-wp-${segment.segment_id || 0}-${wpIdx}`}
                                            position={[wLat, wLng]}
                                            eventHandlers={{ mousedown: (e) => { setIsFollowing(false); L.DomEvent.stopPropagation(e); } }}
                                            icon={L.divIcon({
                                                className: '',
                                                html: waypointChipHtml(num, kmStr, isFirst, isLast),
                                                iconSize: [70, chipH],
                                                iconAnchor: [35, isFirst || isLast ? 32 : 12]
                                            })}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}

                    {/* Render Taipei Spots (Legacy - Now empty) */}
                    {taipeiSpots.map((spot, i) => (
                        <Marker
                            key={i}
                            position={[spot.lat, spot.lng]}
                            icon={L.divIcon({
                                className: '',
                                html: `
                                    <div style="background: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); white-space: nowrap; display: flex; align-items: center; gap: 4px;">
                                        <span style="color: #FF4500;">📍</span> ${spot.name}
                                    </div>
                                `,
                                iconSize: [100, 24],
                                iconAnchor: [50, 24]
                            })}
                        />
                    ))}

                    {/* 🏃 0.5km Split Markers with Pace & PR */}
                    {splits && splits.length > 0 && route.length > 0 && splits.map((split, i) => {
                        // Calculate position along route based on split distance
                        const splitDist = split.km || (i + 1) * 0.5;
                        const totalDist = metrics.distance || 1;
                        const routeIndex = Math.min(
                            Math.floor((splitDist / totalDist) * route.length),
                            route.length - 1
                        );
                        const pos = route[routeIndex];
                        if (!pos || !Number.isFinite(Number(pos.lat)) || !Number.isFinite(Number(pos.lng))) return null;

                        const paceMin = Math.floor((split.pace || 0) / 60);
                        const paceSec = Math.floor((split.pace || 0) % 60);
                        const paceStr = `${paceMin}'${paceSec.toString().padStart(2, '0')}"`;
                        const isPR = split.is_pr || split.is_fastest;

                        return (
                            <Marker
                                key={`split-${i}`}
                                position={[pos.lat, pos.lng]}
                                eventHandlers={{
                                    mousedown: (e) => {
                                        if (setIsFollowing) setIsFollowing(false);
                                        L.DomEvent.stopPropagation(e);
                                    },
                                    click: () => { if (setIsFollowing) setIsFollowing(false); }
                                }}
                                icon={L.divIcon({
                                    className: '',
                                    html: `
                                        <div style="
                                            background: ${isPR ? '#FFD700' : 'white'};
                                            padding: 4px 8px;
                                            border-radius: 8px;
                                            font-size: 9px;
                                            font-weight: bold;
                                            box-shadow: 0 2px 4px rgba(0,0,0,0.25);
                                            white-space: nowrap;
                                            text-align: center;
                                            border: ${isPR ? '2px solid #F59E0B' : '1px solid #E5E7EB'};
                                        ">
                                            <div style="font-size: 8px; color: ${isPR ? '#92400E' : '#6B7280'}; margin-bottom: 2px;">
                                                ${splitDist.toFixed(1)} KM ${isPR ? '🏆' : ''}
                                            </div>
                                            <div style="font-size: 11px; color: ${isPR ? '#78350F' : '#111827'};">
                                                ${paceStr}
                                            </div>
                                        </div>
                                    `,
                                    iconSize: [60, 40],
                                    iconAnchor: [30, 40]
                                })}
                            />
                        );
                    })}

                    {/* 🏆 Milestone Markers (PR, 2nd, 3rd) */}
                    {metrics?.deepData?.achievements?.milestone_markers?.map((marker, idx) => {
                        if (!marker.coordinates) return null;
                        const mLat = Number(marker.coordinates.lat);
                        const mLng = Number(marker.coordinates.lng);
                        if (!Number.isFinite(mLat) || !Number.isFinite(mLng)) return null;
                        return (
                            <Marker
                                key={`milestone-${idx}`}
                                position={[mLat, mLng]}
                                zIndexOffset={1000}
                                eventHandlers={{
                                    mousedown: (e) => {
                                        if (setIsFollowing) setIsFollowing(false);
                                        L.DomEvent.stopPropagation(e);
                                    },
                                    click: () => { if (setIsFollowing) setIsFollowing(false); }
                                }}
                                icon={L.divIcon({
                                    className: '',
                                    html: `
                                        <div style="
                                            display: flex;
                                            align-items: center;
                                            background: rgba(255, 255, 255, 0.95);
                                            backdrop-filter: blur(12px);
                                            -webkit-backdrop-filter: blur(12px);
                                            border: 2px solid ${marker.rank === 'PR' ? '#FFD700' : 'white'};
                                            border-radius: 12px;
                                            padding: 6px 12px;
                                            box-shadow: 0 8px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
                                            white-space: nowrap;
                                            gap: 8px;
                                            transform: translateY(-5px);
                                        ">
                                            <div style="font-size: 16px;">${marker.rank === 'PR' ? '🏆' : '🥈'}</div>
                                            <div style="display: flex; flex-direction: column; justify-content: center;">
                                                <div style="font-size: 8px; font-weight: 900; color: ${marker.rank === 'PR' ? '#92400E' : '#6B7280'}; line-height: 1; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.05em;">
                                                    ${marker.rank === 'PR' ? 'PERSONAL RECORD' : `${marker.rank} BEST`}
                                                </div>
                                                <div style="font-size: 11px; font-weight: 900; color: #161415; line-height: 1;">
                                                    ${marker.distance} KM
                                                </div>
                                            </div>
                                        </div>
                                    `,
                                    iconSize: [140, 50],
                                    iconAnchor: [70, 50]
                                })}
                            />
                        );
                    })}
                </MapContainer>

                
            </div>

            {/* 2. Stats Card (Restoring Rich Version) - Hidden if mapOnly is true OR hideStats is true */}
            {!mapOnly && !hideStats && (
                <div className="flex flex-col gap-3 mb-3">
                    <div
                        onClick={() => setShowEffortGuide(true)}
                        className={`bento-card-refined w-full p-5 flex flex-col justify-between relative text-[#3E2723] transition-all duration-500 ease-out cursor-pointer`}
                        style={{
                            backgroundColor: zone.color,
                            minHeight: '140px',
                            overflow: 'visible'
                        }}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-start">
                            <div className="flex justify-start pl-2">
                                <div className="flex items-center gap-1 mb-1 opacity-60">
                                    <p className="text-[12px] font-black tracking-tighter">努力值</p>
                                    <Info size={10} strokeWidth={3} />
                                </div>
                            </div>
                        </div>

                        {/* Score (Massive) - Rubik ExtraBold Italic with brown gradient */}
                        <div className="flex items-baseline gap-1 mt-[-5px] pl-2">
                            <span
                                style={{
                                    fontFamily: 'var(--font-display)',
                                    fontWeight: 900,
                                    fontStyle: 'italic',
                                    color: '#5D4037', // Lighter Brown
                                    fontSize: '72px',
                                    lineHeight: '1.0',
                                    paddingBottom: '10px',
                                    display: 'inline-block',
                                    letterSpacing: '-2px', // Adjusted for serif
                                    filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.3))'
                                }}
                                className="pr-4"
                            >
                                {stats.score}
                            </span>
                            <span className="text-[12px] font-bold opacity-60 uppercase">PTS</span>
                        </div>

                        {/* Zone Tag */}
                        <div className="flex justify-end items-end mt-1 mb-1 px-2">
                            <motion.div
                                key={zone.label}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="px-3 py-1 bg-black/10 rounded-lg text-[11px] font-black backdrop-blur-sm"
                            >
                                {zone.label}
                            </motion.div>
                        </div>

                        {/* Goal Progress (Premium Energy + Golden Shimmer Design) */}
                        <div className="mt-2">
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-[9px] font-black opacity-60 uppercase">GOAL</span>
                                <span className="text-[11px] font-black opacity-60">
                                    {isGoalReached ? '100%' : `${progressPercent}%`}
                                </span>
                            </div>

                            {/* CSS for Enhanced Energy + Golden Shimmer Effects */}
                            <style>{`
                            @keyframes shimmer-flow {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(200%); }
                            }
                            @keyframes gold-pulse {
                                0%, 100% { box-shadow: 0 0 12px rgba(255, 215, 0, 0.7); }
                                50% { box-shadow: 0 0 25px rgba(255, 215, 0, 1), 0 0 40px rgba(255, 215, 0, 0.5), 0 0 60px rgba(255, 180, 0, 0.3); }
                            }
                            @keyframes victory-glow {
                                0%, 100% { opacity: 0.5; transform: scale(1); }
                                50% { opacity: 1; transform: scale(1.5); }
                            }
                            @keyframes energy-pulse {
                                0%, 100% { opacity: 0.6; filter: blur(0px); }
                                50% { opacity: 1; filter: blur(1px); }
                            }
                            @keyframes particle-float {
                                0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
                                50% { transform: translateY(-8px) translateX(3px) scale(1.2); opacity: 1; }
                                100% { transform: translateY(-15px) translateX(-2px) scale(0.8); opacity: 0; }
                            }
                            @keyframes lightning-flash {
                                0%, 90%, 100% { opacity: 0; }
                                92%, 98% { opacity: 0.8; }
                            }
                            @keyframes gold-sparkle {
                                0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
                                50% { opacity: 1; transform: scale(1) rotate(180deg); }
                            }
                        `}</style>

                            {/* Track Container */}
                            <div className="h-[14px] rounded-full relative bg-black/30 overflow-visible">
                                {/* Energy Glow Background (when > 20%) */}
                                {progressPercent > 20 && !isGoalReached && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '-100%',
                                            left: 0,
                                            width: `${progressPercent}%`,
                                            height: '300%',
                                            background: 'radial-gradient(ellipse at right, rgba(255,255,255,0.4) 0%, transparent 60%)',
                                            animation: 'energy-pulse 1.5s ease-in-out infinite',
                                            pointerEvents: 'none'
                                        }}
                                    />
                                )}

                                {/* Electric Aura Border (when > 50%) - 更明顯的光暈 */}
                                {progressPercent > 50 && !isGoalReached && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: '-4px',
                                            borderRadius: '999px',
                                            background: 'transparent',
                                            border: '2px solid rgba(255,255,255,0.4)',
                                            boxShadow: '0 0 10px rgba(255,255,255,0.3)',
                                            animation: 'energy-pulse 1s ease-in-out infinite',
                                            pointerEvents: 'none'
                                        }}
                                    />
                                )}

                                {/* Fill Bar - 米白色 */}
                                <div
                                    className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                                    style={{
                                        width: `${Math.max(progressPercent, 5)}%`,
                                        minWidth: '20px',
                                        backgroundColor: isGoalReached && isChallengeMode ? '#FFD700' : '#F5EFE6',
                                        boxShadow: isGoalReached && isChallengeMode
                                            ? '0 0 20px rgba(255, 215, 0, 0.9), 0 0 40px rgba(255, 200, 0, 0.5), inset 0 1px 3px rgba(255,255,255,0.7)'
                                            : progressPercent > 50
                                                ? '0 0 15px rgba(245, 239, 230, 0.8), inset 0 1px 2px rgba(255,255,255,0.5)'
                                                : '0 0 10px rgba(245, 239, 230, 0.6), inset 0 1px 2px rgba(255,255,255,0.4)',
                                        animation: isGoalReached && isChallengeMode ? 'gold-pulse 1.2s ease-in-out infinite' : 'none',
                                        border: '1px solid rgba(0,0,0,0.1)'
                                    }}
                                >
                                    {/* Shimmer Effect */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '50%',
                                            height: '100%',
                                            background: isGoalReached && isChallengeMode
                                                ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,1) 40%, rgba(255,255,200,1) 50%, rgba(255,255,255,1) 60%, transparent 100%)'
                                                : 'linear-gradient(90deg, transparent 0%, rgba(200,180,150,0.4) 20%, rgba(255,255,255,0.8) 50%, rgba(200,180,150,0.4) 80%, transparent 100%)',
                                            animation: 'shimmer-flow 1.5s linear infinite',
                                            pointerEvents: 'none'
                                        }}
                                    />
                                </div>

                                {/* Energy Particles (floating above bar when > 30%) - 更明顯 */}
                                {progressPercent > 30 && progressPercent < 100 && !isGoalReached && (
                                    <>
                                        {[...Array(5)].map((_, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${Math.min(progressPercent - 5, 90)}%`,
                                                    top: i % 2 === 0 ? '-10px' : '24px',
                                                    width: '5px',
                                                    height: '5px',
                                                    backgroundColor: '#F5EFE6',
                                                    borderRadius: '50%',
                                                    boxShadow: '0 0 8px rgba(245,239,230,1), 0 0 15px rgba(245,239,230,0.6)',
                                                    animation: `particle-float ${1.0 + i * 0.2}s ease-out infinite`,
                                                    animationDelay: `${i * 0.2}s`
                                                }}
                                            />
                                        ))}
                                    </>
                                )}

                                {/* Victory Golden Sparkles */}
                                {isGoalReached && isChallengeMode && (
                                    <>
                                        {[...Array(8)].map((_, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    position: 'absolute',
                                                    right: `${5 + i * 12}%`,
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    width: '6px',
                                                    height: '6px',
                                                    background: 'linear-gradient(45deg, #FFD700, #FFFFFF, #FFD700)',
                                                    borderRadius: '50%',
                                                    boxShadow: '0 0 8px #FFD700, 0 0 15px rgba(255,215,0,0.8)',
                                                    animation: `gold-sparkle ${1.2 + i * 0.15}s ease-in-out infinite`,
                                                    animationDelay: `${i * 0.1}s`
                                                }}
                                            />
                                        ))}
                                        {/* Lightning flash effect */}
                                        <div
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                borderRadius: '999px',
                                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                                                animation: 'lightning-flash 2s ease-in-out infinite',
                                                pointerEvents: 'none'
                                            }}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Grid for Distance and Calories */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Distance Card - Atomic Age Font */}
                        <div className="bento-card-refined p-4 flex flex-col justify-between h-[120px]" style={{ background: 'rgba(245, 245, 240, 0.6)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.4)', color: 'rgba(0,0,0,0.85)' }}>
                            <div className="flex justify-between items-start">
                                <span className="text-[12px] font-black opacity-40">距離</span>
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            </div>

                            <div className="flex items-baseline gap-1">
                                <span style={{ fontFamily: "'Atomic Age', cursive" }} className="text-[32px] tracking-tight">{stats.dist}</span>
                                <span className="text-[11px] font-bold opacity-40">KM</span>
                            </div>
                        </div>

                        {/* Calories Card - Atomic Age Font */}
                        <div className="bento-card-refined p-4 flex flex-col justify-between h-[120px]" style={{ background: 'rgba(245, 245, 240, 0.6)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.4)', color: 'rgba(0,0,0,0.85)' }}>
                            <div className="flex justify-between items-start">
                                <span className="text-[9px] font-black opacity-40 uppercase">CALORIES</span>
                                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span style={{ fontFamily: "'Atomic Age', cursive" }} className="text-[32px] tracking-tight">{(metrics.calories || 0).toFixed(1)}</span>
                                <span className="text-[11px] font-bold opacity-40">KCAL</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <EffortExplanationModal isOpen={showEffortGuide} onClose={() => setShowEffortGuide(false)} />
        </div >
    );
};

export default RouteMap;
