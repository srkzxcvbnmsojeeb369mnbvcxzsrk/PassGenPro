// ═══════════════════════════════════════════════════════════════
// Vercel Serverless Function — AI Proxy + User Tracking
// User DB: Neon via pg (POSTGRES_URL)
// ═══════════════════════════════════════════════════════════════

const { Pool } = require('pg');

module.exports = async function handler(req, res) {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // ══════════════════════════════════════════════════════
        // ROUTE 1: User Save → Neon Database
        // ══════════════════════════════════════════════════════
        if (body.action === 'saveUser') {
            const { userId, name, email, picture, device } = body;

            if (!email) return res.status(400).json({ error: 'Email required' });

            const pool = new Pool({
                connectionString: process.env.POSTGRES_URL,
                ssl: { rejectUnauthorized: false }
            });

            try {
                // Table তৈরি করো
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS users (
                        id          SERIAL PRIMARY KEY,
                        user_id     TEXT UNIQUE,
                        name        TEXT,
                        email       TEXT UNIQUE,
                        picture     TEXT,
                        device      TEXT,
                        first_login TIMESTAMP DEFAULT NOW(),
                        last_seen   TIMESTAMP DEFAULT NOW(),
                        login_count INTEGER DEFAULT 1
                    )
                `);

                // User আছে কিনা check
                const check = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

                if (check.rows.length === 0) {
                    await pool.query(
                        'INSERT INTO users (user_id, name, email, picture, device) VALUES ($1, $2, $3, $4, $5)',
                        [userId, name, email, picture, device || 'Unknown']
                    );
                } else {
                    await pool.query(
                        'UPDATE users SET name=$1, picture=$2, device=$3, last_seen=NOW(), login_count=login_count+1 WHERE email=$4',
                        [name, picture, device || 'Unknown', email]
                    );
                }

                await pool.end();
                return res.status(200).json({ success: true });

            } catch (dbErr) {
                await pool.end().catch(() => {});
                throw dbErr;
            }
        }

        // ══════════════════════════════════════════════════════
        // ROUTE 2: AI Password Generation
        // ══════════════════════════════════════════════════════
        const { prompt, model } = body;
        if (!prompt) return res.status(400).json({ error: 'prompt is required' });

        const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
        const GEMINI_KEY   = process.env.GEMINI_API_KEY;
        const OPENAI_KEY   = process.env.OPENAI_API_KEY;

        let result;

        // ── Google Gemini ──────────────────────────────────────
        if (model === 'gemini') {
            if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
                    })
                }
            );
            if (!r.ok) throw new Error(`Gemini error ${r.status}: ${await r.text()}`);
            const d = await r.json();
            result = { content: d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '', model: 'gemini' };

        // ── ChatGPT / OpenAI ───────────────────────────────────
        } else if (model === 'openai') {
            if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not set');
            const r = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 500, temperature: 0.7
                })
            });
            if (!r.ok) {
                if (r.status === 401) throw new Error('Invalid OpenAI API key');
                if (r.status === 429) throw new Error('OpenAI rate limit exceeded');
                throw new Error(`OpenAI error ${r.status}`);
            }
            const d = await r.json();
            result = { content: d.choices?.[0]?.message?.content || '', tokens: d.usage?.total_tokens || 0, model: 'openai' };

        // ── DeepSeek (default) ─────────────────────────────────
        } else {
            if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not set');
            const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 500, temperature: 0.7
                })
            });
            if (!r.ok) {
                if (r.status === 401) throw new Error('Invalid DeepSeek API key');
                if (r.status === 429) throw new Error('DeepSeek rate limit exceeded');
                throw new Error(`DeepSeek error ${r.status}`);
            }
            const d = await r.json();
            result = { content: d.choices?.[0]?.message?.content || '', tokens: d.usage?.total_tokens || 0, model: 'deepseek' };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Function error:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
