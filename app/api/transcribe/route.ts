import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30; // کاهش زمان برای جلوگیری از انتظار طولانی

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'audio file missing' }, { status: 400 });

  try {
    // ۱. رونویسی با Whisper
    const upstream = new FormData();
    upstream.append('file', file, 'chunk.wav');
    upstream.append('model', 'whisper-large-v3');
    upstream.append('language', 'fa'); 
    upstream.append('response_format', 'json');
    upstream.append('temperature', '0');

    const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
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

    // ۲. ترجمه با مدل پایدار Mixtral
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', // مدل بسیار پایدار و سریع
        messages: [
          { 
            role: 'system', 
            content: 'You are a Kurdish (Sorani) to Persian translator. The input is a phonetic transcription of Kurdish speech written in Persian letters. Translate the meaning into fluent Persian. Output ONLY the Persian translation.' 
          },
          { role: 'user', content: originalText }
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (llmRes.status === 429) return NextResponse.json({ kurdish: originalText, persian: '⏳ محدودیت سرعت' });
    if (!llmRes.ok) return NextResponse.json({ kurdish: originalText, persian: `خطای ترجمه: ${llmRes.status}` });

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content?.trim();

    if (!persianText) persianText = 'ترجمه‌ای یافت نشد';

    return NextResponse.json({ kurdish: originalText, persian: persianText });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
