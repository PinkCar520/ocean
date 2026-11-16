# T17 Ocean 核心行为对照验收

日期：2026-11-16。范围：当前工作区，包含 T01–T16 未提交改动。仅只读查看 `restored-src`，未运行或复制参考实现。结论是所列执行分支的静态对照加 Ocean 实测，不代表参考产品全功能认证。

## 判定口径

- 完全兼容：本次领域范围内全部关键分支有对照和执行证据。
- 部分兼容：存在共同语义，但缺实现、测试或恢复保证。
- 有意不支持：Ocean 明确以拒绝或限制实现的子能力；不把尚未开发的能力当作产品决定。
- “通过”仅用于实际执行的测试；模拟数据库不证明真实数据库竞争安全。

本次没有领域达到“完全兼容”。13 个领域均有实现与测试证据，统一结论为**部分兼容**。有意限制的子能力另列。

## 参考行为证据

以下为实际阅读到的分支，路径均相对仓库根目录：

| 编号 | 参考源码 | 实际行为 |
| --- | --- | --- |
| R1 | `restored-src/src/query.ts:307`、`:554` | 循环执行；以实际 tool_use 判断续跑，而非只依赖 stop_reason；Stop Hook 参与循环出口 |
| R2 | `restored-src/src/services/tools/toolExecution.ts:415`、`:683` | 执行前检查取消；解析后调用工具 validateInput，失败产出错误结果 |
| R3 | `restored-src/src/types/permissions.ts:44`；`services/tools/toolExecution.ts:735` | allow/deny/ask 三态；工具执行层协调 Hook、分类器与审批交互 |
| R4 | `restored-src/src/tools/SkillTool/SkillTool.ts:443`–`:479` | 技能激活经过权限规则，规则可阻断，不只是读取文件 |
| R5 | `restored-src/src/services/mcp/client.ts:148`–`:168` | 认证失败独立错误类型；会话过期清连接缓存并要求获取新连接 |
| R6 | `restored-src/src/utils/hooks/execHttpHook.ts:45`–`:120` | HTTP Hook 有 URL 与环境变量允许列表，插值受约束并考虑 CRLF |
| R7 | `restored-src/src/tools/AgentTool/resumeAgent.ts:63`–`:84` | 读取独立 transcript/meta；过滤悬空工具调用和不合法思考片段，重建恢复状态 |
| R8 | `restored-src/src/utils/sessionStorage.ts:204`、`:257` | 父 Session 使用 JSONL；子 Agent 有独立 JSONL 与元数据文件 |
| R9 | `restored-src/src/services/compact/autoCompact.ts:30`–`:48`、`:257` | 按模型窗口减输出预留；连续失败熔断，阈值为 3 |
| R10 | `restored-src/src/utils/fileHistory.ts:81`–`:120` | 修改前备份；已跟踪文件不重复覆盖初始备份，后续快照重新检查变化 |
| R11 | `restored-src/src/tools/EnterWorktreeTool/EnterWorktreeTool.ts:83`–`:98` | 从主仓库创建会话 Worktree，切换 cwd 并持久化状态 |
| R12 | R2、R5、R7 | 可见取消、会话重连和恢复过滤分支；这些证据不能推出通用外部副作用 exactly-once 保证 |

## 13 领域行为测试矩阵

单元格列出正常 / 拒绝 / 取消 / 故障恢复的实现或测试状态。所有 Ocean 路径相对仓库根目录。

