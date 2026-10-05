import React, { useRef, useState, useCallback, useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { getMapStyle } from '../utils/mapTiles';

/**
 * DrvnTileLayer —— 全 App 唯一的底圖層
 * ══════════════════════════════════════════════════════════════════════
 * 六支檔案本來各自寫一個 <TileLayer url={…} />。換來源要改六次，
 * 而且沒有任何一支處理「圖磚載不到」—— 那時使用者看到的是一片空白灰。
 *
 * 這支做三件事：
 *   ① 照 utils/mapTiles 的樣式定義畫底圖（極簡／街道／衛星／深色各有各的來源）
 *   ② 同一個樣式內有退路：主要來源連不上就換備援，**不會跳到別的樣式** ——
 *      選了極簡不該因為網路抖一下變成街道圖
 *   ③ 把這個樣式的調色寫在「這一張地圖」的容器上（data-tile-tint）
 *
 * ⚠️ 退場條件不是「錯了幾張」，是「一張都沒成功」。
 *    地圖邊緣本來就會有海上／範圍外的圖磚回 404，用計數當門檻的話，
 *    一張好好的地圖被使用者多拖幾下就會莫名其妙換掉。
 *
 * ⚠️ 只要有一張圖磚成功載入就鎖住，不再往下退。已經證明這個來源是通的，
 *    之後零星的 404 是正常現象。
 *
 * ⚠️ 有些失敗不會發 tileerror（被擋、逾時），所以另外有看門狗，
 *    不然使用者會一直盯著空白灰底。
 *
 * ⚠️ 濾鏡旗標一定要寫在這張地圖自己的容器上。寫到 <html> 的話，
 *    同一頁另一張用別的樣式的地圖會被一起套到，整張洗掉。
 *
 * @param {string}  style  極簡 'minimal' | 街道 'street' | 衛星 'satellite' | 深色 'dark'
 * @param {boolean} labels 是否畫地名層（小預覽圖建議關掉，省一半請求）
 */

/** 有錯、而且這麼久還一張都沒進來 → 這個來源死了 */
const ERROR_GRACE_MS = 2500;
/** 完全沒有任何事件（沒錯也沒成功）的看門狗 —— 被擋或逾時時救場 */
const SILENT_TIMEOUT_MS = 7000;

const DrvnTileLayer = ({ style = 'minimal', labels = true, opacity = 1 }) => {
    const map = useMap();
    const mapStyle = getMapStyle(style);
    /* ⚠️ 換樣式時要從這個樣式的第一個來源重新開始 —— 呼叫端用
       <DrvnTileLayer key={mapStyle} style={mapStyle} /> 讓 React 重建這個元件，
       不要在 effect 裡 setState 去「手動歸零」（那會多跑一次無謂的 render，
       而且順序很容易跟 tile 事件打架）。 */
    const [idx, setIdx] = useState(0);

    const source = mapStyle.sources[Math.min(idx, mapStyle.sources.length - 1)];
    const lastIdx = mapStyle.sources.length - 1;

    const loadedRef = useRef(false);      // 這個來源至少成功過一張 → 鎖住
    const erroredRef = useRef(false);
    const errTimer = useRef(null);
    const silentTimer = useRef(null);

    const clearTimers = useCallback(() => {
        if (errTimer.current) { clearTimeout(errTimer.current); errTimer.current = null; }
        if (silentTimer.current) { clearTimeout(silentTimer.current); silentTimer.current = null; }
    }, []);

    /** 換這個樣式的下一個備援。已經是最後一個就不動。 */
    const advance = useCallback(() => {
        clearTimers();
        setIdx((i) => (i + 1 <= lastIdx ? i + 1 : i));
    }, [clearTimers, lastIdx]);

    // 每換一個來源，重新開始判斷
    useEffect(() => {
        loadedRef.current = false;
        erroredRef.current = false;
        clearTimers();
        if (idx < lastIdx) {
            silentTimer.current = setTimeout(() => {
                silentTimer.current = null;
                if (!loadedRef.current) advance();
            }, SILENT_TIMEOUT_MS);
        }
        return clearTimers;
    }, [idx, lastIdx, advance, clearTimers]);

    const onLoad = useCallback(() => {
        loadedRef.current = true;
        clearTimers();               // 通了就鎖住，之後零星 404 不再理會
    }, [clearTimers]);

    const onError = useCallback(() => {
        if (loadedRef.current) return;
        erroredRef.current = true;
        if (errTimer.current) return;
        errTimer.current = setTimeout(() => {
            errTimer.current = null;
            if (!loadedRef.current && erroredRef.current) advance();
        }, ERROR_GRACE_MS);
    }, [advance]);

    // 調色跟著「現在正在用的樣式」走，只寫在這一張地圖的容器上
    /* ⚠️ 深淺也要在這裡切，不能只靠 <MapContainer className>：
       react-leaflet 的 MapContainer 只在第一次掛載時讀 className（內部用 useState 存起來），
       之後 prop 再怎麼變都不會更新到 DOM。所以從極簡切到深色時，
       容器一直掛著 drvn-map--light —— 深色濾鏡從來沒套上，看起來跟極簡一模一樣。 */
    useEffect(() => {
        const el = map?.getContainer?.();
        if (!el) return undefined;
        el.dataset.tileTint = mapStyle.tint || 'warm';
        el.classList.toggle('drvn-map--dark', !!mapStyle.dark);
        el.classList.toggle('drvn-map--light', !mapStyle.dark);
        return () => { delete el.dataset.tileTint; };
    }, [map, mapStyle.tint, mapStyle.dark]);

    return (
        <>
            <TileLayer
                key={`${mapStyle.id}-${source.id}-base`}
                url={source.url}
                {...(source.subdomains ? { subdomains: source.subdomains } : {})}
                attribution={source.attribution}
                /* iPhone 是 2~3 倍螢幕 —— 開了才會去拿高一級的圖磚再縮小畫，
                   字才不會糊（這是「畫質很低」的解法）。 */
                detectRetina={!!source.detectRetina}
                maxNativeZoom={source.maxNativeZoom}
                maxZoom={mapStyle.maxZoom}
                opacity={opacity}
                keepBuffer={3}
                updateWhenIdle={false}
                eventHandlers={{ tileerror: onError, tileload: onLoad }}
            />
            {labels && source.labelUrl && (
                <TileLayer
                    key={`${mapStyle.id}-${source.id}-labels`}
                    url={source.labelUrl}
                    detectRetina={!!source.detectRetina}
                    maxNativeZoom={source.maxNativeZoom}
                    maxZoom={mapStyle.maxZoom}
                    /* 地名壓到 0.75：看得到路名，但不會跟路線搶。 */
                    opacity={0.75 * opacity}
                />
            )}
        </>
    );
};

export default DrvnTileLayer;
