import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCodes } from '../../common/api';
import {
  decryptSensitive,
  encryptSensitive,
} from '../../crypto/crypto.helper';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';
import { PinUnlockService } from '../auth/pin-unlock.service';
import { StudentsRepository } from './students.repository';
import { SensitiveRepository } from './sensitive.repository';

/** 高敏类别枚举 */
export const SENSITIVE_CATEGORIES = ['健康', '心理', '家庭', '其他'] as const;

/** 高敏类别类型 */
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

/** 高敏卡片摘要 */
export interface SensitiveSummaryView {
  category: SensitiveCategory;
  hasContent: boolean;
  updatedAt: string | null;
}

/** 高敏明文内容视图 */
export interface SensitiveContentView {
  category: SensitiveCategory;
  content: string;
  updatedAt: string | null;
}

/** L2 高敏业务服务 */
@Injectable()
export class SensitiveService {
  constructor(
    private readonly sensitiveRepository: SensitiveRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly pinUnlockService: PinUnlockService,
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly configService: ConfigService,
  ) {}

  /** 列出四类卡片摘要（不解密、不要求 PIN） */
  listSummaries(studentId: number): SensitiveSummaryView[] {
    this.requireStudent(studentId);
    const rows = this.sensitiveRepository.listSummaries(studentId);
    const byCategory = new Map(
      rows.map((r) => [r.category, r.updated_at] as const),
    );
    return SENSITIVE_CATEGORIES.map((category) => ({
      category,
      hasContent: byCategory.has(category),
      updatedAt: byCategory.get(category) ?? null,
    }));
  }

  /** 读取并解密一类高敏内容 */
  getContent(
    userId: number,
    studentId: number,
    category: string,
  ): SensitiveContentView {
    this.requireStudent(studentId);
    const cat = this.requireCategory(category);
    this.requireUnlocked(userId);

    const row = this.sensitiveRepository.findByStudentCategory(studentId, cat);
    const aesKey = this.aesKeyHex();
    let content = '';
    let updatedAt: string | null = null;
    if (row) {
      content = decryptSensitive(row.content_encrypted, row.iv, aesKey);
      updatedAt = row.updated_at;
    }

    this.auditLogsRepository.insert({
      action: 'l2_view',
      targetStudentId: studentId,
      detail: JSON.stringify({ category: cat }),
    });

    return { category: cat, content, updatedAt };
  }

  /** 写入/更新一类高敏内容（加密入库） */
  upsertContent(
    userId: number,
    studentId: number,
    category: string,
    plainText: string,
  ): SensitiveContentView {
    this.requireStudent(studentId);
    const cat = this.requireCategory(category);
    this.requireUnlocked(userId);

    const text = plainText.trim();
    if (!text) {
      throw new AppException(ErrorCodes.VALIDATION, '高敏内容不能为空');
    }

    const encrypted = encryptSensitive(text, this.aesKeyHex());
    this.sensitiveRepository.upsert({
      studentId,
      category: cat,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
    });

    this.auditLogsRepository.insert({
      action: 'l2_write',
      targetStudentId: studentId,
      detail: JSON.stringify({ category: cat, length: text.length }),
    });

    const row = this.sensitiveRepository.findByStudentCategory(studentId, cat);
    return {
      category: cat,
      content: text,
      updatedAt: row?.updated_at ?? null,
    };
  }

  /** 软删除一类高敏 */
  remove(
    userId: number,
    studentId: number,
    category: string,
  ): { ok: boolean } {
    this.requireStudent(studentId);
    const cat = this.requireCategory(category);
    this.requireUnlocked(userId);

    const ok = this.sensitiveRepository.softDelete(studentId, cat);
    this.auditLogsRepository.insert({
      action: 'l2_delete',
      targetStudentId: studentId,
      detail: JSON.stringify({ category: cat }),
    });
    return { ok };
  }

  /** 学生必须存在 */
  private requireStudent(studentId: number): void {
    const student = this.studentsRepository.findById(studentId);
    if (!student || student.deleted_at) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
  }

  /** 校验类别 */
  private requireCategory(category: string): SensitiveCategory {
    if ((SENSITIVE_CATEGORIES as readonly string[]).includes(category)) {
      return category as SensitiveCategory;
    }
    throw new AppException(ErrorCodes.VALIDATION, '无效的高敏类别');
  }

  /** 要求 PIN 解锁窗口有效 */
  private requireUnlocked(userId: number): void {
    if (!this.pinUnlockService.isUnlocked(userId)) {
      throw new AppException(
        ErrorCodes.FORBIDDEN,
        '请先输入 PIN 解锁高敏信息',
        403,
      );
    }
  }

  /** 读取 AES 密钥 */
  private aesKeyHex(): string {
    return this.configService.get<string>('AES_KEY_HEX', '');
  }
}
