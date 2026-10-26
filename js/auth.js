/**
 * FinTrack Pro — Layanan Autentikasi Pengguna PostgreSQL
 * Otentikasi terpusat ke database PostgreSQL (Bisa dibuka di Chrome Laptop & HP mana saja)
 */

import { SESSION_KEY, createBlankState, createSampleState } from './config.js';
import { saveUserState, deleteUserStorage } from './storage.js';
import {
  apiRegister,
  apiLogin,
  apiGetMe,
  apiChangePassword,
  apiDeleteAccount,
  clearAuthToken,
  getAuthToken,
  apiSaveState
} from './api.js';

// Registrasi Akun Baru ke PostgreSQL
export async function registerUser({ name, email, password, withSample = false }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim().replace(/\s+/g, ' ');

  // Registrasi via PostgreSQL API
  const user = await apiRegister({ name: cleanName, email: cleanEmail, password });

  // Inisialisasi data
  const initialData = withSample ? createSampleState() : createBlankState();
  if (withSample) {
    try {
      await apiSaveState(initialData);
    } catch (e) {}
  }

  saveUserState(user.id, initialData);
  persistSession(user, true);

  return user;
}

// Login Akun via PostgreSQL
export async function loginUser({ email, password, remember = true }) {
  const cleanEmail = email.trim().toLowerCase();
  const user = await apiLogin({ email: cleanEmail, password, remember });
  persistSession(user, remember);
  return user;
}

export function persistSession(user, remember = true) {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      source: 'postgresql'
    }));
  } catch (e) {
    console.warn('Gagal menyimpan sesi:', e);
  }
}

export function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    const token = getAuthToken();
    if (!raw || !token) return null;
    const session = JSON.parse(raw);
    if (!session || !session.id || !session.email) return null;
    return session;
  } catch (e) {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    clearAuthToken();
  } catch (e) {}
}

export async function logoutUser() {
  clearSession();
}

export async function changeUserPassword(userId, oldPassword, newPassword) {
  await apiChangePassword(oldPassword, newPassword);
}

export async function deleteUserAccount(userId) {
  await apiDeleteAccount();
  deleteUserStorage(userId);
  clearSession();
}

export function evaluatePasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (!password) return { level: 0, label: '' };
  if (password.length < 8) return { level: 1, label: 'Lemah' };

  const level = Math.min(4, Math.max(1, score - 1 || 1));
  const labels = ['', 'Lemah', 'Cukup', 'Baik', 'Kuat'];
  return { level, label: labels[level] };
}
