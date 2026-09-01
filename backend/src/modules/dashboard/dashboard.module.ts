import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

/** 看板模块 */
@Module({
  imports: [IncidentsModule, AnalysisModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
