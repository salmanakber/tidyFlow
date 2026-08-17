
// Email service using SMTP, AWS SES, Brevo, or SendGrid
// SMTP support via nodemailer
// Brevo support via REST API (fetch)
import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

async function getEmailSettings() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    const settings = await (prisma as any).systemSetting.findMany({
      where: {
        category: 'email',
        key: {
          in: [
            'email_provider', 
            'smtp_host', 
            'smtp_port', 
            'smtp_secure', 
            'smtp_username', 
            'smtp_password', 
            'ses_access_key', 
            'ses_secret_key', 
            'ses_region', 
            'sendgrid_api_key',
            'brevo_api_key',
            'brevo_sender_name',
            'from_email'
          ],
        },
      },
    }).catch(() => []);

    const settingsMap: Record<string, string> = {};
    settings.forEach(setting => {
      let value = setting.value;
      if (setting.isEncrypted) {
        const crypto = require('crypto');
        const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
        const ALGORITHM = 'aes-256-cbc';
        try {
          const parts = value.split(':');
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')), iv);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          value = decrypted;
        } catch (e) {
          console.error('Failed to decrypt email setting:', e);
        }
      }
      settingsMap[setting.key] = value;
    });

    return {
      provider: settingsMap['email_provider'] || process.env.EMAIL_PROVIDER || 'smtp',
      smtpHost: settingsMap['smtp_host'] || process.env.SMTP_HOST,
      smtpPort: settingsMap['smtp_port'] ? parseInt(settingsMap['smtp_port']) : parseInt(process.env.SMTP_PORT || '587'),
      smtpSecure: settingsMap['smtp_secure'] === 'true' || process.env.SMTP_SECURE === 'true',
      smtpUsername: settingsMap['smtp_username'] || process.env.SMTP_USERNAME,
      smtpPassword: settingsMap['smtp_password'] || process.env.SMTP_PASSWORD,
      sesAccessKey: settingsMap['ses_access_key'] || process.env.AWS_SES_ACCESS_KEY,
      sesSecretKey: settingsMap['ses_secret_key'] || process.env.AWS_SES_SECRET_KEY,
      sesRegion: settingsMap['ses_region'] || process.env.AWS_SES_REGION,
      sendgridApiKey: settingsMap['sendgrid_api_key'] || process.env.SENDGRID_API_KEY,
      brevoApiKey: settingsMap['brevo_api_key'] || process.env.BREVO_API_KEY,
      brevoSenderName: (settingsMap['brevo_sender_name'] || process.env.BREVO_SENDER_NAME || 'TidyFlow').replace(/MayaOps/gi, 'TidyFlow'),
      fromEmail: settingsMap['from_email'] || process.env.EMAIL_FROM || 'noreply@tidyflowapp.com',
    };
  } catch (error) {
    console.error('Error fetching email settings:', error);
    return {
      provider: process.env.EMAIL_PROVIDER || 'smtp',
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUsername: process.env.SMTP_USERNAME,
      smtpPassword: process.env.SMTP_PASSWORD,
      sesAccessKey: process.env.AWS_SES_ACCESS_KEY,
      sesSecretKey: process.env.AWS_SES_SECRET_KEY,
      sesRegion: process.env.AWS_SES_REGION,
      sendgridApiKey: process.env.SENDGRID_API_KEY,
      brevoApiKey: process.env.BREVO_API_KEY,
      brevoSenderName: (process.env.BREVO_SENDER_NAME || 'TidyFlow').replace(/MayaOps/gi, 'TidyFlow'),
      fromEmail: process.env.EMAIL_FROM || 'noreply@tidyflowapp.com',
    };
  }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const emailSettings = await getEmailSettings();
    const fromEmail = options.from || emailSettings.fromEmail;

    if (emailSettings.provider === 'smtp' && emailSettings.smtpHost && emailSettings.smtpUsername && emailSettings.smtpPassword) {
      console.log('🔑 SMTP Settings:', {
        host: emailSettings.smtpHost,
        port: emailSettings.smtpPort,
        secure: emailSettings.smtpSecure,
        username: emailSettings.smtpUsername,
        fromEmail: fromEmail,
        provider: emailSettings.provider,
      });

      const transporter = nodemailer.createTransport({
        host: emailSettings.smtpHost,
        port: emailSettings.smtpPort || 587,
        secure: emailSettings.smtpSecure,
        auth: {
          user: emailSettings.smtpUsername,
          pass: emailSettings.smtpPassword,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      await transporter.sendMail({
        from: fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      console.log(`✅ Email sent via SMTP to ${options.to}`);
      return true;
    }

    if (emailSettings.provider === 'ses' && emailSettings.sesRegion && emailSettings.sesAccessKey && emailSettings.sesSecretKey) {
      const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
      
      const client = new SESClient({ 
        region: emailSettings.sesRegion,
        credentials: {
          accessKeyId: emailSettings.sesAccessKey,
          secretAccessKey: emailSettings.sesSecretKey,
        },
      });
      
      const command = new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [options.to] },
        Message: {
          Subject: { Data: options.subject },
          Body: { Html: { Data: options.html } },
        },
      });
      
      await client.send(command);
      console.log(`✅ Email sent via AWS SES to ${options.to}`);
      return true;
    }

    if (emailSettings.provider === 'brevo' && emailSettings.brevoApiKey) {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': emailSettings.brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: emailSettings.brevoSenderName,
            email: fromEmail,
          },
          to: [
            {
              email: options.to,
            },
          ],
          subject: options.subject,
          htmlContent: options.html,
        }),
      });
      console.log('🔑 Brevo Response:', response.body);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        
        if (response.status === 401) {
          const errorMessage = errorData.message || 'Unauthorized';
          if (errorMessage.includes('unrecognised IP address') || errorMessage.includes('authorised_ips')) {
            console.error('❌ Brevo API Error: IP address not authorized');
            console.error('📝 Action required: Please whitelist your server IP address in Brevo settings.');
            throw new Error(`Brevo API: IP address not authorized. Please add your server IP to authorized IPs in Brevo settings: https://app.brevo.com/security/authorised_ips`);
          } else {
            throw new Error(`Brevo API: Unauthorized - ${errorMessage}. Please check your API key.`);
          }
        }
        
        throw new Error(`Brevo API error: ${response.status} - ${errorData.message || JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log(`✅ Email sent via Brevo to ${options.to} (Message ID: ${result.messageId || 'N/A'})`);
      return true;
    }

    if (emailSettings.provider === 'sendgrid' && emailSettings.sendgridApiKey) {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(emailSettings.sendgridApiKey);
      
      await sgMail.send({
        to: options.to,
        from: fromEmail,
        subject: options.subject,
        html: options.html,
      });
      
      console.log(`✅ Email sent via SendGrid to ${options.to}`);
      return true;
    }

    console.warn('[EMAIL] No email provider configured. Would send:', {
      to: options.to,
      subject: options.subject,
      html: options.html.substring(0, 100) + '...',
    });
    
    return true;
  } catch (error: any) {
    console.error('Email send error:', error);
    return false;
  }
}

// ─── EMAIL TEMPLATES WITH ADVANCED TIDYFLOW BRANDING ────────────────────────

export async function sendTaskAssignmentEmail(
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  propertyAddress: string,
  scheduledDate: Date
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Task Assignment</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F8FA; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; width: 100% !important;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #E4E9F0;">
          <tr>
            <td style="background-color: #0D1B2A; padding: 32px 24px; text-align: center;">
              <span style="color: #F59E0B; font-size: 11px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; display: block; margin-bottom: 6px;">TIDYFLOW SCHEDULE</span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">New Task Assignment</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="font-size: 15px; color: #0D1117; line-height: 24px; margin-top: 0;">Hi ${recipientName},</p>
              <p style="font-size: 14px; color: #4A5568; line-height: 22px;">You have been scheduled for a new cleaning assignment in TidyFlow:</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F8FA; border-radius: 8px; border: 1px solid #E4E9F0; margin: 20px 0;">
                <tr>
                  <td style="padding: 16px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase; padding-bottom: 8px;">Task</td>
                        <td style="font-size: 14px; font-weight: 700; color: #0D1117; padding-bottom: 8px;">${taskTitle}</td>
                      </tr>
                      <tr>
                        <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase; padding-bottom: 8px;">Property</td>
                        <td style="font-size: 13px; font-weight: 600; color: #4A5568; padding-bottom: 8px;">${propertyAddress}</td>
                      </tr>
                      <tr>
                        <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase;">Date & Time</td>
                        <td style="font-size: 13px; font-weight: 600; color: #0D1B2A;">${scheduledDate.toLocaleString()}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #9AA5B4; line-height: 20px; margin-bottom: 24px;">Please open your TidyFlow mobile app to check instructions, checklists, and start tracking your work session.</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.tidyflowapp.com'}" style="display: inline-block; padding: 12px 28px; background-color: #0D1B2A; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">View Details</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F7F8FA; padding: 24px; text-align: center; border-top: 1px solid #E4E9F0;">
              <p style="margin: 0; font-size: 11px; color: #9AA5B4;">© ${new Date().getFullYear()} TidyFlow. All rights reserved.</p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #9AA5B4;">This is an automated notification. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `New Task Assignment: ${taskTitle}`,
    html,
  });
}

export async function sendQAResultEmail(
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  overallScore: number,
  comments?: string
): Promise<boolean> {
  const passed = overallScore >= 7;
  const statusColor = passed ? '#059669' : '#E11D48';
  const statusBg = passed ? '#D1FAE5' : '#FFE4E6';
  const statusText = passed ? 'PASSED QA REVIEW' : 'REVISION REQUIRED';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QA Review Result</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F8FA; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; width: 100% !important;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #E4E9F0;">
          <tr>
            <td style="background-color: #0D1B2A; padding: 32px 24px; text-align: center;">
              <span style="color: #F59E0B; font-size: 11px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; display: block; margin-bottom: 6px;">QUALITY ASSURANCE</span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Performance Review</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="font-size: 15px; color: #0D1117; line-height: 24px; margin-top: 0;">Hi ${recipientName},</p>
              <p style="font-size: 14px; color: #4A5568; line-height: 22px;">A Quality Assurance review has been completed for your cleaning task: <strong style="color: #0D1117;">"${taskTitle}"</strong></p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: ${statusBg}; border-radius: 8px; padding: 20px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <span style="color: ${statusColor}; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; display: block; margin-bottom: 4px;">${statusText}</span>
                    <span style="font-size: 32px; font-weight: 800; color: #0D1B2A;">${overallScore}<span style="font-size: 18px; font-weight: 500; color: #9AA5B4;">/10</span></span>
                  </td>
                </tr>
              </table>

              ${comments ? `
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 4px solid ${statusColor}; background-color: #F7F8FA; margin-bottom: 24px; border-radius: 0 6px 6px 0;">
                  <tr>
                    <td style="padding: 16px;">
                      <span style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase; display: block; margin-bottom: 4px;">Reviewer Feedback</span>
                      <p style="font-size: 13px; color: #4A5568; margin: 0; line-height: 20px; font-style: italic;">"${comments}"</p>
                    </td>
                  </tr>
                </table>
              ` : ''}

              <p style="font-size: 13px; color: #9AA5B4; line-height: 20px; margin-bottom: 24px;">You can review completed photos, ratings, and step checklist reports in your user profile inside the TidyFlow application.</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.tidyflowapp.com'}" style="display: inline-block; padding: 12px 28px; background-color: #0D1B2A; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">Open TidyFlow</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F7F8FA; padding: 24px; text-align: center; border-top: 1px solid #E4E9F0;">
              <p style="margin: 0; font-size: 11px; color: #9AA5B4;">© ${new Date().getFullYear()} TidyFlow. All rights reserved.</p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #9AA5B4;">This is an automated notification. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `QA Review: ${taskTitle} [${overallScore}/10]`,
    html,
  });
}

export async function sendUserAccountCreatedEmail(
  recipientEmail: string,
  recipientName: string,
  password: string,
  role: string,
  companyName?: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to TidyFlow</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F8FA; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; width: 100% !important;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #E4E9F0;">
          <tr>
            <td style="background-color: #0D1B2A; padding: 32px 24px; text-align: center;">
              <span style="color: #F59E0B; font-size: 11px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; display: block; margin-bottom: 6px;">GETTING STARTED</span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Welcome to TidyFlow</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="font-size: 15px; color: #0D1117; line-height: 24px; margin-top: 0;">Hi ${recipientName},</p>
              <p style="font-size: 14px; color: #4A5568; line-height: 22px;">Your secure credentials have been provisioned to log in to the TidyFlow platform.</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #E8EDF2; border-radius: 8px; border-left: 4px solid #0D1B2A; margin: 24px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin-top: 0; color: #0D1B2A; font-size: 14px; font-weight: 700; margin-bottom: 12px;">Your Login Credentials</h3>
                    
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      ${companyName ? `
                        <tr>
                          <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase; padding-bottom: 6px;">Company</td>
                          <td style="font-size: 13px; font-weight: 700; color: #0D1117; padding-bottom: 6px;">${companyName}</td>
                        </tr>
                      ` : ''}
                      <tr>
                        <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase; padding-bottom: 6px;">Role</td>
                        <td style="font-size: 13px; font-weight: 700; color: #0D1117; padding-bottom: 6px;">${role}</td>
                      </tr>
                      <tr>
                        <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase; padding-bottom: 6px;">Username</td>
                        <td style="font-size: 13px; font-weight: 700; color: #0D1117; padding-bottom: 6px; font-family: monospace;">${recipientEmail}</td>
                      </tr>
                      <tr>
                        <td width="30%" style="font-size: 11px; font-weight: 700; color: #9AA5B4; text-transform: uppercase;">Password</td>
                        <td style="font-size: 13px; font-weight: 700; color: #0D1B2A; font-family: monospace;">${password}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FEF3C7; border-radius: 8px; border-left: 4px solid #F59E0B; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; color: #92400E; font-weight: 600; line-height: 18px;">
                    ⚠️ For security reasons, please change your password immediately after your initial authentication session.
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #9AA5B4; line-height: 20px; margin-bottom: 24px;">Download the TidyFlow companion app from your app distribution store to access schedules and task tracking.</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.tidyflowapp.com'}" style="display: inline-block; padding: 12px 28px; background-color: #0D1B2A; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">Access TidyFlow</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F7F8FA; padding: 24px; text-align: center; border-top: 1px solid #E4E9F0;">
              <p style="margin: 0; font-size: 11px; color: #9AA5B4;">© ${new Date().getFullYear()} TidyFlow. All rights reserved.</p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #9AA5B4;">This is an automated system email, please do not reply.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipientEmail,
    subject: 'Welcome to TidyFlow - Your Account Has Been Created',
    html,
  });
}

export async function sendUserAccountUpdatedEmail(
  recipientEmail: string,
  recipientName: string,
  changes: {
    role?: string;
    companyName?: string;
    isActive?: boolean | string;
    firstName?: string;
    lastName?: string;
  }
): Promise<boolean> {
  const changesList = Object.entries(changes)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => {
      const label = key === 'isActive' 
        ? 'Account Status' 
        : key === 'role' 
        ? 'System Role' 
        : key === 'companyName'
        ? 'Assigned Company'
        : key === 'firstName'
        ? 'First Name'
        : key === 'lastName'
        ? 'Last Name'
        : key;
      return `
        <tr style="border-bottom: 1px solid #F0F4F8;">
          <td style="padding: 10px 0; font-size: 12px; font-weight: 700; color: #9AA5B4; text-transform: uppercase;">${label}</td>
          <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #0D1117; text-align: right;">${value}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Information Update</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F8FA; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; width: 100% !important;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #E4E9F0;">
          <tr>
            <td style="background-color: #0D1B2A; padding: 32px 24px; text-align: center;">
              <span style="color: #F59E0B; font-size: 11px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; display: block; margin-bottom: 6px;">SECURITY & PROFILES</span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Account Information Updated</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="font-size: 15px; color: #0D1117; line-height: 24px; margin-top: 0;">Hi ${recipientName},</p>
              <p style="font-size: 14px; color: #4A5568; line-height: 22px;">Certain configuration values associated with your TidyFlow account credentials have been updated:</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F8FA; border-radius: 8px; border: 1px solid #E4E9F0; padding: 16px 20px; margin: 24px 0;">
                ${changesList}
              </table>
              
              <p style="font-size: 13px; color: #9AA5B4; line-height: 20px; margin-bottom: 24px;">If you did not request this update, or if you believe this transaction occurred in error, please coordinate with your direct administrative lead.</p>
              
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.tidyflowapp.com'}" style="display: inline-block; padding: 12px 28px; background-color: #0D1B2A; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">Log In to TidyFlow</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F7F8FA; padding: 24px; text-align: center; border-top: 1px solid #E4E9F0;">
              <p style="margin: 0; font-size: 11px; color: #9AA5B4;">© ${new Date().getFullYear()} TidyFlow. All rights reserved.</p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #9AA5B4;">This is an automated system security notification, please do not reply.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipientEmail,
    subject: 'TidyFlow - Your Account Has Been Updated',
    html,
  });
}

