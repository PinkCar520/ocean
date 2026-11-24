# 架构符合性 · 阶段证据

早期平台架构见 `docs/architecture/v2/ADR.md:33,55,120,141`，涵盖模块化单体、异步 Worker、持久化 Run、共享协议及 Redis 权威边界。后期共享执行的主线历史包括 #17 f94fbf3、#18 596b6ed、#20 05a5566、#19 2313214、#21 9b33471。Claude Code 行为兼容与架构演进的逐项裁决待完成。

| 入口 | 源码证据 | 剩余追踪 |
|---|---|---|
| Ink | `apps/cli/src/ui/app.tsx:212` → runOceanCoreLocal → `apps/cli/src/llm/core-local-runtime.ts:84,136` → Engine.run/resume | Session 创建、审批、取消及持久化 |
| Readline | `apps/cli/src/repl.ts:645,923` → runOceanCoreLocal | 逐模式分支、审批恢复 |
| Print / Gateway CLI | `apps/cli/src/index.ts:152,263,281,301` 检出选项及路由 | 远程 API、流式输入与实际恢复分支 |
| SDK | `apps/cli/src/sdk.ts:15` 公开本地执行入口 | 消费方与打包入口 |
| Gateway | WorkerModule 注册 GatewayCoreLifecycle、RunRunner、ToolExecutor；RunRunner 构造上下文、取得 model step、进入 Core durable 状态、调用 ModelGateway、按响应请求 Core directive、以 fenced transaction 持久化 | HTTP、队列消费、SSE、审批、接管与取消端到端串联 |
| Web / Desktop | 待逐入口验证 | 请求发起、IPC、事件回放 |

## CV2-001 · P1 · R01 Partial

**约束**要求模型调用之前，以真实 Runtime、Tool Journal 和 Outbox 输入统一 turn planner。生产 WorkerModule 注册 RunRunner 和 GatewayCoreLifecycle（`apps/gateway/src/worker/worker.module.ts:51`）。`RunRunner` 在 `run-runner.ts:285–320` 创建或重用 RunStep，经 Core lifecycle 进入模型段后直接调用 ModelGateway.generate。到 `:356–363` 才调用 AgentExecutionDriver.planTurn，传入 `unfinishedTool: false` 和 `pendingDeliveryIds: []`。后续兄弟工具分派在 `:827–852` 使用实际查询结果。

Core durable 自身在 `packages/shared/core/src/agent-execution-engine.ts:339–360` 检查 Runtime 中未结工具、未知结果及未领取提议。已确认影响为模型调用前的统一 planner 接入缺失。未证明悬空 Outbox 一定导致模型重复调用，仍需追踪 RunRunner 入口、事务及 Worker 接管门禁。

**历史** `git blame -L 356,363 apps/gateway/src/worker/run-runner.ts` 将 planner 及固定参数归于 1ccba27。Core 生命周期调用可追溯到 596b6ed（#18）。planner 变更所属 PR 待确认，研发中断原因无证据。

**收敛** 复用 Core planAgentTurn，由 Worker 在 ownership-fenced 读路径提交真实 readiness。验收应通过实际 Worker/RunRunner 入口断言取消、未结工具和 pending delivery 时 provider 调用次数为零，且正常零工具、单工具和多工具路径可推进。

## Gateway、Web、Desktop 与 CLI 远程链路

