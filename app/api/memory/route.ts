import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { kurdish, persian } = await req.json();
    if (!kurdish || !persian) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    // ذخیره در دیتابیس KV
    await kv.set(`dict:${kurdish}`, persian);
    await kv.lpush('all_translations', JSON.stringify({ kurdish, persian }));
    
    // نگه داشتن فقط ۱۰۰ مورد آخر برای جلوگیری از پر شدن حافظه
    await kv.ltrim('all_translations', 0, 99);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
