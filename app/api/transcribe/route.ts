import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 15;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return false;
  }
  if (record.count >= MAX_REQUESTS) return true;
  record.count++;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) return NextResponse.json({ error: 'Rate Limit' }, { status: 429 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'audio file missing' }, { status: 400 });

  try {
    // ۱. رونویسی
    const upstream = new FormData();
    upstream.append('file', file, 'chunk.wav');
    upstream.append('model', 'whisper-large-v3');
    upstream.append('language', 'fa'); 
    upstream.append('response_format', 'json');
    upstream.append('temperature', '0');

    const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!sttRes.ok) throw new Error(`STT Error: ${sttRes.status}`);
    const sttData = await sttRes.json();
    let originalText = sttData.text?.trim() || '';

    const gibberish = ['موسیقی', 'Music', 'زیرنویس', 'ترجمه', 'Thank you', 'PYM', 'JBZ'];
    if (gibberish.some(g => originalText.toUpperCase().includes(g.toUpperCase())) && originalText.length < 40) {
        return NextResponse.json({ kurdish: '', persian: '' }); 
    }
    if (!originalText) return NextResponse.json({ kurdish: '', persian: '' });

    // ۲. ترجمه با مدل جدید و قدرتمند openai/gpt-oss-120b
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // مدل جایگزین رسمی
        messages: [
          { 
            role: 'system', 
            content: 'You are a native Kurdish (Sorani) speaker and an expert translator. The user will provide a phonetic transcription of spoken Kurdish written using the Persian alphabet. Note that this text is NOT Persian; it is Kurdish pronounced and written with Persian letters. First, figure out the intended Kurdish meaning. Second, translate it into fluent, natural Persian. If the text is completely nonsensical, reply with "متن نامفهوم است". Otherwise, provide ONLY the Persian translation.' 
          },
          { role: 'user', content: originalText }
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    // مدیریت خطای 404 (مدل یافت نشد) و 429 (محدودیت سرعت)
    if (llmRes.status === 404) {
        return NextResponse.json({ kurdish: originalText, persian: '⚠️ مدل ترجمه در دسترس نیست (به‌روزرسانی لازم است)' });
    }
    if (llmRes.status === 429) {
        return NextResponse.json({ kurdish: originalText, persian: '⏳ محدودیت سرعت سرور' });
    }

    if (!llmRes.ok) {
        return NextResponse.json({ kurdish: originalText, persian: `خطای ترجمه: ${llmRes.status}` });
    }

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content?.trim();

    if (!persianText) {
        persianText = 'ترجمه‌ای یافت نشد (خروجی مدل خالی بود)';
    }

    return NextResponse.json({ kurdish: originalText, persian: persianText });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
