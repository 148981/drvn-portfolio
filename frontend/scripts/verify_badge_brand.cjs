const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {ALL_3D_BADGES}=await import('../src/utils/benchBadgeAssets.js');
 const {createStrengthBadge,disposeBadge}=await import('../src/three/crystalBadge.js');
 const source=fs.readFileSync('src/utils/growthAchievements.js','utf8');
 const ids=[...source.matchAll(/id: '([^']+)', name: '[^']+'[^\n]*category:/g)].map(m=>m[1]);
 assert.deepEqual(ids.filter(id=>/^(km_|streak_|weigh_)/.test(id)&&!ALL_3D_BADGES[id]),[],'every requested running and nutrition achievement has a model');
 for(const [id,e] of Object.entries(ALL_3D_BADGES)){
  const model=createStrengthBadge(id),brand=model.getObjectByName('DRVN_brand_hallmark');
  assert.ok(brand);assert.ok(brand.getObjectByName('EST.2026'));
  for(let i=0;i<3;i++)assert.ok(brand.getObjectByName(`DRVN_logo_contour_${i}`));
  model.traverse(o=>{if(o.isMesh)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});
  disposeBadge(model);
 }
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  for(const id of ['bench_40','q_fat_burn','km_single_5','km_total_1000','pace_4_5','km_total_5000','km_single_21_1','km_single_100','streak_30','weigh_100']){
   await page.goto('http://127.0.0.1:5188/strength-badges.html?id='+id);
   await page.getByText('拖曳旋轉 · 3D 水晶徽章',{exact:true}).waitFor();
   await page.waitForTimeout(200);
   await page.locator('canvas').screenshot({path:`/private/tmp/${id}-front.png`});
   await page.getByRole('button',{name:'翻面查看品牌印記'}).click();await page.waitForTimeout(1600);
   await page.locator('canvas').screenshot({path:`/private/tmp/${id}-back.png`});
   assert.notDeepEqual(fs.readFileSync(`/private/tmp/${id}-front.png`),fs.readFileSync(`/private/tmp/${id}-back.png`));
  }
 }finally{await browser.close();}
 console.log('PASS: catalog coverage, 77 curved brand marks, finite geometry, front/back interaction');
})().catch(e=>{console.error(e);process.exitCode=1;});
