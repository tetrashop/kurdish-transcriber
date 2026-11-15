import { NextRequest, NextResponse } from 'next/server';
import ZarinPal from 'zarinpal-node-sdk';
import { Redis } from '@upstash/redis';

export async function GET(req: NextRequest) {
  // ایجاد کلاینت در زمان اجرا (نه در زمان Build)
  const redis = Redis.fromEnv(); 

  const { searchParams } = new URL(req.url);
  const authority = searchParams.get('Authority');
  const status = searchParams.get('Status');

  if (status !== 'OK' || !authority) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?payment=failed`);
  }

  const zarinpal = new ZarinPal({
    merchantId: process.env.ZARINPAL_MERCHANT_ID!,
    sandbox: process.env.ZARINPAL_SANDBOX === 'true',
  });

  try {
    const userCode = await redis.get(`payment:${authority}`);
    if (!userCode) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?payment=error`);

    const verification = await zarinpal.verifications.verify({ amount: 500000, authority });

    if (verification.data.code === 100) {
      await redis.incrby(`credits:${userCode}`, 50);
      await redis.del(`payment:${authority}`);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?payment=success`);
    }
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?payment=invalid`);
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?payment=error`);
  }
}
