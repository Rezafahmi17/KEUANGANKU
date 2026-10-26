/**
 * FinTrack Pro — Aplikasi Utama (Main Controller Engine)
 * Mengintegrasikan autentikasi multi-user, penyimpanan terisolasi,
 * kalkulasi saldo atomik, grafik, dan UI hidup (Living Glass UI).
 */

import {
  DEFAULT_CATEGORIES,
  createBlankState,
  createSampleState,
  formatRupiah,
  getRelativeDateStr,
  getMonthDateStr,
  THEME_KEY
} from './config.js';

import {
  loadUserState,
  loadUserPostgresState,
  saveUserState,
  clearUserState,
  exportTransactionsCSV as exportCSVService,
  backupDataJSON as backupJSONService,
  restoreDataJSON as restoreJSONService
} from './storage.js';

import {
  registerUser,
  loginUser,
  restoreSession,
  clearSession,
  logoutUser,
  changeUserPassword,
  deleteUserAccount,
  evaluatePasswordStrength
} from './auth.js';

import {
  renderCashflowTrendChart,
  renderCategoryBreakdown
} from './charts.js';

// ================= STATE GLOBAL APLIKASI =================
let currentUser = null;
let appState = createBlankState();
let activeTab = 'dashboard';
let periodType = 'MONTHLY'; // 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'ALL'
let anchorDate = new Date();
let categoryChartMode = 'EXPENSE'; // 'EXPENSE' | 'INCOME'
let currentTxFormType = 'EXPENSE';
let isPrivacyMode = false;
let confirmCallback = null;

const byId = (id) => document.getElementById(id);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function firstName() {
  return ((currentUser && currentUser.name) || '').trim().split(/\s+/)[0] || 'Pengguna';
}

function getCategoryById(catId) {
  return (appState.categories || DEFAULT_CATEGORIES).find(c => c.id === catId) || {
    id: 'cat_unknown',
    name: 'Lainnya',
    type: 'EXPENSE',
    color: '#64748b',
    icon: 'tag'
  };
}

function getWalletById(walletId) {
  return (appState.wallets || []).find(w => w.id === walletId) || {
    id: 'w_unknown',
    name: 'Dompet Terhapus',
    type: 'Lainnya',
    color: '#64748b',
    initialBalance: 0
  };
}

