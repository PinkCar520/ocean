# Claude Code 实现借鉴：逐文件差距与迁移方案

日期：2026-11-03  
参考：`../claude-code-sourcemap/restored-src/src/`（非官方还原源码，Claude Code 2.1.88）  
目的：把 Claude Code 能力逐项迁入 Ocean 原生 Agent，并按文件梳理目标落点。按用户指示，当前工作区 Claude Code 源码采用 MIT 许可。

## 产品理解先行：OLO 与 Ocean

### OLO 是什么

OLO 的产品基线 PRD v1.2 将其定义为“持续的个人智能层”，OLO One 是主要物理 Presence，iPhone/Watch 等是可接力的身体，Companion App 是确认、设置、历史与调试窗口，不是核心任务的必经入口。它要替用户理解现实 Context、预判是否介入、在授权范围内协调设备与服务，并验证现实结果、管理记忆，以减少认知负担。产品闭环是 Presence → Sense → Understand → Anticipate → Decide → Intervene → Orchestrate → Act → Verify → Learn；安静（SILENT）也是正确决策。高置信不等于高授权，隐私还有物理状态边界。

当前代码并非完整实现上述愿景。`OLO/App/RootShell.swift` 实际装配 Foundation Model understanding、规则 fallback、ReminderTool 和语音服务；`ControlledAgentRuntime.swift` 处理澄清、计划、权限等待、提醒执行/验证与持久化；`ReminderExecutor.swift` 写入系统提醒后读回校验；`WakeAlarmService.swift` 通过 AlarmKit 建闹钟并检查系统状态；Action Receipt Ledger 记录设备本地事实。Python Control Plane 已有 observation/context、intent/task、permission decision、action/result/receipt API；context 与 agent/runtime/permission/tool-gateway 是早期模块。故 OLO 当下可验证的核心能力主要是 iPhone 上的受控提醒与 Wake 原型，不能把“多身体持续个人 Agent”愿景当作已交付。

### Ocean 是什么

Ocean README 将其定位为重合规、物理隔离企业环境里的 AI 研发/工作流中枢：把开发环境与企业 IM、DevOps、知识库串起来，以自然语言驱动研发与业务流程。重点是企业身份透传、Space 隔离、MCP 连接器、声明式 Skill/SOP、权限治理、人审、审计和 Web/桌面触达。与 OLO 不同，它的主要对象是企业任务、工具和流程，而不是个人现实情境或硬件 Presence。

当前实现证据：NestJS Gateway 有聊天/RPC 和模型编排，Run/Outbox/Worker 持久化执行模型—工具循环，ToolExecutor 有幂等、审批、审计；MCP、Skill、RAG、代码、Space、SSO/用户、隐私、审计服务均有代码。Web 有 chats/projects/skills/workflows 等路由，但 `apps/web/src/app/app/page.tsx` 当前为空；README 所称 CLI/IM/自动化全生命周期能力不能仅凭愿景文字认为全部可用。`builtin.tools.ts` 现有工具包括 echo、演示用 counter、审批演示 notify、带出口白名单的 web.get 和 artifact 存取，企业真实工具另由 MCP/Zentao/Code 链路提供。因此 Ocean 是有真实后端运行骨架、产品集成能力仍分阶段完善的平台。

### 对迁移范围的影响

Claude Code 是代码库内的交互式编程 Agent。当前任务要求把其完整的适用能力迁入 Ocean 原生实现，目标包含 Ocean CLI 的编码工作流，以及 Gateway/Worker、Web/Desktop、工具、会话、权限、MCP、Skills/Plugins 和开发辅助能力；必须保留 Ocean 的企业身份、Space、审计和业务系统治理。OLO 的产品研究用于划清边界：本次实现目标是 Ocean，不把 shell、任意文件编辑或开发插件迁入 OLO。不能因为 Ocean/OLO 现有界面栈不同就把用户可见能力标为不迁；应在 Ocean 自己的技术栈中重做等价行为。

## 结论与边界

Ocean 已有耐久化 Run/Step/Event、Outbox/Worker、工具审批和审计，是最接近 Claude Code Agent 循环的目标；实现范围聚焦 Ocean 原生 coding Agent 的完整用户可见能力，并保持企业身份、Space 和审计治理。OLO 只做产品边界分析，不接收本次迁移代码。

映射分级：P0=安全/正确性闭环；P1=任务可控与可观察；P2=可选平台能力。Claude 文件是行为参考；目标文件是建议落点，不表示当前缺陷都已证实。采用前需阅读完整实现与测试，并用目标项目自己的测试证明行为。

## Ocean：逐文件映射

