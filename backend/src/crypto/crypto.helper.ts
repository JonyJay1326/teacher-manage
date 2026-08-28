import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppException, ErrorCodes } from '../common/api';

/** AES-256-GCM 加解密结果 */
export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
}

/** 从 hex 环境变量解析 32 字节密钥 */
function resolveKey(aesKeyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(aesKeyHex)) {
    throw new AppException(ErrorCodes.SYSTEM, 'AES_KEY_HEX 必须为 64 位十六进制', 500);
  }
  return Buffer.from(aesKeyHex, 'hex');
}

/** 加密明文（L2 高敏专用） */
export function encryptSensitive(plainText: string, aesKeyHex: string): EncryptedPayload {
  const key = resolveKey(aesKeyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]),
    iv,
  };
}

/** 解密密文（L2 高敏专用） */
export function decryptSensitive(
  ciphertext: Buffer,
  iv: Buffer,
  aesKeyHex: string,
): string {
  const key = resolveKey(aesKeyHex);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
