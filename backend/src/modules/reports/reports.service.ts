import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { AppException, ErrorCodes, nowIso } from '../../common/api';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';
import {
  ReportsRepository,
  type ReportCommentRow,
  type ReportExamRow,
  type ReportScoreRow,
  type ReportStudentRow,
} from './reports.repository';

/** 单科展示行 */
interface RenderSubjectRow {
  name: string;
  fullScore: number;
  scoreText: string;
  rankText: string;
  isLow: boolean;
}

/** 单份成绩单的渲染输入 */
export interface ReportCard {
  student: ReportStudentRow;
  exam: ReportExamRow;
  subjects: RenderSubjectRow[];
  totalScore: number | null;
  totalRank: number | null;
  classSize: number;
  comment: ReportCommentRow | null;
}

/** 批量导出结果 */
export interface ReportBundleResult {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  count: number;
}

/** 字体候选（按优先级）；Linux 部署时可经 REPORT_FONT_PATH 指定 */
const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\simhei.ttf',
  'C:\\Windows\\Fonts\\simsunb.ttf',
  'C:\\Windows\\Fonts\\Deng.ttf',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
];

/** 家长成绩单 PDF 批量生成 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  /** 解析后的中文字体路径；null 表示尚未解析 */
  private resolvedFont: string | null | undefined;

  constructor(
    private readonly reportsRepository: ReportsRepository,
    private readonly configService: ConfigService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  /**
   * 解析中文字体路径。
   * 找不到可用字体时抛 500（不静默降级成乱码 PDF）。
   */
  private resolveFont(): string {
    if (this.resolvedFont !== undefined) {
      if (this.resolvedFont === null) this.throwNoFont();
      return this.resolvedFont;
    }
    const configured = this.configService.get<string>('REPORT_FONT_PATH', '').trim();
    const candidates = configured ? [configured, ...FONT_CANDIDATES] : FONT_CANDIDATES;
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        // pdfkit 不支持 .ttc 字体集合
        if (candidate.toLowerCase().endsWith('.ttc')) continue;
        this.resolvedFont = candidate;
        return candidate;
      }
    }
    this.resolvedFont = null;
    this.throwNoFont();
  }

  /** 字体缺失的显式报错 */
  private throwNoFont(): never {
    throw new AppException(
      ErrorCodes.SYSTEM,
      '未找到可用的中文字体，无法生成 PDF。请设置 REPORT_FONT_PATH 指向一个 .ttf 中文字体',
      500,
    );
  }

  /** 构造某生某场考试的成绩单数据 */
  buildCard(
    student: ReportStudentRow,
    exam: ReportExamRow,
  ): ReportCard {
    const scoreRows = this.reportsRepository.listStudentScores(
      exam.id,
      student.id,
    );
    const byId = new Map(scoreRows.map((r) => [r.subject_id, r]));

    const subjects = this.reportsRepository
      .listExamSubjects(exam.id)
      .map((sub): RenderSubjectRow => {
        const row: ReportScoreRow | undefined = byId.get(sub.id);
        const status = row?.status ?? '缺考';
        const scoreText =
          status === '缺考'
            ? '缺考'
            : status === '免考'
              ? '免考'
              : row?.score === null || row?.score === undefined
                ? '—'
                : String(row.score);
        const rankText =
          status === '正常' && row?.class_rank
            ? `第 ${row.class_rank} 名`
            : '—';
        const isLow =
          status === '正常' &&
          row?.score !== null &&
          row?.score !== undefined &&
          row.score < sub.full_score * 0.4;
        return {
          name: sub.name,
          fullScore: sub.full_score,
          scoreText,
          rankText,
          isLow,
        };
      });

    // 该生总分：只累加「正常」且有分的科目
    let total = 0;
    let hasNormal = false;
    for (const r of scoreRows) {
      if (r.status === '正常' && r.score !== null) {
        total += r.score;
        hasNormal = true;
      }
    }
    const totalScore = hasNormal ? Math.round(total * 100) / 100 : null;

    // 班排：与全年级同口径（竞赛式，并列同名次）
    const totals = this.reportsRepository.listTotals(exam.id);
    let totalRank: number | null = null;
    if (totalScore !== null) {
      const sorted = [...totals].sort((a, b) =>
        b.total !== a.total ? b.total - a.total : a.student_id - b.student_id,
      );
      const idx = sorted.findIndex((t) => t.student_id === student.id);
      if (idx >= 0) {
        let end = idx;
        while (end < sorted.length && sorted[end]!.total === sorted[idx]!.total) {
          end += 1;
        }
        totalRank = idx + 1;
        void end;
      }
    }

    const termId = this.reportsRepository.findExamTermId(exam.id);
    const comment =
      this.reportsRepository.findLatestComment(student.id, termId) ?? null;

    return {
      student,
      exam,
      subjects,
      totalScore,
      totalRank,
      classSize: totals.length,
      comment,
    };
  }

  /** 把一张成绩单渲染为 PDF Buffer */
  renderCard(card: ReportCard): Promise<Buffer> {
    const fontPath = this.resolveFont();
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc.font(fontPath);

      // 抬头
      doc.fontSize(20).text('学 生 成 绩 单', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666666')
        .text('ClassPilot 班主任班级管理系统', { align: 'center' });
      doc.moveDown(1.2);

      // 基本信息
      doc.fontSize(11).fillColor('#000000');
      doc.text(`姓名：${card.student.name}`);
      doc.text(`学号：${card.student.student_no}`);
      doc.text(`考试：${card.exam.name}`);
      doc.text(`日期：${card.exam.exam_date ?? '—'}`);
      if (card.exam.term_name) {
        doc.text(`学期：${card.exam.term_name}`);
      }
      doc.moveDown(1);

      // 成绩表
      const tableTop = doc.y;
      const rowH = 22;
      const colWidths = [140, 80, 90, 120];
      const startX = doc.page.margins.left;
      let x = startX;

      const header = ['科目', '满分', '得分', '班级排名'];
      doc.fontSize(11);
      header.forEach((h, i) => {
        doc.rect(x, tableTop, colWidths[i]!, rowH).stroke('#cccccc');
        doc.text(h, x + 6, tableTop + 6, { width: colWidths[i]! - 12, align: 'center' });
        x += colWidths[i]!;
      });

      let y = tableTop + rowH;
      for (const s of card.subjects) {
        x = startX;
        const cells = [
          s.name,
          String(s.fullScore),
          s.scoreText,
          s.rankText,
        ];
        cells.forEach((text, i) => {
          doc.rect(x, y, colWidths[i]!, rowH).stroke('#cccccc');
          if (s.isLow && i === 2) {
            doc.fillColor('#DC2626');
          } else {
            doc.fillColor('#000000');
          }
          doc.text(text, x + 6, y + 6, { width: colWidths[i]! - 12, align: 'center' });
          x += colWidths[i]!;
        });
        y += rowH;
      }

      doc.moveDown(0.8);
      doc.fillColor('#000000').fontSize(12);
      doc.text(
        `总分：${card.totalScore === null ? '—' : card.totalScore}`,
      );
      doc.text(
        `班级排名：${card.totalRank === null ? '—' : `第 ${card.totalRank} 名 / ${card.classSize} 人`}`,
      );

      // 评语
      if (card.comment?.final_text) {
        doc.moveDown(1);
        doc.fontSize(12).text(
          `评${'语'}`,
        );
        doc.moveDown(0.3);
        doc.fontSize(11).text(card.comment.final_text, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          lineGap: 4,
        });
      }

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#999999')
        .text(`生成时间：${nowIso().replace('T', ' ').slice(0, 19)} UTC`, {
          align: 'center',
        });

      doc.end();
    });
  }

  /** 单个学生 PDF（文件名含学号姓名） */
  async buildSingle(studentId: number): Promise<{ filename: string; buffer: Buffer }> {
    const exam = this.reportsRepository.findLatestScoredExam();
    if (!exam) {
      throw new AppException(ErrorCodes.STATE_INVALID, '尚无已录入成绩的考试，无法生成成绩单', 400);
    }
    const student = this.reportsRepository
      .listActiveStudents()
      .find((s) => s.id === studentId);
    if (!student) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在或已离读', 404);
    }
    const card = this.buildCard(student, exam);
    const buffer = await this.renderCard(card);
    return { filename: this.safeName(card), buffer };
  }

  /** 文件名：学号_姓名.pdf */
  private safeName(card: ReportCard): string {
    const base = `${card.student.student_no}_${card.student.name}`.replace(
      /[\\/:*?"<>|]/g,
      '_',
    );
    return `${base}_成绩单.pdf`;
  }

  /** 批量生成全部学生 PDF 并打包 zip */
  async buildBundle(): Promise<ReportBundleResult> {
    const exam = this.reportsRepository.findLatestScoredExam();
    if (!exam) {
      throw new AppException(ErrorCodes.STATE_INVALID, '尚无已录入成绩的考试，无法生成成绩单', 400);
    }
    const students = this.reportsRepository.listActiveStudents();
    if (students.length === 0) {
      throw new AppException(ErrorCodes.STATE_INVALID, '没有在读学生', 400);
    }
    this.resolveFont();

    // 逐个渲染（串行，避免一次性占用过多内存）
    const entries: Array<{ name: string; buffer: Buffer }> = [];
    for (const student of students) {
      const card = this.buildCard(student, exam);
      const buffer = await this.renderCard(card);
      entries.push({ name: this.safeName(card), buffer });
    }

    const buffer = await this.zip(entries);
    const stamp = nowIso().slice(0, 10);
    this.auditLogsRepository.insert({
      action: 'report_pdf_bundle',
      detail: JSON.stringify({ examId: exam.id, count: entries.length }),
    });
    this.logger.log(`报告包生成：考试=${exam.id}，份数=${entries.length}`);
    return {
      filename: `成绩单_${exam.name}_${stamp}.zip`,
      mimeType: 'application/zip',
      buffer,
      count: entries.length,
    };
  }

  /** 把多份 PDF 打成 zip */
  private zip(entries: Array<{ name: string; buffer: Buffer }>): Promise<Buffer> {
    // 动态 import：archiver 仅在真正打包时载入
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const archiver = require('archiver') as typeof import('archiver');
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('error', (err: Error) => reject(err));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      for (const e of entries) {
        archive.append(e.buffer, { name: e.name });
      }
      archive.finalize();
    });
  }

  /** 仅测试用：重置字体缓存 */
  resetFontCache(): void {
    this.resolvedFont = undefined;
  }
}
