/* ============================================================
   editor/cloud-editor.js — Cloud Draft Save + Publish (Neon)
   ============================================================
   CloudEditor.saveDraft()   → inserts versioned row into runtime_drafts
   CloudEditor.publish()     → marks latest draft as published=true
                               (game fetches via Data API public read)
   CloudEditor.loadLatestDraft() → returns most recent draft data

   Uses Neon Data API via CloudSave._dataFetch (shared JWT session).
   No-op when Neon is not configured.
   ============================================================ */

const CloudEditor = (() => {
  function _isConfigured() {
    const c = window.DD_CLOUD_CONFIG;
    return !!(c && c.dataApiUrl);
  }

  async function _dataFetch(path, options = {}) {
    const c     = window.DD_CLOUD_CONFIG;
    const token = typeof CloudSave !== 'undefined' ? CloudSave.getToken() : null;
    const { headers: optHeaders, ...rest } = options;
    const headers = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      ...(optHeaders || {}),
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(c.dataApiUrl + path, { ...rest, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Data API ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function _buildPayload() {
    if (typeof buildRuntimeConfigPayload !== 'function') {
      _toast('buildRuntimeConfigPayload nicht verfügbar.');
      return null;
    }
    if (typeof parseStoryEditorsIntoState === 'function') parseStoryEditorsIntoState();
    if (typeof saveConfig === 'function') saveConfig();
    return buildRuntimeConfigPayload();
  }

  function _toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.log('[CloudEditor]', msg);
  }

  function _userId() {
    if (typeof CloudSave === 'undefined') return null;
    const u = CloudSave.getUser();
    return u ? u.id : null;  /* editorLogin sets id = 'editor' */
  }

  /* ── Save Draft ── */

  async function saveDraft() {
    if (!_isConfigured()) { _toast('Kein Neon konfiguriert — nur lokal.'); return false; }
    const userId = _userId();
    if (!userId) { _toast('Nicht angemeldet — nur lokal.'); return false; }

    const payload = _buildPayload();
    if (!payload) return false;

    _toast('Speichere Entwurf…');
    try {
      await _dataFetch('/runtime_drafts', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id:    userId,
          label:      `Entwurf ${new Date().toLocaleString('de-DE')}`,
          data:       payload,
          published:  false,
          created_at: new Date().toISOString(),
        }),
      });
      _toast('Entwurf gespeichert ✓');
      return true;
    } catch (e) {
      _toast('Fehler: ' + e.message);
      return false;
    }
  }

  /* ── Publish (mark latest draft as published) ── */

  async function publish() {
    if (!_isConfigured()) { _toast('Kein Neon konfiguriert.'); return false; }
    const userId = _userId();
    if (!userId) { _toast('Nicht angemeldet.'); return false; }

    const payload = _buildPayload();
    if (!payload) return false;

    if (!confirm('Runtime-Config in die Cloud veröffentlichen?')) return false;

    _toast('Veröffentliche…');
    try {
      /* Insert as published draft */
      await _dataFetch('/runtime_drafts', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id:    userId,
          label:      `Veröffentlicht ${new Date().toLocaleString('de-DE')}`,
          data:       payload,
          published:  true,
          created_at: new Date().toISOString(),
        }),
      });
      _toast('Veröffentlicht ✓');
      return true;
    } catch (e) {
      _toast('Fehler: ' + e.message);
      return false;
    }
  }

  /* ── Load latest draft ── */

  async function loadLatestDraft() {
    if (!_isConfigured() || !_userId()) return null;
    try {
      const rows = await _dataFetch(
        '/runtime_drafts?order=created_at.desc&limit=1'
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (e) {
      return null;
    }
  }

  function isConfigured() { return _isConfigured(); }

  return { isConfigured, saveDraft, publish, loadLatestDraft };
})();
