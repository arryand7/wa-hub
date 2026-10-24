const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default admin
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
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

  console.log(`✅ Admin created: ${username} / ${password}`);

  // Create default API key
  await prisma.apiKey.upsert({
    where: { keyValue: 'sabira-default-api-key-2024' },
    update: {},
    create: {
      keyValue: 'sabira-default-api-key-2024',
      label: 'Default API Key',
      isActive: true,
    },
  });

  console.log('✅ Default API Key created: sabira-default-api-key-2024');
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
