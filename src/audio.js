(() => {
  'use strict';
  const key='baiwei.preferences.v1';
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
  const preferences={muted:saved.muted===true,music:saved.music!==false,effects:saved.effects!==false,volume:Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.45,motion:typeof saved.motion==='boolean'?saved.motion:!reduce.matches};
  class Sound {
    constructor(){this.preferences=preferences;this.ctx=null;this.buffers={};this.loading=null;this.master=null;this.music=null;this.musicOffset=0;this.cooking=null;this.paused=false;this.cooks=0;this.last=new Map();this.voices=new Set();this.unavailable=false;}
    store(){try{localStorage.setItem(key,JSON.stringify(this.preferences));}catch{}this.applyMotion();}
    applyMotion(){document.body.classList.toggle('reduced-motion',!this.preferences.motion||reduce.matches);}
    async unlock(){
      if(this.unavailable)return;
      try{
        if(!this.ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){this.unavailable=true;return;}this.ctx=new Audio();this.master=this.ctx.createGain();
          if(this.ctx.createDynamicsCompressor){const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.006;limiter.release.value=.18;this.master.connect(limiter).connect(this.ctx.destination);}else this.master.connect(this.ctx.destination);
          this.master.gain.value=this.preferences.muted?0:this.preferences.volume;
          this.loading=Promise.all(Object.entries(window.BaiweiAudioBank||{}).map(async([name,data])=>{const binary=atob(data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));this.buffers[name]=await this.ctx.decodeAudioData(bytes.buffer);}));
        }
        if(this.ctx.state==='suspended')await this.ctx.resume();await this.loading;this.syncLoops();
      }catch{this.unavailable=true;this.stopLoop('music');this.stopLoop('cooking');}
    }
    gain(){if(this.master)this.master.gain.setTargetAtTime(this.preferences.muted?0:this.preferences.volume,this.ctx.currentTime,.03);}
    set(field,value){if(!(field in this.preferences))return;this.preferences[field]=field==='volume'?Math.max(0,Math.min(1,Number(value)||0)):!!value;this.store();this.gain();this.syncLoops();}
    play(name,preview=false){
      if(this.unavailable||this.preferences.muted||!this.preferences.effects||this.paused&&!preview||!this.ctx||this.ctx.state!=='running'||!this.buffers[name])return;
      const now=this.ctx.currentTime;if(now-(this.last.get(name)??-99)<.09||this.voices.size>=8)return;this.last.set(name,now);
      const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.buffers[name];gain.gain.value=.55;source.connect(gain).connect(this.master);this.voices.add(source);
      source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};source.start();
    }
    loop(name,volume){if(this[name]||!this.buffers[name])return;const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.buffers[name];source.loop=true;gain.gain.value=volume;source.connect(gain).connect(this.master);const offset=name==='music'?this.musicOffset:0;source.start(0,offset);this[name]={source,gain,started:this.ctx.currentTime,offset};}
    stopLoop(name){const node=this[name];if(!node)return;if(name==='music')this.musicOffset=(node.offset+this.ctx.currentTime-node.started)%this.buffers.music.duration;try{node.source.stop();}catch{}node.source.disconnect();node.gain.disconnect();this[name]=null;}
    syncLoops(){
      if(!this.ctx)return;
      const audible=!this.unavailable&&!this.preferences.muted&&!this.paused&&this.ctx.state==='running';
      if(audible&&this.preferences.music)this.loop('music',.3);else this.stopLoop('music');
      if(audible&&this.preferences.effects&&this.cooks>0)this.loop('cooking',.3);else this.stopLoop('cooking');
    }
    sync(paused,cooks){this.paused=paused;this.cooks=cooks;this.syncLoops();if(paused){for(const voice of this.voices){try{voice.stop();}catch{}}}}
  }
  const sound=new Sound();sound.applyMotion();reduce.addEventListener('change',()=>sound.applyMotion());window.BaiweiSound=sound;
})();
