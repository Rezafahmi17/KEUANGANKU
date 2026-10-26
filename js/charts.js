/**
 * FinTrack Pro — Modul Visualisasi Grafik (Chart.js)
 * Mengelola grafik tren arus kas (bar) & distribusi kategori (donut).
 */

import { formatRupiah } from './config.js';

let trendChartInstance = null;
let donutChartInstance = null;

function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function renderCashflowTrendChart(bounds, periodTxs, periodType, isPrivacyMode = false) {
  const ctx = document.getElementById('cashflowTrendChart');
  if (!ctx || typeof Chart === 'undefined') return;

  let labels = [];
  let incomeSeries = [];
  let expenseSeries = [];

  if (periodType === 'WEEKLY') {
    labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    incomeSeries = new Array(7).fill(0);
    expenseSeries = new Array(7).fill(0);

    periodTxs.forEach(tx => {
      const d = parseLocalDate(tx.date);
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const amt = Math.round(Number(tx.amount) || 0);
      const fee = Math.round(Number(tx.adminFee) || 0);
      if (tx.type === 'INCOME') incomeSeries[dayIdx] += amt;
      if (tx.type === 'EXPENSE') expenseSeries[dayIdx] += amt;
      if (tx.type === 'TRANSFER' && fee > 0) expenseSeries[dayIdx] += fee;
    });
  } else if (periodType === 'MONTHLY') {
    labels = ['Mgg 1 (1-7)', 'Mgg 2 (8-14)', 'Mgg 3 (15-21)', 'Mgg 4 (22-28)', 'Mgg 5 (29+)'];
    incomeSeries = new Array(5).fill(0);
    expenseSeries = new Array(5).fill(0);

    periodTxs.forEach(tx => {
      const d = parseLocalDate(tx.date);
      const weekIdx = Math.min(4, Math.floor((d.getDate() - 1) / 7));
      const amt = Math.round(Number(tx.amount) || 0);
      const fee = Math.round(Number(tx.adminFee) || 0);
      if (tx.type === 'INCOME') incomeSeries[weekIdx] += amt;
      if (tx.type === 'EXPENSE') expenseSeries[weekIdx] += amt;
      if (tx.type === 'TRANSFER' && fee > 0) expenseSeries[weekIdx] += fee;
    });
  } else {
    // YEARLY atau ALL -> 12 Bulan (Jan - Des)
    labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    incomeSeries = new Array(12).fill(0);
    expenseSeries = new Array(12).fill(0);

    periodTxs.forEach(tx => {
      const d = parseLocalDate(tx.date);
      const mIdx = d.getMonth();
      const amt = Math.round(Number(tx.amount) || 0);
      const fee = Math.round(Number(tx.adminFee) || 0);
      if (tx.type === 'INCOME') incomeSeries[mIdx] += amt;
      if (tx.type === 'EXPENSE') expenseSeries[mIdx] += amt;
      if (tx.type === 'TRANSFER' && fee > 0) expenseSeries[mIdx] += fee;
    });
  }

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(226, 232, 240, 0.8)';
  const tickColor = isDark ? '#94a3b8' : '#64748b';

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  trendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: incomeSeries,
          backgroundColor: '#10b981',
          borderRadius: 6,
          maxBarThickness: 28
        },
        {
          label: 'Pengeluaran',
          data: expenseSeries,
          backgroundColor: '#f43f5e',
          borderRadius: 6,
          maxBarThickness: 28
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatRupiah(context.raw, false, '', isPrivacyMode)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { size: 11, weight: '600' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            callback: (val) => {
              if (isPrivacyMode) return '•••';
              if (val >= 1000000) return `Rp${(val / 1000000).toFixed(1)}jt`;
              if (val >= 1000) return `Rp${(val / 1000).toFixed(0)}rb`;
              return `Rp${val}`;
            }
          }
        }
      }
    }
  });
}

export function renderCategoryBreakdown(periodTxs, categories, categoryChartMode = 'EXPENSE', isPrivacyMode = false) {
  const catTotals = {};
  let grandTotal = 0;

  const catMap = new Map((categories || []).map(c => [c.id, c]));

  periodTxs.forEach(tx => {
    if (categoryChartMode === 'EXPENSE') {
      if (tx.type === 'EXPENSE') {
        const amt = Math.round(Number(tx.amount) || 0);
        catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + amt;
        grandTotal += amt;
      } else if (tx.type === 'TRANSFER' && Number(tx.adminFee) > 0) {
        const fee = Math.round(Number(tx.adminFee) || 0);
        catTotals['cat_admin'] = (catTotals['cat_admin'] || 0) + fee;
        grandTotal += fee;
      }
    } else if (categoryChartMode === 'INCOME' && tx.type === 'INCOME') {
      const amt = Math.round(Number(tx.amount) || 0);
      catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + amt;
      grandTotal += amt;
    }
  });

  const sortedEntries = Object.entries(catTotals)
    .map(([catId, amount]) => {
      const cat = catMap.get(catId) || { id: catId, name: 'Lainnya', color: '#64748b' };
      const pct = grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0;
      return { ...cat, amount, pct };
    })
    .sort((a, b) => b.amount - a.amount);

  const centerLabelEl = document.getElementById('donut-center-label');
  const centerAmountEl = document.getElementById('donut-center-amount');
  if (centerLabelEl) centerLabelEl.textContent = categoryChartMode === 'EXPENSE' ? 'Total Keluar' : 'Total Masuk';
  if (centerAmountEl) centerAmountEl.textContent = formatRupiah(grandTotal, false, '', isPrivacyMode);

  // Update Donut Chart
  const ctx = document.getElementById('categoryDonutChart');
  if (ctx && typeof Chart !== 'undefined') {
    if (donutChartInstance) donutChartInstance.destroy();

    const hasData = sortedEntries.length > 0;
    donutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? sortedEntries.map(i => i.name) : ['Belum Ada Data'],
        datasets: [{
          data: hasData ? sortedEntries.map(i => i.amount) : [1],
          backgroundColor: hasData ? sortedEntries.map(i => i.color) : ['#cbd5e1'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: (context) => `${context.label}: ${formatRupiah(context.raw, false, '', isPrivacyMode)}`
            }
          }
        }
      }
    });
  }

  // Render Breakdown List
  const listContainer = document.getElementById('category-breakdown-list');
  if (!listContainer) return;

  if (sortedEntries.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center py-6 text-xs text-slate-400">
        Belum ada transaksi ${categoryChartMode === 'EXPENSE' ? 'pengeluaran' : 'pemasukan'} pada periode ini.
      </div>
    `;
    return;
  }

  listContainer.innerHTML = sortedEntries.map(item => `
    <div class="space-y-1">
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${item.color}"></span>
          <span class="font-semibold text-slate-700 dark:text-slate-200 truncate">${item.name}</span>
        </div>
        <div class="flex items-center gap-2.5 shrink-0 tabular-nums">
          <span class="font-bold text-slate-900 dark:text-white">${formatRupiah(item.amount, false, '', isPrivacyMode)}</span>
          <span class="text-slate-400 font-semibold text-[11px] w-8 text-right">${item.pct}%</span>
        </div>
      </div>
      <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-500" style="width: ${item.pct}%; background-color: ${item.color}"></div>
      </div>
    </div>
  `).join('');
}
