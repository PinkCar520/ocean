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

- [x] 提取 `ModelRegistry`，统一供应商配置和模型能力描述。
- [x] 提取 `PromptComposer` 与 `ContextAssembler`。
- [x] 提取 `ToolRuntime`，统一 MCP 与本地 RPC 工具表示。
- [x] 提取 `PolicyEvaluator`，让所有工具调用经过同一权限入口。
- [x] 提取 `SkillResolver`，暂时适配现有 SkillLoader/Registry/FastAPI。
- [x] 为每项服务建立单元测试（runtime 6 模块 25/25 通过）。
- [x] 将 `SkillOrchestrator` 变为兼容门面，不再直接访问 Prisma、文件系统或第三方 API（残留：generateSkill 读 SystemConfig 与旧直驱 fallback，均为有意保留）。

### 验收标准

- 现有 Web 聊天、显式 Skill、自动 Skill、MCP 调用和审批行为不变。
- `SkillOrchestrator` 仅组织服务调用，不包含供应商与持久化实现。
- 模型和工具模块可在不启动 Nest 应用的情况下单测。

### 回滚

兼容门面可临时切回旧实现；新服务按能力逐项启用。

## 6. Phase 3：统一 Skill 与 Python 边界

目标：消除重复事实来源和双控制平面。

### 当前进度（2026-09-15）

第 4 条「收敛 FastAPI 为纯计算 Worker」已完成主体：

- [x] `SkillResolver` 本地化：不再 HTTP 代理 FastAPI。显式 + 关键词匹配全部本地（Prisma），Embedding 语义兜底调 Python 无状态 Job（`POST /api/internal/embedding`），`<injected_skills>` 组装与 `SkillTriggerLog` 落库保持原格式不变；失败静默降级语义不变。单测 6/6，真实 DB 冒烟（关键词 / 显式双路径命中 + 触发日志）PASS。
- [x] `generateSkill` 本地化：`SkillOrchestrator.generateSkill` 不再代理 FastAPI，改为读 `SystemConfig('skill_creator_prompt')` + 直调配置的 LLM provider（OpenAI 兼容 `/chat/completions`，JSON 模式）。真实模型（dashscope/qwen3.8-max）冒烟 PASS。
- [x] FastAPI 收敛为无状态计算服务：删除 `models.py` / `database.py` / `schemas.py` 与 `routers/knowledge_projects.py` / `routers/skills.py`（业务 ORM 全部退役）；`main.py` 仅挂 `audio`（Whisper 转写）与 `embedding`（向量计算）两个 Job 路由；`embedding.py` 读取 provider env（`DEFAULT_AI_PROVIDER` + `{P}_API_KEY/BASE_URL`，回退 `OPENAI_*`）；requirements 移除 SQLAlchemy/psycopg2/pgvector。docker-compose 中 fastapi-backend 不再注入 `DATABASE_URL`、不再依赖 postgres。
- [x] NestJS 唯一产品 API 已确认：知识项目 CRUD（`KnowledgeProjectController`）、Skill 目录/安装/生成（`skill-registry`）均已在 NestJS；`KnowledgeProjectController` 与旧 FastAPI 路由完全重叠，旧实现已删除。
- [x] 后续项收尾：Skill 版本化（SkillVersion 加 version/changelog + SkillInstallation version 快照 + upgrade/rollback API + 审计，真实 DB e2e 通过）；FastAPI 健康检查与部署文档（`docs/architecture/v2/fastapi-worker.md`）。Embedding 已切换 `qwen3.7-text-embedding`（真实可用，显式 1536 维匹配 pgvector；新模型含 100 万 token 免费额度），SkillSync 内容变化自动刷新技能向量，语义检索真实命中（fix-bug 0.66 / jenkins 0.65）。

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

