import { NextRequest, NextResponse } from 'next/server';
import { Index } from '@upstash/vector';

export const runtime = 'nodejs';

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const { kurdish, persian } = await req.json();
    if (!kurdish || !persian) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    await index.upsert({
      id: crypto.randomUUID(),
      data: kurdish,
      metadata: { persian: persian }
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
