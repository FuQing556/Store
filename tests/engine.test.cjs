'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, config: C } = require('../src/engine.js');
function game(options = {}) { const g = new Game(options); g.s.menu = ['D0101']; return g; }
function rich(g) { Object.assign(g.s, { cash: 5000, red: 50, green: 50, blue: 50, fragments: 20 }); return g; }
function close(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }

test('配置规模、各等级到访权重与抽奖概率符合冻结要求', () => {
  assert.equal(C.dishes.length, 12); assert.equal(C.guests.length, 6); assert.equal(C.gifts.length, 5);
  assert.equal(C.lottery.reduce((sum,r) => sum+r.weight, 0), 100);
  for (let i = 0; i < 3; i++) assert.equal(C.guests.reduce((sum,g) => sum + g.weights[i], 0), 100);
  assert.deepEqual(C.levels.slice(1).map(l => [l.tables,l.queue,l.stoves,l.menu,l.arrivals]), [[3,5,1,3,2],[4,6,2,5,2.4],[5,8,3,7,2.8]]);
});
test('T01 初始自动到访间隔为30秒', () => {
  const g = game(); g.step(29); assert.equal(g.s.arrivals, 0); g.step(); assert.equal(g.s.arrivals, 1); assert.equal(g.seated.length, 1);
});
test('T01 满桌满队后到访客人记录容量流失，不越界', () => {
  const g = game(); for (let i = 0; i < 10; i++) g.arrive('student');
  assert.equal(g.seated.length, 3); assert.equal(g.queue.length, 5); assert.equal(g.s.lost.capacity, 2); g.assertInvariants();
});
test('T02 点单只使用已激活、已上架、厨师能做且客人接受的菜', () => {
  const g = game(); g.s.level = 2; g.s.unlocked.push('D0201'); g.s.menu.push('D0201');
  for (let i = 0; i < 4; i++) g.arrive('student');
  assert.ok(g.seated.every(c => c.dish === 'D0101')); assert.equal(g.cooking.length, 2);
});
test('T02 满灶订单FIFO等待，成品离灶立即开做下一单', () => {
  const g = game(); const a = g.arrive('student'), b = g.arrive('worker'), c = g.arrive('student');
  assert.equal(a.state, 'cooking'); assert.equal(b.state, 'ordered'); assert.equal(c.state, 'ordered');
  g.step(8); assert.equal(a.state, 'ready'); assert.equal(b.state, 'cooking'); assert.equal(c.state, 'ordered'); close(b.remaining, 8);
});
test('T03 手动出餐、用餐、结账、掉落形成闭环；不会重复结账', () => {
  const g = game({ random: () => 0 }); const c = g.arrive('student'); g.step(8);
  assert.equal(g.s.cash, 0); assert.equal(g.serveOne().ok, true); assert.equal(c.state, 'eating');
  g.step(5); assert.equal(g.s.cash, 8); assert.equal(g.s.red, 1); assert.equal(g.s.fragments, 1); assert.equal(g.s.served, 1);
  g.step(10); assert.equal(g.s.cash, 8); assert.equal(g.s.served, 1);
});
test('T03 模拟弹幕“出餐”作用与按钮相同；无菜时提示', () => {
  const g = game(); assert.equal(g.command('出餐').ok, false);
  const c = g.arrive('student'); g.step(8); assert.equal(g.command(' 出餐 ').ok, true); assert.equal(c.state, 'eating');
  assert.equal(g.command('不存在').ok, false); assert.equal(g.command('甜甜圈').ok, true);
});
test('T03 多道成品按完成顺序出餐', () => {
  const g = game(); g.s.level = 3; const a = g.arrive('student'), b = g.arrive('student');
  g.step(8); assert.equal(g.ready.length, 2); g.serveOne(); assert.equal(a.state, 'eating'); assert.equal(b.state, 'ready');
});
test('T04 出餐等待在菜完成后才开始；边界超时作废，不支付不掉落', () => {
  const g = game({ random: () => 0 }); g.arrive('student'); g.step(8);
  assert.equal(g.ready[0].remaining, 10); g.step(9); assert.equal(g.ready.length, 1); g.step();
  assert.equal(g.ready.length, 0); assert.equal(g.s.lost.ready, 1); assert.equal(g.s.cash, 0); assert.equal(g.s.red, 0); assert.equal(g.s.fragments, 0);
});
test('T05 排队耐心耗尽不占用桌位，不把排队客结账', () => {
  const g = game(); for (let i = 0; i < 4; i++) g.arrive('student');
  const q = g.queue[0]; q.remaining = 1; g.step();
  assert.equal(g.s.lost.queue, 1); assert.equal(g.seated.length, 3); assert.ok(!g.s.customers.includes(q)); assert.equal(g.s.cash, 0);
});
test('T06 研发不足时明确缺口，资源足够后准确扣款；满菜单不自动上架', () => {
  const g = new Game(); assert.match(g.researchStatus('D0104'), /现金缺 60/); assert.equal(g.research('D0104').ok, false);
  Object.assign(g.s, { cash: 60, red: 1, green: 3 }); assert.equal(g.research('D0104').ok, true);
  assert.equal(g.s.cash, 0); assert.equal(g.s.red, 0); assert.equal(g.s.green, 0); assert.ok(g.s.unlocked.includes('D0104')); assert.ok(!g.s.menu.includes('D0104'));
  assert.equal(g.toggleMenu('D0104').ok, false); g.toggleMenu('D0101'); assert.equal(g.toggleMenu('D0104').ok, true);
});
test('T06 菜品研发要求饭馆与厨师均符合品级', () => {
  const g = rich(game()); assert.match(g.researchStatus('D0201'), /2级饭馆/); g.upgrade('restaurant');
  assert.match(g.researchStatus('D0201'), /2级厨师/); g.upgrade('chef'); assert.equal(g.research('D0201').ok, true);
});
test('T07 两次饭馆升级同步改变全部容量、客流和资源，最高等级封顶', () => {
  const g = rich(game()); assert.equal(g.upgrade('restaurant').ok, true); assert.equal(g.s.level, 2); assert.equal(g.s.cash, 4700); assert.equal(g.s.fragments, 18);
  assert.deepEqual([g.level.tables,g.level.queue,g.level.stoves,g.level.menu,g.level.arrivals], [4,6,2,5,2.4]);
  g.upgrade('restaurant'); assert.equal(g.s.cash, 3800); assert.equal(g.s.fragments, 12); assert.equal(g.s.level, 3); assert.equal(g.upgrade('restaurant').ok, false);
});
test('T07 新增桌位和灶眼立即容纳排队订单', () => {
  const g = rich(game()); for (let i=0;i<5;i++) g.arrive('student'); g.upgrade('restaurant');
  assert.equal(g.seated.length, 4); assert.equal(g.queue.length, 1); assert.equal(g.cooking.length, 2); g.assertInvariants();
});
test('T08 厨师升级有饭馆等级门槛，速度与正在烹饪订单同步更新', () => {
  const g = rich(game()); assert.equal(g.upgrade('chef').ok, false); g.upgrade('restaurant'); const c = g.arrive('student');
  g.step(2); close(c.remaining, 6); assert.equal(g.upgrade('chef').ok, true); close(c.remaining, 4.8); close(c.duration, 6.4);
  const count = g.s.cash; g.upgrade('chef'); assert.equal(g.s.cash, count);
});
test('T08 已激活高级菜受到厨师锁，不进入自动菜单', () => {
  const g = game(); g.s.level = 2; g.s.unlocked.push('D0201'); g.s.menu = ['D0201'];
  assert.equal(g.availableMenu.length, 0); assert.equal(g.gift('bomb').ok, false); g.arrive('office'); assert.equal(g.s.lost.menu, 1);
  g.s.chef = 2; const c = g.arrive('office'); assert.equal(c.dish, 'D0201'); close(c.duration, 18 / 1.25);
});
test('T09 仙女棒每次减基础20%，四根封顶，最低保留实际时长20%', () => {
  const g = game(); const c = g.arrive('student');
  for (let i = 0; i < 4; i++) assert.equal(g.gift('wand').ok, true);
  close(c.remaining, 1.6); assert.equal(c.wands, 4); assert.equal(g.gift('wand').ok, false); g.step(2); assert.equal(c.state, 'ready'); assert.equal(g.gift('wand').ok, false);
});
test('T09 高级厨师加速下也保留20%；空灶和最后20%不能刷收益', () => {
  const g = game(); g.s.level = 3; g.s.chef = 3; assert.equal(g.gift('wand').ok, false); const c = g.arrive('student');
  for (let i=0;i<4;i++) g.gift('wand'); close(c.remaining, (8 / 1.5) * .2); assert.ok(c.wands <= 4);
  const before = c.remaining; assert.equal(g.gift('wand').ok, false); close(c.remaining, before);
});

