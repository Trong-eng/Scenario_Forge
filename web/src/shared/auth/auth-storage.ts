const TOKEN_KEY = 'sf_token';
const USER_KEY = 'sf_user';

/** The session is an HttpOnly cookie set by the API, so it is deliberately not
 *  readable here. This module only clears what earlier builds may have left in
 *  the browser; nothing writes a credential any more. */
export function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}
