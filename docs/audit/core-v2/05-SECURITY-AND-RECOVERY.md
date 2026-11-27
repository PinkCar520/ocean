# 安全与恢复 · 阶段证据

Core 在 `agent-execution-engine.ts:339–400` 拒绝未结 prepared/unknown、未领取队列提议和重复领取。Gateway 的模型启动使用 fenced transaction（`run-runner.ts:288`）。`worker.service.ts:78–111` 的轮询会调用未知结果协调器，依赖为 Optional。当前证据仅覆盖入口和部分门禁，外部效果发生后结果落库前的协调保证仍需验证。

领取后崩溃、执行中崩溃、外部副作用后崩溃、结果提交后投递前崩溃、lease 过期、并发接管、取消后迟到结果、重复投递和审批、进程重启的事务边界及自动化证据均待逐项核对。权限、审批和隔离路径待审。

## CV2-004 · P1 · 独立生产 Compose 规格遗漏 Worker

`docker-compose.prod.yml:1–97` 启动 Gateway、Web、PostgreSQL、Redis。Gateway 镜像启动 HTTP 入口（`apps/gateway/Dockerfile:51`），AppModule 导入 RunModule（`apps/gateway/src/app.module.ts:54`），独立 Worker 的启动入口在 `apps/gateway/src/worker/main.ts:16`。因此仅按该生产规格启动时，`RunService.createInTransaction` 写入的 run.requested 缺少本规格内的消费者。常规 `docker-compose.yml:48–75` 有 Worker，f208d98 为引入记录，生产规格加入于 a959a94。 `.github/workflows/deploy.yml:120–138` 在服务器 `~/ocean` 运行无 `-f` 的 docker compose。不能据此确定线上使用哪份 Compose 或是否存在外部 Worker。

验收以实际发布规格启动干净环境，断言 HTTP readiness、Worker 消费、完整 Run/SSE 终止和重启恢复。统一版本及依赖配置后收敛重复规格。

## CV2-005 · P1 · Gateway 镜像启动跳过迁移历史

`apps/gateway/Dockerfile:51` 执行 `prisma db push --accept-data-loss` 后启动 HTTP，历史引入点 1914292。隔离验收脚本 `apps/gateway/scripts/verify-postgres.sh` 执行 `prisma migrate deploy`。schema 同步无法执行仓库迁移的任意数据变换。例如生产升级依赖的工具幂等回填位于 `apps/gateway/prisma/migrations/20261122010000_tool_idempotency_backfill/migration.sql`。线上是否另有独立 migration job 待核实。风险是升级后历史记录仍缺回填，现有容器验收结果未覆盖镜像启动路径。验收应使用上个版本的数据库和旧工具记录，从发布入口迁移，再核对索引、回填与重复投递测试。

### 待验证 · SSE 终态与尾事件读取窗口

`run.controller.ts:283–287` 先读增量事件再读终态。如果终态事务在两次读之间提交，当前轮可能在新事件仍未读取时发 done。需通过受控测试验证这一交错、重连游标，以及先前版本是否保持同样行为。代码跨度可追至 2a1ca0e / 027864d。

## CV2-007 · P1 · 生产未知结果协调缺少适配器和 Core 落库

Worker 轮询 `WorkerService.reconcileUnknownTools`（`worker.service.ts:101–115`）会调用 `ToolOutcomeReconciler.reconcile`。生产 `worker.module.ts:54–57` 注入空 adapter map，精确符号引用仅见此工厂和测试构造。`tool-outcome-reconciler.ts:35–64` 无 adapter 时返回 unsupported；即使配置 adapter，成功路径仅比较回执中的幂等键并 CAS 更新 RunStep。它没有更新对应 RuntimeCoreEvent、追加 RunEvent 或应用显式恢复策略。Core 的 `startDurableModel`（`agent-execution-engine.ts:339–354`）仍会拒绝 prepared/unknown。

**历史和测试边界** cfe2272 注册空工厂。 `worker.postgres.e2e-spec.ts:176–215` 直接构造 Worker 并注入 `external.fixture`，验证查询回执和 RunStep 更新，且断言 Run 仍 failed。该 PostgreSQL 测试通过证明适配器机制可以运作；生产工厂仍无可验证真实外部结果的实现。实际影响是生产未知结果默认只能保留待查，无法由该查询路径安全恢复。

**验收** 为支持外部只读查询的工具注册真实适配器，由现有 ToolOutcomeReconciler 复用稳定调用身份，在受控事务内处理 journal、Runtime、事件与显式恢复。用生产 DI 装配验证成功、失败、未知、错配与重复回执，断言原工具无重放。其他工具继续保留 unknown。

