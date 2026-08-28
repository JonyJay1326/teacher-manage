import { Module } from '@nestjs/common';
import { RecycleController } from './recycle.controller';
import { RecycleRepository } from './recycle.repository';
import { RecycleService } from './recycle.service';

/** 回收站模块 */
@Module({
  controllers: [RecycleController],
  providers: [RecycleService, RecycleRepository],
})
export class RecycleModule {}
