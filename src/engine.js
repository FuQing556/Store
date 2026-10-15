(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.BaiweiConfig;
  const money = value => Math.round(value * 100) / 100;
  // Speed ratios can produce 8.000000000000002: keep real fractions, snap only integer noise.
  const snapSeconds = value => Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value;
  const resources = ['cash', 'red', 'green', 'blue', 'fragments'];
  const finite = (v, fallback = 0) => Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER / 100 ? v : fallback;
  class Game {
    constructor(options = {}) {
      this.rngState = (options.seed ?? C.seed) >>> 0 || 1;
      this.injectedRandom = options.random || null;
      this.logSequence = 0;
      this.s = {
        time: 0, level: 1, chef: 1, cash: 0, red: 0, green: 0, blue: 0, fragments: 0,
        unlocked: C.dishes.filter(d => d.initial).map(d => d.id),
        menu: C.dishes.filter(d => d.initial).map(d => d.id), customers: [], nextId: 1,
        arrivalProgress: 0, mirrorLayers: 0, mirrorSeconds: 0, donutSeconds: 0, bombCooldown: 0,
        pity: 0, draws: 0, served: 0, arrivals: 0, revenue: 0,
        lost: { capacity: 0, queue: 0, ready: 0, menu: 0 }, logs: [],
        lastLottery: null, lastGift: null
      };
      if (options.save) this.restore(options.save);
      this.log('system', '开门营业啦！客人会自动到访，菜做好后记得出餐。');
    }
    get level() { return C.levels[this.s.level]; }
    get chef() { return C.chefs[this.s.chef]; }
    get queue() { return this.s.customers.filter(c => c.state === 'queue'); }
    get seated() { return this.s.customers.filter(c => c.state !== 'queue'); }
    get cooking() { return this.s.customers.filter(c => c.state === 'cooking').sort((a,b) => a.started - b.started || a.id - b.id); }
    get ready() { return this.s.customers.filter(c => c.state === 'ready').sort((a,b) => a.readyAt - b.readyAt || a.id - b.id); }
    get availableMenu() { return C.dishes.filter(d => this.s.menu.includes(d.id) && this.s.unlocked.includes(d.id) && d.tier <= this.s.chef && d.tier <= this.s.level); }
    get freeCapacity() { return this.level.tables + this.level.queue - this.s.customers.length; }
    get flowMultiplier() { return [1, 1.5, 2, 2.5][this.s.mirrorLayers]; }
    random() {
      if (this.injectedRandom) return Math.max(0, Math.min(.999999999, this.injectedRandom()));
      let x = this.rngState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.rngState = x >>> 0; return this.rngState / 4294967296;
    }
    weighted(items, weight) {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      let n = this.random() * total;
      for (const item of items) { n -= weight(item); if (n < 0) return item; }
      return items[items.length - 1];
    }
    log(type, text) {
      this.s.logs.unshift({ id: ++this.logSequence, time: this.s.time, type, text });
      this.s.logs.length = Math.min(this.s.logs.length, 100);
    }
    result(ok, message) { if (!ok) this.log('warning', message); return { ok, message }; }
    guestType(c) { return C.guests.find(g => g.id === c.type); }
    dish(c) { return C.dishes.find(d => d.id === c.dish); }
    chooseGuest(highest = false) {
      let pool = C.guests.filter(g => g.weights[this.s.level - 1] > 0);
      if (highest) {
        pool = pool.filter(g => this.availableMenu.some(d => g.accepts.includes(d.tier)));
        const tier = Math.max(...pool.map(g => g.tier)); pool = pool.filter(g => g.tier === tier);
      }
      // “最高两档”按当前饭馆到访池中最高的两个品级解释。
      const top = Math.max(...C.guests.filter(g => g.weights[this.s.level - 1] > 0).map(g => g.tier));
      return this.weighted(pool, g => g.weights[this.s.level - 1] * (g.tier >= top - 1 ? 1.5 ** this.s.mirrorLayers : 1));
    }
    arrive(type) {
      this.s.arrivals++;
      if (this.queue.length >= this.level.queue && this.seated.length >= this.level.tables) {
        this.s.lost.capacity++; this.log('leave', '排队区已满，新客人离开了。'); return null;
      }
      const g = type ? C.guests.find(g => g.id === type) : this.chooseGuest();
      if (!g || !g.weights[this.s.level - 1]) return null;
      const c = { id: this.s.nextId++, type: g.id, state: 'queue', remaining: g.patience, entered: this.s.time, table: null, dish: null, wands: 0 };
      this.s.customers.push(c); this.log('arrival', `${g.name} #${c.id} 到访，进入排队区。`);
      this.seatQueue(); this.assignStoves(); return c;
    }
    leave(c, reason, message) {
      this.s.customers = this.s.customers.filter(item => item.id !== c.id);
      this.s.lost[reason]++; this.log('leave', `${this.guestType(c).name} #${c.id} ${message}`);
    }
    seatQueue() {
      while (this.queue.length && this.seated.length < this.level.tables) {
        const c = this.queue[0], g = this.guestType(c);
        let dishes = this.availableMenu.filter(d => g.accepts.includes(d.tier));
        if (g.prefer && dishes.some(d => d.tier === g.prefer)) dishes = dishes.filter(d => d.tier === g.prefer);
        if (!dishes.length) { this.leave(c, 'menu', '没有合适的可做菜品，离开了。'); continue; }
        c.table = Array.from({ length: this.level.tables }, (_, i) => i).find(i => !this.seated.some(s => s.table === i));
        c.dish = dishes[Math.floor(this.random() * dishes.length)].id;
        c.state = 'ordered'; c.remaining = 0;
        this.log('order', `${g.name} #${c.id} 落座，点了${this.dish(c).name}。`);
      }
    }
    assignStoves() {
      while (this.cooking.length < this.level.stoves) {
        const c = this.s.customers.find(c => c.state === 'ordered'); if (!c) break;
        c.state = 'cooking'; c.started = this.s.time; c.duration = snapSeconds(this.dish(c).cook / this.chef.speed); c.remaining = c.duration; c.wands = 0;
      }
    }
    serveOne() {
      const c = this.ready[0];
      if (!c) return this.result(false, '还没有待出餐的菜，请稍等厨师完成。');
      this.serve(c, false); return this.result(true, `${this.dish(c).name} 已出餐`);
    }
    serve(c, automatic) {
      if (c.state !== 'ready') return;
      c.state = 'eating'; c.remaining = C.eatingSeconds;
      this.log('serve', `${automatic ? '自动' : '手动'}出餐：${this.dish(c).name} → ${this.guestType(c).name} #${c.id}。`);
    }
    checkout(c) {
      const g = this.guestType(c), cash = money(this.dish(c).price * g.pay), drops = [];
      this.s.cash = money(this.s.cash + cash); this.s.revenue = money(this.s.revenue + cash); this.s.served++;
      if (this.random() < g.drop) {
        const key = ['red', 'green', 'blue'][g.tier - 1]; this.s[key]++; drops.push(`${{ red: '红', green: '绿', blue: '蓝' }[key]}食材 +1`);
      }
      if (this.random() < g.fragment) { this.s.fragments++; drops.push('铭牌 +1'); }
      this.s.customers = this.s.customers.filter(item => item.id !== c.id);
      this.log('checkout', `${g.name} #${c.id} 结账 +¥${cash}${drops.length ? ' · ' + drops.join('，') : ''}。`);
    }
    step(seconds = 1) {
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) throw new RangeError('Tick 必须是0–86400的整数秒');
      for (let i = 0; i < seconds; i++) {
        this.s.time++;
        // 生效中的自动出餐先处理已有成品，避免时间耗尽前最后一秒错失订单。
        const justServed = this.s.donutSeconds > 0 ? this.ready : [];
        const donutWasActive = this.s.donutSeconds > 0;
        justServed.forEach(c => this.serve(c, true));
        for (const c of [...this.s.customers]) {
          if (c.state === 'ordered' || justServed.includes(c)) continue;
          c.remaining = Math.max(0, snapSeconds(c.remaining - 1));
          if (c.remaining > 0) continue;
          if (c.state === 'queue') this.leave(c, 'queue', '排队耐心耗尽，离开了。');
          else if (c.state === 'cooking') {
            c.state = 'ready'; c.readyAt = this.s.time; c.remaining = this.guestType(c).wait;
            this.log('ready', `${this.dish(c).name} 做好了！${this.guestType(c).name} #${c.id} 等待出餐。`);
            if (this.s.donutSeconds > 0) this.serve(c, true);
          } else if (c.state === 'ready') this.leave(c, 'ready', '等待出餐超时，菜品作废。');
          else if (c.state === 'eating') this.checkout(c);
        }
        this.seatQueue(); this.assignStoves();
        this.s.arrivalProgress += this.level.arrivals * this.flowMultiplier / 60;
        while (this.s.arrivalProgress >= 1 - 1e-10) { this.s.arrivalProgress = Math.max(0, this.s.arrivalProgress - 1); this.arrive(); }
        for (const key of ['mirrorSeconds', 'donutSeconds', 'bombCooldown']) this.s[key] = Math.max(0, this.s[key] - 1);
        if (!this.s.mirrorSeconds && this.s.mirrorLayers) { this.s.mirrorLayers = 0; this.log('gift', '魔法镜结束，客流与到访权重恢复。'); }
        if (donutWasActive && !this.s.donutSeconds) this.log('gift', '自动出餐结束，恢复手动出餐。');
      }
      return this.s;
    }
    activateCandidates() { return C.dishes.filter(d => !this.s.unlocked.includes(d.id) && d.tier <= this.s.level && d.tier <= this.s.chef); }
    unlock(d) {
      this.s.unlocked.push(d.id);
      if (this.s.menu.length < this.level.menu) this.s.menu.push(d.id);
    }
    lottery() {
      this.s.draws++;
      const candidates = this.activateCandidates();
      const forced = this.s.pity >= 9;
      const reward = forced ? 'dish' : this.weighted(C.lottery, r => r.weight).id;
      let text;
      if (reward === 'dish') {
        this.s.pity = 0;
        if (candidates.length) {
          const d = candidates[Math.floor(this.random() * candidates.length)]; this.unlock(d); text = `新菜品「${d.name}」已激活${this.s.menu.includes(d.id) ? '并上架' : '，请调整菜单上架'}！`;
        } else { this.s.red += 2; this.s.green += 2; this.s.blue += 2; text = '暂无可激活新菜，转换为红、绿、蓝食材各 ×2。'; }
      } else {
        this.s.pity++;
        const amount = reward === 'cash' ? 50 : reward === 'fragments' ? 1 : 2;
        this.s[reward] = money(this.s[reward] + amount);
        text = `${{ red: '红火食材', green: '清鲜食材', blue: '山海食材', fragments: '铭牌碎片', cash: '现金' }[reward]} +${amount}。`;
      }
      this.s.lastLottery = { reward, text, forced, draw: this.s.draws };
      this.s.lastGift = { id: 'pill', time: this.s.time, message: text };
      this.log('lottery', `${forced ? '十抽保底 · ' : ''}${text}`); return this.result(true, text);
    }
    gift(id) {
      let message;
      if (id === 'pill') return this.lottery();
      if (id === 'wand') {
        const orders = this.cooking;
        if (!orders.length) return this.result(false, '没有正在烹饪的订单，仙女棒未使用。');
        const c = orders.find(order => order.wands < 4 && order.remaining > order.duration * .2 + 1e-9);
        if (!c) return this.result(false, '所有烹饪订单均已用满4根或进入最后20%时间，仙女棒未使用。');
        // 保留本订单加速前实际时长的20%；每根扣除菜品配置基础时长的20%。
        const floor = c.duration * .2, reduction = this.dish(c).cook * .2;
        c.remaining = snapSeconds(Math.max(floor, c.remaining - reduction)); c.wands++;
        message = `${c.table + 1}号桌 · ${this.dish(c).name} 加速，剩余 ${Math.ceil(c.remaining)} 秒（${c.wands}/4根）。`;
      } else if (id === 'mirror') {
        this.s.mirrorLayers = Math.min(3, this.s.mirrorLayers + 1); this.s.mirrorSeconds = 30;
        message = `魔法镜 ${this.s.mirrorLayers} 层，客流 ×${this.flowMultiplier}，持续30秒。`;
      } else if (id === 'donut') {
        this.s.donutSeconds = Math.min(180, this.s.donutSeconds + 60);
        this.ready.forEach(c => this.serve(c, true)); message = `自动出餐已开启，剩余 ${this.s.donutSeconds} 秒。`;
      } else if (id === 'bomb') {
        if (this.s.bombCooldown) return this.result(false, `炸弹冷却中，还需 ${this.s.bombCooldown} 秒。`);
        if (this.freeCapacity < 3) return this.result(false, '至少需要3个空桌位或空排队位，炸弹未使用。');
        if (!this.availableMenu.length) return this.result(false, '当前没有可做菜品，炸弹未使用。');
        const count = Math.min(3 + this.s.level, this.freeCapacity), high = Math.floor(count * .3);
        for (let i = 0; i < count; i++) this.arrive(i < high ? this.chooseGuest(true).id : undefined);
        this.s.bombCooldown = 20; message = `招揽 ${count} 位客人，其中 ${high} 位为当前可服务最高品级。`;
      } else return this.result(false, '未知礼物。');
      this.s.lastGift = { id, time: this.s.time, message }; this.log('gift', message); return this.result(true, message);
    }
    shortage(cost) {
      const labels = { cash: '现金', red: '红食材', green: '绿食材', blue: '蓝食材', fragments: '铭牌碎片' };
      return Object.entries(cost).filter(([k,v]) => this.s[k] + 1e-9 < v).map(([k,v]) => `${labels[k]}缺 ${money(v - this.s[k])}`).join('，');
    }
    spend(cost) { for (const [k,v] of Object.entries(cost)) this.s[k] = money(this.s[k] - v); }
    researchStatus(id) {
      const d = C.dishes.find(d => d.id === id);
      if (!d) return '未知菜品';
      if (this.s.unlocked.includes(id)) return '已激活';
      if (d.tier > this.s.level) return `需要${d.tier}级饭馆`;
      if (d.tier > this.s.chef) return `需要${d.tier}级厨师`;
      return this.shortage(d.cost);
    }
    research(id) {
      const reason = this.researchStatus(id);
      if (reason) return this.result(false, reason);
      const d = C.dishes.find(d => d.id === id); this.spend(d.cost); this.unlock(d);
      this.log('growth', `研发成功：${d.name}，${this.s.menu.includes(id) ? '已自动上架' : '菜单位已满，请调整上架'}。`);
      return this.result(true, `${d.name} 研发成功`);
    }
    toggleMenu(id) {
      if (!this.s.unlocked.includes(id)) return this.result(false, '请先激活这道菜。');
      if (this.s.menu.includes(id)) {
        this.s.menu = this.s.menu.filter(item => item !== id); this.log('growth', `${C.dishes.find(d => d.id === id).name} 已下架。`);
      } else {
        if (this.s.menu.length >= this.level.menu) return this.result(false, '菜单位已满，请先下架一道菜。');
        this.s.menu.push(id); this.log('growth', `${C.dishes.find(d => d.id === id).name} 已上架。`);
      }
      return this.result(true, '菜单已更新；已点单的订单继续制作。');
    }
    upgradeStatus(kind) {
      if (kind === 'restaurant') return this.s.level === 3 ? '已达到最高等级' : this.shortage(C.levels[this.s.level + 1].cost);
      if (kind !== 'chef') return '未知升级类型';
      if (this.s.chef === 3) return '已达到最高等级';
      if (this.s.level < this.s.chef + 1) return `需要${this.s.chef + 1}级饭馆`;
      return this.shortage({ cash: C.chefs[this.s.chef + 1].cost });
    }
    upgrade(kind) {
      const reason = this.upgradeStatus(kind); if (reason) return this.result(false, reason);
      if (kind === 'restaurant') { this.spend(C.levels[this.s.level + 1].cost); this.s.level++; this.seatQueue(); this.assignStoves(); }
      else {
        const previous = this.chef.speed; this.spend({ cash: C.chefs[this.s.chef + 1].cost }); this.s.chef++;
        for (const c of this.cooking) { c.remaining = snapSeconds(c.remaining * previous / this.chef.speed); c.duration = snapSeconds(c.duration * previous / this.chef.speed); }
      }
      const message = kind === 'restaurant' ? `饭馆升级至 ${this.s.level} 级 · ${this.level.name}` : `厨师升级至 ${this.s.chef} 级 · ${this.chef.name}`;
      this.log('growth', message); return this.result(true, message);
    }
    command(text) {
      const cmd = text.trim();
      if (cmd === '出餐') return this.serveOne();
      const gift = C.gifts.find(g => g.name === cmd || ({ 仙女棒: 'wand', 药丸: 'pill' })[cmd] === g.id);
      if (gift) return this.gift(gift.id);
      return this.result(false, '支持“出餐”、五种礼物名称，以及“仙女棒”“药丸”。');
    }
    serialize() {
      const s = this.s;
      return { version: C.saveVersion, level: s.level, chef: s.chef, ...Object.fromEntries(resources.map(k => [k, s[k]])), unlocked: [...s.unlocked], menu: [...s.menu], pity: s.pity, draws: s.draws, rngState: this.rngState };
    }
    restore(save) {
      if (!save || save.version !== C.saveVersion) { this.saveRejected = true; return; }
      const s = this.s;
      s.level = Number.isInteger(save.level) ? Math.max(1, Math.min(3, save.level)) : 1;
      s.chef = Number.isInteger(save.chef) ? Math.max(1, Math.min(s.level, save.chef)) : 1;
      for (const key of resources) s[key] = key === 'cash' ? money(finite(save[key])) : Math.floor(finite(save[key]));
      s.unlocked = [...new Set([...C.dishes.filter(d => d.initial).map(d => d.id), ...(Array.isArray(save.unlocked) ? save.unlocked : [])])].filter(id => C.dishes.some(d => d.id === id));
      s.menu = [...new Set(Array.isArray(save.menu) ? save.menu : s.menu)].filter(id => s.unlocked.includes(id)).slice(0, this.level.menu);
      s.pity = Math.min(9, Math.floor(finite(save.pity))); s.draws = Math.floor(finite(save.draws));
      if (Number.isInteger(save.rngState) && save.rngState > 0 && save.rngState < 4294967296) this.rngState = save.rngState >>> 0;
    }
    assertInvariants() {
      const s = this.s;
      if (resources.some(k => !Number.isFinite(s[k]) || s[k] < 0)) throw new Error('资源必须为非负有限数');
      if (this.seated.length > this.level.tables || this.queue.length > this.level.queue || this.cooking.length > this.level.stoves || s.menu.length > this.level.menu) throw new Error('容量越界');
      if (new Set(s.customers.map(c => c.id)).size !== s.customers.length) throw new Error('重复客人ID');
      if (new Set(this.seated.map(c => c.table)).size !== this.seated.length) throw new Error('重复桌位');
      if (s.customers.some(c => c.remaining < 0)) throw new Error('时间为负');
      return true;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Game, config: C };
  else root.BaiweiGame = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