test('T09 多灶连续加速：首单满4根后自动轮到下一单，各单独立封顶', () => {
  const g=game(); g.s.level=3;
  const orders=[g.arrive('student'),g.arrive('student'),g.arrive('student')];
  for(let i=0;i<12;i++) {
    assert.equal(g.gift('wand').ok,true);
    assert.equal(orders[Math.floor(i/4)].wands,i%4+1);
  }
  assert.deepEqual(orders.map(c=>c.wands),[4,4,4]);
  orders.forEach(c=>close(c.remaining,c.duration*.2));
  const before=JSON.stringify(g.s.customers),rng=g.rngState;
  assert.equal(g.gift('wand').ok,false);
  assert.equal(JSON.stringify(g.s.customers),before); assert.equal(g.rngState,rng);
});

test('T09 首单未满4根但已到20%下限，也应跳过并加速后续订单；弹幕同效', () => {
  const g=game(); Object.assign(g.s,{level:3,chef:3});
  const first=g.arrive('student'),second=g.arrive('student');
  first.remaining=first.duration*.2;
  const before=first.remaining;
  assert.equal(g.command('仙女棒').ok,true);
  assert.equal(first.wands,0); close(first.remaining,before);
  assert.equal(second.wands,1); close(second.remaining,second.duration-1.6);
  assert.match(g.s.lastGift.message,/2号桌/);
});
test('T10 按概率区间获得各类奖励，概率总和100%', () => {
  const cases = [[0,'red'],[.23,'green'],[.46,'blue'],[.69,'fragments'],[.81,'dish'],[.89,'cash']];
  for (const [n,key] of cases) { const g = game({ random: () => n }); g.gift('pill'); assert.equal(g.s.lastLottery.reward, key); }
});
test('T10 连续九次非新菜后第十次保底；激活且符合门槛', () => {
  const g = game({ random: () => .99 }); for (let i=0;i<9;i++) g.gift('pill'); assert.equal(g.s.pity, 9);
  g.gift('pill'); assert.equal(g.s.pity, 0); assert.ok(g.s.lastLottery.forced); assert.ok(g.s.unlocked.includes('D0104')); assert.equal(g.s.draws, 10);
  assert.equal(g.s.cash, 450); assert.ok(g.s.unlocked.every(id => C.dishes.find(d => d.id === id).tier === 1));
});
test('T10 无可激活新菜的随机新菜奖励和保底均转三色各2', () => {
  const g = game({ random: () => .85 }); g.unlock(C.dishes.find(d => d.id === 'D0104'));
  g.gift('pill'); assert.deepEqual([g.s.red,g.s.green,g.s.blue], [2,2,2]);
  g.s.pity = 9; g.gift('pill'); assert.deepEqual([g.s.red,g.s.green,g.s.blue], [4,4,4]); assert.equal(g.s.pity, 0);
});
test('T10 普通抽中新菜立即重置保底计数', () => {
  const g = game({ random: () => .85 }); g.s.pity = 7; g.gift('pill'); assert.equal(g.s.pity, 0); assert.equal(g.s.lastLottery.forced, false);
});
test('T11 魔法镜三层封顶、刷新持续、结束客流恢复', () => {
  const g = game(); for (let i=0;i<4;i++) g.gift('mirror'); assert.equal(g.s.mirrorLayers, 3); assert.equal(g.flowMultiplier, 2.5);
  g.step(5); assert.equal(g.s.mirrorSeconds, 25); g.gift('mirror'); assert.equal(g.s.mirrorSeconds, 30);
  g.step(30); assert.equal(g.s.mirrorLayers, 0); assert.equal(g.flowMultiplier, 1); assert.equal(g.s.arrivals, 2); g.assertInvariants();
});
test('T11 3级镜子提高最高两品级权重且归一化', () => {
  const g = game({ random: () => .30 }); g.s.level = 3;
  const base = g.chooseGuest(); g.gift('mirror'); g.gift('mirror'); g.gift('mirror'); const boosted = g.chooseGuest();
  assert.equal(base.tier, 1); assert.ok(boosted.tier >= 2);
});
test('T12 甜甜圈立即端走已有成品、新成品自动出餐、180秒封顶', () => {
  const g = game(); const c = g.arrive('student'); g.step(8); g.gift('donut'); assert.equal(c.state, 'eating');
  for(let i=0;i<4;i++)g.gift('donut'); assert.equal(g.s.donutSeconds,180); const b = g.arrive('student'); g.step(8); assert.equal(b.state,'eating');
});
test('T12 最后一个有效Tick仍自动出餐；过期后恢复手动', () => {
  const g = game(); const c = g.arrive('student'); c.remaining = 1; g.s.donutSeconds = 1; g.step(); assert.equal(c.state,'eating'); assert.equal(g.s.donutSeconds,0);
  const b = g.arrive('student'); b.remaining = 1; g.step(); assert.equal(b.state,'ready');
});
test('T13 炸弹各等级人数、保底数量和冷却正确', () => {
  for (let level = 1; level <= 3; level++) {
    const g = game(); g.s.level = level; g.s.chef = level; g.s.unlocked = C.dishes.map(d=>d.id); g.s.menu = C.dishes.filter(d=>d.tier===level).map(d=>d.id).slice(0,g.level.menu);
    assert.equal(g.gift('bomb').ok,true); assert.equal(g.s.arrivals,3+level); assert.equal(g.s.bombCooldown,20);
    const highest = Math.max(...C.guests.filter(guest => guest.weights[level-1] > 0 && g.availableMenu.some(d=>guest.accepts.includes(d.tier))).map(guest=>guest.tier));
    assert.ok(g.s.customers.filter(c=>g.guestType(c).tier===highest).length >= Math.floor((3+level)*.3));
    const count=g.s.arrivals; assert.equal(g.gift('bomb').ok,false); assert.equal(g.s.arrivals,count); g.step(20); assert.equal(g.s.bombCooldown,0); g.assertInvariants();
  }
});
test('T13 炸弹空位不足或无菜不消耗，按剩余容量裁剪招揽人数', () => {
  const g = game(); for(let i=0;i<6;i++)g.arrive('student'); assert.equal(g.gift('bomb').ok,false); assert.equal(g.s.bombCooldown,0);
  const h = game(); h.s.menu=[]; assert.equal(h.gift('bomb').ok,false); assert.equal(h.s.bombCooldown,0);
  const k = game(); for(let i=0;i<5;i++)k.arrive('student'); assert.equal(k.gift('bomb').ok,true); assert.equal(k.s.arrivals,8); k.assertInvariants();
});
test('T14 刷新保留全部成长、抽奖保底与随机状态，在线客人和临时效果清空', () => {
  const g = rich(game()); g.upgrade('restaurant'); g.upgrade('chef'); g.research('D0201'); g.gift('pill'); g.gift('donut'); g.gift('mirror'); g.gift('bomb');
  const saved = g.serialize(), restored = new Game({save:JSON.parse(JSON.stringify(saved))});
  assert.deepEqual(restored.serialize(),saved); assert.equal(restored.s.customers.length,0); assert.equal(restored.s.donutSeconds,0); assert.equal(restored.s.mirrorLayers,0); assert.equal(restored.s.time,0);
});
test('T14 不可信或损坏的成长值被校验，不产生负数、非法菜品或越界等级', () => {
  const g = new Game({save:{version:1,level:99,chef:99,cash:-10,red:Infinity,unlocked:['fake','D0104'],menu:['fake','D0104','D0104'],pity:200}});
  assert.equal(g.s.level,3); assert.equal(g.s.chef,3); assert.equal(g.s.cash,0); assert.equal(g.s.red,0); assert.equal(g.s.pity,9); assert.deepEqual(g.s.menu,['D0104']); g.assertInvariants();
  assert.equal(new Game({save:{version:99}}).saveRejected,true);
  const huge = new Game({save:{version:1,cash:1e308,red:1e308,rngState:4294967296}});
  assert.equal(huge.s.cash,0); assert.equal(huge.s.red,0); assert.notEqual(huge.rngState,0); huge.assertInvariants();
});
test('已点单菜下架仍能完成；菜单为空不会随机越级制作', () => {
  const g = game(); const c = g.arrive('student'); g.toggleMenu('D0101'); g.step(8); assert.equal(c.state,'ready'); assert.equal(g.availableMenu.length,0);
  g.arrive('worker'); assert.equal(g.s.lost.menu,1);
});
test('溢价客人按价格计算，现金精确到分且相应品级材料正确', () => {
  const g = game({random:()=>0}); g.s.level=3; g.s.chef=3; g.unlock(C.dishes.find(d=>d.id==='D0301')); g.s.menu=['D0301'];
  g.arrive('critic'); g.step(20); assert.equal(g.serveOne().ok,true); g.step(5); assert.equal(g.s.served,1); assert.equal(g.s.cash,44.8); assert.equal(g.s.blue,1);
});
test('固定随机种子、相同操作得到相同经营结果', () => {
  const a = new Game({seed:123}), b = new Game({seed:123});
  for(let i=0;i<100;i++){ a.gift('pill'); b.gift('pill'); a.step(); b.step(); }
  assert.deepEqual(a.s,b.s); assert.equal(a.rngState,b.rngState);
});
test('Tick拒绝负数、小数和过大时间', () => {
  const g=game(); for(const t of [-1,.5,86401,NaN]) assert.throws(()=>g.step(t),RangeError); assert.equal(g.step(0).time,0);
});
test('随机长时间经营、升级、礼物与菜单操作不会破坏容量或资源不变量', () => {
  for(const seed of [1,42,20261014]) {
    const g=rich(new Game({seed}));
    for(let t=0;t<7200;t++) {
      if(t%31===0)g.gift('pill'); if(t%61===0)g.gift('bomb'); if(t%120===0)g.gift('mirror'); if(t%70===0)g.gift('donut'); if(t%7===0)g.gift('wand');
      if(t%15===0){g.upgrade('restaurant');g.upgrade('chef');}
      if(t%19===0){const d=g.activateCandidates()[0];if(d)g.research(d.id);}
      if(t%9===0)g.serveOne(); g.step(); g.assertInvariants();
    }
  }
});

