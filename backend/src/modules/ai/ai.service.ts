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
}
