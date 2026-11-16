# Ocean Claude Code 核心能力迁移最终验收

审计日期：2026-11-16（Asia/Shanghai）。结论：**仅限内部测试；不具备“完整迁移”候选版本发布条件。**

## 1. 审计基线与证据边界

- 项目：`/Users/caomeifengli/Documents/workspace/uwork/ocean/`。
- 分支：`main`；HEAD：`8d33c4e146c4a1f2912aa9b62f56ea19ba959553`。
- 审计结束 HEAD：`bd1986edcc7665b702a1265b8934e2bc9ea9d5ff`（`add_some_feature`）。审计过程中观察到外部提交推进 HEAD；审计工具没有执行 commit/stage。结束时除本报告外工作区干净。2700 个已跟踪文件内容哈希均未变化，且 `git diff 8d33c4e bd1986e --binary` 哈希与上述迁移基线差异哈希相同，因此证据同样适用于该结束提交。
- 最近历史（开始时）：`8d33c4e fix`、`6cea35e fix`、`d5555aa fix`；这些提交标题不能证明 T01–T15 验收。
- 开始时存在 **52 个已暂存迁移相关文件**，不是干净工作区。验收对象是 HEAD 加当前索引/工作区，不能把结论归属于 HEAD 单独版本。
- 基线 `git diff HEAD --binary` SHA-256：`314a526bb3f4c03b9d34d7e47ddc3c590cf66806aa93fc98e7c75b4f51a76d57`。该哈希不包括本报告。
- Node：`v24.14.1`；实际 pnpm：`10.33.0`；根 packageManager 声明 `pnpm@11.7.0`，存在环境版本差异。
- 根脚本：`test=turbo run test`，`typecheck=turbo run typecheck`，`check=lint → typecheck → build → test`。本次没有运行全仓 check/build，避免改写构建产物及扩大审计范围。
- 遵循 `Agents.md` 的只读审计例外。仅新增本报告；不修改业务、测试、配置或 restored-src。

已有文档：[v2 迁移计划](../architecture/v2/MIGRATION_PLAN.md)、[MCP 升级报告](../architecture/MCP_UPGRADE_REPORT.md)。前者是 2026-09 的架构计划，后者是 2026-04 的 MCP 声明，**不能代替本次执行证据**。没有发现规范化最终审计目录，采用请求路径 `docs/audits/`。

T07–T15 使用本会话任务记录、实际源文件和保留的 T15 日志交叉核对；T01–T06 没有可查的独立任务验收报告，只按当前代码和测试确认行为。没有找到 P/A/CP/G/E 全量编号定义，尤其不能据此声称 E01–E50 全部通过。

## 2. 实际测试证据

| 编号 | 命令/范围 | 实际结果 | 证据性质 |
|---|---|---|---|
| V1 | `pnpm --filter @ocean/cli exec vitest run` | 24 文件、123 测试通过 | T15 完整 CLI 日志；包含临时目录、临时 Git 仓库和本地 MCP Server |
| V2 | `pnpm --filter gateway exec jest --runInBand worker.service.spec run-runner.spec tool-executor.spec run.service.spec run.controller.spec outbox.service.spec` | 6 套件、86 测试通过 | T15 Run/Worker 核心测试；Prisma/队列主要使用 mock |
| V3 | `pnpm --filter @ocean/cli typecheck`、`pnpm --filter gateway typecheck` | 均通过 | T15 日志；不是全仓类型检查；T16 未重跑有 prebuild 的命令 |
| V4 | `pnpm --filter gateway test:e2e --runInBand` | 1 套件加载失败、0 测试执行 | Jest 加载 AI SDK ESM 失败；不得计为 HTTP 链路通过 |
| V5 | `pnpm --filter gateway exec jest --runInBand permission-parity.spec permission.service.spec workspace-policy.spec policy.evaluator.spec` | 4 套件、39 测试通过 | T16 定向复核；只写临时测试日志 |
| V6 | `pnpm --filter @ocean/cli exec vitest run src/llm/runtime.e2e.spec.ts` | 7 测试通过 | T15 后续加入独立个人配置目录后已定向复跑；不 mock Agent Loop/AI SDK，只控制模型响应 |
| V7 | `git diff --check`、`git diff --cached --check` | T15 均通过 | 格式证据，不代表运行正确性 |

