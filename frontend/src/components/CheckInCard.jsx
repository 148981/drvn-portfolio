import React, { useRef, useState, useEffect } from 'react';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import MapAutoResize from './MapAutoResize';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
// html2canvas loaded on-demand (bundle-dynamic-imports)
import { MapContainer, Polyline, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './CheckInCard.css';
import { formatPace as fmtPace } from '../utils/format';


// Map updater component
const MapUpdater = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        if (center && center.length === 2) {
            map.setView(center, zoom);
        }
    }, [center, zoom, map]);
    return null;
};

const CheckInCard = ({ onClose, cardioData }) => {
    const cardRef = useRef(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [mapCenter, setMapCenter] = useState([25.0330, 121.5654]);

    // Hand-Drawn Editorial Palette
    const PALETTE = {
        bgBeige: '#C5BBAE',       // 背景米色
        brandOrange: '#E36A32',   // 標誌性赤陶橘
        darkUmber: '#483E3A',     // 底部深焦褐
        textBlack: '#000000',     // 核心數據黑
        textWhite: '#FFFFFF',     // 底部數值白
    };

    // 🩹 v2：路線同時相容 [lat,lng] 陣列 與 {lat,lng} 物件（後端 route_data 是物件形）。
    //    舊版只吃陣列形 → 從動態頁開打卡時 p[0] 為 undefined，Leaflet 直接 crash 進錯誤頁。
    const normRoute = React.useMemo(() => (
        (cardioData?.route || [])
            .map((p) => Array.isArray(p)
                ? [Number(p[0]), Number(p[1])]
                : [Number(p?.lat ?? p?.latitude), Number(p?.lng ?? p?.lon ?? p?.longitude)])
            .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    ), [cardioData?.route]);

    useEffect(() => {
        if (normRoute.length > 0) {
            const lats = normRoute.map(p => p[0]);
            const lngs = normRoute.map(p => p[1]);
            const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
            if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
                setMapCenter([centerLat, centerLng]);
            }
        }
    }, [normRoute]);

    const handleDownload = async () => {
        if (!cardRef.current) return;
        setIsDownloading(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 800));
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(cardRef.current, {
                useCORS: true,
                scale: 3,
                backgroundColor: PALETTE.bgBeige,
                width: 375,
                height: 667,
            });
            const link = document.createElement('a');
            link.download = `morning_run_card_${Date.now()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
        } catch (err) {
            console.error("Download failed:", err);
        } finally {
            setIsDownloading(false);
        }
    };

    // 🩹 J: 數字走單一真相源；字串輸入維持舊有正規化行為
    const formatPace = (pace) => {
        if (typeof pace === 'number') return fmtPace(pace);
        if (!pace) return fmtPace(0);
        return pace.toString().replace(":", "'") + '"';
    };

    const formatTime = (seconds) => {
        if (!seconds) return "0'00\"";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}'${secs.toString().padStart(2, '0')}"`;
    };

    const formatDate = () => {
        const date = new Date();
        const year = date.getFullYear();
        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const month = monthNames[date.getMonth()];
        const day = date.getDate().toString().padStart(2, '0');
        return `${year} ${month} ${day}`;
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000000,
            overflowY: 'auto',
            paddingBottom: 'env(safe-area-inset-bottom, 20px)'
        }} onClick={onClose}>
            {/* 核心卡片容器 */}
            <div onClick={(e) => e.stopPropagation()}>
                <div className="forced-container" ref={cardRef}>

                    {/* 1. Header 部分 */}
                    <div className="header-section">
                        <div className="morning-run">MORNING RUN</div>
                        <div className="header-row">
                            <div className="date-box">{formatDate()}</div>
                            <div className="taipei-text">TAIPEI</div>
                        </div>
                    </div>

                    {/* 2. 距離數據區 */}
                    <div className="distance-main">
                        <div className="swirl-arrow-fixed"></div>
                        <div className="distance-val">
                            {cardioData?.stats?.distance?.toFixed(2) || '0.00'}
                            <span className="unit-km">KM</span>
                        </div>
                    </div>

                    {/* 3. 地圖區域 (有機形狀) */}
                    <div className="map-wrapper">
                        <div className="organic-map">
                            <MapContainer className={mapThemeClass('light')}
                                center={mapCenter}
                                zoom={15}
                                style={{ width: '100%', height: '100%' }}
                                zoomControl={false}
                                attributionControl={false}
                            >
                                {/* 小預覽圖不畫地名層 —— 這麼小的圖上路名根本讀不到，
                                    只是多一半的圖磚請求。 */}
                                <MapAutoResize />
                                <DrvnTileLayer style="minimal" labels={false} />
                                {normRoute.length > 1 && (
                                    <Polyline
                                        positions={normRoute}
                                        color="#E36A32"
                                        weight={5}
                                        opacity={0.9}
                                    />
                                )}

                                {/* 🏆 Milestone Markers — 只放「真實」PR 標記；沒有就不放（不再塞假 PR/TOP2） */}
                                {(() => {
                                    const realMarkers = cardioData?.deepData?.achievements?.milestone_markers;
                                    const displayMarkers = (realMarkers && realMarkers.length > 0)
                                        ? realMarkers.filter((m) => m.kind !== 'distance')
                                        : [];

                                    return displayMarkers.map((marker, idx) => {
                                        if (!marker.coordinates
                                            || !Number.isFinite(Number(marker.coordinates.lat))
                                            || !Number.isFinite(Number(marker.coordinates.lng))) return null;
                                        return (
                                            <Marker
                                                key={`milestone-${idx}`}
                                                position={[marker.coordinates.lat, marker.coordinates.lng]}
                                                zIndexOffset={1000}
                                                icon={L.divIcon({
                                                    className: '',
                                                    html: `
                                                        <div style="
                                                            display: flex;
                                                            align-items: center;
                                                            background: #FFF;
                                                            border: 2px solid ${marker.rank === 'PR' ? '#E36A32' : '#483E3A'};
                                                            border-radius: 4px;
                                                            padding: 2px 6px;
                                                            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                                                            white-space: nowrap;
                                                            gap: 4px;
                                                            transform: scale(0.7) translateY(-5px);
                                                        ">
                                                            <div style="font-size: 10px;">${marker.rank === 'PR' ? '🏆' : '⭐'}</div>
                                                            <div style="display: flex; flex-direction: column;">
                                                                <div style="font-size: 6px; font-weight: 900; color: #000; line-height: 1;">${marker.rank}</div>
                                                                <div style="font-size: 8px; font-weight: 900; color: #000; line-height: 1;">${marker.distance}K</div>
                                                            </div>
                                                        </div>
                                                    `,
                                                    iconSize: [80, 30],
                                                    iconAnchor: [40, 30]
                                                })}
                                            />
                                        );
                                    });
                                })()}
                                <MapUpdater center={mapCenter} zoom={15} />
                            </MapContainer>
                        </div>
                    </div>

                    {/* 4. 配速 */}
                    <div className="pace-section">
                        <div className="pace-val">
                            {formatPace(cardioData?.stats?.pace)}
                        </div>
                        <div className="pace-unit">MIN / KM</div>
                    </div>

                    {/* 5. 底部數據欄 (黑底) */}
                    <div className="footer-snap">
                        {/* KCAL */}
                        <div className="footer-item">
                            <span>{Math.round(cardioData?.stats?.calories || 0)}</span>
                            <span className="footer-label">KCAL</span>
                        </div>

                        {/* DURATION */}
                        <div className="footer-item">
                            <span>{formatTime(cardioData?.stats?.duration) || "0'00\""}</span>
                            <span className="footer-label">DURATION</span>
                        </div>

                        {/* ELEVATION */}
                        <div className="elevation-up">
                            <div className="elevation-num">
                                {cardioData?.stats?.elevationGain || 0}
                            </div>
                            <div className="elevation-icon"></div>
                            <span className="footer-label">ELEVATION</span>
                        </div>

                        {/* Reference Text */}
                        <div className="ref-fixed">REF.2026.EDITORIAL</div>
                    </div>

                </div>

                {/* Download Button - Outside the card container */}
                <motion.button {...pressProps('row')}
 className="download-btn"
 onClick={handleDownload}
 disabled={isDownloading}
 >
                    {isDownloading ? '處理中...' : '下載 / 分享至 IG'}
                </motion.button>
            </div>
        </div>
    );
};

export default CheckInCard;
