# Ocean v2 架构决策记录

状态：Accepted

更新时间：2026-09-14

确认日期：2026-09-14

本文件记录会影响多个模块、迁移成本较高的决策。决策确认后将状态改为 `Accepted`；若将来被替代，保留原文并标记 `Superseded`。

## ADR-001：统一产品下采用 Code、Work、Life Space

状态：Accepted

### 背景

Ocean 原定位集中在银行内网研发和企业工作流。产品下一阶段计划融合个人生活场景。如果只增加页面或 Prompt，工作身份、个人身份、组织数据和私人记忆会落入同一会话模型，无法形成清晰的隐私与授权边界。

### 决策

- Ocean 使用统一产品、统一账号和统一 Agent Runtime。
- Code、Work、Life 建模为一级 `Space`。
- 会话、记忆、连接、Skill 安装、知识库和 Run 必须归属 Space。
- 跨 Space 数据访问默认拒绝，只能通过用户可见的限时授权开放。

### 后果

- 用户可在统一体验中切换场景。
- 数据模型和所有查询需要增加 `spaceId`。
- Life 不能直接继承 Work 的工具授权和记忆。
- 现有 Ocean 数据需要迁移到默认 Work 或 Code Space。

## ADR-002：采用模块化单体加异步 Worker

状态：Accepted

### 背景

当前系统已包含 NestJS、FastAPI、多个 MCP Server、CLI 与前端。如果进一步按功能拆成微服务，会增加部署、鉴权、协议版本和故障排查成本；但长时间 Agent 任务又不适合完全运行在 HTTP 请求进程中。

### 决策

- NestJS Gateway 保持模块化单体，作为唯一控制平面。
- 新增独立 Agent Worker 执行持久化 Run。
- Python 作为计算 Worker，不作为第二个控制平面。
- MCP Server 保持进程隔离，因为它们天然是协议边界和外部系统适配器。

### 后果

- 领域事务仍可在一个数据库内完成。
- 长任务可以独立伸缩和恢复。
- 需要定义 Run Job Contract、租约和事件投递机制。
- 暂不获得微服务级独立部署，但避免过早复杂化。

## ADR-003：Agent 执行采用持久化 Run 状态机

状态：Accepted

### 背景

当前聊天请求通过 SSE 直接驱动模型和工具。连接中断、进程重启、审批等待或长任务执行时，HTTP 生命周期无法作为可靠执行边界。

### 决策

- 用户提交消息后创建 `Run`，由 Worker 异步领取。
- 每个模型调用、工具调用、审批和产物生成记录为 `RunStep`。
- 每次可观察变化追加 `RunEvent`。
- SSE/WebSocket/IM 是事件投影，不拥有执行状态。
- 写操作使用幂等键；状态变更与事件采用事务或 Outbox。

### 后果

- 支持暂停、审批、恢复、取消、重试和断线重连。
- 简单对话比同步请求多一次入队开销。
- 需要清晰定义事件顺序、重放窗口和产物存储。

## ADR-004：Skill Catalog 与 Skill Runtime 分离

状态：Accepted

### 背景

当前文件系统 Skill、数据库 Registry、NestJS SkillLoader 与 Python Resolver 均承担部分 Skill 职责，容易出现版本和行为不一致。

### 决策

- `SkillCatalog` 管理元数据、版本、安装、发布和来源。
- `SkillRuntime` 负责解析已安装版本、匹配候选 Skill、装载指令和资源。
- 数据库记录已安装的精确版本和内容摘要。
- `SKILL.md` 是可移植制品格式，可导入导出，但运行时必须解析为版本化记录。
- Skill 只能通过 ToolRuntime 和 PolicyEvaluator 使用能力。

### 后果

- Skill 可追踪、可回滚、可审计。
- 需要迁移现有路径和数据库记录。
- Python Skill Resolver 在迁移后删除或降级为无状态计算组件。

## ADR-005：NestJS 是控制平面，Python 是计算平面

状态：Accepted

### 背景

