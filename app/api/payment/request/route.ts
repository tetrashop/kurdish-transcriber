import { NextRequest, NextResponse } from 'next/server';
import ZarinPal from 'zarinpal-node-sdk';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const { amount, userCode } = await req.json();
    if (!amount || !userCode) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    const zarinpal = new ZarinPal({
      merchantId: process.env.ZARINPAL_MERCHANT_ID!,
      sandbox: process.env.ZARINPAL_SANDBOX === 'true',
    });

    const response = await zarinpal.payments.create({
      amount: amount * 10, 
      callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/verify`,
      description: `شارژ اعتبار برای ${userCode}`,
    });

    await redis.set(`payment:${response.data.authority}`, userCode, { ex: 3600 });

    return NextResponse.json({ redirectUrl: zarinpal.payments.getRedirectUrl(response.data.authority) });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 });
  }
}