V1–V2 是既有证据复用，不冒充 T16 全量重跑；V6 是 V1 内 7 个用例的更新后复验，不重复加总测试数量。V5 与 V2 文件范围不同。

T15 日志位于 `/tmp`，是本机临时证据，可能被系统清理；发布前需将证据归档到 CI 制品。本报告保留摘要和哈希：

| 日志 | SHA-256 |
|---|---|
| `/tmp/ocean-t15-cli.log` | `baecaac1cb5ba508033483cd684463c4cad1b2cd080ebc44dffc165be9d04188` |
| `/tmp/ocean-t15-worker.log` | `f02e75b67fce166a72aad21c9ebfb3953b3152e3d116898af65f11c0fb4024cf` |
| `/tmp/ocean-t15-gateway-e2e.log` | `b09874512a611bb396840cddc58580d632522eb96d6597e9b2c9f74e6efa20ac` |
| `/tmp/ocean-t16-permissions.log` | `3063fb660ec86b44392522f18ba54de74390a071d99b0cfa86cd0330b91210b4` |

Gateway 复现失败关键日志：`ai/dist/index.js` 的 `import ... from "@ai-sdk/gateway"` 导致 `SyntaxError: Cannot use import statement outside a module`。这是测试装载阻塞，尚未验证数据库、HTTP 鉴权和实际 Worker 部署。

## 3. 13 项能力核验

“已实现且验证”指该项列明的核心行为具备运行证据，不代表 Claude Code 全协议、全平台兼容。“部分实现”即使有局部通过测试，也不计入严格完整验收覆盖率。

