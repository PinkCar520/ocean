# 自动化验证

源码基线 `9c48d67daa713c9bea3a32bf734f8fb13f9f4ad0`。Node v26.13.1，CI 使用 Node 24。以下重跑允许本地回环监听。

| 实际命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm run ci:typecheck` | 0 | CLI、Gateway 及脚本构建依赖 |
| `pnpm run build` | 0 | Turbo 14/14 tasks |
| `node --test scripts/ci-gate.test.mjs` | 0 | 2 通过，0 失败，0 跳过 |
| `CI=1 pnpm run ci:unit` | 0 | Core 26 通过，CLI 382 通过，Gateway 404 通过、8 跳过 |
| `CI=1 pnpm run ci:e2e` | 0 | 6 通过、32 跳过 |
| `CI=1 pnpm run ci:faults` | 0 | CLI 82 通过，Gateway 133 通过、3 跳过 |

初次沙箱执行 unit/e2e/faults 均退出 1。CLI Streamable HTTP MCP 因 `listen EPERM` 失败，Gateway HTTP 首次 5 失败、1 通过、32 跳过，同样受监听限制。直接运行 `CI=1 pnpm --filter gateway test --runInBand` 初次 401 通过、3 失败、8 跳过。重跑结果见上表。

`.github/workflows/ci.yml` 执行锁定安装、Prisma 生成、CI gate、指定 workspace 类型检查、单测、HTTP、故障回归和 PostgreSQL 验收。工作流未在该文件直接调用根 build。部署工作流及远程 CI 实际运行状态待核查。

`packages/shared/core/src/agent-execution-protocol.spec.ts:121–154` 直接断言 planner 的未结外部效果、取消和待投递输出。该层没有调用 Gateway 生产 RunRunner，不能覆盖 CV2-001。 `apps/cli/src/repl.core-integration.spec.ts:1–15,52–88` 验证业务入口选择 Core 并且 legacy mock 未调用，Core、本地工具、存储和 MCP 均有 mock，无法证明真实交互模式的持久化语义。

`CI=1 bash apps/gateway/scripts/verify-postgres.sh` 退出 0。独立 PostgreSQL 容器成功应用迁移，Gateway 412 项通过，HTTP E2E 35 项通过、3 项跳过，CLI 382 项通过，Prisma validate 通过。PG E2E 文件的三处条件跳过在 `worker.postgres.e2e-spec.ts:915,955,1033`，覆盖真实 CLI 进程连接 Gateway 的工具选择、审批桥接及 stdin interrupt。

`worker.postgres.e2e-spec.ts:457,508,627,817` 分别覆盖模型段 SIGKILL 恢复、已发生副作用后的 SIGKILL 拒绝重放、两工具完整批次、provider tool call 的取消及重试。完整断言、provider 替身边界和跨 Host 等价性仍待逐场景核查。实际外部模型服务未验证。

本轮定向重跑 `CI=1 pnpm --filter gateway exec jest --runInBand worker.service.spec.ts tool-executor.spec.ts tool-outcome-reconciler.spec.ts core-lifecycle.spec.ts run-ownership.spec.ts outbox.service.spec.ts`，退出 0，6 套件、71 项通过，0 跳过。新增四项发现来自静态取证。现有单测覆盖模拟协调器、租约及假事务；此前通过的 PostgreSQL 协调测试明确注入 fixture adapter 并且断言 Run 保持 failed。当前通过结果不能用于认定 CV2-007 至 CV2-010 已验收。

CLI 定向重跑 `CI=1 pnpm --filter @ocean/cli exec vitest run src/utils/session-store.spec.ts src/utils/agent-execution-engine.spec.ts src/llm/recovery-state.spec.ts src/llm/compaction.spec.ts src/llm/microcompact.spec.ts src/repl.core-integration.spec.ts`，基线一致，退出 0，6 文件 89 项通过。compaction.spec.ts 包含实际新进程加载摘要、二次压缩及保全工具配对，模型由测试夹具控制。agent-execution-engine.spec.ts:83,94,221 用显式 Run ID、构造事件/日志调用 resume，覆盖同 Run 恢复核心语义。repl.core-integration.spec.ts 的 Core mock 只确认选择共享入口。CLI 中断后通过原有 --resume 恢复 Run、跨 Host 摘要等价以及历史 journal 自动迁移未验证。

本轮 CLI 定向命令 `CI=1 pnpm --filter @ocean/cli exec vitest run src/approval src/subagents src/tools/core-tool-authorization.spec.ts` 退出 0，5 文件、42 项通过。delegate.spec.ts 的七项用例直接调用工厂，以提供的 run 替身验证只读工具、重复身份、取消和持久结果恢复。stdio-approval.spec.ts 验证替换输入解析和迟到响应，未走默认 Core 审批结果映射。

Gateway 命令 `CI=1 pnpm --filter gateway exec jest --runInBand subagent-policy.spec.ts subagent-runs.service.spec.ts approval-maintenance.service.spec.ts mcp-resource.tools.spec.ts` 退出 0，3 套件、4 项通过。mcp-resource.tools.spec.ts 选择式未匹配单独套件。生产 MCP 调用权限和新增问题的真实入口定向复现仍待补。

## CV2-019 · P1 · 质量门默认跳过三个真实 CLI 到 Gateway 的用例

`.github/workflows/ci.yml:46` 执行 `verify-postgres.sh`；脚本为四类 PG 测试设开关并调用 Jest，没有构建或配置 CLI_ENTRY。`apps/gateway/test/worker.postgres.e2e-spec.ts:914–915,955,1033` 仅在 OCEAN_E2E_CLI_ENTRY 存在时运行工具选择、审批桥接和 stdin interrupt。5795f22 引入入口判断，脚本的 PG 开关可追溯到 0cf0263。默认隔离验收实测 35 通过、3 跳过，CI job 可以在三个场景未执行时成功。

发布工作流 `.github/workflows/deploy.yml:17–18,33–36,76–79,121–138` 复用质量门，两个镜像发布作业依赖 quality；服务器步骤运行 checkout 后进入 ~/ocean，使用 docker compose pull/up。镜像有 SHA 标签，但服务器步骤未明确引用该 SHA。当前只能证明源码工作流的依赖门，无法据此认定线上镜像和待审 commit 一致。GitHub connector 的该 SHA combined status 返回空，PR 范围 workflow 查询也返回空；push workflow 和部署结果仍待证实。

验收应在 CI 编译 CLI、向 PG 验收传入绝对入口并要求这三个场景均执行。另需本地 Core 与 Gateway Run 使用相同输入的行为验收，这三个用例均以 CLI 远程模式执行，覆盖的是传输和 Gateway Worker。

### R05 证据边界

Core `agent-execution-protocol.spec.ts:34–64` 对共享 driver 输入断言派发、等待、停止、重试和兄弟调用序列，未启动两个 Host。Gateway PG 夹具通过真实 HTTP 和 PostgreSQL，但构造 Worker、RunRunner、ToolExecutor 与 provider fixture（`worker.postgres.e2e-spec.ts:113–155`）。CLI 入口测试当前主要是 mock route 或显式的共享 Engine 恢复测试。已验证的 Gateway 场景包括多工具、取消、审批和拒绝重放；CLI 有实际文件恢复及 compaction 组件用例。尚未找到一组通过真实本地 CLI 和真实 Gateway 入口复用的完整验收矩阵。静态 CI gate 测试对 workflow 文本做正则断言（`scripts/ci-gate.test.mjs:7–18`），无法证明 PG 子场景执行或部署绑定 SHA。R05、R08 为 Partial。

### CI 跳过场景的补验

当前基线实际执行 `pnpm --filter @ocean/cli build`，随后以 `CI=1 OCEAN_E2E_CLI_ENTRY="$PWD/apps/cli/dist/index.js" bash apps/gateway/scripts/verify-postgres.sh` 运行隔离 PostgreSQL。整体退出 0。Gateway 65 套件、412 项通过；HTTP E2E 2 套件、38 项通过、0 跳过；CLI 55 文件、382 项通过。补开的三项真实 CLI 启动用例全部通过。其子进程以 --gateway 测试，实际调用本机 HTTP 与 Worker，模型响应由本机 provider fixture 提供。默认发布门仍然缺少入口环境变量，且这些测试不会覆盖 CLI 本地 Core 执行语义。

### 定向真实实现探针与适配器回归

| 命令 | 结果 | 边界 |
|---|---|---|
| `node /tmp/ocean-audit-sse-probe.cjs` | 退出 0，复现 CV2-010 游标倒退和 CV2-021 终态漏发 | 真实编译 Controller/Service，受控持久行及响应夹具 |
| `node /tmp/ocean-audit-event-lock-probe.mjs` | 退出 0，子进程 SIGKILL 后可读取、无法追加，见 CV2-020 | 真实 CLI 文件 adapter、隔离目录、在建锁后注入退出 |
| `CI=1 pnpm --filter @ocean/cli exec vitest run src/utils/runtime-event-store.spec.ts src/utils/agent-transcript-port.spec.ts src/llm/core-local-runtime.integration.spec.ts` | 退出 0，3 文件、13 项通过 | 真实临时文件存储和 Core adapter，模型及工具夹具 |
| `CI=1 pnpm --filter gateway exec jest --runInBand runtime-event-store.spec.ts core-lifecycle.spec.ts run-ownership.spec.ts run.controller.spec.ts core-tool-host.spec.ts core-agent-runtime.spec.ts` | 退出 0，6 套件、20 项通过 | 包括手工注入内存模型及持久端口；不能作为真实并发 PG 验收 |

`core-lifecycle.spec.ts:40–77` 的 inline/durable 比较覆盖了一个模型→工具→模型场景。其两侧使用手工端口与内存事务，补充 R05 的协议级证据。

本轮 `bash /tmp/ocean-audit-pg-ownership.sh` 退出 0，隔离容器成功应用迁移。真实 PostgreSQL 复现 CV2-008 活租约被重置、CV2-009 争用工具消息被确认、CV2-021 最终事件漏发，并量化 CV2-023 续租为 60 秒。 `node /tmp/ocean-audit-nest-hooks.cjs` 退出 0，验证 CV2-024 的 Nest 生命周期语义。探针只运行本地隔离数据及 fixture。

| 本轮实际命令 | 结果 | 证据边界 |
|---|---|---|
| `node /tmp/ocean-audit-cli-resume-probe.cjs` | 退出 0，真实 CLI 重开 Session 后创建新 Run，旧 Run 留在 calling_model；持久计划未进首个恢复请求 | 本机 SSE provider fixture，独立 HOME，真实子进程 SIGKILL；未对外部服务发起调用。初次执行缺少 CLI 所要求的 API key 格式，退出 1；补入本地虚拟 token 后通过 |
| `node /tmp/ocean-audit-journal-size.mjs` | 退出 0，70 KiB 工具输入造成直接复用与 Core-facing journal 检查分歧 | 真实 SessionStore，内存计数工具及隔离文件。初版探针误假设 readToolCallJournal 应抛错，修正为验证其实际返回 succeeded |
| `CI=1 pnpm --filter @ocean/cli exec vitest run src/utils/session-store.spec.ts src/utils/tool-journal.spec.ts src/llm/recovery-state.spec.ts src/llm/core-v2-decision.spec.ts src/llm/core-local-runtime.integration.spec.ts src/approval/approval.spec.ts` | 退出 0，6 文件、60 项通过 | 测试通过与上述入口缺口同时存在 |

`bash /tmp/ocean-audit-pg-retry.sh` 退出 0。一次性隔离 PostgreSQL 应用迁移后，通过真实 WorkerService、RunRunner、GatewayCoreLifecycle、RunController 和 RunService 验证 CV2-027（API 接收重试但 Core failed 拒绝启动）及 CV2-028（失败终态消息继续 pending）。模型是受控 fixture，无实际外部请求；Controller 以方法直调，最终真实 HTTP socket 验收待补。

定向重跑 `CI=1 pnpm --filter gateway exec jest --runInBand run.service.spec.ts run.controller.spec.ts run-runner.spec.ts tool-executor.spec.ts approval-maintenance.service.spec.ts`，退出 0，5 套件、115 项通过。RunService 的 retry 单测断言 queued 及投递，不能覆盖 Worker 读取已有 Core failed 快照的情况，见 CV2-027。

`bash /tmp/ocean-audit-pg-cancel.sh` 退出 0。临时 PostgreSQL 成功应用全量迁移，真实 Worker、RunService、Core adapter 复现 CV2-029（取消后 Host/Core 状态不一致）及 CV2-030（审批 TTL 到期后 maintenance 未推进）。工具是延迟 fixture，Controller 方法直接调用，测试未发外部请求。

Gateway 定向执行 `CI=1 pnpm --filter gateway exec jest --runInBand run.service.spec.ts tool-executor.spec.ts approval-maintenance.service.spec.ts subagent-policy.spec.ts subagent-runs.service.spec.ts`，退出 0，5 套件、74 项通过。该集合不包含本轮隔离 PG 发现的两个时序窗口。

`node /tmp/ocean-audit-core-replay.cjs` 退出 0，复现非法事件绕过重放完成门槛（CV2-032），并用真实 RunRunner.restoreChatHistory 和持久行夹具对比单双工具批次（CV2-033）。`CI=1 pnpm --filter @ocean/core test` 退出 0，2 文件 26 项通过；`CI=1 pnpm --filter gateway exec jest --runInBand run-runner.spec.ts core-lifecycle.spec.ts runtime-event-store.spec.ts` 退出 0，3 套件 45 项通过。

`bash /tmp/ocean-audit-pg-chat.sh` 退出 0。以真实 Nest HTTP 和隔离 PostgreSQL 观察 CV2-034 交互/非交互断流差异及 CV2-035 父节点落库行为。未加载 Worker，认证身份以本地中间件注入。另运行 `CI=1 pnpm --filter gateway exec jest --runInBand chat.controller.spec.ts chat.service.spec.ts session.service.spec.ts conversation-share.service.spec.ts`，4 套件 32 项通过。

本轮起始观察到 HEAD 移至 30aaef8，随后为 f7e6435（本地 origin/main 同值）。原始审计基线仍固定为 9c48d67。到 f7e6435 的 Git 差异仅有 Web 的 app/layout.tsx、LandingPage.tsx、index.css。本轮执行路径上的 Gateway、Core、contracts 和工作流在基线与工作区一致。已有 next-env.d.ts 本地改动未修改。

- `bash /tmp/ocean-audit-pg-migration.sh` 退出 0。独立 PG 应用迁移，在人工插入的旧行上再次应用从审计 commit 提取的回填 SQL。实测三类结果与真实 lookup 见 CV2-037。
- `CI=1 pnpm --filter @ocean/contracts test` 退出 0，5 文件、25 项通过。 `node --test scripts/ci-gate.test.mjs` 退出 0，2 项通过。两项 CI gate 断言镜像发布依赖和检查命令，未执行线上部署或镜像 digest 验证。

本轮审计文件与原始基线内容一致，工作区 HEAD 观察到 `1b3c80f4e9acb3144ab7b4d3d12fcceb4ea1d793`。较基线增加了 Web 社交图标，另有既有布局、首页和样式改动。未重新纳入锁定基线。

- `bash /tmp/ocean-audit-pg-upgrade.sh` 退出 0。真实 Prisma CLI 和隔离 PostgreSQL 同一存量行对照，db push 未回填，migrate deploy 回填成功。
- 以 `git show 9c48d67:<compose-file>` 导出两份规格，空环境文件和虚拟环境变量运行 `docker compose --project-directory <tempdir> -f <file> config --services`。两个命令均成功，worker 仅出现在常规规格。首次尝试当前 Compose 不支持 `--no-env-resolution`，改为临时项目目录后执行成功。未部署容器栈。

- `bash /tmp/ocean-audit-pg-device.sh` 退出 0。隔离 PostgreSQL、真实 Dispatcher 和 RunController 复现过期设备行停在 dispatched（CV2-040）。Socket 使用 fixture，没有执行文件或 notebook 操作。
- `CI=1 pnpm --filter gateway exec jest --runInBand device-rpc.spec.ts tool.registry.device.spec.ts rpc.gateway.spec.ts workspace-host.service.spec.ts workspace.service.spec.ts` 退出 0，5 套件、25 项通过。
- `CI=1 pnpm --filter @ocean/cli exec vitest run src/workspace-host.spec.ts src/tools/notebook-rpc.spec.ts` 退出 0，2 文件、6 项通过。未启动 Electron utility process。

`pnpm --filter ocean-desktop test` 退出 0，2 项通过。覆盖账号切换与身份、凭据、子进程生命周期 fixture。未启动 Electron 或验证 CV2-041 的实际 IPC。审查文件与锁定基线一致，观察到 HEAD 为 f3607d6。

### Desktop 账号切换

本地 6958817a，apps/desktop 下执行 package.json 的 test 命令 `node --test src/main/*.test.mjs`。退出 0，通过 2，失败 0，跳过 0。测试与受测的 main 目录相对审计基线无差异。断言检查不同账号和 Gateway 的身份区分、旧账号子进程退出、切回账号后复用对应的凭据文件。测试运行真实文件读写，替换了 Electron safeStorage、utilityProcess 和 HTTP。真实密钥链、打包进程和 Renderer → Gateway 会话链路仍待独立验收。

### CLI 任务列表隔离

本地 6958817a 与基线的 plan 实现及 task-plan.spec.ts 相同。在 apps/cli 运行 `./node_modules/.bin/vitest run src/tools/task-plan.spec.ts`，退出 0，通过 2，失败及跳过 0。第一个用例在临时目录读回 SessionStore 的 revision 和任务，第二个用例在没有 storage 的情况下切换 sessionId，验证内存隔离。

旧实现的独立观察在 apps/desktop 下以 node --input-type=module 运行，用该 workspace 的 esbuild 将 ../cli/src/tools/local/plan.ts 打成内存 ESM，导入 PlanTool 并实例化。依次调用 execute({action:'start',subjects:['alpha'],sessionId:'A'}) 和 execute({action:'list',sessionId:'B'})，assert.equal(result.data.tasks[0].subject,'alpha') 成立，退出 0。第一次从 CLI workspace 尝试时无法解析 esbuild，未执行断言。该观察只覆盖 daemon 使用的工具对象。

### 共享文件工具与 CLI 实际调用

本地 6958817a，apps/cli 下执行 `./node_modules/.bin/vitest run src/utils/checkpoints.spec.ts src/utils/file-system.spec.ts`，退出 0，11 通过、0 失败、0 跳过；执行 `./node_modules/.bin/vitest run src/utils/security.spec.ts`，退出 0，10 通过、0 失败、0 跳过。检查点与文件系统源码及上述测试文件在两提交间相同。检查点套件在子进程恢复首个文件后令其退出，再由另一实例完成第二个文件，真实验证了该回滚窗口。进程锁套件的排序用例使用同进程的两个 Promise，检查点套件另有真实短时跨进程竞争。两者均未覆盖 CV2-043 的长时间存活持有者。security.spec 的写入审批用例只验证工具元数据，未执行审批往返。

### 工具包单测与 CI 选择

6958817a，在 packages/tools/gitlab 和 packages/tools/jenkins 各运行 `./node_modules/.bin/vitest run`。退出码均为 0，分别通过 5 和 13 项，失败、跳过均为 0。相关包源码与基线一致。两套测试均替换 axios；GitLab 检查项目、MR 和文件请求，Jenkins 检查构建状态映射、队列响应及错误返回。未连接外部服务。基线 agents/mcp/mcp-gitlab/src/server.ts:11 和 agents/mcp/mcp-jenkins/src/server.ts:26 导入这两个适配器。根 package.json 的 test 通过 Turbo 发现 workspace 测试，而 .github/workflows/ci.yml:38–44 调用 ci:* 脚本，其中 ci:unit 显式选择 Core、CLI 和 Gateway。该 CI 步骤没有执行这两个适配器套件。ZenTao 包仅声明 build/dev，其 Gateway 消费者为 apps/gateway/src/zentao/zentao.service.ts:3。

### UI 会话审批恢复

6958817a 在 packages/ui 下执行 `./node_modules/.bin/vitest run src/lib/parseUIKit.spec.ts`，退出 0，两项通过，失败、跳过均为 0。仅断言 text 类型验证及未知类型保留。另从 9c48d67 用 git show 取 ChatSession.tsx，在仓库根用 node --input-type=module 运行 TypeScript AST 探针，提取声明 recoveringRunId 的 useEffect 回调，以 ts.transpile 后在 VM 中执行，替换 GET、状态写入及 setTimeout。等待一个 setImmediate 后断言首次读取抛错安排零个计时器，返回等待中的 Run 安排一个 2500 ms 计时器，两组断言均通过，退出 0。未挂载 React 或启动浏览器。

6958817a 在 apps/cli 运行 `./node_modules/.bin/vitest run src/llm/chat-image-middleware.spec.ts`，退出 0，1 通过、0 失败、0 跳过。真实 AI SDK 序列化工具图片和另一项文本结果，替换 fetch 后检查消息角色顺序、图片位置及原工具结果。测试直接装入 CLI middleware，没有经过 Gateway 工厂或外部服务。

6958817a 实跑 Gateway 下 `./node_modules/.bin/jest --runInBand src/run/runtime-event-store.spec.ts src/worker/core-lifecycle.spec.ts`，两套件 8 通过，退出 0，0 失败、0 跳过，出现 ts-jest 混合模块警告。Prisma 替身模拟排序及唯一约束，覆盖读取重放、旧 revision、模型工具生命周期、未知结果和未完成工具门禁。对比测试直接调用 GatewayCoreLifecycle，未启动 Worker、PostgreSQL 或 HTTP。CLI 下 `./node_modules/.bin/vitest run src/utils/runtime-event-store.spec.ts` 实跑 4 通过、0 失败、0 跳过，退出 0，覆盖新实例文件重放、非法转换、路径保护及预置锁冲突。三个测试文件的 blob 与审计基线一致。生产级交错写入与 SSE 重连仍缺本轮动态证据。

本地 6958817a 在 packages/ui 下运行 `./node_modules/.bin/tsc --noEmit`，退出 0，无诊断。该命令覆盖共享 UI 编译边界。未运行浏览器键盘交互，也未调用 Skill Studio 模型、MCP Sampling 或外部导入服务。

### MCP 配置、连接池与 SDK 传输

6958817a 在 apps/gateway 运行 `./node_modules/.bin/jest --runInBand --silent src/mcp/mcp-client.pool.spec.ts src/mcp/mcp-config.loader.spec.ts src/mcp/mcp-client.manager.spec.ts`，退出 0，16 通过、0 失败、0 跳过。Pool 的缓存键、配置重载与并发初始化主要用替身，用户环境从临时文件读取。另有真实 stdio 子进程夹具覆盖 tools/list_changed 推送、资源模板分页和不同用户资源隔离。Loader suite 覆盖配置来源覆盖与变量解释，只到解析边界。未验证生产部署配置或 Worker 中 stdio 进程的环境隔离。

同一提交在 apps/cli 运行 `./node_modules/.bin/vitest run src/mcp/stdio-sdk-transport.spec.ts src/mcp/config-store.spec.ts`，退出 0，3 通过、0 失败、0 跳过。覆盖 SDK 双层身份匹配、通知与关闭，以及临时目录中的 scope 配置写入。两端 MCP 文件与基线无差异。

### OAuth 与凭据本机验收

6958817a 的 apps/gateway 下，用 Jest `--runInBand --silent src/mcp/mcp-oauth.service.spec.ts src/mcp/mcp-credentials.service.spec.ts` 实跑，退出 1，凭据 3 通过，OAuth 1 超时失败，0 跳过。沙箱内加 `--testTimeout=15000` 重试，结果同上。独立的 Node 回环监听诊断返回 EPERM。随后在获准监听回环的环境以相同 15000 ms 命令重试，退出 0，2 套件 4 通过、0 失败、0 跳过。两份测试和服务源码相对基线无改动。OAuth 使用本机 HTTP 端点，验证 PKCE、一次性回调、按主体隔离、并发刷新、撤销及文件密文；凭据测试使用真实临时文件。此前 PostgreSQL E2E 的 HTTP fixture 也在同一运行环境使用注入的凭据目录。未覆盖分容器生产装配或进程异常退出后文件锁回收。

6958817a 在仓库根实跑 `node --test scripts/ci-gate.test.mjs`，退出 0，2 通过、0 失败、0 跳过。断言两个发布 job 依赖同一个质量门及四类脚本命令存在。没有执行发布、迁移、协议健康或 MCP 重载。脚本与审计基线一致，部署 workflow 所做的后续修复另列在架构报告。

6958817a 在 apps/gateway 运行 `./node_modules/.bin/jest --runInBand --silent src/chat/zentao.service.spec.ts`，退出 0，4 通过、0 失败、0 跳过。ZentaoService 使用空配置进入 mock，覆盖缺陷 ID 与关键词搜索。未启动 stdio MCP、连接外部服务或验证镜像包装。IM Controller 套件将 UpChatHandler 替换为桩，当前没有覆盖 webhook 的实际签名校验与出站回执。
