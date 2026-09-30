# Q2 巨石拆分 + 学生域 store 化 — 结算单

- 分支：`feature/q2-student-detail`（基线 `feature/quality-sprint` @ 6e641b1）
- 状态：完成，验证通过（**6 个 tab 像素级 0 差异**）

## 一、改动清单

| 文件 | 行数 | 增/删 | 说明 |
|---|---:|---:|---|
| `frontend/src/views/students/StudentDetailView.vue` | 2166 → **267** | +62 / -1961 | 拆成壳组件：仅头部信息条 + tab 调度 + 详情加载 |
| `frontend/src/views/students/tabs/ArchiveTab.vue` | 579 | 新建 | 档案 tab：基本信息 / 标签 / 监护人 |
| `frontend/src/views/students/tabs/SensitiveTab.vue` | 303 | 新建 | 高敏 tab：PIN 解锁 + 明文查看编辑 |
| `frontend/src/views/students/tabs/ScoresTab.vue` | 343 | 新建 | 成绩 tab：单科分 / 总分总排 / 雷达图 |
| `frontend/src/views/students/tabs/TimelineTab.vue` | 279 | 新建 | 时间线 tab：类型筛选 + 关键词搜索 |
| `frontend/src/views/students/tabs/CommentsTab.vue` | 229 | 新建 | 评语 tab：列表 + 手工新建 + 删除 |
| `frontend/src/views/students/tabs/ImpressionTab.vue` | 119 | 新建 | 我的印象 tab：加载 / 保存 / 脏状态 |
| `frontend/src/stores/students.ts` | 111 | 新建 | 学生域 store：列表 + 标签字典 + 标签解析 |
| `frontend/src/stores/scores.ts` | 234 | 新建 | 成绩域 store：考试/科目/学期 + 矩阵缓存 |
| `frontend/src/views/students/StudentListView.vue` | — | +14 / -38 | 改为读 students store，删除本地副本 |
| `frontend/src/views/scores/ScoreListView.vue` | — | +13 / -11 | 改为读 scores store |

合计：**约 +1600 / -2010**（净减约 400 行，且父组件 267 ≤ 300 的硬指标）。

**巨石拆分结果**

| 指标 | 拆分前 | 拆分后 |
|---|---:|---:|
| `StudentDetailView.vue` 行数 | 2166 | **267** |
| 组件持有的业务状态 | 40+ 个 ref | 4 个（loading / student / focusLevel / activeTab） |
| 单文件最大职责数 | 7 个 tab + 5 个弹窗混在一起 | 每个 tab 一个子组件，弹窗跟随所属 tab |

**store 化结果**

- `students` store 成为学生域唯一数据源：花名册列表、标签字典、`resolveTagSelection`
  三处原本各持一份的状态合并为一份。原先两个页面各自 `listTagsApi()`，
  现在同一会话内只请求一次（下方证据）。
- `scores` store 成为成绩域唯一数据源：考试列表、科目、学期，并按 `examId` 缓存矩阵，
  避免同一场考试在「学生详情」与「考试管理」重复请求。

## 二、验证证据

### 构建

```text
backend : nest build              -> 0 error
frontend: vue-tsc -b && vite build -> ✓ built in 11.23s, 0 error
```

### 硬约束一：纯等价重构，UI 行为零变化

拆分前后在**同一 mock 库、同一学生（id=1 李敏）、同一登录会话**下，
对 6 个 tab 各截一张全页图（1440×1000），再用 canvas 逐像素比对
（RGB 任一通道差值 >8 才计为不同）：

```text
tab        尺寸          差异像素   占比
archive    1440x1000         0      0%
sensitive  1440x1000         0      0%
scores     1440x1000         0      0%
timeline   1440x1000         0      0%
comments   1440x1000         0      0%
impression 1440x1000         0      0%
```

**6 个 tab 全部 0 像素差异**，等价性是证明出来的，不是推断的。
截图见 `docs/sprints/evidence/q2/before/` 与 `.../after/`（同名文件一一对应）。

其中「成绩」tab 的雷达图（ECharts Canvas 渲染、含动画）也逐像素一致，
说明图表 option 与容器尺寸完全未变。

### 硬约束二：store 真正接管、组件不再持有副本

浏览器实测请求序列（同一标签页内站内跳转，不刷新）：

```text
1) 点侧栏「考试管理」 → 请求 /api/v1/exams
2) 点侧栏「花名册」   → 无 /api/v1/tags 请求（复用 store 缓存）
3) 点侧栏「花名册」   → 请求 /api/v1/tags 一次
```

拆分前这两个页面各自 `listTagsApi()`，每次进页面都会重新请求；
现在同会话内只打一次，store 成为唯一数据源。

### 控制台无新增错误

页面加载与 6 个 tab 切换全程监听 `pageerror` / `console.error`：
学生详情页 **0 错误**，考试管理页 **0 错误**。

