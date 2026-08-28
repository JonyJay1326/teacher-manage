import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsBoolean, IsString, MinLength } from 'class-validator';
import { BackupService } from './backup.service';

/** 恢复备份 DTO */
class RestoreBackupDto {
  @IsString()
  @MinLength(1)
  filename!: string;

  @IsBoolean()
  confirm!: boolean;
}

/** 备份手动触发（需登录） */
@Controller('v1/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /** 手动触发一次备份 */
  @Post('run')
  run(): { backupPath: string; ok: boolean; filename: string } {
    return this.backupService.runBackup('manual');
  }

  /** 备份列表 */
  @Get('list')
  list() {
    return this.backupService.listBackups();
  }

  /** 从备份恢复（先自动备份当前库） */
  @Post('restore')
  restore(@Body() dto: RestoreBackupDto) {
    return this.backupService.restore(dto.filename, dto.confirm);
  }
}
