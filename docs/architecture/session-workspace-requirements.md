# Ocean Work / Life 与 Session Workspace 需求文档

> 版本：v0.2
> 状态：Draft；Session Workspace MVP 已实现目录绑定元数据
> 更新日期：2026-11-18
> 范围：Work / Life 信息架构、Project / Workspace / Session 对象关系、本机目录选择和执行边界
> 说明：本文区分已确认方向、建议方案和待确认决策。本文是产品需求，不代表相关后端能力已实现。

## 1. 摘要

Ocean 面向用户只提供两个工作空间入口：**Work** 与 **Life**。用户以 **Session** 发起和跟进任务；**Project** 用于长期组织相关任务和上下文；**Workspace** 描述任务可以访问的执行环境和目录范围。Code 是 Work 内的一类任务能力，不是第三个 Space。

建议对象关系：

```text
Space (Work | Life)
  └── Session (任务、对话、状态)
        ├── optional Project (长期组织和共享上下文)
        ├── optional Workspace binding (执行环境、目录 roots、权限)
        └── Runs (执行记录；复用现有 Gateway Run 生命周期)

Workspace 可由一个主目录和零个或多个附加目录组成。
Session 在开始执行时绑定 Workspace 配置快照；Worktree 是可选的隔离策略。
```

选择本机目录的 UI 是执行上下文入口，不等于本机 Agent Host、文件权限隔离、命令审批或 Git Worktree 已经可用。实现这些能力须分别完成并验证。

## 2. 背景与问题

当前产品已将导航收敛到 Work 和 Life，Chat 可在两者中使用，Code 能力归入 Work。工作区入口位于输入框**上方**，其含义应是选择执行目录，而不是选择 Knowledge Project。

现有工作区选择仍复用 Knowledge Project：`WorkspaceContext.activeProject` 是全局持久化选择，选择项不是 Session 级的本机 Workspace；因此它无法准确表达：

- 一个任务在哪个执行环境中运行；
- Agent 可访问哪些本机目录，以及当前工作目录（CWD）是什么；
- 不同 Session 是否使用独立目录或 Git Worktree；
- 切换项目/目录是只影响新 Session，还是会改变正在进行的 Session。

本需求要把 UI 概念和后续执行能力的边界讲清，避免将“能选目录”误认为“Agent 已能安全访问目录”。

## 3. 产品目标

### 3.1 目标

1. 用户可从 Work 或 Life 创建、切换和管理 Session。
2. Work 采用 Session-first：用户关注任务状态、Agent 是否需要介入、变更与结果。
3. Session 可选关联 Project 和 Workspace；这两种对象职责不同，不强制形成严格的 Project → Workspace → Session 树。
4. Work Workspace 支持一个主目录和多个附加目录，并明确 CWD、可访问范围与权限。
5. Session 与其执行范围保持稳定：目录选择或 Workspace 默认值变化不得静默改变已有 Session 的执行边界。
6. 桌面端、本机执行、权限和隔离能力按阶段交付，每阶段有独立验收标准。

### 3.2 非目标

- 不新增第三个 Code Space；不以文件浏览器或 IDE 编辑器作为产品首页。
- 不在本需求中实现任意 shell 执行、权限绕过、后台常驻 Agent Host 或云端执行。
- 不把 Knowledge Project、代码仓库、Workspace、Git Worktree 合并成同一个对象。
- 不默认启用 Worktree，不承诺所有目录都可被同一 Worktree 隔离。
- 不假设 Web 浏览器可直接访问用户电脑的任意本机路径。
- 不在本期定义 Life 的完整个人数据模型、跨设备同步策略或自动读取个人文件行为。

## 4. 术语与对象定义

