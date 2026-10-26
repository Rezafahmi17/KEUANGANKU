/**
 * FinTrack Pro — Klien API RESTful PostgreSQL
 * Mengelola komunikasi frontend dengan server PostgreSQL
 */

const TOKEN_KEY = 'FINTRACK_AUTH_TOKEN_V1';

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function setAuthToken(token, remember = true) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
  } catch (e) {}
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || `Permintaan gagal (status ${res.status})`);
  }

  return data;
}

// 1. Registrasi Akun ke PostgreSQL
export async function apiRegister({ name, email, password }) {
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
  if (res.token) setAuthToken(res.token, true);
  return res.user;
}

// 2. Login Akun via PostgreSQL
export async function apiLogin({ email, password, remember = true }) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (res.token) setAuthToken(res.token, remember);
  return res.user;
}

// 3. Ambil Profil Sesi Pengguna
export async function apiGetMe() {
  const res = await request('/api/auth/me', { method: 'GET' });
  return res.user;
}

// 4. Ubah Password Pengguna
export async function apiChangePassword(oldPassword, newPassword) {
  return await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword })
  });
}

// 5. Hapus Akun Pengguna
export async function apiDeleteAccount() {
  const res = await request('/api/auth/account', { method: 'DELETE' });
  clearAuthToken();
  return res;
}

// 6. Ambil Data Keuangan Pengguna dari PostgreSQL
export async function apiGetState() {
  const res = await request('/api/state', { method: 'GET' });
  return res.data;
}

// 7. Simpan Data Keuangan Pengguna ke PostgreSQL
export async function apiSaveState(state) {
  return await request('/api/state', {
    method: 'PUT',
    body: JSON.stringify(state)
  });
}
