import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { nowIso } from '../common/api';

/** SQLite 数据库服务：唯一允许接触 better-sqlite3 的入口由 Repository 经本服务访问 */
@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: Database.Database;

  constructor(private readonly configService: ConfigService) {}

  /** 模块初始化：打开库并执行迁移 */
  onModuleInit(): void {
    const dbPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('DB_PATH', './data/classpilot.db'),
    );
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
    this.logger.log(`SQLite ready: ${dbPath}`);
  }

  /** 获取数据库连接 */
  getDb(): Database.Database {
    return this.db;
  }

  /** 当前库文件绝对路径 */
  getDbPath(): string {
    return path.resolve(
      process.cwd(),
      this.configService.get<string>('DB_PATH', './data/classpilot.db'),
    );
  }

  /**
   * 用备份文件替换当前库并重新打开连接。
   * 调用方须先自行备份当前库。
   */
  replaceWithBackup(backupFilePath: string): void {
    const dbPath = this.getDbPath();
    const absBackup = path.resolve(backupFilePath);
    if (!fs.existsSync(absBackup)) {
      throw new Error(`备份文件不存在: ${absBackup}`);
    }
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${dbPath}${suffix}`;
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    fs.copyFileSync(absBackup, dbPath);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.logger.log(`Database restored from: ${absBackup}`);
  }

  /** 按序执行未应用的迁移脚本 */
  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn(`migrations 目录不存在: ${migrationsDir}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      (
        this.db.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>
      ).map((r) => r.name),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const apply = this.db.transaction(() => {
        this.db.exec(sql);
        this.db
          .prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
          .run(file, nowIso());
      });
      apply();
      this.logger.log(`Applied migration: ${file}`);
    }
  }
}
