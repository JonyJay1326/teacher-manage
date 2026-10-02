import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExportController } from './export.controller';
import { ExportRepository } from './export.repository';
import { ExportService } from './export.service';

/** 数据导出模块 */
@Module({
  imports: [AuthModule],
  controllers: [ExportController],
  providers: [ExportRepository, ExportService],
  exports: [ExportService],
})
export class ExportModule {}
