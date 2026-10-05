import * as T from 'three';

// Build both faces and the perimeter walls from the artwork's cutout.
// The silhouette includes numeral openings, rather than a rectangular backing.
export function badgeSilhouetteBody(pixels,frontMaterial,metal,{frontZ=.092,thickness=.075,bevel=.004,resolution=180}={}){
 const n=resolution,{width:w,height:h,data}=pixels,filled=new Uint8Array(n*n);
 const sample=(x,y)=>data[(Math.min(h-1,Math.floor(y*h))*w+Math.min(w-1,Math.floor(x*w)))*4+3]>128;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)filled[y*n+x]=sample((x+.5)/n,(y+.5)/n)?1:0;
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){
  const a=y*n+x,b=a+1,c=a+n,d=c+1;
  if((filled[a]&&filled[d]&&!filled[b]&&!filled[c])||(filled[b]&&filled[c]&&!filled[a]&&!filled[d]))filled[a]=filled[b]=filled[c]=filled[d]=1;
 }
 const inside=(x,y)=>x>=0&&y>=0&&x<n&&y<n&&filled[y*n+x];
 const paths=new Map();
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(inside(x,y)){
  const c=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
  for(const [a,b,dx,dy]of [[0,1,0,-1],[1,2,1,0],[2,3,0,1],[3,0,-1,0]])if(!inside(x+dx,y+dy))paths.set(c[a].join(','),c[b]);
 }
 const outline=new T.ShapePath();
 while(paths.size){
  const start=paths.keys().next().value,points=[];let key=start;
  while(paths.has(key)){points.push(key.split(',').map(Number));const next=paths.get(key);paths.delete(key);key=next.join(',');if(key===start)break;}
  if(points.length<4||key!==start)continue;
  const smooth=points.length<16?points.map(([x,y])=>[x/n*2-1,1-y/n*2]):points.map((_,i)=>{
   let x=0,y=0;for(let j=-2;j<=2;j++){const p=points[(i+j+points.length)%points.length];x+=p[0];y+=p[1];}return [x/5/n*2-1,1-y/5/n*2];
  });
  const stride=points.length<16?1:2;
  outline.moveTo(...smooth[0]);for(let i=stride;i<smooth.length;i+=stride)outline.lineTo(...smooth[i]);outline.currentPath.closePath();
 }
 const shapes=outline.toShapes(false);
 const cap=new T.ShapeGeometry(shapes);const pos=cap.attributes.position,tex=cap.attributes.uv;
 for(let i=0;i<pos.count;i++)tex.setXY(i,(pos.getX(i)+1)/2,(pos.getY(i)+1)/2);
 cap.translate(0,0,frontZ);
 const face=new T.Mesh(cap,frontMaterial);face.name='Artwork_relief';
 const cast=new T.ExtrudeGeometry(shapes,{depth:thickness,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,steps:1,curveSegments:8});cast.translate(0,0,frontZ-thickness-bevel-.002);
 const body=new T.Mesh(cast,metal);body.name='Silhouette_metal_edge';
 const reverse=new T.Mesh(new T.ShapeGeometry(shapes),metal);reverse.position.z=frontZ-thickness-2*bevel-.003;reverse.name='Solid_metal_reverse';
 return {front:face,back:reverse,walls:body};
}
