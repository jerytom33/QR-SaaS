/**
 * 12-Factor App: Factor III - Config
 * Store configuration in environment variables
 */

import { z } from 'zod';

// Environment variable schema with validation
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Database Configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // NextAuth Configuration
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  
  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  
  // QR Authentication
  QR_SESSION_EXPIRES_IN: z.string().default('5m'),
  QR_CODE_SIZE: z.coerce.number().default(256),
  // WhatsApp QR Provider
  WA_QR_PROVIDER: z.enum(['baileys', 'local']).default('baileys'),
  WA_QR_TIMEOUT_MS: z.coerce.number().default(15000),
  WA_AUTH_DIR: z.string().default('./.wa-auth'),
  
  // API Configuration
  API_RATE_LIMIT: z.coerce.number().default(100),
  API_RATE_LIMIT_WINDOW: z.coerce.number().default(900000), // 15 minutes
  
  // Email Configuration (for production)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  
  // File Upload Configuration
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB
  UPLOAD_DIR: z.string().default('./uploads'),
  
  // Redis Configuration (for production caching)
  REDIS_URL: z.string().optional(),
  REDIS_PREFIX: z.string().default('crmflow:'),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  
  // Security Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_STRICT: z.coerce.boolean().default(false),
  
  // Monitoring Configuration
  SENTRY_DSN: z.string().optional(),
  NEW_RELIC_LICENSE_KEY: z.string().optional(),
  
  // Feature Flags
  ENABLE_ANALYTICS: z.coerce.boolean().default(true),
  ENABLE_MONITORING: z.coerce.boolean().default(false),
  ENABLE_CACHE: z.coerce.boolean().default(true),
  
  // Multi-tenancy
  DEFAULT_TENANT_PLAN: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']).default('FREE'),
  MAX_TENANT_USERS: z.object({
    FREE: z.number().default(5),
    STARTER: z.number().default(25),
    PROFESSIONAL: z.number().default(100),
    ENTERPRISE: z.number().default(-1) // Unlimited
  }).optional(),
  
  // Database Connection Pool
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  
  // Session Configuration
  SESSION_MAX_AGE: z.coerce.number().default(86400 * 7), // 7 days
  SESSION_UPDATE_AGE: z.coerce.number().default(86400), // 1 day
});

// Validate and parse environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:');
    if (error instanceof z.ZodError) {
      error.issues.forEach(issue => {
        console.error(`   ${issue.path.join('.')}: ${issue.message}`);
      });
    } else {
      console.error('   Unknown validation error:', error);
    }
    process.exit(1);
  }
}

// Export validated configuration
export const config = validateEnv();

// Configuration helpers
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// Database configuration
export const databaseConfig = {
  url: config.DATABASE_URL,
  pool: {
    min: config.DATABASE_POOL_MIN,
    max: config.DATABASE_POOL_MAX,
  },
};

// JWT configuration
export const jwtConfig = {
  secret: config.JWT_SECRET,
  expiresIn: config.JWT_EXPIRES_IN,
  refreshExpiresIn: config.REFRESH_TOKEN_EXPIRES_IN,
};

// QR Authentication configuration
export const qrConfig = {
  sessionExpiresIn: config.QR_SESSION_EXPIRES_IN,
  codeSize: config.QR_CODE_SIZE,
};

// WhatsApp / Baileys configuration
export const whatsappConfig = {
  provider: config.WA_QR_PROVIDER,
  timeoutMs: config.WA_QR_TIMEOUT_MS,
  authDir: config.WA_AUTH_DIR,
};

// API configuration
export const apiConfig = {
  rateLimit: {
    windowMs: config.API_RATE_LIMIT_WINDOW,
    max: config.API_RATE_LIMIT,
  },
  cors: {
    origin: config.CORS_ORIGIN,
    credentials: true,
  },
};

// Logging configuration
export const logConfig = {
  level: config.LOG_LEVEL,
  format: config.LOG_FORMAT,
};

// File upload configuration
export const uploadConfig = {
  maxSize: config.MAX_FILE_SIZE,
  directory: config.UPLOAD_DIR,
};

// Redis configuration (if available)
export const redisConfig = config.REDIS_URL ? {
  url: config.REDIS_URL,
  prefix: config.REDIS_PREFIX,
} : null;

// Monitoring configuration
export const monitoringConfig = {
  sentry: config.SENTRY_DSN ? {
    dsn: config.SENTRY_DSN,
  } : null,
  newRelic: config.NEW_RELIC_LICENSE_KEY ? {
    licenseKey: config.NEW_RELIC_LICENSE_KEY,
  } : null,
};

// Feature flags
export const features = {
  analytics: config.ENABLE_ANALYTICS,
  monitoring: config.ENABLE_MONITORING,
  cache: config.ENABLE_CACHE,
};

// Tenant configuration
export const tenantConfig = {
  defaultPlan: config.DEFAULT_TENANT_PLAN,
  maxUsers: config.MAX_TENANT_USERS || {
    FREE: 5,
    STARTER: 25,
    PROFESSIONAL: 100,
    ENTERPRISE: -1,
  },
};

// Export all configurations for easy importing
const configExports = {
  config,
  isDevelopment,
  isProduction,
  isTest,
  databaseConfig,
  jwtConfig,
  qrConfig,
  apiConfig,
  logConfig,
  uploadConfig,
  redisConfig,
  monitoringConfig,
  features,
  tenantConfig,
  whatsappConfig,
};

export default configExports;