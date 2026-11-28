# 收敛任务 · 阶段证据

| 问题 | 权威实现及涉及文件 | 收敛工作与依赖 | 自动化验收 |
|---|---|---|---|
| CV2-001 | `packages/shared/core/src/agent-execution-engine.ts` 的 planAgentTurn，`apps/gateway/src/worker/run-runner.ts` 和 Core durable 生命周期 | 保留 Engine 和 ownership-fenced 事务，核清 RunStep、Runtime 与 Outbox 一致性后，将模型前推进决策接入真实 readiness。去除固定输入承担模型前门禁的假设 | PostgreSQL Worker 场景验证待投递、未结工具及取消时 provider 不被调用，零工具、单工具、多工具结果依次落库并正确终止 |
| CV2-002 | Core AgentExecutionEngine 与 CLI core-local-runtime | 保留共享 inline 引擎，先迁移 legacy 路由仍承载的临时会话及其他已证明行为，再移除 `repl.ts` / `ui/app.tsx` 的 legacy 选择和 `llm/chat.ts` 中已无生产调用的旧循环段 | 从 CLI 实际入口覆盖持久和临时模式、审批、取消、Stop 反馈及子代理，断言统一走 Core |
| CV2-003 | RunService、Worker 与 Core durable | 先补齐旧直驱仍承载的合法 Chat 行为，验证后移除 `chat.controller.ts` 的旧执行入口与 `skill.orchestrator.ts` 中无调用的循环 | 默认与历史配置下运行真实 HTTP Chat，覆盖工具、审批、取消和恢复 |
| CV2-004 | WorkerModule、发布 Compose | 在正式发布规格中启动同版本 Worker，统一部署入口与健康检查 | 隔离 Compose 的 HTTP → Outbox → Worker → SSE，含重启恢复 |
| CV2-005 | Prisma 版本化迁移 | 发布阶段运行 migrate deploy，并使 HTTP 和 Worker 等待迁移成功 | 用上版 schema 和历史工具步骤运行升级，核对回填及重复投递 |
| CV2-006 | CLI 已有的严格 frontmatter 校验作为共享解析输入 | 提取校验和解析，替换两端重复实现并保留各自来源行为 | CLI/Gateway 使用同一 YAML 测试语料并校验安全边界 |
| CV2-007 | ToolOutcomeReconciler、GatewayCoreLifecycle、WorkerModule | 注册真实只读查询适配器，对齐执行失败、恢复和结果协调的持久化写入，保留 unsupported/unknown 的拒绝重放规则 | 生产 DI + PostgreSQL，验证真实身份查询、错配、重复和无适配器，断言 RunStep、Core 及事件一致 |
| CV2-008 | run-ownership 的事务与租约规则、WorkerService 启动恢复 | 将启动恢复纳入同一 ownership 检查；有未解决工具时维持禁止重放 | 两 Worker 跨阈值活租约及实际过期，验证仅过期后接管 |
| CV2-009 | claimRun 与 Worker Outbox settle | 领取冲突保留消息，终态及已结算消息按可证明状态确认 | 两 Worker 争用时工具 job 最终只执行一次 |
| CV2-010 | RunService 事件 append/list 与 RunController SSE | 统一事件行和输出序号，兼容历史审批序号差异，验证末尾事件排空 | PostgreSQL 审批、轮询与断线重连用例 |
| CV2-011 | AgentExecutionEngine.resume、FileRuntimeEventStore、CLI SessionStore | 为 CLI 恢复入口接入 Session → 当前 Run 的持久身份和恢复判定，复用 Core 现有协议 | 真实 CLI 崩溃、重启和同 Run 恢复，覆盖未结工具与审批 |
| CV2-012 | createCliRuntimeRecovery、SessionStore.load | 新格式统一通过 Core/journal 证明回填；旧格式仅在兼容 adapter 中重建 | 旧格式、终态结果丢失、坏摘要、重入、顺序和未知结果 |
| CV2-013 | Core context-engine、CLI compactContext、Gateway compactChatHistory | 统一压缩触发、边界和缓存契约，保留 provider、存储和已验证的工具结果适配 | 同一套 CLI/Gateway 长会话、fork、缓存失效、工具配对和压缩失败验收 |
| CV2-014 | Core ToolRuntime + CLI/Gateway 工具 adapter | 传递取消上下文到支持取消的工具，保留迟到结果及未知效果的 journal 核对 | 从 Ink/Readline/Print 启动真实本地及 MCP 测试工具后中断 |
| CV2-015 | Core 执行协议、CLI 委派约束、Gateway child Run 生命周期 | 将父 Runtime 的委派和回填收敛到共享协议；迁移仍在 CLI legacy 的内建注册 | 两 Host 同场景的委派、持久化、阻断/取消、重复请求 |
| CV2-016 | Core ToolRuntime 的验证与审批结果契约、CLI stdio adapter | 保留批准、拒绝、取消及替换输入的区别，参数变化重新经过校验和权限 | 实际 stdio 入口覆盖替换参数、中断、政策变化及迟到答复 |
| CV2-017 | Core activation 语义、Gateway SkillLoader | 将已选与自动激活的 Skill 纳入默认 Run 的内容与约束装配，维持认证租户和 session 边界 | Gateway HTTP 触发选中 Skill，provider 收到真实正文并检查 Runtime 约束和恢复 |
| CV2-018 | Core 已共享分页；CLI/Gateway loader | 合并可共享配置语义，保留来源信任、连接池、OAuth 与环境隔离的 Host adapter | 同一配置语料跨 Host 验证覆盖和变量，再验证生产连接与权限隔离 |
| CV2-019 | verify-postgres.sh、CI workflow、CLI build | 构建 CLI 并配置 CLI_ENTRY，将三项远程用例纳入必跑发布门 | 输出用例执行和跳过计数，并记录发布 commit 与镜像 digest |
| CV2-020 | FileRuntimeEventStore CAS 与原子写入 | 保留 revision 检查，接入可验证的崩溃锁释放或接管 | 实际子进程 SIGKILL，覆盖建锁后、落库前后，验证同 Run 可恢复且互斥 |
| CV2-021 | RunController/RunService 事件序号及查询 | 与 CV2-010 一并修复，终态事件排空后再 close | HTTP + PostgreSQL 两事务交错，断言完整 SSE 及重连无丢失 |
| CV2-022 | Worker durable 装配及其端口测试 | 核实发布导出和动态消费者后清理仅测试可达的 inline 工厂与 adapter | 替换依赖该工厂的测试后，Worker 入口和验证场景覆盖不退化 |
| CV2-023 | OutboxService 与 run-ownership 的到期判定 | 使用同一数据库时钟和单次租期计算，保留 attempt fencing | PostgreSQL 验证初次领取、续租、时钟差和最大接管等待 |
| CV2-024 | Nest WorkerModule 生命周期 | 移除重复的手工 init/destroy，并用生产入口观察启动恢复与优雅关闭 | 正常 Worker 启停时各调用一次，活 job 的交接继续遵守租约 |
| CV2-025 | SessionStore 终态 journal 校验、Core durable 输入约束 | 保留单次效果围栏，统一输入预算与终态恢复证据 | 真实持久目录覆盖 64 KiB 边界及多字节，验证重复调用及恢复 |
| CV2-026 | recoveryStatePrompt、SessionStore、Core context 装配 | 将已有确定性执行状态接入默认入口及 token accounting | 真实 CLI --resume 验证 plan/worktree/subagent 状态进入 provider 请求且不作为指令 |
| CV2-027 | Core durable 状态与 RunService.retry 事务 | 用权威重试指令对齐 Run、Runtime 与 Outbox；不可执行时给出确定错误 | 真 HTTP + PG 验证 Core failed、瞬时失败、unknown、取消及重复重试 |
| CV2-028 | claimRun、RunRunner/ToolExecutor 和 Worker settle | 共享领取失败分类，已终态消息正常结算，实际争用保留重试 | PG 并列验证终态、活所有权、过期与重复消息，覆盖 CV2-009 |
| CV2-029 | RunService.cancelInTransaction、Core durable 与 ToolExecutor | 把取消及未知结果纳入单一持久事务，保留对迟到回执的 fencing | PG + HTTP 取消 in-flight 工具，检查父子 Run、Runtime、journal、SSE 和无新模型调用 |
| CV2-030 | ApprovalMaintenanceService 与 RunService 审批状态迁移 | 对到期 pending 以 CAS 做统一终止并发布事件，处理迟到批准 | PG 同时推进批准/到期，验证未答复、断流及恢复 |
| CV2-031 | RunService.createInTransaction | 单个有效创建只递增一次指标 | 指标断言覆盖成功、事务失败及幂等复用 |
| CV2-032 | Core replayRuntime、文件与 Prisma event store | 统一运行时事件解码和状态校验，保留无版本历史流的兼容读 | 两种真实存储均拒绝未知事件/outcome，不允许未知效果进入完成 |
| CV2-033 | RunRunner.restoreChatHistory、Core 工具身份与顺序校验 | 复用已有批次规则补齐多工具历史还原，保留同模型和预算门槛 | 隔离 PG / HTTP 同 Session 两轮，核对多工具、fork 与超预算 |
| CV2-034 | RunController.cancel、Chat 传输、共享 useChatSession | 独立表达明确的停止操作，后端使用 active Run 身份；普通断流支持恢复 | Web/Desktop 停止及断线两类端到端测试 |
| CV2-035 | SessionService 的分支写入和 ChatController 的投影 | 按同会话验证 parent、消除孤儿历史 | PG / HTTP 覆盖有效分支、根节点及无效 parent |
| CV2-036 | ModelRegistry.getAvailableModels | 核实引用后清理旧方法 | 模型列表 HTTP 回归及 Host UI 接入 |
| CV2-037 | ToolExecutor 查询、历史 RunStep 输入与 backfill SQL | 对齐历史格式，保守处理全量同键历史及未知效果 | 隔离 PG 旧库升级，覆盖冲突、重复、嵌套及列值 |
| CV2-038 | deploy.yml 与已发布镜像标识 | 将质量门对应的不可变 digest 传入实际 Compose | 模拟两条发布链并记录每个服务实际镜像摘要 |
| CV2-039 | Gateway/Worker Compose 与 Prisma migration 入口 | 独立迁移 gate，两个服务共享同一 schema 完成条件 | 空库、历史库、迁移失败场景的容器启动顺序断言 |
| CV2-040 | DeviceRpcBroker、DeviceRpcDispatcher 和持久 Outbox 状态 | 用共享所有权/过期规则收尾 dispatched 为 uncertain，保留禁止重发 | PG 两 Gateway 的故障边界、取消、回执和无二次发送 |
| CV2-041 | Desktop 主进程 sender 核验及本地项目入口 | 复用现有可信窗口边界，并将写入限定在项目根 | Electron IPC 验证正常创建、非法路径及非可信 frame |

