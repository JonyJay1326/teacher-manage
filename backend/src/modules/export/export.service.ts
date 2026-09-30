import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';
import { nowIso } from '../../common/api';
import { ExportRepository } from './export.repository';

/** 导出摘要 */
export interface ExportResult {
  filename: string;
  mimeType: string;
  base64: string;
  counts: {
    students: number;
    scoreRows: number;
    incidents: number;
    comments: number;
  };
}

/** 学生 sheet 表头 */
const STUDENT_HEADERS = [
  '学号',
  '姓名',
  '性别',
  '出生日期',
  '状态',
  '走读/住校',
  '班干部',
  '关注等级',
  '家庭住址',
  '现居',
  '民族',
  '入学日期',
  '主要监护人',
  '监护人电话',
  '与学生关系',
  '标签',
  '班主任印象',
  '备注',
];

/** 成绩 sheet 表头 */
const SCORE_HEADERS = [
  '考试',
  '考试日期',
  '学期',
  '学号',
  '姓名',
  '科目',
  '满分',
  '分数',
  '状态',
  '单科班排',
  '总分',
  '总分班排',
];

/** 事件 sheet 表头 */
const INCIDENT_HEADERS = [
  '发生时间',
  '类别',
  '严重度',
  '标题',
  '内容',
  '状态',
  '涉及学生',
  '需跟进',
  '跟进完成时间',
  '跟进结果',
];

/** 评语 sheet 表头 */
const COMMENT_HEADERS = [
  '学号',
  '姓名',
  '学期',
  '评语类型',
  '评语正文',
  '写入时间',
  '来源',
];

/** 性别值转文案 */
function genderLabel(g: number | null): string {
  if (g === 1) return '男';
  if (g === 0) return '女';
  return '';
}

/** 事件状态值转文案 */
function incidentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿',
    confirmed: '已确认',
  };
  return map[status] ?? status;
}

/** ISO 时间转本地可读（保留到分钟） */
function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 全量 Excel 导出（学生 / 成绩 / 事件 / 评语 各一个 sheet） */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly exportRepository: ExportRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  /** 构建全量导出 xlsx（base64） */
  buildFullExport(): ExportResult {
    const students = this.exportRepository.listStudents();
    const scores = this.exportRepository.listScores();
    const incidents = this.exportRepository.listIncidents();
    const comments = this.exportRepository.listComments();

    const book = XLSX.utils.book_new();

    const studentSheet = XLSX.utils.aoa_to_sheet([
      STUDENT_HEADERS,
      ...students.map((r) => [
        r.student_no,
        r.name,
        genderLabel(r.gender),
        r.birth_date ?? '',
        r.status ?? '',
        r.board_type ?? '',
        r.cadre_role ?? '',
        r.focus_level,
        r.address ?? '',
        r.residence ?? '',
        r.ethnicity ?? '',
        r.enrolled_at ?? '',
        r.guardian_name ?? '',
        r.guardian_phone ?? '',
        r.guardian_relation ?? '',
        r.tags ?? '',
        r.impression ?? '',
        r.remark ?? '',
      ]),
    ]);
    XLSX.utils.book_append_sheet(book, studentSheet, '学生');

    const scoreSheet = XLSX.utils.aoa_to_sheet([
      SCORE_HEADERS,
      ...scores.map((r) => [
        r.exam_name ?? '',
        r.exam_date ?? '',
        r.term_name ?? '',
        r.student_no,
        r.name,
        r.subject_name ?? '',
        r.full_score,
        r.score ?? '',
        r.status ?? '',
        r.class_rank ?? '',
        r.total_score ?? '',
        r.total_rank ?? '',
      ]),
    ]);
    XLSX.utils.book_append_sheet(book, scoreSheet, '成绩');

    const incidentSheet = XLSX.utils.aoa_to_sheet([
      INCIDENT_HEADERS,
      ...incidents.map((r) => [
        fmtTime(r.occurred_at),
        r.category ?? '',
        r.severity,
        r.title ?? '',
        r.content ?? '',
        incidentStatusLabel(r.status ?? ''),
        r.student_names ?? '',
        r.follow_up_needed === 1 ? '是' : '',
        fmtTime(r.follow_up_done_at),
        r.follow_up_result ?? '',
      ]),
    ]);
    XLSX.utils.book_append_sheet(book, incidentSheet, '事件');

    const commentSheet = XLSX.utils.aoa_to_sheet([
      COMMENT_HEADERS,
      ...comments.map((r) => [
        r.student_no,
        r.name,
        r.term_name ?? '',
        r.comment_type ?? '',
        r.final_text,
        fmtTime(r.created_at),
        r.source,
      ]),
    ]);
    XLSX.utils.book_append_sheet(book, commentSheet, '评语');

    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const stamp = nowIso().slice(0, 19).replace(/[:T]/g, '-');
    const counts = {
      students: students.length,
      scoreRows: scores.length,
      incidents: incidents.length,
      comments: comments.length,
    };
    this.auditLogsRepository.insert({
      action: 'data_export_excel',
      detail: JSON.stringify(counts),
    });
    this.logger.log(`Full excel export: ${JSON.stringify(counts)}`);
    return {
      filename: `ClassPilot_全量导出_${stamp}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: buffer.toString('base64'),
      counts,
    };
  }
}
