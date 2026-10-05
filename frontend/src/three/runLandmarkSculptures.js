import * as T from 'three';

export function tokyoTower(k){
 const {material,beam,box,solid,poly,sphere}=k;
 const orange=material('#ec6927'),warm=material('#ffb84e'),ivory=material('#f7d8a1'),glazing=material('#385365');
 orange.emissive.set('#b44712');orange.emissiveIntensity=.16;
 const cx=-.27,z=.34;
 const levels=[[-.66,.36],[-.47,.26],[-.22,.17],[.02,.105],[.12,.096],[.35,.06],[.58,.035],[.72,.028]];
 for(let j=0;j<levels.length-1;j++){
  const [y,w]=levels[j],[yy,ww]=levels[j+1];
  for(const side of [-1,1])for(const depth of [-1,1]){
   beam([cx+side*w,y,z+depth*w*.4],[cx+side*ww,yy,z+depth*ww*.4],j<3?.013:.009,orange);
  }
  for(let n=0;n<3;n++){
   const t=n/3,t1=(n+1)/3,Y=T.MathUtils.lerp(y,yy,t),Y1=T.MathUtils.lerp(y,yy,t1),W=T.MathUtils.lerp(w,ww,t),W1=T.MathUtils.lerp(w,ww,t1);
   for(const depth of [-1,1]){
    beam([cx-W,Y,z+depth*W*.4],[cx+W,Y,z+depth*W*.4],.005,warm);
    beam([cx-W,Y,z+depth*W*.4],[cx+W1,Y1,z+depth*W1*.4],.004,orange);
    beam([cx+W,Y,z+depth*W*.4],[cx-W1,Y1,z+depth*W1*.4],.004,orange);
   }
   for(const side of [-1,1])beam([cx+side*W,Y,z-W*.4],[cx+side*W1,Y1,z+W1*.4],.004,orange);
  }
 }
 // Two observation decks and the distinctive illuminated antenna above them.
 for(const [y,w]of [[.02,.27],[.59,.115]]){
  box(cx,y,z,w,.063,.17,ivory);box(cx,y+.006,z+.091,w*.92,.027,.008,glazing);
  for(let j=0;j<12;j++)box(cx-w*.45+j*w*.082,y+.006,z+.098,.003,.028,.01,warm);
  box(cx,y+.041,z,w*1.1,.014,.19,orange);
 }
 beam([cx,.7,z],[cx,1.12,z],.014,ivory,.004);
 for(let j=0;j<13;j++)box(cx,.72+j*.027,z,.035-j*.001,.01,.038,j%2?orange:ivory);
 sphere(cx,1.145,z,.008,.008,.008,warm);
 for(const side of [-1,1])solid(poly([[cx+side*.34,-.68],[cx+side*.22,-.4],[cx+side*.29,-.43],[cx+side*.42,-.68]]),orange,.33,.11,.005,'Tower_flared_foot');
 k.line([[cx-.28,-.61,.48],[cx-.16,-.36,.48],[cx,-.27,.48],[cx+.16,-.36,.48],[cx+.28,-.61,.48]],orange,.013);
}

export function taipeiTower(k){
 const {material,beam,box,solid,poly,sphere}=k;
 const glass=material('#226664'),edge=material('#a89b72'),shade=material('#174847'),window=material('#719995');
 const cx=-.15,z=.34;
 function module(y,h,bottom,top){
  const g=new T.CylinderGeometry(top*Math.SQRT2,bottom*Math.SQRT2,h,4,1,false,Math.PI/4);
  const o=k.add(g,glass,'Taipei_tapered_storeys');o.position.set(cx,y+h/2,z);o.scale.z=.56;
  const front=z+top*.56;
  for(let floor=1;floor<8;floor++){
   const t=floor/8,r=T.MathUtils.lerp(bottom,top,t);
   box(cx,y+h*t,z+r*.56+.005,r*1.96,.0025,.006,window);
  }
  for(let c=1;c<9;c++){
   const t=(c/9-.5)*2;beam([cx+bottom*t,y+.01,z+bottom*.56+.009],[cx+top*t,y+h-.006,front+.009],.0018,window);
  }
  box(cx,y+h-.008,front+.008,top*2.16,.017,.034,edge);
  for(const side of [-1,1]){
   beam([cx+side*bottom,y,z+bottom*.56],[cx+side*top,y+h,front],.005,edge);
   sphere(cx+side*top*.84,y+h-.04,front+.016,.014,.014,.008,edge);
  }
 }
 module(-.76,.29,.17,.125);
 for(let j=0;j<8;j++)module(-.47+j*.148,.145,.107-j*.002,.142-j*.002);
 module(.72,.16,.06,.072);module(.88,.07,.047,.043);
 beam([cx,.94,z],[cx,1.18,z],.009,edge,.002);
 box(cx,.943,z,.085,.013,.08,edge);
 for(const side of [-1,1]){
  const ring=k.ring(cx+side*.078,-.52,.447,.034,.007,edge);ring.scale.x=.8;
 }
}

