import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 30;

const client = new OpenAI({
  baseURL: 'https://1xai.ir/v1',
  apiKey: process.env.ONE_X_AI_API_KEY || 'missing-key',
});
const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const userCode = req.headers.get('x-user-code');
    if (!userCode) return NextResponse.json({ persian: 'کد دسترسی وارد نشده است.' }, { status: 401 });

    // بررسی اعتبار کاربر
    const credits = await redis.get<number>(`credits:${userCode}`);
    if (credits === null || credits <= 0) {
      return NextResponse.json({ persian: 'اعتبار شما به پایان رسیده است. لطفاً حساب خود را شارژ کنید.' }, { status: 403 });
    }

    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    // ... (بخش پرامپت و حافظه قبلی بدون تغییر) ...
    let memoryPrompt = '';
    const history = await redis.lrange('all_translations', 0, 5);
    if (history && history.length > 0) {
      memoryPrompt = `\nLearn from these previous translations:\n${history.map((h:any) => typeof h === 'string' ? h : JSON.stringify(h)).join('\n')}\n`;
    }

    const completion = await client.chat.completions.create({
      model: 'gemini-2.5-pro',
      messages: [
        { role: 'system', content: `You are a Kurdish to Persian translator. ${memoryPrompt} Output ONLY Persian.` },
        { role: 'user', content: text }
      ],
      temperature: 0.2,
    });

    // کسر ۱ واحد از اعتبار مشتری پس از ترجمه موفق
    await redis.decr(`credits:${userCode}`);

    const persianText = completion.choices[0]?.message?.content?.trim() || 'ترجمه نشد';
    return NextResponse.json({ persian: persianText });
  } catch (e: any) {
    return NextResponse.json({ persian: `خطای سیستم: ${e.message.slice(0, 30)}` }, { status: 502 });
  }
}
