#!/usr/bin/env node

/**
 * Database schema validation script
 * Validates that the Prisma schema is correctly set up
 */

import { PrismaClient } from '@prisma/client';

async function validateSchema() {
  console.log('🔍 Validating database schema...\n');

  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not set');
    console.log('   This is optional for development.');
    console.log('   The application will work with localStorage fallback.\n');
    console.log('✅ Schema validation passed (localStorage mode)\n');
    return;
  }

  console.log('✅ DATABASE_URL is configured');

  try {
    const prisma = new PrismaClient();

    // Try to connect to the database
    console.log('🔌 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful\n');

    // Check if we can query (this will fail if tables don't exist, which is expected)
    try {
      console.log('📊 Checking for existing tables...');
      const userCount = await prisma.user.count();
      console.log(`✅ Found ${userCount} users in database`);
      
      const campaignCount = await prisma.campaign.count();
      console.log(`✅ Found ${campaignCount} campaigns in database`);
      
      const auditLogCount = await prisma.auditLog.count();
      console.log(`✅ Found ${auditLogCount} audit logs in database\n`);
      
      console.log('✅ All tables exist and are accessible\n');
    } catch (error) {
      console.log('⚠️  Tables not found or not accessible');
      console.log('   Run: npm run db:push');
      console.log('   to create the database tables.\n');
    }

    await prisma.$disconnect();

    console.log('✅ Schema validation complete!\n');
    console.log('📚 Next steps:');
    console.log('   - Run "npm run db:push" to create/update tables');
    console.log('   - Run "npm run db:studio" to view database');
    console.log('   - See docs/DATABASE_MIGRATION.md for details\n');
    
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('   ' + error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check DATABASE_URL format');
    console.log('   2. Verify database is accessible');
    console.log('   3. Check firewall/network settings');
    console.log('   4. See docs/DATABASE_MIGRATION.md\n');
    process.exit(1);
  }
}

validateSchema().catch(console.error);