| 对象 | 定义 | 主要职责 | 关系 |
|---|---|---|---|
| **Space** | 面向用户的产品入口，仅有 Work、Life | 导航、会话分类、体验边界 | 每个 Session 属于一个 Space |
| **Project** | 持续开展的一类工作及其共享上下文 | 名称、说明/指令、记忆、相关仓库或资料、Session 分组 | 可包含多个 Session；可不绑定 Workspace |
| **Workspace** | 一组可供 Session 使用的执行环境及路径范围 | Environment、Roots、CWD、访问策略、可用工具等配置 | 可复用；Session 引用配置版本或快照 |
| **Root** | Workspace 中的目录或仓库根 | 描述一个可访问目录；区分主 Root 与附加 Root | 一个 Workspace 有一个主 Root 和零个或多个附加 Root |
| **Environment** | 代码/Agent 实际运行的位置与宿主 | Local、SSH、Cloud、未来可扩展的环境类型 | Workspace 可引用 Environment |
| **Session** | 一次持续的用户—Agent 任务会话 | 对话、上下文、状态、审批和结果 | 属于一个 Space；可选关联 Project、Workspace |
| **Run** | Session 中一段可观察、可恢复的执行 | 执行状态、事件流、步骤、审批和产物 | 复用 Gateway 现有 Run 生命周期 |
| **Worktree** | Git 仓库的隔离工作树 | 降低并行 Session 间的代码变更冲突 | Workspace/Session 的可选隔离策略 |
| **CWD** | Agent 启动命令和相对路径解析的当前目录 | 规定任务的默认工作位置 | 必须位于当前 Session 获准访问的 Root 范围内 |

### 4.1 对象约束

- Project 与 Workspace 不互为别名。一个 Project 可关联多个 Session；Session 可以没有 Project。
- Workspace 是可复用的配置；Session 不应只依赖会变化的“当前 Workspace”全局指针。
- Session 启动后应保存 Workspace 配置版本/快照，包括 Root 清单、CWD、Environment 和权限策略。
- 用户明确为运行中的 Session 添加目录时，必须作为可见的 Session 变更记录，并要求适当的确认；不能静默扩大已有访问范围。
- Workspace 的修改默认仅影响后续 Session。运行中 Session 是否允许更新，按“添加目录”流程显式处理。

## 5. Space 需求

### 5.1 Work

Work 是软件开发及专业任务的工作台。能力形态可包括：

- **Code**：仓库理解、实现、测试、Diff/Review、终端和 PR 工作流；属于 Work 的项目能力或子视图。
- **Projects / Tasks**：长期工作主题、任务清单、项目说明和相关会话。
- **Research / Operations / Documents**：基于对话、连接器、技能或明确授权目录执行的专业工作。

上述是 Work 内的能力类别，不要求每类都成为顶层导航。Work 首页优先呈现需要关注的 Session 状态、Projects 和待处理事项。

Work 中不绑定本机 Workspace 的 Session 仍可用于讨论、规划、研究和问答；当任务需要访问本机代码或文件时，必须选择或创建 Workspace 后才能执行相应访问操作。

### 5.2 Life

Life 面向个人事务、学习、规划、日常知识整理等非工作任务。Life 使用相同的 Session-first 会话基础设施，但不能因进入 Life 就自动读取 Work Project、工作目录或工作记忆。

建议默认行为：

- Life Session 默认不绑定 Work Workspace，也不自动读取本机目录。
- 用户通过附件或显式“添加文件/目录”操作提供上下文；界面需展示共享范围。
- Life 是否支持可保存的 Personal Project、长期记忆和固定目录 Workspace，列为待确认事项，不作为本期隐含功能。

## 6. 典型用户流程

### 6.1 创建 Work Session

1. 用户进入 Work，点击 New Session。
2. 可选 Project；若从 Project 内创建，则继承其说明、记忆和关联资料。
3. 可选 Environment 和 Workspace。选择 Workspace 时展示主目录及附加目录。
4. 确认 CWD、权限模式和可选 Worktree 状态。
5. 用户发送首条消息，创建 Session；执行需要本机访问的任务前，校验 Environment 在线、目录授权有效。
6. 用户可在 Session 内查看执行状态、审批请求、文件变更、测试结果和最终产物。

### 6.2 从现有会话继续

- 从 Session 列表打开已有 Session 时，恢复其 Space、Project、Workspace 快照、Environment 和运行状态。
- 不因当前全局 Project/Workspace 选择变化而改变已有 Session 的目录或权限。
- 若原 Environment 不可用或访问授权已撤销，明确提示并阻止相应本机访问；允许用户恢复环境或创建新 Session。

### 6.3 添加附加目录

