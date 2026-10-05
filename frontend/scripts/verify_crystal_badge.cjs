const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const origin=process.env.BADGE_ORIGIN||'http://127.0.0.1:5188';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/badge-preview.html');await page.getByText('拖曳旋轉 · 3D 水晶徽章',{exact:true}).waitFor();
  for(const weight of [60,90,120,40]){
   await page.getByRole('button',{name:`${weight} KG`,exact:true}).first().click();
   await page.waitForFunction(w=>document.querySelector('canvas')?.parentElement?.getAttribute('aria-label')?.startsWith(`臥推 ${w} 公斤`)&&document.querySelector('[role="status"]')?.textContent==='拖曳旋轉 · 3D 水晶徽章',weight);
   await page.getByText('拖曳旋轉 · 3D 水晶徽章',{exact:true}).waitFor();
   await page.getByRole('img',{name:new RegExp(`臥推 ${weight} 公斤，3D`)}).waitFor();
   assert.equal(await page.locator('canvas').count(),1,'variant change disposes previous renderer');
  }
  await page.screenshot({path:'/private/tmp/drvn-bench-series.png',fullPage:true});
  const model=page.getByRole('img',{name:/3D 水晶徽章/});
  await page.screenshot({path:'/private/tmp/drvn-badge-3d-front.png'});
  await model.focus();
  const first=await page.locator('canvas').screenshot();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  assert.notDeepEqual(await page.locator('canvas').screenshot(),first,'rotation must change real rendered geometry');
  await model.evaluate(el=>el.blur());
  await page.screenshot({path:'/private/tmp/drvn-badge-3d-angle.png'});
  await page.getByRole('button',{name:'對照原始徽章'}).click();assert.equal(await page.locator('canvas').count(),0,'closing view releases its WebGL canvas');
  await page.getByRole('button',{name:'查看 3D 模型'}).click();await page.getByText('拖曳旋轉 · 3D 水晶徽章',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/drvn-badge-3d-mobile.png',fullPage:true});
  await page.locator('canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByText('徽章圖片預覽',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  const glb=fs.readFileSync('public/models/badges/bench_40.glb');assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(8),glb.length);
  console.log('PASS: WebGL render, keyboard rotation, remount cleanup, mobile viewport, context-loss fallback, GLB header');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
