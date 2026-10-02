import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, from, timer } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import { AiRepository } from './ai.repository';
import { DeepSeekService } from './deepseek.service';

/** 健康检查视图 */
export interface AiHealthView {
  configured: boolean;
  available: boolean;
  month: {
    tokensIn: number;
    tokensOut: number;
    callCount: number;
    failCount: number;
  };
}

/** 流式事件（与 comment-generate 的 CommentStreamEvent 保持同构） */
interface StreamEventLike {
  type: 'meta' | 'delta' | 'done';
  [k: string]: unknown;
}

/** 把长文本切成 n 字一块的 delta 事件 */
function chunkText(text: string, size: number): Array<{ type: 'delta'; text: string }> {
  const out: Array<{ type: 'delta'; text: string }> = [];
  for (let i = 0; i < text.length; i += size) {
    out.push({ type: 'delta', text: text.slice(i, i + size) });
  }
  return out;
}

/** AI 业务服务 */
@Injectable()
export class AiService {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
  ) {}



  /**
   * mock 流式生成（演示 / 前端联调专用）。
   *
   * 不调用 DeepSeek、不写业务表，只按固定节奏把文本吐出来，
   * 事件结构与真实流式一致（meta → delta* → done），
   * 让前端打字机与「续写」逻辑可以完整演示与联调。
   */
  mockStreamGenerate(input: {
    studentId: number;
    commentType: string;
    continueFrom?: string;
    name?: string;
  }): Observable<MessageEvent> {
    const prefix = input.continueFrom?.trim() ?? '';
    const name = input.name ?? '该生';
    const head = prefix
      ? ''
      : `${name}本学期在课堂上专注听讲，作业按时完成，`;
    const body =
      '学习态度端正，课间能与同学友好相处，遇到不懂的问题会主动请教老师。' +
      '本次考试各科成绩较为稳定，其中数学和英语进步较明显，说明近期努力见效。' +
      '希望在接下来的学习中继续保持这份专注，同时在体育与美育方面多参与，';
    const tail = '争取在期末考试中再上一个台阶。';

    const full = prefix + head + body + tail;
    // 续写时只吐未生成的部分
    const remain = full.slice(prefix.length);

    const events: StreamEventLike[] = [
      {
        type: 'meta',
        available: false,
        aiRecordId: null,
        contextText: '（演示模式：上下文由前端 Mock 组装）',
        contextSections: {
          profile: `姓名：${name}`,
          scores: '（演示模式无真实成绩）',
          incidents: '（演示模式无真实事件）',
          lastComment: '无历史评语',
          impression: '暂无印象记录',
        },
        approxTokens: 292,
        promptId: null,
        mock: true,
      },
      ...chunkText(remain, 4),
      { type: 'done', text: full },
    ];

    return from(events).pipe(
      // 每 22ms 推一块，模拟打字机节奏；由 Nest 的 @Sse 负责包装成 message
      concatMap((e) => timer(e.type === 'delta' ? 22 : 0).pipe(map(() => e))),
    );
  }

  /** 健康检查 */
  getHealth(): AiHealthView {
    const configured = this.deepSeekService.isConfigured();
    return {
      configured,
      available: configured,
      month: this.aiRepository.getMonthStats(),
    };
  }

  /**
   * DeepSeek 纯转发（供演示模式：上下文由前端 Mock 组装）。
   * 不查学生、不写 comments/ai_records 等业务表，避免污染正式数据。
   */
  async demoComplete(input: {
    systemPrompt: string;
    userPrompt: string;
    scene?: string;
  }): Promise<{
    available: boolean;
    message?: string;
    content: string;
    tokensIn: number;
    tokensOut: number;
    model: string | null;
    scene: string | null;
  }> {
    const scene = input.scene?.trim() || null;
    if (!this.deepSeekService.isConfigured()) {
      return {
        available: false,
        message: 'DeepSeek 未配置，请检查服务器 DEEPSEEK_API_KEY',
        content: '',
        tokensIn: 0,
        tokensOut: 0,
        model: null,
        scene,
      };
    }
    try {
      const result = await this.deepSeekService.chatText(
        input.systemPrompt,
        input.userPrompt,
      );
      return {
        available: true,
        content: result.content.trim(),
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: result.model,
        scene,
      };
    } catch {
      return {
        available: false,
        message: 'DeepSeek 调用失败，请稍后重试',
        content: '',
        tokensIn: 0,
        tokensOut: 0,
        model: null,
        scene,
      };
    }
  }
}
