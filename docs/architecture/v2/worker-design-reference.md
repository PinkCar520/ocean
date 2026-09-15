# Gateway Worker 设计参考：借鉴 Claude / Codex 进程模型

> 状态：Draft（供评审）
> 更新时间：2026-09-14
> 上游材料：《AI产品Desktop技术架构调研报告.md》（2026-09-14，五家 AI 产品桌面架构调研）
> 对应计划：docs/architecture/v2/MIGRATION_PLAN.md Phase 4「引入持久化 Run Engine」未完成项

## 1. 目的与阅读对象

本文把调研报告中 **Claude（Claude Desktop / Cowork）** 与 **Codex（app-server）** 两个进程模型展开，映射为 Ocean **Gateway Worker** 的可落地设计参考。面向：Gateway 与 Agent Runtime 相关开发、v2 架构评审。

目标不是复制某一家，而是把两家被生产验证过的决策，翻译成符合 Ocean 约束（NestJS 模块化单体 + Prisma/PG + 内网合规 + 现有 contracts）的取舍。

## 2. Ocean 现状盘点（2026-09-14 已核代码）

### 2.1 已有（Phase 4 前半段）

| 组件 | 现状 | 位置 |
|---|---|---|
| Run 状态机 | `queued/running/waiting_for_approval/waiting_for_input/paused/succeeded/failed/cancelled`，create/get/cancel 带用户隔离与幂等 | `apps/gateway/src/run/` |
| RunEvent | 追加式事件（`sequence` 递增），创建与状态变更落库 | `run.service.ts` |
| Outbox | `run.requested` 主题；`FOR UPDATE SKIP LOCKED` 租约取件（workerId + leaseMs + attempts），processed/failed（退避重试） | `outbox.service.ts` |
| Contracts | `runStatusSchema` / `runEventSchema` / `toolCallSchema` / `approvalSchema` / `leasedRunJobSchema` 严格校验 | `packages/contracts/src/run.ts` |
| 审批 | approval 模块 + interactive.manager（人工断点） | `apps/gateway/src/skill/` |

### 2.2 缺口（Phase 4 未完成项，即本文要补的设计）

1. **无 Worker 进程本体**：没有取件循环、心跳、租约续期、失联回收、优雅退出。
2. **无 RunStep 模型与执行器**：模型调用、工具调用、审批、产物没有步骤化记录与恢复点。
3. **聊天模型调用未迁入 Run**：现有 SSE 直驱链路（`chat/orchestrator.service.ts`）与 Run 并存。
4. **无订阅恢复**：SSE/WS 不支持 `lastEventId`/sequence 断线续读。
5. **无幂等工具执行与失败分类**：`toolCallSchema.idempotencyKey` 已存在但未被执行层使用。
6. **无 checkpoint / resume / retry**。
7. **SecureSandbox 是占位实现**（`packages/shared/sandbox`，TODO 空壳），没有真实 egress 过滤。

## 3. 参照系一：Claude Desktop / Cowork 进程模型

### 3.1 结构解剖

