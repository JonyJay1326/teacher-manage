import { describe, expect, it } from 'vitest';
import { AppException } from '../common/api';
import {
  decryptSensitive,
  encryptSensitive,
} from './crypto.helper';

/** 合法 32 字节 hex 密钥 */
const KEY = '0123456789abcdef'.repeat(4);

describe('encryptSensitive / decryptSensitive 往返', () => {
  it('加解密后可还原原文', () => {
    const plain = '该生有哮喘史，需注意体育课强度';
    const { ciphertext, iv } = encryptSensitive(plain, KEY);
    expect(decryptSensitive(ciphertext, iv, KEY)).toBe(plain);
  });

  it('空字符串可往返', () => {
    const { ciphertext, iv } = encryptSensitive('', KEY);
    expect(decryptSensitive(ciphertext, iv, KEY)).toBe('');
  });

  it('长文本与中文标点可往返', () => {
    const plain = '情绪波动较大。'.repeat(2000);
    const { ciphertext, iv } = encryptSensitive(plain, KEY);
    expect(decryptSensitive(ciphertext, iv, KEY)).toBe(plain);
  });

  it('每次加密使用随机 IV，相同明文产出不同密文', () => {
    const a = encryptSensitive('同一段内容', KEY);
    const b = encryptSensitive('同一段内容', KEY);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(decryptSensitive(a.ciphertext, a.iv, KEY)).toBe(
      decryptSensitive(b.ciphertext, b.iv, KEY),
    );
  });

  it('密文不包含明文片段', () => {
    const plain = '家庭经济困难';
    const { ciphertext } = encryptSensitive(plain, KEY);
    expect(ciphertext.toString('utf8')).not.toContain(plain);
  });

  it('密文长度 = 原文字节数 + 16 字节 auth tag', () => {
    const plain = '健康';
    const { ciphertext } = encryptSensitive(plain, KEY);
    expect(ciphertext.length).toBe(Buffer.byteLength(plain, 'utf8') + 16);
  });

  it('用错误密钥解密会失败（GCM 校验 tag 不通过）', () => {
    const other = 'fedcba9876543210'.repeat(4);
    const { ciphertext, iv } = encryptSensitive('私密内容', KEY);
    expect(() => decryptSensitive(ciphertext, iv, other)).toThrow();
  });

  it('篡改密文任一字节会解密失败', () => {
    const { ciphertext, iv } = encryptSensitive('私密内容', KEY);
    const tampered = Buffer.from(ciphertext);
    tampered[0] = (tampered[0]! + 1) % 256;
    expect(() => decryptSensitive(tampered, iv, KEY)).toThrow();
  });

  it('篡改 IV 会解密失败', () => {
    const { ciphertext, iv } = encryptSensitive('私密内容', KEY);
    const tamperedIv = Buffer.from(iv);
    tamperedIv[0] = (tamperedIv[0]! + 1) % 256;
    expect(() => decryptSensitive(ciphertext, tamperedIv, KEY)).toThrow();
  });
});

describe('密钥格式校验', () => {
  it('非法 hex 长度抛 SYSTEM 错误', () => {
    expect(() => encryptSensitive('x', 'abc')).toThrow(AppException);
  });

  it('非 hex 字符抛错', () => {
    expect(() => encryptSensitive('x', 'z'.repeat(64))).toThrow(AppException);
  });

  it('空密钥抛错', () => {
    expect(() => encryptSensitive('x', '')).toThrow(AppException);
  });

  it('大写 hex 密钥可用（等价于小写）', () => {
    const upper = '0123456789ABCDEF'.repeat(4);
    const { ciphertext, iv } = encryptSensitive('测试', upper);
    expect(decryptSensitive(ciphertext, iv, upper)).toBe('测试');
    expect(decryptSensitive(ciphertext, iv, KEY)).toBe('测试');
  });

  it('错误码为 5000（系统级，非业务级）', () => {
    try {
      encryptSensitive('x', 'short');
      expect.unreachable('应当抛出');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(5000);
    }
  });
});
