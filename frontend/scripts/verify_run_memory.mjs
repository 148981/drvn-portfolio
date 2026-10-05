// verify_run_memory.mjs — 跑步記憶的邏輯斷言
//   · 起跑點 250 m 內算同一個地點；Apple 地圖類別 → 操場／公園／河濱／路跑
//   · 同一條路線：起點、終點、中途點、距離都要對得上；反方向或換路不算
//   · 路線紀錄：次數、最快配速、第二次以後跑更快才算破紀錄
//   · 依地點排課：操場把間歇、節奏排前面
import * as esbuild from 'esbuild';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
const r = await esbuild.build({
    stdin: { contents: "export * as rm from './src/utils/runMemory.js'; export { QUICK_RUN_COURSES } from './src/utils/quickRunCourses.js';", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error', define: { 'import.meta.env': '{"DEV":true}' },
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /api\/client$|cloudSync$/ }, () => ({ path: 's', namespace: 's' })); b.onLoad({ filter: /.*/, namespace: 's' }, () => ({ contents: 'export default {}; export const pushBlob = async () => true;', loader: 'js' })); } }],
});
const { rm, QUICK_RUN_COURSES } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

// 河濱一條 5 公里折返（往北 2.5 公里再回來）：約 0.0225 度緯度 ≈ 2.5 公里
const line = (lat0, lng0, dLat, n = 40) => Array.from({ length: n }, (_, i) => ({ lat: lat0 + (dLat * i) / (n - 1), lng: lng0 }));
const outBack = [...line(25.05, 121.51, 0.0225, 40), ...line(25.0725, 121.51, -0.0225, 40)];
const loop2 = outBack.map((p) => ({ lat: p.lat + 0.0003, lng: p.lng + 0.0002 }));      // 同一條、GPS 飄 40 公尺
const other = line(25.05, 121.51, 0, 2).concat(Array.from({ length: 40 }, (_, i) => ({ lat: 25.05, lng: 121.51 + 0.05 * i / 39 })));   // 從同起點往東 5 公里

ok(rm.kindFromCategory('MKPOICategoryStadium') === 'track' && rm.kindFromCategory('MKPOICategorySchool') === 'track', '體育場、學校 → 操場');
ok(rm.kindFromCategory('MKPOICategoryPark') === 'park' && rm.kindFromCategory(null) === 'road', '公園 → 公園；找不到 → 路跑');

let mem = rm.loadRunMemory('u1');
let res = rm.recordRun(mem, { route: outBack, distanceKm: 5.0, durationSec: 1650, type: 'base', place: { poiName: '大佳河濱公園', kind: 'riverside' } });
mem = res.mem;
const place = mem.places[res.placeId];
ok(place.name === '大佳河濱公園' && place.kind === 'riverside' && place.sessions === 1 && res.newRoute, '第一次：建地點（用地圖店名）＋建路線');
ok(!res.routePR, '第一次跑的路線不算破紀錄');
res = rm.recordRun(mem, { route: loop2, distanceKm: 5.1, durationSec: 1590, type: 'base' });
mem = res.mem;
ok(!res.newRoute && mem.routes[res.routeId].runs === 2, 'GPS 飄 40 公尺、距離差 2% → 同一條路線');
ok(res.routePR && mem.routes[res.routeId].bestPaceSec === Math.round(1590 / 5.1), '第二次跑更快 → 路線破紀錄，最快配速更新');
ok(Object.keys(mem.places).length === 1 && mem.places[res.placeId].sessions === 2 && mem.places[res.placeId].totalKm === 10.1, '同一個地點：次數與總里程累加');
res = rm.recordRun(mem, { route: other, distanceKm: 5.0, durationSec: 1700, type: 'progressive' });
mem = res.mem;
ok(res.newRoute && Object.keys(mem.routes).length === 2, '同起點、不同方向 → 另一條路線');
ok(rm.frequentRoutes(mem).length === 1 && rm.frequentRoutes(mem)[0].runs === 2, '常跑路線：跑過 2 次以上才列');
{
    const fav = rm.frequentRoutes(mem)[0];
    const byId = rm.routeHistoryFor(mem, { routeId: fav.id });
    ok(byId && byId.runs === 2 && byId.bestPaceSec === Math.round(1590 / 5.1), '選了記憶裡的路線 → 拿到這條路之前的次數與最快配速');
    const drawn = rm.routeHistoryFor(mem, { waypoints: outBack.map((p) => ({ lat: p.lat - 0.0002, lng: p.lng })), distanceKm: 5.05 });
    ok(drawn && drawn.id === fav.id, '自己畫的路線跟跑過的同一條 → 也找得到之前的紀錄');
    ok(rm.routeHistoryFor(mem, { waypoints: line(25.2, 121.6, 0.02), distanceKm: 2.2 }) === null, '沒跑過的路線 → 沒有紀錄（不編）');
}
ok(rm.recordRun(mem, { route: [], distanceKm: 3 }).placeId === null, '沒有 GPS 路線（跑步機）→ 不記');
const far = rm.recordRun(mem, { route: line(24.99, 121.3, 0.02), distanceKm: 2.2, durationSec: 800, place: { poiName: '北體操場', kind: 'track' } });
ok(Object.keys(far.mem.places).length === 2, '別的城市起跑 → 新地點');

const sorted = rm.sortCoursesForPlace(QUICK_RUN_COURSES, { kind: 'track' }).map((c) => c.id);
ok(sorted[0] === 'hill' && sorted[1] === 'progressive' && sorted.length === QUICK_RUN_COURSES.length, `操場：間歇、節奏排前面（${sorted.join(' → ')}）`);
ok(rm.sortCoursesForPlace(QUICK_RUN_COURSES, null) === QUICK_RUN_COURSES, '不知道在哪 → 課程順序不動');
ok(rm.paceLabel(299.6) === `5'00"` && rm.paceLabel(null) === null, '配速顯示：299.6 秒 → 5\'00"（不出現 4\'60"）');
const pf = rm.runPlaceProficiency(mem.places[mem.lastPlaceId]);
ok(pf && pf.label === '熟悉中' && pf.sessions === 3, '熟練度跟健身房同一套門檻（3 次 → 熟悉中）');

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