| 环节 | 调用链及职责 |
|---|---|
| 会话 | Web `apps/web/src/App.tsx:498` 与 Desktop `apps/desktop/src/renderer/src/App.tsx:563` 渲染共享 ChatSession。新会话由 `packages/ui/src/lib/useConversations.ts:181–189` 创建，Web 通过 server action 调 Gateway `/api/sessions`，共享 hook 的直接 API 分支供 Desktop 使用。恢复读取同一会话的消息接口（`:150`）。 |
| Chat 请求 | `packages/ui/src/lib/useChatSession.ts:93,226` 的 DefaultChatTransport 向 `POST /api/chat` 发送 Session ID。CLI 远程 `apps/cli/src/llm/chat.ts:250–271` 使用同一 HTTP 路径，CLI 的 SDK approval 回包走 `:323` 的 Run approval API。 |
| Run 创建 | `apps/gateway/src/chat/chat.controller.ts:283–364` 在 Run 模式读取会话消息树，持久化用户消息并传入历史。ChatService.runChatStream 在 `chat.service.ts:109–116` 创建 Run，将 sessionId 写入 metadata。直接调用 Run API 由 `run.controller.ts:110–120` 进入同一 RunService.create。RunService.createInTransaction 在 `run.service.ts:90–135` 创建 Run 并写入 Outbox。 |
| 消费与决策 | `worker/main.ts:16` 启 WorkerModule，WorkerService.onModuleInit 先恢复 stale Run 后轮询（`worker.service.ts:46–50`）。它领取 Outbox、续租并按 topic 分派 RunRunner 或 ToolExecutor（`:74–87,120–156`）。RunRunner 负责模型、下一轮及完成事务，Core durable 记录状态，CV2-001 描述模型前决策边界。 |
| 权限与审批 | `tool-executor.ts:183–259` 根据子代理范围、工具策略及 hook 决策执行或走 approval。 `run.controller.ts:174–199` 验证请求，按调用者身份进入 RunService.decideApproval。允许后的工具 Outbox 入口位于 `run.service.ts:806`。 |
| 取消 | Run API `run.controller.ts:137–141` 调用 RunService.cancel。非交互 Chat 请求断开触发 AbortController，ChatService 轮询看见 abort 后调用 cancel（`chat.controller.ts:334–364`，`chat.service.ts:132–136`）。交互请求的断开不走该 abort 分支。 |
| 回放 | ChatService 在 `chat.service.ts:137–229` 轮询 RunEvent 并投影 UI chunks。Run SSE `run.controller.ts:220–310` 接受 after/Last-Event-ID，发出带序号的事件。RunService.listEvents 在 `run.service.ts:470–490` 验证所有权后按 sequence 查询。RuntimeCoreEvent 和 RunEvent 是独立表（`schema.prisma:227,240`），跨表事实来源待继续核对。 |

Web 和 Desktop 的默认聊天消费同一 Gateway Run 链路。针对交互请求的 Gateway 配置回退仍可切换到旧直驱循环，见 CV2-003。

## CV2-011 · P1 · CLI 会话恢复未接入同一 Run 的 Core 恢复

**约束与调用链。** R02 要求用户恢复持久会话时识别中断的 Run 并核对 Runtime、工具日志及消息，再决定可否创建新 Run。CLI single query/print 在 `apps/cli/src/repl.ts:518–519` 加载会话，Readline /resume 在 `:1048–1057` 加载，Ink 启动和 /resume 在 `apps/cli/src/ui/app.tsx:376–390,628–635` 加载。三个实际模型入口随后分别在 `repl.ts:646,926` 和 `ui/app.tsx:214` 使用 randomUUID 并省略 resume。 `core-local-runtime.ts:135–137` 因此进入 Engine.run。仓库普通 CLI 入口没有发现对 resume:true 的调用。公开 SDK 可显式提供 runId 和 resume，原始事件文件按 runId 读取（`apps/cli/src/utils/runtime-event-store.ts:13–20`）。

**事实与影响。** `AgentExecutionEngine.execute`（`packages/shared/core/src/agent-execution-engine.ts:481–512`）只在同一 Run 的 resume 分支核查 interrupted 状态、未结工具、journal 和 transcript。普通 CLI 的恢复保留旧消息，但不会通过该分支发现上个 Run 的未结工具。 `SessionStore.load`（`session-store.ts:290–312`）只从终态工具 journal 重建 transcript，未知结果不重建；会话工具日志会拦截相同调用 ID。不同调用 ID 的外部副作用是否实际重复执行尚未复现。突然进程退出也可能把快照留在 calling_model/executing_tools，SDK 仅传 resume:true 仍受 interrupted 门槛约束。

