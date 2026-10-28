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

  try {
    // زبان را روی persian تنظیم می‌کنیم تا مدل کردی سورانی تولید کند
    const url = 'https://api-inference.huggingface.co/models/rzgar/whisper-large-v3-sorani-kurdish-ckb-v2?language=persian';
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'audio/wav',
        'x-wait-for-model': 'true',
      },
      body: file,
    });
    
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `HF ${res.status}: ${errText}` }, { status: res.status });
    }
    
    const data = await res.json();
    const text = data.text || data[0]?.text || '';
    return NextResponse.json({ text });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
