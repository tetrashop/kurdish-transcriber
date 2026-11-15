const { Redis } = require('@upstash/redis');
require('dotenv').config({ path: '.env.local' });

const redis = Redis.fromEnv();
const command = process.argv[2];
const userCode = process.argv[3];
const amount = parseInt(process.argv[4] || '100');

async function main() {
  if (command === 'create') {
    await redis.set(`credits:${userCode}`, amount);
    console.log(`✅ کد ${userCode} ساخته شد با ${amount} واحد اعتبار.`);
  } else if (command === 'check') {
    const credits = await redis.get(`credits:${userCode}`);
    console.log(`🔍 اعتبار کد ${userCode}: ${credits || 0} واحد.`);
  } else if (command === 'add') {
    await redis.incrby(`credits:${userCode}`, amount);
    console.log(`💳 ${amount} واحد به کد ${userCode} اضافه شد.`);
  }
}
main();
