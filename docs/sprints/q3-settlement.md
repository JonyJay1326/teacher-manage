# Q3 测试从零到一 — 结算单

- 分支：`feature/q3-tests`（基线 `feature/quality-sprint` @ e697917）
- 状态：完成，**143 个用例全绿**（后端 95 + 前端 48）

## 零、两个前置决策（已按建议落地）

| 冲突 | 任务书 | AGENTS.md | 本单采用 |
|---|---|---|---|
| 后端 runner | jest | vitest | **vitest**（与 AGENTS.md 一致、与前端同 runner） |
| 测试边界 | 后端三个纯函数 | — | **后端三函数 + 前端两个 store**（超出 40 下限） |

若你要改回 jest，现在改动集中在 `backend/package.json` / `backend/vitest.config.ts`，成本低。

## 一、改动清单

| 文件 | 增/删 | 说明 |
|---|---:|---|
| `backend/src/modules/scores/scores.service.spec.ts` | +271 / -0 | 新建 19 例：竞赛排名 + 单科班排落库 + 总分总排 |
| `backend/src/modules/ai/comment-context.service.spec.ts` | +331 / -0 | 新建 34 例：五段拼装 / 成绩摘要 / 事件 / 评语印象 / token 截断 |
| `backend/src/modules/ai/score-import-mapping.service.spec.ts` | +235 / -0 | 新建 28 例：规则降级下的脏表头容错 |
| `backend/src/crypto/crypto.helper.spec.ts` | +107 / -0 | 新建 14 例：加解密往返 + 篡改检测 + 密钥校验 |
| `frontend/src/stores/__tests__/students.spec.ts` | +201 / -0 | 新建 21 例：标签字典 / selectableTags / 标签解析 / 列表 |
| `frontend/src/stores/__tests__/scores.spec.ts` | +297 / -0 | 新建 27 例：考试排序 / 矩阵缓存 / 总分班排 / 班均 |
| `backend/vitest.config.ts` | +8 / -0 | 新建：node 环境，include `src/**/*.spec.ts` |
| `frontend/tsconfig.test.json` | +10 / -0 | 新建：spec 用宽松的 noUnused，独立于构建 tsconfig |
| `frontend/vite.config.ts` | +6 / -0 | 加 `test` 段（jsdom + globals） |
| `backend/package.json` | +4 / -3 | 加 `test` / `test:watch` |
| `frontend/package.json` | +5 / -2 | 加 `test` / `test:watch` / `typecheck:test` |
| `backend/tsconfig.json` | +1 / -1 | exclude 加 `**/*.spec.ts`、`vitest.config.ts`（不污染 dist） |
| `frontend/src/stores/scores.ts` | +9 / -5 | **修 Q2 遗留回归**（见下） |

合计 **+1295 / -15**，另加两侧 `package-lock.json`。

## 二、验证证据

### 后端 95 例

```text
 ✓ src/crypto/crypto.helper.spec.ts (14 tests)
 ✓ src/modules/scores/scores.service.spec.ts (19 tests)
 ✓ src/modules/ai/score-import-mapping.service.spec.ts (28 tests)
 ✓ src/modules/ai/comment-context.service.spec.ts (34 tests)
 Test Files  4 passed (4)
      Tests  95 passed (95)
```

### 前端 48 例

```text
 ✓ src/stores/__tests__/students.spec.ts (21 tests)
 ✓ src/stores/__tests__/scores.spec.ts (27 tests)
 Test Files  2 passed (2)
      Tests  48 passed (48)
```

### 构建与类型

```text
backend : nest build              -> 0 error
frontend: vue-tsc -b && vite build -> ✓ built in 7.78s, 0 error
frontend: vue-tsc -p tsconfig.test.json --noEmit -> 0 error（spec 单独过 TS）
backend dist/ 中 *.spec.js         -> 0 个（构建不污染产物）
```

### UI 回归（因改了 `scores.ts`，重跑 Q2 的等价性检查）

重新起真实后端 + Vite，打开学生详情「成绩」tab：
```text
考试下拉: 期末考试（2026-01-10）
总分 580 / 班排 20 · 语文 80 · 数学 77.5 · 英语 82.5 · 道法 74 · 历史 67.5 · 地理 62 · 生物 72.5 · 体育 64
雷达图: 正常渲染（8 轴，该生 vs 班均）
控制台: 0 错误（仅登录前既有的 /auth/me 401）
```
数值与 Q2 基线截图完全一致。截图 `evidence/q3/scores-tab-after-q3fix.png`。

## 三、本单发现并修复的一个真实回归（重要）

写 `scores.spec.ts` 时有一条断言失败：`loadExams(true)` 刷新后
`selectedExamId` 被重置为最新一场。回查 Q2 拆分的原实现，发现
**原代码是有「保留用户所选考试」这个行为的**：

```ts
// 拆分前 StudentDetailView.loadScoreExams
const prefer = selectedExamId.value;
const keepCurrent = prefer !== null && exams.some((exam) => exam.id === prefer);
const nextId = keepCurrent ? prefer : exams[0].id;   // ← 保留用户选择
```

我 Q2 抽 store 时把它简化成了「一律取最新一场」，
**这是一个真实的行为回归**：用户在学生详情选了「期中考试」，
此时考试管理页新建了一场更新的考试，用户切回来会被打回最新一场。

