/* ============================================================
   core/cloud-save.js — Neon Cloud Save Layer
   ============================================================
   Syncs save slots to Neon Postgres via:
     - Neon Auth (Better Auth API) for user sessions
     - Neon Data API (PostgREST-style) for slot CRUD with RLS

   All cloud ops are async and fail silently — guest/offline
   play is completely unaffected.

   Config is read from window.DD_CLOUD_CONFIG:
     { authUrl: '...', dataApiUrl: '...' }
   ============================================================ */

const CloudSave = (() => {
  let _token   = null;  // JWT from Neon Auth
  let _user    = null;  // { id, email }
  let _ready   = false;

  /* ── Config guards ── */

  function _cfg() { return window.DD_CLOUD_CONFIG || null; }

  function _isConfigured() {
    const c = _cfg();
    return !!(c && c.authUrl && c.dataApiUrl);
  }

  /* ── Auth helpers ── */

  async function _authFetch(path, options = {}) {
    const c = _cfg();
    const { headers: optHeaders, ...rest } = options;
    const res = await fetch(c.authUrl + path, {
      credentials: 'include',
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(optHeaders || {}) },
    });
    return res;
  }

  async function _dataFetch(path, options = {}) {
    const c = _cfg();
    const { headers: optHeaders, ...rest } = options;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(optHeaders || {}),
    };
    if (_token) headers['Authorization'] = 'Bearer ' + _token;
    const res = await fetch(c.dataApiUrl + path, { ...rest, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Data API ${res.status}: ${text}`);
    }
    /* DELETE and some upserts return 204 No Content */
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ── Init ── */

  function init() {
    if (!_isConfigured()) return;
    _restoreSession().catch(() => {});
  }

  async function _restoreSession() {
    try {
      const res = await _authFetch('/api/auth/get-session');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.user) {
        _user  = { id: data.user.id, email: data.user.email };
        _token = data.session?.token ?? null;
        _ready = true;
        _emit('auth:changed', { user: _user });
        _syncAllFromCloud().catch(() => {});
      }
    } catch (e) {
      // Offline or not configured — silent
    }
  }

  /* ── Auth ── */

  async function login(email, password) {
    if (!_isConfigured()) return { error: 'Cloud save not configured' };
    try {
      const res = await _authFetch('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data?.user) return { error: data?.message || 'Login fehlgeschlagen' };
      _user  = { id: data.user.id, email: data.user.email };
      _token = data.token ?? data.session?.token ?? null;
      _ready = true;
      _emit('auth:changed', { user: _user });
      _syncAllFromCloud().catch(() => {});
      return { user: _user };
    } catch (e) {
      return { error: e.message };
    }
  }

  async function logout() {
    if (!_isConfigured()) return;
    try { await _authFetch('/api/auth/sign-out', { method: 'POST' }); } catch (e) {}
    _user  = null;
    _token = null;
    _ready = false;
    _emit('auth:changed', { user: null });
  }

  function getUser()    { return _user; }
  function isLoggedIn() { return !!_user; }

  /* ── Slot CRUD via Data API ── */

  async function loadSlotFromCloud(slotIndex) {
    if (!_isConfigured() || !_user) return null;
    try {
      const rows = await _dataFetch(
        `/save_slots?user_id=eq.${_user.id}&slot_index=eq.${slotIndex}&limit=1`
      );
      if (!rows || rows.length === 0) return null;
      return { slotData: rows[0].data, updatedAt: rows[0].updated_at };
    } catch (e) {
      console.warn('[CloudSave] Load error:', e.message);
      return null;
    }
  }

  async function pushSlotToCloud(slotIndex, slotData) {
    if (!_isConfigured() || !_user) return false;
    try {
      await _dataFetch('/save_slots', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          user_id:    _user.id,
          slot_index: slotIndex,
          data:       slotData,
          updated_at: new Date().toISOString(),
        }),
      });
      return true;
    } catch (e) {
      console.warn('[CloudSave] Push error:', e.message);
      return false;
    }
  }

  async function deleteSlotFromCloud(slotIndex) {
    if (!_isConfigured() || !_user) return;
    try {
      await _dataFetch(
        `/save_slots?user_id=eq.${_user.id}&slot_index=eq.${slotIndex}`,
        { method: 'DELETE' }
      );
    } catch (e) {
      console.warn('[CloudSave] Delete error:', e.message);
    }
  }

  /* ── Sync: cloud wins if newer ── */

  async function syncSlot(slotIndex) {
    if (!_isConfigured() || !_user) return;

    const cloud    = await loadSlotFromCloud(slotIndex);
    const localRaw = localStorage.getItem(`dd_save_v2_slot${slotIndex}`);

    if (!cloud) {
      if (localRaw) await pushSlotToCloud(slotIndex, JSON.parse(localRaw));
      return;
    }

    const cloudTs = new Date(cloud.updatedAt).getTime();

    if (!localRaw) {
      localStorage.setItem(`dd_save_v2_slot${slotIndex}`, JSON.stringify(cloud.slotData));
      return;
    }

    const localData = JSON.parse(localRaw);
    const localTs   = localData.timestamp ?? 0;

    if (cloudTs > localTs) {
      localStorage.setItem(`dd_save_v2_slot${slotIndex}`, JSON.stringify(cloud.slotData));
    } else if (localTs > cloudTs) {
      await pushSlotToCloud(slotIndex, localData);
    }
  }

  async function _syncAllFromCloud() {
    for (let i = 1; i <= 3; i++) await syncSlot(i);
    _emit('sync:done', {});
  }

  /* ── Hooks called by savesystem.js ── */

  function afterSave(slotIndex, slotData) {
    if (!_isConfigured() || !_user) return;
    pushSlotToCloud(slotIndex, slotData).catch(() => {});
  }

  function afterDelete(slotIndex) {
    if (!_isConfigured() || !_user) return;
    deleteSlotFromCloud(slotIndex).catch(() => {});
  }

  /* ── Admin role check (used by editor-auth.js) ── */

  async function isAdmin() {
    if (!_isConfigured() || !_user) return false;
    try {
      const rows = await _dataFetch(`/user_roles?user_id=eq.${_user.id}&limit=1`);
      return rows && rows.length > 0 && rows[0].role === 'admin';
    } catch (e) {
      return false;
    }
  }

  /* First-run: promote caller to admin only if no admin exists yet. */
  async function bootstrapFirstAdmin(userId) {
    if (!_isConfigured() || !_user) return false;
    try {
      const rows = await _dataFetch('/rpc/bootstrap_first_admin', {
        method: 'POST',
        body: JSON.stringify({ target_user_id: userId }),
      });
      return rows === true || rows === 'true';
    } catch (e) {
      console.warn('[CloudSave] Bootstrap failed:', e.message);
      return false;
    }
  }

  /* ── Minimal event emitter ── */

  const _listeners = {};

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (_listeners[event])
      _listeners[event] = _listeners[event].filter(fn => fn !== cb);
  }

  function _emit(event, payload) {
    (_listeners[event] || []).forEach(fn => { try { fn(payload); } catch (e) {} });
  }

  function getToken() { return _token; }

  return {
    init,
    login,
    logout,
    getUser,
    getToken,
    isLoggedIn,
    isAdmin,
    bootstrapFirstAdmin,
    syncSlot,
    syncAll: _syncAllFromCloud,
    afterSave,
    afterDelete,
    on,
    off,
  };
})();
