import * as T from 'three';
import {athleticNumerals} from './athleticNumerals.js';
import {drvnLogoShapes} from './badgeBrand.js';
import {diamondFacets} from './badgeMaterialFinish.js';
import {sculptedRibbon} from './sculptedRibbon.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
export function createPartnerBadge(e){
 const root=new T.Group(),i=e.index;root.name=`DRVN_${e.asset}`;root.userData={asset:e.asset,title:e.name,design:'partner-runners'};
 const palette=['#eadbd6','#d5d8d9','#d2ab65','#e6edf2'];const material=new T.MeshPhysicalMaterial({color:palette[i],metalness:i===0?.5:.84,roughness:i===3?.08:.24,clearcoat:1,iridescence:i===3?1:i===0?.85:0});
 const trim=material.clone();trim.color.set(i===0?'#bdb5a8':i===1?'#f7f4ee':i===2?'#f2d99e':'#ffffff');
 const hallmark=new T.MeshStandardMaterial({color:'#49413a',metalness:.25,roughness:.35});
 function add(g,m=material,name='Partner_sculpture'){if(i===3&&m===material){g=diamondFacets(g);m.vertexColors=true;}const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;}
 function tube(points,r=.03,m=material,name='Partner_contour'){return add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24, r,8,false),m,name);}
 function relief(s,z,name,m=trim){const g=new T.ExtrudeGeometry(s,{depth:.055,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:4,curveSegments:20});g.translate(0,0,z);return add(g,m,name);}
 function limb(points,widths,z,name){
  const curve=new T.CatmullRomCurve3(points.map(([x,y])=>new T.Vector3(x,y,0))),edges=[[],[]];
  for(let j=0;j<=32;j++){
   const t=j/32,p=curve.getPoint(t),v=curve.getTangent(t),n=new T.Vector3(-v.y,v.x,0).normalize(),f=t*(widths.length-1),k=Math.min(widths.length-2,Math.floor(f)),w=T.MathUtils.lerp(widths[k],widths[k+1],f-k);
   edges[0].push(p.clone().addScaledVector(n,w));edges[1].push(p.clone().addScaledVector(n,-w));
  }
  const s=new T.Shape();[...edges[0],...edges[1].reverse()].forEach((p,j)=>j?s.lineTo(p.x,p.y):s.moveTo(p.x,p.y));s.closePath();relief(s,z,name);
 }
 function profile(x,y,z,name){const s=new T.Shape();s.moveTo(x-.065,y-.1);s.bezierCurveTo(x-.11,y-.02,x-.09,y+.10,x-.02,y+.12);s.bezierCurveTo(x+.06,y+.13,x+.09,y+.07,x+.075,y+.025);s.lineTo(x+.105,y-.008);s.lineTo(x+.074,y-.025);s.quadraticCurveTo(x+.08,y-.083,x+.035,y-.09);s.lineTo(x+.025,y-.14);s.lineTo(x-.055,y-.14);s.closePath();relief(s,z,name);}
 function runner(x,scale,lean){
  const m=trim;const z=.16;
  const silhouette=new T.Shape();silhouette.moveTo(x-.12,.20);silhouette.bezierCurveTo(x-.13,.36,x-.07,.52,x-.025,.64);silhouette.quadraticCurveTo(x+.04,.76,x+.16,.72);silhouette.quadraticCurveTo(x+.25,.68,x+.17,.54);silhouette.bezierCurveTo(x+.11,.42,x+.055,.35,x+.09,.22);silhouette.lineTo(x+.04,.15);silhouette.closePath();relief(silhouette,z,'Runner_jersey');
  profile(x+.16,.82,z,'Runner_profile');
  limb([[x-.04,.24],[x-.22,-.01],[x-.43,-.29]],[.095,.064,.026],z-.025,'Runner_trailing_leg');
  limb([[x+.025,.22],[x+.29,.075],[x+.075,-.23]],[.105,.065,.026],z+.015,'Runner_leading_leg');
  limb([[x+.075,-.23],[x+.035,-.29],[x+.14,-.30]],[.025,.03,.017],z+.015,'Runner_shoe');
  limb([[x-.43,-.29],[x-.48,-.35],[x-.37,-.36]],[.022,.028,.012],z-.025,'Runner_trailing_shoe');
  limb([[x+.015,.62],[x-.20,.43],[x-.33,.51]],[.057,.035,.021],z-.04,'Runner_back_arm');
  limb([[x+.13,.65],[x+.25,.44],[x+.37,.60]],[.061,.033,.026],z+.025,'Runner_front_arm');
 }
 // Open crescent, leaving the athletes visible through the sculptural frame.
 const shield=new T.Shape();shield.moveTo(-.4,1.08);shield.bezierCurveTo(-1.2,.9,-1.3,-.4,-.9,-.70);shield.bezierCurveTo(-.6,-.94,.5,-1,.9,-.65);shield.bezierCurveTo(.3,-.78,-.6,-.70,-.85,-.5);shield.bezierCurveTo(-1,.0,-.85,.65,-.4,.87);shield.closePath();
 add(sculptedRibbon([[-.43,1.02,-.12],[-.92,.76,-.18],[-1.12,.17,-.08],[-1.0,-.49,.10],[-.53,-.75,.13],[.23,-.79,.15],[.90,-.62,.02]],.24,{twist:.5,taper:.45} ),material,'Partner_curved_frame');
 runner(-.38,1,1.1);
 const torso=new T.Shape();torso.moveTo(.25,.62);torso.quadraticCurveTo(.37,.53,.49,.62);torso.quadraticCurveTo(.54,.54,.47,.43);torso.quadraticCurveTo(.43,.32,.48,.23);torso.quadraticCurveTo(.36,.16,.26,.25);torso.quadraticCurveTo(.32,.4,.23,.52);torso.closePath();relief(torso,.16,'Lifter_jersey');
 profile(.36,.77,.15,'Lifter_profile');
 limb([[.27,.59],[.10,.82],[.06,1.04]],[.067,.046,.025],.13,'Lifter_left_arm');
 limb([[.47,.59],[.64,.81],[.68,1.04]],[.067,.046,.025],.13,'Lifter_right_arm');
 limb([[.31,.25],[.12,.035],[-.03,-.28]],[.10,.063,.024],.13,'Lifter_left_leg');
 limb([[.44,.25],[.70,.04],[.49,-.28]],[.10,.062,.024],.19,'Lifter_right_leg');
 limb([[-.03,-.28],[-.05,-.33],[.05,-.34]],[.023,.029,.013],.13,'Lifter_left_shoe');
 limb([[.49,-.28],[.46,-.33],[.57,-.34]],[.023,.029,.013],.19,'Lifter_right_shoe');
 tube([[-.06,1.04,.16],[.8,1.04,.16]],.022,trim,'Overhead_barbell');
 for(const x of [-.08,.82]){
  for(const [offset,radius] of [[0,.14],[.055,.115]]){const p=add(new T.CylinderGeometry(radius,radius,.035,48),material,'Barbell_plate');p.rotation.z=Math.PI/2;p.position.set(x+offset,1.04,.16);}
  const rim=add(new T.TorusGeometry(.126,.007,8,48),trim,'Barbell_polished_rim');rim.rotation.y=Math.PI/2;rim.position.set(x-.02,1.04,.16);
  const hub=add(new T.CylinderGeometry(.038,.038,.14,24),trim,'Barbell_hub');hub.rotation.z=Math.PI/2;hub.position.set(x+.015,1.04,.16);
 }
 add(sculptedRibbon([[-.98,-.55,.15],[-.68,-.55,.37],[-.12,-.40,.42],[.51,-.10,.32],[.94,.30,.08],[.90,.57,-.05]],.19,{twist:.7,taper:.65}),material,'Partner_front_sweep');
 add(sculptedRibbon([[-.94,-.59,.14],[-.58,-.72,.34],[.08,-.68,.40],[.73,-.48,.28]],.20,{twist:.16,taper:.2}),trim,'Partner_signature_ribbon');
 const starShape=new T.Shape();[[0,.16],[.025,.025],[.14,0],[.025,-.025],[0,-.16],[-.025,-.025],[-.14,0],[-.025,.025]].forEach(([x,y],j)=>j?starShape.lineTo(x,y):starShape.moveTo(x,y));starShape.closePath();const star=add(new T.ExtrudeGeometry(starShape,{depth:.025,bevelEnabled:false}),trim,'Partner_progress_star');star.position.set(-.13,1.29,.15);
 const num=new T.ExtrudeGeometry(athleticNumerals(String(e.number||[1,5,15,30][i])),{depth:.035,bevelEnabled:true,bevelSize:.006,bevelThickness:.008,bevelSegments:3});num.scale(.13,.13,.13);num.computeBoundingBox();num.translate(.4-(num.boundingBox.min.x+num.boundingBox.max.x)/2,-.73,.435);add(num,hallmark,'Milestone_'+(e.number||[1,5,15,30][i]));
 const mark=new T.Group();mark.name='DRVN_brand_hallmark';root.add(mark);mark.position.set(-.3,-.70,.435);mark.scale.setScalar(.8);
 drvnLogoShapes().forEach((s,k)=>{const g=new T.ExtrudeGeometry(s,{depth:8,bevelEnabled:false});g.scale(.00011,-.00011,-.00011);g.translate(-.13,.06,.004);const o=new T.Mesh(g,hallmark);o.name='DRVN_logo_contour_'+k;mark.add(o);});
 for(const [txt,y,size] of [['DRVN',-.008,.04],['EST.2026',-.045,.024]]){const g=new T.ExtrudeGeometry(font.generateShapes(txt,size),{depth:.003,bevelEnabled:false});g.translate(-.025,y,.004);const o=new T.Mesh(g,hallmark);o.name=txt;mark.add(o);}
 root.rotation.set(.08,-.12,.02);root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root),c=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
