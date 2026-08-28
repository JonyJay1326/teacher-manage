import { Injectable } from '@nestjs/common';

/** PIN 解锁会话（进程内，单实例 pm2 足够） */
@Injectable()
export class PinUnlockService {
  private readonly unlockUntilMs = new Map<number, number>();
  private readonly unlockMinutes = 10;

  /** 标记用户已解锁，返回解锁截止 UTC ISO */
  markUnlocked(userId: number): string {
    const until = Date.now() + this.unlockMinutes * 60 * 1000;
    this.unlockUntilMs.set(userId, until);
    return new Date(until).toISOString();
  }

  /** 当前是否仍在解锁窗口内 */
  isUnlocked(userId: number): boolean {
    const until = this.unlockUntilMs.get(userId);
    if (until === undefined) return false;
    if (until <= Date.now()) {
      this.unlockUntilMs.delete(userId);
      return false;
    }
    return true;
  }

  /** 解锁截止时间（未解锁或已过期返回 null） */
  getUnlockedUntil(userId: number): string | null {
    if (!this.isUnlocked(userId)) return null;
    const until = this.unlockUntilMs.get(userId);
    return until === undefined ? null : new Date(until).toISOString();
  }

  /** 清除解锁状态（登出时调用） */
  clear(userId: number): void {
    this.unlockUntilMs.delete(userId);
  }
}