function parseLocalDate(dateStr) {
  const [y, m, d] = (dateStr || '2026-01-01').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function formatDateIndo(dateStr) {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ================= ANIMASI ANGKA METRIK (TWEEN) =================
function tweenText(el, target, fmt, dur = 600) {
  if (!el) return;
  const from = typeof el._tv === 'number' ? el._tv : 0;
  el._tv = target;
  if (el._raf) cancelAnimationFrame(el._raf);
  if (from === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = fmt(target);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (target - from) * eased));
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

// ================= PERHITUNGAN SALDO & ARUS KAS =================
function computeAllWalletBalances() {
  const map = {};
  (appState.wallets || []).forEach(w => {
    map[w.id] = Math.round(Number(w.initialBalance) || 0);
  });

  (appState.transactions || []).forEach(tx => {
    const amt = Math.round(Number(tx.amount) || 0);
    const fee = Math.round(Number(tx.adminFee) || 0);

    if (tx.type === 'INCOME') {
      if (map[tx.walletId] !== undefined) map[tx.walletId] += amt;
    } else if (tx.type === 'EXPENSE') {
      if (map[tx.walletId] !== undefined) map[tx.walletId] -= amt;
    } else if (tx.type === 'TRANSFER') {
      if (map[tx.walletId] !== undefined) map[tx.walletId] -= (amt + fee);
      if (tx.toWalletId && map[tx.toWalletId] !== undefined) map[tx.toWalletId] += amt;
    }
  });

  return map;
}

function getPeriodBounds(type, refDate) {
  const d = new Date(refDate);
  const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  if (type === 'WEEKLY') {
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const label = `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    return { start, end, label, shortLabel: 'Minggu Ini' };
  }

  if (type === 'MONTHLY') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
    return { start, end, label, shortLabel: label };
  }

  if (type === 'YEARLY') {
    const start = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
    const label = `Tahun ${d.getFullYear()}`;
    return { start, end, label, shortLabel: label };
  }

  return {
    start: new Date(2000, 0, 1),
    end: new Date(2100, 11, 31),
    label: 'Seluruh Riwayat',
    shortLabel: 'Semua Waktu'
  };
}

function filterTransactionsByBounds(bounds) {
  return (appState.transactions || []).filter(tx => {
    const txDate = parseLocalDate(tx.date);
    return txDate >= bounds.start && txDate <= bounds.end;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function calculatePeriodTotals(txList) {
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  txList.forEach(tx => {
    const amt = Math.round(Number(tx.amount) || 0);
    const fee = Math.round(Number(tx.adminFee) || 0);
    if (tx.type === 'INCOME') {
      income += amt;
      incomeCount++;
    } else if (tx.type === 'EXPENSE') {
      expense += amt;
      expenseCount++;
    } else if (tx.type === 'TRANSFER' && fee > 0) {
      expense += fee;
      expenseCount++;
    }
  });

  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  return { income, expense, net, savingsRate, incomeCount, expenseCount };
}

// ================= RENDER UTAMA UI =================
export function renderAll() {
  if (!currentUser) return;

  const bounds = getPeriodBounds(periodType, anchorDate);
  const periodTxs = filterTransactionsByBounds(bounds);
  const totals = calculatePeriodTotals(periodTxs);
  const walletBalances = computeAllWalletBalances();
  const totalNetWorth = Object.values(walletBalances).reduce((a, b) => a + b, 0);

  // Update Period Switcher Buttons
  document.querySelectorAll('.period-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-period') === periodType;
    btn.className = `period-tab-btn flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition ${
      isActive
        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
    }`;
  });

  const activePeriodLabel = byId('active-period-label');
  if (activePeriodLabel) activePeriodLabel.textContent = bounds.label;

  document.querySelectorAll('.period-short-label').forEach(el => {
    el.textContent = bounds.shortLabel;
  });

  // Update Sidebar & Metric Summary Cards
  const sidebarNetWorth = byId('sidebar-total-networth');
  if (sidebarNetWorth) sidebarNetWorth.textContent = formatRupiah(totalNetWorth, false, '', isPrivacyMode);

  const sidebarWalletCount = byId('sidebar-wallet-count');
  if (sidebarWalletCount) sidebarWalletCount.textContent = `${appState.wallets.length} Dompet Aktif`;

  tweenText(byId('metric-total-balance'), totalNetWorth, v => formatRupiah(v, false, '', isPrivacyMode));
  const walletSum = byId('metric-wallet-summary');
  if (walletSum) walletSum.textContent = `${appState.wallets.length} dompet & rekening aktif`;

  tweenText(byId('metric-period-income'), totals.income, v => formatRupiah(v, true, 'INCOME', isPrivacyMode));
  const incomeComp = byId('metric-income-comparison');
  if (incomeComp) incomeComp.textContent = `${totals.incomeCount} transaksi pemasukan tercatat`;

  tweenText(byId('metric-period-expense'), totals.expense, v => formatRupiah(v, true, 'EXPENSE', isPrivacyMode));
  const expenseComp = byId('metric-expense-comparison');
  if (expenseComp) expenseComp.textContent = `${totals.expenseCount} transaksi pengeluaran tercatat`;

  const netEl = byId('metric-net-cashflow');
  if (netEl) {
    tweenText(netEl, totals.net, v => formatRupiah(v, totals.net !== 0, v >= 0 ? 'INCOME' : 'EXPENSE', isPrivacyMode));
    netEl.className = `text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight truncate ${
      totals.net >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'
    }`;
  }

  const badgeEl = byId('metric-net-badge');
  if (badgeEl) {
    badgeEl.textContent = `Tabungan ${totals.savingsRate}%`;
    badgeEl.className = `px-2 py-1 rounded-lg text-[11px] font-bold tabular-nums ${
      totals.savingsRate >= 20
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        : totals.savingsRate >= 0
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
    }`;
  }

  // Render Charts
  renderCashflowTrendChart(bounds, periodTxs, periodType, isPrivacyMode);
  renderCategoryBreakdown(periodTxs, appState.categories, categoryChartMode, isPrivacyMode);

  // Render Wallets & Budgets
  renderDashboardWallets(walletBalances);
  renderBudgetsSection(periodTxs);

  // Render Transactions
  renderTransactionLists(periodTxs);

  // Render Management Tabs
  renderWalletsTab(walletBalances);
  renderGoalsAndDebtsTab();

  // Populate Dropdown Options
  populateFilterDropdowns();

  // Update Stats in Settings
  const setStat = (id, val) => { const el = byId(id); if (el) el.textContent = val; };
  setStat('stat-tx-count', appState.transactions.length);
  setStat('stat-wallet-count', appState.wallets.length);
  setStat('stat-goal-count', appState.goals.length);
  setStat('stat-debt-count', appState.debts.length);

  // Re-run Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ================= RENDER DOMPET & ANGGARAN =================
function renderDashboardWallets(walletBalances) {
  const container = byId('dashboard-wallets-list');
  if (!container) return;

  if (appState.wallets.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">Belum ada dompet. Tambahkan dompet pertama Anda.</div>`;
    return;
  }

  container.innerHTML = appState.wallets.map(w => {
    const bal = walletBalances[w.id] || 0;
    return `
      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs" style="background-color: ${w.color}">
            <i data-lucide="credit-card" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${escapeHtml(w.name)}</div>
            <div class="text-[11px] text-slate-400">${escapeHtml(w.type)}</div>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">${formatRupiah(bal, false, '', isPrivacyMode)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBudgetsSection(periodTxs) {
  const spentMap = {};
  periodTxs.forEach(tx => {
    if (tx.type === 'EXPENSE') {
      spentMap[tx.categoryId] = (spentMap[tx.categoryId] || 0) + Math.round(Number(tx.amount) || 0);
    }
  });

  const expenseCategories = (appState.categories || []).filter(c => c.type === 'EXPENSE' && c.id !== 'cat_admin');
  let totalLimit = 0;

  const htmlItems = expenseCategories.map(cat => {
    const baseMonthlyLimit = Math.round(Number((appState.budgets && appState.budgets[cat.id]) || 0));
    totalLimit += baseMonthlyLimit;

    let effectiveLimit = baseMonthlyLimit;
    if (periodType === 'WEEKLY') effectiveLimit = Math.round(baseMonthlyLimit / 4);
    if (periodType === 'YEARLY') effectiveLimit = baseMonthlyLimit * 12;

    const spent = spentMap[cat.id] || 0;
    const pct = effectiveLimit > 0 ? Math.round((spent / effectiveLimit) * 100) : 0;
    const clampedPct = Math.min(100, pct);

    let barColor = 'bg-emerald-500';
    let badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300';
    let statusText = 'Aman';

    if (pct >= 90) {
      barColor = 'bg-rose-500';
      badgeClass = 'bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300';
      statusText = pct > 100 ? 'Overbudget!' : 'Hampir Habis';
    } else if (pct >= 70) {
      barColor = 'bg-amber-500';
      badgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300';
      statusText = 'Waspada';
    }

    return `
      <div onclick="window.openBudgetModal('${cat.id}')" class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer transition space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${cat.color}"></span>
            <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(cat.name)}</span>
          </div>
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeClass} tabular-nums shrink-0">${pct}% • ${statusText}</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div class="h-full rounded-full ${barColor} transition-all duration-300" style="width: ${clampedPct}%"></div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          <span>Terpakai: <strong class="text-slate-700 dark:text-slate-200">${formatRupiah(spent, false, '', isPrivacyMode)}</strong></span>
          <span>Batas: <strong class="text-slate-700 dark:text-slate-200">${formatRupiah(effectiveLimit, false, '', isPrivacyMode)}</strong></span>
        </div>
      </div>
    `;
  });

  const dashboardBudgets = byId('dashboard-budgets-list');
  if (dashboardBudgets) dashboardBudgets.innerHTML = htmlItems.slice(0, 4).join('');

  const budgetGrid = byId('budgets-management-grid');
  if (budgetGrid) budgetGrid.innerHTML = htmlItems.join('');

  const totalBudgetEl = byId('total-budget-limit');
  if (totalBudgetEl) totalBudgetEl.textContent = formatRupiah(totalLimit, false, '', isPrivacyMode);
}

function renderWalletsTab(walletBalances) {
  const grid = byId('wallets-grid');
  if (!grid) return;

  grid.innerHTML = appState.wallets.map(w => {
    const currentBal = walletBalances[w.id] || 0;
    return `
      <div class="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-4 relative overflow-hidden">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style="background-color: ${w.color}">
              <i data-lucide="landmark" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="text-sm font-bold text-slate-900 dark:text-white">${escapeHtml(w.name)}</h4>
              <span class="text-[11px] text-slate-400">${escapeHtml(w.type)}</span>
            </div>
          </div>
          <button onclick="window.openWalletModal('${w.id}')" title="Edit Dompet" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div>
          <div class="text-[11px] font-semibold uppercase text-slate-400">Saldo Saat Ini</div>
          <div class="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">${formatRupiah(currentBal, false, '', isPrivacyMode)}</div>
          <div class="text-[11px] text-slate-400 tabular-nums mt-1">Saldo Awal: ${formatRupiah(w.initialBalance, false, '', isPrivacyMode)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ================= RENDER TRANSAKSI =================
function buildDesktopTxRow(tx, includeTypeBadge = false) {
  const cat = getCategoryById(tx.categoryId);
  const wallet = getWalletById(tx.walletId);
  const toWallet = tx.toWalletId ? getWalletById(tx.toWalletId) : null;

  let amountColor = 'text-rose-600 dark:text-rose-400';
  let prefix = '-';
  if (tx.type === 'INCOME') {
    amountColor = 'text-emerald-600 dark:text-emerald-400';
    prefix = '+';
  } else if (tx.type === 'TRANSFER') {
    amountColor = 'text-indigo-600 dark:text-indigo-400';
    prefix = '⇄ ';
  }

  const walletDisplay = tx.type === 'TRANSFER' && toWallet
    ? `<span class="font-semibold">${escapeHtml(wallet.name)}</span> → <span class="font-semibold">${escapeHtml(toWallet.name)}</span>`
    : `<span class="font-semibold">${escapeHtml(wallet.name)}</span>`;

  const typeBadgeCol = includeTypeBadge ? `
    <td class="py-3 px-3">
      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
        tx.type === 'INCOME'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : tx.type === 'EXPENSE'
          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
      }">${tx.type === 'INCOME' ? 'Masuk' : tx.type === 'EXPENSE' ? 'Keluar' : 'Transfer'}</span>
    </td>
  ` : '';

  return `
    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
      <td class="py-3 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">${formatDateIndo(tx.date)}</td>
      ${typeBadgeCol}
      <td class="py-3 px-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${cat.color}"></span>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">${tx.type === 'TRANSFER' ? 'Mutasi Dompet' : escapeHtml(cat.name)}</span>
        </div>
      </td>
      <td class="py-3 px-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${walletDisplay}</td>
      <td class="py-3 px-3 text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">${escapeHtml(tx.note || '-')}</td>
      <td class="py-3 px-3 text-right font-extrabold text-xs sm:text-sm tabular-nums whitespace-nowrap ${amountColor}">
        ${prefix}${formatRupiah(tx.amount, false, '', isPrivacyMode)}
        ${tx.type === 'TRANSFER' && Number(tx.adminFee) > 0 ? `<div class="text-[10px] text-rose-500 font-normal">Admin: -${formatRupiah(tx.adminFee, false, '', isPrivacyMode)}</div>` : ''}
      </td>
      <td class="py-3 px-3 text-right whitespace-nowrap">
        <div class="inline-flex items-center gap-1">
          <button onclick="window.openTransactionModal('${tx.type}', '${tx.id}')" title="Edit" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="window.confirmDeleteTransaction('${tx.id}')" title="Hapus" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function buildMobileTxCard(tx) {
  const cat = getCategoryById(tx.categoryId);
  const wallet = getWalletById(tx.walletId);
  const toWallet = tx.toWalletId ? getWalletById(tx.toWalletId) : null;

  let amountColor = 'text-rose-600 dark:text-rose-400';
  let prefix = '-';
  if (tx.type === 'INCOME') {
    amountColor = 'text-emerald-600 dark:text-emerald-400';
    prefix = '+';
  } else if (tx.type === 'TRANSFER') {
    amountColor = 'text-indigo-600 dark:text-indigo-400';
    prefix = '⇄ ';
  }

  const walletBadge = tx.type === 'TRANSFER' && toWallet
    ? `${wallet.name} → ${toWallet.name}`
    : wallet.name;

  return `
    <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3">
      <div class="flex items-start gap-3 min-w-0">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5" style="background-color: ${tx.type === 'TRANSFER' ? '#6366f1' : cat.color}">
          <i data-lucide="${tx.type === 'TRANSFER' ? 'repeat' : cat.icon || 'tag'}" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${escapeHtml(tx.note || '-')}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
            <span>${tx.type === 'TRANSFER' ? 'Transfer' : escapeHtml(cat.name)}</span>
            <span>•</span>
            <span class="font-semibold text-slate-600 dark:text-slate-300">${escapeHtml(walletBadge)}</span>
          </div>
          <div class="text-[10px] text-slate-400 tabular-nums mt-0.5">${formatDateIndo(tx.date)}</div>
        </div>
      </div>
      <div class="text-right shrink-0 flex flex-col items-end">
        <div class="text-xs font-extrabold tabular-nums ${amountColor}">${prefix}${formatRupiah(tx.amount, false, '', isPrivacyMode)}</div>
        <div class="flex items-center gap-1 mt-1.5">
          <button onclick="window.openTransactionModal('${tx.type}', '${tx.id}')" class="p-1 rounded text-slate-400 hover:text-indigo-600">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="window.confirmDeleteTransaction('${tx.id}')" class="p-1 rounded text-slate-400 hover:text-rose-600">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildEmptyTableRow(colspan) {
  return `
    <tr>
      <td colspan="${colspan}" class="py-8 text-center text-xs text-slate-400">
        Belum ada catatan transaksi pada periode ini.
      </td>
    </tr>
  `;
}

function buildEmptyMobileCard() {
  return `
    <div class="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
      Belum ada catatan transaksi pada periode ini.
    </div>
  `;
}

function renderTransactionLists(periodTxs) {
  const recentTxs = periodTxs.slice(0, 6);
  const dashTable = byId('dashboard-tx-table-body');
  if (dashTable) dashTable.innerHTML = recentTxs.length > 0 ? recentTxs.map(tx => buildDesktopTxRow(tx, false)).join('') : buildEmptyTableRow(6);

  const dashMobile = byId('dashboard-tx-mobile-list');
  if (dashMobile) dashMobile.innerHTML = recentTxs.length > 0 ? recentTxs.map(tx => buildMobileTxCard(tx)).join('') : buildEmptyMobileCard();

  const searchVal = (byId('filter-search')?.value || '').toLowerCase().trim();
  const typeFilter = byId('filter-type')?.value || 'ALL';
  const walletFilter = byId('filter-wallet')?.value || 'ALL';
  const catFilter = byId('filter-category')?.value || 'ALL';

  const filteredTxs = periodTxs.filter(tx => {
    if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
    if (walletFilter !== 'ALL' && tx.walletId !== walletFilter && tx.toWalletId !== walletFilter) return false;
    if (catFilter !== 'ALL' && tx.categoryId !== catFilter) return false;
    if (searchVal) {
      const cat = getCategoryById(tx.categoryId);
      const w = getWalletById(tx.walletId);
      const haystack = `${tx.note} ${cat.name} ${w.name}`.toLowerCase();
      if (!haystack.includes(searchVal)) return false;
    }
    return true;
  });

  const filteredTotals = calculatePeriodTotals(filteredTxs);
  const countEl = byId('tx-filtered-count');
  if (countEl) countEl.textContent = `Menampilkan ${filteredTxs.length} transaksi`;

  const incEl = byId('tx-filtered-income');
  if (incEl) incEl.textContent = formatRupiah(filteredTotals.income, false, '', isPrivacyMode);

  const expEl = byId('tx-filtered-expense');
  if (expEl) expEl.textContent = formatRupiah(filteredTotals.expense, false, '', isPrivacyMode);

  const fullTable = byId('full-tx-table-body');
  if (fullTable) fullTable.innerHTML = filteredTxs.length > 0 ? filteredTxs.map(tx => buildDesktopTxRow(tx, true)).join('') : buildEmptyTableRow(7);

  const fullMobile = byId('full-tx-mobile-list');
  if (fullMobile) fullMobile.innerHTML = filteredTxs.length > 0 ? filteredTxs.map(tx => buildMobileTxCard(tx)).join('') : buildEmptyMobileCard();
}

function renderGoalsAndDebtsTab() {
  const goalsContainer = byId('goals-list');
  if (goalsContainer) {
    if (appState.goals.length === 0) {
      goalsContainer.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">Belum ada target tabungan.</div>`;
    } else {
      goalsContainer.innerHTML = appState.goals.map(g => {
        const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
        const remaining = Math.max(0, g.targetAmount - g.currentAmount);
        return `
          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2.5">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h4 class="text-sm font-bold text-slate-900 dark:text-white">${escapeHtml(g.name)}</h4>
                <span class="text-[11px] text-slate-400">Target Tercapai: ${formatDateIndo(g.deadline)}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <button onclick="window.addGoalAllocation('${g.id}', 500000)" class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold hover:bg-indigo-100 transition">
                  +Rp500rb
                </button>
                <button onclick="window.deleteGoal('${g.id}')" class="p-1 text-slate-400 hover:text-rose-500">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300" style="width: ${pct}%"></div>
            </div>
            <div class="flex items-center justify-between text-xs tabular-nums">
              <span class="font-bold text-indigo-600 dark:text-indigo-400">${formatRupiah(g.currentAmount, false, '', isPrivacyMode)} (${pct}%)</span>
              <span class="text-slate-500 dark:text-slate-400">Kurang: ${formatRupiah(remaining, false, '', isPrivacyMode)} dari ${formatRupiah(g.targetAmount, false, '', isPrivacyMode)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  const debtsContainer = byId('debts-list');
  if (debtsContainer) {
    if (!appState.debts || appState.debts.length === 0) {
      debtsContainer.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">Tidak ada catatan utang/piutang.</div>`;
    } else {
      debtsContainer.innerHTML = appState.debts.map(d => `
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3 ${d.isPaid ? 'opacity-50' : ''}">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${
                d.type === 'PIUTANG'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
              }">${d.type}</span>
              <span class="text-xs font-bold text-slate-900 dark:text-white truncate ${d.isPaid ? 'line-through' : ''}">${escapeHtml(d.person)}</span>
            </div>
            <div class="text-[11px] text-slate-400 mt-1 tabular-nums">Jatuh Tempo: ${formatDateIndo(d.dueDate)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">${formatRupiah(d.amount, false, '', isPrivacyMode)}</div>
            <div class="flex items-center justify-end gap-1.5 mt-1">
              <button onclick="window.toggleDebtPaid('${d.id}')" class="text-[11px] font-bold ${d.isPaid ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400 hover:underline'}">
                ${d.isPaid ? 'Lunas ✓' : 'Tandai Lunas'}
              </button>
              <button onclick="window.deleteDebt('${d.id}')" class="text-slate-400 hover:text-rose-500">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }
}

function populateFilterDropdowns() {
  const walletSelect = byId('filter-wallet');
  const catSelect = byId('filter-category');
  if (!walletSelect || !catSelect) return;

  const currentW = walletSelect.value || 'ALL';
  const currentC = catSelect.value || 'ALL';

  walletSelect.innerHTML = `<option value="ALL">Semua Dompet / Rekening</option>` +
    (appState.wallets || []).map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  walletSelect.value = currentW;

  catSelect.innerHTML = `<option value="ALL">Semua Kategori</option>` +
    (appState.categories || DEFAULT_CATEGORIES).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  catSelect.value = currentC;
}

// ================= CRUD OPERASI DENGAN PENYIMPANAN TERISOLASI =================
function saveAndRender(toastMsg, toastType = 'success') {
  if (currentUser) {
    saveUserState(currentUser.id, appState);
  }
  renderAll();
  if (toastMsg) showToast(toastMsg, toastType);
}

// ================= MODAL TRANSAKSI =================
export function openTransactionModal(defaultType = 'EXPENSE', editTxId = null) {
  const modal = byId('modal-transaction');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const walletOptions = (appState.wallets || []).map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  byId('tx-wallet').innerHTML = walletOptions;
  byId('tx-to-wallet').innerHTML = walletOptions;
  if (appState.wallets.length > 1) {
    byId('tx-to-wallet').selectedIndex = 1;
  }

  if (editTxId) {
    const tx = appState.transactions.find(t => t.id === editTxId);
    if (tx) {
      byId('modal-tx-title').textContent = 'Edit Transaksi';
      byId('tx-id').value = tx.id;
      setTxFormType(tx.type);
      byId('tx-amount').value = tx.amount;
      byId('tx-date').value = tx.date;
      byId('tx-wallet').value = tx.walletId;
      if (tx.toWalletId) byId('tx-to-wallet').value = tx.toWalletId;
      if (tx.categoryId) byId('tx-category').value = tx.categoryId;
      byId('tx-admin-fee').value = tx.adminFee || 0;
      byId('tx-note').value = tx.note || '';
      return;
    }
  }

  byId('modal-tx-title').textContent = 'Catat Transaksi Baru';
  byId('tx-id').value = '';
  byId('tx-amount').value = '';
  byId('tx-date').value = getRelativeDateStr(0);
  byId('tx-admin-fee').value = '0';
  byId('tx-note').value = '';
  setTxFormType(defaultType);
}

export function closeTransactionModal() {
  const modal = byId('modal-transaction');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function setTxFormType(type) {
  currentTxFormType = type;
  const btnExp = byId('btn-type-expense');
  const btnInc = byId('btn-type-income');
  const btnTrf = byId('btn-type-transfer');

  if (btnExp) btnExp.className = `py-2 rounded-lg text-xs font-bold transition ${type === 'EXPENSE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`;
  if (btnInc) btnInc.className = `py-2 rounded-lg text-xs font-bold transition ${type === 'INCOME' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`;
  if (btnTrf) btnTrf.className = `py-2 rounded-lg text-xs font-bold transition ${type === 'TRANSFER' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`;

  const catWrapper = byId('tx-category-wrapper');
  const targetWrapper = byId('tx-transfer-target-wrapper');
  const feeWrapper = byId('tx-admin-fee-wrapper');
  const walletLabel = byId('label-tx-wallet');

  if (type === 'TRANSFER') {
    if (catWrapper) catWrapper.classList.add('hidden');
    if (targetWrapper) targetWrapper.classList.remove('hidden');
    if (feeWrapper) feeWrapper.classList.remove('hidden');
    if (walletLabel) walletLabel.textContent = 'Dari Dompet Sumber';
  } else {
    if (catWrapper) catWrapper.classList.remove('hidden');
    if (targetWrapper) targetWrapper.classList.add('hidden');
    if (feeWrapper) feeWrapper.classList.add('hidden');
    if (walletLabel) walletLabel.textContent = 'Dompet / Rekening';

    const filteredCats = (appState.categories || DEFAULT_CATEGORIES).filter(c => c.type === type);
    const catSelect = byId('tx-category');
    if (catSelect) {
      catSelect.innerHTML = filteredCats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
  }
}

export function setQuickAmount(val) {
  const el = byId('tx-amount');
  if (el) el.value = val;
}

export function handleSaveTransaction(e) {
  if (e) e.preventDefault();
  const id = byId('tx-id').value;
  const amount = Math.round(Number(byId('tx-amount').value) || 0);
  const date = byId('tx-date').value;
  const walletId = byId('tx-wallet').value;
  const toWalletId = byId('tx-to-wallet').value;
  const categoryId = currentTxFormType === 'TRANSFER' ? 'cat_admin' : byId('tx-category').value;
  const adminFee = currentTxFormType === 'TRANSFER' ? Math.round(Number(byId('tx-admin-fee').value) || 0) : 0;
  const note = byId('tx-note').value.trim();

  if (amount <= 0) {
    showToast('Nominal harus lebih besar dari Rp 0', 'error');
    return;
  }
  if (currentTxFormType === 'TRANSFER' && walletId === toWalletId) {
    showToast('Dompet sumber dan tujuan tidak boleh sama', 'error');
    return;
  }

  const payload = {
    id: id || `tx_${Date.now()}`,
    type: currentTxFormType,
    amount,
    adminFee,
    date,
    walletId,
    toWalletId: currentTxFormType === 'TRANSFER' ? toWalletId : null,
    categoryId,
    note
  };

  if (id) {
    const idx = appState.transactions.findIndex(t => t.id === id);
    if (idx !== -1) appState.transactions[idx] = payload;
  } else {
    appState.transactions.unshift(payload);
  }

  closeTransactionModal();
  saveAndRender(id ? 'Transaksi diperbarui' : 'Transaksi berhasil dicatat', 'success');
}

export function confirmDeleteTransaction(txId) {
  openConfirmModal(
    'Hapus Transaksi?',
    'Menghapus transaksi ini akan otomatis menyesuaikan saldo dompet dan laporan periode.',
    () => {
      appState.transactions = appState.transactions.filter(t => t.id !== txId);
      saveAndRender('Transaksi telah dihapus', 'info');
    }
  );
}

// ================= MODAL DOMPET =================
export function openWalletModal(editWalletId = null) {
  const modal = byId('modal-wallet');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (editWalletId) {
    const w = appState.wallets.find(item => item.id === editWalletId);
    if (w) {
      byId('modal-wallet-title').textContent = 'Edit Dompet / Rekening';
      byId('wallet-id').value = w.id;
      byId('wallet-name').value = w.name;
      byId('wallet-type').value = w.type;
      byId('wallet-color').value = w.color;
      byId('wallet-initial').value = w.initialBalance;
      return;
    }
  }

  byId('modal-wallet-title').textContent = 'Tambah Dompet Baru';
  byId('wallet-id').value = '';
  byId('wallet-name').value = '';
  byId('wallet-initial').value = '0';
}

export function closeWalletModal() {
  const modal = byId('modal-wallet');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function handleSaveWallet(e) {
  if (e) e.preventDefault();
  const id = byId('wallet-id').value;
  const name = byId('wallet-name').value.trim();
  const type = byId('wallet-type').value;
  const color = byId('wallet-color').value;
  const initialBalance = Math.round(Number(byId('wallet-initial').value) || 0);

  if (!name) {
    showToast('Nama dompet wajib diisi', 'error');
    return;
  }

  if (id) {
    const idx = appState.wallets.findIndex(w => w.id === id);
    if (idx !== -1) {
      appState.wallets[idx] = { ...appState.wallets[idx], name, type, color, initialBalance };
    }
  } else {
    appState.wallets.push({
      id: `w_${Date.now()}`,
      name,
      type,
      color,
      initialBalance
    });
  }

  closeWalletModal();
  saveAndRender(id ? 'Dompet diperbarui' : 'Dompet baru ditambahkan', 'success');
}

// ================= MODAL ANGGARAN =================
export function openBudgetModal(catId) {
  const cat = getCategoryById(catId);
  const modal = byId('modal-budget');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  byId('budget-category-id').value = catId;
  byId('budget-category-name').textContent = `Plafon Bulanan: ${cat.name} (Rp)`;
  byId('budget-limit-input').value = (appState.budgets && appState.budgets[catId]) || 0;
}

export function closeBudgetModal() {
  const modal = byId('modal-budget');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function handleSaveBudget(e) {
  if (e) e.preventDefault();
  const catId = byId('budget-category-id').value;
  const limit = Math.round(Number(byId('budget-limit-input').value) || 0);
  appState.budgets = appState.budgets || {};
  appState.budgets[catId] = limit;
  closeBudgetModal();
  saveAndRender('Batas anggaran bulanan disimpan', 'success');
}

// ================= MODAL GOALS & DEBTS =================
export function openGoalModal() {
  const modal = byId('modal-goal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  byId('goal-name').value = '';
  byId('goal-target').value = '';
  byId('goal-current').value = '0';
  byId('goal-deadline').value = getMonthDateStr(6, 28);
}

export function closeGoalModal() {
  const modal = byId('modal-goal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function handleSaveGoal(e) {
  if (e) e.preventDefault();
  const name = byId('goal-name').value.trim();
  const targetAmount = Math.round(Number(byId('goal-target').value) || 0);
  if (!name || targetAmount <= 0) {
    showToast('Lengkapi nama dan target tabungan nominal', 'error');
    return;
  }

  appState.goals = appState.goals || [];
  appState.goals.push({
    id: `g_${Date.now()}`,
    name,
    targetAmount,
    currentAmount: Math.round(Number(byId('goal-current').value) || 0),
    deadline: byId('goal-deadline').value
  });

  closeGoalModal();
  saveAndRender('Target tabungan berhasil ditambahkan', 'success');
}

export function addGoalAllocation(goalId, addAmount) {
  const g = appState.goals.find(item => item.id === goalId);
  if (g) {
    g.currentAmount = Math.min(g.targetAmount, g.currentAmount + addAmount);
    saveAndRender(`Alokasi +${formatRupiah(addAmount)} ditambahkan ke ${g.name}`, 'success');
  }
}

export function deleteGoal(goalId) {
  appState.goals = appState.goals.filter(g => g.id !== goalId);
  saveAndRender('Target tabungan dihapus', 'info');
}

export function openDebtModal() {
  const modal = byId('modal-debt');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  byId('debt-amount').value = '';
  byId('debt-person').value = '';
  byId('debt-due').value = getRelativeDateStr(7);
}

export function closeDebtModal() {
  const modal = byId('modal-debt');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function handleSaveDebt(e) {
  if (e) e.preventDefault();
  const person = byId('debt-person').value.trim();
  const amount = Math.round(Number(byId('debt-amount').value) || 0);

  if (!person || amount <= 0) {
    showToast('Lengkapi rincian utang/piutang dan nominalnya', 'error');
    return;
  }

  appState.debts = appState.debts || [];
  appState.debts.unshift({
    id: `d_${Date.now()}`,
    type: byId('debt-type').value,
    amount,
    person,
    dueDate: byId('debt-due').value,
    isPaid: false
  });

  closeDebtModal();
  saveAndRender('Catatan berhasil disimpan', 'success');
}

export function toggleDebtPaid(debtId) {
  const d = appState.debts.find(item => item.id === debtId);
  if (d) {
    d.isPaid = !d.isPaid;
    saveAndRender(d.isPaid ? 'Ditandai lunas' : 'Status lunas dibatalkan', 'info');
  }
}

export function deleteDebt(debtId) {
  appState.debts = appState.debts.filter(item => item.id !== debtId);
  saveAndRender('Catatan dihapus', 'info');
}

// ================= NAVIGASI TAB & FILTER PERIODE =================
export function switchTab(tabId) {
  activeTab = tabId;
  const views = ['dashboard', 'transactions', 'wallets', 'goals', 'settings'];
  views.forEach(v => {
    const el = byId(`view-${v}`);
    if (!el) return;
    if (v === tabId) {
      el.classList.remove('hidden');
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
    } else {
      el.classList.add('hidden');
    }
  });

  document.querySelectorAll('#desktop-nav .nav-btn, .mobile-nav-btn').forEach(btn => {
    const isCurrent = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('active', isCurrent);
    if (isCurrent) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  const settingsBtn = byId('btn-settings-mobile');
  if (settingsBtn) {
    settingsBtn.classList.toggle('bg-indigo-50', tabId === 'settings');
    settingsBtn.classList.toggle('dark:bg-indigo-950', tabId === 'settings');
  }

  const periodBar = byId('period-bar');
  if (periodBar) {
    periodBar.classList.toggle('hidden', !['dashboard', 'transactions', 'wallets'].includes(tabId));
  }

  const titles = {
    dashboard: [`Halo, ${firstName()} 👋`, 'Pantau pemasukan, pengeluaran, dan transparansi anggaran secara real-time', 'Ringkasan Keuangan'],
    transactions: ['Buku Besar & Riwayat Transaksi', 'Cari, saring, dan ekspor seluruh catatan arus kas Anda', 'Riwayat Transaksi'],
    wallets: ['Multi-Dompet & Kontrol Anggaran', 'Kelola saldo rekening bank, e-wallet, dan batas pengeluaran bulanan', 'Dompet & Anggaran'],
    goals: ['Target Tabungan & Catatan Utang', 'Rencanakan dana masa depan dan lacak piutang/cicilan', 'Target & Utang'],
    settings: ['Pengaturan & Data', 'Atur tampilan, cadangkan, dan pulihkan data keuangan Anda', 'Pengaturan & Data']
  };

  if (titles[tabId]) {
    byId('desktop-page-title').textContent = titles[tabId][0];
    byId('desktop-page-subtitle').textContent = titles[tabId][1];
    const mobileSub = byId('mobile-header-subtitle');
    if (mobileSub) mobileSub.textContent = titles[tabId][2];
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}

export function setPeriodType(newType) {
  periodType = newType;
  renderAll();
}

export function navigatePeriod(dir) {
  if (periodType === 'ALL') return;
  const d = new Date(anchorDate);
  if (periodType === 'WEEKLY') {
    d.setDate(d.getDate() + (dir * 7));
  } else if (periodType === 'MONTHLY') {
    d.setMonth(d.getMonth() + dir);
  } else if (periodType === 'YEARLY') {
    d.setFullYear(d.getFullYear() + dir);
  }
  anchorDate = d;
  renderAll();
}

export function resetPeriodToToday() {
  anchorDate = new Date();
  renderAll();
  showToast('Periode dikembalikan ke waktu saat ini', 'info');
}

export function setCategoryChartMode(mode) {
  categoryChartMode = mode;
  const btnExp = byId('cat-mode-expense');
  const btnInc = byId('cat-mode-income');

  if (mode === 'EXPENSE') {
    if (btnExp) btnExp.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-white dark:bg-slate-900 text-rose-600 shadow-2xs';
    if (btnInc) btnInc.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition text-slate-500 dark:text-slate-400';
  } else {
    if (btnInc) btnInc.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-white dark:bg-slate-900 text-emerald-600 shadow-2xs';
    if (btnExp) btnExp.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition text-slate-500 dark:text-slate-400';
  }
  renderAll();
}

export function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  renderAll();
  showToast(isPrivacyMode ? 'Mode Privasi Aktif: Nominal disembunyikan' : 'Mode Privasi Nonaktif', 'info');
}

export function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  renderAll();
}

// ================= EKSPOR / BACKUP / RESTORE =================
export function exportTransactionsCSV() {
  try {
    const bounds = getPeriodBounds(periodType, anchorDate);
    const periodTxs = filterTransactionsByBounds(bounds);
    exportCSVService(bounds, periodTxs, appState.wallets, appState.categories);
    showToast('Laporan CSV berhasil diunduh', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export function backupDataJSON() {
  if (!currentUser) return;
  backupJSONService(currentUser, appState);
  showToast('File Backup JSON berhasil diunduh', 'success');
}

export function restoreDataJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  restoreJSONService(
    file,
    (incomingState) => {
      appState = incomingState;
      saveAndRender('Data akun berhasil dipulihkan dari file JSON', 'success');
    },
    (err) => {
      showToast(err.message, 'error');
    }
  );
  event.target.value = '';
}

// Memuat data contoh HANYA pada akun aktif saat ini
export function confirmPopulateSampleData() {
  openConfirmModal(
    'Muat Data Simulasi?',
    'Fitur ini akan mengisi akun Anda dengan contoh dompet dan transaksi agar Anda dapat mencoba seluruh grafik & fitur analitik.',
    () => {
      appState = createSampleState();
      saveAndRender('Data simulasi berhasil dimuat pada akun Anda', 'success');
    }
  );
}

export function confirmClearAllData() {
  openConfirmModal(
    'Kosongkan Semua Data?',
    'Seluruh transaksi, saldo dompet, anggaran, dan target pada akun Anda akan dikosongkan (Rp 0). Tindakan ini tidak dapat dibatalkan.',
    () => {
      if (currentUser) {
        appState = clearUserState(currentUser.id);
        saveAndRender('Semua data akun telah dikosongkan', 'info');
      }
    }
  );
}

// ================= MODAL KONFIRMASI =================
export function openConfirmModal(title, message, onConfirm) {
  byId('confirm-title').textContent = title;
  byId('confirm-message').textContent = message;
  confirmCallback = onConfirm;
  const modal = byId('modal-confirm');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeConfirmModal() {
  const modal = byId('modal-confirm');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  confirmCallback = null;
}

// ================= TOAST NOTIFIKASI =================
export function showToast(message, type = 'info') {
  const container = byId('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bgClass =
    type === 'success'
      ? 'bg-emerald-600 text-white'
      : type === 'error'
      ? 'bg-rose-600 text-white'
      : 'bg-slate-900 dark:bg-slate-800 text-white';

  toast.className = `${bgClass} px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 pointer-events-auto transition-all duration-300`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-3');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// ================= PROFIL & AUTENTIKASI PENGGUNA =================
function fillUserUI() {
  if (!currentUser) return;
  const name = currentUser.name;
  const initial = (name.trim()[0] || '?').toUpperCase();
  ['sidebar', 'mobile', 'settings'].forEach(k => {
    const el = byId('user-avatar-' + k);
    if (el) el.textContent = initial;
  });
  const nameSidebar = byId('user-name-sidebar');
  if (nameSidebar) nameSidebar.textContent = name;
  const emailSidebar = byId('user-email-sidebar');
  if (emailSidebar) emailSidebar.textContent = currentUser.email;

  const nameSettings = byId('user-name-settings');
  if (nameSettings) nameSettings.textContent = name;
  const emailSettings = byId('user-email-settings');
  if (emailSettings) emailSettings.textContent = currentUser.email;

  const sinceSettings = byId('user-since-settings');
  if (sinceSettings) {
    sinceSettings.textContent = 'Bergabung sejak ' +
      new Date(currentUser.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}

export async function enterApp(user) {
  currentUser = user;
  // Muat state dari cache lokal terlebih dahulu agar tampilan instan
  appState = loadUserState(user.id);

  // Ambil state terbaru dari Database PostgreSQL
  if (user && user.id) {
    loadUserPostgresState(user.id).then((pgState) => {
      if (pgState) {
        appState = pgState;
        renderAll();
      }
    }).catch(err => console.warn('Pembaruan state PostgreSQL:', err));
  }

  periodType = 'MONTHLY';
  anchorDate = new Date();
  isPrivacyMode = false;

  ['metric-total-balance', 'metric-period-income', 'metric-period-expense', 'metric-net-cashflow'].forEach(id => {
    const el = byId(id);
    if (el) {
      el._tv = undefined;
      if (el._raf) cancelAnimationFrame(el._raf);
    }
  });

  fillUserUI();
  document.documentElement.classList.remove('has-session');
  byId('app-root').classList.remove('hidden');

  const auth = byId('auth-screen');
  if (auth) {
    auth.classList.add('auth-leave');
    setTimeout(() => {
      auth.classList.add('hidden');
      auth.classList.remove('auth-leave');
    }, 450);
  }

  ['form-login', 'form-register', 'form-change-password'].forEach(id => byId(id)?.reset());
  byId('form-change-password')?.classList.add('hidden');
  updatePasswordStrengthUI('');
  switchTab('dashboard');
}

export function showAuth(mode = 'login') {
  document.documentElement.classList.remove('has-session');
  byId('app-root').classList.add('hidden');
  const auth = byId('auth-screen');
  auth.classList.remove('hidden', 'auth-leave');
  setAuthMode(mode);
  window.scrollTo({ top: 0 });
}

export function setAuthMode(mode) {
  const screen = byId('auth-screen');
  screen.dataset.mode = mode;
  byId('tab-login').classList.toggle('active', mode === 'login');
  byId('tab-register').classList.toggle('active', mode === 'register');
  const show = byId(mode === 'login' ? 'form-login' : 'form-register');
  const hide = byId(mode === 'login' ? 'form-register' : 'form-login');
  hide.classList.add('hidden');
  hide.classList.remove('auth-form');
  show.classList.remove('hidden', 'auth-form', 'shake');
  void show.offsetWidth;
  show.classList.add('auth-form');

  byId('auth-title').textContent = mode === 'login' ? 'Selamat datang kembali' : 'Buat akun pribadi';
  byId('auth-subtitle').textContent = mode === 'login'
    ? 'Masuk untuk mengelola keuangan pribadi Anda.'
    : 'Akun baru dimulai bersih (Rp 0). Hanya butuh email dan password.';

  clearAuthErrors();
  if (window.matchMedia('(pointer: fine)').matches) {
    setTimeout(() => byId(mode === 'login' ? 'login-email' : 'reg-name')?.focus(), 60);
  }
}

function showAuthError(id, msg, inputIds = []) {
  const box = byId(id);
  box.querySelector('span').textContent = msg;
  box.classList.remove('hidden');
  inputIds.forEach(i => { const el = byId(i); if (el) el.classList.add('invalid'); });
  const form = box.closest('form');
  form.classList.remove('shake');
  void form.offsetWidth;
  form.classList.add('shake');
  return false;
}

function clearAuthErrors() {
  document.querySelectorAll('.auth-error').forEach(b => b.classList.add('hidden'));
  document.querySelectorAll('.auth-input.invalid').forEach(i => i.classList.remove('invalid'));
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<span class="spinner"></span><span>${label}</span>` : `<span>${label}</span>`;
}

export function togglePwVisibility(inputId, btn) {
  const input = byId(inputId);
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  btn.querySelector('.eye-on').classList.toggle('hidden', reveal);
  btn.querySelector('.eye-off').classList.toggle('hidden', !reveal);
  btn.setAttribute('aria-label', reveal ? 'Sembunyikan password' : 'Tampilkan password');
}

export function updatePasswordStrengthUI(v) {
  const { level, label } = evaluatePasswordStrength(v);
  const box = byId('pw-strength');
  if (box) {
    box.dataset.level = level;
    box.querySelectorAll('.pw-seg').forEach((el, i) => el.classList.toggle('on', i < level));
  }
  const labelEl = byId('pw-strength-label');
  if (labelEl) labelEl.textContent = label;
}

export async function handleLogin(e) {
  e.preventDefault();
  clearAuthErrors();
  const email = byId('login-email').value.trim();
  const password = byId('login-password').value;
  const remember = byId('login-remember').checked;

  if (!EMAIL_RE.test(email)) return showAuthError('login-error', 'Masukkan alamat email yang valid.', ['login-email']);
  if (!password) return showAuthError('login-error', 'Password wajib diisi.', ['login-password']);

  const btn = byId('login-submit');
  setBusy(btn, true, 'Memeriksa…');

  try {
    const user = await loginUser({ email, password, remember });
    showToast(`Selamat datang kembali, ${escapeHtml(user.name.trim().split(/\s+/)[0])}!`, 'success');
    enterApp(user);
  } catch (err) {
    showAuthError('login-error', err.message || 'Gagal memproses login.');
  } finally {
    setBusy(btn, false, 'Masuk');
  }
}

export async function handleRegister(e) {
  e.preventDefault();
  clearAuthErrors();
  const name = byId('reg-name').value.trim();
  const email = byId('reg-email').value.trim();
  const password = byId('reg-password').value;
  const password2 = byId('reg-password2').value;

  if (name.length < 2) return showAuthError('register-error', 'Nama minimal 2 karakter.', ['reg-name']);
  if (!EMAIL_RE.test(email)) return showAuthError('register-error', 'Masukkan alamat email yang valid.', ['reg-email']);
  if (password.length < 8) return showAuthError('register-error', 'Password minimal 8 karakter.', ['reg-password']);
  if (!(/[A-Za-z]/.test(password) && /\d/.test(password))) {
    return showAuthError('register-error', 'Gunakan kombinasi huruf dan angka pada password.', ['reg-password']);
  }
  if (password !== password2) return showAuthError('register-error', 'Konfirmasi password tidak sama.', ['reg-password2']);

  const btn = byId('register-submit');
  setBusy(btn, true, 'Membuat akun…');

  try {
    // Akun baru dibuat bersih secara default! (0 saldo, 0 transaksi)
    const user = await registerUser({ name, email, password, withSample: false });
    showToast(`Akun berhasil dibuat. Selamat datang, ${escapeHtml(name.split(' ')[0])}!`, 'success');
    enterApp(user);
  } catch (err) {
    showAuthError('register-error', err.message || 'Gagal membuat akun.', err.message && err.message.includes('terdaftar') ? ['reg-email'] : []);
  } finally {
    setBusy(btn, false, 'Buat Akun');
  }
}

export function confirmLogout() {
  openConfirmModal(
    'Keluar dari Akun?',
    'Data keuangan Anda tersimpan aman di database PostgreSQL. Anda dapat masuk kembali kapan saja dari laptop atau HP.',
    async () => {
      await logoutUser();
      currentUser = null;
      appState = createBlankState();
      showAuth('login');
      showToast('Anda telah keluar dari akun.', 'info');
    }
  );
}

export function confirmDeleteAccount() {
  openConfirmModal(
    'Hapus Akun Permanen?',
    'Akun beserta seluruh riwayat keuangannya akan dihapus total dari database PostgreSQL. Tindakan ini tidak dapat dibatalkan.',
    async () => {
      if (!currentUser) return;
      await deleteUserAccount(currentUser.id);
      currentUser = null;
      appState = createBlankState();
      showAuth('login');
      showToast('Akun Anda telah berhasil dihapus.', 'info');
    }
  );
}

export function toggleChangePasswordPanel() {
  const form = byId('form-change-password');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) byId('cp-old')?.focus();
}

export async function handleChangePassword(e) {
  e.preventDefault();
  clearAuthErrors();
  const oldPw = byId('cp-old').value;
  const newPw = byId('cp-new').value;
  const confirmPw = byId('cp-confirm').value;

  if (!oldPw) return showAuthError('cp-error', 'Masukkan password saat ini.', ['cp-old']);
  if (newPw.length < 8 || !(/[A-Za-z]/.test(newPw) && /\d/.test(newPw))) {
    return showAuthError('cp-error', 'Password baru minimal 8 karakter dengan huruf dan angka.', ['cp-new']);
  }
  if (newPw !== confirmPw) return showAuthError('cp-error', 'Konfirmasi password baru tidak sama.', ['cp-confirm']);

  const btn = byId('cp-submit');
  setBusy(btn, true, 'Menyimpan…');

  try {
    await changeUserPassword(currentUser.id, oldPw, newPw);
    byId('form-change-password').reset();
    byId('form-change-password').classList.add('hidden');
    showToast('Password berhasil diperbarui', 'success');
  } catch (err) {
    showAuthError('cp-error', err.message || 'Gagal memperbarui password.');
  } finally {
    setBusy(btn, false, 'Simpan Password Baru');
  }
}

// ================= LIVING GLASS UI (PARALLAX & CURSOR GLOW) =================
function initLivingUI() {
  document.querySelectorAll('#view-dashboard > div:first-child > div, #view-settings > .grid > div')
    .forEach(el => el.classList.add('lift'));

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  const glow = byId('cursor-glow');

  window.addEventListener('pointermove', (e) => {
    root.style.setProperty('--mx', ((e.clientX / window.innerWidth) - 0.5) * 2);
    root.style.setProperty('--my', ((e.clientY / window.innerHeight) - 0.5) * 2);
    if (glow && e.pointerType === 'mouse') {
      glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      glow.classList.add('on');
    }
  }, { passive: true });

  root.addEventListener('mouseleave', () => glow && glow.classList.remove('on'));
}

// ================= EXPOSE SEMUA HANDLER KE WINDOW =================
// Menjamin seluruh tombol HTML onclick="..." bekerja dengan sempurna
Object.assign(window, {
  openTransactionModal,
  closeTransactionModal,
  setTxFormType,
  setQuickAmount,
  handleSaveTransaction,
  confirmDeleteTransaction,
  openWalletModal,
  closeWalletModal,
  handleSaveWallet,
  openBudgetModal,
  closeBudgetModal,
  handleSaveBudget,
  openGoalModal,
  closeGoalModal,
  handleSaveGoal,
  addGoalAllocation,
  deleteGoal,
  openDebtModal,
  closeDebtModal,
  handleSaveDebt,
  toggleDebtPaid,
  deleteDebt,
  switchTab,
  setPeriodType,
  navigatePeriod,
  resetPeriodToToday,
  setCategoryChartMode,
  togglePrivacyMode,
  toggleTheme,
  exportTransactionsCSV,
  backupDataJSON,
  restoreDataJSON,
  confirmPopulateSampleData,
  confirmResetDemoData: confirmPopulateSampleData,
  confirmClearAllData,
  openConfirmModal,
  closeConfirmModal,
  confirmLogout,
  confirmDeleteAccount,
  toggleChangePasswordPanel,
  handleChangePassword,
  setAuthMode,
  togglePwVisibility,
  updatePasswordStrength: updatePasswordStrengthUI,
  handleLogin,
  handleRegister
});

// ================= INISIALISASI SAAT DOM SIAP =================
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  }

  initLivingUI();

  // Konfirmasi dialog modal tombol OK
  const confirmOkBtn = byId('confirm-ok-btn');
  if (confirmOkBtn) {
    confirmOkBtn.addEventListener('click', () => {
      if (typeof confirmCallback === 'function') confirmCallback();
      closeConfirmModal();
    });
  }

  // Filter input listeners
  ['filter-search', 'filter-type', 'filter-wallet', 'filter-category'].forEach(id => {
    byId(id)?.addEventListener('input', () => renderAll());
    byId(id)?.addEventListener('change', () => renderAll());
  });

  // Hapus tanda error saat user mengetik
  document.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('invalid')) {
      e.target.classList.remove('invalid');
    }
  });

  // Pulihkan sesi pengguna jika ada
  const user = restoreSession();
  if (user) {
    enterApp(user);
  } else {
    clearSession();
    showAuth('login');
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
});