| 能力 | 状态 | 代码路径 / 关键函数 | 测试及实际结果 | E2E / 故障证据 | 尚未覆盖或缺失 |
|---|---|---|---|---|---|
| Permission Engine | 已实现且验证 | `packages/shared/core/src/permission-policy.ts`：`evaluatePermission/evaluateTool`；`apps/cli/src/utils/permission-policy.ts`：`PermissionPolicy.evaluate`；Gateway `skill/permission.service.ts`、`runtime/policy.evaluator.ts` | CLI `permission-policy.spec.ts` 5 项通过；V5 39 项通过 | V6 实际工具经过权限适配器；坏配置 fail-closed、deny 优先及 CLI/Gateway 规则一致性有测试 | 未证明所有旧 RPC/远端入口和部署组合；不将这些入口纳入已验证声明 |
| Approval | 已实现且验证 | CLI `llm/chat.ts`：`applyApprovalGate`、`approval/gateway-approval.ts`；Gateway `run/run.service.ts`：`decideApproval/cancel`，`worker/tool-executor.ts`：`ensureApproval/validateApproval` | `gateway-approval.spec.ts`、`run.service.spec.ts`、`tool-executor.spec.ts` 均在通过集合内 | V6 审批→文件副作用，以及审批回调同时取消→文件不创建；参数/用户/过期校验、取消状态 CAS 有单元测试 | CLI E2E 使用审批回调；真实 HTTP/Web 审批全过程没有通过证据 |
| Idempotency & Recovery | 部分实现 | Gateway `worker/tool-executor.ts`：`findSucceededByIdempotencyKey/ensureStepStarted/handleFailure`；`worker/worker.service.ts`：`recoverStaleRuns/recoverRun`；`worker/run-runner.ts`：`execute` | V2 全通过，包含成功结果缓存、未知写入结果禁止重放、取消后不重启 | 新增“副作用成功但落库失败”注入测试通过；重建 executor 后 started 写步骤不再次调用工具 | mock 存储不等于真实数据库崩溃恢复；并发不同消息指向同一 running Run 尚未验证 |
| Agent Loop | 已实现且验证 | CLI `llm/chat.ts`：`runChatLoop`；Gateway `worker/run-runner.ts`：`execute/buildContext` | `chat.loop.spec.ts` 17 项、V6 7 项及 Gateway runner 测试通过 | 真实 AI SDK 多步骤工具循环、结果返回模型、结束、取消、Stop 续跑已执行 | 控制模型响应，不是付费在线模型质量验证；Gateway HTTP 整链路未通过 |
| Tool Execution | 已实现且验证 | CLI `tools/index.ts`：`toAgentToolSet`；`tools/core-tools.ts`、`notebook-edit.ts`；Gateway `worker/tool-executor.ts`：`execute` | core-tools 10、notebook-edit 3、notebook-rpc 3、adapter 5 项均通过 | V6 真实文件写入、MCP 调用；取消阻止副作用；T13/T14 文件与 Git 集成测试 | 不承诺回滚任意 Shell/数据库/远程 API 副作用；Windows/生产设备通路未完整验证 |
| Session | 部分实现 | CLI `utils/session-store.ts`：`save/load/validateTranscript`；`repl.ts`、`ui/app.tsx` 的回合后保存；Gateway `session/session.service.ts` | session-store 4 项通过 | 独立 Node 进程恢复完整消息；V6 压缩摘要和原历史跨进程读取通过 | CLI 工具结果在整个回合返回后才保存；工具成功→回合保存前崩溃有缺口；SessionService 真实 DB 恢复未验证 |
| Context Compaction | 部分实现 | CLI `llm/compaction.ts`：`compactContext/contextTokens/historyDigest`；`session-store.ts`：`saveCompaction` | compaction 3 项、V6 压缩续跑场景通过 | 结构化摘要、原历史保留、工具调用后继续、多次压缩和独立进程恢复有证据 | 字节数估算不是模型 tokenizer；仅每轮入口检查；单轮工具膨胀、超大单条输入和真实计费 usage 降幅未验证 |
| Hooks | 部分实现 | CLI `utils/lifecycle-hooks.ts`：`LifecycleHooks.load/run`；`llm/chat.ts` 四事件接入 | lifecycle-hooks 5 项及 chat.loop 中对应测试通过 | V6 实际命令 PreToolUse、Stop 阻止结束后续跑；超时、取消、仓库配置不自动执行有测试 | Gateway 未接入；PostToolUse 发生异常时工具已经执行，持久化与重试安全没有完整证据；输出协议仅实现子集 |
| Skills | 部分实现 | CLI `skills/loader.ts`：`discoverSkills/loadSkillsFromDir`；`tools/skill-tool.ts`；`llm/chat.ts`：`activeSkillInstructions` | loader 2 项、chat.loop 激活/恢复测试及 V6 Skill 场景通过 | 真实 SDK 激活工具结果进入下一轮模型；项目同名覆盖、正文 getter 重读有测试 | 简易 frontmatter 非完整 YAML；发现阶段仍读取整份 SKILL.md，按需主要是上下文注入；完整路径/元数据兼容和 Skill+压缩+跨进程组合未完整证明 |
| MCP | 部分实现 | CLI `mcp/client.ts`：`loadConfig/connectAll/getAllTools/callTool`；`tools/index.ts` MCP 权限适配 | client 7 项及 V6 MCP 场景通过 | 本地真实 stdio、Streamable HTTP 初始化/发现/调用；Schema 校验、未知结果不重试、实例路由隔离有测试 | 远程 OAuth/刷新未实现；同一 OS 账户的不同逻辑用户仍共享个人配置/环境凭据来源，不能把实例隔离当作凭据隔离 |
| Subagents | 部分实现 | CLI `subagents/delegate.ts`：`loadSubagents/createDelegationTool`；`llm/chat.ts` 委派注册 | delegate 6 项、V6 实际子循环场景通过 | 子上下文不含父私有消息、仅父工具只读子集、结果回主 Agent、预算/单并发/取消有测试 | 没有持久化子 Run/Step 与父任务关联；pending Map 随进程丢失；仅已持久化父工具结果可复用；禁止嵌套，未完成中断子任务恢复 |
| Checkpoint | 部分实现 | CLI `utils/checkpoints.ts`：`change/rollback/get/diff`；`tools/checkpoint.ts`；四个受控文件修改入口 | checkpoints 6 项通过 | create/modify/delete、多文件冲突预检查、保存失败阻断、独立进程回滚、回滚进程中途退出后恢复均通过 | 锁是进程内 NotebookSnapshots；检查与 rename/unlink 之间不是跨进程 CAS；并发外部写入安全未完整证明；Gateway 未接入；仅受控文本文件 |
| Git / Worktree | 部分实现 | CLI `tools/local/git.ts`：`GitTool.execute/buildGitArgs`；`git-agent.ts`：检查点归属/进入离开；`tools/index.ts`：`executionContext`；`session-store.ts`：`saveWorktree` | git.security 5、git.workflow 8 项通过 | 真实临时仓库保护原暂存区、选择性提交、两 Worktree 隔离、Shell/文件 cwd、脏目录拒删、独立进程恢复 | Gateway Run 绑定缺失；外部 Git 同时改 index/HEAD 的竞争未验证；检查与 Git 提交之间仍有窗口；只验收结构化 Git 工具，不保证任意 Shell Git 命令安全 |

