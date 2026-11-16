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
