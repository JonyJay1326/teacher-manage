# Q4 E2E 关键路径 — 结算单

- 分支：`feature/q4-e2e`（基线 `feature/quality-sprint` @ c3ad4e8）
- 状态：完成，**3 个 E2E 全绿，失败自动截图/录像/trace 留档已验证**

## 一、改动清单

| 文件 | 增/删 | 说明 |
|---|---:|---|
| `frontend/playwright.config.ts` | +74 / -0 | 新建：双 webServer（后端 3210 + Vite 5313）、全局 setup、失败留档 |
| `frontend/e2e/global-setup.ts` | +11 / -0 | 新建：webServer 启动**前**重建 e2e 库 |
| `frontend/e2e/setup.ts` | +66 / -0 | 新建：播种 + 建账号 + API 基址，路径全部指向 `data/e2e.db` |
| `frontend/e2e/helpers.ts` | +26 / -0 | 新建：`login()`、`captureOnFailure()` |
| `frontend/e2e/score-import.spec.ts` | +131 / -0 | 新建：链路一 xlsx 导入 → 列表 → 分析出图 |
| `frontend/e2e/comment-generate.spec.ts` | +96 / -0 | 新建：链路二 demo 评语生成 + 降级不瘫 |
| `frontend/package.json` | +4 / -1 | 加 `test:e2e` / `test:e2e:ui` / `test:e2e:report`；devDep 加 `@playwright/test` |
| `frontend/vite.config.ts` | +4 / -1 | 代理目标改为 `VITE_API_TARGET` 可配（默认仍 3000） |
| `.gitignore` | +6 / -0 | 忽略 `test-results/`、`playwright-report/`、`.playwright/` |
| `frontend/package-lock.json` | — | 锁定 `@playwright/test@1.49.1` |

**未改动任何业务代码。** 本单是纯测试基建。

## 二、验证证据

### E2E 3/3 通过

```text
Running 3 tests using 1 worker
[e2e] 重置 e2e 库并灌入 mock 数据…

  ok 1 [chromium] › comment-generate.spec.ts › demo 工作台生成草稿并采纳入库 (9.7s)
  ok 2 [chromium] › comment-generate.spec.ts › AI 不可用时核心 CRUD 仍可用（降级不瘫） (3.0s)
  ok 3 [chromium] › score-import.spec.ts › 导入 → 列表可见 → 分析页出图 (6.3s)

  3 passed (25.9s)
```

### 链路一：真的写库了，不是空跑

用例不只看 UI，还回查数据库。测试结束后直连 `data/e2e.db`：

```json
{
  "exam": { "id": 30, "name": "E2E 导入测试考", "status": "录入中" },
  "scoreRows": 320,                                  // 40 生 × 8 科
  "202601 李敏": [
    { "subject_id": 1, "score": 66,   "status": "正常" },
    { "subject_id": 2, "score": 69.6, "status": "正常" },
    { "subject_id": 3, "score": 73.2, "status": "正常" }
  ],
  "202603 刘艳 语文": { "score": null, "status": "缺考" }   // 表内「缺」正确解析为缺考
}
```

用例内断言也覆盖了：矩阵 40 行、`202601` 语文 = 66、数学 = 69.6、
`202603` 语文 status = `absent`、超过 30 人拿到总排。

### 分析页出图：逐像素验证非空白

不满足于「canvas 存在」，而是对 13 个 canvas 逐个采样非透明像素：

```text
canvases: 13
painted: [14105, 102880, 73229, 143148, 14331, 14325, 14357, 14327, 14327, 14327, 14327, 14327, 26427]
```

13 个全部有实际绘制内容。截图中「班级总分趋势」折线最右侧出现
**E2E 导入测试考** 这个新点——即导入的数据确实流到了分析页。

### 链路二：降级路径按设计工作

未配置 `DEEPSEEK_API_KEY` 时（E2E 刻意不配）：

```text
toast: DeepSeek 未配置，请检查服务器 DEEPSEEK_API_KEY
草稿: 王诗涵本学期总体表现稳定，学习态度端正，能遵守班级纪律。请结合成绩与具体事例补充后作为期末评语使用。（50 字）
采纳按钮: enabled
```

即 **AI 不可用时评语工作台仍可出稿并采纳**，符合 AGENTS.md「AI 可失败可降级」。
第二个用例进一步锁住「AI 挂掉时花名册、学生详情仍可用」。

### 失败留档确实生效（故意注入失败验证）

在用例里临时插入一条必然失败的断言后：

```text
attachment #1: screenshot (image/png)  test-results\...\test-failed-1.png
attachment #2: video (video/webm)        test-results\...\video.webm
attachment #3: trace (application/zip)    test-results\...\trace.zip
```

三件套齐全，且 `screenshot/trace/video` 在 config 里配的是
`only-on-failure` / `retain-on-failure`——**成功时不产生任何多余文件**。

### 回归：单测与构建未受影响

```text
frontend vitest : 48 passed
backend  vitest : 95 passed
frontend build   : ✓ built in 12.14s, 0 error
backend  build   : nest build, 0 error
```

### 截图（`docs/sprints/evidence/q4/`）

| 文件 | 内容 |
|---|---|
| `01-import-preview.png` | Excel 导入预览：规则识别 · 有效行 40/40 · 可写格 320，逐行 ✓ |
| `02-analysis-charts.png` | 分析中心九张图，最新点为「E2E 导入测试考」 |
| `03-comment-generated.png` | demo 评语工作台：DeepSeek 未配置 toast + 占位草稿已生成 |

