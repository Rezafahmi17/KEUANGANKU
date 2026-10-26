/**
 * FinTrack Pro — Layer Database & Penyimpanan Terisolasi Multi-User
 * Setiap akun memiliki database lokal sendiri yang terpisah secara independen.
 */

import { STORAGE_PREFIX, createBlankState, getRelativeDateStr } from './config.js';

export function getUserStorageKey(userId) {
  if (!userId) return null;
  return `${STORAGE_PREFIX}_${userId}`;
}

export function loadUserState(userId) {
  const key = getUserStorageKey(userId);
  if (!key) return createBlankState();

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initial = createBlankState();
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.wallets || !Array.isArray(parsed.transactions)) {
      return createBlankState();
    }
    parsed.budgets = parsed.budgets || {};
    parsed.goals = parsed.goals || [];
    parsed.debts = parsed.debts || [];
    return parsed;
  } catch (err) {
    console.error(`Gagal membaca data untuk user ${userId}:`, err);
    return createBlankState();
  }
}

export function saveUserState(userId, state) {
  const key = getUserStorageKey(userId);
  if (!key || !state) return;

  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.error(`Gagal menyimpan data untuk user ${userId}:`, err);
  }
}

export function clearUserState(userId) {
  const blank = createBlankState();
  saveUserState(userId, blank);
  return blank;
}

export function deleteUserStorage(userId) {
  const key = getUserStorageKey(userId);
  if (key) {
    localStorage.removeItem(key);
  }
}

// Ekspor Transaksi ke File CSV (Kompatibel Microsoft Excel & Google Sheets)
export function exportTransactionsCSV(bounds, transactions, wallets, categories) {
  if (!transactions || transactions.length === 0) {
    throw new Error('Tidak ada transaksi pada periode ini untuk diekspor');
  }

  const walletMap = new Map((wallets || []).map(w => [w.id, w.name]));
  const catMap = new Map((categories || []).map(c => [c.id, c.name]));

  const headers = ['Tanggal', 'Tipe', 'Kategori', 'Dompet Sumber', 'Dompet Tujuan', 'Nominal (Rp)', 'Biaya Admin (Rp)', 'Catatan'];
  const rows = transactions.map(tx => {
    const catName = catMap.get(tx.categoryId) || 'Lainnya';
    const fromName = walletMap.get(tx.walletId) || 'Dompet';
    const toName = tx.toWalletId ? (walletMap.get(tx.toWalletId) || '-') : '-';
    const cleanNote = `"${(tx.note || '').replace(/"/g, '""')}"`;

    return [
      tx.date,
      tx.type,
      `"${catName}"`,
      `"${fromName}"`,
      `"${toName}"`,
      tx.amount,
      tx.adminFee || 0,
      cleanNote
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_FinTrack_${(bounds.label || 'Semua').replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Backup Data Lengkap ke Format JSON
export function backupDataJSON(user, state) {
  const backupPayload = {
    exportedAt: new Date().toISOString(),
    version: '2.0',
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    data: state
  };

  const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FinTrack_Backup_${(user.name || 'User').replace(/\s+/g, '_')}_${getRelativeDateStr(0)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Restore Data dari File JSON
export function restoreDataJSON(file, onDone, onError) {
  if (!file) return;
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const incomingState = parsed.data || parsed;

      if (incomingState && incomingState.wallets && Array.isArray(incomingState.transactions)) {
        onDone(incomingState);
      } else {
        onError(new Error('Format file JSON tidak valid. Pastikan ini adalah cadangan dari FinTrack Pro.'));
      }
    } catch (err) {
      onError(new Error('Gagal membaca isi file JSON. File mungkin rusak.'));
    }
  };

  reader.onerror = () => onError(new Error('Gagal membuka file.'));
  reader.readAsText(file);
}