1. 用户在 Session 控制区选择“添加目录”。
2. 显示目录选择器，并说明将授予该 Session 的访问范围及权限。
3. 用户确认后，将 Root 加入该 Session 的有效 Workspace 快照并记录事件。
4. Agent 只能在获准 Root 内访问文件；相对路径以当前 CWD 解析。
5. 如果当前 Session 使用 Worktree，新增目录不在该 Worktree 隔离范围内时，需明确提示并遵循经确认的策略，不得展示“已隔离”的误导状态。

### 6.4 Life Session

1. 用户进入 Life 并创建 Session；默认不选择或继承 Work Workspace。
2. 用户可直接对话；若要引用文件，需显式上传或添加文件/目录。
3. 在共享前显示对象/路径和会话范围；移除附件或目录后，新请求不能继续访问其内容。

## 7. 功能需求

优先级：**P0** 必须满足首个可用切片；**P1** 后续增强；**P2** 未来方向。状态“建议”代表方案待评审。

### 7.1 导航与 Session

| ID | 优先级 | 需求 |
|---|---|---|
| NAV-01 | P0 | 用户可见的顶层 Space 仅为 Work 和 Life；Code 出现在 Work 内，不显示为独立 Space。 |
| NAV-02 | P0 | Space 切换不把现有对话错误归属到另一 Space；创建新会话时明确显示目标 Space。 |
| SES-01 | P0 | Session 记录所属 Space、标题、消息/上下文、状态、创建/更新时间及可选 Project/Workspace 关联。 |
| SES-02 | P0 | 用户可从列表恢复 Session；恢复后不能因全局选择改变而更换其绑定 Workspace。 |
| SES-03 | P1 | 侧栏可按运行状态和 Project 分组/筛选 Session；提供等待用户、运行中、已完成和归档等状态视图。 |
| SES-04 | P1 | 需要并行隔离时，允许创建独立 Session；并行执行不应共享可变的 Session 上下文。 |

### 7.2 Project

| ID | 优先级 | 需求 |
|---|---|---|
| PRJ-01 | P0 | Project 有稳定 ID、名称和 Space 归属；Work Project 可保存说明及相关资料/仓库引用。 |
| PRJ-02 | P0 | Project 可关联多个 Session；用户可以从 Project 创建 Session 或把已有 Session 关联到 Project。 |
| PRJ-03 | P1 | Project 说明、记忆和连接资料仅在有权限的关联 Session 中使用，并能被用户查看、编辑和删除。 |
| PRJ-04 | P1 | Project 可以跨多个仓库/目录组织工作，但不因此自动授予文件访问权限；目录必须进入 Session 的有效 Workspace 授权范围。 |

### 7.3 Workspace、Root 与 Environment

| ID | 优先级 | 需求 |
|---|---|---|
| WSP-01 | P0 | Workspace 可配置一个主 Root 和零个或多个附加 Root；显示名称及可识别的路径/仓库信息。 |
| WSP-02 | P0 | Workspace 可选 Environment；UI 明确区分执行位置与项目目录。 |
| WSP-03 | P0 | Workspace 有明确 CWD；默认取主 Root，用户可在获准 Root 内选择其他 CWD。 |
| WSP-04 | P0 | 每个 Root 在授权前不得被 Agent 读取或写入；授权失败、路径不存在或宿主离线时显式报错。 |
| WSP-05 | P0 | 新 Session 使用当前选中的 Workspace；切换当前选择不改变既有 Session。 |
| WSP-06 | P0 | 新增/移除 Root 需展示受影响的 Session 与访问范围；新增 Root 至运行中 Session 必须显式确认并记入执行记录。 |
| WSP-07 | P1 | 用户可创建、重命名、编辑和删除 Workspace；删除被 Session 引用的 Workspace 时应保留 Session 快照或阻止危险删除。 |
| WSP-08 | P1 | 路径和 Environment 以宿主实际路径为准；跨平台显示和路径验证遵循 Local/SSH/Cloud 环境，不把本机路径当作远程路径。 |

### 7.4 输入框上方工作区入口

