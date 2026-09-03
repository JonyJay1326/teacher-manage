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

/** 解析后的导入行（含可选性别与联系方式） */
interface ParsedImportRow {
  studentNo?: string;
  name: string;
  gender: number | null;
  contact1?: string;
  contact2?: string;
}

/** 导入预览行 */
export interface ImportPreviewRowDto {
  studentNo?: string;
  name: string;
  gender: number | null;
  contact1?: string;
  contact2?: string;
  action: 'create' | 'skip' | 'update';
  matchedId?: number;
  message?: string;
}

/** 导入确认结果 */
export interface ImportConfirmResultDto {
  created: number;
  skipped: number;
  updated: number;
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
      sortBy: query.sortBy ?? 'studentNo',
      sortOrder: query.sortOrder ?? 'asc',
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

  /**
   * 新建普通标签（默认域「其他」、L0）。
   * 同名未删标签直接返回；同域软删则恢复。
   */
  createTag(input: {
    name: string;
    domain?: string;
    color?: string;
  }): TagDto {
    const name = input.name.trim();
    if (!name) {
      throw new AppException(ErrorCodes.VALIDATION, '标签名不能为空', 400);
    }
    const domain = input.domain?.trim() || '其他';
    const allowedDomains = ['学业', '行为情绪', '健康', '家庭', '特长', '其他'];
    if (!allowedDomains.includes(domain)) {
      throw new AppException(ErrorCodes.VALIDATION, '标签域不合法', 400);
    }

    const activeSameName = this.studentsRepository.findActiveTagByName(name);
    if (activeSameName) {
      return this.mapTag(activeSameName);
    }

    const existing = this.studentsRepository.findTagByDomainAndName(
      domain,
      name,
    );
    if (existing) {
      if (existing.deleted_at) {
        this.studentsRepository.restoreTag(existing.id);
        const restored = this.studentsRepository.findTagById(existing.id);
        if (!restored) {
          throw new AppException(ErrorCodes.SYSTEM, '标签恢复失败', 500);
        }
        return this.mapTag(restored);
      }
      return this.mapTag(existing);
    }

    const id = this.studentsRepository.insertTag({
      domain,
      name,
      color: input.color?.trim() || null,
      sensitiveLevel: 0,
      isBuiltin: 0,
    });
    const row = this.studentsRepository.findTagById(id);
    if (!row) {
      throw new AppException(ErrorCodes.SYSTEM, '标签创建失败', 500);
    }
    return this.mapTag(row);
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

  /** 确认执行导入（新建或更新已存在学生） */
  importConfirm(dto: ImportConfirmDto): ImportConfirmResultDto {
    let created = 0;
    let skipped = 0;
    let updated = 0;
    const toCreate: Array<{
      student: StudentInsertInput;
      guardians: Array<{ name: string; phone: string; isPrimary: number }>;
    }> = [];
    const usedNos = new Set<string>();

    for (const row of dto.rows) {
      if (row.action === 'skip') {
        skipped += 1;
        continue;
      }

      const name = row.name.trim();
      if (!name) {
        throw new AppException(ErrorCodes.VALIDATION, '导入行姓名不能为空', 400);
      }

      const gender =
        row.gender === 0 || row.gender === 1 ? row.gender : null;
      const contact1 = row.contact1?.trim() || '';
      const contact2 = row.contact2?.trim() || '';

      if (row.action === 'update') {
        const target = this.resolveImportUpdateTarget(row);
        const patch: {
          name: string;
          gender?: number;
          studentNo?: string;
        } = { name };
        if (gender !== null) {
          patch.gender = gender;
        }
        const nextNo = row.studentNo?.trim() || '';
        if (
          nextNo &&
          nextNo !== target.student_no &&
          this.canReassignStudentNo(nextNo, target.id, usedNos)
        ) {
          patch.studentNo = nextNo;
          usedNos.add(nextNo);
        } else if (nextNo) {
          usedNos.add(nextNo);
        }
        this.studentsRepository.updateStudent(target.id, patch);
        this.upsertImportGuardians(target.id, contact1, contact2);
        updated += 1;
        continue;
      }

      // create
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
        student: {
          studentNo,
          name,
          gender,
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
        },
        guardians: this.buildImportGuardians(contact1, contact2),
      });
      created += 1;
    }