## CV2-008 · P1 · 启动恢复可以清除另一个仍有效的 Run 所有权

`WorkerService.onModuleInit → recoverStaleRuns → recoverRun`（`worker.service.ts:46,194–310`）以 Run.updatedAt 和 running 取候选，事务内仅复查 status，随后清空 executionToken/JobId/Attempt 并修改 Run。在另一 Worker 执行模型或工具时，续租只更新 Outbox.lockedAt（`outbox.service.ts:120–130`），所以 Run.updatedAt 可以超过阈值而所有权仍有效。启动恢复不通过 `claimRun/verifyRun`（`run-ownership.ts:5–28`），也未在该事务判断当前 Outbox 是否仍持有有效租约。若已存在 started 工具，代码会标 unknown 并置 Run failed；否则可能置 queued 并补投。

**历史和影响** 2a1ca0e 引入时钟式启动恢复，919602f 增加 started 工具的 unknown 分支。合法长任务可被另一个启动中的 Worker 截断，原 Worker 的后续写入被 fencing 拒绝。已确认代码可达条件，未动态复现活租约恰好跨越阈值的交错。现有 SIGKILL 用例使用 1 秒 stale/lease，断言死亡后副作用未重复，没有断言活租约期间 Run 状态保持 running。

**验收** 让启动恢复服从同一 ownership/lease 事务约束。在真实 PostgreSQL 用两个 Worker 让长模型、长工具跨过 stale 阈值，验证新 Worker 启动时原所有者继续工作。再杀掉原 Worker 验证租约过期后可安全恢复。

## CV2-009 · P1 · 工具 job 争用被确认成功，可能丢工具投递

`ToolExecutor.execute`（`tool-executor.ts:75–93`）调用 claimRun。领取失败时，只要 Run 存在且用户匹配就返回 succeeded，没有检查 Run 是否终止，也没有辨认本工具已执行/已落库。`WorkerService.settle`（`worker.service.ts:160–183`）将该结果转为 Outbox processed。claimRun 对另一个仍持有有效 ownership 的 job 会返回 false（`run-ownership.ts:5–18`）。与此不同，`RunRunner.execute`（`run-runner.ts:117–118`）对相同返回值给出可重试结果。

**历史和影响** 0cf0263 引入当前工具分支，后续模型路径在 6a8372b 的历史中具有可重试处理。真实 HTTP `run.controller.ts:149–165 → RunService.createToolCall` 可以将工具投递给非终态 Run。两个不同 job 竞争同一活动 Run 时，另一 Worker 可在工具未运行时确认该工具消息，导致已接受的工具工作丢失。未进行定向并发复现。

**验收** 将 claim 结果区分为已结算、终态和可重试争用，复用权威 Run ownership。双 Worker PostgreSQL 验收一个长模型 job 和一个合法工具 job，断言争用工具消息仍待处理且最终执行一次，然后验证终态和重复投递仍可确认。

## CV2-010 · P2 · 审批事件在数据库序号与 SSE 游标之间分叉

`RunService.decideApproval` 在审批到期和决策分支（`run.service.ts:690–708,752–767,789–831`）以 nextRunSequence 填列值，payload 却填 `sequence: 0`。listEvents（`:470–490`）按列过滤却只返回解析后的 payload。 `RunController.streamEvents`（`run.controller.ts:268–287`）用 payload.sequence 发 SSE id 并直接覆盖 lastSeq。若一次轮询最后一条是这类审批事件，游标会退回 0，后续轮询和断线重连可重复旧事件。ChatService 使用 Math.max 推进游标，但同样会重复读取直到出现更高 payload 序号。2a1ca0e 已包含该分叉。当前为源码确定性证据，未动态复现轮询窗口。

**验收** 优先由统一事件写入 API 从单个 seq 生成行与 payload，并定义读取历史不一致事件时的列优先规则。用真实数据库审批后断开和 Last-Event-ID 重连，断言序号严格递增、旧事件不重复，覆盖上轮待验证的终态尾事件交错。

## 关键故障窗口与证据

