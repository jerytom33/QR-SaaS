/**
 * Seed script for demo accounts
 * Creates demo users for Super Admin, Tenant Admin, and Regular User
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDemoAccounts() {
  console.log('🌱 Seeding demo accounts...');

  try {
    // Create demo tenant
    const demoTenant = await prisma.tenant.upsert({
      where: { slug: 'demo-company' },
      update: {},
      create: {
        id: 'demo_tenant_id',
        name: 'Demo Company Inc',
        slug: 'demo-company',
        domain: 'demo-company.com',
        status: 'ACTIVE',
        plan: 'PROFESSIONAL',
        maxUsers: 50,
      },
    });

    // Create another tenant for multi-tenant testing
    const acmeTenant = await prisma.tenant.upsert({
      where: { slug: 'acme-corp' },
      update: {},
      create: {
        id: 'acme_tenant_id',
        name: 'Acme Corporation',
        slug: 'acme-corp',
        domain: 'acme-corp.com',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
        maxUsers: 100,
      },
    });

    // Demo profiles
    const demoProfiles = [
      {
        id: 'super_admin_profile',
        userId: 'super_admin_user',
        email: 'superadmin@demo.com',
        name: 'Super Admin',
        role: 'SUPER_ADMIN' as const,
        tenantId: demoTenant.id,
      },
      {
        id: 'tenant_admin_profile',
        userId: 'tenant_admin_user',
        email: 'admin@demo.com',
        name: 'Tenant Administrator',
        role: 'TENANT_ADMIN' as const,
        tenantId: demoTenant.id,
      },
      {
        id: 'regular_user_profile',
        userId: 'regular_user_user',
        email: 'user@demo.com',
        name: 'Regular User',
        role: 'USER' as const,
        tenantId: demoTenant.id,
      },
      {
        id: 'acme_admin_profile',
        userId: 'acme_admin_user',
        email: 'admin@acme-corp.com',
        name: 'Acme Admin',
        role: 'TENANT_ADMIN' as const,
        tenantId: acmeTenant.id,
      },
    ];

    // Create demo profiles
    for (const profileData of demoProfiles) {
      await prisma.profile.upsert({
        where: { userId: profileData.userId },
        update: profileData,
        create: profileData,
      });
    }

    // Create sample pipeline for demo tenant
    const demoPipeline = await prisma.pipeline.upsert({
      where: { id: 'demo_pipeline_id' },
      update: {},
      create: {
        id: 'demo_pipeline_id',
        name: 'Sales Pipeline',
        description: 'Main sales process pipeline',
        tenantId: demoTenant.id,
        order: 0,
      },
    });

    // Create pipeline stages
    const pipelineStages = [
      { name: 'Lead', color: '#3b82f6', order: 0 },
      { name: 'Qualified', color: '#8b5cf6', order: 1 },
      { name: 'Proposal', color: '#f59e0b', order: 2 },
      { name: 'Negotiation', color: '#ef4444', order: 3 },
      { name: 'Closed Won', color: '#10b981', order: 4 },
      { name: 'Closed Lost', color: '#6b7280', order: 5 },
    ];

    for (const stage of pipelineStages) {
      await prisma.pipelineStage.upsert({
        where: { 
          id: `stage_${demoPipeline.id}_${stage.order}`
        },
        update: stage,
        create: {
          id: `stage_${demoPipeline.id}_${stage.order}`,
          ...stage,
          pipelineId: demoPipeline.id,
        },
      });
    }

    // Create sample companies
    const companies = [
      {
        id: 'company_1',
        name: 'Tech Innovations LLC',
        domain: 'techinnovations.com',
        industry: 'Technology',
        size: '50-100',
        tenantId: demoTenant.id,
      },
      {
        id: 'company_2', 
        name: 'Global Solutions Inc',
        domain: 'globalsolutions.com',
        industry: 'Consulting',
        size: '100-500',
        tenantId: demoTenant.id,
      },
    ];

    for (const company of companies) {
      await prisma.company.upsert({
        where: { id: company.id },
        update: company,
        create: company,
      });
    }

    // Create sample contacts
    const contacts = [
      {
        id: 'contact_1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@techinnovations.com',
        phone: '+1-555-0123',
        title: 'CTO',
        tenantId: demoTenant.id,
        companyId: 'company_1',
      },
      {
        id: 'contact_2',
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@globalsolutions.com',
        phone: '+1-555-0124',
        title: 'VP of Sales',
        tenantId: demoTenant.id,
        companyId: 'company_2',
      },
    ];

    for (const contact of contacts) {
      await prisma.contact.upsert({
        where: { id: contact.id },
        update: contact,
        create: contact,
      });
    }

    console.log('✅ Demo accounts seeded successfully!');
    console.log('\n📋 Demo Account Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Super Admin:');
    console.log('   Email: superadmin@demo.com');
    console.log('   Role: Super Admin (can manage all tenants)');
    console.log('');
    console.log('🏢 Tenant Admin (Demo Company):');
    console.log('   Email: admin@demo.com');
    console.log('   Role: Tenant Administrator');
    console.log('');
    console.log('👤 Regular User (Demo Company):');
    console.log('   Email: user@demo.com');
    console.log('   Role: Regular User');
    console.log('');
    console.log('🏢 Acme Corp Admin:');
    console.log('   Email: admin@acme-corp.com');
    console.log('   Role: Tenant Administrator');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Error seeding demo accounts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  seedDemoAccounts();
}

export default seedDemoAccounts;