import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * MapAutoResize —— 掛在每一個 <MapContainer> 裡，讓地圖「一進去就出現」
 * ══════════════════════════════════════════════════════════════════════
 * 症狀：進到跑步頁，定位標記看得到、右下角的 Leaflet 標註也在，
 *       但整片是空白灰底，要拖一下或轉個方向才會長出地圖。
 *
 * 成因：Leaflet 在建立當下量一次容器尺寸，之後不再自己量。這個容器常常在
 *       掛載那一刻還是 0×0 —— 父層正在跑進場動畫、面板還沒展開、
 *       高度是 100dvh 但 iOS 的視窗高度還沒定案。量到 0×0 的話，Leaflet
 *       只會為一個 0×0 的視窗要圖磚，也就是一張都不要。標記是絕對定位的
 *       DOM，不受影響 —— 所以會出現「有標記、沒地圖」這種看起來很詭異的畫面。
 *
 * 做法：容器尺寸一變就 invalidateSize()。
 *   • ResizeObserver 蓋掉所有「之後才變大」的情況（進場動畫、面板展開、鍵盤）
 *   • 幾個遞增的 timer 蓋掉沒有 ResizeObserver 的環境
 *   • orientationchange / visibilitychange 蓋掉轉向與從背景切回來
 *
 * ⚠️ 用 { animate:false, pan:false }：這是修尺寸，不是動鏡頭。
 *    讓它 pan 會把使用者正在看的位置拉走。
 */
const MapAutoResize = () => {
    const map = useMap();

    useEffect(() => {
        const el = map?.getContainer?.();
        if (!el) return undefined;

        const fix = () => {
            try {
                if (!el.isConnected) return;
                if (el.clientWidth === 0 || el.clientHeight === 0) return;
                map.invalidateSize({ animate: false, pan: false });
            } catch { /* 地圖已被卸載 */ }
        };

        const raf = requestAnimationFrame(fix);
        const timers = [60, 200, 500, 1200].map((ms) => setTimeout(fix, ms));

        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(fix);
            ro.observe(el);
        }
        window.addEventListener('resize', fix);
        window.addEventListener('orientationchange', fix);
        document.addEventListener('visibilitychange', fix);

        return () => {
            cancelAnimationFrame(raf);
            timers.forEach(clearTimeout);
            ro?.disconnect();
            window.removeEventListener('resize', fix);
            window.removeEventListener('orientationchange', fix);
            document.removeEventListener('visibilitychange', fix);
        };
    }, [map]);

    return null;
};

export default MapAutoResize;
