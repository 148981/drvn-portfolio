import {createRunShoeBadge} from './runShoeBadge.js';
import {SEASONAL_BADGES} from '../utils/seasonalBadgeAssets.js';
import {createSeasonalRunBadge} from './seasonalRunBadge.js';
import {createSeasonalStrengthBadge} from './seasonalStrengthBadge.js';
import {createQuarterBadge} from './quarterBadge.js';
import {createClubMissionBadge} from './clubMissionBadge.js';
import {CLUB_MISSION_MODELS} from '../utils/clubMissionBadgeAssets.js';
import {createPartnerBadge} from './partnerBadge.js';
import {createPrestigeBadge} from './prestigeBadge.js';
import {createPaceBadge} from './paceBadge.js';
import {createSingleRunBadge} from './singleRunBadge.js';
import {createDistanceBadge} from './distanceBadge.js';
import {addBadgeBrand} from './badgeBrand.js';
import {SPORT_BADGES} from '../utils/sportBadgeAssets.js';
import {createSportBadge} from './sportBadge.js';
import * as THREE from 'three';
import {numberShapes} from './strengthBadgeNumbers.js';
import {STRENGTH_BADGES} from '../utils/benchBadgeAssets.js';
import {nacreSurface,kgShapes,featherShape} from './badgeRelief.js';
import {EXTRA_BADGES} from '../utils/extraBadgeAssets.js';
import {createAchievementObject} from './achievementObjects.js';
import {applyBadgeFinish,diamondFacets} from './badgeMaterialFinish.js';

export function createStrengthBadge(id){
    if(SEASONAL_BADGES[id])return SEASONAL_BADGES[id].sport==='run'?createSeasonalRunBadge(SEASONAL_BADGES[id]):createSeasonalStrengthBadge(SEASONAL_BADGES[id]);
    if(CLUB_MISSION_MODELS[id])return createClubMissionBadge(CLUB_MISSION_MODELS[id]);
    if(EXTRA_BADGES[id]?.family==='quarterly')return createQuarterBadge(EXTRA_BADGES[id]);
    if(SPORT_BADGES[id]?.family==='intimacy' || EXTRA_BADGES[id]?.design==='partner')return createPartnerBadge(SPORT_BADGES[id]||EXTRA_BADGES[id]);
    if(id.startsWith('run_count_')&&SPORT_BADGES[id])return createRunShoeBadge(SPORT_BADGES[id]);
    if(id.startsWith('pace_')&&SPORT_BADGES[id])return createPaceBadge(SPORT_BADGES[id]);
    if(/^(photo_|streak_|weigh_)/.test(id)&&SPORT_BADGES[id])return createPrestigeBadge(SPORT_BADGES[id]);
    if(id.startsWith('km_single_')&&SPORT_BADGES[id])return addBadgeBrand(createSingleRunBadge(SPORT_BADGES[id]),SPORT_BADGES[id]);
    if(id.startsWith('km_total_')&&SPORT_BADGES[id])return createDistanceBadge(SPORT_BADGES[id]);
    if(Object.hasOwn(SPORT_BADGES,id))return addBadgeBrand(createSportBadge(SPORT_BADGES[id]),SPORT_BADGES[id]);
    if(Object.hasOwn(EXTRA_BADGES,id))return addBadgeBrand(createAchievementObject(EXTRA_BADGES[id]),EXTRA_BADGES[id]);
    const entry=STRENGTH_BADGES[id];
    if(!entry)throw new Error('Unsupported strength badge');
    const root=createCrystalBadge([40,60,90,120][entry.index],entry);
    const replacedMaterials=new Set();
    if(entry.index===3)root.traverse(object=>{
        if(!object.isMesh)return;
        object.geometry=diamondFacets(object.geometry);
        const finish=m=>{replacedMaterials.add(m);const next=m.clone();applyBadgeFinish(next,'diamond');next.vertexColors=true;return next;};
        object.material=Array.isArray(object.material)?object.material.map(finish):finish(object.material);
    });
    replacedMaterials.forEach(material=>material.dispose());
    root.name=`DRVN_${entry.asset}`;root.userData.title=entry.name;root.userData.asset=entry.asset;
    return addBadgeBrand(root,entry);
}

