# 旧链路与无引用代码 · 阶段证据

Gateway `RunRunner` 的 GatewayCoreLifecycle 构造依赖标记为 Optional（`apps/gateway/src/worker/run-runner.ts:97`），核心状态变更受 `if (this.core)` 保护。WorkerModule 明确注册该组件。生产默认 DI 活跃，缺少组件的替代装配和测试构造待核查。候选收敛条件是所有实际构造点均提供 Core 生命周期，并验证失败配置不会静默启动旧路径。

Gateway `apps/gateway/src/tool/core-agent-runtime.ts` 的工厂进入反向符号引用核查队列。相对导入扫描无法排除 barrel、动态加载或跨包导出，删除条件待确认。CLI 旧循环、兼容层、SDK 对外导出的系统分级待做。

## CV2-002 · P1 · 并行的 CLI legacy Agent Loop

CLI 本地存在第三条可达的执行路径。Ink 在 `apps/cli/src/ui/app.tsx:157–158` 依据 `OCEAN_AGENT_CORE=legacy` 调用 runChatLoop，Readline 在 `apps/cli/src/repl.ts:875–876` 同样可达。Single query 在 `:624` 检查持久会话及环境变量，随后可落到 `:701` 的 runChatLoop。该函数在 `apps/cli/src/llm/chat.ts:362` 定义，并在 `:682` 为 Stop hook 反馈继续推进。 `git log -S 'process.env.OCEAN_AGENT_CORE' -- apps/cli/src/repl.ts` 定位 596b6ed（#18）。该提交引入选择门槛，旧循环本身首引入提交仍需追溯。

影响为 CLI 的执行行为取决于入口及环境配置，共享 Runtime 的生命周期保证无法由这些分支自动继承。权限是否存在实际偏差待核查。保留理由在 `repl.ts:623` 注释为显式兼容与临时执行，退出条件尚未找到。删除前将真实入口的临时会话、Stop hook、子代理、审批和取消行为验收到权威 Core Engine，覆盖三条路由及环境变量退出行为。

`git log --diff-filter=A -- apps/cli/src/llm/chat.ts` 定位旧循环所在文件首次加入主线历史为 5cdc102。Gateway 工厂 `createGatewayAgentCore` 由 f94fbf3 引入。当前对 apps/packages 的精确符号引用仅命中定义和 `core-agent-runtime.spec.ts:3,7`，Worker 实际使用 GatewayCoreLifecycle。将它列为仅测试引用候选，需复核动态加载和对外导出后决定删除。

## CV2-003 · P1 · Gateway Chat 可回退到 SDK 直驱循环

**约束** 一个 Core 拥有模型、工具及终止决策。 `ChatService.isRunMode`（`apps/gateway/src/chat/chat.service.ts:70–73`）默认走 Run，但显式 `CHAT_USE_RUN=false` 时 `ChatController.handleChatStream` 路由到 `SkillOrchestrator.streamResponse`（`chat.controller.ts:373–380`）。后者构建自己的上下文、prompt 与工具，调用 SDK `streamText`，设定 `stepCountIs(10)` 并收集工具结果（`apps/gateway/src/skill/skill.orchestrator.ts:240–300`）。直驱审批由 `interactive.manager.ts:123` 拒绝。非交互及相关 SDK 参数要求 Run 模式。

**历史与影响** c10da1c 加入 run-driven Chat 分支，14b66f9 将默认切为 Run 并保留回退。该路径只在配置条件满足时生产可达，当前线上值待核实。启用回退后，普通 Chat 可进入独立模型和工具循环，它的审批和持久恢复语义与 Run 不同。没有证据将该兼容分支归因于中断或重复启动。

**收敛及验收** 保留 RunService / Worker / Core 路径。先将直驱仍承载的用户行为逐项通过真实 Chat HTTP 验收，再删除模型和工具循环回退。增加缺省和历史配置下的入口测试，断言创建 Run、经历 Worker，并验证取消、审批、消息续接和终态。

## CV2-022 · P3 · Gateway inline Tool Host 与 Engine 工厂仅测试可达

`apps/gateway/src/tool/core-agent-runtime.ts:17–45` 创建 Gateway inline AgentExecutionEngine，调用 `core-tool-host.ts:6–26`，该 adapter 经 ToolRegistry.getDescriptor 解析后执行 ToolRegistry 工具。当前追踪到的所有调用方为 `core-agent-runtime.spec.ts:7`、`core-tool-host.spec.ts:15` 及上述工厂内部引用；真实 Worker 由 GatewayCoreLifecycle 构造 durable Engine，ToolExecutor 自己控制工具派发。f94fbf3（#17）引入该工厂。包入口、CLI、Worker、HTTP 和 SDK 符号引用中未发现生产调用。它覆盖端口契约试验，尚未找到需要随生产发行保留此工厂的接口。保留真实 Worker 的契约断言，清理前复核非源码动态入口及发布导出。

## CV2-036 · P3 · ChatService 中残留重复模型目录方法

`apps/gateway/src/chat/chat.service.ts:288–334` 直接组合 provider 模型配置和图标，当前 apps 范围未找到调用。生产 `GET /api/chat/models` 经 `chat.controller.ts:159 → SkillOrchestrator.getAvailableModels → ModelRegistry.getAvailableModels`。`git log -S` 定位旧方法的历史点 c973aee、010d477。保留 ModelRegistry 目录，并在核实 DI 动态消费者后移除无调用方法，跑真实 models 路由和 CLI/Web/Desktop 模型选择回归。没有发现该旧方法影响当前返回结果。
