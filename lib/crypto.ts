import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is not set');
  }
  
  // Derive 32-byte key from environment variable using PBKDF2
  return crypto.pbkdf2Sync(key, 'tiequan-salt', 100000, 32, 'sha256');
}

/**
 * Encrypts plaintext using AES-256-GCM
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts ciphertext encrypted with encrypt()
 * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext string
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Checks if a string appears to be encrypted (has correct format)
 * @param value - String to check
 * @returns true if the string matches encrypted format
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 &&
         parts[0].length === IV_LENGTH * 2 &&
         parts[1].length === AUTH_TAG_LENGTH * 2;
}