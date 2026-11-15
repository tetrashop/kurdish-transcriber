import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 30;

const client1xAi = new OpenAI({
  baseURL: 'https://1xai.ir/v1',
  apiKey: process.env.ONE_X_AI_API_KEY || 'missing-key',
});

const clientGroq = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY || 'missing-key',
});

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const userCode = req.headers.get('x-user-code');
    if (!userCode) return NextResponse.json({ persian: 'کد دسترسی وارد نشده است.' }, { status: 401 });

    const credits = await redis.get<number>(`credits:${userCode}`);
    if (credits === null || credits <= 0) {
      return NextResponse.json({ persian: 'اعتبار شما به پایان رسیده است.' }, { status: 403 });
    }

    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    // ۱. جستجوی معنایی در حافظه برداری
    let memoryPrompt = '';
    try {
      const results = await index.query({ data: text, topK: 3, includeMetadata: true });
      if (results && results.length > 0 && results[0].score > 0.85) {
        const examples = results.map(r => `Input: "${r.data}" -> Output: "${r.metadata?.persian}"`).join('\n');
        memoryPrompt = `\nLearn from these past corrections:\n${examples}\n`;
      }
    } catch (e) {}

    const systemPrompt = `You are an advanced Kurdish (Sorani) to Persian translator.
The input is phonetic ASR output. ${memoryPrompt}
1. Normalize the text to standard Kurdish.
2. Translate to fluent Persian.
Output ONLY a JSON object: {"kurdish": "...", "persian": "..."}`;

    let parsed = { kurdish: text, persian: 'ترجمه نشد' };

    // تلاش اول: Gemini
    try {
      const completion = await client1xAi.chat.completions.create({
        model: 'gemini-2.5-pro',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        temperature: 0.1,
      });
      parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch (error) {
      // تلاش دوم: Groq Fallback
      const completion = await clientGroq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        temperature: 0.1,
      });
      parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    }

    if (parsed.persian) await redis.decr(`credits:${userCode}`);
    return NextResponse.json(parsed);

  } catch (e: any) {
    return NextResponse.json({ persian: `خطای شبکه` }, { status: 502 });
  }
}