- [x] Web 聊天正式全面切换到 Run API：**`CHAT_USE_RUN` 默认开启**（可 `=false` 显式回退旧直驱）；真实模型端到端验收通过——POST /api/chat（SSE）→ 创建 AgentRun → worker 工具循环（model_call→tool→回喂→续跑）→ run succeeded → output_delta 转译 `0:` 行输出「已调用 echo 工具…」，HTTP 200；期间修复 chat→Run 的 dbId 归属断裂（SkillContext 增 dbId，Run 链路以 DB 标识为准，listEvents 同源）。
- [x] Desktop、CLI、IM 统一接入 Run API：
  - Desktop：与 Web 共享 `packages/ui` 的 ChatSession（`useChat api:'/api/chat'`），随 Web 切换零改动即走 Run。
  - IM：UpChat webhook 改走 Run——sender 经 `syncUserFromSso` + `ensureMembershipIfMissing(work)` 后 `runToText`（创建 run → 轮询事件至终态 → 拼接输出），真实报文 e2e 通过（run succeeded + 工具循环）。
  - CLI：`--gateway` 单轮模式走统一 Run 链路（`runChatLoopViaGateway` SSE + API key），真实模型 e2e 通过（echo 工具 + 流式回显）；交互 REPL 保留本地直连（定位使然，文档注明）。
- [x] 提供明确的 resume/retry 产品 API（`POST /api/runs/:id/retry`、`POST /api/runs/:id/resume`；requeueRun 事务：状态校验 + queued + run.status_changed 事件 + 幂等投递 run.requested）。
- [x] 清除旧 `Session.activeJobId`、`lastCheckpoint`：字段已删除并落库（迁移 20260915000004，全仓零引用）；旧 ApprovalRequest 与新 RunApproval 双轨合并待 Web 全面切换、旧聊天链路退役后删除 ApprovalRequest 模型/表（条件未满足：CHAT_USE_RUN=false 旧直驱 fallback + generate-title 仍在）。
- [x] 补充重启恢复、重复投递、审批超时的系统级验证：真实 worker e2e 全通过——worker 停机积压→重启自动消费 succeeded；failed→retry→重跑 succeeded；paused→resume→succeeded；审批 approve（waiting→decide→工具续跑→succeeded）/deny（→cancelled）/超时（过期 decide→expired+cancelled，新实现 24h TTL）；重复投递幂等此前由双消费根因场景（12/12）覆盖。
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

### 进度（2026-09-15）

**已完成（迁移 `20260915000005_add_space_boundary`，代码未含于提交 `ef44130` 之后的下一次提交中）：**

1. ✅ 新增 `Space`、`Membership`、`Identity`、`PolicySet`、`ContextGrant` 五个域模型。
2. ✅ 种子默认 Work Space（id=`work`，人工可读）；现有用户自动获得 owner Membership。
3. ✅ `sessions` / `knowledge_projects` / `skill_installations` / `mcp_servers` 增加可空 `spaceId` + FK（onDelete SetNull）+ 索引；`agent_runs` 增加 `space` FK（onDelete RESTRICT）。
4. ✅ 现有业务数据回填到默认 Work Space（sessions=1、knowledge_projects=1、skill_installations=3、mcp_servers=0）并验证。
5. ✅ 新增 `SpaceService`（`requireSpace`→404 / `assertAccess`→403 / `requireAccessibleSpace`）+ `@Global` SpaceModule。
6. ✅ 应用层强制：SessionService（列表/创建按 spaceId 过滤 + 访问校验）、KnowledgeProjectController（CRUD 全部限定 Work Space，删除用 `deleteMany` 防跨 Space 越权）、RunService.create（创建前校验 Space 存在且用户可访问）、chat.service 默认 space `'default'`→`'work'`。
7. ✅ 验证：全量单测 117/117 PASS（含 SpaceService 7 项新测试）；真实 DB 冒烟——成员访问通过、无 Membership 用户 403、未知 Space 404、Session 创建落库 `spaceId='work'`、Run 越权创建被拒。
8. ✅ `spaceId` 当前仍为可空（迁移计划要求回填验证后再转非空）。

**待办（下一轮）：**