| ID | 优先级 | 需求 |
|---|---|---|
| UI-01 | P0 | Workspace 目录选择控件位于输入框**上方且在输入框容器之外**，不以内嵌输入框标签替代。 |
| UI-02 | P0 | 控件显示当前执行 Environment 和已选目录；不把 Knowledge Project 当作 Workspace，也不在此处选择 Knowledge Project。 |
| UI-03 | P0 | 新建 Work Session 时可选择或清除工作目录；Project 管理留在项目视图/项目上下文区域。未选目录仍可进行不需要本机文件访问的对话。 |
| UI-04 | P0 | 点击 Workspace 选择器可查看主目录、附加目录、Environment 和 CWD；未经确认不得更改目录授权。 |
| UI-05 | P1 | 窄屏下入口可折叠，但关键信息仍可查看；键盘可访问且具备明确焦点状态。 |
| UI-06 | P1 | 运行中 Session 的 Workspace 状态显示为该 Session 的绑定快照，而不是全局当前选项。 |
| UI-07 | P0 | 目录选择弹窗支持按名称/路径搜索、标记当前选择，并提供“不使用工作区”；最近目录来自已有 Session 的目录记录。采用输入框命令菜单式紧凑浮层，不使用全屏遮罩弹窗。 |

### 7.5 权限、执行与可观察性

| ID | 优先级 | 需求 |
|---|---|---|
| SEC-01 | P0 | 所有文件操作均以 Session 授权的 Root 清单和 CWD 进行服务端/宿主端校验；只做 UI 隐藏不构成访问控制。 |
| SEC-02 | P0 | 文件写入和命令执行遵循现有审批/权限策略；不得新增无范围限制的 shell RPC 或权限绕过。 |
| SEC-03 | P0 | Workspace/Environment 失联、授权失效和操作越界必须显式失败并通知用户，不得伪装成成功或静默降级。 |
| SEC-04 | P0 | Session 可查看当前目录范围、权限模式、Worktree 状态及最近的授权变更。 |
| RUN-01 | P0 | 复用 Gateway 既有 Run 状态机、Worker、审批、恢复接口和可恢复事件流，不另建重复执行生命周期。 |
| RUN-02 | P1 | Diff、测试输出、审批、执行步骤和产物与对应 Run/Session 关联，可在恢复会话后继续查看。 |

### 7.6 Git Worktree

| ID | 优先级 | 需求 |
|---|---|---|
| WT-01 | P1 | Git Workspace 可在新 Session 启动前选择启用 Worktree；默认关闭。 |
| WT-02 | P1 | 启用时显示 Worktree 路径/分支及其隔离范围；不能把主目录中的未隔离改动显示为隔离结果。 |
| WT-03 | P1 | 有未提交变更时归档或删除 Worktree 前必须提示保留/丢弃后果；不得自动丢弃用户工作。 |
| WT-04 | P1 | 多 Root Workspace 中只有部分目录受 Worktree 管理时，显示明确警告并要求用户选择已支持的策略。 |

## 8. 权限与安全原则

1. **最小授权**：仅访问用户为该 Session 明确选择的 Root；Project 关联、附件或连接器不会隐式扩大本机目录权限。
2. **执行范围绑定 Session**：后端/Agent Host 每次操作都验证用户、Session、Environment、Root 和权限模式。
3. **权限与隔离是不同概念**：审批模式控制动作是否需确认；Root 限定可触达目录；Worktree 隔离 Git 工作副本。任何一个都不能替代另外两个。
4. **授权变更可见**：添加、移除 Root、修改权限和切换 Worktree 都应记录操作人、时间和影响范围。
5. **敏感值不进入 Project 说明或普通路径元数据**：凭据应由安全凭据机制管理，不保存进可分享的 Project 文本。
6. **Web 与 Desktop 能力如实呈现**：Web 仅能使用其已连接的远程/代理执行环境；不得声称可访问 Web 用户电脑的任意本机目录。
7. **本机路径的持久化需明确告知**：用户选择目录后，目录路径会随 Session 元数据发送并保存到 Gateway；UI 必须在提交前说明这一点，并遵循 Session 删除及数据保留策略。

### 8.1 附加 Root 默认权限（待确认）

推荐方案：附加 Root 默认只读；用户可对每个 Root 显式授予写权限。命令执行仍遵循 Session 权限模式。若首期不支持逐 Root 权限，则应明确说明所有已授权 Root 共享 Session 写入权限，并在添加时要求确认，不得暗示附加目录为只读。

## 9. 数据与状态建议

以下为逻辑字段建议，不要求本期直接照此落库；最终以现有 contracts 和存储模式为准。

