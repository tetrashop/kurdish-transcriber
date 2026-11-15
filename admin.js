const { Redis } = require('@upstash/redis');
const fs = require('fs');
const path = require('path');

// خواندن دستی فایل .env.local بدون نیاز به پکیج dotenv
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      process.env[key] = value;
    }
  });
} catch (e) {
  console.log('⚠️ فایل .env.local پیدا نشد یا قابل خواندن نیست.');
  process.exit(1);
}

const redis = Redis.fromEnv();
const command = process.argv[2];
const userCode = process.argv[3];
const amount = parseInt(process.argv[4] || '100');

async function main() {
  if (!command || !userCode) {
    console.log('روش استفاده: node admin.js [create|check|add] [USER-CODE] [AMOUNT]');
    return;
  }

  try {
    if (command === 'create') {
      await redis.set(`credits:${userCode}`, amount);
      console.log(`✅ کد ${userCode} ساخته شد با ${amount} واحد اعتبار.`);
    } else if (command === 'check') {
      const credits = await redis.get(`credits:${userCode}`);
      console.log(`🔍 اعتبار کد ${userCode}: ${credits || 0} واحد.`);
    } else if (command === 'add') {
      await redis.incrby(`credits:${userCode}`, amount);
      console.log(`💳 ${amount} واحد به کد ${userCode} اضافه شد.`);
    } else {
      console.log('❌ دستور نامعتبر است.');
    }
  } catch (e) {
    console.error('❌ خطا در ارتباط با دیتابیس Upstash:', e.message);
  }
}

main();
