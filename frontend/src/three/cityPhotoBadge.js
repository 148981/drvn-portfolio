import * as T from 'three';
import {seasonalKit} from './seasonalBadgeKit.js';
import {badgeSilhouetteBody} from './badgeSilhouetteBody.js';
import {applySeasonalCurvature} from './seasonalCurvature.js';

export const CITY_ENAMEL={
 HKG:['#00d5eb','#ff593b'],TYO:['#ff588a','#fff029'],
 BOS:['#248cff','#ff7444'],SYD:['#00e1cf','#fff02b'],
 BER:['#c8f52b','#ffb629'],CHI:['#14ccff','#ff8933'],
 NYC:['#9eef32','#00d4c3'],TPE:['#00dfae','#ff647f'],
};

export function createCityPhotoBadge(entry){
 const k=seasonalKit(entry);
 const face=new T.MeshPhysicalMaterial({color:'#ffffff',metalness:.16,roughness:.38,clearcoat:.65,clearcoatRoughness:.24,side:T.DoubleSide,transparent:true,alphaTest:.12});
 const plane=k.add(new T.PlaneGeometry(2,2),face,`Text_${entry.month}`);plane.position.set(0,0,.02);
 // Keep the original artwork intact; select its monthly panel with texture UVs.
 const ready=typeof document==='undefined'?Promise.reject(new Error('City artwork export requires the browser exporter')):new Promise((resolve,reject)=>{
  new T.TextureLoader().load('/images/badges/reference/run-cities-thin.png',texture=>{
   const col=(entry.month-1)%4,row=Math.floor((entry.month-1)/4);
   const source=texture.image,canvas=document.createElement('canvas');
   canvas.width=Math.round(source.width/4);canvas.height=canvas.width;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const rowWindows=[[.02,.322],[.35,.624],[.635,.927]], [top,bottom]=rowWindows[row],cropHeight=(bottom-top)*source.height;
   ctx.drawImage(source,col*source.width/4,top*source.height,source.width/4,cropHeight,0,(canvas.height-cropHeight)/2,canvas.width,cropHeight);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
   // Derive the material cutout from neutral backdrop samples when an atlas
   // carries a rendered transparency grid instead of a native alpha channel.
   const bg=new Set();
   for(let x=0;x<canvas.width;x++)for(const y of [0,canvas.height-1]){
    const i=(y*canvas.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(data[i+3]>250&&Math.max(r,g,b)-Math.min(r,g,b)<4&&r>90&&r<245)bg.add(Math.round(r/8)*8);
   }
   for(let y=0;y<canvas.height;y++)for(const x of [0,canvas.width-1]){
    const i=(y*canvas.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(data[i+3]>250&&Math.max(r,g,b)-Math.min(r,g,b)<4&&r>90&&r<245)bg.add(Math.round(r/8)*8);
   }
   if(bg.size){
    const w=canvas.width,h=canvas.height,mask=new Uint8Array(w*h),queue=[];
    const neutral=p=>{const i=p*4,r=data[i],g=data[i+1],b=data[i+2];return data[i+3]===0||(Math.max(r,g,b)-Math.min(r,g,b)<32&&r>70&&r<246);};
    const visit=p=>{if(!mask[p]&&neutral(p)){mask[p]=1;queue.push(p);}};
    for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}
    for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
    for(let n=0;n<queue.length;n++){const p=queue[n],x=p%w,y=Math.floor(p/w);if(x)visit(p-1);if(x<w-1)visit(p+1);if(y)visit(p-w);if(y<h-1)visit(p+w);}
    // Keep enclosed pale architectural surfaces. Only the numeral's open
    // counters need the same neutral-background test inside the silhouette.
    for(let p=0;p<mask.length;p++){
     const x=p%w/w,y=Math.floor(p/w)/h;
     const numberZone=x>.69&&(entry.month===6?y>.56:y<.43);
     if(mask[p]||(numberZone&&neutral(p)))data[p*4+3]=0;
    }
   }
   ctx.putImageData(pixels,0,0);
   const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
   face.map=map;face.needsUpdate=true;
   const body=badgeSilhouetteBody(pixels,face,k.gold);
   k.root.remove(plane);plane.geometry.dispose();body.front.name=`Text_${entry.month}`;
   k.root.add(body.front,body.back,body.walls);
   // Emboss the existing gold numeral strokes in place, keeping the exact
   // light-weight artwork typography rather than superimposing another font.
   const numeralBounds={1:[.65,.1,.9,.45],2:[.38,.24,.66,.59],3:[.56,.1,.9,.45],4:[.7,.1,.97,.46],5:[.66,.1,.91,.46],6:[.59,.48,.87,.88],7:[.64,.48,.93,.9],8:[.68,.06,.94,.47],9:[.59,.08,.94,.47],10:[.56,.1,.96,.47],11:[.59,.11,.96,.5],12:[.62,.07,.98,.48]};
   const [x0,y0,x1,y1]=numeralBounds[entry.month],raised={width:pixels.width,height:pixels.height,data:new Uint8ClampedArray(data)};
   for(let p=0;p<data.length/4;p++){
    const x=(p%pixels.width)/pixels.width,y=Math.floor(p/pixels.width)/pixels.height,i=p*4,r=data[i],g=data[i+1],b=data[i+2];
    raised.data[i+3]=x>x0&&x<x1&&y>y0&&y<y1&&r>125&&r-b>17&&g>b+7&&r-g<65?data[i+3]:0;
   }
   const digits=badgeSilhouetteBody(raised,face,k.gold,{frontZ:.119,thickness:.025,bevel:.001,resolution:360});
   digits.front.name='Raised_month_numeral';digits.walls.name='Raised_month_numeral_sides';digits.back.geometry.dispose();
   root.add(digits.front,digits.walls);
   const cityBounds={HKG:[.65,.47,.9,.65],TYO:[.64,.68,.91,.85],BOS:[.62,.68,.94,.86],SYD:[.62,.70,.94,.9],BER:[.64,.65,.94,.86],CHI:[.55,.68,.89,.9],NYC:[.54,.69,.88,.9],TPE:[.65,.65,.96,.86]};
   if(cityBounds[entry.code]){
    const [a,b,c,d]=cityBounds[entry.code],letters={width:pixels.width,height:pixels.height,data:new Uint8ClampedArray(data)};
    for(let p=0;p<data.length/4;p++){
     const x=(p%pixels.width)/pixels.width,y=Math.floor(p/pixels.width)/pixels.height,i=p*4;
     letters.data[i+3]=x>a&&x<c&&y>b&&y<d&&Math.max(data[i],data[i+1],data[i+2])<90?data[i+3]:0;
    }
    const city=badgeSilhouetteBody(letters,face,k.dark,{frontZ:.11,thickness:.017,bevel:0,resolution:360});
    city.front.name='Raised_city_lettering';city.walls.name='Raised_city_lettering_sides';city.back.geometry.dispose();root.add(city.front,city.walls);
   }
   texture.dispose();resolve();
  },undefined,reject);
 });
 // finish() preserves named text meshes and their texture coordinates.
 const root=k.root;root.userData.artwork='original-muted-silhouette';
 // A small brand signature accompanies the unframed artwork.
 const signature=k.material('#f0e4cc');signature.metalness=.35;signature.roughness=.36;
 k.text('DRVN',.04,-.62,.048,.22,.105,signature).name='DRVN_brand_hallmark';
 k.text('EST. 2026',.04,-.675,.031,.24,.105,signature).name='DRVN_est_2026';
 const reverse=k.text('DRVN',0,-.18,.15,.65,0,signature);reverse.rotation.y=Math.PI;reverse.position.z=-.012;reverse.name='DRVN_reverse_signature';
 const date=k.text('EST. 2026',0,-.31,.065,.48,0,signature);date.rotation.y=Math.PI;date.position.z=-.012;date.name='DRVN_reverse_est_2026';
 const logoReady=new Promise((resolve,reject)=>new T.TextureLoader().load('/desktop/drvn_logo.png',map=>{
  map.colorSpace=T.SRGBColorSpace;
  const m=new T.MeshPhysicalMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.2,transparent:true,alphaTest:.08,metalness:.25,roughness:.3,side:T.DoubleSide});
  const logo=new T.Mesh(new T.PlaneGeometry(.19,.19),m);logo.position.set(-.18,-.61,.153);logo.name='DRVN_original_logo';root.add(logo);
  const reverseLogo=new T.Mesh(new T.PlaneGeometry(.58,.58),m);reverseLogo.rotation.y=Math.PI;reverseLogo.position.set(0,.18,-.008);reverseLogo.name='DRVN_reverse_original_logo';root.add(reverseLogo);resolve();
 },undefined,reject));
 Object.defineProperty(root,'artworkReady',{value:Promise.all([ready,logoReady]).then(()=>applySeasonalCurvature(root,entry.month))});
 return root;
}