| 优先级 | Claude Code 参考文件 | Ocean 目标文件 | 借鉴机制与差距核对 | 落地建议 |
|---|---|---|---|---|
| P0 | `src/utils/permissions/permissions.ts`, `PermissionMode.ts`, `PermissionRule.ts`, `permissionRuleParser.ts`, `pathValidation.ts` | `apps/gateway/src/runtime/policy.evaluator.ts`, `tool/capability.registry.ts`, `skill/permission.service.ts`, `skill/permission.types.ts` | Gateway 已有首批：user/project/workspace-local 层级、deny 全局优先、四种 mode、Bash/Edit 参数化规则及 invalid-config fail-closed；CLI 与 Gateway 尚未共享同一决策实现，session 临时 allow、MCP server 规则、decision reason/ruleId/policyVersion 尚缺。 | 下一步统一输入为 actor/space/tool/capability/purpose/resource/risk/planRevision；输出 allow/deny/approval + ruleId/reason/version，补凭据路径/命令 AST 分类和跨端测试。 |
| P0 | `src/tools/BashTool/bashPermissions.ts`, `bashSecurity.ts`, `commandSemantics.ts`, `readOnlyValidation.ts`, `pathValidation.ts`, `destructiveCommandWarning.ts` | `apps/gateway/src/tool/tool.registry.ts`, `tool.types.ts`, `sandbox/egress-policy.ts`, `worker/tool-executor.ts` | Bash 特有语义不能照搬，但应借鉴执行前语义分类、参数/资源校验、危险操作单独拦截及沙盒边界。核对 MCP 工具是否也走同一策略门。 | 定义工具安全声明（读写/外发/破坏性/幂等/可查询/可取消），统一在 Executor 执行前验证；MCP 与 builtin 不得绕过。对网络出口、文件/代码工具做 capability-specific sandbox。 |
| P0 | `src/hooks/useCanUseTool.tsx`, `src/hooks/toolPermission/PermissionContext.ts`, `handlers/interactiveHandler.ts`, `permissionLogging.ts` | `apps/gateway/src/worker/tool-executor.ts`, `run/external-approval.controller.ts`, `run/run.service.ts`, `audit/audit.service.ts` | Claude 有权限请求上下文、交互决策与日志路径；Ocean 已有 approval gate。重点比较审批是否绑定精确 toolCall 输入、Run/用户/空间、过期时间和策略版本，审批后输入是否可变。 | Approval 记录绑定 toolCallId、输入摘要/哈希、capability、policyVersion、审批人和期限；执行前重新校验输入哈希和权限，批准后任何变更都重新审批；事件与审计包含拒绝/过期。 |
| P0 | `src/Task.ts`, `src/tools/TaskCreateTool/TaskCreateTool.ts`, `TaskGetTool/TaskGetTool.ts`, `TaskOutputTool/TaskOutputTool.tsx`, `src/utils/task/TaskOutput.ts` | `apps/gateway/src/run/run.service.ts`, `worker/run-runner.ts`, `worker/tool-executor.ts`, `run/run.controller.ts`, `run/outbox.service.ts` | Claude 后台任务支持创建、查询、读取输出；Ocean 已有 Run 状态、事件、步骤和流式 delta。需逐项确认取消、暂停、超时、重试的状态语义和输出游标/分页。 | 把用户可见任务操作收敛为稳定 API：get/events(afterSequence)/cancel/retry/resume；取消应传播到模型和工具，无法中止的外部动作标记 outcome_unknown 后查询对账，不伪报取消成功。 |
| P0 | `src/Task.ts`, `src/tasks/LocalAgentTask/LocalAgentTask.tsx`, `src/tasks/stopTask.ts` | `apps/gateway/src/worker/run-runner.ts`, `worker/worker.service.ts`, `run/outbox.service.ts` | 参考任务生命周期与 stop 语义；Ocean 已用 durable outbox、started step 续跑和幂等键，机制基础较强。 | 建立故障矩阵：模型请求前/中、tool requested 投递后、外部副作用后但落库前、审批中、租约过期；每个窗口明确重放/对账策略并覆盖规格测试。 |
| P0 | `src/tools/BashTool/BashTool.tsx`, `src/tools/FileReadTool/FileReadTool.ts`, `src/tools/FileEditTool/FileEditTool.ts` | `apps/gateway/src/worker/tool-executor.ts`, `tool/tool.registry.ts`, `runtime/tool.runtime.ts` | 工具各自拥有 schema、权限、执行和结果；Ocean 的通用 ToolExecutor 需要保证 schema 校验在 side effect 前发生，结果回馈结构化且限量。 | Registry 注册时强制 inputSchema、risk metadata、timeout、output limit、idempotency strategy；执行前 parse，执行后将 stdout/artifact 引用与错误类别分离。 |
| P1 | `src/hooks/useTaskListWatcher.ts`, `useTasksV2.ts`, `useBackgroundTaskNavigation.ts` | `apps/web/src/app/app/chat/[id]/page.tsx`, `components/ApprovalPanel.tsx`, `apps/web/src/app/actions/sessions.ts` | 后台任务状态订阅、导航回到任务与输出呈现。Ocean 的 Run Events 可以作为前端状态源。 | UI 以事件序号增量同步，显示 queued/running/waiting approval/paused/failed；断线后从 lastSequence 拉取，支持定位 approval 与失败步骤。 |
| P1 | `src/skills/loadSkillsDir.ts`, `src/skills/bundledSkills.ts`, `src/tools/SkillTool/SkillTool.ts`, `src/tools/SkillTool/prompt.ts` | `apps/gateway/src/skill/skill.loader.ts`, `runtime/skill.resolver.ts`, `skill-registry/skill-sync.service.ts`, `skill/skill.orchestrator.ts` | 参考技能来源发现、加载/触发和单独调用；检查 Ocean 的团队/空间/用户优先级、版本固定、技能内容不具授权效力、同步变更一致性。 | Skill 解析结果固定版本/hash；对来源和覆盖优先级做显式规则；把 skill instructions 当不可信提示输入，执行工具仍走统一权限门；同步提供 provenance。 |
| P1 | `src/services/mcp/client.ts`, `MCPConnectionManager.tsx`, `config.ts`, `normalization.ts`, `envExpansion.ts`, `channelPermissions.ts`, `mcpServerApproval.tsx` | `apps/gateway/src/mcp/mcp-client.manager.ts`, `mcp-config.loader.ts`, `mcp-config.watcher.ts`, `mcp-transport.factory.ts`, `mcp-server/mcp-server.service.ts` | Claude 对连接生命周期、配置规范化、通道权限及服务审批拆分；Ocean 已具 manager/watcher/transport。 | 为每个 Server 记录身份、来源、权限范围、健康/重连状态；配置变更先校验再原子切换；工具列表变化刷新 capability snapshot 并要求高风险变更审批。 |
| P1 | `src/tools/TodoWriteTool/TodoWriteTool.ts`, `TaskCreateTool/*` | `apps/gateway/src/run/*`, `apps/web/src/app/app/workflows/page.tsx` | Claude 将模型计划外显为可更新任务列表；Ocean Run steps 偏执行审计，未必等于用户计划。 | 分开 Plan 与 Execution Step；Plan 有 revision、依赖、状态和用户确认，重规划保留变更历史，不把推理文本当可信状态。 |
| P2 | `src/utils/swarm/permissionSync.ts`, `leaderPermissionBridge.ts`, `teammateInit.ts`, `src/tasks/InProcessTeammateTask/*` | `apps/gateway/src/worker/*`, `apps/gateway/src/space/*`, `apps/gateway/src/run/*` | 多 Agent 权限继承/委托是可借鉴点；Ocean 当前单 Run worker 结构，不应为“多 Agent”先引入复杂编排。 | 只有具备实际并行需求再设计子 Run；限定父 Run capability 上限、独立预算/审计、结果合并与取消传播，子 Agent 不得扩大权限。 |
| P2 | `src/services/mcp/elicitationHandler.ts`, `src/services/mcp/auth.ts` | `apps/gateway/src/mcp/*`, `apps/gateway/src/skill/interactive.manager.ts` | MCP 交互式补充信息与认证挑战可参考。 | 把 elicitation 建模为等待输入事件并具 schema/超时；凭证走 OAuth/secret store，禁止放入 prompt、Run output 或普通审计字段。 |