## 三、隔离与安全（本单最要紧的部分）

E2E 最大的风险是把测试数据写进真实库。本单做了三层隔离：

1. **独立库**：`backend/data/e2e.db`（在 `.gitignore` 的 `backend/data/` 覆盖下）
2. **独立端口**：后端 3210、Vite 5313（不占用开发用的 3000 / 5173）
3. **每次强制重灌**：`globalSetup` 无条件 `seed-mock --reset`，不复用任何残留状态

关键教训：**播种必须发生在 webServer 启动之前**。我最初把 `ensureE2eDatabase()`
放在 `test.beforeAll` 里，结果 Playwright 已经把后端拉起来、后端创建了空库，
播种再写进去就被运行中的连接绕过，表现为「40 行全部学号不存在」。
改用 `globalSetup` 后解决——这是本单踩到的最有价值的坑。

另外 `vite.config.ts` 的代理目标改为读 `VITE_API_TARGET`（默认仍是 3000），
**不改变任何现有开发/构建行为**，只是让 E2E 能指向自己的后端。

## 四、风险与遗留

**新增依赖**

- `@playwright/test@1.49.1`（devDependency，仅测试期）。
  本机浏览器二进制已有缓存（`chromium-1148`），`npm i` 后即可跑，**无需额外下载**。
- CI 环境需 `npx playwright install chromium`。目前 CI 未接入（见下）。

**已知限制**

1. **E2E 依赖后端已构建产物**（`command: 'node dist/main.js'`）。
   所以跑 E2E 前必须先 `cd backend && npm run build`。
   建议在 `test:e2e` 脚本里前置构建，否则忘记构建时报的是「端口无响应」而非「请先构建」，
   排查成本高。**本单未加**，因为你要求 E2E 命令简洁；要加请告知。
2. `e2e/setup.ts` 里 `BACKEND_DIR` 用了 `path.resolve(__dirname, '../../backend')`，
   假定 `frontend/` 与 `backend/` 是同级目录。monorepo 调整目录结构时需同步。
3. 链路一的 UI 断言依赖 `.score-excel__meta` 等 class 名。这些是 scoped CSS 类名，
   样式重构时可能变动。已尽量用语义定位（`getByText(/有效行 40\/40/)`），
   但 `input[type=file]` 仍靠类型选择器。
4. 视频与 trace 会占用磁盘（失败时每例约几 MB）。已 gitignore，但本地需定期清。

**未做**

- **CI 接入**：`.github/workflows/deploy.yml` 仍只在 push main 时构建部署，
  **不跑单测也不跑 E2E**。这属于任务书「变更 CI/CD」范围，需你确认后再动。
  建议至少把 `npm test`（Q3 的 143 例，约 2 秒）加进去；E2E 因需构建产物与浏览器，
  可作为独立 workflow 或手动触发。
- **未覆盖的三条链路**（AGENTS.md 要求的）：登录 ✅（helper 里已做）、
  成绩录入保存重算 ❌、每日备份 ❌。本单任务书只要求两条，故未做；
  备份已在 Q1 有 CLI 演练脚本覆盖。

## 五、下一单预告（Q5 家长成绩单 PDF 批量生成）

**需要的输入**

- 每个学生一份 PDF，**只含本人数据**；一键全量打包 zip（按 48 人规模设计）。
- 硬验收：随机抽 5 份检查无他人数据泄漏，48 份打包成功。

**需要先决策的关键点（影响架构，建议开工前定）**

1. **PDF 生成放在哪一端**。这是本单最需要你拍板的地方：
   - **后端生成**：新增 `backend/src/modules/reports/`，用 PDF 库渲染。
     优点是前端不依赖排版库、数据不出后端；但要**新增运行时依赖**（如 pdfkit / puppeteer），
     按项目规则需你确认，且会进 `dependencies` 影响产物体积。
   - **前端生成**：用浏览器 `window.print()` 或 jsPDF。零新增后端依赖，
     但批量 48 份会连续弹打印框，且中文字体与分页控制不可控。
   - **我的建议**：后端生成，zip 用 Node 内置 `zlib` + 手写 zip 结构（或 `archiver`），
     同样属于新增依赖，需一并确认。

2. **脱敏口径**。任务书写「姓名/学号脱敏校验」，但「本人成绩单」里姓名学号
   本来就该是该生的。我的理解是：**禁止出现他人数据**，而本人姓名学号照常显示。
   若你要求连本人学号也部分隐藏（如 `2026**01`），请明确。

3. **评语是否入 PDF**。任务书只说成绩，但家长成绩单通常含评语。
   是否一并导出该生已采纳的评语？

**可能动的文件**

- 新建 `backend/src/modules/reports/`（repository/service/controller + zip 打包）
- `backend/src/app.module.ts` 注册模块
- `frontend/src/api/settings.ts` 或新建 `reports.ts`
- `frontend/src/views/settings/SettingsView.vue`（加导出入口）或首页/花名册页

**需要注意**

- 这是本冲刺唯一会新增**运行时依赖**的一单，务必先确认再动手。
- 「绝不能出现他人成绩」需要写成**可执行的断言**（如解析 PDF 文本，
  断言不含其他 47 个人的姓名与分数），不能只靠人工抽查。
