/* ============================================================
   editor/editor-auth.js — Editor Admin Auth Guard
   ============================================================
   Blocks editor access unless the user is logged in as admin.

   Behavior by context:
   - No DD_CLOUD_CONFIG (local dev without Supabase): bypass, show local note.
   - DD_CLOUD_CONFIG present but user not logged in: show login overlay.
   - Logged in but not admin role: show error, force logout.
   - Logged in as admin: hide overlay, show user email in header.

   The overlay is shown by default in HTML; this script hides it
   as soon as access is confirmed so there is no flash.
   ============================================================ */

const EditorAuth = (() => {
  let _client = null;
  let _user   = null;

  const _overlay    = () => document.getElementById('editor-auth-overlay');
  const _errorEl    = () => document.getElementById('auth-error');
  const _noteEl     = () => document.getElementById('auth-local-note');
  const _loginBtn   = () => document.getElementById('auth-login-btn');
  const _userBadge  = () => document.getElementById('editor-auth-user');
  const _logoutBtn  = () => document.getElementById('btn-editor-logout');

  function _setError(msg) {
    const el = _errorEl();
    if (el) el.textContent = msg || '';
  }

  function _setLoading(loading) {
    const btn = _loginBtn();
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Bitte warten…' : 'Anmelden'; }
  }

  function _grantAccess(user) {
    _user = user;
    const overlay = _overlay();
    if (overlay) overlay.classList.add('hidden');

    const badge = _userBadge();
    if (badge && user) { badge.textContent = user.email; badge.style.display = 'inline'; }

    const logoutBtn = _logoutBtn();
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
  }

  function _denyAccess(reason) {
    _setError(reason || 'Zugriff verweigert.');
    _setLoading(false);
    if (_client) _client.auth.signOut().catch(() => {});
  }

  async function _checkAdminRole(client) {
    try {
      const { data, error } = await client
        .from('user_roles')
        .select('role')
        .maybeSingle();
      if (error || !data) return false;
      return data.role === 'admin';
    } catch (e) {
      return false;
    }
  }

  async function _init() {
    const cfg = window.DD_CLOUD_CONFIG;

    /* Local dev bypass — no Supabase config present */
    if (!cfg || !cfg.supabaseUrl || cfg.supabaseUrl.includes('YOUR_PROJECT_ID')) {
      const note = _noteEl();
      if (note) note.textContent = 'Lokaler Modus — kein Supabase konfiguriert.';
      _grantAccess(null);
      return;
    }

    /* Supabase not loaded (CDN failure) — bypass with warning */
    if (typeof window.supabase === 'undefined') {
      const note = _noteEl();
      if (note) note.textContent = 'Supabase CDN nicht geladen — lokaler Modus aktiv.';
      console.warn('[EditorAuth] Supabase CDN missing, bypassing auth.');
      _grantAccess(null);
      return;
    }

    _client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    /* Check for existing session */
    const { data: { session } } = await _client.auth.getSession();
    if (session?.user) {
      const isAdmin = await _checkAdminRole(_client);
      if (isAdmin) {
        _grantAccess(session.user);
      } else {
        _denyAccess('Kein Admin-Zugang. Bitte einen Administrator kontaktieren.');
      }
    }
    /* Else: overlay stays visible, user must log in */

    /* Enter key submits login form */
    ['auth-email', 'auth-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    });
  }

  async function login() {
    if (!_client) return;
    _setError('');
    _setLoading(true);

    const email    = (document.getElementById('auth-email')?.value    || '').trim();
    const password = (document.getElementById('auth-password')?.value || '').trim();

    if (!email || !password) {
      _setError('E-Mail und Passwort erforderlich.');
      _setLoading(false);
      return;
    }

    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      _setError(error?.message || 'Anmeldung fehlgeschlagen.');
      _setLoading(false);
      return;
    }

    const isAdmin = await _checkAdminRole(_client);
    if (!isAdmin) {
      _denyAccess('Kein Admin-Zugang für diesen Account.');
      return;
    }

    _setLoading(false);
    _grantAccess(data.user);
  }

  async function logout() {
    if (_client) await _client.auth.signOut().catch(() => {});
    _user = null;

    const badge     = _userBadge();
    const logoutBtn = _logoutBtn();
    if (badge)     { badge.textContent = ''; badge.style.display = 'none'; }
    if (logoutBtn) logoutBtn.style.display = 'none';

    /* Show overlay again */
    const overlay = _overlay();
    if (overlay) overlay.classList.remove('hidden');
    _setError('');

    const pwEl = document.getElementById('auth-password');
    if (pwEl) pwEl.value = '';
  }

  function getUser() { return _user; }

  /* Run on DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  return { login, logout, getUser };
})();