```text
Project
  id, ownerId, space, name, description, instructions, memoryRef,
  repositoryRefs[], createdAt, updatedAt

Workspace
  id, ownerId, name, environmentRef, revision, createdAt, updatedAt

WorkspaceRoot
  id, workspaceId, kind(primary | additional), uri, displayName,
  access(read | write), createdAt

Session
  id, ownerId, space, projectId?,
  workspaceId?, workspaceRevision?, workspaceSnapshot?,
  status, title, createdAt, updatedAt

Run
  id, sessionId, status, events, approvals, artifacts, timestamps...
```

### 9.1 生命周期约束

- Session 首次启动本机/远程文件操作时，必须具备有效 Workspace snapshot；纯聊天 Session 可无 Workspace。
- Workspace 修改产生新 revision；新 Session 默认使用新版本，既有 Session 仍使用已绑定版本。
- 快照至少包含 Environment 标识、Roots、CWD、权限策略和隔离配置；不应把访问令牌等秘密复制进快照。
- Project 删除或解除关联不能自动删除 Session、Run、Diff 或用户工作树。
- Workspace 删除不能导致已完成 Session 的审计信息消失；运行中 Session 需先停止/解除或使用可验证的快照继续。

## 10. 错误与边界场景

| 场景 | 期望行为 |
|---|---|
| 未选择 Workspace，但任务要求读取本机文件 | 询问用户选择/创建 Workspace；不猜测全局默认目录 |
| 目录被移动、删除或权限撤销 | 明确显示失效 Root；阻止访问，并提供重新选择入口 |
| Local/SSH Environment 离线 | 保留 Session 和 Run 历史；提示重连或切换到新 Session，不静默换 Environment |
| 附加目录与主目录在不同 Git 仓库 | 分别显示 Root 和仓库状态；Worktree 只作用于明确支持的仓库 |
| Session 运行中改选全局 Workspace | 只影响后续 Session；当前 Session 显示已绑定 Workspace |
| 用户添加运行中目录 | 展示路径、权限与影响；确认后更新 Session snapshot 并记录事件 |
| 用户取消目录选择 | 不改变当前 Workspace，也不创建空路径授权 |
| Web 端无法访问本机目录 | 显示可用的远程/已连接环境选项；不要返回成功形状的空结果 |
| Worktree 有未提交变更 | 保留工作并要求用户明确选择；不得自动清理 |

## 11. 分阶段交付建议

本节阶段表示工程实施顺序，不代表以受限能力发布产品。成熟版 Desktop Work Workspace 在发布前必须满足 Phase 1–3 的验收要求；不以单 Root、只读访问或缺少隔离的版本作为最终交付。

### Phase 0：产品与执行边界确认

- 确认本文件第 12 节的行为决策。
- 明确 Web 与 Desktop 的 Environment 能力差异。
- 定义 Desktop 到 Agent Host 的认证、Session 绑定、目录授权、命令审批及断线恢复契约。

**退出条件**：权限边界和目录范围已被确认；“UI 能选择目录”不再被当作“执行能力已具备”。

### Phase 1：Work/Life Session 信息架构与 Workspace 引用

- 保留 Work/Life 双 Space；Code 在 Work 内。
- Project 与 Workspace 解耦；Session 可选绑定二者。
- 新建 Session 时选择上下文；已有 Session 绑定不随全局选择变化。
- 输入框上方展示清晰的 Space / Project / Workspace 上下文。
- Workspace 数据模型从一开始支持主 Root、多个附加 Root、CWD 和逐 Root 权限；未完成宿主侧授权前不得开放对应入口。

**退出条件**：刷新、切换、并行创建、恢复 Session 后，归属和 Workspace 绑定均正确；越权路径被拒绝。

### Phase 2：Desktop Local Workspace Host

- 通过经过认证的 Desktop/CLI Agent Host 执行文件操作。
- 复用 Gateway Run 控制面；实现权限审批和可恢复事件流。
- 补齐路径校验、宿主离线和授权撤销处理。

**退出条件**：合同测试覆盖用户/Session 隔离、路径越界、审批、断线重连和 Run 恢复。

### Phase 3：多 Root 与可选 Worktree