**历史。** 596b6ed（#18）引入 CLI 生产入口的随机 Run ID 和 SDK 可选 resume。 `git blame` 对三入口一致。研发过程原因无证据。

**验收。** 复用 Engine.resume、FileRuntimeEventStore 以及 CLI journal 验证器。从 Session 定位活动或中断 Run，通过所有权和事件证据区分客户端重启、用户取消和主动新回合。使用真实 CLI 入口测试持久 Session → SIGKILL → --resume；至少包括模型中断、已完成工具待回填、未知工具、待审批、重复 resume 和与旧会话文件兼容。不应为新入口重写已存在的 journal 核验。

### R02 持久事实来源

CLI 同时存在 Session transcript、按调用 ID 的工具 journal、按 Run ID 的 Core 事件文件。 `SessionTranscriptPort.load` 读持久 transcript，append 使用比较长度的原子追加。 `core-runtime-recovery.ts:65–136` 会把终态 journal 与 Core 核对后按需补 transcript，`SessionStore.load` 则独立从终态 journal 重建消息。CLI fork（`session-store.ts:232–247`）复制 transcript、compaction 和 usage，分配新 Session ID。旧 Run 事件和 journal 留在原来的身份空间。此行为应作为会话历史 fork 验收，执行状态 fork / resume 仍需明确协议。

### CV2-011 补充 · Readline 启动入口不读取会话选择

`runRepl` 在 `apps/cli/src/repl.ts:97–106` 将 resume/continue 传给 Ink，将完整 options 传给 runReadlineRepl。后者在 `:805–812` 始终 createDraft，命令 /resume 仍能加载旧会话（`:1048–1057`）。因此非 TTY 启动参数的缺口先于 Core Run 选择。40abe6f 的草稿实现及 d5555aa 的旧初始化可用 blame 追踪。

## CV2-015 · P1 · 子代理父级生命周期未统一

**CLI。** `repl.ts:645–697` 的默认持久调用早于 legacy delegation 路径返回；内建 delegate_task 只经 `repl.ts:701–711 → llm/chat.ts:438–458` 注册。它把 `runChatLoop` 作为子代理执行器；`subagents/delegate.ts:110–127` 启动子循环，采用工具白名单、超时、子 Session journal 和无嵌套策略。默认 Ink、Readline、Print 的 Core 装配中未发现内建同角色注册。旧路径的白名单、重复调用身份、持久结果复用均已有实现，不宜重新开发。

**Gateway。** `RunRunner` 在 `run-runner.ts:960` 为 delegate_task 跳过 Core queueTools。ToolExecutor 验证审批及当前模型 call 后，在 `tool-executor.ts:309–330` 直接创建 child Run。 `SubagentRunsService.createInTransaction/reconcile`（`subagent-runs.service.ts:28–166,235–315`）持久化父步骤、控制 waiting_for_input、回填结果及下游 Outbox。child Run 按正常 Worker 路径调用 Core durable，父级委派的执行决定及完成由 Gateway 服务掌握。

**历史与影响。** bd1986e 引入 CLI delegation，0cf0263 引入 Gateway SubagentRunsService；596b6ed 接入 Core 时保留了 Gateway 协议特例，并切换 CLI 默认入口。能力随 Host 和路径变化，CLI 默认本地没有内建子代理，Gateway 父 Runtime 事件没有这次委派的普通工具生命周期。未经测试证明会导致特定 Run 丢失。

**验收。** 复用 CLI 的定义解析、只读授权及 journal，复用 Gateway 的 child lineage、队列和事务，将父级委派意图、挂起、完成/取消纳入 Core 协议。运行两个实际 Host 的子任务成功、失败、取消、重复、重启测试，验证单次投递和父级继续条件。

## CV2-017 · P1 · Gateway 默认 Run 路径只传递所选 Skill 的名称

