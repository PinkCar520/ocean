# Ocean v2 架构迁移计划

状态：In Progress（Phase 0）

更新时间：2026-09-14

## 1. 迁移目标

在不推倒现有产品、不一次性切换全部链路的前提下，实现：

- 可重复通过的工程基线。
- 单一跨端 Contract。
- 职责清晰的 Agent Runtime。
- 可暂停、恢复、审批和重试的持久 Run。
- NestJS 控制平面与 Python 计算平面的清晰边界。
- Code、Work、Life Space 的数据和策略隔离。

## 2. 执行规则

1. 每个阶段必须能独立合并、部署和回滚。
2. 每个兼容层必须记录删除条件，不允许无限期双轨运行。
3. 数据库迁移先扩展、再回填、再切读写、最后删除旧字段。
4. 先增加观测和测试，再替换核心执行链路。
5. 当前未完成的依赖与流协议迁移应先整理，不能与 v2 领域重构混成一个提交。

## 3. Phase 0：冻结与恢复工程基线

目标：知道当前系统能否可靠构建，以及后续每次改动是否破坏基线。

### 当前进度（2026-09-14）

- [x] 根命令 `pnpm check` 已统一执行 lint、build 和 test。
- [x] 已建立 GitLab CI 最小验证流水线，并固定 Node 24 与仓库声明的 pnpm 版本。
- [x] 当前 workspace build 通过。
- [x] 当前自动化测试通过（Contracts、UI、Gateway、GitLab、Jenkins 共 54 项）。
- [x] 修复 Web、Desktop 和 Gateway 中阻断 lint 的代码问题。
- [x] Web、Desktop、Gateway、CLI 与 contracts 已纳入统一 typecheck。
- [x] Web 已迁移到 Next.js App Router，并建立 Server Component 页面与 Client Shell 边界。
- [x] Web 导航已与共享 UI 解耦，Desktop 保持 React Router 适配。
- [x] Compose 与生产容器已切换到 Next.js standalone 运行时及容器内 Gateway 地址。
- [x] Gateway 已支持 HttpOnly 会话 Cookie，同时保留 Desktop/CLI Bearer Token 兼容。
- [x] `/app` 与会话页面已在 Server Component 中验证 Cookie 并注入首屏用户资料。
- [x] Web 已完全切换为 Cookie-only 登录，不再读取或保存 localStorage Token；登出显式清除服务端 Cookie。
- [x] 会话列表与当前会话历史已进入 Server Component 首屏 Bootstrap，客户端跳过重复初始化请求。
- [x] App Router 已增加 loading、error 与 not-found 边界。
- [x] 模型与知识项目列表已加入服务端首屏 Bootstrap，项目视图跳过重复客户端请求。
- [x] Skill 列表与统计已加入服务端首屏 Bootstrap，Landing Page 已恢复为纯 Server Component。
- [x] 知识项目详情、文档和索引统计已迁入 `/app/projects/[id]` 动态 Server Component 路由。
- [x] Web 功能导航已改为 `/app/chats`、`/app/projects`、`/app/skills`、`/app/skills/studio`、`/app/workflows` 真实子路由，不再依赖 localStorage Tab。
- [x] 会话路由已统一为 `/app/chat/[id]`，旧 `/chat/[id]` 兼容路由已删除。
- [x] Server Bootstrap 已按页面能力选择性加载模型、项目和技能数据，避免固定全量请求。
- [x] Next.js 16 `proxy.ts` 已对 `/app/*` 和 `/auth` 建立 Cookie 乐观路由拦截。
- [x] 共享 UI 已移除未使用的 Vite 资源、独立 npm lockfile 和 React Router 依赖；React Router 仅保留在 Desktop。
- [x] `/auth` 已拆为独立 Client Island，不再加载主应用 Shell；受保护页面在 Server Component 层执行最终会话重定向。
- [x] 项目、技能、工作流、历史会话与设置模块已从聊天首屏静态依赖中拆出，改为按路由和交互动态加载。
- [x] App Layout 与登录页已使用轻量 Server Component 会话验证，并消除失效 Cookie 引发的重定向循环。
- [x] Web 登出已迁为 Server Action，由服务器直接删除 HttpOnly 会话 Cookie。
- [x] Web 登录与注册已迁为 Server Action，JWT 仅写入 HttpOnly Cookie，不再返回浏览器应用状态。
- [x] 会话创建/重命名/删除、项目创建/删除、技能安装/卸载已迁为 Server Actions，并保留 Desktop API 适配。
- [x] 聊天 SSE、上传、语音、本地节点 RPC 与自动补全已确认为 Client API 边界，不纳入 Server Action 迁移。
- [x] Gateway 安装后自动生成 Prisma Client，不再依赖旧缓存。
- [ ] Gateway 仍有 1820 条存量 lint 警告；按模块逐步清偿并恢复为 error。
- [ ] 补齐缺少的 workspace `typecheck`、`test`、`lint` 脚本。
- [ ] 补齐 Web、Desktop、Gateway、CLI 冒烟测试。
- [ ] 验证全新 checkout 的冻结安装与 README 启动流程。

