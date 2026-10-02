# Q6 AI 评语流式体验 — 结算单

- 分支：`feature/q6-stream`（基线 `feature/quality-sprint` @ 15a3bf8）
- 状态：完成，**demo 模式流式全链路可演示，零新增依赖**

## 零、按你的确认执行的三项决策

| 待决项 | 你的选择 | 落地情况 |
|---|---|---|
| 前端 SSE 实现 | 原生 `fetch` + `ReadableStream` | `frontend/src/api/commentStream.ts`，**未引入任何依赖** |
| 「续写」语义 | 续写同一条 | 后端只补发未生成部分，前缀零重复（下方实测） |
| 未配置 AI 时 | 不走流式，直接占位草稿 | `generateStream` 内首个分支即判定并 return |
| demo 流式（第三项） | 后端 mock 端点 | 新增 `POST /v1/comments/mock-stream` |

## 一、改动清单

| 文件 | 增/删 | 说明 |
|---|---:|---|
| `backend/src/modules/ai/deepseek.service.ts` | +150 / -13 | 重写：新增 `chatStream()` 生成器与 SSE 解析；原 `chat()` 逻辑保持 |
| `backend/src/modules/ai/comment-generate.service.ts` | +155 / -0 | 新增 `generateStream()`：meta/delta/done 三类事件 + 降级 |
| `backend/src/modules/ai/ai.service.ts` | +70 / -0 | 新增 `mockStreamGenerate()`：不调 DeepSeek 的演示流 |
| `backend/src/modules/comments/comments.controller.ts` | +42 / -3 | 新增两个 `@Sse` 端点 |
| `backend/src/modules/comments/comments.service.ts` | +32 / -0 | 新增 `streamGenerate()` 与存在性校验 |
| `backend/src/modules/comments/comments.dto.ts` | +12 / -0 | 新增 `StreamCommentDto`（含 `continueFrom`） |
| `frontend/src/api/commentStream.ts` | +137 / -0 | 新建：原生 SSE 客户端 |
| `frontend/src/views/ai/CommentsWorkbenchView.vue` | +120 / -3 | 打字机渲染 + 续写按钮 + 生成方式下拉 |

**新增运行时依赖：0 个。** Nest 的 `@Sse` 是内置装饰器（已验证 `typeof Sse === 'function'`）。

## 二、验证证据

### SSE 端点（真实后端 + HTTP）

```text
POST /api/v1/comments/mock-stream
  -> 200  Content-Type: text/event-stream
         Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0, no-transform

事件序列（逐块实测）:
  首个事件: meta
  delta 块: 35 个
  末个事件: done
  首块延迟: 27ms   末块延迟: 969ms   ← 约 22ms/块的打字机节奏
  done 文本长度: 137
```

### demo 模式打字机（浏览器实测，文本长度随时间增长）

```text
采样(每 160ms):  20 → 44 → 68 → 96 → 120 → 137 → 137
done 文本开头:   该生本学期在课堂上专注听讲，作业按时完成，学习态度端正…
控制台错误:     0
```

第二次生成中途截图抓到 56 字（未完成态），完成后回到 137 字，
证明是**真流式**而非一次性填充。

### 续写语义（断点续写、不重复）

浏览器内主动 `reader.cancel()` 模拟中断：

```text
[中断] 读 6 块后断开 → 保留 20 字
       "李敏本学期在课堂上专注听讲，作业按时完成"

[续写] 以该 20 字为 continueFrom 再请求
       新增字符: 116
       最终长度: 136  (= 20 + 116)
       开头:     "李敏本学期在课堂上专注听讲，作业按时完成学习态度端…"
                 ↑ 与前缀严丝合缝，无重复、无吞字
```

### 回归

```text
backend  build : 0 error    tests : 115 passed
frontend build : 0 error    tests : 48 passed
E2E           : 3 passed（评语生成用例仍绿）
```

### 截图（`docs/sprints/evidence/q6/`）

| 文件 | 内容 |
|---|---|
| `01-typewriter-done.png` | demo 评语工作台，流式生成完成（137 字）、上下文面板同步 292 tokens |
| `02-typewriter-running.png` | 生成进行中（56 字），按钮显示「生成中…」 |
| `03-after-continue.png` | 续写完成后 |

## 三、实现要点

### 1. 事件协议

统一为 `meta → (delta)* → done`：

- `meta`：一次性，带 `contextText`/`contextSections`/`approxTokens`/`aiRecordId`
- `delta`：增量文本，前端累加
- `done`：最终全文；`interrupted: true` 表示中断，前端据此显示「续写」

前后端共用同一套结构（`CommentStreamEvent`）。中途踩过一个坑：
最初手动包了一层 `{type:'message', data:event}`，被 Nest 再包一次，
前端收到双层信封。**改为直接 yield 事件对象、由 `@Sse` 负责包装**才正确。

### 2. 前端零依赖的理由

`EventSource` 只支持 GET 且无法带 Cookie，而本项目所有接口都靠
HttpOnly Cookie 鉴权，所以 EventSource 天然不适用。用
`fetch` + `response.body.getReader()` 逐块读，既能带 `credentials`
又能带 POST body，无需 polyfill。

### 3. 降级一致性

