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
    // ۱. رونویسی (STT)
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

    // ۲. ترجمه با پرامپت مبتنی بر مثال (Few-Shot) برای درک بهتر کردیِ نوشته‌شده با حروف فارسی
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', 
        messages: [
          { 
            role: 'system', 
            content: `You are an expert translator of Kurdish (Sorani) to Persian. 
The input text you receive is a phonetic transcription of spoken Kurdish, written using the Persian alphabet. It looks like misspelled Persian, but it is actually Kurdish. 
Your task is to decode the intended Kurdish meaning and translate it to fluent Persian. 
Do NOT say the text is unintelligible. Just do your best to infer the meaning.

Here are some examples of how to process it:
Example 1:
Input: "شوینواری ورگردی"
Output: "به جای شاعری برگشتی"

Example 2:
Input: "لکسانه اگوکو حافظ و سعدی"
Output: "از کسانی که به حافظ و سعدی گوش می‌دهند"

Example 3:
Input: "شیخه خزرکانی حافظ نبیستیتو"
Output: "شیخ خزرکانی، حافظ را نشنیده‌ای"

Now, translate the user's input. Output ONLY the Persian translation.`
          },
          { role: 'user', content: originalText }
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (llmRes.status === 404) return NextResponse.json({ kurdish: originalText, persian: '⚠️ مدل در دسترس نیست' });
    if (llmRes.status === 429) return NextResponse.json({ kurdish: originalText, persian: '⏳ محدودیت سرعت' });
    if (!llmRes.ok) return NextResponse.json({ kurdish: originalText, persian: `خطای ترجمه: ${llmRes.status}` });

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content?.trim();

    if (!persianText) persianText = 'ترجمه‌ای یافت نشد';

    return NextResponse.json({ kurdish: originalText, persian: persianText });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