### 工作项

- 整理当前暂存修改：区分正式迁移、临时测试和生成文件。
- 固定 Node、pnpm 版本，并在 CI 使用相同版本。
- 统一 TypeScript、React、AI SDK、MCP SDK 和 Zod 主版本。
- 为所有 workspace package 补充有效的 `build`、`typecheck`、`test`、`lint` 脚本。
- 新增根命令 `pnpm check`，顺序执行 format check、lint、typecheck、test 和 build。
- 更新 README 的真实技术版本、服务列表与启动方式。
- 建立最小 CI，禁止无法构建的提交进入主分支。
- 将临时脚本移至 `experiments/` 或删除，不作为正式测试。

### 验收标准

- 全新 checkout 可按 README 启动。
- `pnpm install --frozen-lockfile` 成功。
- `pnpm check` 连续两次通过。
- Web、Desktop、Gateway、CLI 至少各有一个冒烟测试。

### 回滚

仅涉及工程配置和依赖；每组版本升级独立提交，可按提交回滚。

## 4. Phase 1：建立统一 Contract

目标：停止前端、后端和 Worker 协议继续漂移。

### 当前进度（2026-09-14）

- [x] 创建 `packages/contracts`，建立独立构建、类型检查和测试入口。
- [x] 定义首版 `SpaceType`、`RunStatus`、`RunEvent`、`ToolCall`、`Approval` 与 `Artifact` schema。
- [x] Contract 严格边界校验和事件 round-trip 测试通过。
- [x] Generative UI schema 已迁入 contracts，旧 core/UI 路径保留 type-only re-export 兼容层。
- [x] 当前聊天、标题和自动补全 API 已接入 contracts 输入校验。
- [x] Web/Desktop 共享 UI 层已对未知或非法 Generative UI 提供运行时安全降级。
- [x] Gateway 已建立持久化 Run create/get/cancel API，并校验输入、快照及 RunEvent 输出。

### 工作项

- 创建 `packages/contracts`。
- 迁移 Generative UI schema，替换 core 与 UI 的重复定义。
- 定义 `RunStatus`、`RunEvent`、`ToolCall`、`Approval` 和 `Artifact` schema。
- 定义当前聊天 API 的兼容 Contract。
- Gateway 在输入和输出边界执行 schema 校验。
- Web/Desktop 对未知事件提供安全降级展示。
- 为 Contract 增加兼容性测试和固定样例。

### 验收标准

- Generative UI 类型只有一个定义来源。
- Gateway 与客户端针对同一事件样例完成 round-trip 测试。
- 未知事件不会导致 UI 崩溃。

### 回滚

保留旧类型的 re-export 兼容层；所有调用完成迁移后删除。

## 5. Phase 2：拆分 Agent Runtime，不改变外部行为

目标：缩小 `SkillOrchestrator`，但保持现有聊天链路和 UI 协议不变。

