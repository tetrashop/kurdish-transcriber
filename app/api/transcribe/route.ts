import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'DEEPINFRA_API_KEY missing in Vercel' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append('file', file, 'chunk.wav');
  upstream.append('model', 'openai/whisper-large-v3');
  upstream.append('language', 'ku');
  upstream.append('response_format', 'json');
  upstream.append('temperature', '0');

  try {
    const res = await fetch('https://api.deepinfra.com/v1/openai/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `DeepInfra ${res.status}: ${errText.slice(0, 200)}` }, { status: res.status });
    }
    
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