| 领域、结论 | 对照与实现证据 | 正常流程 | 拒绝流程 | 取消流程 | 故障恢复与差异 |
| --- | --- | --- | --- | --- | --- |
| Agent Loop：部分兼容 | R1；`apps/cli/src/llm/chat.ts` | `chat.loop.spec.ts`：模型与工具多轮、历史结果 | Stop 阻断与续跑上限 | 已取消 turn 和延迟工具拒绝执行 | 工具 Journal 已接入；崩溃后 transcript 对账未完成 |
| 工具调用：部分兼容 | R2；`tools/base.ts`、`tools/index.ts`、`tools/notebook-rpc.ts` | `tools/execution.spec.ts`：Agent/RPC 读取数据一致 | 参数 schema 校验 | 共享执行边界取消检查 | 旧入口与 MCP 未全部统一；返回结构仍有历史差异 |
| 权限：部分兼容 | R3；`utils/permission-policy.ts`、Gateway `skill/permission.service.ts` | 策略 allow 及参数规则 | `permission-policy.spec.ts`、`permission-parity.spec.ts`：deny 优先、坏配置拒绝 | 执行门受 signal 约束；非所有路径专项测试 | CLI/Gateway 有共同策略核心；旧 RPC 与新审批仍未全面统一 |
| 审批：部分兼容 | R3；`llm/chat.ts`、`approval/gateway-approval.ts`、Gateway `worker/tool-executor.ts` | 显式批准后执行 | 无 Handler、rejected、expired 均不执行 | `chat.security.spec.ts`：批准返回前取消不执行 | 参数变化拒绝、批准后再查策略；端到端用户/Session/指纹/有效期绑定未完成 |
| Skills：部分兼容 | R4；`skills/loader.ts`、`tools/skill-tool.ts` | `skills/loader.spec.ts`、`tools/index.spec.ts`：项目优先、按需加载、显式激活 | 未知技能、非法路径拒绝 | 通过 Agent 通用取消门；无完整技能取消专项 | 激活指令可从历史恢复；参考实现技能专属权限上下文未完整对应 |
| MCP：部分兼容 | R5；`mcp/client.ts`、Gateway `mcp/mcp-client.manager.ts` | `mcp/client.spec.ts`：真实 stdio/HTTP、工具发现 | 不安全 URL、schema、未知工具；认证诊断不暴露 Token | 调用 signal、超时，已取消不派发 | 断线结果 unknown、不自动重试；Gateway 用户/Workspace 敏感连接隔离、OAuth 安全存储尚缺 |
| Hooks：部分兼容 | R6；`utils/lifecycle-hooks.ts`、`llm/chat.ts` | 原四事件，ToolUseFailure；结构化输出 | exit 2、deny/ask、坏 JSON；项目哈希授权 | 命令超时/取消；新增 Prompt 取消测试 | HTTP 类型拒绝执行；Prompt 求值器是扩展接口，未接产品配置；故障后重新加载配置 |
| Subagents：部分兼容 | R7；`subagents/delegate.ts` | `subagents/delegate.spec.ts`：独立上下文、持久化父子记录、完成结果复用 | 未知 Agent、预算、并发、嵌套工具限制 | 父 signal 传播，超时；完成前再查取消 | 独立子 Session/Journal；未知任务不重放，但真实 resume、PID 重用、父子终态同步未完成 |
| Session：部分兼容 | R8；`utils/session-store.ts` | `session-store.spec.ts`：跨进程读取、旧格式 | 跨 Workspace、非法 ID、孤立结果拒绝 | 中断保留完整快照；无完整取消写入测试 | revision/CAS 与写锁；坏记录跳过、临时文件忽略；死锁回收及公开 API 预期版本未完成；存储为 JSON 快照而非 JSONL |
| Compaction：部分兼容 | R9；`llm/compaction.ts` | `compaction.spec.ts`：长历史压缩、目标/文件/失败测试/待办保留 | 坏摘要、不减量、超预算拒绝 | 调用传 abortSignal；无模型中途取消专项 | 新进程恢复快照；新增悬空调用边界测试；两次失败熔断，默认估算预算，模型元数据与失败计数持久化尚缺 |
| Checkpoint：部分兼容 | R10；`utils/checkpoints.ts`、`utils/file-system.ts` | `checkpoints.spec.ts`：创建、修改、删除恢复 | 后续用户编辑冲突、符号链接、路径逃逸拒绝 | 写入前检查 signal；无全部阶段取消注入 | 双进程持锁竞争与回滚中途退出恢复通过；外部不合作写者最后竞态仍存在；锁依赖 python3 |
| Git/Worktree：部分兼容 | R11；`tools/local/git.ts`、`git-agent.ts`、`tools/git-rpc.ts` | `git.workflow.spec.ts`：归属提交、保留用户暂存、Worktree 恢复 | manifest/归属/dirty removal 拒绝；新增并发 HEAD 变化测试 | 已取消 Worktree 不创建 | 工作区绑定可恢复；Git 执行中强退、push 独立审批和网络失败覆盖不足 |
| Idempotency/Recovery：部分兼容 | R12；CLI Journal；Gateway `worker/tool-executor.ts`、`run-ownership.ts` | `tool-executor.spec.ts`：确认结果缓存复用 | 同键异参、unknown 非幂等重放拒绝 | 执行前状态/审批取消门；所有权检查不等同于中止外部副作用 | `tool-journal.spec.ts`：副作用后进程退出不重放；数据库落库失败 unknown；真实双 Worker、统一 ToolExecutor fencing、唯一调用约束尚缺 |

