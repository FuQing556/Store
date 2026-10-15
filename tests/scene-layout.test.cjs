'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../src/scene-layout.js');
const {config:C}=require('../src/engine.js');
function inside(point,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
test('八个区间的几何中心在原图地面内，当前3/4/5桌保留后续三个区间',()=>{
  assert.equal(L.slots.length,8);assert.deepEqual(C.levels.slice(1).map(l=>l.tables),[3,4,5]);
  assert.deepEqual(L.slots.filter(s=>s.reserved).map(s=>s.id),[6,7,8]);
  for(const slot of L.slots){assert.ok(inside(slot.center,slot.polygon));const p=L.anchor(slot.id-1);assert.ok(Math.abs(p.x-slot.x)<1e-9);assert.ok(Math.abs(p.y-slot.y)<1e-9);}
});
test('家具地面占地不越过任何桌位的四边形，透明留白不当作可见家具',()=>{
  const [left,,right,bottom]=L.art.alphaBounds.map(n=>n/L.art.width);
  // The ground footprint includes the feet and stools; the raised tabletop projects above it.
  for(const s of L.slots){for(const x of [left,right])for(const y of [.38,bottom]){
    const point={x:(s.ground.x+(x-L.art.ground.x)*s.size*(s.mirror?-1:1))/L.viewport.width*L.image.width,y:(s.ground.y+(y-L.art.ground.y)*s.size)/L.viewport.height*L.image.height};
    assert.ok(inside(point,s.polygon),'家具占地越过桌位 '+s.id);
  }}
});
test('预留位的可见家具不进入底部操作区，首排家具不进入顶部资源栏',()=>{
  const [,top,,bottom]=L.art.alphaBounds.map(n=>n/L.art.width);
  for(const s of L.slots){const minY=s.ground.y+(top-L.art.ground.y)*s.size,maxY=s.ground.y+(bottom-L.art.ground.y)*s.size;
    assert.ok(minY>=206,'首排家具碰到顶部控件');assert.ok(maxY<708,'预留家具碰到底部控件');
  }
  // The kitchen occupies the central lane, outside all eight side bays.
  for(const s of L.slots){const minX=Math.min(...s.polygon.map(p=>p[0]))/L.image.width*450,maxX=Math.max(...s.polygon.map(p=>p[0]))/L.image.width*450;assert.ok(maxX<184||minX>266,'厨房覆盖桌位 '+s.id);}
});
test('六类顾客在左右桌位都靠通道落座，臀部和脚点均落在本区间',()=>{
  for(const slot of L.slots)for(let person=0;person<6;person++){
    const g=L.guestGeometry(slot.id-1,person);
    assert.ok(slot.side==='left'?g.hip.x>slot.x:g.hip.x<slot.x,'顾客没有坐在内侧凳子');
    for(const p of [g.hip,g.foot])assert.ok(inside({x:p.x/100*L.image.width,y:p.y/100*L.image.height},slot.polygon));
    assert.ok(g.foot.y>g.hip.y,'脚点应在凳面下方');
  }
});
test('入座与离场共用座位脚点，经中央通道和地块下方转弯',()=>{
  for(let index=0;index<8;index++){
    const foot=L.guestGeometry(index,0).foot,path=L.route(index,0),exit=L.route(index,0,null,true);
    assert.deepEqual(path.at(-1),foot);assert.deepEqual(exit[0],foot);
    assert.equal(path[1].x,50);assert.equal(path[2].y,path[1].y);
    assert.ok(path[1].y>Math.max(...L.slots[index].polygon.map(p=>p[1]))/L.image.height*100);
  }
});
test('八个排队脚点均在中央通道，相邻客人保留40像素间距',()=>{
  for(let i=0;i<8;i++){const p=L.queuePoint(i);assert.ok(p.x>45&&p.x<55);assert.ok(p.y*8>=270&&p.y*8<568);if(i)assert.ok(Math.abs((p.y-L.queuePoint(i-1).y)*8-40)<1e-8);}
});
