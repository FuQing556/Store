(function(root) {
  'use strict';
  const image = { width: 941, height: 1672 }, viewport = { width: 450, height: 800 };
  // Traced against the four gold corners of each bay in restaurant-portrait.png.
  const polygons = [
    [[225,449],[370,449],[365,590],[216,590]], [[571,449],[711,449],[725,590],[577,590]],
    [[209,713],[361,713],[355,875],[201,875]], [[580,713],[731,713],[742,875],[584,875]],
    [[195,1010],[356,1010],[348,1190],[185,1190]], [[585,1010],[750,1010],[758,1190],[593,1190]],
    [[182,1336],[353,1336],[346,1520],[173,1520]], [[595,1336],[765,1336],[773,1520],[600,1520]]
  ];
  function centroid(points) {
    let area=0, x=0, y=0;
    for(let i=0;i<points.length;i++) {
      const a=points[i], b=points[(i+1)%points.length], cross=a[0]*b[1]-b[0]*a[1];
      area+=cross; x+=(a[0]+b[0])*cross; y+=(a[1]+b[1])*cross;
    }
    return {x:x/(3*area),y:y/(3*area)};
  }
  const art = {
    width:1254,height:1254,alphaBounds:[74,106,1206,1097],
    // Ground placement anchor is below the visible-pixel center because furniture has height.
    ground:{x:.51,y:.60}, meal:{x:.525,y:.35}, guest:{x:.20,y:.61}
  };
  // One seated atlas cell per guest. These are hip anchors, not sprite centers or foot points.
  const people = [
    {hip:{x:.52,y:.70},seatedFoot:{x:0.7564,y:0.9922},foot:{x:.4734,y:.9688},scale:.94},
    {hip:{x:.49,y:.71},seatedFoot:{x:0.6121,y:0.998},foot:{x:.5419,y:.9785},scale:1},
    {hip:{x:.49,y:.70},seatedFoot:{x:0.6664,y:0.998},foot:{x:.4794,y:.9531},scale:1},
    {hip:{x:.53,y:.67},seatedFoot:{x:0.7904,y:0.9375},foot:{x:.5208,y:.9355},scale:.98},
    {hip:{x:.50,y:.68},seatedFoot:{x:0.6561,y:0.959},foot:{x:.5161,y:.9414},scale:1},
    {hip:{x:.49,y:.69},seatedFoot:{x:0.6687,y:0.9395},foot:{x:.5647,y:.9395},scale:1}
  ];
  const slots=polygons.map((polygon,index)=> {
    const center=centroid(polygon), row=Math.floor(index/2), size=[70,76,80,84][row];
    const ground={x:center.x/image.width*viewport.width,y:center.y/image.height*viewport.height};
    return {id:index+1,row:row+1,side:index%2?'right':'left',polygon,center,
      x:center.x/image.width*100,y:center.y/image.height*100,size,ground,
      mirror:index%2===0,
      artLeft:-(index%2===0?1-art.ground.x:art.ground.x)*size,artTop:-art.ground.y*size,
      bubbleY:row===3?-65:Math.max(...polygon.map(p=>p[1]))/image.height*viewport.height-ground.y+5,
      labelY:row===3?-52:Math.max(...polygon.map(p=>p[1]))/image.height*viewport.height-ground.y+3,
      reserved:index>=5};
  });
  function anchor(index,kind='ground') {
    const slot=slots[index]; if(!slot)return {x:50,y:27};
    const point=kind==='meal'?art.meal:kind==='guest'?art.guest:art.ground;
    return {x:(slot.ground.x+(point.x-art.ground.x)*slot.size*(slot.mirror?-1:1))/viewport.width*100,
      y:(slot.ground.y+(point.y-art.ground.y)*slot.size)/viewport.height*100};
  }
  function queuePoint(index=0) {
    return {x:(225+(index?index%2?-6:6:0))/450*100,y:(270+Math.max(0,index)*40)/800*100};
  }
  function guestGeometry(index,personIndex=0) {
    const slot=slots[index],profile=people[personIndex]||people[0];
    if(!slot)return {hip:queuePoint(),foot:queuePoint(),size:38,facing:1,profile};
    const hip=anchor(index,'guest'),size=slot.size*.54*profile.scale;
    return {hip,foot:{x:hip.x+(profile.seatedFoot.x-profile.hip.x)*size*(slot.mirror?-1:1)/450*100,y:hip.y+(profile.seatedFoot.y-profile.hip.y)*size/800*100},
      size,standingSize:40*slot.size/70,facing:slot.mirror?-1:1,profile};
  }
  function route(index,personIndex=0,queueIndex=null,exit=false) {
    const seated=guestGeometry(index,personIndex),q=queuePoint(queueIndex??0),entry={x:50,y:26};
    if(index===null||!slots[index])return exit?[q,{x:50,y:q.y},entry]:[entry,q];
    const start=queueIndex===null?entry:q,foot=seated.foot;
    // Stay in the aisle, turn in the gap BELOW the bay, then approach the aisle-facing stool.
    const turnY=Math.max(foot.y+3.2,Math.max(...slots[index].polygon.map(p=>p[1]))/image.height*100+1);
    const path=[start,{x:50,y:turnY},{x:foot.x,y:turnY},foot];
    return exit?[foot,{x:foot.x,y:turnY},{x:50,y:turnY},entry]:path;
  }
  function guides(count=5, furniture=false) {
    const cross=(x,y,color)=>`<path d="M${x-9} ${y}h18 M${x} ${y-9}v18" stroke="${color}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`;
    const body=slots.map((slot,i)=> {
      const color=i<count?'#50e9cd':'#ffd06e';
      const label=(i<count?'桌位 ':'预留 ')+slot.id;
      let content=`<polygon points="${slot.polygon.map(p=>p.join(',')).join(' ')}" fill="${color}" fill-opacity=".13" stroke="${color}" stroke-width="4" ${i>=count?'stroke-dasharray="12 8"':''}/>${cross(slot.center.x,slot.center.y,color)}<text x="${slot.center.x}" y="${Math.min(...slot.polygon.map(p=>p[1]))-12}" text-anchor="middle" fill="${color}" stroke="#1c2d24" stroke-width="4" paint-order="stroke" font-size="23" font-weight="bold">${label}</text>`;
      if(furniture) {
        const sx=image.width/viewport.width,sy=image.height/viewport.height;
        const x=(slot.ground.x+slot.artLeft)*sx,y=(slot.ground.y+slot.artTop)*sy,w=slot.size*sx,h=slot.size*sy;
        const bounds=art.alphaBounds.map(v=>v/art.width);
        content+=`<image href="assets/dining-table.png" x="${x}" y="${y}" width="${w}" height="${h}" ${slot.mirror?`transform="translate(${2*x+w} 0) scale(-1 1)"`:''} ${i>=count?'opacity=".35"':''}/><rect x="${x+(slot.mirror?1-bounds[2]:bounds[0])*w}" y="${y+bounds[1]*h}" width="${(bounds[2]-bounds[0])*w}" height="${(bounds[3]-bounds[1])*h}" fill="none" stroke="#ff9e6d" stroke-width="3"/>${cross(slot.center.x,slot.center.y,color)}`;
      }
      const hip=anchor(i,'guest'),foot=guestGeometry(i).foot;
      content+=cross(hip.x/100*image.width,hip.y/100*image.height,'#ff9cce')+`<circle cx="${foot.x/100*image.width}" cy="${foot.y/100*image.height}" r="5" fill="#9bc4ff"/>`;
      return content;
    }).join('');
    return `<svg viewBox="0 0 ${image.width} ${image.height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}<path d="M470 410V1550" stroke="#62d0ff" stroke-width="3" stroke-dasharray="16 12"/><text x="470" y="1600" text-anchor="middle" fill="#62d0ff" font-size="24">中央通道 · 保持贯通</text></svg>`;
  }
  const api={image,viewport,art,people,slots,anchor,queuePoint,guestGeometry,route,guides,kitchen:{x:50,y:79}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.BaiweiSceneLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);

