(() => {
  'use strict';
  const C = window.BaiweiConfig;
  const L = window.BaiweiSceneLayout;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const fmt = v => Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let stored;
  try { stored = window.BaiweiStorage.read(localStorage, C.saveKey, C.saveVersion); }
  catch { stored = { save: null, raw: null, invalid: false, unavailable: true }; }
  let save = stored.save, storageError = stored.unavailable, invalidSave = stored.invalid;
  let originalSave = stored.raw;
  let game = new window.BaiweiGame({ save }), normalGame = null;
  const sound = window.BaiweiSound;
  const visuals = new window.BaiweiPresentation.Presentation();
  visuals.reset(game);
  let paused = false, speed = 1, tier = 0, logFilter = 'all', lastSave = '', toastUntil = 0;
  let currentScreen = 'home', menuPage = 0, selectedDish = 'D0101', selectedGuest = 'student', layoutGuides = false;
  let lastFrame = performance.now(), accumulator = 0;
  const put = (id, text) => { const el = $(id); if (el.textContent !== String(text)) el.textContent = text; };
  const html = (id, markup) => window.BaiweiPresentation.patch($(id), markup);
  function persist() {
    if (normalGame || invalidSave || storageError) return;
    const raw = JSON.stringify(game.serialize());
    if (raw === lastSave) return;
    try { localStorage.setItem(C.saveKey, raw); lastSave = raw; } catch { storageError = true; }
  }
  function toast(result) {
    $('toast').textContent = result.message; $('toast').classList.toggle('error', !result.ok); $('toast').hidden = false;
    toastUntil = performance.now() + 3500;
  }
  function act(action, gift) { const result = action(); visuals.capture(game); toast(result); persist(); render(); if (gift) visuals.gift(gift, result.ok); else if (!result.ok) sound.play('warning'); }
  function sprite(kind, index) {
    const columns = kind === 'dish' ? 4 : 3, rows = kind === 'dish' ? 3 : 2;
    const x = index % columns / (columns - 1) * 100, y = Math.floor(index / columns) / (rows - 1) * 100;
    return `<span class="sprite ${kind}-sprite" style="background-position:${x}% ${y}%" aria-hidden="true"></span>`;
  }
  function dishSprite(id) { return sprite('dish', C.dishes.findIndex(d => d.id === id)); }
  function avatar(type, eating = false, seated = false, tableIndex = null) {
    const index=C.guests.findIndex(g=>g.id===type),p=L.people[index];
    const geometry=seated?L.guestGeometry(tableIndex,index):null;
    const hip=seated?p.hip:p.foot;
    const style='--person-anchor-x:'+hip.x*100+'%;--person-anchor-y:'+hip.y*100+'%;'+(geometry?'--person-size:'+geometry.size+'px;--person-facing:'+geometry.facing+';':'');
    return '<span class="actor '+(seated?'actor-seated ':'actor-standing ')+(eating?'actor-eating':'')+'" style="'+style+'">'+sprite(seated?'seated':'guest',index)+'</span>';
  }
  function tableArt() {
    return '<img class="table-art" src="assets/dining-table.png" alt="" draggable="false">';
  }
  const positions = L.slots;
  function renderScene() {
    const s = game.s;
    put('restaurant-name', game.level.name); put('restaurant-summary', `饭馆 Lv.${s.level} · 厨师 Lv.${s.chef}`);
    put('scene-level', ['一碗面，一间店', '人间烟火，家常滋味', '高朋满座，百味飘香'][s.level - 1]);
    put('chef-name', `${game.chef.name} · Lv.${s.chef}`); put('queue-count', `${game.queue.length} / ${game.level.queue}`);
    html('queue-people', game.queue.length ? game.queue.map((c,i) => {
      const p=L.queuePoint(i);
      return `<div class="queue-person" data-key="queue-${c.id}" style="left:${p.x}%;top:${p.y}%" title="${game.guestType(c).name} #${c.id} · 排队耐心${Math.ceil(c.remaining)}秒">${avatar(c.type)}<span class="queue-timer">${Math.ceil(c.remaining)}s</span></div>`;
    }).join('') : '<span class="empty-queue">等一位有缘的食客</span>');
    html('tables', positions.slice(0, game.level.tables).map((p, index) => {
      const c = game.seated.find(c => c.table === index);
      let content = '', title = `${index + 1}号桌 · 空闲`;
      if (c) {
        const g = game.guestType(c), d = game.dish(c), state = { ordered: '等待灶眼', cooking: '正在烹饪', ready: '请及时出餐', eating: '正在用餐' }[c.state];
        const full = c.state === 'cooking' ? c.duration : c.state === 'ready' ? g.wait : C.eatingSeconds;
        title = `${index + 1}号桌 · ${g.name} #${c.id} · ${d.name} · ${state}`;
        content = `<div class="table-guest state-${c.state}" data-key="guest-${c.id}">${avatar(c.type, c.state === 'eating', true, index)}</div>${c.state === 'eating' ? `<div class="table-meal" data-key="meal-${c.id}">${dishSprite(c.dish)}</div>` : ''}<div class="table-bubble ${c.state === 'ready' ? 'ready' : ''} ${c.state === 'ready' && c.remaining <= 3 ? 'urgent' : ''}"><span class="state-label">${index + 1}号桌 · ${state}</span><strong>${esc(d.name)}</strong>${c.state !== 'ordered' ? `<span class="timer">${Math.ceil(c.remaining)}s</span><div class="table-progress"><i style="width:${Math.min(100, c.remaining / full * 100)}%"></i></div>` : ''}</div>`;
      }
      const offset = point => ({ x:(point.x-L.art.ground.x)*p.size*(p.mirror?-1:1), y:(point.y-L.art.ground.y)*p.size });
      const guest=offset(L.art.guest), meal=offset(L.art.meal);
      return `<div class="dining-table" data-key="table-${index}" data-slot="${p.id}" data-side="${p.side}" style="left:${p.x}%;top:${p.y}%;--table-size:${p.size}px;--table-facing:${p.mirror?-1:1};--art-left:${p.artLeft}px;--art-top:${p.artTop}px;--guest-x:${guest.x}px;--guest-y:${guest.y}px;--meal-x:${meal.x}px;--meal-y:${meal.y}px;--bubble-y:${p.bubbleY}px;--label-y:${p.labelY}px" aria-label="${esc(title)}" title="${esc(title)}">${tableArt()}${content}${!c ? '<span class="table-number">'+(index+1)+'号桌 · 空闲</span>' : ''}</div>`;

    }).join(''));
    html('stoves', Array.from({ length: game.level.stoves }, (_, i) => {
      const c = game.cooking[i];
      return `<div class="stove ${c ? 'active' : ''}" data-key="stove-${i}"><span class="stove-icon">${sprite('prop',5)}${c ? '<span class="stove-steam"><i></i><i></i><i></i></span><span class="stove-fire"></span>' : ''}</span><span class="stove-name">${c ? esc(game.dish(c).name) : '空闲灶眼'}</span><span class="stove-time">${c ? `${Math.ceil(c.remaining)}s · ${c.wands}/4` : '等待订单'}</span></div>`;
    }).join(''));
    html('effects', `${s.mirrorSeconds ? `<span class="effect-badge">🪞 ${s.mirrorLayers}层 · ${s.mirrorSeconds}s</span>` : ''}${s.donutSeconds ? `<span class="effect-badge">🍩 托管 ${s.donutSeconds}s</span>` : ''}`);
    put('ready-count', game.ready.length);
    put('serving-hint', s.donutSeconds ? `自动出餐中 · 剩余 ${s.donutSeconds} 秒` : game.ready.length ? '按先后顺序出餐，别让客人等太久' : '烟火慢煮，好饭不怕等');
    html('ready-dishes', game.ready.map(c => `<div class="ready-item" data-key="ready-${c.id}" title="${game.guestType(c).name} #${c.id} · ${c.table + 1}号桌">${dishSprite(c.dish)}<div><small>${c.table + 1}号桌</small><b>${Math.ceil(c.remaining)}s</b></div></div>`).join(''));
    $('serve-button').disabled = !game.ready.length; $('serve-button').title = game.ready.length ? '端出最早完成的一道菜' : '暂无待出餐菜品';
    const lost = Object.values(s.lost).reduce((a,b) => a+b, 0);
    put('service-stats', `已服务 ${s.served} 人 · 流失 ${lost} 人`);
    $('service-stats').title = `容量流失 ${s.lost.capacity} · 排队流失 ${s.lost.queue} · 出餐超时 ${s.lost.ready} · 菜单不合适 ${s.lost.menu}`;
    put('save-status', normalGame ? '验收实验 · 不写入存档' : invalidSave ? '原存档无法读取 · 请导出备份' : storageError ? '存档不可用 · 可手动导出' : '成长自动保存');
    $('pause-overlay').hidden = !paused;
    $('debug-step').hidden = !normalGame;
    $('pause-button').innerHTML = paused ? '<span>▶</span><small>继续</small>' : '<span>Ⅱ</span><small>暂停</small>';
    $('serving-tray').classList.toggle('has-ready', Boolean(game.ready.length));
    $('serving-tray').hidden = !game.ready.length; $('scene-news').hidden = Boolean(game.ready.length);
    $('pause-button').setAttribute('aria-label', paused ? '继续经营' : '暂停经营');
    $('layout-guides').hidden = !layoutGuides;
    if(layoutGuides) html('layout-guides',L.guides(game.level.tables));
    renderServiceNotice();
    put('business-label', normalGame ? '验收实验' : paused ? '暂停营业' : document.hidden ? '后台暂停' : '正在营业');
  }
  function costText(cost) {
    const labels = { cash: '¥', red: '红', green: '绿', blue: '蓝', fragments: '铭牌' };
    return Object.entries(cost).filter(([,v]) => v > 0).map(([k,v]) => k === 'cash' ? `¥${v}` : `${labels[k]}×${v}`).join(' · ');
  }
  function showScreen(name) {
    if (!['home','overview','menu','growth','guests','logs'].includes(name)) return;
    currentScreen = name; renderServiceNotice();
    document.querySelectorAll('.game-page').forEach(page => { page.hidden = page.id !== 'page-' + name; });
    $('page-scrim').hidden = name === 'home'; $('home-ui').inert = name !== 'home';
    document.querySelectorAll('.page-tabs button').forEach(button => { button.classList.toggle('active', button.dataset.screen === name); if (button.dataset.screen === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    if (name !== 'home') $('page-' + name).querySelector('.page-header button').focus();
    else document.querySelector('.shop-title').focus();
  }
  function resizeGame() {
    document.documentElement.style.setProperty('--game-scale', Math.min(window.innerWidth / 450, window.innerHeight / 800));
  }
  function renderServiceNotice() {
    $('page-service').hidden = currentScreen === 'home';
    const first = game.ready[0];
    $('page-service').classList.toggle('needs-service', Boolean(first));
    put('page-service-text', first ? '待出餐 ' + game.ready.length + ' 道 · ' + (first.table + 1) + '号桌剩余 ' + Math.ceil(first.remaining) + '秒' : game.s.donutSeconds ? '自动出餐中 · 剩余 ' + game.s.donutSeconds + ' 秒' : '饭馆继续营业 · 暂无待出餐菜品');
    $('page-serve-button').disabled = !first;
  }
  function renderMenu() {
    const s = game.s, filtered = C.dishes.filter(d => !tier || d.tier === tier), pages = Math.ceil(filtered.length / 6);
    menuPage = Math.max(0, Math.min(menuPage, pages - 1));
    const visible = filtered.slice(menuPage * 6, menuPage * 6 + 6);
    if (!visible.some(d => d.id === selectedDish)) selectedDish = visible[0].id;
    put('menu-capacity', s.menu.length + ' / ' + game.level.menu);
    put('menu-page-label', (menuPage + 1) + ' / ' + pages);
    $('menu-prev').disabled = menuPage === 0; $('menu-next').disabled = menuPage === pages - 1;
    html('dish-list', visible.map(d => {
      const unlocked = s.unlocked.includes(d.id), active = s.menu.includes(d.id), shopLock = d.tier > s.level, chefLock = d.tier > s.chef, locked = shopLock || chefLock;
      const tag = locked ? shopLock ? '饭馆锁' : '厨师锁' : active ? '上架' : unlocked ? '已学' : '未研发';
      return '<button class="dish-card ' + (selectedDish === d.id ? 'selected ' : '') + (locked ? 'locked' : '') + '" data-key="dish-' + d.id + '" data-dish-select="' + d.id + '" aria-pressed="' + (selectedDish === d.id) + '">' + dishSprite(d.id) + '<strong>' + esc(d.name) + '</strong><small>' + '★'.repeat(d.tier) + ' · ¥' + d.price + '</small><span class="card-tag ' + (locked ? 'locked-tag' : '') + '">' + tag + '</span></button>';
    }).join(''));
    const d = C.dishes.find(d => d.id === selectedDish), unlocked = s.unlocked.includes(d.id), active = s.menu.includes(d.id), reason = game.researchStatus(d.id);
    const locks = '<span class="requirement ' + (d.tier > s.level ? 'unmet' : 'met') + '">饭馆 Lv.' + d.tier + (d.tier > s.level ? ' 未达标' : ' 已达标') + '</span><span class="requirement ' + (d.tier > s.chef ? 'unmet' : 'met') + '">厨师 Lv.' + d.tier + (d.tier > s.chef ? ' 未达标' : ' 已达标') + '</span>';
    const action = unlocked ? '<button class="dish-action ' + (active ? 'on-menu' : '') + '" data-menu="' + d.id + '">' + (active ? '从今日菜单下架' : '加入今日菜单') + '</button>' : '<button class="dish-action" data-research="' + d.id + '" title="' + esc(reason || '研发并激活') + '" ' + (reason ? 'disabled' : '') + '>' + (reason ? '暂不可研发 · ' + esc(reason) : '研发这道菜') + '</button>';
    const labels = {cash:'现金',red:'红食材',green:'绿食材',blue:'蓝食材'};
    const cost = Object.entries(d.cost).filter(([,amount])=>amount>0).map(([key,amount]) => '<span class="material ' + (s[key] < amount ? 'unmet' : 'met') + '">' + labels[key] + ' ' + (key === 'cash' ? fmt(s[key]) : s[key]) + ' / ' + amount + '</span>').join('');
    html('dish-detail', '<div class="dish-detail-top"><div class="detail-art">' + dishSprite(d.id) + '</div><div><span class="detail-tier">' + '★'.repeat(d.tier) + ' · ' + d.tier + '品菜</span><h2>' + esc(d.name) + '</h2><p>售价 <b>¥' + d.price + '</b><br>烹饪 ' + (d.cook / game.chef.speed).toFixed(1) + ' 秒</p><div class="dish-requirements">' + locks + '</div></div></div><div class="detail-cost">' + (unlocked ? active ? d.tier > s.chef || d.tier > s.level ? '已上架，但等级锁使其无法进入自动菜单' : '正在上架 · 客人可以自动点单' : '已激活 · 可以加入今日菜单' : '<b>研发材料</b><div class="material-list">' + cost + '</div>') + '</div><div class="detail-reason">' + esc(unlocked ? d.tier > s.chef ? '需升级厨师后才可制作' : active ? '下架后，已经点单的订单仍会完成' : s.menu.length >= game.level.menu ? '今日菜单已满，请先下架一道菜' : '可上架供客人点单' : game.shortage(d.cost) ? game.shortage(d.cost) : '研发材料齐备') + '</div>' + action);
  }
  function renderOverview() {
    const s = game.s;
    html('overview-content', '<div class="overview-hero"><div><h2>' + esc(game.level.name) + '</h2><p>饭馆 Lv.' + s.level + ' · ' + game.chef.name + ' Lv.' + s.chef + '</p></div></div><div class="stats-grid"><div>桌位<strong>' + game.seated.length + ' / ' + game.level.tables + '</strong>排队 ' + game.queue.length + ' / ' + game.level.queue + '</div><div>后厨<strong>' + game.cooking.length + ' / ' + game.level.stoves + '</strong>待出餐 ' + game.ready.length + ' 道</div><div>今日营业收入<strong>¥' + fmt(s.revenue) + '</strong>已服务 ' + s.served + ' 位</div><div>菜谱收藏<strong>' + s.unlocked.length + ' / 12</strong>上架 ' + s.menu.length + ' / ' + game.level.menu + '</div></div><div class="overview-actions"><button class="primary-button" data-screen="growth">升级我的饭馆</button><button class="secondary-button" data-screen="menu">调整今日菜单</button></div><p class="overview-note">自然客流 ' + game.level.arrivals + ' 人/分 · 厨师速度 ' + game.chef.speed + '×<br>查看管理页面时，饭馆继续营业。</p>');
  }
  function renderGuests() {
    html('guest-list', C.guests.map((g, i) => '<button class="guest-card ' + (selectedGuest === g.id ? 'selected ' : '') + (g.weights[game.s.level-1] ? '' : 'locked') + '" data-key="guest-' + g.id + '" data-guest-select="' + g.id + '" aria-pressed="' + (selectedGuest === g.id) + '">' + sprite('guest',i) + '<strong>' + g.name + '</strong><small>' + g.tier + '品食客 · ' + (g.weights[game.s.level-1] ? '可到访' : g.tier + '级店到访') + '</small></button>').join(''));
    const g = C.guests.find(g => g.id === selectedGuest);
    html('guest-detail', '<div class="guest-detail"><div class="guest-detail-head">' + sprite('guest',C.guests.indexOf(g)) + '<div><h2>' + esc(g.name) + '</h2><p>接受 ' + g.accepts.join(' / ') + '品菜' + (g.prefer ? '，优先' + g.prefer + '品' : '') + '<br>结账金额 ×' + g.pay + '<br>' + (g.weights[game.s.level-1] ? '当前饭馆可以接待' : '当前等级尚不会自然到访') + '</p></div></div><div class="guest-facts"><span>排队耐心 ' + g.patience + ' 秒</span><span>成品等待 ' + g.wait + ' 秒</span><span>食材掉落 ' + Math.round(g.drop*100) + '%</span><span>铭牌掉落 ' + Math.round(g.fragment*100) + '%</span></div><p>结账时可能获得' + ({1:'红',2:'绿',3:'蓝'}[g.tier]) + '色食材，食材与铭牌分别判定。</p></div>');
  }
  function renderUpgrades() {
    const s = game.s, next = C.levels[s.level + 1], nextChef = C.chefs[s.chef + 1];
    html('upgrades', `<div class="upgrade-content"><p class="upgrade-intro">每一次升级，都是小店的新开始。<br>饭馆决定规模，厨师决定能做什么。</p><article class="upgrade-item"><h3>饭馆 · ${esc(game.level.name)}<span>Lv.${s.level}</span></h3>${next ? `<p>下一站：${next.name}</p><div class="upgrade-metrics"><span>桌位 ${game.level.tables} → ${next.tables}</span><span>排队 ${game.level.queue} → ${next.queue}</span><span>灶眼 ${game.level.stoves} → ${next.stoves}</span><span>菜单 ${game.level.menu} → ${next.menu}</span><span>客流 ${game.level.arrivals} → ${next.arrivals}/分</span><span>解锁 ${s.level + 1}品菜与厨师</span></div><button class="primary-button" data-upgrade="restaurant" ${game.upgradeStatus('restaurant') ? 'disabled' : ''}>升级饭馆 · ${costText(next.cost)}</button><p class="upgrade-reason">${esc(game.upgradeStatus('restaurant') || '资源齐备，可升级')}</p>` : '<p>高朋满座！已完成本 Demo 的饭馆成长。</p>'}</article><article class="upgrade-item"><h3>厨师 · ${game.chef.name}<span>Lv.${s.chef}</span></h3>${nextChef ? `<p>下一位：${nextChef.name}<br>可做菜：1–${s.chef + 1}品 · 烹饪速度 ${game.chef.speed}× → ${nextChef.speed}×<br>升级会按新速度调整正在烹饪的订单。</p><button class="primary-button" data-upgrade="chef" ${game.upgradeStatus('chef') ? 'disabled' : ''}>升级厨师 · ¥${nextChef.cost}</button><p class="upgrade-reason">${esc(game.upgradeStatus('chef') || '资源齐备，可升级')}</p>` : '<p>掌勺厨师已就位！速度倍率 1.50×。</p>'}</article></div>`);
  }
  function renderGifts() {
    const s = game.s;
    html('gifts', C.gifts.map((g,index) => {
      const cooldown = g.id === 'bomb' && s.bombCooldown;
      const active = g.id === 'donut' ? s.donutSeconds ? `${s.donutSeconds}s` : '' : g.id === 'mirror' ? s.mirrorSeconds ? `${s.mirrorLayers}层` : '' : cooldown ? `${cooldown}s` : '';
      return `<button class="gift-card" data-key="gift-${g.id}" data-gift="${g.id}" title="${esc(g.description)}" ${cooldown ? 'disabled' : ''} aria-label="赠送${g.name}${active ? '，当前' + active : ''}"><span class="gift-icon">${sprite('prop',index)}</span>${active ? `<span class="gift-active">${active}</span>` : '<span class="gift-arrow">↗</span>'}<strong>${g.name}</strong><small>${g.short}</small></button>`;
    }).join(''));
    put('pity-counter', `新菜保底 ${s.pity} / 10`);
    if (s.lastGift?.id === 'pill' && s.lastLottery) put('gift-feedback', `${s.lastLottery.forced ? '十抽保底 · ' : ''}${s.lastLottery.text}`);
    else if (s.lastGift) put('gift-feedback', s.lastGift.message);
    else put('gift-feedback', '点击礼物，看看小店会发生什么。');
  }
  function renderLogs() {
    const logs = game.s.logs.filter(l => logFilter === 'all' || logFilter === 'business' && ['arrival','order','ready','serve','checkout','growth'].includes(l.type) || logFilter === 'gift' && ['gift','lottery'].includes(l.type) || logFilter === 'leave' && ['leave','warning'].includes(l.type));
    put('scene-news', game.s.logs[0]?.text || '新店开张，等第一位街坊来尝尝。');
    html('event-log', logs.slice(0, 45).map(l => `<div class="event-entry" data-key="log-${l.id}" data-type="${l.type}"><time>${clock(l.time)}</time><span>${esc(l.text)}</span></div>`).join('') || '<p class="panel-footnote">暂无这类动态。</p>');
  }
  function render() {
    for (const key of ['red','green','blue','fragments','arrivals']) put(key, game.s[key]);
    put('cash', fmt(game.s.cash)); put('revenue', `¥${fmt(game.s.revenue)}`); put('game-time', clock(game.s.time));
    renderScene(); renderMenu(); renderUpgrades(); renderGifts(); renderLogs(); renderOverview(); renderGuests();
    visuals.flush(game, avatar, dishSprite); syncPresentation();
  }
  function syncPresentation() {
    const frozen = paused || document.hidden || $('info-dialog').open;
    document.body.classList.toggle('motion-paused', frozen);
    $('game-scene').classList.toggle('motion-paused', frozen); visuals.setPaused(frozen); sound.sync(frozen, game.cooking.length);
    $('sound-button').textContent = sound.preferences.muted ? '♩' : '♪';
    $('sound-button').setAttribute('aria-label', sound.preferences.muted ? '开启声音' : '静音');
    $('sound-button').setAttribute('aria-pressed', String(sound.preferences.muted));
    $('sound-button').dataset.audioState = sound.unavailable ? 'unavailable' : sound.ctx?.state || 'waiting';
    $('sound-button').dataset.audioLoaded = String(Object.keys(sound.buffers).length);
    $('sound-button').title = sound.unavailable ? '当前浏览器声音不可用，游戏仍可正常运行' : sound.preferences.muted ? '点击开启声音' : '点击静音；音量和音乐可在设置调整';
  }
  function togglePause(value = !paused) { paused = value; accumulator = 0; lastFrame = performance.now(); renderScene(); syncPresentation(); }
  function openDialog(title, body) { put('dialog-title', title); $('dialog-body').innerHTML = body; if (!$('info-dialog').open) $('info-dialog').showModal(); accumulator = 0; syncPresentation(); }
  function help() {
    openDialog('从一碗阳春面开始', `<h3>小店的第一天</h3><ol><li>客人自动到访。初始客流为每分钟2人，约30秒来一位。</li><li>客人落座后自动点菜，厨师按空灶眼依次制作。</li><li>菜做好后，点击<strong>出餐</strong>，或发一条“出餐”弹幕。等待太久，客人会离开。</li><li>用餐5秒后自动结账，获得现金，并有机会掉落食材和铭牌。</li><li>研发新菜、调整上架，积攒现金和铭牌升级饭馆，再升级厨师。</li></ol><h3>礼物让经营更有变化</h3><ul>${C.gifts.map(g => `<li><strong>${g.icon} ${g.name}</strong>：${esc(g.description)}</li>`).join('')}</ul><p class="notice">这是本地模拟，礼物免费。绿色和蓝色食材也可以通过能量药丸获得。想快速试玩成长，可以连续点击药丸，但升级和研发仍需满足条件。</p><h3>时间与存档</h3><p>左侧可暂停或切换1×、2×、5×倍速。查看菜谱、成长和客人页面时继续营业。页面切到后台、打开说明弹窗时暂停计时。现金、食材、等级、菜单和抽奖保底自动保存；刷新后客人与临时礼物效果重新开始。</p>`);
  }
  function settings() {
    const p = sound.preferences;
    openDialog('存档与设置', `<h3>声音与动态</h3><div class="media-settings"><label class="volume-row" for="audio-volume">音量 <span id="volume-label">${Math.round(p.volume*100)}%</span><input id="audio-volume" type="range" min="0" max="100" value="${Math.round(p.volume*100)}"></label><label><input id="music-enabled" type="checkbox" ${p.music ? 'checked' : ''}> 环境音乐 <small>24秒原创轻柔配乐</small></label><label><input id="effects-enabled" type="checkbox" ${p.effects ? 'checked' : ''}> 操作与经营音效 <small>提示音与后厨声</small></label><label><input id="motion-enabled" type="checkbox" ${p.motion ? 'checked' : ''}> 动态效果 <small>关闭后保留状态与时间提示</small></label><label><input id="layout-lines" type="checkbox" ${layoutGuides ? 'checked' : ''}> 桌位校准线 <small>显示区间、中心与预留位置</small></label><button id="audio-preview" class="secondary-button">试听出锅提示</button><p id="audio-status">${sound.unavailable ? '当前浏览器声音不可用，游戏仍可正常运行。' : p.muted ? '当前静音，可点击顶部♪按钮开启。' : '首次操作后开启声音；暂停、弹窗与后台时静音。'}</p></div><h3>小店的经营记录</h3><p>成长资源每次变化立即保存到浏览器本地。在线客人、营业日统计、临时礼物效果不存档。${normalGame ? '<strong>当前处于验收实验，原存档保持不变。</strong>' : ''}</p>${storageError || invalidSave ? '<p class="notice">' + (invalidSave ? '原存档无法读取，已保留原始内容且停止覆盖。请先导出原始存档备份，再导入有效存档或重新开店。' : '浏览器存储暂不可用。可导出当前进度，或重试自动保存。') + '</p>' : ''}<div class="dialog-actions"><button class="secondary-button" id="export-save">${invalidSave ? '导出原始存档' : '导出存档'}</button><button class="secondary-button" id="import-save">导入存档</button><input id="save-file" type="file" accept="application/json,.json" hidden><button class="danger-button" id="reset-ask">重新开店</button></div><div class="dialog-actions"><button id="acceptance-button" class="secondary-button">验收与规则</button></div>${storageError && !invalidSave ? '<button id="retry-save" class="secondary-button">重试自动保存</button>' : ''}<h3>当前经营概况</h3><p>饭馆 Lv.${game.s.level} · 厨师 Lv.${game.s.chef}<br>已激活 ${game.s.unlocked.length} / 12 道菜 · 已上架 ${game.s.menu.length} / ${game.level.menu}<br>随机数采用固定种子，可通过同样的操作复现。默认种子：${C.seed}。</p><p>离线运行无需登录、无需联网，也不会连接直播或支付平台。</p>`);
  }
  function acceptance() {
    openDialog('验收与规则', `<h3>可直接复现的验收场景</h3><p>实验使用独立的临时状态。原经营进度保留，实验不会覆盖本地存档；点击“回到我的饭馆”即可恢复。刷新页面也会回到正式存档。实验中暂停后，可点击“推进1秒”逐秒核对边界。</p><div class="debug-scenarios"><button data-scenario="queue">满员与排队流失<small>T01 / T05 · 3桌 + 5排队</small></button><button data-scenario="ready">手动出餐与超时<small>T03 / T04 · 一道成品等待出餐</small></button><button data-scenario="cooking">烹饪与仙女棒<small>T02 / T09 · 一道正在制作的订单</small></button><button data-scenario="multi-stove">多灶仙女棒<small>T09 · 三单各4根，自动切换</small></button><button data-scenario="chef-timing">厨师变速计时<small>T08 / T09 · 连升两级后烹饪8秒</small></button><button data-scenario="growth">研发与成长<small>T06 / T07 / T08 · 足够的资源</small></button><button data-scenario="chef-lock">高级菜厨师锁<small>T08 · 2级店、1级厨师、已激活高级菜</small></button><button data-scenario="pity">第十抽保底<small>T10 · 已连续9抽未获得新菜</small></button><button data-scenario="max-gifts">礼物上限与冷却<small>T11 / T12 / T13 · 3层镜、180秒托管</small></button><button id="return-game">回到我的饭馆<small>退出实验并恢复正式经营进度</small></button></div><h3>冻结范围</h3><p>3级饭馆、3级厨师、12道菜、6类客人、5种模拟礼物、研发、上下架、本地成长存档。验收清单 T01–T14 和自动化测试见 README 与 tests/。</p><h3>补充规则口径</h3><ul><li>用餐固定5秒。满灶时已落座订单先进先出等待，不额外设烹饪等待超时。</li><li>客人品级1/2/3分别掉落红/绿/蓝食材×1，掉落概率依客人类型配置。铭牌独立判定。</li><li>高级“优先”客人优先点对应品级，缺货时可点其接受范围中的低级菜；企业主只接受2–3品。</li><li>仙女棒选择最早开始且仍可加速的订单；每单最多4根，最低剩余为该单实际时长的20%。达到上限后自动选下一单；全部达到上限才不生效。</li><li>厨师升级立即按速度比例调整在制订单。已点单菜品下架后，原订单继续制作。</li><li>魔法镜增强当前到访池最高两个品级的权重，再归一化。炸弹保底品级取当前菜单实际可服务的最高客人品级。</li><li>保底计数为连续未获得新菜奖励的抽数；获得新菜奖励（含材料包转换）后重置。</li><li>临时效果在最后一个有效Tick仍生效；剩余时间归零后结束。自然客流用累计进度处理。</li></ul><p class="notice">打开弹窗时暂停经营。自动化测试可使用 <code>npm test</code>，无须安装依赖。</p>`);
  }
  function scenario(name) {
    if (!normalGame) { persist(); normalGame = game; }
    game = new window.BaiweiGame({ seed: C.seed });
    const s = game.s;
    if (name === 'queue') { for (let i = 0; i < 9; i++) game.arrive('student'); }
    if (name === 'ready') { const c = game.arrive('student'); c.state = 'ready'; c.readyAt = 0; c.remaining = 10; }
    if (name === 'cooking') game.arrive('student');
    if (name === 'multi-stove') { s.level = 3; s.menu = ['D0101']; for(let i=0;i<3;i++)game.arrive('student'); }
    if (name === 'chef-timing') { s.level = 3; s.cash = 800; s.unlocked.push('D0104'); s.menu = ['D0104']; game.arrive('student'); game.upgrade('chef'); game.upgrade('chef'); }
    if (name === 'growth') { s.cash = 5000; s.red = 30; s.green = 30; s.blue = 30; s.fragments = 12; }
    if (name === 'chef-lock') { s.level = 2; s.cash = 400; game.unlock(C.dishes.find(d => d.id === 'D0201')); }
    if (name === 'pity') s.pity = 9;
    if (name === 'max-gifts') { s.level = 3; s.chef = 3; for (let i = 0; i < 4; i++) game.gift('mirror'); for (let i = 0; i < 4; i++) game.gift('donut'); game.gift('bomb'); }
    game.log('system', '已进入验收实验，所有操作不写入正式存档。');
    visuals.reset(game);
    paused = name === 'chef-timing' || name === 'multi-stove'; accumulator = 0; lastFrame = performance.now(); $('info-dialog').close(); showScreen('home'); render(); toast({ ok: true, message: '已进入独立验收实验，可在“验收与规则”中返回。' });
  }
  function returnGame() {
    if (normalGame) { game = normalGame; normalGame = null; }
    visuals.reset(game);
    paused = false; accumulator = 0; lastFrame = performance.now(); $('info-dialog').close(); render();
    toast({ ok: true, message: '已回到你的饭馆，原经营进度保持不变。' });
  }
  $('serve-button').addEventListener('click', () => act(() => game.serveOne()));
  $('page-serve-button').addEventListener('click', () => act(() => game.serveOne()));
  $('pause-button').addEventListener('click', () => togglePause()); $('resume-button').addEventListener('click', () => togglePause(false));
  $('debug-step').addEventListener('click', () => {
    if (!normalGame || !paused) return;
    game.step(); visuals.capture(game); accumulator = 0; render();
  });
  $('help-button').addEventListener('click', help); $('settings-button').addEventListener('click', settings);
  $('close-dialog').addEventListener('click', () => $('info-dialog').close());
  $('info-dialog').addEventListener('close', () => { accumulator = 0; lastFrame = performance.now(); syncPresentation(); });
  $('log-filter').addEventListener('change', e => { logFilter = e.target.value; renderLogs(); });
  $('chat-form').addEventListener('submit', e => { e.preventDefault(); const text = $('chat-input').value; if (!text.trim()) return; const gift = C.gifts.find(g => g.name === text.trim() || ({仙女棒:'wand',药丸:'pill'})[text.trim()] === g.id); act(() => game.command(text),gift?.id); $('chat-input').value = ''; });
  $('speed-cycle').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 5 : 1; accumulator = 0; put('speed-cycle-value', speed + '×'); });
  $('log-chat-form').addEventListener('submit', e => { e.preventDefault(); const input = $('log-chat-input'), text = input.value.trim(); if (!text) return; const gift = C.gifts.find(g => g.name === text || ({仙女棒:'wand',药丸:'pill'})[text] === g.id); act(() => game.command(text), gift?.id); input.value = ''; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('info-dialog').open && currentScreen !== 'home') showScreen('home'); });
  window.addEventListener('resize', resizeGame); resizeGame();
  const unlockSound = () => { sound.unlock().then(syncPresentation); };
  document.addEventListener('pointerdown', unlockSound, {passive:true});
  document.addEventListener('keydown', e => { if(['Enter',' ','ArrowLeft','ArrowRight'].includes(e.key))unlockSound(); });
  $('sound-button').addEventListener('click', () => { sound.set('muted', !sound.preferences.muted); syncPresentation(); });
  document.addEventListener('input', e => { if(e.target.id === 'audio-volume'){sound.set('volume',Number(e.target.value)/100);put('volume-label',`${e.target.value}%`);} });
  document.addEventListener('change', e => {
    if(e.target.id === 'layout-lines'){layoutGuides=e.target.checked;renderScene();}
    const fields={'music-enabled':'music','effects-enabled':'effects','motion-enabled':'motion'};
    if(fields[e.target.id]){sound.set(fields[e.target.id],e.target.checked);if(!sound.preferences.motion)visuals.clear();syncPresentation();}
  });
  document.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    if(!button.dataset.gift && !button.dataset.upgrade && !button.dataset.research && button.id !== 'audio-preview')sound.play('click');
    if (button.dataset.gift) act(() => game.gift(button.dataset.gift),button.dataset.gift);
    if (button.dataset.menu) act(() => game.toggleMenu(button.dataset.menu));
    if (button.dataset.research) act(() => game.research(button.dataset.research));
    if (button.dataset.upgrade) act(() => game.upgrade(button.dataset.upgrade));
    if (button.dataset.speed) {
      speed = Number(button.dataset.speed); accumulator = 0;
      document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', b === button));
    }
    if (button.dataset.tier) { menuPage = 0; tier = Number(button.dataset.tier); document.querySelectorAll('[data-tier]').forEach(b => b.classList.toggle('active', b === button)); renderMenu(); }

    if (button.dataset.screen) showScreen(button.dataset.screen);
    if (button.dataset.dishSelect) { selectedDish = button.dataset.dishSelect; renderMenu(); }
    if (button.dataset.guestSelect) { selectedGuest = button.dataset.guestSelect; renderGuests(); }
    if (button.dataset.paginate) { menuPage += Number(button.dataset.paginate); renderMenu(); }
    if (button.id === 'acceptance-button') acceptance();
    if (button.dataset.scenario) scenario(button.dataset.scenario);
    if (button.id === 'return-game') returnGame();
    if (button.id === 'export-save') {
      const blob = new Blob([invalidSave && originalSave !== null ? originalSave : JSON.stringify((normalGame || game).serialize(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = invalidSave ? '百味饭馆-原始存档备份.json' : '百味饭馆-成长存档.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (button.id === 'retry-save') { storageError = false; lastSave = ''; persist(); render(); put('save-status', storageError ? '存档仍不可用 · 请导出备份' : '成长自动保存'); toast({ok:!storageError,message:storageError?'存储仍不可用，请导出当前进度。':'自动保存已恢复。'}); }
    if (button.id === 'import-save') $('save-file').click();
    if (button.id === 'audio-preview') {
      sound.unlock().then(() => {
        if(sound.preferences.muted || !sound.preferences.effects){put('audio-status','请开启声音和操作音效后试听。');return;}
        sound.play('ready',true);put('audio-status',sound.unavailable?'当前浏览器声音不可用。':'正在试听出锅提示。');
      });
    }
    if (button.id === 'reset-ask') {
      $('dialog-body').innerHTML = '<p class="notice">重新开店会清空本浏览器中这家饭馆的成长记录。可先关闭弹窗并导出存档。</p><div class="dialog-actions"><button class="danger-button" id="reset-confirm">确认清空，重新开店</button><button class="secondary-button" id="reset-cancel">取消</button></div>';
    }
    if (button.id === 'reset-cancel') settings();
    if (button.id === 'reset-confirm') {
      game = new window.BaiweiGame(); normalGame = null; invalidSave = false; originalSave = null; storageError = false; lastSave = ''; paused = false; accumulator = 0;
      visuals.reset(game);
      persist(); $('info-dialog').close(); render(); toast({ ok: true, message: '新店开张，欢迎第一位客人！' });
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id !== 'save-file' || !e.target.files?.[0]) return;
    try {
      const file = e.target.files[0]; if (file.size > 100000) throw new Error('存档文件过大');
      const save = JSON.parse(await file.text());
      if (save.version !== C.saveVersion || !Number.isInteger(save.level) || !Number.isInteger(save.chef) || !Array.isArray(save.unlocked) || !Array.isArray(save.menu)) throw new Error('不是有效的百味饭馆存档');
      game = new window.BaiweiGame({ save }); normalGame = null; invalidSave = false; storageError = false; lastSave = ''; accumulator = 0;
      visuals.reset(game);
      persist(); $('info-dialog').close(); render(); toast({ ok: true, message: '成长存档已导入。' });
    } catch (error) { toast({ ok: false, message: `导入失败：${error.message}` }); }
  });
  document.addEventListener('visibilitychange', () => { persist(); accumulator = 0; lastFrame = performance.now(); syncPresentation(); });
  window.addEventListener('pagehide', persist);
  function frame(now) {
    const delta = Math.max(0, now - lastFrame) / 1000; lastFrame = now;
    if (!paused && !document.hidden && !$('info-dialog').open) {
      accumulator += delta * speed;
      const seconds = Math.floor(accumulator);
      if (seconds > 0) { for(let i=0;i<Math.min(seconds,86400);i++){game.step();visuals.capture(game);} accumulator -= seconds; persist(); render(); }
    } else accumulator = 0;
    if (!$('toast').hidden && now > toastUntil) $('toast').hidden = true;
    requestAnimationFrame(frame);
  }
  render(); persist(); requestAnimationFrame(frame);
  if (invalidSave) toast({ok:false,message:'原存档无法读取，已保留原记录。请在设置中导出备份。'});
  if (storageError) toast({ ok: false, message: '本地存档暂不可用，可通过设置手动导出成长记录。' });
})();
