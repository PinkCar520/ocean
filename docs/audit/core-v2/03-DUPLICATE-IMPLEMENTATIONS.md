# 重复实现 · 阶段证据

确认有 inline 与 durable 两种控制流，尚未将差异整体判为重复。Core `agent-execution-engine.ts:452–460` 提供 inline run/resume，Gateway 由 RunRunner 驱动 durable segments。两侧复用决策协议。CV2-001 记录 Gateway 模型调用控制权缺口。

上下文生命周期是待验证的重复候选。Gateway `run-runner.ts:510,593,687` 含历史压缩、摘要模型调用和上下文重建，`git log -S 'private async compactChatHistory' -- apps/gateway/src/worker/run-runner.ts` 定位到 027864d。需按压缩边界、摘要生成、缓存、工具结果保留分别与 CLI 和 Core 比对，区分存储差异与重复策略。Skills/MCP、Hooks、Subagent 的功能等价与历史来源待追踪。

## CV2-006 · P2 · Skills 文件解析存在双实现

CLI `apps/cli/src/skills/loader.ts:29–94,162–198` 的 parseFrontmatter、loadSkill、discoverSkills 独立执行 frontmatter 分隔、YAML 解码、字段验证和同名选择。CLI 本地运行时在 `apps/cli/src/llm/core-local-runtime.ts:83` 将加载结果交给 session skill port。Gateway `apps/gateway/src/skill/skill.loader.ts:210–276` 的 parseSkillMd 及其 catalog 扫描重复实现相同格式的解析，使用不同 YAML schema 与校验。ChatController 和旧直驱的 PromptComposer、ToolRuntime 均注入该 loader。Gateway 的数据库 catalog 与 CLI 文件目录属于不同来源，暂未认定需要合并来源优先级。

原始文件分别由 5cdc102 和 4640b15 加入。#22 d93e936 主要引入交互管理与本地禁用配置，并修改既有 CLI loader。双实现早于该 PR，目前没有证据证明 #22 重新创建解析器。差异会让同一个 SKILL.md 在不同入口的接收或拒绝结果不同。应保留 CLI 已有的类型校验与延迟正文读取行为作为收敛输入，将相同文件格式解析收敛为共享函数。验收用同一份合法、无效和边界 frontmatter 语料测试两端，另行测试各 Host 的来源信任与优先级。

MCP 初查确认 CLI 和 Gateway 都在真实 listTools 调用中复用 Core `collectMcpTools`（`apps/cli/src/mcp/client.ts:262`，`apps/gateway/src/mcp/mcp-client.manager.ts:216`）。#23 变更 CLI 管理入口和作用域落盘。Loader、连接隔离、OAuth 与权限规则仍需继续比较，尤其要核查同名 server 的作用域合并规则。

## CV2-012 · P2 · 两套 CLI 工具结果恢复与 transcript 重建

`SessionStore.recoverCompletedToolCalls`（`apps/cli/src/utils/session-store.ts:119–165`）按 session/workspace、journal 文件名和输入摘要校验，排序后补齐内存 transcript。真实 CLI 打开历史会话用 `SessionStore.load`，随后提交时可通过 `save` 写回该重建视图（`apps/cli/src/repl.ts:518–519,621`）。`createCliRuntimeRecovery`（`core-runtime-recovery.ts:65–136`）独立按同一调用 ID 查找持久消息、补齐 call/result、校验 journal 对应 Core 事件后做 CAS 追加。SDK 的同 Run resume 会使用后者，见 CV2-011。

这两套实现共享任务是依据终态 journal 修补 transcript，核心差异是旧路径不验证 Run 的 Core 事件、生成的工具输出包装不同，且旧路径使用内存返回。0cf0263 引入旧重建，596b6ed 引入 Core 恢复。它们服务于历史会话兼容与新协议，尚未找到旧路径退出条件。收敛时以 Core 验证恢复为新格式权威，旧 journal 没有对应事件时使用有明确边界的兼容适配。验收需覆盖重复调用、损坏摘要、顺序错误、旧格式、已完成但缺消息及未知结果。

