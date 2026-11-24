# Ocean Code Core v2 独立审计 · 阶段证据

审计基线为 `main@9c48d67daa713c9bea3a32bf734f8fb13f9f4ad0`。初始工作区干净。本地 origin/main 与 HEAD 相同。git ls-remote 受 DNS 限制，GitHub Compare API 独立确认远端 main 与基线 identical。

当前确认至少两条生产执行路径。CLI 本地采用 Core inline 引擎，Gateway 采用 Worker 调度与 Core durable 生命周期组合。两条路径共享部分状态和决策语义，Gateway 模型调用前的统一决策门禁存在已确认缺口 CV2-001。全仓运行时数量仍需完成其他入口追踪后定案。

Git Tree 已登记 2,906 个条目并提取候选 TS/JS 模块引用，目前仍是初始盘点。逐文件人工审查、架构历史裁决、重复实现归因与账本比对均未达到完成条件。审计状态见 audit-state.json。

已确认第三条可达路径为 CLI legacy loop。Ink、Readline 和单次查询仍能在对应条件下进入旧循环（CV2-002）。因此目前证据下界是三条执行控制路径，其中 CLI inline 和 Gateway durable 共享 Core 部分语义。全仓独立 Runtime 数量仍待定案。

续审已确认第四条配置可达的执行控制路径。Gateway 交互 Chat 在 `CHAT_USE_RUN=false` 时交给 SkillOrchestrator 的 SDK 模型和工具循环（CV2-003）。仓库中可确认的是四条控制路径，两个默认路径、两个兼容路径。生产实例配置和其余入口待核实。另确认发布规格的 Worker 差异、Prisma 镜像启动与验收路径差异，以及 Skills 文件解析的两个实现（CV2-004 至 CV2-006）。

第三批重点为 Gateway R04。生产未知结果协调器没有 provider adapter，启动恢复绕过正常租约门槛，工具 ownership 冲突可被当作成功确认，审批事件的 payload 序号与数据库游标不一致（CV2-007 至 CV2-010）。结果与下游 Outbox 在正常成功路径共享事务；当前证据下 R04 为 Partial。

第四批确认 R02 的 CLI 会话重开会创建新 Run，普通入口未使用同一 Run 的 Core resume。R03 的 token 与压缩接受标准已共享，预算触发、摘要和缓存生命周期仍由 Host 各自推进。新增 CV2-011 至 CV2-013。CLI 定向测试 89 项通过，测试边界见 06-TEST-EVIDENCE.md。

第五批确认 CLI 工具取消信号没有贯穿 adapter，默认 CLI Core 没接入内建委派，Gateway 父委派仍由 Host 持久流程控制，且本地 Core 审批映射丢失替换输入与 interrupt 语义（CV2-014 至 CV2-016）。

第六批确认默认 Gateway Run 将所选 Skill 投影为名称，未装配旧直驱所提供的正文激活；CLI 与 Gateway 的 MCP 配置合并和变量解析规则分叉；默认 CI 跳过三项真实 CLI 到 Gateway 的用例（CV2-017 至 CV2-019）。

第七批通过真实编译实现与受控夹具复现审批 SSE 游标倒退、终态漏发，以及实际 SIGKILL 引发 CLI Runtime 孤儿锁。确认 Gateway inline 工厂仅测试可达。新增 CV2-020 至 CV2-022，CV2-010 补充动态证据。

第八批用真实隔离 PostgreSQL 验证活租约被启动恢复清除、工具争用消息提前确认和 SSE 终态漏发。另发现心跳续租双计租时（CV2-023），以及 Worker 入口重复调用 Nest 生命周期（CV2-024）。

第九批实际运行 CLI 子进程复现 CV2-011，同 Session 的 --resume 创建新 Run，旧 Run 保留 calling_model。额外确认 70 KiB CLI journal 恢复语义分叉和默认 Core 首轮未注入持久计划（CV2-025、CV2-026）。

第十批在隔离 PostgreSQL 确认产品级 retry 能返回 queued，但已有 Core failed 快照阻止再调用模型；终态 Run 的陈旧模型消息仍会被延迟重投（CV2-027 至 CV2-028）。

