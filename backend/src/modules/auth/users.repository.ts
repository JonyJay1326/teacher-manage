import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 用户数据行 */
export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  pin_hash: string | null;
  display_name: string | null;
  failed_attempts: number;
  locked_until: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  created_at: string;
  updated_at: string | null;
}

/** 用户仓储 */
@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 按用户名查询 */
  findByUsername(username: string): UserRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;
  }

  /** 按 ID 查询 */
  findById(id: number): UserRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  }

  /** 统计用户数 */
  countUsers(): number {
    const row = this.databaseService
      .getDb()
      .prepare('SELECT COUNT(*) AS c FROM users')
      .get() as { c: number };
    return row.c;
  }

  /** 创建用户 */
  createUser(input: {
    username: string;
    passwordHash: string;
    displayName: string;
  }): number {
    const now = nowIso();
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO users (username, password_hash, display_name, failed_attempts, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
      )
      .run(input.username, input.passwordHash, input.displayName, now, now);
    return Number(result.lastInsertRowid);
  }

  /** 更新登录失败/锁定状态 */
  updateLoginState(
    id: number,
    failedAttempts: number,
    lockedUntil: string | null,
  ): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`,
      )
      .run(failedAttempts, lockedUntil, nowIso(), id);
  }

  /** 更新密码 */
  updatePassword(id: number, passwordHash: string): void {
    this.databaseService
      .getDb()
      .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .run(passwordHash, nowIso(), id);
  }

  /** 更新 PIN 哈希 */
  updatePinHash(id: number, pinHash: string): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE users SET pin_hash = ?, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(pinHash, nowIso(), id);
  }

  /** 更新 PIN 失败/锁定状态 */
  updatePinState(
    id: number,
    pinFailedAttempts: number,
    pinLockedUntil: string | null,
  ): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE users SET pin_failed_attempts = ?, pin_locked_until = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(pinFailedAttempts, pinLockedUntil, nowIso(), id);
  }
}
