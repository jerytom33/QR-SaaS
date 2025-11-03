/**
 * Email Template Rendering System
 * Supports multiple template engines (Handlebars, EJS, Nunjucks)
 */

interface EmailTemplate {
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
}

/**
 * Available email templates
 */
const templates: Record<string, EmailTemplate> = {
  'welcome': {
    name: 'Welcome Email',
    subject: 'Welcome to CRMFlow',
    htmlTemplate: `
      <h1>Welcome to CRMFlow, {{firstName}}!</h1>
      <p>We're excited to have you on board.</p>
      <p>Your account has been created with the email: <strong>{{email}}</strong></p>
      <p><a href="{{loginUrl}}">Click here to log in</a></p>
    `,
  },
  'password-reset': {
    name: 'Password Reset',
    subject: 'Reset Your Password',
    htmlTemplate: `
      <h1>Password Reset Request</h1>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <p><a href="{{resetUrl}}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  },
  'contact-created': {
    name: 'Contact Created Notification',
    subject: 'New Contact: {{contactName}}',
    htmlTemplate: `
      <h1>New Contact Created</h1>
      <p>{{createdByName}} added a new contact:</p>
      <p><strong>{{contactName}}</strong></p>
      <p>Email: {{contactEmail}}</p>
      <p>Company: {{companyName}}</p>
      <p><a href="{{viewUrl}}">View Contact</a></p>
    `,
  },
  'activity-reminder': {
    name: 'Activity Reminder',
    subject: 'Reminder: {{activityTitle}}',
    htmlTemplate: `
      <h1>Activity Reminder</h1>
      <p>You have an upcoming activity:</p>
      <p><strong>{{activityTitle}}</strong></p>
      <p>Scheduled for: {{activityDate}} at {{activityTime}}</p>
      <p>Contact: {{contactName}}</p>
      <p><a href="{{activityUrl}}">View Activity</a></p>
    `,
  },
  'lead-assigned': {
    name: 'Lead Assigned to You',
    subject: 'New Lead: {{leadName}}',
    htmlTemplate: `
      <h1>New Lead Assigned</h1>
      <p>{{assignedByName}} assigned you a new lead:</p>
      <p><strong>{{leadName}}</strong></p>
      <p>Company: {{companyName}}</p>
      <p>Value: {{leadValue}}</p>
      <p><a href="{{leadUrl}}">View Lead</a></p>
    `,
  },
  'export-ready': {
    name: 'Data Export Ready',
    subject: 'Your data export is ready',
    htmlTemplate: `
      <h1>Export Complete</h1>
      <p>Your data export has been completed and is ready for download.</p>
      <p>Format: {{exportFormat}}</p>
      <p>Records: {{recordCount}}</p>
      <p><a href="{{downloadUrl}}">Download File</a></p>
      <p>This link expires in 7 days.</p>
    `,
  },
  'import-completed': {
    name: 'Data Import Completed',
    subject: 'Import completed: {{importedCount}} records',
    htmlTemplate: `
      <h1>Import Complete</h1>
      <p>Your data import has been completed successfully.</p>
      <p>Records imported: {{importedCount}}</p>
      <p>Records skipped: {{skippedCount}}</p>
      {{#if errorCount}}<p>Errors: {{errorCount}} - <a href="{{errorReportUrl}}">View Error Report</a></p>{{/if}}
    `,
  },
  'report-ready': {
    name: 'Report Generated',
    subject: 'Your {{reportType}} report is ready',
    htmlTemplate: `
      <h1>Report Ready</h1>
      <p>Your {{reportType}} report has been generated and is ready for download.</p>
      <p>Date Range: {{startDate}} to {{endDate}}</p>
      <p><a href="{{downloadUrl}}">Download Report</a></p>
      <p><a href="{{viewUrl}}">View Online</a></p>
    `,
  },
};

/**
 * Simple template rendering with Handlebars-like syntax
 */
function renderTemplate(template: string, context: Record<string, any>): string {
  let rendered = template;

  // Handle conditionals: {{#if condition}}content{{/if}}
  rendered = rendered.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (match, condition, content) => {
      return context[condition] ? content : '';
    }
  );

  // Handle simple variable substitution: {{variable}}
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    return context[variable] !== undefined ? String(context[variable]) : match;
  });

  return rendered;
}

/**
 * Get template by name
 */
export function getTemplate(name: string): EmailTemplate | null {
  return templates[name] || null;
}

/**
 * Render email template
 */
export async function renderEmailTemplate(
  templateName: string,
  context: Record<string, any>
): Promise<string> {
  const template = getTemplate(templateName);

  if (!template) {
    throw new Error(`Email template "${templateName}" not found`);
  }

  const html = renderTemplate(template.htmlTemplate, context);

  // Wrap in HTML structure
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          a { color: #007bff; text-decoration: none; }
          a:hover { text-decoration: underline; }
          h1 { color: #2c3e50; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .footer { border-top: 1px solid #ddd; margin-top: 40px; padding-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          ${html}
          <div class="footer">
            <p>© 2025 CRMFlow. All rights reserved.</p>
            <p><a href="{{unsubscribeUrl}}">Unsubscribe from these emails</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Register custom template
 */
export function registerTemplate(template: EmailTemplate) {
  templates[template.name] = template;
}

/**
 * Get all available templates
 */
export function getAllTemplates() {
  return Object.values(templates).map((t) => ({
    name: t.name,
    id: t.name,
  }));
}
