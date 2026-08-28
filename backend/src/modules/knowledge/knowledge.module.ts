import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeRepository } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';
import { TextExtractService } from './text-extract.service';

/** 知识库模块（文档 CRUD + 检索；问答 AI 在 AiModule） */
@Module({
  imports: [forwardRef(() => AiModule)],
  controllers: [KnowledgeController],
  providers: [KnowledgeRepository, KnowledgeService, TextExtractService],
  exports: [KnowledgeRepository, KnowledgeService],
})
export class KnowledgeModule {}
