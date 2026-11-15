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
        // استفاده از مدل 20B برای ترجمه سریع‌تر و جلوگیری از تایم‌اوت
        model: 'openai/gpt-oss-20b', 
        messages: [
          { 
            role: 'system', 
            content: 'You are a Kurdish (Sorani) to Persian translator. Translate the input (which is Kurdish written in Persian alphabet) to fluent Persian. Output ONLY the Persian translation.' 
          },
          { role: 'user', content: text }
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    if (!llmRes.ok) {
        return NextResponse.json({ persian: `خطای ترجمه (${llmRes.status})` });
    }

    const llmData = await llmRes.json();
    let persianText = llmData.choices[0].message.content?.trim() || 'ترجمه نشد';

    return NextResponse.json({ persian: persianText });
  } catch (e: any) {
    return NextResponse.json({ persian: 'خطای شبکه در ترجمه' }, { status: 502 });
  }
}
