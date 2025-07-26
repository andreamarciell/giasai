
(function(){
  if(!window.chrome) window.chrome = {};
  if(!chrome.runtime) chrome.runtime = { getURL: p => p };
  if(!chrome.tabs) chrome.tabs = { create: ({url}) => window.open(url, '_blank') };
  if(!chrome.storage) chrome.storage = {
    local: {
      set: (obj, cb) => {
        for (const k in obj) localStorage.setItem(k, JSON.stringify(obj[k]));
        if (typeof cb === 'function') cb();
      },
      get: (keys, cb) => {
        let result = {};
        if (keys == null) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            result[key] = JSON.parse(localStorage.getItem(key));
          }
        } else if (typeof keys === 'string') {
          result[keys] = JSON.parse(localStorage.getItem(keys));
        } else if (Array.isArray(keys)) {
          keys.forEach(k => result[k] = JSON.parse(localStorage.getItem(k)));
        } else if (typeof keys === 'object') {
          for (const k in keys) {
            result[k] = JSON.parse(localStorage.getItem(k)) ?? keys[k];
          }
        }
        if (typeof cb === 'function') cb(result);
      },
      remove: (keys, cb) => {
        if (typeof keys === 'string') keys = [keys];
        (keys || []).forEach(k => localStorage.removeItem(k));
        if (typeof cb === 'function') cb();
      },
      clear: (cb) => {
        localStorage.clear();
        if (typeof cb === 'function') cb();
      }
    }
  };
})();