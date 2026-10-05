const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:5193';
const plan = {planId:'retry:nutrition',program_id:'retry',goalType:'recomp',currentWeight:70,targetWeight:70,committedAt:Date.now()-15*86400000,etaDate:new Date(Date.now()+28*86400000).toISOString(),adjustedIntake:2100,newProtein:150,newCarbs:240,newFat:60};
const program = {program_id:'retry',nutrition:plan};
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
<script type="module">import R from '/@react-refresh'; R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';import Center from '/src/components/TrainingFocusPlannerMobile.jsx';import '/src/index.css';
localStorage.setItem('userId','control-test');localStorage.setItem('drvn:pending-program:control-test',JSON.stringify(${JSON.stringify(program)}));
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Center,{userId:'control-test'})));
</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];let posted=null,review=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());let data={};
   if(u.pathname==='/__control_test__')return route.fulfill({contentType:'text/html',body:html});
   if(u.pathname.endsWith('/current'))data={nutrition:plan,reviews:{}};
   if(u.pathname==='/api/training-program/activate'){posted=route.request().postDataJSON();data={status:'success',nutrition:plan};}
   if(u.pathname==='/api/training-program/review'){review=route.request().postDataJSON();data={reviews:{'nutrition:retry:nutrition':[{at:Date.now(),feeling:review.feeling}]}};}
   if(u.pathname.startsWith('/api/')||u.origin!==origin)return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   return route.continue();
  });
  await page.goto(origin+'/__control_test__');await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'重試並確認計畫',exact:true}).click();
  await page.getByText('計畫已確認同步，可以前往各系統開始。',{exact:true}).waitFor();
  assert.equal(posted.program_id,'retry');
  assert.equal(await page.evaluate(()=>localStorage.getItem('drvn:pending-program:control-test')),null);
  await page.getByRole('button',{name:'恢復偏累',exact:true}).click();
  await page.getByText('回報已同步；下方已更新下一步與檢視日期。',{exact:true}).waitFor();
  assert.equal(review.cycle_id,'retry:nutrition');
  await page.getByText(/你回報恢復偏累/).waitFor();
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/private/tmp/drvn-control-consistency.png',fullPage:true});
  console.log('PASS: control center uncertain-save recovery, persisted cycle feedback, next action');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