| 窗口 | 当前行为 | 证据边界 |
|---|---|---|
| 已领取 Outbox，尚未写 started | Outbox pending 依赖租约过期重新领取，Run ownership 按 attempt 鉴别 | 单元及 PG ownership 套件，入口专项仍待验证 |
| 非幂等工具 started 后崩溃 | RunStep started 与 Core prepared 分两次 fenced transaction 提交（`tool-executor.ts:360–365`）；重启按 RunStep 保守判 unknown | SIGKILL 已覆盖副作用已发生；两事务之间的崩溃待验证 |
| 结果已持久化，后续 job 未消费 | RunStep、RunEvent、Core settle 和后续 Outbox 在同一结果事务（`tool-executor.ts:403–470,732–753`） | 已验证正常与重复工具分派；事务提交点故障注入待验 |
| Lease 失效与并发接管 | 常规写入以 token、attempt 和 lease fencing；启动恢复、争用 ack 存在 CV2-008/009 | 已有 PG fencing 测试；新发现交错待复现 |
| 用户取消后迟到结果 | 工具完成事务仅在 Run 仍 running 时写成功；调用工具的 execute 参数不含 signal（`tool-executor.ts:385,403–405`）。Run 取消与外部操作停止是不同边界 | 模型取消有 PG provider fixture；工具、Core journal 终态一致性仍待验证 |
| 重复审批 | 已决策先返回，事务以 waiting_for_approval / pending CAS 执行状态迁移并写 Outbox | 同一审批的并发事务测试待逐条确认 |

CV2-007 的另一个写入边界在 `ToolExecutor.handleFailure`（`tool-executor.ts:826–898`）及 `WorkerService.recoverRun`（`worker.service.ts:229–258`）。这两条路径标记 RunStep unknown，均未调用 GatewayCoreLifecycle.settleQueuedTool。若崩溃前 Core prepared 已落库，RunStep、Core 及 Run 终态会保留不同描述。幂等和拒绝自动重放仅证明现有防护，外部副作用的最终结果仍需单独获得。

## CV2-014 · P1 · CLI Core 工具执行丢失取消信号

**约束与生产路径。** Ink 的停止动作向 activeAbortController 发信号（`apps/cli/src/ui/app.tsx:144,216,484`）；Print 及流式 stdin 由 `apps/cli/src/repl.ts:114–148,225–236,385` 创建并传播信号。Core streaming model port 将其作为 AI SDK abortSignal（`core-streaming-model-adapter.ts:16–24`）。但 Core 在每个工具前检查信号后调用 `ToolRuntime.invoke` 时不传 signal（`agent-execution-engine.ts:599–617`），RuntimeHost.execute 的契约只有 ToolInvocation（`runtime-contract.ts:58–60`）。`core-local-runtime.ts:59–79` 经持久 Tool Journal 调 rawHost，`core-tool-adapter.ts:24–28` 只传 toolCallId。现有本地工具及 MCP 包装本可消费 abortSignal（`apps/cli/src/tools/index.ts:99–106,143–155,182–201`）。Readline 从 `repl.ts:923–969` 调用 Core 时也不传本回合 signal。

**影响与历史。** 此路径的取消可让下一步停止，却无法进入正在执行的工具调用及其传输层；当前 Core 在 invoke 返回后仍会尝试写这次结果，下一轮才会再次检查信号。工具本身是否支持取消和外部效果是否已发生取决于具体工具。f94fbf3（#17）引入适配器，596b6ed（#18）将其接入 CLI 主入口。未动态复现真实工具迟到返回。

**收敛与验收。** 由 Core 传递进程内取消上下文，经 Host adapter 传给有能力中断的工具和 MCP。持久状态仍按已知或未知结果核对，取消不意味着撤销已发生的效果。真实入口测试覆盖模型、审批、正在执行的本地工具及 MCP，验证取消后无需等待可取消工具完成，迟到回执也不能误推进 Run。

## CV2-016 · P2 · 本地审批协议在 Core 入口被收窄为布尔值

`stdio-approval.ts:17–24,56–58` 解码 updatedInput 与 interrupt。旧 `runChatLoop` 在 `chat.ts:172–194` 验证替换输入，在 `:405–415` 将 interrupt 变为 AbortSignal。默认本地 Core 入口在 `repl.ts:625–641,905–919` 和 `ui/app.tsx:198–208` 将这类响应折叠为 false；`ToolRuntime.invoke`（`tool-runtime.ts:63–85`）由此记录 approval 拒绝并抛错。当前有效防护为 policyVersion、输入指纹和重新评估，替换输入没有越权执行。行为缺口是主路径无法区分用户拒绝、替换请求和要求中断，且本地 approval 流程未通过 Core 事件持久化为可恢复的 awaiting_approval。596b6ed（#18）引入入口映射。审批 API 替换输入及旧循环语义保留情况是行为迁移证据，未经当前生产 CLI 动态对比。

验收保留 Core 的版本与摘要校验，使用明确的批准、拒绝、中断和申请替换输入的结果类型。替换参数走现有 schema 与权限门禁。以实际 stdio 和持久会话验证输入变更、迟到回复、取消、政策漂移及事件终态。

### CV2-010 动态补证