## OLO：逐文件映射

| 优先级 | Claude Code 参考文件 | OLO 目标文件 | 借鉴机制与差距核对 | 落地建议 |
|---|---|---|---|---|
| P0 | `src/Task.ts`, `src/tasks/stopTask.ts`, `src/utils/task/TaskOutput.ts` | `OLO/Core/Agent/AgentTask.swift`, `AgentRuntime.swift`, `App/ControlledAgentRuntime.swift`, `Persistence/AgentTaskRepository.swift` | Claude 的任务可观察与停止机制可映射到 OLO 生命周期；OLO 已有 richer states（permission/verify）与稳定任务标识。 | 检查每个状态是否可持久化恢复、取消是否触发设备动作补偿、重新理解是否保留 task identity；把事件序列与状态快照解耦。 |
| P0 | `src/utils/permissions/PermissionMode.ts`, `PermissionRule.ts`, `permissions.ts`, `denialTracking.ts` | `OLO/Core/Tools/PermissionLevel.swift`, `packages/permissions/src/olo_permissions/engine.py`, `OLO/Services/ReminderTool.swift` | Claude 的分层授权/拒绝原因适用于策略表达；不可替代 iOS TCC/系统授权。OLO Python permission engine 已按主体、能力、用途、身体、有效期与成本判定。 | 保持共享权限决策契约；设备执行前再次检查系统权限和用户意图新鲜度。拒绝记录只存最少信息，规则变化需明确撤销/再授权语义。 |
| P0 | `src/hooks/useCanUseTool.tsx`, `src/hooks/toolPermission/handlers/interactiveHandler.ts`, `PermissionContext.ts` | `OLO/Features/AgentActivity/ReminderConfirmationView.swift`, `OLO/App/ControlledAgentRuntime.swift`, `OLO/Core/Agent/ReminderIntent.swift` | 交互审批应绑定具体动作和参数，而非泛化“允许 Agent”。 | 确认卡展示动作、对象、时间/地点及影响；用户修改后生成新 plan revision 并重新决策；确认结果与 plan revision/intent digest 持久关联。 |
| P0 | `src/tools/FileEditTool/FileEditTool.ts`, `src/tools/BashTool/BashTool.tsx`, `src/tools/BashTool/bashSecurity.ts` | `OLO/Core/Tools/Tool.swift`, `ToolRegistry.swift`, `Services/ReminderTool.swift`, `Services/ReminderExecutor.swift`, `Services/WakeAlarmService.swift` | 不移植 Shell/任意文件能力；只借鉴工具自带 schema、预条件、安全检查、真实执行与结构化结果。 | 为每个 Apple action 声明 capability、参数 schema、系统权限、幂等/查询/取消特性；执行服务拒绝未注册或未授权调用。 |
| P0 | `src/tools/TaskOutputTool/TaskOutputTool.tsx`, `src/utils/task/TaskOutput.ts` | `OLO/Services/OLOActionReceiptLedger.swift`, `Features/Actions/ActionsView.swift`, `OLO/App/OLOAgentControlPlaneSync.swift` | 任务输出应能区分执行状态、失败和可恢复结果。OLO 的 Receipt Ledger 是更适合设备动作的本地权威记录。 | 将 action 状态/证据/错误/同步状态分开；Control Plane 回执不得覆盖设备本地证据；UI 可读本地状态并展示 outbox 重试。 |
| P0 | `src/utils/permissions/PermissionResult.ts`, `src/tools/TaskOutputTool/*` | `OLO/Services/ReminderExecutor.swift`, `WakeAlarmService.swift`, `WakeCalendarService.swift`, `OLOActionReceiptLedger.swift` | Claude 的工具结果不等同真实世界验证。OLO 已有 Reminder 写入后读回验证，应把“执行成功”和“verified”严格分态。 | 每类动作定义独立证据谓词、providerRef 和 outcome_unknown 对账流程；超时后先查询系统状态，避免盲目重试造成重复提醒/闹钟。 |
| P1 | `src/tools/TaskCreateTool/*`, `TaskGetTool/*`, `TaskOutputTool/*`, `TodoWriteTool/*` | `OLO/Core/Agent/AgentRequest.swift`, `AgentUnderstanding.swift`, `AgentTask.swift`, `Features/AgentActivity/AgentActivityView.swift` | 参考澄清、计划、任务读取、进度外显；OLO 的自然语言意图常有时间/对象歧义，计划不可被模型文本直接当事实。 | 明确区分 observation、intent、plan、permission、action、verification；缺信息进入 needs_information，用户答复修订原任务而非另建任务。 |
| P1 | `src/skills/loadSkillsDir.ts`, `bundledSkills.ts`, `SkillTool/SkillTool.ts` | `OLO/Core/Agent/AgentUnderstanding.swift`, `packages/model-adapters/src/olo_models/contract.py`, `services/agent-runtime/src/olo_agent/runtime.py` | OLO 当前不是通用 Skill 主导产品，不建议引入 Claude 式任意 skill 插件系统。可借鉴受控能力说明和版本固定。 | 如以后需要流程模板，采用签名/版本化的场景策略包，限定可用工具集合；模板不能扩大用户授权或绕过 Apple 权限。 |
| P1 | `src/services/mcp/client.ts`, `MCPConnectionManager.tsx`, `elicitationHandler.ts` | `services/tool-gateway/src/olo_tools/gateway.py`, `packages/contracts/*`, `services/api/src/olo_api/models.py` | MCP 仅作为未来 World/服务连接的协议参考；当前 OLO ToolGateway 的 action state machine 更匹配实际副作用。 | 外部服务 adapter 统一映射 ToolDescriptor 能力：idempotency/query/cancel/evidence；不确定结果进入 outcome_unknown，先 query 再重试。 |
| P1 | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx`, `src/remote/RemoteSessionManager.ts`, `remotePermissionBridge.ts` | `OLO/Services/OLOControlPlaneClient.swift`, `OLOAgentControlPlaneSync.swift`, `packages/contracts/*`, `services/api/*` | 远程会话可借鉴身份/权限透传与断线恢复；不能把云端接受等同设备侧执行。 | 每个动作使用稳定 request/action ID，客户端 outbox 有序上传；服务器 receipt 作为协调证据，设备 receipt 是本机观察事实；重连按事件序号去重补传。 |
| P2 | `src/services/teamMemorySync/secretScanner.ts`, `watcher.ts`, `teamMemSecretGuard.ts` | `OLO/Core/Memory/MemoryStore.swift`, `packages/memory/src/olo_memory/policy.py`, `services/context-engine/*` | 团队记忆同步机制不直接适合个人 Context，但 secret scanning、来源与生命周期治理可参考。 | 任何自动记忆提取需显式 provenance、敏感信息过滤、用户可见删除/修正；不得把临时任务内容默认提升为长期记忆。 |
| P2 | `src/utils/swarm/*`, `InProcessTeammateTask/*` | `services/agent-runtime/src/olo_agent/runtime.py`, `services/tool-gateway/src/olo_tools/gateway.py` | 多 Agent 并非 OLO 当前已验证需求。 | 暂不实现；若未来拆分感知/规划子 Agent，子任务继承同一主体权限且不能独立发出物理动作。 |

## 文件级优先顺序

### Ocean

1. **P0 权限策略契约**：对照 `runtime/policy.evaluator.ts`、`tool/capability.registry.ts`、`skill/permission.service.ts`，补齐理由、版本、资源范围、默认拒绝和测试矩阵。
2. **P0 工具执行前门**：对照 `tool-executor.ts`、`tool.registry.ts`、`tool.types.ts`，确保内建/MCP 工具统一过 schema、风险、审批、审计与幂等检查。
3. **P0 故障恢复规格**：在 `run-runner.ts`/`tool-executor.ts` 现有检查点基础上补齐副作用后崩溃和 outcome-unknown 对账。
4. **P1 任务 API/UI**：Run event cursor、cancel/resume/retry 状态与前端后台任务呈现。
5. **P1 Skills/MCP provenance**：版本快照、配置热切换与工具权限变更审批。

### OLO

1. **P0 权限绑定计划版本**：`PermissionLevel.swift` / Python engine / Reminder confirmation 三处采用同一可追踪决策契约。
2. **P0 动作真实结果**：逐项核对 Reminder/Wake 创建、验证、取消、重复提交、权限撤销、进程中断；Receipt 显示 verified 与 outcome_unknown。
3. **P0 任务恢复与取消**：对照 `AgentTask.swift`、repository、controlled runtime，恢复持久状态且不重放未核实副作用。
4. **P1 Control Plane 同步**：验证本地 outbox 与服务端 receipt 的去重、顺序、重连及冲突策略。
5. **P1 场景评测**：扩充确定性状态/权限/故障 fixture；现有 eval README 明确指出完整 runner/模型指标仍在后续计划。

## 重写边界与不适用项

- CLI 交互、键绑定、设置、会话历史、diff/plan/task UI 等用户可见能力都要迁到 Ocean；React/Ink 组件本身按 Ocean 技术栈重写，不以“不复制组件”作为不实现功能的理由。
- Shell、文件、Git、MCP、浏览器/LSP 等工具按 Ocean workspace、审批和网络边界重新实现；Claude 的命令分类或路径判断仅作为行为参考，不复制代码/文案。
- Anthropic 账号/额度、内部 telemetry/feature flag 和私有 remote 协议不能直接移植；逐项提供 Ocean 自有 provider/auth/metrics/session 等价实现，或在逐文件账本中写出确切的不可适用原因和替代行为。
- 多 Agent/Swarm、Plugin、Computer Use、Notebook、PowerShell、LSP、voice、background/remote tasks 等都属于完整能力盘点范围；需在 Ocean 中重写，不能因当前未有对应实现而默认为延期或不适用。权限继承、隔离、审计和取消必须同时达到验收。
- OLO 不在本次代码迁移目标内；其中的产品和代码分析仅用于说明跨产品边界。

## 证据限制与下一轮核验

本映射来自静态源码与现有文档，不代表已运行或端到端验证。Claude 源码是非官方 source map 还原版；Ocean Gateway 有既存测试文件；OLO 有 Python 单测与 Swift 原型实现。进入实现前，针对选定 P0 项逐个阅读参考文件完整实现/相关测试，再补目标项目测试和故障注入验证。许可上应保留来源说明，仅复写机制与接口行为，不复制代码、注释、提示词或产品文案。

## 全量源码模块清单与目标处置

源码树统计：`restored-src/src` 共 **1,902 个文件**（不含 node_modules）。以下按整个 `src` 树的目录/功能簇覆盖，给出迁移归属；这是功能簇映射，不声称 1,902 个文件都已逐行审阅。实施前应通过路径清单逐项勾稽。迁移表示重写行为/契约，不复制代码。

| Claude 源码目录/功能簇 | Ocean 目标/处置 | OLO 目标/处置 | 完全迁移所需工作 |
|---|---|---|---|
| `main.tsx`, `bootstrap/`, `entrypoints/`, `cli/`, `replLauncher.tsx`, `interactiveHelpers.tsx` | 在 `apps/cli` 实现 Ocean 原生命令行入口/认证/会话/交互；与 Gateway `chat`、`run` 打通 | 本次不迁入 OLO | 按每个入口与命令重写；验证登录、恢复、取消、TTY/非 TTY、发布与错误恢复 |
| `tools/`（184 files：Bash、FileRead/Edit/Write、Grep/Glob、Web、MCP、Task、Plan、Agent、LSP、Notebook、PowerShell、Computer Use 等） | 迁入 Ocean 原生 `apps/cli`, `apps/gateway/src/tool`, `runtime`, `worker` 与 Code workspace adapters | 本次不迁入 OLO | 每个工具盘点 schema、权限、执行环境、结果、超时、取消、幂等、审计；适用工具逐项实现与测试 |
| `utils/permissions/`, `hooks/toolPermission/`, `components/permissions/`, `components/TrustDialog/`, `ManagedSettingsSecurityDialog/` | 映射 `runtime/policy.evaluator`, `skill/permission.*`, `run/external-approval.controller`, Web `ApprovalPanel` | 映射 Python permissions engine、`PermissionLevel.swift`、Reminder confirmation；系统授权仍由 Apple 控制 | 重写权限 DSL/判定/交互/审计；加入租户、用户、capability、purpose、resource 约束和规则版本 |
| `services/mcp/`, `mcpServerApproval.tsx`, `MCPTool`, `ReadMcpResourceTool`, `ListMcpResourcesTool`, `ToolSearchTool` | 映射 Gateway MCP client/manager/config watcher/server registry/tool registry | 映射 Python ToolGateway/shared contracts；不让协议插件获得任意执行权 | 重写连接生命周期、认证、健康、工具发现快照、资源授权、断线恢复与审计 |
| `skills/`, `utils/plugins/`, `services/plugins/`, `commands/plugin/`, `components/skills/`, `components/mcp/` | 映射 skill loader/resolver/registry/sync/orchestrator、MCP registry、Web Skill Studio | 只迁版本化场景包概念，不开放通用插件市场 | 实现来源/优先级/manifest/版本/安装/更新/卸载/权限/签名/兼容性/变更刷新 |
| `Task.ts`, `tasks/`, `tools/Task*`, `utils/task/`, `components/tasks/`, `hooks/useTasks*`, `commands/tasks/` | 映射 `run/*`, `worker/*`, contracts, Web chat/task UI | 映射 AgentTask/Repository/ControlledRuntime/Activity/Receipt | 任务树、后台输出、停止、取消传播、进度游标、恢复/重试、子任务预算与审计 |
| `utils/swarm/`, `components/agents/`, `components/teams/`, `tools/Team*`, `SendMessageTool`, `InProcessTeammateTask/` | 迁入 Gateway 子 Run/Agent orchestration、space/capability 权限与 Web 任务协作 UI | 本次不迁入 OLO | 编排、权限继承、配额、死锁/失败恢复、结果聚合、取消和观察 UI |
| `context/`, `utils/memory/`, `memdir/`, `SessionMemory/`, `teamMemorySync/`, `extractMemories/`, `autoDream/`, `components/memory/` | 映射 `context.assembler`, `rag`, `session`；不迁本地 memory 格式 | 映射 context-engine、MemoryStore、memory policy、Memory UI | 来源与信任级别、敏感信息扫描、记忆升格/删除/纠正、跨端同步和冲突解决 |
| `services/api/`, `services/oauth/`, `utils/secureStorage/`, `deepLink/`, `telemetry/`, `analytics/`, `cost-tracker.ts`, `costHook.ts` | 供应商 API 改用 Ocean model gateway/auth/audit/metrics；不迁 Anthropic telemetry | 供应商适配到 model-adapters/API；不迁遥测 | provider adapter、OAuth/密钥、重试/限流/用量、隐私与企业合规 |
| `utils/model/`, `services/compact/`, `PromptSuggestion/`, `utils/suggestions/`, `ultraplan/`, `services/tools/` | 映射 ModelRegistry/PromptComposer/ContextAssembler/RunRunner | 映射 model-adapters/AgentRuntime/ContextEngine | 模型路由、上下文预算/压缩、提示建议、计划与验证，保留 provenance 和取消语义 |
| `services/lsp/`, `tools/LSPTool/`, `utils/computerUse/`, `claudeInChrome/`, `tools/Web*`, `NotebookEditTool` | Coding 产品候选映射 code workspace/tool adapters；需 sandbox + permission | 不适配当前产品边界，除非明确场景 | LSP、浏览器授权/隔离、计算机使用确认、网络出口、凭据隔离 |
| `bridge/`, `remote/`, `utils/teleport/`, `background/`, `filePersistence/`, `remoteManagedSettings/`, `cli/transports/` | 映射 `remote`, `session`, `run` | 映射 ControlPlaneClient/Sync/outbox；取稳定 ID、权限桥接、断线恢复模式 | 跨设备协议、设备绑定、同步冲突、远程授权撤销、离线队列和隐私边界 |
| `commands/`（207 files） | 逐命令映射 Ocean CLI native command 与 Gateway endpoint/Web UI；保留适用的 slash-command 能力 | 本次不迁入 OLO | 逐文件分类任务/配置/诊断/账号/会话/开发命令，为适用项新增 API/UX/权限 |
| `components/`, `ink/`, `screens/`, `buddy/`, `vim/`, `keybindings/`, `outputStyles/`, `history.ts` | Ocean CLI 用 Ink/终端等效 UI，Web/Desktop 按 Ocean 栈重做；逐个复现可用行为 | 本次不迁入 OLO | 体验等价需重建流式输出、Diff、审批、历史、快捷键、主题、状态栏和无障碍 |
| `voice/`, `services/voice*`, `commands/voice/` | 视需求映射 Web/Desktop 输入与 transcription adapter | 映射 AVVoiceService/VoiceView/权限流程，不迁供应商语音服务 | 捕获、STT、打断/取消、权限/隐私、端点状态和真机验证 |
| `utils/settings/`, `commands/config*`, `commands/theme`, `keybindings/`, `commands/vim/` | 配置概念映射 Web/Desktop settings；不迁 Vim/Ink | 只迁产品相关偏好到 Settings | schema、作用域、优先级、热加载、校验、导入导出与 UI |
| `utils/git/`, `commands/review/`, `commands/commit*`, `utils/sandbox/`, `utils/bash/` | Ocean Code/Review 候选落点 `apps/gateway/src/code`, `worker`, sandbox | 不迁，除非 OLO 增加代码工作区身体 | workspace、凭据、diff/patch、测试执行、命令白名单、网络隔离、审批与审计 |
| `services/analytics/`, `services/tips/`, `diagnosticTracking.ts`, `FeedbackSurvey` | 重新定义 Ocean 自有 observability/feedback，不复制事件 schema | 按 OLO 隐私原则自建诊断/反馈 | 最小采集、脱敏、开关、留存删除与透明度 |
| `migrations/`, `types/`, `constants/`, `schemas/`, `native-ts/`, `query/`, `QueryEngine.ts`, `Tool.ts`, `tasks.ts`, `tools.ts`, `context.ts`, `setup.ts` | 评估领域契约，在 `packages/contracts` / Gateway 重写 | 评估通用领域概念至共享 contracts/Python/Swift 类型 | 明确 schema owner/version/backward compatibility、迁移和回滚 |

## Ocean 原生迁移状态

目标是把 Claude Code 的完整适用能力迁到 Ocean 自己的 Agent Loop、Gateway/Worker、原生 CLI、工具、MCP/Skill/Plugin、会话协作与 Web/Desktop；不通过子进程启动另一款 CLI，不 vendoring runtime，也不复制实现代码。OLO 只作为产品边界研究，不属于本次实现范围。

首批原生改造落在 CLI 本地工具、安全层、Agent 工具适配器与 Gateway 权限层：工作区路径检查处理符号链接和 sibling-prefix 绕过；grep 在进程内搜索而非拼接 shell 命令；文件写入/编辑要求审批；没有审批通道时 fail closed；文件编辑拒绝不唯一匹配；新增精确 `file_patch`，先验证全部锚点唯一且不重叠，再原子写入；`file_read` 通过文件句柄限额读取并拒绝二进制/无效 UTF-8，支持行范围和取消；Shell cwd 限制在 workspace 并传播取消信号；结构化 `local_git` 已接入 CLI Agent Loop，只读操作免审批、仓库写操作逐次审批，并提供受控工作树；AI SDK 工具输入采用 `inputSchema` 且传递取消信号；同名并发操作不会共享不同参数的审批单；daemon 的 read_file/ls 与旧 FileEditTool 也使用真实路径检查；CLI 已把 MCP schema/调用接入 Agent Loop，server 启动需要显式 opt-in，工具逐次审批且带取消和输出限制；Skill 可按需通过 `activate_skill` 加载，loader 限制文件大小并跳过符号链接；交互 CLI 按 workspace 持久保存和恢复完整 transcript，提供新建/列表/恢复命令；步数上限默认为可配置的 30；session Plan/Todo 可持久化并在 Plan 模式拦截变更工具；权限规则与模式决策已抽到 `@ocean/core`，CLI/Gateway 共用 matcher；CLI 加载多层 `.claude` / `.ocean` 配置，支持五种外部 mode、参数范围规则、全局 deny 和 fail-closed；显式 ask/deny 覆盖 bypass，`dontAsk` 自动拒绝需询问的操作；shell rule 已支持逃逸通配符、尾随参数规则和 PowerShell 大小写不敏感匹配；`/permissions [mode]` 将模式保存到 workspace-local Ocean 设置，PowerShell 在 bypass 下仍要求批准，MCP server 可配置决策。CLI file_read 图片读取支持 PNG/JPEG/GIF/WebP 的有界传输，Chat Completions 通过用户图片消息传递工具输出；当前通过 CLI typecheck/build 与 62 项测试，以及 Gateway typecheck 和 25 项审批/运行时/权限回归测试。session 授权、拒绝审计、策略原因/version、shell 语句级安全分类、PowerShell AST、Gateway RPC 取消与真实 pwsh 集成尚未完成，此进度仍不代表完整迁移。

这只是迁移的第一小批，尚未实现完整 Claude Code 能力。剩余批次与验收记在仓库根 `TODO.md`；不将清单映射或文件存在视为功能已迁入。

## 逐路径核对账本

仓库根目录 `CLAUDE_CODE_FILE_MANIFEST.tsv` 已为 1,902 个源文件各列出路径、功能簇、Ocean/OLO 处置和目标落点。它是逐路径登记表，不应误读为逐文件语义已人工审阅：每行的状态明确写为“classified by path; detailed behavior requires code review”。模块级行为差距和建议见本文前述表格。真正实施时，要按目录逐个打开源文件及相关调用方/测试，把登记状态改为已复核并补充差距、依赖和验收证据；不能仅靠自动分类声称 1,902 项均完成语义审计。

文件读取族仍缺图片缩放/压缩与尺寸元数据、PDF 页范围、Notebook 高级输出、重复读取去重及 Gateway 端到端传输。当前图片只做签名检测，限 2 MiB，真实识图还依赖所选模型支持图片。

大文本文件可在 CLI 使用显式 limit 按块读取行范围；仅扫描到 EOF 才报告总行数，超长单行会标记 partialLine。

CLI Notebook 读取已包含单元源码、语言、执行次数、文本/错误输出和 PNG/JPEG 图像，大小受限；其他输出类型和 Gateway 接入尚未完成。

CLI 新增 notebook_edit，支持单元替换、插入、删除、会话快照与写前校验、权限策略和取消；尚未完成 Gateway/daemon、撤销历史、专用 Diff 界面及跨进程严格并发控制。

Notebook RPC 已接入 daemon 和旧直驱 ToolRuntime；Socket 连接验证身份、响应绑定 socket，Notebook 请求校验 session 归属。默认 Run/Worker 与 Gateway Socket 分进程，尚缺可恢复桥接与持久审批接线，尚未进行真实 Socket/数据库端到端验证。

默认 Run/Worker 新增 Notebook 设备工具：以 outbox 持久请求跨进程派发到在线 CLI，单次领取并回填结果，编辑走持久审批；共享审批面板现可续跑 Run，审批复用校验工具与参数。已派发请求断线或取消时保留结果不确定状态，不能自动重放；真实 Socket/数据库端到端、远端取消与审批/取消的严格并发仍待验证或实现。

Run 审批决策改为条件状态更新，取消会关闭待审批项和未派发设备请求；目前只经内存并发测试，仍需真实数据库竞争及已派发任务取消验证。