`apps/gateway/src/chat/chat.controller.ts:230–287` 合并 UI Skill 选项并把首个 ID 写入 Session.activeSkillId。默认分支交给 ChatService，`chat.service.ts:13–50,103–115` 只把 ID 渲染进 `[context] skills: ...` 文本。RunRunner 按 ToolRegistry 提供工具（`worker/run-runner.ts:775–785`），WorkerAgentTools 的初始化未注册 activate_skill，RunRunner 未找到正文解析或共享 activation 事件调用。原先 `runtime/prompt.composer.ts:95–108` 注入选中 Skill 正文及可用 catalog，`runtime/tool.runtime.ts:366–379` 提供 activate_skill，这一组合在旧直驱链路可达。CLI 则在 `core-local-runtime.ts:112–117` 通过经发现目录核验的 tool result 重建激活状态。

**历史和影响。** c10da1c 引入名称投影，14b66f9 将 Run 设为默认。UI 展示的选择可持久化，但这条默认链路未提供该 Skill 的正文、Core activeSkills 或 Skill 级工具约束。历史部署中独立工具是否额外注入未验证。建议以 CLI 已有的发现目录核验和 Core activation 规则为参考，复用 Gateway SkillLoader 提供正文及可信描述，避免再造解析器。真实 HTTP 验收应选择一个仅在 Skill 正文定义的行为，经 provider fixture 检验正文流入、激活事件、工具限制、恢复与取消。

### CV2-011 · 真实 CLI 恢复复现

`node /tmp/ocean-audit-cli-resume-probe.cjs` 启动基线构建的真实 CLI，HOME 和工作区指向临时目录，模型指向本地 SSE fixture。收到首个模型调用后对 CLI 子进程发 SIGKILL。磁盘上的原 Run 停在 calling_model。第二个 CLI 进程使用 `--resume <sessionId>` 发送下一条请求，模型收到旧用户消息和新消息；新 Runtime event stream 使用同一 sessionId 和另一个 runId，进入 completed；原事件文件保持原样。该用例覆盖 CLI Print 的模型中断。交互模式和中断期间工具/审批恢复仍未动态验证。

## CV2-026 · P2 · CLI Core 恢复首轮未回注结构化执行状态

**约束与证据。** 会话恢复需要将持久执行状态纳入不可依赖模型记忆的上下文。旧 `runChatLoop` 在 `apps/cli/src/llm/chat.ts:493–508` 调用 `recoveryStatePrompt`，把已保存的 plan、worktree 和 subagent 状态加入 system prompt 后再计算压缩预算（`apps/cli/src/llm/recovery-state.ts:7–23`）。默认 Core local 绑定生成模型时使用入口传入的 systemPrompt（`core-local-runtime.ts:87–98`），从持久 Session 只显式恢复 Skills 并从 transcript port 读取消息（`:99–117`）。定向引用仅找到旧 chat.ts 对 recoveryStatePrompt 的生产调用。

**历史与影响。** f31532d 引入结构化状态回注，596b6ed 切换默认入口后，旧 Helper 仍可达但 Core 入口未接入。上述真实 CLI 探针在进程重启前通过 SessionStore.savePlan 保存包含唯一标记的 doing 任务，验证恢复后的首个模型请求没有该标记。CLI 工具可以另行查询任务，当前发现限定于自动上下文恢复。worktree/subagent 回注差异来自静态路径，未单独动态复现。

**验收。** 复用已有的 bounded deterministic serializer 和 SessionStore 元数据，将其作为共享 context 约束的一部分由真实 CLI Core 入口传给模型。覆盖持久计划、工作树、未知子任务、摘要触发与 --resume，断言结构化状态进入模型请求与预算。

## CV2-033 · P2 · Gateway 跨 Run 恢复只支持单工具历史批次

正常 Gateway Run 支持同一模型响应提出多个工具，按顺序写入 RunStep。后续 Chat 请求在 `apps/gateway/src/chat/chat.controller.ts` 投影历史，将原 Run ID 交给 `RunRunner.restoreChatHistory`（`apps/gateway/src/worker/run-runner.ts:634–684`）。该方法核对相同模型、会话、用户、父消息和预算，却将 `toolCalls.length > 1` 直接判失效，改用该历史回复的纯文本 fallback。027864d 引入此边界。实际编译后的方法用同一测试会话和持久行形状验证，一对合法工具还原为结构化消息，两对完整工具退回纯对话文本。此次验证数据库查询使用 fixture。不能据此断言同一个 Run 内的两工具循环保全失败。

