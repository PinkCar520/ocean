# Ocean 能力迁移研发任务

以 `restored-src/src` 对应的 Claude Code 2.1.88 为只读参考。能力通过 Ocean 的命令、界面和运行时交付。权限行为冲突时按参考版本调整。各任务的已知缺口和已有证据见 [迁移账本](manifest.json)。参考源码模块、命令和工具的盘点入口见 [参考清单](reference-inventory.json)。

| 任务 | 交付范围 | 验收条件 |
|---|---|---|
| 01 权限配置读取（基础实现已验证） | 权限规则与默认模式读取，覆盖嵌套配置与现有 Ocean 配置 | CLI/Gateway 配置读取和决策测试 |
| 02 权限决策与托管设置（进行中） | 设置来源及合并、规则匹配顺序、权限模式、工具级规则、会话授权、审批、非交互权限、托管设置加载 | 对照参考版本的权限决策矩阵，从 CLI 和 Gateway 验证 |
| 03 非交互与程序化入口（进行中） | 完善 `ocean -p` 的结构化输出、流式事件、退出、会话继续和取消，补 Ocean SDK 入口 | CLI 子进程和 SDK 消费端测试，覆盖成功、失败和中断 |
| 04 Agent 执行与工具（进行中） | 模型循环、流式调用、计划、文件、Shell、搜索、Git、Notebook、PowerShell、LSP、Web 和计算机操作 | 按工具验证参数、权限、实际副作用、取消和错误 |
| 05 会话与恢复（进行中） | 会话历史、检查点、持久化、重试、工具幂等、未知结果对账、上下文压缩与计量、记忆 | 运行中断和并发修改测试，重启恢复和回退测试 |
| 06 扩展能力（进行中） | MCP、OAuth、Skills、插件、Hooks 生命周期 | 安装、发现、升级、卸载、权限、故障和凭据隔离测试 |
| 07 长任务与远程（进行中） | 子代理、团队、后台任务、远程会话和设备桥接 | 权限继承、取消传播、重连、恢复和状态一致性测试 |
| 08 产品交互（进行中） | CLI 交互命令与快捷键、历史、Diff、计划、任务、权限确认；相关 Web/Desktop 入口和语音 | 按端验证正常、拒绝、取消、重连等工作流 |
| 09 独立交付验收 | 补齐逐项清单、真实 Provider 验收和无参考源码构建运行验收 | 每项关联参考证据、Ocean 入口与可复现验收；隔离构建输入后从源码构建并运行 |

各批可独立交付。只有实际入口通过对应行为和故障场景验收后，才将条目标为完成。涉及参考源码缺失、构建开关或外部服务的条目，记录证据缺口。


## 托管设置部署入口

CLI 和 Gateway 的启动环境可设置 `OCEAN_MANAGED_SETTINGS_PATH` 指向部署方维护的绝对文件路径。CLI 不采用工作区 `.env` 中的同名值。托管文件可配置 `permissions.defaultMode` 和权限规则。设置 `allowManagedPermissionRulesOnly: true` 后，权限规则仅从托管文件读取，执行路径不复用会话授权。单次审批仍可处理需要用户确认的调用。此批接通文件来源，未配置路径时采用系统 Ocean 托管目录，先读基础文件，再按文件名字母序合并 `managed-settings.d/*.json`。远程托管设置、OS 配置管理服务和跨端界面交互仍归任务 02。


## 非交互权限

本地 `ocean -p` 继续执行已获准的工具，并通过现有工具结果反馈无法获得确认的调用。`ocean -p --gateway` 将非交互模式写入 Run，不提供询问工具；需要新人工审批时拒绝该调用，将结果交给模型继续处理。两端已接入 `PermissionRequest` Hook 的显式允许和拒绝。两端支持通过 Hook 替换本次工具输入，替换后重新校验参数和权限。Hook 拒绝并要求中断时，CLI 取消当前轮次，Gateway 取消 Run。CLI 支持把权限规则的添加、替换、移除和默认模式修改写入用户、项目或项目本地设置。会话内规则更新、附加目录和 Gateway 按用户持久化权限更新仍待实现。


## 非交互与程序化入口

`ocean -p` 支持 `--output-format text|json|stream-json`。本地执行默认保存会话，结构化结果包含会话 ID。用 `--continue` 恢复当前工作区最近会话，或用 `--resume <session-id>` 恢复指定会话。`--no-session-persistence` 可关闭会话保存。`@ocean/cli/sdk` 提供 Gateway 非交互执行入口 `runOceanPrompt`，支持文本分块和取消信号。Gateway 执行也支持指定会话恢复，`--continue` 选择当前用户在默认 Space 最近的 CLI 会话。流式 JSON 已包含会话、文本增量、工具调用与工具结果。`stream-json` 输入接通 `initialize`、`interrupt`、`set_model` 和本地 `set_permission_mode`，控制请求在模型执行期间仍可读取，用户消息串行执行。本地可通过 `--permission-prompt-tool stdio` 让 SDK 宿主双向处理 `can_use_tool` 授权，支持允许、拒绝、输入替换、超时和撤销。Gateway 同一入口通过 Run 审批支持绑定原始输入的单次授权、替换参数和拒绝。替换参数写入审批检查点，在 Worker 执行前重新校验。拒绝会把工具错误交回模型，请求中断时取消 Run。本地流式会话复用 MCP 连接，并支持 `mcp_status`、`mcp_reconnect` 和 `mcp_toggle`，连接变更在两个模型轮次之间生效。Gateway MCP 控制、动态 SDK MCP 服务、按用户持久化权限更新和其他控制消息仍待实现。