- [x] 跨 Space 越权测试扩展：附件 URL、事件订阅、工具凭证（MCP env）三类新增断言，`scripts/test-space-isolation.cjs` 19/19 真实 DB 通过。
- [x] Life Space 产品流程接入：Space Switcher 菜单「创建生活空间」入口（无 life 时显示）→ `POST /api/spaces/life` → 列表追加 + 自动切换；与原「当前 Space 不存在时自动创建」双保险。

**Phase 5 收口（2026-09-15 第三次提交）**：
- ✅ 迁移 `20260915000006_finalize_space_boundary`：`documents` 加 `spaceId` 并回填（project 归属 → project.spaceId，否则 work）；5 表 `spaceId` 转非空；FK 语义 SetNull → Restrict（与 NOT NULL 对齐，Space 删除需显式迁移数据）；组合索引 `documents_spaceId` / `sessions_userId_spaceId` / `skill_installations_userId_spaceId`。
- ✅ Document 层强制：create 落库 work，getDocuments/delete/getStats 全部限定 work，删除改 `deleteMany` 防跨 Space。
- ✅ Run spaceType 一致性：`create` 不再信任客户端 type，以 Space 表为准。
- ✅ Life Space：`SpaceService.ensureLifeSpace`（幂等，id=`life-<userId>`，本人 owner）+ `listSpaces` + `SpaceController`（`GET /api/spaces`、`POST /api/spaces/life`）。
- ✅ 越权集成测试固化：`scripts/test-space-isolation.cjs` 13 项断言（Membership 403、Session/MCP/Document 跨 Space 读 null/删 404、未知 Space 404、spaceType 覆盖、Life 幂等），自动清理。
- ✅ 验证：单测 121/121、typecheck、build；集成测试 13/13 真实 DB 通过。

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

### 进度（2026-09-15，6a 已交付）

**已完成（6a：Space Switcher + 会话按 Space 投影）：**

- ✅ 后端：`GET /api/sessions?spaceId=` / `POST /api/sessions {spaceId}` 透传；`getSessions` 返回 `spaceId` 字段（前端按 Space 过滤依据）。
- ✅ `useConversations` 支持 `spaceId` 选项：新建会话归属当前 Space（服务端 + 乐观更新均带 spaceId）。
- ✅ 新组件 `SpaceSwitcher`：当前 Space 徽标 + Code/Work/Life 切换菜单；`activeSpaceId` 持久化 localStorage。
- ✅ App Shell：主区域顶部 Space 切换条 + 当前身份提示；侧边栏会话列表与 AllChats 按当前 Space 过滤（历史无 spaceId 会话视作 Work）；切换到不存在 Space 时自动创建 Life（`POST /api/spaces/life`）。
- ✅ 验证：gateway 单测 121/121、隔离集成套件扩展至 15 项断言全过（含 getSessions 返回 spaceId、createSession 指定 Space 落库）；web typecheck + build 通过。

**已完成（6b：聊天消息归属当前 Space）：**

- ✅ chat.controller：Run 归属 Space 解析——会话归属优先（`session.spaceId`，防越权：A Space 的会话消息不可落到 B Space），无会话时按 body.spaceId（默认 work）。
- ✅ chat.service `runChatStream`：`ctx.spaceId` 透传至 Run 创建（不再硬编码 work）。
- ✅ 前端链路：`useChatSession`/`ChatSession` 增加 `spaceId` 选项，`/api/chat` 请求体携带当前 Space；App Shell 传入 `activeSpaceId`。
- ✅ 验证：gateway 单测 123/123（新增 spaceId 透传用例）、build；web typecheck + build 通过。

**已完成（6c：Code 投影——仓库 / Diff / Review）：**

