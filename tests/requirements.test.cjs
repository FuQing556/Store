'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, config: C } = require('../src/engine.js');
// Independently transcribed from the target DOCX sections 3.2–3.5 and 5.1.
test('目标文档3.2–3.3：饭馆容量、升级消耗及厨师数值逐项一致', () => {
  assert.deepEqual(C.levels.slice(1).map(l=>[l.name,l.tables,l.queue,l.stoves,l.menu,l.arrivals,l.cost.cash,l.cost.fragments]), [
    ['折叠面摊',3,5,1,3,2,0,0], ['家常小饭馆',4,6,2,5,2.4,300,2], ['热闹小酒楼',5,8,3,7,2.8,900,6]
  ]);
  assert.deepEqual(C.chefs.slice(1).map(c=>[c.name,c.speed,c.cost]), [['学徒帮厨',1,0],['家常厨师',1.25,200],['掌勺厨师',1.5,600]]);
});
test('目标文档3.4：全部12道菜的ID、名称、品级、售价、烹饪和研发成本一致', () => {
  assert.deepEqual(C.dishes.map(d=>[d.id,d.name,d.tier,d.price,d.cook,d.cost.cash,d.cost.red,d.cost.green,d.cost.blue]), [
    ['D0101','阳春面',1,8,8,0,0,0,0], ['D0102','青菜汤面',1,8,9,0,0,0,0], ['D0103','葱油拌面',1,9,10,0,0,0,0], ['D0104','香煎葱油饼',1,10,12,60,1,3,0],
    ['D0201','红烧牛肉面',2,18,18,180,3,1,0], ['D0202','番茄鸡蛋饭',2,16,16,160,2,2,0], ['D0203','香菇滑鸡饭',2,20,22,220,2,2,1], ['D0204','鲜肉小馄饨',2,18,20,180,2,3,0],
    ['D0301','猪肉白菜水饺',3,32,30,420,3,3,1], ['D0302','宫保鸡丁套餐',3,38,36,520,4,2,1], ['D0303','鱼香肉丝饭',3,36,34,500,4,3,1], ['D0304','酱爆猪肝饭',3,34,32,460,5,2,1]
  ]);
  const g=new Game(); assert.deepEqual(g.s.unlocked,['D0101','D0102','D0103']); assert.deepEqual(g.s.menu,g.s.unlocked);
  assert.deepEqual([g.s.level,g.s.chef,g.s.cash,g.s.red,g.s.green,g.s.blue,g.s.fragments],[1,1,0,0,0,0,0]);
});
test('目标文档3.5及5.1：客人时限、溢价、掉落、到访概率及药丸奖励概率一致', () => {
  assert.deepEqual(C.guests.map(g=>[g.name,g.tier,g.accepts,g.prefer||null,g.patience,g.wait,g.pay,g.drop,g.fragment,g.weights]), [
    ['放学学生',1,[1],null,45,10,1,.60,.08,[55,35,25]], ['工地工人',1,[1],null,50,12,1,.65,.10,[45,30,20]],
    ['赶时间上班族',2,[1,2],null,40,10,1,.70,.12,[0,25,22]], ['探店博主',2,[1,2],2,35,8,1.2,.75,.14,[0,10,13]],
    ['小企业主',3,[2,3],null,30,10,1.25,.80,.18,[0,0,13]], ['美食评论家',3,[1,2,3],3,25,8,1.4,.85,.22,[0,0,7]]
  ]);
  assert.deepEqual(C.lottery.map(r=>[r.id,r.weight]),[['red',23],['green',23],['blue',23],['fragments',12],['dish',8],['cash',11]]);
});
