/* ============================================================
   core/cloud-save.js — Supabase Cloud Save Layer
   ============================================================
   Wraps the existing localStorage save system with optional
   cloud sync via Supabase. All cloud ops are async and fail
   silently — guest/offline play is unaffected.

   Setup:
     1. Create a Supabase project at https://supabase.com
     2. Copy your project URL and anon key into cloud-config.js
     3. Add the Supabase CDN script to index.html before this file
     4. Run the SQL in docs/cloud-architecture.md to create the table

   Cloud config is read from window.DD_CLOUD_CONFIG:
     { supabaseUrl: '...', supabaseAnonKey: '...' }
   ============================================================ */

const CloudSave = (() => {
  /* ── Internal state ── */
  let _client  = null;
  let _session = null;
  let _ready   = false;

  /* ── Init: call once after Supabase CDN is loaded ── */
  function init() {
    const cfg = window.DD_CLOUD_CONFIG;
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    if (typeof window.supabase === 'undefined') return;

    try {
      _client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      _client.auth.onAuthStateChange((event, session) => {
        _session = session;
        _emit('auth:changed', { event, user: session?.user ?? null });
        if (session) _syncAllFromCloud().catch(() => {});
      });
      _client.auth.getSession().then(({ data }) => {
        _session = data?.session ?? null;
        _ready   = true;
        _emit('ready', { user: _session?.user ?? null });
      });
    } catch (e) {
      console.warn('[CloudSave] Init failed:', e);
    }
  }

  /* ── Auth ── */

  async function login(email, password) {
    if (!_client) return { error: 'Cloud save not configured' };
    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { user: data.user };
  }

  async function logout() {
    if (!_client) return;
    await _client.auth.signOut();
    _session = null;
    _emit('auth:changed', { event: 'SIGNED_OUT', user: null });
  }

  function getUser() {
    return _session?.user ?? null;
  }

  function isLoggedIn() {
    return !!_session;
  }

  /* ── Cloud slot operations ── */

  async function loadSlotFromCloud(slotIndex) {
    if (!_client || !_session) return null;
    try {
      const { data, error } = await _client
        .from('save_slots')
        .select('data, updated_at')
        .eq('slot_index', slotIndex)
        .maybeSingle();

      if (error) { console.warn('[CloudSave] Load error:', error.message); return null; }
      return data ? { slotData: data.data, updatedAt: data.updated_at } : null;
    } catch (e) {
      console.warn('[CloudSave] Load failed:', e);
      return null;
    }
  }

  async function pushSlotToCloud(slotIndex, slotData) {
    if (!_client || !_session) return false;
    try {
      const userId = _session.user.id;
      const { error } = await _client
        .from('save_slots')
        .upsert(
          { user_id: userId, slot_index: slotIndex, data: slotData, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,slot_index' }
        );

      if (error) { console.warn('[CloudSave] Push error:', error.message); return false; }
      return true;
    } catch (e) {
      console.warn('[CloudSave] Push failed:', e);
      return false;
    }
  }

  async function deleteSlotFromCloud(slotIndex) {
    if (!_client || !_session) return;
    try {
      await _client
        .from('save_slots')
        .delete()
        .eq('slot_index', slotIndex);
    } catch (e) {
      console.warn('[CloudSave] Delete failed:', e);
    }
  }

  /* ── Sync: merge cloud + local (cloud wins if newer) ── */

  async function syncSlot(slotIndex) {
    if (!_client || !_session) return;

    const cloud = await loadSlotFromCloud(slotIndex);
    if (!cloud) {
      /* No cloud save — push local if it exists */
      const localRaw = localStorage.getItem(`dd_save_v2_slot${slotIndex}`);
      if (localRaw) {
        const localData = JSON.parse(localRaw);
        await pushSlotToCloud(slotIndex, localData);
      }
      return;
    }

    const localRaw = localStorage.getItem(`dd_save_v2_slot${slotIndex}`);
    const cloudTs  = new Date(cloud.updatedAt).getTime();

    if (!localRaw) {
      /* Local empty — write cloud data to localStorage */
      localStorage.setItem(`dd_save_v2_slot${slotIndex}`, JSON.stringify(cloud.slotData));
      return;
    }

    const localData = JSON.parse(localRaw);
    const localTs   = localData.timestamp ?? 0;

    if (cloudTs > localTs) {
      /* Cloud is newer — overwrite local */
      localStorage.setItem(`dd_save_v2_slot${slotIndex}`, JSON.stringify(cloud.slotData));
    } else if (localTs > cloudTs) {
      /* Local is newer — push to cloud */
      await pushSlotToCloud(slotIndex, localData);
    }
    /* Equal timestamps — no action needed */
  }

  async function _syncAllFromCloud() {
    for (let i = 1; i <= 3; i++) {
      await syncSlot(i);
    }
    _emit('sync:done', {});
  }

  /* ── Hook into existing save system ── */

  /* Call after saveCurrentSlot() to also push to cloud. */
  function afterSave(slotIndex, slotData) {
    if (!_client || !_session) return;
    pushSlotToCloud(slotIndex, slotData).catch(() => {});
  }

  /* Call after deleteSlot() to also remove from cloud. */
  function afterDelete(slotIndex) {
    if (!_client || !_session) return;
    deleteSlotFromCloud(slotIndex).catch(() => {});
  }

  /* ── Minimal event emitter ── */

  const _listeners = {};

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (_listeners[event]) {
      _listeners[event] = _listeners[event].filter(fn => fn !== cb);
    }
  }

  function _emit(event, payload) {
    (_listeners[event] || []).forEach(fn => { try { fn(payload); } catch (e) {} });
  }

  /* ── Public API ── */

  return {
    init,
    login,
    logout,
    getUser,
    isLoggedIn,
    syncSlot,
    syncAll: _syncAllFromCloud,
    afterSave,
    afterDelete,
    on,
    off,
  };
})();
