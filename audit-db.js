const { Redis } = require('@upstash/redis');
const { Index } = require('@upstash/vector');
const fs = require('fs');
const path = require('path');

// خواندن فایل .env.local
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
} catch (e) {
  console.log('⚠️ فایل .env.local پیدا نشد.');
  process.exit(1);
}

async function audit() {
  console.log('\n🔍 در حال بازرسی پایگاه‌های دانش...\n');

  // ۱. بازرسی Redis
  try {
    const redis = Redis.fromEnv();
    const testCode = 'TEST-USER';
    const credits = await redis.get(`credits:${testCode}`);
    console.log('📦 وضعیت Upstash Redis:');
    console.log(`   - اتصال: ✅ موفق`);
    console.log(`   - اعتبار کاربر تست (${testCode}): ${credits !== null ? credits + ' واحد' : '❌ تعریف نشده'}`);
  } catch (e) {
    console.log('📦 وضعیت Upstash Redis: ❌ خطا در اتصال');
    console.log(`   - جزئیات: ${e.message}`);
  }

  // ۲. بازرسی Vector DB
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN,
    });
    
    // گرفتن اطلاعات کلی ایندکس
    const info = await index.info();
    console.log('\n🧠 وضعیت Upstash Vector (حافظه معنایی):');
    console.log(`   - اتصال: ✅ موفق`);
    console.log(`   - تعداد بردارهای ذخیره‌شده (Total Vectors): ${info.vectorCount}`);
    console.log(`   - ابعاد ایندکس (Dimensions): ${info.dimension}`);
    console.log(`   - تعداد نمونه‌های ذخیره‌شده: ${info.pendingVectorCount || 0} در صف`);
  } catch (e) {
    console.log('\n🧠 وضعیت Upstash Vector: ❌ خطا در اتصال');
    console.log(`   - جزئیات: ${e.message}`);
  }

  console.log('\n--------------------------------------------------');
}

audit();