## CV2-013 · P2 · 上下文压缩生命周期仍由两个 Host 分别实现

| 决策 | CLI | Gateway |
|---|---|---|
| 预算和边界 | `compaction.ts:122–208` 结合 system prompt、估计或持久 usage、microcompact 与工具闭合边界 | `run-runner.ts:510–574` 从 Worker token 配置分配历史预算，按 user turn 选择边界 |
| 摘要 | `compaction.ts:219–281` 生成并验证结构化摘要，检查实际缩减、工具环节和预算 | `run-runner.ts:575–630` 生成文本摘要，可回退到若干历史摘录，再检查缩减和预算 |
| 缓存与 fork | 以 transcript 前缀 digest/covered 识别，SessionStore.fork 复制快照 | 前缀 fingerprint、budget、Session ID，前一 Run 还要求用户归属和父消息匹配 |
| 工具结果 | `microcompact.ts` 只在生成视图裁剪可回看内容，持久 transcript 保留 | RunRunner 单独从持久 RunStep 重建历史工具内容，Chat 文本摘要与工具投影分开 |

**共享及重复职责。** 两端生产路径都复用 `@ocean/core` 的 token 计数与 compaction 接受门槛。各自独立决定触发、边界、摘要调用及缓存身份。共享 Core 中 `canReuseContextCache` 和 `assembleContext` 在 apps/packages 的当前符号扫描仅见定义及导出，未见生产调用。消息格式、存储和 provider adapter 可以继续不同。CLI 文件引入于 bd1986e，Gateway 方法引入于 027864d。当前证据不支持把两者归因为任务中断。

**验收。** 复用 Core 已有预算、边界和缓存契约，将触发及缓存语义收敛至单一策略。保留 CLI microcompact、Gateway 的持久工具恢复作为 adapter 能力。用同一语料验证长会话、fork、历史编辑、工具配对、摘要失败和重启，明确允许的 Host 差异。

### MCP 执行与 Hook 初查

Gateway Worker 启动时由 `WorkerAgentTools.onModuleInit`（`worker-agent-tools.ts:25–27`）注册 MCP 发现、调用与资源工具。 `mcp-resource.tools.ts:21–53` 将动态调用映射为具体 `mcp__server:name` 权限名，ToolExecutor 以匹配的 server 和身份做检查（`tool-executor.ts:183–190`），再走持久工具流程。旧直驱路径在 `runtime/tool.runtime.ts:388–415` 生成另一组 AI SDK 工具与权限包装。CLI 在 `tools/index.ts:167–202` 使用本地 MCP 管理器和动态工具定义，默认由 Core ToolRuntime 进入。已确认的边界是三条执行/包装路径和各自的权限入口。作用域、缓存、OAuth 和审批行为同源性仍待核对，现阶段不将认证隔离方式归类为重复。

CLI Core 的 Stop、PreToolUse、PostToolUse、ToolUseFailure 包装在 Single query、Readline 和 Ink 分别装配（`repl.ts:652–687,932–966`、`ui/app.tsx:220–256`）。默认 Core 主入口未见旧循环的 UserPromptSubmit 调用（`llm/chat.ts:428`）。此项作为 Hook 迁移候选，后续需通过配置了实际用户 hook 的入口用例核实可见行为。

## CV2-018 · P2 · MCP 配置文件合并与变量解释分叉

