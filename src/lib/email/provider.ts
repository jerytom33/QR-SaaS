/**
 * Email Service Provider Integration
 * Supports multiple providers: SendGrid, AWS SES, Resend, Mailgun
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  tenantId: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export interface SendEmailResult {
  messageId: string;
  timestamp: string;
  status: 'queued' | 'sent';
}

/**
 * Send email via configured provider
 */
export async function sendEmailViaProvider(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const provider = process.env.EMAIL_PROVIDER || 'sendgrid';

  switch (provider) {
    case 'sendgrid':
      return sendViaSendGrid(options);
    case 'aws-ses':
      return sendViaAwsSES(options);
    case 'resend':
      return sendViaResend(options);
    case 'mailgun':
      return sendViaMailgun(options);
    default:
      // Mock implementation for development
      return mockSendEmail(options);
  }
}

/**
 * SendGrid implementation
 */
async function sendViaSendGrid(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: options.to,
      from: process.env.EMAIL_FROM || 'noreply@crmflow.app',
      subject: options.subject,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      attachments: options.attachments,
      categories: [`tenant:${options.tenantId}`, 'crmflow'],
      customArgs: {
        tenantId: options.tenantId,
      },
    };

    const result = await sgMail.send(msg);

    return {
      messageId: result[0].headers['x-message-id'] || '',
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
  } catch (error) {
    throw new Error(
      `SendGrid error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * AWS SES implementation
 */
async function sendViaAwsSES(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const AWS = require('aws-sdk');
    const ses = new AWS.SES({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const params = {
      Source: process.env.EMAIL_FROM || 'noreply@crmflow.app',
      Destination: {
        ToAddresses: [options.to],
        CcAddresses: options.cc || [],
        BccAddresses: options.bcc || [],
      },
      Message: {
        Subject: { Data: options.subject },
        Body: { Html: { Data: options.html } },
      },
      Tags: [
        { Name: 'tenant-id', Value: options.tenantId },
        { Name: 'service', Value: 'crmflow' },
      ],
    };

    const result = await ses.sendEmail(params).promise();

    return {
      messageId: result.MessageId || '',
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
  } catch (error) {
    throw new Error(
      `AWS SES error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Resend implementation
 */
async function sendViaResend(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@crmflow.app',
      to: options.to,
      subject: options.subject,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      tags: [
        { name: 'tenant-id', value: options.tenantId },
        { name: 'service', value: 'crmflow' },
      ],
    });

    return {
      messageId: result.id || '',
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
  } catch (error) {
    throw new Error(
      `Resend error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Mailgun implementation
 */
async function sendViaMailgun(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const mailgun = require('mailgun.js');
    const FormData = require('form-data');

    const mg = new mailgun(FormData);
    const domain = process.env.MAILGUN_DOMAIN;

    const result = await mg.messages.create(domain, {
      from: process.env.EMAIL_FROM || 'noreply@crmflow.app',
      to: options.to,
      subject: options.subject,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      'h:Reply-To': options.replyTo,
      'v:tenant-id': options.tenantId,
      'v:service': 'crmflow',
    });

    return {
      messageId: result.id || '',
      timestamp: new Date().toISOString(),
      status: 'queued',
    };
  } catch (error) {
    throw new Error(
      `Mailgun error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Mock implementation for development/testing
 */
export async function mockSendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  // In development, just log the email
  console.log('[MOCK EMAIL]', {
    to: options.to,
    subject: options.subject,
    timestamp: new Date().toISOString(),
  });

  return {
    messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    status: 'sent',
  };
}
