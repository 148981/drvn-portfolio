const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:950,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5188/seasonal-badges.html?sport=run');
  await page.evaluate(async()=>{
   const reactModule=await import('/node_modules/.vite/deps/react.js'),React=reactModule.default||reactModule;const client=await import('/node_modules/.vite/deps/react-dom_client.js'),createRoot=client.createRoot||client.default.createRoot;
   const {default:Reward}=await import('/src/components/RewardUnlockAnimation.jsx');
   const host=document.createElement('div');document.body.append(host);window.unlockClosed=0;
   createRoot(host).render(React.createElement(Reward,{reward:{id:'pc_100kg_club',name:'百公斤俱樂部',kind:'badge',tier:'gold'},onClose:()=>window.unlockClosed++}));
  });
  const canvas=page.locator('.reward-model canvas');await canvas.waitFor();
  await page.waitForTimeout(1200);const first=await canvas.screenshot();
  await page.waitForTimeout(2100);assert.equal(await page.evaluate(()=>window.unlockClosed),0,'not dismissed after two seconds');
  const middle=await canvas.screenshot({path:'/private/tmp/drvn-reward-mid.png'});assert.notDeepEqual(first,middle,'3D rotation changes view');
  await page.waitForTimeout(2500);await canvas.screenshot({path:'/private/tmp/drvn-reward-final.png'});
  await page.waitForFunction(()=>window.unlockClosed>0,{},{timeout:5000});assert.deepEqual(errors,[]);
  const {clubMissionBadgeId,CLUB_MISSION_MODELS}=await import('../src/utils/clubMissionBadgeAssets.js');
  for(const [prefix,count]of [['rc',14],['sc',13]])for(let i=1;i<=count;i++)for(const tier of ['bronze','silver','gold','platinum'])assert.ok(CLUB_MISSION_MODELS[clubMissionBadgeId(`${prefix}${i}`,tier)]);
  console.log('PASS: 27 club mappings × 4 tiers; 3D reward rotation; longer reveal; automatic close; no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
