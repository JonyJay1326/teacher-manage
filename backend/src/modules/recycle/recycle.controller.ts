import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { RecycleEntityType } from './recycle.repository';
import { RecycleService, type RecycleItemView } from './recycle.service';

/** 列表查询 */
class RecycleQueryDto {
  @IsOptional()
  @IsIn(['students', 'incidents', 'comments', 'exams', 'kb_documents'])
  type?: RecycleEntityType = 'students';
}

/** 回收站控制器 */
@Controller('v1/recycle')
export class RecycleController {
  constructor(private readonly recycleService: RecycleService) {}

  /** 软删除列表 */
  @Get()
  list(@Query() query: RecycleQueryDto): { items: RecycleItemView[] } {
    const type = query.type ?? 'students';
    return { items: this.recycleService.list(type) };
  }

  /** 恢复 */
  @Post(':type/:id/restore')
  restore(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
  ): { ok: boolean } {
    const allowed: RecycleEntityType[] = [
      'students',
      'incidents',
      'comments',
      'exams',
      'kb_documents',
    ];
    if (!allowed.includes(type as RecycleEntityType)) {
      return { ok: false };
    }
    return this.recycleService.restore(type as RecycleEntityType, id);
  }
}