export function operaHouse(k){
 const {material,box,line,solid,poly,sphere}=k,ceramic=material('#fff5df'),tile=material('#d9c7a5'),glass=material('#254f61'),sandstone=material('#b48a62'),sand=material('#e4a15b','stone'),sunset=material('#f46f3e'),water=material('#226078','stone');
 function shell(left,right,tip,y,height,z){
  const uSteps=22,vSteps=18,vertices=[],indices=[];
  function point(u,v){
   const width=right-left;
   // Each sail begins as a broad low shell and sweeps to a sharp, high apex.
   const x=T.MathUtils.lerp(T.MathUtils.lerp(left,right,v),tip,u),yy=y+height*Math.pow(u,.72);
   return [x,yy,z+Math.sin(v*Math.PI)*Math.sin((1-u)*Math.PI/2)*width*.5+u*.045];
  }
  for(let u=0;u<=uSteps;u++)for(let v=0;v<=vSteps;v++)vertices.push(...point(u/uSteps,v/vSteps));
  for(let u=0;u<uSteps;u++)for(let v=0;v<vSteps;v++){const a=u*(vSteps+1)+v,b=a+vSteps+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();k.add(g,ceramic,'Curved_ceramic_shell');
  for(let rib=0;rib<=10;rib++){const p=[];for(let j=0;j<=28;j++)p.push(point(j/28,rib/10).map((n,axis)=>axis===2?n+.006:n));line(p,rib===0||rib===10?k.gold:tile,rib===0||rib===10?.008:.0022);}
  for(let row=2;row<13;row++){const p=[];for(let j=0;j<=24;j++)p.push(point(row/15,j/24).map((n,a)=>a===2?n+.003:n));line(p,tile,.0015);}
  for(let j=0;j<8;j++){const x=T.MathUtils.lerp(left,right,(j+.5)/8);box(x,y-.017,z+.04,(right-left)/9,.1,.025,glass);}
 }
 // Bennelong Point podium and its glazed lower halls.
 box(0,-.56,.31,1.8,.16,.32,sandstone);
 for(let j=0;j<26;j++)box(-.85+j*.068,-.56,.478,.036,.054,.01,glass);
 // Warm Bondi-like shoreline in front of the cool harbour: sand, sunset disc and surf lines.
 solid(poly([[-.94,-.47],[-.28,-.52],[.12,-.63],[.94,-.48],[.94,-.94],[-.94,-.94]]),sand,.19,.025,.002,'Sydney_sand_beach');
 sphere(.66,.52,.08,.16,.16,.025,sunset);
 for(let j=0;j<3;j++)line([[-.9,-.58-j*.07,.235],[-.48,-.53-j*.06,.235],[-.08,-.62-j*.05,.235],[.35,-.57-j*.06,.235],[.86,-.63-j*.05,.235]],j===0?k.gold:water,.006);
 // Paired shells fan out from separate halls, with different heights and depth.
 shell(-.85,-.39,-.93,-.47,.62,.26);
 shell(-.68,-.04,-.63,-.47,.94,.32);
 shell(-.29,.31,-.4,-.47,1.08,.38);
 shell(.15,.64,.33,-.47,.59,.31);
 shell(.51,.93,.94,-.47,.42,.34);
}

export function libertyBust(k){
 const {material,sphere,beam,line,solid,poly,box}=k,patina=material('#478779'),light=material('#70a292'),dark=material('#28544d');
 for(const mat of [patina,light,dark]){mat.metalness=.38;mat.roughness=.46;mat.clearcoat=.18;}
 const cx=-.04;
 // A draped bust with an asymmetric neckline and individually sculpted folds.
 const pos=[],idx=[],nx=44,ny=38;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const v=j/ny,u=i/nx*2-1,y=-.85+v*.92,w=.64-.36*v,x=cx+u*w;
  pos.push(x,y+.055*Math.cos(u*2),.33+.12*(1-u*u)+.027*Math.sin(u*23+v*8)*(1-v*.65));
 }
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;idx.push(a,b,a+1,b,b+1,a+1);}
 const robe=new T.BufferGeometry();robe.setAttribute('position',new T.Float32BufferAttribute(pos,3));robe.setIndex(idx);robe.computeVertexNormals();k.add(robe,patina,'Draped_bust');
 // Cheek, jaw, brow and nose form a left-facing three-quarter profile.
 sphere(cx,.12,.38,.09,.13,.07,patina);
 const head=sphere(cx,.31,.43,.143,.198,.105,patina);head.rotation.z=-.06;
 const hp=head.geometry.attributes.position;
 for(let j=0;j<hp.count;j++){
  const x=hp.getX(j)*.143,y=hp.getY(j)*.198+.31,front=Math.max(0,hp.getZ(j));
  const nose=.052*Math.exp(-(((x+.035)/.023)**2+((y-.324)/.061)**2));
  const chin=.015*Math.exp(-(((x+.015)/.05)**2+((y-.175)/.027)**2));
  hp.setZ(j,hp.getZ(j)+(nose+chin)*front/.105);
 }
 head.geometry.computeVertexNormals();
 for(const [x,y,w]of [[cx-.1,.374,.035],[cx+.025,.38,.031]]){
  line([[x-w,y,.551],[x,y+.012,.564],[x+w,y,.55]],light,.009);
  line([[x-w*.7,y-.016,.556],[x,y-.025,.559],[x+w*.7,y-.015,.55]],dark,.0035);
 }
 line([[cx-.139,.238,.553],[cx-.1,.228,.562],[cx-.057,.236,.553]],dark,.004);
 sphere(cx-.072,.19,.495,.055,.035,.028,patina);
 for(let j=0;j<11;j++){const a=j/10*Math.PI;line([[cx+Math.cos(a)*.145,.46+Math.sin(a)*.025,.47],[cx+Math.cos(a)*.174,.34,.46],[cx+Math.cos(a)*.16,.16,.39]],patina,.011);}
 // Crown diadem: visible window openings underneath seven tapered rays.
 const band=k.ring(cx,.46,.43,.158,.026,patina);band.scale.y=.47;
 for(let j=0;j<9;j++){const x=cx-.135+j*.034;sphere(x,.47,.51,.009,.022,.005,dark);}
 for(let j=0;j<7;j++){const a=.08+j*(Math.PI-.16)/6;beam([cx+Math.cos(a)*.158,.46+Math.sin(a)*.07,.43],[cx+Math.cos(a)*.36,.46+Math.sin(a)*.35,.43],.021,patina,.001);}
 // Raised arm, a gripping hand and an ornate torch bowl.
 const arm=sphere(-.4,.22,.38,.09,.27,.074,patina);arm.rotation.z=.4;
 const forearm=sphere(-.53,.63,.39,.063,.23,.058,patina);forearm.rotation.z=.14;
 for(let j=0;j<4;j++)line([[-.59,.72-j*.02,.39],[-.62,.705-j*.02,.45],[-.56,.69-j*.02,.47],[-.53,.71-j*.02,.43]],patina,.012);
 beam([-.58,.61,.4],[-.58,.99,.4],.04,patina,.053);
 const bowl=k.add(new T.LatheGeometry([new T.Vector2(.045,0),new T.Vector2(.065,.045),new T.Vector2(.13,.085),new T.Vector2(.16,.11),new T.Vector2(.16,.145)],40),patina,'Torch_bowl');bowl.position.set(-.58,.88,.4);
 for(let j=0;j<12;j++){const a=j*Math.PI/6;beam([-.58+Math.cos(a)*.15,1.015,.4+Math.sin(a)*.15],[-.58+Math.cos(a)*.15,1.065,.4+Math.sin(a)*.15],.004,k.gold);}
 for(let j=0;j<5;j++)line([[-.62+j*.022,1.02,.4],[-.63+j*.029,1.1,.42],[-.58+j*.015,1.19+(j%2)*.035,.4]],k.gold,.017);
 // Tablet sits across the shoulder; the fingers curl around its right edge.
 solid(poly([[.15,.04],[.39,.14],[.51,-.41],[.21,-.46]]),patina,.48,.06,.01,'Liberty_tablet');
 for(let j=0;j<4;j++)line([[.43,-.2-j*.024,.5],[.48,-.18-j*.025,.565],[.5,-.2-j*.024,.59]],light,.01);
}
