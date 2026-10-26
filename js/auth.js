/**
 * FinTrack Pro — Layanan Autentikasi, Manajemen Akun & Enkripsi Password (PBKDF2)
 */

import { USERS_KEY, SESSION_KEY, createBlankState, createSampleState } from './config.js';
import { saveUserState, deleteUserStorage } from './storage.js';

const bytesToHex = (b) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const hexToBytes = (h) => Uint8Array.from(h.match(/.{2}/g), x => parseInt(x, 16));

function randomHex(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}

// Algoritma hash fallback jika Web Crypto Subtle tidak aktif
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// PBKDF2 Password Hash (150,000 iterasi SHA-256)
export async function hashPassword(password, saltHex, scheme) {
  const hasSubtle = !!(window.crypto && crypto.subtle);
  scheme = scheme || (hasSubtle ? 'p2' : 'f1');

  if (scheme === 'p2') {
    if (!hasSubtle) throw new Error('WebCrypto API tidak didukung pada browser ini.');
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 150000, hash: 'SHA-256' },
      keyMat,
      256
    );
    return 'p2:' + bytesToHex(new Uint8Array(bits));
  }

  // Fallback
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += cyrb53(saltHex + i + password, i).toString(16).padStart(14, '0');
  }
  return 'f1:' + out;
}

export function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function writeUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Gagal menulis data pengguna:', e);
  }
}

// Registrasi Akun Baru
export async function registerUser({ name, email, password, withSample = false }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim().replace(/\s+/g, ' ');

  const users = readUsers();
  if (users[cleanEmail]) {
    throw new Error('Alamat email ini sudah terdaftar. Silakan masuk.');
  }

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  const user = {
    id: 'u_' + randomHex(8),
    name: cleanName,
    email: cleanEmail,
    salt,
    hash,
    createdAt: new Date().toISOString()
  };

  users[cleanEmail] = user;
  writeUsers(users);

  // Inisialisasi database terpisah untuk user ini
  // Akun baru dibuat BERSIH (Rp 0), kecuali secara eksplisit pengguna memilih data simulasi
  const initialData = withSample ? createSampleState() : createBlankState();
  saveUserState(user.id, initialData);

  return user;
}

// Rate limiter brute-force
const authLock = { count: 0, until: 0 };

// Login Akun
export async function loginUser({ email, password, remember = true }) {
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();

  if (authLock.until > now) {
    const sisa = Math.ceil((authLock.until - now) / 1000);
    throw new Error(`Terlalu banyak percobaan gagal. Silakan tunggu ${sisa} detik lagi.`);
  }

  const users = readUsers();
  const user = users[cleanEmail];

  let isValid = false;
  if (user) {
    const scheme = String(user.hash).split(':')[0];
    const computedHash = await hashPassword(password, user.salt, scheme);
    isValid = (computedHash === user.hash);
  } else {
    // Jalankan hashing tiruan untuk menyamakan timing resistensi side-channel
    await hashPassword(password, randomHex(16));
  }

  if (!isValid) {
    authLock.count++;
    if (authLock.count >= 5) {
      authLock.until = Date.now() + 30000;
      authLock.count = 0;
    }
    throw new Error('Email atau password yang Anda masukkan salah.');
  }

  authLock.count = 0;
  persistSession(user, remember);
  return user;
}

export function persistSession(user, remember = true) {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify({ id: user.id, email: user.email }));
  } catch (e) {
    console.warn('Gagal menyimpan sesi:', e);
  }
}

export function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    const users = readUsers();
    const user = users[session.email];
    if (user && user.id === session.id) {
      return user;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

export async function changeUserPassword(userId, oldPassword, newPassword) {
  const users = readUsers();
  const userEntry = Object.values(users).find(u => u.id === userId);

  if (!userEntry) {
    throw new Error('Pengguna tidak ditemukan.');
  }

  const scheme = String(userEntry.hash).split(':')[0];
  const oldHash = await hashPassword(oldPassword, userEntry.salt, scheme);
  if (oldHash !== userEntry.hash) {
    throw new Error('Password saat ini yang Anda masukkan salah.');
  }

  userEntry.salt = randomHex(16);
  userEntry.hash = await hashPassword(newPassword, userEntry.salt);
  users[userEntry.email] = userEntry;
  writeUsers(users);

  return userEntry;
}

export function deleteUserAccount(userId) {
  const users = readUsers();
  const userEntry = Object.values(users).find(u => u.id === userId);

  if (userEntry) {
    delete users[userEntry.email];
    writeUsers(users);
  }

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
