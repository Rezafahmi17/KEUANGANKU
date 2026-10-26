import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fintrack_pro_jwt_secret_key_2026';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/keuanganku';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper untuk mendapatkan IP Wi-Fi lokal komputer
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

let pool;

// Inisialisasi Database PostgreSQL & Migrasi Tabel Otomatis
export async function initDatabase() {
  const isCloudDb = DATABASE_URL.includes('supabase.com') || DATABASE_URL.includes('pooler') || DATABASE_URL.includes('sslmode=require');

  // Hubungkan ke database target
  if (!pool) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: isCloudDb ? { rejectUnauthorized: false } : false
    });
  }

  // Buat tabel users dan user_states jika belum ada
  const createTablesSql = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_states (
      user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createTablesSql);
  console.log('[PostgreSQL] Tabel users & user_states siap digunakan!');
  return pool;
}

// Middleware Autentikasi JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Sesi tidak ditemukan. Silakan login kembali.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Sesi login telah kedaluwarsa. Silakan login kembali.' });
    }
    req.user = decoded;
    next();
  });
}

// State Default Bersih (Rp 0) untuk Akun Baru
function createBlankState() {
  return {
    wallets: [
      { id: 'w_utama', name: 'Dompet Utama', type: 'Uang Tunai', initialBalance: 0, color: '#f59e0b' },
      { id: 'w_bank', name: 'Rekening Bank', type: 'Rekening Bank', initialBalance: 0, color: '#4f46e5' }
    ],
    categories: [
      { id: 'cat_food', name: 'Makan & Minuman', type: 'EXPENSE', color: '#f43f5e', icon: 'utensils' },
      { id: 'cat_transport', name: 'Transportasi & BBM', type: 'EXPENSE', color: '#f59e0b', icon: 'car' },
      { id: 'cat_bills', name: 'Tagihan, Listrik & Internet', type: 'EXPENSE', color: '#3b82f6', icon: 'zap' },
      { id: 'cat_shopping', name: 'Belanja Kebutuhan', type: 'EXPENSE', color: '#8b5cf6', icon: 'shopping-bag' },
      { id: 'cat_entertainment', name: 'Hiburan & Langganan', type: 'EXPENSE', color: '#ec4899', icon: 'film' },
      { id: 'cat_health', name: 'Kesehatan & Olahraga', type: 'EXPENSE', color: '#14b8a6', icon: 'heart-pulse' },
      { id: 'cat_admin', name: 'Biaya Admin & Transfer', type: 'EXPENSE', color: '#64748b', icon: 'receipt' },
      { id: 'cat_salary', name: 'Gaji & Tunjangan', type: 'INCOME', color: '#10b981', icon: 'briefcase' },
      { id: 'cat_freelance', name: 'Proyek & Freelance', type: 'INCOME', color: '#06b6d4', icon: 'laptop' },
      { id: 'cat_invest', name: 'Dividen & Investasi', type: 'INCOME', color: '#6366f1', icon: 'trending-up' },
      { id: 'cat_other_in', name: 'Pemasukan Lainnya', type: 'INCOME', color: '#84cc16', icon: 'sparkles' }
    ],
    budgets: {},
    transactions: [],
    goals: [],
    debts: []
  };
}

// ================= API ENDPOINTS =================

// 1. Registrasi Akun Baru
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim().replace(/\s+/g, ' ');

    // Cek apakah email sudah terdaftar
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ success: false, message: 'Alamat email ini sudah terdaftar. Silakan masuk.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'u_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

    // Simpan data pengguna
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [userId, cleanName, cleanEmail, passwordHash]
    );

    // Inisialisasi data keuangan bersih (Rp 0) di PostgreSQL
    const initialState = createBlankState();
    await pool.query(
      `INSERT INTO user_states (user_id, state_data, updated_at) VALUES ($1, $2, NOW())`,
      [userId, initialState]
    );

    const token = jwt.sign({ id: userId, name: cleanName, email: cleanEmail }, JWT_SECRET, { expiresIn: '90d' });

    res.json({
      success: true,
      user: { id: userId, name: cleanName, email: cleanEmail },
      token
    });
  } catch (err) {
    console.error('Error register:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat akun: ' + err.message });
  }
});

// 2. Login Akun
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, message: 'Email atau password yang Anda masukkan salah.' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Email atau password yang Anda masukkan salah.' });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '90d' });

    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
      token
    });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses login: ' + err.message });
  }
});

// 3. Verifikasi Sesi Aktif
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Ubah Password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });

    const match = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Password saat ini yang Anda masukkan salah.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    res.json({ success: true, message: 'Password berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Hapus Akun
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Akun berhasil dihapus permanen.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Ambil Data Keuangan Pengguna
app.get('/api/state', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT state_data FROM user_states WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rowCount === 0) {
      const blank = createBlankState();
      await pool.query(
        'INSERT INTO user_states (user_id, state_data, updated_at) VALUES ($1, $2, NOW())',
        [req.user.id, blank]
      );
      return res.json({ success: true, data: blank });
    }

    res.json({ success: true, data: result.rows[0].state_data });
  } catch (err) {
    console.error('Error load state:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Simpan Pembaruan Data Keuangan Pengguna
app.put('/api/state', authenticateToken, async (req, res) => {
  try {
    const state = req.body;
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ success: false, message: 'Format data tidak valid.' });
    }

    await pool.query(
      `INSERT INTO user_states (user_id, state_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET state_data = $2, updated_at = NOW()`,
      [req.user.id, state]
    );

    res.json({ success: true, message: 'Data berhasil disimpan ke PostgreSQL.' });
  } catch (err) {
    console.error('Error save state:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Cek Status Server & Database
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    database: 'PostgreSQL',
    version: '13',
    time: new Date().toISOString()
  });
});

// Layani file statis frontend (dist atau direktori saat ini)
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname));

// Fallback route untuk SPA
app.use((req, res) => {
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(distIndex, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

// Jalankan Server (hanya saat running secara lokal / bukan serverless function)
async function startServer() {
  try {
    await initDatabase();
    const localIp = getLocalNetworkIp();

    app.listen(PORT, '0.0.0.0', () => {
      console.log('====================================================');
      console.log('🚀 FinTrack Pro Server (PostgreSQL) Berhasil Aktif!');
      console.log(`💻 Buka di Laptop:  http://localhost:${PORT}`);
      console.log(`📱 Buka di HP (Wi-Fi): http://${localIp}:${PORT}`);
      console.log('🐘 Database:       PostgreSQL (Supabase Cloud)');
      console.log('====================================================');
    });
  } catch (err) {
    console.error('❌ Gagal menjalankan server:', err);
  }
}

if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
