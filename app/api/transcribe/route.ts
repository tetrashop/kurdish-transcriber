import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file missing' }, { status: 400 });
  }

  // ۱. تبدیل صدا به متن (رونویسی)
  const upstream = new FormData();
  upstream.append('file', file, 'chunk.wav');
  upstream.append('model', 'whisper-large-v3');
  upstream.append('language', 'fa');
  upstream.append('response_format', 'json');
  upstream.append('temperature', '0');

  try {
    const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    
    if (!sttRes.ok) throw new Error(`STT Error: ${sttRes.status}`);
    const sttData = await sttRes.json();
    const originalText = sttData.text?.trim() || '';

    if (!originalText) return NextResponse.json({ kurdish: '', persian: '' });

    // ۲. اصلاح و ترجمه با مدل جدید و معتبر Groq
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b', // مدل جایگزین پیشنهادی Groq
        messages: [
          { 
            role: 'system', 
            content: 'شما یک مترجم خبره کردی سورانی به فارسی هستید. متن زیر توسط سیستم تشخیص گفتار تولید شده و ممکن است پر از غلط املایی یا کلمات نامفهوم فارسی باشد (چون صدا کردی بوده). لطفاً مفهوم را حدس بزنید، متن کردی صحیح را بنویسید و آن را به فارسی روان ترجمه کنید. خروجی شما باید دقیقاً یک فرمت JSON معتبر با کلیدهای "kurdish" (متن اصلاح‌شده کردی) و "persian" (ترجمه فارسی) باشد.' 
          },
          { role: 'user', content: originalText }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!llmRes.ok) {
        const err = await llmRes.text();
        return NextResponse.json({ kurdish: originalText, persian: `خطای ترجمه: ${err.slice(0,50)}` });
    }

    const llmData = await llmRes.json();
    
    try {
        const parsed = JSON.parse(llmData.choices[0].message.content);
        return NextResponse.json({ kurdish: parsed.kurdish || originalText, persian: parsed.persian || 'نامشخص' });
    } catch (parseError) {
        return NextResponse.json({ kurdish: originalText, persian: llmData.choices[0].message.content });
    }
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
