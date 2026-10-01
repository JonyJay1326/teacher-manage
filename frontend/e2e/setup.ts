import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E 前置：重建专用 mock 库 + 创建专用账号。
 * 只操作 backend/data/e2e.db，绝不触碰开发库或生产库。
 */

const API_PORT = Number(process.env.E2E_API_PORT ?? 3210);
const BACKEND_DIR = path.resolve(__dirname, '../../backend');
const DB_PATH = './data/e2e.db';

export const E2E_USER = {
  username: 'e2e',
  password: 'e2e123456',
};

/** 在 backend 目录执行命令，注入 E2E 环境变量 */
function runInBackend(cmd: string, args: string[]): void {
  execFileSync(cmd, args, {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    env: {
      ...process.env,
      DB_PATH,
      BACKUP_DIR: './data/e2e-backups',
      JWT_SECRET: 'e2e-only-secret-not-real',
      AES_KEY_HEX:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    encoding: 'utf8',
  });
}

/** 确保 e2e 库存在且已灌入 mock 数据与账号（幂等） */
export function ensureE2eDatabase(): void {
  // 注意：Playwright 的 webServer 会先启动后端并创建空库，
  // 因此这里必须无条件重灌，不能只看文件是否存在。
  const dbFile = path.join(BACKEND_DIR, 'data', 'e2e.db');
  const exists = fs.existsSync(dbFile);
  console.log(`[e2e] ${exists ? '重置' : '创建'} e2e 库并灌入 mock 数据…`);
  // 直接跑 backend 已装好的 ts-node CLI，避免 npx 在 CI/子进程下的 EINVAL
  const tsNodeCli = path.join(BACKEND_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');
  runInBackend(process.execPath, [tsNodeCli, 'src/cli/seed-mock.ts', '--reset']);

  // 账号幂等创建：已存在会报冲突，忽略即可
  try {
    // 同理用 process.execPath，避免依赖 PATH 里存在 node
    runInBackend(process.execPath, [
      'dist/cli/create-user.js',
      E2E_USER.username,
      E2E_USER.password,
      'E2E 老师',
    ]);
    console.log('[e2e] 已创建 e2e 账号');
  } catch {
    console.log('[e2e] e2e 账号已存在，跳过');
  }
}

/** API 基址 */
export const API_BASE = `http://localhost:${API_PORT}/api`;
