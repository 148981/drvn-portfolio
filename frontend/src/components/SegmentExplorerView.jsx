import React, { useState, useEffect } from 'react';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import MapAutoResize from './MapAutoResize';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { MapContainer, Polyline, Marker, useMap, Circle } from 'react-leaflet';
import { Trophy, TrendingUp, MapPin, Plus, Crown, Target, X, Undo } from 'lucide-react';
import L from 'leaflet';
import apiClient from '../api/client';
import { toast } from '../utils/toast';

// LOEWE-inspired Palette
const PALETTE = {
    background: '#F5F1E8',
    olive: '#5C6B4A',
    terracotta: '#B88A7A',
    espresso: '#3E2723',
    warmGray: '#9E9386',
    orange: '#F95C4B',
    beige: '#E8DCC8',
    stone: '#D4C5B0'
};

// Moved outside parent component to prevent remount on every re-render (rerender-no-inline-components)
const MapClickHandler = ({ creating, setNewSegment }) => {
    const map = useMap();

    useEffect(() => {
        if (!creating) return;

        const onClick = (e) => {
            const { lat, lng } = e.latlng;
            setNewSegment(prev => ({
                ...prev,
                waypoints: [...prev.waypoints, { lat, lng }]
            }));
        };

        map.on('click', onClick);
        return () => {
            map.off('click', onClick);
        };
    }, [map, creating, setNewSegment]);

    return null;
};