test('T12 Tick开始自动端走已有成品时，不提前消耗一秒用餐', () => {
  const g = game({random:()=>0}); const c = g.arrive('student'); g.step(8);
  g.s.donutSeconds = 1; g.step();
  assert.equal(c.state, 'eating'); assert.equal(c.remaining, C.eatingSeconds);
  const servedAt = g.s.time; g.step(4); assert.equal(g.s.served, 0); g.step();
  assert.equal(g.s.served, 1); assert.equal(g.s.time - servedAt, C.eatingSeconds);
  assert.equal(g.s.logs.filter(l => l.text.includes('自动出餐结束')).length, 1);
});

test('同一Tick连续互动超过日志容量后，事件ID仍唯一且日志有界', () => {
  const g = game(); for(let i=0;i<250;i++) g.gift('mirror');
  assert.equal(g.s.logs.length,100); assert.equal(new Set(g.s.logs.map(l=>l.id)).size,100);
});

test('T08 连升厨师后的整数烹饪边界不会被浮点误差延后一个Tick', () => {
  const g = rich(game()); Object.assign(g.s, {level:3, unlocked:['D0104'], menu:['D0104']});
  const c = g.arrive('student'); g.upgrade('chef'); g.upgrade('chef');
  assert.equal(c.duration, 8); assert.equal(c.remaining, 8);
  g.step(7); assert.equal(c.state,'cooking'); assert.equal(c.remaining,1);
  g.step(); assert.equal(c.state,'ready'); assert.equal(c.remaining,10);
});

test('T08/T09 厨师升级和仙女棒叠加后，按实际秒数在正确Tick出锅', () => {
  for (const d of C.dishes) for (const elapsed of [0,1,3]) for (const wands of [0,1,2,4]) {
    const g = rich(game()); Object.assign(g.s,{level:3,chef:d.tier,unlocked:[d.id],menu:[d.id]});
    const c = g.arrive(d.tier===1?'student':'critic'); g.step(elapsed);
    for(let i=0;i<wands;i++)g.gift('wand');
    while(g.s.chef<3)g.upgrade('chef');
    const ticks=Math.ceil(c.remaining-1e-9);
    g.step(ticks-1); assert.equal(c.state,'cooking',`${d.id}, elapsed=${elapsed}, wands=${wands}`);
    g.step(); assert.equal(c.state,'ready',`${d.id}, elapsed=${elapsed}, wands=${wands}`);
    assert.equal(c.remaining,g.guestType(c).wait);
    g.assertInvariants();
  }
});
