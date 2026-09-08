import { Injectable } from '@nestjs/common';
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

/** AI 业务服务 */
@Injectable()
export class AiService {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
  ) {}

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
