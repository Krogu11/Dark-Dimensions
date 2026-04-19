/* ============================================================
   editor/cloud-editor.js — Cloud Draft Save + Publish (KRO-12 Phase 4)
   ============================================================
   Adds two cloud-backed editor actions:

   CloudEditor.saveDraft()
     Saves the current runtime config payload to a `runtime_drafts`
     table in Supabase, versioned by timestamp. Works like an
     autosave slot for editor state.

   CloudEditor.publish()
     Uploads the current payload to Supabase Storage as
     `runtime-config.json`. The game can then optionally fetch
     from that URL instead of (or in addition to) GitHub Pages.

   Both operations are no-ops when Supabase is not configured
   so local-only editing is completely unaffected.

   Depends on: EditorAuth (for session), window.DD_CLOUD_CONFIG
   ============================================================ */

const CloudEditor = (() => {
  const STORAGE_BUCKET = 'runtime-configs';
  const STORAGE_PATH   = 'runtime-config.json';

  function _client() {
    const cfg = window.DD_CLOUD_CONFIG;
    if (!cfg || cfg.supabaseUrl.includes('YOUR_PROJECT_ID')) return null;
    if (typeof window.supabase === 'undefined') return null;
    /* Reuse single client instance */
    if (!CloudEditor._supabase) {
      CloudEditor._supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
    return CloudEditor._supabase;
  }

  function _isConfigured() { return !!_client(); }

  /* ── Draft save ── */

  async function saveDraft() {
    const client = _client();
    if (!client) {
      _showStatus('Kein Supabase konfiguriert — Entwurf nur lokal.', 'warn');
      return false;
    }

    const user = typeof EditorAuth !== 'undefined' ? EditorAuth.getUser() : null;
    if (!user) {
      _showStatus('Nicht angemeldet — Entwurf nur lokal.', 'warn');
      return false;
    }

    const payload = _buildPayload();
    if (!payload) return false;

    _showStatus('Speichere Entwurf…', 'info');

    try {
      const { error } = await client
        .from('runtime_drafts')
        .insert({
          user_id:   user.id,
          label:     `Entwurf ${new Date().toLocaleString('de-DE')}`,
          data:      payload,
          created_at: new Date().toISOString(),
        });

      if (error) { _showStatus('Fehler: ' + error.message, 'error'); return false; }
      _showStatus('Entwurf gespeichert ✓', 'success');
      return true;
    } catch (e) {
      _showStatus('Fehler: ' + e.message, 'error');
      return false;
    }
  }

  /* ── Publish to Supabase Storage ── */

  async function publish() {
    const client = _client();
    if (!client) {
      _showStatus('Kein Supabase konfiguriert.', 'warn');
      return false;
    }

    const user = typeof EditorAuth !== 'undefined' ? EditorAuth.getUser() : null;
    if (!user) {
      _showStatus('Nicht angemeldet.', 'warn');
      return false;
    }

    const payload = _buildPayload();
    if (!payload) return false;

    if (!confirm('Runtime-Config in die Cloud veröffentlichen? Die Spieler können die neue Version abrufen.')) return false;

    _showStatus('Veröffentliche…', 'info');

    try {
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      const { error } = await client.storage
        .from(STORAGE_BUCKET)
        .upload(STORAGE_PATH, blob, { upsert: true, contentType: 'application/json' });

      if (error) { _showStatus('Upload-Fehler: ' + error.message, 'error'); return false; }

      /* Record publish in draft table for audit trail */
      await client.from('runtime_drafts').insert({
        user_id:    user.id,
        label:      `Veröffentlicht ${new Date().toLocaleString('de-DE')}`,
        data:       payload,
        published:  true,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      const url = _getPublicUrl(client);
      _showStatus('Veröffentlicht ✓' + (url ? ' → ' + url : ''), 'success');
      return true;
    } catch (e) {
      _showStatus('Fehler: ' + e.message, 'error');
      return false;
    }
  }

  /* ── Load latest draft from cloud ── */

  async function loadLatestDraft() {
    const client = _client();
    if (!client) return null;

    const user = typeof EditorAuth !== 'undefined' ? EditorAuth.getUser() : null;
    if (!user) return null;

    try {
      const { data, error } = await client
        .from('runtime_drafts')
        .select('data, label, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  /* ── Helpers ── */

  function _buildPayload() {
    if (typeof buildRuntimeConfigPayload !== 'function') {
      _showStatus('buildRuntimeConfigPayload nicht verfügbar.', 'error');
      return null;
    }
    if (typeof parseStoryEditorsIntoState === 'function') parseStoryEditorsIntoState();
    if (typeof saveConfig === 'function') saveConfig();
    return buildRuntimeConfigPayload();
  }

  function _getPublicUrl(client) {
    try {
      const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(STORAGE_PATH);
      return data?.publicUrl ?? null;
    } catch (e) { return null; }
  }

  /* Reuse editor's showToast if available, else console */
  function _showStatus(msg, level) {
    if (typeof showToast === 'function') {
      showToast(msg);
    } else {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[CloudEditor]', msg);
    }
  }

  return {
    isConfigured: _isConfigured,
    saveDraft,
    publish,
    loadLatestDraft,
  };
})();