- ✅ 数据模型：`CodeRepository` / `CodeDiff` / `CodeReview`（归属 Code Space，FK Restrict/Cascade）；迁移 `20260915000007_add_code_projection` 建 3 表 + 种子 `code` space + 全部现有用户 owner membership。
- ✅ 后端 API：`CodeService`（guard 强制 Code Space 访问）+ `CodeController`——`GET /api/code/overview`、`GET/POST /api/code/repositories`、`GET /api/code/repositories/:id/diffs`、`POST /api/code/diffs/:id/reviews`（幂等：同 reviewer 重复决策更新而非新建）。
- ✅ 前端：`CodeProjection` 组件（统计卡 + 仓库/Diff/Review 列表 + 通过/需修改决策按钮）；App Shell 在 Code Space 下主区域切换为 Code 投影。
- ✅ 验证：gateway 单测 128/128（CodeService 6 例含跨 Space Forbidden）、build；web typecheck + build；真实 DB 冒烟（建仓库→Diff→Review 幂等→列表→overview→outsider Forbidden→自动清理）。
- ⚠️ 注意：迁移种子 `INSERT ... SELECT FROM users` 会给**当时存在的所有用户**加 Code membership；冒烟越权用例的 outsider 必须在此之后创建，否则会被回填污染。

**已完成（6d：Work 投影——项目 / 任务流转）：**

- ✅ 数据模型：`WorkProject` / `WorkTask`（归属 Work Space，FK Restrict/Cascade）；迁移 `20260915000008_add_work_projection`。
- ✅ 后端 API：`WorkService`（guard 强制 Work Space）+ `WorkController`——`GET /api/work/overview`、`GET/POST /api/work/projects`、`GET/POST /api/work/projects/:id/tasks`、`PATCH /api/work/tasks/:id`（状态流转/改派）。
- ✅ 前端：`WorkProjection` 组件（统计卡 + 项目/任务列表 + 新建项目/任务 + 开始/完成/阻塞流转）；挂到 Sidebar 原占位的 Workflows 入口。
- ✅ 验证：gateway 单测 134/134（WorkService 6 例含跨 Space Forbidden）、build；web typecheck + build；真实 DB 冒烟（项目→任务→in_progress→done→overview→outsider Forbidden→自动清理）。

**已完成（6c 尾项：Code 终端投影）：**

- ✅ 数据模型：`TerminalSession` / `TerminalCommand`（归属 Code Space；repo FK SetNull、command FK Cascade；命令带 exitCode/durationMs）；迁移 `20260915000009_add_terminal_projection`。
- ✅ 后端 API：`GET/POST /api/code/terminals`、`GET /api/code/terminals/:id`、`POST /api/code/terminals/:id/commands`（记录型：真实执行留给 CLI/Desktop；关闭会话再执行自动重开）。
- ✅ 前端：CodeProjection 增加终端会话区块（最近命令历史 + exitCode 徽标）。
- ✅ 验证：gateway 单测 137/137（终端 3 例：归属/自动重开/NotFound）、build；web typecheck + build；真实 DB 冒烟（建会话→命令→列表→关闭重开→outsider Forbidden→自动清理）。
- ⚠️ 环境注意：本会话曾两次出现"最新迁移表在建后被移除"的瞬态（psql 应用后表短暂存在，随后冒烟时 TableDoesNotExist）；二分验证常规命令链（typecheck/test/build）不删表，重跑迁移 SQL（幂等）即恢复。冒烟前先 psql 验证表存在。

**已完成（6e：Life 投影——个人记忆 / 隐私控制）：**

- ✅ 数据模型：`LifeMemory`（归属用户专属 Life Space `life-<userId>`）；迁移 `20260915000010_add_life_projection`。
- ✅ 后端 API：`LifeService`（guard 幂等 ensureLifeSpace + 强制本人 Space）+ `LifeController`——`GET/POST /api/life/memories`、`DELETE /api/life/memories/:id`、`GET /api/life/privacy`（ContextGrant 授权 + PolicySet 策略概览）。
- ✅ 前端：`LifeProjection` 组件（记忆列表/添加/标签/删除 + 隐私授权区块：默认零授权=不共享）；App Shell 在 `life-*` Space 下显示。
- ✅ 验证：gateway 单测 142/142（LifeService 5 例含跨 Space Forbidden）、build；web typecheck + build；真实 DB 冒烟（建记忆→列表→隐私→**A 访问 B 的 life space Forbidden**→结构性隔离→自动清理）。
- ℹ️ 语义：访问不存在的 space → 404（不暴露存在性）；存在但无 membership → 403。Life 隔离是结构性的：spaceId 恒为调用者本人 id，API 无法指定他人空间。

