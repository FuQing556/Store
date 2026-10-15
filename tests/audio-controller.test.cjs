'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(withAudio=true){
  const storage=new Map(),sources=[];let contexts=0,decodeCount=0;
  class AudioContext{
    constructor(){contexts++;this.currentTime=0;this.state='suspended';this.destination={};}
    resume(){this.state='running';return Promise.resolve();}
    decodeAudioData(){decodeCount++;return Promise.resolve({duration:1});}
    createGain(){return {gain:{value:1,setTargetAtTime(v){this.value=v;}},connect(){return this;},disconnect(){}};}
    createBufferSource(){const source={loop:false,started:false,stopped:false,connect(){return this;},disconnect(){},start(...args){this.started=true;this.startArgs=args;},stop(){this.stopped=true;this.onended?.();}};sources.push(source);return source;}
  }
  const classes=new Set();
  const window={matchMedia:()=>({matches:false,addEventListener(){}}),BaiweiAudioBank:{music:'AA==',cooking:'AA==',ready:'AA==',checkout:'AA=='}};
  if(withAudio)window.AudioContext=AudioContext;
  const context={window,document:{body:{classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name);}}}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},atob:v=>Buffer.from(v,'base64').toString('binary'),Uint8Array};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','src','audio.js'),'utf8'),context);
  return {sound:window.BaiweiSound,sources,storage,classes,get contexts(){return contexts;},get decodeCount(){return decodeCount;}};
}
test('声音仅在显式解锁后创建上下文，重复操作不重复解码或创建循环',async()=>{
  const env=setup(),s=env.sound;assert.equal(env.contexts,0);await s.unlock();assert.equal(env.contexts,1);assert.equal(env.decodeCount,4);
  s.sync(false,2);const created=env.sources.length;for(let i=0;i<10;i++){await s.unlock();s.sync(false,3);}assert.equal(env.sources.length,created);assert.equal(env.contexts,1);assert.equal(env.decodeCount,4);
});
test('静音、暂停、音乐与音效开关准确停止对应循环，恢复不会叠加',async()=>{
  const env=setup(),s=env.sound;await s.unlock();s.sync(false,1);assert.ok(s.music);assert.ok(s.cooking);
  s.set('muted',true);assert.equal(s.music,null);assert.equal(s.cooking,null);assert.equal(s.master.gain.value,0);
  s.set('muted',false);assert.ok(s.music);assert.ok(s.cooking);s.set('music',false);assert.equal(s.music,null);assert.ok(s.cooking);
  s.set('effects',false);assert.equal(s.cooking,null);s.set('music',true);assert.ok(s.music);s.ctx.currentTime=.35;s.sync(true,1);assert.equal(s.music,null);assert.equal(s.musicOffset,.35);s.sync(false,0);assert.ok(s.music);assert.equal(s.music.source.startArgs[1],.35);assert.equal(s.cooking,null);
});
test('音效限频与并发上限生效；暂停时经营提示音不播放，仅允许显式试听',async()=>{
  const env=setup(),s=env.sound;await s.unlock();s.play('ready');const n=env.sources.length;s.play('ready');assert.equal(env.sources.length,n);
  s.sync(true,1);s.play('checkout');assert.equal(env.sources.length,n);s.play('checkout',true);assert.equal(env.sources.length,n+1);
  s.sync(false,0);for(let i=0;i<20;i++){s.ctx.currentTime+=.2;s.play('ready');}assert.ok(s.voices.size<=8);
});
test('设置可独立保存，不改经营存档；音量限制有效且减少动态可开启',async()=>{
  const env=setup(),s=env.sound;await s.unlock();s.set('volume',9);assert.equal(s.preferences.volume,1);s.set('volume',-1);assert.equal(s.preferences.volume,0);
  s.set('motion',false);assert.ok(env.classes.has('reduced-motion'));assert.deepEqual([...env.storage.keys()],['baiwei.preferences.v1']);
});
test('不支持Web Audio时平稳降级，不抛异常或影响页面',async()=>{
  const env=setup(false);await env.sound.unlock();assert.equal(env.sound.unavailable,true);env.sound.play('ready');env.sound.sync(false,2);assert.equal(env.sources.length,0);
});
