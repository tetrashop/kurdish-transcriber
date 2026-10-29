import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY missing in Vercel' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append('file', file, 'chunk.wav');
  upstream.append('model', 'whisper-large-v3');
  
  // استفاده از کد زبان فارسی به جای کردی چون Groq کردی را پشتیبانی نمی‌کند
  // این کار باعث می‌شود مدل از الفبای درست (عربی-فارسی) استفاده کند
  upstream.append('language', 'fa'); 
  
  upstream.append('response_format', 'json');
  upstream.append('temperature', '0');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Groq ${res.status}: ${errText.slice(0, 150)}` }, { status: res.status });
    }
    
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
