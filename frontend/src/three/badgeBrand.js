import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
// Three independent contours traced from desktop/applogo.png; no rectangular image plane.
export function drvnLogoShapes(){
 const a=new T.Shape();a.moveTo(224,310);a.lineTo(552,310);a.bezierCurveTo(699,305,769,411,748,561);a.lineTo(637,561);a.bezierCurveTo(650,467,607,429,534,429);a.lineTo(320,429);a.closePath();
 const b=new T.Shape();b.moveTo(243,778);b.lineTo(405,501);b.lineTo(472,584);b.lineTo(601,584);b.bezierCurveTo(625,584,706,718,751,758);b.lineTo(861,592);b.lineTo(973,593);b.lineTo(762,975);b.lineTo(526,660);b.bezierCurveTo(448,791,386,790,243,778);b.closePath();
 const c=new T.Shape();c.absellipse(861,367,62,62,0,Math.PI*2,false,0);
 return [a,b,c];
}
export function addBadgeBrand(root,entry){
 if(entry.asset?.startsWith('km_single_'))return addMountedBrand(root,entry);
 root.updateMatrixWorld(true);
 // Work in model-local coordinates: some badge families are uniformly normalized at root.
 const inverse=root.matrixWorld.clone().invert(),box=new T.Box3();
 root.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld.clone().premultiply(inverse)));}});
 let source;root.traverse(o=>{if(!source&&o.isMesh&&o.material?.color)source=o.material;});
 const metal=source?.clone()||new T.MeshPhysicalMaterial({color:'#e7ddd1',metalness:.5,roughness:.3});
 metal.vertexColors=false;metal.transparent=false;metal.opacity=1;metal.transmission=0;metal.side=T.FrontSide;
 if(metal.emissive)metal.emissive.set(0);
 const ink=metal.clone();ink.color.lerp(new T.Color(entry.index===0?'#aa8c80':'#f5eee1'),.65);ink.metalness=.3;ink.roughness=.36;ink.color.set(entry.index===0?'#9e796d':'#ede1c7');
 const brand=new T.Group();brand.name='DRVN_brand_hallmark';brand.rotation.y=Math.PI;
 // A small cast maker's plate on the reverse also provides a solid seat on open-loop silhouettes.
 const distance=entry.asset?.startsWith('km_total_');
 const seated=distance||['bench','squat','dead','row'].includes(entry.family);
 if(!seated){
  // Radial subdivisions keep the shallow curved cast base smooth under the lettering.
  const positions=[],indices=[],steps=48,rings=12;
  for(let j=0;j<=rings;j++)for(let i=0;i<=steps;i++){const a=i/steps*Math.PI*2,r=j/rings;positions.push(Math.cos(a)*.43*r,Math.sin(a)*.31*r+.05,.025);}
  for(let j=0;j<rings;j++)for(let i=0;i<steps;i++){const a=j*(steps+1)+i;indices.push(a,a+steps+1,a+1,a+1,a+steps+1,a+steps+2);}
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(positions,3));geom.setIndex(indices);geom.computeVertexNormals();brand.add(new T.Mesh(geom,metal));
 }
 drvnLogoShapes().forEach((s,i)=>{const g=new T.ExtrudeGeometry(s,{depth:14,bevelEnabled:true,bevelSize:5,bevelThickness:4,bevelSegments:3,curveSegments:20});g.scale(.00045,-.00045,-.00045);g.translate(-.27,.405,.055);g.computeVertexNormals();const m=new T.Mesh(g,ink);m.name=`DRVN_logo_contour_${i}`;brand.add(m);});
 const g=new T.ExtrudeGeometry(font.generateShapes('EST.2026',.072),{depth:.009,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:2});g.computeBoundingBox();g.translate(-(g.boundingBox.max.x+g.boundingBox.min.x)/2,-.17,.04);const m=new T.Mesh(g,ink);m.name='EST.2026';brand.add(m);
 // Cambered hallmark: every contour and the date follow the same curved casting.
 const bend=entry.design==='flame'||entry.design==='burn'||entry.family==='row'?.4:.19;
 brand.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+bend*p.getX(i)*p.getX(i));p.needsUpdate=true;o.geometry.computeVertexNormals();}});
 brand.position.set(0,box.min.y+(box.max.y-box.min.y)*.43,box.min.z+(seated?.018:-.015));
 if(distance){
 const numeral=root.children.find(o=>o.name.startsWith('Distance_')&&o.name!=='Distance_K');
 if(numeral){numeral.geometry.computeBoundingBox();const b=numeral.geometry.boundingBox;brand.scale.setScalar(.12);brand.position.x=b.min.x+numeral.position.x+.12;brand.position.y=b.max.y+numeral.position.y-.08;}
 }
 if(entry.asset==='km_total_5000'){
  const [cx,cy,cz]=root.userData.modelCenter;
  brand.scale.setScalar(1.35);brand.position.set(-cx,-.12-cy,-.44-cz);
  ink.color.set('#e2e6eb');ink.metalness=.3;ink.roughness=.3;
  const front=brand.clone();front.name='DRVN_front_signature';front.rotation.y=0;front.scale.setScalar(.48);front.position.set(-cx,-.64-cy,-.18-cz);front.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set('#37414c');}});root.add(front);
 }
 if(entry.asset?.startsWith('km_single_')){
 const [cx,cy,cz]=root.userData.modelCenter;brand.scale.setScalar(.95);brand.position.set(-cx,-.15-cy,box.min.z-.05);metal.color.set('#242b30');ink.color.set('#e8dcc8');
 const front=brand.clone();front.name='DRVN_front_signature';front.rotation.y=0;front.scale.setScalar(.48);front.position.set(-cx,-.67-cy,.12-cz);root.add(front);
 }
 root.add(brand);root.userData.brand='DRVN / EST.2026';return root;
}