在 `/tmp/ocean-audit-sse-probe.cjs` 调用基线构建的真实 RunService.listEvents 和 RunController.streamEvents。数据库查询使用夹具，列值为 2、3，第二条 payload.sequence 为 0。以 Last-Event-ID 2 订阅时收到 SSE id 0；以收到的 id 0 重连后重新收到 id 2。该实验验证读出及传输行为，审批写入行值的来源仍由静态代码确认。未接真实 PostgreSQL 或 HTTP socket。

## CV2-020 · P1 · CLI Runtime 事件锁在进程崩溃后阻挡同 Run 写入

**约束与调用链。** `runOceanCoreLocal` → `AgentExecutionEngine` → `FileRuntimeEventStore.append`（`apps/cli/src/utils/runtime-event-store.ts:46–64`）用 `open(lockFile, 'wx')` 获得跨进程锁。释放只在 finally 执行，写入和恢复没有孤儿锁判定。该保护由 f94fbf3 引入。历史意图是避免破坏可能仍有效的锁，未证明有设计决策允许崩溃后无限阻塞。

**实际证据与影响。** `/tmp/ocean-audit-event-lock-probe.mjs` 使用真实基线 adapter 和隔离目录，子进程在成功建锁、调用读旧 revision 处 SIGKILL。父进程确认遗留锁存在且可读取旧 revision，重新 append 返回 EEXIST。只要锁文件未清理，SDK 的同 Run 继续写入不可用。该缺口独立于普通 CLI resume 创建新 Run 的 CV2-011。SessionStore transcript 写入也有同形目录锁（`session-store.ts:319–349`），此轮未注入崩溃验证该锁。

**验收。** 保留 revision CAS，采用进程退出后可释放的锁机制或具可验证 owner 和互斥接管的恢复协议。真实两个进程测试在建锁后、写入前及原子替换后 SIGKILL，校验不会破坏持久事件或并发有效所有权。

## CV2-021 · P2 · Run SSE 终止时可能遗漏最后一批事件

`RunController.streamEvents.poll`（`apps/gateway/src/run/run.controller.ts:278–287`）先查询事件，再单独读状态。若终态事务在两次读之间提交，poll 会发 done 并关闭，此时终态事件还未返回。2a1ca0e 引入顺序，027864d 更新 poll 并发保护及首轮状态复用。真实入口为 `GET /api/runs/:id/events`；CLI tasks --follow 的 SSE 消费行为需另验。

**动态证据。** 同一 `/tmp/ocean-audit-sse-probe.cjs` 以真实编译后的 Controller、可控 RunService 替身及响应捕获固定交错。首轮 running，第二轮列表为空，随后状态查询为 succeeded。断言响应只有 done、未排空新事件。真实数据库并发复现仍待验证。

**验收。** 复用数据库事件游标与终态事件契约，终态时重新排空或以同一快照判定事件和状态。以真实 HTTP 和 PostgreSQL 在提交边界控制交错，断言最终事件完整并支持 Last-Event-ID 重连。

### CV2-008、CV2-009、CV2-021 的 PostgreSQL 补证

运行 `bash /tmp/ocean-audit-pg-ownership.sh`，退出 0。脚本启动一次性 pgvector PostgreSQL、对本基线应用全量迁移，运行真实构建产物，结束后清理容器。受控时序由 `/tmp/ocean-audit-pg-ownership.cjs` 设定。

- CV2-008：先以真实 claimRun 持有运行权并通过 verifyRun，仅回拨 Run 的 updatedAt，再执行 WorkerService.onModuleInit 的恢复阶段。结果为 Run failed、工具步骤 unknown，原本有效的 owner 立刻不能通过 verifyRun。单 Node 进程使用不同所有权身份和真实数据库事务；未声称两个 Worker 进程同时运行。
- CV2-009：让已领取的模型 job 保持有效 Run owner，再用另一 Worker 身份实际领取独立工具消息。真实 executeAndSettle → ToolExecutor.execute 将消息置 processed，零工具步骤落库，模型 job 原来的 owner 仍有效。用例置入一个执行即失败的工具分支探针，确认该分支未到达。
- CV2-021：执行真实 RunService 事件查询，随后在同一次轮询的状态查询前提交 PostgreSQL 终态事务和终态事件。事件确实存在于库中，Controller 捕获到的输出只有 done，未发该事件。这次验证包含真实数据库与业务方法，响应写入由内存对象捕获。

## CV2-023 · P2 · 续租时间把配置的租期叠加两次

`OutboxService.claimRunRequests`（`apps/gateway/src/run/outbox.service.ts:70–84`）保存数据库当前时间作为 lockedAt，用 lockedAt 加 leaseMs 判定过期。 `renewLease`（`:120–130`）却写入应用当前时间加 leaseMs。随后队列领取及 `run-ownership.ts:5–28` 再用 leaseMs 判断，导致续租后的有效窗口约为两倍。WorkerService 在每个 job 中定时调用此方法（`worker.service.ts:123–128`）。2a1ca0e 引入该写法。

