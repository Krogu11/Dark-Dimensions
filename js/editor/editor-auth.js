/* ============================================================
   editor/editor-auth.js — Editor Admin Auth Guard (Neon Auth)
   ============================================================
   Blocks editor access unless the user is logged in as admin.
   Uses Neon Auth (Better Auth API) via CloudSave.

   - No DD_CLOUD_CONFIG: bypass, show local-mode note.
   - Config present but no session: show login overlay.
   - Logged in but not admin: error + sign out.
   - Logged in as admin: hide overlay, show email in header.
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
    if (loading) { btn.textContent = 'Bitte warten…'; return; }
    btn.textContent = _isRegisterMode() ? 'Registrieren' : 'Anmelden';
  }

  function _grantAccess(user) {
    _user = user;
    const overlay = _overlay();
    if (overlay) overlay.classList.add('hidden');
    const badge = _badge();
    if (badge && user) { badge.textContent = user.email; badge.style.display = 'inline'; }
    const btn = _logoutBtn();
    if (btn) btn.style.display = 'inline-block';
  }

  function _denyAccess(reason) {
    _setError(reason || 'Zugriff verweigert.');
    _setLoading(false);
    if (typeof CloudSave !== 'undefined') CloudSave.logout().catch(() => {});
  }

  async function _init() {
    const cfg = window.DD_CLOUD_CONFIG;

    /* Local dev bypass — config absent or not filled in */
    if (!cfg || !cfg.authUrl) {
      const note = _noteEl();
      if (note) note.textContent = 'Lokaler Modus — kein Neon konfiguriert.';
      _grantAccess(null);
      return;
    }

    /* CloudSave must be loaded */
    if (typeof CloudSave === 'undefined') {
      const note = _noteEl();
      if (note) note.textContent = 'CloudSave nicht geladen — lokaler Modus.';
      _grantAccess(null);
      return;
    }

    /* Wait for session restore: auth:changed fires on success, timeout means no session */
    const user = await new Promise(resolve => {
      if (CloudSave.isLoggedIn()) { resolve(CloudSave.getUser()); return; }
      const t = setTimeout(() => { CloudSave.off('auth:changed', h); resolve(null); }, 1500);
      function h(p) { clearTimeout(t); CloudSave.off('auth:changed', h); resolve(p.user); }
      CloudSave.on('auth:changed', h);
    });
    if (user) {
      const admin = await CloudSave.isAdmin();
      if (admin) {
        _grantAccess(user);
      } else {
        _denyAccess('Kein Admin-Zugang für diesen Account.');
      }
      return;
    }

    /* Enter key submits */
    ['auth-email', 'auth-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') _isRegisterMode() ? register() : login(); });
    });
  }

  function _isRegisterMode() {
    return document.getElementById('auth-login-btn')?.dataset.mode === 'register';
  }

  function toggleRegister() {
    const btn     = _loginBtn();
    const toggle  = document.getElementById('auth-toggle-link');
    const heading = document.getElementById('auth-heading');
    if (!btn) return;
    const toRegister = btn.dataset.mode !== 'register';
    btn.dataset.mode  = toRegister ? 'register' : '';
    btn.textContent   = toRegister ? 'Registrieren' : 'Anmelden';
    btn.onclick       = toRegister ? register : login;
    if (toggle)  toggle.textContent = toRegister ? '← Zurück zum Login' : 'Noch kein Konto? Registrieren';
    if (heading) heading.textContent = toRegister ? 'KONTO ERSTELLEN' : 'DARK DIMENSIONS';
    _setError('');
  }

  async function _handleAuthResult(result) {
    if (result.error) {
      _setError(result.error);
      _setLoading(false);
      return;
    }
    let admin = await CloudSave.isAdmin();
    if (!admin) {
      const promoted = await CloudSave.bootstrapFirstAdmin(result.user.id);
      if (promoted) admin = true;
      else { _denyAccess('Kein Admin-Zugang für diesen Account.'); return; }
    }
    _setLoading(false);
    _grantAccess(result.user);
  }

  function _getCredentials() {
    const email    = (document.getElementById('auth-email')?.value    || '').trim();
    const password = (document.getElementById('auth-password')?.value || '').trim();
    return { email, password };
  }

  async function login() {
    _setError('');
    _setLoading(true);
    const { email, password } = _getCredentials();
    if (!email || !password) { _setError('E-Mail und Passwort erforderlich.'); _setLoading(false); return; }
    if (typeof CloudSave === 'undefined') { _setError('CloudSave nicht verfügbar.'); _setLoading(false); return; }
    await _handleAuthResult(await CloudSave.login(email, password));
  }

  async function register() {
    _setError('');
    _setLoading(true);
    const { email, password } = _getCredentials();
    if (!email || !password) { _setError('E-Mail und Passwort erforderlich.'); _setLoading(false); return; }
    if (typeof CloudSave === 'undefined') { _setError('CloudSave nicht verfügbar.'); _setLoading(false); return; }
    await _handleAuthResult(await CloudSave.register(email, password));
  }

  async function logout() {
    if (typeof CloudSave !== 'undefined') await CloudSave.logout();
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

  return { login, register, logout, toggleRegister, getUser };
})();
