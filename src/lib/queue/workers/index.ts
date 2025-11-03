/**
 * Queue Workers Index
 * Exports all workers
 */

export { emailWorker } from './email.worker';
export { importExportWorker } from './import-export.worker';
export { reportWorker } from './report.worker';
export { webhookWorker } from './webhook.worker';
export { notificationWorker } from './notification.worker';

/**
 * Initialize all workers
 * Call this in your application startup
 */
export async function initializeAllWorkers() {
  // Import to initialize
  await import('./email.worker');
  await import('./import-export.worker');
  await import('./report.worker');
  await import('./webhook.worker');
  await import('./notification.worker');
}
