const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {ALL_3D_BADGES}=await import('../src/utils/benchBadgeAssets.js');
 assert.equal(Object.keys(ALL_3D_BADGES).length,77);
 assert.equal(ALL_3D_BADGES.row_40.weight,80);
 assert.equal(ALL_3D_BADGES.row_80.weight,170);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.BADGE_ORIGIN||'http://127.0.0.1:5188')+'/strength-badges.html');
  for(const [id,entry] of Object.entries(ALL_3D_BADGES)){
   await page.locator(`[data-badge="${id}"]`).click();
   await page.waitForFunction(name=>document.querySelector('canvas')?.parentElement.getAttribute('aria-label')?.startsWith(name)&&document.querySelector('[role="status"]').textContent.startsWith('拖曳'),entry.name);
   assert.equal(await page.locator('canvas').count(),1);
   await page.waitForFunction(id=>{const img=document.querySelector(`[data-badge="${id}"] img`);return img?.complete&&img.naturalWidth===512;},id);
  }
  await page.locator('[data-badge="bench_40"]').click();
  await page.getByText('拖曳旋轉 · 3D 水晶徽章',{exact:true}).waitFor();
  await page.addStyleTag({content:'.stage,.detail{display:none}'});
  await page.screenshot({path:'/private/tmp/drvn-strength-all.png',fullPage:true});
  await page.addStyleTag({content:'[data-family=bench],[data-family=squat],[data-family=dead],[data-family=row]{display:none}'});
  await page.screenshot({path:'/private/tmp/drvn-extra-badges.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: all 77 variants, matching labels/thumbnails, renderer cleanup, legacy row mapping, mobile overflow');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
