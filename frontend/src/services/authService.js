// src/services/authService.js
const API_BASE_URL = import.meta.env.VITE_API_BASE || '';

/**
 * Logs in a user with email / password against POST /auth/login.
 * Stores tokens in localStorage on success.
 */
export async function loginUser(email, password) {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }), // backend accepts email (or username if you added it)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { success: false, message: data?.error || data?.message || 'Login failed' };
    }

    const access = data?.access_token || data?.token;
    const refresh = data?.refresh_token || null;

    if (!access) {
      return { success: false, message: 'No access token returned.' };
    }

    localStorage.setItem('accessToken', access);
    if (refresh) localStorage.setItem('refreshToken', refresh);

    return { success: true, access_token: access, refresh_token: refresh };
  } catch (e) {
    console.error('[authService] login error:', e);
    return { success: false, message: 'Network error. Please try again.' };
  }
}

/** Refresh access token via POST /auth/refresh (if your backend provides it). */
export async function refreshAccessToken() {
  const refresh = localStorage.getItem('refreshToken');
  if (!refresh) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refresh}` },
      credentials: 'include',
    });
    if (!res.ok) return null;

    const data = await res.json().catch(() => ({}));
    const access = data?.access_token || data?.token;
    if (!access) return null;

    localStorage.setItem('accessToken', access);
    return access;
  } catch {
    return null;
  }
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function isAuthenticated() {
  return !!localStorage.getItem('accessToken');
}
