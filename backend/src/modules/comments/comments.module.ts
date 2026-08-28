import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

/** 评语模块 */
@Module({
  imports: [AiModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
  exports: [CommentsService],
})
export class CommentsModule {}