// Locate a real front-facing surface before placing a compact maker's signature.
function addMountedBrand(root,entry){
 root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),meshes=[];
 root.traverse(o=>{if(o.isMesh&&o.geometry.type==='ExtrudeGeometry')meshes.push(o);});
 const ray=new T.Raycaster(),hit=(x,y)=>{ray.set(new T.Vector3(x,y,box.max.z+1),new T.Vector3(0,0,-1));return ray.intersectObjects(meshes,false)[0];};
 let chosen;
 for(const width of [.30,.22,.15]){
  const height=width*.31;
  for(let j=1;j<19;j++)for(let i=1;i<19;i++){
   const x=box.min.x+(box.max.x-box.min.x)*i/20,y=box.min.y+(box.max.y-box.min.y)*j/20;
   const hits=[[0,0],[-width/2,-height/2],[width/2,-height/2],[-width/2,height/2],[width/2,height/2]].map(([dx,dy])=>hit(x+dx,y+dy));
   if(hits.some(h=>!h)||hits.some(h=>h.object!==hits[0].object))continue;
   if(entry.asset!=='km_single_50'&&hits[0].object.name.startsWith('Milestone_')&&meshes.some(m=>!m.name.startsWith('Milestone_')))continue;
   if(Math.max(...hits.map(h=>h.point.z))-Math.min(...hits.map(h=>h.point.z))>.035)continue;
   const score=(y-box.min.y)+Math.abs(x)*.2+(hits[0].object.name.startsWith('Milestone_')?2:0);
   if(!chosen||score<chosen.score)chosen={x,y,z:hits[0].point.z,width,score,object:hits[0].object};
  }
  if(chosen)break;
 }
 if(!chosen)throw new Error('No surface for brand: '+entry.asset);
 const brand=new T.Group();brand.name='DRVN_brand_hallmark';
 const source=chosen.object.material,color=source.color;
 const luminance=color.r*.21+color.g*.72+color.b*.07;
 const material=new T.MeshPhysicalMaterial({color:luminance>.3?'#27312d':'#e5dcc9',metalness:.25,roughness:.4});
 drvnLogoShapes().forEach((shape,i)=>{const g=new T.ExtrudeGeometry(shape,{depth:8,bevelEnabled:false,curveSegments:12});g.scale(.00012,-.00012,-.00012);g.translate(-.182,.075,.002);const m=new T.Mesh(g,material);m.name='DRVN_logo_contour_'+i;brand.add(m);});
 for(const [label,size,y] of [['DRVN',.042,.009],['EST.2026',.022,-.03]]){
  const g=new T.ExtrudeGeometry(font.generateShapes(label,size),{depth:.002,bevelEnabled:false,curveSegments:8});g.translate(-.038,y,.002);const m=new T.Mesh(g,material);m.name=label;brand.add(m);
 }
 const factor=chosen.width/.27/root.scale.x;
 brand.scale.setScalar(factor);
 const p=root.worldToLocal(new T.Vector3(chosen.x,chosen.y,chosen.z+.003));brand.position.copy(p);
 root.add(brand);root.userData.brand='DRVN / EST.2026';root.userData.brandPlacement='on-body';return root;
}
