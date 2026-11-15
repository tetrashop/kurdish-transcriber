import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY missing' }, { status: 500 });

  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // استفاده از مدل بسیار قوی 70B برای درک متون محاوره‌ای
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: `You are an expert Kurdish (Sorani) to Persian translator.
The input text is a phonetic transcription of spoken Kurdish, written using the Persian alphabet. It looks like misspelled Persian, but it is actually Kurdish.
Your task is to decode the intended meaning and translate it into fluent Persian.

Examples:
Input: "شوینواری ورگردی"
Output: "به جای شاعری برگشتی"

Input: "لکسانه اگوکو حافظ و سعدی"
Output: "از کسانی که به حافظ و سعدی گوش می‌دهند"

Input: "توانی رویشتنی نماؤ لدو خیلتا"
Output: "توانستی بروی پیش خانواده‌ات"

Output ONLY the Persian translation, nothing else.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3, // افزایش خلاقیت برای جلوگیری از خروجی خالی
        max_tokens: 300,
      }),
    });

    if (!llmRes.ok) {
        const errText = await llmRes.text();
        return NextResponse.json({ persian: `خطای مدل (${llmRes.status})` });
    }

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content?.trim();

    // اگر مدل باز هم خروجی خالی داد
    if (!persianText) {
        persianText = 'ترجمه‌ای یافت نشد (متن بسیار نامفهوم است)';
    }

    return NextResponse.json({ persian: persianText });
  } catch (e: any) {
    return NextResponse.json({ persian: 'خطای شبکه در ترجمه' }, { status: 502 });
  }
}
