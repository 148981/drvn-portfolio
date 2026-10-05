import * as THREE from 'three';

// Free-standing, curved amber membranes. Separated arcs leave physical gaps.
export function peeledFlame(shape,start,end,layer=0){
 const contour=shape.getSpacedPoints(160),positions=[],indices=[];
 const rows=64,cols=12;
 for(let i=0;i<=rows;i++){
  const t=start+(end-start)*i/rows,q=t*159,k=Math.min(158,Math.floor(q)),p=contour[k].clone().lerp(contour[k+1],q-k);
  for(let j=0;j<=cols;j++){
   const u=j/cols,r=.48+u*.52;
   positions.push(p.x*r,p.y*r,.18+layer*.16+Math.sin(u*Math.PI)*.26+Math.pow(u,3)*(.1+.17*Math.sin(t*Math.PI*5+layer)));
  }
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// Faceted terrain with an irregular skyline, erosion channels and discontinuous snow.
export function mountainRelief(back=false){
 const positions=[],colors=[],steps=56,rows=20;
 const peaks=back?[[-.92,-.33],[-.74,.24],[-.51,-.1],[-.28,.48],[.03,.14],[.32,.4],[.57,-.02],[.78,.28],[.94,-.32]]:
 [[-.9,-.46],[-.62,-.02],[-.42,-.23],[-.05,.61],[.13,.2],[.32,-.07],[.56,.13],[.73,-.36],[.9,-.48]];
 const skyline=x=>{let i=0;while(i<peaks.length-2&&x>peaks[i+1][0])i++;const [a,b]=[peaks[i],peaks[i+1]];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);};
 const vertex=(i,j)=>{
  const x=-.9+i/steps*1.8,bottom=-1.05+Math.abs(x)*.55,top=skyline(x),v=j/rows,y=bottom+(top-bottom)*v;
  const ridge=Math.pow(Math.max(0,Math.sin(v*Math.PI)),.7),erosion=Math.sin(x*39+y*17)*.024+Math.sin(x*19-y*31)*.018;
  const z=(back?.18:.38)+ridge*(back?.17:.43)+erosion;
  const snow=!back&&v>.68+Math.sin(x*24)*.12&&y>.06;
  const c=new THREE.Color(snow?'#e7e9ec':back?'#697689':'#353e4b');c.multiplyScalar(.65+.38*(Math.sin(x*38+y*25)+1)*.5);
  return {p:[x,y,z],c:[c.r,c.g,c.b]};
 };
 for(let i=0;i<steps;i++)for(let j=0;j<rows;j++){
  const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1),d=vertex(i+1,j+1);
  for(const v of [a,b,c,b,d,c]){positions.push(...v.p);colors.push(...v.c);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
