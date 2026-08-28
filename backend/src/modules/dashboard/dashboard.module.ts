import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

/** 看板模块 */
@Module({
  imports: [IncidentsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
