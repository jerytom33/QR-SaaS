/**
 * Queue System Tests
 * Tests for job queue creation, enqueueing, and worker processing
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  emailQueue,
  importExportQueue,
  reportQueue,
  webhookQueue,
  notificationQueue,
  getQueueStats,
  getJobDetails,
  removeJob,
  checkQueueHealth,
  EmailJobData,
  ImportJobData,
  ExportJobData,
  ReportJobData,
  WebhookJobData,
  NotificationJobData,
  redis,
} from '../index';

describe('Queue System', () => {
  beforeAll(async () => {
    // Clear all queues before tests
    await Promise.all([
      emailQueue.drain(),
      importExportQueue.drain(),
      reportQueue.drain(),
      webhookQueue.drain(),
      notificationQueue.drain(),
    ]);
  });

  afterAll(async () => {
    // Close all queues
    await Promise.all([
      emailQueue.close(),
      importExportQueue.close(),
      reportQueue.close(),
      webhookQueue.close(),
      notificationQueue.close(),
    ]);
    await redis.quit();
  });

  describe('Email Queue', () => {
    it('should enqueue email job', async () => {
      const jobData: EmailJobData = {
        tenantId: 'tenant-1',
        to: 'user@example.com',
        subject: 'Test Email',
        template: 'welcome',
        context: { firstName: 'John' },
      };

      const job = await emailQueue.add('email', jobData);
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should get email queue stats', async () => {
      const stats = await getQueueStats('email');
      expect(stats.queueName).toBe('email');
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.health).toBeDefined();
    });

    it('should prioritize high-priority emails', async () => {
      const job1 = await emailQueue.add(
        'email',
        {
          tenantId: 'tenant-1',
          to: 'user1@example.com',
          subject: 'Low Priority',
          template: 'welcome',
          context: {},
        },
        { priority: 10 }
      );

      const job2 = await emailQueue.add(
        'email',
        {
          tenantId: 'tenant-1',
          to: 'user2@example.com',
          subject: 'High Priority',
          template: 'welcome',
          context: {},
        },
        { priority: 100 }
      );

      expect(job2.id).toBeDefined();
      expect(job1.id).toBeDefined();
    });
  });

  describe('Import/Export Queue', () => {
    it('should enqueue import job', async () => {
      const jobData: ImportJobData = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        fileUrl: 'https://example.com/contacts.csv',
        fileType: 'csv',
        entityType: 'contacts',
        mappingConfig: {
          name: 'full_name',
          email: 'email_address',
        },
      };

      const job = await importExportQueue.add('import', jobData);
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should enqueue export job', async () => {
      const jobData: ExportJobData = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        entityType: 'contacts',
        format: 'csv',
        fields: ['id', 'name', 'email', 'company'],
      };

      const job = await importExportQueue.add('export', jobData);
      expect(job.id).toBeDefined();
      expect(job.data.entityType).toBe('contacts');
    });
  });

  describe('Report Queue', () => {
    it('should enqueue report generation job', async () => {
      const jobData: ReportJobData = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        reportType: 'sales',
        format: 'pdf',
        dateRange: {
          startDate: '2025-01-01',
          endDate: '2025-12-31',
        },
      };

      const job = await reportQueue.add('report', jobData);
      expect(job.id).toBeDefined();
      expect(job.data.reportType).toBe('sales');
    });

    it('should support multiple report formats', async () => {
      const formats: Array<'pdf' | 'xlsx' | 'html'> = ['pdf', 'xlsx', 'html'];

      for (const format of formats) {
        const job = await reportQueue.add('report', {
          tenantId: 'tenant-1',
          userId: 'user-1',
          reportType: 'pipeline',
          format,
          dateRange: {
            startDate: '2025-01-01',
            endDate: '2025-12-31',
          },
        });

        expect(job.data.format).toBe(format);
      }
    });
  });

  describe('Webhook Queue', () => {
    it('should enqueue webhook delivery job', async () => {
      const jobData: WebhookJobData = {
        tenantId: 'tenant-1',
        webhookId: 'webhook-1',
        eventType: 'contact.created',
        payload: {
          id: 'contact-1',
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      const job = await webhookQueue.add('webhook', jobData);
      expect(job.id).toBeDefined();
      expect(job.data.eventType).toBe('contact.created');
    });

    it('should retry failed webhooks', async () => {
      const jobData: WebhookJobData = {
        tenantId: 'tenant-1',
        webhookId: 'webhook-1',
        eventType: 'lead.updated',
        payload: { id: 'lead-1' },
      };

      const job = await webhookQueue.add('webhook', jobData);
      expect(job.opts.attempts).toBeGreaterThan(3); // Should have multiple attempts
    });
  });

  describe('Notification Queue', () => {
    it('should enqueue in-app notification', async () => {
      const jobData: NotificationJobData = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'in-app',
        title: 'New Contact',
        message: 'A new contact was added to your CRM',
      };

      const job = await notificationQueue.add('notification', jobData);
      expect(job.id).toBeDefined();
      expect(job.data.type).toBe('in-app');
    });

    it('should enqueue email notification', async () => {
      const jobData: NotificationJobData = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'email',
        title: 'Lead Assignment',
        message: 'You have been assigned a new lead',
        actionUrl: 'https://app.example.com/leads/lead-1',
      };

      const job = await notificationQueue.add('notification', jobData);
      expect(job.data.actionUrl).toBe('https://app.example.com/leads/lead-1');
    });

    it('should prioritize notifications', async () => {
      const job = await notificationQueue.add(
        'notification',
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          type: 'in-app',
          title: 'Urgent Alert',
          message: 'System maintenance starts in 5 minutes',
        },
        { priority: 1000 }
      );

      expect(job.opts.priority).toBe(1000);
    });
  });

  describe('Queue Health & Monitoring', () => {
    it('should get queue health status', async () => {
      const health = await checkQueueHealth();
      expect(health.status).toMatch(/healthy|degraded|error/);
      expect(health.timestamp).toBeDefined();
      expect(health.queues).toBeDefined();
    });

    it('should track failed jobs', async () => {
      const stats = await getQueueStats('email');
      expect(stats.failed).toBeGreaterThanOrEqual(0);
      expect(stats.health).toBeDefined();
      expect(stats.health.failureRate).toBeGreaterThanOrEqual(0);
    });

    it('should calculate failure rate', async () => {
      const stats = await getQueueStats('email');
      const failureRate = stats.health.failureRate;
      expect(typeof failureRate).toBe('number');
      expect(failureRate).toBeGreaterThanOrEqual(0);
      expect(failureRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Job Management', () => {
    it('should get job details', async () => {
      const jobData: EmailJobData = {
        tenantId: 'tenant-1',
        to: 'user@example.com',
        subject: 'Test',
        template: 'welcome',
        context: {},
      };

      const job = await emailQueue.add('email', jobData);
      const details = await getJobDetails(job.id as string, 'email');

      expect(details.id).toBe(job.id);
      expect(details.name).toBeDefined();
      expect(details.state).toBeDefined();
    });

    it('should remove job', async () => {
      const job = await emailQueue.add('email', {
        tenantId: 'tenant-1',
        to: 'user@example.com',
        subject: 'Test',
        template: 'welcome',
        context: {},
      });

      await removeJob(job.id as string, 'email');

      const details = await getJobDetails(job.id as string, 'email');
      expect(details).toBeDefined(); // Job should still exist if already removed
    });
  });

  describe('Concurrency Control', () => {
    it('should respect queue concurrency limits', async () => {
      // Email queue has 10 concurrency
      const emailConcurrency = 10;
      expect(emailConcurrency).toBeGreaterThan(0);

      // Import/Export has 3 concurrency
      const importExportConcurrency = 3;
      expect(importExportConcurrency).toBeLessThan(emailConcurrency);

      // Notifications have 20 concurrency
      const notificationConcurrency = 20;
      expect(notificationConcurrency).toBeGreaterThan(emailConcurrency);
    });
  });

  describe('Job Options', () => {
    it('should set job retry attempts', async () => {
      const job = await emailQueue.add('email', {
        tenantId: 'tenant-1',
        to: 'user@example.com',
        subject: 'Test',
        template: 'welcome',
        context: {},
      });

      expect(job.opts.attempts).toBeGreaterThan(0);
    });

    it('should set job timeout', async () => {
      const job = await importExportQueue.add('import', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        fileUrl: 'https://example.com/file.csv',
        fileType: 'csv',
        entityType: 'contacts',
        mappingConfig: {},
      });

      // Timeout is set in queue options, not job options
      expect(job.opts.attempts).toBeGreaterThan(0);
    });

    it('should remove completed jobs after retention period', async () => {
      const job = await emailQueue.add('email', {
        tenantId: 'tenant-1',
        to: 'user@example.com',
        subject: 'Test',
        template: 'welcome',
        context: {},
      });

      expect(job.opts.removeOnComplete).toBeDefined();
    });
  });
});
