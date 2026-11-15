import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 30;

// اتصال به درگاه 1xAi
const client = new OpenAI({
  baseURL: 'https://1xai.ir/v1',
  apiKey: process.env.ONE_X_AI_API_KEY || 'missing-key',
});

const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ persian: '' });

    let memoryPrompt = '';
    try {
      const history = await redis.lrange('all_translations', 0, 10);
      if (history && history.length > 0) {
        const examples = history.map((h: any) => {
           const parsed = typeof h === 'string' ? JSON.parse(h) : h;
           return `Input: "${parsed.kurdish}" -> Output: "${parsed.persian}"`;
        }).join('\n');
        memoryPrompt = `\nHere are some previously corrected translations you must learn from:\n${examples}\n`;
      }
    } catch (e) {
      console.log('Redis not configured yet, skipping memory.');
    }

    const completion = await client.chat.completions.create({
      model: 'gemini-2.5-pro', // مدل از طریق درگاه 1xAi
      messages: [
        { 
          role: 'system', 
          content: `You are an expert Kurdish (Sorani) to Persian translator. The input text is a phonetic transcription of spoken Kurdish written using Persian alphabet. Your task is to decode the meaning and translate it into fluent Persian. ${memoryPrompt} Output ONLY the Persian translation, nothing else.` 
        },
        { role: 'user', content: text }
      ],
      temperature: 0.2,
    });

    const persianText = completion.choices[0]?.message?.content?.trim() || 'ترجمه نشد';
    return NextResponse.json({ persian: persianText });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ persian: `خطای ترجمه: ${e.message.slice(0, 40)}` }, { status: 502 });
  }
}
