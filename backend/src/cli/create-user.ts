import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DatabaseModule } from '../database/database.module';
import { UsersRepository } from '../modules/auth/users.repository';
import { AppException, ErrorCodes } from '../common/api';

/** CLI 专用精简模块 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
  ],
  providers: [UsersRepository],
})
class CliModule {}

/** 创建单用户：npm run cli:create-user -- <username> <password> [displayName] */
async function main(): Promise<void> {
  const [, , username, password, displayNameArg] = process.argv;
  if (!username || !password) {
    console.error('用法: npm run cli:create-user -- <username> <password> [displayName]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: ['error', 'warn', 'log'],
  });
  const usersRepository = app.get(UsersRepository);

  if (usersRepository.countUsers() > 0) {
    console.error('已存在用户，本系统为单用户，拒绝重复创建');
    await app.close();
    process.exit(1);
  }

  if (password.length < 6) {
    throw new AppException(ErrorCodes.VALIDATION, '密码至少 6 位');
  }

  const hash = await bcrypt.hash(password, 10);
  const id = usersRepository.createUser({
    username,
    passwordHash: hash,
    displayName: displayNameArg ?? `${username}老师`,
  });
  console.log(`用户已创建: id=${id}, username=${username}`);
  await app.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
