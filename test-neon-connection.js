#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

console.log('🔍 Testing Neon Database Connection...\n');

const prisma = new PrismaClient();

(async () => {
  try {
    // Test raw query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Raw query successful:', result);

    // Check table counts
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('\n✓ Database tables found:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

    // Try to query a table
    const tenantCount = await prisma.tenant.count();
    console.log(`\n✓ Tenants table accessible: ${tenantCount} records`);

    console.log('\n✅ Neon Database Connection Successful!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection Error:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
