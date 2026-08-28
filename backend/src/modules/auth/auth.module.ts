import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersRepository } from './users.repository';
import { PinUnlockService } from './pin-unlock.service';
import { AuthGuard } from '../../common/auth.guard';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';

/** 认证模块 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersRepository,
    PinUnlockService,
    AuditLogsRepository,
    AuthGuard,
  ],
  exports: [
    AuthService,
    UsersRepository,
    PinUnlockService,
    AuthGuard,
    JwtModule,
    AuditLogsRepository,
  ],
})
export class AuthModule {}
