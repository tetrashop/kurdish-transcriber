import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Index } from '@upstash/vector';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const result = {
    system: 'Kurdish Transcriber v7.1',
    timestamp: new Date().toISOString(),
    databases: {
      redis: 'Unknown',
      vector: 'Unknown',
    },
    vectorCount: 0,
  };

  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    
    if (redisUrl && redisToken) {
      const redis = new Redis({ url: redisUrl, token: redisToken });
      await redis.ping();
      result.databases.redis = 'Connected ✅';
    } else {
      result.databases.redis = 'Missing Keys ❌';
    }
  } catch (e) {
    result.databases.redis = 'Error ❌';
  }

  try {
    const vectorUrl = process.env.UPSTASH_VECTOR_REST_URL;
    const vectorToken = process.env.UPSTASH_VECTOR_REST_TOKEN;

    if (vectorUrl && vectorToken) {
      const index = new Index({ url: vectorUrl, token: vectorToken });
      const info = await index.info();
      result.databases.vector = 'Connected ✅';
      result.vectorCount = info.vectorCount;
    } else {
      result.databases.vector = 'Missing Keys ❌';
    }
  } catch (e) {
    result.databases.vector = 'Error ❌';
  }

  return NextResponse.json(result);
}
