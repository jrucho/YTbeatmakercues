// Safari polyfill to expose Chrome-style APIs and ensure MIDI support
(function() {
  if (typeof window.chrome === 'undefined' && typeof window.browser !== 'undefined') {
    window.chrome = {
      ...window.browser,
      storage: {
        local: {
          get: (keys, cb) => {
            const p = window.browser.storage.local.get(keys);
            if (cb) p.then(cb);
            return p;
          },
          set: (items, cb) => {
            const p = window.browser.storage.local.set(items);
            if (cb) p.then(cb);
            return p;
          },
          remove: (keys, cb) => {
            const p = window.browser.storage.local.remove(keys);
            if (cb) p.then(cb);
            return p;
          }
        }
      },
      runtime: {
        ...window.browser.runtime,
        getURL: window.browser.runtime.getURL.bind(window.browser.runtime),
        get lastError() {
          return window.browser.runtime.lastError;
        }
      },
      dispatchEvent: window.dispatchEvent.bind(window)
    };
  }
  if (!navigator.requestMIDIAccess && navigator.webkitRequestMIDIAccess) {
    navigator.requestMIDIAccess = navigator.webkitRequestMIDIAccess.bind(navigator);
  }
})();
