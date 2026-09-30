import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
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
  sha256?: string;
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

  /** 保留最近 N 份备份（滚动清理超出的旧备份） */
  private retentionLimit(): number {
    const raw = Number(this.configService.get('BACKUP_RETENTION', 14));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 14;
  }

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
      sha256: this.sha256Of(backupPath),
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
    const pruned = this.pruneOldBackups();
    if (pruned.length > 0) {
      this.logger.log(`Pruned ${pruned.length} backup(s) beyond retention ${this.retentionLimit()}`);
    }
    return { backupPath, ok, filename };
  }

  /**
   * 滚动清理：按时间从新到旧保留最近 N 份，超出的 .db 与其 .meta.json 一并删除。
   * 返回被删除的文件名（新→旧顺序）。
   */
  pruneOldBackups(): string[] {
    const keep = this.retentionLimit();
    const sorted = this.listBackups();
    const removed: string[] = [];
    for (const item of sorted.slice(keep)) {
      const full = path.join(this.getBackupDir(), item.filename);
      try {
        fs.unlinkSync(full);
        const metaFile = this.metaPath(full);
        if (fs.existsSync(metaFile)) {
          fs.unlinkSync(metaFile);
        }
        removed.push(item.filename);
      } catch (err: unknown) {
        this.logger.error(`Prune failed for ${item.filename}: ${String(err)}`);
      }
    }
    if (removed.length > 0) {
      this.auditLogsRepository.insert({
        action: 'backup_prune',
        detail: JSON.stringify({ keep, removed }),
      });
    }
    return removed;
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
    const source = path.join(this.getBackupDir(), this.assertBackupFilename(filename));
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
    return this.inspect(dbPath).integrityOk;
  }

  /**
   * 完整性检查：SQLite integrity_check + 与元数据 sha256 比对。
   * 老备份无 sha256 时只校验 SQLite 完整性，sha256Matched 为 null。
   */
  inspect(dbPath: string): {
    integrityOk: boolean;
    sha256Ok: boolean | null;
    size: number;
    detail: string;
  } {
    if (!fs.existsSync(dbPath)) {
      return { integrityOk: false, sha256Ok: null, size: 0, detail: '文件不存在' };
    }
    const integrityOk = this.sqliteIntegrityOk(dbPath);
    const size = fs.statSync(dbPath).size;
    const meta = this.readMeta(dbPath);
    let sha256Ok: boolean | null = null;
    let detail = integrityOk ? 'integrity_check 通过' : 'integrity_check 失败';
    if (meta?.sha256) {
      sha256Ok = this.sha256Of(dbPath) === meta.sha256;
      detail = sha256Ok
        ? 'integrity_check 与 sha256 均通过'
        : `integrity_check=${integrityOk}，sha256 校验失败`;
    }
    return { integrityOk, sha256Ok, size, detail };
  }

  /** 校验指定备份文件名 */
  verify(filename: string): {
    filename: string;
    integrityOk: boolean;
    sha256Ok: boolean | null;
    size: number;
    detail: string;
  } {
    const safe = this.assertBackupFilename(filename);
    const full = path.join(this.getBackupDir(), safe);
    if (!fs.existsSync(full)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '备份文件不存在', 404);
    }
    const r = this.inspect(full);
    this.auditLogsRepository.insert({
      action: 'backup_verify',
      detail: JSON.stringify({ filename: safe, integrityOk: r.integrityOk, sha256Ok: r.sha256Ok }),
    });
    return { filename: safe, ...r };
  }

  /** 文件 sha256 */
  private sha256Of(dbPath: string): string {
    return createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
  }

  /** 只读打开跑 integrity_check */
  private sqliteIntegrityOk(dbPath: string): boolean {
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

  /** 校验备份文件名（防目录穿越），返回合法文件名 */
  private assertBackupFilename(filename: string): string {
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
    return filename;
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