- 支持 Workspace 主 Root + 附加 Root。
- 明确每个 Root 的权限策略和 CWD 规则。
- 在隔离范围可验证时启用 Session Worktree；支持状态检查和安全保留/清理。

**退出条件**：多仓库和部分隔离场景的 UI、权限和变更归属可被明确解释并测试。

### 11.1 已确认的目标架构与交付范围

- 首发执行环境为 Desktop 本机 macOS、Windows、Linux；远程/SSH Host 预留扩展，不冒充已支持能力。
- Gateway 保留 Run/Agent 调度、审批、幂等和持久化；Desktop Host 作为本机受限执行节点，复用现有 Device RPC 基础设施和 CLI 工具实现，不再造一套 Run 生命周期。
- Desktop Host 必须由应用管理连接和生命周期；设备连接需区分具体 Host，不能只按用户 `workId` 路由。
- 成熟版范围包含多 Root、CWD、逐 Root 权限、读写工具、受控进程执行、审批、撤权、取消、断线恢复、审计和可选 Worktree。
- 路径检查、审批和 Git Worktree 各自解决不同问题；进程执行还必须有各平台实际生效的 OS 级隔离，不以字符串过滤或 UI 限制代替沙箱。
- Life 不隐式继承 Work Root 或本机访问权限。

### Phase 4：Life 个性化 Workspace（另行决策）

- 依据用户对 Life 项目、个人文件夹、记忆和隐私的决策制定独立范围。
- 默认不开启 Work 内容自动继承或隐式本机目录访问。

## 12. 待确认决策

| # | 决策点 | 推荐方案 | 影响 |
|---|---|---|---|
| D1 | Life 是否提供可持久化 Workspace/本机目录？ | 首期不提供固定目录；只支持显式附件，后续独立评估 | Life 隐私、数据持久化和 UI 复杂度 |
| D2 | 附加 Root 默认读写权限？ | 默认只读，写入需逐 Root 显式授权 | 需要权限模型和宿主端实施 |
| D3 | 多 Root 下的 Worktree 策略？ | 首期只对单一主 Git Root 启用；其他 Root 显示未隔离 | 避免错误宣称整个 Session 被隔离 |
| D4 | Workspace 在产品上是可复用配置，还是每个 Session 一次性选择？ | 两者兼容：Session 可从可复用 Workspace 创建，并保存绑定快照 | 影响数据模型、创建流程和历史恢复 |
| D5 | Workspace 切换对现有 Session 是否生效？ | 仅影响新 Session；现有 Session 显式添加/移除 Root 才更新 | 保证任务执行范围稳定 |
| D6 | Work 是否允许无 Workspace 的普通聊天？ | 允许；需要文件/本机操作时再要求选择 Workspace | 兼顾规划问答与 Agent 执行 |

## 13. 验收标准

### 产品行为

- 用户端只看到 Work 和 Life；Code 归属 Work。
- Work 和 Life 都可创建和恢复 Session；切换 Space 不会篡改历史 Session 归属。
- 用户可在 Work 中创建不绑定目录的规划对话；需要本机访问时系统要求明确选择 Workspace。
- Session 显示的 Workspace 与创建/启动时绑定内容一致；改变全局当前选择不改变既有会话。
- 运行中新增目录需要确认，并记录到 Session；取消操作不会扩大授权范围。

### 安全与可靠性

- 未授权路径、授权外路径和失效路径上的文件操作均被宿主/后端拒绝。
- Workspace/Environment 失联时显示具体错误；Session 历史和 Run 状态不丢失。
- 无任何无范围限制的 shell 或权限绕过入口。
- Worktree 状态准确；未提交变更不会被静默删除。

### UI 与可访问性

- Workspace 选择入口位于 composer 上方、输入框外。
- 当前 Space、Project、Workspace、CWD 和 Worktree 状态不会互相混淆。
- 目录选择和权限状态有清晰的加载、空状态、错误及取消行为。
- 主要选择器可通过键盘操作，并具备可读标签和焦点状态。

## 14. Anthropic 产品参考与 Ocean 的差异化

根据 Anthropic 当前公开资料，Claude Code Desktop 以 Session 为独立对话和执行单元，在输入框下方选择 Environment、Project folder、权限模式和模型；Local/SSH 保存环境可包含多个 folders，运行中也可添加目录；Git Worktree 为可选项且默认关闭。Claude Code Projects 是另一个跨 Session 的任务协调层；Cowork Projects 则用于组织更广泛的持续性工作。上述是产品行为参考，不代表 Ocean 必须复制其交互或权限实现。

