import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    const systemPrompt = `You are an expert Kurdish (Sorani) to Persian translator.
The input you receive is an AI transcription of spoken Kurdish, written phonetically using the Persian alphabet. 
Translate the concept to fluent, natural Persian.
Do NOT explain anything. Do NOT output any text other than the JSON.
Output ONLY this JSON format: {"kurdish": "corrected kurdish text", "persian": "fluent persian translation"}`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    // اگر خطای 429 (محدودیت سرعت) رخ داد، دقیقا همان را به فرانت‌اند بفرست
    if (groqResponse.status === 429) {
        return NextResponse.json({ persian: `429` }, { status: 429 });
    }

    if (!groqResponse.ok) {
      return NextResponse.json({ persian: `خطای Groq (${groqResponse.status})` });
    }

    const groqData = await groqResponse.json();
    const content = groqData.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());

    return NextResponse.json({ kurdish: parsed.kurdish || text, persian: parsed.persian || 'ترجمه نشد' });

  } catch (e: any) {
    return NextResponse.json({ persian: `خطای سیستم` }, { status: 502 });
  }
}
