/**
 * Job Queue System using BullMQ
 * 
 * Handles background job processing for:
 * - Email sending
 * - Data import/export
 * - Report generation
 * - Webhook delivery
 * - Async operations
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Job status tracking
 * - Dead letter queues (DLQ) for failed jobs
 * - Job scheduling (cron)
 * - Concurrency control
 * - Memory efficiency with job compression
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '@/lib/logging';

/**
 * Redis connection configuration
 * Shared across all queues
 */
const getRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    lazyConnect: false,
  };
};

/**
 * Global Redis connection
 */
export const redis = new Redis(getRedisConfig());

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('disconnect', () => {
  logger.warn('Disconnected from Redis');
});

/**
 * Queue configuration defaults
 */
const defaultQueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // Keep for 1 hour
      isPattern: false,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
};

/**
 * Job data types
 */
export interface EmailJobData {
  tenantId: string;
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
  retryCount?: number;
}

export interface ImportJobData {
  tenantId: string;
  userId: string;
  fileUrl: string;
  fileType: 'csv' | 'xlsx' | 'json';
  entityType: 'contacts' | 'companies' | 'leads';
  mappingConfig: Record<string, string>;
  dryRun?: boolean;
}

export interface ExportJobData {
  tenantId: string;
  userId: string;
  entityType: 'contacts' | 'companies' | 'leads' | 'activities';
  format: 'csv' | 'xlsx' | 'pdf';
  filters?: Record<string, any>;
  fields?: string[];
}

export interface ReportJobData {
  tenantId: string;
  userId: string;
  reportType: 'sales' | 'pipeline' | 'contacts' | 'activities';
  format: 'pdf' | 'xlsx' | 'html';
  dateRange: {
    startDate: string;
    endDate: string;
  };
  filters?: Record<string, any>;
}

export interface WebhookJobData {
  tenantId: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, any>;
  attemptNumber?: number;
}

export interface NotificationJobData {
  tenantId: string;
  userId: string;
  type: 'email' | 'in-app' | 'push';
  title: string;
  message: string;
  data?: Record<string, any>;
  actionUrl?: string;
}

/**
 * Queue factory
 */
function createQueue<T>(
  name: string,
  options?: any
): Queue<T> {
  return new Queue<T>(name, {
    ...defaultQueueOptions,
    ...options,
  });
}

/**
 * Email Queue
 * Handles all email sending operations
 */
export const emailQueue = createQueue<EmailJobData>('email', {
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 5, // More retries for email
    priority: 100, // Higher priority
  },
});

/**
 * Import/Export Queue
 * Handles data import and export operations
 */
export const importExportQueue = createQueue<ImportJobData | ExportJobData>(
  'import-export',
  {
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 2,
      timeout: 300000, // 5 minutes
    },
  }
);

/**
 * Report Generation Queue
 * Handles report generation and rendering
 */
export const reportQueue = createQueue<ReportJobData>('report', {
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3,
    timeout: 600000, // 10 minutes
    priority: 50,
  },
});

/**
 * Webhook Delivery Queue
 * Handles webhook event delivery to external systems
 */
export const webhookQueue = createQueue<WebhookJobData>('webhook', {
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 10, // Many retries for webhook reliability
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 30000, // 30 seconds per attempt
  },
});

/**
 * Notification Queue
 * Handles in-app notifications, emails, and push notifications
 */
export const notificationQueue = createQueue<NotificationJobData>(
  'notification',
  {
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 3,
      priority: 150, // Highest priority - real-time notifications
    },
  }
);

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string) {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const [active, delayed, failed, completed, waiting] = await Promise.all([
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
    queue.getWaitingCount(),
  ]);

  return {
    queueName,
    active,
    delayed,
    failed,
    completed,
    waiting,
    total: active + delayed + failed + completed + waiting,
    health: {
      isHealthy: failed === 0 || (failed / (completed || 1)) < 0.1, // < 10% failure rate
      failureRate: completed > 0 ? (failed / completed) * 100 : 0,
    },
  };
}

/**
 * Get queue by name
 */
export function getQueueByName(name: string): Queue | null {
  const queues: Record<string, Queue> = {
    email: emailQueue,
    'import-export': importExportQueue,
    report: reportQueue,
    webhook: webhookQueue,
    notification: notificationQueue,
  };
  return queues[name] || null;
}

/**
 * Get all queues
 */
export function getAllQueues(): Record<string, Queue> {
  return {
    email: emailQueue,
    'import-export': importExportQueue,
    report: reportQueue,
    webhook: webhookQueue,
    notification: notificationQueue,
  };
}

/**
 * Clear all jobs from a queue (use with caution!)
 */
export async function clearQueue(queueName: string) {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }
  await queue.drain();
  logger.warn(`Cleared all jobs from queue: ${queueName}`);
}

/**
 * Close all queues gracefully
 */
export async function closeAllQueues() {
  const queues = getAllQueues();
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await redis.quit();
  logger.info('All queues closed');
}

/**
 * Queue health check
 */
export async function checkQueueHealth() {
  try {
    const queues = getAllQueues();
    const health = await Promise.all(
      Object.keys(queues).map((name) => getQueueStats(name))
    );

    const anyUnhealthy = health.some((h) => !h.health.isHealthy);

    return {
      status: anyUnhealthy ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      queues: health,
    };
  } catch (error) {
    const errorData = error instanceof Error ? { message: error.message, stack: error.stack } : {};
    logger.error('Queue health check failed:', errorData);
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retry failed job
 */
export async function retryFailedJob(jobId: string, queueName: string) {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Job "${jobId}" not found in queue "${queueName}"`);
  }

  await job.retry();
  logger.info(`Retried job ${jobId} in queue ${queueName}`);
}

/**
 * Remove job
 */
export async function removeJob(jobId: string, queueName: string) {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Job "${jobId}" not found in queue "${queueName}"`);
  }

  await job.remove();
  logger.info(`Removed job ${jobId} from queue ${queueName}`);
}

/**
 * Get job details
 */
export async function getJobDetails(jobId: string, queueName: string) {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Job "${jobId}" not found in queue "${queueName}"`);
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'function' ? job.progress() : job.progress;

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress: progress || 0,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    createdTimestamp: job.timestamp,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}

/**
 * Export queue utilities
 */
export const queueUtils = {
  getQueueStats,
  getQueueByName,
  getAllQueues,
  clearQueue,
  closeAllQueues,
  checkQueueHealth,
  retryFailedJob,
  removeJob,
  getJobDetails,
};
