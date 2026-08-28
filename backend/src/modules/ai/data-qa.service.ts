import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { AiRepository } from './ai.repository';
import {
  DataQaContextService,
  type DataQaCitation,
} from './data-qa-context.service';
import { DeepSeekService } from './deepseek.service';
import { PromptsRepository } from './prompts.repository';

/** 学情问答入参 */
export interface DataAskInput {
  question: string;
  studentId?: number | null;
}

/** 学情问答结果 */
export interface DataAskResult {
  available: boolean;
  message?: string;
  answer: string;
  citations: DataQaCitation[];
  aiRecordId: number | null;
  contextText: string;
  scopeLabel: string;
  studentId: number | null;
}

const DEFAULT_SYSTEM = [
  '你是班主任学情助手。硬性约束：',
  '1. 仅依据给定「系统数据」回答；每个关键数字或结论后用括号标注出处，格式如（数据：考试名 · 指标）。',
  '2. 数据未覆盖时明确回答「系统数据中未找到相关记录」，禁止编造分数、名次、人次。',
  '3. 不得输出或猜测 L2 高敏内容（疾病诊断、家暴、家庭变故细节等）；若被问及，引导至学生详情「高敏」Tab（需 PIN），不展开具体内容。',
  '4. 涉及学生具体处置时附加：建议结合本校规定与学生实际情况判断。',
  '5. 可用 Markdown 粗体（**文字**）与 - 列表增强可读性；不要使用一级大标题或代码块。',
  '6. 可对成绩台账自行做连续进步、进退、低分等统计，但必须与台账数字一致。',
  '7. 直接输出回答正文。',
].join('\n');

/** 学情问答服务 */
@Injectable()
export class DataQaService {
  constructor(
    private readonly dataQaContextService: DataQaContextService,
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
    private readonly promptsRepository: PromptsRepository,
  ) {}

  /** 提问 */
  async ask(input: DataAskInput): Promise<DataAskResult> {
    const question = input.question.trim();
    if (!question) {
      throw new AppException(ErrorCodes.VALIDATION, '请输入问题');
    }

    const bundle = this.dataQaContextService.build(
      question,
      input.studentId ?? null,
    );

    const promptRow = this.promptsRepository.findDefault('data_qa');
    let systemPrompt = DEFAULT_SYSTEM;
    if (promptRow?.template) {
      systemPrompt = promptRow.template
        .replace(/\{\{scope\}\}/g, bundle.scopeLabel)
        .replace(/\{\{context\}\}/g, bundle.text);
      if (!systemPrompt.includes(bundle.text)) {
        systemPrompt = `${systemPrompt}\n\n【系统数据】\n${bundle.text}`;
      }
    }

    const userPrompt = `范围：${bundle.scopeLabel}\n问题：${question}\n\n【系统数据】\n${bundle.text}`;
    const promptId = promptRow?.id ?? null;

    const finalSystem = systemPrompt.includes('【系统数据】')
      ? systemPrompt
      : `${systemPrompt}\n\n【系统数据】\n${bundle.text}`;

    if (!this.deepSeekService.isConfigured()) {
      const answer = this.buildFallbackAnswer(bundle.citations, bundle.text);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'data_qa',
        promptId,
        studentId: bundle.studentId,
        contextSnapshot: userPrompt,
        outputText: answer,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'generated',
      });
      return {
        available: false,
        message: 'AI 暂不可用，已返回数据摘要（可核对引用）',
        answer,
        citations: bundle.citations,
        aiRecordId,
        contextText: bundle.text,
        scopeLabel: bundle.scopeLabel,
        studentId: bundle.studentId,
      };
    }

    try {
      const result = await this.deepSeekService.chatText(
        finalSystem,
        `问题：${question}`,
      );
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'data_qa',
        promptId,
        studentId: bundle.studentId,
        contextSnapshot: userPrompt,
        outputText: result.content,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        status: 'generated',
      });
      return {
        available: true,
        answer: result.content,
        citations: bundle.citations,
        aiRecordId,
        contextText: bundle.text,
        scopeLabel: bundle.scopeLabel,
        studentId: bundle.studentId,
      };
    } catch {
      const answer = this.buildFallbackAnswer(bundle.citations, bundle.text);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'data_qa',
        promptId,
        studentId: bundle.studentId,
        contextSnapshot: userPrompt,
        outputText: answer,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'failed',
      });
      return {
        available: false,
        message: 'AI 调用失败，已返回数据摘要',
        answer,
        citations: bundle.citations,
        aiRecordId,
        contextText: bundle.text,
        scopeLabel: bundle.scopeLabel,
        studentId: bundle.studentId,
      };
    }
  }

  /** 无 AI 时的规则摘要 */
  private buildFallbackAnswer(
    citations: DataQaCitation[],
    contextText: string,
  ): string {
    if (citations.length === 0 && !contextText.trim()) {
      return '系统数据中未找到相关记录';
    }
    const lines = citations.slice(0, 8).map((c, i) => {
      const detail =
        c.detail.length > 120 ? `${c.detail.slice(0, 120)}…` : c.detail;
      return `${i + 1}. ${c.label}：${detail}`;
    });
    const body =
      lines.join('\n') || contextText.slice(0, 800);
    return `（AI 暂不可用，以下为系统数据摘要）\n${body}\n\n建议结合本校规定与学生实际情况判断。`;
  }
}
