import type { VercelRequest, VercelResponse } from '@vercel/node';

/* ═══════════════════════════════════════════════════════════════
   XCron AI — Audio Transcription (Vercel Serverless)
   
   POST /api/transcribe
   Body: { audio: string (base64), mimeType: string }
   Returns: { text: string }
   ═══════════════════════════════════════════════════════════════ */

const GEMINI_MODEL = 'gemini-2.5-flash';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
        const { audio, mimeType } = req.body;
        if (!audio || !mimeType) {
            return res.status(400).json({ error: 'Missing audio or mimeType' });
        }

        // 🔒 Security: limit audio size (max 1MB base64 ≈ ~750KB audio)
        if (audio.length > 1_400_000) {
            return res.status(413).json({ error: 'Audio too large (max 30 seconds)' });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: audio,
                            },
                        },
                        {
                            text: 'Transcribe this audio exactly as spoken. Return ONLY the transcribed text, nothing else. If you cannot understand the audio or it is silent, return an empty string.',
                        },
                    ],
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500,
                },
            }),
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error('Gemini transcription error:', geminiRes.status, errText);
            return res.status(502).json({ error: 'Transcription failed', details: geminiRes.status });
        }

        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        return res.status(200).json({ text });
    } catch (err) {
        console.error('Transcribe API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
