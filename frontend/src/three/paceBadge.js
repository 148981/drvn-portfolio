import * as T from 'three';
import {applyBadgeFinish,diamondFacets} from './badgeMaterialFinish.js';
import {athleticNumerals} from './athleticNumerals.js';
import {drvnLogoShapes} from './badgeBrand.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
export function createPaceBadge(e){
 const root=new T.Group(),i=e.index;root.name=`DRVN_${e.asset}`;
 root.userData={asset:e.asset,title:e.name};
 const face=new T.MeshPhysicalMaterial({color:['#f6eee2','#477f99','#dfba72','#dcecff'][i],metalness:i===0?.25:.9,roughness:.21,clearcoat:1,iridescence:i===3?.65:.08});
 const edge=face.clone();edge.color.set(['#fff6e7','#79bcd5','#f9df9c','#f0e8ff'][i]);edge.roughness=.13;
 applyBadgeFinish(face,['calcite','champagne','bronze','diamond'][i]);applyBadgeFinish(edge,['calcite','champagne','bronze','diamond'][i]);
 const inset=face.clone();inset.color.set(i===3?'#6480ad':'#293745');
 const blue=new T.MeshPhysicalMaterial({color:i===3?'#ae8bfb':'#8de2ff',metalness:.65,roughness:.14,iridescence:.7});
 const poly=p=>new T.Shape(p.map(v=>new T.Vector2(...v)));
 function add(shape,z,depth,mat,name){const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.016,bevelThickness:.018,bevelSegments:4,curveSegments:72});g.translate(0,0,z);const normal=g.attributes.normal,p=g.attributes.position;for(let j=0;j<normal.count;j++)if(normal.getZ(j)>.9){const v=new T.Vector3(.22*p.getX(j),.4*p.getY(j),1).normalize();normal.setXYZ(j,v.x,v.y,v.z);}const geometry=i===3||i===1?diamondFacets(g,i===1?'champagne':'diamond'):g;if(i===3||i===1)mat.vertexColors=true;const m=new T.Mesh(geometry,mat);m.name=name;root.add(m);return m;}
 if(i===0){
  const band=new T.Shape();band.moveTo(-.95,-.39);band.bezierCurveTo(-.5,-.82,.5,-.35,.95,-.14);band.bezierCurveTo(.4,-.3,-.4,-.55,-.95,-.39);add(band,.03,.12,face,'Lower_flowing_ribbon');
  const upper=new T.Shape();upper.moveTo(-.9,.16);upper.bezierCurveTo(-.3,.66,.6,.81,.95,.4);upper.bezierCurveTo(.5,.57,-.3,.4,-.9,.16);add(upper,-.05,.09,face,'Upper_flowing_ribbon');
 }
 if(i===1){
  // Blue titanium: a swept, curved turbine wing with three trailing vanes.
  for(let j=0;j<3;j++){const y=.22+j*.20,s=new T.Shape();s.moveTo(-1.15,y-.22);s.bezierCurveTo(-.25,y+.02,.61,y+.66,1.02,y+.36);s.bezierCurveTo(.67,y+.12,-.3,y-.13,-1.15,y-.22);add(s,-.12+j*.06,.09,j%2?edge:face,'Turbine_vane_'+j);}
  add(poly([[-1.0,-.63],[-.55,-.43],[.98,-.39],[.66,-.65]]),-.05,.09,face,'Lower_brand_wing');
 }else if(i===2){
  // Champagne alloy: two long opposed spear wings, open through the middle.
  add(poly([[-1.24,.16],[1.23,.92],[.65,.35],[-.53,.12]]),-.02,.11,face,'Upper_spear_wing');
  add(poly([[-1.20,-.78],[-.58,-.35],[1.12,-.16],[.50,-.60]]),-.05,.09,face,'Lower_brand_wing');
  add(poly([[-.94,.44],[.93,.99],[.43,.55]]),-.12,.05,edge,'Spear_highlight');
 }else if(i===3){
  // Crystal: split arrow tips and transparent, faceted swept wings.
  applyBadgeFinish(face,'diamond');
  for(let j=0;j<3;j++){const x=.98-j*.26,y=.89-j*.13;add(poly([[-1.2+j*.12,.20-j*.18],[x,y],[x-.26,y-.49],[-.44,.09-j*.15]]),-.14+j*.055,.08,face,'Crystal_arrow_'+j);}
  add(poly([[-1.12,-.78],[-.48,-.50],[1.10,-.33],[.61,-.67]]),-.05,.09,face,'Lower_brand_wing');
  const line=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-1.1,.21,-.025),new T.Vector3(.10,.6,-.025),new T.Vector3(.98,.89,-.025)]),40,.012,8,false),blue);root.add(line);
 }

 const g=new T.ExtrudeGeometry(athleticNumerals(e.number),{depth:.05,bevelEnabled:true,bevelSize:.009,bevelThickness:.012,bevelSegments:4});g.computeBoundingBox();const b=g.boundingBox,w=b.max.x-b.min.x;g.translate(-(b.max.x+b.min.x)/2,-.5,0);g.scale(1.38/w,1.38/w,1);g.translate(0,0,.20);const numeralMaterial=edge.clone();numeralMaterial.color.set('#f1ede6');numeralMaterial.vertexColors=false;numeralMaterial.transmission=0;numeralMaterial.metalness=.65;const number=new T.Mesh(g,numeralMaterial);number.name='Milestone_'+e.number;root.add(number);
 const mark=new T.Group();mark.name='DRVN_brand_hallmark';root.add(mark);mark.position.set(i===0?.12:.05,i===0?-.42:-.53,i===0?.174:.07);mark.scale.setScalar(1.3);
 const ink=edge.clone();ink.vertexColors=false;ink.transmission=0;ink.color.set(i===0||i===3?'#665445':'#e5d9c4');ink.metalness=.4;
 drvnLogoShapes().forEach((shape,k)=>{const geo=new T.ExtrudeGeometry(shape,{depth:8,bevelEnabled:false});geo.scale(.00010,-.00010,-.00010);geo.translate(-.13,.065,.004);const mesh=new T.Mesh(geo,ink);mesh.name='DRVN_logo_contour_'+k;mark.add(mesh);});
 for(const [value,y,size] of [['DRVN',.008,.035],['EST.2026',-.03,.022]]){const geo=new T.ExtrudeGeometry(font.generateShapes(value,size),{depth:.003,bevelEnabled:false});geo.translate(-.025,y,.004);const mesh=new T.Mesh(geo,ink);mesh.name=value;mark.add(mesh);}
 root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),c=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());root.userData.modelCenter=c.toArray();root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
