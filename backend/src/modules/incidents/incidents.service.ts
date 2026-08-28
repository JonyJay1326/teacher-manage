import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes, nowIso } from '../../common/api';
import {
  ConfirmIncidentDto,
  CreateDraftDto,
  ListIncidentsQueryDto,
  UpdateIncidentDto,
} from './incidents.dto';
import {
  IncidentsRepository,
  type IncidentRow,
} from './incidents.repository';

/** 对外返回的事件视图 */
export interface IncidentView {
  id: number;
  occurredAt: string;
  category: string;
  severity: number;
  title: string | null;
  content: string | null;
  draftContent: string | null;
  aiSuggestion: string | null;
  status: string;
  followUpNeeded: boolean;
  followUpDeadline: string | null;
  followUpDone: boolean;
  followUpDoneAt: string | null;
  studentIds: number[];
  studentNames: string[];
  createdAt: string;
  updatedAt: string | null;
}

/** 事件业务服务 */
@Injectable()
export class IncidentsService {
  constructor(private readonly incidentsRepository: IncidentsRepository) {}

  /** 分页列表（含 studentNames 与草稿数） */
  list(query: ListIncidentsQueryDto): {
    items: IncidentView[];
    total: number;
    draftCount: number;
  } {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { rows, total } = this.incidentsRepository.findPage(
      {
        status: query.status,
        category: query.category,
        q: query.q,
      },
      page,
      pageSize,
    );
    const items = this.attachStudents(rows);
    return {
      items,
      total,
      draftCount: this.draftCount().count,
    };
  }

  /** 草稿数量助手 */
  draftCount(): { count: number } {
    return { count: this.incidentsRepository.countDrafts() };
  }

  /** 事件详情 */
  getById(id: number): IncidentView {
    const row = this.requireIncident(id);
    const views = this.attachStudents([row]);
    const view = views[0];
    if (!view) {
      throw new AppException(ErrorCodes.SYSTEM, '事件视图组装失败', 500);
    }
    return view;
  }

  /** 创建速记草稿：标题取正文前 20 字 */
  createDraft(dto: CreateDraftDto): IncidentView {
    this.assertStudentsExist(dto.studentIds);
    const content = dto.content.trim();
    if (!content) {
      throw new AppException(ErrorCodes.VALIDATION, '速记内容不能为空');
    }
    const title = content.slice(0, 20);
    const category = dto.category ?? '其他';
    const occurredAt = dto.occurredAt?.trim() || nowIso();
    const id = this.incidentsRepository.createDraft({
      occurredAt,
      category,
      title,
      content,
      draftContent: content,
      studentIds: dto.studentIds,
    });
    return this.getById(id);
  }

  /** 人工确认：status 设为 confirmed，保留 draft_content */
  confirm(id: number, dto: ConfirmIncidentDto): IncidentView {
    const row = this.requireIncident(id);
    this.assertStudentsExist(dto.studentIds);
    const draftContent = row.draft_content ?? row.content;
    this.incidentsRepository.confirm(id, {
      title: dto.title.trim(),
      content: dto.content.trim(),
      category: dto.category,
      severity: dto.severity,
      draftContent,
      followUpNeeded: dto.followUpNeeded ?? false,
      followUpDeadline:
        dto.followUpDeadline === undefined ? null : dto.followUpDeadline,
      studentIds: dto.studentIds,
    });
    return this.getById(id);
  }

  /** 部分更新事件字段 */
  update(id: number, dto: UpdateIncidentDto): IncidentView {
    this.requireIncident(id);
    if (dto.studentIds !== undefined) {
      this.assertStudentsExist(dto.studentIds);
      this.incidentsRepository.replaceStudents(id, dto.studentIds);
    }

    let followUpDoneAt: string | null | undefined;
    if (dto.followUpDone === true) {
      followUpDoneAt = nowIso();
    } else if (dto.followUpDone === false) {
      followUpDoneAt = null;
    }

    this.incidentsRepository.update(id, {
      title: dto.title?.trim(),
      content: dto.content?.trim(),
      category: dto.category,
      severity: dto.severity,
      occurredAt: dto.occurredAt,
      followUpNeeded: dto.followUpNeeded,
      followUpDeadline:
        dto.followUpDeadline === undefined ? undefined : dto.followUpDeadline,
      followUpDoneAt,
    });
    return this.getById(id);
  }

  /** 软删除事件 */
  remove(id: number): { ok: boolean } {
    this.requireIncident(id);
    this.incidentsRepository.softDelete(id);
    return { ok: true };
  }

  /** 到期未完成跟进列表 */
  listDueFollowUps(limit = 5): IncidentView[] {
    const rows = this.incidentsRepository.findDueFollowUps(limit);
    return this.attachStudents(rows);
  }

  /** 最近草稿列表（首页待办） */
  listRecentDrafts(limit = 5): IncidentView[] {
    const rows = this.incidentsRepository.findRecentDrafts(limit);
    return this.attachStudents(rows);
  }

  /** 确保事件存在 */
  private requireIncident(id: number): IncidentRow {
    const row = this.incidentsRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '事件不存在', 404);
    }
    return row;
  }

  /** 校验学生 ID 均有效 */
  private assertStudentsExist(studentIds: number[]): void {
    if (studentIds.length === 0) return;
    const uniqueIds = [...new Set(studentIds)];
    const count = this.incidentsRepository.countActiveStudents(uniqueIds);
    if (count !== uniqueIds.length) {
      throw new AppException(ErrorCodes.VALIDATION, '存在无效或已删除的学生');
    }
  }

  /** 将行数据映射为视图并挂载学生信息 */
  private attachStudents(rows: IncidentRow[]): IncidentView[] {
    const ids = rows.map((r) => r.id);
    const links =
      this.incidentsRepository.findStudentNamesByIncidentIds(ids);
    const byIncident = new Map<
      number,
      { studentIds: number[]; studentNames: string[] }
    >();
    for (const link of links) {
      let bucket = byIncident.get(link.incident_id);
      if (!bucket) {
        bucket = { studentIds: [], studentNames: [] };
        byIncident.set(link.incident_id, bucket);
      }
      bucket.studentIds.push(link.student_id);
      bucket.studentNames.push(link.name);
    }
    return rows.map((row) => {
      const students = byIncident.get(row.id) ?? {
        studentIds: [],
        studentNames: [],
      };
      return this.toView(row, students.studentIds, students.studentNames);
    });
  }

  /** 数据库行转 camelCase 视图 */
  private toView(
    row: IncidentRow,
    studentIds: number[],
    studentNames: string[],
  ): IncidentView {
    return {
      id: row.id,
      occurredAt: row.occurred_at,
      category: row.category,
      severity: row.severity,
      title: row.title,
      content: row.content,
      draftContent: row.draft_content,
      aiSuggestion: row.ai_suggestion,
      status: row.status,
      followUpNeeded: row.follow_up_needed === 1,
      followUpDeadline: row.follow_up_deadline,
      followUpDone: row.follow_up_done_at != null,
      followUpDoneAt: row.follow_up_done_at,
      studentIds,
      studentNames,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
