import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AppException, ErrorCodes, nowIso } from '../../common/api';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';
import { DatabaseService } from '../../database/database.service';

/** 备份列表项 */
export interface BackupListItem {
  filename: string;
  size: number;
  createdAt: string;
  quickCheckOk: boolean | null;
  trigger: string | null;
}

/** 备份元数据 */
interface BackupMeta {
  ok: boolean;
  trigger: string;
  createdAt: string;
  size: number;
}

/** 每日备份与自检 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  /** 每天 02:30 执行备份 */
  @Cron('30 2 * * *')
  dailyBackup(): void {
    this.runBackup('cron');
  }

  /** 备份目录绝对路径 */
  getBackupDir(): string {
    return path.resolve(
      process.cwd(),
      this.configService.get<string>('BACKUP_DIR', './data/backups'),
    );
  }

  /** 执行一次备份并 quick_check */
  runBackup(trigger: string): { backupPath: string; ok: boolean; filename: string } {
    const backupDir = this.getBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = nowIso().replace(/[:.]/g, '-');
    const filename = `classpilot-${stamp}.db`;
    const backupPath = path.join(backupDir, filename);

    const dbPath = this.databaseService.getDbPath();
    this.databaseService.getDb().pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(dbPath, backupPath);
    const ok = this.quickCheck(backupPath);
    const size = fs.statSync(backupPath).size;
    const meta: BackupMeta = {
      ok,
      trigger,
      createdAt: nowIso(),
      size,
    };
    fs.writeFileSync(
      this.metaPath(backupPath),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
    this.logger.log(`Backup (${trigger}): ${backupPath}, quick_check=${ok}`);
    this.auditLogsRepository.insert({
      action: 'backup_run',
      detail: JSON.stringify({ filename, ok, trigger }),
    });
    return { backupPath, ok, filename };
  }

  /** 列出备份（新→旧） */
  listBackups(): BackupListItem[] {
    const backupDir = this.getBackupDir();
    if (!fs.existsSync(backupDir)) return [];
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.db') && f.startsWith('classpilot-'));
    const items: BackupListItem[] = files.map((filename) => {
      const full = path.join(backupDir, filename);
      const stat = fs.statSync(full);
      const meta = this.readMeta(full);
      return {
        filename,
        size: meta?.size ?? stat.size,
        createdAt: meta?.createdAt ?? stat.mtime.toISOString(),
        quickCheckOk: meta ? meta.ok : null,
        trigger: meta?.trigger ?? null,
      };
    });
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  /**
   * 从备份恢复：先备份当前库，再替换。
   * confirm 必须为 true。
   */
  restore(filename: string, confirm: boolean): {
    ok: boolean;
    safetyBackup: string;
    restoredFrom: string;
  } {
    if (!confirm) {
      throw new AppException(ErrorCodes.VALIDATION, '恢复须二次确认');
    }
    if (
      !filename
      || filename.includes('..')
      || filename.includes('/')
      || filename.includes('\\')
      || !filename.endsWith('.db')
      || !filename.startsWith('classpilot-')
    ) {
      throw new AppException(ErrorCodes.VALIDATION, '非法备份文件名');
    }
    const source = path.join(this.getBackupDir(), filename);
    if (!fs.existsSync(source)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '备份文件不存在', 404);
    }
    if (!this.quickCheck(source)) {
      throw new AppException(
        ErrorCodes.STATE_INVALID,
        '该备份完整性检查未通过，拒绝恢复',
      );
    }

    const safety = this.runBackup('pre-restore');
    this.databaseService.replaceWithBackup(source);
    this.auditLogsRepository.insert({
      action: 'backup_restore',
      detail: JSON.stringify({
        restoredFrom: filename,
        safetyBackup: safety.filename,
      }),
    });
    return {
      ok: true,
      safetyBackup: safety.filename,
      restoredFrom: filename,
    };
  }

  /** 快速完整性检查 */
  quickCheck(dbPath: string): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3') as typeof import('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      db.close();
      return row.integrity_check === 'ok';
    } catch (err) {
      this.logger.error(err);
      return false;
    }
  }

  /** 元数据路径 */
  private metaPath(dbFilePath: string): string {
    return `${dbFilePath}.meta.json`;
  }

  /** 读取元数据 */
  private readMeta(dbFilePath: string): BackupMeta | null {
    const p = this.metaPath(dbFilePath);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as BackupMeta;
    } catch {
      return null;
    }
  }
}