隔离 PG 探针配置 30 秒，续租后按生产过期比较式查询剩余时间为 60.00 秒。该时序推迟了进程死亡后的可接管时间。应统一 lockedAt 为数据库当前时间，或以 expiresAt 一次计算到期并统一读取。验收对照初次领取和续租，到期边界及应用与数据库时钟差异，保留原有 attempt fencing。

## CV2-024 · P2 · Worker 入口重复运行 Nest 生命周期钩子

`apps/gateway/src/worker/main.ts:16–30` 创建 Nest application context 后手工调用 WorkerService.onModuleInit，并在 app.close 前手工调用 onModuleDestroy。安装的 Nest 运行时在 createApplicationContext 中调用 context.init，init/close 负责相应钩子。真实数据库恢复在 `worker.service.ts:46–50` 先于 start 的 running 幂等保护，因此第二次显式 init 会再次扫描与恢复，且第一次启动的轮询已经可能进行。停止重复调用目前主要造成重复日志。该入口逻辑源于 2a1ca0e。

`node /tmp/ocean-audit-nest-hooks.cjs` 用仓库安装的 Nest 容器和 fixture provider 复现框架自动调用，照入口顺序增加显式调用后 init/destroy 各两次。生产 WorkerModule 没有在这个 fixture 中加载。验收让 Nest 统一管理钩子，在生产 Worker 装配启动/关闭用例里断言只执行一次恢复及一次停止。

## CV2-025 · P2 · CLI journal 对可执行的大输入产生不一致的恢复结果

**约束与生产路径。** 可投递工具输入应具有可持久、可恢复的证据，所有恢复入口对同一终态应一致。CLI Core 将输入交给 SessionStore.executeToolCall（`apps/cli/src/llm/core-local-runtime.ts:59–78`）。SessionStore 在执行前写入 inputDigest，但 `safeJournalInput` 对大于 64 KiB 的参数返回 undefined（`session-store.ts:39–85,473–480`）。随后仍然执行并可写入 succeeded。重复调用检查和兼容重建都要求 journal 原始 input（`:65–74,124–137`），而 Core-facing readToolCallJournal（`:267–287`）允许没有 input 的终态并返回摘要和结果。Core 模型决策上限目前为编码长度 4 MiB（`agent-execution-engine.ts:78–83`），因此两端门槛不同。0cf0263 引入 64 KiB 留存逻辑，596b6ed 引入 Core-facing 检查，后来 Core 的上限继续单独演进。

**实际影响与验证。** `node /tmp/ocean-audit-journal-size.mjs` 使用真实 SessionStore 和临时目录，传入 70 KiB fixture。首次执行一次并成功，journal 缺 input，第二次相同调用被阻止；Core-facing journal 检查却返回 succeeded。此次证明损失的是可复用性及恢复一致性，未观察到重复副作用。Core resume 是否通过事件里的 input 安全重建需结合具体调用与保留策略验证。

**验收。** 在第一次执行前应用与存储一致的预算，或者将 Core 事件与 journal 约定为可复核的联合证据。使用同一封装校验终态记录，并覆盖边界输入大小、多字节数据、重复调用、崩溃后恢复和旧格式。

## CV2-027 · P1 · Gateway 用户重试已排队，但 Core failed 状态无法启动

**约束与路径。** `RunController.retry → RunService.retry → requeueRun`（`apps/gateway/src/run/run.controller.ts:36–40`、`run.service.ts:163–165,256–324`）允许 failed、cancelled 和 paused，将 AgentRun 置 queued 并入队原 runId。Core 事件没有相应动作。Worker `RunRunner` 调 `GatewayCoreLifecycle.startModel`，`AgentExecutionEngine.startDurableModel`（`packages/shared/core/src/agent-execution-engine.ts:339–363`）拒绝从 failed 进入模型段。原 Run API 由 ac0bd35 引入，2313214（#19）加入 durable 启动门禁；常规 retryable 模型失败走 markInterrupted，故障限于 API 接收但 Core 已进入 failed 等不一致状态。

**隔离 PostgreSQL 实证。** 真正的 Worker、RunRunner、Core 生命周期和 RunController 使用同一个测试数据库。模型 fixture 第一次返回无效工具调用，触发确定性失败，Run 与 Core 均为 failed。调用 RunController.retry 获得 queued，Worker 领取后记录 `Durable cannot begin model call in state failed`。模型调用次数仍为 1。探针调用实际 Controller 方法，不经过 HTTP socket。

