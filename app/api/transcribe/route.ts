import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'openai/whisper-large-v3';

export async function POST(req: NextRequest) {
  const apiKey = process.env.HORMOUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'HORMOUS_API_KEY missing' }, { status: 500 });
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
      console.error('Hormouz error:', res.status, err);
      return NextResponse.json({ error: err, status: res.status }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
  } catch (e: any) {
    console.error('Upstream fetch failed:', e?.message);
    return NextResponse.json({ error: 'upstream failed', detail: String(e) }, { status: 502 });
  }
}
