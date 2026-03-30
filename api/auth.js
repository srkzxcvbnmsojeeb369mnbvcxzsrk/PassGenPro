import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Allowed email domains ──────────────────────────────────
const ALLOWED_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'proton.me', 'protonmail.com', 'protonmail.ch'];

function isAllowedEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

// ── Gmail transporter ──────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// ── DB setup ───────────────────────────────────────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT,
      provider TEXT DEFAULT 'email',
      verified BOOLEAN DEFAULT FALSE,
      verify_token TEXT,
      verify_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'email';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;
  `);
}

// ── Session helpers ────────────────────────────────────────
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

// ── Send verification email ────────────────────────────────
async function sendVerifyEmail(email, name, token) {
  const url = `https://sojib.iam.bd/api/auth?action=verify&token=${token}`;
  await transporter.sendMail({
    from: `"PassGen Pro" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '✅ PassGen Pro — Email Verify করুন',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f1a;color:#fff;border-radius:16px;padding:32px;">
        <h2 style="color:#667eea;margin:0 0 8px">PassGen Pro</h2>
        <p style="color:#aaa;margin:0 0 24px">Powered by Sojeeb</p>
        <p>হ্যালো <strong>${name}</strong>,</p>
        <p>আপনার account verify করতে নিচের button এ click করুন:</p>
        <a href="${url}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:50px;text-decoration:none;font-weight:bold;margin:16px 0;">
          ✅ Email Verify করুন
        </a>
        <p style="color:#666;font-size:12px;margin-top:24px;">এই link ২৪ ঘন্টা valid। আপনি signup না করলে ignore করুন।</p>
      </div>
    `,
  });
}

// ── Main handler ───────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const { action } = req.query;

  // ── GET /api/auth?action=me ──────────────────────────────
  if (req.method === 'GET' && action === 'me') {
    const raw = getCookie(req, 'session');
    if (!raw) return res.status(401).json({ error: 'Not logged in' });
    const session = parseSession(raw);
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    const { rows } = await pool.query(
      'SELECT id, email, name, provider, verified FROM users WHERE id = $1',
      [session.userId]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    return res.status(200).json({ user: rows[0] });
  }

  // ── GET /api/auth?action=verify&token=xxx ────────────────
  if (req.method === 'GET' && action === 'verify') {
    const { token } = req.query;
    if (!token) return res.status(400).send('Invalid link');
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE verify_token = $1 AND verify_expires > NOW()`,
      [token]);
    if (!rows.length) return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f0f1a;color:#fff">
        <h2 style="color:#ff4d4d">❌ Link expired বা invalid</h2>
        <p>নতুন করে signup করুন।</p>
        <a href="https://sojib.iam.bd" style="color:#667eea">← ফিরে যান</a>
      </body></html>`);
    await pool.query(
      'UPDATE users SET verified=TRUE, verify_token=NULL, verify_expires=NULL WHERE id=$1',
      [rows[0].id]);
    return res.status(200).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f0f1a;color:#fff">
        <h2 style="color:#4dff88">✅ Email Verify সফল!</h2>
        <p>এখন login করুন।</p>
        <a href="https://sojib.iam.bd" style="display:inline-block;padding:12px 28px;background:linear-gradien