**收敛及验收。** 先规定终态失败的重试身份和安全进入条件。由 Core 权威决定同 Run 恢复、带新身份的尝试或拒绝，并在同一事务提交可执行状态与 Outbox。验证生产 HTTP retry 的确定性失败、瞬时失败、未知工具、取消和重复重试，断言不会把无法执行的动作报告为 queued。

## CV2-028 · P2 · 终态 Run 的遗留模型消息被反复重试

`claimRun`（`run-ownership.ts:5–18`）将非 queued/running 和活锁争用统一折叠为 false。 `RunRunner.execute`（`run-runner.ts:112–119`）在业务查询前为所有 false 返回 retryable true。`WorkerService.settle`（`worker.service.ts:160–183`）调用 `OutboxService.markFailed`（`outbox.service.ts:133–150`），保留 pending 并只延期，领取 SQL 没有最大次数条件。该默认分类可追至 6a8372b。它与 CV2-009 的错误方向相反：同样的所有权失败，模型执行器始终续投，工具执行器通常确认。

**隔离 PostgreSQL 实证。** 为真实失败终态 Run 构造一条合法的旧模型消息。真实 Worker 投递后没有调用模型，Outbox 仍为 pending，释放 lockedBy 并推迟 availableAt，lastError 为 Run ownership unavailable。此轮复现一次重试及其可再领取条件，未运行无限轮次。

**验收。** 定义共享领取结果分类，区分终态、已完成、可重试争用、不可用身份和过期 ownership。ALREADY terminal 应确认陈旧投递，实际争用保持 pending。PG 用例断言工作不会提前丢失，且错误终态无需无限延期。

### 待复核 · 无人回应的审批 TTL

`ApprovalMaintenanceService.sweep` 仅过期 approved 的 session grant，清理旧 expired/superseded。RunService 在用户提交迟到决策时检查 pending 的 expiresAt，默认 Chat 查询会滤除过期 pending。当前未找到负责推进无人回应的 pending 审批及其 waiting_for_approval Run 的定时转换。待核对生产 HTTP/CLI 是否投递取消和过期事务的全路径。

## CV2-029 · P1 · Gateway 取消后 Host 与 Core 对工具终态的描述分叉

**生产路径与约束。** `RunController.cancel → RunService.cancelInTransaction → cancelDescendants`（`apps/gateway/src/run/run.controller.ts:137–140`、`run.service.ts:373–468`）事务内停止后代 Run、清 ownership、确认未决 job、把 started 工具 RunStep 标为 unknown。该路径未写入 RuntimeCoreEvent。 `ToolExecutor.executeOwned`（`tool-executor.ts:360–405`）先写 Core prepared，然后调用外部工具；结束后的 fenced transaction 因取消导致 ownership 消失而无法持久化结果。取消的 Host 防护能阻止迟到结果继续推进，但 Core 仍保留 executing_tools/prepared。0cf0263 引入子树取消，596b6ed 接入 ToolExecutor 的 Core prepared，两个写入边界在当前基线没有共同取消事务。

**实际验证。** 隔离 PostgreSQL 中由生产 ToolExecutor 和真实注册契约驱动延迟 fixture，等 prepared 后调用实际 RunController.cancel，再释放 fixture。确认 Run cancelled、RunStep unknown、未发布 tool.completed、无 pending job；Core 正常 replay 却返回 executing_tools 且调用留在 prepared。没有使用真实外部副作用。此分叉影响重放、诊断和恢复决策，关联 CV2-007、CV2-027；本轮未观察到自动重放。

**验收。** 以 Core 规则推导 cancel 与未知结果，在同一 fencing 事务写 Runtime、Run、RunStep 和 Outbox，保留外部效果未确认时的 unknown。用真实 HTTP 与两个 Worker、受控外部回执检查取消前后交错、迟到响应、无后续模型调用和明确可恢复状态。

## CV2-030 · P2 · 无人回应的 Gateway Run 审批超过 TTL 仍挂起

**生产路径与证据。** `ToolExecutor.ensureApproval/createApprovalArtifacts`（`tool-executor.ts:578–642,666–727`）创建 24 小时 pending 审批、把 Run 改为 waiting_for_approval 并结束原工具 job。 `ApprovalMaintenanceService.sweep`（`approval-maintenance.service.ts:19–34`）只过期已批准的 session grant；`RunService.getPendingChatInteraction`（`run.service.ts:175–205`）会隐藏到期 pending，而外部审批列表（`:924–930`）仍返回 pending。过期 Run 的现有终止路径需要收到迟到的 decide 请求（`:680–706`），主动取消也能终止。交互 Chat 超时不会主动取消（`chat.service.ts:229–239`）。0cf0263 引入维护服务；生产 RunModule 实际注册，缺口在 sweep 范围与事务。

