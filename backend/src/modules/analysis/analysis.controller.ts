import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import {
  AnalysisService,
  type AnalysisOverviewView,
} from './analysis.service';

/** 分析查询 */
class AnalysisQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  examId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subjectId?: number;
}

/** 分析中心控制器 */
@Controller('v1/analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /** 分析中心聚合数据（含 M1–M2 全图） */
  @Get('overview')
  overview(@Query() query: AnalysisQueryDto): AnalysisOverviewView {
    return this.analysisService.getOverview(query.examId, query.subjectId);
  }
}
