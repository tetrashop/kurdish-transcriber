import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// تابع کمکی برای تلاش مجدد با تأخیر
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    // اگر خطای 429 (محدودیت نرخ) یا 5xx (خطای سرور) بود، دوباره تلاش کن
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      const delay = Math.pow(2, i) * 1000; // تأخیر نمایی: ۱s, ۲s, ۴s
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    return res;
  }
  throw new Error('Max retries exceeded');
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
    }

    // بررسی حجم فایل (حداکثر ۲۵ مگابایت برای پلن رایگان)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم فایل صوتی بیش از ۲۵ مگابایت است.' }, { status: 413 });
    }

    const upstream = new FormData();
    upstream.append('file', file, 'chunk.wav');
    upstream.append('model', 'whisper-large-v3');
    upstream.append('language', 'fa');
    upstream.append('response_format', 'json');

    // استفاده از تابع تلاش مجدد
    const sttRes = await fetchWithRetry('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!sttRes.ok) {
      const errorText = await sttRes.text();
      console.error('Groq STT Error:', errorText);
      return NextResponse.json({ error: `خطای Groq (${sttRes.status}): ${errorText.slice(0, 100)}` }, { status: sttRes.status });
    }

    const sttData = await sttRes.json();
    const originalText = sttData.text?.trim() || '';

    // فیلتر کلمات مزاحم
    const gibberish = ['موسیقی', 'Music', 'زیرنویس', 'ترجمه', 'Thank you', 'PYM', 'JBZ'];
    if (originalText.length < 50 && gibberish.some(g => originalText.toUpperCase().includes(g.toUpperCase()))) {
      return NextResponse.json({ kurdish: '' }); 
    }

    return NextResponse.json({ kurdish: originalText });
  } catch (e: any) {
    console.error('Transcription Catch Error:', e);
    return NextResponse.json({ error: `خطای شبکه: ${e.message.slice(0, 50)}` }, { status: 502 });
  }
}
