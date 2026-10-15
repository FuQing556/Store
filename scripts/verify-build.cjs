'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
assert.ok(!/type=["']module["']/.test(html), '离线页面不能依赖文件协议下受限的ES模块');
assert.ok(!/https?:\/\//.test(html), '离线页面不能依赖远程资源');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(s=>!s.startsWith('#'));
for (const ref of references) assert.ok(fs.existsSync(path.join(dist,ref)), `缺少构建资源 ${ref}`);
const css=fs.readFileSync(path.join(dist,'styles.css'),'utf8');
for(const [, ref] of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) assert.ok(fs.existsSync(path.join(dist,ref)), `缺少样式资源 ${ref}`);
const {Game}=require('../dist/src/engine.js');
for (const file of fs.readdirSync(path.join(dist,'src')).filter(name=>name.endsWith('.js'))) {
  new vm.Script(fs.readFileSync(path.join(dist,'src',file),'utf8'), { filename: file });
}
for(const name of ['dishes-atlas.png','guests-atlas.png','props-atlas.png','dining-table.png','audio/bank.js'])assert.ok(fs.existsSync(path.join(dist,'assets',name)),`缺少媒体资源 ${name}`);
assert.ok(fs.readFileSync(path.join(dist,'src','audio.js'),'utf8').includes('decodeAudioData'),'缺少离线声音解码');
const g=new Game({seed:123});g.gift('donut');g.gift('bomb');g.step(60);g.assertInvariants();assert.ok(g.s.served>0);
console.log(`构建完整性通过：${references.length}个页面引用、背景图、经典脚本离线结构及构建后经营闭环。`);
