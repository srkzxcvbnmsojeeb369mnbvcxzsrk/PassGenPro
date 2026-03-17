// ═══════════════════════════════════════════════════════════════
// Netlify Serverless Function — AI Proxy + User Tracking
// ---------------------------------------------------------------
// AI Models:   DeepSeek + ChatGPT (OpenAI) + Google Gemini
// User DB:     Neon PostgreSQL (NETLIFY_DATABASE_URL)
//
// Routes:
//   POST /.netlify/functions/ai  → { prompt, model }         → AI response
//   POST /.netlify/functions/ai  → { action: 'saveUser', …}  → Save to DB
//
// Netlify Environment Variables:
//   DEEPSEEK_API_KEY     = sk-xxxxxxxx
//   OPENAI_API_KEY       = sk-proj-xxxxxxxx
//   GEMINI_API_KEY       = AIzaSy-xxxxxxxx
//   NETLIFY_DATABASE_URL = (auto-set by Neon integration)
// ═══════════════════════════════════════════════════════════════

const { neon } = require('@netlify/neon');

exports.handler = async function(event) {

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');

        // ══════════════════════════════════════════════════════
        // ROUTE 1: User Save → Neon Database
        // { action: 'saveUser', userId, name, email, picture, device }
        // ══════════════════════════════════════════════════════
        if (body.action === 'saveUser') {
            const { userId, name, email, picture, device } = body;

            if (!email) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Email required' })
                };
            }

            const sql = neon(process.env.NETLIFY_DATABASE_URL);

            // Table তৈরি করো যদি না থাকে
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

            // User আছে কিনা check করো
            const existing = await sql`
                SELECT id FROM users WHERE email = ${email}
            `;

            if (existing.length === 0) {
                // নতুন user — insert
                await sql`
                    INSERT INTO users (user_id, name, email, picture, device)
                    VALUES (${userId}, ${name}, ${email}, ${picture}, ${device || 'Unknown'})
                `;
            } else {
                // পুরানো user — update
                await sql`
                    UPDATE users
                    SET
                        name        = ${name},
                        picture     = ${picture},
                        device      = ${device || 'Unknown'},
                        last_seen   = NOW(),
                        login_count = login_count + 1
                    WHERE email = ${email}
                `;
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        // ══════════════════════════════════════════════════════
        // ROUTE 2: AI Password Generation
        // { prompt, model: 'deepseek' | 'gemini' | 'openai' }
        // ══════════════════════════════════════════════════════
        const { prompt, model } = body;

        if (!prompt) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'prompt is required' })
            };
        }

        const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
        const GEMINI_KEY   = process.env.GEMINI_API_KEY;
        const OPENAI_KEY   = process.env.OPENAI_API_KEY;

        let result;

        // ── Google Gemini ──────────────────────────────────────
        if (model === 'gemini') {
            if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set in Netlify Environment Variables');

            const res = await fetch(
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

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Gemini error ${res.status}: ${err}`);
            }

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            result = { content: text.trim(), tokens: 0, model: 'gemini' };

        // ── ChatGPT / OpenAI ───────────────────────────────────
        } else if (model === 'openai') {
            if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not set in Netlify Environment Variables');

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!res.ok) {
                const err = await res.text();
                if (res.status === 401) throw new Error('Invalid OpenAI API key');
                if (res.status === 429) throw new Error('OpenAI rate limit exceeded');
                throw new Error(`OpenAI error ${res.status}: ${err}`);
            }

            const data = await res.json();
            result = {
                content: data.choices?.[0]?.message?.content || '',
                tokens: data.usage?.total_tokens || 0,
                model: 'openai'
            };

        // ── DeepSeek (default) ─────────────────────────────────
        } else {
            if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not set in Netlify Environment Variables');

            const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!res.ok) {
                const err = await res.text();
                if (res.status === 401) throw new Error('Invalid DeepSeek API key');
                if (res.status === 429) throw new Error('DeepSeek rate limit exceeded');
                throw new Error(`DeepSeek error ${res.status}: ${err}`);
            }

            const data = await res.json();
            result = {
                content: data.choices?.[0]?.message?.content || '',
                tokens: data.usage?.total_tokens || 0,
                model: 'deepseek'
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('Function error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
