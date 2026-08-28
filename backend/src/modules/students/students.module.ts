import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentsController, TagsController } from './students.controller';
import { StudentsRepository } from './students.repository';
import { StudentsService } from './students.service';
import { SensitiveRepository } from './sensitive.repository';
import { SensitiveService } from './sensitive.service';
import { TimelineRepository } from './timeline.repository';
import { TimelineService } from './timeline.service';

/** 学生档案模块 */
@Module({
  imports: [AuthModule],
  controllers: [StudentsController, TagsController],
  providers: [
    StudentsService,
    StudentsRepository,
    SensitiveService,
    SensitiveRepository,
    TimelineService,
    TimelineRepository,
  ],
  exports: [StudentsService],
})
export class StudentsModule {}