### 工作项

- 提取 `ModelRegistry`，统一供应商配置和模型能力描述。
- 提取 `PromptComposer` 与 `ContextAssembler`。
- 提取 `ToolRuntime`，统一 MCP 与本地 RPC 工具表示。
- 提取 `PolicyEvaluator`，让所有工具调用经过同一权限入口。
- 提取 `SkillResolver`，暂时适配现有 SkillLoader/Registry/FastAPI。
- 为每项服务建立单元测试。
- 将 `SkillOrchestrator` 变为兼容门面，不再直接访问 Prisma、文件系统或第三方 API。

### 验收标准

- 现有 Web 聊天、显式 Skill、自动 Skill、MCP 调用和审批行为不变。
- `SkillOrchestrator` 仅组织服务调用，不包含供应商与持久化实现。
- 模型和工具模块可在不启动 Nest 应用的情况下单测。

### 回滚

兼容门面可临时切回旧实现；新服务按能力逐项启用。

## 6. Phase 3：统一 Skill 与 Python 边界

目标：消除重复事实来源和双控制平面。

### 工作项

- 定义 Skill Artifact、Version、Installation 和 Source 数据模型。
- 将文件系统 Skill 导入为版本化 Catalog 记录。
- Skill Runtime 只读取确定版本，不在运行中隐式改变内容。
- 将 Python Skill Resolver 逻辑迁回 Nest Skill Runtime，或改成无状态计算 Job。
- 合并 Nest 与 FastAPI 重复的知识项目、RAG 和音频入口。
- Python 删除业务 ORM 所有权，只保留 Job Handler。
- 给 Skill 安装、升级、回滚和执行增加审计。

### 验收标准

- 同一个 Skill 名称能够确定到唯一版本和内容摘要。
- NestJS 是客户端唯一产品 API。
- 不存在 Prisma 和 SQLAlchemy 同时拥有的业务实体。

### 回滚

Catalog 保留原始来源和制品，可重新导出为 `SKILL.md`；旧 Resolver 在一个版本周期内保持只读兼容。

## 7. Phase 4：引入持久化 Run Engine

目标：执行生命周期脱离 HTTP/SSE 连接。

### 当前进度（2026-09-15）

**底层引擎已落地（Phase 4 工作项 1–8，见 `worker-design-reference.md` §6）**：

- [x] 新增 `AgentRun`、`RunEvent`、`RunStep`、`RunApproval`、`RunArtifact`、`OutboxEvent` 持久化模型及扩展式数据库迁移。
- [x] 建立 create/get/cancel API，包含用户隔离与幂等创建。
- [x] Run 快照与事件在写入和返回前均通过 contracts 运行时校验。
- [x] 已覆盖创建、重复请求、越权读取、取消和事件序列测试。
- [x] Run 创建与 Outbox 消息已在同一数据库事务中提交。
- [x] Worker 独立进程（Nest 子应用）+ 租约心跳、`FOR UPDATE SKIP LOCKED`、确认和延迟重试。
- [x] **模型调用迁入 Run**：run_steps 表（model_call/tool_call/approval/artifact 四类），模型网关（AI SDK / Sim），崩溃后续跑复用 started 步骤。
- [x] **断线订阅恢复**：SSE 订阅 RunEvent，支持 `Last-Event-ID` / `after` 序列续读，终态 `done` 关闭。
- [x] **幂等工具调用与失败分类**：同幂等键不重复执行；终态错误不重试，可重试错误退避回队列。
- [x] **审批与交互续跑**：run_approvals 审批门（waiting_for_approval），approved 后从检查点重投同一 toolCall 续跑，rejected 终态不投递。
- [x] **最小工具循环（Agent Loop）**：模型 tool_use → 提交 outbox `tool.requested`（幂等）→ 工具执行后重投 `run.requested` 续跑，多轮往返直到模型输出无工具；`WORKER_MAX_TURNS` 上限；SIM 冒烟 12/12 + 真实 qwen3.8-max 完整循环（含瞬时失败退避重试自愈）PASS。
- [x] **优先级三档调度**：critical/interactive/background 按 priorityRank + createdAt 出队。
- [x] **egress allowlist**：默认拒绝的出站白名单，未白名单域请求被拒绝并可审计。
- [x] **artifact 存储分离**：大产物写 ArtifactStore（本地对象存储），数据库只存引用。
- [x] 崩溃恢复冒烟 PASS（Worker 处理中断后重启续跑）；优先级、审批、egress、artifact 四组真实 DB 冒烟 PASS；全量 72 单测通过。

