import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AiRepository } from './ai.repository';
import { CommentContextService } from './comment-context.service';
import { DeepSeekService } from './deepseek.service';
import { PromptsRepository } from './prompts.repository';

/** 沟通话术入参 */
export interface TalkScriptInput {
  scene: string;
  studentId?: number | null;
  includeContext?: boolean;
  promptId?: number | null;
}

/** 沟通话术结果 */
export interface TalkScriptResult {
  available: boolean;
  message?: string;
  aiRecordId: number | null;
  draftText: string;
  contextText: string;
  promptId: number | null;
}

/** 沟通话术生成 */
@Injectable()
export class TalkScriptService {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
    private readonly commentContextService: CommentContextService,
    private readonly promptsRepository: PromptsRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  /** 生成沟通策略草稿 */
  async generate(input: TalkScriptInput): Promise<TalkScriptResult> {
    const scene = input.scene.trim();
    const promptRow =
      (input.promptId
        ? this.promptsRepository.findById(input.promptId)
        : undefined)
      ?? this.promptsRepository.findDefault('talk_script');

    const includeContext = input.includeContext !== false;
    let contextText = '（未关联学生资料）';
    if (includeContext && input.studentId) {
      const bundle = this.commentContextService.build(input.studentId, null);
      contextText = [
        bundle.sections.profile,
        '',
        '【近期事件】',
        bundle.sections.incidents,
        '',
        '【班主任印象】',
        bundle.sections.impression,
      ].join('\n');
    } else if (input.studentId) {
      const name = this.findStudentName(input.studentId);
      contextText = name ? `关联学生：${name}（未注入详细档案）` : '（学生不存在）';
    }

    const vars: Record<string, string> = {
      scene,
      context: contextText,
      student_name: input.studentId
        ? (this.findStudentName(input.studentId) ?? '')
        : '',
    };
    const systemPrompt = promptRow
      ? this.fillTemplate(promptRow.template, vars)
      : `你是班主任沟通顾问。场景：${scene}\n资料：${contextText}\n请输出沟通策略草稿。`;
    const userPrompt = `请针对以下场景撰写沟通话术：\n${scene}`;
    const promptId = promptRow?.id ?? null;

    if (!this.deepSeekService.isConfigured()) {
      const draft = this.buildFallback(scene);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'talk_script',
        promptId,
        studentId: input.studentId ?? null,
        contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
        outputText: draft,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'generated',
      });
      return {
        available: false,
        message: 'AI 未配置，已生成占位草稿，请手工改写',
        aiRecordId,
        draftText: draft,
        contextText,
        promptId,
      };
    }

    try {
      const result = await this.deepSeekService.chatText(systemPrompt, userPrompt);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'talk_script',
        promptId,
        studentId: input.studentId ?? null,
        contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
        outputText: result.content,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        status: 'generated',
      });
      return {
        available: true,
        aiRecordId,
        draftText: result.content,
        contextText,
        promptId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成失败';
      const draft = this.buildFallback(scene);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'talk_script',
        promptId,
        studentId: input.studentId ?? null,
        contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
        outputText: draft,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'failed',
      });
      return {
        available: false,
        message: `AI 调用失败（${msg}），已降级为占位草稿`,
        aiRecordId,
        draftText: draft,
        contextText,
        promptId,
      };
    }
  }

  /** 查学生姓名 */
  private findStudentName(studentId: number): string | null {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT name FROM students WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as { name: string } | undefined;
    return row?.name ?? null;
  }

  /** 填充模板占位符 */
  private fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? '');
  }

  /** 无 AI 时的占位草稿 */
  private buildFallback(scene: string): string {
    return `【开场】先感谢对方抽时间沟通，说明来意。\n【共情】理解家长/学生的情绪与关切。\n【事实】围绕场景核对：${scene.slice(0, 80)}\n【方案】提出可执行的下一步（约谈、座位调整、跟进时间）。\n【收尾】约定回访时间，保持联系渠道畅通。\n\n（AI 未可用，请手工改写）`;
  }
}
