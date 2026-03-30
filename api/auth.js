import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT,
      provider TEXT DEFAULT 'email',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'email';
  `);
}

function makeSession(userId, email) {
  return Buffer.from(JSON.stringify({ userId, email, ts: Date.now() })).toString('base64');
}

function parseSession(cookie) {
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString('utf8')); }
  catch { return null; }
}

function setCookie(res, value, maxAge = 60*60*24*7) {
  res.setHeader('Set-Cookie',
    `session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`);
}

function getCookie(req, key) {
  const h = req.headers.cookie || '';
  const m = h.split(';').find(c => c.trim().startsWith(key + '='));
  return m ? m.trim().split('=')[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const { action } = req.query;

  if (req.method === 'GET' && action === 'me') {
    const raw = getCookie(req, 'session');
    if (!raw) return res.status(401).json({ error: 'Not logged in' });
    const session = parseSession(raw);
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    const { rows } = await pool.query(
      'SELECT id, email, name, provider FROM users WHERE id = $1', [session.userId]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    return res.status(200).json({ user: rows[0] });
  }

  if (req.method === 'POST' && action === 'signup') {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email ও Password দিন' });
    if (password.length < 6) return res.status(400).json({ error: 'Password কমপক্ষে ৬ অক্ষর' });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'এই Email এ account আছে' });
    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, provider)
       VALUES ($1,$2,$3,'email') RETURNING id, email, name`,
      [email.toLowerCase(), name || email.split('@')[0], password_hash]);
    setCookie(res, makeSession(rows[0].id, rows[0].email));
    return res.status(201).json({ success: true, user: rows[0] });
  }

  if (req.method === 'POST' && action === 'login') {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email ও Password দিন' });
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.status(404).json({ error: 'Email পাওয়া যায়নি' });
    const user = rows[0];
    if (!user.password_hash) return res.status(400).json({ error: 'Google দিয়ে login করুন' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Password ভুল' });
    setCookie(res, makeSession(user.id, user.email));
    return res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  }

  if (req.method === 'POST' && action === 'logout') {
    setCookie(res, '', 0);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
