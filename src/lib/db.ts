/**
 * 12-Factor App: Factor IV - Backing Services
 * Database connection through Prisma ORM
 */

import { PrismaClient } from '@prisma/client';
import { config } from '@/lib/config';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create database client instance
export const db = globalForPrisma.prisma ?? 
  new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: config.DATABASE_URL,
      },
    },
  });

// In development, save the client to prevent multiple instances
if (config.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// Export for backward compatibility
export default db;