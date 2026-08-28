import { Module, forwardRef } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiController } from './ai.controller';
import { AiRepository } from './ai.repository';
import { AiService } from './ai.service';
import { CommentContextService } from './comment-context.service';
import { CommentGenerateService } from './comment-generate.service';
import { DataQaContextService } from './data-qa-context.service';
import { DataQaService } from './data-qa.service';
import { DeepSeekService } from './deepseek.service';
import { KbQaService } from './kb-qa.service';
import { PromptsRepository } from './prompts.repository';
import { PromptsService } from './prompts.service';
import { ScoreImportMappingService } from './score-import-mapping.service';
import { TalkScriptService } from './talk-script.service';
import { WorkSummaryService } from './work-summary.service';

/** AI 模块（评语、学情问答、知识库问答、话术、工作总结、模板等） */
@Module({
  imports: [forwardRef(() => KnowledgeModule), AnalysisModule],
  controllers: [AiController],
  providers: [
    AiRepository,
    AiService,
    DeepSeekService,
    CommentContextService,
    CommentGenerateService,
    DataQaContextService,
    DataQaService,
    KbQaService,
    PromptsRepository,
    PromptsService,
    ScoreImportMappingService,
    TalkScriptService,
    WorkSummaryService,
  ],
  exports: [
    AiRepository,
    AiService,
    DeepSeekService,
    CommentContextService,
    CommentGenerateService,
    DataQaContextService,
    DataQaService,
    KbQaService,
    PromptsRepository,
    PromptsService,
    ScoreImportMappingService,
    TalkScriptService,
    WorkSummaryService,
  ],
})
export class AiModule {}
