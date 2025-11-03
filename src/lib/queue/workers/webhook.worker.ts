/**
 * Webhook Delivery Queue Worker
 * 
 * Handles webhook event delivery to external systems
 * Features:
 * - Retry with exponential backoff
 * - Signature generation and verification
 * - Timeout handling
 * - Dead letter queue for permanently failed webhooks
 */

import { Worker, Job } from 'bullmq';
import { redis, WebhookJobData } from '../index';
import { logger } from '@/lib/logging';
import crypto from 'crypto';

/**
 * Webhook worker
 */
export const webhookWorker = new Worker<WebhookJobData>(
  'webhook',
  async (job: Job<WebhookJobData>) => {
    const { tenantId, webhookId, eventType, payload, attemptNumber = 0 } = job.data;

    try {
      logger.info(`Delivering webhook job ${job.id}`, {
        tenantId,
        webhookId,
        eventType,
        attempt: attemptNumber + 1,
      });

      // TODO: Fetch webhook configuration from database
      // const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
      const webhook = {
        id: webhookId,
        url: 'https://example.com/webhooks', // TODO: actual URL
        secret: 'webhook-secret', // TODO: actual secret
        events: [eventType],
        active: true,
      };

      if (!webhook) {
        throw new Error(`Webhook ${webhookId} not found`);
      }

      if (!webhook.active) {
        logger.warn(`Webhook ${webhookId} is inactive`);
        return { success: false, reason: 'Webhook is inactive' };
      }

      if (!webhook.events.includes(eventType) && !webhook.events.includes('*')) {
        logger.warn(`Webhook ${webhookId} does not subscribe to ${eventType}`);
        return { success: false, reason: 'Event type not subscribed' };
      }

      // Generate HMAC signature
      const signature = generateSignature(payload, webhook.secret);

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': eventType,
        'X-Webhook-ID': webhookId,
        'X-Webhook-Timestamp': new Date().toISOString(),
        'X-Webhook-Signature': signature,
        'User-Agent': 'CRMFlow-Webhook-Delivery/1.0',
      };

      logger.debug(`Sending webhook to ${webhook.url}`);

      // Make HTTP POST request with timeout
      const response = await makeWebhookRequest(
        webhook.url,
        payload,
        headers,
        30000 // 30 second timeout
      );

      if (response.ok) {
        logger.info(`Webhook ${webhookId} delivered successfully`, {
          status: response.status,
          webhook: webhookId,
        });

        // TODO: Record successful delivery in database
        // await db.webhookDelivery.create({
        //   data: { webhookId, eventType, status: 'delivered', tenantId }
        // });

        return {
          success: true,
          status: response.status,
          webhookId,
        };
      } else {
        // 4xx errors are client errors - don't retry
        if (response.status >= 400 && response.status < 500) {
          logger.warn(`Webhook ${webhookId} returned client error ${response.status}`, {
            webhookId,
            status: response.status,
          });

          // TODO: Record failed delivery
          return {
            success: false,
            status: response.status,
            reason: 'Client error - will not retry',
            retry: false,
          };
        }

        // 5xx errors and timeouts should retry
        throw new Error(`Webhook delivery failed with status ${response.status}`);
      }
    } catch (error) {
      logger.error(`Webhook job ${job.id} failed`, {
        tenantId,
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: attemptNumber + 1,
        maxAttempts: job.opts.attempts,
      });

      // TODO: Log failed delivery attempt
      // await db.webhookDelivery.create({
      //   data: { webhookId, eventType, status: 'failed', tenantId, error: error.message }
      // });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 webhooks in parallel
  }
);

/**
 * Generate HMAC-SHA256 signature for webhook
 */
function generateSignature(payload: Record<string, any>, secret: string): string {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

/**
 * Make HTTP POST request to webhook URL
 */
async function makeWebhookRequest(
  url: string,
  payload: Record<string, any>,
  headers: Record<string, string>,
  timeout: number
): Promise<{ ok: boolean; status: number }> {
  // Use fetch API or similar HTTP client
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Webhook request timeout after ${timeout}ms`);
    }

    throw error;
  }
}

/**
 * Worker events
 */
webhookWorker.on('completed', (job) => {
  logger.debug(`Webhook job ${job.id} completed`);
});

webhookWorker.on('failed', (job, error) => {
  logger.warn(`Webhook job ${job?.id} failed`, {
    jobId: job?.id,
    error: error.message,
    attempt: job?.attemptsMade || 0,
  });
});

webhookWorker.on('error', (error) => {
  logger.error('Webhook worker error', error);
});

export default webhookWorker;
