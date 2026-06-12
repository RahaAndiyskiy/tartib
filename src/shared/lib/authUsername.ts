const AUTH_DOMAIN = 'auth.tartib.local';

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_DOMAIN}`;
}
