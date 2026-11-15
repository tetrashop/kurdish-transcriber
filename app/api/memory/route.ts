import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export const runtime = 'nodejs';

// ذخیره ترجمه اصلاح‌شده در دیتابیس
export async function POST(req: NextRequest) {
  try {
    const { kurdish, persian } = await req.json();
    if (!kurdish || !persian) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    // ذخیره در دیتابیس با کلید متنی
    await kv.set(`dict:${kurdish}`, persian);
    
    // همچنین در یک لیست برای جستجوی هوشمندتر ذخیره می‌کنیم
    await kv.lpush('all_translations', JSON.stringify({ kurdish, persian }));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// دریافت حافظه برای استفاده در ترجمه‌های بعدی
export async function GET() {
  try {
    const history = await kv.lrange('all_translations', 0, 50); // 50 ترجمه آخر
    return NextResponse.json({ history });
  } catch (e: any) {
    return NextResponse.json({ history: [] });
  }
}