路径前缀约定：未写全的 CLI 文件均位于 `apps/cli/src/`，Gateway 文件位于 `apps/gateway/src/`。测试文件与对应实现同目录；V6 为 `apps/cli/src/llm/runtime.e2e.spec.ts`。

## 4. T15 关键安全核验与故障测试

下表限定 **10 个可定位的抽样故障用例**，每行对应实际通过测试中的独立断言场景，不把多个断言或重跑次数加总。

| 编号 | 场景 | 证据位置 | 结果 / 限制 |
|---|---|---|---|
| F01 | 成功幂等键重复投递不再次执行工具 | `worker/tool-executor.spec.ts`：`deduplicates by idempotencyKey` | 通过；模拟数据库 |
| F02 | 工具成功但结果落库失败，再建 executor 后禁止重放写工具 | 同文件：`does not replay a write after side effect success and result persistence failure` | 通过；故障注入，不是真实杀 Worker/DB |
| F03 | 已取消 Run 不重启、不调用模型 | `worker/run-runner.spec.ts`：`does not restart a cancelled Run or call the model` | 通过 |
| F04 | 取消抢先后丢弃迟到的模型增量和工具调用 | 同文件：`drops late model deltas and tool calls after cancellation wins the status update` | 通过；模拟持久状态 |
| F05 | 审批通过回调同时取消，文件不创建 | `llm/runtime.e2e.spec.ts`：`cancels after approval wins...` | 通过；真实 SDK 和文件工具 |
| F06 | 多文件任一用户修改冲突，其他文件也不回滚 | `utils/checkpoints.spec.ts` 首个 create/modify/delete 用例 | 通过；真实文件 |
| F07 | 快照落盘失败，受控文件保持原内容 | 同文件：`does not modify the target when snapshot persistence fails` | 通过 |
| F08 | 回滚进程恢复第一个文件后退出，日志可识别并恢复剩余文件 | 同文件：`recovers after a rollback process exits between two file restores` | 通过；真实子进程退出码 77 |
| F09 | 选中文件已有用户暂存版本时拒绝提交、不覆盖 index | `tools/local/git.workflow.spec.ts`：`protects a pre-existing staged version of the selected file` | 通过；真实 Git |
| F10 | 两 Worktree 隔离且脏 Worktree 不被删除 | 同文件：`creates isolated worktrees...refuses dirty removal` | 通过；无 force/remove/reset-hard |

权限绕过核验：V5 验证 deny 优先和身份/配置范围；CLI `applyApprovalGate` 在 PreToolUse 前运行 existing beforeApproval，Hook `allow` 不直接授予工具权限。未发现本次证据范围内可稳定复现的强制 deny 绕过；这不是所有入口无漏洞的证明。

外部副作用：Gateway 对已开始且结果未知的非只读工具拒绝重放；CLI 的整回合持久化缺口尚存，不能推广为“全系统 exactly-once”。

