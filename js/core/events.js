/* ============================================================
   core/events.js - lightweight global event bus
   ============================================================ */

const DD_EVENTS = (function createEventBus() {
  const listeners = new Map();

  function on(eventName, callback) {
    if (!eventName || typeof callback !== 'function') return () => {};
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(callback);
    return () => off(eventName, callback);
  }

  function off(eventName, callback) {
    const bucket = listeners.get(eventName);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) listeners.delete(eventName);
  }

  function emit(eventName, payload) {
    const bucket = listeners.get(eventName);
    if (!bucket || bucket.size === 0) return;
    [...bucket].forEach(callback => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[DD_EVENTS] Listener for "${eventName}" failed:`, error);
      }
    });
  }

  function once(eventName, callback) {
    if (typeof callback !== 'function') return () => {};
    const unsubscribe = on(eventName, payload => {
      unsubscribe();
      callback(payload);
    });
    return unsubscribe;
  }

  return { on, off, emit, once };
})();

function on(eventName, callback) {
  return DD_EVENTS.on(eventName, callback);
}

function off(eventName, callback) {
  return DD_EVENTS.off(eventName, callback);
}

function emit(eventName, payload) {
  DD_EVENTS.emit(eventName, payload);
}
