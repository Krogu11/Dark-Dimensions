/* ============================================================
   editor/editor-auth.js — Editor Admin Auth Guard
   ============================================================
   Uses CloudSave.editorLogin() which calls the Neon Data API
   RPC function editor_login() directly — no Neon Auth required,
   no CORS issues from static hosting.

   Default password: DarkDimensions
   Change via SQL: UPDATE public.editor_config
     SET value = crypt('newpass', gen_salt('bf', 12))
     WHERE key = 'admin_password_hash';

   - No DD_CLOUD_CONFIG / no dataApiUrl: bypass, local-mode note.
   - Config present: show password overlay.
   - Correct password: grant access.
   ============================================================ */

const EditorAuth = (() => {
  let _user = null;

  const _overlay   = () => document.getElementById('editor-auth-overlay');
  const _errorEl   = () => document.getElementById('auth-error');
  const _noteEl    = () => document.getElementById('auth-local-note');
  const _loginBtn  = () => document.getElementById('auth-login-btn');
  const _badge     = () => document.getElementById('editor-auth-user');
  const _logoutBtn = () => document.getElementById('btn-editor-logout');

  function _setError(msg) {
    const el = _errorEl(); if (el) el.textContent = msg || '';
  }

  function _setLoading(loading) {
    const btn = _loginBtn();
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Bitte warten…' : 'Anmelden';
  }

  function _grantAccess(user) {
    _user = user;
    const overlay = _overlay();
    if (overlay) overlay.classList.add('hidden');
    const badge = _badge();
    if (badge) { badge.textContent = 'Editor'; badge.style.display = 'inline'; }
    const btn = _logoutBtn();
    if (btn) btn.style.display = 'inline-block';
  }

  async function _init() {
    const cfg = window.DD_CLOUD_CONFIG;

    if (!cfg || !cfg.dataApiUrl) {
      const note = _noteEl();
      if (note) note.textContent = 'Lokaler Modus — kein Neon konfiguriert.';
      _grantAccess(null);
      return;
    }

    if (typeof CloudSave === 'undefined') {
      const note = _noteEl();
      if (note) note.textContent = 'CloudSave nicht geladen — lokaler Modus.';
      _grantAccess(null);
      return;
    }

    /* Enter key submits */
    const pwEl = document.getElementById('auth-password');
    if (pwEl) pwEl.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  }

  async function login() {
    _setError('');
    _setLoading(true);

    const password = (document.getElementById('auth-password')?.value || '').trim();
    if (!password) { _setError('Passwort erforderlich.'); _setLoading(false); return; }
    if (typeof CloudSave === 'undefined') { _setError('CloudSave nicht verfügbar.'); _setLoading(false); return; }

    const result = await CloudSave.editorLogin(password);
    if (result.error) {
      _setError(result.error);
      _setLoading(false);
      return;
    }

    _setLoading(false);
    _grantAccess(result.user);
  }

  async function logout() {
    _user = null;
    const badge = _badge(), btn = _logoutBtn();
    if (badge)  { badge.textContent = ''; badge.style.display = 'none'; }
    if (btn)    btn.style.display = 'none';
    const overlay = _overlay();
    if (overlay) overlay.classList.remove('hidden');
    _setError('');
    const pw = document.getElementById('auth-password');
    if (pw) pw.value = '';
  }

  function getUser() { return _user; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  return { login, logout, getUser };
})();
