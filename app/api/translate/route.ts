import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const userCode = req.headers.get('x-user-code');
    if (!userCode) return NextResponse.json({ persian: 'کد دسترسی وارد نشده است.' }, { status: 401 });

    const redis = Redis.fromEnv();
    const credits = await redis.get<number>(`credits:${userCode}`);
    if (credits === null || credits <= 0) {
      return NextResponse.json({ persian: 'اعتبار شما به پایان رسیده است.' }, { status: 403 });
    }

    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    // ۱. حافظه برداری (RAG) - اختیاری
    let memoryPrompt = '';
    try {
      const index = new Index({ url: process.env.UPSTASH_VECTOR_REST_URL, token: process.env.UPSTASH_VECTOR_REST_TOKEN });
      const results = await index.query({ data: text, topK: 3, includeMetadata: true });
      if (results && results.length > 0 && results[0].score > 0.85) {
        memoryPrompt = `\nLearn from:\n${results.map(r => `In: "${r.data}" -> Out: "${r.metadata?.persian}"`).join('\n')}\n`;
      }
    } catch (e) {}

    const systemPrompt = `You are an advanced Kurdish (Sorani) to Persian translator. 
${memoryPrompt}
Translate the phonetic Kurdish input to fluent Persian.
Output ONLY a valid JSON object: {"kurdish": "corrected kurdish", "persian": "persian translation"}`;

    // ۲. استفاده از Groq به عنوان موتور اصلی (جلوگیری از خطای 1xAi)
    const clientGroq = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    });

    const completion = await clientGroq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanContent);

    if (!parsed.persian) {
      return NextResponse.json({ persian: 'ترجمه‌ای یافت نشد.' });
    }

    await redis.decr(`credits:${userCode}`);
    return NextResponse.json({ kurdish: parsed.kurdish || text, persian: parsed.persian });

  } catch (e: any) {
    return NextResponse.json({ persian: `خطای ترجمه: ${e.message.slice(0, 50)}` }, { status: 502 });
  }
}
