import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

function keyBuffer(): Buffer {
  return Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0'));
}

export function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptSecret(encryptedText: string): string {
  const colon = encryptedText.indexOf(':');
  if (colon === -1) {
    throw new Error('Invalid encrypted secret format');
  }
  const iv = Buffer.from(encryptedText.slice(0, colon), 'hex');
  const encrypted = encryptedText.slice(colon + 1);
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** True when value was saved via encryptSecret (hex-iv + ciphertext). */
export function isEncryptedSecret(value: string): boolean {
  const trimmed = value.trim();
  const colon = trimmed.indexOf(':');
  if (colon !== 32) return false;
  const iv = trimmed.slice(0, colon);
  const payload = trimmed.slice(colon + 1);
  return /^[a-f0-9]{32}$/i.test(iv) && /^[a-f0-9]+$/i.test(payload);
}

/**
 * Read a secret from DB storage: decrypt if encrypted, otherwise return plaintext (legacy).
 */
export function decryptStoredSecret(stored: string): string | null {
  const value = stored.trim();
  if (!value) return null;

  if (isEncryptedSecret(value)) {
    try {
      const plain = decryptSecret(value).trim();
      return plain || null;
    } catch (error) {
      console.error('Failed to decrypt stored secret:', error);
      return null;
    }
  }

  return value;
}

export function tryDecryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    if (isEncryptedSecret(value)) {
      return decryptSecret(value);
    }
    return value;
  } catch {
    return null;
  }
}
