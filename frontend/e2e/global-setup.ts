/**
 * Playwright 全局前置：在 webServer 拉起后端之前重建 e2e 库。
 * webServer 启动时会先创建空库，因此播种必须早于它。
 */
import { ensureE2eDatabase } from './setup';

export default function globalSetup(): void {
  ensureE2eDatabase();
}
