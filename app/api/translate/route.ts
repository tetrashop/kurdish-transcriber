import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    const systemPrompt = `You are an advanced Kurdish (Sorani) to Persian translator. 
Translate the phonetic Kurdish input to fluent Persian.
Output ONLY a valid JSON object: {"kurdish": "text", "persian": "translation"}`;

    // استفاده از مدل فعال و پایدار Groq
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // مدل جایگزین و فعال
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      return NextResponse.json({ persian: `خطای Groq (${groqResponse.status}): ${errorText.slice(0, 50)}` });
    }

    const groqData = await groqResponse.json();
    const content = groqData.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());

    return NextResponse.json({ kurdish: parsed.kurdish || text, persian: parsed.persian || 'ترجمه نشد' });

  } catch (e: any) {
    return NextResponse.json({ persian: `خطای سیستم: ${e.message.slice(0, 50)}` }, { status: 502 });
  }
}