**实际验证。** 隔离 PostgreSQL 由真实 ToolExecutor 创建等待审批的 Run，测试仅回拨 expiresAt，再执行实际维护服务 sweep。审批保持 pending、Run 仍 waiting_for_approval，没有可消费的任务，且过期审批留在 pending 列表。此轮没有依赖等待 24 小时的真实时钟。

**验收。** 复用 Run 的终止/撤销权限事务，在定时维护中以过期时间和 pending CAS 处理 Run、审批、Core 以及事件。并发到期和批准时验证仅一个决策获胜。验证没有用户答复、客户端断开及迟到审批均不会悬挂或执行过期工具。

## CV2-031 · P3 · Run 创建指标重复递增

`RunService.createInTransaction`（`run.service.ts:126–127`）对同一个 Run 和 Space 连续调用两次相同的 `metrics.inc('run.created')`。真实生产调用方是 ChatService.runChatStream、RunController.create 和使用该事务入口的计划执行。两行均由 027864d 引入。静态证据显示单次成功创建产生两个指标增量；未查线上报警或（数据库回滚时的）指标误差规模。保留一次计数并用事务成功/失败和幂等重试的指标断言验收。

## CV2-032 · P1 · Core 重放缺少运行时事件枚举验证

`replayRuntime`（`packages/shared/core/src/runtime-contract.ts:76–156`）校验已知版本和部分身份，但直接把 `tool.settled.outcome` 写入 pendingTools，最后的 catch-all 分支把任何未匹配事件当作 reconcile，只检查前一状态是 unknown。生产 `FileRuntimeEventStore.read` 与 `PrismaRuntimeEventStore.read` 都将存储读回的 JSON cast 为 RuntimeEvent，依靠 reducer 校验（`apps/cli/src/utils/runtime-event-store.ts:33–40`、`apps/gateway/src/run/runtime-event-store.ts:12–22`）。分支从 f94fbf3（#17）起存在。

受控 `/tmp/ocean-audit-core-replay.cjs` 运行真实构建后 reducer。正常 unknown 会阻止完成；未知 outcome 或未声明的事件类型可令同一流进入 completed。这里验证损坏存储的容错失效。没有证明外部调用者能向生产事件存储写入此类数据，也未动态复现真实工具重放。

保留同一 reducer，先对 JSON 事件做明确的 discriminated schema 验证，明确拒绝未知事件和 outcome。用实际文件及 PostgreSQL adapter 验收非法事件、历史无 schemaVersion 的合法流、旧版本以及 unknown 状态的完成门禁。

## CV2-037 · P1 · 历史工具幂等回填与实际兼容查找规则分叉

`20261122010000_tool_idempotency_backfill/migration.sql:1–28` 只提取顶层 JSON 键。重复键保留 NULL，注释预期由兼容扫描保守处理。 `ToolExecutor.findSucceededByIdempotencyKey/inputKey`（`apps/gateway/src/worker/tool-executor.ts:493–535`）列索引未命中时按 seq 降序使用第一条匹配，只校验这一个记录的工具与参数。历史嵌套 `{toolCall: ...}` 虽被 RunRunner 的历史分派判断识别（`run-runner.ts:911–917`），幂等查询却不识别。0cf0263 引入回退查询，596b6ed 引入 SQL 回填。

**隔离 PG 实证。** `bash /tmp/ocean-audit-pg-migration.sh` 先部署基线 schema，再向独立库插入模拟旧数据、重跑基线回填 SQL，检查唯一顶层键入索引、冲突键仍为 NULL、嵌套记录仍为 NULL。真实 lookup 将同时存在 unknown 和 succeeded 的同键不同输入历史判为命中最新 succeeded；对嵌套格式返回 null。也验证了唯一索引对已回填键拒绝重复。此次只调用查询，没有执行工具，未声称成功重放任何外部效果。该探针验证迁移 SQL 对存量行的转换，未覆盖上一版本镜像经发布入口完整升级。

**验收。** 以单一解析规则兼容已知历史形状。重复键全量核验，任何身份冲突或未知结果保持待协调，不应以最新一条覆盖历史证据。使用升级前数据集覆盖 JSON 冲突、未知与成功混合、平铺/嵌套和同时存在的列值，断言没有重复效果也没有错误复用。

### CV2-004／CV2-005 · 发布规格和升级补证

以 git show 从锁定基线导出两个 Compose 文件到临时目录，创建空 .env，提供虚拟数据库 URL、JWT 和 PG 值并运行 `docker compose … config --services`。常规 Compose 渲染出 worker，独立生产规格没有 worker。未启动整套 Compose，当前线上使用哪套规格仍未验证。

