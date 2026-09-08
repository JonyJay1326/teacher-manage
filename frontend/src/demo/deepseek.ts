import { ApiError } from '@/api/http';
import { demoCompleteApi } from '@/api/demoAi';

/**
 * 演示态调用 DeepSeek：上下文由调用方从 Mock 组装。
 * 鉴权失败或未配置时返回 null，由上层降级本地文案。
 */
export async function runDemoDeepSeek(input: {
  systemPrompt: string;
  userPrompt: string;
  scene: string;
}): Promise<{
  available: boolean;
  content: string;
  message?: string;
  tokensIn: number;
  tokensOut: number;
  model: string | null;
} | null> {
  try {
    const res = await demoCompleteApi(input);
    if (!res.available || !res.content.trim()) {
      return {
        available: false,
        content: '',
        message: res.message ?? 'DeepSeek 暂不可用',
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        model: res.model,
      };
    }
    return {
      available: true,
      content: res.content.trim(),
      message: res.message,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      model: res.model,
    };
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 2002) {
      return {
        available: false,
        content: '',
        message:
          '调用 DeepSeek 需先登录正式账号（登录后保留 Cookie，再进入 /demo）',
        tokensIn: 0,
        tokensOut: 0,
        model: null,
      };
    }
    return {
      available: false,
      content: '',
      message: err instanceof ApiError ? err.message : 'DeepSeek 调用失败',
      tokensIn: 0,
      tokensOut: 0,
      model: null,
    };
  }
}
