import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ListAuditLogsQueryDto, UpdateThresholdsDto } from './settings.dto';
import { SettingsService } from './settings.service';

/** 系统设置控制器 */
@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** 成绩分析阈值 */
  @Get('thresholds')
  getThresholds() {
    return this.settingsService.getThresholds();
  }

  /** 更新阈值 */
  @Put('thresholds')
  updateThresholds(@Body() dto: UpdateThresholdsDto) {
    return this.settingsService.updateThresholds(dto);
  }

  /** 安全审计日志 */
  @Get('audit-logs')
  listAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.settingsService.listAuditLogs({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      q: query.q,
      action: query.action,
    });
  }
}
