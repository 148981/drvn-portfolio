const {chromium}=require('playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5188/seasonal-badges.html?sport=run');
  for(const month of Array.from({length:12},(_,i)=>i+1)){
   const id=`season_run_${String(month).padStart(2,'0')}`;
   const bytes=await page.evaluate(async id=>{
    const {createStrengthBadge,disposeBadge}=await import('/src/three/crystalBadge.js');
    const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const model=createStrengthBadge(id);await model.artworkReady;
    const data=await new GLTFExporter().parseAsync(model,{binary:true});disposeBadge(model);
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([data]));});
   },id);
   await fs.writeFile(`public/models/badges/${id}.glb`,Buffer.from(bytes,'base64'));console.log(`Exported ${id} with embedded original artwork`);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
