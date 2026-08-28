import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisRepository } from './analysis.repository';
import { AnalysisService } from './analysis.service';

/** 分析中心模块 */
@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisRepository],
  exports: [AnalysisService],
})
export class AnalysisModule {}