应复用 Core 顺序与调用身份校验，让与声明完全配对的多工具批次在预算内恢复；如果预算要求省略，应用明确的保留规则。用真实 Chat 首轮完成多工具并再次发起同一 Session 的下一轮，断言 provider 收到两对历史工具消息，跨模型、错配、fork 和超预算场景按预定规则降级。

### Claude Code 参考实现补查

`restored-src/src/query.ts:303–367` 的逐轮状态在本地 query 循环携带；`restored-src/src/services/compact/autoCompact.ts:91–121` 区分告警、自动压缩和硬阻断阈值。仅作为可观察行为参考。Ocean 的 R01/R03 验收仍须证明真实 CLI 与队列 Worker 使用共享执行决策，并在各自持久化端口验证恢复。参考文件不纳入自研源码统计。

## CV2-034 · P1 · Web／Desktop 停止按钮仅终止 Chat 流

Web 和 Desktop 共用 `ChatSession → ChatInput → useChatSession.handleStop`（`packages/ui/src/components/ChatSession.tsx:958`，`packages/ui/src/lib/useChatSession.ts:195–198`）。handleStop 只设置 isStopped 并调用 AI SDK stop，未调用 Run API。Gateway `ChatController.handleChatStream`（`apps/gateway/src/chat/chat.controller.ts:334–364`）仅为 nonInteractive 请求绑定 close AbortController，直到 `ChatService.runChatStream:132–136` 才按 signal 调 RunService.cancel。交互流断开后，后台任务依然可推进。4a135b2 引入 UI stop 路径，027864d 引入非交互断流控制。

隔离 PostgreSQL 与真实 Nest HTTP 在 Chat 创建 Run 后断开连接。交互请求 Run 保持 queued，Outbox 仍有 pending；非交互同样断流则导致 cancelled。探针把认证身份作为本地 fixture 注入，未启动 Worker 或浏览器。已验证停止信号链缺口，未观察到取消后外部副作用。普通网络断线可有意保留运行，按钮的显式取消应可观察地调用 Run API，同时为被动断开保留重连。验收实际 Web 和 Desktop 点击停止，检验 queued、模型流、等待审批和 in-flight tool 的 Run/SSE 状态。

## CV2-035 · P2 · Chat 可保存无效父消息并静默丢弃会话分支

`ChatController.handleChatStream`（`chat.controller.ts:67–85,310–330`）先读取所有已鉴权消息，再用请求的 parentId 计算分支。父节点缺失时 messagePath 返回空数组，仍把相同 ID 交给 `SessionService.addMessage`（`apps/gateway/src/session/session.service.ts:280–310`），后者持久化普通字符串，Prisma Message（`schema.prisma:519–540`）没有父消息关系约束。Worker 只验证当前 user message 在所属 Session，历史此前已变为空。b7f98b3 引入 Session 父消息逻辑，c77bf09 为 Chat 的历史捕获路径历史。

HTTP + PostgreSQL 探针在已有历史的 Session 中提交不存在的父节点，实际保存带悬空 parentId 的新消息，生成 Run 的 chatHistory 为空。未发现跨用户历史被读取。应沿用当前会话所有权，在同一消息创建事务验证父节点属于该 Session；初始根显式 null，失效分支明确返回业务错误。验证正常编辑/分支/fork、并发切换及不存在父节点的无写入保证。

## CV2-038 · P2 · 发布质量门与实际部署的镜像身份未绑定

