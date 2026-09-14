# Ocean v2 目标架构

状态：Draft

更新时间：2026-09-14

## 1. 文档目的

本文档定义 Ocean 下一阶段的架构边界，作为 Code、Work、Life 三类场景融合后的开发基线。它不替代产品 PRD，也不规定页面细节；它回答以下问题：

- Ocean 的核心领域对象是什么。
- Agent 如何从一次聊天请求升级为可恢复的任务运行。
- Gateway、Worker、MCP、Skill、客户端分别负责什么。
- Code、Work、Life 如何共享能力而不共享不该共享的数据。
- 新代码应该依赖哪一层，哪些依赖方向被禁止。

## 2. 产品与架构原则

### 2.1 产品模型

Ocean 采用统一产品与统一账号体系，提供三种一级空间：

| Space | 用户目标 | 默认上下文 | 默认治理 |
| --- | --- | --- | --- |
| Code | 创建、修改、验证和交付软件 | 仓库、终端、Issue、CI/CD | 沙箱、变更确认、代码审查 |
| Work | 创建办公成果、执行业务流程 | 组织、项目、文件、协作系统 | 组织权限、审批、审计 |
| Life | 管理个人生活、兴趣、健康和陪伴 | 个人记忆、日程、设备、内容 | 隐私优先、最小授权、显式跨域 |

Space 不是 UI 标签，而是身份、数据、权限、记忆和执行策略的安全边界。

### 2.2 架构原则

1. **模块化单体优先**：控制平面保持一个 NestJS 应用；只有需要独立伸缩或 Python 生态的计算任务进入 Worker。
2. **持久运行优先**：Agent 的生命周期属于 `Run`，不属于某个 HTTP/SSE 连接。
3. **单一事实来源**：每类数据只有一个权威存储和一个领域所有者。
4. **协议先于实现**：客户端、Gateway、Worker、MCP 之间通过版本化 Contract 通信。
5. **能力共享，数据隔离**：三个 Space 可共享模型、Skill 和工具协议，但授权、记忆和数据默认隔离。
6. **高风险动作可解释**：每次工具调用都可追踪到用户、Space、Run、权限决策和审批记录。
7. **渐进迁移**：新旧链路允许短期并存，但每个兼容层必须有删除条件和截止阶段。

## 3. 目标系统上下文

```text
Web / Desktop / CLI / IM
             │
       HTTP + Realtime API
             │
┌────────── Ocean Control Plane ──────────┐
│ Identity & Space                        │
│ Conversation & Artifact                 │
│ Skill Catalog & Connection              │
│ Policy & Approval                       │
│ Agent Run API                           │
└──────────────────┬──────────────────────┘
                   │ Run commands/events
┌──────────────────▼──────────────────────┐
│ Agent Runtime                           │
│ Run Engine · Context · Model · Tools    │
│ Memory · Checkpoint · Event Publisher   │
└──────────┬───────────────┬──────────────┘
           │               │
      MCP Servers     Python Workers
           │               │
  GitLab/Jenkins/...  Parse/Embed/Audio

PostgreSQL：权威业务数据、Run 状态、审计
Redis：队列、租约、短期事件分发；不是权威数据源
Object Storage：附件、制品和大型工具输出
OpenTelemetry：跨进程 Trace、Metrics、Logs
```

## 4. 核心领域模型

### 4.1 Identity 与 Space

```text
Account
├── Identity[]          # 个人身份、企业身份、设备/API 身份
└── Membership[]
    └── Space
        ├── PolicySet
        ├── Connection[]
        ├── SkillInstallation[]
        ├── Conversation[]
        ├── Memory[]
        └── Run[]
```

约束：

- `Conversation`、`Run`、`Memory`、`Connection` 必须拥有 `spaceId`。
- 企业 Space 通过 Membership 和角色授权；Life Space 默认只有本人。
- 跨 Space 读取必须创建显式 `ContextGrant`，记录来源、范围、用途和有效期。
- 不允许仅凭相同 `userId` 聚合不同 Space 的记忆。

### 4.2 Conversation、Run 与 Artifact

`Conversation` 是交互历史，`Run` 是执行实例，二者不可混为一体。

```text
Conversation
└── Message[]
    └── Run[]
        ├── RunStep[]
        ├── RunEvent[]
        ├── ApprovalRequest[]
        ├── Checkpoint[]
        └── Artifact[]
```

建议状态：

```text
queued → running → completed
             ├── waiting_input → running
             ├── waiting_approval → running
             ├── failed → queued (retry)
             └── cancelled
```

关键不变量：

- 状态变更和事件写入应在同一事务中完成，或使用 Transactional Outbox。
- 工具写操作必须携带稳定的 `idempotencyKey`。
- SSE、WebSocket 和 IM 只订阅 `RunEvent`，断线不会终止 Run。
- 大型输出存入 Artifact，事件只保存引用和摘要。

## 5. 模块边界

### 5.1 Control Plane（NestJS）

建议按领域而非技术名拆分模块：

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `identity` | 登录身份、API Key、SSO、设备身份 | Space 业务权限 |
| `spaces` | Space、成员、角色、数据域 | 模型调用 |
| `conversations` | 消息树、附件引用、会话视图 | Agent 执行 |
| `runs` | 创建、取消、恢复、查询 Run | 具体模型与工具实现 |
| `skills` | Catalog、版本、安装、解析 | 直接持有会话状态 |
| `connections` | MCP/外部系统连接和凭证引用 | 在控制器中执行第三方 API |
| `policy` | 工具权限、审批规则、跨域授权 | UI 展示逻辑 |
| `knowledge` | 文档元数据、索引任务、检索策略 | Python ORM 副本 |
| `artifacts` | 文件、代码、报告、工具输出元数据 | 在数据库保存大 Blob |

