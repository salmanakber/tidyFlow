// SMS service using Twilio (SystemSetting category "sms" with env fallback)

interface SMSOptions {
  to: string;
  message: string;
}

async function getSmsSettings() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    const settings = await prisma.systemSetting
      .findMany({
        where: {
          category: 'sms',
          key: {
            in: [
              'sms_provider',
              'twilio_account_sid',
              'twilio_auth_token',
              'twilio_phone_number',
            ],
          },
        },
      })
      .catch(() => []);

    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      let value = setting.value;
      if (setting.isEncrypted) {
        const crypto = require('crypto');
        const ENCRYPTION_KEY =
          process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
        const ALGORITHM = 'aes-256-cbc';
        try {
          const parts = value.split(':');
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          const decipher = crypto.createDecipheriv(
            ALGORITHM,
            Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')),
            iv
          );
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          value = decrypted;
        } catch (e) {
          console.error('Failed to decrypt SMS setting:', e);
        }
      }
      settingsMap[setting.key] = value;
    }

    return {
      provider: settingsMap['sms_provider'] || process.env.SMS_PROVIDER || 'twilio',
      twilioAccountSid:
        settingsMap['twilio_account_sid'] || process.env.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken:
        settingsMap['twilio_auth_token'] || process.env.TWILIO_AUTH_TOKEN || '',
      twilioPhoneNumber:
        settingsMap['twilio_phone_number'] || process.env.TWILIO_PHONE_NUMBER || '',
    };
  } catch (error) {
    console.error('Error fetching SMS settings:', error);
    return {
      provider: process.env.SMS_PROVIDER || 'twilio',
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    };
  }
}

export async function sendSMS(options: SMSOptions): Promise<boolean> {
  try {
    const settings = await getSmsSettings();
    const sid = settings.twilioAccountSid;
    const token = settings.twilioAuthToken;
    const from = settings.twilioPhoneNumber;

    if (sid && token && from) {
      const twilio = require('twilio');
      const client = twilio(sid, token);

      await client.messages.create({
        body: options.message,
        from,
        to: options.to,
      });

      return true;
    }

    // Fallback: Log to console (development / not configured)
    console.log('[SMS] Would send (Twilio not configured):', {
      to: options.to,
      message: options.message,
    });

    return false;
  } catch (error) {
    console.error('SMS send error:', error);
    return false;
  }
}

export async function sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
  const message = `Your TidyFlow verification code is: ${otp}. Valid for 10 minutes.`;
  return sendSMS({ to: phoneNumber, message });
}