**剩余尾项（客户端切换与治理）**：

- [~] Web 聊天正式全面切换到 Run API：后端 Run 驱动已就绪（`CHAT_USE_RUN=true` 时 POST /api/chat 创建 AgentRun 并订阅 run events 转译 AI SDK 协议，前端零改动）；工具循环已落地（SIM 12/12 + 真实模型验证），但批量冒烟存在约 10–15% 偶发「工具完成未续跑」样本（Run 仍 succeeded，见 worker-design-reference §7.2 待查项），**生产默认切换前需先锁定该路径**；端到端 SIM 冒烟 PASS。
- [ ] Desktop、CLI、IM 统一接入 Run API（复用 Web 切换契约：create → /events SSE → approve/decide → retry/resume）。
- [x] 提供明确的 resume/retry 产品 API（`POST /api/runs/:id/retry`、`POST /api/runs/:id/resume`；requeueRun 事务：状态校验 + queued + run.status_changed 事件 + 幂等投递 run.requested）。
- [~] 清除旧 `Session.activeJobId`、`lastCheckpoint`：字段已删除并落库（迁移 20260915000004，全仓零引用）；旧 ApprovalRequest 与新 RunApproval 双轨合并待 Web 全面切换、旧聊天链路退役后删除 ApprovalRequest 模型/表。
- [~] 补充重启恢复、重复投递、审批超时的系统级验证：Run 引擎端到端冒烟（create→worker 消费→succeeded、failed→retry→重跑 succeeded、resume 非法状态拒绝）PASS；崩溃恢复沿用 Phase 4 单场景冒烟；审批超时/重复投递专项纳入「生产治理」章节待补。
- [ ] 执行器按会话/用户 feature flag 切换。

### 数据扩展

建议新增：

- `AgentRun`
- `RunStep`
- `RunEvent`
- `RunCheckpoint`
- `Artifact`
- `OutboxEvent`

现有 `Session.activeJobId` 和 `lastCheckpoint` 在迁移完成后由 Run 关系替代。

### 工作项

- 创建 Run API：create、get、cancel、resume、retry。
- 实现 PostgreSQL 状态机和 Outbox。
- 引入 Redis 队列与 Worker 租约。
- 先将纯文本模型调用迁入 Run。
- 再迁移只读工具、写工具、审批和交互式询问。
- SSE/WebSocket 改为订阅 RunEvent，支持 `lastEventId`/sequence 恢复。
- 增加幂等工具调用和失败分类。
- 增加进程重启、重复投递、审批超时和断线重连测试。

### 验收标准

- 创建 Run 后关闭浏览器，任务仍能继续。
- Gateway 或 Worker 重启后，没有 Run 无声丢失。
- 相同幂等键不会重复创建外部写操作。
- 用户可取消等待或运行中的任务。
- 审批后从明确检查点继续。

### 回滚

按会话或用户使用 feature flag 切换新旧执行器；迁移期 RunEvent 可投影为旧聊天流格式。

## 8. Phase 5：引入 Space 数据边界

目标：为统一品牌下的 Code、Work、Life 提供真正的数据和治理隔离。

### 数据迁移顺序

1. 新增 `Space`、`Membership`、`Identity`、`PolicySet`、`ContextGrant`。
2. 创建现有组织的默认 Work Space。
3. 根据会话工作区/仓库信息识别 Code 数据；无法识别的保留在 Work。
4. 为现有 Conversation、Run、SkillInstallation、Connection、KnowledgeProject 增加可空 `spaceId`。
5. 回填并验证所有记录。
6. 应用层切换为强制 Space 查询。
7. 将 `spaceId` 改为非空并增加组合索引。
8. 最后开放 Life Space 创建。