用户 Git 变更：结构化 Agent Git 工具使用 T13 检查点链、HEAD/文件哈希和明确清单，`commit --only -- <paths>` 保留无关暂存项；实际测试确认同文件已有用户暂存内容也被拒绝。没有验证任意并发 Git 操作与 Hooks 修改 index 的场景。

## 5. 覆盖率计算

不估算缺失的编号验收项，不对部分实现任意打 0.5 分。仅使用可重算的显式分母：

| 指标 | 计算 | 结果 | 解释 |
|---|---|---|---|
| 功能存在覆盖率 | 有核心实现的能力域 / 请求的 13 个能力域 = 13/13 | **100%** | 包括 9 项“部分实现”；不是迁移完成率 |
| 严格完整功能验收覆盖率 | 状态“已实现且验证”的域 / 13 = 4/13 | **30.8%** | Permission、Approval、Agent Loop、Tool Execution；按表中核心范围 |
| 严格已验证覆盖率 | 核心范围实现且有运行证据的完整域 / 13 = 4/13 | **30.8%** | 9 个部分域的局部测试不提升该指标；不表示其完全没有测试 |
| 核心 CLI E2E 已执行通过率 | V6 通过 / 已执行 = 7/7 | **100%** | 真实 SDK、可控 LLM，不是生产全链路 |
| E2E 门禁通过率（计入阻塞） | CLI 7 场景通过 /（CLI 7 + Gateway `/` 场景 1 阻塞）= 7/8 | **87.5%** | Gateway 套件装载失败，未执行的测试不计成功 |
| 抽样关键故障测试通过率 | F01–F10 通过 / 已执行 = 10/10 | **100%** | 不包括下方未验证关键项；不是全故障空间覆盖率 |
| 未验证关键项数量 | 下方 K01–K10 | **10 项** | 无运行证据或只有 mock 的关键生产组合 |

**E01–E50 整体覆盖率：不可计算。** 缺少条目定义与完整清单，不能用 123/86 个测试替代 50 项行为分母，也不能把测试总数当成功能覆盖率。没有付费模型质量、全仓 lint/build、全平台兼容或性能验收的结论。

### 未验证关键项清单

1. K01：真实数据库/队列下 Worker 被杀后重启及同一写工具不重放。
2. K02：不同消息并发投递同一 running Run 时模型/工具唯一执行权。
3. K03：CLI 工具副作用成功、整回合历史尚未保存时崩溃并恢复。
4. K04：PostToolUse 异常/超时发生在副作用之后的持久化与安全续跑。
5. K05：两个进程并发回滚/修改同一 Checkpoint 目标，以及检查后用户写入竞态。
6. K06：远程 MCP OAuth 授权、回调绑定、过期刷新（当前未支持）。
7. K07：同一 OS 账户下不同逻辑用户/工作区的 MCP 凭据来源严格隔离。
8. K08：活动 Subagent 的父子 Run/Step 持久化和杀进程后恢复。
9. K09：外部 Git/提交 Hook 并发修改 index/HEAD 时提交清单与原暂存区保护。
10. K10：真实 Gateway HTTP 鉴权→审批→Worker→工具→恢复的整应用链路。

## 6. 问题分级与发布门禁

### P0

**已确认 P0：0 项。** 没有足够运行证据证明当前可稳定触发全局强制拒绝绕过或静默破坏用户数据；未验证项仍可能藏有高危问题，不能按零漏洞解释。

### P1：阻塞“完整迁移”候选版本发布