`.github/workflows/deploy.yml:17–18,33–74,78–118` 为构建发布设置质量门，并给镜像写入 latest 与短 SHA 标签。部署 job（`:121–138`）虽然 checkout 当前提交，却进入服务器固定路径 `~/ocean` 并执行无压缩 SHA/镜像 digest 参数的 `docker compose pull/down/up`。仓库的 `docker-compose.prod.yml:3–30` 使用 latest。常规 Compose 的 worker 又使用本地镜像配置（`docker-compose.yml:48–70`）。a959a94 引入该部署命令。静态证据证明仓库 workflow 未把构建结果的不可变镜像标识传到 Compose。线上是否另有 checkout 同步、digest 钉扎或不同 Compose 规格仍未核实。

应沿用现有 build 和 gate，通过 digest 明确部署 Gateway／Worker／Web，保存 SHA、摘要和生效部署规格。用隔离发布或 CI 桩断言两个分支并行发布时，各自部署仅解析本次产物；核实健康检查和数据库 migration job。

### 远程 Workspace Host 装配

Gateway 的 ToolRegistry 在有 DeviceRpcBroker 时注册本机文件、notebook 和 LSP 工具。请求经过 Worker ToolExecutor 的权限和工具日志，再写入 device.rpc Outbox。HTTP Gateway 的 RpcModule 装配 DeviceRpcDispatcher 和 RpcGateway；按会话快照找到已认证 Host。Broker、Dispatcher、Socket 路由分别核对 Run 归属、快照和设备凭据，其后 Host 的 `createNotebookRpc` 再校验快照、根目录与本地权限。Desktop supervisor 启动独立 utility process，CLI remote 模式可复用同一个 Host connector 和设备执行函数；此设备进程不运行新的模型循环。旧 daemon 和 `RpcGateway.sendToCli/sendWorkspaceTool` 仍提供兼容通道。它们共享部分工具语义，工具批次与审批仍由父 Run／CLI 路径控制。CV2-040 记录设备发送后结果未知的持久收尾缺口。

## R01–R08 设计评审证据索引

| 要求 | 当前判断 | 已有入口与证据 | 尚缺的评审证据 |
|---|---|---|---|
| R01 Agent Execution Unification | Partial | CLI Engine.run；Gateway Worker → RunRunner → Core durable。兼容循环 CV2-002/003，模型前决策 CV2-001 | 从实际两端入口证明同一决策契约覆盖工具、审批、取消和终止 |
| R02 Session Runtime | Partial | CLI Print SIGKILL 后 --resume 实证 CV2-011；Gateway Chat → Session → Run 的分支历史 CV2-035 | 未结工具、审批和 fork 的身份与历史保全 |
| R03 Context Lifecycle | Duplicate | CLI compactContext 与 Gateway compactChatHistory 共享计数和部分校验，分别控制策略 CV2-013；历史双工具丢失 CV2-033 | 同语料跨端验证缓存、摘要、工具配对及重启 |
| R04 Durable Recovery | Partial | PG 已复现启动恢复、丢投递、取消和重试分叉 CV2-008/009/027/029。工具未知结果协调 CV2-007 | 真实查询适配器、故障窗口覆盖及 Runtime 与 RunStep 的一致性断言 |
| R05 Cross-host Acceptance | Partial | 协议级比较与真实 CLI 远程 → Gateway 测试通过，见 06-TEST-EVIDENCE | 同组场景分别跑本地 CLI Core 和 Gateway，核对状态与副作用 |
| R06 Production Integration | Partial | PG/HTTP 可执行；生产 Compose、回填和发布身份缺口 CV2-004/005/038/039 | 线上部署规格、镜像摘要、迁移历史和实际服务装配 |
| R07 Legacy Cleanup | Legacy | CLI 和 Gateway 回退仍可达；Gateway inline 工厂仅测试可达 CV2-022 | 兼容消费者及对外导出复核，明确每条路径退出条件 |
| R08 Final Acceptance | Partial | CI 执行基础验收，三项真实 CLI 用例默认跳过 CV2-019 | 发布门覆盖清单、基线 CI 工件和最终验收映射 |

逐文件台账跟踪生产可达性与待审范围。此表跟踪足以影响设计决策的证据缺口。
