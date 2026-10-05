const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:5193';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
<script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
import Nutrition from '/src/components/NutritionPageMobile.jsx';
import '/src/index.css';
localStorage.setItem('userId','nutrition-test');
localStorage.setItem('drvn_nutrition_plan_nutrition-test',JSON.stringify({planId:'test',goalType:'recomp',currentWeight:70,targetWeight:70,committedAt:Date.now(),etaDate:new Date(Date.now()+28*86400000).toISOString(),adjustedIntake:2100,newProtein:150,newCarbs:240,newFat:60,tdee:2100,foodPrefs:{lunch:['bento_chicken_leg']}}));
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Nutrition,{userId:'nutrition-test',userProfile:{current_weight:70,height:175,age:30,gender:'male'}})));
</script></body></html>`;
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  let savedMeal=null, failNext=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/__nutrition_test__')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname.startsWith('/api/nutrition/sql/history/')) {
    const end=new Date(Date.now()-6*3600000);
    const history=[6,4,2,1].map(offset=>{const d=new Date(end);d.setDate(d.getDate()-offset);const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {date,meal_count:3,summary:{calories:1900+offset*20,protein:140,carbs:220,fats:60,fiber:20,water:2000}};});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({history})});
   }
   if(url.pathname==='/api/nutrition/sql/log') {
    if(failNext){failNext=false;return route.fulfill({status:500,contentType:'application/json',body:'{"detail":"test failure"}'});}
    savedMeal=route.request().postDataJSON();
    return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'success',entry:{...savedMeal,id:1}})});
   }
   if(url.pathname.startsWith('/api/') || url.origin!==origin) return route.fulfill({contentType:'application/json',body:JSON.stringify({summary:{calories:0,protein:0,carbs:0,fats:0,fiber:0,water:0},meals:[],history:[],results:[],sessions:[],days:[],workouts:[],plan:null})});
   return route.continue();
  });
  await page.goto(origin+'/__nutrition_test__');
  await page.waitForLoadState('networkidle');
  console.log('Initial text:',(await page.locator('body').innerText()).slice(0,700));
  if(errors.length) throw Error(errors.join('\n'));
  await page.getByRole('button',{name:'關閉教學提示',exact:true}).click();
  await page.getByRole('region',{name:'快速記錄飲食'}).getByRole('button',{name:/記錄一餐|搜尋食物並記錄今天吃了什麼/}).waitFor();
  await page.getByRole('button',{name:'雞腿便當',exact:true}).first().click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:'/private/tmp/drvn-nutrition-portion.png',fullPage:false});
  console.log('Portion:',(await page.locator('body').innerText()).slice(-1400));
  await page.getByRole('button',{name:'確認份量並記錄',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'確認份量並記錄',exact:true}).waitFor();
  assert.equal(savedMeal,null,'failed write preserves the draft');
  await page.getByRole('button',{name:'確認份量並記錄',exact:true}).click();
  await page.waitForLoadState('networkidle');
  assert.equal(savedMeal.grams,473);
  assert.equal(savedMeal.calories,802);
  assert.deepEqual(errors,[]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('region',{name:'快速記錄飲食'}).getByRole('button',{name:/記錄一餐|搜尋食物並記錄今天吃了什麼/}).click();
  await page.getByRole('textbox',{name:'搜尋食物',exact:true}).fill('蛋');
  await page.getByText('最符合的食物',{exact:true}).waitFor();
  await page.screenshot({path:'/private/tmp/drvn-nutrition-search.png',fullPage:false});
  assert.deepEqual(errors,[]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'歷史',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'分析',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await page.getByText('七日執行報告',{exact:true}).waitFor();
  await page.getByText('每日趨勢',{exact:true}).waitFor();
  await page.screenshot({path:'/private/tmp/drvn-nutrition-analysis.png',fullPage:false});
  await page.getByRole('button',{name:'總覽',exact:true}).click();
  await page.getByRole('button',{name:'查看與調整營養計畫',exact:true}).click();
  await page.getByRole('region',{name:'身體組成量測摘要',exact:true}).waitFor();
  await page.screenshot({path:'/private/tmp/drvn-nutrition-plan.png',fullPage:false});
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile overview/history/analysis, preferred dish, retained failed draft, successful 473g/802kcal retry, single-character search');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
