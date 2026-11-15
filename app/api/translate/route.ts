import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
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

const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const userCode = req.headers.get('x-user-code');
    if (!userCode) return NextResponse.json({ persian: 'کد دسترسی وارد نشده است.' }, { status: 401 });

    const credits = await redis.get<number>(`credits:${userCode}`);
    if (credits === null || credits <= 0) {
      return NextResponse.json({ persian: 'اعتبار شما به پایان رسیده است. لطفاً شارژ کنید.' }, { status: 403 });
    }

    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    let memoryPrompt = '';
    try {
      const history = await redis.lrange('all_translations', 0, 5);
      if (history && history.length > 0) {
        memoryPrompt = `\nLearn from these:\n${history.map((h:any) => typeof h === 'string' ? h : JSON.stringify(h)).join('\n')}\n`;
      }
    } catch (e) {}

    let persianText = '';
    let usedEngine = '';

    // تلاش اول: 1xAi (Gemini)
    try {
      const completion = await client1xAi.chat.completions.create({
        model: 'gemini-2.5-pro',
        messages: [
          { role: 'system', content: `You are a Kurdish to Persian translator. ${memoryPrompt} Output ONLY Persian.` },
          { role: 'user', content: text }
        ],
        temperature: 0.2,
      });
      persianText = completion.choices[0]?.message?.content?.trim() || '';
      usedEngine = '1xAi (Gemini)';
    } catch (error: any) {
      // در صورت خطا (مثلاً 402)، به سراغ Groq می‌رویم
      console.log('1xAi failed, falling back to Groq...');
      const fallbackCompletion = await clientGroq.chat.completions.create({
        model: 'openai/gpt-oss-20b', // مدل جدید و فعال Groq
        messages: [
          { role: 'system', content: `You are a Kurdish to Persian translator. ${memoryPrompt} Output ONLY Persian.` },
          { role: 'user', content: text }
        ],
        temperature: 0.2,
      });
      persianText = fallbackCompletion.choices[0]?.message?.content?.trim() || '';
      usedEngine = 'Groq (Fallback)';
    }

    if (!persianText) {
       return NextResponse.json({ persian: 'ترجمه‌ای یافت نشد' });
    }

    await redis.decr(`credits:${userCode}`);

    return NextResponse.json({ persian: persianText });
    
  } catch (e: any) {
    return NextResponse.json({ persian: `خطای شبکه: ${e.message.slice(0, 30)}` }, { status: 502 });
  }
}