**已完成（6f：跨 Space 授权界面 + 统一 Artifact Viewer + 移动端切换入口）：**

- ✅ 后端 Grant 管理：`SpaceService.listGrants/createGrant/revokeGrant` + `SpaceController`——`GET/POST /api/spaces/grants`、`POST /api/spaces/grants/:id/revoke`。createGrant 校验 fromSpace 必须调用者可访问（跨空间授权他人数据 → Forbidden）、toSpace 存在且 ≠ fromSpace；`fromSpaceId` 缺省 = 本人 Life Space（Life 授权 UI 语义）；幂等：同 from/to 未撤销复用并刷新；revoke 仅 fromSpace 成员可操作（软删 revokedAt=now）。
- ✅ Artifact 闭环：`RunService.saveArtifact(runId, userId, name, content)`（归属校验 → ArtifactStore 落盘 → 事务追加 **`artifact.created`** 事件，payload 用 contract `artifactSchema`：kind='run'、contentType='text/plain; charset=utf-8'、uri=`/api/runs/:id/artifacts/:artifactId`）；`RunController POST /api/runs/:id/artifacts`；`chat.service` 把 `artifact.created` 转译为 AI SDK `data:` 行 `{type:'artifact', runId, artifactId, name, uri, contentType}`。
- ✅ 前端：`ArtifactViewer` 组件（`packages/ui/src/components/ArtifactViewer.tsx`，authFetch 鉴权拉取产物内容，按 content-type 渲染文本/JSON/图片）；ChatSession 从 useChat `data` 流解析 `type==='artifact'` 行去重渲染"产物"区块；LifeProjection 隐私面板增加授权表单（新建 Life→目标 Space 授权）+ 撤销按钮；App Shell 移动端 header（md:hidden）加入 SpaceSwitcher。
- ✅ 验证：gateway 单测 142/142（Grant 4 例 + Artifact 3 例）、build；web typecheck + build；真实 DB 冒烟 `scripts/smoke-6f.cjs`（11 断言：缺省 fromSpace=life、幂等复用、列表可见、跨空间 fromSpace 越权 Forbidden、撤销隐藏、artifact 落盘、artifact.created 事件、事件 uri、内容读回、跨用户 saveArtifact 拒绝、smoke 清理）。

**待办（6b+）：**

- [ ] Work 投影：项目、文件、流程、团队（知识库已按 Space 隔离，投影可叠加）。
- [ ] Life 投影：日程（个人记忆与隐私控制已随 6e/6f 落地）。
- [ ] 跨 Space 操作来源/目的地/授权确认界面（ContextGrant 已建模 + 6f 已提供管理 API/UI 入口）。

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

### 进度（2026-09-15，第一批已交付）

**已完成（7a：生产配置 fail-fast + SSO 可信代理边界 + 运行指标）：**

- ✅ 配置 fail-fast：`src/config/env.validation.ts`——NODE_ENV=production 时拒绝缺失/默认/弱密钥：`JWT_SECRET` 禁默认值（`ocean-secret-key-2024` 等弱值集）且 ≥32 字符、`DATABASE_URL` 必填（非 localhost 的默认口令 DSN 视为风险）、按 `DEFAULT_AI_PROVIDER` 校验供应商 key（provider=local 豁免）；main.ts bootstrap 首行调用，违规打印清单并 `process.exit(1)`。单测 8 例 + 真实进程验证（弱配置 exit 1 / 合法 exit 0 / dev 跳过）。
- ✅ SSO 可信代理边界：`src/auth/sso-trust.ts`——CIDR/IP 匹配（精确 IP、/8、/32、/0）；sso.guard 的 SSO 头分支仅在来源命中 `SSO_TRUSTED_PROXY` 时接受，**默认关闭**（未配置则忽略 x-sso-token/x-user-id，防任意客户端伪造身份）；main.ts 设置 `trust proxy`（默认 loopback，反代需显式 `TRUST_PROXY`）。单测 7 例。
- ✅ 运行指标：`src/obs/metrics.service.ts`——OTel Meter（push 到 collector）+ 进程内快照；计数器：`run.created{spaceId}`、`run.terminal{status}`、`tool.executed{tool}`、`approval.requested{toolName}`、`outbox.enqueued{topic}`、`http.requests{method,status}`；注入 RunService/RunRunner/ToolExecutor/ApprovalService/OutboxService + main.ts 全局 HTTP 中间件；`GET /api/metrics` 输出 Prometheus 文本。单测 4 例（计数/标签/Prometheus 格式/引号转义）。

