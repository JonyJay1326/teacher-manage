import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { AiRepository } from './ai.repository';
import { CommentContextService } from './comment-context.service';
import { DeepSeekService } from './deepseek.service';
import { PromptsRepository } from './prompts.repository';

/** 评语生成入参 */
export interface GenerateCommentInput {
  studentId: number;
  termId?: number | null;
  commentType: string;
  tone?: '亲切' | '朴实' | '严肃';
  length?: '短' | '中' | '长';
  includeAdvice?: boolean;
  promptId?: number | null;
}

/** 评语生成结果 */
export interface GenerateCommentResult {
  available: boolean;
  message?: string;
  aiRecordId: number | null;
  draftText: string;
  contextText: string;
  contextSections: {
    profile: string;
    scores: string;
    incidents: string;
    lastComment: string;
    impression: string;
  };
  approxTokens: number;
  promptId: number | null;
}

/** 评语 AI 生成服务 */
@Injectable()
export class CommentGenerateService {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
    private readonly commentContextService: CommentContextService,
    private readonly promptsRepository: PromptsRepository,
  ) {}

  /** 生成单生评语草稿 */
  async generate(input: GenerateCommentInput): Promise<GenerateCommentResult> {
    const promptRow =
      (input.promptId
        ? this.promptsRepository.findById(input.promptId)
        : undefined)
      ?? this.promptsRepository.findDefault('comment');

    let tone = input.tone ?? '朴实';
    let length = input.length ?? '中';
    let includeAdvice = input.includeAdvice !== false;
    if (promptRow?.style_params) {
      try {
        const style = JSON.parse(promptRow.style_params) as {
          tone?: '亲切' | '朴实' | '严肃';
          length?: '短' | '中' | '长';
          includeAdvice?: boolean;
        };
        if (!input.tone && style.tone) tone = style.tone;
        if (!input.length && style.length) length = style.length;
        if (input.includeAdvice === undefined && style.includeAdvice !== undefined) {
          includeAdvice = style.includeAdvice;
        }
      } catch {
        // 忽略坏 JSON
      }
    }

    const context = this.commentContextService.build(
      input.studentId,
      input.termId ?? null,
    );
    const lengthLabel =
      length === '短' ? '80-120字' : length === '长' ? '220-320字' : '150-220字';
    const nameMatch = /姓名：(.+)/.exec(context.sections.profile);
    const studentName = nameMatch?.[1]?.trim() || '该生';
    const termMatch = /学期：(.+)/.exec(context.sections.profile);
    const termName = termMatch?.[1]?.trim() || '';

    const vars: Record<string, string> = {
      student_name: studentName,
      term: termName,
      style_tone: tone,
      style_length: lengthLabel,
      style_advice: includeAdvice ? '是' : '否',
      score_trend: context.sections.scores,
      incident_summary: context.sections.incidents,
      praise_summary: this.extractPraise(context.sections.incidents),
      last_comment: context.sections.lastComment,
      impression: context.sections.impression,
    };

    let systemPrompt: string;
    if (promptRow) {
      systemPrompt = this.fillTemplate(promptRow.template, vars);
    } else {
      systemPrompt = `你是一位初中班主任，请根据给定材料撰写学生${input.commentType}。
要求：
1. 语气：${tone}；篇幅：${lengthLabel}
2. ${includeAdvice ? '结尾可含 1-2 条具体改进建议' : '不要写改进建议'}
3. 只依据材料，禁止编造未出现的事实；不要提及任何敏感隐私细节
4. 直接输出评语正文，不要标题、不要 markdown`;
    }

    const userPrompt = `${context.text}\n\n请撰写${input.commentType}：`;
    const promptId = promptRow?.id ?? null;

    if (!this.deepSeekService.isConfigured()) {
      const draft = this.buildFallbackDraft(context.sections.profile, input.commentType);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'comment',
        promptId,
        studentId: input.studentId,
        contextSnapshot: context.text,
        outputText: draft,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'generated',
      });
      return {
        available: false,
        message: 'AI 未配置，已生成占位草稿，请手工改写后采纳',
        aiRecordId,
        draftText: draft,
        contextText: context.text,
        contextSections: context.sections,
        approxTokens: context.approxTokens,
        promptId,
      };
    }

    try {
      const call = await this.deepSeekService.chatText(systemPrompt, userPrompt);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'comment',
        promptId,
        studentId: input.studentId,
        contextSnapshot: context.text,
        outputText: call.content,
        model: call.model,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
        status: 'generated',
      });
      return {
        available: true,
        aiRecordId,
        draftText: call.content,
        contextText: context.text,
        contextSections: context.sections,
        approxTokens: context.approxTokens,
        promptId,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI 调用失败';
      this.aiRepository.insertRecord({
        scene: 'comment',
        promptId,
        studentId: input.studentId,
        contextSnapshot: context.text,
        outputText: message,
        model: 'deepseek-chat',
        tokensIn: 0,
        tokensOut: 0,
        status: 'failed',
      });
      throw new AppException(
        ErrorCodes.SYSTEM,
        'AI 暂不可用，请稍后重试或手工撰写',
        503,
      );
    }
  }

  /** 填充 {{占位符}} */
  private fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      return vars[key] ?? '';
    });
  }

  /** 从事件摘要抽表扬段 */
  private extractPraise(incidents: string): string {
    const lines = incidents.split('\n');
    const praiseLines = lines.filter(
      (l) => l.includes('表扬') || l.startsWith('- '),
    );
    if (incidents.includes('表扬类')) {
      const idx = lines.findIndex((l) => l.includes('表扬类'));
      return lines.slice(idx, idx + 12).join('\n');
    }
    return praiseLines.slice(0, 8).join('\n') || '无';
  }

  /** 无 AI 时的占位草稿 */
  private buildFallbackDraft(profile: string, commentType: string): string {
    const nameMatch = /姓名：(.+)/.exec(profile);
    const name = nameMatch?.[1]?.trim() || '该生';
    return `${name}本学期总体表现稳定，学习态度端正，能遵守班级纪律。请结合成绩与具体事例补充后作为${commentType}使用。`;
  }
}
