import React, { useEffect, useRef, useState } from 'react';
import { canSnapshotRoute, requestRouteSnapshot } from '../utils/routeSnapshot';

/**
 * RouteSnapshotMap —— 先出一張 Apple Maps 靜態路線圖（立即、清楚），
 * 拿不到（網頁版／逾時）才用 fallback（原本的 Leaflet 互動地圖）。
 *
 * @param {Array<[lat,lng]>} route
 * @param {Array<{lat,lng,render:()=>ReactNode,key}>} markers  疊在圖上的標記（例如獎牌膠囊）
 * @param {function} fallback  () => ReactNode，拿不到快照時畫的東西
 * @param {function} onTap     點一下（通常是切到可拖曳的互動地圖）
 */
const RouteSnapshotMap = ({ route, markers = [], fallback, onTap, onUnavailable, dark = false, color = '#F95C4B', padding = 28, style, children }) => {
    const boxRef = useRef(null);
    const [snap, setSnap] = useState(null);
    const [failed, setFailed] = useState(!canSnapshotRoute());

    useEffect(() => {
        if (failed) return undefined;
        const el = boxRef.current;
        if (!el) return undefined;
        let alive = true;
        const run = () => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return false;
            requestRouteSnapshot({
                coords: route,
                markers: markers.map((m) => [m.lat, m.lng]),
                width: r.width, height: r.height, dark, color, padding,
            }).then((res) => {
                if (!alive) return;
                if (res && res.image) setSnap(res); else setFailed(true);
            });
            return true;
        };
        if (!run()) {
            // 版面還沒定（動畫中）→ 下一個畫格再量一次
            const id = requestAnimationFrame(() => { if (alive && !run()) setFailed(true); });
            return () => { alive = false; cancelAnimationFrame(id); };
        }
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route, dark, color, failed]);

    // 拿不到快照 → 告訴呼叫端（通常是直接換成互動地圖）
    useEffect(() => { if (failed && onUnavailable) onUnavailable(); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

    if (failed) return fallback ? fallback() : null;

    return (
        <div ref={boxRef} onClick={onTap} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: dark ? '#1A1C1E' : '#EFECE7', cursor: onTap ? 'pointer' : 'default', ...style }}>
            {snap ? (
                <img src={snap.image} alt="跑步路線地圖" draggable={false}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'drvnSnapIn 220ms ease-out' }} />
            ) : (
                <div className="ti-skeleton" style={{ position: 'absolute', inset: 0 }} />
            )}
            {snap && markers.map((m, i) => {
                const p = snap.markers?.[i];
                if (!p) return null;
                return (
                    <div key={m.key || i} style={{ position: 'absolute', left: p[0], top: p[1], pointerEvents: 'none', zIndex: 2 }}>
                        {m.render ? m.render() : null}
                    </div>
                );
            })}
            {children}
            <style>{'@keyframes drvnSnapIn{from{opacity:0}to{opacity:1}}'}</style>
        </div>
    );
};

export default RouteSnapshotMap;
