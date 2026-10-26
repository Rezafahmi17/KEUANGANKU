import pg from 'pg';

const rawPw = 'postgresql://postgres:Keuangan2026!@db.qrzrlqploxfnpxyzblhf.supabase.co:5432/postgres';
const encodedPw = encodeURIComponent(rawPw);
const connectionString = process.env.DATABASE_URL || ('postgresql://postgres.qrzrlqploxfnpxyzblhf:' + encodedPw + '@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres');

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Menghubungkan ke Supabase PostgreSQL cloud...');
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

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `;

  await pool.query(createTablesSql);
  console.log('✅ Migrasi tabel users dan user_states di Supabase Cloud BERHASIL!');

  const check = await pool.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
  `);
  console.log('Tabel di database public saat ini:', check.rows.map(r => r.table_name));

  await pool.end();
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