| 议题 | 保留与迁移 | 依赖与验收 |
|---|---|---|
| CV2-042 | 保留 apps/cli/src/utils/task-manager.ts 中的 SessionTaskManager。将 daemon.ts 与 tools/local/plan.ts 的旧 RPC 接到按会话存储，迁完消费者再删除静态计划列表。 | 明确旧 RPC 无 sessionId 时的协议；两个会话交替更新、退出、重启和推送均保持隔离。 |
| CV2-043 | 保留 packages/shared/core/src/filesystem/checkpoints.ts 和 file-system.ts。修正活跃 owner 判定与释放逻辑，全部 Host 继续共用。 | 跨进程覆盖持锁时间超过阈值、死亡接管和迟到释放；核对多文件内容及 journal 状态。 |
| CV2-044 | 保留 Gateway 已带会话与分支约束的 pending-interaction 查询，在 ChatSession 的恢复 effect 补齐首次获取失败的重试与取消。 | 同一套 Web、Desktop 验收覆盖短时断网、重连、切换分支及卸载；核对仅当前分支显示并可完成审批或询问。 |
| CV2-045 | 将 CLI、Gateway 的 chat-image-middleware.ts 收敛为一份现有的 transformParams，实现归共享 Provider 适配层。 | 保留各 Host 模型工厂。两厂使用同一语料验证请求字段及工具结果顺序后删除 Host 副本。 |
| CV2-046 | RunRunner、ToolExecutor、RunService 共用事务内 RunEvent 写入，沿用现有 runEventSchema 和各调用方状态事务。 | 与 CV2-010 一并验收。现有历史事件兼容、并行写入及 SSE 重连均在隔离 PostgreSQL 验证。 |
| CV2-047 | MCPClientManager 保留 Sampling 协议入口，撤出 SkillOrchestrator.textResponse 的独立工具循环。按实际产品需要复用受控模型调用或 Core 子 Run。 | 验收父 Run 身份、预算、取消与工具授权，测试接真实生产装配的隔离协议替身。 |
| CV2-048 | 合并 skill-import.service.ts 与 skill-sync.service.ts 的图标、标签规则，锁定分类来源参数与默认值。 | 依赖 CV2-006 的解析契约。对同一份 SKILL.md 分别通过导入、启动同步，核对目录元数据。 |
| CV2-049 | 保留 Gateway MCPClientPool 的用户隔离与凭据轮换，统一 MCPConfigLoader、ClientManager 和传输层的变量解析责任，stdio 使用限定环境。 | 依赖 CV2-018 的配置合并规则。隔离 Worker 测试连接初始化、用户凭据轮换和子进程环境边界。 |
| CV2-050 | 保留 MCP 凭据接口、身份绑定与 OAuth 加密存储，提供 Gateway 和 Worker 的私有持久存储装配。 | 两服务下验证写入后即读、更新和撤销跨服务、容器重建及不同用户凭据隔离。 |
| CV2-051 | 保留 OAuth state、epoch 与 token 的互斥写入，修正异常退出后锁的回收。 | 依赖 CV2-043 的所有权模型。覆盖持锁进程退出、两个等待者竞争以及迟到的刷新或回调。 |
| CV2-052 | 保留全局管理入口和用户连接池，把池的失效条件接到 Gateway 与 Worker 共享的配置版本。 | 同时验证同 ID 内容修改、原子更换文件、删除和重建；要求独立 Worker 无需重启即可按定义收敛。 |

CV2-004、005、038、039 的部署接线已有 4791497f。当前实施只需补发布工件与存量迁移验收，继续复用现有 Compose、Worker 和独立迁移服务。
| CV2-053 | 保留池与 Loader，统一内置配置查找和镜像路径，区分平台路径与用户环境。 | 独立 Worker 镜像启动后的工具发现与连接使用本机夹具验收。 |
| CV2-054 | 保留已接入的 Run API，把 IM 发送端验证接在同步用户和建 Run 前。 | 覆盖无签名、无效签名及合法消息，核对身份、Run 与回执。 |
