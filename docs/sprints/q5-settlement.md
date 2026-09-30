# Q5 家长成绩单 PDF 批量生成 — 结算单

- 分支：`feature/q5-report-pdf`（基线 `feature/quality-sprint` @ 9724684）
- 状态：完成，**40 份 PDF + zip 打包通过，随机抽 5 份零泄漏**
- 依赖：按确认的方案 A，新增 `pdfkit` + `archiver` 两个运行时依赖

## 一、改动清单

| 文件 | 增/删 | 说明 |
|---|---:|---|
| `backend/src/modules/reports/reports.repository.ts` | +141 / -0 | 新建：唯一 SQL 层，查询按 `student_id` 硬收敛 |
| `backend/src/modules/reports/reports.service.ts` | +330 / -0 | 新建：成绩单组装、PDF 渲染、zip 打包、字体解析 |
| `backend/src/modules/reports/reports.controller.ts` | +49 / -0 | 新建：`GET /v1/reports/score-cards.zip` 与 `/score-cards/:id.pdf` |
| `backend/src/modules/reports/reports.module.ts` | +15 / -0 | 新建模块 |
| `backend/src/modules/reports/reports.service.spec.ts` | +199 / -0 | 新建 20 例：总分口径、班排、缺考/免考、低分边界 |
| `backend/src/cli/smoke-q5-reports.ts` | +130 / -0 | 新建：全量渲染 → zip → 逐份解析 → 泄漏检测 |
| `backend/src/app.module.ts` | +2 / -0 | 注册 `ReportsModule` |
| `backend/package.json` | +3 / -1 | 加 `pdfkit`、`archiver`；加 `cli:smoke-q5-reports` 脚本 |
| `backend/.env.example` | +4 / -0 | 登记 `REPORT_FONT_PATH` |
| `frontend/src/api/reports.ts` | +47 / -0 | 新建：二进制下载（不走统一 JSON 包装） |
| `frontend/src/views/settings/SettingsView.vue` | +30 / -1 | 「导出成绩单 PDF」按钮 + 说明文案 |

合计 **约 +990 / -2**，另加两侧 `package-lock.json`。**未改动任何既有业务逻辑。**

## 二、验证证据

### 批量导出（`npm run cli:smoke-q5-reports`，mock 库 40 名学生）

```text
== Q5 成绩单 PDF 验收 ==
在读学生 40 名，参考考试：期末考试
[1] 逐份渲染 40 份，样例大小 12085 字节
[2] 打包 zip 成功：446847 字节
[3] 泄漏检测：全部通过
    抽样索引（5 份）：0, 8, 16, 24, 32
== Q5 验收通过 ==
```

### HTTP 全链路

```text
POST /api/v1/auth/login          -> 200
GET  /api/v1/reports/score-cards.zip
     -> 200  Content-Type: application/zip
             X-Report-Count: 40
             Content-Disposition: attachment; filename="%E6%88%90%E7%BB%A9%E5%8D%95_%E6%9C%9F%E6%9C%AB%E8%80%83%E8%AF%95_2026-09-30.zip"
             Content-Length: 446915
GET  /api/v1/reports/score-cards/1.pdf
     -> 200  application/pdf, 12087 字节, magic=%PDF-
GET  /api/v1/reports/score-cards.zip   （未登录）
     -> 401  ← 认证守卫生效，符合安全红线
```

### 浏览器实下载 + 独立复核泄漏

在真实浏览器点「导出成绩单 PDF」，得到 `成绩单_期末考试_2026-09-30.zip`（446,825 字节）。
用 .NET `ZipFile` 独立打开：**40 个条目**，中文文件名正确：

```text
202601_李敏_成绩单.pdf   12085 bytes
202602_张强_成绩单.pdf   12014
202603_刘艳_成绩单.pdf   12046
…
```

随后手工解析 zip 的 central directory，逐条 inflate 出 PDF，
用 `pdf-parse` 提取文本，与库中 40 名学生的姓名/学号逐一比对：

```json
[
  { "file": "202601_李敏_成绩单.pdf", "selfInText": true, "leaked": [] },
  { "file": "202610_徐一诺_成绩单.pdf", "selfInText": true, "leaked": [] },
  { "file": "202620_王鹏_成绩单.pdf",  "selfInText": true, "leaked": [] },
  { "file": "202630_徐勇_成绩单.pdf",  "selfInText": true, "leaked": [] },
  { "file": "202640_王伟_成绩单.pdf",  "selfInText": true, "leaked": [] }
]
```

