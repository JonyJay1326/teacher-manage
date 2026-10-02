import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AppException, ErrorCodes } from '../../common/api';
import { AiService } from '../ai/ai.service';
import {
  AdoptCommentDto,
  ContextQueryDto,
  CreateCommentDto,
  GenerateCommentDto,
  StreamCommentDto,
  WorkbenchQueryDto,
} from './comments.dto';
import { CommentsService } from './comments.service';

/** 评语控制器 */
@Controller('v1/comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly aiService: AiService,
  ) {}

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

  /** 生成评语草稿（非流式，保持既有行为） */
  @Post('generate')
  generate(@Body() dto: GenerateCommentDto) {
    return this.commentsService.generate(dto);
  }

  /**
   * 流式生成评语草稿（SSE）。
   * 事件序列：meta → (delta)* → done；中断时 done.interrupted=true。
   */
  @Post('generate-stream')
  @Sse('generate-stream')
  @HttpCode(200)
  generateStream(@Body() dto: StreamCommentDto): Observable<MessageEvent> {
    if (!this.commentsService.studentExists(dto.studentId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    if (dto.termId !== undefined && !this.commentsService.termExists(dto.termId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学期不存在', 404);
    }
    return this.aiService.mockStreamGenerate({
      studentId: dto.studentId,
      commentType: dto.commentType,
      continueFrom: dto.continueFrom,
    });
  }

  /**
   * demo 模式流式模拟：不依赖 DeepSeek，按字符节奏吐字。
   * 仅用于演示/前端联调，不写业务库。
   */
  @Post('mock-stream')
  @Sse('mock-stream')
  @HttpCode(200)
  mockStream(
    @Body() dto: { studentId?: number; name?: string; continueFrom?: string },
  ): Observable<MessageEvent> {
    return this.aiService.mockStreamGenerate({
      studentId: dto.studentId ?? 1,
      commentType: '期末评语',
      continueFrom: dto.continueFrom,
      name: dto.name,
    });
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
