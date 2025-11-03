#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const randomId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

async function main() {
  console.log('🌱 Seeding Neon Database...\n');

  try {
    // Create default tenant (or get existing)
    let tenant = await prisma.tenant.findUnique({
      where: { slug: 'acme' },
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Acme Corporation',
          slug: 'acme',
          domain: 'acme.local',
          status: 'ACTIVE',
          plan: 'PROFESSIONAL',
          maxUsers: 100,
        },
      });
      console.log('✓ Tenant created:', tenant.name);
    } else {
      console.log('✓ Tenant found (existing):', tenant.name);
    }

    // Create admin profile (idempotent by email)
    let adminProfile = await prisma.profile.findFirst({
      where: {
        email: 'admin@acme.local',
        tenantId: tenant.id,
      },
    });

    if (!adminProfile) {
      adminProfile = await prisma.profile.create({
        data: {
          userId: randomId('user_admin'),
          email: 'admin@acme.local',
          name: 'Admin User',
          role: 'SUPER_ADMIN',
          isActive: true,
          tenantId: tenant.id,
        },
      });
      console.log('✓ Admin profile created:', adminProfile.email);
    } else {
      console.log('✓ Admin profile found (existing):', adminProfile.email);
    }

    // Create regular user profiles (idempotent by email)
    const userProfiles = [];
    for (let i = 1; i <= 3; i++) {
      const email = `user${i}@acme.local`;
      let profile = await prisma.profile.findFirst({
        where: { email, tenantId: tenant.id },
      });

      if (!profile) {
        profile = await prisma.profile.create({
          data: {
            userId: randomId(`user${i}`),
            email,
            name: `User ${i}`,
            role: 'USER',
            isActive: true,
            tenantId: tenant.id,
          },
        });
        console.log(`✓ User profile created: ${profile.email}`);
      } else {
        console.log(`✓ User profile found (existing): ${profile.email}`);
      }

      userProfiles.push(profile);
    }

    // Create sample contacts
    const contacts = [];
    const contactNames = [
      { first: 'John', last: 'Doe' },
      { first: 'Jane', last: 'Smith' },
      { first: 'Robert', last: 'Johnson' },
      { first: 'Emily', last: 'Williams' },
    ];

    for (const name of contactNames) {
      const email = `${name.first.toLowerCase()}.${name.last.toLowerCase()}@example.com`;
      let contact = await prisma.contact.findFirst({
        where: {
          email,
          tenantId: tenant.id,
        },
      });

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            firstName: name.first,
            lastName: name.last,
            email,
            phone: '555-0100',
            tenantId: tenant.id,
          },
        });
        console.log(`✓ Contact created: ${contact.firstName} ${contact.lastName}`);
      } else {
        console.log(`✓ Contact found (existing): ${contact.firstName} ${contact.lastName}`);
      }

      contacts.push(contact);
    }

    // Create sample companies
    const companies = [];
    const companyNames = ['TechCorp', 'FinanceHub', 'RetailMax'];

    for (const name of companyNames) {
      let company = await prisma.company.findFirst({
        where: {
          name,
          tenantId: tenant.id,
        },
      });

      if (!company) {
        company = await prisma.company.create({
          data: {
            name,
            industry: 'Technology',
            tenantId: tenant.id,
          },
        });
        console.log(`✓ Company created: ${company.name}`);
      } else {
        console.log(`✓ Company found (existing): ${company.name}`);
      }

      companies.push(company);
    }

    // Create sample pipelines
    let pipeline = await prisma.pipeline.findFirst({
      where: {
        name: 'Sales Pipeline',
        tenantId: tenant.id,
      },
    });

    if (!pipeline) {
      pipeline = await prisma.pipeline.create({
        data: {
          name: 'Sales Pipeline',
          description: 'Default sales pipeline',
          order: 1,
          tenantId: tenant.id,
        },
      });
      console.log('✓ Pipeline created:', pipeline.name);
    } else {
      console.log('✓ Pipeline found (existing):', pipeline.name);
    }

    // Create pipeline stages
    const stages = ['Lead', 'Qualification', 'Proposal', 'Negotiation', 'Won'];
    for (let i = 0; i < stages.length; i++) {
      const stageName = stages[i];
      let stage = await prisma.pipelineStage.findFirst({
        where: {
          name: stageName,
          pipelineId: pipeline.id,
        },
      });

      if (!stage) {
        stage = await prisma.pipelineStage.create({
          data: {
            name: stageName,
            order: i + 1,
            pipelineId: pipeline.id,
          },
        });
        console.log(`✓ Pipeline stage created: ${stageName}`);
      } else {
        console.log(`✓ Pipeline stage found (existing): ${stageName}`);
      }
    }

    const leadStage = await prisma.pipelineStage.findFirst({
      where: {
        name: 'Lead',
        pipelineId: pipeline.id,
      },
    });

    if (!leadStage) {
      throw new Error('Lead pipeline stage not found; seeding aborted.');
    }

    // Create sample leads
    for (let i = 0; i < 3; i++) {
      const title = `Lead ${i + 1}`;
      let lead = await prisma.lead.findFirst({
        where: {
          title,
          tenantId: tenant.id,
        },
      });

      if (!lead) {
        lead = await prisma.lead.create({
          data: {
            title,
            description: 'Sample lead for demonstration',
            status: i === 0 ? 'NEW' : 'QUALIFIED',
            value: 10000 + i * 5000,
            contactId: contacts[i % contacts.length].id,
            pipelineId: pipeline.id,
            stageId: leadStage?.id,
            tenantId: tenant.id,
          },
        });
        console.log(`✓ Lead created: ${lead.title}`);
      } else {
        console.log(`✓ Lead found (existing): ${lead.title}`);
      }
    }

    // Create API key for testing
    let apiKey = await prisma.apiKey.findFirst({
      where: {
        name: 'Demo API Key',
        tenantId: tenant.id,
      },
    });

    if (!apiKey) {
      apiKey = await prisma.apiKey.create({
        data: {
          name: 'Demo API Key',
          keyHash: crypto
            .createHash('sha256')
            .update('sk_' + crypto.randomBytes(24).toString('hex'))
            .digest('hex'),
          keyPrefix: 'sk_demo',
          isActive: true,
          tenantId: tenant.id,
          createdBy: adminProfile.id,
        },
      });
      console.log('✓ API Key created:', apiKey.name);
    } else {
      console.log('✓ API Key found (existing):', apiKey.name);
    }

    console.log('\n✅ Database seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`  - 1 Tenant`);
    console.log(`  - 1 Admin + 3 Users`);
    console.log(`  - 4 Contacts`);
    console.log(`  - 3 Companies`);
    console.log(`  - 1 Pipeline with 5 stages`);
    console.log(`  - 3 Leads`);
    console.log(`  - 1 API Key\n`);

  } catch (error) {
    console.error('❌ Seeding Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
