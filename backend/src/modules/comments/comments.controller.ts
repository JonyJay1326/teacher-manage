import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdoptCommentDto,
  ContextQueryDto,
  CreateCommentDto,
  GenerateCommentDto,
  WorkbenchQueryDto,
} from './comments.dto';
import { CommentsService } from './comments.service';

/** 评语控制器 */
@Controller('v1/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /** 批量评语工作台 */
  @Get('workbench')
  workbench(@Query() query: WorkbenchQueryDto) {
    return this.commentsService.getWorkbench(query.termId, query.commentType);
  }

  /** 预览注入上下文 */
  @Get('context/:studentId')
  context(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: ContextQueryDto,
  ) {
    return this.commentsService.previewContext(studentId, query.termId ?? null);
  }

  /** 生成评语草稿 */
  @Post('generate')
  generate(@Body() dto: GenerateCommentDto) {
    return this.commentsService.generate(dto);
  }

  /** 采纳评语 */
  @Post('adopt')
  adopt(@Body() dto: AdoptCommentDto) {
    return this.commentsService.adopt(dto);
  }

  /** 手工新建 */
  @Post()
  create(@Body() dto: CreateCommentDto) {
    return this.commentsService.createManual(dto);
  }

  /** 某生评语列表 */
  @Get('student/:studentId')
  listByStudent(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.commentsService.listByStudent(studentId);
  }

  /** 软删除 */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.commentsService.remove(id);
  }
}
