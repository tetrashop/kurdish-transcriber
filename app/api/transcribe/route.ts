import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'audio file missing' }, { status: 400 });

  try {
    const upstream = new FormData();
    upstream.append('file', file, 'chunk.wav');
    upstream.append('model', 'whisper-large-v3');
    upstream.append('language', 'fa');
    upstream.append('response_format', 'json');

    const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!sttRes.ok) throw new Error(`STT: ${sttRes.status}`);
    const sttData = await sttRes.json();
    let originalText = sttData.text?.trim() || '';

    // فیلتر بسیار قوی‌تر برای کلمات مزاحم و توهم‌زنی
    const gibberish = ['موسیقی', 'Music', 'زیرنویس', 'ترجمه', 'Thank you', 'PYM', 'JBZ', 'پیام جبهه', 'پیشرفت بزرگ', 'پیمان جبهه', 'متن نامفهوم'];
    const lowerText = originalText.toUpperCase();
    
    // اگر متن کوتاه بود و شامل کلمات مزاحم بود، کلاً نادیده بگیر
    if (originalText.length < 50 && gibberish.some(g => lowerText.includes(g.toUpperCase()))) {
        return NextResponse.json({ kurdish: '' });
    }

    return NextResponse.json({ kurdish: originalText });
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