`ocean -p --gateway --tools <names>` 与 SDK 的 `toolNames` 可按 Ocean 工具名限制单个 Run 的工具集。CLI 接受逗号或空白分隔的名单，`--tools default` 使用默认工具集，`--tools ""` 关闭工具。Worker 在每一轮模型请求和实际执行时校验清单，子 Run 继承该限制。入选工具仍需通过现有权限和审批。


## LSP 和 MCP 资源

CLI 新增 `lsp` 工具，通过标准 LSP stdio 请求查定义、引用、悬浮信息、文档和工作区符号、实现及调用层级。语言服务器由用户在 `~/.ocean/lsp.json` 配置，比如 `[{ "command": "/absolute/path/to/server", "args": ["--stdio"], "languages": { ".ts": "typescript" } }]`。工具接入现有权限和工作区边界，本批使用按调用启动的服务器进程。Gateway 通过已有的工作区设备通道调用本地 LSP。长连接和诊断订阅仍待实现。[LSP 规范](https://microsoft.github.io/language-server-protocol/)

CLI 对声明资源能力且已连接的 MCP 服务提供资源列表与读取工具，支持分页、工具权限、取消和响应大小限制。Gateway 模型工具通过按用户隔离的 MCP 连接执行资源请求。


## 后台任务、调度与子代理

`ocean tasks start/list/status/output/cancel/retry` 复用 Gateway Run 和 Worker。`output --follow --after <sequence>` 支持断线后从已接收事件继续。Gateway 的模型可发起持久化委派，子 Run 完成后返回工具结果。团队包含父 Run 与同层子 Run，`ocean tasks team` 查询成员，`ocean tasks message` 持久化消息。消息在接收方下一次模型调用中进入上下文。

`ocean tasks schedule create/list/cancel` 支持五字段 UTC Cron 和单次任务。Worker 对到期记录加行锁，在同一事务内创建 Run、写入队列并推进调度。同一计划的错过触发合并为一次补跑。部署需要应用 `20261121000001_run_schedules` 迁移。

## 本地插件、上下文、Web 和语音

- 本地插件通过 `ocean plugins install/list/update/enable/disable/uninstall` 管理。插件声明 `ocean-plugin.json`，可以贡献 Skills、子代理和 Hooks。当前使用本地源目录，远程市场与包下载未接入。
- Ocean 从用户、项目和项目本地的 `OCEAN.md` 读取指令，现有 `.AIGUIDE.md` 仍可读取。项目记忆按本地工作区保存，经工具权限读写，自动提取和跨设备同步仍待实现。
- Web 获取与搜索使用 Ocean 的出口规则。配置搜索服务时使用 `OCEAN_WEB_SEARCH_URL`，请求参数为 `q` 和 `limit`，响应为 `{ results: [{ url, title, snippet }] }`，服务主机需加入出口允许列表。
- 终端通过 `ocean voice transcribe <file>` 转录已有音频。Web/Desktop 的共用录音入口支持取消和完整音频转录，实时转录与终端麦克风捕获仍待实现。


## 远程工作区入口

`ocean remote pair` 配对主机，`ocean remote add-workspace <directory>` 注册主机本地明确授权的根目录，`ocean remote serve` 启动工作区连接。通过 `ocean -p --gateway --remote-workspace <id>` 在 Gateway 会话中绑定远程工作区。文件、Notebook 和 LSP 工具复用现有设备权限与工作区快照校验。远程连接的全部设备矩阵仍待验收。

## 独立构建阶段证据

在临时源码快照中排除整个 `restored-src` 目录，使用已安装的第三方依赖，重新编译 Contracts、Core、CLI 和 Gateway。编译后运行了该快照中的 CLI `--help`，并加载 Gateway HTTP 和 Worker 的编译模块。同一隔离快照中使用 PostgreSQL、HTTP Gateway、Worker 和本机模型协议服务验收非交互链路，包括工具选择及中断正在运行的模型流后继续原会话。独立安装依赖、真实外部 Provider 链路以及 Web/Desktop 打包仍待验收。

## 会话分支

`ocean -p --fork-session --resume <id>` 和 `ocean -p --fork-session --continue` 在新会话中继续执行，本地和 Gateway 均支持。Gateway 在同一事务内复制最新消息分支并重建父子关系。分支不继承工作区设备绑定。隔离 PostgreSQL 已验证接口鉴权、消息分支和原会话保留。CLI 进程已用模拟 Gateway 验证后续提示词和结构化结果均使用新会话 ID。
