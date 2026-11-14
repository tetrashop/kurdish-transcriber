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
  upstream.append('language', 'fa'); // استفاده از الفبای فارسی برای شبیه‌سازی کردی سورانی
  upstream.append('prompt', 'ئەمە گفتوگۆیەکی کوردییە. تکایە بە کوردی بنووسە.'); // راهنمای مدل
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

    // ۲. ترجمه به فارسی و اصلاح متن با مدل Llama 3
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { 
            role: 'system', 
            content: 'شما یک مترجم خبره کردی به فارسی هستید. متن دریافتی (که ممکن است با الفبای فارسی نوشته شده باشد اما واژگان کردی باشد) را به فارسی روان ترجمه کنید. خروجی شما باید دقیقاً یک فرمت JSON با کلیدهای "kurdish" (متن اصلی) و "persian" (ترجمه فارسی) باشد.' 
          },
          { role: 'user', content: originalText }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!llmRes.ok) {
        // اگر ترجمه خطا داد، حداقل متن اصلی را برگردان
        return NextResponse.json({ kurdish: originalText, persian: 'ترجمه در دسترس نیست' });
    }

    const llmData = await llmRes.json();
    const parsed = JSON.parse(llmData.choices[0].message.content);
    return NextResponse.json({ kurdish: parsed.kurdish || originalText, persian: parsed.persian || '' });
    
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e.message}` }, { status: 502 });
  }
}
