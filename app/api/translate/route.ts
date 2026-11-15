import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });

  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    // ۱. بازیابی حافظه (آنچه قبلاً یاد گرفته‌ایم)
    let memoryPrompt = '';
    try {
      const history = await kv.lrange('all_translations', 0, 10);
      if (history && history.length > 0) {
        const examples = history.map((h: any) => {
           const parsed = typeof h === 'string' ? JSON.parse(h) : h;
           return `Input: "${parsed.kurdish}" -> Output: "${parsed.persian}"`;
        }).join('\n');
        memoryPrompt = `\nHere are some previously corrected translations you must learn from:\n${examples}\n`;
      }
    } catch (e) {
      console.log('KV not configured yet, skipping memory.');
    }

    // ۲. ترجمه با هوش مصنوعی و تزریق حافظه
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { 
            role: 'system', 
            content: `You are an expert Kurdish (Sorani) to Persian translator. The input is a phonetic transcription of spoken Kurdish written in Persian alphabet.
Translate it into fluent Persian.
${memoryPrompt}
Output ONLY the Persian translation.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!llmRes.ok) return NextResponse.json({ persian: `خطای مدل (${llmRes.status})` });

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content?.trim() || 'ترجمه نشد';

    return NextResponse.json({ persian: persianText });
  } catch (e: any) {
    return NextResponse.json({ persian: 'خطای شبکه' }, { status: 502 });
  }
}
