import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const { kurdish, persian } = await req.json();
    if (!kurdish || !persian) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    await redis.set(`dict:${kurdish}`, persian);
    await redis.lpush('all_translations', JSON.stringify({ kurdish, persian }));
    await redis.ltrim('all_translations', 0, 99);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