- [Claude Code Desktop 文档](https://code.claude.com/docs/en/desktop)
- [Claude Code Desktop 快速开始](https://code.claude.com/docs/en/desktop-quickstart)
- [Claude Code Projects](https://code.claude.com/docs/en/claude-projects)
- [Claude Code Worktrees](https://code.claude.com/docs/en/worktrees)
- [Claude Cowork Projects](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork)
- [Claude Code Desktop 重设计说明](https://claude.com/resources/articles/claude-code-desktop-redesign)

## 15. 当前 Ocean 实现边界

- 已有 Work/Life UI 方向：顶层只有 Work 和 Life，Code 作为 Work 能力；共享 Work/Code 投影仍需按当前分支实现核验。
- Desktop Work 的 composer 上方现只提供目录选择；Knowledge Project 不再出现在工作区选择栏中，仍由其独立项目区域管理。
- 目录弹窗以输入框命令菜单式紧凑浮层呈现，列出当前 Desktop Host 上的可复用 Workspace，支持搜索、当前项勾选、“不使用工作区”和重新浏览选择目录。
- Desktop 浏览新目录时会创建可复用 Workspace 配置；新 Session 提交版本化 snapshot，旧 Session 仍按其原绑定显示。UI 当前仅创建一个主 Root，附加 Root 的配置界面尚未接入。
- Shared contracts 已定义 Workspace 配置和版本化 Session snapshot，并约束多 Root、平台绝对路径、Root 权限、CWD 和 Worktree 关联；Gateway 有可复用 Workspace 的创建/列表/更新/归档 API，更新使用乐观修订号。
- 创建 Session 时 Gateway 会验证 Workspace 归属当前用户、处于 active 状态且修订号/配置与 snapshot 完全一致；修改 Workspace 不会改写已有 Session 的 snapshot，同时保留 `workspacePath` 兼容旧客户端。
- Gateway 已有持久 Run 生命周期、Worker、审批和可恢复事件流，并已有通过 Device RPC 调用 CLI 的本地文件/Notebook 读写工具。
- Gateway 已增加 Workspace Host 注册/撤销接口：注册时生成一次性 `ocean_wh_` 凭证，仅保存 SHA-256 摘要；WebSocket 使用 Host ID + 凭证认证。
- Device RPC 已从 `workId` 路由改为 Session snapshot 中的 Host ID；Gateway 在排队和派发时校验快照，要求 Host 凭证仍有效，并只派发到对应 Host 的已认证 Socket。
- CLI 通过 `OCEAN_HOST_ID` / `OCEAN_HOST_CREDENTIAL` 环境变量进行 Host 认证；Device 文件/Notebook 工具按 Session snapshot 验证 Host、平台、CWD、Root 范围和只读权限，并继续执行 Host 本地 PermissionPolicy。未配置 Host 凭证的旧 CLI 不会执行这些 Device RPC。
- Desktop 按 Gateway 和登录账号隔离 Host ID，通过 Electron `safeStorage` 保存凭证，并监督本机 Utility Process 的连接、重连和退出。
- Desktop Renderer 的 HTTP API 代理目标使用 `VITE_API_BASE_URL`；Host 的 Socket.IO 连接使用 `OCEAN_WORKSPACE_HOST_GATEWAY_URL`，默认 `http://localhost:3000`。Host 必须连接可从宿主机直达的 Gateway 地址，不能指向只代理 HTTP 的 Web 端口。
- 其他尚未改造的 CLI RPC 和 shell/进程执行仍不能宣称受 Session Workspace snapshot 限制；OS 级进程沙箱和 Worktree 生命周期尚未实现。
- Device RPC 对 snapshot 的执行时校验、多 Root 管理 UI 和各平台 OS 级隔离仍未实现。
- 现有路径规范化与权限策略不等价于 OS 级进程沙箱；macOS、Windows、Linux 的执行隔离、Host 撤权和恢复仍须实现并验证。
- 多 Root Worktree、环境状态和授权变更审计尚未实现；不得将当前目录选择 UI 描述为完整本机执行能力。
