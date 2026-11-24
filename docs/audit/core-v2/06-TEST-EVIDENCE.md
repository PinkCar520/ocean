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