测试文件缩写的 CLI 默认目录为 `apps/cli/src/`；Gateway 权限、执行器、Outbox 测试分别位于 `apps/gateway/src/skill/`、`worker/`、`run/`。

## 有意限制与未完成能力

- 当前委派仅允许 `file_read`、`grep`、`glob`，禁止嵌套及写工具。这是可执行的安全限制；未来写代理仍属未完成能力。
- 未经个人配置精确授权的项目 Hook 不执行，Hook 的 allow 不授予工具权限。
- HTTP Hook、MCP OAuth 存储、完整子任务 resume 不能标为“有意不支持”；目前仅缺实现或明确产品决策。
- 不宣称 Ocean 或参考实现具有普遍 exactly-once 外部副作用语义。

## 本次新增测试

1. `apps/cli/src/utils/lifecycle-hooks.spec.ts`：仅精确项目内容哈希获得授权；内容变化撤销授权；Prompt 等待时取消不接受放行。
2. `apps/cli/src/llm/compaction.spec.ts`：历史含未匹配工具调用时不切断配对，不请求压缩模型、不保存摘要。

这些测试锁定当前安全语义；未增加或降低生产权限，未修改参考源码。

## 验收运行

本次命令均实际完成，退出码为 0：

| 命令 | 本次结果 |
| --- | --- |
| `pnpm --filter @ocean/cli exec vitest run src/utils/lifecycle-hooks.spec.ts src/llm/compaction.spec.ts` | 2 文件、15 项通过，包含本次新增 3 项 |
| `pnpm run ci:typecheck` | CLI 与 Gateway TypeScript 检查通过 |
| `pnpm run ci:unit` | CLI 28 文件、149 项通过；Gateway 37 套件、249 项通过，原有 PostgreSQL 集成 1 套件/1 项跳过 |
| `pnpm run ci:e2e` | 1 套件、5 项通过，无 0 tests |
| `pnpm run ci:faults` | CLI 8 文件、55 项通过；Gateway 6 套件、88 项通过（与单元测试存在重叠，不叠加统计覆盖率） |
| `git diff --check -- <本次文件>` | 通过 |
| 检查 staged/unstaged `restored-src` 差异 | 均无差异 |

HTTP/MCP 测试获得本地端口监听权限后执行，未跳过这些测试。HTTP E2E 使用真实 Nest 控制器与 JWT 守卫，RunService 为测试替身；PostgreSQL 集成测试由已有环境开关控制。

## 发布结论

对照报告完成不等于核心行为全部兼容。当前不能据此发布“完全兼容 Claude Code”声明。优先阻断项为：真实数据库执行所有权/唯一副作用身份、审批身份端到端绑定、Gateway MCP 敏感连接隔离、Session/Journal 历史恢复对账、Checkpoint 非合作写者竞态。
