// Render the real meshes with one shared camera/viewport for equal shelf sizing.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  fs.mkdirSync('public/images/badges/3d',{recursive:true});
  const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
  const {ALL_3D_BADGES}=await import('../src/utils/benchBadgeAssets.js');
  for(const [id,entry] of Object.entries(ALL_3D_BADGES)){
   if(process.env.BADGE_PREFIX&&!id.startsWith(process.env.BADGE_PREFIX))continue;
   if(process.env.BADGE_ID&&process.env.BADGE_ID!==id)continue;
   await page.goto(`${process.env.BADGE_ORIGIN||'http://127.0.0.1:5188'}/strength-badges.html?id=${id}`);
   await page.getByText('拖曳旋轉 · 3D 水晶徽章',{exact:true}).waitFor();
   await page.addStyleTag({content:'body,.stage{background:transparent!important}.stage{width:512px!important;height:512px!important;border:0!important}.stage:after,[role="status"],.stage button{display:none!important}'});
   await page.waitForFunction(()=>Math.round(document.querySelector('canvas').getBoundingClientRect().width)===512);
   await page.waitForTimeout(250);
   await page.locator('canvas').screenshot({path:`public/images/badges/3d/${entry.asset}.png`,omitBackground:true});
   const glb=fs.readFileSync(`public/models/badges/${entry.asset}.glb`);
   assert.equal(glb.readUInt32LE(8),glb.length);
   const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
   assert.ok(json.nodes.some(n=>n.name===`DRVN_${entry.asset}`));
   assert.ok(json.meshes.length>1,'badge contains actual geometry layers');
   console.log(`Rendered ${entry.asset}: 512 × 512, matching exported numeral`);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
