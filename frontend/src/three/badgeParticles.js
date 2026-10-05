import * as T from 'three';
import {EXTRA_BADGES} from '../utils/extraBadgeAssets.js';
import {CLUB_MISSION_MODELS} from '../utils/clubMissionBadgeAssets.js';

// Only the reference-backed collections receive effects. Unknown badges stay untouched.
const levels={bench_:[40,60,90,120],squat_:[60,100,140,180],dead_:[80,120,170,220],row_:[40,60,80,100],km_total_:[50,200,500,1000,5000,10000,40075],km_single_:[5,10,21.1,42.195,50,100],pace_:[7,5.5,4.5,3.50],run_count_:[5,25,75,150],photo_:[1,10,30,100],streak_:[7,30,90,180,270,365],weigh_:[1,10,30,60,100],partner_:[1,5,15,30]};
export function particleTier(id){
 if(CLUB_MISSION_MODELS[id])return CLUB_MISSION_MODELS[id].index/3;
 if(EXTRA_BADGES[id]?.family==='quarterly')return EXTRA_BADGES[id].index/3;
 const prefix=Object.keys(levels).find(p=>id.startsWith(p));if(!prefix)return null;
 const value=Number(id.slice(prefix.length).replaceAll('_','.')),index=levels[prefix].indexOf(value);
 return index<0?null:index/(levels[prefix].length-1);
}
export function createBadgeParticles(id,{celebrate=false}={}){
 const seasonal=id.startsWith('season_');
 const tier=particleTier(id)??(seasonal?.65:celebrate?(EXTRA_BADGES[id]?.index??1)/3:null);if(tier===null)return null;
 const club=Boolean(CLUB_MISSION_MODELS[id]);
 const seed=[...id].reduce((s,c)=>s+c.charCodeAt(0),0);
 const count=tier===1?76:12+Math.round(tier*30),positions=[],phases=[];
 for(let i=0;i<count;i++){
  const a=i*2.399963,r=1.22+((i*37)%17)/50;
  positions.push(Math.cos(a)*r,Math.sin(a)*r,((i*13)%11)/16-.3);phases.push(i*1.731+seed*.07);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('phase',new T.Float32BufferAttribute(phases,1));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:celebrate?T.NormalBlending:T.AdditiveBlending,
  uniforms:{time:{value:0},apex:{value:tier===1?1:0},strength:{value:tier===1?.85:.32+tier*.3},size:{value:tier===1?(club?6:11):2.6+tier*2.2},tint:{value:new T.Color(tier<.35?'#eee5da':tier<.8?'#eed3a0':'#daeafa')}},
  vertexShader:`attribute float phase; uniform float time; uniform float size; uniform float apex; varying float sparkle;
   void main(){vec3 p=position;float angle=time*.085*apex;p.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xy;p.y+=sin(time*.35+phase)*.04;p.x+=cos(time*.22+phase)*.025;
   sparkle=.2+.8*pow(.5+.5*sin(time*1.25+phase),8.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=size*(.6+sparkle);}`,
  fragmentShader:`uniform vec3 tint;uniform float strength;uniform float apex;uniform float time;varying float sparkle;
   void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=1.-smoothstep(.08,.5,d);float rays=pow(max(0.,1.-min(abs(p.x),abs(p.y))*35.),3.)*(1.-smoothstep(.05,.5,d));a=mix(a,a*.5+rays*.7,apex);vec3 rainbow=.85+.15*cos(vec3(0.,2.1,4.2)+time*.6+sparkle*3.);gl_FragColor=vec4(tint*mix(vec3(1.),rainbow,apex),a*strength*sparkle);}`});
 const points=new T.Points(geometry,material);points.name='Tier_particle_accents';points.frustumCulled=false;
 if(celebrate){material.uniforms.tint.value.set(club?CLUB_MISSION_MODELS[id].art[3]:tier===1?'#7992ac':'#b98945');material.uniforms.strength.value=.85;material.uniforms.size.value*=1.25;}
 return {points,update:seconds=>{material.uniforms.time.value=seconds;},dispose:()=>{geometry.dispose();material.dispose();}};
}
