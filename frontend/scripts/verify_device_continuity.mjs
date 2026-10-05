/**
 * verify_device_continuity.mjs —— 換一支手機，App 不可以失憶。
 * ─────────────────────────────────────────────────────────────────────
 * 這是 PM 規則書列的頭號結構性風險：InBody、完課紀錄、加入日期都只活在
 * 這支手機的 localStorage 裡。一個主打陪伴與長期進步的產品，最不能失憶。
 *
 * 三條線各自要成立：
 *   · InBody    後端一直有 CRUD，缺的是「讀回來」—— 開機要把後端的紀錄
 *               填進 inbody_local_<uid>，那 20 多支引擎才看得到。
 *   · 完課紀錄  後端本來沒有，新開了 /api/user/plan-progress，
 *               合併必須「每份計劃各自比 updatedAt」，不是整包覆蓋。
 *   · 加入日期  reconcileJoinDate 已經會從後端的訓練紀錄回推。
 *
 * 共同鐵則：拿不到後端資料時維持現狀，絕不用空的蓋掉使用者的紀錄。
 */
import fs from 'fs';
import path from 'path';

const FE = path.resolve(process.cwd(), 'src');
const BE = path.resolve(process.cwd(), '..', 'backend');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

console.log('\n══ 換裝置不失憶 ══\n');

// ── InBody ──
const store = read(path.join(FE, 'utils/inbodyStore.js'));
ok(store.length > 0, 'inbodyStore.js 存在');
ok(/inbody_local_\$\{/.test(store) || /`inbody_local_/.test(store),
   '寫回的是引擎們原本就在讀的那把 key（inbody_local_<uid>）');
ok(/if \(merged\.length\)/.test(store),
   '合併結果是空的就不寫 —— 不用空陣列蓋掉使用者的紀錄');
ok(/catch\s*\{[\s\S]{0,120}return local;/.test(store),
   '連不到後端時原封不動回本機資料');
ok(/inbody_pushed_|PUSHED_KEY/.test(store),
   '本機獨有的舊紀錄只補傳一次，不會每次開機重傳');

const app = read(path.join(FE, 'App.jsx'));
ok(/hydrateInBody\(/.test(app), '開機會呼叫 hydrateInBody');
ok(/hydratePlanProgress\(/.test(app), '開機會呼叫 hydratePlanProgress');

// ── 完課紀錄：後端 ──
const api = read(path.join(BE, 'api_plan_progress.py'));
ok(api.length > 0, 'backend/api_plan_progress.py 存在');
ok(/@router\.get\("\/api\/user\/plan-progress\/\{user_id\}"[\s\S]{0,80}owner_guard/.test(api),
   'GET 有 owner_guard（別人讀不到你的進度）');
ok(/@router\.put\("\/api\/user\/plan-progress\/\{user_id\}"[\s\S]{0,80}owner_guard/.test(api),
   'PUT 有 owner_guard');
ok(/old\["updatedAt"\] > new\["updatedAt"\]/.test(api),
   '每份計劃各自比 updatedAt，舊的不會洗掉新的');
ok(!/\|\s*None\s*:/.test(api.replace(/^\s*#.*$/gm, '')),
   '沒有 PEP 604 的 `| None` 註解（專案 venv 是 Python 3.9，會直接 TypeError）');
ok(/api_plan_progress\.router/.test(read(path.join(BE, 'main.py'))),
   'main.py 有把它掛上去 —— 沒掛等於沒寫');

// ── 完課紀錄：前端 ──
const spp = read(path.join(FE, 'utils/specialPlanProgress.js'));
ok(/export async function hydratePlanProgress/.test(spp), '前端有 hydratePlanProgress');
ok(/export async function pushPlanProgress/.test(spp), '前端有 pushPlanProgress');
const writeFn = /export function writePlanProgress[\s\S]*?\n\}/.exec(spp)?.[0] || '';
ok(/touchPlan\(/.test(writeFn), '寫進度時會蓋時間戳並排程上傳');
ok(/if \(!server \|\| typeof server !== 'object'\) return false;/.test(spp),
   '後端回的東西形狀不對就什麼都不做');
ok(/clearTimeout\(pushTimer\)/.test(spp),
   '連續打勾只送最後一次（不要每點一下打一次 API）');

// ── 加入日期 ──
const join = read(path.join(FE, 'utils/journeyJoinDate.js'));
ok(/getWorkoutHistory\(/.test(join) && /cardio\/sessions/.test(join),
   '加入日期會從後端的訓練與有氧紀錄回推（換裝置不會變成「第 1 天」）');

console.log(bad ? `\n❌ ${bad} 項未通過 —— 換裝置會掉資料\n` : '\n✅ 換一支手機，該記得的都記得\n');
process.exit(bad ? 1 : 0);
