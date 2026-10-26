/**
 * FinTrack Pro — Konfigurasi, Konstanta, Formatter & State Templates
 */

export const STORAGE_PREFIX = 'FINTRACK_DATA_V2';
export const USERS_KEY = 'FINTRACK_USERS_V1';
export const SESSION_KEY = 'FINTRACK_SESSION_V1';
export const THEME_KEY = 'FINTRACK_THEME';

// Formatter Mata Uang Rupiah (Integer Murni)
export const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

// Master Kategori Default
export const DEFAULT_CATEGORIES = [
  // Pengeluaran
  { id: 'cat_food', name: 'Makan & Minuman', type: 'EXPENSE', color: '#f43f5e', icon: 'utensils' },
  { id: 'cat_transport', name: 'Transportasi & BBM', type: 'EXPENSE', color: '#f59e0b', icon: 'car' },
  { id: 'cat_bills', name: 'Tagihan, Listrik & Internet', type: 'EXPENSE', color: '#3b82f6', icon: 'zap' },
  { id: 'cat_shopping', name: 'Belanja Kebutuhan', type: 'EXPENSE', color: '#8b5cf6', icon: 'shopping-bag' },
  { id: 'cat_entertainment', name: 'Hiburan & Langganan', type: 'EXPENSE', color: '#ec4899', icon: 'film' },
  { id: 'cat_health', name: 'Kesehatan & Olahraga', type: 'EXPENSE', color: '#14b8a6', icon: 'heart-pulse' },
  { id: 'cat_admin', name: 'Biaya Admin & Transfer', type: 'EXPENSE', color: '#64748b', icon: 'receipt' },
  // Pemasukan
  { id: 'cat_salary', name: 'Gaji & Tunjangan', type: 'INCOME', color: '#10b981', icon: 'briefcase' },
  { id: 'cat_freelance', name: 'Proyek & Freelance', type: 'INCOME', color: '#06b6d4', icon: 'laptop' },
  { id: 'cat_invest', name: 'Dividen & Investasi', type: 'INCOME', color: '#6366f1', icon: 'trending-up' },
  { id: 'cat_other_in', name: 'Pemasukan Lainnya', type: 'INCOME', color: '#84cc16', icon: 'sparkles' }
];

// Helper pembuat tanggal YYYY-MM-DD relatif terhadap hari ini
export function getRelativeDateStr(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getMonthDateStr(monthsOffset = 0, dayOfMonth = 5) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsOffset);
  d.setDate(Math.min(dayOfMonth, 28));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// State Awal Bersih untuk Akun Baru (Saldo Rp 0, 0 transaksi)
export function createBlankState() {
  return {
    wallets: [
      { id: 'w_utama', name: 'Dompet Utama', type: 'Uang Tunai', initialBalance: 0, color: '#f59e0b' },
      { id: 'w_bank', name: 'Rekening Bank', type: 'Rekening Bank', initialBalance: 0, color: '#4f46e5' }
    ],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    budgets: {},
    transactions: [],
    goals: [],
    debts: []
  };
}

