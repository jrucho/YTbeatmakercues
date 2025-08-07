// Simple stubs for Chrome extension APIs so content.js can run in a normal web page
if (typeof window.chrome === 'undefined') {
  window.chrome = {};
}

if (!chrome.runtime) {
  chrome.runtime = {};
}

if (!chrome.runtime.getURL) {
  /**
   * Mirror chrome.runtime.getURL by resolving relative to the repo root.
   * Our web app lives in /webapp so strip leading slashes and prefix one level up.
   */
  chrome.runtime.getURL = (path) => '../' + String(path).replace(/^\/+/, '');
}

if (!chrome.runtime.lastError) {
  chrome.runtime.lastError = null;
}

// very lightweight message bus so sendMessage/onMessage work
if (!chrome.runtime.onMessage) {
  const listeners = [];
  chrome.runtime.onMessage = {
    addListener: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    }
  };
  chrome.runtime.sendMessage = (msg, cb) => {
    let resp;
    listeners.forEach(fn => {
      const r = fn(msg, {}, () => {});
      if (r !== undefined) resp = r;
    });
    cb && cb(resp);
  };
}

if (!chrome.storage) {
  chrome.storage = {};
}

if (!chrome.storage.local) {
  chrome.storage.local = {
    get: (keys, cb) => {
      let result = {};
      if (Array.isArray(keys)) {
        keys.forEach(k => {
          const v = localStorage.getItem(k);
          if (v !== null) result[k] = JSON.parse(v);
        });
      } else if (typeof keys === 'string') {
        const v = localStorage.getItem(keys);
        if (v !== null) result[keys] = JSON.parse(v);
      } else if (keys && typeof keys === 'object') {
        Object.keys(keys).forEach(k => {
          const v = localStorage.getItem(k);
          result[k] = v !== null ? JSON.parse(v) : keys[k];
        });
      }
      cb && cb(result);
    },
    set: (obj, cb) => {
      Object.keys(obj).forEach(k => localStorage.setItem(k, JSON.stringify(obj[k])));
      cb && cb();
    },
    remove: (keys, cb) => {
      (Array.isArray(keys) ? keys : [keys]).forEach(k => localStorage.removeItem(k));
      cb && cb();
    }
  };
}

// Treat storage.sync as an alias of storage.local so data persists in the demo
if (!chrome.storage.sync) {
  chrome.storage.sync = chrome.storage.local;
}
