import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// کاهش زمان اجرا برای جلوگیری از خطای 502 در صورت عدم پاسخ هرمز
export const maxDuration = 10; 

const MODEL = 'openai/whisper-large-v3';

export async function POST(req: NextRequest) {
  const apiKey = process.env.HORMOUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'HORMOUS_API_KEY is missing in Vercel' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append('file', file, 'chunk.wav');
  upstream.append('model', MODEL);
  upstream.append('language', 'ku');
  upstream.append('task', 'transcribe');
  upstream.append('response_format', 'json');
  upstream.append('temperature', '0');

  try {
    const res = await fetch('https://api.hormouz.net/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    
    if (!res.ok) {
      const err = await res.text();
      // این خطا را به سمت مرورگر برمی‌گردانیم تا در نوار وضعیت ببینیم
      return NextResponse.json({ error: `Hormouz ${res.status}: ${err}` }, { status: res.status });
    }
    
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network Error: ${e.message}` }, { status: 502 });
  }
}