**已完成（7b：审计日志——可回答"谁/哪个 Space/因何授权/什么输入"）：**

- ✅ 数据模型：`AuditLog`（actorUserId/action/spaceId/runId?/toolName?/inputJson?/authorization?/createdAt + 三索引）；迁移 `20260915000011_add_audit_logs`（表已应用+resolve+generate）。
- ✅ `AuditService.record/list`：工具执行前记录 `tool.execute`（含 input 快照 + authorization 依据：approval/auto）；`SpaceService` grant 创建/撤销记录 `grant.created/grant.revoked`（authorization=`grant:<id>`）。查询强制：spaceId 必须调用者可访问（404/403），actorUserId 恒为本人（他人日志不可见），limit 截断 1–200。
- ✅ `GET /api/audit?spaceId=&limit=`（AuditController）。
- ✅ 验证：gateway 单测 165/165（audit 4 例：来源全量、本人可见性、越权拒绝、limit 截断）、build；真实 DB 冒烟 `scripts/smoke-7b-audit.cjs`（10 断言：工具执行落库+来源字段+输入快照+授权依据、grant 双向审计、本人可见/他人不可见、未知 space 拒绝、清理）。

**已完成（7c 第一项：数据导出与账号删除）：**

- ✅ `PrivacyService`：`GET /api/privacy/export`——本人数据 JSON 导出（profile/memberships/sessions/life memories/runs/audits/grants）；`POST /api/privacy/delete-account`（body `confirm='DELETE'` 防误触）——显式清理 Life Space（memory 挂在 space 上，非 user FK）+ 删 membership + 删 user（会话/Run/审计/授权级联清理），共享 Space 保留。
- ✅ 验证：gateway 单测 168/168（privacy 3 例：全 Scope 导出、确认口令拒绝、级联删除顺序）、build；真实 DB 冒烟 `scripts/smoke-7c-privacy.cjs`（10 断言：导出 4 Scope、确认拒绝、user/sessions/memories/audits 级联删除、清理）。

**已完成（7c 收官：备份恢复演练 + 故障手册）：**

- ✅ 备份脚本 `scripts/backup.sh`：pg_dump 自定义格式 + 保留 N 份；自动优先容器内 pg_dump（规避本地/容器版本不匹配）。
- ✅ 恢复演练（2026-09-15 真实执行）：备份 → 临时库 `ocean_restore_test` pg_restore → 44 张表 / 4 用户 / 12 迁移记录与主库一致 → 清理。
- ✅ 故障手册 `docs/architecture/v2/runbook.md`：故障分类响应表、生产配置校验、PG/对象存储/队列恢复流程、Gateway/Worker 重启与幂等恢复、备份恢复步骤（含演练记录）、监控与告警建议。

**Phase 7 验收对照**：
- 安全配置缺失时生产服务无法启动 → ✅ 7a `assertProductionConfig`（真实进程 exit 1 验证）。
- 可回答某次工具写操作由谁/哪个 Space/因何授权/用了什么输入 → ✅ 7b `AuditLog`。
- PostgreSQL/对象存储/队列故障均有经过验证的恢复流程 → ✅ 7c 备份恢复演练（PG 已验证）+ runbook（对象存储/队列恢复流程文档化；对象存储文件级备份与队列故障演练列为后续）。