/** Welcome email after public web subscribe signup (does not include password). */
export async function sendSubscribeWelcomeEmail(input: {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  planLabel?: string;
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.tidyflowapp.com';
  const iosUrl =
    process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim() ||
    'https://apps.apple.com/search?term=TidyFlow';
  const androidUrl =
    process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() ||
    'https://play.google.com/store/apps/details?id=com.tidyflow.mobile';
  const name = input.recipientName || 'there';
  const intro = input.planLabel
    ? `Thanks for choosing the <strong>${input.planLabel}</strong> plan. Here's what to do next:`
    : `Thanks for joining TidyFlow. Here's what to do next:`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to TidyFlow</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F4EE; margin: 0; padding: 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 24px auto; background:#ffffff; border-radius: 14px; overflow:hidden; border:1px solid #E6E0D6;">
          <tr>
            <td style="background: linear-gradient(135deg, #061525, #0B1E36); padding: 32px 24px; text-align:center;">
              <span style="color:#F59E0B; font-size:11px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; display:block; margin-bottom:8px;">WELCOME</span>
              <h1 style="color:#ffffff; font-size:24px; font-weight:800; margin:0; letter-spacing:-0.4px;">You're in, ${name}</h1>
              <p style="color:rgba(255,255,255,0.72); font-size:14px; margin:10px 0 0; line-height:1.5;">Your TidyFlow account for <strong style="color:#F59E0B;">${input.companyName}</strong> is ready.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px;">
              <p style="margin:0 0 14px; font-size:15px; color:#0B1E36; line-height:1.5;">${intro}</p>
              <ol style="margin:0 0 22px; padding-left:18px; color:#4A5D73; font-size:14px; line-height:1.7;">
                <li>Complete checkout if you haven't already</li>
                <li>Download the TidyFlow app</li>
                <li>Sign in with <strong style="color:#0B1E36; font-family:monospace;">${input.recipientEmail}</strong> and the password you created</li>
              </ol>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:18px;">
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <a href="${iosUrl}" style="display:inline-block; padding:12px 22px; background:#F59E0B; color:#061525; text-decoration:none; border-radius:10px; font-weight:800; font-size:14px;">Download on the App Store</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <a href="${androidUrl}" style="display:inline-block; padding:12px 22px; background:#0B1E36; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:800; font-size:14px;">Get it on Google Play</a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${appUrl}/login" style="display:inline-block; padding:10px 18px; color:#0B1E36; text-decoration:none; font-weight:700; font-size:13px;">Or sign in on the web →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0; font-size:12px; color:#8A9BB0; line-height:1.5;">For your security, we never send your password by email. If you didn't create this account, contact support right away.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#F7F4EE; padding:18px 24px; text-align:center; border-top:1px solid #E6E0D6;">
              <p style="margin:0; font-size:11px; color:#8A9BB0;">© ${new Date().getFullYear()} TidyFlow. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: input.recipientEmail,
    subject: `Welcome to TidyFlow — ${input.companyName}`,
    html,
  });
}