```
┌────────────────────────── 桌面端进程（Host） ──────────────────────────┐
│ Electron 主进程 (Node.js)        Renderer (React/TS, .vite)          │
│   │  IPC: $eipc_message$_<build>_$_<ns>_$_<Bridge>_$_<method>        │
│   ├─ Node-API/napi-rs ──► native addons（跨平台 glue）                 │
│   │     ├─ Rust：跨平台 glue / Windows 主力 / virtiofs daemon          │
│   │     ├─ Swift：macOS 专属（Keychain/Virtualization/热键/托盘）       │
│   │     ├─ C++/ObjC：Squirrel 更新器                                   │
│   └─ agent loop（Claude Code CLI，TS，跑在 host）                     │
└──────────────────────────────────────────────────────────────────────┘
        │ vsock JSON-RPC（CoworkVMRPCClient ↔ sdk-daemon）
        ▼
┌────────────────────────── 本地 Linux VM（Ubuntu 22.04） ──────────────┐
│  - hypervisor：Apple Virtualization / Hyper-V / KVM                    │
│  - 预装 Node 22 / Python 3.10 / uv / PDF 套件                          │
│  - Go 写的 sdk-daemon：文件、进程、网络代理                              │
│  - 只跑 shell 命令与模型写的代码；agent loop 仍在 host                  │
│  网络出口：host 侧 gVisor 过滤，默认 allowlist 仅含                     │
│  npm/pypi/crates/github/ubuntu/anthropic                              │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 可迁移的决策（Claude）

| # | 决策 | 对 Ocean 的意义 |
|---|---|---|
| C1 | **agent loop 与代码执行分离**：loop 在 host，命令/代码进 VM | 执行边界 ≠ 逻辑边界。Ocean 的「规划循环」与「工具执行」不必同进程 |
| C2 | **VM 内只预装受控工具集**（Node/Python/uv/PDF），按需使用 | 工具环境白名单化，而不是给任意 shell |
| C3 | **egress allowlist**（gVisor 过滤 + 域名白名单） | 内网银行场景尤其适用：模型/工具能访问哪些域，由策略显式决定 |
| C4 | **跨语言桥用 JSON-RPC over vsock** | 进程间协议统一为带校验的消息协议，而不是共享内存/全局态 |
| C5 | **更新与运行时版本锁定**（VM 镜像按 revision 缓存） | Worker 执行环境的版本确定性 = 可复现 Run |

## 4. 参照系二：Codex app-server 进程模型

### 4.1 结构解剖

```
React Renderer (atom/signal 细粒度订阅)
   │ preload 窄桥（contextIsolation，关 nodeIntegration）
   ▼
Electron 主进程（窗口/菜单/热键/深链/任务调度）
   │  PTY、SQLite 放 worker_threads（不阻塞主线程）
   │  自带版本锁定的 codex Rust 二进制（不用用户 $PATH）
   ▼
