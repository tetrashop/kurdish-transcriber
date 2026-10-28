import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'HUGGINGFACE_API_KEY missing' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000); // ۵۰ ثانیه فرصت برای Hugging Face

  try {
    const res = await fetch(
      'https://api-inference.huggingface.co/models/openai/whisper-large-v3?language=ku',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'audio/wav',
          'x-wait-for-model': 'true',
        },
        body: file,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `HF ${res.status}: ${errText.slice(0, 100)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || '' });

  } catch (e: any) {
    clearTimeout(timeoutId);
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
