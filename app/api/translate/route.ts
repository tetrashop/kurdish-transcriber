import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 30;
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

    const { text: persianText } = await generateText({
      model: google('gemini-1.5-pro-latest'),
      system: `You are an expert Kurdish (Sorani) to Persian translator. The input text is a phonetic transcription of spoken Kurdish written using Persian alphabet. Your task is to decode the meaning and translate it into fluent Persian. ${memoryPrompt} Output ONLY the Persian translation, nothing else.`,
      prompt: text,
      temperature: 0.2,
    });

    return NextResponse.json({ persian: persianText.trim() });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ persian: `خطای ترجمه: ${e.message.slice(0, 30)}` }, { status: 502 });
  }
}