### 5.2 Agent Runtime

运行时拆分为可单测的服务：

- `RunEngine`：状态机、步骤、重试、取消、检查点。
- `ContextAssembler`：按 Space/Run 构造上下文并记录来源。
- `ModelRegistry`：模型配置、能力、路由和降级，不包含业务 Prompt。
- `PromptComposer`：核心指令、Space 策略、Skill 和上下文的确定性拼装。
- `SkillResolver`：解析显式 Skill 和候选 Skill，只返回版本化 Skill 引用。
- `ToolRuntime`：MCP 与本地 RPC 工具的统一发现、校验和执行。
- `PolicyEvaluator`：工具调用前的允许、拒绝、询问判断。
- `EventPublisher`：提交后的 RunEvent 分发。

`SkillOrchestrator` 在迁移完成后删除；过渡期只作为兼容门面调用上述服务。

### 5.3 Python Worker

Python 仅保留具有明确收益的计算任务：

- 文档解析和 OCR。
- Embedding 与批量索引。
- 音视频处理。
- 依赖 Python 专属库的模型任务。

约束：

- Python Worker 不拥有用户、Space、Skill 或知识项目的独立业务模型。
- Worker 通过版本化 Job Contract 接收任务并返回结果。
- PostgreSQL 业务写入由 Control Plane 完成；Worker 只写明确授权的结果表或对象存储。
- 不再同时对外暴露与 NestJS 重叠的产品 API。

### 5.4 Client 与共享 UI

- `packages/ui` 负责纯视图和客户端交互，不拥有后端领域规则。
- Web 与 Desktop 共享 UI，但各自保留环境适配层。
- CLI 与 IM 使用同一 Run API，不再维护独立模型编排器。
- UI 协议、API DTO 和事件类型统一来自 `@ocean/contracts`。

## 6. Contract 与事件

新增 `packages/contracts`，至少包含：

```text
src/
├── identity.ts
├── spaces.ts
├── conversations.ts
├── runs.ts
├── tools.ts
├── skills.ts
├── artifacts.ts
├── events.ts
└── generative-ui.ts
```

Contract 要求：

- 使用 Zod schema 作为运行时边界，并从 schema 推导 TypeScript 类型。
- 所有跨进程消息带 `schemaVersion`。
- 事件包含 `eventId`、`runId`、`spaceId`、`sequence`、`occurredAt`。
- UI 对未知事件和未知 Generative UI 类型必须安全降级。

## 7. 数据、安全与治理

### 7.1 数据分级

每个 Space 配置数据分类和默认策略：

- `public`
- `internal`
- `confidential`
- `restricted`

工具和模型连接声明其可接收的最高数据等级。ContextAssembler 在发送给模型前执行策略检查和脱敏。

### 7.2 凭证

- API Key 只保存不可逆摘要。
- 外部系统 Token 使用 KMS/主密钥信封加密，不与普通业务字段同等处理。
- 生产环境缺失 JWT、数据库和加密密钥时必须启动失败。
- SSO Header 必须由受信反向代理注入，并验证签名或网络身份；不能只判断 Header 是否存在。

### 7.3 审计

审计事件至少覆盖：

- 身份切换与 Space 切换。
- ContextGrant 创建、使用和撤销。
- Skill 安装和版本变更。
- Connection 授权变化。
- 模型调用的数据等级和目标供应商。
- 工具调用、审批决定、重试和取消。

审计日志与普通应用日志分离，业务管理员不可修改。

## 8. 可观测性与可靠性

最低服务目标：

- 每个 Run 拥有端到端 Trace。
- RunEvent 顺序可重放，客户端可从最后 sequence 恢复。
- Worker 使用租约和心跳处理进程失联。
- 重试区分瞬时错误、永久错误和需要用户操作的错误。
- 模型及工具调用记录延迟、错误率、Token/费用和重试次数。

## 9. 依赖方向

允许：

```text
apps → application/domain → contracts
infrastructure → domain interfaces
ui → contracts
workers → job contracts
```

禁止：

- `contracts` 依赖 NestJS、React、Prisma 或具体模型 SDK。
- Controller 直接访问 Prisma 或第三方 API。
- UI 复制一份后端协议类型。
- Skill 直接绕过 PolicyEvaluator 执行工具。
- Python 与 Prisma 各自维护同一业务表模型。
- Space 之间通过共享 `userId` 隐式读取数据。

## 10. 暂不实施

- 不拆分大量独立微服务。
- 不自研通用工作流 DSL。
- 不同时替换数据库、前端框架和部署平台。
- 不在 Run Engine 稳定前建设复杂多 Agent 社会。
- 不为 Code、Work、Life 复制三套 Agent Runtime。
- 不在第一阶段实现自动跨 Space 记忆。

## 11. 架构完成标准

满足以下条件可认为 v2 核心架构完成：

1. Web、Desktop、CLI 和 IM 均通过统一 Run API 执行任务。
2. 服务重启后，处于等待或运行状态的 Run 可恢复或明确终止。
3. Skill、Tool、UI Contract 各自只有一个事实来源。
4. NestJS 与 Python 不再维护重叠的产品 API 和业务模型。
5. 所有 Conversation、Memory、Connection 和 Run 均受 Space 约束。
6. 跨 Space 数据使用有显式授权和审计记录。
7. 仓库存在可重复通过的 check、build 和核心链路集成测试。