CLI `McpClientManager.loadConfig/connectServer`（`apps/cli/src/mcp/client.ts:63–94,208–230`）独立实现来源优先级、按 id 覆盖、文件与权限校验，并在连接时替换变量。默认来源为个人、项目和本机私有配置；项目来源默认不启用。Gateway `MCPConfigLoader.loadConfig/expandEnvVars`（`apps/gateway/src/mcp/mcp-config.loader.ts:47–145`）也实现按 id 覆盖与替换，默认来源和变量解释有所不同。活跃的 `MCPClientPool.managerFor`（`mcp-client.pool.ts:123–182`）按用户和工作路径建立连接池，为 HTTP/SSE 注入 OAuth，禁用进程 cwd 层并默认禁用进程环境回退。Worker MCP 调用传入用户 scope，旧直驱 `tool.runtime.ts:388–392` 还传入请求提供的 workspacePath。后者与服务端可信目录如何绑定，需独立核实；当前未证明跨目录越权。

**历史与影响。** 5cdc102 引入 CLI loader，ad26b04 引入 Gateway MCPConfigLoader，1b0b571 更新 CLI 的安装、管理和作用域落盘。现有重复可导致相同定义跨 Host 导入后的覆盖与变量语义变化。连接池或 OAuth 适配属于 Host 职责，已查的生产路径复用 Core 的工具分页。静态符号扫描尚未找到独立的跨 Host Tool Search 协议，Gateway 提供 mcp_list_tools，具体发现语义应与 CLI 管理与连接流程一并验收。

**验收。** 共享纯配置校验、合并和变量解析，按 Host 提供来源及信任策略。相同配置语料验证覆盖、禁用、缺失变量和损坏输入，再以各自 Host 集成测试隔离用户凭据、远程 HTTP 重连和 OAuth 生命周期。

### CV2-042 · P2 · 同一 daemon 的旧计划工具共用任务列表

R02 要求会话状态按身份隔离。基线 apps/gateway/src/chat/chat.controller.ts:373 的兼容聊天分支 → skill/skill.orchestrator.ts:255 → runtime/tool.runtime.ts:341–357（传 sessionId）→ chat/rpc.gateway.ts:218 → apps/cli/src/daemon.ts:86–109,174–182。本地权限放行时，PlanTool.execute（apps/cli/src/tools/local/plan.ts:18–55）丢掉会话身份，使用 utils/task-manager.ts:156–185 的进程级静态数组。新的 tools/task-plan.ts:54–93 按 sessionId 读写计划。计划是用户任务列表，与 Core 决定模型或工具下一步的 Turn Planning 含义不同。

旧 PlanTool 于 c8ad092c 引入，SessionTaskManager 于 d5555aaa 加入。两者仍有调用方。暂无法从历史判断是否源于研发中断。在本地 6958817a 对与基线相同的 PlanTool 实现调用 A.start 后执行 B.list，实测返回 A 的任务。边界为同一 daemon 进程，未验证网络端到端。首选保留现有按会话管理的实现，旧 RPC 适配器应显式传递并验证 sessionId，按请求会话发出事件；在确认旧客户端和订阅者迁移后退出静态 TaskManager。验收应交替执行两个会话的 start、list、update、exit，并复查推送订阅归属和进程重启后的恢复。

### CV2-045 · P3 · 两个 Host 携带同一份工具图片协议转换

基线 apps/cli/src/llm/chat-image-middleware.ts:6 和 apps/gateway/src/ai/chat-image-middleware.ts:6 的 transformParams 完全相同，Git blob 均为 fa0b7a884e8a581bb5cd7cf5aa58ef89525f78e2。CLI model-router.ts:138 和 Gateway model.factory.ts:139,165 在相应 provider 分支将其装入 wrapLanguageModel，负责把连续工具结果中的图片移至后续用户消息，以符合 Chat Completions 格式。d5555aaa 同时引入两个文件；没有证据表明由研发中断或后续重复启动造成。今天的两份拷贝行为一致，今后修改协议映射时可能只改到一端。保留现有转换作为共享 Provider 适配函数，两端继续各自装配模型。验收应从两端工厂输入同一组纯文本、单图片和混合多工具消息，对比实际序列化请求。

