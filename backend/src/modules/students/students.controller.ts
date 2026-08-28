import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  CreateGuardianDto,
  CreateStudentDto,
  ImportConfirmDto,
  ImportPreviewDto,
  ListStudentsQueryDto,
  ReplaceTagsDto,
  UpdateGuardianDto,
  UpdateStudentDto,
  UpsertImpressionDto,
  UpsertSensitiveDto,
} from './students.dto';
import {
  GuardianDto,
  ImportConfirmResultDto,
  ImportPreviewRowDto,
  StudentDetailDto,
  StudentDto,
  StudentImpressionDto,
  StudentsService,
  TagDto,
} from './students.service';
import {
  SensitiveService,
  type SensitiveContentView,
  type SensitiveSummaryView,
} from './sensitive.service';
import { TimelineService, type TimelineItemView } from './timeline.service';
import type { AuthRequest } from '../../common/auth.guard';

/** 学生档案控制器 */
@Controller('v1/students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly sensitiveService: SensitiveService,
    private readonly timelineService: TimelineService,
  ) {}

  /** 花名册分页列表 */
  @Get()
  list(
    @Query() query: ListStudentsQueryDto,
  ): { items: StudentDto[]; total: number } {
    return this.studentsService.list(query);
  }

  /** 粘贴导入预览 */
  @Post('import/preview')
  importPreview(
    @Body() dto: ImportPreviewDto,
  ): { rows: ImportPreviewRowDto[] } {
    return this.studentsService.importPreview(dto.text);
  }

  /** 粘贴导入确认 */
  @Post('import/confirm')
  importConfirm(@Body() dto: ImportConfirmDto): ImportConfirmResultDto {
    return this.studentsService.importConfirm(dto);
  }

  /** 更新监护人（静态路径须先于 :id） */
  @Patch('guardians/:guardianId')
  updateGuardian(
    @Param('guardianId', ParseIntPipe) guardianId: number,
    @Body() dto: UpdateGuardianDto,
  ): GuardianDto {
    return this.studentsService.updateGuardian(guardianId, dto);
  }

  /** 软删除监护人（静态路径须先于 :id） */
  @Delete('guardians/:guardianId')
  removeGuardian(
    @Param('guardianId', ParseIntPipe) guardianId: number,
  ): { ok: boolean } {
    return this.studentsService.removeGuardian(guardianId);
  }

  /** 列出学生监护人 */
  @Get(':id/guardians')
  listGuardians(@Param('id', ParseIntPipe) id: number): GuardianDto[] {
    return this.studentsService.listGuardians(id);
  }

  /** 新增监护人 */
  @Post(':id/guardians')
  createGuardian(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateGuardianDto,
  ): GuardianDto {
    return this.studentsService.createGuardian(id, dto);
  }

  /** 高敏卡片摘要（不解密） */
  @Get(':id/sensitive')
  listSensitive(
    @Param('id', ParseIntPipe) id: number,
  ): SensitiveSummaryView[] {
    return this.sensitiveService.listSummaries(id);
  }

  /** 成长时间线 */
  @Get(':id/timeline')
  listTimeline(
    @Param('id', ParseIntPipe) id: number,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
  ): TimelineItemView[] {
    return this.timelineService.list(id, { kind, q });
  }

  /** 读取班主任印象 */
  @Get(':id/impression')
  getImpression(@Param('id', ParseIntPipe) id: number): StudentImpressionDto {
    return this.studentsService.getImpression(id);
  }

  /** 保存班主任印象 */
  @Put(':id/impression')
  saveImpression(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertImpressionDto,
  ): StudentImpressionDto {
    return this.studentsService.saveImpression(id, dto.content);
  }

  /** 读取一类高敏明文（需 PIN 解锁） */
  @Get(':id/sensitive/:category')
  getSensitive(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('category') category: string,
  ): SensitiveContentView {
    return this.sensitiveService.getContent(req.user!.sub, id, category);
  }

  /** 写入一类高敏（需 PIN 解锁） */
  @Put(':id/sensitive/:category')
  upsertSensitive(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('category') category: string,
    @Body() dto: UpsertSensitiveDto,
  ): SensitiveContentView {
    return this.sensitiveService.upsertContent(
      req.user!.sub,
      id,
      category,
      dto.content,
    );
  }

  /** 软删除一类高敏（需 PIN 解锁） */
  @Delete(':id/sensitive/:category')
  removeSensitive(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('category') category: string,
  ): { ok: boolean } {
    return this.sensitiveService.remove(req.user!.sub, id, category);
  }

  /** 替换学生标签 */
  @Post(':id/tags')
  replaceTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceTagsDto,
  ): StudentDetailDto {
    return this.studentsService.replaceTags(id, dto.tagIds);
  }

  /** 学生详情 */
  @Get(':id')
  getDetail(@Param('id', ParseIntPipe) id: number): StudentDetailDto {
    return this.studentsService.getDetail(id);
  }

  /** 新建学生 */
  @Post()
  create(@Body() dto: CreateStudentDto): StudentDetailDto {
    return this.studentsService.create(dto);
  }

  /** 更新学生 */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
  ): StudentDetailDto {
    return this.studentsService.update(id, dto);
  }

  /** 软删除学生 */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { ok: boolean } {
    return this.studentsService.remove(id);
  }
}

/** 标签字典控制器 */
@Controller('v1/tags')
export class TagsController {
  constructor(private readonly studentsService: StudentsService) {}

  /** 列出全部标签 */
  @Get()
  listAll(): TagDto[] {
    return this.studentsService.listTags();
  }
}
