import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Chat 请求体 */
interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  response_format?: { type: 'json_object' };
}

/** Chat 响应体 */
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** 调用结果 */
export interface DeepSeekCallResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

/** DeepSeek 封装（超时 60s，退避重试 2 次） */
@Injectable()
export class DeepSeekService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    this.baseUrl = this.configService.get<string>(
      'DEEPSEEK_BASE_URL',
      'https://api.deepseek.com',
    );
    this.model = this.configService.get<string>('DEEPSEEK_MODEL', 'deepseek-chat');
    this.timeoutMs = Number(this.configService.get('DEEPSEEK_TIMEOUT_MS', 60000));
  }

  /** 是否已配置 */
  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  /** 纯文本对话（评语生成） */
  async chatText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<DeepSeekCallResult> {
    return this.chat(systemPrompt, userPrompt, {
      temperature: 0.7,
      jsonMode: false,
    });
  }

  /** JSON 结构化对话（成绩表列映射等） */
  async chatJson(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<DeepSeekCallResult> {
    return this.chat(systemPrompt, userPrompt, {
      temperature: 0.1,
      jsonMode: true,
    });
  }

  /** 通用对话（含重试） */
  private async chat(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature: number; jsonMode: boolean },
  ): Promise<DeepSeekCallResult> {
    if (!this.isConfigured()) {
      throw new Error('DEEPSEEK_NOT_CONFIGURED');
    }
    const body: ChatCompletionRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    const delays = [1000, 4000];
    let lastError: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        return await this.requestOnce(body);
      } catch (err: unknown) {
        lastError = err;
        if (attempt >= delays.length) break;
        await this.sleep(delays[attempt]);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('DeepSeek 调用失败');
  }

  /** 单次请求 */
  private async requestOnce(
    body: ChatCompletionRequest,
  ): Promise<DeepSeekCallResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }
      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('DeepSeek 返回空内容');
      }
      return {
        content,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        model: this.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** 延迟 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