本批对基线台账中 606 个非排除 TS/JS 文件读取 Git blob 并解析 TypeScript AST，递归抽取有块体的函数与回调。使用节点种类、文字常量及属性名，按首次出现顺序替换其他标识符，保留至少 80 个签名元素的函数体。2,166 个函数体产生 12 组跨文件相同签名，包含嵌套回调和纯展示代码。候选位置完整保存在 audit-state.json 的 astCloneScan。该方法会漏掉短小函数、语句重排、不同控制结构及暂列排除的文件；签名一致本身不改变文件审查状态。除上述图片转换外，RunRunner 和 ToolExecutor 的 appendEvent 有相同 Prisma 字段映射。应先核对事务所有者、事件序号分配和调用方，再决定是否合并写入函数。

### CV2-046 · P2 · Gateway 公开事件分配和写入存在多个实现

WorkerService（apps/gateway/src/worker/worker.service.ts:133–137）将模型和工具任务交给 RunRunner 与 ToolExecutor。两者的 nextSequence 和 appendEvent 分别位于 run-runner.ts:1184–1210、tool-executor.ts:942–969，均查询同一个 run_events 分区的最大序号、校验同一个 RunEvent 契约并生成相同的 Prisma 字段。RunService.nextRunSequence（run/run.service.ts:582–592）第三次复制序号算法，却在部分审批事务中直接写字段，造成 CV2-010 已记录的列与 payload 分叉。Git -S 追到两 Worker 方法随 2a1ca0ef 引入。没有证据说明开发中断导致重复。

保留模型输出与工具完成的事务边界。把公开事件的序号分配、契约校验、行与 payload 映射收敛成一个接收现有 Prisma transaction 的 Gateway 写入入口。公开事件用于 Chat/SSE，Core 生命周期另写 runtime_core_events，使用独立 revision 和序列约束。验收以真实 PostgreSQL 交错运行模型、工具、审批写入，再用 SSE 断线重连验证严格递增及完整投递。CV2-046 记录结构性重复，序号分叉仍由 CV2-010 跟踪。

### CV2-048 · P3 · Skills 导入与启动同步重复推导目录元数据

Gateway HTTP 的 SkillController.importSkill（apps/gateway/src/skill-registry/skill.controller.ts:258–262）和上传入口都经 SkillImportService.parseSkillMd（skill-import.service.ts:246–280）写 catalog。AppModule → SkillRegistryModule → SkillSyncService.onModuleInit（skill-sync.service.ts:14–80）从本地 Loader 读已发现的 Skills，再用 SkillService 写同一个 catalog。图标规则在 skill-import.service.ts:372 与 skill-sync.service.ts:121 完全一致，标签规则等价。分类使用相同关键词顺序，导入额外读取 target_system，默认值也与同步不同。导入先于同步，分别来自 4f7002ba 与 bc66ac5f。保留来源适配，合并公共图标和标签函数，并用同一测试语料锁定分类的来源参数与默认值。审查发现第三个 SKILL.md 解析器位于导入服务，可和 CV2-006 的两端解析器一起核对契约。

TipTap 的 mentionSuggestion.tsx 和 slashSuggestion.tsx 重复弹层的创建、更新、退出，MentionList.tsx 和 SlashList.tsx 重复键盘导航。都由共享 ChatInput 装配，属于 UI 局部重复。Desktop 与 Web 的 App 中重复了非聊天页标题映射，也属于 UI。基线的 ChatInputLegacy.tsx 未找到仓内生产消费者，8c7b6542 后续已删除，仍计入基线待审直到完成源文件核查。

Gateway 的旧 ZentaoService（apps/gateway/src/zentao/zentao.service.ts:16–37）和 stdio MCP Server 共享同一个 @ocean/tools-zentao 包。重叠处在工具注册、授权和返回投影。ToolRuntime:47,76,86 仍直接调用 ZentaoService，MCP Server 则另行暴露协议工具。收敛应保留共享 API 客户端及协议所需适配，处理旧工具名的真实消费者。GitLab 和 Jenkins 的 MCP 入口分别委托现成的 tools 包，当前默认配置为禁用。
