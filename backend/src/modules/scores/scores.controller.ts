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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppException, ErrorCodes } from '../../common/api';
import {
  BatchUpsertScoresDto,
  CreateExamDto,
  ExcelImportCommitDto,
  RecalcRanksDto,
  UpdateExamDto,
} from './scores.dto';
import { ScoreExcelImportService } from './score-excel-import.service';
import { ScoresService } from './scores.service';

/** 上传文件形态 */
interface UploadedExcelFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** 成绩/考试控制器（前缀 api/v1） */
@Controller('v1')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService,
    private readonly scoreExcelImportService: ScoreExcelImportService,
  ) {}

  /** 学期列表 */
  @Get('terms')
  listTerms() {
    return this.scoresService.listTerms();
  }

  /** 启用科目列表 */
  @Get('subjects')
  listSubjects() {
    return this.scoresService.listSubjects();
  }

  /** 考试列表（未软删） */
  @Get('exams')
  listExams() {
    return this.scoresService.listExams();
  }

  /** 创建考试 */
  @Post('exams')
  createExam(@Body() dto: CreateExamDto) {
    return this.scoresService.createExam(dto);
  }

  /** 更新考试 */
  @Patch('exams/:id')
  updateExam(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExamDto,
  ) {
    return this.scoresService.updateExam(id, dto);
  }

  /** 软删除考试 */
  @Delete('exams/:id')
  deleteExam(@Param('id', ParseIntPipe) id: number) {
    return this.scoresService.deleteExam(id);
  }

  /** 下载 Excel 导入模板 */
  @Get('exams/:id/import/template')
  downloadImportTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.scoreExcelImportService.buildTemplate(id);
  }

  /** 上传 Excel：AI/规则识别后返回预览（不写库） */
  @Post('exams/:id/import/parse')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  parseImport(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: UploadedExcelFile,
  ) {
    if (!file) {
      throw new AppException(ErrorCodes.VALIDATION, '请上传 Excel 文件');
    }
    return this.scoreExcelImportService.parseUpload(id, file);
  }

  /** 确认将预览中的成绩写入数据库 */
  @Post('exams/:id/import/commit')
  commitImport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExcelImportCommitDto,
  ) {
    return this.scoreExcelImportService.commit(id, dto.writeMode, dto.items);
  }

  /** 考试全科成绩矩阵 */
  @Get('exams/:id/matrix')
  getExamMatrix(@Param('id', ParseIntPipe) id: number) {
    return this.scoresService.getExamMatrix(id);
  }

  /** 单科录入行 */
  @Get('exams/:id/entry')
  getEntryRows(
    @Param('id', ParseIntPipe) id: number,
    @Query('subjectId', ParseIntPipe) subjectId: number,
  ) {
    return this.scoresService.getEntryRows(id, subjectId);
  }

  /** 重算班排（可选指定科目） */
  @Post('exams/:id/recalc')
  recalcRanks(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecalcRanksDto = {},
  ) {
    return this.scoresService.recalcRanks(id, dto.subjectId);
  }

  /** 考试详情 */
  @Get('exams/:id')
  getExam(@Param('id', ParseIntPipe) id: number) {
    return this.scoresService.getExam(id);
  }

  /** 批量 upsert 成绩 */
  @Patch('scores/batch')
  batchUpsertScores(@Body() dto: BatchUpsertScoresDto) {
    return this.scoresService.batchUpsertScores(dto);
  }
}
