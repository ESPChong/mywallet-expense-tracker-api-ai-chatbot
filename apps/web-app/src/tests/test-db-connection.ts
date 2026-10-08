import { PrismaClient } from '../generated/prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function testConnection() {
  try {
    // Test connection by counting users
    const userCount = await prisma.user.count();
    console.log('✅ Successfully connected to MongoDB!');
    console.log(`📊 Current user count: ${userCount}`);

    // Try creating a test user
    const testUser = await prisma.user.create({
      data: {
        name: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: 'testpassword123',
      },
    });
    console.log('✅ Successfully created test user:', testUser.email);

    // Clean up - delete test user
    await prisma.user.delete({
      where: { id: testUser.id },
    });
    console.log('✅ Test completed and cleaned up');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