### 工作项

- 在请求上下文中解析 `accountId`、`identityId`、`spaceId`。
- Repository 层自动要求 Space 范围，避免遗漏过滤条件。
- 按 Space 配置模型、连接、Skill、记忆和数据保留策略。
- 实现显式 ContextGrant 和跨 Space 预览。
- 增加越权测试：ID 猜测、跨 Space 查询、附件 URL、事件订阅和工具凭证。

### 验收标准

- 任意查询都不能通过修改 ID 读取其他 Space 数据。
- Life Space 默认看不到 Work/Code 记忆、连接和文件。
- 跨 Space 使用在执行前展示来源和范围，执行后可审计、可撤销。

### 回滚

新增字段采用扩展式迁移；在 `spaceId` 变为非空前可回退读取逻辑。开放 Life Space 后不得回滚为混合数据域。

## 9. Phase 6：统一客户端体验

目标：在底层边界稳定后呈现 Code、Work、Life 融合体验。

### 工作项

- 增加全局 Space Switcher 和清晰的当前身份提示。
- 三类 Space 使用共享 Shell，不复制聊天与任务组件。
- Code 增加仓库、终端、Diff 和 Review 投影。
- Work 增加项目、文件、流程和团队投影。
- Life 增加个人记忆、日程和隐私控制投影。
- 对跨 Space 操作提供来源、目的地和授权确认界面。
- 统一 Artifact Viewer，替代按场景增长的临时预览组件。

### 验收标准

- 用户始终能辨认当前 Space 和身份。
- 切换 Space 不会隐式携带输入附件、连接或上下文。
- Web 与 Desktop 行为一致；CLI 可显式选择 Space。

## 10. Phase 7：生产安全与运营闭环

### 工作项

- 生产配置 fail-fast，移除默认密钥和密码。
- 引入 Secret/KMS 适配器和凭证轮换。
- 加固 SSO 可信代理边界。
- 建立 Run、模型、工具、队列和审批指标。
- 建立数据删除、导出、保留和审计策略。
- 对模型供应商和 MCP 连接执行数据等级策略。
- 建立备份恢复演练和故障手册。

### 验收标准

- 安全配置缺失时生产服务无法启动。
- 可回答某次工具写操作由谁、在哪个 Space、因何授权、使用了什么输入。
- PostgreSQL、对象存储和队列故障均有经过验证的恢复流程。

## 11. 建议里程碑

不按固定日历承诺，按可验证结果推进：

| 里程碑 | 包含阶段 | 可交付结果 |
| --- | --- | --- |
| M1 可开发 | Phase 0 | 主分支可重复构建和验证 |
| M2 可演进 | Phase 1–2 | Contract 单一、编排职责拆分 |
| M3 可运行 | Phase 3–4 | Skill 收敛、任务可恢复 |
| M4 可融合 | Phase 5–6 | Code/Work/Life 安全共存 |
| M5 可生产 | Phase 7 | 安全、审计、运维闭环 |

## 12. 第一批开发任务

Phase 0 通过后，按以下顺序创建实现任务：

1. `contracts: scaffold @ocean/contracts and migrate generative UI schema`
2. `runtime: extract model registry from SkillOrchestrator`
3. `runtime: introduce context assembler and prompt composer`
4. `runtime: unify MCP and RPC tool descriptors`
5. `policy: route all tool calls through PolicyEvaluator`
6. `skills: define catalog/runtime boundary and version identity`
7. `runs: add Run/Step/Event schema and repository`
8. `runs: add worker lease and event stream projection`
9. `spaces: add Space schema and backfill existing data`
10. `security: enforce production configuration validation`

每项任务必须附带测试、迁移说明和完成标准，不以“代码已写完”作为完成定义。
