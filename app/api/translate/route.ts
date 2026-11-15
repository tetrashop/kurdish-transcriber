import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 30;

// بررسی وجود کلیدها در بدو ورود
const checkEnv = () => {
  if (!process.env.UPSTASH_REDIS_REST_URL) return 'تنظیم نشده: UPSTASH_REDIS_REST_URL';
  if (!process.env.UPSTASH_VECTOR_REST_URL) return 'تنظیم نشده: UPSTASH_VECTOR_REST_URL';
  if (!process.env.ONE_X_AI_API_KEY && !process.env.GROQ_API_KEY) return 'تنظیم نشده: API Keys';
  return null;
}

export async function POST(req: NextRequest) {
  const envError = checkEnv();
  if (envError) return NextResponse.json({ persian: `خطای تنظیمات: ${envError}` });

  try {
    const userCode = req.headers.get('x-user-code');
    if (!userCode) return NextResponse.json({ persian: 'کد دسترسی وارد نشده است.' }, { status: 401 });

    let redis;
    try {
      redis = Redis.fromEnv();
    } catch (e: any) {
      return NextResponse.json({ persian: `خطای دیتابیس Redis: ${e.message}` });
    }

    const credits = await redis.get<number>(`credits:${userCode}`);
    if (credits === null || credits <= 0) {
      return NextResponse.json({ persian: 'اعتبار شما به پایان رسیده است.' }, { status: 403 });
    }

    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    // ۱. جستجوی معنایی در حافظه برداری
    let memoryPrompt = '';
    try {
      const index = new Index({
        url: process.env.UPSTASH_VECTOR_REST_URL,
        token: process.env.UPSTASH_VECTOR_REST_TOKEN,
      });
      const results = await index.query({ data: text, topK: 3, includeMetadata: true });
      if (results && results.length > 0 && results[0].score > 0.85) {
        const examples = results.map(r => `Input: "${r.data}" -> Output: "${r.metadata?.persian}"`).join('\n');
        memoryPrompt = `\nLearn from these:\n${examples}\n`;
      }
    } catch (e) {
      console.log('Vector DB Error, skipping memory:', e);
    }

    const systemPrompt = `You are an advanced Kurdish to Persian translator. ${memoryPrompt} Output JSON: {"kurdish": "...", "persian": "..."}`;

    let parsed = { kurdish: text, persian: '' };
    let errors = [];

    // تلاش اول: Gemini (1xAi)
    if (process.env.ONE_X_AI_API_KEY) {
      try {
        const client1xAi = new OpenAI({ baseURL: 'https://1xai.ir/v1', apiKey: process.env.ONE_X_AI_API_KEY });
        const completion = await client1xAi.chat.completions.create({
          model: 'gemini-2.5-pro',
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
          temperature: 0.1,
        });
        parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      } catch (err: any) {
        errors.push(`Gemini: ${err.message.slice(0, 30)}`);
      }
    }

    // تلاش دوم: Groq Fallback
    if (!parsed.persian && process.env.GROQ_API_KEY) {
      try {
        const clientGroq = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY });
        const completion = await clientGroq.chat.completions.create({
          model: 'openai/gpt-oss-20b',
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
          temperature: 0.1,
        });
        parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      } catch (err: any) {
        errors.push(`Groq: ${err.message.slice(0, 30)}`);
      }
    }

    if (!parsed.persian) {
      return NextResponse.json({ persian: `خطای ترجمه (${errors.join(' | ')})` });
    }

    await redis.decr(`credits:${userCode}`);
    return NextResponse.json(parsed);

  } catch (e: any) {
    return NextResponse.json({ persian: `خطای کلی: ${e.message.slice(0, 40)}` }, { status: 502 });
  }
}
