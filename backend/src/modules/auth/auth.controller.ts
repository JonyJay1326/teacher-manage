import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService, type PinStatusView } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  SetPinDto,
  VerifyPinDto,
} from './auth.dto';
import { AuthGuard, type AuthRequest } from '../../common/auth.guard';
import { Public } from '../../common/public.decorator';

/** 认证控制器 */
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** 登录并写入 HttpOnly Cookie */
  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ id: number; username: string; displayName: string }> {
    const result = await this.authService.login(dto.username, dto.password);
    const cookieName = this.configService.get<string>('COOKIE_NAME', 'cp_token');
    const days = Number(this.configService.get('JWT_EXPIRES_DAYS', 7));
    res.cookie(cookieName, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: days * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return result.user;
  }

  /** 登出并清除 Cookie 与 PIN 解锁 */
  @Post('logout')
  @UseGuards(AuthGuard)
  logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): { ok: boolean } {
    this.authService.logout(req.user!.sub);
    const cookieName = this.configService.get<string>('COOKIE_NAME', 'cp_token');
    res.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  }

  /** 当前登录用户 */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthRequest): { id: number; username: string; displayName: string } {
    return this.authService.me(req.user!.sub);
  }

  /** 修改密码 */
  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(
    @Req() req: AuthRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: boolean }> {
    await this.authService.changePassword(
      req.user!.sub,
      dto.oldPassword,
      dto.newPassword,
    );
    return { ok: true };
  }

  /** PIN 状态 */
  @Get('pin/status')
  @UseGuards(AuthGuard)
  pinStatus(@Req() req: AuthRequest): PinStatusView {
    return this.authService.getPinStatus(req.user!.sub);
  }

  /** 设置/修改 PIN */
  @Post('pin/set')
  @UseGuards(AuthGuard)
  async setPin(
    @Req() req: AuthRequest,
    @Body() dto: SetPinDto,
  ): Promise<{ ok: boolean }> {
    await this.authService.setPin(req.user!.sub, dto.password, dto.pin);
    return { ok: true };
  }

  /** 校验 PIN 解锁高敏 */
  @Post('pin/verify')
  @UseGuards(AuthGuard)
  async verifyPin(
    @Req() req: AuthRequest,
    @Body() dto: VerifyPinDto,
  ): Promise<{ unlockedUntil: string }> {
    return this.authService.verifyPin(req.user!.sub, dto.pin);
  }
}