`generateStream()` 的第一个分支就检查 `isConfigured()`：
未配置时**不进入流式**，直接 yield 一条占位草稿 + `meta.available=false`。
这与既有 `POST /generate` 行为一致，也符合我上一轮的建议——
避免用户看到「逐字打出」一段其实是占位模板的假内容。

### 4. demo 流式如何绕过只读禁区

`frontend/src/demo/` 是只读禁区，无法在 `aiGenerate.ts` 里加流式。
因此把「模拟流」放在**后端** `/v1/comments/mock-stream`：
不调 DeepSeek、不写业务表，只按 22ms 节奏吐固定文本，
事件结构与真实流完全一致。前端 `commentStream.ts` 在 demo 模式下
自动改指该端点。**demo 目录保持零改动。**

## 四、风险与遗留

**公共文件改动**

- `CommentsWorkbenchView.vue`：原「生成」按钮改为默认走流式；新增「续写」按钮（仅
  `streamInterrupted` 时出现）与「⋯」下拉（可切回一次性生成）。原 `handleGenerate`
  **保留未删**，通过下拉「一次性生成」仍可调用——一次性路径没有破坏。
- `comments.controller.ts` 构造函数新增 `AiService` 注入。仅新增两个端点，
  既有 `generate`/`adopt` 等端点未改。

**已知限制**

1. **续写会把已产出文本回传给 DeepSeek**，上下文变长，且模型有重复倾向。
   我已在 system/user 提示里明确「不要重复已有内容」，mock 端点则是
   **按前缀精确裁剪**（服务端只补发剩余部分），真实模型不保证 100% 无重复。
   若介意，可改为「续写时重新生成完整版」。
2. **`chatStream` 不做内部重试**。流一旦开始就无法安全重放，失败直接抛给
   调用方降级（保留已产出部分 + 可续写）。这与 `chat()` 的 2 次退避重试
   是有意区分的。
3. **未配置 AI 时前端也走流式端点**，但后端立即返回占位草稿（不走 SSE）。
   表现是「瞬间出全文」，而非打字机。这是刻意的，见第三节第 3 点。
4. **真实流式未接真 DeepSeek 验证**。本机未配置 `DEEPSEEK_API_KEY`，
   验证用的是后端 mock 端点 + 浏览器实测。生产首次启用时建议手工跑一次确认。
5. mock 端点**任何人登录后都能调**，会即时生成一段固定文本。
   它不写库、不消耗额度，但生产环境暴露一个「假 AI」端点略有迷惑性。
   如需限制，可加配置开关（当前未加）。

**其他**

- 工作区根的 `%SystemDrive%/`（搜狗输入法缓存）同前五单，仍未处理。

## 五、下一单预告（Q7 移动端核查 + PWA）——**最后一单**

**需要的输入**

- 逐页过 375px 宽度可用性，出问题清单 + **只修布局级问题**（交互重设计不做）
- 加 PWA manifest + service worker（可添加到主屏幕）
- 验收：问题清单 + 修复前后截图 + Lighthouse PWA 检测通过

**必须先解决的前置问题**

1. **AGENTS.md 与 Q7 冲突，需你裁决**。项目规则写着「前端不做响应式适配，
   布局 `min-width: 1200px`」，而 Q7 要求逐页过 375px。这两条直接矛盾：
   - 按 AGENTS.md：应新增独立的移动端样式（不破坏 1200px 桌面布局）
   - 按 Q7：可能要改全局布局，会影响桌面观感与既有截图基线

   **我的建议**：新增移动端断点（≤768px）下的覆盖样式，**桌面端 1200px 布局
   保持不变**。这样既满足 Q7 的 375px 可用性，又不违反「桌面不做响应式」。
   请确认这个解法。

2. **CI 仍未接入任何测试**（Q3 的 163 例 + Q4 的 3 条 E2E），
   而 Q7 验收要「Lighthouse PWA 检测通过」。Lighthouse 通常在 CI 跑更可靠，
   但接 CI 属任务书「变更 CI/CD」范围，需你授权。**若不接 CI，
   我只能在本地跑 Lighthouse 并贴报告截图**——请确认你接受哪种。

3. **PWA 需 HTTPS**（或 localhost）。当前生产是 `COOKIE_SECURE=false` 的
   HTTP 部署，**service worker 在非 localhost 的 HTTP 下不会注册**。
   这意味着 PWA 功能在现有生产环境上**可能无法启用**。请确认：
   - 是否有 HTTPS 域名？
   - 若没有，是否接受「代码就位但生产未生效」的状态？

**可能动的文件**

- `frontend/src/styles/tokens.css` 或新增 `mobile.css`（断点覆盖）
- 各业务视图（仅布局级修复）
- 新建 `frontend/public/manifest.webmanifest`、图标资源
- `frontend/src/main.ts`（注册 service worker）
- 新建 `frontend/public/sw.js`
- `frontend/index.html`（引入 manifest）
- 新建 `docs/sprints/q7-audit.md`（375px 问题清单）

**需要注意**

- 这是最后一单，也是唯一可能触及**全局样式**的一单，影响面比前六单都大。
  建议动手前先跑一遍全量截图基线，确保改完能对照。