**验收要求的「随机抽 5 份」在此之外还做了全量 40 份的自动化检测**（脚本 [3] 步），
两份都为零泄漏。

### PDF 内容正确性

渲染出的 PDF 用 pdfjs 提取文本，逐字核对：

```text
学 生 成 绩 单
ClassPilot 班主任班级管理系统
姓名：李敏  学号：202601  考试：期末考试  日期：2026-01-10  学期：2026-2027 第一学期
科目   满分   得分   班级排名
语文   120   80    第 23 名
数学   120   77.5  第 22 名
英语   120   82.5  第 19 名
…
总分：580    班级排名：第 20 名 / 40 人
```

总分 580、班排 20 与 Q2 截图中该生数据完全一致，说明口径对齐。
渲染截图见 `evidence/q5/01-score-card-pdf.png`（中文正常、表格规整、低分标红逻辑可用）。

### 新增单测（20 例）

覆盖：只累加正常分 / 全缺考为 null / 小数两位 / **浮点无累积误差**（0.1+0.2=0.3）、
班排降序 / 并列同名次 / 不在表内无排名 / 缺考显示「缺考」/ 免考 / 未录入显示「—」/
低分边界（40% 恰好不算低分）/ 缺考不误判低分 / 考试科目按 sort 输出 /
库里无成绩的科目也出现在表中 / 评语透传。

### 回归

```text
backend  build : 0 error     tests : 115 passed（+20）
frontend build : 0 error     tests : 48 passed
E2E           : 3 passed（未受影响）
```

### 截图

| 文件 | 内容 |
|---|---|
| `evidence/q5/01-score-card-pdf.png` | 渲染出的成绩单 PDF（李敏） |
| `evidence/q5/02-settings-ui.png` | 设置页「导出成绩单 PDF」按钮 |
| `evidence/q5/03-download-success.png` | 浏览器下载成功的提示 |
| `evidence/q5/exported-sample.zip` | 浏览器实下载的 zip（40 份，可自行解压复核） |

## 三、关键技术决策（含一次失败记录）

### 先验证再动手，避免了拍脑袋

我最初想**手写 PDF + Node 内置 zlib 打 zip，零新增依赖**。动手验证后结论是**不可行**，
已在停下来问你之前实测：

| 验证项 | 结果 |
|---|---|
| 手写 PDF 结构 | 合法，pdfjs 能打开 |
| 中文文本提取 | 修好 `ToUnicode` CMap 后正确 |
| **中文文本渲染** | **失败——所有字叠在一起变乱码** |

根因是 CID 字体的 CID→字形宽度映射不匹配。继续手写等于在造 PDF 库，
所以才停下来说明并请你选方案。**这次验证的价值在于：避免了在错误的路线上写完整个功能。**

### 选定方案 A 后的关键细节

1. **字体必须是 `.ttf`，不能是 `.ttc`**。pdfkit 对 TrueType Collection 直接报
   `font.createSubset is not a function`。本机 `simsun.ttc`/`msyh.ttc` 都不可用，
   最终用 `simhei.ttf`（黑体，视觉上适合成绩单）。
2. **字体缺失时显式报错，不静默降级**。`resolveFont()` 找不到任何可用字体时抛
   500 并提示「请设置 REPORT_FONT_PATH 指向一个 .ttf 中文字体」，
   绝不生成一份乱码 PDF 给家长。
3. **Linux 部署**：候选列表含 `/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc` 等路径，
   但 **pdfkit 不支持 `.ttc`**，所以这些候选会被跳过。**这意味着 Linux 服务器上
   必须挂载一个 `.ttf` 中文字体并设置 `REPORT_FONT_PATH`**，否则该功能会明确报错。
   这是本单最需要你在部署时注意的一点（详见风险）。
4. **不走统一 JSON 包装**。PDF/zip 是二进制，用 `@Res()` 直接写响应流，
   并带 `Content-Disposition`（中文文件名已 URL 编码）与 `Cache-Control: no-store`。
5. **数据边界由 SQL 保证**，不靠应用层过滤。`listStudentScores(examId, studentId)`
   的 `WHERE sc.student_id = ?` 是硬边界，从查询层就不可能取到他人行。

