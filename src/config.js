(function (root) {
  'use strict';
  const levels = [null,
    { name: '折叠面摊', tables: 3, queue: 5, stoves: 1, menu: 3, arrivals: 2, cost: { cash: 0, fragments: 0 } },
    { name: '家常小饭馆', tables: 4, queue: 6, stoves: 2, menu: 5, arrivals: 2.4, cost: { cash: 300, fragments: 2 } },
    { name: '热闹小酒楼', tables: 5, queue: 8, stoves: 3, menu: 7, arrivals: 2.8, cost: { cash: 900, fragments: 6 } }
  ];
  const chefs = [null,
    { name: '学徒帮厨', speed: 1, cost: 0 },
    { name: '家常厨师', speed: 1.25, cost: 200 },
    { name: '掌勺厨师', speed: 1.5, cost: 600 }
  ];
  const dishes = [
    ['D0101', '阳春面', 1, 8, 8, 0, 0, 0, 0, '🍜'],
    ['D0102', '青菜汤面', 1, 8, 9, 0, 0, 0, 0, '🥬'],
    ['D0103', '葱油拌面', 1, 9, 10, 0, 0, 0, 0, '🥢'],
    ['D0104', '香煎葱油饼', 1, 10, 12, 60, 1, 3, 0, '🫓'],
    ['D0201', '红烧牛肉面', 2, 18, 18, 180, 3, 1, 0, '🍜'],
    ['D0202', '番茄鸡蛋饭', 2, 16, 16, 160, 2, 2, 0, '🍅'],
    ['D0203', '香菇滑鸡饭', 2, 20, 22, 220, 2, 2, 1, '🍚'],
    ['D0204', '鲜肉小馄饨', 2, 18, 20, 180, 2, 3, 0, '🥟'],
    ['D0301', '猪肉白菜水饺', 3, 32, 30, 420, 3, 3, 1, '🥟'],
    ['D0302', '宫保鸡丁套餐', 3, 38, 36, 520, 4, 2, 1, '🍱'],
    ['D0303', '鱼香肉丝饭', 3, 36, 34, 500, 4, 3, 1, '🍛'],
    ['D0304', '酱爆猪肝饭', 3, 34, 32, 460, 5, 2, 1, '🍲']
  ].map(([id, name, tier, price, cook, cash, red, green, blue, icon]) => ({
    id, name, tier, price, cook, icon, initial: cash === 0, cost: { cash, red, green, blue }
  }));
  const guests = [
    { id: 'student', name: '放学学生', tier: 1, accepts: [1], patience: 45, wait: 10, pay: 1, drop: .60, fragment: .08, weights: [55, 35, 25], color: '#567ca0', emoji: '🎒' },
    { id: 'worker', name: '工地工人', tier: 1, accepts: [1], patience: 50, wait: 12, pay: 1, drop: .65, fragment: .10, weights: [45, 30, 20], color: '#cf9b42', emoji: '👷' },
    { id: 'office', name: '赶时间上班族', tier: 2, accepts: [1, 2], patience: 40, wait: 10, pay: 1, drop: .70, fragment: .12, weights: [0, 25, 22], color: '#546a5d', emoji: '💼' },
    { id: 'blogger', name: '探店博主', tier: 2, accepts: [1, 2], prefer: 2, patience: 35, wait: 8, pay: 1.2, drop: .75, fragment: .14, weights: [0, 10, 13], color: '#bc6e82', emoji: '📸' },
    { id: 'owner', name: '小企业主', tier: 3, accepts: [2, 3], patience: 30, wait: 10, pay: 1.25, drop: .80, fragment: .18, weights: [0, 0, 13], color: '#806a9d', emoji: '🧳' },
    { id: 'critic', name: '美食评论家', tier: 3, accepts: [1, 2, 3], prefer: 3, patience: 25, wait: 8, pay: 1.4, drop: .85, fragment: .22, weights: [0, 0, 7], color: '#a85b49', emoji: '📝' }
  ];
  const gifts = [
    { id: 'wand', name: '红色仙女棒', icon: '🪄', short: '烹饪加速', description: '加速最早开始且仍可加速的订单，达到4根或20%下限后自动选下一单；每根减少基础时长的20%。' },
    { id: 'pill', name: '能量药丸', icon: '💊', short: '食材与新菜', description: '随机获得食材、铭牌、新菜或现金；连续10抽必得可激活新菜。' },
    { id: 'mirror', name: '魔法镜', icon: '🪞', short: '客流提升', description: '持续30秒，最多3层，客流最高×2.5；提高高级客人权重。' },
    { id: 'donut', name: '甜甜圈', icon: '🍩', short: '自动出餐', description: '每个增加60秒自动出餐，最多预存180秒。' },
    { id: 'bomb', name: '炸弹', icon: '💣', short: '立即招揽', description: '招揽3+饭馆等级位客人；需至少3个空位，冷却20秒。' }
  ];
  const lottery = [{ id: 'red', weight: 23 }, { id: 'green', weight: 23 }, { id: 'blue', weight: 23 }, { id: 'fragments', weight: 12 }, { id: 'dish', weight: 8 }, { id: 'cash', weight: 11 }];
  const config = { levels, chefs, dishes, guests, gifts, lottery, eatingSeconds: 5, saveVersion: 1, saveKey: 'baiwei.restaurant.v1', seed: 20261014 };
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.BaiweiConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
