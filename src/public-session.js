import './public-session.css';

// Session controls are shared by the public home and individual news pages.
// Stored profile data is presentation only; the API remains the authority.
export function mountPublicSession(header = document.querySelector('.home-public-header')) {
  const authToken = localStorage.getItem('auth_token');
  if (!header || !authToken || header.querySelector('#home-logout-button')) return;

  const actions = document.createElement('div');
  actions.className = 'home-header-actions';
  // La navegación ya trae su propia pestaña "Dashboard" (module-tab
  // is-current); no duplicarla aquí con un enlace aparte.
  const navigation = header.querySelector('#module-switcher, .portal-header-navigation');
  if (navigation) actions.append(navigation);
  const account = document.createElement('div');
  account.className = 'home-session-controls';
  const identity = document.createElement('span');
  identity.className = 'home-session-name';
  let name = '';
  try { name = JSON.parse(localStorage.getItem('auth_profile') || '{}')?.full_name || ''; } catch { /* perfil local no disponible */ }
  identity.textContent = name || 'Tu cuenta';
  identity.title = name || 'Tu cuenta';
  const button = document.createElement('button');
  button.id = 'home-logout-button';
  button.className = 'home-logout-button';
  button.type = 'button';
  button.textContent = 'Cerrar sesión';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Cerrando…';
    button.setAttribute('aria-busy', 'true');
    // Always end the local session, including when the API is unavailable.
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_profile');
    if ('clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* La sesión local ya está cerrada. */ }
    window.location.replace('/');
  });
  account.append(identity, button);
  actions.append(account);
  header.append(actions);
}