| ID | 发现与证据 | 类型 | 验收退出条件 |
|---|---|---|---|
| P1-01 | CLI 仅在 `runChatLoop` 返回后保存完整工具消息，副作用成功→进程退出存在历史缺口；`repl.ts`、`ui/app.tsx`、`session-store.ts` | 已确认实现缺口；K03/K04 未验证 | 复用现有 Run/Step 恢复边界，注入中断后证明不会危险重放 |
| P1-02 | Subagent 没有持久化子 Run/Step，pending 只在内存；`subagents/delegate.ts` | 已确认实现缺口；K08 | 父子任务持久关联、取消和重复投递/重启测试通过 |
| P1-03 | Checkpoint 只有进程内锁，compare 与 rename/unlink 之间有竞争窗口；`utils/checkpoints.ts`、`notebook-snapshots.ts` | 静态风险；K05 未复现 | 跨进程冲突注入证明不会覆盖用户后续写入，或明确限制为独占会话并强制执行 |
| P1-04 | RunRunner 接受 queued/running，claim 条件没有执行所有权 token；outbox 租约不能单独证明不同消息同 Run 唯一执行；`worker/run-runner.ts:105–107` | 静态风险，不宣称已复现双执行；K01/K02 | 真实存储下双 Worker/重复 Run 投递与崩溃恢复测试通过 |
| P1-05 | Gateway 整应用 E2E 被 ESM 加载阻塞；V4、`test/jest-e2e.json` | 已复现测试阻塞；K10 | 修复装载后在隔离 DB/队列上跑通审批与恢复全过程 |
| P1-06 | MCP 实例路由隔离有测试，但个人配置/环境变量凭据没有按逻辑 userId/工作区分域；`mcp/client.ts:48` | 已确认隔离设计缺口；K07 | 建立当前支持范围的凭据绑定并通过交叉用户/工作区测试 |
| P1-07 | 压缩只在回合入口触发，字节估算、无轮内预算检测；`llm/compaction.ts`、`chat.ts` | 已确认实现边界 | 大工具输出和重复步骤压力测试；证明不会超预算后丢失任务/工具协议 |
| P1-08 | 会话、Hooks、Subagents、Checkpoint、Worktree 的 Gateway 集成不完整；T07–T14 记录和对应 Worker 入口 | 已确认跨模块缺口 | 统一受支持执行路径，给出与 CLI 相同安全行为的集成证据 |

P1-03/P1-04 是必须验证/约束的发布风险，不冒充已复现故障。P1-06 若限定单 OS 用户、单逻辑账户内部试验，可以作为明确限制；不能对外声称多租户隔离完成。

### P2：技术债或明确排除项

- frontmatter 简易解析、Skill 发现仍整文件读取；配置目录优先级及跨压缩恢复兼容清单不完整。
- Hook matcher/输出协议只覆盖子集，Gateway 未接入；完整 H/K/M/CP/G 编号规范缺失。
- 远程 OAuth 不支持：应明确排除，不能计为远程授权能力完成；若纳入发布范围则升级 P1。
- Git 并发 index/HEAD 验证缺口；当前只允许内部串行操作，不声明并发安全。
- Checkpoint 仅受控文本文件，Shell/数据库/远端副作用不在回滚范围；快照元数据可能使 Worktree 保持 dirty，保留而不强删是安全默认。
- 测试日志未成为持久 CI 制品；T01–T15 缺少逐任务提交/验收索引（结束时已聚合进入 `bd1986e`）；pnpm 运行版本与声明不一致。

## 7. 发布结论与下一步

**发布结论：仅限内部测试。** 可以在隔离临时工作区、可控模型、单一逻辑账户和串行受控执行条件下验证核心路径；不能标记“Claude Code 完整迁移完成”，不能发布多租户/崩溃恢复安全承诺的候选版本。

最优先任务：**先补通持久执行与恢复的唯一安全边界**——把 CLI 工具结果和子任务关联接到现有 Run/Step/终止控制，使用隔离数据库实施“副作用成功但结果未保存→杀进程→重启→重复投递”测试，再验证双 Worker、审批/取消竞态。不得另建恢复服务。

随后修复 Gateway E2E 装载并接通真实 HTTP 链路；解决 Checkpoint 多进程冲突保护与 MCP 身份凭据隔离；补齐编号规范与 CI 证据归档，再重新验收。T16 不为提升百分比修改这些实现或测试。

## 8. 只读完整性检查

审计开始记录了 2700 个已跟踪文件的内容哈希，并在报告生成后逐一复核：内容变化 0 项。业务代码、测试、配置与 restored-src 均与审计开始完全一致；变化仅为外部提交推进了 Git HEAD/索引。唯一允许的项目新增文件是本报告。
