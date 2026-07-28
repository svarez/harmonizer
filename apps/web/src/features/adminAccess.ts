export const ADMIN_TOKEN_STORAGE_KEY =
  'harmonizer-admin-token';

export function getAdminToken(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const token = window.localStorage
    .getItem(ADMIN_TOKEN_STORAGE_KEY)
    ?.trim();

  return token || undefined;
}

export function saveAdminToken(token: string): void {
  window.localStorage.setItem(
    ADMIN_TOKEN_STORAGE_KEY,
    token.trim(),
  );
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(
    ADMIN_TOKEN_STORAGE_KEY,
  );
}

export function hasAdminAccess(): boolean {
  return getAdminToken() !== undefined;
}

export function getAdminHeaders(): HeadersInit {
  const token = getAdminToken();

  return token
    ? {
        'X-Harmonizer-Admin-Token': token,
      }
    : {};
}
