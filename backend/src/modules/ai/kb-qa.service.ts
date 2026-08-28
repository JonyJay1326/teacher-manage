import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { KnowledgeRepository } from '../knowledge/knowledge.repository';
import type { RetrievedSegment } from '../knowledge/retrieval.strategy';
import { AiRepository } from './ai.repository';
import { DeepSeekService } from './deepseek.service';

/** 问答结果 */
export interface KbAskResult {
  available: boolean;
  message?: string;
  answer: string;
  sources: Array<{
    segmentId: number;
    documentId: number;
    documentTitle: string;
    seq: number;
    text: string;
  }>;
  aiRecordId: number | null;
  contextText: string;
}

const TOP_K = 8;
const CONTEXT_MAX_CHARS = 3000;

const SYSTEM_PROMPT = `你是班主任知识库助手。硬性约束：
1. 仅依据给定资料回答；每个论点后用括号标注来源文档名，如（来源：《xxx》）。
2. 资料未覆盖时明确回答「知识库中未找到相关内容」，禁止编造。
3. 涉及学生具体处置时，附加提醒：建议结合本校规定与学生实际情况判断。
4. 直接输出回答正文，不要输出无关开场白。`;

/** 知识库轻量 RAG（jieba+FTS → DeepSeek） */
@Injectable()
export class KbQaService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
  ) {}

  /** 提问 */
  async ask(question: string): Promise<KbAskResult> {
    const q = question.trim();
    if (!q) {
      throw new AppException(ErrorCodes.VALIDATION, '请输入问题');
    }

    const hits = this.knowledgeRepository.search(q, TOP_K);
    const { contextText, used } = this.buildContext(hits);

    if (used.length === 0) {
      const answer = '知识库中未找到相关内容';
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'kb_qa',
        contextSnapshot: `Q: ${q}\n\n(无命中段落)`,
        outputText: answer,
        model: 'none',
        tokensIn: 0,
        tokensOut: 0,
        status: 'generated',
      });
      return {
        available: true,
        answer,
        sources: [],
        aiRecordId,
        contextText: '',
      };
    }

    if (!this.deepSeekService.isConfigured()) {
      const answer = this.buildFallbackAnswer(used);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'kb_qa',
        contextSnapshot: `Q: ${q}\n\n${contextText}`,
        outputText: answer,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'generated',
      });
      return {
        available: false,
        message: 'AI 暂不可用，已返回检索到的原文摘要（可逐段核对）',
        answer,
        sources: used.map(this.toSource),
        aiRecordId,
        contextText,
      };
    }

    try {
      const userPrompt = `问题：${q}\n\n参考资料：\n${contextText}`;
      const result = await this.deepSeekService.chatText(
        SYSTEM_PROMPT,
        userPrompt,
      );
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'kb_qa',
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
        sources: used.map(this.toSource),
        aiRecordId,
        contextText,
      };
    } catch {
      const answer = this.buildFallbackAnswer(used);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'kb_qa',
        contextSnapshot: `Q: ${q}\n\n${contextText}`,
        outputText: answer,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'failed',
      });
      return {
        available: false,
        message: 'AI 调用失败，已返回检索到的原文摘要',
        answer,
        sources: used.map(this.toSource),
        aiRecordId,
        contextText,
      };
    }
  }

  /** 拼上下文：每段前缀 [文档标题 · 第N段]，总长 ≤ 3000 字 */
  private buildContext(hits: RetrievedSegment[]): {
    contextText: string;
    used: RetrievedSegment[];
  } {
    const used: RetrievedSegment[] = [];
    const parts: string[] = [];
    let len = 0;
    for (const hit of hits) {
      const header = `[${hit.documentTitle} · 第${hit.seq}段]`;
      const block = `${header}\n${hit.text}`;
      if (len + block.length + 2 > CONTEXT_MAX_CHARS && used.length > 0) {
        break;
      }
      parts.push(block);
      used.push(hit);
      len += block.length + 2;
    }
    return { contextText: parts.join('\n\n'), used };
  }

  /** DeepSeek 不可用时的降级摘要 */
  private buildFallbackAnswer(hits: RetrievedSegment[]): string {
    const lines = hits.slice(0, 3).map((h, i) => {
      const snippet = h.text.slice(0, 120).replace(/\s+/g, ' ');
      return `${i + 1}. 《${h.documentTitle}》第${h.seq}段：${snippet}${h.text.length > 120 ? '…' : ''}`;
    });
    return `（AI 暂不可用，以下为检索命中摘要）\n${lines.join('\n')}\n\n建议结合本校规定与学生实际情况判断。`;
  }

  /** 来源视图 */
  private toSource(hit: RetrievedSegment): {
    segmentId: number;
    documentId: number;
    documentTitle: string;
    seq: number;
    text: string;
  } {
    return {
      segmentId: hit.segmentId,
      documentId: hit.documentId,
      documentTitle: hit.documentTitle,
      seq: hit.seq,
      text: hit.text,
    };
  }
}