NestJS 和 FastAPI 当前同时包含知识库、Skill 和音频相关接口及数据访问，形成重复模型和双写风险。

### 决策

- 对客户端暴露的产品 API 只由 NestJS 提供。
- Space、用户、Skill、知识库、Run 和权限由 NestJS 领域模块拥有。
- Python 仅执行文档解析、Embedding、OCR、音视频等任务。
- NestJS 通过版本化异步 Job 调用 Python；业务结果由控制平面确认并持久化。

### 后果

- API 和数据库所有权清晰。
- 计算任务不再阻塞请求。
- 需要迁移 FastAPI 现有路由调用，并清理 SQLAlchemy 与 Prisma 的重叠模型。

## ADR-006：跨端协议统一到 `@ocean/contracts`

状态：Accepted

### 背景

Generative UI 等类型在共享核心和 UI 包中重复维护，且已经发生差异。聊天流协议升级也会同时影响 Gateway、Web 和 Desktop。

### 决策

- 创建无框架依赖的 `@ocean/contracts`。
- 使用 Zod 定义 API DTO、Run Event、Tool、Skill 和 Generative UI schema。
- TypeScript 类型从 schema 推导。
- 跨进程协议必须带版本，消费者对未知字段保持兼容。

### 后果

- 协议变化可在编译期和运行时验证。
- 需要逐步替换现有重复类型。
- Contract 不得依赖 Prisma 模型或 UI 组件。

## ADR-007：Redis 不作为权威业务数据源

状态：Accepted

### 背景

Ocean 部署了 Redis，但尚未形成明确职责。将 Run 状态只保存在 Redis 会降低可恢复性与审计能力。

### 决策

- PostgreSQL 保存 Run、Step、Event、审批和审计的权威状态。
- Redis 用于队列、租约、限流、短期缓存和实时事件通知。
- Redis 丢失不能导致已确认业务状态丢失。

### 后果

- 恢复和审计更可靠。
- 高频事件需要批量写入或合理留存策略。

## ADR-008：生产配置采用 fail-fast 安全策略

状态：Accepted

### 背景

当前开发配置存在默认 JWT、数据库和中间件密码。它们便于本地启动，但不符合银行内网或个人隐私产品的生产承诺。

### 决策

- 生产环境禁止使用源码内默认密钥和默认密码。
- 外部系统凭证使用信封加密，密钥与数据库分离。
- SSO Header 只接受可信代理注入，并验证代理身份或签名。
- 启动时验证关键配置；验证失败即拒绝启动。

### 后果

- 部署流程必须接入 Secret 管理。
- 本地开发通过独立 compose/dev profile 保留低门槛体验。

## ADR-009：Web 采用 Next.js App Router 与 Server Components

状态：Accepted

### 背景

原 Web 是 Vite SPA，路由、首屏和数据获取全部落在浏览器端。Ocean 需要可组合的服务端页面边界、渐进式渲染和更明确的服务端/客户端职责，同时 Desktop 仍需复用交互 UI。

### 决策

- `apps/web` 使用 Next.js App Router，layout 与 page 默认保持 Server Component。
- 浏览器状态、事件处理和交互式共享 UI 通过最小的 `use client` 入口接入。
- `packages/ui` 保持跨 Web/Desktop 的客户端视图层，不引入 Next.js 专属 API。
- Web 导航通过适配端口注入共享 UI；Desktop 可继续使用 React Router。
- Gateway 仍是业务控制平面；Next.js 只承担 Web 渲染、路由和 BFF 转发，不复制领域规则。
- 生产部署使用 Next.js standalone Node 运行时，不采用静态导出，以保留 Server Components 能力。

### 后果

- 页面可逐步把只读数据获取与静态内容迁到服务端，减少客户端 JavaScript。
- Web 与 Desktop 的环境边界更清楚，但共享组件必须避免直接依赖任一端的路由实现。
- 需要 Node Web 运行时替代原 Nginx 静态容器，并配置 `OCEAN_GATEWAY_URL`。
