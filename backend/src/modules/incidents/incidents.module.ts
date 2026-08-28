import { Module } from '@nestjs/common';
import {
  AttachmentsController,
  IncidentsController,
} from './incidents.controller';
import { AttachmentsService } from './attachments.service';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/** 事件记录模块 */
@Module({
  controllers: [IncidentsController, AttachmentsController],
  providers: [IncidentsService, IncidentsRepository, AttachmentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
