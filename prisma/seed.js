const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const apiKey = process.env.API_KEY;

  if (!username || !password || password.length < 10 ||
      /replace-with|change-me|example|your-/i.test(password)) {
    throw new Error('Set a unique ADMIN_USERNAME and a non-placeholder ADMIN_PASSWORD of at least 10 characters before seeding');
  }
  if (apiKey && (apiKey.length < 32 || /replace-with|change-me|example|your-/i.test(apiKey))) {
    throw new Error('API_KEY must be random and at least 32 characters when provided');
  }

  const hash = await bcrypt.hash(password, 12);

  await prisma.admin.upsert({
    where: { username },
    update: { passwordHash: hash },
    create: {
      username,
      passwordHash: hash,
      displayName: 'Administrator',
    },
  });

  console.log('✅ Admin account provisioned');

  if (apiKey) {
    await prisma.apiKey.upsert({
      where: { keyValue: apiKey },
      update: {},
      create: {
        keyValue: apiKey,
        label: 'Provisioned API Key',
        isActive: true,
      },
    });
    console.log('✅ API key provisioned');
  }
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
