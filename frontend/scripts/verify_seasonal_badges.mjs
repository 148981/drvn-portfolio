import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SEASONAL_BADGES} from '../src/utils/seasonalBadgeAssets.js';
let largest=0;
assert.equal(Object.keys(SEASONAL_BADGES).length,24);
for(const sport of ['run','strength'])assert.deepEqual(Object.values(SEASONAL_BADGES).filter(e=>e.sport===sport).map(e=>e.month),Array.from({length:12},(_,j)=>j+1));
for(const e of Object.values(SEASONAL_BADGES)){
 const buffer=await readFile(new URL(`../public/models/badges/${e.asset}.glb`,import.meta.url));
 assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(8),buffer.length);
 const json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
 assert.ok(json.nodes.some(n=>n.name===`DRVN_${e.asset}`));
 assert.ok(json.nodes.some(n=>n.name==='DRVN_brand_hallmark'));
 assert.ok(json.nodes.some(n=>n.name===`Text_${e.month}`));
 assert.ok(json.meshes.length>=(e.sport==='run'?3:5));
 const city=e.sport==='run';
 if(city)assert.ok(json.images?.some(image=>image.bufferView!==undefined),'Original city artwork embedded in GLB');
 else assert.ok(!json.images?.length,'Native seasonal geometry');
 if(city){
  for(const name of ['Silhouette_metal_edge','Solid_metal_reverse','Raised_month_numeral','DRVN_original_logo','DRVN_est_2026','DRVN_reverse_est_2026'])assert.ok(json.nodes.some(n=>n.name===name&&n.mesh!==undefined),`${e.asset}: ${name}`);
  const edge=json.nodes.find(n=>n.name==='Silhouette_metal_edge');
  const p=json.meshes[edge.mesh].primitives[0],a=json.accessors[p.attributes.POSITION];
  assert.ok(a.max[2]-a.min[2]>.05&&a.max[2]-a.min[2]<.23,`${e.asset}: slim curved badge bounds`);
 }
 let vertices=0;for(const mesh of json.meshes)for(const p of mesh.primitives){const a=json.accessors[p.attributes.POSITION];vertices+=p.indices===undefined?a.count:json.accessors[p.indices].count;assert.ok(a.min.every(Number.isFinite)&&a.max.every(Number.isFinite));}
 largest=Math.max(largest,vertices/3);
 assert.ok(vertices/3<300000,`${e.asset} geometry budget`);
}
console.log(`PASS: 24 GLB files, 12 months per sport, actual layered meshes, month numerals, DRVN and finite bounds. Largest ${Math.round(largest)} triangles.`);
