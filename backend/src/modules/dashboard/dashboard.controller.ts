import { Controller, Get } from '@nestjs/common';
import { DashboardService, type DashboardHomeView } from './dashboard.service';

/** 看板控制器 */
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** 首页看板聚合数据 */
  @Get('home')
  home(): DashboardHomeView {
    return this.dashboardService.getHome();
  }
}
