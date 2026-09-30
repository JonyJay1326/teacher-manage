import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Chat 请求体 */
interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  response_format?: { type: 'json_object' };
  stream?: boolean;
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

/** 流式单块解析结果 */
interface SseDelta {
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  done: boolean;
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

  /**
   * 流式对话：逐块 yield 增量文本。
   *
   * 与 chat() 不同：**不做内部重试**。流一旦开始就无法安全重放，
   * 失败直接抛给调用方降级。
   *
   * @param continueFrom 非空时表示「续写」，已产出文本作为前缀提示回传
   */
  async *chatStream(
    systemPrompt: string,
    userPrompt: string,
    continueFrom?: string,
  ): AsyncGenerator<string, DeepSeekCallResult | void, undefined> {
    if (!this.isConfigured()) {
      throw new Error('DEEPSEEK_NOT_CONFIGURED');
    }

    const messages: ChatCompletionRequest['messages'] = [
      { role: 'system', content: systemPrompt },
    ];
    const prefix = continueFrom?.trim() ?? '';
    if (prefix) {
      // 续写：把已产出内容作为 assistant 消息，要求模型从其末尾接着写
      messages.push({ role: 'assistant', content: prefix });
      messages.push({
        role: 'user',
        content: `请从上面那段文字的末尾紧接着继续往下写，不要重复已有内容，只输出续写的部分。`,
      });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    const body: ChatCompletionRequest = {
      model: this.model,
      messages,
      temperature: 0.7,
      stream: true,
    };

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
      if (!response.body) {
        throw new Error('DeepSeek 未返回流');
      }

      let tokensIn = 0;
      let tokensOut = 0;
      let full = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx = buffer.indexOf('\n\n');
        while (idx !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const delta = this.parseSseDelta(raw);
          if (delta) {
            if (delta.text) {
              full += delta.text;
              yield delta.text;
            }
            if (delta.usage) {
              tokensIn = delta.usage.prompt_tokens ?? tokensIn;
              tokensOut = delta.usage.completion_tokens ?? tokensOut;
            }
          }
          idx = buffer.indexOf('\n\n');
        }
      }

      return {
        content: full,
        tokensIn,
        tokensOut,
        model: this.model,
      } satisfies DeepSeekCallResult;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 解析一条 SSE 事件块（若干 data: 行） */
  private parseSseDelta(raw: string): SseDelta | null {
    let saw = false;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      saw = true;
      const payload = t.slice(5).trim();
      if (!payload) continue;
      if (payload === '[DONE]') {
        return { text: '', done: true };
      }
      try {
        const obj = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        return {
          text: obj.choices?.[0]?.delta?.content ?? '',
          usage: obj.usage,
          done: false,
        };
      } catch {
        // 心跳/注释等非 JSON 行，忽略
      }
    }
    return saw ? { text: '', done: false } : null;
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
