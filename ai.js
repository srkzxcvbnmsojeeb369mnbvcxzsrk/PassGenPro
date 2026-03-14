// ═══════════════════════════════════════════════════════════════
// Netlify Serverless Function — AI Secure Proxy
// DeepSeek + ChatGPT (OpenAI) + Google Gemini
//
// API keys Netlify Environment Variables এ রাখো:
//   DEEPSEEK_API_KEY = sk-xxxxxxxx
//   OPENAI_API_KEY   = sk-proj-xxxxxxxx
//   GEMINI_API_KEY   = AIzaSy-xxxxxxxx
// ═══════════════════════════════════════════════════════════════

exports.handler = async function(event) {

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { prompt, model } = JSON.parse(event.body || '{}');

        if (!prompt) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'prompt is required' }) };
        }

        // Keys from Netlify Environment Variables — never exposed to browser
        const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
        const GEMINI_KEY   = process.env.GEMINI_API_KEY;
        const OPENAI_KEY   = process.env.OPENAI_API_KEY;

        let result;

        // ── Google Gemini ────────────────────────────────────────
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

        // ── ChatGPT / OpenAI ─────────────────────────────────────
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

        // ── DeepSeek (default) ───────────────────────────────────
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

        return { statusCode: 200, headers, body: JSON.stringify(result) };

    } catch (error) {
        console.error('AI proxy error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
