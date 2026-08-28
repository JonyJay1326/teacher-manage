import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { PinUnlockService } from './pin-unlock.service';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';
import { AppException, ErrorCodes } from '../../common/api';
import type { JwtPayload } from '../../common/auth.guard';

/** PIN 状态视图 */
export interface PinStatusView {
  hasPin: boolean;
  unlocked: boolean;
  unlockedUntil: string | null;
  pinLocked: boolean;
  pinLockedUntil: string | null;
}

/** 认证业务服务 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly pinUnlockService: PinUnlockService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  /** 校验账号密码并签发 JWT */
  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; user: { id: number; username: string; displayName: string } }> {
    const user = this.usersRepository.findByUsername(username);
    if (!user) {
      throw new AppException(ErrorCodes.BAD_CREDENTIALS, '用户名或密码错误', 401);
    }

    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until).getTime();
      if (lockedUntil > Date.now()) {
        throw new AppException(ErrorCodes.LOCKED, '账号已锁定，请稍后再试', 403);
      }
    }

    const matched = await bcrypt.compare(password, user.password_hash);
    if (!matched) {
      const attempts = user.failed_attempts + 1;
      let lockedUntil: string | null = null;
      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      this.usersRepository.updateLoginState(user.id, attempts, lockedUntil);
      if (lockedUntil) {
        throw new AppException(ErrorCodes.LOCKED, '登录失败次数过多，账号已锁定 15 分钟', 403);
      }
      throw new AppException(ErrorCodes.BAD_CREDENTIALS, '用户名或密码错误', 401);
    }

    this.usersRepository.updateLoginState(user.id, 0, null);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      displayName: user.display_name ?? user.username,
    };
    const days = Number(this.configService.get('JWT_EXPIRES_DAYS', 7));
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: `${days}d`,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name ?? user.username,
      },
    };
  }

  /** 登出时清除 PIN 解锁缓存 */
  logout(userId: number): void {
    this.pinUnlockService.clear(userId);
  }

  /** 当前用户信息 */
  me(userId: number): { id: number; username: string; displayName: string } {
    const user = this.usersRepository.findById(userId);
    if (!user) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', 401);
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name ?? user.username,
    };
  }

  /** 修改密码 */
  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = this.usersRepository.findById(userId);
    if (!user) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', 401);
    }
    const matched = await bcrypt.compare(oldPassword, user.password_hash);
    if (!matched) {
      throw new AppException(ErrorCodes.BAD_CREDENTIALS, '原密码错误', 400);
    }
    const hash = await bcrypt.hash(newPassword, 10);
    this.usersRepository.updatePassword(userId, hash);
  }

  /** PIN 状态 */
  getPinStatus(userId: number): PinStatusView {
    const user = this.usersRepository.findById(userId);
    if (!user) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', 401);
    }
    const pinLockedUntil = user.pin_locked_until;
    const pinLocked =
      !!pinLockedUntil && new Date(pinLockedUntil).getTime() > Date.now();
    return {
      hasPin: !!user.pin_hash,
      unlocked: this.pinUnlockService.isUnlocked(userId),
      unlockedUntil: this.pinUnlockService.getUnlockedUntil(userId),
      pinLocked,
      pinLockedUntil: pinLocked ? pinLockedUntil : null,
    };
  }

  /** 设置或修改 PIN（需验登录密码） */
  async setPin(userId: number, password: string, pin: string): Promise<void> {
    const user = this.usersRepository.findById(userId);
    if (!user) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', 401);
    }
    const matched = await bcrypt.compare(password, user.password_hash);
    if (!matched) {
      throw new AppException(ErrorCodes.BAD_CREDENTIALS, '登录密码错误', 400);
    }
    const hash = await bcrypt.hash(pin, 10);
    this.usersRepository.updatePinHash(userId, hash);
    this.pinUnlockService.clear(userId);
    this.auditLogsRepository.insert({
      action: 'pin_set',
      detail: JSON.stringify({ userId }),
    });
  }

  /** 校验 PIN 并开启 10 分钟解锁窗口 */
  async verifyPin(
    userId: number,
    pin: string,
  ): Promise<{ unlockedUntil: string }> {
    const user = this.usersRepository.findById(userId);
    if (!user) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', 401);
    }

    if (!user.pin_hash) {
      throw new AppException(
        ErrorCodes.STATE_INVALID,
        '尚未设置 PIN，请先在系统设置中设置',
      );
    }

    if (user.pin_locked_until) {
      const lockedUntil = new Date(user.pin_locked_until).getTime();
      if (lockedUntil > Date.now()) {
        throw new AppException(
          ErrorCodes.LOCKED,
          'PIN 已锁定，请稍后再试',
          403,
        );
      }
    }

    const matched = await bcrypt.compare(pin, user.pin_hash);
    if (!matched) {
      const attempts = (user.pin_failed_attempts ?? 0) + 1;
      let pinLockedUntil: string | null = null;
      if (attempts >= 5) {
        pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      this.usersRepository.updatePinState(user.id, attempts, pinLockedUntil);
      this.auditLogsRepository.insert({
        action: 'pin_fail',
        detail: JSON.stringify({ attempts }),
      });
      if (pinLockedUntil) {
        throw new AppException(
          ErrorCodes.LOCKED,
          'PIN 错误次数过多，已锁定 15 分钟',
          403,
        );
      }
      const remain = 5 - attempts;
      throw new AppException(
        ErrorCodes.PIN_ERROR,
        `PIN 码错误，剩余 ${remain} 次机会`,
        400,
      );
    }

    this.usersRepository.updatePinState(user.id, 0, null);
    const unlockedUntil = this.pinUnlockService.markUnlocked(userId);
    this.auditLogsRepository.insert({
      action: 'pin_unlock',
      detail: JSON.stringify({ unlockedUntil }),
    });
    return { unlockedUntil };
  }
}
