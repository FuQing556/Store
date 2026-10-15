(function (root) {
  'use strict';
  // Keep an unreadable save intact so exporting a backup never exports a new empty game.
  function read(storage, key, version) {
    let raw = null;
    try { raw = storage.getItem(key); }
    catch { return { save: null, raw, invalid: false, unavailable: true }; }
    if (raw === null) return { save: null, raw, invalid: false, unavailable: false };
    try {
      const save = JSON.parse(raw);
      if (!save || Array.isArray(save) || save.version !== version ||
          !Number.isInteger(save.level) || !Number.isInteger(save.chef) ||
          !Array.isArray(save.unlocked) || !Array.isArray(save.menu)) throw new Error('Invalid save');
      return { save, raw, invalid: false, unavailable: false };
    } catch { return { save: null, raw, invalid: true, unavailable: false }; }
  }
  const api = { read };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BaiweiStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
