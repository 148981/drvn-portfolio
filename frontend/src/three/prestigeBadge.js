import * as T from 'three';
import {applyBadgeFinish,diamondFacets} from './badgeMaterialFinish.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
import {athleticNumerals} from './athleticNumerals.js';
import {drvnLogoShapes} from './badgeBrand.js';
const font=new FontLoader().parse(fontData);
export function createPrestigeBadge(e){
 const photo=e.asset.startsWith('photo_'),leaf=e.asset.startsWith('streak_'),n=Number(e.number);
 const levels=photo?[1,10,30,100]:leaf?[7,30,90,180,270,365]:[1,10,30,60,100],level=levels.indexOf(n);
 const diamond=level===levels.length-1;
 const root=new T.Group();root.name=`DRVN_${e.asset}`;root.userData={asset:e.asset,title:e.name,level,brandPlacement:'on-body'};
 const colors=photo?['#f0d5d9','#805337','#d8dde0','#e5b85f']:leaf?['#fff5e7','#b77342','#ccd1d6','#dcb766','#eeebe4','#e2f3ff']:['#fff5e7','#ccd1d6','#222628','#eeebe4','#e2f3ff'];
 const body=new T.MeshPhysicalMaterial({color:colors[level],metalness:level===0?.32:.88,roughness:level===0?.25:.23,clearcoat:1,clearcoatRoughness:.13,iridescence:level===0?.32:.06});
 const rim=new T.MeshPhysicalMaterial({color:(!photo&&((leaf&&level===3)||(!leaf&&n===30)))||photo&&level===3?'#e2c895':colors[level],metalness:level===0?.25:.92,roughness:photo&&level===3?.16:.17,clearcoat:1});
 if(diamond){body.metalness=.12;body.roughness=.09;body.transmission=.35;body.thickness=.28;body.ior=2.1;body.iridescence=.55;rim.color.set('#eaf5ff');}
 if(level===0){body.metalness=.12;body.transmission=.06;body.thickness=.2;body.iridescence=.18;}
 if(photo&&level===0){body.color.set('#efd9df');body.iridescence=1;body.iridescenceThicknessRange=[170,470];body.roughness=.16;}
 if(photo&&level===1){body.color.set('#805337');body.metalness=.84;body.roughness=.28;}
 if(photo&&level===2){body.color.set('#d8dde0');body.metalness=.88;body.roughness=.24;body.anisotropy=.8;}
 if(photo&&level===2){rim.color.set('#d9ad54');rim.metalness=.9;rim.roughness=.17;}
 if(photo&&level===3){body.color.set('#dfb451');body.metalness=.9;body.roughness=.16;body.clearcoat=1;}
 if(photo&&level===3){body.color.set('#e4edf4');body.metalness=.48;body.roughness=.08;body.transmission=.16;body.thickness=.2;body.ior=2.1;body.iridescence=1;body.iridescenceThicknessRange=[170,480];rim.color.set('#e5edf5');}
 applyBadgeFinish(body,diamond?'diamond':level===0?'calcite':leaf&&level===1?'bronze':leaf&&level===3?'champagne':null);
 applyBadgeFinish(rim,diamond?'diamond':level===0?'calcite':leaf&&level===1?'bronze':leaf&&level===3?'champagne':null);
 const dark=new T.MeshPhysicalMaterial({color:'#293632',metalness:.65,roughness:.24,clearcoat:1});
 const pearl=new T.MeshPhysicalMaterial({color:'#f8eee7',metalness:.6,roughness:.19,iridescence:.35,clearcoat:1});
 function mesh(g,m=body,name='Machined_body',parent=root){if(['diamond','champagne'].includes(m.userData.finish)&&g.attributes.normal){g=diamondFacets(g,m.userData.finish);m.vertexColors=true;}const o=new T.Mesh(g,m);o.name=name;parent.add(o);return o;}
 function ex(s,z=0,d=.07,m=body,name){const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.012,bevelThickness:.014,bevelSegments:3,curveSegments:64});g.translate(0,0,z);return mesh(g,m,name);}
 function circle(r){const s=new T.Shape();s.absarc(0,0,r,0,Math.PI*2);return s;}
 function disc(r,x,y,z,m=body){const o=ex(circle(r),z,.075,m);o.position.set(x,y,0);const normal=o.geometry.attributes.normal,p=o.geometry.attributes.position;for(let i=0;i<normal.count;i++)if(normal.getZ(i)>.95){const v=new T.Vector3(p.getX(i)*.34,p.getY(i)*.34,1).normalize();normal.setXYZ(i,v.x,v.y,v.z);}return o;}
 function ring(r,t,z,m=rim){const o=mesh(new T.TorusGeometry(r,t,12,128),m,'Polished_ring');o.position.z=z;return o;}
 function tube(points,r=.009,m=rim){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),32,r,8,false),m,'Raised_detail');}
 function text(value,size,x,y,z,m=rim,parent=root,name=value){const g=new T.ExtrudeGeometry(font.generateShapes(value,size),{depth:.004,bevelEnabled:false});g.computeBoundingBox();g.translate(x-(g.boundingBox.max.x+g.boundingBox.min.x)/2,y,z);return mesh(g,m,name,parent);}
 function number(width,x,y,z){const g=new T.ExtrudeGeometry(athleticNumerals(String(n)),{depth:.065,bevelEnabled:true,bevelSize:.008,bevelThickness:.009,bevelSegments:3});g.computeBoundingBox();const b=g.boundingBox,s=Math.min(width/(b.max.x-b.min.x),.69);g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,0);g.scale(s,s,1);const normals=g.attributes.normal,p=g.attributes.position;for(let i=0;i<normals.count;i++)if(normals.getZ(i)>.95){const v=new T.Vector3(.25*Math.sin(p.getX(i)*3),p.getY(i)*.5,1).normalize();normals.setXYZ(i,v.x,v.y,v.z);}g.translate(x,y,z);return mesh(g,pearl,'Milestone_'+n);}
 function brand(x,y,z,scale=.6){const group=new T.Group();group.name='DRVN_brand_hallmark';root.add(group);group.position.set(x,y,z);group.scale.setScalar(scale);drvnLogoShapes().forEach((s,i)=>{const g=new T.ExtrudeGeometry(s,{depth:12,bevelEnabled:false});g.scale(.00024,-.00024,-.00024);g.translate(-.144,.15,.006);mesh(g,rim,'DRVN_logo_contour_'+i,group);});text('DRVN',.064,0,-.13,.006,rim,group);text('EST.2026',.035,0,-.19,.006,rim,group,'EST.2026');const ink=rim.clone();ink.color.set(level===0||diamond?'#716655':'#f1debe');ink.metalness=.4;group.traverse(o=>{if(o.isMesh)o.material=ink;});return group;}
 if(photo){
  disc(1,0,0,-.22);ring(.985,.025,-.12);ring(.95,.035,.02);ring(.83,.032,.12);ring(.73,.017,.18);
  disc(.77,0,0,.065,dark);
  const glass=new T.MeshPhysicalMaterial({color:photo&&level===3?'#c8d7e8':'#b5c2d3',metalness:.28,roughness:.09,transmission:.15,thickness:.15,clearcoat:1,iridescence:.85,iridescenceThicknessRange:[180,440]});
  const lens=mesh(new T.SphereGeometry(.66,64,32),glass,'Convex_optical_glass');lens.scale.z=.16;lens.position.z=.16;
  for(let i=0;i<120;i++){const a=i*Math.PI/60,r=.9;const o=mesh(new T.BoxGeometry(.006,.047,.013),i%5===0?rim:body,'Focus_ring_knurl');o.position.set(Math.cos(a)*r,Math.sin(a)*r,.094);o.rotation.z=a-Math.PI/2;}
  for(const a of [0,Math.PI]){const x=Math.cos(a)*.88;disc(.033,x,0,.125,rim);tube([[x-.018,0,.22],[x+.018,0,.22]],.004,dark);}
  if(level===0){ring(1.01,.055,-.035,body);}
  if(diamond)for(let i=0;i<48;i++){const a=i*Math.PI/24,o=mesh(new T.OctahedronGeometry(.038),body,'Diamond_bezel_facet');o.position.set(.94*Math.cos(a),.94*Math.sin(a),.08);o.rotation.z=a;}
  number(1.14,0,.03,.30);text('SHARES',.065,0,-.43,.285);brand(0,.59,.23,.66);
 }else if(leaf){
  // Recessed-looking fine linework sits within a solid medallion, like a minted botanical seal.
  disc(.94,0,0,-.025);ring(.915,.022,.065);ring(.86,.006,.075);
  const engraving=new T.MeshStandardMaterial({color:level===0||diamond?'#5d5548':'#33261d',metalness:.45,roughness:.5});
  const z=.062;
  function stroke(points,r=.007){const o=tube(points.map(([x,y])=>[x,y,z]),r,engraving);o.name='Botanical_engraved_line';return o;}
  function outlineLeaf(x,y,angle,len,w){const curve=new T.Shape();curve.moveTo(0,0);curve.bezierCurveTo(-w,.28*len,-w,.75*len,0,len);curve.bezierCurveTo(w,.75*len,w,.28*len,0,0);const points=curve.getPoints(24).map(p=>[x+p.x*Math.cos(angle)-p.y*Math.sin(angle),y+p.x*Math.sin(angle)+p.y*Math.cos(angle)]);stroke(points,.007);stroke([[x,y],[x-Math.sin(angle)*len*.9,y+Math.cos(angle)*len*.9]],.0035);}
  if(level<2){
   stroke([[-.045,-.44],[-.035,-.15],[.02,.13],[.06,.42]],.009);
   outlineLeaf(-.02,-.06,.8,.40,.19);outlineLeaf(.015,.05,-.72,.49,.23);
   if(level===1){outlineLeaf(.04,.28,-.05,.25,.13);outlineLeaf(-.04,-.22,1.15,.28,.13);}
  }else{
   stroke([[-.13,-.46],[-.055,-.33],[-.047,-.07],[-.22,.19]],.009);
   stroke([[.15,-.46],[.065,-.32],[.05,-.08],[.25,.20]],.009);
   stroke([[-.13,-.46],[-.22,-.49],[-.11,-.48],[-.03,-.43],[.03,-.50],[.07,-.44],[.20,-.49],[.15,-.46]],.006);
   const rows=level===2?2:3,spread=[0,0,.42,.52,.59,.63][level];
   for(let row=0;row<rows;row++){const count=(level===2?3:level===3?4:5)+(row===1?1:0),y=.01+row*.19;
    for(let j=0;j<count;j++){const x=(j/(count-1)*2-1)*spread*(1-row*.18),angle=-x*.9;
     stroke([[0,-.14],[x*.43,y-.10],[x,y]],.0045);outlineLeaf(x,y,angle,.23,.105);
    }
   }
   stroke([[-.40,-.49],[-.21,-.46],[.02,-.48],[.22,-.46],[.40,-.49]],.004);
  }
  const label=number(.40,0,0,0);label.geometry.computeBoundingBox();const lh=label.geometry.boundingBox.max.y-label.geometry.boundingBox.min.y,ls=Math.min(1,.20/lh);label.geometry.scale(ls,ls,.18);label.geometry.translate(0,-.66,.067);
  const mark=brand(0,.74,.075,.40);
  root.userData.design='engraved-botanical-medallion';

 }else{
  disc(.85,.18,.1,-.15);disc(.81,-.13,-.08,.015);const r1=ring(.81,.012,.10);r1.position.set(-.13,-.08,.10);const r2=ring(.85,.01,-.065);r2.position.set(.18,.1,-.065);
  if(diamond){for(const [x,y,z,r] of [[-.13,-.08,.11,.8],[.18,.1,-.05,.84]]){const positions=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,b=(i+1)*Math.PI/16;positions.push(x,y,z+.09,x+Math.cos(a)*r,y+Math.sin(a)*r,z,x+Math.cos(b)*r,y+Math.sin(b)*r,z);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();mesh(g,body,'Diamond_cut_disc');}}
  tube([[-.73,-1,.20],[.02,.02,.20],[.76,1.06,.20]],.021);
  const ball=mesh(new T.SphereGeometry(.092,32,20),rim,'Balance_counterweight');ball.position.set(-.37,-.51,.24);
  number(.78,.20,-.32,diamond?.25:.15);const hallmark=brand(-.32,.29,diamond?.23:.108,.65);hallmark.traverse(o=>{if(o.isMesh){o.material=rim.clone();o.material.color.set(level===2?'#f1d29a':'#665d55');}});
 }
 root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root),c=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());root.userData.modelCenter=c.toArray();root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
