import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes, nowIso } from '../../common/api';
import {
  CreateGuardianDto,
  CreateStudentDto,
  ImportConfirmDto,
  ListStudentsQueryDto,
  UpdateGuardianDto,
  UpdateStudentDto,
} from './students.dto';
import {
  GuardianRow,
  StudentInsertInput,
  StudentRow,
  StudentsRepository,
  TagRow,
} from './students.repository';
import { SensitiveRepository } from './sensitive.repository';

/** 学生对外字段（camelCase） */
export interface StudentDto {
  id: number;
  studentNo: string;
  name: string;
  gender: number | null;
  birthDate: string | null;
  photoPath: string | null;
  ethnicity: string | null;
  address: string | null;
  residence: string | null;
  enrolledAt: string | null;
  status: string;
  boardType: string | null;
  cadreRole: string | null;
  focusLevel: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string | null;
  tagIds: number[];
  /** 是否存在未删除的 L2 高敏明细（列表行高亮用，不含内容） */
  hasSensitive: boolean;
}

/** 学生详情（含监护人） */
export interface StudentDetailDto extends StudentDto {
  guardians: GuardianDto[];
}

/** 班主任印象视图 */
export interface StudentImpressionDto {
  studentId: number;
  content: string;
  updatedAt: string | null;
}

/** 标签对外字段 */
export interface TagDto {
  id: number;
  domain: string;
  name: string;
  color: string | null;
  sensitiveLevel: number;
  isBuiltin: boolean;
}

/** 监护人对外字段 */
export interface GuardianDto {
  id: number;
  studentId: number;
  relation: string | null;
  name: string | null;
  phone: string | null;
  wechat: string | null;
  job: string | null;
  contactPref: string | null;
  bestTime: string | null;
  isPrimary: boolean;
  remark: string | null;
}

/** 导入预览行 */
export interface ImportPreviewRowDto {
  studentNo?: string;
  name: string;
  action: 'create' | 'skip' | 'match';
  matchedId?: number;
  message?: string;
}

/** 导入确认结果 */
export interface ImportConfirmResultDto {
  created: number;
  skipped: number;
  matched: number;
  createdIds: number[];
}

