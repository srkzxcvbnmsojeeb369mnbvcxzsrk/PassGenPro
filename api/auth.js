import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Allowed email providers
const ALLOWED_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.co.uk', 'proton.me', 'protonmail.com', 'pm.me'];

function isAllowedEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT,
      provider TEXT DEFAULT 'email',
      is_verified BOOLEAN DEFAULT FALSE,
      verify_token TEXT,
      verify_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'email';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;
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

async function sendVerifyEmail(email, name, token) {
  const url = `https://sojib.iam.bd/api/auth?action=verify&token=${token}`;
  await transporter.sendMail({
    from: `"PassGen Pro" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'PassGen Pro — Email Verify করুন',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f1a;color:#fff;border-radius:16px;padding:32px;">
        <h2 style="color:#667eea;margin-bottom:8px;">PassGen Pro</h2>
        <p>হ্যালো <b>${name}</b>! 👋</p>
        <p>আপনার account verify করতে নিচের button এ click করুন:</p>
        <a href="${url}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;">
          ✅ Email Verify করুন
        </a>
        <p style="color:#888;font-size:12px;">এই link ২৪ ঘন্টা valid। আপনি signup না করলে ignore করুন।</p>
      </div>
    `,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const { action, token } = req.query;

  // ── GET /api/auth?action=me ──────────────────────────
  if (req.method === 'GET' && action === 'me') {
    const raw = getCookie(req, 'session');
    if (!raw) return res.status(401).json({ error: 'Not logged in' });
    const session = parseSession(raw);
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    const { rows } = await pool.query(
      'SELECT id, email, name, provider, is_verified FROM users WHERE id = $1', [session.userId]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    return res.status(200).json({ user: rows[0] });
  }

  // ── GET /api/auth?action=verify&token=... ────────────
  if (req.method === 'GET' && action === 'verify') {
    if (!token) return res.status(400).send('Invalid link');
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE verify_token = $1 AND verify_expires > NOW()', [token]);
    if (!rows.length) {
      return res.status(400).send(`
        <html><body style="background:#0f0f1a;color:#fff;font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#ef4444">❌ Link expired বা invalid</h2>
        <p>আবার signup করুন।</p>
        <a href="https://sojib.iam.bd" style="color:#667eea">← Back to app</a>
        </body></html>
      `);
    }
    await pool.query(
      'UPDATE users SET is_verified=TRUE, verify_token=NULL, verify_expires=NULL WHERE id=$1',
      [rows[0].id]);
    return res.status(200).send(`
      <html><body style="background:#0f0f1a;color:#fff;font-family:sans-serif;text-align:center;padding:60px">
      <h2 style="color:#4ade80">✅ Email Verified!</h2>
      <p>আপনার account verify হয়েছে। এখন login করুন।</p>
      <a href="https://sojib.iam.bd" style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;">
        → App এ যান
      </a>
      </body></html>
    `);
  }

  // ── POST /api/auth?action=signup ─────────────────────
  if (req.method === 'POST' && action === 'signup') {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email ও Password দিন' });
    if (password.length < 6) return res.status(400).json({ error: 'Password কমপক্ষে ৬ অক্ষর' });

    if (!isAllowedEmail(email)) {
      return res.status(400).json({ error: 'শুধু Gmail, Yahoo, বা Proton email দিয়ে signup করুন' });
    }

    const existing = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      if (!existing.rows[0].is_verified) {
        return res.status(409).json({ error: 'এই Email এ account আছে কিন্তু verify হয়নি। Email চেক করুন।' });
      }
      return res.status(409).json({ error: 'এই Email এ account আছে' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verify_token = crypto.randomBytes(32).toString('hex');
    const verify_expires = new Date(Date.now() + 24*60*60*1000);
    const displayName = name || email.split('@')[0];

    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, provider, is_verified, verify_token, verify_expires)
       VALUES ($1,$2,$3,'email',FALSE,$4,$5) RETURNING id, email, name`,
      [email.toLowerCase(), displayName, password_hash, verify_token, verify_expires]);

    await sendVerifyEmail(email.toLowerCase(), displayName, verify_token);

    return res.status(201).json({
      success: true,
      message: `✅ Verification email পাঠানো হয়েছে ${email} এ। Email check করুন।`,
      needsVerify: true,
    });
  }

  // ── POST /api/auth?action=login ──────────────────────
  if (req.method === 'POST' && action === 'login') {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email ও Password দিন' });

    if (!isAllowedEmail(email)) {
      return res.status(400).json({ error: 'শুধু Gmail, Yahoo, বা Proton email দিয়ে login করুন' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.status(404).json({ error: 'Email পাওয়া যায়নি' });

    const user = rows[0];
    if (!user.password_hash) return res.status(400).json({ error: 'Google দিয়ে login করুন' });
    if (!user.is_verified) return res.status(403).json({ error: 'Email verify করুন। Inbox চেক করুন।' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Password ভুল' });

    setCookie(res, makeSession(user.id, user.email));
    return res.status(200).json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  }

  // ── POST /api/auth?action=logout ─────────────────────
  if (req.method === 'POST' && action === 'logout') {
    setCookie(res, '', 0);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