## 四、按你确认的口径实现

- **脱敏口径**：按我上轮的理解实现——**禁止出现他人数据，本人姓名学号照常显示**。
  PDF 里本人姓名、学号、考试、日期、学期、各科分数与班排均为明文。
  校验脚本逐份断言「含本人标识、不含任何他人姓名或学号」。
- **评语**：按你未反对的默认，**已包含该生最近一条已采纳评语**（表格下方单独段落）。
  当前 mock 库无评语记录，故截图中该段未出现；代码路径有 2 个用例覆盖透传与 null。

## 五、风险与遗留

**部署风险（最重要）**

- **Linux 服务器需准备 `.ttf` 中文字体**。当前部署机（1Panel + Ubuntu）我**没有验证过**
  是否有可用的 `.ttf` 中文字体。若无，本功能在生产上会返回明确的 500 错误而非乱码。
  建议部署时执行一次「导出成绩单 PDF」冒烟，或预先把字体放到
  `/opt/classpilot/fonts/` 并设 `REPORT_FONT_PATH`。
- 新增两个运行时依赖会让后端产物增大（pdfkit 约 1MB 量级）。已确认接受。

**其他遗留**

1. **导出的是「最近一场已录成绩的考试」**，不支持指定考试。若要按学期/考试导出需加参数。
2. **评语取该生最近一条已采纳记录**，不区分评语类型（期末/期中/日常都取最新一条）。
3. **未做 PDF 单份导出按钮的 UI 入口**。后端 `/score-cards/:id.pdf` 已可用，
   但前端只在设置页提供了「批量导出 zip」。任务书只要求批量，故未加单份按钮。
4. **demo 模式不支持**。demo 会拦截所有 `/api` 请求，而 demo 目录是只读禁区，
   所以 demo 下点按钮会提示「演示模式不生成 PDF」。这是有意为之。
5. `smoke-q5-reports.ts` 会在 `DB_PATH` 指向的库里**写入一条 `report_pdf_bundle` 审计日志**。
   **绝不可对生产库执行**（同 Q1 的 smoke 脚本注意事项）。

**改动过的公共文件**

- `backend/src/app.module.ts`：仅新增 `ReportsModule` 一行 import + 一行注册。
- `frontend/src/views/settings/SettingsView.vue`：在既有「全量数据导出」卡片内
  **追加**一个按钮与一行说明，Excel 导出逻辑未动。
- `backend/package.json`：新增 2 个 dependencies + 1 个 script。

## 六、下一单预告（Q6 AI 评语流式体验）

**需要的输入**

- DeepSeek 接 SSE 流式输出，评语工作台打字机渲染；**生成中断可续写**。
- 验收：demo 模式下模拟流式全链路可演示。

**需要先决策的点**

1. **新增依赖**。前端接 SSE 通常用 `@microsoft/fetch-event-source`（可断线重连），
   或直接用原生 `fetch` + `ReadableStream`（零依赖）。后端要新增
   `@Sse()` 装饰器（Nest 内置，无需依赖）。
   我建议**前端用原生 ReadableStream**，避免为 SSE 再加一个运行时依赖。
2. **「续写」的语义**。我理解为：生成中断后保留已产生的文本，
   点「继续」从断点继续生成（需要把已生成内容作为上下文回传给 DeepSeek）。
   请确认是「续写同一条」还是「重新生成一条更短的」。
3. **与既有降级的关系**。Q5/Q4 都验证了「AI 未配置时降级为占位草稿」。
   流式是否也要在未配置时降级？我建议保持一致：未配置时不走流式，
   直接给占位草稿，避免用户看到「逐字打出」一段假内容。

**可能动的文件**

- `backend/src/modules/ai/deepseek.service.ts`（新增 `chatStream`）
- `backend/src/modules/ai/comment-generate.service.ts` 或新增 stream 端点
- `backend/src/modules/comments/comments.controller.ts`（新增 `@Sse` 端点）
- `frontend/src/api/comments.ts`（新增流式请求）
- `frontend/src/views/ai/CommentsWorkbenchView.vue`（打字机渲染 + 续写按钮）
- `frontend/src/demo/aiGenerate.ts`——**注意：demo 目录是只读禁区**，
  demo 模式的流式模拟需另想办法（可能需要后端 mock 端点，或接受 demo 下不支持流式）