已修复（`frontend/src/stores/scores.ts`）：只有「未选中」或「选中的已删除」
才回落，刷新时保留仍存在的当前选择。并补了一条断言锁定该行为。

> 这条回归能被发现，正是因为 Q3 写了测试。Q2 的像素对照抓不到它——
> 截图只覆盖「默认首屏」状态，不覆盖「选中后刷新」路径。

## 四、测试覆盖了什么、没覆盖什么

**覆盖**

- 竞赛式排名：并列、空位跳过、缺考/免考排除、同分按 id 稳定排序、负分、小数
- 单科班排落库：四种状态（正常有分 / 正常无分 / 缺考 / 免考）各自的写入值
- 评语上下文：五段结构、L2 标签排除、软删除过滤、成绩汇总与升降判断、token 截断链
- xlsx 映射容错：空格/换行/括号注释、单字别名、排除总分/平均/排名列、表头行定位、扫描上限
- 加密：往返、随机 IV、密文不含明文、长度、错误密钥/篡改密文/篡改 IV 均失败
- store：标签缓存去重、L0 过滤、按域分组、标签去重与新建、列表加载的成功/失败路径、
  考试排序、矩阵缓存、总分班排、班均（缺考不拉低）

**未覆盖（Q3 未做，留给 Q4 E2E 或后续）**

- Controller / Repository / 数据库迁移（需要真实 SQLite + HTTP）
- 高敏 PIN 解锁链路（需 auth 交互）
- 评语生成（需 mock DeepSeek）
- 备份/导出（已有 Q1 的 smoke 脚本覆盖，但那是 CLI 演练不是断言式单测）

## 五、风险与遗留

**新增依赖（4 个 devDependencies，均为测试专用，不进运行时）**

| 包 | 版本 | 用途 | 理由 |
|---|---|---|---|
| `vitest` | 2.1.8 | 两端 runner | AGENTS.md 指定；与前端同 runner |
| `@vue/test-utils` | 2.4.6 | 组件挂载测试 | 本单未实际用到（store 用例不需要），**可考虑移除** |
| `jsdom` | 25.0.1 | DOM 环境 | 前端用例需要 `localStorage` 等浏览器 API |

> `@vue/test-utils` 本单没有实际使用（Q2 拆出的组件我测的是 store 而非组件渲染）。
> 保留它是因为 Q4 的 E2E 失败留档、以及后续组件测试大概率要用。若你想精简依赖，可以删。

**行为变化**

1. 修复了 Q2 的考试选择丢失回归（见第三节）。**这是行为变化，但是恢复原行为**。
2. `backend/tsconfig.json` 的 exclude 新增了 spec 与 vitest 配置——只影响构建产物，
   不影响运行时。
3. `frontend/vite.config.ts` 新增 `test` 段——Vite 构建路径不受影响（已验证 build 通过）。

**其他**

- CI 尚未接入（任务书只要求「`npm test` 进 CI 习惯」，即 scripts 里补命令，已做）。
  `.github/workflows/deploy.yml` 目前只在 push main 时构建部署，**没有跑测试**。
  要真正卡住回归，需要加一个 CI 步骤跑 `npm test`。本单未做，因为改 CI 属于
  任务书「变更部署配置或 CI/CD」的范围，需要你确认。
- 工作区根的 `%SystemDrive%/`（搜狗输入法缓存）同前两单，仍未处理。

## 六、下一单预告（Q4 E2E 关键路径）

**需要的输入**

- Playwright 两条链路：
  1. 成绩 xlsx 导入 → 列表可见 → 分析页出图
  2. 评语生成（mock DeepSeek，走 demo 模式）
- 任务书要求「用根目录那份示例 xlsx 的结构造 mock」，根目录有
  `成绩导入示例_开学摸底考.xlsx`。

**需要的决策**

1. **新增 Playwright 依赖**：前端 devDependencies 加 `@playwright/test`
   （Q1 我临时装过 playwright 做截图，未写入 package.json）。
   需你确认。浏览器二进制本机已有缓存（`%LOCALAPPDATA%\\ms-playwright`），
   但 CI 环境需另配。
2. **E2E 跑在哪**：需要起真实后端（`data` 目录独立）+ Vite。
   要不要为此建独立的 mock 库与脚本？Q1 的 `cli:seed-mock` 可以复用。

**可能动的文件**

- 新建 `frontend/e2e/*.spec.ts`、`frontend/playwright.config.ts`
- `frontend/package.json`（加 `@playwright/test` 与 `test:e2e` 脚本）
- 根 `.gitignore`（忽略 `test-results/`、`playwright-report/`）

**需要注意**

- Q4 的 E2E 会真实拉起后端进程并写库。必须用独立 `DB_PATH`，
  **绝不能用生产库**——Q1 的 smoke 脚本踩过这个坑（`smoke-q1-export` 会往库里插数据）。
- 「评语生成」链路要 mock DeepSeek。demo 模式已有 `/v1/ai/demo-complete`
  代理端点，但它需要**已登录的正式账号 Cookie**，demo 态下这条链路的设计有点绕，
  建议实现前先确认走哪条路径。
