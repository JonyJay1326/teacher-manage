import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { AppException, ErrorCodes } from '../../common/api';
import {
  AttachmentsService,
  type AttachmentView,
  type UploadedAttachmentFile,
} from './attachments.service';
import {
  ConfirmIncidentDto,
  CreateDraftDto,
  CreateIncidentDto,
  ListIncidentsQueryDto,
  UpdateIncidentDto,
} from './incidents.dto';
import { IncidentsService, type IncidentView } from './incidents.service';

/** 事件记录控制器 */
@Controller('v1/incidents')
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  /** 分页列表（含 studentNames、draftCount） */
  @Get()
  list(@Query() query: ListIncidentsQueryDto): {
    items: IncidentView[];
    total: number;
    draftCount: number;
  } {
    return this.incidentsService.list(query);
  }

  /** 草稿数量 */
  @Get('draft-count')
  draftCount(): { count: number } {
    return this.incidentsService.draftCount();
  }

  /** 到期未完成跟进 */
  @Get('follow-ups/due')
  dueFollowUps(): IncidentView[] {
    return this.incidentsService.listDueFollowUps(20);
  }

  /** 创建速记草稿 */
  @Post('draft')
  createDraft(@Body() dto: CreateDraftDto): IncidentView {
    return this.incidentsService.createDraft(dto);
  }

  /** 直接新建正式事件 */
  @Post()
  create(@Body() dto: CreateIncidentDto): IncidentView {
    return this.incidentsService.create(dto);
  }

  /** 事件附件列表 */
  @Get(':id/attachments')
  listAttachments(
    @Param('id', ParseIntPipe) id: number,
  ): AttachmentView[] {
    return this.attachmentsService.listByIncident(id);
  }

  /** 上传事件附件 */
  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
  ): Promise<AttachmentView> {
    if (!file) {
      throw new AppException(ErrorCodes.VALIDATION, '请上传文件');
    }
    return this.attachmentsService.upload(id, file);
  }

  /** 事件详情 */
  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number): IncidentView {
    return this.incidentsService.getById(id);
  }

  /** 人工确认草稿为正式事件 */
  @Patch(':id/confirm')
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmIncidentDto,
  ): IncidentView {
    return this.incidentsService.confirm(id, dto);
  }

  /** 部分更新事件 */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncidentDto,
  ): IncidentView {
    return this.incidentsService.update(id, dto);
  }

  /** 软删除事件 */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { ok: boolean } {
    return this.incidentsService.remove(id);
  }
}

/** 附件下载（认证接口，禁止 Nginx 静态直出） */
@Controller('v1/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  /** 下载原图或缩略图 */
  @Get(':id/file')
  file(
    @Param('id', ParseIntPipe) id: number,
    @Query('thumb') thumb: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const info = this.attachmentsService.getFile(id, thumb === '1');
    res.setHeader('Content-Type', info.mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(info.filename)}"`,
    );
    return new StreamableFile(createReadStream(info.absPath));
  }

  /** 软删除附件 */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { ok: boolean } {
    return this.attachmentsService.remove(id);
  }
}