codex app-server（Rust，独立子进程，长期运行）
   ├─ stdio reader → message processor → thread manager → core threads
   ├─ 协议：双向 JSON-RPC 2.0 over stdio（JSONL），也支持 unix socket/WS
   ├─ 原语：thread / turn / item
   │     turn/steer、turn/interrupt、审批请求、command/exec（PTY 级）、fs/*、MCP
   ├─ 请求分级：Critical / Interactive / Background 三档
   └─ 存储分离：UI 状态(Application Support) / agent 运行时(~/.codex, SQLite WAL)
```

### 4.2 可迁移的决策（Codex）

| # | 决策 | 对 Ocean 的意义 |
|---|---|---|
| K1 | **一个统一执行内核驱动所有前端触点**（CLI/IDE/Web/桌面同一 harness） | Ocean 已有 Web/Desktop/CLI 三端，Run Engine 必须是独立于壳层的内核 |
| K2 | **协议原语 thread/turn/item + steer/interrupt** | 比"一次请求一次响应"更适合长任务：可打断、可转向、可恢复 |
| K3 | **请求分 Critical / Interactive / Background 三档** | Worker 内部调度优先级，防止后台任务饿死前台交互 |
| K4 | **PTY 级 command/exec** | 工具执行需要进程级（伪终端）能力，不能只发 HTTP |
| K5 | **协议优先、代码生成类型**（Rust 协议直接生成 TS 类型 / JSON Schema） | Ocean 的 contracts 就是这个思路，继续保持"协议唯一来源" |
| K6 | **存储分离**（UI 状态与 agent 运行时状态分开） | Run 元数据与执行产物（artifact）应分库/分桶管理 |
| K7 | **自带版本锁定二进制** | Worker 运行时由仓库控制版本，不依赖用户环境 |

## 5. 设计建议：Ocean Gateway Worker 目标架构

### 5.1 总体形态：NestJS 模块化单体 + 独立 Worker 常驻进程

- **Worker 作为独立 Node 进程**（`apps/gateway` 内新增 `src/worker/` 入口，或独立 `apps/worker` 子包），与 Gateway HTTP 进程分开部署/伸缩。对应 ADR-002「模块化单体 + 异步 Worker」。
- Worker 通过现有 Outbox 租约取件（已具备），**补充心跳与续期**（见 5.5）。
- **不引入 VM**（Claude C1 的简化版）：Ocean 工具以 API 调用（GitLab/Jenkins/禅道）为主，暂不需要完整 Linux VM；用 **egress allowlist + 命令白名单 + MCP 子进程隔离** 达到同等安全目标，复杂度低一个数量级。

### 5.2 执行器分层（借鉴 K1/K2/K4）

```
RunRunner（每 Run 一个，逻辑并发）
 ├─ PlanLoop      —— agent 规划循环（当前 SkillOrchestrator 提取而来）
 ├─ StepExecutor  —— 单步执行：模型调用 / 工具调用 / 审批 / 产物生成
 │    ├─ ModelCall  —— 通过 contracts 校验，记录 RunStep
 │    ├─ ToolCall   —— 幂等执行（idempotencyKey），写操作先过 PolicyEvaluator
 │    └─ ShellExec  —— 可选：经受控进程执行（PTY 级），命令白名单
 ├─ Checkpoint    —— 每个 RunStep 完成后写检查点（可 resume）
 └─ EventWriter   —— 追加 RunEvent（与 PG 事务或 Outbox 一致）
```

- **RunStep 落库**：`run_step` 表（runId, seq, kind, input, output, status, checkpoint）。状态推进以 RunStep 为粒度，RunEvent 是投影（对应 ADR-003）。
- **thread/turn/item 语义映射**：Ocean 不照搬 Codex 协议，但把「turn 可打断、可转向」映射为 `Run.cancel` + `RunStep.interrupted` 事件；「item」映射为 `RunStep`。

### 5.3 事件与订阅恢复（补缺口 4）

- 扩展现有 `RunEvent`：除 `run.created / run.status_changed` 外，增加 `run.step_started / run.step_completed / run.tool_call.requested / run.tool_call.approved / run.artifact.created / run.waiting_for_input` 类型。
- SSE 端点 `GET /api/runs/:id/events?after=<sequence>`：从指定 sequence 续读（对应 lastEventId），断线重连不丢事件。
- 订阅者（Web/Desktop/CLI）全部走同一事件流；Gateway 负责从 RunEvent 投影旧聊天流格式（迁移期兼容，对应 MIGRATION_PLAN「RunEvent 可投影为旧聊天流格式」）。

### 5.4 优先级调度（借鉴 K3）

Worker 取件后按 Run 元数据分档（可存于 `agent_run.metadata`）：

| 档位 | 用途 | 行为 |
|---|---|---|
| Critical | 用户正在交互的会话（`waiting_for_input` 的续跑、审批通过后的恢复） | 立即调度，抢占 |
| Interactive | 普通聊天/短任务 | 正常队列 |
| Background | 定时任务、批量、CI 类 | 闲时执行，可被前两档挤占 |

实现：Worker 内小顶堆调度器 + PG 中队列优先级的粗粒度控制（`priority` 列排序取件）。

### 5.5 租约与可靠性（补缺口 1）

在现有 Outbox 基础上增加：

- **心跳续期**：取件后 Worker 定期（如 leaseMs/3）续期 `lockedAt`；超时未续期视为失联，可被其他 Worker 回收（现有 `lockedAt < NOW() - lease` 已天然支持回收）。
- **处理中租约分离**：把「Outbox 消息租约」与「Run 执行租约」分开——消息处理完即 markProcessed，Run 长任务的租约放 `agent_run`（`claimedBy`/`claimedUntil`），避免 Outbox 行被长时间占用。
- **幂等**：`create` 已按 `userId_idempotencyKey` 去重；工具调用层用 `toolCall.idempotencyKey` 落执行表，重复投递不产生二次外部写操作（对应 K4 幂等工具调用）。
- **失败分类**：`markFailed` 的 retryDelayMs 按错误类型区分——可重试（超时/租约/瞬时 5xx）指数退避；不可重试（校验失败/权限拒绝/业务错误）直接 `failed` 并终止，避免无意义重试。

### 5.6 沙箱与隔离（补缺口 7，借鉴 C3/C4）

SecureSandbox 从占位实现升级为真实边界：

1. **egress allowlist**（Claude gVisor 思路的轻量版）：工具网络出口按域白名单（如 gitlab 内网域、jenkins 域、模型供应商域），默认拒绝；配置进 `PolicySet`（Phase 5 Space 边界复用）。
2. **命令白名单**：`ShellExec` 只允许白名单命令（git/curl 受限/zip 等），参数模板化；无 shell 的 Run 不授予。
3. **MCP 子进程隔离**：MCP Server 保持独立进程（现状已如此），Worker 通过 stdio JSON-RPC 调用，进程资源受限（超时/内存上限）。

### 5.7 检查点与恢复（补缺口 6）

- 每完成一个 RunStep 写 `run_checkpoint`（含输入快照与执行上下文引用）。
- `resume`：从最后检查点重建 RunRunner，重放未完成步骤；`retry`：从指定失败步骤重试（幂等键保证不重做已完成的外部写）。
- 审批恢复：`waiting_for_approval` 状态下审批通过 → 从该步骤续跑（对应现有 CANCELLABLE_STATUSES 与 approval 模块衔接）。

### 5.8 存储与可观测

- Run 元数据/事件/步骤/检查点在 PG（现状延续）；**artifact 产物**（文件/大 JSON）走对象存储（新增），`run.artifact.created` 只存引用（借鉴 K6 存储分离）。
- 可观测：现有 otel 链路（`tracing/`）为 Run 增加 `run_id` span 属性；Worker 心跳与队列深度作为指标。

## 6. 落地优先级（对应 Phase 4 剩余工作项）

> 状态标记（2026-09-15 更新）：✅ 已落地（含实现与验证），⬜ 待实施。

| 序 | 工作项 | 借鉴 | 验收信号 | 状态 |
|---|---|---|---|---|
| 1 | Worker 进程骨架（取件循环 + 心跳 + 优雅退出） | — | 单 Worker 可取件执行；重启不丢 Run | ✅ `apps/gateway/src/worker/`（Phase 4.1） |
| 2 | RunStep 模型 + 纯文本模型调用迁入 Run | K1/K2 | 聊天请求走后端 Run，SSE 从 RunEvent 投影 | ✅ `run_steps` 表 + `src/ai/` ModelGateway（Phase 4.2） |
| 3 | SSE 订阅恢复（after=sequence） | K2 | 断线重连从断点续读，无重复无丢失 | ✅ `GET /api/runs/:id/events` 支持 `after` 与 `Last-Event-ID`，SSE `id:`/`retry`/心跳/终态 `done`（Phase 4.3） |
| 4 | 幂等工具调用 + 失败分类 | K4 | 相同幂等键不重复外部写 | ✅ `src/tool/` ToolRegistry + `ToolExecutor`（outbox `tool.requested` 路由，TerminalToolError 分类）（Phase 4.4） |
| 5 | 审批/交互续跑 + 检查点 resume/retry | K5/C1 | 审批通过后从检查点继续 | ✅ `run_approvals` 表 + `RunApproval` model + ToolExecutor 审批门 + `POST /api/runs/:id/approvals/:approvalId/decide`（Phase 4.5） |
| 6 | 优先级调度（三档） | K3 | 后台任务不阻塞交互 | ✅ `agent_runs.priority` + `outbox_events.priorityRank`，claim 按 `priorityRank, createdAt` 取件（Phase 4.6） |
| 7 | SecureSandbox egress allowlist | C3 | 未白名单域请求被拒绝并可审计 | ✅ `src/sandbox/egress-policy.ts` + 内置 `web.get` 默认拒绝（TerminalToolError → run.failed + step.error 审计）（Phase 4.7） |
| 8 | artifact 存储分离 | K6 | 大产物不入 PG | ✅ `RunArtifact` 表 + `ArtifactStore`（本地对象存储）+ 内置 `artifact.save/load`（Phase 4.8） |

### 6.1 Phase 4.2 实现摘要（RunStep + 模型调用迁入 Run）

- **数据**：`run_step` 表（runId, seq, kind, status, input, output, error, checkpoint），迁移 `20260915000000_add_run_step`（手动应用 + `migrate resolve`，因本库存在历史 drift，未走 reset）。
- **契约**：`packages/contracts/src/run.ts` 新增 `runStepSchema` / `runStepKindSchema` / `runStepStatusSchema`，事件新增 `run.step_started` / `run.step_completed`（沿用现有 `run.output_delta`）。
- **模型网关**：`src/ai/`（AiModule）——`MODEL_GATEWAY` token + 接口与实现分离；`AiSdkModelGateway` 走 ai-sdk `streamText().textStream`（官方文档确认）；`SimModelGateway` 供 `WORKER_SIM_MS>0` 的本地无 key 演示。Provider 构造提取为 `createChatModel`（唯一来源，SkillOrchestrator 同步改造复用）。
- **执行器**：`RunRunner` 由占位模拟升级为真实 model_call 步骤——事务内建 step（started）+ `run.step_started`；流式生成每 64 字符落一条 `run.output_delta`；完成事务内 step→succeeded + `run.step_completed` + run→succeeded。崩溃续跑：复用 status=started 的 model_call 步骤，不重复创建/写 step_started（幂等）；模型调用异常归为 `RetryableError` 回队列退避（失败分类细化留待第 4 项）。
- **投影端点**：`GET /api/runs/:id/events?after=<sequence>`（SSE，先回放后 2s 轮询）；`GET /api/runs/:id/steps`（步骤明细）。
- **验证**：gateway 全量 38 单测通过（含 RunRunner 6 例 / RunService 续读 1 例）；真实 PG 冒烟两场景 PASS：A) queued→running→step_started→output_delta→step_completed→succeeded，run_step 落库、outbox processed、after 续读从断点开始；B) 崩溃遗留（running+started step+无 outbox）→ 恢复 queued→running→复用 step→succeeded，步骤行不重复、无重复 step_started。
- **已知限制**：Web 端聊天从 `/api/chat` 切到 `/api/runs` 属前端迁移（feature flag 双轨），不在本项范围。

### 6.3 Phase 4.4 实现摘要（幂等工具调用 + 失败分类）

- **工具注册表**：`src/tool/`（ToolModule）——`Tool` 接口（name/description/execute）+ `ToolRegistry`；内置 `echo`（无副作用）与 `counter.increment`（有外部副作用，用于幂等验证）。未来 PlanLoop / MCP 适配器按同一接口动态注册。
- **执行器**：`src/worker/tool-executor.ts`（ToolExecutor）——承接 outbox `tool.requested` 主题，Worker 按 topic 路由（run.requested → RunRunner；tool.requested → ToolExecutor）：
  - **幂等（K4）**：同 run + 同 `toolCall.idempotencyKey` 已有 succeeded 的 tool_call 步骤 → 直接返回缓存结果，**不调用工具 execute**（重复投递不产生二次外部写）。工具调用步骤落 run_step（kind=tool_call），崩溃续跑复用 started 步骤（与 model_call 同语义）。
  - **前置 fail fast**：run 存在/归属、工具存在性在校验通过后才置 running（业务错误不先置 running 再失败）。
  - **失败分类（5.4）**：`TerminalToolError`（工具不存在/参数校验/权限拒绝等业务错误）→ run 终态 failed + `run.failed(code=tool_execution_failed)` + 消息确认（不重试）；其他（网络/超时/瞬时）→ run 回 queued + 消息退避重试 + started 步骤置 failed 供定位。
- **入队端点**：`POST /api/runs/:id/tool-calls`（body=toolCallSchema：id/name/input/idempotencyKey?）→ RunService 校验归属后写 outbox `tool.requested`，返回 202 语义 `{accepted, runId, toolCallId}`。
- **契约**：`toolRequestedMessageSchema` 新增；`leasedRunJobSchema` 改为按 topic 判别联合（run.requested / tool.requested）。
- **验证**：gateway 全量 52 单测通过（新增 ToolExecutor 6 例：成功/幂等缓存/崩溃复用/未知工具 Terminal/业务错误 Terminal/瞬时错误可重试；Worker 路由 1 例；RunService 入队 2 例）；真实 PG 冒烟三场景 PASS——①同 key 两次投递：run_step 仅 1 条 succeeded、`output.count=1`（外部副作用只发生一次）、两消息 processed、事件 running→step_started→step_completed→tool.completed→succeeded；②第三次同 key 投递：幂等命中，步骤仍 1 条；③未知工具：run failed + `run.failed` + 消息 processed（不重试）。

### 6.4 Phase 4.5 实现摘要（审批/交互续跑 + 检查点 resume/retry）

- **Run 维度审批记录**：新表 `run_approvals`（RunApproval model，对应契约 approvalSchema）+ 迁移 `20260915000001_add_run_approval`。与旧 `ApprovalRequest`（Session 维度、`waitForApproval` 阻塞轮询模式）分离——Run 审批是「暂停 → 决策 → 续跑」事件驱动模式，Worker 不阻塞。
- **审批门（ToolExecutor）**：工具声明 `requiresApproval: true`（如内置 `notify.send`）时，执行前先 `ensureApproval`：
  - 无审批记录 → 事务内创建 approval 步骤（run_step kind=approval）+ `approval.requested` 事件 + RunApproval(pending) + Run → `waiting_for_approval`（不置 running），消息确认（processed）——Worker 释放租约等待人工决策。
  - 已有 `approved` → 放行执行（续跑检查点）；`pending`（崩溃重投）→ 幂等不重复创建；`rejected/expired` → 不执行（Run 已由决策端点置 cancelled）。
- **决策端点**：`POST /api/runs/:id/approvals/:approvalId/decide`（body=approvalDecisionSchema `{decision: approved|rejected}`）→ RunService.decideApproval：
  - approved → RunApproval approved + approval 步骤 succeeded（写 checkpoint：`{approval, decidedAt, seq}`，resume 数据基础）+ Run → queued + 重新投递 `tool.requested`（**同一 toolCall 含 idempotencyKey**）→ Worker 从检查点续跑执行工具（幂等键保证不重做已完成的外部写）。
  - rejected → RunApproval rejected + approval 步骤 failed + Run → cancelled 终态，不投递。
  - 已决策的重复决策幂等返回当前快照。
- **验证**：全量 60 单测通过（ToolExecutor 审批 4 例：创建审批门/approved 续跑/pending 崩溃幂等/rejected 不执行；RunService 决策 4 例：approved 重投/rejected 取消/已决策幂等/越权拒绝）；真实 PG 冒烟四场景 PASS——①notify.send 投递 → approval 步骤 + approval.requested + run waiting_for_approval + 消息 processed（工具不执行）；②decide approved → run queued + approval approved + 新投递 pending=1；③worker 续跑 → notify.send 执行（output.sent=true）→ run succeeded + 全消息 processed（事件链：approval 步骤 started → approval.requested → waiting → approval 步骤 completed → queued → running → tool 步骤 → tool.completed → succeeded）；④decide rejected → run cancelled + approval rejected + 零投递。

### 6.5 Phase 4.6 实现摘要（优先级调度三档，借鉴 K3）

- **三档模型**：`critical | interactive | background`（契约 runPrioritySchema）。`agent_runs` 新增 `priority` 列（默认 interactive）；`outbox_events` 新增 `priorityRank` 列（0=critical, 1=interactive, 2=background）+ 索引 `[status, priorityRank, availableAt]`。迁移 `20260915000002_add_run_priority`。
- **入队携带档位**：RunService.create 接受 `request.priority`（默认 interactive）落库，`enqueueRunRequested` 按 `priorityRankOf(run.priority)` 写 rank；`createToolCall` 与 `decideApproval` 重投 `tool.requested` 同样继承 run 的档位（审批恢复/交互续跑天然 critical 优先的钩子已留）。
- **取件排序**：claim SQL 由 `ORDER BY createdAt` 改为 `ORDER BY "priorityRank", "createdAt"`——critical 立即取件、interactive 正常、background 闲时；同档内保持先到先得（FIFO）。
- **踩坑修复（claim 正确性）**：`UPDATE ... FROM candidates ... RETURNING` 的行序**不保证**与 candidates 的 ORDER BY 一致（PG 未承诺 UPDATE 返回序）——冒烟暴露取件顺序错乱后，改为数据修改 CTE：`WITH candidates ... , claimed AS (UPDATE ... RETURNING ...) SELECT * FROM claimed ORDER BY "priorityRank", "createdAt"`，外部显式排序保证取件序确定。
- **验证**：全量 61 单测通过（新增 create priority 落库 + critical→rank 0 断言）；真实 PG 冒烟双场景 PASS——①混合三档入队（bg→it→cr 建序）claim 返回顺序恰为 critical→interactive→background；②同档两条按 createdAt FIFO；回归冒烟：critical run 完整执行（run.requested → model_call 步骤 → succeeded，消息 processed）确认 claim 重构未破坏 Worker 主链路。

### 6.6 Phase 4.7 实现摘要（SecureSandbox egress allowlist，借鉴 C3）

- **EgressPolicy**（`src/sandbox/egress-policy.ts`）：默认拒绝的出站白名单——精确 host（`gitlab.example.com`）与后缀规则（`.example.com` 匹配自身+子域）两种允许规则；非 http(s)/无效 URL 一律拒绝；协议/端口/大小写/路径归一化。配置来源 `SANDBOX_EGRESS_ALLOWLIST`（逗号分隔），由 ToolModule 工厂注入。
- **强制拦截点**：内置 `web.get` 工具（`createBuiltinTools(egress)`）执行 HTTP 请求前先 `egress.checkUrl(url)`，未命中直接抛 `TerminalToolError('egress_denied: <host> ...')`——ToolExecutor 将其分类为终态业务失败：run failed + `run.failed` 事件 + run_step 置 failed 且 `error` 持久化 host 与原因（**拒绝可审计**：RunEvent 与 run_step 即审计轨迹）。
- **TerminalToolError 迁址**：从 tool-executor 移至 `tool.types.ts`（builtin.tools 依赖它，避免 worker→tool 循环依赖），tool-executor re-export 保持兼容。
- **验证**：全量 67 单测通过（新增 EgressPolicy 5 例：空表全拒/精确 host 归一化/后缀规则含子域/非 http 与无效 URL/fromEnv 解析；ToolExecutor web.get 拒绝 1 例）；真实 PG 冒烟双场景 PASS——①空 allowlist 下 `web.get(https://evil.example.net/leak)` → run failed + `step.error=egress_denied: evil.example.net not in allowlist` + run.failed 事件 + 消息 processed；②allowlist=localhost 下 `web.get(http://localhost:PORT/probe)` 打到本地 server → 200 + `body=EGRESS_OK` → run succeeded。
- **本项范围说明**：5.6 中的「命令白名单（ShellExec）」「MCP 子进程隔离」——当前工具面全部为内置 API 型（无任意 shell 执行），MCP Server 本就独立进程（stdio JSON-RPC），两者属现状延续，不另做实现。

### 6.7 Phase 4.8 实现摘要（artifact 存储分离，借鉴 K6）

- **数据模型**：`RunArtifact`（`@@map("run_artifacts")`，id/runId/name/sizeBytes/storageKey `@unique`/createdAt，FK→agent_runs onDelete Cascade），AgentRun 加 artifacts 关系。迁移 `20260915000003_add_run_artifact` 已 psql 应用 + resolve + generate。
- **ArtifactStore**（`src/artifact/artifact.store.ts`）：本地对象存储——`save(runId, name, content)` 写 `<ARTIFACT_ROOT>/<runId>/<artifactId>`（默认 `<cwd>/artifacts`，可用 `ARTIFACT_ROOT` 覆盖）并只落 DB 引用记录；`load(runId, artifactId)` 先按 `{id, runId}` 归属校验再读盘；`resolvePath` 用 `relative(root, candidate)` 拒绝路径穿越（`..` / 绝对路径）。Prisma 注入来自全局 PRISMA_CLIENT，由 ToolModule 工厂构建。
- **工具上下文**：Tool 接口 `execute(input, ctx?: ToolContext)`（runId/userId），ToolExecutor 调用点传 ctx——内置 `artifact.save`（返回 `{artifactId,name,sizeBytes,url}`，全文绝不进 run_step.output）与 `artifact.load`（同 run 归属放行；不存在/跨 run 抛 `TerminalToolError` → 终态失败不重试，step.error 可审计）。
- **HTTP 端点**：`GET /api/runs/:id/artifacts/:artifactId`（RunController）先 `runService.getStatus(id, userId)` 做归属校验，再从 ArtifactStore 读盘返回；RunModule imports ToolModule 注入 ArtifactStore。
- **验证**：全量 72 单测通过（ArtifactStore 3 例：大 payload 落盘 + DB 记录无 content / 归属读回 / 路径穿越拒绝；controller artifact 端点 2 例：读回 + NotFound）；真实 PG 冒烟三场景 PASS——①同一 run 内 save 200KB → run succeeded、`run_artifacts.sizeBytes=200000`、run_step.output 只含 url 引用（不含全文，**大产物不入 PG**）；②同 run load 读回 200000 字节一致 + 文件落盘大小一致；③跨 run load → run failed + `step.error=artifact.load failed: Artifact ... not found for run ...`。
- **踩坑**：RunController 新增 ArtifactStore 依赖后 RunModule 未 imports ToolModule → worker 启动即 DI 失败（run 卡 queued），已补 imports 修复；冒烟脚本「run 已 succeeded 即断言」与「第二条消息尚未处理」存在竞态，改为等待该 run 全部 outbox 消息 processed 再断言。

### 6.2 Phase 4.3 实现摘要（SSE 订阅恢复）

- **协议**（对照 MDN Server-sent events 文档核实）：每条事件带 `id: <sequence>`（EventSource 自动记录 lastEventId）；`retry: 1000` 让浏览器断线 1s 后自动重连并携带 `Last-Event-ID` 头；`: ping` 注释行每 15s 心跳防代理超时。
- **断点续读**：`GET /api/runs/:id/events?after=<sequence>`，`after` 与 `Last-Event-ID` 头均支持（query 优先）；服务端只回放 `sequence > after` 的事件（严格大于 → 无重复；递增回放 → 无丢失）。
- **终态关闭**：`RunService.getStatus` 轻量查询；run 到达 succeeded/failed/cancelled 且事件回放完 → 发 `event: done` 后关闭，非终态则 2s 轮询增量 + 心跳；首轮回放已终态时不再创建轮询/心跳 timer（无资源泄漏；close 通过 handles 容器幂等清理，避免首轮终态时 timer 未初始化的 TDZ 问题）。
- **验证**：gateway 全量 43 单测通过（新增 RunController SSE 5 例：全量回放带 id/retry、query 优先、Last-Event-ID 断点、非终态轮询至终态、非法 after 拒绝）；真实 PG 冒烟三连接 PASS——①首次订阅全量 5 条 id 连续 + done + 关闭；②Last-Event-ID=4 重连 → 0 条重复 + 立即 done；③Last-Event-ID=2（读到一半断线）→ 只回放 sequence>2 的 2 条、首条 id=3 连续。

## 7. 风险与权衡

- **VM 方案（Claude）暂缓**：完整 Linux VM 在银行内网桌面/服务器环境的资源与运维成本高；当前工具面（API 型）用 egress allowlist 已达主要安全目标。若未来需要"任意代码执行"能力，再评估 KVM/虚拟化方案。
- **Worker 独立进程 vs 模块化单体**：独立进程增加部署单元，但换来长任务与 HTTP 生命周期解耦（ADR-002/003 已决策）；先按"同仓独立入口"起步，避免过早拆包。
- **双链路并存期**：现有 SSE 直驱聊天链路与 Run 链路会短暂双轨（迁移计划允许 feature flag 切换），需明确旧链路退役条件，不允许无限期双轨。
- **不复制 Claude 的六语言 addon**：Ocean 无桌面原生层诉求，Worker 保持 TS/Node 单语言，跨语言边界只发生在 MCP 子进程（协议隔离）。

## 8. 参考资料

- 《AI产品Desktop技术架构调研报告.md》（本仓库根目录）：Claude/Codex/Kimi/豆包/DeepSeek 桌面架构、证据分级与来源索引。
- 官方：《Unlocking the Codex harness: how we built the App Server》(openai.com, 2026-02-04)；《How we contain Claude across products》(anthropic.com, 2026-05-25)。
- 仓库内部：`docs/architecture/v2/MIGRATION_PLAN.md`（Phase 4）、`docs/architecture/v2/ADR.md`（ADR-002/003）。
