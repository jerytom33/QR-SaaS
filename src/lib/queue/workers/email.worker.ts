/**
 * Email Queue Worker
 * 
 * Processes email sending jobs asynchronously
 * Features:
 * - Template rendering
 * - Retry with exponential backoff
 * - Delivery tracking
 * - Failed email logging
 */

import { Worker, Job } from 'bullmq';
import { redis, EmailJobData } from '../index';
import { logger } from '@/lib/logging';
import { sendEmailViaProvider, renderEmailTemplate } from '@/lib/email';

/**
 * Email worker
 */
export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    const { tenantId, to, subject, template, context } = job.data;

    try {
      logger.info(`Processing email job ${job.id}`, {
        tenantId,
        to,
        template,
        attempt: job.attemptsMade + 1,
      });

      // Update job progress
      job.updateProgress(10);

      // Render email template (20%)
      const htmlContent = await renderEmailTemplate(template, context);
      job.updateProgress(30);

      // Send email via provider (SendGrid, AWS SES, etc.)
      const result = await sendEmailViaProvider({
        to,
        subject,
        html: htmlContent,
        tenantId,
      });
      job.updateProgress(70);

      // TODO: Log email send in database once EmailLog model is added to schema
      // await db.emailLog.create({...})

      job.updateProgress(100);

      logger.info(`Email job ${job.id} completed successfully`, {
        tenantId,
        to,
        messageId: result.messageId,
      });

      return {
        success: true,
        messageId: result.messageId,
        recipient: to,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Email job ${job.id} failed`, {
        tenantId,
        to,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
      });

      // TODO: Log failed email to database once EmailLog model is added to schema

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 10, // Process 10 emails in parallel
  }
);

/**
 * Email worker events
 */
emailWorker.on('completed', (job) => {
  logger.debug(`Email job ${job.id} completed`, { jobId: job.id });
});

emailWorker.on('failed', (job, error) => {
  logger.warn(`Email job ${job?.id} failed`, {
    jobId: job?.id,
    error: error.message,
  });
});

emailWorker.on('error', (error) => {
  logger.error('Email worker error', error);
});

export default emailWorker;
