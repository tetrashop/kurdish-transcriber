import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// مکانیزم ساده برای جلوگیری از ارسال بیش از حد درخواست
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 15; // افزایش جزئی برای تست‌های رادیویی

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
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'محدودیت درخواست (Rate Limit)' }, { status: 429 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'audio file missing' }, { status: 400 });

  try {
    // ۱. رونویسی با Whisper
    const upstream = new FormData();
    upstream.append('file', file, 'chunk.wav');
    upstream.append('model', 'whisper-large-v3');
    upstream.append('language', 'fa'); // استفاده از fa به جای ku
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

    // فیلتر کلمات مزاحم
    const hallucinations = ['موسیقی', 'Music', 'زیرنویس', 'ترجمه', 'Thank you'];
    if (hallucinations.some(h => originalText.includes(h)) && originalText.length < 40) {
        return NextResponse.json({ kurdish: '', persian: '' }); 
    }
    if (!originalText) return NextResponse.json({ kurdish: '', persian: '' });

    // ۲. ترجمه با مدل پایدار Llama 3
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // مدل بسیار پایدار در Groq
        messages: [
          { 
            role: 'system', 
            content: 'You are a Kurdish to Persian translator. The input is a phonetic transcription of Kurdish speech written in Persian alphabet. Translate the intended meaning into fluent Persian. Output ONLY the Persian translation, nothing else.' 
          },
          { role: 'user', content: originalText }
        ],
        temperature: 0.1,
      }),
    });

    // اگر خطا داد، دقیقاً متن خطا را برمی‌گردانیم تا در سایت ببینیم
    if (!llmRes.ok) {
        const errText = await llmRes.text();
        return NextResponse.json({ kurdish: originalText, persian: `خطای Groq: ${errText.slice(0, 60)}` });
    }

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content.trim();

    return NextResponse.json({ kurdish: originalText, persian: persianText });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