// Original, procedural geometry based on DRVN's bench_40 shield silhouette.
// The GLB exporter uses this same model: no screenshot billboard is involved.
export function createCrystalBadge(weight=40, {family='bench',weight:target=weight,index=0}={}) {
    if (![40,60,90,120].includes(weight)) throw new Error('Unsupported bench badge');
    const root = new THREE.Group();
    root.name = `DRVN_Bench_${weight}_Crystal_Shield`;
    const outline = family==='squat'?Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32)*1.15,Math.sin(i*Math.PI/32)*1.15]):
        family==='dead'?[[0,-1.2],[1,-.65],[1,.65],[0,1.2],[-1,.65],[-1,-.65]]:
        family==='row'?[[0,-.94],[.46,-.72],[.85,-.36],[1.14,.04],[1.28,.5],[1.3,.84],[.9,.54],[.46,.27],[0,.12],[-.46,.27],[-.9,.54],[-1.3,.84],[-1.28,.5],[-1.14,.04],[-.85,-.36],[-.46,-.72]]:
        [[0,-1.25],[.64,-.86],[.87,-.53],[.98,.64],[.84,1.02],[.73,1.08],[.59,.9],[0,.97],[-.59,.9],[-.73,1.08],[-.84,1.02],[-.98,.64],[-.87,-.53],[-.64,-.86]];
    const shape = new THREE.Shape(outline.map(([x,y]) => new THREE.Vector2(x,y)));
    // Thin-film interference adds view-dependent nacre rather than a uniform pink tint.
    const pearl={iridescence:1,iridescenceIOR:1.38,iridescenceThicknessRange:[230,430],clearcoat:1,clearcoatRoughness:.18};
    const glass = new THREE.MeshPhysicalMaterial({...pearl,color:'#f4e8e6',metalness:.28,roughness:.27,transmission:.12,thickness:.38,ior:1.48,envMapIntensity:.8});
    const edge = new THREE.MeshPhysicalMaterial({...pearl,color:'#fff5ef',metalness:.5,roughness:.18});
    const silver = new THREE.MeshPhysicalMaterial({...pearl,color:'#e7cddd',metalness:.42,roughness:.23,transmission:.08,thickness:.06});
    const palette = {
        40:['#fff7e9','#d8cec4','#bfc3c1','#f1e5da'],
        60:['#ffe6b3','#875137','#30231f','#cf925b'],
        90:['#f5f5ff','#8494b4','#253448','#c0c9d8'],
        120:['#f0faff','#657fae','#183d52','#f2c98c'],
    }[weight];
    if(weight!==40){
        const metallic=weight!==120;
        glass.color.set(palette[1]);glass.metalness=metallic?.7:.2;glass.roughness=metallic?.28:.12;
        glass.transmission=metallic?0:.35;glass.iridescence=metallic?.15:.65;
        edge.color.set(palette[0]);edge.iridescence=metallic?.1:.6;
        silver.color.set(palette[0]);silver.metalness=.65;silver.iridescence=metallic?.12:.5;
    }else{
        glass.color.set('#f5eee2');glass.metalness=.08;glass.roughness=.34;
        glass.transmission=.08;glass.thickness=.38;glass.iridescence=0;
        glass.clearcoatRoughness=.25;glass.envMapIntensity=.8;
        edge.color.set('#fff6eb');edge.metalness=.18;edge.roughness=.25;edge.iridescence=0;
        edge.emissive.set('#fff0d8');edge.emissiveIntensity=.35;
        glass.emissive.set('#fff5e7');glass.emissiveIntensity=.035;
        silver.color.set('#fff5ee');silver.metalness=.18;silver.roughness=.19;
        silver.transmission=.22;silver.iridescence=.5;silver.thickness=.13;
    }
    const bodyGeometry = new THREE.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:true,bevelSegments:8,steps:1,bevelSize:.035,bevelThickness:.08,curveSegments:1});
    bodyGeometry.translate(0,0,-.16);
    const body = new THREE.Mesh(bodyGeometry,glass); body.name='Beveled_crystal_body';root.add(body);

    // Individually sloped planes produce real moving highlights across the face.
    const hubs = [[-.1,.24,.3],[.46,-.25,.25],[-.42,-.35,.22]];
    const positions=[];
    for(let i=0;i<outline.length;i++) {
        const a=outline[i], b=outline[(i+1)%outline.length];
        const h=i<5?hubs[1]:i<10?hubs[0]:hubs[2];
        positions.push(a[0]*.92,a[1]*.92,.12,b[0]*.92,b[1]*.92,.12,...h);
    }
    for(const triangle of [[hubs[0],hubs[2],hubs[1]],[[0,-1.15,.12],hubs[1],hubs[2]],[[-.54,.83,.12],hubs[2],hubs[0]],[[.54,.83,.12],hubs[0],hubs[1]]]) positions.push(...triangle.flat());
    if(family!=='bench'){
        positions.length=0;
        const ring=outline.map(([x,y])=>new THREE.Vector2(x*.94,y*.94));
        for(const ids of THREE.ShapeUtils.triangulateShape(ring,[])){
            const points=ids.map(i=>[ring[i].x,ring[i].y,.13]);
            const center=[points.reduce((s,p)=>s+p[0],0)/3,points.reduce((s,p)=>s+p[1],0)/3,.16+(ids[0]%3)*.04];
            for(let i=0;i<3;i++)positions.push(...points[i],...points[(i+1)%3],...center);
        }
    }
    const facetGeometry = new THREE.BufferGeometry();
    facetGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));facetGeometry.computeVertexNormals();
    // Broad, softly blended nacre undertones survive export; iridescence supplies the shifting highlights.
    const colors=[];
    const nacre=palette.map(color=>new THREE.Color(color));
    for(let i=0;i<positions.length;i+=3){
        const x=positions[i],y=positions[i+1];
        const t=(Math.sin(x*3.2+y*2.5)+1)*.5;
        const c=nacre[y>0?0:2].clone().lerp(nacre[x>0?1:3],t*.8);
        colors.push(c.r,c.g,c.b);
    }
    facetGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const facets=new THREE.Mesh(facetGeometry,new THREE.MeshPhysicalMaterial({...pearl,color:'#ffffff',vertexColors:true,metalness:.32,roughness:.29,transmission:.06,thickness:.18,side:THREE.DoubleSide,flatShading:true}));
    if(weight!==40){facets.material.iridescence=weight===120?.65:.12;facets.material.metalness=weight===120?.4:.65;}
    if(weight===40){facets.material.iridescence=0;facets.material.metalness=.08;facets.material.roughness=.34;}
    facets.name='Cut_crystal_facets';root.add(facets);
    if(weight===40){
        facets.visible=false;
        const cream=glass.clone();cream.vertexColors=true;cream.color.set('#ffffff');cream.roughness=.22;cream.transmission=.16;cream.iridescence=.16;
        const flow=new THREE.Mesh(nacreSurface(shape,.16,['#fff7e7','#c8bfae','#f5e6da'],.035),cream);
        flow.name='Flowing_calcite_relief';root.add(flow);
    }
    // Recessed rim gives every family a readable outer edge and inner surface.
    const rimShape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x*.985,y*.985)));
    rimShape.holes.push(new THREE.Path(outline.map(([x,y])=>new THREE.Vector2(x*.925,y*.925))));
    const rimMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(rimShape,{depth:.035,bevelEnabled:true,bevelSize:.009,bevelThickness:.012,bevelSegments:3}),edge);
    rimMesh.position.z=.18;rimMesh.name='Sculpted_double_rim';root.add(rimMesh);

    function stroke(points,radius=.007,material=edge,name='Polished_edge') {
        for(let i=1;i<points.length;i++) {
            const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]);
            const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),12),material);
            mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());mesh.name=name;root.add(mesh);
        }
    }
    stroke([...outline,outline[0]].map(([x,y])=>[x*.94,y*.94,.325]),.009);
    if(family==='dead'){
        stroke([[0,1.12,.325],[0,.35,.325],[-.94,.62,.325]],.012);
        stroke([[0,.35,.325],[.94,.62,.325]],.012);
        stroke([[0,.35,.325],[0,-1.12,.325]],.012);
    }else if(family==='row'){
        for(const side of [-1,1])for(let i=4;i>=0;i--){
            const feather=featherShape(side,i),mat=glass.clone();mat.color.set(palette[i%4]);mat.roughness=.24;
            const layer=new THREE.Mesh(new THREE.ExtrudeGeometry(feather,{depth:.035,bevelEnabled:true,bevelSize:.013,bevelThickness:.012,bevelSegments:3,curveSegments:18}),mat);
            layer.position.z=.19+(4-i)*.024;layer.name=`Layered_feather_${side}_${i}`;root.add(layer);
            const sheen=mat.clone();sheen.vertexColors=true;sheen.color.set('#ffffff');
            const surface=new THREE.Mesh(nacreSurface(feather,layer.position.z+.05,[palette[0],palette[1],palette[3]],.012),sheen);
            surface.name=`Feather_sheen_${side}_${i}`;root.add(surface);
        }
    }else if(weight!==40&&family==='bench'){
        stroke([[-.89,.57,.325],[-.1,.24,.325],[.78,.85,.325]],.008);
        stroke([[-.81,-.51,.325],[-.1,.24,.325],[.01,-1.14,.325]],.008);
        stroke([[-.1,.24,.325],[.78,-.48,.325]],.008);
    }
    function extrude(s,name) {
        const g=new THREE.ExtrudeGeometry(s,{depth:.018,bevelEnabled:true,bevelSegments:6,bevelSize:.006,bevelThickness:.009,curveSegments:20});
        const material=silver.clone();
        if(weight!==40){
            const attr=g.attributes.position,tones=[];
            for(let i=0;i<attr.count;i++){
                const t=(Math.sin(attr.getX(i)*4+attr.getY(i)*5)+1)*.5;
                const c=new THREE.Color(palette[0]).lerp(new THREE.Color(palette[1]),t*.8);
                tones.push(c.r,c.g,c.b);
            }
            g.setAttribute('color',new THREE.Float32BufferAttribute(tones,3));material.vertexColors=true;material.color.set('#ffffff');
        }
        const m=new THREE.Mesh(g,material);m.position.z=.33;m.name=name;root.add(m);return m;
    }
    // Trace the reference's oversized, oblique 4 emblem rather than typesetting 40.
    // Its descending stem reaches the shield tip; the triangular counter stays open.
    const glyph=[[.21,.59],[-.85,-.28],[-.63,-.43],[-.12,-.43],[-.2,-.99],[.1,-1.12],[.18,-.44],[.29,-.44],[.31,-.28],[.18,-.28]];
    const aperture=[[-.56,-.28],[-.08,.16],[-.13,-.28]];
    const glyphs=[];
    if(family!=='bench'){
        const text=family==='squat'?['6','100','40','18'][index]:String(target/10);
        glyphs.push(...numberShapes(text));
        if(family==='row'){
            // Numerals sit over the wing roots and extend above them like the references.
            for(const s of glyphs){const paths=[s,...s.holes];for(const path of paths)for(const curve of path.curves){for(const key of ['v1','v2'])if(curve[key])curve[key].y+=.14;}}
        }
    }else if(weight===40){
        const four=new THREE.Shape(glyph.map(p=>new THREE.Vector2(...p)));
        four.holes.push(new THREE.Path(aperture.map(p=>new THREE.Vector2(...p))));
        glyphs.push(four);
    }else if(weight===60){
        const six=new THREE.Shape();six.moveTo(.42,.79);six.lineTo(-.34,-.13);
        six.bezierCurveTo(.42,.13,.54,-.54,.08,-1.07);
        six.lineTo(-.45,-.79);six.bezierCurveTo(-.89,-.59,-.86,-.28,-.58,.02);six.closePath();
        const hole=new THREE.Path();hole.absellipse(-.23,-.47,.25,.21,0,Math.PI*2,true);six.holes.push(hole);glyphs.push(six);
    }else if(weight===90){
        const nine=new THREE.Shape();nine.moveTo(.22,-.04);nine.lineTo(-.08,-1.04);nine.lineTo(-.35,-.86);nine.lineTo(-.16,-.3);
        nine.bezierCurveTo(-.91,-.51,-.92,.5,-.31,.54);nine.bezierCurveTo(.21,.62,.43,.27,.22,-.04);nine.closePath();
        const hole=new THREE.Path();hole.absellipse(-.28,.11,.22,.23,0,Math.PI*2,true);nine.holes.push(hole);glyphs.push(nine);
    }else{
        glyphs.push(new THREE.Shape([[-.76,.01],[-.29,.43],[-.38,-.9],[-.61,-.77],[-.53,.02]].map(p=>new THREE.Vector2(...p))));
        const two=new THREE.Shape();two.moveTo(-.15,.18);two.bezierCurveTo(.03,.5,.64,.4,.58,.02);
        two.bezierCurveTo(.55,-.2,.15,-.51,-.07,-.76);two.lineTo(.46,-.76);two.lineTo(.36,-.96);two.lineTo(-.36,-.96);
        two.lineTo(-.31,-.73);two.bezierCurveTo(-.12,-.47,.33,-.17,.34,.04);
        two.bezierCurveTo(.36,.24,.04,.26,-.19,-.03);two.closePath();glyphs.push(two);
    }
    glyphs.forEach((s,index)=>{
        extrude(s,`Sculpted_reference_${weight/10}_${index}`);
        const pearlescent=silver.clone();pearlescent.vertexColors=true;pearlescent.color.set('#ffffff');pearlescent.iridescence=.55;pearlescent.transmission=.19;pearlescent.roughness=.18;pearlescent.metalness=.25;
        const tones=weight===40?['#fff3df','#e0acb9','#c4d8df']:[palette[0],palette[3],'#e1d4e6'];
        const face=new THREE.Mesh(nacreSurface(s,.365,tones,.012),pearlescent);face.name='Translucent_nacre_numeral';root.add(face);
    });

    // Deterministic small crystal inclusions, with real tilted faces and no texture dependency.
    let seed=40;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const inclusions=[];
    for(let i=0;i<160;i++) {
        const x=(random()-.5)*1.55,y=(random()-.5)*1.72;
        if(y>.69||(y<-.45&&Math.abs(x)>(y+1.13)*.75))continue;
        const size=.015+random()*.09,z=.305+random()*.009;
        const angle=random()*Math.PI*2,dx=Math.cos(angle)*size,dy=Math.sin(angle)*size;
        inclusions.push(x,y,z,x+dx,y+dy,z-.018,x+dx*.4-dy*.25,y+dy*.4+dx*.25,z-.006);
    }
    const inclusionGeometry=new THREE.BufferGeometry();
    inclusionGeometry.setAttribute('position',new THREE.Float32BufferAttribute(inclusions,3));inclusionGeometry.computeVertexNormals();
    const crystals=new THREE.Mesh(inclusionGeometry,new THREE.MeshPhysicalMaterial({color:'#e9ccdc',metalness:.35,roughness:.2,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}));
    crystals.name='Fine_internal_crystal_inclusions';root.add(crystals);crystals.visible=family==='bench';
    // Small KG is geometry too, so it survives GLB export at every angle.
    const z=.37,y=family==='row'?-.8:family!=='bench'?-.94:weight===120?-.57:-.69;
    for(const s of kgShapes()){
        const mat=edge.clone();mat.emissiveIntensity=0;mat.color.set(weight===40?'#a78d90':palette[0]);mat.roughness=.3;
        const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:.014,bevelEnabled:true,bevelSize:.002,bevelThickness:.003,bevelSegments:2,curveSegments:20}),mat);
        mesh.geometry.scale(.68,.68,1);
        mesh.position.set(family==='bench'?.32:.04,y,z+.035);mesh.name='Refined_KG_lettering';root.add(mesh);
    }
    root.userData={title:`臥推 ${weight} 公斤`,format:'Original faceted crystal shield',units:'design units'};
    return root;
}

export function disposeBadge(root) {
    const geometries=new Set(),materials=new Set();
    root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
