'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {sounds,RATE}=require('../scripts/synthesize-audio.cjs');
const root=path.resolve(__dirname,'..');
test('合成音频覆盖各互动，PCM格式有效、有限、无削波且有实际声音',()=>{
  const bank=sounds();assert.equal(Object.keys(bank).length,14);
  for(const [name,wav]of Object.entries(bank)){
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt32LE(24),RATE);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt16LE(34),16);assert.equal(wav.readUInt32LE(40),wav.length-44);
    let energy=0,peak=0,mean=0,count=(wav.length-44)/2;for(let i=44;i<wav.length;i+=2){const value=wav.readInt16LE(i)/32767;energy+=value*value;peak=Math.max(peak,Math.abs(value));mean+=value;}
    assert.ok(peak<=.651,`${name}削波`);assert.ok(energy/count>1e-7,`${name}无声`);assert.ok(Math.abs(mean/count)<.015,`${name}直流偏移`);
    assert.deepEqual(wav,fs.readFileSync(path.join(root,'assets','audio',name+'.wav')),`${name}源与合成产物不一致`);
  }
});
test('原创配乐24秒且循环边界连续，后厨循环4秒',()=>{
  const bank=sounds();assert.equal((bank.music.length-44)/(RATE*2),24);assert.equal((bank.cooking.length-44)/(RATE*2),4);
  for(const name of ['music','cooking']){const wav=bank[name],first=wav.readInt16LE(44),last=wav.readInt16LE(wav.length-2);assert.ok(Math.abs(first-last)/32767<.03,`${name}循环边界过大`);}
});
test('离线内嵌音频库与WAV完全一致，不需要fetch或外部音源',()=>{
  const source=fs.readFileSync(path.join(root,'assets','audio','bank.js'),'utf8'),context={window:{}};vm.runInNewContext(source,context);
  assert.equal(Object.keys(context.window.BaiweiAudioBank).length,14);
  for(const [name,base64]of Object.entries(context.window.BaiweiAudioBank))assert.deepEqual(Buffer.from(base64,'base64'),fs.readFileSync(path.join(root,'assets','audio',name+'.wav')));
  const audio=fs.readFileSync(path.join(root,'src','audio.js'),'utf8');assert.ok(!/fetch\(|https?:\/\//.test(audio));
});
test('生成图集的尺寸和RGBA格式符合运行时网格定义',()=>{
  const defs={'dishes-atlas.png':[4,3],'guests-atlas.png':[3,2],'guests-seated-atlas.png':[3,2],'props-atlas.png':[3,2],'dining-table.png':[1,1]};
  for(const [name,[columns,rows]]of Object.entries(defs)){const png=fs.readFileSync(path.join(root,'assets',name));assert.equal(png.toString('ascii',12,16),'IHDR');assert.equal(png[25],6,`${name}缺少RGBA透明通道`);const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.equal(width/columns,height/rows,`${name}单元格不是正方形`);}
});
