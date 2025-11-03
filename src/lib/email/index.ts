/**
 * Email Module
 * Central export for all email-related functionality
 */

export { sendEmailViaProvider, mockSendEmail } from './provider';
export type { SendEmailOptions, SendEmailResult } from './provider';
export { renderEmailTemplate, getTemplate, registerTemplate, getAllTemplates } from './templates';