// State Simulasi / Data Contoh (Opsional, hanya jika pengguna meminta di Pengaturan)
export function createSampleState() {
  return {
    wallets: [
      { id: 'w_bca', name: 'BCA Tahapan', type: 'Rekening Bank', initialBalance: 8500000, color: '#4f46e5' },
      { id: 'w_mandiri', name: 'Bank Mandiri', type: 'Rekening Bank', initialBalance: 4200000, color: '#0284c7' },
      { id: 'w_gopay', name: 'GoPay / QRIS', type: 'E-Wallet', initialBalance: 650000, color: '#10b981' },
      { id: 'w_cash', name: 'Dompet Tunai', type: 'Uang Tunai', initialBalance: 450000, color: '#f59e0b' }
    ],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    budgets: {
      cat_food: 2500000,
      cat_transport: 1000000,
      cat_bills: 1500000,
      cat_shopping: 1500000,
      cat_entertainment: 600000,
      cat_health: 500000
    },
    transactions: [
      { id: 'tx_1', type: 'INCOME', amount: 12500000, date: getMonthDateStr(0, 1), walletId: 'w_bca', categoryId: 'cat_salary', note: 'Gaji Bulanan & Tunjangan Kinerja' },
      { id: 'tx_2', type: 'INCOME', amount: 2750000, date: getRelativeDateStr(-3), walletId: 'w_mandiri', categoryId: 'cat_freelance', note: 'Pelunasan Proyek Desain UI/UX' },
      { id: 'tx_3', type: 'EXPENSE', amount: 685000, date: getRelativeDateStr(-5), walletId: 'w_bca', categoryId: 'cat_bills', note: 'Tagihan Internet & Listrik PLN' },
      { id: 'tx_4', type: 'EXPENSE', amount: 420000, date: getRelativeDateStr(-4), walletId: 'w_bca', categoryId: 'cat_shopping', note: 'Belanja Bulanan Supermarket' },
      { id: 'tx_5', type: 'TRANSFER', amount: 500000, adminFee: 1000, date: getRelativeDateStr(-3), walletId: 'w_bca', toWalletId: 'w_gopay', categoryId: 'cat_admin', note: 'Top Up Saldo GoPay untuk QRIS' },
      { id: 'tx_6', type: 'EXPENSE', amount: 65000, date: getRelativeDateStr(-2), walletId: 'w_gopay', categoryId: 'cat_food', note: 'Makan Siang & Es Teh' },
      { id: 'tx_7', type: 'EXPENSE', amount: 150000, date: getRelativeDateStr(-1), walletId: 'w_mandiri', categoryId: 'cat_transport', note: 'Isi BBM Kendaraan' },
      { id: 'tx_8', type: 'EXPENSE', amount: 48000, date: getRelativeDateStr(0), walletId: 'w_gopay', categoryId: 'cat_food', note: 'Kopi Susu & Snack' },
      { id: 'tx_9', type: 'EXPENSE', amount: 186000, date: getRelativeDateStr(-6), walletId: 'w_bca', categoryId: 'cat_entertainment', note: 'Langganan Streaming Musik & Film' },
      { id: 'tx_10', type: 'EXPENSE', amount: 35000, date: getRelativeDateStr(0), walletId: 'w_cash', categoryId: 'cat_food', note: 'Sarapan Pagi & Parkir' },
      // Bulan Lalu
      { id: 'tx_11', type: 'INCOME', amount: 12500000, date: getMonthDateStr(-1, 1), walletId: 'w_bca', categoryId: 'cat_salary', note: 'Gaji Bulanan Periode Lalu' },
      { id: 'tx_12', type: 'INCOME', amount: 1500000, date: getMonthDateStr(-1, 14), walletId: 'w_mandiri', categoryId: 'cat_invest', note: 'Kupon Investasi SBN' },
      { id: 'tx_13', type: 'EXPENSE', amount: 1950000, date: getMonthDateStr(-1, 10), walletId: 'w_bca', categoryId: 'cat_food', note: 'Katering Sehat & Makan Keluarga' },
      { id: 'tx_14', type: 'EXPENSE', amount: 720000, date: getMonthDateStr(-1, 12), walletId: 'w_bca', categoryId: 'cat_bills', note: 'Listrik, PDAM & Internet' },
      { id: 'tx_15', type: 'EXPENSE', amount: 980000, date: getMonthDateStr(-1, 19), walletId: 'w_mandiri', categoryId: 'cat_shopping', note: 'Sepatu Lari & Perlengkapan' }
    ],
    goals: [
      { id: 'g_1', name: 'Dana Darurat (6x Pengeluaran)', targetAmount: 30000000, currentAmount: 18500000, deadline: getMonthDateStr(5, 28) },
      { id: 'g_2', name: 'Upgrade Laptop Kerja', targetAmount: 18000000, currentAmount: 11250000, deadline: getMonthDateStr(3, 15) }
    ],
    debts: [
      { id: 'd_1', type: 'PIUTANG', person: 'Talangan Tiket Futsal & Makan', amount: 225000, dueDate: getRelativeDateStr(4), isPaid: false },
      { id: 'd_2', type: 'UTANG', person: 'Cicilan Monitor Kerja (Bulan 4/6)', amount: 450000, dueDate: getRelativeDateStr(9), isPaid: false }
    ]
  };
}

// Format Rupiah (dengan perbaikan tanda +/- untuk Pengeluaran dan Pemasukan)
export function formatRupiah(amount, showPlusMinus = false, type = '', isPrivacy = false) {
  const cleanInt = Math.round(Number(amount) || 0);
  if (isPrivacy) {
    return 'Rp ••••••••';
  }
  const formatted = idrFormatter.format(Math.abs(cleanInt));
  if (!showPlusMinus) {
    return cleanInt < 0 ? `-${formatted}` : formatted;
  }
  // Aturan tanda eksplisit: Pengeluaran selalu minus (-), Pemasukan plus (+)
  if (type === 'EXPENSE') return `-${formatted}`;
  if (type === 'INCOME') return `+${formatted}`;
  return cleanInt < 0 ? `-${formatted}` : `+${formatted}`;
}