/** 学生业务服务 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly sensitiveRepository: SensitiveRepository,
  ) {}

  /** 分页列表 */
  list(query: ListStudentsQueryDto): { items: StudentDto[]; total: number } {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { rows, total } = this.studentsRepository.listStudents({
      q: query.q,
      status: query.status,
      focusLevel: query.focusLevel,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const ids = rows.map((r) => r.id);
    const tagMap = this.studentsRepository.listTagIdsByStudentIds(ids);
    const sensitiveIds = new Set(
      this.sensitiveRepository.findStudentIdsHavingSensitive(ids),
    );
    const items = rows.map((row) =>
      this.mapStudent(row, tagMap.get(row.id) ?? [], sensitiveIds.has(row.id)),
    );
    return { items, total };
  }

  /** 学生详情（含标签与监护人） */
  getDetail(id: number): StudentDetailDto {
    const row = this.requireStudent(id);
    const tagIds = this.studentsRepository.listTagIdsByStudentId(id);
    const guardians = this.studentsRepository
      .listGuardiansByStudentId(id)
      .map((g) => this.mapGuardian(g));
    const hasSensitive =
      this.sensitiveRepository.findStudentIdsHavingSensitive([id]).length > 0;
    return { ...this.mapStudent(row, tagIds, hasSensitive), guardians };
  }

  /** 新建学生 */
  create(dto: CreateStudentDto): StudentDetailDto {
    const existing = this.studentsRepository.findByStudentNo(dto.studentNo.trim());
    if (existing) {
      throw new AppException(ErrorCodes.CONFLICT, '学号已存在', 409);
    }
    const id = this.studentsRepository.insertStudent(this.toInsertInput(dto));
    return this.getDetail(id);
  }

  /** 更新学生 */
  update(id: number, dto: UpdateStudentDto): StudentDetailDto {
    this.requireStudent(id);
    if (dto.studentNo !== undefined) {
      const other = this.studentsRepository.findByStudentNo(dto.studentNo.trim());
      if (other && other.id !== id) {
        throw new AppException(ErrorCodes.CONFLICT, '学号已存在', 409);
      }
    }
    this.studentsRepository.updateStudent(id, {
      studentNo: dto.studentNo?.trim(),
      name: dto.name?.trim(),
      gender: dto.gender,
      birthDate: dto.birthDate,
      photoPath: dto.photoPath,
      ethnicity: dto.ethnicity,
      address: dto.address,
      residence: dto.residence,
      enrolledAt: dto.enrolledAt,
      status: dto.status,
      boardType: dto.boardType,
      cadreRole: dto.cadreRole,
      focusLevel: dto.focusLevel,
      remark: dto.remark,
    });
    return this.getDetail(id);
  }

  /** 软删除学生 */
  remove(id: number): { ok: boolean } {
    this.requireStudent(id);
    this.studentsRepository.softDeleteStudent(id);
    return { ok: true };
  }

  /** 读取班主任印象 */
  getImpression(studentId: number): StudentImpressionDto {
    this.requireStudent(studentId);
    const row = this.studentsRepository.findImpressionByStudentId(studentId);
    return {
      studentId,
      content: row?.content ?? '',
      updatedAt: row?.updated_at ?? null,
    };
  }

  /** 保存班主任印象 */
  saveImpression(studentId: number, content: string): StudentImpressionDto {
    this.requireStudent(studentId);
    const row = this.studentsRepository.upsertImpression(
      studentId,
      content.trim(),
    );
    return {
      studentId,
      content: row.content,
      updatedAt: row.updated_at,
    };
  }

  /** 替换学生标签 */
  replaceTags(id: number, tagIds: number[]): StudentDetailDto {
    this.requireStudent(id);
    const uniqueIds = [...new Set(tagIds)];
    if (uniqueIds.length > 0) {
      const count = this.studentsRepository.countActiveTagsByIds(uniqueIds);
      if (count !== uniqueIds.length) {
        throw new AppException(ErrorCodes.VALIDATION, '存在无效或已删除的标签', 400);
      }
    }
    this.studentsRepository.replaceStudentTags(id, uniqueIds);
    return this.getDetail(id);
  }

  /** 列出全部标签 */
  listTags(): TagDto[] {
    return this.studentsRepository.listAllTags().map((row) => this.mapTag(row));
  }

  /** 列出学生监护人 */
  listGuardians(studentId: number): GuardianDto[] {
    this.requireStudent(studentId);
    return this.studentsRepository
      .listGuardiansByStudentId(studentId)
      .map((g) => this.mapGuardian(g));
  }

  /** 新增监护人 */
  createGuardian(studentId: number, dto: CreateGuardianDto): GuardianDto {
    this.requireStudent(studentId);
    const guardianId = this.studentsRepository.insertGuardian({
      studentId,
      relation: dto.relation ?? null,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      wechat: dto.wechat ?? null,
      job: dto.job ?? null,
      contactPref: dto.contactPref ?? null,
      bestTime: dto.bestTime ?? null,
      isPrimary: dto.isPrimary ?? 0,
      remark: dto.remark ?? null,
    });
    const row = this.studentsRepository.findGuardianById(guardianId);
    if (!row) {
      throw new AppException(ErrorCodes.SYSTEM, '监护人创建失败', 500);
    }
    return this.mapGuardian(row);
  }

  /** 更新监护人 */
  updateGuardian(guardianId: number, dto: UpdateGuardianDto): GuardianDto {
    const existing = this.studentsRepository.findGuardianById(guardianId);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, '监护人不存在', 404);
    }
    this.studentsRepository.updateGuardian(guardianId, {
      relation: dto.relation,
      name: dto.name,
      phone: dto.phone,
      wechat: dto.wechat,
      job: dto.job,
      contactPref: dto.contactPref,
      bestTime: dto.bestTime,
      isPrimary: dto.isPrimary,
      remark: dto.remark,
    });
    const row = this.studentsRepository.findGuardianById(guardianId);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '监护人不存在', 404);
    }
    return this.mapGuardian(row);
  }

  /** 软删除监护人 */
  removeGuardian(guardianId: number): { ok: boolean } {
    const existing = this.studentsRepository.findGuardianById(guardianId);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, '监护人不存在', 404);
    }
    this.studentsRepository.softDeleteGuardian(guardianId);
    return { ok: true };
  }

  /** 解析粘贴文本并给出导入建议 */
  importPreview(text: string): { rows: ImportPreviewRowDto[] } {
    const parsed = this.parseImportText(text);
    const rows: ImportPreviewRowDto[] = parsed.map((item) => this.suggestImportAction(item));
    return { rows };
  }

  /** 确认执行导入 */
  importConfirm(dto: ImportConfirmDto): ImportConfirmResultDto {
    let created = 0;
    let skipped = 0;
    let matched = 0;
    const toCreate: StudentInsertInput[] = [];
    const usedNos = new Set<string>();

    for (const row of dto.rows) {
      if (row.action === 'skip') {
        skipped += 1;
        continue;
      }
      if (row.action === 'match') {
        matched += 1;
        continue;
      }
      const name = row.name.trim();
      if (!name) {
        throw new AppException(ErrorCodes.VALIDATION, '导入行姓名不能为空', 400);
      }
      let studentNo = row.studentNo?.trim() || '';
      if (studentNo) {
        if (this.studentsRepository.findByStudentNo(studentNo) || usedNos.has(studentNo)) {
          throw new AppException(
            ErrorCodes.CONFLICT,
            `学号已存在或重复：${studentNo}`,
            409,
          );
        }
      } else {
        studentNo = this.generateStudentNo(usedNos);
      }
      usedNos.add(studentNo);
      toCreate.push({
        studentNo,
        name,
        gender: null,
        birthDate: null,
        photoPath: null,
        ethnicity: null,
        address: null,
        residence: null,
        enrolledAt: null,
        status: '在读',
        boardType: '走读',
        cadreRole: null,
        focusLevel: 0,
        remark: null,
      });
      created += 1;
    }

    const createdIds =
      toCreate.length > 0 ? this.studentsRepository.insertStudentsBatch(toCreate) : [];

    return { created, skipped, matched, createdIds };
  }

  /** 确保学生存在并返回行 */
  private requireStudent(id: number): StudentRow {
    const row = this.studentsRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    return row;
  }

  /** 将创建 DTO 转为仓储写入结构 */
  private toInsertInput(dto: CreateStudentDto): StudentInsertInput {
    return {
      studentNo: dto.studentNo.trim(),
      name: dto.name.trim(),
      gender: dto.gender ?? null,
      birthDate: dto.birthDate ?? null,
      photoPath: dto.photoPath ?? null,
      ethnicity: dto.ethnicity ?? null,
      address: dto.address ?? null,
      residence: dto.residence ?? null,
      enrolledAt: dto.enrolledAt ?? null,
      status: dto.status ?? '在读',
      boardType: dto.boardType ?? '走读',
      cadreRole: dto.cadreRole ?? null,
      focusLevel: dto.focusLevel ?? 0,
      remark: dto.remark ?? null,
    };
  }

  /** 解析粘贴文本为姓名/学号行 */
  private parseImportText(text: string): Array<{ studentNo?: string; name: string }> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const result: Array<{ studentNo?: string; name: string }> = [];
    for (const line of lines) {
      let studentNo: string | undefined;
      let name: string;

      if (line.includes('\t')) {
        const parts = line.split('\t').map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          studentNo = parts[0];
          name = parts[1];
        } else if (parts[0]) {
          name = parts[0];
        } else {
          continue;
        }
      } else if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          studentNo = parts[0];
          name = parts[1];
        } else if (parts[0]) {
          name = parts[0];
        } else {
          continue;
        }
      } else {
        name = line;
      }

      if (!name) continue;
      result.push(studentNo ? { studentNo, name } : { name });
    }
    return result;
  }

  /** 根据库内匹配情况建议导入动作 */
  private suggestImportAction(item: {
    studentNo?: string;
    name: string;
  }): ImportPreviewRowDto {
    if (item.studentNo) {
      const byNo = this.studentsRepository.findByStudentNo(item.studentNo);
      if (byNo) {
        return {
          studentNo: item.studentNo,
          name: item.name,
          action: 'match',
          matchedId: byNo.id,
          message: `学号匹配：${byNo.name}`,
        };
      }
    }

    const byName = this.studentsRepository.findByName(item.name);
    if (byName.length === 1) {
      return {
        studentNo: item.studentNo,
        name: item.name,
        action: 'match',
        matchedId: byName[0].id,
        message: `姓名匹配学号 ${byName[0].student_no}`,
      };
    }
    if (byName.length > 1) {
      return {
        studentNo: item.studentNo,
        name: item.name,
        action: 'skip',
        message: `姓名存在 ${byName.length} 条同名记录，请手动处理`,
      };
    }

    return {
      studentNo: item.studentNo,
      name: item.name,
      action: 'create',
      message: '将新建',
    };
  }

  /** 生成不冲突的临时学号 */
  private generateStudentNo(usedNos: Set<string>): string {
    for (let i = 0; i < 20; i += 1) {
      const candidate = `A${Date.now().toString(36).toUpperCase()}${i}`;
      if (usedNos.has(candidate)) continue;
      if (this.studentsRepository.findByStudentNo(candidate)) continue;
      return candidate;
    }
    return `A${nowIso().replace(/[-:.TZ]/g, '')}`;
  }

  /** 学生行映射为 camelCase */
  private mapStudent(
    row: StudentRow,
    tagIds: number[],
    hasSensitive: boolean,
  ): StudentDto {
    return {
      id: row.id,
      studentNo: row.student_no,
      name: row.name,
      gender: row.gender,
      birthDate: row.birth_date,
      photoPath: row.photo_path,
      ethnicity: row.ethnicity,
      address: row.address,
      residence: row.residence,
      enrolledAt: row.enrolled_at,
      status: row.status,
      boardType: row.board_type,
      cadreRole: row.cadre_role,
      focusLevel: row.focus_level,
      remark: row.remark,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tagIds,
      hasSensitive,
    };
  }

  /** 标签行映射为 camelCase */
  private mapTag(row: TagRow): TagDto {
    return {
      id: row.id,
      domain: row.domain,
      name: row.name,
      color: row.color,
      sensitiveLevel: row.sensitive_level,
      isBuiltin: row.is_builtin === 1,
    };
  }

  /** 监护人行映射为 camelCase */
  private mapGuardian(row: GuardianRow): GuardianDto {
    return {
      id: row.id,
      studentId: row.student_id,
      relation: row.relation,
      name: row.name,
      phone: row.phone,
      wechat: row.wechat,
      job: row.job,
      contactPref: row.contact_pref,
      bestTime: row.best_time,
      isPrimary: row.is_primary === 1,
      remark: row.remark,
    };
  }
}
