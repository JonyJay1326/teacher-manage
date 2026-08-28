import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { AiRepository } from '../ai/ai.repository';
import { CommentContextService } from '../ai/comment-context.service';
import { CommentGenerateService } from '../ai/comment-generate.service';
import type {
  AdoptCommentDto,
  CreateCommentDto,
  GenerateCommentDto,
} from './comments.dto';
import { CommentsRepository } from './comments.repository';

/** 工作台学生状态 */
export type WorkbenchStatus = 'none' | 'generated' | 'failed' | 'adopted';

/** 工作台学生项 */
export interface WorkbenchStudentItem {
  studentId: number;
  studentNo: string;
  name: string;
  focusLevel: number;
  status: WorkbenchStatus;
  aiRecordId: number | null;
  draftText: string | null;
  commentId: number | null;
  finalText: string | null;
}

/** 评语视图 */
export interface CommentView {
  id: number;
  studentId: number;
  termId: number | null;
  commentType: string | null;
  finalText: string;
  sourceAiRecordId: number | null;
  createdAt: string | null;
}

/** 评语业务服务 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly commentsRepository: CommentsRepository,
    private readonly commentGenerateService: CommentGenerateService,
    private readonly commentContextService: CommentContextService,
    private readonly aiRepository: AiRepository,
  ) {}

  /** 工作台列表 */
  getWorkbench(termId: number, commentType: string): {
    termId: number;
    termName: string | null;
    commentType: string;
    items: WorkbenchStudentItem[];
    summary: { total: number; none: number; generated: number; failed: number; adopted: number };
  } {
    if (!this.commentsRepository.termExists(termId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学期不存在', 404);
    }
    const students = this.commentsRepository.listActiveStudents();
    const items: WorkbenchStudentItem[] = students.map((s) => {
      const adopted = this.commentsRepository.findAdopted(
        s.id,
        termId,
        commentType,
      );
      if (adopted) {
        return {
          studentId: s.id,
          studentNo: s.student_no,
          name: s.name,
          focusLevel: s.focus_level,
          status: 'adopted' as const,
          aiRecordId: adopted.source_ai_record_id,
          draftText: null,
          commentId: adopted.id,
          finalText: adopted.final_text,
        };
      }
      const ai = this.commentsRepository.findLatestAiRecord(s.id);
      if (ai) {
        const failed = ai.status === 'failed';
        return {
          studentId: s.id,
          studentNo: s.student_no,
          name: s.name,
          focusLevel: s.focus_level,
          status: failed ? ('failed' as const) : ('generated' as const),
          aiRecordId: ai.id,
          draftText: failed ? null : ai.output_text,
          commentId: null,
          finalText: null,
        };
      }
      return {
        studentId: s.id,
        studentNo: s.student_no,
        name: s.name,
        focusLevel: s.focus_level,
        status: 'none' as const,
        aiRecordId: null,
        draftText: null,
        commentId: null,
        finalText: null,
      };
    });

    const summary = {
      total: items.length,
      none: items.filter((i) => i.status === 'none').length,
      generated: items.filter((i) => i.status === 'generated').length,
      failed: items.filter((i) => i.status === 'failed').length,
      adopted: items.filter((i) => i.status === 'adopted').length,
    };

    return {
      termId,
      termName: this.commentsRepository.getTermName(termId),
      commentType,
      items,
      summary,
    };
  }

  /** 预览上下文 */
  previewContext(studentId: number, termId?: number | null) {
    if (!this.commentsRepository.studentExists(studentId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    const bundle = this.commentContextService.build(studentId, termId ?? null);
    return {
      contextText: bundle.text,
      sections: bundle.sections,
      approxTokens: bundle.approxTokens,
    };
  }

  /** 生成草稿 */
  async generate(dto: GenerateCommentDto) {
    if (!this.commentsRepository.studentExists(dto.studentId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    if (dto.termId !== undefined && !this.commentsRepository.termExists(dto.termId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学期不存在', 404);
    }
    return this.commentGenerateService.generate({
      studentId: dto.studentId,
      termId: dto.termId ?? null,
      commentType: dto.commentType,
      tone: dto.tone,
      length: dto.length,
      includeAdvice: dto.includeAdvice,
      promptId: dto.promptId ?? null,
    });
  }

  /** 采纳写入 comments */
  adopt(dto: AdoptCommentDto): CommentView {
    if (!this.commentsRepository.studentExists(dto.studentId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    if (dto.termId !== undefined && !this.commentsRepository.termExists(dto.termId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学期不存在', 404);
    }

    if (dto.aiRecordId) {
      const record = this.aiRepository.findById(dto.aiRecordId);
      if (!record) {
        throw new AppException(ErrorCodes.NOT_FOUND, 'AI 记录不存在', 404);
      }
      if (record.student_id !== dto.studentId) {
        throw new AppException(ErrorCodes.VALIDATION, 'AI 记录与学生不匹配');
      }
      this.aiRepository.updateStatus(dto.aiRecordId, 'adopted');
    }

    const id = this.commentsRepository.insert({
      studentId: dto.studentId,
      termId: dto.termId ?? null,
      commentType: dto.commentType,
      finalText: dto.finalText.trim(),
      sourceAiRecordId: dto.aiRecordId ?? null,
    });
    const row = this.commentsRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.SYSTEM, '评语写入失败', 500);
    }
    return this.toView(row);
  }

  /** 手工新建 */
  createManual(dto: CreateCommentDto): CommentView {
    if (!this.commentsRepository.studentExists(dto.studentId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    if (dto.termId !== undefined && !this.commentsRepository.termExists(dto.termId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学期不存在', 404);
    }
    const id = this.commentsRepository.insert({
      studentId: dto.studentId,
      termId: dto.termId ?? null,
      commentType: dto.commentType,
      finalText: dto.finalText.trim(),
      sourceAiRecordId: null,
    });
    const row = this.commentsRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.SYSTEM, '评语写入失败', 500);
    }
    return this.toView(row);
  }

  /** 某生评语列表 */
  listByStudent(studentId: number): CommentView[] {
    if (!this.commentsRepository.studentExists(studentId)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }
    return this.commentsRepository.listByStudent(studentId).map((r) => this.toView(r));
  }

  /** 软删除 */
  remove(id: number): { ok: boolean } {
    const row = this.commentsRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '评语不存在', 404);
    }
    this.commentsRepository.softDelete(id);
    return { ok: true };
  }

  /** 行转视图 */
  private toView(row: {
    id: number;
    student_id: number;
    term_id: number | null;
    comment_type: string | null;
    final_text: string;
    source_ai_record_id: number | null;
    created_at: string | null;
  }): CommentView {
    return {
      id: row.id,
      studentId: row.student_id,
      termId: row.term_id,
      commentType: row.comment_type,
      finalText: row.final_text,
      sourceAiRecordId: row.source_ai_record_id,
      createdAt: row.created_at,
    };
  }
}
