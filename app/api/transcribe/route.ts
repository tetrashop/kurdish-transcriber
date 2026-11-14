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

  const groqKey = process.env.GROQ_API_KEY;
  const hfKey = process.env.HUGGINGFACE_API_KEY;

  if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });
  if (!hfKey) return NextResponse.json({ error: 'HUGGINGFACE_API_KEY missing' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'audio file missing' }, { status: 400 });

  try {
    // ۱. رونویسی با Whisper (Groq)
    const upstream = new FormData();
    upstream.append('file', file, 'chunk.wav');
    upstream.append('model', 'whisper-large-v3');
    upstream.append('language', 'fa');
    upstream.append('response_format', 'json');
    upstream.append('temperature', '0');

    const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
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

    // ۲. ترجمه با مدل تخصصی NLLB-200 در Hugging Face
    const hfRes = await fetch(
      'https://api-inference.huggingface.co/models/facebook/nllb-200-distilled-600M',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: originalText,
          parameters: {
            src_lang: 'ckb_Arab', // کردی سورانی
            tgt_lang: 'pes_Arab', // فارسی
          },
        }),
      }
    );

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      // اگر مدل در حال بارگذاری بود (503) یا خطای دیگری رخ داد
      return NextResponse.json({ kurdish: originalText, persian: `خطای ترجمه: ${hfRes.status}` });
    }

    const hfData = await hfRes.json();
    // خروجی Hugging Face معمولاً یک آرایه با کلید translation_text است
    let persianText = hfData[0]?.translation_text || 'ترجمه‌ای یافت نشد';

    return NextResponse.json({ kurdish: originalText, persian: persianText });

  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