    const createdIds =
      toCreate.length > 0
        ? this.studentsRepository.insertStudentsWithGuardiansBatch(toCreate)
        : [];

    return { created, skipped, updated, createdIds };
  }

  /** 解析更新目标学生 */
  private resolveImportUpdateTarget(row: {
    matchedId?: number;
    studentNo?: string;
    name: string;
  }): StudentRow {
    if (row.matchedId) {
      const byId = this.studentsRepository.findById(row.matchedId);
      if (byId) return byId;
    }
    const studentNo = row.studentNo?.trim();
    if (studentNo) {
      const byNo = this.studentsRepository.findByStudentNo(studentNo);
      if (byNo) return byNo;
    }
    const byName = this.studentsRepository.findByName(row.name.trim());
    if (byName.length === 1) return byName[0];
    throw new AppException(
      ErrorCodes.VALIDATION,
      `无法定位待更新学生：${row.name}`,
      400,
    );
  }

  /** 导入时是否允许改写学号（不与他人冲突） */
  private canReassignStudentNo(
    studentNo: string,
    currentId: number,
    usedNos: Set<string>,
  ): boolean {
    if (usedNos.has(studentNo)) return false;
    const existing = this.studentsRepository.findByStudentNo(studentNo);
    return !existing || existing.id === currentId;
  }

  /** 由联系方式生成监护人写入列表 */
  private buildImportGuardians(
    contact1: string,
    contact2: string,
  ): Array<{ name: string; phone: string; isPrimary: number }> {
    const guardians: Array<{ name: string; phone: string; isPrimary: number }> =
      [];
    if (contact1) {
      guardians.push({ name: '监护人1', phone: contact1, isPrimary: 1 });
    }
    if (contact2) {
      guardians.push({
        name: '监护人2',
        phone: contact2,
        isPrimary: contact1 ? 0 : 1,
      });
    }
    return guardians;
  }

  /** 按名称 upsert 导入监护人（有联系方式才写） */
  private upsertImportGuardians(
    studentId: number,
    contact1: string,
    contact2: string,
  ): void {
    if (!contact1 && !contact2) return;
    const existing = this.studentsRepository.listGuardiansByStudentId(studentId);
    const upsertOne = (
      label: string,
      phone: string,
      isPrimary: number,
    ): void => {
      const found = existing.find((g) => g.name === label);
      if (found) {
        this.studentsRepository.updateGuardian(found.id, {
          phone,
          isPrimary,
        });
      } else {
        this.studentsRepository.insertGuardian({
          studentId,
          relation: null,
          name: label,
          phone,
          wechat: null,
          job: null,
          contactPref: null,
          bestTime: null,
          isPrimary,
          remark: null,
        });
      }
    };
    if (contact1) {
      upsertOne('监护人1', contact1, 1);
    }
    if (contact2) {
      upsertOne('监护人2', contact2, contact1 ? 0 : 1);
    }
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

  /** 拆分一行粘贴文本为单元格 */
  private splitImportCells(line: string): string[] {
    const normalized = line.replace(/^\uFEFF/, '').trim();
    if (normalized.includes('\t')) {
      return normalized.split('\t').map((p) => p.replace(/\uFEFF/g, '').trim());
    }
    if (normalized.includes(',') || normalized.includes('，')) {
      return normalized.split(/[,，]/).map((p) => p.trim());
    }
    // Excel 偶发用多空格对齐列
    if (/\s{2,}/.test(normalized)) {
      return normalized.split(/\s{2,}/).map((p) => p.trim());
    }
    return [normalized];
  }

  /** 判断是否像学号（含数字，或字母数字-_ 组合，且不是性别） */
  private looksLikeStudentNo(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (this.parseGenderCell(v) !== null) return false;
    if (/\d/.test(v)) return true;
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(v);
  }

  /** 解析性别文案为 1=男 / 0=女；无法识别则 null */
  private parseGenderCell(raw: string | undefined): number | null {
    if (!raw) return null;
    const value = raw.trim();
    if (!value) return null;
    if (['男', '1', 'M', 'm', 'male', 'Male'].includes(value)) return 1;
    if (['女', '0', 'F', 'f', 'female', 'Female'].includes(value)) return 0;
    return null;
  }

  /** 是否为表头行（学号/姓名等） */
  private isImportHeaderRow(parts: string[]): boolean {
    const cells = parts.map((p) => p.trim());
    return (
      cells.includes('姓名') ||
      cells.includes('学号') ||
      cells.includes('性别') ||
      cells.some((c) => c.startsWith('联系方式'))
    );
  }

  /**
   * 解析粘贴文本。
   * 默认列序：学号 | 姓名 | 性别 | 联系方式1 | 联系方式2；
   * 兼容仅姓名、学号+姓名；无学号时若第 2 列为性别则按姓名开头解析。
   */
  private parseImportText(text: string): ParsedImportRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const result: ParsedImportRow[] = [];
    for (const line of lines) {
      const parts = this.splitImportCells(line);
      if (parts.length === 0 || !parts.some((p) => p)) continue;
      if (this.isImportHeaderRow(parts)) continue;

      let studentNo: string | undefined;
      let name: string;
      let genderRaw: string | undefined;
      let contact1: string | undefined;
      let contact2: string | undefined;

      if (parts.length === 1) {
        name = parts[0];
      } else if (parts.length === 2) {
        // 姓名|性别 或 学号|姓名
        if (
          this.parseGenderCell(parts[1]) !== null &&
          !this.looksLikeStudentNo(parts[0])
        ) {
          name = parts[0];
          genderRaw = parts[1];
        } else {
          studentNo = parts[0] || undefined;
          name = parts[1] || parts[0];
        }
      } else if (
        this.parseGenderCell(parts[1]) !== null &&
        !this.looksLikeStudentNo(parts[0])
      ) {
        // 姓名 | 性别 | 联系1 | 联系2
        name = parts[0] || '';
        genderRaw = parts[1];
        contact1 = parts[2] || undefined;
        contact2 = parts[3] || undefined;
      } else {
        // 默认：学号 | 姓名 | 性别 | 联系1 | 联系2
        studentNo = parts[0] || undefined;
        name = parts[1] || '';
        genderRaw = parts[2];
        contact1 = parts[3] || undefined;
        contact2 = parts[4] || undefined;
      }

      if (!name) continue;
      const contact1Trim = contact1?.trim() || undefined;
      const contact2Trim = contact2?.trim() || undefined;
      result.push({
        studentNo: studentNo?.trim() || undefined,
        name: name.trim(),
        gender: this.parseGenderCell(genderRaw),
        contact1: contact1Trim || undefined,
        contact2: contact2Trim || undefined,
      });
    }
    return result;
  }

  /** 根据库内匹配情况建议导入动作（已存在则编辑） */
  private suggestImportAction(item: ParsedImportRow): ImportPreviewRowDto {
    const base = {
      studentNo: item.studentNo,
      name: item.name,
      gender: item.gender,
      contact1: item.contact1,
      contact2: item.contact2,
    };

    const guardianHint =
      [item.contact1 ? '监护人1' : null, item.contact2 ? '监护人2' : null]
        .filter(Boolean)
        .join('、') || null;
    const updateSuffix = guardianHint ? `，更新${guardianHint}` : '';

    if (item.studentNo) {
      const byNo = this.studentsRepository.findByStudentNo(item.studentNo);
      if (byNo) {
        return {
          ...base,
          action: 'update',
          matchedId: byNo.id,
          message: `学号已存在，将更新「${byNo.name}」${updateSuffix}`,
        };
      }
    }

    const byName = this.studentsRepository.findByName(item.name);
    if (byName.length === 1) {
      return {
        ...base,
        action: 'update',
        matchedId: byName[0].id,
        message: `姓名已存在（学号 ${byName[0].student_no}），将更新${updateSuffix}`,
      };
    }
    if (byName.length > 1) {
      return {
        ...base,
        action: 'skip',
        message: `姓名存在 ${byName.length} 条同名记录，请手动处理`,
      };
    }

    return {
      ...base,
      action: 'create',
      message: guardianHint ? `将新建（含${guardianHint}）` : '将新建',
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
