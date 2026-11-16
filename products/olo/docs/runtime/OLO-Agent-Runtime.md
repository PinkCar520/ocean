# OLO Agent Runtime

状态：**Living spec / 候选机制，未定稿，未实现声明**  
日期：2026-09-09  
母版：[PRD v1.1](../product/OLO_Product_PRD_v1.1.md)  
依赖：[Context v0.2](../context/OLO-Context-Model-v0.2.md) · [SR-003](../scenarios/SR-003-Leaving-Cybercab.md)

## 已确认的产品边界

Runtime 支持持续目标、恰当介入、授权行动、结果验证与纠正。保持安静是有效决策；推断不扩大权限；受理不等于完成；失败不能显示为成功。跨身体保持一个 OLO 的连续性，不能创建相互矛盾的独立行动。

## 待验证的执行模型

Observe → Infer → Plan → Prepare → Commit → Act → Observe Result / Verify → Replan / Learn。

这只是候选职责顺序。Prepare 应区分查询 / 草拟和具有资源占用、隐私共享或费用的准备；不能统一认为所有“准备”都无副作用。Commit 表示进入现实影响边界的候选概念，其与供应商提交、Act、可撤销期限的对应尚未定义。

## Action 生命周期候选

源讨论列出 Pending、Executing、Succeeded、Failed、Cancelled、Compensated。它们是待讨论状态集合，**不是依次发生的线性链条**。成功后是否允许补偿、取消请求和取消完成如何区分、部分成功与未知结果如何表达，都需 SR-003 给出反例。

| 问题 | 待定义的契约 |
| --- | --- |
| 请求超时 | 如何查询结果未知的既有动作，避免重复费用 |
| Intent 撤销 | 尚未提交动作停止；已发生副作用如何核对与恢复 |
| 取消 / 补偿 | 能力支持、期限、不可退费用、补偿失败的可见性 |
| 多动作部分失败 | 哪些继续、停止或恢复，何时必须找人 |
| 重新规划 | 保留已执行事实，不把世界恢复为计划起点 |
| 权限变更 | 提交前检查与已执行动作处理、可追溯授权记录 |
| 多身体接力 | 身份、私密 Context、重复通知与断连恢复 |

## InterventionPlan 候选

SR-001 提出渐进式环境 → Ambient → 简短语音的介入计划；感知目标已完成即停止。InterventionPlan 是否独立成核心对象尚未批准。Intervention 的优先级、超时、升级与取消不能直接由 UI 动画驱动。

## 审计与验证要求

重要行动需关联 Intent、Plan、Context / evidence、Reason、Confidence、Risk、Permission、Capability、Result 和时间。关键不行动决定也应可解释，避免保存不必要的细粒度监视记录。Action requested / accepted / completed / verified 必须可区分；日志保留和用户展示细节待定。

## 下一步

执行 SR-003 测试矩阵，提出状态转移表、权限契约和恢复策略，分别标注通过 / 失败 / 未知。尚未选择执行引擎、数据库、消息队列、SDK、部署拓扑或任何生产阈值。


## SR-003 Desktop Test 01 补充 · 2026-09-09

状态：以下为 [桌面推演](../scenarios/SR-003-Desktop-Stress-Test-01.md)导出的候选执行契约；取代“尚未推演”的进度描述，不表示已有实现。已有章节保留供比较。

### 动作、恢复与结果认知分开

一个动作的结果可暂时 Unknown；这是 OLO 对外部结果的认知，不表示提供方没有动作。requestRide 的成功、Journey 的进行状态与 Intent 的达成分别记录。

| 当前情况 | 事件 | 候选处理 |
| --- | --- | --- |
| Prepared | 当前提案获有效授权、证据仍有效 | 固定逻辑请求身份并提交，记录本次尝试 |
| Prepared | Intent / Permission 撤销或报价变更 | 不提交，重新规划 / 询问 |
| Submitted | 受理回执 | 绑定 providerRef，核对动作定义所需的结果证据 |
| Submitted | 超时 / 断连 | Outcome Unknown，核对同一请求，不能自动视作失败 |
| Outcome Unknown | 查得已受理 / 明确拒绝 | 更新已知事实；明确未建行程后才考虑替代 |
| Any submitted action | 目标或权限撤销 | 停止未提交的正向步骤；核对已有副作用，创建必要恢复提案 |
| Existing action | 需要取消或补偿 | 创建独立关联动作；原动作与费用历史保留 |
| Cancellation submitted | 未收到明确结果 | 保留 cancellation outcome unknown，不显示已取消 |

本表不是最终枚举或完整状态机。尤其 Succeeded 后仍可有恢复任务；单一终态 Compensated 不能表达未退费用、部分恢复和恢复失败。

### 提交与恢复边界

Prepare 逐能力声明副作用：纯本地整理、权限内查询、占用资源、收费预订不可混同。提交检查绑定 Intent / Plan revision、授权 revision、报价及参数；该检查与外部接受不具备天然原子性。撤销后的晚到受理必须进入核对 / 恢复。

重试须核对 provider 的幂等作用域及期限，重用同一逻辑请求标识。没有幂等或查询能力时，不宣称自动重试安全；结果未知时停止自动建立替代。重复和乱序回执按提供方事件身份、序列或重新查询处理，不能简单“最后收到的就是最新”。

家庭恢复按动作归属、当前状态与后续操作者修改判断，不能全量回滚房屋快照。恢复也需自身授权；撤销通勤权不自动授予收费取消权。

### 待验证

为 T06、T09 建立可控提供方的重复 / 乱序 / 超时 / 提交后撤销 / 崩溃重启测试；再确定持久化时点、串行化范围、恢复队列与介入升级。此轮没有执行这些软件测试。

## iOS prototype implementation note · 2026-09-11

当前 iOS `ControlledAgentRuntime` 是受控执行运行时，不等同于大模型本身。模型适配器只负责把非可信自然语言输出收敛为候选领域意图；Runtime 与专用场景控制器负责状态、Trust Policy、Tool allowlist、Apple 权限、幂等身份、取消、真实副作用、读回验证和持久化 Receipt。模型不可直接调用 EventKit / AlarmKit，也不可自行授予权限或宣称 Verified。

Reminder 由 `ControlledAgentRuntime` 直接编排；Wake 仍由 SR-001 专用规划器拥有 Calendar → plan → AlarmKit 会话，但其闹钟写入已接入同一 `submitted → accepted → completed → verified / outcome_unknown / rejected` 执行协议。两者共享设备本地 Receipt ledger 与 PostgreSQL Control Plane 的 best-effort outbox。网络与 Control Plane 不可用不能阻止或反向否定已经由 Apple provider 读回验证的本地结果。

这只是当前可执行原型的实现事实，不冻结未来编排引擎、模型供应商或产品级完整状态机。