第十一批在真实隔离 PostgreSQL 中验证 Gateway 取消后 Host 与 Core 状态分叉，以及过期 pending 审批未由维护服务推进。补记同一 Run 创建重复递增指标（CV2-029 至 CV2-031）。

第十二批完成主 Core reducer、执行器、工具端口和 Gateway RunRunner 静态复核。使用编译源码复现未知事件/结果可推动完成，以及跨 Run 恢复把完整双工具批次降级为文本（CV2-032、CV2-033）。

第十三批用真实 HTTP 和 PostgreSQL 验证交互 Chat 停止未传入 Run 取消、无效父节点仍可保存并截断历史。另识别旧模型目录方法无生产引用（CV2-034 至 CV2-036）。

第十四批以隔离 PostgreSQL 验证历史幂等回填及兼容查询分叉，并确认质量门与 Compose 部署镜像之间缺少不可变身份传递（CV2-037、CV2-038）。HEAD 已移动至 f7e6435，新增提交只改 Web 首页、布局和样式。审计仍固定原始基线 9c48d67。当前 HEAD 的这三个 Web 文件变化不纳入已锁定基线的审查覆盖。

第十五批完成余下 Gateway Prisma 迁移文件、Compose 配置和 Prisma DI 复核。用真实 CLI 证实默认 db push 跳过存量数据回填，渲染证实生产 Compose 缺少 Worker。常规 Compose 的 Worker 启动不等待 schema 就绪，见 CV2-039。

第十六批完成 Workspace 与设备 RPC 的生产装配核对。通过隔离 PG 复现设备操作已发出后停留 dispatched，重启和取消均未收尾（CV2-040）。CLI 与 Desktop 复用 Workspace Host 连接与本地工具适配，设备进程没有另起模型循环。

第十七批复核 Desktop 主进程、preload、Workspace Host 构建和类型装配，发现原生项目目录写入未复用 sender 和目录边界（CV2-041）。

## V2 架构设计输入

以锁定基线 9c48d67 为现状证据，沿用 One Agent Core、Multiple Hosts、Persistent Sessions。当前审计可用于约束设计方向。全量签收和旧路径删除仍需补齐生产入口和迁移证据。

| 设计决策 | 已有事实 | 设计约束与待验证项 |
|---|---|---|
| 执行控制权归属 | 默认 CLI inline 与 Gateway durable 已共享部分 Core 语义，仍有两个配置可达的兼容循环。Gateway 的模型前推进、审批、委派和取消还有 Host 决策 | 复用 Core 已有决策、重放与防重放机制，明确每项状态迁移的权威归属。用两端真实入口验收后再决定兼容路径退出条件。CV2-001、002、003、015、016、029 |
| Session 与 Run 身份 | CLI 重开 Session 会创建新 Run，Gateway 可返回已排队但被 Core failed 阻挡的重试 | 分别定义重开会话、恢复同一 Run 与创建新尝试。每个结果应能从持久状态解释。补验工具中断及待审批的真实入口。CV2-011、020、027 |
| Durable 一致性 | 成功工具结果与下游 Outbox 可同事务写入。取消、未知结果与接管仍存在多处状态分叉 | 为 Runtime、RunStep、Outbox 和外部回执分别指定写入规则及恢复依据。未知副作用保留 unknown，凭可验证回执推进。保留 fencing、CAS 和稳定调用身份。CV2-007、008、009、023、029、032、037、040 |
| Context 与扩展点 | 已共享部分 tokenizer、压缩验证和 MCP 分页。压缩生命周期、Skill 激活和配置合并仍有分叉 | 共享可以跨端表达的策略、状态及验收语料，保留各 Host 的存储和信任边界。核查工具配对、缓存失效、技能权限和扩展调用恢复。CV2-006、013、017、018、026、033 |
| 发布及验收 | 三项远程 CLI 用例在显式启用后通过。独立生产 Compose 缺少 Worker，db push 跳过历史回填 | 用不可变发布身份关联迁移、Worker、Gateway 和客户端，覆盖空库与旧库。另验本地 CLI 和 Gateway 的共同场景，记录默认 CI 的跳过项。CV2-004、005、019、038、039 |

线上启用配置、外部结果查询能力以及全仓是否还有其他模型调度入口仍需核查。以上表格可作为设计评审议题，不能直接用来签收迁移完成或批准删代码。
