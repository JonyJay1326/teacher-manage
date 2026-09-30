import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

/** 家长成绩单 PDF */
@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** 批量生成全部学生成绩单并打包 zip */
  @Get('score-cards.zip')
  @Header('Cache-Control', 'no-store')
  async bundle(@Res() res: Response): Promise<void> {
    const result = await this.reportsService.buildBundle();
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Report-Count', String(result.count));
    res.end(result.buffer);
  }

  /** 单个学生成绩单 PDF */
  @Get('score-cards/:studentId.pdf')
  @Header('Cache-Control', 'no-store')
  async single(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.reportsService.buildSingle(studentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader('Content-Length', String(result.buffer.length));
    res.end(result.buffer);
  }
}
