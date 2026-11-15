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
      return NextResponse.json({ persian: 'اعتبار شما به پایان رسیده است.' }, { status: 403 });
    }

    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    let memoryPrompt = '';
    try {
      const history = await redis.lrange('all_translations', 0, 3); // کاهش حافظه برای صرفه‌جویی در توکن
      if (history && history.length > 0) {
        memoryPrompt = `\nLearn from these:\n${history.map((h:any) => typeof h === 'string' ? h : JSON.stringify(h)).join('\n')}\n`;
      }
    } catch (e) {}

    // پرامپت قفل‌شده: هوش مصنوعی اصلاً اجازه ندارد توضیح اضافه بدهد
    const systemPrompt = `You are a Kurdish (Sorani) to Persian translator. Translate the input to Persian. ${memoryPrompt} 
RULES:
1. Output ONLY the Persian translation.
2. Do NOT explain anything.
3. Do NOT say "متن نامفهوم است" (unintelligible).
4. If the text is just noise, output the word "NOISE".`;

    let persianText = '';

    // تلاش اول: Gemini (1xAi)
    try {
      const completion = await client1xAi.chat.completions.create({
        model: 'gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
      });
      persianText = completion.choices[0]?.message?.content?.trim() || '';
    } catch (error: any) {
      // تلاش دوم: Groq (در صورت خطای 402 یا شبکه)
      try {
        const fallbackCompletion = await clientGroq.chat.completions.create({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
        });
        persianText = fallbackCompletion.choices[0]?.message?.content?.trim() || '';
      } catch (fallbackError: any) {
         // اگر Groq هم خطای 429 داد، به کاربر بگو
         if (fallbackError.status === 429) {
            return NextResponse.json({ persian: '⏳ سرور شلوغ است (تلاش مجدد)' });
         }
         throw fallbackError;
      }
    }

    // اگر خروجی NOISE بود یا خالی بود، چیزی نشان نده
    if (!persianText || persianText.toUpperCase().includes('NOISE')) {
       return NextResponse.json({ persian: '' });
    }

    await redis.decr(`credits:${userCode}`);
    return NextResponse.json({ persian: persianText });
    
  } catch (e: any) {
    return NextResponse.json({ persian: `خطای شبکه` }, { status: 502 });
  }
}
