import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

/** 备份模块 */
@Module({
  imports: [AuthModule],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