const SegmentExplorerView = ({ onClose }) => {
    const [segments, setSegments] = useState([]);
    const [selectedSegment, setSelectedSegment] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newSegment, setNewSegment] = useState({
        name: '',
        waypoints: [] // Changed to array for multi-point support
    });

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const coords = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                setUserLocation(coords);
                fetchNearbySegments(coords.lat, coords.lng);
            }, () => {
                const defaultCoords = { lat: 25.033, lng: 121.565 };
                setUserLocation(defaultCoords);
                fetchNearbySegments(defaultCoords.lat, defaultCoords.lng);
            });
        }
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
            // Calculate total distance
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
                created_by_user_id: 'user_demo_001'
            };

            const response = await apiClient.post('/api/segments/create', segmentData);
            setSegments([...segments, response.data]);
            setNewSegment({ name: '', waypoints: [] });
            setCreating(false);
            toast.success(`路段「${response.data.name}」已建立（${(totalDistance / 1000).toFixed(2)} km）`);
        } catch (error) {
            console.error('Error creating segment:', error);
            toast.error('建立失敗，請稍後再試');
        }
    };

    const calculateDistance = (point1, point2) => {
        const R = 6371000; // meters
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
        const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    };

    const removeLastWaypoint = () => {
        setNewSegment({
            ...newSegment,
            waypoints: newSegment.waypoints.slice(0, -1)
        });
    };


    if (!userLocation) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: PALETTE.background }}>
                <div className="text-center">
                    <div className="text-4xl mb-4">📍</div>
                    <div className="text-lg font-semibold" style={{ color: PALETTE.espresso }}>
                        獲取位置中...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: PALETTE.background }}>
            {/* Header */}
            <div className="sticky top-0 z-10 backdrop-blur-lg p-4 border-b border-stone-300" style={{ backgroundColor: `${PALETTE.background}ee` }}>
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Target size={28} style={{ color: PALETTE.olive }} />
                        <div>
                            <h1 className="text-2xl font-black font-serif-elegant" style={{ color: PALETTE.espresso }}>
                                Segment Explorer
                            </h1>
                            <p className="text-sm" style={{ color: PALETTE.warmGray }}>
                                {segments.length} 個路段
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {!creating && (
                            <motion.button {...pressProps('pill')}
 onClick={() => setCreating(true)}
 className="px-4 py-2 rounded-xl font-bold flex items-center gap-2 "
 style={{
 background: `linear-gradient(135deg, ${PALETTE.orange}, #D94030)`,
 color: 'white'
 }}
 >
                                <Plus size={20} />
                                CREATE SEGMENT
                            </motion.button>
                        )}
                        <motion.button {...pressProps('pill')}
 onClick={onClose}
 className="px-4 py-2 rounded-xl font-bold "
 style={{
 backgroundColor: 'transparent',
 border: `2px solid ${PALETTE.warmGray}`,
 color: PALETTE.warmGray
 }}
 >
                            CLOSE
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Creation Mode Banner */}
            {creating && (
                <div className="sticky top-16 z-10 backdrop-blur-lg p-3 border-b border-orange-300" style={{ backgroundColor: '#FFF3E0' }}>
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                                <p className="font-bold text-sm mb-2" style={{ color: PALETTE.orange }}>
                                    🎯 多點路段創建：點擊地圖添加路徑點（至少 2 個）
                                </p>
                                <input
                                    type="text"
                                    placeholder="路段名稱（例如：台北 101 登山路段）"
                                    value={newSegment.name}
                                    onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
                                    className="px-3 py-2 rounded-lg border border-stone-300 w-80"
                                    style={{ backgroundColor: 'white', color: PALETTE.espresso }}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold px-3 py-2 rounded-lg" style={{ backgroundColor: `${PALETTE.olive}20`, color: PALETTE.olive }}>
                                    {newSegment.waypoints.length} 個點位
                                </span>
                                {newSegment.waypoints.length > 0 && (
                                    <motion.button {...pressProps('row')}
 onClick={removeLastWaypoint}
 className="px-3 py-2 rounded-lg font-bold flex items-center gap-1"
 style={{ backgroundColor: PALETTE.terracotta, color: 'white' }}
 >
                                        <Undo size={16} />
                                        撤銷
                                    </motion.button>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <motion.button {...pressProps('row')}
 onClick={handleCreateSegment}
 disabled={!newSegment.name || newSegment.waypoints.length < 2}
 className="px-4 py-2 rounded-lg font-bold disabled:opacity-50"
 style={{ backgroundColor: PALETTE.olive, color: 'white' }}
 >
                                SAVE SEGMENT
                            </motion.button>
                            <motion.button {...pressProps('row')}
 onClick={() => {
 setCreating(false);
 setNewSegment({ name: '', waypoints: [] });
 }}
 className="px-4 py-2 rounded-lg font-bold"
 style={{ backgroundColor: PALETTE.stone, color: PALETTE.espresso }}
 >
                                CANCEL
                            </motion.button>
                        </div>
                    </div>
                </div>
            )}

            {/* Map */}
            <div className="h-[500px] border-b border-stone-300">
                <MapContainer
                    center={[userLocation.lat, userLocation.lng]}
                    zoom={13}
                    scrollWheelZoom={true}
                    className={`${mapThemeClass('light')} w-full h-full`}
                >
                    <MapAutoResize />
                    <DrvnTileLayer style="minimal" />

                    <MapClickHandler creating={creating} setNewSegment={setNewSegment} />

                    {/* User location */}
                    <Marker
                        position={[userLocation.lat, userLocation.lng]}
                        icon={L.divIcon({
                            html: `<div style="width: 16px; height: 16px; background: ${PALETTE.orange}; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })}
                    />

                    {/* Existing segments */}
                    {segments.map((seg, idx) => {
                        const waypoints = seg.waypoints || [];
                        if (waypoints.length < 2) return null;

                        return (
                            <React.Fragment key={seg.segment_id}>
                                <Polyline
                                    positions={waypoints.map(w => [w.lat, w.lng])}
                                    color={PALETTE.terracotta}
                                    weight={5}
                                    opacity={0.7}
                                    eventHandlers={{
                                        click: () => setSelectedSegment(seg)
                                    }}
                                />
                                {waypoints.map((wp, i) => (
                                    <Circle
                                        key={i}
                                        center={[wp.lat, wp.lng]}
                                        radius={5}
                                        pathOptions={{
                                            color: i === 0 ? '#5A7A3A' : i === waypoints.length - 1 ? '#EF4444' : PALETTE.olive,
                                            fillColor: i === 0 ? '#5A7A3A' : i === waypoints.length - 1 ? '#EF4444' : PALETTE.olive,
                                            fillOpacity: 0.8
                                        }}
                                    />
                                ))}
                            </React.Fragment>
                        );
                    })}

                    {/* New segment being created */}
                    {creating && newSegment.waypoints.length > 0 && (
                        <>
                            {newSegment.waypoints.length > 1 && (
                                <Polyline
                                    positions={newSegment.waypoints.map(w => [w.lat, w.lng])}
                                    color={PALETTE.orange}
                                    weight={5}
                                    opacity={0.8}
                                    dashArray="10, 5"
                                />
                            )}
                            {newSegment.waypoints.map((wp, i) => (
                                <Marker
                                    key={i}
                                    position={[wp.lat, wp.lng]}
                                    icon={L.divIcon({
                                        html: `<div style="width: 20px; height: 20px; background: ${i === 0 ? '#5A7A3A' : i === newSegment.waypoints.length - 1 && newSegment.waypoints.length > 1 ? '#EF4444' : PALETTE.orange}; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-center; color: white; font-weight: bold; font-size: 10px;">${i + 1}</div>`,
                                        iconSize: [20, 20],
                                        iconAnchor: [10, 10]
                                    })}
                                />
                            ))}
                        </>
                    )}
                </MapContainer>
            </div>

            {/* Segments List */}
            <div className="max-w-6xl mx-auto p-6">
                <h2 className="text-xl font-black font-serif-elegant mb-4" style={{ color: PALETTE.espresso }}>
                    附近的路段
                </h2>

                {loading ? (
                    <div className="text-center py-8" style={{ color: PALETTE.warmGray }}>
                        載入中...
                    </div>
                ) : segments.length === 0 ? (
                    <div className="text-center py-8" style={{ color: PALETTE.warmGray }}>
                        附近沒有路段，創建第一個吧！
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {segments.map((seg) => (
                            <SegmentCard
                                key={seg.segment_id}
                                segment={seg}
                                onClick={() => setSelectedSegment(seg)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// Segment Card Component
const SegmentCard = ({ segment, onClick }) => {
    const waypointCount = segment.waypoints?.length || 0;
    
    // 假設後端或 local 記錄會帶出使用者的 PR，這裡先設防呆預設值
    const userPR = segment.userPR || { pace: "4'55\"", time: "18:20", score: "88" };

    return (
        <div
            onClick={onClick}
            className="p-4 rounded-[18px] border border-stone-300 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-3"
            style={{ backgroundColor: 'white' }}
        >
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg font-serif-elegant" style={{ color: PALETTE.espresso }}>{segment.name}</h3>
                <Trophy size={20} style={{ color: PALETTE.terracotta }} />
            </div>

            <div className="flex items-center gap-4 text-sm" style={{ color: PALETTE.warmGray }}>
                <div><MapPin size={14} className="inline mr-1" /> {(segment.distance_meters / 1000).toFixed(2)} km</div>
                <div><TrendingUp size={14} className="inline mr-1" /> {segment.total_attempts || 0} 次嘗試</div>
            </div>

            <div className="text-xs" style={{ color: PALETTE.olive }}>
                {waypointCount} 個路徑點
            </div>

            {segment.difficulty_rating && (
                <div className="mt-1 flex gap-1">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-2 w-full rounded" style={{ backgroundColor: i < segment.difficulty_rating ? PALETTE.terracotta : PALETTE.stone }} />
                    ))}
                </div>
            )}

            {/* 🔥 新增：專屬歷史 PR 卡牌 */}
            <div className="mt-2 pt-3 border-t border-stone-100 flex gap-2">
                <div className="flex-1 bg-orange-50/50 rounded-lg p-2 text-center border border-orange-100">
                    <div className="text-[9px] font-bold text-orange-600 mb-0.5 tracking-widest flex justify-center items-center gap-1">
                        <Crown size={10} /> 最快配速
                    </div>
                    <div className="font-mono font-black text-orange-900 text-sm">{userPR.pace}</div>
                </div>
                <div className="flex-1 bg-stone-50 rounded-lg p-2 text-center border border-stone-200">
                    <div className="text-[12px] font-bold text-stone-500 mb-0.5 tracking-widest">最佳成績</div>
                    <div className="font-mono font-black text-stone-800 text-sm">{userPR.time}</div>
                </div>
                <div className="flex-1 bg-[#F5F1E8] rounded-lg p-2 text-center border border-[#D4C5B0]/50">
                    <div className="text-[12px] font-bold text-[#5C6B4A] mb-0.5 tracking-widest">最高分數</div>
                    <div className="font-mono font-black text-[#3E2723] text-sm">{userPR.score}</div>
                </div>
            </div>
        </div>
    );
};

export default SegmentExplorerView;
