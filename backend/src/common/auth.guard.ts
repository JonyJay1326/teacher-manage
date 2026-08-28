import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** JWT 载荷 */
export interface JwtPayload {
  sub: number;
  username: string;
  displayName: string;
}

/** 扩展 Request 上的用户信息 */
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/** JWT Cookie 认证守卫 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** 校验 Cookie 中的 JWT */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookieName = this.configService.get<string>('COOKIE_NAME', 'cp_token');
    const token = request.cookies?.[cookieName] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('未登录或登录已过期');
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('未登录或登录已过期');
    }
  }
}
