import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // تست: بدون تماس با هرمز
  return NextResponse.json({ text: 'تست موفق: کد و اتصال ورسل درست کار می‌کند.' });
}
