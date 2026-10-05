// Run against Vite :5187 and backend/tests/cardio_browser_server.py :8877.
// NODE_PATH may point to a bundled Playwright installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.CARDIO_UI_ORIGIN || 'http://127.0.0.1:5187';
const api = 'http://127.0.0.1:8877';
const output = process.env.CARDIO_UI_OUTPUT || '/private/tmp/drvn-cardio-browser';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
<script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
</script><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
import Sheet from '/src/components/WeekSettlementSheet.jsx';
import '/src/index.css';
localStorage.setItem('userId','u');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Sheet,{onClose:()=>document.body.dataset.closed='yes'})));
</script></body></html>`;

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CARDIO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/__cardio_test__') return route.fulfill({ contentType: 'text/html', body: html });
            if (url.pathname.startsWith('/api/cardio-plan/')) {
                const response = await route.fetch({ url: api + url.pathname + url.search });
                return route.fulfill({ response });
            }
            if (url.origin === origin) return route.continue();
            return route.fulfill({ contentType: 'application/json', body: '{}' });
        });
        async function reset() {
            await context.request.post(api + '/__test/reset');
            await page.goto(origin + '/__cardio_test__');
            await page.waitForLoadState('networkidle');
            await page.screenshot({ path: output + '/initial.png', fullPage: true });
            await page.getByRole('button', { name: '維持原計畫，不調整', exact: true }).waitFor();
        }
        const latest = async () => (await (await context.request.get(api + '/api/cardio-plan/u/latest')).json()).plan;
        await reset();
        console.log('Rendered buttons:', await page.getByRole('button').allTextContents());
        assert.equal(await page.getByText('尚無訓練紀錄', { exact: true }).count(), 0);
        await page.screenshot({ path: output + '/settlement-mobile.png', fullPage: true });
        const before = await latest();
        await page.getByRole('button', { name: '維持原計畫，不調整', exact: true }).click();
        await page.waitForFunction(() => document.body.dataset.closed === 'yes');
        const held = await latest();
        assert.deepEqual(held.weeks[1], before.weeks[1]);
        assert.equal(held.weeks[0].settlement.apply_adjustments, false);

        await reset();
        await page.evaluate(() => { localStorage.setItem('run_week_done_u', '1'); });
        await context.request.post(api + '/__test/fail-once');
        const accept = page.getByRole('button').filter({ hasText: /好，|套用調整/ }).last();
        await accept.click();
        await page.getByText('結算尚未保存，請確認網路後再試一次。', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('run_week_done_u')), '1');
        assert.equal(await page.evaluate(() => document.body.dataset.closed), undefined);
        await page.screenshot({ path: output + '/save-failure-mobile.png', fullPage: true });
        await accept.click();
        await page.waitForFunction(() => document.body.dataset.closed === 'yes');
        const accepted = await latest();
        assert.equal(accepted.weeks[1].target_mileage_km, 8);
        assert.equal(await page.evaluate(() => localStorage.getItem('run_week_done_u')), null);

        await reset();
        await context.request.post(api + '/api/cardio-plan/log-rpe', { data: { user_id: 'u', brick_id: 'a', rpe: 8 } });
        await accept.click();
        await page.getByText('課表已更新，請重新開啟結算頁確認最新內容。', { exact: true }).waitFor();
        assert.equal((await latest()).weeks[0].settlement, undefined);
        assert.deepEqual(errors, []);
        console.log('PASS: mobile rendering, decline, failed save, retry, persisted 8 km, stale-preview conflict.');
        for (const [name, dir] of [['web', '/private/tmp/drvn-running-web-build'], ['ios', '/private/tmp/drvn-running-ios-build']]) {
            const smoke = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const built = await smoke.newPage();
            const failures = [];
            built.on('pageerror', e => { failures.push(e.message); console.log(name + ' runtime:', e.stack); });
            await built.route('**/*', route => {
                const u = new URL(route.request().url());
                if (u.origin === origin && !u.pathname.startsWith('/api/')) {
                    const relative = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\//, '');
                    const path = require('node:path').resolve(dir, relative);
                    if (path.startsWith(dir + '/') && fs.existsSync(path) && fs.statSync(path).isFile()) {
                        const ext = path.split('.').pop();
                        const type = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' }[ext] || 'application/octet-stream';
                        return route.fulfill({ contentType: type, body: fs.readFileSync(path) });
                    }
                }
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ plan: null, sessions: [], data: null }) });
            });
            await built.goto(origin + '/');
            await built.waitForLoadState('networkidle');
            await built.screenshot({ path: output + '/' + name + '-production.png', fullPage: true });
            const text = await built.locator('body').innerText();
            console.log(name + ' production text:', text.slice(0, 180));
            assert.deepEqual(failures, [], name + ' runtime errors');
            assert.ok(text.trim().length > 10, name + ' rendered content');
            await smoke.close();
        }
        console.log('PASS: web and iOS production-bundle startup.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
