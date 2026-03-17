// ═══════════════════════════════════════════════════════════════
// Vercel Serverless Function — AI Proxy + User Tracking
// ---------------------------------------------------------------
// Routes:
//   POST /api/ai → { prompt, model }         → AI response
//   POST /api/ai → { action: 'saveUser', …}  → Save to Neon DB
//
// Vercel Environment Variables:
//   DEEPSEEK_API_KEY  = sk-xxxxxxxx
//   OPENAI_API_KEY    = sk-proj-xxxxxxxx
//   GEMINI_API_KEY    = AIzaSy-xxxxxxxx
//   POSTGRES_URL      = (auto-set by Neon in Vercel)
// ═══════════════════════════════════════════════════════════════

import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const body = req.body;

        // ══════════════════════════════════════════════════════
        // ROUTE 1: User Save → Neon Database
        // ══════════════════════════════════════════════════════
        if (body.action === 'saveUser') {
            const { userId, name, email, picture, device } = body;
            if (!email) return res.status(400).json({ error: 'Email required' });

            const sql = neon(process.env.POSTGRES_URL);

            await sql`
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
            `;

            const existing = await sql`SELECT id FROM users WHERE email = ${email}`;

            if (existing.length === 0) {
                await sql`
                    INSERT INTO users (user_id, name, email, picture, device)
                    VALUES (${userId}, ${name}, ${email}, ${picture}, ${device || 'Unknown'})
                `;
            } else {
                await sql`
                    UPDATE users
                    SET name = ${name}, picture = ${picture},
                        device = ${device || 'Unknown'},
                        last_seen = NOW(), login_count = login_count + 1
                    WHERE email = ${email}
                `;
            }

            return res.status(200).json({ success: true });
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

        if (model === 'gemini') {
            if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { temperature: 0.7, maxOutputTokens: 500 } }) }
            );
            if (!r.ok) throw new Error(`Gemini error ${r.status}`);
            const d = await r.json();
            result = { content: d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '', tokens: 0, model: 'gemini' };

        } else if (model === 'openai') {
            if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not set');
            const r = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
                body: JSON.stringify({ model: 'gpt-4o-mini',
                    messages: [{ role: 'system', content: 'Be concise.' }, { role: 'user', content: prompt }],
                    max_tokens: 500, temperature: 0.7 })
            });
            if (!r.ok) throw new Error(r.status === 401 ? 'Invalid OpenAI key' : r.status === 429 ? 'Rate limit' : `OpenAI error ${r.status}`);
            const d = await r.json();
            result = { content: d.choices?.[0]?.message?.content || '', tokens: d.usage?.total_tokens || 0, model: 'openai' };

        } else {
            if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not set');
            const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
                body: JSON.stringify({ model: 'deepseek-chat',
                    messages: [{ role: 'system', content: 'Be concise.' }, { role: 'user', content: prompt }],
                    max_tokens: 500, temperature: 0.7 })
            });
            if (!r.ok) throw new Error(r.status === 401 ? 'Invalid DeepSeek key' : r.status === 429 ? 'Rate limit' : `DeepSeek error ${r.status}`);
            const d = await r.json();
            result = { content: d.choices?.[0]?.message?.content || '', tokens: d.usage?.total_tokens || 0, model: 'deepseek' };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('API error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
