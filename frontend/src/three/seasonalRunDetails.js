import * as T from 'three';

// Secondary relief belongs to the particular landmark, rather than repeated ornament.
export function addRunBadgeDetails(k,month){
 if([3,8,11,12].includes(month))return; // Dedicated landmark meshes own their detail layers.
 const {material,gold,silver,cream,green,blue,poly,path,rect,solid,line,beam,sphere,box,leaf}=k;
 const stone=material('#b7b2a3','stone'),shadow=material('#344846','stone'),glass=material('#537782'),ivory=material('#d9d3be');
 function pine(x,y,h){
  beam([x,y,.2],[x,y+h,.2],.004,gold);
  for(let j=0;j<4;j++){const yy=y+h*.25+j*h*.18,w=h*.27*(1-j*.18);solid(poly([[x-w,yy],[x,yy+h*.4],[x+w,yy]]),j%2?green:shadow,.19+j*.012,.018,.002,'Pine_canopy');}
 }
 function wave(y,width=.48){for(let j=0;j<3;j++)line([[-width,y+j*.025,.265],[-.26,y-.026+j*.024,.275],[.04,y+.025+j*.017,.276],[.31,y+.012+j*.017,.275],[width,y+.06+j*.019,.265]],silver,.0025);}
 if([1,8,10].includes(month))wave(-.72);
 if([3,5,7,12].includes(month)){
  for(let j=0;j<10;j++){const x=-.78+j*.16;if(month===12&&Math.abs(x)<.22)continue;pine(x,-.47+Math.sin(j*2)*.024,.12+(j%3)*.025);}
 }
 if(month===1){
  // Harbour junk: gunwale, deck planks, rigging and individually ribbed sails.
  for(let j=0;j<7;j++)line([[-.82+j*.068,-.535,.424],[-.81+j*.064,-.584,.424]],silver,.0025);
  line([[-.88,-.49,.43],[-.62,-.505,.43],[-.3,-.51,.43]],silver,.008);
  for(const [x,h]of [[-.77,.48],[-.56,.62],[-.36,.43]]){
   beam([x,-.44+h,.39],[x+.125,-.49,.41],.0025,gold);
   for(let j=1;j<=6;j++)line([[x,-.44+j*h/7,.461],[x+.055,-.452+j*h/7,.467],[x+.125,-.478+j*h/7,.461]],gold,.003);
  }
  for(let j=0;j<5;j++){const xx=.215+j*.035;line([[xx,-.43,.315],[xx,.74,.315],[.29,.99,.315]],silver,.0025);}
 }
 if(month===2){
  // Stems, leaf veins and small buds connect the blossoms to the floral body.
  for(const p of [[[-.69,.09],[-.43,.36],[-.3,.69]],[[.57,-.61],[.51,-.25],[.58,.3]]]){
   line(p.map(([x,y])=>[x,y,.185]),gold,.007);
   for(let j=0;j<3;j++){const [x,y]=p[j];leaf([x,y],[x+.12,y+.06],.032,gold,.195);}
  }
  for(const [x,y]of [[-.55,.43],[.62,-.33],[.23,-.68]]){sphere(x,y,.22,.026,.037,.016,material('#dca29d'));}
  for(let j=0;j<3;j++)line([[-.76,-.47-j*.035,.257],[-.5,-.4-j*.047,.257],[-.2,-.59-j*.025,.257]],silver,.004);
 }
 if(month===3){
  // Observation decks with glazed bands; the lower tower has a real arched opening.
  for(const [y,w]of [[.08,.3],[.59,.12]]){
   box(-.29,y,.305,w,.048,.08,ivory);box(-.29,y,.351,w*.91,.021,.008,glass);
   for(let j=0;j<8;j++)box(-.29-w*.44+j*w*.125,y,.358,.002,.022,.006,silver);
   box(-.29,y+.031,.31,w*1.08,.013,.09,gold);
  }
  line([[-.58,-.64,.29],[-.48,-.36,.29],[-.29,-.25,.29],[-.1,-.36,.29],[0,-.64,.29]],material('#ac3e2d'),.013);
  for(let j=0;j<5;j++)box(-.29,.99+j*.028,.27,.043-j*.006,.014,.04,j%2?gold:ivory);
 }
 if(month===4||month===9){
  const berlin=month===9,cx=berlin?-.06:-.14,w=berlin?1.43:1.12;
  for(let j=0;j<3;j++)box(cx,-.55-j*.035,.31,w+.09+j*.07,.028,.28+j*.015,stone);
  for(let j=0;j<24;j++)box(cx-w*.48+j*w/25,.32,.451,.025,.025,.025,gold);
  for(let j=0;j<11;j++)box(cx-w*.45+j*w*.09,.391,.425,.022,.036,.025,stone);
  if(berlin){
   box(cx,.425,.32,.72,.025,.24,gold);
   for(let j=0;j<4;j++){const x=-.33+j*.17;line([[x+.048,.55,.29],[x+.085,.49,.3],[x+.09,.43,.3]],gold,.007);line([[x-.035,.46,.29],[x-.02,.41,.32]],gold,.005);}
   for(let j=0;j<4;j++)line([[-.28+j*.08,-.81,.33],[.02+(j-2)*.04,-.62,.33]],silver,.003);
  }else{
   // Recessed belfry windows and paired columns distinguish the church from a gate.
   for(let level=0;level<3;level++){
    const y=.43+level*.17,width=.29-level*.07;
    solid(rect(cx-width*.23,y,width*.46,.107),shadow,.39,.012,.005,'Belfry_recess');
    line([[cx-width*.25,y+.076,.42],[cx,y+.123,.42],[cx+width*.25,y+.076,.42]],gold,.004);
    for(const side of [-1,1])beam([cx+side*width*.36,y,.415],[cx+side*width*.36,y+.118,.415],.009,ivory);
   }
  }
 }
 if(month===5){
  for(const [x,y,r]of [[-.11,.58,.067],[.28,.63,.044],[-.35,.37,.037]]){
   solid(poly([[x,y+r],[x+r*.16,y+r*.16],[x+r,y],[x+r*.16,y-r*.16],[x,y-r],[x-r*.16,y-r*.16],[x-r,y],[x-r*.16,y+r*.16]]),gold,.19,.018,.003,'Night_star');
  }
  for(let j=0;j<16;j++){const a=1.8+j*.081,x=-.1+Math.cos(a)*.83,y=.05+Math.sin(a)*.85;sphere(x,y,.23,.015,.023,.008,ivory);}
 }
 if(month===6){
  // Latitude rings at different heights, and coastlines with smaller peninsulas.
  for(let j=-2;j<=2;j++){
   const y=j*.28,rx=Math.sqrt(.88*.88-y*y),p=[];
   for(let a=0;a<=Math.PI*2+.01;a+=.1)p.push([Math.cos(a)*rx,y+Math.sin(a)*.11,.24]);line(p,gold,.0035);
  }
  const islands=[[[.39,-.47],[.55,-.44],[.71,-.52],[.63,-.68],[.43,-.63]],[[.71,.07],[.75,-.03],[.72,-.13],[.68,-.06]],[[-.1,.74],[.02,.88],[.18,.83],[.15,.64],[.03,.65]]];
  for(const points of islands)solid(poly(points),green,.17,.035,.008,'Continental_island');
  for(const [x,y]of [[.66,.14],[.7,.18],[.55,-.12],[.6,-.18]])sphere(x,y,.205,.016,.035,.014,green);
 }
 if(month===7){
  // Thin rays end at the inner frame; furrows follow the perspective of the valley.
  for(let j=0;j<11;j++){const x=-.74+j*.14;line([[x,-.59,.235],[x*.64,-.39,.235],[x*.37,-.29,.235]],gold,.0025);}
  for(let j=0;j<4;j++)line([[-.16-j*.018,-.86+j*.082,.296],[-.07+j*.044,-.8+j*.07,.296]],silver,.003);
 }
 if(month===8){
  box(-.03,-.5,.37,1.68,.085,.13,stone);
  for(let j=0;j<28;j++){const x=-.83+j*.059;box(x,-.49,.445,.034,.046,.009,shadow);box(x,-.462,.45,.043,.006,.012,gold);}
  for(let j=0;j<10;j++){const x=-.41+j*.099,y=.45+.2*Math.sin(j/9*Math.PI);line([[x,y,.19],[x+.05,y-.045,.19],[x+.1,y,.19]],gold,.003);}
 }
 if(month===10){
  // Tiered antenna housings and a second skyline depth behind the Cloud Gate.
  for(let j=0;j<3;j++)box(-.05+j*.044,.89+j*.04,.38,.031,.19-j*.025,.07,silver);
  for(let j=0;j<7;j++)box(-.66+j*.18,-.49,.17,.095,.13+(j%3)*.05,.035,stone);
  line([[-.27,-.57,.61],[-.03,-.6,.69],[.28,-.55,.66]],shadow,.008);
 }
 if(month===11){
  const patina=material('#588b7c');
  // Sculpted brow, eyes, nose, lips and swept hair on the Statue of Liberty.
  for(const side of [-1,1]){
   sphere(-.06+side*.047,.39,.498,.03,.012,.017,patina);
   sphere(-.06+side*.042,.371,.51,.012,.006,.004,shadow);
   line([[-.06+side*.086,.45,.485],[-.06+side*.12,.31,.487],[-.06+side*.102,.19,.48]],patina,.012);
  }
  sphere(-.06,.338,.532,.019,.043,.019,patina);line([[-.091,.283,.51],[-.06,.278,.52],[-.029,.283,.51]],patina,.006);
  for(let j=0;j<8;j++)line([[-.25+j*.07,.04,.46],[-.36+j*.076,-.31,.49],[-.49+j*.1,-.8,.49]],patina,.009);
  for(let j=0;j<5;j++){const a=j*1.3;line([[-.59,.98,.43],[-.59+Math.sin(a)*.036,1.045,.43],[-.59+Math.sin(a+.7)*.021,1.13,.43]],gold,.011);}
 }
 if(month===12){
  // Eight contiguous pagoda modules, projecting cornices and inset blue glazing.
  for(let j=0;j<8;j++){
   const y=-.63+j*.157,w=.27-j*.008;
   solid(poly([[-.09-w*.5,y],[-.09+w*.5,y],[-.09+w*.39,y+.143],[-.09-w*.39,y+.143]]),glass,.46,.035,.004,'Taipei_pagoda_module');
   box(-.09,y,.508,w+.02,.015,.043,gold);
   for(let c=1;c<5;c++)line([[-.09-w*.5+c*w/5,y+.019,.51],[-.09-w*.39+c*w*.78/5,y+.132,.51]],silver,.002);
   for(let r=1;r<5;r++)box(-.09,y+r*.027,.509,w*.74,.002,.007,silver);
  }
  for(const [x,y]of [[.49,.4],[.69,.27],[.56,.13],[.8,.08]])leaf([x-.07,y-.15],[x,y-.03],.02,gold,.18);
 }
}
