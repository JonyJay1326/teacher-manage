import { Controller, Get } from '@nestjs/common';
import { ExportService, type ExportResult } from './export.service';

/** 全量导出控制器 */
@Controller('v1/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /** 一键导出全量 Excel（学生/成绩/事件/评语 各一个 sheet） */
  @Get('excel')
  excel(): ExportResult {
    return this.exportService.buildFullExport();
  }
}
