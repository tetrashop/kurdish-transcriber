import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'HUGGINGFACE_API_KEY is missing in Vercel' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
  }

  try {
    // استفاده از مدل Whisper مخصوص کردی سورانی روی Hugging Face
    const res = await fetch(
      'https://api-inference.huggingface.co/models/rzgar/whisper-large-v3-sorani-kurdish-ckb-v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'audio/wav',
        },
        body: file,
      }
    );
    
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `HF ${res.status}: ${err}` }, { status: res.status });
    }
    
    const data = await res.json();
    // خروجی ممکن است مستقیماً text باشد یا در آرایه باشد
    const text = data.text || data[0]?.transcription || '';
    return NextResponse.json({ text });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network Error: ${e.message}` }, { status: 502 });
  }
}