`bash /tmp/ocean-audit-pg-upgrade.sh` 使用一次性 PostgreSQL 容器。先运行全量迁移，再插入一条缺少列幂等键但 JSON 含有效键的旧 RunStep，重置最后一条纯数据迁移的应用记录。以 `prisma db push --accept-data-loss --schema prisma/schema.prisma` 顺序验证同一行的列值保持 NULL，随后 `prisma migrate deploy` 应用未登记的回填迁移并填入键。本次复现的是默认镜像命令与版本化迁移的存量数据行为差异。没有覆盖从更早版本全量升级或真实生产启动。

## CV2-039 · P2 · 常规 Compose 没有让 Worker 等待 schema 就绪

`docker-compose.yml:48–75` 的 Worker 覆盖镜像默认命令，直接执行 `worker/main`，依赖 PostgreSQL 的 pg_isready 和 Redis 启动。Gateway 服务使用镜像的 db push 后再启动 HTTP（`apps/gateway/Dockerfile:51`）。Worker 没有依赖 Gateway 或独立迁移完成条件。`WorkerModule` 会加载 RunModule，而 `ApprovalMaintenanceService.onModuleInit`（`apps/gateway/src/run/approval-maintenance.service.ts:36–38`）在应用 context 初始化时立即执行 RunApproval 更新；WorkerService.onModuleInit 也会查 agent_runs。PG 接收连接可早于这些表或新列创建，存在空库首次启动或升级时先访问旧 schema 的窗口。f208d98 引入常规 Compose Worker。现有 restart: always 会触发重启，启动是否失败及恢复时间取决于实际时序。此项由生产配置和生命周期源码确认，未动态复现容器启动竞态。

**验收。** 独立迁移 job 用版本化命令并作为 Gateway 和 Worker 的成功前置条件。验证空数据卷、升级数据卷及迁移失败，断言没有 Worker 在 schema 就绪前启动轮询。

## CV2-040 · P2 · Gateway 重启后没有收尾过期的 dispatched 设备操作

**约束与路径。** Gateway Worker 的 `ToolExecutor → ToolRegistry → createDeviceTools → DeviceRpcBroker.request` 将设备操作按 Run/toolCall ID 写入 Outbox。 `DeviceRpcDispatcher.poll`（`apps/gateway/src/chat/device-rpc.dispatcher.ts:23–35`）只领取 pending，原实例将消息设为 dispatched 后等待 Socket RPC，再按 owner CAS 结算（`:72–91`）。Broker 请求仍在运行时能把到期或取消的 dispatched 改成 uncertain（`apps/gateway/src/tool/device-rpc.broker.ts:48–67`）。进程退出后没有独立扫尾入口，且 `RunService.cancelDescendants/cancelInTransaction` 只处理 pending 设备行（`run.service.ts:394,442`）。d5555aa 引入设备 broker 和 dispatcher。

**隔离 PG 实证。** `bash /tmp/ocean-audit-pg-device.sh` 预置一个已过期、属于旧 Gateway 实例的 dispatched 行。调用真实新 Dispatcher.poll，再经 RunController.cancel 取消 Run。设备行一直为 dispatched，原 owner 字段保留，没有发送 RPC。这证明投递不会因这条路径重放，同时未知结果不能进入可审计终态。探针模拟进程退出后的持久状态，未终止真实设备连接或执行外部工具。

**验收。** 用持久 expiry 和 owner 做唯一结算，旧实例不在且到期时只提交 uncertain，禁止补发。在可验证设备回执可用时通过现有协调机制修正。测试覆盖已领取但未发、已发后断线、旧实例晚回包、Run 已取消及新实例轮询。

## CV2-041 · P1 · Desktop 本地项目写入未复用 Workspace Host 边界

Desktop preload 暴露 createLocalProject（`apps/desktop/src/preload/index.ts:6`）。主进程处理器（`apps/desktop/src/main/index.ts:125–142`）直接使用 renderer 提供的项目名拼接目标路径并创建目录，未校验路径归属或复用同文件 `:59–71` 的可信窗口和顶层 frame 门槛。其余原生文件选择与显示入口亦未复用该 sender 门槛。2edb4a9 引入项目目录处理器，d049809 引入 Workspace Host 的 sender 核验。该路径承担产品项目创建，影响范围为本地目录写入及原生 IPC 信任边界。此项为静态证据，未启动 Electron 或执行异常路径。

验收应复用主进程可信 renderer 校验，对项目名做单段校验并确认目标位于根目录，覆盖正常项目、无效名称和非可信发起者。