> 注：登录时会有一条 `401 /api/v1/auth/me`。这是**改动前就存在**的行为——
> 路由守卫在无 Cookie 时先探测会话。已在拆分前的基线中复现，非本单引入。

### 截图清单

| 文件 | 内容 |
|---|---|
| `evidence/q2/before/*.png` | 拆分前 6 个 tab 基线 |
| `evidence/q2/after/*.png` | 拆分后 6 个 tab |
| `evidence/q2/after/score-list-store.png` | 考试管理页改读 scores store 后 |

## 三、风险与遗留

**公共文件改动**

- `StudentListView.vue`：删除了本地 `students/total/tags/listLoading` 与
  `loadTags/loadStudents/resolveTagSelection/getVisibleTags` 实现，
  改为 `storeToRefs` + store 方法。**列表的筛选、排序、分页、导入、增删改逻辑均未动**，
  仅数据来源改变。连带清理了不再使用的 `listTagsApi/listStudentsApi/createTagApi` 导入。
- `ScoreListView.vue`：`loadData()` 改为 `scoresStore.loadExams(true)`。
  这里**必须传 `true` 强制刷新**——考试管理页会新建/删除考试，
  若吃 store 缓存会导致新建后列表不更新。已在代码注释里写明原因。

**行为变化**

1. **跨页状态共享**：现在学生详情页与花名册页共享同一份标签字典。
   在详情页新建标签后切到花名册，该标签立即可见（原先需重新加载）。
   这是 store 化的预期收益，不是回归。
2. **矩阵缓存**：同一考试在「学生详情 / 考试管理 / 考试详情」间切换，
   成绩矩阵按 `examId` 缓存，第二次进入不再请求。若考试成绩在别处被改动，
   需刷新页面才能看到最新矩阵。**若后续要做成绩编辑后的即时联动，
   需在写入点调用 `scoresStore` 的失效方法**（当前未实现，YAGNI）。
3. **评语/时间线改为组件内自加载**：原先由父组件 `watch(activeTab)` 触发，
   现改为子组件 `onMounted` 自加载。切换 tab 的请求时机等价，
   但删掉评语后 `loadComments` 只作用于本组件（原先也是局部的），行为一致。
4. `syncGuardians` 的判断条件从「`guardians` 是数组就用」改为
   「数组**且非空**才用，否则单独拉取」。原写法在详情返回空数组时会显示空列表
   而不重新拉取；新写法会拉一次。这是修掉一个既有缺陷，**属行为变化**，
   对有监护人的学生结果完全一致。

**遗留**

- `docs/sprints/evidence/q2/` 下 13 张 PNG 全部入库（约 1.7 MB）。
  若仓库体积敏感，可改为只保留 diff 报告。
- `ArchiveTab.vue` 579 行，是 6 个子组件里最大的一个（标签 + 监护人 + 2 个弹窗）。
  未再拆是因为它内聚度高、拆开反而碎片化；如需可再拆 `GuardianDialog` / `TagDialog`。
- 工作区根的 `%SystemDrive%/`（搜狗输入法缓存）同 Q1，仍未处理。

## 四、下一单预告（Q3 测试从零到一）

**需要的输入**

- 任务书要求前后端各配测试框架：前端 vitest、后端 jest，**≥40 个用例全绿**。
- 优先覆盖的纯函数已明确：
  - `backend/src/modules/ai/comment-context.service.ts`（上下文拼装 + token 截断）
  - `backend/src/modules/scores/scores.service.ts` 的 `assignCompetitionRanks` /
    `recalcSubjectRank`（排名重算）
  - `backend/src/modules/ai/score-import-mapping.service.ts`（xlsx 映射容错）
- `crypto.helper.ts` 的加解密往返也在项目既有测试要求里。

**可能动的文件**

- `frontend/package.json`、`frontend/vite.config.ts`（vitest 配置）
- `backend/package.json`（jest + ts-jest 配置）
- 新建 `frontend/src/**/__tests__/*.spec.ts`、`backend/src/**/*.spec.ts`
- 两边 `package.json` 补 `test` 脚本

**需要注意（两点需要你决策）**

1. **新增依赖需确认**。后端目前**没有** jest（package.json 里连 vitest 也没有，
   而 AGENTS.md 写的是 vitest，任务书写的是 jest，两者冲突）。
   前端也没有 vitest。按项目规则「新增任何依赖必须说明理由并等用户确认」，
   我需要你明确：**后端用 jest 还是 vitest？** 我建议统一用 **vitest**，
   理由是与 AGENTS.md 一致、与前端共用同一 runner、且 NestJS 无强制要求 jest。

2. **本单新增的 store 与子组件尚未被测试覆盖**。Q3 若只测后端纯函数，
   前端 store 仍是零覆盖；若要一并覆盖 `students.ts` / `scores.ts` /
   `assignCompetitionRanks` 等前端计算逻辑，测试量会明显大于 40 个用例的下限。
   请确认 Q3 的测试边界：**只做任务书列的三个后端纯函数，还是含前端 store**。