**待办（Phase 7 收尾可选）：**

- [ ] Secret/KMS 适配器和凭证轮换。
- [ ] 数据保留与归档策略（TTL/归档）。
- [ ] 模型供应商和 MCP 连接数据等级策略。
- [ ] 对象存储文件级备份 + 队列故障演练（手册已文档化，演练待补）。

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


## 工程基线（测试与质量基建）

**已完成（2026-09-15）：**

- ✅ gateway lint：2590 problems（2 errors + 2588 warnings）→ **0 errors + 1446 warnings**（lint 通过、CI 可绿）。修复内容：`lint:fix` 清理全部 prettier 格式债务；修 run-runner.spec.ts 两处 await-thenable（mock onDelta 类型放宽为 `void | Promise<void>`）。剩余 1446 warnings 为代码级类型债务（no-unsafe-member-access 587 / assignment 468 / argument 135 / call 101 / return 49 / require-await 45 等，源于存量 any），保留规则不静默降级。
- ✅ web lint：修 4 errors——CodeProjection/LifeProjection/WorkProjection 的 `react-hooks/set-state-in-effect`（loading 初始值改 true、load 内去除同步 setState、effect 内对 async 加载函数精确豁免）；App.tsx prefer-const + unused eslint-disable。
- ✅ 共享包 scripts 补齐：`packages/ui` 新增 tsconfig.json + `typecheck`（tsc --noEmit），`test` 扩展为 `vitest run`；`apps/cli` 新增 `test`（vitest，git-fs 安全校验 3 例）；`packages/contracts` 修 run.spec 快照缺 priority 字段（schema 必填正确，spec 数据补全）。
- ✅ 全仓 `pnpm run check`（turbo：lint+typecheck+build+test）15/15 全绿。
- ✅ 冻结安装：`corepack pnpm install --frozen-lockfile` 幂等通过。
- ✅ 旧文档债务：`docs/architecture/UClaw_PRD_and_Architecture.md`、`uclaw_architecture_mcp_skill.md`、`docs/PITCH_DECK.md`、`docs/UCLAW_VS_JD_MAPPING.md` 中 React 18 + Vite 表述更新为 Next.js App Router（React 19）。

**已完成（2026-09-16 追加）：**

- ✅ **端到端冒烟 `apps/gateway/scripts/smoke-e2e.cjs`（11 断言）**：真实 DB + 真实模型（DASHSCOPE qwen3.8-max）——创建测试 API key → `/api/spaces` → POST `/api/runs` → worker 消费 → 真实模型生成 → **succeeded**（6 events）→ Web 容器 8081 探活 → CLI dist + `--version` → Desktop out/ 产物存在；跑完自清数据。
- ✅ **E2E 暴露并修复 3 处真实 DI 缺陷**（此前从未以最新代码真实启动过 gateway/worker）：
  1. `AuditService` ↔ `SpaceService` 循环依赖——两处 `spaceService` 注入改 `@Optional()`（查询时缺省跳过空间校验）。
  2. `MetricsService` 未全局提供——新建 `src/obs/metrics.module.ts`（@Global），AppModule 由 providers 改为 imports。
  3. `WorkerModule` 独立模块树缺依赖——显式 import `SpaceModule`/`MetricsModule`/`AuditModule`；worker 由此可真实启动并消费 outbox（本地验证 3 个积压 run 全部 succeeded）。
- ✅ 本地 gateway（PORT=3100）与 worker 真实启动验证通过（docker 3000 为旧镜像，其 worker 因同类 DI 崩溃重启，需 `docker compose up --build` 重建镜像后才消费新代码）。

**待办（工程基线剩余）：**

- [ ] 共享包统一 lint 配置（contracts/ui 目前无 eslint；gateway 独有 flat config）。
- [ ] docker 栈镜像重建（ocean-gateway/ocean-worker 为旧代码，worker 崩溃循环；重建后 e2e 可直连 3000）。
