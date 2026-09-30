import { isDemoMode } from '@/demo/mode';

/** 流式评语生成 */

/** SSE 事件（与后端 CommentStreamEvent 对应） */
export type CommentStreamEvent =
  | {
      type: 'meta';
      available: boolean;
      aiRecordId: number | null;
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
      fallback?: boolean;
      mock?: boolean;
      error?: string;
    }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; interrupted?: boolean };

/** 流式回调 */
export interface StreamHandlers {
  /** 每收到一段增量文本 */
  onDelta: (chunk: string, accumulated: string) => void;
  /** 收到 meta（上下文等），只触发一次 */
  onMeta?: (meta: Extract<CommentStreamEvent, { type: 'meta' }>) => void;
  /** 流结束（interrupted=true 表示生成中断，可续写） */
  onDone?: (text: string, interrupted: boolean) => void;
  /** 出错 */
  onError?: (err: Error) => void;
}

/**
 * 发起 SSE 流式生成。
 *
 * 用原生 fetch + ReadableStream 逐块解析，**不引入 EventSource polyfill 依赖**。
 * EventSource 只支持 GET 且无法带 Cookie，故不适合本项目的鉴权场景。
 */
export async function streamComment(
  body: {
    studentId: number;
    termId?: number;
    commentType: string;
    tone?: string;
    length?: string;
    includeAdvice?: boolean;
    promptId?: number | null;
    continueFrom?: string;
  },
  handlers: StreamHandlers,
): Promise<void> {
  // demo 模式：业务请求会被 http 层拦截成内存 Mock，SSE 需显式走真实后端的 mock 端点
  const path = isDemoMode()
    ? '/v1/comments/mock-stream'
    : '/v1/comments/generate-stream';
  const payload = isDemoMode()
    ? {
        studentId: body.studentId,
        continueFrom: body.continueFrom,
      }
    : body;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    handlers.onError?.(err instanceof Error ? err : new Error('网络错误'));
    return;
  }

  if (!response.ok || !response.body) {
    let message = `流式生成失败（HTTP ${response.status}）`;
    try {
      const j = (await response.json()) as { message?: string };
      if (j?.message) message = j.message;
    } catch {
      // 非 JSON
    }
    handlers.onError?.(new Error(message));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = body.continueFrom ?? '';
  let interrupted = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = /^data:\s*(.*)$/m.exec(raw);
        if (line) {
          const payloadText = line[1];
          if (payloadText && payloadText !== '[DONE]') {
            try {
              const ev = JSON.parse(payloadText) as CommentStreamEvent;
              if (ev.type === 'meta') {
                handlers.onMeta?.(ev);
              } else if (ev.type === 'delta') {
                accumulated += ev.text;
                handlers.onDelta(ev.text, accumulated);
              } else if (ev.type === 'done') {
                interrupted = ev.interrupted === true;
                accumulated = ev.text || accumulated;
              }
            } catch {
              // 非法 JSON 行（心跳/注释），跳过
            }
          }
        }
        idx = buffer.indexOf('\n\n');
      }
    }
    handlers.onDone?.(accumulated, interrupted);
  } catch (err: unknown) {
    // 读取中断（如用户切页/网络断开）：保留已产出部分并标记可续写
    interrupted = true;
    handlers.onError?.(err instanceof Error ? err : new Error('流中断'));
    handlers.onDone?.(accumulated, interrupted);
  }
}
