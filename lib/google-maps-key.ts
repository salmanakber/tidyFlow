import prisma from '@/lib/prisma';

function decryptValue(encryptedText: string): string {
  try {
    const crypto = require('crypto');
    const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
    const ALGORITHM = 'aes-256-cbc';
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedText;
  }
}

export async function getGoogleMapsApiKey(): Promise<string | null> {
  const apiKeySetting = await prisma.systemSetting.findUnique({
    where: { key: 'google_maps_api_key' },
  });

  const apiKey = apiKeySetting?.isEncrypted
    ? decryptValue(apiKeySetting.value)
    : apiKeySetting?.value || process.env.GOOGLE_MAPS_API_KEY;

  return apiKey || null;
}
