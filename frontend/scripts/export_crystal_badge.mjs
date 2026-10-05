import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createStrengthBadge, disposeBadge } from '../src/three/crystalBadge.js';

import {ALL_3D_BADGES} from '../src/utils/benchBadgeAssets.js';
import {CITY_ENAMEL} from '../src/three/cityPhotoBadge.js';

// GLTFExporter uses the browser FileReader interface for binary buffer packing.
globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();}); }
    readAsDataURL(blob) { blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onloadend?.();}); }
};
for(const [id,entry] of Object.entries(ALL_3D_BADGES)){
if(process.env.BADGE_PREFIX&&!id.startsWith(process.env.BADGE_PREFIX))continue;
if(entry.sport==='run'){console.log(`${id}: texture export handled by scripts/export_city_badges.cjs`);continue;}
const model=createStrengthBadge(id);
try {
    const glb=await new GLTFExporter().parseAsync(model,{binary:true});
    const directory=new URL('../public/models/badges/',import.meta.url);
    await mkdir(directory,{recursive:true});
    const output=new URL(`${entry.asset}.glb`,directory);
    await writeFile(output,Buffer.from(glb));
    let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
    console.log(JSON.stringify({path:fileURLToPath(output),bytes:glb.byteLength,triangles}));
} finally {disposeBadge(model);}
}
