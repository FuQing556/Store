'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../src/storage.js');
const { Game, config: C } = require('../src/engine.js');
const storage = raw => ({ getItem: () => raw, setItem: () => assert.fail('读取时不能覆盖存档') });
test('T14 正式存档完整读取，空存储正常开店', () => {
  const g = new Game(); g.s.cash = 327.25; g.s.red = 4;
  const raw = JSON.stringify(g.serialize()), result = read(storage(raw), C.saveKey, C.saveVersion);
  assert.deepEqual(result.save, g.serialize()); assert.equal(result.raw, raw); assert.equal(result.invalid, false);
  assert.deepEqual(read(storage(null), C.saveKey, C.saveVersion), {save:null,raw:null,invalid:false,unavailable:false});
});
test('T14 损坏JSON与不兼容存档保留原始内容，供备份导出', () => {
  for (const raw of ['{"cash":327.25', JSON.stringify({...new Game().serialize(),version:99})]) {
    const result = read(storage(raw), C.saveKey, C.saveVersion);
    assert.equal(result.save, null); assert.equal(result.raw, raw); assert.equal(result.invalid, true); assert.equal(result.unavailable, false);
  }
});
test('T14 null、数组和缺少结构的存档不被当作正常零进度覆盖', () => {
  for (const raw of ['null','[]','{}','{"version":1}']) {
    const result = read(storage(raw), C.saveKey, C.saveVersion); assert.equal(result.invalid, true); assert.equal(result.raw, raw);
  }
});
test('浏览器存储禁用时返回不可用状态，不抛异常', () => {
  assert.deepEqual(read({getItem(){throw new Error('denied');}}, C.saveKey, C.saveVersion), {save:null,raw:null,invalid:false,unavailable:true});
});
