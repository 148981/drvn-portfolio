/**
 * ══════════════════════════════════════════════════════════════════════════
 * mapTiles — 地圖樣式與圖磚的單一設定
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要這支：
 *   地圖網址曾經在 6 支檔案裡複製了 8 次（RouteMap 自己就有 3 個）。要換來源
 *   得改 8 個地方，漏一個就會有一張地圖還是壞的。所以收成一份。
 *
 * ── 一個樣式 = 一組真的不一樣的圖磚 ──────────────────────────────────
 * 選單上寫「極簡／街道／衛星／深色」，每一個就要真的對到不同的來源。
 * ⚠️ 以前「極簡」其實是把全彩底圖套一層濾鏡 —— 名字說極簡、看到的是染灰的
 *    全彩圖，店家圖示與門牌號一個都沒少。名稱跟結果對不上就是壞掉。
 *    要換長相請換來源，不要拿濾鏡硬壓（深色是唯一例外，見下）。
 *
 * ── 為什麼字會糊，怎麼解 ──────────────────────────────────────────
 * 糊不是圖磚品質差，是**放大**：Esri 極簡底圖原生只到 z16，跑步追蹤停在 z17，
 * Leaflet 只能把 z16 的圖磚拉大一倍來墊，字當然糊。
 *   ① detectRetina —— iPhone 是 2~3 倍螢幕，開了之後 Leaflet 會去要「高一級」
 *      的圖磚再縮小畫，等於雙倍像素密度。OSM 原生到 z19，在 z17 看就是
 *      真的去拿 z18 來畫，字立刻銳利。
 *   ② ⚠️⚠️ 開 detectRetina 的來源，maxNativeZoom 要填「真實上限 − 1」。
 *      Leaflet 的順序是：先用 maxNativeZoom 夾住 tileZoom，**夾完之後**才加
 *      zoomOffset(+1) 去組網址。所以填真實上限的話，實際會去要「上限 + 1」那一層。
 *      2026-09 就是這樣把極簡與深色地圖弄到整片空白的：Esri 極簡只有到 z16，
 *      detectRetina 讓它去要 z17 → 每一張都回「Map data not yet available」灰圖。
 *   ③ 真實上限本來就很低的來源（Esri 極簡只到 z16），直接**不要開 detectRetina** ——
 *      它在 z16 附近一點好處都沒有，只會把網址推到沒有資料的那一層。
 *
 * ── 2026-09 實測記錄（每一條都是真的把圖磚叫出來看過的）────────────────
 *   ✗ CARTO Positron：會回 200、也畫得出地圖，但斜蓋「API KEY REQUIRED」。
 *      最難抓的一種壞掉 —— HTTP 沒錯、tileerror 不觸發、退路也不會啟動。
 *   ✓ Esri World Light Gray Canvas：真極簡（沒有店家圖示、沒有門牌號），
 *      不需要 key，但**原生只到 z16**。
 *   ✓ OSM 標準圖磚（leafletjs.com 首頁那張）：原生到 z19，細節最多。
 *   ✓ Esri World Imagery：衛星影像，原生到 z19。
 */

/* ── 圖磚來源（給下面的樣式組合用）────────────────────────────────── */

const OSM = {
    id: 'osm',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    /* 真實上限 19；開了 detectRetina 所以填 18（見上面 ②）。 */
    maxNativeZoom: 18,
    detectRetina: true,
};

const ESRI_LIGHT_GRAY = {
    id: 'esri-light-gray',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    /* ⚠️ 16 是實測出來的硬上限，不是估的。改大 = 使用者會看到「Map data not yet available」。 */
    maxNativeZoom: 16,
    /* ⚠️ 這一組**不可以**開 detectRetina：上限只有 16，開了會讓 Leaflet 去要 z17，
       整張地圖會變成一片「Map data not yet available」的灰。 */
    detectRetina: false,
};

const ESRI_IMAGERY = {
    id: 'esri-imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    /* 真實上限 19；開了 detectRetina 所以填 18。 */
    maxNativeZoom: 18,
    detectRetina: true,
};

/* ── 樣式 ──────────────────────────────────────────────────────────
 * sources 是「這個樣式的來源 ＋ 它自己的退路」，不是跨樣式亂跳：
 * 選了極簡就不該因為網路抖一下變成街道圖。
 *
 * tint  圖磚要怎麼調色：none 原色 / warm 輕暖化 / invert 反相成深色（見 styles/map-tiles.css）
 * dark  這個樣式是不是深底（決定容器底色、路線與 UI 的對比）
 */
export const MAP_STYLES = {
    minimal: {
        id: 'minimal',
        label: '極簡地圖',
        sources: [ESRI_LIGHT_GRAY],
        tint: 'warm',
        dark: false,
        /* 原生只到 16，放到 19 只會看到一團糊。停在 17 是「還看得出巷弄、
           又不至於變馬賽克」的界線。要更近請切到街道地圖。 */
        maxZoom: 17,
    },
    street: {
        id: 'street',
        label: '街道地圖',
        sources: [OSM, ESRI_LIGHT_GRAY],
        tint: 'none',
        dark: false,
        maxZoom: 19,
    },
    satellite: {
        id: 'satellite',
        label: '衛星地圖',
        sources: [ESRI_IMAGERY],
        tint: 'none',
        dark: true,
        maxZoom: 19,
    },
    dark: {
        id: 'dark',
        label: '深色地圖',
        /* 深色是唯一用濾鏡做的樣式：沒有不用 key 的深色極簡圖磚來源，
           而把極簡灰底反相的結果夠乾淨（只有線條與地名，沒有彩色 POI 要處理）。 */
        sources: [ESRI_LIGHT_GRAY],
        /* ⚠️ 深色的反相濾鏡跟著 tint 走，不跟著 dark 走：
           衛星也是 dark（深底），但衛星照片不能反相。 */
        tint: 'invert',
        dark: true,
        maxZoom: 17,
    },
};

/** 選單順序（點一下換下一個）。 */
export const MAP_STYLE_CYCLE = ['minimal', 'street', 'satellite', 'dark'];

/** 拿樣式定義；給了不認得的 id 就回極簡，不要讓畫面空掉。 */
export const getMapStyle = (id) => MAP_STYLES[id] || MAP_STYLES.minimal;

/** 全 App 允許的最大放大層級（MapContainer 用；各樣式再自己收斂）。 */
export const TILE_MAX_ZOOM = Math.max(...Object.values(MAP_STYLES).map((s) => s.maxZoom));

/**
 * 套在 MapContainer 上的 className。
 * 實際的調色由 <DrvnTileLayer> 依樣式寫在容器上的 data-tile-tint 決定。
 * @param {'light'|'dark'} style
 */
export const mapThemeClass = (style = 'light') =>
    style === 'dark' ? 'drvn-map drvn-map--dark' : 'drvn-map drvn-map--light';

/* ⚠️ 這裡沒有 tileLayerProps() 之類的「一次給齊」helper：
   底圖只能從 <DrvnTileLayer style="…" /> 走。自己組 <TileLayer> 很容易漏掉
   maxNativeZoom 或 detectRetina —— 那正是「字很糊」與「某個層級整片空白」
   這兩個老問題的來源。 */

export default { MAP_STYLES, MAP_STYLE_CYCLE, getMapStyle, TILE_MAX_ZOOM, mapThemeClass };
