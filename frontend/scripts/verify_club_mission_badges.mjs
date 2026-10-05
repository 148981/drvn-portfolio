import assert from 'node:assert/strict';
import {CLUB_MISSION_MODELS,clubMissionBadgeId} from '../src/utils/clubMissionBadgeAssets.js';
import {createClubMissionBadge} from '../src/three/clubMissionBadge.js';
const missions=['rc3','rc4','rc5','rc6','rc7','rc8','rc9','rc11','rc12','sc3','sc4','sc5','sc6','sc7','sc8','sc9','sc10','sc11'];
let largest=0;
for(const id of missions)for(const tier of ['bronze','silver','gold','platinum']){
 const badgeId=clubMissionBadgeId(id,tier),entry=CLUB_MISSION_MODELS[badgeId];
 assert.ok(entry,`${id}/${tier} resolves to a model`);
 const root=createClubMissionBadge(entry);let triangles=0,meshes=0,facets=0;
 assert.ok(root.getObjectByName('DRVN_brand_hallmark'));
 assert.ok(root.getObjectByName('DRVN_reverse_signature'));
 root.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;triangles+=(g.index?.count??g.attributes.position.count)/3;
  for(const value of g.attributes.position.array)assert.ok(Number.isFinite(value),`${badgeId} invalid vertex`);
  if(g.attributes.color)facets++;
  g.dispose();o.material.dispose();
 });
 assert.ok(meshes>10,`${badgeId} has layered geometry`);
 if(tier==='platinum')assert.ok(facets>0,`${badgeId} has diamond cut surfaces`);
 assert.ok(triangles<110000,`${badgeId} triangle budget`);largest=Math.max(largest,triangles);
}
assert.equal(clubMissionBadgeId('rc1','gold'),null,'Unreferenced missions keep their existing fallback');
console.log(`PASS: 18 designs × 4 tiers; finite geometry, two DRVN hallmarks, diamond faces. Largest: ${largest} triangles.`);
