import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ScoreExcelImportService } from './score-excel-import.service';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { ScoresRepository } from './scores.repository';

/** 成绩/考试模块 */
@Module({
  imports: [AiModule],
  controllers: [ScoresController],
  providers: [ScoresService, ScoresRepository, ScoreExcelImportService],
  exports: [ScoresService],
})
export class ScoresModule {}
