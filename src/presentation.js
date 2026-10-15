(() => {
  'use strict';
  // Visual events never change the engine, random state, resources or game time.
  function same(a,b){return a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&a.namespaceURI===b.namespaceURI);}
  function key(node){return node.nodeType===1?node.getAttribute('data-key'):null;}
  function morph(old,fresh){
    if(!same(old,fresh)){old.replaceWith(fresh.cloneNode(true));return;}
    if(old.nodeType===3){if(old.nodeValue!==fresh.nodeValue)old.nodeValue=fresh.nodeValue;return;}
    if(old.nodeType!==1)return;
    for(const attribute of [...old.attributes])if(!fresh.hasAttribute(attribute.name))old.removeAttribute(attribute.name);
    for(const attribute of fresh.attributes)if(old.getAttribute(attribute.name)!==attribute.value)old.setAttribute(attribute.name,attribute.value);
    children(old,fresh);
  }
  function children(parent,fresh){
    const keyed=new Map([...parent.childNodes].filter(n=>key(n)).map(n=>[key(n),n]));
    let cursor=parent.firstChild;
    for(const next of [...fresh.childNodes]){
      const id=key(next);let current=id?keyed.get(id):cursor;
      if(current&&(!same(current,next)||!id&&key(current)))current=null;
      if(current){if(current!==cursor)parent.insertBefore(current,cursor);morph(current,next);cursor=current.nextSibling;}
      else{const added=next.cloneNode(true);parent.insertBefore(added,cursor);cursor=added.nextSibling;}
    }
    while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
  }
  function patch(parent,markup){const template=document.createElement('template');template.innerHTML=markup;children(parent,template.content);}
  function snapshot(game){let queueIndex=0;return new Map(game.s.customers.map(c=>[c.id,{...c,queueIndex:c.state==='queue'?queueIndex++:null}]));}
  class Presentation {
    constructor(){this.previous=new Map();this.seenLogs=new WeakSet();this.pending=[];this.animations=new Set();this.layers=document.getElementById('visual-layer');}
    motion(){return !document.body.classList.contains('reduced-motion');}
    reset(game){this.clear();this.previous=snapshot(game);this.seenLogs=new WeakSet(game.s.logs);this.pending=[];}
    capture(game){
      const fresh=game.s.logs.filter(l=>!this.seenLogs.has(l)).reverse();fresh.forEach(l=>{this.seenLogs.add(l);this.pending.push({type:l.type,text:l.text});});
      const next=snapshot(game);
      for(const c of game.s.customers){const old=this.previous.get(c.id);if(!old||old.state==='queue'&&c.state!=='queue')this.pending.push({type:'walk',c:{...c},from:old});if(old&&old.state!=='eating'&&c.state==='eating')this.pending.push({type:'dish-flight',c:{...c}});}
      for(const [id,c] of this.previous)if(!next.has(id))this.pending.push({type:'exit',c});
      this.previous=next;
    }
    tracked(animation,element){this.animations.add(animation);animation.finished.then(()=>{this.animations.delete(animation);if(element)element.remove();}).catch(()=>{this.animations.delete(animation);if(element)element.remove();});}
    location(table, kind='guest'){return window.BaiweiSceneLayout.anchor(table,kind);}
    node(className,x,y,markup){const el=document.createElement('div');el.className=className;el.style.left=x+'%';el.style.top=y+'%';el.innerHTML=markup;this.layers.append(el);return el;}
    float(text,kind,x=50,y=50){if(!this.motion()||this.layers.childElementCount>24)return;const el=this.node('scene-float '+kind,x,y,'');el.textContent=text;this.tracked(el.animate([{transform:'translate(-50%,0) scale(.85)',opacity:0},{transform:'translate(-50%,-8px) scale(1)',opacity:1,offset:.2},{transform:'translate(-50%,-45px) scale(1)',opacity:0}],{duration:1450,easing:'ease-out'}),el);}
    burst(id){if(!this.motion()||this.layers.childElementCount>36)return;const palettes={wand:['#ffd67b','#f99785'],pill:['#eca1b6','#cfdf91'],mirror:['#c7ace1','#f6deb0'],donut:['#eda9b8','#ead18e'],bomb:['#e5ba78','#a9bf8c'],growth:['#efc567','#7da187']};const colors=palettes[id]||palettes.growth;
      for(let i=0;i<12;i++){const angle=i*Math.PI/6,el=this.node('sparkle-particle',50,52,'');el.style.background=colors[i%colors.length];this.tracked(el.animate([{transform:'translate(0,0) scale(.5)',opacity:0},{opacity:1,offset:.12},{transform:`translate(${Math.cos(angle)*100}px,${Math.sin(angle)*65}px) rotate(180deg) scale(.2)`,opacity:0}],{duration:800+i*25,easing:'ease-out'}),el);}
    }
    travel(c,exit,avatar,from){
      if(!this.motion()||this.layers.childElementCount>24)return;
      const L=window.BaiweiSceneLayout,person=window.BaiweiConfig.guests.findIndex(g=>g.id===c.type);
      const route=L.route(c.table,person,exit?c.queueIndex:from?.queueIndex??null,exit);
      const start=route[0],stage=this.layers;
      const ghost=this.node('walking-guest',start.x,start.y,avatar(c.type));
      const size=c.table===null?38:L.guestGeometry(c.table,person).standingSize;
      ghost.style.setProperty('--person-size',size+'px');
      ghost.dataset.guestId=c.id;ghost.dataset.route='aisle';
      const distances=route.map((p,i)=>i?Math.hypot((p.x-route[i-1].x)*stage.offsetWidth/100,(p.y-route[i-1].y)*stage.offsetHeight/100):0);
      const total=distances.reduce((a,b)=>a+b,0)||1;let progress=0;
      const duration=Math.min(2300,Math.max(650,total/240*1000)),delay=exit?0:c.id%3*90;
      const frames=route.map((p,i)=>{progress+=distances[i];return {transform:'translate('+((p.x-start.x)*stage.offsetWidth/100)+'px,'+((p.y-start.y)*stage.offsetHeight/100)+'px)',opacity:exit&&i===route.length-1?0:1,offset:progress/total};});
      this.tracked(ghost.animate(frames,{duration,delay,easing:'linear',fill:'backwards'}),ghost);
      if(!exit){
        const target=document.querySelector('.table-guest[data-key="guest-'+c.id+'"]');
        if(target)this.tracked(target.animate([{opacity:0},{opacity:0,offset:.88},{opacity:1}],{duration:duration+delay+160,easing:'ease-out'}));
      }
    }
    dishFlight(c,dish){if(!this.motion())return;const p=this.location(c.table,'meal'),k=window.BaiweiSceneLayout.kitchen,el=this.node('flying-dish',k.x,k.y,dish(c.dish));const dx=(p.x-k.x)*this.layers.offsetWidth/100,dy=(p.y-k.y)*this.layers.offsetHeight/100;
      this.tracked(el.animate([{transform:'translate(-50%,-50%) scale(.65)',opacity:0},{opacity:1,offset:.1},{transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-35}px)) scale(1)`,offset:.5},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.6)`,opacity:0}],{duration:650,easing:'ease-in-out'}),el);
    }
    flush(game,avatar,dish){const sounds=new Set();let checkouts=0;
      for(const e of this.pending){
        if(e.type==='walk'){if(e.c.state!=='queue')this.travel(e.c,false,avatar,e.from);continue;}
        if(e.type==='exit'){this.travel(e.c,true,avatar);continue;}
        if(e.type==='dish-flight'){this.dishFlight(e.c,dish);continue;}
        if(['arrival','ready','serve','checkout','warning','growth','lottery'].includes(e.type))sounds.add(e.type==='lottery'?'pill':e.type);
        if(e.type==='checkout'){checkouts++;this.float((e.text.match(/\+¥[\d.]+/)||['结账'])[0],'cash-pop',42+(checkouts%3)*8,51);}
        if(e.type==='ready')this.float('好饭出锅啦','ready-pop',50,78);
        if(e.type==='leave')this.float(e.text.includes('超时')?'客人等太久了':'客人离开了','leave-pop',50,36);
        if(e.type==='growth'){this.burst('growth');this.float('小店又进步啦','growth-pop',50,48);}
      }
      for(const name of sounds)window.BaiweiSound?.play(name);this.pending=[];
    }
    gift(id,ok){if(!ok){window.BaiweiSound?.play('warning');return;}window.BaiweiSound?.play(id);this.burst(id);}
    setPaused(paused){for(const animation of this.animations){if(paused)animation.pause();else animation.play();}}
    clear(){for(const animation of this.animations)animation.cancel();this.animations.clear();this.layers.replaceChildren();}
  }
  window.BaiweiPresentation={patch,Presentation};
})();
