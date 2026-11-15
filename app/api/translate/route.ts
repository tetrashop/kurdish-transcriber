import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    // پرامپت قفل‌شده با قوانین سخت‌گیرانه و مثال‌های آموزشی
    const systemPrompt = `You are an expert Kurdish (Sorani) to Persian translator.
The input you receive is an AI transcription of spoken Kurdish, written phonetically using the Persian alphabet. It looks like misspelled Persian, but it is actually Kurdish. 

RULES:
1. Do NOT say the text is unintelligible or unclear. Always do your best to guess the intended meaning from context.
2. Do NOT explain anything. Do NOT output any text other than the JSON.
3. Translate the concept to fluent, natural Persian.

Examples:
Input: "سید علی اسغری کردستانی"
Output: {"kurdish": "سید علی اصغری کردستانی", "persian": "سید علی اصغری کردستانی"}

Input: "بیرو خوش بینم"
Output: {"kurdish": "بیرۆ خۆش بینم", "persian": "فکر خوبی است"}

Input: "دنگێ نواندی کردستان"
Output: {"kurdish": "دەنگی نواندی کوردستان", "persian": "صدای رسانه کردستان"}

Now, translate the user's input and output ONLY this JSON format: {"kurdish": "corrected kurdish text", "persian": "fluent persian translation"}`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // مدل قدرتمند
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        temperature: 0.1, // خلاقیت کم برای ترجمه دقیق
        response_format: { type: 'json_object' }
      })
    });

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
