import { httpPostLive } from '@/api/http';

/** DeepSeek 代理结果（不写正式业务库） */
export interface DemoCompleteResult {
  available: boolean;
  message?: string;
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string | null;
  scene: string | null;
}

/** 调用后端 DeepSeek 纯转发（需已登录正式账号，Cookie 有效） */
export function demoCompleteApi(body: {
  systemPrompt: string;
  userPrompt: string;
  scene?: string;
}): Promise<DemoCompleteResult> {
  return httpPostLive('/v1/ai/demo-complete', body);
}
